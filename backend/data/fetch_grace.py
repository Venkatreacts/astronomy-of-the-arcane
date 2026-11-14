"""Download the JPL GRACE/GRACE-FO mascon file (one ~44 MB netCDF with every month).

python data/fetch_grace.py
"""

from __future__ import annotations

import pathlib

RAW = pathlib.Path(__file__).resolve().parent / "raw" / "grace"
SHORT_NAME = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"


def main() -> None:
    import earthaccess

    earthaccess.login(persist=True)
    results = earthaccess.search_data(short_name=SHORT_NAME)
    print(f"found {len(results)} granule(s)")
    RAW.mkdir(parents=True, exist_ok=True)
    files = earthaccess.download(results, str(RAW))
    print("saved:", *files, sep="\n  ")


if __name__ == "__main__":
    main()
