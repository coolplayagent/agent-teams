# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess

import pytest


@pytest.mark.timeout(5)
def test_render_instance_history_replace_when_ready_keeps_existing_content(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    )
    module_under_test_path = tmp_path / "history.mjs"
    runner_path = tmp_path / "runner_replace_when_ready.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "../../core/api.js": "./mockApi.mjs",
        "../../core/state.js": "./mockState.mjs",
        "../../utils/i18n.js": "./mockI18n.mjs",
        "../messageRenderer.js": "./mockMessageRenderer.mjs",
        "./state.js": "./mockPanelState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
let resolveMessages = null;
let messagesReleased = false;
const historyMessages = [
    {
        role: "assistant",
        message: {
            parts: [
                {
                    part_kind: "text",
                    content: "new history",
                },
            ],
        },
    },
];

function resolveMessagesIfReady() {
    if (!messagesReleased || typeof resolveMessages !== "function") {
        return;
    }
    resolveMessages(historyMessages);
    resolveMessages = null;
}

export function releaseMessages() {
    messagesReleased = true;
    resolveMessagesIfReady();
}

export async function fetchAgentMessages() {
    return new Promise(resolve => {
        resolveMessages = resolve;
        resolveMessagesIfReady();
    });
}

export async function fetchMemories() {
    return null;
}

export async function fetchRunTokenUsage() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    sessionAgents: [],
    sessionTasks: [],
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function getInstanceStreamOverlay() {
    return null;
}

export function bindStreamOverlayToContainer() {
    return null;
}

export function renderHistoricalMessageList(container, messages) {
    container.innerHTML = `rendered:${messages.length}`;
}
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
    (tmp_path / "mockPanelState.mjs").write_text(
        """
export function getActiveInstanceId() {
    return null;
}

export function getActiveRoundRunId() {
    return "";
}

export function getPanel() {
    return null;
}

export function getPendingApprovalsForPanel() {
    return [];
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.document = {
    createElement() {
        return {
            innerHTML: "",
            dataset: {},
        };
    },
};

const api = await import("./mockApi.mjs");
const { renderInstanceHistoryInto } = await import("./history.mjs");

const container = {
    innerHTML: "old content",
    dataset: {},
};

const renderPromise = renderInstanceHistoryInto(container, {
    sessionId: "session-1",
    instanceId: "inst-1",
    replaceWhenReady: true,
});
const beforeResolve = container.innerHTML;
api.releaseMessages();
await renderPromise;

console.log(JSON.stringify({
    beforeResolve,
    afterResolve: container.innerHTML,
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
    assert payload == {
        "beforeResolve": "old content",
        "afterResolve": "rendered:1",
    }


def test_render_instance_history_binds_overlay_instead_of_replaying_when_history_exists(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    )

    module_under_test_path = tmp_path / "history.mjs"
    runner_path = tmp_path / "runner_bind_overlay.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "../../core/api.js": "./mockApi.mjs",
        "../../core/state.js": "./mockState.mjs",
        "../../utils/i18n.js": "./mockI18n.mjs",
        "../messageRenderer.js": "./mockMessageRenderer.mjs",
        "./state.js": "./mockPanelState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [
        {
            role: 'assistant',
            role_id: 'writer',
            instance_id: 'inst-1',
            message: {
                parts: [{ part_kind: 'text', content: 'already persisted' }],
            },
        },
    ];
}

export async function fetchMemories() {
    return null;
}

export async function fetchRunTokenUsage() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: 'session-1',
    activeRunId: null,
    currentRecoverySnapshot: null,
    sessionTasks: [],
    sessionAgents: [],
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function getInstanceStreamOverlay() {
    return {
        roleId: 'writer',
        instanceId: 'inst-1',
        label: 'Writer',
        parts: [{ kind: 'text', content: 'already persisted' }],
        textStreaming: true,
    };
}

export function bindStreamOverlayToContainer(container, options = {}) {
    globalThis.__bindCalls.push({
        containerId: container.id || '',
        instanceId: options.instanceId || '',
        roleId: options.roleId || '',
        runId: options.runId || '',
    });
}

export function renderHistoricalMessageList(container, messages, options = {}) {
    globalThis.__renderCalls.push({
        containerId: container.id || '',
        messageCount: messages.length,
        streamOverlayEntry: options.streamOverlayEntry || null,
    });
}
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
    (tmp_path / "mockPanelState.mjs").write_text(
        """
export function getActiveInstanceId() {
    return null;
}

export function getActiveRoundRunId() {
    return '';
}

export function getPendingApprovalsForPanel() {
    return [];
}

export function getPanel() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__bindCalls = [];
globalThis.__renderCalls = [];

const { renderInstanceHistoryInto } = await import('./history.mjs');

const container = {
    id: 'subagent-body',
    innerHTML: '',
    dataset: {},
};

await renderInstanceHistoryInto(container, {
    sessionId: 'session-1',
    instanceId: 'inst-1',
    roleId: 'writer',
    runId: 'subagent_run_1',
    overlayMode: 'bind',
});

console.log(JSON.stringify({
    renderCalls: globalThis.__renderCalls,
    bindCalls: globalThis.__bindCalls,
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
        encoding="utf-8",
        timeout=30,
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
            "containerId": "subagent-body",
            "messageCount": 1,
            "streamOverlayEntry": None,
        }
    ]
    assert payload["bindCalls"] == [
        {
            "containerId": "subagent-body",
            "instanceId": "inst-1",
            "roleId": "writer",
            "runId": "subagent_run_1",
        }
    ]


def test_render_instance_history_defers_terminal_repaint_until_tool_results_are_persisted(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    )

    module_under_test_path = tmp_path / "history.mjs"
    runner_path = tmp_path / "runner_deferred_terminal.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "../../core/api.js": "./mockApi.mjs",
        "../../core/state.js": "./mockState.mjs",
        "../../utils/i18n.js": "./mockI18n.mjs",
        "../messageRenderer.js": "./mockMessageRenderer.mjs",
        "./state.js": "./mockPanelState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [
        {
            role: 'assistant',
            role_id: 'writer',
            instance_id: 'inst-1',
            message: {
                parts: [
                    {
                        part_kind: 'tool-call',
                        tool_name: 'shell',
                        tool_call_id: 'call-1',
                        args: { command: 'sleep 60' },
                    },
                ],
            },
        },
    ];
}

export async function fetchMemories() {
    return null;
}

export async function fetchRunTokenUsage() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: 'session-1',
    activeRunId: null,
    currentRecoverySnapshot: null,
    sessionTasks: [],
    sessionAgents: [],
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function getInstanceStreamOverlay() {
    return null;
}

export function bindStreamOverlayToContainer() {
    return null;
}

export function renderHistoricalMessageList() {
    globalThis.__renderCalls += 1;
}
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
    (tmp_path / "mockPanelState.mjs").write_text(
        """
export function getActiveInstanceId() {
    return null;
}

export function getActiveRoundRunId() {
    return '';
}

export function getPendingApprovalsForPanel() {
    return [];
}

export function getPanel() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__renderCalls = 0;

const { renderInstanceHistoryInto } = await import('./history.mjs');

const container = {
    innerHTML: 'existing-live-dom',
    dataset: {},
};

const result = await renderInstanceHistoryInto(container, {
    sessionId: 'session-1',
    instanceId: 'inst-1',
    runId: 'subagent_run_1',
    requireToolBoundary: true,
});

console.log(JSON.stringify({
    result,
    innerHTML: container.innerHTML,
    renderCalls: globalThis.__renderCalls,
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
        encoding="utf-8",
        timeout=30,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)
    assert payload["result"]["deferred"] is True
    assert payload["innerHTML"] == "existing-live-dom"
    assert payload["renderCalls"] == 0


def test_render_instance_history_uses_separate_overlay_for_running_child_session(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    )

    module_under_test_path = tmp_path / "history.mjs"
    runner_path = tmp_path / "runner_separate_overlay.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "../../core/api.js": "./mockApi.mjs",
        "../../core/state.js": "./mockState.mjs",
        "../../utils/i18n.js": "./mockI18n.mjs",
        "../messageRenderer.js": "./mockMessageRenderer.mjs",
        "./state.js": "./mockPanelState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [
        {
            role: 'assistant',
            role_id: 'writer',
            instance_id: 'inst-1',
            message: {
                parts: [{ part_kind: 'text', content: 'already persisted' }],
            },
        },
    ];
}

export async function fetchMemories() {
    return null;
}

export async function fetchRunTokenUsage() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: 'session-1',
    activeRunId: null,
    currentRecoverySnapshot: null,
    sessionTasks: [],
    sessionAgents: [],
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function getInstanceStreamOverlay() {
    return {
        roleId: 'writer',
        instanceId: 'inst-1',
        label: 'Writer',
        parts: [{ kind: 'text', content: 'live tail' }],
        textStreaming: true,
    };
}

export function bindStreamOverlayToContainer() {
    globalThis.__bindCalls += 1;
}

export function renderHistoricalMessageList(_container, messages, options = {}) {
    globalThis.__renderCalls.push({
        messageCount: messages.length,
        separateOverlayMessage: options.separateOverlayMessage === true,
        streamOverlayEntry: options.streamOverlayEntry || null,
    });
}
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
    (tmp_path / "mockPanelState.mjs").write_text(
        """
export function getActiveInstanceId() {
    return null;
}

export function getActiveRoundRunId() {
    return '';
}

export function getPendingApprovalsForPanel() {
    return [];
}

export function getPanel() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__renderCalls = [];
globalThis.__bindCalls = 0;

const { renderInstanceHistoryInto } = await import('./history.mjs');

await renderInstanceHistoryInto(
    {
        innerHTML: '',
        dataset: {},
    },
    {
        sessionId: 'session-1',
        instanceId: 'inst-1',
        runId: 'subagent_run_1',
        roleId: 'writer',
        overlayMode: 'separate',
        status: 'running',
        runStatus: 'running',
    },
);

console.log(JSON.stringify({
    renderCalls: globalThis.__renderCalls,
    bindCalls: globalThis.__bindCalls,
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
        encoding="utf-8",
        timeout=30,
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
            "messageCount": 1,
            "separateOverlayMessage": True,
            "streamOverlayEntry": {
                "roleId": "writer",
                "instanceId": "inst-1",
                "label": "Writer",
                "parts": [{"kind": "text", "content": "live tail"}],
                "textStreaming": True,
            },
        }
    ]
    assert payload["bindCalls"] == 0


def test_render_instance_history_ignores_overlay_for_completed_child_session(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    )

    module_under_test_path = tmp_path / "history.mjs"
    runner_path = tmp_path / "runner_completed_overlay.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "../../core/api.js": "./mockApi.mjs",
        "../../core/state.js": "./mockState.mjs",
        "../../utils/i18n.js": "./mockI18n.mjs",
        "../messageRenderer.js": "./mockMessageRenderer.mjs",
        "./state.js": "./mockPanelState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockApi.mjs").write_text(
        """
export async function fetchAgentMessages() {
    return [
        {
            role: 'assistant',
            role_id: 'writer',
            instance_id: 'inst-1',
            message: {
                parts: [{ part_kind: 'text', content: 'persisted only' }],
            },
        },
    ];
}

export async function fetchMemories() {
    return null;
}

export async function fetchRunTokenUsage() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    currentSessionId: 'session-1',
    activeRunId: null,
    currentRecoverySnapshot: null,
    sessionTasks: [],
    sessionAgents: [],
};
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function getInstanceStreamOverlay() {
    return {
        roleId: 'writer',
        instanceId: 'inst-1',
        label: 'Writer',
        parts: [{ kind: 'text', content: 'stale live tail' }],
        textStreaming: true,
    };
}

export function bindStreamOverlayToContainer() {
    globalThis.__bindCalls += 1;
}

export function renderHistoricalMessageList(_container, messages, options = {}) {
    globalThis.__renderCalls.push({
        messageCount: messages.length,
        separateOverlayMessage: options.separateOverlayMessage === true,
        streamOverlayEntry: options.streamOverlayEntry || null,
    });
}
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
    (tmp_path / "mockPanelState.mjs").write_text(
        """
export function getActiveInstanceId() {
    return null;
}

export function getActiveRoundRunId() {
    return '';
}

export function getPendingApprovalsForPanel() {
    return [];
}

export function getPanel() {
    return null;
}
""".strip(),
        encoding="utf-8",
    )

    runner_path.write_text(
        """
globalThis.__renderCalls = [];
globalThis.__bindCalls = 0;

const { renderInstanceHistoryInto } = await import('./history.mjs');

await renderInstanceHistoryInto(
    {
        innerHTML: '',
        dataset: {},
    },
    {
        sessionId: 'session-1',
        instanceId: 'inst-1',
        runId: 'subagent_run_1',
        roleId: 'writer',
        overlayMode: 'separate',
        status: 'completed',
        runStatus: 'completed',
        runPhase: 'terminal',
    },
);

console.log(JSON.stringify({
    renderCalls: globalThis.__renderCalls,
    bindCalls: globalThis.__bindCalls,
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
        encoding="utf-8",
        timeout=30,
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
            "messageCount": 1,
            "separateOverlayMessage": True,
            "streamOverlayEntry": None,
        }
    ]
    assert payload["bindCalls"] == 0
