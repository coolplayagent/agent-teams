// js/ui.js
import { els, state } from './state.js';
import { loadSessions, createNewSession, startIntentStream } from './api.js';
import { sysLog, appendUserMessage } from './dom.js';

export async function init() {
    setupEventListeners();
    await loadSessions();
    sysLog("Application initialized.");
}

function setupEventListeners() {
    els.newBtn.addEventListener('click', () => createNewSession(true));

    els.promptInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    els.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            const val = els.promptInput.value;
            els.promptInput.value = val + '\n';
            els.promptInput.dispatchEvent(new Event('input'));
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            els.chatForm.dispatchEvent(new Event('submit'));
        }
    });

    els.chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = els.promptInput.value.trim();
        if (!text || state.isGenerating) return;

        if (!state.currentSessionId) {
            await createNewSession(false);
        }

        els.promptInput.value = '';
        els.promptInput.style.height = 'auto';

        appendUserMessage(text);
        startIntentStream(text);
    });

    const toggleInsp = document.getElementById('toggle-inspector');
    if (toggleInsp) {
        toggleInsp.addEventListener('click', () => {
            els.inspectorPanel.classList.toggle('collapsed');
        });
    }

    const toggleSb = document.getElementById('toggle-sidebar');
    if (toggleSb) {
        toggleSb.addEventListener('click', () => {
            const sb = document.querySelector('.sidebar');
            if (sb) sb.classList.toggle('collapsed');
        });
    }

    const glbtn = document.getElementById('global-timeline-btn');
    if (glbtn) {
        glbtn.addEventListener('click', () => {
            import('./api.js').then(m => m.switchTab('main'));
        });
    }
}
