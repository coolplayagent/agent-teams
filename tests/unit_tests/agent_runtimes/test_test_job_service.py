# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

import pytest

from relay_teams.agent_runtimes.models import (
    ExternalAgentConfig,
    ExternalAgentProtocol,
    ExternalAgentTestResult,
    StdioTransportConfig,
)
from relay_teams.agent_runtimes.config_service import ExternalAgentConfigService
from relay_teams.agent_runtimes.setup_models import (
    AgentRuntimeJobStatus,
    AgentRuntimeSetupPhase,
    AgentRuntimeSetupProgress,
)
from relay_teams.agent_runtimes.test_job_service import (
    AgentRuntimeTestJobService,
    _aware_datetime,
    _emit_progress,
    _normalize_agent_id,
)
from relay_teams.agent_runtimes import test_job_service as test_job_service_module
from relay_teams.workspace import WorkspaceManager


class _FakeConfigService:
    def __init__(self) -> None:
        self.ready = asyncio.Event()
        self.calls = 0
        self.missing_agents: set[str] = set()
        self.protocol = ExternalAgentProtocol.ACP

    def get_agent(self, agent_id: str) -> ExternalAgentConfig:
        if agent_id in self.missing_agents:
            raise KeyError(f"Unknown external agent: {agent_id}")
        return ExternalAgentConfig(
            agent_id=agent_id,
            name="Codex Local",
            protocol=self.protocol,
            transport=StdioTransportConfig(command="codex"),
        )

    async def resolve_runtime_agent_async(
        self,
        agent_id: str,
        *,
        progress_callback: object | None = None,
    ) -> ExternalAgentConfig:
        _ = progress_callback
        self.calls += 1
        await self.ready.wait()
        return self.get_agent(agent_id)


class _FakeWorkspaceManager:
    async def resolve_async(
        self,
        *,
        session_id: str,
        role_id: str,
        instance_id: str | None,
        workspace_id: str,
        conversation_id: str | None = None,
    ) -> object:
        _ = (session_id, role_id, instance_id, workspace_id, conversation_id)
        return _FakeWorkspaceHandle()


class _FakeWorkspaceHandle:
    def resolve_workdir(self) -> Path:
        return Path.cwd()


@pytest.mark.asyncio
async def test_runtime_test_job_succeeds_and_reuses_running_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_probe(
        config: ExternalAgentConfig,
        *,
        runtime_cwd: Path | None = None,
    ) -> ExternalAgentTestResult:
        _ = (config, runtime_cwd)
        return ExternalAgentTestResult(
            ok=True,
            message="Connected",
            protocol=ExternalAgentProtocol.ACP,
        )

    monkeypatch.setattr(test_job_service_module, "probe_agent_runtime", fake_probe)
    config_service = _FakeConfigService()
    service = AgentRuntimeTestJobService(
        config_service=cast(ExternalAgentConfigService, config_service),
        workspace_manager=cast(WorkspaceManager, _FakeWorkspaceManager()),
    )

    first = await service.start_job("codex_local")
    second = await service.start_job("codex_local")

    assert second.job_id == first.job_id
    config_service.ready.set()
    for _ in range(20):
        latest = await service.get_job(first.job_id)
        if latest.status == AgentRuntimeJobStatus.SUCCEEDED:
            break
        await asyncio.sleep(0.01)

    latest = await service.get_job(first.job_id)
    assert latest.status == AgentRuntimeJobStatus.SUCCEEDED
    assert latest.result is not None
    assert latest.result.ok is True
    assert config_service.calls == 1


@pytest.mark.asyncio
async def test_runtime_test_uses_cli_workspace_cwd(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_cwd: list[Path | None] = []

    async def fake_probe(
        config: ExternalAgentConfig,
        *,
        runtime_cwd: Path | None = None,
    ) -> ExternalAgentTestResult:
        _ = config
        seen_cwd.append(runtime_cwd)
        return ExternalAgentTestResult(
            ok=True,
            message="Connected",
            protocol=ExternalAgentProtocol.CLI,
        )

    monkeypatch.setattr(test_job_service_module, "probe_agent_runtime", fake_probe)
    config_service = _FakeConfigService()
    config_service.protocol = ExternalAgentProtocol.CLI
    config_service.ready.set()
    service = AgentRuntimeTestJobService(
        config_service=cast(ExternalAgentConfigService, config_service),
        workspace_manager=cast(WorkspaceManager, _FakeWorkspaceManager()),
    )

    result = await service.run_test("codex_local")

    assert result.ok is True
    assert seen_cwd == [Path.cwd()]


@pytest.mark.asyncio
async def test_runtime_test_job_records_probe_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_probe(
        config: ExternalAgentConfig,
        *,
        runtime_cwd: Path | None = None,
    ) -> ExternalAgentTestResult:
        _ = (config, runtime_cwd)
        raise RuntimeError("probe exploded")

    monkeypatch.setattr(test_job_service_module, "probe_agent_runtime", fake_probe)
    config_service = _FakeConfigService()
    config_service.ready.set()
    service = AgentRuntimeTestJobService(
        config_service=cast(ExternalAgentConfigService, config_service),
        workspace_manager=cast(WorkspaceManager, _FakeWorkspaceManager()),
    )

    job = await service.start_job("codex_local")
    for _ in range(20):
        latest = await service.get_job(job.job_id)
        if latest.status == AgentRuntimeJobStatus.FAILED:
            break
        await asyncio.sleep(0.01)

    latest = await service.get_job(job.job_id)
    assert latest.status == AgentRuntimeJobStatus.FAILED
    assert latest.phase == AgentRuntimeSetupPhase.FAILED
    assert latest.error_message == "probe exploded"


@pytest.mark.asyncio
async def test_runtime_test_job_rejects_unknown_agent_before_queueing() -> None:
    config_service = _FakeConfigService()
    config_service.missing_agents.add("missing")
    service = AgentRuntimeTestJobService(
        config_service=cast(ExternalAgentConfigService, config_service),
        workspace_manager=cast(WorkspaceManager, _FakeWorkspaceManager()),
    )

    with pytest.raises(KeyError, match="Unknown external agent: missing"):
        await service.start_job("missing")

    assert config_service.calls == 0


@pytest.mark.asyncio
async def test_runtime_test_job_get_unknown_raises_key_error() -> None:
    service = AgentRuntimeTestJobService(
        config_service=cast(ExternalAgentConfigService, _FakeConfigService()),
        workspace_manager=cast(WorkspaceManager, _FakeWorkspaceManager()),
    )

    with pytest.raises(KeyError, match="Unknown agent runtime test job: missing"):
        await service.get_job("missing")


@pytest.mark.asyncio
async def test_runtime_test_job_helpers_emit_progress_and_validate_values() -> None:
    progress = AgentRuntimeSetupProgress(
        agent_id="codex_local",
        phase=AgentRuntimeSetupPhase.PREPARING_COMMAND,
        message="Preparing command.",
    )
    seen: list[AgentRuntimeSetupProgress] = []

    async def callback(item: AgentRuntimeSetupProgress) -> None:
        seen.append(item)

    await _emit_progress(None, progress)
    await _emit_progress(callback, progress)

    assert seen == [progress]
    assert _normalize_agent_id(" codex_local ") == "codex_local"
    with pytest.raises(ValueError, match="agent_id is required"):
        _normalize_agent_id(" ")
    naive = datetime(2026, 1, 2, 3, 4, 5)
    aware = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert _aware_datetime(naive).tzinfo is timezone.utc
    assert _aware_datetime(aware) is aware


@pytest.mark.asyncio
async def test_runtime_test_job_logs_task_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def fail() -> None:
        raise RuntimeError("background failed")

    task = asyncio.create_task(fail())
    with pytest.raises(RuntimeError, match="background failed"):
        _ = await task

    AgentRuntimeTestJobService._log_task_failure(task)

    assert "Agent runtime test job task failed" in caplog.text
