/**
 * components/rounds/workflow.js
 * Workflow panel synchronization with active round.
 */
import { els } from '../../utils/dom.js';
import { state } from '../../core/state.js';
import { renderNativeDAG } from '../workflow.js';
import { roundsState } from './state.js';

export function updateWorkflowByRound(round) {
    if (!els.workflowCount || !els.workflowCollapsed || !els.workflowPanel) return;
    const canvas = document.getElementById('workflow-canvas');

    if (!round) {
        els.workflowCount.textContent = '0';
        els.workflowCollapsed.style.display = 'none';
        els.workflowPanel.style.display = 'none';
        state.instanceRoleMap = {};
        if (canvas) canvas.innerHTML = '';
        return;
    }

    state.instanceRoleMap = round.instance_role_map || {};

    const workflowCount = round.workflows?.length ?? 0;
    els.workflowCount.textContent = String(workflowCount);
    els.workflowPanel.style.display = 'flex';
    els.workflowCollapsed.style.display = 'none';
    if (workflowCount > 0) {
        renderNativeDAG(round.workflows[workflowCount - 1]);
    } else if (canvas) {
        canvas.innerHTML = '<div class="panel-empty">No workflow graph for this round.</div>';
    }
}

export function toggleWorkflow() {
    if (!els.workflowPanel || !els.workflowCollapsed) return;
    const isHidden = els.workflowPanel.style.display === 'none' || els.workflowPanel.style.display === '';
    if (isHidden) {
        els.workflowPanel.style.display = 'flex';
        els.workflowCollapsed.style.display = 'none';
        if (roundsState.currentRound?.workflows?.length > 0) {
            const list = roundsState.currentRound.workflows;
            renderNativeDAG(list[list.length - 1]);
        }
    } else {
        els.workflowPanel.style.display = 'none';
        els.workflowCollapsed.style.display = 'block';
    }
}
