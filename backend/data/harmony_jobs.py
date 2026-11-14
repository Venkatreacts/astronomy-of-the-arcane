"""Submit NASA Harmony subset jobs (variable + area + time) and download the results.

Needs an Earthdata Login in ~/.netrc (run `python -c "import earthaccess; earthaccess.login(persist=True)"` once)
and the "NASA GESDISC DATA ARCHIVE" application authorized in your Earthdata profile.

python data/harmony_jobs.py --list
python data/harmony_jobs.py merra2_temp_levels
python data/harmony_jobs.py gpm_chennai
"""

from __future__ import annotations

import argparse
import datetime as dt
import pathlib

RAW = pathlib.Path(__file__).resolve().parent / "raw"

# Collection concept IDs and variable names were checked in NASA CMR on 9 Nov 2026.
JOBS = {
    "merra2_temp_levels": {
        "about": "Case 2: MERRA-2 monthly temperature on pressure levels over South Asia (CO2 fingerprint).",
        "collection": "C1276812904-GES_DISC",  # M2IMNPASM v5.12.4
        "variables": ["T"],
        "bbox": (65.0, 5.0, 95.0, 35.0),  # west, south, east, north
        "start": dt.datetime(1980, 1, 1),
        "stop": dt.datetime(2026, 9, 30),
    },
    "gpm_chennai": {
        "about": "Case 3 option: GPM IMERG monthly rain around Chennai (record ends Sep 2025).",
        "collection": "C2723754851-GES_DISC",  # GPM_3IMERGM v07
        "variables": ["precipitation"],
        "bbox": (79.8, 12.6, 80.6, 13.4),
        "start": dt.datetime(2001, 1, 1),
        "stop": dt.datetime(2025, 9, 30),
    },
    "no2_india_box": {
        "about": "Case 1 fallback (prefer Giovanni CSV, see README): OMI NO2 daily over the Indo-Gangetic Plain. ~7,500 small files.",
        "collection": "C3333493715-GES_DISC",  # OMNO2d v004
        "variables": ["HDFEOS/GRIDS/ColumnAmountNO2/Data_Fields/ColumnAmountNO2TropCloudScreened"],
        "bbox": (75.0, 22.0, 88.0, 30.0),
        "start": dt.datetime(2005, 1, 1),
        "stop": dt.datetime(2025, 12, 31),
    },
    "no2_china_box": {
        "about": "Case 1 fallback: OMI NO2 daily over the North China Plain.",
        "collection": "C3333493715-GES_DISC",
        "variables": ["HDFEOS/GRIDS/ColumnAmountNO2/Data_Fields/ColumnAmountNO2TropCloudScreened"],
        "bbox": (113.0, 34.0, 120.0, 40.0),
        "start": dt.datetime(2005, 1, 1),
        "stop": dt.datetime(2025, 12, 31),
    },
}


def run(name: str) -> None:
    from harmony import BBox, Client, Collection, Request

    job = JOBS[name]
    out = RAW / name
    out.mkdir(parents=True, exist_ok=True)
    client = Client()  # reads Earthdata credentials from ~/.netrc
    request = Request(
        collection=Collection(id=job["collection"]),
        spatial=BBox(*job["bbox"]),
        temporal={"start": job["start"], "stop": job["stop"]},
        variables=job["variables"],
    )
    if not request.is_valid():
        raise SystemExit(f"Invalid request: {request.validate()}")
    job_id = client.submit(request)
    print(f"{name}: submitted job {job_id}. Status: https://harmony.earthdata.nasa.gov/jobs/{job_id}")
    client.wait_for_processing(job_id, show_progress=True)
    files = [f.result() for f in client.download_all(job_id, directory=str(out), overwrite=True)]
    print(f"{name}: downloaded {len(files)} files to {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("job", nargs="?", choices=sorted(JOBS))
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list or not a.job:
        for k, v in JOBS.items():
            print(f"{k:22s} {v['about']}")
    else:
        run(a.job)
