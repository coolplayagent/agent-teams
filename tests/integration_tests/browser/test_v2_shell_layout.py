from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
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
        expect(settings.get_by_text("Session startup setup")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )
        settings.get_by_role("button", name="Back", exact=True).click()
        expect(system_pages.filter(has_text="Hooks")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS,
        )

        system_pages.filter(has_text="Agent Runtime").click()
        expect(
            settings.get_by_role("heading", name="Agent Runtime")
        ).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
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
    def __init__(self, *, include_image_message: bool = False) -> None:
        self.include_image_message = include_image_message
        self.open_root_queries: list[str] = []
        self.requested_paths: list[str] = []
        self.requested_urls: list[str] = []
        self.rounds_request_count = 0
        self.snapshot_request_count = 0

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
        if request.method == "GET" and path == "/system/configs/plugins/runtime":
            _fulfill_json(route, self._plugins_runtime())
            return
        if request.method == "GET" and path == "/system/configs/hooks":
            _fulfill_json(route, self._hooks_config())
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
        if request.method == "GET" and path == "/connectors":
            _fulfill_json(route, self._connectors())
            return
        if request.method == "GET" and path == "/connectors/runtime-tools":
            _fulfill_json(route, self._runtime_tools())
            return
        if request.method == "GET" and path == "/boards/todos":
            _fulfill_json(route, self._board())
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

    def _plugins_runtime(self) -> dict[str, object]:
        return {
            "diagnostics": [],
            "plugins": [
                {
                    "command_sources": [{"name": "workspace-command"}],
                    "description": "Workspace utilities",
                    "enabled": True,
                    "name": "workspace-tools",
                    "skill_sources": [{"name": "workspace-skill"}],
                    "valid": True,
                }
            ],
        }

    def _hooks_config(self) -> dict[str, object]:
        return {
            "hooks": {
                "SessionStart": [
                    {
                        "command": "python hooks/start.py",
                        "name": "Session startup setup",
                    }
                ]
            }
        }

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
            "status": "enabled",
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
                "added": True,
                "bin_dir": "C:/Users/yex/.agent-teams/bin",
                "supported": True,
            },
        }

    def _board(self) -> dict[str, object]:
        item = {
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
        return {
            "board_workspace_id": _WORKSPACE_ID,
            "diagnostics": [],
            "is_fork_view": False,
            "items": [item],
            "repository_full_name": "openai/agent-teams",
            "revision": 9,
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
                "archived": 0,
                "done": 0,
                "in_progress": 0,
                "review": 0,
                "todo": 1,
            },
            "synced_at": "2026-06-25T08:11:00Z",
            "view_workspace_id": _WORKSPACE_ID,
            "workspace_id": _WORKSPACE_ID,
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
            window.localStorage.removeItem('agentTeams.sidebarWidthMigratedTo260');
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
