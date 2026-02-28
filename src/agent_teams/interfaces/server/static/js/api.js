// js/api.js
import { state, els } from './state.js';
import { sysLog, renderHistoricalMessages, resetDomStreams, processGlobalEvent, addAgentTab, scrollToBottom } from './dom.js';

export async function loadSessions() {
    try {
        const res = await fetch('/session');
        const sessions = await res.json();

        els.sessionsList.innerHTML = '';
        if (sessions.length === 0) {
            els.sessionsList.innerHTML = '<div style="padding:1rem; color:var(--text-secondary); font-size:0.8rem; text-align:center;">No previous sessions</div>';
            return;
        }

        sessions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'session-item';
            div.onclick = () => selectSession(s.session_id);
            if (s.session_id === state.currentSessionId) div.classList.add('active');

            const time = new Date(s.updated_at).toLocaleString();
            div.innerHTML = `
                <span class="session-id">${s.session_id}</span>
                <span class="session-time">${time}</span>
            `;
            els.sessionsList.appendChild(div);
        });
    } catch (e) {
        sysLog(`Error loading sessions: ${e.message}`, 'log-error');
    }
}

export async function createNewSession(manualClick = true) {
    try {
        const res = await fetch('/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        sysLog(`Created new session: ${data.session_id}`);

        if (manualClick) {
            els.chatMessages.innerHTML = '';
        }

        await selectSession(data.session_id);
    } catch (e) {
        sysLog(`Error creating session: ${e.message}`, 'log-error');
    }
}

export async function selectSession(sessionId) {
    if (state.currentSessionId === sessionId) return;
    state.currentSessionId = sessionId;
    els.sessionLabel.textContent = `Session: ${sessionId}`;

    document.querySelectorAll('.session-item').forEach(el => {
        el.classList.remove('active');
        if (el.querySelector('.session-id').textContent === sessionId) {
            el.classList.add('active');
        }
    });

    els.chatMessages.innerHTML = '';
    state.agentViews = { main: els.chatMessages };
    state.activeView = 'main';

    buildAgentTabs(sessionId);
    sysLog(`Switched to session: ${sessionId}`);

    await loadSessions();
}

export async function buildAgentTabs(sessionId) {
    els.agentTabs.innerHTML = '<button class="agent-tab active" data-target="main">Global Timeline</button>';
    try {
        const res = await fetch(`/session/${sessionId}/agents`);
        const agents = await res.json();
        agents.forEach(agent => {
            addAgentTab(agent.role_id, agent.instance_id, false);
        });

        // Set global timeline listener
        els.agentTabs.querySelector('button[data-target="main"]').onclick = () => switchTab('main');

        await loadGlobalHistory(sessionId);
        await loadSessionMessages(sessionId);
    } catch (e) {
        sysLog(`Failed to load agents/history: ${e.message}`, 'log-error');
    }
}

export async function loadGlobalHistory(sessionId) {
    try {
        const res = await fetch(`/session/${sessionId}/events`);
        const events = await res.json();

        resetDomStreams();

        try {
            const rootAgentRes = await fetch(`/session/${sessionId}/agents`);
            const sessionAgents = await rootAgentRes.json();
            const coordAgent = sessionAgents.find(a => a.role_id === 'coordinator_agent');
            if (coordAgent) {
                const msgRes = await fetch(`/session/${sessionId}/agents/${coordAgent.instance_id}/messages`);
                const messages = await msgRes.json();
                messages.forEach(msg => {
                    if (msg.role === 'user') {
                        processGlobalEvent('text_delta', {
                            role_id: 'user',
                            instance_id: 'main',
                            text: (msg.parts[0]?.content || '') + '\\n'
                        }, { trace_id: 'history-user' }, true);

                        resetDomStreams();
                    }
                });
            }
        } catch (e) { console.warn("Could not splice User history", e); }

        events.forEach(eventData => {
            const evType = eventData.event_type;
            const payload = JSON.parse(eventData.payload_json || '{}');
            processGlobalEvent(evType, payload, eventData, true);
        });

        scrollToBottom();
    } catch (e) {
        console.error("Failed loading history", e);
    }
}

export async function loadSessionMessages(sessionId) {
    try {
        const res = await fetch(`/session/${sessionId}/messages`);
        const messages = await res.json();

        const byInstance = {};
        messages.forEach(m => {
            if (!byInstance[m.instance_id]) byInstance[m.instance_id] = [];
            byInstance[m.instance_id].push(m);
        });

        for (const [instanceId, msgs] of Object.entries(byInstance)) {
            let container = state.agentViews[instanceId];
            if (!container) continue;

            container.innerHTML = '';

            msgs.forEach(msgItem => {
                const role = msgItem.role;
                const msgObj = msgItem.message;
                if (!msgObj) return;

                const wrapper = document.createElement('div');
                wrapper.className = 'message';
                wrapper.dataset.role = role;

                const label = document.createElement('div');
                label.className = 'msg-header';
                const roleClass = role === 'user' ? 'role-coordinator_agent' : 'role-agent';
                label.innerHTML = `<span class="msg-role ${roleClass}">${role.toUpperCase()}</span>`;
                wrapper.appendChild(label);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'msg-content';

                let combinedMarkdown = "";

                if (msgObj.parts) {
                    msgObj.parts.forEach(part => {
                        if (part.content !== undefined && typeof part.content === 'string') {
                            combinedMarkdown += part.content + "\\n\\n";
                        }
                        if (part.tool_name) {
                            const tb = document.createElement('div');
                            tb.className = 'tool-block';
                            tb.innerHTML = `
                                <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
                                    <div class="tool-title">
                                        <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px; height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                                        Used Tool: <span class="name">${part.tool_name}</span>
                                    </div>
                                    <div class="tool-status"><svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
                                </div>
                                <div class="tool-body">
                                    <div class="tool-args">${JSON.stringify(part.args || {}, null, 2)}</div>
                                    <div class="tool-result"></div>
                                </div>
                            `;
                            contentDiv.appendChild(tb);
                        }
                        if (part.tool_name === undefined && part.content === undefined && part.tool_return !== undefined) {
                            const tb = document.createElement('div');
                            tb.className = 'tool-block';
                            tb.innerHTML = `
                                <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
                                    <div class="tool-title">
                                        <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px; height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                                        Tool Return
                                    </div>
                                </div>
                                <div class="tool-body">
                                    <div class="tool-args"></div>
                                    <div class="tool-result">${JSON.stringify(part.tool_return, null, 2)}</div>
                                </div>
                            `;
                            contentDiv.appendChild(tb);
                        }
                    });
                }

                if (combinedMarkdown) {
                    const mdDiv = document.createElement('div');
                    mdDiv.innerHTML = marked.parse(combinedMarkdown);
                    if (contentDiv.firstChild) {
                        contentDiv.insertBefore(mdDiv, contentDiv.firstChild);
                    } else {
                        contentDiv.appendChild(mdDiv);
                    }
                }

                wrapper.appendChild(contentDiv);
                container.appendChild(wrapper);
            });
            container.scrollTop = container.scrollHeight;
        }

    } catch (e) {
        console.error("Failed to load session messages", e);
    }
}

export async function switchTab(targetId) {
    if (state.activeView === targetId) return;

    els.agentTabs.querySelectorAll('.agent-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });

    Object.values(state.agentViews).forEach(view => {
        view.style.display = 'none';
    });
    const targetView = state.agentViews[targetId];
    targetView.style.display = 'block';
    state.activeView = targetId;

    if (targetId !== 'main' && targetView.innerHTML === '') {
        try {
            targetView.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Loading messages...</div>';
            const res = await fetch(`/session/${state.currentSessionId}/agents/${targetId}/messages`);
            const messages = await res.json();

            targetView.innerHTML = '';
            if (messages.length === 0) {
                targetView.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">No individual history yet</div>';
            } else {
                renderHistoricalMessages(targetView, messages, targetId);
            }
        } catch (e) {
            targetView.innerHTML = `<div style="color:var(--danger); padding:1rem;">Failed to load history</div>`;
        }
    }

    targetView.scrollTop = targetView.scrollHeight;
}

export function startIntentStream(promptText) {
    state.isGenerating = true;
    els.sendBtn.disabled = true;
    els.promptInput.disabled = true;

    if (state.activeEventSource) {
        state.activeEventSource.close();
    }

    resetDomStreams();

    const encodedPrompt = encodeURIComponent(promptText);
    const url = `/session/${state.currentSessionId}/intent/stream?intent=${encodedPrompt}`;

    sysLog(`Starting SSE connection to ${url}`);
    const es = new EventSource(url);
    state.activeEventSource = es;

    es.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const evType = data.event_type;
            const payload = JSON.parse(data.payload_json || '{}');
            processGlobalEvent(evType, payload, data);
        } catch (e) {
            console.error("Failed to parse SSE event", event.data, e);
        }
    };

    es.onerror = (err) => {
        sysLog(`SSE Connection error.Stream closed.`, 'log-error');
        endStream();
    };
}

export function endStream() {
    if (state.activeEventSource) {
        state.activeEventSource.close();
        state.activeEventSource = null;
    }
    state.isGenerating = false;
    els.sendBtn.disabled = false;
    els.promptInput.disabled = false;
    document.querySelectorAll('.typing-indicator').forEach(el => el.remove());
    els.promptInput.focus();
}
