from __future__ import annotations

from dataclasses import dataclass

from agent_teams.core.models import IntentInput, RunResult
from agent_teams.coordination.coordinator import CoordinatorGraph


@dataclass
class MetaAgent:
    coordinator: CoordinatorGraph

    def handle_intent(self, intent: IntentInput, trace_id: str | None = None) -> RunResult:
        trace_id, task_id, status, output = self.coordinator.run(intent, trace_id=trace_id)
        return RunResult(trace_id=trace_id, root_task_id=task_id, status=status, output=output)
