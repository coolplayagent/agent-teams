/**
 * components/agentPanel/history.js
 * Subagent history loading into an existing panel.
 */
import { fetchAgentMessages } from '../../core/api.js';
import { state } from '../../core/state.js';
import { renderHistoricalMessageList } from '../messageRenderer.js';
import { getPanel } from './state.js';

export async function loadAgentHistory(instanceId, roleId = null) {
    void roleId;
    const panel = getPanel(instanceId);
    if (!panel) return;
    const scrollEl = panel.scrollEl;
    try {
        scrollEl.innerHTML = '<div class="panel-loading">Loading history...</div>';
        const messages = await fetchAgentMessages(state.currentSessionId, instanceId);
        scrollEl.innerHTML = '';
        if (messages.length === 0) {
            scrollEl.innerHTML = '<div class="panel-empty">No messages yet.</div>';
        } else {
            renderHistoricalMessageList(scrollEl, messages);
        }
    } catch (e) {
        scrollEl.innerHTML = '<div class="panel-empty" style="color:var(--danger)">Failed to load history.</div>';
    }
}
