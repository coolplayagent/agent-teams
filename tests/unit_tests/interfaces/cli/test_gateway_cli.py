# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Dict, Optional, Tuple, cast

import pytest
from typer.testing import CliRunner

import relay_teams.interfaces.cli.gateway_cli as gateway_cli


class _FakeMcpService:
    def replace_registry(self, registry: object) -> None:
        self.registry = registry


class _FakeRuntimePaths:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path


class _FakeRuntime:
    def __init__(self, db_path: Path) -> None:
        self.paths = _FakeRuntimePaths(db_path)


class _FakeContainer:
    def __init__(
        self, *, config_dir: Path, session_model_profile_lookup: object
    ) -> None:
        _ = session_model_profile_lookup
        self.config_dir = config_dir
        self.metric_recorder = None
        self.mcp_registry = object()
        self.mcp_service = _FakeMcpService()
        self.runtime = _FakeRuntime(config_dir / "gateway.db")
        self.session_service = object()
        self.workspace_service = object()
        self.run_service = object()
        self.session_ingress_service = object()
        self.media_asset_service = object()
        self.role_registry = _FakeRoleRegistry()
        self.refreshed = False

    def replace_mcp_registry(self, registry: object) -> None:
        self.mcp_registry = registry
        self.mcp_service.replace_registry(registry)
        self.refreshed = True


class _FakeGatewaySessionService:
    captured_kwargs: Optional[Dict[str, object]] = None

    def __init__(self, **kwargs: object) -> None:
        type(self).captured_kwargs = dict(kwargs)


class _FakeGatewaySessionModelProfileStore:
    def get(self, _internal_session_id: str) -> None:
        return None


class _FakeAcpMcpRelay:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs


class _FakeGatewayAwareMcpRegistry:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs


class _FakeRoleRegistry:
    def resolve_normal_mode_role_id(self, role_id: Optional[str]) -> str:
        normalized = str(role_id or "").strip()
        if not normalized:
            return "MainAgent"
        if normalized == "Coordinator":
            raise ValueError(
                "Coordinator role cannot be used in normal mode: Coordinator"
            )
        if normalized == "Crafter":
            return normalized
        raise ValueError(f"Unknown normal mode role: {normalized}")

    def list_normal_mode_roles(self) -> Tuple[object, ...]:
        return (
            type("RoleEntry", (), {"role_id": "MainAgent"})(),
            type("RoleEntry", (), {"role_id": "Crafter"})(),
        )


class _FakeAcpGatewayServer:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.notify = None

    def set_notify(self, notify: object) -> None:
        self.notify = notify


class _FakeAcpStdioRuntime:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.send_message = object()

    async def serve_forever(self) -> None:
        return None


def _patch_acp_runtime_dependencies(tmp_path: Path, monkeypatch) -> None:
    dependencies = gateway_cli._AcpStdioRuntimeDependencies(
        get_app_config_dir=lambda: tmp_path,
        ensure_app_config_bootstrap=lambda _path: None,
        sync_app_env_to_process_env=lambda _path: None,
        configure_logging=lambda **_kwargs: None,
        gateway_session_model_profile_store=_FakeGatewaySessionModelProfileStore,
        server_container=_FakeContainer,
        gateway_session_repository=lambda _db_path: object(),
        gateway_session_service=_FakeGatewaySessionService,
        acp_mcp_relay=_FakeAcpMcpRelay,
        gateway_aware_mcp_registry=_FakeGatewayAwareMcpRegistry,
        acp_gateway_server=_FakeAcpGatewayServer,
        acp_stdio_runtime=_FakeAcpStdioRuntime,
    )
    monkeypatch.setattr(
        gateway_cli,
        "_load_acp_stdio_runtime_dependencies",
        lambda: dependencies,
    )


def test_build_acp_stdio_runtime_passes_workspace_service(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _patch_acp_runtime_dependencies(tmp_path, monkeypatch)

    _ = gateway_cli._build_acp_stdio_runtime()

    captured = _FakeGatewaySessionService.captured_kwargs
    assert captured is not None
    assert "workspace_service" in captured
    assert captured["workspace_service"] is not None


def test_gateway_app_fast_feishu_and_wechat_commands_call_http_helpers() -> None:
    request_calls: list[tuple[str, str, str, dict[str, object] | None]] = []
    autostart_calls: list[tuple[str, bool, bool, bool]] = []

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> dict[str, object]:
        request_calls.append((base_url, method, path, payload))
        return {"path": path}

    def fake_autostart(
        base_url: str,
        autostart: bool,
        daemon: bool,
        force: bool,
    ) -> None:
        autostart_calls.append((base_url, autostart, daemon, force))

    app = gateway_cli.build_gateway_app(
        request_json=fake_request_json,
        auto_start_if_needed=fake_autostart,
        default_base_url="http://server.test",
    )
    runner = CliRunner()
    commands = (
        ["feishu", "list", "--no-autostart"],
        ["feishu", "create", "--payload-json", '{"name":"demo"}'],
        ["feishu", "update", "--account-id", "a1", "--payload-json", '{"x":1}'],
        ["feishu", "enable", "--account-id", "a1"],
        ["feishu", "disable", "--account-id", "a1"],
        ["feishu", "delete", "--account-id", "a1", "--no-force-delete"],
        ["feishu", "reload"],
        ["wechat", "list"],
        [
            "wechat",
            "connect",
            "--wechat-base-url",
            "http://wechat.test",
            "--route-tag",
            "rt",
        ],
        ["wechat", "wait", "--session-key", "s1", "--timeout-ms", "100"],
        ["wechat", "update", "--account-id", "w1", "--payload-json", '{"y":2}'],
        ["wechat", "enable", "--account-id", "w1"],
        ["wechat", "disable", "--account-id", "w1"],
        ["wechat", "delete", "--account-id", "w1", "--no-force-delete"],
        ["wechat", "reload"],
    )

    for command in commands:
        result = runner.invoke(app, command)
        assert result.exit_code == 0, result.output

    assert request_calls[0] == (
        "http://server.test",
        "GET",
        "/api/gateway/feishu/accounts",
        None,
    )
    assert request_calls[1][3] == {"name": "demo"}
    assert request_calls[5][3] == {"force": False}
    assert request_calls[8][3] == {
        "bot_type": "3",
        "base_url": "http://wechat.test",
        "route_tag": "rt",
    }
    assert request_calls[9][3] == {"session_key": "s1", "timeout_ms": 100}
    assert len(autostart_calls) == len(commands)
    assert autostart_calls[0] == ("http://server.test", False, False, False)


def test_gateway_protocol_default_methods_raise() -> None:
    role_registry = cast(gateway_cli._RoleRegistry, object())
    gateway_container = cast(gateway_cli._GatewayContainer, object())
    runtime = cast(gateway_cli._AcpRuntime, object())
    config_service = cast(gateway_cli._GeneralConfigService, object())
    server_container = cast(gateway_cli._ServerContainer, object())
    profile_store = cast(gateway_cli._SessionModelProfileStore, object())
    gateway_session_service = cast(gateway_cli._GatewaySessionService, object())
    gateway_server = cast(gateway_cli._AcpGatewayServer, object())
    resolve_role = cast(
        Callable[[object, str], str],
        getattr(gateway_cli._RoleRegistry, "resolve_normal_mode_role_id"),
    )
    list_roles = cast(
        Callable[[object], object],
        getattr(gateway_cli._RoleRegistry, "list_normal_mode_roles"),
    )
    gateway_role_property = cast(
        property,
        gateway_cli._GatewayContainer.__dict__["role_registry"],
    )
    gateway_role_getter = cast(Callable[[object], object], gateway_role_property.fget)
    serve_forever = cast(
        Callable[[object], Coroutine[object, object, None]],
        getattr(gateway_cli._AcpRuntime, "serve_forever"),
    )
    get_config = cast(
        Callable[[object], object],
        getattr(gateway_cli._GeneralConfigService, "get_config"),
    )
    server_role_property = cast(
        property,
        gateway_cli._ServerContainer.__dict__["role_registry"],
    )
    server_role_getter = cast(Callable[[object], object], server_role_property.fget)
    replace_mcp_registry = cast(
        Callable[[object, object], None],
        getattr(gateway_cli._ServerContainer, "replace_mcp_registry"),
    )
    profile_get = cast(
        Callable[[object, str], object | None],
        getattr(gateway_cli._SessionModelProfileStore, "get"),
    )
    get_session = cast(
        Callable[[object, str], object],
        getattr(gateway_cli._GatewaySessionService, "get_session"),
    )
    set_notify = cast(
        Callable[[object, object], None],
        getattr(gateway_cli._AcpGatewayServer, "set_notify"),
    )

    with pytest.raises(NotImplementedError):
        resolve_role(role_registry, "role")
    with pytest.raises(NotImplementedError):
        list_roles(role_registry)
    with pytest.raises(NotImplementedError):
        gateway_role_getter(gateway_container)
    with pytest.raises(NotImplementedError):
        asyncio.run(serve_forever(runtime))
    with pytest.raises(NotImplementedError):
        get_config(config_service)
    with pytest.raises(NotImplementedError):
        server_role_getter(server_container)
    with pytest.raises(NotImplementedError):
        replace_mcp_registry(server_container, object())
    with pytest.raises(NotImplementedError):
        profile_get(profile_store, "session")
    with pytest.raises(NotImplementedError):
        get_session(gateway_session_service, "gw")
    with pytest.raises(NotImplementedError):
        set_notify(gateway_server, object())


def test_load_acp_stdio_runtime_dependencies_uses_expected_modules(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    class FakeDependency:
        pass

    monkeypatch.setattr(gateway_cli, "get_app_config_dir", lambda: tmp_path)
    monkeypatch.setattr(gateway_cli, "ensure_app_config_bootstrap", lambda _path: None)
    monkeypatch.setattr(gateway_cli, "sync_app_env_to_process_env", lambda _path: None)
    monkeypatch.setattr(gateway_cli, "configure_logging", lambda **_kwargs: None)
    monkeypatch.setattr(gateway_cli, "GatewaySessionModelProfileStore", FakeDependency)
    monkeypatch.setattr(gateway_cli, "ServerContainer", FakeDependency)
    monkeypatch.setattr(gateway_cli, "GatewaySessionRepository", FakeDependency)
    monkeypatch.setattr(gateway_cli, "GatewaySessionService", FakeDependency)
    monkeypatch.setattr(gateway_cli, "AcpMcpRelay", FakeDependency)
    monkeypatch.setattr(gateway_cli, "GatewayAwareMcpRegistry", FakeDependency)
    monkeypatch.setattr(gateway_cli, "AcpGatewayServer", FakeDependency)
    monkeypatch.setattr(gateway_cli, "AcpStdioRuntime", FakeDependency)

    deps = gateway_cli._load_acp_stdio_runtime_dependencies()

    assert deps.get_app_config_dir() == tmp_path
    assert deps.acp_mcp_relay is FakeDependency
    assert deps.server_container is FakeDependency


def test_build_acp_stdio_runtime_passes_default_normal_root_role(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _patch_acp_runtime_dependencies(tmp_path, monkeypatch)

    _ = gateway_cli._build_acp_stdio_runtime(role_id="Crafter")

    captured = _FakeGatewaySessionService.captured_kwargs
    assert captured is not None
    assert captured["default_normal_root_role_id"] == "Crafter"


def test_build_acp_stdio_runtime_rejects_invalid_default_normal_root_role(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _patch_acp_runtime_dependencies(tmp_path, monkeypatch)

    with pytest.raises(Exception, match="Invalid --role 'Missing'.*MainAgent, Crafter"):
        _ = gateway_cli._build_acp_stdio_runtime(role_id="Missing")
