from __future__ import annotations

import json

from relay_teams_evals.models import EvalItem, RunOutcome, TokenUsage
from relay_teams_evals.scorers.agentbench_scorer import (
    AgentBenchScorer,
    _is_json_value,
    _raw_task_from_agent_output,
)


def test_agentbench_scorer_uses_result_metadata() -> None:
    item = EvalItem(
        item_id="std-0",
        dataset="agentbench",
        intent="demo",
        extra_fields={
            "passed": "false",
            "status": "infra_error",
            "failure_kind": "infra",
        },
    )

    result = AgentBenchScorer().score(
        item=item,
        run_id="",
        session_id="",
        outcome=RunOutcome.COMPLETED,
        agent_output="",
        generated_patch="",
        raw_generated_patch="",
        filtered_generated_files=(),
        token_usage=TokenUsage(),
        duration_seconds=0.1,
    )

    assert result.passed is False
    assert result.outcome == RunOutcome.FAILED
    assert result.scorer_detail == "status=infra_error; failure_kind=infra"


def test_agentbench_scorer_defaults_fallback_status_and_outcomes() -> None:
    failed_item = EvalItem(
        item_id="std-0",
        dataset="agentbench",
        intent="demo",
    )
    timeout_item = EvalItem(
        item_id="std-1",
        dataset="agentbench",
        intent="demo",
        extra_fields={"status": "agent_timeout"},
    )

    failed_result = AgentBenchScorer().score(
        item=failed_item,
        run_id="",
        session_id="",
        outcome=RunOutcome.FAILED,
        agent_output="",
        generated_patch="",
        raw_generated_patch="",
        filtered_generated_files=(),
        token_usage=TokenUsage(),
        duration_seconds=0.1,
    )
    timeout_result = AgentBenchScorer().score(
        item=timeout_item,
        run_id="",
        session_id="",
        outcome=RunOutcome.FAILED,
        agent_output="",
        generated_patch="",
        raw_generated_patch="",
        filtered_generated_files=(),
        token_usage=TokenUsage(),
        duration_seconds=0.1,
    )

    assert failed_result.outcome == RunOutcome.COMPLETED
    assert failed_result.scorer_detail == "status=failed"
    assert timeout_result.outcome == RunOutcome.TIMEOUT


def test_agentbench_scorer_preserves_raw_task_duration() -> None:
    item = EvalItem(
        item_id="db:std-0",
        dataset="agentbench",
        intent="demo",
    )

    result = AgentBenchScorer().score(
        item=item,
        run_id="run",
        session_id="session",
        outcome=RunOutcome.COMPLETED,
        agent_output=json.dumps(
            {
                "suite": "db",
                "task_id": "std-0",
                "passed": True,
                "status": "completed",
                "duration_seconds": 2.5,
            }
        ),
        generated_patch="",
        raw_generated_patch="",
        filtered_generated_files=(),
        token_usage=TokenUsage(input_tokens=10),
        duration_seconds=100.0,
    )

    assert result.duration_seconds == 2.5
    assert result.token_usage.input_tokens == 10


def test_agentbench_scorer_parses_only_json_object_outputs() -> None:
    assert _raw_task_from_agent_output("{") is None
    assert _raw_task_from_agent_output("[]") is None
    assert _raw_task_from_agent_output(
        json.dumps({"task_id": "std-0", "metadata": {"steps": [1, 2]}})
    ) == {"task_id": "std-0", "metadata": {"steps": [1, 2]}}
    assert _is_json_value({1: "bad"}) is False
    assert _is_json_value(object()) is False
