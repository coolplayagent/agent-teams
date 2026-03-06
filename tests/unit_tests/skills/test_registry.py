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


def test_registry_from_skill_dirs_prefers_project_skill_over_user_skill(
    tmp_path: Path,
) -> None:
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

    registry = SkillRegistry.from_skill_dirs(
        project_skills_dir=tmp_path / "project" / ".agent_teams" / "skills",
        user_skills_dir=tmp_path / "user" / ".agent_teams" / "skills",
    )

    skill = registry.get_skill_definition("time")
    entries = registry.get_instruction_entries(("time",))

    assert skill is not None
    assert skill.scope == SkillScope.PROJECT
    assert skill.metadata.description == "project timezone helper"
    assert entries[0].instructions == "Use UTC for all project timestamps."


def test_registry_from_skill_dirs_loads_user_skill_when_project_skill_missing(
    tmp_path: Path,
) -> None:
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

    registry = SkillRegistry.from_skill_dirs(
        project_skills_dir=tmp_path / "project" / ".agent_teams" / "skills",
        user_skills_dir=tmp_path / "user" / ".agent_teams" / "skills",
    )

    skill = registry.get_skill_definition("time")

    assert skill is not None
    assert skill.scope == SkillScope.USER
    assert registry.list_names() == ("time",)


def test_registry_from_config_dirs_merges_user_and_project_skills(
    tmp_path: Path,
) -> None:
    project_config_dir = tmp_path / "project" / ".agent_teams"
    user_home_dir = tmp_path / "user"

    _write_skill(
        user_home_dir / ".agent_teams" / "skills" / "shared",
        name="shared",
        description="user shared skill",
        instructions="User instructions.",
    )
    _write_skill(
        user_home_dir / ".agent_teams" / "skills" / "user_only",
        name="user_only",
        description="user only skill",
        instructions="User only instructions.",
    )
    _write_skill(
        project_config_dir / "skills" / "shared",
        name="shared",
        description="project shared skill",
        instructions="Project instructions.",
    )
    _write_skill(
        project_config_dir / "skills" / "project_only",
        name="project_only",
        description="project only skill",
        instructions="Project only instructions.",
    )

    registry = SkillRegistry.from_config_dirs(
        project_config_dir=project_config_dir,
        user_home_dir=user_home_dir,
    )

    skills = registry.list_skill_definitions()
    shared_skill = registry.get_skill_definition("shared")
    user_only_skill = registry.get_skill_definition("user_only")

    assert tuple(skill.metadata.name for skill in skills) == (
        "project_only",
        "shared",
        "user_only",
    )
    assert shared_skill is not None
    assert shared_skill.scope == SkillScope.PROJECT
    assert user_only_skill is not None
    assert user_only_skill.scope == SkillScope.USER


def test_registry_from_config_dirs_creates_project_skills_directory(
    tmp_path: Path,
) -> None:
    project_config_dir = tmp_path / "project" / ".agent_teams"

    registry = SkillRegistry.from_config_dirs(project_config_dir=project_config_dir)

    assert (project_config_dir / "skills").is_dir()
    assert registry.list_skill_definitions() == ()


def _write_skill(
    skill_dir: Path, *, name: str, description: str, instructions: str
) -> None:
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n{instructions}\n",
        encoding="utf-8",
    )
