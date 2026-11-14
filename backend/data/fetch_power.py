"""NASA POWER monthly point series (no login needed). Source: MERRA-2 based.

python data/fetch_power.py --lat 13.08 --lon 80.27 --param T2M --start 1981 --end 2025
"""

from __future__ import annotations

import argparse
import json

import requests

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"

PARAMS = {
    "T2M": ("Air temperature at 2 m", "degC"),
    "T2M_MAX": ("Daily maximum air temperature at 2 m", "degC"),
    "PRECTOTCORR": ("Precipitation", "mm/day"),
    "RH2M": ("Relative humidity at 2 m", "%"),
    "ALLSKY_SFC_SW_DWN": ("Sunlight reaching the surface", "kWh/m2/day"),
}


def get_monthly_point(lat: float, lon: float, param: str = "T2M", start: int = 1981, end: int = 2025) -> dict:
    """Return a Series JSON dict. POWER's month '13' (annual mean) and -999 fill values are dropped."""
    if param not in PARAMS:
        raise ValueError(f"Unknown parameter {param}. Choose from {sorted(PARAMS)}")
    r = requests.get(POWER_URL, params={
        "parameters": param, "community": "RE", "longitude": lon, "latitude": lat,
        "start": start, "end": end, "format": "JSON",
    }, timeout=90)
    r.raise_for_status()
    raw = r.json()["properties"]["parameter"][param]
    dates, values = [], []
    for key in sorted(raw):
        year, month = key[:4], key[4:]
        if month == "13":
            continue
        v = raw[key]
        dates.append(f"{year}-{month}")
        values.append(None if v is None or v <= -998 else float(v))
    name, units = PARAMS[param]
    return {
        "name": name,
        "units": units,
        "source": f"NASA POWER monthly point API ({param}), lat {lat}, lon {lon}",
        "dates": dates,
        "values": values,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--param", default="T2M")
    ap.add_argument("--start", type=int, default=1981)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--out")
    a = ap.parse_args()
    s = get_monthly_point(a.lat, a.lon, a.param, a.start, a.end)
    text = json.dumps(s)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(text)
        print(f"saved {len(s['dates'])} months to {a.out}")
    else:
        print(text[:400], "...")
