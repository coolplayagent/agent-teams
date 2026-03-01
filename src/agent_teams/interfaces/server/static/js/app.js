import { state } from './core/state.js';
import { els } from './utils/dom.js';
import { sysLog } from './utils/logger.js';
import { sendUserPrompt } from './core/api.js';
import { loadSessions, handleNewSessionClick, setSessionMode, setRoundsMode } from './components/sidebar.js';
import { startIntentStream } from './core/stream.js';
import { loadSessionRounds, toggleWorkflow, goBackToSessions, currentRounds, selectRound } from './components/rounds.js';
import { setupNavbarBindings } from './components/navbar.js';

async function init() {
    sysLog("System Initialized");
    setupNavbarBindings();

    setupEventBindings();

    await loadSessions();

    const firstSessionEl = document.querySelector('.session-item .session-id');
    if (firstSessionEl) {
        const sessionId = firstSessionEl.textContent;
        await selectSession(sessionId);
    } else {
        await handleNewSessionClick(false);
    }
}

function setupEventBindings() {
    els.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    els.sendBtn.onclick = handleSend;
    
    if (els.newSessionBtn) {
        els.newSessionBtn.onclick = () => handleNewSessionClick(true);
    }

    if (els.backBtn) {
        els.backBtn.onclick = () => {
            goBackToSessions();
            loadSessions();
        };
    }

    if (els.workflowCollapsed) {
        els.workflowCollapsed.onclick = toggleWorkflow;
    }

    if (els.collapseWorkflowBtn) {
        els.collapseWorkflowBtn.onclick = toggleWorkflow;
    }
}

init();

export async function selectSession(sessionId) {
    if (state.currentSessionId === sessionId) return;
    state.currentSessionId = sessionId;

    document.querySelectorAll('.session-item').forEach(el => {
        el.classList.remove('active');
        if (el.querySelector('.session-id')?.textContent === sessionId) {
            el.classList.add('active');
        }
    });

    setRoundsMode();
    
    els.chatMessages.style.display = 'block';
    state.agentViews = { main: els.chatMessages };
    state.activeView = 'main';

    await loadSessionRounds(sessionId);
    sysLog(`Switched to session: ${sessionId}`);
}

window.selectSession = selectSession;

async function handleSend() {
    const text = els.promptInput.value.trim();
    if (!text) return;
    if (state.isGenerating) return;
    if (!state.currentSessionId) return;

    els.promptInput.value = '';

    sysLog(`Found intent routing for prompt...`);
    try {
        await sendUserPrompt(state.currentSessionId, text);
        startIntentStream(text, state.currentSessionId, async () => {
            await loadSessionRounds(state.currentSessionId);
            
            if (currentRounds.length > 0) {
                selectRound(currentRounds[0]);
            }
        });
    } catch (e) {
        sysLog(`Failed to start interaction: ${e.message}`, 'log-error');
        state.isGenerating = false;
        els.sendBtn.disabled = false;
        els.promptInput.disabled = false;
    }
}
