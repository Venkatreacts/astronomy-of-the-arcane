"""Mann-Kendall core shared by the point test, the atlas, the Region Scanner and the simulations.

One implementation, vectorized over columns of a (time, series) array, so every page uses the same numbers.
- Missing months stay NaN at their real position in time; nothing is filled in. A pair of months counts
  in S only when both are present.
- The variance of S includes the tie correction (Kendall 1975; Hirsch, Slack & Smith 1982, eq. 3):
  var(S) = [n(n-1)(2n+5) - sum_t t(t-1)(2t+5)] / 18, summed over groups of t equal values.
- Lag-1 autocorrelation uses only pairs of consecutive months that are both present. Pre-whitening
  (Kulkarni & von Storch 1995) is y_t = x_t - r1 * x_(t-1), so a month after a gap becomes NaN.
On complete series this reproduces pymannkendall's original_test and pre_whitening_modification_test
(checked in tests/test_mk.py).
"""

from __future__ import annotations

import warnings

import numpy as np
from scipy.stats import norm


def columns(x) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    return x[:, None] if x.ndim == 1 else x


def mk_s(y: np.ndarray) -> np.ndarray:
    """Kendall's S for every column: sum of sign(y_j - y_i) over all pairs i < j that are both present."""
    y = columns(y)
    s = np.zeros(y.shape[1])
    gaps = np.isnan(y).any()
    for k in range(1, y.shape[0]):
        d = np.sign(y[k:] - y[:-k])
        s += np.nansum(d, axis=0) if gaps else d.sum(axis=0)
    return s


def tie_term(y: np.ndarray) -> np.ndarray:
    """sum t(t-1)(2t+5) over groups of tied values in each column (NaN ignored)."""
    y = columns(y)
    out = np.zeros(y.shape[1])
    for j in range(y.shape[1]):
        v = y[:, j]
        _, t = np.unique(v[np.isfinite(v)], return_counts=True)
        t = t[t > 1].astype(float)
        out[j] = (t * (t - 1) * (2 * t + 5)).sum()
    return out


def mk_var(y: np.ndarray) -> np.ndarray:
    y = columns(y)
    n = np.isfinite(y).sum(axis=0).astype(float)
    return (n * (n - 1) * (2 * n + 5) - tie_term(y)) / 18.0


def mk_z(s: np.ndarray, var: np.ndarray) -> np.ndarray:
    """Continuity-corrected normal score; 0 where S = 0 or the variance is not positive."""
    sd = np.sqrt(np.where(var > 0, var, np.nan))
    with np.errstate(invalid="ignore", divide="ignore"):
        z = np.where(s > 0, (s - 1) / sd, np.where(s < 0, (s + 1) / sd, 0.0))
    return np.where(np.isfinite(z), z, 0.0)


def mk_test(y: np.ndarray) -> dict:
    """Mann-Kendall test on every column. Two-sided p from the normal approximation."""
    y = columns(y)
    s, var = mk_s(y), mk_var(y)
    z = mk_z(s, var)
    return {"s": s, "var": var, "z": z, "p": 2 * norm.sf(np.abs(z)), "n": np.isfinite(y).sum(axis=0)}


def lag1(x: np.ndarray) -> np.ndarray:
    """Lag-1 autocorrelation per column: sum of products over consecutive present pairs divided by the
    sum of squares of all present values (mean removed), rescaled by (n - 1) / pairs so that missing
    pairs do not bias it toward 0. On a complete series pairs = n - 1: pymannkendall's acf exactly."""
    x = columns(x)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-missing columns: mean of empty slice
        xc = x - np.nanmean(x, axis=0)
    prod = xc[1:] * xc[:-1]
    pairs = np.isfinite(prod).sum(axis=0)
    n = np.isfinite(xc).sum(axis=0)
    num = np.nansum(prod, axis=0) * (n - 1) / np.maximum(pairs, 1)
    den = np.nansum(xc ** 2, axis=0)
    return np.where((den > 0) & (pairs > 0), num / np.where(den > 0, den, 1.0), 0.0)


def prewhiten(x: np.ndarray) -> np.ndarray:
    """y_t = x_t - r1 * x_(t-1) per column; NaN where either month is missing. One row shorter."""
    x = columns(x)
    return x[1:] - lag1(x) * x[:-1]
