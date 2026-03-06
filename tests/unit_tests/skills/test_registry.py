# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from agent_teams.skills.discovery import SkillsDirectory
from agent_teams.skills.models import SkillScope
from agent_teams.skills.registry import SkillRegistry


def test_get_toolset_tools_builds_skill_tools_without_annotation_errors() -> None:
    registry = SkillRegistry(
        directory=SkillsDirectory(base_dir=Path(".agent_teams/skills"))
    )

    tools = registry.get_toolset_tools(("time",))

    names = {tool.name for tool in tools}
    assert names == {
        "list_skills",
        "load_skill",
        "read_skill_resource",
        "run_skill_script",
    }


def test_get_instruction_entries_returns_structured_data(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "time"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: time\n"
        "description: timezone helper\n"
        "---\n"
        "Use UTC for all timestamps.\n",
        encoding="utf-8",
    )
    registry = SkillRegistry(directory=SkillsDirectory(base_dir=tmp_path / "skills"))

    entries = registry.get_instruction_entries(("time",))

    assert len(entries) == 1
    assert entries[0].name == "time"
    assert entries[0].instructions == "Use UTC for all timestamps."


def test_project_skill_overrides_user_skill_with_same_name(tmp_path: Path) -> None:
    user_skill_dir = tmp_path / "user" / ".agent_teams" / "skills" / "time"
    project_skill_dir = tmp_path / "project" / ".agent_teams" / "skills" / "time"
    user_skill_dir.mkdir(parents=True)
    project_skill_dir.mkdir(parents=True)

    (user_skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: time\n"
        "description: user timezone helper\n"
        "---\n"
        "Use the user's default timezone.\n",
        encoding="utf-8",
    )
    (project_skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: time\n"
        "description: project timezone helper\n"
        "---\n"
        "Use UTC for all project timestamps.\n",
        encoding="utf-8",
    )

    registry = SkillRegistry(
        directory=SkillsDirectory(
            base_dir=tmp_path / "project" / ".agent_teams" / "skills",
            fallback_dirs=(tmp_path / "user" / ".agent_teams" / "skills",),
        )
    )

    skill = registry.get_skill_definition("time")
    entries = registry.get_instruction_entries(("time",))

    assert skill is not None
    assert skill.scope == SkillScope.PROJECT
    assert skill.metadata.description == "project timezone helper"
    assert entries[0].instructions == "Use UTC for all project timestamps."


def test_registry_loads_user_skill_when_project_skill_missing(tmp_path: Path) -> None:
    user_skill_dir = tmp_path / "user" / ".agent_teams" / "skills" / "time"
    user_skill_dir.mkdir(parents=True)
    (user_skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: time\n"
        "description: user timezone helper\n"
        "---\n"
        "Use the user's default timezone.\n",
        encoding="utf-8",
    )

    registry = SkillRegistry(
        directory=SkillsDirectory(
            base_dir=tmp_path / "project" / ".agent_teams" / "skills",
            fallback_dirs=(tmp_path / "user" / ".agent_teams" / "skills",),
        )
    )

    skill = registry.get_skill_definition("time")

    assert skill is not None
    assert skill.scope == SkillScope.USER
    assert registry.list_names() == ("time",)
