/**
 * components/messageRenderer/helpers/progressiveText.js
 * Frame-budgeted rendering for very large plain text and line blocks.
 */

export const PROGRESSIVE_TEXT_THRESHOLD = 24000;
export const PROGRESSIVE_LINE_THRESHOLD = 240;

const DEFAULT_TEXT_CHUNK_CHARS = 12000;
const DEFAULT_LINE_BATCH_SIZE = 80;
const DEFAULT_FRAME_BUDGET_MS = 8;

export function shouldRenderTextProgressively(text, threshold = PROGRESSIVE_TEXT_THRESHOLD) {
    return String(text || '').length > threshold;
}

export function renderProgressivePlainText(targetEl, text, options = {}) {
    if (!targetEl) {
        return false;
    }
    const source = String(text || '');
    const threshold = Number(options.threshold || PROGRESSIVE_TEXT_THRESHOLD);
    if (!shouldRenderTextProgressively(source, threshold)) {
        clearProgressiveState(targetEl);
        return false;
    }

    const existing = targetEl.__progressiveTextState || null;
    if (
        existing
        && isProgressiveTextStateAttached(targetEl, existing)
        && source.startsWith(existing.source.slice(0, existing.offset))
    ) {
        existing.source = source;
        scheduleTextFrame(targetEl, existing);
        return true;
    }

    const state = {
        source,
        offset: 0,
        version: 1,
        frame: 0,
        tailNode: null,
        chunkChars: Math.max(1024, Number(options.chunkChars || DEFAULT_TEXT_CHUNK_CHARS)),
        frameBudgetMs: Math.max(1, Number(options.frameBudgetMs || DEFAULT_FRAME_BUDGET_MS)),
    };
    targetEl.__progressiveTextState = state;
    if (typeof targetEl.replaceChildren === 'function') {
        targetEl.replaceChildren();
    } else {
        targetEl.textContent = '';
    }
    renderTextBudget(targetEl, state);
    scheduleTextFrame(targetEl, state);
    return true;
}

export function renderProgressiveHtmlBatches(targetEl, totalItems, renderBatch, options = {}) {
    if (!targetEl || typeof renderBatch !== 'function') {
        return false;
    }
    const total = Math.max(0, Number(totalItems || 0));
    const threshold = Math.max(1, Number(options.threshold || PROGRESSIVE_LINE_THRESHOLD));
    if (total <= threshold) {
        clearProgressiveState(targetEl);
        return false;
    }
    const state = {
        total,
        offset: 0,
        version: 1,
        frame: 0,
        renderBatch,
        batchSize: Math.max(1, Number(options.batchSize || DEFAULT_LINE_BATCH_SIZE)),
        batchesPerFrame: Math.max(1, Number(options.batchesPerFrame || 1)),
        frameBudgetMs: Math.max(1, Number(options.frameBudgetMs || DEFAULT_FRAME_BUDGET_MS)),
    };
    targetEl.__progressiveHtmlState = state;
    if (typeof targetEl.replaceChildren === 'function') {
        targetEl.replaceChildren();
    } else {
        targetEl.innerHTML = '';
    }
    renderHtmlBudget(targetEl, state);
    scheduleHtmlFrame(targetEl, state);
    return true;
}

export function clearProgressiveState(targetEl) {
    if (!targetEl) {
        return;
    }
    if (targetEl.__progressiveTextState) {
        targetEl.__progressiveTextState.version += 1;
        delete targetEl.__progressiveTextState;
    }
    if (targetEl.__progressiveHtmlState) {
        targetEl.__progressiveHtmlState.version += 1;
        delete targetEl.__progressiveHtmlState;
    }
}

function scheduleTextFrame(targetEl, state) {
    if (!state || state.frame || state.offset >= state.source.length) {
        return;
    }
    const version = state.version;
    state.frame = requestNextFrame(() => {
        state.frame = 0;
        if (targetEl.__progressiveTextState !== state || state.version !== version) {
            return;
        }
        renderTextBudget(targetEl, state);
        scheduleTextFrame(targetEl, state);
    });
}

function renderTextBudget(targetEl, state) {
    const startedAt = nowMs();
    let renderedChars = 0;
    while (state.offset < state.source.length) {
        const remainingFrameChars = state.chunkChars - renderedChars;
        if (remainingFrameChars <= 0) {
            break;
        }
        const next = state.source.slice(
            state.offset,
            Math.min(state.source.length, state.offset + remainingFrameChars),
        );
        appendTextChunk(targetEl, state, next);
        state.offset += next.length;
        renderedChars += next.length;
        if (renderedChars >= state.chunkChars || nowMs() - startedAt >= state.frameBudgetMs) {
            break;
        }
    }
}

function appendTextChunk(targetEl, state, text) {
    if (!text) {
        return;
    }
    if (!state.tailNode) {
        state.tailNode = createTextNode('');
        appendBeforeStreamingCursor(targetEl, state.tailNode);
    }
    state.tailNode.textContent = String(state.tailNode.textContent || '') + text;
}

function scheduleHtmlFrame(targetEl, state) {
    if (!state || state.frame || state.offset >= state.total) {
        return;
    }
    const version = state.version;
    state.frame = requestNextFrame(() => {
        state.frame = 0;
        if (targetEl.__progressiveHtmlState !== state || state.version !== version) {
            return;
        }
        renderHtmlBudget(targetEl, state);
        scheduleHtmlFrame(targetEl, state);
    });
}

function renderHtmlBudget(targetEl, state) {
    const startedAt = nowMs();
    let renderedBatches = 0;
    while (state.offset < state.total) {
        const end = Math.min(state.total, state.offset + state.batchSize);
        appendHtml(targetEl, state.renderBatch(state.offset, end));
        state.offset = end;
        renderedBatches += 1;
        if (
            renderedBatches >= state.batchesPerFrame
            || nowMs() - startedAt >= state.frameBudgetMs
        ) {
            break;
        }
    }
}

function appendHtml(targetEl, html) {
    const source = String(html || '');
    if (!source) {
        return;
    }
    if (typeof targetEl.insertAdjacentHTML === 'function') {
        targetEl.insertAdjacentHTML('beforeend', source);
        return;
    }
    targetEl.innerHTML = String(targetEl.innerHTML || '') + source;
}

function appendBeforeStreamingCursor(targetEl, node) {
    const cursor = targetEl.querySelector?.('.streaming-cursor') || null;
    if (cursor?.parentNode === targetEl && typeof targetEl.insertBefore === 'function') {
        targetEl.insertBefore(node, cursor);
        return;
    }
    targetEl.appendChild(node);
}

function isProgressiveTextStateAttached(targetEl, state) {
    if (!state?.tailNode) {
        return true;
    }
    return state.tailNode.parentNode === targetEl;
}

function createTextNode(text) {
    if (typeof document !== 'undefined' && typeof document.createTextNode === 'function') {
        return document.createTextNode(text);
    }
    return {
        nodeType: 3,
        textContent: String(text || ''),
    };
}

function requestNextFrame(callback) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
    }
    if (typeof globalThis.setTimeout === 'function') {
        return globalThis.setTimeout(callback, 16);
    }
    callback();
    return 0;
}

function nowMs() {
    return globalThis.performance?.now?.() || Date.now();
}
