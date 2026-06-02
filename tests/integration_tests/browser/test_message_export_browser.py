# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import threading
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from typing import Iterator, cast
from urllib.parse import unquote, urlsplit

from playwright.sync_api import Page, Route, sync_playwright

from tests.integration_tests.browser._safe_http_server import (
    create_browser_safe_http_server,
)

_WAIT_TIMEOUT_MS = 30000
_SESSION_ID = "export-session"


def test_message_export_html_title_and_png_decode_in_browser(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    browser_root = _resolve_playwright_browser_root()
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_root)

    with _serve_harness_directory(repo_root, tmp_path) as base_url:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1200, "height": 800})
            page.set_default_timeout(_WAIT_TIMEOUT_MS)
            _route_export_api(page)
            _load_harness(page, tmp_path, base_url)

            result = cast(
                dict[str, object],
                page.evaluate(
                    """async () => {
                        const stateModule = await import('/js/core/state.js');
                        const exportModule = await import('/js/components/messageExport.js');
                        stateModule.state.currentSessionId = 'export-session';

                        const html = await exportModule.downloadCurrentSessionMessagesHtml({
                            download: false,
                        });
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const pngChunks = await exportModule.downloadCurrentSessionMessagesPng({
                            download: false,
                            maxChunkHeight: 140,
                        });
                        const pngInfo = Array.isArray(pngChunks)
                            ? await Promise.all(pngChunks.map(async blob => {
                                const info = {
                                    type: blob.type,
                                    size: blob.size,
                                    decoded: false,
                                    width: 0,
                                    height: 0,
                                    error: '',
                                };
                                try {
                                    const bitmap = await createImageBitmap(blob);
                                    info.decoded = true;
                                    info.width = bitmap.width;
                                    info.height = bitmap.height;
                                    bitmap.close();
                                } catch (error) {
                                    info.error = error?.message || String(error);
                                }
                                return info;
                            }))
                            : null;
                        return {
                            title: doc.title,
                            heading: doc.querySelector('.message-export-title')?.textContent || '',
                            hasSidebarTime: html.includes('1时'),
                            roundCount: doc.querySelectorAll('.session-round-section').length,
                            userTexts: Array.from(doc.querySelectorAll('.round-detail-intent-preview'))
                                .map(item => item.textContent.replace(/\\s+/g, ' ').trim()),
                            finalTexts: Array.from(doc.querySelectorAll('.session-round-section > .message .msg-text'))
                                .map(item => item.textContent.trim()),
                            hasLegacyRoundHeader: !!doc.querySelector('.round-detail-header'),
                            hasRoundIntent: !!doc.querySelector('.round-detail-intent'),
                            hasToolGroup: !!doc.querySelector('.tool-group'),
                            hasToolBlock: !!doc.querySelector('.tool-block'),
                            hasShareTurn: !!doc.querySelector('.message-export-turn, .message-export-user, .message-export-agent'),
                            bodyText: doc.body.textContent || '',
                            pngInfo,
                        };
                    }""",
                ),
            )
            browser.close()

    assert result["title"] == "Clean Export Title"
    assert result["heading"] == "Clean Export Title"
    assert result["hasSidebarTime"] is False
    assert result["roundCount"] == 2
    assert result["userTexts"] == ["First user prompt", "Second user prompt"]
    final_texts = cast(list[str], result["finalTexts"])
    assert "First agent answer." in final_texts
    assert "Second agent answer." in final_texts
    assert result["hasLegacyRoundHeader"] is True
    assert result["hasRoundIntent"] is True
    assert result["hasToolGroup"] is True
    assert result["hasToolBlock"] is True
    assert result["hasShareTurn"] is False
    body_text = cast(str, result["bodyText"])
    assert "Round" not in body_text
    assert "第 1 轮" not in body_text
    assert "src/a.py" in body_text

    png_info = cast(list[dict[str, object]] | None, result["pngInfo"])
    assert png_info is not None
    assert len(png_info) > 1
    for chunk in png_info:
        assert chunk["type"] == "image/png"
        assert cast(int, chunk["size"]) > 0
        assert chunk["decoded"] is True, chunk["error"]
        assert cast(int, chunk["width"]) > 0
        assert cast(int, chunk["height"]) > 0


def _route_export_api(page: Page) -> None:
    page.route("**/api/logs/frontend", lambda route: route.fulfill(status=204, body=""))
    page.route(f"**/api/sessions/{_SESSION_ID}/rounds?**", _fulfill_rounds)


def _fulfill_rounds(route: Route) -> None:
    route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps(
            {
                "items": [
                    {
                        "run_id": "run-export-1",
                        "created_at": "2026-06-01T02:00:00Z",
                        "intent": "First user prompt",
                        "intent_parts": [{"kind": "text", "text": "First user prompt"}],
                        "run_status": "completed",
                        "run_phase": "completed",
                        "has_final_output": True,
                        "coordinator_messages": [
                            {
                                "message_id": "m1a",
                                "role": "assistant",
                                "role_id": "main_agent",
                                "content": "I will inspect files.",
                                "created_at": "2026-06-01T02:00:01Z",
                                "message": {
                                    "parts": [
                                        {
                                            "part_kind": "text",
                                            "content": "I will inspect files.",
                                        },
                                        {
                                            "part_kind": "tool-call",
                                            "tool_name": "read_file",
                                            "tool_call_id": "call-export-1",
                                            "args": {"path": "src/a.py"},
                                        },
                                        {
                                            "part_kind": "text",
                                            "content": "First agent answer.",
                                        },
                                    ]
                                },
                            }
                        ],
                        "pending_tool_approvals": [],
                    },
                    {
                        "run_id": "run-export-2",
                        "created_at": "2026-06-01T02:05:00Z",
                        "intent": "Second user prompt",
                        "intent_parts": [
                            {"kind": "text", "text": "Second user prompt"}
                        ],
                        "run_status": "completed",
                        "run_phase": "completed",
                        "has_final_output": True,
                        "coordinator_messages": [
                            {
                                "message_id": "m2",
                                "role": "assistant",
                                "role_id": "main_agent",
                                "content": "Second agent answer.",
                                "created_at": "2026-06-01T02:05:01Z",
                                "message": {
                                    "parts": [
                                        {
                                            "part_kind": "text",
                                            "content": "Second agent answer.",
                                        }
                                    ]
                                },
                            }
                        ],
                        "pending_tool_approvals": [],
                    },
                ],
                "has_more": False,
                "next_cursor": None,
            }
        ),
    )


def _load_harness(page: Page, harness_root: Path, base_url: str) -> None:
    html_path = harness_root / "message-export-harness.html"
    html_path.write_text(
        """
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Message Export Harness</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="session-item" data-session-id="export-session">
    <span class="session-main">
      <span class="session-id">
        <span class="session-label-text">Clean Export Title</span>
      </span>
    </span>
    <span class="session-meta">
      <span class="session-time">1时</span>
    </span>
  </div>
  <div id="message-export-control">
    <button id="message-export-btn" type="button"></button>
    <div id="message-export-menu" hidden>
      <button id="message-export-html" type="button"></button>
      <button id="message-export-png" type="button"></button>
    </div>
  </div>
</body>
</html>
""".strip(),
        encoding="utf-8",
    )
    page.goto(f"{base_url}/{html_path.name}")


@contextmanager
def _serve_harness_directory(repo_root: Path, harness_root: Path) -> Iterator[str]:
    frontend_dist = repo_root / "frontend" / "dist"

    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            request_path = unquote(urlsplit(path).path).lstrip("/")
            if request_path.startswith("frontend/"):
                return str(repo_root / request_path)
            frontend_path = frontend_dist / request_path
            if frontend_path.exists():
                return str(frontend_path)
            return str(harness_root / request_path)

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


def _resolve_playwright_browser_root() -> Path:
    env_value = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    candidates: list[Path] = []
    if env_value:
        candidates.append(Path(env_value).expanduser())
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(Path(local_app_data).expanduser() / "ms-playwright")
        user_profile = os.environ.get("USERPROFILE")
        if user_profile:
            candidates.append(
                Path(user_profile).expanduser() / "AppData" / "Local" / "ms-playwright"
            )
    candidates.append(Path.home() / ".cache" / "ms-playwright")
    for candidate in candidates:
        if _has_playwright_chromium(candidate):
            return candidate
    return candidates[0] if candidates else Path.home() / ".cache" / "ms-playwright"


def _has_playwright_chromium(path: Path) -> bool:
    if not path.exists():
        return False
    executable_names = {
        "chrome",
        "chrome.exe",
        "chrome-headless-shell",
        "chrome-headless-shell.exe",
        "Chromium",
    }
    for child in path.glob("chromium*"):
        if not child.is_dir():
            continue
        for executable in child.rglob("*"):
            if executable.name in executable_names and executable.is_file():
                return True
    return False
