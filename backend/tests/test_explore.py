"""Time frame, seasons, region average, classroom t-test and provable year (trendlab/explore.py, /api/explore)."""

import pathlib
import sys

import numpy as np
from fastapi.testclient import TestClient
from scipy.stats import linregress

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import api.main as m  # noqa: E402
from trendlab.explore import area_mean, area_mean_points, explore, ols_trend, season_means  # noqa: E402

client = TestClient(m.app)
DATES = [f"{y}-{mo:02d}" for y in range(1981, 2026) for mo in range(1, 13)]


def series(trend_per_year=0.0, months=range(1, 13), sd=0.3, seed=1, after=1981):
    rng = np.random.default_rng(seed)
    x = rng.normal(0, sd, len(DATES)) + 10 * np.sin(np.arange(len(DATES)) * 2 * np.pi / 12)
    for k, d in enumerate(DATES):
        y, mo = int(d[:4]), int(d[5:])
        if mo in months and y >= after:
            x[k] += trend_per_year * (y - after)
    return x


def test_summer_only_trend_found_in_jun_aug_not_dec_feb():
    # a moderate trend: on a near-noiseless line lag-1 pre-whitening removes the trend itself
    r = explore(DATES, series(0.01, months=(6, 7, 8), seed=1), season="JJA")
    rows = {row["season"]: row for row in r["seasons"]["rows"]}
    assert rows["JJA"]["honest"] and rows["JJA"]["rate_per_year"] > 0.005
    assert not rows["DJF"]["honest"] and not rows["DJF"]["pw"]
    assert r["stages"]["honest"]["significant"] and r["rule"] == "season"
    assert len(r["series"]["values"]) == 45  # one value per year


def test_dec_feb_uses_the_december_before():
    years, x = season_means(DATES, np.arange(len(DATES), dtype=float), "DJF")
    assert np.isnan(x[0])  # 1981 has no December 1980
    k = DATES.index("1982-01")
    assert x[years.index(1982)] == np.mean([k - 1, k, k + 1])


def test_shorter_time_frame_changes_the_result():
    x = series(0.01, seed=3)
    full = explore(DATES, x, 1981, 2025)
    short = explore(DATES, x, 2014, 2025)
    assert full["stages"]["honest"]["significant"]
    assert not short["stages"]["honest"]["significant"]
    assert short["frame"] == {"start": 2014, "end": 2025, "years": 12, "short": True}
    assert not full["frame"]["short"]
    assert len(short["series"]["dates"]) == 12 * 12


def test_region_average_of_constant_field_is_the_constant():
    cube = np.full((24, 5, 4), 7.25)
    cube[3, 1, 2] = np.nan
    cube[5] = np.nan  # a month with no data stays missing
    out = area_mean(cube, [-60, -10, 0, 30, 75])
    assert np.allclose(out[np.isfinite(out)], 7.25) and np.isnan(out[5]) and np.isfinite(out).sum() == 23
    assert np.allclose(area_mean_points(np.full((12, 6), -3.0), [0, 10, 20, 40, 60, 80]), -3.0)


def test_region_average_weights_by_cosine_latitude():
    cube = np.zeros((1, 2, 1))
    cube[0, 1, 0] = 1.0  # value 1 at 60 degrees, 0 at the equator
    assert np.isclose(area_mean(cube, [0, 60])[0], 0.5 / 1.5)


def test_ols_matches_numpy_and_scipy():
    rng = np.random.default_rng(7)
    t = np.arange(40, dtype=float)
    x = 0.12 * t + rng.normal(0, 1, 40)
    r = ols_trend(t, x)
    (slope, _), cov = np.polyfit(t, x, 1, cov="unscaled")
    resid = x - np.polyval([slope, _], t)
    se = np.sqrt(cov[0, 0] * (resid ** 2).sum() / (40 - 2))
    lr = linregress(t, x)
    assert np.isclose(r["slope_per_year"], slope) and np.isclose(r["se"], se)
    assert np.isclose(r["p"], lr.pvalue) and r["df"] == 38
    assert r["slope_ci_per_year"][0] < slope < r["slope_ci_per_year"][1]


def test_provable_year_is_first_year_that_stays_real():
    r = explore(DATES, series(0.03, seed=3), 1981, 2025)
    steps = r["provable"]["steps"]
    first = r["provable"]["first_year"]
    assert steps[0]["end"] == 1996 and steps[-1]["end"] == 2025
    assert first is not None and all(s["real"] for s in steps if s["end"] >= first)
    earlier = [s for s in steps if s["end"] == first - 1]
    assert not earlier or not earlier[0]["real"]


def test_not_provable_reports_years_needed():
    r = explore(DATES, series(0.0, seed=5), 1981, 2025)
    assert r["provable"]["first_year"] is None
    assert r["provable"]["years_more_needed"] is None or r["provable"]["years_more_needed"] >= 0


def test_all_months_frame_matches_point_analysis():
    x = series(0.02, seed=9)
    r = explore(DATES, x)
    a = m.analyze_series(DATES, x)
    assert np.isclose(r["stages"]["honest"]["p"], a["honest"]["p"])
    assert np.isclose(r["stages"]["naive"]["p"], a["naive"]["p"])


def test_explore_endpoint():
    x = [None if k == 30 else float(v) for k, v in enumerate(series(0.03, seed=3))]
    res = client.post("/api/explore", json={"dates": DATES, "values": x, "start": 1990, "end": 2025, "season": "SON"})
    assert res.status_code == 200
    body = res.json()
    assert body["frame"]["start"] == 1990 and body["season_name"] == "Sep–Nov"
    assert {"stages", "ols", "seasons", "provable", "series"} <= set(body)
    assert client.post("/api/explore", json={"dates": DATES, "values": x, "season": "winter"}).status_code == 400
    assert client.post("/api/explore", json={"dates": DATES, "values": x, "start": 2023, "end": 2025}).status_code == 400
    assert client.post("/api/explore", json={"dates": DATES[:-1], "values": x}).status_code == 400


def test_region_average_files_are_built():
    import json
    root = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "regions"
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    assert len(index) == 10 and index[-1]["id"] == "globe"
    for r in index:
        d = json.loads((root / f"{r['id']}.json").read_text(encoding="utf-8"))
        assert set(d["vars"]) == {"T2M", "PRECTOTCORR", "GWETROOT", "RH2M", "WS2M"}
        v = d["vars"]["T2M"]
        assert len(v["dates"]) == len(v["values"]) == 540 and v["points"] > 0
        assert {"stages", "ols", "seasons", "provable"} <= set(v["default"])
