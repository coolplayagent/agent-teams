/**
 * components/rounds.js
 * Renders session rounds (each user message + coordinator response + workflow)
 */
import { els } from '../utils/dom.js';
import { sysLog } from '../utils/logger.js';
import { state } from '../core/state.js';
import { fetchSessionRounds } from '../core/api.js';
import { renderNativeDAG } from './workflow.js';
import { setRoundsMode } from './sidebar.js';

export let currentRounds = [];
export let currentRound = null;

export async function loadSessionRounds(sessionId) {
    try {
        const rounds = await fetchSessionRounds(sessionId);
        currentRounds = rounds || [];

        renderRoundsListInSidebar(currentRounds);
        renderRoundContent(currentRounds[0]);

        if (currentRounds.length > 0) {
            updateWorkflowState(currentRounds[0].workflows?.length || 0);
        } else {
            updateWorkflowState(0);
        }
    } catch (e) {
        console.error("Failed loading rounds", e);
    }
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
        if (currentRound && currentRound.run_id === round.run_id) {
            item.classList.add('active');
        }
        item.onclick = () => selectRound(round);

        const dot = document.createElement('span');
        dot.className = 'round-item-dot';

        const text = document.createElement('span');
        text.className = 'round-item-text';
        text.textContent = `Round ${index + 1}: ${round.intent || 'No intent'}`;

        item.appendChild(dot);
        item.appendChild(text);
        els.roundsList.appendChild(item);
    });
}

export function selectRound(round) {
    currentRound = round;
    
    document.querySelectorAll('.round-item').forEach(el => el.classList.remove('active'));
    const activeItem = Array.from(document.querySelectorAll('.round-item')).find(
        (el, idx) => currentRounds[idx]?.run_id === round.run_id
    );
    if (activeItem) {
        activeItem.classList.add('active');
    }

    renderRoundContent(round);
    updateWorkflowState(round.workflows?.length || 0);
}

function renderRoundContent(round) {
    const container = els.chatMessages;
    if (!container) return;

    container.innerHTML = '';

    if (!round) {
        container.innerHTML = `
            <div class="system-intro">
                <div class="intro-icon">🛸</div>
                <h1>Welcome to Agent Teams</h1>
                <p>Select a session or create a new one to begin.</p>
            </div>
        `;
        return;
    }

    const time = new Date(round.created_at).toLocaleString();
    
    const headerEl = document.createElement('div');
    headerEl.className = 'round-detail-header';
    headerEl.innerHTML = `
        <div class="round-detail-label">Round ${currentRounds.indexOf(round) + 1}</div>
        <div class="round-detail-time">${time}</div>
        <div class="round-detail-intent">
            <span class="intent-label">Intent:</span>
            <span class="intent-text">${escapeHtml(round.intent || 'No intent')}</span>
        </div>
    `;
    container.appendChild(headerEl);

    if (round.coordinator_messages && round.coordinator_messages.length > 0) {
        round.coordinator_messages.forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = `message ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`;
            
            let content = '';
            if (msg.message && msg.message.parts) {
                msg.message.parts.forEach(part => {
                    if (part.part_kind === 'text') {
                        content += `<div class="msg-content">${escapeHtml(part.content)}</div>`;
                    } else if (part.part_kind === 'tool-call') {
                        content += `<div class="tool-call">${part.tool_name}(${escapeHtml(part.args)})</div>`;
                    } else if (part.part_kind === 'tool-result') {
                        content += `<div class="tool-result">${escapeHtml(part.content || '')}</div>`;
                    }
                });
            }

            msgEl.innerHTML = `
                <div class="msg-header">
                    <span class="msg-role role-${msg.role}">${msg.role === 'user' ? 'You' : 'Coordinator'}</span>
                </div>
                ${content}
            `;
            container.appendChild(msgEl);
        });
    }

    container.scrollTop = container.scrollHeight;
}

function updateWorkflowState(workflowCount) {
    if (!els.workflowCount || !els.workflowCollapsed || !els.workflowPanel) return;

    els.workflowCount.textContent = workflowCount;

    if (workflowCount > 0) {
        els.workflowCollapsed.style.display = 'block';
        els.workflowPanel.style.display = 'none';
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
        
        if (currentRound && currentRound.workflows && currentRound.workflows.length > 0) {
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
    els.chatMessages.innerHTML = `
        <div class="system-intro">
            <div class="intro-icon">🛸</div>
            <h1>Welcome to Agent Teams</h1>
            <p>Select a session from the sidebar to view details.</p>
        </div>
    `;
    els.workflowPanel.style.display = 'none';
    els.workflowCollapsed.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

import { setSessionMode } from './sidebar.js';
