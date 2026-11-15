"""Saved Headline-check examples, so the page shows the whole flow offline.

    python scripts/build_claims.py [--force]   # needs GEMINI_API_KEY (env or backend/.env) and NASA POWER access

For each example the AI extracts the claim (the same call as POST /api/claim/read), the place gets fixed
coordinates, and the same code as POST /api/claim/check runs the tests. Read each file before committing it.
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys
import time

import requests

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from api.main import clean  # noqa: E402  (also loads backend/.env)
from trendlab.agent import load_env_file  # noqa: E402
from trendlab.claims import check_claim, extract_claim  # noqa: E402

OUT = BACKEND.parent / "web" / "public" / "data" / "claims"
EXAMPLES = [
    ("chennai-hotter", "Chennai is getting hotter every year.", {"name": "Chennai", "lat": 13.08, "lon": 80.27}),
    ("sahel-drier", "The Sahel around Niamey has been getting drier since 1990.", {"name": "Niamey", "lat": 13.51, "lon": 2.11}),
    ("madrid-hotter", "Madrid has been getting hotter since 1981.", {"name": "Madrid", "lat": 40.42, "lon": -3.7}),
]

if __name__ == "__main__":
    load_env_file(BACKEND / ".env")
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    force = "--force" in sys.argv  # rebuild examples that already have a file
    for cid, text, place in EXAMPLES:
        if (OUT / f"{cid}.json").exists() and not force:
            index.append({"id": cid, "text": text})
            print(f"{cid}: kept (use --force to rebuild)", flush=True)
            continue
        claim = None
        for attempt in range(5):  # Gemini rate-limits bursts (429) and is sometimes overloaded (503)
            try:
                claim = extract_claim(text)
                break
            except requests.HTTPError as exc:
                print(f"{cid}: attempt {attempt + 1} got {exc.response.status_code}, waiting", flush=True)
                time.sleep(30 * (attempt + 1))
        if claim is None:
            print(f"{cid}: skipped", flush=True)
            continue
        result = check_claim(claim, place["lat"], place["lon"])
        doc = clean({"id": cid, "text": text, "extracted": claim, "place": place, "check": result,
                     "saved_on": dt.date.today().isoformat()})
        (OUT / f"{cid}.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
        index.append({"id": cid, "text": text})
        print(f"{cid}: {claim} -> {result.get('label', result['verdict'])}", flush=True)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
