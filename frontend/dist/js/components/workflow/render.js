/**
 * components/workflow/render.js
 * DAG render pipeline and interaction wiring.
 */
import { state } from '../../core/state.js';
import { sysLog } from '../../utils/logger.js';
import { openAgentPanel } from '../agentPanel.js';
import { createEdgeSvg, drawEdges } from './edges.js';
import { compactDagForCanvas, computeNodeLevels } from './layout.js';

export function renderNativeDAG(workflow) {
    const canvas = document.getElementById('workflow-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';

    if (!workflow?.tasks || Object.keys(workflow.tasks).length === 0) {
        canvas.innerHTML = '<div class="panel-empty">No workflow graph.</div>';
        return;
    }

    const container = document.createElement('div');
    container.className = 'dag-container';

    const tasks = workflow.tasks;
    const taskIds = Object.keys(tasks);
    const nodeLevels = computeNodeLevels(tasks, taskIds);
    const maxLevel = Math.max(...Object.values(nodeLevels));

    const layers = [];
    for (let level = 0; level <= maxLevel; level += 1) {
        const layerNodes = [];
        for (const t of taskIds) {
            if (nodeLevels[t] !== level) continue;
            const taskDef = tasks[t] || {};
            layerNodes.push({
                id: t,
                title: t,
                taskId: taskDef.task_id || '',
                role: taskDef.role_id || t,
                icon: nodeIconFromTaskName(t),
                deps: taskDef.depends_on || [],
            });
        }
        if (layerNodes.length > 0) layers.push(layerNodes);
    }

    const nodeElements = [];
    layers.forEach(layer => {
        const col = document.createElement('div');
        col.className = 'dag-layer';

        layer.forEach(node => {
            const el = document.createElement('div');
            el.className = 'dag-node';
            el.id = `node-${node.id}`;
            el.dataset.role = node.role;
            if (node.taskId) el.dataset.taskId = node.taskId;

            const instanceId = currentInstanceForTask(node.taskId, node.role);
            if (instanceId) el.dataset.instanceId = instanceId;
            const status = resolveNodeStatus(node.taskId, instanceId);
            const statusMeta = statusMetaFor(status);
            el.dataset.status = status;
            el.classList.add(`status-${statusMeta.classSuffix}`);

            if (state.activeAgentInstanceId) {
                if (el.dataset.instanceId === state.activeAgentInstanceId) {
                    el.classList.add('running');
                }
            } else if (state.activeAgentRoleId === node.role) {
                el.classList.add('running');
            }

            el.innerHTML = `
                <div class="node-icon">${node.icon}</div>
                <div class="node-title">${node.title}</div>
                <div class="node-role">${node.role}</div>
                <div class="node-state node-state-${statusMeta.classSuffix}">${statusMeta.label}</div>
            `;

            el.onclick = () => {
                const latest = currentInstanceForTask(node.taskId, node.role);
                if (latest) el.dataset.instanceId = latest;
                const iid = latest || el.dataset.instanceId || null;
                if (iid) {
                    openAgentPanel(iid, node.role);
                } else {
                    const latestStatus = resolveNodeStatus(node.taskId, latest);
                    const latestMeta = statusMetaFor(latestStatus);
                    sysLog(`Task ${node.title} status: ${latestMeta.label}`, 'log-info');
                }
            };

            nodeElements.push(el);
            col.appendChild(el);
        });
        container.appendChild(col);
    });

    canvas.appendChild(container);
    compactDagForCanvas(canvas, container, nodeElements);

    const svg = createEdgeSvg();
    container.appendChild(svg);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            drawEdges(svg, container, layers);
        });
    });
}

function nodeIconFromTaskName(taskName) {
    const text = String(taskName || '').trim();
    if (!text) return '?';
    return text.charAt(0).toUpperCase();
}

function currentInstanceForTask(taskId, roleId) {
    if (taskId) {
        const byTask = state.taskInstanceMap?.[taskId];
        return byTask || null;
    }
    return currentInstanceForRole(roleId);
}

function resolveNodeStatus(taskId, instanceId) {
    if (state.activeAgentInstanceId && instanceId && state.activeAgentInstanceId === instanceId) {
        return 'running';
    }
    if (taskId) {
        const fromTask = String(state.taskStatusMap?.[taskId] || '');
        if (fromTask) return fromTask;
    }
    if (instanceId) return 'completed';
    return 'created';
}

function statusMetaFor(status) {
    switch (status) {
        case 'created':
            return { label: 'Pending', classSuffix: 'pending' };
        case 'assigned':
        case 'running':
            return { label: 'Running', classSuffix: 'running' };
        case 'completed':
            return { label: 'Completed', classSuffix: 'completed' };
        case 'failed':
            return { label: 'Failed', classSuffix: 'failed' };
        case 'timeout':
            return { label: 'Timeout', classSuffix: 'timeout' };
        case 'stopped':
            return { label: 'Stopped', classSuffix: 'stopped' };
        default:
            return { label: 'Unknown', classSuffix: 'unknown' };
    }
}

function currentInstanceForRole(roleId) {
    if (!roleId) return null;

    const byRole = state.roleInstanceMap?.[roleId];
    if (byRole) return byRole;

    if (!state.instanceRoleMap) return null;
    const entries = Object.entries(state.instanceRoleMap);
    for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
        const [iid, rid] = entries[idx];
        if (rid === roleId) return iid;
    }
    return null;
}

