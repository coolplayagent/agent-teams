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
    refreshDagNodeStatuses();
    document.querySelectorAll('.dag-node').forEach(node => {
        node.classList.remove('running');
        const activeInstanceId = state.activeAgentInstanceId;
        if (activeInstanceId) {
            if (node.dataset.instanceId === activeInstanceId) {
                node.classList.add('running');
            }
            return;
        }
        if (node.dataset.role === state.activeAgentRoleId) {
            node.classList.add('running');
        }
    });
}

export function refreshDagNodeStatuses() {
    document.querySelectorAll('.dag-node').forEach(node => {
        const taskId = node.dataset.taskId || '';
        if (taskId) {
            const mapped = state.taskInstanceMap?.[taskId];
            if (mapped) node.dataset.instanceId = mapped;
        }
        const instanceId = node.dataset.instanceId || '';
        const status = resolveNodeStatus(taskId, instanceId);

        STATUS_CLASS_SUFFIXES.forEach(suffix => node.classList.remove(`status-${suffix}`));
        node.classList.add(`status-${status.classSuffix}`);
        node.dataset.status = status.raw;

        const badge = node.querySelector('.node-state');
        if (!badge) return;
        badge.className = `node-state node-state-${status.classSuffix}`;
        badge.textContent = status.label;
    });
}

const STATUS_CLASS_SUFFIXES = [
    'pending',
    'running',
    'completed',
    'failed',
    'timeout',
    'stopped',
    'unknown',
];

function resolveNodeStatus(taskId, instanceId) {
    const raw = taskId ? String(state.taskStatusMap?.[taskId] || '') : '';
    const normalized = normalizeTaskStatus(raw, instanceId);
    return statusMetaFor(normalized);
}

function normalizeTaskStatus(rawStatus, instanceId) {
    if (rawStatus) return rawStatus;
    if (instanceId) return 'completed';
    return 'created';
}

function statusMetaFor(status) {
    switch (status) {
        case 'created':
            return { raw: status, label: 'Pending', classSuffix: 'pending' };
        case 'assigned':
        case 'running':
            return { raw: status, label: 'Running', classSuffix: 'running' };
        case 'completed':
            return { raw: status, label: 'Completed', classSuffix: 'completed' };
        case 'failed':
            return { raw: status, label: 'Failed', classSuffix: 'failed' };
        case 'timeout':
            return { raw: status, label: 'Timeout', classSuffix: 'timeout' };
        case 'stopped':
            return { raw: status, label: 'Stopped', classSuffix: 'stopped' };
        default:
            return { raw: status || 'unknown', label: 'Unknown', classSuffix: 'unknown' };
    }
}
