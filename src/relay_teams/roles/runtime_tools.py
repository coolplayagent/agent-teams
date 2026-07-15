# -*- coding: utf-8 -*-
from __future__ import annotations

import logging

from relay_teams.logger import get_logger, log_event
from relay_teams.roles.role_contracts import RoleContractInvariantType
from relay_teams.roles.role_models import RoleDefinition
from relay_teams.roles.role_registry import RoleRegistry

LOGGER = get_logger(__name__)


def runtime_tools_for_role(
    *,
    role_registry: RoleRegistry,
    role: RoleDefinition,
    consumer: str,
) -> tuple[str, ...]:
    _ = role_registry
    return strip_contract_denied_tools(
        role=role,
        tools=role.tools,
        consumer=consumer,
    )


def role_with_runtime_tools(
    *,
    role_registry: RoleRegistry,
    role: RoleDefinition,
    consumer: str,
) -> RoleDefinition:
    filtered = runtime_tools_for_role(
        role_registry=role_registry,
        role=role,
        consumer=consumer,
    )
    if filtered == role.tools:
        return role
    return role.model_copy(update={"tools": filtered})


def strip_contract_denied_tools(
    *,
    role: RoleDefinition,
    tools: tuple[str, ...],
    consumer: str,
) -> tuple[str, ...]:
    denied_tools = runtime_denied_tools_for_role(role)
    if not denied_tools:
        return tools
    denied_set = set(denied_tools)
    filtered = tuple(tool for tool in tools if tool not in denied_set)
    if filtered != tools:
        log_event(
            LOGGER,
            logging.WARNING,
            event="roles.runtime_tools.filtered_contract_denied_tools",
            message="Filtered role-contract denied tools from runtime role tools",
            payload={
                "role_id": role.role_id,
                "consumer": consumer,
                "removed_tools": [tool for tool in tools if tool in denied_set],
            },
        )
    return filtered


def runtime_denied_tools_for_role(role: RoleDefinition) -> tuple[str, ...]:
    denied_tools: list[str] = []
    seen: set[str] = set()
    for invariant in role.contract.invariants:
        if invariant.invariant != RoleContractInvariantType.MUST_NOT_HAVE_TOOLS:
            continue
        for tool in invariant.tools:
            if tool in seen:
                continue
            seen.add(tool)
            denied_tools.append(tool)
    return tuple(denied_tools)
