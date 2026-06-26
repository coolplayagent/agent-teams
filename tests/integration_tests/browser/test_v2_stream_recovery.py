from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
import re
import threading
import time
from typing import cast
from urllib.parse import parse_qs
from urllib.parse import unquote
from urllib.parse import urlsplit

from playwright.sync_api import Page
from playwright.sync_api import Request
from playwright.sync_api import Route
from playwright.sync_api import expect
from playwright.sync_api import sync_playwright
import pytest

from tests.integration_tests.browser._safe_http_server import (
    create_browser_safe_http_server,
)


_VIEWPORT_WIDTH = 1280
_VIEWPORT_HEIGHT = 860
_WAIT_TIMEOUT_MS = 15_000
_SESSION_ID = "session-v2-stream"
_ALT_SESSION_ID = "session-v2-alt"
_WORKSPACE_ID = "workspace-v2"
_RUN_ID = "run-v2-stream"
_PROMPT = "stream recovery probe"
_ALT_PROMPT = "alternate session prompt"
_FIRST_CHUNK = "first chunk "
_AFTER_RELOAD_CHUNK = "after reload"
_QUEUED_INJECTION = "queued follow-up"
_INTERRUPT_INJECTION = "interrupt now"
_RESUMED_CHUNK = "resumed chunk"
_APPROVAL_TOOL_CALL_ID = "call-v2-approval"
_APPROVAL_FEEDBACK = "Use the existing npm test command."
_QUESTION_ID = "question-v2-recovery"
_QUESTION_SUPPLEMENT = "Need release note"
_BACKGROUND_TASK_ID = "background-task-v2"
_BACKGROUND_COMMAND = "npm run watch"
_BACKGROUND_CWD = "C:/Users/yex/Documents/workspace/agent-teams"
_SUBAGENT_RUN_ID = "subagent-run-v2"
_MAIN_MULTIPLEX_CHUNK = "main multiplex chunk"
_SUBAGENT_MULTIPLEX_CHUNK = "subagent multiplex chunk"
_RICH_REPLAY_THINKING_PREFIX = "checking replay state"
_RICH_REPLAY_THINKING_SUFFIX = " after reconnect"
_RICH_REPLAY_TOOL_CALL_ID = "call-v2-rich-replay"
_RICH_REPLAY_TOOL_OUTPUT = "recovered tool output"
_RICH_REPLAY_OUTPUT_TEXT = "structured replay output part"
_RICH_REPLAY_OUTPUT_IMAGE = "runtime-rich-image.png"
_RICH_REPLAY_OUTPUT_IMAGE_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
_RICH_REPLAY_VALIDATION_REASON = "Input validation failed before tool execution."
_RICH_REPLAY_VALIDATION_DETAILS = "cmd is required for replay validation"
_RICH_REPLAY_TOKEN_SUMMARY = "Token usage: Total 18 · Input 11 · Output 7"
_RICH_REPLAY_MODEL_STEP = "model step replay visible"
_RICH_REPLAY_MODEL_STEP_STARTED_SUMMARY = (
    f"Model step started: {_RICH_REPLAY_MODEL_STEP}"
)
_RICH_REPLAY_MODEL_STEP_FINISHED_SUMMARY = (
    f"Model step finished: {_RICH_REPLAY_MODEL_STEP} finished"
)
_RICH_REPLAY_STATE_SNAPSHOT = "state snapshot replay visible"
_RICH_REPLAY_STATE_SNAPSHOT_SUMMARY = f"State snapshot: {_RICH_REPLAY_STATE_SNAPSHOT}"
_RICH_REPLAY_STATE_DELTA = "state delta replay visible"
_RICH_REPLAY_STATE_DELTA_SUMMARY = f"State delta: {_RICH_REPLAY_STATE_DELTA}"
_RICH_REPLAY_TODO_CURRENT = "verify rich replay todos"
_RICH_REPLAY_TODO_SUMMARY = (
    "Todo updated: 3 items · 1 completed, 1 in_progress, 1 pending · "
    f"Current {_RICH_REPLAY_TODO_CURRENT} · v4 · by replay-agent"
)
_RICH_REPLAY_INJECTION = "queued replay injection"
_RICH_REPLAY_INJECTION_QUEUED_SUMMARY = (
    f"Injection queued: {_RICH_REPLAY_INJECTION} · source user · mode queued · "
    "to replay-agent"
)
_RICH_REPLAY_INJECTION_APPLIED = "applied replay injection"
_RICH_REPLAY_INJECTION_APPLIED_SUMMARY = (
    f"Injection applied: {_RICH_REPLAY_INJECTION_APPLIED} · source system · "
    "mode guidance · to replay-agent"
)
_RICH_REPLAY_QUESTION_ID = "question-rich-replay"
_RICH_REPLAY_QUESTION = "Choose replay path"
_RICH_REPLAY_QUESTION_SUMMARY = (
    f"User question: {_RICH_REPLAY_QUESTION} · #{_RICH_REPLAY_QUESTION_ID}"
)
_RICH_REPLAY_QUESTION_ANSWER_SUMMARY = (
    f"User question answered: 1 answer · #{_RICH_REPLAY_QUESTION_ID}"
)
_RICH_REPLAY_NOTIFICATION = "notification replay visible"
_RICH_REPLAY_NOTIFICATION_SUMMARY = f"Notification: {_RICH_REPLAY_NOTIFICATION}"
_RICH_REPLAY_SUBAGENT_STATUS = "subagent status replay visible"
_RICH_REPLAY_SUBAGENT_STATUS_SUMMARY = (
    f"Subagent status: {_RICH_REPLAY_SUBAGENT_STATUS} · status running"
)
_RICH_REPLAY_SUBAGENT_STOPPED_SUMMARY = (
    "Subagent stopped: reason stopped_by_user · role reviewer · "
    "instance subagent-rich · task task-rich"
)
_RICH_REPLAY_SUBAGENT_RESUMED_SUMMARY = (
    "Subagent resumed: role reviewer · instance subagent-rich · task task-rich"
)
_RICH_REPLAY_MANUAL_ACTION_SUMMARY = "Awaiting manual action: root task root-rich"
_RICH_REPLAY_BACKGROUND_TASK = "background task replay visible"
_RICH_REPLAY_BACKGROUND_TASK_SUMMARY = (
    f"Background task started: {_RICH_REPLAY_BACKGROUND_TASK}"
)
_REAL_SSE_RESUMED_CHUNK = "real SSE resumed chunk"
_REAL_SSE_AFTER_DUPLICATE_REPLAY_CHUNK = "real SSE after duplicate replay"
_REAL_SSE_FAILURE_MESSAGE = "real SSE provider failed before completion"
_REAL_SSE_UNAVAILABLE_MESSAGE = "run recovery stream is no longer available"


@pytest.fixture()
def browser_page() -> Iterator[Page]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            color_scheme="dark",
            viewport={"width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT},
        )
        page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()


def test_v2_run_stream_recovers_after_refresh(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()

        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=0'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.run_payload is not None
        assert backend.run_payload["session_id"] == _SESSION_ID
        assert backend.run_payload["input"] == [{"kind": "text", "text": _PROMPT}]

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 2, {"text": _FIRST_CHUNK})
        backend.last_event_id = 2
        backend.persisted_assistant_text = _FIRST_CHUNK
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.reload()
        _wait_for_v2_shell(page)
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=2'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "text_delta", 3, {"text": _AFTER_RELOAD_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_have_count(
            1,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message").filter(has_text=_AFTER_RELOAD_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        _emit_relay_event(page, "run_completed", 4, {"status": "completed"})
        backend.last_event_id = 4
        backend.completed = True
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_active_run_controls_inject_and_stop(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 1",
            timeout=_WAIT_TIMEOUT_MS,
        )
        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})

        stop_button = page.get_by_role("button", name=re.compile(r"^(Stop|停止)$"))
        expect(stop_button).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        prompt.fill(_QUEUED_INJECTION)
        page.get_by_role("button", name=re.compile(r"^(Queue|排队)$")).click()
        expect(prompt).to_have_value("", timeout=_WAIT_TIMEOUT_MS)
        assert backend.injections == [
            {"content": _QUEUED_INJECTION, "mode": "queued"},
        ]

        prompt.fill(_INTERRUPT_INJECTION)
        page.get_by_role("button", name=re.compile(r"^(Interrupt|打断)$")).click()
        expect(prompt).to_have_value("", timeout=_WAIT_TIMEOUT_MS)
        assert backend.injections == [
            {"content": _QUEUED_INJECTION, "mode": "queued"},
            {"content": _INTERRUPT_INJECTION, "mode": "interrupt"},
        ]
        assert backend.stop_payload is None
        assert backend.completed is False

        stop_button.click()
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(stop_button).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.get_by_role("button", name=re.compile(r"^(Send|发送)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.stop_payload == {"scope": "main"}
        assert backend.completed is True


def test_v2_interrupted_stream_reconnects_from_latest_event_id(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=0'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 2, {"text": _FIRST_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate("() => window.__v2DispatchTransportError()")
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url, index) =>
              index > 0
              && url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=2'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            "() => window.__v2EventSources[0]?.readyState === 2",
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "text_delta", 3, {"text": _AFTER_RELOAD_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_have_count(
            1,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message").filter(has_text=_AFTER_RELOAD_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        _emit_relay_event(page, "run_completed", 4, {"status": "completed"})
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_interrupted_stream_reconnects_from_sse_last_event_id(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=0'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event_with_last_event_id(
            page,
            "text_delta",
            None,
            "2",
            {"text": _FIRST_CHUNK},
        )
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate("() => window.__v2DispatchTransportError()")
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url, index) =>
              index > 0
              && url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=2'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            "() => window.__v2EventSources[0]?.readyState === 2",
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "text_delta", 3, {"text": _AFTER_RELOAD_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_have_count(
            1,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message").filter(has_text=_AFTER_RELOAD_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        _emit_relay_event(page, "run_completed", 4, {"status": "completed"})
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_interrupted_stream_exhausts_manual_reconnects_and_restores_composer(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=0'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 2, {"text": _FIRST_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        _dispatch_transport_error_and_wait_for_source_count(page, 2)
        _dispatch_transport_error_and_wait_for_source_count(page, 3)
        _dispatch_transport_error_and_wait_for_source_count(page, 4)
        page.evaluate("() => window.__v2DispatchTransportError()")

        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("button", name=re.compile(r"^(Stop|停止)$")),
        ).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.get_by_role("button", name=re.compile(r"^(Send|发送)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.locator(".at-message").filter(has_text=_FIRST_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        page.wait_for_timeout(4000)
        assert page.evaluate("() => window.__v2EventSourceUrls.length") == 4


def test_v2_interrupted_stream_preserves_non_text_events_after_reconnect(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=0'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 2, {"text": _FIRST_CHUNK})
        _emit_relay_event(page, "thinking_started", 3, {"part_index": 0})
        _emit_relay_event(
            page,
            "thinking_delta",
            4,
            {"delta": _RICH_REPLAY_THINKING_PREFIX, "part_index": 0},
        )
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message-thinking").filter(
                has_text=_RICH_REPLAY_THINKING_PREFIX,
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        page.evaluate("() => window.__v2DispatchTransportError()")
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url, index) =>
              index > 0
              && url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=4'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            "() => window.__v2EventSources[0]?.readyState === 2",
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(
            page,
            "thinking_delta",
            5,
            {"delta": _RICH_REPLAY_THINKING_SUFFIX, "part_index": 0},
        )
        expect(
            page.locator(".at-message-thinking").filter(
                has_text=(
                    f"{_RICH_REPLAY_THINKING_PREFIX}{_RICH_REPLAY_THINKING_SUFFIX}"
                ),
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_have_count(
            1,
            timeout=_WAIT_TIMEOUT_MS,
        )
        _emit_relay_event(
            page,
            "tool_call",
            6,
            {
                "args": {"path": "README.md"},
                "tool_call_id": _RICH_REPLAY_TOOL_CALL_ID,
                "tool_name": "read",
            },
        )
        _emit_relay_event(
            page,
            "tool_result",
            7,
            {
                "result": {"data": _RICH_REPLAY_TOOL_OUTPUT, "ok": True},
                "tool_call_id": _RICH_REPLAY_TOOL_CALL_ID,
                "tool_name": "read",
            },
        )
        expect(page.get_by_text("Tool call: read")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message-tool-preview").get_by_text(
                "README.md",
                exact=True,
            ),
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("Tool result: read")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message-tool-preview").get_by_text(
                _RICH_REPLAY_TOOL_OUTPUT,
                exact=True,
            ),
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        _emit_relay_event(
            page,
            "token_usage",
            8,
            {"input_tokens": 11, "output_tokens": 7, "total_tokens": 18},
        )
        _emit_relay_event(
            page,
            "model_step_started",
            9,
            {"summary": _RICH_REPLAY_MODEL_STEP},
        )
        _emit_relay_event(
            page,
            "model_step_finished",
            10,
            {"summary": f"{_RICH_REPLAY_MODEL_STEP} finished"},
        )
        _emit_relay_event(
            page,
            "state_snapshot",
            11,
            {"summary": _RICH_REPLAY_STATE_SNAPSHOT},
        )
        _emit_relay_event(
            page,
            "state_delta",
            12,
            {"summary": _RICH_REPLAY_STATE_DELTA},
        )
        _emit_relay_event(
            page,
            "todo_updated",
            13,
            {
                "items": [
                    {"content": "inspect replay hydration", "status": "completed"},
                    {
                        "content": _RICH_REPLAY_TODO_CURRENT,
                        "status": "in_progress",
                    },
                    {"content": "capture replay evidence", "status": "pending"},
                ],
                "run_id": _RUN_ID,
                "session_id": _SESSION_ID,
                "updated_by_instance_id": "replay-agent",
                "version": 4,
            },
        )
        _emit_relay_event(
            page,
            "notification_requested",
            14,
            {"title": _RICH_REPLAY_NOTIFICATION},
        )
        _emit_relay_event(
            page,
            "subagent_session_status_changed",
            15,
            {"status": "running", "title": _RICH_REPLAY_SUBAGENT_STATUS},
        )
        _emit_relay_event(
            page,
            "background_task_started",
            16,
            {"title": _RICH_REPLAY_BACKGROUND_TASK},
        )
        _emit_relay_event(
            page,
            "injection_enqueued",
            17,
            {
                "content": _RICH_REPLAY_INJECTION,
                "delivery_mode": "queued",
                "recipient_instance_id": "replay-agent",
                "source": "user",
            },
        )
        _emit_relay_event(
            page,
            "injection_applied",
            18,
            {
                "content": _RICH_REPLAY_INJECTION_APPLIED,
                "internal_delivery_mode": "guidance",
                "recipient_instance_id": "replay-agent",
                "source": "system",
            },
        )
        _emit_relay_event(
            page,
            "user_question_requested",
            19,
            {
                "question_id": _RICH_REPLAY_QUESTION_ID,
                "questions": [{"question": _RICH_REPLAY_QUESTION}],
            },
        )
        _emit_relay_event(
            page,
            "user_question_answered",
            20,
            {
                "answers": [{"selections": [{"label": "Continue"}]}],
                "question_id": _RICH_REPLAY_QUESTION_ID,
            },
        )
        _emit_relay_event(
            page,
            "subagent_stopped",
            21,
            {
                "instance_id": "subagent-rich",
                "reason": "stopped_by_user",
                "role_id": "reviewer",
                "task_id": "task-rich",
            },
        )
        _emit_relay_event(
            page,
            "subagent_resumed",
            22,
            {
                "instance_id": "subagent-rich",
                "role_id": "reviewer",
                "task_id": "task-rich",
            },
        )
        _emit_relay_event(
            page,
            "awaiting_manual_action",
            23,
            {"root_task_id": "root-rich"},
        )
        _emit_relay_event(
            page,
            "output_delta",
            24,
            {
                "output": [
                    {"kind": "text", "text": _RICH_REPLAY_OUTPUT_TEXT},
                    {
                        "kind": "media_ref",
                        "mime_type": "image/png",
                        "modality": "image",
                        "name": _RICH_REPLAY_OUTPUT_IMAGE,
                        "url": _RICH_REPLAY_OUTPUT_IMAGE_URL,
                    },
                ],
            },
        )
        _emit_relay_event(
            page,
            "tool_input_validation_failed",
            25,
            {
                "details": _RICH_REPLAY_VALIDATION_DETAILS,
                "reason": _RICH_REPLAY_VALIDATION_REASON,
                "tool_call_id": "call-v2-rich-validation",
                "tool_name": "execute_command",
            },
        )

        expect(page.get_by_text(_RICH_REPLAY_TOKEN_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_text(_RICH_REPLAY_MODEL_STEP_STARTED_SUMMARY),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.get_by_text(_RICH_REPLAY_MODEL_STEP_FINISHED_SUMMARY),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.get_by_text(_RICH_REPLAY_STATE_SNAPSHOT_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_STATE_DELTA_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_TODO_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_NOTIFICATION_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_SUBAGENT_STATUS_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_BACKGROUND_TASK_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_INJECTION_QUEUED_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_INJECTION_APPLIED_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_QUESTION_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_QUESTION_ANSWER_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_SUBAGENT_STOPPED_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_SUBAGENT_RESUMED_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_MANUAL_ACTION_SUMMARY)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text(_RICH_REPLAY_OUTPUT_TEXT)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        output_image = page.get_by_role("img", name=_RICH_REPLAY_OUTPUT_IMAGE)
        expect(output_image).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(output_image).to_have_attribute("src", _RICH_REPLAY_OUTPUT_IMAGE_URL)
        validation_header = page.get_by_text("Tool validation: execute_command")
        expect(validation_header).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.locator(".at-message-tool-preview").get_by_text(
                _RICH_REPLAY_VALIDATION_REASON,
                exact=True,
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        validation_header.click()
        expect(page.get_by_text(_RICH_REPLAY_VALIDATION_DETAILS)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "thinking_finished", 26, {"part_index": 0})
        _emit_relay_event(page, "run_completed", 27, {"status": "completed"})
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_session_switch_closes_active_stream_and_isolates_timeline(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend()
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        prompt = page.get_by_label(re.compile(r"^(Prompt|提示词)$"))
        expect(prompt).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        prompt.fill(_PROMPT)
        page.get_by_role("button", name=re.compile(r"^(Send|发送)$")).click()
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 1",
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(page, "run_started", 1, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 2, {"text": _FIRST_CHUNK})
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("button", name=re.compile(r"^(Stop|停止)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        page.locator(".at-session-select").filter(
            has_text="V2 alternate session"
        ).click()

        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            "() => window.__v2EventSources[0]?.readyState === 2",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-message").filter(has_text=_FIRST_CHUNK)).to_have_count(
            0,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-message").filter(has_text=_ALT_PROMPT)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("button", name=re.compile(r"^(Stop|停止)$")),
        ).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.get_by_role("button", name=re.compile(r"^(Send|发送)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def test_v2_recoverable_run_resume_reopens_stream_from_checkpoint(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend(recoverable_stopped_run=True)
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        resume_button = page.get_by_role("button", name="Resume")
        expect(resume_button).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.locator(".at-recovery").filter(has_text="stopped")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        resume_button.click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=7'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.resume_requested is True

        _emit_relay_event(page, "run_resumed", 8, {"phase": "streaming"})
        _emit_relay_event(page, "text_delta", 9, {"text": _RESUMED_CHUNK})
        backend.last_event_id = 9
        expect(
            page.locator(".at-message").filter(has_text=_RESUMED_CHUNK)
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("button", name=re.compile(r"^(Stop|停止)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def test_v2_background_task_recovery_displays_collapses_and_stops(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend(background_task=True)
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        recovery = page.locator(".at-recovery")
        expect(recovery.get_by_text("Background task is still active")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text("Background tasks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text("1 active")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(recovery.get_by_text(_BACKGROUND_COMMAND)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text(_BACKGROUND_CWD)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        recovery.get_by_role("button", name="Hide").click()
        expect(recovery.get_by_text(_BACKGROUND_COMMAND)).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )
        recovery.get_by_role("button", name="Show").click()
        expect(recovery.get_by_text(_BACKGROUND_COMMAND)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        recovery.get_by_role("button", name="Stop").click()
        expect(recovery.get_by_text("Background tasks")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.background_task_stop_requests == [
            {"background_task_id": _BACKGROUND_TASK_ID, "run_id": _RUN_ID},
        ]


def test_v2_background_task_recovery_uses_multiplex_stream(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend(
        background_task=True,
        background_task_subagent_run=True,
    )
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.wait_for_function(
            f"""
            () => window.__v2EventSourceUrls.some((rawUrl) => {{
              const url = new URL(rawUrl, window.location.origin);
              return url.pathname.endsWith('/api/ag-ui/runs/events')
                && url.searchParams.getAll('run_id').includes('{_RUN_ID}')
                && url.searchParams.getAll('run_id').includes('{_SUBAGENT_RUN_ID}');
            }})
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        composer = page.locator(".at-composer")
        expect(
            composer.get_by_role("button", name=re.compile(r"^(Send|发送)$")),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            composer.get_by_role("button", name=re.compile(r"^(Stop|停止)$")),
        ).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        expect(composer.get_by_role("button", name="Queue")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(composer.get_by_role("button", name="Interrupt")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )

        _emit_relay_event(
            page,
            "text_delta",
            1,
            {"text": _MAIN_MULTIPLEX_CHUNK},
            run_id=_RUN_ID,
        )
        _emit_relay_event(
            page,
            "text_delta",
            2,
            {"text": _SUBAGENT_MULTIPLEX_CHUNK},
            role_id="reviewer",
            run_id=_SUBAGENT_RUN_ID,
        )
        expect(
            page.locator(".at-message").filter(has_text=_MAIN_MULTIPLEX_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.locator(".at-message").filter(has_text=_SUBAGENT_MULTIPLEX_CHUNK),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        _emit_relay_event(
            page,
            "run_completed",
            3,
            {"status": "completed"},
            run_id=_RUN_ID,
        )
        _emit_relay_event(
            page,
            "run_completed",
            4,
            {"status": "completed"},
            role_id="reviewer",
            run_id=_SUBAGENT_RUN_ID,
        )
        page.wait_for_function(
            "() => window.__v2OpenEventSourceCount() === 0",
            timeout=_WAIT_TIMEOUT_MS,
        )


class _V2StreamBackend:
    def __init__(
        self,
        *,
        background_task: bool = False,
        background_task_subagent_run: bool = False,
        paused_subagent: bool = False,
        pending_tool_approval: bool = False,
        pending_user_question: bool = False,
        recoverable_stopped_run: bool = False,
    ) -> None:
        has_pending_recovery_action = pending_tool_approval or pending_user_question
        self.completed = False
        self.injections: list[dict[str, object]] = []
        self.last_event_id = (
            7 if recoverable_stopped_run or has_pending_recovery_action else 0
        )
        self.persisted_assistant_text = ""
        self.background_task = background_task
        self.background_task_subagent_run = background_task_subagent_run
        self.background_task_stop_requests: list[dict[str, object]] = []
        self.paused_subagent = paused_subagent
        self.pending_tool_approval = pending_tool_approval
        self.pending_user_question = pending_user_question
        self.recoverable_stopped_run = (
            recoverable_stopped_run or has_pending_recovery_action
        )
        self.approval_resolutions: list[dict[str, object]] = []
        self.question_answers: list[dict[str, object]] = []
        self.resume_requested = False
        self.run_created = self.recoverable_stopped_run
        self.run_create_count = 0
        self.run_payload: dict[str, object] | None = None
        self.stop_payload: dict[str, object] | None = None

    def route(self, route: Route, request: Request) -> None:
        path = urlsplit(request.url).path.removeprefix("/api")
        if request.method == "GET" and path == "/system/health":
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path == "/workspaces":
            _fulfill_json(route, [self._workspace()])
            return
        if request.method == "GET" and path == "/sessions/sidebar":
            _fulfill_json(route, [self._sidebar_session(), self._alt_sidebar_session()])
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}":
            _fulfill_json(route, self._session())
            return
        if request.method == "GET" and path == f"/sessions/{_ALT_SESSION_ID}":
            _fulfill_json(route, self._alt_session())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/messages":
            _fulfill_json(route, self._messages())
            return
        if request.method == "GET" and path == f"/sessions/{_ALT_SESSION_ID}/messages":
            _fulfill_json(route, self._alt_messages())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/rounds":
            _fulfill_json(route, self._rounds_page())
            return
        if request.method == "GET" and path == f"/sessions/{_ALT_SESSION_ID}/rounds":
            _fulfill_json(route, {"has_more": False, "items": [], "next_cursor": None})
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/token-usage":
            _fulfill_json(route, self._token_usage())
            return
        if (
            request.method == "GET"
            and path == f"/sessions/{_ALT_SESSION_ID}/token-usage"
        ):
            _fulfill_json(route, self._alt_token_usage())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/recovery":
            _fulfill_json(route, self._recovery())
            return
        if request.method == "GET" and path == f"/sessions/{_ALT_SESSION_ID}/recovery":
            _fulfill_json(route, self._empty_recovery())
            return
        if request.method == "GET" and path == "/roles:options":
            _fulfill_json(route, self._role_options())
            return
        if request.method == "GET" and path == "/system/configs/model/profiles":
            _fulfill_json(route, self._model_profiles())
            return
        if request.method == "GET" and path == "/system/configs/orchestration":
            _fulfill_json(route, self._orchestration())
            return
        if request.method == "GET" and path == "/system/configs/general":
            _fulfill_json(route, {"shell_safety_policy_enabled": True})
            return
        if request.method == "POST" and path == "/ag-ui/runs":
            self.run_created = True
            self.run_create_count += 1
            self.run_payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            _fulfill_json(
                route,
                {
                    "run_id": _RUN_ID,
                    "session_id": _SESSION_ID,
                    "target_role_id": None,
                },
            )
            return
        if request.method == "POST" and path == f"/ag-ui/runs/{_RUN_ID}/inject":
            injection = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.injections.append(injection)
            _fulfill_json(
                route,
                {
                    "action": "inject",
                    "run_id": _RUN_ID,
                    "session_id": _SESSION_ID,
                    "status": "ok",
                },
            )
            return
        if request.method == "POST" and path == f"/ag-ui/runs/{_RUN_ID}:stop":
            self.stop_payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.completed = True
            _fulfill_json(
                route,
                {
                    "run_id": _RUN_ID,
                    "scope": "main",
                    "status": "ok",
                },
            )
            return
        if request.method == "POST" and path == f"/ag-ui/runs/{_RUN_ID}:resume":
            self.resume_requested = True
            self.completed = False
            self.run_created = True
            _fulfill_json(
                route,
                {
                    "run_id": _RUN_ID,
                    "session_id": _SESSION_ID,
                    "status": "ok",
                },
            )
            return
        if (
            request.method == "POST"
            and path
            == f"/ag-ui/runs/{_RUN_ID}/tool-approvals/{_APPROVAL_TOOL_CALL_ID}:resolve"
        ):
            self.approval_resolutions.append(
                cast(dict[str, object], json.loads(request.post_data or "{}")),
            )
            self.pending_tool_approval = False
            _fulfill_json(route, {"status": "ok"})
            return
        if (
            request.method == "POST"
            and path == f"/ag-ui/runs/{_RUN_ID}/questions/{_QUESTION_ID}:answer"
        ):
            self.question_answers.append(
                cast(dict[str, object], json.loads(request.post_data or "{}")),
            )
            self.pending_user_question = False
            _fulfill_json(route, {"status": "ok"})
            return
        if (
            request.method == "POST"
            and path == f"/runs/{_RUN_ID}/background-tasks/{_BACKGROUND_TASK_ID}:stop"
        ):
            self.background_task = False
            self.background_task_stop_requests.append(
                {
                    "background_task_id": _BACKGROUND_TASK_ID,
                    "run_id": _RUN_ID,
                },
            )
            _fulfill_json(
                route,
                {
                    "background_task": {
                        **self._background_task_payload(),
                        "status": "stopped",
                    },
                },
            )
            return
        _fulfill_json(
            route, {"detail": f"Unhandled mock API route: {path}"}, status=404
        )

    def _workspace(self) -> dict[str, object]:
        return {
            "display_name": "agent-teams",
            "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _sidebar_session(self) -> dict[str, object]:
        active_run_id = _RUN_ID if self.run_created and not self.completed else None
        active_run_phase = ""
        active_run_status = ""
        if active_run_id is not None:
            if self.recoverable_stopped_run and not self.resume_requested:
                active_run_phase = "stopped"
                active_run_status = "stopped"
            else:
                active_run_phase = "streaming"
                active_run_status = "running"
        return {
            "active_run_id": active_run_id,
            "active_run_phase": active_run_phase,
            "active_run_status": active_run_status,
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "V2 stream recovery",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _alt_sidebar_session(self) -> dict[str, object]:
        return {
            "active_run_id": None,
            "active_run_phase": "",
            "active_run_status": "",
            "session_id": _ALT_SESSION_ID,
            "session_mode": "normal",
            "title": "V2 alternate session",
            "updated_at": "2026-06-25T08:05:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _session(self) -> dict[str, object]:
        return {
            "can_switch_mode": False,
            "normal_model_profile": "default",
            "normal_root_role_id": "MainAgent",
            "orchestration_preset_id": "default",
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "V2 stream recovery",
            "workspace_id": _WORKSPACE_ID,
        }

    def _alt_session(self) -> dict[str, object]:
        return {
            "can_switch_mode": True,
            "normal_model_profile": "default",
            "normal_root_role_id": "MainAgent",
            "orchestration_preset_id": "default",
            "session_id": _ALT_SESSION_ID,
            "session_mode": "normal",
            "title": "V2 alternate session",
            "workspace_id": _WORKSPACE_ID,
        }

    def _messages(self) -> list[dict[str, object]]:
        messages: list[dict[str, object]] = [
            {
                "content": _PROMPT,
                "created_at": "2026-06-25T08:00:01Z",
                "message_id": "user-v2-stream",
                "parts": [{"kind": "text", "text": _PROMPT}],
                "role": "user",
                "run_id": _RUN_ID,
                "trace_id": "trace-v2-stream",
            },
        ]
        if self.persisted_assistant_text:
            messages.append(
                {
                    "content": self.persisted_assistant_text,
                    "created_at": "2026-06-25T08:00:02Z",
                    "message_id": "assistant-v2-stream",
                    "parts": [{"kind": "text", "text": self.persisted_assistant_text}],
                    "role": "assistant",
                    "role_id": "MainAgent",
                    "run_id": _RUN_ID,
                    "trace_id": "trace-v2-stream",
                },
            )
        return messages

    def _alt_messages(self) -> list[dict[str, object]]:
        return [
            {
                "content": _ALT_PROMPT,
                "created_at": "2026-06-25T08:05:01Z",
                "message_id": "user-v2-alt",
                "parts": [{"kind": "text", "text": _ALT_PROMPT}],
                "role": "user",
                "run_id": "run-v2-alt",
                "trace_id": "trace-v2-alt",
            },
        ]

    def _rounds_page(self) -> dict[str, object]:
        run_phase = "streaming"
        run_status = "running"
        if self.completed:
            run_status = "completed"
        elif self.recoverable_stopped_run and not self.resume_requested:
            run_phase = self._recoverable_phase()
            run_status = "stopped"
        return {
            "has_more": False,
            "items": [
                {
                    "created_at": "2026-06-25T08:00:01Z",
                    "has_user_messages": True,
                    "intent": _PROMPT,
                    "intent_parts": [{"kind": "text", "text": _PROMPT}],
                    "primary_role_id": "MainAgent",
                    "run_id": _RUN_ID,
                    "run_phase": run_phase,
                    "run_status": run_status,
                    "run_user_message": _PROMPT,
                },
            ],
            "next_cursor": None,
        }

    def _token_usage(self) -> dict[str, object]:
        return {
            "by_role": {},
            "session_id": _SESSION_ID,
            "total_cached_input_tokens": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_reasoning_output_tokens": 0,
            "total_requests": 0,
            "total_tokens": 0,
            "total_tool_calls": 0,
        }

    def _alt_token_usage(self) -> dict[str, object]:
        return {
            "by_role": {},
            "session_id": _ALT_SESSION_ID,
            "total_cached_input_tokens": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_reasoning_output_tokens": 0,
            "total_requests": 0,
            "total_tokens": 0,
            "total_tool_calls": 0,
        }

    def _recovery(self) -> dict[str, object]:
        active_run = None
        if self.run_created and not self.completed:
            should_show_recover = (
                self.recoverable_stopped_run and not self.resume_requested
            )
            active_run = {
                "last_event_id": self.last_event_id,
                "phase": self._recoverable_phase()
                if should_show_recover
                else "streaming",
                "run_id": _RUN_ID,
                "session_id": _SESSION_ID,
                "should_show_recover": should_show_recover,
                "status": "stopped" if should_show_recover else "running",
                "stream_connected": False,
            }
        return {
            "active_run": active_run,
            "background_tasks": self._background_tasks(),
            "paused_subagent": self._paused_subagent(),
            "pending_tool_approvals": self._pending_tool_approvals(),
            "pending_user_questions": self._pending_user_questions(),
            "round_snapshot": None,
        }

    def _empty_recovery(self) -> dict[str, object]:
        return {
            "active_run": None,
            "background_tasks": [],
            "paused_subagent": None,
            "pending_tool_approvals": [],
            "pending_user_questions": [],
            "round_snapshot": None,
        }

    def _background_tasks(self) -> list[dict[str, object]]:
        if not self.background_task:
            return []
        return [self._background_task_payload()]

    def _background_task_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "background_task_id": _BACKGROUND_TASK_ID,
            "command": _BACKGROUND_COMMAND,
            "cwd": _BACKGROUND_CWD,
            "execution_mode": "background",
            "kind": "subagent" if self.background_task_subagent_run else "command",
            "recent_output": ["watching files"],
            "run_id": _RUN_ID,
            "session_id": _SESSION_ID,
            "status": "running",
            "title": _BACKGROUND_COMMAND,
        }
        if self.background_task_subagent_run:
            payload["role_id"] = "reviewer"
            payload["subagent_run_id"] = _SUBAGENT_RUN_ID
        return payload

    def _paused_subagent(self) -> dict[str, object] | None:
        if not self.paused_subagent:
            return None
        return {
            "instance_id": "reviewer-1",
            "reason": "waiting for input",
            "role_id": "reviewer",
            "task_id": "task-review-1",
        }

    def _recoverable_phase(self) -> str:
        if self.pending_tool_approval:
            return "awaiting_tool_approval"
        if self.pending_user_question:
            return "awaiting_user_question"
        return "stopped"

    def _pending_tool_approvals(self) -> list[dict[str, object]]:
        if not self.pending_tool_approval:
            return []
        return [
            {
                "acp_options": [
                    {
                        "kind": "allow_once",
                        "name": "Allow once",
                        "optionId": "allow_once",
                    },
                    {
                        "kind": "reject_once",
                        "name": "Reject once",
                        "optionId": "reject_once",
                    },
                ],
                "args_preview": '{"cmd":"npm test"}',
                "role_id": "MainAgent",
                "status": "pending",
                "tool_call_id": _APPROVAL_TOOL_CALL_ID,
                "tool_name": "execute_command",
            },
        ]

    def _pending_user_questions(self) -> list[dict[str, object]]:
        if not self.pending_user_question:
            return []
        return [
            {
                "question_id": _QUESTION_ID,
                "questions": [
                    {
                        "multiple": True,
                        "options": [
                            {
                                "description": "Deploy now",
                                "label": "Ship",
                            },
                            {"label": "__none_of_the_above__"},
                        ],
                        "placeholder": "Add handoff detail",
                        "question": "Pick the handoff mode",
                    },
                ],
                "role_id": "Planner",
                "run_id": _RUN_ID,
                "status": "pending",
            },
        ]

    def _role_options(self) -> dict[str, object]:
        main_agent = {
            "capabilities": {
                "input": {"image": True, "text": True},
                "output": {"text": True},
            },
            "description": "Main agent",
            "input_modalities": ["text", "image"],
            "model_profile": "default",
            "name": "Main Agent",
            "role_id": "MainAgent",
        }
        return {
            "coordinator_role_id": None,
            "main_agent_role": main_agent,
            "main_agent_role_id": "MainAgent",
            "normal_mode_roles": [main_agent],
            "subagent_roles": [],
        }

    def _model_profiles(self) -> dict[str, object]:
        return {
            "default": {
                "capabilities": {
                    "input": {"image": True, "text": True},
                    "output": {"text": True},
                },
                "input_modalities": ["text", "image"],
                "is_default": True,
                "model": "mock-model",
                "provider": "mock-provider",
            },
        }

    def _orchestration(self) -> dict[str, object]:
        return {
            "default_orchestration_preset_id": "default",
            "presets": [
                {
                    "name": "Default",
                    "preset_id": "default",
                    "role_ids": ["MainAgent"],
                },
            ],
        }


class _RealSseStreamState:
    def __init__(
        self,
        *,
        fail_initial_stream: bool = False,
        hold_initial_stream_after_first_chunk: bool = False,
        hold_initial_stream_until_stop: bool = False,
        malformed_initial_stream: bool = False,
        replay_duplicate_event_on_resume: bool = False,
        rich_replay_on_resume: bool = False,
        server_error_initial_stream: bool = False,
        stop_initial_stream: bool = False,
    ) -> None:
        self.fail_initial_stream = fail_initial_stream
        self.hold_initial_stream_after_first_chunk = (
            hold_initial_stream_after_first_chunk
        )
        self.hold_initial_stream_until_stop = hold_initial_stream_until_stop
        self.malformed_initial_stream = malformed_initial_stream
        self.replay_duplicate_event_on_resume = replay_duplicate_event_on_resume
        self.rich_replay_on_resume = rich_replay_on_resume
        self.server_error_initial_stream = server_error_initial_stream
        self.stop_initial_stream = stop_initial_stream
        self._lock = threading.Lock()
        self._initial_stream_finished = threading.Event()
        self._multiplex_stream_seen = threading.Event()
        self._release_initial_stream = threading.Event()
        self._resumed_stream_seen = threading.Event()
        self._sent_event_ids: set[int] = set()
        self._sent_initial_stream = False
        self._stop_requested = threading.Event()
        self.multiplex_stream_requests: list[dict[str, object]] = []
        self.stream_requests: list[dict[str, object]] = []

    def record_request(
        self,
        *,
        after_event_id: int,
        last_event_id: str,
        run_id: str,
    ) -> None:
        with self._lock:
            self.stream_requests.append(
                {
                    "after_event_id": after_event_id,
                    "last_event_id": last_event_id,
                    "run_id": run_id,
                },
            )
        if after_event_id >= 2:
            self._resumed_stream_seen.set()

    def record_multiplex_request(
        self,
        *,
        last_event_id: str,
        run_offsets: dict[str, int],
    ) -> None:
        with self._lock:
            self.multiplex_stream_requests.append(
                {
                    "last_event_id": last_event_id,
                    "run_offsets": dict(run_offsets),
                },
            )
        self._multiplex_stream_seen.set()

    def claim_initial_stream(self, after_event_id: int) -> bool:
        with self._lock:
            if self._sent_initial_stream or after_event_id != 0:
                return False
            self._sent_initial_stream = True
            return True

    def wait_for_after_event_id(
        self,
        after_event_id: int,
        *,
        timeout_seconds: float,
    ) -> bool:
        if after_event_id <= 0:
            return self._has_after_event_id(after_event_id)
        return self._resumed_stream_seen.wait(timeout=timeout_seconds)

    def wait_for_sent_event_id(
        self,
        event_id: int,
        *,
        timeout_seconds: float,
    ) -> bool:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            with self._lock:
                if event_id in self._sent_event_ids:
                    return True
            time.sleep(0.05)
        return False

    def wait_for_request_count_at_least(
        self,
        request_count: int,
        *,
        timeout_seconds: float,
    ) -> bool:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self.request_count() >= request_count:
                return True
            time.sleep(0.05)
        return False

    def wait_for_multiplex_run_ids(
        self,
        run_ids: set[str],
        *,
        timeout_seconds: float,
    ) -> bool:
        if not self._multiplex_stream_seen.wait(timeout=timeout_seconds):
            return False
        with self._lock:
            return any(
                run_ids.issubset(
                    set(
                        cast(dict[str, int], request["run_offsets"]).keys(),
                    ),
                )
                for request in self.multiplex_stream_requests
            )

    def wait_for_stream_run_id(
        self,
        run_id: str,
        *,
        timeout_seconds: float,
    ) -> bool:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self.has_stream_run_id(run_id):
                return True
            time.sleep(0.05)
        return False

    def has_stream_run_id(self, run_id: str) -> bool:
        with self._lock:
            return any(request["run_id"] == run_id for request in self.stream_requests)

    def multiplex_request_count(self) -> int:
        with self._lock:
            return len(self.multiplex_stream_requests)

    def has_last_event_id_header(self, last_event_id: str) -> bool:
        with self._lock:
            return any(
                request["last_event_id"] == last_event_id
                for request in self.stream_requests
            )

    def request_count(self) -> int:
        with self._lock:
            return len(self.stream_requests)

    def request_snapshots(self) -> list[dict[str, object]]:
        with self._lock:
            return [dict(request) for request in self.stream_requests]

    def record_initial_stream_finished(self) -> None:
        self._initial_stream_finished.set()

    def record_sent_event_id(self, event_id: int) -> None:
        with self._lock:
            self._sent_event_ids.add(event_id)

    def record_stop_request(self) -> None:
        self._stop_requested.set()

    def release_initial_stream(self) -> None:
        self._release_initial_stream.set()

    def wait_for_initial_stream_release(self, *, timeout_seconds: float) -> bool:
        return self._release_initial_stream.wait(timeout=timeout_seconds)

    def wait_for_initial_stream_finished(self, *, timeout_seconds: float) -> bool:
        return self._initial_stream_finished.wait(timeout=timeout_seconds)

    def wait_for_stop_request(self, *, timeout_seconds: float) -> bool:
        return self._stop_requested.wait(timeout=timeout_seconds)

    def _has_after_event_id(self, after_event_id: int) -> bool:
        with self._lock:
            return any(
                request["after_event_id"] == after_event_id
                for request in self.stream_requests
            )


@contextmanager
def _serve_v2_app(repo_root: Path) -> Iterator[str]:
    app_root = repo_root / "frontend" / "dist" / "app"

    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            request_path = unquote(urlsplit(path).path)
            if request_path in {"/app", "/app/"}:
                return str(app_root / "index.html")
            if request_path.startswith("/app/"):
                return str(app_root / request_path.removeprefix("/app/"))
            return str(app_root / "index.html")

        def log_message(self, format: str, *args: object) -> None:
            return

    server = create_browser_safe_http_server(Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = cast(tuple[str, int], server.server_address)
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


@contextmanager
def _serve_v2_app_with_real_sse(
    repo_root: Path,
    backend: _V2StreamBackend,
    stream_state: _RealSseStreamState,
) -> Iterator[str]:
    app_root = repo_root / "frontend" / "dist" / "app"

    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            request_path = unquote(urlsplit(path).path)
            if request_path in {"/app", "/app/"}:
                return str(app_root / "index.html")
            if request_path.startswith("/app/"):
                return str(app_root / request_path.removeprefix("/app/"))
            return str(app_root / "index.html")

        def do_GET(self) -> None:
            request_url = urlsplit(self.path)
            request_path = unquote(request_url.path)
            if request_path.startswith("/api/"):
                self._handle_api_get(
                    request_path.removeprefix("/api"), request_url.query
                )
                return
            super().do_GET()

        def do_POST(self) -> None:
            request_url = urlsplit(self.path)
            request_path = unquote(request_url.path)
            if request_path.startswith("/api/"):
                self._handle_api_post(request_path.removeprefix("/api"))
                return
            self.send_error(404)

        def log_message(self, format: str, *args: object) -> None:
            return

        def _handle_api_get(self, path: str, query: str) -> None:
            if path == "/system/health":
                self._send_json({"status": "ok"})
                return
            if path == "/workspaces":
                self._send_json([backend._workspace()])
                return
            if path == "/sessions/sidebar":
                self._send_json(
                    [backend._sidebar_session(), backend._alt_sidebar_session()]
                )
                return
            if path == f"/sessions/{_SESSION_ID}":
                self._send_json(backend._session())
                return
            if path == f"/sessions/{_SESSION_ID}/messages":
                self._send_json(backend._messages())
                return
            if path == f"/sessions/{_SESSION_ID}/rounds":
                self._send_json(backend._rounds_page())
                return
            if path == f"/sessions/{_SESSION_ID}/token-usage":
                self._send_json(backend._token_usage())
                return
            if path == f"/sessions/{_SESSION_ID}/recovery":
                self._send_json(backend._recovery())
                return
            if path == "/roles:options":
                self._send_json(backend._role_options())
                return
            if path == "/system/configs/model/profiles":
                self._send_json(backend._model_profiles())
                return
            if path == "/system/configs/orchestration":
                self._send_json(backend._orchestration())
                return
            if path == "/system/configs/general":
                self._send_json({"shell_safety_policy_enabled": True})
                return
            if path == f"/ag-ui/runs/{_RUN_ID}/events":
                self._handle_run_events(query, run_id=_RUN_ID)
                return
            if path == f"/ag-ui/runs/{_SUBAGENT_RUN_ID}/events":
                self._handle_subagent_run_events(query)
                return
            if path == "/ag-ui/runs/events":
                self._handle_multiplexed_run_events(query)
                return
            self._send_json(
                {"detail": f"Unhandled real SSE mock API route: {path}"}, 404
            )

        def _handle_api_post(self, path: str) -> None:
            if path == "/ag-ui/runs":
                backend.run_created = True
                backend.run_create_count += 1
                backend.run_payload = self._read_json_body()
                self._send_json(
                    {
                        "run_id": _RUN_ID,
                        "session_id": _SESSION_ID,
                        "target_role_id": None,
                    },
                )
                return
            if path == f"/ag-ui/runs/{_RUN_ID}/inject":
                backend.injections.append(self._read_json_body())
                self._send_json(
                    {
                        "action": "inject",
                        "run_id": _RUN_ID,
                        "session_id": _SESSION_ID,
                        "status": "ok",
                    },
                )
                return
            if path == f"/ag-ui/runs/{_RUN_ID}:stop":
                backend.completed = True
                backend.stop_payload = self._read_json_body()
                stream_state.record_stop_request()
                self._send_json({"run_id": _RUN_ID, "scope": "main", "status": "ok"})
                return
            if path == f"/ag-ui/runs/{_RUN_ID}:resume":
                backend.completed = False
                backend.resume_requested = True
                backend.run_created = True
                self._send_json(
                    {
                        "run_id": _RUN_ID,
                        "session_id": _SESSION_ID,
                        "status": "ok",
                    },
                )
                return
            if (
                path
                == f"/ag-ui/runs/{_RUN_ID}/tool-approvals/{_APPROVAL_TOOL_CALL_ID}:resolve"
            ):
                backend.approval_resolutions.append(self._read_json_body())
                backend.pending_tool_approval = False
                self._send_json({"status": "ok"})
                return
            if path == f"/ag-ui/runs/{_RUN_ID}/questions/{_QUESTION_ID}:answer":
                backend.question_answers.append(self._read_json_body())
                backend.pending_user_question = False
                self._send_json({"status": "ok"})
                return
            self._send_json(
                {"detail": f"Unhandled real SSE mock API route: {path}"}, 404
            )

        def _handle_run_events(self, query: str, *, run_id: str) -> None:
            params = parse_qs(query)
            after_event_id = _first_query_int(params, "after_event_id")
            last_event_id = self.headers.get("Last-Event-ID", "")
            stream_state.record_request(
                after_event_id=after_event_id,
                last_event_id=last_event_id,
                run_id=run_id,
            )
            self._send_sse_headers()
            if stream_state.claim_initial_stream(after_event_id):
                if stream_state.server_error_initial_stream:
                    self._write_sse_error_event(_REAL_SSE_UNAVAILABLE_MESSAGE)
                    stream_state.record_initial_stream_finished()
                    time.sleep(0.2)
                    return
                self._write_sse_event(
                    _ag_ui_event(
                        "run.started", "run_started", 1, {"phase": "streaming"}
                    ),
                )
                self._write_sse_event(
                    _ag_ui_event(
                        "message.text.delta",
                        "text_delta",
                        2,
                        {"text": _FIRST_CHUNK},
                    ),
                )
                if stream_state.hold_initial_stream_after_first_chunk:
                    stream_state.wait_for_initial_stream_release(timeout_seconds=10.0)
                    stream_state.record_initial_stream_finished()
                    return
                if stream_state.malformed_initial_stream:
                    self._write_malformed_sse_event()
                    stream_state.record_initial_stream_finished()
                    time.sleep(0.2)
                    return
                if stream_state.stop_initial_stream:
                    backend.completed = True
                    self._write_sse_event(
                        _ag_ui_event(
                            "run.stopped",
                            "run_stopped",
                            3,
                            {"status": "stopped"},
                        ),
                    )
                    stream_state.record_initial_stream_finished()
                    return
                if stream_state.fail_initial_stream:
                    backend.completed = True
                    self._write_sse_event(
                        _ag_ui_event(
                            "run.failed",
                            "run_failed",
                            3,
                            {
                                "error_code": "provider_stream_failed",
                                "error_message": _REAL_SSE_FAILURE_MESSAGE,
                            },
                        ),
                    )
                    stream_state.record_initial_stream_finished()
                    return
                if stream_state.hold_initial_stream_until_stop:
                    stream_state.wait_for_stop_request(timeout_seconds=10.0)
                    self._write_sse_event(
                        _ag_ui_event(
                            "run.stopped",
                            "run_stopped",
                            3,
                            {"status": "stopped"},
                        ),
                    )
                stream_state.record_initial_stream_finished()
                return
            if after_event_id >= 7:
                self._write_sse_event(
                    _ag_ui_event(
                        "run.resumed",
                        "run_resumed",
                        8,
                        {"phase": "streaming"},
                    ),
                )
                self._write_sse_event(
                    _ag_ui_event(
                        "message.text.delta",
                        "text_delta",
                        9,
                        {"text": _RESUMED_CHUNK},
                    ),
                )
                time.sleep(0.2)
                backend.completed = True
                self._write_sse_event(
                    _ag_ui_event(
                        "run.completed",
                        "run_completed",
                        10,
                        {"status": "completed"},
                    ),
                )
                time.sleep(0.5)
                return
            if after_event_id < 2:
                time.sleep(5.0)
                return
            if stream_state.rich_replay_on_resume:
                self._write_rich_replay_events()
                return
            if stream_state.replay_duplicate_event_on_resume:
                self._write_sse_event(
                    _ag_ui_event(
                        "message.text.delta",
                        "text_delta",
                        2,
                        {"text": _FIRST_CHUNK},
                    ),
                )
                self._write_sse_event(
                    _ag_ui_event(
                        "message.text.delta",
                        "text_delta",
                        3,
                        {"text": _REAL_SSE_AFTER_DUPLICATE_REPLAY_CHUNK},
                    ),
                )
                time.sleep(0.2)
                backend.completed = True
                self._write_sse_event(
                    _ag_ui_event(
                        "run.completed",
                        "run_completed",
                        4,
                        {"status": "completed"},
                    ),
                )
                time.sleep(0.5)
                return
            self._write_sse_event(
                _ag_ui_event(
                    "message.text.delta",
                    "text_delta",
                    3,
                    {"text": _REAL_SSE_RESUMED_CHUNK},
                ),
            )
            time.sleep(0.2)
            backend.completed = True
            self._write_sse_event(
                _ag_ui_event(
                    "run.completed",
                    "run_completed",
                    4,
                    {"status": "completed"},
                ),
            )
            time.sleep(0.5)

        def _write_rich_replay_events(self) -> None:
            for event in [
                _ag_ui_event(
                    "thinking.started",
                    "thinking_started",
                    3,
                    {"part_index": 0},
                ),
                _ag_ui_event(
                    "thinking.delta",
                    "thinking_delta",
                    4,
                    {
                        "delta": (
                            f"{_RICH_REPLAY_THINKING_PREFIX}"
                            f"{_RICH_REPLAY_THINKING_SUFFIX}"
                        ),
                        "part_index": 0,
                    },
                ),
                _ag_ui_event(
                    "tool_call.started",
                    "tool_call",
                    5,
                    {
                        "args": {"path": "README.md"},
                        "tool_call_id": _RICH_REPLAY_TOOL_CALL_ID,
                        "tool_name": "read",
                    },
                ),
                _ag_ui_event(
                    "tool_result.completed",
                    "tool_result",
                    6,
                    {
                        "result": {"data": _RICH_REPLAY_TOOL_OUTPUT, "ok": True},
                        "tool_call_id": _RICH_REPLAY_TOOL_CALL_ID,
                        "tool_name": "read",
                    },
                ),
                _ag_ui_event(
                    "token_usage.updated",
                    "token_usage",
                    7,
                    {"input_tokens": 11, "output_tokens": 7, "total_tokens": 18},
                ),
                _ag_ui_event(
                    "model_step.started",
                    "model_step_started",
                    8,
                    {"summary": _RICH_REPLAY_MODEL_STEP},
                ),
                _ag_ui_event(
                    "model_step.finished",
                    "model_step_finished",
                    9,
                    {"summary": f"{_RICH_REPLAY_MODEL_STEP} finished"},
                ),
                _ag_ui_event(
                    "state.snapshot",
                    "state_snapshot",
                    10,
                    {"summary": _RICH_REPLAY_STATE_SNAPSHOT},
                ),
                _ag_ui_event(
                    "state.delta",
                    "state_delta",
                    11,
                    {"summary": _RICH_REPLAY_STATE_DELTA},
                ),
                _ag_ui_event(
                    "todo.updated",
                    "todo_updated",
                    12,
                    {
                        "items": [
                            {
                                "content": "inspect replay hydration",
                                "status": "completed",
                            },
                            {
                                "content": _RICH_REPLAY_TODO_CURRENT,
                                "status": "in_progress",
                            },
                            {
                                "content": "capture replay evidence",
                                "status": "pending",
                            },
                        ],
                        "run_id": _RUN_ID,
                        "session_id": _SESSION_ID,
                        "updated_by_instance_id": "replay-agent",
                        "version": 4,
                    },
                ),
                _ag_ui_event(
                    "notification.requested",
                    "notification_requested",
                    13,
                    {"title": _RICH_REPLAY_NOTIFICATION},
                ),
                _ag_ui_event(
                    "subagent_session.status_changed",
                    "subagent_session_status_changed",
                    14,
                    {"status": "running", "title": _RICH_REPLAY_SUBAGENT_STATUS},
                ),
                _ag_ui_event(
                    "background_task.started",
                    "background_task_started",
                    15,
                    {"title": _RICH_REPLAY_BACKGROUND_TASK},
                ),
                _ag_ui_event(
                    "injection.enqueued",
                    "injection_enqueued",
                    16,
                    {
                        "content": _RICH_REPLAY_INJECTION,
                        "delivery_mode": "queued",
                        "recipient_instance_id": "replay-agent",
                        "source": "user",
                    },
                ),
                _ag_ui_event(
                    "injection.applied",
                    "injection_applied",
                    17,
                    {
                        "content": _RICH_REPLAY_INJECTION_APPLIED,
                        "internal_delivery_mode": "guidance",
                        "recipient_instance_id": "replay-agent",
                        "source": "system",
                    },
                ),
                _ag_ui_event(
                    "user_question.requested",
                    "user_question_requested",
                    18,
                    {
                        "question_id": _RICH_REPLAY_QUESTION_ID,
                        "questions": [{"question": _RICH_REPLAY_QUESTION}],
                    },
                ),
                _ag_ui_event(
                    "user_question.answered",
                    "user_question_answered",
                    19,
                    {
                        "answers": [{"selections": [{"label": "Continue"}]}],
                        "question_id": _RICH_REPLAY_QUESTION_ID,
                    },
                ),
                _ag_ui_event(
                    "subagent.stopped",
                    "subagent_stopped",
                    20,
                    {
                        "instance_id": "subagent-rich",
                        "reason": "stopped_by_user",
                        "role_id": "reviewer",
                        "task_id": "task-rich",
                    },
                ),
                _ag_ui_event(
                    "subagent.resumed",
                    "subagent_resumed",
                    21,
                    {
                        "instance_id": "subagent-rich",
                        "role_id": "reviewer",
                        "task_id": "task-rich",
                    },
                ),
                _ag_ui_event(
                    "run.awaiting_manual_action",
                    "awaiting_manual_action",
                    22,
                    {"root_task_id": "root-rich"},
                ),
                _ag_ui_event(
                    "message.output.delta",
                    "output_delta",
                    23,
                    {
                        "output": [
                            {"kind": "text", "text": _RICH_REPLAY_OUTPUT_TEXT},
                            {
                                "kind": "media_ref",
                                "mime_type": "image/png",
                                "modality": "image",
                                "name": _RICH_REPLAY_OUTPUT_IMAGE,
                                "url": _RICH_REPLAY_OUTPUT_IMAGE_URL,
                            },
                        ],
                    },
                ),
                _ag_ui_event(
                    "tool_call.validation_failed",
                    "tool_input_validation_failed",
                    24,
                    {
                        "details": _RICH_REPLAY_VALIDATION_DETAILS,
                        "reason": _RICH_REPLAY_VALIDATION_REASON,
                        "tool_call_id": "call-v2-rich-validation",
                        "tool_name": "execute_command",
                    },
                ),
            ]:
                self._write_sse_event(event)
            time.sleep(3.0)
            self._write_sse_event(
                _ag_ui_event(
                    "thinking.finished",
                    "thinking_finished",
                    25,
                    {"part_index": 0},
                ),
            )
            backend.completed = True
            self._write_sse_event(
                _ag_ui_event(
                    "run.completed",
                    "run_completed",
                    27,
                    {"status": "completed"},
                ),
            )
            time.sleep(0.5)

        def _handle_subagent_run_events(self, query: str) -> None:
            params = parse_qs(query)
            after_event_id = _first_query_int(params, "after_event_id")
            last_event_id = self.headers.get("Last-Event-ID", "")
            stream_state.record_request(
                after_event_id=after_event_id,
                last_event_id=last_event_id,
                run_id=_SUBAGENT_RUN_ID,
            )
            self._send_sse_headers()
            self._write_sse_event(
                _ag_ui_event(
                    "message.text.delta",
                    "text_delta",
                    1,
                    {"text": _SUBAGENT_MULTIPLEX_CHUNK},
                    role_id="reviewer",
                    run_id=_SUBAGENT_RUN_ID,
                ),
            )
            time.sleep(0.2)
            self._write_sse_event(
                _ag_ui_event(
                    "run.completed",
                    "run_completed",
                    2,
                    {"status": "completed"},
                    role_id="reviewer",
                    run_id=_SUBAGENT_RUN_ID,
                ),
            )
            time.sleep(0.5)

        def _handle_multiplexed_run_events(self, query: str) -> None:
            params = parse_qs(query)
            run_offsets = _run_offsets_from_query(params)
            stream_state.record_multiplex_request(
                last_event_id=self.headers.get("Last-Event-ID", ""),
                run_offsets=run_offsets,
            )
            self._send_sse_headers()
            if _RUN_ID not in run_offsets or _SUBAGENT_RUN_ID not in run_offsets:
                time.sleep(0.2)
                return
            self._write_sse_event(
                _ag_ui_event(
                    "message.text.delta",
                    "text_delta",
                    1,
                    {"text": _MAIN_MULTIPLEX_CHUNK},
                    run_id=_RUN_ID,
                ),
            )
            self._write_sse_event(
                _ag_ui_event(
                    "message.text.delta",
                    "text_delta",
                    2,
                    {"text": _SUBAGENT_MULTIPLEX_CHUNK},
                    role_id="reviewer",
                    run_id=_SUBAGENT_RUN_ID,
                ),
            )
            time.sleep(0.2)
            self._write_sse_event(
                _ag_ui_event(
                    "run.completed",
                    "run_completed",
                    3,
                    {"status": "completed"},
                    run_id=_RUN_ID,
                ),
            )
            self._write_sse_event(
                _ag_ui_event(
                    "run.completed",
                    "run_completed",
                    4,
                    {"status": "completed"},
                    role_id="reviewer",
                    run_id=_SUBAGENT_RUN_ID,
                ),
            )
            time.sleep(0.5)

        def _read_json_body(self) -> dict[str, object]:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            if not raw_body.strip():
                return {}
            return cast(dict[str, object], json.loads(raw_body))

        def _send_json(
            self,
            payload: dict[str, object] | list[dict[str, object]],
            status: int = 200,
        ) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_sse_headers(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

        def _write_sse_event(self, event: dict[str, object]) -> None:
            event_id = event.get("event_id")
            event_type = event.get("type")
            if not isinstance(event_id, int) or not isinstance(event_type, str):
                raise AssertionError(f"Invalid SSE event: {event}")
            payload = json.dumps(event)
            frame = f"id: {event_id}\nevent: {event_type}\ndata: {payload}\n\n"
            try:
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
                stream_state.record_sent_event_id(event_id)
            except (BrokenPipeError, ConnectionResetError):
                return

        def _write_sse_error_event(self, error_message: str) -> None:
            payload = json.dumps({"error": error_message})
            frame = f"event: error\ndata: {payload}\n\n"
            try:
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

        def _write_malformed_sse_event(self) -> None:
            frame = 'event: message.text.delta\ndata: {"ok": true}\n\n'
            try:
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

    server = create_browser_safe_http_server(Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = cast(tuple[str, int], server.server_address)
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def _install_mock_event_source(page: Page) -> None:
    page.add_init_script(
        """
        (() => {
          window.localStorage.setItem('agentTeams.language', 'en');
          window.localStorage.setItem('agentTeams.themeMode', 'dark');
          window.localStorage.setItem('agent_teams_theme', 'dark');
          window.localStorage.setItem('agentTeams.selectedSessionId', 'session-v2-stream');
          window.localStorage.setItem('agentTeams.selectedWorkspaceId', 'workspace-v2');
          window.localStorage.setItem('agentTeams.shellView', 'chat');

          class MockEventSource {
            constructor(url) {
              this.url = url;
              this.readyState = 1;
              this.onmessage = null;
              this.listeners = new Map();
              window.__v2EventSourceUrls.push(url);
              window.__v2EventSources.push(this);
            }

            addEventListener(type, listener) {
              const listeners = this.listeners.get(type) || [];
              listeners.push(listener);
              this.listeners.set(type, listeners);
            }

            removeEventListener(type, listener) {
              const listeners = this.listeners.get(type) || [];
              this.listeners.set(type, listeners.filter((item) => item !== listener));
            }

            close() {
              this.readyState = 2;
            }

            emit(type, payload, lastEventIdOverride) {
              const data = JSON.stringify(payload);
              const lastEventId = lastEventIdOverride === undefined ||
                lastEventIdOverride === null
                  ? String(payload.event_id || '')
                  : String(lastEventIdOverride);
              const event = new MessageEvent(type, {
                data,
                lastEventId,
              });
              if (type === 'message' && typeof this.onmessage === 'function') {
                this.onmessage(event);
              }
              for (const listener of this.listeners.get(type) || []) {
                listener.call(this, event);
              }
            }

            dispatchTransportError() {
              const event = new Event('error');
              for (const listener of this.listeners.get('error') || []) {
                listener.call(this, event);
              }
            }
          }

          window.__v2EventSources = [];
          window.__v2EventSourceUrls = [];
          window.__v2EmitRunEvent = (payload, lastEventIdOverride) => {
            const source = window.__v2EventSources
              .filter((item) => item.readyState !== 2)
              .at(-1);
            if (!source) {
              throw new Error('No open EventSource to receive the mock event.');
            }
            source.emit('message', payload, lastEventIdOverride);
          };
          window.__v2OpenEventSourceCount = () =>
            window.__v2EventSources.filter((item) => item.readyState !== 2).length;
          window.__v2DispatchTransportError = () => {
            const source = window.__v2EventSources
              .filter((item) => item.readyState !== 2)
              .at(-1);
            if (!source) {
              throw new Error('No open EventSource to receive the mock error.');
            }
            source.dispatchTransportError();
          };
          window.EventSource = MockEventSource;
        })();
        """,
    )


def _install_real_sse_shell_state(page: Page) -> None:
    page.add_init_script(
        """
        (() => {
          window.localStorage.setItem('agentTeams.language', 'en');
          window.localStorage.setItem('agentTeams.themeMode', 'dark');
          window.localStorage.setItem('agent_teams_theme', 'dark');
          window.localStorage.setItem('agentTeams.selectedSessionId', 'session-v2-stream');
          window.localStorage.setItem('agentTeams.selectedWorkspaceId', 'workspace-v2');
          window.localStorage.setItem('agentTeams.shellView', 'chat');
        })();
        """,
    )


def _wait_for_v2_shell(page: Page) -> None:
    page.wait_for_function(
        "() => document.body.dataset.bootstrapState === 'ready'",
        timeout=_WAIT_TIMEOUT_MS,
    )


def _expect_timeline_text_visible(page: Page, text: str) -> None:
    locator = page.get_by_text(text)
    if locator.first.is_visible(timeout=500):
        return
    max_scroll = cast(
        int,
        page.evaluate(
            """
            () => {
              const timeline = document.querySelector('.at-timeline');
              if (!(timeline instanceof HTMLElement)) {
                return 0;
              }
              return Math.max(0, timeline.scrollHeight - timeline.clientHeight);
            }
            """,
        ),
    )
    for ratio in [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]:
        page.evaluate(
            """
            (scrollTop) => {
              const timeline = document.querySelector('.at-timeline');
              if (!(timeline instanceof HTMLElement)) {
                return;
              }
              timeline.scrollTop = scrollTop;
              timeline.dispatchEvent(new Event('scroll'));
            }
            """,
            round(max_scroll * ratio),
        )
        page.wait_for_timeout(150)
        if locator.first.is_visible(timeout=500):
            return
    expect(locator.first).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def _emit_relay_event(
    page: Page,
    event_type: str,
    event_id: int,
    payload: dict[str, object],
    *,
    role_id: str = "MainAgent",
    run_id: str = _RUN_ID,
) -> None:
    _emit_relay_event_with_last_event_id(
        page,
        event_type,
        event_id,
        None,
        payload,
        role_id=role_id,
        run_id=run_id,
    )


def _emit_relay_event_with_last_event_id(
    page: Page,
    event_type: str,
    event_id: int | None,
    last_event_id: str | None,
    payload: dict[str, object],
    *,
    role_id: str = "MainAgent",
    run_id: str = _RUN_ID,
) -> None:
    page.evaluate(
        """
        ([eventType, eventId, lastEventId, payload, runId, roleId]) => {
          window.__v2EmitRunEvent({
            event_id: eventId,
            event_type: eventType,
            occurred_at: '2026-06-25T08:00:03Z',
            payload_json: JSON.stringify(payload),
            role_id: roleId,
            run_id: runId,
            session_id: 'session-v2-stream',
            trace_id: 'trace-v2-stream',
          }, lastEventId);
        }
        """,
        [event_type, event_id, last_event_id, payload, run_id, role_id],
    )


def _dispatch_transport_error_and_wait_for_source_count(
    page: Page,
    source_count: int,
) -> None:
    page.evaluate("() => window.__v2DispatchTransportError()")
    page.wait_for_function(
        f"() => window.__v2EventSourceUrls.length >= {source_count}",
        timeout=_WAIT_TIMEOUT_MS,
    )


def _ag_ui_event(
    event_name: str,
    relay_event_type: str,
    event_id: int,
    payload: dict[str, object],
    *,
    role_id: str = "MainAgent",
    run_id: str = _RUN_ID,
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "payload": payload,
        "relay_event_type": relay_event_type,
        "role_id": role_id,
        "run_id": run_id,
        "session_id": _SESSION_ID,
        "trace_id": "trace-v2-stream",
        "type": event_name,
    }


def _first_query_int(params: dict[str, list[str]], key: str) -> int:
    raw_value = next(iter(params.get(key, ["0"])), "0")
    try:
        return max(0, int(raw_value))
    except ValueError:
        return 0


def _run_offsets_from_query(params: dict[str, list[str]]) -> dict[str, int]:
    run_ids = params.get("run_id", [])
    after_event_ids = params.get("after_event_id", [])
    offsets: dict[str, int] = {}
    for index, run_id in enumerate(run_ids):
        raw_after_event_id = (
            after_event_ids[index] if index < len(after_event_ids) else "0"
        )
        try:
            offsets[run_id] = max(0, int(raw_after_event_id))
        except ValueError:
            offsets[run_id] = 0
    return offsets


def _fulfill_json(
    route: Route,
    payload: dict[str, object] | list[dict[str, object]],
    status: int = 200,
) -> None:
    route.fulfill(
        body=json.dumps(payload),
        content_type="application/json",
        status=status,
    )
