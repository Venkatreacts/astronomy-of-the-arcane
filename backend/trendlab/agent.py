"""AI Detective: Claude answers a question by calling our tested analysis tools.

Design (docs/design/region-scanner.md):
- Claude never writes code; it can only call the fixed tools below.
- At most MAX_TOOL_CALLS tool calls per question; every call and result is returned as an evidence trail.
- The system prompt requires every number in the answer to come from a tool result.
"""

from __future__ import annotations

import json
import os
import pathlib
from typing import Any, Callable

MODEL = "claude-opus-5-5"
GEMINI_MODEL = "gemini-3.8-flash"  # override with env GEMINI_MODEL
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_TOOL_CALLS = 6
MAX_TURNS = 10
GEMINI_TURNS = 4  # each turn is one model call on a public demo
REPO = pathlib.Path(__file__).resolve().parents[2]

SYSTEM = """You are the Noise Trap Detective, helping high school and college students investigate trends in NASA Earth data.

Rules:
- Only state numbers that appear in a tool result in this conversation or in the Notes below. Never estimate or recall numbers yourself.
- Prefer the honest verdict (pre-whitened test, FDR, cluster permutation p-value) over the usual-method verdict, and explain the difference when they disagree.
- Never claim what caused a trend. You may say what is happening together and suggest what a scientist might check next.
- Say when the data cannot answer the question (wrong variable, box too large, not enough years), and what would help.
- Data comes from NASA POWER (MERRA-2-based reanalysis, about 0.5 degree pixels). Mention this limit once.
- Be brief: a short answer first (2-4 sentences), then up to 5 bullet points of evidence, then one "What to check next" line.
- Use at most 6 tool calls. Regional scans only cover the pre-scanned regions named in the scan_region tool."""


def system_prompt() -> str:
    """SYSTEM plus our own study notes and a summary of every saved result, so answers build on checked work."""
    parts = [SYSTEM]
    notes = REPO / "docs" / "detective-notes.md"
    if notes.is_file():
        parts.append("Notes (written and checked by the team):\n" + notes.read_text(encoding="utf-8"))
    data = REPO / "web" / "public" / "data"
    saved = []
    for path in sorted((data / "scans").glob("*.json")) + sorted((data / "cases").glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(d, dict):
            continue  # index.json is a list
        for line in d.get("findings", []):
            saved.append(f"- [{path.stem} region scan] {line}")
        for s in d.get("series", []):
            a = s["analysis"]
            saved.append(f"- [{d.get('title', path.stem)}] {s['name']}: {a['honest']['slope_per_year'] * 10:+.3g} "
                         f"{s['units']} per decade, usual test p = {a['naive']['p']:.3f}, "
                         f"honest test p = {a['honest']['p']:.3f}.")
    if saved:
        parts.append("Saved results from this project (NASA POWER, 1981-2025):\n" + "\n".join(saved))
    return "\n\n".join(parts)


def _tools_schema() -> list[dict]:
    def obj(props: dict, required: list[str]) -> dict:
        return {"type": "object", "properties": props, "required": required, "additionalProperties": False}

    num = {"type": "number"}
    return [
        {"name": "list_variables", "strict": True,
         "description": "List the NASA variables available for point analysis and for regional scans, with units.",
         "input_schema": obj({}, [])},
        {"name": "analyze_point", "strict": True,
         "description": ("Trend analysis of one variable at one place (monthly data since 1981): rate per decade, "
                         "usual-method verdict, honest (pre-whitened) verdict, and years until a trend would be detectable."),
         "input_schema": obj({"lat": num, "lon": num, "variable": {"type": "string",
                              "description": "Variable id from list_variables, e.g. T2M or PRECTOTCORR."}},
                             ["lat", "lon", "variable"])},
        {"name": "scan_region", "strict": True,
         "description": ("Scan a region across 5 NASA variables. Returns the number of tests, how many the usual method "
                         "calls significant, how many pass FDR, trend clusters that pass a 199-permutation test, compound "
                         "patterns, and k-means trend regimes. Only these pre-scanned regions exist; a box is snapped to "
                         "the one it overlaps most: " + _preset_list() + "."),
         "input_schema": obj({"lat_min": num, "lat_max": num, "lon_min": num, "lon_max": num},
                             ["lat_min", "lat_max", "lon_min", "lon_max"])},
        {"name": "noise_check", "strict": True,
         "description": ("Run both methods on a map of pure random noise with the given month-to-month stickiness (phi, 0-0.9). "
                         "Shows how often the usual method reports fake trends."),
         "input_schema": obj({"phi": num}, ["phi"])},
    ]


def _preset_list() -> str:
    from api.scan_routes import PRESETS
    return "; ".join(f"{p['name']} (lat {p['bbox'][0]} to {p['bbox'][1]}, lon {p['bbox'][2]} to {p['bbox'][3]})"
                     for p in PRESETS)


def default_executor() -> Callable[[str, dict], Any]:
    """Real tool implementations, imported lazily so tests can run without network access."""
    from api.scan_routes import run_scan, snap_to_preset
    from fetch_power import PARAMS, get_monthly_point  # backend/data on sys.path via api.main
    from trendlab import analyze_series, noise_trap
    from trendlab.scan import SCAN_VARS
    import numpy as np

    def run(name: str, args: dict) -> Any:
        if name == "list_variables":
            return {"point_variables": {k: f"{v[0]} ({v[1]})" for k, v in PARAMS.items()},
                    "scan_variables": {k: f"{v[0]} ({v[1]})" for k, v in SCAN_VARS.items()}}
        if name == "analyze_point":
            s = get_monthly_point(float(args["lat"]), float(args["lon"]), args["variable"], 1981, 2025)
            a = analyze_series(s["dates"], [np.nan if v is None else v for v in s["values"]])
            return {"variable": s["name"], "units": s["units"], "period": [s["dates"][0], s["dates"][-1]],
                    "usual_method": {k: a["naive"][k] for k in ("slope_per_year", "p", "direction")},
                    "honest_method": {k: a["honest"][k] for k in ("slope_per_year", "p", "direction")},
                    "month_to_month_stickiness_phi": a["noise"]["phi"],
                    "years_of_data": a["record_years"], "more_years_needed_to_detect": a["years_more_needed"]}
        if name == "scan_region":
            # a new box takes about a minute, so the detective only reads the pre-scanned regions
            preset = snap_to_preset((args["lat_min"], args["lat_max"], args["lon_min"], args["lon_max"]))
            if preset is None:
                raise ValueError("No pre-scanned region overlaps this box. Available: " + _preset_list())
            r = run_scan(preset["bbox"])
            clusters = [{"variable": info["name"], **{k: c[k] for k in ("direction", "size", "p", "center_lat",
                                                                         "center_lon", "mean_rate_per_decade")},
                         "units": info["units"]}
                        for info in r["variables"].values() for c in info["clusters"] if c["significant"]]
            return {"region": preset["name"], "box": preset["bbox"], "summary": r["summary"],
                    "significant_clusters": clusters,
                    "compound_patterns": [c["text"] for c in r["compounds"][:5]],
                    "regimes": [{"label": g["label"], "pixels": g["pixels"]} for g in r["regimes"]["regimes"]],
                    "findings": r["findings"], "caveats": r["caveats"]}
        if name == "noise_check":
            phi = round(min(max(float(args["phi"]), 0.0), 0.9), 1)
            static = (pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "noise"
                      / f"phi{phi:.1f}_trend0.0.json")
            res = (json.loads(static.read_text(encoding="utf-8")) if static.is_file()
                   else noise_trap(n_time=300, ny=20, nx=20, phi=phi, seed=0))  # same map, computed (~15 s)
            return {"phi": phi, "pixels": 400, "usual_method_fake_trend_share": res["naive_fraction"],
                    "honest_method_fake_trend_share": res["honest_fraction"]}
        raise ValueError(f"Unknown tool {name}")

    return run


def load_env_file(path: pathlib.Path) -> None:
    """Read KEY=VALUE lines from backend/.env (never committed) without overriding real env vars."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _summarise(result: Any, limit: int = 600) -> str:
    text = json.dumps(result, default=str)
    return text if len(text) <= limit else text[:limit] + " ..."


def ask(question: str, client=None, executor: Callable[[str, dict], Any] | None = None) -> dict:
    """Run the detective loop. Returns {answer, trace, stop_reason, model}."""
    if client is None:
        import anthropic
        client = anthropic.Anthropic(timeout=40, max_retries=1)
    executor = executor or default_executor()
    messages: list[dict] = [{"role": "user", "content": question}]
    trace: list[dict] = []
    calls = 0
    response = None

    for _ in range(MAX_TURNS):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=system_prompt(),
            tools=_tools_schema(),
            messages=messages,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # if Opus declines, the API retries on a fallback model in the same call
        )
        if response.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": response.content})
            continue
        if response.stop_reason != "tool_use":
            break
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            calls += 1
            if calls > MAX_TOOL_CALLS:
                out, is_error = {"error": "Tool budget used up. Answer now with the evidence you have."}, True
            else:
                try:
                    out, is_error = executor(block.name, dict(block.input)), False
                except Exception as exc:  # report tool failures to the model instead of crashing
                    out, is_error = {"error": str(exc)}, True
            trace.append({"tool": block.name, "input": dict(block.input), "ok": not is_error,
                          "result": out})
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": json.dumps(out, default=str), "is_error": is_error})
        messages.append({"role": "user", "content": results})

    if response is None:
        return {"answer": "", "trace": trace, "stop_reason": "no_response", "model": MODEL}
    if response.stop_reason == "refusal":
        answer = "The model declined to answer this question. Try rephrasing it as a question about NASA data."
    elif response.stop_reason == "max_tokens":
        answer = "The answer was cut off. Try a narrower question."
    else:
        answer = "\n".join(b.text for b in response.content if b.type == "text").strip()
    return {"answer": answer, "trace": [{**t, "result_preview": _summarise(t["result"])} for t in trace],
            "stop_reason": response.stop_reason, "model": getattr(response, "model", MODEL)}


def _gemini_tools() -> list[dict]:
    """The same four tools as Gemini function declarations (it rejects additionalProperties and empty objects)."""
    out = []
    for t in _tools_schema():
        fn = {"name": t["name"], "description": t["description"]}
        if t["input_schema"]["properties"]:
            fn["parameters"] = {k: v for k, v in t["input_schema"].items() if k != "additionalProperties"}
        out.append(fn)
    return [{"function_declarations": out}]


def ask_gemini(question: str, post=None, executor: Callable[[str, dict], Any] | None = None) -> dict:
    """Same loop and return shape as ask(), on the Gemini API. Needs GEMINI_API_KEY."""
    if post is None:
        import requests
        post = requests.post
    executor = executor or default_executor()
    model = os.environ.get("GEMINI_MODEL", GEMINI_MODEL)
    contents: list[dict] = [{"role": "user", "parts": [{"text": question}]}]
    trace: list[dict] = []
    calls = 0
    answer, stop = "", "max_turns"

    for _ in range(GEMINI_TURNS):
        r = post(GEMINI_URL.format(model=model), timeout=40,
                 headers={"x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")},
                 json={"system_instruction": {"parts": [{"text": system_prompt()}]}, "contents": contents,
                       "tools": _gemini_tools(), "generationConfig": {"maxOutputTokens": 4000, "temperature": 0.2}})
        r.raise_for_status()
        candidates = r.json().get("candidates") or [{}]
        content = candidates[0].get("content") or {"role": "model", "parts": []}
        stop = candidates[0].get("finishReason", "no_response")
        parts = content.get("parts", [])
        answer = "\n".join(p["text"] for p in parts if "text" in p and not p.get("thought")).strip()
        fn_calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not fn_calls:
            break
        contents.append(content)  # sent back unchanged: Gemini needs its own thought signatures returned
        results = []
        for fc in fn_calls:
            calls += 1
            args = dict(fc.get("args") or {})
            if calls > MAX_TOOL_CALLS:
                out, ok = {"error": "Tool budget used up. Answer now with the evidence you have."}, False
            else:
                try:
                    out, ok = executor(fc["name"], args), True
                except Exception as exc:  # report tool failures to the model instead of crashing
                    out, ok = {"error": str(exc)}, False
            trace.append({"tool": fc["name"], "input": args, "ok": ok, "result": out})
            reply = {"name": fc["name"], "response": json.loads(json.dumps({"result": out}, default=str))}
            if "id" in fc:
                reply["id"] = fc["id"]
            results.append({"functionResponse": reply})
        contents.append({"role": "user", "parts": results})

    if not answer:
        answer = "The detective could not finish this question. Try a narrower one."
    return {"answer": answer, "trace": [{**t, "result_preview": _summarise(t["result"])} for t in trace],
            "stop_reason": stop, "model": model}
