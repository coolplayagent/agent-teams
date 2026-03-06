# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from agent_teams.interfaces.cli import app as cli_app
from agent_teams.skills.discovery import SkillsDirectory
from agent_teams.skills.registry import SkillRegistry

runner = CliRunner()


def test_skills_list_prefers_project_skill_in_json_output(
    tmp_path: Path, monkeypatch
) -> None:
    registry = _build_registry(tmp_path)
    monkeypatch.setattr("agent_teams.skills.cli.load_skill_registry", lambda: registry)

    result = runner.invoke(cli_app.app, ["skills", "list", "--format", "json"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload == [
        {
            "name": "project_only",
            "source": "project",
            "directory": str(
                tmp_path / "project" / ".agent_teams" / "skills" / "project_only"
            ),
            "description": "project only skill",
        },
        {
            "name": "shared",
            "source": "project",
            "directory": str(
                tmp_path / "project" / ".agent_teams" / "skills" / "shared"
            ),
            "description": "project shared skill",
        },
        {
            "name": "user_only",
            "source": "user",
            "directory": str(
                tmp_path / "user" / ".agent_teams" / "skills" / "user_only"
            ),
            "description": "user only skill",
        },
    ]


def test_skills_show_returns_effective_skill_details(
    tmp_path: Path, monkeypatch
) -> None:
    registry = _build_registry(tmp_path)
    monkeypatch.setattr("agent_teams.skills.cli.load_skill_registry", lambda: registry)

    result = runner.invoke(
        cli_app.app, ["skills", "show", "shared", "--format", "json"]
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["name"] == "shared"
    assert payload["source"] == "project"
    assert payload["description"] == "project shared skill"
    assert payload["instructions"] == "Project instructions."


def test_skills_list_table_output_is_rendered(tmp_path: Path, monkeypatch) -> None:
    registry = _build_registry(tmp_path)
    monkeypatch.setattr("agent_teams.skills.cli.load_skill_registry", lambda: registry)

    result = runner.invoke(cli_app.app, ["skills", "list"])

    assert result.exit_code == 0
    assert result.output.startswith("Skills (3 total)")
    assert "| Name" in result.output
    assert "shared" in result.output
    assert "project" in result.output


def test_skills_help_explains_merge_order() -> None:
    result = runner.invoke(cli_app.app, ["skills", "--help"])

    assert result.exit_code == 0
    assert (
        "Inspect skills discovered from both user and project directories."
        in result.output
    )
    assert "~/.agent_teams/skills" in result.output
    assert ".agent_teams/skills (project scope, overrides user skills" in result.output
    assert "agent-teams skills show time" in result.output


def test_skills_list_help_includes_examples_and_source_behavior() -> None:
    result = runner.invoke(cli_app.app, ["skills", "list", "--help"])

    assert result.exit_code == 0
    assert (
        "List effective skills after merging user and project scopes." in result.output
    )
    assert (
        "If the same skill exists in both places, the project copy is shown."
        in result.output
    )
    assert "--source" in result.output
    assert "agent-teams skills list --source user" in result.output


def test_skills_show_help_describes_effective_skill_resolution() -> None:
    result = runner.invoke(cli_app.app, ["skills", "show", "--help"])

    assert result.exit_code == 0
    assert "Show the effective definition for a single skill." in result.output
    assert "skill shadows a user skill with the same name" in result.output
    assert "Skill name to inspect after scope merge and override" in result.output
    assert "agent-teams skills show time --format json" in result.output


def _build_registry(tmp_path: Path) -> SkillRegistry:
    user_skills_dir = tmp_path / "user" / ".agent_teams" / "skills"
    project_skills_dir = tmp_path / "project" / ".agent_teams" / "skills"

    _write_skill(
        user_skills_dir / "shared",
        name="shared",
        description="user shared skill",
        instructions="User instructions.",
    )
    _write_skill(
        user_skills_dir / "user_only",
        name="user_only",
        description="user only skill",
        instructions="User only instructions.",
    )
    _write_skill(
        project_skills_dir / "shared",
        name="shared",
        description="project shared skill",
        instructions="Project instructions.",
    )
    _write_skill(
        project_skills_dir / "project_only",
        name="project_only",
        description="project only skill",
        instructions="Project only instructions.",
    )

    return SkillRegistry(
        directory=SkillsDirectory(
            base_dir=project_skills_dir,
            fallback_dirs=(user_skills_dir,),
        )
    )


def _write_skill(
    skill_dir: Path, *, name: str, description: str, instructions: str
) -> None:
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n{instructions}\n",
        encoding="utf-8",
    )
