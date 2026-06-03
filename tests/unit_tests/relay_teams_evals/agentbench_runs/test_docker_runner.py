from __future__ import annotations

import json
import io
import subprocess
from pathlib import Path

import pytest

from relay_teams_evals.agentbench_runs.docker_runner import (
    AgentBenchDockerRunner,
    _agentbench_model_profile,
    _agentbench_results_file,
    _agentbench_manifest_path,
    _configured_agentbench_api_key_env_vars,
    _container_env_var_assignment,
    _create_container,
    _create_runtime_container,
    _docker_env,
    _docker_path_candidates,
    _find_docker,
    _model_config_has_api_key,
    _raw_agentbench_results,
    _raw_result_for_item,
    _raw_task_matches,
    _remove_container,
    _result_item_id,
    _run,
    _split_agentbench_item_id,
    _start_container,
    _validate_agentbench_model_source,
    _write_missing_agentbench_results_file,
)
from relay_teams_evals.run_config import RunConfig


def test_result_item_id_prefers_suite_prefix_for_agentbench() -> None:
    assert (
        _result_item_id(
            benchmark="agentbench",
            raw_result={"task_id": "std-0", "suite": "db"},
        )
        == "db:std-0"
    )


def test_raw_result_for_item_accepts_agentbench_suite_prefixed_ids(
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
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    raw_result = _raw_result_for_item(
        benchmark="agentbench",
        item_id="db:std-0",
        results_file=results_file,
    )

    assert raw_result["task_id"] == "std-0"


def test_discover_items_uses_cached_manifest(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    manifest_path = _agentbench_manifest_path(cfg, "agentbench")
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "suite": "db",
                        "task_id": "std-0",
                        "description": "answer the query",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    def fail_if_docker_is_used() -> Path:
        raise AssertionError("cached manifest should not start Docker discovery")

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        fail_if_docker_is_used,
    )

    manifest = AgentBenchDockerRunner(cfg).discover_items(benchmark="agentbench")

    assert manifest.manifest_path == manifest_path
    assert [item.item_id for item in manifest.items] == ["db:std-0"]


def test_discover_items_refreshes_invalid_cached_manifest(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    manifest_path = _agentbench_manifest_path(cfg, "agentbench")
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text("{", encoding="utf-8")
    captured_commands: list[list[str]] = []

    def fake_create_container(
        *,
        env: dict[str, str],
        command: list[str],
        image: str,
    ) -> str:
        _ = env, image
        captured_commands.append(command)
        return "manifest-container"

    def fake_start_container(
        *,
        docker: Path,
        env: dict[str, str],
        container: str,
        log_path: Path | None = None,
    ) -> int:
        _ = docker, env, container, log_path
        manifest_path.write_text(
            json.dumps(
                {
                    "results": [
                        {
                            "suite": "os",
                            "task_id": "std-1",
                            "description": "inspect the filesystem",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        return 0

    removed: list[str] = []

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        fake_create_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        fake_start_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: removed.append(container),
    )

    manifest = AgentBenchDockerRunner(cfg).discover_items(benchmark="agentbench")

    assert [item.item_id for item in manifest.items] == ["os:std-1"]
    assert removed == ["manifest-container"]
    assert captured_commands
    command = captured_commands[0]
    assert "--list-tasks-output" in command
    assert str(manifest_path.name) in " ".join(command)


def test_discover_items_rejects_non_docker_workspace() -> None:
    runner = AgentBenchDockerRunner(
        RunConfig(dataset="agentbench", workspace_mode="git")
    )

    with pytest.raises(RuntimeError, match="workspace_mode: docker"):
        runner.discover_items(benchmark="agentbench")


def test_discover_items_raises_when_manifest_container_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        lambda *, env, command, image: "manifest-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        lambda *, docker, env, container, log_path=None: 2,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: None,
    )

    with pytest.raises(RuntimeError, match="task discovery failed with exit code 2"):
        AgentBenchDockerRunner(cfg).discover_items(benchmark="agentbench")


def test_env_args_rewrite_loopback_proxy_for_agentbench_container(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HTTP_PROXY", "http://localhost:7890")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("NO_PROXY", "example.com,127.0.0.1")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")

    env_args = AgentBenchDockerRunner(cfg)._env_args("agentbench")

    assert "HTTP_PROXY=http://host.docker.internal:7890" in env_args
    assert "HTTPS_PROXY=http://host.docker.internal:7890" in env_args
    no_proxy_arg = next(arg for arg in env_args if arg.startswith("NO_PROXY="))
    assert "example.com" in no_proxy_arg
    assert "127.0.0.1" in no_proxy_arg
    assert "localhost" in no_proxy_arg
    assert "::1" in no_proxy_arg
    assert "host.docker.internal" in no_proxy_arg
    assert "RELAY_TEAMS_BENCH_MODEL_PROFILE=deepseek" in env_args
    assert "RELAY_TEAMS_BENCH_ROLE_ID=MainAgent" in env_args


def test_run_items_invokes_docker_and_fills_missing_suite_results(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    runner = AgentBenchDockerRunner(cfg)
    created_commands: list[list[str]] = []
    removed: list[str] = []

    def fake_create_container(
        *,
        env: dict[str, str],
        command: list[str],
        image: str,
    ) -> str:
        _ = env, image
        created_commands.append(command)
        return "benchmark-container"

    def fake_start_container(
        *,
        docker: Path,
        env: dict[str, str],
        container: str,
        log_path: Path | None = None,
    ) -> int:
        _ = docker, env, container
        assert log_path is not None
        output_dir = log_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        log_path.write_text("finished\n", encoding="utf-8")
        (output_dir / "results.json").write_text(
            json.dumps(
                {
                    "results": [
                        {
                            "suite": "os",
                            "task_id": "std-0",
                            "passed": True,
                            "status": "completed",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        return 0

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_runtime_container",
        lambda *, docker, image, env: "runtime-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        fake_create_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        fake_start_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: removed.append(container),
    )

    results = runner.run_items(
        benchmark="agentbench",
        item_ids=("os:std-0", "db:std-1", "os:std-0"),
        output_dir=tmp_path / "raw",
        limit=5,
        concurrency=0,
        restart=False,
        rerun=True,
    )

    assert [result.item_id for result in results] == ["os:std-0", "db:std-1"]
    assert results[0].raw_result["status"] == "completed"
    assert results[1].raw_result["status"] == "missing_result"
    assert results[1].raw_result["failure_kind"] == "infra"
    assert removed == ["benchmark-container", "runtime-container"]
    command = created_commands[0]
    assert "--task-id" in command
    concurrency_index = command.index("--concurrency")
    assert command[concurrency_index + 1] == "1"
    assert "--rerun-infra-failures" in command
    assert "--restart" not in command


def test_run_items_writes_infra_results_when_results_file_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    runner = AgentBenchDockerRunner(cfg)

    def fake_start_container(
        *,
        docker: Path,
        env: dict[str, str],
        container: str,
        log_path: Path | None = None,
    ) -> int:
        _ = docker, env, container
        assert log_path is not None
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("container failed\n", encoding="utf-8")
        return 3

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_runtime_container",
        lambda *, docker, image, env: "runtime-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        lambda *, env, command, image: "benchmark-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        fake_start_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: None,
    )

    results = runner.run_items(
        benchmark="agentbench",
        item_ids=("os:std-0", "db:std-1"),
        output_dir=tmp_path / "raw",
    )

    assert [result.raw_result["status"] for result in results] == [
        "missing_result",
        "missing_result",
    ]
    assert results[0].exit_code == 3


def test_run_item_raises_when_results_file_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    runner = AgentBenchDockerRunner(cfg)

    def fake_start_container(
        *,
        docker: Path,
        env: dict[str, str],
        container: str,
        log_path: Path | None = None,
    ) -> int:
        _ = docker, env, container
        assert log_path is not None
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("container failed\n", encoding="utf-8")
        return 3

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_runtime_container",
        lambda *, docker, image, env: "runtime-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        lambda *, env, command, image: "benchmark-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        fake_start_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: None,
    )

    output_dir = tmp_path / "raw"
    with pytest.raises(RuntimeError, match="did not produce results.json"):
        runner.run_item(
            benchmark="agentbench",
            item_id="os:std-0",
            output_dir=output_dir,
        )

    assert (output_dir / "results.json").exists() is False


def test_run_item_raises_when_single_item_result_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    runner = AgentBenchDockerRunner(cfg)

    def fake_start_container(
        *,
        docker: Path,
        env: dict[str, str],
        container: str,
        log_path: Path | None = None,
    ) -> int:
        _ = docker, env, container
        assert log_path is not None
        output_dir = log_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "results.json").write_text(
            json.dumps({"results": []}), encoding="utf-8"
        )
        return 0

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._find_docker",
        lambda: Path("/usr/bin/docker"),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_env",
        lambda docker: {"PATH": str(docker.parent)},
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_runtime_container",
        lambda *, docker, image, env: "runtime-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._create_container",
        lambda *, env, command, image: "benchmark-container",
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._start_container",
        fake_start_container,
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._remove_container",
        lambda *, docker, env, container: None,
    )

    with pytest.raises(RuntimeError, match="did not return results"):
        runner.run_item(
            benchmark="agentbench",
            item_id="os:std-0",
            output_dir=tmp_path / "raw",
        )


def test_run_items_rejects_non_docker_workspace_and_empty_items(tmp_path: Path) -> None:
    non_docker_runner = AgentBenchDockerRunner(
        RunConfig(dataset="agentbench", workspace_mode="git")
    )
    with pytest.raises(RuntimeError, match="workspace_mode: docker"):
        non_docker_runner.run_items(
            benchmark="agentbench",
            item_ids=("os:std-0",),
            output_dir=tmp_path / "raw",
        )

    docker_runner = AgentBenchDockerRunner(
        RunConfig(dataset="agentbench", workspace_mode="docker")
    )
    with pytest.raises(RuntimeError, match="requires at least one task-id"):
        docker_runner.run_items(
            benchmark="agentbench",
            item_ids=(),
            output_dir=tmp_path / "raw",
        )


def test_agentbench_missing_results_file_records_infra_log(
    tmp_path: Path,
) -> None:
    log_path = tmp_path / "benchmark-container.log"
    log_path.write_text(
        "agentbench run failed before writing results\n", encoding="utf-8"
    )

    results_file = _write_missing_agentbench_results_file(
        benchmark="agentbench",
        output_dir=tmp_path / "raw",
        selected_item_ids=("os:std-0", "db:std-1"),
        exit_code=2,
        log_path=log_path,
    )

    payload = json.loads(results_file.read_text(encoding="utf-8"))
    results = payload["results"]

    assert results[0]["suite"] == "os"
    assert results[0]["task_id"] == "std-0"
    assert results[0]["status"] == "missing_result"
    assert results[0]["failure_kind"] == "infra"
    assert "exited with code 2" in results[0]["error_message"]
    assert results[0]["log_path"] == str(log_path)
    assert results[1]["suite"] == "db"
    assert results[1]["task_id"] == "std-1"


def test_env_args_forward_configured_agentbench_api_key() -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agentbench": cfg.agentbench.model_copy(
                update={"api_key_env_var": "ANTHROPIC_API_KEY"}
            )
        }
    )

    env_args = AgentBenchDockerRunner(cfg)._env_args("agentbench")

    assert "ANTHROPIC_API_KEY" in env_args
    assert "RELAY_TEAMS_BENCH_API_KEY" in env_args
    assert "RELAY_TEAMS_BENCH_API_KEY_ENV_VAR=ANTHROPIC_API_KEY" in env_args


def test_agentbench_command_includes_optional_settings(tmp_path: Path) -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "infra_retry_attempts": 4,
            "infra_retry_backoff_seconds": 1.5,
            "agentbench": cfg.agentbench.model_copy(
                update={
                    "suite": "both",
                    "os_suite": "test-os",
                    "num_os_tasks": None,
                    "num_db_tasks": None,
                    "max_steps": 7,
                    "task_timeout_seconds": 8.5,
                    "os_prompt_template": "OS: {instruction}",
                    "db_prompt_template": "DB: {instruction}",
                    "rerun_infra_failures": True,
                    "rerun_db_mutation_failures": True,
                }
            ),
        }
    )
    runner = AgentBenchDockerRunner(cfg)

    command = runner._agentbench_command(
        container_output_dir=tmp_path / "out",
        selected_item_ids=("os:std-0", "db:std-1"),
        limit=2,
        concurrency=3,
        restart=True,
        rerun=False,
    )

    assert ["--infra-retry-attempts", "4"] == command[
        command.index("--infra-retry-attempts") : command.index(
            "--infra-retry-attempts"
        )
        + 2
    ]
    assert "--max-steps" in command
    assert "--task-timeout-seconds" in command
    assert "--os-prompt-template" in command
    assert "--db-prompt-template" in command
    concurrency_index = command.index("--concurrency")
    assert command[concurrency_index + 1] == "3"
    assert "--restart" in command
    assert "--rerun-infra-failures" in command
    assert "--rerun-db-mutation-failures" in command
    assert command.count("--task-id") == 2
    assert ["--num-os-tasks", "2"] in [
        command[index : index + 2] for index in range(len(command) - 1)
    ]


def test_agentbench_manifest_command_includes_task_limits() -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agentbench": cfg.agentbench.model_copy(
                update={"num_os_tasks": 3, "num_db_tasks": 4}
            )
        }
    )

    command = AgentBenchDockerRunner(cfg)._agentbench_manifest_command(
        Path("/manifest.json")
    )

    assert "--num-os-tasks" in command
    assert "--num-db-tasks" in command


def test_mount_args_use_config_and_output_paths(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agent_teams": cfg.agent_teams.model_copy(update={"config_dir": config_dir})
        }
    )
    runner = AgentBenchDockerRunner(cfg)

    assert runner._config_mount_args() == [
        "-v",
        f"{config_dir.resolve()}:/agent-config-host:ro",
    ]
    assert runner._output_mount_args(host_output_dir=tmp_path / "raw") == [
        "-v",
        f"{tmp_path}:/benchmarks/results",
    ]


def test_container_env_var_assignment_handles_proxy_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HTTP_PROXY", "user:pass@localhost:8080/path")
    monkeypatch.setenv("NO_PROXY", "Example.com; localhost,,example.com")
    monkeypatch.setenv("HTTPS_PROXY", "http://[::1")

    assert _container_env_var_assignment("HTTP_PROXY") == (
        "HTTP_PROXY=http://user:pass@host.docker.internal:8080/path"
    )
    no_proxy = _container_env_var_assignment("NO_PROXY")
    assert no_proxy.startswith("NO_PROXY=")
    assert "Example.com" in no_proxy
    assert "host.docker.internal" in no_proxy
    assert _container_env_var_assignment("HTTPS_PROXY") == "HTTPS_PROXY=http://[::1"
    assert _container_env_var_assignment("UNSET_NAME") == "UNSET_NAME"


def test_task_limits_for_suites() -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    os_cfg = cfg.model_copy(
        update={"agentbench": cfg.agentbench.model_copy(update={"suite": "os"})}
    )
    db_cfg = cfg.model_copy(
        update={"agentbench": cfg.agentbench.model_copy(update={"suite": "db"})}
    )

    os_command = AgentBenchDockerRunner(os_cfg)._agentbench_command(
        container_output_dir=Path("/out"),
        selected_item_ids=("os:std-0",),
        limit=2,
        concurrency=2,
        restart=False,
        rerun=False,
    )
    db_command = AgentBenchDockerRunner(db_cfg)._agentbench_command(
        container_output_dir=Path("/out"),
        selected_item_ids=("db:std-0",),
        limit=2,
        concurrency=2,
        restart=False,
        rerun=False,
    )

    assert ["--num-os-tasks", "2"] in [
        os_command[index : index + 2] for index in range(len(os_command) - 1)
    ]
    assert ["--num-db-tasks", "0"] in [
        os_command[index : index + 2] for index in range(len(os_command) - 1)
    ]
    assert ["--num-os-tasks", "0"] in [
        db_command[index : index + 2] for index in range(len(db_command) - 1)
    ]
    assert ["--num-db-tasks", "2"] in [
        db_command[index : index + 2] for index in range(len(db_command) - 1)
    ]


def test_validate_agentbench_model_source_accepts_configured_api_key_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agentbench": cfg.agentbench.model_copy(
                update={"api_key_env_var": "ANTHROPIC_API_KEY"}
            )
        }
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("RELAY_TEAMS_BENCH_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    _validate_agentbench_model_source(cfg, benchmark="agentbench")


def test_validate_agentbench_model_source_accepts_extra_env_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "docker": cfg.docker.model_copy(
                update={"extra_env": {"RELAY_TEAMS_BENCH_API_KEY": "test-key"}}
            )
        }
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("RELAY_TEAMS_BENCH_API_KEY", raising=False)

    _validate_agentbench_model_source(cfg, benchmark="agentbench")


def test_validate_agentbench_model_source_accepts_model_config(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "model.json").write_text(
        json.dumps(
            {
                "deepseek": {"api_key": "from-file"},
                "ignored": "not-a-profile",
            }
        ),
        encoding="utf-8",
    )
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agent_teams": cfg.agent_teams.model_copy(update={"config_dir": config_dir})
        }
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("RELAY_TEAMS_BENCH_API_KEY", raising=False)

    _validate_agentbench_model_source(cfg, benchmark="agentbench")
    assert _model_config_has_api_key(config_dir / "model.json", profile_name="deepseek")


def test_validate_agentbench_model_source_checks_requested_model_profile(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "model.json").write_text(
        json.dumps(
            {
                "anthropic": {"api_key": "unrelated-key"},
                "custom": {"api_key": "custom-key"},
            }
        ),
        encoding="utf-8",
    )
    base_cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = base_cfg.model_copy(
        update={
            "agent_teams": base_cfg.agent_teams.model_copy(
                update={"config_dir": config_dir}
            ),
            "docker": base_cfg.docker.model_copy(
                update={"extra_env": {"RELAY_TEAMS_BENCH_MODEL_PROFILE": "custom"}}
            ),
        }
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("RELAY_TEAMS_BENCH_API_KEY", raising=False)

    _validate_agentbench_model_source(cfg, benchmark="agentbench")

    rejected_cfg = base_cfg.model_copy(
        update={
            "agent_teams": base_cfg.agent_teams.model_copy(
                update={"config_dir": config_dir}
            )
        }
    )
    with pytest.raises(RuntimeError, match="model.json profile named 'deepseek'"):
        _validate_agentbench_model_source(rejected_cfg, benchmark="agentbench")
    assert _agentbench_model_profile(cfg) == "custom"


def test_validate_agentbench_model_source_rejects_missing_api_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "model.json").write_text("[]", encoding="utf-8")
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agent_teams": cfg.agent_teams.model_copy(update={"config_dir": config_dir})
        }
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("RELAY_TEAMS_BENCH_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="need an API key"):
        _validate_agentbench_model_source(cfg, benchmark="agentbench")


def test_configured_api_key_env_vars_are_deduplicated() -> None:
    cfg = RunConfig(dataset="agentbench", workspace_mode="docker")
    cfg = cfg.model_copy(
        update={
            "agentbench": cfg.agentbench.model_copy(
                update={"api_key_env_var": "RELAY_TEAMS_BENCH_API_KEY"}
            )
        }
    )

    assert _configured_agentbench_api_key_env_vars(cfg, benchmark="agentbench") == (
        "RELAY_TEAMS_BENCH_API_KEY",
    )


def test_docker_path_candidates_dedupe_path_entries(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    docker_dir = tmp_path / "bin"
    monkeypatch.setenv("PATH", f"{docker_dir}:{docker_dir}:")

    candidates = _docker_path_candidates()

    assert candidates[0] == docker_dir / "docker"
    assert candidates.count(docker_dir / "docker") == 1


def test_find_docker_checks_candidates(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    docker = tmp_path / "docker"
    docker.write_text("#!/bin/sh\n", encoding="utf-8")
    commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        env: dict[str, str],
        text: bool,
        stdout: int,
        stderr: int,
        check: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = env, text, stdout, stderr, check
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="24.0\n", stderr="")

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_path_candidates",
        lambda: (docker,),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner.subprocess.run",
        fake_run,
    )

    assert _find_docker() == docker
    assert commands == [[str(docker), "info", "--format", "{{.ServerVersion}}"]]
    assert str(docker.parent) in _docker_env(docker)["PATH"]


def test_find_docker_raises_when_candidates_fail(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    docker = tmp_path / "docker"
    docker.write_text("#!/bin/sh\n", encoding="utf-8")

    def fake_run(
        command: list[str],
        *,
        env: dict[str, str],
        text: bool,
        stdout: int,
        stderr: int,
        check: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = env, text, stdout, stderr, check
        return subprocess.CompletedProcess(command, 1, stdout="", stderr="down")

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._docker_path_candidates",
        lambda: (docker,),
    )
    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner.subprocess.run",
        fake_run,
    )

    with pytest.raises(RuntimeError, match="Docker CLI is not available"):
        _find_docker()


def test_container_helpers_raise_for_empty_ids_and_wrap_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        env: dict[str, str],
        text: bool,
        stdout: int | None,
        stderr: int | None,
        check: bool,
    ) -> subprocess.CompletedProcess[str]:
        _ = env, text, stdout, stderr
        calls.append(command)
        if check:
            raise subprocess.CalledProcessError(7, command)
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner.subprocess.run",
        fake_run,
    )

    with pytest.raises(RuntimeError, match="docker create failed with exit code 7"):
        _run(["docker", "create"], env={})

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner._run",
        lambda command, *, env, stdout=None, stderr=None, check=True: (
            subprocess.CompletedProcess(list(command), 0, stdout="", stderr="")
        ),
    )
    with pytest.raises(RuntimeError, match="runtime container id"):
        _create_runtime_container(docker=Path("docker"), image="runtime", env={})
    with pytest.raises(RuntimeError, match="benchmark container id"):
        _create_container(env={}, command=["docker", "create"], image="benchmark")


def test_start_and_remove_container_helpers(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    completed: list[list[str]] = []

    def fake_subprocess_run(
        command: list[str],
        *,
        env: dict[str, str],
        text: bool,
        stdout: int | io.TextIOBase | None = None,
        stderr: int | io.TextIOBase | None = None,
        check: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        _ = env, text, stdout, stderr, check
        completed.append(command)
        if isinstance(stdout, io.TextIOBase) and command[1] == "start":
            stdout.write("container output\n")
        return subprocess.CompletedProcess(command, 5 if command[1] == "start" else 0)

    monkeypatch.setattr(
        "relay_teams_evals.agentbench_runs.docker_runner.subprocess.run",
        fake_subprocess_run,
    )

    log_path = tmp_path / "logs" / "container.log"
    exit_code = _start_container(
        docker=Path("docker"),
        env={},
        container="benchmark-container",
        log_path=log_path,
    )
    _remove_container(docker=Path("docker"), env={}, container="benchmark-container")

    assert exit_code == 5
    assert log_path.read_text(encoding="utf-8") == "container output\n"
    assert completed[0][:3] == ["docker", "start", "-a"]


def test_raw_results_validation_and_matching(tmp_path: Path) -> None:
    missing_results = tmp_path / "missing-results.json"
    missing_results.write_text(json.dumps({"items": []}), encoding="utf-8")
    with pytest.raises(RuntimeError, match="results list"):
        _raw_agentbench_results(benchmark="agentbench", results_file=missing_results)

    non_object = tmp_path / "non-object.json"
    non_object.write_text("[]", encoding="utf-8")
    with pytest.raises(RuntimeError, match="Expected benchmark results object"):
        _raw_agentbench_results(benchmark="agentbench", results_file=non_object)

    results_file = tmp_path / "results.json"
    results_file.write_text(
        json.dumps({"results": [{"task_id": "plain"}, "ignored"]}),
        encoding="utf-8",
    )
    assert _raw_agentbench_results(
        benchmark="agentbench", results_file=results_file
    ) == ({"task_id": "plain"},)
    assert _raw_task_matches(result={"task_id": "plain"}, item_id="plain")
    assert not _raw_task_matches(result={"task_id": 1}, item_id="plain")
    with pytest.raises(RuntimeError, match="did not include item"):
        _raw_result_for_item(
            benchmark="agentbench", item_id="missing", results_file=results_file
        )


def test_misc_path_and_item_helpers(tmp_path: Path) -> None:
    assert _split_agentbench_item_id("os:std-0") == ("os", "std-0")
    assert _split_agentbench_item_id("custom:std-0") == ("", "custom:std-0")
    assert _agentbench_results_file(benchmark="agentbench", output_dir=tmp_path) is None
    results_file = tmp_path / "results.json"
    results_file.write_text(json.dumps({"results": []}), encoding="utf-8")
    assert (
        _agentbench_results_file(benchmark="agentbench", output_dir=tmp_path)
        == results_file
    )
