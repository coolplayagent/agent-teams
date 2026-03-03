/**
 * core/eventRouter/runEvents.js
 * Handlers for run lifecycle and model-step events.
 */
import { state } from '../state.js';
import { els } from '../../utils/dom.js';
import { sysLog } from '../../utils/logger.js';
import { updateDagActiveNode } from '../../components/workflow.js';
import {
    appendStreamChunk,
    finalizeStream,
    getOrCreateStreamBlock,
} from '../../components/messageRenderer.js';
import {
    getPanelScrollContainer,
    openAgentPanel,
} from '../../components/agentPanel.js';
import {
    COORDINATOR_ROLE,
    coordinatorContainerFor,
} from './utils.js';

export function handleRunStarted(eventMeta) {
    sysLog(`Run started (trace: ${eventMeta?.trace_id})`);
    state.activeAgentRoleId = COORDINATOR_ROLE;
    updateDagActiveNode();
}

export function handleModelStepStarted(instanceId, roleId) {
    if (instanceId && roleId) {
        if (!state.instanceRoleMap) state.instanceRoleMap = {};
        state.instanceRoleMap[instanceId] = roleId;
        if (roleId !== COORDINATOR_ROLE) {
            getPanelScrollContainer(instanceId, roleId);
        }
    }
    state.activeAgentRoleId = roleId;
    updateDagActiveNode();
}

export function handleTextDelta(payload, eventMeta, instanceId, roleId) {
    const isCoordinator = !roleId || roleId === COORDINATOR_ROLE;
    const label = isCoordinator ? 'Coordinator' : (roleId || 'Agent');
    const streamKey = instanceId || (isCoordinator ? 'coordinator' : roleId);

    if (isCoordinator) {
        const container = coordinatorContainerFor(eventMeta);
        getOrCreateStreamBlock(container, streamKey, COORDINATOR_ROLE, label);
        appendStreamChunk(streamKey, payload.text || '');
    } else {
        const container = getPanelScrollContainer(instanceId, roleId);
        openAgentPanel(instanceId, roleId);
        getOrCreateStreamBlock(container, instanceId, roleId, label);
        appendStreamChunk(instanceId, payload.text || '');
    }
}

export function handleModelStepFinished(instanceId) {
    const key = instanceId || 'coordinator';
    finalizeStream(key);
}

export function handleRunCompleted() {
    sysLog('Run completed.');
    state.isGenerating = false;
    state.activeAgentRoleId = null;
    if (els.sendBtn) els.sendBtn.disabled = false;
    if (els.promptInput) {
        els.promptInput.disabled = false;
        els.promptInput.focus();
    }
    finalizeStream('coordinator');
    updateDagActiveNode();
}

export function handleRunFailed(payload) {
    sysLog(`Run failed: ${payload?.error || ''}`, 'log-error');
    state.isGenerating = false;
    if (els.sendBtn) els.sendBtn.disabled = false;
    if (els.promptInput) els.promptInput.disabled = false;
}
