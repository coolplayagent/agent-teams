from __future__ import annotations

from pathlib import Path

from scripts.benchmarks.prepare_benchmarks import (
    DEFAULT_AGENTBENCH_REPO_CONTEXT,
    stage_agentbench_repo_for_docker_build,
)


def test_stage_agentbench_repo_for_docker_build_copies_custom_cache_dir(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "custom-cache" / "AgentBench"
    source.mkdir(parents=True)
    (source / "README.md").write_text("custom checkout", encoding="utf-8")
    (source / ".git").mkdir()
    (source / ".git" / "HEAD").write_text("ref: main", encoding="utf-8")

    staged_path = stage_agentbench_repo_for_docker_build(source)

    assert staged_path == DEFAULT_AGENTBENCH_REPO_CONTEXT
    assert (tmp_path / staged_path / "README.md").read_text(
        encoding="utf-8"
    ) == "custom checkout"
    assert not (tmp_path / staged_path / ".git").exists()
