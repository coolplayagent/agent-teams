# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import platform
from collections.abc import Mapping
from pathlib import Path

from pydantic import ValidationError

from relay_teams.logger import get_logger
from relay_teams.agent_runtimes.models import (
    CustomTransportConfig,
    ExternalAgentCollection,
    ExternalAgentConfig,
    ExternalAgentOption,
    ExternalAgentProtocol,
    ExternalAgentSecretBinding,
    ExternalAgentSummary,
    RegistryTransportConfig,
    StdioTransportConfig,
    StreamableHttpTransportConfig,
)
from relay_teams.agent_runtimes.registry_service import (
    AcpRegistryService,
    registry_default_agent_id,
    resolve_registry_executable_path,
)
from relay_teams.agent_runtimes.secret_store import (
    ExternalAgentSecretStore,
    get_external_agent_secret_store,
)
from relay_teams.agent_runtimes.setup_models import AgentRuntimeSetupProgressCallback
from relay_teams.env.clawhub_cli import resolve_npm_path

_CONFIG_FILE_NAME = "agents.json"
_LEGACY_AGENT_RUNTIME_REGISTRY_DIR_NAME = "agent-runtime-registry"
_LEGACY_AGENT_RUNTIME_REGISTRY_FILE_NAME = "registry.json"

LOGGER = get_logger(__name__)


class ExternalAgentConfigService:
    def __init__(
        self,
        *,
        config_dir: Path,
        secret_store: ExternalAgentSecretStore | None = None,
        registry_service: AcpRegistryService | None = None,
    ) -> None:
        self._config_dir = config_dir
        self._config_path = config_dir / _CONFIG_FILE_NAME
        self._secret_store = (
            get_external_agent_secret_store() if secret_store is None else secret_store
        )
        self._registry_service = registry_service

    def list_agents(self) -> tuple[ExternalAgentSummary, ...]:
        return tuple(
            ExternalAgentSummary(
                agent_id=agent.agent_id,
                name=agent.name,
                description=agent.description,
                protocol=agent.protocol,
                transport=agent.transport.transport,
            )
            for agent in self._load_collection().agents
        )

    def list_agent_options(self) -> tuple[ExternalAgentOption, ...]:
        return tuple(
            ExternalAgentOption(
                agent_id=agent.agent_id,
                name=agent.name,
                protocol=agent.protocol,
                transport=agent.transport.transport,
            )
            for agent in self._load_collection().agents
        )

    def list_agent_configs(self) -> tuple[ExternalAgentConfig, ...]:
        return self._load_collection().agents

    def get_agent(self, agent_id: str) -> ExternalAgentConfig:
        normalized_agent_id = _normalize_required_text(agent_id, "agent_id")
        for agent in self._load_collection().agents:
            if agent.agent_id == normalized_agent_id:
                return self._attach_secret_status(self._normalize_agent(agent))
        raise KeyError(f"Unknown external agent: {normalized_agent_id}")

    def save_agent(
        self,
        agent_id: str,
        config: ExternalAgentConfig,
    ) -> ExternalAgentConfig:
        normalized = self._normalize_agent(config)
        if normalized.agent_id != _normalize_required_text(agent_id, "agent_id"):
            raise ValueError("Path agent_id must match payload agent_id")

        current = None
        collection = self._load_collection()
        next_agents: list[ExternalAgentConfig] = []
        for existing in collection.agents:
            if existing.agent_id == normalized.agent_id:
                current = existing
                continue
            next_agents.append(existing)

        persisted = self._prepare_for_persistence(
            incoming=normalized,
            current=current,
        )
        next_agents.append(persisted)
        next_agents.sort(key=lambda item: (item.name.casefold(), item.agent_id))
        self._write_collection(ExternalAgentCollection(agents=tuple(next_agents)))
        return self.get_agent(normalized.agent_id)

    def delete_agent(self, agent_id: str) -> None:
        normalized_agent_id = _normalize_required_text(agent_id, "agent_id")
        collection = self._load_collection()
        next_agents = tuple(
            agent
            for agent in collection.agents
            if agent.agent_id != normalized_agent_id
        )
        if len(next_agents) == len(collection.agents):
            raise KeyError(f"Unknown external agent: {normalized_agent_id}")
        self._write_collection(ExternalAgentCollection(agents=next_agents))
        self._secret_store.delete_agent(
            config_dir=self._config_dir,
            agent_id=normalized_agent_id,
        )

    async def resolve_runtime_agent_async(
        self,
        agent_id: str,
        *,
        progress_callback: AgentRuntimeSetupProgressCallback | None = None,
    ) -> ExternalAgentConfig:
        config = self.get_agent(agent_id)
        if isinstance(config.transport, StdioTransportConfig):
            return config.model_copy(
                update={
                    "transport": config.transport.model_copy(
                        update={
                            "env": self._resolve_runtime_bindings(
                                agent_id=config.agent_id,
                                bindings=config.transport.env,
                                kind="env",
                            )
                        }
                    )
                }
            )
        if isinstance(config.transport, StreamableHttpTransportConfig):
            return config.model_copy(
                update={
                    "transport": config.transport.model_copy(
                        update={
                            "headers": self._resolve_runtime_bindings(
                                agent_id=config.agent_id,
                                bindings=config.transport.headers,
                                kind="header",
                            )
                        }
                    )
                }
            )
        if isinstance(config.transport, RegistryTransportConfig):
            if self._registry_service is None:
                raise RuntimeError("ACP registry service is not configured")
            resolved_transport = config.transport.model_copy(
                update={
                    "env": self._resolve_runtime_bindings(
                        agent_id=config.agent_id,
                        bindings=config.transport.env,
                        kind="env",
                    )
                }
            )
            return config.model_copy(
                update={
                    "transport": (
                        await self._registry_service.resolve_runtime_transport_async(
                            resolved_transport,
                            agent_id=config.agent_id,
                            progress_callback=progress_callback,
                        )
                    )
                }
            )
        return config

    def _load_collection(self) -> ExternalAgentCollection:
        if not self._config_path.exists():
            return ExternalAgentCollection()
        raw = self._config_path.read_text(encoding="utf-8").strip()
        if not raw:
            return ExternalAgentCollection()
        payload = json.loads(raw)
        return _load_persisted_collection(
            payload=payload,
            config_dir=self._config_dir,
            config_path=self._config_path,
        )

    def _write_collection(self, collection: ExternalAgentCollection) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        self._config_path.write_text(
            collection.model_dump_json(indent=2),
            encoding="utf-8",
        )

    def _prepare_for_persistence(
        self,
        *,
        incoming: ExternalAgentConfig,
        current: ExternalAgentConfig | None,
    ) -> ExternalAgentConfig:
        if isinstance(incoming.transport, StdioTransportConfig):
            return incoming.model_copy(
                update={
                    "transport": incoming.transport.model_copy(
                        update={
                            "env": self._persist_secret_bindings(
                                agent_id=incoming.agent_id,
                                bindings=incoming.transport.env,
                                current_bindings=(
                                    current.transport.env
                                    if isinstance(current, ExternalAgentConfig)
                                    and isinstance(
                                        current.transport, StdioTransportConfig
                                    )
                                    else ()
                                ),
                                kind="env",
                            )
                        }
                    )
                }
            )
        if isinstance(incoming.transport, StreamableHttpTransportConfig):
            return incoming.model_copy(
                update={
                    "transport": incoming.transport.model_copy(
                        update={
                            "headers": self._persist_secret_bindings(
                                agent_id=incoming.agent_id,
                                bindings=incoming.transport.headers,
                                current_bindings=(
                                    current.transport.headers
                                    if isinstance(current, ExternalAgentConfig)
                                    and isinstance(
                                        current.transport,
                                        StreamableHttpTransportConfig,
                                    )
                                    else ()
                                ),
                                kind="header",
                            )
                        }
                    )
                }
            )
        if isinstance(incoming.transport, CustomTransportConfig):
            return incoming
        if isinstance(incoming.transport, RegistryTransportConfig):
            return incoming.model_copy(
                update={
                    "transport": incoming.transport.model_copy(
                        update={
                            "env": self._persist_secret_bindings(
                                agent_id=incoming.agent_id,
                                bindings=incoming.transport.env,
                                current_bindings=(
                                    current.transport.env
                                    if isinstance(current, ExternalAgentConfig)
                                    and isinstance(
                                        current.transport,
                                        RegistryTransportConfig,
                                    )
                                    else ()
                                ),
                                kind="env",
                            )
                        }
                    )
                }
            )
        raise ValueError(
            f"Unsupported external agent transport: {incoming.transport.transport.value}"
        )

    def _persist_secret_bindings(
        self,
        *,
        agent_id: str,
        bindings: tuple[ExternalAgentSecretBinding, ...],
        current_bindings: tuple[ExternalAgentSecretBinding, ...],
        kind: str,
    ) -> tuple[ExternalAgentSecretBinding, ...]:
        existing_names = {binding.name: binding for binding in current_bindings}
        next_bindings: list[ExternalAgentSecretBinding] = []
        seen_names: set[str] = set()
        for binding in bindings:
            normalized = _normalize_secret_binding(binding)
            if normalized.name in seen_names:
                raise ValueError(
                    f"Duplicate {kind} binding name for external agent {agent_id}: {normalized.name}"
                )
            seen_names.add(normalized.name)
            if normalized.secret:
                value = _normalize_optional_text(normalized.value)
                if value is not None:
                    self._secret_store.set_secret(
                        config_dir=self._config_dir,
                        agent_id=agent_id,
                        kind=kind,
                        name=normalized.name,
                        value=value,
                    )
                elif not normalized.configured:
                    self._secret_store.delete_secret(
                        config_dir=self._config_dir,
                        agent_id=agent_id,
                        kind=kind,
                        name=normalized.name,
                    )
                elif (
                    normalized.name not in existing_names
                    and self._secret_store.get_secret(
                        config_dir=self._config_dir,
                        agent_id=agent_id,
                        kind=kind,
                        name=normalized.name,
                    )
                    is None
                ):
                    raise ValueError(
                        f"Secret value is required for {kind} binding {normalized.name}"
                    )
                next_bindings.append(
                    normalized.model_copy(update={"value": None, "configured": False})
                )
                continue
            plain_value = _normalize_optional_text(normalized.value)
            if plain_value is None:
                raise ValueError(
                    f"Non-secret {kind} binding {normalized.name} requires a value"
                )
            next_bindings.append(
                normalized.model_copy(
                    update={
                        "value": plain_value,
                        "configured": True,
                    }
                )
            )
        return tuple(next_bindings)

    def _attach_secret_status(self, config: ExternalAgentConfig) -> ExternalAgentConfig:
        if isinstance(config.transport, StdioTransportConfig):
            return config.model_copy(
                update={
                    "transport": config.transport.model_copy(
                        update={
                            "env": self._attach_bindings(
                                agent_id=config.agent_id,
                                bindings=config.transport.env,
                                kind="env",
                            )
                        }
                    )
                }
            )
        if isinstance(config.transport, StreamableHttpTransportConfig):
            return config.model_copy(
                update={
                    "transport": config.transport.model_copy(
                        update={
                            "headers": self._attach_bindings(
                                agent_id=config.agent_id,
                                bindings=config.transport.headers,
                                kind="header",
                            )
                        }
                    )
                }
            )
        if isinstance(config.transport, RegistryTransportConfig):
            return config.model_copy(
                update={
                    "transport": config.transport.model_copy(
                        update={
                            "env": self._attach_bindings(
                                agent_id=config.agent_id,
                                bindings=config.transport.env,
                                kind="env",
                            )
                        }
                    )
                }
            )
        return config

    def _attach_bindings(
        self,
        *,
        agent_id: str,
        bindings: tuple[ExternalAgentSecretBinding, ...],
        kind: str,
    ) -> tuple[ExternalAgentSecretBinding, ...]:
        next_bindings: list[ExternalAgentSecretBinding] = []
        for binding in bindings:
            if binding.secret:
                configured = (
                    self._secret_store.get_secret(
                        config_dir=self._config_dir,
                        agent_id=agent_id,
                        kind=kind,
                        name=binding.name,
                    )
                    is not None
                )
                next_bindings.append(
                    binding.model_copy(update={"value": None, "configured": configured})
                )
                continue
            next_bindings.append(
                binding.model_copy(
                    update={
                        "configured": _normalize_optional_text(binding.value)
                        is not None
                    }
                )
            )
        return tuple(next_bindings)

    def _resolve_runtime_bindings(
        self,
        *,
        agent_id: str,
        bindings: tuple[ExternalAgentSecretBinding, ...],
        kind: str,
    ) -> tuple[ExternalAgentSecretBinding, ...]:
        next_bindings: list[ExternalAgentSecretBinding] = []
        for binding in bindings:
            if not binding.secret:
                next_bindings.append(binding)
                continue
            secret_value = self._secret_store.get_secret(
                config_dir=self._config_dir,
                agent_id=agent_id,
                kind=kind,
                name=binding.name,
            )
            next_bindings.append(
                binding.model_copy(
                    update={
                        "value": secret_value,
                        "configured": secret_value is not None,
                    }
                )
            )
        return tuple(next_bindings)

    @staticmethod
    def _normalize_agent(config: ExternalAgentConfig) -> ExternalAgentConfig:
        agent_id = _normalize_required_text(config.agent_id, "agent_id")
        name = _normalize_required_text(config.name, "name")
        description = str(config.description or "").strip()
        protocol = config.protocol
        if isinstance(config.transport, StdioTransportConfig):
            transport = config.transport.model_copy(
                update={
                    "command": _normalize_required_text(
                        config.transport.command,
                        "command",
                    ),
                    "args": tuple(
                        _normalize_required_text(item, "arg")
                        for item in config.transport.args
                    ),
                    "env": tuple(
                        _normalize_secret_binding(binding)
                        for binding in config.transport.env
                    ),
                }
            )
        elif isinstance(config.transport, StreamableHttpTransportConfig):
            transport = config.transport.model_copy(
                update={
                    "url": _normalize_required_text(config.transport.url, "url"),
                    "headers": tuple(
                        _normalize_secret_binding(binding)
                        for binding in config.transport.headers
                    ),
                }
            )
        elif isinstance(config.transport, CustomTransportConfig):
            transport = config.transport.model_copy(
                update={
                    "adapter_id": _normalize_required_text(
                        config.transport.adapter_id,
                        "adapter_id",
                    )
                }
            )
        elif isinstance(config.transport, RegistryTransportConfig):
            transport = config.transport.model_copy(
                update={
                    "registry_id": _normalize_required_text(
                        config.transport.registry_id,
                        "registry_id",
                    ),
                    "distribution": _normalize_registry_distribution(
                        config.transport.distribution
                    ),
                    "registry_version": str(
                        config.transport.registry_version or ""
                    ).strip(),
                    "env": tuple(
                        _normalize_secret_binding(binding)
                        for binding in config.transport.env
                    ),
                }
            )
        else:  # pragma: no cover - defensive guard for future transports
            raise ValueError(
                f"Unsupported external agent transport: {config.transport.transport.value}"
            )
        _validate_protocol_transport(protocol=protocol, transport=transport)
        return config.model_copy(
            update={
                "agent_id": agent_id,
                "name": name,
                "description": description,
                "protocol": protocol,
                "transport": transport,
            }
        )


def _normalize_secret_binding(
    binding: ExternalAgentSecretBinding,
) -> ExternalAgentSecretBinding:
    return binding.model_copy(
        update={
            "name": _normalize_required_text(binding.name, "binding_name"),
            "value": _normalize_optional_text(binding.value),
            "configured": binding.configured is True,
        }
    )


def _normalize_required_text(value: str, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required")
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _validate_protocol_transport(
    *,
    protocol: ExternalAgentProtocol,
    transport: StdioTransportConfig
    | StreamableHttpTransportConfig
    | CustomTransportConfig
    | RegistryTransportConfig,
) -> None:
    if protocol == ExternalAgentProtocol.A2A and not isinstance(
        transport, StreamableHttpTransportConfig
    ):
        raise ValueError("A2A agent runtimes require streamable_http transport")
    if protocol == ExternalAgentProtocol.CLI and not isinstance(
        transport, StdioTransportConfig
    ):
        raise ValueError("CLI agent runtimes require stdio transport")
    if protocol != ExternalAgentProtocol.ACP and isinstance(
        transport,
        RegistryTransportConfig,
    ):
        raise ValueError("Registry agent runtimes require acp protocol")


def _normalize_registry_distribution(value: str) -> str:
    normalized = str(value or "").strip()
    if normalized in {"auto", "binary", "npx", "uvx"}:
        return normalized
    raise ValueError("Registry distribution must be auto, binary, npx, or uvx")


def _load_persisted_collection(
    *,
    payload: object,
    config_dir: Path,
    config_path: Path,
) -> ExternalAgentCollection:
    normalized = _normalize_legacy_persisted_config(
        payload=payload,
        config_dir=config_dir,
    )
    payload_mapping = _object_mapping(normalized)
    if payload_mapping is None:
        return ExternalAgentCollection.model_validate(normalized)
    raw_agents = payload_mapping.get("agents")
    if not isinstance(raw_agents, list):
        return ExternalAgentCollection.model_validate(normalized)

    agents: list[ExternalAgentConfig] = []
    for index, raw_agent in enumerate(raw_agents):
        try:
            agents.append(ExternalAgentConfig.model_validate(raw_agent))
        except ValidationError as exc:
            LOGGER.warning(
                "Skipping invalid external agent config in %s at agents.%s (%s): %s",
                config_path,
                index,
                _agent_hint(raw_agent),
                _validation_summary(exc),
            )
    return ExternalAgentCollection(agents=tuple(agents))


def _normalize_legacy_persisted_config(
    *,
    payload: object,
    config_dir: Path,
) -> object:
    payload_mapping = _object_mapping(payload)
    if payload_mapping is None:
        return payload
    raw_agents = payload_mapping.get("agents")
    if not isinstance(raw_agents, list):
        return payload
    registry_entries = _load_legacy_registry_entries(config_dir)
    agents: list[object] = []
    for raw_agent in raw_agents:
        agents.append(
            _normalize_legacy_persisted_agent(
                raw_agent=raw_agent,
                config_dir=config_dir,
                registry_entries=registry_entries,
            )
        )
    return {**dict(payload_mapping), "agents": agents}


def _normalize_legacy_persisted_agent(
    *,
    raw_agent: object,
    config_dir: Path,
    registry_entries: Mapping[str, Mapping[str, object]],
) -> object:
    raw_agent_mapping = _object_mapping(raw_agent)
    if raw_agent_mapping is None:
        return raw_agent
    raw_transport_mapping = _object_mapping(raw_agent_mapping.get("transport"))
    if raw_transport_mapping is None:
        return raw_agent
    transport_type = _object_text(raw_transport_mapping.get("transport"))
    if transport_type == "stdio":
        return {
            **dict(raw_agent_mapping),
            "transport": {
                key: value
                for key, value in raw_transport_mapping.items()
                if key != "cwd"
            },
        }
    if transport_type != "registry":
        return raw_agent
    if _registry_transport_is_current(raw_transport_mapping):
        return raw_agent
    converted_transport = _legacy_registry_transport_to_stdio(
        raw_transport=raw_transport_mapping,
        config_dir=config_dir,
        registry_entries=registry_entries,
    )
    if converted_transport is None:
        return raw_agent
    return {**dict(raw_agent_mapping), "transport": converted_transport}


def _registry_transport_is_current(raw_transport: Mapping[str, object]) -> bool:
    try:
        RegistryTransportConfig.model_validate(raw_transport)
    except ValidationError:
        return False
    return True


def _legacy_registry_transport_to_stdio(
    *,
    raw_transport: Mapping[str, object],
    config_dir: Path,
    registry_entries: Mapping[str, Mapping[str, object]],
) -> dict[str, object] | None:
    registry_id = _object_text(raw_transport.get("registry_id"))
    if registry_id is None:
        return None
    registry_entry = _object_mapping(raw_transport.get("registry_entry"))
    if registry_entry is None:
        registry_entry = registry_entries.get(registry_id)
    distribution_kind = _object_text(raw_transport.get("distribution"))
    distribution = (
        _object_mapping(registry_entry.get("distribution"))
        if registry_entry is not None
        else None
    )
    if distribution_kind is None or distribution_kind == "auto":
        distribution_kind = _infer_legacy_distribution_kind(distribution)
    if distribution_kind == "npx":
        return _legacy_npx_transport(
            registry_id=registry_id,
            raw_transport=raw_transport,
            npx_distribution=_distribution_mapping(distribution, "npx"),
            config_dir=config_dir,
        )
    if distribution_kind == "uvx":
        return _legacy_uvx_transport(
            raw_transport=raw_transport,
            uvx_distribution=_distribution_mapping(distribution, "uvx"),
        )
    if distribution_kind == "binary":
        return _legacy_binary_transport(
            registry_id=registry_id,
            raw_transport=raw_transport,
            binary_distribution=_distribution_mapping(distribution, "binary"),
            config_dir=config_dir,
        )
    return None


def _legacy_binary_transport(
    *,
    registry_id: str,
    raw_transport: Mapping[str, object],
    binary_distribution: Mapping[str, object] | None,
    config_dir: Path,
) -> dict[str, object]:
    binary_entry = _current_platform_binary_distribution(binary_distribution)
    binary_command = (
        _object_text(binary_entry.get("cmd")) if binary_entry is not None else None
    )
    command = _legacy_installed_binary_command(
        registry_id=registry_id,
        registry_version=_object_text(raw_transport.get("registry_version")),
        binary_command=binary_command,
        config_dir=config_dir,
    )
    if command is None:
        command = binary_command or registry_id
    return {
        "transport": "stdio",
        "command": command,
        "args": _object_text_tuple(
            binary_entry.get("args") if binary_entry is not None else None
        ),
        "env": _legacy_env_bindings(
            raw_transport.get("env"),
            binary_entry.get("env") if binary_entry is not None else None,
        ),
    }


def _legacy_npx_transport(
    *,
    registry_id: str,
    raw_transport: Mapping[str, object],
    npx_distribution: Mapping[str, object] | None,
    config_dir: Path,
) -> dict[str, object] | None:
    if npx_distribution is None:
        return None
    package = _object_text(npx_distribution.get("package"))
    if package is None:
        return None
    package_args = _object_text_tuple(npx_distribution.get("args"))
    prefix_dir = _legacy_npx_prefix_dir(
        config_dir=config_dir,
        registry_id=registry_id,
    )
    cache_dir = prefix_dir / "cache"
    npm_path = _legacy_resolve_npm_path()
    if npm_path is not None:
        command = str(npm_path)
        args = (
            "exec",
            "--yes",
            "--prefix",
            str(prefix_dir),
            "--",
            package,
            *package_args,
        )
        env = _legacy_env_bindings_with_values(
            raw_transport.get("env"),
            npx_distribution.get("env"),
            {
                "NPM_CONFIG_PREFIX": str(prefix_dir),
                "NPM_CONFIG_CACHE": str(cache_dir),
            },
        )
    else:
        command = "npx"
        npx_args: list[str] = ["--yes"]
        if cache_dir.exists():
            npx_args.extend(("--cache", str(cache_dir)))
        npx_args.append(package)
        npx_args.extend(package_args)
        args = tuple(npx_args)
        env = _legacy_env_bindings(
            raw_transport.get("env"),
            npx_distribution.get("env"),
        )
    return {
        "transport": "stdio",
        "command": command,
        "args": args,
        "env": env,
    }


def _legacy_uvx_transport(
    *,
    raw_transport: Mapping[str, object],
    uvx_distribution: Mapping[str, object] | None,
) -> dict[str, object] | None:
    if uvx_distribution is None:
        return None
    package = _object_text(uvx_distribution.get("package"))
    if package is None:
        return None
    package_args = _object_text_tuple(uvx_distribution.get("args"))
    uvx_path = _legacy_resolve_executable_path("uvx")
    uv_path = _legacy_resolve_executable_path("uv")
    if uvx_path is not None:
        command = uvx_path
        args = (package, *package_args)
    elif uv_path is not None:
        command = uv_path
        args = ("tool", "run", package, *package_args)
    else:
        command = "uvx"
        args = (package, *package_args)
    return {
        "transport": "stdio",
        "command": command,
        "args": args,
        "env": _legacy_env_bindings(
            raw_transport.get("env"),
            uvx_distribution.get("env"),
        ),
    }


def _legacy_npx_prefix_dir(
    *,
    config_dir: Path,
    registry_id: str,
) -> Path:
    candidates = tuple(
        agent_dir / "npx"
        for agent_dir in _legacy_agent_dir_candidates(
            config_dir=config_dir,
            registry_id=registry_id,
        )
    )
    for candidate in candidates:
        if candidate.exists() or (candidate / "cache").exists():
            return candidate
    return candidates[0]


def _legacy_resolve_npm_path() -> Path | None:
    return resolve_npm_path()


def _legacy_resolve_executable_path(command: str) -> str | None:
    return resolve_registry_executable_path(command)


def _legacy_installed_binary_command(
    *,
    registry_id: str,
    registry_version: str | None,
    binary_command: str | None,
    config_dir: Path,
) -> str | None:
    candidate_names = _legacy_binary_candidate_names(
        registry_id=registry_id,
        binary_command=binary_command,
    )
    for agent_dir in _legacy_agent_dir_candidates(
        config_dir=config_dir,
        registry_id=registry_id,
    ):
        if not agent_dir.exists():
            continue
        for install_dir in _legacy_installed_binary_dirs(
            agent_dir=agent_dir,
            registry_version=registry_version,
        ):
            for candidate_name in candidate_names:
                for candidate in install_dir.rglob(candidate_name):
                    if candidate.is_file():
                        return str(candidate)
    return None


def _legacy_agent_dir_candidates(
    *,
    config_dir: Path,
    registry_id: str,
) -> tuple[Path, ...]:
    agents_dir = config_dir / _LEGACY_AGENT_RUNTIME_REGISTRY_DIR_NAME / "agents"
    safe_registry_id = registry_default_agent_id(registry_id)
    names = (safe_registry_id, registry_id)
    unique_names: list[str] = []
    for name in names:
        if name and name not in unique_names:
            unique_names.append(name)
    return tuple(agents_dir / name for name in unique_names)


def _legacy_installed_binary_dirs(
    *,
    agent_dir: Path,
    registry_version: str | None,
) -> tuple[Path, ...]:
    install_dirs = tuple(path for path in agent_dir.iterdir() if path.is_dir())
    filtered_dirs = (
        tuple(
            path
            for path in install_dirs
            if registry_version is not None
            and path.name.startswith(f"{registry_version}-")
        )
        if registry_version is not None
        else install_dirs
    )
    return tuple(
        sorted(
            filtered_dirs or install_dirs,
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    )


def _legacy_binary_candidate_names(
    *,
    registry_id: str,
    binary_command: str | None,
) -> tuple[str, ...]:
    names: list[str] = []
    if binary_command is not None:
        names.append(_command_leaf(binary_command))
    names.append(registry_id)
    names.append(registry_default_agent_id(registry_id))
    names.append(f"{registry_id}.exe")
    names.append(f"{registry_default_agent_id(registry_id)}.exe")
    unique_names: list[str] = []
    for name in names:
        if name and name not in unique_names:
            unique_names.append(name)
    return tuple(unique_names)


def _current_platform_binary_distribution(
    binary_distribution: Mapping[str, object] | None,
) -> Mapping[str, object] | None:
    if binary_distribution is None:
        return None
    return _object_mapping(binary_distribution.get(_current_platform_key()))


def _current_platform_key() -> str:
    system = platform.system().casefold()
    machine = platform.machine().casefold()
    arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
    if system == "darwin":
        return f"darwin-{arch}"
    if system == "linux":
        return f"linux-{arch}"
    if system == "windows":
        return f"windows-{arch}"
    return f"{system}-{arch}"


def _infer_legacy_distribution_kind(
    distribution: Mapping[str, object] | None,
) -> str | None:
    if distribution is None:
        return None
    binary_distribution = _distribution_mapping(distribution, "binary")
    if _current_platform_binary_distribution(binary_distribution) is not None:
        return "binary"
    for kind in ("npx", "uvx"):
        if _distribution_mapping(distribution, kind) is not None:
            return kind
    return None


def _distribution_mapping(
    distribution: Mapping[str, object] | None,
    key: str,
) -> Mapping[str, object] | None:
    if distribution is None:
        return None
    return _object_mapping(distribution.get(key))


def _legacy_env_bindings(
    raw_env: object,
    distribution_env: object,
) -> tuple[object, ...]:
    explicit_bindings = _legacy_env_values(raw_env)
    distribution_bindings = _legacy_env_values(distribution_env)
    if not explicit_bindings:
        return distribution_bindings
    explicit_names = {
        name
        for binding in explicit_bindings
        if (name := _binding_name(binding)) is not None
    }
    return (
        *explicit_bindings,
        *tuple(
            binding
            for binding in distribution_bindings
            if (name := _binding_name(binding)) is not None
            and name not in explicit_names
        ),
    )


def _legacy_env_bindings_with_values(
    raw_env: object,
    distribution_env: object,
    extra_env: Mapping[str, str],
) -> tuple[object, ...]:
    extra_bindings = _legacy_env_values(extra_env)
    extra_names = {
        name
        for binding in extra_bindings
        if (name := _binding_name(binding)) is not None
    }
    return (
        *tuple(
            binding
            for binding in _legacy_env_bindings(raw_env, distribution_env)
            if (name := _binding_name(binding)) is None or name not in extra_names
        ),
        *extra_bindings,
    )


def _legacy_env_values(value: object) -> tuple[object, ...]:
    if isinstance(value, list):
        return tuple(value)
    value_mapping = _object_mapping(value)
    if value_mapping is None:
        return ()
    bindings: list[object] = []
    for key, raw_value in value_mapping.items():
        normalized_name = _object_text(key)
        if normalized_name is None:
            continue
        bindings.append(
            {
                "name": normalized_name,
                "value": str(raw_value),
                "secret": False,
                "configured": True,
            }
        )
    return tuple(bindings)


def _binding_name(binding: object) -> str | None:
    binding_mapping = _object_mapping(binding)
    if binding_mapping is None:
        return None
    return _object_text(binding_mapping.get("name"))


def _load_legacy_registry_entries(
    config_dir: Path,
) -> Mapping[str, Mapping[str, object]]:
    registry_path = (
        config_dir
        / _LEGACY_AGENT_RUNTIME_REGISTRY_DIR_NAME
        / _LEGACY_AGENT_RUNTIME_REGISTRY_FILE_NAME
    )
    if not registry_path.exists():
        return {}
    try:
        payload = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning(
            "Failed to load legacy external agent runtime registry from %s: %s",
            registry_path,
            exc,
        )
        return {}
    payload_mapping = _object_mapping(payload)
    if payload_mapping is None:
        return {}
    raw_agents = payload_mapping.get("agents")
    if not isinstance(raw_agents, list):
        return {}
    entries: dict[str, Mapping[str, object]] = {}
    for raw_agent in raw_agents:
        raw_agent_mapping = _object_mapping(raw_agent)
        if raw_agent_mapping is None:
            continue
        registry_id = _object_text(raw_agent_mapping.get("id"))
        if registry_id is None:
            continue
        entries[registry_id] = raw_agent_mapping
    return entries


def _object_mapping(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, Mapping):
        return None
    return {key: raw_value for key, raw_value in value.items() if isinstance(key, str)}


def _object_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _object_text_tuple(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    items: list[str] = []
    for item in value:
        normalized = _object_text(item)
        if normalized is not None:
            items.append(normalized)
    return tuple(items)


def _command_leaf(command: str) -> str:
    return Path(command.strip().replace("\\", "/")).name


def _agent_hint(raw_agent: object) -> str:
    raw_agent_mapping = _object_mapping(raw_agent)
    if raw_agent_mapping is None:
        return "unknown"
    return (
        _object_text(raw_agent_mapping.get("agent_id"))
        or _object_text(raw_agent_mapping.get("name"))
        or "unknown"
    )


def _validation_summary(exc: ValidationError) -> str:
    errors = exc.errors(include_url=False, include_context=False, include_input=False)
    if not errors:
        return "validation failed"
    first_error = errors[0]
    location = _validation_location(first_error.get("loc"))
    message = first_error.get("msg")
    normalized_message = message if isinstance(message, str) else "validation failed"
    if location:
        return f"{location}: {normalized_message}"
    return normalized_message


def _validation_location(value: object) -> str:
    if not isinstance(value, tuple):
        return ""
    return ".".join(str(item) for item in value)
