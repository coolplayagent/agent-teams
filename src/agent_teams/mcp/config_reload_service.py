# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Callable

from agent_teams.mcp.config_manager import McpConfigManager
from agent_teams.mcp.registry import McpRegistry
from agent_teams.roles.registry import RoleRegistry


class McpConfigReloadService:
    def __init__(
        self,
        *,
        mcp_config_manager: McpConfigManager,
        role_registry: RoleRegistry,
        on_mcp_reloaded: Callable[[McpRegistry], None],
    ) -> None:
        self._mcp_config_manager: McpConfigManager = mcp_config_manager
        self._role_registry: RoleRegistry = role_registry
        self._on_mcp_reloaded: Callable[[McpRegistry], None] = on_mcp_reloaded

    def reload_mcp_config(self) -> None:
        mcp_registry = self._mcp_config_manager.load_registry()
        for role in self._role_registry.list_roles():
            mcp_registry.validate_known(role.mcp_servers)
        self._on_mcp_reloaded(mcp_registry)
