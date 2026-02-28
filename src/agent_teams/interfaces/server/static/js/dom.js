// js/dom.js
import { state, els } from './state.js';
import { loadSessionMessages, switchTab } from './api.js';

export function scrollToBottom() {
    if (els.chatMessages) {
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
}

export function sysLog(message, type = 'log-info') {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    els.systemLogs.appendChild(div);
    els.systemLogs.scrollTop = els.systemLogs.scrollHeight;
}

export function appendUserMessage(text) {
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

export function renderHistoricalMessages(container, messages, instanceId) {
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
            return;
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

export function addAgentTab(roleId, instanceId, makeActive = false) {
    if (document.querySelector(`.agent-tab[data-target="${instanceId}"]`)) return;

    const friendlyName = roleId.replace('_', ' ').replace(/\\b\\w/g, l => l.toUpperCase());
    const btn = document.createElement('button');
    btn.className = 'agent-tab';
    btn.dataset.target = instanceId;
    btn.dataset.role = roleId;
    btn.innerHTML = `<span style="font-size:14px;">🤖</span> ${friendlyName}`;
    els.agentTabs.appendChild(btn);

    const view = document.createElement('div');
    view.className = 'chat-scroll';
    view.id = `view-${instanceId}`;
    view.style.display = 'none';
    els.chatMessages.parentElement.appendChild(view);
    state.agentViews[instanceId] = view;

    btn.onclick = () => switchTab(instanceId);

    if (makeActive) {
        switchTab(instanceId);
    }
}

// Variables tracking current streaming state
export let currentAgentDiv = null;
export let currentAgentContent = null;
export let currentToolBlock = null;
export let rawMarkdownBuffer = "";

export function resetDomStreams() {
    currentAgentDiv = null;
    currentAgentContent = null;
    currentToolBlock = null;
    rawMarkdownBuffer = "";
}

export function buildAgentContainer(roleId, targetContainer) {
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
            <div class="msg-text"></div>
            <div class="typing-indicator" id="typing-${roleId}">
                <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
            </div>
        </div>
    `;
    targetContainer.appendChild(div);
    currentAgentDiv = div;
    currentAgentContent = div.querySelector('.msg-text');
    rawMarkdownBuffer = "";

    if (targetContainer.id && targetContainer.id.startsWith('view-')) {
        targetContainer.scrollTop = targetContainer.scrollHeight;
    } else {
        scrollToBottom();
    }
}

export function processGlobalEvent(evType, payload, eventMeta, isHistorical = false) {
    if (evType === 'run_started') {
        sysLog(`Run started (trace: ${eventMeta.trace_id})`);
    }
    else if (evType === 'model_step_started') {
        if (payload.instance_id && payload.role_id) {
            addAgentTab(payload.role_id, payload.instance_id, false);
        }
    }
    else if (evType === 'text_delta') {
        const roleId = payload.role_id || 'agent';
        const instanceId = payload.instance_id || 'main';
        let targetContainer = state.agentViews['main'];

        if (payload.instance_id && payload.role_id) {
            addAgentTab(payload.role_id, payload.instance_id, false);
        }

        if (!currentAgentDiv || currentAgentDiv.dataset.role !== roleId || currentAgentDiv.parentElement !== targetContainer) {
            buildAgentContainer(roleId, targetContainer);
        }

        const typing = currentAgentDiv.querySelector('.typing-indicator');
        if (typing) typing.remove();

        if (roleId === 'user') {
            currentAgentContent.innerHTML = payload.text.replace(/\\n/g, '<br>');
        } else {
            rawMarkdownBuffer += payload.text;
            currentAgentContent.innerHTML = marked.parse(rawMarkdownBuffer);
        }

        if (targetContainer.id && targetContainer.id.startsWith('view-')) {
            targetContainer.scrollTop = targetContainer.scrollHeight;
        } else {
            scrollToBottom();
        }
    }
    else if (evType === 'tool_call') {
        const roleId = payload.role_id || 'agent';
        const instanceId = payload.instance_id || 'main';
        let targetContainer = state.agentViews['main'];

        if (payload.instance_id && payload.role_id) {
            addAgentTab(payload.role_id, payload.instance_id, false);
        }

        if (!currentAgentDiv || currentAgentDiv.dataset.role !== roleId || currentAgentDiv.parentElement !== targetContainer) {
            buildAgentContainer(roleId, targetContainer);
        }

        const toolBlock = document.createElement('div');
        toolBlock.className = 'tool-block';
        toolBlock.innerHTML = `
            <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <div class="tool-title">
                    <svg viewBox="0 0 24 24" fill="none" class="icon" style="width:14px; height:14px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2"/></svg>
                    Used Tool: <span class="name">${payload.tool_name}</span>
                </div>
                <div class="tool-status" id="status-${eventMeta.trace_id || eventMeta.id}">
                    <div class="spinner"></div>
                </div>
            </div>
            <div class="tool-body">
                <div class="tool-args">${JSON.stringify(payload.args, null, 2)}</div>
                <div class="tool-result" id="result-${eventMeta.trace_id || eventMeta.id}">Processing...</div>
            </div>
        `;
        if (currentAgentDiv.querySelector('.msg-content')) {
            currentAgentDiv.querySelector('.msg-content').appendChild(toolBlock);
        } else {
            currentAgentDiv.appendChild(toolBlock);
        }
        currentToolBlock = toolBlock;

        targetContainer = currentAgentDiv.parentElement;
        if (targetContainer && targetContainer.id && targetContainer.id.startsWith('view-')) {
            targetContainer.scrollTop = targetContainer.scrollHeight;
        } else {
            scrollToBottom();
        }

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
                resultContainer.classList.remove('error-text');
            }

            let renderVal = payload.result;
            if (typeof renderVal === 'object') {
                renderVal = JSON.stringify(renderVal, null, 2);
            }
            resultContainer.innerHTML = marked.parse(String(renderVal));
        }
    }
    else if (evType === 'run_finished') {
        sysLog(`Run finished. (trace: ${eventMeta.trace_id})`);

        if (!eventMeta.instance_id) {
            state.isGenerating = false;
            els.sendBtn.disabled = false;
            els.promptInput.disabled = false;
            els.promptInput.focus();
            resetDomStreams();
        }
    }
    else {
        sysLog(`Unknown event type: ${evType} `, 'log-info');
    }
}
