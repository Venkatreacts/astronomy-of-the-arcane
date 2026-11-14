"""Simulation lab: the three methods on synthetic maps where the truth is known.

Each map is ny x nx places of monthly AR(1) noise (lag-1 autocorrelation phi), optionally spatially
correlated, with an optional real linear trend planted in the LEFT half only, and optionally a share of
months deleted at random. Three methods judge every place:
  usual          Mann-Kendall, p < 0.05
  pre-whitened   Mann-Kendall after lag-1 pre-whitening, p < 0.05
  + FDR          pre-whitened p-values, Benjamini-Hochberg q = 0.10 across the map
Because the truth is known we can score each method. Rates are averaged over independent maps (different
seeds), and the 95% interval is a t-interval across those maps, so it reflects map-to-map variation
including spatial correlation, not just the count of places.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.stats import t as student_t

from . import mk as core
from .stats import ar1_noise_cube, fdr_bh

METHODS = ("naive", "pw", "fdr")


def simulate_map(years: int, phi: float, trend_sd_per_decade: float, spatial_sigma: float, missing: float,
                 seed: int, ny: int = 20, nx: int = 20, alpha: float = 0.05, q: float = 0.10) -> dict:
    n = years * 12
    cube = ar1_noise_cube(n, ny, nx, phi, 1.0, spatial_sigma, seed)
    truth = np.zeros((ny, nx), dtype=bool)
    if trend_sd_per_decade:
        truth[:, : nx // 2] = True
        cube[:, truth] += (trend_sd_per_decade / 120.0) * np.arange(n)[:, None]
    if missing:
        rng = np.random.default_rng(seed + 7_919)
        cube[rng.random(cube.shape) < missing] = np.nan
    x = cube.reshape(n, -1)
    p_naive = core.mk_test(x)["p"].reshape(ny, nx)
    p_pw = core.mk_test(core.prewhiten(x))["p"].reshape(ny, nx)
    fdr, _ = fdr_bh(p_pw, q)
    return {"truth": truth, "naive": p_naive < alpha, "pw": p_pw < alpha, "fdr": fdr}


def score(flags: np.ndarray, truth: np.ndarray) -> dict:
    """Rates for one map. Undefined rates (no true trends, or nothing flagged) are NaN or 0 as noted."""
    pos, neg = truth.sum(), (~truth).sum()
    flagged = flags.sum()
    false = (flags & ~truth).sum()
    return {
        "false_alarm": false / neg if neg else math.nan,                 # share of trend-free places flagged
        "power": (flags & truth).sum() / pos if pos else math.nan,       # share of real-trend places found
        "fdp": false / flagged if flagged else 0.0,                      # share of flagged places that are wrong
        "any_false": float(false > 0),                                   # map has at least one false alarm
    }


def summarize(values: list[float]) -> dict | None:
    v = np.array([x for x in values if np.isfinite(x)])
    if v.size == 0:
        return None
    m = float(v.mean())
    if v.size < 2:
        return {"mean": m, "lo": m, "hi": m}
    half = float(student_t.ppf(0.975, v.size - 1) * v.std(ddof=1) / math.sqrt(v.size))
    return {"mean": m, "lo": max(0.0, m - half), "hi": min(1.0, m + half)}


def experiment(years: int, phi: float, trend: float, spatial: float, missing: float, reps: int = 10,
               seed0: int = 0, ny: int = 20, nx: int = 20) -> dict:
    per = {m: [] for m in METHODS}
    example = None
    for r in range(reps):
        res = simulate_map(years, phi, trend, spatial, missing, seed0 + r, ny, nx)
        if example is None:
            example = res
        for m in METHODS:
            per[m].append(score(res[m], res["truth"]))
    out = {"params": {"years": years, "phi": phi, "trend": trend, "spatial": spatial, "missing": missing,
                      "reps": reps, "seeds": [seed0, seed0 + reps - 1], "ny": ny, "nx": nx}, "methods": {}}
    for m in METHODS:
        rows = per[m]
        stats = {k: summarize([row[k] for row in rows]) for k in ("false_alarm", "power", "fdp", "any_false")}
        if stats["power"]:
            stats["miss"] = {"mean": 1 - stats["power"]["mean"], "lo": 1 - stats["power"]["hi"],
                             "hi": 1 - stats["power"]["lo"]}
        out["methods"][m] = stats
        out["methods"][m]["example"] = "".join("1" if f else "0" for f in example[m].ravel())
    return out
