# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from agent_teams.interfaces.server import config_paths


def test_get_config_dir_uses_default_when_env_not_set(monkeypatch) -> None:
    default_root = Path("D:/repo-root").resolve()
    monkeypatch.setattr(config_paths, "get_project_root", lambda: default_root)
    monkeypatch.setattr(config_paths, "get_env_var", lambda *args, **kwargs: "")

    config_dir = config_paths.get_config_dir()

    assert config_dir == default_root / ".agent_teams"


def test_get_config_dir_prefers_env_override(monkeypatch) -> None:
    override_dir = Path("D:/tmp/custom-config").resolve()
    monkeypatch.setattr(
        config_paths, "get_env_var", lambda *args, **kwargs: str(override_dir)
    )

    config_dir = config_paths.get_config_dir()

    assert config_dir == override_dir
