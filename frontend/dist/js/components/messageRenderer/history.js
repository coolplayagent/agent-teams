/**
 * components/messageRenderer/history.js
 * Historical message rendering and approval state hydration.
 */
import {
    applyToolReturn,
    buildToolBlock,
    decoratePendingApprovalBlock,
    findToolBlockInContainer,
    labelFromRole,
    parseApprovalArgsPreview,
    renderMessageBlock,
    renderParts,
    resolvePendingToolBlock,
    scrollBottom,
} from './helpers.js';

export function renderHistoricalMessageList(container, messages, options = {}) {
    const pendingToolApprovals = Array.isArray(options.pendingToolApprovals)
        ? options.pendingToolApprovals
        : [];
    const pendingToolBlocks = {};

    messages.forEach(msgItem => {
        const role = msgItem.role;
        const msgObj = msgItem.message;
        if (!msgObj) return;

        const parts = msgObj.parts || [];

        const isPureToolReturn = role === 'user' && parts.length > 0 &&
            parts.every(p => {
                if (p.part_kind !== undefined) return p.part_kind === 'tool-return';
                return p.tool_name !== undefined && p.content !== undefined && p.args === undefined;
            });

        if (isPureToolReturn) {
            parts.forEach(part => {
                const toolBlock = resolvePendingToolBlock(
                    pendingToolBlocks,
                    part.tool_name,
                    part.tool_call_id,
                );
                if (toolBlock) applyToolReturn(toolBlock, part.content);
            });
            return;
        }

        const label = labelFromRole(role, msgItem.role_id, msgItem.instance_id);
        const { contentEl } = renderMessageBlock(container, role, label, []);
        renderParts(contentEl, parts, pendingToolBlocks);
    });

    applyPendingApprovalsToHistory(container, pendingToolApprovals);
    scrollBottom(container);
}

function applyPendingApprovalsToHistory(container, approvals) {
    if (!approvals || approvals.length === 0) return;

    const missing = [];
    approvals.forEach(approval => {
        const toolBlock = findToolBlockInContainer(
            container,
            approval?.tool_name,
            approval?.tool_call_id || null,
            true,
        );
        if (toolBlock) {
            decoratePendingApprovalBlock(toolBlock, approval);
        } else {
            missing.push(approval);
        }
    });

    if (missing.length === 0) return;
    const { contentEl } = renderMessageBlock(container, 'model', 'Coordinator', []);
    missing.forEach(approval => {
        const toolBlock = buildToolBlock(
            approval?.tool_name || 'unknown_tool',
            parseApprovalArgsPreview(approval?.args_preview),
            approval?.tool_call_id || null,
        );
        contentEl.appendChild(toolBlock);
        decoratePendingApprovalBlock(toolBlock, approval);
    });
}
