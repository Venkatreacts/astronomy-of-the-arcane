"""MCP connector at /mcp: other apps can list and call the same tools as the Detective."""
import json

from fastapi.testclient import TestClient

from api.main import app

H = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def rpc(client, method, params=None, id_=1):
    r = client.post("/mcp", headers=H, json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
    assert r.status_code == 200, r.text
    return r.json()


def test_mcp_lists_and_calls_tools():
    with TestClient(app) as c:
        init = rpc(c, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                     "clientInfo": {"name": "test", "version": "0"}})
        assert init["result"]["serverInfo"]["name"] == "noise-trap"
        names = {t["name"] for t in rpc(c, "tools/list")["result"]["tools"]}
        assert {"list_variables", "analyze_point", "scan_region", "noise_check"} <= names
        out = rpc(c, "tools/call", {"name": "list_regions", "arguments": {}})["result"]
        assert not out.get("isError")
        assert json.loads(out["content"][0]["text"])  # offline pre-computed regions, real JSON
        bad = rpc(c, "tools/call", {"name": "rm_rf", "arguments": {}})["result"]
        assert bad["isError"] and "Unknown tool" in bad["content"][0]["text"]


def test_mcp_survives_second_app_start():
    for _ in range(2):
        with TestClient(app) as c:
            assert rpc(c, "tools/list")["result"]["tools"]
