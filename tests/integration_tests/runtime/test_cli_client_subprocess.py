# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from relay_teams.agent_runtimes.clients.cli import (
    CliAgentError,
    probe_cli_agent,
    run_cli_agent_prompt,
)
from relay_teams.agent_runtimes.models import (
    ExternalAgentConfig,
    ExternalAgentProtocol,
    ExternalAgentSecretBinding,
    StdioTransportConfig,
)

_JSON_RPC_RUNTIME_SCRIPT = r"""
import json
import sys

thread_id = "thread-1"
turn_id = "turn-1"

for raw_line in sys.stdin:
    if not raw_line.strip():
        continue
    message = json.loads(raw_line)
    method = message.get("method")
    message_id = message.get("id")
    if method == "initialize":
        print(
            json.dumps(
                {
                    "id": message_id,
                    "result": {
                        "userAgent": "fake-cli-runtime/1.0",
                        "codexHome": "/tmp/codex",
                        "platformFamily": "unix",
                        "platformOs": "linux",
                    },
                }
            ),
            flush=True,
        )
    elif method == "initialized":
        continue
    elif method == "thread/start":
        print(
            json.dumps({"id": message_id, "result": {"thread": {"id": thread_id}}}),
            flush=True,
        )
    elif method == "turn/start":
        params = message["params"]
        assert params["cwd"]
        assert params["input"][0]["type"] == "text"
        assert "hello runtime" in params["input"][0]["text"]
        print(
            json.dumps(
                {
                    "id": message_id,
                    "result": {
                        "turn": {"id": turn_id, "status": "inProgress", "items": []}
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "item/agentMessage/delta",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id,
                        "itemId": "item-1",
                        "delta": "JSON RPC ",
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "item/agentMessage/delta",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id,
                        "itemId": "item-1",
                        "delta": "output.",
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "turn/completed",
                    "params": {
                        "threadId": thread_id,
                        "turn": {"id": turn_id, "status": "completed", "items": []},
                    },
                }
            ),
            flush=True,
        )
    else:
        print(
            json.dumps(
                {
                    "id": message_id,
                    "error": {"code": -32601, "message": f"unknown method {method}"},
                }
            ),
            flush=True,
        )
"""

_JSON_RPC_ITEM_COMPLETED_RUNTIME_SCRIPT = r"""
import json
import sys

thread_id = "thread-1"
turn_id = "turn-1"

for raw_line in sys.stdin:
    if not raw_line.strip():
        continue
    message = json.loads(raw_line)
    method = message.get("method")
    message_id = message.get("id")
    if method == "initialize":
        print(json.dumps({"id": message_id, "result": {"userAgent": "fake/1"}}), flush=True)
    elif method == "initialized":
        continue
    elif method == "thread/start":
        print(json.dumps({"id": message_id, "result": {"thread": {"id": thread_id}}}), flush=True)
    elif method == "turn/start":
        print(
            json.dumps(
                {
                    "id": message_id,
                    "result": {
                        "turn": {"id": turn_id, "status": "inProgress", "items": []}
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "item/completed",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id,
                        "item": {
                            "id": "item-1",
                            "type": "agentMessage",
                            "text": "completed item output",
                        },
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "turn/completed",
                    "params": {
                        "threadId": thread_id,
                        "turn": {"id": turn_id, "status": "completed", "items": []},
                    },
                }
            ),
            flush=True,
        )
"""

_JSON_RPC_CLOSE_DURING_TURN_SCRIPT = r"""
import json
import sys

thread_id = "thread-1"
turn_id = "turn-1"

for raw_line in sys.stdin:
    if not raw_line.strip():
        continue
    message = json.loads(raw_line)
    method = message.get("method")
    message_id = message.get("id")
    if method == "initialize":
        print(json.dumps({"id": message_id, "result": {"userAgent": "fake/1"}}), flush=True)
    elif method == "initialized":
        continue
    elif method == "thread/start":
        print(json.dumps({"id": message_id, "result": {"thread": {"id": thread_id}}}), flush=True)
    elif method == "turn/start":
        print(
            json.dumps(
                {
                    "id": message_id,
                    "result": {
                        "turn": {"id": turn_id, "status": "inProgress", "items": []}
                    },
                }
            ),
            flush=True,
        )
        print(
            json.dumps(
                {
                    "method": "item/agentMessage/delta",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id,
                        "itemId": "item-1",
                        "delta": "partial output",
                    },
                }
            ),
            flush=True,
        )
        raise SystemExit(0)
"""

_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS = 20


def _build_cli_agent(
    command: str,
    args: tuple[str, ...],
    *,
    env: tuple[ExternalAgentSecretBinding, ...] = (),
) -> ExternalAgentConfig:
    return ExternalAgentConfig(
        agent_id="cli_agent",
        name="CLI Agent",
        protocol=ExternalAgentProtocol.CLI,
        transport=StdioTransportConfig(command=command, args=args, env=env),
    )


def _write_json_rpc_runtime_executable(path: Path) -> Path:
    if os.name == "nt":
        script_path = path.with_suffix(".py")
        script_path.write_text(_JSON_RPC_RUNTIME_SCRIPT, encoding="utf-8")
        command_path = path.with_suffix(".cmd")
        command_path.write_text(
            f'@echo off\r\n"{sys.executable}" "%~dp0{script_path.name}"\r\n',
            encoding="utf-8",
        )
        return command_path
    path.write_text(
        f"#!{sys.executable}\n{_JSON_RPC_RUNTIME_SCRIPT}",
        encoding="utf-8",
    )
    path.chmod(0o755)
    return path


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_probe_cli_agent_initializes_stdio_json_rpc_runtime() -> None:
    result = await probe_cli_agent(
        _build_cli_agent(sys.executable, ("-c", _JSON_RPC_RUNTIME_SCRIPT))
    )

    assert result.ok is True
    assert result.protocol == ExternalAgentProtocol.CLI
    assert result.protocol_version_text == "stdio-jsonrpc"
    assert result.agent_name == Path(sys.executable).name
    assert result.agent_version == "fake-cli-runtime/1.0"


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_probe_cli_agent_resolves_relative_command_from_runtime_cwd(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable = _write_json_rpc_runtime_executable(bin_dir / "runtime-agent")

    result = await probe_cli_agent(
        _build_cli_agent(f"./bin/{executable.name}", ()),
        runtime_cwd=tmp_path,
    )

    assert result.ok is True
    assert result.agent_name == executable.name


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_probe_cli_agent_uses_transport_env_for_command_lookup(
    tmp_path: Path,
) -> None:
    executable = _write_json_rpc_runtime_executable(tmp_path / "runtime-agent")

    result = await probe_cli_agent(
        _build_cli_agent(
            executable.name,
            (),
            env=(ExternalAgentSecretBinding(name="PATH", value=str(tmp_path)),),
        )
    )

    assert result.ok is True
    assert result.agent_name == executable.name


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_run_cli_agent_prompt_uses_thread_turn_json_rpc(tmp_path: Path) -> None:
    result = await run_cli_agent_prompt(
        config=_build_cli_agent(sys.executable, ("-c", _JSON_RPC_RUNTIME_SCRIPT)),
        prompt="hello runtime",
        runtime_cwd=tmp_path,
        timeout_seconds=5,
    )

    assert result == "JSON RPC output."


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_run_cli_agent_prompt_uses_completed_item_fallback(
    tmp_path: Path,
) -> None:
    result = await run_cli_agent_prompt(
        config=_build_cli_agent(
            sys.executable,
            ("-c", _JSON_RPC_ITEM_COMPLETED_RUNTIME_SCRIPT),
        ),
        prompt="hello runtime",
        runtime_cwd=tmp_path,
        timeout_seconds=5,
    )

    assert result == "completed item output"


@pytest.mark.asyncio
@pytest.mark.timeout(_CLI_SUBPROCESS_TEST_TIMEOUT_SECONDS)
async def test_run_cli_agent_prompt_raises_when_runtime_closes_during_turn(
    tmp_path: Path,
) -> None:
    with pytest.raises(CliAgentError, match="closed stdout"):
        await run_cli_agent_prompt(
            config=_build_cli_agent(
                sys.executable,
                ("-c", _JSON_RPC_CLOSE_DURING_TURN_SCRIPT),
            ),
            prompt="hello runtime",
            runtime_cwd=tmp_path,
            timeout_seconds=5,
        )
