# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_agent_panel_right_drawer_entrypoints_are_removed() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    components_dir = (
        repo_root / "frontend" / "dist" / "js" / "components" / "agentPanel"
    )
    shared_dom_source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "dom.js"
    ).read_text(encoding="utf-8")

    assert not (components_dir / "index.js").exists()
    assert not (components_dir / "dom.js").exists()
    assert not (components_dir / "panelFactory.js").exists()
    assert 'agentDrawer: qs("#agent-drawer")' not in shared_dom_source
    assert 'rightRail: qs("#right-rail")' not in shared_dom_source


def test_agent_panel_facade_only_resets_shared_subagent_state(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "agentPanel.js"
    )
    module_under_test_path = tmp_path / "agentPanel.mjs"
    runner_path = tmp_path / "runner.mjs"

    source_text = source_path.read_text(encoding="utf-8")
    for original, replacement in {
        "./agentPanel/state.js": "./mockPanelState.mjs",
        "../core/state.js": "./mockState.mjs",
    }.items():
        source_text = source_text.replace(original, replacement)
    module_under_test_path.write_text(source_text, encoding="utf-8")

    (tmp_path / "mockPanelState.mjs").write_text(
        """
let activeInstanceId = 'writer-1';
let activeRoundRunId = '';

export function clearPanels() {
    globalThis.__clearPanelsCalls += 1;
}

export function getActiveInstanceId() {
    return activeInstanceId;
}

export function getActiveRoundRunId() {
    return activeRoundRunId;
}

export function setActiveInstanceId(instanceId) {
    activeInstanceId = instanceId;
    globalThis.__setActiveInstanceIdCalls.push(instanceId);
}

export function setActiveRoundContext(runId, pendingApprovals) {
    activeRoundRunId = runId;
    globalThis.__setRoundContextCalls.push({ runId, pendingApprovals });
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export const state = {
    selectedRoleId: 'writer',
    activeAgentRoleId: 'writer',
    activeAgentInstanceId: 'writer-1',
};
""".strip(),
        encoding="utf-8",
    )
    runner_path.write_text(
        """
globalThis.__clearPanelsCalls = 0;
globalThis.__setActiveInstanceIdCalls = [];
globalThis.__setRoundContextCalls = [];

const {
    clearAllPanels,
    closeAgentPanel,
    getActiveInstanceId,
    getActiveRoundRunId,
    setRoundPendingApprovals,
} = await import('./agentPanel.mjs');
const { state } = await import('./mockState.mjs');

closeAgentPanel();
const afterClose = {
    activeInstanceId: getActiveInstanceId(),
    selectedRoleId: state.selectedRoleId,
    activeAgentRoleId: state.activeAgentRoleId,
    activeAgentInstanceId: state.activeAgentInstanceId,
};

state.selectedRoleId = 'reviewer';
state.activeAgentRoleId = 'reviewer';
state.activeAgentInstanceId = 'reviewer-1';
clearAllPanels();
setRoundPendingApprovals('run-1', [{ id: 'approval-1' }]);

console.log(JSON.stringify({
    afterClose,
    activeInstanceId: getActiveInstanceId(),
    activeRoundRunId: getActiveRoundRunId(),
    clearPanelsCalls: globalThis.__clearPanelsCalls,
    setActiveInstanceIdCalls: globalThis.__setActiveInstanceIdCalls,
    setRoundContextCalls: globalThis.__setRoundContextCalls,
    state,
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
        timeout=5,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)
    assert payload == {
        "afterClose": {
            "activeInstanceId": None,
            "selectedRoleId": None,
            "activeAgentRoleId": None,
            "activeAgentInstanceId": None,
        },
        "activeInstanceId": None,
        "activeRoundRunId": "run-1",
        "clearPanelsCalls": 1,
        "setActiveInstanceIdCalls": [None, None],
        "setRoundContextCalls": [
            {"runId": "run-1", "pendingApprovals": [{"id": "approval-1"}]}
        ],
        "state": {
            "selectedRoleId": None,
            "activeAgentRoleId": None,
            "activeAgentInstanceId": None,
        },
    }
