# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
from pathlib import Path
import subprocess

import pytest


@pytest.fixture(autouse=True)
def _write_prompt_tokens_test_module(tmp_path: Path) -> None:
    utils_dir = tmp_path / "utils"
    utils_dir.mkdir(exist_ok=True)
    source = Path("frontend/dist/js/utils/promptTokens.js").read_text(encoding="utf-8")
    (utils_dir / "promptTokens.js").write_text(source, encoding="utf-8")


def test_new_session_workspace_selector_uses_composer_menu_style() -> None:
    source = Path("frontend/dist/js/components/newSessionDraft.js").read_text(
        encoding="utf-8"
    )
    css = Path(
        "frontend/dist/css/components/new-session-draft-workspace.css"
    ).read_text(encoding="utf-8")

    assert "new-session-workspace-option-check" in source
    assert "scrollbar-width: thin;" in css
    assert ".new-session-workspace-options::-webkit-scrollbar-thumb" in css
    assert "box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);" in css


def test_new_session_workspace_selector_closes_on_outside_click() -> None:
    source = Path("frontend/dist/js/components/newSessionDraft.js").read_text(
        encoding="utf-8"
    )

    assert "bindWorkspaceOutsideClick();" in source
    assert "document.addEventListener('click', event => {" in source
    assert "if (!draftWorkspaceMenuOpen || !isNewSessionDraftActive())" in source
    assert "isDraftWorkspaceActionTarget(event.target)" in source
    assert "event.stopPropagation();" in source
    assert (
        "draftWorkspaceMenuOpen = false;\n        renderWorkspaceSelector();" in source
    )


def test_prompt_controls_toggle_mode_specific_fields_and_thinking_effort(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/app/prompt.js").read_text(encoding="utf-8")
    temp_dir = tmp_path / "prompt"
    temp_dir.mkdir()
    _write_new_session_draft_mock(tmp_path)

    (temp_dir / "prompt.js").write_text(
        source.replace("../components/rounds/timeline.js", "./mockRounds.mjs")
        .replace("../components/rounds.js", "./mockRounds.mjs")
        .replace("../components/contextIndicators.js", "./mockContextIndicators.mjs")
        .replace("../components/messageRenderer.js", "./mockMessageRenderer.mjs")
        .replace("../components/runtimeInjectQueue.js", "./mockRuntimeInjectQueue.mjs")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("./recovery.js", "./mockRecovery.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockRounds.mjs").write_text(
        """
export function appendRoundUserMessage() {
    return undefined;
}

export function createLiveRound() {
    return undefined;
}

export function showPendingRunStartPlaceholder() {
    return undefined;
}

export function clearPendingRunStartPlaceholder() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockContextIndicators.mjs").write_text(
        """
export function refreshVisibleContextIndicators() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockMessageRenderer.mjs").write_text(
        """
export function clearAllStreamState() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockApi.mjs").write_text(
        """
export async function fetchRoleConfigOptions() {
    return {
        coordinator_role_id: "Coordinator",
        main_agent_role_id: "MainAgent",
        normal_mode_roles: [
            { role_id: "MainAgent", name: "Main Agent", description: "" },
            { role_id: "writer", name: "Writer", description: "" },
        ],
    };
}

export async function fetchModelProfiles() {
    return {
        fast: { model: "gpt-4.1-mini" },
        precise: { model: "gpt-4.1" },
    };
}

export async function fetchOrchestrationConfig() {
    return {
        default_orchestration_preset_id: "preset-1",
        presets: [
            {
                preset_id: "preset-1",
                name: "Default Preset",
                description: "",
                role_ids: ["writer"],
                orchestration_prompt: "",
            },
        ],
    };
}

export async function updateSessionTopology(sessionId, payload) {
    globalThis.__topologyUpdates = [
        ...(globalThis.__topologyUpdates || []),
        { sessionId, payload },
    ];
    return {
        session_mode: payload?.session_mode || "normal",
        normal_root_role_id: payload?.normal_root_role_id || "MainAgent",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function updateSessionNormalModelProfile(sessionId, normalModelProfile) {
    globalThis.__normalModelProfileUpdates = [
        ...(globalThis.__normalModelProfileUpdates || []),
        { sessionId, normalModelProfile },
    ];
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        normal_model_profile: normalModelProfile,
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function fetchCommands() {
    globalThis.__fetchCommandsCalls = (globalThis.__fetchCommandsCalls || 0) + 1;
    if (globalThis.__commandsQueue?.length) {
        const next = globalThis.__commandsQueue.shift();
        return next();
    }
    if (globalThis.__commandsError) {
        throw globalThis.__commandsError;
    }
    return globalThis.__commandsResponse || {
        commands: [
            {
                name: "opsx-propose",
                aliases: ["opsx:propose"],
                description: "Create an OpenSpec proposal",
                argument_hint: "<change-id>",
            },
        ],
    };
}

export async function resolveCommandPrompt(payload) {
    return {
        matched: false,
        expanded_prompt: String(payload?.raw_text || ""),
    };
}

export async function searchWorkspacePaths(workspaceId, query, limit) {
    globalThis.__searchWorkspacePathCalls = [
        ...(globalThis.__searchWorkspacePathCalls || []),
        { workspaceId, query, limit },
    ];
    return globalThis.__resourceResponse || {
        workspace_id: "workspace-1",
        query: "",
        results: [],
    };
}

export async function forceQueuedInject() {
    return {
        run_id: "run-flush",
        session_id: "session-1",
        content: "queued inject",
        message_count: 1,
    };
}

export async function injectMessage() {
    return {
        status: "queued",
    };
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRuntimeInjectQueue.mjs").write_text(
        """
export function replaceRuntimeInjectMessages() {
    return undefined;
}

export function removeRuntimeInjectMessage() {
    return undefined;
}

export function upsertRuntimeInjectMessage() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRecovery.mjs").write_text(
        """
export async function hydrateSessionView() {
    return null;
}

export function startSessionContinuity() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    currentWorkspaceId: "workspace-1",
    currentSessionMode: "normal",
    currentSessionCanSwitchMode: true,
    currentNormalRootRoleId: "MainAgent",
    currentNormalModelProfile: null,
    currentOrchestrationPresetId: "preset-1",
    mainAgentRoleId: "MainAgent",
    isGenerating: false,
    thinking: {
        enabled: false,
        effort: "medium",
    },
    yolo: true,
    shellSafetyPolicyEnabled: true,
};

let normalModeRoles = [];
let coordinatorRoleOption = null;
let mainAgentRoleOption = null;

export function applyCurrentSessionRecord(record) {
    state.currentSessionMode = String(record?.session_mode || "normal");
    state.currentNormalRootRoleId = String(record?.normal_root_role_id || "");
    state.currentNormalModelProfile = String(record?.normal_model_profile || "");
    state.currentOrchestrationPresetId = String(record?.orchestration_preset_id || "");
    state.currentSessionCanSwitchMode = record?.can_switch_mode === true;
}

export function getCoordinatorRoleId() {
    return String(state.coordinatorRoleId || "");
}

export function getMainAgentRoleId() {
    return String(state.mainAgentRoleId || "");
}

export function getNormalModeRoles() {
    return normalModeRoles;
}

export function getPrimaryRoleId() {
    return String(state.mainAgentRoleId || "MainAgent");
}

export function getRoleOption(roleId) {
    if (String(roleId || "") === String(state.mainAgentRoleId || "")) {
        return mainAgentRoleOption;
    }
    return normalModeRoles.find(role => role.role_id === roleId) || null;
}

export function getRoleDisplayName(roleId, { fallback = "Agent" } = {}) {
    if (String(roleId || "") === String(state.mainAgentRoleId || "")) {
        return "Main Agent";
    }
    const match = normalModeRoles.find(role => role.role_id === roleId);
    return match?.name || fallback;
}

export function setCoordinatorRoleId(roleId) {
    state.coordinatorRoleId = String(roleId || "");
}

export function setCoordinatorRoleOption(roleOption) {
    coordinatorRoleOption = roleOption;
}

export function setMainAgentRoleId(roleId) {
    state.mainAgentRoleId = String(roleId || "");
}

export function setMainAgentRoleOption(roleOption) {
    mainAgentRoleOption = roleOption;
}

export function setNormalModeRoles(roleOptions) {
    normalModeRoles = Array.isArray(roleOptions) ? roleOptions : [];
}

export function roleSupportsInputModality(roleId, modality) {
    return String(roleId || "") !== "" && String(modality || "") === "image";
}

export function getRoleInputModalitySupport(roleId, modality) {
    return roleSupportsInputModality(roleId, modality);
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockStream.mjs").write_text(
        """
export async function startIntentStream() {
    return undefined;
}

export function attachRunStream() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockDom.mjs").write_text(
        """
function createClassList() {
    return {
        values: new Map(),
        toggle(name, active) {
            this.values.set(name, active !== false);
        },
        contains(name) {
            return this.values.get(name) === true;
        },
    };
}

function createElement(initial = {}) {
    const element = {
        _attributes: new Map(),
        _query: new Map(),
        hidden: false,
        disabled: false,
        value: "",
        innerHTML: "",
        textContent: "",
        title: "",
        checked: false,
        style: {
            display: "",
        },
        classList: createClassList(),
        _listeners: new Map(),
        setAttribute(name, value) {
            this._attributes.set(name, String(value));
        },
        getAttribute(name) {
            return this._attributes.has(name) ? this._attributes.get(name) : null;
        },
        removeAttribute(name) {
            this._attributes.delete(name);
        },
        addEventListener(type, listener) {
            this._listeners.set(type, listener);
        },
        querySelector(selector) {
            return this._query.get(selector) || null;
        },
        querySelectorAll(selector) {
            if (selector !== "[data-composer-select-option]") {
                return [];
            }
            return this._options || [];
        },
        focus() {
            globalThis.document.activeElement = this;
        },
        closest(selector) {
            if (
                selector === "[data-composer-select-option]" &&
                this.dataset?.composerSelectOption
            ) {
                return this;
            }
            return null;
        },
        contains(target) {
            return target === this;
        },
        dispatch(type, event = {}) {
            const listener = this._listeners.get(type);
            if (listener) {
                listener({
                    target: event.target || this,
                    key: event.key,
                    preventDefault() {
                        return undefined;
                    },
                    stopPropagation() {
                        return undefined;
                    },
                    ...event,
                });
            }
        },
        ...initial,
    };
    return element;
}

function createMenuTrigger(valueEl, metaEl) {
    return createElement({
        _query: new Map([
            [".composer-select-value", valueEl],
            [".composer-select-meta", metaEl],
        ]),
    });
}

function createMenuOption(kind, value, index = 0) {
    return createElement({
        dataset: {
            composerSelectOption: kind,
            value,
            index: String(index),
        },
    });
}

const normalRoleMenuValue = createElement();
const normalRoleMenuMeta = createElement();
const normalModelMenuValue = createElement();
const normalModelMenuMeta = createElement();
const normalRoleMenuButton = createMenuTrigger(normalRoleMenuValue, normalRoleMenuMeta);
const normalModelMenuButton = createMenuTrigger(normalModelMenuValue, normalModelMenuMeta);
const normalRoleMenuList = createElement({
    _options: [
        createMenuOption("normal-role", "MainAgent", 0),
        createMenuOption("normal-role", "writer", 1),
    ],
});
const normalModelMenuList = createElement({
    _options: [
        createMenuOption("normal-model", "", 0),
        createMenuOption("normal-model", "fast", 1),
        createMenuOption("normal-model", "precise", 2),
    ],
});

export const els = {
    yoloToggle: createElement({ checked: true }),
    shellSafetyPolicyToggle: createElement({ checked: true }),
    thinkingModeToggle: createElement({ checked: false }),
    thinkingEffortField: createElement({ hidden: true }),
    thinkingEffortSelect: createElement({ value: "medium", disabled: true }),
    sessionModeLock: createElement(),
    sessionModeLabel: createElement(),
    sessionModeNormalBtn: createElement(),
    sessionModeOrchestrationBtn: createElement(),
    normalRouteControls: createElement(),
    normalRoleField: createElement(),
    normalRoleSelect: createElement(),
    normalRoleMenu: createElement(),
    normalRoleMenuButton,
    normalRoleMenuValue,
    normalRoleMenuMeta,
    normalRoleMenuList,
    normalModelField: createElement(),
    normalModelSelect: createElement(),
    normalModelMenu: createElement(),
    normalModelMenuButton,
    normalModelMenuValue,
    normalModelMenuMeta,
    normalModelMenuList,
    orchestrationPresetField: createElement({ hidden: true }),
    orchestrationPresetSelect: createElement(),
    promptInput: createElement(),
    promptAttachments: createElement(),
    sendBtn: createElement(),
    stopBtn: createElement(),
};
export { createMenuOption };
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockFeedback.mjs").write_text(
        """
export function showToast() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function t(key) {
    if (key === "composer.model_role_default") {
        return "Role default";
    }
    if (key === "composer.mode_normal") {
        return "Normal Mode";
    }
    if (key === "composer.mode_orchestration") {
        return "Orchestrated Mode";
    }
    if (key === "composer.disabled.started_session") {
        return "Only sessions that have not started their first run can switch mode.";
    }
    if (key === "composer.disabled.started_session_role") {
        return "Only sessions that have not started their first run can switch role.";
    }
    return key;
}

export function formatMessage(key, values = {}) {
    return Object.entries(values).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.localStorage = {
    _values: new Map(),
    getItem(key) {
        return this._values.has(key) ? this._values.get(key) : null;
    },
    setItem(key, value) {
        this._values.set(key, String(value));
    },
};
globalThis.document = {
    activeElement: null,
    addEventListener() {
        return undefined;
    },
};

const prompt = await import("./prompt.js");
const { state } = await import("./mockState.mjs");
const { els, createMenuOption } = await import("./mockDom.mjs");

await prompt.initializeSessionTopologyControls();
prompt.initializeThinkingControls();

state.currentSessionMode = "normal";
prompt.refreshSessionTopologyControls();
    const normalModeSnapshot = {
        normalRouteHidden: els.normalRouteControls.hidden,
        normalRouteDisplay: els.normalRouteControls.style.display,
        normalRoleHidden: els.normalRoleField.hidden,
        normalRoleDisplay: els.normalRoleField.style.display,
        normalRoleMenuText: els.normalRoleMenuValue.textContent,
        normalRoleMenuOptions: els.normalRoleMenuList.innerHTML,
        normalModelHidden: els.normalModelField.hidden,
        normalModelDisplay: els.normalModelField.style.display,
        normalModelMenuText: els.normalModelMenuValue.textContent,
        normalModelMenuTitle: els.normalModelMenuButton.title,
        normalModelOptions: els.normalModelSelect.innerHTML,
        normalModelMenuOptions: els.normalModelMenuList.innerHTML,
        orchestrationPresetHidden: els.orchestrationPresetField.hidden,
        orchestrationPresetDisplay: els.orchestrationPresetField.style.display,
        sessionModeLockTitle: els.sessionModeLock.title,
        sessionModeNormalTitle: els.sessionModeNormalBtn.title,
    };

els.normalRoleMenuButton.dispatch("click");
els.normalRoleMenuList.dispatch("click", {
    target: createMenuOption("normal-role", "writer", 1),
});
await new Promise(resolve => setTimeout(resolve, 0));

els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "precise", 2),
});
await new Promise(resolve => setTimeout(resolve, 0));

state.currentSessionCanSwitchMode = false;
state.currentNormalModelProfile = "precise";
prompt.refreshSessionTopologyControls();
    const startedSessionSnapshot = {
        sessionModeLockTitle: els.sessionModeLock.title,
        sessionModeLockTitleAttr: els.sessionModeLock.getAttribute("title") || "",
        sessionModeNormalTitle: els.sessionModeNormalBtn.title,
        sessionModeNormalTitleAttr: els.sessionModeNormalBtn.getAttribute("title") || "",
        sessionModeNormalReason: els.sessionModeNormalBtn.getAttribute("data-disabled-reason") || "",
        sessionModeNormalAriaLabel: els.sessionModeNormalBtn.getAttribute("aria-label") || "",
        normalRoleDisabled: els.normalRoleMenuButton.disabled,
        normalRoleTitle: els.normalRoleMenuButton.title,
        normalRoleTitleAttr: els.normalRoleMenuButton.getAttribute("title") || "",
        normalRoleReason: els.normalRoleMenuButton.getAttribute("data-disabled-reason") || "",
        normalModelDisabled: els.normalModelMenuButton.disabled,
        normalModelMenuTitle: els.normalModelMenuButton.title,
        normalModelReason: els.normalModelMenuButton.getAttribute("data-disabled-reason") || "",
    };

state.currentSessionMode = "orchestration";
prompt.refreshSessionTopologyControls();
    const orchestrationModeSnapshot = {
        normalRouteHidden: els.normalRouteControls.hidden,
        normalRouteDisplay: els.normalRouteControls.style.display,
        normalRoleHidden: els.normalRoleField.hidden,
        normalRoleDisplay: els.normalRoleField.style.display,
        normalModelHidden: els.normalModelField.hidden,
        normalModelDisplay: els.normalModelField.style.display,
        orchestrationPresetHidden: els.orchestrationPresetField.hidden,
        orchestrationPresetDisplay: els.orchestrationPresetField.style.display,
    };

    const initialThinkingSnapshot = {
        effortHidden: els.thinkingEffortField.hidden,
        effortDisplay: els.thinkingEffortField.style.display,
        effortDisabled: els.thinkingEffortSelect.disabled,
    };

els.thinkingModeToggle.checked = true;
els.thinkingModeToggle.dispatch("change");
    const enabledThinkingSnapshot = {
        effortHidden: els.thinkingEffortField.hidden,
        effortDisplay: els.thinkingEffortField.style.display,
        effortDisabled: els.thinkingEffortSelect.disabled,
    };

els.thinkingModeToggle.checked = false;
els.thinkingModeToggle.dispatch("change");
    const disabledThinkingSnapshot = {
        effortHidden: els.thinkingEffortField.hidden,
        effortDisplay: els.thinkingEffortField.style.display,
        effortDisabled: els.thinkingEffortSelect.disabled,
    };

console.log(JSON.stringify({
    normalModeSnapshot,
    startedSessionSnapshot,
    orchestrationModeSnapshot,
    topologyUpdateCalls: globalThis.__topologyUpdates || [],
    modelUpdateCalls: globalThis.__normalModelProfileUpdates || [],
    initialThinkingSnapshot,
    enabledThinkingSnapshot,
    disabledThinkingSnapshot,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    normal_mode_snapshot = dict(payload["normalModeSnapshot"])
    normal_model_options = str(normal_mode_snapshot.pop("normalModelOptions"))
    normal_role_menu_options = str(normal_mode_snapshot.pop("normalRoleMenuOptions"))
    normal_model_menu_options = str(normal_mode_snapshot.pop("normalModelMenuOptions"))
    assert normal_mode_snapshot == {
        "normalRouteHidden": False,
        "normalRouteDisplay": "inline-flex",
        "normalRoleHidden": False,
        "normalRoleDisplay": "inline-flex",
        "normalRoleMenuText": "Main Agent",
        "normalModelHidden": False,
        "normalModelDisplay": "inline-flex",
        "normalModelMenuText": "Role default",
        "normalModelMenuTitle": "Role default",
        "orchestrationPresetHidden": True,
        "orchestrationPresetDisplay": "none",
        "sessionModeLockTitle": "",
        "sessionModeNormalTitle": "",
    }
    assert "Role default" in normal_model_options
    assert "fast" in normal_model_options
    assert "Writer" in normal_role_menu_options
    assert 'data-value="writer"' in normal_role_menu_options
    assert "precise" in normal_model_menu_options
    assert "gpt-4.1" in normal_model_menu_options
    assert payload["startedSessionSnapshot"] == {
        "sessionModeLockTitle": "",
        "sessionModeLockTitleAttr": "",
        "sessionModeNormalTitle": "",
        "sessionModeNormalTitleAttr": "",
        "sessionModeNormalReason": (
            "Only sessions that have not started their first run can switch mode."
        ),
        "sessionModeNormalAriaLabel": (
            "Normal Mode. Only sessions that have not started their first run "
            "can switch mode."
        ),
        "normalRoleDisabled": True,
        "normalRoleTitle": "",
        "normalRoleTitleAttr": "",
        "normalRoleReason": (
            "Only sessions that have not started their first run can switch role."
        ),
        "normalModelDisabled": False,
        "normalModelMenuTitle": "precise",
        "normalModelReason": "",
    }
    assert payload["topologyUpdateCalls"] == [
        {
            "sessionId": "session-1",
            "payload": {
                "session_mode": "normal",
                "normal_root_role_id": "writer",
                "orchestration_preset_id": None,
            },
        }
    ]
    assert payload["modelUpdateCalls"] == [
        {"sessionId": "session-1", "normalModelProfile": "precise"}
    ]
    assert payload["orchestrationModeSnapshot"] == {
        "normalRouteHidden": True,
        "normalRouteDisplay": "none",
        "normalRoleHidden": True,
        "normalRoleDisplay": "none",
        "normalModelHidden": True,
        "normalModelDisplay": "none",
        "orchestrationPresetHidden": False,
        "orchestrationPresetDisplay": "inline-flex",
    }
    assert payload["initialThinkingSnapshot"] == {
        "effortHidden": True,
        "effortDisplay": "none",
        "effortDisabled": True,
    }
    assert payload["enabledThinkingSnapshot"] == {
        "effortHidden": False,
        "effortDisplay": "inline-flex",
        "effortDisabled": False,
    }
    assert payload["disabledThinkingSnapshot"] == {
        "effortHidden": True,
        "effortDisplay": "none",
        "effortDisabled": True,
    }


def test_prompt_model_profile_ignores_stale_save_response(tmp_path: Path) -> None:
    source = Path("frontend/dist/js/app/prompt.js").read_text(encoding="utf-8")
    temp_dir = tmp_path / "prompt_model_stale"
    temp_dir.mkdir()
    _write_new_session_draft_mock(tmp_path)

    (temp_dir / "prompt.js").write_text(
        source.replace("../components/rounds/timeline.js", "./mockRounds.mjs")
        .replace("../components/rounds.js", "./mockRounds.mjs")
        .replace("../components/contextIndicators.js", "./mockContextIndicators.mjs")
        .replace("../components/messageRenderer.js", "./mockMessageRenderer.mjs")
        .replace("../components/runtimeInjectQueue.js", "./mockRuntimeInjectQueue.mjs")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("./recovery.js", "./mockRecovery.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockRounds.mjs").write_text(
        """
export function appendRoundUserMessage() {
    return undefined;
}

export function createLiveRound() {
    return undefined;
}

export function showPendingRunStartPlaceholder() {
    return undefined;
}

export function clearPendingRunStartPlaceholder() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockContextIndicators.mjs").write_text(
        """
export function refreshVisibleContextIndicators() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockMessageRenderer.mjs").write_text(
        """
export function clearAllStreamState() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockApi.mjs").write_text(
        """
export async function fetchRoleConfigOptions() {
    return {
        coordinator_role_id: "Coordinator",
        main_agent_role_id: "MainAgent",
        normal_mode_roles: [
            { role_id: "MainAgent", name: "Main Agent", description: "" },
        ],
    };
}

export async function fetchModelProfiles() {
    return {
        fast: { model: "gpt-4.1-mini" },
        precise: { model: "gpt-4.1" },
    };
}

export async function fetchOrchestrationConfig() {
    return {
        default_orchestration_preset_id: "preset-1",
        presets: [
            {
                preset_id: "preset-1",
                name: "Default Preset",
                description: "",
                role_ids: [],
                orchestration_prompt: "",
            },
        ],
    };
}

export async function updateSessionTopology() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function updateSessionNormalModelProfile(sessionId, normalModelProfile) {
    globalThis.__normalModelProfileUpdates = [
        ...(globalThis.__normalModelProfileUpdates || []),
        { sessionId, normalModelProfile },
    ];
    return await new Promise((resolve, reject) => {
        globalThis.__normalModelProfileResolvers = [
            ...(globalThis.__normalModelProfileResolvers || []),
            {
                normalModelProfile,
                resolve() {
                    resolve({
                        session_mode: "normal",
                        normal_root_role_id: "MainAgent",
                        normal_model_profile: normalModelProfile,
                        orchestration_preset_id: null,
                        can_switch_mode: true,
                    });
                },
                reject(error) {
                    reject(error);
                },
            },
        ];
    });
}

export async function fetchCommands() {
    return { commands: [] };
}

export async function resolveCommandPrompt(payload) {
    return {
        matched: false,
        expanded_prompt: String(payload?.raw_text || ""),
    };
}

export async function searchWorkspacePaths() {
    return { workspace_id: "workspace-1", query: "", results: [] };
}

export async function forceQueuedInject() {
    return { run_id: "run-flush", session_id: "session-1", content: "" };
}

export async function injectMessage() {
    return { status: "queued" };
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRuntimeInjectQueue.mjs").write_text(
        """
export function replaceRuntimeInjectMessages() {
    return undefined;
}

export function removeRuntimeInjectMessage() {
    return undefined;
}

export function upsertRuntimeInjectMessage() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRecovery.mjs").write_text(
        """
export async function hydrateSessionView() {
    return null;
}

export function startSessionContinuity() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    currentWorkspaceId: "workspace-1",
    currentSessionMode: "normal",
    currentSessionCanSwitchMode: true,
    currentNormalRootRoleId: "MainAgent",
    currentNormalModelProfile: null,
    currentOrchestrationPresetId: "preset-1",
    mainAgentRoleId: "MainAgent",
    isGenerating: false,
    thinking: {
        enabled: false,
        effort: "medium",
    },
};

let normalModeRoles = [];
let mainAgentRoleOption = null;

export function applyCurrentSessionRecord(record) {
    state.currentSessionMode = String(record?.session_mode || "normal");
    state.currentNormalRootRoleId = String(record?.normal_root_role_id || "");
    state.currentNormalModelProfile = String(record?.normal_model_profile || "");
    state.currentOrchestrationPresetId = String(record?.orchestration_preset_id || "");
    state.currentSessionCanSwitchMode = record?.can_switch_mode === true;
}

export function getCoordinatorRoleId() {
    return "Coordinator";
}

export function getMainAgentRoleId() {
    return String(state.mainAgentRoleId || "MainAgent");
}

export function getNormalModeRoles() {
    return normalModeRoles;
}

export function getPrimaryRoleId() {
    return String(state.mainAgentRoleId || "MainAgent");
}

export function getRoleOption(roleId) {
    if (String(roleId || "") === String(state.mainAgentRoleId || "")) {
        return mainAgentRoleOption;
    }
    return normalModeRoles.find(role => role.role_id === roleId) || null;
}

export function getRoleDisplayName(roleId, { fallback = "Agent" } = {}) {
    if (String(roleId || "") === String(state.mainAgentRoleId || "")) {
        return "Main Agent";
    }
    return normalModeRoles.find(role => role.role_id === roleId)?.name || fallback;
}

export function setCoordinatorRoleId() {
    return undefined;
}

export function setCoordinatorRoleOption() {
    return undefined;
}

export function setMainAgentRoleId(roleId) {
    state.mainAgentRoleId = String(roleId || "");
}

export function setMainAgentRoleOption(roleOption) {
    mainAgentRoleOption = roleOption;
}

export function setNormalModeRoles(roleOptions) {
    normalModeRoles = Array.isArray(roleOptions) ? roleOptions : [];
}

export function getRoleInputModalitySupport() {
    return true;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockStream.mjs").write_text(
        """
export async function startIntentStream(promptText, sessionId, onCompleted) {
    globalThis.__streamCalls = [
        ...(globalThis.__streamCalls || []),
        { promptText, sessionId },
    ];
    return onCompleted;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockDom.mjs").write_text(
        """
function createClassList() {
    return {
        values: new Map(),
        toggle(name, active) {
            this.values.set(name, active !== false);
        },
    };
}

function createElement(initial = {}) {
    const element = {
        _attributes: new Map(),
        _query: new Map(),
        hidden: false,
        disabled: false,
        value: "",
        innerHTML: "",
        textContent: "",
        title: "",
        style: { display: "" },
        classList: createClassList(),
        _listeners: new Map(),
        setAttribute(name, value) {
            this._attributes.set(name, String(value));
        },
        getAttribute(name) {
            return this._attributes.has(name) ? this._attributes.get(name) : null;
        },
        removeAttribute(name) {
            this._attributes.delete(name);
        },
        addEventListener(type, listener) {
            this._listeners.set(type, listener);
        },
        querySelector(selector) {
            return this._query.get(selector) || null;
        },
        querySelectorAll(selector) {
            if (selector !== "[data-composer-select-option]") {
                return [];
            }
            return this._options || [];
        },
        focus() {
            globalThis.document.activeElement = this;
        },
        closest(selector) {
            if (
                selector === "[data-composer-select-option]" &&
                this.dataset?.composerSelectOption
            ) {
                return this;
            }
            return null;
        },
        contains(target) {
            return target === this;
        },
        dispatch(type, event = {}) {
            const listener = this._listeners.get(type);
            if (listener) {
                listener({
                    target: event.target || this,
                    key: event.key,
                    preventDefault() {
                        return undefined;
                    },
                    stopPropagation() {
                        return undefined;
                    },
                    ...event,
                });
            }
        },
        ...initial,
    };
    return element;
}

function createMenuTrigger(valueEl, metaEl) {
    return createElement({
        _query: new Map([
            [".composer-select-value", valueEl],
            [".composer-select-meta", metaEl],
        ]),
    });
}

function createMenuOption(kind, value, index = 0) {
    return createElement({
        dataset: {
            composerSelectOption: kind,
            value,
            index: String(index),
        },
    });
}

const normalRoleMenuValue = createElement();
const normalRoleMenuMeta = createElement();
const normalModelMenuValue = createElement();
const normalModelMenuMeta = createElement();
const normalRoleMenuButton = createMenuTrigger(normalRoleMenuValue, normalRoleMenuMeta);
const normalModelMenuButton = createMenuTrigger(normalModelMenuValue, normalModelMenuMeta);
const normalModelMenuList = createElement({
    _options: [
        createMenuOption("normal-model", "", 0),
        createMenuOption("normal-model", "fast", 1),
        createMenuOption("normal-model", "precise", 2),
    ],
});

export const els = {
    yoloToggle: createElement({ checked: true }),
    thinkingModeToggle: createElement({ checked: false }),
    thinkingEffortField: createElement({ hidden: true }),
    thinkingEffortSelect: createElement({ value: "medium", disabled: true }),
    sessionModeLock: createElement(),
    sessionModeLabel: createElement(),
    sessionModeNormalBtn: createElement(),
    sessionModeOrchestrationBtn: createElement(),
    normalRouteControls: createElement(),
    normalRoleField: createElement(),
    normalRoleSelect: createElement(),
    normalRoleMenu: createElement(),
    normalRoleMenuButton,
    normalRoleMenuValue,
    normalRoleMenuMeta,
    normalRoleMenuList: createElement({
        _options: [createMenuOption("normal-role", "MainAgent", 0)],
    }),
    normalModelField: createElement(),
    normalModelSelect: createElement(),
    normalModelMenu: createElement(),
    normalModelMenuButton,
    normalModelMenuValue,
    normalModelMenuMeta,
    normalModelMenuList,
    orchestrationPresetField: createElement({ hidden: true }),
    orchestrationPresetSelect: createElement(),
    promptInput: createElement({ value: "" }),
    promptInputStatus: createElement({ hidden: true }),
    promptAttachments: createElement(),
    promptMentionMenu: createElement({ hidden: true }),
    sendBtn: createElement(),
    stopBtn: createElement(),
};
export { createMenuOption };
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockFeedback.mjs").write_text(
        """
export function showToast(payload) {
    globalThis.__toasts = [...(globalThis.__toasts || []), payload];
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function t(key) {
    if (key === "composer.model_role_default") {
        return "Role default";
    }
    if (key === "composer.mode_normal") {
        return "Normal Mode";
    }
    if (key === "composer.mode_orchestration") {
        return "Orchestrated Mode";
    }
    return key;
}

export function formatMessage(key, values = {}) {
    return `${key}:${String(values.model || "")}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockLogger.mjs").write_text(
        """
export function sysLog(message) {
    globalThis.__logs = [...(globalThis.__logs || []), message];
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.document = {
    activeElement: null,
    addEventListener() {
        return undefined;
    },
};

const prompt = await import("./prompt.js");
const { state } = await import("./mockState.mjs");
const { els, createMenuOption } = await import("./mockDom.mjs");

await prompt.initializeSessionTopologyControls();
prompt.refreshSessionTopologyControls();

els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "fast", 1),
});

els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "precise", 2),
});

globalThis.__normalModelProfileResolvers[1].resolve();
await new Promise(resolve => setTimeout(resolve, 0));
const afterLatestResponse = {
    stateProfile: state.currentNormalModelProfile,
    menuTitle: els.normalModelMenuButton.title,
    menuText: els.normalModelMenuValue.textContent,
};

globalThis.__normalModelProfileResolvers[0].resolve();
await new Promise(resolve => setTimeout(resolve, 0));
const afterStaleResponse = {
    stateProfile: state.currentNormalModelProfile,
    menuTitle: els.normalModelMenuButton.title,
    menuText: els.normalModelMenuValue.textContent,
};

els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "fast", 1),
});
els.promptInput.value = "send after failed model save";
const failedSendPromise = prompt.handleSend();
globalThis.__normalModelProfileResolvers[2].reject(new Error("profile save failed"));
await failedSendPromise;
const afterFailedSaveSend = {
    streamCalls: globalThis.__streamCalls || [],
    promptStatusText: els.promptInputStatus.textContent,
    promptStatusHidden: els.promptInputStatus.hidden,
    toasts: globalThis.__toasts || [],
};

console.log(JSON.stringify({
    updates: globalThis.__normalModelProfileUpdates || [],
    afterLatestResponse,
    afterStaleResponse,
    afterFailedSaveSend,
    logs: globalThis.__logs || [],
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["updates"] == [
        {"sessionId": "session-1", "normalModelProfile": "fast"},
        {"sessionId": "session-1", "normalModelProfile": "precise"},
        {"sessionId": "session-1", "normalModelProfile": "fast"},
    ]
    assert payload["afterLatestResponse"] == {
        "stateProfile": "precise",
        "menuTitle": "precise",
        "menuText": "precise",
    }
    assert payload["afterStaleResponse"] == {
        "stateProfile": "precise",
        "menuTitle": "precise",
        "menuText": "precise",
    }
    assert payload["afterFailedSaveSend"] == {
        "streamCalls": [],
        "promptStatusText": "profile save failed",
        "promptStatusHidden": False,
        "toasts": [
            {
                "title": "composer.toast.model_update_failed_title",
                "message": "profile save failed",
                "tone": "danger",
            }
        ],
    }
    assert payload["logs"] == [
        "composer.log.model_updated:precise",
        "profile save failed",
    ]


def test_handle_send_strips_leading_role_mention_and_targets_run_role(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/app/prompt.js").read_text(encoding="utf-8")
    temp_dir = tmp_path / "prompt_mentions"
    temp_dir.mkdir()
    _write_new_session_draft_mock(tmp_path)

    (temp_dir / "prompt.js").write_text(
        source.replace("../components/rounds/timeline.js", "./mockRounds.mjs")
        .replace("../components/rounds.js", "./mockRounds.mjs")
        .replace("../components/contextIndicators.js", "./mockContextIndicators.mjs")
        .replace("../components/messageRenderer.js", "./mockMessageRenderer.mjs")
        .replace("../components/runtimeInjectQueue.js", "./mockRuntimeInjectQueue.mjs")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("./recovery.js", "./mockRecovery.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockRounds.mjs").write_text(
        """
export function appendRoundUserMessage(runId, text) {
    globalThis.__roundMessages.push({ runId, text });
}

export function createLiveRound(runId, text, inputParts) {
    globalThis.__liveRounds.push({ runId, text, inputParts });
}

export function showPendingRunStartPlaceholder() {
    return undefined;
}

export function clearPendingRunStartPlaceholder() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockContextIndicators.mjs").write_text(
        """
export function refreshVisibleContextIndicators() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockMessageRenderer.mjs").write_text(
        """
export function clearAllStreamState() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockApi.mjs").write_text(
        """
export async function fetchRoleConfigOptions() {
    return {
        coordinator_role_id: "Coordinator",
        main_agent_role_id: "MainAgent",
        skills: globalThis.__skillsResponse || [],
        normal_mode_roles: [
            { role_id: "writer", name: "Writer", description: "Draft final responses" },
            { role_id: "reviewer", name: "Reviewer", description: "Check correctness and risk" },
        ],
    };
}

export async function fetchModelProfiles() {
    return {
        fast: { model: "gpt-4.1-mini" },
    };
}

export async function fetchOrchestrationConfig() {
    return {
        default_orchestration_preset_id: "",
        presets: [],
    };
}

export async function updateSessionTopology() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function updateSessionNormalModelProfile() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        normal_model_profile: "fast",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function fetchCommands() {
    globalThis.__fetchCommandsCalls = (globalThis.__fetchCommandsCalls || 0) + 1;
    if (globalThis.__commandsQueue?.length) {
        const next = globalThis.__commandsQueue.shift();
        return next();
    }
    if (globalThis.__commandsError) {
        throw globalThis.__commandsError;
    }
    return globalThis.__commandsResponse || {
        commands: [
            {
                name: "opsx-propose",
                aliases: ["opsx:propose"],
                description: "Create an OpenSpec proposal",
                argument_hint: "<change-id>",
            },
        ],
    };
}

export async function resolveCommandPrompt(payload) {
    return {
        matched: false,
        expanded_prompt: String(payload?.raw_text || ""),
    };
}

export async function searchWorkspacePaths(workspaceId, query, limit) {
    globalThis.__searchWorkspacePathCalls = [
        ...(globalThis.__searchWorkspacePathCalls || []),
        { workspaceId, query, limit },
    ];
    return globalThis.__resourceResponse || {
        workspace_id: "workspace-1",
        query: "",
        results: [],
    };
}

export async function forceQueuedInject() {
    return {
        run_id: "run-flush",
        session_id: "session-1",
        content: "queued inject",
        message_count: 1,
    };
}

export async function injectMessage() {
    return {
        status: "queued",
    };
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRuntimeInjectQueue.mjs").write_text(
        """
export function replaceRuntimeInjectMessages() {
    return undefined;
}

export function removeRuntimeInjectMessage() {
    return undefined;
}

export function upsertRuntimeInjectMessage() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRecovery.mjs").write_text(
        """
export async function hydrateSessionView() {
    return null;
}

export function startSessionContinuity() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    currentWorkspaceId: "workspace-1",
    currentSessionMode: "normal",
    currentSessionCanSwitchMode: true,
    currentNormalRootRoleId: "MainAgent",
    currentOrchestrationPresetId: null,
    pausedSubagent: null,
    isGenerating: false,
    yolo: true,
    shellSafetyPolicyEnabled: true,
    thinking: { enabled: false, effort: "medium" },
    instanceRoleMap: {},
    roleInstanceMap: {},
    taskInstanceMap: {},
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
    autoSwitchedSubagentInstances: {},
    activeRunId: null,
};

let coordinatorRoleId = "Coordinator";
let mainAgentRoleId = "MainAgent";
let normalModeRoles = [
    { role_id: "writer", name: "Writer", description: "Draft final responses" },
    { role_id: "reviewer", name: "Reviewer", description: "Check correctness and risk" },
];
let coordinatorRoleOption = null;
let mainAgentRoleOption = null;

export function applyCurrentSessionRecord() {
    return undefined;
}

export function getCoordinatorRoleId() {
    return coordinatorRoleId;
}

export function getMainAgentRoleId() {
    return mainAgentRoleId;
}

export function getNormalModeRoles() {
    return normalModeRoles;
}

export function getPrimaryRoleId() {
    return String(state.currentNormalRootRoleId || mainAgentRoleId);
}

export function getRoleOption(roleId) {
    if (roleId === coordinatorRoleId) return coordinatorRoleOption;
    if (roleId === mainAgentRoleId) return mainAgentRoleOption;
    return normalModeRoles.find(role => role.role_id === roleId) || null;
}

export function getRoleDisplayName(roleId, { fallback = "Agent" } = {}) {
    if (roleId === coordinatorRoleId) return "Coordinator";
    if (roleId === mainAgentRoleId) return "Main Agent";
    const match = normalModeRoles.find(role => role.role_id === roleId);
    return match?.name || fallback;
}

export function setCoordinatorRoleId(roleId) {
    coordinatorRoleId = String(roleId || "");
}

export function setCoordinatorRoleOption(roleOption) {
    coordinatorRoleOption = roleOption;
}

export function setMainAgentRoleId(roleId) {
    mainAgentRoleId = String(roleId || "");
}

export function setMainAgentRoleOption(roleOption) {
    mainAgentRoleOption = roleOption;
}

export function setNormalModeRoles(roleOptions) {
    normalModeRoles = Array.isArray(roleOptions) ? roleOptions : [];
}

export function roleSupportsInputModality(roleId, modality) {
    return String(roleId || "") !== "" && String(modality || "") === "image";
}

export function getRoleInputModalitySupport(roleId, modality) {
    return roleSupportsInputModality(roleId, modality);
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockStream.mjs").write_text(
        """
export async function startIntentStream(text, sessionId, onCompleted, options = {}) {
    globalThis.__streamCalls.push({ text, sessionId, options });
    if (typeof options.onRunCreated === "function") {
        options.onRunCreated({ run_id: "run-1", target_role_id: options.targetRoleId || null });
    }
    return onCompleted;
}

export function attachRunStream() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockDom.mjs").write_text(
        """
function createElement(initial = {}) {
    return {
        value: "",
        checked: false,
        disabled: false,
        hidden: false,
        textContent: "",
        innerHTML: "",
        title: "",
        style: { display: "", height: "" },
        classList: { toggle() { return undefined; } },
        addEventListener() { return undefined; },
        querySelectorAll() { return []; },
        focus() { return undefined; },
        ...initial,
    };
}

export const els = {
    promptInput: createElement({ value: "@Writer ship it" }),
    promptAttachments: createElement(),
    sendBtn: createElement(),
    stopBtn: createElement({ style: { display: "none" } }),
    yoloToggle: createElement({ checked: true }),
    shellSafetyPolicyToggle: createElement({ checked: true }),
    thinkingModeToggle: createElement({ checked: false }),
    thinkingEffortSelect: createElement({ value: "medium", disabled: true }),
};
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockFeedback.mjs").write_text(
        """
export function showToast() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}

export function formatMessage(key, values = {}) {
    return Object.entries(values).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockLogger.mjs").write_text(
        """
export function sysLog(message, tone = "log-info") {
    globalThis.__logs.push({ message, tone });
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { handleSend } from "./prompt.js";
import { state } from "./mockState.mjs";
import { els } from "./mockDom.mjs";

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__liveRounds = [];
globalThis.__roundMessages = [];

await handleSend();
els.promptInput.value = "＠Writer ship it";
els.promptInput.disabled = false;
state.isGenerating = false;
await handleSend();

console.log(JSON.stringify({
    streamCalls: globalThis.__streamCalls,
    liveRounds: globalThis.__liveRounds,
    roundMessages: globalThis.__roundMessages,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert [call["text"] for call in payload["streamCalls"]] == ["ship it", "ship it"]
    assert [call["sessionId"] for call in payload["streamCalls"]] == [
        "session-1",
        "session-1",
    ]
    assert [call["options"]["targetRoleId"] for call in payload["streamCalls"]] == [
        "writer",
        "writer",
    ]
    assert payload["liveRounds"] == [
        {
            "runId": "run-1",
            "text": "ship it",
            "inputParts": [{"kind": "text", "text": "ship it"}],
        },
        {
            "runId": "run-1",
            "text": "ship it",
            "inputParts": [{"kind": "text", "text": "ship it"}],
        },
    ]
    assert payload["roundMessages"] == []


def test_prompt_role_mentions_offer_autocomplete_and_insert_selection(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/app/prompt.js").read_text(encoding="utf-8")
    temp_dir = tmp_path / "prompt_autocomplete"
    temp_dir.mkdir()
    _write_new_session_draft_mock(tmp_path)

    (temp_dir / "prompt.js").write_text(
        source.replace("../components/rounds/timeline.js", "./mockRounds.mjs")
        .replace("../components/rounds.js", "./mockRounds.mjs")
        .replace("../components/contextIndicators.js", "./mockContextIndicators.mjs")
        .replace("../components/messageRenderer.js", "./mockMessageRenderer.mjs")
        .replace("../components/runtimeInjectQueue.js", "./mockRuntimeInjectQueue.mjs")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("./recovery.js", "./mockRecovery.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockRounds.mjs").write_text(
        """
export function appendRoundUserMessage() {
    return undefined;
}

export function createLiveRound() {
    return undefined;
}

export function showPendingRunStartPlaceholder() {
    return undefined;
}

export function clearPendingRunStartPlaceholder() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockContextIndicators.mjs").write_text(
        """
export function refreshVisibleContextIndicators() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockMessageRenderer.mjs").write_text(
        """
export function clearAllStreamState() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockApi.mjs").write_text(
        """
export async function fetchRoleConfigOptions() {
    return {
        coordinator_role_id: "Coordinator",
        main_agent_role_id: "MainAgent",
        skills: globalThis.__skillsResponse || [],
        normal_mode_roles: [
            { role_id: "writer", name: "Writer", description: "Draft final responses" },
            { role_id: "reviewer", name: "Reviewer", description: "Check correctness and risk" },
        ],
    };
}

export async function fetchModelProfiles() {
    return {
        fast: { model: "gpt-4.1-mini" },
    };
}

export async function fetchOrchestrationConfig() {
    return {
        default_orchestration_preset_id: "",
        presets: [],
    };
}

export async function updateSessionTopology() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function updateSessionNormalModelProfile() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        normal_model_profile: "fast",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function fetchCommands() {
    globalThis.__fetchCommandsCalls = (globalThis.__fetchCommandsCalls || 0) + 1;
    if (globalThis.__commandsQueue?.length) {
        const next = globalThis.__commandsQueue.shift();
        return next();
    }
    if (globalThis.__commandsError) {
        throw globalThis.__commandsError;
    }
    return globalThis.__commandsResponse || {
        commands: [
            {
                name: "opsx-propose",
                aliases: ["opsx:propose"],
                description: "Create an OpenSpec proposal",
                argument_hint: "<change-id>",
            },
        ],
    };
}

export async function resolveCommandPrompt(payload) {
    return {
        matched: false,
        expanded_prompt: String(payload?.raw_text || ""),
    };
}

export async function searchWorkspacePaths(workspaceId, query, limit) {
    globalThis.__searchWorkspacePathCalls = [
        ...(globalThis.__searchWorkspacePathCalls || []),
        { workspaceId, query, limit },
    ];
    return globalThis.__resourceResponse || {
        workspace_id: "workspace-1",
        query: "",
        results: [],
    };
}

export async function forceQueuedInject() {
    return {
        run_id: "run-flush",
        session_id: "session-1",
        content: "queued inject",
        message_count: 1,
    };
}

export async function injectMessage() {
    return {
        status: "queued",
    };
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRuntimeInjectQueue.mjs").write_text(
        """
export function replaceRuntimeInjectMessages() {
    return undefined;
}

export function removeRuntimeInjectMessage() {
    return undefined;
}

export function upsertRuntimeInjectMessage() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRecovery.mjs").write_text(
        """
export async function hydrateSessionView() {
    return null;
}

export function startSessionContinuity() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    currentWorkspaceId: "workspace-1",
    currentSessionMode: "normal",
    currentSessionCanSwitchMode: true,
    currentNormalRootRoleId: "MainAgent",
    currentOrchestrationPresetId: null,
    pausedSubagent: null,
    isGenerating: false,
    yolo: true,
    shellSafetyPolicyEnabled: true,
    thinking: { enabled: false, effort: "medium" },
    instanceRoleMap: {},
    roleInstanceMap: {},
    taskInstanceMap: {},
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
    autoSwitchedSubagentInstances: {},
    activeRunId: null,
};

let coordinatorRoleId = "Coordinator";
let mainAgentRoleId = "MainAgent";
let normalModeRoles = [
    { role_id: "writer", name: "Writer", description: "Draft final responses" },
    { role_id: "reviewer", name: "Reviewer", description: "Check correctness and risk" },
];
let coordinatorRoleOption = null;
let mainAgentRoleOption = null;

export function applyCurrentSessionRecord() {
    return undefined;
}

export function getCoordinatorRoleId() {
    return coordinatorRoleId;
}

export function getMainAgentRoleId() {
    return mainAgentRoleId;
}

export function getNormalModeRoles() {
    return normalModeRoles;
}

export function getPrimaryRoleId() {
    return String(state.currentNormalRootRoleId || mainAgentRoleId);
}

export function getRoleOption(roleId) {
    if (roleId === coordinatorRoleId) return coordinatorRoleOption;
    if (roleId === mainAgentRoleId) return mainAgentRoleOption;
    return normalModeRoles.find(role => role.role_id === roleId) || null;
}

export function getRoleDisplayName(roleId, { fallback = "Agent" } = {}) {
    if (roleId === coordinatorRoleId) return "Coordinator";
    if (roleId === mainAgentRoleId) return "Main Agent";
    const match = normalModeRoles.find(role => role.role_id === roleId);
    return match?.name || fallback;
}

export function setCoordinatorRoleId(roleId) {
    coordinatorRoleId = String(roleId || "");
}

export function setCoordinatorRoleOption(roleOption) {
    coordinatorRoleOption = roleOption;
}

export function setMainAgentRoleId(roleId) {
    mainAgentRoleId = String(roleId || "");
}

export function setMainAgentRoleOption(roleOption) {
    mainAgentRoleOption = roleOption;
}

export function setNormalModeRoles(roleOptions) {
    normalModeRoles = Array.isArray(roleOptions) ? roleOptions : [];
}

export function roleSupportsInputModality(roleId, modality) {
    return String(roleId || "") !== "" && String(modality || "") === "image";
}

export function getRoleInputModalitySupport(roleId, modality) {
    return roleSupportsInputModality(roleId, modality);
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockStream.mjs").write_text(
        """
export async function startIntentStream() {
    return undefined;
}

export function attachRunStream() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockDom.mjs").write_text(
        """
function createElement(initial = {}) {
    return {
        value: "",
        checked: false,
        disabled: false,
        hidden: true,
        textContent: "",
        innerHTML: "",
        title: "",
        selectionStart: 0,
        selectionEnd: 0,
        scrollHeight: 36,
        style: { display: "", height: "" },
        dataset: {},
        classList: { toggle() { return undefined; } },
        _listeners: new Map(),
        _scrollEvents: [],
        addEventListener(type, listener) {
            this._listeners.set(type, listener);
        },
        querySelectorAll() {
            return [];
        },
        querySelector(selector) {
            if (selector !== ".prompt-mention-item.active") {
                return null;
            }
            return {
                scrollIntoView: (options) => {
                    this._scrollEvents.push(options);
                },
            };
        },
        focus() { return undefined; },
        contains(target) {
            return target === this;
        },
        ...initial,
    };
}

export const els = {
    promptInput: createElement({
        value: "@",
        selectionStart: 1,
        selectionEnd: 1,
        hidden: false,
    }),
    promptAttachments: createElement({ hidden: false }),
    promptMentionMenu: createElement({ hidden: true }),
    sendBtn: createElement({ hidden: false }),
    stopBtn: createElement({ style: { display: "none" }, hidden: false }),
    yoloToggle: createElement({ checked: true, hidden: false }),
    shellSafetyPolicyToggle: createElement({ checked: true, hidden: false }),
    thinkingModeToggle: createElement({ checked: false, hidden: false }),
    thinkingEffortSelect: createElement({ value: "medium", disabled: true, hidden: false }),
};
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockFeedback.mjs").write_text(
        """
export function showToast() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}

export function formatMessage(key, values = {}) {
    return Object.entries(values).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import {
    handlePromptComposerInput,
    handlePromptComposerKeydown,
    invalidatePromptCommandsCache,
    refreshRoleConfigOptions,
} from "./prompt.js";
import { els } from "./mockDom.mjs";
import { state } from "./mockState.mjs";

handlePromptComposerInput();
const beforeAsciiSelect = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
    scrollEvents: els.promptMentionMenu._scrollEvents.slice(),
};

const arrowDownHandled = handlePromptComposerKeydown({
    key: "ArrowDown",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});

const afterArrowDownScrollEvents = els.promptMentionMenu._scrollEvents.slice();
const arrowPreviewValue = els.promptInput.value;
const arrowPreviewSelectionStart = els.promptInput.selectionStart;

const asciiEnterHandled = handlePromptComposerKeydown({
    key: "Enter",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});

const asciiValue = els.promptInput.value;
const asciiSelectionStart = els.promptInput.selectionStart;
const asciiSelectionEnd = els.promptInput.selectionEnd;

els.promptInput.value = "@";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
const escapePreviewArrowHandled = handlePromptComposerKeydown({
    key: "ArrowDown",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const escapePreviewValue = els.promptInput.value;
const escapePreviewHandled = handlePromptComposerKeydown({
    key: "Escape",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const escapeRestoredValue = els.promptInput.value;

els.promptInput.value = "＠Ma";
els.promptInput.selectionStart = 3;
els.promptInput.selectionEnd = 3;
handlePromptComposerInput();
const beforeFullwidthSelect = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
    scrollEvents: els.promptMentionMenu._scrollEvents.slice(),
};

const fullwidthEnterHandled = handlePromptComposerKeydown({
    key: "Enter",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const fullwidthValue = els.promptInput.value;
const fullwidthSelectionStart = els.promptInput.selectionStart;
const fullwidthSelectionEnd = els.promptInput.selectionEnd;

els.promptInput.value = "/";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const beforeCommandSelect = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

const commandTabHandled = handlePromptComposerKeydown({
    key: "Tab",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});

const commandValue = els.promptInput.value;
const commandSelectionStart = els.promptInput.selectionStart;
const commandSelectionEnd = els.promptInput.selectionEnd;

state.currentWorkspaceId = "workspace-empty";
globalThis.__commandsResponse = { commands: [] };
els.promptInput.value = "/";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const emptyCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const emptyEnterHandled = handlePromptComposerKeydown({
    key: "Enter",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const emptyEscapeHandled = handlePromptComposerKeydown({
    key: "Escape",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const emptyHiddenAfterEscape = els.promptMentionMenu.hidden;

state.currentWorkspaceId = "";
globalThis.__commandsResponse = { commands: [] };
els.promptInput.value = "/";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const noWorkspaceCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const noWorkspaceTabHandled = handlePromptComposerKeydown({
    key: "Tab",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});

state.currentWorkspaceId = "workspace-error";
globalThis.__commandsError = new Error("registry down");
els.promptInput.value = "/";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const errorCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const commandFetchCallsAfterError = globalThis.__fetchCommandsCalls;

globalThis.__commandsError = null;
globalThis.__commandsResponse = {
    commands: [
        {
            name: "retry",
            aliases: [],
            description: "Recovered command list",
            argument_hint: "",
        },
    ],
};
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const retryCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const commandFetchCallsAfterRetry = globalThis.__fetchCommandsCalls;

globalThis.__commandsResponse = {
    commands: [
        {
            name: "fresh",
            aliases: [],
            description: "Fresh command list",
            argument_hint: "",
        },
    ],
};
invalidatePromptCommandsCache();
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const invalidatedCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const commandFetchCallsAfterInvalidation = globalThis.__fetchCommandsCalls;

let rejectStaleCommands;
let resolveCurrentCommands;
globalThis.__commandsQueue = [
    () => new Promise((resolve, reject) => {
        rejectStaleCommands = reject;
    }),
    () => new Promise(() => {}),
    () => new Promise((resolve) => {
        resolveCurrentCommands = resolve;
    }),
];
globalThis.__commandsResponse = null;
state.currentWorkspaceId = "workspace-stale";
els.promptInput.value = "/";
els.promptInput.selectionStart = 1;
els.promptInput.selectionEnd = 1;
handlePromptComposerInput();
state.currentWorkspaceId = "workspace-current";
handlePromptComposerInput();
state.currentWorkspaceId = "workspace-stale";
handlePromptComposerInput();
resolveCurrentCommands({
    commands: [
        {
            name: "current",
            aliases: [],
            description: "Current workspace command",
            argument_hint: "",
        },
    ],
});
await new Promise(resolve => setTimeout(resolve, 0));
rejectStaleCommands(new Error("stale registry down"));
await new Promise(resolve => setTimeout(resolve, 0));
const staleFailurePanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

state.currentWorkspaceId = "workspace-skill";
globalThis.__skillsResponse = [
    {
        ref: "data-analysis",
        name: "Data Analysis",
        description: "Analyze a dataset.",
        source: "builtin",
    },
];
await refreshRoleConfigOptions({ refreshControls: false });
globalThis.__commandsResponse = { commands: [] };
invalidatePromptCommandsCache();
els.promptInput.value = "/Data";
els.promptInput.selectionStart = els.promptInput.value.length;
els.promptInput.selectionEnd = els.promptInput.value.length;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const skillCommandPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const skillTabHandled = handlePromptComposerKeydown({
    key: "Tab",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const skillCommandValue = els.promptInput.value;

els.promptInput.value = "/Nope";
els.promptInput.selectionStart = els.promptInput.value.length;
els.promptInput.selectionEnd = els.promptInput.value.length;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 0));
const unmatchedActionPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

state.currentWorkspaceId = "workspace-files";
globalThis.__resourceResponse = {
    workspace_id: "workspace-files",
    query: "src",
    results: [
        { name: "src", path: "src/", kind: "directory", mount_name: "default" },
        { name: "main.py", path: "src/relay_teams/main.py", kind: "file", mount_name: "default" },
    ],
};
els.promptInput.value = "@src";
els.promptInput.selectionStart = 4;
els.promptInput.selectionEnd = 4;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 120));
const directoryPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const directoryEnterHandled = handlePromptComposerKeydown({
    key: "Enter",
    preventDefault() { return undefined; },
    stopImmediatePropagation() { return undefined; },
    stopPropagation() { return undefined; },
});
const directoryValue = els.promptInput.value;
const directorySelectionStart = els.promptInput.selectionStart;
const directoryPanelAfterEnter = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

globalThis.__resourceResponse = {
    workspace_id: "workspace-files",
    query: "src/relay_teams/agents/ds",
    results: [],
};
els.promptInput.value = "@src/relay_teams/agents/ds";
els.promptInput.selectionStart = 26;
els.promptInput.selectionEnd = 26;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 120));
const emptyResourcePanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

globalThis.__resourceResponse = {
    workspace_id: "workspace-files",
    query: "relay",
    results: [],
};
els.promptInput.value = "@relay";
els.promptInput.selectionStart = 6;
els.promptInput.selectionEnd = 6;
handlePromptComposerInput();
const cachedRelayPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};

state.currentWorkspaceId = "workspace-case";
globalThis.__resourceResponse = {
    workspace_id: "workspace-case",
    query: "src/relay_teams/media/",
    results: [],
};
els.promptInput.value = "@src/relay_teams/media/";
els.promptInput.selectionStart = els.promptInput.value.length;
els.promptInput.selectionEnd = els.promptInput.value.length;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 120));
const lowerCaseMissPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
globalThis.__resourceResponse = {
    workspace_id: "workspace-case",
    query: "Src/Relay_Teams/Media/",
    results: [
        { name: "models.py", path: "Src/Relay_Teams/Media/models.py", kind: "file", mount_name: "default" },
    ],
};
els.promptInput.value = "@Src/Relay_Teams/Media/";
els.promptInput.selectionStart = els.promptInput.value.length;
els.promptInput.selectionEnd = els.promptInput.value.length;
handlePromptComposerInput();
await new Promise(resolve => setTimeout(resolve, 120));
const mixedCaseHitPanel = {
    menuHidden: els.promptMentionMenu.hidden,
    menuHtml: els.promptMentionMenu.innerHTML,
};
const caseResourceCalls = (globalThis.__searchWorkspacePathCalls || [])
    .filter((call) => call.workspaceId === "workspace-case");

console.log(JSON.stringify({
    beforeAsciiSelect,
    arrowDownHandled,
    afterArrowDownScrollEvents,
    arrowPreviewValue,
    arrowPreviewSelectionStart,
    asciiEnterHandled,
    asciiValue,
    asciiSelectionStart,
    asciiSelectionEnd,
    escapePreviewArrowHandled,
    escapePreviewValue,
    escapePreviewHandled,
    escapeRestoredValue,
    beforeFullwidthSelect,
    fullwidthEnterHandled,
    fullwidthValue,
    fullwidthSelectionStart,
    fullwidthSelectionEnd,
    beforeCommandSelect,
    commandTabHandled,
    commandValue,
    commandSelectionStart,
    commandSelectionEnd,
    emptyCommandPanel,
    emptyEnterHandled,
    emptyEscapeHandled,
    emptyHiddenAfterEscape,
    noWorkspaceCommandPanel,
    noWorkspaceTabHandled,
    errorCommandPanel,
    commandFetchCallsAfterError,
    commandFetchCallsAfterRetry,
    retryCommandPanel,
    invalidatedCommandPanel,
    commandFetchCallsAfterInvalidation,
    staleFailurePanel,
    skillCommandPanel,
    skillTabHandled,
    skillCommandValue,
    unmatchedActionPanel,
    directoryPanel,
    directoryEnterHandled,
    directoryValue,
    directorySelectionStart,
    directoryPanelAfterEnter,
    emptyResourcePanel,
    lowerCaseMissPanel,
    mixedCaseHitPanel,
    caseResourceCalls,
    cachedRelayPanel,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    rendered_ascii_text = re.sub(
        r"<[^>]+>", "", payload["beforeAsciiSelect"]["menuHtml"]
    )
    rendered_fullwidth_text = re.sub(
        r"<[^>]+>", "", payload["beforeFullwidthSelect"]["menuHtml"]
    )
    rendered_command_text = re.sub(
        r"<[^>]+>", "", payload["beforeCommandSelect"]["menuHtml"]
    )
    rendered_retry_command_text = re.sub(
        r"<[^>]+>", "", payload["retryCommandPanel"]["menuHtml"]
    )
    rendered_invalidated_command_text = re.sub(
        r"<[^>]+>", "", payload["invalidatedCommandPanel"]["menuHtml"]
    )
    rendered_stale_failure_text = re.sub(
        r"<[^>]+>", "", payload["staleFailurePanel"]["menuHtml"]
    )
    rendered_directory_text = re.sub(
        r"<[^>]+>", "", payload["directoryPanel"]["menuHtml"]
    )
    rendered_cached_relay_text = re.sub(
        r"<[^>]+>", "", payload["cachedRelayPanel"]["menuHtml"]
    )
    assert payload["beforeAsciiSelect"]["menuHidden"] is False
    assert payload["beforeFullwidthSelect"]["menuHidden"] is False
    assert "prompt-mention-menu-header" in payload["beforeAsciiSelect"]["menuHtml"]
    assert "prompt-mention-item-accent" in payload["beforeAsciiSelect"]["menuHtml"]
    assert "prompt-mention-match" in payload["beforeFullwidthSelect"]["menuHtml"]
    assert "Draft final responses" in rendered_ascii_text
    assert "Main Agent" in rendered_ascii_text
    assert "MainAgent" in rendered_ascii_text
    assert "Main Agent" in rendered_fullwidth_text
    assert "MainAgent" in rendered_fullwidth_text
    assert payload["arrowDownHandled"] is True
    assert payload["afterArrowDownScrollEvents"] == []
    assert payload["arrowPreviewValue"] == "@Main Agent"
    assert payload["arrowPreviewSelectionStart"] == 11
    assert payload["asciiEnterHandled"] is True
    assert payload["asciiValue"] == "@Main Agent "
    assert payload["asciiSelectionStart"] == 12
    assert payload["asciiSelectionEnd"] == 12
    assert payload["fullwidthEnterHandled"] is True
    assert payload["fullwidthValue"] == "＠Main Agent "
    assert payload["fullwidthSelectionStart"] == 12
    assert payload["fullwidthSelectionEnd"] == 12
    assert payload["escapePreviewArrowHandled"] is True
    assert payload["escapePreviewValue"] == "@Main Agent"
    assert payload["escapePreviewHandled"] is True
    assert payload["escapeRestoredValue"] == "@"
    assert payload["beforeCommandSelect"]["menuHidden"] is False
    assert "/ 命令" in rendered_command_text
    assert "opsx:propose" in rendered_command_text
    assert "Create an OpenSpec proposal" in rendered_command_text
    assert "&lt;change-id&gt;" in payload["beforeCommandSelect"]["menuHtml"]
    assert payload["commandTabHandled"] is True
    assert payload["commandValue"] == "/opsx-propose "
    assert payload["commandSelectionStart"] == 14
    assert payload["commandSelectionEnd"] == 14
    assert payload["emptyCommandPanel"]["menuHidden"] is True
    assert payload["emptyCommandPanel"]["menuHtml"] == ""
    assert payload["emptyEnterHandled"] is False
    assert payload["emptyEscapeHandled"] is False
    assert payload["emptyHiddenAfterEscape"] is True
    assert payload["noWorkspaceCommandPanel"]["menuHidden"] is True
    assert payload["noWorkspaceCommandPanel"]["menuHtml"] == ""
    assert payload["noWorkspaceTabHandled"] is False
    assert payload["errorCommandPanel"]["menuHidden"] is True
    assert payload["errorCommandPanel"]["menuHtml"] == ""
    assert payload["commandFetchCallsAfterRetry"] == (
        payload["commandFetchCallsAfterError"] + 1
    )
    assert payload["retryCommandPanel"]["menuHidden"] is False
    assert "Recovered command list" in rendered_retry_command_text
    assert payload["commandFetchCallsAfterInvalidation"] == (
        payload["commandFetchCallsAfterRetry"] + 1
    )
    assert payload["invalidatedCommandPanel"]["menuHidden"] is False
    assert "Fresh command list" in rendered_invalidated_command_text
    assert payload["staleFailurePanel"]["menuHidden"] is False
    assert "current" in rendered_stale_failure_text
    assert "composer.command_load_failed" not in rendered_stale_failure_text
    assert payload["skillCommandPanel"]["menuHidden"] is False
    assert "Data Analysis" in re.sub(
        r"<[^>]+>", "", payload["skillCommandPanel"]["menuHtml"]
    )
    assert payload["skillTabHandled"] is True
    assert payload["skillCommandValue"] == "/data-analysis "
    assert payload["unmatchedActionPanel"]["menuHidden"] is True
    assert payload["unmatchedActionPanel"]["menuHtml"] == ""
    assert payload["directoryPanel"]["menuHidden"] is False
    assert "src/" in rendered_directory_text
    assert payload["directoryEnterHandled"] is True
    assert payload["directoryValue"] == "@src/"
    assert payload["directorySelectionStart"] == 5
    assert payload["directoryPanelAfterEnter"]["menuHidden"] is False
    assert "src/relay_teams/main.py" in re.sub(
        r"<[^>]+>", "", payload["directoryPanelAfterEnter"]["menuHtml"]
    )
    assert payload["emptyResourcePanel"]["menuHidden"] is True
    assert "正在搜索" not in payload["emptyResourcePanel"]["menuHtml"]
    assert payload["lowerCaseMissPanel"]["menuHidden"] is True
    assert payload["mixedCaseHitPanel"]["menuHidden"] is False
    assert "Src/Relay_Teams/Media/models.py" in re.sub(
        r"<[^>]+>", "", payload["mixedCaseHitPanel"]["menuHtml"]
    )
    assert payload["caseResourceCalls"] == [
        {
            "workspaceId": "workspace-case",
            "query": "src/relay_teams/media/",
            "limit": 500,
        },
        {
            "workspaceId": "workspace-case",
            "query": "Src/Relay_Teams/Media/",
            "limit": 500,
        },
    ]
    assert payload["cachedRelayPanel"]["menuHidden"] is False
    assert "src/relay_teams/main.py" in rendered_cached_relay_text


def test_handle_send_restores_composer_when_command_resolution_aborts(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import { handleSend } from "./prompt.js";
import { els } from "./mockDom.mjs";
import { state } from "./mockState.mjs";

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
els.promptInput.value = "/opsx:propose";

await handleSend();

console.log(JSON.stringify({
    isGenerating: state.isGenerating,
    sendDisabled: els.sendBtn.disabled,
    inputDisabled: els.promptInput.disabled,
    streamCalls: globalThis.__streamCalls,
    statusHidden: els.promptInputStatus.hidden,
    statusText: els.promptInputStatus.textContent,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["isGenerating"] is False
    assert payload["sendDisabled"] is False
    assert payload["inputDisabled"] is False
    assert payload["streamCalls"] == []
    assert payload["statusHidden"] is False
    assert (
        payload["statusText"] == "Cannot resolve command without an active workspace."
    )


def test_handle_send_emits_title_preview_only_after_run_created(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
    }
};
globalThis.__titleEvents = [];
globalThis.document = {
    addEventListener() {
        return undefined;
    },
    dispatchEvent(event) {
        globalThis.__titleEvents.push({
            type: event.type,
            detail: event.detail,
        });
        return true;
    },
};

const { handleSend } = await import("./prompt.js");
const { els } = await import("./mockDom.mjs");
const { state } = await import("./mockState.mjs");

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
els.promptInput.value = "preview before run";

await handleSend();

els.promptInput.value = "preview after run";
els.promptInput.disabled = false;
state.isGenerating = false;
globalThis.__invokeRunCreated = true;

await handleSend();

console.log(JSON.stringify({
    titleEvents: globalThis.__titleEvents,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["titleEvents"] == [
        {
            "type": "agent-teams-session-title-previewed",
            "detail": {
                "sessionId": "session-1",
                "title": "preview after run",
            },
        }
    ]


def test_handle_send_sends_pasted_image_as_inline_media_for_multimodal_role(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
} from "./prompt.js";
import { els } from "./mockDom.mjs";

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.__pastePrevented = false;
globalThis.FileReader = class {
    constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.error = null;
    }
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        globalThis.__pastePrevented = true;
    },
});

await handleSend();

console.log(JSON.stringify({
    pastePrevented: globalThis.__pastePrevented,
    streamCalls: globalThis.__streamCalls,
    logs: globalThis.__logs,
    attachmentHtmlAfterSend: els.promptAttachments.innerHTML,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["pastePrevented"] is True
    assert len(payload["streamCalls"]) == 1
    assert payload["streamCalls"][0]["promptText"] == "[image]"
    assert payload["streamCalls"][0]["options"]["inputParts"] == [
        {
            "kind": "inline_media",
            "modality": "image",
            "mime_type": "image/png",
            "base64_data": "QUJDRA==",
            "name": "diagram.png",
            "size_bytes": 4,
            "width": None,
            "height": None,
        }
    ]
    assert (
        'data-image-preview-trigger="true"' in payload["attachmentHtmlAfterSend"]
        or payload["attachmentHtmlAfterSend"] == ""
    )
    assert payload["attachmentHtmlAfterSend"] == ""


def test_pasted_image_hides_prompt_footer_hint(tmp_path: Path) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import {
    handlePromptComposerPaste,
} from "./prompt.js";
import { els } from "./mockDom.mjs";

globalThis.__draftMentionHintSyncCalls = 0;
globalThis.FileReader = class {
    constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.error = null;
    }
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        return undefined;
    },
});

console.log(JSON.stringify({
    attachmentHidden: els.promptAttachments.hidden,
    footerHintClassName: els.promptInputHint.className,
    draftMentionHintSyncCalls: globalThis.__draftMentionHintSyncCalls,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["attachmentHidden"] is False
    assert "is-hidden" in payload["footerHintClassName"]
    assert payload["draftMentionHintSyncCalls"] >= 1


def test_handle_send_blocks_pasted_image_for_text_only_role(tmp_path: Path) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=False)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
} from "./prompt.js";
import { els } from "./mockDom.mjs";

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.__pastePrevented = false;
globalThis.FileReader = class {
    constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.error = null;
    }
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        globalThis.__pastePrevented = true;
    },
});

await handleSend();

console.log(JSON.stringify({
    streamCalls: globalThis.__streamCalls,
    logs: globalThis.__logs,
    notifications: globalThis.__notifications,
    attachmentHtml: els.promptAttachments.innerHTML,
    attachmentClassName: els.promptAttachments.className,
    promptStatusText: els.promptInputStatus.textContent,
    promptStatusHidden: els.promptInputStatus.hidden,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["streamCalls"] == []
    assert payload["notifications"] == [
        {
            "title": "Send Blocked",
            "message": "gpt-4.1-mini is currently configured as not supporting image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model.",
            "tone": "warning",
        }
    ]
    assert any(
        "is currently configured as not supporting image input" in entry["message"]
        for entry in payload["logs"]
    )
    assert "prompt-attachment" in payload["attachmentHtml"]
    assert 'data-image-preview-trigger="true"' in payload["attachmentHtml"]
    assert 'role="button"' in payload["attachmentHtml"]
    assert "is-error" in payload["attachmentClassName"]
    assert payload["promptStatusText"] == (
        "gpt-4.1-mini is currently configured as not supporting image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model."
    )
    assert payload["promptStatusHidden"] is False


def test_handle_send_allows_image_when_selected_model_profile_supports_it(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=False)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
    refreshModelProfileOptions,
} from "./prompt.js";
import { state } from "./mockState.mjs";

globalThis.__modelProfiles = {
    vision: {
        model: "vision-profile-model",
        input_modalities: ["image"],
    },
};
state.currentNormalModelProfile = "vision";
globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.FileReader = class {
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await refreshModelProfileOptions({ refreshControls: false });
await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        return undefined;
    },
});

await handleSend();

console.log(JSON.stringify({
    streamCalls: globalThis.__streamCalls,
    logs: globalThis.__logs,
    notifications: globalThis.__notifications,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert len(payload["streamCalls"]) == 1
    assert payload["streamCalls"][0]["promptText"] == "[image]"
    assert payload["notifications"] == []
    assert not any("image input" in entry["message"] for entry in payload["logs"])


def test_handle_send_validates_image_after_pending_model_profile_save(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
    initializeSessionTopologyControls,
    refreshModelProfileOptions,
    refreshSessionTopologyControls,
} from "./prompt.js";
import { els, createMenuOption } from "./mockDom.mjs";
import { state } from "./mockState.mjs";

globalThis.__modelProfiles = {
    textOnly: {
        model: "text-only-model",
        input_modalities: [],
    },
    vision: {
        model: "vision-profile-model",
        input_modalities: ["image"],
    },
};
globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.__holdNormalModelProfileSave = true;
globalThis.FileReader = class {
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await refreshModelProfileOptions({ refreshControls: false });
await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        return undefined;
    },
});

state.currentNormalModelProfile = "textOnly";
await initializeSessionTopologyControls();
refreshSessionTopologyControls();
els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "vision", 2),
});

const sendPromise = handleSend();
await new Promise(resolve => setTimeout(resolve, 0));
const beforeResolve = {
    streamCalls: [...globalThis.__streamCalls],
    statusText: els.promptInputStatus.textContent,
};
globalThis.__resolveNormalModelProfileSave();
await sendPromise;

console.log(JSON.stringify({
    beforeResolve,
    streamCalls: globalThis.__streamCalls,
    logs: globalThis.__logs,
    notifications: globalThis.__notifications,
    updates: globalThis.__normalModelProfileUpdates,
    finalProfile: state.currentNormalModelProfile,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["beforeResolve"]["streamCalls"] == []
    assert payload["beforeResolve"]["statusText"] == ""
    assert payload["updates"] == [
        {"sessionId": "session-1", "normalModelProfile": "vision"}
    ]
    assert payload["finalProfile"] == "vision"
    assert len(payload["streamCalls"]) == 1
    assert payload["streamCalls"][0]["promptText"] == "[image]"
    assert payload["notifications"] == []
    assert not any("image input" in entry["message"] for entry in payload["logs"])


def test_handle_send_waits_for_latest_pending_model_profile_save(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import {
    handleSend,
    initializeSessionTopologyControls,
    refreshModelProfileOptions,
} from "./prompt.js";
import { els, createMenuOption } from "./mockDom.mjs";

globalThis.__modelProfiles = {
    fast: {
        model: "gpt-4.1-mini",
        input_modalities: ["image"],
    },
    precise: {
        model: "gpt-4.1",
        input_modalities: ["image"],
    },
};
globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.__deferNormalModelProfileUpdates = true;

await refreshModelProfileOptions({ refreshControls: false });
await initializeSessionTopologyControls();
els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "fast", 1),
});
await new Promise(resolve => setTimeout(resolve, 0));

els.promptInput.value = "ship it";
const sendPromise = handleSend();
await new Promise(resolve => setTimeout(resolve, 0));

els.normalModelMenuButton.dispatch("click");
els.normalModelMenuList.dispatch("click", {
    target: createMenuOption("normal-model", "precise", 2),
});
await new Promise(resolve => setTimeout(resolve, 0));

const deferredCalls = globalThis.__normalModelProfileDeferredCalls || [];
deferredCalls[0]?.resolve?.();
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));
const streamCallsAfterFirstSave = globalThis.__streamCalls.length;

deferredCalls[1]?.resolve?.();
await sendPromise;

console.log(JSON.stringify({
    modelUpdates: globalThis.__normalModelProfileUpdates || [],
    deferredCount: deferredCalls.length,
    streamCallsAfterFirstSave,
    streamCalls: globalThis.__streamCalls,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["modelUpdates"] == [
        {"sessionId": "session-1", "normalModelProfile": "fast"},
        {"sessionId": "session-1", "normalModelProfile": "precise"},
    ]
    assert payload["deferredCount"] == 2
    assert payload["streamCallsAfterFirstSave"] == 0
    assert len(payload["streamCalls"]) == 1
    assert payload["streamCalls"][0]["promptText"] == "ship it"


def test_handle_send_blocks_image_when_selected_model_profile_rejects_it(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=True)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
    refreshModelProfileOptions,
} from "./prompt.js";
import { els } from "./mockDom.mjs";
import { state } from "./mockState.mjs";

globalThis.__modelProfiles = {
    textOnly: {
        model: "text-only-model",
        input_modalities: [],
    },
};
state.currentNormalModelProfile = "textOnly";
globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];
globalThis.FileReader = class {
    readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload?.();
    }
};

await refreshModelProfileOptions({ refreshControls: false });
await handlePromptComposerPaste({
    clipboardData: {
        items: [
            {
                type: "image/png",
                getAsFile() {
                    return {
                        name: "diagram.png",
                        size: 4,
                        __dataUrl: "data:image/png;base64,QUJDRA==",
                    };
                },
            },
        ],
    },
    preventDefault() {
        return undefined;
    },
});

await handleSend();

console.log(JSON.stringify({
    streamCalls: globalThis.__streamCalls,
    logs: globalThis.__logs,
    notifications: globalThis.__notifications,
    promptStatusText: els.promptInputStatus.textContent,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    expected_message = (
        "text-only-model is currently configured as not supporting image input. "
        "Remove the image, or go to Settings > Model and set Image Input to "
        "Supports image input for this model."
    )
    assert payload["streamCalls"] == []
    assert payload["notifications"] == [
        {
            "title": "Send Blocked",
            "message": expected_message,
            "tone": "warning",
        }
    ]
    assert payload["promptStatusText"] == expected_message
    assert any(expected_message == entry["message"] for entry in payload["logs"])


def test_handle_send_blocks_pasted_image_when_image_support_is_unknown(
    tmp_path: Path,
) -> None:
    temp_dir = _write_multimodal_prompt_fixture(tmp_path, role_supports_image=None)
    runner = """
import {
    handlePromptComposerPaste,
    handleSend,
} from "./prompt.js";
import { els } from "./mockDom.mjs";

globalThis.__streamCalls = [];
globalThis.__logs = [];
globalThis.__notifications = [];

class FakeFileReader {
  readAsDataURL(file) {
    this.result = file.__dataUrl;
    this.onload?.();
  }
}

globalThis.FileReader = FakeFileReader;

const fakeFile = {
  name: "diagram.png",
  size: 2048,
  type: "image/png",
  __dataUrl: "data:image/png;base64,QUJDRA==",
};

await handlePromptComposerPaste({
  preventDefault() {
    return undefined;
  },
  clipboardData: {
    items: [{
      type: "image/png",
      getAsFile() {
        return fakeFile;
      },
    }],
  },
});

await handleSend();

console.log(JSON.stringify({
  streamCalls: globalThis.__streamCalls,
  logs: globalThis.__logs,
  notifications: globalThis.__notifications,
  promptStatusText: els.promptInputStatus.textContent,
  promptStatusHidden: els.promptInputStatus.hidden,
}));
""".strip()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    payload = json.loads(result.stdout)

    assert payload["streamCalls"] == []
    assert payload["notifications"] == [
        {
            "title": "Send Blocked",
            "message": "Cannot confirm whether gpt-4.1-mini supports image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model.",
            "tone": "warning",
        }
    ]
    assert any(
        "Cannot confirm whether gpt-4.1-mini supports image input." in entry["message"]
        for entry in payload["logs"]
    )
    assert payload["promptStatusText"] == (
        "Cannot confirm whether gpt-4.1-mini supports image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model."
    )
    assert payload["promptStatusHidden"] is False


def test_new_session_draft_creation_includes_selected_normal_model_profile(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/newSessionDraft.js").read_text(
        encoding="utf-8"
    )
    (tmp_path / "newSessionDraft.mjs").write_text(
        source.replace("../core/api.js", "./mockApi.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("./agentPanel.js", "./mockNoop.mjs")
        .replace("./contextIndicators.js", "./mockNoop.mjs")
        .replace("./messageRenderer.js", "./mockNoop.mjs")
        .replace("./rounds/timeline.js", "./mockNoop.mjs")
        .replace("./sessionTokenUsage.js", "./mockNoop.mjs")
        .replace("./subagentSessions.js", "./mockNoop.mjs")
        .replace("./newSessionDraftView.js", "./mockView.mjs")
        .replace("./sessionSidebarStore.js", "./mockSidebarStore.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs"),
        encoding="utf-8",
    )
    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchWorkspaces() {
    return [];
}

export async function pickWorkspace() {
    return null;
}

export async function startNewSession(workspaceId, options = {}) {
    globalThis.__startNewSessionCalls = [
        ...(globalThis.__startNewSessionCalls || []),
        { workspaceId, options },
    ];
    return {
        session_id: "session-created",
        workspace_id: workspaceId,
        normal_model_profile: options.normalModelProfile || null,
    };
}

export async function updateSessionTopology() {
    throw new Error("topology should not update for this draft");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    pendingNewSessionActive: true,
    pendingNewSessionWorkspaceId: "workspace-1",
    currentWorkspaceId: "workspace-1",
    currentSessionId: null,
    currentSessionMode: "normal",
    currentNormalRootRoleId: "",
    currentNormalModelProfile: "fast",
    currentOrchestrationPresetId: null,
    currentSessionCanSwitchMode: false,
    currentMainView: "new-session-draft",
};

export function applyCurrentSessionRecord(record) {
    state.currentSessionId = record.session_id;
    state.currentNormalModelProfile = record.normal_model_profile || null;
}

export function resetCurrentSessionTopology() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNoop.mjs").write_text(
        """
export function clearActiveSubagentSession() { return undefined; }
export function clearAllPanels() { return undefined; }
export function clearAllStreamState() { return undefined; }
export function clearContextIndicators() { return undefined; }
export function clearSessionTimeline() { return undefined; }
export function clearSessionTokenUsage() { return undefined; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockView.mjs").write_text(
        """
export function renderNewSessionDraftView() {
    return "";
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockSidebarStore.mjs").write_text(
        """
export function getSidebarDataSnapshot() {
    return { sessions: [] };
}

export function hasSidebarDataSnapshot() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
export const els = {
    chatMessages: { innerHTML: "", querySelector() { return null; } },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    if (key === "composer.model_role_default") {
        return "Role default";
    }
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockFeedback.mjs").write_text(
        """
export async function showTextInputDialog() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    runner = """
globalThis.document = {
    dispatchEvent(event) {
        globalThis.__dispatchedEvents = [
            ...(globalThis.__dispatchedEvents || []),
            event.type,
        ];
    },
    querySelectorAll() {
        return [];
    },
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
    }
};

const draft = await import("./newSessionDraft.mjs");
const sessionId = await draft.ensureSessionForNewSessionDraft({
    shouldCommit: () => false,
    allowDetachedRun: true,
});

console.log(JSON.stringify({
    sessionId,
    calls: globalThis.__startNewSessionCalls || [],
    events: globalThis.__dispatchedEvents || [],
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["sessionId"] == "session-created"
    assert payload["calls"] == [
        {"workspaceId": "workspace-1", "options": {"normalModelProfile": "fast"}}
    ]
    assert payload["events"] == ["agent-teams-new-session-draft-created"]


def _write_new_session_draft_mock(tmp_path: Path) -> None:
    components_dir = tmp_path / "components"
    components_dir.mkdir(exist_ok=True)
    core_dir = tmp_path / "core"
    core_dir.mkdir(exist_ok=True)
    (components_dir / "newSessionDraft.js").write_text(
        """
export function applyDraftSessionTopology() {
    return undefined;
}

export async function ensureSessionForNewSessionDraft() {
    return "";
}

export function isNewSessionDraftActive() {
    return false;
}

export function syncNewSessionDraftMentionHintVisibility() {
    globalThis.__draftMentionHintSyncCalls = (globalThis.__draftMentionHintSyncCalls || 0) + 1;
}
""".strip(),
        encoding="utf-8",
    )
    (core_dir / "submission.js").write_text(
        """
export function beginForegroundSubmission() {
    return { detached: false };
}

export function finishForegroundSubmission() {
    return undefined;
}

export function hasActiveForegroundSubmission() {
    return false;
}

export function isForegroundSubmissionActive(submission) {
    return submission?.detached !== true;
}

export function isForegroundSubmissionDetached(submission) {
    return submission?.detached === true;
}
""".strip(),
        encoding="utf-8",
    )


def _write_multimodal_prompt_fixture(
    tmp_path: Path,
    *,
    role_supports_image: bool | None,
) -> Path:
    source = Path("frontend/dist/js/app/prompt.js").read_text(encoding="utf-8")
    temp_dir = tmp_path / (
        "prompt_multimodal_supported"
        if role_supports_image is True
        else "prompt_multimodal_unknown"
        if role_supports_image is None
        else "prompt_multimodal_blocked"
    )
    temp_dir.mkdir()
    _write_new_session_draft_mock(tmp_path)
    (temp_dir / "prompt.js").write_text(
        source.replace("../components/rounds/timeline.js", "./mockRounds.mjs")
        .replace("../components/rounds.js", "./mockRounds.mjs")
        .replace("../components/contextIndicators.js", "./mockContextIndicators.mjs")
        .replace("../components/messageRenderer.js", "./mockMessageRenderer.mjs")
        .replace("../components/runtimeInjectQueue.js", "./mockRuntimeInjectQueue.mjs")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("./recovery.js", "./mockRecovery.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockRounds.mjs").write_text(
        """
export function appendRoundUserMessage() {
    return undefined;
}

export function createLiveRound() {
    return undefined;
}

export function showPendingRunStartPlaceholder() {
    return undefined;
}

export function clearPendingRunStartPlaceholder() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockContextIndicators.mjs").write_text(
        """
export function refreshVisibleContextIndicators() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockMessageRenderer.mjs").write_text(
        """
export function clearAllStreamState() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockApi.mjs").write_text(
        """
export async function fetchRoleConfigOptions() {
    return {
        coordinator_role_id: "Coordinator",
        main_agent_role_id: "MainAgent",
        skills: globalThis.__skillsResponse || [],
        coordinator_role: {
            role_id: "Coordinator",
            name: "Coordinator",
            description: "",
            model_profile: "default",
            input_modalities: [],
        },
        main_agent_role: {
            role_id: "MainAgent",
            name: "Main Agent",
            description: "",
            model_profile: "default",
            model_name: "gpt-4.1-mini",
            input_modalities: ["image"],
        },
        normal_mode_roles: [
            {
                role_id: "MainAgent",
                name: "Main Agent",
                description: "",
                model_profile: "default",
                model_name: "gpt-4.1-mini",
                input_modalities: ["image"],
            },
        ],
    };
}

export async function fetchModelProfiles() {
    return globalThis.__modelProfiles || {
        fast: { model: "gpt-4.1-mini" },
    };
}

export async function fetchOrchestrationConfig() {
    return {
        default_orchestration_preset_id: "",
        presets: [],
    };
}

export async function updateSessionTopology() {
    return {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
}

export async function updateSessionNormalModelProfile(sessionId, normalModelProfile) {
    globalThis.__normalModelProfileUpdates = [
        ...(globalThis.__normalModelProfileUpdates || []),
        { sessionId, normalModelProfile },
    ];
    const updated = {
        session_mode: "normal",
        normal_root_role_id: "MainAgent",
        normal_model_profile: normalModelProfile || null,
        orchestration_preset_id: null,
        can_switch_mode: true,
    };
    if (globalThis.__deferNormalModelProfileUpdates) {
        return new Promise(resolve => {
            globalThis.__normalModelProfileDeferredCalls = [
                ...(globalThis.__normalModelProfileDeferredCalls || []),
                { sessionId, normalModelProfile, resolve: () => resolve(updated) },
            ];
        });
    }
    if (globalThis.__holdNormalModelProfileSave) {
        return new Promise(resolve => {
            globalThis.__resolveNormalModelProfileSave = () => resolve(updated);
        });
    }
    return updated;
}

export async function fetchCommands() {
    return globalThis.__commandsResponse || { commands: [] };
}

export async function resolveCommandPrompt(payload) {
    globalThis.__resolveCommandCalls = [
        ...(globalThis.__resolveCommandCalls || []),
        payload,
    ];
    if (globalThis.__resolveCommandResponse) {
        return globalThis.__resolveCommandResponse;
    }
    return {
        matched: false,
        expanded_prompt: String(payload?.raw_text || ""),
    };
}

export async function searchWorkspacePaths(workspaceId, query, limit) {
    globalThis.__searchWorkspacePathCalls = [
        ...(globalThis.__searchWorkspacePathCalls || []),
        { workspaceId, query, limit },
    ];
    return globalThis.__resourceResponse || {
        workspace_id: "workspace-1",
        query: "",
        results: [],
    };
}

export async function forceQueuedInject() {
    return {
        run_id: "run-flush",
        session_id: "session-1",
        content: "queued inject",
        message_count: 1,
    };
}

export async function injectMessage() {
    return {
        status: "queued",
    };
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRuntimeInjectQueue.mjs").write_text(
        """
export function replaceRuntimeInjectMessages() {
    return undefined;
}

export function removeRuntimeInjectMessage() {
    return undefined;
}

export function upsertRuntimeInjectMessage() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockRecovery.mjs").write_text(
        """
export async function hydrateSessionView() {
    return null;
}

export function startSessionContinuity() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        f"""
export const state = {{
    currentSessionId: "session-1",
    currentSessionMode: "normal",
    currentSessionCanSwitchMode: true,
    currentNormalRootRoleId: "MainAgent",
    currentNormalModelProfile: null,
    currentOrchestrationPresetId: null,
    pausedSubagent: null,
    isGenerating: false,
    yolo: true,
    shellSafetyPolicyEnabled: true,
    thinking: {{ enabled: false, effort: "medium" }},
    instanceRoleMap: {{}},
    roleInstanceMap: {{}},
    taskInstanceMap: {{}},
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
    autoSwitchedSubagentInstances: {{}},
    activeRunId: null,
}};

let normalModeRoles = [
    {{
        role_id: "MainAgent",
        name: "Main Agent",
        description: "",
        model_profile: "default",
        model_name: "gpt-4.1-mini",
        input_modalities: {json.dumps(["image"] if role_supports_image is True else [])},
    }},
];

export function applyCurrentSessionRecord(record) {{
    if (record && Object.prototype.hasOwnProperty.call(record, "normal_model_profile")) {{
        state.currentNormalModelProfile = record.normal_model_profile || null;
    }}
    return undefined;
}}

export function getCoordinatorRoleId() {{
    return "Coordinator";
}}

export function getMainAgentRoleId() {{
    return "MainAgent";
}}

export function getNormalModeRoles() {{
    return normalModeRoles;
}}

export function getPrimaryRoleId() {{
    return "MainAgent";
}}

export function getRoleOption(roleId) {{
    return normalModeRoles.find(role => role.role_id === roleId) || null;
}}

export function getRoleDisplayName(roleId, {{ fallback = "Agent" }} = {{}}) {{
    if (roleId === "MainAgent") {{
        return "Main Agent";
    }}
    return fallback;
}}

export function setCoordinatorRoleId() {{
    return undefined;
}}

export function setCoordinatorRoleOption() {{
    return undefined;
}}

export function setMainAgentRoleId() {{
    return undefined;
}}

export function setMainAgentRoleOption() {{
    return undefined;
}}

export function setNormalModeRoles(roleOptions) {{
    normalModeRoles = Array.isArray(roleOptions) ? roleOptions : [];
}}

export function roleSupportsInputModality(roleId, modality) {{
    return (
        String(roleId || "") === "MainAgent"
        && String(modality || "") === "image"
        && {str(role_supports_image is True).lower()}
    );
}}

export function getRoleInputModalitySupport(roleId, modality) {{
    if (String(roleId || "") !== "MainAgent" || String(modality || "") !== "image") {{
        return null;
    }}
    return {json.dumps(role_supports_image)};
}}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockStream.mjs").write_text(
        """
export async function startIntentStream(promptText, sessionId, onCompleted, options = {}) {
    globalThis.__streamCalls.push({
        promptText,
        sessionId,
        options,
    });
    if (globalThis.__invokeRunCreated && typeof options.onRunCreated === "function") {
        options.onRunCreated({ run_id: "run-created-1" });
    }
    return onCompleted;
}

export function attachRunStream() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockDom.mjs").write_text(
        """
function createElement(initial = {}) {
    const element = {
        value: "",
        checked: false,
        disabled: false,
        hidden: false,
        textContent: "",
        innerHTML: "",
        title: "",
        className: "",
        selectionStart: 0,
        selectionEnd: 0,
        scrollHeight: 36,
        style: { display: "", height: "" },
        dataset: {},
        _attrs: new Map(),
        _listeners: new Map(),
        querySelectorAll() { return []; },
        addEventListener(type, listener) {
            this._listeners.set(type, listener);
        },
        dispatch(type, event = {}) {
            const listener = this._listeners.get(type);
            listener?.({ ...event, target: event.target || this });
        },
        dispatchEvent(event) {
            this.dispatch(event?.type || "", event || {});
            return true;
        },
        getAttribute(name) {
            return this._attrs.get(name) || "";
        },
        removeAttribute(name) {
            this._attrs.delete(name);
        },
        setAttribute(name, value) {
            this._attrs.set(name, String(value));
        },
        focus() { return undefined; },
        ...initial,
    };
    element.classList = {
        toggle(name, enabled) {
            const tokens = new Set(String(element.className || "").split(/\\s+/).filter(Boolean));
            const shouldEnable = enabled !== false;
            if (shouldEnable) {
                tokens.add(name);
            } else {
                tokens.delete(name);
            }
            element.className = Array.from(tokens).join(" ");
            return shouldEnable;
        },
    };
    return element;
}

function createMenuOption(kind, value, index = 0) {
    const option = createElement({
        dataset: {
            composerSelectOption: kind,
            value,
            index: String(index),
        },
    });
    option.closest = selector => selector === "[data-composer-select-option]" ? option : null;
    return option;
}

globalThis.document = globalThis.document || {};
globalThis.document.activeElement = globalThis.document.activeElement || null;
globalThis.document.addEventListener = globalThis.document.addEventListener || (() => undefined);

const normalModelMenuValue = createElement();
const normalModelMenuMeta = createElement();
const normalModelMenuList = createElement({
    _options: [
        createMenuOption("normal-model", "", 0),
        createMenuOption("normal-model", "textOnly", 1),
        createMenuOption("normal-model", "vision", 2),
    ],
    querySelectorAll() {
        return this._options;
    },
});

export const els = {
    promptInput: createElement({ value: "" }),
    promptAttachments: createElement(),
    promptMentionMenu: createElement({ hidden: true }),
    promptInputStatus: createElement({ hidden: true }),
    promptInputHint: createElement(),
    sendBtn: createElement(),
    stopBtn: createElement({ style: { display: "none" } }),
    yoloToggle: createElement({ checked: true }),
    shellSafetyPolicyToggle: createElement({ checked: true }),
    thinkingModeToggle: createElement({ checked: false }),
    thinkingEffortSelect: createElement({ value: "medium", disabled: true }),
    normalModelMenu: createElement(),
    normalModelMenuButton: createElement(),
    normalModelMenuValue,
    normalModelMenuMeta,
    normalModelMenuList,
    normalModelSelect: createElement({ value: "" }),
};

export { createMenuOption };
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockFeedback.mjs").write_text(
        """
export function showToast() {
    globalThis.__notifications.push(arguments[0]);
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
const translations = {
    "composer.error.image_input_unsupported": "{agent} is currently configured as not supporting image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model.",
    "composer.error.image_input_unknown": "Cannot confirm whether {agent} supports image input. Remove the image, or go to Settings > Model and set Image Input to Supports image input for this model.",
    "composer.toast.send_blocked_title": "Send Blocked",
};

export function t(key) {
    return translations[key] || key;
}

export function formatMessage(key, values = {}) {
    return Object.entries(values).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockLogger.mjs").write_text(
        """
export function sysLog(message, tone = "log-info") {
    globalThis.__logs.push({ message, tone });
}
""".strip(),
        encoding="utf-8",
    )
    return temp_dir
