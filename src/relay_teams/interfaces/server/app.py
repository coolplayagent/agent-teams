# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
import importlib
import json
import logging
import os
from pathlib import Path
import re
import signal
import sys
import time
from types import FrameType
from typing import Protocol, cast
import uuid

from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Mount
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from relay_teams.builtin.resources import ensure_app_config_bootstrap
from relay_teams.interfaces.server.config_paths import get_frontend_dist_dir
from relay_teams.interfaces.server.public_access import (
    is_public_access_guard_enabled,
    is_public_host_allowed_request,
    public_access_denied_detail,
    request_uses_public_host,
)
from relay_teams.interfaces.server.runtime_contracts import (
    HydratedHealthPayloadBuilder,
    HydrationBundle,
    RuntimeContainer,
)
from relay_teams.logger import shutdown_logging
from relay_teams.paths import get_app_config_dir
from relay_teams.trace import bind_trace_context

SERVER_VERSION = "0.1.0"
SERVICE_INITIALIZING = "service_initializing"
HYDRATION_READ_WAIT_SECONDS = 0.0
HYDRATION_MUTATION_WAIT_SECONDS = 0.0
_RUNTIME_BUNDLE_MODULE = "relay_teams.interfaces.server.runtime_bundle"

logger = logging.getLogger("relay_teams.bootstrap.server")
FRONTEND_DIST_DIR = get_frontend_dist_dir()
RequestHandler = Callable[[Request], Awaitable[Response]]
SignalHandler = Callable[[int, FrameType | None], None]
SignalHandlerRef = int | SignalHandler | None
AsyncioExceptionContext = dict[str, object]
AsyncioExceptionHandler = Callable[
    [asyncio.AbstractEventLoop, AsyncioExceptionContext], None
]

_SUPPRESSED_SUCCESS_PATHS = (
    re.compile(r"^/api/system/health$"),
    re.compile(r"^/api/system/live$"),
    re.compile(r"^/api/system/startup$"),
    re.compile(r"^/api/system/control-plane$"),
    re.compile(r"^/api/sessions/[^/]+/recovery$"),
    re.compile(r"^/api/sessions/[^/]+/runs/[^/]+/token-usage$"),
)
_SUPPRESSED_NOISY_PATHS = (
    re.compile(r"^/\.well-known/appspecific/com\.chrome\.devtools\.json$"),
)
_BOOTSTRAP_API_PATHS = frozenset(
    (
        "/api/system/health",
        "/api/system/live",
        "/api/system/startup",
        "/api/system/control-plane",
        "/api/system/configs/ui-language",
        "/api/system/configs/orchestration",
        "/api/logs/frontend",
        "/api/roles:options",
    )
)
_RUNTIME_SHADOW_BOOTSTRAP_PATHS = frozenset(
    (
        "/api/logs/frontend",
        "/api/system/configs/orchestration",
        "/api/roles:options",
    )
)


class HydrationGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestHandler,
    ) -> Response:
        return await hydration_gate_middleware(request, call_next)


class PublicHostGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestHandler,
    ) -> Response:
        return await public_host_guard_middleware(request, call_next)


class TracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestHandler,
    ) -> Response:
        return await tracing_middleware(request, call_next)


class FrontendStaticFiles(StaticFiles):
    def file_response(
        self,
        full_path: os.PathLike[str] | str,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers.setdefault("Cache-Control", "no-cache")
        return response


@asynccontextmanager
async def lifespan(starlette_app: Starlette) -> AsyncIterator[None]:
    config_dir = get_app_config_dir()
    ensure_app_config_bootstrap(config_dir)
    _sync_plain_app_env_to_process_env(config_dir / ".env")
    _configure_asyncio_exception_handler()
    _register_signal_handlers()
    starlette_app.state.config_dir = config_dir
    starlette_app.state.startup_phase = "bootstrap"
    starlette_app.state.started_at = time.time()
    starlette_app.state.hydrated = False
    starlette_app.state.hydration_error = None
    starlette_app.state.components = {"core": "ready", "runtime": "loading"}
    hydration_task = asyncio.create_task(_hydrate_runtime(starlette_app, config_dir))
    starlette_app.state.hydration_task = hydration_task
    _log_event(
        logging.INFO,
        event="app.bootstrap.ready",
        message="Agent Teams bootstrap server ready",
        payload=_startup_payload(starlette_app),
    )
    try:
        yield
    finally:
        if hydration_task.done():
            _log_finished_hydration_task_error(hydration_task)
        else:
            hydration_task.cancel()
            try:
                await hydration_task
            except asyncio.CancelledError:
                # Shutdown intentionally cancels any in-flight runtime hydration.
                pass
        container = getattr(starlette_app.state, "container", None)
        if container is not None:
            await container.stop()
        _log_event(
            logging.INFO,
            event="app.shutdown",
            message="Agent Teams server stopped",
        )
        _shutdown_logging_if_configured()


app = Starlette(lifespan=lifespan)


async def bootstrap_health(request: Request) -> JSONResponse:
    return JSONResponse(_health_payload(request.app))


async def startup_status(request: Request) -> JSONResponse:
    return JSONResponse(_startup_payload(request.app))


async def bootstrap_live(request: Request) -> JSONResponse:
    started_at = float(getattr(request.app.state, "started_at", time.time()))
    return JSONResponse(
        {
            "status": "alive",
            "version": SERVER_VERSION,
            "pid": os.getpid(),
            "uptime_seconds": max(0.0, time.time() - started_at),
            "main_base_url": os.environ.get(
                "RELAY_TEAMS_CONTROL_PLANE_MAIN_URL",
                "",
            ).strip(),
        }
    )


async def bootstrap_control_plane(request: Request) -> JSONResponse:
    _ = request
    live_url = os.environ.get("RELAY_TEAMS_CONTROL_PLANE_URL", "").strip()
    host = os.environ.get("RELAY_TEAMS_CONTROL_PLANE_HOST", "").strip()
    port = _env_int("RELAY_TEAMS_CONTROL_PLANE_PORT")
    main_base_url = os.environ.get("RELAY_TEAMS_CONTROL_PLANE_MAIN_URL", "").strip()
    return JSONResponse(
        {
            "enabled": bool(live_url and host and port is not None),
            "live_url": live_url or None,
            "host": host or None,
            "port": port,
            "main_base_url": main_base_url or None,
        }
    )


async def bootstrap_ui_language(request: Request) -> JSONResponse:
    config_dir = _request_config_dir(request)
    settings = _read_bootstrap_ui_language(config_dir)
    return JSONResponse(settings)


async def bootstrap_save_ui_language(request: Request) -> JSONResponse:
    try:
        payload: object = await request.json()
    except ValueError:
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid UI language settings"},
        )
    if not isinstance(payload, dict):
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid UI language settings"},
        )
    if set(payload) != {"language"}:
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid UI language settings"},
        )
    language = payload.get("language")
    if language not in {"en-US", "zh-CN"}:
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid UI language settings"},
        )
    config_dir = _request_config_dir(request)
    try:
        config_dir.mkdir(parents=True, exist_ok=True)
        _ = (config_dir / "ui.json").write_text(
            json.dumps({"language": language}, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        return JSONResponse(status_code=500, content={"detail": str(exc)})
    return JSONResponse({"status": "ok"})


async def bootstrap_orchestration_config(request: Request) -> JSONResponse:
    config_dir = _request_config_dir(request)
    return JSONResponse(_read_bootstrap_orchestration_config(config_dir))


async def bootstrap_frontend_logs(request: Request) -> JSONResponse:
    accepted = await _count_frontend_log_events(request)
    return JSONResponse({"accepted": accepted})


async def bootstrap_role_options(request: Request) -> JSONResponse:
    _ = request
    return JSONResponse(_read_bootstrap_role_options())


async def hydration_gate_middleware(
    request: Request,
    call_next: RequestHandler,
) -> Response:
    path = request.url.path
    if (
        path.startswith("/api/")
        and path not in _BOOTSTRAP_API_PATHS
        and not getattr(request.app.state, "hydrated", False)
    ):
        if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
            await _wait_for_hydration(
                request.app,
                timeout_seconds=HYDRATION_READ_WAIT_SECONDS,
            )
            if getattr(request.app.state, "hydrated", False):
                return await call_next(request)
        else:
            await _wait_for_hydration(
                request.app,
                timeout_seconds=HYDRATION_MUTATION_WAIT_SECONDS,
            )
            if getattr(request.app.state, "hydrated", False):
                return await call_next(request)
        return JSONResponse(
            status_code=503,
            content={
                "detail": SERVICE_INITIALIZING,
                "component": _component_for_path(path),
                "startup": _startup_payload(request.app),
            },
            headers={"Retry-After": "1"},
        )
    return await call_next(request)


async def public_host_guard_middleware(
    request: Request,
    call_next: RequestHandler,
) -> Response:
    if (
        not is_public_access_guard_enabled()
        or not request_uses_public_host(request)
        or is_public_host_allowed_request(request)
    ):
        return await call_next(request)
    detail = public_access_denied_detail()
    _log_event(
        logging.WARNING,
        event="http.request.public_host_blocked",
        message="Blocked public-host access to non-public route",
        payload={
            "method": request.method,
            "path": request.url.path,
            "host": request.url.hostname,
        },
    )
    return JSONResponse(status_code=403, content={"detail": detail})


async def tracing_middleware(request: Request, call_next: RequestHandler) -> Response:
    request_id = request.headers.get("X-Request-Id") or _generate_request_id()
    trace_id = request.headers.get("X-Trace-Id") or request_id
    started = time.perf_counter()
    path = request.url.path

    with bind_trace_context(request_id=request_id, trace_id=trace_id):
        response: Response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Trace-Id"] = trace_id
        log_level = _resolve_request_log_level(
            path=path, status_code=response.status_code
        )
        if log_level is not None:
            _log_event(
                log_level,
                event="http.request.completed",
                message="HTTP request completed",
                duration_ms=elapsed_ms,
                payload={
                    "method": request.method,
                    "path": path,
                    "status_code": response.status_code,
                },
            )
        return response


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    _log_event(
        logging.ERROR,
        event="http.request.failed",
        message="Unhandled server exception",
        payload={"method": request.method, "path": request.url.path},
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


async def route_work_rejected_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    _log_event(
        logging.WARNING,
        event="http.request.shed",
        message="Server shed route work under load",
        payload={"method": request.method, "path": request.url.path},
        exc_info=exc,
    )
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.add_route("/api/system/health", bootstrap_health, methods=["GET"])
app.add_route("/api/system/live", bootstrap_live, methods=["GET"])
app.add_route("/api/system/startup", startup_status, methods=["GET"])
app.add_route("/api/system/control-plane", bootstrap_control_plane, methods=["GET"])
app.add_route(
    "/api/system/configs/ui-language",
    bootstrap_ui_language,
    methods=["GET"],
)
app.add_route(
    "/api/system/configs/ui-language",
    bootstrap_save_ui_language,
    methods=["PUT"],
)
app.add_route(
    "/api/system/configs/orchestration",
    bootstrap_orchestration_config,
    methods=["GET"],
)
app.add_route("/api/logs/frontend", bootstrap_frontend_logs, methods=["POST"])
app.add_route("/api/roles:options", bootstrap_role_options, methods=["GET"])
app.add_exception_handler(Exception, global_exception_handler)
app.add_middleware(TracingMiddleware)
app.add_middleware(PublicHostGuardMiddleware)
app.add_middleware(HydrationGateMiddleware)


async def _hydrate_runtime(app: Starlette, config_dir: Path) -> None:
    started = time.perf_counter()
    try:
        await asyncio.sleep(0.05)
        app.state.startup_phase = "loading_runtime"
        bundle = await asyncio.to_thread(_build_hydration_bundle, config_dir)
        app.state.startup_phase = "starting_runtime"
        app.state.container = bundle.container
        app.state.health_payload_builder = bundle.health_payload_builder
        await bundle.container.start()
        app.state.startup_phase = "mounting_routes"
        bundle.api_app.state.startup_phase = "ready"
        bundle.api_app.state.hydrated = True
        bundle.api_app.state.components = {"core": "ready", "runtime": "ready"}
        frontend_routes = _remove_frontend_mount(app)
        app.routes.append(Mount("/api", app=bundle.api_app, name="api"))
        _remove_runtime_shadow_bootstrap_routes(app)
        app.router.routes.extend(frontend_routes)
        app.state.hydrated = True
        app.state.startup_phase = "ready"
        app.state.components = {"core": "ready", "runtime": "ready"}
        _log_event(
            logging.INFO,
            event="app.hydration.ready",
            message="Agent Teams runtime hydrated",
            duration_ms=int((time.perf_counter() - started) * 1000),
            payload=_startup_payload(app),
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        await _stop_failed_hydration_container(app)
        app.state.startup_phase = "failed"
        app.state.hydration_error = str(exc) or exc.__class__.__name__
        app.state.health_payload_builder = None
        app.state.components = {"core": "ready", "runtime": "failed"}
        _log_event(
            logging.ERROR,
            event="app.hydration.failed",
            message="Agent Teams runtime hydration failed",
            duration_ms=int((time.perf_counter() - started) * 1000),
            payload=_startup_payload(app),
            exc_info=exc,
        )


async def _stop_failed_hydration_container(starlette_app: Starlette) -> None:
    container: RuntimeContainer | None = getattr(starlette_app.state, "container", None)
    if container is None:
        return
    try:
        await container.stop()
    except Exception as exc:
        _log_event(
            logging.ERROR,
            event="app.hydration.container_stop_failed",
            message="Failed to stop partially hydrated runtime container",
            exc_info=exc,
        )
        return
    starlette_app.state.container = None
    starlette_app.state.health_payload_builder = None


class RuntimeBundleModule(Protocol):
    def build_hydration_bundle(
        self,
        *,
        config_dir: Path,
        version: str,
    ) -> HydrationBundle:
        raise NotImplementedError


def _build_hydration_bundle(config_dir: Path) -> HydrationBundle:
    module = cast(
        RuntimeBundleModule,
        cast(object, importlib.import_module(_RUNTIME_BUNDLE_MODULE)),
    )
    return module.build_hydration_bundle(
        config_dir=config_dir,
        version=SERVER_VERSION,
    )


def _remove_frontend_mount(starlette_app: Starlette) -> list[BaseRoute]:
    frontend_routes: list[BaseRoute] = []
    retained_routes: list[BaseRoute] = []
    for route in starlette_app.router.routes:
        if getattr(route, "name", None) == "frontend":
            frontend_routes.append(route)
        else:
            retained_routes.append(route)
    starlette_app.router.routes = retained_routes
    return frontend_routes


def _remove_runtime_shadow_bootstrap_routes(starlette_app: Starlette) -> None:
    retained_routes: list[BaseRoute] = []
    for route in starlette_app.router.routes:
        route_path = getattr(route, "path", "")
        if (
            isinstance(route_path, str)
            and route_path in _RUNTIME_SHADOW_BOOTSTRAP_PATHS
        ):
            continue
        retained_routes.append(route)
    starlette_app.router.routes = retained_routes


def _health_payload(starlette_app: Starlette) -> dict[str, object]:
    config_dir = getattr(starlette_app.state, "config_dir", get_app_config_dir())
    if bool(getattr(starlette_app.state, "hydrated", False)):
        health_payload_builder: HydratedHealthPayloadBuilder | None = getattr(
            starlette_app.state,
            "health_payload_builder",
            None,
        )
        payload = health_payload_builder() if health_payload_builder is not None else {}
        payload.update(_startup_payload(starlette_app))
        _apply_background_startup_status(payload)
        return payload
    package_root = Path(__file__).resolve().parents[2]
    builtin_root = package_root / "builtin"
    startup_phase = str(getattr(starlette_app.state, "startup_phase", "bootstrap"))
    payload: dict[str, object] = {
        "status": "failed" if startup_phase == "failed" else "starting",
        "version": SERVER_VERSION,
        "python_executable": str(Path(sys.executable).expanduser().resolve()),
        "package_root": str(package_root),
        "config_dir": str(config_dir),
        "builtin_roles_dir": str(builtin_root / "roles"),
        "builtin_skills_dir": str(builtin_root / "skills"),
    }
    payload.update(_startup_payload(starlette_app))
    return payload


def _apply_background_startup_status(payload: dict[str, object]) -> None:
    if payload.get("background_startup_failures"):
        payload["status"] = "failed"
    elif payload.get("background_startup_pending"):
        payload["status"] = "starting"


def _log_finished_hydration_task_error(task: asyncio.Task[None]) -> None:
    try:
        exception = task.exception()
    except asyncio.CancelledError:
        return
    if exception is None:
        return
    _log_event(
        logging.ERROR,
        event="app.hydration.shutdown_error",
        message="Runtime hydration task failed before shutdown cleanup",
        exc_info=exception,
    )


def _startup_payload(starlette_app: Starlette) -> dict[str, object]:
    components = dict(getattr(starlette_app.state, "components", {"core": "ready"}))
    background_startup_failures = _background_startup_failures(starlette_app)
    background_startup_pending = _background_startup_pending(starlette_app)
    if background_startup_failures:
        components["background_services"] = "failed"
    elif background_startup_pending:
        components["background_services"] = "loading"
    return {
        "startup_phase": getattr(starlette_app.state, "startup_phase", "bootstrap"),
        "hydrated": bool(getattr(starlette_app.state, "hydrated", False)),
        "components": components,
        "background_startup_pending": background_startup_pending,
        "background_startup_failures": background_startup_failures,
        "error": getattr(starlette_app.state, "hydration_error", None),
    }


def _background_startup_failures(starlette_app: Starlette) -> dict[str, str]:
    container: object | None = getattr(starlette_app.state, "container", None)
    failures: object = getattr(
        container,
        "runtime_background_startup_failures",
        {},
    )
    if not isinstance(failures, dict):
        return {}
    normalized: dict[str, str] = {}
    for service_name, failure in failures.items():
        if isinstance(service_name, str) and isinstance(failure, str):
            normalized[service_name] = failure
    return normalized


def _background_startup_pending(starlette_app: Starlette) -> bool:
    container: object | None = getattr(starlette_app.state, "container", None)
    return bool(getattr(container, "runtime_background_startup_pending", False))


def _component_for_path(path: str) -> str:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "api":
        return parts[1]
    return "runtime"


async def _wait_for_hydration(
    starlette_app: Starlette, *, timeout_seconds: float
) -> None:
    if timeout_seconds <= 0:
        return
    task = getattr(starlette_app.state, "hydration_task", None)
    if not isinstance(task, asyncio.Task):
        return
    try:
        await asyncio.wait_for(
            asyncio.shield(task),
            timeout=timeout_seconds,
        )
    except TimeoutError:
        return


def _sync_plain_app_env_to_process_env(env_file_path: Path) -> None:
    expanded_env_file = env_file_path.expanduser()
    if not expanded_env_file.exists() or not expanded_env_file.is_file():
        return
    for raw_line in expanded_env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        normalized_key = key.strip()
        if not normalized_key:
            continue
        os.environ[normalized_key] = _strip_env_value(value.strip())


def _strip_env_value(value: str) -> str:
    if value.startswith('"') and value.endswith('"') and len(value) >= 2:
        return value[1:-1]
    if value.startswith("'") and value.endswith("'") and len(value) >= 2:
        return value[1:-1]
    return value


def _env_int(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _request_config_dir(request: Request) -> Path:
    config_dir = getattr(request.app.state, "config_dir", None)
    if isinstance(config_dir, Path):
        return config_dir
    return get_app_config_dir()


def _read_bootstrap_ui_language(config_dir: Path) -> dict[str, str]:
    config_file = config_dir / "ui.json"
    if not config_file.exists():
        return {"language": "zh-CN"}
    try:
        raw = json.loads(config_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {"language": "zh-CN"}
    if not isinstance(raw, dict):
        return {"language": "zh-CN"}
    language = raw.get("language")
    if language in {"en-US", "zh-CN"}:
        return {"language": str(language)}
    return {"language": "zh-CN"}


def _read_bootstrap_orchestration_config(config_dir: Path) -> dict[str, object]:
    config_file = config_dir / "orchestration.json"
    if not config_file.exists():
        return {"default_orchestration_preset_id": "", "presets": []}
    try:
        raw = json.loads(config_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {"default_orchestration_preset_id": "", "presets": []}
    if not isinstance(raw, dict):
        return {"default_orchestration_preset_id": "", "presets": []}
    default_id = raw.get("default_orchestration_preset_id")
    presets = raw.get("presets")
    return {
        "default_orchestration_preset_id": default_id
        if isinstance(default_id, str)
        else "",
        "presets": presets if isinstance(presets, list) else [],
    }


def _read_bootstrap_role_options() -> dict[str, object]:
    entries = _read_bootstrap_role_entries()
    role_options = [role for _mode, role in entries]
    coordinator_role = _find_bootstrap_role(role_options, "Coordinator")
    main_agent_role = _find_bootstrap_role(role_options, "MainAgent")
    normal_mode_roles = [role for mode, role in entries if mode == "primary"]
    subagent_roles = [role for mode, role in entries if mode == "subagent"]
    return {
        "coordinator_role_id": str(coordinator_role.get("role_id", "Coordinator")),
        "main_agent_role_id": str(main_agent_role.get("role_id", "MainAgent")),
        "coordinator_role": coordinator_role,
        "main_agent_role": main_agent_role,
        "normal_mode_roles": normal_mode_roles,
        "subagent_roles": subagent_roles,
        "role_modes": ["primary", "subagent", "all"],
        "tool_groups": [],
        "tools": [],
        "mcp_servers": [],
        "skills": [],
        "agents": [],
        "execution_surfaces": ["api", "browser", "desktop", "hybrid"],
    }


def _read_bootstrap_role_entries() -> list[tuple[str, dict[str, object]]]:
    roles_dir = Path(__file__).resolve().parents[2] / "builtin" / "roles"
    rows: list[tuple[str, dict[str, object]]] = []
    for manifest in sorted(roles_dir.glob("*.md")):
        metadata = _read_bootstrap_role_metadata(manifest)
        if metadata is None:
            continue
        mode = str(metadata.get("mode", "primary") or "primary")
        rows.append((mode, _bootstrap_role_option(metadata)))
    return rows


def _read_bootstrap_role_metadata(path: Path) -> dict[str, object] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    frontmatter = _split_bootstrap_frontmatter(text)
    if frontmatter is None:
        return None
    parsed: dict[str, object] = {}
    for line in frontmatter.splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            continue
        normalized_key = key.strip()
        normalized_value = value.strip().strip("\"'")
        if normalized_key:
            parsed[normalized_key] = normalized_value
    role_id = parsed.get("role_id")
    name = parsed.get("name")
    description = parsed.get("description")
    required_values = (role_id, name, description)
    if not all(isinstance(value, str) and value.strip() for value in required_values):
        return None
    return parsed


def _split_bootstrap_frontmatter(text: str) -> str | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[1:index])
    return None


def _bootstrap_role_option(metadata: dict[str, object]) -> dict[str, object]:
    return {
        "role_id": str(metadata.get("role_id", "")),
        "name": str(metadata.get("name", "")),
        "description": str(metadata.get("description", "")),
        "model_profile": str(metadata.get("model_profile", "default") or "default"),
        "model_name": "",
        "capabilities": {
            "input": {
                "text": True,
                "image": False,
                "audio": False,
                "video": None,
                "pdf": None,
            },
            "output": {
                "text": True,
                "image": None,
                "audio": False,
                "video": None,
                "pdf": None,
            },
        },
        "input_modalities": [],
    }


def _find_bootstrap_role(
    role_options: list[dict[str, object]], role_id: str
) -> dict[str, object]:
    for role in role_options:
        if role.get("role_id") == role_id:
            return role
    return _bootstrap_role_option(
        {
            "role_id": role_id,
            "name": role_id,
            "description": f"{role_id} role is still loading.",
            "model_profile": "default",
            "mode": "primary",
        }
    )


async def _count_frontend_log_events(request: Request) -> int:
    try:
        payload = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError, RuntimeError):
        return 0
    if not isinstance(payload, dict):
        return 0
    events = payload.get("events")
    if not isinstance(events, list):
        return 0
    return min(len(events), 200)


def _generate_request_id() -> str:
    return uuid.uuid4().hex


def _log_event(
    level: int,
    *,
    event: str,
    message: str,
    payload: dict[str, object] | None = None,
    duration_ms: int | None = None,
    exc_info: BaseException | None = None,
) -> None:
    extra_parts: list[str] = [f"event={event}"]
    if duration_ms is not None:
        extra_parts.append(f"duration_ms={duration_ms}")
    if payload:
        extra_parts.append(f"payload={payload}")
    logger.log(
        level,
        "%s | %s",
        message,
        " ".join(extra_parts),
        exc_info=exc_info,
    )


def log_event(
    logger_to_use: logging.Logger,
    level: int,
    *,
    event: str,
    message: str,
    payload: dict[str, object] | None = None,
    duration_ms: int | None = None,
    exc_info: BaseException | None = None,
) -> None:
    _ = logger_to_use
    _log_event(
        level,
        event=event,
        message=message,
        payload=payload,
        duration_ms=duration_ms,
        exc_info=exc_info,
    )


def _shutdown_logging_if_configured() -> None:
    shutdown_logging()


def _resolve_request_log_level(*, path: str, status_code: int) -> int | None:
    if status_code >= 500:
        return logging.ERROR
    if _is_suppressed_noisy_path(path):
        return None
    if status_code >= 400:
        return logging.WARNING
    if _is_suppressed_success_path(path):
        return None
    return logging.DEBUG


def _is_suppressed_success_path(path: str) -> bool:
    return any(pattern.match(path) is not None for pattern in _SUPPRESSED_SUCCESS_PATHS)


def _is_suppressed_noisy_path(path: str) -> bool:
    return any(pattern.match(path) is not None for pattern in _SUPPRESSED_NOISY_PATHS)


def _should_ignore_asyncio_exception(context: AsyncioExceptionContext) -> bool:
    if sys.platform != "win32":
        return False
    exception = context.get("exception")
    message = context.get("message")
    if not isinstance(exception, ConnectionResetError):
        return False
    if not isinstance(message, str):
        return False
    return (
        "_ProactorBasePipeTransport._call_connection_lost" in message
        and "WinError 10054" in str(exception)
    )


def _configure_asyncio_exception_handler() -> None:
    if sys.platform != "win32":
        return
    loop = asyncio.get_running_loop()
    previous_handler = loop.get_exception_handler()

    def _handler(
        current_loop: asyncio.AbstractEventLoop,
        context: AsyncioExceptionContext,
    ) -> None:
        if _should_ignore_asyncio_exception(context):
            return
        if previous_handler is not None:
            previous_handler(current_loop, context)
            return
        current_loop.default_exception_handler(context)

    loop.set_exception_handler(_handler)


def _register_signal_handlers() -> None:
    registered_signals = (signal.SIGTERM, signal.SIGINT)
    previous_handlers: dict[int, SignalHandlerRef] = {
        sig: signal.getsignal(sig) for sig in registered_signals
    }

    def _forward_to_previous_handler(
        sig: int,
        frame: FrameType | None,
        previous_handler: SignalHandlerRef,
    ) -> None:
        if previous_handler is None or previous_handler == signal.SIG_IGN:
            return
        if callable(previous_handler):
            previous_handler(sig, frame)
            return
        if previous_handler == signal.SIG_DFL:
            if sig == signal.SIGINT:
                raise KeyboardInterrupt
            raise SystemExit(128 + sig)

    def _on_signal(sig: int, frame: FrameType | None) -> None:
        signame = signal.Signals(sig).name
        log_event(
            logger,
            logging.WARNING,
            event="process.signal.received",
            message="Shutdown signal received",
            payload={"signal": signame},
        )
        previous_handler = previous_handlers.get(sig)
        _forward_to_previous_handler(sig, frame, previous_handler)

    for sig in registered_signals:
        _ = signal.signal(sig, _on_signal)


if FRONTEND_DIST_DIR.exists():
    app.mount(
        "/",
        FrontendStaticFiles(directory=str(FRONTEND_DIST_DIR), html=True),
        name="frontend",
    )
else:

    def missing_frontend(request: Request) -> JSONResponse:
        _ = request
        return JSONResponse(
            {
                "status": "frontend_not_built",
                "detail": f"Frontend assets not found at {FRONTEND_DIST_DIR}",
            },
            status_code=503,
        )

    app.add_route("/", missing_frontend, methods=["GET"])
