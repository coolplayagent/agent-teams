# -*- coding: utf-8 -*-
from __future__ import annotations

from pydantic import JsonValue

import json
from pathlib import Path
import subprocess
from typing import cast


def test_agents_settings_loads_preferred_agent_and_saves_updates(
    tmp_path: Path,
) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("codex_local");

document.getElementById("agent-name-input").value = "Codex Local Updated";
document.getElementById("agent-stdio-command-input").value = "codex --serve";

await document.getElementById("save-agent-btn").onclick();
await document.getElementById("test-agent-btn").onclick();

console.log(JSON.stringify({
    selectedAgentId: document.getElementById("agent-id-input").value,
    listHtml: document.getElementById("agents-list").innerHTML,
    transportValue: document.getElementById("agent-transport-input").value,
    commandValue: document.getElementById("agent-stdio-command-input").value,
    saveCalls: globalThis.__saveCalls,
    testCalls: globalThis.__testCalls,
    toasts: globalThis.__toasts,
    statusText: document.getElementById("agent-editor-status").textContent,
}));
""".strip(),
    )

    save_calls = cast(list[dict[str, JsonValue]], payload["saveCalls"])
    test_calls = cast(list[str], payload["testCalls"])
    toasts = cast(list[dict[str, JsonValue]], payload["toasts"])
    list_html = cast(str, payload["listHtml"])
    assert "settings-record-list" in list_html
    assert "settings-record" in list_html
    assert "settings-record-title" in list_html
    assert "settings-record-meta" in list_html
    assert payload["selectedAgentId"] == "codex_local"
    assert payload["transportValue"] == "stdio"
    assert payload["commandValue"] == "codex --serve"
    assert save_calls[0]["agentId"] == "codex_local"
    assert cast(dict[str, JsonValue], save_calls[0]["payload"]) == {
        "agent_id": "codex_local",
        "name": "Codex Local Updated",
        "description": "Runs Codex locally.",
        "protocol": "acp",
        "transport": {
            "transport": "stdio",
            "command": "codex --serve",
            "args": ["--serve"],
            "env": [],
        },
    }
    assert test_calls == ["codex_local"]
    assert toasts[0]["title"] == "Runtime Saved"
    assert toasts[1]["title"] == "Runtime Test Passed"
    assert payload["statusText"] == "Connected"


def test_agents_settings_delete_uses_selected_agent_id(tmp_path: Path) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("codex_local");
await document.getElementById("delete-agent-btn").onclick();

console.log(JSON.stringify({
    deleteCalls: globalThis.__deleteCalls,
    toasts: globalThis.__toasts,
}));
""".strip(),
    )

    assert payload["deleteCalls"] == ["codex_local"]
    toasts = cast(list[dict[str, JsonValue]], payload["toasts"])
    assert toasts[0]["title"] == "Runtime Deleted"


def test_agents_settings_stdio_environment_bindings_use_settings_variables(
    tmp_path: Path,
) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("codex_local");
await document.getElementById("add-agent-stdio-env-btn").onclick();
await document.getElementById("save-agent-btn").onclick();

console.log(JSON.stringify({
    envListHtml: document.getElementById("agent-stdio-env-list").innerHTML,
    saveCalls: globalThis.__saveCalls,
}));
""".strip(),
    )

    save_calls = cast(list[dict[str, JsonValue]], payload["saveCalls"])
    env_list_html = cast(str, payload["envListHtml"])
    assert "agent-binding-name-select" in env_list_html
    assert "OPENAI_API_KEY" in env_list_html
    assert "App variable" in env_list_html
    assert "agent-binding-value" not in env_list_html
    assert cast(dict[str, JsonValue], save_calls[0]["payload"]) == {
        "agent_id": "codex_local",
        "name": "Codex Local",
        "description": "Runs Codex locally.",
        "protocol": "acp",
        "transport": {
            "transport": "stdio",
            "command": "codex",
            "args": ["--serve"],
            "env": [
                {
                    "name": "OPENAI_API_KEY",
                    "value": "sk-live",
                    "secret": False,
                    "configured": False,
                }
            ],
        },
    }


def test_agents_settings_registry_transport_saves_registry_payload(
    tmp_path: Path,
) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("registry_runtime");
await document.getElementById("add-agent-registry-env-btn").onclick();
await document.getElementById("save-agent-btn").onclick();

console.log(JSON.stringify({
    registrySectionDisplay: document.getElementById("agent-transport-registry").style.display,
    saveCalls: globalThis.__saveCalls,
}));
""".strip(),
    )

    save_calls = cast(list[dict[str, JsonValue]], payload["saveCalls"])
    assert payload["registrySectionDisplay"] == "block"
    assert cast(dict[str, JsonValue], save_calls[0]["payload"]) == {
        "agent_id": "registry_runtime",
        "name": "Registry Runtime",
        "description": "Runs from ACP registry.",
        "protocol": "acp",
        "transport": {
            "transport": "registry",
            "registry_id": "vendor/runtime",
            "distribution": "auto",
            "registry_version": "2.0.0",
            "env": [
                {
                    "name": "OPENAI_API_KEY",
                    "value": "sk-live",
                    "secret": False,
                    "configured": False,
                }
            ],
        },
    }


def test_agents_settings_registry_save_preserves_secret_env_and_snapshot(
    tmp_path: Path,
) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("registry_secret_runtime");
await document.getElementById("save-agent-btn").onclick();

console.log(JSON.stringify({
    saveCalls: globalThis.__saveCalls,
}));
""".strip(),
    )

    save_calls = cast(list[dict[str, JsonValue]], payload["saveCalls"])
    saved_payload = cast(dict[str, JsonValue], save_calls[0]["payload"])
    saved_transport = cast(dict[str, JsonValue], saved_payload["transport"])
    assert saved_transport["env"] == [
        {
            "name": "OPENAI_API_KEY",
            "value": "",
            "secret": True,
            "configured": True,
        }
    ]
    assert cast(dict[str, JsonValue], saved_transport["registry_entry"]) == {
        "id": "vendor/runtime",
        "name": "Vendor Runtime",
        "version": "2.0.0",
        "description": "Runs from ACP registry.",
        "distribution": {
            "npx": {
                "package": "@vendor/runtime@2.0.0",
                "args": ["--stdio"],
                "env": {},
            }
        },
    }


def test_agents_settings_panel_markup_uses_i18n_keys() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_text = (
        repo_root / "frontend" / "dist" / "js" / "components" / "settings" / "index.js"
    ).read_text(encoding="utf-8")

    panel_start = source_text.index('<div class="settings-panel" id="agents-panel"')
    panel_end = source_text.index(
        '<div class="settings-panel" id="roles-panel"', panel_start
    )
    panel_html = source_text[panel_start:panel_end]

    assert 'data-i18n="settings.agents.empty"' in panel_html
    assert 'data-i18n="settings.agents.editor"' not in panel_html
    assert 'data-i18n="settings.agents.create_method_label"' in panel_html
    assert 'data-i18n="settings.agents.protocol"' in panel_html
    assert 'data-i18n="settings.agents.env_bindings"' in panel_html
    assert 'data-i18n="settings.agents.header_bindings"' in panel_html
    assert 'data-i18n="settings.agents.registry_transport"' in panel_html
    assert 'data-i18n="settings.agents.registry_source_label"' in panel_html
    assert 'id="agent-registry-source-link"' in panel_html
    assert "web-provider-link-card" in panel_html
    assert 'data-i18n-placeholder="settings.agents.id_placeholder"' in panel_html
    assert 'data-i18n-placeholder="settings.agents.command_placeholder"' in panel_html
    assert 'data-i18n="settings.agents.transport_http"' in panel_html
    assert 'data-i18n="settings.agents.transport_registry"' in panel_html
    assert 'data-i18n="settings.action.add_agent"' in source_text
    assert 'data-i18n="settings.action.add_agent_custom"' in source_text
    assert 'data-i18n="settings.action.add_agent_registry"' in source_text
    assert 'id="registry-agent-btn"' not in source_text
    assert 'data-i18n="settings.action.delete"' in source_text


def test_agents_settings_add_agent_opens_create_method_editor(tmp_path: Path) -> None:
    payload = _run_agents_settings_script(
        tmp_path=tmp_path,
        runner_source="""
import { bindAgentSettingsHandlers, loadAgentSettingsPanel } from "./agentsSettings.mjs";

installGlobals(createElements());
bindAgentSettingsHandlers();
await loadAgentSettingsPanel("codex_local");

document.getElementById("add-agent-btn").onclick();

console.log(JSON.stringify({
    methodBarDisplay: document.getElementById("agent-create-method-bar").style.display,
    editorDisplay: document.getElementById("agent-editor-panel").style.display,
    listDisplay: document.getElementById("agents-list").style.display,
    runtimeViewDisplay: document.getElementById("agent-runtime-settings-view").style.display,
    registryViewDisplay: document.getElementById("agent-registry-view").style.display,
    selectedAgentId: document.getElementById("agent-id-input").value,
}));
""".strip(),
    )

    assert payload["methodBarDisplay"] == "flex"
    assert payload["editorDisplay"] == "block"
    assert payload["listDisplay"] == "none"
    assert payload["runtimeViewDisplay"] == "block"
    assert payload["registryViewDisplay"] == "none"
    assert payload["selectedAgentId"] == ""


def _run_agents_settings_script(
    tmp_path: Path, runner_source: str
) -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "settings"
        / "agentsSettings.js"
    )

    mock_api_path = tmp_path / "mockApi.mjs"
    mock_feedback_path = tmp_path / "mockFeedback.mjs"
    mock_i18n_path = tmp_path / "mockI18n.mjs"
    mock_logger_path = tmp_path / "mockLogger.mjs"
    module_under_test_path = tmp_path / "agentsSettings.mjs"
    runner_path = tmp_path / "runner.mjs"

    mock_api_path.write_text(
        """
const agentRecords = {
    codex_local: {
        agent_id: "codex_local",
        name: "Codex Local",
        description: "Runs Codex locally.",
        protocol: "acp",
        transport: {
            transport: "stdio",
            command: "codex",
            args: ["--serve"],
            env: [],
        },
    },
    registry_runtime: {
        agent_id: "registry_runtime",
        name: "Registry Runtime",
        description: "Runs from ACP registry.",
        protocol: "acp",
        transport: {
            transport: "registry",
            registry_id: "vendor/runtime",
            distribution: "auto",
            registry_version: "2.0.0",
            env: [],
        },
    },
    registry_secret_runtime: {
        agent_id: "registry_secret_runtime",
        name: "Registry Secret Runtime",
        description: "Keeps registry secrets.",
        protocol: "acp",
        transport: {
            transport: "registry",
            registry_id: "vendor/runtime",
            distribution: "auto",
            registry_version: "2.0.0",
            env: [
                {
                    name: "OPENAI_API_KEY",
                    value: "",
                    secret: true,
                    configured: true,
                },
            ],
            registry_entry: {
                id: "vendor/runtime",
                name: "Vendor Runtime",
                version: "2.0.0",
                description: "Runs from ACP registry.",
                distribution: {
                    npx: {
                        package: "@vendor/runtime@2.0.0",
                        args: ["--stdio"],
                        env: {},
                    },
                },
            },
        },
    },
};

export async function fetchAgentRuntimes() {
    return [
        {
            agent_id: "codex_local",
            name: "Codex Local",
            description: "Runs Codex locally.",
            protocol: "acp",
            transport: "stdio",
        },
        {
            agent_id: "registry_runtime",
            name: "Registry Runtime",
            description: "Runs from ACP registry.",
            protocol: "acp",
            transport: "registry",
        },
        {
            agent_id: "registry_secret_runtime",
            name: "Registry Secret Runtime",
            description: "Keeps registry secrets.",
            protocol: "acp",
            transport: "registry",
        },
    ];
}

export async function fetchAgentRuntime(agentId) {
    return agentRecords[agentId];
}

export async function fetchEnvironmentVariables() {
    return {
        app: [
            {
                key: "OPENAI_API_KEY",
                value: "sk-live",
                scope: "app",
                value_kind: "string",
            },
            {
                key: "HTTP_PROXY",
                value: "http://hidden.proxy",
                scope: "app",
                value_kind: "string",
            },
        ],
        system: [
            {
                key: "PATH",
                value: "/usr/bin",
                scope: "system",
                value_kind: "string",
            },
        ],
    };
}

export async function saveAgentRuntime(agentId, payload) {
    globalThis.__saveCalls.push({ agentId, payload });
    agentRecords[payload.agent_id] = payload;
    return payload;
}

export async function testAgentRuntime(agentId) {
    globalThis.__testCalls.push(agentId);
    return {
        ok: true,
        message: "Connected",
    };
}

export async function startAgentRuntimeTestJob(agentId) {
    globalThis.__testCalls.push(agentId);
    return {
        job_id: "job-1",
        agent_id: agentId,
        status: "running",
        phase: "starting_process",
        message: "Starting Agent Runtime probe.",
        progress_percent: null,
    };
}

export async function fetchAgentRuntimeTestJob(jobId) {
    return {
        job_id: jobId,
        agent_id: "codex_local",
        status: "succeeded",
        phase: "completed",
        message: "Connected",
        progress_percent: 100,
        result: {
            ok: true,
            message: "Connected",
            protocol: "acp",
        },
    };
}

export async function deleteAgentRuntime(agentId) {
    globalThis.__deleteCalls.push(agentId);
    delete agentRecords[agentId];
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    mock_feedback_path.write_text(
        """
export function showToast(payload) {
    globalThis.__toasts.push(payload);
}
""".strip(),
        encoding="utf-8",
    )
    mock_i18n_path.write_text(
        """
const TRANSLATIONS = {
    "settings.roles.edit": "Edit",
    "settings.agents.saved": "Runtime Saved",
    "settings.agents.saved_message": "saved and reloaded.",
    "settings.agents.saved_status": "Saved successfully.",
    "settings.agents.save_failed": "Save Failed",
    "settings.agents.save_failed_message": "Failed to save agent runtime config.",
    "settings.agents.test_passed": "Runtime Test Passed",
    "settings.agents.test_passed_message": "Connection succeeded.",
    "settings.agents.test_passed_detail": "responded to the selected protocol probe.",
    "settings.agents.test_failed": "Runtime Test Failed",
    "settings.agents.test_failed_message": "Failed to test agent runtime config.",
    "settings.agents.deleted": "Runtime Deleted",
    "settings.agents.deleted_message": "removed from settings.",
    "settings.agents.delete_failed": "Delete Failed",
    "settings.agents.delete_failed_message": "Failed to delete agent runtime config.",
    "settings.agents.select_to_delete": "Select an agent runtime to delete.",
    "settings.agents.id_required": "Agent ID is required.",
    "settings.agents.name_required": "Agent name is required.",
    "settings.agents.http_url_required": "HTTP transport URL is required.",
    "settings.agents.custom_adapter_required": "Custom transport adapter ID is required.",
    "settings.agents.registry_id_required": "Registry ID is required.",
    "settings.agents.stdio_command_required": "Stdio command is required.",
    "settings.agents.a2a_requires_http": "A2A runtimes require Streamable HTTP transport.",
    "settings.agents.cli_requires_stdio": "CLI runtimes require Stdio transport.",
    "settings.agents.registry_requires_acp": "Registry runtimes require ACP protocol.",
    "settings.agents.custom_config": "Config JSON",
    "settings.agents.json_object_required": "must be a JSON object.",
    "settings.agents.json_invalid": "must be valid JSON.",
    "settings.agents.transport_stdio_label": "Stdio",
    "settings.agents.transport_http_label": "HTTP",
    "settings.agents.transport_custom_label": "Custom",
    "settings.agents.transport_registry_label": "Registry",
    "settings.agents.protocol_acp_label": "ACP",
    "settings.agents.protocol_a2a_label": "A2A",
    "settings.agents.protocol_cli_label": "CLI",
    "settings.agents.no_description": "No description",
    "settings.agents.none": "No agent runtimes found",
    "settings.agents.none_copy": "Add an ACP, A2A, or CLI agent runtime to make it available for role bindings.",
    "settings.agents.load_failed": "Load Failed",
    "settings.agents.load_failed_message": "Unable to load agent settings.",
    "settings.agents.no_env_options": "No environment variables available",
    "settings.agents.no_env_options_copy": "Add environment variables in Settings > Environment first.",
    "settings.agents.no_env_bindings": "No environment variables selected.",
    "settings.agents.no_headers": "No headers configured.",
    "settings.agents.select_env": "Select environment variable",
    "settings.agents.action_label": "Action",
    "settings.agents.action_remove": "Remove",
    "settings.agents.header_name": "Header",
    "settings.agents.header_value": "Value",
    "settings.agents.secret_mode": "Secret",
    "settings.agents.secret_plain": "Plain",
    "settings.agents.secret_keyring": "Keyring",
    "settings.agents.secret_configured": "Configured in keyring",
    "settings.agents.env_missing": "missing",
    "settings.agents.env_missing_note": "Missing from Settings > Environment.",
    "settings.agents.env_scope_app": "App variable",
    "settings.agents.env_scope_system": "System variable",
    "settings.agents.env_value_kind_secret": "Secret",
    "settings.agents.env_value_kind_masked": "Masked",
    "settings.agents.env_value_kind_string": "String",
};

export function t(key) {
    return TRANSLATIONS[key] || key;
}
""".strip(),
        encoding="utf-8",
    )
    mock_logger_path.write_text(
        """
export function errorToPayload(error, extra = {}) {
    return {
        error_message: String(error?.message || error || ""),
        ...extra,
    };
}

export function logError() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../../core/api.js", "./mockApi.mjs")
        .replace("../../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("../../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    runner_path.write_text(
        f"""
function createClassList(element) {{
    const classes = new Set();
    return {{
        add(token) {{
            classes.add(token);
            element.className = Array.from(classes).join(" ");
        }},
        remove(token) {{
            classes.delete(token);
            element.className = Array.from(classes).join(" ");
        }},
        toggle(token, force) {{
            const shouldAdd = force === undefined ? !classes.has(token) : Boolean(force);
            if (shouldAdd) {{
                classes.add(token);
            }} else {{
                classes.delete(token);
            }}
            element.className = Array.from(classes).join(" ");
        }},
    }};
}}

function createElement(initialDisplay = "block") {{
    let html = "";
    const element = {{
        style: {{ display: initialDisplay }},
        value: "",
        textContent: "",
        className: "",
        dataset: {{}},
        onclick: null,
        oninput: null,
        onchange: null,
        focus() {{
            return undefined;
        }},
        querySelectorAll() {{
            return [];
        }},
    }};

    Object.defineProperty(element, "innerHTML", {{
        get() {{
            return html;
        }},
        set(value) {{
            html = String(value || "");
            const selectedOption = html.match(/<option value="([^"]+)" selected>/);
            const firstOption = html.match(/<option value="([^"]+)"/);
            if (selectedOption) {{
                element.value = selectedOption[1];
            }} else if (firstOption) {{
                element.value = firstOption[1];
            }}
        }},
    }});

    element.classList = createClassList(element);
    return element;
}}

function createElements() {{
    return new Map([
        ["agent-runtime-settings-view", createElement("block")],
        ["agent-registry-view", createElement("none")],
        ["agent-create-method-bar", createElement("none")],
        ["agent-create-custom-btn", createElement("block")],
        ["agent-create-registry-btn", createElement("block")],
        ["agent-registry-create-method-bar", createElement("none")],
        ["agent-registry-create-custom-btn", createElement("block")],
        ["agent-registry-create-registry-btn", createElement("block")],
        ["agents-list", createElement("block")],
        ["agent-editor-panel", createElement("none")],
        ["agents-editor-empty", createElement("none")],
        ["agent-editor-form", createElement("none")],
        ["agent-id-input", createElement("block")],
        ["agent-name-input", createElement("block")],
        ["agent-description-input", createElement("block")],
        ["agent-protocol-input", createElement("block")],
        ["agent-transport-input", createElement("block")],
        ["agent-transport-stdio", createElement("block")],
        ["agent-transport-http", createElement("none")],
        ["agent-transport-custom", createElement("none")],
        ["agent-transport-registry", createElement("none")],
        ["agent-stdio-command-input", createElement("block")],
        ["agent-stdio-args-input", createElement("block")],
        ["agent-stdio-env-list", createElement("block")],
        ["agent-http-url-input", createElement("block")],
        ["agent-http-ssl-verify-input", createElement("block")],
        ["agent-http-header-list", createElement("block")],
        ["agent-custom-adapter-id-input", createElement("block")],
        ["agent-custom-config-input", createElement("block")],
        ["agent-registry-id-input", createElement("block")],
        ["agent-registry-distribution-input", createElement("block")],
        ["agent-registry-version-input", createElement("block")],
        ["agent-registry-env-list", createElement("block")],
        ["agent-editor-status", createElement("none")],
        ["add-agent-btn", createElement("block")],
        ["refresh-agent-registry-btn", createElement("none")],
        ["back-agents-btn", createElement("none")],
        ["save-agent-btn", createElement("block")],
        ["test-agent-btn", createElement("block")],
        ["delete-agent-btn", createElement("block")],
        ["cancel-agent-btn", createElement("block")],
        ["add-agent-stdio-env-btn", createElement("block")],
        ["add-agent-registry-env-btn", createElement("block")],
        ["add-agent-http-header-btn", createElement("block")],
    ]);
}}

function installGlobals(elements) {{
    globalThis.document = {{
        addEventListener() {{
            return undefined;
        }},
        getElementById(id) {{
            const element = elements.get(id);
            if (!element) {{
                throw new Error(`Missing element: ${{id}}`);
            }}
            return element;
        }},
    }};
    globalThis.__saveCalls = [];
    globalThis.__testCalls = [];
    globalThis.__deleteCalls = [];
    globalThis.__toasts = [];
}}

{runner_source}
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=30,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    return json.loads(completed.stdout)
