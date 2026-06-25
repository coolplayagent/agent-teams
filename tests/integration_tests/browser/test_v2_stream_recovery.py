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


class _V2StreamBackend:
    def __init__(self) -> None:
        self.completed = False
        self.last_event_id = 0
        self.persisted_assistant_text = ""
        self.run_created = False
        self.run_payload: dict[str, object] | None = None

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
        return {
            "active_run_id": active_run_id,
            "active_run_phase": "streaming" if active_run_id is not None else "",
            "active_run_status": "running" if active_run_id is not None else "",
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
                    "run_phase": "streaming",
                    "run_status": "running" if not self.completed else "completed",
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
            active_run = {
                "last_event_id": self.last_event_id,
                "phase": "streaming",
                "run_id": _RUN_ID,
                "session_id": _SESSION_ID,
                "should_show_recover": False,
                "status": "running",
                "stream_connected": False,
            }
        return {
            "active_run": active_run,
            "background_tasks": [],
            "paused_subagent": None,
            "pending_tool_approvals": [],
            "pending_user_questions": [],
            "round_snapshot": None,
        }

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
