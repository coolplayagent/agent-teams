# -*- coding: utf-8 -*-
from __future__ import annotations

import pytest

from agent_teams.mcp.models import (
    McpConfigScope,
    McpServerSpec,
    McpToolInfo,
)
from agent_teams.mcp.registry import McpRegistry
from agent_teams.mcp.service import McpService


def test_list_servers_reports_effective_transport() -> None:
    registry = McpRegistry(
        (
            McpServerSpec(
                name="filesystem",
                config={"mcpServers": {"filesystem": {"command": "npx"}}},
                server_config={"command": "npx"},
                source=McpConfigScope.PROJECT,
            ),
            McpServerSpec(
                name="remote",
                config={"mcpServers": {"remote": {"url": "https://example.com/sse"}}},
                server_config={"url": "https://example.com/sse"},
                source=McpConfigScope.USER,
            ),
        )
    )

    service = McpService(registry=registry)

    servers = service.list_servers()

    assert [server.name for server in servers] == ["filesystem", "remote"]
    assert [server.transport for server in servers] == ["stdio", "sse"]


@pytest.mark.asyncio
async def test_list_server_tools_uses_registry_result(monkeypatch) -> None:
    registry = McpRegistry(
        (
            McpServerSpec(
                name="filesystem",
                config={"mcpServers": {"filesystem": {"command": "npx"}}},
                server_config={"command": "npx"},
                source=McpConfigScope.PROJECT,
            ),
        )
    )

    async def fake_list_tools(name: str) -> tuple[McpToolInfo, ...]:
        assert name == "filesystem"
        return (
            McpToolInfo(name="read_file", description="Read a file"),
            McpToolInfo(name="write_file", description="Write a file"),
        )

    monkeypatch.setattr(registry, "list_tools", fake_list_tools)
    service = McpService(registry=registry)

    summary = await service.list_server_tools("filesystem")

    assert summary.server == "filesystem"
    assert summary.transport == "stdio"
    assert [tool.name for tool in summary.tools] == ["read_file", "write_file"]
