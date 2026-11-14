import math

import numpy as np
import pytest
from statsmodels.stats.multitest import multipletests

from trendlab import (analyze_series, ar1_noise_cube, deseasonalize, fdr_bh, noise_params,
                      noise_trap, trend_test, years_to_detect)


def monthly_dates(n, start_year=2000):
    return [f"{start_year + k // 12}-{k % 12 + 1:02d}" for k in range(n)]


def test_deseasonalize_removes_cycle():
    n = 240
    months = [k % 12 + 1 for k in range(n)]
    x = 10 + 5 * np.sin(2 * np.pi * np.arange(n) / 12)
    anom = deseasonalize(x, months)
    assert np.allclose(anom, 0, atol=1e-9)


def test_sen_slope_recovers_trend_per_year():
    n = 300
    x = 0.02 * np.arange(n)  # 0.02 per month = 0.24 per year
    res = trend_test(x, "honest")
    assert res["slope_per_year"] == pytest.approx(0.24, rel=1e-6)
    assert res["significant"] and res["direction"] == "rising"


def test_slope_with_missing_months_keeps_real_positions():
    # Audit #1: with 30% of months missing the old code gave 0.167 per year for a true 0.12.
    rng = np.random.default_rng(0)
    n = 360
    x = 0.01 * np.arange(n) + rng.normal(0, 0.3, n)  # 0.12 per year
    x[rng.random(n) < 0.3] = np.nan
    assert trend_test(x, "honest")["slope_per_year"] == pytest.approx(0.12, rel=0.05)


def test_slope_with_a_long_gap():
    rng = np.random.default_rng(1)
    x = 0.01 * np.arange(300) + rng.normal(0, 0.3, 300)
    x[120:156] = np.nan  # a 36-month hole, like GRACE
    assert trend_test(x)["slope_per_year"] == pytest.approx(0.12, rel=0.05)


def test_trend_test_needs_enough_data():
    with pytest.raises(ValueError):
        trend_test(np.arange(10.0))


def test_fdr_matches_statsmodels():
    rng = np.random.default_rng(3)
    p = np.concatenate([rng.uniform(0, 0.002, 30), rng.uniform(0, 1, 300)])
    ours, _ = fdr_bh(p, 0.10)
    ref = multipletests(p, alpha=0.10, method="fdr_bh")[0]
    assert np.array_equal(ours, ref)


def test_fdr_ignores_nan_and_keeps_shape():
    p = np.array([[0.001, np.nan], [0.5, 0.002]])
    mask, thr = fdr_bh(p, 0.10)
    assert mask.shape == p.shape and not mask[0, 1] and thr > 0


def test_years_to_detect_constants_and_direction():
    # 50% detection uses constant 2; 90% uses about 3.3 (Weatherhead et al. 2000, eq. 2).
    n50 = years_to_detect(0.1, 1.0, 0.0, prob=0.5)
    assert n50 == pytest.approx((2 / 0.1) ** (2 / 3), rel=1e-6)
    n90 = years_to_detect(0.1, 1.0, 0.0, prob=0.9)
    assert n90 == pytest.approx((3.2816 / 0.1) ** (2 / 3), rel=1e-3)
    # More autocorrelation, more noise or a smaller trend all need more years.
    assert years_to_detect(0.1, 1.0, 0.6) > years_to_detect(0.1, 1.0, 0.0)
    assert years_to_detect(0.1, 2.0, 0.0) > years_to_detect(0.1, 1.0, 0.0)
    assert years_to_detect(0.05, 1.0, 0.0) > years_to_detect(0.1, 1.0, 0.0)
    assert math.isinf(years_to_detect(0.0, 1.0, 0.0))


def test_noise_params_recovers_phi():
    cube = ar1_noise_cube(4000, 1, 1, phi=0.6, sigma=1.0, seed=5)
    est = noise_params(cube[:, 0, 0])
    assert est["phi"] == pytest.approx(0.6, abs=0.05)
    assert est["sigma_n"] == pytest.approx(1.0, abs=0.1)


def test_honest_test_has_fewer_false_alarms_on_autocorrelated_noise():
    cube = ar1_noise_cube(300, 1, 200, phi=0.6, seed=11)
    naive = np.mean([trend_test(cube[:, 0, i], "naive")["significant"] for i in range(200)])
    honest = np.mean([trend_test(cube[:, 0, i], "honest")["significant"] for i in range(200)])
    assert naive > 0.10          # plain test is fooled well above 5%
    assert honest < naive        # corrected test is fooled less


def test_noise_trap_naive_flags_more_than_honest():
    res = noise_trap(n_time=240, ny=12, nx=12, phi=0.5, spatial_sigma=2.0, seed=0)
    assert res["naive_fraction"] > res["honest_fraction"]
    assert res["slope"].shape == (12, 12)


def test_analyze_series_shape():
    n = 288
    dates = monthly_dates(n)
    rng = np.random.default_rng(0)
    vals = 30 + 3 * np.sin(2 * np.pi * np.arange(n) / 12) + 0.003 * np.arange(n) + rng.normal(0, 0.3, n)
    out = analyze_series(dates, vals)
    assert set(out) >= {"anomalies", "naive", "honest", "noise", "years_to_detect", "record_years"}
    assert len(out["anomalies"]) == n
    assert out["honest"]["direction"] == "rising"
    # Already detectable, so no extra years are needed.
    assert out["years_more_needed"] == 0.0


def test_years_more_needed_when_not_yet_significant():
    n = 240
    rng = np.random.default_rng(4)
    vals = 0.0005 * np.arange(n) + rng.normal(0, 1.0, n)  # tiny trend in big noise
    out = analyze_series(monthly_dates(n), vals)
    assert not out["honest"]["significant"]
    assert out["years_more_needed"] > 0
