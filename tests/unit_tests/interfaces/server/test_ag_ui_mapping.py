from __future__ import annotations

from datetime import datetime, timezone

import pytest

from relay_teams.interfaces.server.ag_ui import (
    AgUiEventType,
    relay_run_event_to_ag_ui_event,
)
from relay_teams.sessions.runs.enums import RunEventType
from relay_teams.sessions.runs.run_models import RunEvent


@pytest.mark.parametrize(
    ("relay_type", "expected_type", "payload_json"),
    [
        (
            RunEventType.TEXT_DELTA,
            AgUiEventType.TEXT_DELTA,
            '{"text":"hello","unknown":{"keep":true}}',
        ),
        (
            RunEventType.THINKING_DELTA,
            AgUiEventType.THINKING_DELTA,
            '{"text":"reasoning"}',
        ),
        (
            RunEventType.TOOL_CALL,
            AgUiEventType.TOOL_CALL,
            '{"tool_call_id":"call-1","tool_name":"read_file"}',
        ),
        (
            RunEventType.TOOL_RESULT,
            AgUiEventType.TOOL_RESULT,
            '{"tool_call_id":"call-1","content":"done"}',
        ),
        (
            RunEventType.TOOL_APPROVAL_REQUESTED,
            AgUiEventType.TOOL_APPROVAL_REQUESTED,
            '{"tool_call_id":"call-1","options":[{"id":"approve"}]}',
        ),
        (
            RunEventType.USER_QUESTION_REQUESTED,
            AgUiEventType.USER_QUESTION_REQUESTED,
            '{"question_id":"question-1","questions":[{"question":"Ship it?"}]}',
        ),
        (
            RunEventType.TOKEN_USAGE,
            AgUiEventType.TOKEN_USAGE,
            '{"total_tokens":42,"by_role":{"writer":{"total_tokens":42}}}',
        ),
        (
            RunEventType.RUN_COMPLETED,
            AgUiEventType.RUN_COMPLETED,
            '{"status":"completed"}',
        ),
        (
            RunEventType.AWAITING_MANUAL_ACTION,
            AgUiEventType.RUN_AWAITING_MANUAL_ACTION,
            '{"title":"Waiting for user input"}',
        ),
        (
            RunEventType.LLM_RETRY_SCHEDULED,
            AgUiEventType.LLM_RETRY_SCHEDULED,
            '{"attempt":2,"delay_seconds":1.5}',
        ),
        (
            RunEventType.LLM_FALLBACK_ACTIVATED,
            AgUiEventType.LLM_FALLBACK_ACTIVATED,
            '{"from_profile_id":"default","to_profile_id":"fallback"}',
        ),
        (
            RunEventType.STATE_SNAPSHOT,
            AgUiEventType.STATE_SNAPSHOT,
            '{"state":{"phase":"running"}}',
        ),
        (
            RunEventType.STATE_DELTA,
            AgUiEventType.STATE_DELTA,
            '{"patch":[{"op":"replace","path":"/phase","value":"paused"}]}',
        ),
        (
            RunEventType.RUNTIME_GUARDRAIL_REPORT,
            AgUiEventType.RUNTIME_GUARDRAIL_REPORT,
            '{"status":"blocked","blocked_count":1}',
        ),
        (
            RunEventType.HOOK_STARTED,
            AgUiEventType.HOOK_STARTED,
            '{"hook_id":"hook-1"}',
        ),
    ],
)
def test_relay_run_event_to_ag_ui_event_maps_core_runtime_events(
    relay_type: RunEventType,
    expected_type: AgUiEventType,
    payload_json: str,
) -> None:
    ag_ui_event = relay_run_event_to_ag_ui_event(
        _run_event(relay_type, payload_json=payload_json)
    )

    assert ag_ui_event.type == expected_type
    assert ag_ui_event.event_id == 17
    assert ag_ui_event.session_id == "session-1"
    assert ag_ui_event.run_id == "run-1"
    assert ag_ui_event.trace_id == "run-1"
    assert ag_ui_event.task_id == "task-1"
    assert ag_ui_event.instance_id == "inst-1"
    assert ag_ui_event.role_id == "writer"
    assert ag_ui_event.relay_event_type == relay_type
    assert ag_ui_event.payload is not None


def test_relay_run_event_to_ag_ui_event_preserves_unknown_payload_fields() -> None:
    ag_ui_event = relay_run_event_to_ag_ui_event(
        _run_event(
            RunEventType.TOOL_RESULT,
            payload_json=(
                '{"tool_call_id":"call-1","future_field":{"nested":[1,true,"kept"]}}'
            ),
        )
    )

    assert ag_ui_event.payload == {
        "tool_call_id": "call-1",
        "future_field": {"nested": [1, True, "kept"]},
    }


def test_relay_run_event_to_ag_ui_event_maps_unclassified_events_to_relay_event() -> (
    None
):
    ag_ui_event = relay_run_event_to_ag_ui_event(
        _run_event(
            RunEventType.HOOK_MATCHED,
            payload_json='{"hook_id":"hook-1","future_field":"kept"}',
        )
    )

    assert ag_ui_event.type == AgUiEventType.RELAY_EVENT
    assert ag_ui_event.payload == {"hook_id": "hook-1", "future_field": "kept"}


def test_relay_run_event_to_ag_ui_event_preserves_malformed_payload_json() -> None:
    ag_ui_event = relay_run_event_to_ag_ui_event(
        _run_event(RunEventType.TEXT_DELTA, payload_json="{not-json")
    )

    assert ag_ui_event.payload == {"raw_payload_json": "{not-json"}


def _run_event(event_type: RunEventType, *, payload_json: str) -> RunEvent:
    return RunEvent(
        session_id="session-1",
        run_id="run-1",
        trace_id="run-1",
        task_id="task-1",
        instance_id="inst-1",
        role_id="writer",
        event_type=event_type,
        payload_json=payload_json,
        occurred_at=datetime(2026, 6, 23, 12, 0, tzinfo=timezone.utc),
        event_id=17,
    )
