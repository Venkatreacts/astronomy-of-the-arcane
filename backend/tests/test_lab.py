import numpy as np
import pytest

from trendlab.lab import experiment, score, simulate_map, summarize


def test_score_counts_against_the_truth():
    truth = np.array([[True, True, False, False]])
    flags = np.array([[True, False, True, False]])
    s = score(flags, truth)
    assert s["power"] == 0.5 and s["false_alarm"] == 0.5 and s["fdp"] == 0.5 and s["any_false"] == 1.0


def test_pure_noise_has_no_power_and_every_flag_is_false():
    res = experiment(years=20, phi=0.5, trend=0.0, spatial=2.0, missing=0.0, reps=3, ny=10, nx=10)
    for m in ("naive", "pw", "fdr"):
        assert res["methods"][m]["power"] is None          # no real trend exists: power undefined
    # sticky noise: usual test fooled well above 5%, pre-whitened near 5%
    assert res["methods"]["naive"]["false_alarm"]["mean"] > 2 * res["methods"]["pw"]["false_alarm"]["mean"]
    assert res["methods"]["pw"]["false_alarm"]["mean"] < 0.10


def test_positive_control_three_methods_ordered_sensibly():
    res = experiment(years=30, phi=0.3, trend=0.8, spatial=2.0, missing=0.0, reps=3, ny=10, nx=10)
    m = res["methods"]
    assert m["pw"]["power"]["mean"] > 0.9
    assert m["fdr"]["false_alarm"]["mean"] <= m["pw"]["false_alarm"]["mean"] <= m["naive"]["false_alarm"]["mean"]
    assert m["fdr"]["miss"]["mean"] == pytest.approx(1 - m["fdr"]["power"]["mean"])


def test_missing_months_are_handled():
    res = simulate_map(20, 0.3, 0.8, 0.0, 0.2, seed=3, ny=6, nx=6)
    assert res["pw"][:, :3].mean() > 0.8  # still finds the trend with 20% of months gone


def test_simulations_are_reproducible():
    a = experiment(15, 0.5, 0.4, 0.0, 0.0, reps=2, seed0=42, ny=6, nx=6)
    b = experiment(15, 0.5, 0.4, 0.0, 0.0, reps=2, seed0=42, ny=6, nx=6)
    assert a == b


def test_interval_contains_mean_and_stays_in_range():
    s = summarize([0.0, 0.1, 0.05, 0.2])
    assert 0 <= s["lo"] <= s["mean"] <= s["hi"] <= 1
