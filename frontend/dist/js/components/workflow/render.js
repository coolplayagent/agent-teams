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
            layerNodes.push({
                id: t,
                title: t,
                role: tasks[t].role_id || t,
                icon: 'A',
                deps: tasks[t].depends_on || [],
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

            const instanceId = currentInstanceForRole(node.role);
            if (instanceId) el.dataset.instanceId = instanceId;

            if (state.activeAgentRoleId === node.role) el.classList.add('running');

            el.innerHTML = `
                <div class="node-icon">${node.icon}</div>
                <div class="node-title">${node.title}</div>
                <div class="node-role">${node.role}</div>
            `;

            el.onclick = () => {
                const latest = currentInstanceForRole(node.role);
                if (latest) el.dataset.instanceId = latest;
                const iid = latest || el.dataset.instanceId || null;
                if (iid) {
                    openAgentPanel(iid, node.role);
                } else {
                    sysLog(`No instance mapped for role: ${node.role}`, 'log-info');
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
