"""MCP connector: other apps and AI assistants can call Noise Trap's tools at /mcp (streamable HTTP).

Same 10 tools and the same code as the AI Detective, so answers match the web app. No AI model and no key
is involved here: the caller's own assistant does the talking, we only run the tests.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from functools import lru_cache

import anyio
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

from trendlab.agent import _jsonable, _tools_schema, default_executor

INSTRUCTIONS = ("Noise Trap tests whether a trend in NASA Earth data is real or just noise. Each result has three "
                "stages: the usual Mann-Kendall test, the test with stickiness (lag-1 autocorrelation) removed, and the "
                "honest verdict after false-discovery control. Quote the honest verdict; never say why a trend exists.")


@lru_cache(maxsize=1)
def _run():
    return default_executor()


async def list_tools(ctx, params) -> types.ListToolsResult:
    return types.ListToolsResult(tools=[
        types.Tool(name=t["name"], description=t["description"], input_schema=t["input_schema"],
                   annotations=types.ToolAnnotations(read_only_hint=True, open_world_hint=t["name"] == "analyze_point"))
        for t in _tools_schema()])


async def call_tool(ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
    names = {t["name"] for t in _tools_schema()}
    if params.name not in names:
        return _error(f"Unknown tool {params.name!r}. Tools: {', '.join(sorted(names))}.")
    try:
        # tools are blocking (live NASA calls, simulations); keep the event loop free for other callers
        out = await anyio.to_thread.run_sync(_run(), params.name, dict(params.arguments or {}))
    except Exception as e:  # a bad argument or a NASA outage becomes a readable tool error, not a dropped connection
        return _error(f"{type(e).__name__}: {e}")
    return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(_jsonable(out)))])


def _error(msg: str) -> types.CallToolResult:
    return types.CallToolResult(content=[types.TextContent(type="text", text=msg)], is_error=True)


server = Server("noise-trap", version="0.1.0", title="Noise Trap", instructions=INSTRUCTIONS,
                on_list_tools=list_tools, on_call_tool=call_tool)
manager: StreamableHTTPSessionManager | None = None


class _App:  # a class, not a function, so Starlette routes the raw ASGI call to it (exact /mcp, no slash redirect)
    async def __call__(self, scope, receive, send):
        if manager is None:
            raise RuntimeError("MCP manager not started; run the app with its lifespan")
        await manager.handle_request(scope, receive, send)


asgi = _App()


@asynccontextmanager
async def lifespan(app):
    global manager
    # a manager runs once, so each app start gets its own. Stateless + JSON: each request stands alone,
    # so a Render restart or a second instance never loses a session.
    manager = StreamableHTTPSessionManager(app=server, stateless=True, json_response=True)
    async with manager.run():
        yield
