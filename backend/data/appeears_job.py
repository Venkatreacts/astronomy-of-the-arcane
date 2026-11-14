"""AppEEARS area request for MODIS monthly land surface temperature around Chennai (Case 3 option).

Uses your Earthdata Login (prompted, or EARTHDATA_USERNAME / EARTHDATA_PASSWORD env vars).
AppEEARS queues requests: expect minutes to hours. Submit early, download later.

python data/appeears_job.py submit
python data/appeears_job.py status <task_id>
python data/appeears_job.py download <task_id>
"""

from __future__ import annotations

import getpass
import json
import os
import pathlib
import sys

import requests

API = "https://appeears.earthdatacloud.nasa.gov/api"
RAW = pathlib.Path(__file__).resolve().parent / "raw" / "modis_lst_chennai"

CHENNAI = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature", "properties": {},
        "geometry": {"type": "Polygon", "coordinates": [[
            [79.95, 12.85], [80.35, 12.85], [80.35, 13.25], [79.95, 13.25], [79.95, 12.85]]]},
    }],
}

TASK = {
    "task_type": "area",
    "task_name": "chennai_mod11c3_lst",
    "params": {
        "dates": [{"startDate": "02-01-2000", "endDate": "10-31-2026"}],
        "layers": [{"product": "MOD11C3.061", "layer": "LST_Day_CMG"},
                   {"product": "MOD11C3.061", "layer": "LST_Night_CMG"}],
        "geo": CHENNAI,
        "output": {"format": {"type": "netcdf4"}, "projection": "geographic"},
    },
}


def token() -> str:
    user = os.environ.get("EARTHDATA_USERNAME") or input("Earthdata username: ")
    pwd = os.environ.get("EARTHDATA_PASSWORD") or getpass.getpass("Earthdata password: ")
    r = requests.post(f"{API}/login", auth=(user, pwd), timeout=60)
    r.raise_for_status()
    return r.json()["token"]


def main(argv: list[str]) -> None:
    if not argv:
        raise SystemExit(__doc__)
    head = {"Authorization": f"Bearer {token()}"}
    cmd = argv[0]
    if cmd == "submit":
        r = requests.post(f"{API}/task", json=TASK, headers=head, timeout=60)
        r.raise_for_status()
        print("task_id:", r.json()["task_id"])
    elif cmd == "status":
        r = requests.get(f"{API}/status/{argv[1]}", headers=head, timeout=60)
        print(json.dumps(r.json(), indent=2)[:1500])
    elif cmd == "download":
        RAW.mkdir(parents=True, exist_ok=True)
        bundle = requests.get(f"{API}/bundle/{argv[1]}", headers=head, timeout=60).json()
        for f in bundle["files"]:
            name = pathlib.Path(f["file_name"]).name
            data = requests.get(f"{API}/bundle/{argv[1]}/{f['file_id']}", headers=head, timeout=300)
            data.raise_for_status()
            (RAW / name).write_bytes(data.content)
            print("saved", name)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
