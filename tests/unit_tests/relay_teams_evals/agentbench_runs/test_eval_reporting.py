from __future__ import annotations

import json
from pathlib import Path

from relay_teams_evals.agentbench_runs.reporting import (
    ReportFormat,
    _artifact_dir_name,
    build_relay_eval_report,
    write_agentbench_results_from_eval_report,
    write_agentbench_outputs,
)
from relay_teams_evals.models import EvalResult, RunOutcome
from relay_teams_evals.reporter import build_report


def test_agentbench_reporting_writes_html_checkpoint_and_artifacts(
    tmp_path: Path,
) -> None:
    results_file = tmp_path / "results.json"
    results_file.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "suite": "db",
                        "task_id": "std-0",
                        "passed": True,
                        "status": "completed",
                        "input_tokens": 100,
                        "output_tokens": 20,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    agentbench_report = write_agentbench_outputs(
        benchmark="agentbench",
        results_file=results_file,
        report_format=ReportFormat.BOTH,
    )
    eval_report = build_relay_eval_report(
        benchmark="agentbench",
        results_file=results_file,
    )
    assert agentbench_report.passed_count == 1
    assert eval_report.passed == 1
    assert agentbench_report.results[0].task_id == "db:std-0"
    assert (tmp_path / "evaluation.json").exists()
    assert (tmp_path / "report.json").exists()
    assert (tmp_path / "report.html").exists()
    assert (tmp_path / "checkpoint.meta.json").exists()
    assert (tmp_path / "checkpoint.results.jsonl").exists()
    assert (
        tmp_path / "artifacts" / _artifact_dir_name("db:std-0") / "metadata.json"
    ).exists()


def test_agentbench_results_from_exception_only_eval_marks_infra_failure(
    tmp_path: Path,
) -> None:
    eval_result = EvalResult(
        item_id="db:std-0",
        dataset="agentbench",
        run_id="run",
        session_id="session",
        outcome=RunOutcome.FAILED,
        passed=False,
        score=0.0,
        scorer_name="agentbench",
        error="Docker is unavailable",
    )
    report = build_report(
        [eval_result],
        dataset="agentbench",
        scorer_name="agentbench",
    )

    results_file = write_agentbench_results_from_eval_report(
        report=report,
        output_dir=tmp_path,
    )
    payload = json.loads(results_file.read_text(encoding="utf-8"))
    raw_result = payload["results"][0]

    assert raw_result["status"] == "infra_error"
    assert raw_result["failure_kind"] == "infra"
    assert raw_result["error_message"] == "Docker is unavailable"
