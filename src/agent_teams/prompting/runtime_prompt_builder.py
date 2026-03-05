# -*- coding: utf-8 -*-
from __future__ import annotations

from agent_teams.prompting.runtime import (
    RuntimePromptBuildInput,
    build_runtime_system_prompt,
)

PromptBuildInput = RuntimePromptBuildInput


class RuntimePromptBuilder:
    def build(self, data: PromptBuildInput) -> str:
        return build_runtime_system_prompt(data)
