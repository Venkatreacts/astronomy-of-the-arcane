"""Giovanni case files, the "second witness" comparisons and the "same variable, opposite directions" pairs.

    python scripts/build_witness.py

Reads the Giovanni area-averaged CSVs in backend/data/raw/ with the existing reader in data/build_cases.py:
    giovanni_wisconsin_modis_aod.csv   MODIS on Aqua, MYD08_M3 v6.1 (satellite)
    giovanni_wisconsin_merra2_aod.csv  MERRA-2 M2TMNXAER v5.12.4 (model reanalysis)
    giovanni_tamilnadu_gpm.csv         GPM IMERG Final monthly v07 (satellite, gauge-adjusted)
    giovanni_tamilnadu_airs_t.csv      AIRS temperature (satellite), skipped when the file is missing
The MERRA-2 side of the Tamil Nadu pairs is NASA POWER over the same box (cached regional requests).

Writes backend/data/cases/wisconsin.json (copied to the web by build_static.build_cases),
web/public/data/witness.json and web/public/data/opposites.json. Every number comes from the same engine as
the rest of the app: analyze_series for all months, explore() for a season.
"""

from __future__ import annotations

import csv
import json
import math
import pathlib
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "data"))

from build_cases import RAW, monthly_from_daily, read_giovanni_csv, save, series_with_analysis  # noqa: E402
from trendlab.explore import area_mean, explore  # noqa: E402
from trendlab.stats import analyze_series  # noqa: E402

WEB = BACKEND.parent / "web" / "public" / "data"
FILES = {
    "wi_modis": RAW / "giovanni_wisconsin_modis_aod.csv",
    "wi_merra2": RAW / "giovanni_wisconsin_merra2_aod.csv",
    "tn_gpm": RAW / "giovanni_tamilnadu_gpm.csv",
    "tn_airs": RAW / "giovanni_tamilnadu_airs_t.csv",
}
# The GPM file's box (west, south, east, north = 76, 8, 80.5, 13.5) as two NASA POWER requests, because a
# POWER regional request may span at most 5 degrees a side. The shared row at 11.0 N is kept once.
TN_BOXES = ([8.0, 11.0, 76.0, 80.5], [11.0, 13.5, 76.0, 80.5])
TN_YEARS = (2000, 2025)
SEASONS = ("all", "JJA", "DJF")


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not math.isfinite(float(o)) else float(o)
    return o


# ---------------------------------------------------------------- Giovanni files

def giovanni_meta(path: pathlib.Path) -> dict:
    """The header lines of a Giovanni area-averaged CSV: title, box, reproduce URL, fill value, data field."""
    meta = {}
    with open(path, newline="", encoding="utf-8", errors="ignore") as f:
        for rec in csv.reader(f):
            if not rec:
                continue
            key = rec[0].strip().rstrip(":")
            if key.lower() == "time":
                meta["field"] = rec[1].strip()
                break
            val = rec[1].strip() if len(rec) > 1 else ""
            if key == "Title":
                meta["title"] = val
            elif key == "User Bounding Box":
                meta["bbox"] = val
            elif key == "URL to Reproduce Results":
                meta["url"] = val
            elif key.startswith("Fill Value"):
                meta["fill"] = float(val)
    return meta


def giovanni_series(path: pathlib.Path, scale: float = 1.0) -> tuple[list[str], list[float | None], dict]:
    """Monthly series from the CSV: the shared reader, the file's own fill value removed, then scaled."""
    meta = giovanni_meta(path)
    fill = meta.get("fill")
    rows = [(d, np.nan if (fill is not None and v == fill) else v) for d, v in read_giovanni_csv(path)]
    dates, vals = monthly_from_daily(rows)
    return dates, [None if v is None else v * scale for v in vals], meta


def kind_of(field: str) -> str:
    """Satellite or model, from the product short name in the data field (never guessed from the title)."""
    if field.removeprefix("mean_").startswith("M2"):
        return "model"
    return "satellite"


def giovanni_label(meta: dict, product: str) -> str:
    title = meta["title"].removeprefix("Time Series, Area-Averaged of ").strip()
    return (f"{product}: {title}, field {meta['field'].removeprefix('mean_')}, via NASA Giovanni "
            f"(area-averaged over west, south, east, north = {meta['bbox']})")


# ---------------------------------------------------------------- 1. Wisconsin smoke case

def seasons_of(dates, values) -> dict:
    """The three stages for all months, Jun-Aug and Dec-Feb, over the whole record."""
    start, end = int(dates[0][:4]), int(dates[-1][:4])
    x = np.array([np.nan if v is None else v for v in values], dtype=float)
    out = {}
    for s in SEASONS:
        r = explore(dates, x, start, end, s)
        out[s] = {"season": s, "season_name": r["season_name"], "rule": r["rule"], "frame": r["frame"],
                  "stages": r["stages"], "series": r["series"], "provable": r["provable"]}
    return out


def wisconsin_case() -> dict | None:
    path = FILES["wi_modis"]
    if not path.is_file():
        print(f"skipped Wisconsin case: {path.name} not found")
        return None
    dates, vals, meta = giovanni_series(path)
    s = series_with_analysis({
        "name": "Aerosol optical depth (haze), Wisconsin", "units": "unitless",
        "kind": kind_of(meta["field"]),
        "source": giovanni_label(meta, "Satellite: MODIS on Aqua, MYD08_M3 collection 6.1"),
        "reproduce": meta["url"], "dates": dates, "values": vals})
    s["seasons"] = seasons_of(dates, vals)
    return {"id": "wisconsin", "title": "Wildfire smoke over Wisconsin", "series": [s]}


# ---------------------------------------------------------------- 2. Second witness

def power_box_mean(param: str, boxes, years) -> tuple[list[str], list[float | None]]:
    from trendlab.scan import fetch_power_region
    parts = [fetch_power_region(param, b, *years) for b in boxes]
    dates = parts[0]["dates"]
    lats, cubes = [], []
    for k, p in enumerate(parts):
        keep = [j for j, la in enumerate(p["lats"]) if la not in lats]
        lats += [p["lats"][j] for j in keep]
        cubes.append(np.asarray(p["cube"], dtype=float)[:, keep, :])
    mean = area_mean(np.concatenate(cubes, axis=1), lats)
    return dates, [None if not np.isfinite(v) else float(v) for v in mean]


def common(a_dates, a_vals, b_dates, b_vals):
    """Both series on the same months: the overlap of the two records, a month missing in either is missing in both."""
    a, b = dict(zip(a_dates, a_vals)), dict(zip(b_dates, b_vals))
    both = sorted(d for d in set(a) & set(b) if a[d] is not None and b[d] is not None)
    first, last = both[0], both[-1]
    span = [d for d in sorted(set(a) | set(b)) if first <= d <= last]
    keep = [d for d in span if a.get(d) is not None and b.get(d) is not None]
    return span, [a[d] if d in keep else None for d in span], [b[d] if d in keep else None for d in span]


def side(short, name, units, kind, source, dates, values) -> dict:
    a = analyze_series(dates, [np.nan if v is None else v for v in values])
    h = a["honest"]
    slope = h["slope_per_year"]
    return {"short": short, "name": name, "units": units, "kind": kind, "source": source, "dates": dates, "values": values,
            "direction": "rising" if slope > 0 else "falling" if slope < 0 else "flat",
            "rate_per_decade": slope * 10, "rate_ci_per_decade": [c * 10 for c in h["slope_ci_per_year"]],
            "p_usual": a["naive"]["p"], "usual": a["naive"]["significant"],
            "p_honest": h["p"], "honest": h["significant"], "years_more_needed": a["years_more_needed"]}


def verdict_word(s):
    return "trend is real" if s["honest"] else "not proven"


def badge(a: dict, b: dict) -> tuple[str, str]:
    """'Both sources agree' when direction and honest verdict match; otherwise 'Sources disagree'."""
    if a["direction"] == b["direction"] and a["honest"] == b["honest"]:
        return "agree", (f"Both sources show {a['direction']} values and the same honest verdict: "
                         f"{verdict_word(a)}.")
    if a["direction"] != b["direction"]:
        return "disagree", (f"The {a['kind']} record is {a['direction']} while the {b['kind']} record is "
                            f"{b['direction']} over the same months.")
    return "disagree", (f"Both are {a['direction']}, but the honest verdict is {verdict_word(a)} for the "
                        f"{a['kind']} record and {verdict_word(b)} for the {b['kind']} record.")


def pair(pid, title, place, a, b) -> dict:
    tag, sentence = badge(a, b)
    return {"id": pid, "title": title, "place": place, "first": a["dates"][0], "last": a["dates"][-1],
            "a": a, "b": b, "badge": tag,
            "label": "Both sources agree" if tag == "agree" else "Sources disagree", "sentence": sentence}


def witness() -> dict:
    pairs, skipped = [], []
    # Wisconsin aerosols: MODIS (satellite) vs MERRA-2 (model), both Giovanni files
    if FILES["wi_modis"].is_file() and FILES["wi_merra2"].is_file():
        md, mv, mm = giovanni_series(FILES["wi_modis"])
        rd, rv, rm = giovanni_series(FILES["wi_merra2"])
        dates, x, y = common(md, mv, rd, rv)
        pairs.append(pair("wi_aerosol", "Haze over Wisconsin", "Wisconsin, USA",
                          side("MODIS on Aqua", "Aerosol optical depth", "unitless", kind_of(mm["field"]),
                               giovanni_label(mm, "Satellite: MODIS on Aqua, MYD08_M3 collection 6.1"), dates, x),
                          side("MERRA-2", "Aerosol optical depth (total extinction at 550 nm)", "unitless",
                               kind_of(rm["field"]),
                               giovanni_label(rm, "Model: MERRA-2 reanalysis, M2TMNXAER v5.12.4"), dates, y)))
    else:
        skipped.append("Haze over Wisconsin (MODIS vs MERRA-2): a Giovanni file is not in the data yet")
    # Tamil Nadu rain: GPM IMERG (satellite, gauge-adjusted) vs MERRA-2 rain from NASA POWER, same box
    if FILES["tn_gpm"].is_file():
        gd, gv, gm = giovanni_series(FILES["tn_gpm"], scale=24.0)  # mm/hr to mm/day
        pd, pv = power_box_mean("PRECTOTCORR", TN_BOXES, TN_YEARS)
        dates, x, y = common(gd, gv, pd, pv)
        pairs.append(pair("tn_rain", "Rain over Tamil Nadu", "Tamil Nadu, India",
                          side("GPM IMERG", "Rainfall", "mm/day", kind_of(gm["field"]),
                               giovanni_label(gm, "Satellite with rain-gauge adjustment: GPM IMERG Final, "
                                                  "GPM_3IMERGM version 07") + "; converted from mm/hr to mm/day",
                               dates, x),
                          side("MERRA-2 (NASA POWER)", "Rainfall", "mm/day", "model",
                               "Model: MERRA-2 rain, bias-corrected (NASA POWER PRECTOTCORR), cos-latitude "
                               "mean of the 0.5 x 0.625 degree grid over west, south, east, north = 76, 8, 80.5, 13.5",
                               dates, y)))
    else:
        skipped.append("Rain over Tamil Nadu (GPM vs MERRA-2): the GPM file is not in the data yet")
    if FILES["tn_airs"].is_file():
        raise SystemExit("giovanni_tamilnadu_airs_t.csv is present: add the AIRS pair before building.")
    skipped.append("Temperature over Tamil Nadu (AIRS vs MERRA-2): the AIRS file is not in the data yet")
    return {"pairs": pairs, "skipped": skipped,
            "rule": "Same tests on both sources over the months both have. Agree = same direction and same "
                    "honest verdict (single-place rule)."}


# ---------------------------------------------------------------- 4. Opposite directions

def opposites() -> dict:
    """For each atlas variable, the honest rising cell and the honest falling cell with the largest rates."""
    out = []
    for f in sorted((WEB / "atlas").glob("*.json")):
        if f.stem == "index" or f.stem.startswith(("years_", "insights_")):  # index, provable-year and derived-layer files
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        honest = [c for c in d["cells"] if c.get("honest") and c.get("rate") is not None]
        up = max((c for c in honest if c["rate"] > 0), key=lambda c: c["rate"], default=None)
        down = min((c for c in honest if c["rate"] < 0), key=lambda c: c["rate"], default=None)
        out.append({"id": d["id"], "name": d["name"], "units": d["units"], "rising_word": d.get("rising"),
                    "falling_word": d.get("falling"), "years": d["years"], "fdr_threshold": d["fdr_threshold"],
                    "n_honest": len(honest), "rising": up, "falling": down})
    return {"rule": "Map rule: honest = stickiness-removed Mann-Kendall plus false discovery control (10%) "
                    "across every atlas point of the variable.", "variables": out}


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    case = wisconsin_case()
    if case:
        save("wisconsin", clean(case))
    w = witness()
    (WEB / "witness.json").write_text(json.dumps(clean(w)), encoding="utf-8")
    for p in w["pairs"]:
        print(p["id"], p["label"], "|", p["sentence"])
    for s in w["skipped"]:
        print("skipped:", s)
    o = opposites()
    (WEB / "opposites.json").write_text(json.dumps(clean(o)), encoding="utf-8")
    for v in o["variables"]:
        print(v["id"], "rising", v["rising"] and (v["rising"]["lat"], v["rising"]["lon"], v["rising"]["rate"]),
              "falling", v["falling"] and (v["falling"]["lat"], v["falling"]["lon"], v["falling"]["rate"]))
    from build_static import build_cases
    build_cases()
