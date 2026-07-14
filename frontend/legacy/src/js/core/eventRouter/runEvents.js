/**
 * core/eventRouter/runEvents.js
 * Handlers for run lifecycle and model-step events.
 */
import {
    clearRunPrimaryRole,
    getPrimaryRoleId,
    getRunPrimaryRoleId,
    getRunPrimaryRoleLabel,
    isRunPrimaryRoleId,
    state,
} from '../state.js';
import {
    markRunStreamConnected,
    markRunTerminalState,
} from '../../app/recovery.js';
import {
    beginLlmRetryAttempt,
    clearLlmRetryStatus,
    markLlmRetryFailed,
    markLlmRetrySucceeded,
    showLlmRetryStatus,
} from '../../app/retryStatus.js';
import {
    markSubagentStatus,
    refreshSubagentRail,
    rememberLiveSubagent,
} from '../../components/subagentRail.js';
import {
    clearNormalModeSubagentParentStopState,
    getActiveSubagentSession,
    getActiveSubagentSessionStreamContainer,
    getNormalModeSubagentSessionByRunId,
    markNormalModeSubagentSessionsRunningForParent,
    markNormalModeSubagentSessionsStoppedForParent,
    rememberNormalModeSubagentSession,
    renderActiveSubagentSession,
    settleActiveSubagentSessionAfterTerminal,
    updateNormalModeSubagentSessionStatus,
    updateNormalModeSubagentSessionStatusByRunId,
} from '../../components/subagentSessions.js';
import { els } from '../../utils/dom.js';
import { sysLog } from '../../utils/logger.js';
import {
    applyStreamOverlayEvent,
    appendThinkingChunk,
    appendStreamChunk,
    appendStreamOutputParts,
    finalizeThinking,
    finalizeStream,
    getCoordinatorStreamOverlay,
    getRunTimelineSnapshot,
    getOrCreateStreamBlock,
    reconcileTerminalRunStreamState,
    startThinkingBlock,
} from '../../components/messageRenderer.js';
import {
    coordinatorContainerFor,
} from './utils.js';
import { markSessionTerminalRunViewed } from '../api.js';

const TERMINAL_VIEW_RETRY_DELAY_MS = 250;
const TERMINAL_VIEW_MAX_ATTEMPTS = 3;
const runtimeSetupElements = new Map();

export function handleRunStarted(eventMeta, { resumeSubagents = false } = {}) {
    sysLog(`Run started (trace: ${eventMeta?.trace_id})`);
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId;
    if (resumeSubagents) {
        markNormalModeSubagentSessionsRunningForParent(state.currentSessionId);
    } else {
        clearNormalModeSubagentParentStopState(state.currentSessionId);
    }
    if (runId) {
        markRunStreamConnected(runId, { phase: 'running' });
    }
    state.activeAgentRoleId = getRunPrimaryRoleId(runId) || getPrimaryRoleId() || null;
    state.activeAgentInstanceId = null;
}

export function handleLlmFallbackActivated(payload) {
    const fromProfile = escapeLogLabel(payload?.from_profile_id);
    const toProfile = escapeLogLabel(payload?.to_profile_id);
    if (fromProfile && toProfile) {
        sysLog(`Fallback activated: ${fromProfile} -> ${toProfile}`, 'log-info');
        return;
    }
    sysLog('Fallback activated.', 'log-info');
}

export function handleLlmFallbackExhausted(payload) {
    const fromProfile = escapeLogLabel(payload?.from_profile_id);
    if (fromProfile) {
        sysLog(`Fallback exhausted for ${fromProfile}.`, 'log-error');
        return;
    }
    sysLog('Fallback exhausted.', 'log-error');
}

export function handleModelStepStarted(eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    beginLlmRetryAttempt(runId);
    const normalModeSubagent = isNormalModeSubagentRun(runId, roleId);
    if (instanceId && roleId) {
        if (!state.instanceRoleMap) state.instanceRoleMap = {};
        if (!state.roleInstanceMap) state.roleInstanceMap = {};
        if (!state.autoSwitchedSubagentInstances) state.autoSwitchedSubagentInstances = {};
        state.instanceRoleMap[instanceId] = roleId;
        state.roleInstanceMap[roleId] = instanceId;
        if (!isRunPrimaryRoleId(roleId, runId) && !normalModeSubagent) {
            rememberLiveSubagent(instanceId, roleId);
            void refreshSubagentRail(state.currentSessionId, {
                preserveSelection: true,
            });
        }
        if (normalModeSubagent) {
            rememberNormalModeSubagentSession(state.currentSessionId, {
                instance_id: instanceId,
                role_id: roleId,
                run_id: runId,
                status: 'running',
            });
        }
    }
    state.activeAgentRoleId = roleId;
    state.activeAgentInstanceId = instanceId || null;
}

export function handleTextDelta(payload, eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    markLlmRetrySucceeded(runId);
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const primaryLabel = getRunPrimaryRoleLabel(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const label = isPrimary ? primaryLabel : (roleId || 'Agent');
    const streamKey = isPrimary ? 'primary' : (instanceId || roleId);

    if (isPrimary) {
        if (state.activeSubagentSession) {
            applyStreamOverlayEvent('text_delta', payload, {
                runId,
                instanceId: 'primary',
                roleId: primaryRoleId,
                label,
                eventId: eventMeta?.event_id || '',
            });
            return;
        }
        const container = coordinatorContainerFor(eventMeta);
        getOrCreateStreamBlock(container, streamKey, primaryRoleId, label, runId);
        appendStreamChunk(streamKey, payload.text || '', runId, primaryRoleId, label);
    } else {
        const container = getActiveSubagentSessionStreamContainer(instanceId);
        if (!container) {
            applySubagentOverlay('text_delta', payload, {
                runId,
                instanceId,
                roleId,
                label,
                eventMeta,
            });
            return;
        }
        getOrCreateStreamBlock(container, streamKey, roleId, label, runId);
        appendStreamChunk(streamKey, payload.text || '', runId, roleId, label);
    }
}

export function handleOutputDelta(payload, eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    markLlmRetrySucceeded(runId);
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const primaryLabel = getRunPrimaryRoleLabel(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const label = isPrimary ? primaryLabel : (roleId || 'Agent');
    const streamKey = isPrimary ? 'primary' : (instanceId || roleId);
    const output = Array.isArray(payload?.output) ? payload.output : [];

    if (isPrimary) {
        if (state.activeSubagentSession) {
            applyStreamOverlayEvent('output_delta', payload, {
                runId,
                instanceId: 'primary',
                roleId: primaryRoleId,
                label,
                eventId: eventMeta?.event_id || '',
            });
            return;
        }
        const container = coordinatorContainerFor(eventMeta);
        getOrCreateStreamBlock(container, streamKey, primaryRoleId, label, runId);
        appendStreamOutputParts(streamKey, output, {
            container,
            runId,
            roleId: primaryRoleId,
            label,
        });
        return;
    }

    const container = getActiveSubagentSessionStreamContainer(instanceId);
    if (!container) {
        applySubagentOverlay('output_delta', payload, {
            runId,
            instanceId,
            roleId,
            label,
            eventMeta,
        });
        return;
    }
    getOrCreateStreamBlock(container, streamKey, roleId, label, runId);
    appendStreamOutputParts(streamKey, output, {
        container,
        runId,
        roleId,
        label,
    });
}

export function handleGenerationProgress(payload, eventMeta, instanceId, roleId) {
    if (
        String(payload?.source || '') === 'agent_runtime_registry'
        || String(payload?.run_kind || '') === 'agent_runtime_setup'
    ) {
        renderRuntimeSetupProgress(payload, eventMeta, instanceId, roleId);
        return;
    }
    const runKind = String(payload?.run_kind || 'generation');
    const phase = String(payload?.phase || 'running');
    if (phase === 'started') {
        sysLog(`${runKind} started.`, 'log-info');
        return;
    }
    if (phase === 'completed') {
        sysLog(`${runKind} completed.`, 'log-info');
        return;
    }
    if (phase === 'failed') {
        sysLog(`${runKind} failed.`, 'log-error');
    }
}

function renderRuntimeSetupProgress(payload, eventMeta, instanceId, roleId) {
    const runId = String(eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '').trim();
    if (!runId) return;
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const container = isPrimary
        ? coordinatorContainerFor(eventMeta)
        : getActiveSubagentSessionStreamContainer(instanceId);
    if (!container) {
        applyStreamOverlayEvent('generation_progress', payload, {
            runId,
            instanceId,
            roleId: roleId || primaryRoleId,
            label: isPrimary ? getRunPrimaryRoleLabel(runId) : roleId,
            eventId: eventMeta?.event_id || '',
        });
        return;
    }
    const streamKey = runtimeSetupElementKey(runId, instanceId, roleId, isPrimary);
    let statusEl = runtimeSetupElements.get(streamKey);
    if (!statusEl || !statusEl.isConnected) {
        statusEl = document.createElement('div');
        statusEl.className = 'runtime-setup-status';
        statusEl.dataset.runId = runId;
        statusEl.dataset.streamKey = streamKey;
        statusEl.innerHTML = `
            <div class="runtime-setup-status-header">
                <div class="runtime-setup-status-title"></div>
                <div class="runtime-setup-status-percent"></div>
            </div>
            <div class="runtime-setup-status-message"></div>
            <div class="runtime-setup-progress" aria-hidden="true"><span></span></div>
            <div class="runtime-setup-status-meta"></div>
        `;
        container.appendChild(statusEl);
        runtimeSetupElements.set(streamKey, statusEl);
    }
    const phase = String(payload?.phase || 'running').trim() || 'running';
    const percent = normalizedPercent(payload?.progress_percent);
    const message = String(payload?.message || '').trim();
    const errorMessage = String(payload?.error_message || '').trim();
    const byteText = formatRuntimeSetupByteProgress(
        payload?.downloaded_bytes,
        payload?.total_bytes,
    );
    statusEl.dataset.state = phase;
    statusEl.classList.toggle('is-terminal', phase === 'completed' || phase === 'failed');
    statusEl.classList.toggle('is-error', phase === 'failed');
    statusEl.querySelector('.runtime-setup-status-title').textContent = 'Preparing Agent Runtime';
    statusEl.querySelector('.runtime-setup-status-message').textContent = (
        errorMessage || message || 'Preparing Agent Runtime...'
    );
    statusEl.querySelector('.runtime-setup-status-meta').textContent = [
        phase.replaceAll('_', ' '),
        String(payload?.registry_id || '').trim(),
        String(payload?.distribution || '').trim(),
        byteText,
    ].filter(Boolean).join(' · ');
    const percentEl = statusEl.querySelector('.runtime-setup-status-percent');
    percentEl.textContent = percent === null ? '' : `${percent}%`;
    const progressEl = statusEl.querySelector('.runtime-setup-progress');
    const progressBar = progressEl.querySelector('span');
    progressEl.classList.toggle('indeterminate', percent === null && phase !== 'completed' && phase !== 'failed');
    progressBar.style.width = `${percent === null ? 42 : percent}%`;
}

function runtimeSetupElementKey(runId, instanceId, roleId, isPrimary) {
    if (isPrimary) return `${runId}:primary`;
    return `${runId}:${String(instanceId || roleId || 'subagent').trim()}`;
}

function normalizedPercent(value) {
    if (value == null) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function formatRuntimeSetupByteProgress(downloadedBytes, totalBytes) {
    const downloaded = Number(downloadedBytes || 0);
    const total = totalBytes == null ? null : Number(totalBytes);
    if (!downloaded && !total) return '';
    if (Number.isFinite(total) && total > 0) {
        return `${formatRuntimeSetupBytes(downloaded)} / ${formatRuntimeSetupBytes(total)}`;
    }
    return formatRuntimeSetupBytes(downloaded);
}

function formatRuntimeSetupBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function handleThinkingStarted(payload, eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    markLlmRetrySucceeded(runId);
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const label = isPrimary ? getRunPrimaryRoleLabel(runId) : (roleId || 'Agent');
    const partIndex = payload?.part_index ?? 0;

    if (isPrimary) {
        if (state.activeSubagentSession) {
            applyStreamOverlayEvent('thinking_started', payload, {
                runId,
                instanceId: 'primary',
                roleId: primaryRoleId,
                label,
                eventId: eventMeta?.event_id || '',
            });
            return;
        }
        const container = coordinatorContainerFor(eventMeta);
        const streamKey = 'primary';
        getOrCreateStreamBlock(container, streamKey, primaryRoleId, label, runId);
        startThinkingBlock(streamKey, partIndex, {
            container,
            runId,
            roleId: primaryRoleId,
            label,
        });
        return;
    }

    const container = getActiveSubagentSessionStreamContainer(instanceId);
    if (!container) {
        applySubagentOverlay('thinking_started', payload, {
            runId,
            instanceId,
            roleId,
            label,
            eventMeta,
        });
        return;
    }
    getOrCreateStreamBlock(container, instanceId, roleId, label, runId);
    startThinkingBlock(instanceId, partIndex, {
        container,
        runId,
        roleId,
        label,
    });
}

export function handleThinkingDelta(payload, eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const label = isPrimary ? getRunPrimaryRoleLabel(runId) : (roleId || 'Agent');
    const partIndex = payload?.part_index ?? 0;
    const text = payload?.text || '';

    if (isPrimary) {
        if (state.activeSubagentSession) {
            applyStreamOverlayEvent('thinking_delta', payload, {
                runId,
                instanceId: 'primary',
                roleId: primaryRoleId,
                label,
                eventId: eventMeta?.event_id || '',
            });
            return;
        }
        const container = coordinatorContainerFor(eventMeta);
        const streamKey = 'primary';
        getOrCreateStreamBlock(container, streamKey, primaryRoleId, label, runId);
        appendThinkingChunk(streamKey, partIndex, text, {
            container,
            runId,
            roleId: primaryRoleId,
            label,
        });
        return;
    }

    const container = getActiveSubagentSessionStreamContainer(instanceId);
    if (!container) {
        applySubagentOverlay('thinking_delta', payload, {
            runId,
            instanceId,
            roleId,
            label,
            eventMeta,
        });
        return;
    }
    getOrCreateStreamBlock(container, instanceId, roleId, label, runId);
    appendThinkingChunk(instanceId, partIndex, text, {
        container,
        runId,
        roleId,
        label,
    });
}

export function handleThinkingFinished(payload, eventMeta, instanceId, roleId) {
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    const primaryRoleId = getRunPrimaryRoleId(runId);
    const isPrimary = !roleId || isRunPrimaryRoleId(roleId, runId);
    const partIndex = payload?.part_index ?? 0;

    if (isPrimary && state.activeSubagentSession) {
        applyStreamOverlayEvent('thinking_finished', payload, {
            runId,
            instanceId: 'primary',
            roleId: primaryRoleId,
            eventId: eventMeta?.event_id || '',
        });
        return;
    }
    if (!isPrimary && !getActiveSubagentSessionStreamContainer(instanceId)) {
        applySubagentOverlay('thinking_finished', payload, {
            runId,
            instanceId,
            roleId,
            label: roleId || 'Agent',
            eventMeta,
        });
        return;
    }

    const streamKey = isPrimary ? 'primary' : instanceId;
    finalizeThinking(streamKey, partIndex, {
        runId,
        roleId: isPrimary ? primaryRoleId : roleId,
    });
}

function applySubagentOverlay(evType, payload, options = {}) {
    const runId = String(options.runId || '').trim();
    const roleId = String(options.roleId || '').trim();
    applyStreamOverlayEvent(evType, payload, {
        runId,
        instanceId: options.instanceId,
        roleId,
        label: options.label,
        eventId: options.eventMeta?.event_id || '',
    });
}

function clearActiveModelStepIfCurrent(instanceId) {
    if (!instanceId || state.activeAgentInstanceId === instanceId) {
        state.activeAgentInstanceId = null;
        state.activeAgentRoleId = null;
    }
}

export function handleModelStepFinished(eventMeta, instanceId, roleIdOverride = '') {
    const roleId = String(roleIdOverride || state.instanceRoleMap?.[instanceId] || '').trim();
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    const isPrimary = !instanceId || (!roleId && instanceId === 'primary') || isRunPrimaryRoleId(roleId, runId);
    if (isPrimary && state.activeSubagentSession) {
        applyStreamOverlayEvent('model_step_finished', {}, {
            runId,
            instanceId: 'primary',
            roleId: getRunPrimaryRoleId(runId),
            cleanupDelayMs: 1200,
            eventId: eventMeta?.event_id || '',
        });
        clearActiveModelStepIfCurrent(instanceId);
        return;
    }
    const key = isPrimary ? 'primary' : instanceId;
    if (!isPrimary && !getActiveSubagentSessionStreamContainer(instanceId)) {
        applySubagentOverlay('model_step_finished', {}, {
            runId,
            instanceId,
            roleId,
            eventMeta,
        });
        clearActiveModelStepIfCurrent(instanceId);
        return;
    }
    finalizeStream(key, isPrimary ? getRunPrimaryRoleId(runId) : roleId, { runId });
    if (
        instanceId
        && !isPrimary
        && !isOrchestrationDelegatedSubagent(roleId, runId)
    ) {
        markSubagentStatus(instanceId, 'completed');
    }
    clearActiveModelStepIfCurrent(instanceId);
}

export function handleSubagentRunTerminal(instanceId, status, eventMeta = null, roleIdOverride = '') {
    const runId = String(eventMeta?.run_id || eventMeta?.trace_id || '').trim();
    const safeInstanceId = resolveNormalModeSubagentInstanceId(instanceId, runId);
    if (!safeInstanceId && !runId) {
        return;
    }
    const roleId = String(roleIdOverride || state.instanceRoleMap?.[safeInstanceId] || '').trim();
    if (safeInstanceId) {
        finalizeStream(safeInstanceId, roleId, { runId });
    }
    reconcileTerminalRunStreamState(runId);
    updateNormalModeSubagentRunStatus(runId, safeInstanceId, status);
    if (safeInstanceId) {
        markSubagentStatus(safeInstanceId, status);
    }
    if (getActiveSubagentSession()?.instanceId === safeInstanceId) {
        settleActiveSubagentSessionAfterTerminal(safeInstanceId);
    }
    if (state.activeAgentInstanceId === safeInstanceId) {
        state.activeAgentInstanceId = null;
        state.activeAgentRoleId = null;
    }
}

export function handleSubagentRunActive(instanceId, eventMeta = null, roleIdOverride = '') {
    const runId = String(eventMeta?.run_id || eventMeta?.trace_id || '').trim();
    const safeInstanceId = resolveNormalModeSubagentInstanceId(instanceId, runId);
    const roleId = String(roleIdOverride || state.instanceRoleMap?.[safeInstanceId] || '').trim();
    if (safeInstanceId && roleId) {
        rememberNormalModeSubagentSession(state.currentSessionId, {
            instance_id: safeInstanceId,
            role_id: roleId,
            run_id: runId,
            status: 'running',
        });
    } else {
        updateNormalModeSubagentRunStatus(runId, safeInstanceId, 'running');
    }
    if (safeInstanceId) {
        markSubagentStatus(safeInstanceId, 'running');
    }
}

export function handleRunCompleted(eventMeta, payload = null) {
    sysLog('Run completed.');
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    markLlmRetrySucceeded(runId);
    if (runId) {
        markRunTerminalState(runId, {
            status: 'completed',
            phase: 'terminal',
            recoverable: false,
        });
    }
    state.isGenerating = false;
    state.activeAgentRoleId = null;
    state.activeAgentInstanceId = null;
    if (els.sendBtn) els.sendBtn.disabled = !!state.activeSubagentSession;
    if (els.stopBtn) {
        els.stopBtn.disabled = true;
        els.stopBtn.style.display = 'none';
    }
    if (els.promptInput) {
        els.promptInput.disabled = !!state.activeSubagentSession;
        if (!state.activeSubagentSession) {
            els.promptInput.focus();
        }
    }
    appendMissingTerminalOutput(runId, payload, {
        roleId: getRunPrimaryRoleId(runId),
        label: getRunPrimaryRoleLabel(runId),
        eventMeta,
        terminalStatus: 'completed',
    });
    finalizeStream('primary', getRunPrimaryRoleId(runId), { runId });
    reconcileTerminalRunStreamState(runId);
    clearRunPrimaryRole(runId);
    markCurrentSessionTerminalViewed(eventMeta);
}

export function handleRunStopped(eventMeta, payload) {
    sysLog(`Run stopped: ${payload?.reason || 'stopped_by_user'}`, 'log-info');
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    clearLlmRetryStatus(runId);
    markNormalModeSubagentSessionsStoppedForParent(state.currentSessionId);
    if (state.activeAgentInstanceId) {
        markSubagentStatus(state.activeAgentInstanceId, 'stopped');
    }
    if (runId) {
        markRunTerminalState(runId, {
            status: 'stopped',
            phase: 'stopped',
            recoverable: true,
        });
    }
    state.isGenerating = false;
    state.activeAgentRoleId = null;
    state.activeAgentInstanceId = null;
    state.pausedSubagent = null;
    if (els.sendBtn) els.sendBtn.disabled = !!state.activeSubagentSession;
    if (els.stopBtn) {
        els.stopBtn.disabled = true;
        els.stopBtn.style.display = 'none';
    }
    if (els.promptInput) {
        els.promptInput.disabled = !!state.activeSubagentSession;
        if (!state.activeSubagentSession) {
            els.promptInput.focus();
        }
    }
    finalizeStream('primary', getRunPrimaryRoleId(runId), { runId });
    reconcileTerminalRunStreamState(runId);
    clearRunPrimaryRole(runId);
}

export function handleRunFailed(eventMeta, payload) {
    sysLog(`Run failed: ${payload?.error || ''}`, 'log-error');
    const runId = eventMeta?.run_id || eventMeta?.trace_id || state.activeRunId || '';
    markLlmRetryFailed(payload?.error || '', runId);
    if (state.activeAgentInstanceId) {
        markSubagentStatus(state.activeAgentInstanceId, 'failed');
    }
    if (runId) {
        markRunTerminalState(runId, {
            status: 'failed',
            phase: 'terminal',
            recoverable: false,
        });
    }
    state.isGenerating = false;
    state.activeAgentRoleId = null;
    state.activeAgentInstanceId = null;
    if (els.sendBtn) els.sendBtn.disabled = !!state.activeSubagentSession;
    if (els.stopBtn) {
        els.stopBtn.disabled = true;
        els.stopBtn.style.display = 'none';
    }
    if (els.promptInput) els.promptInput.disabled = !!state.activeSubagentSession;
    appendMissingTerminalOutput(runId, payload, {
        roleId: getRunPrimaryRoleId(runId),
        label: getRunPrimaryRoleLabel(runId),
        eventMeta,
        terminalStatus: 'failed',
    });
    finalizeStream('primary', getRunPrimaryRoleId(runId), { runId });
    reconcileTerminalRunStreamState(runId);
    clearRunPrimaryRole(runId);
    markCurrentSessionTerminalViewed(eventMeta);
}

function markCurrentSessionTerminalViewed(eventMeta = null) {
    const currentSessionId = String(state.currentSessionId || '').trim();
    const eventSessionId = String(eventMeta?.session_id || eventMeta?.sessionId || '').trim();
    if (!currentSessionId) {
        return;
    }
    if (eventSessionId && eventSessionId !== currentSessionId) {
        return;
    }
    void markSessionTerminalRunViewedWithRetry(currentSessionId).catch(error => {
        sysLog(
            `Failed to mark session run viewed: ${error?.message || String(error)}`,
            'log-error',
        );
    });
}

function appendMissingTerminalOutput(
    runId,
    payload,
    {
        roleId = '',
        label = '',
        eventMeta = null,
        terminalStatus = '',
    } = {},
) {
    const safeRunId = String(runId || '').trim();
    if (!safeRunId || !payload || typeof payload !== 'object') {
        return;
    }
    if (!isDisplayableTerminalOutput(payload, terminalStatus)) {
        return;
    }
    const outputParts = normalizeTerminalOutputParts(payload.output);
    if (outputParts.length === 0) {
        return;
    }
    if (
        coordinatorOverlayHasFinalContent(safeRunId)
        || coordinatorTimelineHasTerminalOutput(safeRunId, outputParts)
    ) {
        return;
    }
    const container = coordinatorContainerFor(eventMeta);
    const primaryRoleId = String(roleId || getRunPrimaryRoleId(safeRunId) || '').trim();
    const primaryLabel = String(label || getRunPrimaryRoleLabel(safeRunId) || 'Main Agent');
    getOrCreateStreamBlock(container, 'primary', primaryRoleId, primaryLabel, safeRunId);
    appendStreamOutputParts('primary', outputParts, {
        container,
        runId: safeRunId,
        roleId: primaryRoleId,
        label: primaryLabel,
    });
}

function isDisplayableTerminalOutput(payload, terminalStatus) {
    const status = String(terminalStatus || '').trim().toLowerCase();
    if (status === 'completed') {
        return true;
    }
    if (status !== 'failed') {
        return false;
    }
    const completionReason = String(payload.completion_reason || '').trim().toLowerCase();
    return completionReason === 'assistant_response';
}

function coordinatorOverlayHasFinalContent(runId) {
    const overlay = getCoordinatorStreamOverlay(runId);
    if (!overlay || !Array.isArray(overlay.parts)) {
        return false;
    }
    return overlay.parts.some(part => {
        const kind = String(part?.kind || '').trim();
        if (kind === 'text') {
            return String(part.content || part.text || '').trim().length > 0;
        }
        return kind === 'media_ref' || kind === 'inline_media';
    });
}

function coordinatorTimelineHasTerminalOutput(runId, outputParts) {
    const expectedText = normalizeTerminalOutputText(outputParts);
    if (!expectedText) {
        return false;
    }
    const timeline = getRunTimelineSnapshot(runId);
    const parts = Array.isArray(timeline?.coordinator?.parts)
        ? timeline.coordinator.parts
        : [];
    const actualText = normalizeTerminalOutputText(parts);
    if (actualText === expectedText) {
        return true;
    }
    return parts.some(part => normalizeTerminalOutputText([part]) === expectedText);
}

function normalizeTerminalOutputParts(output) {
    if (typeof output === 'string') {
        const text = output.trim();
        return text ? [{ kind: 'text', text }] : [];
    }
    if (!Array.isArray(output)) {
        return [];
    }
    return output
        .map(normalizeTerminalOutputPart)
        .filter(part => part !== null);
}

function normalizeTerminalOutputText(parts) {
    if (!Array.isArray(parts)) {
        return '';
    }
    return parts
        .filter(part => {
            const kind = String(part?.kind || part?.part_kind || '').trim();
            return kind === 'text';
        })
        .map(part => String(part.text || part.content || '').trim())
        .filter(Boolean)
        .join('\n\n')
        .trim();
}

function normalizeTerminalOutputPart(part) {
    if (!part || typeof part !== 'object') {
        return null;
    }
    const kind = String(part.kind || '').trim();
    if (kind === 'text') {
        const text = String(part.text || part.content || '').trim();
        return text ? { ...part, kind: 'text', text } : null;
    }
    if (kind === 'media_ref' || kind === 'inline_media') {
        return { ...part, kind };
    }
    return null;
}

async function markSessionTerminalRunViewedWithRetry(sessionId) {
    for (let attempt = 1; attempt <= TERMINAL_VIEW_MAX_ATTEMPTS; attempt += 1) {
        let response;
        try {
            response = await markSessionTerminalRunViewed(sessionId);
        } catch (error) {
            if (
                !isTerminalViewRetryableError(error)
                || attempt >= TERMINAL_VIEW_MAX_ATTEMPTS
            ) {
                throw error;
            }
            await waitForTerminalViewRetry();
            continue;
        }
        if (response?.status !== 'deferred') {
            return;
        }
        if (attempt < TERMINAL_VIEW_MAX_ATTEMPTS) {
            await waitForTerminalViewRetry();
        }
    }
}

function isTerminalViewRetryableError(error) {
    return Number(error?.status || 0) === 503;
}

function waitForTerminalViewRetry() {
    return new Promise(resolve => {
        const timeout = setTimeout(resolve, TERMINAL_VIEW_RETRY_DELAY_MS);
        timeout.unref?.();
    });
}

export function handleLlmRetryScheduled(payload, eventMeta) {
    const delaySeconds = Number(payload?.retry_in_ms || 0) / 1000;
    sysLog(
        `Model retry scheduled: attempt ${payload?.attempt_number || '?'} of ${payload?.total_attempts || '?'} in ${delaySeconds.toFixed(delaySeconds >= 10 ? 0 : 1)}s`,
        'log-info',
    );
    showLlmRetryStatus(payload, eventMeta);
}

export function handleLlmRetryExhausted(payload, eventMeta) {
    sysLog(
        `Model retries exhausted: attempt ${payload?.attempt_number || '?'} of ${payload?.total_attempts || '?'}`,
        'log-error',
    );
    showLlmRetryStatus({
        ...payload,
        retry_in_ms: 0,
    }, eventMeta);
    markLlmRetryFailed(payload?.error_message || '', eventMeta?.run_id || eventMeta?.trace_id || '');
}

function isNormalModeSubagentRun(runId, roleId) {
    const safeRunId = String(runId || '').trim();
    const safeRoleId = String(roleId || '').trim();
    return !!(
        state.currentSessionMode === 'normal'
        && safeRunId.startsWith('subagent_run_')
        && safeRoleId
        && !isRunPrimaryRoleId(safeRoleId, safeRunId)
    );
}

function isOrchestrationDelegatedSubagent(roleId, runId) {
    const safeRoleId = String(roleId || '').trim();
    return !!(
        state.currentSessionMode === 'orchestration'
        && safeRoleId
        && !isRunPrimaryRoleId(safeRoleId, runId)
    );
}

function resolveNormalModeSubagentInstanceId(instanceId, runId) {
    const safeInstanceId = String(instanceId || '').trim();
    if (safeInstanceId) {
        return safeInstanceId;
    }
    const match = getNormalModeSubagentSessionByRunId(state.currentSessionId, runId);
    return String(match?.instanceId || '').trim();
}

function updateNormalModeSubagentRunStatus(runId, instanceId, status) {
    const safeInstanceId = String(instanceId || '').trim();
    if (safeInstanceId) {
        updateNormalModeSubagentSessionStatus(state.currentSessionId, safeInstanceId, status);
        return;
    }
    updateNormalModeSubagentSessionStatusByRunId(state.currentSessionId, runId, status);
}

function escapeLogLabel(value) {
    return String(value || '')
        .trim()
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
