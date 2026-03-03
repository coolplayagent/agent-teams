/**
 * components/messageRenderer/helpers.js
 * Shared rendering helpers for message history and streaming blocks.
 */
import { parseMarkdown } from '../../utils/markdown.js';

export function renderMessageBlock(container, role, label, parts = []) {
    const safeLabel = label || 'Agent';
    const wrapper = document.createElement('div');
    wrapper.className = 'message';
    wrapper.dataset.role = role;

    const roleClass = roleClassName(role, safeLabel);
    wrapper.innerHTML = `
        <div class="msg-header">
            <span class="msg-role ${roleClass}">${safeLabel.toUpperCase()}</span>
        </div>
        <div class="msg-content"></div>
    `;
    container.appendChild(wrapper);
    scrollBottom(container);

    const contentEl = wrapper.querySelector('.msg-content');
    const pendingToolBlocks = {};

    if (parts.length > 0) {
        renderParts(contentEl, parts, pendingToolBlocks);
    }

    return { wrapper, contentEl, pendingToolBlocks };
}

export function renderParts(contentEl, parts, pendingToolBlocks) {
    let combinedText = '';

    const flushText = () => {
        if (combinedText.trim()) {
            const textEl = document.createElement('div');
            textEl.className = 'msg-text';
            textEl.innerHTML = parseMarkdown(combinedText.trim());
            contentEl.appendChild(textEl);
            combinedText = '';
        }
    };

    parts.forEach(part => {
        const kind = part.part_kind;

        if (kind === 'text' || kind === 'user-prompt') {
            combinedText += (part.content || '') + '\n\n';
        } else if (kind === 'tool-call' || (part.tool_name && part.args !== undefined)) {
            flushText();
            const tb = buildToolBlock(part.tool_name, part.args, part.tool_call_id);
            contentEl.appendChild(tb);
            indexPendingToolBlock(pendingToolBlocks, tb, part.tool_name, part.tool_call_id);
        } else if (kind === 'tool-return') {
            const toolBlock = resolvePendingToolBlock(
                pendingToolBlocks,
                part.tool_name,
                part.tool_call_id,
            );
            if (toolBlock) applyToolReturn(toolBlock, part.content);
        } else if (kind === 'retry-prompt' && part.tool_name) {
            let toolBlock = resolvePendingToolBlock(
                pendingToolBlocks,
                part.tool_name,
                part.tool_call_id,
            );
            if (!toolBlock) {
                toolBlock = buildToolBlock(part.tool_name, {}, part.tool_call_id);
                contentEl.appendChild(toolBlock);
                indexPendingToolBlock(
                    pendingToolBlocks,
                    toolBlock,
                    part.tool_name,
                    part.tool_call_id,
                );
            }
            setToolValidationFailureState(toolBlock, {
                reason: 'Input validation failed before tool execution.',
                details: part.content,
            });
        }
    });

    flushText();
}

export function buildToolBlock(toolName, args, toolCallId = null) {
    const tb = document.createElement('div');
    tb.className = 'tool-block';
    tb.dataset.toolName = toolName;
    if (toolCallId) {
        tb.dataset.toolCallId = toolCallId;
    }
    tb.innerHTML = `
        <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
            <div class="tool-title">
                <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px;height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                <span class="name">${toolName}</span>
            </div>
            <div class="tool-status"><svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
        </div>
        <div class="tool-body">
            <div class="tool-args">${JSON.stringify(args || {}, null, 2)}</div>
            <div class="tool-result"></div>
        </div>
    `;
    return tb;
}

function roleClassName(role, label) {
    if (label?.toLowerCase().includes('coordinator')) return 'role-coordinator_agent';
    if (role === 'user') return 'role-user';
    return 'role-agent';
}

export function labelFromRole(role, roleId, instanceId) {
    if (role === 'user') return 'System';
    if (roleId === 'coordinator_agent') return 'Coordinator';
    if (roleId) return roleId;
    return instanceId ? instanceId.slice(0, 8) : 'Agent';
}

export function scrollBottom(container) {
    if (container) container.scrollTop = container.scrollHeight;
}

function findLatestToolBlock(contentEl, toolName) {
    if (!toolName) return null;
    const blocks = contentEl.querySelectorAll(`.tool-block[data-tool-name="${toolName}"]`);
    return blocks.length > 0 ? blocks[blocks.length - 1] : null;
}

export function findToolBlock(contentEl, toolName, toolCallId) {
    if (toolCallId) {
        const byCallId = contentEl.querySelector(`.tool-block[data-tool-call-id="${toolCallId}"]`);
        if (byCallId) return byCallId;
    }
    return findLatestToolBlock(contentEl, toolName);
}

export function setToolValidationFailureState(toolBlock, payload) {
    const statusEl = toolBlock.querySelector('.tool-status');
    const resultEl = toolBlock.querySelector('.tool-result');
    if (!statusEl || !resultEl) return;

    statusEl.innerHTML = `<svg class="status-icon status-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86l-8.2 14.2A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.73-2.94l-8.2-14.2a2 2 0 0 0-3.46 0z"/></svg>`;
    resultEl.classList.remove('error-text');
    resultEl.classList.add('warning-text');
    resultEl.innerHTML = parseMarkdown(formatValidationDetails(payload));
}

function formatValidationDetails(payload) {
    const reason = payload?.reason || 'Input validation failed before tool execution.';
    const details = payload?.details;
    if (details === undefined || details === null || details === '') {
        return `${reason}\n\nTool was not executed.`;
    }

    let detailsText = '';
    try {
        detailsText = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
    } catch (e) {
        detailsText = String(details);
    }
    return `${reason}\n\nTool was not executed.\n\n\`\`\`json\n${detailsText}\n\`\`\``;
}

export function applyToolReturn(toolBlock, content) {
    const statusEl = toolBlock.querySelector('.tool-status');
    const resultEl = toolBlock.querySelector('.tool-result');
    if (!statusEl || !resultEl) return;

    const isError = isToolEnvelopeError(content);
    if (isError) {
        statusEl.innerHTML = `<svg class="status-icon status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        resultEl.classList.add('error-text');
        resultEl.classList.remove('warning-text');
    } else {
        statusEl.innerHTML = `<svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
        resultEl.classList.remove('error-text');
        resultEl.classList.remove('warning-text');
    }

    const val = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
    resultEl.innerHTML = parseMarkdown(val);
    syncApprovalStateFromEnvelope(toolBlock, content);
}

function isToolEnvelopeError(content) {
    return !!(content && typeof content === 'object' && content.ok === false);
}

function pendingToolKey(toolName, toolCallId) {
    if (toolCallId) return `id:${toolCallId}`;
    return `name:${toolName || ''}`;
}

export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
    pendingToolBlocks[pendingToolKey(toolName, toolCallId)] = toolBlock;
    if (toolName) {
        pendingToolBlocks[pendingToolKey(toolName, null)] = toolBlock;
    }
}

export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
    if (toolCallId) {
        const byId = pendingToolBlocks[pendingToolKey(toolName, toolCallId)];
        if (byId) return byId;
    }
    return pendingToolBlocks[pendingToolKey(toolName, null)] || null;
}

export function findToolBlockInContainer(container, toolName, toolCallId, preferIdOnly = false) {
    if (toolCallId) {
        const byId = container.querySelector(`.tool-block[data-tool-call-id="${toolCallId}"]`);
        if (byId) return byId;
        if (preferIdOnly) return null;
    }
    if (!toolName) return null;
    const blocks = container.querySelectorAll(`.tool-block[data-tool-name="${toolName}"]`);
    return blocks.length > 0 ? blocks[blocks.length - 1] : null;
}

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
    return 'Approval requested, but no tool result was recorded yet. Run may have been interrupted.';
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
