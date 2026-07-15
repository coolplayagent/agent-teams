# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio

import httpx
import pytest
from pydantic_ai.models.anthropic import AnthropicModel

from relay_teams.agents.execution.model_builder import (
    build_base_model_settings,
    build_provider_stream_contract,
    build_runtime_chat_model,
)
from relay_teams.providers.model_config import (
    ModelEndpointConfig,
    ProviderType,
    SamplingConfig,
)


def test_build_runtime_chat_model_supports_anthropic_provider() -> None:
    client = httpx.AsyncClient(trust_env=False)

    try:
        model = build_runtime_chat_model(
            config=ModelEndpointConfig(
                provider=ProviderType.ANTHROPIC,
                model="claude-sonnet-4-5",
                base_url="https://api.anthropic.com",
                api_key="anthropic-key",
            ),
            http_client=client,
        )
    finally:
        asyncio.run(client.aclose())

    assert isinstance(model, AnthropicModel)


def test_build_base_model_settings_supports_anthropic_provider() -> None:
    settings = build_base_model_settings(
        ModelEndpointConfig(
            provider=ProviderType.ANTHROPIC,
            model="claude-sonnet-4-5",
            base_url="https://api.anthropic.com",
            api_key="anthropic-key",
            sampling=SamplingConfig(
                temperature=0.4,
                top_p=0.8,
                max_tokens=1200,
            ),
        )
    )

    assert "temperature" not in settings
    assert "top_p" not in settings
    assert settings.get("max_tokens") == 1200


@pytest.mark.parametrize(
    ("provider", "requires_finish_reason"),
    [
        (ProviderType.OPENAI_COMPATIBLE, True),
        (ProviderType.BIGMODEL, True),
        (ProviderType.MINIMAX, True),
        (ProviderType.MAAS, True),
        (ProviderType.CODEAGENT, True),
        (ProviderType.ANTHROPIC, False),
    ],
)
def test_build_provider_stream_contract_uses_transport_protocol(
    provider: ProviderType,
    requires_finish_reason: bool,
) -> None:
    contract = build_provider_stream_contract(provider)

    assert contract.requires_finish_reason is requires_finish_reason
