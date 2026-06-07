# -*- coding: utf-8 -*-
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Barrier

import pytest

from relay_teams.sessions.runs.run_runtime_repo import (
    RunRuntimePhase,
    RunRuntimeRepository,
    RunRuntimeStatus,
)
from relay_teams.workspace import WorkspaceRepository


@pytest.mark.timeout(10)
def test_run_runtime_repo_handles_concurrent_reads_and_writes(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "run_runtime_concurrency.db"
    repo = RunRuntimeRepository(db_path)
    _ = repo.ensure(
        run_id="run-1",
        session_id="session-1",
        root_task_id="task-1",
    )

    errors: list[BaseException] = []
    start_barrier = Barrier(5)

    def writer(worker_id: int) -> None:
        start_barrier.wait()
        try:
            for iteration in range(200):
                _ = repo.update(
                    "run-1",
                    status=(
                        RunRuntimeStatus.RUNNING
                        if iteration % 2 == 0
                        else RunRuntimeStatus.PAUSED
                    ),
                    phase=RunRuntimePhase.COORDINATOR_RUNNING,
                    active_instance_id=f"inst-{worker_id}-{iteration}",
                )
        except BaseException as exc:  # pragma: no cover - regression capture
            errors.append(exc)

    def reader() -> None:
        start_barrier.wait()
        try:
            for _ in range(400):
                records = repo.list_by_session("session-1")
                assert len(records) == 1
                assert records[0].run_id == "run-1"
        except BaseException as exc:  # pragma: no cover - regression capture
            errors.append(exc)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [
            executor.submit(writer, 1),
            executor.submit(writer, 2),
            executor.submit(reader),
            executor.submit(reader),
            executor.submit(reader),
        ]
        for future in futures:
            future.result()

    assert errors == []
    record = repo.get("run-1")
    assert record is not None
    assert record.session_id == "session-1"
    assert record.root_task_id == "task-1"


@pytest.mark.timeout(10)
def test_workspace_repository_supports_concurrent_reads(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    repository = WorkspaceRepository(tmp_path / "workspace.db")
    _ = repository.create(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    def read_workspace() -> tuple[bool, bool, str]:
        record = repository.get("project-alpha")
        listed = repository.list_all()
        exists = repository.exists("project-alpha")
        return record.workspace_id == "project-alpha", exists, listed[0].workspace_id

    futures = []
    with ThreadPoolExecutor(max_workers=16) as executor:
        for _ in range(128):
            futures.append(executor.submit(read_workspace))

        results = [future.result() for future in as_completed(futures)]

    assert len(results) == 128
    assert all(result == (True, True, "project-alpha") for result in results)
