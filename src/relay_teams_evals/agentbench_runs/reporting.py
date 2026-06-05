from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, JsonValue

from relay_teams_evals.checkpoint import EvalCheckpointSignature, EvalCheckpointStore
from relay_teams_evals.models import EvalReport, EvalResult, RunOutcome, TokenUsage
from relay_teams_evals.reporter import EvalReporter
from relay_teams_evals.reporter import build_report as build_eval_report

AgentBenchName = Literal["agentbench"]


class ReportFormat(str, Enum):
    JSON = "json"
    HTML = "html"
    BOTH = "both"


class AgentBenchTaskResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benchmark: AgentBenchName
    suite: str = ""
    task_id: str
    passed: bool
    status: str = ""
    failure_kind: str = ""
    duration_seconds: float | None = None
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0
    error_message: str = ""
    log_path: str = ""


class AgentBenchEvaluationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benchmark: AgentBenchName
    generated_at: datetime
    source_results_path: Path
    total_count: int
    passed_count: int
    pass_rate: float
    failed_task_ids: tuple[str, ...]
    infra_failed_task_ids: tuple[str, ...]
    agent_failed_task_ids: tuple[str, ...]
    results: tuple[AgentBenchTaskResult, ...]


def build_agentbench_report(
    *, benchmark: AgentBenchName, results_file: Path
) -> AgentBenchEvaluationReport:
    raw_payload = _load_payload(results_file)
    results = _agentbench_results(raw_payload)
    return _agentbench_evaluation_report(
        benchmark=benchmark,
        results_file=results_file,
        results=results,
    )


def write_agentbench_report(
    *, report: AgentBenchEvaluationReport, output_file: Path
) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(report.model_dump_json(indent=2), encoding="utf-8")


def write_agentbench_outputs(
    *,
    benchmark: AgentBenchName,
    results_file: Path,
    output_file: Path | None = None,
    report_format: ReportFormat = ReportFormat.JSON,
    save_artifacts: bool = True,
    cost_per_million_input: float = 3.0,
    cost_per_million_cached_input: float = 0.3,
    cost_per_million_output: float = 15.0,
    cost_per_million_reasoning_output: float = 15.0,
) -> AgentBenchEvaluationReport:
    output_path = output_file or results_file.with_name("evaluation.json")
    report = build_agentbench_report(benchmark=benchmark, results_file=results_file)
    write_agentbench_report(report=report, output_file=output_path)

    eval_report = build_relay_eval_report(
        benchmark=benchmark,
        results_file=results_file,
        cost_per_million_input=cost_per_million_input,
        cost_per_million_cached_input=cost_per_million_cached_input,
        cost_per_million_output=cost_per_million_output,
        cost_per_million_reasoning_output=cost_per_million_reasoning_output,
    )
    reporter = EvalReporter()
    reporter.write_json(eval_report, results_file.with_name("report.json"))
    if report_format in (ReportFormat.HTML, ReportFormat.BOTH):
        reporter.write_html(eval_report, results_file.with_name("report.html"))
    refresh_eval_checkpoint(
        benchmark=benchmark,
        results_file=results_file,
        report=eval_report,
    )
    if save_artifacts:
        write_eval_artifacts(results_file=results_file, report=eval_report)
    return report


def build_relay_eval_report(
    *,
    benchmark: AgentBenchName,
    results_file: Path,
    cost_per_million_input: float = 3.0,
    cost_per_million_cached_input: float = 0.3,
    cost_per_million_output: float = 15.0,
    cost_per_million_reasoning_output: float = 15.0,
) -> EvalReport:
    payload = _load_payload(results_file)
    results = _agentbench_eval_results(payload)
    return build_eval_report(
        list(results),
        dataset=benchmark,
        scorer_name=benchmark,
        cost_per_million_input=cost_per_million_input,
        cost_per_million_cached_input=cost_per_million_cached_input,
        cost_per_million_output=cost_per_million_output,
        cost_per_million_reasoning_output=cost_per_million_reasoning_output,
    )


def write_agentbench_results_from_eval_report(
    *,
    report: EvalReport,
    output_dir: Path,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    results = [_raw_task_from_eval_result(result) for result in report.results]
    output_path = output_dir / "results.json"
    output_path.write_text(
        json.dumps({"results": results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return output_path


def write_agentbench_summary_from_eval_report(
    *,
    benchmark: AgentBenchName,
    report: EvalReport,
    results_file: Path,
) -> Path:
    output_path = results_file.with_name("evaluation.json")
    results = tuple(
        _agentbench_task_result_from_raw(
            benchmark=benchmark,
            raw_task=_raw_task_from_eval_result(result),
        )
        for result in report.results
    )
    benchmark_report = _agentbench_evaluation_report(
        benchmark=benchmark,
        results=results,
        results_file=results_file,
    )
    write_agentbench_report(report=benchmark_report, output_file=output_path)
    return output_path


def refresh_eval_checkpoint(
    *,
    benchmark: AgentBenchName,
    results_file: Path,
    report: EvalReport,
) -> None:
    output_dir = results_file.parent
    for path in (
        output_dir / "checkpoint.meta.json",
        output_dir / "checkpoint.results.jsonl",
    ):
        if path.exists():
            path.unlink()
    store = EvalCheckpointStore(output_dir)
    signature = EvalCheckpointSignature(
        dataset=benchmark,
        dataset_path=str(results_file.resolve()),
        dataset_sha256=hashlib.sha256(results_file.read_bytes()).hexdigest(),
        item_ids=tuple(result.item_id for result in report.results),
        scorer=benchmark,
        swebench_pass_threshold=0.0,
        backend="agent_teams",
        workspace_mode="docker",
        agent_execution_mode="ai",
        agent_session_mode="normal",
        agent_yolo=True,
        agent_timeout_seconds=0.0,
    )
    store.ensure_initialized(signature)
    for result in report.results:
        store.append_result(result)


def write_eval_artifacts(*, results_file: Path, report: EvalReport) -> None:
    artifact_root = results_file.parent / "artifacts"
    for result in report.results:
        artifact_dir = artifact_root / _artifact_dir_name(result.item_id)
        artifact_dir.mkdir(parents=True, exist_ok=True)
        metadata_path = artifact_dir / "metadata.json"
        metadata_path.write_text(
            json.dumps(
                {
                    "item_id": result.item_id,
                    "dataset": result.dataset,
                    "run_id": result.run_id,
                    "session_id": result.session_id,
                    "outcome": result.outcome.value,
                    "passed": result.passed,
                    "score": result.score,
                    "scorer_name": result.scorer_name,
                    "scorer_detail": result.scorer_detail,
                    "duration_seconds": result.duration_seconds,
                    "token_usage": result.token_usage.model_dump(),
                    "error": result.error,
                    "log_path": result.log_path,
                    "build_log_path": result.build_log_path,
                    "build_error_summary": result.build_error_summary,
                    "source_results_path": str(results_file.resolve()),
                    "collected_at": datetime.now(tz=timezone.utc).isoformat(),
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        if result.agent_output:
            (artifact_dir / "agent_output.txt").write_text(
                result.agent_output,
                encoding="utf-8",
            )
        if result.error:
            (artifact_dir / "container.log").write_text(
                result.error,
                encoding="utf-8",
            )


def _artifact_dir_name(item_id: str) -> str:
    safe_name = "".join(
        char if char.isalnum() or char in {"-", "_", "."} else "_" for char in item_id
    ).strip("._")
    if not safe_name:
        safe_name = "item"
    if safe_name == item_id:
        return safe_name
    digest = hashlib.sha256(item_id.encode("utf-8")).hexdigest()[:8]
    return f"{safe_name}-{digest}"


def _load_payload(results_file: Path) -> dict[str, object]:
    payload = json.loads(results_file.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected benchmark results object: {results_file}")
    return payload


def _agentbench_evaluation_report(
    *,
    benchmark: AgentBenchName,
    results_file: Path,
    results: tuple[AgentBenchTaskResult, ...],
) -> AgentBenchEvaluationReport:
    passed_count = sum(1 for result in results if result.passed)
    total_count = len(results)
    failed_task_ids = tuple(result.task_id for result in results if not result.passed)
    infra_failed_task_ids = tuple(
        result.task_id
        for result in results
        if not result.passed and result.failure_kind == "infra"
    )
    agent_failed_task_ids = tuple(
        result.task_id
        for result in results
        if not result.passed and result.failure_kind == "agent"
    )
    return AgentBenchEvaluationReport(
        benchmark=benchmark,
        generated_at=datetime.now(tz=timezone.utc),
        source_results_path=results_file.resolve(),
        total_count=total_count,
        passed_count=passed_count,
        pass_rate=passed_count / max(total_count, 1),
        failed_task_ids=failed_task_ids,
        infra_failed_task_ids=infra_failed_task_ids,
        agent_failed_task_ids=agent_failed_task_ids,
        results=results,
    )


def _agentbench_task_result_from_raw(
    *,
    benchmark: AgentBenchName,
    raw_task: Mapping[str, object],
) -> AgentBenchTaskResult:
    _ = benchmark
    return _agentbench_task_result(dict(raw_task))


def _agentbench_results(payload: dict[str, object]) -> tuple[AgentBenchTaskResult, ...]:
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raise RuntimeError("AgentBench results must contain a results list.")
    results: list[AgentBenchTaskResult] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        result = item
        results.append(_agentbench_task_result(result))
    return tuple(results)


def _agentbench_eval_results(payload: dict[str, object]) -> tuple[EvalResult, ...]:
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raise RuntimeError("AgentBench results must contain a results list.")
    results: list[EvalResult] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        result = item
        task = _agentbench_task_result(result)
        results.append(
            _agentbench_eval_result(task=task, agent_output=_raw_json(result))
        )
    return tuple(results)


def eval_result_from_agentbench_task(
    *,
    benchmark: AgentBenchName,
    raw_task: Mapping[str, object],
    item_id: str | None = None,
) -> EvalResult:
    raw_task_dict = dict(raw_task)
    task = _agentbench_task_result_from_raw(
        benchmark=benchmark,
        raw_task=raw_task_dict,
    )
    result = _agentbench_eval_result(task=task, agent_output=_raw_json(raw_task_dict))
    if item_id is None or item_id == result.item_id:
        return result
    return result.model_copy(update={"item_id": item_id})


def _agentbench_task_result(
    result: dict[str, object],
) -> AgentBenchTaskResult:
    suite = _string_field(result, "suite")
    task_id = _string_field(result, "task_id")
    return AgentBenchTaskResult(
        benchmark="agentbench",
        suite=suite,
        task_id=_agentbench_item_id(suite=suite, task_id=task_id),
        passed=result.get("passed") is True,
        status=_string_field(result, "status"),
        failure_kind=_string_field(result, "failure_kind"),
        duration_seconds=_float_field(result, "duration_seconds"),
        input_tokens=_int_field(result, "input_tokens"),
        cached_input_tokens=_int_field(result, "cached_input_tokens"),
        output_tokens=_int_field(result, "output_tokens"),
        reasoning_output_tokens=_int_field(result, "reasoning_output_tokens"),
        requests=_int_field(result, "requests"),
        tool_calls=_int_field(result, "tool_calls"),
        error_message=_string_field(result, "error_message"),
        log_path=_string_field(result, "log_path"),
    )


def _raw_json(result: dict[str, object]) -> str:
    return json.dumps(result, ensure_ascii=False, indent=2)


def _raw_task_from_eval_result(result: EvalResult) -> dict[str, JsonValue]:
    parsed = _raw_task_from_agent_output(result.agent_output)
    if parsed is not None:
        return parsed
    suite, task_id = _split_agentbench_item_id(result.item_id)
    status = _status_from_scorer_detail(result.scorer_detail)
    failure_kind = _failure_kind_from_scorer_detail(result.scorer_detail)
    if not result.passed and result.error:
        status = status if status != "completed" else "infra_error"
        failure_kind = failure_kind or "infra"
    return {
        "suite": suite,
        "task_id": task_id,
        "passed": result.passed,
        "status": status,
        "failure_kind": failure_kind,
        "duration_seconds": result.duration_seconds,
        "input_tokens": result.token_usage.input_tokens,
        "cached_input_tokens": result.token_usage.cached_input_tokens,
        "output_tokens": result.token_usage.output_tokens,
        "reasoning_output_tokens": result.token_usage.reasoning_output_tokens,
        "requests": result.token_usage.total_requests,
        "tool_calls": result.token_usage.total_tool_calls,
        "error_message": result.error or "",
        "log_path": result.log_path or "",
    }


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


def _status_from_scorer_detail(detail: str) -> str:
    for part in detail.split(";"):
        stripped = part.strip()
        if stripped.startswith("status="):
            return stripped.removeprefix("status=")
    return "completed"


def _failure_kind_from_scorer_detail(detail: str) -> str:
    for part in detail.split(";"):
        stripped = part.strip()
        if stripped.startswith("failure_kind="):
            return stripped.removeprefix("failure_kind=")
    return ""


def _agentbench_item_id(*, suite: str, task_id: str) -> str:
    if suite and task_id:
        return f"{suite}:{task_id}"
    return task_id


def _split_agentbench_item_id(item_id: str) -> tuple[str, str]:
    suite, separator, task_id = item_id.partition(":")
    if separator and suite in {"os", "db"}:
        return suite, task_id
    return "", item_id


def _agentbench_eval_result(
    *, task: AgentBenchTaskResult, agent_output: str
) -> EvalResult:
    failure_suffix = f"; failure_kind={task.failure_kind}" if task.failure_kind else ""
    scorer_detail = f"status={task.status or 'unset'}{failure_suffix}"
    outcome = _agentbench_outcome(task)
    error = (
        task.error_message or task.status or "infrastructure failure"
        if task.failure_kind == "infra"
        else None
    )
    return EvalResult(
        item_id=task.task_id,
        dataset=task.benchmark,
        run_id="",
        session_id="",
        outcome=outcome,
        passed=task.passed,
        score=1.0 if task.passed else 0.0,
        scorer_name=task.benchmark,
        scorer_detail=scorer_detail,
        agent_output=agent_output,
        token_usage=TokenUsage(
            input_tokens=task.input_tokens,
            cached_input_tokens=task.cached_input_tokens,
            output_tokens=task.output_tokens,
            reasoning_output_tokens=task.reasoning_output_tokens,
            total_tokens=task.input_tokens + task.output_tokens,
            total_requests=task.requests,
            total_tool_calls=task.tool_calls,
        ),
        duration_seconds=task.duration_seconds or 0.0,
        error=error,
        log_path=task.log_path or None,
    )


def _agentbench_outcome(task: AgentBenchTaskResult) -> RunOutcome:
    if task.passed:
        return RunOutcome.COMPLETED
    if task.status in {"agent_timeout", "step_limit", "task_timeout", "test_timeout"}:
        return RunOutcome.TIMEOUT
    if task.failure_kind == "infra":
        return RunOutcome.FAILED
    return RunOutcome.COMPLETED


def _string_field(payload: dict[str, object], field: str) -> str:
    value = payload.get(field)
    return value if isinstance(value, str) else ""


def _float_field(payload: dict[str, object], field: str) -> float | None:
    value = payload.get(field)
    if isinstance(value, int | float):
        return float(value)
    return None


def _int_field(payload: dict[str, object], field: str) -> int:
    value = payload.get(field)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0
