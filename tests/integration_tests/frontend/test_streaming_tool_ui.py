# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_live_streaming_tool_overlay_skips_processed_group_summary() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    history_script = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "history.js"
    ).read_text(encoding="utf-8")

    assert (
        "shouldCollapseIntermediateMessages(filteredOverlayEntry, options)"
        in history_script
    )
    assert "!hasVisibleFailedToolBlock(container)" not in history_script
    assert "const filteredOverlayEntry = filterPersistedOverlayParts(" in history_script
    assert (
        "function classifyOverlayPartPersistence(part, context = {})" in history_script
    )
    assert "const lastPersistedPartIndex = classifiedParts.reduce" in history_script
    assert "index > lastPersistedPartIndex && item.keep === true" in history_script
    assert (
        "function normalizeCanonicalHistoryStreamKey(options = {}) {" in history_script
    )
    assert "options.canonicalStreamKey" in history_script
    assert (
        "function resolveOverlayStreamKeys(streamOverlayEntry, runId, options = {}) {"
        in history_script
    )
    assert (
        "function shouldCollapseIntermediateMessages(streamOverlayEntry, options = {}) {"
        in history_script
    )
    assert (
        "const lifecycleStatus = String(options.status || '').trim().toLowerCase();"
        in history_script
    )
    assert (
        "const runStatus = String(options.runStatus || '').trim().toLowerCase();"
        in history_script
    )
    assert "const isLatestRound = options.isLatestRound === true;" in history_script
    assert (
        "const runPhase = String(options.runPhase || '').trim().toLowerCase();"
        in history_script
    )
    assert (
        "const isTerminalStatus = isTerminalRunStatus(lifecycleStatus)"
        in history_script
    )
    assert "|| isTerminalRunStatus(runStatus)" in history_script
    assert "const hasFinalOutput = options.hasFinalOutput === true;" in history_script
    assert (
        "const timelineView = String(options.timelineView || '').trim();"
        in history_script
    )
    assert "const shouldCollapseTerminalWork = isTerminalStatus" in history_script
    assert "if (isLatestRound && !isTerminalStatus) {" in history_script
    assert "if (!hasFinalOutput && !shouldCollapseTerminalWork) {" in history_script
    assert "hasFinalVisibleMessage" not in history_script
    assert "if (streamOverlayEntry.textStreaming === true) {" in history_script
    assert "function isTerminalRunStatus(runStatus)" in history_script
    assert "'terminal'," in history_script
    assert "'idle'," in history_script
    assert "status === 'pending'" in history_script
    assert "status === 'running'" in history_script
    assert "approvalStatus === 'requested'" in history_script
    assert "function isApprovedApprovalStatus(value)" in history_script
    assert "approvalStatus === 'approve_exact'" in history_script


def test_main_agent_tool_event_routes_to_coordinator_before_role_options_load(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    tool_events_source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "core"
        / "eventRouter"
        / "toolEvents.js"
    ).read_text(encoding="utf-8")
    replacements = {
        "../../app/retryStatus.js": "./mockRetryStatus.mjs",
        "../stream.js": "./mockStream.mjs",
        "../../app/recovery.js": "./mockRecovery.mjs",
        "../../utils/logger.js": "./mockLogger.mjs",
        "../../components/messageRenderer.js": "./mockMessageRenderer.mjs",
        "../../components/agentPanel.js": "./mockAgentPanel.mjs",
        "../../components/subagentSessions.js": "./mockSubagentSessions.mjs",
        "../state.js": "./state.mjs",
        "./utils.js": "./mockUtils.mjs",
    }
    for original, replacement in replacements.items():
        tool_events_source = tool_events_source.replace(original, replacement)
    (tmp_path / "toolEvents.mjs").write_text(tool_events_source, encoding="utf-8")
    (tmp_path / "state.mjs").write_text(
        (repo_root / "frontend" / "dist" / "js" / "core" / "state.js").read_text(
            encoding="utf-8"
        ),
        encoding="utf-8",
    )
    (tmp_path / "mockRetryStatus.mjs").write_text(
        "export function markLlmRetrySucceeded() {}\n",
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        "export function scheduleCurrentSessionSubagentDiscovery() { globalThis.__discoveryCalls += 1; }\n",
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function markToolApprovalRequested() {}
export function markToolApprovalResolved() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        "export function sysLog() {}\n",
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function applyStreamOverlayEvent() { globalThis.__overlayCalls += 1; }
export function appendToolCallBlock(container, streamKey, toolName, args, toolCallId, options) {
  globalThis.__appendCalls.push({ containerId: container.id, streamKey, toolName, args, toolCallId, options });
}
export function attachToolApprovalControls() { return true; }
export function markToolApprovalResolved() {}
export function markToolInputValidationFailed() { return true; }
export function updateToolResult() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function getActiveInstanceId() { return null; }
export function getPanelScrollContainer() {
  globalThis.__panelContainerCalls += 1;
  return { id: 'panel' };
}
export function openAgentPanel() { globalThis.__openPanelCalls += 1; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockSubagentSessions.mjs").write_text(
        "export function getActiveSubagentSessionStreamContainer() { return null; }\n",
        encoding="utf-8",
    )
    (tmp_path / "mockUtils.mjs").write_text(
        "export function coordinatorContainerFor() { return { id: 'coordinator' }; }\n",
        encoding="utf-8",
    )
    (tmp_path / "runner.mjs").write_text(
        """
globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
};
globalThis.__appendCalls = [];
globalThis.__overlayCalls = 0;
globalThis.__openPanelCalls = 0;
globalThis.__panelContainerCalls = 0;
globalThis.__discoveryCalls = 0;

const { state } = await import('./state.mjs');
const { handleToolCall } = await import('./toolEvents.mjs');

state.currentSessionMode = 'normal';
state.currentSessionId = 'session-1';
state.mainAgentRoleId = null;
state.currentNormalRootRoleId = null;
state.runPrimaryRoleMap = {};

handleToolCall(
  {
    tool_name: 'spawn_subagent',
    tool_call_id: 'call-skills',
    args: { description: 'Explore skills implementation' },
    role_id: 'MainAgent',
    instance_id: 'main-instance',
  },
  { run_id: 'run-1', event_id: 1 },
  'main-instance',
  'MainAgent',
);

console.log(JSON.stringify({
  appendCalls: globalThis.__appendCalls,
  overlayCalls: globalThis.__overlayCalls,
  openPanelCalls: globalThis.__openPanelCalls,
  panelContainerCalls: globalThis.__panelContainerCalls,
  discoveryCalls: globalThis.__discoveryCalls,
}));
""".strip(),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["node", "runner.mjs"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["appendCalls"] == [
        {
            "containerId": "coordinator",
            "streamKey": "primary",
            "toolName": "spawn_subagent",
            "args": {"description": "Explore skills implementation"},
            "toolCallId": "call-skills",
            "options": {
                "runId": "run-1",
                "roleId": "MainAgent",
                "label": "Main Agent",
            },
        }
    ]
    assert payload["overlayCalls"] == 0
    assert payload["openPanelCalls"] == 0
    assert payload["panelContainerCalls"] == 0
    assert payload["discoveryCalls"] == 1


def test_visible_normal_subagent_tool_call_uses_live_renderer_overlay(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    tool_events_source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "core"
        / "eventRouter"
        / "toolEvents.js"
    ).read_text(encoding="utf-8")
    replacements = {
        "../../app/retryStatus.js": "./mockRetryStatus.mjs",
        "../stream.js": "./mockStream.mjs",
        "../../app/recovery.js": "./mockRecovery.mjs",
        "../../utils/logger.js": "./mockLogger.mjs",
        "../../components/messageRenderer.js": "./mockMessageRenderer.mjs",
        "../../components/agentPanel.js": "./mockAgentPanel.mjs",
        "../../components/subagentSessions.js": "./mockSubagentSessions.mjs",
        "../state.js": "./state.mjs",
        "./utils.js": "./mockUtils.mjs",
    }
    for original, replacement in replacements.items():
        tool_events_source = tool_events_source.replace(original, replacement)
    (tmp_path / "toolEvents.mjs").write_text(tool_events_source, encoding="utf-8")
    (tmp_path / "state.mjs").write_text(
        (repo_root / "frontend" / "dist" / "js" / "core" / "state.js").read_text(
            encoding="utf-8"
        ),
        encoding="utf-8",
    )
    (tmp_path / "mockRetryStatus.mjs").write_text(
        "export function markLlmRetrySucceeded() {}\n",
        encoding="utf-8",
    )
    (tmp_path / "mockStream.mjs").write_text(
        "export function scheduleCurrentSessionSubagentDiscovery() { globalThis.__discoveryCalls += 1; }\n",
        encoding="utf-8",
    )
    (tmp_path / "mockRecovery.mjs").write_text(
        """
export function markToolApprovalRequested() {}
export function markToolApprovalResolved() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockLogger.mjs").write_text(
        "export function sysLog() {}\n",
        encoding="utf-8",
    )
    (tmp_path / "mockMessageRenderer.mjs").write_text(
        """
export function applyStreamOverlayEvent(evType, payload, options) {
  globalThis.__overlayCalls.push({ evType, payload, options });
}
export function appendToolCallBlock(container, streamKey, toolName, args, toolCallId, options) {
  globalThis.__appendCalls.push({ containerId: container.id, streamKey, toolName, args, toolCallId, options });
}
export function attachToolApprovalControls() { return true; }
export function markToolApprovalResolved() {}
export function markToolInputValidationFailed() { return true; }
export function updateToolResult() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockAgentPanel.mjs").write_text(
        """
export function getActiveInstanceId() { return null; }
export function getPanelScrollContainer() { return { id: 'panel' }; }
export function openAgentPanel() { globalThis.__openPanelCalls += 1; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockSubagentSessions.mjs").write_text(
        "export function getActiveSubagentSessionStreamContainer() { return { id: 'subagent-body' }; }\n",
        encoding="utf-8",
    )
    (tmp_path / "mockUtils.mjs").write_text(
        "export function coordinatorContainerFor() { return { id: 'coordinator' }; }\n",
        encoding="utf-8",
    )
    (tmp_path / "runner.mjs").write_text(
        """
globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
};
globalThis.__appendCalls = [];
globalThis.__overlayCalls = [];
globalThis.__openPanelCalls = 0;
globalThis.__discoveryCalls = 0;

const { state } = await import('./state.mjs');
const { handleToolCall } = await import('./toolEvents.mjs');

state.currentSessionMode = 'normal';
state.currentSessionId = 'session-1';
state.mainAgentRoleId = 'MainAgent';
state.currentNormalRootRoleId = 'MainAgent';
state.runPrimaryRoleMap = {};

handleToolCall(
  {
    tool_name: 'shell',
    tool_call_id: 'call-visible-subagent',
    args: { command: 'date' },
    role_id: 'Writer',
    instance_id: 'inst-subagent',
  },
  { run_id: 'subagent_run_live', event_id: 77 },
  'inst-subagent',
  'Writer',
);

console.log(JSON.stringify({
  appendCalls: globalThis.__appendCalls,
  overlayCalls: globalThis.__overlayCalls,
  openPanelCalls: globalThis.__openPanelCalls,
  discoveryCalls: globalThis.__discoveryCalls,
}));
""".strip(),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["node", "runner.mjs"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["overlayCalls"] == []
    assert payload["appendCalls"] == [
        {
            "containerId": "subagent-body",
            "streamKey": "inst-subagent",
            "toolName": "shell",
            "args": {"command": "date"},
            "toolCallId": "call-visible-subagent",
            "options": {
                "runId": "subagent_run_live",
                "roleId": "Writer",
                "label": "Writer",
            },
        }
    ]
    assert payload["openPanelCalls"] == 0
    assert payload["discoveryCalls"] == 0
