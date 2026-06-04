from __future__ import annotations

from pathlib import Path

import pytest

from relay_teams_evals.backends.agentbench_run import AgentBenchRunBackend
from relay_teams_evals.agentbench_runs.docker_runner import AgentBenchTaskDockerResult
from relay_teams_evals.run_config import AgentBenchConfig, RunConfig
from relay_teams_evals.workspace.base import PreparedWorkspace


def _agentbench_result_for(item_id: str) -> AgentBenchTaskDockerResult:
    suite, _, task_id = item_id.partition(":")
    return AgentBenchTaskDockerResult(
        benchmark="agentbench",
        item_id=item_id,
        output_dir=Path(".agent_teams/evals/results"),
        results_file=Path(".agent_teams/evals/results/results.json"),
        exit_code=0,
        raw_result={
            "suite": suite,
            "task_id": task_id,
            "passed": True,
        },
    )


def test_agentbench_run_backend_suite_mode_reuses_suite_invocation(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[tuple[str, tuple[str, ...]]] = []

    class FakeAgentBenchDockerRunner:
        def __init__(self, _cfg: RunConfig) -> None:
            self._cfg = _cfg

        def run_items(
            self,
            *,
            benchmark: str,
            item_ids: tuple[str, ...],
            output_dir: Path,
            limit: int | None = None,
            concurrency: int = 1,
            restart: bool = True,
            rerun: bool = False,
        ) -> tuple[AgentBenchTaskDockerResult, ...]:
            calls.append(("run_items", tuple(item_ids)))
            return tuple(_agentbench_result_for(item_id) for item_id in item_ids)

        def run_item(
            self,
            *,
            benchmark: str,
            item_id: str,
            output_dir: Path,
        ) -> AgentBenchTaskDockerResult:
            raise AssertionError("run_item should not be used in suite mode")

    monkeypatch.setattr(
        "relay_teams_evals.backends.agentbench_run.AgentBenchDockerRunner",
        FakeAgentBenchDockerRunner,
    )

    cfg = RunConfig(
        dataset="agentbench",
        workspace_mode="docker",
        output_dir=tmp_path,
    )
    backend = AgentBenchRunBackend(
        cfg,
        scheduled_item_ids=("db:std-0", "db:std-1"),
    )
    workspace_0 = PreparedWorkspace(
        item_id="db:std-0",
        repo_path=tmp_path / "repo-0",
        base_commit="abc123",
        container_repo_path="/workspace",
    )
    workspace_1 = PreparedWorkspace(
        item_id="db:std-1",
        repo_path=tmp_path / "repo-1",
        base_commit="abc123",
        container_repo_path="/workspace",
    )

    first_events = list(backend.run("intent", workspace_0))
    second_events = list(backend.run("intent", workspace_1))

    assert len(calls) == 1
    assert calls[0][0] == "run_items"
    assert calls[0][1] == ("db:std-0", "db:std-1")
    assert [event.type for event in first_events] == [
        "metadata",
        "text_delta",
        "token_usage",
        "completed",
    ]
    assert [event.type for event in second_events] == [
        "metadata",
        "text_delta",
        "token_usage",
        "completed",
    ]


def test_agentbench_run_backend_suite_mode_retries_after_run_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    calls = 0

    class FakeAgentBenchDockerRunner:
        def __init__(self, _cfg: RunConfig) -> None:
            self._cfg = _cfg

        def run_items(
            self,
            *,
            benchmark: str,
            item_ids: tuple[str, ...],
            output_dir: Path,
            limit: int | None = None,
            concurrency: int = 1,
            restart: bool = True,
            rerun: bool = False,
        ) -> tuple[AgentBenchTaskDockerResult, ...]:
            nonlocal calls
            _ = (benchmark, output_dir, limit, concurrency, restart, rerun)
            calls += 1
            if calls == 1:
                raise RuntimeError("docker unavailable")
            return tuple(_agentbench_result_for(item_id) for item_id in item_ids)

        def run_item(
            self,
            *,
            benchmark: str,
            item_id: str,
            output_dir: Path,
        ) -> AgentBenchTaskDockerResult:
            raise AssertionError("run_item should not be used in suite mode")

    monkeypatch.setattr(
        "relay_teams_evals.backends.agentbench_run.AgentBenchDockerRunner",
        FakeAgentBenchDockerRunner,
    )
    cfg = RunConfig(
        dataset="agentbench",
        workspace_mode="docker",
        output_dir=tmp_path,
    )
    backend = AgentBenchRunBackend(cfg, scheduled_item_ids=("db:std-0",))
    workspace = PreparedWorkspace(
        item_id="db:std-0",
        repo_path=tmp_path / "repo",
        base_commit="abc123",
        container_repo_path="/workspace",
    )

    with pytest.raises(RuntimeError, match="docker unavailable"):
        list(backend.run("intent", workspace))
    events = list(backend.run("intent", workspace))

    assert calls == 2
    assert [event.type for event in events] == [
        "metadata",
        "text_delta",
        "token_usage",
        "completed",
    ]


def test_agentbench_run_backend_item_mode_invokes_runner_once_per_item(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[tuple[str, tuple[str, ...]]] = []

    class FakeAgentBenchDockerRunner:
        def __init__(self, _cfg: RunConfig) -> None:
            self._cfg = _cfg

        def run_item(
            self,
            *,
            benchmark: str,
            item_id: str,
            output_dir: Path,
        ) -> AgentBenchTaskDockerResult:
            calls.append(("run_item", (item_id,)))
            return _agentbench_result_for(item_id)

        def run_items(
            self,
            *,
            benchmark: str,
            item_ids: tuple[str, ...],
            output_dir: Path,
            limit: int | None = None,
            concurrency: int = 1,
            restart: bool = True,
            rerun: bool = False,
        ) -> tuple[AgentBenchTaskDockerResult, ...]:
            raise AssertionError("run_items should not be used in item mode")

    monkeypatch.setattr(
        "relay_teams_evals.backends.agentbench_run.AgentBenchDockerRunner",
        FakeAgentBenchDockerRunner,
    )

    cfg = RunConfig(
        dataset="agentbench",
        workspace_mode="docker",
        output_dir=tmp_path,
        agentbench=AgentBenchConfig(execution_mode="item"),
    )
    backend = AgentBenchRunBackend(
        cfg,
        scheduled_item_ids=("db:std-0", "db:std-1"),
    )
    workspace_0 = PreparedWorkspace(
        item_id="db:std-0",
        repo_path=tmp_path / "repo-0",
        base_commit="abc123",
        container_repo_path="/workspace",
    )
    workspace_1 = PreparedWorkspace(
        item_id="db:std-1",
        repo_path=tmp_path / "repo-1",
        base_commit="abc123",
        container_repo_path="/workspace",
    )

    list(backend.run("intent", workspace_0))
    list(backend.run("intent", workspace_1))

    assert len(calls) == 2
    assert calls == [("run_item", ("db:std-0",)), ("run_item", ("db:std-1",))]
