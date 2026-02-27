from __future__ import annotations

from dataclasses import dataclass

from agent_teams.core.models import ModelEndpointConfig


@dataclass(frozen=True)
class LLMRequest:
    system_prompt: str
    user_prompt: str


class LLMProvider:
    def generate(self, request: LLMRequest) -> str:
        raise NotImplementedError


class EchoProvider(LLMProvider):
    def generate(self, request: LLMRequest) -> str:
        return f'ECHO: {request.user_prompt}'


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, config: ModelEndpointConfig) -> None:
        self._config = config

    def generate(self, request: LLMRequest) -> str:
        # Network calls are environment-dependent; keep deterministic local fallback for MVP.
        return f'MODEL({self._config.model}): {request.user_prompt}'
