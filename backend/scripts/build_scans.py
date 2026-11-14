"""Pre-compute the Region Scanner presets and copy them into the web app so they work offline.

    python scripts/build_scans.py          # live NASA POWER on first run (~30 s per region), cached after
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time

# one BLAS thread per process: parallel workers with many threads each ran out of memory
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from api.scan_routes import PRESETS, run_scan  # noqa: E402

OUT = BACKEND.parent / "web" / "public" / "data" / "scans"

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    done = []
    for p in PRESETS:
        res = None
        for attempt in range(5):  # NASA POWER rate-limits bursts (429); each variable is cached once fetched
            try:
                res = run_scan(p["bbox"])
                break
            except Exception as exc:  # one failing region must not lose the others
                print(f"{p['id']}: attempt {attempt + 1} failed ({exc})", flush=True)
                time.sleep(90 * (attempt + 1))
        if res is None:
            continue
        (OUT / f"{p['id']}.json").write_text(json.dumps(res), encoding="utf-8")
        done.append(p)
        print(f"{p['id']}: {res['summary']['significant_clusters']} clusters", flush=True)
    (OUT / "index.json").write_text(json.dumps(done), encoding="utf-8")
