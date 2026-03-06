# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from agent_teams.skills import discovery
from agent_teams.skills.discovery import SkillsDirectory


def test_get_user_skills_dir_uses_user_config_dir_when_home_not_provided(
    monkeypatch,
) -> None:
    user_config_dir = Path("D:/home/.agent_teams").resolve()
    monkeypatch.setattr(
        discovery,
        "get_user_config_dir",
        lambda **kwargs: user_config_dir,
    )

    skills_dir = discovery.get_user_skills_dir()

    assert skills_dir == user_config_dir / "skills"


def test_get_user_skills_dir_uses_user_home_override(monkeypatch) -> None:
    user_home_dir = Path("D:/home").resolve()

    def fake_get_user_config_dir(*, user_home_dir: Path | None = None) -> Path:
        assert user_home_dir is not None
        return user_home_dir / ".agent_teams"

    monkeypatch.setattr(discovery, "get_user_config_dir", fake_get_user_config_dir)

    skills_dir = discovery.get_user_skills_dir(user_home_dir=user_home_dir)

    assert skills_dir == user_home_dir / ".agent_teams" / "skills"


def test_get_project_skills_dir_uses_project_config_dir_when_root_not_provided(
    monkeypatch,
) -> None:
    project_config_dir = Path("D:/repo-root/.agent_teams").resolve()
    monkeypatch.setattr(
        discovery,
        "get_project_config_dir",
        lambda **kwargs: project_config_dir,
    )

    skills_dir = discovery.get_project_skills_dir()

    assert skills_dir == project_config_dir / "skills"


def test_get_project_skills_dir_uses_project_root_override(monkeypatch) -> None:
    project_root = Path("D:/repo-root").resolve()

    def fake_get_project_config_dir(*, project_root: Path | None = None) -> Path:
        assert project_root is not None
        return project_root / ".agent_teams"

    monkeypatch.setattr(
        discovery,
        "get_project_config_dir",
        fake_get_project_config_dir,
    )

    skills_dir = discovery.get_project_skills_dir(project_root=project_root)

    assert skills_dir == project_root / ".agent_teams" / "skills"


def test_skills_directory_from_skill_dirs_creates_project_directory(
    tmp_path: Path,
) -> None:
    project_skills_dir = tmp_path / "project" / ".agent_teams" / "skills"
    user_skills_dir = tmp_path / "user" / ".agent_teams" / "skills"

    directory = SkillsDirectory.from_skill_dirs(
        project_skills_dir=project_skills_dir,
        user_skills_dir=user_skills_dir,
    )

    assert project_skills_dir.is_dir()
    assert directory.base_dir == project_skills_dir.resolve()
    assert directory.fallback_dirs == (user_skills_dir.resolve(),)


def test_skills_directory_from_config_dirs_uses_user_and_project_scopes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    project_config_dir = tmp_path / "project" / ".agent_teams"
    user_skills_dir = tmp_path / "user" / ".agent_teams" / "skills"
    monkeypatch.setattr(
        discovery,
        "get_user_skills_dir",
        lambda **kwargs: user_skills_dir,
    )

    directory = SkillsDirectory.from_config_dirs(project_config_dir=project_config_dir)

    assert directory.base_dir == (project_config_dir / "skills").resolve()
    assert directory.fallback_dirs == (user_skills_dir.resolve(),)


def test_skills_directory_from_default_scopes_uses_resolved_scope_dirs(
    monkeypatch,
) -> None:
    project_skills_dir = Path("D:/repo-root/.agent_teams/skills").resolve()
    user_skills_dir = Path("D:/home/.agent_teams/skills").resolve()
    monkeypatch.setattr(
        discovery,
        "get_project_skills_dir",
        lambda **kwargs: project_skills_dir,
    )
    monkeypatch.setattr(
        discovery,
        "get_user_skills_dir",
        lambda **kwargs: user_skills_dir,
    )

    directory = SkillsDirectory.from_default_scopes()

    assert directory.base_dir == project_skills_dir
    assert directory.fallback_dirs == (user_skills_dir,)
