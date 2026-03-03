/**
 * components/settings/systemStatus.js
 * MCP/Skills tab logic.
 */
import {
    fetchConfigStatus,
    reloadMcpConfig,
    reloadSkillsConfig,
} from '../../core/api.js';

export function bindSystemStatusHandlers() {
    const reloadMcpBtn = document.getElementById('reload-mcp-btn');
    if (reloadMcpBtn) {
        reloadMcpBtn.onclick = handleReloadMcp;
    }

    const reloadSkillsBtn = document.getElementById('reload-skills-btn');
    if (reloadSkillsBtn) {
        reloadSkillsBtn.onclick = handleReloadSkills;
    }
}

export async function loadMcpStatusPanel() {
    try {
        const status = await fetchConfigStatus();
        const mcpStatus = document.getElementById('mcp-status');
        const servers = status.mcp?.servers || [];
        if (servers.length === 0) {
            mcpStatus.innerHTML = '<p>No MCP servers loaded.</p>';
        } else {
            mcpStatus.innerHTML = '<ul>' + servers.map(s => `<li>${s}</li>`).join('') + '</ul>';
        }
    } catch (e) {
        console.error('Failed to load MCP status:', e);
    }
}

export async function loadSkillsStatusPanel() {
    try {
        const status = await fetchConfigStatus();
        const skillsStatus = document.getElementById('skills-status');
        const skills = status.skills?.skills || [];
        if (skills.length === 0) {
            skillsStatus.innerHTML = '<p>No skills loaded.</p>';
        } else {
            skillsStatus.innerHTML = '<ul>' + skills.map(s => `<li>${s}</li>`).join('') + '</ul>';
        }
    } catch (e) {
        console.error('Failed to load skills status:', e);
    }
}

async function handleReloadMcp() {
    try {
        await reloadMcpConfig();
        alert('MCP config reloaded!');
        await loadMcpStatusPanel();
    } catch (e) {
        alert(`Failed to reload: ${e.message}`);
    }
}

async function handleReloadSkills() {
    try {
        await reloadSkillsConfig();
        alert('Skills reloaded!');
        await loadSkillsStatusPanel();
    } catch (e) {
        alert(`Failed to reload: ${e.message}`);
    }
}
