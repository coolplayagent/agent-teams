from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from relay_teams_evals.checkpoint import (
    EvalCheckpointSignature,
    EvalCheckpointStore,
    archive_output_dir,
    build_checkpoint_signature,
)
from relay_teams_evals.backends.agent_teams_config import AgentTeamsConfig
from relay_teams_evals.models import EvalResult, RunOutcome, TokenUsage
from relay_teams_evals.run_config import AgentBenchConfig, RunConfig


def _signature() -> EvalCheckpointSignature:
    return EvalCheckpointSignature(
        dataset="jsonl",
        dataset_path="D:/tmp/dataset.jsonl",
        dataset_sha256="abc123",
        item_ids=("a", "b"),
        scorer="keyword",
        swebench_pass_threshold=0.8,
        backend="agent_teams",
        workspace_mode="git",
        agent_execution_mode="ai",
        agent_session_mode="normal",
        agent_orchestration_preset_id=None,
        agent_yolo=True,
        agent_timeout_seconds=600.0,
        git_clone_timeout_seconds=120.0,
    )


def _result(item_id: str, *, score: float, passed: bool) -> EvalResult:
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
        duration_seconds=1.0,
    )


def test_checkpoint_store_load_results_last_write_wins_and_ignores_corrupt_tail(
    tmp_path: Path,
) -> None:
    store = EvalCheckpointStore(tmp_path / "results")
    store.ensure_initialized(_signature())
    store.append_result(_result("a", score=0.1, passed=False))
    store.append_result(_result("a", score=1.0, passed=True))
    store.append_result(_result("b", score=0.5, passed=True))

    with store.results_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write('{"broken": ')

    loaded = store.load_results()

    assert sorted(loaded) == ["a", "b"]
    assert loaded["a"].score == 1.0
    assert loaded["a"].passed is True
    assert loaded["b"].score == 0.5


def test_archive_output_dir_moves_existing_contents_to_timestamped_sibling(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "results"
    output_dir.mkdir()
    old_report = output_dir / "report.json"
    old_report.write_text(json.dumps({"old": True}), encoding="utf-8")

    archived = archive_output_dir(
        output_dir,
        now=datetime(2026, 3, 20, 0, 0, tzinfo=timezone.utc),
    )

    assert archived == tmp_path / "results.20260320T000000Z"
    assert output_dir.exists() is False
    assert archived is not None
    assert (archived / "report.json").read_text(encoding="utf-8") == '{"old": true}'


def test_build_checkpoint_signature_includes_session_mode_and_orchestration(
    tmp_path: Path,
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text('{"item_id":"a","intent":"demo"}\n', encoding="utf-8")
    cfg = RunConfig(
        dataset_path=dataset_path,
        agent_teams=AgentTeamsConfig(
            session_mode="orchestration",
            orchestration_preset_id="default",
        ),
    )

    signature = build_checkpoint_signature(
        cfg,
        dataset_path=dataset_path,
        item_ids=("a",),
    )

    assert signature.agent_session_mode == "orchestration"
    assert signature.agent_orchestration_preset_id == "default"


def test_build_checkpoint_signature_expands_agent_config_dir(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text('{"item_id":"a","intent":"demo"}\n', encoding="utf-8")
    config_dir = Path("~/.config/agent-teams")
    cfg = RunConfig(
        dataset_path=dataset_path,
        workspace_mode="docker",
        agent_teams=AgentTeamsConfig(config_dir=config_dir),
    )

    signature = build_checkpoint_signature(
        cfg,
        dataset_path=dataset_path,
        item_ids=("a",),
    )

    assert signature.agent_config_dir == str(config_dir.expanduser().resolve())


def test_build_checkpoint_signature_hashes_docker_extra_env_values(
    tmp_path: Path,
) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text('{"item_id":"a","intent":"demo"}\n', encoding="utf-8")
    base_cfg = RunConfig(
        dataset_path=dataset_path,
        workspace_mode="docker",
    )
    secret_cfg = base_cfg.model_copy(
        update={
            "docker": base_cfg.docker.model_copy(
                update={
                    "extra_env": {
                        "RELAY_TEAMS_BENCH_API_KEY": "super-secret",
                    }
                }
            )
        }
    )
    changed_secret_cfg = base_cfg.model_copy(
        update={
            "docker": base_cfg.docker.model_copy(
                update={
                    "extra_env": {
                        "RELAY_TEAMS_BENCH_API_KEY": "different-secret",
                    }
                }
            )
        }
    )

    signature = build_checkpoint_signature(
        secret_cfg,
        dataset_path=dataset_path,
        item_ids=("a",),
    )
    changed_signature = build_checkpoint_signature(
        changed_secret_cfg,
        dataset_path=dataset_path,
        item_ids=("a",),
    )

    expected_digest = hashlib.sha256(b"super-secret").hexdigest()
    assert "super-secret" not in signature.model_dump_json()
    assert dict(signature.docker_extra_env) == {
        "RELAY_TEAMS_BENCH_API_KEY": f"sha256:{expected_digest}",
    }
    assert signature != changed_signature


def test_build_checkpoint_signature_includes_agentbench_settings(
    tmp_path: Path,
) -> None:
    dataset_path = tmp_path / "agentbench.json"
    dataset_path.write_text('{"results":[]}\n', encoding="utf-8")
    base_cfg = RunConfig(
        dataset="agentbench",
        dataset_path=dataset_path,
        agentbench=AgentBenchConfig(
            model="deepseek-v4-flash",
            model_base_url="https://api.deepseek.com",
            max_steps=3,
            task_timeout_seconds=20.0,
            os_prompt_template="os {task_description}",
        ),
    )
    changed_cfg = base_cfg.model_copy(
        update={
            "agentbench": base_cfg.agentbench.model_copy(
                update={
                    "model": "other-model",
                    "max_steps": 5,
                    "db_prompt_template": "db {task_description}",
                }
            )
        }
    )
    rerun_cfg = base_cfg.model_copy(
        update={
            "agentbench": base_cfg.agentbench.model_copy(
                update={
                    "rerun_infra_failures": True,
                    "rerun_db_mutation_failures": False,
                }
            )
        }
    )

    base_signature = build_checkpoint_signature(
        base_cfg,
        dataset_path=dataset_path,
        item_ids=("os:0",),
    )
    changed_signature = build_checkpoint_signature(
        changed_cfg,
        dataset_path=dataset_path,
        item_ids=("os:0",),
    )
    rerun_signature = build_checkpoint_signature(
        rerun_cfg,
        dataset_path=dataset_path,
        item_ids=("os:0",),
    )

    assert base_signature.agentbench is not None
    assert base_signature.agentbench.model == "deepseek-v4-flash"
    assert base_signature.agentbench.max_steps == 3
    assert base_signature != changed_signature
    assert base_signature == rerun_signature
