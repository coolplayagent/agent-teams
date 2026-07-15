/**
 * components/sessionSidebarStore.js
 * Small local cache for sidebar session rendering.
 */

const snapshot = {
    hasData: false,
    workspaces: [],
    workspacesComplete: false,
    sessions: [],
    automationProjects: [],
};
const RECENT_SESSION_REMOVAL_RETENTION_MS = 30000;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'stopped', 'paused']);
const optimisticSessions = new Map();
const removedSessionIds = new Map();
const viewedTerminalRunsBySessionId = new Map();

export function rememberSidebarDataSnapshot({
    workspaces,
    workspacesComplete = snapshot.workspacesComplete,
    sessions,
    automationProjects,
} = {}) {
    const incomingSessions = withoutRemovedSessions(cloneRows(sessions));
    snapshot.hasData = true;
    snapshot.workspaces = cloneRows(workspaces);
    snapshot.workspacesComplete = workspacesComplete === true;
    snapshot.sessions = hasRecentSessionRemoval()
        ? mergeIncomingSessionsWithExistingSnapshot(incomingSessions, snapshot.sessions)
        : incomingSessions;
    snapshot.automationProjects = cloneRows(automationProjects);
    trimOptimisticSessions(snapshot.sessions);
}

export function hasSidebarDataSnapshot() {
    return snapshot.hasData === true;
}

export function getSidebarDataSnapshot() {
    return {
        workspaces: cloneRows(snapshot.workspaces),
        workspacesComplete: snapshot.workspacesComplete,
        sessions: mergeOptimisticSessions(snapshot.sessions),
        automationProjects: cloneRows(snapshot.automationProjects),
    };
}

export function upsertOptimisticSession(record) {
    const normalized = normalizeSession(record);
    if (!normalized) {
        return null;
    }
    const current = optimisticSessions.get(normalized.session_id) || {};
    const merged = mergeSessionRecords(current, normalized);
    optimisticSessions.set(normalized.session_id, merged);
    return merged;
}

export function updateOptimisticSessionTitle(sessionId, title) {
    const safeSessionId = String(sessionId || '').trim();
    const safeTitle = String(title || '').trim();
    if (!safeSessionId || !safeTitle) {
        return null;
    }
    const current = optimisticSessions.get(safeSessionId) || {
        session_id: safeSessionId,
        metadata: {},
    };
    return upsertOptimisticSession({
        ...current,
        metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            title: safeTitle,
        },
        updated_at: new Date().toISOString(),
    });
}

export function markSidebarSessionRunStarted(sessionId, run = {}) {
    const safeSessionId = String(
        sessionId || run?.session_id || run?.sessionId || '',
    ).trim();
    if (!safeSessionId) {
        return null;
    }
    const runId = String(run?.run_id || run?.runId || '').trim();
    const now = new Date().toISOString();
    const current = findStoredSession(safeSessionId)
        || optimisticSessions.get(safeSessionId)
        || { session_id: safeSessionId, metadata: {} };
    return upsertOptimisticSession({
        ...current,
        session_id: safeSessionId,
        workspace_id: String(
            current?.workspace_id || current?.workspaceId || run?.workspace_id || '',
        ).trim(),
        has_active_run: true,
        hasActiveRun: true,
        active_run_id: runId,
        activeRunId: runId,
        active_run_status: 'running',
        activeRunStatus: 'running',
        active_run_phase: 'running',
        activeRunPhase: 'running',
        has_unread_terminal_run: false,
        hasUnreadTerminalRun: false,
        updated_at: now,
        updatedAt: now,
    });
}

export function markSidebarSessionRunTerminal(sessionId, run = {}, options = {}) {
    const safeSessionId = String(
        sessionId || run?.session_id || run?.sessionId || '',
    ).trim();
    if (!safeSessionId) {
        return null;
    }
    const runId = String(
        run?.run_id || run?.runId || run?.trace_id || run?.traceId || '',
    ).trim();
    const status = normalizeTerminalRunStatus(
        run?.status
        || run?.run_status
        || run?.runStatus
        || run?.event_type
        || run?.eventType
        || '',
    );
    const now = String(
        run?.updated_at
        || run?.updatedAt
        || run?.created_at
        || run?.createdAt
        || new Date().toISOString(),
    );
    const optimisticUpdatedAt = new Date().toISOString();
    const current = optimisticSessions.get(safeSessionId)
        || findStoredSession(safeSessionId)
        || { session_id: safeSessionId, metadata: {} };
    const currentActiveRunId = String(
        current.active_run_id || current.activeRunId || '',
    ).trim();
    const terminalMatchesActiveRun = !!runId && (
        !currentActiveRunId || currentActiveRunId === runId
    );
    const shouldKeepRecoverableActiveRun = terminalMatchesActiveRun
        && isRecoverableTerminalRunStatus(status);
    const shouldClearActiveRun = terminalMatchesActiveRun
        && !shouldKeepRecoverableActiveRun;
    const isViewed = options.viewed === true;
    if (isViewed && runId) {
        viewedTerminalRunsBySessionId.set(safeSessionId, runId);
    } else if (!isViewed) {
        viewedTerminalRunsBySessionId.delete(safeSessionId);
    }
    return upsertOptimisticSession({
        ...current,
        session_id: safeSessionId,
        has_active_run: shouldKeepRecoverableActiveRun
            ? true
            : shouldClearActiveRun
            ? false
            : !!(current.has_active_run || current.hasActiveRun),
        hasActiveRun: shouldKeepRecoverableActiveRun
            ? true
            : shouldClearActiveRun
            ? false
            : !!(current.has_active_run || current.hasActiveRun),
        active_run_id: shouldKeepRecoverableActiveRun
            ? runId
            : shouldClearActiveRun
            ? ''
            : current.active_run_id || current.activeRunId || '',
        activeRunId: shouldKeepRecoverableActiveRun
            ? runId
            : shouldClearActiveRun
            ? ''
            : current.active_run_id || current.activeRunId || '',
        active_run_status: shouldKeepRecoverableActiveRun
            ? status
            : shouldClearActiveRun
            ? ''
            : current.active_run_status || current.activeRunStatus || '',
        activeRunStatus: shouldKeepRecoverableActiveRun
            ? status
            : shouldClearActiveRun
            ? ''
            : current.active_run_status || current.activeRunStatus || '',
        active_run_phase: shouldKeepRecoverableActiveRun
            ? status
            : shouldClearActiveRun
            ? ''
            : current.active_run_phase || current.activeRunPhase || '',
        activeRunPhase: shouldKeepRecoverableActiveRun
            ? status
            : shouldClearActiveRun
            ? ''
            : current.active_run_phase || current.activeRunPhase || '',
        latest_terminal_run_id: runId
            || current.latest_terminal_run_id
            || current.latestTerminalRunId
            || '',
        latestTerminalRunId: runId
            || current.latest_terminal_run_id
            || current.latestTerminalRunId
            || '',
        latest_terminal_run_status: status
            || current.latest_terminal_run_status
            || current.latestTerminalRunStatus
            || '',
        latestTerminalRunStatus: status
            || current.latest_terminal_run_status
            || current.latestTerminalRunStatus
            || '',
        latest_terminal_run_updated_at: now.trim(),
        latestTerminalRunUpdatedAt: now.trim(),
        has_unread_terminal_run: !!(status && terminalMatchesActiveRun && !isViewed),
        hasUnreadTerminalRun: !!(status && terminalMatchesActiveRun && !isViewed),
        updated_at: optimisticUpdatedAt,
        updatedAt: optimisticUpdatedAt,
    });
}

export function removeSidebarSession(sessionId) {
    const safeSessionId = String(sessionId || '').trim();
    if (!safeSessionId) {
        return;
    }
    const current = findStoredSession(safeSessionId) || optimisticSessions.get(safeSessionId) || {};
    removedSessionIds.set(safeSessionId, {
        createdAt: timestampValue(current?.created_at || current?.createdAt || ''),
        removedAt: Date.now(),
    });
    snapshot.sessions = withoutRemovedSessions(cloneRows(snapshot.sessions));
    optimisticSessions.delete(safeSessionId);
    viewedTerminalRunsBySessionId.delete(safeSessionId);
}

export function markSidebarSessionTerminalViewed(sessionId) {
    const safeSessionId = String(sessionId || '').trim();
    if (!safeSessionId) {
        return null;
    }
    const current = findStoredSession(safeSessionId) || optimisticSessions.get(safeSessionId) || {
        session_id: safeSessionId,
        metadata: {},
    };
    viewedTerminalRunsBySessionId.set(
        safeSessionId,
        String(current.latest_terminal_run_id || current.latestTerminalRunId || '').trim(),
    );
    return upsertOptimisticSession(applyViewedTerminalState(current));
}

export function mergeOptimisticSessions(sessions) {
    const byId = new Map();
    cloneRows(sessions).forEach(session => {
        const sessionId = String(session?.session_id || '').trim();
        if (sessionId && !removedSessionIds.has(sessionId)) {
            byId.set(sessionId, applyViewedTerminalState(session));
        }
    });
    optimisticSessions.forEach((optimistic, sessionId) => {
        if (removedSessionIds.has(sessionId)) {
            return;
        }
        const current = byId.get(sessionId) || {};
        byId.set(sessionId, applyViewedTerminalState(mergeSessionRecords(optimistic, current)));
    });
    return Array.from(byId.values());
}

function trimOptimisticSessions(sessions) {
    const persistedById = new Map();
    cloneRows(sessions).forEach(session => {
        const sessionId = String(session?.session_id || '').trim();
        if (sessionId) {
            persistedById.set(sessionId, session);
        }
    });
    optimisticSessions.forEach((optimistic, sessionId) => {
        const persisted = persistedById.get(sessionId);
        if (!persisted) {
            optimisticSessions.delete(sessionId);
            viewedTerminalRunsBySessionId.delete(sessionId);
            return;
        }
        if (terminalRunDisplacesActiveRun(persisted, optimistic)) {
            optimisticSessions.delete(sessionId);
            return;
        }
        if (shouldPreserveOptimisticSession(optimistic, persisted)) {
            return;
        }
        const persistedTitle = String(persisted?.metadata?.title || '').trim();
        if (viewedTerminalRunsBySessionId.has(sessionId)) {
            return;
        }
        if (persistedTitle) {
            optimisticSessions.delete(sessionId);
        }
    });
}

function shouldPreserveOptimisticSession(optimistic, persisted) {
    if (!optimistic || typeof optimistic !== 'object') {
        return false;
    }
    if (terminalRunDisplacesActiveRun(persisted, optimistic)) {
        return false;
    }
    const optimisticUpdatedAt = timestampValue(optimistic.updated_at || optimistic.updatedAt || '');
    const persistedUpdatedAt = timestampValue(persisted?.updated_at || persisted?.updatedAt || '');
    if (optimisticUpdatedAt < persistedUpdatedAt) {
        return false;
    }
    return !!(
        optimistic.has_active_run
        || optimistic.hasActiveRun
        || optimistic.active_run_id
        || optimistic.activeRunId
    );
}

function findStoredSession(sessionId) {
    const safeSessionId = String(sessionId || '').trim();
    if (!safeSessionId) {
        return null;
    }
    return cloneRows(snapshot.sessions).find(
        session => String(session?.session_id || '').trim() === safeSessionId,
    ) || null;
}

function normalizeSession(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }
    const sessionId = String(record.session_id || record.sessionId || '').trim();
    if (!sessionId) {
        return null;
    }
    const workspaceId = String(record.workspace_id || record.workspaceId || '').trim();
    const now = new Date().toISOString();
    return {
        ...record,
        session_id: sessionId,
        workspace_id: workspaceId,
        metadata: record.metadata && typeof record.metadata === 'object'
            ? { ...record.metadata }
            : {},
        created_at: String(record.created_at || record.createdAt || now).trim(),
        updated_at: String(record.updated_at || record.updatedAt || now).trim(),
    };
}

function mergeSessionRecords(preferred, current) {
    const preferredRecord = normalizeSession(preferred) || {};
    const currentRecord = normalizeSession(current) || {};
    const sessionId = String(currentRecord.session_id || preferredRecord.session_id || '').trim();
    const preferredUpdatedAt = String(preferredRecord.updated_at || '').trim();
    const currentUpdatedAt = String(currentRecord.updated_at || '').trim();
    const preferredUpdatedValue = timestampValue(preferredUpdatedAt);
    const currentUpdatedValue = timestampValue(currentUpdatedAt);
    const preferredDisplacesCurrent = terminalRunDisplacesActiveRun(preferredRecord, currentRecord);
    const currentDisplacesPreferred = terminalRunDisplacesActiveRun(currentRecord, preferredRecord);
    const latestRecord = preferredDisplacesCurrent
        ? preferredRecord
        : (
            currentDisplacesPreferred
                ? currentRecord
                : (
                    preferredUpdatedValue > currentUpdatedValue
                        ? preferredRecord
                        : currentRecord
                )
        );
    const olderRecord = latestRecord === preferredRecord ? currentRecord : preferredRecord;
    const preferredMetadata = preferredRecord.metadata && typeof preferredRecord.metadata === 'object'
        ? preferredRecord.metadata
        : {};
    const currentMetadata = currentRecord.metadata && typeof currentRecord.metadata === 'object'
        ? currentRecord.metadata
        : {};
    const preferredTitle = String(preferredMetadata.title || '').trim();
    const currentTitle = String(currentMetadata.title || '').trim();
    const updatedAt = latestRecord === preferredRecord
        ? preferredUpdatedAt || currentUpdatedAt
        : currentUpdatedAt || preferredUpdatedAt;
    const merged = {
        ...olderRecord,
        ...latestRecord,
        session_id: sessionId,
        workspace_id: String(currentRecord.workspace_id || preferredRecord.workspace_id || '').trim(),
        metadata: {
            ...preferredMetadata,
            ...currentMetadata,
            ...(preferredTitle && !currentTitle ? { title: preferredTitle } : {}),
        },
        updated_at: updatedAt || new Date().toISOString(),
        created_at: String(currentRecord.created_at || preferredRecord.created_at || '').trim(),
    };
    if (preferredDisplacesCurrent || currentDisplacesPreferred) {
        return clearActiveRunFields(merged);
    }
    return merged;
}

function clearActiveRunFields(record) {
    return {
        ...record,
        has_active_run: false,
        hasActiveRun: false,
        active_run_id: '',
        activeRunId: '',
        active_run_status: '',
        activeRunStatus: '',
        active_run_phase: '',
        activeRunPhase: '',
    };
}

function terminalRunDisplacesActiveRun(terminalRecord, activeRecord) {
    const latestRunId = String(
        terminalRecord?.latest_terminal_run_id || terminalRecord?.latestTerminalRunId || '',
    ).trim();
    const latestStatus = normalizeTerminalRunStatus(
        terminalRecord?.latest_terminal_run_status || terminalRecord?.latestTerminalRunStatus || '',
    );
    const activeRunId = String(
        activeRecord?.active_run_id || activeRecord?.activeRunId || '',
    ).trim();
    return !!(
        latestRunId
        && activeRunId
        && latestRunId === activeRunId
        && latestStatus
        && !isRecoverableTerminalRunStatus(latestStatus)
    );
}

function normalizeTerminalRunStatus(rawStatus) {
    const status = String(rawStatus || '').trim().toLowerCase();
    const normalized = status.startsWith('run_') ? status.slice(4) : status;
    return TERMINAL_RUN_STATUSES.has(normalized) ? normalized : '';
}

function isRecoverableTerminalRunStatus(status) {
    return status === 'stopped' || status === 'paused';
}

function applyViewedTerminalState(record) {
    const normalized = normalizeSession(record);
    if (!normalized) {
        return record;
    }
    if (!viewedTerminalRunsBySessionId.has(normalized.session_id)) {
        return normalized;
    }
    const viewedRunId = String(viewedTerminalRunsBySessionId.get(normalized.session_id) || '').trim();
    const latestRunId = String(
        normalized.latest_terminal_run_id || normalized.latestTerminalRunId || '',
    ).trim();
    if (latestRunId && viewedRunId && latestRunId !== viewedRunId) {
        viewedTerminalRunsBySessionId.delete(normalized.session_id);
        return normalized;
    }
    if (latestRunId && !viewedRunId && normalized.has_unread_terminal_run === true) {
        viewedTerminalRunsBySessionId.delete(normalized.session_id);
        return normalized;
    }
    return {
        ...normalized,
        has_unread_terminal_run: false,
        hasUnreadTerminalRun: false,
    };
}

function cloneRows(rows) {
    return Array.isArray(rows) ? rows.map(row => cloneRecord(row)) : [];
}

function withoutRemovedSessions(rows) {
    return cloneRows(rows).filter(session => shouldKeepSessionAfterRemovalCheck(session));
}

function mergeIncomingSessionsWithExistingSnapshot(incomingSessions, existingSessions) {
    const byId = new Map();
    cloneRows(incomingSessions).forEach(session => {
        const sessionId = String(session?.session_id || '').trim();
        if (sessionId) {
            byId.set(sessionId, session);
        }
    });
    cloneRows(existingSessions).forEach(session => {
        const sessionId = String(session?.session_id || '').trim();
        if (sessionId && !byId.has(sessionId) && shouldKeepSessionAfterRemovalCheck(session)) {
            byId.set(sessionId, session);
        }
    });
    return Array.from(byId.values());
}

function hasRecentSessionRemoval() {
    const now = Date.now();
    for (const [sessionId, removal] of removedSessionIds.entries()) {
        const removedAt = Number(removal?.removedAt || 0);
        if (removedAt > 0 && now - removedAt <= RECENT_SESSION_REMOVAL_RETENTION_MS) {
            return true;
        }
        if (removedAt > 0) {
            removedSessionIds.delete(sessionId);
        }
    }
    return false;
}

function shouldKeepSessionAfterRemovalCheck(session) {
    const sessionId = String(session?.session_id || '').trim();
    if (!sessionId || !removedSessionIds.has(sessionId)) {
        return true;
    }
    const removal = removedSessionIds.get(sessionId) || {};
    const removedAt = Number(removal.removedAt || 0);
    if (removedAt > 0 && Date.now() - removedAt <= RECENT_SESSION_REMOVAL_RETENTION_MS) {
        return false;
    }
    const rowCreatedAt = timestampValue(session?.created_at || session?.createdAt || '');
    const isNewRecordWithSameId = rowCreatedAt > removedAt;
    if (isNewRecordWithSameId) {
        removedSessionIds.delete(sessionId);
        return true;
    }
    return false;
}

function cloneRecord(row) {
    if (!row || typeof row !== 'object') {
        return row;
    }
    return {
        ...row,
        metadata: row.metadata && typeof row.metadata === 'object'
            ? { ...row.metadata }
            : row.metadata,
    };
}

function timestampValue(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isNaN(parsed) ? 0 : parsed;
}
