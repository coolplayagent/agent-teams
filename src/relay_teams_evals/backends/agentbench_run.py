from __future__ import annotations

import json
import re
import threading
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from relay_teams_evals.backends.base import AgentBackend, AgentEvent
from relay_teams_evals.agentbench_runs.docker_runner import (
    AgentBenchDockerRunner,
    AgentBenchRunnerConfig,
    AgentBenchTaskDockerResult,
)
from relay_teams_evals.agentbench_runs.reporting import (
    AgentBenchName,
    eval_result_from_agentbench_task,
)
from relay_teams_evals.workspace.base import PreparedWorkspace

_SAFE_PATH_RE = re.compile(r"[^A-Za-z0-9_.-]+")


class _AgentBenchRunConfig(AgentBenchRunnerConfig, Protocol):
    @property
    def output_dir(self) -> Path:
        raise NotImplementedError

    @property
    def concurrency(self) -> int:
        raise NotImplementedError


class AgentBenchRunBackend(AgentBackend):
    """Run one AgentBench task through the Docker harness.

    The benchmark harness owns task setup and scoring. This backend adapts each
    raw task result into the normal eval event stream so the common EvalRunner
    can provide checkpointing, reruns, artifacts, and reporting.
    """

    def __init__(
        self,
        config: _AgentBenchRunConfig,
        scheduled_item_ids: tuple[str, ...] = (),
    ) -> None:
        self._config = config
        self._agentbench_name: AgentBenchName = "agentbench"
        self._scheduled_item_ids = tuple(scheduled_item_ids)
        self._suite_state_lock = threading.Lock()
        self._suite_ready_event = threading.Event()
        self._suite_results: dict[str, AgentBenchTaskDockerResult] = {}
        self._suite_error: Exception | None = None
        self._suite_running = False
        self._suite_output_dir: Path = (
            self._config.output_dir / "raw" / f"{self._agentbench_name}-suite"
        )

    def run(
        self,
        intent: str,
        workspace: PreparedWorkspace,
        keep_workspace: bool = False,
    ) -> Iterator[AgentEvent]:
        _ = (intent, keep_workspace)
        item_id = workspace.item_id
        if self._is_suite_execution_mode():
            task_result = self._run_item_via_suite(item_id=item_id)
        else:
            raw_output_dir = self._config.output_dir / "raw" / _safe_path_part(item_id)
            task_result = AgentBenchDockerRunner(self._config).run_item(
                benchmark=self._agentbench_name,
                item_id=item_id,
                output_dir=raw_output_dir,
            )
        run_id = _agentbench_run_id(self._agentbench_name, item_id)
        yield AgentEvent(type="metadata", run_id=run_id, session_id="")

        raw_json = json.dumps(
            task_result.raw_result,
            ensure_ascii=False,
            indent=2,
        )
        yield AgentEvent(type="text_delta", text=raw_json)

        eval_result = eval_result_from_agentbench_task(
            benchmark=self._agentbench_name,
            raw_task=dict(task_result.raw_result),
            item_id=item_id,
        )
        usage = eval_result.token_usage
        yield AgentEvent(
            type="token_usage",
            input_tokens=usage.input_tokens,
            cached_input_tokens=usage.cached_input_tokens,
            output_tokens=usage.output_tokens,
            reasoning_output_tokens=usage.reasoning_output_tokens,
            requests=usage.total_requests,
            tool_calls=usage.total_tool_calls,
        )
        if task_result.exit_code == 0:
            yield AgentEvent(type="completed")
        else:
            yield AgentEvent(type="failed")

    def _is_suite_execution_mode(self) -> bool:
        return self._config.agentbench.execution_mode == "suite"

    def _run_item_via_suite(self, *, item_id: str) -> AgentBenchTaskDockerResult:
        results = self._load_suite_results(item_id=item_id)
        try:
            return results[item_id]
        except KeyError as exc:
            raise RuntimeError(
                f"{self._agentbench_name} did not return result for {item_id!r}."
            ) from exc

    def _load_suite_results(
        self, *, item_id: str
    ) -> dict[str, AgentBenchTaskDockerResult]:
        waited_for_owner = False
        while True:
            should_wait = False
            with self._suite_state_lock:
                if self._suite_ready_event.is_set():
                    if self._suite_error is None:
                        return self._suite_results
                    if waited_for_owner:
                        raise self._suite_error
                    self._suite_ready_event.clear()
                    self._suite_error = None
                    self._suite_results = {}
                if self._suite_running:
                    should_wait = True
                else:
                    self._suite_running = True
                    break
            if should_wait:
                waited_for_owner = True
                self._suite_ready_event.wait()

        try:
            scheduled_item_ids = self._scheduled_item_ids
            if not scheduled_item_ids:
                scheduled_item_ids = (item_id,)
            runner = AgentBenchDockerRunner(self._config)
            suite_results = self._run_suite_items(
                runner=runner,
                item_ids=scheduled_item_ids,
                output_dir=self._suite_output_dir,
            )
            for retry_index in range(1, self._config.infra_retry_attempts + 1):
                retry_item_ids = _infra_failed_item_ids(
                    agentbench_name=self._agentbench_name,
                    results=suite_results,
                )
                if not retry_item_ids:
                    break
                try:
                    retry_results = self._run_suite_items(
                        runner=runner,
                        item_ids=retry_item_ids,
                        output_dir=_suite_retry_output_dir(
                            self._suite_output_dir,
                            retry_index,
                        ),
                    )
                except (OSError, RuntimeError, TimeoutError):
                    continue
                suite_results.update(retry_results)
            self._suite_results = suite_results
            self._suite_error = None
            return self._suite_results
        except Exception as exc:
            self._suite_error = exc
            raise
        finally:
            self._suite_running = False
            self._suite_ready_event.set()

    def _run_suite_items(
        self,
        *,
        runner: AgentBenchDockerRunner,
        item_ids: tuple[str, ...],
        output_dir: Path,
    ) -> dict[str, AgentBenchTaskDockerResult]:
        results = runner.run_items(
            benchmark=self._agentbench_name,
            item_ids=item_ids,
            output_dir=output_dir,
            concurrency=max(1, self._config.concurrency),
        )
        return {result.item_id: result for result in results}


def _safe_path_part(value: str) -> str:
    sanitized = _SAFE_PATH_RE.sub("_", value).strip("._")
    return sanitized or "item"


def _agentbench_run_id(agentbench_name: AgentBenchName, item_id: str) -> str:
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{agentbench_name}-{_safe_path_part(item_id)}-{timestamp}"


def _infra_failed_item_ids(
    *,
    agentbench_name: AgentBenchName,
    results: dict[str, AgentBenchTaskDockerResult],
) -> tuple[str, ...]:
    infra_item_ids: list[str] = []
    for item_id, result in results.items():
        eval_result = eval_result_from_agentbench_task(
            benchmark=agentbench_name,
            raw_task=dict(result.raw_result),
            item_id=item_id,
        )
        if not eval_result.passed and "failure_kind=infra" in eval_result.scorer_detail:
            infra_item_ids.append(item_id)
    return tuple(infra_item_ids)


def _suite_retry_output_dir(output_dir: Path, retry_index: int) -> Path:
    return output_dir.with_name(f"{output_dir.name}-infra-retry-{retry_index}")
