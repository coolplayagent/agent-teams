# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import uuid

from relay_teams.agent_runtimes.config_service import ExternalAgentConfigService
from relay_teams.agent_runtimes.models import (
    ExternalAgentProtocol,
    ExternalAgentTestResult,
)
from relay_teams.agent_runtimes.runtime_probe import probe_agent_runtime
from relay_teams.agent_runtimes.setup_models import (
    AgentRuntimeJobStatus,
    AgentRuntimeSetupPhase,
    AgentRuntimeSetupProgress,
    AgentRuntimeSetupProgressCallback,
    AgentRuntimeTestJob,
)
from relay_teams.logger import get_logger
from relay_teams.workspace import WorkspaceManager

LOGGER = get_logger(__name__)

_AGENT_RUNTIME_TEST_WORKSPACE_ID = "default"
_AGENT_RUNTIME_TEST_SESSION_ID = "agent-runtime-probe"
_AGENT_RUNTIME_TEST_ROLE_ID = "agent-runtime-probe"
_COMPLETED_JOB_TTL = timedelta(hours=1)
_MAX_TEST_JOBS = 100


class AgentRuntimeTestJobService:
    def __init__(
        self,
        *,
        config_service: ExternalAgentConfigService,
        workspace_manager: WorkspaceManager,
    ) -> None:
        self._config_service = config_service
        self._workspace_manager = workspace_manager
        self._jobs: dict[str, AgentRuntimeTestJob] = {}
        self._running_job_by_agent: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def start_job(self, agent_id: str) -> AgentRuntimeTestJob:
        normalized_agent_id = _normalize_agent_id(agent_id)
        _ = await asyncio.to_thread(
            self._config_service.get_agent,
            normalized_agent_id,
        )
        async with self._lock:
            self._prune_jobs_locked()
            running_job_id = self._running_job_by_agent.get(normalized_agent_id)
            if running_job_id is not None:
                running_job = self._jobs.get(running_job_id)
                if running_job is not None and running_job.status in {
                    AgentRuntimeJobStatus.QUEUED,
                    AgentRuntimeJobStatus.RUNNING,
                }:
                    return running_job
            job = AgentRuntimeTestJob(
                job_id=f"agent_runtime_test_{uuid.uuid4().hex}",
                agent_id=normalized_agent_id,
            )
            self._jobs[job.job_id] = job
            self._running_job_by_agent[normalized_agent_id] = job.job_id
        task = asyncio.create_task(self._run_job(job.job_id))
        task.add_done_callback(self._log_task_failure)
        return job

    async def get_job(self, job_id: str) -> AgentRuntimeTestJob:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(f"Unknown agent runtime test job: {job_id}")
            return job

    async def run_test(
        self,
        agent_id: str,
        *,
        progress_callback: AgentRuntimeSetupProgressCallback | None = None,
    ) -> ExternalAgentTestResult:
        normalized_agent_id = _normalize_agent_id(agent_id)
        await _emit_progress(
            progress_callback,
            AgentRuntimeSetupProgress(
                agent_id=normalized_agent_id,
                phase=AgentRuntimeSetupPhase.RESOLVING_REGISTRY,
                message="Preparing Agent Runtime.",
            ),
        )
        config = await self._config_service.resolve_runtime_agent_async(
            normalized_agent_id,
            progress_callback=progress_callback,
        )
        runtime_cwd = None
        if config.protocol == ExternalAgentProtocol.CLI:
            runtime_cwd = (
                await self._workspace_manager.resolve_async(
                    session_id=_AGENT_RUNTIME_TEST_SESSION_ID,
                    role_id=_AGENT_RUNTIME_TEST_ROLE_ID,
                    instance_id=None,
                    workspace_id=_AGENT_RUNTIME_TEST_WORKSPACE_ID,
                    conversation_id=_AGENT_RUNTIME_TEST_SESSION_ID,
                )
            ).resolve_workdir()
        await _emit_progress(
            progress_callback,
            AgentRuntimeSetupProgress(
                agent_id=normalized_agent_id,
                phase=AgentRuntimeSetupPhase.STARTING_PROCESS,
                message="Starting Agent Runtime probe.",
            ),
        )
        result = await probe_agent_runtime(config, runtime_cwd=runtime_cwd)
        await _emit_progress(
            progress_callback,
            AgentRuntimeSetupProgress(
                agent_id=normalized_agent_id,
                phase=(
                    AgentRuntimeSetupPhase.COMPLETED
                    if result.ok
                    else AgentRuntimeSetupPhase.FAILED
                ),
                message=result.message,
                progress_percent=100 if result.ok else None,
                result=result,
                error_message=None if result.ok else result.message,
            ),
        )
        return result

    async def _run_job(self, job_id: str) -> None:
        job = await self.get_job(job_id)

        async def progress_callback(progress: AgentRuntimeSetupProgress) -> None:
            await self._apply_progress(job_id=job_id, progress=progress)

        await self._update_job(
            job_id,
            status=AgentRuntimeJobStatus.RUNNING,
            phase=AgentRuntimeSetupPhase.RESOLVING_REGISTRY,
            message="Preparing Agent Runtime.",
            progress_percent=None,
        )
        try:
            result = await self.run_test(
                job.agent_id,
                progress_callback=progress_callback,
            )
            await self._update_job(
                job_id,
                status=(
                    AgentRuntimeJobStatus.SUCCEEDED
                    if result.ok
                    else AgentRuntimeJobStatus.FAILED
                ),
                phase=(
                    AgentRuntimeSetupPhase.COMPLETED
                    if result.ok
                    else AgentRuntimeSetupPhase.FAILED
                ),
                message=result.message,
                progress_percent=100 if result.ok else None,
                result=result,
                error_message=None if result.ok else result.message,
            )
        except Exception as exc:
            LOGGER.warning(
                "Agent runtime test job failed for %s: %s",
                job.agent_id,
                exc,
            )
            await self._update_job(
                job_id,
                status=AgentRuntimeJobStatus.FAILED,
                phase=AgentRuntimeSetupPhase.FAILED,
                message=str(exc),
                error_message=str(exc),
            )
        finally:
            async with self._lock:
                latest = self._jobs.get(job_id)
                if latest is not None:
                    current_job_id = self._running_job_by_agent.get(latest.agent_id)
                    if current_job_id == job_id:
                        self._running_job_by_agent.pop(latest.agent_id, None)
                self._prune_jobs_locked()

    async def _apply_progress(
        self,
        *,
        job_id: str,
        progress: AgentRuntimeSetupProgress,
    ) -> None:
        await self._update_job(
            job_id,
            registry_id=progress.registry_id,
            distribution=progress.distribution,
            phase=progress.phase,
            message=progress.message,
            progress_percent=progress.progress_percent,
            downloaded_bytes=progress.downloaded_bytes,
            total_bytes=progress.total_bytes,
            result=progress.result,
            error_message=progress.error_message,
        )

    async def _update_job(
        self,
        job_id: str,
        *,
        status: AgentRuntimeJobStatus | None = None,
        registry_id: str | None = None,
        distribution: str | None = None,
        phase: AgentRuntimeSetupPhase | None = None,
        message: str | None = None,
        progress_percent: int | None = None,
        downloaded_bytes: int | None = None,
        total_bytes: int | None = None,
        result: ExternalAgentTestResult | None = None,
        error_message: str | None = None,
    ) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            updates: dict[str, object] = {"updated_at": datetime.now(timezone.utc)}
            if status is not None:
                updates["status"] = status
            if registry_id is not None:
                updates["registry_id"] = registry_id
            if distribution is not None:
                updates["distribution"] = distribution
            if phase is not None:
                updates["phase"] = phase
            if message is not None:
                updates["message"] = message
            if progress_percent is not None or phase in {
                AgentRuntimeSetupPhase.DOWNLOADING,
                AgentRuntimeSetupPhase.READY,
                AgentRuntimeSetupPhase.COMPLETED,
                AgentRuntimeSetupPhase.FAILED,
            }:
                updates["progress_percent"] = progress_percent
            if downloaded_bytes is not None:
                updates["downloaded_bytes"] = downloaded_bytes
            if total_bytes is not None or phase == AgentRuntimeSetupPhase.DOWNLOADING:
                updates["total_bytes"] = total_bytes
            if result is not None:
                updates["result"] = result
            if error_message is not None:
                updates["error_message"] = error_message
            self._jobs[job_id] = job.model_copy(update=updates)

    def _prune_jobs_locked(self) -> None:
        now = datetime.now(timezone.utc)
        completed_ids = [
            job.job_id
            for job in self._jobs.values()
            if job.status
            in {AgentRuntimeJobStatus.SUCCEEDED, AgentRuntimeJobStatus.FAILED}
            and now - _aware_datetime(job.updated_at) > _COMPLETED_JOB_TTL
        ]
        for job_id in completed_ids:
            self._jobs.pop(job_id, None)
        if len(self._jobs) <= _MAX_TEST_JOBS:
            return
        ordered = sorted(self._jobs.values(), key=lambda item: item.updated_at)
        for job in ordered[: max(0, len(self._jobs) - _MAX_TEST_JOBS)]:
            if job.status in {
                AgentRuntimeJobStatus.QUEUED,
                AgentRuntimeJobStatus.RUNNING,
            }:
                continue
            self._jobs.pop(job.job_id, None)

    @staticmethod
    def _log_task_failure(task: asyncio.Task[None]) -> None:
        try:
            exception = task.exception()
        except asyncio.CancelledError:
            return
        if exception is not None:
            LOGGER.warning("Agent runtime test job task failed: %s", exception)


async def _emit_progress(
    callback: AgentRuntimeSetupProgressCallback | None,
    progress: AgentRuntimeSetupProgress,
) -> None:
    if callback is None:
        return
    await callback(progress)


def _normalize_agent_id(agent_id: str) -> str:
    normalized = str(agent_id or "").strip()
    if not normalized:
        raise ValueError("agent_id is required")
    return normalized


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
