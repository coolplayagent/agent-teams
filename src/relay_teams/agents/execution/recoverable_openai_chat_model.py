# -*- coding: utf-8 -*-
from __future__ import annotations

import inspect
import logging
from collections.abc import Callable, Sequence
from typing import Protocol, cast

from openai.types import chat
from openai.types.chat.chat_completion_message_function_tool_call_param import (
    ChatCompletionMessageFunctionToolCallParam,
)
from pydantic_ai._utils import guard_tool_call_id
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequestPart,
    ToolCallPart,
)
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.settings import ModelSettings

from relay_teams.logger import get_logger, log_event
from relay_teams.agents.execution.tool_call_history import normalize_replayed_messages
from relay_teams.agents.execution.tool_args_repair import repair_tool_args

LOGGER = get_logger(__name__)


class _OpenAIMapMessagesWithSettings(Protocol):
    async def __call__(
        self,
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        *,
        model_settings: ModelSettings | None = None,
    ) -> list[chat.ChatCompletionMessageParam]:
        raise NotImplementedError


def _map_messages_accepts_model_settings(
    map_messages: Callable[..., object],
) -> bool:
    return "model_settings" in inspect.signature(map_messages).parameters


async def _call_map_messages_with_settings(
    map_messages: Callable[..., object],
    messages: Sequence[ModelMessage],
    model_request_parameters: ModelRequestParameters,
    model_settings: ModelSettings | None,
) -> list[chat.ChatCompletionMessageParam]:
    typed_map_messages = cast(_OpenAIMapMessagesWithSettings, map_messages)
    return await typed_map_messages(
        messages,
        model_request_parameters,
        model_settings=model_settings,
    )


class RecoverableOpenAIChatModel(OpenAIChatModel):
    """OpenAI chat model that sanitizes malformed historical tool args on replay."""

    async def _map_messages(
        self,
        messages: Sequence[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        *,
        model_settings: ModelSettings | None = None,
    ) -> list[chat.ChatCompletionMessageParam]:
        sanitized_messages = self._sanitize_replayed_messages(messages)
        super_map_messages = super()._map_messages
        if _map_messages_accepts_model_settings(super_map_messages):
            mapped = await _call_map_messages_with_settings(
                super_map_messages,
                sanitized_messages,
                model_request_parameters,
                model_settings,
            )
        else:
            mapped = await super_map_messages(
                sanitized_messages,
                model_request_parameters,
            )
        for message in mapped:
            if not isinstance(message, dict):
                continue
            if message.get("role") != "assistant":
                continue
            if message.get("content") is None:
                message["content"] = ""
        return mapped

    @staticmethod
    def _map_tool_call(t: ToolCallPart) -> ChatCompletionMessageFunctionToolCallParam:
        repaired = repair_tool_args(t.args)
        if repaired.repair_applied or repaired.fallback_invalid_json:
            log_event(
                LOGGER,
                logging.WARNING,
                event="llm.tool_call_args.sanitized_for_replay",
                message="Sanitized malformed tool call arguments before replaying history",
                payload={
                    "tool_name": t.tool_name,
                    "tool_call_id": str(t.tool_call_id or ""),
                    "repair_applied": repaired.repair_applied,
                    "repair_succeeded": repaired.repair_succeeded,
                    "fallback_invalid_json": repaired.fallback_invalid_json,
                },
            )
        return ChatCompletionMessageFunctionToolCallParam(
            id=guard_tool_call_id(t=t),
            type="function",
            function={"name": t.tool_name, "arguments": repaired.arguments_json},
        )

    @classmethod
    def _sanitize_replayed_messages(
        cls,
        messages: Sequence[ModelMessage],
    ) -> list[ModelMessage]:
        return normalize_replayed_messages(
            messages,
            on_drop=cls._log_dropped_tool_result,
        )

    @staticmethod
    def _log_dropped_tool_result(part: ModelRequestPart, is_duplicate: bool) -> None:
        log_event(
            LOGGER,
            logging.WARNING,
            event=(
                "llm.tool_call_args.dropped_duplicate_tool_result"
                if is_duplicate
                else "llm.tool_call_args.dropped_orphan_tool_result"
            ),
            message=(
                "Dropped replayed duplicate tool result after the tool call was already closed"
                if is_duplicate
                else "Dropped replayed tool result without a matching tool call"
            ),
            payload={
                "tool_call_id": str(getattr(part, "tool_call_id", "") or ""),
                "tool_name": str(getattr(part, "tool_name", "") or ""),
            },
        )
