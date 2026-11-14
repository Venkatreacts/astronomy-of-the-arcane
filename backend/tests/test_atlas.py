"""Global Trend Atlas: parser for the multi-variable POWER point payload, and the published files."""

import json
import pathlib
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

import build_atlas  # noqa: E402


def test_series_drops_annual_month_and_fill():
    dates, vals = build_atlas.series({"198101": 1.0, "198113": 9.0, "198102": -999.0, "198103": 3.0})
    assert dates == ["1981-01", "1981-02", "1981-03"]
    assert vals[0] == 1.0 and np.isnan(vals[1]) and vals[2] == 3.0


def test_published_atlas_is_consistent():
    out = BACKEND.parent / "web" / "public" / "data" / "atlas"
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert {v["id"] for v in index} == set(build_atlas.SCAN_VARS)
    for v in index:
        d = json.loads((out / f"{v['id']}.json").read_text(encoding="utf-8"))
        assert d["n_cells"] == len(d["cells"]) > 100
        # FDR can only remove trends the honest test found, never the reverse
        # p values are published rounded to 5 decimals, so allow that much
        assert all(c["p_honest"] <= d["fdr_threshold"] + 1e-5 or not c["honest"] for c in d["cells"])
