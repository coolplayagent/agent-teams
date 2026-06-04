from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_cli_tools_render_as_fixed_cards_and_hide_relay_connector() -> None:
    payload = _render_connector_cards(
        """
const connectorsResponse = {
    summary: { connected: 0, needs_config: 3, disabled: 0, error: 0, total: 3 },
    items: [
        { connector_id: 'github', provider: 'github', status: 'needs_config', account_count: 0, capabilities: [] },
        { connector_id: 'feishu', provider: 'feishu', status: 'needs_config', account_count: 0, capabilities: [] },
        { connector_id: 'relay-knowledge', provider: 'relay-knowledge', status: 'connected', account_count: 1, capabilities: ['cli_upgrade'] },
    ],
};
const runtimeToolsResponse = {
    items: [
        { tool_id: 'rg', display_name: 'ripgrep', status: 'missing', executable_name: 'rg' },
        { tool_id: 'gh', display_name: 'GitHub CLI', status: 'ready', executable_name: 'gh' },
        { tool_id: 'clawhub', display_name: 'ClawHub CLI', status: 'error', executable_name: 'clawhub', error_message: 'install failed' },
        { tool_id: 'relay-knowledge', display_name: 'Relay Knowledge CLI', status: 'ready', version: '1.0.0', target_version: '1.1.0', update_available: true, executable_name: 'relay-knowledge' },
    ],
    system_path: { supported: true, added: false, bin_dir: 'C:/bin' },
};
const pageHtml = mod.renderConnectorsCardPageMarkup({ connectorsResponse, runtimeToolsResponse });
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    assert 'data-connector-card="feishu"' in page_html
    assert 'data-connector-card="relay-knowledge"' not in page_html
    assert "data-runtime-tools-group" in page_html
    assert "CLI tools" in page_html or "CLI 工具" in page_html
    for tool_id in ("rg", "gh", "clawhub", "relay-knowledge"):
        assert f'data-runtime-tool-card="{tool_id}"' in page_html
    assert page_html.index('data-runtime-tool-card="rg"') < page_html.index(
        'data-runtime-tool-card="gh"'
    )
    assert page_html.index('data-runtime-tool-card="gh"') < page_html.index(
        'data-runtime-tool-card="clawhub"'
    )
    assert page_html.index('data-runtime-tool-card="clawhub"') < page_html.index(
        'data-runtime-tool-card="relay-knowledge"'
    )
    assert 'data-runtime-tool-download="rg"' in page_html
    assert 'data-runtime-tool-download="clawhub"' in page_html
    assert 'data-runtime-tool-download="relay-knowledge"' in page_html
    assert 'data-runtime-tool-download="gh"' not in page_html
    assert "Update" in page_html or "升级" in page_html


def test_cli_tools_cards_render_before_items_load() -> None:
    payload = _render_connector_cards(
        """
const connectorsResponse = { summary: {}, items: [] };
const pageHtml = mod.renderConnectorsCardPageMarkup({
    connectorsResponse,
    runtimeToolsResponse: null,
});
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    for tool_id in ("rg", "gh", "clawhub", "relay-knowledge"):
        assert f'data-runtime-tool-card="{tool_id}"' in page_html
    assert "Loading" in page_html or "加载中" in page_html
    assert 'data-runtime-tool-download="' not in page_html


def test_connector_cards_render_before_items_load() -> None:
    payload = _render_connector_cards(
        """
const pageHtml = mod.renderConnectorsCardPageMarkup({
    connectorsResponse: null,
    runtimeToolsResponse: null,
});
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    for provider in ("github", "w3", "discord", "feishu", "wechat", "xiaoluban"):
        assert f'data-connector-card="{provider}"' in page_html
    assert 'data-connector-card="relay-knowledge"' not in page_html
    assert "Loading" in page_html or "加载中" in page_html
    assert "No matching connectors" not in page_html
    assert "没有匹配的连接器" not in page_html


def test_connector_cards_render_load_failure_with_retry() -> None:
    payload = _render_connector_cards(
        """
const pageHtml = mod.renderConnectorsCardPageMarkup({
    connectorsError: 'Gateway unavailable',
    runtimeToolsResponse: null,
});
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    assert "data-connectors-error" in page_html
    assert "Gateway unavailable" in page_html
    assert "data-connectors-retry" in page_html
    assert 'data-connector-card="github"' not in page_html
    assert "Loading" in page_html or "加载中" in page_html


def test_cli_tools_render_load_failure_with_retry() -> None:
    payload = _render_connector_cards(
        """
const pageHtml = mod.renderConnectorsCardPageMarkup({
    runtimeToolsError: 'Runtime tools unavailable',
    runtimeToolsResponse: null,
});
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    assert "data-runtime-tools-retry" in page_html
    assert "Runtime tools unavailable" in page_html
    for tool_id in ("rg", "gh", "clawhub", "relay-knowledge"):
        assert f'data-runtime-tool-card="{tool_id}"' in page_html
    assert "Error" in page_html or "异常" in page_html
    assert 'data-runtime-tool-download="' not in page_html


def test_cli_tools_page_renders_system_environment_button() -> None:
    payload = _render_connector_cards(
        """
const runtimeToolsResponse = {
    items: [
        { tool_id: 'gh', display_name: 'GitHub CLI', status: 'ready', executable_name: 'gh' },
    ],
};
const supportedResponse = {
    ...runtimeToolsResponse,
    system_path: { supported: true, added: false, bin_dir: 'C:/bin' },
};
const addedResponse = {
    ...runtimeToolsResponse,
    system_path: { supported: true, added: true, bin_dir: 'C:/bin' },
};
const busyHtml = mod.renderConnectorsCardPageMarkup({
    runtimeToolsResponse,
    systemPathBusy: true,
    systemPathMessage: 'done',
    systemPathTone: 'success',
});
const pendingHtml = mod.renderConnectorsCardPageMarkup({ runtimeToolsResponse });
const supportedHtml = mod.renderConnectorsCardPageMarkup({ runtimeToolsResponse: supportedResponse });
const addedHtml = mod.renderConnectorsCardPageMarkup({ runtimeToolsResponse: addedResponse });
console.log(JSON.stringify({ busyHtml, pendingHtml, supportedHtml, addedHtml }));
""".strip()
    )

    busy_html = str(payload["busyHtml"])
    pending_html = str(payload["pendingHtml"])
    supported_html = str(payload["supportedHtml"])
    added_html = str(payload["addedHtml"])

    assert "data-runtime-tools-system-path-add" in busy_html
    assert "disabled" in busy_html
    assert "connectors-runtime-path-label" in busy_html
    assert "connectors-runtime-system-path-status" not in busy_html
    assert "data-runtime-tools-system-path-add disabled" in pending_html
    assert "data-runtime-tools-system-path-add disabled" not in supported_html
    assert "is-complete" in added_html
    assert (
        "Added to system environment variables" in added_html
        or "已添加到系统环境变量" in added_html
    )
    assert "connectors-runtime-system-path-status" not in added_html
    assert "data-runtime-tools-system-path-add disabled" not in added_html


def test_cli_tools_cards_hide_full_install_paths() -> None:
    payload = _render_connector_cards(
        """
const runtimeToolsResponse = {
    items: [
        {
            tool_id: 'rg',
            display_name: 'ripgrep',
            status: 'ready',
            version: '14.1.1',
            executable_name: 'rg',
            path_source: 'managed',
            path: 'C:/Users/yex/.relay-teams/bin/rg.exe',
        },
    ],
    system_path: { supported: true, added: true, bin_dir: 'C:/bin' },
};
const pageHtml = mod.renderConnectorsCardPageMarkup({ runtimeToolsResponse });
console.log(JSON.stringify({ pageHtml }));
""".strip()
    )

    page_html = str(payload["pageHtml"])

    assert "14.1.1" in page_html
    assert "Managed" in page_html or "内置" in page_html
    assert 'data-runtime-tool-copy-path="rg"' in page_html
    assert "Copy binary path" in page_html or "复制二进制路径" in page_html
    assert "C:/Users/yex/.relay-teams/bin/rg.exe" not in page_html


def test_connector_cards_share_cli_card_sizing() -> None:
    css_source = (
        Path(__file__).resolve().parents[3]
        / "frontend"
        / "dist"
        / "css"
        / "components"
        / "connectors.css"
    ).read_text(encoding="utf-8")

    assert (
        ".connectors-card-grid {\n    display: grid;\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n    gap: 14px;"
        in css_source
    )
    assert (
        ".connectors-card {\n    position: relative;\n    display: flex;\n    min-height: 136px;"
        in css_source
    )
    assert "    gap: 16px;\n    padding: 20px;" in css_source
    assert (
        ".connectors-card-action {\n    min-width: 74px;\n    height: 34px;"
        in css_source
    )


def _render_connector_cards(script_body: str) -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[3]
    module_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "connectors"
        / "connectorCards.js"
    )
    completed = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            (
                "globalThis.document = { "
                "getElementById() { return null; }, "
                "querySelector() { return null; }, "
                "querySelectorAll() { return []; }, "
                "body: null "
                "}; "
                f"const mod = await import({module_path.as_uri()!r}); "
                f"{script_body}"
            ),
        ],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Node import failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )
    payload = json.loads(completed.stdout.strip())
    if not isinstance(payload, dict):
        raise AssertionError(f"Expected object payload, got {payload!r}")
    return payload
