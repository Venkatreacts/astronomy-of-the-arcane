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
MAX_TOOL_CALLS = 6
MAX_TURNS = 10

SYSTEM = """You are the Noise Trap Detective, helping high school and college students investigate trends in NASA Earth data.

Rules:
- Only state numbers that appear in a tool result in this conversation. Never estimate or recall numbers yourself.
- Prefer the honest verdict (pre-whitened test, FDR, cluster permutation p-value) over the usual-method verdict, and explain the difference when they disagree.
- Never claim what caused a trend. You may say what is happening together and suggest what a scientist might check next.
- Say when the data cannot answer the question (wrong variable, box too large, not enough years), and what would help.
- Data comes from NASA POWER (MERRA-2-based reanalysis, about 0.5 degree pixels). Mention this limit once.
- Be brief: a short answer first (2-4 sentences), then up to 5 bullet points of evidence, then one "What to check next" line.
- Use at most 6 tool calls. Regional scans need boxes with sides of 2 to 5 degrees."""


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
         "description": ("Scan a box (sides 2-5 degrees) across 5 NASA variables. Returns the number of tests, how many the "
                         "usual method calls significant, how many survive FDR, trend clusters that pass a 199-permutation "
                         "test, compound patterns, and k-means trend regimes. New boxes take about 30 seconds."),
         "input_schema": obj({"lat_min": num, "lat_max": num, "lon_min": num, "lon_max": num},
                             ["lat_min", "lat_max", "lon_min", "lon_max"])},
        {"name": "noise_check", "strict": True,
         "description": ("Run both methods on a map of pure random noise with the given month-to-month stickiness (phi, 0-0.9). "
                         "Shows how often the usual method reports fake trends."),
         "input_schema": obj({"phi": num}, ["phi"])},
    ]


def default_executor() -> Callable[[str, dict], Any]:
    """Real tool implementations, imported lazily so tests can run without network access."""
    from api.scan_routes import run_scan
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
            r = run_scan((args["lat_min"], args["lat_max"], args["lon_min"], args["lon_max"]))
            clusters = [{"variable": info["name"], **{k: c[k] for k in ("direction", "size", "p", "center_lat",
                                                                         "center_lon", "mean_rate_per_decade")},
                         "units": info["units"]}
                        for info in r["variables"].values() for c in info["clusters"] if c["significant"]]
            return {"summary": r["summary"], "significant_clusters": clusters,
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
        client = anthropic.Anthropic()
    executor = executor or default_executor()
    messages: list[dict] = [{"role": "user", "content": question}]
    trace: list[dict] = []
    calls = 0
    response = None

    for _ in range(MAX_TURNS):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
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
