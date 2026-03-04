/**
 * core/eventRouter/index.js
 * Event switchboard for SSE RunEventType payloads.
 */
import { state } from '../state.js';
import { sysLog } from '../../utils/logger.js';
import { refreshDagNodeStatuses } from '../../components/workflow.js';
import {
    handleModelStepFinished,
    handleModelStepStarted,
    handleRunCompleted,
    handleRunFailed,
    handleRunStopped,
    handleRunStarted,
    handleTextDelta,
} from './runEvents.js';
import {
    handleToolApprovalRequested,
    handleToolApprovalResolved,
    handleToolCall,
    handleToolInputValidationFailed,
    handleToolResult,
} from './toolEvents.js';
import {
    handleAwaitingHumanDispatch,
    handleGateResolved,
    handleHumanTaskDispatched,
    handleSubagentResumed,
    handleSubagentStopped,
    handleSubagentGate,
} from './humanEvents.js';

export function routeEvent(evType, payload, eventMeta) {
    if (eventMeta?.run_id) state.activeRunId = eventMeta.run_id;
    if (eventMeta?.trace_id && !state.activeRunId) state.activeRunId = eventMeta.trace_id;

    const instanceId = payload?.instance_id || eventMeta?.instance_id || null;
    const taskId = payload?.task_id || eventMeta?.task_id || null;
    const roleId = payload?.role_id || eventMeta?.role_id || null;
    if (instanceId && taskId) {
        if (!state.taskInstanceMap) state.taskInstanceMap = {};
        state.taskInstanceMap[taskId] = instanceId;
    }
    if (taskId) {
        if (!state.taskStatusMap) state.taskStatusMap = {};
        const byEvent = statusFromEventType(evType);
        if (byEvent) {
            state.taskStatusMap[taskId] = byEvent;
        } else if (evType === 'model_step_started') {
            state.taskStatusMap[taskId] = 'running';
        } else if (evType === 'model_step_finished' && state.taskStatusMap[taskId] === 'running') {
            state.taskStatusMap[taskId] = 'completed';
        }
    }
    if (taskId || instanceId) {
        refreshDagNodeStatuses();
    }

    if (evType === 'run_started') {
        handleRunStarted(eventMeta);
    } else if (evType === 'model_step_started') {
        handleModelStepStarted(instanceId, roleId);
    } else if (evType === 'text_delta') {
        handleTextDelta(payload, eventMeta, instanceId, roleId);
    } else if (evType === 'model_step_finished') {
        handleModelStepFinished(instanceId);
    } else if (evType === 'run_completed') {
        handleRunCompleted();
    } else if (evType === 'run_stopped') {
        handleRunStopped(payload);
    } else if (evType === 'run_failed') {
        handleRunFailed(payload);
    } else if (evType === 'tool_call') {
        handleToolCall(payload, eventMeta, instanceId, roleId);
    } else if (evType === 'tool_input_validation_failed') {
        handleToolInputValidationFailed(payload, instanceId);
    } else if (evType === 'tool_result') {
        handleToolResult(payload, instanceId);
    } else if (evType === 'tool_approval_requested') {
        handleToolApprovalRequested(payload, eventMeta, instanceId);
    } else if (evType === 'tool_approval_resolved') {
        handleToolApprovalResolved(payload, instanceId);
    } else if (evType === 'awaiting_human_dispatch') {
        handleAwaitingHumanDispatch(payload);
    } else if (evType === 'human_task_dispatched') {
        handleHumanTaskDispatched(payload);
    } else if (evType === 'subagent_gate') {
        handleSubagentGate(payload);
    } else if (evType === 'subagent_stopped') {
        handleSubagentStopped(payload);
    } else if (evType === 'subagent_resumed') {
        handleSubagentResumed(payload);
    } else if (evType === 'gate_resolved') {
        handleGateResolved(payload, instanceId);
    } else {
        sysLog(`[evt] ${evType}`, 'log-info');
    }
}

function statusFromEventType(evType) {
    switch (evType) {
        case 'task_created':
            return 'created';
        case 'task_assigned':
            return 'assigned';
        case 'task_started':
            return 'running';
        case 'task_completed':
            return 'completed';
        case 'task_failed':
            return 'failed';
        case 'task_timeout':
            return 'timeout';
        case 'task_stopped':
            return 'stopped';
        default:
            return '';
    }
}
