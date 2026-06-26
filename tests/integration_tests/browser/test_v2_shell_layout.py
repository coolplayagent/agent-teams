from __future__ import annotations

from collections.abc import Callable
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
import time
import threading
from typing import cast
from typing import TypedDict
from urllib.parse import parse_qs
from urllib.parse import unquote
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import Page
from playwright.sync_api import Request
from playwright.sync_api import Route
from playwright.sync_api import expect
from playwright.sync_api import sync_playwright

from tests.integration_tests.browser._safe_http_server import (
    create_browser_safe_http_server,
)


_VIEWPORT_WIDTH = 1280
_VIEWPORT_HEIGHT = 720
_WAIT_TIMEOUT_MS = 15_000
_SESSION_ID = "session-v2-shell"
_STREAM_RUN_ID = "run-v2-live"
_SUBAGENT_INSTANCE_ID = "subagent-reviewer-1"
_SUBAGENT_RUN_ID = "subagent_run_reviewer_1"
_WORKSPACE_ID = "workspace-v2-shell"
_IMAGE_DATA_URL = (
    "data:image/svg+xml;charset=utf-8,"
    "%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20"
    "width%3D%22320%22%20height%3D%22180%22%20viewBox%3D%220%200%20320%20180%22%3E"
    "%3Crect%20width%3D%22320%22%20height%3D%22180%22%20rx%3D%2214%22%20fill%3D%22%232f6f5e%22%2F%3E"
    "%3Cpath%20d%3D%22M34%20124L105%2074l54%2038%2049-64%2078%2076%22%20"
    "fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%2218%22%20"
    "stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%22.88%22%2F%3E"
    "%3Ccircle%20cx%3D%2282%22%20cy%3D%2256%22%20r%3D%2220%22%20fill%3D%22%23ffffff%22%20"
    "opacity%3D%22.9%22%2F%3E%3C%2Fsvg%3E"
)


class _ShellFrameMetrics(TypedDict):
    bodyOverflow: str
    documentClientHeight: int
    documentClientWidth: int
    documentScrollHeight: int
    documentScrollWidth: int
    scrimLeft: int
    sidebarWidth: int
    workspaceLeft: int
    workspaceWidth: int


class _AppearanceFrameMetrics(TypedDict):
    accent: str
    background: str
    bodyOverflow: str
    documentScrollHeight: int
    foreground: str
    previewHeights: list[int]
    previewWidths: list[int]
    rootTheme: str
    settingsBodyOverflowY: str
    settingsBodyScrollHeight: int
    settingsBodyClientHeight: int


@pytest.fixture()
def browser_page() -> Iterator[Page]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            accept_downloads=True,
            color_scheme="dark",
            viewport={"width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT},
        )
        page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()


def test_v2_sidebar_mouse_resize_persists_after_reload(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        _expect_sidebar_width(page, 260)

        resizer = page.locator(".at-sidebar-resizer")
        expect(resizer).to_have_attribute("aria-valuenow", "260")
        box = resizer.bounding_box()
        assert box is not None
        drag_y = box["y"] + (box["height"] / 2)
        page.mouse.move(box["x"] + (box["width"] / 2), drag_y)
        page.mouse.down()
        page.mouse.move(220, drag_y)
        page.mouse.up()

        _expect_sidebar_width(page, 220)
        expect(resizer).to_have_attribute("aria-valuenow", "220")
        assert (
            page.evaluate("() => localStorage.getItem('agentTeams.sidebarWidth')")
            == "220"
        )
        assert (
            page.evaluate(
                "() => localStorage.getItem('agentTeams.sidebarWidthMigratedTo260')",
            )
            == "true"
        )

        page.reload()
        _wait_for_v2_shell(page)

        _expect_sidebar_width(page, 220)
        expect(page.locator(".at-sidebar-resizer")).to_have_attribute(
            "aria-valuenow",
            "220",
        )


def test_v2_stream_replay_resumes_from_recovery_cursor_after_reload(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("textbox", name="Prompt").fill("Stream replay probe")
        page.get_by_role("button", name="Send").click()
        _wait_for_backend_state(
            lambda: len(backend.created_run_payloads) == 1,
            "Run creation request was not captured.",
        )
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=0')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '1',
            )
            """,
            _stream_text_event(1, "First live stream chunk."),
        )
        expect(page.get_by_text("First live stream chunk.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        backend.recovery_active_run = _stream_recovery_run(1)
        page.reload()
        _wait_for_v2_shell(page)
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=1')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '1',
            )
            """,
            _stream_text_event(1, "First live stream chunk."),
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '2',
            )
            """,
            _stream_text_event(2, "Second replay stream chunk."),
        )

        expect(page.get_by_text("Second replay stream chunk.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("First live stream chunk.")).to_have_count(0)


def test_v2_stream_transport_interrupt_reconnects_from_latest_event(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("textbox", name="Prompt").fill("Interrupted stream probe")
        page.get_by_role("button", name="Send").click()
        _wait_for_backend_state(
            lambda: len(backend.created_run_payloads) == 1,
            "Run creation request was not captured.",
        )
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=0')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '1',
            )
            """,
            _stream_text_event(1, "Before transport interruption."),
        )
        expect(page.get_by_text("Before transport interruption.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate("() => window.__v2StreamHarness.transportError(0)")
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 2
              && window.__v2StreamHarness.urls()[1]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=1')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              1,
              'message.text.delta',
              event,
              '2',
            )
            """,
            _stream_text_event(2, "After transport reconnect."),
        )

        expect(page.get_by_text("Before transport interruption.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("After transport reconnect.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_stream_terminal_event_closes_stream_and_restores_composer(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("textbox", name="Prompt").fill("Terminal stream probe")
        page.get_by_role("button", name="Send").click()
        _wait_for_backend_state(
            lambda: len(backend.created_run_payloads) == 1,
            "Run creation request was not captured.",
        )
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=0')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_role("button", name="Stop")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '1',
            )
            """,
            _stream_text_event(1, "Terminal run answer."),
        )
        expect(page.get_by_text("Terminal run answer.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'run.completed',
              event,
              '2',
            )
            """,
            _stream_terminal_event(2, "run_completed"),
        )

        page.wait_for_function(
            "() => window.__v2StreamHarness?.closedStates()[0] === true",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_role("button", name="Stop")).to_have_count(0)
        expect(page.get_by_role("textbox", name="Prompt")).to_be_enabled(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.get_by_role("textbox", name="Prompt").fill("Follow-up after completion")
        expect(page.get_by_role("button", name="Send")).to_be_enabled(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("Terminal run answer.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_stream_tool_replay_keeps_cards_after_reconnect(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("textbox", name="Prompt").fill("Tool replay probe")
        page.get_by_role("button", name="Send").click()
        _wait_for_backend_state(
            lambda: len(backend.created_run_payloads) == 1,
            "Run creation request was not captured.",
        )
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=0')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'tool_call.started',
              event,
              '1',
            )
            """,
            _stream_tool_call_event(1),
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'tool_result.completed',
              event,
              '2',
            )
            """,
            _stream_tool_error_event(2),
        )

        expect(page.get_by_text("Tool call: read")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("Tool error: read")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(".at-message-tool-preview", has_text="File not found: ."),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        page.evaluate("() => window.__v2StreamHarness.transportError(0)")
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 2
              && window.__v2StreamHarness.urls()[1]
                .includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=2')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              1,
              'tool_result.completed',
              event,
              '2',
            )
            """,
            _stream_tool_error_event(2),
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              1,
              'tool_call.validation_failed',
              event,
              '3',
            )
            """,
            _stream_tool_validation_event(3),
        )

        expect(page.get_by_text("Tool error: read")).to_have_count(1)
        expect(page.get_by_text("Tool validation: read")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(
                ".at-message-tool-preview",
                has_text="Input validation failed before tool execution.",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-stream"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-tool-reconnect.png"))


def test_v2_recovery_approval_and_question_actions_call_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    backend.recovery_active_run = {
        "last_event_id": 42,
        "pending_tool_approval_count": 1,
        "pending_user_question_count": 1,
        "phase": "awaiting_tool_approval",
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "should_show_recover": False,
        "status": "paused",
        "stream_connected": False,
    }
    backend.pending_tool_approvals = [
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
            "args_preview": '{"path":"README.md"}',
            "tool_call_id": "tool-approval-1",
            "tool_name": "read",
        }
    ]
    backend.pending_user_questions = [
        {
            "question_id": "question-1",
            "questions": [
                {
                    "multiple": False,
                    "options": [
                        {
                            "description": "Keep streaming",
                            "label": "Continue",
                        },
                        {"label": "Stop"},
                    ],
                    "question": "Pick next step",
                }
            ],
            "role_id": "Planner",
            "run_id": _STREAM_RUN_ID,
        }
    ]
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        recovery = page.locator(".at-recovery")
        expect(recovery.get_by_text("Run run-v2-live is awaiting_tool_approval")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text("read", exact=True)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        screenshot_dir = repo_root / ".tmp" / "frontend-v2-recovery"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-recovery-actions.png"))

        recovery.get_by_label("Approval feedback").fill("Looks safe")
        recovery.get_by_role("button", name="Allow once").click()

        _wait_for_backend_state(
            lambda: len(backend.tool_approval_resolve_payloads) == 1,
            "Tool approval resolution request was not captured.",
        )
        assert backend.tool_approval_resolve_payloads == [
            {
                "payload": {
                    "action": "approve",
                    "feedback": "Looks safe",
                    "option_id": "allow_once",
                },
                "run_id": _STREAM_RUN_ID,
                "tool_call_id": "tool-approval-1",
            }
        ]
        expect(recovery.get_by_text("read", exact=True)).to_have_count(0)

        recovery.get_by_label("Continue - Keep streaming").click()
        recovery.get_by_role("button", name="Answer").click()
        _wait_for_backend_state(
            lambda: len(backend.question_answer_payloads) == 1,
            "User question answer request was not captured.",
        )
        assert backend.question_answer_payloads == [
            {
                "payload": {
                    "answers": [
                        {
                            "selections": [
                                {
                                    "label": "Continue",
                                }
                            ]
                        }
                    ]
                },
                "question_id": "question-1",
                "run_id": _STREAM_RUN_ID,
            }
        ]
        expect(recovery.get_by_text("Planner needs input")).to_have_count(0)


def test_v2_recovery_resume_stopped_run_reconnects_from_checkpoint(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    backend.recovery_active_run = {
        "last_event_id": 42,
        "pending_tool_approval_count": 0,
        "pending_user_question_count": 0,
        "phase": "stopped",
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "should_show_recover": True,
        "status": "stopped",
        "stream_connected": False,
    }
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        recovery = page.locator(".at-recovery")
        expect(recovery.get_by_text("Run run-v2-live is stopped")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_role("button", name="Resume")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert page.evaluate("() => window.__v2StreamHarness?.urls().length === 0")

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-recovery"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-recovery-resume-before.png"))

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/ag-ui/runs/run-v2-live:resume")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            recovery.get_by_role("button", name="Resume").click()

        assert backend.resume_run_requests == [_STREAM_RUN_ID]
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=42')
            )
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_role("button", name="Resume")).to_have_count(0)

        page.evaluate(
            """
            (event) => {
              const urls = window.__v2StreamHarness.urls();
              const index = urls.findIndex((url) =>
                url.includes('/api/ag-ui/runs/run-v2-live/events?after_event_id=42')
              );
              window.__v2StreamHarness.dispatch(
                index,
                'message.text.delta',
                event,
                '43',
              );
            }
            """,
            _stream_text_event(43, "Resumed stopped run output."),
        )
        expect(page.get_by_text("Resumed stopped run output.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert page.evaluate("() => document.body.scrollHeight === window.innerHeight")
        page.screenshot(path=str(screenshot_dir / "v2-recovery-resume-after.png"))


def test_v2_recovery_background_subagent_stream_renders_in_timeline(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    backend.recovery_active_run = {
        "last_event_id": 5,
        "pending_tool_approval_count": 0,
        "pending_user_question_count": 0,
        "phase": "running",
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "should_show_recover": False,
        "status": "running",
        "stream_connected": False,
    }
    backend.recovery_background_tasks = [
        {
            "background_task_id": "background-subagent-1",
            "command": "subagent:reviewer",
            "cwd": "C:/repo",
            "execution_mode": "background",
            "kind": "subagent",
            "recent_output": ["reviewer booted"],
            "run_id": _STREAM_RUN_ID,
            "session_id": _SESSION_ID,
            "status": "running",
            "subagent_run_id": "subagent-run-1",
        }
    ]
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        recovery = page.locator(".at-recovery")
        expect(recovery.get_by_text("subagent:reviewer")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.wait_for_function(
            """
            () => {
              const urls = window.__v2StreamHarness?.urls() || [];
              if (urls.length !== 1) return false;
              const url = urls[0];
              return url.includes('/api/ag-ui/runs/events?')
                && url.includes('run_id=run-v2-live')
                && url.includes('after_event_id=5')
                && url.includes('run_id=subagent-run-1')
                && url.includes('after_event_id=0');
            }
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '6',
            )
            """,
            _stream_text_event(6, "Parent orchestration still running."),
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '1',
            )
            """,
            _stream_text_event_for_run(
                1,
                "subagent-run-1",
                "Reviewer subagent stream output.",
                "reviewer",
            ),
        )

        expect(page.get_by_text("Parent orchestration still running.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("Reviewer subagent stream output.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert page.evaluate("() => document.body.scrollHeight === window.innerHeight")

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-recovery"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-background-subagent-stream.png"))


def test_v2_recovery_background_task_stop_refreshes_snapshot(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    backend.recovery_background_tasks = [
        {
            "background_task_id": "background-task-1",
            "command": "python worker.py",
            "cwd": "C:/repo",
            "execution_mode": "background",
            "kind": "command",
            "recent_output": ["worker booted"],
            "run_id": "background-run-1",
            "session_id": _SESSION_ID,
            "status": "running",
        }
    ]
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        recovery = page.locator(".at-recovery")
        expect(recovery.get_by_text("Background task is still active")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text("python worker.py")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(recovery.get_by_text("Running")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-recovery"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-background-task-stop-before.png"))

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith(
                    "/api/runs/background-run-1/background-tasks/background-task-1:stop"
                )
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            recovery.get_by_role("button", name="Stop").click()

        assert backend.background_task_stop_requests == [
            {
                "background_task_id": "background-task-1",
                "run_id": "background-run-1",
            }
        ]
        expect(page.locator(".at-recovery")).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
        assert page.evaluate("() => document.body.scrollHeight === window.innerHeight")
        page.screenshot(path=str(screenshot_dir / "v2-background-task-stop-after.png"))


def test_v2_persisted_subagent_session_stream_resumes_from_sidebar(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend(include_subagent_session=True)
    page.route("**/api/**", backend.route)
    _install_shell_state(page, event_source_script=_stream_event_source_script())

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("button", name="Toggle subagent sessions").click()
        subagent_button = page.get_by_role(
            "button",
            name="Open subagent session Reviewer review pass",
        )
        expect(subagent_button).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        subagent_button.click()

        subagent_view = page.locator(".at-subagent-session-view")
        expect(
            subagent_view.get_by_role("heading", name="Reviewer review pass"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(subagent_view.get_by_text("Read-only subagent session")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(subagent_view.get_by_text("Persisted reviewer note.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        _wait_for_backend_state(
            lambda: backend.subagent_messages_request_count >= 1,
            "Subagent messages were not requested.",
        )
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 1
              && window.__v2StreamHarness.urls()[0]
                .includes('/api/ag-ui/runs/subagent_run_reviewer_1/events?after_event_id=4')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              0,
              'message.text.delta',
              event,
              '5',
            )
            """,
            _stream_text_event_for_run(
                5,
                _SUBAGENT_RUN_ID,
                "First reviewer live chunk.",
                "reviewer",
            ),
        )
        expect(subagent_view.get_by_text("First reviewer live chunk.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.evaluate("() => window.__v2StreamHarness.transportError(0)")
        page.wait_for_function(
            """
            () => window.__v2StreamHarness?.urls().length === 2
              && window.__v2StreamHarness.urls()[1]
                .includes('/api/ag-ui/runs/subagent_run_reviewer_1/events?after_event_id=5')
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              1,
              'message.text.delta',
              event,
              '5',
            )
            """,
            _stream_text_event_for_run(
                5,
                _SUBAGENT_RUN_ID,
                "First reviewer live chunk.",
                "reviewer",
            ),
        )
        page.evaluate(
            """
            (event) => window.__v2StreamHarness.dispatch(
              1,
              'message.text.delta',
              event,
              '6',
            )
            """,
            _stream_text_event_for_run(
                6,
                _SUBAGENT_RUN_ID,
                "Second reviewer resumed chunk.",
                "reviewer",
            ),
        )

        expect(subagent_view.get_by_text("First reviewer live chunk.")).to_have_count(1)
        expect(
            subagent_view.get_by_text("Second reviewer resumed chunk."),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        metrics = cast(
            dict[str, object],
            page.evaluate(
                """() => ({
                    bodyHeight: document.body.scrollHeight,
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight,
                    workspaceOverflow: getComputedStyle(
                      document.querySelector('.at-workspace')
                    ).overflow,
                    subagentBodyOverflow: getComputedStyle(
                      document.querySelector('.at-subagent-session-body')
                    ).overflow,
                })""",
            ),
        )
        assert metrics["bodyHeight"] == metrics["viewportHeight"]
        assert metrics["documentHeight"] == metrics["viewportHeight"]
        assert metrics["workspaceOverflow"] == "hidden"
        assert metrics["subagentBodyOverflow"] == "hidden"

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-subagents"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-persisted-subagent-stream.png"))


def test_v2_route_switches_from_v1_and_back(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        screenshot_dir = repo_root / ".tmp" / "frontend-v2-route-switch"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.route(f"{app_url}/api/**", backend.route)
        page.goto(f"{app_url}/")
        _wait_for_v1_shell(page)

        expect(page.locator(".app-shell")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        new_ui_link = page.get_by_role("link", name="Open new interface")
        expect(new_ui_link).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert page.evaluate("() => document.body.scrollHeight <= window.innerHeight")
        page.screenshot(path=str(screenshot_dir / "v1-root-before-switch.png"))

        new_ui_link.click()
        page.wait_for_url(f"{app_url}/app/", timeout=_WAIT_TIMEOUT_MS)
        _wait_for_v2_shell(page)
        expect(page.locator(".at-shell")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.get_by_role("link", name="V1")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert page.evaluate("() => document.body.scrollHeight === window.innerHeight")
        page.screenshot(path=str(screenshot_dir / "v2-after-new-ui-switch.png"))

        page.get_by_role("link", name="V1").click()
        page.wait_for_url(f"{app_url}/", timeout=_WAIT_TIMEOUT_MS)
        _wait_for_v1_shell(page)
        expect(page.locator(".app-shell")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.get_by_role("link", name="Open new interface")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.screenshot(path=str(screenshot_dir / "v1-after-return.png"))


def test_v2_message_export_downloads_html_and_png(
    browser_page: Page,
    tmp_path: Path,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        expect(page.get_by_role("button", name="Export messages")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        rounds_request_count_before_export = backend.rounds_request_count

        page.get_by_role("button", name="Export messages").click()
        with page.expect_download() as html_download_info:
            page.get_by_role("menuitem", name="HTML").click()
        html_download = html_download_info.value
        assert html_download.suggested_filename == "session-v2-shell-messages.html"
        html_path = tmp_path / html_download.suggested_filename
        html_download.save_as(html_path)
        html = html_path.read_text(encoding="utf-8")
        assert "<title>session-v2-shell transcript</title>" in html
        assert "Round 1 prompt" in html
        assert "V2 export prompt" in html
        assert "Exported V2 transcript content" in html

        page.get_by_role("button", name="Export messages").click()
        with page.expect_download() as png_download_info:
            page.get_by_role("menuitem", name="PNG").click()
        png_download = png_download_info.value
        assert png_download.suggested_filename == "session-v2-shell-messages.png"
        png_path = tmp_path / png_download.suggested_filename
        png_download.save_as(png_path)
        assert png_path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
        assert backend.rounds_request_count == rounds_request_count_before_export + 2


def test_v2_round_rail_opens_retry_todo_detail(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        round_rail = page.get_by_role("navigation", name="Rounds")
        expect(round_rail).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        round_button = page.get_by_role(
            "button",
            name="Go to round 1: V2 export prompt",
        )
        expect(round_button).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        button_class = round_button.get_attribute("class") or ""
        assert "is-warning" in button_class
        round_button.hover()

        detail = page.get_by_label("Round detail")
        expect(detail).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(detail.get_by_text("2 pending approvals")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(detail.get_by_text("1 pending questions")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            detail.get_by_text("Retry scheduled: attempt 3/5 · in 3s · rate limited"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            detail.get_by_text("Diagnostic: Waiting for user confirmation"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(detail.get_by_text("Todo")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(detail.get_by_text("2 items")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(detail.get_by_text("Confirm deploy window")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(detail.get_by_text("Capture approval result")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert f"/sessions/{_SESSION_ID}/rounds?limit=100" in backend.requested_urls

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-rounds"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-round-rail-detail.png"))


def test_v2_timeline_image_preview_opens_in_shell(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend(include_image_message=True)
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        image = page.get_by_role("img", name="runtime-preview.svg")
        expect(image).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.get_by_text("runtime-preview.svg")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        preview_mask = page.locator(".at-message-media .ant-image-mask")
        expect(preview_mask).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        preview_mask.click()
        preview = page.locator(".ant-image-preview-wrap")
        expect(preview).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(preview.get_by_role("img", name="runtime-preview.svg")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-resource"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-image-preview-open.png"))


def test_v2_sidebar_module_entries_open_real_surfaces(browser_page: Page) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        expect(page.locator(".at-sidebar-nav")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        assert page.locator(".at-sidebar-nav-label").all_inner_texts() == [
            "Chat",
            "Automation",
            "Skills",
            "Board",
            "Search",
            "Connectors",
            "Memory",
            "Observability",
            "Settings",
        ]

        primary_nav.get_by_role("button", name="Chat").click()
        expect(page.locator(".at-chat-view")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-composer")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        primary_nav.get_by_role("button", name="Automation").click()
        expect(page.get_by_role("button", name="Daily triage")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_text("Keep the V2 shell parity ledger current.")
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        primary_nav.get_by_role("button", name="Skills").click()
        expect(page.get_by_test_id("skills-view")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_role("button", name="Open skill Writer")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        primary_nav.get_by_role("button", name="Board").click()
        expect(page.get_by_test_id("board-todo-todo-v2-shell")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("heading", name="Keep module pages reachable"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        primary_nav.get_by_role("button", name="Search").click()
        expect(page.get_by_test_id("session-search-view")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        primary_nav.get_by_role("button", name="Connectors").click()
        expect(page.get_by_test_id("connectors-view")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_test_id("connector-card-github")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_test_id("runtime-tool-card-rg")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        primary_nav.get_by_role("button", name="Memory").click()
        expect(page.get_by_test_id("memory-view")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_test_id("memory-row-memory-v2-shell")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.get_by_role("heading", name="V2 shell module parity"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        primary_nav.get_by_role("button", name="Observability").click()
        observability = page.locator(".at-surface-view").filter(
            has_text="Observability",
        )
        expect(
            observability.get_by_role("heading", name="Observability")
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(observability.get_by_text("Agent loop")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        primary_nav.get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            settings.get_by_role("navigation", name="Settings sections"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            settings.get_by_role("button", name="Appearance", exact=True),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        for requested_path in [
            "/system/configs",
            "/system/skills/market/clawhub",
            "/observability/overview",
            "/observability/breakdowns",
            "/automation/projects",
            "/automation/projects/aut-daily",
            "/automation/projects/aut-daily/sessions",
            "/connectors",
            "/connectors/runtime-tools",
            "/boards/todos",
            "/memories",
            f"/workspaces/{_WORKSPACE_ID}/memories/memory-v2-shell",
        ]:
            assert requested_path in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-resource"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-sidebar-modules-memory.png"))


def test_v2_connectors_runtime_tools_actions_call_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    page.add_init_script(
        """
        (() => {
          window.__runtimeToolCopiedPaths = [];
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText: async (value) => {
                window.__runtimeToolCopiedPaths.push(String(value));
              },
            },
          });
        })();
        """,
    )
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Connectors").click()

        runtime_tools = page.get_by_test_id("runtime-tools-section")
        expect(runtime_tools).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        ripgrep_card = page.get_by_test_id("runtime-tool-card-rg")
        expect(ripgrep_card).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(ripgrep_card.get_by_text("Ready")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(ripgrep_card.get_by_text("Version 14.1.1")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        ripgrep_card.get_by_role("button", name="Copy binary path").click()
        expect(page.get_by_text("Path copied")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        copied_paths = page.evaluate("() => window.__runtimeToolCopiedPaths")
        assert copied_paths == ["C:/Users/yex/.agent-teams/bin/rg.exe"]

        runtime_tools.get_by_role(
            "button",
            name="Add to system environment variables",
        ).click()
        expect(
            runtime_tools.get_by_role(
                "button",
                name="Added to system environment variables",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            page.get_by_text("Runtime tools directory added to system PATH."),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.runtime_tools_system_path_requests == ["add"]
        assert "/connectors/runtime-tools/system-path:add" in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-connectors"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-runtime-tools-actions.png"))


def test_v2_automation_toggle_calls_real_endpoint_and_updates_detail(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Automation").click()

        automation_detail = page.locator(".at-automation-detail")
        expect(
            automation_detail.get_by_role("heading", name="Daily triage"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            automation_detail.get_by_role("button", name="Disable"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        automation_detail.get_by_role("button", name="Disable").click()

        expect(
            automation_detail.get_by_role("button", name="Enable"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            automation_detail.get_by_text("Disabled", exact=True),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.automation_disable_requests == ["aut-daily"]
        assert "/automation/projects/aut-daily:disable" in backend.requested_paths

        automation_detail.get_by_role("button", name="Enable").click()

        expect(
            automation_detail.get_by_role("button", name="Disable"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(
            automation_detail.get_by_text("Enabled", exact=True),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.automation_enable_requests == ["aut-daily"]
        assert "/automation/projects/aut-daily:enable" in backend.requested_paths


def test_v2_board_sync_calls_real_endpoint_and_updates_cards(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Board").click()

        board_view = page.get_by_test_id("board-todos-view")
        expect(board_view.get_by_test_id("board-todo-todo-v2-shell")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(board_view.get_by_text("Revision")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(board_view.get_by_text("9")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        page.get_by_role("button", name="Sync board").click()

        expect(board_view.get_by_test_id("board-todo-todo-v2-synced")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            board_view.get_by_text("Board sync updated the module action"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(board_view.get_by_text("10")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.board_sync_payloads == [
            {
                "include_archived": False,
                "workspace_id": _WORKSPACE_ID,
            }
        ]
        assert "/boards/todos:sync" in backend.requested_paths


def test_v2_board_handoff_preview_and_start_call_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Board").click()

        board_view = page.get_by_test_id("board-todos-view")
        todo_card = board_view.get_by_test_id("board-todo-todo-v2-shell")
        expect(todo_card).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        todo_card.get_by_role("button", name="Start handoff").click()

        drawer = page.get_by_role("dialog", name="Start board TODO")
        expect(drawer).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        final_prompt = drawer.get_by_label("Final prompt")
        expect(final_prompt).to_have_value(
            "Previewed board handoff prompt",
            timeout=_WAIT_TIMEOUT_MS,
        )
        final_prompt.fill("Final browser board handoff prompt")
        drawer.get_by_role("button", name="Start").click()

        expect(page.get_by_text("Board handoff started.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(todo_card.get_by_text("Queued for board todo handoff")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(todo_card.get_by_text("running")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(drawer).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        assert backend.board_handoff_preview_payloads == [
            {
                "queue_if_full": True,
                "view_workspace_id": _WORKSPACE_ID,
            }
        ]
        assert backend.board_handoff_start_payloads == [
            {
                "execution_policy": "fork_git_worktree",
                "final_prompt": "Final browser board handoff prompt",
                "normal_root_role_id": None,
                "orchestration_preset_id": None,
                "queue_if_full": True,
                "runtime_target_id": None,
                "session_mode": None,
                "thinking": {"enabled": False, "effort": None},
                "view_workspace_id": _WORKSPACE_ID,
                "yolo": True,
            }
        ]
        assert "/boards/todos/todo-v2-shell:preview-start" in backend.requested_paths
        assert "/boards/todos/todo-v2-shell:start" in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-board"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-board-handoff-started.png"))


def test_v2_board_request_changes_calls_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Board").click()

        board_view = page.get_by_test_id("board-todos-view")
        review_card = board_view.get_by_test_id("board-todo-todo-v2-review")
        expect(review_card).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        review_card.get_by_role("button", name="Request changes").click()

        drawer = page.get_by_role("dialog", name="Request board changes")
        expect(drawer).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        drawer.get_by_label("Feedback").fill("Tighten the board card action flow.")
        drawer.get_by_role("button", name="Preview request").click()

        final_prompt = drawer.get_by_label("Final prompt")
        expect(final_prompt).to_have_value(
            "Previewed board request changes prompt",
            timeout=_WAIT_TIMEOUT_MS,
        )
        final_prompt.fill("Final browser board request changes prompt")
        drawer.get_by_role("button", name="Request changes").click()

        expect(page.get_by_text("Board change request queued.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            review_card.get_by_text("Queued board change request from browser"),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(review_card.get_by_text("running")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(drawer).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
        assert backend.board_request_changes_preview_payloads == [
            {
                "feedback": "Tighten the board card action flow.",
                "queue_if_full": True,
                "view_workspace_id": _WORKSPACE_ID,
            }
        ]
        assert backend.board_request_changes_payloads == [
            {
                "execution_policy": "current_workspace",
                "feedback": "Tighten the board card action flow.",
                "final_prompt": "Final browser board request changes prompt",
                "queue_if_full": True,
                "runtime_target_id": None,
                "thinking": {"enabled": False, "effort": None},
                "view_workspace_id": _WORKSPACE_ID,
                "yolo": True,
            }
        ]
        assert (
            "/boards/todos/todo-v2-review:preview-request-changes"
            in backend.requested_paths
        )
        assert "/boards/todos/todo-v2-review:request-changes" in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-board"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-board-request-changes.png"))


def test_v2_board_source_settings_call_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        primary_nav = page.get_by_role("navigation", name="Primary navigation")
        primary_nav.get_by_role("button", name="Board").click()

        board_view = page.get_by_test_id("board-todos-view")
        expect(board_view.get_by_test_id("board-todo-todo-v2-shell")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        board_view.get_by_role("button", name="Board sources").click()

        drawer = page.get_by_role("dialog", name="Board sources")
        expect(drawer).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(drawer.get_by_text("GitHub issues", exact=True)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        drawer.get_by_role("button", name="Edit source").click()
        drawer.get_by_label("Name").fill("GitHub issues browser")
        drawer.get_by_role("switch", name="Enabled").click()
        drawer.get_by_role("button", name="Save").click()

        expect(page.get_by_text("Board source saved.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(drawer.get_by_text("GitHub issues browser")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        drawer.get_by_role("button", name="Add source").click()
        drawer.get_by_label("Name").fill("Agent Teams triage")
        drawer.get_by_label("Repository").fill("openai/agent-teams-triage")
        drawer.get_by_role("button", name="Create").click()

        expect(drawer.get_by_text("Agent Teams triage")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        drawer.get_by_role("button", name="Delete source").first.click()
        page.get_by_role("button", name="OK").click()

        expect(page.get_by_text("Board source deleted.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.board_source_update_payloads == [
            {
                "display_name": "GitHub issues browser",
                "enabled": False,
                "repository_full_name": "openai/agent-teams",
                "workspace_id": _WORKSPACE_ID,
            }
        ]
        assert backend.board_source_create_payloads == [
            {
                "display_name": "Agent Teams triage",
                "enabled": True,
                "kind": "github_issues",
                "repository_full_name": "openai/agent-teams-triage",
                "workspace_id": _WORKSPACE_ID,
            }
        ]
        assert backend.board_source_delete_requests == ["source-1"]
        assert "/boards/todo-sources" in backend.requested_paths
        assert "/boards/todo-sources/source-1" in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-board"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-board-source-settings.png"))


def test_v2_workspace_project_view_opens_real_workbench_flow(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role(
            "button",
            name="Open workspace view for agent-teams",
        ).click()
        project_view = page.locator(".at-project-view")
        expect(project_view).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(project_view.get_by_role("heading", name="agent-teams")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            project_view.get_by_text(
                "C:/Users/yex/Documents/workspace/agent-teams",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(project_view.get_by_role("tab", name="Changes 1")).to_have_attribute(
            "aria-selected",
            "true",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            project_view.locator(".at-workspace-diff-path").filter(
                has_text="frontend/app/src/App.tsx",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(project_view.get_by_text("+new")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(project_view.get_by_text("-old")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.get_by_role("tab", name="Files").click()
        expect(project_view.get_by_text("frontend")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(project_view.get_by_text("README.md")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        page.get_by_role("button", name="Open file README.md").click()
        expect(project_view.get_by_text("# Agent Teams")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        snapshot_request_count = backend.snapshot_request_count
        with page.expect_response(
            lambda response: (
                response.request.method == "GET"
                and response.url.endswith(f"/api/workspaces/{_WORKSPACE_ID}/snapshot")
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            page.get_by_role("button", name="Reload workspace view").click()
        assert backend.snapshot_request_count > snapshot_request_count

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and f"/api/workspaces/{_WORKSPACE_ID}:open-root?mount=default"
                in response.url
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            page.get_by_role("button", name="Open folder").click()
        assert backend.open_root_queries == ["mount=default"]
        page.get_by_role("button", name="Back to chat").click()
        expect(project_view).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
        expect(page.locator(".at-composer")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

        for requested_path in [
            f"/workspaces/{_WORKSPACE_ID}/snapshot",
            f"/workspaces/{_WORKSPACE_ID}/tree",
            f"/workspaces/{_WORKSPACE_ID}/diffs",
            f"/workspaces/{_WORKSPACE_ID}/diff",
            f"/workspaces/{_WORKSPACE_ID}/file",
            f"/workspaces/{_WORKSPACE_ID}:open-root",
        ]:
            assert requested_path in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-project"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-project-view-flow.png"))


def test_v2_settings_keeps_v1_sections_and_system_secondary_pages(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        sections = settings.get_by_role("navigation", name="Settings sections")
        expect(sections).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert sections.get_by_role("button").all_inner_texts() == [
            "Appearance",
            "General",
            "Speech",
            "Notifications",
            "Models",
            "Roles",
            "Orchestration",
            "Web",
            "ClawHub",
            "Proxy",
            "Remote workspace",
            "Environment variables",
            "System",
        ]
        for secondary_label in [
            "MCP",
            "Plugins",
            "Commands",
            "Hooks",
            "Agent Runtime",
            "GitHub",
            "Triggers",
        ]:
            expect(sections.get_by_role("button", name=secondary_label)).to_have_count(
                0
            )

        sections.get_by_role("button", name="System").click()
        expect(settings.get_by_role("heading", name="System")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            settings.get_by_text("Global and workspace command files.")
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        system_pages = settings.locator(".at-settings-list-button")
        expect(system_pages.filter(has_text="MCP")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="Plugins")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="Commands")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="Hooks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="Agent Runtime")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="GitHub")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(system_pages.filter(has_text="Triggers")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="MCP").click()
        expect(settings.get_by_role("heading", name="MCP")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("stdio-shell")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("run_command")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="MCP")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Plugins").click()
        expect(settings.get_by_role("heading", name="Plugins")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("workspace-tools")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="Plugins")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Commands").click()
        expect(settings.get_by_role("heading", name="Commands")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("Global commands")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("/opsx:propose")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="Commands")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Hooks").click()
        expect(settings.get_by_role("heading", name="Hooks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            settings.locator(".at-settings-list-row").filter(
                has_text="Session startup setup"
            )
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="Hooks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Agent Runtime").click()
        expect(settings.get_by_role("heading", name="Agent Runtime")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        expect(settings.get_by_text("Codex CLI")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="Agent Runtime")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="GitHub").click()
        expect(settings.get_by_role("heading", name="GitHub")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("GitHub CLI", exact=True)).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("Webhook base URL")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="GitHub")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Triggers").click()
        expect(settings.get_by_role("heading", name="Triggers")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("Feishu Main")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("WeChat Main")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert "/mcp/servers" in backend.requested_paths
        assert "/mcp/servers/stdio-shell/tools" in backend.requested_paths
        assert "/system/configs/plugins/runtime" in backend.requested_paths
        assert "/system/configs/hooks" in backend.requested_paths
        assert "/system/configs/hooks/runtime" in backend.requested_paths
        assert "/system/configs/agent-runtimes" in backend.requested_paths
        assert "/system/commands:catalog" in backend.requested_paths
        assert "/system/configs/github" in backend.requested_paths
        assert "/system/configs/github/webhook/tunnel" in backend.requested_paths
        assert "/gateway/feishu/accounts" in backend.requested_paths
        assert "/gateway/wechat/accounts" in backend.requested_paths


def test_v2_plugins_settings_actions_call_real_endpoints(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)
        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        sections = settings.get_by_role("navigation", name="Settings sections")
        expect(sections.get_by_role("button", name="Plugins")).to_have_count(0)

        sections.get_by_role("button", name="System").click()
        system_pages = settings.locator(".at-settings-list-button")
        system_pages.filter(has_text="Plugins").click()
        expect(settings.get_by_role("heading", name="Plugins")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("workspace-tools")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("quality")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        quality_row = settings.locator(".at-plugin-list-row").filter(
            has_text="quality",
        )
        quality_row.get_by_role("button", name="Enable").click()
        _wait_for_backend_state(
            lambda: backend.plugin_enable_requests
            == [{"name": "quality", "payload": {"scope": "project"}}],
            "Plugin enable request was not captured.",
        )

        workspace_row = settings.locator(".at-plugin-list-row").filter(
            has_text="workspace-tools",
        )
        workspace_row.get_by_role("button", name="Disable").click()
        _wait_for_backend_state(
            lambda: backend.plugin_disable_requests
            == [{"name": "workspace-tools", "payload": {"scope": "user"}}],
            "Plugin disable request was not captured.",
        )

        workspace_row.get_by_role("button", name="Update").click()
        _wait_for_backend_state(
            lambda: backend.plugin_update_requests
            == [
                {
                    "name": "workspace-tools",
                    "payload": {"scope": "user", "version": "1.0.0"},
                }
            ],
            "Plugin update request was not captured.",
        )

        workspace_row.get_by_role("button", name="Delete").click()
        page.get_by_role("button", name="OK", exact=True).click()
        _wait_for_backend_state(
            lambda: backend.plugin_delete_requests
            == [{"name": "workspace-tools", "prune": "false", "scope": "user"}],
            "Plugin delete request was not captured.",
        )
        expect(workspace_row).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
        assert "/system/configs/plugins" in backend.requested_paths
        assert "/system/configs/plugins/runtime" in backend.requested_paths

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-plugin-actions.png"))


def test_v2_hooks_settings_validate_and_save_real_config(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)
        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        sections = settings.get_by_role("navigation", name="Settings sections")
        expect(sections.get_by_role("button", name="Hooks")).to_have_count(0)

        sections.get_by_role("button", name="System").click()
        settings.locator(".at-settings-list-button").filter(has_text="Hooks").click()
        expect(settings.get_by_role("heading", name="Hooks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        editor = settings.get_by_label("Hooks JSON")
        expect(editor).to_have_value(
            json.dumps(backend.hooks_config, indent=2),
            timeout=_WAIT_TIMEOUT_MS,
        )

        settings.get_by_role("button", name="Validate").click()
        _wait_for_backend_state(
            lambda: backend.hooks_validate_payloads == [backend.hooks_config],
            "Hooks validate request was not captured.",
        )

        next_hooks = {
            "hooks": {
                "UserPromptSubmit": [
                    {
                        "hooks": [
                            {
                                "command": "python hooks/prompt.py",
                                "type": "command",
                            }
                        ],
                        "matcher": "*",
                    }
                ]
            }
        }
        editor.fill(json.dumps(next_hooks, indent=2))
        settings.get_by_role("button", name="Save").click()
        _wait_for_backend_state(
            lambda: backend.hooks_save_payloads == [next_hooks],
            "Hooks save request was not captured.",
        )
        expect(editor).to_have_value(json.dumps(next_hooks, indent=2))

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-hooks-editor-save.png"))


def test_v2_roles_settings_validate_delete_and_create_real_config(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)
        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        sections = settings.get_by_role("navigation", name="Settings sections")

        sections.get_by_role("button", name="Roles").click()
        expect(settings.get_by_role("heading", name="Roles")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        reviewer_row = settings.locator(".at-settings-list-button").filter(
            has_text="Reviewer"
        )
        reviewer_row.click()
        expect(settings.get_by_label("Role ID")).to_have_value(
            "reviewer",
            timeout=_WAIT_TIMEOUT_MS,
        )

        settings.get_by_role("button", name="Validate").click()
        _wait_for_backend_state(
            lambda: len(backend.role_validate_payloads) == 1
            and backend.role_validate_payloads[0]["role_id"] == "reviewer",
            "Role validate request was not captured.",
        )

        settings.get_by_role("button", name="Delete").click()
        page.get_by_role("button", name="OK", exact=True).click()
        _wait_for_backend_state(
            lambda: backend.role_delete_requests == ["reviewer"],
            "Role delete request was not captured.",
        )

        settings.get_by_role("button", name="New role").click()
        settings.get_by_label("Role ID").fill("analyst")
        settings.get_by_label("Role name").fill("Analyst")
        settings.get_by_label("Description").fill("Analyzes the current plan.")
        settings.get_by_label("System prompt").fill(
            "Analyze the plan and report risks."
        )
        settings.get_by_role("button", name="Save").click()
        _wait_for_backend_state(
            lambda: len(backend.role_save_payloads) == 1
            and backend.role_save_payloads[0]["role_id"] == "analyst"
            and "file_name" not in backend.role_save_payloads[0]
            and "source" not in backend.role_save_payloads[0],
            "Role save request was not captured.",
        )
        expect(settings.get_by_label("Role ID")).to_have_value("analyst")

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-roles-create-save.png"))


def test_v2_orchestration_settings_default_delete_and_create_real_config(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)
        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        sections = settings.get_by_role("navigation", name="Settings sections")

        sections.get_by_role("button", name="Orchestration").click()
        expect(settings.get_by_role("heading", name="Orchestration")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        shipping_row = settings.locator(".at-settings-list-row").filter(
            has_text="Shipping"
        )
        expect(shipping_row).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        shipping_row.get_by_role("button", name="Set default").click()
        _wait_for_backend_state(
            lambda: len(backend.orchestration_save_payloads) == 1
            and backend.orchestration_save_payloads[0][
                "default_orchestration_preset_id"
            ]
            == "shipping",
            "Orchestration default save request was not captured.",
        )

        settings.get_by_role("button", name="Default 1 roles · Review flow").click()
        expect(settings.get_by_label("Preset ID")).to_have_value(
            "default",
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Delete").click()
        page.get_by_role("button", name="OK", exact=True).click()
        _wait_for_backend_state(
            lambda: len(backend.orchestration_save_payloads) == 2
            and backend.orchestration_save_payloads[1][
                "default_orchestration_preset_id"
            ]
            == "shipping"
            and len(cast(list[object], backend.orchestration_save_payloads[1]["presets"]))
            == 1,
            "Orchestration delete save request was not captured.",
        )

        settings.get_by_role("button", name="New orchestration").click()
        settings.get_by_label("Preset ID").fill("analysis")
        settings.get_by_label("Preset name").fill("Analysis")
        settings.get_by_label("Description").fill("Analysis flow")
        settings.get_by_label("Orchestration prompt").fill(
            "Analyze the work and report risks."
        )
        settings.get_by_role("button", name="Save").click()
        _wait_for_backend_state(
            lambda: len(backend.orchestration_save_payloads) == 3
            and cast(
                list[dict[str, object]],
                backend.orchestration_save_payloads[2]["presets"],
            )[-1]["preset_id"]
            == "analysis"
            and cast(
                list[dict[str, object]],
                backend.orchestration_save_payloads[2]["presets"],
            )[-1]["role_ids"]
            == ["reviewer"],
            "Orchestration create save request was not captured.",
        )
        expect(settings.get_by_label("Preset ID")).to_have_value("analysis")

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-orchestration-create-save.png"))


def test_v2_model_profile_detail_saves_and_tests_existing_profile(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        settings.get_by_role("navigation", name="Settings sections").get_by_role(
            "button",
            name="Models",
        ).click()

        expect(settings.get_by_role("heading", name="Models")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        vision_row = settings.locator(".at-model-profile-row").filter(has_text="vision")
        expect(vision_row).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        vision_row.locator(".at-model-profile-row-main").click()

        profile_id_input = settings.get_by_label("Profile ID")
        expect(profile_id_input).to_have_value("vision", timeout=_WAIT_TIMEOUT_MS)
        expect(settings.get_by_label("Base URL")).to_have_value(
            "https://vision.example/v1",
            timeout=_WAIT_TIMEOUT_MS,
        )

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/system/configs/model:probe")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            settings.get_by_role("button", name="Test").click()

        assert backend.model_probe_payloads == [
            {"profile_name": "vision", "timeout_ms": 15000}
        ]
        expect(settings.get_by_text("Connection ok in 51ms.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        profile_id_input.fill("vision-browser")
        settings.get_by_label("Model").fill("gpt-5.1-vision")
        settings.get_by_label("Base URL").fill("https://vision.changed.example/v1")
        settings.get_by_label("Context window").fill("128000")
        settings.get_by_label("Max tokens").fill("4096")
        settings.get_by_label("Fallback policy").fill("same_provider_then_other_provider")
        settings.get_by_label("SSL verify").fill("true")

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/system/configs/model:reload")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            with page.expect_response(
                lambda response: (
                    response.request.method == "PUT"
                    and response.url.endswith(
                        "/api/system/configs/model/profiles/vision-browser"
                    )
                    and response.status == 200
                ),
                timeout=_WAIT_TIMEOUT_MS,
            ):
                settings.get_by_role("button", name="Save").click()
        assert backend.model_profile_save_requests == ["vision-browser"]
        assert backend.model_profile_save_payloads[-1] == {
            "base_url": "https://vision.changed.example/v1",
            "connect_timeout_seconds": 15,
            "context_window": 128000,
            "fallback_policy_id": "same_provider_then_other_provider",
            "fallback_priority": 0,
            "is_default": False,
            "max_tokens": 4096,
            "model": "gpt-5.1-vision",
            "provider": "openai",
            "source_name": "vision",
            "ssl_verify": True,
            "temperature": 0.7,
            "top_p": 1,
        }
        assert backend.model_profile_reload_count == 1
        expect(page.get_by_text("Saved model profile vision-browser.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_label("Profile ID")).to_have_value(
            "vision-browser",
            timeout=_WAIT_TIMEOUT_MS,
        )
        metrics = cast(
            dict[str, int],
            page.evaluate(
                """() => ({
                    bodyHeight: document.body.scrollHeight,
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight,
                })""",
            ),
        )
        assert metrics["bodyHeight"] == metrics["viewportHeight"]
        assert metrics["documentHeight"] == metrics["viewportHeight"]

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-model-profile-detail.png"))


def test_v2_model_profile_create_from_catalog(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        settings.get_by_role("navigation", name="Settings sections").get_by_role(
            "button",
            name="Models",
        ).click()

        expect(settings.get_by_role("heading", name="Models")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert "/system/configs/model/catalog" not in backend.requested_paths

        with page.expect_response(
            lambda response: (
                response.request.method == "GET"
                and response.url.endswith("/api/system/configs/model/catalog")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            settings.get_by_role("button", name="New profile").click()

        expect(settings.get_by_text("Model catalog")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.locator(".at-model-catalog-option").filter(
            has_text="GPT-5 Catalog",
        ).click()
        expect(settings.locator("input#provider")).to_have_value(
            "openai_compatible",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.locator("input#model")).to_have_value(
            "gpt-5-catalog",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.locator("input#base_url")).to_have_value(
            "https://openai.example/v1",
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.locator("input#profile_id").fill("catalog-browser")

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(
            path=str(screenshot_dir / "v2-model-profile-catalog-picker.png")
        )

        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/system/configs/model:reload")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            with page.expect_response(
                lambda response: (
                    response.request.method == "PUT"
                    and response.url.endswith(
                        "/api/system/configs/model/profiles/catalog-browser"
                    )
                    and response.status == 200
                ),
                timeout=_WAIT_TIMEOUT_MS,
            ):
                settings.get_by_role("button", name="Save").click()

        assert backend.model_profile_save_requests == ["catalog-browser"]
        assert backend.model_profile_save_payloads[-1] == {
            "base_url": "https://openai.example/v1",
            "capabilities": {
                "input": {"image": True, "text": True},
                "output": {"text": True},
            },
            "catalog_model_name": "GPT-5 Catalog",
            "catalog_provider_id": "openai",
            "catalog_provider_name": "OpenAI",
            "connect_timeout_seconds": 15,
            "context_window": 128000,
            "fallback_policy_id": None,
            "fallback_priority": 0,
            "is_default": False,
            "max_tokens": 8192,
            "model": "gpt-5-catalog",
            "provider": "openai_compatible",
            "temperature": 0.7,
            "top_p": 1,
        }
        assert backend.model_profile_reload_count == 1
        expect(page.get_by_text("Saved model profile catalog-browser.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.locator("input#profile_id")).to_have_value(
            "catalog-browser",
            timeout=_WAIT_TIMEOUT_MS,
        )
        metrics = cast(
            dict[str, int],
            page.evaluate(
                """() => ({
                    bodyHeight: document.body.scrollHeight,
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight,
                })""",
            ),
        )
        assert metrics["bodyHeight"] == metrics["viewportHeight"]
        assert metrics["documentHeight"] == metrics["viewportHeight"]

        page.screenshot(path=str(screenshot_dir / "v2-model-profile-catalog-create.png"))


def test_v2_web_settings_save_success_and_error_feedback(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        settings.get_by_role("navigation", name="Settings sections").get_by_role(
            "button",
            name="Web",
        ).click()

        expect(settings.get_by_role("heading", name="Web")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            settings.get_by_text("Leave blank to keep the saved API key."),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        searxng_url = settings.get_by_label("SearXNG instance URL")
        expect(searxng_url).to_have_value(
            "https://search.initial.example/",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("https://searx.space")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        searxng_url.fill("https://search.changed.example/")
        with page.expect_response(
            lambda response: (
                response.request.method == "PUT"
                and response.url.endswith("/api/system/configs/web")
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            settings.get_by_role("button", name="Save").click()

        assert backend.web_save_payloads[-1] == {
            "exa_api_key": "saved-exa-key",
            "fallback_provider": "searxng",
            "provider": "exa",
            "searxng_instance_url": "https://search.changed.example/",
        }
        expect(page.get_by_text("Web settings saved.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        backend.fail_next_web_save = True
        searxng_url.fill("https://search.failed.example/")
        with page.expect_response(
            lambda response: (
                response.request.method == "PUT"
                and response.url.endswith("/api/system/configs/web")
                and response.status == 500
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            settings.get_by_role("button", name="Save").click()

        assert backend.web_save_payloads[-1] == {
            "exa_api_key": "saved-exa-key",
            "fallback_provider": "searxng",
            "provider": "exa",
            "searxng_instance_url": "https://search.failed.example/",
        }
        assert backend.web_config["searxng_instance_url"] == (
            "https://search.changed.example/"
        )
        expect(
            page.get_by_text("Web settings save failed in browser test."),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def test_v2_remote_workspace_delete_requires_confirmation(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        settings.get_by_role("navigation", name="Settings sections").get_by_role(
            "button",
            name="Remote workspace",
        ).click()

        expect(settings.get_by_role("heading", name="Remote workspace")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_role("heading", name="devbox")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("dev.example.com · yex · 22").first).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        settings.get_by_role("button", name="Delete").click()
        confirm = page.get_by_role("dialog").filter(
            has_text='Delete SSH profile "devbox"?',
        )
        expect(confirm).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        assert backend.ssh_delete_requests == []

        confirm.get_by_role("button", name="Cancel").click()
        expect(confirm).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
        assert backend.ssh_delete_requests == []
        expect(settings.get_by_role("heading", name="devbox")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        settings.get_by_role("button", name="Delete").click()
        confirm = page.get_by_role("dialog").filter(
            has_text='Delete SSH profile "devbox"?',
        )
        expect(confirm).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        with page.expect_response(
            lambda response: (
                response.request.method == "DELETE"
                and response.url.endswith(
                    "/api/system/configs/workspace/ssh-profiles/devbox"
                )
                and response.status == 200
            ),
            timeout=_WAIT_TIMEOUT_MS,
        ):
            confirm.get_by_role("button", name="Delete").click()

        assert backend.ssh_delete_requests == ["devbox"]
        expect(page.get_by_text("Deleted SSH profile devbox.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(settings.get_by_text("No SSH profiles.")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )


def test_v2_appearance_dark_preset_keeps_settings_frame_fixed(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.locator(".at-topbar").get_by_role("button", name="Settings").click()
        settings = page.get_by_role("dialog", name="Settings")
        expect(settings).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(settings.get_by_role("heading", name="Appearance")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        dark_theme = settings.get_by_role("button", name="Dark")
        expect(dark_theme).to_have_attribute("aria-pressed", "true")
        preset_button = settings.get_by_role("button", name="Theme preset")
        expect(preset_button).to_contain_text("Codex", timeout=_WAIT_TIMEOUT_MS)
        preset_button.click()
        listbox = settings.get_by_role("listbox")
        expect(listbox).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        listbox.get_by_role("option", name="Rose Pine").click()

        expect(settings.get_by_role("listbox")).to_have_count(
            0,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(preset_button).to_contain_text("Rose Pine", timeout=_WAIT_TIMEOUT_MS)

        appearance = cast(
            dict[str, object],
            page.evaluate(
                "() => JSON.parse(window.localStorage.getItem('agent_teams_appearance') || '{}')",
            ),
        )
        assert appearance["themePreset"] == "rose-pine"
        assert appearance["accent"] == "#C4A7E7"
        assert appearance["background"] == "#191724"
        assert appearance["foreground"] == "#E0DEF4"

        metrics = _appearance_frame_metrics(page)
        assert metrics["rootTheme"] == "dark"
        assert metrics["accent"] == "#C4A7E7"
        assert metrics["background"] == "#191724"
        assert metrics["foreground"] == "#E0DEF4"
        assert metrics["bodyOverflow"] == "hidden"
        assert metrics["documentScrollHeight"] == _VIEWPORT_HEIGHT
        assert metrics["settingsBodyOverflowY"] == "auto"
        assert metrics["settingsBodyScrollHeight"] > metrics["settingsBodyClientHeight"]
        assert len(metrics["previewHeights"]) == 3
        assert all(height >= 110 for height in metrics["previewHeights"])
        assert all(width >= 160 for width in metrics["previewWidths"])

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-settings-appearance"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-appearance-dark-rose-pine.png"))


def test_v2_narrow_shell_keeps_workspace_fixed_under_sidebar_overlay(
    browser_page: Page,
) -> None:
    page = browser_page
    page.set_viewport_size({"height": 740, "width": 390})
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.wait_for_function(
            """
            () => window.matchMedia('(max-width: 760px)').matches
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-sidebar")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.locator(".at-sidebar-scrim")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator(".at-sidebar-resizer")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )

        open_metrics = _shell_frame_metrics(page)
        assert open_metrics["bodyOverflow"] == "hidden"
        assert open_metrics["documentClientHeight"] == 740
        assert open_metrics["documentScrollHeight"] == 740
        assert open_metrics["documentScrollWidth"] <= 391
        assert open_metrics["workspaceLeft"] == 0
        assert open_metrics["workspaceWidth"] == 390
        assert open_metrics["sidebarWidth"] <= 346
        assert open_metrics["scrimLeft"] >= open_metrics["sidebarWidth"]

        page.get_by_role("button", name="Close sidebar").click()
        expect(page.locator(".at-sidebar")).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
        closed_metrics = _shell_frame_metrics(page)
        assert closed_metrics["documentScrollHeight"] == 740
        assert closed_metrics["documentScrollWidth"] <= 391
        assert closed_metrics["workspaceLeft"] == 0
        assert closed_metrics["workspaceWidth"] == 390

        page.get_by_role("button", name="Toggle sidebar").click()
        expect(page.locator(".at-sidebar")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(page.locator(".at-sidebar-scrim")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-shell"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-narrow-sidebar-overlay.png"))


def test_v2_observability_topbar_opens_and_switches_scope(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2ShellBackend()
    page.route("**/api/**", backend.route)
    _install_shell_state(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        page.get_by_role("button", name="Observability").click()
        observability = page.locator(".at-surface-view").filter(
            has_text="Observability",
        )
        expect(
            observability.get_by_role("heading", name="Observability")
        ).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            observability.locator(".at-stat")
            .filter(has_text="Steps")
            .filter(
                has_text="12",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(observability.get_by_text("Agent loop")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        observability.get_by_text("Session", exact=True).click()
        expect(
            observability.locator(".at-stat")
            .filter(has_text="Steps")
            .filter(
                has_text="3",
            ),
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        expect(observability.get_by_text("Session tools")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        spec_lineage = observability.locator(".at-spec-lineage")
        expect(spec_lineage.get_by_role("heading", name="Spec lineage")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        expect(spec_lineage.get_by_label("Task")).to_have_value(
            "task-v2-spec",
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(spec_lineage.get_by_text("Requirements")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(spec_lineage.get_by_text("+ Keep V2 spec diff visible")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        assert (
            "/observability/overview?scope=global&time_window_minutes=1440"
            in backend.requested_urls
        )
        assert (
            "/observability/breakdowns?scope=global&time_window_minutes=1440"
            in backend.requested_urls
        )
        assert (
            "/observability/overview?"
            f"scope=session&scope_id={_SESSION_ID}&time_window_minutes=1440"
            in backend.requested_urls
        )
        assert (
            "/observability/breakdowns?"
            f"scope=session&scope_id={_SESSION_ID}&time_window_minutes=1440"
            in backend.requested_urls
        )
        assert "/tasks/runs/run-v2-shell?include_root=true" in backend.requested_urls
        assert "/tasks/task-v2-spec/spec-artifacts" in backend.requested_urls
        assert (
            "/tasks/task-v2-spec/spec-artifacts/2/diff?from_version=1"
            in backend.requested_urls
        )
        assert (
            "/tasks/task-v2-spec/spec-checkpoint-evaluations" in backend.requested_urls
        )

        screenshot_dir = repo_root / ".tmp" / "frontend-v2-observability"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_dir / "v2-observability-session.png"))
        spec_lineage.scroll_into_view_if_needed()
        page.screenshot(
            path=str(screenshot_dir / "v2-observability-spec-lineage.png"),
        )


class _V2ShellBackend:
    def __init__(
        self,
        *,
        include_image_message: bool = False,
        include_subagent_session: bool = False,
    ) -> None:
        self.include_image_message = include_image_message
        self.include_subagent_session = include_subagent_session
        self.fail_next_web_save = False
        self.automation_enable_requests: list[str] = []
        self.automation_disable_requests: list[str] = []
        self.automation_project_status = "enabled"
        self.board_handoff_preview_payloads: list[dict[str, object]] = []
        self.board_handoff_start_payloads: list[dict[str, object]] = []
        self.board_handoff_started = False
        self.board_request_changes_payloads: list[dict[str, object]] = []
        self.board_request_changes_preview_payloads: list[dict[str, object]] = []
        self.board_request_changes_started = False
        self.board_source_create_payloads: list[dict[str, object]] = []
        self.board_source_delete_requests: list[str] = []
        self.board_source_display_name = "GitHub issues"
        self.board_source_enabled = True
        self.board_source_created = False
        self.board_source_deleted = False
        self.board_source_update_payloads: list[dict[str, object]] = []
        self.board_sync_payloads: list[dict[str, object]] = []
        self.open_root_queries: list[str] = []
        self.requested_paths: list[str] = []
        self.requested_urls: list[str] = []
        self.rounds_request_count = 0
        self.subagent_messages_request_count = 0
        self.runtime_tools_system_path_added = False
        self.runtime_tools_system_path_requests: list[str] = []
        self.role_delete_requests: list[str] = []
        self.role_save_payloads: list[dict[str, object]] = []
        self.role_validate_payloads: list[dict[str, object]] = []
        self.created_run_payloads: list[dict[str, object]] = []
        self.role_configs: dict[str, dict[str, object]] = {
            "main": {
                "bound_agent_id": None,
                "content": "---\nname: Main Agent\n---\nHandle work.",
                "deletable": False,
                "description": "Main role",
                "file_name": "main.md",
                "mcp_servers": ["filesystem"],
                "memory_profile": {"enabled": True},
                "mode": "primary",
                "model_profile": "default",
                "name": "Main Agent",
                "role_id": "main",
                "skills": ["core"],
                "source": "app",
                "source_role_id": "main",
                "system_prompt": "Handle work.",
                "tools": ["read_file"],
                "version": "1.0.0",
            },
            "reviewer": {
                "bound_agent_id": "codex-local",
                "content": "---\nname: Reviewer\n---\nReview carefully.",
                "deletable": True,
                "description": "Review changes",
                "file_name": "reviewer.md",
                "mcp_servers": ["filesystem"],
                "memory_profile": {"enabled": True},
                "mode": "subagent",
                "model_profile": "default",
                "name": "Reviewer",
                "role_id": "reviewer",
                "skills": ["review"],
                "source": "project",
                "source_role_id": "reviewer",
                "system_prompt": "Review carefully.",
                "tools": ["read_file"],
                "version": "1.0.0",
            },
        }
        self.orchestration_save_payloads: list[dict[str, object]] = []
        self.orchestration_config: dict[str, object] = {
            "default_orchestration_preset_id": "default",
            "presets": [
                {
                    "description": "Review flow",
                    "graph": {
                        "nodes": [
                            {
                                "id": "review",
                                "role_id": "reviewer",
                            }
                        ]
                    },
                    "name": "Default",
                    "orchestration_prompt": "Coordinate review work.",
                    "policy": {
                        "max_orchestration_cycles": 8,
                        "max_parallel_delegated_tasks": 4,
                    },
                    "preset_id": "default",
                    "role_ids": ["reviewer"],
                },
                {
                    "description": "Ship flow",
                    "name": "Shipping",
                    "orchestration_prompt": "Ship completed work.",
                    "policy": {
                        "max_orchestration_cycles": 6,
                        "max_parallel_delegated_tasks": 2,
                    },
                    "preset_id": "shipping",
                    "role_ids": ["reviewer"],
                },
            ],
        }
        self.recovery_active_run: dict[str, object] | None = None
        self.recovery_background_tasks: list[dict[str, object]] = []
        self.background_task_stop_requests: list[dict[str, str]] = []
        self.resume_run_requests: list[str] = []
        self.pending_tool_approvals: list[dict[str, object]] = []
        self.pending_user_questions: list[dict[str, object]] = []
        self.question_answer_payloads: list[dict[str, object]] = []
        self.tool_approval_resolve_payloads: list[dict[str, object]] = []
        self.plugin_delete_requests: list[dict[str, object]] = []
        self.plugin_disable_requests: list[dict[str, object]] = []
        self.plugin_enable_requests: list[dict[str, object]] = []
        self.plugin_update_requests: list[dict[str, object]] = []
        self.plugins: list[dict[str, object]] = [
            {
                "command_sources": [{"name": "workspace-command"}],
                "description": "Workspace utilities",
                "enabled": True,
                "name": "workspace-tools",
                "scope": "user",
                "skill_sources": [{"name": "workspace-skill"}],
                "valid": True,
                "version": "1.0.0",
            },
            {
                "description": "Quality checks",
                "enabled": False,
                "hook_sources": [{"name": "quality-hook"}],
                "name": "quality",
                "scope": "project",
                "valid": True,
                "version": "2.0.0",
            },
        ]
        self.hooks_config: dict[str, object] = {
            "hooks": {
                "SessionStart": [
                    {
                        "hooks": [
                            {
                                "command": "python hooks/start.py",
                                "name": "Session startup setup",
                                "type": "command",
                            }
                        ],
                        "matcher": "*",
                    }
                ]
            }
        }
        self.hooks_save_payloads: list[dict[str, object]] = []
        self.hooks_validate_payloads: list[dict[str, object]] = []
        self.model_catalog_refresh_count = 0
        self.model_profile_reload_count = 0
        self.model_profile_save_payloads: list[dict[str, object]] = []
        self.model_profile_save_requests: list[str] = []
        self.model_probe_payloads: list[dict[str, object]] = []
        self.model_profiles: dict[str, dict[str, object]] = {
            "default": {
                "base_url": "https://models.example/v1",
                "connect_timeout_seconds": 15,
                "context_window": 128000,
                "is_default": True,
                "model": "gpt-5-mini",
                "provider": "openai_compatible",
                "temperature": 0.7,
                "top_p": 1.0,
            },
            "vision": {
                "base_url": "https://vision.example/v1",
                "connect_timeout_seconds": 15,
                "input_modalities": ["text", "image"],
                "is_default": False,
                "model": "gpt-5-vision",
                "provider": "openai",
                "temperature": 0.7,
                "top_p": 1.0,
            },
        }
        self.snapshot_request_count = 0
        self.ssh_delete_requests: list[str] = []
        self.ssh_profiles: list[dict[str, object]] = [
            {
                "connect_timeout_seconds": 15,
                "created_at": "2026-06-25T08:00:00Z",
                "has_password": True,
                "has_private_key": False,
                "host": "dev.example.com",
                "port": 22,
                "private_key_name": None,
                "remote_shell": "/bin/bash",
                "ssh_profile_id": "devbox",
                "updated_at": "2026-06-25T08:05:00Z",
                "username": "yex",
            }
        ]
        self.web_config: dict[str, object] = {
            "exa_api_key": "saved-exa-key",
            "fallback_provider": "searxng",
            "provider": "exa",
            "searxng_instance_seeds": ["https://searx.space"],
            "searxng_instance_url": "https://search.initial.example/",
        }
        self.web_save_payloads: list[dict[str, object]] = []

    def route(self, route: Route, request: Request) -> None:
        url = urlsplit(request.url)
        path = url.path.removeprefix("/api")
        self.requested_urls.append(f"{path}?{url.query}" if url.query else path)
        self.requested_paths.append(path)
        if request.method == "GET" and path == "/system/health":
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path == "/workspaces":
            _fulfill_json(route, [self._workspace()])
            return
        if request.method == "GET" and path == f"/workspaces/{_WORKSPACE_ID}/snapshot":
            self.snapshot_request_count += 1
            _fulfill_json(route, self._workspace_snapshot())
            return
        if request.method == "GET" and path == f"/workspaces/{_WORKSPACE_ID}/tree":
            _fulfill_json(route, self._workspace_tree(url.query))
            return
        if request.method == "GET" and path == f"/workspaces/{_WORKSPACE_ID}/diffs":
            _fulfill_json(route, self._workspace_diffs())
            return
        if request.method == "GET" and path == f"/workspaces/{_WORKSPACE_ID}/diff":
            _fulfill_json(route, self._workspace_diff_file())
            return
        if request.method == "GET" and path == f"/workspaces/{_WORKSPACE_ID}/file":
            _fulfill_json(route, self._workspace_file(url.query))
            return
        if (
            request.method == "POST"
            and path == f"/workspaces/{_WORKSPACE_ID}:open-root"
        ):
            self.open_root_queries.append(url.query)
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path in {
            "/sessions/sidebar",
            f"/workspaces/{_WORKSPACE_ID}/sessions/sidebar",
        }:
            _fulfill_json(route, [self._sidebar_session()])
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}":
            _fulfill_json(route, self._session())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/messages":
            _fulfill_json(route, self._messages())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/subagents":
            _fulfill_json(route, self._session_subagents())
            return
        if (
            request.method == "GET"
            and path
            == f"/sessions/{_SESSION_ID}/agents/{_SUBAGENT_INSTANCE_ID}/messages"
        ):
            self.subagent_messages_request_count += 1
            _fulfill_json(route, self._subagent_messages())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/rounds":
            self.rounds_request_count += 1
            _fulfill_json(route, self._rounds_page())
            return
        if request.method == "GET" and path == "/tasks/runs/run-v2-shell":
            _fulfill_json(route, self._run_tasks())
            return
        if request.method == "GET" and path == "/tasks/task-v2-spec/spec-artifacts":
            _fulfill_json(route, self._spec_artifacts())
            return
        if (
            request.method == "GET"
            and path == "/tasks/task-v2-spec/spec-artifacts/2/diff"
        ):
            _fulfill_json(route, self._spec_artifact_diff())
            return
        if (
            request.method == "GET"
            and path == "/tasks/task-v2-spec/spec-checkpoint-evaluations"
        ):
            _fulfill_json(route, self._spec_checkpoint_evaluations())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/token-usage":
            _fulfill_json(route, {"by_role": {}, "input_tokens": 0, "output_tokens": 0})
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/recovery":
            _fulfill_json(
                route,
                {
                    "active_run": self.recovery_active_run,
                    "background_tasks": self.recovery_background_tasks,
                    "paused_subagents": [],
                    "pending_tool_approvals": self.pending_tool_approvals,
                    "pending_user_questions": self.pending_user_questions,
                    "recoverable_stopped_run": None,
                },
            )
            return
        if request.method == "POST" and path == "/ag-ui/runs":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.created_run_payloads.append(payload)
            self.recovery_active_run = _stream_recovery_run(0)
            _fulfill_json(
                route,
                {
                    "run_id": _STREAM_RUN_ID,
                    "session_id": _SESSION_ID,
                    "target_role_id": "MainAgent",
                },
            )
            return
        if (
            request.method == "POST"
            and path.startswith("/ag-ui/runs/")
            and path.endswith(":resume")
        ):
            self._resume_run(route, path)
            return
        if (
            request.method == "POST"
            and path.startswith("/ag-ui/runs/")
            and "/tool-approvals/" in path
            and path.endswith(":resolve")
        ):
            self._resolve_tool_approval(route, request, path)
            return
        if (
            request.method == "POST"
            and path.startswith("/ag-ui/runs/")
            and "/questions/" in path
            and path.endswith(":answer")
        ):
            self._answer_user_question(route, request, path)
            return
        if (
            request.method == "POST"
            and path.startswith("/runs/")
            and "/background-tasks/" in path
            and path.endswith(":stop")
        ):
            self._stop_background_task(route, path)
            return
        if request.method == "GET" and path == "/roles:options":
            _fulfill_json(
                route,
                {
                    "coordinator_role_id": None,
                    "main_agent_role_id": "MainAgent",
                    "normal_mode_roles": [
                        {"name": "Main Agent", "role_id": "MainAgent"}
                    ],
                    "subagent_roles": [
                        {"name": "Reviewer", "role_id": "reviewer"}
                    ],
                },
            )
            return
        if request.method == "GET" and path == "/roles/configs":
            _fulfill_json(route, self._role_config_summaries())
            return
        if request.method == "GET" and path.startswith("/roles/configs/"):
            self._get_role_config(route, path)
            return
        if request.method == "PUT" and path.startswith("/roles/configs/"):
            self._save_role_config(route, request, path)
            return
        if request.method == "DELETE" and path.startswith("/roles/configs/"):
            self._delete_role_config(route, path)
            return
        if request.method == "POST" and path == "/roles:validate-config":
            self._validate_role_config(route, request)
            return
        if request.method == "GET" and path == "/system/configs/model/profiles":
            _fulfill_json(route, self.model_profiles)
            return
        if request.method == "GET" and path == "/system/configs/model/catalog":
            _fulfill_json(route, self._model_catalog())
            return
        if request.method == "POST" and path == "/system/configs/model/catalog:refresh":
            self.model_catalog_refresh_count += 1
            _fulfill_json(route, self._model_catalog())
            return
        if request.method == "PUT" and path.startswith(
            "/system/configs/model/profiles/"
        ):
            profile_id = unquote(
                path.removeprefix("/system/configs/model/profiles/"),
            )
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.model_profile_save_requests.append(profile_id)
            self.model_profile_save_payloads.append(payload)
            source_name = payload.get("source_name")
            if isinstance(source_name, str) and source_name in self.model_profiles:
                self.model_profiles.pop(source_name)
            self.model_profiles[profile_id] = {
                key: value
                for key, value in payload.items()
                if key != "source_name"
            }
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "POST" and path == "/system/configs/model:reload":
            self.model_profile_reload_count += 1
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "POST" and path == "/system/configs/model:probe":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.model_probe_payloads.append(payload)
            _fulfill_json(
                route,
                {
                    "checked_at": "2026-06-26T00:00:00Z",
                    "diagnostics": {
                        "auth_valid": True,
                        "endpoint_reachable": True,
                        "rate_limited": False,
                    },
                    "latency_ms": 51,
                    "model": "gpt-5-vision",
                    "ok": True,
                    "provider": "openai",
                },
            )
            return
        if request.method == "GET" and path == "/system/configs/orchestration":
            _fulfill_json(route, self.orchestration_config)
            return
        if request.method == "PUT" and path == "/system/configs/orchestration":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.orchestration_save_payloads.append(payload)
            self.orchestration_config = payload
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path == "/system/configs/general":
            _fulfill_json(route, {"shell_safety_policy_enabled": True})
            return
        if request.method == "GET" and path == "/system/configs/workspace/ssh-profiles":
            _fulfill_json(route, self.ssh_profiles)
            return
        if request.method == "DELETE" and path.startswith(
            "/system/configs/workspace/ssh-profiles/"
        ):
            profile_id = unquote(
                path.removeprefix("/system/configs/workspace/ssh-profiles/"),
            )
            self.ssh_delete_requests.append(profile_id)
            self.ssh_profiles = [
                profile
                for profile in self.ssh_profiles
                if profile["ssh_profile_id"] != profile_id
            ]
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path == "/system/configs/web":
            _fulfill_json(route, self.web_config)
            return
        if request.method == "PUT" and path == "/system/configs/web":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.web_save_payloads.append(payload)
            if self.fail_next_web_save:
                self.fail_next_web_save = False
                _fulfill_json(
                    route,
                    {"detail": "Web settings save failed in browser test."},
                    status=500,
                )
                return
            self.web_config = {
                **self.web_config,
                **payload,
                "searxng_instance_seeds": self.web_config["searxng_instance_seeds"],
            }
            _fulfill_json(route, {"status": "ok"})
            return
        if request.method == "GET" and path == "/observability/overview":
            _fulfill_json(route, self._observability_overview(url.query))
            return
        if request.method == "GET" and path == "/observability/breakdowns":
            _fulfill_json(route, self._observability_breakdowns(url.query))
            return
        if request.method == "GET" and path == "/system/configs":
            _fulfill_json(route, self._system_config())
            return
        if request.method == "GET" and path == "/mcp/servers":
            _fulfill_json(route, self._mcp_servers())
            return
        if request.method == "GET" and path == "/mcp/servers/stdio-shell/tools":
            _fulfill_json(route, self._mcp_server_tools())
            return
        if request.method == "GET" and path == "/system/configs/plugins":
            _fulfill_json(route, self._plugins_config())
            return
        if request.method == "GET" and path == "/system/configs/plugins/runtime":
            _fulfill_json(route, self._plugins_runtime())
            return
        if request.method == "POST" and path.startswith(
            "/system/configs/plugins/"
        ):
            if path.endswith(":enable"):
                self._set_plugin_enabled(route, request, path, True)
                return
            if path.endswith(":disable"):
                self._set_plugin_enabled(route, request, path, False)
                return
            if path.endswith(":update"):
                self._update_plugin(route, request, path)
                return
        if request.method == "DELETE" and path.startswith(
            "/system/configs/plugins/"
        ):
            self._delete_plugin(route, path, url.query)
            return
        if request.method == "GET" and path == "/system/configs/hooks":
            _fulfill_json(route, self._hooks_config())
            return
        if request.method == "PUT" and path == "/system/configs/hooks":
            self._save_hooks_config(route, request)
            return
        if request.method == "POST" and path == "/system/configs/hooks:validate":
            self._validate_hooks_config(route, request)
            return
        if request.method == "GET" and path == "/system/configs/hooks/runtime":
            _fulfill_json(route, self._hooks_runtime())
            return
        if request.method == "GET" and path == "/system/configs/agent-runtimes":
            _fulfill_json(route, self._agent_runtimes())
            return
        if request.method == "GET" and path == "/system/commands:catalog":
            _fulfill_json(route, self._command_catalog())
            return
        if request.method == "GET" and path == "/system/configs/github":
            _fulfill_json(route, self._github_config())
            return
        if request.method == "GET" and path == "/system/configs/github/webhook/tunnel":
            _fulfill_json(route, self._github_tunnel_status())
            return
        if request.method == "GET" and path == "/gateway/feishu/accounts":
            _fulfill_json(route, self._feishu_accounts())
            return
        if request.method == "GET" and path == "/gateway/wechat/accounts":
            _fulfill_json(route, self._wechat_accounts())
            return
        if request.method == "GET" and path == "/system/skills/market/clawhub":
            _fulfill_json(route, self._skills_market())
            return
        if request.method == "GET" and path == "/automation/projects":
            _fulfill_json(route, [self._automation_project()])
            return
        if request.method == "GET" and path == "/automation/projects/aut-daily":
            _fulfill_json(route, self._automation_project())
            return
        if (
            request.method == "GET"
            and path == "/automation/projects/aut-daily/sessions"
        ):
            _fulfill_json(route, [self._automation_session()])
            return
        if request.method == "POST" and path == "/automation/projects/aut-daily:enable":
            self.automation_enable_requests.append("aut-daily")
            self.automation_project_status = "enabled"
            _fulfill_json(route, self._automation_project())
            return
        if (
            request.method == "POST"
            and path == "/automation/projects/aut-daily:disable"
        ):
            self.automation_disable_requests.append("aut-daily")
            self.automation_project_status = "disabled"
            _fulfill_json(route, self._automation_project())
            return
        if request.method == "GET" and path == "/connectors":
            _fulfill_json(route, self._connectors())
            return
        if request.method == "GET" and path == "/connectors/runtime-tools":
            _fulfill_json(route, self._runtime_tools())
            return
        if (
            request.method == "POST"
            and path == "/connectors/runtime-tools/system-path:add"
        ):
            self.runtime_tools_system_path_added = True
            self.runtime_tools_system_path_requests.append("add")
            _fulfill_json(
                route,
                {
                    "bin_dir": "C:/Users/yex/.agent-teams/bin",
                    "message": "Runtime tools directory added to system PATH.",
                    "requires_terminal_restart": True,
                    "status": "updated",
                },
            )
            return
        if request.method == "GET" and path == "/boards/todos":
            _fulfill_json(route, self._board())
            return
        if request.method == "GET" and path == "/boards/todo-sources":
            _fulfill_json(route, self._board_source_settings())
            return
        if request.method == "POST" and path == "/boards/todo-sources":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_source_create_payloads.append(payload)
            self.board_source_created = True
            source_view = self._board_source("source-created")
            _fulfill_json(route, cast(dict[str, object], source_view["source"]))
            return
        if request.method == "PATCH" and path == "/boards/todo-sources/source-1":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_source_update_payloads.append(payload)
            self.board_source_display_name = str(
                payload.get("display_name", self.board_source_display_name),
            )
            self.board_source_enabled = bool(
                payload.get("enabled", self.board_source_enabled),
            )
            source_view = self._board_source("source-1")
            _fulfill_json(route, cast(dict[str, object], source_view["source"]))
            return
        if request.method == "DELETE" and path == "/boards/todo-sources/source-1":
            self.board_source_delete_requests.append("source-1")
            self.board_source_deleted = True
            _fulfill_json(route, {"deleted": True, "source_id": "source-1"})
            return
        if request.method == "POST" and path == "/boards/todos:sync":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_sync_payloads.append(payload)
            _fulfill_json(route, self._board_synced())
            return
        if (
            request.method == "POST"
            and path == "/boards/todos/todo-v2-shell:preview-start"
        ):
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_handoff_preview_payloads.append(payload)
            _fulfill_json(route, self._board_handoff_preview())
            return
        if request.method == "POST" and path == "/boards/todos/todo-v2-shell:start":
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_handoff_start_payloads.append(payload)
            self.board_handoff_started = True
            _fulfill_json(route, self._board_handoff_started_item())
            return
        if (
            request.method == "POST"
            and path == "/boards/todos/todo-v2-review:preview-request-changes"
        ):
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_request_changes_preview_payloads.append(payload)
            _fulfill_json(route, self._board_request_changes_preview())
            return
        if (
            request.method == "POST"
            and path == "/boards/todos/todo-v2-review:request-changes"
        ):
            payload = cast(
                dict[str, object],
                json.loads(request.post_data or "{}"),
            )
            self.board_request_changes_payloads.append(payload)
            self.board_request_changes_started = True
            _fulfill_json(route, self._board_request_changes_started_item())
            return
        if request.method == "GET" and path == "/memories":
            _fulfill_json(route, self._memory_query())
            return
        if (
            request.method == "GET"
            and path == f"/workspaces/{_WORKSPACE_ID}/memories/memory-v2-shell"
        ):
            _fulfill_json(route, self._memory_detail())
            return
        _fulfill_json(
            route,
            {"detail": f"Unhandled mock API route: {path}"},
            status=404,
        )

    def _resolve_tool_approval(
        self,
        route: Route,
        request: Request,
        path: str,
    ) -> None:
        run_id, tool_call_id = _split_nested_action_path(
            path,
            "/tool-approvals/",
            ":resolve",
        )
        payload = cast(
            dict[str, object],
            json.loads(request.post_data or "{}"),
        )
        self.tool_approval_resolve_payloads.append(
            {
                "payload": payload,
                "run_id": run_id,
                "tool_call_id": tool_call_id,
            },
        )
        self.pending_tool_approvals = [
            approval
            for approval in self.pending_tool_approvals
            if approval.get("tool_call_id") != tool_call_id
        ]
        _fulfill_json(route, {"status": "ok"})

    def _answer_user_question(
        self,
        route: Route,
        request: Request,
        path: str,
    ) -> None:
        run_id, question_id = _split_nested_action_path(
            path,
            "/questions/",
            ":answer",
        )
        payload = cast(
            dict[str, object],
            json.loads(request.post_data or "{}"),
        )
        self.question_answer_payloads.append(
            {
                "payload": payload,
                "question_id": question_id,
                "run_id": run_id,
            },
        )
        self.pending_user_questions = [
            question
            for question in self.pending_user_questions
            if question.get("question_id") != question_id
        ]
        _fulfill_json(route, {"status": "ok"})

    def _resume_run(self, route: Route, path: str) -> None:
        run_id = _split_run_action_path(path, ":resume")
        self.resume_run_requests.append(run_id)
        self.recovery_active_run = {
            "last_event_id": 42,
            "pending_tool_approval_count": 0,
            "pending_user_question_count": 0,
            "phase": "running",
            "run_id": run_id,
            "session_id": _SESSION_ID,
            "should_show_recover": False,
            "status": "running",
            "stream_connected": False,
        }
        _fulfill_json(
            route,
            {
                "run_id": run_id,
                "session_id": _SESSION_ID,
                "status": "ok",
            },
        )

    def _stop_background_task(self, route: Route, path: str) -> None:
        run_id, background_task_id = _split_background_task_stop_path(path)
        self.background_task_stop_requests.append(
            {
                "background_task_id": background_task_id,
                "run_id": run_id,
            },
        )
        stopped_task: dict[str, object] | None = None
        for task in self.recovery_background_tasks:
            if task.get("background_task_id") == background_task_id:
                task["status"] = "stopped"
                stopped_task = task
                break
        _fulfill_json(
            route,
            {
                "background_task": stopped_task
                or {
                    "background_task_id": background_task_id,
                    "run_id": run_id,
                    "session_id": _SESSION_ID,
                    "status": "stopped",
                }
            },
        )

    def _workspace(self) -> dict[str, object]:
        return {
            "display_name": "agent-teams",
            "default_mount_name": "default",
            "mounts": [
                {
                    "mount_name": "default",
                    "provider": "local",
                    "provider_config": {
                        "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
                    },
                    "working_directory": ".",
                    "readable_paths": ["."],
                    "writable_paths": ["."],
                }
            ],
            "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _workspace_snapshot(self) -> dict[str, object]:
        return {
            "workspace_id": _WORKSPACE_ID,
            "default_mount_name": "default",
            "default_mount_root": "C:/Users/yex/Documents/workspace/agent-teams",
            "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
            "tree": {
                "name": ".",
                "path": ".",
                "kind": "directory",
                "children": [
                    {
                        "name": "default",
                        "path": "default",
                        "kind": "directory",
                        "has_children": True,
                    }
                ],
            },
        }

    def _workspace_tree(self, query: str) -> dict[str, object]:
        params = parse_qs(query)
        directory_path = params.get("path", ["."])[0]
        if directory_path == "frontend":
            children: list[dict[str, object]] = [
                {
                    "name": "app",
                    "path": "frontend/app",
                    "kind": "directory",
                    "has_children": True,
                }
            ]
        else:
            children = [
                {
                    "name": "frontend",
                    "path": "frontend",
                    "kind": "directory",
                    "has_children": True,
                },
                {
                    "name": "README.md",
                    "path": "README.md",
                    "kind": "file",
                },
            ]
        return {
            "workspace_id": _WORKSPACE_ID,
            "mount_name": params.get("mount", ["default"])[0],
            "directory_path": directory_path,
            "children": children,
        }

    def _workspace_diffs(self) -> dict[str, object]:
        return {
            "workspace_id": _WORKSPACE_ID,
            "mount_name": "default",
            "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
            "is_git_repository": True,
            "diff_files": [
                {
                    "path": "frontend/app/src/App.tsx",
                    "change_type": "modified",
                }
            ],
        }

    def _workspace_diff_file(self) -> dict[str, object]:
        return {
            "mount_name": "default",
            "path": "frontend/app/src/App.tsx",
            "change_type": "modified",
            "diff": (
                "--- a/frontend/app/src/App.tsx\n"
                "+++ b/frontend/app/src/App.tsx\n"
                "@@ -1 +1 @@\n"
                "-old\n"
                "+new"
            ),
            "is_binary": False,
        }

    def _workspace_file(self, query: str) -> dict[str, object]:
        params = parse_qs(query)
        return {
            "workspace_id": _WORKSPACE_ID,
            "mount_name": params.get("mount", ["default"])[0],
            "path": params.get("path", ["README.md"])[0],
            "content": "# Agent Teams\n\nProject docs.",
            "encoding": "utf-8",
            "is_binary": False,
            "truncated": False,
            "size_bytes": 27,
        }

    def _sidebar_session(self) -> dict[str, object]:
        session = {
            "active_run_id": None,
            "active_run_phase": "",
            "active_run_status": "",
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "V2 shell resize",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }
        if self.include_subagent_session:
            session["subagent_count"] = 1
        return session

    def _session(self) -> dict[str, object]:
        return {
            "can_switch_mode": True,
            "normal_model_profile": "default",
            "normal_root_role_id": "MainAgent",
            "orchestration_preset_id": "default",
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "V2 shell resize",
            "workspace_id": _WORKSPACE_ID,
        }

    def _messages(self) -> list[dict[str, object]]:
        if self.include_image_message:
            return [
                {
                    "created_at": "2026-06-25T08:00:01Z",
                    "message_id": "assistant-v2-image",
                    "parts": [
                        {
                            "kind": "text",
                            "text": "Here is the runtime image preview.",
                        },
                        {
                            "kind": "media_ref",
                            "mime_type": "image/svg+xml",
                            "modality": "image",
                            "name": "runtime-preview.svg",
                            "url": _IMAGE_DATA_URL,
                        },
                    ],
                    "role": "assistant",
                    "role_id": "MainAgent",
                    "run_id": "run-v2-shell",
                    "trace_id": "trace-v2-shell",
                },
            ]
        return [
            {
                "content": "V2 shell resize probe",
                "created_at": "2026-06-25T08:00:01Z",
                "message_id": "user-v2-shell",
                "parts": [{"kind": "text", "text": "V2 shell resize probe"}],
                "role": "user",
                "run_id": "run-v2-shell",
                "trace_id": "trace-v2-shell",
            },
        ]

    def _session_subagents(self) -> list[dict[str, object]]:
        if not self.include_subagent_session:
            return []
        return [
            {
                "created_at": "2026-06-25T08:00:03Z",
                "instance_id": _SUBAGENT_INSTANCE_ID,
                "interactive": False,
                "last_event_id": 4,
                "role_id": "reviewer",
                "run_id": _SUBAGENT_RUN_ID,
                "run_phase": "running",
                "run_status": "running",
                "session_id": _SESSION_ID,
                "status": "running",
                "subagent_instance_id": _SUBAGENT_INSTANCE_ID,
                "subagent_kind": "normal",
                "subagent_role_id": "reviewer",
                "subagent_run_id": _SUBAGENT_RUN_ID,
                "title": "Reviewer review pass",
                "updated_at": "2026-06-25T08:00:04Z",
                "workspace_id": _WORKSPACE_ID,
            }
        ]

    def _subagent_messages(self) -> list[dict[str, object]]:
        return [
            {
                "content": "Persisted reviewer note.",
                "created_at": "2026-06-25T08:00:04Z",
                "message_id": "assistant-v2-subagent",
                "parts": [{"kind": "text", "text": "Persisted reviewer note."}],
                "role": "assistant",
                "role_id": "reviewer",
                "run_id": _SUBAGENT_RUN_ID,
                "trace_id": "trace-v2-subagent",
            },
        ]

    def _rounds_page(self) -> dict[str, object]:
        return {
            "has_more": False,
            "items": [
                {
                    "coordinator_messages": [
                        {
                            "created_at": "2026-06-25T08:00:02Z",
                            "message": {
                                "parts": [
                                    {
                                        "content": "Exported V2 transcript content",
                                        "part_kind": "text",
                                    }
                                ],
                            },
                            "role_id": "MainAgent",
                        }
                    ],
                    "created_at": "2026-06-25T08:00:01Z",
                    "has_final_output": True,
                    "intent": "V2 export prompt",
                    "intent_parts": [{"kind": "text", "text": "V2 export prompt"}],
                    "pending_tool_approval_count": 2,
                    "pending_user_question_count": 1,
                    "retry_events": [
                        {
                            "attempt_number": 3,
                            "error_message": "rate limited",
                            "is_active": True,
                            "phase": "scheduled",
                            "retry_in_ms": 2500,
                            "total_attempts": 5,
                        }
                    ],
                    "run_diagnostic_message": "Waiting for user confirmation",
                    "run_id": "run-v2-shell",
                    "run_phase": "completed",
                    "run_status": "completed",
                    "run_user_message": "V2 export prompt",
                    "todo": {
                        "items": [
                            {
                                "content": "Confirm deploy window",
                                "status": "in_progress",
                            },
                            {
                                "content": "Capture approval result",
                                "status": "pending",
                            },
                        ],
                        "run_id": "run-v2-shell",
                        "session_id": _SESSION_ID,
                        "version": 2,
                    },
                }
            ],
            "next_cursor": None,
        }

    def _run_tasks(self) -> dict[str, object]:
        return {
            "tasks": [
                {
                    "objective": "Keep the task projection visible.",
                    "status": "completed",
                    "task_id": "task-v2-plain",
                    "title": "Plain task",
                },
                {
                    "objective": "Show spec artifact history in the shell.",
                    "spec_artifact_id": "spec-v2-2",
                    "status": "completed",
                    "task_id": "task-v2-spec",
                    "title": "Implement spec lineage",
                },
            ]
        }

    def _spec_artifacts(self) -> dict[str, object]:
        return {
            "task_id": "task-v2-spec",
            "versions": [
                {
                    "artifact_id": "spec-v2-1",
                    "created_at": "2026-06-25T08:05:00Z",
                    "session_id": _SESSION_ID,
                    "task_id": "task-v2-spec",
                    "trace_id": "run-v2-shell",
                    "updated_at": "2026-06-25T08:05:00Z",
                    "version": 1,
                },
                {
                    "artifact_id": "spec-v2-2",
                    "created_at": "2026-06-25T08:15:00Z",
                    "session_id": _SESSION_ID,
                    "task_id": "task-v2-spec",
                    "trace_id": "run-v2-shell",
                    "updated_at": "2026-06-25T08:15:00Z",
                    "version": 2,
                },
            ],
        }

    def _spec_artifact_diff(self) -> dict[str, object]:
        return {
            "field_changes": [
                {
                    "added_items": ["Keep V2 spec diff visible"],
                    "change_type": "modified",
                    "field_label": "Requirements",
                    "field_name": "requirements",
                    "removed_items": ["Sketch spec history offline"],
                }
            ],
            "from_artifact_id": "spec-v2-1",
            "from_version": 1,
            "has_changes": True,
            "summary": "Spec lineage became a visible observability surface.",
            "task_id": "task-v2-spec",
            "to_artifact_id": "spec-v2-2",
            "to_version": 2,
        }

    def _spec_checkpoint_evaluations(self) -> dict[str, object]:
        return {
            "evaluations": [
                {
                    "artifact_id": "spec-v2-2",
                    "checkpoint_seq": 2,
                    "created_at": "2026-06-25T08:16:00Z",
                    "drift_detected": False,
                    "evaluation_id": "eval-v2-spec",
                    "evaluator": "reviewer",
                    "overall_score": 4.5,
                    "session_id": _SESSION_ID,
                    "summary": "Spec remains aligned with the shell target.",
                    "task_id": "task-v2-spec",
                    "trace_id": "run-v2-shell",
                }
            ],
            "task_id": "task-v2-spec",
        }

    def _observability_overview(self, query: str) -> dict[str, object]:
        params = parse_qs(query)
        scope = params.get("scope", ["global"])[0]
        if scope == "session":
            return {
                "kpis": {
                    "input_tokens": 2048,
                    "output_tokens": 512,
                    "steps": 3,
                    "tool_avg_duration_ms": 55,
                    "tool_calls": 2,
                    "tool_success_rate": 1,
                },
                "scope": "session",
                "scope_id": params.get("scope_id", [""])[0],
                "updated_at": "2026-06-25T08:31:00Z",
            }
        return {
            "kpis": {
                "input_tokens": 112000,
                "output_tokens": 790,
                "steps": 12,
                "tool_avg_duration_ms": 88,
                "tool_calls": 7,
                "tool_success_rate": 0.9,
            },
            "scope": "global",
            "updated_at": "2026-06-25T08:30:00Z",
        }

    def _observability_breakdowns(self, query: str) -> dict[str, object]:
        params = parse_qs(query)
        scope = params.get("scope", ["global"])[0]
        if scope == "session":
            return {
                "rows": [
                    {
                        "avg_duration_ms": 55,
                        "calls": 2,
                        "name": "Session tools",
                        "success_rate": 1,
                    }
                ],
                "updated_at": "2026-06-25T08:31:00Z",
            }
        return {
            "rows": [
                {
                    "avg_duration_ms": 88,
                    "calls": 7,
                    "name": "Agent loop",
                    "success_rate": 0.9,
                }
            ],
            "updated_at": "2026-06-25T08:30:00Z",
        }

    def _system_config(self) -> dict[str, object]:
        return {
            "skills": {
                "loaded": True,
                "skills": [
                    {
                        "description": "Create repeatable frontend parity notes.",
                        "name": "skill-creator",
                        "ref": "skill-creator",
                        "source": "user_codex",
                    },
                    {
                        "description": "Write release runbooks for V2 shell work.",
                        "name": "runbook-writer",
                        "ref": "runbook-writer",
                        "source": "user_codex",
                    },
                ],
            }
        }

    def _mcp_servers(self) -> list[dict[str, object]]:
        return [
            {
                "discovery_status": "ready",
                "enabled": True,
                "last_checked_at": "2026-06-25T08:32:00Z",
                "name": "stdio-shell",
                "source": "app",
                "tool_count": 1,
                "transport": "stdio",
            }
        ]

    def _mcp_server_tools(self) -> dict[str, object]:
        return {
            "enabled": True,
            "last_checked_at": "2026-06-25T08:32:00Z",
            "server": "stdio-shell",
            "source": "app",
            "status": "ready",
            "tools": [
                {
                    "description": "Run workspace shell commands.",
                    "name": "run_command",
                }
            ],
            "transport": "stdio",
        }

    def _role_config_summaries(self) -> list[dict[str, object]]:
        summaries: list[dict[str, object]] = []
        for role in self.role_configs.values():
            summaries.append(
                {
                    "bound_agent_id": role.get("bound_agent_id"),
                    "deletable": role.get("deletable"),
                    "description": role.get("description"),
                    "mode": role.get("mode"),
                    "model_profile": role.get("model_profile"),
                    "name": role.get("name"),
                    "role_id": role.get("role_id"),
                    "source": role.get("source"),
                    "version": role.get("version"),
                }
            )
        return summaries

    def _role_id_from_path(self, path: str) -> str:
        return unquote(path.removeprefix("/roles/configs/"))

    def _get_role_config(self, route: Route, path: str) -> None:
        role_id = self._role_id_from_path(path)
        role = self.role_configs.get(role_id)
        if role is None:
            _fulfill_json(route, {"detail": f"Role not found: {role_id}"}, status=404)
            return
        _fulfill_json(route, role)

    def _save_role_config(
        self,
        route: Route,
        request: Request,
        path: str,
    ) -> None:
        path_role_id = self._role_id_from_path(path)
        payload = cast(dict[str, object], json.loads(request.post_data or "{}"))
        self.role_save_payloads.append(payload)
        role_id = str(payload.get("role_id", path_role_id))
        saved = {
            **payload,
            "content": "---\nname: "
            + str(payload.get("name", role_id))
            + "\n---\n"
            + str(payload.get("system_prompt", "")),
            "deletable": True,
            "file_name": f"{role_id}.md",
            "source": "project",
        }
        self.role_configs[role_id] = saved
        _fulfill_json(route, saved)

    def _delete_role_config(self, route: Route, path: str) -> None:
        role_id = self._role_id_from_path(path)
        self.role_delete_requests.append(role_id)
        self.role_configs.pop(role_id, None)
        _fulfill_json(route, {"status": "ok"})

    def _validate_role_config(self, route: Route, request: Request) -> None:
        payload = cast(dict[str, object], json.loads(request.post_data or "{}"))
        self.role_validate_payloads.append(payload)
        role_id = str(payload.get("role_id", "validated"))
        role = {
            **payload,
            "content": "---\nname: "
            + str(payload.get("name", role_id))
            + "\n---\n"
            + str(payload.get("system_prompt", "")),
            "deletable": True,
            "file_name": f"{role_id}.md",
            "source": "project",
        }
        _fulfill_json(route, {"role": role, "valid": True})

    def _plugins_config(self) -> dict[str, object]:
        return {
            "diagnostics": [],
            "plugins": self.plugins,
        }

    def _plugin_name_from_path(self, path: str, suffix: str = "") -> str:
        name = path.removeprefix("/system/configs/plugins/")
        if suffix:
            name = name.removesuffix(suffix)
        return unquote(name)

    def _plugin_payload(self, request: Request) -> dict[str, object]:
        return cast(dict[str, object], json.loads(request.post_data or "{}"))

    def _set_plugin_enabled(
        self,
        route: Route,
        request: Request,
        path: str,
        enabled: bool,
    ) -> None:
        suffix = ":enable" if enabled else ":disable"
        name = self._plugin_name_from_path(path, suffix)
        payload = self._plugin_payload(request)
        record = {"name": name, "payload": payload}
        if enabled:
            self.plugin_enable_requests.append(record)
        else:
            self.plugin_disable_requests.append(record)
        for plugin in self.plugins:
            if plugin.get("name") == name:
                plugin["enabled"] = enabled
        _fulfill_json(route, self._plugins_config())

    def _update_plugin(self, route: Route, request: Request, path: str) -> None:
        name = self._plugin_name_from_path(path, ":update")
        payload = self._plugin_payload(request)
        self.plugin_update_requests.append({"name": name, "payload": payload})
        for plugin in self.plugins:
            if plugin.get("name") == name and "version" in payload:
                plugin["version"] = payload["version"]
        _fulfill_json(route, self._plugins_config())

    def _delete_plugin(
        self,
        route: Route,
        path: str,
        query: str,
    ) -> None:
        name = self._plugin_name_from_path(path)
        values = parse_qs(query)
        self.plugin_delete_requests.append(
            {
                "name": name,
                "prune": values.get("prune", ["false"])[0],
                "scope": values.get("scope", [""])[0],
            }
        )
        self.plugins = [
            plugin for plugin in self.plugins if plugin.get("name") != name
        ]
        _fulfill_json(route, self._plugins_config())

    def _plugins_runtime(self) -> dict[str, object]:
        return {
            "diagnostics": [],
            "plugins": self.plugins,
        }

    def _hooks_config(self) -> dict[str, object]:
        return self.hooks_config

    def _save_hooks_config(self, route: Route, request: Request) -> None:
        payload = cast(dict[str, object], json.loads(request.post_data or "{}"))
        self.hooks_save_payloads.append(payload)
        self.hooks_config = payload
        _fulfill_json(route, self._hooks_config())

    def _validate_hooks_config(self, route: Route, request: Request) -> None:
        payload = cast(dict[str, object], json.loads(request.post_data or "{}"))
        self.hooks_validate_payloads.append(payload)
        _fulfill_json(route, {"status": "ok"})

    def _hooks_runtime(self) -> dict[str, object]:
        return {
            "loaded_hooks": [
                {
                    "event": "SessionStart",
                    "handler": "python hooks/start.py",
                    "name": "Session startup setup",
                    "source": "project",
                }
            ],
            "sources": [
                {
                    "path": "C:/repo/.relay/hooks",
                    "source": "project",
                }
            ],
        }

    def _agent_runtimes(self) -> list[dict[str, object]]:
        return [
            {
                "agent_id": "codex-acp",
                "description": "ACP adapter for OpenAI's coding assistant",
                "name": "Codex CLI",
                "protocol": "acp",
                "transport": "registry",
            }
        ]

    def _feishu_accounts(self) -> list[dict[str, object]]:
        return [
            {
                "account_id": "feishu-main",
                "created_at": "2026-06-25T08:00:00Z",
                "display_name": "Feishu Main",
                "name": "feishu-main",
                "secret_status": {
                    "app_secret_configured": True,
                    "encrypt_key_configured": True,
                    "verification_token_configured": True,
                },
                "source_config": {
                    "app_id": "cli_app_id",
                    "app_name": "Relay Bot",
                    "provider": "feishu",
                    "trigger_rule": "mention_only",
                },
                "status": "enabled",
                "target_config": {
                    "normal_root_role_id": "MainAgent",
                    "orchestration_preset_id": None,
                    "session_mode": "normal",
                    "shell_safety_policy_enabled": True,
                    "thinking": {"enabled": True, "effort": "medium"},
                    "workspace_id": _WORKSPACE_ID,
                    "yolo": True,
                },
                "updated_at": "2026-06-25T08:00:00Z",
            }
        ]

    def _wechat_accounts(self) -> list[dict[str, object]]:
        return [
            {
                "account_id": "wechat-main",
                "base_url": "http://127.0.0.1:5900",
                "cdn_base_url": "http://127.0.0.1:5901",
                "created_at": "2026-06-25T08:00:00Z",
                "display_name": "WeChat Main",
                "normal_root_role_id": "MainAgent",
                "orchestration_preset_id": None,
                "route_tag": "desktop",
                "running": True,
                "session_mode": "normal",
                "status": "enabled",
                "sync_cursor": "cursor-v2",
                "thinking": {"enabled": False, "effort": None},
                "updated_at": "2026-06-25T08:00:00Z",
                "workspace_id": _WORKSPACE_ID,
                "yolo": True,
            }
        ]

    def _skills_market(self) -> dict[str, object]:
        return {
            "items": [
                {
                    "installed": False,
                    "owner_display_name": "Agent Teams",
                    "owner_handle": "agent-teams",
                    "owner_image": None,
                    "slug": "writer",
                    "stats": {
                        "comments": 1,
                        "downloads": 25,
                        "installs_all_time": 12,
                        "installs_current": 8,
                        "stars": 4,
                        "versions": 2,
                    },
                    "summary": "Draft focused V2 frontend parity notes.",
                    "title": "Writer",
                    "version": "1.0.0",
                }
            ],
            "next_cursor": None,
            "ok": True,
            "query": "",
            "sort": "popular",
        }

    def _command_catalog(self) -> dict[str, object]:
        return {
            "app_commands": [
                {
                    "allowed_modes": ["normal"],
                    "aliases": ["proposal"],
                    "argument_hint": "issue",
                    "description": "Draft a proposal for the selected issue.",
                    "discovery_source": "app",
                    "name": "opsx:propose",
                    "scope": "app",
                    "source_path": "C:/Users/yex/.agent-teams/commands/opsx-propose.md",
                    "template": "Draft a proposal.",
                },
            ],
            "workspaces": [
                {
                    "can_create_commands": True,
                    "commands": [],
                    "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
                    "workspace_id": _WORKSPACE_ID,
                },
            ],
        }

    def _model_catalog(self) -> dict[str, object]:
        return {
            "ok": True,
            "providers": [
                {
                    "api": "https://openai.example/v1",
                    "id": "openai",
                    "models": [
                        {
                            "capabilities": {
                                "input": {"image": True, "text": True},
                                "output": {"text": True},
                            },
                            "context_window": 128000,
                            "id": "gpt-5-catalog",
                            "input_modalities": ["text", "image"],
                            "name": "GPT-5 Catalog",
                            "output_limit": 8192,
                            "reasoning": True,
                            "tool_call": True,
                        },
                    ],
                    "name": "OpenAI",
                    "runtime_provider": "openai_compatible",
                },
            ],
            "source_url": "https://models.dev/api.json",
        }

    def _github_config(self) -> dict[str, object]:
        return {
            "token_configured": True,
            "webhook_base_url": "https://example.invalid/hooks/github",
        }

    def _github_tunnel_status(self) -> dict[str, object]:
        return {
            "provider": "localhost.run",
            "public_url": None,
            "status": "idle",
        }

    def _automation_project(self) -> dict[str, object]:
        return {
            "automation_project_id": "aut-daily",
            "created_at": "2026-06-25T08:00:00Z",
            "cron_expression": "0 9 * * *",
            "delivery_binding": None,
            "delivery_events": ["completed"],
            "display_name": "Daily triage",
            "interval_every": None,
            "interval_unit": None,
            "last_error": None,
            "last_run_started_at": "2026-06-25T08:15:00Z",
            "last_session_id": "session-automation",
            "latest_terminal_run_status": "completed",
            "latest_terminal_run_verification_status": "verified",
            "name": "daily_triage",
            "next_run_at": "2026-06-26T01:00:00Z",
            "prompt": "Keep the V2 shell parity ledger current.",
            "run_at": None,
            "run_config": {
                "normal_root_role_id": "MainAgent",
                "session_mode": "normal",
                "thinking": {"enabled": True, "effort": "medium"},
                "yolo": False,
            },
            "schedule_mode": "cron",
            "status": self.automation_project_status,
            "timezone": "Asia/Shanghai",
            "trigger_id": "trigger-daily",
            "updated_at": "2026-06-25T08:20:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _automation_session(self) -> dict[str, object]:
        return {
            "latest_terminal_run_status": "completed",
            "metadata": {"title": "Daily triage run"},
            "session_id": "session-automation",
            "updated_at": "2026-06-25T08:16:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _connectors(self) -> dict[str, object]:
        return {
            "items": [
                {
                    "account_count": 1,
                    "auth_type": "cli",
                    "capabilities": ["repositories", "pull_requests"],
                    "category": "development",
                    "connector_id": "github",
                    "description": "GitHub repository and pull request connector.",
                    "display_name": "GitHub",
                    "enabled_count": 1,
                    "last_activity_at": "2026-06-25T08:00:00Z",
                    "last_error": None,
                    "provider": "github",
                    "status": "connected",
                }
            ],
            "summary": {
                "connected": 1,
                "disabled": 0,
                "error": 0,
                "needs_config": 0,
                "total": 1,
            },
        }

    def _runtime_tools(self) -> dict[str, object]:
        return {
            "items": [
                {
                    "display_name": "ripgrep",
                    "download_job_id": None,
                    "error_message": None,
                    "executable_name": "rg.exe",
                    "path": "C:/Users/yex/.agent-teams/bin/rg.exe",
                    "path_source": "managed",
                    "source_kind": "github_release",
                    "status": "ready",
                    "target_version": None,
                    "tool_id": "rg",
                    "update_available": False,
                    "version": "14.1.1",
                }
            ],
            "system_path": {
                "added": self.runtime_tools_system_path_added,
                "bin_dir": "C:/Users/yex/.agent-teams/bin",
                "supported": True,
            },
        }

    def _board(self) -> dict[str, object]:
        item = (
            self._board_handoff_started_item()
            if self.board_handoff_started
            else {
                "body": "Keep module pages reachable from the fixed V2 shell.",
                "created_at": "2026-06-25T08:00:00Z",
                "issue_number": 401,
                "item_revision": 3,
                "repository_full_name": "openai/agent-teams",
                "run_recoverable": False,
                "source_key": "openai/agent-teams#401",
                "source_provider": "github",
                "source_type": "github_issue",
                "status": "todo",
                "title": "Keep module pages reachable",
                "todo_id": "todo-v2-shell",
                "updated_at": "2026-06-25T08:10:00Z",
                "workspace_id": _WORKSPACE_ID,
            }
        )
        review_item = (
            self._board_request_changes_started_item()
            if self.board_request_changes_started
            else self._board_review_item()
        )
        return self._board_response_items(
            [item, review_item, self._board_done_item()],
            revision=9,
            synced_at="2026-06-25T08:11:00Z",
        )

    def _board_handoff_preview(self) -> dict[str, object]:
        return {
            "board_workspace_id": _WORKSPACE_ID,
            "concurrency": {
                "runtime_target_active": 0,
                "runtime_target_limit": 1,
                "source_workspace_active": 0,
                "source_workspace_limit": 2,
            },
            "diagnostics": [],
            "execution_policy": "fork_git_worktree",
            "execution_workspace_preview": {
                "display_name": "Agent Teams fork",
                "policy": "fork_git_worktree",
                "source_workspace_id": _WORKSPACE_ID,
                "workspace_id": "workspace-v2-shell-fork",
            },
            "is_fork_view": False,
            "prompt": "Previewed board handoff prompt",
            "queue_preview": {
                "queue_if_full": True,
                "slot_available": True,
                "will_queue": False,
            },
            "runtime_target_id": None,
            "template_kind": "start",
            "template_source": "built_in",
            "thinking": {"enabled": False, "effort": None},
            "todo_id": "todo-v2-shell",
            "view_workspace_id": _WORKSPACE_ID,
            "yolo": True,
        }

    def _board_handoff_started_item(self) -> dict[str, object]:
        return {
            "body": "Keep module pages reachable from the fixed V2 shell.",
            "created_at": "2026-06-25T08:00:00Z",
            "execution_workspace_id": "workspace-v2-shell-fork",
            "issue_number": 401,
            "item_revision": 4,
            "last_status_reason": "Queued for board todo handoff",
            "repository_full_name": "openai/agent-teams",
            "run_id": "run-board-v2-shell",
            "run_recoverable": False,
            "run_status": "running",
            "session_id": "session-board-v2-shell",
            "source_key": "openai/agent-teams#401",
            "source_provider": "github",
            "source_type": "github_issue",
            "status": "in_progress",
            "title": "Keep module pages reachable",
            "todo_id": "todo-v2-shell",
            "updated_at": "2026-06-25T08:24:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _board_review_item(self) -> dict[str, object]:
        return {
            "body": "Review the module page actions before handoff.",
            "created_at": "2026-06-25T08:03:00Z",
            "item_revision": 3,
            "last_status_reason": "Waiting for reviewer changes",
            "pull_request_number": 17,
            "repository_full_name": "openai/agent-teams",
            "run_recoverable": False,
            "source_key": "openai/agent-teams#17",
            "source_provider": "github",
            "source_type": "github_pull_request",
            "status": "review",
            "title": "Review board request changes",
            "todo_id": "todo-v2-review",
            "updated_at": "2026-06-25T08:14:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _board_request_changes_preview(self) -> dict[str, object]:
        return {
            "board_workspace_id": _WORKSPACE_ID,
            "concurrency": {
                "runtime_target_active": 0,
                "runtime_target_limit": 1,
                "source_workspace_active": 0,
                "source_workspace_limit": 2,
            },
            "diagnostics": [],
            "execution_policy": "current_workspace",
            "execution_workspace_preview": None,
            "is_fork_view": False,
            "prompt": "Previewed board request changes prompt",
            "queue_preview": {
                "queue_if_full": True,
                "slot_available": True,
                "will_queue": False,
            },
            "runtime_target_id": None,
            "template_kind": "request_changes",
            "template_source": "built_in",
            "thinking": {"enabled": False, "effort": None},
            "todo_id": "todo-v2-review",
            "view_workspace_id": _WORKSPACE_ID,
            "yolo": True,
        }

    def _board_request_changes_started_item(self) -> dict[str, object]:
        return {
            **self._board_review_item(),
            "item_revision": 4,
            "last_status_reason": "Queued board change request from browser",
            "run_id": "run-board-v2-review",
            "run_status": "running",
            "session_id": "session-board-v2-review",
            "status": "in_progress",
            "updated_at": "2026-06-25T08:27:00Z",
        }

    def _board_done_item(self) -> dict[str, object]:
        return {
            "body": "Completed board work can be archived from the module page.",
            "created_at": "2026-06-25T08:05:00Z",
            "issue_number": 403,
            "item_revision": 2,
            "repository_full_name": "openai/agent-teams",
            "run_recoverable": False,
            "source_key": "openai/agent-teams#403",
            "source_provider": "github",
            "source_type": "github_issue",
            "status": "done",
            "title": "Archive completed board action",
            "todo_id": "todo-v2-done",
            "updated_at": "2026-06-25T08:12:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _board_synced(self) -> dict[str, object]:
        item = {
            "body": "The browser flow replaced the board data after POST sync.",
            "created_at": "2026-06-25T08:20:00Z",
            "issue_number": 402,
            "item_revision": 4,
            "repository_full_name": "openai/agent-teams",
            "run_recoverable": False,
            "source_key": "openai/agent-teams#402",
            "source_provider": "github",
            "source_type": "github_issue",
            "status": "done",
            "title": "Board sync updated the module action",
            "todo_id": "todo-v2-synced",
            "updated_at": "2026-06-25T08:21:00Z",
            "workspace_id": _WORKSPACE_ID,
        }
        return self._board_response(item, revision=10, synced_at="2026-06-25T08:22:00Z")

    def _board_response(
        self,
        item: dict[str, object],
        *,
        revision: int,
        synced_at: str,
    ) -> dict[str, object]:
        return self._board_response_items(
            [item], revision=revision, synced_at=synced_at
        )

    def _board_response_items(
        self,
        items: list[dict[str, object]],
        *,
        revision: int,
        synced_at: str,
    ) -> dict[str, object]:
        return {
            "board_workspace_id": _WORKSPACE_ID,
            "diagnostics": [],
            "is_fork_view": False,
            "items": items,
            "repository_full_name": "openai/agent-teams",
            "revision": revision,
            "source_groups": [
                {
                    "display_name": "GitHub issues",
                    "enabled": True,
                    "group_id": "source-1",
                    "kind": "github_issues",
                    "repository_full_name": "openai/agent-teams",
                    "source_id": "source-1",
                }
            ],
            "status_counts": {
                "archived": sum(1 for item in items if item["status"] == "archived"),
                "done": sum(1 for item in items if item["status"] == "done"),
                "in_progress": sum(
                    1 for item in items if item["status"] == "in_progress"
                ),
                "review": sum(1 for item in items if item["status"] == "review"),
                "todo": sum(1 for item in items if item["status"] == "todo"),
            },
            "synced_at": synced_at,
            "view_workspace_id": _WORKSPACE_ID,
            "workspace_id": _WORKSPACE_ID,
        }

    def _board_source_settings(self) -> dict[str, object]:
        sources = []
        if not self.board_source_deleted:
            sources.append(self._board_source("source-1"))
        if self.board_source_created:
            sources.append(self._board_source("source-created"))
        return {
            "board_workspace_id": _WORKSPACE_ID,
            "diagnostics": [],
            "is_fork_view": False,
            "sources": sources,
            "view_workspace_id": _WORKSPACE_ID,
            "workspace_id": _WORKSPACE_ID,
        }

    def _board_source(self, source_id: str) -> dict[str, object]:
        display_name = (
            "Agent Teams triage"
            if source_id == "source-created"
            else self.board_source_display_name
        )
        repository = (
            "openai/agent-teams-triage"
            if source_id == "source-created"
            else "openai/agent-teams"
        )
        return {
            "source": {
                "created_at": "2026-06-25T08:00:00Z",
                "display_name": display_name,
                "enabled": self.board_source_enabled,
                "kind": "github_issues",
                "provider": "github",
                "repository_full_name": repository,
                "source_id": source_id,
                "system_managed": False,
                "updated_at": "2026-06-25T08:20:00Z",
                "workspace_id": _WORKSPACE_ID,
            },
            "state": {
                "last_diagnostics": [],
                "last_sync_finished_at": "2026-06-25T08:11:00Z",
                "last_sync_started_at": "2026-06-25T08:10:00Z",
                "last_sync_status": "succeeded",
                "source_id": source_id,
                "sync_cursor": "issue-cursor",
                "workspace_id": _WORKSPACE_ID,
            },
        }

    def _memory_summary(self) -> dict[str, object]:
        return {
            "confidence_score": 0.94,
            "content_body_preview": "Keep sidebar module entries aligned with V1.",
            "content_title": "V2 shell module parity",
            "created_at": "2026-06-25T08:00:00Z",
            "expires_at": None,
            "id": "memory-v2-shell",
            "kind": "constraint",
            "role_id": None,
            "scope": "workspace",
            "session_id": None,
            "source": "manual",
            "status": "active",
            "tags": ["frontend", "v2"],
            "tier": "persistent",
            "updated_at": "2026-06-25T08:30:00Z",
            "version": 1,
            "workspace_id": _WORKSPACE_ID,
        }

    def _memory_query(self) -> dict[str, object]:
        return {
            "items": [self._memory_summary()],
            "limit": 40,
            "offset": 0,
            "total_count": 1,
        }

    def _memory_detail(self) -> dict[str, object]:
        return {
            **self._memory_summary(),
            "access_count": 2,
            "content": {
                "body": "Keep sidebar module entries aligned with V1.",
                "context": "V2 frontend rewrite",
                "outcome": "Do not flatten secondary pages into the root shell.",
                "title": "V2 shell module parity",
            },
            "last_accessed_at": None,
            "metadata": {},
            "parent_entry_id": None,
            "run_id": None,
            "source_ref": "",
            "superseded_by_id": None,
        }


@contextmanager
def _serve_v2_app(repo_root: Path) -> Iterator[str]:
    legacy_root = repo_root / "frontend" / "dist"
    app_root = repo_root / "frontend" / "dist" / "app"

    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            request_path = unquote(urlsplit(path).path)
            if request_path in {"/app", "/app/"}:
                return str(app_root / "index.html")
            if request_path.startswith("/app/"):
                return str(app_root / request_path.removeprefix("/app/"))
            if request_path == "/":
                return str(legacy_root / "index.html")
            legacy_target = legacy_root.joinpath(
                *request_path.removeprefix("/").split("/")
            )
            if legacy_target.is_file():
                return str(legacy_target)
            return str(legacy_root / "index.html")

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


def _install_shell_state(page: Page, event_source_script: str | None = None) -> None:
    stream_script = event_source_script or """
          window.EventSource = class EventSource {
            constructor() {
              this.readyState = 1;
            }
            addEventListener() {
              return undefined;
            }
            removeEventListener() {
              return undefined;
            }
            close() {
              this.readyState = 2;
            }
          };
    """
    page.add_init_script(
        """
        (() => {
          window.localStorage.setItem('agentTeams.language', 'en');
          window.localStorage.setItem('agentTeams.themeMode', 'dark');
          window.localStorage.setItem('agent_teams_theme', 'dark');
          window.localStorage.setItem('agentTeams.selectedSessionId', 'session-v2-shell');
          window.localStorage.setItem('agentTeams.selectedWorkspaceId', 'workspace-v2-shell');
          window.localStorage.setItem('agentTeams.shellView', 'chat');
          if (window.sessionStorage.getItem('__v2ShellResizeSeeded') !== 'true') {
            window.localStorage.removeItem('agentTeams.sidebarWidth');
            window.localStorage.removeItem('agentTeams.sidebarWidthMigratedTo280');
            window.localStorage.removeItem('agentTeams.sidebarWidthMigratedTo260');
            window.sessionStorage.setItem('__v2ShellResizeSeeded', 'true');
          }
STREAM_SCRIPT
        })();
        """.replace("STREAM_SCRIPT", stream_script),
    )


def _stream_event_source_script() -> str:
    return """
          window.__v2StreamHarness = {
            sources: [],
            dispatch(index, type, payload, lastEventId = '') {
              const source = this.sources[index];
              if (!source) {
                throw new Error(`Missing stream source ${index}`);
              }
              source.dispatch(type, payload, lastEventId);
            },
            transportError(index) {
              const source = this.sources[index];
              if (!source) {
                throw new Error(`Missing stream source ${index}`);
              }
              source.transportError();
            },
            urls() {
              return this.sources.map((source) => source.url);
            },
            closedStates() {
              return this.sources.map((source) => source.closed === true);
            },
          };
          window.EventSource = class EventSource {
            constructor(url) {
              this.url = String(url);
              this.readyState = 1;
              this.closed = false;
              this.listeners = {};
              window.__v2StreamHarness.sources.push(this);
            }
            addEventListener(type, listener) {
              this.listeners[type] = [...(this.listeners[type] || []), listener];
            }
            removeEventListener(type, listener) {
              this.listeners[type] = (this.listeners[type] || []).filter(
                (current) => current !== listener,
              );
            }
            close() {
              this.readyState = 2;
              this.closed = true;
            }
            dispatch(type, payload, lastEventId = '') {
              const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
              const event = new MessageEvent(type, {
                data,
                lastEventId: String(lastEventId),
              });
              if (type === 'message' && typeof this.onmessage === 'function') {
                this.onmessage(event);
              }
              for (const listener of this.listeners[type] || []) {
                if (typeof listener === 'function') {
                  listener(event);
                } else if (listener && typeof listener.handleEvent === 'function') {
                  listener.handleEvent(event);
                }
              }
            }
            transportError() {
              const event = new Event('error');
              for (const listener of this.listeners.error || []) {
                if (typeof listener === 'function') {
                  listener(event);
                } else if (listener && typeof listener.handleEvent === 'function') {
                  listener.handleEvent(event);
                }
              }
              if (typeof this.onerror === 'function') {
                this.onerror(event);
              }
            }
          };
    """


def _stream_text_event(event_id: int, text: str) -> dict[str, object]:
    return _stream_text_event_for_run(event_id, _STREAM_RUN_ID, text, "MainAgent")


def _stream_text_event_for_run(
    event_id: int,
    run_id: str,
    text: str,
    role_id: str,
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "event_type": "text_delta",
        "occurred_at": "2026-06-26T00:00:00Z",
        "payload_json": json.dumps({"text": text}),
        "role_id": role_id,
        "run_id": run_id,
        "session_id": _SESSION_ID,
        "trace_id": "trace-v2-stream",
    }


def _stream_terminal_event(event_id: int, event_type: str) -> dict[str, object]:
    return {
        "event_id": event_id,
        "event_type": event_type,
        "occurred_at": "2026-06-26T00:00:00Z",
        "payload_json": json.dumps({"message": event_type}),
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "trace_id": "trace-v2-stream",
    }


def _stream_tool_call_event(event_id: int) -> dict[str, object]:
    return _stream_tool_event(
        event_id,
        "tool_call",
        {
            "args": {"path": "."},
            "tool_call_id": "tool-read-1",
            "tool_name": "read",
        },
    )


def _stream_tool_error_event(event_id: int) -> dict[str, object]:
    return _stream_tool_event(
        event_id,
        "tool_result",
        {
            "result": {
                "data": None,
                "error": {
                    "message": "File not found: .",
                    "retryable": False,
                    "type": "validation_error",
                },
                "ok": False,
            },
            "tool_call_id": "tool-read-1",
            "tool_name": "read",
        },
    )


def _stream_tool_validation_event(event_id: int) -> dict[str, object]:
    return _stream_tool_event(
        event_id,
        "tool_input_validation_failed",
        {
            "details": "Path is required before reading a file.",
            "reason": "Input validation failed before tool execution.",
            "tool_call_id": "tool-read-2",
            "tool_name": "read",
        },
    )


def _stream_tool_event(
    event_id: int,
    event_type: str,
    payload: dict[str, object],
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "event_type": event_type,
        "occurred_at": "2026-06-26T00:00:00Z",
        "payload_json": json.dumps(payload),
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "trace_id": "trace-v2-stream",
    }


def _stream_recovery_run(last_event_id: int) -> dict[str, object]:
    return {
        "last_event_id": last_event_id,
        "pending_tool_approval_count": 0,
        "pending_user_question_count": 0,
        "phase": "running",
        "run_id": _STREAM_RUN_ID,
        "session_id": _SESSION_ID,
        "should_show_recover": False,
        "status": "running",
        "stream_connected": True,
    }


def _split_nested_action_path(
    path: str,
    marker: str,
    suffix: str,
) -> tuple[str, str]:
    nested_path = path.removeprefix("/ag-ui/runs/")
    run_id, separator, rest = nested_path.partition(marker)
    if not separator or not rest.endswith(suffix):
        raise AssertionError(f"Unexpected nested AG-UI action path: {path}")
    return unquote(run_id), unquote(rest.removesuffix(suffix))


def _split_run_action_path(path: str, suffix: str) -> str:
    nested_path = path.removeprefix("/ag-ui/runs/")
    if not nested_path.endswith(suffix):
        raise AssertionError(f"Unexpected AG-UI run action path: {path}")
    return unquote(nested_path.removesuffix(suffix))


def _split_background_task_stop_path(path: str) -> tuple[str, str]:
    nested_path = path.removeprefix("/runs/")
    run_id, separator, rest = nested_path.partition("/background-tasks/")
    if not separator or not rest.endswith(":stop"):
        raise AssertionError(f"Unexpected background task stop path: {path}")
    return unquote(run_id), unquote(rest.removesuffix(":stop"))


def _wait_for_v2_shell(page: Page) -> None:
    page.wait_for_function(
        "() => document.body.dataset.bootstrapState === 'ready'",
        timeout=_WAIT_TIMEOUT_MS,
    )


def _wait_for_v1_shell(page: Page) -> None:
    page.wait_for_function(
        "() => document.body.dataset.bootstrapState === 'ready'",
        timeout=_WAIT_TIMEOUT_MS,
    )


def _wait_for_backend_state(
    predicate: Callable[[], bool],
    failure_message: str,
) -> None:
    deadline = time.monotonic() + (_WAIT_TIMEOUT_MS / 1000)
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError(failure_message)


def _expect_sidebar_width(page: Page, width: int) -> None:
    page.wait_for_function(
        """
        (expectedWidth) => {
          const sidebar = document.querySelector('.at-sidebar');
          if (!(sidebar instanceof HTMLElement)) {
            return false;
          }
          return Math.round(sidebar.getBoundingClientRect().width) === expectedWidth;
        }
        """,
        arg=width,
        timeout=_WAIT_TIMEOUT_MS,
    )


def _shell_frame_metrics(page: Page) -> _ShellFrameMetrics:
    metrics = page.evaluate(
        """
        () => {
          const workspace = document.querySelector('.at-workspace');
          const sidebar = document.querySelector('.at-sidebar');
          const scrim = document.querySelector('.at-sidebar-scrim');
          if (!(workspace instanceof HTMLElement)) {
            throw new Error('Workspace is missing.');
          }
          const workspaceRect = workspace.getBoundingClientRect();
          const sidebarRect = sidebar instanceof HTMLElement
            ? sidebar.getBoundingClientRect()
            : null;
          const scrimRect = scrim instanceof HTMLElement
            ? scrim.getBoundingClientRect()
            : null;
          return {
            bodyOverflow: window.getComputedStyle(document.body).overflow,
            documentClientHeight: document.documentElement.clientHeight,
            documentClientWidth: document.documentElement.clientWidth,
            documentScrollHeight: document.documentElement.scrollHeight,
            documentScrollWidth: document.documentElement.scrollWidth,
            scrimLeft: scrimRect ? Math.round(scrimRect.left) : -1,
            sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : 0,
            workspaceLeft: Math.round(workspaceRect.left),
            workspaceWidth: Math.round(workspaceRect.width),
          };
        }
        """,
    )
    assert isinstance(metrics, dict)
    return cast(_ShellFrameMetrics, metrics)


def _appearance_frame_metrics(page: Page) -> _AppearanceFrameMetrics:
    metrics = page.evaluate(
        """
        () => {
          const settingsBody = document.querySelector('.at-settings-section-body');
          const previews = Array.from(
            document.querySelectorAll('.at-appearance-theme-preview'),
          );
          if (!(settingsBody instanceof HTMLElement)) {
            throw new Error('Settings body is missing.');
          }
          return {
            accent: document.documentElement.style.getPropertyValue('--at-primary').trim(),
            background: document.documentElement.style.getPropertyValue('--at-bg').trim(),
            bodyOverflow: window.getComputedStyle(document.body).overflow,
            documentScrollHeight: document.documentElement.scrollHeight,
            foreground: document.documentElement.style.getPropertyValue('--at-text').trim(),
            previewHeights: previews.map((preview) =>
              Math.round(preview.getBoundingClientRect().height),
            ),
            previewWidths: previews.map((preview) =>
              Math.round(preview.getBoundingClientRect().width),
            ),
            rootTheme: document.documentElement.dataset.theme || '',
            settingsBodyOverflowY: window.getComputedStyle(settingsBody).overflowY,
            settingsBodyScrollHeight: settingsBody.scrollHeight,
            settingsBodyClientHeight: settingsBody.clientHeight,
          };
        }
        """,
    )
    assert isinstance(metrics, dict)
    return cast(_AppearanceFrameMetrics, metrics)


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
