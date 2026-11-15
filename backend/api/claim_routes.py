"""Variable catalog, variable sweep at one place, and the headline check.

- GET  /api/catalog          the catalog (also shipped as web/public/data/catalog.json)
- GET  /api/suggest          3 to 5 variables for a place type and a theme
- GET  /api/sweep            every catalog variable at one point, three stages, BH at 10% across variables
- POST /api/claim/read       AI turns a sentence into {variable, place, start_year, end_year, direction} (passcode)
- POST /api/claim/check      code runs the tests on a (possibly corrected) claim; one of four fixed verdicts
"""

from __future__ import annotations

import os
from functools import lru_cache

import requests
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from api.agent_routes import NOT_SET_UP, require_passcode
from trendlab.claims import ClaimError, check_claim, extract_claim
from trendlab.sweep import PLACE_TYPES, THEMES, catalog, fetch_point_many, suggest, sweep

router = APIRouter(prefix="/api", tags=["investigate"])


def _clean(o):
    from api.main import clean
    return clean(o)


@router.get("/catalog")
def get_catalog():
    return catalog()


@router.get("/suggest")
def get_suggest(place_type: str = Query(..., pattern="^(" + "|".join(PLACE_TYPES) + ")$"),
                theme: str = Query("any", pattern="^(any|" + "|".join(THEMES) + ")$")):
    return [{k: v[k] for k in ("id", "name", "units", "definition")} for v in suggest(place_type, theme)]


@lru_cache(maxsize=64)
def _sweep(lat: float, lon: float) -> dict:
    cat = catalog()
    return _clean(sweep(fetch_point_many(lat, lon, [v["id"] for v in cat]), cat))


@router.get("/sweep")
def get_sweep(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    try:
        return {"lat": round(lat, 2), "lon": round(lon, 2), **_sweep(round(lat, 2), round(lon, 2))}
    except requests.RequestException as exc:
        raise HTTPException(502, f"NASA POWER request failed: {exc}") from exc


class ClaimText(BaseModel):
    text: str = Field(..., min_length=8, max_length=400)


class Claim(BaseModel):
    variable: str = Field(..., max_length=100)
    place: str = Field(..., max_length=100)
    start_year: int
    end_year: int
    direction: str
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


@router.post("/claim/read")
def claim_read(body: ClaimText, x_demo_passcode: str = Header("")):
    require_passcode(x_demo_passcode)
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(503, NOT_SET_UP)
    try:
        return extract_claim(body.text)
    except ClaimError as exc:
        raise HTTPException(422, f"The AI could not turn this into a testable claim ({exc}). Try rephrasing it, "
                                 "for example: Chennai is getting hotter since 1990.") from exc
    except requests.HTTPError as exc:
        code = exc.response.status_code
        if code == 429:
            raise HTTPException(429, "Too many questions right now. Try again in a minute.") from exc
        raise HTTPException(502, f"AI service error ({code}).") from exc
    except requests.RequestException as exc:
        raise HTTPException(502, "Could not reach the AI service.") from exc


@router.post("/claim/check")
def claim_check(c: Claim):
    try:
        return _clean(check_claim(c.model_dump(), round(c.lat, 2), round(c.lon, 2)))
    except requests.RequestException as exc:
        raise HTTPException(502, f"NASA POWER request failed: {exc}") from exc
