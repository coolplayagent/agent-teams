/**
 * utils/dom.js
 * Centralized DOM querying and manipulation helpers.
 */

export const qs = (selector, parent = document) => parent.querySelector(selector);
export const qsa = (selector, parent = document) => parent.querySelectorAll(selector);

// Cached references to persistent UI elements
export const els = {
    sessionsList: qs('#sessions-list'),
    roundsList: qs('#rounds-list'),
    backBtn: qs('#back-btn'),
    inspectorPanel: qs('#inspector-panel'),
    systemLogs: qs('#system-logs'),
    chatMessages: qs('#chat-messages'),
    workflowPanel: qs('#workflow-panel'),
    workflowCanvas: qs('#workflow-canvas'),
    workflowCollapsed: qs('#workflow-collapsed'),
    workflowCount: qs('#workflow-count'),
    collapseWorkflowBtn: qs('#collapse-workflow'),
    sidebar: qs('.sidebar'),
    sidebarToggleBtn: qs('#toggle-sidebar'),
    inspectorToggleBtn: qs('#toggle-inspector'),
    newSessionBtn: qs('#new-btn'),
    themeToggleBtn: qs('#toggle-theme'),
    promptInput: qs('#prompt-input'),
    sendBtn: qs('#send-btn'),
    chatForm: qs('#chat-form')
};
