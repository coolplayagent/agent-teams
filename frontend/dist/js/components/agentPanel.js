/**
 * components/agentPanel.js
 * Compatibility facade for subagent state shared by rounds and context widgets.
 */
import {
    clearPanels,
    getActiveInstanceId,
    getActiveRoundRunId,
    setActiveInstanceId,
    setActiveRoundContext,
} from './agentPanel/state.js';
import { state } from '../core/state.js';

export function closeAgentPanel() {
    setActiveInstanceId(null);
    state.selectedRoleId = null;
    state.activeAgentRoleId = null;
    state.activeAgentInstanceId = null;
}

export function clearAllPanels() {
    clearPanels();
    setActiveInstanceId(null);
    state.selectedRoleId = null;
    state.activeAgentRoleId = null;
    state.activeAgentInstanceId = null;
}

export function setRoundPendingApprovals(runId, pendingApprovals) {
    setActiveRoundContext(runId, pendingApprovals);
}

export { getActiveInstanceId, getActiveRoundRunId };
