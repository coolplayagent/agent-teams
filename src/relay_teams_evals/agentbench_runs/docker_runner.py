from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from collections.abc import Mapping, Sequence
from os import pathsep
from pathlib import Path, PurePosixPath
from typing import Protocol
from urllib.parse import SplitResult, urlsplit, urlunsplit

import typer
from pydantic import BaseModel, ConfigDict, JsonValue

from relay_teams_evals.agentbench_runs.reporting import (
    AgentBenchName,
)
from relay_teams_evals.loaders.agentbench_task_loader import (
    AgentBenchLoader,
)
from relay_teams_evals.models import EvalItem

_CONTAINER_RESULTS_ROOT = PurePosixPath("/benchmarks/results")
_CONFIG_STAGING_PATH = PurePosixPath("/agent-config-host")
_GENERIC_API_KEY_ENV_VAR = "RELAY_TEAMS_BENCH_API_KEY"
_MODEL_PROFILE_ENV_VAR = "RELAY_TEAMS_BENCH_MODEL_PROFILE"
_DEFAULT_MODEL_PROFILE = "deepseek"
_BENCHMARK_MAIN_AGENT_ROLE_ID = "MainAgent"
_CONTAINER_HOST_ALIAS = "host.docker.internal"
_LOOPBACK_PROXY_HOSTS = {"127.0.0.1", "localhost", "::1"}
_PROXY_ENV_NAMES = {
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
}
_NO_PROXY_ENV_NAMES = {"NO_PROXY", "no_proxy"}
_CONTAINER_NO_PROXY_DEFAULTS = (
    "localhost",
    "127.0.0.1",
    "::1",
    _CONTAINER_HOST_ALIAS,
)


class _AgentBenchConfigLike(Protocol):
    @property
    def runtime_image(self) -> str:
        raise NotImplementedError

    @property
    def benchmark_image(self) -> str:
        raise NotImplementedError

    @property
    def api_key_env_var(self) -> str:
        raise NotImplementedError

    @property
    def execution_mode(self) -> str:
        raise NotImplementedError

    @property
    def suite(self) -> str:
        raise NotImplementedError

    @property
    def os_suite(self) -> str:
        raise NotImplementedError

    @property
    def num_os_tasks(self) -> int | None:
        raise NotImplementedError

    @property
    def num_db_tasks(self) -> int | None:
        raise NotImplementedError

    @property
    def max_steps(self) -> int | None:
        raise NotImplementedError

    @property
    def task_timeout_seconds(self) -> float | None:
        raise NotImplementedError

    @property
    def rerun_infra_failures(self) -> bool:
        raise NotImplementedError

    @property
    def rerun_db_mutation_failures(self) -> bool:
        raise NotImplementedError

    @property
    def model(self) -> str:
        raise NotImplementedError

    @property
    def model_base_url(self) -> str:
        raise NotImplementedError

    @property
    def os_prompt_template(self) -> str | None:
        raise NotImplementedError

    @property
    def db_prompt_template(self) -> str | None:
        raise NotImplementedError


class _AgentTeamsConfigLike(Protocol):
    @property
    def session_mode(self) -> str:
        raise NotImplementedError

    @property
    def orchestration_preset_id(self) -> str | None:
        raise NotImplementedError

    @property
    def yolo(self) -> bool:
        raise NotImplementedError

    @property
    def timeout_seconds(self) -> float:
        raise NotImplementedError

    @property
    def config_dir(self) -> Path | None:
        raise NotImplementedError


class _DockerConfigLike(Protocol):
    @property
    def forward_env_vars(self) -> Sequence[str]:
        raise NotImplementedError

    @property
    def extra_env(self) -> Mapping[str, str]:
        raise NotImplementedError


class AgentBenchRunnerConfig(Protocol):
    @property
    def workspace_mode(self) -> str:
        raise NotImplementedError

    @property
    def agent_teams(self) -> _AgentTeamsConfigLike:
        raise NotImplementedError

    @property
    def docker(self) -> _DockerConfigLike:
        raise NotImplementedError

    @property
    def agentbench(self) -> _AgentBenchConfigLike:
        raise NotImplementedError

    @property
    def infra_retry_attempts(self) -> int:
        raise NotImplementedError

    @property
    def infra_retry_backoff_seconds(self) -> float:
        raise NotImplementedError


class AgentBenchTaskDockerResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benchmark: AgentBenchName
    item_id: str
    output_dir: Path
    results_file: Path
    exit_code: int
    raw_result: dict[str, JsonValue]


class AgentBenchTaskManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benchmark: AgentBenchName
    manifest_path: Path
    items: tuple[EvalItem, ...]


class AgentBenchDockerRunner:
    def __init__(self, cfg: AgentBenchRunnerConfig) -> None:
        self._cfg = cfg

    def discover_items(
        self,
        *,
        benchmark: AgentBenchName,
    ) -> AgentBenchTaskManifest:
        if self._cfg.workspace_mode != "docker":
            raise RuntimeError(
                "AgentBench evals require workspace_mode: docker in the eval config."
            )
        manifest_path = _agentbench_manifest_path(self._cfg, benchmark)
        loader = AgentBenchLoader()
        if manifest_path.exists():
            try:
                cached_items = tuple(loader.load(manifest_path))
            except (OSError, ValueError) as exc:
                typer.echo(f"Cached benchmark task manifest could not be loaded: {exc}")
                manifest_path.unlink(missing_ok=True)
            else:
                typer.echo(f"Using cached benchmark task manifest: {manifest_path}")
                return AgentBenchTaskManifest(
                    benchmark=benchmark,
                    manifest_path=manifest_path,
                    items=cached_items,
                )

        docker = _find_docker()
        env = _docker_env(docker)
        benchmark_image = self._agentbench_image(benchmark)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        if manifest_path.exists():
            manifest_path.unlink()
        container_manifest_path = _CONTAINER_RESULTS_ROOT / manifest_path.name

        typer.echo(f"Discovering benchmark tasks: {benchmark}")
        typer.echo(f"  benchmark_image={benchmark_image}")
        typer.echo(f"  manifest={manifest_path}")

        command = [
            str(docker),
            "create",
            "-v",
            f"{manifest_path.parent.resolve()}:{_CONTAINER_RESULTS_ROOT}",
            "-e",
            "PYTHONUNBUFFERED=1",
            "-e",
            "RELAY_TEAMS_BENCH_SKIP_SERVER_START=true",
            benchmark_image,
            *self._task_manifest_command(
                benchmark=benchmark,
                container_manifest_path=container_manifest_path,
            ),
        ]
        container = _create_container(
            env=env,
            command=command,
            image=benchmark_image,
        )
        try:
            exit_code = _start_container(docker=docker, env=env, container=container)
        finally:
            _remove_container(docker=docker, env=env, container=container)
        if exit_code != 0:
            raise RuntimeError(
                f"{benchmark} task discovery failed with exit code {exit_code}."
            )
        if not manifest_path.exists():
            raise RuntimeError(f"{benchmark} did not produce task manifest.")

        return AgentBenchTaskManifest(
            benchmark=benchmark,
            manifest_path=manifest_path,
            items=tuple(loader.load(manifest_path)),
        )

    def run_item(
        self,
        *,
        benchmark: AgentBenchName,
        item_id: str,
        output_dir: Path,
    ) -> AgentBenchTaskDockerResult:
        results = self.run_items(
            benchmark=benchmark,
            item_ids=(item_id,),
            output_dir=output_dir,
            concurrency=1,
            restart=True,
            rerun=False,
            write_missing_results=False,
        )
        if not results:
            raise RuntimeError(f"{benchmark} did not return result for {item_id!r}.")
        return results[0]

    def run_items(
        self,
        *,
        benchmark: AgentBenchName,
        item_ids: Sequence[str],
        output_dir: Path,
        limit: int | None = None,
        concurrency: int = 1,
        restart: bool = True,
        rerun: bool = False,
        write_missing_results: bool = True,
    ) -> tuple[AgentBenchTaskDockerResult, ...]:
        if self._cfg.workspace_mode != "docker":
            raise RuntimeError(
                "AgentBench evals require workspace_mode: docker in the eval config."
            )
        selected_item_ids = tuple(dict.fromkeys(item_ids))
        if not selected_item_ids:
            raise RuntimeError(f"{benchmark} run requires at least one task-id.")
        representative_item_id = selected_item_ids[0]
        docker = _find_docker()
        env = _docker_env(docker)
        resolved_output_dir = output_dir.resolve()
        if resolved_output_dir.exists():
            shutil.rmtree(resolved_output_dir, ignore_errors=True)
        resolved_output_dir.mkdir(parents=True, exist_ok=True)
        container_output_dir = _agentbench_container_output_dir(
            benchmark=benchmark,
            host_output_dir=resolved_output_dir,
        )

        runtime_image = self._runtime_image(benchmark)
        benchmark_image = self._agentbench_image(benchmark)
        _validate_agentbench_model_source(self._cfg, benchmark=benchmark)

        typer.echo(f"  [{representative_item_id}] preparing benchmark container")
        typer.echo(
            f"  [{representative_item_id}] benchmark={benchmark} image={benchmark_image}"
        )
        typer.echo(f"  [{representative_item_id}] raw_output_dir={resolved_output_dir}")

        runtime_container = _create_runtime_container(
            docker=docker,
            image=runtime_image,
            env=env,
        )
        benchmark_container: str | None = None
        container_log_path = resolved_output_dir / "benchmark-container.log"
        try:
            command = self._agentbench_container_command(
                docker=docker,
                runtime_container=runtime_container,
                benchmark=benchmark,
                benchmark_image=benchmark_image,
                host_output_dir=resolved_output_dir,
                container_output_dir=container_output_dir,
                selected_item_ids=selected_item_ids,
                limit=limit,
                concurrency=max(1, concurrency),
                restart=restart,
                rerun=rerun,
            )
            benchmark_container = _create_container(
                env=env,
                command=command,
                image=benchmark_image,
            )
            exit_code = _start_container(
                docker=docker,
                env=env,
                container=benchmark_container,
                log_path=container_log_path,
            )
        finally:
            if benchmark_container is not None:
                _remove_container(docker=docker, env=env, container=benchmark_container)
            _remove_container(docker=docker, env=env, container=runtime_container)

        results_file = _agentbench_results_file(
            benchmark=benchmark,
            output_dir=resolved_output_dir,
        )
        if results_file is None:
            if not write_missing_results:
                raise RuntimeError(
                    _missing_agentbench_results_message(
                        benchmark=benchmark,
                        output_dir=resolved_output_dir,
                        selected_item_ids=selected_item_ids,
                        exit_code=exit_code,
                        log_path=container_log_path,
                    )
                )
            results_file = _write_missing_agentbench_results_file(
                benchmark=benchmark,
                output_dir=resolved_output_dir,
                selected_item_ids=selected_item_ids,
                exit_code=exit_code,
                log_path=container_log_path,
            )
        raw_results = _raw_agentbench_results(
            benchmark=benchmark,
            results_file=results_file,
        )
        results_by_item_id: dict[str, dict[str, JsonValue]] = {}
        for raw_result in raw_results:
            task_id = _result_item_id(
                benchmark=benchmark,
                raw_result=raw_result,
            )
            if task_id and task_id not in results_by_item_id:
                results_by_item_id[task_id] = raw_result
        missing_item_ids = [
            selected_item_id
            for selected_item_id in selected_item_ids
            if selected_item_id not in results_by_item_id
        ]
        if missing_item_ids:
            if len(selected_item_ids) == 1:
                raise RuntimeError(
                    f"{benchmark} did not return results for item(s): "
                    f"{', '.join(missing_item_ids)}."
                )
            for missing_item_id in missing_item_ids:
                results_by_item_id[missing_item_id] = _missing_agentbench_result(
                    benchmark=benchmark,
                    item_id=missing_item_id,
                    message=(
                        f"{benchmark} suite did not return a result for "
                        f"{missing_item_id}."
                    ),
                )
        return tuple(
            AgentBenchTaskDockerResult(
                benchmark=benchmark,
                item_id=selected_item_id,
                output_dir=resolved_output_dir,
                results_file=results_file,
                exit_code=exit_code,
                raw_result=results_by_item_id[selected_item_id],
            )
            for selected_item_id in selected_item_ids
        )

    def _runtime_image(self, benchmark: AgentBenchName) -> str:
        _ = benchmark
        return self._cfg.agentbench.runtime_image

    def _agentbench_image(self, benchmark: AgentBenchName) -> str:
        _ = benchmark
        return self._cfg.agentbench.benchmark_image

    def _task_manifest_command(
        self,
        *,
        benchmark: AgentBenchName,
        container_manifest_path: PurePosixPath,
    ) -> list[str]:
        _ = benchmark
        return self._agentbench_manifest_command(container_manifest_path)

    def _agentbench_manifest_command(
        self, container_manifest_path: PurePosixPath
    ) -> list[str]:
        cfg = self._cfg.agentbench
        command = [
            "python",
            "-m",
            "benchmarks.agentbench.run_agentbench",
            "--suite",
            cfg.suite,
            "--os-suite",
            cfg.os_suite,
            "--list-tasks-output",
            str(container_manifest_path),
        ]
        if cfg.num_os_tasks is not None:
            command.extend(["--num-os-tasks", str(cfg.num_os_tasks)])
        if cfg.num_db_tasks is not None:
            command.extend(["--num-db-tasks", str(cfg.num_db_tasks)])
        return command

    def _agentbench_container_command(
        self,
        *,
        docker: Path,
        runtime_container: str,
        benchmark: AgentBenchName,
        benchmark_image: str,
        host_output_dir: Path,
        container_output_dir: PurePosixPath,
        selected_item_ids: Sequence[str],
        limit: int | None,
        concurrency: int,
        restart: bool,
        rerun: bool,
    ) -> list[str]:
        command = [
            str(docker),
            "create",
            "--volumes-from",
            runtime_container,
            "-v",
            "/var/run/docker.sock:/var/run/docker.sock",
            *self._output_mount_args(host_output_dir=host_output_dir),
            *self._config_mount_args(),
            *self._env_args(benchmark),
            benchmark_image,
        ]
        command.extend(
            self._agentbench_command(
                container_output_dir=container_output_dir,
                selected_item_ids=selected_item_ids,
                limit=limit,
                concurrency=max(1, concurrency),
                restart=restart,
                rerun=rerun,
            )
        )
        return command

    def _agentbench_command(
        self,
        *,
        container_output_dir: PurePosixPath,
        selected_item_ids: Sequence[str],
        limit: int | None,
        concurrency: int,
        restart: bool,
        rerun: bool,
    ) -> list[str]:
        cfg = self._cfg.agentbench
        command = [
            "python",
            "-m",
            "benchmarks.agentbench.run_agentbench",
            "--base-url",
            "http://127.0.0.1:8000",
            "--workspace",
            "/workspace",
            "--suite",
            cfg.suite,
            "--os-suite",
            cfg.os_suite,
            "--infra-retry-attempts",
            str(self._cfg.infra_retry_attempts),
            "--infra-retry-backoff-seconds",
            str(self._cfg.infra_retry_backoff_seconds),
            "--output-dir",
            str(container_output_dir),
            "--concurrency",
            str(concurrency),
        ]
        num_os_tasks, num_db_tasks = _agentbench_task_limits(
            suite=cfg.suite,
            limit=limit,
            num_os_tasks=cfg.num_os_tasks,
            num_db_tasks=cfg.num_db_tasks,
        )
        if num_os_tasks is not None:
            command.extend(["--num-os-tasks", str(num_os_tasks)])
        if num_db_tasks is not None:
            command.extend(["--num-db-tasks", str(num_db_tasks)])
        if cfg.max_steps is not None:
            command.extend(["--max-steps", str(cfg.max_steps)])
        if cfg.task_timeout_seconds is not None:
            command.extend(["--task-timeout-seconds", str(cfg.task_timeout_seconds)])
        if cfg.os_prompt_template is not None:
            command.extend(["--os-prompt-template", cfg.os_prompt_template])
        if cfg.db_prompt_template is not None:
            command.extend(["--db-prompt-template", cfg.db_prompt_template])
        if restart:
            command.append("--restart")
        if cfg.rerun_infra_failures or rerun:
            command.append("--rerun-infra-failures")
        if cfg.rerun_db_mutation_failures:
            command.append("--rerun-db-mutation-failures")
        for item_id in selected_item_ids:
            command.extend(["--task-id", item_id])
        return command

    def _config_mount_args(self) -> list[str]:
        config_dir = self._cfg.agent_teams.config_dir
        if config_dir is None:
            return []
        resolved = config_dir.expanduser().resolve()
        return ["-v", f"{resolved}:{_CONFIG_STAGING_PATH}:ro"]

    @staticmethod
    def _output_mount_args(*, host_output_dir: Path) -> list[str]:
        return ["-v", f"{host_output_dir.parent}:{_CONTAINER_RESULTS_ROOT}"]

    def _env_args(self, benchmark: AgentBenchName) -> list[str]:
        api_key_env_var = self._api_key_env_var(benchmark)
        env_args: list[str] = [
            "-e",
            "PYTHONUNBUFFERED=1",
            "-e",
            f"{_MODEL_PROFILE_ENV_VAR}={_agentbench_model_profile(self._cfg)}",
            "-e",
            f"RELAY_TEAMS_BENCH_API_KEY_ENV_VAR={api_key_env_var}",
            "-e",
            f"RELAY_TEAMS_BENCH_SESSION_MODE={self._cfg.agent_teams.session_mode}",
            "-e",
            f"RELAY_TEAMS_BENCH_TIMEOUT_SECONDS={self._cfg.agent_teams.timeout_seconds}",
            "-e",
            f"RELAY_TEAMS_BENCH_YOLO={str(self._cfg.agent_teams.yolo).lower()}",
        ]
        if self._cfg.agent_teams.orchestration_preset_id is not None:
            env_args.extend(
                [
                    "-e",
                    "RELAY_TEAMS_BENCH_ORCHESTRATION_ID="
                    f"{self._cfg.agent_teams.orchestration_preset_id}",
                ]
            )
        if self._cfg.agent_teams.session_mode == "normal":
            env_args.extend(
                [
                    "-e",
                    f"RELAY_TEAMS_BENCH_ROLE_ID={_BENCHMARK_MAIN_AGENT_ROLE_ID}",
                ]
            )
        forwarded = [
            api_key_env_var,
            _GENERIC_API_KEY_ENV_VAR,
            *self._cfg.docker.forward_env_vars,
        ]
        seen: set[str] = set()
        for name in forwarded:
            if name in seen:
                continue
            seen.add(name)
            env_args.extend(["-e", _container_env_var_assignment(name)])
        for key, value in sorted(self._cfg.docker.extra_env.items()):
            env_args.extend(["-e", f"{key}={value}"])
        _ = benchmark
        env_args.extend(
            [
                "-e",
                f"RELAY_TEAMS_BENCH_MODEL={self._cfg.agentbench.model}",
                "-e",
                "RELAY_TEAMS_BENCH_MODEL_BASE_URL="
                f"{self._cfg.agentbench.model_base_url}",
            ]
        )
        return env_args

    def _api_key_env_var(self, benchmark: AgentBenchName) -> str:
        _ = benchmark
        return self._cfg.agentbench.api_key_env_var


def normalize_agentbench_dataset_name(dataset: str) -> AgentBenchName | None:
    if dataset == "agentbench":
        return "agentbench"
    return None


def _container_env_var_assignment(name: str) -> str:
    if name in _NO_PROXY_ENV_NAMES:
        return f"{name}={_container_no_proxy_value(os.environ.get(name, ''))}"
    if name in _PROXY_ENV_NAMES:
        value = os.environ.get(name)
        if value is None:
            return name
        return f"{name}={_rewrite_loopback_proxy_url_for_container(value)}"
    return name


def _rewrite_loopback_proxy_url_for_container(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        return value
    try:
        parsed = _split_proxy_url_for_container(stripped)
    except ValueError:
        return value
    hostname = parsed.hostname
    if hostname not in _LOOPBACK_PROXY_HOSTS:
        return value
    return urlunsplit(
        SplitResult(
            parsed.scheme,
            _proxy_netloc_with_host(parsed, _CONTAINER_HOST_ALIAS),
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )


def _split_proxy_url_for_container(value: str) -> SplitResult:
    if "://" in value:
        return urlsplit(value)
    return urlsplit(f"http://{value}")


def _proxy_netloc_with_host(parsed: SplitResult, host: str) -> str:
    auth = ""
    if parsed.username is not None:
        auth = parsed.username
        if parsed.password is not None:
            auth = f"{auth}:{parsed.password}"
        auth = f"{auth}@"
    port = _proxy_port(parsed)
    port_suffix = f":{port}" if port is not None else ""
    return f"{auth}{host}{port_suffix}"


def _proxy_port(parsed: SplitResult) -> int | None:
    try:
        return parsed.port
    except ValueError:
        return None


def _container_no_proxy_value(value: str) -> str:
    entries: list[str] = []
    seen: set[str] = set()

    def append_entry(candidate: str) -> None:
        stripped = candidate.strip()
        if not stripped:
            return
        key = stripped.lower()
        if key in seen:
            return
        seen.add(key)
        entries.append(stripped)

    for raw_candidate in value.replace(";", ",").split(","):
        append_entry(raw_candidate)
    for default_candidate in _CONTAINER_NO_PROXY_DEFAULTS:
        append_entry(default_candidate)
    return ",".join(entries)


def _agentbench_task_limits(
    *,
    suite: str,
    limit: int | None,
    num_os_tasks: int | None,
    num_db_tasks: int | None,
) -> tuple[int | None, int | None]:
    if limit is None:
        return num_os_tasks, num_db_tasks
    if suite == "os":
        return limit, 0
    if suite == "db":
        return 0, limit
    if num_os_tasks is not None or num_db_tasks is not None:
        return num_os_tasks, num_db_tasks
    return limit, 0


def _agentbench_container_output_dir(
    *, benchmark: AgentBenchName, host_output_dir: Path
) -> PurePosixPath:
    _ = benchmark
    return _CONTAINER_RESULTS_ROOT / host_output_dir.name


def _validate_agentbench_model_source(
    cfg: AgentBenchRunnerConfig, *, benchmark: AgentBenchName
) -> None:
    config_dir = cfg.agent_teams.config_dir
    model_profile = _agentbench_model_profile(cfg)
    model_config_has_api_key = config_dir is not None and _model_config_has_api_key(
        config_dir.expanduser() / "model.json",
        profile_name=model_profile,
    )
    api_key_env_vars = _configured_agentbench_api_key_env_vars(cfg, benchmark=benchmark)
    if (
        model_config_has_api_key
        or any(os.environ.get(name) for name in api_key_env_vars)
        or any(cfg.docker.extra_env.get(name, "").strip() for name in api_key_env_vars)
    ):
        return
    raise RuntimeError(
        "AgentBench Docker runs need an API key in one of "
        f"{', '.join(api_key_env_vars)} or agent_teams.config_dir pointing at a "
        f"model.json profile named {model_profile!r} with api_key. Docker benchmark "
        "containers cannot read the host keyring."
    )


def _agentbench_model_profile(cfg: AgentBenchRunnerConfig) -> str:
    configured = cfg.docker.extra_env.get(_MODEL_PROFILE_ENV_VAR, "").strip()
    return configured or _DEFAULT_MODEL_PROFILE


def _configured_agentbench_api_key_env_vars(
    cfg: AgentBenchRunnerConfig, *, benchmark: AgentBenchName
) -> tuple[str, ...]:
    _ = benchmark
    configured_name = cfg.agentbench.api_key_env_var
    names = (
        configured_name,
        _GENERIC_API_KEY_ENV_VAR,
    )
    return tuple(dict.fromkeys(name for name in names if name.strip()))


def _model_config_has_api_key(model_config_path: Path, *, profile_name: str) -> bool:
    try:
        payload = json.loads(model_config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    profile = payload.get(profile_name)
    if not isinstance(profile, dict):
        return False
    api_key = profile.get("api_key")
    return isinstance(api_key, str) and bool(api_key.strip())


def _find_docker() -> Path:
    for candidate in _docker_path_candidates():
        if not candidate.exists():
            continue
        env = _docker_env(candidate)
        result = subprocess.run(
            [str(candidate), "info", "--format", "{{.ServerVersion}}"],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode == 0:
            return candidate
    raise RuntimeError("Docker CLI is not available or Docker Desktop is not running.")


def _docker_path_candidates() -> tuple[Path, ...]:
    candidates: list[Path] = []
    seen: set[Path] = set()

    def append_candidate(candidate: Path) -> None:
        resolved = candidate.expanduser()
        if resolved in seen:
            return
        seen.add(resolved)
        candidates.append(resolved)

    for entry in os.environ.get("PATH", "").split(pathsep):
        if entry.strip():
            append_candidate(Path(entry) / "docker")
    append_candidate(Path("/Applications/Docker.app/Contents/Resources/bin/docker"))
    return tuple(candidates)


def _docker_env(docker: Path) -> dict[str, str]:
    env = os.environ.copy()
    docker_bin_dir = str(docker.parent)
    env["PATH"] = f"{docker_bin_dir}:{env.get('PATH', '')}"
    return env


def _create_runtime_container(*, docker: Path, image: str, env: dict[str, str]) -> str:
    result = _run(
        [str(docker), "create", image],
        env=env,
        stdout=subprocess.PIPE,
    )
    container_id = result.stdout.strip()
    if not container_id:
        raise RuntimeError(f"Docker did not return a runtime container id for {image}.")
    return container_id


def _create_container(
    *,
    env: dict[str, str],
    command: Sequence[str],
    image: str,
) -> str:
    result = _run(command, env=env, stdout=subprocess.PIPE)
    container_id = result.stdout.strip()
    if not container_id:
        raise RuntimeError(
            f"Docker did not return a benchmark container id for {image}."
        )
    return container_id


def _start_container(
    *,
    docker: Path,
    env: dict[str, str],
    container: str,
    log_path: Path | None = None,
) -> int:
    if log_path is None:
        result = _run(
            [str(docker), "start", "-a", container],
            env=env,
            check=False,
        )
        return result.returncode

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as log_file:
        result = subprocess.run(
            [str(docker), "start", "-a", container],
            env=env,
            text=True,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            check=False,
        )
    return result.returncode


def _remove_container(*, docker: Path, env: dict[str, str], container: str) -> None:
    _run(
        [str(docker), "rm", "--force", container],
        env=env,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _run(
    command: Sequence[str],
    *,
    env: dict[str, str],
    check: bool = True,
    stdout: int | None = None,
    stderr: int | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            env=env,
            text=True,
            stdout=stdout,
            stderr=stderr,
            check=check,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(_command_failure_message(command, exc.returncode)) from exc


def _command_failure_message(command: Sequence[str], returncode: int) -> str:
    executable = Path(command[0]).name if command else "command"
    action = command[1] if len(command) > 1 else ""
    return f"{executable} {action}".strip() + f" failed with exit code {returncode}."


def _agentbench_results_file(
    *, benchmark: AgentBenchName, output_dir: Path
) -> Path | None:
    _ = benchmark
    results_file = output_dir / "results.json"
    return results_file if results_file.exists() else None


def _write_missing_agentbench_results_file(
    *,
    benchmark: AgentBenchName,
    output_dir: Path,
    selected_item_ids: Sequence[str],
    exit_code: int,
    log_path: Path,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    message = _missing_agentbench_results_message(
        benchmark=benchmark,
        output_dir=output_dir,
        selected_item_ids=selected_item_ids,
        exit_code=exit_code,
        log_path=log_path,
    )
    results = [
        _missing_agentbench_result(
            benchmark=benchmark,
            item_id=item_id,
            message=message,
            log_path=log_path,
        )
        for item_id in selected_item_ids
    ]
    results_file = output_dir / "results.json"
    results_file.write_text(
        json.dumps({"results": results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return results_file


def _missing_agentbench_results_message(
    *,
    benchmark: AgentBenchName,
    output_dir: Path,
    selected_item_ids: Sequence[str],
    exit_code: int,
    log_path: Path,
) -> str:
    message = (
        f"{benchmark} did not produce results.json for "
        f"{', '.join(selected_item_ids)} under {output_dir}. "
        f"Benchmark container exited with code {exit_code}."
    )
    if log_path.exists():
        message = f"{message} See benchmark container log: {log_path}."
    return message


def _raw_result_for_item(
    *,
    benchmark: AgentBenchName,
    item_id: str,
    results_file: Path,
) -> dict[str, JsonValue]:
    raw_results = _raw_agentbench_results(
        benchmark=benchmark,
        results_file=results_file,
    )
    for result in raw_results:
        if _raw_task_matches(result=result, item_id=item_id):
            return result
    raise RuntimeError(f"{benchmark} results did not include item {item_id!r}.")


def _raw_agentbench_results(
    *,
    benchmark: AgentBenchName,
    results_file: Path,
) -> tuple[dict[str, JsonValue], ...]:
    payload = json.loads(results_file.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected benchmark results object: {results_file}")
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raise RuntimeError(f"{benchmark} results must contain a results list.")
    return tuple(result for result in raw_results if isinstance(result, dict))


def _result_item_id(
    *,
    benchmark: AgentBenchName,
    raw_result: dict[str, JsonValue],
) -> str:
    _ = benchmark
    task_id = raw_result.get("task_id")
    if not isinstance(task_id, str):
        return ""
    suite = raw_result.get("suite")
    if isinstance(suite, str):
        return f"{suite}:{task_id}"
    return task_id


def _missing_agentbench_result(
    *,
    benchmark: AgentBenchName,
    item_id: str,
    message: str,
    log_path: Path | None = None,
) -> dict[str, JsonValue]:
    _ = benchmark
    suite, task_id = _split_agentbench_item_id(item_id)
    result = {
        "suite": suite,
        "task_id": task_id,
        "passed": False,
        "status": "missing_result",
        "failure_kind": "infra",
        "duration_seconds": 0.0,
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_output_tokens": 0,
        "requests": 0,
        "tool_calls": 0,
        "error_message": message,
    }
    if log_path is not None:
        result["log_path"] = str(log_path)
    return result


def _split_agentbench_item_id(item_id: str) -> tuple[str, str]:
    suite, separator, task_id = item_id.partition(":")
    if separator and suite in {"os", "db"}:
        return suite, task_id
    return "", item_id


def _raw_task_matches(*, result: dict[str, JsonValue], item_id: str) -> bool:
    task_id_value = result.get("task_id")
    if not isinstance(task_id_value, str):
        return False
    if task_id_value == item_id:
        return True
    suite_value = result.get("suite")
    return isinstance(suite_value, str) and f"{suite_value}:{task_id_value}" == item_id


def _agentbench_manifest_path(
    cfg: AgentBenchRunnerConfig, benchmark: AgentBenchName
) -> Path:
    digest = hashlib.sha256(
        json.dumps(
            _agentbench_manifest_key(cfg, benchmark),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:12]
    return Path(".agent_teams/evals/datasets/manifests") / (
        f"{benchmark}-{digest}.json"
    )


def _agentbench_manifest_key(
    cfg: AgentBenchRunnerConfig, benchmark: AgentBenchName
) -> dict[str, object]:
    return {
        "benchmark": benchmark,
        "benchmark_image": cfg.agentbench.benchmark_image,
        "suite": cfg.agentbench.suite,
        "os_suite": cfg.agentbench.os_suite,
        "num_os_tasks": cfg.agentbench.num_os_tasks,
        "num_db_tasks": cfg.agentbench.num_db_tasks,
    }
