"""Ask the deployed AI Detective the example questions once and save the answers for the web app.

The saved answers open instantly on the public site with no AI call. Run it against the live server, so no
AI key is needed on this machine:

    set NOISE_TRAP_API=https://<the Render URL>
    set DETECTIVE_PASSCODE=<the team passcode>
    python scripts/build_detective.py

Read each saved answer before committing it: every number must appear in its evidence trail or in
docs/detective-notes.md. Delete a file that fails that check and it simply will not be offered.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib

import requests

OUT = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "detective"

QUESTIONS = {
    "cauvery": "What is changing in the Cauvery delta, and is it real or chance?",
    "chennai": "Is Chennai really getting hotter, or could it be noise?",
    "punjab": "Is the Punjab farm belt getting wetter? What changes together there?",
    "noise": "How often does the usual method find fake trends in sticky data?",
}


def main() -> None:
    api, passcode = os.environ["NOISE_TRAP_API"].rstrip("/"), os.environ["DETECTIVE_PASSCODE"]
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for qid, question in QUESTIONS.items():
        r = requests.post(f"{api}/api/agent", json={"question": question},
                          headers={"X-Demo-Passcode": passcode}, timeout=180)
        if r.status_code != 200:
            print(f"{qid}: skipped, server said {r.status_code} {r.text[:120]}")
            continue
        answer = {**r.json(), "question": question, "saved_on": dt.date.today().isoformat()}
        (OUT / f"{qid}.json").write_text(json.dumps(answer, indent=1), encoding="utf-8")
        index.append({"id": qid, "question": question})
        print(f"{qid}: saved, {len(answer['trace'])} tool calls")
    (OUT / "index.json").write_text(json.dumps(index), encoding="utf-8")


if __name__ == "__main__":
    main()
