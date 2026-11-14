"""Pre-compute what the demo shows into web/public/data/, so it works with no server and no Wi-Fi.

Run from backend/:  python scripts/build_static.py   (about 3 minutes)

Writes web/public/data/noise/phi{0.0..0.9}_trend{0.0,0.8}.json: Noise Trap maps (20 x 20, 25 years, seed 0);
trend 0.8 adds a real trend to the left half (positive control).
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


if __name__ == "__main__":
    import argparse

    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser()
    ap.add_argument("--trend", type=float, action="append", help="build only these trend levels (0 or 0.8)")
    a = ap.parse_args()
    build_noise(a.trend or TRENDS)
