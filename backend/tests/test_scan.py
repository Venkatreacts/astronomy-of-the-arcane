import numpy as np
import pymannkendall as mk
import pytest
from scipy.stats import norm

from trendlab.regimes import compound_patterns, findings, trend_regimes
from trendlab.scan import mk_z, parse_power_regional, prewhiten, scan_cubes, validate_bbox
from trendlab.stats import ar1_noise_cube


def dates(n, start=1981):
    return [f"{start + k // 12}-{k % 12 + 1:02d}" for k in range(n)]


def as_data(cubes):
    n, ny, nx = next(iter(cubes.values())).shape
    lats = list(np.arange(ny) * 0.5 + 8.0)
    lons = list(np.arange(nx) * 0.625 + 76.0)
    return {v: {"dates": dates(n), "lats": lats, "lons": lons, "cube": c} for v, c in cubes.items()}


def test_vectorized_test_matches_pymannkendall_prewhitening():
    rng = np.random.default_rng(0)
    cube = ar1_noise_cube(300, 1, 6, phi=0.4, seed=1)[:, 0, :]
    cube[:, 0] += 0.004 * np.arange(300)  # one series with a trend
    p_ours = 2 * norm.sf(np.abs(mk_z(prewhiten(cube))))
    p_ref = np.array([mk.pre_whitening_modification_test(cube[:, i]).p for i in range(cube.shape[1])])
    assert np.allclose(p_ours, p_ref, atol=0.01)
    assert rng is not None


def test_parse_power_regional_handles_annual_and_fill_values():
    def feat(lon, lat, vals):
        return {"geometry": {"coordinates": [lon, lat, 0]},
                "properties": {"parameter": {"T2M": vals}}}
    vals = {"198101": 1.0, "198102": -999.0, "198113": 5.0}
    payload = {"features": [feat(76.0, 8.0, vals), feat(76.625, 8.0, vals),
                            feat(76.0, 8.5, vals), feat(76.625, 8.5, vals)]}
    out = parse_power_regional(payload, "T2M")
    assert out["dates"] == ["1981-01", "1981-02"]
    assert out["cube"].shape == (2, 2, 2)
    assert np.isnan(out["cube"][1]).all() and (out["cube"][0] == 1.0).all()


def test_parse_power_regional_reports_api_errors():
    with pytest.raises(RuntimeError):
        parse_power_regional({"messages": ["A maximum of 1 parameters"]}, "T2M")


def test_bbox_limits():
    assert validate_bbox((8, 13, 76, 81)) == (8.0, 13.0, 76.0, 81.0)
    with pytest.raises(ValueError):
        validate_bbox((8, 20, 76, 81))
    with pytest.raises(ValueError):
        validate_bbox((13, 8, 76, 81))


def test_noise_rarely_produces_significant_clusters():
    hits = 0
    for rep in range(12):
        cube = ar1_noise_cube(240, 10, 10, phi=0.4, spatial_sigma=1.5, seed=100 + rep)
        res = scan_cubes(as_data({"T2M": cube}), n_perm=49, seed=rep)
        hits += res["summary"]["significant_clusters"] > 0
    assert hits <= 3  # expected about 5% of 12 scans


def test_planted_regional_trend_is_found():
    cube = ar1_noise_cube(300, 10, 10, phi=0.3, spatial_sigma=1.0, seed=7)
    cube[:, 2:6, 3:7] += (0.8 / 120.0) * np.arange(300)[:, None, None]  # 0.8 SD per decade
    res = scan_cubes(as_data({"T2M": cube}), n_perm=99)
    sig = [c for c in res["variables"]["T2M"]["clusters"] if c["significant"]]
    assert sig, "planted trend not found"
    best = sig[0]
    inside = sum(1 for a, b in best["pixels"] if 2 <= a < 6 and 3 <= b < 7)
    assert best["direction"] == "rising" and inside >= 10
    assert res["summary"]["naive_hits"] >= res["summary"]["fdr_hits"]


def test_regimes_and_findings_on_two_part_map():
    n = 240
    t = np.arange(n)[:, None, None] / 120.0
    a = ar1_noise_cube(n, 10, 10, phi=0.2, seed=3)
    b = ar1_noise_cube(n, 10, 10, phi=0.2, seed=4)
    a[:, :, :5] += 1.5 * t     # west warming
    b[:, :, :5] -= 1.5 * t     # west soil drying
    a[:, :, 5:] -= 1.5 * t     # east cooling
    b[:, :, 5:] += 1.5 * t     # east soil wetter
    scan = scan_cubes(as_data({"T2M": a, "GWETROOT": b}), n_perm=49)
    reg = trend_regimes(scan)
    assert reg["k"] == 2 and reg["silhouette"] > 0.5
    labels = {r["label"] for r in reg["regimes"]}
    assert any("warming" in l and "drying soil" in l for l in labels)
    comps = compound_patterns(scan)
    assert comps and comps[0]["overlap_pixels"] >= 3
    text = findings(scan, reg, comps)
    assert "trend tests run" in text[0] and any("Compound pattern" in t for t in text)
