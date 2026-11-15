"""Derived numbers for two globe layers, from data already in web/public/data. Writes NEW files only:

    python scripts/build_insights.py

  web/public/data/atlas/insights_<VAR>.json   "Left the old normal", one row per atlas point
  web/public/data/atlas/insights_COMPOUND.json "Compound change", three presets

Left the old normal (simplified from Hawkins & Sutton 2012, GRL 39, L01702; bin names from Frame et al. 2017,
Nature Climate Change 7, 407-411): take the yearly means of the de-seasonalised record (each month minus its
calendar-month normal, the normals published in the cell file). Signal = Sen's slope (the atlas rate, per year)
x number of years. Noise = standard deviation of the yearly means after the Sen trend line is removed.
Ratio = |signal| / noise. Where the ratio is over 2, also the first year the trend line had moved 2 x noise from
the start of the record. Baseline is the start of this record (1981), not pre-industrial.

Compound change: atlas points present in both variables; a point lights up only when both trends pass the honest
verdict (map rule) in the named directions. No causal or impact claims.
"""

from __future__ import annotations

import json
import math
import pathlib

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
DATA = BACKEND.parent / "web" / "public" / "data"
ATLAS = DATA / "atlas"
CELLS = DATA / "cells"
VARS = ("T2M", "PRECTOTCORR", "GWETROOT", "RH2M", "WS2M")
MIN_MONTHS = 9  # a year counts only with at least this many months of data
BINS = [(1, "within the old normal"), (2, "unusual"), (3, "unfamiliar"), (math.inf, "unknown")]
PRESETS = [
    {"id": "hot-dry", "name": "Hotter and drier", "a": ("T2M", 1), "b": ("GWETROOT", -1),
     "words": ["air temperature rising", "root-zone soil wetness falling"]},
    {"id": "hot-humid", "name": "Hotter and more humid", "a": ("T2M", 1), "b": ("RH2M", 1),
     "words": ["air temperature rising", "relative humidity rising"]},
    {"id": "dry-windy", "name": "Drier and windier", "a": ("GWETROOT", -1), "b": ("WS2M", 1),
     "words": ["root-zone soil wetness falling", "wind speed rising"]},
]


def sig(x, digits: int = 4):
    return None if x is None or not np.isfinite(x) else float(f"{x:.{digits}g}")


def yearly_means(first: str, values: list, clim: list) -> tuple[list[int], list[float]]:
    """Calendar-year means of the anomalies (value minus its calendar-month normal)."""
    y0, m0 = int(first[:4]), int(first[5:7]) - 1
    by_year: dict[int, list[float]] = {}
    for k, v in enumerate(values):
        if v is None:
            continue
        m = m0 + k
        by_year.setdefault(y0 + m // 12, []).append(v - clim[m % 12])
    years = sorted(y for y, xs in by_year.items() if len(xs) >= MIN_MONTHS)
    return years, [float(np.mean(by_year[y])) for y in years]


def emergence(years: list[int], means: list[float], slope_per_year: float) -> dict:
    """Signal-to-noise of one record. slope_per_year: Sen's slope of the monthly anomalies."""
    t = np.asarray(years, dtype=float)
    y = np.asarray(means, dtype=float)
    n = len(years)
    signal = slope_per_year * n
    resid = y - slope_per_year * t
    resid -= np.median(resid)  # Sen line: slope b, intercept median(y - b t)
    noise = float(np.std(resid, ddof=1)) if n > 1 else 0.0
    ratio = 0.0 if signal == 0 else (math.inf if noise == 0 else abs(signal) / noise)
    year = None
    if ratio > 2:  # first year y with |b| * (years since the start, counting y) >= 2 * noise
        year = int(years[0] + math.ceil(2 * noise / abs(slope_per_year)) - 1)
    return {"signal": signal, "noise": noise, "ratio": ratio, "year": year}


def label(ratio: float) -> str:
    return next(name for top, name in BINS if ratio < top)


def insights(var: str) -> dict:
    atlas = json.loads((ATLAS / f"{var}.json").read_text(encoding="utf-8"))
    rows = []
    for c in atlas["cells"]:
        v = json.loads((CELLS / f"{c['lat']:+.1f}_{c['lon']:+.1f}.json").read_text(encoding="utf-8"))["vars"][var]
        years, means = yearly_means(v["first"], v["values"], v["clim"])
        e = emergence(years, means, c["rate"] / 10)
        rows.append([c["lat"], c["lon"], sig(e["ratio"], 3), e["year"], sig(e["noise"], 3)])
    return {
        "id": var, "units": atlas["units"], "years": atlas["years"], "baseline": atlas["years"][0],
        "bins": [[None if math.isinf(top) else top, name] for top, name in BINS],
        "method": "Yearly means of the de-seasonalised record. Signal = Sen's slope x number of years; noise = "
                  "standard deviation of the yearly means after the trend line is removed; ratio = |signal| / noise. "
                  "Simplified from Hawkins & Sutton (2012); bin names from Frame et al. (2017). Baseline is the start "
                  "of this record, not pre-industrial.",
        "columns": ["lat", "lon", "ratio", "year_passed_2x_noise", "noise"],
        "cells": rows,
    }


def compound(atlases: dict) -> dict:
    out = []
    for p in PRESETS:
        (va, sa), (vb, sb) = p["a"], p["b"]
        b = {(c["lat"], c["lon"]): c for c in atlases[vb]["cells"]}
        cells = []
        for ca in atlases[va]["cells"]:
            cb = b.get((ca["lat"], ca["lon"]))
            if cb is None:
                continue
            lit = bool(ca["honest"] and cb["honest"] and np.sign(ca["rate"]) == sa and np.sign(cb["rate"]) == sb)
            cells.append([ca["lat"], ca["lon"], int(lit)])
        n_lit = sum(c[2] for c in cells)
        out.append({"id": p["id"], "name": p["name"], "vars": [va, vb], "words": p["words"], "tested": len(cells),
                    "lit": n_lit, "share": sig(n_lit / len(cells) if cells else 0.0, 3),
                    "land_only": "GWETROOT" in (va, vb), "cells": cells})
    return {
        "rule": "A point lights up only when both trends pass the honest verdict (map rule) in the named directions. "
                "Tested points are those with both variables. Root-zone soil wetness exists on land only.",
        "presets": out,
    }


def main() -> None:
    atlases = {v: json.loads((ATLAS / f"{v}.json").read_text(encoding="utf-8")) for v in VARS}
    for v in VARS:
        d = insights(v)
        (ATLAS / f"insights_{v}.json").write_text(json.dumps(d, separators=(",", ":")), encoding="utf-8")
        r = [row[2] for row in d["cells"]]
        print(v, {name: sum(1 for x in r if label(x) == name) for _, name in BINS})
    c = compound(atlases)
    (ATLAS / "insights_COMPOUND.json").write_text(json.dumps(c, separators=(",", ":")), encoding="utf-8")
    for p in c["presets"]:
        print(p["name"], p["lit"], "of", p["tested"])


if __name__ == "__main__":
    main()
