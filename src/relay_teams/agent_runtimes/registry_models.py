# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from relay_teams.agent_runtimes.models import ExternalAgentConfig
from relay_teams.validation import RequiredIdentifierStr


class AcpRegistryDistribution(StrEnum):
    AUTO = "auto"
    BINARY = "binary"
    NPX = "npx"
    UVX = "uvx"


class AcpRegistryBinaryTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    archive: str = Field(min_length=1)
    cmd: str = Field(min_length=1)
    args: tuple[str, ...] = ()
    env: dict[str, str] = Field(default_factory=dict)
    sha256: str | None = None


class AcpRegistryPackageDistribution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    package: str = Field(min_length=1)
    args: tuple[str, ...] = ()
    env: dict[str, str] = Field(default_factory=dict)


class AcpRegistryDistributionSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    binary: dict[str, AcpRegistryBinaryTarget] = Field(default_factory=dict)
    npx: AcpRegistryPackageDistribution | None = None
    uvx: AcpRegistryPackageDistribution | None = None


class AcpRegistryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: RequiredIdentifierStr
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    description: str = ""
    repository: str | None = None
    website: str | None = None
    authors: tuple[str, ...] = ()
    license: str | None = None
    icon: str | None = None
    distribution: AcpRegistryDistributionSet


class AcpRegistryIndex(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1)
    agents: tuple[AcpRegistryEntry, ...] = ()
    extensions: tuple[JsonValue, ...] = ()


class AcpRegistryAgentView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_id: RequiredIdentifierStr
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    description: str = ""
    repository: str | None = None
    website: str | None = None
    authors: tuple[str, ...] = ()
    license: str | None = None
    icon: str | None = None
    distributions: tuple[AcpRegistryDistribution, ...]
    selected_distribution: AcpRegistryDistribution | None = None
    supports_current_platform: bool = False
    installed: bool = False
    installed_agent_id: str | None = None
    installed_version: str | None = None
    update_available: bool = False


class AcpRegistryCatalogResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_url: str = ""
    registry_version: str = ""
    agents: tuple[AcpRegistryAgentView, ...] = ()
    fetched_at: datetime | None = None
    cache_path: str
    stale: bool = False
    error_message: str | None = None


class AcpRegistryInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: RequiredIdentifierStr | None = None
    distribution: AcpRegistryDistribution | None = None
    env: dict[str, str] | None = None


class AcpRegistryInstallResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(min_length=1)
    agent: ExternalAgentConfig
    registry_agent: AcpRegistryAgentView
    message: str = Field(min_length=1)
    installed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AcpRegistryResolvedRuntime(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_id: RequiredIdentifierStr
    distribution: AcpRegistryDistribution
    command: str = Field(min_length=1)
    args: tuple[str, ...] = ()
    env: dict[str, str] = Field(default_factory=dict)
