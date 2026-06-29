from __future__ import annotations

import asyncio
from collections.abc import Iterator
import json
import os
from pathlib import Path
import re
import threading
import time
from typing import cast
from uuid import uuid4

import httpx
from relay_teams.gateway.acp_stdio import AcpGatewayServer, _AcpRequestContext
from relay_teams.interfaces.cli.gateway_cli import _build_acp_stdio_runtime
from pydantic import JsonValue
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, Request, Response
from playwright.sync_api import expect
from playwright.sync_api import sync_playwright
import pytest

from integration_tests.support.environment import IntegrationEnvironment


_CONNECTED_LABEL = re.compile(r"(Backend Connected|后端已连接)")
_PROBE_SUCCESS_LABEL = re.compile(r"(Connected|连接成功)")
_GATEWAY_SIGNALS_LABEL = re.compile(r"(Gateway Signals|Gateway 信号)")
_GATEWAY_BREAKDOWN_LABEL = re.compile(r"(Gateway Breakdown|Gateway 拆解)")
_GATEWAY_CALLS_LABEL = re.compile(r"(Gateway Calls|Gateway 调用)")
_GATEWAY_FIRST_UPDATE_LABEL = re.compile(r"(Prompt First Update ms|首个更新 ms)")
_GATEWAY_LATENCY_LABEL = re.compile(r"(Gateway Latency|Gateway 时延)")
_GATEWAY_COLD_STARTS_LABEL = re.compile(r"(Gateway Cold Starts|Gateway 冷启动)")
_REMOTE_WORKSPACE_LABEL = re.compile(r"(Remote Workspace|远端工作区)")
_LANG_PATTERN = re.compile(r"^(en|en-US|zh-CN)$")
_VIEWPORT_WIDTH = 1600
_VIEWPORT_HEIGHT = 1200
_WAIT_TIMEOUT_MS = 30_000
_BURST_SESSION_FEEDBACK_TIMEOUT_MS = 5_000
_BURST_RECOVERY_REQUEST_BUDGET = 10


@pytest.fixture()
def browser_page() -> Iterator[Page]:
    browser_root = _resolve_playwright_browser_root()
    previous_browser_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_root)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT},
                color_scheme="dark",
            )
            page = context.new_page()
            try:
                yield page
            finally:
                context.close()
                browser.close()
    finally:
        if previous_browser_root is None:
            os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
        else:
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = previous_browser_root


@pytest.mark.skip(reason="Flaky on CI - timing issues with browser automation")
def test_browser_webfetch_approval_reuses_host_scoped_ticket(
    browser_page: Page,
    integration_env: IntegrationEnvironment,
    api_client: httpx.Client,
) -> None:
    page = browser_page
    _open_app(page, integration_env)

    session_id = _create_session_via_sidebar(page)
    expect(page.locator("#yolo-toggle")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    _set_checkbox(page, "#yolo-toggle", False)
    prompt = (
        "[webfetch-approval-validation] 连续两次调用同一个 host 的 webfetch，"
        "只在第一次审批。"
    )

    expect(page.locator("#prompt-input")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url == f"{integration_env.api_base_url}/api/runs"
        )
    ) as run_request_info:
        page.locator("#prompt-input").fill(prompt)
        page.locator("#send-btn").click()

    run_request_payload = json.loads(run_request_info.value.post_data or "{}")
    assert run_request_payload["session_id"] == session_id
    assert run_request_payload["yolo"] is False
    assert run_request_payload["input"] == [{"kind": "text", "text": prompt}]

    run_id = _wait_for_run_id(api_client, session_id)

    approvals = _wait_for_open_tool_approvals(
        api_client,
        run_id=run_id,
        expected_count=1,
    )
    assert approvals[0]["tool_call_id"] == "call-webfetch-1"
    assert approvals[0]["tool_name"] == "webfetch"
    assert "https://localhost/one" in approvals[0]["args_preview"]

    approval_items = page.locator(".recovery-approval-card")
    expect(approval_items).to_have_count(1, timeout=_WAIT_TIMEOUT_MS)
    expect(page.locator("#recovery-approval-host")).to_be_visible(
        timeout=_WAIT_TIMEOUT_MS
    )

    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url
            == (
                f"{integration_env.api_base_url}/api/runs/{run_id}/tool-approvals/"
                "call-webfetch-1/resolve"
            )
        )
    ) as resolve_request_info:
        page.locator('[data-approval-action="approve"]').click()

    resolve_payload = json.loads(resolve_request_info.value.post_data or "{}")
    assert resolve_payload == {"action": "approve", "feedback": ""}

    round_section = page.locator(f'.session-round-section[data-run-id="{run_id}"]')
    expect(round_section).to_contain_text(prompt, timeout=_WAIT_TIMEOUT_MS)
    expect(round_section).to_contain_text(
        "[fake-llm] Webfetch approval validation completed after one "
        "host-scoped approval.",
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(approval_items).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)

    remaining_approvals = _wait_for_open_tool_approvals(
        api_client,
        run_id=run_id,
        expected_count=0,
    )
    assert remaining_approvals == []
    expect(page.locator("#send-btn")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    expect(page.locator("#stop-btn")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)


def test_browser_shell_settings_and_session_management(
    browser_page: Page,
    integration_env: IntegrationEnvironment,
) -> None:
    page = browser_page
    _emit_gateway_observability_probe()
    _open_app(page, integration_env)

    baseline_session_ids = _wait_for_session_ids_snapshot(page)
    session_id = _create_session_via_sidebar(page)
    renamed_title = "Browser Smoke Session"

    with page.expect_request(
        lambda request: (
            request.method == "PATCH"
            and request.url
            == f"{integration_env.api_base_url}/api/sessions/{session_id}"
        )
    ):
        page.locator(f'.session-item[data-session-id="{session_id}"]').hover()
        rename_button = page.locator(
            f'.session-rename-btn[data-session-id="{session_id}"]'
        )
        expect(rename_button).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        rename_button.click()
        expect(page.locator(".feedback-dialog-input")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        page.locator(".feedback-dialog-input").fill(renamed_title)
        page.locator("[data-feedback-confirm]").click()

    expect(
        page.locator(
            f'.session-item[data-session-id="{session_id}"] .session-label-text'
        )
    ).to_have_text(renamed_title, timeout=_WAIT_TIMEOUT_MS)

    initial_lang = _html_lang(page)
    with page.expect_request(
        lambda request: (
            request.method == "PUT"
            and request.url
            == f"{integration_env.api_base_url}/api/system/configs/ui-language"
        )
    ) as language_request_info:
        page.locator("#language-toggle-btn").evaluate("(button) => button.click()")
    language_payload = json.loads(language_request_info.value.post_data or "{}")
    page.wait_for_function(
        "expectedLang => document.documentElement.lang !== expectedLang",
        arg=initial_lang,
        timeout=_WAIT_TIMEOUT_MS,
    )
    toggled_lang = _html_lang(page)
    assert toggled_lang != initial_lang
    assert _LANG_PATTERN.fullmatch(toggled_lang) is not None
    assert language_payload["language"] == toggled_lang

    with page.expect_request(
        lambda request: (
            request.method == "PUT"
            and request.url
            == f"{integration_env.api_base_url}/api/system/configs/ui-language"
        )
    ):
        page.locator("#language-toggle-btn").click()
    page.wait_for_function(
        "expectedLang => document.documentElement.lang === expectedLang",
        arg=initial_lang,
        timeout=_WAIT_TIMEOUT_MS,
    )
    initial_background = _body_background(page)
    page.locator("#toggle-theme").click()
    page.wait_for_function(
        "expectedColor => getComputedStyle(document.body).backgroundColor !== expectedColor",
        arg=initial_background,
        timeout=_WAIT_TIMEOUT_MS,
    )
    toggled_background = _body_background(page)
    assert toggled_background != initial_background

    page.locator("#settings-btn").click()
    expect(page.locator("#settings-modal")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    for tab_name in (
        "appearance",
        "general",
        "model",
        "mcp",
        "agents",
        "roles",
        "orchestration",
        "web",
        "proxy",
        "environment",
    ):
        page.locator(f'.settings-tab[data-tab="{tab_name}"]').click()
        expect(page.locator(f"#{tab_name}-panel")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
    expect(page.locator('.settings-tab[data-tab="skills"]')).to_have_count(0)
    expect(page.locator('.settings-tab[data-tab="triggers"]')).to_have_count(0)

    page.locator('.settings-tab[data-tab="model"]').click()
    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url
            == f"{integration_env.api_base_url}/api/system/configs/model:probe"
        )
    ):
        page.locator(".profile-card-test-btn").first.click()
    expect(page.locator(".profile-card-probe-status").first).to_contain_text(
        _PROBE_SUCCESS_LABEL,
        timeout=_WAIT_TIMEOUT_MS,
    )

    page.locator("#settings-close").click()
    expect(page.locator("#settings-modal")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)

    page.locator('.home-feature-item[data-feature-id="skills"]').click()
    expect(page.locator("#project-view")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    expect(
        page.locator(".project-view-toolbar-actions [data-project-view-reload]")
    ).to_have_count(
        0,
        timeout=_WAIT_TIMEOUT_MS,
    )

    feishu_name = f"feishu-main-{uuid4().hex[:6]}"
    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url
            == f"{integration_env.api_base_url}/api/gateway/feishu/accounts"
        )
    ) as create_feishu_request_info:
        page.locator('.home-feature-item[data-feature-id="gateway"]').click()
        _open_connector_create_flow(page, "feishu")
        expect(page.locator("#feishu-trigger-name-input")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        page.locator("#feishu-trigger-name-input").fill(feishu_name)
        page.locator("#feishu-display-name-input").fill("Feishu Main")
        page.locator("#feishu-app-name-input").fill("Agent Teams Bot")
        page.locator("#feishu-app-id-input").fill("cli_test")
        page.locator("#feishu-app-secret-input").fill("secret_test")
        page.locator("[data-feature-feishu-save]").click()
    create_feishu_payload = json.loads(
        create_feishu_request_info.value.post_data or "{}"
    )
    assert create_feishu_payload["name"] == feishu_name
    assert create_feishu_payload["source_config"]["provider"] == "feishu"
    assert create_feishu_payload["source_config"]["app_id"] == "cli_test"
    expect(page.locator("#feishu-trigger-name-input")).to_have_count(
        0,
        timeout=_WAIT_TIMEOUT_MS,
    )

    page.locator("#settings-btn").click()
    expect(page.locator("#settings-modal")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    page.locator('.settings-tab[data-tab="mcp"]').click()
    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url
            == f"{integration_env.api_base_url}/api/system/configs/mcp:reload"
        )
    ):
        page.locator("#reload-mcp-btn").click()

    page.locator("#settings-close").click()
    expect(page.locator("#settings-modal")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)
    page.locator(f'.session-item[data-session-id="{session_id}"]').click()
    expect(page.locator("#project-view")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)

    with page.expect_request(
        lambda request: (
            request.method == "GET"
            and request.url.startswith(
                f"{integration_env.api_base_url}/api/observability/overview"
            )
            and "scope=session" in request.url
        )
    ):
        page.locator("#observability-btn").click()
    expect(page.locator("#observability-view")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)

    with page.expect_request(
        lambda request: (
            request.method == "GET"
            and request.url.startswith(
                f"{integration_env.api_base_url}/api/observability/overview"
            )
            and "scope=global" in request.url
        )
    ):
        page.locator("#observability-global-btn").click()

    gateway_signals = page.locator('[data-observability-section="gateway-signals"]')
    expect(gateway_signals).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    expect(gateway_signals).to_contain_text(
        _GATEWAY_SIGNALS_LABEL,
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(page.locator('[data-observability-metric="gateway_calls"]')).to_contain_text(
        _GATEWAY_CALLS_LABEL, timeout=_WAIT_TIMEOUT_MS
    )
    expect(page.locator('[data-observability-metric="gateway_calls"]')).to_contain_text(
        "3", timeout=_WAIT_TIMEOUT_MS
    )
    expect(
        page.locator('[data-observability-metric="gateway_prompt_avg_first_update_ms"]')
    ).to_contain_text(_GATEWAY_FIRST_UPDATE_LABEL, timeout=_WAIT_TIMEOUT_MS)

    gateway_breakdowns = page.locator(
        '[data-observability-section="gateway-breakdowns"]'
    )
    expect(gateway_breakdowns).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    expect(gateway_breakdowns).to_contain_text(
        _GATEWAY_BREAKDOWN_LABEL,
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(
        page.locator('[data-observability-chart="gateway-breakdown-calls"]')
    ).to_contain_text(_GATEWAY_CALLS_LABEL, timeout=_WAIT_TIMEOUT_MS)
    expect(
        page.locator('[data-observability-chart="gateway-breakdown-duration"]')
    ).to_contain_text(_GATEWAY_LATENCY_LABEL, timeout=_WAIT_TIMEOUT_MS)
    expect(
        page.locator('[data-observability-chart="gateway-breakdown-cold-starts"]')
    ).to_contain_text(_GATEWAY_COLD_STARTS_LABEL, timeout=_WAIT_TIMEOUT_MS)

    page.locator("#observability-back-btn").click()
    expect(page.locator("#observability-view")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)

    with page.expect_request(
        lambda request: (
            request.method == "DELETE"
            and request.url
            == f"{integration_env.api_base_url}/api/sessions/{session_id}"
        )
    ):
        page.locator(f'.session-delete-btn[data-session-id="{session_id}"]').click(
            force=True
        )
        expect(page.locator('[role="alertdialog"]')).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        page.locator("[data-feedback-confirm]").click()

    expect(
        page.locator(f'.session-item[data-session-id="{session_id}"]')
    ).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
    assert _wait_for_session_ids_snapshot(page) == baseline_session_ids


def test_browser_gateway_xiaoluban_and_automation_binding_flow(
    browser_page: Page,
    integration_env: IntegrationEnvironment,
) -> None:
    page = browser_page
    _open_app(page, integration_env)

    xiaoluban_token = "uidself_1234567890abcdef1234567890abcdef"
    with page.expect_response(
        lambda response: (
            response.request.method == "POST"
            and response.url
            == f"{integration_env.api_base_url}/api/gateway/xiaoluban/accounts"
        )
    ) as create_xiaoluban_response_info:
        page.locator('.home-feature-item[data-feature-id="gateway"]').click()
        expect(page.locator("#project-view")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        _open_connector_create_flow(page, "xiaoluban")
        expect(page.locator('[role="alertdialog"]')).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        expect(page.locator('[data-feedback-form-input="display_name"]')).to_have_value(
            re.compile(r"(Xiaoluban|小鲁班)"),
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(page.locator('[data-feedback-form-input="base_url"]')).to_have_count(0)
        expect(page.locator('[data-feedback-form-input="enabled"]')).to_have_count(0)
        page.locator('[data-feedback-form-input="token"]').fill(xiaoluban_token)
        page.locator("[data-feedback-confirm]").click()
    create_xiaoluban_response = create_xiaoluban_response_info.value
    assert create_xiaoluban_response.ok
    create_xiaoluban_payload = json.loads(
        create_xiaoluban_response.request.post_data or "{}"
    )
    assert create_xiaoluban_payload["display_name"] in {"Xiaoluban", "小鲁班"}
    assert create_xiaoluban_payload["token"] == xiaoluban_token
    assert "base_url" not in create_xiaoluban_payload
    assert "enabled" not in create_xiaoluban_payload
    created_account = create_xiaoluban_response.json()
    assert str(created_account.get("display_name") or "") in {"Xiaoluban", "小鲁班"}
    assert str(created_account.get("derived_uid") or "") == "uidself"
    expect(page.locator("#project-view-content")).to_contain_text(
        re.compile(r"(Xiaoluban|小鲁班)"),
        timeout=_WAIT_TIMEOUT_MS,
    )
    account_id = str(created_account["account_id"])

    automation_name = f"Browser Xiaoluban Automation {uuid4().hex[:6]}"
    with page.expect_request(
        lambda request: (
            request.method == "POST"
            and request.url == f"{integration_env.api_base_url}/api/automation/projects"
        )
    ) as create_automation_request_info:
        page.locator('.home-feature-item[data-feature-id="automation"]').click()
        expect(page.locator("#project-view")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
        page.locator("#project-view-content [data-feature-automation-create]").click()
        expect(page.locator("#automation-editor-display-name-input")).to_be_visible(
            timeout=_WAIT_TIMEOUT_MS
        )
        page.locator("#automation-editor-display-name-input").fill(automation_name)
        page.locator("#automation-editor-workspace-id-input").select_option("default")
        page.locator("#automation-editor-prompt-input").fill(
            "Send the Xiaoluban automation summary."
        )
        page.locator("#automation-editor-schedule-kind-input").select_option("weekdays")
        page.locator("#automation-editor-time-input").fill("10:15")
        page.locator("#automation-editor-delivery-binding-input").select_option(
            f"xiaoluban::{account_id}"
        )
        page.locator("#automation-editor-delivery-started-input").uncheck()
        page.locator("#automation-editor-delivery-completed-input").check()
        page.locator("#automation-editor-delivery-failed-input").uncheck()
        page.locator("[data-automation-editor-save]").click()
    create_automation_payload = json.loads(
        create_automation_request_info.value.post_data or "{}"
    )
    assert create_automation_payload["delivery_binding"] == {
        "provider": "xiaoluban",
        "account_id": account_id,
        "display_name": str(created_account["display_name"]),
        "derived_uid": "uidself",
        "source_label": "发送给自己（uidself）",
    }
    assert create_automation_payload["delivery_events"] == ["completed"]
    expect(page.locator(".automation-document-main")).to_contain_text(
        automation_name,
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(page.locator(".automation-detail-sidebar")).to_contain_text(
        re.compile(r"(Xiaoluban|小鲁班)"),
        timeout=_WAIT_TIMEOUT_MS,
    )


def _open_app(page: Page, integration_env: IntegrationEnvironment) -> None:
    page.goto(integration_env.api_base_url, wait_until="domcontentloaded")
    expect(page.locator("#backend-status-label")).to_contain_text(
        _CONNECTED_LABEL,
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(page.locator("#projects-list")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def _open_connector_create_flow(page: Page, provider: str) -> None:
    connector_action = page.locator(
        f'.connectors-card[data-connector-card="{provider}"] '
        f'[data-connector-open="{provider}"]'
    )
    expect(connector_action).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    connector_action.click()
    modal_connect = page.locator(f'[data-connector-configure="{provider}"]')
    try:
        expect(modal_connect).to_be_visible(timeout=1000)
    except (AssertionError, PlaywrightError):
        return
    modal_connect.click()


def _click_visible_session_item(page: Page, session_id: str) -> None:
    deadline = time.monotonic() + (_WAIT_TIMEOUT_MS / 1000)
    last_error: AssertionError | PlaywrightError | None = None
    selector = f'.session-item[data-session-id="{session_id}"]'
    while time.monotonic() < deadline:
        session_item = page.locator(selector).filter(visible=True).first
        try:
            expect(session_item).to_be_visible(timeout=500)
            session_item.scroll_into_view_if_needed(timeout=500)
            session_item.click(force=True, timeout=500)
            return
        except (AssertionError, PlaywrightError) as exc:
            last_error = exc
            page.wait_for_timeout(100)
    raise AssertionError(
        f"Timed out clicking visible session item: {session_id}"
    ) from last_error


def _assert_subagent_child_view(
    page: Page,
    session_id: str,
    instance_id: str,
) -> None:
    expect(page.locator(".subagent-session-view")).to_be_visible(
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(page.locator(".chat-container")).to_have_class(
        re.compile(r"\bis-subagent-session-active\b"),
        timeout=_WAIT_TIMEOUT_MS,
    )
    expect(page.locator(".subagent-main-session-loading")).to_have_count(
        0,
        timeout=1200,
    )
    expect(page.locator(".session-round-section")).to_have_count(
        0,
        timeout=1200,
    )
    child = page.locator(
        f'.session-subagent-item[data-session-id="{session_id}"]'
        f'[data-subagent-instance-id="{instance_id}"]'
    ).first
    expect(child).to_have_class(re.compile(r"\bactive\b"), timeout=_WAIT_TIMEOUT_MS)
    expect(page.locator("#input-container")).to_be_hidden(timeout=_WAIT_TIMEOUT_MS)


def _api_path(integration_env: IntegrationEnvironment, url: str) -> str:
    return str(url).removeprefix(integration_env.api_base_url)


def _open_web_settings_panel(
    page: Page, integration_env: IntegrationEnvironment
) -> None:
    settings_btn = page.locator("#settings-btn")
    expect(settings_btn).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    page.wait_for_function(
        "() => typeof document.getElementById('settings-btn')?.onclick === 'function'",
        timeout=_WAIT_TIMEOUT_MS,
    )
    settings_btn.click()
    expect(page.locator("#settings-modal")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)
    with page.expect_response(
        lambda response: (
            response.request.method == "GET"
            and response.url == f"{integration_env.api_base_url}/api/system/configs/web"
            and response.ok
        )
    ):
        page.locator('.settings-tab[data-tab="web"]').click()
    expect(page.locator("#web-panel")).to_be_visible(timeout=_WAIT_TIMEOUT_MS)


def _is_web_config_put_request(
    request: Request, integration_env: IntegrationEnvironment
) -> bool:
    return (
        request.method == "PUT"
        and request.url == f"{integration_env.api_base_url}/api/system/configs/web"
    )


def _is_web_config_put_response(
    response: Response, integration_env: IntegrationEnvironment
) -> bool:
    return (
        response.request.method == "PUT"
        and response.url == f"{integration_env.api_base_url}/api/system/configs/web"
        and response.ok
    )


def _create_session_via_sidebar(page: Page) -> str:
    existing_session_ids = set(_session_ids(page))
    expect(
        page.locator(
            ".chat-container.is-session-switch-pending, .chat-container.is-session-switching"
        )
    ).to_have_count(0, timeout=_WAIT_TIMEOUT_MS)
    first_project_row = page.locator(".project-row").first
    first_project_row.hover()
    expect(page.locator(".project-new-session-btn").first).to_be_visible(
        timeout=_WAIT_TIMEOUT_MS
    )
    page.locator(".project-new-session-btn").first.click()
    expect(page.locator(".new-session-draft-page")).to_be_visible(
        timeout=_WAIT_TIMEOUT_MS
    )

    workspace_id = _first_workspace_id(page)
    response = page.request.post(
        f"{page.url.rstrip('/')}/api/sessions",
        data=json.dumps({"workspace_id": workspace_id}),
        headers={"Content-Type": "application/json"},
        timeout=_WAIT_TIMEOUT_MS,
    )
    assert response.ok
    response_payload = cast(JsonValue, response.json())
    session_id = (
        str(response_payload.get("session_id") or "").strip()
        if isinstance(response_payload, dict)
        else ""
    )
    if not session_id:
        session_id = _wait_for_new_session_id(page, existing_session_ids)
    else:
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("#backend-status-label")).to_contain_text(
            _CONNECTED_LABEL,
            timeout=_WAIT_TIMEOUT_MS,
        )
        expect(
            page.locator(f'.session-item[data-session-id="{session_id}"]')
        ).to_have_count(1, timeout=_WAIT_TIMEOUT_MS)
    page.locator(f'.session-item[data-session-id="{session_id}"]').click(force=True)
    expect(page.locator(".session-item.active")).to_have_attribute(
        "data-session-id",
        session_id,
        timeout=_WAIT_TIMEOUT_MS,
    )
    return session_id


def _first_workspace_id(page: Page) -> str:
    response = page.request.get(
        f"{page.url.rstrip('/')}/api/workspaces?limit=50",
        timeout=_WAIT_TIMEOUT_MS,
    )
    assert response.ok
    payload = cast(JsonValue, response.json())
    if isinstance(payload, dict):
        items = payload.get("items")
    else:
        items = payload
    if not isinstance(items, list):
        raise AssertionError("Workspace list response did not include an item array.")
    for item in items:
        if not isinstance(item, dict):
            continue
        workspace_id = str(item.get("workspace_id") or "").strip()
        if workspace_id:
            return workspace_id
    raise AssertionError("No workspace was available for browser session creation.")


def _wait_for_new_session_id(page: Page, existing_session_ids: set[str]) -> str:
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        current_session_ids = _session_ids(page)
        new_session_ids = [
            session_id
            for session_id in current_session_ids
            if session_id not in existing_session_ids
        ]
        if len(new_session_ids) == 1:
            return new_session_ids[0]
        page.wait_for_timeout(200)
    raise AssertionError("Timed out waiting for a new session to appear in the UI.")


def _wait_for_session_ids_snapshot(
    page: Page, *, timeout_seconds: float = 15.0
) -> set[str]:
    deadline = time.monotonic() + timeout_seconds
    previous_snapshot: set[str] | None = None
    stable_count = 0
    while time.monotonic() < deadline:
        current_snapshot = set(_session_ids(page))
        if current_snapshot == previous_snapshot:
            stable_count += 1
            if stable_count >= 2:
                return current_snapshot
        else:
            previous_snapshot = current_snapshot
            stable_count = 0
        page.wait_for_timeout(200)
    raise AssertionError("Timed out waiting for the session list to stabilize.")


def _wait_for_open_tool_approvals(
    client: httpx.Client,
    *,
    run_id: str,
    expected_count: int,
    timeout_seconds: float = 15.0,
) -> list[dict[str, str]]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        response = client.get(f"/api/runs/{run_id}/tool-approvals")
        response.raise_for_status()
        approvals = response.json()
        if not isinstance(approvals, list):
            raise AssertionError(f"Invalid tool approvals response: {approvals}")
        if len(approvals) == expected_count:
            return approvals
        time.sleep(0.2)
    raise AssertionError(
        f"Timed out waiting for {expected_count} tool approvals for run {run_id}."
    )


def _wait_for_run_id(
    client: httpx.Client,
    session_id: str,
    *,
    timeout_seconds: float = 30.0,
) -> str:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        response = client.get(f"/api/sessions/{session_id}/rounds")
        response.raise_for_status()
        rounds = response.json()
        items = rounds.get("items", [])
        if items:
            last_item = items[-1]
            run_id = last_item.get("run_id")
            if run_id:
                return str(run_id)
        time.sleep(0.3)
    raise AssertionError(f"Timed out waiting for run ID for session {session_id}.")


def _set_checkbox(page: Page, selector: str, checked: bool) -> None:
    page.locator(selector).evaluate(
        """(input, nextChecked) => {
            input.checked = nextChecked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        checked,
    )


def _session_ids(page: Page) -> list[str]:
    raw_session_ids = page.locator(".session-item").evaluate_all(
        "elements => elements.map(element => element.getAttribute('data-session-id') || '')"
    )
    return [
        str(session_id).strip()
        for session_id in raw_session_ids
        if str(session_id).strip()
    ]


def _html_lang(page: Page) -> str:
    return str(
        page.locator("html").evaluate("element => element.getAttribute('lang') || ''")
    ).strip()


def _body_background(page: Page) -> str:
    return str(
        page.locator("body").evaluate(
            "element => getComputedStyle(element).backgroundColor"
        )
    ).strip()


def _project_card(page: Page, label: str, *, automation: bool = False):
    selector = (
        ".automation-project-card"
        if automation
        else ".project-card:not(.automation-project-card)"
    )
    return page.locator(selector).filter(has_text=label).first


def _emit_gateway_observability_probe() -> None:
    previous_computer_runtime = os.environ.get("AGENT_TEAMS_COMPUTER_RUNTIME")
    os.environ["AGENT_TEAMS_COMPUTER_RUNTIME"] = "fake"
    try:
        failure: list[BaseException] = []

        def runner() -> None:
            try:
                runtime = _build_acp_stdio_runtime()
                server = cast(AcpGatewayServer, getattr(runtime, "_server"))

                async def discard_notify(_message: dict[str, JsonValue]) -> None:
                    return None

                server.set_notify(discard_notify)
                asyncio.run(
                    asyncio.wait_for(_run_gateway_observability_probe(server), 30.0)
                )
            except BaseException as exc:  # pragma: no cover - re-raised below
                failure.append(exc)

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()
        thread.join(timeout=35.0)
        if thread.is_alive():
            raise AssertionError(
                "Timed out while emitting gateway observability probe."
            )
        if failure:
            raise failure[0]
    finally:
        if previous_computer_runtime is None:
            os.environ.pop("AGENT_TEAMS_COMPUTER_RUNTIME", None)
        else:
            os.environ["AGENT_TEAMS_COMPUTER_RUNTIME"] = previous_computer_runtime


async def _run_gateway_observability_probe(server: AcpGatewayServer) -> None:
    initialize_response = await server.handle_jsonrpc_message(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": 2},
        },
        request_context=_AcpRequestContext(
            cold_start=True,
            framed_input=False,
            runtime_uptime_ms=0,
        ),
    )
    assert isinstance(initialize_response, dict)
    initialize_result = initialize_response.get("result")
    assert isinstance(initialize_result, dict)

    session_response = await server.handle_jsonrpc_message(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "session/new",
            "params": {
                "cwd": str(Path(__file__).resolve().parents[3]),
            },
        },
        request_context=_AcpRequestContext(
            cold_start=False,
            framed_input=False,
            runtime_uptime_ms=1,
        ),
    )
    assert isinstance(session_response, dict)
    session_result = session_response.get("result")
    assert isinstance(session_result, dict)
    session_id = session_result.get("sessionId")
    assert isinstance(session_id, str)
    assert session_id.strip()

    prompt_response = await server.handle_jsonrpc_message(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": [
                    {
                        "type": "text",
                        "text": "请用一句话确认 gateway observability 浏览器视图已接通。",
                    }
                ],
            },
        },
        request_context=_AcpRequestContext(
            cold_start=False,
            framed_input=False,
            runtime_uptime_ms=2,
        ),
    )
    assert isinstance(prompt_response, dict)
    prompt_result = prompt_response.get("result")
    assert isinstance(prompt_result, dict), (
        f"unexpected ACP prompt response: {prompt_response!r}"
    )
    assert prompt_result.get("runStatus") == "completed"


def _resolve_playwright_browser_root() -> Path:
    candidates: list[Path] = []

    configured_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if configured_root:
        candidates.append(Path(configured_root).expanduser())
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data).expanduser() / "ms-playwright")
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        candidates.append(
            Path(user_profile).expanduser() / "AppData" / "Local" / "ms-playwright"
        )

    try:
        import pwd

        candidates.append(
            Path(pwd.getpwuid(os.getuid()).pw_dir) / ".cache" / "ms-playwright"
        )
    except (ImportError, KeyError, OSError):
        pass

    for candidate in candidates:
        if any(candidate.glob("chromium-*")):
            return candidate

    raise AssertionError("Playwright browser cache was not found on this machine.")
