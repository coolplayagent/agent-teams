# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_subagent_gate_resolved_during_open_does_not_render_stale_card(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_gate_race.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchSessionSubagents() {
    return [];
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {}
export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto() {
    globalThis.__renderStarted();
    await globalThis.__releaseRenderPromise;
    return { messages: [], streamOverlayEntry: null };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
function makeClassList(node) {
    return {
        toggle(name, force) {
            const classes = new Set(String(node.className || "").split(/\\s+/).filter(Boolean));
            if (force === true) {
                classes.add(name);
            } else if (force === false) {
                classes.delete(name);
            } else if (classes.has(name)) {
                classes.delete(name);
            } else {
                classes.add(name);
            }
            node.className = Array.from(classes).join(" ");
        },
    };
}

function makeBody() {
    return {
        innerHTML: "",
        dataset: {},
        children: [],
        scrollTop: 0,
        scrollHeight: 0,
        appendChild(node) {
            this.children.push(node);
            this.scrollHeight = this.children.length;
            return node;
        },
        querySelector(selector) {
            if (selector === ".gate-card") {
                return this.children.find(node => node.className === "gate-card") || null;
            }
            const match = selector.match(/^\\.gate-card\\[data-task-id="([^"]*)"\\]$/);
            if (match) {
                return this.children.find(node => node.className === "gate-card" && node.dataset.taskId === match[1]) || null;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === ".gate-card") {
                return this.children.filter(node => node.className === "gate-card");
            }
            return [];
        },
    };
}

const body = makeBody();
let wrapper = null;

function makeWrapper() {
    const node = {
        className: "",
        classList: null,
        dataset: {},
        set innerHTML(_value) {},
        querySelector(selector) {
            if (selector === ".subagent-session-body") {
                return body;
            }
            if (selector === ".subagent-session-back-btn") {
                return { addEventListener() {} };
            }
            if (
                selector === ".subagent-session-title"
                || selector === ".subagent-session-badge"
                || selector === ".subagent-session-meta"
                || selector === ".subagent-session-loading"
            ) {
                return { className: "", hidden: false, textContent: "" };
            }
            return null;
        },
    };
    node.classList = makeClassList(node);
    wrapper = node;
    return node;
}

function makeGateCard() {
    return {
        className: "",
        dataset: {},
        set innerHTML(_value) {},
        remove() {
            const index = body.children.indexOf(this);
            if (index >= 0) {
                body.children.splice(index, 1);
            }
        },
        querySelector(selector) {
            if (
                selector === ".gate-approve-btn"
                || selector === ".gate-revise-btn"
                || selector === ".gate-submit-revise-btn"
            ) {
                return { addEventListener() {}, disabled: false };
            }
            if (selector === ".gate-feedback-area") {
                return { style: { display: "none" } };
            }
            if (selector === ".gate-feedback-input") {
                return { value: "" };
            }
            return null;
        },
        querySelectorAll(selector) {
            return selector === "button" ? [] : [];
        },
    };
}

export const els = {
    chatContainer: { classList: { toggle() {} } },
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: {
        innerHTML: "",
        appendChild(node) {
            wrapper = node;
            return node;
        },
        querySelector(selector) {
            if (selector === ".subagent-session-view") {
                return wrapper;
            }
            return wrapper?.querySelector?.(selector) || null;
        },
    },
};

globalThis.document = {
    createElement(tagName) {
        return tagName === "section" ? makeWrapper() : makeGateCard();
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
let releaseRender;
globalThis.__releaseRenderPromise = new Promise(resolve => {
    releaseRender = resolve;
});
globalThis.__renderStartedPromise = new Promise(resolve => {
    globalThis.__renderStarted = resolve;
});

const {
    getActiveSubagentSessionStreamContainer,
    removeSubagentGateCard,
    showSubagentGateCard,
} = await import("./subagentSessions.mjs");

const gatePromise = showSubagentGateCard("inst-sub-1", "Reviewer", {
    session_id: "session-1",
    run_id: "subagent_run_1",
    task_id: "task-1",
    summary: "Approve the draft",
});

await globalThis.__renderStartedPromise;
removeSubagentGateCard("inst-sub-1", "task-1");
releaseRender();
await gatePromise;

const container = getActiveSubagentSessionStreamContainer("inst-sub-1");

console.log(JSON.stringify({
    gateCards: container?.querySelectorAll(".gate-card").length || 0,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)

    assert payload["gateCards"] == 0


def test_ensure_session_subagents_syncs_running_streams_for_current_session(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_sync.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [];
}

export async function fetchSessionSubagents() {
    return [
        {
            instance_id: "inst-sub-1",
            role_id: "Explorer",
            run_id: "subagent_run_1",
            title: "Explore history",
            status: "running",
            run_status: "running",
            run_phase: "running",
            last_event_id: 9,
            checkpoint_event_id: 7,
            stream_connected: false,
            conversation_id: "conv-1",
        },
    ];
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams(sessionId, records) {
    globalThis.__syncCalls.push({
        sessionId,
        runId: Array.isArray(records) ? records[0]?.runId || null : null,
        runStatus: Array.isArray(records) ? records[0]?.runStatus || null : null,
        lastEventId: Array.isArray(records) ? records[0]?.lastEventId || 0 : 0,
    });
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {
    globalThis.__abortMainSessionRestoreCalls = (globalThis.__abortMainSessionRestoreCalls || 0) + 1;
}

export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto() {
    return { messages: [], streamOverlayEntry: null };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
export const els = {
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: null,
};

globalThis.document = {
    dispatchEvent() {
        return undefined;
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__syncCalls = [];

const { ensureSessionSubagents } = await import("./subagentSessions.mjs");

const rows = await ensureSessionSubagents("session-1", { force: true });

console.log(JSON.stringify({
    rowCount: Array.isArray(rows) ? rows.length : 0,
    syncCalls: globalThis.__syncCalls,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)

    assert payload["rowCount"] == 1
    assert payload["syncCalls"] == [
        {
            "sessionId": "session-1",
            "runId": "subagent_run_1",
            "runStatus": "running",
            "lastEventId": 9,
        }
    ]


def test_ensure_session_subagents_limits_parallel_backend_loads(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_concurrency.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [];
}

export async function fetchSessionSubagents(sessionId) {
    globalThis.__activeLoads += 1;
    globalThis.__maxActiveLoads = Math.max(
        globalThis.__maxActiveLoads,
        globalThis.__activeLoads,
    );
    globalThis.__loadCalls.push(sessionId);
    return await new Promise(resolve => {
        globalThis.__loadResolvers.push(() => {
            globalThis.__activeLoads -= 1;
            resolve([]);
        });
    });
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {
    return undefined;
}

export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto() {
    return { messages: [], streamOverlayEntry: null };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
export const els = {
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: null,
};

globalThis.document = {
    dispatchEvent() {
        return undefined;
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__activeLoads = 0;
globalThis.__maxActiveLoads = 0;
globalThis.__loadCalls = [];
globalThis.__loadResolvers = [];

const { ensureSessionSubagents } = await import("./subagentSessions.mjs");

const promises = Array.from({ length: 5 }, (_, index) => (
    ensureSessionSubagents(`session-${index}`, { force: true })
));
await Promise.resolve();
const callsAfterStart = [...globalThis.__loadCalls];
const activeAfterStart = globalThis.__activeLoads;

while (globalThis.__loadResolvers.length > 0) {
    const resolver = globalThis.__loadResolvers.shift();
    resolver();
    await Promise.resolve();
}
await Promise.all(promises);

console.log(JSON.stringify({
    activeAfterStart,
    callsAfterStart,
    loadCalls: globalThis.__loadCalls,
    maxActiveLoads: globalThis.__maxActiveLoads,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)

    assert payload["activeAfterStart"] == 2
    assert payload["callsAfterStart"] == ["session-0", "session-1"]
    assert payload["loadCalls"] == [
        "session-0",
        "session-1",
        "session-2",
        "session-3",
        "session-4",
    ]
    assert payload["maxActiveLoads"] == 2


def test_subagent_status_update_emits_sidebar_refresh_event(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_status_events.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [];
}

export async function fetchSessionSubagents() {
    return [];
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams(sessionId, records) {
    globalThis.__syncCalls.push({
        sessionId,
        statuses: Array.isArray(records) ? records.map(record => record.runStatus || record.status || "") : [],
    });
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {
    globalThis.__abortMainSessionRestoreCalls = (globalThis.__abortMainSessionRestoreCalls || 0) + 1;
}

export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto() {
    return { messages: [], streamOverlayEntry: null };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
export const els = {
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: null,
};

globalThis.document = {
    dispatchEvent(event) {
        globalThis.__events.push({
            type: event.type,
            detail: event.detail || null,
        });
        return true;
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__events = [];
globalThis.__syncCalls = [];
globalThis.__fetchSessionSubagentsCalls = [];
globalThis.__fetchSessionSubagentsPayload = [];
globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
    }
};

const {
    applySubagentSessionStatusEvent,
    clearNormalModeSubagentParentStopState,
    getSessionSubagentSessions,
    markNormalModeSubagentSessionsRunningForParent,
    markNormalModeSubagentSessionsStoppedForParent,
    openSubagentSession,
    replaceSessionSubagents,
    updateNormalModeSubagentSessionStatus,
} = await import("./subagentSessions.mjs");
const { state } = await import("./mockState.mjs");

replaceSessionSubagents("session-1", [
    {
        instance_id: "inst-sub-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        status: "running",
        run_status: "running",
        conversation_id: "conversation-1",
        checkpoint_event_id: 9,
        last_event_id: 12,
    },
], { emitChange: false });
globalThis.__events = [];

replaceSessionSubagents("session-1", [
    {
        instance_id: "inst-sub-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        status: "completed",
        run_status: "completed",
        run_phase: "finished",
        conversation_id: "conversation-1",
        checkpoint_event_id: 9,
        last_event_id: 12,
    },
], { emitChange: true });
const replaceEvents = [...globalThis.__events];
globalThis.__events = [];

updateNormalModeSubagentSessionStatus("session-1", "inst-sub-1", "failed");
updateNormalModeSubagentSessionStatus("session-1", "inst-sub-1", "failed");
const directEvents = [...globalThis.__events];
globalThis.__events = [];

replaceSessionSubagents("session-1", [
    {
        instance_id: "inst-sub-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        status: "running",
        run_status: "running",
        conversation_id: "conversation-1",
        checkpoint_event_id: 9,
        last_event_id: 12,
    },
], { emitChange: false });
markNormalModeSubagentSessionsStoppedForParent("session-1");
markNormalModeSubagentSessionsRunningForParent("session-1");
const parentEvents = [...globalThis.__events];
globalThis.__events = [];

applySubagentSessionStatusEvent({
    parent_session_id: "session-1",
    parent_run_id: "run-1",
    subagent_run_id: "subagent_run_1",
    subagent_instance_id: "inst-sub-1",
    subagent_role_id: "Explorer",
    title: "Explore",
    status: "stopped",
    run_status: "stopped",
    updated_at: "2026-05-09T00:00:00Z",
}, { run_id: "run-1", session_id: "session-1" });
const statusEventRecords = getSessionSubagentSessions("session-1");
const statusEventEvents = [...globalThis.__events];
globalThis.__events = [];

markNormalModeSubagentSessionsStoppedForParent("session-2");
replaceSessionSubagents("session-2", [
    {
        instance_id: "inst-sub-2",
        role_id: "Explorer",
        run_id: "subagent_run_2",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
const unloadedParentStopRecords = getSessionSubagentSessions("session-2");
await openSubagentSession("session-2", {
    instance_id: "inst-sub-3",
    role_id: "Explorer",
    run_id: "subagent_run_3",
    status: "running",
    run_status: "running",
});
const openedDuringParentStop = state.activeSubagentSession;
markNormalModeSubagentSessionsRunningForParent("session-2");
const resumedAfterUnloadedParentStopRecords = getSessionSubagentSessions("session-2");
const openedAfterParentResume = state.activeSubagentSession;

markNormalModeSubagentSessionsStoppedForParent("session-3");
clearNormalModeSubagentParentStopState("session-3");
replaceSessionSubagents("session-3", [
    {
        instance_id: "inst-sub-4",
        role_id: "Explorer",
        run_id: "subagent_run_4",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
const freshRunRecordsAfterClear = getSessionSubagentSessions("session-3");

replaceSessionSubagents("session-4", [
    {
        instance_id: "inst-sub-5",
        role_id: "Explorer",
        run_id: "subagent_run_5",
        status: "stopped",
        run_status: "stopped",
    },
], { emitChange: false });
markNormalModeSubagentSessionsStoppedForParent("session-4");
markNormalModeSubagentSessionsRunningForParent("session-4");
const individuallyStoppedRecordsAfterParentResume = getSessionSubagentSessions("session-4");

replaceSessionSubagents("session-5", [
    {
        instance_id: "inst-sub-6",
        role_id: "Explorer",
        run_id: "subagent_run_6",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
applySubagentSessionStatusEvent({
    parent_session_id: "session-5",
    parent_run_id: "run-5",
    subagent_run_id: "subagent_run_6",
    subagent_instance_id: "inst-sub-6",
    subagent_role_id: "Explorer",
    title: "Explore",
    status: "stopped",
    run_status: "stopped",
    parent_stop_candidate: true,
    updated_at: "2026-05-09T00:00:00Z",
}, { run_id: "run-5", session_id: "session-5" });
markNormalModeSubagentSessionsStoppedForParent("session-5");
markNormalModeSubagentSessionsRunningForParent("session-5");
const parentStoppedStatusEventRecordsAfterResume = getSessionSubagentSessions("session-5");

replaceSessionSubagents("session-6", [
    {
        instance_id: "inst-sub-7",
        role_id: "Explorer",
        run_id: "subagent_run_7",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
applySubagentSessionStatusEvent({
    parent_session_id: "session-6",
    parent_run_id: "run-6",
    subagent_run_id: "subagent_run_7",
    subagent_instance_id: "inst-sub-7",
    subagent_role_id: "Explorer",
    title: "Explore",
    status: "stopped",
    run_status: "stopped",
    parent_stop_candidate: true,
    updated_at: "2026-05-09T00:00:01Z",
}, { run_id: "subagent_run_7", session_id: "session-6" });
markNormalModeSubagentSessionsStoppedForParent("session-6");
markNormalModeSubagentSessionsRunningForParent("session-6");
const parentStoppedChildRunStatusEventRecordsAfterResume = getSessionSubagentSessions("session-6");

replaceSessionSubagents("session-7", [
    {
        instance_id: "inst-sub-8",
        role_id: "Explorer",
        run_id: "subagent_run_8",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
applySubagentSessionStatusEvent({
    parent_session_id: "session-7",
    subagent_run_id: "subagent_run_8",
    subagent_instance_id: "inst-sub-8",
    subagent_role_id: "Explorer",
    title: "Explore",
    status: "stopped",
    run_status: "stopped",
    updated_at: "2026-05-09T00:00:02Z",
}, { run_id: "subagent_run_8", session_id: "session-7" });
markNormalModeSubagentSessionsStoppedForParent("session-7");
markNormalModeSubagentSessionsRunningForParent("session-7");
const independentlyStoppedStatusEventRecordsAfterParentResume = getSessionSubagentSessions("session-7");

replaceSessionSubagents("session-8", [
    {
        instance_id: "inst-sub-9",
        role_id: "Explorer",
        run_id: "subagent_run_9",
        status: "running",
        run_status: "running",
    },
], { emitChange: false });
markNormalModeSubagentSessionsStoppedForParent("session-8");
markNormalModeSubagentSessionsStoppedForParent("session-8");
markNormalModeSubagentSessionsRunningForParent("session-8");
const repeatedParentStopRecordsAfterResume = getSessionSubagentSessions("session-8");

console.log(JSON.stringify({
    replaceEvents,
    events: directEvents,
    parentEvents,
    statusEventRecords,
    statusEventEvents,
    unloadedParentStopRecords,
    openedDuringParentStop,
    resumedAfterUnloadedParentStopRecords,
    openedAfterParentResume,
    freshRunRecordsAfterClear,
    individuallyStoppedRecordsAfterParentResume,
    parentStoppedStatusEventRecordsAfterResume,
    parentStoppedChildRunStatusEventRecordsAfterResume,
    independentlyStoppedStatusEventRecordsAfterParentResume,
    repeatedParentStopRecordsAfterResume,
    syncCalls: globalThis.__syncCalls,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)

    assert payload["replaceEvents"] == [
        {
            "type": "agent-teams-subagent-session-status-changed",
            "detail": {
                "sessionId": "session-1",
                "instanceId": "",
                "status": "updated",
            },
        },
    ]
    assert payload["events"] == [
        {
            "type": "agent-teams-subagent-session-status-changed",
            "detail": {
                "sessionId": "session-1",
                "instanceId": "inst-sub-1",
                "status": "failed",
            },
        },
    ]
    assert payload["parentEvents"] == [
        {
            "type": "agent-teams-subagent-session-status-changed",
            "detail": {
                "sessionId": "session-1",
                "instanceId": "inst-sub-1",
                "status": "stopped",
            },
        },
        {
            "type": "agent-teams-subagent-session-status-changed",
            "detail": {
                "sessionId": "session-1",
                "instanceId": "inst-sub-1",
                "status": "running",
            },
        },
    ]
    assert payload["statusEventEvents"] == [
        {
            "type": "agent-teams-subagent-session-status-changed",
            "detail": {
                "sessionId": "session-1",
                "instanceId": "inst-sub-1",
                "status": "stopped",
            },
        },
    ]
    assert payload["statusEventRecords"][0]["status"] == "stopped"
    assert payload["statusEventRecords"][0]["runStatus"] == "stopped"
    assert payload["statusEventRecords"][0]["conversationId"] == "conversation-1"
    assert payload["statusEventRecords"][0]["checkpointEventId"] == 9
    assert payload["statusEventRecords"][0]["lastEventId"] == 12
    assert payload["unloadedParentStopRecords"][0]["status"] == "stopped"
    assert payload["unloadedParentStopRecords"][0]["runStatus"] == "stopped"
    assert payload["openedDuringParentStop"]["status"] == "stopped"
    assert payload["openedDuringParentStop"]["runStatus"] == "stopped"
    assert payload["resumedAfterUnloadedParentStopRecords"][0]["status"] == "running"
    assert payload["resumedAfterUnloadedParentStopRecords"][0]["runStatus"] == "running"
    assert payload["openedAfterParentResume"]["status"] == "running"
    assert payload["openedAfterParentResume"]["runStatus"] == "running"
    assert payload["freshRunRecordsAfterClear"][0]["status"] == "running"
    assert payload["freshRunRecordsAfterClear"][0]["runStatus"] == "running"
    assert (
        payload["individuallyStoppedRecordsAfterParentResume"][0]["status"] == "stopped"
    )
    assert (
        payload["individuallyStoppedRecordsAfterParentResume"][0]["runStatus"]
        == "stopped"
    )
    assert (
        payload["parentStoppedStatusEventRecordsAfterResume"][0]["status"] == "running"
    )
    assert (
        payload["parentStoppedStatusEventRecordsAfterResume"][0]["runStatus"]
        == "running"
    )
    assert (
        payload["parentStoppedChildRunStatusEventRecordsAfterResume"][0]["status"]
        == "running"
    )
    assert (
        payload["parentStoppedChildRunStatusEventRecordsAfterResume"][0]["runStatus"]
        == "running"
    )
    assert (
        payload["independentlyStoppedStatusEventRecordsAfterParentResume"][0]["status"]
        == "stopped"
    )
    assert (
        payload["independentlyStoppedStatusEventRecordsAfterParentResume"][0][
            "runStatus"
        ]
        == "stopped"
    )
    assert payload["repeatedParentStopRecordsAfterResume"][0]["status"] == "running"
    assert payload["repeatedParentStopRecordsAfterResume"][0]["runStatus"] == "running"
    assert {
        "sessionId": "session-2",
        "statuses": ["running"],
    } in payload["syncCalls"]
    assert {
        "sessionId": "session-3",
        "statuses": ["running"],
    } in payload["syncCalls"]
    assert {
        "sessionId": "session-7",
        "statuses": ["stopped"],
    } in payload["syncCalls"]
    assert payload["syncCalls"][-1] == {
        "sessionId": "session-8",
        "statuses": ["running"],
    }


def test_background_task_event_records_normal_mode_subagent_immediately(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_background_task.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [];
}

export async function fetchSessionSubagents() {
    globalThis.__subagentFetches += 1;
    return [];
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams(sessionId, records) {
    globalThis.__syncCalls.push({
        sessionId,
        records: Array.isArray(records) ? records.map(record => ({
            instanceId: record.instanceId,
            roleId: record.roleId,
            runId: record.runId,
            status: record.status,
            runStatus: record.runStatus,
            title: record.title,
        })) : [],
    });
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {
    globalThis.__abortMainSessionRestoreCalls = (globalThis.__abortMainSessionRestoreCalls || 0) + 1;
}

export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto() {
    return { messages: [], streamOverlayEntry: null };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
export const els = {
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: null,
};

globalThis.document = {
    dispatchEvent(event) {
        globalThis.__events.push({
            type: event.type,
            detail: event.detail || null,
        });
        return true;
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__events = [];
globalThis.__syncCalls = [];
globalThis.__subagentFetches = 0;
globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
    }
};

const {
    getSessionSubagentSessions,
    rememberNormalModeSubagentFromBackgroundTask,
} = await import("./subagentSessions.mjs");

const remembered = rememberNormalModeSubagentFromBackgroundTask(
    "session-1",
    {
        kind: "subagent",
        subagent_instance_id: "Explorer-abc123",
        subagent_role_id: "Explorer",
        subagent_run_id: "subagent_run_abc123",
        title: "Explore command implementation",
        status: "running",
        updated_at: "2026-04-28T11:00:00Z",
    },
    "background_task_started",
);
const failedRemembered = rememberNormalModeSubagentFromBackgroundTask(
    "session-1",
    {
        kind: "subagent",
        subagent_instance_id: "Explorer-abc123",
        subagent_role_id: "Explorer",
        subagent_run_id: "subagent_run_abc123",
        title: "Explore command implementation",
        status: "failed",
        updated_at: "2026-04-28T11:01:00Z",
    },
    "background_task_completed",
);
await new Promise(resolve => setTimeout(resolve, 25));

console.log(JSON.stringify({
    remembered,
    failedRemembered,
    rows: getSessionSubagentSessions("session-1"),
    events: globalThis.__events,
    syncCalls: globalThis.__syncCalls,
    subagentFetches: globalThis.__subagentFetches,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)

    assert payload["remembered"] is True
    assert payload["failedRemembered"] is True
    assert payload["subagentFetches"] == 0
    assert payload["rows"] == [
        {
            "sessionId": "session-1",
            "instanceId": "Explorer-abc123",
            "roleId": "Explorer",
            "runId": "subagent_run_abc123",
            "title": "Explore command implementation",
            "status": "failed",
            "runStatus": "failed",
            "runPhase": "",
            "subagentKind": "normal",
            "interactive": False,
            "deletable": True,
            "lastEventId": 0,
            "checkpointEventId": 0,
            "streamConnected": False,
            "createdAt": "",
            "updatedAt": "2026-04-28T11:01:00Z",
            "conversationId": "",
        }
    ]
    assert payload["events"]
    assert payload["events"][-1]["detail"]["sessionId"] == "session-1"
    assert payload["syncCalls"][-1]["records"][0]["runId"] == "subagent_run_abc123"
    assert payload["syncCalls"][-1]["records"][0]["status"] == "failed"


def test_terminal_settle_retries_until_history_is_safe(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "subagentSessions.js"
    )
    module_under_test_path = tmp_path / "subagentSessions.mjs"
    runner_path = tmp_path / "runner_terminal_settle.mjs"

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../app/sessionView.js", "./mockRecovery.mjs")
        .replace("../core/stream.js", "./mockStream.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./agentPanel/history.js", "./mockAgentPanelHistory.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [];
}

export async function fetchSessionSubagents() {
    return [];
}

export async function resolveGate() {
    return { status: "ok" };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        """
export function syncNormalModeSubagentStreams() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function abortMainSessionRestore() {
    globalThis.__abortMainSessionRestoreCalls = (globalThis.__abortMainSessionRestoreCalls || 0) + 1;
}

export async function restoreMainSessionView() {
    return {};
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanelHistory.mjs").write_text(
        """
export async function renderInstanceHistoryInto(_body, options = {}) {
    globalThis.__renderCalls.push({
        requireToolBoundary: options.requireToolBoundary === true,
        replaceWhenReady: options.replaceWhenReady === true,
        loadingAtRender: String(_body?.owner?.className || "").includes("is-loading"),
    });
    if (
        options.requireToolBoundary === true
        && globalThis.__renderCalls.filter(item => item.requireToolBoundary === true).length === 1
    ) {
        return { deferred: true };
    }
    return { deferred: false };
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockNavigator.mjs").write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: "session-1",
    activeSubagentSession: null,
    activeView: "main",
    isGenerating: false,
    activeAgentRoleId: null,
    activeAgentInstanceId: null,
};

export function getRoleDisplayName(roleId, { fallback } = {}) {
    return String(roleId || fallback || "Agent");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockDom.mjs").write_text(
        """
function createBodyElement() {
    return {
        innerHTML: "",
        dataset: {},
    };
}

function createSectionElement() {
    const loading = { hidden: true };
    const section = {
        className: "",
        dataset: {},
        _innerHTML: "",
        set innerHTML(value) {
            this._innerHTML = String(value);
        },
        get innerHTML() {
            return this._innerHTML;
        },
        querySelector(selector) {
            if (selector === ".subagent-session-title") return { textContent: "" };
            if (selector === ".subagent-session-badge") return { className: "", textContent: "" };
            if (selector === ".subagent-session-meta") return { textContent: "" };
            if (selector === ".subagent-session-loading") return loading;
            if (selector === ".subagent-session-body") return body;
            return null;
        },
    };
    const body = createBodyElement();
    body.owner = section;
    return section;
}

function createChatMessages() {
    return {
        innerHTML: "",
        children: [],
        appendChild(node) {
            this.children.push(node);
            return node;
        },
        querySelector(selector) {
            if (selector === ".subagent-session-view") {
                return this.children[0] || null;
            }
            return this.children[0]?.querySelector?.(selector) || null;
        },
    };
}

export const els = {
    inputContainer: { style: {} },
    promptInput: { disabled: false },
    sendBtn: { disabled: false },
    promptInputHint: { textContent: "" },
    chatMessages: createChatMessages(),
};

globalThis.document = {
    createElement() {
        return createSectionElement();
    },
    dispatchEvent() {
        return undefined;
    },
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        """
export function sysLog() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__renderCalls = [];

const { els } = await import("./mockDom.mjs");
const { openSubagentSession, settleActiveSubagentSessionAfterTerminal } = await import("./subagentSessions.mjs");

await openSubagentSession("session-1", {
    sessionId: "session-1",
    instanceId: "inst-sub-1",
    roleId: "Explorer",
    runId: "subagent_run_1",
    title: "Explore history",
    status: "completed",
});

settleActiveSubagentSessionAfterTerminal("inst-sub-1");
await new Promise(resolve => setTimeout(resolve, 180));

console.log(JSON.stringify({
    renderCalls: globalThis.__renderCalls,
    finalWrapperClassName: String(els.chatMessages.children[0]?.className || ""),
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=3,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)
    assert payload["renderCalls"] == [
        {
            "requireToolBoundary": False,
            "replaceWhenReady": True,
            "loadingAtRender": True,
        },
        {
            "requireToolBoundary": True,
            "replaceWhenReady": True,
            "loadingAtRender": False,
        },
        {
            "requireToolBoundary": True,
            "replaceWhenReady": True,
            "loadingAtRender": False,
        },
    ]
    assert payload["finalWrapperClassName"] == "subagent-session-view"
