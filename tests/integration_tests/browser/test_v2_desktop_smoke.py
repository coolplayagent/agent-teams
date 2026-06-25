from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler
import json
import mimetypes
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from typing import cast
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

import pytest
from playwright.sync_api import Browser
from playwright.sync_api import Page
from playwright.sync_api import expect
from playwright.sync_api import sync_playwright

from tests.integration_tests.browser._safe_http_server import (
    create_browser_safe_http_server,
)


_WAIT_TIMEOUT_MS = 20_000
_WORKSPACE_ID = "workspace-desktop-smoke"
_SESSION_ID = "session-desktop-smoke"
_DESKTOP_API_KEYS = [
    "copyText",
    "getBackendStatus",
    "getVersion",
    "onBackendStatus",
    "openExternal",
    "retryStartup",
]


@pytest.mark.skipif(
    not sys.platform.startswith("win") and not os.environ.get("DISPLAY"),
    reason="Electron smoke test requires a graphical desktop session.",
)
def test_v2_electron_loads_renderer_with_isolated_preload() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    electron = _electron_executable(repo_root)
    if not electron.exists():
        pytest.skip(f"Electron executable is not installed: {electron}")

    with _serve_desktop_backend(repo_root, healthy=True) as backend_url:
        process, debug_port = _launch_electron(repo_root, electron, backend_url)
        try:
            with _connect_to_electron_page(debug_port) as page:
                diagnostics = _capture_page_diagnostics(page)
                page.wait_for_url(f"{backend_url}/app/", timeout=_WAIT_TIMEOUT_MS)

                try:
                    expect(page.locator(".at-shell")).to_be_visible(
                        timeout=_WAIT_TIMEOUT_MS,
                    )
                except AssertionError as error:
                    _save_desktop_screenshot(
                        repo_root,
                        page,
                        "v2-electron-renderer-failed.png",
                    )
                    raise AssertionError(
                        _desktop_page_diagnostics(page, diagnostics)
                    ) from error
                expect(page.locator(".at-sidebar-new-session")).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(page.get_by_text("agent-teams").first).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(
                    page.locator(".at-sidebar-backend-status.is-online")
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(page.get_by_text("Electron renderer smoke")).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )

                desktop_keys = cast(
                    list[str],
                    page.evaluate(
                        "() => Object.keys(window.agentTeamsDesktop || {}).sort()",
                    ),
                )
                assert desktop_keys == sorted(_DESKTOP_API_KEYS)
                assert page.evaluate("() => typeof window.require") == "undefined"
                assert page.evaluate("() => typeof window.process") == "undefined"

                app_version = cast(
                    str,
                    page.evaluate("() => window.agentTeamsDesktop.getVersion()"),
                )
                assert app_version.strip()

                backend_status = cast(
                    dict[str, object],
                    page.evaluate("() => window.agentTeamsDesktop.getBackendStatus()"),
                )
                assert backend_status == {
                    "baseUrl": backend_url,
                    "message": "Backend ready.",
                    "state": "ready",
                }

                _save_desktop_screenshot(repo_root, page, "v2-electron-renderer.png")
        finally:
            _stop_electron(process)


@pytest.mark.skipif(
    not sys.platform.startswith("win") and not os.environ.get("DISPLAY"),
    reason="Electron smoke test requires a graphical desktop session.",
)
def test_v2_electron_shows_backend_startup_failure() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    electron = _electron_executable(repo_root)
    if not electron.exists():
        pytest.skip(f"Electron executable is not installed: {electron}")

    copy_log = repo_root / ".tmp" / "frontend-v2-desktop" / "copy-diagnostics.log"
    if copy_log.exists():
        copy_log.unlink()

    with _serve_desktop_backend(repo_root, healthy=False) as backend_url:
        process, debug_port = _launch_electron(
            repo_root,
            electron,
            backend_url,
            extra_env={"AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG": str(copy_log)},
            startup_timeout_ms=900,
            test_mode=True,
        )
        try:
            with _connect_to_electron_page(debug_port) as page:
                diagnostics = _capture_page_diagnostics(page)
                expect(
                    page.get_by_role("heading", name="Startup failed"),
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(
                    page.get_by_role("button", name="Copy diagnostics"),
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(
                    page.get_by_role("button", name="Retry startup"),
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(
                    page.get_by_text(
                        f"Backend was not ready at {backend_url}.",
                        exact=True,
                    ),
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                backend_status = cast(
                    dict[str, object],
                    page.evaluate("() => window.agentTeamsDesktop.getBackendStatus()"),
                )
                assert backend_status == {
                    "baseUrl": backend_url,
                    "message": f"Backend was not ready at {backend_url}.",
                    "state": "failed",
                }

                page.get_by_role("button", name="Copy diagnostics").click()
                assert f"Backend: {backend_url}" in _wait_for_text(
                    copy_log, f"Backend: {backend_url}"
                )

                page.get_by_role("button", name="Retry startup").click()
                expect(
                    page.locator(".status-label", has_text="Starting")
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                expect(
                    page.get_by_role("heading", name="Startup failed"),
                ).to_be_visible(
                    timeout=_WAIT_TIMEOUT_MS,
                )
                page_errors = [
                    entry for entry in diagnostics if entry.startswith("pageerror:")
                ]
                assert page_errors == []

                _save_desktop_screenshot(
                    repo_root,
                    page,
                    "v2-electron-startup-failed.png",
                )
        finally:
            _stop_electron(process)


@pytest.mark.skipif(
    not sys.platform.startswith("win") and not os.environ.get("DISPLAY"),
    reason="Electron smoke test requires a graphical desktop session.",
)
def test_v2_electron_open_external_uses_preload_main_boundary() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    electron = _electron_executable(repo_root)
    if not electron.exists():
        pytest.skip(f"Electron executable is not installed: {electron}")

    external_log = repo_root / ".tmp" / "frontend-v2-desktop" / "open-external.log"
    if external_log.exists():
        external_log.unlink()

    with _serve_desktop_backend(repo_root, healthy=True) as backend_url:
        process, debug_port = _launch_electron(
            repo_root,
            electron,
            backend_url,
            extra_env={"AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG": str(external_log)},
            test_mode=True,
        )
        try:
            with _connect_to_electron_page(debug_port) as page:
                page.wait_for_url(f"{backend_url}/app/", timeout=_WAIT_TIMEOUT_MS)
                page.get_by_role("link", name="Desktop docs").click()
                assert "https://example.com/docs?source=markdown#v2" in _wait_for_text(
                    external_log, "https://example.com/docs?source=markdown#v2"
                )

                page.evaluate(
                    """async () => {
                        await window.agentTeamsDesktop.openExternal(
                            "https://example.com/docs?source=electron#v2",
                        );
                    }""",
                )
                assert "https://example.com/docs?source=electron#v2" in _wait_for_text(
                    external_log, "https://example.com/docs"
                )

                invalid_result = cast(
                    str,
                    page.evaluate(
                        """async () => {
                        try {
                            await window.agentTeamsDesktop.openExternal(
                                "file:///C:/Users/yex/token.txt",
                            );
                            return "resolved";
                        } catch (error) {
                            return error instanceof Error ? error.message : String(error);
                        }
                    }""",
                    ),
                )
                assert (
                    "Only http and https links can be opened externally."
                    in invalid_result
                )
        finally:
            _stop_electron(process)


@pytest.mark.skipif(
    not sys.platform.startswith("win") and not os.environ.get("DISPLAY"),
    reason="Electron smoke test requires a graphical desktop session.",
)
def test_v2_electron_managed_backend_starts_and_stops_with_main_lifecycle() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    electron = _electron_executable(repo_root)
    if not electron.exists():
        pytest.skip(f"Electron executable is not installed: {electron}")

    backend_port = _available_browser_safe_port()
    backend_url = f"http://127.0.0.1:{backend_port}"
    stub_script = _write_managed_backend_stub(repo_root)
    request_log = (
        repo_root / ".tmp" / "frontend-v2-desktop" / f"managed-{backend_port}.log"
    )
    trace_log = (
        repo_root / ".tmp" / "frontend-v2-desktop" / f"auto-quit-{backend_port}.log"
    )
    process, _debug_port = _launch_electron(
        repo_root,
        electron,
        None,
        extra_env={
            "AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS": "750",
            "AGENT_TEAMS_BACKEND_COMMAND": sys.executable,
            "AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON": json.dumps(
                [
                    str(stub_script),
                    "server",
                    "start",
                    "--host",
                    "{host}",
                    "--port",
                    "{port}",
                ],
            ),
            "AGENT_TEAMS_BACKEND_HOST": "127.0.0.1",
            "AGENT_TEAMS_BACKEND_PORT": str(backend_port),
            "AGENT_TEAMS_DESKTOP_AUTO_QUIT_TRACE": str(trace_log),
            "AGENT_TEAMS_DESKTOP_MANAGED_REQUEST_LOG": str(request_log),
        },
        startup_timeout_ms=4_000,
        test_mode=True,
    )
    try:
        trace_log_text = _wait_for_text(trace_log, "fired")
        assert "scheduled:750" in trace_log_text
        request_log_text = request_log.read_text(encoding="utf-8")
        assert "/api/health" in request_log_text
        assert "/app/" in request_log_text
        _wait_for_backend_down(backend_url)
    finally:
        _stop_electron(process)


@contextmanager
def _serve_desktop_backend(repo_root: Path, *, healthy: bool) -> Iterator[str]:
    app_root = repo_root / "frontend" / "dist" / "app"

    class DesktopBackendHandler(SimpleHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlsplit(self.path)
            path = parsed.path
            if path == "/api/health":
                if healthy:
                    _send_json(self, {"status": "ok"})
                    return
                _send_json(self, {"status": "starting"}, status=503)
                return
            if path.startswith("/api/"):
                _send_json(self, _api_response(path))
                return
            _serve_static_app_file(self, app_root, path)

        def log_message(self, format: str, *_args: object) -> None:
            del format
            return

    server = create_browser_safe_http_server(DesktopBackendHandler)
    _, port = cast(tuple[str, int], server.server_address)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _api_response(path: str) -> object:
    if path == "/api/system/health":
        return {"status": "ok"}
    if path == "/api/workspaces":
        return [
            {
                "display_name": "agent-teams",
                "root_path": "C:/Users/yex/Documents/workspace/agent-teams",
                "updated_at": "2026-06-25T09:00:00Z",
                "workspace_id": _WORKSPACE_ID,
            }
        ]
    if path == "/api/sessions/sidebar":
        return [
            {
                "active_run_id": None,
                "active_run_phase": "",
                "active_run_status": "",
                "session_id": _SESSION_ID,
                "session_mode": "normal",
                "title": "Desktop smoke",
                "updated_at": "2026-06-25T09:01:00Z",
                "workspace_id": _WORKSPACE_ID,
            }
        ]
    if path == f"/api/sessions/{_SESSION_ID}":
        return {
            "can_switch_mode": True,
            "normal_model_profile": "default",
            "normal_root_role_id": "MainAgent",
            "orchestration_preset_id": "default",
            "session_id": _SESSION_ID,
            "session_mode": "normal",
            "title": "Desktop smoke",
            "workspace_id": _WORKSPACE_ID,
        }
    if path == f"/api/sessions/{_SESSION_ID}/messages":
        text = (
            "Electron renderer smoke "
            "[Desktop docs](https://example.com/docs?source=markdown#v2)"
        )
        return [
            {
                "content": text,
                "created_at": "2026-06-25T09:01:30Z",
                "message_id": "message-desktop-smoke",
                "parts": [{"kind": "text", "text": text}],
                "role": "assistant",
                "role_id": "MainAgent",
                "run_id": "run-desktop-smoke",
                "trace_id": "trace-desktop-smoke",
            }
        ]
    if path == f"/api/sessions/{_SESSION_ID}/rounds":
        return {
            "items": [
                {
                    "created_at": "2026-06-25T09:01:00Z",
                    "id": "round-desktop-smoke",
                    "prompt": "Open desktop",
                    "status": "completed",
                }
            ],
            "next_cursor": None,
        }
    if path == f"/api/sessions/{_SESSION_ID}/token-usage":
        return {"by_role": {}, "input_tokens": 0, "output_tokens": 0}
    if path == f"/api/sessions/{_SESSION_ID}/recovery":
        return {
            "active_runs": [],
            "background_tasks": [],
            "pending_approvals": [],
            "pending_user_questions": [],
            "recoverable_runs": [],
        }
    if path == "/api/roles:options":
        return {
            "default_role_id": "default",
            "roles": [{"id": "default", "name": "Default"}],
        }
    if path == "/api/system/configs/general":
        return {"shell_safety_policy_enabled": True}
    if path == "/api/system/configs/model/profiles":
        return {"active_profile_id": "default", "profiles": []}
    if path == "/api/system/configs/orchestration":
        return {"default_preset_id": "default", "presets": []}
    return {"detail": f"Unhandled desktop smoke API route: {path}"}


def _serve_static_app_file(
    handler: SimpleHTTPRequestHandler,
    app_root: Path,
    path: str,
) -> None:
    target = app_root / "index.html"
    if path.startswith("/app/") and path != "/app/":
        target = app_root.joinpath(*path.removeprefix("/app/").split("/"))
    if path == "/app":
        target = app_root / "index.html"

    app_root_resolved = app_root.resolve()
    target_resolved = target.resolve()
    if (
        not target_resolved.is_relative_to(app_root_resolved)
        or not target_resolved.exists()
    ):
        handler.send_error(404)
        return

    content_type = (
        mimetypes.guess_type(target_resolved.name)[0] or "application/octet-stream"
    )
    if target_resolved.suffix == ".js":
        content_type = "text/javascript"
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(target_resolved.stat().st_size))
    handler.end_headers()
    handler.wfile.write(target_resolved.read_bytes())


def _send_json(
    handler: SimpleHTTPRequestHandler,
    payload: object,
    *,
    status: int = 200,
) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _write_managed_backend_stub(repo_root: Path) -> Path:
    stub_dir = repo_root / ".tmp" / "frontend-v2-desktop"
    stub_dir.mkdir(parents=True, exist_ok=True)
    stub = stub_dir / "managed_backend_stub.py"
    stub.write_text(
        """
from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from http.server import ThreadingHTTPServer
import json
import os
import sys


def main() -> None:
    host = _arg_value("--host")
    port = int(_arg_value("--port"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.serve_forever()


def _arg_value(name: str) -> str:
    try:
        return sys.argv[sys.argv.index(name) + 1]
    except (ValueError, IndexError) as exc:
        raise SystemExit(f"Missing required argument: {name}") from exc


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        request_log = os.environ.get("AGENT_TEAMS_DESKTOP_MANAGED_REQUEST_LOG")
        if request_log:
            with open(request_log, "a", encoding="utf-8") as handle:
                handle.write(f"{self.path}\\n")
        if self.path == "/api/health":
            self._json({"status": "ok"})
            return
        if self.path == "/app/" or self.path == "/app":
            body = b"<!doctype html><html><body><main><h1>Managed backend ready</h1></main></body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        del format, args

    def _json(self, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    main()
""".lstrip(),
        encoding="utf-8",
    )
    return stub


def _read_optional_text(path: Path) -> str:
    if not path.exists():
        return "<missing>"
    return path.read_text(encoding="utf-8")


def _wait_for_text(path: Path, text: str) -> str:
    deadline = time.time() + 15
    while time.time() <= deadline:
        content = _read_optional_text(path)
        if text in content:
            return content
        time.sleep(0.1)
    raise AssertionError(
        "\n".join(
            [
                f"Timed out waiting for {path} to contain {text!r}.",
                f"current content:\n{_read_optional_text(path)}",
            ],
        ),
    )


def _electron_executable(repo_root: Path) -> Path:
    electron_root = (
        repo_root / "frontend" / "app" / "node_modules" / "electron" / "dist"
    )
    if sys.platform.startswith("win"):
        return electron_root / "electron.exe"
    if sys.platform == "darwin":
        return electron_root / "Electron.app" / "Contents" / "MacOS" / "Electron"
    return electron_root / "electron"


def _launch_electron(
    repo_root: Path,
    electron: Path,
    backend_url: str | None,
    *,
    extra_env: dict[str, str] | None = None,
    startup_timeout_ms: int = 4_000,
    test_mode: bool = False,
) -> tuple[subprocess.Popen[str], int]:
    frontend_app = repo_root / "frontend" / "app"
    main_script = frontend_app / "dist-desktop" / "desktop" / "main.js"
    assert main_script.exists(), "Run npm run desktop:build before desktop smoke tests."
    debug_port = _available_port()
    user_data_dir = (
        repo_root / ".tmp" / "frontend-v2-desktop" / f"user-data-{debug_port}"
    )
    user_data_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(
        {
            "AGENT_TEAMS_BACKEND_HEALTH_POLL_MS": "100",
            "AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS": str(startup_timeout_ms),
        }
    )
    if backend_url is not None:
        env["AGENT_TEAMS_BACKEND_URL"] = backend_url
    if test_mode:
        env["AGENT_TEAMS_DESKTOP_TEST_MODE"] = "1"
    if extra_env is not None:
        env.update(extra_env)
    process = subprocess.Popen(
        [
            str(electron),
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={user_data_dir}",
            str(main_script),
        ],
        cwd=frontend_app,
        env=env,
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    _wait_for_cdp(debug_port, process)
    return process, debug_port


def _available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        _, port = cast(tuple[str, int], sock.getsockname())
        return port


def _available_browser_safe_port() -> int:
    server = create_browser_safe_http_server(SimpleHTTPRequestHandler)
    try:
        _, port = cast(tuple[str, int], server.server_address)
        return port
    finally:
        server.server_close()


def _is_backend_healthy(base_url: str) -> bool:
    try:
        with urlopen(f"{base_url}/api/health", timeout=0.5) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def _wait_for_backend_down(base_url: str) -> None:
    deadline = time.time() + 10
    while time.time() <= deadline:
        if not _is_backend_healthy(base_url):
            return
        time.sleep(0.1)
    raise AssertionError(f"Managed backend was still healthy at {base_url}.")


def _wait_for_cdp(port: int, process: subprocess.Popen[str]) -> None:
    deadline = time.time() + 12
    while time.time() <= deadline:
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=1)
            raise AssertionError(
                f"Electron exited before CDP was ready.\nstdout:\n{stdout}\nstderr:\n{stderr}",
            )
        try:
            with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=0.5):
                return
        except URLError:
            time.sleep(0.1)
    raise AssertionError(f"Electron CDP endpoint did not open on port {port}.")


@contextmanager
def _connect_to_electron_page(port: int) -> Iterator[Page]:
    websocket_url = _cdp_websocket_url(port)
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(websocket_url)
        try:
            yield _first_page(browser)
        finally:
            try:
                browser.close()
            except Exception:
                pass


def _cdp_websocket_url(port: int) -> str:
    with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1) as response:
        payload = cast(dict[str, object], json.loads(response.read().decode("utf-8")))
    websocket_url = payload.get("webSocketDebuggerUrl")
    if not isinstance(websocket_url, str):
        raise AssertionError(
            "Electron CDP version endpoint did not expose a websocket URL."
        )
    return websocket_url


def _capture_page_diagnostics(page: Page) -> list[str]:
    diagnostics: list[str] = []
    page.on(
        "console",
        lambda message: diagnostics.append(f"console:{message.type}:{message.text}"),
    )
    page.on("pageerror", lambda error: diagnostics.append(f"pageerror:{error}"))
    page.on(
        "requestfailed",
        lambda request: diagnostics.append(
            f"requestfailed:{request.method}:{request.url}:{request.failure}",
        ),
    )
    return diagnostics


def _desktop_page_diagnostics(page: Page, diagnostics: list[str]) -> str:
    body_text = page.locator("body").inner_text(timeout=1_000)
    root_html = page.locator("#root").evaluate("node => node.innerHTML")
    bootstrap_state = page.evaluate("() => document.body.dataset.bootstrapState")
    desktop_api_type = page.evaluate("() => typeof window.agentTeamsDesktop")
    return "\n".join(
        [
            "Electron renderer did not show the V2 shell.",
            f"url: {page.url}",
            f"title: {page.title()}",
            f"bootstrap: {bootstrap_state}",
            f"desktop_api: {desktop_api_type}",
            f"body:\n{body_text}",
            f"root_html:\n{root_html}",
            "events:",
            *diagnostics,
        ],
    )


def _save_desktop_screenshot(repo_root: Path, page: Page, filename: str) -> None:
    screenshot_dir = repo_root / ".tmp" / "frontend-v2-desktop"
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_dir / filename))


def _first_page(browser: Browser) -> Page:
    deadline = time.time() + 10
    while time.time() <= deadline:
        for context in browser.contexts:
            if context.pages:
                return context.pages[0]
        time.sleep(0.1)
    raise AssertionError("Electron did not expose a renderer page over CDP.")


def _stop_electron(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
