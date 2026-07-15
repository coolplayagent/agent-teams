from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest
from pydantic import JsonValue
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

from relay_teams.agent_runtimes.instances.enums import InstanceStatus
from relay_teams.agents.tasks.enums import TaskStatus
from relay_teams.agents.tasks.models import TaskEnvelope, VerificationPlan
from relay_teams.media import content_parts_from_text
from relay_teams.sessions.runs.event_stream import RunEventHub
from relay_teams.sessions.runs.run_intent_repo import RunIntentRepository
from relay_teams.sessions.runs.run_models import IntentInput
from relay_teams.sessions.session_service import SessionService
from relay_teams.agent_runtimes.instances.instance_repository import (
    AgentInstanceRepository,
)
from relay_teams.tools.runtime.approval_ticket_repo import ApprovalTicketRepository
from relay_teams.sessions.runs.event_log import EventLog
from relay_teams.agents.execution.message_repository import MessageRepository
from relay_teams.sessions.runs.run_runtime_repo import RunRuntimeRepository
from relay_teams.sessions.session_repository import SessionRepository
from relay_teams.sessions.session_history_marker_repository import (
    SessionHistoryMarkerRepository,
)
from relay_teams.sessions.session_history_marker_models import (
    SessionHistoryMarkerType,
)
from relay_teams.agents.tasks.task_repository import TaskRepository
from relay_teams.providers.token_usage_repo import TokenUsageRepository
from relay_teams.workspace import build_conversation_id, build_instance_conversation_id


def _build_service(db_path: Path) -> SessionService:
    return SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(db_path),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        event_log=EventLog(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        run_event_hub=RunEventHub(),
        run_intent_repo=RunIntentRepository(db_path),
    )


def test_session_messages_hide_provider_prompt_behind_display_intent(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_message_display_contract.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    task_repo = TaskRepository(db_path)
    _ = task_repo.create(
        TaskEnvelope(
            task_id="task-root-1",
            session_id="session-1",
            parent_task_id=None,
            trace_id="run-1",
            objective="Review the streaming UI",
            verification=VerificationPlan(checklist=("non_empty_response",)),
        )
    )
    _ = task_repo.create(
        TaskEnvelope(
            task_id="task-child-1",
            session_id="session-1",
            parent_task_id="task-root-1",
            trace_id="run-1",
            role_id="Explorer",
            objective="Inspect the timeline implementation",
            verification=VerificationPlan(checklist=("non_empty_response",)),
        )
    )
    run_intent_repo = service._run_intent_repo
    assert run_intent_repo is not None
    run_intent_repo.upsert(
        run_id="run-1",
        session_id="session-1",
        intent=IntentInput(
            session_id="session-1",
            input=content_parts_from_text("Review the streaming UI"),
            display_input=content_parts_from_text("Review the streaming UI"),
        ),
    )

    provider_prompt = (
        "Review the streaming UI\n\n"
        "## Skill Candidates\n"
        "If one of these skills looks relevant, load it before acting.\n"
        "- ui-audit: Inspect the visible product experience."
    )
    message_repo = MessageRepository(db_path)
    message_repo.append(
        session_id="session-1",
        workspace_id="default",
        instance_id="inst-root-1",
        task_id="task-root-1",
        trace_id="run-1",
        messages=[ModelRequest(parts=[UserPromptPart(content=provider_prompt)])],
    )
    message_repo.append(
        session_id="session-1",
        workspace_id="default",
        instance_id="inst-child-1",
        task_id="task-child-1",
        trace_id="run-1",
        messages=[
            ModelRequest(
                parts=[UserPromptPart(content="Inspect the timeline implementation")]
            )
        ],
    )

    projected = service.get_session_messages("session-1")
    root_message = next(
        message for message in projected if message["task_id"] == "task-root-1"
    )
    child_message = next(
        message for message in projected if message["task_id"] == "task-child-1"
    )
    stored = message_repo.get_messages_by_session("session-1")
    stored_root = next(
        message for message in stored if message["task_id"] == "task-root-1"
    )
    stored_root_message = cast(dict[str, object], stored_root["message"])
    stored_root_parts = cast(list[dict[str, object]], stored_root_message["parts"])
    page = service.get_session_rounds("session-1", limit=8)
    items = page.get("items")

    assert root_message["visibility"] == "internal"
    assert child_message.get("visibility") != "internal"
    assert "visibility" not in stored_root
    assert stored_root_parts[0]["content"] == provider_prompt
    assert isinstance(items, list)
    assert items[0]["intent"] == "Review the streaming UI"


def test_get_agent_messages_includes_role_id(tmp_path: Path) -> None:
    db_path = tmp_path / "session_agent_messages.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="run-1",
        trace_id="run-1",
        session_id="session-1",
        instance_id="inst-1",
        role_id="time",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    message_repo = MessageRepository(db_path)
    message_repo.append(
        session_id="session-1",
        workspace_id="default",
        instance_id="inst-1",
        task_id="task-1",
        trace_id="run-1",
        messages=[ModelRequest(parts=[UserPromptPart(content="what time is it?")])],
    )

    messages = service.get_agent_messages("session-1", "inst-1")

    assert len(messages) == 1
    assert messages[0]["entry_type"] == "message"
    assert messages[0]["role_id"] == "time"


@pytest.mark.asyncio
async def test_get_agent_messages_scopes_reused_instance_to_requested_task(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "session_agent_messages_task_scope.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    run_id = "subagent_run_shared"
    instance_id = "inst-shared"
    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id=run_id,
        trace_id=run_id,
        session_id="session-1",
        instance_id=instance_id,
        role_id="crafter",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    task_repo = TaskRepository(db_path)
    message_repo = MessageRepository(db_path)
    for task_id, prompt, result in (
        ("task-child-1", "Implement the first task.", "First task result."),
        ("task-child-2", "Implement the second task.", "Second task result."),
    ):
        _ = task_repo.create(
            TaskEnvelope(
                task_id=task_id,
                session_id="session-1",
                trace_id=run_id,
                role_id="crafter",
                objective=prompt,
                verification=VerificationPlan(checklist=("non_empty_response",)),
            )
        )
        task_repo.update_status(
            task_id,
            TaskStatus.COMPLETED,
            assigned_instance_id=instance_id,
            result=result,
        )
        message_repo.append(
            session_id="session-1",
            workspace_id="default",
            instance_id=instance_id,
            task_id=task_id,
            trace_id=run_id,
            messages=[ModelRequest(parts=[UserPromptPart(content=prompt)])],
        )

    task_scope_calls: list[str | None] = []
    original_async_read = service._message_repo.get_messages_for_instance_async

    async def tracked_async_read(
        session_id: str,
        target_instance_id: str,
        *,
        task_id: str | None = None,
        include_cleared: bool = False,
        include_hidden_from_context: bool = False,
    ) -> list[dict[str, JsonValue]]:
        task_scope_calls.append(task_id)
        return await original_async_read(
            session_id,
            target_instance_id,
            task_id=task_id,
            include_cleared=include_cleared,
            include_hidden_from_context=include_hidden_from_context,
        )

    def reject_sync_read(
        _session_id: str,
        _target_instance_id: str,
        *,
        task_id: str | None = None,
        include_cleared: bool = False,
        include_hidden_from_context: bool = False,
    ) -> list[dict[str, JsonValue]]:
        del task_id, include_cleared, include_hidden_from_context
        raise AssertionError("async service path used synchronous message I/O")

    monkeypatch.setattr(
        service._message_repo,
        "get_messages_for_instance_async",
        tracked_async_read,
    )
    monkeypatch.setattr(
        service._message_repo,
        "get_messages_for_instance",
        reject_sync_read,
    )

    timeline = await service.get_agent_messages_async(
        "session-1",
        instance_id,
        task_id="task-child-1",
    )

    assert task_scope_calls == ["task-child-1"]
    assert [entry["task_id"] for entry in timeline] == [
        "task-child-1",
        "task-child-1",
    ]
    message = cast(dict[str, object], timeline[0]["message"])
    message_parts = cast(list[dict[str, object]], message["parts"])
    terminal_message = cast(dict[str, object], timeline[1]["message"])
    terminal_parts = cast(list[dict[str, object]], terminal_message["parts"])
    assert message_parts[0]["content"] == "Implement the first task."
    assert terminal_parts[0]["content"] == "First task result."


def test_get_agent_messages_preserves_parallel_tool_calls_and_args(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_agent_messages_tool_parts.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="subagent_run_1",
        trace_id="subagent_run_1",
        session_id="session-1",
        instance_id="inst-1",
        role_id="researcher",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    message_repo = MessageRepository(db_path)
    message_repo.append(
        session_id="session-1",
        workspace_id="default",
        instance_id="inst-1",
        task_id="task-1",
        trace_id="subagent_run_1",
        messages=[
            ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="websearch",
                        args={"query": "Anthropic funding 2026"},
                        tool_call_id="call-search-1",
                    ),
                    ToolCallPart(
                        tool_name="webfetch",
                        args={"url": "https://www.anthropic.com/news"},
                        tool_call_id="call-fetch-1",
                    ),
                ]
            ),
            ModelRequest(
                parts=[
                    ToolReturnPart(
                        tool_name="websearch",
                        tool_call_id="call-search-1",
                        content={"ok": True, "data": ["result"]},
                    ),
                    ToolReturnPart(
                        tool_name="webfetch",
                        tool_call_id="call-fetch-1",
                        content={"ok": True, "data": "<html></html>"},
                    ),
                ]
            ),
        ],
    )

    timeline = service.get_agent_messages("session-1", "inst-1")

    assert len(timeline) == 2
    response_message = cast(dict[str, object], timeline[0]["message"])
    result_message = cast(dict[str, object], timeline[1]["message"])
    response_parts = cast(list[dict[str, object]], response_message["parts"])
    result_parts = cast(list[dict[str, object]], result_message["parts"])
    assert [part["part_kind"] for part in response_parts] == [
        "tool-call",
        "tool-call",
    ]
    assert [part["tool_call_id"] for part in response_parts] == [
        "call-search-1",
        "call-fetch-1",
    ]
    assert response_parts[0]["args"] == {"query": "Anthropic funding 2026"}
    assert response_parts[1]["args"] == {"url": "https://www.anthropic.com/news"}
    assert [part["part_kind"] for part in result_parts] == [
        "tool-return",
        "tool-return",
    ]
    assert [part["tool_call_id"] for part in result_parts] == [
        "call-search-1",
        "call-fetch-1",
    ]


def test_get_agent_messages_appends_missing_terminal_subagent_result(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_agent_messages_terminal_result.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    run_id = "subagent_run_1"
    instance_id = "inst-1"
    task_id = "task-1"
    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id=run_id,
        trace_id=run_id,
        session_id="session-1",
        instance_id=instance_id,
        role_id="researcher",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    task_repo = TaskRepository(db_path)
    _ = task_repo.create(
        TaskEnvelope(
            task_id=task_id,
            session_id="session-1",
            trace_id=run_id,
            role_id="researcher",
            objective="Investigate tools.",
            verification=VerificationPlan(checklist=("non_empty_response",)),
        )
    )
    task_repo.update_status(
        task_id,
        TaskStatus.COMPLETED,
        assigned_instance_id=instance_id,
        result="Final report written to tmp/tools-exploration.md.",
    )

    message_repo = MessageRepository(db_path)
    message_repo.append(
        session_id="session-1",
        workspace_id="default",
        instance_id=instance_id,
        task_id=task_id,
        trace_id=run_id,
        messages=[
            ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="write_tmp",
                        args={"path": "tools-exploration.md"},
                        tool_call_id="call-write-1",
                    )
                ]
            ),
            ModelRequest(
                parts=[
                    ToolReturnPart(
                        tool_name="write_tmp",
                        tool_call_id="call-write-1",
                        content={"ok": True},
                    )
                ]
            ),
        ],
    )

    timeline = service.get_agent_messages("session-1", instance_id)

    assert [entry["entry_type"] for entry in timeline] == [
        "message",
        "message",
        "terminal_result",
    ]
    terminal_message = cast(dict[str, object], timeline[2]["message"])
    terminal_parts = cast(list[dict[str, object]], terminal_message["parts"])
    assert timeline[2]["role"] == "assistant"
    assert timeline[2]["role_id"] == "researcher"
    assert terminal_parts == [
        {
            "part_kind": "text",
            "content": "Final report written to tmp/tools-exploration.md.",
        }
    ]


def test_get_agent_messages_returns_hidden_history_and_compaction_marker(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_agent_messages_markers.db"
    marker_repo = SessionHistoryMarkerRepository(db_path)
    service = SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(
            db_path,
            session_history_marker_repo=marker_repo,
        ),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        event_log=EventLog(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        session_history_marker_repo=marker_repo,
        run_event_hub=RunEventHub(),
    )
    _ = service.create_session(session_id="session-1", workspace_id="default")

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="run-1",
        trace_id="run-1",
        session_id="session-1",
        instance_id="inst-1",
        role_id="writer",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    message_repo = MessageRepository(
        db_path,
        session_history_marker_repo=marker_repo,
    )
    conversation_id = build_conversation_id("session-1", "writer")
    for index in range(3):
        message_repo.append(
            session_id="session-1",
            workspace_id="default",
            conversation_id=conversation_id,
            agent_role_id="writer",
            instance_id="inst-1",
            task_id=f"task-{index + 1}",
            trace_id="run-1",
            messages=[
                ModelRequest(parts=[UserPromptPart(content=f"turn-{index + 1}")]),
            ],
        )
    marker = marker_repo.create(
        session_id="session-1",
        marker_type=SessionHistoryMarkerType.COMPACTION,
        metadata={
            "conversation_id": conversation_id,
            "role_id": "writer",
            "summary_markdown": "summary",
        },
    )
    hidden_count = message_repo.hide_conversation_messages_for_compaction(
        conversation_id=conversation_id,
        hide_message_count=2,
        hidden_marker_id=marker.marker_id,
    )

    timeline = service.get_agent_messages("session-1", "inst-1")

    assert hidden_count == 2
    assert [entry["entry_type"] for entry in timeline] == [
        "message",
        "message",
        "marker",
        "message",
    ]
    assert timeline[0]["hidden_from_context"] is True
    assert timeline[1]["hidden_from_context"] is True
    assert timeline[2]["marker_type"] == "compaction"
    assert timeline[3]["hidden_from_context"] is False


def test_get_agent_messages_labels_rolling_summary_compaction_marker(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_agent_messages_compaction_label.db"
    marker_repo = SessionHistoryMarkerRepository(db_path)
    service = SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(
            db_path,
            session_history_marker_repo=marker_repo,
        ),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        event_log=EventLog(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        session_history_marker_repo=marker_repo,
        run_event_hub=RunEventHub(),
    )
    _ = service.create_session(session_id="session-1", workspace_id="default")

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="run-1",
        trace_id="run-1",
        session_id="session-1",
        instance_id="inst-1",
        role_id="writer",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )

    message_repo = MessageRepository(
        db_path,
        session_history_marker_repo=marker_repo,
    )
    conversation_id = build_conversation_id("session-1", "writer")
    for index in range(2):
        message_repo.append(
            session_id="session-1",
            workspace_id="default",
            conversation_id=conversation_id,
            agent_role_id="writer",
            instance_id="inst-1",
            task_id=f"task-{index + 1}",
            trace_id="run-1",
            messages=[
                ModelRequest(parts=[UserPromptPart(content=f"turn-{index + 1}")]),
            ],
        )
    marker = marker_repo.create(
        session_id="session-1",
        marker_type=SessionHistoryMarkerType.COMPACTION,
        metadata={
            "conversation_id": conversation_id,
            "role_id": "writer",
            "summary_markdown": "summary",
            "compaction_strategy": "rolling_summary",
        },
    )
    _ = message_repo.hide_conversation_messages_for_compaction(
        conversation_id=conversation_id,
        hide_message_count=1,
        hidden_marker_id=marker.marker_id,
    )

    timeline = service.get_agent_messages("session-1", "inst-1")

    assert timeline[1]["label"] == "History compacted (rolling summary)"


def test_get_agent_messages_uses_instance_conversation_markers_for_subagents(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_agent_messages_instance_conversation.db"
    marker_repo = SessionHistoryMarkerRepository(db_path)
    service = SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(
            db_path,
            session_history_marker_repo=marker_repo,
        ),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        event_log=EventLog(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        session_history_marker_repo=marker_repo,
        run_event_hub=RunEventHub(),
    )
    _ = service.create_session(session_id="session-1", workspace_id="default")

    conversation_id = build_instance_conversation_id("session-1", "writer", "inst-1")
    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="subagent_run_1",
        trace_id="subagent_run_1",
        session_id="session-1",
        instance_id="inst-1",
        role_id="writer",
        workspace_id="default",
        conversation_id=conversation_id,
        status=InstanceStatus.COMPLETED,
    )

    message_repo = MessageRepository(
        db_path,
        session_history_marker_repo=marker_repo,
    )
    for index in range(2):
        message_repo.append(
            session_id="session-1",
            workspace_id="default",
            conversation_id=conversation_id,
            agent_role_id="writer",
            instance_id="inst-1",
            task_id=f"task-{index + 1}",
            trace_id="subagent_run_1",
            messages=[
                ModelRequest(parts=[UserPromptPart(content=f"turn-{index + 1}")]),
            ],
        )
    marker = marker_repo.create(
        session_id="session-1",
        marker_type=SessionHistoryMarkerType.COMPACTION,
        metadata={
            "conversation_id": conversation_id,
            "role_id": "writer",
            "summary_markdown": "summary",
        },
    )
    _ = message_repo.hide_conversation_messages_for_compaction(
        conversation_id=conversation_id,
        hide_message_count=1,
        hidden_marker_id=marker.marker_id,
    )

    timeline = service.get_agent_messages("session-1", "inst-1")

    assert [entry["entry_type"] for entry in timeline] == [
        "message",
        "marker",
        "message",
    ]
    assert timeline[0]["hidden_from_context"] is True
    assert timeline[1]["marker_type"] == "compaction"
