"""Checks for the public deploy: the Detective passcode, the Gemini loop, preset-only scans and the MCP connector.
No test here calls a real AI service or NASA."""

import asyncio

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
    monkeypatch.setattr(routes, "ask_gemini", lambda q: {"answer": "ok", "trace": []})
    assert client.post("/api/agent", json=ASK).status_code == 401
    assert client.post("/api/agent", json=ASK, headers={"X-Demo-Passcode": "wrong"}).status_code == 401
    r = client.post("/api/agent", json=ASK, headers={"X-Demo-Passcode": "open-sesame"})
    assert r.status_code == 200 and r.json()["answer"] == "ok"


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

    out = agent.ask_gemini("Does noise fool the usual test?", post=post,
                           executor=lambda name, args: {"usual_method_fake_trend_share": 0.21})
    assert out["answer"] == "The usual test is fooled."
    assert out["trace"][0]["tool"] == "noise_check" and out["trace"][0]["ok"]
    url, first = sent[0]
    assert agent.GEMINI_MODEL in url and first["headers"]["x-goog-api-key"] == "test-key"
    names = [f["name"] for f in first["json"]["tools"][0]["function_declarations"]]
    assert names == ["list_variables", "analyze_point", "scan_region", "noise_check"]
    # the second request returns the model's own turn unchanged, then our tool result
    turns = sent[1][1]["json"]["contents"]
    assert turns[1]["parts"][0]["thoughtSignature"] == "sig"
    assert turns[2]["parts"][0]["functionResponse"]["response"]["result"]["usual_method_fake_trend_share"] == 0.21


def test_gemini_loop_stops_after_its_turn_limit(monkeypatch):
    calls = []

    def post(url, **kw):
        calls.append(1)
        return FakeReply([{"functionCall": {"name": "list_variables", "args": {}}}])

    out = agent.ask_gemini("loop?", post=post, executor=lambda name, args: {})
    assert len(calls) == agent.GEMINI_TURNS and "could not finish" in out["answer"]


def test_system_prompt_carries_our_notes_and_saved_results():
    text = agent.system_prompt()
    assert "Notes (written and checked by the team)" in text
    assert "Is my city changing? Chennai" in text and "tamilnadu region scan" in text


def test_a_box_snaps_to_the_preset_it_overlaps_most():
    assert snap_to_preset((10.0, 12.0, 78.0, 80.0))["id"] == "tamilnadu"
    assert snap_to_preset((0.0, 2.0, 0.0, 2.0)) is None  # open ocean, no preset near


def test_detective_scan_reads_a_saved_region_and_refuses_a_new_box():
    run = agent.default_executor()
    out = run("scan_region", {"lat_min": 10.0, "lat_max": 12.0, "lon_min": 78.0, "lon_max": 80.0})
    assert out["region"] == "Tamil Nadu & Cauvery delta" and out["findings"]
    with pytest.raises(ValueError, match="No pre-scanned region"):
        run("scan_region", {"lat_min": 0.0, "lat_max": 2.0, "lon_min": 0.0, "lon_max": 2.0})


def test_scan_endpoint_serves_a_preset_and_rejects_a_bad_box():
    a, b, c, d = PRESETS[0]["bbox"]
    r = client.get(f"/api/scan?lat_min={a}&lat_max={b}&lon_min={c}&lon_max={d}&perms=499")  # perms is ignored now
    assert r.status_code == 200 and r.json()["findings"]
    assert client.get("/api/scan?lat_min=-60&lat_max=60&lon_min=-150&lon_max=150").status_code == 400


def test_mcp_connector_offers_the_same_four_tools():
    from api.mcp_server import mcp
    tools = asyncio.run(mcp.list_tools())
    assert sorted(t.name for t in tools) == ["analyze_point", "list_variables", "noise_check", "scan_region"]


def test_mcp_endpoint_answers_over_http():
    with TestClient(m.app) as live:  # the with-block runs the app lifespan, which starts the MCP session manager
        r = live.post("/mcp", headers={"Accept": "application/json, text/event-stream"}, json={
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "noise_check", "arguments": {"phi": 0.5}}})
        assert r.status_code == 200 and "usual_method_fake_trend_share" in r.text
