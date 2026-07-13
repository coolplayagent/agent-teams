from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import create_autospec

import pytest

from relay_teams.agent_runtimes.instances.instance_repository import (
    AgentInstanceRepository,
)
from relay_teams.agents.execution.message_repository import MessageRepository
from relay_teams.agents.tasks.task_repository import TaskRepository
from relay_teams.memory.event_handler import MemoryEventHandler
from relay_teams.providers.token_usage_repo import TokenUsageRepository
from relay_teams.roles.role_models import RoleDefinition, SystemRoleIdentity
from relay_teams.roles.role_registry import RoleRegistry
from relay_teams.sessions.runs.run_runtime_repo import RunRuntimeRepository
from relay_teams.sessions.runs.todo_repository import TodoRepository
from relay_teams.sessions.runs.todo_service import TodoService
from relay_teams.sessions.session_repository import SessionRepository
from relay_teams.sessions.session_service import SessionService, _SessionDeleteContext
from relay_teams.tools.runtime.approval_ticket_repo import ApprovalTicketRepository


def _build_service(
    db_path: Path,
    *,
    memory_event_handler: MemoryEventHandler,
) -> SessionService:
    role_registry = RoleRegistry()
    role_registry.register(
        RoleDefinition(
            role_id="MainAgent",
            system_role=SystemRoleIdentity.MAIN_AGENT,
            name="Main Agent",
            description="Handles direct runs.",
            version="1.0.0",
            tools=("read",),
            system_prompt="Handle tasks.",
        )
    )
    return SessionService(
        session_repo=SessionRepository(db_path),
        task_repo=TaskRepository(db_path),
        agent_repo=AgentInstanceRepository(db_path),
        message_repo=MessageRepository(db_path),
        approval_ticket_repo=ApprovalTicketRepository(db_path),
        run_runtime_repo=RunRuntimeRepository(db_path),
        token_usage_repo=TokenUsageRepository(db_path),
        todo_service=TodoService(repository=TodoRepository(db_path)),
        role_registry=role_registry,
        memory_event_handler=memory_event_handler,
    )


@pytest.mark.asyncio
async def test_delete_session_async_consolidates_memory_after_delete(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "session_delete_memory.db"
    handler = create_autospec(MemoryEventHandler, instance=True)
    service = _build_service(db_path, memory_event_handler=handler)
    service.create_session(
        session_id="session-1",
        workspace_id="workspace-1",
        metadata={"title": "Memory session"},
    )
    original_delete = service._delete_session_prepared
    order: list[str] = []

    def delete_prepared(delete_context: _SessionDeleteContext) -> None:
        order.append("delete")
        original_delete(delete_context)

    async def consolidate_memory(*, workspace_id: str, session_id: str) -> None:
        order.append("consolidate")

    monkeypatch.setattr(service, "_delete_session_prepared", delete_prepared)
    handler.on_session_completed_async.side_effect = consolidate_memory

    await service.delete_session_async("session-1")

    assert order == ["delete", "consolidate"]
    handler.on_session_completed_async.assert_awaited_once_with(
        workspace_id="workspace-1",
        session_id="session-1",
    )
    with pytest.raises(KeyError, match="session-1"):
        service.get_session("session-1")


@pytest.mark.asyncio
async def test_delete_session_async_deletes_using_prepared_context(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "session_delete_prepared_context.db"
    handler = create_autospec(MemoryEventHandler, instance=True)
    service = _build_service(db_path, memory_event_handler=handler)
    service.create_session(
        session_id="session-1",
        workspace_id="workspace-1",
        metadata={"title": "Memory session"},
    )
    original_prepare = service._prepare_session_delete
    prepare_calls = 0

    def prepare_once(
        session_id: str,
        *,
        force: bool = False,
        cascade: bool = False,
    ) -> _SessionDeleteContext:
        nonlocal prepare_calls
        prepare_calls += 1
        return original_prepare(session_id, force=force, cascade=cascade)

    monkeypatch.setattr(service, "_prepare_session_delete", prepare_once)

    await service.delete_session_async("session-1")

    assert prepare_calls == 1
    handler.on_session_completed_async.assert_awaited_once_with(
        workspace_id="workspace-1",
        session_id="session-1",
    )
    with pytest.raises(KeyError, match="session-1"):
        service.get_session("session-1")


@pytest.mark.asyncio
async def test_delete_session_async_treats_sqlite_consolidation_as_best_effort(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_delete_memory_sqlite.db"
    handler = create_autospec(MemoryEventHandler, instance=True)
    handler.on_session_completed_async.side_effect = sqlite3.OperationalError("locked")
    service = _build_service(db_path, memory_event_handler=handler)
    service.create_session(
        session_id="session-1",
        workspace_id="workspace-1",
        metadata={"title": "Memory session"},
    )

    await service.delete_session_async("session-1")

    handler.on_session_completed_async.assert_awaited_once()
    with pytest.raises(KeyError, match="session-1"):
        service.get_session("session-1")


@pytest.mark.asyncio
async def test_delete_session_async_skips_consolidation_when_no_handler(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_delete_no_memory_handler.db"
    handler = create_autospec(MemoryEventHandler, instance=True)
    service = _build_service(db_path, memory_event_handler=handler)
    service._memory_event_handler = None
    service.create_session(
        session_id="session-1",
        workspace_id="workspace-1",
        metadata={"title": "Memory session"},
    )

    await service.delete_session_async("session-1")

    handler.on_session_completed_async.assert_not_awaited()
    with pytest.raises(KeyError, match="session-1"):
        service.get_session("session-1")
