"""Noise Trap as an MCP server, so Claude (or any MCP client) can use our tested tools as a connector.

Served at /mcp by api.main. Read-only and keyless: the same four tools the AI Detective uses, run by the
same executor, so a connector answer and a Detective answer come from identical code.
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from trendlab.agent import _tools_schema, default_executor

mcp = MCPServer(
    "Noise Trap",
    instructions=("Trend tests on NASA POWER monthly data (1981-2025). Each result gives the usual Mann-Kendall verdict "
                  "and an honest one (pre-whitened, false discovery rate controlled). Prefer the honest verdict, and "
                  "never state a cause for a trend."),
)
_run = default_executor()
_about = {t["name"]: t["description"] for t in _tools_schema()}


@mcp.tool(description=_about["list_variables"])
def list_variables() -> dict:
    return _run("list_variables", {})


@mcp.tool(description=_about["analyze_point"])
def analyze_point(lat: float, lon: float, variable: str) -> dict:
    return _run("analyze_point", {"lat": lat, "lon": lon, "variable": variable})


@mcp.tool(description=_about["scan_region"])
def scan_region(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> dict:
    return _run("scan_region", {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max})


@mcp.tool(description=_about["noise_check"])
def noise_check(phi: float) -> dict:
    return _run("noise_check", {"phi": phi})


# Host-header (DNS rebinding) checks are for servers on a user's own machine. This one is public, has no
# login or cookies and only reads public NASA data, so any host name may reach it.
http_app = mcp.streamable_http_app(
    stateless_http=True, json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)
