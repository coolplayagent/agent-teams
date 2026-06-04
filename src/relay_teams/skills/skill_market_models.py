# -*- coding: utf-8 -*-
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from relay_teams.skills.skill_models import SkillSource
from relay_teams.validation import RequiredIdentifierStr

_CLAWHUB_SKILL_SLUG_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"


class ClawHubSkillMarketSearchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(min_length=1)
    title: str = ""
    version: str | None = None
    score: float | None = None
    installed: bool = False


class ClawHubSkillMarketSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    query: str
    items: tuple[ClawHubSkillMarketSearchItem, ...] = ()
    error_message: str | None = None


class ClawHubSkillMarketInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: RequiredIdentifierStr = Field(pattern=_CLAWHUB_SKILL_SLUG_PATTERN)
    version: str | None = None
    force: bool = False


class ClawHubSkillMarketInstalledSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill_id: str
    runtime_name: str | None = None
    description: str = ""
    ref: str | None = None
    source: SkillSource = SkillSource.USER_RELAY_TEAMS
    directory: str
    manifest_path: str
    valid: bool = True
    error: str | None = None


class ClawHubSkillMarketInstallDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    binary_available: bool = False
    token_configured: bool = False
    installation_attempted: bool = False
    installed_during_install: bool = False
    registry: str | None = None
    endpoint_fallback_used: bool = False
    workdir: str | None = None
    skills_reloaded: bool = False


class ClawHubSkillMarketInstallResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    slug: str
    requested_version: str | None = None
    installed_skill: ClawHubSkillMarketInstalledSkill | None = None
    clawhub_path: str | None = None
    latency_ms: int = 0
    checked_at: str | None = None
    diagnostics: ClawHubSkillMarketInstallDiagnostics = Field(
        default_factory=ClawHubSkillMarketInstallDiagnostics
    )
    retryable: bool = False
    error_code: str | None = None
    error_message: str | None = None


class ClawHubSkillMarketUninstallResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    slug: str
    skills_reloaded: bool = False
    error_code: str | None = None
    error_message: str | None = None
