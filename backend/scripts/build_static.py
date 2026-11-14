"""Pre-compute what the demo shows into web/public/data/, so it works with no server and no Wi-Fi.

Run from backend/:  python scripts/build_static.py   (about 3 minutes)

Writes web/public/data/noise/phi{0.0..0.9}_trend{0.0,0.8}.json: Noise Trap maps (20 x 20, 25 years, seed 0);
trend 0.8 adds a real trend to the left half (positive control).
Also writes web/public/data/cases/ (index.json + one file per case). Re-run after any case file changes:
  python scripts/build_static.py --cases-only
This is a separate script on purpose: backend/data/ belongs to the data session.
"""

from __future__ import annotations

import json
import math
import pathlib
import sys
import warnings

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
OUT = BACKEND.parent / "web" / "public" / "data"

PHIS = [round(0.1 * i, 1) for i in range(10)]
TRENDS = [0.0, 0.8]  # 0.8 = positive control: real trend on the left half


def clean(o):
    """numpy / NaN -> plain JSON."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not math.isfinite(float(o)) else float(o)
    return o


def noise_name(phi: float, trend: float = 0.0) -> str:
    return f"phi{phi:.1f}_trend{trend:.1f}.json"


def build_noise(trends=TRENDS) -> None:
    from trendlab import noise_trap

    out = OUT / "noise"
    out.mkdir(parents=True, exist_ok=True)
    for trend in trends:
        for phi in PHIS:
            res = noise_trap(n_time=300, ny=20, nx=20, phi=phi, seed=0, trend_sd_per_decade=trend)
            keep = {k: v for k, v in res.items() if k.endswith("fraction") or k in ("fdr_threshold", "params")}
            keep["naive_mask"] = res["naive_mask"].astype(int)   # Plotly heatmaps need numbers
            keep["honest_mask"] = res["honest_mask"].astype(int)
            (out / noise_name(phi, trend)).write_text(json.dumps(clean(keep)), encoding="utf-8")
            print(f"noise phi={phi} trend={trend}: usual {res['naive_fraction']:.1%}, honest {res['honest_fraction']:.1%}")


def build_cases() -> list[dict]:
    """Copy backend/data/cases/*.json to web/public/data/cases/ plus an index.json.

    Each series' analysis is recomputed with the current engine, so the static copy always matches
    the code (e.g. it gains slope_ci_per_year) without editing the data session's files.
    Fields are only added, never renamed or removed. Map cases (GRACE) are copied as they are.
    """
    from trendlab import analyze_series

    src = BACKEND / "data" / "cases"
    out = OUT / "cases"
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for p in sorted(src.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for s in d.get("series", []):
            vals = [np.nan if v is None else v for v in s["values"]]
            s["analysis"] = analyze_series(s["dates"], vals)
        (out / p.name).write_text(json.dumps(clean(d)), encoding="utf-8")
        index.append({"id": d.get("id", p.stem), "title": d.get("title", p.stem)})
    (out / "index.json").write_text(json.dumps(index), encoding="utf-8")
    print("cases:", [c["id"] for c in index])
    return index


if __name__ == "__main__":
    import argparse

    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser()
    ap.add_argument("--trend", type=float, action="append", help="build only these trend levels (0 or 0.8)")
    ap.add_argument("--cases-only", action="store_true", help="only rebuild the case files (seconds)")
    a = ap.parse_args()
    build_cases()
    if not a.cases_only:
        build_noise(a.trend or TRENDS)
