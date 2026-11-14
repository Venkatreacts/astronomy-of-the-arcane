"""Trend statistics for monthly Earth science series.

Methods
- Sen's slope + Mann-Kendall test (plain, and pre-whitened to remove autocorrelation;
  Kulkarni & von Storch 1995). Hamed & Rao (1998) was tested and rejected: too many
  false alarms in our simulations.
- Benjamini-Hochberg false discovery rate across a map (Wilks 2016, eq. 3).
- Years needed to detect a trend (Weatherhead et al. 1998; form restated in Weatherhead et al. 2000, eq. 2).
- AR(1) surrogate noise for the "Noise Trap" demo.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
import pymannkendall as mk
from scipy.ndimage import gaussian_filter
from scipy.stats import norm

# "honest" = Mann-Kendall after pre-whitening (removing lag-1 autocorrelation first;
# Kulkarni & von Storch 1995). In our simulations it kept false alarms near 5% for
# lag-1 autocorrelation 0 to 0.6, where the plain test reached 30% and Hamed-Rao 15%.
METHODS = {
    "naive": mk.original_test,
    "honest": mk.pre_whitening_modification_test,
}


def _as_array(values: Sequence[float]) -> np.ndarray:
    return np.asarray(values, dtype=float)


def deseasonalize(values: Sequence[float], months: Sequence[int]) -> np.ndarray:
    """Remove the seasonal cycle: subtract each calendar month's mean (anomalies).

    months: calendar month (1-12) of each value. NaNs are kept as NaN.
    """
    x = _as_array(values)
    m = np.asarray(months, dtype=int)
    out = np.full_like(x, np.nan)
    for month in range(1, 13):
        sel = m == month
        if sel.any():
            clim = np.nanmean(x[sel]) if np.isfinite(x[sel]).any() else np.nan
            out[sel] = x[sel] - clim
    return out


def trend_test(values: Sequence[float], method: str = "honest", alpha: float = 0.05) -> dict:
    """Mann-Kendall trend test on an evenly spaced monthly series.

    Returns the Sen's slope per year (input is monthly, so per-step slope x 12),
    the p-value, and whether the trend is significant at `alpha`.
    """
    x = _as_array(values)
    x = x[np.isfinite(x)]
    if x.size < 24:
        raise ValueError("Need at least 24 monthly values for a trend test.")
    if np.nanstd(x) == 0:
        return {"method": method, "n": int(x.size), "slope_per_year": 0.0, "p": 1.0,
                "z": 0.0, "significant": False, "direction": "no trend"}
    # Hamed-Rao can produce a negative corrected variance on short or odd series;
    # the library then returns NaN, which we treat below as "not significant".
    with np.errstate(invalid="ignore", divide="ignore"):
        res = METHODS[method](x, alpha=alpha)
    # Rate of change always comes from Sen's slope on the series itself, because
    # pre-whitening shrinks the slope of the transformed series.
    slope_year = float(mk.sens_slope(x).slope) * 12.0
    p = float(res.p) if np.isfinite(res.p) else 1.0
    significant = p < alpha
    direction = "no clear trend"
    if significant:
        direction = "rising" if slope_year > 0 else "falling"
    return {
        "method": method,
        "n": int(x.size),
        "slope_per_year": slope_year,
        "p": p,
        "z": float(res.z) if np.isfinite(res.z) else 0.0,
        "significant": bool(significant),
        "direction": direction,
    }


def noise_params(values: Sequence[float]) -> dict:
    """Month-to-month noise SD (sigma_N) and lag-1 autocorrelation (phi) of the
    residuals after removing a straight-line trend."""
    x = _as_array(values)
    x = x[np.isfinite(x)]
    t = np.arange(x.size)
    coef = np.polyfit(t, x, 1)
    resid = x - np.polyval(coef, t)
    sigma = float(np.std(resid, ddof=2))
    r = resid - resid.mean()
    denom = float(np.dot(r, r))
    phi = float(np.dot(r[:-1], r[1:]) / denom) if denom > 0 else 0.0
    return {"sigma_n": sigma, "phi": phi}


def years_to_detect(trend_per_year: float, sigma_n: float, phi: float, prob: float = 0.9) -> float:
    """Years of monthly data needed to detect a linear trend (Weatherhead et al. 1998).

    n* = [ ((2 + z_beta) / |w0|) * sigma_N * sqrt((1 + phi) / (1 - phi)) ] ** (2/3)

    2 corresponds to a 5% significance test; z_beta = Phi^-1(prob) sets the chance of
    detection (prob 0.5 -> 2.0, prob 0.9 -> about 3.3).
    """
    if trend_per_year == 0 or not np.isfinite(trend_per_year):
        return math.inf
    phi = float(np.clip(phi, -0.99, 0.99))
    const = 2.0 + float(norm.ppf(prob))
    base = (const / abs(trend_per_year)) * sigma_n * math.sqrt((1 + phi) / (1 - phi))
    return float(base ** (2.0 / 3.0))


def fdr_bh(pvalues: np.ndarray, alpha_fdr: float = 0.10) -> tuple[np.ndarray, float]:
    """Benjamini-Hochberg control (Wilks 2016, eq. 3).

    Threshold p* = max p(i) such that p(i) <= alpha_fdr * i / N. Returns a boolean mask
    with the same shape as `pvalues` (NaNs never significant) and the threshold (0 if none).
    For spatially correlated maps Wilks suggests alpha_fdr = 2 * alpha_global.
    """
    p = np.asarray(pvalues, dtype=float)
    flat = p.ravel()
    valid = np.isfinite(flat)
    pv = flat[valid]
    n = pv.size
    mask = np.zeros(flat.shape, dtype=bool)
    if n == 0:
        return mask.reshape(p.shape), 0.0
    order = np.sort(pv)
    ranks = np.arange(1, n + 1)
    passing = order <= alpha_fdr * ranks / n
    threshold = float(order[passing].max()) if passing.any() else 0.0
    if passing.any():
        sub = np.zeros(n, dtype=bool)
        sub[pv <= threshold] = True
        mask[valid] = sub
    return mask.reshape(p.shape), threshold


def analyze_series(dates: Sequence[str], values: Sequence[float], alpha: float = 0.05,
                   detect_prob: float = 0.9) -> dict:
    """Full analysis for one monthly series: anomalies, naive vs honest test,
    noise parameters and years-to-detect."""
    months = [int(str(d)[5:7]) for d in dates]
    anomalies = deseasonalize(values, months)
    naive = trend_test(anomalies, "naive", alpha)
    honest = trend_test(anomalies, "honest", alpha)
    noise = noise_params(anomalies)
    record_years = len([v for v in anomalies if np.isfinite(v)]) / 12.0
    # Weatherhead's formula assumes roughly normal noise; skewed variables (rain) can pass
    # the rank-based test sooner than it predicts. So it is only reported when the honest
    # test has NOT yet found a trend: "how many years until it could be detected?"
    if honest["significant"]:
        years_needed = record_years
    else:
        years_needed = years_to_detect(honest["slope_per_year"], noise["sigma_n"], noise["phi"], detect_prob)
    return {
        "anomalies": [None if not np.isfinite(v) else float(v) for v in anomalies],
        "naive": naive,
        "honest": honest,
        "noise": noise,
        "record_years": record_years,
        "years_to_detect": years_needed,
        "years_more_needed": None if not math.isfinite(years_needed) else max(0.0, years_needed - record_years),
        "detect_prob": detect_prob,
    }


def map_trends(cube: np.ndarray, alpha: float = 0.05, alpha_fdr: float = 0.10) -> dict:
    """Per-pixel trends for a (time, lat, lon) cube of monthly anomalies.

    naive_mask: every pixel with p < alpha under the plain Mann-Kendall test.
    honest_mask: pre-whitened Mann-Kendall p-values, then FDR control across the map.
    Cost is about 9 ms per pixel per method for 25 years of monthly data, so keep
    live maps near 2,500 pixels.
    """
    t, ny, nx = cube.shape
    slope = np.full((ny, nx), np.nan)
    p_naive = np.full((ny, nx), np.nan)
    p_honest = np.full((ny, nx), np.nan)
    for j in range(ny):
        for i in range(nx):
            series = cube[:, j, i]
            if np.isfinite(series).sum() < 24:
                continue
            a = trend_test(series, "naive", alpha)
            b = trend_test(series, "honest", alpha)
            slope[j, i] = b["slope_per_year"]
            p_naive[j, i] = a["p"]
            p_honest[j, i] = b["p"]
    naive_mask = np.isfinite(p_naive) & (p_naive < alpha)
    honest_mask, threshold = fdr_bh(p_honest, alpha_fdr)
    valid = np.isfinite(p_naive).sum()
    return {
        "slope": slope,
        "p_naive": p_naive,
        "p_honest": p_honest,
        "naive_mask": naive_mask,
        "honest_mask": honest_mask,
        "fdr_threshold": threshold,
        "naive_fraction": float(naive_mask.sum() / valid) if valid else 0.0,
        "honest_fraction": float(honest_mask.sum() / valid) if valid else 0.0,
    }


def ar1_noise_cube(n_time: int, ny: int, nx: int, phi: float, sigma: float = 1.0,
                   spatial_sigma: float = 0.0, seed: int | None = None) -> np.ndarray:
    """Trend-free AR(1) noise with optional spatial correlation (Gaussian-smoothed
    innovations, `spatial_sigma` in pixels). Each pixel has variance close to sigma**2."""
    rng = np.random.default_rng(seed)
    eps = rng.standard_normal((n_time, ny, nx))
    if spatial_sigma > 0:
        eps = np.stack([gaussian_filter(e, spatial_sigma, mode="wrap") for e in eps])
        eps /= eps.std()
    scale = sigma * math.sqrt(1 - phi ** 2)
    out = np.empty_like(eps)
    out[0] = eps[0] * sigma
    for k in range(1, n_time):
        out[k] = phi * out[k - 1] + scale * eps[k]
    return out


def noise_trap(n_time: int = 300, ny: int = 30, nx: int = 30, phi: float = 0.5,
               spatial_sigma: float = 2.0, seed: int | None = 0, alpha: float = 0.05,
               alpha_fdr: float = 0.10) -> dict:
    """Run both methods on pure noise. Any 'significant' pixel is a false alarm."""
    cube = ar1_noise_cube(n_time, ny, nx, phi, 1.0, spatial_sigma, seed)
    res = map_trends(cube, alpha, alpha_fdr)
    res["params"] = {"n_time": n_time, "ny": ny, "nx": nx, "phi": phi,
                     "spatial_sigma": spatial_sigma, "seed": seed}
    return res
