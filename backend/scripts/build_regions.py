"""Area-average series for the Region Scanner presets and the whole globe (land sample), so the
"Average over this box" panel works offline.

    python scripts/build_regions.py      # reads the cached NASA POWER regional files and the atlas points

Each series is the cos(latitude)-weighted mean of every grid point (regions) or every land sample point
(the globe: the atlas points that have soil wetness). The page runs the same three stages on it, and the
default time frame (1981-2025, all months) is pre-computed here with the same engine as /api/explore.
"""

from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from api.scan_routes import PRESETS  # noqa: E402
from trendlab.explore import area_mean, area_mean_points, explore  # noqa: E402
from trendlab.scan import fetch_power_region  # noqa: E402

WEB = BACKEND.parent / "web" / "public" / "data"
OUT = WEB / "regions"
VARS = ("T2M", "PRECTOTCORR", "GWETROOT", "RH2M", "WS2M")
GLOBE = {"id": "globe", "name": "Whole globe (land sample)", "bbox": [-90.0, 90.0, -180.0, 180.0]}


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not math.isfinite(float(o)) else float(f"{float(o):.6g}")
    return o


def entry(name, units, dates, mean, points):
    vals = [None if not np.isfinite(v) else float(v) for v in mean]
    return {"name": name, "units": units, "points": int(points), "dates": dates, "values": vals,
            "default": explore(dates, np.array(mean, dtype=float))}


def names():
    cell = json.loads(next((WEB / "cells").glob("*.json")).read_text(encoding="utf-8"))
    return {k: (v["name"], v["units"]) for k, v in cell["vars"].items()}


def region(p, labels):
    out = {}
    for var in VARS:
        d = fetch_power_region(var, p["bbox"])  # cached after the scan build
        cube = d["cube"]
        points = int(np.isfinite(cube).any(axis=0).sum())
        out[var] = entry(*labels[var], d["dates"], area_mean(cube, d["lats"]), points)
    return out


def globe(labels):
    cells = [json.loads(f.read_text(encoding="utf-8")) for f in sorted((WEB / "cells").glob("*.json"))]
    land = [c for c in cells if "GWETROOT" in c["vars"]]
    out = {}
    for var in VARS:
        have = [c for c in land if var in c["vars"]]
        v0 = have[0]["vars"][var]
        y0, m0 = int(v0["first"][:4]), int(v0["first"][5:7])
        dates = [f"{y0 + (m0 - 1 + k) // 12}-{(m0 - 1 + k) % 12 + 1:02d}" for k in range(v0["months"])]
        series = np.array([[np.nan if x is None else x for x in c["vars"][var]["values"]] for c in have]).T
        out[var] = entry(*labels[var], dates, area_mean_points(series, [c["lat"] for c in have]), len(have))
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    labels = names()
    done = []
    for p in [*PRESETS, GLOBE]:
        try:
            data = globe(labels) if p["id"] == "globe" else region(p, labels)
        except Exception as exc:  # a missing cache file must not lose the other regions
            print(f"{p['id']}: failed ({exc})", flush=True)
            continue
        (OUT / f"{p['id']}.json").write_text(json.dumps(clean({**p, "vars": data})), encoding="utf-8")
        done.append({k: p[k] for k in ("id", "name", "bbox")})
        print(f"{p['id']}: " + ", ".join(f"{k} {v['points']} pts" for k, v in data.items()), flush=True)
    (OUT / "index.json").write_text(json.dumps(done), encoding="utf-8")
