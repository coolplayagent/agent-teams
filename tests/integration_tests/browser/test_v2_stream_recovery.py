from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
import re
import threading
from typing import cast
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
_WORKSPACE_ID = "workspace-v2"
_RUN_ID = "run-v2-stream"
_PROMPT = "stream recovery probe"
_FIRST_CHUNK = "first chunk "
_AFTER_RELOAD_CHUNK = "after reload"
_QUEUED_INJECTION = "queued follow-up"
_INTERRUPT_INJECTION = "interrupt now"
_RESUMED_CHUNK = "resumed chunk"
_APPROVAL_TOOL_CALL_ID = "call-v2-approval"
_QUESTION_ID = "question-v2-recovery"
_QUESTION_SUPPLEMENT = "Need release note"


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


def test_v2_recoverable_run_resumes_before_tool_approval(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend(pending_tool_approval=True)
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        expect(page.get_by_text("execute_command")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text('{"cmd":"npm test"}')).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_role("button", name="Resume")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.get_by_role("button", name="Allow once").click()
        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=7'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.resume_requested is True
        assert backend.approval_resolutions == [
            {"action": "approve", "option_id": "allow_once"},
        ]


def test_v2_recoverable_run_resumes_before_user_question_answer(
    browser_page: Page,
) -> None:
    page = browser_page
    repo_root = Path(__file__).resolve().parents[3]
    backend = _V2StreamBackend(pending_user_question=True)
    page.route("**/api/**", backend.route)
    _install_mock_event_source(page)

    with _serve_v2_app(repo_root) as app_url:
        page.goto(f"{app_url}/app/")
        _wait_for_v2_shell(page)

        expect(page.get_by_text("Planner needs input")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_text("Pick the handoff mode")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.get_by_role("button", name="Resume")).to_be_hidden(
            timeout=_WAIT_TIMEOUT_MS,
        )

        page.get_by_text("Ship - Deploy now").click()
        page.get_by_text("Other").click()
        page.get_by_label("Additional answer").fill(_QUESTION_SUPPLEMENT)
        page.get_by_role("button", name="Answer").click()

        page.wait_for_function(
            """
            () => window.__v2EventSourceUrls.some((url) =>
              url.includes('/api/ag-ui/runs/run-v2-stream/events')
              && url.includes('after_event_id=7'))
            """,
            timeout=_WAIT_TIMEOUT_MS,
        )
        assert backend.resume_requested is True
        assert backend.question_answers == [
            {
                "answers": [
                    {
                        "selections": [
                            {"label": "Ship"},
                            {
                                "label": "__none_of_the_above__",
                                "supplement": _QUESTION_SUPPLEMENT,
                            },
                        ],
                    },
                ],
            },
        ]


class _V2StreamBackend:
    def __init__(
        self,
        *,
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
        self.pending_tool_approval = pending_tool_approval
        self.pending_user_question = pending_user_question
        self.recoverable_stopped_run = (
            recoverable_stopped_run or has_pending_recovery_action
        )
        self.approval_resolutions: list[dict[str, object]] = []
        self.question_answers: list[dict[str, object]] = []
        self.resume_requested = False
        self.run_created = self.recoverable_stopped_run
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
            _fulfill_json(route, [self._sidebar_session()])
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}":
            _fulfill_json(route, self._session())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/messages":
            _fulfill_json(route, self._messages())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/rounds":
            _fulfill_json(route, self._rounds_page())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/token-usage":
            _fulfill_json(route, self._token_usage())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/recovery":
            _fulfill_json(route, self._recovery())
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
            "background_tasks": [],
            "paused_subagent": None,
            "pending_tool_approvals": self._pending_tool_approvals(),
            "pending_user_questions": self._pending_user_questions(),
            "round_snapshot": None,
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

            emit(type, payload) {
              const data = JSON.stringify(payload);
              const event = new MessageEvent(type, {
                data,
                lastEventId: String(payload.event_id || ''),
              });
              if (type === 'message' && typeof this.onmessage === 'function') {
                this.onmessage(event);
              }
              for (const listener of this.listeners.get(type) || []) {
                listener.call(this, event);
              }
            }
          }

          window.__v2EventSources = [];
          window.__v2EventSourceUrls = [];
          window.__v2EmitRunEvent = (payload) => {
            const source = window.__v2EventSources
              .filter((item) => item.readyState !== 2)
              .at(-1);
            if (!source) {
              throw new Error('No open EventSource to receive the mock event.');
            }
            source.emit('message', payload);
          };
          window.__v2OpenEventSourceCount = () =>
            window.__v2EventSources.filter((item) => item.readyState !== 2).length;
          window.EventSource = MockEventSource;
        })();
        """,
    )


def _wait_for_v2_shell(page: Page) -> None:
    page.wait_for_function(
        "() => document.body.dataset.bootstrapState === 'ready'",
        timeout=_WAIT_TIMEOUT_MS,
    )


def _emit_relay_event(
    page: Page,
    event_type: str,
    event_id: int,
    payload: dict[str, object],
) -> None:
    page.evaluate(
        """
        ([eventType, eventId, payload]) => {
          window.__v2EmitRunEvent({
            event_id: eventId,
            event_type: eventType,
            occurred_at: '2026-06-25T08:00:03Z',
            payload_json: JSON.stringify(payload),
            role_id: 'MainAgent',
            run_id: 'run-v2-stream',
            session_id: 'session-v2-stream',
            trace_id: 'trace-v2-stream',
          });
        }
        """,
        [event_type, event_id, payload],
    )


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
