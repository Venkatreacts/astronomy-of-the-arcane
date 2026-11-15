"""Time frame, seasons, the classroom t-test and "the year it became provable" for one monthly series.

Built on the same engine as every other page: analyze_series for monthly data, and the shared Mann-Kendall
core (mk.py), Sen's slope and Benjamini-Hochberg (stats.py) for one-value-per-year season series. Nothing
here changes those tests; it only chooses which months go in.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
from scipy.stats import t as student_t
from scipy.stats import theilslopes

from .mk import mk_test, prewhiten
from .stats import analyze_series, fdr_bh, noise_params

FIRST_YEAR, LAST_YEAR = 1981, 2025
SHORT_YEARS = 15        # below this the page warns that a real trend may not show yet
MIN_YEARS = 5           # shortest time frame we test at all
SEASONS = {"DJF": (12, 1, 2), "MAM": (3, 4, 5), "JJA": (6, 7, 8), "SON": (9, 10, 11)}
SEASON_NAMES = {"all": "All months", "DJF": "Dec–Feb", "MAM": "Mar–May", "JJA": "Jun–Aug", "SON": "Sep–Nov"}
SEASON_Q = 0.10         # Benjamini-Hochberg across the four seasons, same q as the map rule


def window(dates: Sequence[str], values: Sequence[float], start: int, end: int):
    """The months of years start..end inclusive."""
    keep = [k for k, d in enumerate(dates) if start <= int(str(d)[:4]) <= end]
    return [dates[k] for k in keep], np.array([values[k] for k in keep], dtype=float)


def season_means(dates: Sequence[str], values: Sequence[float], season: str):
    """One value per year: the mean of the season's three months, NaN unless all three are present.
    Dec-Feb of year Y is December of Y-1 with January and February of Y, so it needs the December before."""
    months = SEASONS[season]
    have = {(int(str(d)[:4]), int(str(d)[5:7])): float(v) for d, v in zip(dates, values)}
    years = sorted({y for y, _ in have})
    out = []
    for y in years:
        keys = [((y - 1) if (season == "DJF" and m == 12) else y, m) for m in months]
        vals = [have.get(k, np.nan) for k in keys]
        out.append(float(np.mean(vals)) if all(np.isfinite(vals)) else np.nan)
    return years, np.array(out)


def ols_trend(t: Sequence[float], x: Sequence[float], alpha: float = 0.05) -> dict:
    """Ordinary least squares line with the classroom t-test (independent, normal errors assumed).
    t in years, so the slope is per year. Two-sided p from Student's t with n - 2 degrees of freedom."""
    t = np.asarray(t, dtype=float)
    x = np.asarray(x, dtype=float)
    ok = np.isfinite(t) & np.isfinite(x)
    t, x = t[ok], x[ok]
    n = t.size
    if n < 3:
        raise ValueError("Need at least 3 values for a straight line.")
    tc = t - t.mean()
    sxx = float((tc ** 2).sum())
    slope = float((tc * (x - x.mean())).sum() / sxx)
    resid = x - (x.mean() + slope * tc)
    df = n - 2
    se = math.sqrt(float((resid ** 2).sum()) / df / sxx) if df > 0 else math.inf
    tstat = slope / se if se > 0 else (math.inf if slope else 0.0)
    p = float(2 * student_t.sf(abs(tstat), df)) if math.isfinite(tstat) else 0.0
    half = float(student_t.ppf(1 - alpha / 2, df)) * se
    return {"slope_per_year": slope, "slope_ci_per_year": [slope - half, slope + half], "se": se,
            "t": float(tstat), "df": int(df), "p": p, "significant": bool(p < alpha), "n": int(n)}


def yearly_trend(values: Sequence[float], alpha: float = 0.05) -> dict:
    """The three stages on a one-value-per-year series, with the same core as the monthly test:
    Mann-Kendall, Mann-Kendall after lag-1 pre-whitening, Sen's slope widened by sqrt((1+phi)/(1-phi))."""
    x = np.asarray(values, dtype=float)
    ok = np.isfinite(x)
    if ok.sum() < MIN_YEARS:
        raise ValueError(f"Need at least {MIN_YEARS} years with all three months present.")
    yrs = np.arange(x.size, dtype=float)
    naive = mk_test(x)
    pw = mk_test(prewhiten(x))
    if np.nanstd(x) == 0:
        slope, lo, hi = 0.0, 0.0, 0.0
    else:
        slope, _, lo, hi = theilslopes(x[ok], yrs[ok])
    phi = float(np.clip(noise_params(x)["phi"], 0.0, 0.95))
    widen = math.sqrt((1 + phi) / (1 - phi))
    ci = [float(slope - (slope - lo) * widen), float(slope + (hi - slope) * widen)]
    p_n, p_pw = float(naive["p"][0]), float(pw["p"][0])
    return {
        "n": int(ok.sum()),
        "naive": {"p": p_n, "z": float(naive["z"][0]), "significant": bool(p_n < alpha)},
        "honest": {"p": p_pw, "z": float(pw["z"][0]), "significant": bool(p_pw < alpha),
                   "slope_per_year": float(slope), "slope_ci_per_year": ci, "phi_used_for_ci": phi},
        "noise": noise_params(x),
    }


def season_table(dates, values, alpha: float = 0.05) -> dict:
    """All four seasons, with Benjamini-Hochberg (q = 0.10) on the stickiness-removed p-values across them."""
    rows = []
    for s in SEASONS:
        years, x = season_means(dates, values, s)
        try:
            r = yearly_trend(x, alpha)
        except ValueError:
            rows.append({"season": s, "name": SEASON_NAMES[s], "n": int(np.isfinite(x).sum()), "tested": False})
            continue
        rows.append({"season": s, "name": SEASON_NAMES[s], "tested": True, "n": r["n"],
                     "rate_per_year": r["honest"]["slope_per_year"], "rate_ci_per_year": r["honest"]["slope_ci_per_year"],
                     "p_usual": r["naive"]["p"], "usual": r["naive"]["significant"],
                     "p_honest": r["honest"]["p"], "pw": r["honest"]["significant"]})
    tested = [r for r in rows if r["tested"]]
    mask, threshold = fdr_bh(np.array([r["p_honest"] for r in tested]), SEASON_Q)
    for r, m in zip(tested, mask):
        r["honest"] = bool(m)
    return {"rows": rows, "q": SEASON_Q, "threshold": threshold}


def provable_year(dates, values, start: int, end: int, alpha: float = 0.05) -> dict:
    """Repeat the honest verdict (single-place rule: stage 2 at p < alpha) on records start..E for every
    end year E from start + 15 to end. first_year = the first E from which every later E is also 'real'."""
    steps = []
    for e in range(start + SHORT_YEARS, end + 1):
        d, x = window(dates, values, start, e)
        try:
            a = analyze_series(d, x, alpha)
        except ValueError:
            continue
        steps.append({"end": e, "p": a["honest"]["p"], "real": bool(a["honest"]["significant"])})
    first = None
    for s in reversed(steps):
        if not s["real"]:
            break
        first = s["end"]
    return {"steps": steps, "first_year": first}


def explore(dates: Sequence[str], values: Sequence[float], start: int = FIRST_YEAR, end: int = LAST_YEAR,
            season: str = "all", alpha: float = 0.05) -> dict:
    """Everything the 'choose a time frame' and 'test for significance' steps show, for one monthly series."""
    if season != "all" and season not in SEASONS:
        raise ValueError(f"season must be 'all' or one of {sorted(SEASONS)}")
    if end < start:
        start, end = end, start
    if end - start + 1 < MIN_YEARS:
        raise ValueError(f"Choose at least {MIN_YEARS} years.")
    d, x = window(dates, values, start, end)
    if not d:
        raise ValueError("No months in this time frame.")
    span = end - start + 1
    seasons = season_table(d, x, alpha)
    full = analyze_series(d, x, alpha)  # all months: also gives the years-to-detect number
    if season == "all":
        stages = {k: full[k] for k in ("naive", "honest", "noise", "record_years", "years_more_needed")}
        stages["pw"] = full["honest"]
        anomalies = full["anomalies"]
        t = np.arange(len(d)) / 12.0
        ols = ols_trend(t, anomalies_or_nan(anomalies), alpha)
        series = {"kind": "monthly", "dates": d, "values": [None if not np.isfinite(v) else float(v) for v in x],
                  "anomalies": anomalies}
        rule = "place"
    else:
        years, means = season_means(d, x, season)
        y = yearly_trend(means, alpha)
        row = next(r for r in seasons["rows"] if r["season"] == season)
        # one season out of four was looked at, so its honest verdict is the four-season rule
        honest = {**y["honest"], "significant": bool(row.get("honest", False))}
        pw = {**y["honest"]}
        stages = {"naive": y["naive"], "pw": pw, "honest": honest, "noise": y["noise"],
                  "record_years": float(y["n"]), "years_more_needed": None}
        mean = float(np.nanmean(means))
        anomalies = [None if not np.isfinite(v) else float(v - mean) for v in means]
        ols = ols_trend(np.array(years, dtype=float), means, alpha)
        series = {"kind": "season", "dates": [f"{yr}-01" for yr in years],
                  "values": [None if not np.isfinite(v) else float(v) for v in means], "anomalies": anomalies}
        rule = "season"
    return {
        "frame": {"start": start, "end": end, "years": span, "short": span < SHORT_YEARS},
        "season": season, "season_name": SEASON_NAMES[season], "rule": rule,
        "series": series, "stages": stages, "ols": ols, "seasons": seasons,
        "provable": {**provable_year(dates, values, start, end, alpha),
                     "years_more_needed": full["years_more_needed"]},
    }


def anomalies_or_nan(a):
    return np.array([np.nan if v is None else v for v in a], dtype=float)


def area_mean(cube: np.ndarray, lats: Sequence[float]) -> np.ndarray:
    """Mean over the last two axes (lat, lon) of a (time, lat, lon) cube, weighted by cos(latitude).
    Missing pixels are left out of that month's mean; a month with no data at all stays NaN."""
    cube = np.asarray(cube, dtype=float)
    w = np.cos(np.radians(np.asarray(lats, dtype=float)))[None, :, None] * np.ones(cube.shape[1:])[None]
    w = np.broadcast_to(w, cube.shape)
    ok = np.isfinite(cube)
    num = np.where(ok, cube * w, 0.0).sum(axis=(1, 2))
    den = np.where(ok, w, 0.0).sum(axis=(1, 2))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan)


def area_mean_points(series: np.ndarray, lats: Sequence[float]) -> np.ndarray:
    """Same weighting for scattered sample points: series is (time, points)."""
    series = np.asarray(series, dtype=float)
    return area_mean(series[:, :, None], lats)
