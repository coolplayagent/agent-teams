/**
 * core/eventRouter/toolEvents.js
 * Handlers for tool call/result/approval events.
 */
import { state } from '../state.js';
import { sysLog } from '../../utils/logger.js';
import {
    appendToolCallBlock,
    attachToolApprovalControls,
    markToolApprovalResolved,
    markToolInputValidationFailed,
    updateToolResult,
} from '../../components/messageRenderer.js';
import {
    getPanelScrollContainer,
    openAgentPanel,
} from '../../components/agentPanel.js';
import { resolveToolApproval } from '../api.js';
import {
    COORDINATOR_ROLE,
    coordinatorContainerFor,
    tryRenderLiveDAG,
} from './utils.js';

export function handleToolCall(payload, eventMeta, instanceId, roleId) {
    const isCoordinator = !roleId || roleId === COORDINATOR_ROLE;
    const container = isCoordinator
        ? coordinatorContainerFor(eventMeta)
        : getPanelScrollContainer(instanceId, roleId);
    if (!isCoordinator) openAgentPanel(instanceId, roleId);
    const streamKey = instanceId || 'coordinator';
    appendToolCallBlock(
        container,
        streamKey,
        payload.tool_name,
        payload.args,
        payload.tool_call_id || null,
    );
    sysLog(`[Tool] ${payload.tool_name}`);
}

export function handleToolInputValidationFailed(payload, instanceId) {
    const streamKey = instanceId || 'coordinator';
    const bound = markToolInputValidationFailed(streamKey, payload);
    if (!bound) {
        sysLog(
            `Tool input validation failed (not executed): ${payload.tool_name}`,
            'log-info',
        );
    }
}

export function handleToolResult(payload, instanceId) {
    const streamKey = instanceId || 'coordinator';
    const resultEnvelope = payload.result || {};
    const isError = typeof resultEnvelope === 'object'
        ? resultEnvelope.ok === false
        : !!payload.error;
    updateToolResult(
        streamKey,
        payload.tool_name,
        resultEnvelope,
        isError,
        payload.tool_call_id || null,
    );

    if (payload.tool_name === 'create_workflow_graph' && resultEnvelope) {
        tryRenderLiveDAG(resultEnvelope);
    }
}

export function handleToolApprovalRequested(payload, eventMeta, instanceId) {
    const streamKey = instanceId || 'coordinator';
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId;
    const bound = attachToolApprovalControls(streamKey, payload.tool_name, payload, {
        onApprove: async () => {
            await resolveToolApproval(runId, payload.tool_call_id, 'approve', '');
        },
        onDeny: async () => {
            await resolveToolApproval(runId, payload.tool_call_id, 'deny', '');
        },
        onError: (e) => {
            sysLog(`Tool approval failed: ${e.message}`, 'log-error');
        },
    });
    if (!bound) {
        sysLog(`Approval requested for ${payload.tool_name}`, 'log-info');
    }
}

export function handleToolApprovalResolved(payload, instanceId) {
    const streamKey = instanceId || 'coordinator';
    markToolApprovalResolved(streamKey, payload);
}
