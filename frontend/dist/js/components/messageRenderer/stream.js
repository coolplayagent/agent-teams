/**
 * components/messageRenderer/stream.js
 * Streaming message mutation helpers used by SSE event handling.
 */
import { parseMarkdown } from '../../utils/markdown.js';
import {
    findToolBlock,
    renderMessageBlock,
    scrollBottom,
    setToolValidationFailureState,
    syncApprovalStateFromEnvelope,
} from './helpers.js';

const streamState = new Map();

export function getOrCreateStreamBlock(container, instanceId, roleId, label) {
    let st = streamState.get(instanceId);
    if (!st || st.container !== container) {
        const { wrapper, contentEl } = renderMessageBlock(container, 'model', label, []);
        st = {
            container,
            wrapper,
            contentEl,
            activeTextEl: null,
            raw: '',
            roleId,
            label,
        };
        streamState.set(instanceId, st);
    }
    return st;
}

export function appendStreamChunk(instanceId, text) {
    const st = streamState.get(instanceId);
    if (!st) return;

    if (!st.activeTextEl) {
        st.activeTextEl = document.createElement('div');
        st.activeTextEl.className = 'msg-text';
        st.contentEl.appendChild(st.activeTextEl);
        st.raw = '';
    }

    st.raw += text;
    st.activeTextEl.innerHTML = parseMarkdown(st.raw);
    scrollBottom(st.container);
}

export function finalizeStream(instanceId) {
    const st = streamState.get(instanceId);
    if (st && st.activeTextEl) {
        st.activeTextEl.innerHTML = parseMarkdown(st.raw);
    }
    streamState.delete(instanceId);
}

export function clearStreamState(instanceId) {
    streamState.delete(instanceId);
}

export function clearAllStreamState() {
    streamState.clear();
}

export function appendToolCallBlock(container, instanceId, toolName, args, toolCallId = null) {
    let st = streamState.get(instanceId);
    if (!st) {
        const label = toolName ? 'tool' : 'agent';
        const { wrapper, contentEl } = renderMessageBlock(container, 'model', label, []);
        st = { container, wrapper, contentEl, activeTextEl: null, raw: '', roleId: '', label };
        streamState.set(instanceId, st);
    }

    st.activeTextEl = null;
    st.raw = '';

    let argsStr = '';
    try {
        argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args || '');
    } catch (e) {
        argsStr = String(args);
    }

    const toolBlock = document.createElement('div');
    toolBlock.className = 'tool-block';
    toolBlock.dataset.toolName = toolName;
    if (toolCallId) {
        toolBlock.dataset.toolCallId = toolCallId;
    }
    toolBlock.style.display = 'block';
    toolBlock.style.visibility = 'visible';

    toolBlock.innerHTML = `
        <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
            <div class="tool-title">
                <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px;height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                <span class="name">${toolName}</span>
            </div>
            <div class="tool-status"><div class="spinner"></div></div>
        </div>
        <div class="tool-body">
            <pre class="tool-args" style="white-space:pre-wrap;">${argsStr}</pre>
            <div class="tool-result">Processing...</div>
        </div>
    `;
    st.contentEl.appendChild(toolBlock);
    scrollBottom(st.container || container);
    return toolBlock;
}

export function updateToolResult(instanceId, toolName, result, isError, toolCallId = null) {
    const st = streamState.get(instanceId);
    if (!st) return;

    const toolBlock = findToolBlock(st.contentEl, toolName, toolCallId);
    if (!toolBlock) return;

    const statusEl = toolBlock.querySelector('.tool-status');
    const resultEl = toolBlock.querySelector('.tool-result');
    if (isError) {
        statusEl.innerHTML = `<svg class="status-icon status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        resultEl.classList.add('error-text');
    } else {
        statusEl.innerHTML = `<svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
        resultEl.classList.remove('error-text');
    }
    const val = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result ?? '');
    resultEl.innerHTML = parseMarkdown(val);

    syncApprovalStateFromEnvelope(toolBlock, result);
    scrollBottom(st.container);
}

export function markToolInputValidationFailed(instanceId, payload) {
    const st = streamState.get(instanceId);
    if (!st) return false;

    const toolBlock = findToolBlock(
        st.contentEl,
        payload?.tool_name,
        payload?.tool_call_id || null,
    );
    if (!toolBlock) return false;

    setToolValidationFailureState(toolBlock, payload);
    scrollBottom(st.container);
    return true;
}

export function attachToolApprovalControls(instanceId, toolName, payload, handlers) {
    const st = streamState.get(instanceId);
    if (!st) return false;

    const toolBlock = findToolBlock(st.contentEl, toolName, payload?.tool_call_id || null);
    if (!toolBlock) return false;
    if (payload?.tool_call_id) {
        toolBlock.dataset.toolCallId = payload.tool_call_id;
    }

    let approvalEl = toolBlock.querySelector('.tool-approval-inline');
    if (!approvalEl) {
        approvalEl = document.createElement('div');
        approvalEl.className = 'tool-approval-inline';
        approvalEl.innerHTML = `
            <div class="tool-approval-state">Approval required</div>
            <div class="gate-actions">
                <button class="gate-approve-btn">Approve</button>
                <button class="gate-revise-btn">Deny</button>
            </div>
        `;
        const body = toolBlock.querySelector('.tool-body');
        const resultEl = toolBlock.querySelector('.tool-result');
        if (body && resultEl) {
            body.insertBefore(approvalEl, resultEl);
        } else if (body) {
            body.appendChild(approvalEl);
        }
    }

    const approveBtn = approvalEl.querySelector('.gate-approve-btn');
    const denyBtn = approvalEl.querySelector('.gate-revise-btn');
    const stateEl = approvalEl.querySelector('.tool-approval-state');
    if (stateEl) stateEl.textContent = 'Approval required';

    if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.onclick = async () => {
            approveBtn.disabled = true;
            if (denyBtn) denyBtn.disabled = true;
            try {
                await handlers.onApprove();
            } catch (e) {
                approveBtn.disabled = false;
                if (denyBtn) denyBtn.disabled = false;
                if (handlers.onError) handlers.onError(e);
            }
        };
    }
    if (denyBtn) {
        denyBtn.disabled = false;
        denyBtn.onclick = async () => {
            denyBtn.disabled = true;
            if (approveBtn) approveBtn.disabled = true;
            try {
                await handlers.onDeny();
            } catch (e) {
                denyBtn.disabled = false;
                if (approveBtn) approveBtn.disabled = false;
                if (handlers.onError) handlers.onError(e);
            }
        };
    }

    scrollBottom(st.container);
    return true;
}

export function markToolApprovalResolved(instanceId, payload) {
    const st = streamState.get(instanceId);
    if (!st) return false;
    const toolCallId = payload?.tool_call_id;
    if (!toolCallId) return false;

    const toolBlock = findToolBlock(st.contentEl, payload?.tool_name, toolCallId);
    if (!toolBlock) return false;
    toolBlock.dataset.toolCallId = toolCallId;

    const approvalEl = toolBlock.querySelector('.tool-approval-inline');
    if (!approvalEl) return false;
    const action = String(payload.action || 'resolved').toUpperCase();
    const stateEl = approvalEl.querySelector('.tool-approval-state');
    if (stateEl) stateEl.textContent = `Approval ${action}`;
    approvalEl.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
    return true;
}
