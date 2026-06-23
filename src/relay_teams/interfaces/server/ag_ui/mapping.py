from __future__ import annotations

import json

from pydantic import JsonValue, TypeAdapter, ValidationError

from relay_teams.interfaces.server.ag_ui.contracts import (
    AgUiEventType,
    AgUiRunEvent,
)
from relay_teams.sessions.runs.enums import RunEventType
from relay_teams.sessions.runs.run_models import RunEvent

JSON_VALUE_ADAPTER = TypeAdapter(JsonValue)

RUN_EVENT_TYPE_TO_AG_UI_TYPE: dict[RunEventType, AgUiEventType] = {
    RunEventType.RUN_STARTED: AgUiEventType.RUN_STARTED,
    RunEventType.RUN_PAUSED: AgUiEventType.RUN_PAUSED,
    RunEventType.RUN_RESUMED: AgUiEventType.RUN_RESUMED,
    RunEventType.RUN_COMPLETED: AgUiEventType.RUN_COMPLETED,
    RunEventType.RUN_STOPPED: AgUiEventType.RUN_STOPPED,
    RunEventType.RUN_FAILED: AgUiEventType.RUN_FAILED,
    RunEventType.MODEL_STEP_STARTED: AgUiEventType.MODEL_STEP_STARTED,
    RunEventType.MODEL_STEP_FINISHED: AgUiEventType.MODEL_STEP_FINISHED,
    RunEventType.TEXT_DELTA: AgUiEventType.TEXT_DELTA,
    RunEventType.OUTPUT_DELTA: AgUiEventType.OUTPUT_DELTA,
    RunEventType.GENERATION_PROGRESS: AgUiEventType.GENERATION_PROGRESS,
    RunEventType.THINKING_STARTED: AgUiEventType.THINKING_STARTED,
    RunEventType.THINKING_DELTA: AgUiEventType.THINKING_DELTA,
    RunEventType.THINKING_FINISHED: AgUiEventType.THINKING_FINISHED,
    RunEventType.TOOL_CALL: AgUiEventType.TOOL_CALL,
    RunEventType.TOOL_CALL_BATCH_SEALED: AgUiEventType.TOOL_CALL_BATCH_SEALED,
    RunEventType.TOOL_INPUT_VALIDATION_FAILED: (
        AgUiEventType.TOOL_INPUT_VALIDATION_FAILED
    ),
    RunEventType.TOOL_RESULT: AgUiEventType.TOOL_RESULT,
    RunEventType.TOOL_APPROVAL_REQUESTED: AgUiEventType.TOOL_APPROVAL_REQUESTED,
    RunEventType.TOOL_APPROVAL_RESOLVED: AgUiEventType.TOOL_APPROVAL_RESOLVED,
    RunEventType.USER_QUESTION_REQUESTED: AgUiEventType.USER_QUESTION_REQUESTED,
    RunEventType.USER_QUESTION_ANSWERED: AgUiEventType.USER_QUESTION_ANSWERED,
    RunEventType.INJECTION_ENQUEUED: AgUiEventType.INJECTION_ENQUEUED,
    RunEventType.INJECTION_APPLIED: AgUiEventType.INJECTION_APPLIED,
    RunEventType.TOKEN_USAGE: AgUiEventType.TOKEN_USAGE,
    RunEventType.TODO_UPDATED: AgUiEventType.TODO_UPDATED,
    RunEventType.BACKGROUND_TASK_STARTED: AgUiEventType.BACKGROUND_TASK_STARTED,
    RunEventType.BACKGROUND_TASK_UPDATED: AgUiEventType.BACKGROUND_TASK_UPDATED,
    RunEventType.BACKGROUND_TASK_COMPLETED: AgUiEventType.BACKGROUND_TASK_COMPLETED,
    RunEventType.BACKGROUND_TASK_STOPPED: AgUiEventType.BACKGROUND_TASK_STOPPED,
    RunEventType.SUBAGENT_SESSION_STATUS_CHANGED: (
        AgUiEventType.SUBAGENT_SESSION_STATUS_CHANGED
    ),
    RunEventType.SUBAGENT_STOPPED: AgUiEventType.SUBAGENT_STOPPED,
    RunEventType.SUBAGENT_RESUMED: AgUiEventType.SUBAGENT_RESUMED,
    RunEventType.NOTIFICATION_REQUESTED: AgUiEventType.NOTIFICATION_REQUESTED,
}


def relay_run_event_to_ag_ui_event(event: RunEvent) -> AgUiRunEvent:
    return AgUiRunEvent(
        type=RUN_EVENT_TYPE_TO_AG_UI_TYPE.get(
            event.event_type,
            AgUiEventType.RELAY_EVENT,
        ),
        event_id=event.event_id,
        session_id=event.session_id,
        run_id=event.run_id,
        trace_id=event.trace_id,
        task_id=event.task_id,
        instance_id=event.instance_id,
        role_id=event.role_id,
        relay_event_type=event.event_type,
        occurred_at=event.occurred_at.isoformat(),
        payload=_parse_payload_json(event.payload_json),
    )


def _parse_payload_json(payload_json: str) -> JsonValue:
    try:
        parsed = json.loads(payload_json or "null")
    except json.JSONDecodeError:
        return {"raw_payload_json": payload_json}
    try:
        return JSON_VALUE_ADAPTER.validate_python(parsed)
    except ValidationError:
        return {"raw_payload_json": payload_json}
