from __future__ import annotations

from dataclasses import dataclass

from agent_teams.core.models import RoleDefinition, TaskEnvelope


@dataclass(frozen=True)
class PromptBuildInput:
    role: RoleDefinition
    task: TaskEnvelope
    parent_instruction: str | None
    shared_state_snapshot: tuple[tuple[str, str], ...]


class RuntimePromptBuilder:
    def build(self, data: PromptBuildInput) -> str:
        state_lines = '\n'.join(f'- {k}: {v}' for k, v in data.shared_state_snapshot)
        parent = data.parent_instruction or 'N/A'
        return (
            f'{data.role.system_prompt}\n\n'
            f'ParentInstruction:\n{parent}\n\n'
            f'TaskRef: {data.task.task_id}\n'
            f'Objective: {data.task.objective}\n'
            f'Scope: {", ".join(data.task.scope)}\n'
            f'DoD: {", ".join(data.task.dod)}\n'
            f'SharedState:\n{state_lines if state_lines else "- none"}'
        )
