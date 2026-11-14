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
    many = [tool(f"t{i}", "list_variables", {}) for i in range(agent.MAX_TOOL_CALLS + 2)]
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


def test_follow_up_sends_earlier_turns():
    replies = [NS(stop_reason="end_turn", content=[text("Yes.")], model=agent.MODEL)]
    fake = FakeClient(replies)
    agent.ask("And is it real?", client=fake, executor=lambda n, a: {},
              history=[{"question": "Is Chennai warming?", "answer": "By 0.2 degC per decade."}])
    msgs = fake.calls[0]["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert msgs[-1]["content"] == "And is it real?"


def test_numbers_in_the_answer_are_traced_to_tool_results():
    trace = [{"tool": "atlas_point", "ok": True, "result": {"rate_per_decade": 0.2764, "usual_p": 0.00031,
                                                           "share": 0.787, "period": ["1981-01", "2025-12"]}}]
    good = agent.check_numbers("Warming of 0.276 degC per decade since 1981 (p = 0.0003); 78.7% of points.", trace)
    assert good["unverified"] == [] and good["numbers_checked"] == 4
    bad = agent.check_numbers("Warming of 0.45 degC per decade, about 37% of points.", trace)
    assert bad["unverified"] == ["0.45", "37"]


def test_failed_tool_results_do_not_count_as_evidence():
    trace = [{"tool": "analyze_point", "ok": False, "result": {"error": "rate 0.91 unavailable"}}]
    assert agent.check_numbers("The rate is 0.91.", trace)["unverified"] == ["0.91"]


def test_new_tools_are_strict_and_offline_tools_work():
    import api.main  # noqa: F401  (puts backend/data on the path, as the server does)
    names = {t["name"] for t in agent._tools_schema()}
    assert {"atlas_point", "atlas_overview", "list_regions", "compare_regions", "simulation_lab"} <= names
    assert all(t["input_schema"]["additionalProperties"] is False for t in agent._tools_schema())
    run = agent.default_executor()
    pt = run("atlas_point", {"lat": 13.08, "lon": 80.27})
    assert pt["sample_point"] == [12.5, 82.5]  # the 5-degree cell holding Chennai and len(pt["variables"]) == 5
    cmp = run("compare_regions", {"region_a": "tamilnadu", "region_b": "sahel"})
    assert "no p-value" in cmp["note"] and cmp["tamilnadu"]["variables"]["Air temperature"]["tested_pixels"] > 0
    lab = run("simulation_lab", {"phi": 0.55, "years": 40, "trend": 0})
    assert lab["settings_used"]["phi"] == 0.5 and lab["usual"]["false_alarm"]["mean"] > lab["honest_fdr"]["false_alarm"]["mean"]
