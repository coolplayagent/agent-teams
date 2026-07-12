from __future__ import annotations

import asyncio
from pathlib import Path
from time import monotonic

import pytest

from relay_teams.agents.execution.prompt_instruction_state import (
    is_prompt_instruction_loaded_async,
    schedule_prompt_instruction_paths_loaded,
)
from relay_teams.persistence.scope_models import StateMutation
from relay_teams.persistence.shared_state_repo import SharedStateRepository


class _BlockingSharedStateRepository(SharedStateRepository):
    def __init__(self, db_path: Path) -> None:
        super().__init__(db_path)
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def manage_state_async(
        self,
        mutation: StateMutation,
        ttl_seconds: int | None = None,
    ) -> None:
        self.started.set()
        await self.release.wait()
        await super().manage_state_async(mutation, ttl_seconds=ttl_seconds)


@pytest.mark.asyncio
async def test_instruction_bookkeeping_is_deferred_from_prompt_path(
    tmp_path: Path,
) -> None:
    store = _BlockingSharedStateRepository(tmp_path / "instruction-state.db")
    instruction_path = tmp_path / "AGENTS.md"

    started = monotonic()
    task = schedule_prompt_instruction_paths_loaded(
        shared_store=store,
        task_id="task-1",
        paths=(instruction_path,),
    )
    elapsed = monotonic() - started

    assert task is not None
    assert elapsed < 0.1
    assert not task.done()
    await asyncio.wait_for(store.started.wait(), timeout=1)
    store.release.set()
    await asyncio.wait_for(task, timeout=1)
    assert await is_prompt_instruction_loaded_async(
        shared_store=store,
        task_id="task-1",
        path=instruction_path,
    )
