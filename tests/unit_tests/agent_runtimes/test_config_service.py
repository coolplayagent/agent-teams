# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

import pytest

from relay_teams.agent_runtimes import (
    AcpRegistryService,
    AgentRuntimeSetupPhase,
    AgentRuntimeSetupProgress,
    ExternalAgentConfig,
    ExternalAgentConfigService,
    ExternalAgentProtocol,
    ExternalAgentSecretBinding,
    ExternalAgentSecretStore,
    AgentRuntimeTestJobService,
    RegistryTransportConfig,
    StdioTransportConfig,
    StreamableHttpTransportConfig,
)
from relay_teams.agent_runtimes.setup_models import AgentRuntimeSetupProgressCallback
from relay_teams.agent_runtimes.config_service import (
    _current_platform_key,
    _legacy_env_bindings,
    _load_legacy_registry_entries,
    _normalize_legacy_persisted_agent,
)
from relay_teams.env.proxy_env import ProxyEnvConfig


class _FakeSecretStore(ExternalAgentSecretStore):
    def __init__(self) -> None:
        self.values: dict[tuple[str, str, str, str], str] = {}

    def can_persist_secrets(self) -> bool:
        return True

    def get_secret(
        self,
        *,
        config_dir: Path,
        agent_id: str,
        kind: str,
        name: str,
    ) -> str | None:
        return self.values.get((str(config_dir), agent_id, kind, name))

    def set_secret(
        self,
        *,
        config_dir: Path,
        agent_id: str,
        kind: str,
        name: str,
        value: str,
    ) -> None:
        self.values[(str(config_dir), agent_id, kind, name)] = value

    def delete_secret(
        self,
        *,
        config_dir: Path,
        agent_id: str,
        kind: str,
        name: str,
    ) -> None:
        self.values.pop((str(config_dir), agent_id, kind, name), None)

    def delete_agent(self, *, config_dir: Path, agent_id: str) -> None:
        prefix = (str(config_dir), agent_id)
        next_values = {
            key: value for key, value in self.values.items() if key[:2] != prefix
        }
        self.values = next_values


class _FakeRegistryService(AcpRegistryService):
    def __init__(self) -> None:
        super().__init__(
            config_dir=Path("."),
            get_proxy_config=ProxyEnvConfig,
        )
        self.captured_transport: RegistryTransportConfig | None = None
        self.captured_agent_id = ""
        self.captured_progress_callback: AgentRuntimeSetupProgressCallback | None = None

    async def resolve_runtime_transport_async(
        self,
        transport: RegistryTransportConfig,
        *,
        agent_id: str = "",
        progress_callback: AgentRuntimeSetupProgressCallback | None = None,
    ) -> StdioTransportConfig:
        self.captured_transport = transport
        self.captured_agent_id = agent_id
        self.captured_progress_callback = progress_callback
        if progress_callback is not None:
            await progress_callback(
                AgentRuntimeSetupProgress(
                    agent_id=agent_id,
                    registry_id=transport.registry_id,
                    distribution=transport.distribution,
                    phase=AgentRuntimeSetupPhase.READY,
                    message="ready",
                    progress_percent=100,
                )
            )
        return StdioTransportConfig(
            command="resolved-registry-agent",
            args=("--stdio",),
            env=transport.env,
        )


def test_save_agent_persists_secret_bindings_without_writing_values(
    tmp_path: Path,
) -> None:
    secret_store = _FakeSecretStore()
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=secret_store,
    )

    saved = service.save_agent(
        "codex_local",
        ExternalAgentConfig(
            agent_id="codex_local",
            name="Codex Local",
            description="Runs Codex via stdio",
            transport=StdioTransportConfig(
                command="codex",
                args=("--serve",),
                env=(
                    ExternalAgentSecretBinding(
                        name="CODEX_API_KEY",
                        value="secret-123",
                        secret=True,
                    ),
                ),
            ),
        ),
    )

    assert isinstance(saved.transport, StdioTransportConfig)
    persisted_binding = saved.transport.env[0]
    assert persisted_binding.name == "CODEX_API_KEY"
    assert persisted_binding.value is None
    assert persisted_binding.secret is True
    assert persisted_binding.configured is True
    assert (
        secret_store.get_secret(
            config_dir=tmp_path,
            agent_id="codex_local",
            kind="env",
            name="CODEX_API_KEY",
        )
        == "secret-123"
    )


@pytest.mark.asyncio
async def test_resolve_runtime_agent_restores_secret_values(tmp_path: Path) -> None:
    secret_store = _FakeSecretStore()
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=secret_store,
    )
    _ = service.save_agent(
        "codex_local",
        ExternalAgentConfig(
            agent_id="codex_local",
            name="Codex Local",
            transport=StdioTransportConfig(
                command="codex",
                env=(
                    ExternalAgentSecretBinding(
                        name="CODEX_API_KEY",
                        value="secret-123",
                        secret=True,
                    ),
                    ExternalAgentSecretBinding(
                        name="MODE",
                        value="cli",
                        secret=False,
                    ),
                ),
            ),
        ),
    )

    resolved = await service.resolve_runtime_agent_async("codex_local")

    assert isinstance(resolved.transport, StdioTransportConfig)
    assert resolved.transport.env[0].value == "secret-123"
    assert resolved.transport.env[0].configured is True
    assert resolved.transport.env[1].value == "cli"


@pytest.mark.asyncio
async def test_registry_transport_persists_secrets_and_resolves_to_stdio(
    tmp_path: Path,
) -> None:
    secret_store = _FakeSecretStore()
    registry_service = _FakeRegistryService()
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=secret_store,
        registry_service=registry_service,
    )
    saved = service.save_agent(
        "vendor_runtime",
        ExternalAgentConfig(
            agent_id="vendor_runtime",
            name="Vendor Runtime",
            protocol=ExternalAgentProtocol.ACP,
            transport=RegistryTransportConfig(
                registry_id="vendor/runtime",
                distribution="auto",
                env=(
                    ExternalAgentSecretBinding(
                        name="VENDOR_TOKEN",
                        value="secret-123",
                        secret=True,
                    ),
                ),
            ),
        ),
    )

    assert isinstance(saved.transport, RegistryTransportConfig)
    assert saved.transport.env[0].value is None
    assert saved.transport.env[0].configured is True

    progress_events: list[AgentRuntimeSetupProgress] = []

    async def progress_callback(progress: AgentRuntimeSetupProgress) -> None:
        progress_events.append(progress)

    resolved = await service.resolve_runtime_agent_async(
        "vendor_runtime",
        progress_callback=progress_callback,
    )

    assert isinstance(resolved.transport, StdioTransportConfig)
    assert resolved.transport.command == "resolved-registry-agent"
    assert registry_service.captured_transport is not None
    assert registry_service.captured_agent_id == "vendor_runtime"
    assert registry_service.captured_progress_callback is progress_callback
    assert registry_service.captured_transport.env[0].value == "secret-123"
    assert progress_events[-1].phase == AgentRuntimeSetupPhase.READY


def test_saved_registry_transport_loads_as_registry_after_restart(
    tmp_path: Path,
) -> None:
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )
    service.save_agent(
        "vendor_runtime",
        ExternalAgentConfig(
            agent_id="vendor_runtime",
            name="Vendor Runtime",
            protocol=ExternalAgentProtocol.ACP,
            transport=RegistryTransportConfig(
                registry_id="vendor/runtime",
                distribution="npx",
                registry_version="2.0.0",
            ),
        ),
    )
    reloaded_service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = reloaded_service.get_agent("vendor_runtime")

    assert isinstance(loaded.transport, RegistryTransportConfig)
    assert loaded.transport.registry_id == "vendor/runtime"
    assert AgentRuntimeTestJobService.__name__ == "AgentRuntimeTestJobService"


def test_save_agent_deletes_secret_binding_when_marked_unconfigured(
    tmp_path: Path,
) -> None:
    secret_store = _FakeSecretStore()
    secret_store.values[(str(tmp_path), "codex_local", "env", "CODEX_API_KEY")] = (
        "old-secret"
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=secret_store,
    )

    saved = service.save_agent(
        "codex_local",
        ExternalAgentConfig(
            agent_id="codex_local",
            name="Codex Local",
            transport=StdioTransportConfig(
                command="codex",
                env=(
                    ExternalAgentSecretBinding(
                        name="CODEX_API_KEY",
                        secret=True,
                        configured=False,
                    ),
                ),
            ),
        ),
    )

    assert isinstance(saved.transport, StdioTransportConfig)
    assert saved.transport.env[0].configured is False
    assert (
        secret_store.get_secret(
            config_dir=tmp_path,
            agent_id="codex_local",
            kind="env",
            name="CODEX_API_KEY",
        )
        is None
    )


def test_get_agent_strips_legacy_stdio_workdir_from_saved_config(
    tmp_path: Path,
) -> None:
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "codex_local",
                        "name": "Codex Local",
                        "description": "Legacy config",
                        "transport": {
                            "transport": "stdio",
                            "command": "codex",
                            "args": ["--serve"],
                            "cwd": "/tmp/legacy",
                            "env": [],
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("codex_local")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "codex"
    assert loaded.model_dump(mode="json") == {
        "agent_id": "codex_local",
        "name": "Codex Local",
        "description": "Legacy config",
        "protocol": "acp",
        "transport": {
            "transport": "stdio",
            "command": "codex",
            "args": ["--serve"],
            "env": [],
        },
        "native_config_enabled": False,
        "native_config_provider": "",
        "skill_bridge_enabled": False,
        "skill_bridge_skills": [],
        "skill_bridge_mode": "inline",
    }


def test_get_agent_migrates_legacy_registry_npx_transport(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_npm_path",
        lambda: None,
    )
    (
        tmp_path / "agent-runtime-registry" / "agents" / "claude-acp" / "npx" / "cache"
    ).mkdir(parents=True)
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "claude-acp",
                        "name": "Claude Agent",
                        "description": "Legacy registry npx config",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "claude-acp",
                            "distribution": "npx",
                            "registry_version": "0.40.0",
                            "legacy_install_dir": "agent-runtime-registry",
                            "env": [],
                            "registry_entry": {
                                "id": "claude-acp",
                                "name": "Claude Agent",
                                "version": "0.40.0",
                                "distribution": {
                                    "npx": {
                                        "package": (
                                            "@agentclientprotocol/claude-agent-acp@0.40.0"
                                        ),
                                        "args": ["--acp"],
                                        "env": {"CLAUDE_AUTO_UPDATES": "0"},
                                    }
                                },
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("claude-acp")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "npx"
    assert loaded.transport.args == (
        "--yes",
        "--cache",
        str(
            tmp_path
            / "agent-runtime-registry"
            / "agents"
            / "claude-acp"
            / "npx"
            / "cache"
        ),
        "@agentclientprotocol/claude-agent-acp@0.40.0",
        "--acp",
    )
    assert loaded.transport.env == (
        ExternalAgentSecretBinding(
            name="CLAUDE_AUTO_UPDATES",
            value="0",
            configured=True,
        ),
    )


def test_get_agent_migrates_legacy_registry_npx_transport_with_npm(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    npm_path = tmp_path / "bin" / "npm"
    npm_path.parent.mkdir(parents=True)
    npm_path.write_text("", encoding="utf-8")
    safe_prefix = (
        tmp_path / "agent-runtime-registry" / "agents" / "vendor-runtime" / "npx"
    )
    (safe_prefix / "cache").mkdir(parents=True)
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_npm_path",
        lambda: npm_path,
    )
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "vendor-runtime",
                        "name": "Vendor Runtime",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "vendor/runtime",
                            "distribution": "npx",
                            "env": [],
                            "registry_entry": {
                                "id": "vendor/runtime",
                                "distribution": {
                                    "npx": {
                                        "package": "@vendor/runtime",
                                        "args": ["--stdio"],
                                    }
                                },
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("vendor-runtime")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == str(npm_path)
    assert loaded.transport.args == (
        "exec",
        "--yes",
        "--prefix",
        str(safe_prefix),
        "--",
        "@vendor/runtime",
        "--stdio",
    )
    assert (
        ExternalAgentSecretBinding(
            name="NPM_CONFIG_PREFIX",
            value=str(safe_prefix),
            configured=True,
        )
        in loaded.transport.env
    )
    assert (
        ExternalAgentSecretBinding(
            name="NPM_CONFIG_CACHE",
            value=str(safe_prefix / "cache"),
            configured=True,
        )
        in loaded.transport.env
    )


def test_get_agent_migrates_legacy_registry_auto_transport(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_npm_path",
        lambda: None,
    )
    (
        tmp_path / "agent-runtime-registry" / "agents" / "claude-acp" / "npx" / "cache"
    ).mkdir(parents=True)
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "claude-acp",
                        "name": "Claude Agent",
                        "description": "Legacy registry auto config",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "claude-acp",
                            "distribution": "auto",
                            "legacy_install_dir": "agent-runtime-registry",
                            "registry_entry": {
                                "id": "claude-acp",
                                "name": "Claude Agent",
                                "distribution": {
                                    "npx": {
                                        "package": "@agentclientprotocol/claude-agent-acp",
                                        "args": ["--acp"],
                                    }
                                },
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("claude-acp")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "npx"
    assert "@agentclientprotocol/claude-agent-acp" in loaded.transport.args


def test_get_agent_migrates_legacy_registry_auto_to_platform_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_npm_path",
        lambda: None,
    )
    unsupported_platform_key = (
        "linux-aarch64"
        if _current_platform_key() != "linux-aarch64"
        else "darwin-x86_64"
    )
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "hybrid-agent",
                        "name": "Hybrid Agent",
                        "description": "Legacy registry auto hybrid config",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "hybrid-agent",
                            "distribution": "auto",
                            "legacy_install_dir": "agent-runtime-registry",
                            "registry_entry": {
                                "id": "hybrid-agent",
                                "name": "Hybrid Agent",
                                "distribution": {
                                    "binary": {
                                        unsupported_platform_key: {
                                            "cmd": "bin/hybrid-agent",
                                        }
                                    },
                                    "npx": {
                                        "package": "@example/hybrid-agent",
                                        "args": ["--stdio"],
                                    },
                                },
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("hybrid-agent")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "npx"
    assert "@example/hybrid-agent" in loaded.transport.args


def test_get_agent_migrates_legacy_registry_uvx_from_registry_cache(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_executable_path",
        lambda command: command if command == "uvx" else None,
    )
    registry_path = tmp_path / "agent-runtime-registry" / "registry.json"
    registry_path.parent.mkdir(parents=True)
    registry_path.write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "id": "python-agent",
                        "distribution": {
                            "uvx": {
                                "package": "python-agent-acp",
                                "args": ["--stdio"],
                                "env": {
                                    "TOKEN": "default-token",
                                    "REMOTE": "enabled",
                                },
                            }
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "python-agent",
                        "name": "Python Agent",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "python-agent",
                            "legacy_install_dir": "agent-runtime-registry",
                            "env": {"TOKEN": "local-token"},
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("python-agent")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "uvx"
    assert loaded.transport.args == ("python-agent-acp", "--stdio")
    assert loaded.transport.env == (
        ExternalAgentSecretBinding(
            name="TOKEN",
            value="local-token",
            configured=True,
        ),
        ExternalAgentSecretBinding(
            name="REMOTE",
            value="enabled",
            configured=True,
        ),
    )


def test_get_agent_migrates_legacy_registry_uvx_with_uv_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "relay_teams.agent_runtimes.config_service._legacy_resolve_executable_path",
        lambda command: str(tmp_path / "bin" / "uv") if command == "uv" else None,
    )
    registry_path = tmp_path / "agent-runtime-registry" / "registry.json"
    registry_path.parent.mkdir(parents=True)
    registry_path.write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "id": "python-agent",
                        "distribution": {
                            "uvx": {
                                "package": "python-agent-acp",
                                "args": ["--stdio"],
                            }
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "python-agent",
                        "name": "Python Agent",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "python-agent",
                            "legacy_install_dir": "agent-runtime-registry",
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("python-agent")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == str(tmp_path / "bin" / "uv")
    assert loaded.transport.args == (
        "tool",
        "run",
        "python-agent-acp",
        "--stdio",
    )


def test_get_agent_migrates_legacy_registry_binary_from_platform_entry(
    tmp_path: Path,
) -> None:
    platform_key = _current_platform_key()
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "binary-agent",
                        "name": "Binary Agent",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "binary-agent",
                            "distribution": "binary",
                            "legacy_install_dir": "agent-runtime-registry",
                            "registry_entry": {
                                "distribution": {
                                    "binary": {
                                        platform_key: {
                                            "cmd": "bin/binary-agent",
                                            "args": ["--stdio"],
                                            "env": {"BINARY_ENV": "1"},
                                        }
                                    }
                                }
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("binary-agent")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == "bin/binary-agent"
    assert loaded.transport.args == ("--stdio",)
    assert loaded.transport.env == (
        ExternalAgentSecretBinding(
            name="BINARY_ENV",
            value="1",
            configured=True,
        ),
    )


def test_get_agent_migrates_legacy_registry_binary_from_install_dir(
    tmp_path: Path,
) -> None:
    install_dir = (
        tmp_path / "agent-runtime-registry" / "agents" / "legacy-tool" / "1.0.0-local"
    )
    install_dir.mkdir(parents=True)
    binary_path = install_dir / "legacy-tool"
    binary_path.write_text("", encoding="utf-8")
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "legacy-tool",
                        "name": "Legacy Tool",
                        "description": "Legacy registry binary config",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "legacy-tool",
                            "distribution": "binary",
                            "registry_version": "1.0.0",
                            "legacy_install_dir": "agent-runtime-registry",
                            "env": [],
                            "registry_entry": None,
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("legacy-tool")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == str(binary_path)


def test_get_agent_migrates_legacy_registry_binary_from_safe_install_dir(
    tmp_path: Path,
) -> None:
    install_dir = (
        tmp_path
        / "agent-runtime-registry"
        / "agents"
        / "vendor-runtime"
        / "1.0.0-local"
    )
    install_dir.mkdir(parents=True)
    binary_path = install_dir / "vendor-runtime"
    binary_path.write_text("", encoding="utf-8")
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "vendor_runtime",
                        "name": "Vendor Runtime",
                        "description": "Legacy registry binary config",
                        "transport": {
                            "transport": "registry",
                            "registry_id": "vendor/runtime",
                            "distribution": "binary",
                            "registry_version": "1.0.0",
                            "legacy_install_dir": "agent-runtime-registry",
                            "env": [],
                            "registry_entry": None,
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    loaded = service.get_agent("vendor_runtime")

    assert isinstance(loaded.transport, StdioTransportConfig)
    assert loaded.transport.command == str(binary_path)


def test_legacy_registry_helpers_ignore_dirty_payloads(tmp_path: Path) -> None:
    registry_path = tmp_path / "agent-runtime-registry" / "registry.json"
    registry_path.parent.mkdir(parents=True)
    registry_path.write_text("{bad json", encoding="utf-8")

    assert _load_legacy_registry_entries(tmp_path) == {}
    assert (
        _normalize_legacy_persisted_agent(
            raw_agent="not-an-agent",
            config_dir=tmp_path,
            registry_entries={},
        )
        == "not-an-agent"
    )
    assert _normalize_legacy_persisted_agent(
        raw_agent={"agent_id": "plain"},
        config_dir=tmp_path,
        registry_entries={},
    ) == {"agent_id": "plain"}
    assert _legacy_env_bindings(
        [{"name": "TOKEN", "value": "explicit"}],
        {"TOKEN": "default", "REMOTE": "enabled"},
    ) == (
        {"name": "TOKEN", "value": "explicit"},
        {
            "name": "REMOTE",
            "value": "enabled",
            "secret": False,
            "configured": True,
        },
    )


def test_list_agents_skips_invalid_persisted_agent(tmp_path: Path) -> None:
    (tmp_path / "agents.json").write_text(
        json.dumps(
            {
                "agents": [
                    {
                        "agent_id": "codex_local",
                        "name": "Codex Local",
                        "transport": {
                            "transport": "stdio",
                            "command": "codex",
                            "args": ["--serve"],
                            "env": [],
                        },
                    },
                    {
                        "agent_id": "broken_registry",
                        "name": "Broken Registry",
                        "transport": {
                            "transport": "registry",
                            "distribution": "binary",
                            "env": [],
                            "registry_entry": None,
                        },
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    summaries = service.list_agents()

    assert tuple(summary.agent_id for summary in summaries) == ("codex_local",)


def test_a2a_agent_requires_http_transport(tmp_path: Path) -> None:
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )

    try:
        service.save_agent(
            "a2a_local",
            ExternalAgentConfig(
                agent_id="a2a_local",
                name="A2A Local",
                protocol=ExternalAgentProtocol.A2A,
                transport=StdioTransportConfig(command="agent"),
            ),
        )
    except ValueError as exc:
        assert "A2A agent runtimes require streamable_http transport" in str(exc)
    else:
        raise AssertionError("Expected A2A stdio config to be rejected")


def test_list_agent_summaries_include_runtime_protocol(tmp_path: Path) -> None:
    service = ExternalAgentConfigService(
        config_dir=tmp_path,
        secret_store=_FakeSecretStore(),
    )
    _ = service.save_agent(
        "a2a_remote",
        ExternalAgentConfig(
            agent_id="a2a_remote",
            name="A2A Remote",
            protocol=ExternalAgentProtocol.A2A,
            transport=StreamableHttpTransportConfig(
                url="http://agent.test/.well-known/agent.json",
            ),
        ),
    )

    summaries = service.list_agents()

    assert summaries[0].protocol == ExternalAgentProtocol.A2A
