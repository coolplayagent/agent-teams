from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from agent_teams.core.models import EventEnvelope, StateMutation, TaskEnvelope, VerificationResult


class CreateTaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    envelope: TaskEnvelope


class AssignTaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    task_id: str = Field(min_length=1)
    instance_id: str = Field(min_length=1)


class QueryTaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    task_id: str = Field(min_length=1)


class VerifyTaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    task_id: str = Field(min_length=1)


class CreateSubAgentRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    role_id: str = Field(min_length=1)


class ManageStateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    mutation: StateMutation


class EmitEventRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    event: EventEnvelope


class VerifyTaskResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    verification: VerificationResult
