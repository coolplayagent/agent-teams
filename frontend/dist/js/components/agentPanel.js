/**
 * components/agentPanel.js
 * Backward-compatible facade. New implementation lives under ./agentPanel/.
 */
export {
    openAgentPanel,
    closeAgentPanel,
    clearAllPanels,
    loadAgentHistory,
    getPanelScrollContainer,
    showGateCard,
    removeGateCard,
    getActiveInstanceId,
} from './agentPanel/index.js';
