"""Two NASA Worldview Snapshots images for the Wisconsin smoke case, saved with the web app so it works offline.

    python scripts/fetch_worldview.py

MODIS on Aqua corrected-reflectance true colour over the same box as the Giovanni series
(west, south, east, north = -92.9, 42.5, -86.8, 47.1). One heavy smoke day and one clear June day of an early
year (picked by eye from early-June previews: 2005-06-21 had the least cloud). The images are illustrations only;
the trend tests use the Giovanni monthly series.
"""

from __future__ import annotations

import json
import pathlib

import requests

WEB = pathlib.Path(__file__).resolve().parents[2] / "web" / "public"
SNAPSHOT = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
LAYER = "MODIS_Aqua_CorrectedReflectance_TrueColor"
BOX = {"south": 42.5, "north": 47.1, "west": -92.9, "east": -86.8}
WIDTH, HEIGHT = 800, 603  # same degrees per pixel both ways: 6.1 by 4.6 degrees
DAYS = [("clear", "2005-06-21", "A clear June day early in the record"),
        ("smoke", "2023-06-27", "A heavy smoke day")]


def snapshot(day: str, tries: int = 3) -> bytes:
    for attempt in range(tries):  # the service sometimes stalls mid-download
        try:
            r = requests.get(SNAPSHOT, params={
                "REQUEST": "GetSnapshot", "TIME": day, "CRS": "EPSG:4326",
                "BBOX": f"{BOX['south']},{BOX['west']},{BOX['north']},{BOX['east']}",
                "LAYERS": f"{LAYER},Coastlines_15m", "WRAP": "day,x", "FORMAT": "image/jpeg",
                "WIDTH": WIDTH, "HEIGHT": HEIGHT}, timeout=120)
            break
        except requests.ConnectionError:
            if attempt == tries - 1:
                raise
    r.raise_for_status()
    if not r.headers.get("content-type", "").startswith("image/jpeg"):
        raise SystemExit(f"Worldview did not return a JPEG for {day}: {r.headers.get('content-type')}")
    return r.content


if __name__ == "__main__":
    out = WEB / "space"
    out.mkdir(parents=True, exist_ok=True)
    images = []
    for kind, day, label in DAYS:
        name = f"wisconsin_{day}.jpg"
        (out / name).write_bytes(snapshot(day))
        images.append({"kind": kind, "date": day, "label": label, "file": f"space/{name}"})
        print("saved", out / name)
    meta = {"wisconsin": {"layer": f"MODIS on Aqua, corrected reflectance, true colour ({LAYER})",
                          "box": BOX, "credit": "NASA Worldview / EOSDIS GIBS", "images": images}}
    (WEB / "data" / "space.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
