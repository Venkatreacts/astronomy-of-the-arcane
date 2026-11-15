"""Noise Trap API.

Run from backend/:  uvicorn api.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import math
import os
import pathlib
import sys
from functools import lru_cache

import numpy as np
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "data"))

from fetch_power import PARAMS, get_monthly_point  # noqa: E402
from trendlab import analyze_series  # noqa: E402
from trendlab.explore import FIRST_YEAR, LAST_YEAR, explore  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

CASES = BACKEND / "data" / "cases"

from api.scan_routes import router as scan_router  # noqa: E402
from api.agent_routes import router as agent_router  # noqa: E402
from api.claim_routes import router as claim_router  # noqa: E402
from api import mcp_server  # noqa: E402

app = FastAPI(title="Noise Trap API", version="0.1.0", lifespan=mcp_server.lifespan)
# Browsers may call the API only from our own web app. ALLOWED_ORIGINS is a comma-separated list (the Vercel URL).
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])
app.include_router(scan_router)
app.include_router(agent_router)
app.include_router(claim_router)
# MCP connector for other apps and AI assistants: POST https://<server>/mcp
app.router.add_route("/mcp", mcp_server.asgi, methods=["GET", "POST", "DELETE"])


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
    # The third entry of each PARAMS item is a one-line plain definition (older two-entry items still work).
    return [{"id": k, "name": v[0], "units": v[1], "definition": v[2] if len(v) > 2 else None}
            for k, v in PARAMS.items()]


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
    except requests.RequestException as exc:  # NASA POWER unreachable or returned an error
        raise HTTPException(502, f"NASA POWER request failed: {exc}") from exc
    except ValueError as exc:  # our own analysis, e.g. too few usable months
        raise HTTPException(400, f"Cannot analyse this place: {exc}") from exc


class Series(BaseModel):
    dates: list[str] = Field(..., min_length=24, max_length=1200)
    values: list[float | None] = Field(..., min_length=24, max_length=1200)
    start: int = Field(FIRST_YEAR, ge=FIRST_YEAR, le=LAST_YEAR)
    end: int = Field(LAST_YEAR, ge=FIRST_YEAR, le=LAST_YEAR)
    season: str = "all"


@app.post("/api/explore")
def explore_series(s: Series):
    """Time frame, season, classroom t-test and provable year for a monthly series the page already has
    (a live point, an atlas point or a region average). Same engine as /api/point."""
    if len(s.dates) != len(s.values) or not all(len(d) == 7 and d[4] == "-" for d in s.dates):
        raise HTTPException(400, "dates must be YYYY-MM, one per value")
    vals = [np.nan if v is None else v for v in s.values]
    try:
        return clean(explore(s.dates, vals, s.start, s.end, s.season))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


NOISE = BACKEND.parent / "web" / "public" / "data" / "noise"


@app.get("/api/noise-trap")
def noise(phi: float = Query(0.5, ge=0.0, le=0.9), trend: float = Query(0.0)):
    """Serves the maps pre-computed by scripts/build_static.py (audit #3: computing one live took 15-58 s).
    trend = 0.8 is the positive control (real trend on the left half). The web app reads the same files."""
    if trend not in (0.0, 0.8):
        raise HTTPException(400, "trend must be 0 or 0.8")
    path = NOISE / f"phi{round(phi, 1):.1f}_trend{trend:.1f}.json"
    if not path.is_file():
        raise HTTPException(404, "Noise maps not built yet: run python scripts/build_static.py")
    return json.loads(path.read_text(encoding="utf-8"))

