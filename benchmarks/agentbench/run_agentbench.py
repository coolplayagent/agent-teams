from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import time
from collections.abc import Callable, Sequence
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Mapping

import httpx
from pydantic import BaseModel, ConfigDict, JsonValue

from benchmarks.common.json_protocol import (
    BenchmarkJsonError,
    parse_agentbench_decision,
)
from benchmarks.common.relay_client import RelayTeamsHttpClient, RelayTokenUsage


class AgentBenchSuite(str, Enum):
    OS = "os"
    DB = "db"


class FailureKind(str, Enum):
    AGENT = "agent"
    INFRA = "infra"


class InfrastructureFailure(RuntimeError):
    pass


_RETRYABLE_INFRA_ERRORS = (
    InfrastructureFailure,
    httpx.HTTPError,
    OSError,
    subprocess.SubprocessError,
    TimeoutError,
)


class ShellScript(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = "bash"
    code: str


class OsEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match_answer: str | None = None
    match_strip: bool = True
    check_scripts: tuple[ShellScript | None, ...] = ()
    example_script: ShellScript | None = None


class OsTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    description: str
    image: str = "default"
    init_scripts: tuple[ShellScript, ...] = ()
    start_script: ShellScript | None = None
    evaluation: OsEvaluation


class OsDataSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_root: Path
    problem_glob: str
    script_dir: Path
    task_id_prefix: str


class DbTask(BaseModel):
    model_config = ConfigDict(extra="allow")

    task_id: str
    description: str
    label: tuple[str, ...]
    table: JsonValue
    add_description: str = ""
    evidence: str = ""
    query_type: str = "other"


class CommandResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    returncode: int
    stdout: str = ""
    stderr: str = ""


class StepRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: int
    action: str
    content: str
    observation: str = ""


class TaskResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suite: AgentBenchSuite
    task_id: str
    passed: bool
    status: str
    failure_kind: FailureKind | None = None
    attempts: int = 1
    answer: str | tuple[str, ...] | None = None
    expected: str | tuple[str, ...] | None = None
    steps: tuple[StepRecord, ...] = ()
    error_message: str = ""
    duration_seconds: float
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0


class AgentBenchRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    timestamp: datetime
    results: tuple[TaskResult, ...]
    passed_count: int
    total_count: int
    planned_count: int = 0
    completed_count: int = 0
    infrastructure_failure_count: int = 0
    agent_failure_count: int = 0
    pass_rate: float


class DockerClient:
    def __init__(self, docker: Path):
        self._docker = docker

    def create_sleep_container(self, image: str) -> str:
        result = self._run(
            [
                "create",
                "--entrypoint",
                "/bin/sleep",
                image,
                "infinity",
            ]
        )
        container_id = result.stdout.strip()
        if not container_id:
            raise InfrastructureFailure(
                f"Docker did not return a container id for {image}."
            )
        self._run(["start", container_id])
        return container_id

    def exec(
        self,
        container_id: str,
        command: Sequence[str],
        *,
        timeout_seconds: float = 60.0,
    ) -> CommandResult:
        try:
            result = subprocess.run(
                [str(self._docker), "exec", container_id, *command],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            return CommandResult(
                returncode=124,
                stdout=_timeout_output(exc.stdout),
                stderr=(
                    _timeout_output(exc.stderr)
                    or f"command timed out after {timeout_seconds} seconds"
                ),
            )
        return CommandResult(
            returncode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
        )

    def remove(self, container_id: str) -> None:
        subprocess.run(
            [str(self._docker), "rm", "--force", container_id],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

    def _run(self, args: Sequence[str]) -> CommandResult:
        result = subprocess.run(
            [str(self._docker), *args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            raise InfrastructureFailure(result.stderr.strip() or result.stdout.strip())
        return CommandResult(
            returncode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
        )


def _timeout_output(value: bytes | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run AgentBench OS and DB benchmarks through relay-teams."
    )
    parser.add_argument("--agentbench-root", type=Path, default=Path("/opt/AgentBench"))
    parser.add_argument("--suite", choices=["all", "os", "db"], default="all")
    parser.add_argument(
        "--output-dir", type=Path, default=Path("/benchmarks/results/agentbench")
    )
    parser.add_argument("--docker", type=Path, default=Path("docker"))
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--base-url", default="http://host.docker.internal:8000")
    parser.add_argument("--os-suite", choices=["std", "dev"], default="std")
    parser.add_argument("--os-data-file", type=Path)
    parser.add_argument("--os-script-dir", type=Path)
    parser.add_argument("--num-os-tasks", type=int)
    parser.add_argument("--num-db-tasks", type=int)
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Maximum AgentBench tasks to run concurrently.",
    )
    parser.add_argument(
        "--task-id",
        action="append",
        default=[],
        help=(
            "Run only the selected task id. Can be repeated. Values may be raw "
            "task ids or suite-prefixed ids like os:std-001-0."
        ),
    )
    parser.add_argument(
        "--list-tasks-output",
        type=Path,
        help="Write the selected task manifest as JSON and exit without running.",
    )
    parser.add_argument("--db-data-file", type=Path)
    parser.add_argument(
        "--max-steps",
        type=int,
        default=0,
        help="Maximum interaction steps per task. Use 0 for no step limit.",
    )
    parser.add_argument(
        "--task-timeout-seconds",
        type=float,
        default=0.0,
        help="Per-task wall-clock timeout. Use 0 for no task timeout.",
    )
    parser.add_argument("--infra-retry-attempts", type=int, default=2)
    parser.add_argument("--infra-retry-backoff-seconds", type=float, default=5.0)
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Ignore existing results.json in the output directory.",
    )
    parser.add_argument(
        "--rerun-infra-failures",
        action="store_true",
        help="When resuming, rerun tasks whose previous failure_kind was infra.",
    )
    parser.add_argument(
        "--rerun-db-mutation-failures",
        action="store_true",
        help=(
            "When resuming, rerun DB INSERT/UPDATE/DELETE tasks after adapter "
            "or scorer changes."
        ),
    )
    parser.add_argument(
        "--os-prompt-template",
        help=(
            "Optional OS prompt template. Use {task_description} as placeholder for the "
            "task statement."
        ),
    )
    parser.add_argument(
        "--db-prompt-template",
        help=(
            "Optional DB prompt template. Use {task_description} and {schema_info} as "
            "placeholders."
        ),
    )
    args = parser.parse_args()

    _configure_relay_env(args.base_url, args.workspace)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "results.json"

    agentbench_root = args.agentbench_root
    existing_run = None if args.restart else _load_existing_run_result(output_path)
    run_id = (
        existing_run.run_id
        if existing_run is not None
        else datetime.now(tz=timezone.utc).strftime("%Y-%m-%d__%H-%M-%S")
    )
    timestamp = (
        existing_run.timestamp
        if existing_run is not None
        else datetime.now(tz=timezone.utc)
    )
    os_tasks: tuple[OsTask, ...] = ()
    db_tasks: tuple[DbTask, ...] = ()
    if args.suite in {"all", "os"}:
        os_tasks = load_selected_os_tasks(
            agentbench_root=agentbench_root,
            suite=args.os_suite,
            data_file=args.os_data_file,
            script_dir=args.os_script_dir,
            limit=args.num_os_tasks,
        )
    if args.suite in {"all", "db"}:
        db_data_file = args.db_data_file or (
            agentbench_root / "data/dbbench/standard.jsonl"
        )
        db_tasks = load_db_tasks(data_file=db_data_file, limit=args.num_db_tasks)
    if args.task_id:
        os_tasks = tuple(
            task
            for task in os_tasks
            if _task_id_selected(AgentBenchSuite.OS, task.task_id, args.task_id)
        )
        db_tasks = tuple(
            task
            for task in db_tasks
            if _task_id_selected(AgentBenchSuite.DB, task.task_id, args.task_id)
        )

    db_mutation_task_ids = {
        task.task_id for task in db_tasks if _is_db_mutation_query(task.query_type)
    }
    result_map: dict[tuple[AgentBenchSuite, str], TaskResult] = {}
    if existing_run is not None:
        for result in existing_run.results:
            if args.rerun_infra_failures and result.failure_kind == FailureKind.INFRA:
                continue
            if (
                args.rerun_db_mutation_failures
                and result.suite == AgentBenchSuite.DB
                and result.task_id in db_mutation_task_ids
            ):
                continue
            result_map[_task_key(result.suite, result.task_id)] = result

    planned_keys = [
        *(_task_key(AgentBenchSuite.OS, task.task_id) for task in os_tasks),
        *(_task_key(AgentBenchSuite.DB, task.task_id) for task in db_tasks),
    ]

    if args.list_tasks_output is not None:
        write_task_manifest(
            output_path=args.list_tasks_output,
            os_tasks=os_tasks,
            db_tasks=db_tasks,
        )
        print(f"AgentBench task manifest written: {args.list_tasks_output}")
        return 0

    concurrency = max(1, args.concurrency)
    client = RelayTeamsHttpClient.from_env()
    completed_count = 0
    pending_os_tasks: list[OsTask] = []
    if os_tasks:
        docker = DockerClient(args.docker)
        for task in os_tasks:
            key = _task_key(AgentBenchSuite.OS, task.task_id)
            if key in result_map:
                completed_count += 1
                _print_skipped_task(completed_count, len(planned_keys), result_map[key])
                continue
            pending_os_tasks.append(task)
    else:
        docker = None
    pending_db_tasks: list[DbTask] = []
    for task in db_tasks:
        key = _task_key(AgentBenchSuite.DB, task.task_id)
        if key in result_map:
            completed_count += 1
            _print_skipped_task(completed_count, len(planned_keys), result_map[key])
            continue
        pending_db_tasks.append(task)

    def record_task_result(
        task_key: tuple[AgentBenchSuite, str],
        task_result: TaskResult,
    ) -> None:
        nonlocal completed_count
        result_map[task_key] = task_result
        completed_count += 1
        completed_results = _ordered_results(planned_keys, result_map)
        write_run_result(
            output_path=output_path,
            run_id=run_id,
            timestamp=timestamp,
            results=completed_results,
            planned_count=len(planned_keys),
        )
        _print_task_progress(completed_count, len(planned_keys), task_result)

    if concurrency == 1:
        if docker is not None:
            for task in pending_os_tasks:
                result = run_os_task(
                    task=task,
                    docker=docker,
                    relay_client=client,
                    max_steps=args.max_steps,
                    task_timeout_seconds=args.task_timeout_seconds,
                    infra_retry_attempts=args.infra_retry_attempts,
                    infra_retry_backoff_seconds=args.infra_retry_backoff_seconds,
                    os_prompt_template=args.os_prompt_template,
                )
                record_task_result(_task_key(AgentBenchSuite.OS, task.task_id), result)
        for task in pending_db_tasks:
            result = run_db_task(
                task=task,
                relay_client=client,
                max_steps=args.max_steps,
                task_timeout_seconds=args.task_timeout_seconds,
                infra_retry_attempts=args.infra_retry_attempts,
                infra_retry_backoff_seconds=args.infra_retry_backoff_seconds,
                db_prompt_template=args.db_prompt_template,
            )
            record_task_result(_task_key(AgentBenchSuite.DB, task.task_id), result)
    else:
        futures: dict[Future[TaskResult], tuple[AgentBenchSuite, str]] = {}
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            if docker is not None:
                for task in pending_os_tasks:
                    futures[
                        pool.submit(
                            run_os_task,
                            task=task,
                            docker=docker,
                            relay_client=client,
                            max_steps=args.max_steps,
                            task_timeout_seconds=args.task_timeout_seconds,
                            infra_retry_attempts=args.infra_retry_attempts,
                            infra_retry_backoff_seconds=args.infra_retry_backoff_seconds,
                            os_prompt_template=args.os_prompt_template,
                        )
                    ] = _task_key(AgentBenchSuite.OS, task.task_id)
            for task in pending_db_tasks:
                futures[
                    pool.submit(
                        run_db_task,
                        task=task,
                        relay_client=client,
                        max_steps=args.max_steps,
                        task_timeout_seconds=args.task_timeout_seconds,
                        infra_retry_attempts=args.infra_retry_attempts,
                        infra_retry_backoff_seconds=args.infra_retry_backoff_seconds,
                        db_prompt_template=args.db_prompt_template,
                    )
                ] = _task_key(AgentBenchSuite.DB, task.task_id)
            for future in as_completed(futures):
                record_task_result(futures[future], future.result())

    run_results = _ordered_results(planned_keys, result_map)
    run_result = write_run_result(
        output_path=output_path,
        run_id=run_id,
        timestamp=timestamp,
        results=run_results,
        planned_count=len(planned_keys),
    )
    print(f"AgentBench results written: {output_path}")
    print(
        f"AgentBench pass rate: {run_result.passed_count}/"
        f"{run_result.total_count} ({run_result.pass_rate:.1%})"
    )
    for result in run_result.results:
        print(
            f"{result.suite.value}:{result.task_id} "
            f"{'PASS' if result.passed else 'FAIL'} {result.status} "
            f"attempts={result.attempts}"
        )
    return 0 if run_results else 1


def _task_key(suite: AgentBenchSuite, task_id: str) -> tuple[AgentBenchSuite, str]:
    return suite, task_id


def _task_id_selected(
    suite: AgentBenchSuite, task_id: str, selected_task_ids: Sequence[str]
) -> bool:
    candidates = {task_id, f"{suite.value}:{task_id}"}
    return any(selected_task_id in candidates for selected_task_id in selected_task_ids)


def _load_existing_run_result(output_path: Path) -> AgentBenchRunResult | None:
    if not output_path.exists():
        return None
    run_result = AgentBenchRunResult.model_validate_json(
        output_path.read_text(encoding="utf-8")
    )
    return run_result.model_copy(
        update={
            "results": tuple(
                _rescore_existing_result(result) for result in run_result.results
            )
        }
    )


def _rescore_existing_result(result: TaskResult) -> TaskResult:
    if result.suite != AgentBenchSuite.DB or result.status != "completed":
        return result
    answer = _result_answer_tuple(result.answer)
    expected = _result_answer_tuple(result.expected)
    if not answer or not expected:
        return result
    passed = _compare_db_answers(answer, expected)
    return result.model_copy(
        update={
            "passed": passed,
            "failure_kind": None
            if passed
            else result.failure_kind or FailureKind.AGENT,
        }
    )


def _result_answer_tuple(value: str | tuple[str, ...] | None) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if value is None:
        return ()
    return value


def _ordered_results(
    planned_keys: Sequence[tuple[AgentBenchSuite, str]],
    result_map: dict[tuple[AgentBenchSuite, str], TaskResult],
) -> list[TaskResult]:
    return [result_map[key] for key in planned_keys if key in result_map]


def write_run_result(
    *,
    output_path: Path,
    run_id: str,
    timestamp: datetime,
    results: Sequence[TaskResult],
    planned_count: int,
) -> AgentBenchRunResult:
    passed_count = sum(1 for result in results if result.passed)
    infrastructure_failure_count = sum(
        1 for result in results if result.failure_kind == FailureKind.INFRA
    )
    agent_failure_count = sum(
        1 for result in results if result.failure_kind == FailureKind.AGENT
    )
    run_result = AgentBenchRunResult(
        run_id=run_id,
        timestamp=timestamp,
        results=tuple(results),
        passed_count=passed_count,
        total_count=len(results),
        planned_count=planned_count,
        completed_count=len(results),
        infrastructure_failure_count=infrastructure_failure_count,
        agent_failure_count=agent_failure_count,
        pass_rate=passed_count / max(len(results), 1),
    )
    tmp_path = output_path.with_name(f"{output_path.name}.tmp")
    tmp_path.write_text(
        run_result.model_dump_json(indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(output_path)
    return run_result


def write_task_manifest(
    *,
    output_path: Path,
    os_tasks: Sequence[OsTask],
    db_tasks: Sequence[DbTask],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for task in os_tasks:
        results.append(
            {
                "suite": AgentBenchSuite.OS.value,
                "task_id": task.task_id,
                "description": task.description,
            }
        )
    for task in db_tasks:
        results.append(
            {
                "suite": AgentBenchSuite.DB.value,
                "task_id": task.task_id,
                "description": _db_task_description(task),
                "query_type": task.query_type,
            }
        )
    output_path.write_text(
        json.dumps({"results": results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _db_task_description(task: DbTask) -> str:
    if not task.add_description:
        return task.description
    return f"{task.description}\n\n{task.add_description}"


def _print_task_progress(index: int, total: int, result: TaskResult) -> None:
    outcome = "PASS" if result.passed else "FAIL"
    failure = (
        f" failure_kind={result.failure_kind.value}" if result.failure_kind else ""
    )
    print(
        f"[{index}/{total}] {result.suite.value}:{result.task_id} "
        f"{outcome} status={result.status}{failure} "
        f"attempts={result.attempts} duration={result.duration_seconds:.1f}s"
    )


def _print_skipped_task(index: int, total: int, result: TaskResult) -> None:
    outcome = "PASS" if result.passed else "FAIL"
    print(
        f"[{index}/{total}] {result.suite.value}:{result.task_id} "
        f"SKIP existing={outcome} status={result.status} attempts={result.attempts}"
    )


def _configure_relay_env(base_url: str, workspace: Path | None) -> None:
    os.environ["RELAY_TEAMS_BENCH_BASE_URL"] = base_url
    if workspace is not None:
        os.environ["RELAY_TEAMS_BENCH_WORKSPACE"] = str(workspace)


def load_selected_os_tasks(
    *,
    agentbench_root: Path,
    suite: str,
    data_file: Path | None,
    script_dir: Path | None,
    limit: int | None,
) -> tuple[OsTask, ...]:
    if data_file is not None:
        if script_dir is None:
            raise RuntimeError(
                "--os-script-dir is required when --os-data-file is set."
            )
        return load_os_tasks(
            data_file=data_file,
            script_dir=script_dir,
            limit=limit,
            task_id_prefix="custom-",
        )
    if suite == "dev":
        return load_os_tasks(
            data_file=agentbench_root / "data/os_interaction/data/dev.json",
            script_dir=agentbench_root / "data/os_interaction/scripts/dev",
            limit=limit,
            task_id_prefix="dev-",
        )
    return load_os_tasks_from_specs(
        specs=default_os_std_specs(agentbench_root),
        limit=limit,
    )


def default_os_std_specs(agentbench_root: Path) -> tuple[OsDataSpec, ...]:
    return tuple(
        OsDataSpec(
            data_root=agentbench_root,
            problem_glob=f"data/os_interaction/data/{group}/*.json",
            script_dir=agentbench_root / f"data/os_interaction/scripts/{group}",
            task_id_prefix=f"std-{int(group):03d}-",
        )
        for group in ("1", "2", "3", "4", "5", "6", "7")
    )


def load_os_tasks_from_specs(
    *, specs: Sequence[OsDataSpec], limit: int | None
) -> tuple[OsTask, ...]:
    tasks: list[OsTask] = []
    for spec in specs:
        for data_file in sorted(spec.data_root.glob(spec.problem_glob)):
            remaining = None if limit is None else limit - len(tasks)
            if remaining is not None and remaining <= 0:
                return tuple(tasks)
            tasks.extend(
                load_os_tasks(
                    data_file=data_file,
                    script_dir=spec.script_dir,
                    limit=remaining,
                    task_id_prefix=f"{spec.task_id_prefix}{data_file.stem}-",
                )
            )
    return tuple(tasks)


def load_os_tasks(
    *, data_file: Path, script_dir: Path, limit: int | None, task_id_prefix: str
) -> tuple[OsTask, ...]:
    raw = json.loads(data_file.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        raw_tasks = [raw]
    elif isinstance(raw, list):
        raw_tasks = raw
    else:
        raise RuntimeError(f"Expected AgentBench OS task list: {data_file}")
    tasks: list[OsTask] = []
    items = raw_tasks if limit is None else raw_tasks[:limit]
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        task_obj = item
        create_obj = task_obj.get("create")
        image = "default"
        init_scripts: tuple[ShellScript, ...] = ()
        if isinstance(create_obj, dict):
            create = create_obj
            local_image = create.get("local")
            if isinstance(local_image, str):
                image = local_image
            init_obj = create.get("init")
            init_scripts = tuple(
                script
                for script in _load_script_list(init_obj, script_dir)
                if script is not None
            )
        start_script = _load_script_optional(task_obj.get("start"), script_dir)
        evaluation = _load_os_evaluation(task_obj.get("evaluation"), script_dir)
        tasks.append(
            OsTask(
                task_id=f"{task_id_prefix}{index}",
                description=str(task_obj.get("description", "")),
                image=image,
                init_scripts=init_scripts,
                start_script=start_script,
                evaluation=evaluation,
            )
        )
    return tuple(tasks)


def _load_os_evaluation(value: object, script_dir: Path) -> OsEvaluation:
    if not isinstance(value, dict):
        raise RuntimeError(f"Invalid AgentBench OS evaluation: {value!r}")
    evaluation = value
    match_obj = evaluation.get("match")
    if isinstance(match_obj, str):
        return OsEvaluation(match_answer=match_obj)
    if isinstance(match_obj, dict):
        match = match_obj
        answer = match.get("answer")
        strip = match.get("strip")
        return OsEvaluation(
            match_answer=str(answer) if answer is not None else "",
            match_strip=strip is not False,
        )
    check_scripts = tuple(_load_script_list(evaluation.get("check"), script_dir))
    example_script = _load_script_optional(evaluation.get("example"), script_dir)
    if check_scripts:
        return OsEvaluation(check_scripts=check_scripts, example_script=example_script)
    raise RuntimeError(f"Unsupported AgentBench OS evaluation: {value!r}")


def _load_script_list(value: object, script_dir: Path) -> list[ShellScript | None]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_load_script_optional(item, script_dir) for item in value]
    script = _load_script_optional(value, script_dir)
    return [] if script is None else [script]


def _load_script_optional(value: object, script_dir: Path) -> ShellScript | None:
    if value is None:
        return None
    if isinstance(value, str):
        return ShellScript(code=value)
    if not isinstance(value, dict):
        raise RuntimeError(f"Invalid AgentBench script object: {value!r}")
    script = value
    language_obj = script.get("language")
    language = language_obj if isinstance(language_obj, str) else "bash"
    file_obj = script.get("file")
    if isinstance(file_obj, str):
        return ShellScript(
            language=language,
            code=(script_dir / file_obj).read_text(encoding="utf-8"),
        )
    code_obj = script.get("code")
    if isinstance(code_obj, str):
        return ShellScript(language=language, code=code_obj)
    raise RuntimeError(f"AgentBench script must contain file or code: {value!r}")


def _run_with_infra_retries(
    *,
    suite: AgentBenchSuite,
    task_id: str,
    run_once: Callable[[], TaskResult],
    infra_retry_attempts: int,
    infra_retry_backoff_seconds: float,
) -> TaskResult:
    total_attempts = max(0, infra_retry_attempts) + 1
    backoff_seconds = max(0.0, infra_retry_backoff_seconds)
    started = time.monotonic()
    for attempt_number in range(1, total_attempts + 1):
        try:
            result = run_once()
            return _finalize_attempts(result, attempt_number)
        except _RETRYABLE_INFRA_ERRORS as exc:
            if attempt_number < total_attempts:
                _print_retryable_failure(
                    suite=suite,
                    task_id=task_id,
                    attempt_number=attempt_number,
                    total_attempts=total_attempts,
                    message=str(exc),
                    backoff_seconds=backoff_seconds,
                )
                if backoff_seconds > 0:
                    time.sleep(backoff_seconds)
                continue
            return _task_error(
                suite=suite,
                task_id=task_id,
                started=started,
                message=str(exc),
                status="infra_error",
                failure_kind=FailureKind.INFRA,
                attempts=attempt_number,
            )
        except Exception as exc:
            return _task_error(
                suite=suite,
                task_id=task_id,
                started=started,
                message=str(exc),
                status="adapter_error",
                failure_kind=FailureKind.INFRA,
                attempts=attempt_number,
            )
    raise RuntimeError("unreachable AgentBench retry state")


def _finalize_attempts(result: TaskResult, attempts: int) -> TaskResult:
    failure_kind = result.failure_kind
    if not result.passed and failure_kind is None:
        failure_kind = FailureKind.AGENT
    return result.model_copy(
        update={
            "attempts": attempts,
            "failure_kind": failure_kind,
        }
    )


def _print_retryable_failure(
    *,
    suite: AgentBenchSuite,
    task_id: str,
    attempt_number: int,
    total_attempts: int,
    message: str,
    backoff_seconds: float,
) -> None:
    print(
        f"{suite.value}:{task_id} retryable infra failure "
        f"on attempt {attempt_number}/{total_attempts}: {message}"
    )
    if backoff_seconds > 0:
        print(f"{suite.value}:{task_id} retrying after {backoff_seconds:.1f}s backoff")


def _ensure_relay_completed(terminal_event_type: str) -> None:
    if terminal_event_type != "run_completed":
        raise InfrastructureFailure(
            f"relay run ended with terminal event {terminal_event_type}"
        )


def _task_deadline(
    *,
    started: float,
    task_timeout_seconds: float,
) -> float | None:
    if task_timeout_seconds > 0:
        return started + task_timeout_seconds
    return None


def _task_timed_out(deadline: float | None) -> bool:
    return deadline is not None and time.monotonic() >= deadline


def _remaining_timeout_seconds(deadline: float | None) -> float | None:
    if deadline is None:
        return None
    return max(deadline - time.monotonic(), 0.001)


def _bounded_timeout_seconds(
    deadline: float | None,
    default_timeout_seconds: float,
) -> float:
    remaining = _remaining_timeout_seconds(deadline)
    if remaining is None:
        return default_timeout_seconds
    return min(default_timeout_seconds, remaining)


def _command_reached_task_deadline(
    *,
    deadline: float | None,
    timeout_seconds: float,
    default_timeout_seconds: float,
    result: CommandResult,
) -> bool:
    return _task_timed_out(deadline) or (
        deadline is not None
        and timeout_seconds < default_timeout_seconds
        and result.returncode == 124
    )


def _next_step_allowed(step_index: int, max_steps: int) -> bool:
    return max_steps <= 0 or step_index <= max_steps


def _add_relay_usage(
    usage: dict[str, int],
    relay_usage: RelayTokenUsage,
) -> None:
    usage["input_tokens"] += relay_usage.input_tokens
    usage["cached_input_tokens"] += relay_usage.cached_input_tokens
    usage["output_tokens"] += relay_usage.output_tokens
    usage["reasoning_output_tokens"] += relay_usage.reasoning_output_tokens
    usage["requests"] += relay_usage.requests
    usage["tool_calls"] += relay_usage.tool_calls


def _empty_usage() -> dict[str, int]:
    return {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_output_tokens": 0,
        "requests": 0,
        "tool_calls": 0,
    }


def run_os_task(
    *,
    task: OsTask,
    docker: DockerClient,
    relay_client: RelayTeamsHttpClient,
    max_steps: int,
    task_timeout_seconds: float,
    infra_retry_attempts: int,
    infra_retry_backoff_seconds: float,
    os_prompt_template: str | None,
) -> TaskResult:
    return _run_with_infra_retries(
        suite=AgentBenchSuite.OS,
        task_id=task.task_id,
        run_once=lambda: _run_os_task_once(
            task=task,
            docker=docker,
            relay_client=relay_client,
            max_steps=max_steps,
            task_timeout_seconds=task_timeout_seconds,
            os_prompt_template=os_prompt_template,
        ),
        infra_retry_attempts=infra_retry_attempts,
        infra_retry_backoff_seconds=infra_retry_backoff_seconds,
    )


def _run_os_task_once(
    *,
    task: OsTask,
    docker: DockerClient,
    relay_client: RelayTeamsHttpClient,
    max_steps: int,
    task_timeout_seconds: float,
    os_prompt_template: str | None,
) -> TaskResult:
    started = time.monotonic()
    steps: list[StepRecord] = []
    container_id = ""
    session_id: str | None = None
    usage = _empty_usage()
    answer = ""
    deadline = _task_deadline(
        started=started,
        task_timeout_seconds=task_timeout_seconds,
    )
    try:
        container_id = docker.create_sleep_container(f"local-os/{task.image}")
        for script in task.init_scripts:
            if _task_timed_out(deadline):
                return _task_timeout_result(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    started=started,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    usage=usage,
                )
            timeout_seconds = _bounded_timeout_seconds(deadline, 60.0)
            result = _run_container_script(
                docker,
                container_id,
                script,
                timeout_seconds=timeout_seconds,
            )
            if _command_reached_task_deadline(
                deadline=deadline,
                timeout_seconds=timeout_seconds,
                default_timeout_seconds=60.0,
                result=result,
            ):
                return _task_timeout_result(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    started=started,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    usage=usage,
                )
            if result.returncode != 0:
                raise InfrastructureFailure(
                    f"init failed: {result.stderr or result.stdout}"
                )
        if task.start_script is not None:
            if _task_timed_out(deadline):
                return _task_timeout_result(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    started=started,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    usage=usage,
                )
            timeout_seconds = _bounded_timeout_seconds(deadline, 60.0)
            result = _run_container_script(
                docker,
                container_id,
                task.start_script,
                timeout_seconds=timeout_seconds,
            )
            if _command_reached_task_deadline(
                deadline=deadline,
                timeout_seconds=timeout_seconds,
                default_timeout_seconds=60.0,
                result=result,
            ):
                return _task_timeout_result(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    started=started,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    usage=usage,
                )
            if result.returncode != 0:
                raise InfrastructureFailure(
                    f"start failed: {result.stderr or result.stdout}"
                )
        history: list[str] = [f"Problem: {task.description}"]
        executed_bash = False
        step_index = 1
        while _next_step_allowed(step_index, max_steps):
            if _task_timed_out(deadline):
                return _task_timeout_result(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    started=started,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    usage=usage,
                )
            prompt = _build_os_prompt(
                task=task,
                history=history,
                step_index=step_index,
                max_steps=max_steps,
                prompt_template=os_prompt_template,
            )
            try:
                relay_result = relay_client.run_prompt(
                    prompt,
                    session_id=session_id,
                    timeout_seconds=_remaining_timeout_seconds(deadline),
                )
            except httpx.TimeoutException:
                if _task_timed_out(deadline):
                    return _task_timeout_result(
                        suite=AgentBenchSuite.OS,
                        task_id=task.task_id,
                        started=started,
                        answer=answer,
                        expected=task.evaluation.match_answer,
                        steps=tuple(steps),
                        usage=usage,
                    )
                raise
            _ensure_relay_completed(relay_result.terminal_event_type)
            _add_relay_usage(usage, relay_result.token_usage)
            session_id = relay_result.session_id
            try:
                decision = parse_agentbench_decision(relay_result.text)
            except BenchmarkJsonError as exc:
                history.append(f"Format error: {exc}")
                steps.append(
                    StepRecord(
                        step=step_index,
                        action="format_error",
                        content=relay_result.text[-800:],
                        observation=str(exc),
                    )
                )
                step_index += 1
                continue
            if decision.name == "bash_action":
                script_obj = decision.arguments.get("script")
                script = script_obj if isinstance(script_obj, str) else ""
                if _task_timed_out(deadline):
                    return _task_timeout_result(
                        suite=AgentBenchSuite.OS,
                        task_id=task.task_id,
                        started=started,
                        answer=answer,
                        expected=task.evaluation.match_answer,
                        steps=tuple(steps),
                        usage=usage,
                    )
                timeout_seconds = _bounded_timeout_seconds(deadline, 60.0)
                result = docker.exec(
                    container_id,
                    ["bash", "-lc", script],
                    timeout_seconds=timeout_seconds,
                )
                usage["tool_calls"] += 1
                if _command_reached_task_deadline(
                    deadline=deadline,
                    timeout_seconds=timeout_seconds,
                    default_timeout_seconds=60.0,
                    result=result,
                ):
                    steps.append(
                        StepRecord(
                            step=step_index,
                            action=decision.name,
                            content=script,
                            observation="task timed out during bash_action",
                        )
                    )
                    return _task_timeout_result(
                        suite=AgentBenchSuite.OS,
                        task_id=task.task_id,
                        started=started,
                        answer=answer,
                        expected=task.evaluation.match_answer,
                        steps=tuple(steps),
                        usage=usage,
                    )
                observation = _truncate_observation(result.stdout or result.stderr)
                history.append(f"bash_action({script}) -> {observation}")
                steps.append(
                    StepRecord(
                        step=step_index,
                        action=decision.name,
                        content=script,
                        observation=observation,
                    )
                )
                executed_bash = True
                step_index += 1
                continue
            if (
                decision.name in {"answer_action", "finish_action"}
                and not executed_bash
            ):
                history.append(
                    "Protocol violation: you must run bash_action before "
                    "answer_action/finish_action."
                )
                steps.append(
                    StepRecord(
                        step=step_index,
                        action="protocol_violation",
                        content=decision.name,
                        observation="First action for OS tasks must be bash_action.",
                    )
                )
                step_index += 1
                continue
            if decision.name in {"answer_action", "finish_action"}:
                answer_obj = decision.arguments.get("answer")
                thought_obj = decision.arguments.get("thought")
                answer = (
                    answer_obj
                    if isinstance(answer_obj, str)
                    else thought_obj
                    if isinstance(thought_obj, str)
                    else ""
                )
                passed = _evaluate_os_answer(
                    docker,
                    container_id,
                    task,
                    answer,
                    deadline,
                )
                if passed is None:
                    return _task_timeout_result(
                        suite=AgentBenchSuite.OS,
                        task_id=task.task_id,
                        started=started,
                        answer=answer,
                        expected=task.evaluation.match_answer,
                        steps=tuple(steps),
                        usage=usage,
                    )
                steps.append(
                    StepRecord(
                        step=step_index,
                        action=decision.name,
                        content=answer,
                    )
                )
                return TaskResult(
                    suite=AgentBenchSuite.OS,
                    task_id=task.task_id,
                    passed=passed,
                    status="completed",
                    failure_kind=None if passed else FailureKind.AGENT,
                    answer=answer,
                    expected=task.evaluation.match_answer,
                    steps=tuple(steps),
                    duration_seconds=time.monotonic() - started,
                    input_tokens=usage["input_tokens"],
                    cached_input_tokens=usage["cached_input_tokens"],
                    output_tokens=usage["output_tokens"],
                    reasoning_output_tokens=usage["reasoning_output_tokens"],
                    requests=usage["requests"],
                    tool_calls=usage["tool_calls"],
                )
            history.append(f"Invalid action: {decision.name}")
            step_index += 1
        return TaskResult(
            suite=AgentBenchSuite.OS,
            task_id=task.task_id,
            passed=False,
            status="step_limit",
            failure_kind=FailureKind.AGENT,
            answer=answer,
            expected=task.evaluation.match_answer,
            steps=tuple(steps),
            duration_seconds=time.monotonic() - started,
            input_tokens=usage["input_tokens"],
            cached_input_tokens=usage["cached_input_tokens"],
            output_tokens=usage["output_tokens"],
            reasoning_output_tokens=usage["reasoning_output_tokens"],
            requests=usage["requests"],
            tool_calls=usage["tool_calls"],
        )
    finally:
        if container_id:
            docker.remove(container_id)


def _run_container_script(
    docker: DockerClient,
    container_id: str,
    script: ShellScript,
    *params: str,
    timeout_seconds: float = 60.0,
) -> CommandResult:
    if script.language == "python":
        return docker.exec(
            container_id,
            ["python3", "-c", script.code, *params],
            timeout_seconds=timeout_seconds,
        )
    return docker.exec(
        container_id,
        ["bash", "-lc", _noninteractive_shell_code(script.code), "_", *params],
        timeout_seconds=timeout_seconds,
    )


def _noninteractive_shell_code(code: str) -> str:
    if code.strip() == "apt remove sudo":
        return "SUDO_FORCE_REMOVE=yes apt remove sudo -y"
    return code


def _evaluate_os_answer(
    docker: DockerClient,
    container_id: str,
    task: OsTask,
    answer: str,
    deadline: float | None,
) -> bool | None:
    evaluation = task.evaluation
    if evaluation.match_answer is not None:
        candidate = answer.strip() if evaluation.match_strip else answer
        expected = (
            evaluation.match_answer.strip()
            if evaluation.match_strip
            else evaluation.match_answer
        )
        return candidate == expected
    params = [answer]
    for script in evaluation.check_scripts:
        active_script = script
        if active_script is None and evaluation.example_script is not None:
            active_script = evaluation.example_script
        if active_script is None:
            return False
        if _task_timed_out(deadline):
            return None
        timeout_seconds = _bounded_timeout_seconds(deadline, 60.0)
        result = _run_container_script(
            docker,
            container_id,
            active_script,
            *params,
            timeout_seconds=timeout_seconds,
        )
        if _command_reached_task_deadline(
            deadline=deadline,
            timeout_seconds=timeout_seconds,
            default_timeout_seconds=60.0,
            result=result,
        ):
            return None
        if result.returncode != 0:
            return False
        params.append(result.stdout)
    return True


def _apply_template(
    template: str,
    values: Mapping[str, str],
) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return rendered


def _build_os_prompt(
    task: OsTask,
    history: list[str],
    step_index: int,
    max_steps: int,
    prompt_template: str | None = None,
) -> str:
    default_prompt = (
        "You are solving an AgentBench OS task. The harness will play the role "
        "of a Linux Ubuntu operating system. Return exactly one JSON object and "
        "no markdown. Choose exactly one action on each turn. Bash code must not "
        "contain interactive input operations. Submit final answers only through "
        "answer_action, and keep them exact and precise.\n\n"
    )
    os_prompt = (
        _apply_template(
            prompt_template,
            {"task_description": task.description},
        )
        if prompt_template is not None
        else default_prompt
    )
    step_text = (
        f"Step {step_index}."
        if max_steps <= 0
        else f"Step {step_index} of {max_steps}."
    )
    first_step_protocol = (
        "Protocol: this is an OS task; you must issue bash_action first, then "
        "use answer_action after observing command output.\n"
    )
    finish_guidance = (
        "No step limit is configured, but you must return answer_action as soon "
        "as you are confident.\n"
        if max_steps <= 0
        else "If this is the final step, return answer_action with your best answer.\n"
    )
    return (
        f"{os_prompt}\n"
        f"{f'Task: {task.description}\n' if prompt_template is None else ''}"
        f"{step_text}\n"
        f"{first_step_protocol}"
        f"{finish_guidance}"
        "Return exactly one JSON object and no markdown.\n"
        "Available actions:\n"
        '{"name":"bash_action","arguments":{"script":"bash command"}}\n'
        '{"name":"answer_action","arguments":{"answer":"final exact answer"}}\n'
        '{"name":"finish_action","arguments":{"thought":"finished"}}\n\n'
        "History:\n" + "\n".join(history[-12:])
    )


def load_db_tasks(*, data_file: Path, limit: int | None) -> tuple[DbTask, ...]:
    tasks: list[DbTask] = []
    with data_file.open(encoding="utf-8") as fh:
        for index, line in enumerate(fh):
            if limit is not None and index >= limit:
                break
            payload = json.loads(line)
            if not isinstance(payload, dict):
                continue
            entry = payload
            labels = entry.get("label")
            query_type = entry.get("type")
            first_query_type = _first_query_type(query_type)
            expected = (
                entry.get("answer_md5")
                if _is_db_mutation_query(first_query_type)
                else labels
            )
            tasks.append(
                DbTask(
                    task_id=f"std-{index}",
                    description=str(entry.get("description", "")),
                    label=_db_answer_tuple_from_payload(expected),
                    table=entry.get("table"),
                    add_description=str(entry.get("add_description", "")),
                    evidence=str(entry.get("evidence", "")),
                    query_type=first_query_type,
                )
            )
    return tuple(tasks)


def _db_answer_tuple_from_payload(value: object) -> tuple[str, ...]:
    if isinstance(value, str):
        parsed = _db_answer_tuple_from_string(value)
        return parsed or (value,)
    if isinstance(value, list):
        items: list[str] = []
        for item in value:
            if isinstance(item, (list, tuple)):
                if len(item) == 1:
                    items.append(str(item[0]))
                else:
                    items.append(",".join(str(part) for part in item))
            else:
                items.append(str(item))
        return tuple(items)
    if value is None:
        return ()
    return (str(value),)


def _db_answer_tuple_from_string(value: str) -> tuple[str, ...]:
    stripped = value.strip()
    if not stripped.startswith("[") or not stripped.endswith("]"):
        return ()
    try:
        parsed = ast.literal_eval(stripped)
    except (SyntaxError, ValueError):
        return ()
    return _db_answer_tuple_from_payload(parsed)


def _first_query_type(value: object) -> str:
    if isinstance(value, list) and value:
        return str(value[0])
    return str(value or "other")


def _is_db_mutation_query(query_type: str) -> bool:
    return query_type.upper() in {"INSERT", "UPDATE", "DELETE"}


def run_db_task(
    *,
    task: DbTask,
    relay_client: RelayTeamsHttpClient,
    max_steps: int,
    task_timeout_seconds: float,
    infra_retry_attempts: int,
    infra_retry_backoff_seconds: float,
    db_prompt_template: str | None,
) -> TaskResult:
    return _run_with_infra_retries(
        suite=AgentBenchSuite.DB,
        task_id=task.task_id,
        run_once=lambda: _run_db_task_once(
            task=task,
            relay_client=relay_client,
            max_steps=max_steps,
            task_timeout_seconds=task_timeout_seconds,
            db_prompt_template=db_prompt_template,
        ),
        infra_retry_attempts=infra_retry_attempts,
        infra_retry_backoff_seconds=infra_retry_backoff_seconds,
    )


def _run_db_task_once(
    *,
    task: DbTask,
    relay_client: RelayTeamsHttpClient,
    max_steps: int,
    task_timeout_seconds: float,
    db_prompt_template: str | None,
) -> TaskResult:
    started = time.monotonic()
    steps: list[StepRecord] = []
    session_id: str | None = None
    usage = _empty_usage()
    deadline = _task_deadline(
        started=started,
        task_timeout_seconds=task_timeout_seconds,
    )
    conn = sqlite3.connect(":memory:")
    try:
        _load_db_table(conn, task.table)
        history: list[str] = [f"Question: {task.description}"]
        executed_sql = False
        step_index = 1
        while _next_step_allowed(step_index, max_steps):
            if _task_timed_out(deadline):
                return _task_timeout_result(
                    suite=AgentBenchSuite.DB,
                    task_id=task.task_id,
                    started=started,
                    answer=None,
                    expected=task.label,
                    steps=tuple(steps),
                    usage=usage,
                )
            prompt = _build_db_prompt(
                task=task,
                history=history,
                step_index=step_index,
                max_steps=max_steps,
                prompt_template=db_prompt_template,
            )
            try:
                relay_result = relay_client.run_prompt(
                    prompt,
                    session_id=session_id,
                    timeout_seconds=_remaining_timeout_seconds(deadline),
                )
            except httpx.TimeoutException:
                if _task_timed_out(deadline):
                    return _task_timeout_result(
                        suite=AgentBenchSuite.DB,
                        task_id=task.task_id,
                        started=started,
                        answer=None,
                        expected=task.label,
                        steps=tuple(steps),
                        usage=usage,
                    )
                raise
            _ensure_relay_completed(relay_result.terminal_event_type)
            _add_relay_usage(usage, relay_result.token_usage)
            session_id = relay_result.session_id
            try:
                decision = parse_agentbench_decision(relay_result.text)
            except BenchmarkJsonError as exc:
                history.append(f"Format error: {exc}")
                steps.append(
                    StepRecord(
                        step=step_index,
                        action="format_error",
                        content=relay_result.text[-800:],
                        observation=str(exc),
                    )
                )
                step_index += 1
                continue
            if decision.name == "execute_sql":
                query_obj = decision.arguments.get("query")
                query = query_obj if isinstance(query_obj, str) else ""
                usage["tool_calls"] += 1
                observation = _execute_sql(conn, query, deadline=deadline)
                if observation is None:
                    steps.append(
                        StepRecord(
                            step=step_index,
                            action=decision.name,
                            content=query,
                            observation="task timed out during SQL execution",
                        )
                    )
                    return _task_timeout_result(
                        suite=AgentBenchSuite.DB,
                        task_id=task.task_id,
                        started=started,
                        answer=None,
                        expected=task.label,
                        steps=tuple(steps),
                        usage=usage,
                    )
                executed_sql = True
                history.append(f"execute_sql({query}) -> {observation}")
                steps.append(
                    StepRecord(
                        step=step_index,
                        action=decision.name,
                        content=query,
                        observation=observation,
                    )
                )
                step_index += 1
                continue
            if decision.name == "commit_final_answer":
                answers = _answer_tuple(decision.arguments.get("answers"))
                if not executed_sql:
                    history.append(
                        "commit_final_answer rejected: run execute_sql first and use "
                        "the SQL result as the exact answer."
                    )
                    steps.append(
                        StepRecord(
                            step=step_index,
                            action="commit_before_sql",
                            content=json.dumps(answers, ensure_ascii=False),
                            observation="execute_sql is required before final answer",
                        )
                    )
                    step_index += 1
                    continue
                final_step = StepRecord(
                    step=step_index,
                    action=decision.name,
                    content=json.dumps(answers, ensure_ascii=False),
                )
                final_steps = (*steps, final_step)
                if _is_db_mutation_query(task.query_type):
                    try:
                        scored_hash = _calculate_db_tables_hash_with_deadline(
                            conn,
                            task.table,
                            deadline=deadline,
                        )
                        if scored_hash is None:
                            return _task_timeout_result(
                                suite=AgentBenchSuite.DB,
                                task_id=task.task_id,
                                started=started,
                                answer=answers,
                                expected=task.label,
                                steps=(
                                    *steps,
                                    final_step.model_copy(
                                        update={
                                            "observation": (
                                                "task timed out during DB mutation scoring"
                                            )
                                        }
                                    ),
                                ),
                                usage=usage,
                            )
                        scored_answer = (scored_hash,)
                    except sqlite3.DatabaseError as exc:
                        return TaskResult(
                            suite=AgentBenchSuite.DB,
                            task_id=task.task_id,
                            passed=False,
                            status="completed",
                            failure_kind=FailureKind.AGENT,
                            answer=answers,
                            expected=task.label,
                            steps=(
                                *steps,
                                final_step.model_copy(
                                    update={
                                        "observation": (
                                            "database mutation state could not be "
                                            f"scored: {exc}"
                                        )
                                    }
                                ),
                            ),
                            error_message=str(exc),
                            duration_seconds=time.monotonic() - started,
                            input_tokens=usage["input_tokens"],
                            cached_input_tokens=usage["cached_input_tokens"],
                            output_tokens=usage["output_tokens"],
                            reasoning_output_tokens=usage["reasoning_output_tokens"],
                            requests=usage["requests"],
                            tool_calls=usage["tool_calls"],
                        )
                else:
                    scored_answer = answers
                passed = _compare_db_answers(scored_answer, task.label)
                return TaskResult(
                    suite=AgentBenchSuite.DB,
                    task_id=task.task_id,
                    passed=passed,
                    status="completed",
                    failure_kind=None if passed else FailureKind.AGENT,
                    answer=scored_answer,
                    expected=task.label,
                    steps=final_steps,
                    duration_seconds=time.monotonic() - started,
                    input_tokens=usage["input_tokens"],
                    cached_input_tokens=usage["cached_input_tokens"],
                    output_tokens=usage["output_tokens"],
                    reasoning_output_tokens=usage["reasoning_output_tokens"],
                    requests=usage["requests"],
                    tool_calls=usage["tool_calls"],
                )
            history.append(f"Invalid action: {decision.name}")
            step_index += 1
        return TaskResult(
            suite=AgentBenchSuite.DB,
            task_id=task.task_id,
            passed=False,
            status="step_limit",
            failure_kind=FailureKind.AGENT,
            expected=task.label,
            steps=tuple(steps),
            duration_seconds=time.monotonic() - started,
            input_tokens=usage["input_tokens"],
            cached_input_tokens=usage["cached_input_tokens"],
            output_tokens=usage["output_tokens"],
            reasoning_output_tokens=usage["reasoning_output_tokens"],
            requests=usage["requests"],
            tool_calls=usage["tool_calls"],
        )
    finally:
        conn.close()


def _load_db_table(conn: sqlite3.Connection, table_value: JsonValue) -> None:
    tables: list[dict[str, JsonValue]] = []
    if isinstance(table_value, dict):
        tables = [table_value]
    elif isinstance(table_value, list):
        tables = [table for table in table_value if isinstance(table, dict)]
    for table in tables:
        table_name = str(table.get("table_name", "table_0"))
        table_info_obj = table.get("table_info")
        if not isinstance(table_info_obj, dict):
            continue
        table_info = table_info_obj
        columns_obj = table_info.get("columns")
        rows_obj = table_info.get("rows")
        if not isinstance(columns_obj, list) or not isinstance(rows_obj, list):
            continue
        columns = _db_columns(columns_obj)
        column_names = tuple(column_name for column_name, _column in columns)
        column_defs = ", ".join(
            f"{_quote_sql_identifier(column_name)} {_sqlite_column_type(column_obj)}"
            for column_name, column_obj in columns
        )
        conn.execute(
            f"CREATE TABLE {_quote_sql_identifier(table_name)} ({column_defs})"
        )
        placeholders = ", ".join("?" for _ in column_names)
        quoted_columns = ", ".join(
            _quote_sql_identifier(column) for column in column_names
        )
        for row in rows_obj:
            if not isinstance(row, list):
                continue
            values = [_sqlite_cell_value(item) for item in row[: len(column_names)]]
            values.extend(None for _ in range(len(column_names) - len(values)))
            conn.execute(
                f"INSERT INTO {_quote_sql_identifier(table_name)} "
                f"({quoted_columns}) VALUES ({placeholders})",
                values,
            )
    conn.commit()


def _db_columns(
    columns_obj: list[JsonValue],
) -> tuple[tuple[str, dict[str, JsonValue]], ...]:
    columns: list[tuple[str, dict[str, JsonValue]]] = []
    for index, column in enumerate(columns_obj):
        if not isinstance(column, dict):
            continue
        columns.append((str(column.get("name", f"column_{index}")), column))
    return tuple(columns)


def _sqlite_column_type(column: dict[str, JsonValue]) -> str:
    type_obj = column.get("type")
    if not isinstance(type_obj, str):
        return "TEXT"
    normalized = type_obj.strip().upper()
    if "INT" in normalized:
        return "INTEGER"
    if "REAL" in normalized or "FLOA" in normalized or "DOUB" in normalized:
        return "REAL"
    if "NUM" in normalized or "DEC" in normalized or "BOOL" in normalized:
        return "NUMERIC"
    if "BLOB" in normalized:
        return "BLOB"
    return "TEXT"


def _sqlite_cell_value(value: JsonValue) -> str | int | float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, str | int | float):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _calculate_db_tables_hash(conn: sqlite3.Connection, table_value: JsonValue) -> str:
    table_hashes: list[str] = []
    for table in _iter_db_table_payloads(table_value):
        table_name = str(table.get("table_name", "table_0"))
        table_info_obj = table.get("table_info")
        if not isinstance(table_info_obj, dict):
            continue
        table_info = table_info_obj
        columns_obj = table_info.get("columns")
        if not isinstance(columns_obj, list):
            continue
        columns = [
            str(column.get("name", f"column_{index}"))
            for index, column in enumerate(columns_obj)
            if isinstance(column, dict)
        ]
        if columns:
            table_hashes.append(_calculate_db_table_hash(conn, table_name, columns))
    return "_".join(sorted(table_hashes))


def _calculate_db_tables_hash_with_deadline(
    conn: sqlite3.Connection,
    table_value: JsonValue,
    *,
    deadline: float | None = None,
) -> str | None:
    timed_out = False

    def interrupt_after_deadline() -> int:
        nonlocal timed_out
        if _task_timed_out(deadline):
            timed_out = True
            return 1
        return 0

    if _task_timed_out(deadline):
        return None
    if deadline is not None:
        conn.set_progress_handler(interrupt_after_deadline, 1000)
    try:
        result = _calculate_db_tables_hash(conn, table_value)
        if timed_out or _task_timed_out(deadline):
            return None
        return result
    except sqlite3.Error:
        if timed_out or _task_timed_out(deadline):
            return None
        raise
    finally:
        if deadline is not None:
            conn.set_progress_handler(None, 0)


def _iter_db_table_payloads(table_value: JsonValue) -> tuple[dict[str, JsonValue], ...]:
    if isinstance(table_value, dict):
        return (table_value,)
    if isinstance(table_value, list):
        return tuple(table for table in table_value if isinstance(table, dict))
    return ()


def _calculate_db_table_hash(
    conn: sqlite3.Connection,
    table_name: str,
    columns: Sequence[str],
) -> str:
    quoted_columns = ", ".join(_quote_sql_identifier(column) for column in columns)
    cursor = conn.execute(
        f"SELECT {quoted_columns} FROM {_quote_sql_identifier(table_name)}"
    )
    row_hashes = []
    for row in cursor.fetchall():
        row_text = ",".join("" if item is None else str(item) for item in row)
        row_hashes.append(hashlib.md5(row_text.encode()).hexdigest()[:5])
    grouped_hashes = ",".join(sorted(row_hashes))
    return hashlib.md5(grouped_hashes.encode()).hexdigest()


def _quote_sql_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _execute_sql(
    conn: sqlite3.Connection,
    query: str,
    *,
    deadline: float | None = None,
) -> str | None:
    timed_out = False

    def interrupt_after_deadline() -> int:
        nonlocal timed_out
        if _task_timed_out(deadline):
            timed_out = True
            return 1
        return 0

    if _task_timed_out(deadline):
        return None
    if deadline is not None:
        conn.set_progress_handler(interrupt_after_deadline, 1000)
    try:
        cursor = conn.execute(query)
        rows = cursor.fetchall()
        conn.commit()
        return _truncate_observation(repr(rows))
    except sqlite3.Error as exc:
        if timed_out or _task_timed_out(deadline):
            return None
        return _truncate_observation(f"SQL error: {exc}")
    finally:
        if deadline is not None:
            conn.set_progress_handler(None, 0)


def _answer_tuple(value: JsonValue | None) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(item) for item in value)
    if isinstance(value, str):
        return (value,)
    return ()


def _compare_db_answers(candidate: tuple[str, ...], expected: tuple[str, ...]) -> bool:
    candidate_values = [_normalize_db_value(item) for item in candidate]
    expected_values = [_normalize_db_value(item) for item in expected]
    if len(candidate_values) != len(expected_values):
        return False
    matched = [False] * len(expected_values)
    for candidate_value in candidate_values:
        for index, expected_value in enumerate(expected_values):
            if not matched[index] and _db_values_equal(candidate_value, expected_value):
                matched[index] = True
                break
        else:
            return False
    return True


def _normalize_db_value(value: str) -> str:
    normalized = value.strip().strip("'\"").lower()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = _normalize_db_special_value(normalized)
    numeric_value = _normalize_db_number(normalized)
    if numeric_value is not None:
        return f"number:{numeric_value}"
    return f"text:{normalized}"


def _normalize_db_special_value(value: str) -> str:
    if value.endswith("%"):
        value = value[:-1].strip()
    return {
        "none": "0",
        "null": "0",
        "undefined": "0",
        "nan": "0",
        "inf": "0",
        "infinity": "0",
        "-inf": "0",
        "-infinity": "0",
        "": "0",
    }.get(value, value)


def _db_values_equal(candidate: str, expected: str) -> bool:
    if candidate == expected:
        return True
    candidate_number = _db_normalized_number_value(candidate)
    expected_number = _db_normalized_number_value(expected)
    if candidate_number is None or expected_number is None:
        return False
    return abs(candidate_number - expected_number) <= Decimal("0.01")


def _db_normalized_number_value(value: str) -> Decimal | None:
    if not value.startswith("number:"):
        return None
    try:
        return Decimal(value.removeprefix("number:"))
    except InvalidOperation:
        return None


def _normalize_db_number(value: str) -> str | None:
    candidate = value.replace(",", "")
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", candidate):
        return None
    try:
        number = Decimal(candidate)
    except InvalidOperation:
        return None
    normalized = format(number.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    if normalized == "-0":
        return "0"
    return normalized


def _build_db_prompt(
    task: DbTask,
    history: list[str],
    step_index: int,
    max_steps: int,
    prompt_template: str | None = None,
) -> str:
    table_preview = json.dumps(task.table, ensure_ascii=False)[:16000]
    default_prompt = (
        "You are solving an AgentBench DB task. The harness executes SQL and "
        "returns raw database responses. Return exactly one JSON object and no "
        "markdown. Choose exactly one action on each turn. Use execute_sql for "
        "one-line SQL statements, and execute only one SQL statement per action. "
        "Use commit_final_answer only when you are sure; the final answer must "
        "exactly match the expected answer. Never submit the final answer in a "
        "content field. You must run execute_sql at least once before "
        "commit_final_answer.\n\n"
    )
    db_prompt = (
        _apply_template(
            prompt_template,
            {
                "task_description": task.description,
                "schema_info": table_preview,
            },
        )
        if prompt_template is not None
        else default_prompt
    )
    step_text = (
        f"Step {step_index}."
        if max_steps <= 0
        else f"Step {step_index} of {max_steps}."
    )
    first_step_protocol = (
        "Protocol: this is a DB task; execute_sql must be the first action, "
        "then use commit_final_answer when you have the exact result.\n"
    )
    finish_guidance = (
        "No step limit is configured, but you must commit_final_answer as soon "
        "as you are confident.\n"
        if max_steps <= 0
        else "If this is the final step, commit_final_answer with your best answer.\n"
    )
    mutation_guidance = ""
    execute_sql_guidance = '{"name":"execute_sql","arguments":{"query":"SELECT ..."}}\n'
    final_answer_guidance = (
        '{"name":"commit_final_answer","arguments":{"answers":["exact answer"]}}\n'
    )
    if _is_db_mutation_query(task.query_type):
        mutation_guidance = (
            "- This is a database modification task. Execute the needed "
            f"{task.query_type.upper()} statement; scoring checks the final "
            "database state, not the final answer text.\n"
            "- After the database state is correct, commit any short final answer.\n"
        )
        execute_sql_guidance = (
            '{"name":"execute_sql","arguments":{"query":"SQL statement"}}\n'
        )
        final_answer_guidance = (
            '{"name":"commit_final_answer","arguments":{"answers":["done"]}}\n'
        )
    task_context = (
        f"Question: {task.description}\n"
        f"Evidence: {task.evidence or '(none)'}\n"
        f"Additional table description: {task.add_description or '(none)'}\n"
        f"Table JSON: {table_preview}\n\n"
        if prompt_template is None
        else ""
    )
    return (
        f"{db_prompt}\n"
        f"{task_context}"
        f"{step_text}\n"
        f"{first_step_protocol}"
        f"{finish_guidance}"
        "Query rules:\n"
        "- Execute one SQL statement per turn, written on one line.\n"
        "- Quote table and column names with double quotes.\n"
        "- Use exact cell spelling and case from the table.\n"
        "- Questions like 'What in COLUMN_A has a COLUMN_B of VALUE' ask for "
        "COLUMN_A, filtered by COLUMN_B = VALUE.\n"
        f"{mutation_guidance}"
        "Available actions:\n"
        f"{execute_sql_guidance}"
        f"{final_answer_guidance}\n"
        "History:\n" + "\n".join(history[-12:])
    )


def _truncate_observation(value: str, limit: int = 1200) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "\n[truncated]"


def _task_timeout_result(
    *,
    suite: AgentBenchSuite,
    task_id: str,
    started: float,
    answer: str | tuple[str, ...] | None,
    expected: str | tuple[str, ...] | None,
    steps: tuple[StepRecord, ...],
    usage: dict[str, int],
) -> TaskResult:
    return TaskResult(
        suite=suite,
        task_id=task_id,
        passed=False,
        status="task_timeout",
        failure_kind=FailureKind.AGENT,
        answer=answer,
        expected=expected,
        steps=steps,
        duration_seconds=time.monotonic() - started,
        input_tokens=usage["input_tokens"],
        cached_input_tokens=usage["cached_input_tokens"],
        output_tokens=usage["output_tokens"],
        reasoning_output_tokens=usage["reasoning_output_tokens"],
        requests=usage["requests"],
        tool_calls=usage["tool_calls"],
    )


def _task_error(
    suite: AgentBenchSuite,
    task_id: str,
    started: float,
    message: str,
    *,
    status: str = "error",
    failure_kind: FailureKind | None = FailureKind.INFRA,
    attempts: int = 1,
) -> TaskResult:
    return TaskResult(
        suite=suite,
        task_id=task_id,
        passed=False,
        status=status,
        failure_kind=failure_kind,
        attempts=attempts,
        error_message=message,
        duration_seconds=time.monotonic() - started,
    )


if __name__ == "__main__":
    raise SystemExit(main())
