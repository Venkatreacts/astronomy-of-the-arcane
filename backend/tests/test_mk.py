"""The shared Mann-Kendall core against an independent reference (pymannkendall) and hand cases."""

import numpy as np
import pymannkendall as mk
import pytest

from trendlab.mk import lag1, mk_test, prewhiten
from trendlab.stats import ar1_noise_cube, noise_params, trend_test


def series(seed, n=300, phi=0.4, trend=0.0):
    x = ar1_noise_cube(n, 1, 1, phi=phi, seed=seed)[:, 0, 0]
    return x + trend * np.arange(n)


@pytest.mark.parametrize("seed", range(6))
def test_matches_pymannkendall_on_complete_series(seed):
    x = series(seed, trend=0.002 * (seed % 3))
    ours_plain = trend_test(x, "naive")
    ours_pw = trend_test(x, "honest")
    assert ours_plain["p"] == pytest.approx(mk.original_test(x).p, abs=1e-10)
    assert ours_pw["p"] == pytest.approx(mk.pre_whitening_modification_test(x).p, abs=1e-10)


def test_tie_correction_matches_reference_on_heavily_tied_data():
    # Rainfall in a dry place: many months exactly zero. Ties shrink var(S) and change p.
    rng = np.random.default_rng(3)
    x = np.where(rng.random(240) < 0.6, 0.0, np.round(rng.gamma(1.0, 2.0, 240), 1))
    x[120:] += np.where(x[120:] > 0, 0.4, 0.0)
    ref = mk.original_test(x)
    ours = mk_test(x)
    assert ours["var"][0] == pytest.approx(ref.var_s, rel=1e-12)
    assert ours["p"][0] == pytest.approx(ref.p, abs=1e-12)
    n = x.size
    assert ours["var"][0] < n * (n - 1) * (2 * n + 5) / 18  # the correction is applied


def test_hand_computed_case():
    # 1, 2, 2, 3: pairs (1,2)+ (1,2)+ (1,3)+ (2,2)0 (2,3)+ (2,3)+ -> S = 5; one tie group of 2
    out = mk_test(np.array([1.0, 2.0, 2.0, 3.0]))
    assert out["s"][0] == 5
    assert out["var"][0] == pytest.approx((4 * 3 * 13 - 2 * 1 * 9) / 18)


def test_vectorized_columns_equal_one_at_a_time():
    cube = ar1_noise_cube(200, 1, 8, phi=0.5, seed=9)[:, 0, :]
    cube[5:30, 2] = np.nan
    together = mk_test(prewhiten(cube))["p"]
    alone = [mk_test(prewhiten(cube[:, j]))["p"][0] for j in range(8)]
    assert np.allclose(together, alone)


def test_missing_months_are_not_zero_filled():
    # A gap filled with zeros would put a block of "normal" months into a strongly trending series.
    x = 0.01 * np.arange(300) + series(4, phi=0.0) * 0.1
    gap = x.copy()
    gap[100:160] = np.nan
    filled = x.copy()
    filled[100:160] = 0.0
    p_gap = trend_test(gap, "naive")["p"]
    assert p_gap < 1e-10
    assert trend_test(filled, "naive")["z"] < trend_test(gap, "naive")["z"]
    assert trend_test(gap, "naive")["n"] == 240


def test_lag1_uses_only_consecutive_present_months():
    x = series(5, n=4000, phi=0.6)
    holes = x.copy()
    holes[np.random.default_rng(0).random(x.size) < 0.3] = np.nan
    # Closing the gaps would pair months that are not neighbours and bias phi toward 0.
    closed = holes[np.isfinite(holes)]
    assert lag1(holes)[0] == pytest.approx(0.6, abs=0.05)
    assert lag1(closed)[0] < 0.55  # about 0.51: months two apart get paired as neighbours
    assert noise_params(holes)["phi"] == pytest.approx(0.6, abs=0.05)


@pytest.mark.parametrize("phi", [0.0, 0.3, 0.6, 0.85])
def test_lag1_estimate_is_unbiased_enough_for_monthly_records(phi):
    # 45 years of months: the estimator's small-sample bias (about -(1 + 4 phi) / n) is < 0.01.
    est = [noise_params(series(100 + k, n=540, phi=phi))["phi"] for k in range(60)]
    assert np.mean(est) == pytest.approx(phi, abs=0.03)
