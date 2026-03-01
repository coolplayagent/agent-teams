/**
 * components/rounds.js
 * Renders session rounds (sidebar list + main area coordinator view).
 */
import { els } from '../utils/dom.js';
import { state } from '../core/state.js';
import { fetchSessionRounds } from '../core/api.js';
import { renderNativeDAG } from './workflow.js';
import { setSessionMode } from './sidebar.js';
import { renderHistoricalMessageList, clearAllStreamState } from './messageRenderer.js';
import { clearAllPanels } from './agentPanel.js';

export let currentRounds = [];
export let currentRound = null;

export async function loadSessionRounds(sessionId) {
    try {
        const rounds = await fetchSessionRounds(sessionId);
        currentRounds = rounds || [];
        renderRoundsListInSidebar(currentRounds);

        if (currentRounds.length > 0) {
            selectRound(currentRounds[0]);
        } else {
            renderRoundContent(null);
            updateWorkflowState(0, null);
        }
    } catch (e) {
        console.error('Failed loading rounds', e);
    }
}

export function createLiveRound(intentText) {
    const liveRound = {
        run_id: '__live__',
        created_at: new Date().toISOString(),
        intent: intentText,
        coordinator_messages: [],
        workflows: [],
        instance_role_map: {},
        role_instance_map: {},
    };

    currentRounds = [liveRound, ...currentRounds];
    currentRound = liveRound;

    renderRoundsListInSidebar(currentRounds);
    clearAllPanels();
    clearAllStreamState();
    state.instanceRoleMap = {};

    const container = els.chatMessages;
    if (container) {
        container.innerHTML = '';
        const headerEl = document.createElement('div');
        headerEl.className = 'round-detail-header';
        headerEl.innerHTML = `
            <div class="round-detail-label">Round 1 <span class="live-badge">LIVE</span></div>
            <div class="round-detail-time">${new Date().toLocaleString()}</div>
            <div class="round-detail-intent">
                <span class="intent-label">Intent:</span>
                <span class="intent-text">${_esc(intentText)}</span>
            </div>`;
        container.appendChild(headerEl);
    }

    if (els.workflowPanel) {
        els.workflowPanel.style.display = 'flex';
        const canvas = document.getElementById('workflow-canvas');
        if (canvas) canvas.innerHTML = '<div class="panel-empty">Waiting for coordinator to create workflow graph...</div>';
    }
    if (els.workflowCollapsed) els.workflowCollapsed.style.display = 'none';
}

function renderRoundsListInSidebar(rounds) {
    if (!els.roundsList) return;
    els.roundsList.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'rounds-header';
    header.textContent = 'Rounds';
    els.roundsList.appendChild(header);

    rounds.forEach((round, index) => {
        const item = document.createElement('div');
        item.className = 'round-item';
        if (currentRound?.run_id === round.run_id) item.classList.add('active');
        item.onclick = () => selectRound(round);

        const dot = document.createElement('span');
        dot.className = 'round-item-dot';

        const label = round.run_id === '__live__'
            ? `Live Round ${index + 1}: ${round.intent || ''}`
            : `Round ${index + 1}: ${round.intent || 'No intent'}`;

        const text = document.createElement('span');
        text.className = 'round-item-text';
        text.textContent = label;

        item.appendChild(dot);
        item.appendChild(text);
        els.roundsList.appendChild(item);
    });
}

export function selectRound(round) {
    currentRound = round;

    document.querySelectorAll('.round-item').forEach((el, idx) => {
        el.classList.toggle('active', currentRounds[idx]?.run_id === round.run_id);
    });

    clearAllPanels();
    clearAllStreamState();
    state.instanceRoleMap = round?.instance_role_map || {};

    renderRoundContent(round);
    updateWorkflowState(round?.workflows?.length ?? 0, round);
}

function renderRoundContent(round) {
    const container = els.chatMessages;
    if (!container) return;
    container.innerHTML = '';

    if (!round) {
        container.innerHTML = `
            <div class="system-intro">
                <div class="intro-icon">info</div>
                <h1>Welcome to Agent Teams</h1>
                <p>Select a session or create a new one to begin.</p>
            </div>`;
        return;
    }

    const time = new Date(round.created_at).toLocaleString();
    const idx = currentRounds.indexOf(round);
    const headerEl = document.createElement('div');
    headerEl.className = 'round-detail-header';
    headerEl.innerHTML = `
        <div class="round-detail-label">Round ${idx + 1}</div>
        <div class="round-detail-time">${time}</div>
        <div class="round-detail-intent">
            <span class="intent-label">Intent:</span>
            <span class="intent-text">${_esc(round.intent || 'No intent')}</span>
        </div>`;
    container.appendChild(headerEl);

    if (round.coordinator_messages?.length > 0) {
        renderHistoricalMessageList(container, round.coordinator_messages);
    }

    container.scrollTop = container.scrollHeight;
}

function updateWorkflowState(workflowCount, round) {
    if (!els.workflowCount || !els.workflowCollapsed || !els.workflowPanel) return;
    els.workflowCount.textContent = workflowCount;

    if (workflowCount > 0) {
        els.workflowPanel.style.display = 'flex';
        els.workflowCollapsed.style.display = 'none';
        if (round?.workflows?.length > 0) {
            renderNativeDAG(round.workflows[round.workflows.length - 1]);
        }
    } else {
        els.workflowCollapsed.style.display = 'none';
        els.workflowPanel.style.display = 'none';
    }
}

export function toggleWorkflow() {
    if (!els.workflowPanel || !els.workflowCollapsed) return;
    const isHidden = els.workflowPanel.style.display === 'none' || els.workflowPanel.style.display === '';
    if (isHidden) {
        els.workflowPanel.style.display = 'flex';
        els.workflowCollapsed.style.display = 'none';
        if (currentRound?.workflows?.length > 0) {
            renderNativeDAG(currentRound.workflows[currentRound.workflows.length - 1]);
        }
    } else {
        els.workflowPanel.style.display = 'none';
        els.workflowCollapsed.style.display = 'block';
    }
}

export function goBackToSessions() {
    setSessionMode();
    currentRound = null;
    currentRounds = [];
    clearAllPanels();
    clearAllStreamState();
    state.instanceRoleMap = {};

    els.chatMessages.innerHTML = `
        <div class="system-intro">
            <div class="intro-icon">info</div>
            <h1>Welcome to Agent Teams</h1>
            <p>Select a session from the sidebar to view details.</p>
        </div>`;

    if (els.workflowPanel) els.workflowPanel.style.display = 'none';
    if (els.workflowCollapsed) els.workflowCollapsed.style.display = 'none';
}

function _esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}
