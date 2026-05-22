# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import builtins
import json
import logging
import signal
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import FrameType
from types import ModuleType
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from relay_teams.interfaces.server import app as server_app
from relay_teams.trace import get_trace_context


class _FakeRequest:
    def __init__(
        self,
        *,
        config_dir: Path | None = None,
        json_payload: object | None = None,
    ) -> None:
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                config_dir=config_dir,
                started_at=100.0,
                startup_phase="bootstrap",
                hydrated=False,
                components={"core": "ready", "runtime": "loading"},
                hydration_error=None,
            )
        )
        self._json_payload = json_payload

    async def json(self) -> object:
        if isinstance(self._json_payload, BaseException):
            raise self._json_payload
        return self._json_payload


def test_register_signal_handlers_logs_and_chains_previous_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assigned_handlers: dict[int, server_app.SignalHandler] = {}
    previous_called_with: list[int] = []
    logged_signals: list[str] = []

    def previous_handler(sig: int, _frame: FrameType | None) -> None:
        previous_called_with.append(sig)

    def fake_getsignal(_sig: int) -> server_app.SignalHandler:
        return previous_handler

    def fake_signal(
        sig: int, handler: server_app.SignalHandler
    ) -> server_app.SignalHandler:
        assigned_handlers[sig] = handler
        return previous_handler

    def fake_log_event(*_args: object, **kwargs: object) -> None:
        payload = kwargs.get("payload")
        if isinstance(payload, dict):
            signal_name = payload.get("signal")
            if isinstance(signal_name, str):
                logged_signals.append(signal_name)

    monkeypatch.setattr(server_app.signal, "getsignal", fake_getsignal)
    monkeypatch.setattr(server_app.signal, "signal", fake_signal)
    monkeypatch.setattr(server_app, "log_event", fake_log_event)

    server_app._register_signal_handlers()

    assigned_handlers[signal.SIGINT](signal.SIGINT, None)

    assert previous_called_with == [signal.SIGINT]
    assert logged_signals == ["SIGINT"]


def test_register_signal_handlers_raises_keyboard_interrupt_on_default_sigint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assigned_handlers: dict[int, server_app.SignalHandler] = {}

    def fake_getsignal(_sig: int) -> int:
        return signal.SIG_DFL

    def fake_signal(sig: int, handler: server_app.SignalHandler) -> int:
        assigned_handlers[sig] = handler
        return signal.SIG_DFL

    def fake_log_event(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(server_app.signal, "getsignal", fake_getsignal)
    monkeypatch.setattr(server_app.signal, "signal", fake_signal)
    monkeypatch.setattr(server_app, "log_event", fake_log_event)

    server_app._register_signal_handlers()

    with pytest.raises(KeyboardInterrupt):
        assigned_handlers[signal.SIGINT](signal.SIGINT, None)


def test_resolve_request_log_level_suppresses_noisy_success_paths() -> None:
    assert (
        server_app._resolve_request_log_level(
            path="/api/system/health",
            status_code=200,
        )
        is None
    )
    assert (
        server_app._resolve_request_log_level(
            path="/api/sessions/session-1/recovery",
            status_code=200,
        )
        is None
    )
    assert (
        server_app._resolve_request_log_level(
            path="/api/sessions/session-1/runs/run-1/token-usage",
            status_code=200,
        )
        is None
    )
    assert (
        server_app._resolve_request_log_level(
            path="/.well-known/appspecific/com.chrome.devtools.json",
            status_code=404,
        )
        is None
    )


def test_resolve_request_log_level_downgrades_success_and_escalates_failures() -> None:
    assert (
        server_app._resolve_request_log_level(
            path="/api/runs",
            status_code=200,
        )
        == logging.DEBUG
    )
    assert (
        server_app._resolve_request_log_level(
            path="/api/runs",
            status_code=404,
        )
        == logging.WARNING
    )
    assert (
        server_app._resolve_request_log_level(
            path="/api/runs",
            status_code=500,
        )
        == logging.ERROR
    )


def test_should_ignore_asyncio_exception_for_windows_proactor_disconnect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(server_app.sys, "platform", "win32")

    assert (
        server_app._should_ignore_asyncio_exception(
            {
                "message": (
                    "Exception in callback "
                    "_ProactorBasePipeTransport._call_connection_lost()"
                ),
                "exception": ConnectionResetError(
                    "[WinError 10054] remote host forcibly closed the connection"
                ),
            }
        )
        is True
    )


def test_should_not_ignore_asyncio_exception_for_non_matching_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(server_app.sys, "platform", "win32")

    assert (
        server_app._should_ignore_asyncio_exception(
            {
                "message": "Exception in callback something_else()",
                "exception": ConnectionResetError(
                    "[WinError 10054] remote host forcibly closed the connection"
                ),
            }
        )
        is False
    )


def test_configure_asyncio_exception_handler_ignores_only_benign_windows_disconnects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(server_app.sys, "platform", "win32")

    delegated_contexts: list[server_app.AsyncioExceptionContext] = []

    def previous_handler(
        _loop: asyncio.AbstractEventLoop,
        context: server_app.AsyncioExceptionContext,
    ) -> None:
        delegated_contexts.append(context)

    class FakeLoop:
        def __init__(self) -> None:
            self.handler: server_app.AsyncioExceptionHandler | None = None

        def get_exception_handler(
            self,
        ) -> server_app.AsyncioExceptionHandler | None:
            return previous_handler

        def set_exception_handler(
            self, handler: server_app.AsyncioExceptionHandler | None
        ) -> None:
            self.handler = handler

        def default_exception_handler(
            self, _context: server_app.AsyncioExceptionContext
        ) -> None:
            raise AssertionError("default handler should not be called")

    loop = FakeLoop()
    monkeypatch.setattr(
        server_app.asyncio,
        "get_running_loop",
        lambda: cast(asyncio.AbstractEventLoop, loop),
    )

    server_app._configure_asyncio_exception_handler()

    assert loop.handler is not None
    current_loop = cast(asyncio.AbstractEventLoop, loop)

    ignored_context: server_app.AsyncioExceptionContext = {
        "message": (
            "Exception in callback _ProactorBasePipeTransport._call_connection_lost()"
        ),
        "exception": ConnectionResetError(
            "[WinError 10054] remote host forcibly closed the connection"
        ),
    }
    loop.handler(current_loop, ignored_context)
    assert delegated_contexts == []

    forwarded_context: server_app.AsyncioExceptionContext = {
        "message": "Exception in callback another_callback()",
        "exception": RuntimeError("boom"),
    }
    loop.handler(current_loop, forwarded_context)
    assert delegated_contexts == [forwarded_context]


def test_bootstrap_live_endpoint_is_available_before_hydration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(server_app.time, "time", lambda: 105.5)

    response = asyncio.run(
        server_app.bootstrap_live(cast(server_app.Request, _FakeRequest()))
    )

    assert response.status_code == 200
    assert b'"status":"alive"' in response.body
    assert b'"uptime_seconds":5.5' in response.body


def test_bootstrap_health_reports_starting_before_hydration() -> None:
    response = asyncio.run(
        server_app.bootstrap_health(cast(server_app.Request, _FakeRequest()))
    )

    payload = json.loads(bytes(response.body).decode("utf-8"))
    assert response.status_code == 200
    assert payload["status"] == "starting"
    assert payload["hydrated"] is False


def test_bootstrap_health_reports_failed_after_hydration_error() -> None:
    request = _FakeRequest()
    request.app.state.startup_phase = "failed"
    request.app.state.hydration_error = "boom"

    response = asyncio.run(
        server_app.bootstrap_health(cast(server_app.Request, request))
    )

    payload = json.loads(bytes(response.body).decode("utf-8"))
    assert response.status_code == 200
    assert payload["status"] == "failed"
    assert payload["error"] == "boom"


def test_bootstrap_control_plane_endpoint_is_available_before_hydration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_URL", "http://127.0.0.1:8001/live")
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_HOST", "127.0.0.1")
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_PORT", "8001")
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_MAIN_URL", "http://127.0.0.1:8000")

    response = asyncio.run(
        server_app.bootstrap_control_plane(cast(server_app.Request, _FakeRequest()))
    )

    assert response.status_code == 200
    assert b'"enabled":true' in response.body
    assert b'"port":8001' in response.body


def test_bootstrap_control_plane_tolerates_invalid_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_URL", "http://127.0.0.1:bad/live")
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_HOST", "127.0.0.1")
    monkeypatch.setenv("RELAY_TEAMS_CONTROL_PLANE_PORT", "bad")
    monkeypatch.delenv("RELAY_TEAMS_CONTROL_PLANE_MAIN_URL", raising=False)

    response = asyncio.run(
        server_app.bootstrap_control_plane(cast(server_app.Request, _FakeRequest()))
    )

    assert response.status_code == 200
    assert b'"enabled":false' in response.body
    assert b'"port":null' in response.body


def test_bootstrap_ui_language_returns_default_before_hydration() -> None:
    response = asyncio.run(
        server_app.bootstrap_ui_language(cast(server_app.Request, _FakeRequest()))
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body).decode("utf-8")) == {"language": "zh-CN"}


def test_bootstrap_ui_language_reads_config_before_hydration(tmp_path: Path) -> None:
    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    (config_dir / "ui.json").write_text('{"language":"en-US"}', encoding="utf-8")

    response = asyncio.run(
        server_app.bootstrap_ui_language(
            cast(server_app.Request, _FakeRequest(config_dir=config_dir))
        )
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body).decode("utf-8")) == {"language": "en-US"}


def test_bootstrap_ui_language_saves_config_before_hydration(tmp_path: Path) -> None:
    config_dir = tmp_path / ".relay-teams"

    response = asyncio.run(
        server_app.bootstrap_save_ui_language(
            cast(
                server_app.Request,
                _FakeRequest(
                    config_dir=config_dir,
                    json_payload={"language": "en-US"},
                ),
            )
        )
    )

    assert response.status_code == 200
    assert json.loads((config_dir / "ui.json").read_text(encoding="utf-8")) == {
        "language": "en-US"
    }


def test_bootstrap_ui_language_rejects_invalid_save_payload(tmp_path: Path) -> None:
    response = asyncio.run(
        server_app.bootstrap_save_ui_language(
            cast(
                server_app.Request,
                _FakeRequest(
                    config_dir=tmp_path,
                    json_payload={"language": "fr-FR"},
                ),
            )
        )
    )

    assert response.status_code == 422
    assert not (tmp_path / "ui.json").exists()


def test_bootstrap_ui_language_rejects_malformed_json(tmp_path: Path) -> None:
    response = asyncio.run(
        server_app.bootstrap_save_ui_language(
            cast(
                server_app.Request,
                _FakeRequest(
                    config_dir=tmp_path,
                    json_payload=ValueError("malformed json"),
                ),
            )
        )
    )

    assert response.status_code == 422
    assert not (tmp_path / "ui.json").exists()


def test_bootstrap_ui_language_rejects_unknown_fields(tmp_path: Path) -> None:
    response = asyncio.run(
        server_app.bootstrap_save_ui_language(
            cast(
                server_app.Request,
                _FakeRequest(
                    config_dir=tmp_path,
                    json_payload={"language": "en-US", "extra": True},
                ),
            )
        )
    )

    assert response.status_code == 422
    assert not (tmp_path / "ui.json").exists()


def test_bootstrap_orchestration_config_returns_default_before_hydration(
    tmp_path: Path,
) -> None:
    response = asyncio.run(
        server_app.bootstrap_orchestration_config(
            cast(server_app.Request, _FakeRequest(config_dir=tmp_path))
        )
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body).decode("utf-8")) == {
        "default_orchestration_preset_id": "",
        "presets": [],
    }


def test_bootstrap_orchestration_config_reads_config_before_hydration(
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    (config_dir / "orchestration.json").write_text(
        '{"default_orchestration_preset_id":"default","presets":[{"preset_id":"default"}]}',
        encoding="utf-8",
    )

    response = asyncio.run(
        server_app.bootstrap_orchestration_config(
            cast(server_app.Request, _FakeRequest(config_dir=config_dir))
        )
    )

    assert response.status_code == 200
    payload = json.loads(bytes(response.body).decode("utf-8"))
    assert payload["default_orchestration_preset_id"] == "default"
    assert payload["presets"] == [{"preset_id": "default"}]


def test_bootstrap_frontend_logs_accepts_startup_batches() -> None:
    response = asyncio.run(
        server_app.bootstrap_frontend_logs(
            cast(
                server_app.Request,
                _FakeRequest(json_payload={"events": [{"event": "frontend.ready"}]}),
            )
        )
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body).decode("utf-8")) == {"accepted": 1}


def test_bootstrap_frontend_logs_tolerates_bad_payload() -> None:
    response = asyncio.run(
        server_app.bootstrap_frontend_logs(
            cast(server_app.Request, _FakeRequest(json_payload=[]))
        )
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body).decode("utf-8")) == {"accepted": 0}


def test_bootstrap_role_options_returns_builtin_roles_before_hydration() -> None:
    response = asyncio.run(
        server_app.bootstrap_role_options(cast(server_app.Request, _FakeRequest()))
    )

    assert response.status_code == 200
    payload = json.loads(bytes(response.body).decode("utf-8"))
    assert payload["coordinator_role_id"] == "Coordinator"
    assert payload["main_agent_role_id"] == "MainAgent"
    assert payload["main_agent_role"]["role_id"] == "MainAgent"
    assert payload["normal_mode_roles"]
    assert payload["subagent_roles"]


def test_bootstrap_api_paths_include_status_probes() -> None:
    assert "/api/system/health" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/system/live" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/system/control-plane" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/system/startup" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/system/configs/ui-language" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/system/configs/orchestration" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/logs/frontend" in server_app._BOOTSTRAP_API_PATHS
    assert "/api/roles:options" in server_app._BOOTSTRAP_API_PATHS


def test_hydration_gate_returns_initializing_without_waiting_for_heavy_api() -> None:
    app = SimpleNamespace(
        state=SimpleNamespace(
            hydrated=False,
            hydration_task=None,
            startup_phase="hydrating",
            components={"core": "ready", "runtime": "loading"},
        )
    )
    request = SimpleNamespace(
        app=app,
        method="GET",
        url=SimpleNamespace(path="/api/runs"),
    )

    async def fail_call_next(_request: server_app.Request) -> server_app.Response:
        raise AssertionError("heavy API should not run before hydration")

    response = asyncio.run(
        server_app.hydration_gate_middleware(
            cast(server_app.Request, request),
            fail_call_next,
        )
    )

    assert response.status_code == 503
    payload = json.loads(bytes(response.body).decode("utf-8"))
    assert payload["detail"] == server_app.SERVICE_INITIALIZING


def test_hydration_gate_allows_read_after_waiting_for_hydration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/api/sessions"),
        app=SimpleNamespace(state=SimpleNamespace(hydrated=False)),
    )

    async def fake_wait_for_hydration(
        starlette_app: server_app.Starlette, *, timeout_seconds: float
    ) -> None:
        _ = timeout_seconds
        starlette_app.state.hydrated = True

    async def call_next(_request: server_app.Request) -> server_app.Response:
        return server_app.Response(status_code=204)

    monkeypatch.setattr(server_app, "_wait_for_hydration", fake_wait_for_hydration)

    response = asyncio.run(
        server_app.hydration_gate_middleware(
            cast(server_app.Request, request),
            call_next,
        )
    )

    assert response.status_code == 204


def test_hydration_gate_waits_for_mutations_before_initializing_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SimpleNamespace(
        method="POST",
        url=SimpleNamespace(path="/api/sessions"),
        app=SimpleNamespace(
            state=SimpleNamespace(
                hydrated=False,
                startup_phase="hydrating",
                components={"core": "ready", "runtime": "loading"},
                hydration_error=None,
            )
        ),
    )
    waits: list[float] = []

    async def fake_wait_for_hydration(
        _app: server_app.Starlette, *, timeout_seconds: float
    ) -> None:
        waits.append(timeout_seconds)

    async def call_next(_request: server_app.Request) -> server_app.Response:
        raise AssertionError("still hydrating")

    monkeypatch.setattr(server_app, "_wait_for_hydration", fake_wait_for_hydration)

    response = asyncio.run(
        server_app.hydration_gate_middleware(
            cast(server_app.Request, request),
            call_next,
        )
    )

    assert response.status_code == 503
    assert waits == [server_app.HYDRATION_MUTATION_WAIT_SECONDS]


def test_public_host_guard_blocks_disallowed_public_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/api/sessions", hostname="example.test"),
    )
    logged: list[str] = []

    async def call_next(_request: server_app.Request) -> server_app.Response:
        raise AssertionError("blocked requests should not continue")

    monkeypatch.setattr(server_app, "is_public_access_guard_enabled", lambda: True)
    monkeypatch.setattr(server_app, "request_uses_public_host", lambda _request: True)
    monkeypatch.setattr(
        server_app, "is_public_host_allowed_request", lambda _request: False
    )
    monkeypatch.setattr(server_app, "public_access_denied_detail", lambda: "blocked")
    monkeypatch.setattr(
        server_app,
        "_log_event",
        lambda *_args, **kwargs: logged.append(str(kwargs.get("event"))),
    )

    response = asyncio.run(
        server_app.public_host_guard_middleware(
            cast(server_app.Request, request),
            call_next,
        )
    )

    assert response.status_code == 403
    assert logged == ["http.request.public_host_blocked"]


def test_tracing_middleware_binds_request_context() -> None:
    request = SimpleNamespace(
        headers={"X-Request-Id": "req-1", "X-Trace-Id": "trace-1"},
        method="GET",
        url=SimpleNamespace(path="/api/runs"),
    )
    seen_context: list[tuple[str | None, str | None]] = []

    async def call_next(_request: server_app.Request) -> server_app.Response:
        context = get_trace_context()
        seen_context.append((context.request_id, context.trace_id))
        return server_app.Response()

    response = asyncio.run(
        server_app.tracing_middleware(
            cast(server_app.Request, request),
            call_next,
        )
    )

    assert response.headers["X-Request-Id"] == "req-1"
    assert response.headers["X-Trace-Id"] == "trace-1"
    assert seen_context == [("req-1", "trace-1")]


def test_exception_handlers_log_and_return_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SimpleNamespace(method="POST", url=SimpleNamespace(path="/api/runs"))
    logged: list[str] = []
    monkeypatch.setattr(
        server_app,
        "_log_event",
        lambda *_args, **kwargs: logged.append(str(kwargs.get("event"))),
    )

    rejected = asyncio.run(
        server_app.route_work_rejected_handler(
            cast(server_app.Request, request),
            RuntimeError("shed"),
        )
    )
    failed = asyncio.run(
        server_app.global_exception_handler(
            cast(server_app.Request, request),
            RuntimeError("boom"),
        )
    )

    assert rejected.status_code == 503
    assert failed.status_code == 500
    assert logged == ["http.request.shed", "http.request.failed"]


def test_finished_hydration_task_error_is_logged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logged: list[tuple[str, BaseException | None]] = []

    async def fail() -> None:
        raise RuntimeError("hydration failed")

    async def run_case() -> None:
        task = asyncio.create_task(fail())
        await asyncio.sleep(0)
        server_app._log_finished_hydration_task_error(task)

    def fake_log_event(*_args: object, **kwargs: object) -> None:
        event = kwargs.get("event")
        exc_info = kwargs.get("exc_info")
        logged.append(
            (str(event), exc_info if isinstance(exc_info, BaseException) else None)
        )

    monkeypatch.setattr(server_app, "_log_event", fake_log_event)

    asyncio.run(run_case())

    assert len(logged) == 1
    assert logged[0][0] == "app.hydration.shutdown_error"
    assert isinstance(logged[0][1], RuntimeError)
    assert str(logged[0][1]) == "hydration failed"


async def _dummy_route(_request: server_app.Request) -> server_app.Response:
    return server_app.Response()


def test_runtime_shadow_bootstrap_routes_are_removed_after_hydration() -> None:
    app = server_app.Starlette()
    app.add_route(
        "/api/system/configs/orchestration",
        _dummy_route,
        methods=["GET"],
    )
    app.add_route("/api/roles:options", _dummy_route, methods=["GET"])
    app.add_route("/api/logs/frontend", _dummy_route, methods=["POST"])
    app.add_route("/api/system/health", _dummy_route, methods=["GET"])
    app.mount("/api", server_app.Starlette(), name="api")

    server_app._remove_runtime_shadow_bootstrap_routes(app)

    route_paths = [
        route_path
        for route in app.router.routes
        if isinstance((route_path := getattr(route, "path", "")), str)
    ]
    assert "/api/system/configs/orchestration" not in route_paths
    assert "/api/roles:options" not in route_paths
    assert "/api/logs/frontend" not in route_paths
    assert "/api/system/health" in route_paths
    assert "/api" in route_paths


def test_remove_frontend_mount_returns_frontend_routes_only() -> None:
    app = server_app.Starlette()
    app.mount("/", server_app.Starlette(), name="frontend")
    app.add_route("/api/system/health", _dummy_route, methods=["GET"])

    frontend_routes = server_app._remove_frontend_mount(app)

    assert [getattr(route, "name", "") for route in frontend_routes] == ["frontend"]
    assert [getattr(route, "path", "") for route in app.router.routes] == [
        "/api/system/health"
    ]


def test_hydrate_runtime_mounts_api_and_frontend_after_start(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeContainer:
        def __init__(self) -> None:
            self.started = False

        async def start(self) -> None:
            self.started = True

        async def stop(self) -> None:
            return None

    logged: list[str] = []
    app = server_app.Starlette()
    app.state.components = {"core": "ready", "runtime": "loading"}
    app.mount("/", server_app.Starlette(), name="frontend")
    api_app = server_app.Starlette()
    container = FakeContainer()

    monkeypatch.setattr(server_app.asyncio, "sleep", lambda _seconds: _completed_none())
    monkeypatch.setattr(
        server_app,
        "_build_hydration_bundle",
        lambda _config_dir: server_app.HydrationBundle(
            container=cast(server_app.RuntimeContainer, container),
            api_app=api_app,
        ),
    )
    monkeypatch.setattr(
        server_app,
        "_log_event",
        lambda *_args, **kwargs: logged.append(str(kwargs.get("event"))),
    )

    asyncio.run(server_app._hydrate_runtime(app, tmp_path))

    assert container.started is True
    assert app.state.hydrated is True
    assert app.state.startup_phase == "ready"
    assert api_app.state.hydrated is True
    assert "app.hydration.ready" in logged


def test_hydrate_runtime_records_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    logged: list[str] = []
    app = server_app.Starlette()
    app.state.components = {"core": "ready", "runtime": "loading"}
    monkeypatch.setattr(server_app.asyncio, "sleep", lambda _seconds: _completed_none())
    monkeypatch.setattr(
        server_app,
        "_build_hydration_bundle",
        lambda _config_dir: (_ for _ in ()).throw(RuntimeError("broken")),
    )
    monkeypatch.setattr(
        server_app,
        "_log_event",
        lambda *_args, **kwargs: logged.append(str(kwargs.get("event"))),
    )

    asyncio.run(server_app._hydrate_runtime(app, tmp_path))

    assert app.state.startup_phase == "failed"
    assert app.state.hydration_error == "broken"
    assert app.state.components == {"core": "ready", "runtime": "failed"}
    assert logged == ["app.hydration.failed"]


async def _completed_none() -> None:
    return None


def test_hydration_bundle_stores_runtime_parts() -> None:
    container = SimpleNamespace()
    api_app = server_app.Starlette()

    bundle = server_app.HydrationBundle(
        container=cast(server_app.RuntimeContainer, container),
        api_app=api_app,
    )

    assert bundle.container is container
    assert bundle.api_app is api_app


def test_build_hydration_bundle_wires_runtime_app_with_fake_modules(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeServerContainer:
        def __init__(self, *, config_dir: Path) -> None:
            self.config_dir = config_dir

        async def start(self) -> None:
            return None

        async def stop(self) -> None:
            return None

    fake_container_module = ModuleType("relay_teams.interfaces.server.container")
    setattr(fake_container_module, "ServerContainer", FakeServerContainer)
    monkeypatch.setitem(
        sys.modules,
        "relay_teams.interfaces.server.container",
        fake_container_module,
    )

    fake_logger_module = ModuleType("relay_teams.logger")
    setattr(fake_logger_module, "configure_logging", lambda *, config_dir: None)
    setattr(
        fake_logger_module,
        "get_logger",
        lambda _name, **_kwargs: logging.getLogger("fake-router"),
    )
    setattr(fake_logger_module, "log_event", lambda *_args, **_kwargs: None)
    monkeypatch.setitem(sys.modules, "relay_teams.logger", fake_logger_module)

    from relay_teams.interfaces.server import routers as routers_package

    router_names = (
        "a2a_internal",
        "artifacts_router",
        "audit",
        "auto_harness",
        "automation",
        "boards",
        "commands",
        "connectors",
        "feishu_gateway",
        "gateway",
        "guardrails_router",
        "logs",
        "mcp",
        "memories",
        "observability",
        "prompts",
        "roles",
        "runs",
        "session_media",
        "sessions",
        "speech",
        "system",
        "tasks",
        "triggers",
        "workspaces",
    )
    for name in router_names:
        monkeypatch.setattr(
            routers_package,
            name,
            SimpleNamespace(router=APIRouter()),
        )

    bundle = server_app._build_hydration_bundle(tmp_path)

    assert isinstance(bundle.api_app, FastAPI)
    assert bundle.api_app.state.config_dir == tmp_path
    assert bundle.api_app.state.container.config_dir == tmp_path
    assert bundle.api_app.state.components == {"core": "ready", "runtime": "loading"}

    @bundle.api_app.get("/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    response = TestClient(bundle.api_app).get("/probe")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_component_for_path_extracts_api_component() -> None:
    assert server_app._component_for_path("/api/memories/search") == "memories"
    assert server_app._component_for_path("/") == "runtime"


def test_sync_plain_app_env_to_process_env_reads_simple_env_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "PLAIN=value\n"
        'DOUBLE="quoted value"\n'
        "SINGLE='single value'\n"
        " =ignored\n"
        "# ignored\n"
        "bad-line\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("PLAIN", raising=False)
    monkeypatch.delenv("DOUBLE", raising=False)
    monkeypatch.delenv("SINGLE", raising=False)

    server_app._sync_plain_app_env_to_process_env(env_file)

    assert server_app.os.environ["PLAIN"] == "value"
    assert server_app.os.environ["DOUBLE"] == "quoted value"
    assert server_app.os.environ["SINGLE"] == "single value"


@pytest.mark.parametrize(
    ("raw", "expected"),
    (
        ('"value"', "value"),
        ("'value'", "value"),
        ("value", "value"),
    ),
)
def test_strip_env_value(raw: str, expected: str) -> None:
    assert server_app._strip_env_value(raw) == expected


def test_env_int_parses_missing_invalid_and_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RELAY_TEAMS_TEST_INT", raising=False)
    assert server_app._env_int("RELAY_TEAMS_TEST_INT") is None
    monkeypatch.setenv("RELAY_TEAMS_TEST_INT", "bad")
    assert server_app._env_int("RELAY_TEAMS_TEST_INT") is None
    monkeypatch.setenv("RELAY_TEAMS_TEST_INT", "42")
    assert server_app._env_int("RELAY_TEAMS_TEST_INT") == 42


def test_bootstrap_config_readers_tolerate_invalid_json(tmp_path: Path) -> None:
    (tmp_path / "ui.json").write_text("[", encoding="utf-8")
    (tmp_path / "orchestration.json").write_text("[]", encoding="utf-8")

    assert server_app._read_bootstrap_ui_language(tmp_path) == {"language": "zh-CN"}
    assert server_app._read_bootstrap_orchestration_config(tmp_path) == {
        "default_orchestration_preset_id": "",
        "presets": [],
    }


def test_bootstrap_role_metadata_parses_valid_frontmatter(tmp_path: Path) -> None:
    role_file = tmp_path / "role.md"
    role_file.write_text(
        "---\n"
        "role_id: Demo\n"
        "name: Demo Role\n"
        "description: Demo description\n"
        "model_profile: fast\n"
        "mode: subagent\n"
        "---\n"
        "body\n",
        encoding="utf-8",
    )

    metadata = server_app._read_bootstrap_role_metadata(role_file)

    assert metadata is not None
    assert metadata == {
        "role_id": "Demo",
        "name": "Demo Role",
        "description": "Demo description",
        "model_profile": "fast",
        "mode": "subagent",
    }
    assert server_app._bootstrap_role_option(metadata)["role_id"] == "Demo"


@pytest.mark.parametrize(
    "content",
    (
        "no frontmatter\n",
        "---\nrole_id: Missing\n---\n",
        "---\nrole_id Demo\nname: Demo\n---\n",
    ),
)
def test_bootstrap_role_metadata_rejects_invalid_manifests(
    tmp_path: Path,
    content: str,
) -> None:
    role_file = tmp_path / "role.md"
    role_file.write_text(content, encoding="utf-8")

    assert server_app._read_bootstrap_role_metadata(role_file) is None


def test_find_bootstrap_role_uses_fallback_when_missing() -> None:
    fallback = server_app._find_bootstrap_role([], "MissingRole")

    assert fallback["role_id"] == "MissingRole"
    assert fallback["name"] == "MissingRole"


def test_count_frontend_log_events_caps_large_batches() -> None:
    request = _FakeRequest(json_payload={"events": [object()] * 250})

    count = asyncio.run(
        server_app._count_frontend_log_events(cast(server_app.Request, request))
    )

    assert count == 200


def test_count_frontend_log_events_tolerates_decode_and_shape_errors() -> None:
    bad_json = _FakeRequest(json_payload=RuntimeError("bad body"))
    missing_events = _FakeRequest(json_payload={"events": "not-list"})

    assert (
        asyncio.run(
            server_app._count_frontend_log_events(cast(server_app.Request, bad_json))
        )
        == 0
    )
    assert (
        asyncio.run(
            server_app._count_frontend_log_events(
                cast(server_app.Request, missing_events)
            )
        )
        == 0
    )


def test_wait_for_hydration_handles_absent_completed_and_timed_out_tasks() -> None:
    async def run_case() -> None:
        app = server_app.Starlette()
        await server_app._wait_for_hydration(app, timeout_seconds=1.0)
        await server_app._wait_for_hydration(app, timeout_seconds=0)

        async def done() -> None:
            return None

        app.state.hydration_task = asyncio.create_task(done())
        await server_app._wait_for_hydration(app, timeout_seconds=1.0)

        async def slow() -> None:
            await asyncio.sleep(1)

        task = asyncio.create_task(slow())
        app.state.hydration_task = task
        await server_app._wait_for_hydration(app, timeout_seconds=0.001)
        task.cancel()

    asyncio.run(run_case())


def test_middleware_classes_delegate_to_shared_functions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = cast(
        server_app.Request,
        SimpleNamespace(app=server_app.Starlette(), method="GET", url="/"),
    )

    async def call_next(_request: server_app.Request) -> server_app.Response:
        return server_app.Response(status_code=204)

    async def fake_hydration(
        delegated_request: server_app.Request,
        delegated_call_next: server_app.RequestHandler,
    ) -> server_app.Response:
        assert delegated_request is request
        return await delegated_call_next(delegated_request)

    async def fake_public(
        delegated_request: server_app.Request,
        delegated_call_next: server_app.RequestHandler,
    ) -> server_app.Response:
        assert delegated_request is request
        return await delegated_call_next(delegated_request)

    async def fake_tracing(
        delegated_request: server_app.Request,
        delegated_call_next: server_app.RequestHandler,
    ) -> server_app.Response:
        assert delegated_request is request
        return await delegated_call_next(delegated_request)

    monkeypatch.setattr(server_app, "hydration_gate_middleware", fake_hydration)
    monkeypatch.setattr(server_app, "public_host_guard_middleware", fake_public)
    monkeypatch.setattr(server_app, "tracing_middleware", fake_tracing)

    assert (
        asyncio.run(
            server_app.HydrationGateMiddleware(server_app.Starlette()).dispatch(
                request, call_next
            )
        ).status_code
        == 204
    )
    assert (
        asyncio.run(
            server_app.PublicHostGuardMiddleware(server_app.Starlette()).dispatch(
                request, call_next
            )
        ).status_code
        == 204
    )
    assert (
        asyncio.run(
            server_app.TracingMiddleware(server_app.Starlette()).dispatch(
                request, call_next
            )
        ).status_code
        == 204
    )


def test_health_payload_uses_runtime_identity_after_hydration(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeHealthPayload:
        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return {"status": "ok", "config_dir": "runtime"}

    class FakeContainer:
        role_registry = object()
        skill_registry = object()
        tool_registry = object()

    app = server_app.Starlette()
    app.state.config_dir = tmp_path
    app.state.started_at = 1.0
    app.state.startup_phase = "ready"
    app.state.hydrated = True
    app.state.components = {"core": "ready", "runtime": "ready"}
    app.state.hydration_error = None
    app.state.container = FakeContainer()

    calls: list[tuple[object, object, object]] = []

    def fake_build_server_health_payload(
        *,
        config_dir: Path,
        role_registry: object | None = None,
        skill_registry: object | None = None,
        tool_registry: object | None = None,
    ) -> FakeHealthPayload:
        assert config_dir == tmp_path
        calls.append((role_registry, skill_registry, tool_registry))
        return FakeHealthPayload()

    monkeypatch.setattr(
        server_app,
        "build_server_health_payload",
        fake_build_server_health_payload,
    )

    payload = server_app._health_payload(app)

    assert payload["status"] == "ok"
    assert payload["startup_phase"] == "ready"
    assert payload["hydrated"] is True
    assert calls == [
        (
            FakeContainer.role_registry,
            FakeContainer.skill_registry,
            FakeContainer.tool_registry,
        )
    ]


def test_hydration_failure_stops_partially_started_container(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeContainer:
        def __init__(self) -> None:
            self.stopped = False

        async def start(self) -> None:
            raise RuntimeError("boom")

        async def stop(self) -> None:
            self.stopped = True

    container = FakeContainer()

    class FakeBundle:
        def __init__(self) -> None:
            self.container = container
            self.api_app = server_app.Starlette()

    app = server_app.Starlette()
    app.state.components = {"core": "ready", "runtime": "loading"}
    app.state.started_at = 1.0
    app.state.hydrated = False
    app.state.hydration_error = None

    monkeypatch.setattr(
        server_app,
        "_build_hydration_bundle",
        lambda config_dir: FakeBundle(),
    )
    monkeypatch.setattr(server_app, "_log_event", lambda *_args, **_kwargs: None)

    asyncio.run(server_app._hydrate_runtime(app, tmp_path))

    assert container.stopped is True
    assert app.state.container is None
    assert app.state.startup_phase == "failed"


def test_lifespan_finishes_hydration_and_stops_container(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeContainer:
        def __init__(self) -> None:
            self.stopped = False

        async def stop(self) -> None:
            self.stopped = True

    container = FakeContainer()
    events: list[str] = []

    async def fake_hydrate(
        starlette_app: server_app.Starlette, config_dir: Path
    ) -> None:
        assert config_dir == tmp_path
        starlette_app.state.container = container

    async def run_case() -> None:
        app = server_app.Starlette()
        async with server_app.lifespan(app):
            await asyncio.sleep(0)
            assert app.state.hydrated is False

    monkeypatch.setattr(server_app, "get_app_config_dir", lambda: tmp_path)
    monkeypatch.setattr(server_app, "ensure_app_config_bootstrap", lambda _path: None)
    monkeypatch.setattr(
        server_app, "_sync_plain_app_env_to_process_env", lambda _path: None
    )
    monkeypatch.setattr(
        server_app, "_configure_asyncio_exception_handler", lambda: None
    )
    monkeypatch.setattr(server_app, "_register_signal_handlers", lambda: None)
    monkeypatch.setattr(server_app, "_hydrate_runtime", fake_hydrate)
    monkeypatch.setattr(server_app, "_shutdown_logging_if_configured", lambda: None)
    monkeypatch.setattr(
        server_app,
        "_log_event",
        lambda *_args, **kwargs: events.append(str(kwargs["event"])),
    )

    asyncio.run(run_case())

    assert container.stopped is True
    assert events == ["app.bootstrap.ready", "app.shutdown"]


def test_lifespan_cancels_in_flight_hydration_on_shutdown(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    cancelled: list[bool] = []

    async def slow_hydrate(
        _starlette_app: server_app.Starlette, _config_dir: Path
    ) -> None:
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.append(True)
            raise

    async def run_case() -> None:
        app = server_app.Starlette()
        async with server_app.lifespan(app):
            await asyncio.sleep(0)

    monkeypatch.setattr(server_app, "get_app_config_dir", lambda: tmp_path)
    monkeypatch.setattr(server_app, "ensure_app_config_bootstrap", lambda _path: None)
    monkeypatch.setattr(
        server_app, "_sync_plain_app_env_to_process_env", lambda _path: None
    )
    monkeypatch.setattr(
        server_app, "_configure_asyncio_exception_handler", lambda: None
    )
    monkeypatch.setattr(server_app, "_register_signal_handlers", lambda: None)
    monkeypatch.setattr(server_app, "_hydrate_runtime", slow_hydrate)
    monkeypatch.setattr(server_app, "_shutdown_logging_if_configured", lambda: None)
    monkeypatch.setattr(server_app, "_log_event", lambda *_args, **_kwargs: None)

    asyncio.run(run_case())

    assert cancelled == [True]


def test_logging_helpers_cover_import_error_and_log_levels(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def fake_import(
        name: str,
        globals: Mapping[str, object] | None = None,
        locals: Mapping[str, object] | None = None,
        fromlist: Sequence[str] | None = (),
        level: int = 0,
    ) -> object:
        if name == "relay_teams.logger":
            raise ImportError("missing logger")
        return original_import(name, globals, locals, fromlist, level)

    original_import = builtins.__import__
    monkeypatch.setattr(builtins, "__import__", fake_import)

    caplog.set_level(logging.INFO)
    server_app._log_event(
        logging.INFO,
        event="unit.event",
        message="Unit event",
        payload={"ok": True},
        duration_ms=12,
    )
    server_app.log_event(
        server_app.logger,
        logging.WARNING,
        event="unit.forwarded",
        message="Forwarded event",
    )
    server_app._shutdown_logging_if_configured()

    assert "Unit event" in caplog.text
    assert "duration_ms=12" in caplog.text
    assert (
        server_app._resolve_request_log_level(
            path="/.well-known/appspecific/com.chrome.devtools.json", status_code=400
        )
        is None
    )
    assert (
        server_app._resolve_request_log_level(
            path="/api/system/health", status_code=200
        )
        is None
    )
    assert (
        server_app._resolve_request_log_level(path="/api/runs", status_code=404)
        == logging.WARNING
    )
