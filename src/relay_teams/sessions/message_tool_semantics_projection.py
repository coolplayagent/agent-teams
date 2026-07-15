# -*- coding: utf-8 -*-
from __future__ import annotations

from relay_teams.tools.registry import ToolRegistry
from relay_teams.tools.registry.semantics import UNKNOWN_TOOL_SEMANTICS


TOOL_PART_KINDS = frozenset(("tool-call", "tool-return", "retry-prompt"))


def project_message_tool_semantics(
    messages: list[dict[str, object]],
    *,
    tool_registry: ToolRegistry | None,
) -> list[dict[str, object]]:
    """Project registry-owned presentation semantics onto persisted tool parts."""
    return [
        _project_message_tool_semantics(message, tool_registry=tool_registry)
        for message in messages
    ]


def _project_message_tool_semantics(
    message: dict[str, object],
    *,
    tool_registry: ToolRegistry | None,
) -> dict[str, object]:
    raw_message = message.get("message")
    if not isinstance(raw_message, dict):
        return message
    raw_parts = raw_message.get("parts")
    if not isinstance(raw_parts, list):
        return message

    projected_parts: list[object] = []
    changed = False
    for raw_part in raw_parts:
        if not isinstance(raw_part, dict):
            projected_parts.append(raw_part)
            continue
        part_kind = str(raw_part.get("part_kind") or "").strip()
        if part_kind not in TOOL_PART_KINDS:
            projected_parts.append(raw_part)
            continue
        tool_name = str(raw_part.get("tool_name") or "").strip()
        semantics = (
            tool_registry.get_tool_semantics(tool_name)
            if tool_registry is not None
            else UNKNOWN_TOOL_SEMANTICS
        )
        projected_part = {
            **raw_part,
            "semantic_category": semantics.semantic_category.value,
            "action_family": semantics.action_family.value,
        }
        projected_parts.append(projected_part)
        changed = changed or projected_part != raw_part

    if not changed:
        return message
    return {
        **message,
        "message": {
            **raw_message,
            "parts": projected_parts,
        },
    }
