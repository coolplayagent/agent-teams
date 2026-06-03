# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import platform
import threading
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import TracebackType
import tarfile
import zipfile

import httpx
import pytest

from relay_teams.agent_runtimes import (
    AcpRegistryDistribution,
    AcpRegistryError,
    AcpRegistryInstallRequest,
    AcpRegistryService,
    ExternalAgentConfig,
    ExternalAgentProtocol,
    ExternalAgentSecretBinding,
    RegistryTransportConfig,
    StdioTransportConfig,
)
from relay_teams.agent_runtimes import registry_service as registry_service_module
from relay_teams.env.proxy_env import ProxyEnvConfig


class _FakeHttpClient:
    def __init__(
        self,
        response: httpx.Response | Exception,
        urls: list[str],
    ) -> None:
        self._response = response
        self._urls = urls

    async def __aenter__(self) -> "_FakeHttpClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        _ = (exc_type, exc_value, traceback)

    async def get(self, url: str) -> httpx.Response:
        self._urls.append(url)
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class _FakeHttpClientFactory:
    def __init__(self, responses: list[httpx.Response | Exception]) -> None:
        self._responses = responses
        self.calls: list[dict[str, object]] = []
        self.urls: list[str] = []

    def __call__(self, **kwargs: object) -> _FakeHttpClient:
        self.calls.append(kwargs)
        if not self._responses:
            raise RuntimeError("No fake HTTP responses left")
        return _FakeHttpClient(self._responses.pop(0), self.urls)


def test_resolve_executable_path_rejects_blank_command() -> None:
    assert registry_service_module._resolve_executable_path("  ") is None


def test_resolve_executable_path_searches_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable_name = "vendor.CMD" if os.name == "nt" else "vendor"
    executable_path = bin_dir / executable_name
    executable_path.write_text("", encoding="utf-8")
    if os.name == "nt":
        monkeypatch.setenv("PATHEXT", ".CMD")
    else:
        executable_path.chmod(0o755)
    monkeypatch.setenv("PATH", str(bin_dir))

    resolved_path = registry_service_module._resolve_executable_path("vendor")

    assert resolved_path == str(executable_path)


def test_registry_helper_bounds_npm_versions_and_detects_platform(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(platform, "machine", lambda: "x86_64")

    assert (
        registry_service_module._bounded_npm_package_spec("@vendor/runtime@1.2.3")
        == "@vendor/runtime@0.0.0 - 1.2.3"
    )
    assert (
        registry_service_module._bounded_npm_package_spec("vendor-runtime")
        == "vendor-runtime"
    )
    assert registry_service_module._current_registry_platform_key() == "linux-x86_64"

    monkeypatch.setattr(platform, "system", lambda: "Plan9")
    assert registry_service_module._current_registry_platform_key() is None

    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(platform, "machine", lambda: "arm64")
    assert registry_service_module._current_registry_platform_key() == "darwin-aarch64"

    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(platform, "machine", lambda: "mips")
    assert registry_service_module._current_registry_platform_key() is None


def test_github_release_url_parser_decodes_expected_asset() -> None:
    assert registry_service_module._github_release_from_url(
        "https://github.com/vendor/runtime/releases/download/v1.2.3/agent%20win.zip"
    ) == ("vendor/runtime", "v1.2.3", "agent win.zip")
    assert registry_service_module._github_release_from_url(
        "https://github.com/vendor/runtime/releases/latest/download/agent.zip"
    ) == ("vendor/runtime", "latest", "agent.zip")
    assert (
        registry_service_module._github_release_from_url(
            "https://example.test/vendor/runtime/releases/download/v1.2.3/agent.zip"
        )
        is None
    )


def test_binary_command_resolution_rejects_unsafe_or_missing_paths(
    tmp_path: Path,
) -> None:
    install_dir = tmp_path / "runtime"
    bin_dir = install_dir / "bin"
    bin_dir.mkdir(parents=True)
    executable = bin_dir / "agent"
    executable.write_text("", encoding="utf-8")

    assert (
        registry_service_module._resolve_binary_command(
            install_dir=install_dir,
            command="./bin/agent",
        )
        == executable.resolve()
    )

    with pytest.raises(AcpRegistryError, match="command is empty"):
        registry_service_module._resolve_binary_command(
            install_dir=install_dir,
            command=" ",
        )
    with pytest.raises(AcpRegistryError, match="Unsafe registry binary command path"):
        registry_service_module._resolve_binary_command(
            install_dir=install_dir,
            command="../agent",
        )
    with pytest.raises(AcpRegistryError, match="Registry binary command not found"):
        registry_service_module._resolve_binary_command(
            install_dir=install_dir,
            command="missing",
        )


def test_archive_extraction_supports_tar_and_rejects_unsupported_or_unsafe(
    tmp_path: Path,
) -> None:
    target_dir = tmp_path / "target"
    target_dir.mkdir()

    registry_service_module._safe_extract_archive(
        _tar_bytes({"bin/agent": b"runtime"}),
        "https://example.test/runtime.tgz",
        target_dir,
    )

    assert (target_dir / "bin" / "agent").read_bytes() == b"runtime"
    with pytest.raises(AcpRegistryError, match="Unsupported registry binary archive"):
        registry_service_module._safe_extract_archive(
            b"not an archive",
            "https://example.test/runtime.bin",
            target_dir,
        )
    with pytest.raises(AcpRegistryError, match="Unsafe registry archive member"):
        registry_service_module._safe_extract_archive(
            _tar_bytes({"../agent": b"runtime"}),
            "https://example.test/runtime.tgz",
            target_dir,
        )


@pytest.mark.asyncio
async def test_registry_catalog_raises_when_fetch_fails_without_cache(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([RuntimeError("offline")]),
    )

    with pytest.raises(AcpRegistryError, match="Failed to fetch ACP registry"):
        await service.get_catalog()


@pytest.mark.asyncio
async def test_registry_catalog_raises_for_http_error_without_cache(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([httpx.Response(503, content=b"offline")]),
    )

    with pytest.raises(AcpRegistryError, match="ACP registry returned HTTP 503"):
        await service.get_catalog()


@pytest.mark.asyncio
async def test_registry_catalog_uses_proxy_client_and_cached_fallback(
    tmp_path: Path,
) -> None:
    factory = _FakeHttpClientFactory(
        [
            _json_response(_registry_payload(_npx_agent("vendor/runtime"))),
            RuntimeError("offline"),
        ]
    )
    service = _service(tmp_path, factory=factory)

    first = await service.get_catalog()
    cache_path = tmp_path / "agent-runtime-registry" / "registry.json"
    os.utime(cache_path, (0, 0))
    second = await service.get_catalog(refresh=True)
    third = await service.get_catalog()

    assert first.registry_version == "1.0.0"
    assert first.agents[0].registry_id == "vendor/runtime"
    assert first.agents[0].authors == ("Vendor Team",)
    assert first.agents[0].license == "MIT"
    assert second.stale is True
    assert second.error_message == "offline"
    assert third.stale is True
    assert third.error_message == "offline"
    assert len(factory.calls) == 2
    assert factory.calls[0]["proxy_config"] == _proxy_config()
    assert factory.calls[0]["timeout_seconds"] == 30.0


@pytest.mark.asyncio
async def test_registry_catalog_uses_fresh_cache_without_refetch(
    tmp_path: Path,
) -> None:
    factory = _FakeHttpClientFactory(
        [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
    )
    service = _service(tmp_path, factory=factory)

    first = await service.get_catalog()
    second = await service.get_catalog()

    assert first.registry_version == "1.0.0"
    assert second.registry_version == "1.0.0"
    assert len(factory.calls) == 1


def test_registry_refresh_error_marker_handles_missing_stale_and_invalid_files(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([]),
    )

    assert service._active_refresh_error_marker() is None
    service._write_refresh_error_marker("offline")
    active = service._active_refresh_error_marker()
    assert active is not None
    assert active.message == "offline"

    stale_marker = {
        "attempted_at": (
            datetime.now(timezone.utc)
            - timedelta(
                seconds=registry_service_module.REGISTRY_REFRESH_THROTTLE_SECONDS + 1
            )
        ).isoformat(),
        "message": "stale",
    }
    service._refresh_error_path.write_text(json.dumps(stale_marker), encoding="utf-8")
    assert service._active_refresh_error_marker() is None

    service._refresh_error_path.write_text("{", encoding="utf-8")
    assert service._read_refresh_error_marker() is None


@pytest.mark.asyncio
async def test_registry_install_defaults_agent_id_to_route_safe_slug(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
        ),
    )

    result = await service.build_install_config(
        registry_id="vendor/runtime",
        request=AcpRegistryInstallRequest(env={"VENDOR_TOKEN": "from-env"}),
    )

    assert result.agent.agent_id == "vendor-runtime"
    assert isinstance(result.agent.transport, RegistryTransportConfig)
    assert result.agent.transport.registry_id == "vendor/runtime"
    assert result.agent.transport.env[0].name == "VENDOR_TOKEN"
    assert result.agent.transport.env[0].value == "from-env"
    assert result.agent.transport.env[0].secret is True
    assert result.agent.transport.registry_entry is not None
    assert result.agent.transport.registry_entry.id == "vendor/runtime"
    assert result.agent.transport.registry_entry.version == "2.0.0"


@pytest.mark.asyncio
async def test_registry_update_preserves_existing_env_when_env_omitted(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
        ),
    )
    current_agent = ExternalAgentConfig(
        agent_id="vendor_runtime",
        name="Vendor Runtime",
        protocol=ExternalAgentProtocol.ACP,
        transport=RegistryTransportConfig(
            registry_id="vendor/runtime",
            distribution="npx",
            registry_version="1.0.0",
            env=(
                ExternalAgentSecretBinding(
                    name="VENDOR_TOKEN",
                    secret=True,
                    configured=True,
                ),
            ),
        ),
    )

    result = await service.build_install_config(
        registry_id="vendor/runtime",
        request=AcpRegistryInstallRequest(
            agent_id="vendor_runtime",
            distribution=AcpRegistryDistribution.NPX,
        ),
        current_agent=current_agent,
    )

    assert isinstance(result.agent.transport, RegistryTransportConfig)
    current_transport = current_agent.transport
    assert isinstance(current_transport, RegistryTransportConfig)
    assert result.agent.transport.env == current_transport.env


@pytest.mark.asyncio
async def test_registry_update_preserves_existing_distribution_when_omitted(
    tmp_path: Path,
) -> None:
    agent = _npx_agent("vendor/runtime")
    agent["distribution"] = {
        "npx": {
            "package": "@vendor/runtime@1.2.3",
            "args": ["--stdio"],
            "env": {},
        },
        "uvx": {
            "package": "vendor-runtime",
            "args": ["--serve"],
            "env": {},
        },
    }
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([_json_response(_registry_payload(agent))]),
    )
    current_agent = ExternalAgentConfig(
        agent_id="vendor_runtime",
        name="Vendor Runtime",
        protocol=ExternalAgentProtocol.ACP,
        transport=RegistryTransportConfig(
            registry_id="vendor/runtime",
            distribution="uvx",
            registry_version="1.0.0",
        ),
    )

    result = await service.build_install_config(
        registry_id="vendor/runtime",
        request=AcpRegistryInstallRequest(agent_id="vendor_runtime"),
        current_agent=current_agent,
    )

    assert isinstance(result.agent.transport, RegistryTransportConfig)
    assert result.agent.transport.distribution == "uvx"


@pytest.mark.asyncio
async def test_registry_update_clears_existing_env_when_empty_env_is_explicit(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
        ),
    )
    current_agent = ExternalAgentConfig(
        agent_id="vendor_runtime",
        name="Vendor Runtime",
        protocol=ExternalAgentProtocol.ACP,
        transport=RegistryTransportConfig(
            registry_id="vendor/runtime",
            distribution="npx",
            registry_version="1.0.0",
            env=(
                ExternalAgentSecretBinding(
                    name="VENDOR_TOKEN",
                    secret=True,
                    configured=True,
                ),
            ),
        ),
    )

    result = await service.build_install_config(
        registry_id="vendor/runtime",
        request=AcpRegistryInstallRequest(
            agent_id="vendor_runtime",
            distribution=AcpRegistryDistribution.NPX,
            env={},
        ),
        current_agent=current_agent,
    )

    assert isinstance(result.agent.transport, RegistryTransportConfig)
    assert result.agent.transport.env == ()


@pytest.mark.asyncio
async def test_registry_install_rejects_unknown_registry_id(tmp_path: Path) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
        ),
    )

    with pytest.raises(KeyError, match="Unknown ACP registry agent"):
        await service.build_install_config(
            registry_id="missing/runtime",
            request=AcpRegistryInstallRequest(),
        )


@pytest.mark.asyncio
async def test_npx_resolution_uses_bounded_package_and_proxy_env(
    tmp_path: Path,
) -> None:
    factory = _FakeHttpClientFactory(
        [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
    )
    service = _service(
        tmp_path,
        factory=factory,
        resolve_npm=lambda: tmp_path / "npm.cmd",
    )

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert isinstance(resolved, StdioTransportConfig)
    assert resolved.command == str(tmp_path / "npm.cmd")
    assert resolved.args == (
        "exec",
        "--yes",
        "--prefix",
        str(tmp_path / "agent-runtime-registry" / "agents" / "vendor-runtime" / "npx"),
        "--",
        "@vendor/runtime@0.0.0 - 1.2.3",
        "--stdio",
    )
    env = {binding.name: binding.value for binding in resolved.env}
    assert env["NPM_CONFIG_PROXY"] == "http://proxy.example:8080"
    assert env["NODE_USE_ENV_PROXY"] == "1"


@pytest.mark.asyncio
async def test_runtime_resolution_uses_installed_snapshot_after_registry_refresh(
    tmp_path: Path,
) -> None:
    version_one_agent = _npx_agent("vendor/runtime")
    version_one_agent["version"] = "1.0.0"
    version_one_agent["distribution"] = {
        "npx": {
            "package": "@vendor/runtime@1.0.0",
            "args": ["--stdio"],
            "env": {},
        }
    }
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(version_one_agent))]
        ),
        resolve_npm=lambda: tmp_path / "npm.cmd",
    )

    install_result = await service.build_install_config(
        registry_id="vendor/runtime",
        request=AcpRegistryInstallRequest(),
    )
    transport = install_result.agent.transport
    assert isinstance(transport, RegistryTransportConfig)
    cache_path = tmp_path / "agent-runtime-registry" / "registry.json"
    cache_path.write_bytes(
        json.dumps(_registry_payload(_npx_agent("vendor/runtime"))).encode("utf-8")
    )

    resolved = await service.resolve_runtime_transport_async(transport)

    assert resolved.args == (
        "exec",
        "--yes",
        "--prefix",
        str(tmp_path / "agent-runtime-registry" / "agents" / "vendor-runtime" / "npx"),
        "--",
        "@vendor/runtime@0.0.0 - 1.0.0",
        "--stdio",
    )


@pytest.mark.asyncio
async def test_uvx_resolution_prefers_uvx_then_uv_tool_run(tmp_path: Path) -> None:
    payload = _registry_payload(_uvx_agent("vendor/runtime"))
    uvx_service = _service(
        tmp_path / "uvx",
        factory=_FakeHttpClientFactory([_json_response(payload)]),
        resolve_executable=lambda name: "uvx-bin" if name == "uvx" else "uv-bin",
    )
    uv_service = _service(
        tmp_path / "uv",
        factory=_FakeHttpClientFactory([_json_response(payload)]),
        resolve_executable=lambda name: "uv-bin" if name == "uv" else None,
    )

    uvx_resolved = await uvx_service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )
    uv_resolved = await uv_service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert uvx_resolved.command == "uvx-bin"
    assert uvx_resolved.args == ("vendor-runtime", "--serve")
    assert uv_resolved.command == "uv-bin"
    assert uv_resolved.args == ("tool", "run", "vendor-runtime", "--serve")


@pytest.mark.asyncio
async def test_uvx_resolution_rejects_when_uv_is_unavailable(tmp_path: Path) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_uvx_agent("vendor/runtime")))]
        ),
        resolve_executable=lambda _name: None,
    )

    with pytest.raises(AcpRegistryError, match="uvx or uv is not available"):
        await service.resolve_runtime_transport_async(
            RegistryTransportConfig(registry_id="vendor/runtime")
        )


@pytest.mark.asyncio
async def test_explicit_distribution_selection_rejects_missing_distribution(
    tmp_path: Path,
) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [_json_response(_registry_payload(_npx_agent("vendor/runtime")))]
        ),
        resolve_npm=lambda: tmp_path / "npm.cmd",
    )

    with pytest.raises(AcpRegistryError, match="has no uvx distribution"):
        await service.resolve_runtime_transport_async(
            RegistryTransportConfig(
                registry_id="vendor/runtime",
                distribution="uvx",
            )
        )


@pytest.mark.asyncio
async def test_binary_resolution_extracts_zip_and_verifies_checksum(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: "windows-x86_64",
    )
    archive = _zip_bytes({"agent.exe": b"runtime"})
    digest = hashlib.sha256(archive).hexdigest()
    payload = _registry_payload(_binary_agent("vendor/runtime", sha256=digest))
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [
                _json_response(payload),
                httpx.Response(200, content=archive),
            ]
        ),
    )

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert resolved.command.endswith("agent.exe")
    assert Path(resolved.command).read_bytes() == b"runtime"


@pytest.mark.asyncio
async def test_binary_resolution_supports_raw_executable_download(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: "windows-x86_64",
    )
    payload = _registry_payload(
        _binary_agent(
            "vendor/runtime",
            sha256=hashlib.sha256(b"runtime").hexdigest(),
            archive_url="https://example.test/agent.exe",
        )
    )
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [
                _json_response(payload),
                httpx.Response(200, content=b"runtime"),
            ]
        ),
    )

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert resolved.command.endswith("agent.exe")
    assert Path(resolved.command).read_bytes() == b"runtime"


@pytest.mark.asyncio
async def test_binary_resolution_uses_github_asset_digest_when_sha_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: "windows-x86_64",
    )
    archive = _zip_bytes({"agent.exe": b"runtime"})
    digest = hashlib.sha256(archive).hexdigest()
    payload = _registry_payload(
        _binary_agent(
            "vendor/runtime",
            sha256=None,
            archive_url=(
                "https://github.com/vendor/runtime/releases/download/v2.0.0/runtime.zip"
            ),
        )
    )
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [
                _json_response(payload),
                httpx.Response(200, content=archive),
                _json_response(
                    {
                        "assets": [
                            {
                                "name": "runtime.zip",
                                "digest": f"sha256:{digest}",
                            }
                        ]
                    }
                ),
            ]
        ),
        get_github_token=lambda: "github-token",
    )

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert Path(resolved.command).read_bytes() == b"runtime"


@pytest.mark.asyncio
async def test_binary_resolution_uses_github_latest_asset_digest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: "windows-x86_64",
    )
    archive = _zip_bytes({"agent.exe": b"runtime"})
    digest = hashlib.sha256(archive).hexdigest()
    payload = _registry_payload(
        _binary_agent(
            "vendor/runtime",
            sha256=None,
            archive_url=(
                "https://github.com/vendor/runtime/releases/latest/download/runtime.zip"
            ),
        )
    )
    factory = _FakeHttpClientFactory(
        [
            _json_response(payload),
            httpx.Response(200, content=archive),
            _json_response(
                {
                    "assets": [
                        {
                            "name": "runtime.zip",
                            "digest": f"sha256:{digest}",
                        }
                    ]
                }
            ),
        ]
    )
    service = _service(tmp_path, factory=factory)

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert Path(resolved.command).read_bytes() == b"runtime"
    assert "https://api.github.com/repos/vendor/runtime/releases/latest" in factory.urls


@pytest.mark.asyncio
async def test_auto_resolution_falls_back_to_npx_without_platform_binary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: None,
    )
    agent: dict[str, object] = {
        "id": "vendor/runtime",
        "name": "Vendor Runtime",
        "version": "2.0.0",
        "description": "Runs through npx",
        "distribution": {
            "binary": {
                "windows-x86_64": {
                    "archive": "https://example.test/runtime.zip",
                    "cmd": "agent.exe",
                }
            },
            "npx": {
                "package": "@vendor/runtime@1.2.3",
                "args": ["--stdio"],
                "env": {},
            },
        },
    }
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([_json_response(_registry_payload(agent))]),
        resolve_npm=lambda: tmp_path / "npm.cmd",
    )

    resolved = await service.resolve_runtime_transport_async(
        RegistryTransportConfig(registry_id="vendor/runtime")
    )

    assert resolved.command == str(tmp_path / "npm.cmd")


@pytest.mark.asyncio
async def test_binary_resolution_rejects_checksum_and_path_traversal(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: "windows-x86_64",
    )
    bad_checksum_service = _service(
        tmp_path / "checksum",
        factory=_FakeHttpClientFactory(
            [
                _json_response(
                    _registry_payload(_binary_agent("vendor/runtime", sha256="0" * 64))
                ),
                httpx.Response(200, content=_zip_bytes({"agent.exe": b"runtime"})),
            ]
        ),
    )
    escaping_archive_service = _service(
        tmp_path / "escape",
        factory=_FakeHttpClientFactory(
            [
                _json_response(
                    _registry_payload(_binary_agent("vendor/runtime", sha256=None))
                ),
                httpx.Response(200, content=_zip_bytes({"../agent.exe": b"runtime"})),
            ]
        ),
    )

    with pytest.raises(AcpRegistryError, match="Checksum mismatch"):
        await bad_checksum_service.resolve_runtime_transport_async(
            RegistryTransportConfig(registry_id="vendor/runtime")
        )
    with pytest.raises(AcpRegistryError, match="Unsafe registry archive member"):
        await escaping_archive_service.resolve_runtime_transport_async(
            RegistryTransportConfig(registry_id="vendor/runtime")
        )


@pytest.mark.asyncio
async def test_binary_resolution_rejects_unsupported_platform(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        registry_service_module,
        "_current_registry_platform_key",
        lambda: None,
    )
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(
            [
                _json_response(
                    _registry_payload(_binary_agent("vendor/runtime", sha256=None))
                )
            ]
        ),
    )

    with pytest.raises(AcpRegistryError, match="has no supported distribution"):
        await service.resolve_runtime_transport_async(
            RegistryTransportConfig(registry_id="vendor/runtime")
        )


@pytest.mark.asyncio
async def test_binary_download_rejects_http_error(tmp_path: Path) -> None:
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory([httpx.Response(404, content=b"missing")]),
    )

    with pytest.raises(AcpRegistryError, match="Failed to download"):
        await service._download_bytes("https://example.test/runtime.zip")


@pytest.mark.asyncio
async def test_github_asset_digest_returns_none_for_unusable_release_payloads(
    tmp_path: Path,
) -> None:
    responses: list[httpx.Response | Exception] = [
        httpx.Response(404, content=b"missing"),
        httpx.Response(200, content=json.dumps(["not an object"]).encode("utf-8")),
        _json_response({"assets": "invalid"}),
        _json_response({"assets": ["invalid", {"name": "runtime.zip"}]}),
    ]
    service = _service(
        tmp_path,
        factory=_FakeHttpClientFactory(responses),
    )
    archive_url = (
        "https://github.com/vendor/runtime/releases/download/v2.0.0/runtime.zip"
    )

    assert (
        await service._github_asset_sha256("https://example.test/runtime.zip") is None
    )
    assert await service._github_asset_sha256(archive_url) is None
    assert await service._github_asset_sha256(archive_url) is None
    assert await service._github_asset_sha256(archive_url) is None


@pytest.mark.asyncio
async def test_install_lock_waits_for_concurrent_release() -> None:
    lock = threading.Lock()
    lock.acquire()
    waiter = asyncio.create_task(registry_service_module._acquire_lock(lock))
    await asyncio.sleep(registry_service_module.REGISTRY_LOCK_POLL_SECONDS * 2)

    assert not waiter.done()
    lock.release()
    done, pending = await asyncio.wait({waiter}, timeout=1.0)
    assert done == {waiter}
    assert not pending
    lock.release()


def _service(
    config_dir: Path,
    *,
    factory: _FakeHttpClientFactory,
    get_github_token: Callable[[], str | None] | None = None,
    resolve_npm: Callable[[], Path | None] | None = None,
    resolve_executable: Callable[[str], str | None] | None = None,
) -> AcpRegistryService:
    npm_resolver = resolve_npm or (lambda: None)
    executable_resolver = resolve_executable or (lambda _name: None)
    return AcpRegistryService(
        config_dir=config_dir,
        get_proxy_config=_proxy_config,
        create_http_client=factory,
        get_github_token=get_github_token,
        resolve_npm=npm_resolver,
        resolve_executable=executable_resolver,
    )


def _proxy_config() -> ProxyEnvConfig:
    return ProxyEnvConfig(http_proxy="http://proxy.example:8080", ssl_verify=False)


def _json_response(payload: dict[str, object]) -> httpx.Response:
    return httpx.Response(200, content=json.dumps(payload).encode("utf-8"))


def _registry_payload(agent: dict[str, object]) -> dict[str, object]:
    return {"version": "1.0.0", "agents": [agent], "extensions": []}


def _npx_agent(registry_id: str) -> dict[str, object]:
    return {
        "id": registry_id,
        "name": "Vendor Runtime",
        "version": "2.0.0",
        "description": "Runs through npx",
        "authors": ["Vendor Team"],
        "license": "MIT",
        "distribution": {
            "npx": {
                "package": "@vendor/runtime@1.2.3",
                "args": ["--stdio"],
                "env": {},
            }
        },
    }


def _uvx_agent(registry_id: str) -> dict[str, object]:
    return {
        "id": registry_id,
        "name": "Vendor Runtime",
        "version": "2.0.0",
        "description": "Runs through uvx",
        "distribution": {
            "uvx": {
                "package": "vendor-runtime",
                "args": ["--serve"],
                "env": {},
            }
        },
    }


def _binary_agent(
    registry_id: str,
    *,
    sha256: str | None,
    archive_url: str = "https://example.test/runtime.zip",
) -> dict[str, object]:
    target: dict[str, object] = {
        "archive": archive_url,
        "cmd": "agent.exe",
        "args": [],
        "env": {},
    }
    if sha256 is not None:
        target["sha256"] = sha256
    return {
        "id": registry_id,
        "name": "Vendor Runtime",
        "version": "2.0.0",
        "description": "Runs through binary",
        "distribution": {"binary": {"windows-x86_64": target}},
    }


def _zip_bytes(files: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return stream.getvalue()


def _tar_bytes(files: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w:gz") as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
    return stream.getvalue()
