"""Checks on the pre-computed files the web app serves offline: every displayed number must be reproducible
from them, and none may be NaN, mis-shaped or inconsistent with its own summary."""

import json
import math
import pathlib
import random

import numpy as np
import pytest

DATA = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data"
VARS = ["T2M", "PRECTOTCORR", "GWETROOT", "RH2M", "WS2M"]


def load(*p):
    return json.loads(DATA.joinpath(*p).read_text(encoding="utf-8"))


SCANS = [p["id"] for p in load("scans", "index.json")]


def test_nine_regional_presets_are_published():
    assert len(SCANS) == 9


@pytest.mark.parametrize("rid", SCANS)
def test_scan_file_is_consistent(rid):
    d = load("scans", f"{rid}.json")
    ny, nx = len(d["lats"]), len(d["lons"])
    s = d["summary"]
    assert list(d["variables"]) == VARS
    naive = pw = fdr = tested = 0
    for v in d["variables"].values():
        valid = np.array(v["valid"], dtype=bool)
        assert valid.shape == (ny, nx)
        for key in ("z", "rate_per_decade", "p_naive", "p_prewhitened"):
            grid = np.array(v[key], dtype=float)  # None -> nan
            assert grid.shape == (ny, nx)
            assert np.isfinite(grid[valid]).all(), f"{key}: tested pixel without a value"
            assert np.isnan(grid[~valid]).all(), f"{key}: untested pixel drawn with a value"
        for key in ("naive_mask", "prewhitened_mask", "fdr_mask"):
            m = np.array(v[key], dtype=bool)
            assert not (m & ~valid).any()
        p_pw = np.array(v["p_prewhitened"], dtype=float)
        assert np.array_equal(np.array(v["prewhitened_mask"], dtype=bool), valid & (np.nan_to_num(p_pw, nan=1) < 0.05))
        naive += int(np.array(v["naive_mask"], dtype=bool).sum())
        pw += int(np.array(v["prewhitened_mask"], dtype=bool).sum())
        fdr += int(np.array(v["fdr_mask"], dtype=bool).sum())
        tested += int(valid.sum())
        for c in v["clusters"]:
            assert c["significant"] == (c["p"] < 0.05)
    assert (s["naive_hits"], s["prewhitened_hits"], s["fdr_hits"], s["n_tests"]) == (naive, pw, fdr, tested)
    assert s["significant_clusters"] == sum(c["significant"] for v in d["variables"].values() for c in v["clusters"])


@pytest.mark.parametrize("var", VARS)
def test_atlas_file_is_consistent(var):
    d = load("atlas", f"{var}.json")
    cells = d["cells"]
    assert d["n_cells"] == len(cells) and len({(c["lat"], c["lon"]) for c in cells}) == len(cells)
    for key in ("naive", "pw", "honest"):
        frac = {"naive": "naive_fraction", "pw": "pw_fraction", "honest": "honest_fraction"}[key]
        assert d[frac] == pytest.approx(sum(c[key] for c in cells) / len(cells))
    for c in cells:
        assert c["naive"] == (c["p_naive"] < 0.05) and c["pw"] == (c["p_honest"] < 0.05)
        assert c["honest"] <= (c["p_honest"] <= d["fdr_threshold"] * (1 + 1e-3))  # p published to 4 significant digits
        assert c["rate_lo"] <= c["rate"] <= c["rate_hi"]
        assert 0.8 <= c["coverage"] <= 1 and -1 < c["phi"] < 1
    index = {v["id"]: v for v in load("atlas", "index.json")}
    assert index[var]["honest_fraction"] == pytest.approx(d["honest_fraction"])


def test_point_files_match_the_atlas():
    atlas = {v: {(c["lat"], c["lon"]): c for c in load("atlas", f"{v}.json")["cells"]} for v in VARS}
    names = sorted(p.name for p in (DATA / "cells").glob("*.json"))
    assert len(names) == len(atlas["T2M"])
    for name in random.Random(0).sample(names, 40):
        cell = load("cells", name)
        for var, v in cell["vars"].items():
            a = atlas[var][(cell["lat"], cell["lon"])]
            assert (v["rate"], v["p_honest"], v["fdr"]) == (a["rate"], a["p_honest"], a["honest"])
            assert len(v["values"]) == v["months"] == 540 and len(v["clim"]) == 12
            assert sum(x is not None for x in v["values"]) == v["n"]


def test_lab_covers_its_grid_and_rates_are_valid():
    lab = load("lab", "lab.json")
    g = lab["grid"]
    assert len(lab["experiments"]) == math.prod(len(v) for v in g.values())
    for e in lab["experiments"]:
        for m in e["methods"].values():
            assert len(m["example"]) == 400
            for key in ("false_alarm", "power", "fdp"):
                s = m.get(key)
                if s:
                    assert 0 <= s["lo"] <= s["mean"] <= s["hi"] <= 1
            assert (m["power"] is None) == (e["params"]["trend"] == 0)
