/**
 * components/settings/modelProfiles.js
 * Model profile tab logic.
 */
import {
    deleteModelProfile,
    fetchModelProfiles,
    reloadModelConfig,
    saveModelProfile,
} from '../../core/api.js';

let profiles = {};
let editingProfile = null;

export function bindModelProfileHandlers() {
    const addProfileBtn = document.getElementById('add-profile-btn');
    if (addProfileBtn) {
        addProfileBtn.onclick = handleAddProfile;
    }

    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = handleSaveProfile;
    }

    const cancelProfileBtn = document.getElementById('cancel-profile-btn');
    if (cancelProfileBtn) {
        cancelProfileBtn.onclick = handleCancelProfile;
    }
}

export async function loadModelProfilesPanel() {
    try {
        profiles = await fetchModelProfiles();
        renderProfiles();
    } catch (e) {
        console.error('Failed to load model profiles:', e);
    }
}

function renderProfiles() {
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
                        <button class="icon-btn edit-profile-btn" data-name="${name}" title="Edit">Edit</button>
                        <button class="icon-btn delete-profile-btn" data-name="${name}" title="Delete">Delete</button>
                    </div>
                </div>
                <div class="profile-card-body">
                    <p><strong>Model:</strong> ${profile.model || '-'}</p>
                    <p><strong>Base URL:</strong> ${profile.base_url || '-'}</p>
                    <p><strong>API Key:</strong> ${profile.has_api_key ? '********' : 'Not set'}</p>
                    <p><strong>Temperature:</strong> ${profile.temperature}</p>
                </div>
            </div>
        `;
    }
    html += '</div>';
    listEl.innerHTML = html;

    listEl.querySelectorAll('.edit-profile-btn').forEach(btn => {
        btn.onclick = () => handleEditProfile(btn.dataset.name);
    });
    listEl.querySelectorAll('.delete-profile-btn').forEach(btn => {
        btn.onclick = () => handleDeleteProfile(btn.dataset.name);
    });
}

function handleAddProfile() {
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

function handleEditProfile(name) {
    const profile = profiles[name];
    if (!profile) return;

    editingProfile = name;
    document.getElementById('profile-editor-title').textContent = `Edit Profile: ${name}`;
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

function handleCancelProfile() {
    document.getElementById('profile-editor').style.display = 'none';
    document.getElementById('profiles-list').style.display = 'block';
    document.getElementById('add-profile-btn').style.display = 'block';
    editingProfile = null;
}

async function handleSaveProfile() {
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
        await loadModelProfilesPanel();
    } catch (e) {
        alert(`Failed to save: ${e.message}`);
    }
}

async function handleDeleteProfile(name) {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) {
        return;
    }

    try {
        await deleteModelProfile(name);
        await reloadModelConfig();
        alert('Profile deleted and reloaded!');
        await loadModelProfilesPanel();
    } catch (e) {
        alert(`Failed to delete: ${e.message}`);
    }
}
