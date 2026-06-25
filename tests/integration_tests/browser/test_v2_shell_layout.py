from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
import threading
from typing import cast
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
_WORKSPACE_ID = "workspace-v2-shell"


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

        _expect_sidebar_width(page, 280)

        resizer = page.locator(".at-sidebar-resizer")
        expect(resizer).to_have_attribute("aria-valuenow", "280")
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
                "() => localStorage.getItem('agentTeams.sidebarWidthMigratedTo280')",
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


class _V2ShellBackend:
    def __init__(self) -> None:
        self.rounds_request_count = 0

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
            self.rounds_request_count += 1
            _fulfill_json(route, self._rounds_page())
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/token-usage":
            _fulfill_json(route, {"by_role": {}, "input_tokens": 0, "output_tokens": 0})
            return
        if request.method == "GET" and path == f"/sessions/{_SESSION_ID}/recovery":
            _fulfill_json(
                route,
                {
                    "active_run": None,
                    "background_tasks": [],
                    "paused_subagents": [],
                    "pending_tool_approvals": [],
                    "pending_user_questions": [],
                    "recoverable_stopped_run": None,
                },
            )
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
                    "subagent_roles": [],
                },
            )
            return
        if request.method == "GET" and path == "/system/configs/model/profiles":
            _fulfill_json(
                route,
                {
                    "default_profile_id": "default",
                    "profiles": [{"label": "Default", "profile_id": "default"}],
                },
            )
            return
        if request.method == "GET" and path == "/system/configs/orchestration":
            _fulfill_json(route, {"default_preset_id": "default", "presets": []})
            return
        if request.method == "GET" and path == "/system/configs/general":
            _fulfill_json(route, {"shell_safety_policy_enabled": True})
            return
        _fulfill_json(
            route,
            {"detail": f"Unhandled mock API route: {path}"},
            status=404,
        )

    def _workspace(self) -> dict[str, object]:
        return {
            "display_name": "agent-teams",
            "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

    def _sidebar_session(self) -> dict[str, object]:
        return {
            "active_run_id": None,
            "active_run_phase": "",
            "active_run_status": "",
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "V2 shell resize",
            "updated_at": "2026-06-25T08:00:00Z",
            "workspace_id": _WORKSPACE_ID,
        }

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
                    "run_id": "run-v2-shell",
                    "run_phase": "completed",
                    "run_status": "completed",
                    "run_user_message": "V2 export prompt",
                }
            ],
            "next_cursor": None,
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


def _install_shell_state(page: Page) -> None:
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
            window.sessionStorage.setItem('__v2ShellResizeSeeded', 'true');
          }
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
        })();
        """,
    )


def _wait_for_v2_shell(page: Page) -> None:
    page.wait_for_function(
        "() => document.body.dataset.bootstrapState === 'ready'",
        timeout=_WAIT_TIMEOUT_MS,
    )


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
