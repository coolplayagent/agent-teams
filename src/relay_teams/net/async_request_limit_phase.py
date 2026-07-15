# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar


class AsyncRequestLimitPhase:
    def __init__(self) -> None:
        self.waiting = asyncio.Event()
        self.acquired = asyncio.Event()

    def mark_waiting(self) -> None:
        self.waiting.set()

    def mark_acquired(self) -> None:
        self.acquired.set()


_CURRENT_ASYNC_REQUEST_LIMIT_PHASE: ContextVar[AsyncRequestLimitPhase | None] = (
    ContextVar("current_async_request_limit_phase", default=None)
)


@contextmanager
def observe_async_request_limit_phase() -> Iterator[AsyncRequestLimitPhase]:
    phase = AsyncRequestLimitPhase()
    token = _CURRENT_ASYNC_REQUEST_LIMIT_PHASE.set(phase)
    try:
        yield phase
    finally:
        _CURRENT_ASYNC_REQUEST_LIMIT_PHASE.reset(token)


def mark_async_request_limit_waiting() -> None:
    phase = _CURRENT_ASYNC_REQUEST_LIMIT_PHASE.get()
    if phase is not None:
        phase.mark_waiting()


def mark_async_request_limit_acquired() -> None:
    phase = _CURRENT_ASYNC_REQUEST_LIMIT_PHASE.get()
    if phase is not None:
        phase.mark_acquired()
