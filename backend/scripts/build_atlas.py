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
import pathlib
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from trendlab import analyze_series, fdr_bh  # noqa: E402
from trendlab.scan import SCAN_VARS  # noqa: E402

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
RAW = BACKEND / "data" / "raw" / "atlas"
OUT = BACKEND.parent / "web" / "public" / "data" / "atlas"
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


def analyse() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cells = [(float(a), float(o)) for a in LATS for o in LONS if cell_path(a, o).is_file()]
    summary = []
    for var, (name, units, up, down) in SCAN_VARS.items():
        rows = []
        for lat, lon in cells:
            raw = json.loads(cell_path(lat, lon).read_text(encoding="utf-8")).get(var)
            if not raw:
                continue
            dates, vals = series(raw)
            x = np.asarray(vals)
            # Soil wetness is undefined over ocean (fill values) and pinned at 1 over ice: skip both.
            if np.isfinite(x).sum() < 0.8 * x.size or np.nanstd(x) == 0:
                continue
            a = analyze_series(dates, vals)
            rows.append({"lat": lat, "lon": lon,
                         "rate": a["honest"]["slope_per_year"] * 10,  # per decade
                         "p_naive": a["naive"]["p"], "p_honest": a["honest"]["p"],
                         "naive": bool(a["naive"]["significant"]), "phi": a["noise"]["phi"],
                         "more_years": a["years_more_needed"]})
        p = np.array([r["p_honest"] for r in rows])
        mask, thr = fdr_bh(p, 0.10)
        for r, m in zip(rows, mask):
            r["honest"] = bool(m)
        n = len(rows)
        out = {"id": var, "name": name, "units": units, "rising": up, "falling": down,
               "step_deg": STEP, "years": [START, END], "n_cells": n, "fdr_threshold": float(thr),
               "naive_fraction": sum(r["naive"] for r in rows) / n,
               "honest_fraction": sum(r["honest"] for r in rows) / n,
               "source": "NASA POWER monthly point API (MERRA-2), 5-degree grid; honest = pre-whitened "
                         "Mann-Kendall with Benjamini-Hochberg FDR 0.10 across all cells",
               "cells": [{k: (round(v, 5) if isinstance(v, float) else v) for k, v in r.items()} for r in rows]}
        (OUT / f"{var}.json").write_text(json.dumps(out), encoding="utf-8")
        summary.append({k: out[k] for k in ("id", "name", "units", "n_cells", "naive_fraction", "honest_fraction")})
        print(f"{var}: {n} cells, usual {out['naive_fraction']:.0%}, honest {out['honest_fraction']:.0%}", flush=True)
    (OUT / "index.json").write_text(json.dumps(summary), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    if a.download:
        download(a.workers)
    else:
        analyse()
