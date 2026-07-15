from __future__ import annotations

import pytest

from relay_teams.sessions.message_tool_semantics_projection import (
    project_message_tool_semantics,
)
from relay_teams.tools.registry.defaults import build_default_registry


def test_projects_registry_semantics_without_mutating_persisted_message() -> None:
    messages: list[dict[str, object]] = [
        {
            "message": {
                "parts": [
                    {
                        "part_kind": "tool-call",
                        "tool_name": "orch_dispatch_task",
                        "tool_call_id": "call-1",
                        "semantic_category": "stale",
                        "action_family": "stale",
                    },
                    {
                        "part_kind": "tool-return",
                        "tool_name": "orch_dispatch_task",
                        "tool_call_id": "call-1",
                    },
                    {
                        "part_kind": "tool-call",
                        "tool_name": "plugin_without_semantics",
                        "tool_call_id": "call-2",
                    },
                ]
            }
        }
    ]

    projected = project_message_tool_semantics(
        messages,
        tool_registry=build_default_registry(),
    )

    projected_message = projected[0]["message"]
    assert isinstance(projected_message, dict)
    projected_parts = projected_message["parts"]
    assert isinstance(projected_parts, list)
    assert projected_parts[0]["semantic_category"] == "orchestration"
    assert projected_parts[0]["action_family"] == "subagent"
    assert projected_parts[1]["semantic_category"] == "orchestration"
    assert projected_parts[1]["action_family"] == "subagent"
    assert projected_parts[2]["semantic_category"] == "unknown"
    assert projected_parts[2]["action_family"] == "generic"

    original_message = messages[0]["message"]
    assert isinstance(original_message, dict)
    original_parts = original_message["parts"]
    assert isinstance(original_parts, list)
    assert original_parts[0]["semantic_category"] == "stale"
    assert "semantic_category" not in original_parts[1]


def test_non_tool_parts_retain_object_identity() -> None:
    text_part = {"part_kind": "text", "content": "complete"}
    messages: list[dict[str, object]] = [{"message": {"parts": [text_part]}}]

    projected = project_message_tool_semantics(
        messages,
        tool_registry=build_default_registry(),
    )

    assert projected[0] is messages[0]
    assert projected[0]["message"] is messages[0]["message"]


@pytest.mark.parametrize(
    "tool_name",
    (
        "orch_create_tasks",
        "orch_create_temporary_role",
        "orch_list_available_roles",
        "orch_list_delegated_tasks",
        "orch_update_task",
    ),
)
def test_other_orchestration_tools_keep_registry_category(tool_name: str) -> None:
    messages: list[dict[str, object]] = [
        {
            "message": {
                "parts": [
                    {
                        "part_kind": "tool-call",
                        "tool_name": tool_name,
                    }
                ]
            }
        }
    ]

    projected = project_message_tool_semantics(
        messages,
        tool_registry=build_default_registry(),
    )

    projected_message = projected[0]["message"]
    assert isinstance(projected_message, dict)
    projected_parts = projected_message["parts"]
    assert isinstance(projected_parts, list)
    assert projected_parts[0]["semantic_category"] == "orchestration"
    assert projected_parts[0]["action_family"] == "orchestration"
