from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

import pytest

from relay_teams.sessions.session_service import SessionService
from relay_teams.sessions.session_service import _terminal_run_status_for_event_type
from relay_teams.agent_runtimes.instances.instance_repository import (
    AgentInstanceRepository,
)
from relay_teams.sessions.session_models import SessionMode
from relay_teams.tools.runtime.approval_ticket_repo import ApprovalTicketRepository
from relay_teams.sessions.runs.event_log import EventLog
from relay_teams.sessions.runs.enums import RunEventType
from relay_teams.sessions.runs.run_models import RunEvent
from relay_teams.sessions.runs.active_run_registry import ActiveSessionRunRegistry
from relay_teams.agents.execution.message_repository import MessageRepository
from relay_teams.sessions.runs.run_runtime_repo import (
    RunRuntimePhase,
    RunRuntimeRepository,
    RunRuntimeStatus,
)
from relay_teams.sessions.session_repository import SessionRepository
from relay_teams.agents.tasks.task_repository import TaskRepository
from relay_teams.agents.tasks.enums import TaskStatus
from relay_teams.providers.token_usage_repo import TokenUsageRepository
from relay_teams.agents.tasks.models import TaskEnvelope, VerificationPlan
from relay_teams.roles.role_models import RoleDefinition, SystemRoleIdentity
from relay_teams.roles.role_registry import RoleRegistry


def _build_service(
    db_path: Path,
    *,
    active_run_registry: ActiveSessionRunRegistry | None = None,
    role_registry: RoleRegistry | None = None,
) -> SessionService:
    return SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(db_path),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        run_event_hub=None,
        active_run_registry=active_run_registry,
        event_log=EventLog(db_path),
        role_registry=role_registry,
    )


def _build_system_role_registry() -> RoleRegistry:
    registry = RoleRegistry()
    registry.register(
        RoleDefinition(
            role_id="root-agent",
            name="Root agent",
            description="Runs normal-mode sessions.",
            version="1",
            system_role=SystemRoleIdentity.MAIN_AGENT,
            system_prompt="Handle the user request.",
        )
    )
    registry.register(
        RoleDefinition(
            role_id="orchestration-root",
            name="Orchestration root",
            description="Coordinates orchestration-mode sessions.",
            version="1",
            system_role=SystemRoleIdentity.COORDINATOR,
            system_prompt="Coordinate delegated work.",
        )
    )
    return registry


def _seed_root_task(db_path: Path, *, run_id: str, session_id: str) -> None:
    _ = TaskRepository(db_path).create(
        TaskEnvelope(
            task_id="task-root-1",
            session_id=session_id,
            parent_task_id=None,
            trace_id=run_id,
            objective="do work",
            verification=VerificationPlan(checklist=("non_empty_response",)),
        )
    )


def _update_session_timestamp(
    db_path: Path,
    session_id: str,
    created_at: datetime,
) -> None:
    timestamp = created_at.isoformat()
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE sessions
        SET created_at=?, updated_at=?
        WHERE session_id=?
        """,
        (timestamp, timestamp, session_id),
    )
    connection.commit()
    connection.close()


def _update_session_timestamps(
    db_path: Path,
    session_id: str,
    *,
    created_at: datetime,
    updated_at: datetime,
) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE sessions
        SET created_at=?, updated_at=?
        WHERE session_id=?
        """,
        (created_at.isoformat(), updated_at.isoformat(), session_id),
    )
    connection.commit()
    connection.close()


def _update_session_raw_timestamps(
    db_path: Path,
    session_id: str,
    *,
    created_at: str,
    updated_at: str,
) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE sessions
        SET created_at=?, updated_at=?
        WHERE session_id=?
        """,
        (created_at, updated_at, session_id),
    )
    connection.commit()
    connection.close()


def test_list_sessions_includes_active_run_overlay(tmp_path: Path) -> None:
    db_path = tmp_path / "session_list_status.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-active", workspace_id="default")
    _ = service.create_session(session_id="session-idle", workspace_id="default")

    _seed_root_task(db_path, run_id="run-active", session_id="session-active")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-active",
        session_id="session-active",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-active",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )
    ApprovalTicketRepository(db_path).upsert_requested(
        tool_call_id="orch_dispatch_task:1",
        run_id="run-active",
        session_id="session-active",
        task_id="task-root-1",
        instance_id="inst-1",
        role_id="Coordinator",
        tool_name="orch_dispatch_task",
        args_preview='{"task_id":"task-1"}',
    )

    sessions = service.list_sessions()
    by_id = {record.session_id: record for record in sessions}

    active = by_id["session-active"]
    assert active.has_active_run is True
    assert active.active_run_id == "run-active"
    assert active.active_run_status == "running"
    assert active.active_run_phase == "awaiting_tool_approval"
    assert active.pending_tool_approval_count == 1

    idle = by_id["session-idle"]
    assert idle.has_active_run is False
    assert idle.active_run_id is None
    assert idle.active_run_status is None
    assert idle.active_run_phase is None
    assert idle.pending_tool_approval_count == 0


def test_list_sessions_projects_stopped_run_as_terminal_only(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_stopped_terminal.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-stopped", workspace_id="default")

    _seed_root_task(db_path, run_id="run-stopped", session_id="session-stopped")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-stopped",
        session_id="session-stopped",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-stopped",
        status=RunRuntimeStatus.STOPPED,
        phase=RunRuntimePhase.IDLE,
    )

    session = service.list_sessions()[0]

    assert session.has_active_run is False
    assert session.active_run_id is None
    assert session.active_run_status is None
    assert session.active_run_phase is None
    assert session.latest_terminal_run_id == "run-stopped"
    assert session.latest_terminal_run_status == "stopped"
    assert session.latest_terminal_run_updated_at is not None


def test_list_sessions_projects_registry_stopped_run_as_recoverable_active(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_registry_stopped_active.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-stopped", workspace_id="default")

    _seed_root_task(db_path, run_id="run-stopped", session_id="session-stopped")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-stopped",
        session_id="session-stopped",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-stopped",
        status=RunRuntimeStatus.STOPPED,
        phase=RunRuntimePhase.IDLE,
    )
    registry = ActiveSessionRunRegistry(run_runtime_repo=runtime_repo)
    service = _build_service(db_path, active_run_registry=registry)

    session = service.list_sessions()[0]

    assert session.has_active_run is True
    assert session.active_run_id == "run-stopped"
    assert session.active_run_status == "stopped"
    assert session.latest_terminal_run_id == "run-stopped"
    assert session.latest_terminal_run_status == "stopped"


def test_list_sessions_projects_paused_run_as_active(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_paused_active.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-paused", workspace_id="default")

    _seed_root_task(db_path, run_id="run-paused", session_id="session-paused")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-paused",
        session_id="session-paused",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-paused",
        status=RunRuntimeStatus.PAUSED,
        phase=RunRuntimePhase.AWAITING_RECOVERY,
    )

    session = service.list_sessions()[0]

    assert session.has_active_run is True
    assert session.active_run_id == "run-paused"
    assert session.active_run_status == "paused"
    assert session.active_run_phase == "awaiting_recovery"
    assert session.latest_terminal_run_id is None


def test_list_sessions_by_workspace_filters_sessions(tmp_path: Path) -> None:
    db_path = tmp_path / "session_list_by_workspace.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-workspace-1",
        workspace_id="workspace-1",
    )
    _ = service.create_session(
        session_id="session-workspace-2",
        workspace_id="workspace-2",
    )

    sessions = service.list_sessions_by_workspace("workspace-1")

    assert [session.session_id for session in sessions] == ["session-workspace-1"]


def test_list_workspace_sidebar_sessions_page_async_returns_cursor_page(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_sidebar_page.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-a",
        workspace_id="workspace-1",
        metadata={"title": "A"},
    )
    _ = service.create_session(
        session_id="session-b",
        workspace_id="workspace-1",
        metadata={"title": "B"},
    )
    _ = service.create_session(
        session_id="session-c",
        workspace_id="workspace-1",
        metadata={"title": "C"},
    )
    _ = service.create_session(
        session_id="session-other",
        workspace_id="workspace-2",
        metadata={"title": "Other"},
    )
    _update_session_timestamp(
        db_path,
        "session-a",
        datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    _update_session_timestamp(
        db_path,
        "session-b",
        datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    _update_session_timestamp(
        db_path,
        "session-c",
        datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )
    _update_session_timestamp(
        db_path,
        "session-other",
        datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
    )

    async def exercise() -> None:
        first_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=2,
        )
        second_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=2,
            cursor=first_page.next_cursor,
        )

        assert [item.session_id for item in first_page.items] == [
            "session-c",
            "session-b",
        ]
        assert first_page.has_more is True
        assert first_page.next_cursor is not None
        assert [item.session_id for item in second_page.items] == ["session-a"]
        assert second_page.has_more is False
        assert second_page.next_cursor is None

    asyncio.run(exercise())


def test_list_workspace_sidebar_sessions_page_async_orders_by_updated_at(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_sidebar_page_updated_order.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-old-created",
        workspace_id="workspace-1",
        metadata={"title": "Old Created"},
    )
    _ = service.create_session(
        session_id="session-new-created",
        workspace_id="workspace-1",
        metadata={"title": "New Created"},
    )
    _update_session_timestamps(
        db_path,
        "session-old-created",
        created_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
    )
    _update_session_timestamps(
        db_path,
        "session-new-created",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )

    async def exercise() -> None:
        first_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=1,
        )
        second_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=1,
            cursor=first_page.next_cursor,
        )

        assert [item.session_id for item in first_page.items] == ["session-old-created"]
        assert first_page.has_more is True
        assert [item.session_id for item in second_page.items] == [
            "session-new-created"
        ]
        assert second_page.has_more is False

    asyncio.run(exercise())


def test_list_workspace_sidebar_sessions_page_async_uses_raw_sort_cursor(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_sidebar_page_raw_cursor.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-dirty-updated",
        workspace_id="workspace-1",
        metadata={"title": "Dirty Updated"},
    )
    _ = service.create_session(
        session_id="session-clean",
        workspace_id="workspace-1",
        metadata={"title": "Clean"},
    )
    _update_session_raw_timestamps(
        db_path,
        "session-dirty-updated",
        created_at="2026-06-03T12:00:00+00:00",
        updated_at="not-a-date",
    )
    _update_session_timestamps(
        db_path,
        "session-clean",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )

    async def exercise() -> None:
        first_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=1,
        )
        second_page = await service.list_workspace_sidebar_sessions_page_async(
            "workspace-1",
            limit=1,
            cursor=first_page.next_cursor,
        )

        assert [item.session_id for item in first_page.items] == [
            "session-dirty-updated"
        ]
        assert first_page.has_more is True
        assert [item.session_id for item in second_page.items] == ["session-clean"]
        assert second_page.has_more is False

    asyncio.run(exercise())


def test_list_workspace_sidebar_sessions_page_async_rejects_invalid_cursor(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_sidebar_invalid_cursor.db")

    async def exercise() -> None:
        with pytest.raises(ValueError, match="Invalid session pagination cursor"):
            await service.list_workspace_sidebar_sessions_page_async(
                "workspace-1",
                cursor="not-json",
            )

    asyncio.run(exercise())


def test_list_sessions_uses_runtime_overlay_for_running_subagent(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_subagent_status.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-active", workspace_id="default")

    _seed_root_task(db_path, run_id="run-active", session_id="session-active")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-active",
        session_id="session-active",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-active",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.AWAITING_SUBAGENT_FOLLOWUP,
        active_instance_id="inst-sub-1",
        active_task_id="task-root-1",
        active_role_id="time",
        active_subagent_instance_id="inst-sub-1",
    )

    sessions = service.list_sessions()
    active = {record.session_id: record for record in sessions}["session-active"]

    assert active.has_active_run is True
    assert active.active_run_id == "run-active"
    assert active.active_run_status == "running"
    assert active.active_run_phase == "awaiting_subagent_followup"
    assert active.pending_tool_approval_count == 0


def test_list_sessions_skips_invalid_persisted_run_runtime_rows(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_status_invalid_runtime.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-active", workspace_id="default")

    _seed_root_task(db_path, run_id="run-active", session_id="session-active")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-active",
        session_id="session-active",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-active",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )
    _insert_invalid_run_runtime_row(
        db_path,
        run_id="run-invalid",
        session_id="session-active",
    )

    sessions = service.list_sessions()
    active = {record.session_id: record for record in sessions}["session-active"]

    assert active.has_active_run is True
    assert active.active_run_id == "run-active"
    assert active.active_run_phase == "running"


def test_list_sessions_skips_invalid_persisted_approval_ticket_rows(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_list_status_invalid_approval.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-active", workspace_id="default")

    _seed_root_task(db_path, run_id="run-active", session_id="session-active")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-active",
        session_id="session-active",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-active",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )
    approval_repo = ApprovalTicketRepository(db_path)
    approval_repo.upsert_requested(
        tool_call_id="orch_dispatch_task:1",
        run_id="run-active",
        session_id="session-active",
        task_id="task-root-1",
        instance_id="inst-1",
        role_id="Coordinator",
        tool_name="orch_dispatch_task",
        args_preview='{"task_id":"task-1"}',
    )
    _insert_invalid_approval_ticket_row(
        db_path,
        tool_call_id="orch_dispatch_task:invalid",
        run_id="run-active",
        session_id="session-active",
    )

    sessions = service.list_sessions()
    active = {record.session_id: record for record in sessions}["session-active"]

    assert active.has_active_run is True
    assert active.pending_tool_approval_count == 1


def _insert_invalid_run_runtime_row(
    db_path: Path,
    *,
    run_id: str,
    session_id: str,
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        INSERT INTO run_runtime(
            run_id,
            session_id,
            root_task_id,
            status,
            phase,
            active_instance_id,
            active_task_id,
            active_role_id,
            active_subagent_instance_id,
            last_error,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            session_id,
            "task-bad",
            RunRuntimeStatus.RUNNING.value,
            RunRuntimePhase.COORDINATOR_RUNNING.value,
            None,
            None,
            None,
            None,
            None,
            now,
            "None",
        ),
    )
    connection.commit()
    connection.close()


def _insert_invalid_approval_ticket_row(
    db_path: Path,
    *,
    tool_call_id: str,
    run_id: str,
    session_id: str,
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        INSERT INTO approval_tickets(
            tool_call_id,
            signature_key,
            run_id,
            session_id,
            task_id,
            instance_id,
            role_id,
            tool_name,
            args_preview,
            status,
            feedback,
            created_at,
            updated_at,
            resolved_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tool_call_id,
            "sig-invalid",
            run_id,
            session_id,
            "task-root-1",
            "inst-1",
            "Coordinator",
            "orch_dispatch_task",
            "{}",
            "requested",
            "",
            now,
            "None",
            None,
        ),
    )
    connection.commit()
    connection.close()


def test_list_normal_mode_subagents_reports_awaiting_tool_approval_phase(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_subagent_approval_phase.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")

    _seed_root_task(db_path, run_id="run-root", session_id="session-1")
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-root",
        session_id="session-1",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-root",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )

    from relay_teams.agent_runtimes.instances.enums import InstanceStatus
    from relay_teams.agent_runtimes.instances.instance_repository import (
        AgentInstanceRepository,
    )

    AgentInstanceRepository(db_path).upsert_instance(
        run_id="subagent_run_proj123",
        trace_id="subagent_run_proj123",
        session_id="session-1",
        instance_id="inst-sub-1",
        role_id="Explorer",
        workspace_id="default",
        conversation_id="conv_session_1_explorer_inst_sub_1",
        status=InstanceStatus.RUNNING,
    )
    runtime_repo.ensure(
        run_id="subagent_run_proj123",
        session_id="session-1",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "subagent_run_proj123",
        status=RunRuntimeStatus.PAUSED,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )
    ApprovalTicketRepository(db_path).upsert_requested(
        tool_call_id="webfetch:1",
        run_id="subagent_run_proj123",
        session_id="session-1",
        task_id="task-root-1",
        instance_id="inst-sub-1",
        role_id="Explorer",
        tool_name="webfetch",
        args_preview='{"url":"https://example.com"}',
    )

    subagents = service.list_normal_mode_subagents("session-1")
    assert len(subagents) == 1
    assert subagents[0]["run_phase"] == "awaiting_tool_approval"
    assert subagents[0]["run_status"] == "paused"


def test_list_sessions_counts_orchestration_subagents_by_role(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_orchestration_subagent_count.db"
    service = _build_service(
        db_path,
        role_registry=_build_system_role_registry(),
    )
    _ = service.create_session(
        session_id="session-orch",
        workspace_id="default",
        session_mode=SessionMode.ORCHESTRATION,
    )

    from relay_teams.agent_runtimes.instances.enums import InstanceStatus

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="run-orch",
        trace_id="run-orch",
        session_id="session-orch",
        instance_id="inst-coordinator",
        role_id="orchestration-root",
        workspace_id="default",
        status=InstanceStatus.RUNNING,
    )
    agent_repo.upsert_instance(
        run_id="run-orch",
        trace_id="run-orch",
        session_id="session-orch",
        instance_id="inst-explorer-old",
        role_id="Explorer",
        workspace_id="default",
        status=InstanceStatus.COMPLETED,
    )
    agent_repo.upsert_instance(
        run_id="run-orch",
        trace_id="run-orch",
        session_id="session-orch",
        instance_id="inst-explorer-new",
        role_id="Explorer",
        workspace_id="default",
        status=InstanceStatus.RUNNING,
    )

    by_id = {record.session_id: record for record in service.list_sessions()}

    assert by_id["session-orch"].subagent_session_count == 1


def test_list_session_subagents_returns_orchestration_projection(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_orchestration_subagents.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-orch",
        workspace_id="default",
        session_mode=SessionMode.ORCHESTRATION,
    )
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-orch",
        session_id="session-orch",
        root_task_id="task-root-1",
    )
    runtime_repo.update(
        "run-orch",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )

    from relay_teams.agent_runtimes.instances.enums import InstanceStatus

    agent_repo = AgentInstanceRepository(db_path)
    agent_repo.upsert_instance(
        run_id="run-orch",
        trace_id="run-orch",
        session_id="session-orch",
        instance_id="inst-crafter",
        role_id="Crafter",
        workspace_id="default",
        conversation_id="conv_session_orch_crafter",
        status=InstanceStatus.RUNNING,
    )

    subagents = service.list_session_subagents("session-orch")

    assert len(subagents) == 1
    assert subagents[0]["instance_id"] == "inst-crafter"
    assert subagents[0]["role_id"] == "Crafter"
    assert subagents[0]["run_id"] == "run-orch"
    assert subagents[0]["subagent_kind"] == "orchestration"
    assert subagents[0]["interactive"] is True
    assert subagents[0]["deletable"] is False
    assert subagents[0]["run_status"] == "running"
    assert "runtime_system_prompt" not in subagents[0]
    assert "runtime_tools_json" not in subagents[0]


def test_list_session_subagents_projects_each_assigned_orchestration_task(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_orchestration_task_subagents.db"
    service = _build_service(db_path)
    _ = service.create_session(
        session_id="session-orch",
        workspace_id="default",
        session_mode=SessionMode.ORCHESTRATION,
    )
    task_repo = TaskRepository(db_path)
    verification = VerificationPlan(checklist=("non_empty_response",))
    _ = task_repo.create(
        TaskEnvelope(
            task_id="task-root",
            session_id="session-orch",
            trace_id="run-orch",
            objective="Coordinate work",
            verification=verification,
        )
    )
    for task_id, title in (
        ("task-crafter-first", "First implementation"),
        ("task-crafter-second", "Replacement implementation"),
    ):
        _ = task_repo.create(
            TaskEnvelope(
                task_id=task_id,
                session_id="session-orch",
                parent_task_id="task-root",
                trace_id="run-orch",
                role_id="Crafter",
                title=title,
                objective=title,
                verification=verification,
            )
        )
        task_repo.update_status(
            task_id,
            TaskStatus.RUNNING,
            assigned_instance_id="inst-crafter",
        )

    from relay_teams.agent_runtimes.instances.enums import InstanceStatus

    AgentInstanceRepository(db_path).upsert_instance(
        run_id="run-orch",
        trace_id="run-orch",
        session_id="session-orch",
        instance_id="inst-crafter",
        role_id="Crafter",
        workspace_id="default",
        conversation_id="conv_session_orch_crafter",
        status=InstanceStatus.RUNNING,
    )

    subagents = service.list_session_subagents("session-orch")

    assert [record["task_id"] for record in subagents] == [
        "task-crafter-first",
        "task-crafter-second",
    ]
    assert [record["subagent_task_id"] for record in subagents] == [
        "task-crafter-first",
        "task-crafter-second",
    ]
    assert [record["title"] for record in subagents] == [
        "First implementation",
        "Replacement implementation",
    ]
    assert all(record["instance_id"] == "inst-crafter" for record in subagents)
    assert all(record["source_run_id"] == "run-orch" for record in subagents)
    assert all(record["source_task_id"] == "task-root" for record in subagents)
    assert all(record["run_status"] == "running" for record in subagents)


def test_terminal_run_status_maps_only_terminal_events() -> None:
    assert (
        _terminal_run_status_for_event_type(RunEventType.RUN_COMPLETED) == "completed"
    )
    assert _terminal_run_status_for_event_type(RunEventType.RUN_FAILED) == "failed"
    assert _terminal_run_status_for_event_type(RunEventType.RUN_STOPPED) == "stopped"
    assert _terminal_run_status_for_event_type(RunEventType.RUN_STARTED) is None


def test_merge_subagent_count_ignores_empty_session_id(tmp_path: Path) -> None:
    service = _build_service(tmp_path / "session_subagent_empty_merge.db")

    service._merge_subagent_count_into_list_cache("  ")


def test_log_subagent_count_cache_merge_error_ignores_cancelled_task() -> None:
    async def wait_forever() -> None:
        await asyncio.Event().wait()

    async def run_task() -> None:
        task = asyncio.create_task(wait_forever())
        await asyncio.sleep(0)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            # The cancelled task is the expected input for this callback path.
            pass
        SessionService._log_subagent_count_cache_merge_error(task)

    asyncio.run(run_task())


def test_merge_terminal_event_ignores_nonterminal_or_missing_ids(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_terminal_event_early_return.db")

    service._merge_terminal_event_into_list_cache(
        RunEvent(
            session_id="session-1",
            run_id="run-1",
            trace_id="run-1",
            event_type=RunEventType.RUN_STARTED,
            payload_json="{}",
        )
    )
    service._merge_terminal_event_into_list_cache(
        RunEvent.model_construct(
            session_id="",
            run_id="run-1",
            trace_id="run-1",
            event_type=RunEventType.RUN_COMPLETED,
            payload_json="{}",
        )
    )


def test_merge_terminal_event_clears_matching_active_cache_record(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_terminal_event_cache_merge.db")
    record = service.create_session(session_id="session-1", workspace_id="default")
    _ = asyncio.run(service.list_sessions_async(force_refresh=True))
    service._merge_session_list_cache_record(
        record.model_copy(
            update={
                "has_active_run": True,
                "active_run_id": "run-1",
                "active_run_status": "running",
                "active_run_phase": "coordinator_running",
                "pending_tool_approval_count": 2,
            }
        )
    )

    service._merge_terminal_event_into_list_cache(
        RunEvent(
            session_id="session-1",
            run_id="run-1",
            trace_id="run-1",
            event_type=RunEventType.RUN_COMPLETED,
            payload_json="{}",
        )
    )

    cached = asyncio.run(service.list_sessions_async())
    assert len(cached) == 1
    assert cached[0].latest_terminal_run_id == "run-1"
    assert cached[0].latest_terminal_run_status == "completed"
    assert cached[0].has_active_run is False
    assert cached[0].active_run_id is None
    assert cached[0].pending_tool_approval_count == 0


def test_merge_stopped_event_preserves_recoverable_active_cache_record(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_stopped_event_cache_merge.db")
    record = service.create_session(session_id="session-1", workspace_id="default")
    _ = asyncio.run(service.list_sessions_async(force_refresh=True))
    service._merge_session_list_cache_record(
        record.model_copy(
            update={
                "has_active_run": True,
                "active_run_id": "run-1",
                "active_run_status": "running",
                "active_run_phase": "coordinator_running",
                "pending_tool_approval_count": 2,
            }
        )
    )

    service._merge_terminal_event_into_list_cache(
        RunEvent(
            session_id="session-1",
            run_id="run-1",
            trace_id="run-1",
            event_type=RunEventType.RUN_STOPPED,
            payload_json="{}",
        )
    )

    cached = asyncio.run(service.list_sessions_async())
    assert len(cached) == 1
    assert cached[0].latest_terminal_run_id == "run-1"
    assert cached[0].latest_terminal_run_status == "stopped"
    assert cached[0].has_active_run is True
    assert cached[0].active_run_id == "run-1"
    assert cached[0].active_run_status == "stopped"
    assert cached[0].active_run_phase == "stopped"
    assert cached[0].pending_tool_approval_count == 0


def test_merge_stopped_event_keeps_newer_active_cache_record(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_stopped_event_newer_active.db")
    record = service.create_session(session_id="session-1", workspace_id="default")
    _ = asyncio.run(service.list_sessions_async(force_refresh=True))
    service._merge_session_list_cache_record(
        record.model_copy(
            update={
                "has_active_run": True,
                "active_run_id": "run-new",
                "active_run_status": "running",
                "active_run_phase": "coordinator_running",
                "pending_tool_approval_count": 2,
            }
        )
    )

    service._merge_terminal_event_into_list_cache(
        RunEvent(
            session_id="session-1",
            run_id="run-old",
            trace_id="run-old",
            event_type=RunEventType.RUN_STOPPED,
            payload_json="{}",
        )
    )

    cached = asyncio.run(service.list_sessions_async())
    assert len(cached) == 1
    assert cached[0].latest_terminal_run_id == "run-old"
    assert cached[0].latest_terminal_run_status == "stopped"
    assert cached[0].has_active_run is True
    assert cached[0].active_run_id == "run-new"
    assert cached[0].active_run_status == "running"
    assert cached[0].active_run_phase == "coordinator_running"
    assert cached[0].pending_tool_approval_count == 2


def test_merge_terminal_event_clears_stale_verification_status(
    tmp_path: Path,
) -> None:
    service = _build_service(tmp_path / "session_terminal_event_verification.db")
    record = service.create_session(session_id="session-1", workspace_id="default")
    _ = asyncio.run(service.list_sessions_async(force_refresh=True))
    service._merge_session_list_cache_record(
        record.model_copy(
            update={
                "latest_terminal_run_id": "run-old",
                "latest_terminal_run_status": "completed",
                "latest_terminal_run_verification_status": "failed",
            }
        )
    )

    service._merge_terminal_event_into_list_cache(
        RunEvent(
            session_id="session-1",
            run_id="run-new",
            trace_id="run-new",
            event_type=RunEventType.RUN_COMPLETED,
            payload_json="{}",
        )
    )

    cached = asyncio.run(service.list_sessions_async())
    assert len(cached) == 1
    assert cached[0].latest_terminal_run_id == "run-new"
    assert cached[0].latest_terminal_run_status == "completed"
    assert cached[0].latest_terminal_run_verification_status is None


def test_select_list_active_run_keeps_active_background_terminal_runtime(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_active_background_terminal.db"
    service = _build_service(db_path)
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-background",
        session_id="session-1",
        status=RunRuntimeStatus.COMPLETED,
        phase=RunRuntimePhase.TERMINAL,
    )
    runtime = runtime_repo.get("run-background")
    assert runtime is not None

    selected = service._select_list_active_run_from_preloaded(
        session_id="session-1",
        runtimes=(runtime,),
        excluded_run_ids=set(),
        active_background_run_ids={"run-background"},
    )

    assert selected is not None
    assert selected[0] == "run-background"
