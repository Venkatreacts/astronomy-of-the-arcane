"""Turn downloaded data into small cached case files in data/cases/ (what the app serves).

python data/build_cases.py chennai             # live NASA POWER, no login
python data/build_cases.py no2  --india raw/giovanni_india.csv --china raw/giovanni_china.csv
python data/build_cases.py fingerprint         # needs raw/merra2_temp_levels/ from harmony_jobs.py
python data/build_cases.py grace               # needs raw/grace/ from fetch_grace.py

Every case file holds the series and the analysis, so the demo works offline.
"""

from __future__ import annotations

import argparse
import csv
import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from trendlab import analyze_series, deseasonalize, map_trends  # noqa: E402

RAW = HERE / "raw"
CASES = HERE / "cases"


def save(case_id: str, payload: dict) -> None:
    CASES.mkdir(parents=True, exist_ok=True)
    path = CASES / f"{case_id}.json"
    path.write_text(json.dumps(payload, allow_nan=False, default=_clean), encoding="utf-8")
    print("saved", path)


def _clean(o):
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.ndarray):
        return [_clean(v) if isinstance(v, np.ndarray) else (None if not np.isfinite(v) else float(v)) for v in o]
    raise TypeError(type(o))


def series_with_analysis(series: dict) -> dict:
    vals = [np.nan if v is None else v for v in series["values"]]
    analysis = analyze_series(series["dates"], vals)
    for k in ("years_to_detect", "years_more_needed"):
        if analysis[k] is not None and not np.isfinite(analysis[k]):
            analysis[k] = None
    return {**series, "analysis": analysis}


def monthly_from_daily(rows: list[tuple[str, float]]) -> tuple[list[str], list[float | None]]:
    """Average daily values (YYYY-MM-DD, value) into calendar months."""
    buckets: dict[str, list[float]] = {}
    for day, v in rows:
        if v is None or not np.isfinite(v):
            continue
        buckets.setdefault(day[:7], []).append(v)
    months = sorted(buckets)
    return months, [float(np.mean(buckets[m])) for m in months]


def read_giovanni_csv(path: pathlib.Path) -> list[tuple[str, float]]:
    """Giovanni 'Time Series, Area-Averaged' CSV: metadata lines, then a 'time,...' header."""
    rows, started = [], False
    with open(path, newline="", encoding="utf-8", errors="ignore") as f:
        for rec in csv.reader(f):
            if not rec:
                continue
            if not started:
                started = rec[0].strip().lower() == "time"
                continue
            try:
                v = float(rec[1])
            except (IndexError, ValueError):
                continue
            rows.append((rec[0][:10], v if v > -1e20 else np.nan))
    return rows


def build_chennai(lat=13.08, lon=80.27) -> None:
    from fetch_power import get_monthly_point
    out = {"id": "chennai", "title": "Is my city changing? Chennai",
           "series": [series_with_analysis(get_monthly_point(lat, lon, p, 1981, 2025))
                      for p in ("T2M", "PRECTOTCORR")]}
    save("chennai", out)


def build_no2(india: pathlib.Path, china: pathlib.Path) -> None:
    series = []
    for label, path in (("Indo-Gangetic Plain, India", india), ("North China Plain", china)):
        months, vals = monthly_from_daily(read_giovanni_csv(path))
        series.append(series_with_analysis({
            "name": f"Tropospheric NO2, {label}", "units": "molecules/cm2",
            "source": "OMI OMNO2d v004 via NASA Giovanni (area-averaged, monthly means of daily values)",
            "dates": months, "values": vals}))
    save("no2", {"id": "no2", "title": "Two countries, one gas", "series": series})


def build_fingerprint(levels=(850, 500, 250, 100, 50, 10)) -> None:
    import xarray as xr
    files = sorted((RAW / "merra2_temp_levels").glob("*.nc*"))
    if not files:
        raise SystemExit("No MERRA-2 files. Run: python data/harmony_jobs.py merra2_temp_levels")
    ds = xr.open_mfdataset(files, combine="by_coords")
    t = ds["T"]
    w = np.cos(np.deg2rad(t["lat"]))
    series = []
    for lev in levels:
        s = t.sel(lev=lev, method="nearest").weighted(w).mean(("lat", "lon")).load()
        dates = [str(x)[:7] for x in s["time"].values]
        series.append(series_with_analysis({
            "name": f"Air temperature at {lev} hPa", "units": "K",
            "source": "MERRA-2 M2IMNPASM v5.12.4 (Harmony subset, 65-95E, 5-35N, area-weighted mean)",
            "dates": dates, "values": [float(v) for v in s.values]}))
    save("fingerprint", {"id": "fingerprint", "title": "Same cause, opposite sign", "series": series})


def build_grace(bbox=(68.0, 6.0, 98.0, 36.0), coarsen=2) -> None:
    import xarray as xr
    files = sorted((RAW / "grace").glob("*.nc"))
    if not files:
        raise SystemExit("No GRACE file. Run: python data/fetch_grace.py")
    ds = xr.open_dataset(files[0])
    lwe = ds["lwe_thickness"]
    lon_name = "lon" if "lon" in lwe.dims else "longitude"
    lat_name = "lat" if "lat" in lwe.dims else "latitude"
    w, s, e, n = bbox
    sub = lwe.sel({lon_name: slice(w, e), lat_name: slice(s, n)})
    sub = sub.coarsen({lon_name: coarsen, lat_name: coarsen}, boundary="trim").mean()
    sub = sub.resample(time="1MS").mean()  # regular months; mission gaps stay NaN
    months = sub["time"].dt.month.values
    cube = sub.values
    anom = np.stack([deseasonalize(cube[:, j, i], months) for j in range(cube.shape[1])
                     for i in range(cube.shape[2])], axis=1).reshape(cube.shape)
    res = map_trends(anom)
    save("grace", {
        "id": "grace", "title": "Where is India's water going? (GRACE)",
        "source": "JPL GRACE/GRACE-FO mascon RL06.3 v4, lwe_thickness",
        "units": "cm water per year",
        "note": "Mission gaps (e.g. 2017-2018) are skipped, so slopes are approximate.",
        "lat": sub[lat_name].values, "lon": sub[lon_name].values,
        "slope": res["slope"], "naive_mask": res["naive_mask"].astype(float),
        "honest_mask": res["honest_mask"].astype(float),
        "naive_fraction": res["naive_fraction"], "honest_fraction": res["honest_fraction"]})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("case", choices=["chennai", "no2", "fingerprint", "grace"])
    ap.add_argument("--india", type=pathlib.Path)
    ap.add_argument("--china", type=pathlib.Path)
    a = ap.parse_args()
    sys.path.insert(0, str(HERE))
    if a.case == "chennai":
        build_chennai()
    elif a.case == "no2":
        if not (a.india and a.china):
            raise SystemExit("Give --india and --china Giovanni CSV paths.")
        build_no2(a.india, a.china)
    elif a.case == "fingerprint":
        build_fingerprint()
    else:
        build_grace()
