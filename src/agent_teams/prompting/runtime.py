# -*- coding: utf-8 -*-
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from agent_teams.roles.models import RoleDefinition
from agent_teams.workflow.models import TaskEnvelope

COORDINATOR_ROLE_ID = "coordinator_agent"


class RuntimePromptBuildInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    role: RoleDefinition
    task: TaskEnvelope
    shared_state_snapshot: tuple[tuple[str, str], ...]


def build_runtime_system_prompt(data: RuntimePromptBuildInput) -> str:
    sections: list[str] = [f"## Role\n{data.role.system_prompt}"]
    if data.role.role_id == COORDINATOR_ROLE_ID:
        sections.append(
            "## Runtime Contract\n"
            "- A coordinator turn can call tools many times, but delegated tasks run after the turn ends.\n"
            "- Do not claim task started/completed without get_workflow_status evidence.\n"
            "- Prefer workflow tools over raw task-by-task creation."
        )
    sections.append(f"## Task Context\n- TaskRef: {data.task.task_id}")
    shared_state_lines = (
        "\n".join(f"- {key}: {value}" for key, value in data.shared_state_snapshot)
        if data.shared_state_snapshot
        else "- none"
    )
    sections.append(f"## Shared State\n{shared_state_lines}")
    return "\n\n".join(sections)
