"""build_insights: emergence ratio and year on planted series, zero on a constant series, compound counts."""

import json
import math
import pathlib
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
import build_insights as bi  # noqa: E402


def test_planted_series_gives_the_expected_ratio_and_year():
    years = list(range(1981, 2021))                       # 40 years
    noise = np.array([0.5, -0.5] * 20)                    # alternating, median 0
    means = 0.1 * np.arange(40) + 3.0 + noise             # trend 0.1 per year on an offset
    e = bi.emergence(years, list(means), 0.1)
    sd = 0.5 * math.sqrt(40 / 39)                         # std (ddof=1) of +-0.5 about 0
    assert math.isclose(e["noise"], sd, rel_tol=1e-12)
    assert math.isclose(e["ratio"], 0.1 * 40 / sd, rel_tol=1e-12)
    # trend line reaches 2 x noise after ceil(2 sd / 0.1) = 11 years: 1981 counts as the first
    assert e["year"] == 1981 + math.ceil(2 * sd / 0.1) - 1 == 1991
    assert bi.label(e["ratio"]) == "unknown"


def test_falling_series_uses_the_size_of_the_change():
    years = list(range(2000, 2010))
    e = bi.emergence(years, [-0.2 * k + (0.05 if k % 2 else -0.05) for k in range(10)], -0.2)
    assert e["ratio"] > 3 and e["year"] is not None


def test_constant_series_gives_ratio_zero():
    e = bi.emergence(list(range(1981, 2026)), [1.5] * 45, 0.0)
    assert e["ratio"] == 0 and e["year"] is None
    assert bi.label(0.0) == "within the old normal"


def test_yearly_means_use_the_published_normals_and_skip_thin_years():
    clim = [float(m) for m in range(12)]
    values = [m + 1.0 for m in range(12)] + [m + 2.0 for m in range(12)] + [5.0] * 3 + [None] * 9
    years, means = bi.yearly_means("1990-01", values, clim)
    assert years == [1990, 1991] and means == [1.0, 2.0]


def test_compound_counts_equal_a_brute_force_count():
    atlases = {v: json.loads((bi.ATLAS / f"{v}.json").read_text(encoding="utf-8")) for v in bi.VARS}
    got = {p["id"]: p for p in bi.compound(atlases)["presets"]}
    for p in bi.PRESETS:
        (va, sa), (vb, sb) = p["a"], p["b"]
        tested = lit = 0
        for ca in atlases[va]["cells"]:
            for cb in atlases[vb]["cells"]:
                if ca["lat"] == cb["lat"] and ca["lon"] == cb["lon"]:
                    tested += 1
                    lit += ca["honest"] and cb["honest"] and (ca["rate"] > 0) == (sa > 0) and (cb["rate"] > 0) == (sb > 0) \
                        and ca["rate"] != 0 and cb["rate"] != 0
        assert (got[p["id"]]["tested"], got[p["id"]]["lit"]) == (tested, lit)


def test_written_files_equal_a_fresh_build():
    for v in bi.VARS:
        assert json.loads((bi.ATLAS / f"insights_{v}.json").read_text(encoding="utf-8")) == json.loads(json.dumps(bi.insights(v)))
    atlases = {v: json.loads((bi.ATLAS / f"{v}.json").read_text(encoding="utf-8")) for v in bi.VARS}
    assert json.loads((bi.ATLAS / "insights_COMPOUND.json").read_text(encoding="utf-8")) == json.loads(json.dumps(bi.compound(atlases)))
