"""API tests (FastAPI TestClient) and data parser tests. No network: NASA calls are replaced."""

import pathlib
import sys

import numpy as np
from fastapi.testclient import TestClient

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "data"))

import api.main as m  # noqa: E402

client = TestClient(m.app)


def fake_series(n=300, slope_per_month=0.01, seed=0):
    rng = np.random.default_rng(seed)
    vals = slope_per_month * np.arange(n) + rng.normal(0, 0.3, n)
    return {"name": "Air temperature at 2 m", "units": "degC", "source": "test",
            "dates": [f"{1981 + k // 12}-{k % 12 + 1:02d}" for k in range(n)], "values": [float(v) for v in vals]}


def test_noise_endpoint_serves_the_prebuilt_map_fast():
    import json
    import time
    path = BACKEND.parent / "web" / "public" / "data" / "noise" / "phi0.5_trend0.0.json"
    t = time.perf_counter()
    r = client.get("/api/noise-trap?phi=0.5&size=40&seed=12345")  # old heavy params are ignored now
    assert time.perf_counter() - t < 1.0  # audit #3: computing one live took 15-58 s
    assert r.status_code == 200 and r.json() == json.loads(path.read_text(encoding="utf-8"))


def test_noise_endpoint_serves_the_positive_control():
    assert client.get("/api/noise-trap?phi=0.5&trend=0.3").status_code == 400
    d = client.get("/api/noise-trap?phi=0.5&trend=0.8").json()
    assert d["honest_left_fraction"] > 0.8 and d["honest_right_fraction"] < 0.2


def test_static_cases_match_the_index_and_current_engine():
    import json
    out = BACKEND.parent / "web" / "public" / "data" / "cases"
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index, "run python scripts/build_static.py --cases-only"
    for c in index:
        d = json.loads((out / f"{c['id']}.json").read_text(encoding="utf-8"))
        for s in d.get("series", []):
            assert "slope_ci_per_year" in s["analysis"]["honest"]  # re-analysed with the current engine


def test_params_return_a_definition_when_the_data_session_adds_one(monkeypatch):
    monkeypatch.setattr(m, "PARAMS", {
        "RH2M": ("Relative humidity at 2 m", "%", "How much water vapour the air holds, as a percent of the most it could hold."),
        "T2M": ("Air temperature at 2 m", "degC")})  # old two-entry form still works
    out = {p["id"]: p for p in client.get("/api/params").json()}
    assert out["RH2M"]["definition"].startswith("How much water vapour")
    assert out["T2M"]["definition"] is None


def test_point_errors_are_not_all_blamed_on_nasa(monkeypatch):
    # Audit #6: NASA POWER failures -> 502; our own analysis failing (too few months) -> 400.
    import requests

    def nasa_down(*a, **k):
        raise requests.ConnectionError("boom")
    m._point.cache_clear()
    monkeypatch.setattr(m, "get_monthly_point", nasa_down)
    assert client.get("/api/point?lat=10&lon=10&param=T2M").status_code == 502

    m._point.cache_clear()
    monkeypatch.setattr(m, "get_monthly_point", lambda *a, **k: fake_series(n=12))
    r = client.get("/api/point?lat=11&lon=11&param=T2M")
    assert r.status_code == 400 and "24 monthly values" in r.json()["detail"]


# ---- Audit #7: the two data parsers and a case-file call (parsers are only read, not edited, here)

class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def test_power_parser_drops_annual_month_and_fill_values(monkeypatch):
    import fetch_power
    payload = {"properties": {"parameter": {"T2M": {
        "198101": 25.0, "198102": -999.0, "198103": 27.5, "198113": 26.0}}}}
    monkeypatch.setattr(fetch_power.requests, "get", lambda *a, **k: FakeResponse(payload))
    s = fetch_power.get_monthly_point(13.0, 80.0, "T2M", 1981, 1981)
    assert s["dates"] == ["1981-01", "1981-02", "1981-03"]  # month "13" (annual) dropped
    assert s["values"] == [25.0, None, 27.5]                  # -999 fill -> None
    assert s["units"] == "degC"


def test_giovanni_csv_parser_skips_header_and_fill(tmp_path):
    import build_cases
    p = tmp_path / "giovanni.csv"
    p.write_text("\n".join([
        "Title:,Area-averaged time series",
        "Fill Value (mean_OMNO2d):,-1.26765e+30",
        "",
        "time,mean_OMNO2d_004_ColumnAmountNO2TropCloudScreened",
        "2005-01-01 00:00:00,3.1e15",
        "2005-01-02 00:00:00,-1.26765e+30",
        "2005-02-01 00:00:00,2.9e15",
    ]), encoding="utf-8")
    rows = build_cases.read_giovanni_csv(p)
    assert len(rows) == 3, "header line not found: check it is exactly 'time,...'"
    assert rows[0] == ("2005-01-01", 3.1e15) and rows[2] == ("2005-02-01", 2.9e15)
    assert np.isnan(rows[1][1])  # fill value becomes NaN


def test_case_file_endpoint_and_path_tricks():
    r = client.get("/api/cases/chennai")
    assert r.status_code == 200 and r.json()["series"][0]["dates"][0] == "1981-01"
    assert client.get("/api/cases/..%2F..%2Fapi%2Fmain").status_code == 404
    assert client.get("/api/cases/nope").status_code == 404


def test_point_returns_the_confidence_interval(monkeypatch):
    m._point.cache_clear()
    monkeypatch.setattr(m, "get_monthly_point", lambda *a, **k: fake_series())
    r = client.get("/api/point?lat=10&lon=10&param=T2M")
    assert r.status_code == 200
    for method in ("naive", "honest"):
        lo, hi = r.json()["analysis"][method]["slope_ci_per_year"]
        assert lo < r.json()["analysis"][method]["slope_per_year"] < hi
