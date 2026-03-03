/**
 * components/agentPanel/index.js
 * Public API for subagent drawer panels and gate cards.
 */
import { resolveGate } from '../../core/api.js';
import { state } from '../../core/state.js';
import { parseMarkdown } from '../../utils/markdown.js';
import {
    clearDagNodeHighlight,
    closeDrawerUi,
    getDrawer,
    highlightNode,
    openDrawerUi,
} from './dom.js';
import { loadAgentHistory } from './history.js';
import { createPanel } from './panelFactory.js';
import {
    clearPanels,
    forEachPanel,
    getPanel,
    getPanels,
    setActiveInstanceId,
    setPanel,
} from './state.js';

function ensurePanel(instanceId, roleId) {
    let panel = getPanel(instanceId);
    if (!panel) {
        panel = createPanel(instanceId, roleId, closeAgentPanel);
        if (!panel) return null;
        setPanel(instanceId, panel);
    }
    return panel;
}

export function openAgentPanel(instanceId, roleId) {
    const drawer = getDrawer();
    if (!drawer) return;

    forEachPanel((p, id) => {
        if (id !== instanceId) p.panelEl.style.display = 'none';
    });

    const existing = getPanel(instanceId);
    const panel = ensurePanel(instanceId, roleId);
    if (!panel) return;
    if (!existing && state.currentSessionId) {
        void loadAgentHistory(instanceId);
    }

    panel.panelEl.style.display = 'flex';
    setActiveInstanceId(instanceId);
    openDrawerUi();
    highlightNode(roleId, instanceId);
}

export function closeAgentPanel() {
    closeDrawerUi();
    setActiveInstanceId(null);
    clearDagNodeHighlight();
}

export function clearAllPanels() {
    if (!getDrawer()) return;
    forEachPanel(p => p.panelEl.remove());
    clearPanels();
    setActiveInstanceId(null);
    closeDrawerUi();
}

export function getPanelScrollContainer(instanceId, roleId) {
    const panel = ensurePanel(instanceId, roleId);
    return panel ? panel.scrollEl : null;
}

export function showGateCard(instanceId, roleId, gatePayload) {
    openAgentPanel(instanceId, roleId);
    const panel = getPanel(instanceId);
    if (!panel) return;

    panel.scrollEl.querySelectorAll('.gate-card').forEach(c => c.remove());
    const { run_id, task_id, summary, role_id } = gatePayload;

    const card = document.createElement('div');
    card.className = 'gate-card';
    card.dataset.taskId = task_id;
    card.innerHTML = `
        <div class="gate-header">Sub-task completed - please confirm</div>
        <div class="gate-summary">${parseMarkdown(summary || '')}</div>
        <div class="gate-role">Role: <strong>${role_id || roleId || ''}</strong></div>
        <div class="gate-actions">
            <button class="gate-approve-btn">Approve</button>
            <button class="gate-revise-btn">Request Revision</button>
        </div>
        <div class="gate-feedback-area" style="display:none">
            <textarea class="gate-feedback-input" placeholder="Please describe required changes..." rows="3"></textarea>
            <button class="gate-submit-revise-btn">Submit</button>
        </div>
    `;

    async function doResolve(action, feedback = '') {
        card.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
            await resolveGate(run_id || state.activeRunId, task_id, action, feedback);
        } catch (e) {
            card.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
    }

    const approveBtn = card.querySelector('.gate-approve-btn');
    const reviseBtn = card.querySelector('.gate-revise-btn');
    const submitBtn = card.querySelector('.gate-submit-revise-btn');

    if (approveBtn) approveBtn.onclick = () => doResolve('approve');
    if (reviseBtn) {
        reviseBtn.onclick = () => {
            const area = card.querySelector('.gate-feedback-area');
            area.style.display = area.style.display === 'none' ? 'block' : 'none';
        };
    }
    if (submitBtn) {
        submitBtn.onclick = () => {
            const feedback = card.querySelector('.gate-feedback-input').value.trim();
            void doResolve('revise', feedback);
        };
    }

    panel.scrollEl.appendChild(card);
    panel.scrollEl.scrollTop = panel.scrollEl.scrollHeight;
}

export function removeGateCard(instanceId, taskId) {
    const panel = getPanel(instanceId);
    if (!panel) return;
    const el = panel.scrollEl.querySelector(`.gate-card[data-task-id="${taskId}"]`);
    if (el) el.remove();
}

export { getActiveInstanceId, getPanels } from './state.js';
export { loadAgentHistory } from './history.js';
