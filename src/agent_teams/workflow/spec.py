from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra='forbid')

    task_ref: str = Field(min_length=1)
    depends_on: tuple[str, ...] = ()


class WorkflowSpec(BaseModel):
    model_config = ConfigDict(extra='forbid')

    workflow_id: str = Field(min_length=1)
    layers: tuple[tuple[TaskSpec, ...], ...] = ()
