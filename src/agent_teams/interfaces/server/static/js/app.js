/**
 * app.js — Main entry point.
 * Wires up event bindings and orchestrates navigation between sessions and rounds.
 */
import { state } from './core/state.js';
import { els } from './utils/dom.js';
import { sysLog } from './utils/logger.js';
import { loadSessions, handleNewSessionClick, setRoundsMode } from './components/sidebar.js';
import { startIntentStream } from './core/stream.js';
import { loadSessionRounds, toggleWorkflow, createLiveRound } from './components/rounds.js';
import { setupNavbarBindings } from './components/navbar.js';
import { clearAllPanels } from './components/agentPanel.js';
import { clearAllStreamState } from './components/messageRenderer.js';
import { initSettings, openSettings } from './components/settings.js';

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
    sysLog('System Initialized');
    setupNavbarBindings();
    setupEventBindings();
    initSettings();
    setupSettingsButton();
    await loadSessions();

    const firstSessionEl = document.querySelector('.session-item .session-id');
    if (firstSessionEl) {
        await selectSession(firstSessionEl.textContent);
    } else {
        await handleNewSessionClick(false);
    }
}

function setupSettingsButton() {
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.onclick = openSettings;
    }
}

function setupEventBindings() {
    els.promptInput.addEventListener('input', () => {
        els.promptInput.style.height = 'auto';
        els.promptInput.style.height = els.promptInput.scrollHeight + 'px';
    });
    els.promptInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    els.sendBtn.onclick = handleSend;
    if (els.newSessionBtn) els.newSessionBtn.onclick = () => handleNewSessionClick(true);
    if (els.workflowCollapsed) els.workflowCollapsed.onclick = toggleWorkflow;
    if (els.collapseWorkflowBtn) els.collapseWorkflowBtn.onclick = toggleWorkflow;
}

init();

// ─── Session selection ───────────────────────────────────────────────────────
export async function selectSession(sessionId) {
    const isSameSession = state.currentSessionId === sessionId;
    state.currentSessionId = sessionId;
    state.instanceRoleMap = {};

    document.querySelectorAll('.session-item').forEach(el => {
        const isActive = el.querySelector('.session-id')?.textContent === sessionId;
        el.classList.toggle('active', isActive);
    });

    setRoundsMode();
    state.agentViews = { main: els.chatMessages };
    state.activeView = 'main';
    clearAllPanels();
    clearAllStreamState();

    await loadSessionRounds(sessionId);
    sysLog(`${isSameSession ? 'Reloaded' : 'Switched to'} session: ${sessionId}`);
}

window.selectSession = selectSession;

// ─── Send / handle prompt ────────────────────────────────────────────────────
async function handleSend() {
    const text = els.promptInput.value.trim();
    if (!text || state.isGenerating || !state.currentSessionId) return;

    const modeEl = document.getElementById('execution-mode-select');
    const gateEl = document.getElementById('confirmation-gate-check');
    const executionMode = modeEl ? modeEl.value : 'ai';
    const confirmationGate = gateEl ? gateEl.checked : false;

    els.promptInput.value = '';
    els.promptInput.style.height = 'auto';
    state.instanceRoleMap = {};
    clearAllStreamState();

    // 1) Immediately create a live round entry in the sidebar and switch view
    createLiveRound(text);

    // 2) Show user message in the (now-cleared) coordinator chat area
    const um = document.createElement('div');
    um.className = 'message';
    um.dataset.role = 'user';
    um.innerHTML = `
        <div class="msg-header"><span class="msg-role role-user">YOU</span></div>
        <div class="msg-content"><div class="msg-text">${text.replace(/</g, '&lt;')}</div></div>`;
    const liveSection = els.chatMessages.querySelector('.session-round-section[data-run-id="__live__"]');
    if (liveSection) {
        liveSection.appendChild(um);
    } else {
        els.chatMessages.appendChild(um);
    }
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

    // 3) Start the SSE stream
    sysLog(`Sending (mode=${executionMode} gate=${confirmationGate})`);
    startIntentStream(
        text,
        state.currentSessionId,
        executionMode,
        confirmationGate,
        async (sid) => {
            // After the run, reload full history from backend
            await loadSessionRounds(sid);
        },
    );
}
