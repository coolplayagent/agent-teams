/**
 * components/messageTimeline/scrollController.js
 * Shared scroll-follow helpers for timelines and panels.
 */

export const BOTTOM_FOLLOW_THRESHOLD_PX = 96;
const USER_SCROLL_LOCK_MS = 1800;

const followState = new WeakMap();

export function isNearBottom(container, threshold = BOTTOM_FOLLOW_THRESHOLD_PX) {
    if (!container) return false;
    const distance = Number(container.scrollHeight || 0)
        - Number(container.scrollTop || 0)
        - Number(container.clientHeight || 0);
    return distance <= threshold;
}

export function preserveScrollOnPrepend(container, renderFn) {
    if (!container || typeof renderFn !== 'function') {
        return;
    }
    const oldHeight = container.scrollHeight;
    const oldTop = container.scrollTop;
    renderFn();
    const newHeight = container.scrollHeight;
    container.scrollTop = newHeight - oldHeight + oldTop;
}

export function followBottomIfNeeded(container, renderFn) {
    if (!container || typeof renderFn !== 'function') {
        return;
    }
    const follow = captureBottomIntent(container);
    renderFn();
    scheduleFollowBottom(container, { follow });
}

export function captureBottomIntent(container) {
    if (!container) {
        return { shouldFollow: false };
    }
    const state = ensureFollowState(container);
    const nearBottom = isNearBottom(container);
    if (isUserScrollLocked(state)) {
        return {
            shouldFollow: false,
            wasNearBottom: nearBottom,
            scrollHeight: Number(container.scrollHeight || 0),
            scrollTop: Number(container.scrollTop || 0),
            clientHeight: Number(container.clientHeight || 0),
        };
    }
    if (nearBottom) {
        state.sticky = true;
        state.userScrollLockUntil = 0;
    }
    return {
        shouldFollow: nearBottom || state.sticky === true,
        wasNearBottom: nearBottom,
        scrollHeight: Number(container.scrollHeight || 0),
        scrollTop: Number(container.scrollTop || 0),
        clientHeight: Number(container.clientHeight || 0),
    };
}

export function scheduleFollowBottom(container, options = {}) {
    if (!container) return;
    const state = ensureFollowState(container);
    const follow = options.follow || null;
    const nearBottom = isNearBottom(container);
    if (isUserScrollLocked(state) && options.force !== true) {
        return;
    }
    if (nearBottom) {
        state.sticky = true;
        state.userScrollLockUntil = 0;
    }
    const shouldFollow = options.force === true
        || follow?.shouldFollow === true
        || state.sticky === true
        || nearBottom;
    if (!shouldFollow) return;

    state.sticky = true;
    if (state.frame) return;

    const schedule = resolveAnimationFrameScheduler();
    state.frame = schedule(() => {
        state.frame = 0;
        if (shouldApplyScheduledFollow(container, state)) {
            scrollToBottom(container);
        }
        state.secondFrame = schedule(() => {
            state.secondFrame = 0;
            if (shouldApplyScheduledFollow(container, state)) {
                scrollToBottom(container);
            }
        });
    });
}

export function forceFollowBottom(container, options = {}) {
    if (!container) return;
    const state = ensureFollowState(container);
    state.sticky = true;
    scrollToBottom(container);
    scheduleFollowBottom(container, { ...options, force: true });
}

export function markUserScrollIntent(container) {
    if (!container) return;
    const state = ensureFollowState(container);
    state.sticky = isNearBottom(container);
}

export function bindHeightObserver(container, target = container) {
    if (!container || !target || typeof ResizeObserver !== 'function') return;
    const state = ensureFollowState(container);
    if (!state.resizeObserver) {
        state.resizeObserver = new ResizeObserver(() => {
            if (state.sticky === true || isNearBottom(container)) {
                scheduleFollowBottom(container, { force: state.sticky === true });
            }
        });
        state.observedTargets = new WeakSet();
    }
    if (!state.observedTargets.has(target)) {
        state.resizeObserver.observe(target);
        state.observedTargets.add(target);
    }
}

function ensureFollowState(container) {
    let state = followState.get(container);
    if (state) return state;
    state = {
        sticky: isNearBottom(container),
        frame: 0,
        secondFrame: 0,
        programmaticUntil: 0,
        userScrollLockUntil: 0,
        resizeObserver: null,
        observedTargets: null,
    };
    followState.set(container, state);
    bindUserScrollIntent(container, state);
    return state;
}

function bindUserScrollIntent(container, state) {
    if (container.dataset?.bottomFollowBound === 'true') return;
    if (container.dataset) {
        container.dataset.bottomFollowBound = 'true';
    }
    container.addEventListener('wheel', event => {
        const deltaY = Number(event?.deltaY || 0);
        if (Math.abs(deltaY) <= 1) {
            return;
        }
        if (deltaY > 0 && isNearBottom(container)) {
            state.sticky = true;
            state.userScrollLockUntil = 0;
            return;
        }
        pauseAutoFollow(state);
    }, { passive: true });
    container.addEventListener('touchstart', () => {
        if (isNearBottom(container)) {
            state.sticky = true;
            state.userScrollLockUntil = 0;
            return;
        }
        pauseAutoFollow(state);
    }, { passive: true });
    container.addEventListener('pointerdown', event => {
        if (isExpandableSummaryTarget(event?.target)) {
            pauseAutoFollow(state);
        }
    }, { passive: true });
    container.addEventListener('keydown', event => {
        const key = String(event?.key || '');
        if ((key === 'Enter' || key === ' ') && isExpandableSummaryTarget(event?.target)) {
            pauseAutoFollow(state);
        }
    }, { passive: true });
    container.addEventListener('relayTeamsReadingIntent', () => {
        pauseAutoFollow(state);
    }, { passive: true });
    container.addEventListener('scroll', () => {
        if (isProgrammaticScroll(state)) return;
        const nearBottom = isNearBottom(container);
        state.sticky = nearBottom;
        if (nearBottom) {
            state.userScrollLockUntil = 0;
        } else {
            pauseAutoFollow(state);
        }
    }, { passive: true });
}

function scrollToBottom(container) {
    const state = ensureFollowState(container);
    state.programmaticUntil = nowMs() + 120;
    container.scrollTop = Math.max(
        0,
        Number(container.scrollHeight || 0) - Number(container.clientHeight || 0),
    );
}

function isProgrammaticScroll(state) {
    return nowMs() < Number(state.programmaticUntil || 0);
}

function isUserScrollLocked(state) {
    return nowMs() < Number(state?.userScrollLockUntil || 0);
}

function pauseAutoFollow(state) {
    state.sticky = false;
    state.userScrollLockUntil = nowMs() + USER_SCROLL_LOCK_MS;
}

function shouldApplyScheduledFollow(container, state) {
    if (isUserScrollLocked(state)) {
        return false;
    }
    return state.sticky === true || isNearBottom(container);
}

function isExpandableSummaryTarget(target) {
    return !!target?.closest?.('summary, .thinking-summary, .tool-summary');
}

function nowMs() {
    return globalThis.performance?.now?.() || Date.now();
}

function resolveAnimationFrameScheduler() {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return callback => window.requestAnimationFrame(callback);
    }
    return callback => {
        callback(nowMs());
        return 0;
    };
}
