"""Write the variable catalog (web/public/data/catalog.json): every NASA POWER variable a student can pick, with a
plain name, a one-sentence definition, units, theme tags and place-type tags, and where to check it in Giovanni.

    python scripts/build_catalog.py

Every id is checked against the NASA POWER monthly point endpoint (1981-2025 at a test point, Chennai) and dropped
if it returns no data. Definitions already written in data/fetch_power.py are reused word for word.
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

import numpy as np

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "data"))

from fetch_power import PARAMS  # noqa: E402
from trendlab.sweep import CATALOG_PATH, TEST_POINT, fetch_point_many  # noqa: E402

M = "MERRA-2"
# id: name, units, definition (None = reuse fetch_power.py), themes, place types, Giovanni dataset · field
ENTRIES = [
    ("T2M", "Air temperature", "degC", None, ["heat"], ["coast", "farm", "city", "forest", "desert", "mountain", "snow"],
     f"{M} M2TMNXSLV · T2M (in kelvin)"),
    ("T2M_MAX", "Daily highest temperature", "degC", None, ["heat"], ["city", "desert", "farm"],
     f"{M} M2SMNXSLV · T2MMAX (in kelvin)"),
    ("T2M_MIN", "Daily lowest temperature", "degC", "The coldest reading of each day, usually at night, averaged over the month.",
     ["heat"], ["city", "desert", "mountain", "snow"], f"{M} M2SMNXSLV · T2MMIN (in kelvin)"),
    ("TS", "Ground surface temperature", "degC", "How warm the ground or sea surface itself is, not the air above it.",
     ["heat"], ["desert", "city", "coast", "snow"], f"{M} M2TMNXSLV · TS (in kelvin)"),
    ("T2MDEW", "Dew point", "degC",
     "The temperature at which the air would be full of water vapour and dew would form, so a higher dew point means muggier air.",
     ["heat", "water", "air"], ["coast", "forest", "farm"], f"{M} M2TMNXSLV · T2MDEW (in kelvin)"),
    ("PRECTOTCORR", "Rainfall", "mm/day", None, ["water"], ["farm", "forest", "coast", "desert", "mountain"],
     f"{M} M2TMNXFLX · PRECTOTCORR (kg m-2 s-1; × 86400 = mm/day)"),
    ("GWETROOT", "Root-zone soil wetness", "0-1", None, ["water"], ["farm", "forest", "desert"], f"{M} M2TMNXLND · GWETROOT"),
    ("GWETTOP", "Topsoil wetness", "0-1", "How wet the top few centimetres of soil are: 0 is completely dry, 1 is soaked.",
     ["water"], ["farm", "desert"], f"{M} M2TMNXLND · GWETTOP"),
    ("EVLAND", "Evaporation from land", "mm/day",
     "How much water rises from soil and plants into the air each day, measured as a depth of water.",
     ["water"], ["farm", "forest"], f"{M} M2TMNXLND · EVLAND (kg m-2 s-1)"),
    ("RH2M", "Relative humidity", "%", None, ["water", "air"], ["coast", "city", "forest"],
     f"none: NASA POWER computes it; the closest {M} field is M2TMNXSLV · QV2M"),
    ("QV2M", "Specific humidity", "g/kg", "How many grams of water vapour there are in each kilogram of air near the ground.",
     ["water", "air"], ["coast", "forest"], f"{M} M2TMNXSLV · QV2M (kg/kg)"),
    ("WS2M", "Wind speed at 2 m", "m/s", None, ["wind"], ["coast", "farm", "desert"],
     f"none: NASA POWER computes it from {M} M2TMNXSLV · U2M and V2M"),
    ("WS10M", "Wind speed at 10 m", "m/s", "Average wind speed at the height of a weather mast, 10 m above the ground.",
     ["wind"], ["coast", "mountain", "desert"], f"none: NASA POWER computes it from {M} M2TMNXSLV · U10M and V10M"),
    ("PS", "Air pressure at the surface", "kPa",
     "How hard the air above presses down on the ground, which is lower high up on a mountain.",
     ["air", "wind"], ["mountain", "coast"], f"{M} M2TMNXSLV · PS (in pascals)"),
    ("CLOUD_AMT", "Cloud cover", "%", "The share of the sky covered by cloud, averaged over the month.",
     ["sunlight", "water"], ["coast", "forest", "mountain"], f"closest: {M} M2TMNXRAD · CLDTOT (NASA POWER uses satellite cloud data)"),
    ("ALLSKY_SFC_SW_DWN", "Sunlight reaching the ground", "kWh/m2/day", None, ["sunlight"], ["desert", "farm", "city"],
     f"closest: {M} M2TMNXRAD · SWGDN (NASA POWER uses CERES satellite data)"),
    ("SNODP", "Snow depth", "cm", "How deep the snow on the ground is, averaged over the month.",
     ["water"], ["snow", "mountain"], f"{M} M2TMNXLND · SNODP (in metres)"),
    ("TQV", "Water vapour in the whole air column", "kg/m2",
     "All the water vapour in the air above a spot, as if it fell as a layer of water (1 kg per square metre is 1 mm).",
     ["water", "air"], ["coast", "forest"], f"{M} M2TMNXSLV · TQV"),
    ("AOD_55", "Haze (aerosol optical depth)", "unitless",
     "How much dust, smoke and pollution dim the sunlight passing through the air, where 0 means perfectly clear.",
     ["air", "sunlight"], ["city", "desert", "farm"], f"{M} M2TMNXAER · TOTEXTTAU"),
]


if __name__ == "__main__":
    ids = [e[0] for e in ENTRIES]
    got = fetch_point_many(TEST_POINT["lat"], TEST_POINT["lon"], ids)
    out = []
    for vid, name, units, definition, themes, places, giovanni in ENTRIES:
        series = got.get(vid)
        n = int(np.isfinite(np.array([np.nan if v is None else v for v in series["values"]], dtype=float)).sum()) if series else 0
        if n == 0:
            print(f"{vid}: dropped, no data at the test point", flush=True)
            continue
        out.append({"id": vid, "name": name, "units": units, "definition": definition or PARAMS[vid][2],
                    "themes": themes, "places": places, "giovanni": giovanni, "months_at_test_point": n})
        print(f"{vid}: {n} months", flush=True)
    doc = {"checked": dt.date.today().isoformat(), "test_point": TEST_POINT, "source": "NASA POWER monthly point API",
           "variables": out}
    CATALOG_PATH.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(out)} variables -> {CATALOG_PATH}")
