"""Ask the deployed AI Detective the example questions once and save the answers for the web app.

The saved answers open instantly on the public site with no AI call. Run it against the live server, so no
AI key is needed on this machine:

    set NOISE_TRAP_API=https://<the Render URL>
    set DETECTIVE_PASSCODE=<the team passcode>
    python scripts/build_detective.py

Read each saved answer before committing it. Its "checks" field lists any number that could not be traced
to a tool result or docs/detective-notes.md; fix or delete such an answer. A deleted one is simply not offered.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib

import requests

OUT = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "detective"

# keep in step with EXAMPLES in web/src/views/DetectiveView.jsx: the page matches saved answers by question text
QUESTIONS = {
    "cauvery": "What is changing in the Cauvery delta, and is it real or chance?",
    "sahel-cornbelt": "Compare the Sahel and the US Corn Belt: where is change more convincing?",
    "chennai": "At Chennai, which of the five variables have a trend that passes the honest verdict?",
    "soil": "Why does soil wetness fool the usual test more than temperature does?",
    "lab": "With 30 years of sticky data (phi 0.7), how often does each method find a real trend?",
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
        print(f"{qid}: saved, {len(answer['trace'])} tool calls, untraced numbers: {answer['checks']['unverified']}")
    (OUT / "index.json").write_text(json.dumps(index), encoding="utf-8")


if __name__ == "__main__":
    main()
