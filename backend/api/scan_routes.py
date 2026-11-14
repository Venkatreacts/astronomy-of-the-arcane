"""Region Scanner endpoints. Results are cached in data/scans/ so demo regions load instantly."""

from __future__ import annotations

import json
import math
import pathlib
import threading

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from trendlab.regimes import compound_patterns, findings, trend_regimes
from trendlab.scan import SCAN_VARS, scan_key, scan_region, validate_bbox

SCANS = pathlib.Path(__file__).resolve().parents[1] / "data" / "scans"
router = APIRouter(prefix="/api/scan", tags=["scan"])
_lock = threading.Lock()

PRESETS = [
    {"id": "tamilnadu", "name": "Tamil Nadu & Cauvery delta", "bbox": [9.5, 13.5, 77.0, 81.0]},
    {"id": "punjab", "name": "Punjab-Haryana farm belt", "bbox": [28.5, 32.5, 73.5, 77.5]},
    {"id": "westernghats", "name": "Kerala & Western Ghats", "bbox": [8.5, 12.5, 74.5, 78.5]},
]

CAVEATS = [
    "NASA POWER here is MERRA-2-based reanalysis at about 0.5 degrees: a model constrained by observations, not a direct measurement.",
    "Reanalysis can contain sudden jumps when the satellites feeding it change; a trend can partly be such a jump, especially for wind.",
    "Linear trends only. Clusters show where change is stronger than chance, not why it happened.",
]


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return _clean(o.tolist())
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not math.isfinite(float(o)) else float(o)
    return o


def run_scan(bbox, perms: int = 199) -> dict:
    bbox = validate_bbox(bbox)
    variables = list(SCAN_VARS)
    key = scan_key(bbox, variables, 1981, 2025, perms)
    path = SCANS / f"{key}.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    with _lock:  # one heavy scan at a time
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
        res = scan_region(bbox, variables, n_perm=perms)
        reg = trend_regimes(res)
        comp = compound_patterns(res)
        out = _clean({**res, "regimes": reg, "compounds": comp, "findings": findings(res, reg, comp),
                      "caveats": CAVEATS})
        SCANS.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out), encoding="utf-8")
        return out


@router.get("/presets")
def presets():
    return PRESETS


@router.get("")
def scan(lat_min: float = Query(..., ge=-90, le=90), lat_max: float = Query(..., ge=-90, le=90),
         lon_min: float = Query(..., ge=-180, le=180), lon_max: float = Query(..., ge=-180, le=180),
         perms: int = Query(199, ge=19, le=499)):
    try:
        return run_scan((lat_min, lat_max, lon_min, lon_max), perms)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # NASA POWER outages, timeouts
        raise HTTPException(502, f"Scan failed: {exc}") from exc
