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


def test_point_returns_the_confidence_interval(monkeypatch):
    m._point.cache_clear()
    monkeypatch.setattr(m, "get_monthly_point", lambda *a, **k: fake_series())
    r = client.get("/api/point?lat=10&lon=10&param=T2M")
    assert r.status_code == 200
    for method in ("naive", "honest"):
        lo, hi = r.json()["analysis"][method]["slope_ci_per_year"]
        assert lo < r.json()["analysis"][method]["slope_per_year"] < hi
