"""Pre-compute the rounds for "Train your eye" into web/public/data/game.json so the game runs offline.

    python scripts/build_game.py

Two pools of de-seasonalised monthly series, with both tests already run on each:
  real   atlas points (web/public/data/cells) whose trend passes the strictest rule, the map rule
         (pre-whitened Mann-Kendall plus Benjamini-Hochberg FDR q = 0.10 across the atlas). Equal numbers
         per variable, picked with a fixed seed.
  noise  one twin per real series: trend-free AR(1) "sticky noise" from the simulation lab's own generator
         (trendlab.stats.ar1_noise_cube), with the real series' stickiness (phi) and noise size (sigma), the
         same months and the same missing months. So the only built-in difference is the trend.
The web page picks 5 of each with a seeded shuffle (web/src/lib/game.js).
"""

from __future__ import annotations

import json
import pathlib
import random
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from trendlab import analyze_series  # noqa: E402
from trendlab.stats import ar1_noise_cube  # noqa: E402

WEB = BACKEND.parent / "web" / "public" / "data"
CELLS = WEB / "cells"
PER_VAR = 6     # real series per variable in the pool
SEED = 2026     # picks the real series and seeds the noise twins (twin k uses SEED + k)


def sig(x, digits: int = 4):
    return None if x is None or not np.isfinite(x) else float(f"{x:.{digits}g}")


def month_dates(first: str, count: int) -> list[str]:
    y0, m0 = int(first[:4]), int(first[5:7]) - 1
    return [f"{y0 + (m0 + k) // 12}-{(m0 + k) % 12 + 1:02d}" for k in range(count)]


def stats(dates: list[str], values: list[float | None]) -> dict:
    a = analyze_series(dates, [np.nan if v is None else v for v in values])
    return {
        "anomalies": [None if v is None else sig(v, 3) for v in a["anomalies"]],
        "usual": {"p": sig(a["naive"]["p"]), "trend": bool(a["naive"]["significant"])},
        "honest": {"p": sig(a["honest"]["p"]), "trend": bool(a["honest"]["significant"])},
        "rate": sig(a["honest"]["slope_per_year"] * 10),
        "phi": sig(a["noise"]["phi"], 3),
    }


def real_pool() -> list[dict]:
    by_var: dict[str, list] = {}
    for f in sorted(CELLS.glob("[+-]*.json")):
        cell = json.loads(f.read_text(encoding="utf-8"))
        for var, v in sorted(cell["vars"].items()):
            if v.get("fdr"):
                by_var.setdefault(var, []).append((cell["lat"], cell["lon"], v))
    rng = random.Random(SEED)
    pool = []
    for var in sorted(by_var):
        for lat, lon, v in rng.sample(by_var[var], PER_VAR):
            dates = month_dates(v["first"], v["months"])
            pool.append({"kind": "real", "var": var, "name": v["name"], "units": v["units"], "lat": lat, "lon": lon,
                         "first": v["first"], "values": v["values"], "dates": dates,
                         "sigma": v["sigma"], "phi_cell": v["phi"]})
    return pool


def twin(r: dict, k: int) -> dict:
    phi = float(np.clip(r["phi_cell"], 0.0, 0.95))
    x = ar1_noise_cube(len(r["dates"]), 1, 1, phi, float(r["sigma"]), seed=SEED + k)[:, 0, 0]
    values = [None if r["values"][i] is None else float(x[i]) for i in range(x.size)]
    return {"kind": "noise", "var": r["var"], "name": r["name"], "units": r["units"],
            "first": r["first"], "values": values, "dates": r["dates"], "phi_model": sig(phi, 3)}


def build() -> dict:
    real = real_pool()
    rounds = []
    for k, r in enumerate(real):
        for s in (r, twin(r, k)):
            out = {"id": f"{s['kind']}-{k}", "kind": s["kind"], "var": s["var"], "name": s["name"],
                   "units": s["units"], "first": s["first"], **stats(s["dates"], s["values"])}
            if s["kind"] == "real":
                out.update({"lat": s["lat"], "lon": s["lon"]})
            else:
                out["phi_model"] = s["phi_model"]
            rounds.append(out)
    return {
        "rule": "Usual test: Mann-Kendall, p < 0.05. Honest verdict: the same test after removing the "
                "month-to-month stickiness (lag-1 pre-whitening), p < 0.05.",
        "real_note": "Real records are atlas points (NASA POWER, MERRA-2 model) whose trend passes the strictest "
                     "rule, the map rule (honest test plus false discovery rate control across the whole atlas).",
        "noise_note": "Simulated series are trend-free sticky noise (AR(1)) from the simulation lab's generator, "
                      "with the stickiness and noise size of a real record and the same missing months.",
        "rounds": rounds,
    }


if __name__ == "__main__":
    out = build()
    (WEB / "game.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    real = [r for r in out["rounds"] if r["kind"] == "real"]
    noise = [r for r in out["rounds"] if r["kind"] == "noise"]
    print(f"{len(real)} real, {len(noise)} noise; usual test calls {sum(r['usual']['trend'] for r in noise)} noise "
          f"series a trend, honest verdict {sum(r['honest']['trend'] for r in noise)}; "
          f"real: usual {sum(r['usual']['trend'] for r in real)}, honest {sum(r['honest']['trend'] for r in real)}")
