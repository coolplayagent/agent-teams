# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import pytest
from pydantic_ai.exceptions import ModelHTTPError

from relay_teams.agents.execution.failure_reporting import (
    AssistantRunErrorRaiser,
    FailureHandlingService,
    FailureMessageRepository,
)
from relay_teams.agents.execution.recovery_flow import (
    FallbackAttemptState,
    FallbackAttemptStatus,
)
from relay_teams.providers.llm_retry import LlmRetryErrorInfo
from relay_teams.providers.model_config import LlmRetryConfig, ModelEndpointConfig
from relay_teams.providers.model_fallback import LlmFallbackDecision
from relay_teams.sessions.runs.enums import RunEventType
from relay_teams.sessions.runs.run_models import RunEvent

from .agent_llm_session_test_support import ModelResponse, _build_request


class _BodyError(Exception):
    def __init__(self, message: str, *, body: object) -> None:
        super().__init__(message)
        self.body = body


class _RunEventHub:
    def __init__(self) -> None:
        self.events: list[RunEvent] = []

    def publish(self, event: RunEvent) -> int:
        self.events.append(event)
        return len(self.events)

    async def publish_async(self, event: RunEvent) -> int:
        self.events.append(event)
        return len(self.events)


class _FailureMessageRepository(FailureMessageRepository):
    pass


class _AssistantRunErrorRaiser(AssistantRunErrorRaiser):
    pass


def test_build_model_api_error_message_preserves_proxy_block_body() -> None:
    body = (
        "<!DOCTYPE html>\n"
        '<html><head><meta name="keywords" content="SWG,Proxy,NetentSec" />'
        "<title>HIS Proxy</title></head><body>blocked</body></html>"
    )
    service = object.__new__(FailureHandlingService)

    message = FailureHandlingService.build_model_api_error_message(
        service,
        ModelHTTPError(
            status_code=403,
            model_name="deepseek-v4-flash",
            body=body,
        ),
    )

    assert "blocked by an enterprise proxy" in message
    assert "status_code: 403" in message
    assert "model_name: deepseek-v4-flash" in message
    assert body in message


def test_enterprise_proxy_block_detection_scans_bytes_body() -> None:
    chain = (
        _BodyError(
            "Forbidden",
            body=b'<html><head><meta name="keywords" content="SWG,Proxy" />',
        ),
    )

    assert FailureHandlingService.is_enterprise_proxy_block_failure(chain) is True


def test_enterprise_proxy_block_detection_scans_object_body() -> None:
    chain = (
        _BodyError(
            "Forbidden",
            body={"title": "ProxyControlWarn", "message": "blocked"},
        ),
    )

    assert FailureHandlingService.is_enterprise_proxy_block_failure(chain) is True


def test_enterprise_proxy_block_detection_does_not_match_this_proxy_text() -> None:
    chain = (
        _BodyError(
            "Temporary failure",
            body="this proxy path returned a transient upstream error",
        ),
    )

    assert FailureHandlingService.is_enterprise_proxy_block_failure(chain) is False


def test_raw_error_body_text_serializes_bytes_and_objects() -> None:
    assert FailureHandlingService.raw_error_body_text(b"blocked") == "blocked"
    assert (
        FailureHandlingService.raw_error_body_text({"message": "blocked"})
        == '{"message": "blocked"}'
    )


@pytest.mark.asyncio
async def test_protocol_default_methods_are_explicit_noops() -> None:
    repo = _FailureMessageRepository()
    await repo.prune_conversation_history_to_safe_boundary_async("conv-1")
    await repo.append_async(
        session_id="session-1",
        workspace_id="workspace-1",
        conversation_id="conv-1",
        agent_role_id="writer",
        instance_id="inst-1",
        task_id="task-1",
        trace_id="trace-1",
        messages=cast(list[ModelResponse], []),
    )
    raiser = _AssistantRunErrorRaiser()
    await raiser(
        request=_build_request(),
        error_code=None,
        error_message=None,
    )


@pytest.mark.asyncio
async def test_async_fallback_and_retry_handlers_publish_run_events() -> None:
    hub = _RunEventHub()
    primary_config = ModelEndpointConfig(
        model="primary-model",
        base_url="https://example.test/v1",
        api_key="primary-key",
    )
    fallback_config = ModelEndpointConfig(
        model="fallback-model",
        base_url="https://fallback.test/v1",
        api_key="fallback-key",
    )
    service = FailureHandlingService(
        config=primary_config,
        profile_name="primary",
        retry_config=LlmRetryConfig(max_retries=1),
        message_repo=cast(FailureMessageRepository, object()),
        run_event_hub=hub,
    )
    decision = LlmFallbackDecision(
        policy_id="policy-1",
        from_profile_name="primary",
        to_profile_name="secondary",
        from_provider=primary_config.provider,
        to_provider=fallback_config.provider,
        from_model=primary_config.model,
        to_model=fallback_config.model,
        hop=1,
        reason="rate_limited",
        cooldown_until=datetime.now(UTC),
        target_config=fallback_config,
    )
    retry_error = LlmRetryErrorInfo(
        message="slow down",
        status_code=429,
        error_code="rate_limited",
        retryable=True,
        rate_limited=True,
    )

    await service.handle_fallback_activated_async(
        request=_build_request(),
        retry_number=1,
        total_attempts=2,
        decision=decision,
    )
    await service.handle_fallback_exhausted_async(
        request=_build_request(),
        retry_number=1,
        total_attempts=2,
        error=retry_error,
        fallback_state=FallbackAttemptState.initial("primary"),
    )
    await service.handle_retry_exhausted_async(
        request=_build_request(),
        retry_number=1,
        total_attempts=2,
        error=retry_error,
    )

    assert [event.event_type for event in hub.events] == [
        RunEventType.LLM_FALLBACK_ACTIVATED,
        RunEventType.LLM_FALLBACK_EXHAUSTED,
        RunEventType.LLM_RETRY_EXHAUSTED,
    ]


@pytest.mark.asyncio
async def test_async_run_event_publish_is_noop_without_hub() -> None:
    service = FailureHandlingService(
        config=ModelEndpointConfig(
            model="primary-model",
            base_url="https://example.test/v1",
            api_key="primary-key",
        ),
        profile_name=None,
        retry_config=LlmRetryConfig(max_retries=1),
        message_repo=cast(FailureMessageRepository, object()),
        run_event_hub=None,
    )

    await service._publish_run_event_async(
        request=_build_request(),
        event_type=RunEventType.LLM_RETRY_EXHAUSTED,
        payload={},
    )


@pytest.mark.asyncio
async def test_terminal_generic_failure_without_retry_raises_assistant_error() -> None:
    service = FailureHandlingService(
        config=ModelEndpointConfig(
            model="primary-model",
            base_url="https://example.test/v1",
            api_key="primary-key",
        ),
        profile_name=None,
        retry_config=LlmRetryConfig(max_retries=1),
        message_repo=cast(FailureMessageRepository, object()),
        run_event_hub=None,
    )
    raised_errors: list[dict[str, object]] = []

    async def _handle_retry_exhausted(**kwargs: object) -> None:
        raise AssertionError(f"unexpected retry exhaustion: {kwargs!r}")

    async def _raise_assistant_run_error(**kwargs: object) -> None:
        raised_errors.append(kwargs)
        raise RuntimeError("terminal")

    with pytest.raises(RuntimeError, match="terminal"):
        await service.raise_terminal_generic_failure(
            request=_build_request(),
            error=RuntimeError("boom"),
            retry_error=None,
            retry_number=0,
            total_attempts=1,
            fallback_status=FallbackAttemptStatus.SKIPPED,
            log_provider_request_failed=lambda **kwargs: None,
            handle_retry_exhausted=_handle_retry_exhausted,
            raise_assistant_run_error=_raise_assistant_run_error,
        )

    assert len(raised_errors) == 1
    assert raised_errors[0]["error_code"] == "internal_execution_error"
