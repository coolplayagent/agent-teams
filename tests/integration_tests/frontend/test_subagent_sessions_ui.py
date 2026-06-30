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
