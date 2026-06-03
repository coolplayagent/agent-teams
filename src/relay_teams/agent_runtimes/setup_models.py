# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from relay_teams.agent_runtimes.models import ExternalAgentTestResult


class AgentRuntimeSetupPhase(str, Enum):
    QUEUED = "queued"
    RESOLVING_REGISTRY = "resolving_registry"
    SELECTING_DISTRIBUTION = "selecting_distribution"
    CHECKING_CACHE = "checking_cache"
    WAITING_FOR_LOCK = "waiting_for_lock"
    DOWNLOADING = "downloading"
    VERIFYING_CHECKSUM = "verifying_checksum"
    EXTRACTING = "extracting"
    PREPARING_COMMAND = "preparing_command"
    STARTING_PROCESS = "starting_process"
    INITIALIZING = "initializing"
    READY = "ready"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentRuntimeJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AgentRuntimeSetupProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = ""
    registry_id: str = ""
    distribution: str = ""
    phase: AgentRuntimeSetupPhase = AgentRuntimeSetupPhase.QUEUED
    message: str = ""
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    downloaded_bytes: int = Field(default=0, ge=0)
    total_bytes: int | None = Field(default=None, ge=0)
    result: ExternalAgentTestResult | None = None
    error_message: str | None = None


type AgentRuntimeSetupProgressCallback = Callable[
    [AgentRuntimeSetupProgress], Awaitable[None]
]


class AgentRuntimeTestJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)
    registry_id: str = ""
    distribution: str = ""
    status: AgentRuntimeJobStatus = AgentRuntimeJobStatus.QUEUED
    phase: AgentRuntimeSetupPhase = AgentRuntimeSetupPhase.QUEUED
    message: str = "Queued agent runtime test."
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    downloaded_bytes: int = Field(default=0, ge=0)
    total_bytes: int | None = Field(default=None, ge=0)
    result: ExternalAgentTestResult | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
