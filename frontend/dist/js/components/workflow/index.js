/**
 * components/workflow/index.js
 * Public API for workflow graph modules.
 */
import { fetchSessionWorkflows } from '../../core/api.js';
import { state } from '../../core/state.js';
import { renderNativeDAG } from './render.js';
import { currentWorkflows, setCurrentWorkflows } from './state.js';

export { currentWorkflows, renderNativeDAG };

export async function loadSessionWorkflows(sessionId) {
    try {
        const workflows = await fetchSessionWorkflows(sessionId);
        setCurrentWorkflows(workflows);
        renderNativeDAG(currentWorkflows.length > 0 ? currentWorkflows[currentWorkflows.length - 1] : null);
    } catch (e) {
        console.error('Failed loading workflows', e);
    }
}

export function updateDagActiveNode() {
    document.querySelectorAll('.dag-node').forEach(node => {
        if (node.dataset.role === state.activeAgentRoleId) {
            node.classList.add('running');
        } else {
            node.classList.remove('running');
        }
    });
}
