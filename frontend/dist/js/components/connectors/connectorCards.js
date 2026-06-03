/**
 * components/connectors/connectorCards.js
 * Renders the built-in connector card wall.
 */
import { formatMessage, t } from '../../utils/i18n.js';

const CONNECTOR_ICON_BY_PROVIDER = Object.freeze({
    github: '/assets/connectors/github.svg',
    discord: '/assets/connectors/discord.svg',
    feishu: '/assets/connectors/feishu.svg',
    wechat: '/assets/connectors/wechat.svg',
    xiaoluban: '/assets/connectors/xiaoluban.svg',
    w3: '/assets/connectors/w3.svg',
    'relay-knowledge': '/assets/connectors/relay-knowledge.svg',
});

const CONNECTOR_GROUP_BY_PROVIDER = Object.freeze({
    github: 'official',
    discord: 'internal',
    feishu: 'internal',
    wechat: 'internal',
    xiaoluban: 'internal',
    w3: 'official',
    'relay-knowledge': 'official',
});

const CONNECTOR_PLACEHOLDER_ORDER = Object.freeze([
    'github',
    'w3',
    'discord',
    'feishu',
    'wechat',
    'xiaoluban',
]);

const CONNECTOR_GROUP_LABEL_KEYS = Object.freeze({
    official: 'feature.connectors.group.official',
    models: 'feature.connectors.group.models',
    internal: 'feature.connectors.group.internal',
});

const STATUS_LABEL_KEYS = Object.freeze({
    connected: 'feature.connectors.status.connected',
    needs_config: 'feature.connectors.status.needs_config',
    disabled: 'feature.connectors.status.disabled',
    error: 'feature.connectors.status.error',
    loading: 'feature.connectors.status.loading',
});

const PROVIDER_NAME_KEYS = Object.freeze({
    github: 'feature.connectors.provider.github.name',
    discord: 'feature.connectors.provider.discord.name',
    feishu: 'feature.connectors.provider.feishu.name',
    wechat: 'feature.connectors.provider.wechat.name',
    xiaoluban: 'feature.connectors.provider.xiaoluban.name',
    w3: 'feature.connectors.provider.w3.name',
    'relay-knowledge': 'feature.connectors.provider.relay_knowledge.name',
});

const PROVIDER_DESCRIPTION_KEYS = Object.freeze({
    github: 'feature.connectors.provider.github.description',
    discord: 'feature.connectors.provider.discord.description',
    feishu: 'feature.connectors.provider.feishu.description',
    wechat: 'feature.connectors.provider.wechat.description',
    xiaoluban: 'feature.connectors.provider.xiaoluban.description',
    w3: 'feature.connectors.provider.w3.description',
    'relay-knowledge': 'feature.connectors.provider.relay_knowledge.description',
});

const CAPABILITY_LABEL_KEYS = Object.freeze({
    repositories: 'feature.connectors.capability.repositories',
    issues: 'feature.connectors.capability.issues',
    pull_requests: 'feature.connectors.capability.pull_requests',
    actions: 'feature.connectors.capability.actions',
    messages: 'feature.connectors.capability.messages',
    mentions: 'feature.connectors.capability.mentions',
    bot_events: 'feature.connectors.capability.bot_events',
    direct_messages: 'feature.connectors.capability.direct_messages',
    group_messages: 'feature.connectors.capability.group_messages',
    file_messages: 'feature.connectors.capability.file_messages',
    im_forwarding: 'feature.connectors.capability.im_forwarding',
    notifications: 'feature.connectors.capability.notifications',
    w3_auth: 'feature.connectors.capability.w3_auth',
    web_token: 'feature.connectors.capability.web_token',
    maas_models: 'feature.connectors.capability.maas_models',
    codeagent_models: 'feature.connectors.capability.codeagent_models',
    model_import: 'feature.connectors.capability.model_import',
    cli_download: 'feature.connectors.capability.cli_download',
    cli_upgrade: 'feature.connectors.capability.cli_upgrade',
    service_status: 'feature.connectors.capability.service_status',
    service_doctor: 'feature.connectors.capability.service_doctor',
});

const CONNECT_ACTION_LABEL_KEYS = Object.freeze({
    discord: 'feature.connectors.action.connect_discord',
    feishu: 'feature.connectors.action.connect_feishu',
    wechat: 'feature.connectors.action.connect_wechat',
    xiaoluban: 'feature.connectors.action.connect_xiaoluban',
    w3: 'feature.connectors.action.connect_w3',
});

const RUNTIME_TOOL_ORDER = Object.freeze([
    'rg',
    'gh',
    'clawhub',
    'relay-knowledge',
]);

const RUNTIME_TOOL_DEFAULTS = Object.freeze({
    rg: {
        display_name: 'ripgrep',
        executable_name: 'rg',
    },
    gh: {
        display_name: 'GitHub CLI',
        executable_name: 'gh',
    },
    clawhub: {
        display_name: 'ClawHub CLI',
        executable_name: 'clawhub',
    },
    'relay-knowledge': {
        display_name: 'Relay Knowledge CLI',
        executable_name: 'relay-knowledge',
    },
});

export function renderConnectorsCardPageMarkup({
    connectorsResponse,
    connectorsError = '',
    runtimeToolsResponse,
    runtimeToolsError = '',
    runtimeToolJobs = {},
    systemPathBusy = false,
    systemPathAdded = false,
    systemPathMessage = '',
    systemPathTone = 'info',
    searchQuery = '',
    statusFilter = 'all',
} = {}) {
    const connectorLoadError = String(connectorsError || '').trim();
    const connectorsLoaded = !connectorLoadError
        && Array.isArray(connectorsResponse?.items)
        && connectorsResponse.items.length > 0;
    const sourceItems = connectorsLoaded
        ? connectorsResponse.items
        : buildConnectorPlaceholders();
    const items = sourceItems
        .filter(item => String(item?.provider || item?.connector_id || '').trim() !== 'relay-knowledge');
    const filteredItems = filterConnectorItems(items, { searchQuery, statusFilter });
    const grouped = groupConnectorItems(filteredItems);
    const summary = connectorsResponse?.summary && typeof connectorsResponse.summary === 'object'
        ? connectorsResponse.summary
        : {};
    return `
        <div class="feature-page connectors-page">
            <section class="connectors-hero">
                <div class="connectors-title-block">
                    <h2>${escapeHtml(t('feature.gateway.title'))}</h2>
                    <p>${escapeHtml(t('feature.gateway.subtitle'))}</p>
                </div>
                <div class="connectors-summary" aria-label="${escapeHtml(t('feature.gateway.summary'))}">
                    ${renderSummaryChip(t('feature.connectors.summary.connected'), summary.connected || 0, 'connected')}
                    ${renderSummaryChip(t('feature.connectors.summary.pending'), summary.needs_config || 0, 'pending')}
                    ${renderSummaryChip(t('feature.connectors.summary.error'), summary.error || (connectorLoadError ? 1 : 0), 'error')}
                </div>
            </section>
            <section class="connectors-toolbar" aria-label="${escapeHtml(t('feature.gateway.filters'))}">
                <label class="connectors-search">
                    <span class="connectors-search-icon" aria-hidden="true">⌕</span>
                    <input type="search" value="${escapeHtml(searchQuery)}" placeholder="${escapeHtml(t('feature.gateway.search_placeholder'))}" data-connectors-search>
                </label>
                <div class="connectors-tabs" role="tablist">
                    ${renderFilterButton('all', t('feature.connectors.filter.all'), statusFilter)}
                    ${renderFilterButton('connected', t('feature.connectors.filter.connected'), statusFilter)}
                    ${renderFilterButton('unconnected', t('feature.connectors.filter.unconnected'), statusFilter)}
                </div>
            </section>
            ${connectorLoadError ? renderLoadErrorState(connectorLoadError) : ''}
            ${connectorLoadError ? '' : renderConnectorGroup('official', grouped.official)}
            ${connectorLoadError ? '' : renderConnectorGroup('models', grouped.models)}
            ${connectorLoadError ? '' : renderConnectorGroup('internal', grouped.internal)}
            ${renderRuntimeToolsGroup({
                runtimeToolsResponse,
                runtimeToolsError,
                runtimeToolJobs,
                systemPathBusy,
                systemPathAdded,
                systemPathMessage,
                systemPathTone,
            })}
            ${!connectorLoadError && connectorsLoaded && filteredItems.length === 0 ? renderEmptyState() : ''}
        </div>
    `;
}

export function renderRuntimeToolsModalMarkup({
    runtimeToolsResponse,
    runtimeToolJobs = {},
    systemPathBusy = false,
    systemPathAdded = false,
    systemPathMessage = '',
    systemPathTone = 'info',
} = {}) {
    const items = getRuntimeToolItems(runtimeToolsResponse);
    const pathState = runtimeToolsResponse?.system_path;
    const pathKnown = pathState !== undefined && pathState !== null;
    const pathSupported = pathState?.supported === true;
    const pathAdded = systemPathAdded || Boolean(pathState?.added);
    const pathDisabled = systemPathBusy || pathAdded || !pathSupported;
    const pathLabel = systemPathBusy
        ? t('feature.connectors.runtime_tools.system_path_adding')
        : pathAdded
            ? t('feature.connectors.runtime_tools.system_path_added')
            : pathSupported || !pathKnown
                ? t('feature.connectors.runtime_tools.system_path_add')
                : t('feature.connectors.runtime_tools.system_path_unsupported');
    return `
        <div class="modal gateway-feature-modal connectors-runtime-modal" data-runtime-tools-modal>
            <div class="modal-content gateway-feature-modal-content connectors-runtime-modal-content" role="dialog" aria-modal="true" aria-labelledby="runtime-tools-modal-title">
                <div class="modal-header gateway-feature-modal-header">
                    <div class="gateway-feature-modal-heading">
                        <h3 id="runtime-tools-modal-title">${escapeHtml(t('feature.connectors.runtime_tools.modal_title'))}</h3>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-runtime-tools-modal-close>
                        <span aria-hidden="true">×</span>
                    </button>
                </div>
                <div class="gateway-feature-modal-body connectors-runtime-modal-body">
                    <div class="connectors-runtime-toolbar">
                        <button class="connectors-card-action${pathAdded ? ' is-complete' : ''}" type="button" data-runtime-tools-system-path-add${pathDisabled ? ' disabled' : ''}>
                            ${escapeHtml(pathLabel)}
                        </button>
                    </div>
                    ${systemPathMessage ? `<p class="connectors-runtime-system-path-status is-${escapeHtml(systemPathTone || 'info')}">${escapeHtml(systemPathMessage)}</p>` : ''}
                    ${items.length > 0
                        ? renderRuntimeToolsList(items, runtimeToolJobs)
                        : `<p class="connectors-runtime-empty">${escapeHtml(t('feature.connectors.runtime_tools.empty'))}</p>`
                    }
                </div>
            </div>
        </div>
    `;
}

export function renderConnectorConfigModalMarkup({
    item,
    accountManagementMarkup = '',
    showConfigureAction = true,
} = {}) {
    if (!item) {
        return '';
    }
    const provider = String(item.provider || item.connector_id || '').trim();
    const status = String(item.status || 'needs_config').trim();
    return `
        <div class="modal gateway-feature-modal connectors-config-modal" data-connector-modal>
            <div class="modal-content gateway-feature-modal-content connectors-config-modal-content" role="dialog" aria-modal="true" aria-labelledby="connector-config-modal-title">
                <div class="modal-header gateway-feature-modal-header">
                    <div class="gateway-feature-modal-heading connectors-config-heading">
                        <img src="${escapeHtml(CONNECTOR_ICON_BY_PROVIDER[provider] || '')}" alt="" aria-hidden="true">
                        <div>
                            <h3 id="connector-config-modal-title">${escapeHtml(formatProviderName(item))}</h3>
                            <p>${escapeHtml(formatProviderDescription(item))}</p>
                        </div>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-connector-modal-close>
                        <span aria-hidden="true">×</span>
                    </button>
                </div>
                <div class="gateway-feature-modal-body connectors-config-body">
                    <div class="connectors-config-status-row">
                        <span class="connectors-status-dot is-${escapeHtml(status)}"></span>
                        <strong>${escapeHtml(formatStatus(status))}</strong>
                        <span>${escapeHtml(formatAccountSummary(item))}</span>
                    </div>
                    <dl class="connectors-config-details">
                        <div><dt>${escapeHtml(t('feature.connectors.detail.auth_type'))}</dt><dd>${escapeHtml(formatAuthType(item.auth_type))}</dd></div>
                        <div><dt>${escapeHtml(t('feature.connectors.detail.last_activity'))}</dt><dd>${escapeHtml(formatDateTime(item.last_activity_at))}</dd></div>
                        <div><dt>${escapeHtml(t('feature.connectors.detail.capabilities'))}</dt><dd>${escapeHtml(formatCapabilities(item.capabilities))}</dd></div>
                    </dl>
                    ${item.last_error ? `<p class="connectors-error-copy">${escapeHtml(item.last_error)}</p>` : ''}
                    ${accountManagementMarkup || ''}
                </div>
                ${showConfigureAction ? `<div class="connectors-config-actions">
                    <button class="primary-btn" type="button" data-connector-configure="${escapeHtml(provider)}">${escapeHtml(formatConnectActionLabel(provider, status))}</button>
                </div>` : ''}
            </div>
        </div>
    `;
}

function renderSummaryChip(label, value, tone) {
    return `
        <span class="connectors-summary-chip is-${escapeHtml(tone)}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </span>
    `;
}

function renderFilterButton(value, label, activeValue) {
    const active = value === activeValue;
    return `
        <button class="connectors-tab${active ? ' is-active' : ''}" type="button" role="tab" aria-selected="${active ? 'true' : 'false'}" data-connectors-filter="${escapeHtml(value)}">
            ${escapeHtml(label)}
        </button>
    `;
}

function renderConnectorGroup(groupKey, items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }
    return `
        <section class="connectors-section">
            <h3>${escapeHtml(t(CONNECTOR_GROUP_LABEL_KEYS[groupKey] || groupKey))}</h3>
            <div class="connectors-card-grid">
                ${items.map(renderConnectorCard).join('')}
            </div>
        </section>
    `;
}

function renderConnectorCard(item) {
    const provider = String(item?.provider || item?.connector_id || '').trim();
    const status = String(item?.status || 'needs_config').trim();
    const accountCount = Number(item?.account_count || 0);
    const isLoading = status === 'loading' || item?.is_loading === true;
    return `
        <article class="connectors-card" data-connector-card="${escapeHtml(provider)}">
            <button class="connectors-card-menu" type="button" aria-label="${escapeHtml(t('feature.connectors.action.manage'))}" data-connector-manage="${escapeHtml(provider)}"${isLoading ? ' disabled' : ''}>...</button>
            <div class="connectors-card-main">
                <img class="connectors-card-icon" src="${escapeHtml(CONNECTOR_ICON_BY_PROVIDER[provider] || '')}" alt="" aria-hidden="true">
                <div class="connectors-card-title">
                    <h4>${escapeHtml(formatProviderName(item))}</h4>
                    <p>${escapeHtml(formatProviderDescription(item))}</p>
                </div>
            </div>
            <div class="connectors-card-footer">
                <span class="connectors-card-status">
                    <span class="connectors-status-dot is-${escapeHtml(status)}"></span>
                    ${escapeHtml(formatStatus(status))}
                </span>
                <button class="connectors-card-action" type="button" data-connector-open="${escapeHtml(provider)}"${isLoading ? ' disabled' : ''}>
                    ${escapeHtml(formatCardActionLabel(provider, status, accountCount))}
                </button>
            </div>
        </article>
    `;
}

function renderRuntimeToolsGroup({
    runtimeToolsResponse,
    runtimeToolsError = '',
    runtimeToolJobs,
    systemPathBusy = false,
    systemPathAdded = false,
} = {}) {
    const loadError = String(runtimeToolsError || '').trim();
    const items = getRuntimeToolCardItems(runtimeToolsResponse, loadError);
    return `
        <section class="connectors-section connectors-runtime-tools" data-runtime-tools-group>
            <div class="connectors-runtime-heading">
                <h3>${escapeHtml(t('feature.connectors.runtime_tools.group_title'))}</h3>
                <div class="connectors-runtime-heading-actions">
                    ${loadError ? `
                        <button class="connectors-card-action" type="button" data-runtime-tools-retry>
                            ${escapeHtml(t('feature.connectors.runtime_tools.retry'))}
                        </button>
                    ` : ''}
                    ${renderRuntimeToolsSystemPathButton({
                        runtimeToolsResponse,
                        systemPathBusy,
                        systemPathAdded,
                    })}
                </div>
            </div>
            <div class="connectors-card-grid connectors-runtime-card-grid">
                ${items.map(item => renderRuntimeToolCard(item, runtimeToolJobs)).join('')}
            </div>
        </section>
    `;
}

function renderRuntimeToolsSystemPathButton({
    runtimeToolsResponse,
    systemPathBusy,
    systemPathAdded,
}) {
    const state = resolveRuntimeToolsSystemPathState({
        runtimeToolsResponse,
        systemPathBusy,
        systemPathAdded,
    });
    return `
        <button class="connectors-runtime-path-button${state.pathAdded ? ' is-complete' : ''}" type="button" data-runtime-tools-system-path-add${state.pathDisabled ? ' disabled' : ''} title="${escapeHtml(state.pathLabel)}" aria-label="${escapeHtml(state.pathLabel)}">
            <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                ${state.pathAdded
                    ? '<path d="M5 12.5l4 4 10-10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path>'
                    : '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path>'}
            </svg>
            <span class="connectors-runtime-path-label">${escapeHtml(state.pathLabel)}</span>
        </button>
    `;
}

function resolveRuntimeToolsSystemPathState({
    runtimeToolsResponse,
    systemPathBusy,
    systemPathAdded,
}) {
    const pathState = runtimeToolsResponse?.system_path;
    const pathKnown = pathState !== undefined && pathState !== null;
    const pathSupported = pathState?.supported === true;
    const pathAdded = systemPathAdded || Boolean(pathState?.added);
    const pathDisabled = systemPathBusy || !pathSupported;
    const pathLabel = systemPathBusy
        ? t('feature.connectors.runtime_tools.system_path_adding')
        : pathAdded
            ? t('feature.connectors.runtime_tools.system_path_added')
            : pathSupported || !pathKnown
                ? t('feature.connectors.runtime_tools.system_path_add')
                : t('feature.connectors.runtime_tools.system_path_unsupported');
    return { pathAdded, pathDisabled, pathLabel };
}

function renderRuntimeToolCard(item, runtimeToolJobs) {
    const state = resolveRuntimeToolViewState(item, runtimeToolJobs);
    return `
        <article class="connectors-card connectors-runtime-card" data-runtime-tool-card="${escapeHtml(state.toolId)}">
            <div class="connectors-card-main">
                <div class="connectors-runtime-card-icon" aria-hidden="true">${escapeHtml(formatRuntimeToolIconText(state.toolId))}</div>
                <div class="connectors-card-title">
                    <h4>${escapeHtml(state.displayName)}</h4>
                    ${state.detail ? `<p>${escapeHtml(state.detail)}</p>` : ''}
                    ${renderRuntimeToolProgress(state.job)}
                    ${state.errorMessage ? `<p class="connectors-runtime-error">${escapeHtml(state.errorMessage)}</p>` : ''}
                </div>
            </div>
            <div class="connectors-card-footer">
                <span class="connectors-card-status">
                    <span class="connectors-status-dot is-${escapeHtml(state.cardStatusClass)}"></span>
                    ${escapeHtml(state.statusLabel)}
                </span>
                ${renderRuntimeToolCardActions(state)}
            </div>
        </article>
    `;
}

function renderRuntimeToolCardActions(state) {
    const copyAction = state.path
        ? `
            <button class="connectors-runtime-copy-path-button" type="button" data-runtime-tool-copy-path="${escapeHtml(state.toolId)}" title="${escapeHtml(t('feature.connectors.runtime_tools.copy_path'))}" aria-label="${escapeHtml(t('feature.connectors.runtime_tools.copy_path'))}">
                <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                    <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8"></rect>
                    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
            </button>
        `
        : '';
    const downloadAction = state.showAction
        ? `
            <button class="connectors-card-action" type="button" data-runtime-tool-download="${escapeHtml(state.toolId)}"${state.isBusy ? ' disabled' : ''}>
                ${escapeHtml(formatRuntimeToolActionLabel({
                    isBusy: state.isBusy,
                    updateAvailable: state.updateAvailable,
                }))}
            </button>
        `
        : '';
    if (!copyAction && !downloadAction) {
        return '';
    }
    return `
        <div class="connectors-runtime-card-actions">
            ${copyAction}
            ${downloadAction}
        </div>
    `;
}

function renderRuntimeToolsList(items, runtimeToolJobs) {
    return `
        <div class="connectors-runtime-list">
            ${items.map(item => renderRuntimeToolRow(item, runtimeToolJobs)).join('')}
        </div>
    `;
}

function renderRuntimeToolRow(item, runtimeToolJobs) {
    const state = resolveRuntimeToolViewState(item, runtimeToolJobs);
    return `
        <article class="connectors-runtime-row" data-runtime-tool="${escapeHtml(state.toolId)}">
            <div class="connectors-runtime-main">
                <strong>${escapeHtml(state.displayName)}</strong>
                <span class="connectors-runtime-status is-${escapeHtml(state.runtimeStatusClass)}">${escapeHtml(state.statusLabel)}</span>
                ${state.detail ? `<p>${escapeHtml(state.detail)}</p>` : ''}
                ${renderRuntimeToolProgress(state.job)}
                ${state.errorMessage ? `<p class="connectors-runtime-error">${escapeHtml(state.errorMessage)}</p>` : ''}
            </div>
            <div class="connectors-runtime-actions">
                ${state.showAction ? `
                    <button class="connectors-card-action" type="button" data-runtime-tool-download="${escapeHtml(state.toolId)}"${state.isBusy ? ' disabled' : ''}>
                        ${escapeHtml(formatRuntimeToolActionLabel({
                            isBusy: state.isBusy,
                            updateAvailable: state.updateAvailable,
                        }))}
                    </button>
                ` : ''}
            </div>
        </article>
    `;
}

function getRuntimeToolItems(runtimeToolsResponse) {
    return Array.isArray(runtimeToolsResponse?.items)
        ? runtimeToolsResponse.items
        : [];
}

function buildConnectorPlaceholders() {
    return CONNECTOR_PLACEHOLDER_ORDER.map(provider => ({
        connector_id: provider,
        provider,
        status: 'loading',
        account_count: 0,
        enabled_count: 0,
        capabilities: [],
        is_loading: true,
    }));
}

function getRuntimeToolCardItems(runtimeToolsResponse, runtimeToolsError = '') {
    const errorMessage = String(runtimeToolsError || '').trim();
    return RUNTIME_TOOL_ORDER.map(toolId => {
        const loaded = findRuntimeToolItem(runtimeToolsResponse, toolId);
        const defaults = RUNTIME_TOOL_DEFAULTS[toolId] || {};
        if (errorMessage) {
            return {
                tool_id: toolId,
                display_name: defaults.display_name || toolId,
                executable_name: defaults.executable_name || toolId,
                loaded: true,
                load_error: true,
                status: 'error',
                error_message: errorMessage,
            };
        }
        return {
            tool_id: toolId,
            display_name: defaults.display_name || toolId,
            executable_name: defaults.executable_name || toolId,
            ...(loaded || {}),
            loaded: Boolean(loaded),
        };
    });
}

function findRuntimeToolItem(runtimeToolsResponse, toolId) {
    const items = getRuntimeToolItems(runtimeToolsResponse);
    return items.find(item => String(item?.tool_id || '').trim() === toolId) || null;
}

function resolveRuntimeToolViewState(item, runtimeToolJobs) {
    const toolId = String(item?.tool_id || '').trim();
    const loaded = item?.loaded !== false;
    const loadError = item?.load_error === true;
    const status = loaded
        ? String(item?.status || 'missing').trim()
        : 'loading';
    const jobId = String(item?.download_job_id || '').trim();
    const job = jobId && runtimeToolJobs && typeof runtimeToolJobs === 'object'
        ? runtimeToolJobs[jobId]
        : null;
    const jobStatus = String(job?.status || '').trim();
    const effectiveStatus = jobStatus === 'running' || jobStatus === 'queued'
        ? 'downloading'
        : jobStatus === 'failed'
            ? 'error'
            : status;
    const isBusy = effectiveStatus === 'downloading';
    const isReady = effectiveStatus === 'ready' || jobStatus === 'succeeded';
    const updateAvailable = item?.update_available === true && jobStatus !== 'succeeded';
    const statusKey = !loaded
        ? 'loading'
        : isBusy
            ? 'downloading'
            : jobStatus === 'failed' || effectiveStatus === 'error'
                ? 'error'
                : updateAvailable && isReady
                    ? 'update_available'
                    : isReady
                        ? 'ready'
                        : 'missing';
    const version = String(item?.version || '').trim();
    const targetVersion = String(item?.target_version || '').trim();
    const path = String(job?.path || item?.path || '').trim();
    const source = formatRuntimeToolSource(item?.path_source);
    const detail = formatRuntimeToolCardDetail([
        version ? formatMessage('feature.connectors.runtime_tools.version', { version }) : '',
        updateAvailable && targetVersion
            ? formatMessage('feature.connectors.runtime_tools.update_available', { version: targetVersion })
            : '',
        source,
    ]);
    const cardStatusClass = statusKey === 'error'
        ? 'error'
        : statusKey === 'ready'
            ? 'connected'
            : 'needs_config';
    return {
        toolId,
        displayName: String(item?.display_name || toolId).trim() || toolId,
        statusLabel: formatRuntimeToolStatus(statusKey),
        runtimeStatusClass: statusKey === 'ready' ? 'ready' : statusKey,
        cardStatusClass,
        detail,
        path,
        job,
        isBusy,
        updateAvailable,
        showAction: loaded && !loadError && (!isReady || updateAvailable),
        errorMessage: String(job?.error_message || item?.error_message || '').trim(),
    };
}

function summarizeRuntimeTools(items, runtimeToolJobs) {
    return items.reduce((summary, item) => {
        const jobId = String(item?.download_job_id || '').trim();
        const job = jobId && runtimeToolJobs && typeof runtimeToolJobs === 'object'
            ? runtimeToolJobs[jobId]
            : null;
        const jobStatus = String(job?.status || '').trim();
        const status = jobStatus === 'running' || jobStatus === 'queued'
            ? 'downloading'
            : jobStatus === 'failed'
                ? 'error'
                : String(item?.status || 'missing').trim();
        if (item?.update_available === true && status === 'ready' && jobStatus !== 'succeeded') {
            summary.outdated += 1;
        } else if (status === 'ready' || jobStatus === 'succeeded') {
            summary.ready += 1;
        } else if (status === 'downloading') {
            summary.downloading += 1;
        } else if (status === 'error') {
            summary.error += 1;
        } else {
            summary.missing += 1;
        }
        return summary;
    }, { ready: 0, missing: 0, outdated: 0, downloading: 0, error: 0 });
}

function formatRuntimeToolSummary(summary) {
    return formatMessage('feature.connectors.runtime_tools.summary', {
        ready: summary.ready,
        missing: summary.missing,
        outdated: summary.outdated,
        downloading: summary.downloading,
        error: summary.error,
    });
}

function formatRuntimeToolCardStatus(summary) {
    if (summary.downloading > 0) {
        return t('feature.connectors.runtime_tools.status.downloading');
    }
    if (summary.error > 0) {
        return t('feature.connectors.runtime_tools.status.error');
    }
    if (summary.outdated > 0) {
        return t('feature.connectors.runtime_tools.status.update_available');
    }
    if (summary.missing > 0) {
        return t('feature.connectors.runtime_tools.status.missing');
    }
    return t('feature.connectors.runtime_tools.status.ready');
}

function formatRuntimeToolActionLabel({ isBusy, updateAvailable }) {
    if (isBusy) {
        return updateAvailable
            ? t('feature.connectors.runtime_tools.updating')
            : t('feature.connectors.runtime_tools.downloading');
    }
    return updateAvailable
        ? t('feature.connectors.runtime_tools.update')
        : t('feature.connectors.runtime_tools.download');
}

function renderRuntimeToolProgress(job) {
    if (!job || typeof job !== 'object') {
        return '';
    }
    const status = String(job.status || '').trim();
    if (!['queued', 'running', 'failed'].includes(status)) {
        return '';
    }
    const rawPercent = Number(job.progress_percent);
    const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, rawPercent)) : 10;
    return `
        <div class="connectors-runtime-progress" aria-label="${escapeHtml(t('feature.connectors.runtime_tools.progress'))}">
            <span style="width:${escapeHtml(percent)}%"></span>
        </div>
        <p>${escapeHtml(job.message || t('feature.connectors.runtime_tools.downloading'))}</p>
    `;
}

function formatRuntimeToolStatus(status) {
    const value = String(status || '').trim();
    return t(`feature.connectors.runtime_tools.status.${value}`) || value;
}

function formatRuntimeToolSource(value) {
    const source = String(value || '').trim();
    if (!source) {
        return '';
    }
    return t(`feature.connectors.runtime_tools.source.${source}`) || source;
}

function formatRuntimeToolCardDetail(parts) {
    return parts
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
}

function formatRuntimeToolIconText(toolId) {
    const value = String(toolId || '').trim();
    if (value === 'relay-knowledge') {
        return 'RK';
    }
    if (value === 'clawhub') {
        return 'CH';
    }
    return value.toUpperCase();
}

function formatCardActionLabel(provider, status, accountCount) {
    if (status === 'loading') {
        return formatStatus(status);
    }
    if (provider === 'github') {
        return status === 'connected'
            ? t('feature.connectors.action.configure')
            : t('feature.connectors.action.connect');
    }
    if (accountCount > 0) {
        return t('feature.connectors.action.manage');
    }
    return t('feature.connectors.action.connect');
}

function formatConnectActionLabel(provider, status) {
    const key = CONNECT_ACTION_LABEL_KEYS[provider] || '';
    if (key) {
        return t(key);
    }
    return status === 'connected'
        ? t('feature.connectors.action.configure')
        : t('feature.connectors.action.connect');
}

function renderEmptyState() {
    return `
        <div class="connectors-empty">
            <h3>${escapeHtml(t('feature.connectors.empty.title'))}</h3>
            <p>${escapeHtml(t('feature.connectors.empty.copy'))}</p>
        </div>
    `;
}

function renderLoadErrorState(message) {
    const copy = message || t('feature.connectors.load_failed.copy');
    return `
        <div class="connectors-empty is-error" data-connectors-error>
            <h3>${escapeHtml(t('feature.connectors.load_failed.title'))}</h3>
            <p>${escapeHtml(copy)}</p>
            <div class="connectors-empty-actions">
                <button class="connectors-card-action" type="button" data-connectors-retry>
                    ${escapeHtml(t('feature.connectors.load_failed.retry'))}
                </button>
            </div>
        </div>
    `;
}

function filterConnectorItems(items, { searchQuery, statusFilter }) {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    return items.filter(item => {
        const status = String(item?.status || '').trim();
        if (statusFilter === 'connected' && status !== 'connected') {
            return false;
        }
        if (statusFilter === 'unconnected' && status === 'connected') {
            return false;
        }
        if (!normalizedQuery) {
            return true;
        }
        const haystack = [
            item?.display_name,
            item?.description,
            item?.provider,
            formatProviderName(item),
            formatProviderDescription(item),
            ...(Array.isArray(item?.capabilities) ? item.capabilities : []),
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
    });
}

function groupConnectorItems(items) {
    return items.reduce(
        (result, item) => {
            const provider = String(item?.provider || '').trim();
            const groupKey = CONNECTOR_GROUP_BY_PROVIDER[provider] || 'internal';
            result[groupKey].push(item);
            return result;
        },
        { official: [], models: [], internal: [] },
    );
}

function formatAccountSummary(item) {
    const accountCount = Number(item?.account_count || 0);
    const enabledCount = Number(item?.enabled_count || 0);
    return formatMessage('feature.connectors.account_summary', {
        enabled: enabledCount,
        total: accountCount,
    });
}

function formatAuthType(authType) {
    const value = String(authType || '').trim();
    if (value === 'api_token') {
        return 'API Token';
    }
    if (value === 'api_key') {
        return 'API Key';
    }
    if (value === 'qr_login') {
        return t('feature.connectors.auth.qr_login');
    }
    if (value === 'username_password') {
        return t('feature.connectors.auth.username_password');
    }
    return value || t('feature.connectors.value.not_configured');
}

function formatDateTime(value) {
    if (!value) {
        return t('feature.connectors.value.none');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    return date.toLocaleString();
}

function formatCapabilities(capabilities) {
    const items = Array.isArray(capabilities) ? capabilities : [];
    if (items.length === 0) {
        return t('feature.connectors.value.none');
    }
    return items
        .map(item => t(CAPABILITY_LABEL_KEYS[String(item || '').trim()] || String(item || '').trim()))
        .join(', ');
}

function formatProviderName(item) {
    const provider = String(item?.provider || item?.connector_id || '').trim();
    return t(PROVIDER_NAME_KEYS[provider] || '') || String(item?.display_name || provider);
}

function formatProviderDescription(item) {
    const provider = String(item?.provider || item?.connector_id || '').trim();
    const key = PROVIDER_DESCRIPTION_KEYS[provider] || '';
    const translated = key ? t(key) : '';
    return translated && translated !== key ? translated : String(item?.description || '');
}

function formatStatus(status) {
    const key = STATUS_LABEL_KEYS[String(status || '').trim()] || '';
    return key ? t(key) : String(status || '');
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
