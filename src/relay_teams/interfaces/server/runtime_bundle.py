# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Awaitable, Callable
import logging
from pathlib import Path

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from relay_teams.computer import ComputerRuntime
from relay_teams.interfaces.server.async_call import (
    RouteWorkRejectedError,
    reset_default_route_work_class,
    route_work_class_for_http_method,
    set_default_route_work_class,
)
from relay_teams.interfaces.server.container import ServerContainer
from relay_teams.interfaces.server.routers import (
    a2a_internal,
    ag_ui,
    artifacts_router,
    audit,
    auto_harness,
    automation,
    boards,
    commands,
    connectors,
    feishu_gateway,
    gateway,
    guardrails_router,
    logs,
    mcp,
    memories,
    observability,
    prompts,
    roles,
    runs,
    session_media,
    sessions,
    speech,
    system,
    tasks,
    triggers,
    workspaces,
)
from relay_teams.interfaces.server.runtime_contracts import HydrationBundle
from relay_teams.interfaces.server.runtime_identity import build_server_health_payload
from relay_teams.logger import configure_logging, get_logger, log_event

RequestHandler = Callable[[Request], Awaitable[Response]]

logger = get_logger(__name__)


def build_hydration_bundle(
    *,
    config_dir: Path,
    version: str,
    computer_runtime: ComputerRuntime | None = None,
) -> HydrationBundle:
    configure_logging(config_dir=config_dir)
    if computer_runtime is None:
        container = ServerContainer(config_dir=config_dir)
    else:
        container = ServerContainer(
            config_dir=config_dir,
            computer_runtime=computer_runtime,
        )
    api_app = FastAPI(
        title="Agent Teams Server",
        description="REST API for Agent Teams orchestration.",
        version=version,
    )
    api_app.state.config_dir = config_dir
    api_app.state.container = container
    api_app.state.startup_phase = "starting_runtime"
    api_app.state.hydrated = False
    api_app.state.components = {"core": "ready", "runtime": "loading"}

    @api_app.middleware("http")
    async def route_work_class_middleware(
        request: Request,
        call_next: RequestHandler,
    ) -> Response:
        token = set_default_route_work_class(
            route_work_class_for_http_method(request.method)
        )
        try:
            return await call_next(request)
        finally:
            reset_default_route_work_class(token)

    api_app.add_exception_handler(RouteWorkRejectedError, route_work_rejected_handler)
    api_app.add_exception_handler(Exception, global_exception_handler)

    routers = (
        system.router,
        audit.router,
        commands.router,
        connectors.router,
        automation.router,
        auto_harness.router,
        feishu_gateway.router,
        gateway.router,
        mcp.router,
        observability.router,
        sessions.router,
        session_media.router,
        runs.router,
        speech.router,
        triggers.router,
        artifacts_router.router,
        tasks.router,
        roles.router,
        prompts.router,
        logs.router,
        workspaces.router,
        guardrails_router.router,
        memories.router,
        boards.router,
        ag_ui.router,
        a2a_internal.router,
    )
    for router in routers:
        api_app.include_router(router)

    def health_payload_builder() -> dict[str, object]:
        payload = build_server_health_payload(
            config_dir=config_dir,
            role_registry=container.role_registry,
            skill_registry=container.skill_registry,
            tool_registry=container.tool_registry,
        ).model_dump(mode="json")
        return dict(payload)

    return HydrationBundle(
        container=container,
        api_app=api_app,
        health_payload_builder=health_payload_builder,
    )


async def route_work_rejected_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    log_event(
        logger,
        logging.WARNING,
        event="http.request.shed",
        message="Server shed route work under load",
        payload={"method": request.method, "path": request.url.path},
        exc_info=exc,
    )
    return JSONResponse(status_code=503, content={"detail": str(exc)})


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log_event(
        logger,
        logging.ERROR,
        event="http.request.failed",
        message="Unhandled server exception",
        payload={"method": request.method, "path": request.url.path},
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
