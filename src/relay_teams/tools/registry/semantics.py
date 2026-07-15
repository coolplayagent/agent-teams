# -*- coding: utf-8 -*-
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class ToolSemanticCategory(StrEnum):
    EXECUTION = "execution"
    FILE_EDIT = "file-edit"
    FILE_READ = "file-read"
    INTERACTIVE = "interactive"
    MEMORY_ARTIFACT = "memory-artifact"
    ORCHESTRATION = "orchestration"
    PLANNING = "planning"
    UNKNOWN = "unknown"
    WEB = "web"


class ToolActionFamily(StrEnum):
    EDIT = "edit"
    GENERIC = "generic"
    ORCHESTRATION = "orchestration"
    READ = "read"
    RUN = "run"
    SEARCH = "search"
    SUBAGENT = "subagent"


class ToolSemantics(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    semantic_category: ToolSemanticCategory = ToolSemanticCategory.UNKNOWN
    action_family: ToolActionFamily = ToolActionFamily.GENERIC


UNKNOWN_TOOL_SEMANTICS = ToolSemantics()
