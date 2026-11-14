"""Global Trend Atlas: the honest test on a 5-degree grid over the whole world, 1981-2025.

For each grid cell, one NASA POWER monthly point request returns all five scan variables.
Each series is tested the usual way (plain Mann-Kendall) and the honest way (pre-whitened),
then the honest p-values of each variable are corrected for testing ~2000 cells at once
(Benjamini-Hochberg, alpha_FDR = 0.10, Wilks 2016).

    python scripts/build_atlas.py --download   # ~2000 requests, cached in data/raw/atlas (resumable)
    python scripts/build_atlas.py              # analyse the cache -> web/public/data/atlas/*.json
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

# one BLAS thread per process: parallel workers with many threads each ran out of memory
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np  # noqa: E402
import requests

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from trendlab import analyze_series, fdr_bh  # noqa: E402
from trendlab.scan import SCAN_VARS  # noqa: E402

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
RAW = BACKEND / "data" / "raw" / "atlas"
OUT = BACKEND.parent / "web" / "public" / "data" / "atlas"
CELLS = BACKEND.parent / "web" / "public" / "data" / "cells"
STEP = 5.0
LATS = np.arange(-57.5, 80, STEP)   # Antarctica left out: POWER/MERRA-2 is least reliable there
LONS = np.arange(-177.5, 180, STEP)
START, END = 1981, 2025


def cell_path(lat: float, lon: float) -> pathlib.Path:
    return RAW / f"{lat:+.1f}_{lon:+.1f}.json"


def fetch_cell(lat: float, lon: float, tries: int = 5) -> str:
    p = cell_path(lat, lon)
    if p.is_file():
        return "cached"
    for k in range(tries):
        try:
            r = requests.get(POWER_URL, params={
                "parameters": ",".join(SCAN_VARS), "community": "AG", "longitude": lon, "latitude": lat,
                "start": START, "end": END, "format": "JSON"}, timeout=120)
            if r.status_code == 429:
                time.sleep(20 * (k + 1))
                continue
            r.raise_for_status()
            p.write_text(json.dumps(r.json()["properties"]["parameter"]), encoding="utf-8")
            return "ok"
        except requests.RequestException:
            time.sleep(5 * (k + 1))
    return "failed"


def download(workers: int) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    cells = [(float(a), float(o)) for a in LATS for o in LONS]
    done = {"ok": 0, "cached": 0, "failed": 0}
    with ThreadPoolExecutor(workers) as pool:
        for i, status in enumerate(pool.map(lambda c: fetch_cell(*c), cells), 1):
            done[status] += 1
            if i % 50 == 0:
                print(f"{i}/{len(cells)} {done}", flush=True)
    print("download finished", done, flush=True)


def series(raw: dict) -> tuple[list[str], list[float]]:
    dates, vals = [], []
    for key in sorted(raw):
        if key[4:] == "13":  # POWER's annual mean
            continue
        v = raw[key]
        dates.append(f"{key[:4]}-{key[4:]}")
        vals.append(np.nan if v is None or v <= -998 else float(v))
    return dates, vals


def sig(x, digits: int = 4):
    """Round to significant digits (keeps tiny p-values distinguishable, unlike fixed decimals)."""
    if x is None or not np.isfinite(x):
        return None
    return float(f"{x:.{digits}g}")


HALVES = ((1981, 2002), (2003, 2025))  # sensitivity: does the trend hold in each half of the record?


def analyse_cell(cell: tuple[float, float]) -> dict:
    """Every variable of one grid point: both tests, uncertainty, and a split-period check."""
    lat, lon = cell
    raw_all = json.loads(cell_path(lat, lon).read_text(encoding="utf-8"))
    out = {}
    for var in SCAN_VARS:
        raw = raw_all.get(var)
        if not raw:
            continue
        dates, vals = series(raw)
        x = np.asarray(vals)
        # Soil wetness is undefined over ocean (fill values) and pinned at 1 over ice: skip both.
        if np.isfinite(x).sum() < 0.8 * x.size or np.nanstd(x) == 0:
            continue
        a = analyze_series(dates, vals)
        months = np.array([int(d[5:7]) for d in dates])
        clim = [sig(np.nanmean(x[months == m]), 5) for m in range(1, 13)]
        years = np.array([int(d[:4]) for d in dates])
        halves = []
        for y0, y1 in HALVES:
            sel = (years >= y0) & (years <= y1)
            h = analyze_series([d for d, k in zip(dates, sel) if k], x[sel])
            halves.append({"years": [y0, y1], "rate": sig(h["honest"]["slope_per_year"] * 10),
                           "rate_ci": [sig(c * 10) for c in h["honest"]["slope_ci_per_year"]],
                           "p_naive": sig(h["naive"]["p"]), "p_honest": sig(h["honest"]["p"])})
        out[var] = {
            "dates": [dates[0], dates[-1]], "n": int(np.isfinite(x).sum()), "months": len(dates),
            "values": [None if not np.isfinite(v) else round(float(v), 3) for v in x], "clim": clim,
            "rate": a["honest"]["slope_per_year"] * 10,
            "rate_lo": a["honest"]["slope_ci_per_year"][0] * 10, "rate_hi": a["honest"]["slope_ci_per_year"][1] * 10,
            "p_naive": a["naive"]["p"], "z_naive": a["naive"]["z"],
            "p_honest": a["honest"]["p"], "z_honest": a["honest"]["z"],
            "phi": a["noise"]["phi"], "sigma": a["noise"]["sigma_n"],
            "more_years": a["years_more_needed"], "halves": halves,
        }
    return {"lat": lat, "lon": lon, "vars": out}


def analyse(workers: int = 6) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CELLS.mkdir(parents=True, exist_ok=True)
    cells = [(float(a), float(o)) for a in LATS for o in LONS if cell_path(a, o).is_file()]
    with ProcessPoolExecutor(workers) as pool:
        results = list(pool.map(analyse_cell, cells, chunksize=16))
    summary = []
    fdr = {}
    for var, (name, units, up, down) in SCAN_VARS.items():
        rows = [(r["lat"], r["lon"], r["vars"][var]) for r in results if var in r["vars"]]
        mask, thr = fdr_bh(np.array([v["p_honest"] for _, _, v in rows]), 0.10)
        fdr[var] = (dict(zip([(a, o) for a, o, _ in rows], mask)), thr)
        out_cells = []
        for (lat, lon, v), m in zip(rows, mask):
            out_cells.append({
                "lat": lat, "lon": lon, "rate": sig(v["rate"]), "rate_lo": sig(v["rate_lo"]), "rate_hi": sig(v["rate_hi"]),
                "p_naive": sig(v["p_naive"]), "p_honest": sig(v["p_honest"]),
                "naive": bool(v["p_naive"] < 0.05),           # stage 1: usual test, p < 0.05
                "pw": bool(v["p_honest"] < 0.05),             # stage 2: pre-whitened test, p < 0.05
                "honest": bool(m),                             # stage 3: pre-whitened + FDR 10% across all cells
                "phi": sig(v["phi"], 3), "more_years": sig(v["more_years"], 3),
                "coverage": round(v["n"] / v["months"], 3),
            })
        n = len(out_cells)
        out = {"id": var, "name": name, "units": units, "rising": up, "falling": down,
               "step_deg": STEP, "years": [START, END], "n_cells": n, "fdr_threshold": float(thr),
               "alpha": 0.05, "fdr_q": 0.10,
               "naive_fraction": sum(c["naive"] for c in out_cells) / n,
               "pw_fraction": sum(c["pw"] for c in out_cells) / n,
               "honest_fraction": sum(c["honest"] for c in out_cells) / n,
               "sampling": "NASA POWER values at the centre of each 5-degree cell (point samples, not area averages)",
               "source": "NASA POWER monthly point API (MERRA-2), sampled every 5 degrees; usual = Mann-Kendall p < 0.05; "
                         "pre-whitened = Mann-Kendall after lag-1 pre-whitening, p < 0.05; honest = pre-whitened with "
                         "Benjamini-Hochberg FDR 10% across all points of this variable",
               "cells": out_cells}
        (OUT / f"{var}.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        summary.append({k: out[k] for k in ("id", "name", "units", "n_cells", "naive_fraction", "pw_fraction",
                                            "honest_fraction", "fdr_threshold")})
        print(f"{var}: {n} points, usual {out['naive_fraction']:.0%}, pre-whitened {out['pw_fraction']:.0%}, "
              f"honest {out['honest_fraction']:.0%}", flush=True)
    (OUT / "index.json").write_text(json.dumps(summary), encoding="utf-8")

    # One file per grid point with every variable, so a click on the globe opens the full record offline.
    for r in results:
        if not r["vars"]:
            continue
        cell = {"lat": r["lat"], "lon": r["lon"], "vars": {}}
        for var, v in r["vars"].items():
            name, units, up, down = SCAN_VARS[var]
            m, thr = fdr[var]
            cell["vars"][var] = {
                "name": name, "units": units, "rising": up, "falling": down,
                "first": v["dates"][0], "last": v["dates"][1], "n": v["n"], "months": v["months"],
                "values": v["values"], "clim": v["clim"],
                "rate": sig(v["rate"]), "rate_lo": sig(v["rate_lo"]), "rate_hi": sig(v["rate_hi"]),
                "p_naive": sig(v["p_naive"]), "z_naive": sig(v["z_naive"], 3),
                "p_honest": sig(v["p_honest"]), "z_honest": sig(v["z_honest"], 3),
                "fdr": bool(m[(r["lat"], r["lon"])]), "fdr_threshold": sig(thr),
                "phi": sig(v["phi"], 3), "sigma": sig(v["sigma"], 3), "more_years": sig(v["more_years"], 3),
                "halves": v["halves"],
            }
        name = f"{r['lat']:+.1f}_{r['lon']:+.1f}.json"
        (CELLS / name).write_text(json.dumps(cell, separators=(",", ":")), encoding="utf-8")
    print(f"{len(results)} point files written to {CELLS}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    if a.download:
        download(a.workers)
    else:
        analyse()
