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
