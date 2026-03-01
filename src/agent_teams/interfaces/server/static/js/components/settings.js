/**
 * components/settings.js
 * Settings modal for configuration management.
 */
import { fetchConfigStatus, fetchModelProfiles, saveModelProfile, deleteModelProfile, reloadModelConfig, reloadMcpConfig, reloadSkillsConfig } from '../core/api.js';

let settingsModal = null;
let currentTab = 'model';
let profiles = {};
let editingProfile = null;

export function initSettings() {
    _createModal();
    _setupEventListeners();
}

function _createModal() {
    settingsModal = document.createElement('div');
    settingsModal.id = 'settings-modal';
    settingsModal.className = 'modal';
    settingsModal.innerHTML = `
        <div class="modal-content settings-modal-content">
            <div class="modal-header">
                <h2>Settings</h2>
                <button class="close-btn" id="settings-close">&times;</button>
            </div>
            <div class="settings-tabs">
                <button class="settings-tab active" data-tab="model">Model Profiles</button>
                <button class="settings-tab" data-tab="mcp">MCP Config</button>
                <button class="settings-tab" data-tab="skills">Skills</button>
            </div>
            <div class="settings-body">
                <div class="settings-panel" id="model-panel">
                    <div class="settings-section">
                        <div class="section-header">
                            <h3>Model Profiles</h3>
                        </div>
                        <div class="profiles-list" id="profiles-list"></div>
                        <div class="profile-editor" id="profile-editor" style="display:none;">
                            <h4 id="profile-editor-title">Add Profile</h4>
                            <div class="form-group">
                                <label>Profile Name:</label>
                                <input type="text" id="profile-name" placeholder="e.g., default, kimi">
                            </div>
                            <div class="form-group">
                                <label>Model:</label>
                                <input type="text" id="profile-model" placeholder="e.g., gpt-4o, kimi-k2.5">
                            </div>
                            <div class="form-group">
                                <label>Base URL:</label>
                                <input type="text" id="profile-base-url" placeholder="e.g., https://api.openai.com/v1">
                            </div>
                            <div class="form-group">
                                <label>API Key:</label>
                                <input type="password" id="profile-api-key" placeholder="sk-...">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Temperature:</label>
                                    <input type="number" id="profile-temperature" value="0.7" step="0.1" min="0" max="2">
                                </div>
                                <div class="form-group">
                                    <label>Top P:</label>
                                    <input type="number" id="profile-top-p" value="1.0" step="0.1" min="0" max="1">
                                </div>
                                <div class="form-group">
                                    <label>Max Tokens:</label>
                                    <input type="number" id="profile-max-tokens" value="4096" min="1">
                                </div>
                            </div>
                            <div class="form-actions">
                                <button class="primary-btn" id="save-profile-btn">Save</button>
                                <button class="secondary-btn" id="cancel-profile-btn">Cancel</button>
                            </div>
                        </div>
                        <button class="primary-btn" id="add-profile-btn" style="margin-top:10px;">+ Add Profile</button>
                    </div>
                </div>
                <div class="settings-panel" id="mcp-panel" style="display:none;">
                    <div class="settings-section">
                        <div class="section-header">
                            <h3>MCP Servers</h3>
                            <button class="primary-btn" id="reload-mcp-btn">Reload</button>
                        </div>
                        <div class="status-info" id="mcp-status"></div>
                    </div>
                </div>
                <div class="settings-panel" id="skills-panel" style="display:none;">
                    <div class="settings-section">
                        <div class="section-header">
                            <h3>Skills</h3>
                            <button class="primary-btn" id="reload-skills-btn">Reload</button>
                        </div>
                        <div class="status-info" id="skills-status"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(settingsModal);
}

function _setupEventListeners() {
    const closeBtn = document.getElementById('settings-close');
    if (closeBtn) {
        closeBtn.onclick = closeSettings;
    }

    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    };

    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.onclick = () => {
            currentTab = tab.dataset.tab;
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _showPanel(currentTab);
        };
    });

    const addProfileBtn = document.getElementById('add-profile-btn');
    if (addProfileBtn) {
        addProfileBtn.onclick = _handleAddProfile;
    }

    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = _handleSaveProfile;
    }

    const cancelProfileBtn = document.getElementById('cancel-profile-btn');
    if (cancelProfileBtn) {
        cancelProfileBtn.onclick = _handleCancelProfile;
    }

    const reloadMcpBtn = document.getElementById('reload-mcp-btn');
    if (reloadMcpBtn) {
        reloadMcpBtn.onclick = _handleReloadMcp;
    }

    const reloadSkillsBtn = document.getElementById('reload-skills-btn');
    if (reloadSkillsBtn) {
        reloadSkillsBtn.onclick = _handleReloadSkills;
    }
}

async function _showPanel(tab) {
    document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`${tab}-panel`).style.display = 'block';

    if (tab === 'model') {
        await _loadModelProfiles();
    } else if (tab === 'mcp') {
        await _loadMcpStatus();
    } else if (tab === 'skills') {
        await _loadSkillsStatus();
    }
}

async function _loadModelProfiles() {
    try {
        profiles = await fetchModelProfiles();
        _renderProfiles();
    } catch (e) {
        console.error('Failed to load model profiles:', e);
    }
}

function _renderProfiles() {
    const listEl = document.getElementById('profiles-list');
    const editorEl = document.getElementById('profile-editor');
    const addBtn = document.getElementById('add-profile-btn');
    
    editorEl.style.display = 'none';
    addBtn.style.display = 'block';
    
    if (Object.keys(profiles).length === 0) {
        listEl.innerHTML = '<p class="empty-message">No profiles configured. Click "Add Profile" to create one.</p>';
        return;
    }

    let html = '<div class="profile-cards">';
    for (const [name, profile] of Object.entries(profiles)) {
        html += `
            <div class="profile-card">
                <div class="profile-card-header">
                    <h4>${name}</h4>
                    <div class="profile-card-actions">
                        <button class="icon-btn edit-profile-btn" data-name="${name}" title="Edit">✏️</button>
                        <button class="icon-btn delete-profile-btn" data-name="${name}" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="profile-card-body">
                    <p><strong>Model:</strong> ${profile.model || '-'}</p>
                    <p><strong>Base URL:</strong> ${profile.base_url || '-'}</p>
                    <p><strong>API Key:</strong> ${profile.has_api_key ? '••••••••' : 'Not set'}</p>
                    <p><strong>Temperature:</strong> ${profile.temperature}</p>
                </div>
            </div>
        `;
    }
    html += '</div>';
    listEl.innerHTML = html;

    listEl.querySelectorAll('.edit-profile-btn').forEach(btn => {
        btn.onclick = () => _handleEditProfile(btn.dataset.name);
    });
    listEl.querySelectorAll('.delete-profile-btn').forEach(btn => {
        btn.onclick = () => _handleDeleteProfile(btn.dataset.name);
    });
}

function _handleAddProfile() {
    editingProfile = null;
    document.getElementById('profile-editor-title').textContent = 'Add Profile';
    document.getElementById('profile-name').value = '';
    document.getElementById('profile-model').value = '';
    document.getElementById('profile-base-url').value = '';
    document.getElementById('profile-api-key').value = '';
    document.getElementById('profile-temperature').value = '0.7';
    document.getElementById('profile-top-p').value = '1.0';
    document.getElementById('profile-max-tokens').value = '4096';
    
    document.getElementById('profiles-list').style.display = 'none';
    document.getElementById('add-profile-btn').style.display = 'none';
    document.getElementById('profile-editor').style.display = 'block';
    document.getElementById('profile-name').focus();
}

function _handleEditProfile(name) {
    const profile = profiles[name];
    if (!profile) return;
    
    editingProfile = name;
    document.getElementById('profile-editor-title').textContent = 'Edit Profile: ' + name;
    document.getElementById('profile-name').value = name;
    document.getElementById('profile-name').disabled = true;
    document.getElementById('profile-model').value = profile.model || '';
    document.getElementById('profile-base-url').value = profile.base_url || '';
    document.getElementById('profile-api-key').value = '';
    document.getElementById('profile-temperature').value = profile.temperature || 0.7;
    document.getElementById('profile-top-p').value = profile.top_p || 1.0;
    document.getElementById('profile-max-tokens').value = profile.max_tokens || 4096;
    
    document.getElementById('profiles-list').style.display = 'none';
    document.getElementById('add-profile-btn').style.display = 'none';
    document.getElementById('profile-editor').style.display = 'block';
}

function _handleCancelProfile() {
    document.getElementById('profile-editor').style.display = 'none';
    document.getElementById('profiles-list').style.display = 'block';
    document.getElementById('add-profile-btn').style.display = 'block';
    editingProfile = null;
}

async function _handleSaveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    const model = document.getElementById('profile-model').value.trim();
    const baseUrl = document.getElementById('profile-base-url').value.trim();
    const apiKey = document.getElementById('profile-api-key').value;
    const temperature = parseFloat(document.getElementById('profile-temperature').value) || 0.7;
    const topP = parseFloat(document.getElementById('profile-top-p').value) || 1.0;
    const maxTokens = parseInt(document.getElementById('profile-max-tokens').value) || 4096;

    if (!name) {
        alert('Profile name is required');
        return;
    }

    const profile = {
        model: model,
        base_url: baseUrl,
        temperature: temperature,
        top_p: topP,
        max_tokens: maxTokens,
    };

    if (apiKey) {
        profile.api_key = apiKey;
    } else if (editingProfile && profiles[editingProfile]) {
        profile.api_key = '';
    }

    try {
        await saveModelProfile(name, profile);
        await reloadModelConfig();
        alert('Profile saved and reloaded!');
        await _loadModelProfiles();
    } catch (e) {
        alert('Failed to save: ' + e.message);
    }
}

async function _handleDeleteProfile(name) {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) {
        return;
    }

    try {
        await deleteModelProfile(name);
        await reloadModelConfig();
        alert('Profile deleted and reloaded!');
        await _loadModelProfiles();
    } catch (e) {
        alert('Failed to delete: ' + e.message);
    }
}

async function _loadMcpStatus() {
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

async function _loadSkillsStatus() {
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

async function _handleReloadMcp() {
    try {
        await reloadMcpConfig();
        alert('MCP config reloaded!');
        await _loadMcpStatus();
    } catch (e) {
        alert('Failed to reload: ' + e.message);
    }
}

async function _handleReloadSkills() {
    try {
        await reloadSkillsConfig();
        alert('Skills reloaded!');
        await _loadSkillsStatus();
    } catch (e) {
        alert('Failed to reload: ' + e.message);
    }
}

export function openSettings() {
    settingsModal.style.display = 'flex';
    _showPanel(currentTab);
}

export function closeSettings() {
    settingsModal.style.display = 'none';
}

window.openSettings = openSettings;
