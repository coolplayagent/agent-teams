from __future__ import annotations

import argparse
import os
import subprocess
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path

from prepare_benchmarks import (
    DEFAULT_AGENTBENCH_IMAGE,
    DEFAULT_RUNTIME_IMAGE,
    docker_env,
    find_docker,
)
from relay_teams_evals.agentbench_runs.reporting import (
    AgentBenchEvaluationReport,
    ReportFormat,
    write_agentbench_outputs,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run AgentBench OS/DB through a container-local relay-teams server."
    )
    parser.add_argument("--runtime-image", default=DEFAULT_RUNTIME_IMAGE)
    parser.add_argument("--agentbench-image", default=DEFAULT_AGENTBENCH_IMAGE)
    parser.add_argument(
        "--run-id",
        help="Reuse a previous results directory to resume or rerun infra failures.",
    )
    parser.add_argument(
        "--results-root",
        type=Path,
        default=Path(".agent_teams/benchmarks/results"),
    )
    parser.add_argument("--suite", choices=["all", "os", "db"], default="all")
    parser.add_argument("--os-suite", choices=["std", "dev"], default="std")
    parser.add_argument("--num-os-tasks", type=int)
    parser.add_argument("--num-db-tasks", type=int)
    parser.add_argument("--max-steps", type=int)
    parser.add_argument("--task-timeout-seconds", type=float)
    parser.add_argument("--infra-retry-attempts", type=int, default=2)
    parser.add_argument("--infra-retry-backoff-seconds", type=float, default=5.0)
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--rerun-infra-failures", action="store_true")
    parser.add_argument("--rerun-db-mutation-failures", action="store_true")
    parser.add_argument("--model", default="deepseek-v4-flash")
    parser.add_argument("--model-base-url", default="https://api.deepseek.com")
    parser.add_argument("--api-key-env-var", default="DEEPSEEK_API_KEY")
    args = parser.parse_args()

    if not _has_api_key(args.api_key_env_var):
        raise SystemExit(
            f"{args.api_key_env_var} or RELAY_TEAMS_BENCH_API_KEY is not set. "
            "Export one before running this script."
        )

    docker = find_docker()
    env = docker_env(docker)
    results_root = args.results_root.resolve()
    run_id = args.run_id or datetime.now(tz=timezone.utc).strftime("%Y-%m-%d__%H-%M-%S")
    host_output_dir = results_root / "agentbench" / run_id
    container_output_dir = Path("/benchmarks/results/agentbench") / run_id
    host_output_dir.mkdir(parents=True, exist_ok=True)

    runtime_container = create_runtime_container(
        docker=docker,
        image=args.runtime_image,
        env=env,
    )
    benchmark_container: str | None = None
    try:
        benchmark_container = create_benchmark_container(
            docker=docker,
            env=env,
            runtime_container=runtime_container,
            image=args.agentbench_image,
            results_root=results_root,
            output_dir=container_output_dir,
            suite=args.suite,
            os_suite=args.os_suite,
            num_os_tasks=args.num_os_tasks,
            num_db_tasks=args.num_db_tasks,
            max_steps=args.max_steps,
            task_timeout_seconds=args.task_timeout_seconds,
            infra_retry_attempts=args.infra_retry_attempts,
            infra_retry_backoff_seconds=args.infra_retry_backoff_seconds,
            restart=args.restart,
            rerun_infra_failures=args.rerun_infra_failures,
            rerun_db_mutation_failures=args.rerun_db_mutation_failures,
            model=args.model,
            model_base_url=args.model_base_url,
            api_key_env_var=args.api_key_env_var,
        )
        exit_code = start_container(
            docker=docker, env=env, container=benchmark_container
        )
        evaluate_results(results_file=host_output_dir / "results.json")
        return exit_code
    finally:
        if benchmark_container is not None:
            remove_container(docker=docker, env=env, container=benchmark_container)
        remove_container(docker=docker, env=env, container=runtime_container)
        print(f"AgentBench Docker results: {host_output_dir / 'results.json'}")


def evaluate_results(*, results_file: Path) -> None:
    if not results_file.exists():
        return
    report = write_agentbench_outputs(
        benchmark="agentbench",
        results_file=results_file,
        report_format=ReportFormat.BOTH,
    )
    output_file = results_file.with_name("evaluation.json")
    _print_summary(report=report, output_file=output_file)


def _print_summary(*, report: AgentBenchEvaluationReport, output_file: Path) -> None:
    print(f"Evaluation report written: {output_file}")
    print(
        f"{report.benchmark}: {report.passed_count}/{report.total_count} "
        f"passed ({report.pass_rate * 100:.1f}%)"
    )
    if report.infra_failed_task_ids:
        print("Infrastructure failures:")
        for task_id in report.infra_failed_task_ids:
            print(f"  - {task_id}")
    if report.agent_failed_task_ids:
        print("Agent failures:")
        for task_id in report.agent_failed_task_ids:
            print(f"  - {task_id}")


def _has_api_key(api_key_env_var: str) -> bool:
    return bool(
        os.environ.get(api_key_env_var) or os.environ.get("RELAY_TEAMS_BENCH_API_KEY")
    )


def create_runtime_container(*, docker: Path, image: str, env: dict[str, str]) -> str:
    result = run(
        [str(docker), "create", image],
        env=env,
        stdout=subprocess.PIPE,
    )
    container_id = result.stdout.strip()
    if not container_id:
        raise RuntimeError(f"Docker did not return a runtime container id for {image}.")
    return container_id


def create_benchmark_container(
    *,
    docker: Path,
    env: dict[str, str],
    runtime_container: str,
    image: str,
    results_root: Path,
    output_dir: Path,
    suite: str,
    os_suite: str,
    num_os_tasks: int | None,
    num_db_tasks: int | None,
    max_steps: int | None,
    task_timeout_seconds: float | None,
    infra_retry_attempts: int,
    infra_retry_backoff_seconds: float,
    restart: bool,
    rerun_infra_failures: bool,
    rerun_db_mutation_failures: bool,
    model: str,
    model_base_url: str,
    api_key_env_var: str,
) -> str:
    command = [
        str(docker),
        "create",
        "--volumes-from",
        runtime_container,
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-v",
        f"{results_root}:/benchmarks/results",
        "-e",
        api_key_env_var,
        "-e",
        "RELAY_TEAMS_BENCH_API_KEY",
        "-e",
        f"RELAY_TEAMS_BENCH_API_KEY_ENV_VAR={api_key_env_var}",
        "-e",
        "PYTHONUNBUFFERED=1",
        "-e",
        f"RELAY_TEAMS_BENCH_MODEL={model}",
        "-e",
        f"RELAY_TEAMS_BENCH_MODEL_BASE_URL={model_base_url}",
        image,
        "python",
        "-m",
        "benchmarks.agentbench.run_agentbench",
        "--base-url",
        "http://127.0.0.1:8000",
        "--workspace",
        "/workspace",
        "--suite",
        suite,
        "--os-suite",
        os_suite,
        "--infra-retry-attempts",
        str(infra_retry_attempts),
        "--infra-retry-backoff-seconds",
        str(infra_retry_backoff_seconds),
        "--output-dir",
        str(output_dir),
    ]
    if max_steps is not None:
        command.extend(["--max-steps", str(max_steps)])
    if task_timeout_seconds is not None:
        command.extend(["--task-timeout-seconds", str(task_timeout_seconds)])
    if restart:
        command.append("--restart")
    if rerun_infra_failures:
        command.append("--rerun-infra-failures")
    if rerun_db_mutation_failures:
        command.append("--rerun-db-mutation-failures")
    if num_os_tasks is not None:
        command.extend(["--num-os-tasks", str(num_os_tasks)])
    if num_db_tasks is not None:
        command.extend(["--num-db-tasks", str(num_db_tasks)])

    result = run(command, env=env, stdout=subprocess.PIPE)
    container_id = result.stdout.strip()
    if not container_id:
        raise RuntimeError(
            f"Docker did not return a benchmark container id for {image}."
        )
    return container_id


def start_container(*, docker: Path, env: dict[str, str], container: str) -> int:
    result = run(
        [str(docker), "start", "-a", container],
        env=env,
        check=False,
    )
    return result.returncode


def remove_container(*, docker: Path, env: dict[str, str], container: str) -> None:
    run(
        [str(docker), "rm", "--force", container],
        env=env,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def run(
    command: Sequence[str],
    *,
    env: dict[str, str],
    check: bool = True,
    stdout: int | None = None,
    stderr: int | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        env=env,
        text=True,
        stdout=stdout,
        stderr=stderr,
        check=check,
    )


if __name__ == "__main__":
    raise SystemExit(main())
