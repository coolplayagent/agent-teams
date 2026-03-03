/**
 * components/messageRenderer/helpers/approval.js
 * Approval rendering and status helpers.
 */
import { parseMarkdown } from '../../../utils/markdown.js';

export function decoratePendingApprovalBlock(toolBlock, approval) {
    if (approval?.tool_call_id) {
        toolBlock.dataset.toolCallId = approval.tool_call_id;
    }

    const statusEl = toolBlock.querySelector('.tool-status');
    const resultEl = toolBlock.querySelector('.tool-result');
    if (statusEl) {
        statusEl.innerHTML = `<svg class="status-icon status-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86l-8.2 14.2A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.73-2.94l-8.2-14.2a2 2 0 0 0-3.46 0z"/></svg>`;
    }
    if (resultEl) {
        resultEl.classList.remove('error-text');
        resultEl.classList.add('warning-text');
        resultEl.innerHTML = parseMarkdown(formatPendingApprovalResult(approval));
    }
    if (String(approval?.status || 'requested').toLowerCase() === 'requested') {
        const body = toolBlock.querySelector('.tool-body');
        if (body) body.classList.add('open');
    }

    let approvalEl = toolBlock.querySelector('.tool-approval-inline');
    if (!approvalEl) {
        approvalEl = document.createElement('div');
        approvalEl.className = 'tool-approval-inline';
        approvalEl.innerHTML = `<div class="tool-approval-state"></div>`;
        const body = toolBlock.querySelector('.tool-body');
        if (body && resultEl) {
            body.insertBefore(approvalEl, resultEl);
        } else if (body) {
            body.appendChild(approvalEl);
        }
    }
    const stateEl = approvalEl.querySelector('.tool-approval-state');
    if (stateEl) {
        stateEl.textContent = historicalApprovalLabel(approval?.status);
    }
    approvalEl.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
}

export function parseApprovalArgsPreview(argsPreview) {
    if (!argsPreview) return {};
    try {
        return JSON.parse(argsPreview);
    } catch (e) {
        return { args_preview: String(argsPreview) };
    }
}

export function syncApprovalStateFromEnvelope(toolBlock, envelope) {
    const meta = extractApprovalMeta(envelope);
    if (!meta || !meta.required) return;

    const label = approvalStateLabel(meta.status);
    let approvalEl = toolBlock.querySelector('.tool-approval-inline');
    if (!approvalEl) {
        approvalEl = document.createElement('div');
        approvalEl.className = 'tool-approval-inline';
        approvalEl.innerHTML = `<div class="tool-approval-state"></div>`;
        const body = toolBlock.querySelector('.tool-body');
        const resultEl = toolBlock.querySelector('.tool-result');
        if (body && resultEl) {
            body.insertBefore(approvalEl, resultEl);
        } else if (body) {
            body.appendChild(approvalEl);
        }
    }

    const stateEl = approvalEl.querySelector('.tool-approval-state');
    if (stateEl) stateEl.textContent = label;
    approvalEl.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
}

function historicalApprovalLabel(status) {
    const normalized = String(status || 'requested').toLowerCase();
    if (normalized === 'approve') return 'Approval APPROVE';
    if (normalized === 'deny') return 'Approval DENY';
    if (normalized === 'timeout') return 'Approval TIMEOUT';
    return 'Approval requested';
}

function formatPendingApprovalResult(approval) {
    const status = String(approval?.status || 'requested').toLowerCase();
    if (status === 'deny') {
        return 'Approval denied. Tool was not executed.';
    }
    if (status === 'timeout') {
        return 'Approval timed out. Tool was not executed.';
    }
    if (status === 'approve') {
        return 'Approval approved, but no tool result was recorded. Run may have been interrupted.';
    }
    return 'Approval is pending. Approve or deny to continue.';
}

function extractApprovalMeta(envelope) {
    if (!envelope || typeof envelope !== 'object') return null;
    const meta = envelope.meta;
    if (!meta || typeof meta !== 'object') return null;
    return {
        required: meta.approval_required === true,
        status: typeof meta.approval_status === 'string' ? meta.approval_status : null,
    };
}

function approvalStateLabel(status) {
    if (status === 'approve') return 'Approval APPROVE';
    if (status === 'deny') return 'Approval DENY';
    if (status === 'timeout') return 'Approval TIMEOUT';
    if (status === 'not_required') return 'Approval not required';
    return 'Approval required';
}
