# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from agent_teams.roles.registry import RoleRegistry
from agent_teams.skills.registry import SkillRegistry


class SkillsConfigReloadService:
    def __init__(
        self,
        *,
        config_dir: Path,
        role_registry: RoleRegistry,
        on_skill_reloaded: Callable[[SkillRegistry], None],
    ) -> None:
        self._config_dir: Path = config_dir
        self._role_registry: RoleRegistry = role_registry
        self._on_skill_reloaded: Callable[[SkillRegistry], None] = on_skill_reloaded

    def reload_skills_config(self) -> None:
        skill_registry = SkillRegistry.from_config_dirs(
            project_config_dir=self._config_dir
        )
        for role in self._role_registry.list_roles():
            skill_registry.validate_known(role.skills)
        self._on_skill_reloaded(skill_registry)
