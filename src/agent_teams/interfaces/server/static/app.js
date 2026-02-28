// app.js - Agent Teams Frontend Logic

const state = {
    currentSessionId: null,
    isGenerating: false,
    activeEventSource: null
};

// DOM Elements
const els = {
    newBtn: document.getElementById('new-btn'),
    sessionsList: document.getElementById('sessions-list'),
    sessionLabel: document.getElementById('current-session-label'),
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    systemLogs: document.getElementById('system-logs'),
    toggleInspector: document.getElementById('toggle-inspector'),
    inspectorPanel: document.getElementById('inspector-panel'),
    agentTabs: document.getElementById('agent-tabs')
};

// Configure Marked.js for Markdown parsing
marked.setOptions({
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true
});

// Utility: Logging
function sysLog(message, type = 'log-info') {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    els.systemLogs.appendChild(div);
    els.systemLogs.scrollTop = els.systemLogs.scrollHeight;
}

// ----------------- Initialization ----------------- //

async function init() {
    setupEventListeners();
    await loadSessions();
    sysLog("Application initialized.");
}

function setupEventListeners() {
    els.newBtn.addEventListener('click', createNewSession);

    // Auto-resize textarea
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

    els.toggleInspector.addEventListener('click', () => {
        els.inspectorPanel.classList.toggle('collapsed');
    });
}

// ----------------- Session Management ----------------- //

async function loadSessions() {
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

async function createNewSession(manualClick = true) {
    try {
        const res = await fetch('/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        sysLog(`Created new session: ${data.session_id}`);

        if (manualClick) {
            // clear chat if manually clicked
            els.chatMessages.innerHTML = '';
        }

        await selectSession(data.session_id);
    } catch (e) {
        sysLog(`Error creating session: ${e.message}`, 'log-error');
    }
}

async function selectSession(sessionId) {
    if (state.currentSessionId === sessionId) return;
    state.currentSessionId = sessionId;
    els.sessionLabel.textContent = `Session: ${sessionId}`;

    // Update active class in UI
    document.querySelectorAll('.session-item').forEach(el => {
        el.classList.remove('active');
        if (el.querySelector('.session-id').textContent === sessionId) {
            el.classList.add('active');
        }
    });

    // Create new elements to hold different views
    els.chatMessages.innerHTML = '';
    state.agentViews = { main: els.chatMessages };
    state.activeView = 'main';

    buildAgentTabs(sessionId);
    sysLog(`Switched to session: ${sessionId}`);

    await loadSessions(); // refresh list to secure active state
}

async function buildAgentTabs(sessionId) {
    els.agentTabs.innerHTML = '<button class="agent-tab active" data-target="main">Global Timeline</button>';
    try {
        const res = await fetch(`/session/${sessionId}/agents`);
        const agents = await res.json();
        agents.forEach(agent => {
            addAgentTab(agent.role_id, agent.instance_id, false);
        });
        setupTabListeners();
    } catch (e) {
        sysLog(`Failed to load agents: ${e.message}`, 'log-error');
    }
}

function addAgentTab(roleId, instanceId, makeActive = false) {
    // avoid duplicates
    if (document.querySelector(`.agent-tab[data-target="${instanceId}"]`)) return;

    const friendlyName = roleId.replace('_', ' ').replace(/\\b\\w/g, l => l.toUpperCase());
    const btn = document.createElement('button');
    btn.className = 'agent-tab';
    btn.dataset.target = instanceId;
    btn.dataset.role = roleId;
    btn.innerHTML = `<span style="font-size:14px;">🤖</span> ${friendlyName}`;
    els.agentTabs.appendChild(btn);

    // Create hidden view for this agent
    const view = document.createElement('div');
    view.className = 'chat-scroll';
    view.id = `view-${instanceId}`;
    view.style.display = 'none';
    els.chatMessages.parentElement.appendChild(view);
    state.agentViews[instanceId] = view;

    setupTabListeners();

    if (makeActive) {
        switchTab(instanceId);
    }
}

function setupTabListeners() {
    els.agentTabs.querySelectorAll('.agent-tab').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.target);
    });
}

async function switchTab(targetId) {
    if (state.activeView === targetId) return;

    // Update active tab styling
    els.agentTabs.querySelectorAll('.agent-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });

    // Hide all views, show targeted
    Object.values(state.agentViews).forEach(view => {
        view.style.display = 'none';
    });
    const targetView = state.agentViews[targetId];
    targetView.style.display = 'block';
    state.activeView = targetId;

    // If it's a subagent and empty, fetch history
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

function renderHistoricalMessages(container, messages, instanceId) {
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        let roleName = "Unknown";
        let roleClass = "role-agent";
        let contentHtml = "";

        if (msg.role === 'user') {
            roleName = "System / Instruction";
            roleClass = "role-coordinator_agent";
            contentHtml = (msg.parts[0]?.content || '').replace(/\\n/g, '<br>');
        } else if (msg.role === 'model-response') {
            const btn = document.querySelector(`.agent-tab[data-target="${instanceId}"]`);
            roleName = btn ? btn.textContent.replace('🤖', '').trim() : "Assistant";

            for (const part of msg.parts) {
                if (part.part_kind === 'text') {
                    contentHtml += marked.parse(part.content);
                } else if (part.part_kind === 'tool-call') {
                    contentHtml += `
                        <div class="tool-block">
                            <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
                                <div class="tool-title">Used Tool: <span class="name">${part.tool_name}</span></div>
                                <div class="tool-status"><svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
                            </div>
                            <div class="tool-body">
                                <div class="tool-args">${JSON.stringify(part.args, null, 2)}</div>
                            </div>
                        </div>
                    `;
                }
            }
        } else if (msg.role === 'tool-return') {
            return; // We skip standalone tool-returns as they disrupt the flow, usually attached to prior calls
        }

        if (!contentHtml) return;

        div.innerHTML = `
            <div class="msg-header">
                <span class="msg-role ${roleClass}">${roleName}</span>
            </div>
            <div class="msg-content">${contentHtml}</div>
        `;
        container.appendChild(div);
    });
}



// ----------------- Chat & Streaming ----------------- //

function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <div class="msg-header">
            <span class="msg-role role-user">You</span>
        </div>
        <div class="msg-content">${text.replace(/\\n/g, '<br>')}</div>
    `;
    els.chatMessages.appendChild(div);
    scrollToBottom();
}

// Variables tracking current streaming state
let currentAgentDiv = null;
let currentAgentContent = null;
let currentToolBlock = null;
let rawMarkdownBuffer = "";

function startIntentStream(promptText) {
    state.isGenerating = true;
    els.sendBtn.disabled = true;
    els.promptInput.disabled = true;

    // Close existing stream if any
    if (state.activeEventSource) {
        state.activeEventSource.close();
    }

    // Reset rendering states
    currentAgentDiv = null;
    currentAgentContent = null;
    currentToolBlock = null;
    rawMarkdownBuffer = "";

    const encodedPrompt = encodeURIComponent(promptText);
    const url = `/session/${state.currentSessionId}/intent/stream?intent=${encodedPrompt}`;

    sysLog(`Starting SSE connection to ${url}`);
    const es = new EventSource(url);
    state.activeEventSource = es;

    function buildAgentContainer(roleId) {
        const div = document.createElement('div');
        div.className = 'message';
        div.dataset.role = roleId;

        const friendlyName = roleId.replace('_', ' ').replace(/\\b\\w/g, l => l.toUpperCase());
        const roleClass = roleId === 'coordinator_agent' ? 'role-coordinator_agent' : 'role-agent';

        div.innerHTML = `
            <div class="msg-header">
                <span class="msg-role ${roleClass}">${friendlyName}</span>
            </div>
            <div class="msg-content">
                <div class="typing-indicator" id="typing-${roleId}">
                    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
                </div>
            </div>
        `;
        els.chatMessages.appendChild(div);
        currentAgentDiv = div;
        currentAgentContent = div.querySelector('.msg-content');
        rawMarkdownBuffer = "";
        scrollToBottom();
    }

    es.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const evType = data.event_type;
            const payload = JSON.parse(data.payload_json || '{}');

            // Handle different events
            if (evType === 'run_started') {
                sysLog(`Run started (trace: ${data.trace_id})`);
            }
            else if (evType === 'model_step_started') {
                if (payload.instance_id && payload.role_id) {
                    addAgentTab(payload.role_id, payload.instance_id, false);
                }
            }
            else if (evType === 'text_delta') {
                const roleId = payload.role_id || 'agent';
                if (payload.instance_id && payload.role_id) {
                    addAgentTab(payload.role_id, payload.instance_id, false);
                }

                if (!currentAgentDiv || currentAgentDiv.dataset.role !== roleId) {
                    buildAgentContainer(roleId);
                }

                // remove typing indicator
                const typing = currentAgentContent.querySelector('.typing-indicator');
                if (typing) typing.remove();

                rawMarkdownBuffer += payload.text;
                currentAgentContent.innerHTML = marked.parse(rawMarkdownBuffer);
                scrollToBottom();
            }
            else if (evType === 'tool_call') {
                const roleId = payload.role_id || 'agent';
                if (payload.instance_id && payload.role_id) {
                    addAgentTab(payload.role_id, payload.instance_id, false);
                }

                if (!currentAgentDiv || currentAgentDiv.dataset.role !== roleId) {
                    buildAgentContainer(roleId);
                }

                // Build a new tool block inside current agent message
                const toolBlock = document.createElement('div');
                toolBlock.className = 'tool-block';
                toolBlock.innerHTML = `
                    <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
                        <div class="tool-title">
                            <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px; height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                            Used Tool: <span class="name">${payload.tool_name}</span>
                        </div>
                        <div class="tool-status" id="status-${data.trace_id}">
                            <div class="spinner"></div>
                        </div>
                    </div>
                    <div class="tool-body">
                        <div class="tool-args">${JSON.stringify(payload.args, null, 2)}</div>
                        <div class="tool-result" id="result-${data.trace_id}">Processing...</div>
                    </div>
                `;
                currentAgentDiv.appendChild(toolBlock);
                currentToolBlock = toolBlock; // Track it so tool_result knows where to go
                scrollToBottom();
                sysLog(`[Tool] Calling ${payload.tool_name}...`);
            }
            else if (evType === 'tool_result') {
                if (currentToolBlock) {
                    const statusIcon = currentToolBlock.querySelector('.tool-status');
                    const resultContainer = currentToolBlock.querySelector('.tool-result');

                    if (payload.error) {
                        statusIcon.innerHTML = `<svg class="status-icon status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
                        resultContainer.classList.add('error-text');
                    } else {
                        statusIcon.innerHTML = `<svg class="status-icon status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
                    }

                    try {
                        // format JSON if it is parsable
                        const resObj = JSON.parse(payload.result);
                        resultContainer.textContent = JSON.stringify(resObj, null, 2);
                    } catch {
                        resultContainer.textContent = payload.result;
                    }
                }
                currentToolBlock = null; // reset
                sysLog(`[Tool] Finished ${payload.tool_name}`);
                scrollToBottom();
            }
            else if (evType === 'run_completed' || evType === 'run_failed') {
                sysLog(`Run finished with status: ${evType}`);
                endStream();
            }

        } catch (e) {
            console.error("Failed to parse SSE event", event.data, e);
        }
    };

    es.onerror = (err) => {
        sysLog(`SSE Connection error. Stream closed.`, 'log-error');
        endStream();
    };
}

function endStream() {
    if (state.activeEventSource) {
        state.activeEventSource.close();
        state.activeEventSource = null;
    }
    state.isGenerating = false;
    els.sendBtn.disabled = false;
    els.promptInput.disabled = false;
    // Remove typing indicators
    document.querySelectorAll('.typing-indicator').forEach(el => el.remove());
    els.promptInput.focus();
}

function scrollToBottom() {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// Bootstrap
window.addEventListener('DOMContentLoaded', init);
