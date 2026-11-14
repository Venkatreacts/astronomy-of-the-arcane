"""Noise Trap API.

Run from backend/:  uvicorn api.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import math
import pathlib
import sys
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "data"))

from fetch_power import PARAMS, get_monthly_point  # noqa: E402
from trendlab import analyze_series, noise_trap  # noqa: E402

CASES = BACKEND / "data" / "cases"

app = FastAPI(title="Noise Trap API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def clean(o):
    """Make numpy / NaN / inf safe for JSON."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not math.isfinite(float(o)) else float(o)
    return o


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/params")
def params():
    return [{"id": k, "name": v[0], "units": v[1]} for k, v in PARAMS.items()]


@app.get("/api/cases")
def list_cases():
    out = []
    for p in sorted(CASES.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out.append({"id": d.get("id", p.stem), "title": d.get("title", p.stem)})
    return out


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    p = CASES / f"{case_id}.json"
    if not p.is_file() or p.parent != CASES:
        raise HTTPException(404, "Unknown case")
    return json.loads(p.read_text(encoding="utf-8"))


@lru_cache(maxsize=256)
def _point(lat: float, lon: float, param: str, start: int, end: int) -> dict:
    series = get_monthly_point(lat, lon, param, start, end)
    vals = [np.nan if v is None else v for v in series["values"]]
    return clean({**series, "analysis": analyze_series(series["dates"], vals)})


@app.get("/api/point")
def point(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
          param: str = "T2M", start: int = Query(1981, ge=1981), end: int = Query(2025, le=2026)):
    if param not in PARAMS:
        raise HTTPException(400, f"param must be one of {sorted(PARAMS)}")
    if end - start < 4:
        raise HTTPException(400, "Need at least 5 years.")
    try:
        return _point(round(lat, 2), round(lon, 2), param, start, end)
    except Exception as exc:  # upstream NASA POWER errors
        raise HTTPException(502, f"NASA POWER request failed: {exc}") from exc


@lru_cache(maxsize=64)
def _noise(phi: float, size: int, years: int, spatial: float, seed: int) -> dict:
    res = noise_trap(n_time=years * 12, ny=size, nx=size, phi=phi, spatial_sigma=spatial, seed=seed)
    out = {k: res[k] for k in ("slope", "naive_fraction", "honest_fraction", "fdr_threshold", "params")}
    # Plotly heatmaps need numbers, not booleans.
    out["naive_mask"] = res["naive_mask"].astype(int)
    out["honest_mask"] = res["honest_mask"].astype(int)
    return clean(out)


@app.get("/api/noise-trap")
def noise(phi: float = Query(0.5, ge=0.0, le=0.9), size: int = Query(20, ge=8, le=40),
          years: int = Query(25, ge=5, le=40), spatial: float = Query(2.0, ge=0.0, le=5.0),
          seed: int = 0):
    # A full map takes ~10 s, so results are cached per setting (same seed = same map).
    return _noise(round(phi, 1), size, years, round(spatial, 1), seed)


@app.on_event("startup")
def warm_cache() -> None:
    """Precompute the demo maps in the background so the first click is instant."""
    import threading

    def work():
        for phi in (0.5, 0.3, 0.7, 0.0, 0.9, 0.1, 0.2, 0.4, 0.6, 0.8):
            _noise(phi, 20, 25, 2.0, 0)

    threading.Thread(target=work, daemon=True).start()
