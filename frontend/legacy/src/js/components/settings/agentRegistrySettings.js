/**
 * components/settings/agentRegistrySettings.js
 * ACP registry list and install bindings.
 */
import {
    fetchAgentRuntimeRegistry,
    installAgentRuntimeFromRegistry,
    refreshAgentRuntimeRegistry,
} from '../../core/api.js';
import { showToast } from '../../utils/feedback.js';
import { t } from '../../utils/i18n.js';
import { errorToPayload, logError } from '../../utils/logger.js';
import {
    setAgentCreateMethodBarVisible,
    setAgentCreateMethodMode,
} from './agentsSettings.js';

const DEFAULT_ACP_REGISTRY_SOURCE_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

let registryCatalog = null;
let registrySearch = '';
let registryFilter = 'all';
let bindOptions = {
    onBack: null,
};
let languageBound = false;

export function bindAgentRegistrySettingsHandlers(options = {}) {
    bindOptions = {
        onBack: typeof options.onBack === 'function' ? options.onBack : bindOptions.onBack,
    };
    bindActionButton('agent-create-registry-btn', event => {
        if (event?.stopPropagation) {
            event.stopPropagation();
        }
        setAgentCreateMethodMode('registry');
        showAgentRegistryListView(true);
        void loadAgentRegistryPanel();
    });
    bindActionButton('agent-registry-create-registry-btn', event => {
        if (event?.stopPropagation) {
            event.stopPropagation();
        }
        setAgentCreateMethodMode('registry');
        showAgentRegistryListView(true);
        void loadAgentRegistryPanel();
    });
    bindActionButton('refresh-agent-registry-btn', () => {
        void loadAgentRegistryPanel({ refresh: true });
    });
    bindActionButton('back-agents-btn', () => {
        showAgentRegistryListView(false);
        setRegistryActionsVisible(false);
        if (typeof bindOptions.onBack === 'function') {
            void bindOptions.onBack();
        }
    });

    const searchInput = document.getElementById('agent-registry-search-input');
    if (searchInput) {
        searchInput.oninput = () => {
            registrySearch = String(searchInput.value || '').trim().toLowerCase();
            renderRegistryList();
        };
    }
    const filterInput = document.getElementById('agent-registry-filter-input');
    if (filterInput) {
        filterInput.onchange = () => {
            registryFilter = String(filterInput.value || 'all').trim() || 'all';
            renderRegistryList();
        };
    }
    renderRegistrySourceUrl(DEFAULT_ACP_REGISTRY_SOURCE_URL);
    if (!languageBound && typeof document.addEventListener === 'function') {
        document.addEventListener('agent-teams-language-changed', () => {
            renderRegistrySourceUrl(resolveRegistrySourceUrl(registryCatalog));
            renderRegistryList();
        });
        languageBound = true;
    }
}

export async function loadAgentRegistryPanel({ refresh = false } = {}) {
    showAgentRegistryListView(true);
    setRegistryActionsVisible(true);
    renderRegistryStatus(t('settings.agents.registry_loading'), '');
    try {
        registryCatalog = refresh
            ? await refreshAgentRuntimeRegistry()
            : await fetchAgentRuntimeRegistry(false);
        renderRegistrySourceUrl(resolveRegistrySourceUrl(registryCatalog));
        renderRegistryStatus(resolveCatalogStatus(registryCatalog), registryCatalog?.error_message ? 'warning' : '');
        renderRegistryList();
    } catch (error) {
        logError(
            'frontend.agent_registry.load_failed',
            'Failed to load ACP registry',
            errorToPayload(error),
        );
        registryCatalog = null;
        renderRegistrySourceUrl(DEFAULT_ACP_REGISTRY_SOURCE_URL);
        renderRegistryStatus(error.message || t('settings.agents.registry_load_failed_message'), 'danger');
        renderRegistryEmpty(t('settings.agents.registry_load_failed'), error.message || t('settings.agents.registry_load_failed_message'));
    }
}

export function showAgentRegistryListView(visible) {
    const runtimeView = document.getElementById('agent-runtime-settings-view');
    const registryView = document.getElementById('agent-registry-view');
    if (visible) {
        setAgentCreateMethodBarVisible(true, 'registry');
    }
    if (runtimeView) {
        runtimeView.style.display = visible ? 'none' : 'block';
    }
    if (registryView) {
        registryView.style.display = visible ? 'block' : 'none';
    }
    setRegistryActionsVisible(visible);
}

function bindActionButton(id, handler) {
    const button = document.getElementById(id);
    if (button) {
        button.onclick = handler;
    }
}

function renderRegistryList() {
    const listEl = document.getElementById('agent-registry-list');
    if (!listEl) return;
    const agents = Array.isArray(registryCatalog?.agents)
        ? registryCatalog.agents.map(normalizeRegistryAgent).filter(matchesCurrentFilter)
        : [];
    if (!agents.length) {
        renderRegistryEmpty(t('settings.agents.registry_none'), t('settings.agents.registry_none_copy'));
        return;
    }
    listEl.innerHTML = `
        <div class="settings-record-list role-records agent-registry-records">
            ${agents.map(agent => renderRegistryRecord(agent)).join('')}
        </div>
    `;
    listEl.querySelectorAll('.agent-registry-install-btn').forEach(button => {
        button.onclick = () => {
            const registryId = String(button.dataset.registryId || '').trim();
            const agentId = String(button.dataset.agentId || '').trim();
            if (registryId) {
                void installRegistryAgent(registryId, agentId);
            }
        };
    });
}

function renderRegistryRecord(agent) {
    const status = resolveAgentStatus(agent);
    const actionLabel = agent.installed && !agent.update_available
        ? t('settings.agents.registry_installed')
        : agent.update_available
            ? t('settings.agents.registry_update')
            : t('settings.agents.registry_install');
    const disabled = agent.installed && !agent.update_available;
    const installedAgentId = String(agent.installed_agent_id || '').trim();
    return `
        <div class="role-record settings-record agent-registry-record" data-registry-id="${escapeHtml(agent.id)}">
            <div class="role-record-main">
                <div class="role-record-title-row">
                    <div class="settings-record-title role-record-title">${escapeHtml(agent.name || agent.id)}</div>
                    <div class="role-record-id">${escapeHtml(agent.id)}</div>
                    <div class="profile-card-chips role-record-chips">
                        ${agent.distributions.map(distribution => `<span class="profile-card-chip">${escapeHtml(formatDistribution(distribution))}</span>`).join('')}
                        <span class="profile-card-chip">${escapeHtml(status)}</span>
                    </div>
                </div>
                <div class="settings-record-meta role-record-meta">
                    <span>${escapeHtml(agent.description || t('settings.agents.no_description'))}</span>
                </div>
            </div>
            <div class="role-record-actions">
                <button class="settings-inline-action settings-list-action agent-registry-install-btn" data-registry-id="${escapeHtml(agent.id)}" data-agent-id="${escapeHtml(installedAgentId)}" type="button"${disabled ? ' disabled' : ''}>${escapeHtml(actionLabel)}</button>
            </div>
        </div>
    `;
}

async function installRegistryAgent(registryId, existingAgentId = '') {
    renderRegistryStatus(t('settings.agents.registry_installing'), '');
    try {
        const payload = {
            distribution: 'auto',
        };
        if (existingAgentId) {
            payload.agent_id = existingAgentId;
        } else {
            payload.env = {};
        }
        const result = await installAgentRuntimeFromRegistry(registryId, payload);
        const savedAgentId = String(result?.agent?.agent_id || registryId).trim();
        showToast({
            title: t('settings.agents.registry_install_success'),
            message: `${savedAgentId} ${t('settings.agents.registry_install_success_copy')}`,
            tone: 'success',
        });
        registryCatalog = await fetchAgentRuntimeRegistry(false);
        renderRegistrySourceUrl(resolveRegistrySourceUrl(registryCatalog));
        renderRegistryStatus(resolveCatalogStatus(registryCatalog), registryCatalog?.error_message ? 'warning' : '');
        renderRegistryList();
    } catch (error) {
        logError(
            'frontend.agent_registry.install_failed',
            'Failed to install ACP registry runtime',
            {
                registry_id: registryId,
                ...errorToPayload(error),
            },
        );
        renderRegistryStatus(error.message || t('settings.agents.registry_install_failed_message'), 'danger');
        showToast({
            title: t('settings.agents.registry_install_failed'),
            message: error.message || t('settings.agents.registry_install_failed_message'),
            tone: 'danger',
        });
    }
}

function renderRegistryEmpty(title, description) {
    const listEl = document.getElementById('agent-registry-list');
    if (!listEl) return;
    listEl.innerHTML = `
        <div class="settings-empty-state">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(description)}</p>
        </div>
    `;
}

function renderRegistryStatus(message, tone) {
    const statusEl = document.getElementById('agent-registry-status');
    if (!statusEl) return;
    statusEl.className = 'role-editor-status';
    if (!message) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        return;
    }
    statusEl.style.display = 'block';
    if (tone) {
        statusEl.classList.add(`role-editor-status-${tone}`);
    }
    statusEl.textContent = message;
}

function setRegistryActionsVisible(visible) {
    setActionDisplay('add-agent-btn', !visible);
    setActionDisplay('refresh-agent-registry-btn', visible);
    setActionDisplay('back-agents-btn', visible);
    setActionDisplay('test-agent-btn', false);
    setActionDisplay('save-agent-btn', false);
    setActionDisplay('delete-agent-btn', false);
    setActionDisplay('cancel-agent-btn', false);
}

function setActionDisplay(id, visible) {
    const button = document.getElementById(id);
    if (button) {
        button.style.display = visible ? 'inline-flex' : 'none';
    }
}

function renderRegistrySourceUrl(sourceUrl) {
    const linkEl = document.getElementById('agent-registry-source-link');
    if (!linkEl) return;
    const normalizedUrl = String(sourceUrl || DEFAULT_ACP_REGISTRY_SOURCE_URL).trim()
        || DEFAULT_ACP_REGISTRY_SOURCE_URL;
    linkEl.href = normalizedUrl;
    linkEl.title = normalizedUrl;
    linkEl.setAttribute?.('aria-label', normalizedUrl);
    const urlEl = linkEl.querySelector?.('.agent-registry-source-url');
    if (urlEl) {
        urlEl.textContent = normalizedUrl;
    }
}

function resolveRegistrySourceUrl(catalog) {
    return String(catalog?.source_url || DEFAULT_ACP_REGISTRY_SOURCE_URL).trim()
        || DEFAULT_ACP_REGISTRY_SOURCE_URL;
}

function normalizeRegistryAgent(agent) {
    return {
        id: String(agent?.registry_id || agent?.id || '').trim(),
        name: String(agent?.name || '').trim(),
        description: String(agent?.description || '').trim(),
        version: String(agent?.version || '').trim(),
        installed: agent?.installed === true,
        update_available: agent?.update_available === true,
        installed_agent_id: String(agent?.installed_agent_id || '').trim(),
        installed_version: String(agent?.installed_version || '').trim(),
        distributions: Array.isArray(agent?.distributions)
            ? agent.distributions.map(item => String(item || '').trim()).filter(Boolean)
            : [],
    };
}

function matchesCurrentFilter(agent) {
    if (!agent.id) return false;
    if (registrySearch) {
        const haystack = `${agent.id} ${agent.name} ${agent.description}`.toLowerCase();
        if (!haystack.includes(registrySearch)) {
            return false;
        }
    }
    if (registryFilter === 'installed') return agent.installed;
    if (registryFilter === 'available') return !agent.installed;
    if (registryFilter === 'updates') return agent.update_available;
    return true;
}

function resolveCatalogStatus(catalog) {
    const count = Array.isArray(catalog?.agents) ? catalog.agents.length : 0;
    const errorMessage = String(catalog?.error_message || '').trim();
    if (errorMessage) {
        return errorMessage;
    }
    return `${count} ${t('settings.agents.registry_loaded_suffix')}`;
}

function resolveAgentStatus(agent) {
    if (agent.update_available) return t('settings.agents.registry_status_update');
    if (agent.installed) return t('settings.agents.registry_status_installed');
    return t('settings.agents.registry_status_available');
}

function formatDistribution(distribution) {
    if (distribution === 'binary') return t('settings.agents.registry_distribution_binary');
    if (distribution === 'npx') return t('settings.agents.registry_distribution_npx');
    if (distribution === 'uvx') return t('settings.agents.registry_distribution_uvx');
    return distribution;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
