"""Pre-compute the simulation lab into web/public/data/lab/lab.json so it runs offline.

    python scripts/build_lab.py         # about 3-5 minutes on 6 cores

Every combination of the settings below is simulated on `REPS` independent 20 x 20 maps. Seeds are fixed:
combination k uses seeds 1000 * k ... 1000 * k + REPS - 1, so any number can be reproduced exactly with
trendlab.lab.experiment(...).
"""

from __future__ import annotations

import itertools
import json
import os
import math
import pathlib
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor

# one BLAS thread per process: parallel workers with many threads each ran out of memory
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from trendlab.lab import experiment  # noqa: E402

OUT = BACKEND.parent / "web" / "public" / "data" / "lab"
GRID = {
    "years": [15, 30, 45],
    "phi": [0.0, 0.3, 0.5, 0.7, 0.9],
    "trend": [0.0, 0.2, 0.4, 0.8],     # noise SDs per decade, left half only
    "spatial": [0.0, 2.0],             # Gaussian smoothing of the noise, in places
    "missing": [0.0, 0.2],             # share of months deleted at random
}
REPS = 10


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    if isinstance(o, float):
        return None if not math.isfinite(o) else round(o, 4)
    return o


def run(args):
    k, combo = args
    warnings.filterwarnings("ignore")
    return experiment(*combo, reps=REPS, seed0=1000 * k)


def build(workers: int = 6) -> None:
    combos = list(itertools.product(*GRID.values()))
    with ProcessPoolExecutor(workers) as pool:
        results = list(pool.map(run, enumerate(combos), chunksize=4))
    OUT.mkdir(parents=True, exist_ok=True)
    out = {"grid": GRID, "reps": REPS, "size": [20, 20], "alpha": 0.05, "fdr_q": 0.10,
           "note": "Synthetic AR(1) noise, not NASA data. Real trend only in the left half when trend > 0.",
           "experiments": [clean(r) for r in results]}
    (OUT / "lab.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{len(results)} experiments written", flush=True)


if __name__ == "__main__":
    build()
