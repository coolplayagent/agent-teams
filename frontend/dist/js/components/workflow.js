/**
 * components/workflow.js
 * Backward-compatible facade. New implementation lives under ./workflow/.
 */
export {
    currentWorkflows,
    loadSessionWorkflows,
    updateDagActiveNode,
    renderNativeDAG,
} from './workflow/index.js';
