# -*- coding: utf-8 -*-
from __future__ import annotations

import json

from pydantic_ai.messages import ToolCallPart

from relay_teams.agents.execution.event_publishing import EventPublishingService
from relay_teams.providers.provider_contracts import LLMRequest
from relay_teams.sessions.runs.enums import RunEventType
from relay_teams.sessions.runs.run_models import RunEvent
from relay_teams.sessions.session_rounds_projection import (
    _project_tool_messages_from_events,
)
from relay_teams.tools.registry import (
    ToolActionFamily,
    ToolRegistry,
    ToolSemanticCategory,
    ToolSemantics,
)


def _register_tool(_: object) -> None:
    return None


class _RunEventHub:
    def __init__(self) -> None:
        self.events: list[RunEvent] = []

    def publish(self, event: RunEvent) -> int:
        self.events.append(event)
        return len(self.events)


def _request() -> LLMRequest:
    return LLMRequest(
        run_id="run-1",
        trace_id="run-1",
        task_id="task-1",
        session_id="session-1",
        workspace_id="workspace-1",
        instance_id="instance-1",
        role_id="role-1",
        system_prompt="system",
        user_prompt="prompt",
    )


def test_tool_semantics_match_between_stream_event_and_replay_projection() -> None:
    semantics = ToolSemantics(
        semantic_category=ToolSemanticCategory.FILE_READ,
        action_family=ToolActionFamily.READ,
    )
    registry = ToolRegistry(
        {"renamed_reader": _register_tool},
        semantics={"renamed_reader": semantics},
    )
    hub = _RunEventHub()
    service = EventPublishingService(
        run_event_hub=hub,
        tool_registry=registry,
    )

    emitted = service.publish_observed_tool_call_event(
        request=_request(),
        part=ToolCallPart(
            tool_name="renamed_reader",
            args={"path": "src"},
            tool_call_id="call-1",
        ),
        batch_id="batch-1",
        batch_index=0,
        batch_size=1,
    )

    assert emitted is True
    stream_payload = json.loads(hub.events[0].payload_json)
    assert stream_payload["semantic_category"] == "file-read"
    assert stream_payload["action_family"] == "read"

    replay = _project_tool_messages_from_events(
        [
            {
                "event_type": RunEventType.TOOL_CALL.value,
                "trace_id": "run-1",
                "role_id": "role-1",
                "instance_id": "instance-1",
                "occurred_at": "2026-07-13T10:00:00Z",
                "payload_json": json.dumps(stream_payload),
            },
            {
                "event_type": RunEventType.TOOL_RESULT.value,
                "trace_id": "run-1",
                "role_id": "role-1",
                "instance_id": "instance-1",
                "occurred_at": "2026-07-13T10:00:01Z",
                "payload_json": json.dumps(
                    {
                        "tool_name": "renamed_reader",
                        "tool_call_id": "call-1",
                        "result": {"ok": True},
                    }
                ),
            },
        ]
    )

    parts: list[dict[str, object]] = []
    for projected_message in replay["run-1"]:
        body = projected_message["message"]
        assert isinstance(body, dict)
        body_parts = body["parts"]
        assert isinstance(body_parts, list)
        part = body_parts[0]
        assert isinstance(part, dict)
        parts.append(part)
    assert [part["semantic_category"] for part in parts] == [
        "file-read",
        "file-read",
    ]
    assert [part["action_family"] for part in parts] == ["read", "read"]
