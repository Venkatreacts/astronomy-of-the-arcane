"""AI Detective: an AI model (Gemini or Claude) answers a question by calling our tested analysis tools.

Design (docs/design/region-scanner.md):
- The model never writes code; it can only call the fixed tools below.
- At most MAX_TOOL_CALLS tool calls per question; every call and result is returned as an evidence trail.
- The system prompt requires every number in the answer to come from a tool result, and check_numbers()
  verifies that afterwards: any number in the answer that no tool returned is listed as unverified.
- Most tools read the pre-computed offline data (atlas points, regional scans, simulation lab), so the
  detective works without NASA access; only analyze_point fetches live data.
- Region scans are limited to the nine pre-computed regions: a new box takes about a minute, too slow and
  too costly for a public demo.
- docs/detective-notes.md (the team's checked notes on the methods) is added to the system prompt.
"""

from __future__ import annotations

import json
import math
import os
import pathlib
import re
from typing import Any, Callable

MODEL = "claude-opus-5-5"
GEMINI_MODEL = "gemini-3.8-flash"  # override with env GEMINI_MODEL
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_TOOL_CALLS = 8
MAX_TURNS = 12
GEMINI_TURNS = 6  # model calls per question on the Gemini path
MAX_HISTORY = 4  # earlier question/answer pairs sent with a follow-up
NOTES = pathlib.Path(__file__).resolve().parents[2] / "docs" / "detective-notes.md"

SYSTEM = """You are the Noise Trap Detective, helping students and the public investigate trends in NASA Earth data.

Rules:
- Only state numbers that appear in a tool result in this conversation or in the team's notes below. Never estimate
  or recall numbers yourself. Every number in your answer is checked against these and flagged if it cannot be traced.
- There are three stages of evidence. Usual test: Mann-Kendall p < 0.05. Stickiness removed: the same test after
  lag-1 pre-whitening, p < 0.05. Honest: stickiness removed plus false-discovery control across many places at once
  (maps and the atlas only). A region "cluster" is a separate test: a patch of change larger than on time-shuffled
  maps. Say which stage or test a claim rests on, and explain disagreements (usually month-to-month stickiness).
- Never claim what caused a trend. You may say what changes together and suggest what a scientist might check next.
- Say when the data cannot answer the question (wrong variable, box too large, not enough years), and what would help.
- Data comes from NASA POWER (MERRA-2-based reanalysis). Atlas values are point samples every 5 degrees, not area
  averages; regional scans use the roughly 0.5-degree grid. Mention the relevant limit once.
- Prefer the offline tools (atlas_point, atlas_overview, list_regions, scan_region, compare_regions, simulation_lab)
  when they can answer; analyze_point fetches live data and is slower.
- Structure: a short answer first (2-4 sentences); then "Evidence:" with up to 6 bullets, each naming the tool it came
  from; then "Uncertainty:" in one or two sentences; then one "What to check next" line.
- Use at most 8 tool calls. Regional scans cover only the regions from list_regions."""


def _tools_schema() -> list[dict]:
    def obj(props: dict, required: list[str]) -> dict:
        return {"type": "object", "properties": props, "required": required, "additionalProperties": False}

    num = {"type": "number"}
    return [
        {"name": "list_variables", "strict": True,
         "description": "List the NASA variables available for point analysis and for regional scans, with units.",
         "input_schema": obj({}, [])},
        {"name": "atlas_point", "strict": True,
         "description": ("Offline. The Global Trend Atlas sample point nearest to lat/lon (one point every 5 degrees, "
                         "1981-2025): for all five variables, the rate per decade with its 95% range, the usual-test p, "
                         "the stickiness-removed p, the honest verdict after false-discovery control across all points, "
                         "stickiness phi, years still needed, and the trend in each half of the record."),
         "input_schema": obj({"lat": num, "lon": num}, ["lat", "lon"])},
        {"name": "atlas_overview", "strict": True,
         "description": "Offline. For each atlas variable, the share of sampled points with a trend at each of the three stages.",
         "input_schema": obj({}, [])},
        {"name": "analyze_point", "strict": True,
         "description": ("Live NASA data. Trend analysis of one variable at exact coordinates (monthly since 1981): rate "
                         "per decade with 95% range, usual verdict, stickiness-removed verdict, years until detectable."),
         "input_schema": obj({"lat": num, "lon": num, "variable": {"type": "string",
                              "description": "Variable id from list_variables, e.g. T2M, PRECTOTCORR, GWETROOT."}},
                             ["lat", "lon", "variable"])},
        {"name": "list_regions", "strict": True,
         "description": "Offline. The pre-computed regional scans (id, name, box). Use their ids with compare_regions.",
         "input_schema": obj({}, [])},
        {"name": "scan_region", "strict": True,
         "description": ("Offline. A pre-computed regional scan across 5 NASA variables: tests, pixels flagged at each "
                         "stage, clusters that beat 199 time shuffles, compound patterns, and k-means trend regimes. Only "
                         "the regions from list_regions exist; a box is matched to the listed region it overlaps most."),
         "input_schema": obj({"lat_min": num, "lat_max": num, "lon_min": num, "lon_max": num},
                             ["lat_min", "lat_max", "lon_min", "lon_max"])},
        {"name": "compare_regions", "strict": True,
         "description": ("Offline. Two pre-computed regions side by side: per variable, tested pixels, share flagged at each "
                         "stage, median rate per decade, and significant clusters. Descriptive only: neighbouring pixels "
                         "are correlated, so no p-value for the difference is given."),
         "input_schema": obj({"region_a": {"type": "string"}, "region_b": {"type": "string"}}, ["region_a", "region_b"])},
        {"name": "simulation_lab", "strict": True,
         "description": ("Offline. Synthetic maps where the truth is known: false-alarm rate, detection power, false "
                         "discovery proportion for the usual, stickiness-removed and honest methods, averaged over 10 maps "
                         "with 95% ranges. phi 0-0.9, years 15/30/45, trend 0/0.2/0.4/0.8 noise SDs per decade."),
         "input_schema": obj({"phi": num, "years": num, "trend": num}, ["phi", "years", "trend"])},
        {"name": "noise_check", "strict": True,
         "description": ("Run both methods on a map of pure random noise with the given month-to-month stickiness (phi, 0-0.9). "
                         "Shows how often the usual method reports fake trends."),
         "input_schema": obj({"phi": num}, ["phi"])},
    ]


def system_prompt() -> str:
    """SYSTEM plus the team's checked notes on the methods, so explanations build on our own write-up."""
    notes = NOTES.read_text(encoding="utf-8") if NOTES.is_file() else ""
    return SYSTEM + ("\n\nTeam notes (checked; numbers here may be quoted):\n" + notes if notes else "")


def default_executor() -> Callable[[str, dict], Any]:
    """Real tool implementations, imported lazily so tests can run without network access."""
    from api.scan_routes import snap_to_preset
    from fetch_power import PARAMS, get_monthly_point  # backend/data on sys.path via api.main
    from trendlab import analyze_series, noise_trap
    from trendlab.scan import SCAN_VARS
    import numpy as np

    data = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data"

    def read(*parts):
        return json.loads(data.joinpath(*parts).read_text(encoding="utf-8"))

    presets = {p["id"]: p for p in read("scans", "index.json")}

    def region_stats(scan: dict) -> dict:
        out = {}
        for info in scan["variables"].values():
            valid = np.array(info["valid"], dtype=bool)
            tested = int(valid.sum())

            def share(key):
                return round(float(np.array(info[key], dtype=bool).sum()) / tested, 3) if key in info and tested else None

            rates = np.array(info["rate_per_decade"], dtype=float).ravel()
            rates = rates[np.isfinite(rates)]
            out[info["name"]] = {"units": info["units"], "tested_pixels": tested,
                                 "share_usual": share("naive_mask"), "share_stickiness_removed": share("prewhitened_mask"),
                                 "share_honest_fdr": share("fdr_mask"),
                                 "median_rate_per_decade": float(np.median(rates)) if rates.size else None,
                                 "significant_clusters": sum(c["significant"] for c in info["clusters"])}
        return out

    def snap(v: float, lo: float, hi: float) -> float:
        return min(hi, max(lo, math.floor(v / 5) * 5 + 2.5))

    def run(name: str, args: dict) -> Any:
        if name == "list_variables":
            return {"point_variables": {k: f"{v[0]} ({v[1]})" for k, v in PARAMS.items()},
                    "scan_and_atlas_variables": {k: f"{v[0]} ({v[1]})" for k, v in SCAN_VARS.items()}}
        if name == "atlas_point":
            lat, lon = float(args["lat"]), float(args["lon"])
            plat, plon = snap(lat, -57.5, 77.5), snap(((lon + 540) % 360) - 180, -177.5, 177.5)
            cell = read("cells", f"{plat:+.1f}_{plon:+.1f}.json")
            return {"sample_point": [plat, plon], "note": "value at this sample point, not an average over the 5-degree cell",
                    "variables": {v["name"]: {"units": v["units"], "period": [v["first"], v["last"]],
                                              "months_present": v["n"], "rate_per_decade": v["rate"],
                                              "rate_95_range": [v["rate_lo"], v["rate_hi"]],
                                              "usual_p": v["p_naive"], "usual_trend": v["p_naive"] < 0.05,
                                              "stickiness_removed_p": v["p_honest"],
                                              "stickiness_removed_trend": v["p_honest"] < 0.05,
                                              "honest_fdr_trend": v["fdr"], "fdr_p_threshold": v["fdr_threshold"],
                                              "stickiness_phi": v["phi"], "more_years_needed": v["more_years"],
                                              "halves": v["halves"]}
                                  for v in cell["vars"].values()}}
        if name == "atlas_overview":
            return {"sampling": "one NASA POWER point every 5 degrees, 1981-2025",
                    "variables": [{"name": v["name"], "points": v["n_cells"], "share_usual": round(v["naive_fraction"], 3),
                                   "share_stickiness_removed": round(v["pw_fraction"], 3) if "pw_fraction" in v else None,
                                   "share_honest_fdr": round(v["honest_fraction"], 3)} for v in read("atlas", "index.json")]}
        if name == "analyze_point":
            s = get_monthly_point(float(args["lat"]), float(args["lon"]), args["variable"], 1981, 2025)
            a = analyze_series(s["dates"], [np.nan if v is None else v for v in s["values"]])
            return {"variable": s["name"], "units": s["units"], "period": [s["dates"][0], s["dates"][-1]],
                    "months_present": int(sum(v is not None for v in s["values"])), "months": len(s["values"]),
                    "usual_method": {k: a["naive"][k] for k in ("slope_per_year", "p", "direction")},
                    "stickiness_removed": {k: a["honest"][k] for k in ("slope_per_year", "slope_ci_per_year", "p", "direction")},
                    "note": "one place: the stickiness-removed test is the honest verdict (no multiple-testing correction)",
                    "month_to_month_stickiness_phi": a["noise"]["phi"],
                    "years_of_data": a["record_years"], "more_years_needed_to_detect": a["years_more_needed"]}
        if name == "list_regions":
            return list(presets.values())
        if name == "scan_region":
            hit = snap_to_preset([float(args[k]) for k in ("lat_min", "lat_max", "lon_min", "lon_max")])
            if hit is None:
                raise ValueError("No pre-computed region overlaps this box. Use list_regions for the ones available.")
            r = read("scans", f"{hit['id']}.json")
            clusters = [{"variable": info["name"], **{k: c[k] for k in ("direction", "size", "p", "center_lat",
                                                                         "center_lon", "mean_rate_per_decade")},
                         "units": info["units"]}
                        for info in r["variables"].values() for c in info["clusters"] if c["significant"]]
            return {"region": hit["name"], "box": hit["bbox"], "summary": r["summary"],
                    "significant_clusters": clusters,
                    "compound_patterns": [c["text"] for c in r["compounds"][:5]],
                    "regimes": [{"label": g["label"], "pixels": g["pixels"]} for g in r["regimes"]["regimes"]],
                    "findings": r["findings"], "caveats": r["caveats"]}
        if name == "compare_regions":
            a, b = args["region_a"], args["region_b"]
            for r in (a, b):
                if r not in presets:
                    raise ValueError(f"Unknown region {r}. Use list_regions.")
            return {"note": "Descriptive comparison; neighbouring pixels are correlated, so no p-value for the difference.",
                    a: {"name": presets[a]["name"], "variables": region_stats(read("scans", f"{a}.json"))},
                    b: {"name": presets[b]["name"], "variables": region_stats(read("scans", f"{b}.json"))}}
        if name == "simulation_lab":
            lab = read("lab", "lab.json")

            def near(key, x):
                return min(lab["grid"][key], key=lambda g: abs(g - float(x)))

            want = {"phi": near("phi", args["phi"]), "years": near("years", args["years"]),
                    "trend": near("trend", args["trend"]), "spatial": 2.0, "missing": 0.0}
            exp = next(e for e in lab["experiments"] if all(e["params"][k] == v for k, v in want.items()))

            def pick(m):
                return {k: m[k] for k in ("false_alarm", "power", "miss", "fdp") if m.get(k)}

            return {"synthetic": True, "settings_used": want, "maps": exp["params"]["reps"],
                    "usual": pick(exp["methods"]["naive"]), "stickiness_removed": pick(exp["methods"]["pw"]),
                    "honest_fdr": pick(exp["methods"]["fdr"])}
        if name == "noise_check":
            phi = round(min(max(float(args["phi"]), 0.0), 0.9), 1)
            static = data / "noise" / f"phi{phi:.1f}_trend0.0.json"
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


def _jsonable(o: Any) -> Any:
    """Plain JSON for the evidence trail: numpy values become numbers, NaN and infinity become null."""
    o = json.loads(json.dumps(o, default=lambda x: x.item() if hasattr(x, "item") else str(x)),
                   parse_constant=lambda _: None)
    return o


NUMBER = re.compile(r"(?<![A-Za-z0-9_.])[-+−]?\d[\d,]*(?:\.\d+)?")


def _numbers_in(o: Any) -> list[float]:
    """Every number inside a tool result, including numbers written inside strings (dates, findings)."""
    out: list[float] = []
    if isinstance(o, bool) or o is None:
        return out
    if isinstance(o, (int, float)):
        return [float(o)] if math.isfinite(float(o)) else out
    if isinstance(o, str):
        return [float(m.replace(",", "").replace("−", "-")) for m in NUMBER.findall(o)]
    if isinstance(o, dict):
        for v in o.values():
            out += _numbers_in(v)
    elif isinstance(o, (list, tuple)):
        for v in o:
            out += _numbers_in(v)
    return out


def check_numbers(answer: str, trace: list[dict], question: str = "") -> dict:
    """List the numbers in the answer that no tool returned (allowing rounding, %, per-decade and sign)."""
    known = _numbers_in([t.get("result") for t in trace if t.get("ok")]) + _numbers_in(question)
    found, unverified = [], []
    for m in NUMBER.finditer(answer):
        raw = m.group(0)
        a = float(raw.replace(",", "").replace("−", "-"))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if not decimals and abs(a) <= 10:
            continue  # small counts ("2 regions", "5 variables") are not claims worth checking
        found.append(raw)
        tol = 0.5 * 10 ** -decimals + 1e-9
        ok = any(abs(abs(a) - abs(v * f)) <= max(tol, 0.005 * abs(a))
                 for v in known for f in (1, 10, 100))
        if not ok:
            unverified.append(raw)
    return {"numbers_checked": len(found), "unverified": unverified}


def ask(question: str, client=None, executor: Callable[[str, dict], Any] | None = None,
        history: list[dict] | None = None) -> dict:
    """Run the detective loop. history: earlier {question, answer} pairs for follow-up questions.
    Returns {answer, trace, checks, stop_reason, model}."""
    if client is None:
        import anthropic
        client = anthropic.Anthropic(timeout=40, max_retries=1)
    executor = executor or default_executor()
    messages: list[dict] = []
    for turn in (history or [])[-MAX_HISTORY:]:
        messages += [{"role": "user", "content": turn["question"]}, {"role": "assistant", "content": turn["answer"]}]
    messages.append({"role": "user", "content": question})
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
        return {"answer": "", "trace": trace, "checks": None, "stop_reason": "no_response", "model": MODEL}
    if response.stop_reason == "refusal":
        answer = "The model declined to answer this question. Try rephrasing it as a question about NASA data."
    elif response.stop_reason == "max_tokens":
        answer = "The answer was cut off. Try a narrower question."
    else:
        answer = "\n".join(b.text for b in response.content if b.type == "text").strip()
    return _finish(answer, trace, question, response.stop_reason, getattr(response, "model", MODEL))


def _finish(answer: str, trace: list[dict], question: str, stop: str, model: str) -> dict:
    """Shared result shape for both model paths, with every number checked against the tools and the notes."""
    notes = NOTES.read_text(encoding="utf-8") if NOTES.is_file() else ""
    return {"answer": answer, "checks": check_numbers(answer, trace, question + "\n" + notes),
            "trace": [{**t, "result": _jsonable(t["result"]),
                       "result_preview": _summarise(t["result"])} for t in trace],
            "stop_reason": stop, "model": model}


def _gemini_tools() -> list[dict]:
    """The same tools as Gemini function declarations (it rejects additionalProperties and empty objects)."""
    out = []
    for t in _tools_schema():
        fn = {"name": t["name"], "description": t["description"]}
        if t["input_schema"]["properties"]:
            fn["parameters"] = {k: v for k, v in t["input_schema"].items() if k != "additionalProperties"}
        out.append(fn)
    return [{"function_declarations": out}]


def ask_gemini(question: str, post=None, executor: Callable[[str, dict], Any] | None = None,
               history: list[dict] | None = None) -> dict:
    """Same loop and result shape as ask(), on the Gemini API. Needs GEMINI_API_KEY."""
    if post is None:
        import requests
        post = requests.post
    executor = executor or default_executor()
    model = os.environ.get("GEMINI_MODEL", GEMINI_MODEL)
    contents: list[dict] = []
    for turn in (history or [])[-MAX_HISTORY:]:
        contents += [{"role": "user", "parts": [{"text": turn["question"]}]},
                     {"role": "model", "parts": [{"text": turn["answer"]}]}]
    contents.append({"role": "user", "parts": [{"text": question}]})
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
            reply = {"name": fc["name"], "response": {"result": _jsonable(out)}}
            if "id" in fc:
                reply["id"] = fc["id"]
            results.append({"functionResponse": reply})
        contents.append({"role": "user", "parts": results})

    if not answer:
        answer = "The detective could not finish this question. Try a narrower one."
    return _finish(answer, trace, question, stop, model)
