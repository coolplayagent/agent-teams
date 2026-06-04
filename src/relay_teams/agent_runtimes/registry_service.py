# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import suppress
from datetime import datetime, timezone
import hashlib
import io
import json
import os
import platform
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import threading
from types import TracebackType
from typing import Protocol, cast
from urllib.parse import unquote, urlparse
import zipfile

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from relay_teams.agent_runtimes.models import (
    ExternalAgentConfig,
    ExternalAgentProtocol,
    ExternalAgentSecretBinding,
    RegistryEntrySnapshot,
    RegistryTransportConfig,
    StdioTransportConfig,
)
from relay_teams.agent_runtimes.registry_models import (
    AcpRegistryAgentView,
    AcpRegistryBinaryTarget,
    AcpRegistryCatalogResponse,
    AcpRegistryDistribution,
    AcpRegistryEntry,
    AcpRegistryIndex,
    AcpRegistryInstallRequest,
    AcpRegistryInstallResult,
    AcpRegistryResolvedRuntime,
)
from relay_teams.agent_runtimes.setup_models import (
    AgentRuntimeSetupPhase,
    AgentRuntimeSetupProgress,
    AgentRuntimeSetupProgressCallback,
)
from relay_teams.env.clawhub_cli import resolve_npm_path
from relay_teams.env.proxy_env import ProxyEnvConfig
from relay_teams.logger import get_logger
from relay_teams.net.clients import create_async_http_client
from relay_teams.validation import normalize_persisted_text

LOGGER = get_logger(__name__)

ACP_REGISTRY_URL = (
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"
)
REGISTRY_CACHE_SUBDIR = "agent-runtime-registry"
REGISTRY_CACHE_FILE = "registry.json"
REGISTRY_REFRESH_ERROR_FILE = "registry-refresh-error.json"
REGISTRY_REFRESH_THROTTLE_SECONDS = 60 * 60
REGISTRY_FETCH_TIMEOUT_SECONDS = 30.0
REGISTRY_INSTALL_TIMEOUT_SECONDS = 600.0
REGISTRY_LOCK_POLL_SECONDS = 0.05


class AcpRegistryError(RuntimeError):
    pass


class AcpRegistryUnsupportedError(AcpRegistryError):
    pass


class _RegistryRefreshErrorMarker(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempted_at: datetime
    message: str = Field(default="")


class AcpRegistryHttpClient(Protocol):
    async def __aenter__(self) -> "AcpRegistryHttpClient":
        raise NotImplementedError  # pragma: no cover

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        raise NotImplementedError  # pragma: no cover

    async def get(self, url: str) -> httpx.Response:
        raise NotImplementedError  # pragma: no cover

    def stream(self, method: str, url: httpx.URL | str) -> "AcpRegistryHttpStream":
        raise NotImplementedError  # pragma: no cover


class AcpRegistryHttpResponse(Protocol):
    status_code: int
    headers: httpx.Headers

    def aiter_bytes(self) -> AsyncIterator[bytes]:
        raise NotImplementedError  # pragma: no cover


class AcpRegistryHttpStream(Protocol):
    async def __aenter__(self) -> AcpRegistryHttpResponse:
        raise NotImplementedError  # pragma: no cover

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        raise NotImplementedError  # pragma: no cover


_DEFAULT_HTTP_CLIENT_FACTORY = cast(
    Callable[..., AcpRegistryHttpClient],
    cast(object, create_async_http_client),
)
_INSTALL_LOCKS_LOCK = threading.Lock()
_INSTALL_LOCKS: dict[tuple[str, str], threading.Lock] = {}


def registry_default_agent_id(registry_id: str) -> str:
    return _safe_path_component(registry_id)


def _path_list_separator() -> str:
    return ";" if os.name == "nt" else ":"


def _executable_candidate_paths(command_path: Path) -> tuple[Path, ...]:
    if os.name != "nt" or command_path.suffix:
        return (command_path,)
    pathext = os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD")
    extensions = tuple(
        extension if extension.startswith(".") else f".{extension}"
        for extension in pathext.split(_path_list_separator())
        if extension
    )
    return (
        command_path,
        *tuple(
            command_path.with_name(f"{command_path.name}{extension}")
            for extension in extensions
        ),
    )


def _resolve_existing_executable(command_path: Path) -> str | None:
    for candidate in _executable_candidate_paths(command_path):
        if not candidate.is_file():
            continue
        if os.name == "nt" or os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def _resolve_executable_path(command: str) -> str | None:
    command_text = command.strip()
    if not command_text:
        return None
    if "/" in command_text or "\\" in command_text:
        return _resolve_existing_executable(Path(command_text))
    for path_entry in os.environ.get("PATH", "").split(_path_list_separator()):
        search_dir = Path(path_entry) if path_entry else Path.cwd()
        resolved_path = _resolve_existing_executable(search_dir / command_text)
        if resolved_path is not None:
            return resolved_path
    return None


def resolve_registry_executable_path(command: str) -> str | None:
    return _resolve_executable_path(command)


class AcpRegistryService:
    def __init__(
        self,
        *,
        config_dir: Path,
        get_proxy_config: Callable[[], ProxyEnvConfig],
        create_http_client: Callable[..., AcpRegistryHttpClient] = (
            _DEFAULT_HTTP_CLIENT_FACTORY
        ),
        get_github_token: Callable[[], str | None] | None = None,
        resolve_npm: Callable[[], Path | None] = resolve_npm_path,
        resolve_executable: Callable[[str], str | None] = _resolve_executable_path,
    ) -> None:
        self._config_dir = config_dir.expanduser()
        self._registry_dir = self._config_dir / REGISTRY_CACHE_SUBDIR
        self._cache_path = self._registry_dir / REGISTRY_CACHE_FILE
        self._refresh_error_path = self._registry_dir / REGISTRY_REFRESH_ERROR_FILE
        self._get_proxy_config = get_proxy_config
        self._create_http_client = create_http_client
        self._get_github_token = get_github_token or (lambda: None)
        self._resolve_npm = resolve_npm
        self._resolve_executable = resolve_executable

    async def get_catalog(
        self,
        *,
        installed_agents: tuple[ExternalAgentConfig, ...] = (),
        refresh: bool = False,
    ) -> AcpRegistryCatalogResponse:
        index, fetched_at, stale, error = await self._load_index(refresh=refresh)
        agents = self._build_agent_views(
            index=index,
            installed_agents=installed_agents,
        )
        return AcpRegistryCatalogResponse(
            source_url=ACP_REGISTRY_URL,
            registry_version=index.version,
            agents=agents,
            fetched_at=fetched_at,
            cache_path=str(self._cache_path),
            stale=stale,
            error_message=error,
        )

    async def refresh_catalog(
        self,
        *,
        installed_agents: tuple[ExternalAgentConfig, ...] = (),
    ) -> AcpRegistryCatalogResponse:
        return await self.get_catalog(
            installed_agents=installed_agents,
            refresh=True,
        )

    async def build_install_config(
        self,
        *,
        registry_id: str,
        request: AcpRegistryInstallRequest,
        current_agent: ExternalAgentConfig | None = None,
    ) -> AcpRegistryInstallResult:
        index, _, _, _ = await self._load_index(refresh=False)
        entry = self._entry(index=index, registry_id=registry_id)
        distribution_preference = request.distribution
        if distribution_preference is None:
            distribution_preference = _preserved_registry_distribution(
                current_agent=current_agent,
                registry_id=entry.id,
            )
        distribution = self._select_distribution(
            entry,
            distribution_preference or AcpRegistryDistribution.AUTO,
        )
        agent_id = normalize_persisted_text(
            request.agent_id
        ) or registry_default_agent_id(entry.id)
        env_bindings = (
            _install_request_env_bindings(request.env)
            if request.env is not None
            else _preserved_registry_env_bindings(
                current_agent=current_agent,
                registry_id=entry.id,
            )
        )
        config = ExternalAgentConfig(
            agent_id=agent_id,
            name=entry.name,
            description=entry.description,
            protocol=ExternalAgentProtocol.ACP,
            transport=RegistryTransportConfig(
                registry_id=entry.id,
                distribution=distribution.value,
                registry_version=entry.version,
                registry_entry=_snapshot_for_entry(entry),
                env=env_bindings,
            ),
        )
        view = self._view_for_entry(
            entry=entry,
            installed_agents=(config,),
        )
        return AcpRegistryInstallResult(
            status="installed",
            agent=config,
            registry_agent=view,
            message=f"Installed registry runtime {entry.id}.",
        )

    async def resolve_runtime_transport_async(
        self,
        transport: RegistryTransportConfig,
        *,
        agent_id: str = "",
        progress_callback: AgentRuntimeSetupProgressCallback | None = None,
    ) -> StdioTransportConfig:
        progress_agent_id = agent_id or registry_default_agent_id(transport.registry_id)
        await _emit_setup_progress(
            progress_callback,
            agent_id=progress_agent_id,
            registry_id=transport.registry_id,
            distribution=transport.distribution,
            phase=AgentRuntimeSetupPhase.RESOLVING_REGISTRY,
            message="Resolving ACP registry runtime.",
        )
        index, _, _, _ = await self._load_index(refresh=False)
        entry = self._entry_for_transport(index=index, transport=transport)
        await _emit_setup_progress(
            progress_callback,
            agent_id=progress_agent_id,
            registry_id=entry.id,
            distribution=transport.distribution,
            phase=AgentRuntimeSetupPhase.SELECTING_DISTRIBUTION,
            message="Selecting Agent Runtime distribution.",
        )
        distribution = self._select_distribution(
            entry,
            AcpRegistryDistribution(transport.distribution),
        )
        resolved = await self._resolve_distribution(
            entry=entry,
            distribution=distribution,
            agent_id=progress_agent_id,
            progress_callback=progress_callback,
        )
        env = dict(resolved.env)
        env.update(
            {
                binding.name: binding.value
                for binding in transport.env
                if binding.value is not None
            }
        )
        return StdioTransportConfig(
            command=resolved.command,
            args=resolved.args,
            env=tuple(
                ExternalAgentSecretBinding(
                    name=name,
                    value=value,
                    configured=True,
                )
                for name, value in sorted(env.items())
            ),
        )

    async def _load_index(
        self,
        *,
        refresh: bool,
    ) -> tuple[AcpRegistryIndex, datetime | None, bool, str | None]:
        if refresh or not self._cache_path.is_file() or self._cache_is_stale():
            refresh_error = None if refresh else self._active_refresh_error_marker()
            if refresh_error is not None and self._cache_path.is_file():
                return (
                    self._read_cached_index(),
                    self._cache_mtime(),
                    True,
                    refresh_error.message or None,
                )
            try:
                index, raw = await self._fetch_index()
                self._registry_dir.mkdir(parents=True, exist_ok=True)
                self._cache_path.write_bytes(raw)
                self._clear_refresh_error_marker()
                return index, datetime.now(timezone.utc), False, None
            except Exception as exc:
                if not self._cache_path.is_file():
                    raise AcpRegistryError(
                        f"Failed to fetch ACP registry: {exc}"
                    ) from exc
                LOGGER.warning("Failed to refresh ACP registry: %s", exc)
                with suppress(Exception):
                    self._write_refresh_error_marker(str(exc))
                index = self._read_cached_index()
                return index, self._cache_mtime(), True, str(exc)
        return self._read_cached_index(), self._cache_mtime(), False, None

    async def _fetch_index(self) -> tuple[AcpRegistryIndex, bytes]:
        proxy_config = self._get_proxy_config()
        async with self._create_http_client(
            proxy_config=proxy_config,
            timeout_seconds=REGISTRY_FETCH_TIMEOUT_SECONDS,
            connect_timeout_seconds=REGISTRY_FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
        ) as client:
            response = await client.get(ACP_REGISTRY_URL)
        if response.status_code >= 400:
            raise AcpRegistryError(f"ACP registry returned HTTP {response.status_code}")
        raw = response.content
        return AcpRegistryIndex.model_validate_json(raw), raw

    def _read_cached_index(self) -> AcpRegistryIndex:
        raw = self._cache_path.read_bytes()
        return AcpRegistryIndex.model_validate_json(raw)

    def _cache_is_stale(self) -> bool:
        if not self._cache_path.is_file():
            return True
        mtime = self._cache_path.stat().st_mtime
        return datetime.now(timezone.utc).timestamp() - mtime > (
            REGISTRY_REFRESH_THROTTLE_SECONDS
        )

    def _cache_mtime(self) -> datetime | None:
        if not self._cache_path.is_file():
            return None
        return datetime.fromtimestamp(
            self._cache_path.stat().st_mtime,
            tz=timezone.utc,
        )

    def _active_refresh_error_marker(self) -> _RegistryRefreshErrorMarker | None:
        marker = self._read_refresh_error_marker()
        if marker is None:
            return None
        attempted_at = marker.attempted_at
        if attempted_at.tzinfo is None:
            attempted_at = attempted_at.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - attempted_at).total_seconds()
        if age_seconds > REGISTRY_REFRESH_THROTTLE_SECONDS:
            return None
        return marker

    def _read_refresh_error_marker(self) -> _RegistryRefreshErrorMarker | None:
        if not self._refresh_error_path.is_file():
            return None
        try:
            return _RegistryRefreshErrorMarker.model_validate_json(
                self._refresh_error_path.read_bytes()
            )
        except (OSError, ValidationError):
            return None

    def _write_refresh_error_marker(self, message: str) -> None:
        self._registry_dir.mkdir(parents=True, exist_ok=True)
        marker = _RegistryRefreshErrorMarker(
            attempted_at=datetime.now(timezone.utc),
            message=message,
        )
        self._refresh_error_path.write_text(
            marker.model_dump_json(),
            encoding="utf-8",
        )

    def _clear_refresh_error_marker(self) -> None:
        with suppress(OSError):
            self._refresh_error_path.unlink(missing_ok=True)

    def _build_agent_views(
        self,
        *,
        index: AcpRegistryIndex,
        installed_agents: tuple[ExternalAgentConfig, ...],
    ) -> tuple[AcpRegistryAgentView, ...]:
        return tuple(
            sorted(
                (
                    self._view_for_entry(
                        entry=entry,
                        installed_agents=installed_agents,
                    )
                    for entry in index.agents
                ),
                key=lambda item: (item.name.casefold(), item.registry_id),
            )
        )

    def _view_for_entry(
        self,
        *,
        entry: AcpRegistryEntry,
        installed_agents: tuple[ExternalAgentConfig, ...],
    ) -> AcpRegistryAgentView:
        installed = self._installed_agent_for_entry(
            entry=entry,
            installed_agents=installed_agents,
        )
        selected_distribution = self._safe_select_distribution(
            entry,
            AcpRegistryDistribution.AUTO,
        )
        installed_transport = (
            installed.transport
            if installed is not None
            and isinstance(installed.transport, RegistryTransportConfig)
            else None
        )
        installed_version = (
            installed_transport.registry_version if installed_transport else None
        )
        return AcpRegistryAgentView(
            registry_id=entry.id,
            name=entry.name,
            version=entry.version,
            description=entry.description,
            repository=entry.repository,
            website=entry.website,
            authors=entry.authors,
            license=entry.license,
            icon=entry.icon,
            distributions=self._distributions(entry),
            selected_distribution=selected_distribution,
            supports_current_platform=selected_distribution is not None,
            installed=installed is not None,
            installed_agent_id=installed.agent_id if installed is not None else None,
            installed_version=installed_version or None,
            update_available=(
                installed_version is not None and installed_version != entry.version
            ),
        )

    @staticmethod
    def _installed_agent_for_entry(
        *,
        entry: AcpRegistryEntry,
        installed_agents: tuple[ExternalAgentConfig, ...],
    ) -> ExternalAgentConfig | None:
        for agent in installed_agents:
            if (
                isinstance(agent.transport, RegistryTransportConfig)
                and agent.transport.registry_id == entry.id
            ):
                return agent
        return None

    @staticmethod
    def _distributions(
        entry: AcpRegistryEntry,
    ) -> tuple[AcpRegistryDistribution, ...]:
        distributions: list[AcpRegistryDistribution] = []
        if entry.distribution.binary:
            distributions.append(AcpRegistryDistribution.BINARY)
        if entry.distribution.npx is not None:
            distributions.append(AcpRegistryDistribution.NPX)
        if entry.distribution.uvx is not None:
            distributions.append(AcpRegistryDistribution.UVX)
        return tuple(distributions)

    @staticmethod
    def _entry(
        *,
        index: AcpRegistryIndex,
        registry_id: str,
    ) -> AcpRegistryEntry:
        entry = AcpRegistryService._find_entry(index=index, registry_id=registry_id)
        if entry is not None:
            return entry
        raise KeyError(f"Unknown ACP registry agent: {registry_id}")

    @staticmethod
    def _find_entry(
        *,
        index: AcpRegistryIndex,
        registry_id: str,
    ) -> AcpRegistryEntry | None:
        normalized = normalize_persisted_text(registry_id)
        for entry in index.agents:
            if entry.id == normalized:
                return entry
        return None

    @staticmethod
    def _entry_for_transport(
        *,
        index: AcpRegistryIndex,
        transport: RegistryTransportConfig,
    ) -> AcpRegistryEntry:
        current_entry = AcpRegistryService._find_entry(
            index=index,
            registry_id=transport.registry_id,
        )
        pinned_entry = _entry_from_snapshot(transport.registry_entry)
        if pinned_entry is not None and pinned_entry.id != transport.registry_id:
            LOGGER.warning(
                "Ignoring registry entry snapshot for %s because it contains %s.",
                transport.registry_id,
                pinned_entry.id,
            )
            pinned_entry = None
        installed_version = normalize_persisted_text(transport.registry_version)
        if (
            pinned_entry is not None
            and installed_version is not None
            and pinned_entry.version == installed_version
            and (current_entry is None or current_entry.version != installed_version)
        ):
            return pinned_entry
        if current_entry is not None:
            if (
                installed_version is not None
                and installed_version != current_entry.version
            ):
                LOGGER.warning(
                    "Registry runtime %s is installed at version %s but cached "
                    "registry has version %s and no matching installed snapshot; "
                    "using cached registry entry.",
                    transport.registry_id,
                    installed_version,
                    current_entry.version,
                )
            return current_entry
        if pinned_entry is not None:
            return pinned_entry
        raise KeyError(f"Unknown ACP registry agent: {transport.registry_id}")

    def _safe_select_distribution(
        self,
        entry: AcpRegistryEntry,
        preference: AcpRegistryDistribution,
    ) -> AcpRegistryDistribution | None:
        try:
            return self._select_distribution(entry, preference)
        except AcpRegistryUnsupportedError:
            return None

    def _select_distribution(
        self,
        entry: AcpRegistryEntry,
        preference: AcpRegistryDistribution,
    ) -> AcpRegistryDistribution:
        if preference == AcpRegistryDistribution.BINARY:
            if self._binary_target(entry) is None:
                raise AcpRegistryUnsupportedError(
                    f"Registry agent {entry.id} has no binary for this platform"
                )
            return AcpRegistryDistribution.BINARY
        if preference == AcpRegistryDistribution.NPX:
            if entry.distribution.npx is None:
                raise AcpRegistryUnsupportedError(
                    f"Registry agent {entry.id} has no npx distribution"
                )
            return AcpRegistryDistribution.NPX
        if preference == AcpRegistryDistribution.UVX:
            if entry.distribution.uvx is None:
                raise AcpRegistryUnsupportedError(
                    f"Registry agent {entry.id} has no uvx distribution"
                )
            return AcpRegistryDistribution.UVX
        if self._binary_target(entry) is not None:
            return AcpRegistryDistribution.BINARY
        if entry.distribution.npx is not None:
            return AcpRegistryDistribution.NPX
        if entry.distribution.uvx is not None:
            return AcpRegistryDistribution.UVX
        raise AcpRegistryUnsupportedError(
            f"Registry agent {entry.id} has no supported distribution"
        )

    async def _resolve_distribution(
        self,
        *,
        entry: AcpRegistryEntry,
        distribution: AcpRegistryDistribution,
        agent_id: str,
        progress_callback: AgentRuntimeSetupProgressCallback | None,
    ) -> AcpRegistryResolvedRuntime:
        if distribution == AcpRegistryDistribution.BINARY:
            return await self._resolve_binary(
                entry,
                agent_id=agent_id,
                progress_callback=progress_callback,
            )
        if distribution == AcpRegistryDistribution.NPX:
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=distribution.value,
                phase=AgentRuntimeSetupPhase.PREPARING_COMMAND,
                message=(
                    "Preparing npx command. The first launch may download the package."
                ),
            )
            resolved = self._resolve_npx(entry)
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=distribution.value,
                phase=AgentRuntimeSetupPhase.READY,
                message="Agent Runtime command is ready.",
                progress_percent=100,
            )
            return resolved
        if distribution == AcpRegistryDistribution.UVX:
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=distribution.value,
                phase=AgentRuntimeSetupPhase.PREPARING_COMMAND,
                message=(
                    "Preparing uvx command. The first launch may download the package."
                ),
            )
            resolved = self._resolve_uvx(entry)
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=distribution.value,
                phase=AgentRuntimeSetupPhase.READY,
                message="Agent Runtime command is ready.",
                progress_percent=100,
            )
            return resolved
        raise AcpRegistryUnsupportedError(
            f"Unsupported registry distribution: {distribution.value}"
        )

    async def _resolve_binary(
        self,
        entry: AcpRegistryEntry,
        *,
        agent_id: str,
        progress_callback: AgentRuntimeSetupProgressCallback | None,
    ) -> AcpRegistryResolvedRuntime:
        platform_target = self._binary_target(entry)
        if platform_target is None:
            raise AcpRegistryUnsupportedError(
                f"Registry agent {entry.id} has no binary for this platform"
            )
        target_key = self._binary_cache_key(entry, platform_target.archive)
        install_dir = (
            self._registry_dir / "agents" / _safe_path_component(entry.id) / target_key
        )
        lock = _install_lock(entry.id, target_key)
        await _emit_setup_progress(
            progress_callback,
            agent_id=agent_id,
            registry_id=entry.id,
            distribution=AcpRegistryDistribution.BINARY.value,
            phase=AgentRuntimeSetupPhase.CHECKING_CACHE,
            message="Checking cached Agent Runtime binary.",
            progress_percent=10,
        )
        if install_dir.is_dir():
            command = _resolve_binary_command(
                install_dir=install_dir,
                command=platform_target.cmd,
            )
            if os.name != "nt":
                current_mode = command.stat().st_mode
                command.chmod(current_mode | 0o755)
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.BINARY.value,
                phase=AgentRuntimeSetupPhase.READY,
                message="Agent Runtime binary is already prepared.",
                progress_percent=100,
            )
            return AcpRegistryResolvedRuntime(
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.BINARY,
                command=str(command),
                args=platform_target.args,
                env=platform_target.env,
            )
        if lock.locked():
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.BINARY.value,
                phase=AgentRuntimeSetupPhase.WAITING_FOR_LOCK,
                message="Waiting for another Agent Runtime preparation to finish.",
                progress_percent=12,
            )
        await _acquire_lock(lock)
        try:
            if not install_dir.is_dir():
                await self._download_and_extract_binary(
                    archive_url=platform_target.archive,
                    sha256=platform_target.sha256,
                    install_dir=install_dir,
                    command=platform_target.cmd,
                    agent_id=agent_id,
                    registry_id=entry.id,
                    progress_callback=progress_callback,
                )
            command = _resolve_binary_command(
                install_dir=install_dir,
                command=platform_target.cmd,
            )
            if os.name != "nt":
                current_mode = command.stat().st_mode
                command.chmod(current_mode | 0o755)
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.BINARY.value,
                phase=AgentRuntimeSetupPhase.READY,
                message="Agent Runtime binary is ready.",
                progress_percent=100,
            )
            return AcpRegistryResolvedRuntime(
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.BINARY,
                command=str(command),
                args=platform_target.args,
                env=platform_target.env,
            )
        finally:
            lock.release()

    def _resolve_npx(self, entry: AcpRegistryEntry) -> AcpRegistryResolvedRuntime:
        npx = entry.distribution.npx
        if npx is None:
            raise AcpRegistryUnsupportedError(
                f"Registry agent {entry.id} has no npx distribution"
            )
        npm_path = self._resolve_npm()
        if npm_path is None:
            raise AcpRegistryUnsupportedError(
                "npm is not available on PATH, so this registry agent cannot run."
            )
        prefix_dir = (
            self._registry_dir / "agents" / _safe_path_component(entry.id) / "npx"
        )
        prefix_dir.mkdir(parents=True, exist_ok=True)
        env = dict(npx.env)
        env.update(self._subprocess_proxy_env())
        env["NPM_CONFIG_PREFIX"] = str(prefix_dir)
        env["NPM_CONFIG_CACHE"] = str(prefix_dir / "cache")
        package = _bounded_npm_package_spec(npx.package)
        return AcpRegistryResolvedRuntime(
            registry_id=entry.id,
            distribution=AcpRegistryDistribution.NPX,
            command=str(npm_path),
            args=(
                "exec",
                "--yes",
                "--prefix",
                str(prefix_dir),
                "--",
                package,
                *npx.args,
            ),
            env=env,
        )

    def _resolve_uvx(self, entry: AcpRegistryEntry) -> AcpRegistryResolvedRuntime:
        uvx = entry.distribution.uvx
        if uvx is None:
            raise AcpRegistryUnsupportedError(
                f"Registry agent {entry.id} has no uvx distribution"
            )
        uvx_path = self._resolve_executable("uvx")
        uv_path = self._resolve_executable("uv")
        if uvx_path is None and uv_path is None:
            raise AcpRegistryUnsupportedError(
                "uvx or uv is not available on PATH, so this registry agent cannot run."
            )
        cache_dir = (
            self._registry_dir / "agents" / _safe_path_component(entry.id) / "uvx"
        )
        cache_dir.mkdir(parents=True, exist_ok=True)
        env = dict(uvx.env)
        env.update(self._subprocess_proxy_env())
        env["UV_CACHE_DIR"] = str(cache_dir / "cache")
        if uvx_path is not None:
            return AcpRegistryResolvedRuntime(
                registry_id=entry.id,
                distribution=AcpRegistryDistribution.UVX,
                command=uvx_path,
                args=(uvx.package, *uvx.args),
                env=env,
            )
        return AcpRegistryResolvedRuntime(
            registry_id=entry.id,
            distribution=AcpRegistryDistribution.UVX,
            command=uv_path or "uv",
            args=("tool", "run", uvx.package, *uvx.args),
            env=env,
        )

    def _subprocess_proxy_env(self) -> dict[str, str]:
        proxy_config = self._get_proxy_config()
        env = proxy_config.normalized_env()
        if not proxy_config.has_proxy:
            return env
        env["NODE_USE_ENV_PROXY"] = "1"
        http_proxy = proxy_config.http_proxy or proxy_config.all_proxy
        if http_proxy is not None:
            env["NPM_CONFIG_PROXY"] = http_proxy
            env["npm_config_proxy"] = http_proxy
        https_proxy = (
            proxy_config.https_proxy
            or proxy_config.http_proxy
            or proxy_config.all_proxy
        )
        if https_proxy is not None:
            env["NPM_CONFIG_HTTPS_PROXY"] = https_proxy
            env["npm_config_https_proxy"] = https_proxy
        if proxy_config.no_proxy is not None:
            env["NPM_CONFIG_NOPROXY"] = proxy_config.no_proxy
            env["npm_config_noproxy"] = proxy_config.no_proxy
        if proxy_config.ssl_verify is False:
            env["NPM_CONFIG_STRICT_SSL"] = "false"
            env["npm_config_strict_ssl"] = "false"
            env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
        elif proxy_config.ssl_verify:
            env["NPM_CONFIG_STRICT_SSL"] = "true"
            env["npm_config_strict_ssl"] = "true"
        return env

    async def _download_and_extract_binary(
        self,
        *,
        archive_url: str,
        sha256: str | None,
        install_dir: Path,
        command: str,
        agent_id: str,
        registry_id: str,
        progress_callback: AgentRuntimeSetupProgressCallback | None,
    ) -> None:
        temporary_dir = install_dir.with_name(f"{install_dir.name}.tmp")
        if temporary_dir.exists():
            shutil.rmtree(temporary_dir)
        temporary_dir.mkdir(parents=True, exist_ok=True)
        try:
            content = await self._download_bytes(
                archive_url,
                agent_id=agent_id,
                registry_id=registry_id,
                progress_callback=progress_callback,
            )
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=registry_id,
                distribution=AcpRegistryDistribution.BINARY.value,
                phase=AgentRuntimeSetupPhase.VERIFYING_CHECKSUM,
                message="Verifying Agent Runtime binary.",
                progress_percent=80,
                downloaded_bytes=len(content),
                total_bytes=len(content),
            )
            expected_sha = sha256 or await self._github_asset_sha256(archive_url)
            if expected_sha is not None:
                _verify_sha256(content, expected_sha)
            await _emit_setup_progress(
                progress_callback,
                agent_id=agent_id,
                registry_id=registry_id,
                distribution=AcpRegistryDistribution.BINARY.value,
                phase=AgentRuntimeSetupPhase.EXTRACTING,
                message="Extracting Agent Runtime binary.",
                progress_percent=90,
                downloaded_bytes=len(content),
                total_bytes=len(content),
            )
            _safe_materialize_binary_payload(
                content=content,
                archive_url=archive_url,
                target_dir=temporary_dir,
                command=command,
            )
            if install_dir.exists():
                shutil.rmtree(install_dir)
            temporary_dir.replace(install_dir)
        except Exception:
            shutil.rmtree(temporary_dir, ignore_errors=True)
            raise

    async def _download_bytes(
        self,
        url: str,
        *,
        agent_id: str,
        registry_id: str,
        progress_callback: AgentRuntimeSetupProgressCallback | None,
    ) -> bytes:
        await _emit_setup_progress(
            progress_callback,
            agent_id=agent_id,
            registry_id=registry_id,
            distribution=AcpRegistryDistribution.BINARY.value,
            phase=AgentRuntimeSetupPhase.DOWNLOADING,
            message="Downloading Agent Runtime binary.",
            progress_percent=15,
        )
        async with self._create_http_client(
            proxy_config=self._get_proxy_config(),
            timeout_seconds=REGISTRY_INSTALL_TIMEOUT_SECONDS,
            connect_timeout_seconds=REGISTRY_FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
        ) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    raise AcpRegistryError(
                        f"Failed to download {url}: HTTP {response.status_code}"
                    )
                total_bytes = _content_length(response.headers)
                chunks: list[bytes] = []
                downloaded_bytes = 0
                last_progress_percent = 15
                last_unbounded_report = 0
                if total_bytes is None:
                    await _emit_setup_progress(
                        progress_callback,
                        agent_id=agent_id,
                        registry_id=registry_id,
                        distribution=AcpRegistryDistribution.BINARY.value,
                        phase=AgentRuntimeSetupPhase.DOWNLOADING,
                        message="Downloading Agent Runtime binary.",
                        progress_percent=None,
                    )
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    chunks.append(chunk)
                    downloaded_bytes += len(chunk)
                    if total_bytes is None:
                        if downloaded_bytes - last_unbounded_report < 1024 * 1024:
                            continue
                        last_unbounded_report = downloaded_bytes
                        await _emit_setup_progress(
                            progress_callback,
                            agent_id=agent_id,
                            registry_id=registry_id,
                            distribution=AcpRegistryDistribution.BINARY.value,
                            phase=AgentRuntimeSetupPhase.DOWNLOADING,
                            message="Downloading Agent Runtime binary.",
                            downloaded_bytes=downloaded_bytes,
                            total_bytes=None,
                        )
                        continue
                    progress_percent = min(
                        75,
                        15 + int(downloaded_bytes / max(total_bytes, 1) * 60),
                    )
                    if progress_percent <= last_progress_percent:
                        continue
                    last_progress_percent = progress_percent
                    await _emit_setup_progress(
                        progress_callback,
                        agent_id=agent_id,
                        registry_id=registry_id,
                        distribution=AcpRegistryDistribution.BINARY.value,
                        phase=AgentRuntimeSetupPhase.DOWNLOADING,
                        message="Downloading Agent Runtime binary.",
                        progress_percent=progress_percent,
                        downloaded_bytes=downloaded_bytes,
                        total_bytes=total_bytes,
                    )
                return b"".join(chunks)

    async def _github_asset_sha256(self, archive_url: str) -> str | None:
        release = _github_release_from_url(archive_url)
        if release is None:
            return None
        repo, tag, asset_name = release
        api_url = (
            f"https://api.github.com/repos/{repo}/releases/latest"
            if tag == "latest"
            else f"https://api.github.com/repos/{repo}/releases/tags/{tag}"
        )
        headers = {"Accept": "application/vnd.github+json"}
        token = normalize_persisted_text(self._get_github_token())
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        async with self._create_http_client(
            proxy_config=self._get_proxy_config(),
            headers=headers,
            timeout_seconds=REGISTRY_FETCH_TIMEOUT_SECONDS,
            connect_timeout_seconds=REGISTRY_FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
        ) as client:
            response = await client.get(api_url)
        if response.status_code >= 400:
            return None
        payload = json.loads(response.content)
        if not isinstance(payload, dict):
            return None
        assets = payload.get("assets")
        if not isinstance(assets, list):
            return None
        for item in assets:
            if not isinstance(item, dict):
                continue
            if item.get("name") != asset_name:
                continue
            digest = item.get("digest")
            if not isinstance(digest, str) or not digest.strip():
                return None
            return digest.removeprefix("sha256:")
        return None

    @staticmethod
    def _binary_cache_key(entry: AcpRegistryEntry, archive_url: str) -> str:
        digest = hashlib.sha256(archive_url.encode("utf-8")).hexdigest()[:12]
        return f"{_safe_path_component(entry.version)}-{digest}"

    @staticmethod
    def _binary_target(
        entry: AcpRegistryEntry,
    ) -> AcpRegistryBinaryTarget | None:
        platform_key = _current_registry_platform_key()
        if platform_key is None:
            return None
        return entry.distribution.binary.get(platform_key)


async def _emit_setup_progress(
    callback: AgentRuntimeSetupProgressCallback | None,
    *,
    agent_id: str,
    registry_id: str,
    distribution: str,
    phase: AgentRuntimeSetupPhase,
    message: str,
    progress_percent: int | None = None,
    downloaded_bytes: int = 0,
    total_bytes: int | None = None,
) -> None:
    if callback is None:
        return
    await callback(
        AgentRuntimeSetupProgress(
            agent_id=agent_id,
            registry_id=registry_id,
            distribution=distribution,
            phase=phase,
            message=message,
            progress_percent=progress_percent,
            downloaded_bytes=downloaded_bytes,
            total_bytes=total_bytes,
        )
    )


def _content_length(headers: httpx.Headers) -> int | None:
    raw_value = headers.get("content-length")
    if raw_value is None:
        return None
    try:
        value = int(raw_value)
    except ValueError:
        return None
    if value < 0:
        return None
    return value


def _install_lock(registry_id: str, target_key: str) -> threading.Lock:
    key = (registry_id, target_key)
    with _INSTALL_LOCKS_LOCK:
        lock = _INSTALL_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _INSTALL_LOCKS[key] = lock
        return lock


async def _acquire_lock(lock: threading.Lock) -> None:
    while True:
        acquired = lock.acquire(blocking=False)
        if acquired:
            return
        await asyncio.sleep(REGISTRY_LOCK_POLL_SECONDS)


def _current_registry_platform_key() -> str | None:
    system = platform.system().strip().lower()
    if system == "windows":
        os_part = "windows"
    elif system == "darwin":
        os_part = "darwin"
    elif system == "linux":
        os_part = "linux"
    else:
        return None
    machine = platform.machine().strip().lower()
    if machine in {"amd64", "x86_64", "x64"}:
        arch_part = "x86_64"
    elif machine in {"arm64", "aarch64"}:
        arch_part = "aarch64"
    else:
        return None
    return f"{os_part}-{arch_part}"


def _snapshot_for_entry(entry: AcpRegistryEntry) -> RegistryEntrySnapshot:
    return RegistryEntrySnapshot.model_validate(entry.model_dump(mode="json"))


def _entry_from_snapshot(
    snapshot: RegistryEntrySnapshot | None,
) -> AcpRegistryEntry | None:
    if snapshot is None:
        return None
    return AcpRegistryEntry.model_validate(snapshot.model_dump(mode="json"))


def _install_request_env_bindings(
    env: dict[str, str],
) -> tuple[ExternalAgentSecretBinding, ...]:
    return tuple(
        ExternalAgentSecretBinding(
            name=name,
            value=value,
            secret=True,
        )
        for name, value in sorted((key.strip(), item) for key, item in env.items())
        if name
    )


def _preserved_registry_env_bindings(
    *,
    current_agent: ExternalAgentConfig | None,
    registry_id: str,
) -> tuple[ExternalAgentSecretBinding, ...]:
    if not isinstance(current_agent, ExternalAgentConfig) or not isinstance(
        current_agent.transport,
        RegistryTransportConfig,
    ):
        return ()
    if current_agent.transport.registry_id != registry_id:
        return ()
    return current_agent.transport.env


def _preserved_registry_distribution(
    *,
    current_agent: ExternalAgentConfig | None,
    registry_id: str,
) -> AcpRegistryDistribution | None:
    if not isinstance(current_agent, ExternalAgentConfig) or not isinstance(
        current_agent.transport,
        RegistryTransportConfig,
    ):
        return None
    if current_agent.transport.registry_id != registry_id:
        return None
    return AcpRegistryDistribution(current_agent.transport.distribution)


def _safe_path_component(value: str) -> str:
    normalized = "".join(
        char if char.isalnum() or char in {"-", "_", "."} else "-"
        for char in value.strip()
    ).strip(".-")
    return normalized or "agent"


def _bounded_npm_package_spec(package_spec: str) -> str:
    package_name, separator, version = package_spec.rpartition("@")
    if not separator or not package_name or not _looks_like_semver(version):
        return package_spec
    return f"{package_name}@0.0.0 - {version}"


def _looks_like_semver(value: str) -> bool:
    parts = value.split(".")
    if len(parts) < 3:
        return False
    return all(part.split("-", 1)[0].isdigit() for part in parts[:3])


def _verify_sha256(content: bytes, expected: str) -> None:
    normalized_expected = expected.removeprefix("sha256:").strip().lower()
    actual = hashlib.sha256(content).hexdigest()
    if actual != normalized_expected:
        raise AcpRegistryError(
            f"Checksum mismatch for registry binary: expected {normalized_expected}, got {actual}"
        )


def _safe_extract_archive(content: bytes, archive_url: str, target_dir: Path) -> None:
    suffix = archive_url.lower()
    if suffix.endswith(".zip"):
        _safe_extract_zip(content, target_dir)
        return
    if suffix.endswith((".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz")):
        _safe_extract_tar(content, target_dir)
        return
    raise AcpRegistryError(f"Unsupported registry binary archive type: {archive_url}")


def _safe_materialize_binary_payload(
    *,
    content: bytes,
    archive_url: str,
    target_dir: Path,
    command: str,
) -> None:
    suffix = archive_url.lower()
    if suffix.endswith(
        (".zip", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz")
    ):
        _safe_extract_archive(content, archive_url, target_dir)
        return
    destination = _raw_binary_destination(target_dir=target_dir, command=command)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    if os.name != "nt":
        destination.chmod(0o755)


def _raw_binary_destination(*, target_dir: Path, command: str) -> Path:
    normalized = command.strip().replace("\\", "/")
    if not normalized:
        raise AcpRegistryError("Registry binary command is empty")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return _safe_member_destination(target_dir, normalized)


def _safe_extract_zip(content: bytes, target_dir: Path) -> None:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        for info in archive.infolist():
            name = info.filename
            if not name or name.endswith("/"):
                continue
            destination = _safe_member_destination(target_dir, name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source:
                destination.write_bytes(source.read())
            mode = (info.external_attr >> 16) & 0o777
            if mode and os.name != "nt":
                destination.chmod(mode)


def _safe_extract_tar(content: bytes, target_dir: Path) -> None:
    with tarfile.open(fileobj=io.BytesIO(content)) as archive:
        for member in archive.getmembers():
            if member.isdir():
                _safe_member_destination(target_dir, member.name).mkdir(
                    parents=True,
                    exist_ok=True,
                )
                continue
            if not member.isfile():
                continue
            destination = _safe_member_destination(target_dir, member.name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                continue
            destination.write_bytes(source.read())
            if os.name != "nt":
                destination.chmod(member.mode & 0o777)


def _safe_member_destination(target_dir: Path, member_name: str) -> Path:
    normalized = PurePosixPath(member_name.replace("\\", "/"))
    if normalized.is_absolute() or ".." in normalized.parts:
        raise AcpRegistryError(f"Unsafe registry archive member: {member_name}")
    destination = (target_dir / Path(*normalized.parts)).resolve()
    target_root = target_dir.resolve()
    if destination != target_root and target_root not in destination.parents:
        raise AcpRegistryError(f"Unsafe registry archive member: {member_name}")
    return destination


def _resolve_binary_command(*, install_dir: Path, command: str) -> Path:
    normalized = command.strip().replace("\\", "/")
    if not normalized:
        raise AcpRegistryError("Registry binary command is empty")
    command_path = PurePosixPath(normalized)
    if command_path.is_absolute() or ".." in command_path.parts:
        raise AcpRegistryError(f"Unsafe registry binary command path: {command}")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    path = (install_dir / Path(*PurePosixPath(normalized).parts)).resolve()
    install_root = install_dir.resolve()
    if path != install_root and install_root not in path.parents:
        raise AcpRegistryError(f"Unsafe registry binary command path: {command}")
    if not path.is_file():
        raise AcpRegistryError(f"Registry binary command not found: {path}")
    return path


def _github_release_from_url(
    archive_url: str,
) -> tuple[str, str, str] | None:
    parsed = urlparse(archive_url)
    if parsed.scheme != "https" or parsed.netloc != "github.com":
        return None
    parts = [unquote(part) for part in parsed.path.split("/") if part]
    if len(parts) < 6 or parts[2] != "releases":
        return None
    repo = f"{parts[0]}/{parts[1]}"
    if parts[3] == "download":
        return repo, parts[4], parts[5]
    if parts[3] == "latest" and parts[4] == "download":
        return repo, "latest", parts[5]
    return None
