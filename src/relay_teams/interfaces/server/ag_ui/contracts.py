from __future__ import annotations

from enum import Enum
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator

from relay_teams.agents.orchestration.policy_models import OrchestrationPolicy
from relay_teams.media import ContentPart
from relay_teams.sessions.runs.enums import (
    ExecutionMode,
    InjectionDeliveryMode,
    InjectionSource,
    RunEventType,
)
from relay_teams.sessions.runs.run_config_models import (
    MediaGenerationConfig,
    RunKind,
    RunThinkingConfig,
)
from relay_teams.validation import (
    OptionalIdentifierStr,
    RequiredIdentifierStr,
    normalize_identifier_tuple,
)


class AgUiEventType(str, Enum):
    RUN_STARTED = "run.started"
    RUN_PAUSED = "run.paused"
    RUN_RESUMED = "run.resumed"
    RUN_COMPLETED = "run.completed"
    RUN_STOPPED = "run.stopped"
    RUN_FAILED = "run.failed"
    RUN_AWAITING_MANUAL_ACTION = "run.awaiting_manual_action"
    LLM_RETRY_SCHEDULED = "llm_retry.scheduled"
    LLM_RETRY_EXHAUSTED = "llm_retry.exhausted"
    LLM_FALLBACK_ACTIVATED = "llm_fallback.activated"
    LLM_FALLBACK_EXHAUSTED = "llm_fallback.exhausted"
    STATE_SNAPSHOT = "state.snapshot"
    STATE_DELTA = "state.delta"
    MODEL_STEP_STARTED = "model_step.started"
    MODEL_STEP_FINISHED = "model_step.finished"
    MODEL_REQUEST_WAITING = "model_request.waiting"
    MODEL_REQUEST_ACQUIRED = "model_request.acquired"
    TEXT_DELTA = "message.text.delta"
    OUTPUT_DELTA = "message.output.delta"
    GENERATION_PROGRESS = "generation.progress"
    THINKING_STARTED = "thinking.started"
    THINKING_DELTA = "thinking.delta"
    THINKING_FINISHED = "thinking.finished"
    TOOL_CALL = "tool_call.started"
    TOOL_CALL_BATCH_SEALED = "tool_call.batch_sealed"
    TOOL_INPUT_VALIDATION_FAILED = "tool_call.validation_failed"
    TOOL_RESULT = "tool_result.completed"
    TOOL_APPROVAL_REQUESTED = "tool_approval.requested"
    TOOL_APPROVAL_RESOLVED = "tool_approval.resolved"
    USER_QUESTION_REQUESTED = "user_question.requested"
    USER_QUESTION_ANSWERED = "user_question.answered"
    INJECTION_ENQUEUED = "injection.enqueued"
    INJECTION_APPLIED = "injection.applied"
    TOKEN_USAGE = "token_usage.updated"
    TODO_UPDATED = "todo.updated"
    BACKGROUND_TASK_STARTED = "background_task.started"
    BACKGROUND_TASK_UPDATED = "background_task.updated"
    BACKGROUND_TASK_COMPLETED = "background_task.completed"
    BACKGROUND_TASK_STOPPED = "background_task.stopped"
    SUBAGENT_SESSION_STATUS_CHANGED = "subagent_session.status_changed"
    SUBAGENT_STOPPED = "subagent.stopped"
    SUBAGENT_RESUMED = "subagent.resumed"
    NOTIFICATION_REQUESTED = "notification.requested"
    RUNTIME_GUARDRAIL_ALERT = "runtime_guardrail.alert"
    RUNTIME_GUARDRAIL_REPORT = "runtime_guardrail.report"
    HOOK_STARTED = "hook.started"
    HOOK_COMPLETED = "hook.completed"
    HOOK_FAILED = "hook.failed"
    HOOK_CONFLICT = "hook.conflict"
    HOOK_DECISION_APPLIED = "hook.decision_applied"
    HOOK_DEFERRED = "hook.deferred"
    RELAY_EVENT = "relay.event"


class AgUiRunEvent(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    type: AgUiEventType
    event_id: int | None = None
    session_id: RequiredIdentifierStr
    run_id: RequiredIdentifierStr
    trace_id: RequiredIdentifierStr
    task_id: OptionalIdentifierStr = None
    instance_id: OptionalIdentifierStr = None
    role_id: OptionalIdentifierStr = None
    relay_event_type: RunEventType
    occurred_at: str
    payload: JsonValue = None


class AgUiCreateRunRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    session_id: RequiredIdentifierStr
    input: tuple[ContentPart, ...] = Field(default_factory=tuple)
    display_input: tuple[ContentPart, ...] = Field(default_factory=tuple)
    run_kind: RunKind = RunKind.CONVERSATION
    generation_config: MediaGenerationConfig | None = None
    execution_mode: ExecutionMode = ExecutionMode.AI
    yolo: bool = False
    shell_safety_policy_enabled: bool | None = None
    thinking: RunThinkingConfig = Field(default_factory=RunThinkingConfig)
    target_role_id: OptionalIdentifierStr = None
    skills: tuple[str, ...] | None = None
    orchestration_policy: OrchestrationPolicy | None = None

    @field_validator("skills", mode="before")
    @classmethod
    def _normalize_skills(cls, value: object) -> tuple[str, ...] | None:
        return normalize_identifier_tuple(value, field_name="skills")


class AgUiCreateRunResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    run_id: RequiredIdentifierStr
    session_id: RequiredIdentifierStr
    target_role_id: OptionalIdentifierStr = None


class AgUiInjectMessageRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    source: InjectionSource = InjectionSource.USER
    mode: InjectionDeliveryMode = InjectionDeliveryMode.QUEUED
    content: str = Field(min_length=1)
    client_message_id: OptionalIdentifierStr = None

    @field_validator("content")
    @classmethod
    def _reject_blank_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Injection content must not be empty")
        return value


class AgUiStopRunRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    scope: Literal["main", "subagent"] = "main"
    instance_id: OptionalIdentifierStr = None


class AgUiResolveToolApprovalRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    action: Literal[
        "approve",
        "approve_once",
        "approve_exact",
        "approve_prefix",
        "deny",
    ]
    feedback: str = ""
    option_id: str | None = None


class AgUiActionResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    status: Literal["ok", "deferred"] = "ok"
    run_id: RequiredIdentifierStr | None = None
    session_id: RequiredIdentifierStr | None = None
    scope: Literal["main", "subagent"] | None = None
    instance_id: RequiredIdentifierStr | None = None
    action: str | None = None
    option_id: str | None = None
    payload: JsonValue = None


class AgUiSessionSnapshotResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    session_id: RequiredIdentifierStr
    recovery: JsonValue
    messages: tuple[JsonValue, ...]
    global_events: tuple[JsonValue, ...]


class AgUiStreamError(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    error: str
