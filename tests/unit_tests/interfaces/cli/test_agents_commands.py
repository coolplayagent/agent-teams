# -*- coding: utf-8 -*-
from __future__ import annotations

import json

from click import unstyle
from typer.testing import CliRunner

from relay_teams.agent_runtimes import agent_cli as agent_cli_module
from relay_teams.interfaces.cli import app_full as cli_app

runner = CliRunner()


def test_agent_runtimes_list_supports_json_output(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        return [
            {
                "agent_id": "codex_local",
                "name": "Codex Local",
                "description": "Runs Codex via stdio",
                "transport": "stdio",
            }
        ]

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    result = runner.invoke(cli_app.app, ["agent-runtimes", "list", "--format", "json"])

    assert result.exit_code == 0
    assert json.loads(result.stdout) == [
        {
            "agent_id": "codex_local",
            "name": "Codex Local",
            "description": "Runs Codex via stdio",
            "transport": "stdio",
        }
    ]
    assert calls == [("GET", "/api/system/configs/agent-runtimes", None)]


def test_agent_runtimes_save_and_delete_call_expected_endpoints(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        return {"status": "ok"}

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    save_result = runner.invoke(
        cli_app.app,
        [
            "agent-runtimes",
            "save",
            "codex_local",
            "--config-json",
            json.dumps(
                {
                    "agent_id": "codex_local",
                    "name": "Codex Local",
                    "description": "Runs Codex via stdio",
                    "transport": {
                        "transport": "stdio",
                        "command": "codex",
                        "args": [],
                    },
                }
            ),
        ],
    )
    delete_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "delete", "codex_local"],
    )

    assert save_result.exit_code == 0
    assert delete_result.exit_code == 0
    assert calls == [
        (
            "PUT",
            "/api/system/configs/agent-runtimes/codex_local",
            {
                "agent_id": "codex_local",
                "name": "Codex Local",
                "description": "Runs Codex via stdio",
                "transport": {
                    "transport": "stdio",
                    "command": "codex",
                    "args": [],
                },
            },
        ),
        ("DELETE", "/api/system/configs/agent-runtimes/codex_local", None),
    ]


def test_agent_runtimes_commands_encode_agent_id_path(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []
    agent_id = "team/codex runtime?#1"

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        if path.endswith(":test"):
            return {"ok": True, "message": "Connected"}
        if method == "GET":
            return {
                "agent_id": agent_id,
                "name": "Codex Local",
                "description": "Runs Codex via stdio",
                "protocol": "cli",
                "transport": {
                    "transport": "stdio",
                    "command": "codex",
                    "args": [],
                },
            }
        return {"status": "ok"}

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    get_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "get", agent_id, "--format", "json"],
    )
    save_result = runner.invoke(
        cli_app.app,
        [
            "agent-runtimes",
            "save",
            agent_id,
            "--config-json",
            json.dumps(
                {
                    "agent_id": agent_id,
                    "name": "Codex Local",
                    "description": "Runs Codex via stdio",
                    "protocol": "cli",
                    "transport": {
                        "transport": "stdio",
                        "command": "codex",
                        "args": [],
                    },
                }
            ),
        ],
    )
    delete_result = runner.invoke(cli_app.app, ["agent-runtimes", "delete", agent_id])
    test_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "test", agent_id, "--format", "json"],
    )

    assert get_result.exit_code == 0
    assert save_result.exit_code == 0
    assert delete_result.exit_code == 0
    assert test_result.exit_code == 0
    encoded_path = "/api/system/configs/agent-runtimes/team%2Fcodex%20runtime%3F%231"
    assert calls == [
        ("GET", encoded_path, None),
        (
            "PUT",
            encoded_path,
            {
                "agent_id": agent_id,
                "name": "Codex Local",
                "description": "Runs Codex via stdio",
                "protocol": "cli",
                "transport": {
                    "transport": "stdio",
                    "command": "codex",
                    "args": [],
                },
            },
        ),
        ("DELETE", encoded_path, None),
        ("POST", f"{encoded_path}:test", None),
    ]


def test_agent_runtimes_test_supports_table_output(monkeypatch) -> None:
    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds, method, path, payload)
        return {
            "ok": True,
            "message": "Connected",
            "agent_name": "Codex",
            "agent_version": "1.0.0",
            "protocol_version": 1,
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    result = runner.invoke(cli_app.app, ["agent-runtimes", "test", "codex_local"])

    assert result.exit_code == 0
    assert "Agent Runtime: codex_local" in result.stdout
    assert "OK: True" in result.stdout
    assert "Message: Connected" in result.stdout


def test_agent_runtimes_test_watch_polls_job(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []
    sleep_calls: list[float] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        if path.endswith(":test-job"):
            return {
                "job_id": "job-1",
                "agent_id": "codex_local",
                "status": "running",
                "phase": "downloading",
                "message": "Downloading Agent Runtime binary.",
                "progress_percent": 25,
                "downloaded_bytes": 10,
                "total_bytes": 40,
            }
        return {
            "job_id": "job-1",
            "agent_id": "codex_local",
            "status": "succeeded",
            "phase": "completed",
            "message": "Connected",
            "progress_percent": 100,
            "result": {
                "ok": True,
                "message": "Connected",
                "protocol": "acp",
            },
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)
    monkeypatch.setattr(agent_cli_module.time, "sleep", sleep_calls.append)

    result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "test", "codex_local", "--watch"],
    )

    assert result.exit_code == 0
    assert "running | downloading | 25%" in result.stdout
    assert "Agent Runtime: codex_local" in result.stdout
    assert calls == [
        ("POST", "/api/system/configs/agent-runtimes/codex_local:test-job", None),
        ("GET", "/api/system/configs/agent-runtime-test-jobs/job-1", None),
    ]
    assert sleep_calls == [0.6]


def test_agent_runtimes_test_watch_exits_nonzero_when_job_fails(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        if path.endswith(":test-job"):
            return {
                "job_id": "job-1",
                "agent_id": "codex_local",
                "status": "running",
                "phase": "starting_process",
                "message": "Starting Agent Runtime probe.",
            }
        return {
            "job_id": "job-1",
            "agent_id": "codex_local",
            "status": "failed",
            "phase": "failed",
            "message": "Probe failed",
            "error_message": "Probe failed",
            "result": {
                "ok": False,
                "message": "Probe failed",
                "protocol": "acp",
            },
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)
    monkeypatch.setattr(agent_cli_module.time, "sleep", lambda seconds: None)

    result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "test", "codex_local", "--watch"],
    )

    assert result.exit_code == 1
    assert "failed | failed: Probe failed" in result.stdout
    assert "OK: False" in result.stdout
    assert calls == [
        ("POST", "/api/system/configs/agent-runtimes/codex_local:test-job", None),
        ("GET", "/api/system/configs/agent-runtime-test-jobs/job-1", None),
    ]


def test_agent_runtimes_test_watch_json_exits_nonzero_when_job_fails(
    monkeypatch,
) -> None:
    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, method, payload, timeout_seconds)
        if path.endswith(":test-job"):
            return {
                "job_id": "job-1",
                "agent_id": "codex_local",
                "status": "running",
            }
        return {
            "job_id": "job-1",
            "agent_id": "codex_local",
            "status": "failed",
            "result": {"ok": False, "message": "Probe failed", "protocol": "acp"},
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)
    monkeypatch.setattr(agent_cli_module.time, "sleep", lambda seconds: None)

    result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "test", "codex_local", "--watch", "--format", "json"],
    )

    assert result.exit_code == 1
    assert json.loads(result.stdout)["status"] == "failed"


def test_agent_runtime_test_job_formatters_cover_edge_units() -> None:
    assert agent_cli_module._test_job_failed({"result": {"ok": False}}) is True
    assert agent_cli_module._object_value({"result": "missing"}, "result") == {}
    assert agent_cli_module._format_job_byte_progress(0, 0) == ""
    assert agent_cli_module._format_job_byte_progress(2048, None) == "2.0 KB"
    assert agent_cli_module._format_job_byte_progress(1024 * 1024, 0) == "1.0 MB"
    assert agent_cli_module._format_job_byte_progress(1024 * 1024 * 1024, 0) == "1.0 GB"


def test_agent_runtimes_registry_commands_call_expected_endpoints(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        if path.endswith(":install"):
            return {
                "status": "installed",
                "agent": {
                    "agent_id": "vendor_runtime",
                    "name": "Vendor Runtime",
                    "transport": {
                        "transport": "registry",
                        "registry_id": "vendor/runtime",
                        "distribution": "npx",
                    },
                },
                "registry_agent": {
                    "registry_id": "vendor/runtime",
                    "name": "Vendor Runtime",
                    "selected_distribution": "npx",
                },
                "message": "Installed registry runtime.",
            }
        return {
            "registry_version": "1.0.0",
            "cache_path": "/tmp/registry.json",
            "agents": [
                {
                    "registry_id": "vendor/runtime",
                    "name": "Vendor Runtime",
                    "description": "Runs through npx",
                    "distributions": ["npx"],
                    "installed": False,
                }
            ],
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    list_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "registry", "list", "--format", "json", "--refresh"],
    )
    refresh_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "registry", "refresh", "--format", "json"],
    )
    install_result = runner.invoke(
        cli_app.app,
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
    )
    default_agent_id_result = runner.invoke(
        cli_app.app,
        [
            "agent-runtimes",
            "registry",
            "install",
            "vendor/runtime",
            "--format",
            "json",
        ],
    )

    assert list_result.exit_code == 0
    assert refresh_result.exit_code == 0
    assert install_result.exit_code == 0
    assert default_agent_id_result.exit_code == 0
    assert calls == [
        ("GET", "/api/system/configs/agent-runtime-registry?refresh=true", None),
        ("POST", "/api/system/configs/agent-runtime-registry:refresh", None),
        (
            "POST",
            "/api/system/configs/agent-runtime-registry/vendor%2Fruntime:install",
            {
                "agent_id": "vendor_runtime",
                "distribution": "npx",
                "env": {"VENDOR_TOKEN": "from-env"},
            },
        ),
        (
            "POST",
            "/api/system/configs/agent-runtime-registry/vendor%2Fruntime:install",
            {},
        ),
    ]


def test_agent_runtimes_registry_commands_support_table_output(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, timeout_seconds)
        calls.append((method, path, payload))
        if path.endswith(":install"):
            return {
                "status": "installed",
                "agent": {
                    "agent_id": "vendor_runtime",
                    "name": "Vendor Runtime",
                    "transport": {
                        "transport": "registry",
                        "registry_id": "vendor/runtime",
                        "distribution": "npx",
                    },
                },
                "registry_agent": {
                    "registry_id": "vendor/runtime",
                    "name": "Vendor Runtime",
                    "selected_distribution": "npx",
                },
                "message": "Installed registry runtime.",
            }
        return {
            "registry_version": "1.0.0",
            "cache_path": "/tmp/registry.json",
            "error_message": "offline cache",
            "agents": [
                {
                    "registry_id": "vendor/runtime",
                    "name": "Vendor Runtime",
                    "distributions": ["npx"],
                    "installed": False,
                },
                {
                    "registry_id": "vendor/installed",
                    "name": "Installed Runtime",
                    "distributions": ["binary"],
                    "installed": True,
                },
                {
                    "registry_id": "vendor/update",
                    "name": "Update Runtime",
                    "distributions": ["uvx"],
                    "update_available": True,
                },
            ],
        }

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    list_result = runner.invoke(cli_app.app, ["agent-runtimes", "registry", "list"])
    refresh_result = runner.invoke(
        cli_app.app,
        ["agent-runtimes", "registry", "refresh"],
    )
    install_result = runner.invoke(
        cli_app.app,
        [
            "agent-runtimes",
            "registry",
            "install",
            "vendor/runtime",
            "--env-json",
            '{"VENDOR_TOKEN":"from-env"}',
        ],
    )

    assert list_result.exit_code == 0
    assert refresh_result.exit_code == 0
    assert install_result.exit_code == 0
    assert "ACP Registry: 1.0.0" in list_result.stdout
    assert "Cache warning: offline cache" in list_result.stdout
    assert "Available" in list_result.stdout
    assert "Installed" in list_result.stdout
    assert "Update" in list_result.stdout
    assert "Agent Runtime: vendor_runtime" in install_result.stdout
    assert "Selected Distribution: npx" in install_result.stdout
    assert calls == [
        ("GET", "/api/system/configs/agent-runtime-registry", None),
        ("POST", "/api/system/configs/agent-runtime-registry:refresh", None),
        (
            "POST",
            "/api/system/configs/agent-runtime-registry/vendor%2Fruntime:install",
            {"env": {"VENDOR_TOKEN": "from-env"}},
        ),
    ]


def test_agent_runtimes_registry_list_table_handles_empty_catalog(monkeypatch) -> None:
    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    def fake_request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, object] | list[object]:
        _ = (base_url, method, path, payload, timeout_seconds)
        return {"registry_version": "1.0.0", "agents": []}

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)
    monkeypatch.setattr(cli_app, "_request_json", fake_request_json)

    result = runner.invoke(cli_app.app, ["agent-runtimes", "registry", "list"])

    assert result.exit_code == 0
    assert "No ACP registry agents available." in result.stdout


def test_agent_runtimes_registry_install_rejects_invalid_env_json(
    monkeypatch,
) -> None:
    def fake_autostart(
        base_url: str, autostart: bool, daemon: bool = False, force: bool = False
    ) -> None:
        _ = (base_url, autostart, daemon, force)

    monkeypatch.setattr(cli_app, "_auto_start_if_needed", fake_autostart)

    result = runner.invoke(
        cli_app.app,
        [
            "agent-runtimes",
            "registry",
            "install",
            "vendor/runtime",
            "--env-json",
            "[]",
        ],
    )

    assert result.exit_code != 0
    assert "--env-json must be a JSON object" in unstyle(result.output)
