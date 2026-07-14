/**
 * components/subagentRail.js
 * Session-level subagent presence state for the left sidebar.
 */
import { fetchSessionAgents, fetchSessionTasks } from '../core/api.js';
import {
    isPrimaryRoleId,
    isReservedSystemRoleId,
    state,
} from '../core/state.js';
import { rememberOrchestrationSubagentSession } from './subagentSessions.js';
import { sysLog } from '../utils/logger.js';

const RIGHT_RAIL_COLLAPSED_KEY = 'agent_teams_right_rail_collapsed';
let subagentRailLoadingSessionId = '';

function isPrimaryOrReservedRoleId(roleId) {
    return isPrimaryRoleId(roleId) || isReservedSystemRoleId(roleId);
}

export function initializeSubagentRail() {
    localStorage.removeItem(RIGHT_RAIL_COLLAPSED_KEY);
    emitLiveSubagentsChanged({ reason: 'initialize' });
}

export function markSubagentRailLoading(sessionId = state.currentSessionId) {
    const safeSessionId = String(sessionId || '').trim();
    subagentRailLoadingSessionId = safeSessionId;
    emitLiveSubagentsChanged({ reason: 'loading', sessionId: safeSessionId });
}

export function getLiveSubagentSummary(sessionId = state.currentSessionId) {
    const safeSessionId = String(sessionId || '').trim();
    const currentSessionId = String(state.currentSessionId || '').trim();
    const isCurrentSession = !!safeSessionId && safeSessionId === currentSessionId;
    const roles = isCurrentSession ? getDisplaySessionAgents() : [];
    return {
        isLoading: !!(
            safeSessionId
            && subagentRailLoadingSessionId
            && subagentRailLoadingSessionId === safeSessionId
        ),
        count: roles.length,
        runningCount: countRunningSubagentInstances(roles),
    };
}

export async function refreshSubagentRail(
    sessionId = state.currentSessionId,
    { preserveSelection = true, priority = '', forceRefresh = false, signal = null } = {},
) {
    void preserveSelection;
    const safeSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!safeSessionId) {
        state.sessionAgents = [];
        state.sessionTasks = [];
        state.selectedRoleId = null;
        emitLiveSubagentsChanged({ reason: 'empty' });
        return;
    }

    subagentRailLoadingSessionId = safeSessionId;
    emitLiveSubagentsChanged({ reason: 'loading', sessionId: safeSessionId });

    try {
        const [agentsPayload, tasksPayload] = await Promise.all([
            fetchSessionAgents(safeSessionId, {
                priority,
                forceRefresh: forceRefresh === true,
                signal,
            }),
            fetchSessionTasks(safeSessionId, {
                priority,
                forceRefresh: forceRefresh === true,
                signal,
            }),
        ]);
        if (signal?.aborted) return;
        if (state.currentSessionId !== safeSessionId) return;

        state.sessionTasks = normalizeSessionTasks(tasksPayload);
        state.sessionAgents = reconcileSessionAgentsWithTasks(
            normalizeSessionAgents(agentsPayload),
            state.sessionTasks,
        );
        state.sessionAgents.forEach(agent => {
            rememberOrchestrationSubagentSession(safeSessionId, {
                ...agent,
                subagent_kind: 'orchestration',
                interactive: true,
                deletable: false,
            });
        });
        subagentRailLoadingSessionId = '';
        emitLiveSubagentsChanged({ reason: 'refresh', sessionId: safeSessionId });
    } catch (e) {
        if (e?.name === 'AbortError') return;
        if (state.currentSessionId === safeSessionId) {
            subagentRailLoadingSessionId = '';
            emitLiveSubagentsChanged({ reason: 'error', sessionId: safeSessionId });
        }
        sysLog(`Failed to load subagents: ${e.message || e}`, 'log-error');
    } finally {
        if (subagentRailLoadingSessionId === safeSessionId && signal?.aborted) {
            subagentRailLoadingSessionId = '';
        }
    }
}

export function rememberLiveSubagent(instanceId, roleId) {
    const safeInstanceId = String(instanceId || '').trim();
    const safeRoleId = String(roleId || '').trim();
    if (!safeInstanceId || !safeRoleId || isPrimaryOrReservedRoleId(safeRoleId)) return;

    const nowIso = new Date().toISOString();
    const nextAgents = [...(state.sessionAgents || [])];
    const existingIndex = nextAgents.findIndex(agent => agent.role_id === safeRoleId);
    const existingRecord = existingIndex >= 0 ? nextAgents[existingIndex] : null;
    const nextRecord = {
        instance_id: safeInstanceId,
        role_id: safeRoleId,
        run_id: String(existingRecord?.run_id || existingRecord?.runId || state.activeRunId || '').trim(),
        status: 'running',
        created_at: existingIndex >= 0 ? existingRecord.created_at : nowIso,
        updated_at: nowIso,
        runtime_system_prompt: existingIndex >= 0 ? existingRecord.runtime_system_prompt : '',
        runtime_tools_json: existingIndex >= 0 ? existingRecord.runtime_tools_json : '',
        reflection_summary_preview: existingIndex >= 0 ? existingRecord.reflection_summary_preview : '',
        reflection_updated_at: existingIndex >= 0 ? existingRecord.reflection_updated_at : '',
    };
    if (existingIndex >= 0) {
        nextAgents[existingIndex] = {
            ...nextAgents[existingIndex],
            ...nextRecord,
        };
    } else {
        nextAgents.push(nextRecord);
    }
    state.sessionAgents = normalizeSessionAgents(nextAgents);
    if (nextRecord.run_id) {
        rememberOrchestrationSubagentSession(state.currentSessionId, nextRecord);
    }
    emitLiveSubagentsChanged({ reason: 'remember', sessionId: state.currentSessionId });
}

export function markSubagentStatus(instanceId, status) {
    const safeInstanceId = String(instanceId || '').trim();
    if (!safeInstanceId) return;
    state.sessionAgents = (state.sessionAgents || []).map(agent =>
        agent.instance_id === safeInstanceId
            ? {
                ...agent,
                status: String(status || agent.status || 'idle'),
                updated_at: new Date().toISOString(),
            }
            : agent,
    );
    emitLiveSubagentsChanged({ reason: 'status', sessionId: state.currentSessionId });
}

function normalizeSessionAgents(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const latestByRole = new Map();
    rows.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const roleId = String(item.role_id || '').trim();
        const instanceId = String(item.instance_id || '').trim();
        if (!roleId || !instanceId || isPrimaryOrReservedRoleId(roleId)) return;
        const record = {
            instance_id: instanceId,
            role_id: roleId,
            run_id: String(item.run_id || item.runId || ''),
            status: String(item.status || 'idle'),
            created_at: String(item.created_at || ''),
            updated_at: String(item.updated_at || item.created_at || ''),
            runtime_system_prompt: String(item.runtime_system_prompt || ''),
            runtime_tools_json: String(item.runtime_tools_json || ''),
            reflection_summary_preview: String(item.reflection_summary_preview || ''),
            reflection_updated_at: String(item.reflection_updated_at || ''),
        };
        const existing = latestByRole.get(roleId);
        if (!existing || String(record.updated_at).localeCompare(String(existing.updated_at)) >= 0) {
            latestByRole.set(roleId, record);
        }
    });
    return Array.from(latestByRole.values()).sort((left, right) =>
        String(left.role_id || '').localeCompare(String(right.role_id || ''))
    );
}

function normalizeSessionTasks(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
        .filter(item => {
            if (!item || typeof item !== 'object') return false;
            const assignedRoleId = String(item.assigned_role_id || item.role_id || '').trim();
            return !assignedRoleId || !isPrimaryOrReservedRoleId(assignedRoleId);
        })
        .map(item => ({
            task_id: String(item.task_id || ''),
            title: String(item.title || item.task_id || ''),
            assigned_role_id: String(item.assigned_role_id || item.role_id || ''),
            role_id: String(item.assigned_role_id || item.role_id || ''),
            status: String(item.status || 'created'),
            assigned_instance_id: String(item.assigned_instance_id || item.instance_id || ''),
            instance_id: String(item.assigned_instance_id || item.instance_id || ''),
            run_id: String(item.run_id || ''),
            created_at: String(item.created_at || ''),
            updated_at: String(item.updated_at || item.created_at || ''),
            spec_artifact_id: String(item.spec_artifact_id || ''),
            spec_source_task_id: String(item.spec_source_task_id || ''),
            spec_summary: String(item.spec_summary || ''),
            spec_strictness: String(item.spec_strictness || ''),
            evidence_bundle: item.evidence_bundle && typeof item.evidence_bundle === 'object'
                ? item.evidence_bundle
                : null,
        }));
}

function getDisplaySessionAgents() {
    return reconcileSessionAgentsWithTasks(state.sessionAgents, state.sessionTasks);
}

function reconcileSessionAgentsWithTasks(agentsPayload, tasksPayload) {
    const rows = normalizeSessionAgents(agentsPayload);
    const activeTasks = activeRunningTasks(tasksPayload);
    if (activeTasks.length === 0) {
        return rows;
    }

    const latestByRole = new Map(rows.map(agent => [agent.role_id, agent]));
    activeTasks.forEach(task => {
        const roleId = String(task.assigned_role_id || task.role_id || '').trim();
        const instanceId = String(
            task.assigned_instance_id || task.instance_id || '',
        ).trim();
        if (!roleId || !instanceId || isPrimaryOrReservedRoleId(roleId)) {
            return;
        }
        const existing = latestByRole.get(roleId);
        if (!shouldProjectRunningTask(existing, task, instanceId)) {
            return;
        }
        latestByRole.set(roleId, {
            instance_id: instanceId,
            role_id: roleId,
            run_id: existing?.run_id || task.run_id || '',
            status: 'running',
            created_at: existing?.created_at || task.created_at || '',
            updated_at: latestTimestamp(existing?.updated_at || '', task.updated_at || ''),
            runtime_system_prompt: existing?.runtime_system_prompt || '',
            runtime_tools_json: existing?.runtime_tools_json || '',
            reflection_summary_preview: existing?.reflection_summary_preview || '',
            reflection_updated_at: existing?.reflection_updated_at || '',
        });
    });

    return Array.from(latestByRole.values()).sort((left, right) =>
        String(left.role_id || '').localeCompare(String(right.role_id || ''))
    );
}

function activeRunningTasks(tasksPayload) {
    const rows = Array.isArray(tasksPayload) ? tasksPayload : [];
    return rows.filter(task => {
        if (!task || typeof task !== 'object') {
            return false;
        }
        const status = String(task.status || '').trim().toLowerCase();
        const roleId = String(task.assigned_role_id || task.role_id || '').trim();
        const instanceId = String(
            task.assigned_instance_id || task.instance_id || '',
        ).trim();
        return (
            status === 'running'
            && !!roleId
            && !!instanceId
            && !isPrimaryOrReservedRoleId(roleId)
        );
    });
}

function shouldProjectRunningTask(existing, task, instanceId) {
    if (!existing) {
        return true;
    }
    if (String(existing.status || '').trim().toLowerCase() === 'running') {
        return String(existing.instance_id || '').trim() === instanceId
            || timestampIsAfter(
                task.updated_at || task.created_at || '',
                existing.updated_at || existing.created_at || '',
            );
    }
    return timestampIsAfter(
        task.updated_at || task.created_at || '',
        existing.updated_at || existing.created_at || '',
    );
}

function countRunningSubagentInstances(agents) {
    const runningInstanceIds = new Set();
    const rows = Array.isArray(agents) ? agents : [];
    rows.forEach(agent => {
        if (String(agent?.status || '').trim().toLowerCase() !== 'running') {
            return;
        }
        const instanceId = String(agent?.instance_id || '').trim();
        if (instanceId) {
            runningInstanceIds.add(instanceId);
        }
    });
    return runningInstanceIds.size;
}

function latestTimestamp(left, right) {
    const safeLeft = String(left || '');
    const safeRight = String(right || '');
    if (!safeLeft) return safeRight;
    if (!safeRight) return safeLeft;
    return timestampIsAfter(safeRight, safeLeft) ? safeRight : safeLeft;
}

function timestampIsAfter(left, right) {
    const safeLeft = String(left || '').trim();
    const safeRight = String(right || '').trim();
    if (!safeLeft) return false;
    if (!safeRight) return true;

    const leftMs = Date.parse(safeLeft);
    const rightMs = Date.parse(safeRight);
    if (!Number.isNaN(leftMs) && !Number.isNaN(rightMs)) {
        return leftMs > rightMs;
    }
    return safeLeft.localeCompare(safeRight) > 0;
}

function emitLiveSubagentsChanged(detail = {}) {
    if (typeof document?.dispatchEvent !== 'function') {
        return;
    }
    document.dispatchEvent(new CustomEvent('agent-teams-live-subagents-changed', {
        detail: {
            sessionId: String(state.currentSessionId || '').trim(),
            selectedRoleId: String(state.selectedRoleId || '').trim(),
            ...(detail || {}),
        },
    }));
}
