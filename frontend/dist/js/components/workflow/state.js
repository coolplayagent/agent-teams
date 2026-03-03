/**
 * components/workflow/state.js
 * Shared workflow list state.
 */
export let currentWorkflows = [];

export function setCurrentWorkflows(workflows) {
    currentWorkflows = workflows || [];
}
