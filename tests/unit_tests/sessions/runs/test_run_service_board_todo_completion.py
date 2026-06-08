# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

from relay_teams.media import content_parts_from_text
from relay_teams.sessions.runs.assistant_errors import RunCompletionReason
from relay_teams.sessions.runs.run_models import RunResult
from relay_teams.sessions.runs.run_runtime_repo import (
    RunRuntimePhase,
    RunRuntimeRepository,
    RunRuntimeStatus,
)
from tests.unit_tests.sessions.runs.test_run_service_recovery import _build_manager


class _BoardTodoCompletionSpy:
    def __init__(self) -> None:
        self.completed_run_ids: list[str] = []

    async def mark_run_completed_async(self, *, run_id: str) -> None:
        self.completed_run_ids.append(run_id)


@pytest.mark.asyncio
async def test_worker_skips_board_todo_completion_for_verification_warning(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "run_worker_verification_warning_board_todo.db"
    manager = _build_manager(db_path)
    board_todo_service = _BoardTodoCompletionSpy()
    manager.replace_board_todo_service(board_todo_service)
    runtime_repo = RunRuntimeRepository(db_path)
    runtime_repo.ensure(
        run_id="run-existing",
        session_id="session-1",
        root_task_id="task-root-1",
        status=RunRuntimeStatus.RUNNING,
        phase=RunRuntimePhase.COORDINATOR_RUNNING,
    )
    manager._running_run_ids.add("run-existing")
    manager._injection_manager.activate("run-existing")

    async def _runner() -> RunResult:
        return RunResult(
            trace_id="run-existing",
            root_task_id="task-root-1",
            status="completed",
            completion_reason=RunCompletionReason.ASSISTANT_RESPONSE,
            error_code="verification_failed",
            error_message="runtime_guardrail:pre_execution_boundary",
            output=content_parts_from_text("Verification warning"),
        )

    await manager._worker(
        run_id="run-existing",
        session_id="session-1",
        runner=_runner,
    )

    runtime = runtime_repo.get("run-existing")
    assert runtime is not None
    assert runtime.status == RunRuntimeStatus.COMPLETED
    assert board_todo_service.completed_run_ids == []
