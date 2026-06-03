from __future__ import annotations

import json

from pydantic import JsonValue

from relay_teams_evals.agentbench_runs.reporting import (
    AgentBenchName,
    eval_result_from_agentbench_task,
)
from relay_teams_evals.models import EvalItem, EvalResult, RunOutcome, TokenUsage
from relay_teams_evals.scorers.base import Scorer
from relay_teams_evals.workspace.base import PreparedWorkspace


class AgentBenchScorer(Scorer):
    @property
    def name(self) -> str:
        return "agentbench"

    def score(
        self,
        *,
        item: EvalItem,
        run_id: str,
        session_id: str,
        outcome: RunOutcome,
        agent_output: str,
        generated_patch: str,
        raw_generated_patch: str,
        filtered_generated_files: tuple[str, ...],
        token_usage: TokenUsage,
        duration_seconds: float,
        workspace: PreparedWorkspace | None = None,
        error: str | None = None,
    ) -> EvalResult:
        return _score_agentbench_item(
            agentbench_name="agentbench",
            scorer_name=self.name,
            item=item,
            run_id=run_id,
            session_id=session_id,
            outcome=outcome,
            agent_output=agent_output,
            token_usage=token_usage,
            duration_seconds=duration_seconds,
            error=error,
        )


def _score_agentbench_item(
    *,
    agentbench_name: AgentBenchName,
    scorer_name: str,
    item: EvalItem,
    run_id: str,
    session_id: str,
    outcome: RunOutcome,
    agent_output: str,
    token_usage: TokenUsage,
    duration_seconds: float,
    error: str | None,
) -> EvalResult:
    raw_task = _raw_task_from_agent_output(agent_output)
    if raw_task is not None:
        parsed_result = eval_result_from_agentbench_task(
            benchmark=agentbench_name,
            raw_task=raw_task,
            item_id=item.item_id,
        )
        return parsed_result.model_copy(
            update={
                "run_id": run_id,
                "session_id": session_id,
                "scorer_name": scorer_name,
                "agent_output": agent_output,
                "token_usage": token_usage,
                "error": error or parsed_result.error,
            }
        )

    passed = _truthy(item.extra_fields.get("passed")) or _truthy(
        item.extra_fields.get("is_resolved")
    )
    status = item.extra_fields.get("status") or item.extra_fields.get("failure_mode")
    if not status:
        status = "completed" if passed else "failed"
    failure_kind = item.extra_fields.get("failure_kind", "")
    scorer_detail = f"status={status}"
    if failure_kind:
        scorer_detail = f"{scorer_detail}; failure_kind={failure_kind}"
    return EvalResult(
        item_id=item.item_id,
        dataset=item.dataset,
        run_id=run_id,
        session_id=session_id,
        outcome=outcome if passed else _failed_outcome(status, failure_kind),
        passed=passed,
        score=1.0 if passed else 0.0,
        scorer_name=scorer_name,
        scorer_detail=scorer_detail,
        agent_output=agent_output,
        token_usage=token_usage,
        duration_seconds=duration_seconds,
        error=error,
    )


def _truthy(value: str | None) -> bool:
    return value is not None and value.lower() in {"1", "true", "yes", "pass"}


def _failed_outcome(status: str, failure_kind: str) -> RunOutcome:
    if status in {"agent_timeout", "step_limit", "test_timeout"}:
        return RunOutcome.TIMEOUT
    if failure_kind == "infra":
        return RunOutcome.FAILED
    return RunOutcome.COMPLETED


def _raw_task_from_agent_output(agent_output: str) -> dict[str, JsonValue] | None:
    if not agent_output.strip():
        return None
    try:
        payload = json.loads(agent_output)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return {
        key: value
        for key, value in payload.items()
        if isinstance(key, str) and _is_json_value(value)
    }


def _is_json_value(value: object) -> bool:
    if value is None or isinstance(value, str | int | float | bool):
        return True
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(
            isinstance(key, str) and _is_json_value(nested_value)
            for key, nested_value in value.items()
        )
    return False
