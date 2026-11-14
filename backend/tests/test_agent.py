"""Agent loop tests with a fake Claude client (no API key or network needed)."""

from types import SimpleNamespace as NS

from trendlab import agent


def text(t):
    return NS(type="text", text=t)


def tool(id_, name, inp):
    return NS(type="tool_use", id=id_, name=name, input=inp)


class FakeClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []
        self.beta = NS(messages=NS(create=self._create))

    def _create(self, **kw):
        self.calls.append(kw)
        return self.replies.pop(0)


def test_loop_runs_tools_and_returns_trace():
    replies = [
        NS(stop_reason="tool_use", content=[tool("t1", "noise_check", {"phi": 0.5})], model=agent.MODEL),
        NS(stop_reason="end_turn", content=[text("The usual method finds fake trends.")], model=agent.MODEL),
    ]
    fake = FakeClient(replies)
    out = agent.ask("Does noise fool the usual method?", client=fake,
                    executor=lambda n, a: {"usual_method_fake_trend_share": 0.21})
    assert out["answer"].startswith("The usual method")
    assert out["trace"][0]["tool"] == "noise_check" and out["trace"][0]["ok"]
    sent = fake.calls[0]
    assert sent["model"] == "claude-opus-5-5" and sent["fallbacks"] == "default"
    assert all(t["strict"] for t in sent["tools"])
    # Second request carries the tool result back.
    assert fake.calls[1]["messages"][-1]["content"][0]["type"] == "tool_result"


def test_tool_budget_is_enforced():
    many = [tool(f"t{i}", "list_variables", {}) for i in range(8)]
    replies = [NS(stop_reason="tool_use", content=many, model=agent.MODEL),
               NS(stop_reason="end_turn", content=[text("done")], model=agent.MODEL)]
    out = agent.ask("question?", client=FakeClient(replies), executor=lambda n, a: {"ok": 1})
    assert sum(t["ok"] for t in out["trace"]) == agent.MAX_TOOL_CALLS
    assert not out["trace"][-1]["ok"]


def test_tool_errors_are_reported_not_raised():
    def boom(name, args):
        raise RuntimeError("NASA POWER down")
    replies = [NS(stop_reason="tool_use", content=[tool("t1", "scan_region", {"lat_min": 1})], model=agent.MODEL),
               NS(stop_reason="end_turn", content=[text("Could not scan.")], model=agent.MODEL)]
    out = agent.ask("scan?", client=FakeClient(replies), executor=boom)
    assert out["trace"][0]["ok"] is False and "NASA POWER down" in out["trace"][0]["result_preview"]


def test_refusal_is_handled():
    replies = [NS(stop_reason="refusal", content=[], model=agent.MODEL)]
    out = agent.ask("question?", client=FakeClient(replies), executor=lambda n, a: {})
    assert "declined" in out["answer"]
