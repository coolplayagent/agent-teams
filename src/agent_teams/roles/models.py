from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class RoleDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    tools: tuple[str, ...] = ()
    mcp_servers: tuple[str, ...] = ()
    skills: tuple[str, ...] = ()
    depends_on: tuple[str, ...] = ()
    model_profile: str = Field(default="default")
    system_prompt: str = Field(min_length=1)
