/**
 * components/agentPanel/state.js
 * Shared state for subagent drawer panels.
 */
const panels = new Map();
let activeInstanceId = null;

export function getPanels() {
    return panels;
}

export function getPanel(instanceId) {
    return panels.get(instanceId);
}

export function setPanel(instanceId, panel) {
    panels.set(instanceId, panel);
}

export function clearPanels() {
    panels.clear();
}

export function forEachPanel(cb) {
    panels.forEach(cb);
}

export function setActiveInstanceId(instanceId) {
    activeInstanceId = instanceId;
}

export function getActiveInstanceId() {
    return activeInstanceId;
}
