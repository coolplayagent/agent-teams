/**
 * components/agentPanel/history.js
 * Renders subagent transcript history into an existing workspace container.
 */
import { fetchAgentMessages } from '../../core/api.js';
import { t } from '../../utils/i18n.js';
import {
    bindStreamOverlayToContainer,
    getInstanceStreamOverlay,
    renderHistoricalMessageList,
} from '../messageRenderer.js';

export async function renderInstanceHistoryInto(container, options = {}) {
    if (!container) {
        return null;
    }
    const sessionId = String(options.sessionId || '').trim();
    const instanceId = String(options.instanceId || '').trim();
    const runId = String(options.runId || '').trim();
    const userRoleLabel = String(
        options.userRoleLabel || t('subagent.task_prompt'),
    ).trim();
    const emptyLabel = String(
        options.emptyLabel || t('agent_panel.history.empty'),
    ).trim();
    const loadFailedLabel = String(
        options.loadFailedLabel || t('agent_panel.history.load_failed'),
    ).trim();
    const pendingToolApprovals = Array.isArray(options.pendingToolApprovals)
        ? options.pendingToolApprovals
        : [];
    const overlayMode = String(options.overlayMode || 'render').trim().toLowerCase();
    const requireToolBoundary = options.requireToolBoundary === true;
    if (!sessionId || !instanceId) {
        container.innerHTML = `<div class="panel-empty">${escapeHtml(emptyLabel)}</div>`;
        return null;
    }
    try {
        const messages = await fetchAgentMessages(sessionId, instanceId, {
            signal: options.signal || null,
        });
        const overlayEntry = getInstanceStreamOverlay(runId, instanceId);
        const streamOverlayEntry = shouldRenderLiveOverlay(options, overlayEntry)
            ? overlayEntry
            : null;
        if (requireToolBoundary && hasPendingToolResults(messages)) {
            return {
                messages,
                streamOverlayEntry,
                deferred: true,
            };
        }
        const renderTarget = shouldReplaceHistoryWhenReady(options)
            ? createHistoryRenderTarget(container)
            : container;
        if (
            messages.length === 0
            && pendingToolApprovals.length === 0
            && !streamOverlayEntry
        ) {
            renderTarget.innerHTML = `<div class="panel-empty">${escapeHtml(emptyLabel)}</div>`;
            replaceHistoryContainerWhenReady(container, renderTarget);
            return {
                messages,
                streamOverlayEntry,
            };
        }
        const shouldBindRenderedOverlay = overlayMode === 'bind'
            || overlayMode === 'render-bind';
        const shouldRenderOverlayBeforeBind = overlayMode === 'render-bind';
        const renderOptions = {
            pendingToolApprovals,
            runId,
            status: options.status || '',
            runStatus: options.runStatus || options.status || '',
            runPhase: options.runPhase || '',
            streamOverlayEntry:
                overlayMode === 'bind' && messages.length > 0
                    ? null
                    : streamOverlayEntry,
            separateOverlayMessage:
                overlayMode === 'separate' || shouldRenderOverlayBeforeBind,
            userRoleLabel,
        };
        if (runId) {
            renderOptions.timelineView = runId.startsWith('subagent_run_')
                ? 'normal-child-session'
                : 'orchestration-panel';
        }
        clearHistoryRenderTarget(renderTarget);
        renderHistoricalMessageList(renderTarget, messages, renderOptions);
        replaceHistoryContainerWhenReady(container, renderTarget);
        if (shouldBindRenderedOverlay && streamOverlayEntry) {
            bindStreamOverlayToContainer(container, {
                instanceId,
                runId,
                roleId: streamOverlayEntry.roleId || options.roleId || '',
                label: streamOverlayEntry.label || '',
            });
        }
        return {
            messages,
            streamOverlayEntry,
        };
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw e;
        }
        container.innerHTML =
            `<div class="panel-empty" style="color:var(--danger)">${escapeHtml(loadFailedLabel)}</div>`;
        throw e;
    }
}

function shouldReplaceHistoryWhenReady(options = {}) {
    return options.replaceWhenReady === true;
}

function clearHistoryRenderTarget(renderTarget) {
    if (!renderTarget) {
        return;
    }
    if (typeof renderTarget.replaceChildren === 'function') {
        renderTarget.replaceChildren();
        return;
    }
    renderTarget.innerHTML = '';
}

function createHistoryRenderTarget(container) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        container.innerHTML = '';
        return container;
    }
    const target = document.createElement('div');
    if (container?.dataset && target.dataset) {
        Object.entries(container.dataset).forEach(([key, value]) => {
            target.dataset[key] = value;
        });
    }
    return target;
}

function replaceHistoryContainerWhenReady(container, renderTarget) {
    if (!container || renderTarget === container) {
        return;
    }
    if (container.dataset && renderTarget.dataset) {
        Object.entries(renderTarget.dataset).forEach(([key, value]) => {
            container.dataset[key] = value;
        });
    }
    if (typeof container.replaceChildren === 'function') {
        container.replaceChildren(...Array.from(renderTarget.childNodes || []));
        return;
    }
    container.innerHTML = renderTarget.innerHTML || '';
}

function shouldRenderLiveOverlay(options = {}, streamOverlayEntry = null) {
    if (!streamOverlayEntry || typeof streamOverlayEntry !== 'object') {
        return false;
    }
    const explicitStates = [
        String(options.status || '').trim().toLowerCase(),
        String(options.runStatus || '').trim().toLowerCase(),
        String(options.runPhase || '').trim().toLowerCase(),
    ].filter(Boolean);
    if (explicitStates.length === 0) {
        return true;
    }
    if (explicitStates.some(state => isTerminalOverlayState(state))) {
        return false;
    }
    return true;
}

function isTerminalOverlayState(value) {
    return value === 'completed'
        || value === 'failed'
        || value === 'stopped'
        || value === 'terminal'
        || value === 'idle';
}

function hasPendingToolResults(messages) {
    const pending = new Set();
    (Array.isArray(messages) ? messages : []).forEach(item => {
        if (!item || String(item.entry_type || '') === 'marker') {
            return;
        }
        const parts = Array.isArray(item?.message?.parts) ? item.message.parts : [];
        parts.forEach(part => {
            const partKind = String(part?.part_kind || '').trim().toLowerCase();
            if (partKind === 'tool-call' || isLegacyToolCallPart(part)) {
                const key = toolPartKey(part);
                if (key) {
                    pending.add(key);
                }
                return;
            }
            if (partKind === 'tool-return' || isLegacyToolReturnPart(part)) {
                const key = toolPartKey(part);
                if (key) {
                    pending.delete(key);
                }
            }
        });
    });
    return pending.size > 0;
}

function isLegacyToolCallPart(part) {
    return !!(
        part
        && typeof part === 'object'
        && part.tool_name !== undefined
        && part.args !== undefined
    );
}

function isLegacyToolReturnPart(part) {
    return !!(
        part
        && typeof part === 'object'
        && part.tool_name !== undefined
        && part.content !== undefined
        && part.args === undefined
    );
}

function toolPartKey(part) {
    const toolCallId = String(part?.tool_call_id || '').trim();
    if (toolCallId) {
        return `id:${toolCallId}`;
    }
    const toolName = String(part?.tool_name || '').trim();
    return toolName ? `name:${toolName}` : '';
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
