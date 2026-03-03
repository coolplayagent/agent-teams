/**
 * components/rounds/navigator.js
 * Floating round navigator rendering and active-state sync.
 */
import { els } from '../../utils/dom.js';
import { esc } from './utils.js';

export function renderRoundNavigator(rounds, onSelectRound) {
    let nav = document.getElementById('round-nav-float');
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'round-nav-float';
        nav.className = 'round-nav-float';
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) chatContainer.appendChild(nav);
    }

    if (!rounds || rounds.length === 0) {
        nav.style.display = 'none';
        nav.innerHTML = '';
        if (els.workflowPanel) els.workflowPanel.style.display = 'none';
        if (els.workflowCollapsed) els.workflowCollapsed.style.display = 'none';
        return;
    }

    nav.style.display = 'flex';
    nav.innerHTML = `
        <div class="round-nav-title">Rounds</div>
        <div class="round-nav-list"></div>
    `;

    const list = nav.querySelector('.round-nav-list');
    rounds.forEach((round, idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'round-nav-item';
        item.dataset.runId = round.run_id;
        item.innerHTML = `
            <span class="idx">${idx + 1}</span>
            <span class="txt">${esc(round.intent || 'No intent')}</span>
        `;
        item.onclick = () => onSelectRound(round);
        list.appendChild(item);
    });
}

export function setActiveRoundNav(runId) {
    document.querySelectorAll('.round-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.runId === runId);
    });
}
