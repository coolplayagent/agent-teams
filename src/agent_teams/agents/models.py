from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from agent_teams.agents.enums import InstanceStatus


class SubAgentInstance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_id: str = Field(min_length=1)
    role_id: str = Field(min_length=1)
    status: InstanceStatus = InstanceStatus.IDLE
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    last_active_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    completed_tasks: int = 0
    failed_tasks: int = 0


class AgentRuntimeRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1)
    trace_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    instance_id: str = Field(min_length=1)
    role_id: str = Field(min_length=1)
    status: InstanceStatus
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
