// js/state.js

export const state= {

    currentSessionId: null,
    isGenerating: false,
    activeEventSource: null,
    agentViews: {}

    ,
    activeView: 'main'
}

;

export const els= {
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
}

;

// Configure Marked.js for Markdown parsing
marked.setOptions({
    highlight: function (code, lang) {
        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            return window.hljs.highlight(code, {
                language: lang
            }).value;
    }

    return window.hljs ? window.hljs.highlightAuto(code).value : code;
}

,
breaks: true
});