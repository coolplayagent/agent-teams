# -*- coding: utf-8 -*-
from __future__ import annotations

import ast
import http.client
import json
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Protocol, cast

import pytest

from relay_teams.interfaces.cli import app as cli_app
from relay_teams.interfaces.cli.app import (
    FastPromptOptions,
    _connect_host_for_bind_host,
    _configure_fast_prompt_topology,
    _ensure_fast_prompt_server,
    _fast_server_json_candidate,
    _fast_server_json_route,
    _find_unix_tcp_listen_pid,
    _find_windows_tcp_listen_pid,
    _handle_fast_prompt_stream_line,
    _http_get_json,
    _http_request_json,
    _json_object_from_string,
    _normalize_fast_server_json_response,
    _parse_fast_prompt_args,
    _request_fast_prompt_run_stop,
    _require_json_object,
    _require_json_string,
    _resolve_fast_prompt_slash_command,
    _resolve_fast_prompt_workspace_id,
    _stream_fast_prompt_events,
    _wait_until_healthy,
)

FastRoute = tuple[str, str, dict[str, object] | None]


class _HttpGetJson(Protocol):
    def __call__(self, *, host: str, port: int, path: str) -> object:
        raise NotImplementedError


class _StreamFastPromptEvents(Protocol):
    def __call__(self, *, base_url: str, run_id: str) -> None:
        raise NotImplementedError


class _FindListenPid(Protocol):
    def __call__(self, *, port: int) -> int | None:
        raise NotImplementedError


class _WaitUntilHealthy(Protocol):
    def __call__(self, *, host: str, port: int, timeout_seconds: float) -> bool:
        raise NotImplementedError


class _HttpRequestJson(Protocol):
    def __call__(
        self,
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
        timeout_seconds: float = 10.0,
    ) -> object:
        raise NotImplementedError


class _NormalizeFastServerJsonResponse(Protocol):
    def __call__(self, *, args: list[str], response: object) -> object:
        raise NotImplementedError


_CONNECT_HOST_FOR_BIND_HOST = cast(
    "Callable[[str], str]",
    _connect_host_for_bind_host,
)
_CONFIGURE_FAST_PROMPT_TOPOLOGY = cast(
    "Callable[..., None]",
    _configure_fast_prompt_topology,
)
_ENSURE_FAST_PROMPT_SERVER = cast(
    "Callable[[object], None]", _ensure_fast_prompt_server
)
_FAST_SERVER_JSON_CANDIDATE = cast(
    "Callable[[list[str]], bool]",
    _fast_server_json_candidate,
)
_FAST_SERVER_JSON_ROUTE = cast(
    "Callable[[list[str]], FastRoute | None]",
    _fast_server_json_route,
)
_FIND_UNIX_TCP_LISTEN_PID = cast(_FindListenPid, _find_unix_tcp_listen_pid)
_FIND_WINDOWS_TCP_LISTEN_PID = cast(_FindListenPid, _find_windows_tcp_listen_pid)
_HTTP_GET_JSON = cast(_HttpGetJson, _http_get_json)
_HTTP_REQUEST_JSON = cast(_HttpRequestJson, _http_request_json)
_HANDLE_FAST_PROMPT_STREAM_LINE = cast(
    "Callable[[str], bool]",
    _handle_fast_prompt_stream_line,
)
_JSON_OBJECT_FROM_STRING = cast(
    "Callable[[object], dict[str, object]]",
    _json_object_from_string,
)
_NORMALIZE_FAST_SERVER_JSON_RESPONSE = cast(
    _NormalizeFastServerJsonResponse,
    _normalize_fast_server_json_response,
)
_PARSE_FAST_PROMPT_ARGS = cast(
    Callable[[list[str]], FastPromptOptions], _parse_fast_prompt_args
)
_REQUEST_FAST_PROMPT_RUN_STOP = cast(
    "Callable[..., None]", _request_fast_prompt_run_stop
)
_PLUGIN_FAST_LOCAL_MARKETPLACE_ARGS = cast(
    "Callable[[list[str]], bool]",
    cli_app._plugin_fast_local_marketplace_args,
)
_PLUGIN_INSTALL_FAST_SUPPORTED = cast(
    "Callable[..., bool]",
    cli_app._plugin_install_fast_supported,
)
_PLUGIN_MARKETPLACE_VERSION_SOURCE = cast(
    "Callable[..., tuple[str, str]]",
    cli_app._plugin_marketplace_version_source,
)
_PLUGIN_PRUNE = cast(
    "Callable[[], int]",
    cli_app._plugin_prune,
)
_LOOKS_LIKE_GIT_SOURCE = cast(
    "Callable[[str], bool]",
    cli_app._looks_like_git_source,
)
_REQUIRE_JSON_OBJECT = cast(
    "Callable[[object, str], dict[str, object]]",
    _require_json_object,
)
_REQUIRE_JSON_STRING = cast(
    "Callable[[dict[str, object], str], str]",
    _require_json_string,
)
_RESOLVE_FAST_PROMPT_SLASH_COMMAND = cast(
    "Callable[..., str]",
    _resolve_fast_prompt_slash_command,
)
_RESOLVE_FAST_PROMPT_WORKSPACE_ID = cast(
    "Callable[[object], str]",
    _resolve_fast_prompt_workspace_id,
)
_STREAM_FAST_PROMPT_EVENTS = cast(_StreamFastPromptEvents, _stream_fast_prompt_events)
_WAIT_UNTIL_HEALTHY = cast(_WaitUntilHealthy, _wait_until_healthy)
_IS_AGENT_TEAMS_LIVE = cast("Callable[..., bool]", cli_app._is_agent_teams_live)
_IS_AGENT_TEAMS_BASE_URL_HEALTHY = cast(
    "Callable[[str], bool]", cli_app._is_agent_teams_base_url_healthy
)
_FIND_TCP_LISTEN_PID = cast("Callable[..., int | None]", cli_app._find_tcp_listen_pid)
_IS_PORT_AVAILABLE = cast("Callable[..., bool]", cli_app._is_port_available)
_TERMINATE_PROCESS_TREE = cast("Callable[..., None]", cli_app._terminate_process_tree)
_START_SERVER_DAEMON = cast("Callable[..., None]", cli_app._start_server_daemon)
_WRITE_SERVER_PROCESS = cast("Callable[..., None]", cli_app._write_server_process)
_READ_SERVER_PROCESS = cast(
    "Callable[[], dict[str, object]]", cli_app._read_server_process
)
_CLEAR_SERVER_PROCESS = cast("Callable[[], None]", cli_app._clear_server_process)
_IS_HELP = cast("Callable[[list[str]], bool]", cli_app._is_help)
_OPTION_VALUE = cast("Callable[[list[str], str, str], str]", cli_app._option_value)
_OPTION_VALUES = cast("Callable[[list[str], str], list[str]]", cli_app._option_values)
_FIRST_POSITIONAL_ARG = cast(
    "Callable[[list[str]], str]",
    cli_app._first_positional_arg,
)
_WAIT_UNTIL_BASE_URL_HEALTHY = cast(
    "Callable[..., bool]",
    cli_app._wait_until_base_url_healthy,
)
_IS_LOCAL_FAST_BASE_URL_HOST = cast(
    "Callable[[str], bool]",
    cli_app._is_local_fast_base_url_host,
)
_BASE_URL_REQUIRES_PROXY = cast(
    "Callable[..., bool]",
    cli_app._base_url_requires_proxy,
)
_RAISE_FAST_INVALID_SUBCOMMAND_IF_KNOWN = cast(
    "Callable[[list[str]], None]",
    cli_app._raise_fast_invalid_subcommand_if_known,
)
_JSON_OBJECT_OPTION = cast(
    "Callable[[str, str], dict[str, object]]",
    cli_app._json_object_option,
)
_JSON_ARRAY_OPTION = cast(
    "Callable[[str, str], list[object]]",
    cli_app._json_array_option,
)
_RESOLVE_FAST_WORKSPACE_ID = cast(
    "Callable[[list[str]], str]",
    cli_app._resolve_fast_workspace_id,
)
_SKILL_ROW = cast(
    "Callable[..., dict[str, object] | None]",
    cli_app._skill_row,
)
_NORMALIZE_LEGACY_SKILL_NAME = cast(
    "Callable[..., str]",
    cli_app._normalize_legacy_skill_name,
)
_PARSE_SKILL_MANIFEST = cast(
    "Callable[[str], tuple[dict[str, object], str] | None]",
    cli_app._parse_skill_manifest,
)
_RENDER_NAMED_PATH_ROWS = cast(
    "Callable[..., None]",
    cli_app._render_named_path_rows,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _fast_cli_perf_cases() -> list[tuple[str, list[str]]]:
    cases: list[tuple[str, list[str]]] = [
        ("root -h", ["-h"]),
        ("root --help", ["--help"]),
        ("unknown root", ["__invalid_fast_root__"]),
        ("unknown former full root", ["sessions", "nope"]),
    ]
    for key in sorted(cli_app._COMMAND_HELP):
        if key:
            cases.append((f"{key} --help", [*key.split(), "--help"]))
    for group in sorted(cli_app._COMMAND_SUBCOMMANDS):
        cases.append((f"{group} invalid", [group, "__invalid_fast_command__"]))
    for scope in sorted(cli_app._FAST_SERVER_JSON_OPTION_SCOPES):
        cases.append(
            (
                f"{' '.join(scope)} no-autostart",
                [*scope, "--no-autostart", "--base-url", "http://127.0.0.1:9"],
            )
        )
    return cases


def test_fast_cli_app_keeps_relay_team_imports_at_module_boundary() -> None:
    app_path = _repo_root() / "src" / "relay_teams" / "interfaces" / "cli" / "app.py"
    tree = ast.parse(app_path.read_text(encoding="utf-8"), filename=str(app_path))
    nested_relay_imports: list[int] = []
    blocked_top_level_imports: list[str] = []
    blocked_modules = {
        "relay_teams.interfaces.cli.app_full",
        "relay_teams.env.proxy_env",
        "relay_teams.env.runtime_env",
        "relay_teams.interfaces.server.runtime_identity",
        "relay_teams.net.clients",
    }

    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in blocked_modules:
                    blocked_top_level_imports.append(alias.name)
        if isinstance(node, ast.ImportFrom) and node.module in blocked_modules:
            blocked_top_level_imports.append(str(node.module))

    for parent in ast.walk(tree):
        if not isinstance(
            parent,
            ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef,
        ):
            continue
        for node in ast.walk(parent):
            if isinstance(node, ast.Import):
                if any(alias.name.startswith("relay_teams") for alias in node.names):
                    nested_relay_imports.append(node.lineno)
            if isinstance(node, ast.ImportFrom) and (node.module or "").startswith(
                "relay_teams"
            ):
                nested_relay_imports.append(node.lineno)

    assert blocked_top_level_imports == []
    assert nested_relay_imports == []


@pytest.mark.parametrize(("label", "args"), _fast_cli_perf_cases())
def test_fast_cli_command_surface_is_recognized_in_process(
    label: str,
    args: list[str],
) -> None:
    if _IS_HELP(args):
        assert cli_app._print_fast_help(args) is True
        return

    parsed = cli_app._parse_fast_command(args)
    if label.startswith("unknown") or label.endswith(" invalid"):
        assert parsed.invalid_token
        return

    assert parsed.invalid_token == ""
    if _FAST_SERVER_JSON_CANDIDATE(args):
        try:
            cli_app._raise_unknown_fast_options_for_server_json(args)
        except SystemExit as exc:
            assert exc.code == 2


class _FakeForegroundProcess:
    pid = 43210

    def __init__(self, return_code: int = 0) -> None:
        self.return_code = return_code
        self.waited = False

    def wait(self, timeout: float | None = None) -> int:
        _ = timeout
        self.waited = True
        return self.return_code

    def poll(self) -> int:
        return 0


class _KeyboardInterruptProcess:
    pid = 43211

    def __init__(self) -> None:
        self.wait_calls = 0

    def wait(self, timeout: float | None = None) -> int:
        _ = timeout
        self.wait_calls += 1
        if self.wait_calls == 1:
            raise KeyboardInterrupt
        return 0

    def poll(self) -> int | None:
        return None if self.wait_calls == 1 else 0


class _FakeSocket:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks
        self.sent = b""
        self.timeout: float | None = None

    def __enter__(self) -> _FakeSocket:
        return self

    def __exit__(self, *exc_info: object) -> None:
        _ = exc_info

    def settimeout(self, timeout: float) -> None:
        self.timeout = timeout

    def sendall(self, payload: bytes) -> None:
        self.sent += payload

    def recv(self, _size: int) -> bytes:
        if not self._chunks:
            return b""
        return self._chunks.pop(0)


class _FakeTlsContext:
    def __init__(self) -> None:
        self.wrapped: list[tuple[_FakeSocket, str]] = []

    def wrap_socket(
        self, sock: _FakeSocket, *, server_hostname: str | None = None
    ) -> _FakeSocket:
        self.wrapped.append((sock, server_hostname or ""))
        return sock


def test_main_help_uses_fast_manifest_without_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "server", "--help"])
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    cli_app.main()

    assert "Manage the local Agent Teams server." in capsys.readouterr().out


@pytest.mark.parametrize(
    ("argv", "expected"),
    (
        (["relay-teams"], "Usage: relay-teams [OPTIONS] COMMAND"),
        (["relay-teams", "roles", "--help"], "Inspect and manage roles"),
        (["relay-teams", "server", "start", "--help"], "Start the Agent Teams server."),
    ),
)
def test_main_help_covers_manifest_fallbacks(
    argv: list[str],
    expected: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app.sys, "argv", argv)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    cli_app.main()

    assert expected in capsys.readouterr().out


def test_main_help_uses_generic_fast_output_for_known_subcommands(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli_app.sys, "argv", ["relay-teams", "plugin", "install", "--help"]
    )
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    cli_app.main()

    assert "Usage: relay-teams plugin install" in capsys.readouterr().out


def test_root_completion_option_delegates_to_full_cli(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[bool] = []

    def fake_run_full_cli() -> None:
        calls.append(True)
        raise SystemExit(0)

    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "--show-completion"])
    monkeypatch.setattr(cli_app, "_run_full_cli", fake_run_full_cli)

    with pytest.raises(SystemExit) as exc_info:
        cli_app.main()

    assert exc_info.value.code == 0
    assert calls == [True]


def test_main_help_rejects_invalid_known_subcommand(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "mcp", "remove", "--help"])
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app.main()

    assert exc_info.value.code == 2
    captured = capsys.readouterr()
    assert "Usage: relay-teams mcp" in captured.err
    assert "No such command 'remove'." in captured.err


def test_manifest_value_option_accepts_dash_prefixed_value() -> None:
    cli_app._validate_fast_command_surface(
        ["roles", "prompt", "--role-id", "-coordinator", "--format", "json"]
    )


def test_manifest_value_option_rejects_missing_value_before_known_option() -> None:
    with pytest.raises(SystemExit) as exc_info:
        cli_app._validate_fast_command_surface(
            ["roles", "prompt", "--role-id", "--format", "json"]
        )

    assert exc_info.value.code == 2


def test_main_returns_after_fast_local_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "skills", "list"])
    monkeypatch.setattr(cli_app, "_handle_fast_local_command", lambda args: True)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    cli_app.main()


def test_main_delegates_to_full_cli_when_fast_path_does_not_handle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delegated: list[bool] = []
    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "mcp", "tools", "demo"])
    monkeypatch.setattr(cli_app, "_handle_fast_local_command", lambda args: False)
    monkeypatch.setattr(cli_app, "_run_full_cli", lambda: delegated.append(True))

    cli_app.main()

    assert delegated == [True]


def test_fast_prompt_no_autostart_stays_in_fast_dispatcher(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli_app.sys, "argv", ["relay-teams", "-m", "hello", "--no-autostart"]
    )
    monkeypatch.setattr(cli_app, "_is_agent_teams_base_url_healthy", lambda _url: False)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app.main()

    assert exc_info.value.code == 1
    assert "--no-autostart" in capsys.readouterr().err


@pytest.mark.parametrize(
    ("args", "expected_name"),
    (
        (["server", "start", "--daemon"], "server_start"),
        (["server", "stop"], "server_stop"),
        (["server", "restart"], "server_restart"),
        (["skills", "list"], "skills_list"),
        (["skills", "show", "demo"], "skills_show"),
        (["mcp", "list"], "mcp_list"),
        (["mcp", "add", "demo"], "mcp_add"),
        (["mcp", "enable", "demo"], "mcp_enable"),
        (["mcp", "disable", "demo"], "mcp_disable"),
        (["env", "list"], "env_list"),
    ),
)
def test_fast_dispatcher_invokes_local_command_handlers(
    args: list[str],
    expected_name: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, list[str] | bool]] = []
    monkeypatch.setattr(
        cli_app,
        "_server_start",
        lambda command_args: calls.append(("server_start", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_server_stop",
        lambda command_args: calls.append(("server_stop", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_server_restart",
        lambda command_args: calls.append(("server_restart", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_skills_list",
        lambda command_args: calls.append(("skills_list", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_skills_show",
        lambda command_args: calls.append(("skills_show", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_mcp_list",
        lambda command_args: calls.append(("mcp_list", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_mcp_add",
        lambda command_args: calls.append(("mcp_add", command_args)),
    )
    monkeypatch.setattr(
        cli_app,
        "_mcp_set_enabled",
        lambda command_args, *, enabled: calls.append(
            (f"mcp_{'enable' if enabled else 'disable'}", command_args)
        ),
    )
    monkeypatch.setattr(
        cli_app,
        "_env_list",
        lambda command_args: calls.append(("env_list", command_args)),
    )

    assert cli_app._handle_fast_local_command(args)
    assert calls[0][0] == expected_name


@pytest.mark.parametrize(
    "args",
    (
        ["hooks", "list", "--format", "json", "--no-autostart"],
        ["gateway", "feishu", "list", "--format", "json", "--no-autostart"],
    ),
)
def test_server_backed_no_autostart_fails_without_loading_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    args: list[str],
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )
    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: False)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(args)

    assert exc_info.value.code == 1
    assert "--no-autostart" in capsys.readouterr().err


def test_server_backed_no_autostart_uses_running_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    probes: list[tuple[str, int]] = []

    def fake_health_probe(*, host: str, port: int) -> bool:
        probes.append((host, port))
        return True

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", fake_health_probe)
    monkeypatch.setattr(cli_app, "_http_request_json", lambda **_kwargs: [])

    handled = cli_app._handle_fast_local_command(
        ["gateway", "feishu", "list", "--format", "json", "--no-autostart"]
    )

    assert handled is True
    assert probes
    assert set(probes) == {("127.0.0.1", 8000)}


def test_invalid_known_subcommand_fails_without_loading_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(["roles", "list"])

    assert exc_info.value.code == 2
    captured = capsys.readouterr()
    assert "Usage: relay-teams roles" in captured.err
    assert "No such command 'list'." in captured.err


def test_gateway_acp_is_valid_fast_dispatcher_subcommand() -> None:
    _RAISE_FAST_INVALID_SUBCOMMAND_IF_KNOWN(["gateway", "acp", "stdio"])


def test_unknown_top_level_no_autostart_fails_without_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    delegated: list[bool] = []
    monkeypatch.setattr(
        cli_app,
        "_is_agent_teams_base_url_healthy",
        lambda _base_url: (_ for _ in ()).throw(
            AssertionError("invalid commands should not probe health")
        ),
    )
    monkeypatch.setattr(cli_app, "_run_full_cli", lambda: delegated.append(True))
    monkeypatch.setattr(
        cli_app.sys, "argv", ["relay-teams", "foobar", "--no-autostart"]
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app.main()

    assert exc_info.value.code == 2
    assert delegated == []
    assert "No such command 'foobar'." in capsys.readouterr().err


def test_fast_local_dispatch_rejects_unknown_and_missing_options(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as unknown_exc:
        cli_app._handle_fast_local_command(["server", "start", "--prot", "9000"])
    assert unknown_exc.value.code == 2
    assert "No such option '--prot'." in capsys.readouterr().err

    with pytest.raises(SystemExit) as missing_exc:
        cli_app._handle_fast_local_command(["server", "start", "--port", "--daemon"])
    assert missing_exc.value.code == 2
    assert "Option '--port' requires a value." in capsys.readouterr().err

    with pytest.raises(SystemExit) as invalid_exc:
        cli_app._handle_fast_local_command(["server", "start", "--port", "soon"])
    assert invalid_exc.value.code == 2
    assert "Invalid value for '--port': soon" in capsys.readouterr().err


def test_fast_local_dispatch_rejects_cross_command_options(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(["server", "start", "--run-id", "abc"])

    assert exc_info.value.code == 2
    assert "No such option '--run-id'." in capsys.readouterr().err


def test_server_backed_json_command_uses_fast_http_path(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        return {"hooks": {}}

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "hooks",
            "list",
            "--format",
            "json",
            "--base-url",
            "http://127.0.0.1:8123",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert requests == [
        (
            "http://127.0.0.1:8123",
            "GET",
            "/api/system/configs/hooks",
            None,
        )
    ]
    assert capsys.readouterr().out.strip() == '{"hooks": {}}'


def test_server_backed_json_command_rejects_unknown_options(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_is_agent_teams_base_url_healthy", lambda _url: True)
    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("unknown options should fail before HTTP")
        ),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(
            ["hooks", "list", "--format", "json", "--frobnicate"]
        )

    assert exc_info.value.code == 2
    assert "No such option '--frobnicate'." in capsys.readouterr().err


def test_server_backed_json_command_rejects_cross_command_options(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_is_agent_teams_base_url_healthy", lambda _url: True)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(
            ["hooks", "list", "--format", "json", "--run-id", "abc"]
        )

    assert exc_info.value.code == 2
    assert "No such option '--run-id'." in capsys.readouterr().err


def test_server_backed_json_command_rejects_missing_and_extra_positionals(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_is_agent_teams_base_url_healthy", lambda _url: True)

    with pytest.raises(SystemExit) as missing_exc:
        cli_app._handle_fast_local_command(
            ["agent-runtimes", "get", "--format", "json"]
        )
    assert missing_exc.value.code == 2
    assert "Missing required argument." in capsys.readouterr().err

    with pytest.raises(SystemExit) as extra_exc:
        cli_app._handle_fast_local_command(["roles", "validate", "extra"])
    assert extra_exc.value.code == 2
    assert "Got unexpected extra argument 'extra'." in capsys.readouterr().err


def test_fast_local_commands_reject_extra_positionals(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as skill_exc:
        cli_app._handle_fast_local_command(["skills", "show", "pptx-craft", "extra"])
    assert skill_exc.value.code == 2
    assert "Got unexpected extra argument 'extra'." in capsys.readouterr().err

    with pytest.raises(SystemExit) as mcp_exc:
        cli_app._handle_fast_local_command(["mcp", "disable", "server", "extra"])
    assert mcp_exc.value.code == 2
    assert "Got unexpected extra argument 'extra'." in capsys.readouterr().err


def test_fast_plugin_commands_reject_extra_positionals(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text('{"plugins":[]}', encoding="utf-8")
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(
            ["search", "deck", "extra", "--marketplace", str(marketplace)]
        )

    assert exc_info.value.code == 2
    assert "Got unexpected extra argument 'extra'." in capsys.readouterr().err


def test_fast_plugin_list_rejects_available_only_options_without_available(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(["list", "--marketplace-provider", "clawhub"])

    assert exc_info.value.code == 2
    assert "No such option '--marketplace-provider'." in capsys.readouterr().err


def test_fast_health_rejects_bootstrap_starting_status_until_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_http_get_json",
        lambda *, host, port, path: {"status": "starting"},
    )

    assert not cli_app._is_agent_teams_healthy(host="127.0.0.1", port=8000)


def test_server_backed_json_command_falls_back_when_autostart_may_be_needed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        _ = base_url, method, path, payload
        raise AssertionError("request should not run before autostart fallback")

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: False)
    monkeypatch.setattr(cli_app, "_http_request_json", fail_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "hooks",
            "list",
            "--format",
            "json",
            "--base-url",
            "http://127.0.0.1:8123",
        ]
    )

    assert handled is False


def test_commands_list_fast_path_resolves_workspace(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/pick":
            return {"workspace": {"workspace_id": "workspace-1"}}
        return [{"name": "build"}]

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "commands",
            "list",
            "--format",
            "json",
            "--base-url",
            "http://127.0.0.1:8123",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert requests[0][1:] == (
        "POST",
        "/api/workspaces/pick",
        {"root_path": str(Path.cwd().resolve())},
    )
    assert requests[1] == (
        "http://127.0.0.1:8123",
        "GET",
        "/api/system/commands?workspace_id=workspace-1",
        None,
    )
    assert capsys.readouterr().out.strip() == '[{"name": "build"}]'


def test_roles_prompt_fast_path_preserves_section_filtering(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        _ = base_url, method, path, payload
        return {
            "runtime_system_prompt": "runtime",
            "provider_system_prompt": "provider",
            "user_prompt": "user",
            "tools": [{"name": "tool"}],
            "skills": [{"name": "skill"}],
        }

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "roles",
            "prompt",
            "--role-id",
            "Coordinator",
            "--section",
            "provider",
            "--format",
            "json",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert json.loads(capsys.readouterr().out) == {"provider_system_prompt": "provider"}


def test_roles_prompt_fast_path_returns_skills_section(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        _ = base_url, method, path, payload
        return {
            "provider_system_prompt": "provider",
            "user_prompt": "user",
            "skills": [{"name": "skill"}],
        }

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "roles",
            "prompt",
            "--role-id",
            "Coordinator",
            "--section",
            "skills",
            "--format",
            "json",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert json.loads(capsys.readouterr().out) == {"skills": [{"name": "skill"}]}


def test_memories_list_fast_path_requires_workspace_id(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        return {"entries": []}

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    handled = cli_app._handle_fast_local_command(
        [
            "memories",
            "list",
            "--workspace-id",
            "workspace 1",
            "--tier",
            "project",
            "--format",
            "json",
            "--base-url",
            "http://127.0.0.1:8123",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert requests == [
        (
            "http://127.0.0.1:8123",
            "GET",
            "/api/workspaces/workspace%201/memories?tier=project",
            None,
        )
    ]
    assert capsys.readouterr().out.strip() == '{"entries": []}'


def test_server_backed_no_autostart_respects_base_url(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    probes: list[tuple[str, int]] = []

    def fake_health_probe(*, host: str, port: int) -> bool:
        probes.append((host, port))
        return False

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", fake_health_probe)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(
            [
                "gateway",
                "feishu",
                "list",
                "--base-url",
                "http://127.0.0.1:8123",
                "--no-autostart",
            ]
        )

    assert exc_info.value.code == 1
    assert probes == [("127.0.0.1", 8123)]
    assert "--no-autostart" in capsys.readouterr().err


def test_fast_health_probe_uses_https_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [b'HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{"status":"ok"}']
    )
    tls_context = _FakeTlsContext()
    connections: list[tuple[tuple[str, int], float | None]] = []

    def fake_create_connection(
        address: tuple[str, int], timeout: float | None = None
    ) -> _FakeSocket:
        connections.append((address, timeout))
        return fake_socket

    monkeypatch.setattr(cli_app.socket, "create_connection", fake_create_connection)
    monkeypatch.setattr(cli_app, "_base_url_requires_proxy", lambda **_kwargs: False)
    monkeypatch.setattr(
        cli_app.ssl,
        "create_default_context",
        lambda: tls_context,
    )

    assert cli_app._is_agent_teams_base_url_healthy("https://relay.test:8443")

    assert connections == [(("relay.test", 8443), 0.5)]
    assert tls_context.wrapped == [(fake_socket, "relay.test")]
    assert fake_socket.sent.startswith(b"GET /api/system/health HTTP/1.1\r\n")


def test_fast_health_probe_uses_http_json_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_http_get_json",
        lambda *, host, port, path: {"status": "ok"},
    )

    assert cli_app._is_agent_teams_healthy(host="127.0.0.1", port=8000)


def test_fast_health_probe_returns_false_on_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_http_get_json(*, host: str, port: int, path: str) -> object:
        _ = host, port, path
        raise OSError("offline")

    monkeypatch.setattr(cli_app, "_http_get_json", fail_http_get_json)

    assert not cli_app._is_agent_teams_healthy(host="127.0.0.1", port=8000)


def test_fast_live_probe_accepts_bootstrap_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, int, str]] = []

    def fake_http_get_json(*, host: str, port: int, path: str) -> object:
        requests.append((host, port, path))
        return {"status": "alive"}

    monkeypatch.setattr(cli_app, "_http_get_json", fake_http_get_json)

    assert cli_app._is_agent_teams_live(host="0.0.0.0", port=8000)
    assert requests == [("0.0.0.0", 8000, "/api/system/live")]


def test_fast_live_probe_rejects_non_agent_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_http_get_json",
        lambda *, host, port, path: {"status": "starting"},
    )

    assert not cli_app._is_agent_teams_live(host="127.0.0.1", port=8000)


def test_http_get_json_uses_loopback_for_unspecified_bind_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [b'HTTP/1.1 200 OK\r\nContent-Length: 18\r\n\r\n{"status":"alive"}']
    )
    connections: list[tuple[tuple[str, int], float | None]] = []

    def fake_create_connection(
        address: tuple[str, int], timeout: float | None = None
    ) -> _FakeSocket:
        connections.append((address, timeout))
        return fake_socket

    monkeypatch.setattr(cli_app.socket, "create_connection", fake_create_connection)

    assert _HTTP_GET_JSON(host="0.0.0.0", port=8000, path="/api/system/live") == {
        "status": "alive"
    }
    assert connections == [(("127.0.0.1", 8000), 0.5)]
    assert b"Host: 127.0.0.1:8000" in fake_socket.sent


def test_http_get_json_brackets_ipv6_host_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [b'HTTP/1.1 200 OK\r\nContent-Length: 18\r\n\r\n{"status":"alive"}']
    )
    connections: list[tuple[tuple[str, int], float | None]] = []

    def fake_create_connection(
        address: tuple[str, int], timeout: float | None = None
    ) -> _FakeSocket:
        connections.append((address, timeout))
        return fake_socket

    monkeypatch.setattr(cli_app.socket, "create_connection", fake_create_connection)

    assert _HTTP_GET_JSON(host="::1", port=8000, path="/api/system/live") == {
        "status": "alive"
    }
    assert connections == [(("::1", 8000), 0.5)]
    assert b"Host: [::1]:8000" in fake_socket.sent


def test_http_request_json_sends_payload_and_decodes_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [b'HTTP/1.1 201 Created\r\nContent-Length: 11\r\n\r\n{"ok":true}']
    )
    connections: list[tuple[tuple[str, int], float | None]] = []

    def fake_create_connection(
        address: tuple[str, int], timeout: float | None = None
    ) -> _FakeSocket:
        connections.append((address, timeout))
        return fake_socket

    monkeypatch.setattr(cli_app.socket, "create_connection", fake_create_connection)

    assert _HTTP_REQUEST_JSON(
        base_url="http://0.0.0.0:8000/root",
        method="POST",
        path="/api/demo",
        payload={"message": "hi"},
        timeout_seconds=2.0,
    ) == {"ok": True}
    assert connections == [(("127.0.0.1", 8000), 2.0)]
    assert fake_socket.sent.startswith(b"POST /root/api/demo HTTP/1.1\r\n")
    assert b"Content-Type: application/json" in fake_socket.sent
    assert fake_socket.sent.endswith(b'{"message": "hi"}')


def test_http_request_json_decodes_chunked_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [
            b"HTTP/1.1 200 OK\r\n"
            b"Transfer-Encoding: chunked\r\n"
            b"\r\n"
            b'7\r\n{"ok":t\r\n'
            b"4;ext=1\r\nrue}\r\n"
            b"0\r\n\r\n"
        ]
    )

    monkeypatch.setattr(
        cli_app.socket,
        "create_connection",
        lambda _address, timeout=None: fake_socket,
    )

    assert _HTTP_REQUEST_JSON(
        base_url="http://127.0.0.1:8000",
        method="GET",
        path="/api/demo",
        payload=None,
    ) == {"ok": True}


def test_http_request_json_brackets_ipv6_host_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket(
        [b'HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n{"ok":true}']
    )
    connections: list[tuple[tuple[str, int], float | None]] = []

    def fake_create_connection(
        address: tuple[str, int], timeout: float | None = None
    ) -> _FakeSocket:
        connections.append((address, timeout))
        return fake_socket

    monkeypatch.setattr(cli_app.socket, "create_connection", fake_create_connection)

    assert _HTTP_REQUEST_JSON(
        base_url="http://[::1]:8000",
        method="GET",
        path="/api/demo",
        payload=None,
    ) == {"ok": True}
    assert connections == [(("::1", 8000), 10.0)]
    assert b"Host: [::1]:8000" in fake_socket.sent


@pytest.mark.parametrize(
    ("chunks", "expected_error"),
    (
        ([b"HTTP/1.1 200 OK\r\n"], "Server response did not include an HTTP body"),
        (
            [b"HTTP/1.1 503 Service Unavailable\r\n\r\nstarting"],
            "HTTP request failed",
        ),
    ),
)
def test_http_request_json_reports_bad_http_responses(
    chunks: list[bytes],
    expected_error: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app.socket,
        "create_connection",
        lambda _address, timeout=None: _FakeSocket(chunks.copy()),
    )

    with pytest.raises(RuntimeError, match=expected_error):
        _HTTP_REQUEST_JSON(
            base_url="http://127.0.0.1:8000",
            method="GET",
            path="/api/demo",
            payload=None,
        )


def test_http_request_json_rejects_unsupported_scheme() -> None:
    with pytest.raises(RuntimeError, match="Unsupported URL scheme"):
        _HTTP_REQUEST_JSON(
            base_url="ftp://127.0.0.1:8000",
            method="GET",
            path="/api/demo",
            payload=None,
        )


@pytest.mark.parametrize(
    ("host", "expected"),
    (
        ("0.0.0.0", "127.0.0.1"),
        ("::", "::1"),
        ("127.0.0.1", "127.0.0.1"),
        ("relay.test", "relay.test"),
    ),
)
def test_connect_host_for_bind_host(host: str, expected: str) -> None:
    assert _CONNECT_HOST_FOR_BIND_HOST(host) == expected


def test_fast_port_available_reports_bind_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSocket:
        def __enter__(self) -> FakeSocket:
            return self

        def __exit__(self, *exc_info: object) -> None:
            _ = exc_info

        def setsockopt(self, level: int, option: int, value: int) -> None:
            _ = level, option, value

        def bind(self, address: tuple[str, int]) -> None:
            _ = address
            raise OSError("occupied")

    monkeypatch.setattr(cli_app.socket, "socket", lambda _family, _kind: FakeSocket())

    assert not cli_app._is_port_available(host="127.0.0.1", port=8000)


@pytest.mark.parametrize(
    ("stdout", "expected"),
    (
        (
            "TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    1234\n",
            1234,
        ),
        ("TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    not-a-pid\n", None),
        ("TCP    127.0.0.1:8001    0.0.0.0:0    LISTENING    1234\n", None),
    ),
)
def test_find_windows_tcp_listen_pid_parses_netstat(
    stdout: str,
    expected: int | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout=stdout),
    )

    assert _FIND_WINDOWS_TCP_LISTEN_PID(port=8000) == expected


@pytest.mark.parametrize(
    ("stdout", "returncode", "expected"),
    (
        ("4321\n", 0, 4321),
        ("not-a-pid\n", 0, None),
        ("", 1, None),
    ),
)
def test_find_unix_tcp_listen_pid_parses_lsof(
    stdout: str,
    returncode: int,
    expected: int | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=returncode, stdout=stdout),
    )

    assert _FIND_UNIX_TCP_LISTEN_PID(port=8000) == expected


def test_wait_until_healthy_returns_when_probe_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)

    assert _WAIT_UNTIL_HEALTHY(host="127.0.0.1", port=8000, timeout_seconds=1.0)


def test_wait_until_healthy_returns_false_after_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    times = iter((0.0, 0.0, 0.2))
    sleeps: list[float] = []
    monkeypatch.setattr(cli_app.time, "perf_counter", lambda: next(times))
    monkeypatch.setattr(cli_app.time, "sleep", lambda seconds: sleeps.append(seconds))
    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: False)

    assert (
        _WAIT_UNTIL_HEALTHY(host="127.0.0.1", port=8000, timeout_seconds=0.1) is False
    )
    assert sleeps == [0.1]


def test_live_and_https_health_probes_tolerate_request_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_timeout(**_kwargs: object) -> object:
        raise TimeoutError("slow")

    monkeypatch.setattr(cli_app, "_http_get_json", raise_timeout)
    assert _IS_AGENT_TEAMS_LIVE(host="127.0.0.1", port=8000) is False

    monkeypatch.setattr(cli_app, "_http_request_json", raise_timeout)
    assert _IS_AGENT_TEAMS_BASE_URL_HEALTHY("https://127.0.0.1:8443") is False


def test_server_process_file_round_trips_and_clear_is_idempotent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / "app"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    _WRITE_SERVER_PROCESS(host="127.0.0.1", port=8123, pid=2468)
    payload = _READ_SERVER_PROCESS()

    assert payload["pid"] == 2468
    assert payload["host"] == "127.0.0.1"
    assert payload["port"] == 8123

    _CLEAR_SERVER_PROCESS()
    assert _READ_SERVER_PROCESS() == {}
    _CLEAR_SERVER_PROCESS()


def test_server_stop_managed_process_clears_record(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    terminated: list[tuple[int, bool]] = []
    cleared: list[str] = []
    monkeypatch.setattr(
        cli_app,
        "_read_server_process",
        lambda: {"pid": 2468, "host": "127.0.0.1", "port": 8123},
    )
    monkeypatch.setattr(
        cli_app,
        "_terminate_process_tree",
        lambda pid, *, force: terminated.append((pid, force)),
    )
    monkeypatch.setattr(cli_app, "_clear_server_process", lambda: cleared.append("yes"))

    cli_app._server_stop(["--force"])

    assert terminated == [(2468, True)]
    assert cleared == ["yes"]
    assert "http://127.0.0.1:8123" in capsys.readouterr().out


def test_server_stop_reports_no_process_when_port_is_free(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_read_server_process", dict)
    monkeypatch.setattr(cli_app, "_find_tcp_listen_pid", lambda *, host, port: None)

    cli_app._server_stop([])

    assert "No managed Agent Teams server process found." in capsys.readouterr().out


def test_start_server_daemon_uses_posix_background_flags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    def fake_popen(command: list[str], **kwargs: object) -> object:
        calls.append({"command": command, **kwargs})
        return object()

    monkeypatch.setattr(cli_app.sys, "platform", "linux")
    monkeypatch.setattr(cli_app.subprocess, "Popen", fake_popen)

    _START_SERVER_DAEMON(host="127.0.0.1", port=8123)

    assert calls[0]["command"] == [
        cli_app.sys.executable,
        "-m",
        "relay_teams",
        "server",
        "start",
        "--host",
        "127.0.0.1",
        "--port",
        "8123",
    ]
    assert calls[0]["start_new_session"] is True


def test_platform_process_helpers_cover_empty_and_posix_branches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    killed: list[tuple[int, int]] = []
    monkeypatch.setattr(cli_app.sys, "platform", "linux")
    monkeypatch.setattr(cli_app.signal, "SIGKILL", 9, raising=False)
    monkeypatch.setattr(cli_app.os, "kill", lambda pid, sig: killed.append((pid, sig)))

    assert _FIND_TCP_LISTEN_PID(host="", port=8123) is None
    _TERMINATE_PROCESS_TREE(1234, force=False)
    _TERMINATE_PROCESS_TREE(1235, force=True)

    assert killed == [(1234, 15), (1235, 9)]


def test_is_port_available_reports_bind_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingSocket:
        def __enter__(self) -> FailingSocket:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def setsockopt(self, *_args: object) -> None:
            return None

        def bind(self, _address: object) -> None:
            raise OSError("in use")

    monkeypatch.setattr(cli_app.socket, "socket", lambda *_args: FailingSocket())

    assert _IS_PORT_AVAILABLE(host="127.0.0.1", port=8000) is False


def test_fast_local_list_commands_do_not_load_full_cli(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handled: list[str] = []
    monkeypatch.setattr(cli_app, "_skills_list", lambda _args: handled.append("skills"))
    monkeypatch.setattr(cli_app, "_mcp_list", lambda _args: handled.append("mcp"))
    monkeypatch.setattr(cli_app, "_plugin_list", lambda _args: handled.append("plugin"))
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    assert cli_app._handle_fast_local_command(["skills", "list", "--format", "json"])
    assert cli_app._handle_fast_local_command(["mcp", "list", "--format", "json"])
    assert cli_app._handle_fast_local_command(["plugin", "list", "--format", "json"])

    assert handled == ["skills", "mcp", "plugin"]


def test_fast_plugin_lifecycle_uses_local_state_without_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )
    for version in ("1.0.0", "2.0.0"):
        manifest_dir = tmp_path / f"plugin-{version}" / "app"
        manifest_dir.mkdir(parents=True)
        (manifest_dir / "plugin.json").write_text(
            json.dumps(
                {
                    "name": "codex-e2e-plugin",
                    "version": version,
                    "description": "Codex E2E plugin",
                    "userConfig": {"endpoint": {"type": "string"}},
                }
            ),
            encoding="utf-8",
        )
    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "codex-e2e-plugin",
                        "description": "Codex E2E plugin",
                        "latest": "2.0.0",
                        "versions": [
                            {
                                "version": "1.0.0",
                                "source": {
                                    "kind": "local",
                                    "value": str(tmp_path / "plugin-1.0.0"),
                                },
                            },
                            {
                                "version": "2.0.0",
                                "source": {
                                    "kind": "local",
                                    "value": str(tmp_path / "plugin-2.0.0"),
                                },
                            },
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    commands = (
        [
            "plugin",
            "validate",
            str(tmp_path / "plugin-1.0.0"),
            "--format",
            "json",
        ],
        [
            "plugin",
            "install",
            "codex-e2e-plugin",
            "--marketplace",
            str(marketplace),
            "--version",
            "1.0.0",
        ],
        ["plugin", "disable", "codex-e2e-plugin"],
        ["plugin", "enable", "codex-e2e-plugin"],
        [
            "plugin",
            "configure",
            "codex-e2e-plugin",
            "--set",
            "endpoint=https://example.test",
        ],
        ["plugin", "update", "codex-e2e-plugin", "--version", "2.0.0"],
        ["plugin", "prune"],
        ["plugin", "uninstall", "codex-e2e-plugin", "--prune"],
    )

    for command in commands:
        assert cli_app._handle_fast_local_command(command)

    output = capsys.readouterr().out
    assert "Installed plugin codex-e2e-plugin" in output
    assert "Updated plugin codex-e2e-plugin to 2.0.0." in output
    assert "Uninstalled plugin codex-e2e-plugin from user and pruned" in output
    state = json.loads(
        (config_dir / "plugins" / "plugins.json").read_text(encoding="utf-8")
    )
    assert state == {"plugins": []}


def test_fast_plugin_validate_requires_path(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(["plugin", "validate"])

    assert exc_info.value.code == 2
    assert "Missing argument 'PATH'." in capsys.readouterr().err


def test_fast_plugin_local_install_list_configure_and_remove(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    plugin_root = tmp_path / "local-plugin"
    (plugin_root / "app").mkdir(parents=True)
    (plugin_root / "app" / "plugin.json").write_text(
        json.dumps({"name": "local-plugin", "version": "0.1.0"}),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_plugin(["install", str(plugin_root), "--disabled"])
    assert cli_app._handle_fast_plugin(["list"])
    assert cli_app._handle_fast_plugin(["enable", "local-plugin"])
    assert cli_app._handle_fast_plugin(
        ["configure", "local-plugin", "--set", "retry=3", "--set", "mode=fast"]
    )
    assert cli_app._handle_fast_plugin(["uninstall", "local-plugin"])

    output = capsys.readouterr().out
    assert "Installed plugin local-plugin" in output
    assert "Plugins" in output
    assert "Configured plugin local-plugin" in output
    state = json.loads(
        (config_dir / "plugins" / "plugins.json").read_text(encoding="utf-8")
    )
    assert state == {"plugins": []}


def test_fast_plugin_install_missing_local_source_is_usage_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(["install", str(tmp_path / "missing-plugin")])

    assert exc_info.value.code == 2
    assert "Plugin source does not exist:" in capsys.readouterr().err


def test_fast_plugin_list_preserves_lightweight_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    state_dir = config_dir / "plugins"
    state_dir.mkdir(parents=True)
    missing_root = tmp_path / "missing-plugin"
    (state_dir / "plugins.json").write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "missing-plugin",
                        "version": "0.1.0",
                        "scope": "user",
                        "enabled": True,
                        "root_dir": str(missing_root),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_plugin(["list", "--format", "json"])

    payload = json.loads(capsys.readouterr().out)
    assert payload["plugins"][0]["name"] == "missing-plugin"
    assert payload["diagnostics"] == [
        {
            "plugin_name": "missing-plugin",
            "scope": "user",
            "severity": "error",
            "component": "",
            "path": str(missing_root),
            "message": "Plugin root directory does not exist.",
        }
    ]


def test_fast_plugin_local_marketplace_search_and_available_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "alpha-plugin",
                        "description": "Alpha tools",
                        "versions": [
                            {
                                "version": "1.0.0",
                                "source": {"kind": "local", "value": str(tmp_path)},
                            },
                            "0.9.0",
                        ],
                    },
                    {"description": "missing name"},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    assert cli_app._handle_fast_plugin(
        [
            "list",
            "--available",
            "--marketplace",
            str(marketplace),
            "--format",
            "json",
        ]
    )
    list_payload = json.loads(capsys.readouterr().out)
    assert list_payload[0]["name"] == "alpha-plugin"
    assert list_payload[0]["latest"] == "0.9.0"

    assert cli_app._handle_fast_plugin(
        [
            "search",
            "alpha",
            "--marketplace",
            str(marketplace),
            "--format",
            "json",
        ]
    )
    search_payload = json.loads(capsys.readouterr().out)
    assert [row["name"] for row in search_payload] == ["alpha-plugin"]


def test_fast_plugin_marketplace_table_modes_and_missing_entries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "alpha-plugin",
                        "description": "Alpha tools",
                        "latest": "1.0.0",
                        "versions": [
                            {
                                "version": "1.0.0",
                                "source": {"kind": "local", "value": str(tmp_path)},
                            }
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    assert cli_app._handle_fast_plugin(
        ["list", "--available", "--marketplace", str(marketplace)]
    )
    assert "Available plugins" in capsys.readouterr().out

    assert cli_app._handle_fast_plugin(
        ["search", "alpha", "--marketplace", str(marketplace)]
    )
    assert "alpha-plugin" in capsys.readouterr().out

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(
            ["install", "missing-plugin", "--marketplace", str(marketplace)]
        )

    assert exc_info.value.code == 2
    assert "Plugin not found in marketplace" in capsys.readouterr().err


def test_fast_plugin_local_marketplace_argument_guards(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    full_cli_calls: list[str] = []
    monkeypatch.setattr(cli_app, "_run_full_cli", lambda: full_cli_calls.append("full"))

    assert (
        _PLUGIN_FAST_LOCAL_MARKETPLACE_ARGS(["--marketplace-provider", "clawhub"])
        is False
    )
    assert (
        _PLUGIN_FAST_LOCAL_MARKETPLACE_ARGS(["--marketplace-source", "repo"]) is False
    )
    assert _PLUGIN_FAST_LOCAL_MARKETPLACE_ARGS(["--marketplace-ref", "main"]) is False
    assert (
        _PLUGIN_INSTALL_FAST_SUPPORTED(
            args=["--source-kind", "git"],
            source="local",
            marketplace="",
        )
        is False
    )
    assert (
        _PLUGIN_INSTALL_FAST_SUPPORTED(
            args=[],
            source="https://example.test/plugin",
            marketplace="",
        )
        is False
    )
    assert _LOOKS_LIKE_GIT_SOURCE("git@example.test:plugin.git") is True
    assert _LOOKS_LIKE_GIT_SOURCE("local-plugin") is False

    _PLUGIN_MARKETPLACE_VERSION_SOURCE(
        entry={
            "name": "remote-plugin",
            "versions": [
                {
                    "version": "1.0.0",
                    "source": {"kind": "git", "value": "https://example.test/p.git"},
                }
            ],
        },
        requested_version="",
    )

    assert full_cli_calls == ["full"]


def test_fast_plugin_marketplace_version_source_errors(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as empty_exc:
        _PLUGIN_MARKETPLACE_VERSION_SOURCE(
            entry={"name": "empty", "versions": []},
            requested_version="",
        )
    assert empty_exc.value.code == 2

    with pytest.raises(SystemExit) as missing_exc:
        _PLUGIN_MARKETPLACE_VERSION_SOURCE(
            entry={
                "name": "missing-version",
                "versions": [
                    {
                        "version": "1.0.0",
                        "source": {"kind": "local", "value": str(tmp_path)},
                    }
                ],
            },
            requested_version="2.0.0",
        )
    assert missing_exc.value.code == 2
    assert "Marketplace version not found." in capsys.readouterr().err

    with pytest.raises(SystemExit) as source_exc:
        _PLUGIN_MARKETPLACE_VERSION_SOURCE(
            entry={
                "name": "missing-source",
                "versions": [{"version": "1.0.0", "source": {"kind": "local"}}],
            },
            requested_version="",
        )
    assert source_exc.value.code == 2
    assert "Marketplace local source is missing." in capsys.readouterr().err


def test_fast_plugin_update_guard_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    state_path = config_dir / "plugins" / "plugins.json"
    state_path.parent.mkdir(parents=True)

    state_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "local-plugin",
                        "scope": "user",
                        "source": {"kind": "local", "value": str(tmp_path)},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    assert cli_app._handle_fast_plugin(["update", "local-plugin"]) is False

    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text(json.dumps({"plugins": []}), encoding="utf-8")
    state_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "market-plugin",
                        "scope": "user",
                        "source": {
                            "kind": "marketplace",
                            "marketplace": str(marketplace),
                            "marketplace_provider": "local_json",
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(["update", "market-plugin"])

    assert exc_info.value.code == 2
    assert "Plugin not found in marketplace" in capsys.readouterr().err


def test_fast_plugin_prune_removes_only_unreferenced_installed_versions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    project_root = tmp_path / "project"
    (project_root / ".git").mkdir(parents=True)
    monkeypatch.chdir(project_root)
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.delenv("RELAY_TEAMS_MANAGED_PLUGINS_FILE", raising=False)
    installed_root = config_dir / "plugins" / "installed"
    kept = installed_root / "demo" / "1.0.0"
    project_kept = installed_root / "demo" / "2.0.0"
    stale = installed_root / "demo" / "3.0.0"
    ignored_file = installed_root / "README.txt"
    kept.mkdir(parents=True)
    project_kept.mkdir(parents=True)
    stale.mkdir(parents=True)
    ignored_file.write_text("not a plugin dir", encoding="utf-8")
    (config_dir / "plugins").mkdir(parents=True, exist_ok=True)
    (config_dir / "plugins" / "plugins.json").write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "demo",
                        "scope": "user",
                        "root_dir": str(kept),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (project_root / ".relay-teams").mkdir()
    (project_root / ".relay-teams" / "plugins.json").write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "demo",
                        "scope": "project",
                        "root_dir": str(project_kept),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    removed = _PLUGIN_PRUNE()

    assert removed == 1
    assert kept.exists()
    assert project_kept.exists()
    assert not stale.exists()
    assert "Pruned 1 installed plugin version" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("command", "expected_error"),
    (
        (
            ["validate", "missing-plugin", "--format", "json"],
            "Plugin manifest is required",
        ),
        (["uninstall", "missing-plugin"], "Plugin is not installed in user"),
        (
            ["configure", "missing-plugin", "--set", "bad"],
            "--set values must use key=value",
        ),
    ),
)
def test_fast_plugin_error_paths(
    command: list[str],
    expected_error: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    with pytest.raises(SystemExit):
        cli_app._handle_fast_plugin(command)

    captured = capsys.readouterr()
    assert expected_error in captured.err or expected_error in captured.out


def test_fast_mcp_add_enable_disable_uses_local_config(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    assert cli_app._handle_fast_local_command(
        [
            "mcp",
            "add",
            "codex-e2e-mcp",
            "--command",
            "python",
            "--arg",
            "-c",
            "--arg",
            "print(1)",
            "--format",
            "json",
        ]
    )
    assert cli_app._handle_fast_local_command(
        ["mcp", "disable", "codex-e2e-mcp", "--format", "json"]
    )
    assert cli_app._handle_fast_local_command(
        ["mcp", "enable", "codex-e2e-mcp", "--format", "json"]
    )

    config = json.loads((tmp_path / "app" / "mcp.json").read_text(encoding="utf-8"))
    assert config["mcpServers"]["codex-e2e-mcp"]["args"] == ["-c", "print(1)"]
    assert config["mcpServers"]["codex-e2e-mcp"]["enabled"] is True
    assert '"name": "codex-e2e-mcp"' in capsys.readouterr().out


def test_fast_mcp_http_server_and_table_rendering(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / "app"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(
        [
            "mcp",
            "add",
            "http-demo",
            "--url",
            "https://mcp.example.test",
            "--header",
            "Authorization=Bearer token",
        ]
    )
    assert cli_app._handle_fast_local_command(["mcp", "list"])

    output = capsys.readouterr().out
    assert "MCP servers" in output
    assert "http-demo" in output
    config = json.loads((config_dir / "mcp.json").read_text(encoding="utf-8"))
    assert config["mcpServers"]["http-demo"]["transport"] == "http"
    assert config["mcpServers"]["http-demo"]["headers"] == {
        "Authorization": "Bearer token"
    }


def test_fast_mcp_sse_url_infers_sse_transport(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / "app"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(
        [
            "mcp",
            "add",
            "sse-demo",
            "--url",
            "https://mcp.example.test/sse",
        ]
    )

    config = json.loads((config_dir / "mcp.json").read_text(encoding="utf-8"))
    assert config["mcpServers"]["sse-demo"]["transport"] == "sse"


def test_fast_mcp_enable_migrates_legacy_servers_wrapper(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / "app"
    config_dir.mkdir(parents=True)
    (config_dir / "mcp.json").write_text(
        json.dumps(
            {
                "servers": {
                    "legacy-demo": {
                        "transport": "stdio",
                        "command": "python",
                        "args": [],
                        "enabled": False,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(["mcp", "enable", "legacy-demo"])

    config = json.loads((config_dir / "mcp.json").read_text(encoding="utf-8"))
    assert "servers" not in config
    assert config["mcpServers"]["legacy-demo"]["enabled"] is True


@pytest.mark.parametrize(
    ("args", "expected_error"),
    (
        (["mcp", "add"], "Missing argument 'SERVER_NAME'."),
        (["mcp", "add", "demo"], "Specify exactly one of --command or --url"),
        (
            [
                "mcp",
                "add",
                "demo",
                "--url",
                "https://mcp.example.test",
                "--header",
                "bad",
            ],
            "--header values must use KEY=VALUE",
        ),
        (["mcp", "enable", "missing"], "Unknown MCP server: missing"),
    ),
)
def test_fast_mcp_errors_are_reported_without_full_cli(
    args: list[str],
    expected_error: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_local_command(args)

    assert exc_info.value.code == 2
    assert expected_error in capsys.readouterr().err


def test_fast_server_crud_routes_do_not_load_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        return {"status": "ok"}

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    handled = cli_app._handle_fast_local_command(
        [
            "agent-runtimes",
            "save",
            "codex-e2e-agent",
            "--config-json",
            '{"agent_id":"codex-e2e-agent"}',
            "--base-url",
            "http://127.0.0.1:8123",
            "--no-autostart",
        ]
    )

    assert handled is True
    assert requests == [
        (
            "http://127.0.0.1:8123",
            "PUT",
            "/api/system/configs/agent-runtimes/codex-e2e-agent",
            {"agent_id": "codex-e2e-agent"},
        )
    ]
    assert capsys.readouterr().out.strip() == '{"status": "ok"}'


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        (
            [
                "metrics",
                "overview",
                "--scope",
                "workspace",
                "--scope-id",
                "w 1",
                "--window-minutes",
                "30",
                "--format",
                "json",
            ],
            (
                "GET",
                "/api/observability/overview?scope=workspace&scope_id=w+1&time_window_minutes=30",
                None,
            ),
        ),
        (
            ["metrics", "breakdowns", "--format", "json"],
            (
                "GET",
                "/api/observability/breakdowns?scope=global&scope_id=&time_window_minutes=1440",
                None,
            ),
        ),
        (
            ["agent-runtimes", "get", "agent 1", "--format", "json"],
            ("GET", "/api/system/configs/agent-runtimes/agent%201", None),
        ),
        (
            ["agent-runtimes", "delete", "agent 1"],
            ("DELETE", "/api/system/configs/agent-runtimes/agent%201", None),
        ),
        (
            ["agent-runtimes", "test", "agent 1", "--format", "json"],
            ("POST", "/api/system/configs/agent-runtimes/agent%201:test", None),
        ),
        (
            [
                "agent-runtimes",
                "registry",
                "list",
                "--format",
                "json",
                "--refresh",
            ],
            ("GET", "/api/system/configs/agent-runtime-registry?refresh=true", None),
        ),
        (
            ["agent-runtimes", "registry", "refresh", "--format", "json"],
            ("POST", "/api/system/configs/agent-runtime-registry:refresh", None),
        ),
        (
            [
                "agent-runtimes",
                "registry",
                "install",
                "vendor/runtime",
                "--agent-id",
                "vendor_runtime",
                "--distribution",
                "npx",
                "--env-json",
                '{"VENDOR_TOKEN":"from-env"}',
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/system/configs/agent-runtime-registry/vendor%2Fruntime:install",
                {
                    "agent_id": "vendor_runtime",
                    "distribution": "npx",
                    "env": {"VENDOR_TOKEN": "from-env"},
                },
            ),
        ),
        (
            [
                "agent-runtimes",
                "registry",
                "install",
                "vendor/runtime",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/system/configs/agent-runtime-registry/vendor%2Fruntime:install",
                {},
            ),
        ),
        (
            ["approvals", "list", "--run-id", "run 1"],
            ("GET", "/api/runs/run%201/tool-approvals", None),
        ),
        (
            [
                "approvals",
                "resolve",
                "--run-id",
                "run 1",
                "--tool-call-id",
                "tool 1",
                "--action",
                "approved",
                "--feedback",
                "ok",
            ],
            (
                "POST",
                "/api/runs/run%201/tool-approvals/tool%201/resolve",
                {"action": "approved", "feedback": "ok"},
            ),
        ),
        (
            [
                "approvals",
                "resolve",
                "--run-id",
                "run 1",
                "--tool-call-id",
                "tool 1",
                "--action",
                "approve",
                "--option-id",
                "allow",
            ],
            (
                "POST",
                "/api/runs/run%201/tool-approvals/tool%201/resolve",
                {"action": "approve", "feedback": "", "option_id": "allow"},
            ),
        ),
        (
            ["questions", "list", "--run-id", "run 1", "--format", "json"],
            ("GET", "/api/runs/run%201/questions", None),
        ),
        (
            [
                "questions",
                "answer",
                "--run-id",
                "run 1",
                "--question-id",
                "q 1",
                "--answers-json",
                '["yes"]',
            ],
            (
                "POST",
                "/api/runs/run%201/questions/q%201:answer",
                {"answers": ["yes"]},
            ),
        ),
        (
            ["runs", "todo", "--run-id", "run 1", "--format", "json"],
            ("GET", "/api/runs/run%201/todo", None),
        ),
        (
            ["env", "proxy-reload"],
            ("POST", "/api/system/configs/proxy:reload", None),
        ),
        (
            [
                "env",
                "probe-web",
                "https://example.test",
                "--timeout-ms",
                "1200",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/system/configs/web:probe",
                {"url": "https://example.test", "timeout_ms": 1200},
            ),
        ),
        (
            ["clawhub", "config", "get", "--format", "json"],
            ("GET", "/api/system/configs/clawhub", None),
        ),
        (
            ["clawhub", "config", "save", "--clear-token"],
            ("PUT", "/api/system/configs/clawhub", {"token": None}),
        ),
        (
            ["clawhub", "skills", "get", "pptx craft", "--format", "json"],
            ("GET", "/api/system/configs/clawhub/skills/pptx%20craft", None),
        ),
        (
            [
                "clawhub",
                "skills",
                "save",
                "pptx craft",
                "--config-json",
                '{"enabled":true}',
            ],
            (
                "PUT",
                "/api/system/configs/clawhub/skills/pptx%20craft",
                {"enabled": True},
            ),
        ),
        (
            ["clawhub", "skills", "delete", "pptx craft"],
            ("DELETE", "/api/system/configs/clawhub/skills/pptx%20craft", None),
        ),
        (
            [
                "memories",
                "get",
                "--workspace-id",
                "w 1",
                "--memory-id",
                "m 1",
                "--format",
                "json",
            ],
            ("GET", "/api/workspaces/w%201/memories/m%201", None),
        ),
        (
            [
                "memories",
                "search",
                "--workspace-id",
                "w 1",
                "--query",
                "startup",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/workspaces/w%201/memories/search",
                {"workspace_id": "w 1", "text_query": "startup"},
            ),
        ),
        (
            ["roles", "validate"],
            ("POST", "/api/roles:validate", {}),
        ),
    ),
)
def test_fast_server_json_route_maps_supported_commands(
    args: list[str],
    expected: tuple[str, str, dict[str, object] | None],
) -> None:
    assert _FAST_SERVER_JSON_ROUTE(args) == expected


def test_fast_server_json_route_resolves_workspace_for_command_show(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app, "_resolve_fast_workspace_id", lambda args: "workspace 1"
    )

    assert _FAST_SERVER_JSON_ROUTE(
        ["commands", "show", "build docs", "--format", "json"]
    ) == (
        "GET",
        "/api/system/commands/build%20docs?workspace_id=workspace%201",
        None,
    )


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        (
            ["agent-runtimes", "get", "--format", "json", "agent 1"],
            ("GET", "/api/system/configs/agent-runtimes/agent%201", None),
        ),
        (
            ["agent-runtimes", "test", "--format", "json", "agent 1"],
            ("POST", "/api/system/configs/agent-runtimes/agent%201:test", None),
        ),
        (
            ["env", "probe-web", "--format", "json", "https://example.test"],
            (
                "POST",
                "/api/system/configs/web:probe",
                {"url": "https://example.test"},
            ),
        ),
        (
            ["clawhub", "skills", "get", "--format", "json", "pptx craft"],
            ("GET", "/api/system/configs/clawhub/skills/pptx%20craft", None),
        ),
    ),
)
def test_fast_server_json_route_reads_positionals_after_options(
    args: list[str],
    expected: tuple[str, str, dict[str, object] | None],
) -> None:
    assert _FAST_SERVER_JSON_ROUTE(args) == expected


@pytest.mark.parametrize(
    "args",
    (
        ["hooks", "list"],
        ["metrics", "overview"],
        ["metrics", "breakdowns"],
        ["agent-runtimes", "list"],
        ["agent-runtimes", "get", "agent"],
        ["agent-runtimes", "test", "agent"],
        ["agent-runtimes", "test", "agent", "--watch"],
        ["commands", "list"],
        ["commands", "show", "build"],
        ["clawhub", "config", "get"],
        ["clawhub", "skills", "list"],
        ["clawhub", "skills", "get", "skill"],
        ["questions", "list", "--run-id", "run"],
        ["runs", "todo", "--run-id", "run"],
        ["env", "probe-web", "https://example.test"],
        ["memories", "list", "--workspace-id", "workspace"],
        ["memories", "get", "--workspace-id", "workspace", "--memory-id", "memory"],
        ["memories", "create", "--workspace-id", "workspace", "--content", "body"],
        ["memories", "delete", "--workspace-id", "workspace", "--memory-id", "memory"],
        ["memories", "search", "--workspace-id", "workspace", "--query", "body"],
        ["memories", "consolidate", "--workspace-id", "workspace"],
        ["memories", "evolve", "create", "--workspace-id", "workspace"],
        ["memories", "skill-drafts", "list"],
        ["roles", "prompt", "--role-id", "Coordinator"],
        ["gateway", "feishu", "unknown"],
        ["agent-runtimes", "registry", "list"],
        ["agent-runtimes", "registry", "refresh"],
        ["agent-runtimes", "registry", "install", "vendor/runtime"],
    ),
)
def test_fast_server_json_route_returns_none_for_non_json_read_commands(
    args: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app, "_resolve_fast_workspace_id", lambda route_args: "w")

    assert _FAST_SERVER_JSON_ROUTE(args) is None


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        ([], False),
        (["unknown", "list"], False),
        (["hooks", "list"], False),
        (["hooks", "list", "--format", "json"], True),
        (["approvals", "resolve"], True),
        (["agent-runtimes", "get", "agent"], False),
        (["agent-runtimes", "get", "agent", "--format", "json"], True),
        (["agent-runtimes", "test", "agent"], False),
        (["agent-runtimes", "test", "agent", "--format", "json"], True),
        (["agent-runtimes", "test", "agent", "--watch", "--format", "json"], True),
        (["agent-runtimes", "registry", "list"], False),
        (["agent-runtimes", "registry", "list", "--format", "json"], True),
        (["agent-runtimes", "registry", "refresh"], False),
        (["agent-runtimes", "registry", "refresh", "--format", "json"], True),
        (["agent-runtimes", "registry", "install", "vendor/runtime"], False),
        (
            [
                "agent-runtimes",
                "registry",
                "install",
                "vendor/runtime",
                "--format",
                "json",
            ],
            True,
        ),
        (["clawhub", "config", "get"], False),
        (["clawhub", "config", "get", "--format", "json"], True),
        (["clawhub", "skills", "list"], False),
        (["clawhub", "skills", "list", "--format", "json"], True),
        (
            ["memories", "delete", "--workspace-id", "workspace", "--memory-id", "m"],
            False,
        ),
        (["roles", "validate"], True),
        (["roles", "validate", "--format", "json"], True),
        (["memories", "consolidate", "--workspace-id", "workspace"], False),
    ),
)
def test_fast_server_json_candidate_distinguishes_local_json_support(
    args: list[str],
    expected: bool,
) -> None:
    assert _FAST_SERVER_JSON_CANDIDATE(args) is expected


def test_fast_server_json_route_builds_full_role_prompt_payload() -> None:
    assert _FAST_SERVER_JSON_ROUTE(
        [
            "roles",
            "prompt",
            "--role-id",
            "Coordinator",
            "--objective",
            "ship",
            "--tool",
            "shell",
            "--skill",
            "pptx",
            "--shared-state-json",
            '{"mode":"fast"}',
            "--format",
            "json",
        ]
    ) == (
        "POST",
        "/api/prompts:preview",
        {
            "role_id": "Coordinator",
            "shared_state": {"mode": "fast"},
            "objective": "ship",
            "tools": ["shell"],
            "skills": ["pptx"],
        },
    )


@pytest.mark.parametrize(
    ("section", "expected"),
    (
        ("runtime", {"runtime_system_prompt": "runtime"}),
        ("user", {"user_prompt": "user"}),
        ("tools", {"tools": [{"name": "tool"}]}),
        (
            "all",
            {"provider_system_prompt": "provider", "user_prompt": "user"},
        ),
    ),
)
def test_normalize_fast_prompt_sections(
    section: str,
    expected: dict[str, object],
) -> None:
    response = {
        "runtime_system_prompt": "runtime",
        "provider_system_prompt": "provider",
        "user_prompt": "user",
        "tools": [{"name": "tool"}],
    }

    assert (
        _NORMALIZE_FAST_SERVER_JSON_RESPONSE(
            args=["roles", "prompt", "--section", section],
            response=response,
        )
        == expected
    )


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        (
            [
                "memories",
                "evolve",
                "create",
                "--workspace-id",
                "w 1",
                "--memory-id",
                "m 1",
                "--memory-id",
                "m 2",
                "--skill-id",
                "skill 1",
                "--runtime-name",
                "codex",
                "--description",
                "desc",
                "--objective",
                "obj",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/workspaces/w%201/memories/evolutions",
                {
                    "workspace_id": "w 1",
                    "source_memory_ids": ["m 1", "m 2"],
                    "target": "sop_skill",
                    "skill_id": "skill 1",
                    "runtime_name": "codex",
                    "description": "desc",
                    "objective": "obj",
                },
            ),
        ),
        (
            [
                "memories",
                "evolve",
                "list",
                "--workspace-id",
                "w 1",
                "--target",
                "sop_skill",
                "--status",
                "draft",
                "--format",
                "json",
            ],
            (
                "GET",
                "/api/workspaces/w%201/memories/evolutions?target=sop_skill&status=draft",
                None,
            ),
        ),
        (
            [
                "memories",
                "evolve",
                "apply",
                "--workspace-id",
                "w 1",
                "--draft-id",
                "draft 1",
                "--format",
                "json",
            ],
            ("POST", "/api/workspaces/w%201/memories/evolutions/draft%201:apply", {}),
        ),
        (
            [
                "memories",
                "evolve",
                "reject",
                "--workspace-id",
                "w 1",
                "--draft-id",
                "draft 1",
                "--reason",
                "nope",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/workspaces/w%201/memories/evolutions/draft%201:reject",
                {"reason": "nope"},
            ),
        ),
    ),
)
def test_fast_memory_evolve_routes(
    args: list[str],
    expected: tuple[str, str, dict[str, object] | None],
) -> None:
    assert _FAST_SERVER_JSON_ROUTE(args) == expected


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        (
            [
                "memories",
                "skill-drafts",
                "generate",
                "--workspace-id",
                "w 1",
                "--kind",
                "manual",
                "--query",
                "slides",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/memories/skill-drafts:generate",
                {
                    "scope_kind": "workspace",
                    "draft_kind": "manual",
                    "workspace_id": "w 1",
                    "text_query": "slides",
                },
            ),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "generate",
                "--cross-workspace",
                "--workspace-id",
                "w 1",
                "--format",
                "json",
            ],
            (
                "POST",
                "/api/memories/skill-drafts:generate",
                {
                    "scope_kind": "cross_workspace",
                    "draft_kind": "auto",
                    "workspace_ids": ["w 1"],
                },
            ),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "list",
                "--workspace-id",
                "w 1",
                "--status",
                "ready",
                "--format",
                "json",
            ],
            ("GET", "/api/memories/skill-drafts?workspace_id=w+1&status=ready", None),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "get",
                "--draft-id",
                "draft 1",
                "--format",
                "json",
            ],
            ("GET", "/api/memories/skill-drafts/draft%201", None),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "update",
                "--draft-id",
                "draft 1",
                "--runtime-name",
                "codex",
                "--description",
                "desc",
                "--instructions",
                "inst",
                "--status",
                "ready",
                "--format",
                "json",
            ],
            (
                "PUT",
                "/api/memories/skill-drafts/draft%201",
                {
                    "runtime_name": "codex",
                    "description": "desc",
                    "instructions": "inst",
                    "status": "ready",
                },
            ),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "validate",
                "--draft-id",
                "draft 1",
                "--format",
                "json",
            ],
            ("POST", "/api/memories/skill-drafts/draft%201:validate", None),
        ),
        (
            [
                "memories",
                "skill-drafts",
                "apply",
                "--draft-id",
                "draft 1",
                "--format",
                "json",
            ],
            ("POST", "/api/memories/skill-drafts/draft%201:apply", None),
        ),
    ),
)
def test_fast_memory_skill_draft_routes(
    args: list[str],
    expected: tuple[str, str, dict[str, object] | None],
) -> None:
    assert _FAST_SERVER_JSON_ROUTE(args) == expected


@pytest.mark.parametrize(
    ("args", "expected"),
    (
        (
            ["gateway", "feishu", "list"],
            ("GET", "/api/gateway/feishu/accounts", None),
        ),
        (
            ["gateway", "feishu", "create", "--payload-json", '{"name":"main"}'],
            ("POST", "/api/gateway/feishu/accounts", {"name": "main"}),
        ),
        (
            [
                "gateway",
                "wechat",
                "connect",
                "--bot-type",
                "4",
                "--wechat-base-url",
                "http://wechat.test",
                "--route-tag",
                "dev",
            ],
            (
                "POST",
                "/api/gateway/wechat/login/start",
                {"bot_type": "4", "base_url": "http://wechat.test", "route_tag": "dev"},
            ),
        ),
        (
            [
                "gateway",
                "wechat",
                "wait",
                "--session-key",
                "session 1",
                "--timeout-ms",
                "15",
            ],
            (
                "POST",
                "/api/gateway/wechat/login/wait",
                {"session_key": "session 1", "timeout_ms": 15},
            ),
        ),
        (
            [
                "gateway",
                "feishu",
                "update",
                "--account-id",
                "account 1",
                "--payload-json",
                '{"enabled":true}',
            ],
            ("PATCH", "/api/gateway/feishu/accounts/account%201", {"enabled": True}),
        ),
        (
            ["gateway", "feishu", "enable", "--account-id", "account 1"],
            ("POST", "/api/gateway/feishu/accounts/account%201:enable", None),
        ),
        (
            ["gateway", "feishu", "disable", "--account-id", "account 1"],
            ("POST", "/api/gateway/feishu/accounts/account%201:disable", None),
        ),
        (
            ["gateway", "feishu", "delete", "--account-id", "account 1"],
            ("DELETE", "/api/gateway/feishu/accounts/account%201", {"force": True}),
        ),
        (
            [
                "gateway",
                "wechat",
                "delete",
                "--account-id",
                "account 1",
                "--no-force-delete",
            ],
            ("DELETE", "/api/gateway/wechat/accounts/account%201", {"force": False}),
        ),
        (
            [
                "gateway",
                "wechat",
                "delete",
                "--account-id",
                "account 1",
                "--force-delete",
                "--no-force-delete",
            ],
            ("DELETE", "/api/gateway/wechat/accounts/account%201", {"force": False}),
        ),
        (
            ["gateway", "wechat", "reload"],
            ("POST", "/api/gateway/wechat/reload", None),
        ),
    ),
)
def test_fast_gateway_routes(
    args: list[str],
    expected: tuple[str, str, dict[str, object] | None],
) -> None:
    assert _FAST_SERVER_JSON_ROUTE(args) == expected


@pytest.mark.parametrize(
    ("args", "expected_error"),
    (
        (["approvals", "list"], "Missing option '--run-id'."),
        (
            ["agent-runtimes", "save", "agent", "--config-json", "[]"],
            "--config-json must be a JSON object",
        ),
        (
            [
                "questions",
                "answer",
                "--run-id",
                "run",
                "--question-id",
                "q",
                "--answers-json",
                "{}",
            ],
            "--answers-json must be a JSON array",
        ),
        (
            [
                "env",
                "probe-web",
                "https://example.test",
                "--timeout-ms",
                "soon",
                "--format",
                "json",
            ],
            "Invalid value for '--timeout-ms'",
        ),
        (
            ["gateway", "wechat", "wait", "--session-key", "s", "--timeout-ms", "soon"],
            "Invalid value for '--timeout-ms'",
        ),
        (
            ["clawhub", "config", "save", "--clear-token", "--token", "secret"],
            "cannot be used together",
        ),
    ),
)
def test_fast_server_json_route_reports_option_errors(
    args: list[str],
    expected_error: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        _FAST_SERVER_JSON_ROUTE(args)

    assert exc_info.value.code == 2
    assert expected_error in capsys.readouterr().err


def test_root_message_uses_fast_prompt_path_without_full_cli(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []
    streamed: list[tuple[str, str]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/pick":
            return {"workspace": {"workspace_id": "workspace-1"}}
        if path == "/api/sessions":
            return {"session_id": "session-1"}
        if path == "/api/runs":
            return {"run_id": "run-1"}
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    monkeypatch.setattr(
        cli_app,
        "_stream_fast_prompt_events",
        lambda *, base_url, run_id: streamed.append((base_url, run_id)),
    )
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    handled = cli_app._handle_fast_local_command(["-m", "你好啊", "--no-yolo"])

    assert handled is True
    assert requests == [
        (
            "http://127.0.0.1:8000",
            "POST",
            "/api/workspaces/pick",
            {"root_path": str(Path.cwd().resolve())},
        ),
        (
            "http://127.0.0.1:8000",
            "POST",
            "/api/sessions",
            {"workspace_id": "workspace-1"},
        ),
        (
            "http://127.0.0.1:8000",
            "POST",
            "/api/runs",
            {
                "session_id": "session-1",
                "input": [{"kind": "text", "text": "你好啊"}],
                "execution_mode": "ai",
                "yolo": False,
            },
        ),
    ]
    assert streamed == [("http://127.0.0.1:8000", "run-1")]
    assert capsys.readouterr().out == "\n"


def test_root_message_fast_path_resolves_slash_command(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/pick":
            return {"workspace": {"workspace_id": "workspace-1"}}
        if path == "/api/system/commands:resolve":
            return {"matched": True, "expanded_prompt": "expanded prompt"}
        if path == "/api/sessions":
            return {"session_id": "session-1"}
        if path == "/api/runs":
            return {"run_id": "run-1"}
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    monkeypatch.setattr(cli_app, "_stream_fast_prompt_events", lambda **_kwargs: None)

    handled = cli_app._handle_fast_local_command(
        ["--message", "/build", "--base-url", "http://127.0.0.1:8123"]
    )

    assert handled is True
    assert requests[1] == (
        "http://127.0.0.1:8123",
        "POST",
        "/api/system/commands:resolve",
        {
            "workspace_id": "workspace-1",
            "raw_text": "/build",
            "mode": "normal",
            "cwd": str(Path.cwd().resolve()),
        },
    )
    assert requests[3][3] == {
        "session_id": "session-1",
        "input": [{"kind": "text", "text": "expanded prompt"}],
        "execution_mode": "ai",
        "yolo": True,
    }
    assert capsys.readouterr().out == "\n"


def test_root_message_fast_path_sends_model_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/pick":
            return {"workspace": {"workspace_id": "workspace-1"}}
        if path == "/api/sessions":
            return {"session_id": "session-1"}
        if path == "/api/runs":
            return {"run_id": "run-1"}
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    monkeypatch.setattr(cli_app, "_stream_fast_prompt_events", lambda **_kwargs: None)

    handled = cli_app._handle_fast_local_command(["-m", "hello", "--model", "precise"])

    assert handled is True
    assert requests[-1] == (
        "http://127.0.0.1:8000",
        "POST",
        "/api/runs",
        {
            "session_id": "session-1",
            "input": [{"kind": "text", "text": "hello"}],
            "execution_mode": "ai",
            "yolo": True,
            "normal_model_profile": "precise",
        },
    )


def test_root_message_fast_path_configures_role_and_workspace(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/pick":
            return {"workspace": {"workspace_id": "workspace-1"}}
        if path == "/api/sessions":
            return {"session_id": "session-1"}
        if path.endswith("/topology"):
            return {"session_id": "session-1"}
        if path == "/api/runs":
            return {"run_id": "run-1"}
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    monkeypatch.setattr(cli_app, "_stream_fast_prompt_events", lambda **_kwargs: None)

    assert cli_app._handle_fast_local_command(
        [
            "-m",
            "hi",
            "--workspace",
            str(tmp_path),
            "--role",
            "developer",
        ]
    )

    assert requests[0][3] == {"root_path": str(tmp_path.resolve())}
    assert requests[2] == (
        "http://127.0.0.1:8000",
        "PATCH",
        "/api/sessions/session-1/topology",
        {
            "session_mode": "normal",
            "normal_root_role_id": "developer",
            "orchestration_preset_id": None,
        },
    )


def test_root_message_fast_path_autostarts_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started: list[tuple[str, int]] = []
    probes = [False, True]

    def fake_health_probe(*, host: str, port: int) -> bool:
        _ = host, port
        return probes.pop(0)

    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", fake_health_probe)
    monkeypatch.setattr(
        cli_app,
        "_start_server_daemon",
        lambda *, host, port: started.append((host, port)),
    )
    monkeypatch.setattr(
        cli_app,
        "_wait_until_healthy",
        lambda *, host, port, timeout_seconds: True,
    )
    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: {"workspace": {"workspace_id": "workspace-1"}},
    )
    monkeypatch.setattr(cli_app, "_stream_fast_prompt_events", lambda **_kwargs: None)

    with pytest.raises(RuntimeError, match="session_id"):
        cli_app._handle_fast_local_command(["-m", "hi"])

    assert started == [("127.0.0.1", 8000)]


@pytest.mark.parametrize(
    ("args", "expected_error"),
    (
        (["-m"], "-m requires a value"),
        (["-m", ""], "message must not be empty"),
        (["-m", "hi", "--mode", "bad"], "--mode must be normal or orchestration"),
        (["-m", "hi", "--role", ""], "--role must not be empty"),
        (["-m", "hi", "--orchestration", ""], "--orchestration must not be empty"),
        (["-m", "hi", "--model", ""], "--model must not be empty"),
        (
            ["-m", "hi", "--mode", "orchestration", "--role", "dev"],
            "--role can only be used with --mode normal",
        ),
        (
            ["-m", "hi", "--mode", "normal", "--orchestration", "preset"],
            "--orchestration can only be used with --mode orchestration",
        ),
        (
            ["-m", "hi", "--mode", "orchestration", "--model", "precise"],
            "--model can only be used with --mode normal",
        ),
    ),
)
def test_fast_prompt_argument_errors(
    args: list[str],
    expected_error: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exc_info:
        _PARSE_FAST_PROMPT_ARGS(args)

    assert exc_info.value.code == 2
    assert expected_error in capsys.readouterr().err


def test_fast_prompt_parses_inline_model_profile() -> None:
    options = _PARSE_FAST_PROMPT_ARGS(["-m", "hello", "--model=precise"])

    assert options.message == "hello"
    assert options.model_profile == "precise"


def test_fast_prompt_rejects_non_local_autostart(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    options = SimpleNamespace(
        message="hi",
        mode="normal",
        role_id=None,
        orchestration_id=None,
        workspace=None,
        yolo=True,
        daemon=False,
        force=False,
        no_autostart=False,
        base_url="http://relay.example.test:8000",
    )
    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: False)

    with pytest.raises(SystemExit) as exc_info:
        _ENSURE_FAST_PROMPT_SERVER(options)

    assert exc_info.value.code == 1
    assert "Refusing to autostart" in capsys.readouterr().err


def test_fast_prompt_force_clears_existing_process_before_autostart(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    terminated: list[tuple[int, bool]] = []
    cleared: list[bool] = []
    started: list[tuple[str, int]] = []
    options = SimpleNamespace(
        message="hi",
        mode="normal",
        role_id=None,
        orchestration_id=None,
        workspace=None,
        yolo=True,
        daemon=False,
        force=True,
        no_autostart=False,
        base_url="http://127.0.0.1:8000",
    )
    monkeypatch.setattr(cli_app, "_is_agent_teams_healthy", lambda *, host, port: False)
    monkeypatch.setattr(cli_app, "_read_server_process", lambda: {"pid": 1234})
    monkeypatch.setattr(
        cli_app,
        "_terminate_process_tree",
        lambda pid, *, force: terminated.append((pid, force)),
    )
    monkeypatch.setattr(cli_app, "_clear_server_process", lambda: cleared.append(True))
    monkeypatch.setattr(
        cli_app,
        "_start_server_daemon",
        lambda *, host, port: started.append((host, port)),
    )
    monkeypatch.setattr(
        cli_app, "_wait_until_healthy", lambda *, host, port, timeout_seconds: True
    )

    _ENSURE_FAST_PROMPT_SERVER(options)

    assert terminated == [(1234, True)]
    assert cleared == [True]
    assert started == [("127.0.0.1", 8000)]


def test_fast_prompt_workspace_and_command_error_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    options = SimpleNamespace(
        message="/build",
        mode="normal",
        role_id=None,
        orchestration_id=None,
        workspace=None,
        yolo=True,
        daemon=False,
        force=False,
        base_url="http://127.0.0.1:8000",
    )

    monkeypatch.setattr(cli_app, "_http_request_json", lambda **_kwargs: {})
    with pytest.raises(RuntimeError, match="workspace"):
        _RESOLVE_FAST_PROMPT_WORKSPACE_ID(options)

    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: {"workspace": {"workspace_id": "w"}},
    )
    assert _RESOLVE_FAST_PROMPT_WORKSPACE_ID(options) == "w"

    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: {"matched": False},
    )
    assert (
        _RESOLVE_FAST_PROMPT_SLASH_COMMAND(
            message="/build", workspace_id="w", options=options
        )
        == "/build"
    )
    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: {"matched": True, "expanded_prompt": ""},
    )
    assert (
        _RESOLVE_FAST_PROMPT_SLASH_COMMAND(
            message="/build", workspace_id="w", options=options
        )
        == "/build"
    )


def test_fast_prompt_orchestration_topology_and_stop_request(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, dict[str, object] | None]] = []

    def fake_request_json(**kwargs: object) -> object:
        payload = kwargs.get("payload")
        if not isinstance(payload, dict):
            payload = None
        requests.append((str(kwargs["path"]), payload))
        return {}

    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)
    options = SimpleNamespace(
        message="hi",
        mode="orchestration",
        role_id=None,
        orchestration_id="preset",
        workspace=None,
        yolo=True,
        daemon=False,
        force=False,
        base_url="http://127.0.0.1:8000",
    )

    _CONFIGURE_FAST_PROMPT_TOPOLOGY(session_id="session", options=options)
    _REQUEST_FAST_PROMPT_RUN_STOP(base_url=options.base_url, run_id="run 1")

    assert requests[0] == (
        "/api/sessions/session/topology",
        {"session_mode": "orchestration", "orchestration_preset_id": "preset"},
    )
    assert requests[1] == ("/api/runs/run%201/stop", {"scope": "main"})
    assert "Run stop requested." in capsys.readouterr().err


def test_fast_prompt_stream_and_json_helpers_error_paths(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(RuntimeError, match="boom"):
        _HANDLE_FAST_PROMPT_STREAM_LINE('data: {"error":"boom"}')
    assert _HANDLE_FAST_PROMPT_STREAM_LINE("data:") is False
    assert _JSON_OBJECT_FROM_STRING("") == {}
    assert _JSON_OBJECT_FROM_STRING("[1]") == {}
    with pytest.raises(RuntimeError, match="Expected JSON object"):
        _REQUIRE_JSON_OBJECT([], "demo")
    with pytest.raises(RuntimeError, match="must be a string"):
        _REQUIRE_JSON_STRING({}, "id")

    monkeypatch.setattr(
        cli_app,
        "_http_request_json",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    _REQUEST_FAST_PROMPT_RUN_STOP(base_url="http://127.0.0.1:8000", run_id="r")
    assert "failed to request run stop" in capsys.readouterr().err


def test_fast_prompt_stream_line_prints_text_delta(
    capsys: pytest.CaptureFixture[str],
) -> None:
    done = _HANDLE_FAST_PROMPT_STREAM_LINE(
        'data: {"event_type":"text_delta","payload_json":"{\\"text\\":\\"hi\\"}"}'
    )

    assert done is False
    assert capsys.readouterr().out == "hi"


def test_fast_prompt_stream_events_reads_sse_until_completion(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    class FakeSseResponse:
        status = 200

        def __init__(self) -> None:
            self.lines = [
                b": keepalive\n",
                b'data: {"event_type":"text_delta","payload_json":"{\\"text\\":\\"hi\\"}"}\n',
                b'data: {"event_type":"run_completed","payload_json":"{}"}\n',
            ]

        def readline(self) -> bytes:
            if not self.lines:
                return b""
            return self.lines.pop(0)

        def read(self) -> bytes:
            return b""

    class FakeConnection:
        instances: list[FakeConnection] = []

        def __init__(self, address: str, port: int, timeout: float) -> None:
            self.address = address
            self.port = port
            self.timeout = timeout
            self.requests: list[tuple[str, str, dict[str, str]]] = []
            self.closed = False
            FakeConnection.instances.append(self)

        def request(
            self,
            method: str,
            path: str,
            *,
            headers: dict[str, str],
        ) -> None:
            self.requests.append((method, path, headers))

        def getresponse(self) -> FakeSseResponse:
            return FakeSseResponse()

        def close(self) -> None:
            self.closed = True

    monkeypatch.setattr(http.client, "HTTPConnection", FakeConnection)
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.delenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, raising=False)

    _STREAM_FAST_PROMPT_EVENTS(base_url="http://0.0.0.0:8000/root", run_id="run 1")

    connection = FakeConnection.instances[0]
    assert (connection.address, connection.port, connection.timeout) == (
        "127.0.0.1",
        8000,
        600.0,
    )
    assert connection.requests == [
        (
            "GET",
            "/root/api/runs/run%201/events",
            {
                "Host": "127.0.0.1:8000",
                "Accept": "text/event-stream",
            },
        )
    ]
    assert connection.closed is True
    assert capsys.readouterr().out == "hi"


def test_fast_prompt_stream_events_uses_configured_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSseResponse:
        status = 200

        def readline(self) -> bytes:
            return b'data: {"event_type":"run_completed","payload_json":"{}"}\n'

        def read(self) -> bytes:
            return b""

    class FakeConnection:
        instances: list[FakeConnection] = []

        def __init__(self, address: str, port: int, timeout: float) -> None:
            self.address = address
            self.port = port
            self.timeout = timeout
            self.requests: list[tuple[str, str, dict[str, str]]] = []
            FakeConnection.instances.append(self)

        def request(
            self,
            method: str,
            path: str,
            *,
            headers: dict[str, str],
        ) -> None:
            self.requests.append((method, path, headers))

        def getresponse(self) -> FakeSseResponse:
            return FakeSseResponse()

        def close(self) -> None:
            pass

    monkeypatch.setattr(http.client, "HTTPConnection", FakeConnection)
    monkeypatch.setenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, "1800")

    _STREAM_FAST_PROMPT_EVENTS(base_url="http://127.0.0.1:8000", run_id="run-1")

    assert FakeConnection.instances[0].timeout == 1800.0


def test_fast_prompt_stream_events_uses_app_env_timeout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSseResponse:
        status = 200

        def readline(self) -> bytes:
            return b'data: {"event_type":"run_completed","payload_json":"{}"}\n'

        def read(self) -> bytes:
            return b""

    class FakeConnection:
        instances: list[FakeConnection] = []

        def __init__(self, address: str, port: int, timeout: float) -> None:
            self.address = address
            self.port = port
            self.timeout = timeout
            FakeConnection.instances.append(self)

        def request(
            self,
            method: str,
            path: str,
            *,
            headers: dict[str, str],
        ) -> None:
            pass

        def getresponse(self) -> FakeSseResponse:
            return FakeSseResponse()

        def close(self) -> None:
            pass

    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / ".env").write_text(
        f"{cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV}=1800\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(http.client, "HTTPConnection", FakeConnection)
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.delenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, raising=False)

    _STREAM_FAST_PROMPT_EVENTS(base_url="http://127.0.0.1:8000", run_id="run-1")

    assert FakeConnection.instances[0].timeout == 1800.0


def test_fast_prompt_stream_timeout_process_env_overrides_app_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / ".env").write_text(
        f"{cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV}=1800\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, "1200")

    assert cli_app._resolve_fast_prompt_stream_timeout_seconds() == 1200.0


def test_fast_prompt_stream_timeout_process_env_skips_invalid_app_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / ".env").write_bytes(b"\xff")
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, "1200")

    assert cli_app._resolve_fast_prompt_stream_timeout_seconds() == 1200.0


def test_fast_prompt_stream_timeout_defaults_when_app_env_invalid(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / ".env").write_text(
        f"{cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV}=not-a-number\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.delenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, raising=False)

    assert (
        cli_app._resolve_fast_prompt_stream_timeout_seconds()
        == cli_app.DEFAULT_FAST_PROMPT_STREAM_TIMEOUT_SECONDS
    )


@pytest.mark.parametrize(
    "raw_value",
    [" ", "not-a-number", "0", "-1", "nan", "inf"],
)
def test_fast_prompt_stream_timeout_defaults_when_invalid(
    raw_value: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(cli_app.FAST_PROMPT_STREAM_TIMEOUT_SECONDS_ENV, raw_value)

    assert (
        cli_app._resolve_fast_prompt_stream_timeout_seconds()
        == cli_app.DEFAULT_FAST_PROMPT_STREAM_TIMEOUT_SECONDS
    )


def test_fast_prompt_stream_events_delegates_when_proxy_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delegated: list[bool] = []

    monkeypatch.setattr(cli_app, "_base_url_requires_proxy", lambda **_kwargs: True)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(SystemExit(7)),
    )

    with pytest.raises(SystemExit) as exc_info:
        _STREAM_FAST_PROMPT_EVENTS(base_url="https://relay.test", run_id="run-1")
    delegated.append(True)

    assert exc_info.value.code == 7
    assert delegated == [True]


def test_fast_prompt_stream_events_brackets_ipv6_host_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSseResponse:
        status = 200

        def readline(self) -> bytes:
            return b'data: {"event_type":"run_completed","payload_json":"{}"}\n'

        def read(self) -> bytes:
            return b""

    class FakeConnection:
        instances: list[FakeConnection] = []

        def __init__(self, address: str, port: int, timeout: float) -> None:
            self.address = address
            self.port = port
            self.timeout = timeout
            self.requests: list[tuple[str, str, dict[str, str]]] = []
            FakeConnection.instances.append(self)

        def request(
            self,
            method: str,
            path: str,
            *,
            headers: dict[str, str],
        ) -> None:
            self.requests.append((method, path, headers))

        def getresponse(self) -> FakeSseResponse:
            return FakeSseResponse()

        def close(self) -> None:
            pass

    monkeypatch.setattr(cli_app, "_base_url_requires_proxy", lambda **_kwargs: False)
    monkeypatch.setattr(http.client, "HTTPConnection", FakeConnection)

    _STREAM_FAST_PROMPT_EVENTS(base_url="http://[::1]:8000", run_id="run-1")

    connection = FakeConnection.instances[0]
    assert (connection.address, connection.port) == ("::1", 8000)
    assert connection.requests[0][2]["Host"] == "[::1]:8000"


def test_skills_show_uses_fast_local_discovery(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / ".relay-teams"
    skill_dir = tmp_path / ".codex" / "skills" / "pptx-craft"
    skill_dir.mkdir(parents=True)
    (skill_dir / "resources").mkdir()
    (skill_dir / "resources" / "template.md").write_text("template", encoding="utf-8")
    (skill_dir / "scripts").mkdir()
    (skill_dir / "scripts" / "build.py").write_text("print('ok')\n", encoding="utf-8")
    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: pptx-craft\n"
        "description: Build PowerPoint decks\n"
        "resources:\n"
        "  guide:\n"
        "    description: Deck guide\n"
        "    path: resources/template.md\n"
        "---\n"
        "Use this skill for deck work.\n\n"
        "- build: Build a deck (scripts/build.py)\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(AssertionError("full CLI should not load")),
    )

    assert cli_app._handle_fast_local_command(
        ["skills", "show", "pptx-craft", "--format", "json"]
    )

    payload = json.loads(capsys.readouterr().out)
    assert payload["name"] == "pptx-craft"
    assert payload["source"] == "user_codex"
    assert payload["instructions"].startswith("Use this skill for deck work.")
    assert {row["name"] for row in payload["resources"]} == {
        "guide",
        "scripts/build.py",
        "template.md",
    }
    assert payload["scripts"] == [
        {
            "name": "build",
            "description": "Build a deck",
            "path": (skill_dir / "scripts" / "build.py").resolve().as_posix(),
        }
    ]


def test_skills_show_renders_table_detail(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / ".relay-teams"
    skill_dir = tmp_path / ".codex" / "skills" / "pptx-craft"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: pptx-craft\n"
        "description: Build PowerPoint decks\n"
        "---\n"
        "Use this skill for deck work.\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(["skills", "show", "pptx-craft"])

    output = capsys.readouterr().out
    assert "Skill" in output
    assert "Resources" in output
    assert "Scripts" in output
    assert "Instructions" in output


def test_env_list_fast_path_includes_masked_secret_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setattr(
        cli_app,
        "_load_fast_secret_env_vars",
        lambda _config_dir: {"RELAY_TEAMS_API_TOKEN": "secret"},
    )

    assert cli_app._handle_fast_local_command(["env", "list", "--format", "json"])

    payload = json.loads(capsys.readouterr().out)
    entry = next(item for item in payload if item["key"] == "RELAY_TEAMS_API_TOKEN")
    assert entry == {
        "key": "RELAY_TEAMS_API_TOKEN",
        "value": "<masked>",
        "source": "app",
        "masked": True,
    }


def test_env_list_fast_path_reads_file_backed_app_secrets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    (config_dir / "secrets.json").write_text(
        json.dumps(
            {
                "version": 1,
                "entries": [
                    {
                        "namespace": "app_env",
                        "owner_id": "app",
                        "field_name": "RELAY_TEAMS_API_TOKEN",
                        "storage": "file",
                        "value": "secret",
                    },
                    {
                        "namespace": "other",
                        "owner_id": "app",
                        "field_name": "OTHER_TOKEN",
                        "storage": "file",
                        "value": "ignored",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(
        ["env", "list", "--format", "json", "--show-secrets"]
    )

    payload = json.loads(capsys.readouterr().out)
    entry = next(item for item in payload if item["key"] == "RELAY_TEAMS_API_TOKEN")
    assert entry == {
        "key": "RELAY_TEAMS_API_TOKEN",
        "value": "secret",
        "source": "app",
        "masked": False,
    }
    assert all(item["key"] != "OTHER_TOKEN" for item in payload)


def test_env_list_fast_path_reads_keyring_backed_app_secrets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    class FakeKeyring:
        def get_password(self, service_name: str, account_name: str) -> str | None:
            assert service_name == "agent-teams"
            assert account_name == (
                f"{config_dir.resolve()}::app_env::app::RELAY_TEAMS_API_TOKEN"
            )
            return "secret"

    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    (config_dir / "secrets.json").write_text(
        json.dumps(
            {
                "version": 1,
                "entries": [
                    {
                        "namespace": "app_env",
                        "owner_id": "app",
                        "field_name": "RELAY_TEAMS_API_TOKEN",
                        "storage": "keyring",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setattr(cli_app, "keyring", FakeKeyring())

    assert cli_app._handle_fast_local_command(["env", "list", "--format", "json"])

    payload = json.loads(capsys.readouterr().out)
    entry = next(item for item in payload if item["key"] == "RELAY_TEAMS_API_TOKEN")
    assert entry == {
        "key": "RELAY_TEAMS_API_TOKEN",
        "value": "<masked>",
        "source": "app",
        "masked": True,
    }


def test_env_list_reads_env_file_and_renders_table(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config_dir = tmp_path / ".relay-teams"
    config_dir.mkdir()
    (config_dir / ".env").write_text(
        "VISIBLE=value\n"
        'QUOTED="quoted value"\n'
        "SECRET_TOKEN='secret'\n"
        "# ignored\n"
        "bad-line\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))
    monkeypatch.setenv("VISIBLE_PROCESS", "process")
    monkeypatch.setattr(cli_app, "_load_fast_secret_env_vars", lambda _config_dir: {})

    assert cli_app._handle_fast_local_command(
        ["env", "list", "--prefix", "VISIBLE", "--show-secrets"]
    )

    output = capsys.readouterr().out
    assert "Environment Variables" in output
    assert "VISIBLE" in output
    assert "VISIBLE_PROCESS" in output
    assert "SECRET_TOKEN" not in output


def test_mcp_add_fast_path_splits_command_option_like_full_cli(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert cli_app._handle_fast_local_command(
        [
            "mcp",
            "add",
            "filesystem",
            "--command",
            "npx -y @modelcontextprotocol/server-filesystem",
            "--arg",
            str(tmp_path),
        ]
    )

    payload = json.loads((config_dir / "mcp.json").read_text(encoding="utf-8"))
    assert payload["mcpServers"]["filesystem"]["command"] == "npx"
    assert payload["mcpServers"]["filesystem"]["args"] == [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        str(tmp_path),
    ]


def test_plugin_install_fast_path_falls_back_for_git_sources() -> None:
    assert (
        cli_app._handle_fast_plugin(
            ["install", "https://github.com/example/plugin.git"]
        )
        is False
    )


def test_plugin_install_fast_path_falls_back_for_clawhub_marketplace() -> None:
    assert (
        cli_app._handle_fast_plugin(
            [
                "install",
                "demo-plugin",
                "--marketplace",
                "clawhub",
                "--marketplace-provider",
                "clawhub",
            ]
        )
        is False
    )


def test_plugin_available_list_falls_back_for_non_local_marketplace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_full_cli() -> None:
        raise SystemExit(0)

    monkeypatch.setattr(cli_app, "_run_full_cli", fake_full_cli)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(
            [
                "list",
                "--available",
                "--marketplace",
                "clawhub",
                "--marketplace-provider",
                "clawhub",
            ]
        )

    assert exc_info.value.code == 0


def test_server_start_on_free_port_does_not_probe_health_before_binding(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    command: list[str] = []
    writes: list[tuple[str, int, int | None]] = []
    cleared: list[bool] = []
    fake_process = _FakeForegroundProcess()

    def fake_popen(args: list[str]) -> _FakeForegroundProcess:
        command.extend(args)
        return fake_process

    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: True)
    monkeypatch.setattr(
        cli_app,
        "_is_agent_teams_healthy",
        lambda *, host, port: (_ for _ in ()).throw(
            AssertionError("health should not be probed on a free port")
        ),
    )
    monkeypatch.setattr(cli_app.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(
        cli_app,
        "_write_server_process",
        lambda *, host, port, pid=None: writes.append((host, port, pid)),
    )
    monkeypatch.setattr(cli_app, "_clear_server_process", lambda: cleared.append(True))

    cli_app._server_start(["--host", "127.0.0.1", "--port", "8123"])

    assert fake_process.waited is True
    assert command[:3] == [cli_app.sys.executable, "-m", "uvicorn"]
    assert "relay_teams.interfaces.server.app:app" in command
    assert writes == [("127.0.0.1", 8123, None), ("127.0.0.1", 8123, 43210)]
    assert cleared == [True]
    assert "Starting Agent Teams server" in capsys.readouterr().out


def test_server_start_propagates_child_process_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_process = _FakeForegroundProcess(return_code=1)
    cleared: list[bool] = []

    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: True)
    monkeypatch.setattr(cli_app.subprocess, "Popen", lambda _args: fake_process)
    monkeypatch.setattr(cli_app, "_write_server_process", lambda **_kwargs: None)
    monkeypatch.setattr(cli_app, "_clear_server_process", lambda: cleared.append(True))

    with pytest.raises(SystemExit) as exc_info:
        cli_app._server_start(["--host", "127.0.0.1", "--port", "8123"])

    assert exc_info.value.code == 1
    assert fake_process.waited is True
    assert cleared == [True]


def test_server_start_daemon_waits_for_health_and_reports_pid(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    started: list[tuple[str, int]] = []
    waited: list[tuple[str, int, float]] = []
    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: True)
    monkeypatch.setattr(
        cli_app,
        "_start_server_daemon",
        lambda *, host, port: started.append((host, port)),
    )
    monkeypatch.setattr(
        cli_app,
        "_wait_until_healthy",
        lambda *, host, port, timeout_seconds: (
            waited.append((host, port, timeout_seconds)) or True
        ),
    )
    monkeypatch.setattr(cli_app, "_read_server_process", lambda: {"pid": 2468})

    cli_app._server_start(["--host", "127.0.0.1", "--port", "8123", "--daemon"])

    assert started == [("127.0.0.1", 8123)]
    assert waited == [("127.0.0.1", 8123, 20.0)]
    assert "pid 2468" in capsys.readouterr().out


def test_server_start_daemon_raises_when_health_never_arrives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: True)
    monkeypatch.setattr(cli_app, "_start_server_daemon", lambda *, host, port: None)
    monkeypatch.setattr(
        cli_app,
        "_wait_until_healthy",
        lambda *, host, port, timeout_seconds: False,
    )

    with pytest.raises(RuntimeError, match="Failed to start Agent Teams server"):
        cli_app._server_start(["--host", "127.0.0.1", "--port", "8123", "--daemon"])


def test_server_restart_stops_then_starts_daemon(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_stop(args: list[str]) -> None:
        calls.append(("stop", args))

    def fake_start(args: list[str]) -> None:
        calls.append(("start", args))

    monkeypatch.setattr(cli_app, "_server_stop", fake_stop)
    monkeypatch.setattr(cli_app, "_server_start", fake_start)

    cli_app._server_restart(["--host", "127.0.0.1", "--port", "8123", "--force"])

    assert calls == [
        ("stop", ["--host", "127.0.0.1", "--port", "8123", "--force"]),
        ("start", ["--host", "127.0.0.1", "--port", "8123", "--daemon"]),
    ]


def test_server_restart_reraises_failed_stop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_server_stop",
        lambda _args: (_ for _ in ()).throw(SystemExit(1)),
    )
    monkeypatch.setattr(
        cli_app,
        "_server_start",
        lambda _args: (_ for _ in ()).throw(AssertionError("start should not run")),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._server_restart(["--host", "127.0.0.1", "--port", "8123"])

    assert exc_info.value.code == 1


def test_server_start_ctrl_c_exits_without_keyboard_interrupt_traceback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    terminated: list[tuple[int, bool]] = []
    fake_process = _KeyboardInterruptProcess()

    def fake_popen(args: list[str]) -> _KeyboardInterruptProcess:
        assert "relay_teams.interfaces.server.app:app" in args
        return fake_process

    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: True)
    monkeypatch.setattr(cli_app.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(cli_app, "_write_server_process", lambda **_kwargs: None)
    monkeypatch.setattr(cli_app, "_clear_server_process", lambda: None)
    monkeypatch.setattr(
        cli_app,
        "_terminate_process_tree",
        lambda pid, *, force: terminated.append((pid, force)),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._server_start(["--host", "127.0.0.1", "--port", "8123"])

    assert exc_info.value.code == 130
    assert terminated == [(43211, False)]
    assert fake_process.wait_calls == 2


def test_server_start_reports_already_running_agent_teams(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: False)
    monkeypatch.setattr(cli_app, "_is_agent_teams_live", lambda *, host, port: True)
    monkeypatch.setattr(
        cli_app,
        "_find_tcp_listen_pid",
        lambda *, host, port: (_ for _ in ()).throw(
            AssertionError("pid lookup should not be needed")
        ),
    )

    cli_app._server_start([])

    assert "already running" in capsys.readouterr().out


def test_server_start_reports_non_agent_port_owner(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli_app, "_is_port_available", lambda *, host, port: False)
    monkeypatch.setattr(cli_app, "_is_agent_teams_live", lambda *, host, port: False)
    monkeypatch.setattr(cli_app, "_find_tcp_listen_pid", lambda *, host, port: 9876)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._server_start(["--port", "8123"])

    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "port is already in use by pid 9876" in err
    assert "server stop --force" in err


def test_server_stop_fallback_kills_unmanaged_healthy_agent_teams(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    terminated: list[tuple[int, bool]] = []
    monkeypatch.setattr(cli_app, "_read_server_process", dict)
    monkeypatch.setattr(cli_app, "_find_tcp_listen_pid", lambda *, host, port: 13579)
    monkeypatch.setattr(cli_app, "_is_agent_teams_live", lambda *, host, port: True)
    monkeypatch.setattr(
        cli_app,
        "_terminate_process_tree",
        lambda pid, *, force: terminated.append((pid, force)),
    )

    cli_app._server_stop([])

    assert terminated == [(13579, True)]
    assert "pid 13579" in capsys.readouterr().out


def test_server_stop_refuses_unknown_unmanaged_process_without_force(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    terminated: list[int] = []
    monkeypatch.setattr(cli_app, "_read_server_process", dict)
    monkeypatch.setattr(cli_app, "_find_tcp_listen_pid", lambda *, host, port: 24680)
    monkeypatch.setattr(cli_app, "_is_agent_teams_live", lambda *, host, port: False)
    monkeypatch.setattr(
        cli_app,
        "_terminate_process_tree",
        lambda pid, *, force: terminated.append(pid),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._server_stop([])

    assert exc_info.value.code == 1
    assert terminated == []
    assert "Use --force" in capsys.readouterr().err


def test_fast_invalid_subcommand_guard_ignores_incomplete_and_option_args() -> None:
    _RAISE_FAST_INVALID_SUBCOMMAND_IF_KNOWN([])
    _RAISE_FAST_INVALID_SUBCOMMAND_IF_KNOWN(["roles", "--help"])


def test_fast_help_is_detected_before_side_effecting_dispatch(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_server_start",
        lambda _args: (_ for _ in ()).throw(
            AssertionError("help should not start the server")
        ),
    )
    monkeypatch.setattr(
        cli_app.sys,
        "argv",
        ["relay-teams", "server", "start", "--help", "--port", "9000"],
    )

    assert _IS_HELP(["server", "start", "--help", "--port", "9000"])
    cli_app.main()

    assert "Start the Agent Teams server." in capsys.readouterr().out


def test_fast_help_ignores_help_tokens_used_as_option_values() -> None:
    assert not _IS_HELP(["-m", "--help"])
    assert not _IS_HELP(["--message=--help"])
    assert not _IS_HELP(["plugin", "search", "--", "--help"])
    assert _IS_HELP(["server", "start", "--help", "--port", "9000"])


def test_http_get_json_rejects_non_200_health_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_socket = _FakeSocket([b"HTTP/1.1 503 Service Unavailable\r\n\r\nstarting"])

    monkeypatch.setattr(
        cli_app.socket,
        "create_connection",
        lambda address, timeout=None: fake_socket,
    )

    with pytest.raises(OSError, match="HTTP 200"):
        _HTTP_GET_JSON(host="127.0.0.1", port=8000, path="/api/system/health")


def test_platform_pid_helpers_cover_dispatch_and_parse_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app.sys, "platform", "win32")
    monkeypatch.setattr(cli_app, "_find_windows_tcp_listen_pid", lambda *, port: port)
    assert _FIND_TCP_LISTEN_PID(host="[]", port=9000) is None
    assert _FIND_TCP_LISTEN_PID(host="127.0.0.1", port=9001) == 9001

    monkeypatch.setattr(cli_app.sys, "platform", "linux")
    monkeypatch.setattr(cli_app, "_find_unix_tcp_listen_pid", lambda *, port: port + 1)
    assert _FIND_TCP_LISTEN_PID(host="127.0.0.1", port=9001) == 9002

    monkeypatch.setattr(
        cli_app.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout=""),
    )
    assert _FIND_WINDOWS_TCP_LISTEN_PID(port=1) is None
    assert _FIND_UNIX_TCP_LISTEN_PID(port=1) is None

    monkeypatch.setattr(
        cli_app.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="TCP 127.0.0.1:8123 0.0.0.0:0 LISTENING not-a-pid\n",
        ),
    )
    assert _FIND_WINDOWS_TCP_LISTEN_PID(port=8123) is None

    monkeypatch.setattr(
        cli_app.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="not-a-pid\n"),
    )
    assert _FIND_UNIX_TCP_LISTEN_PID(port=8123) is None


def test_fast_json_option_error_paths(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        _JSON_OBJECT_OPTION("[", "--payload")
    with pytest.raises(SystemExit):
        _JSON_ARRAY_OPTION("{", "--items")
    with pytest.raises(SystemExit):
        _JSON_OBJECT_OPTION("[]", "--payload")
    with pytest.raises(SystemExit):
        _JSON_ARRAY_OPTION("{}", "--items")

    err = capsys.readouterr().err
    assert "--payload must be valid JSON" in err
    assert "--items must be a JSON array" in err


def test_fast_option_parsing_matches_click_forms() -> None:
    assert _OPTION_VALUE(["--base-url=https://relay.test/root"], "--base-url", "") == (
        "https://relay.test/root"
    )
    assert _OPTION_VALUE(["--port", "8000", "--port=9000"], "--port", "") == "9000"
    with pytest.raises(SystemExit):
        _OPTION_VALUE(["--role-id", "--format", "json"], "--role-id", "")
    assert _OPTION_VALUES(["--tool=read", "--tool", "write"], "--tool") == [
        "read",
        "write",
    ]
    assert (
        _FIRST_POSITIONAL_ARG(["--marketplace", "marketplace.json", "query"]) == "query"
    )
    assert _FIRST_POSITIONAL_ARG(["--marketplace=marketplace.json", "query"]) == "query"
    assert _FIRST_POSITIONAL_ARG(["--", "--help"]) == "--help"
    assert _FIRST_POSITIONAL_ARG(["--format", "json", "--", "-my-plugin"]) == (
        "-my-plugin"
    )


def test_resolve_fast_workspace_id_uses_literal_id_for_non_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_http_request(**_kwargs: object) -> object:
        raise AssertionError("literal workspace id should not call workspace pick")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli_app, "_fast_workspace_id_exists", lambda **_kwargs: False)
    monkeypatch.setattr(cli_app, "_http_request_json", fail_http_request)

    assert _RESOLVE_FAST_WORKSPACE_ID(["--workspace", "workspace-id"]) == (
        "workspace-id"
    )


def test_resolve_fast_workspace_id_prefers_existing_id_before_local_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []

    def fake_request_json(
        *,
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> object:
        requests.append((base_url, method, path, payload))
        if path == "/api/workspaces/docs":
            return {"workspace_id": "docs"}
        raise AssertionError("path fallback should not run for an existing id")

    (tmp_path / "docs").mkdir()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli_app, "_http_request_json", fake_request_json)

    assert _RESOLVE_FAST_WORKSPACE_ID(["--workspace", "docs"]) == "docs"
    assert requests == [(cli_app.DEFAULT_BASE_URL, "GET", "/api/workspaces/docs", None)]


@pytest.mark.parametrize(
    ("response", "expected_error"),
    (
        ([], "Expected object response"),
        ({}, "Expected workspace details"),
        ({"workspace": {}}, "missing workspace_id"),
    ),
)
def test_resolve_fast_workspace_id_reports_bad_pick_responses(
    response: object,
    expected_error: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli_app, "_http_request_json", lambda **_kwargs: response)

    with pytest.raises(RuntimeError, match=expected_error):
        _RESOLVE_FAST_WORKSPACE_ID(["--workspace", str(tmp_path)])


def test_fast_prompt_health_probe_respects_scheme_prefix_and_local_ipv6(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    probes: list[str] = []

    def fake_base_url_health(base_url: str) -> bool:
        probes.append(base_url)
        return len(probes) >= 2

    monkeypatch.setattr(
        cli_app, "_is_agent_teams_base_url_healthy", fake_base_url_health
    )
    monkeypatch.setattr(cli_app.time, "sleep", lambda _seconds: None)

    assert _IS_LOCAL_FAST_BASE_URL_HOST("[::1]")
    assert _WAIT_UNTIL_BASE_URL_HEALTHY(
        base_url="https://relay.test/control-plane",
        timeout_seconds=1.0,
    )
    assert probes == [
        "https://relay.test/control-plane",
        "https://relay.test/control-plane",
    ]


def test_fast_http_request_delegates_to_full_cli_when_proxy_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example:8080")
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(SystemExit(9)),
    )

    assert _BASE_URL_REQUIRES_PROXY(
        base_url="https://relay.test/control-plane",
        host="relay.test",
    )
    with pytest.raises(SystemExit) as exc_info:
        _HTTP_REQUEST_JSON(
            base_url="https://relay.test/control-plane",
            method="GET",
            path="/api/system/health",
            payload=None,
        )

    assert exc_info.value.code == 9


def test_fast_http_request_delegates_for_all_proxy_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("http_proxy", raising=False)
    monkeypatch.delenv("https_proxy", raising=False)
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    monkeypatch.setenv("ALL_PROXY", "http://proxy.example:8080")

    assert _BASE_URL_REQUIRES_PROXY(
        base_url="http://relay.test/control-plane",
        host="relay.test",
    )


def test_fast_http_request_delegates_for_persisted_proxy_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / ".env").write_text(
        "ALL_PROXY=http://proxy.example:8080\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(config_dir))

    assert _BASE_URL_REQUIRES_PROXY(
        base_url="http://relay.test/control-plane",
        host="relay.test",
    )


def test_plugin_search_requires_query_for_fast_local_marketplace(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    marketplace = tmp_path / "marketplace.json"
    marketplace.write_text('{"plugins":[]}', encoding="utf-8")
    monkeypatch.setenv("RELAY_TEAMS_CONFIG_DIR", str(tmp_path / "app"))

    with pytest.raises(SystemExit):
        cli_app._handle_fast_plugin(
            ["search", "--marketplace", str(marketplace), "--format", "json"]
        )

    assert "Missing argument 'QUERY'." in capsys.readouterr().err


def test_plugin_search_provider_source_options_fall_back_to_full_cli(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(SystemExit(0)),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(
            [
                "search",
                "deck",
                "--marketplace",
                "remote",
                "--marketplace-provider",
                "github",
                "--marketplace-source",
                "org/repo",
                "--marketplace-ref",
                "main",
            ]
        )

    assert exc_info.value.code == 0


def test_plugin_search_respects_end_of_options_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        cli_app,
        "_run_full_cli",
        lambda: (_ for _ in ()).throw(SystemExit(0)),
    )

    with pytest.raises(SystemExit) as exc_info:
        cli_app._handle_fast_plugin(["search", "--", "--marketplace"])

    assert exc_info.value.code == 0


def test_skill_manifest_helpers_cover_invalid_and_legacy_names(tmp_path: Path) -> None:
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    manifest = skill_dir / "SKILL.md"
    manifest.write_text("---\nname: demo\n---\nbody\n", encoding="utf-8")

    assert _SKILL_ROW(source="unit", manifest=manifest) is not None
    assert _SKILL_ROW(source="unit", manifest=tmp_path / "missing.md") is None
    assert (
        _NORMALIZE_LEGACY_SKILL_NAME(
            name="builtin:demo",
            skill_map={"demo": {"name": "demo"}},
        )
        == "demo"
    )
    assert (
        _NORMALIZE_LEGACY_SKILL_NAME(
            name="custom:demo",
            skill_map={"demo": {"name": "demo"}},
        )
        == "custom:demo"
    )
    assert _PARSE_SKILL_MANIFEST("no frontmatter") is None
    assert _PARSE_SKILL_MANIFEST("---\nname: demo\n") is None
    assert _PARSE_SKILL_MANIFEST("---\nname: \n---\n") is None


def test_render_named_path_rows_handles_empty_and_non_empty(
    capsys: pytest.CaptureFixture[str],
) -> None:
    _RENDER_NAMED_PATH_ROWS(
        title="Resources",
        rows=[],
        empty_message="No resources",
    )
    _RENDER_NAMED_PATH_ROWS(
        title="Resources",
        rows=[{"name": "guide", "path": "guide.md", "description": "Guide"}],
        empty_message="No resources",
    )

    output = capsys.readouterr().out
    assert "No resources" in output
    assert "guide.md" in output


def test_run_full_cli_hands_off_to_app_full_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_run(command: list[str], check: bool) -> subprocess.CompletedProcess[str]:
        captured["command"] = command
        captured["check"] = check
        return subprocess.CompletedProcess(command, 23)

    monkeypatch.setattr(cli_app.sys, "argv", ["relay-teams", "roles", "list"])
    monkeypatch.setattr(cli_app.subprocess, "run", fake_run)

    with pytest.raises(SystemExit) as exc_info:
        cli_app._run_full_cli()

    assert exc_info.value.code == 23
    assert captured == {
        "command": [
            sys.executable,
            "-m",
            "relay_teams.interfaces.cli.app_full",
            "roles",
            "list",
        ],
        "check": False,
    }
