from __future__ import annotations

import asyncio
import logging
import time
from typing import Annotated, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import JsonValue, TypeAdapter, ValidationError

from relay_teams.interfaces.server.ag_ui import (
    AgUiActionResponse,
    AgUiCreateRunRequest,
    AgUiCreateRunResponse,
    AgUiInjectMessageRequest,
    AgUiResolveToolApprovalRequest,
    AgUiSessionSnapshotResponse,
    AgUiStopRunRequest,
    format_ag_ui_sse_event,
    normalize_multiplex_run_offsets,
    relay_run_event_to_ag_ui_event,
    resolve_after_event_id,
)
from relay_teams.interfaces.server.ag_ui.contracts import AgUiStreamError
from relay_teams.interfaces.server.deps import get_run_service, get_session_service
from relay_teams.interfaces.server.deps import (
    get_general_config_service,
    get_skill_registry,
)
from relay_teams.interfaces.server.router_error_mapping import http_exception_for
from relay_teams.logger import get_logger, log_event
from relay_teams.general import GeneralConfigService
from relay_teams.sessions.runs.run_models import IntentInput
from relay_teams.sessions.runs.run_service import SessionRunService
from relay_teams.sessions.runs.user_question_models import (
    UserQuestionAnswerSubmission,
)
from relay_teams.sessions.session_service import SessionService
from relay_teams.skills import SkillRegistry
from relay_teams.trace import bind_trace_context
from relay_teams.validation import RequiredIdentifierStr

router = APIRouter(prefix="/ag-ui", tags=["AG-UI"])
logger = get_logger(__name__)
JSON_VALUE_ADAPTER = TypeAdapter(JsonValue)
MAX_MULTIPLEX_RUN_STREAMS = 32


@router.post(
    "/runs",
    response_model=AgUiCreateRunResponse,
    response_model_exclude_none=True,
)
async def create_run(
    req: AgUiCreateRunRequest,
    service: Annotated[SessionRunService, Depends(get_run_service)],
    skill_registry: Annotated[SkillRegistry, Depends(get_skill_registry)],
    general_config_service: Annotated[
        GeneralConfigService, Depends(get_general_config_service)
    ],
) -> AgUiCreateRunResponse:
    if not req.input:
        raise HTTPException(status_code=400, detail="Run input cannot be empty")
    resolved_skills = None
    if req.skills is not None:
        try:
            resolved_skills = skill_registry.resolve_known(
                tuple(req.skills),
                strict=True,
                consumer="interfaces.server.routers.ag_ui.create_run",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    shell_safety_policy_enabled = req.shell_safety_policy_enabled
    shell_safety_policy_override_provided = shell_safety_policy_enabled is not None
    if shell_safety_policy_enabled is None:
        shell_safety_policy_enabled = await asyncio.to_thread(
            lambda: general_config_service.get_config().shell_safety_policy_enabled
        )
    intent_input = IntentInput(
        session_id=req.session_id,
        input=req.input,
        display_input=req.display_input,
        run_kind=req.run_kind,
        generation_config=req.generation_config,
        execution_mode=req.execution_mode,
        yolo=req.yolo,
        shell_safety_policy_enabled=shell_safety_policy_enabled,
        shell_safety_policy_override_provided=shell_safety_policy_override_provided,
        thinking=req.thinking,
        target_role_id=req.target_role_id,
        skills=resolved_skills,
        orchestration_policy=req.orchestration_policy,
    )
    try:
        run_id, session_id = await _create_and_schedule_run_start(
            service,
            intent_input,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AgUiCreateRunResponse(
        run_id=run_id,
        session_id=session_id,
        target_role_id=req.target_role_id,
    )


@router.get("/runs/events")
async def stream_multiplexed_run_events(
    service: Annotated[SessionRunService, Depends(get_run_service)],
    run_id: Annotated[list[str], Query(default_factory=list)],
    after_event_id: Annotated[list[int], Query(default_factory=list)],
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    default_after_event_id = resolve_after_event_id(
        query_after_event_id=None,
        last_event_id=last_event_id,
    )
    run_offsets = normalize_multiplex_run_offsets(
        run_id,
        after_event_id,
        default_after_event_id=default_after_event_id,
        max_run_streams=MAX_MULTIPLEX_RUN_STREAMS,
    )

    async def event_generator():
        event_count = 0
        started = time.perf_counter()
        log_event(
            logger,
            logging.INFO,
            event="ag_ui.stream.multiplex.opened",
            message="AG-UI multiplex run event stream opened",
            payload={"run_count": len(run_offsets)},
        )
        try:
            async for event in service.stream_multiplexed_run_events(run_offsets):
                event_count += 1
                yield format_ag_ui_sse_event(relay_run_event_to_ag_ui_event(event))
            _log_stream_closed(
                "ag_ui.stream.multiplex.closed",
                "AG-UI multiplex run event stream closed",
                started=started,
                event_count=event_count,
                payload_count=len(run_offsets),
            )
        except Exception as exc:  # pragma: no cover - defensive stream path
            _log_stream_failed(
                "ag_ui.stream.multiplex.failed",
                "Unexpected AG-UI multiplex stream failure",
                event_count=event_count,
                exc=exc,
            )
            yield _format_stream_error(str(exc))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/runs/{run_id}/events")
async def stream_run_events(
    run_id: RequiredIdentifierStr,
    service: Annotated[SessionRunService, Depends(get_run_service)],
    after_event_id: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    resolved_after_event_id = resolve_after_event_id(
        query_after_event_id=after_event_id,
        last_event_id=last_event_id,
    )

    async def event_generator():
        event_count = 0
        started = time.perf_counter()
        with bind_trace_context(trace_id=run_id, run_id=run_id):
            log_event(
                logger,
                logging.INFO,
                event="ag_ui.stream.opened",
                message="AG-UI run event stream opened",
                payload={"after_event_id": resolved_after_event_id},
            )
            try:
                async for event in service.stream_run_events(
                    run_id,
                    after_event_id=resolved_after_event_id,
                ):
                    event_count += 1
                    yield format_ag_ui_sse_event(relay_run_event_to_ag_ui_event(event))
                _log_stream_closed(
                    "ag_ui.stream.closed",
                    "AG-UI run event stream closed",
                    started=started,
                    event_count=event_count,
                    payload_count=None,
                )
            except KeyError as exc:
                log_event(
                    logger,
                    logging.WARNING,
                    event="ag_ui.stream.not_found",
                    message="Run not found during AG-UI stream start",
                    exc_info=exc,
                )
                yield _format_stream_error(str(exc))
            except Exception as exc:  # pragma: no cover - defensive stream path
                _log_stream_failed(
                    "ag_ui.stream.failed",
                    "Unexpected AG-UI stream failure",
                    event_count=event_count,
                    exc=exc,
                )
                yield _format_stream_error(str(exc))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get(
    "/sessions/{session_id}/snapshot",
    response_model=AgUiSessionSnapshotResponse,
)
async def get_session_snapshot(
    session_id: RequiredIdentifierStr,
    service: Annotated[SessionService, Depends(get_session_service)],
    force_refresh: bool = False,
) -> AgUiSessionSnapshotResponse:
    try:
        recovery = await service.get_recovery_snapshot_async(
            session_id,
            force_refresh=force_refresh,
        )
        messages = await service.get_session_messages_async(session_id)
        global_events = await service.get_global_events_async(session_id)
    except KeyError as exc:
        raise http_exception_for(exc, key_error_detail="Session not found") from exc
    return AgUiSessionSnapshotResponse(
        session_id=session_id,
        recovery=_to_json_value(recovery),
        messages=tuple(_to_json_value(message) for message in messages),
        global_events=tuple(_to_json_value(event) for event in global_events),
    )


@router.post(
    "/runs/{run_id}:stop",
    response_model=AgUiActionResponse,
    response_model_exclude_none=True,
)
async def stop_run(
    run_id: RequiredIdentifierStr,
    req: AgUiStopRunRequest,
    service: Annotated[SessionRunService, Depends(get_run_service)],
) -> AgUiActionResponse:
    try:
        if req.scope == "main":
            await service.stop_run_async(run_id)
            return AgUiActionResponse(status="ok", run_id=run_id, scope="main")
        if not req.instance_id:
            raise HTTPException(
                status_code=422,
                detail="instance_id is required when scope is subagent",
            )
        payload = await service.stop_subagent_async(run_id, req.instance_id)
        instance_id = str(payload["instance_id"])
        return AgUiActionResponse(
            status="ok",
            run_id=run_id,
            scope="subagent",
            instance_id=instance_id,
            payload=_to_json_value(payload),
        )
    except (KeyError, ValueError) as exc:
        raise http_exception_for(exc, mappings=((ValueError, 400),)) from exc


@router.post(
    "/runs/{run_id}:resume",
    response_model=AgUiActionResponse,
    response_model_exclude_none=True,
)
async def resume_run(
    run_id: RequiredIdentifierStr,
    service: Annotated[SessionRunService, Depends(get_run_service)],
) -> AgUiActionResponse:
    try:
        session_id = await _resume_and_start_run(service, run_id)
    except (KeyError, RuntimeError) as exc:
        raise http_exception_for(exc, mappings=((RuntimeError, 409),)) from exc
    return AgUiActionResponse(status="ok", run_id=run_id, session_id=session_id)


@router.post(
    "/runs/{run_id}/inject",
    response_model=AgUiActionResponse,
    response_model_exclude_none=True,
)
async def inject_message(
    run_id: RequiredIdentifierStr,
    req: AgUiInjectMessageRequest,
    service: Annotated[SessionRunService, Depends(get_run_service)],
) -> AgUiActionResponse:
    try:
        result = await service.inject_message_async(
            run_id=run_id,
            source=req.source,
            content=req.content,
            delivery_mode=req.mode,
            client_message_id=req.client_message_id,
        )
    except (KeyError, ValueError) as exc:
        raise http_exception_for(exc, mappings=((ValueError, 400),)) from exc
    return AgUiActionResponse(
        status="ok",
        run_id=run_id,
        payload=_to_json_value(result.model_dump(mode="json")),
    )


@router.post(
    "/runs/{run_id}/tool-approvals/{tool_call_id}:resolve",
    response_model=AgUiActionResponse,
    response_model_exclude_none=True,
)
async def resolve_tool_approval(
    run_id: RequiredIdentifierStr,
    tool_call_id: RequiredIdentifierStr,
    req: AgUiResolveToolApprovalRequest,
    service: Annotated[SessionRunService, Depends(get_run_service)],
) -> AgUiActionResponse:
    selected_option_id = req.option_id or ""
    try:
        await service.resolve_tool_approval_async(
            run_id=run_id,
            tool_call_id=tool_call_id,
            action=req.action,
            feedback=req.feedback,
            option_id=selected_option_id,
        )
    except KeyError as exc:
        raise http_exception_for(exc) from exc
    except ValueError as exc:
        raise http_exception_for(exc, mappings=((ValueError, 400),)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AgUiActionResponse(
        status="ok",
        run_id=run_id,
        action=req.action,
        option_id=req.option_id,
    )


@router.post(
    "/runs/{run_id}/questions/{question_id}:answer",
    response_model=AgUiActionResponse,
    response_model_exclude_none=True,
)
async def answer_user_question(
    run_id: RequiredIdentifierStr,
    question_id: RequiredIdentifierStr,
    req: UserQuestionAnswerSubmission,
    service: Annotated[SessionRunService, Depends(get_run_service)],
) -> AgUiActionResponse:
    try:
        result = await service.answer_user_question_async(
            run_id=run_id,
            question_id=question_id,
            answers=req,
        )
    except (KeyError, ValueError) as exc:
        raise http_exception_for(exc, mappings=((ValueError, 400),)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AgUiActionResponse(
        status="ok",
        run_id=run_id,
        payload=_to_json_value(result),
    )


async def _create_and_schedule_run_start(
    service: SessionRunService,
    intent_input: IntentInput,
) -> tuple[str, str]:
    async def operation() -> tuple[str, str]:
        run_id, session_id = await service.create_run_async(intent_input)
        service.schedule_run_start(run_id, session_id)
        return run_id, session_id

    task = asyncio.create_task(operation())
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        _ = await task
        raise


async def _resume_and_start_run(
    service: SessionRunService,
    run_id: str,
) -> str:
    async def operation() -> str:
        session_id = await service.resume_run_async(run_id)
        await service.ensure_run_started_async(run_id)
        return session_id

    task = asyncio.create_task(operation())
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        _ = await task
        raise


def _to_json_value(value: object) -> JsonValue:
    try:
        return JSON_VALUE_ADAPTER.validate_python(value)
    except ValidationError:
        return cast(JsonValue, str(value))


def _format_stream_error(message: str) -> str:
    payload = AgUiStreamError(error=message)
    return f"event: error\ndata: {payload.model_dump_json()}\n\n"


def _log_stream_closed(
    event: str,
    message: str,
    *,
    started: float,
    event_count: int,
    payload_count: int | None,
) -> None:
    payload: dict[str, JsonValue] = {"event_count": event_count}
    if payload_count is not None:
        payload["run_count"] = payload_count
    log_event(
        logger,
        logging.INFO,
        event=event,
        message=message,
        duration_ms=int((time.perf_counter() - started) * 1000),
        payload=payload,
    )


def _log_stream_failed(
    event: str,
    message: str,
    *,
    event_count: int,
    exc: Exception,
) -> None:
    log_event(
        logger,
        logging.ERROR,
        event=event,
        message=message,
        payload={"event_count": event_count},
        exc_info=exc,
    )
