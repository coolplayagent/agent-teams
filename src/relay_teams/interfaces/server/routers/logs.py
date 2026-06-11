from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import ClassVar

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from relay_teams.interfaces.server.async_call import (
    LOGS_INGEST_THREAD_WORKER_COUNT,
    RouteWorkClass,
    RouteWorkRejectedError,
    call_route_work,
)
from relay_teams.logger import get_logger, log_event
from relay_teams.trace import bind_trace_context, generate_trace_id
from relay_teams.validation import OptionalIdentifierStr

router = APIRouter(prefix="/logs", tags=["Logs"])
logger = get_logger(__name__, source="frontend")
_DETACHED_FRONTEND_LOG_TASKS: set[asyncio.Task[None]] = set()
_DETACHED_FRONTEND_LOG_TASK_LIMIT = LOGS_INGEST_THREAD_WORKER_COUNT * 2


class FrontendLogEvent(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    level: str = Field(pattern="^(debug|info|warn|error)$")
    event: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=2000)
    trace_id: OptionalIdentifierStr = None
    request_id: OptionalIdentifierStr = None
    run_id: OptionalIdentifierStr = None
    session_id: OptionalIdentifierStr = None
    task_id: OptionalIdentifierStr = None
    instance_id: OptionalIdentifierStr = None
    role_id: OptionalIdentifierStr = None
    page: str | None = None
    route: str | None = None
    browser_session_id: OptionalIdentifierStr = None
    user_agent: str | None = None
    payload: dict[str, JsonValue] = Field(default_factory=dict)
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class FrontendLogBatchRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    events: list[FrontendLogEvent] = Field(min_length=1, max_length=200)


@router.post("/frontend")
async def ingest_frontend_logs(req: FrontendLogBatchRequest) -> dict[str, int]:
    if len(_DETACHED_FRONTEND_LOG_TASKS) >= _DETACHED_FRONTEND_LOG_TASK_LIMIT:
        log_event(
            logger,
            logging.WARNING,
            event="logs.frontend.rejected",
            message="Rejected frontend log batch because detached ingest is full",
            payload={
                "pending_tasks": len(_DETACHED_FRONTEND_LOG_TASKS),
                "task_limit": _DETACHED_FRONTEND_LOG_TASK_LIMIT,
            },
        )
        raise RouteWorkRejectedError("Server is busy handling logs ingest work")
    task = asyncio.create_task(_ingest_frontend_logs_background(req))
    _DETACHED_FRONTEND_LOG_TASKS.add(task)
    task.add_done_callback(_DETACHED_FRONTEND_LOG_TASKS.discard)
    accepted = len(req.events)
    log_event(
        logger,
        logging.DEBUG,
        event="logs.frontend.accepted",
        message="Accepted frontend log batch for detached ingest",
        payload={"accepted": accepted},
    )
    return {"accepted": accepted}


async def _ingest_frontend_logs_background(req: FrontendLogBatchRequest) -> None:
    try:
        await call_route_work(
            RouteWorkClass.LOGS_INGEST,
            "logs.frontend.ingest",
            _ingest_frontend_logs,
            req,
        )
    except (RuntimeError, ValueError, TypeError, OSError):
        logger.exception("Failed to ingest frontend log batch")


def _ingest_frontend_logs(req: FrontendLogBatchRequest) -> dict[str, int]:
    accepted = 0
    for item in req.events:
        with bind_trace_context(
            trace_id=item.trace_id or generate_trace_id(),
            request_id=item.request_id,
            run_id=item.run_id,
            session_id=item.session_id,
            task_id=item.task_id,
            instance_id=item.instance_id,
            role_id=item.role_id,
        ):
            log_event(
                logger,
                _to_level(item.level),
                event=f"frontend.{item.event}",
                message=item.message,
                payload={
                    "frontend_ts": item.ts.isoformat(),
                    "page": item.page,
                    "route": item.route,
                    "browser_session_id": item.browser_session_id,
                    "user_agent": item.user_agent,
                    **item.payload,
                },
            )
            accepted += 1
    return {"accepted": accepted}


def _to_level(level: str) -> int:
    table = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warn": logging.WARNING,
        "error": logging.ERROR,
    }
    return table[level]
