"""Giovanni case files, the second-witness pairs and the opposite-direction pairs match a fresh analysis."""

import json
import math
import pathlib
import sys

import numpy as np
import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
import build_witness as bw  # noqa: E402

WEB = BACKEND.parent / "web" / "public" / "data"


def roundtrip(o):
    return json.loads(json.dumps(bw.clean(o)))


def same(a, b, path="$"):
    """Equal JSON, floats to 1e-9 relative (the same code on the same input)."""
    if isinstance(a, float) or isinstance(b, float):
        assert a is not None and b is not None and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12), (path, a, b)
    elif isinstance(a, dict):
        assert set(a) == set(b), (path, set(a) ^ set(b))
        for k in a:
            same(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        assert len(a) == len(b), (path, len(a), len(b))
        for k, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{path}[{k}]")
    else:
        assert a == b, (path, a, b)


def need(*files):
    for f in files:
        if not f.is_file():
            pytest.skip(f"{f.name} not in backend/data/raw")


def test_wisconsin_case_equals_fresh_analysis_of_its_csv():
    need(bw.FILES["wi_modis"])
    fresh = roundtrip(bw.wisconsin_case())
    for path in (BACKEND / "data" / "cases" / "wisconsin.json", WEB / "cases" / "wisconsin.json"):
        same(json.loads(path.read_text(encoding="utf-8")), fresh, path.name)


def test_wisconsin_case_has_three_stages_for_all_months_summer_and_winter():
    d = json.loads((WEB / "cases" / "wisconsin.json").read_text(encoding="utf-8"))
    s = d["series"][0]
    assert set(s["seasons"]) == {"all", "JJA", "DJF"}
    for r in s["seasons"].values():
        assert {"naive", "pw", "honest"} <= set(r["stages"])
    assert s["seasons"]["JJA"]["rule"] == "season" and s["seasons"]["all"]["rule"] == "place"
    assert s["source"].startswith("Satellite: MODIS on Aqua") and "MYD08_M3_6_1" in s["source"]
    assert {"id": "wisconsin", "title": "Wildfire smoke over Wisconsin"} in json.loads(
        (WEB / "cases" / "index.json").read_text(encoding="utf-8"))


def test_witness_file_equals_fresh_analysis():
    need(bw.FILES["wi_modis"], bw.FILES["wi_merra2"], bw.FILES["tn_gpm"])
    stored = json.loads((WEB / "witness.json").read_text(encoding="utf-8"))
    cache = [bw.RAW / f"PRECTOTCORR_{b[0]}_{b[1]}_{b[2]}_{b[3]}_{bw.TN_YEARS[0]}_{bw.TN_YEARS[1]}.json" for b in bw.TN_BOXES]
    power_dir = BACKEND / "data" / "raw" / "power_region"
    if all((power_dir / c.name).is_file() for c in cache):
        same(stored, roundtrip(bw.witness()))
    # without the POWER cache: every side's numbers still equal a fresh analysis of the stored series
    for p in stored["pairs"]:
        for k in "ab":
            s = p[k]
            same({x: s[x] for x in s if x not in ("dates", "values")},
                 roundtrip({x: v for x, v in bw.side(s["short"], s["name"], s["units"], s["kind"], s["source"],
                                                      s["dates"], s["values"]).items() if x not in ("dates", "values")}))


def test_model_data_is_never_labelled_satellite():
    stored = json.loads((WEB / "witness.json").read_text(encoding="utf-8"))
    for p in stored["pairs"]:
        for s in (p["a"], p["b"]):
            is_model = "MERRA-2" in s["short"]
            assert (s["kind"] == "model") == is_model
            assert s["source"].startswith("Model") == is_model
            assert ("satellite" in s["source"].lower()) != is_model
    assert bw.kind_of("M2TMNXAER_5_12_4_TOTEXTTAU") == "model"
    assert bw.kind_of("mean_MYD08_M3_6_1_Deep_Blue_Aerosol_Optical_Depth_550_Land_Mean_Mean") == "satellite"


def test_badge_needs_same_direction_and_same_honest_verdict():
    a = {"direction": "rising", "honest": True, "kind": "satellite"}
    assert bw.badge(a, {**a, "kind": "model"})[0] == "agree"
    assert bw.badge(a, {**a, "kind": "model", "honest": False})[0] == "disagree"
    tag, sentence = bw.badge(a, {**a, "kind": "model", "direction": "falling"})
    assert tag == "disagree" and "because" not in sentence and "caused" not in sentence


def test_common_months_only():
    dates, x, y = bw.common(["2000-01", "2000-02", "2000-03", "2000-04"], [1.0, None, 3.0, 4.0],
                            ["2000-02", "2000-03", "2000-04", "2000-05"], [2.0, 3.0, None, 5.0])
    assert dates == ["2000-03"] and x == [3.0] and y == [3.0]
    dates, x, y = bw.common(["2000-01", "2000-02", "2000-03"], [1.0, None, 3.0], ["2000-01", "2000-02", "2000-03"], [1.0, 2.0, 3.0])
    assert dates == ["2000-01", "2000-02", "2000-03"] and x == [1.0, None, 3.0] and y == [1.0, None, 3.0]


def test_fill_value_from_the_header_is_dropped(tmp_path):
    f = tmp_path / "g.csv"
    f.write_text('Title:,"Time Series, Area-Averaged of Test (monthly)"\nUser Bounding Box:,"1,2,3,4"\n'
                 'Fill Value (mean_X):, -9999\n\ntime, mean_X\n2001-01-01 00:00:00,0.5\n'
                 '2001-02-01 00:00:00,-9999\n2001-03-01 00:00:00,0.7\n', encoding="utf-8")
    dates, vals, meta = bw.giovanni_series(f)
    assert meta["field"] == "mean_X" and meta["fill"] == -9999
    assert dates == ["2001-01", "2001-02", "2001-03"] and vals == [0.5, None, 0.7]


def test_opposites_equal_fresh_pairs_and_both_pass():
    stored = json.loads((WEB / "opposites.json").read_text(encoding="utf-8"))
    same(stored, roundtrip(bw.opposites()))
    for v in stored["variables"]:
        for side, sign in (("rising", 1), ("falling", -1)):
            c = v[side]
            if c is not None:
                assert c["honest"] and np.sign(c["rate"]) == sign
