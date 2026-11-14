"""Checks for the public deploy: the Detective passcode, the Gemini loop and preset-only scans.
No test here calls a real AI service or NASA."""

import pytest
from fastapi.testclient import TestClient

import api.agent_routes as routes
import api.main as m
from api.scan_routes import PRESETS, snap_to_preset
from trendlab import agent

client = TestClient(m.app)
ASK = {"question": "Is Chennai getting hotter?"}


def test_live_detective_is_off_without_a_passcode_on_the_server(monkeypatch):
    monkeypatch.delenv("DETECTIVE_PASSCODE", raising=False)
    assert client.post("/api/agent", json=ASK).status_code == 503


def test_live_detective_needs_the_right_passcode(monkeypatch):
    monkeypatch.setenv("DETECTIVE_PASSCODE", "open-sesame")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    seen = []
    monkeypatch.setattr(routes, "ask_gemini", lambda q, history: seen.append(history) or {"answer": "ok", "trace": []})
    assert client.post("/api/agent", json=ASK).status_code == 401
    assert client.post("/api/agent", json=ASK, headers={"X-Demo-Passcode": "wrong"}).status_code == 401
    follow_up = {**ASK, "history": [{"question": "Is Delhi warming?", "answer": "Yes."}]}
    r = client.post("/api/agent", json=follow_up, headers={"X-Demo-Passcode": "open-sesame"})
    assert r.status_code == 200 and r.json()["answer"] == "ok"
    assert seen == [[{"question": "Is Delhi warming?", "answer": "Yes."}]]  # follow-ups reach the Gemini path too


class FakeReply:
    def __init__(self, parts):
        self.parts = parts

    def raise_for_status(self):
        pass

    def json(self):
        return {"candidates": [{"content": {"role": "model", "parts": self.parts}, "finishReason": "STOP"}]}


def test_gemini_loop_runs_tools_and_returns_the_trace(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    replies = [FakeReply([{"functionCall": {"name": "noise_check", "args": {"phi": 0.5}}, "thoughtSignature": "sig"}]),
               FakeReply([{"text": "The usual test is fooled."}])]
    sent = []

    def post(url, **kw):
        sent.append((url, kw))
        return replies.pop(0)

    history = [{"question": "What is phi?", "answer": "Month-to-month stickiness."}]
    out = agent.ask_gemini("Does noise fool the usual test?", post=post, history=history,
                           executor=lambda name, args: {"usual_method_fake_trend_share": 0.21})
    assert out["answer"] == "The usual test is fooled."
    assert out["trace"][0]["tool"] == "noise_check" and out["trace"][0]["ok"]
    assert out["checks"] == {"numbers_checked": 0, "unverified": []}
    url, first = sent[0]
    assert agent.GEMINI_MODEL in url and first["headers"]["x-goog-api-key"] == "test-key"
    names = [f["name"] for f in first["json"]["tools"][0]["function_declarations"]]
    assert names == [t["name"] for t in agent._tools_schema()]
    assert first["json"]["contents"][1] == {"role": "model", "parts": [{"text": "Month-to-month stickiness."}]}
    # the second request returns the model's own turn unchanged, then our tool result
    turns = sent[1][1]["json"]["contents"][2:]
    assert turns[1]["parts"][0]["thoughtSignature"] == "sig"
    assert turns[2]["parts"][0]["functionResponse"]["response"]["result"]["usual_method_fake_trend_share"] == 0.21


def test_numbers_quoted_from_our_notes_are_not_flagged():
    out = agent._finish("On sticky noise the usual test flagged 32.0% and ours 3.8%; and 47.3% somewhere.",
                        [], "question?", "STOP", "test")
    assert out["checks"]["unverified"] == ["47.3"]  # 32.0 and 3.8 are in docs/detective-notes.md


def test_gemini_loop_stops_after_its_turn_limit(monkeypatch):
    calls = []

    def post(url, **kw):
        calls.append(1)
        return FakeReply([{"functionCall": {"name": "list_variables", "args": {}}}])

    out = agent.ask_gemini("loop?", post=post, executor=lambda name, args: {})
    assert len(calls) == agent.GEMINI_TURNS and "could not finish" in out["answer"]


def test_system_prompt_carries_our_notes():
    text = agent.system_prompt()
    assert text.startswith(agent.SYSTEM) and "Team notes (checked" in text
    assert "## The three stages of evidence" in text


def test_a_box_snaps_to_the_preset_it_overlaps_most():
    assert snap_to_preset((10.0, 12.0, 78.0, 80.0))["id"] == "tamilnadu"
    assert snap_to_preset((0.0, 2.0, 0.0, 2.0)) is None  # open ocean, no preset near


def test_detective_scan_reads_a_saved_region_and_refuses_a_new_box():
    run = agent.default_executor()
    out = run("scan_region", {"lat_min": 10.0, "lat_max": 12.0, "lon_min": 78.0, "lon_max": 80.0})
    assert out["region"] == "Tamil Nadu & Cauvery delta" and out["findings"]
    with pytest.raises(ValueError, match="No pre-computed region"):
        run("scan_region", {"lat_min": 0.0, "lat_max": 2.0, "lon_min": 0.0, "lon_max": 2.0})


def test_scan_endpoint_serves_a_preset_and_rejects_a_bad_box():
    a, b, c, d = PRESETS[0]["bbox"]
    r = client.get(f"/api/scan?lat_min={a}&lat_max={b}&lon_min={c}&lon_max={d}&perms=499")  # perms is ignored now
    assert r.status_code == 200 and r.json()["findings"]
    assert client.get("/api/scan?lat_min=-60&lat_max=60&lon_min=-150&lon_max=150").status_code == 400

