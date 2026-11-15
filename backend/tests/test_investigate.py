"""Variable catalog, suggestions, variable sweep, headline check (trendlab/sweep.py, trendlab/claims.py)."""

import json
import pathlib
import sys

import numpy as np
import pytest
import requests
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import api.main as m  # noqa: E402
from trendlab import agent  # noqa: E402
from trendlab.claims import (CANNOT, NOT_YET, OTHER_WAY, SUPPORTED, ClaimError, check_claim,  # noqa: E402
                             extract_claim, validate_claim)
from trendlab.sweep import PLACE_TYPES, THEMES, TEST_POINT, catalog, fetch_point_many, suggest, sweep  # noqa: E402

client = TestClient(m.app)
DATES = [f"{y}-{mo:02d}" for y in range(1981, 2026) for mo in range(1, 13)]
GOOD = {"variable": "T2M", "place": "Chennai", "start_year": 1981, "end_year": 2025, "direction": "up"}


def noise(seed, trend_per_year=0.0):
    rng = np.random.default_rng(seed)
    t = np.arange(len(DATES))
    return (rng.normal(0, 1, t.size) + 5 * np.sin(2 * np.pi * t / 12) + trend_per_year * t / 12).tolist()


# ---------------------------------------------------------------- catalog and suggestions

def test_catalog_entries_are_complete():
    cat = catalog()
    assert len(cat) >= 16 and len({v["id"] for v in cat}) == len(cat)
    for v in cat:
        assert v["name"] and v["units"] and v["giovanni"]
        assert v["definition"].endswith(".") and len(v["definition"].split()) <= 30
        assert v["themes"] and set(v["themes"]) <= set(THEMES)
        assert v["places"] and set(v["places"]) <= set(PLACE_TYPES)
    for p in PLACE_TYPES:
        assert any(p in v["places"] for v in cat)


def test_every_catalog_id_returns_data_for_one_test_point():
    ids = [v["id"] for v in catalog()]
    try:
        got = fetch_point_many(TEST_POINT["lat"], TEST_POINT["lon"], ids, 2019, 2020)
    except requests.RequestException as exc:
        pytest.skip(f"NASA POWER not reachable: {exc}")
    for vid in ids:
        assert vid in got, vid
        assert any(x is not None for x in got[vid]["values"]), vid


def test_fetch_many_splits_requests_at_twenty_parameters():
    calls = []

    class R:
        def __init__(self, ids):
            self.ids = ids

        def raise_for_status(self):
            pass

        def json(self):
            return {"properties": {"parameter": {i: {"202001": 1.0, "202002": -999.0, "202013": 5.0} for i in self.ids}}}

    def get(url, params, timeout):
        calls.append(params["parameters"].split(","))
        return R(calls[-1])

    out = fetch_point_many(0, 0, [f"V{i}" for i in range(23)], get=get)
    assert [len(c) for c in calls] == [20, 3]
    assert out["V22"] == {"dates": ["2020-01", "2020-02"], "values": [1.0, None]}


def test_suggestion_for_coast_and_water_is_not_empty():
    s = suggest("coast", "water")
    assert 3 <= len(s) <= 5
    assert all("water" in v["themes"] for v in s)
    assert "coast" in s[0]["places"]
    assert client.get("/api/suggest", params={"place_type": "coast", "theme": "water"}).json()[0]["id"] == s[0]["id"]
    assert client.get("/api/suggest", params={"place_type": "moon"}).status_code == 422


def test_every_place_and_theme_gets_three_suggestions():
    for p in PLACE_TYPES:
        for t in (*THEMES, "any"):
            assert len(suggest(p, t)) >= 3, (p, t)


# ---------------------------------------------------------------- sweep

def test_sweep_on_planted_series_flags_only_the_planted_variable():
    cat = catalog()
    series = {v["id"]: {"dates": DATES, "values": noise(i)} for i, v in enumerate(cat)}
    series["RH2M"] = {"dates": DATES, "values": noise(99, trend_per_year=0.05)}
    out = sweep(series, cat)
    assert out["n_tested"] == len(cat) and out["expected_by_chance"] == round(0.05 * len(cat), 2)
    assert [r["id"] for r in out["rows"] if r["survives"]] == ["RH2M"]
    assert out["strongest"] == "RH2M" and out["rows"][0]["id"] == "RH2M"  # sorted by size
    assert all(r["years_more_needed"] is not None for r in out["rows"] if not r["survives"])


# ---------------------------------------------------------------- headline check

class Reply:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": self.text}]}}]}


def fake_post(*texts):
    replies = list(texts)
    sent = []

    def post(url, timeout, headers, json):
        sent.append(json)
        return Reply(replies.pop(0))
    post.sent = sent
    return post


def test_valid_claim_passes_the_schema():
    assert validate_claim(dict(GOOD, variable="t2m")) == dict(GOOD)


@pytest.mark.parametrize("bad", [
    "not json", [1, 2], {**GOOD, "extra": 1}, {k: v for k, v in GOOD.items() if k != "place"},
    {**GOOD, "start_year": "1990"}, {**GOOD, "start_year": True}, {**GOOD, "end_year": 2031},
    {**GOOD, "start_year": 2010, "end_year": 2000}, {**GOOD, "direction": "sideways"}, {**GOOD, "place": " "},
])
def test_invalid_ai_reply_is_rejected(bad):
    with pytest.raises(ClaimError):
        validate_claim(bad)


def test_invalid_reply_is_rejected_then_asked_again():
    post = fake_post('{"variable": "T2M"', json.dumps(GOOD))
    out = extract_claim("Chennai is getting hotter", post=post)
    assert {k: out[k] for k in GOOD} == GOOD
    assert len(post.sent) == 2 and "invalid" in post.sent[1]["contents"][-1]["parts"][0]["text"]


def test_reply_that_stays_invalid_raises():
    with pytest.raises(ClaimError):
        extract_claim("Chennai is getting hotter", post=fake_post("nope", '{"variable": 5}'))


def test_claim_about_a_variable_outside_the_catalog_cannot_be_tested():
    def fetch(*a):
        raise AssertionError("must not fetch data for an untestable claim")
    out = check_claim({**GOOD, "variable": "SEA_LEVEL"}, 13.08, 80.27, fetch=fetch)
    assert out["verdict"] == CANNOT
    res = client.post("/api/claim/check", json={**GOOD, "variable": "NONE", "lat": 13.08, "lon": 80.27})
    assert res.status_code == 200 and res.json()["verdict"] == CANNOT


def test_code_picks_the_verdict():
    def fetch_with(values):
        return lambda lat, lon, ids: {ids[0]: {"dates": DATES, "values": values}}
    up = noise(1, trend_per_year=0.05)
    assert check_claim(GOOD, 0, 0, fetch=fetch_with(up))["label"] == SUPPORTED
    assert check_claim({**GOOD, "direction": "down"}, 0, 0, fetch=fetch_with(up))["label"] == OTHER_WAY
    flat = check_claim(GOOD, 0, 0, fetch=fetch_with(noise(2)))
    assert flat["verdict"] == NOT_YET and flat["label"].startswith("Not proven yet (about ")
    assert check_claim({**GOOD, "start_year": 2022}, 0, 0, fetch=fetch_with(up))["verdict"] == CANNOT


def test_claim_read_needs_the_passcode(monkeypatch):
    monkeypatch.setenv("DETECTIVE_PASSCODE", "right")
    assert client.post("/api/claim/read", json={"text": "Chennai is getting hotter"},
                       headers={"X-Demo-Passcode": "wrong"}).status_code == 401


def test_saved_claim_examples_ship_with_the_app():
    root = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "claims"
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    assert len(index) == 3
    for e in index:
        d = json.loads((root / f"{e['id']}.json").read_text(encoding="utf-8"))
        assert validate_claim({k: d["extracted"][k] for k in GOOD})
        assert d["check"]["verdict"] in (SUPPORTED, NOT_YET, OTHER_WAY, CANNOT)


# ---------------------------------------------------------------- detective

def test_detective_can_suggest_variables():
    assert "suggest_variables" in {t["name"] for t in agent._tools_schema()}
    run = agent.default_executor()
    out = run("suggest_variables", {"place_type": "farm", "theme": "any"})
    assert 3 <= len(out) <= 5 and all("definition" in v for v in out)
    assert "suggest_variables" in agent.SYSTEM and "never say why" in agent.SYSTEM
