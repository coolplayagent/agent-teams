from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

import httpx
import pytest

from benchmarks.common.relay_client import RelayRunResult, RelayTeamsHttpClient
from benchmarks.agentbench.run_agentbench import (
    AgentBenchSuite,
    CommandResult,
    DbTask,
    DockerClient,
    FailureKind,
    InfrastructureFailure,
    OsEvaluation,
    OsTask,
    ShellScript,
    TaskResult,
    _build_db_prompt,
    _build_os_prompt,
    _calculate_db_tables_hash,
    _calculate_db_tables_hash_with_deadline,
    _compare_db_answers,
    _is_db_mutation_query,
    _load_existing_run_result,
    _load_db_table,
    _noninteractive_shell_code,
    _remaining_timeout_seconds,
    _run_db_task_once,
    _run_os_task_once,
    _run_with_infra_retries,
    _task_deadline,
    load_db_tasks,
    load_selected_os_tasks,
    write_run_result,
)
from relay_teams_evals.agentbench_runs.reporting import (
    ReportFormat,
    _artifact_dir_name,
    build_agentbench_report as build_report,
    eval_result_from_agentbench_task,
    write_agentbench_report as write_report,
    write_agentbench_outputs,
)
from relay_teams_evals.models import RunOutcome


def test_agentbench_evaluation_report(tmp_path: Path) -> None:
    results_file = tmp_path / "results.json"
    results_file.write_text(
        """
{
  "results": [
    {
      "suite": "db",
      "task_id": "std-0",
      "passed": true,
      "status": "completed",
      "duration_seconds": 1.5
    },
    {
      "suite": "os",
      "task_id": "dev-1",
      "passed": false,
      "status": "infra_error",
      "failure_kind": "infra",
      "duration_seconds": 2.0
    }
  ]
}
""",
        encoding="utf-8",
    )

    report = build_report(benchmark="agentbench", results_file=results_file)

    assert report.total_count == 2
    assert report.passed_count == 1
    assert report.pass_rate == 0.5
    assert report.failed_task_ids == ("os:dev-1",)
    assert report.infra_failed_task_ids == ("os:dev-1",)
    assert report.results[0].suite == "db"


def test_write_evaluation_report(tmp_path: Path) -> None:
    results_file = tmp_path / "results.json"
    output_file = tmp_path / "evaluation.json"
    results_file.write_text('{"results": []}', encoding="utf-8")
    report = build_report(benchmark="agentbench", results_file=results_file)

    write_report(report=report, output_file=output_file)

    assert output_file.exists()
    assert '"benchmark": "agentbench"' in output_file.read_text(encoding="utf-8")


def test_agentbench_task_timeout_maps_to_timeout_outcome() -> None:
    result = eval_result_from_agentbench_task(
        benchmark="agentbench",
        raw_task={
            "suite": "os",
            "task_id": "std-0",
            "passed": False,
            "status": "task_timeout",
            "failure_kind": "agent",
            "duration_seconds": 1.0,
        },
    )

    assert result.outcome == RunOutcome.TIMEOUT


def test_write_agentbench_outputs_creates_eval_report_checkpoint_and_artifacts(
    tmp_path: Path,
) -> None:
    results_file = tmp_path / "results.json"
    results_file.write_text(
        """
{
  "results": [
    {
      "suite": "db",
      "task_id": "std-0",
      "passed": true,
      "status": "completed",
      "duration_seconds": 1.5,
      "input_tokens": 100,
      "output_tokens": 20
    }
  ]
}
""",
        encoding="utf-8",
    )

    report = write_agentbench_outputs(
        benchmark="agentbench",
        results_file=results_file,
        report_format=ReportFormat.JSON,
    )

    assert report.passed_count == 1
    assert (tmp_path / "evaluation.json").exists()
    assert (tmp_path / "report.json").exists()
    assert (tmp_path / "checkpoint.meta.json").exists()
    assert (tmp_path / "checkpoint.results.jsonl").exists()
    assert (
        tmp_path / "artifacts" / _artifact_dir_name("db:std-0") / "metadata.json"
    ).exists()


def test_agentbench_std_os_loader_uses_official_specs(tmp_path: Path) -> None:
    agentbench_root = tmp_path
    data_dir = agentbench_root / "data/os_interaction/data/1"
    script_dir = agentbench_root / "data/os_interaction/scripts/1"
    data_dir.mkdir(parents=True)
    script_dir.mkdir(parents=True)
    (data_dir / "sample.json").write_text(
        """
[
  {
    "description": "Say alpha",
    "evaluation": {"match": "alpha"}
  },
  {
    "description": "Say beta",
    "evaluation": {"match": "beta"}
  }
]
""",
        encoding="utf-8",
    )

    tasks = load_selected_os_tasks(
        agentbench_root=agentbench_root,
        suite="std",
        data_file=None,
        script_dir=None,
        limit=None,
    )

    assert len(tasks) == 2
    assert tasks[0].task_id == "std-001-sample-0"
    assert tasks[1].task_id == "std-001-sample-1"


def test_agentbench_os_loader_preserves_example_check_placeholder(
    tmp_path: Path,
) -> None:
    agentbench_root = tmp_path
    data_dir = agentbench_root / "data/os_interaction/data/1"
    script_dir = agentbench_root / "data/os_interaction/scripts/1"
    check_dir = script_dir / "check"
    data_dir.mkdir(parents=True)
    check_dir.mkdir(parents=True)
    (check_dir / "integer-match.py").write_text(
        "from sys import argv\nif int(argv[1]) == int(argv[2]): exit(0)\nexit(1)\n",
        encoding="utf-8",
    )
    (data_dir / "stock.json").write_text(
        """
[
  {
    "description": "Count it",
    "evaluation": {
      "check": [null, {"language": "python", "file": "check/integer-match.py"}],
      "example": {"code": "echo 7"}
    }
  }
]
""",
        encoding="utf-8",
    )

    tasks = load_selected_os_tasks(
        agentbench_root=agentbench_root,
        suite="std",
        data_file=None,
        script_dir=None,
        limit=None,
    )

    assert tasks[0].evaluation.check_scripts[0] is None
    assert tasks[0].evaluation.check_scripts[1] is not None
    assert tasks[0].evaluation.example_script is not None


def test_agentbench_step_limit_zero_has_no_implicit_deadline() -> None:
    assert (
        _task_deadline(
            started=100.0,
            task_timeout_seconds=0.0,
        )
        is None
    )


def test_agentbench_remaining_timeout_is_clamped_to_positive_value() -> None:
    assert _remaining_timeout_seconds(None) is None
    assert _remaining_timeout_seconds(0.0) == 0.001


def test_agentbench_db_relay_call_uses_remaining_task_deadline() -> None:
    class FakeRelayClient:
        def __init__(self) -> None:
            self.timeout_seconds_seen: list[float | None] = []

        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id)
            self.timeout_seconds_seen.append(timeout_seconds)
            return RelayRunResult(
                text='{"name":"execute_sql","arguments":{"query":"SELECT value FROM T"}}',
                run_id="run-1",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    relay_client = FakeRelayClient()
    task = DbTask(
        task_id="std-0",
        description="select value",
        label=("A",),
        table={
            "table_name": "T",
            "table_info": {
                "columns": [{"name": "value"}],
                "rows": [["A"]],
            },
        },
    )

    result = _run_db_task_once(
        task=task,
        relay_client=cast(RelayTeamsHttpClient, relay_client),
        max_steps=1,
        task_timeout_seconds=30.0,
        db_prompt_template=None,
    )

    assert result.status == "step_limit"
    assert relay_client.timeout_seconds_seen
    timeout_seconds = relay_client.timeout_seconds_seen[0]
    assert timeout_seconds is not None
    assert 0.0 < timeout_seconds <= 30.0


def test_agentbench_db_sql_timeout_uses_task_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeTime:
        def __init__(self) -> None:
            self._ticks = iter((100.0, 100.0, 100.01, 100.04, 100.06))
            self._last = 100.06

        def monotonic(self) -> float:
            self._last = next(self._ticks, self._last)
            return self._last

    class SlowRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            return RelayRunResult(
                text='{"name":"execute_sql","arguments":{"query":"SELECT value FROM T"}}',
                run_id="run-1",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    task = DbTask(
        task_id="std-0",
        description="select value",
        label=("A",),
        table={
            "table_name": "T",
            "table_info": {
                "columns": [{"name": "value"}],
                "rows": [["A"]],
            },
        },
    )

    monkeypatch.setitem(_run_db_task_once.__globals__, "time", FakeTime())
    result = _run_db_task_once(
        task=task,
        relay_client=cast(RelayTeamsHttpClient, SlowRelayClient()),
        max_steps=1,
        task_timeout_seconds=0.05,
        db_prompt_template=None,
    )

    assert result.status == "task_timeout"
    assert result.steps[-1].observation == "task timed out during SQL execution"


def test_agentbench_db_relay_deadline_timeout_is_task_timeout() -> None:
    class TimeoutRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            time.sleep(0.002)
            raise httpx.TimeoutException("deadline exceeded")

    task = DbTask(
        task_id="std-0",
        description="select value",
        label=("A",),
        table={
            "table_name": "T",
            "table_info": {
                "columns": [{"name": "value"}],
                "rows": [["A"]],
            },
        },
    )

    result = _run_db_task_once(
        task=task,
        relay_client=cast(RelayTeamsHttpClient, TimeoutRelayClient()),
        max_steps=1,
        task_timeout_seconds=0.001,
        db_prompt_template=None,
    )

    assert result.status == "task_timeout"


def test_agentbench_os_bash_action_uses_remaining_task_deadline() -> None:
    class FakeDockerClient:
        def __init__(self) -> None:
            self.timeout_seconds_seen: list[float] = []

        def create_sleep_container(self, image: str) -> str:
            _ = image
            return "container-1"

        def exec(
            self,
            container_id: str,
            command: list[str],
            *,
            timeout_seconds: float = 60.0,
        ) -> CommandResult:
            _ = (container_id, command)
            self.timeout_seconds_seen.append(timeout_seconds)
            return CommandResult(returncode=0, stdout="ok")

        def remove(self, container_id: str) -> None:
            _ = container_id

    class FakeRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            return RelayRunResult(
                text='{"name":"bash_action","arguments":{"script":"echo ok"}}',
                run_id="run-1",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    docker = FakeDockerClient()
    task = OsTask(
        task_id="std-0",
        description="run command",
        evaluation=OsEvaluation(match_answer="done"),
    )

    result = _run_os_task_once(
        task=task,
        docker=cast(DockerClient, docker),
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=1,
        task_timeout_seconds=5.0,
        os_prompt_template=None,
    )

    assert result.status == "step_limit"
    assert docker.timeout_seconds_seen
    assert 0.0 < docker.timeout_seconds_seen[0] <= 5.0


def test_agentbench_os_setup_script_timeout_is_task_timeout() -> None:
    class FakeDockerClient:
        def __init__(self) -> None:
            self.timeout_seconds_seen: list[float] = []

        def create_sleep_container(self, image: str) -> str:
            _ = image
            return "container-1"

        def exec(
            self,
            container_id: str,
            command: list[str],
            *,
            timeout_seconds: float = 60.0,
        ) -> CommandResult:
            _ = (container_id, command)
            self.timeout_seconds_seen.append(timeout_seconds)
            return CommandResult(
                returncode=124,
                stderr=f"command timed out after {timeout_seconds} seconds",
            )

        def remove(self, container_id: str) -> None:
            _ = container_id

    class FakeRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            raise AssertionError("setup timeout should finish before relay calls")

    docker = FakeDockerClient()
    task = OsTask(
        task_id="std-0",
        description="run command",
        init_scripts=(ShellScript(code="sleep 60"),),
        evaluation=OsEvaluation(match_answer="done"),
    )

    result = _run_os_task_once(
        task=task,
        docker=cast(DockerClient, docker),
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=1,
        task_timeout_seconds=5.0,
        os_prompt_template=None,
    )

    assert result.status == "task_timeout"
    assert docker.timeout_seconds_seen
    assert 0.0 < docker.timeout_seconds_seen[0] <= 5.0


def test_agentbench_os_final_bash_deadline_returns_task_timeout() -> None:
    class FakeDockerClient:
        def create_sleep_container(self, image: str) -> str:
            _ = image
            return "container-1"

        def exec(
            self,
            container_id: str,
            command: list[str],
            *,
            timeout_seconds: float = 60.0,
        ) -> CommandResult:
            _ = (container_id, command)
            return CommandResult(
                returncode=124,
                stderr=f"command timed out after {timeout_seconds} seconds",
            )

        def remove(self, container_id: str) -> None:
            _ = container_id

    class FakeRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            return RelayRunResult(
                text='{"name":"bash_action","arguments":{"script":"sleep 60"}}',
                run_id="run-1",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    task = OsTask(
        task_id="std-0",
        description="run command",
        evaluation=OsEvaluation(match_answer="done"),
    )

    result = _run_os_task_once(
        task=task,
        docker=cast(DockerClient, FakeDockerClient()),
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=1,
        task_timeout_seconds=5.0,
        os_prompt_template=None,
    )

    assert result.status == "task_timeout"
    assert result.steps[-1].observation == "task timed out during bash_action"


def test_agentbench_os_relay_deadline_timeout_is_task_timeout() -> None:
    class FakeDockerClient:
        def create_sleep_container(self, image: str) -> str:
            _ = image
            return "container-1"

        def remove(self, container_id: str) -> None:
            _ = container_id

    class TimeoutRelayClient:
        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            time.sleep(0.002)
            raise httpx.TimeoutException("deadline exceeded")

    task = OsTask(
        task_id="std-0",
        description="run command",
        evaluation=OsEvaluation(match_answer="done"),
    )

    result = _run_os_task_once(
        task=task,
        docker=cast(DockerClient, FakeDockerClient()),
        relay_client=cast(RelayTeamsHttpClient, TimeoutRelayClient()),
        max_steps=1,
        task_timeout_seconds=0.001,
        os_prompt_template=None,
    )

    assert result.status == "task_timeout"


def test_agentbench_os_evaluation_check_uses_remaining_task_deadline() -> None:
    class FakeDockerClient:
        def __init__(self) -> None:
            self.timeout_seconds_seen: list[float] = []

        def create_sleep_container(self, image: str) -> str:
            _ = image
            return "container-1"

        def exec(
            self,
            container_id: str,
            command: list[str],
            *,
            timeout_seconds: float = 60.0,
        ) -> CommandResult:
            _ = container_id
            self.timeout_seconds_seen.append(timeout_seconds)
            if command[0] == "python3":
                return CommandResult(
                    returncode=124,
                    stderr=f"command timed out after {timeout_seconds} seconds",
                )
            return CommandResult(returncode=0, stdout="ok")

        def remove(self, container_id: str) -> None:
            _ = container_id

    class FakeRelayClient:
        def __init__(self) -> None:
            self.call_count = 0

        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            self.call_count += 1
            if self.call_count == 1:
                text = '{"name":"bash_action","arguments":{"script":"echo ok"}}'
            else:
                text = '{"name":"answer_action","arguments":{"answer":"done"}}'
            return RelayRunResult(
                text=text,
                run_id=f"run-{self.call_count}",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    docker = FakeDockerClient()
    task = OsTask(
        task_id="std-0",
        description="run command",
        evaluation=OsEvaluation(
            check_scripts=(ShellScript(language="python", code=""),)
        ),
    )

    result = _run_os_task_once(
        task=task,
        docker=cast(DockerClient, docker),
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=2,
        task_timeout_seconds=5.0,
        os_prompt_template=None,
    )

    assert result.status == "task_timeout"
    assert len(docker.timeout_seconds_seen) == 2
    assert 0.0 < docker.timeout_seconds_seen[-1] <= 5.0


def test_agentbench_official_apt_remove_init_is_noninteractive() -> None:
    assert (
        _noninteractive_shell_code("apt remove sudo")
        == "SUDO_FORCE_REMOVE=yes apt remove sudo -y"
    )
    assert _noninteractive_shell_code("echo ok") == "echo ok"


def test_agentbench_db_compare_normalizes_numeric_answers() -> None:
    assert _compare_db_answers(("1",), ("1.0",)) is True
    assert _compare_db_answers(("1,174",), ("1174.0",)) is True
    assert _compare_db_answers(("",), ("none",)) is True
    assert _compare_db_answers(("1.004",), ("1.0",)) is True
    assert _compare_db_answers(("2 goals",), ("2",)) is False


def test_agentbench_db_loader_uses_declared_numeric_column_types() -> None:
    conn = sqlite3.connect(":memory:")
    try:
        _load_db_table(
            conn,
            {
                "table_name": "T",
                "table_info": {
                    "columns": [{"name": "rank", "type": "INTEGER"}],
                    "rows": [[10], [2]],
                },
            },
        )

        rows = conn.execute("SELECT rank FROM T ORDER BY rank").fetchall()

        assert rows == [(2,), (10,)]
    finally:
        conn.close()


def test_agentbench_db_loader_preserves_null_bool_and_real_values() -> None:
    conn = sqlite3.connect(":memory:")
    try:
        _load_db_table(
            conn,
            {
                "table_name": "T",
                "table_info": {
                    "columns": [
                        {"name": "flag", "type": "BOOL"},
                        {"name": "missing", "type": "TEXT"},
                        {"name": "score", "type": "REAL"},
                    ],
                    "rows": [[True, None, 1.5]],
                },
            },
        )

        rows = conn.execute(
            "SELECT flag, typeof(flag), missing IS NULL, score, typeof(score) FROM T"
        ).fetchall()

        assert rows == [(1, "integer", 1, 1.5, "real")]
    finally:
        conn.close()


def test_agentbench_db_loader_uses_hash_labels_for_mutation_tasks(
    tmp_path: Path,
) -> None:
    data_file = tmp_path / "standard.jsonl"
    data_file.write_text(
        """
{"description":"select value","label":["A"],"type":["other"],"table":{"table_name":"T","table_info":{"columns":[{"name":"Name"}],"rows":[["A"]]}}}
{"description":"insert value","label":["INSERT INTO T (Name) VALUES ('B')"],"answer_md5":"[('abc123',)]","type":["INSERT"],"table":{"table_name":"T","table_info":{"columns":[{"name":"Name"}],"rows":[["A"]]}}}
""".strip(),
        encoding="utf-8",
    )

    tasks = load_db_tasks(data_file=data_file, limit=None)

    assert tasks[0].label == ("A",)
    assert tasks[0].query_type == "other"
    assert tasks[1].label == ("abc123",)
    assert _is_db_mutation_query(tasks[1].query_type) is True


def test_agentbench_db_table_hash_matches_official_algorithm() -> None:
    table = {
        "table_name": "People",
        "table_info": {
            "columns": [{"name": "Name"}, {"name": "Age"}],
            "rows": [["Ada", "36"]],
        },
    }
    conn = sqlite3.connect(":memory:")
    try:
        _load_db_table(conn, table)
        conn.execute(
            'INSERT INTO "People" ("Name", "Age") VALUES (?, ?)', ("Grace", "85")
        )
        conn.commit()

        row_hashes = [
            hashlib.md5("Ada,36".encode()).hexdigest()[:5],
            hashlib.md5("Grace,85".encode()).hexdigest()[:5],
        ]
        expected_hash = hashlib.md5(",".join(sorted(row_hashes)).encode()).hexdigest()

        assert _calculate_db_tables_hash(conn, table) == expected_hash
    finally:
        conn.close()


def test_agentbench_db_mutation_invalid_table_state_is_agent_failure() -> None:
    class FakeRelayClient:
        def __init__(self) -> None:
            self.call_count = 0

        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            self.call_count += 1
            text = (
                '{"name":"execute_sql","arguments":{"query":"DROP TABLE People"}}'
                if self.call_count == 1
                else '{"name":"commit_final_answer","arguments":{"answers":["done"]}}'
            )
            return RelayRunResult(
                text=text,
                run_id=f"run-{self.call_count}",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    task = DbTask(
        task_id="std-0",
        description="mutate table",
        label=("expected-hash",),
        query_type="UPDATE",
        table={
            "table_name": "People",
            "table_info": {
                "columns": [{"name": "Name"}],
                "rows": [["Ada"]],
            },
        },
    )

    result = _run_db_task_once(
        task=task,
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=2,
        task_timeout_seconds=0.0,
        db_prompt_template=None,
    )

    assert result.status == "completed"
    assert result.failure_kind == FailureKind.AGENT
    assert result.error_message
    assert "People" in result.error_message


def test_agentbench_db_mutation_scoring_timeout_is_task_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRelayClient:
        def __init__(self) -> None:
            self.call_count = 0

        def run_prompt(
            self,
            prompt: str,
            *,
            session_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> RelayRunResult:
            _ = (prompt, session_id, timeout_seconds)
            self.call_count += 1
            text = (
                '{"name":"execute_sql","arguments":{"query":"UPDATE People SET Name = '
                "'Grace'\"}}"
                if self.call_count == 1
                else '{"name":"commit_final_answer","arguments":{"answers":["done"]}}'
            )
            return RelayRunResult(
                text=text,
                run_id=f"run-{self.call_count}",
                session_id="session-1",
                terminal_event_type="run_completed",
            )

    def fake_calculate_db_tables_hash_with_deadline(
        conn: sqlite3.Connection,
        table_value: object,
        *,
        deadline: float | None = None,
    ) -> str | None:
        _ = (conn, table_value, deadline)
        return None

    monkeypatch.setattr(
        "benchmarks.agentbench.run_agentbench._calculate_db_tables_hash_with_deadline",
        fake_calculate_db_tables_hash_with_deadline,
    )
    task = DbTask(
        task_id="std-0",
        description="mutate table",
        label=("expected-hash",),
        query_type="UPDATE",
        table={
            "table_name": "People",
            "table_info": {
                "columns": [{"name": "Name"}],
                "rows": [["Ada"]],
            },
        },
    )

    result = _run_db_task_once(
        task=task,
        relay_client=cast(RelayTeamsHttpClient, FakeRelayClient()),
        max_steps=2,
        task_timeout_seconds=30.0,
        db_prompt_template=None,
    )

    assert result.status == "task_timeout"
    assert result.failure_kind == FailureKind.AGENT
    assert result.answer == ("done",)
    assert result.steps[-1].observation == "task timed out during DB mutation scoring"


def test_agentbench_db_table_hash_deadline_returns_none() -> None:
    conn = sqlite3.connect(":memory:")
    try:
        table = {
            "table_name": "People",
            "table_info": {
                "columns": [{"name": "Name"}],
                "rows": [["Ada"]],
            },
        }
        _load_db_table(conn, table)

        assert (
            _calculate_db_tables_hash_with_deadline(
                conn,
                table,
                deadline=time.monotonic() - 1.0,
            )
            is None
        )
    finally:
        conn.close()


def test_agentbench_db_mutation_prompt_scores_database_state(tmp_path: Path) -> None:
    table = {
        "table_name": "People",
        "table_info": {
            "columns": [{"name": "Name"}],
            "rows": [["Ada"]],
        },
    }
    task = load_db_tasks(
        data_file=_write_single_db_task(
            tmp_path=tmp_path,
            table=table,
            query_type="UPDATE",
            expected_hash="hash",
        ),
        limit=None,
    )[0]

    prompt = _build_db_prompt(task, history=[], step_index=1, max_steps=0)

    assert "database modification task" in prompt
    assert "scoring checks the final database state" in prompt
    assert '"query":"SQL statement"' in prompt


def test_agentbench_os_prompt_matches_function_call_protocol() -> None:
    task = OsTask(
        task_id="std-001-example",
        description="How many files are in /tmp?",
        evaluation=OsEvaluation(match_answer="1"),
    )

    prompt = _build_os_prompt(task, history=[], step_index=1, max_steps=8)

    assert "Linux Ubuntu operating system" in prompt
    assert "Choose exactly one action on each turn" in prompt
    assert "Bash code must not contain interactive input operations" in prompt
    assert "Submit final answers only through answer_action" in prompt
    assert "Available actions:" in prompt
    assert "\u53ef\u7528\u52a8\u4f5c" not in prompt


def test_agentbench_db_prompt_matches_function_call_protocol(tmp_path: Path) -> None:
    table = {
        "table_name": "People",
        "table_info": {
            "columns": [{"name": "Name"}],
            "rows": [["Ada"]],
        },
    }
    task = load_db_tasks(
        data_file=_write_single_db_task(
            tmp_path=tmp_path,
            table=table,
            query_type="SELECT",
            expected_hash="hash",
        ),
        limit=None,
    )[0]

    prompt = _build_db_prompt(task, history=[], step_index=1, max_steps=15)

    assert "Choose exactly one action on each turn" in prompt
    assert "one-line SQL statements" in prompt
    assert "execute only one SQL statement per action" in prompt
    assert "Never submit the final answer in a content field" in prompt
    assert "- Execute one SQL statement per turn, written on one line." in prompt


def _write_single_db_task(
    *,
    tmp_path: Path,
    table: dict[str, object],
    query_type: str,
    expected_hash: str,
) -> Path:
    path = tmp_path / "agentbench-single-db-task.jsonl"
    payload = {
        "description": "modify table",
        "label": ["ignored"],
        "answer_md5": [[expected_hash]],
        "type": [query_type],
        "table": table,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_agentbench_existing_db_results_are_rescored(tmp_path: Path) -> None:
    output_path = tmp_path / "results.json"
    report = write_run_result(
        output_path=output_path,
        run_id="run",
        timestamp=datetime.now(tz=timezone.utc),
        results=(
            TaskResult(
                suite=AgentBenchSuite.DB,
                task_id="std-0",
                passed=False,
                status="completed",
                failure_kind=FailureKind.AGENT,
                answer=("91",),
                expected=("91.0",),
                duration_seconds=0.1,
            ),
        ),
        planned_count=1,
    )
    assert report.passed_count == 0

    loaded = _load_existing_run_result(output_path)

    assert loaded is not None
    assert loaded.results[0].passed is True
    assert loaded.results[0].failure_kind is None


def test_agentbench_retry_recovers_infra_failure() -> None:
    attempts = 0

    def run_once() -> TaskResult:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise InfrastructureFailure("temporary network failure")
        return TaskResult(
            suite=AgentBenchSuite.DB,
            task_id="std-0",
            passed=True,
            status="completed",
            duration_seconds=0.1,
        )

    result = _run_with_infra_retries(
        suite=AgentBenchSuite.DB,
        task_id="std-0",
        run_once=run_once,
        infra_retry_attempts=1,
        infra_retry_backoff_seconds=0.0,
    )

    assert result.passed is True
    assert result.attempts == 2


def test_agentbench_retry_marks_exhausted_infra_failure() -> None:
    def run_once() -> TaskResult:
        raise InfrastructureFailure("relay unavailable")

    result = _run_with_infra_retries(
        suite=AgentBenchSuite.OS,
        task_id="std-0",
        run_once=run_once,
        infra_retry_attempts=1,
        infra_retry_backoff_seconds=0.0,
    )

    assert result.passed is False
    assert result.status == "infra_error"
    assert result.failure_kind == FailureKind.INFRA
    assert result.attempts == 2


def test_agentbench_write_run_result_counts_failure_kinds(tmp_path: Path) -> None:
    output_path = tmp_path / "results.json"

    report = write_run_result(
        output_path=output_path,
        run_id="run",
        timestamp=datetime.now(tz=timezone.utc),
        results=(
            TaskResult(
                suite=AgentBenchSuite.DB,
                task_id="std-0",
                passed=False,
                status="infra_error",
                failure_kind=FailureKind.INFRA,
                duration_seconds=0.1,
            ),
            TaskResult(
                suite=AgentBenchSuite.OS,
                task_id="std-1",
                passed=False,
                status="step_limit",
                failure_kind=FailureKind.AGENT,
                duration_seconds=0.2,
            ),
        ),
        planned_count=2,
    )

    assert report.completed_count == 2
    assert report.infrastructure_failure_count == 1
    assert report.agent_failure_count == 1
    assert output_path.exists()
