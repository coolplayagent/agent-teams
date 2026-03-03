/**
 * components/rounds/utils.js
 * Shared utility helpers for rounds timeline rendering.
 */

export function roundSectionId(runId) {
    return `round-${String(runId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}
