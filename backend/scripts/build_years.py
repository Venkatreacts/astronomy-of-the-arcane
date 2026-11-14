"""Yearly anomalies for the globe's time playback, from the point files that build_atlas.py wrote.

    python scripts/build_years.py      # a few seconds; needs web/public/data/cells/*.json

For every sample point and variable: the mean of (monthly value - that month's 1981-2025 normal) over each
calendar year. A year with fewer than 9 months present is left empty (null), never filled. The numbers are
for watching the data move; the trend verdicts still come only from the monthly tests in the atlas files.
Writes web/public/data/atlas/years_<VAR>.json.
"""

from __future__ import annotations

import json
import math
import pathlib

DATA = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MIN_MONTHS = 9


def sig(x: float, digits: int = 3):
    if x is None or not math.isfinite(x) or x == 0:
        return 0.0 if x == 0 else None
    return round(x, digits - 1 - int(math.floor(math.log10(abs(x)))))


def yearly(values: list, clim: list) -> list:
    out = []
    for y in range(len(values) // 12):
        anoms = [values[y * 12 + m] - clim[m] for m in range(12) if values[y * 12 + m] is not None]
        out.append(sig(sum(anoms) / len(anoms)) if len(anoms) >= MIN_MONTHS else None)
    return out


def main() -> None:
    by_var: dict[str, dict] = {}
    for path in sorted((DATA / "cells").glob("*.json")):
        cell = json.loads(path.read_text(encoding="utf-8"))
        for var, v in cell["vars"].items():
            first = int(v["first"][:4])
            d = by_var.setdefault(var, {"id": var, "name": v["name"], "units": v["units"], "first": first,
                                        "years": [first, first + v["months"] // 12 - 1], "min_months": MIN_MONTHS,
                                        "cells": []})
            d["cells"].append([cell["lat"], cell["lon"], yearly(v["values"], v["clim"])])
    for var, d in by_var.items():
        (DATA / "atlas" / f"years_{var}.json").write_text(json.dumps(d, separators=(",", ":")), encoding="utf-8")
        print(var, len(d["cells"]), "points", d["years"])


if __name__ == "__main__":
    main()
