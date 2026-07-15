# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
import platform

from relay_teams.logger import get_logger, log_event
from relay_teams.persistence.scope_models import ScopeRef, ScopeType, StateMutation
from relay_teams.persistence.shared_state_repo import SharedStateRepository

PROMPT_INSTRUCTION_STATE_PREFIX = "prompt_instruction:"
LOGGER = get_logger(__name__)
_SCHEDULED_STATE_WRITES: set[asyncio.Task[None]] = set()


def normalize_instruction_path(path: Path) -> str:
    resolved = str(path.expanduser().resolve())
    if platform.system() == "Windows":
        return resolved.lower()
    return resolved


async def record_prompt_instruction_loaded_async(
    *,
    shared_store: SharedStateRepository,
    task_id: str,
    path: Path,
) -> None:
    resolved_path = path.expanduser().resolve()
    await shared_store.manage_state_async(
        StateMutation(
            scope=_task_scope(task_id),
            key=_state_key(resolved_path),
            value_json='"loaded"',
        )
    )


async def record_prompt_instruction_paths_loaded_async(
    *,
    shared_store: SharedStateRepository,
    task_id: str,
    paths: tuple[Path, ...],
) -> None:
    for path in paths:
        await record_prompt_instruction_loaded_async(
            shared_store=shared_store,
            task_id=task_id,
            path=path,
        )


def schedule_prompt_instruction_paths_loaded(
    *,
    shared_store: SharedStateRepository,
    task_id: str,
    paths: tuple[Path, ...],
) -> asyncio.Task[None] | None:
    if not paths:
        return None
    task = asyncio.create_task(
        record_prompt_instruction_paths_loaded_async(
            shared_store=shared_store,
            task_id=task_id,
            paths=paths,
        )
    )
    _SCHEDULED_STATE_WRITES.add(task)
    task.add_done_callback(_observe_scheduled_instruction_state_write)
    return task


def _observe_scheduled_instruction_state_write(task: asyncio.Task[None]) -> None:
    _SCHEDULED_STATE_WRITES.discard(task)
    try:
        error = task.exception()
    except asyncio.CancelledError:
        return
    if error is None:
        return
    log_event(
        LOGGER,
        logging.WARNING,
        event="prompt_instruction.state_write_failed",
        message="Deferred prompt instruction bookkeeping failed",
        payload={"error": f"{type(error).__name__}: {error}"},
    )


async def is_prompt_instruction_loaded_async(
    *,
    shared_store: SharedStateRepository,
    task_id: str,
    path: Path,
) -> bool:
    return (
        await shared_store.get_state_async(_task_scope(task_id), _state_key(path))
        is not None
    )


async def filter_unloaded_prompt_instruction_paths_async(
    *,
    shared_store: SharedStateRepository,
    task_id: str,
    paths: tuple[Path, ...],
) -> tuple[Path, ...]:
    unloaded: list[Path] = []
    for path in paths:
        if not await is_prompt_instruction_loaded_async(
            shared_store=shared_store,
            task_id=task_id,
            path=path,
        ):
            unloaded.append(path)
    return tuple(unloaded)


def _task_scope(task_id: str) -> ScopeRef:
    return ScopeRef(scope_type=ScopeType.TASK, scope_id=task_id)


def _state_key(path: Path) -> str:
    return PROMPT_INSTRUCTION_STATE_PREFIX + normalize_instruction_path(path)
