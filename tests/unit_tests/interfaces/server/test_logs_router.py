# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from pathlib import Path
import time
from typing import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from relay_teams.interfaces.server.routers import logs
from relay_teams.logger import configure_logging, shutdown_logging


def _wait_for_file_text(path: Path, needle: str) -> str:
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            if needle in text:
                return text
        time.sleep(0.02)
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def test_frontend_logs_route_writes_frontend_log_only(tmp_path: Path) -> None:
    config_dir = tmp_path / ".agent_teams"
    app = FastAPI()
    app.include_router(logs.router, prefix="/api")
    client = TestClient(app)

    configure_logging(config_dir=config_dir)
    response = client.post(
        "/api/logs/frontend",
        json={
            "events": [
                {
                    "level": "error",
                    "event": "ui.failure",
                    "message": "frontend failed",
                    "trace_id": "trace-ui",
                    "request_id": "req-ui",
                    "run_id": "run-ui",
                    "session_id": "session-ui",
                    "page": "chat",
                    "route": "/chat",
                    "browser_session_id": "browser-1",
                    "user_agent": "pytest",
                    "payload": {"component": "composer"},
                }
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 1}

    frontend_text = _wait_for_file_text(
        config_dir / "log" / "frontend.log",
        "event=frontend.ui.failure",
    )
    shutdown_logging()

    backend_text = (config_dir / "log" / "backend.log").read_text(encoding="utf-8")
    assert "event=frontend.ui.failure" not in backend_text
    assert "event=frontend.ui.failure" in frontend_text
    assert "browser_session_id" in frontend_text


def test_frontend_logs_route_runs_batch_in_threadpool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, tuple[object, ...], dict[str, object]]] = []

    async def fake_run_in_threadpool(
        work_class: object,
        operation: str,
        func: Callable[..., object],
        /,
        *args: object,
        **kwargs: object,
    ) -> object:
        _ = (work_class, operation)
        calls.append((func.__name__, args, kwargs))
        return func(*args, **kwargs)

    monkeypatch.setattr(logs, "call_route_work", fake_run_in_threadpool)
    app = FastAPI()
    app.include_router(logs.router, prefix="/api")
    client = TestClient(app)

    response = client.post(
        "/api/logs/frontend",
        json={
            "events": [
                {
                    "level": "info",
                    "event": "ui.ready",
                    "message": "frontend ready",
                }
            ]
        },
    )

    assert response.status_code == 200
    assert response.json() == {"accepted": 1}
    deadline = time.monotonic() + 1.0
    while not calls and time.monotonic() < deadline:
        time.sleep(0.02)
    assert [call[0] for call in calls] == ["_ingest_frontend_logs"]


@pytest.mark.asyncio
async def test_frontend_logs_route_returns_before_background_ingest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    started = asyncio.Event()
    release = asyncio.Event()

    async def fake_run_in_threadpool(
        work_class: object,
        operation: str,
        func: Callable[..., object],
        /,
        *args: object,
        **kwargs: object,
    ) -> object:
        _ = (work_class, operation, func, args, kwargs)
        started.set()
        await release.wait()
        calls.append("ingested")
        return {"accepted": 1}

    monkeypatch.setattr(logs, "call_route_work", fake_run_in_threadpool)
    req = logs.FrontendLogBatchRequest(
        events=[
            logs.FrontendLogEvent(
                level="info",
                event="ui.ready",
                message="frontend ready",
            )
        ]
    )

    result = await logs.ingest_frontend_logs(req)

    assert result == {"accepted": 1}
    await asyncio.wait_for(started.wait(), timeout=1)
    assert calls == []
    tasks = tuple(logs._DETACHED_FRONTEND_LOG_TASKS)
    release.set()
    if tasks:
        await asyncio.wait_for(asyncio.gather(*tasks), timeout=1)
    assert calls == ["ingested"]


@pytest.mark.asyncio
async def test_frontend_logs_route_rejects_when_detached_ingest_queue_full() -> None:
    blockers: list[asyncio.Task[None]] = []
    req = logs.FrontendLogBatchRequest(
        events=[
            logs.FrontendLogEvent(
                level="info",
                event="ui.ready",
                message="frontend ready",
            )
        ]
    )
    try:
        for _ in range(logs._DETACHED_FRONTEND_LOG_TASK_LIMIT):
            task = asyncio.create_task(asyncio.sleep(30))
            blockers.append(task)
            logs._DETACHED_FRONTEND_LOG_TASKS.add(task)

        with pytest.raises(logs.RouteWorkRejectedError, match="logs ingest"):
            await logs.ingest_frontend_logs(req)
    finally:
        for task in blockers:
            logs._DETACHED_FRONTEND_LOG_TASKS.discard(task)
            task.cancel()
        if blockers:
            _ = await asyncio.gather(*blockers, return_exceptions=True)


@pytest.mark.asyncio
async def test_frontend_logs_background_ingest_logs_and_swallows_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failures: list[str] = []

    async def fake_run_in_threadpool(
        work_class: object,
        operation: str,
        func: Callable[..., object],
        /,
        *args: object,
        **kwargs: object,
    ) -> object:
        _ = (work_class, operation, func, args, kwargs)
        raise RuntimeError("log queue full")

    def capture_exception(message: str) -> None:
        failures.append(message)

    monkeypatch.setattr(logs, "call_route_work", fake_run_in_threadpool)
    monkeypatch.setattr(logs.logger, "exception", capture_exception)
    req = logs.FrontendLogBatchRequest(
        events=[
            logs.FrontendLogEvent(
                level="info",
                event="ui.ready",
                message="frontend ready",
            )
        ]
    )

    await logs._ingest_frontend_logs_background(req)

    assert failures == ["Failed to ingest frontend log batch"]
