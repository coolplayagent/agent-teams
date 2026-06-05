# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Mapping
import json
from typing import cast
import tomllib
from pathlib import Path

import yaml


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_yaml_mapping(path: Path) -> Mapping[object, object]:
    loaded = cast(object, yaml.safe_load(path.read_text(encoding="utf-8")))
    if not isinstance(loaded, Mapping):
        raise AssertionError(f"Expected {path} to contain a YAML mapping")

    result: dict[object, object] = {}
    for key, value in loaded.items():
        result[key] = value
    return result


def _workflow_job_names(path: Path) -> set[str]:
    workflow = _load_yaml_mapping(path)
    jobs = workflow.get("jobs")
    if not isinstance(jobs, Mapping):
        raise AssertionError(f"Expected {path} to define jobs")

    return {job_name for job_name in jobs if isinstance(job_name, str)}


def test_pyproject_uses_relay_teams_distribution_name_and_scripts() -> None:
    pyproject_path = _project_root() / "pyproject.toml"
    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)

    assert pyproject["project"]["name"] == "relay-teams"
    assert (
        pyproject["project"]["scripts"]["relay-teams"]
        == "relay_teams.interfaces.cli.app:main"
    )
    assert (
        pyproject["project"]["scripts"]["relay-teams-evals"]
        == "relay_teams_evals.run:app"
    )
    assert "agent-teams" not in pyproject["project"]["scripts"]
    assert "agent-teams-evals" not in pyproject["project"]["scripts"]


def test_release_workflow_and_runtime_wrapper_reference_relay_teams() -> None:
    project_root = _project_root()
    release_workflow = (
        project_root / ".github" / "workflows" / "release.yml"
    ).read_text(encoding="utf-8")
    runtime_dockerfile = (
        project_root / "docker" / "Dockerfile.agent-runtime"
    ).read_text(encoding="utf-8")
    runtime_pyproject_script = (
        project_root / "docker" / "prepare_runtime_pyproject.py"
    ).read_text(encoding="utf-8")

    assert "https://pypi.org/project/relay-teams/" in release_workflow
    assert '--find-links "$RUNTIME_ROOT/wheels" relay-teams' in runtime_dockerfile
    assert 'exec "$VENV_PATH/bin/relay-teams" "$@"' in runtime_dockerfile
    assert "/opt/agent-runtime/bin/relay-teams server start ..." in runtime_dockerfile
    assert 'relay-teams-evals = "relay_teams_evals.run:app"' in runtime_pyproject_script


def test_pr_checks_gate_changed_line_unit_coverage() -> None:
    project_root = _project_root()
    pr_workflow_path = project_root / ".github" / "workflows" / "pr-checks.yml"
    pr_workflow = pr_workflow_path.read_text(encoding="utf-8")
    pyproject_path = project_root / "pyproject.toml"
    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)

    dev_dependencies = pyproject["project"]["optional-dependencies"]["dev"]
    coverage_run = pyproject["tool"]["coverage"]["run"]
    diff_cover = pyproject["tool"]["diff_cover"]

    assert "bandit>=1.8.0" in dev_dependencies
    assert "xenon>=0.9.3" in dev_dependencies
    assert coverage_run["source"] == ["src/relay_teams", "src/relay_teams_evals"]
    assert diff_cover["compare_branch"] == "origin/main"
    assert diff_cover["fail_under"] == 90
    assert diff_cover["include"] == [
        "src/relay_teams/**/*.py",
        "src/relay_teams_evals/**/*.py",
    ]
    assert _workflow_job_names(pr_workflow_path) == {
        "agents-self-check-api-integration",
        "agents-self-check-browser-integration",
        "agents-self-check-quality",
        "agents-self-check-unit-coverage",
        "agents-self-check-unit-parallel-coverage",
        "agents-self-check-unit-serial-coverage",
    }
    assert "fetch-depth: 0" in pr_workflow
    assert "ruff check --no-cache --force-exclude ." in pr_workflow
    assert "ruff format --check --no-cache --force-exclude ." in pr_workflow
    assert "bandit -r src" in pr_workflow
    assert "--severity-level medium" in pr_workflow
    assert "xenon" in pr_workflow
    assert "--max-modules C" in pr_workflow
    assert "--cov=src/relay_teams" in pr_workflow
    assert "--cov=src/relay_teams_evals" in pr_workflow
    assert "--cov-report=" in pr_workflow
    assert "--ignore=tests/unit_tests/skills/test_skill_installer_scripts.py" in (
        pr_workflow
    )
    assert "--ignore=tests/unit_tests/sessions/test_session_auto_title.py" in (
        pr_workflow
    )
    assert "--ignore=tests/unit_tests/test_module_boundaries.py" in pr_workflow
    assert "--ignore=tests/unit_tests/agent_runtimes/test_provider.py" in pr_workflow
    assert 'RELAY_TEAMS_UNIT_TEST_TIMEOUT_SECONDS: "10"' in pr_workflow
    assert "agents-self-check-unit-parallel-coverage:" in pr_workflow
    assert "agents-self-check-unit-serial-coverage:" in pr_workflow
    assert "actions/upload-artifact@v4" in pr_workflow
    assert "actions/download-artifact@v4" in pr_workflow
    assert "unit-coverage-parallel" in pr_workflow
    assert "unit-coverage-serial" in pr_workflow
    assert "include-hidden-files: true" in pr_workflow
    assert "coverage combine .coverage-artifacts" in pr_workflow
    assert "Micro-benchmark gate" in pr_workflow
    assert "Spec-compliance changed-file gate" in pr_workflow
    assert "benchmarks/micro/" in pr_workflow
    assert "benchmarks.spec_compliance.checks" in pr_workflow
    assert "git diff -C1% origin/main...HEAD" in pr_workflow
    assert "python -m relay_teams.release.changed_line_unit_coverage" in pr_workflow
    assert "--coverage-file .coverage" in pr_workflow
    assert "--config-file pyproject.toml" in pr_workflow
    assert "--diff-file .tmp/diff-cover-copy-aware.diff" in pr_workflow


def test_pr_quality_gates_do_not_spawn_extra_pr_workflows() -> None:
    project_root = _project_root()
    micro_workflow = (
        project_root / ".github" / "workflows" / "benchmarks-micro.yml"
    ).read_text(encoding="utf-8")
    spec_workflow = (
        project_root / ".github" / "workflows" / "benchmarks-spec-compliance.yml"
    ).read_text(encoding="utf-8")

    assert "pull_request:" not in micro_workflow
    assert "pull_request:" not in spec_workflow
    assert "workflow_dispatch:" in micro_workflow
    assert "workflow_dispatch:" in spec_workflow
    assert "push:" in micro_workflow


def test_qodana_code_quality_workflow_uses_cloud_scan() -> None:
    project_root = _project_root()
    qodana_workflow = (
        project_root / ".github" / "workflows" / "code_quality.yml"
    ).read_text(encoding="utf-8")
    qodana_config = (project_root / "qodana.yaml").read_text(encoding="utf-8")

    assert "name: Qodana" in qodana_workflow
    assert "JetBrains/qodana-action" not in qodana_workflow
    assert "https://jb.gg/qodana-cli/install" in qodana_workflow
    assert (
        "qodana_args=(scan --within-docker false --print-problems)" in qodana_workflow
    )
    assert '--diff-start "$diff_start"' in qodana_workflow
    assert "--within-docker false" in qodana_workflow
    assert "QODANA_PYTHON_PATH" in qodana_workflow
    assert "uv pip install pip" in qodana_workflow
    assert "QODANA_TOKEN" in qodana_workflow
    assert 'QODANA_ENDPOINT: "https://qodana.cloud"' in qodana_workflow
    assert "fetch-depth: 0" in qodana_workflow
    assert 'qodana "${qodana_args[@]}"' in qodana_workflow
    assert "Qodana reported findings" not in qodana_workflow
    assert "|| true" not in qodana_workflow
    assert "linter: qodana-python-community" in qodana_config
    assert "failThreshold: 0" in qodana_config
    assert "failureConditions" not in qodana_config


def test_qodana_config_only_excludes_non_source_output_paths() -> None:
    qodana_config = (_project_root() / "qodana.yaml").read_text(encoding="utf-8")
    allowed_paths = {
        ".agent_teams",
        ".codex",
        ".pytest_cache",
        ".ruff_cache",
        ".tmp",
        ".venv",
        "docs",
        "frontend/dist",
        "openspec",
    }

    assert "exclude:" in qodana_config
    assert "name: All" in qodana_config
    for path in allowed_paths:
        assert f"- {path}" in qodana_config
    assert "src/relay_teams/" not in qodana_config
    assert "PyTypeHintsInspection" not in qodana_config
    assert "PyMethodMayBeStaticInspection" not in qodana_config
    assert "PyProtectedMemberInspection" not in qodana_config
    assert "PyInconsistentReturnsInspection" not in qodana_config


def test_agents_guidelines_forbid_qodana_source_excludes() -> None:
    agents_guidelines = (_project_root() / "AGENTS.md").read_text(encoding="utf-8")

    assert "Do not fix Qodana CI failures by adding source-file" in agents_guidelines
    assert "Only non-source generated/cache/output directories may be excluded" in (
        agents_guidelines
    )


def test_pptx_craft_package_metadata_preserves_esm_runtime_contract() -> None:
    package_json_path = (
        _project_root()
        / "src"
        / "relay_teams"
        / "builtin"
        / "skills"
        / "pptx-craft"
        / "package.json"
    )

    package_json = json.loads(package_json_path.read_text(encoding="utf-8"))

    assert package_json["type"] == "module"
    assert package_json["engines"]["node"] == ">=18.0.0"
