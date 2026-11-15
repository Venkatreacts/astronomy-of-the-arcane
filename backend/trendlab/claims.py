"""Headline check: the AI only turns a sentence into a small JSON object; code runs the tests and picks the verdict.

1. extract_claim(): Gemini returns {variable, place, start_year, end_year, direction}. The reply is checked
   against SCHEMA; an invalid reply is rejected and the model is asked once more, then we give up.
2. The student sees the extraction and can correct it (and the place is turned into coordinates).
3. check_claim(): fetches NASA POWER, runs the same three stages over the claimed years, and returns one of
   four fixed verdicts. No causal statement is ever made.
"""

from __future__ import annotations

import json
import math
import os
from typing import Callable

from .explore import FIRST_YEAR, LAST_YEAR, explore
from .sweep import catalog, fetch_point_many

SUPPORTED = "Supported by the data"
NOT_YET = "Not proven yet"
OTHER_WAY = "The data point the other way"
CANNOT = "This tool cannot test that claim"
VERDICTS = (SUPPORTED, NOT_YET, OTHER_WAY, CANNOT)
DIRECTIONS = ("up", "down")

# What the model must return. Checked by validate_claim, not trusted.
SCHEMA = {
    "type": "object",
    "properties": {
        "variable": {"type": "string", "description": "a catalog id, or NONE if no catalog variable fits"},
        "place": {"type": "string"},
        "start_year": {"type": "integer"},
        "end_year": {"type": "integer"},
        "direction": {"type": "string", "enum": list(DIRECTIONS)},
    },
    "required": ["variable", "place", "start_year", "end_year", "direction"],
}


class ClaimError(ValueError):
    """The model's reply could not be used."""


def validate_claim(obj) -> dict:
    """The extracted claim, or ClaimError naming what is wrong. variable may be outside the catalog (that is a
    valid reading of a claim the tool cannot test); everything else must match SCHEMA exactly."""
    if not isinstance(obj, dict):
        raise ClaimError("reply is not a JSON object")
    keys = set(SCHEMA["required"])
    if set(obj) != keys:
        raise ClaimError(f"keys must be exactly {sorted(keys)}, got {sorted(obj)}")
    for k in ("variable", "place", "direction"):
        if not isinstance(obj[k], str) or not obj[k].strip() or len(obj[k]) > 100:
            raise ClaimError(f"{k} must be a non-empty string")
    for k in ("start_year", "end_year"):
        if isinstance(obj[k], bool) or not isinstance(obj[k], int):
            raise ClaimError(f"{k} must be a whole number")
        if not FIRST_YEAR <= obj[k] <= LAST_YEAR:
            raise ClaimError(f"{k} must be between {FIRST_YEAR} and {LAST_YEAR}")
    if obj["start_year"] > obj["end_year"]:
        raise ClaimError("start_year is after end_year")
    if obj["direction"] not in DIRECTIONS:
        raise ClaimError(f"direction must be one of {DIRECTIONS}")
    return {**obj, "variable": obj["variable"].strip().upper(), "place": obj["place"].strip()}


def prompt(cat: list[dict]) -> str:
    lines = "\n".join(f"- {v['id']}: {v['name']} ({v['units']}). {v['definition']}" for v in cat)
    return (
        "Turn the user's claim about weather or climate into one JSON object and nothing else, with exactly these keys:\n"
        '{"variable": "<catalog id>", "place": "<place name>", "start_year": <int>, "end_year": <int>, '
        '"direction": "up" | "down"}\n'
        f"Years must be between {FIRST_YEAR} and {LAST_YEAR}; if the claim gives no years use {FIRST_YEAR} and "
        f"{LAST_YEAR}; 'since 2000' means 2000 to {LAST_YEAR}. direction is up for hotter, wetter, windier, more, "
        "rising; down for cooler, drier, calmer, less, falling. If no catalog variable measures what the claim is "
        'about, use "NONE" as the variable. Do not explain, do not judge the claim.\n\nCatalog:\n' + lines)


def extract_claim(text: str, post: Callable | None = None, tries: int = 2) -> dict:
    """The claim as a validated dict. Raises ClaimError when the model's replies stay invalid."""
    if post is None:
        import requests
        post = requests.post
    from .agent import GEMINI_MODEL, GEMINI_URL
    model = os.environ.get("GEMINI_MODEL", GEMINI_MODEL)
    contents = [{"role": "user", "parts": [{"text": text}]}]
    reason = "no reply"
    for _ in range(tries):
        r = post(GEMINI_URL.format(model=model), timeout=40,
                 headers={"x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")},
                 json={"system_instruction": {"parts": [{"text": prompt(catalog())}]}, "contents": contents,
                       "generationConfig": {"temperature": 0, "maxOutputTokens": 2048,
                                            "responseMimeType": "application/json", "responseSchema": SCHEMA}})
        r.raise_for_status()
        parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts", [])
        reply = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
        try:
            return {**validate_claim(json.loads(reply)), "model": model}
        except (json.JSONDecodeError, ClaimError) as exc:
            reason = str(exc)
            contents += [{"role": "model", "parts": [{"text": reply or "(empty)"}]},
                         {"role": "user", "parts": [{"text": f"That reply was invalid: {reason}. Reply again with only "
                                                             "the JSON object, exactly the five keys."}]}]
    raise ClaimError(reason)


def check_claim(claim: dict, lat: float, lon: float, fetch: Callable = fetch_point_many) -> dict:
    """Run the tests on the claimed variable, place and years. Code picks the verdict, never the model."""
    try:
        c = validate_claim({k: claim.get(k) for k in SCHEMA["required"]})
    except ClaimError as exc:
        return {"verdict": CANNOT, "reason": f"The claim is incomplete: {exc}."}
    cat = {v["id"]: v for v in catalog()}
    v = cat.get(c["variable"])
    if v is None:
        return {"verdict": CANNOT, "claim": c,
                "reason": "None of the NASA POWER variables in our catalog measures this, so the tool cannot test it."}
    if c["end_year"] - c["start_year"] + 1 < 5:
        return {"verdict": CANNOT, "claim": c, "reason": "A trend needs at least 5 years of data; choose a longer span."}
    s = fetch(lat, lon, [v["id"]]).get(v["id"])
    if not s:
        return {"verdict": CANNOT, "claim": c, "reason": "NASA POWER returned no data for this place and variable."}
    try:
        r = explore(s["dates"], [math.nan if x is None else x for x in s["values"]], c["start_year"], c["end_year"])
    except ValueError as exc:
        return {"verdict": CANNOT, "claim": c, "reason": f"Not enough data to test: {exc}"}
    h = r["stages"]["honest"]
    rising = h["slope_per_year"] > 0
    claimed_up = c["direction"] == "up"
    more = r["stages"]["years_more_needed"]
    if h["significant"] and rising == claimed_up:
        verdict, label = SUPPORTED, SUPPORTED
    elif h["significant"]:
        verdict, label = OTHER_WAY, OTHER_WAY
    else:
        verdict = NOT_YET
        label = f"{NOT_YET} (about {max(1, math.ceil(more))} more years)" if more is not None and math.isfinite(more) else NOT_YET
    return {"verdict": verdict, "label": label, "claim": c, "lat": lat, "lon": lon,
            "variable": {k: v[k] for k in ("id", "name", "units", "definition", "giovanni")},
            "result": {"frame": r["frame"], "rate_per_decade": h["slope_per_year"] * 10,
                       "rate_ci_per_decade": [x * 10 for x in h["slope_ci_per_year"]],
                       "p_usual": r["stages"]["naive"]["p"], "usual": r["stages"]["naive"]["significant"],
                       "p_honest": h["p"], "honest": h["significant"], "years_more_needed": more,
                       "rule": "single place: stickiness-removed Mann-Kendall at p < 0.05"}}
