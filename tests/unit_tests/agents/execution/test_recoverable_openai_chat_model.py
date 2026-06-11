# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from typing import cast

import httpx
import pytest
from openai.types import chat

from relay_teams.agents.execution.recoverable_openai_chat_model import (
    RecoverableOpenAIChatModel,
    _call_map_messages_with_settings,
    _map_messages_accepts_model_settings,
)
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings


def test_map_tool_call_keeps_valid_json_arguments() -> None:
    tool_call = ToolCallPart(
        tool_name="write",
        args='{"content":"hello","path":"demo.txt"}',
        tool_call_id="call-valid",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    assert mapped["function"]["arguments"] == '{"content":"hello","path":"demo.txt"}'


def test_map_tool_call_keeps_valid_json_arguments_with_null_fields() -> None:
    tool_call = ToolCallPart(
        tool_name="shell",
        args='{"command":"pwd","background":true,"yield_time_ms":null}',
        tool_call_id="call-valid-null",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    assert mapped["function"]["arguments"] == (
        '{"command":"pwd","background":true,"yield_time_ms":null}'
    )


def test_map_tool_call_repairs_invalid_json_arguments_for_replay() -> None:
    tool_call = ToolCallPart(
        tool_name="write",
        args='{"content":"hello", path:"demo.txt"}',
        tool_call_id="call-invalid",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    parsed = json.loads(mapped["function"]["arguments"])
    assert parsed == {"content": "hello", "path": "demo.txt"}


def test_map_tool_call_repairs_invalid_string_escape_arguments_for_replay() -> None:
    tool_call = ToolCallPart(
        tool_name="shell",
        args=('{"command":"python -c \\"print(\\\'hello\\\')\\"","background":true}'),
        tool_call_id="call-invalid-escape",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    parsed = json.loads(mapped["function"]["arguments"])
    assert parsed == {
        "command": "python -c \"print('hello')\"",
        "background": True,
    }


def test_map_tool_call_wraps_non_object_json_arguments_for_replay() -> None:
    tool_call = ToolCallPart(
        tool_name="write",
        args='["not","an","object"]',
        tool_call_id="call-array",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    parsed = json.loads(mapped["function"]["arguments"])
    assert parsed == {"INVALID_JSON": '["not","an","object"]'}


def test_map_tool_call_wraps_unrepairable_invalid_json_arguments_for_replay() -> None:
    tool_call = ToolCallPart(
        tool_name="write",
        args="not-json-at-all",
        tool_call_id="call-text",
    )

    mapped = RecoverableOpenAIChatModel._map_tool_call(tool_call)

    parsed = json.loads(mapped["function"]["arguments"])
    assert parsed == {"INVALID_JSON": "not-json-at-all"}


def test_sanitize_replayed_messages_drops_orphan_tool_results() -> None:
    messages = [
        ModelRequest(parts=[UserPromptPart(content="continue")]),
        ModelRequest(
            parts=[
                ToolReturnPart(
                    tool_name="write",
                    tool_call_id="call-missing",
                    content={"ok": False},
                )
            ]
        ),
        ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name="write",
                    args={"content": "hello"},
                    tool_call_id="call-real",
                )
            ]
        ),
    ]

    sanitized = RecoverableOpenAIChatModel._sanitize_replayed_messages(messages)

    assert len(sanitized) == 2
    assert isinstance(sanitized[0], ModelRequest)
    assert isinstance(sanitized[1], ModelResponse)


def test_sanitize_replayed_messages_drops_duplicate_late_tool_results() -> None:
    messages = [
        ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name="write",
                    args={"content": "hello"},
                    tool_call_id="call-real",
                )
            ]
        ),
        ModelRequest(
            parts=[
                ToolReturnPart(
                    tool_name="write",
                    tool_call_id="call-real",
                    content={"ok": True},
                )
            ]
        ),
        ModelRequest(
            parts=[
                ToolReturnPart(
                    tool_name="write",
                    tool_call_id="call-real",
                    content={"ok": True},
                ),
                UserPromptPart(content="optimize it"),
            ]
        ),
    ]

    sanitized = RecoverableOpenAIChatModel._sanitize_replayed_messages(messages)

    assert len(sanitized) == 3
    assert isinstance(sanitized[2], ModelRequest)
    assert len(sanitized[2].parts) == 1
    assert isinstance(sanitized[2].parts[0], UserPromptPart)
    assert sanitized[2].parts[0].content == "optimize it"


def test_sanitize_replayed_messages_keeps_thinking_only_response() -> None:
    messages = [
        ModelRequest(parts=[UserPromptPart(content="continue")]),
        ModelResponse(parts=[ThinkingPart(content="internal notes")]),
        ModelResponse(
            parts=[ToolCallPart(tool_name="write", args={}, tool_call_id="call-1")]
        ),
    ]

    sanitized = RecoverableOpenAIChatModel._sanitize_replayed_messages(messages)

    assert len(sanitized) == 3
    assert isinstance(sanitized[0], ModelRequest)
    assert isinstance(sanitized[1], ModelResponse)
    assert isinstance(sanitized[1].parts[0], ThinkingPart)
    assert isinstance(sanitized[2], ModelResponse)
    assert isinstance(sanitized[2].parts[0], ToolCallPart)


def test_map_messages_accepts_model_settings_detects_optional_keyword() -> None:
    async def map_messages_with_settings(
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        *,
        model_settings: ModelSettings | None = None,
    ) -> list[chat.ChatCompletionMessageParam]:
        del messages, model_request_parameters, model_settings
        return []

    async def map_messages_without_settings(
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
    ) -> list[chat.ChatCompletionMessageParam]:
        del messages, model_request_parameters
        return []

    assert _map_messages_accepts_model_settings(map_messages_with_settings)
    assert not _map_messages_accepts_model_settings(map_messages_without_settings)


@pytest.mark.asyncio
async def test_call_map_messages_with_settings_forwards_settings() -> None:
    seen_model_settings: ModelSettings | None = None
    user_message = cast(
        chat.ChatCompletionMessageParam,
        {"role": "user", "content": "ok"},
    )

    async def map_messages(
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        *,
        model_settings: ModelSettings | None = None,
    ) -> list[chat.ChatCompletionMessageParam]:
        nonlocal seen_model_settings
        del messages, model_request_parameters
        seen_model_settings = model_settings
        return [user_message]

    settings: ModelSettings = {"temperature": 0.2}

    mapped = await _call_map_messages_with_settings(
        map_messages,
        [],
        ModelRequestParameters(),
        settings,
    )

    assert mapped == [user_message]
    assert seen_model_settings == settings


@pytest.mark.asyncio
async def test_map_messages_uses_model_settings_branch_when_supported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assistant_message = cast(
        chat.ChatCompletionMessageParam,
        {"role": "assistant", "content": None},
    )
    seen_model_settings: ModelSettings | None = None

    def accepts_model_settings(
        map_messages: Callable[..., object],
    ) -> bool:
        del map_messages
        return True

    async def call_with_settings(
        map_messages: Callable[..., object],
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        model_settings: ModelSettings | None,
    ) -> list[chat.ChatCompletionMessageParam]:
        nonlocal seen_model_settings
        del map_messages, messages, model_request_parameters
        seen_model_settings = model_settings
        return [assistant_message]

    monkeypatch.setattr(
        "relay_teams.agents.execution.recoverable_openai_chat_model."
        "_map_messages_accepts_model_settings",
        accepts_model_settings,
    )
    monkeypatch.setattr(
        "relay_teams.agents.execution.recoverable_openai_chat_model."
        "_call_map_messages_with_settings",
        call_with_settings,
    )
    http_client = httpx.AsyncClient(trust_env=False)
    try:
        model = RecoverableOpenAIChatModel(
            "gpt-5.4",
            provider=OpenAIProvider(
                base_url="https://example.test/v1",
                api_key="test",
                http_client=http_client,
            ),
        )
        settings: ModelSettings = {"temperature": 0.2}

        mapped = await model._map_messages(
            [ModelRequest(parts=[UserPromptPart(content="continue")])],
            ModelRequestParameters(),
            model_settings=settings,
        )
    finally:
        await http_client.aclose()

    assert seen_model_settings == settings
    assert mapped == [{"role": "assistant", "content": ""}]


@pytest.mark.asyncio
async def test_map_messages_replays_deepseek_reasoning_content() -> None:
    http_client = httpx.AsyncClient(trust_env=False)
    try:
        model = RecoverableOpenAIChatModel(
            "deepseek-v4-pro",
            provider=OpenAIProvider(
                base_url="https://api.deepseek.example/v1",
                api_key="test",
                http_client=http_client,
            ),
        )
        messages = [
            ModelRequest(parts=[UserPromptPart(content="continue")]),
            ModelResponse(
                parts=[
                    ThinkingPart(
                        id="reasoning_content",
                        content="internal notes",
                        provider_name=model.system,
                    )
                ]
            ),
        ]

        model_settings: ModelSettings = {"temperature": 0.2}
        mapped = await model._map_messages(
            messages,
            ModelRequestParameters(),
            model_settings=model_settings,
        )
    finally:
        await http_client.aclose()

    assistant_messages = [
        message
        for message in mapped
        if isinstance(message, dict) and message.get("role") == "assistant"
    ]
    assert len(assistant_messages) == 1
    assert assistant_messages[0].get("reasoning_content") == "internal notes"
    assert assistant_messages[0].get("content") == ""


@pytest.mark.asyncio
async def test_map_messages_keeps_system_message_when_replay_sanitizes_history() -> (
    None
):
    http_client = httpx.AsyncClient(trust_env=False)
    try:
        model = RecoverableOpenAIChatModel(
            "gpt-5.4",
            provider=OpenAIProvider(
                base_url="https://example.test/v1",
                api_key="test",
                http_client=http_client,
            ),
        )
        messages = [
            ModelRequest(
                parts=[UserPromptPart(content="你能使用哪些技能")],
                instructions="System instructions",
            ),
            ModelRequest(
                parts=[
                    ToolReturnPart(
                        tool_name="write",
                        tool_call_id="call-missing",
                        content={"ok": False},
                    )
                ]
            ),
        ]

        mapped = await model._map_messages(messages, ModelRequestParameters())
    finally:
        await http_client.aclose()

    system_messages = [
        message
        for message in mapped
        if isinstance(message, dict) and message.get("role") == "system"
    ]
    assert len(system_messages) == 1
    assert system_messages[0].get("content") == "System instructions"
