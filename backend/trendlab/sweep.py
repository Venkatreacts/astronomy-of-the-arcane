"""Variable catalog, suggestions by place type and theme, and the variable sweep for one place.

The sweep runs the same three stages (analyze_series) on every catalog variable at a point, then applies
Benjamini-Hochberg at 10% across the variables tested, because testing many variables at one place is a
multiple-testing problem of its own.
"""

from __future__ import annotations

import json
import pathlib
from typing import Callable

import numpy as np
import requests

from .stats import analyze_series, fdr_bh

CATALOG_PATH = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "catalog.json"
POWER_POINT = "https://power.larc.nasa.gov/api/temporal/monthly/point"
MAX_PARAMS = 20          # NASA POWER point requests take up to 20 parameters at once
TEST_POINT = {"name": "Chennai", "lat": 13.08, "lon": 80.27}
PLACE_TYPES = ("coast", "farm", "city", "forest", "desert", "mountain", "snow")
THEMES = ("heat", "water", "air", "wind", "sunlight")
SWEEP_Q = 0.10


def catalog() -> list[dict]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["variables"]


def suggest(place_type: str, theme: str = "any", k: int = 5, cat: list[dict] | None = None) -> list[dict]:
    """3 to k catalog variables for a place type and a theme: variables tagged with both first, then the theme,
    then the place type, in catalog order."""
    cat = catalog() if cat is None else cat
    def score(v):
        return 2 * (theme == "any" or theme in v["themes"]) + (place_type in v["places"])
    ranked = sorted((v for v in cat if score(v) > 0), key=lambda v: -score(v))
    picked = [v for v in ranked if score(v) >= 2][:k]
    for v in ranked:
        if len(picked) >= 3:
            break
        if v not in picked:
            picked.append(v)
    return picked


def fetch_point_many(lat: float, lon: float, ids: list[str], start: int = 1981, end: int = 2025,
                     get: Callable = requests.get) -> dict:
    """Monthly series for many variables at one point, MAX_PARAMS per request. {id: {dates, values}}."""
    out = {}
    for i in range(0, len(ids), MAX_PARAMS):
        chunk = ids[i:i + MAX_PARAMS]
        r = get(POWER_POINT, params={"parameters": ",".join(chunk), "community": "RE", "latitude": lat,
                                     "longitude": lon, "start": start, "end": end, "format": "JSON"}, timeout=120)
        r.raise_for_status()
        params = r.json()["properties"]["parameter"]
        for vid in chunk:
            raw = params.get(vid)
            if not raw:
                continue
            keys = sorted(k for k in raw if not k.endswith("13"))
            out[vid] = {"dates": [f"{k[:4]}-{k[4:]}" for k in keys],
                        "values": [None if raw[k] is None or raw[k] <= -998 else float(raw[k]) for k in keys]}
    return out


def yearly_spread(anomalies) -> float:
    """Standard deviation of the yearly means of the monthly anomalies (years with at least 9 months)."""
    a = np.array([np.nan if v is None else v for v in anomalies], dtype=float)
    years = [a[k:k + 12] for k in range(0, a.size - a.size % 12, 12)]
    means = [np.nanmean(y) for y in years if np.isfinite(y).sum() >= 9]
    return float(np.std(means, ddof=1)) if len(means) > 2 else float("nan")


def sweep(series: dict, cat: list[dict] | None = None, alpha: float = 0.05) -> dict:
    """Three stages for every variable, then Benjamini-Hochberg (q = 0.10) across the variables tested.
    Rows are sorted by |rate per decade| / year-to-year spread (a signal-to-noise size)."""
    cat = catalog() if cat is None else cat
    rows = []
    for v in cat:
        s = series.get(v["id"])
        if not s:
            continue
        try:
            a = analyze_series(s["dates"], [np.nan if x is None else x for x in s["values"]], alpha)
        except ValueError:
            continue
        slope = a["honest"]["slope_per_year"]
        spread = yearly_spread(a["anomalies"])
        rows.append({"id": v["id"], "name": v["name"], "definition": v["definition"], "units": v["units"],
                     "giovanni": v.get("giovanni"),
                     "direction": "rising" if slope > 0 else "falling" if slope < 0 else "flat",
                     "rate_per_decade": slope * 10, "rate_ci_per_decade": [c * 10 for c in a["honest"]["slope_ci_per_year"]],
                     "p_usual": a["naive"]["p"], "usual": a["naive"]["significant"],
                     "p_honest": a["honest"]["p"], "honest": a["honest"]["significant"],
                     "phi": a["noise"]["phi"], "years_more_needed": a["years_more_needed"],
                     "spread": spread,
                     # change per decade in units of the year-to-year spread (signal to noise)
                     "size": abs(slope * 10) / spread if spread and np.isfinite(spread) and spread > 0 else 0.0,
                     # first and last month with data (haze starts later than the rest)
                     "first": next(d for d, x in zip(s["dates"], s["values"]) if x is not None),
                     "last": next(d for d, x in zip(reversed(s["dates"]), reversed(s["values"])) if x is not None)})
    mask, threshold = fdr_bh(np.array([r["p_honest"] for r in rows]), SWEEP_Q)
    for r, m in zip(rows, mask):
        r["survives"] = bool(m)
    rows.sort(key=lambda r: -r["size"])
    strongest = next((r["id"] for r in rows if r["survives"]), None)
    return {"n_tested": len(rows), "expected_by_chance": round(alpha * len(rows), 2), "q": SWEEP_Q,
            "threshold": threshold, "strongest": strongest, "rows": rows}
