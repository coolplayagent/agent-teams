/**
 * core/viewGuards.js
 * Shared view ownership checks for async session rendering.
 */
import { state } from './state.js';

export function hasActiveSubagentSessionFor(sessionId = state.currentSessionId) {
    const safeSessionId = String(sessionId || '').trim();
    const active = state.activeSubagentSession;
    return !!(
        safeSessionId
        && active
        && typeof active === 'object'
        && String(active.sessionId || '').trim() === safeSessionId
    );
}

export function canRenderMainSessionView(sessionId = state.currentSessionId) {
    const safeSessionId = String(sessionId || '').trim();
    const currentSessionId = String(state.currentSessionId || '').trim();
    return !!(
        safeSessionId
        && currentSessionId === safeSessionId
        && !hasActiveSubagentSessionFor(safeSessionId)
    );
}
