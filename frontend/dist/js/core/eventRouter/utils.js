/**
 * core/eventRouter/utils.js
 * Shared helpers used by SSE event handlers.
 */
import { state } from '../state.js';
import { els } from '../../utils/dom.js';
import { sysLog } from '../../utils/logger.js';
import { renderNativeDAG } from '../../components/workflow.js';
import { dispatchHumanTask } from '../api.js';

export const COORDINATOR_ROLE = 'coordinator_agent';

export function coordinatorContainerFor(eventMeta) {
    const runId = eventMeta?.trace_id || eventMeta?.run_id || state.activeRunId;
    if (runId) {
        const section = document.querySelector(`.session-round-section[data-run-id="${runId}"]`);
        if (section) return section;
    }
    const live = document.querySelector('.session-round-section[data-run-id="__live__"]');
    if (live) return live;
    return els.chatMessages;
}

export function tryRenderLiveDAG(result) {
    try {
        let envelope = typeof result === 'string' ? JSON.parse(result) : result;
        if (!envelope) return;
        if (envelope.ok === false) return;
        let data = envelope.data !== undefined ? envelope.data : envelope;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        if (!data || !data.ok || !data.tasks) return;

        const taskMap = {};
        const tasksArr = Array.isArray(data.tasks) ? data.tasks : Object.values(data.tasks);
        for (const t of tasksArr) {
            taskMap[t.task_name || t.task_id] = {
                task_id: t.task_id,
                role_id: t.role_id,
                depends_on: t.depends_on || [],
            };
        }

        const workflow = { tasks: taskMap, workflow_id: data.workflow_id };

        const panel = document.getElementById('workflow-panel');
        if (panel) panel.style.display = 'flex';
        const collapsed = document.getElementById('workflow-collapsed');
        if (collapsed) collapsed.style.display = 'none';

        renderNativeDAG(workflow);
        sysLog(`Live DAG rendered (${Object.keys(taskMap).length} tasks)`);
    } catch (e) {
        console.error('Failed to render live DAG', e);
    }
}

export function renderHumanDispatchPanel(payload) {
    document.querySelectorAll('.human-dispatch-panel').forEach(el => el.remove());
    const container = coordinatorContainerFor({ trace_id: state.activeRunId });
    if (!container) return;

    const panel = document.createElement('div');
    panel.className = 'human-dispatch-panel';

    const tasks = payload.pending_tasks || [];
    const taskRows = tasks.map(t => `
        <div class="dispatch-task-row">
            <span class="dispatch-task-obj">${t.objective || t.task_id}</span>
            <span class="dispatch-task-role">${t.role_id || ''}</span>
            <button class="dispatch-btn" data-task-id="${t.task_id}">&#x25B6; Run</button>
        </div>
    `).join('');

    panel.innerHTML = `
        <div class="dispatch-header">Human orchestration - choose next sub-task</div>
        ${taskRows || '<div class="dispatch-empty">(No pending tasks)</div>'}
    `;

    panel.querySelectorAll('.dispatch-btn').forEach(btn => {
        btn.onclick = async () => {
            const taskId = btn.dataset.taskId;
            if (!state.activeRunId || !state.currentSessionId) return;
            btn.disabled = true;
            btn.textContent = 'Dispatching...';
            try {
                await dispatchHumanTask(state.currentSessionId, state.activeRunId, taskId);
            } catch (e) {
                sysLog(`Dispatch failed: ${e.message}`, 'log-error');
                btn.disabled = false;
                btn.textContent = 'Run';
            }
        };
    });

    container.appendChild(panel);
    container.scrollTop = container.scrollHeight;
}
