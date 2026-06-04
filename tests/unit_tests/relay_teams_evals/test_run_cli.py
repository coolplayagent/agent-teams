from __future__ import annotations

import json
import time
from pathlib import Path

from typer.testing import CliRunner

from relay_teams_evals.checkpoint import EvalCheckpointStore, build_checkpoint_signature
from relay_teams_evals.agentbench_runs.docker_runner import (
    AgentBenchTaskManifest,
)
from relay_teams_evals.models import EvalItem, EvalResult, RunOutcome, TokenUsage
from relay_teams_evals.run import _normalize_item_ids, _validate_unique_item_ids, app
from relay_teams_evals.run_config import AgentBenchConfig, RunConfig

runner = CliRunner()


def _item(item_id: str) -> EvalItem:
    return EvalItem(item_id=item_id, dataset="jsonl", intent=f"intent-{item_id}")


def _result(item_id: str, *, score: float, passed: bool = True) -> EvalResult:
    return EvalResult(
        item_id=item_id,
        dataset="jsonl",
        run_id=f"run-{item_id}",
        session_id=f"session-{item_id}",
        outcome=RunOutcome.COMPLETED,
        passed=passed,
        score=score,
        scorer_name="keyword",
        token_usage=TokenUsage(input_tokens=10, output_tokens=5, total_tokens=15),
        duration_seconds=0.1,
    )


def _agentbench_result(item_id: str, *, dataset: str) -> EvalResult:
    return EvalResult(
        item_id=item_id,
        dataset=dataset,
        run_id="",
        session_id="",
        outcome=RunOutcome.COMPLETED,
        passed=True,
        score=1.0,
        scorer_name=dataset,
        token_usage=TokenUsage(input_tokens=10, output_tokens=5, total_tokens=15),
        duration_seconds=0.1,
    )


def _agentbench_checkpoint_result(
    item_id: str,
    *,
    passed: bool,
    scorer_detail: str,
) -> EvalResult:
    return EvalResult(
        item_id=item_id,
        dataset="agentbench",
        run_id=f"run-{item_id}",
        session_id=f"session-{item_id}",
        outcome=RunOutcome.COMPLETED,
        passed=passed,
        score=1.0 if passed else 0.0,
        scorer_name="agentbench",
        scorer_detail=scorer_detail,
        token_usage=TokenUsage(input_tokens=10, output_tokens=5, total_tokens=15),
        duration_seconds=0.1,
    )


class _FakeBackend:
    def __init__(self, _config, **_kwargs: object) -> None:
        pass


class _FakeScorer:
    @property
    def name(self) -> str:
        return "keyword"


class _FakeLoader:
    def __init__(self, items: list[EvalItem], dataset_name: str | None = None) -> None:
        self._items = items
        self._dataset_name = dataset_name

    def load(self, _path: Path) -> list[EvalItem]:
        return list(self._items)


def _install_fake_backend_module(monkeypatch) -> None:
    monkeypatch.setattr("relay_teams_evals.run.AgentTeamsBackend", _FakeBackend)


def test_validate_unique_item_ids_rejects_duplicates() -> None:
    items = [_item("a"), _item("a")]

    try:
        _validate_unique_item_ids(items)
    except ValueError as exc:
        assert "Duplicate item_id values are not supported: a" == str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected duplicate item ids to fail")


def test_normalize_item_ids_supports_csv_and_repeated_values() -> None:
    assert _normalize_item_ids(["a,b", " b ", "c, d"]) == ["a", "b", "c", "d"]


def test_normalize_item_ids_rejects_empty_values() -> None:
    try:
        _normalize_item_ids(["a,,b"])
    except ValueError as exc:
        assert "--item-ids contains an empty item id" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected empty item ids to fail")


def test_run_resumes_completed_items_and_keeps_report_order(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    items = [_item("a"), _item("b"), _item("c")]
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        concurrency=2,
        save_artifacts=False,
        report_format="json",
    )
    checkpoint_store = EvalCheckpointStore(output_dir)
    checkpoint_store.ensure_initialized(
        build_checkpoint_signature(
            cfg,
            dataset_path=dataset_path,
            item_ids=tuple(item.item_id for item in items),
        )
    )
    checkpoint_store.append_result(_result("b", score=0.2, passed=False))

    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            if item.item_id == "a":
                time.sleep(0.05)
                return _result("a", score=1.0, passed=True)
            if item.item_id == "c":
                time.sleep(0.01)
                return _result("c", score=0.7, passed=True)
            raise AssertionError(f"unexpected item: {item.item_id}")

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file)])

    assert result.exit_code == 0
    assert set(run_calls) == {"a", "c"}
    assert "b" not in run_calls
    assert "Resuming from checkpoint: 1 completed, 2 remaining" in result.output

    report = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    assert [entry["item_id"] for entry in report["results"]] == ["a", "b", "c"]

    loaded = checkpoint_store.load_results()
    assert sorted(loaded) == ["a", "b", "c"]


def test_run_restart_archives_previous_output_dir_before_new_run(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    output_dir.mkdir()
    (output_dir / "stale.txt").write_text("old-run", encoding="utf-8")
    items = [_item("a")]
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        save_artifacts=False,
        report_format="json",
    )
    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _result(item.item_id, score=1.0, passed=True)

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file), "--restart"])

    assert result.exit_code == 0
    assert run_calls == ["a"]
    archived_dirs = [
        path for path in tmp_path.iterdir() if path.name.startswith("results.")
    ]
    assert len(archived_dirs) == 1
    assert (archived_dirs[0] / "stale.txt").read_text(encoding="utf-8") == "old-run"
    assert (output_dir / "report.json").exists()
    assert (output_dir / "checkpoint.meta.json").exists()


def test_run_fails_when_checkpoint_signature_does_not_match(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        save_artifacts=False,
        report_format="json",
    )
    existing_items = (_item("a"),)
    checkpoint_store = EvalCheckpointStore(output_dir)
    checkpoint_store.ensure_initialized(
        build_checkpoint_signature(
            cfg,
            dataset_path=dataset_path,
            item_ids=tuple(item.item_id for item in existing_items),
        )
    )

    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _result(item.item_id, score=1.0, passed=True)

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader([_item("a"), _item("b")], dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file)])

    assert result.exit_code == 1
    assert (
        "Checkpoint signature does not match the current eval configuration."
        in result.output
    )
    assert run_calls == []


def test_run_rejects_rerun_without_item_ids(monkeypatch, tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=tmp_path / "results",
        save_artifacts=False,
        report_format="json",
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file), "--rerun"])

    assert result.exit_code == 1
    assert "--rerun requires at least one --item-ids value" in result.output


def test_run_rejects_empty_item_id_from_csv(monkeypatch, tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=tmp_path / "results",
        save_artifacts=False,
        report_format="json",
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(
        app,
        ["run", "--config", str(config_file), "--item-ids", "a,,b"],
    )

    assert result.exit_code == 1
    assert "--item-ids contains an empty item id" in result.output


def test_run_rerun_reexecutes_selected_item_and_updates_full_report(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    items = [_item("a"), _item("b"), _item("c")]
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        save_artifacts=False,
        report_format="json",
    )
    checkpoint_store = EvalCheckpointStore(output_dir)
    checkpoint_store.ensure_initialized(
        build_checkpoint_signature(
            cfg,
            dataset_path=dataset_path,
            item_ids=tuple(item.item_id for item in items),
        )
    )
    checkpoint_store.append_result(_result("a", score=0.1, passed=False))
    checkpoint_store.append_result(_result("b", score=0.2, passed=False))
    checkpoint_store.append_result(_result("c", score=0.3, passed=True))

    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _result(item.item_id, score=1.0, passed=True)

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(
        app,
        ["run", "--config", str(config_file), "--item-ids", "b", "--rerun"],
    )

    assert result.exit_code == 0
    assert run_calls == ["b"]
    assert "Rerunning 1 item(s) against existing results" in result.output

    report = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    by_id = {entry["item_id"]: entry for entry in report["results"]}
    assert [entry["item_id"] for entry in report["results"]] == ["a", "b", "c"]
    assert by_id["a"]["score"] == 0.1
    assert by_id["b"]["score"] == 1.0
    assert by_id["c"]["score"] == 0.3

    loaded = checkpoint_store.load_results()
    assert loaded["b"].score == 1.0


def test_run_rerun_supports_csv_item_ids_and_concurrency(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    items = [_item("a"), _item("b"), _item("c")]
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        concurrency=1,
        save_artifacts=False,
        report_format="json",
    )
    checkpoint_store = EvalCheckpointStore(output_dir)
    checkpoint_store.ensure_initialized(
        build_checkpoint_signature(
            cfg,
            dataset_path=dataset_path,
            item_ids=tuple(item.item_id for item in items),
        )
    )
    checkpoint_store.append_result(_result("a", score=0.1, passed=False))
    checkpoint_store.append_result(_result("b", score=0.2, passed=False))
    checkpoint_store.append_result(_result("c", score=0.3, passed=True))

    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _result(item.item_id, score=1.0, passed=True)

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(
        app,
        [
            "run",
            "--config",
            str(config_file),
            "--item-ids",
            "a,b",
            "--rerun",
            "--concurrency",
            "2",
        ],
    )

    assert result.exit_code == 0
    assert set(run_calls) == {"a", "b"}
    assert "Rerunning 2 item(s) against existing results" in result.output
    assert "concurrency=2" in result.output

    report = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    by_id = {entry["item_id"]: entry for entry in report["results"]}
    assert [entry["item_id"] for entry in report["results"]] == ["a", "b", "c"]
    assert by_id["a"]["score"] == 1.0
    assert by_id["b"]["score"] == 1.0
    assert by_id["c"]["score"] == 0.3


def test_run_supports_csv_and_repeated_item_id_filters(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    output_dir = tmp_path / "results"
    items = [_item("a"), _item("b"), _item("c"), _item("d")]
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=output_dir,
        save_artifacts=False,
        report_format="json",
    )
    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _result(item.item_id, score=1.0, passed=True)

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(
        app,
        [
            "run",
            "--config",
            str(config_file),
            "--item-ids",
            "a, b",
            "--item-ids",
            "c",
            "--item-ids",
            "a",
        ],
    )

    assert result.exit_code == 0
    assert run_calls == ["a", "b", "c"]
    assert "Filtered to 3 items by item_ids" in result.output


def test_run_does_not_print_rerun_command_for_failed_result(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text(
        '{"item_id":"placeholder","intent":"demo"}\n', encoding="utf-8"
    )
    cfg = RunConfig(
        dataset_path=dataset_path,
        output_dir=tmp_path / "results",
        save_artifacts=False,
        report_format="json",
    )
    items = [_item("demo")]

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            return EvalResult(
                item_id=item.item_id,
                dataset="jsonl",
                run_id="",
                session_id="",
                outcome=RunOutcome.FAILED,
                passed=False,
                score=0.0,
                scorer_name="keyword",
                scorer_detail="instance image build failed",
                error="Instance image 'sweb.eval.x86_64.demo:latest' failed to build.",
                build_log_path="logs/build_images/demo/build_image.log",
                build_error_summary="ModuleNotFoundError: No module named 'pkg_resources'",
                token_usage=TokenUsage(),
                duration_seconds=0.1,
            )

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    _install_fake_backend_module(monkeypatch)
    monkeypatch.setattr(
        "relay_teams_evals.run.JsonlLoader",
        lambda dataset_name: _FakeLoader(items, dataset_name),
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.KeywordScorer",
        _FakeScorer,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file)])

    assert result.exit_code == 0
    assert "build_log: logs/build_images/demo/build_image.log" in result.output
    assert "rerun:" not in result.output


def test_run_routes_agentbench_through_common_eval_loop(
    monkeypatch, tmp_path: Path
) -> None:
    output_dir = tmp_path / "agentbench-results"
    manifest_path = tmp_path / "agentbench-manifest.json"
    cfg = RunConfig(
        dataset="agentbench",
        dataset_path=None,
        scorer="agentbench",
        workspace_mode="docker",
        output_dir=output_dir,
        save_artifacts=False,
        report_format="both",
    )
    calls: dict[str, object] = {}
    items = [
        EvalItem(
            item_id="db:std-0",
            dataset="agentbench",
            intent="answer the query",
        )
    ]

    class FakeAgentBenchRunner:
        def __init__(self, loaded_cfg: RunConfig) -> None:
            calls["cfg"] = loaded_cfg

        def discover_items(self, *, benchmark: str) -> AgentBenchTaskManifest:
            calls["benchmark"] = benchmark
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
            return AgentBenchTaskManifest(
                benchmark="agentbench",
                manifest_path=manifest_path,
                items=tuple(items),
            )

    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _agentbench_result(item.item_id, dataset="agentbench")

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.AgentBenchDockerRunner",
        FakeAgentBenchRunner,
    )
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(
        app,
        [
            "run",
            "--config",
            str(config_file),
            "--limit",
            "5",
            "--concurrency",
            "2",
            "--item-ids",
            "db:std-0",
            "--restart",
        ],
    )

    assert result.exit_code == 0
    assert calls["benchmark"] == "agentbench"
    assert run_calls == ["db:std-0"]
    assert (output_dir / "checkpoint.meta.json").exists()
    assert (output_dir / "report.json").exists()
    assert (output_dir / "results.json").exists()
    assert (output_dir / "evaluation.json").exists()


def test_run_resumes_agentbench_checkpoint_with_rerun_policy(
    monkeypatch, tmp_path: Path
) -> None:
    dataset_path = tmp_path / "agentbench.json"
    dataset_path.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "suite": "os",
                        "task_id": "infra",
                        "description": "recover infra",
                    },
                    {
                        "suite": "db",
                        "task_id": "mutation",
                        "description": "mutate db",
                        "query_type": "UPDATE",
                    },
                    {
                        "suite": "db",
                        "task_id": "select",
                        "description": "read db",
                        "query_type": "SELECT",
                    },
                    {
                        "suite": "os",
                        "task_id": "passed",
                        "description": "already passed",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    output_dir = tmp_path / "results"
    previous_cfg = RunConfig(
        dataset="agentbench",
        dataset_path=dataset_path,
        scorer="agentbench",
        workspace_mode="docker",
        output_dir=output_dir,
        save_artifacts=False,
        report_format="json",
        agentbench=AgentBenchConfig(
            rerun_infra_failures=False,
            rerun_db_mutation_failures=False,
        ),
    )
    cfg = previous_cfg.model_copy(
        update={
            "agentbench": previous_cfg.agentbench.model_copy(
                update={
                    "rerun_infra_failures": True,
                    "rerun_db_mutation_failures": True,
                }
            )
        }
    )
    loaded_items = [
        EvalItem(
            item_id="os:infra",
            dataset="agentbench",
            intent="recover infra",
            extra_fields={"suite": "os"},
        ),
        EvalItem(
            item_id="db:mutation",
            dataset="agentbench",
            intent="mutate db",
            extra_fields={"suite": "db", "query_type": "UPDATE"},
        ),
        EvalItem(
            item_id="db:select",
            dataset="agentbench",
            intent="read db",
            extra_fields={"suite": "db", "query_type": "SELECT"},
        ),
        EvalItem(
            item_id="os:passed",
            dataset="agentbench",
            intent="already passed",
            extra_fields={"suite": "os"},
        ),
    ]
    checkpoint_store = EvalCheckpointStore(output_dir)
    checkpoint_store.ensure_initialized(
        build_checkpoint_signature(
            previous_cfg,
            dataset_path=dataset_path,
            item_ids=tuple(item.item_id for item in loaded_items),
        )
    )
    checkpoint_store.append_result(
        _agentbench_checkpoint_result(
            "os:infra",
            passed=False,
            scorer_detail="status=infra_error; failure_kind=infra",
        )
    )
    checkpoint_store.append_result(
        _agentbench_checkpoint_result(
            "db:mutation",
            passed=False,
            scorer_detail="status=failed; failure_kind=agent",
        )
    )
    checkpoint_store.append_result(
        _agentbench_checkpoint_result(
            "db:select",
            passed=False,
            scorer_detail="status=failed; failure_kind=agent",
        )
    )
    checkpoint_store.append_result(
        _agentbench_checkpoint_result(
            "os:passed",
            passed=True,
            scorer_detail="status=completed",
        )
    )
    run_calls: list[str] = []

    class FakeEvalRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        def run_item(self, item: EvalItem) -> EvalResult:
            run_calls.append(item.item_id)
            return _agentbench_result(item.item_id, dataset="agentbench")

    monkeypatch.setattr(
        "relay_teams_evals.run.load_run_config",
        lambda _path: cfg,
    )
    monkeypatch.setattr(
        "relay_teams_evals.run.AgentBenchLoader",
        lambda: _FakeLoader(loaded_items, "agentbench"),
    )
    monkeypatch.setattr("relay_teams_evals.run.AgentBenchRunBackend", _FakeBackend)
    monkeypatch.setattr("relay_teams_evals.run.EvalRunner", FakeEvalRunner)

    config_file = tmp_path / "eval.yaml"
    config_file.write_text("unused: true\n", encoding="utf-8")
    result = runner.invoke(app, ["run", "--config", str(config_file)])

    assert result.exit_code == 0
    assert set(run_calls) == {"os:infra", "db:mutation"}
    assert "Resuming from checkpoint: 2 completed, 2 remaining" in result.output

    report = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    by_id = {entry["item_id"]: entry for entry in report["results"]}
    assert by_id["os:infra"]["score"] == 1.0
    assert by_id["db:mutation"]["score"] == 1.0
    assert by_id["db:select"]["score"] == 0.0
    assert by_id["os:passed"]["score"] == 1.0
