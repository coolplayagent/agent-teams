/**
 * components/projectView.js
 * Renders the main workspace snapshot for a selected project.
 */
import {
    addRuntimeToolsSystemPath,
    createDiscordGatewayAccount,
    createAutomationProject,
    createXiaolubanGatewayAccount,
    createGitHubRepoSubscription,
    createGitHubTriggerAccount,
    createGitHubTriggerRule,
    createTrigger,
    deleteDiscordGatewayAccount,
    deleteAutomationProject,
    deleteXiaolubanGatewayAccount,
    deleteGitHubRepoSubscription,
    deleteGitHubTriggerAccount,
    deleteGitHubTriggerRule,
    deleteTrigger,
    deleteWeChatGatewayAccount,
    disableAutomationProject,
    disableDiscordGatewayAccount,
    disableXiaolubanGatewayAccount,
    disableGitHubRepoSubscription,
    disableGitHubTriggerAccount,
    disableGitHubTriggerRule,
    disableTrigger,
    disableWeChatGatewayAccount,
    enableGitHubRepoSubscription,
    enableGitHubTriggerAccount,
    enableGitHubTriggerRule,
    enableTrigger,
    enableDiscordGatewayAccount,
    enableXiaolubanGatewayAccount,
    enableWeChatGatewayAccount,
    enableAutomationProject,
    fetchAutomationFeishuBindings,
    fetchAutomationProjects,
    fetchAutomationProject,
    fetchAutomationProjectSessions,
    fetchConfigStatus,
    fetchConnectors,
    fetchRuntimeToolDownload,
    fetchRuntimeTools,
    fetchW3Connector,
    fetchGitHubAccountRepositories,
    fetchGitHubRepoSubscriptions,
    fetchGitHubTriggerAccounts,
    fetchGitHubTriggerRules,
    fetchOrchestrationConfig,
    fetchRoleConfigOptions,
    fetchSshProfiles,
    fetchTriggers,
    fetchDiscordGatewayAccounts,
    fetchXiaolubanGatewayImForwardingCommand,
    fetchXiaolubanGatewayAccounts,
    fetchWeChatGatewayAccounts,
    fetchWorkspaceDiffFile,
    fetchWorkspaces,
    fetchWorkspaceDiffs,
    fetchWorkspaceSnapshot,
    fetchWorkspaceTree,
    openWorkspaceRoot,
    reloadSkillsConfig,
    runAutomationProject,
    fetchRuntimeSkillDetail,
    fetchClawHubSkillMarket,
    fetchClawHubSkillMarketDetail,
    installClawHubMarketSkill,
    searchClawHubSkillMarket,
    uninstallClawHubMarketSkill,
    uninstallRuntimeSkill,
    startRuntimeToolDownload,
    saveW3Connector,
    startWeChatGatewayLogin,
    updateWorkspace,
    updateAutomationProject,
    updateGitHubRepoSubscription,
    updateGitHubTriggerAccount,
    updateGitHubTriggerRule,
    updateTrigger,
    updateDiscordGatewayAccount,
    updateXiaolubanGatewayAccount,
    updateWeChatGatewayAccount,
    waitWeChatGatewayLogin,
} from '../core/api.js';
import { clearAllPanels } from './agentPanel.js';
import { clearNewSessionDraft } from './newSessionDraft.js';
import { hideRoundNavigator } from './rounds/navigator.js';
import {
    bindClawHubSettingsHandlers,
    loadClawHubSettingsPanel,
} from './settings/clawhubSettings.js';
import {
    bindGitHubSettingsHandlers,
    loadGitHubSettingsPanel,
    renderGitHubAccessPanelMarkup,
} from './settings/githubSettings.js';
import {
    renderConnectorConfigModalMarkup,
    renderConnectorsCardPageMarkup,
} from './connectors/connectorCards.js';
import { mountBoardTodoBoard, unmountBoardTodoBoard } from './boards/todoBoard.js';
import { state } from '../core/state.js';
import { els } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { parseMarkdown, stripMarkdownFrontmatter } from '../utils/markdown.js';
import { showConfirmDialog, showFormDialog, showToast } from '../utils/feedback.js';
import { logWarn, sysLog } from '../utils/logger.js';

const SKILLS_MARKET_SEARCH_DELAY_MS = 320;
const SKILLS_MARKET_PAGE_SIZE = 24;
const SKILLS_MARKET_MAX_LIMIT = 500;
const SKILLS_MARKET_BROWSE_SORT = 'popular';
const SKILLS_MARKET_CACHE_STORAGE_KEY = 'relay-teams.skills.market.cache.v1';
const SKILLS_MARKET_DETAIL_CACHE_STORAGE_KEY = 'relay-teams.skills.market.detail.cache.v1';
const SKILLS_MARKET_CACHE_VERSION = 1;
const SKILLS_MARKET_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SKILLS_MARKET_DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SKILLS_MARKET_CACHE_MAX_ENTRIES = 8;
const SKILLS_MARKET_DETAIL_CACHE_MAX_ENTRIES = 20;

let currentWorkspace = null;
let lastKnownWorkspaceId = '';
let currentAutomationProject = null;
let currentProjectViewMode = 'workspace';
let currentFeatureViewId = '';
let currentAutomationProjects = [];
let selectedAutomationHomeProjectId = '';
let currentAutomationHomeDetail = createInitialAutomationHomeDetail();
let currentAutomationFeatureSection = 'schedules';
let currentGitHubFeatureState = createInitialGitHubFeatureState();
let currentGitHubFeatureNodeKey = 'access';
let currentSkillsStatus = null;
let currentSkillsFeatureState = createInitialSkillsFeatureState();
let skillsMarketSearchTimer = null;
let skillsMarketRequestToken = 0;
let skillsDetailRequestToken = 0;
let skillsMarketScrollBound = false;
let currentGatewayFeatureState = createInitialGatewayFeatureState();
let currentAutomationEditorState = createInitialAutomationEditorState();
let currentSnapshot = null;
let currentSnapshotWorkspaceId = null;
let currentMountName = null;
let currentLoadToken = 0;
let currentFeatureRequestToken = 0;
let currentFeatureRequestController = null;
let currentFeatureLoadingTimer = null;
let languageBound = false;
let gatewayModalRoot = null;
let automationEditorModalRoot = null;
let skillsModalRoot = null;
const runtimeToolPollingJobIds = new Set();
let selectedTreePath = null;
let currentDiffState = createInitialDiffState();
const currentMountTrees = new Map();
const expandedTreePaths = new Set();
const loadingTreePaths = new Set();
const treeLoadErrors = new Map();
const workspaceViewCache = new Map();
const skillsMarketCache = new Map();
const skillsMarketDetailCache = new Map();
let skillsMarketCacheStorageLoaded = false;
let skillsMarketDetailCacheStorageLoaded = false;
const FEATURE_VIEW_IDS = Object.freeze({
    skills: 'skills',
    automation: 'automation',
    gateway: 'connectors',
    boards: 'boards',
});
const W3_MESSAGE_KEY_PREFIX = 'feature.connectors.w3.message.';
const FEATURE_LOADING_DELAY_MS = 120;
const FEATURE_CLAWHUB_FIELD_IDS = Object.freeze({
    saveButtonId: 'feature-save-clawhub-token-btn',
    probeButtonId: 'feature-test-clawhub-btn',
    tokenInputId: 'feature-clawhub-token',
    toggleTokenButtonId: 'feature-toggle-clawhub-token-btn',
    statusId: 'feature-clawhub-probe-status',
});
const FEATURE_GITHUB_FIELD_IDS = Object.freeze({
    saveButtonId: 'feature-save-github-btn',
    probeButtonId: 'feature-test-github-btn',
    tokenInputId: 'feature-github-token',
    webhookSaveButtonId: 'feature-save-github-webhook-btn',
    webhookProbeButtonId: 'feature-test-github-webhook-btn',
    webhookBaseUrlInputId: 'feature-github-webhook-base-url',
    callbackPreviewId: 'feature-github-callback-preview',
    tunnelStartButtonId: 'feature-start-github-webhook-tunnel-btn',
    tunnelStopButtonId: 'feature-stop-github-webhook-tunnel-btn',
    tunnelStatusId: 'feature-github-webhook-tunnel-status',
    toggleTokenButtonId: 'feature-toggle-github-token-btn',
    statusId: 'feature-github-probe-status',
    webhookStatusId: 'feature-github-webhook-probe-status',
});
const SKILLS_FEATURE_TABS = Object.freeze({
    market: 'market',
    installed: 'installed',
});
const FEISHU_PLATFORM = 'feishu';
const DISCORD_PLATFORM = 'discord';
const XIAOLUBAN_PLATFORM = 'xiaoluban';
const WECHAT_PLATFORM = 'wechat';
const W3_PLATFORM = 'w3';
const RELAY_KNOWLEDGE_PLATFORM = 'relay-knowledge';
const XIAOLUBAN_NO_WORKSPACES_VALUE = '__no_xiaoluban_notification_workspaces__';
const XIAOLUBAN_ALL_WORKSPACES_VALUE = '__all_xiaoluban_notification_workspaces__';
const DEFAULT_TRIGGER_RULE = 'mention_only';
const DEFAULT_SESSION_MODE = 'normal';
const DEFAULT_THINKING_EFFORT = 'medium';
const DEFAULT_AUTOMATION_TIMEZONE = 'Asia/Shanghai';
const THINKING_EFFORT_OPTIONS = ['minimal', 'low', 'medium', 'high'];
const AUTOMATION_SCHEDULE_KINDS = Object.freeze({
    interval: 'interval',
    daily: 'daily',
    weekdays: 'weekdays',
    weekly: 'weekly',
    monthly: 'monthly',
    advancedCron: 'advanced_cron',
    oneShot: 'one_shot',
    unsupported: 'unsupported',
});
const AUTOMATION_INTERVAL_UNITS = Object.freeze({
    minutes: 'minutes',
    hours: 'hours',
    days: 'days',
});

function createInitialAutomationHomeDetail() {
    return {
        project: null,
        sessions: [],
        workspace: null,
        deliveryBindings: [],
        normalRoles: [],
        orchestrationPresets: [],
    };
}

function createInitialGitHubFeatureState() {
    return {
        accounts: [],
        repos: [],
        rules: [],
        workspaces: [],
    };
}

function createInitialSkillsFeatureState() {
    return {
        activeTab: 'market',
        searchQuery: '',
        marketQuery: '',
        marketStatus: 'idle',
        marketError: '',
        marketItems: [],
        marketLimit: SKILLS_MARKET_PAGE_SIZE,
        marketHasMore: true,
        marketNextCursor: '',
        marketInstallJobs: {},
    };
}

function createInitialAutomationEditorState() {
    return {
        open: false,
        mode: 'create',
        projectId: '',
        project: null,
        title: '',
        message: '',
        confirmLabel: '',
        workspaces: [],
        deliveryBindings: [],
        normalRoles: [],
        orchestrationPresets: [],
        draft: null,
        submitHandler: null,
        resolve: null,
        errorMessage: '',
        submitting: false,
    };
}

function createInitialGatewayFeatureState() {
    return {
        feishuTriggers: [],
        feishuEditingTriggerId: '',
        feishuDraft: null,
        discordEditingAccountId: '',
        discordDraft: null,
        discordDialogResolve: null,
        xiaolubanAccounts: [],
        discordAccounts: [],
        wechatAccounts: [],
        connectorsResponse: null,
        connectorsError: '',
        runtimeToolsResponse: null,
        runtimeToolsError: '',
        runtimeToolJobs: {},
        runtimeToolsSystemPathBusy: false,
        runtimeToolsSystemPathAdded: false,
        runtimeToolsSystemPathMessage: '',
        runtimeToolsSystemPathTone: '',
        connectorSearch: '',
        connectorStatusFilter: 'all',
        connectorModalProvider: '',
        w3Connector: null,
        w3Draft: {
            username: '',
            password: '',
        },
        w3Saving: false,
        w3PasswordRevealed: false,
        w3StatusMessage: '',
        w3StatusTone: '',
        workspaces: [],
        normalRoles: [],
        orchestrationPresets: [],
        wechatLoginRequestId: 0,
        wechatModalOpen: false,
        wechatLoginSession: null,
        wechatStatusMessage: '',
        wechatStatusTone: '',
        wechatConnecting: false,
    };
}

function formatMessage(key, values = {}) {
    return Object.entries(values).reduce(
        (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}

function readErrorDetail(error) {
    return String(error?.detail || error?.message || error || '').trim();
}

function mapXiaolubanGatewayError(error) {
    const detail = readErrorDetail(error);
    if (detail === 'token format is invalid') {
        return t('settings.gateway.xiaoluban_token_invalid');
    }
    if (detail === 'token must be a personal Xiaoluban token') {
        return t('settings.gateway.xiaoluban_personal_token_only');
    }
    if (detail === 'token must not be empty') {
        return t('settings.gateway.xiaoluban_missing_token');
    }
    if (detail === 'xiaoluban_im_callback_url_local') {
        return t('settings.gateway.xiaoluban_im_callback_url_local');
    }
    if (detail === 'workspace_id is required when Xiaoluban IM is enabled') {
        return t('settings.gateway.xiaoluban_im_workspace_required');
    }
    if (detail.startsWith('Unknown IM workspace:')) {
        return t('settings.gateway.xiaoluban_im_workspace_unknown');
    }
    if (
        detail === 'workspace_id is required for Xiaoluban IM'
        || detail === 'workspace_id is required when Xiaoluban IM is enabled'
    ) {
        return t('settings.gateway.xiaoluban_im_workspace_required');
    }
    return t('settings.gateway.xiaoluban_save_failed_message');
}

function createFormFieldError(fieldId, message) {
    const error = new Error(message);
    error.fieldId = fieldId;
    return error;
}

function isXiaolubanTokenErrorDetail(detail) {
    return detail === 'token format is invalid'
        || detail === 'token must be a personal Xiaoluban token'
        || detail === 'token must not be empty'
        || detail === t('settings.gateway.xiaoluban_token_invalid')
        || detail === t('settings.gateway.xiaoluban_personal_token_only')
        || detail === t('settings.gateway.xiaoluban_missing_token');
}

function mapXiaolubanAccountFormError(error) {
    const detail = readErrorDetail(error);
    if (isXiaolubanTokenErrorDetail(detail)) {
        const message = detail.startsWith('token ')
            ? mapXiaolubanGatewayError(error)
            : detail;
        return createFormFieldError('token', message);
    }
    if (
        detail === t('settings.gateway.xiaoluban_im_missing_workspace_options')
        || detail === t('settings.gateway.xiaoluban_im_workspace_required')
    ) {
        return new Error(detail);
    }
    return new Error(mapXiaolubanGatewayError(error));
}

function mapAutomationEditorError(error) {
    const detail = readErrorDetail(error);
    if (
        detail
        === 'delivery_binding.account_id does not have usable Xiaoluban credentials'
    ) {
        return t('automation.delivery.xiaoluban_credentials_unusable');
    }
    if (
        detail
        === 'delivery_binding must reference an existing Xiaoluban account'
    ) {
        return t('automation.delivery.xiaoluban_account_missing');
    }
    if (
        detail
        && !detail.startsWith('delivery_binding.')
        && !detail.startsWith('Failed to ')
        && detail !== 'Failed to fetch'
        && !detail.toLowerCase().includes('network')
    ) {
        return detail;
    }
    return t('automation.delivery.save_failed');
}

function createFeishuTriggerDraft(trigger = null) {
    const sourceConfig = trigger?.source_config && typeof trigger.source_config === 'object' ? trigger.source_config : {};
    const targetConfig = trigger?.target_config && typeof trigger.target_config === 'object' ? trigger.target_config : {};
    const secretStatus = trigger?.secret_status && typeof trigger.secret_status === 'object' ? trigger.secret_status : {};
    const firstWorkspaceId = String(currentGatewayFeatureState.workspaces[0]?.workspace_id || '').trim();
    const firstRoleId = String(currentGatewayFeatureState.normalRoles[0]?.role_id || '').trim();
    return {
        trigger_id: String(trigger?.trigger_id || '').trim(),
        name: String(trigger?.name || 'feishu-main').trim(),
        display_name: String(trigger?.display_name || '').trim(),
        status: String(trigger?.status || 'enabled').trim() || 'enabled',
        source_config: {
            provider: FEISHU_PLATFORM,
            trigger_rule: String(sourceConfig?.trigger_rule || DEFAULT_TRIGGER_RULE).trim() || DEFAULT_TRIGGER_RULE,
            app_id: String(sourceConfig?.app_id || '').trim(),
            app_name: String(sourceConfig?.app_name || '').trim(),
        },
        target_config: {
            workspace_id: String(targetConfig?.workspace_id || firstWorkspaceId).trim(),
            session_mode: String(targetConfig?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE,
            normal_root_role_id: String(targetConfig?.normal_root_role_id || firstRoleId).trim(),
            orchestration_preset_id: String(targetConfig?.orchestration_preset_id || '').trim(),
            yolo: targetConfig?.yolo !== false,
            shell_safety_policy_enabled:
                targetConfig?.shell_safety_policy_enabled !== false,
            thinking: {
                enabled: targetConfig?.thinking?.enabled === true,
                effort: String(targetConfig?.thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT,
            },
        },
        secret_config: {},
        secret_status: { ...secretStatus },
        pending_app_secret: '',
    };
}

function createDiscordAccountDraft(account = null) {
    const firstWorkspaceId = String(currentGatewayFeatureState.workspaces[0]?.workspace_id || '').trim();
    const firstRoleId = String(currentGatewayFeatureState.normalRoles[0]?.role_id || '').trim();
    const thinking = account?.thinking && typeof account.thinking === 'object' ? account.thinking : {};
    const defaultDisplayName = t('settings.gateway.discord_default_display_name');
    return {
        account_id: String(account?.account_id || '').trim(),
        display_name: String(account?.display_name || defaultDisplayName).trim(),
        bot_token: '',
        application_id: String(account?.application_id || '').trim(),
        workspace_id: String(account?.workspace_id || firstWorkspaceId).trim(),
        session_mode: String(account?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE,
        normal_root_role_id: String(account?.normal_root_role_id || firstRoleId).trim(),
        orchestration_preset_id: String(account?.orchestration_preset_id || '').trim(),
        allowed_channel_ids: normalizeDiscordAllowedChannelsForDisplay(account),
        allow_channel_messages: account?.allow_channel_messages === true,
        yolo: account?.yolo !== false,
        shell_safety_policy_enabled: account?.shell_safety_policy_enabled !== false,
        thinking: {
            enabled: thinking?.enabled === true,
            effort: String(thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT,
        },
        enabled: String(account?.status || 'enabled').trim() !== 'disabled',
        secret_status: account?.secret_status && typeof account.secret_status === 'object'
            ? account.secret_status
            : {},
    };
}

function resolveSessionMode(targetConfig) {
    return String(targetConfig?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
}

function resolveNormalRootRoleId(targetConfig) {
    return String(targetConfig?.normal_root_role_id || '').trim();
}

function resolveOrchestrationPresetId(targetConfig) {
    return String(targetConfig?.orchestration_preset_id || '').trim();
}

function resolveThinkingEnabled(targetConfig) {
    return targetConfig?.thinking?.enabled === true;
}

function resolveThinkingEffort(targetConfig) {
    return String(targetConfig?.thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT;
}

function resolveYolo(targetConfig) {
    return targetConfig?.yolo !== false;
}

function resolveRule(sourceConfig) {
    return String(sourceConfig?.trigger_rule || DEFAULT_TRIGGER_RULE).trim() || DEFAULT_TRIGGER_RULE;
}

function renderGatewayWorkspaceOptions(selectedWorkspaceId) {
    if (currentGatewayFeatureState.workspaces.length === 0) {
        return `<option value="">${escapeHtml(t('settings.triggers.no_workspaces'))}</option>`;
    }
    return currentGatewayFeatureState.workspaces.map(workspace => {
        const workspaceId = String(workspace?.workspace_id || '').trim();
        const selected = workspaceId === selectedWorkspaceId ? ' selected' : '';
        return `<option value="${escapeHtml(workspaceId)}"${selected}>${escapeHtml(formatWorkspaceOptionLabel(workspace))}</option>`;
    }).join('');
}

function renderGatewayRoleOptions(selectedRoleId) {
    if (currentGatewayFeatureState.normalRoles.length === 0) {
        return `<option value="">${escapeHtml(t('composer.no_roles'))}</option>`;
    }
    return currentGatewayFeatureState.normalRoles.map(role => {
        const roleId = String(role?.role_id || '').trim();
        const selected = roleId === selectedRoleId ? ' selected' : '';
        return `<option value="${escapeHtml(roleId)}"${selected}>${escapeHtml(String(role?.name || roleId))}</option>`;
    }).join('');
}

function renderGatewayPresetOptions(selectedPresetId) {
    if (currentGatewayFeatureState.orchestrationPresets.length === 0) {
        return `<option value="">${escapeHtml(t('composer.no_presets'))}</option>`;
    }
    return currentGatewayFeatureState.orchestrationPresets.map(preset => {
        const presetId = String(preset?.preset_id || '').trim();
        const selected = presetId === selectedPresetId ? ' selected' : '';
        return `<option value="${escapeHtml(presetId)}"${selected}>${escapeHtml(String(preset?.name || presetId))}</option>`;
    }).join('');
}

function lookupDocumentElement(id) {
    if (!document?.getElementById) {
        return null;
    }
    try {
        return document.getElementById(id);
    } catch {
        return null;
    }
}

function readEditorValue(id) {
    return String(lookupDocumentElement(id)?.value || '').trim();
}

function readEditorChecked(id, fallback = false) {
    const element = lookupDocumentElement(id);
    return typeof element?.checked === 'boolean' ? element.checked : fallback;
}

function renderGatewaySecretToggleButton(inputId, buttonId) {
    const showLabel = t('feedback.show_sensitive');
    const hideLabel = t('feedback.hide_sensitive');
    return `
        <button class="secure-input-btn gateway-secret-toggle-btn" id="${escapeHtml(buttonId)}" type="button" title="${escapeHtml(showLabel)}" aria-label="${escapeHtml(showLabel)}" data-gateway-secret-toggle data-gateway-secret-input="${escapeHtml(inputId)}" data-gateway-secret-show-label="${escapeHtml(showLabel)}" data-gateway-secret-hide-label="${escapeHtml(hideLabel)}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"></circle>
            </svg>
        </button>
    `;
}

function chainElementHandler(element, eventName, handler) {
    if (!element || typeof handler !== 'function') {
        return;
    }
    const property = `on${eventName}`;
    const previousHandler = typeof element[property] === 'function' ? element[property] : null;
    element[property] = event => {
        if (previousHandler) {
            previousHandler.call(element, event);
        }
        handler(event);
    };
}

function updateGatewaySecretToggle(input, button) {
    if (!input || !button) {
        return;
    }
    const hasValue = String(input.value || '').trim().length > 0;
    if (!hasValue) {
        input.type = 'password';
    }
    const revealed = input.type === 'text';
    const showLabel = button.getAttribute?.('data-gateway-secret-show-label') || t('feedback.show_sensitive');
    const hideLabel = button.getAttribute?.('data-gateway-secret-hide-label') || t('feedback.hide_sensitive');
    const nextLabel = revealed ? hideLabel : showLabel;
    if (button.style) {
        button.style.display = hasValue ? 'inline-flex' : 'none';
    }
    button.className = revealed
        ? 'secure-input-btn gateway-secret-toggle-btn is-active'
        : 'secure-input-btn gateway-secret-toggle-btn';
    button.title = nextLabel;
    if (typeof button.setAttribute === 'function') {
        button.setAttribute('aria-label', nextLabel);
    } else {
        button.ariaLabel = nextLabel;
    }
}

function bindGatewaySecretToggles(root) {
    root?.querySelectorAll?.('[data-gateway-secret-toggle]').forEach(button => {
        const inputId = String(button.getAttribute?.('data-gateway-secret-input') || '').trim();
        const input = inputId ? lookupDocumentElement(inputId) : null;
        if (!input) {
            return;
        }
        chainElementHandler(input, 'input', () => {
            updateGatewaySecretToggle(input, button);
        });
        chainElementHandler(button, 'click', () => {
            if (!String(input.value || '').trim()) {
                updateGatewaySecretToggle(input, button);
                return;
            }
            input.type = input.type === 'text' ? 'password' : 'text';
            updateGatewaySecretToggle(input, button);
            if (typeof input.focus === 'function') {
                input.focus();
            }
        });
        updateGatewaySecretToggle(input, button);
    });
}

function syncFeishuDraftFromEditor() {
    const draft = currentGatewayFeatureState.feishuDraft;
    if (!draft) {
        return null;
    }
    const sessionMode = readEditorValue('feishu-session-mode-input') || resolveSessionMode(draft.target_config);
    const thinkingEnabled = readEditorChecked('feishu-trigger-thinking-enabled-input', resolveThinkingEnabled(draft.target_config));
    const nextDraft = {
        ...draft,
        name: readEditorValue('feishu-trigger-name-input') || draft.name,
        display_name: readEditorValue('feishu-display-name-input'),
        status: String(draft.status || '').trim() || 'enabled',
        source_config: {
            ...draft.source_config,
            trigger_rule: readEditorValue('feishu-trigger-rule-input') || resolveRule(draft.source_config),
            app_name: readEditorValue('feishu-app-name-input'),
            app_id: readEditorValue('feishu-app-id-input'),
        },
        target_config: {
            ...draft.target_config,
            workspace_id: readEditorValue('feishu-trigger-workspace-id-input') || String(draft.target_config?.workspace_id || '').trim(),
            session_mode: sessionMode,
            normal_root_role_id: sessionMode === 'normal' ? readEditorValue('feishu-normal-root-role-id-input') : '',
            orchestration_preset_id: sessionMode === 'orchestration' ? readEditorValue('feishu-orchestration-preset-id-input') : '',
            yolo: readEditorChecked('feishu-trigger-yolo-input', resolveYolo(draft.target_config)),
            shell_safety_policy_enabled: readEditorChecked(
                'feishu-trigger-shell-safety-policy-input',
                draft.target_config?.shell_safety_policy_enabled !== false,
            ),
            thinking: {
                enabled: thinkingEnabled,
                effort: thinkingEnabled
                    ? (readEditorValue('feishu-thinking-effort-input') || resolveThinkingEffort(draft.target_config))
                    : DEFAULT_THINKING_EFFORT,
            },
        },
        pending_app_secret: readEditorValue('feishu-app-secret-input'),
    };
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        feishuDraft: nextDraft,
    };
    return nextDraft;
}

function buildFeishuTriggerPayload(draft, { requireSecret = false } = {}) {
    const name = String(draft?.name || '').trim();
    const workspaceId = String(draft?.target_config?.workspace_id || '').trim();
    const appId = String(draft?.source_config?.app_id || '').trim();
    const appName = String(draft?.source_config?.app_name || '').trim();
    const appSecret = String(draft?.pending_app_secret || '').trim();
    const nextSessionMode = resolveSessionMode(draft?.target_config);
    const orchestrationPresetId = resolveOrchestrationPresetId(draft?.target_config);
    if (!name) {
        throw new Error(t('settings.triggers.missing_name'));
    }
    if (!workspaceId) {
        throw new Error(t('settings.triggers.missing_workspace'));
    }
    if (!appId) {
        throw new Error(t('settings.triggers.missing_app_id'));
    }
    if (!appName) {
        throw new Error(t('settings.triggers.missing_app_name'));
    }
    if (requireSecret && !appSecret) {
        throw new Error(t('settings.triggers.missing_app_secret'));
    }
    if (nextSessionMode === 'orchestration' && !orchestrationPresetId) {
        throw new Error(t('settings.triggers.missing_orchestration_preset_id'));
    }
    const payload = {
        name,
        display_name: String(draft?.display_name || '').trim() || null,
        source_config: {
            provider: FEISHU_PLATFORM,
            trigger_rule: resolveRule(draft?.source_config),
            app_id: appId,
            app_name: appName,
        },
        target_config: {
            workspace_id: workspaceId,
            session_mode: nextSessionMode,
            yolo: resolveYolo(draft?.target_config),
            shell_safety_policy_enabled:
                draft?.target_config?.shell_safety_policy_enabled !== false,
            thinking: {
                enabled: resolveThinkingEnabled(draft?.target_config),
                effort: resolveThinkingEnabled(draft?.target_config) ? resolveThinkingEffort(draft?.target_config) : null,
            },
        },
        enabled: String(draft?.status || '').trim() === 'enabled',
    };
    const normalRootRoleId = resolveNormalRootRoleId(draft?.target_config);
    if (nextSessionMode === 'normal' && normalRootRoleId) {
        payload.target_config.normal_root_role_id = normalRootRoleId;
    }
    if (nextSessionMode === 'orchestration' && orchestrationPresetId) {
        payload.target_config.orchestration_preset_id = orchestrationPresetId;
    }
    if (appSecret) {
        payload.secret_config = { app_secret: appSecret };
    }
    return payload;
}

function renderFeishuEditor() {
    const draft = currentGatewayFeatureState.feishuDraft;
    if (!draft) {
        return '';
    }
    const secretStatus = draft.secret_status && typeof draft.secret_status === 'object' ? draft.secret_status : {};
    const sessionMode = resolveSessionMode(draft.target_config);
    const thinkingEnabled = resolveThinkingEnabled(draft.target_config);
    return `
        <div class="gateway-feishu-editor">
            <div class="role-editor-panel">
                <div class="role-editor-form">
                    <div class="role-editor-sections">
                        <section class="role-editor-section">
                            <h5>${escapeHtml(t('settings.triggers.bot_configuration'))}</h5>
                            <div class="gateway-feishu-section-stack">
                                <div class="gateway-feishu-field-grid">
                                    <div class="form-group">
                                        <label for="feishu-trigger-name-input">${escapeHtml(t('settings.triggers.trigger_name'))}</label>
                                        <input id="feishu-trigger-name-input" value="${escapeHtml(String(draft.name || ''))}">
                                    </div>
                                    <div class="form-group">
                                        <label for="feishu-display-name-input">${escapeHtml(t('settings.triggers.display_name'))}</label>
                                        <input id="feishu-display-name-input" value="${escapeHtml(String(draft.display_name || ''))}">
                                    </div>
                                </div>
                                <div class="gateway-feishu-field-grid">
                                    <div class="form-group">
                                        <label for="feishu-app-name-input">${escapeHtml(t('settings.triggers.feishu_app_name'))}</label>
                                        <input id="feishu-app-name-input" placeholder="${escapeHtml(t('settings.triggers.feishu_app_name_placeholder'))}" value="${escapeHtml(String(draft.source_config?.app_name || ''))}">
                                    </div>
                                    <div class="form-group">
                                        <label for="feishu-app-id-input">${escapeHtml(t('settings.triggers.feishu_app_id'))}</label>
                                        <input id="feishu-app-id-input" placeholder="${escapeHtml(t('settings.triggers.feishu_app_id_placeholder'))}" value="${escapeHtml(String(draft.source_config?.app_id || ''))}">
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="feishu-app-secret-input">${escapeHtml(t('settings.triggers.feishu_app_secret'))}</label>
                                    <div class="secure-input-row gateway-secret-input-row">
                                        <input id="feishu-app-secret-input" type="password" placeholder="${escapeHtml(secretStatus?.app_secret_configured ? t('settings.triggers.secret_keep_placeholder') : t('settings.triggers.feishu_app_secret_placeholder'))}" value="" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
                                        ${renderGatewaySecretToggleButton('feishu-app-secret-input', 'toggle-feishu-app-secret-btn')}
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section class="role-editor-section">
                            <h5>${escapeHtml(t('settings.triggers.session_configuration'))}</h5>
                            <div class="gateway-feishu-section-stack">
                                <div class="gateway-feishu-field-grid">
                                    <div class="form-group">
                                        <label for="feishu-trigger-workspace-id-input">${escapeHtml(t('settings.triggers.workspace'))}</label>
                                        <select id="feishu-trigger-workspace-id-input">
                                            ${renderGatewayWorkspaceOptions(String(draft.target_config?.workspace_id || '').trim())}
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label for="feishu-trigger-rule-input">${escapeHtml(t('settings.triggers.rule'))}</label>
                                        <select id="feishu-trigger-rule-input">
                                            <option value="mention_only"${resolveRule(draft.source_config) === 'mention_only' ? ' selected' : ''}>mention_only</option>
                                            <option value="all_messages"${resolveRule(draft.source_config) === 'all_messages' ? ' selected' : ''}>all_messages</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="gateway-feishu-field-grid">
                                    <div class="form-group gateway-session-mode-field">
                                        <label for="feishu-session-mode-input">${escapeHtml(t('settings.triggers.mode'))}</label>
                                        <select id="feishu-session-mode-input">
                                            <option value="normal"${sessionMode === 'normal' ? ' selected' : ''}>${escapeHtml(t('composer.mode_normal'))}</option>
                                            <option value="orchestration"${sessionMode === 'orchestration' ? ' selected' : ''}>${escapeHtml(t('composer.mode_orchestration'))}</option>
                                        </select>
                                    </div>
                                    <div class="form-group gateway-session-mode-detail" id="feishu-normal-role-field"${sessionMode === 'normal' ? '' : ' style="display:none;"'}>
                                        <label for="feishu-normal-root-role-id-input">${escapeHtml(t('settings.triggers.normal_root_role_id'))}</label>
                                        <select id="feishu-normal-root-role-id-input">
                                            ${renderGatewayRoleOptions(resolveNormalRootRoleId(draft.target_config))}
                                        </select>
                                    </div>
                                    <div class="form-group gateway-session-mode-detail" id="feishu-preset-field"${sessionMode === 'orchestration' ? '' : ' style="display:none;"'}>
                                        <label for="feishu-orchestration-preset-id-input">${escapeHtml(t('settings.triggers.orchestration_preset_id'))}</label>
                                        <select id="feishu-orchestration-preset-id-input">
                                            ${renderGatewayPresetOptions(resolveOrchestrationPresetId(draft.target_config))}
                                        </select>
                                    </div>
                                </div>
                                <div class="gateway-toggle-grid">
                                    <div class="gateway-setting-panel">
                                        <label class="gateway-setting-toggle-row" for="feishu-trigger-yolo-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.yolo'))}</span>
                                            <input id="feishu-trigger-yolo-input" type="checkbox"${resolveYolo(draft.target_config) ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                    </div>
                                    <div class="gateway-setting-panel">
                                        <label class="gateway-setting-toggle-row" for="feishu-trigger-shell-safety-policy-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.shell_safety_policy_enabled'))}</span>
                                            <input id="feishu-trigger-shell-safety-policy-input" type="checkbox"${draft.target_config?.shell_safety_policy_enabled !== false ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                    </div>
                                    <div class="gateway-setting-panel gateway-thinking-panel${thinkingEnabled ? ' is-expanded' : ''}" id="feishu-thinking-panel">
                                        <label class="gateway-setting-toggle-row" for="feishu-trigger-thinking-enabled-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.thinking_enabled'))}</span>
                                            <input id="feishu-trigger-thinking-enabled-input" type="checkbox"${thinkingEnabled ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                        <div class="gateway-thinking-panel-body" id="feishu-thinking-effort-field"${thinkingEnabled ? '' : ' style="display:none;"'}>
                                            <label class="gateway-thinking-panel-label" for="feishu-thinking-effort-input">${escapeHtml(t('settings.triggers.thinking_effort'))}</label>
                                            <select id="feishu-thinking-effort-input">
                                                ${THINKING_EFFORT_OPTIONS.map(effort => `<option value="${effort}"${resolveThinkingEffort(draft.target_config) === effort ? ' selected' : ''}>${effort}</option>`).join('')}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <div class="gateway-editor-actions">
                        <button class="secondary-btn gateway-editor-action-btn gateway-editor-cancel-btn" type="button" data-feature-feishu-cancel>${escapeHtml(t('settings.action.cancel'))}</button>
                        <button class="primary-btn gateway-editor-action-btn gateway-editor-save-btn" type="button" data-feature-feishu-save>${escapeHtml(t('settings.action.save'))}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function bindFeishuEditorInputs() {
    if (!currentGatewayFeatureState.feishuDraft) {
        return;
    }
    [
        'feishu-trigger-name-input',
        'feishu-display-name-input',
        'feishu-app-name-input',
        'feishu-app-id-input',
        'feishu-app-secret-input',
        'feishu-trigger-workspace-id-input',
        'feishu-trigger-rule-input',
        'feishu-normal-root-role-id-input',
        'feishu-orchestration-preset-id-input',
        'feishu-thinking-effort-input',
        'feishu-trigger-yolo-input',
        'feishu-trigger-shell-safety-policy-input',
    ].forEach(id => {
        const element = lookupDocumentElement(id);
        if (!element) {
            return;
        }
        element.oninput = () => {
            syncFeishuDraftFromEditor();
        };
        element.onchange = () => {
            syncFeishuDraftFromEditor();
        };
    });
    const sessionModeInput = lookupDocumentElement('feishu-session-mode-input');
    if (sessionModeInput) {
        sessionModeInput.onchange = () => {
            syncFeishuDraftFromEditor();
            syncFeishuSessionFieldVisibility();
        };
    }
    const thinkingEnabledInput = lookupDocumentElement('feishu-trigger-thinking-enabled-input');
    if (thinkingEnabledInput) {
        thinkingEnabledInput.onchange = () => {
            syncFeishuDraftFromEditor();
            syncFeishuThinkingEffortVisibility();
        };
    }
    syncFeishuSessionFieldVisibility();
    syncFeishuThinkingEffortVisibility();
}

function syncFeishuSessionFieldVisibility() {
    const mode = readEditorValue('feishu-session-mode-input') || resolveSessionMode(currentGatewayFeatureState.feishuDraft?.target_config);
    const normalField = lookupDocumentElement('feishu-normal-role-field');
    const presetField = lookupDocumentElement('feishu-preset-field');
    if (normalField?.style) {
        normalField.style.display = mode === 'normal' ? '' : 'none';
    }
    if (presetField?.style) {
        presetField.style.display = mode === 'orchestration' ? '' : 'none';
    }
}

function syncFeishuThinkingEffortVisibility() {
    const enabled = readEditorChecked('feishu-trigger-thinking-enabled-input', resolveThinkingEnabled(currentGatewayFeatureState.feishuDraft?.target_config));
    const effortField = lookupDocumentElement('feishu-thinking-effort-field');
    const thinkingPanel = lookupDocumentElement('feishu-thinking-panel');
    if (effortField?.style) {
        effortField.style.display = enabled ? '' : 'none';
    }
    if (thinkingPanel?.classList) {
        if (enabled) {
            thinkingPanel.classList.add('is-expanded');
        } else {
            thinkingPanel.classList.remove('is-expanded');
        }
    }
}

function renderDiscordEditor() {
    const draft = currentGatewayFeatureState.discordDraft;
    if (!draft) {
        return '';
    }
    const sessionMode = String(draft.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const thinkingEnabled = draft.thinking?.enabled === true;
    const isEditing = String(draft.account_id || '').trim().length > 0;
    const tokenConfigured = draft.secret_status?.bot_token_configured === true;
    const tokenPlaceholder = isEditing && tokenConfigured
        ? t('settings.gateway.discord_token_edit_placeholder')
        : 'Bot token';
    const developerPortalUrl = 'https://discord.com/developers/applications';
    return `
        <div class="gateway-discord-editor">
            <div class="role-editor-panel">
                <div class="role-editor-form">
                    <div class="role-editor-sections">
                        <section class="role-editor-section">
                            <h5>${escapeHtml(t('settings.triggers.bot_configuration'))}</h5>
                            <div class="gateway-discord-section-stack">
                                <div class="gateway-discord-field-grid">
                                    <div class="form-group">
                                        <label for="discord-display-name-input">${escapeHtml(t('settings.gateway.display_name'))}</label>
                                        <input id="discord-display-name-input" value="${escapeHtml(String(draft.display_name || ''))}">
                                    </div>
                                    <div class="form-group">
                                        <label for="discord-application-id-input">${escapeHtml(t('settings.gateway.discord_application_id'))}</label>
                                        <input id="discord-application-id-input" placeholder="123456789012345678" value="${escapeHtml(String(draft.application_id || ''))}">
                                        <p class="gateway-field-help">${escapeHtml(t('settings.gateway.discord_application_id_copy'))}</p>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="discord-bot-token-input">${escapeHtml(t('settings.gateway.discord_bot_token'))}</label>
                                    <div class="secure-input-row gateway-secret-input-row">
                                        <input id="discord-bot-token-input" type="password" placeholder="${escapeHtml(tokenPlaceholder)}" value="" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
                                        ${renderGatewaySecretToggleButton('discord-bot-token-input', 'toggle-discord-bot-token-btn')}
                                    </div>
                                    <p class="gateway-field-help">${escapeHtml(isEditing && tokenConfigured ? t('settings.gateway.discord_token_edit_copy') : t('settings.gateway.discord_token_copy'))}</p>
                                </div>
                                <a class="web-provider-link-card gateway-discord-token-link" href="${escapeHtml(developerPortalUrl)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(developerPortalUrl)}" aria-label="${escapeHtml(developerPortalUrl)}">
                                    <span class="web-provider-link-copy">
                                        <span class="web-provider-link-badge">${escapeHtml(t('settings.gateway.discord_token_source'))}</span>
                                        <span class="web-provider-link-url">${escapeHtml(t('settings.gateway.discord_developer_portal'))}</span>
                                        <span class="settings-token-source-note">${escapeHtml(t('settings.gateway.discord_developer_portal_help'))}</span>
                                    </span>
                                    <span class="web-provider-link-arrow" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" class="icon-sm">
                                            <path d="M7 17L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                            <path d="M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </span>
                                </a>
                            </div>
                        </section>
                        <section class="role-editor-section gateway-discord-routing-section">
                            <h5>${escapeHtml(t('settings.gateway.discord_routing'))}</h5>
                            <div class="gateway-discord-section-stack">
                                <div class="gateway-discord-channel-card">
                                    <label for="discord-allowed-channel-ids-input">${escapeHtml(t('settings.gateway.discord_allowed_channels'))}</label>
                                    <div class="gateway-discord-channel-input-shell">
                                        <textarea id="discord-allowed-channel-ids-input" rows="3" placeholder="${escapeHtml(t('settings.gateway.discord_allowed_channels_placeholder'))}" autocapitalize="off" autocorrect="off" spellcheck="false">${escapeHtml(String(draft.allowed_channel_ids || ''))}</textarea>
                                    </div>
                                    <div class="gateway-discord-channel-footer">
                                        <span>${escapeHtml(t('settings.gateway.discord_allowed_channels_copy'))}</span>
                                        <span>${escapeHtml(t('settings.gateway.discord_allowed_channels_hint'))}</span>
                                    </div>
                                </div>
                                <div class="gateway-toggle-grid">
                                    <div class="gateway-setting-panel">
                                        <label class="gateway-setting-toggle-row" for="discord-allow-channel-messages-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.gateway.discord_allow_channel_messages'))}</span>
                                            <input id="discord-allow-channel-messages-input" type="checkbox"${draft.allow_channel_messages === true ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                    </div>
                                    ${isEditing ? '' : `
                                        <div class="gateway-setting-panel">
                                            <label class="gateway-setting-toggle-row" for="discord-enabled-input">
                                                <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.option_enabled'))}</span>
                                                <input id="discord-enabled-input" type="checkbox"${draft.enabled !== false ? ' checked' : ''}>
                                                <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                    <span class="gateway-editor-toggle-thumb"></span>
                                                </span>
                                            </label>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </section>
                        <section class="role-editor-section">
                            <h5>${escapeHtml(t('settings.triggers.session_configuration'))}</h5>
                            <div class="gateway-discord-section-stack">
                                <div class="form-group">
                                    <label for="discord-workspace-id-input">${escapeHtml(t('settings.triggers.workspace'))}</label>
                                    <select id="discord-workspace-id-input">
                                        ${renderGatewayWorkspaceOptions(String(draft.workspace_id || '').trim())}
                                    </select>
                                </div>
                                <div class="gateway-discord-field-grid">
                                    <div class="form-group gateway-session-mode-field">
                                        <label for="discord-session-mode-input">${escapeHtml(t('settings.triggers.mode'))}</label>
                                        <select id="discord-session-mode-input">
                                            <option value="normal"${sessionMode === 'normal' ? ' selected' : ''}>${escapeHtml(t('composer.mode_normal'))}</option>
                                            <option value="orchestration"${sessionMode === 'orchestration' ? ' selected' : ''}>${escapeHtml(t('composer.mode_orchestration'))}</option>
                                        </select>
                                    </div>
                                    <div class="form-group gateway-session-mode-detail" id="discord-normal-role-field"${sessionMode === 'normal' ? '' : ' style="display:none;"'}>
                                        <label for="discord-normal-root-role-id-input">${escapeHtml(t('settings.triggers.normal_root_role_id'))}</label>
                                        <select id="discord-normal-root-role-id-input">
                                            ${renderGatewayRoleOptions(String(draft.normal_root_role_id || '').trim())}
                                        </select>
                                    </div>
                                    <div class="form-group gateway-session-mode-detail" id="discord-preset-field"${sessionMode === 'orchestration' ? '' : ' style="display:none;"'}>
                                        <label for="discord-orchestration-preset-id-input">${escapeHtml(t('settings.triggers.orchestration_preset_id'))}</label>
                                        <select id="discord-orchestration-preset-id-input">
                                            ${renderGatewayPresetOptions(String(draft.orchestration_preset_id || '').trim())}
                                        </select>
                                    </div>
                                </div>
                                <div class="gateway-toggle-grid">
                                    <div class="gateway-setting-panel">
                                        <label class="gateway-setting-toggle-row" for="discord-yolo-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.yolo'))}</span>
                                            <input id="discord-yolo-input" type="checkbox"${draft.yolo !== false ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                    </div>
                                    <div class="gateway-setting-panel">
                                        <label class="gateway-setting-toggle-row" for="discord-shell-safety-policy-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.shell_safety_policy_enabled'))}</span>
                                            <input id="discord-shell-safety-policy-input" type="checkbox"${draft.shell_safety_policy_enabled !== false ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                    </div>
                                    <div class="gateway-setting-panel gateway-thinking-panel${thinkingEnabled ? ' is-expanded' : ''}" id="discord-thinking-panel">
                                        <label class="gateway-setting-toggle-row" for="discord-thinking-enabled-input">
                                            <span class="gateway-setting-toggle-copy">${escapeHtml(t('settings.triggers.thinking_enabled'))}</span>
                                            <input id="discord-thinking-enabled-input" type="checkbox"${thinkingEnabled ? ' checked' : ''}>
                                            <span class="gateway-editor-toggle-switch" aria-hidden="true">
                                                <span class="gateway-editor-toggle-thumb"></span>
                                            </span>
                                        </label>
                                        <div class="gateway-thinking-panel-body" id="discord-thinking-effort-field"${thinkingEnabled ? '' : ' style="display:none;"'}>
                                            <label class="gateway-thinking-panel-label" for="discord-thinking-effort-input">${escapeHtml(t('settings.triggers.thinking_effort'))}</label>
                                            <select id="discord-thinking-effort-input">
                                                ${THINKING_EFFORT_OPTIONS.map(effort => `<option value="${effort}"${String(draft.thinking?.effort || DEFAULT_THINKING_EFFORT) === effort ? ' selected' : ''}>${effort}</option>`).join('')}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <div class="gateway-editor-submit-error" id="discord-editor-submit-error" hidden></div>
                    <div class="gateway-editor-actions">
                        <button class="secondary-btn gateway-editor-action-btn gateway-editor-cancel-btn" type="button" data-feature-discord-cancel>${escapeHtml(t('settings.action.cancel'))}</button>
                        <button class="primary-btn gateway-editor-action-btn gateway-editor-save-btn" type="button" data-feature-discord-save>${escapeHtml(t('settings.action.save'))}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function syncDiscordSessionFieldVisibility() {
    const mode = readEditorValue('discord-session-mode-input') || String(currentGatewayFeatureState.discordDraft?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const normalField = lookupDocumentElement('discord-normal-role-field');
    const presetField = lookupDocumentElement('discord-preset-field');
    if (normalField?.style) {
        normalField.style.display = mode === 'normal' ? '' : 'none';
    }
    if (presetField?.style) {
        presetField.style.display = mode === 'orchestration' ? '' : 'none';
    }
}

function syncDiscordThinkingEffortVisibility() {
    const enabled = readEditorChecked('discord-thinking-enabled-input', currentGatewayFeatureState.discordDraft?.thinking?.enabled === true);
    const effortField = lookupDocumentElement('discord-thinking-effort-field');
    const thinkingPanel = lookupDocumentElement('discord-thinking-panel');
    if (effortField?.style) {
        effortField.style.display = enabled ? '' : 'none';
    }
    if (thinkingPanel?.classList) {
        if (enabled) {
            thinkingPanel.classList.add('is-expanded');
        } else {
            thinkingPanel.classList.remove('is-expanded');
        }
    }
}

function bindDiscordEditorInputs() {
    if (!currentGatewayFeatureState.discordDraft) {
        return;
    }
    const sessionModeInput = lookupDocumentElement('discord-session-mode-input');
    if (sessionModeInput) {
        sessionModeInput.onchange = syncDiscordSessionFieldVisibility;
    }
    const thinkingEnabledInput = lookupDocumentElement('discord-thinking-enabled-input');
    if (thinkingEnabledInput) {
        thinkingEnabledInput.onchange = syncDiscordThinkingEffortVisibility;
    }
    syncDiscordSessionFieldVisibility();
    syncDiscordThinkingEffortVisibility();
}

function buildDiscordAccountPayloadFromEditor(draft) {
    const isEditing = String(draft?.account_id || '').trim().length > 0;
    const displayName = readEditorValue('discord-display-name-input');
    const workspaceId = readEditorValue('discord-workspace-id-input');
    const nextSessionMode = readEditorValue('discord-session-mode-input') || DEFAULT_SESSION_MODE;
    const orchestrationPresetId = readEditorValue('discord-orchestration-preset-id-input');
    const botToken = normalizeXiaolubanTokenFormValue(readEditorValue('discord-bot-token-input'));
    const thinkingEnabled = readEditorChecked('discord-thinking-enabled-input', draft?.thinking?.enabled === true);
    if (!displayName) {
        throw new Error(t('settings.gateway.missing_display_name'));
    }
    if (!isEditing && !botToken) {
        throw new Error(t('settings.gateway.discord_missing_token'));
    }
    if (!workspaceId) {
        throw new Error(t('settings.gateway.missing_workspace'));
    }
    if (nextSessionMode === 'orchestration' && !orchestrationPresetId) {
        throw new Error(t('settings.gateway.missing_orchestration_preset_id'));
    }
    const payload = {
        display_name: displayName,
        application_id: readEditorValue('discord-application-id-input') || null,
        allowed_channel_ids: normalizeDelimitedIdentifierList(readEditorValue('discord-allowed-channel-ids-input')),
        allow_channel_messages: readEditorChecked('discord-allow-channel-messages-input', draft?.allow_channel_messages === true),
        workspace_id: workspaceId,
        session_mode: nextSessionMode,
        yolo: readEditorChecked('discord-yolo-input', draft?.yolo !== false),
        shell_safety_policy_enabled: readEditorChecked('discord-shell-safety-policy-input', draft?.shell_safety_policy_enabled !== false),
        thinking: {
            enabled: thinkingEnabled,
            effort: thinkingEnabled
                ? (readEditorValue('discord-thinking-effort-input') || DEFAULT_THINKING_EFFORT)
                : null,
        },
        normal_root_role_id: nextSessionMode === 'normal'
            ? (readEditorValue('discord-normal-root-role-id-input') || null)
            : null,
        orchestration_preset_id: nextSessionMode === 'orchestration' ? orchestrationPresetId : null,
    };
    if (!isEditing) {
        payload.enabled = readEditorChecked('discord-enabled-input', draft?.enabled !== false);
    }
    if (botToken) {
        payload.bot_token = botToken;
    }
    return payload;
}

function setDiscordEditorError(message) {
    const errorNode = lookupDocumentElement('discord-editor-submit-error');
    if (!errorNode) {
        return;
    }
    errorNode.textContent = String(message || '').trim();
    if (errorNode.style) {
        errorNode.style.display = message ? '' : 'none';
    }
    if (typeof errorNode.hidden === 'boolean') {
        errorNode.hidden = !message;
    }
}


function findWorkspaceById(workspaces, workspaceId) {
    const safeWorkspaceId = String(workspaceId || '').trim();
    return (Array.isArray(workspaces) ? workspaces : []).find(workspace => String(workspace?.workspace_id || '').trim() === safeWorkspaceId) || null;
}

function formatWorkspaceOptionLabel(workspace) {
    const workspaceId = String(workspace?.workspace_id || '').trim();
    const rootPath = String(workspace?.root_path || '').trim();
    if (workspaceId && rootPath) {
        return `${workspaceId} - ${rootPath}`;
    }
    return workspaceId || rootPath;
}

function formatWorkspaceOptionDescription(workspace) {
    const rootPath = String(workspace?.root_path || '').trim();
    return rootPath || t('automation.workspace.help');
}

const AUTOMATION_TIMEZONE_OPTIONS = [
    { value: 'UTC', label: 'UTC' },
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
    { value: 'America/New_York', label: 'America/New_York' },
    { value: 'Europe/London', label: 'Europe/London' },
];

function resolveDeliveryProviderLabel(provider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === XIAOLUBAN_PLATFORM) {
        return t('settings.gateway.xiaoluban_title');
    }
    return t('settings.gateway.im_feishu_title');
}

function buildAutomationBindingKey(binding) {
    const provider = String(binding?.provider || FEISHU_PLATFORM).trim().toLowerCase();
    if (provider === XIAOLUBAN_PLATFORM) {
        const accountId = String(binding?.account_id || '').trim();
        return accountId ? `${provider}::${accountId}` : '';
    }
    const triggerId = String(binding?.trigger_id || '').trim();
    const tenantKey = String(binding?.tenant_key || '').trim();
    const chatId = String(binding?.chat_id || '').trim();
    const sessionId = String(binding?.session_id || '').trim();
    if (!triggerId || !tenantKey || !chatId || !sessionId) {
        return '';
    }
    return `${provider}::${triggerId}::${tenantKey}::${chatId}::${sessionId}`;
}

function buildAutomationBindingOptions(bindings) {
    const safeBindings = Array.isArray(bindings) ? bindings : [];
    const options = [
        {
            value: '',
            label: t('sidebar.delivery_none'),
            description: t('sidebar.delivery_none_copy'),
        },
    ];
    safeBindings.forEach(binding => {
        const bindingKey = buildAutomationBindingKey(binding);
        if (!bindingKey) {
            return;
        }
        const providerLabel = resolveDeliveryProviderLabel(binding?.provider);
        if (String(binding?.provider || '').trim().toLowerCase() === XIAOLUBAN_PLATFORM) {
            const displayName = String(binding?.display_name || '').trim();
            const sourceLabel = String(binding?.source_label || '').trim();
            const derivedUid = String(binding?.derived_uid || '').trim();
            options.push({
                value: bindingKey,
                label: sourceLabel || displayName || derivedUid || bindingKey,
                description: [providerLabel, displayName || derivedUid].filter(Boolean).join(' - '),
            });
            return;
        }
        const triggerName = String(binding?.trigger_name || '').trim();
        const sourceLabel = String(binding?.source_label || '').trim();
        const chatType = String(binding?.chat_type || '').trim();
        const sessionTitle = String(binding?.session_title || '').trim();
        options.push({
            value: bindingKey,
            label: sessionTitle || sourceLabel || bindingKey,
            description: [providerLabel, triggerName, chatType].filter(Boolean).join(' - '),
        });
    });
    return options;
}

function resolveAutomationBindingDisplayName(binding, bindings) {
    const bindingKey = buildAutomationBindingKey(binding);
    const candidate = (Array.isArray(bindings) ? bindings : []).find(
        item => buildAutomationBindingKey(item) === bindingKey,
    );
    if (String(binding?.provider || '').trim().toLowerCase() === XIAOLUBAN_PLATFORM) {
        const sourceLabel = String(candidate?.source_label || binding?.source_label || '').trim();
        if (sourceLabel) {
            return sourceLabel;
        }
        const displayName = String(candidate?.display_name || binding?.display_name || '').trim();
        if (displayName) {
            return displayName;
        }
        return String(binding?.derived_uid || '').trim();
    }
    const sessionTitle = String(candidate?.session_title || '').trim();
    if (sessionTitle) {
        return sessionTitle;
    }
    const sourceLabel = String(binding?.source_label || '').trim();
    if (sourceLabel) {
        return sourceLabel;
    }
    return String(binding?.chat_id || '').trim();
}

function formatAutomationRunLogMessage(result) {
    const sessionId = String(result?.session_id || '').trim();
    if (result?.queued === true) {
        return formatMessage('sidebar.log.queued_bound_session', { session_id: sessionId });
    }
    if (result?.reused_bound_session === true) {
        return formatMessage('sidebar.log.started_bound_session', { session_id: sessionId });
    }
    return formatMessage('sidebar.log.started_automation_run', { session_id: sessionId });
}

async function fetchAutomationSessionConfigDependencies(context, options = {}) {
    const [roleOptions, orchestrationConfig] = await Promise.all([
        fetchRoleConfigOptions({ signal: options.signal }).catch(error => {
            if (isAbortError(error)) {
                throw error;
            }
            logWarn(
                'frontend.automation.role_options_failed',
                'Failed to fetch automation role options',
                {
                    context,
                    error_message: String(error?.message || error || ''),
                },
            );
            return { normal_mode_roles: [] };
        }),
        fetchOrchestrationConfig({ signal: options.signal }).catch(error => {
            if (isAbortError(error)) {
                throw error;
            }
            logWarn(
                'frontend.automation.orchestration_config_failed',
                'Failed to fetch automation orchestration config',
                {
                    context,
                    error_message: String(error?.message || error || ''),
                },
            );
            return { presets: [] };
        }),
    ]);
    return {
        normalRoles: normalizeRoleOptions(roleOptions),
        orchestrationPresets: normalizeOrchestrationPresets(orchestrationConfig),
    };
}

export async function requestAutomationProjectInput(project = {}, dialogOptions = {}) {
    const [workspaces, deliveryBindings, sessionConfigDependencies] = await Promise.all([
        fetchWorkspaces(),
        fetchAutomationFeishuBindings(),
        fetchAutomationSessionConfigDependencies('editor'),
    ]);
    const workspaceList = Array.isArray(workspaces) ? workspaces : [];
    if (workspaceList.length === 0) {
        return null;
    }
    const normalRoles = Array.isArray(sessionConfigDependencies?.normalRoles)
        ? sessionConfigDependencies.normalRoles
        : [];
    const orchestrationPresets = Array.isArray(sessionConfigDependencies?.orchestrationPresets)
        ? sessionConfigDependencies.orchestrationPresets
        : [];
    const isEditing = String(project?.automation_project_id || '').trim().length > 0;
    const draft = createAutomationEditorDraft(
        project,
        workspaceList,
        normalRoles,
        orchestrationPresets,
    );
    const defaultTitle = isEditing ? t('automation.edit.title') : t('sidebar.new_automation_title');
    const defaultMessage = isEditing ? t('automation.edit.message') : t('sidebar.new_automation_message');
    const defaultConfirmLabel = isEditing ? t('automation.edit.save') : t('sidebar.new_automation_create');
    return await new Promise(resolve => {
        currentAutomationEditorState = {
            open: true,
            mode: isEditing ? 'edit' : 'create',
            projectId: String(project?.name || '').trim(),
            project,
            title: String(dialogOptions?.title || defaultTitle).trim() || defaultTitle,
            message: String(dialogOptions?.message || defaultMessage).trim() || defaultMessage,
            confirmLabel: String(dialogOptions?.confirmLabel || defaultConfirmLabel).trim() || defaultConfirmLabel,
            workspaces: workspaceList,
            deliveryBindings,
            normalRoles,
            orchestrationPresets,
            draft,
            submitHandler: typeof dialogOptions?.submitHandler === 'function'
                ? dialogOptions.submitHandler
                : null,
            resolve,
            errorMessage: '',
        };
        renderAutomationEditorModal();
    });
}

function buildAutomationDeliveryEvents(project) {
    const deliveryEvents = Array.isArray(project?.delivery_events) ? project.delivery_events : [];
    return {
        started: deliveryEvents.includes('started'),
        completed: deliveryEvents.includes('completed'),
        failed: deliveryEvents.includes('failed'),
    };
}

function splitTimeValue(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }
    return {
        hour,
        minute,
        normalized: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

function isFixedCronNumber(value, minimum, maximum) {
    const rawValue = String(value || '').trim();
    if (!/^\d+$/.test(rawValue)) {
        return false;
    }
    const numberValue = Number.parseInt(rawValue, 10);
    return !Number.isNaN(numberValue) && numberValue >= minimum && numberValue <= maximum;
}

function getFormatterParts(date, timezone) {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || DEFAULT_AUTOMATION_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date).reduce((result, part) => {
            if (part.type !== 'literal') {
                result[part.type] = part.value;
            }
            return result;
        }, {});
    } catch {
        return {};
    }
}

function formatIsoToLocalDate(isoValue, timezone) {
    const date = new Date(String(isoValue || '').trim());
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const parts = getFormatterParts(date, timezone);
    if (!parts.year || !parts.month || !parts.day) {
        return '';
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatIsoToLocalTime(isoValue, timezone) {
    const date = new Date(String(isoValue || '').trim());
    if (Number.isNaN(date.getTime())) {
        return '09:00';
    }
    const parts = getFormatterParts(date, timezone);
    if (!parts.hour || !parts.minute) {
        return '09:00';
    }
    return `${parts.hour}:${parts.minute}`;
}

function formatAutomationUtcDateTime(value, fallback) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return fallback;
    }
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
        return rawValue;
    }
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-') + ' ' + [
        String(date.getUTCHours()).padStart(2, '0'),
        String(date.getUTCMinutes()).padStart(2, '0'),
    ].join(':') + ' UTC';
}

function createDefaultOneShotDate(timezone) {
    const now = new Date();
    const parts = getFormatterParts(now, timezone);
    const year = Number.parseInt(parts.year || '', 10);
    const month = Number.parseInt(parts.month || '', 10);
    const day = Number.parseInt(parts.day || '', 10);
    if (!year || !month || !day) {
        const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return fallback.toISOString().slice(0, 10);
    }
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const nextParts = getFormatterParts(nextDay, timezone);
    if (!nextParts.year || !nextParts.month || !nextParts.day) {
        return nextDay.toISOString().slice(0, 10);
    }
    return `${nextParts.year}-${nextParts.month}-${nextParts.day}`;
}

function zonedDateTimeToIso(dateValue, timeValue, timezone) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || '').trim());
    const timeParts = splitTimeValue(timeValue);
    if (!dateMatch || !timeParts) {
        return '';
    }
    const year = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10);
    const day = Number.parseInt(dateMatch[3], 10);
    let guessUtc = Date.UTC(year, month - 1, day, timeParts.hour, timeParts.minute);
    for (let index = 0; index < 3; index += 1) {
        const parts = getFormatterParts(new Date(guessUtc), timezone);
        const actualYear = Number.parseInt(parts.year || '', 10);
        const actualMonth = Number.parseInt(parts.month || '', 10);
        const actualDay = Number.parseInt(parts.day || '', 10);
        const actualHour = Number.parseInt(parts.hour || '', 10);
        const actualMinute = Number.parseInt(parts.minute || '', 10);
        if ([actualYear, actualMonth, actualDay, actualHour, actualMinute].some(Number.isNaN)) {
            break;
        }
        const targetMillis = Date.UTC(year, month - 1, day, timeParts.hour, timeParts.minute);
        const actualMillis = Date.UTC(actualYear, actualMonth - 1, actualDay, actualHour, actualMinute);
        const diff = targetMillis - actualMillis;
        if (diff === 0) {
            break;
        }
        guessUtc += diff;
    }
    return new Date(guessUtc).toISOString();
}

function parseAutomationScheduleDraft(project, timezone) {
    const scheduleMode = String(project?.schedule_mode || 'cron').trim() || 'cron';
    const selectedTimezone = String(timezone || DEFAULT_AUTOMATION_TIMEZONE).trim() || DEFAULT_AUTOMATION_TIMEZONE;
    const fallback = {
        kind: AUTOMATION_SCHEDULE_KINDS.daily,
        time: '09:00',
        intervalEvery: '1',
        intervalUnit: AUTOMATION_INTERVAL_UNITS.hours,
        weekday: '1',
        dayOfMonth: '1',
        runDate: createDefaultOneShotDate(selectedTimezone),
        cronExpression: '',
        unsupportedExpression: '',
        requiresReset: false,
    };
    if (scheduleMode === 'interval') {
        const intervalEvery = Number.parseInt(String(project?.interval_every || '1').trim(), 10);
        const intervalUnit = String(project?.interval_unit || AUTOMATION_INTERVAL_UNITS.hours).trim() || AUTOMATION_INTERVAL_UNITS.hours;
        return {
            ...fallback,
            kind: AUTOMATION_SCHEDULE_KINDS.interval,
            intervalEvery: Number.isNaN(intervalEvery) || intervalEvery < 1 ? '1' : String(intervalEvery),
            intervalUnit: Object.values(AUTOMATION_INTERVAL_UNITS).includes(intervalUnit)
                ? intervalUnit
                : AUTOMATION_INTERVAL_UNITS.hours,
        };
    }
    if (scheduleMode === 'one_shot' || scheduleMode === 'one-shot') {
        return {
            ...fallback,
            kind: AUTOMATION_SCHEDULE_KINDS.oneShot,
            time: formatIsoToLocalTime(project?.run_at, selectedTimezone),
            runDate: formatIsoToLocalDate(project?.run_at, selectedTimezone) || createDefaultOneShotDate(selectedTimezone),
        };
    }
    const cron = String(project?.cron_expression || '').trim();
    if (!cron) {
        return fallback;
    }
    const parts = cron.split(/\s+/);
    if (parts.length !== 5) {
        return {
            ...fallback,
            kind: AUTOMATION_SCHEDULE_KINDS.advancedCron,
            cronExpression: cron,
            unsupportedExpression: cron,
        };
    }
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (!isFixedCronNumber(minute, 0, 59) || !isFixedCronNumber(hour, 0, 23)) {
        return {
            ...fallback,
            kind: AUTOMATION_SCHEDULE_KINDS.advancedCron,
            cronExpression: cron,
            unsupportedExpression: cron,
        };
    }
    const time = splitTimeValue(`${hour}:${minute}`)?.normalized || '09:00';
    if (month === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
        return { ...fallback, kind: AUTOMATION_SCHEDULE_KINDS.daily, time };
    }
    if (month === '*' && dayOfMonth === '*' && dayOfWeek === '1-5') {
        return { ...fallback, kind: AUTOMATION_SCHEDULE_KINDS.weekdays, time };
    }
    if (month === '*' && dayOfMonth === '*' && /^(0|1|2|3|4|5|6|7)$/.test(dayOfWeek)) {
        return { ...fallback, kind: AUTOMATION_SCHEDULE_KINDS.weekly, time, weekday: dayOfWeek };
    }
    if (month === '*' && /^\d+$/.test(dayOfMonth) && dayOfWeek === '*') {
        return { ...fallback, kind: AUTOMATION_SCHEDULE_KINDS.monthly, time, dayOfMonth };
    }
    return {
        ...fallback,
        kind: AUTOMATION_SCHEDULE_KINDS.advancedCron,
        cronExpression: cron,
        unsupportedExpression: cron,
    };
}

function createAutomationEditorDraft(project, workspaces, normalRoles = [], orchestrationPresets = []) {
    const workspaceList = Array.isArray(workspaces) ? workspaces : [];
    const firstWorkspaceId = String(workspaceList[0]?.workspace_id || '').trim();
    const runConfig = project?.run_config && typeof project.run_config === 'object' ? project.run_config : {};
    const isEditing = String(project?.automation_project_id || '').trim().length > 0;
    const sessionMode = String(runConfig?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const defaultNormalRootRoleId = String(normalRoles[0]?.role_id || '').trim();
    const defaultOrchestrationPresetId = String(orchestrationPresets[0]?.preset_id || '').trim();
    const timezone = String(project?.timezone || DEFAULT_AUTOMATION_TIMEZONE).trim() || DEFAULT_AUTOMATION_TIMEZONE;
    const schedule = parseAutomationScheduleDraft(project, timezone);
    const deliveryEvents = buildAutomationDeliveryEvents(project);
    const persistedNormalRootRoleId = String(runConfig?.normal_root_role_id || '').trim();
    const persistedOrchestrationPresetId = String(runConfig?.orchestration_preset_id || '').trim();
    const hasDeliveryBinding = String(buildAutomationBindingKey(project?.delivery_binding)).trim().length > 0;
    return {
        display_name: String(project?.display_name || project?.name || '').trim(),
        workspace_id: String(project?.workspace_id || firstWorkspaceId).trim(),
        prompt: String(project?.prompt || '').trim(),
        timezone,
        session_mode: sessionMode,
        normal_root_role_id: isEditing ? persistedNormalRootRoleId : defaultNormalRootRoleId,
        orchestration_preset_id: String(
            isEditing
                ? persistedOrchestrationPresetId
                : (sessionMode === 'orchestration' ? defaultOrchestrationPresetId : '')
            || '',
        ).trim(),
        execution_mode: String(runConfig?.execution_mode || 'ai').trim() || 'ai',
        yolo: runConfig?.yolo !== false,
        thinking_enabled: runConfig?.thinking?.enabled === true,
        thinking_effort: String(runConfig?.thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT,
        delivery_binding_key: buildAutomationBindingKey(project?.delivery_binding),
        delivery_event_started: hasDeliveryBinding ? deliveryEvents.started : true,
        delivery_event_completed: hasDeliveryBinding ? deliveryEvents.completed : true,
        delivery_event_failed: hasDeliveryBinding ? deliveryEvents.failed : true,
        schedule_kind: schedule.kind,
        time_of_day: schedule.time,
        interval_every: schedule.intervalEvery,
        interval_unit: schedule.intervalUnit,
        weekly_day: schedule.weekday,
        monthly_day: schedule.dayOfMonth,
        run_date: schedule.runDate,
        cron_expression: schedule.cronExpression,
        unsupported_expression: schedule.unsupportedExpression,
        requires_schedule_reset: schedule.requiresReset,
    };
}

function resolveAutomationScheduleSummary(draft) {
    const time = splitTimeValue(draft?.time_of_day)?.normalized || '09:00';
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.interval) {
        return formatMessage('automation.schedule.summary.interval', {
            count: String(draft?.interval_every || '1'),
            unit: t(`automation.schedule.interval_unit.${String(draft?.interval_unit || AUTOMATION_INTERVAL_UNITS.hours)}`),
        });
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekdays) {
        return formatMessage('automation.schedule.summary.weekdays', { time });
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekly) {
        return formatMessage('automation.schedule.summary.weekly', {
            weekday: formatCronWeekday(draft?.weekly_day || '1'),
            time,
        });
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.monthly) {
        return formatMessage('automation.schedule.summary.monthly', {
            day: String(draft?.monthly_day || '1'),
            time,
        });
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.oneShot) {
        return formatMessage('automation.schedule.summary.one_shot', {
            date: String(draft?.run_date || ''),
            time,
        });
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.advancedCron) {
        return formatMessage('automation.schedule.summary.advanced_cron', {
            expression: String(draft?.cron_expression || '').trim(),
        });
    }
    return formatMessage('automation.schedule.summary.daily', { time });
}

function buildAutomationSchedulePayload(draft) {
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.unsupported) {
        throw new Error(t('automation.schedule.validation.reset_required'));
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.interval) {
        const intervalEvery = Number.parseInt(String(draft?.interval_every || '').trim(), 10);
        const intervalUnit = String(draft?.interval_unit || '').trim();
        if (Number.isNaN(intervalEvery) || intervalEvery < 1) {
            throw new Error(t('automation.schedule.validation.interval_every'));
        }
        if (!Object.values(AUTOMATION_INTERVAL_UNITS).includes(intervalUnit)) {
            throw new Error(t('automation.schedule.validation.interval_unit'));
        }
        return {
            schedule_mode: 'interval',
            cron_expression: null,
            interval_every: intervalEvery,
            interval_unit: intervalUnit,
            run_at: null,
        };
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.advancedCron) {
        const cronExpression = String(draft?.cron_expression || '').trim();
        if (!cronExpression || cronExpression.split(/\s+/).length !== 5) {
            throw new Error(t('automation.schedule.validation.cron_expression'));
        }
        return {
            schedule_mode: 'cron',
            cron_expression: cronExpression,
            interval_every: null,
            interval_unit: null,
            run_at: null,
        };
    }
    const time = splitTimeValue(draft?.time_of_day);
    if (!time) {
        throw new Error(t('automation.schedule.validation.time'));
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.oneShot) {
        const runDate = String(draft?.run_date || '').trim();
        if (!runDate) {
            throw new Error(t('automation.schedule.validation.date'));
        }
        const runAt = zonedDateTimeToIso(runDate, time.normalized, draft?.timezone || DEFAULT_AUTOMATION_TIMEZONE);
        if (!runAt) {
            throw new Error(t('automation.schedule.validation.date'));
        }
        return {
            schedule_mode: 'one_shot',
            cron_expression: null,
            interval_every: null,
            interval_unit: null,
            run_at: runAt,
        };
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekly) {
        const weekday = String(draft?.weekly_day || '').trim();
        if (!/^(0|1|2|3|4|5|6|7)$/.test(weekday)) {
            throw new Error(t('automation.schedule.validation.weekday'));
        }
        return {
            schedule_mode: 'cron',
            cron_expression: `${time.minute} ${time.hour} * * ${weekday}`,
            interval_every: null,
            interval_unit: null,
            run_at: null,
        };
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.monthly) {
        const monthlyDay = Number.parseInt(String(draft?.monthly_day || '').trim(), 10);
        if (Number.isNaN(monthlyDay) || monthlyDay < 1 || monthlyDay > 31) {
            throw new Error(t('automation.schedule.validation.monthly_day'));
        }
        return {
            schedule_mode: 'cron',
            cron_expression: `${time.minute} ${time.hour} ${monthlyDay} * *`,
            interval_every: null,
            interval_unit: null,
            run_at: null,
        };
    }
    if (draft?.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekdays) {
        return {
            schedule_mode: 'cron',
            cron_expression: `${time.minute} ${time.hour} * * 1-5`,
            interval_every: null,
            interval_unit: null,
            run_at: null,
        };
    }
    return {
        schedule_mode: 'cron',
        cron_expression: `${time.minute} ${time.hour} * * *`,
        interval_every: null,
        interval_unit: null,
        run_at: null,
    };
}

function buildAutomationProjectPayload(draft, deliveryBindings, project) {
    const displayName = String(draft?.display_name || '').trim();
    const workspaceId = String(draft?.workspace_id || '').trim();
    const prompt = String(draft?.prompt || '').trim();
    const timezone = String(draft?.timezone || DEFAULT_AUTOMATION_TIMEZONE).trim() || DEFAULT_AUTOMATION_TIMEZONE;
    const sessionMode = String(draft?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const normalRootRoleId = String(draft?.normal_root_role_id || '').trim();
    const orchestrationPresetId = String(draft?.orchestration_preset_id || '').trim();
    if (!displayName) {
        throw new Error(t('automation.schedule.validation.name'));
    }
    if (!workspaceId) {
        throw new Error(t('automation.schedule.validation.workspace'));
    }
    if (!prompt) {
        throw new Error(t('automation.schedule.validation.prompt'));
    }
    if (sessionMode === 'orchestration' && !orchestrationPresetId) {
        throw new Error(t('settings.triggers.missing_orchestration_preset_id'));
    }
    const schedulePayload = buildAutomationSchedulePayload({ ...draft, timezone });
    const selectedBindingKey = String(draft?.delivery_binding_key || '').trim();
    const selectedBinding = (Array.isArray(deliveryBindings) ? deliveryBindings : []).find(
        binding => buildAutomationBindingKey(binding) === selectedBindingKey,
    ) || null;
    const nextDeliveryEvents = selectedBinding ? [
        draft?.delivery_event_started === true ? 'started' : null,
        draft?.delivery_event_completed === true ? 'completed' : null,
        draft?.delivery_event_failed === true ? 'failed' : null,
    ].filter(Boolean) : [];
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(project?.name || 'automation-project');
    const hasExistingProject = String(project?.automation_project_id || '').trim().length > 0;
    const preservedEnabled = typeof project?.enabled === 'boolean'
        ? project.enabled
        : String(project?.status || 'enabled').trim() !== 'disabled';
    return {
        name: slug,
        display_name: displayName,
        workspace_id: workspaceId,
        prompt,
        timezone,
        enabled: hasExistingProject ? preservedEnabled : true,
        run_config: {
            session_mode: sessionMode,
            normal_root_role_id: sessionMode === 'normal' ? (normalRootRoleId || null) : null,
            orchestration_preset_id: sessionMode === 'orchestration' ? orchestrationPresetId : null,
            execution_mode: String(draft?.execution_mode || 'ai').trim() || 'ai',
            yolo: draft?.yolo !== false,
            thinking: {
                enabled: draft?.thinking_enabled === true,
                effort: draft?.thinking_enabled === true
                    ? (String(draft?.thinking_effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT)
                    : null,
            },
        },
        ...schedulePayload,
        delivery_binding: selectedBinding ? buildAutomationBindingPayload(selectedBinding) : null,
        delivery_events: nextDeliveryEvents,
    };
}

function buildAutomationBindingPayload(binding) {
    const provider = String(binding?.provider || FEISHU_PLATFORM).trim().toLowerCase();
    if (provider === XIAOLUBAN_PLATFORM) {
        return {
            provider: XIAOLUBAN_PLATFORM,
            account_id: String(binding?.account_id || '').trim(),
            display_name: String(binding?.display_name || '').trim(),
            derived_uid: String(binding?.derived_uid || '').trim(),
            source_label: String(binding?.source_label || '').trim(),
        };
    }
    return {
        provider: FEISHU_PLATFORM,
        trigger_id: String(binding?.trigger_id || '').trim(),
        tenant_key: String(binding?.tenant_key || '').trim(),
        chat_id: String(binding?.chat_id || '').trim(),
        session_id: String(binding?.session_id || '').trim(),
        chat_type: String(binding?.chat_type || '').trim(),
        source_label: String(binding?.source_label || '').trim(),
    };
}

function lookupAutomationEditorElement(id) {
    if (!document?.getElementById) {
        return null;
    }
    try {
        return document.getElementById(id);
    } catch {
        return null;
    }
}

function readAutomationEditorValue(id, fallback = '') {
    const element = lookupAutomationEditorElement(id);
    return element?.value != null ? String(element.value).trim() : fallback;
}

function readAutomationEditorChecked(id, fallback = false) {
    const element = lookupAutomationEditorElement(id);
    return typeof element?.checked === 'boolean' ? element.checked : fallback;
}

function syncAutomationEditorDraftFromDom() {
    if (!currentAutomationEditorState.draft) {
        return null;
    }
    const nextDraft = {
        ...currentAutomationEditorState.draft,
        display_name: readAutomationEditorValue('automation-editor-display-name-input', currentAutomationEditorState.draft.display_name),
        workspace_id: readAutomationEditorValue('automation-editor-workspace-id-input', currentAutomationEditorState.draft.workspace_id),
        prompt: readAutomationEditorValue('automation-editor-prompt-input', currentAutomationEditorState.draft.prompt),
        timezone: readAutomationEditorValue('automation-editor-timezone-input', currentAutomationEditorState.draft.timezone),
        session_mode: readAutomationEditorValue('automation-editor-session-mode-input', currentAutomationEditorState.draft.session_mode),
        normal_root_role_id: readAutomationEditorValue('automation-editor-normal-root-role-id-input', currentAutomationEditorState.draft.normal_root_role_id),
        orchestration_preset_id: readAutomationEditorValue('automation-editor-orchestration-preset-id-input', currentAutomationEditorState.draft.orchestration_preset_id),
        delivery_binding_key: readAutomationEditorValue('automation-editor-delivery-binding-input', currentAutomationEditorState.draft.delivery_binding_key),
        delivery_event_started: readAutomationEditorChecked('automation-editor-delivery-started-input', currentAutomationEditorState.draft.delivery_event_started),
        delivery_event_completed: readAutomationEditorChecked('automation-editor-delivery-completed-input', currentAutomationEditorState.draft.delivery_event_completed),
        delivery_event_failed: readAutomationEditorChecked('automation-editor-delivery-failed-input', currentAutomationEditorState.draft.delivery_event_failed),
        schedule_kind: readAutomationEditorValue('automation-editor-schedule-kind-input', currentAutomationEditorState.draft.schedule_kind),
        time_of_day: readAutomationEditorValue('automation-editor-time-input', currentAutomationEditorState.draft.time_of_day),
        interval_every: readAutomationEditorValue('automation-editor-interval-every-input', currentAutomationEditorState.draft.interval_every),
        interval_unit: readAutomationEditorValue('automation-editor-interval-unit-input', currentAutomationEditorState.draft.interval_unit),
        weekly_day: readAutomationEditorValue('automation-editor-weekday-input', currentAutomationEditorState.draft.weekly_day),
        monthly_day: readAutomationEditorValue('automation-editor-monthly-day-input', currentAutomationEditorState.draft.monthly_day),
        run_date: readAutomationEditorValue('automation-editor-run-date-input', currentAutomationEditorState.draft.run_date),
        cron_expression: readAutomationEditorValue('automation-editor-cron-expression-input', currentAutomationEditorState.draft.cron_expression),
    };
    currentAutomationEditorState = {
        ...currentAutomationEditorState,
        draft: nextDraft,
    };
    return nextDraft;
}

function renderAutomationEditorFieldOptions(options, selectedValue) {
    return (Array.isArray(options) ? options : []).map(option => {
        const value = String(option?.value || '').trim();
        const selected = value === String(selectedValue || '').trim() ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(String(option?.label || value))}</option>`;
    }).join('');
}

function ensureAutomationEditorSelectedOption(options, selectedValue) {
    const normalizedSelectedValue = String(selectedValue || '').trim();
    const normalizedOptions = Array.isArray(options) ? options : [];
    if (!normalizedSelectedValue) {
        return normalizedOptions;
    }
    const hasSelectedOption = normalizedOptions.some(
        option => String(option?.value || '').trim() === normalizedSelectedValue,
    );
    if (hasSelectedOption) {
        return normalizedOptions;
    }
    return [
        ...normalizedOptions,
        {
            value: normalizedSelectedValue,
            label: normalizedSelectedValue,
            description: normalizedSelectedValue,
        },
    ];
}

function renderAutomationEditorWeekdayOptions(selectedValue) {
    return renderAutomationEditorFieldOptions([
        { value: '1', label: t('automation.cron.weekday.mon') },
        { value: '2', label: t('automation.cron.weekday.tue') },
        { value: '3', label: t('automation.cron.weekday.wed') },
        { value: '4', label: t('automation.cron.weekday.thu') },
        { value: '5', label: t('automation.cron.weekday.fri') },
        { value: '6', label: t('automation.cron.weekday.sat') },
        { value: '0', label: t('automation.cron.weekday.sun') },
    ], selectedValue);
}

function resolveAutomationSessionModeOptions() {
    return [
        { value: 'normal', label: t('composer.mode_normal') },
        { value: 'orchestration', label: t('composer.mode_orchestration') },
    ];
}

function renderAutomationEditorScheduleDetail(draft) {
    const scheduleKind = String(draft?.schedule_kind || AUTOMATION_SCHEDULE_KINDS.daily).trim();
    if (scheduleKind === AUTOMATION_SCHEDULE_KINDS.interval) {
        return `
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.interval_every'))}</span>
                <input id="automation-editor-interval-every-input" data-automation-editor-interval-every type="number" min="1" value="${escapeHtml(String(draft?.interval_every || '1'))}">
            </label>
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.interval_unit'))}</span>
                <select id="automation-editor-interval-unit-input" data-automation-editor-interval-unit>
                    ${renderAutomationEditorFieldOptions(resolveAutomationIntervalUnitOptions(), draft?.interval_unit || AUTOMATION_INTERVAL_UNITS.hours)}
                </select>
            </label>
        `;
    }
    if (scheduleKind === AUTOMATION_SCHEDULE_KINDS.weekly) {
        return `
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.weekday'))}</span>
                <select id="automation-editor-weekday-input" data-automation-editor-weekday>
                    ${renderAutomationEditorWeekdayOptions(draft?.weekly_day || '1')}
                </select>
            </label>
        `;
    }
    if (scheduleKind === AUTOMATION_SCHEDULE_KINDS.monthly) {
        return `
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.monthly_day'))}</span>
                <input id="automation-editor-monthly-day-input" data-automation-editor-monthly-day type="number" min="1" max="31" value="${escapeHtml(String(draft?.monthly_day || '1'))}">
            </label>
        `;
    }
    if (scheduleKind === AUTOMATION_SCHEDULE_KINDS.oneShot) {
        return `
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.run_date'))}</span>
                <input id="automation-editor-run-date-input" data-automation-editor-run-date type="date" value="${escapeHtml(String(draft?.run_date || ''))}">
            </label>
        `;
    }
    if (scheduleKind === AUTOMATION_SCHEDULE_KINDS.advancedCron) {
        return `
            <label class="automation-editor-field">
                <span>${escapeHtml(t('automation.schedule.cron_expression'))}</span>
                <input id="automation-editor-cron-expression-input" data-automation-editor-cron-expression type="text" value="${escapeHtml(String(draft?.cron_expression || draft?.unsupported_expression || ''))}" placeholder="*/15 * * * *">
            </label>
        `;
    }
    return '';
}

function resolveAutomationIntervalUnitOptions() {
    return [
        { value: AUTOMATION_INTERVAL_UNITS.minutes, label: t('automation.schedule.interval_unit.minutes') },
        { value: AUTOMATION_INTERVAL_UNITS.hours, label: t('automation.schedule.interval_unit.hours') },
        { value: AUTOMATION_INTERVAL_UNITS.days, label: t('automation.schedule.interval_unit.days') },
    ];
}

function ensureAutomationEditorModalRoot() {
    if (!document?.body) {
        return null;
    }
    if (!automationEditorModalRoot) {
        try {
            automationEditorModalRoot = document.getElementById('automation-editor-modal-root');
        } catch {
            automationEditorModalRoot = null;
        }
    }
    if (!automationEditorModalRoot && typeof document.createElement === 'function') {
        automationEditorModalRoot = document.createElement('div');
        automationEditorModalRoot.id = 'automation-editor-modal-root';
        automationEditorModalRoot.className = 'gateway-feature-modal-root automation-editor-modal-root';
        if (typeof document.body.appendChild === 'function') {
            document.body.appendChild(automationEditorModalRoot);
        }
    }
    return automationEditorModalRoot;
}

function renderAutomationEditorModal() {
    const root = ensureAutomationEditorModalRoot();
    if (!root) {
        return;
    }
    if (currentAutomationEditorState.open !== true || !currentAutomationEditorState.draft) {
        root.innerHTML = '';
        return;
    }
    const draft = currentAutomationEditorState.draft;
    const bindingOptions = buildAutomationBindingOptions(currentAutomationEditorState.deliveryBindings);
    const workspaceOptions = (Array.isArray(currentAutomationEditorState.workspaces) ? currentAutomationEditorState.workspaces : []).map(workspace => ({
        value: String(workspace?.workspace_id || '').trim(),
        label: formatWorkspaceOptionLabel(workspace),
    })).filter(option => option.value);
    const sessionMode = String(draft.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const normalRoleOptions = ensureAutomationEditorSelectedOption(
        resolveRoleOptionsForForms(currentAutomationEditorState.normalRoles),
        draft.normal_root_role_id,
    );
    const orchestrationPresetOptions = ensureAutomationEditorSelectedOption(
        resolvePresetOptionsForForms(currentAutomationEditorState.orchestrationPresets),
        draft.orchestration_preset_id,
    );
    const bindingSelected = String(draft.delivery_binding_key || '').trim().length > 0;
    const scheduleLocked = draft.requires_schedule_reset === true && draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.unsupported;
    root.innerHTML = `
        <div class="modal gateway-feature-modal automation-editor-modal" data-automation-editor-modal>
            <div class="modal-content gateway-feature-modal-content automation-editor-modal-content" role="dialog" aria-modal="true" aria-labelledby="automation-editor-modal-title">
                <div class="modal-header gateway-feature-modal-header automation-editor-modal-header">
                    <div class="gateway-feature-modal-heading automation-editor-modal-heading">
                        <h3 id="automation-editor-modal-title">${escapeHtml(currentAutomationEditorState.title)}</h3>
                        <p>${escapeHtml(currentAutomationEditorState.message)}</p>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-automation-editor-close>
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="gateway-feature-modal-body automation-editor-modal-body">
                    ${currentAutomationEditorState.errorMessage
                        ? `<div class="feature-inline-status is-danger">${escapeHtml(currentAutomationEditorState.errorMessage)}</div>`
                        : ''
                    }
                    ${scheduleLocked
                        ? `<div class="feature-inline-status is-warning">${escapeHtml(formatMessage('automation.schedule.unsupported_copy', { expression: draft.unsupported_expression || t('automation.detail.not_scheduled') }))}</div>`
                        : ''
                    }
                    <div class="automation-editor-panel">
                        <section class="automation-editor-block">
                            <div class="automation-editor-section-head">
                                <h4>${escapeHtml(t('automation.edit.section.basic'))}</h4>
                            </div>
                            <div class="automation-editor-grid automation-editor-grid-2">
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('automation.field.project_name'))}</span>
                                    <input id="automation-editor-display-name-input" data-automation-editor-display-name type="text" placeholder="Daily Briefing" value="${escapeHtml(draft.display_name)}">
                                </label>
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('automation.field.workspace'))}</span>
                                    <select id="automation-editor-workspace-id-input" data-automation-editor-workspace>
                                        ${renderAutomationEditorFieldOptions(workspaceOptions, draft.workspace_id)}
                                    </select>
                                </label>
                            </div>
                            <label class="automation-editor-field automation-editor-field-prompt">
                                <span>${escapeHtml(t('automation.detail.prompt'))}</span>
                                <textarea id="automation-editor-prompt-input" data-automation-editor-prompt>${escapeHtml(draft.prompt)}</textarea>
                            </label>
                        </section>
                        <section class="automation-editor-block">
                            <div class="automation-editor-section-head">
                                <h4>${escapeHtml(t('automation.detail.schedule'))}</h4>
                            </div>
                            <div class="automation-editor-grid automation-editor-grid-3">
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('automation.schedule.kind'))}</span>
                                    <select id="automation-editor-schedule-kind-input" data-automation-editor-schedule-kind>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.unsupported)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.unsupported ? ' selected' : ''}>${escapeHtml(t('automation.schedule.choose'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.interval)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.interval ? ' selected' : ''}>${escapeHtml(t('automation.schedule.interval'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.daily)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.daily ? ' selected' : ''}>${escapeHtml(t('automation.schedule.daily'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.weekdays)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekdays ? ' selected' : ''}>${escapeHtml(t('automation.schedule.weekdays'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.weekly)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.weekly ? ' selected' : ''}>${escapeHtml(t('automation.schedule.weekly'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.monthly)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.monthly ? ' selected' : ''}>${escapeHtml(t('automation.schedule.monthly'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.advancedCron)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.advancedCron ? ' selected' : ''}>${escapeHtml(t('automation.schedule.advanced_cron'))}</option>
                                        <option value="${escapeHtml(AUTOMATION_SCHEDULE_KINDS.oneShot)}"${draft.schedule_kind === AUTOMATION_SCHEDULE_KINDS.oneShot ? ' selected' : ''}>${escapeHtml(t('automation.schedule.one_shot'))}</option>
                                    </select>
                                </label>
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('automation.schedule.time'))}</span>
                                    <input id="automation-editor-time-input" data-automation-editor-time type="time" value="${escapeHtml(String(draft.time_of_day || '09:00'))}">
                                </label>
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('automation.detail.timezone'))}</span>
                                    <select id="automation-editor-timezone-input" data-automation-editor-timezone>
                                        ${renderAutomationEditorFieldOptions(AUTOMATION_TIMEZONE_OPTIONS, draft.timezone)}
                                    </select>
                                </label>
                            </div>
                            ${renderAutomationEditorScheduleDetail(draft)
                                ? `<div class="automation-editor-grid automation-editor-grid-2">${renderAutomationEditorScheduleDetail(draft)}</div>`
                                : ''
                            }
                        </section>
                        <section class="automation-editor-block">
                            <div class="automation-editor-section-head">
                                <h4>${escapeHtml(t('settings.triggers.session_configuration'))}</h4>
                            </div>
                            <div class="automation-editor-grid automation-editor-grid-2">
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('settings.triggers.mode'))}</span>
                                    <select id="automation-editor-session-mode-input" data-automation-editor-session-mode>
                                        ${renderAutomationEditorFieldOptions(resolveAutomationSessionModeOptions(), sessionMode)}
                                    </select>
                                </label>
                                ${sessionMode === 'normal' ? `
                                    <label class="automation-editor-field">
                                        <span>${escapeHtml(t('settings.triggers.normal_root_role_id'))}</span>
                                        <select id="automation-editor-normal-root-role-id-input" data-automation-editor-normal-root-role-id>
                                            ${renderAutomationEditorFieldOptions(normalRoleOptions, draft.normal_root_role_id)}
                                        </select>
                                    </label>
                                ` : `
                                    <label class="automation-editor-field">
                                        <span>${escapeHtml(t('settings.triggers.orchestration_preset_id'))}</span>
                                        <select id="automation-editor-orchestration-preset-id-input" data-automation-editor-orchestration-preset-id>
                                            ${renderAutomationEditorFieldOptions(orchestrationPresetOptions, draft.orchestration_preset_id)}
                                        </select>
                                    </label>
                                `}
                            </div>
                        </section>
                        <section class="automation-editor-block">
                            <div class="automation-editor-section-head">
                                <h4>${escapeHtml(t('automation.edit.section.delivery'))}</h4>
                            </div>
                            <div class="automation-editor-grid automation-editor-grid-1">
                                <label class="automation-editor-field">
                                    <span>${escapeHtml(t('sidebar.delivery_target'))}</span>
                                    <select id="automation-editor-delivery-binding-input" data-automation-editor-binding>
                                        ${renderAutomationEditorFieldOptions(bindingOptions, draft.delivery_binding_key)}
                                    </select>
                                </label>
                            </div>
                            ${bindingSelected ? `
                                <div class="automation-editor-toggle-grid">
                                    <label class="automation-editor-compact-toggle">
                                        <input id="automation-editor-delivery-started-input" data-automation-editor-delivery-started type="checkbox" ${draft.delivery_event_started ? 'checked' : ''}>
                                        <span>${escapeHtml(t('sidebar.notify_on_start'))}</span>
                                    </label>
                                    <label class="automation-editor-compact-toggle">
                                        <input id="automation-editor-delivery-completed-input" data-automation-editor-delivery-completed type="checkbox" ${draft.delivery_event_completed ? 'checked' : ''}>
                                        <span>${escapeHtml(t('sidebar.notify_on_completion'))}</span>
                                    </label>
                                    <label class="automation-editor-compact-toggle">
                                        <input id="automation-editor-delivery-failed-input" data-automation-editor-delivery-failed type="checkbox" ${draft.delivery_event_failed ? 'checked' : ''}>
                                        <span>${escapeHtml(t('sidebar.notify_on_failure'))}</span>
                                    </label>
                                </div>
                            ` : ''}
                        </section>
                    </div>
                </div>
                <div class="gateway-connect-modal-actions automation-editor-actions">
                    <button class="secondary-btn" type="button" data-automation-editor-cancel>${escapeHtml(t('settings.action.cancel'))}</button>
                    <button class="primary-btn" type="button" data-automation-editor-save>${escapeHtml(currentAutomationEditorState.confirmLabel)}</button>
                </div>
            </div>
        </div>
    `;
    if (currentAutomationEditorState.submitting === true) {
        root.querySelectorAll('button,input,select,textarea').forEach(node => {
            node.disabled = true;
        });
    }
    bindAutomationEditorModal();
}

function settleAutomationEditor(result) {
    const resolve = currentAutomationEditorState.resolve;
    currentAutomationEditorState = createInitialAutomationEditorState();
    renderAutomationEditorModal();
    if (typeof resolve === 'function') {
        resolve(result);
    }
}

function bindAutomationEditorModal() {
    const root = ensureAutomationEditorModalRoot();
    if (!root) {
        return;
    }
    root.querySelectorAll('[data-automation-editor-close],[data-automation-editor-cancel]').forEach(button => {
        button.addEventListener('click', () => {
            if (currentAutomationEditorState.submitting === true) {
                return;
            }
            settleAutomationEditor(null);
        });
    });
    root.querySelector('[data-automation-editor-save]')?.addEventListener('click', () => {
        void (async () => {
            if (currentAutomationEditorState.submitting === true) {
                return;
            }
            try {
                const draft = syncAutomationEditorDraftFromDom();
                const payload = buildAutomationProjectPayload(
                    draft,
                    currentAutomationEditorState.deliveryBindings,
                    currentAutomationEditorState.project || { name: currentAutomationEditorState.projectId },
                );
                currentAutomationEditorState = {
                    ...currentAutomationEditorState,
                    draft,
                    errorMessage: '',
                    submitting: true,
                };
                renderAutomationEditorModal();
                if (typeof currentAutomationEditorState.submitHandler === 'function') {
                    const result = await currentAutomationEditorState.submitHandler(payload);
                    settleAutomationEditor(result ?? payload);
                    return;
                }
                settleAutomationEditor(payload);
            } catch (error) {
                currentAutomationEditorState = {
                    ...currentAutomationEditorState,
                    errorMessage: mapAutomationEditorError(error),
                    submitting: false,
                };
                renderAutomationEditorModal();
            }
        })();
    });
    root.querySelector('[data-automation-editor-schedule-kind]')?.addEventListener('change', event => {
        const draft = syncAutomationEditorDraftFromDom();
        currentAutomationEditorState = {
            ...currentAutomationEditorState,
            errorMessage: '',
            draft: {
                ...draft,
                schedule_kind: String(event?.target?.value || AUTOMATION_SCHEDULE_KINDS.daily).trim() || AUTOMATION_SCHEDULE_KINDS.daily,
                requires_schedule_reset: false,
            },
        };
        renderAutomationEditorModal();
    });
    root.querySelector('[data-automation-editor-session-mode]')?.addEventListener('change', event => {
        const draft = syncAutomationEditorDraftFromDom();
        const nextSessionMode = String(event?.target?.value || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
        currentAutomationEditorState = {
            ...currentAutomationEditorState,
            errorMessage: '',
            draft: {
                ...draft,
                session_mode: nextSessionMode,
            },
        };
        renderAutomationEditorModal();
    });
    root.querySelector('[data-automation-editor-binding]')?.addEventListener('change', event => {
        const draft = syncAutomationEditorDraftFromDom();
        const previousBindingSelected = String(currentAutomationEditorState?.draft?.delivery_binding_key || '').trim().length > 0;
        const nextBindingKey = String(event?.target?.value || '').trim();
        const bindingSelected = nextBindingKey.length > 0;
        const shouldEnableDefaultDeliveryEvents = bindingSelected && !previousBindingSelected;
        currentAutomationEditorState = {
            ...currentAutomationEditorState,
            errorMessage: '',
            draft: {
                ...draft,
                delivery_binding_key: nextBindingKey,
                delivery_event_started: shouldEnableDefaultDeliveryEvents
                    ? true
                    : (bindingSelected ? draft.delivery_event_started : false),
                delivery_event_completed: shouldEnableDefaultDeliveryEvents
                    ? true
                    : (bindingSelected ? draft.delivery_event_completed : false),
                delivery_event_failed: shouldEnableDefaultDeliveryEvents
                    ? true
                    : (bindingSelected ? draft.delivery_event_failed : false),
            },
        };
        renderAutomationEditorModal();
    });
}

function normalizeFeishuTriggers(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
        .filter(trigger => String(trigger?.source_config?.provider || '').trim().toLowerCase() === FEISHU_PLATFORM)
        .map(trigger => ({
            trigger_id: String(trigger?.trigger_id || '').trim(),
            name: String(trigger?.name || '').trim(),
            display_name: String(trigger?.display_name || trigger?.name || '').trim(),
            status: String(trigger?.status || 'disabled').trim() || 'disabled',
            source_config: trigger?.source_config && typeof trigger.source_config === 'object' ? { ...trigger.source_config } : {},
            target_config: trigger?.target_config && typeof trigger.target_config === 'object' ? { ...trigger.target_config } : {},
            secret_config: trigger?.secret_config && typeof trigger.secret_config === 'object' ? { ...trigger.secret_config } : {},
            secret_status: trigger?.secret_status && typeof trigger.secret_status === 'object' ? { ...trigger.secret_status } : {},
        }))
        .filter(trigger => trigger.trigger_id);
}

function normalizeWeChatAccounts(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
        .map(account => ({
            account_id: String(account?.account_id || '').trim(),
            display_name: String(account?.display_name || account?.account_id || '').trim(),
            base_url: String(account?.base_url || '').trim(),
            cdn_base_url: String(account?.cdn_base_url || '').trim(),
            route_tag: account?.route_tag == null ? '' : String(account.route_tag).trim(),
            status: String(account?.status || 'disabled').trim() || 'disabled',
            workspace_id: String(account?.workspace_id || '').trim(),
            session_mode: String(account?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE,
            normal_root_role_id: String(account?.normal_root_role_id || '').trim(),
            orchestration_preset_id: String(account?.orchestration_preset_id || '').trim(),
            yolo: account?.yolo !== false,
            thinking: account?.thinking && typeof account.thinking === 'object'
                ? { ...account.thinking }
                : { enabled: false, effort: null },
            running: account?.running === true,
            last_error: String(account?.last_error || '').trim(),
        }))
        .filter(account => account.account_id);
}

function normalizeDiscordAccounts(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
        .map(account => ({
            account_id: String(account?.account_id || '').trim(),
            display_name: String(account?.display_name || account?.account_id || '').trim(),
            application_id: String(account?.application_id || '').trim(),
            status: String(account?.status || 'disabled').trim() || 'disabled',
            allowed_channel_ids: Array.isArray(account?.allowed_channel_ids)
                ? account.allowed_channel_ids.map(value => String(value || '').trim()).filter(Boolean)
                : [],
            allow_channel_messages: account?.allow_channel_messages === true,
            workspace_id: String(account?.workspace_id || '').trim(),
            session_mode: String(account?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE,
            normal_root_role_id: String(account?.normal_root_role_id || '').trim(),
            orchestration_preset_id: String(account?.orchestration_preset_id || '').trim(),
            yolo: account?.yolo !== false,
            thinking: account?.thinking && typeof account.thinking === 'object'
                ? { ...account.thinking }
                : { enabled: false, effort: null },
            secret_status: account?.secret_status && typeof account.secret_status === 'object'
                ? { ...account.secret_status }
                : { bot_token_configured: false },
            running: account?.running === true,
            last_error: String(account?.last_error || '').trim(),
        }))
        .filter(account => account.account_id);
}

function normalizeXiaolubanAccounts(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
        .map(account => ({
            account_id: String(account?.account_id || '').trim(),
            display_name: String(account?.display_name || account?.account_id || '').trim(),
            base_url: String(account?.base_url || '').trim(),
            status: String(account?.status || 'disabled').trim() || 'disabled',
            derived_uid: String(account?.derived_uid || '').trim(),
            notification_workspace_ids: Array.isArray(account?.notification_workspace_ids)
                ? account.notification_workspace_ids.map(value => String(value || '').trim()).filter(Boolean)
                : [],
            notification_receivers: normalizeXiaolubanNotificationReceivers(
                Array.isArray(account?.notification_receivers)
                    ? account.notification_receivers
                    : String(account?.notification_receiver || '').trim(),
            ),
            notify_self: true,
            notification_receiver: String(account?.notification_receiver || '').trim(),
            im_config: normalizeXiaolubanImConfig(account?.im_config),
            secret_status: account?.secret_status && typeof account.secret_status === 'object'
                ? { ...account.secret_status }
                : {},
        }))
        .filter(account => account.account_id);
}

function normalizeXiaolubanImConfig(config) {
    return {
        workspace_id: String(config?.workspace_id || '').trim(),
    };
}

function normalizeGatewayWorkspaces(payload) {
    return (Array.isArray(payload) ? payload : [])
        .map(workspace => ({
            workspace_id: String(workspace?.workspace_id || '').trim(),
            root_path: String(workspace?.root_path || '').trim(),
        }))
        .filter(workspace => workspace.workspace_id);
}

function normalizeRoleOptions(payload) {
    return (Array.isArray(payload?.normal_mode_roles) ? payload.normal_mode_roles : [])
        .map(role => ({
            role_id: String(role?.role_id || '').trim(),
            name: String(role?.name || role?.role_id || '').trim(),
        }))
        .filter(role => role.role_id);
}

function normalizeOrchestrationPresets(payload) {
    return (Array.isArray(payload?.presets) ? payload.presets : [])
        .map(preset => ({
            preset_id: String(preset?.preset_id || '').trim(),
            name: String(preset?.name || preset?.preset_id || '').trim(),
        }))
        .filter(preset => preset.preset_id);
}

function resolveGatewayFeatureSummary(featureState) {
    const feishuCount = Array.isArray(featureState?.feishuTriggers) ? featureState.feishuTriggers.length : 0;
    const discordCount = Array.isArray(featureState?.discordAccounts) ? featureState.discordAccounts.length : 0;
    const xiaolubanCount = Array.isArray(featureState?.xiaolubanAccounts) ? featureState.xiaolubanAccounts.length : 0;
    const wechatCount = Array.isArray(featureState?.wechatAccounts) ? featureState.wechatAccounts.length : 0;
    return formatMessage('feature.gateway.summary', {
        feishu: feishuCount,
        discord: discordCount,
        xiaoluban: xiaolubanCount,
        wechat: wechatCount,
    });
}

function resolveSkillsSummary(status = currentSkillsStatus) {
    const skills = Array.isArray(status?.skills?.skills) ? status.skills.skills : null;
    if (!skills) {
        return t('feature.skills.loading');
    }
    return formatMessage('feature.skills.summary', { count: skills.length });
}

function resolveAutomationSummary(projects) {
    return formatMessage('feature.automation.summary', {
        count: Array.isArray(projects) ? projects.length : 0,
    });
}

function resolveSkillScopeLabel(scope) {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    if (normalizedScope === 'builtin') {
        return t('feature.skills.scope_builtin');
    }
    if (
        normalizedScope === 'user_relay_teams'
        || normalizedScope === 'user_agents'
        || normalizedScope === 'user_claude'
        || normalizedScope === 'user_codex'
        || normalizedScope === 'user_opencode'
        || normalizedScope === 'project_relay_teams'
        || normalizedScope === 'project_agents'
        || normalizedScope === 'project_claude'
        || normalizedScope === 'project_codex'
        || normalizedScope === 'project_opencode'
    ) {
        return t('feature.skills.scope_app');
    }
    return t('feature.skills.scope_unknown');
}

function resolveWorkspaceOptionValues(workspaces) {
    return (Array.isArray(workspaces) ? workspaces : []).map(workspace => ({
        value: String(workspace?.workspace_id || '').trim(),
        label: formatWorkspaceOptionLabel(workspace),
        description: formatWorkspaceOptionDescription(workspace),
    })).filter(option => option.value);
}

function resolveXiaolubanNotificationWorkspaceOptions(workspaces) {
    const workspaceOptions = resolveWorkspaceOptionValues(workspaces);
    const baseOptions = [
        {
            value: XIAOLUBAN_NO_WORKSPACES_VALUE,
            label: t('settings.gateway.xiaoluban_notification_workspaces_none'),
            description: '',
        },
    ];
    if (workspaceOptions.length === 0) {
        return baseOptions;
    }
    return [
        ...baseOptions,
        {
            value: XIAOLUBAN_ALL_WORKSPACES_VALUE,
            label: t('settings.gateway.xiaoluban_notification_workspaces_all'),
            description: '',
        },
        ...workspaceOptions,
    ];
}

function normalizeXiaolubanNotificationWorkspaceSelection(values, options) {
    const selected = Array.isArray(values)
        ? values.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const workspaceIds = (Array.isArray(options) ? options : [])
        .map(option => String(option?.value || '').trim())
        .filter(value => (
            value
            && value !== XIAOLUBAN_NO_WORKSPACES_VALUE
            && value !== XIAOLUBAN_ALL_WORKSPACES_VALUE
        ));
    if (selected.includes(XIAOLUBAN_NO_WORKSPACES_VALUE)) {
        return [];
    }
    if (selected.includes(XIAOLUBAN_ALL_WORKSPACES_VALUE)) {
        return workspaceIds;
    }
    const workspaceSet = new Set(workspaceIds);
    return selected.filter(value => workspaceSet.has(value));
}

function normalizeXiaolubanNotificationReceivers(value) {
    const rawItems = Array.isArray(value)
        ? value.flatMap(item => splitXiaolubanReceivers(String(item || '')))
        : splitXiaolubanReceivers(String(value || ''));
    const seen = new Set();
    const receivers = [];
    rawItems.forEach(item => {
        const normalized = String(item || '').trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        receivers.push(normalized);
    });
    return receivers;
}

function splitXiaolubanReceivers(value) {
    return String(value || '')
        .replaceAll('，', ',')
        .replaceAll('；', ';')
        .split(/[\n,;]+/u)
        .map(item => item.trim());
}

function normalizeXiaolubanReceiversForDisplay(account) {
    const receivers = Array.isArray(account?.notification_receivers)
        ? account.notification_receivers
        : normalizeXiaolubanNotificationReceivers(String(account?.notification_receiver || '').trim());
    return normalizeXiaolubanNotificationReceivers(receivers).join('\n');
}

function normalizeXiaolubanTokenFormValue(value) {
    const token = String(value || '').trim();
    return token === '************' ? '' : token;
}

function normalizeDelimitedIdentifierList(value) {
    const rawItems = Array.isArray(value)
        ? value.flatMap(item => splitXiaolubanReceivers(String(item || '')))
        : splitXiaolubanReceivers(String(value || ''));
    const seen = new Set();
    const identifiers = [];
    rawItems.forEach(item => {
        const normalized = String(item || '').trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        identifiers.push(normalized);
    });
    return identifiers;
}

function normalizeDiscordAllowedChannelsForDisplay(account) {
    return normalizeDelimitedIdentifierList(account?.allowed_channel_ids || []).join('\n');
}

function normalizeXiaolubanForwardingCommand(value) {
    const command = String(value || '').trim();
    if (!command) {
        return '';
    }
    const parts = command.split(/\s+/u);
    const url = stripXiaolubanForwardingUrlQuery(parts[0]);
    return [url, ...parts.slice(1)].filter(Boolean).join(' ');
}

function stripXiaolubanForwardingUrlQuery(value) {
    const urlText = String(value || '').trim();
    if (!urlText) {
        return '';
    }
    try {
        const parsed = new URL(urlText);
        parsed.search = '';
        return parsed.toString();
    } catch (_error) {
        return urlText.replace(/\?[^#\s]*/u, '');
    }
}

function resolveXiaolubanImWorkspaceOptions(workspaces) {
    return resolveWorkspaceOptionValues(workspaces);
}

function getXiaolubanImConfig(account) {
    return normalizeXiaolubanImConfig(account?.im_config);
}

function getXiaolubanImStatus(account) {
    const config = getXiaolubanImConfig(account);
    if (!config.workspace_id) {
        return t('settings.gateway.xiaoluban_im_status_workspace_required');
    }
    return t('settings.gateway.xiaoluban_im_status_ready');
}

async function fetchXiaolubanImForwardingCommandText(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return '';
    }
    try {
        const result = await fetchXiaolubanGatewayImForwardingCommand(normalizedAccountId);
        if (!result?.listener_running) {
            return '';
        }
        return normalizeXiaolubanForwardingCommand(result?.forwarding_command);
    } catch (error) {
        logWarn('Failed to fetch Xiaoluban IM forwarding command', error);
        return '';
    }
}

function resolveRoleOptionsForForms(roles) {
    return [
        {
            value: '',
            label: t('composer.no_roles'),
            description: '',
        },
        ...(Array.isArray(roles) ? roles : []).map(role => ({
            value: String(role?.role_id || '').trim(),
            label: String(role?.name || role?.role_id || '').trim(),
            description: String(role?.role_id || '').trim(),
        })).filter(option => option.value),
    ];
}

function resolvePresetOptionsForForms(presets) {
    return [
        {
            value: '',
            label: t('composer.no_presets'),
            description: '',
        },
        ...(Array.isArray(presets) ? presets : []).map(preset => ({
            value: String(preset?.preset_id || '').trim(),
            label: String(preset?.name || preset?.preset_id || '').trim(),
            description: String(preset?.preset_id || '').trim(),
        })).filter(option => option.value),
    ];
}

function resolveAutomationRoleDisplayName(roleId, roles) {
    const normalizedRoleId = String(roleId || '').trim();
    if (!normalizedRoleId) {
        return t('automation.detail.none');
    }
    const role = (Array.isArray(roles) ? roles : []).find(
        item => String(item?.role_id || '').trim() === normalizedRoleId,
    );
    return String(role?.name || normalizedRoleId).trim() || normalizedRoleId;
}

function resolveAutomationPresetDisplayName(presetId, presets) {
    const normalizedPresetId = String(presetId || '').trim();
    if (!normalizedPresetId) {
        return t('automation.detail.none');
    }
    const preset = (Array.isArray(presets) ? presets : []).find(
        item => String(item?.preset_id || '').trim() === normalizedPresetId,
    );
    return String(preset?.name || normalizedPresetId).trim() || normalizedPresetId;
}

function renderFeatureStatusPill(label, tone = 'neutral') {
    return `<span class="feature-status-pill is-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function renderFeatureEmptyState(title, copy, action = '') {
    return `
        <div class="feature-empty-state">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(copy)}</p>
            ${action}
        </div>
    `;
}

function rememberLastKnownWorkspaceId(workspaceId = state.currentWorkspaceId) {
    const safeWorkspaceId = String(workspaceId || '').trim();
    if (!safeWorkspaceId || safeWorkspaceId.startsWith('feature:')) {
        return;
    }
    lastKnownWorkspaceId = safeWorkspaceId;
}

function openFeatureShell(featureId) {
    rememberLastKnownWorkspaceId();
    cacheProjectViewState();
    if (featureId !== FEATURE_VIEW_IDS.skills) {
        cancelSkillsFeatureAsyncWork();
    }
    resetFeatureSurface();
    currentProjectViewMode = 'feature';
    currentFeatureViewId = featureId;
    state.currentFeatureViewId = featureId;
    state.activeSubagentSession = null;
    state.activeView = 'main';
    currentWorkspace = null;
    currentAutomationProject = null;
    currentSnapshot = null;
    currentSnapshotWorkspaceId = null;
    selectedTreePath = null;
    currentDiffState = createInitialDiffState();
    state.currentMainView = 'project';
    state.currentProjectViewWorkspaceId = `feature:${featureId}`;
    state.currentWorkspaceId = null;
    state.currentSessionId = null;
    clearNewSessionDraft();
    clearAllPanels();
    hideRoundNavigator();
    setProjectViewVisible(true);
}

function beginFeatureRequest(featureId) {
    abortCurrentFeatureRequest();
    currentFeatureRequestToken += 1;
    const token = currentFeatureRequestToken;
    const controller = typeof AbortController === 'function'
        ? new AbortController()
        : null;
    currentFeatureRequestController = controller;
    openFeatureShell(featureId);
    return {
        token,
        signal: controller?.signal || null,
        controller,
    };
}

function abortCurrentFeatureRequest() {
    clearFeatureLoadingTimer();
    if (currentFeatureRequestController) {
        currentFeatureRequestController.abort();
        currentFeatureRequestController = null;
    }
}

function isCurrentFeatureRequest(featureId, token) {
    return (
        token === currentFeatureRequestToken
        && currentProjectViewMode === 'feature'
        && currentFeatureViewId === featureId
        && String(state.currentFeatureViewId || '').trim() === featureId
    );
}

function finishFeatureRequest(controller) {
    if (currentFeatureRequestController === controller) {
        clearFeatureLoadingTimer();
        currentFeatureRequestController = null;
    }
}

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function clearFeatureLoadingTimer() {
    if (!currentFeatureLoadingTimer) {
        return;
    }
    globalThis.clearTimeout(currentFeatureLoadingTimer);
    currentFeatureLoadingTimer = null;
}

function renderFeaturePendingState(featureId, title, loadingSummary, request) {
    els.projectViewContent?.classList?.remove('is-boards-feature');
    renderToolbar(null, {
        title,
        mode: 'feature',
        summary: '',
    });
    clearFeatureLoadingTimer();
    currentFeatureLoadingTimer = globalThis.setTimeout(() => {
        currentFeatureLoadingTimer = null;
        if (!isCurrentFeatureRequest(featureId, request.token)) {
            return;
        }
        renderToolbar(null, {
            title,
            mode: 'feature',
            summary: loadingSummary,
        });
        if (els.projectViewContent) {
            els.projectViewContent.innerHTML = renderInlineState(
                loadingSummary,
                'is-feature-loading-state',
            );
        }
    }, FEATURE_LOADING_DELAY_MS);
}

function getFeatureLoadingSummary(featureId) {
    if (featureId === FEATURE_VIEW_IDS.skills) {
        return t('feature.skills.loading');
    }
    if (featureId === FEATURE_VIEW_IDS.automation) {
        return t('feature.automation.loading');
    }
    if (featureId === FEATURE_VIEW_IDS.gateway) {
        return t('feature.gateway.loading');
    }
    if (featureId === FEATURE_VIEW_IDS.boards) {
        return t('feature.boards.loading');
    }
    return t('feature.loading');
}

async function loadAutomationHomeDetail(projectId, options = {}) {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
        currentAutomationHomeDetail = createInitialAutomationHomeDetail();
        currentAutomationProject = null;
        return;
    }
    const [project, sessions, workspaces, deliveryBindings, sessionConfigDependencies] = await Promise.all([
        fetchAutomationProject(normalizedProjectId, { signal: options.signal }),
        fetchAutomationProjectSessions(normalizedProjectId, { signal: options.signal }),
        fetchWorkspaces({ signal: options.signal }),
        fetchAutomationFeishuBindings({ signal: options.signal }),
        fetchAutomationSessionConfigDependencies('detail', { signal: options.signal }),
    ]);
    currentAutomationHomeDetail = {
        project,
        sessions: Array.isArray(sessions) ? sessions : [],
        workspace: findWorkspaceById(workspaces, project?.workspace_id),
        deliveryBindings: Array.isArray(deliveryBindings) ? deliveryBindings : [],
        normalRoles: Array.isArray(sessionConfigDependencies?.normalRoles)
            ? sessionConfigDependencies.normalRoles
            : [],
        orchestrationPresets: Array.isArray(sessionConfigDependencies?.orchestrationPresets)
            ? sessionConfigDependencies.orchestrationPresets
            : [],
    };
    currentAutomationProject = project;
}

async function loadGitHubFeatureState(options = {}) {
    const [accounts, repos, rules, workspaces] = await Promise.all([
        fetchGitHubTriggerAccounts({ signal: options.signal }),
        fetchGitHubRepoSubscriptions({ signal: options.signal }),
        fetchGitHubTriggerRules({ signal: options.signal }),
        fetchWorkspaces({ signal: options.signal }),
    ]);
    currentGitHubFeatureState = {
        accounts: Array.isArray(accounts) ? accounts : [],
        repos: Array.isArray(repos) ? repos : [],
        rules: Array.isArray(rules) ? rules : [],
        workspaces: Array.isArray(workspaces) ? workspaces : [],
    };
    currentGitHubFeatureNodeKey = resolveGitHubFeatureNodeKey(
        currentGitHubFeatureNodeKey,
    );
}

function parseGitHubFeatureNodeKey(nodeKey) {
    const normalizedNodeKey = String(nodeKey || '').trim();
    if (!normalizedNodeKey || normalizedNodeKey === 'access') {
        return { kind: 'access', id: '' };
    }
    const [kind, id] = normalizedNodeKey.split(':', 2);
    if ((kind === 'account' || kind === 'repo') && id) {
        return { kind, id };
    }
    return { kind: 'access', id: '' };
}

function resolveGitHubFeatureNodeKey(nodeKey) {
    const parsed = parseGitHubFeatureNodeKey(nodeKey);
    if (parsed.kind === 'account' && findGitHubAccountById(parsed.id)) {
        return `account:${parsed.id}`;
    }
    if (parsed.kind === 'repo' && findGitHubRepoById(parsed.id)) {
        return `repo:${parsed.id}`;
    }
    return 'access';
}

function findGitHubAccountById(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    return currentGitHubFeatureState.accounts.find(
        account => String(account?.account_id || '').trim() === normalizedAccountId,
    ) || null;
}

function findGitHubRepoById(repoSubscriptionId) {
    const normalizedRepoId = String(repoSubscriptionId || '').trim();
    return currentGitHubFeatureState.repos.find(
        repo => String(repo?.repo_subscription_id || '').trim() === normalizedRepoId,
    ) || null;
}

function getGitHubReposForAccount(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    return currentGitHubFeatureState.repos.filter(
        repo => String(repo?.account_id || '').trim() === normalizedAccountId,
    );
}

function getGitHubRulesForRepo(repoSubscriptionId) {
    const normalizedRepoId = String(repoSubscriptionId || '').trim();
    return currentGitHubFeatureState.rules.filter(
        rule => String(rule?.repo_subscription_id || '').trim() === normalizedRepoId,
    );
}

function findGitHubRuleById(triggerRuleId) {
    const normalizedRuleId = String(triggerRuleId || '').trim();
    return currentGitHubFeatureState.rules.find(
        rule => String(rule?.trigger_rule_id || '').trim() === normalizedRuleId,
    ) || null;
}

function upsertGitHubRuleInState(rule) {
    const normalizedRuleId = String(rule?.trigger_rule_id || '').trim();
    if (!normalizedRuleId) {
        return;
    }
    const nextRules = currentGitHubFeatureState.rules.filter(
        item => String(item?.trigger_rule_id || '').trim() !== normalizedRuleId,
    );
    nextRules.push(rule);
    currentGitHubFeatureState = {
        ...currentGitHubFeatureState,
        rules: nextRules,
    };
}

function removeGitHubRuleFromState(triggerRuleId) {
    const normalizedRuleId = String(triggerRuleId || '').trim();
    currentGitHubFeatureState = {
        ...currentGitHubFeatureState,
        rules: currentGitHubFeatureState.rules.filter(
            item => String(item?.trigger_rule_id || '').trim() !== normalizedRuleId,
        ),
    };
}

function resolveGitHubAccountLabel(account) {
    return String(account?.display_name || account?.name || account?.account_id || '').trim();
}

function normalizeGitHubRepositoryChoice(choice) {
    const owner = String(choice?.owner || '').trim();
    const repoName = String(choice?.repo_name || '').trim();
    const fullName = String(choice?.full_name || '').trim();
    if (!owner || !repoName || !fullName) {
        return null;
    }
    return {
        owner,
        repo_name: repoName,
        full_name: fullName,
        default_branch: String(choice?.default_branch || '').trim(),
        private: choice?.private === true,
    };
}

function buildGitHubRepositoryChoices(choices, repo = null) {
    const normalizedChoices = Array.isArray(choices)
        ? choices
            .map(choice => normalizeGitHubRepositoryChoice(choice))
            .filter(choice => choice)
        : [];
    const seenFullNames = new Set(normalizedChoices.map(choice => choice.full_name));
    const currentFullName = String(repo?.full_name || '').trim();
    if (currentFullName && !seenFullNames.has(currentFullName)) {
        const owner = String(repo?.owner || '').trim();
        const repoName = String(repo?.repo_name || '').trim();
        if (owner && repoName) {
            normalizedChoices.unshift({
                owner,
                repo_name: repoName,
                full_name: currentFullName,
                default_branch: String(repo?.default_branch || '').trim(),
                private: false,
            });
        }
    }
    return normalizedChoices;
}

function formatGitHubRepoEvents(repo) {
    return Array.isArray(repo?.subscribed_events) && repo.subscribed_events.length > 0
        ? repo.subscribed_events.join(', ')
        : t('automation.detail.none');
}

function formatGitHubRepoSubtitle(repo, { includeAccount = false } = {}) {
    const parts = [];
    if (includeAccount) {
        const accountLabel = resolveGitHubAccountLabel(findGitHubAccountById(repo?.account_id));
        if (accountLabel) {
            parts.push(accountLabel);
        }
    }
    parts.push(`${t('feature.automation.github_events')}: ${formatGitHubRepoEvents(repo)}`);
    parts.push(`${t('feature.automation.github_webhook_status')}: ${formatGitHubWebhookStatusLabel(String(repo?.webhook_status || 'unregistered'))}`);
    return parts.join(' · ');
}

function renderGitHubRepoListButton(
    repo,
    { child = false, includeAccount = false } = {},
) {
    const repoId = String(repo?.repo_subscription_id || '').trim();
    const statusTone = repo?.enabled === false ? 'disabled' : 'enabled';
    const nodeKey = `repo:${repoId}`;
    return `
        <button class="automation-record${child ? ' github-automation-record-child' : ''}${currentGitHubFeatureNodeKey === nodeKey ? ' is-active' : ''}" type="button" data-github-node-key="${escapeHtml(nodeKey)}">
            <div class="automation-record-copy">
                <strong>${escapeHtml(String(repo?.full_name || ''))}</strong>
                <span>${escapeHtml(formatGitHubRepoSubtitle(repo, { includeAccount }))}</span>
            </div>
            ${renderFeatureStatusPill(statusTone === 'disabled' ? t('automation.status.disabled') : t('automation.status.enabled'), statusTone)}
        </button>
    `;
}

function normalizeCommaSeparatedValues(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    return String(value || '')
        .split(',')
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function buildGitHubAccountPayloadFromDialogValues(account, values) {
    const name = String(values?.name || '').trim();
    if (!name) {
        throw new Error(t('feature.automation.github_account_required'));
    }
    const payload = {
        name,
        display_name: String(values?.display_name || '').trim() || null,
        enabled: values?.enabled === true,
    };
    const token = String(values?.token || '').trim();
    const webhookSecret = String(values?.webhook_secret || '').trim();
    if (account) {
        if (values?.clear_token === true) {
            payload.clear_token = true;
        } else if (token) {
            payload.token = token;
        }
        if (values?.clear_webhook_secret === true) {
            payload.clear_webhook_secret = true;
        } else if (webhookSecret) {
            payload.webhook_secret = webhookSecret;
        }
    } else {
        if (token) {
            payload.token = token;
        }
        if (webhookSecret) {
            payload.webhook_secret = webhookSecret;
        }
    }
    return payload;
}

async function requestGitHubAccountInput(account = null, submitHandler = null) {
    const values = await showFormDialog({
        title: account ? t('settings.roles.edit') : t('feature.automation.github_new_account'),
        message: t('feature.automation.github_account_copy'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'name',
                label: t('feature.automation.github_account_name'),
                value: String(account?.name || '').trim(),
                placeholder: 'github-main',
            },
            {
                id: 'display_name',
                label: t('settings.triggers.display_name'),
                value: String(account?.display_name || '').trim(),
                placeholder: 'GitHub Main',
            },
            {
                id: 'token',
                label: t('settings.github.token'),
                type: 'password',
                allowEmptyReveal: true,
                value: '',
                placeholder: account
                    ? t('feature.automation.github_secret_keep')
                    : 'ghp_...',
                showLabel: t('settings.github.show_token'),
                hideLabel: t('settings.github.hide_token'),
                description: account
                    ? t('feature.automation.github_token_override_copy')
                    : t('feature.automation.github_token_copy'),
            },
            {
                id: 'clear_token',
                label: t('feature.automation.github_clear_token'),
                type: 'checkbox',
                value: false,
                description: t('feature.automation.github_clear_token_copy'),
            },
            {
                id: 'webhook_secret',
                label: t('feature.automation.github_webhook_secret'),
                type: 'password',
                allowEmptyReveal: true,
                value: '',
                placeholder: account
                    ? t('feature.automation.github_secret_keep')
                    : 'whsec_...',
                showLabel: t('feature.automation.github_show_webhook_secret'),
                hideLabel: t('feature.automation.github_hide_webhook_secret'),
                description: t('feature.automation.github_webhook_secret_copy'),
            },
            {
                id: 'clear_webhook_secret',
                label: t('feature.automation.github_clear_webhook_secret'),
                type: 'checkbox',
                value: false,
                description: t('feature.automation.github_clear_webhook_secret_copy'),
            },
            {
                id: 'enabled',
                label: t('automation.field.enabled'),
                type: 'checkbox',
                value: account ? String(account?.status || '').trim() !== 'disabled' : true,
                description: t('feature.automation.github_enabled_copy'),
            },
        ],
        submitHandler: typeof submitHandler === 'function'
            ? async formValues => await submitHandler(
                buildGitHubAccountPayloadFromDialogValues(account, formValues),
            )
            : null,
    });
    if (!values) {
        return null;
    }
    if (typeof submitHandler === 'function') {
        return values;
    }
    return buildGitHubAccountPayloadFromDialogValues(account, values);
}

async function requestGitHubRepoInput(account, repo = null) {
    const accountId = String(account?.account_id || '').trim();
    if (!accountId) {
        throw new Error(t('feature.automation.github_account_required'));
    }
    const repositoryChoices = buildGitHubRepositoryChoices(
        await fetchGitHubAccountRepositories(accountId),
        repo,
    );
    if (repositoryChoices.length === 0) {
        throw new Error(t('feature.automation.github_repo_options_empty'));
    }
    const selectedFullName = String(repo?.full_name || '').trim();
    const values = await showFormDialog({
        title: repo ? t('settings.roles.edit') : t('feature.automation.github_new_repo'),
        message: t('feature.automation.github_repo_copy'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'full_name',
                type: 'select',
                label: t('feature.automation.github_repo_name'),
                value: selectedFullName,
                description: t('feature.automation.github_repo_select_copy'),
                options: [
                    {
                        value: '',
                        label: t('feature.automation.github_repo_select_placeholder'),
                    },
                    ...repositoryChoices.map(choice => ({
                        value: choice.full_name,
                        label: choice.full_name,
                    })),
                ],
            },
            {
                id: 'enabled',
                label: t('automation.field.enabled'),
                type: 'checkbox',
                value: repo ? repo.enabled !== false : true,
                description: t('feature.automation.github_repo_enabled_copy'),
            },
        ],
    });
    if (!values) {
        return null;
    }
    const fullName = String(values.full_name || '').trim();
    const selectedRepository = repositoryChoices.find(
        choice => choice.full_name === fullName,
    );
    if (!selectedRepository) {
        throw new Error(t('feature.automation.github_repo_required'));
    }
    const payload = {
        owner: selectedRepository.owner,
        repo_name: selectedRepository.repo_name,
        enabled: values.enabled === true,
    };
    if (!repo) {
        payload.account_id = accountId;
    }
    return payload;
}

function buildGitHubRulePayloadFromDialogValues(
    repo,
    rule,
    dispatchConfig,
    existingRunTemplate,
    values,
) {
    const name = String(values.name || '').trim();
    const promptTemplate = String(values.prompt_template || '').trim();
    if (!name) {
        throw new Error(t('feature.automation.github_rule_required'));
    }
    if (!promptTemplate) {
        throw new Error(t('automation.schedule.validation.prompt'));
    }
    const workspaceId = String(values.workspace_id || '').trim();
    if (!workspaceId) {
        throw new Error(t('automation.schedule.validation.workspace'));
    }
    const resolvedEventName = String(values.event_name || 'pull_request').trim() || 'pull_request';
    const selectedActions = normalizeCommaSeparatedValues(values.actions);
    const runTemplate = existingRunTemplate
        ? {
            ...existingRunTemplate,
            workspace_id: workspaceId,
            prompt_template: promptTemplate,
        }
        : {
            workspace_id: workspaceId,
            prompt_template: promptTemplate,
            session_mode: DEFAULT_SESSION_MODE,
            execution_mode: 'ai',
            yolo: true,
            thinking: {
                enabled: false,
                effort: DEFAULT_THINKING_EFFORT,
            },
        };
    const actionHooks = Array.isArray(dispatchConfig?.action_hooks)
        ? dispatchConfig.action_hooks.filter(action => !(
            String(action?.action_type || '').trim() === 'comment'
            && String(action?.phase || '').trim() === 'on_run_completed'
        ))
        : [];
    const payload = {
        name,
        match_config: {
            event_name: resolvedEventName,
            actions: selectedActions,
            base_branches: normalizeCommaSeparatedValues(values.base_branches),
            draft_pr: normalizeGitHubDraftPrValue(values.draft_pr),
        },
        dispatch_config: {
            target_type: 'run_template',
            run_template: runTemplate,
            action_hooks: actionHooks,
        },
        enabled: values.enabled === true,
    };
    if (!rule) {
        payload.provider = 'github';
        payload.account_id = String(repo?.account_id || '').trim();
        payload.repo_subscription_id = String(repo?.repo_subscription_id || '').trim();
    }
    return payload;
}

async function requestGitHubRuleInput(repo, rule = null, submitHandler = null) {
    const workspaces = currentGitHubFeatureState.workspaces.length > 0
        ? currentGitHubFeatureState.workspaces
        : await fetchWorkspaces();
    const workspaceOptions = resolveWorkspaceOptionValues(workspaces);
    if (workspaceOptions.length === 0) {
        throw new Error(t('settings.triggers.no_workspaces'));
    }
    const dispatchConfig = rule?.dispatch_config && typeof rule.dispatch_config === 'object'
        ? rule.dispatch_config
        : {};
    const existingRunTemplate = dispatchConfig?.run_template && typeof dispatchConfig.run_template === 'object'
        ? dispatchConfig.run_template
        : null;
    if (rule && String(dispatchConfig?.target_type || '').trim() && String(dispatchConfig?.target_type || '').trim() !== 'run_template') {
        throw new Error(t('feature.automation.github_rule_target_unsupported'));
    }
    const matchConfig = rule?.match_config && typeof rule.match_config === 'object'
        ? rule.match_config
        : {};
    const eventName = String(matchConfig?.event_name || 'pull_request').trim() || 'pull_request';
    const actionValues = Array.isArray(matchConfig?.actions) ? matchConfig.actions : [];
    const values = await showFormDialog({
        title: rule ? t('settings.roles.edit') : t('feature.automation.github_new_rule'),
        message: t('feature.automation.github_rule_copy'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'name',
                label: t('feature.automation.github_rule_name'),
                value: String(rule?.name || '').trim(),
                placeholder: 'pr-opened',
            },
            {
                id: 'workspace_id',
                label: t('settings.triggers.workspace'),
                type: 'select',
                value: String(existingRunTemplate?.workspace_id || workspaceOptions[0]?.value || '').trim(),
                options: workspaceOptions,
                description: t('feature.automation.github_rule_workspace_copy'),
            },
            {
                id: 'event_name',
                label: t('feature.automation.github_event_subscription'),
                type: 'select',
                value: eventName,
                options: getGitHubRuleEventOptions(),
                description: t('feature.automation.github_event_copy'),
            },
            {
                id: 'actions',
                label: t('feature.automation.github_actions'),
                type: 'multiselect',
                value: actionValues,
                options: getGitHubRuleActionOptions(),
                placeholder: t('feature.automation.github_actions_placeholder'),
                description: t('feature.automation.github_actions_copy'),
            },
            {
                id: 'draft_pr',
                label: t('feature.automation.github_draft_pr'),
                type: 'select',
                value: resolveGitHubDraftPrFieldValue(matchConfig?.draft_pr),
                options: getGitHubDraftPrOptions(),
                description: t('feature.automation.github_draft_pr_copy'),
            },
            {
                id: 'base_branches',
                label: t('feature.automation.github_base_branches'),
                value: Array.isArray(matchConfig?.base_branches) ? matchConfig.base_branches.join(', ') : '',
                placeholder: 'main, release/*',
            },
            {
                id: 'prompt_template',
                label: t('automation.detail.prompt'),
                multiline: true,
                value: String(existingRunTemplate?.prompt_template || '').trim(),
                placeholder: 'Review the incoming GitHub event and summarize the next steps.',
            },
            {
                id: 'enabled',
                label: t('automation.field.enabled'),
                type: 'checkbox',
                value: rule ? rule.enabled !== false : true,
                description: t('feature.automation.github_rule_enabled_copy'),
            },
        ],
        submitHandler: typeof submitHandler === 'function'
            ? async formValues => await submitHandler(
                buildGitHubRulePayloadFromDialogValues(
                    repo,
                    rule,
                    dispatchConfig,
                    existingRunTemplate,
                    formValues,
                ),
            )
            : null,
    });
    if (!values) {
        return null;
    }
    if (typeof submitHandler === 'function') {
        return values;
    }
    return buildGitHubRulePayloadFromDialogValues(
        repo,
        rule,
        dispatchConfig,
        existingRunTemplate,
        values,
    );
}

async function requestFeishuTriggerInput(trigger = null) {
    const [workspaces, roleOptions, orchestrationConfig] = await Promise.all([
        fetchWorkspaces(),
        fetchRoleConfigOptions(),
        fetchOrchestrationConfig(),
    ]);
    const workspaceOptions = resolveWorkspaceOptionValues(workspaces);
    if (workspaceOptions.length === 0) {
        throw new Error(t('settings.triggers.no_workspaces'));
    }
    const roles = resolveRoleOptionsForForms(normalizeRoleOptions(roleOptions));
    const presets = resolvePresetOptionsForForms(normalizeOrchestrationPresets(orchestrationConfig));
    const sourceConfig = trigger?.source_config && typeof trigger.source_config === 'object' ? trigger.source_config : {};
    const targetConfig = trigger?.target_config && typeof trigger.target_config === 'object' ? trigger.target_config : {};
    const sessionMode = String(targetConfig?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const thinkingEnabled = targetConfig?.thinking?.enabled === true;
    const values = await showFormDialog({
        title: trigger ? t('settings.roles.edit') : t('feature.gateway.add_feishu'),
        message: t('settings.triggers.feishu_detail_copy'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'name',
                label: t('settings.triggers.trigger_name'),
                value: String(trigger?.name || '').trim(),
                placeholder: 'feishu-main',
            },
            {
                id: 'display_name',
                label: t('settings.triggers.display_name'),
                value: String(trigger?.display_name || '').trim(),
                placeholder: 'Feishu Main',
            },
            {
                id: 'workspace_id',
                label: t('settings.triggers.workspace'),
                type: 'select',
                value: String(targetConfig?.workspace_id || workspaceOptions[0]?.value || '').trim(),
                options: workspaceOptions,
            },
            {
                id: 'trigger_rule',
                label: t('settings.triggers.rule'),
                type: 'select',
                value: String(sourceConfig?.trigger_rule || DEFAULT_TRIGGER_RULE).trim() || DEFAULT_TRIGGER_RULE,
                options: [
                    { value: 'mention_only', label: 'mention_only', description: '' },
                    { value: 'all_messages', label: 'all_messages', description: '' },
                ],
            },
            {
                id: 'session_mode',
                label: t('settings.triggers.mode'),
                type: 'select',
                value: sessionMode,
                options: [
                    { value: 'normal', label: t('composer.mode_normal'), description: '' },
                    { value: 'orchestration', label: t('composer.mode_orchestration'), description: '' },
                ],
            },
            {
                id: 'normal_root_role_id',
                label: t('settings.triggers.normal_root_role_id'),
                type: 'select',
                value: String(targetConfig?.normal_root_role_id || '').trim(),
                options: roles,
            },
            {
                id: 'orchestration_preset_id',
                label: t('settings.triggers.orchestration_preset_id'),
                type: 'select',
                value: String(targetConfig?.orchestration_preset_id || '').trim(),
                options: presets,
            },
            {
                id: 'app_name',
                label: t('settings.triggers.feishu_app_name'),
                value: String(sourceConfig?.app_name || '').trim(),
                placeholder: t('settings.triggers.feishu_app_name_placeholder'),
            },
            {
                id: 'app_id',
                label: t('settings.triggers.feishu_app_id'),
                value: String(sourceConfig?.app_id || '').trim(),
                placeholder: t('settings.triggers.feishu_app_id_placeholder'),
            },
            {
                id: 'app_secret',
                label: t('settings.triggers.feishu_app_secret'),
                value: '',
                placeholder: t('settings.triggers.secret_keep_placeholder'),
            },
            {
                id: 'enabled',
                label: t('settings.field.enabled'),
                type: 'checkbox',
                value: String(trigger?.status || 'enabled').trim().toLowerCase() === 'enabled',
                description: '',
            },
            {
                id: 'yolo',
                label: t('settings.triggers.yolo'),
                type: 'checkbox',
                value: targetConfig?.yolo !== false,
                description: '',
            },
            {
                id: 'shell_safety_policy_enabled',
                label: t('settings.triggers.shell_safety_policy_enabled'),
                type: 'checkbox',
                value: targetConfig?.shell_safety_policy_enabled !== false,
                description: '',
            },
            {
                id: 'thinking_enabled',
                label: t('settings.triggers.thinking_enabled'),
                type: 'checkbox',
                value: thinkingEnabled,
                description: '',
            },
            {
                id: 'thinking_effort',
                label: t('settings.triggers.thinking_effort'),
                type: 'select',
                value: String(targetConfig?.thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT,
                options: THINKING_EFFORT_OPTIONS.map(option => ({ value: option, label: option, description: '' })),
            },
        ],
    });
    if (!values || typeof values !== 'object') {
        return null;
    }
    const name = String(values.name || '').trim();
    const workspaceId = String(values.workspace_id || '').trim();
    const appId = String(values.app_id || '').trim();
    const appName = String(values.app_name || '').trim();
    const appSecret = String(values.app_secret || '').trim();
    const nextSessionMode = String(values.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const orchestrationPresetId = String(values.orchestration_preset_id || '').trim();
    if (!name) {
        throw new Error(t('settings.triggers.missing_name'));
    }
    if (!workspaceId) {
        throw new Error(t('settings.triggers.missing_workspace'));
    }
    if (!appId) {
        throw new Error(t('settings.triggers.missing_app_id'));
    }
    if (!appName) {
        throw new Error(t('settings.triggers.missing_app_name'));
    }
    if (!trigger && !appSecret) {
        throw new Error(t('settings.triggers.missing_app_secret'));
    }
    if (nextSessionMode === 'orchestration' && !orchestrationPresetId) {
        throw new Error(t('settings.triggers.missing_orchestration_preset_id'));
    }
    const payload = {
        name,
        display_name: String(values.display_name || '').trim() || null,
        source_config: {
            provider: FEISHU_PLATFORM,
            trigger_rule: String(values.trigger_rule || DEFAULT_TRIGGER_RULE).trim() || DEFAULT_TRIGGER_RULE,
            app_id: appId,
            app_name: appName,
        },
        target_config: {
            workspace_id: workspaceId,
            session_mode: nextSessionMode,
            yolo: values.yolo !== false,
            shell_safety_policy_enabled: values.shell_safety_policy_enabled !== false,
            thinking: {
                enabled: values.thinking_enabled === true,
                effort: values.thinking_enabled === true
                    ? (String(values.thinking_effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT)
                    : null,
            },
        },
        enabled: values.enabled !== false,
    };
    const normalRootRoleId = String(values.normal_root_role_id || '').trim();
    if (nextSessionMode === 'normal' && normalRootRoleId) {
        payload.target_config.normal_root_role_id = normalRootRoleId;
    }
    if (nextSessionMode === 'orchestration' && orchestrationPresetId) {
        payload.target_config.orchestration_preset_id = orchestrationPresetId;
    }
    if (appSecret) {
        payload.secret_config = { app_secret: appSecret };
    }
    return payload;
}

async function requestWeChatAccountInput(account) {
    const workspaces = resolveWorkspaceOptionValues(currentGatewayFeatureState.workspaces);
    if (workspaces.length === 0) {
        throw new Error(t('settings.gateway.missing_workspace'));
    }
    const roles = resolveRoleOptionsForForms(currentGatewayFeatureState.normalRoles);
    const presets = resolvePresetOptionsForForms(currentGatewayFeatureState.orchestrationPresets);
    const sessionMode = String(account?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const thinkingEnabled = account?.thinking?.enabled === true;
    const values = await showFormDialog({
        title: t('settings.gateway.account_editor'),
        message: String(account?.account_id || '').trim(),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'display_name',
                label: t('settings.gateway.display_name'),
                value: String(account?.display_name || '').trim(),
            },
            {
                id: 'workspace_id',
                label: t('settings.triggers.workspace'),
                type: 'select',
                value: String(account?.workspace_id || workspaces[0]?.value || '').trim(),
                options: workspaces,
            },
            {
                id: 'session_mode',
                label: t('settings.triggers.mode'),
                type: 'select',
                value: sessionMode,
                options: [
                    { value: 'normal', label: t('composer.mode_normal'), description: '' },
                    { value: 'orchestration', label: t('composer.mode_orchestration'), description: '' },
                ],
            },
            {
                id: 'normal_root_role_id',
                label: t('settings.triggers.normal_root_role_id'),
                type: 'select',
                value: String(account?.normal_root_role_id || '').trim(),
                options: roles,
            },
            {
                id: 'orchestration_preset_id',
                label: t('settings.triggers.orchestration_preset_id'),
                type: 'select',
                value: String(account?.orchestration_preset_id || '').trim(),
                options: presets,
            },
            {
                id: 'base_url',
                label: t('settings.gateway.base_url'),
                value: String(account?.base_url || '').trim(),
            },
            {
                id: 'cdn_base_url',
                label: t('settings.gateway.cdn_base_url'),
                value: String(account?.cdn_base_url || '').trim(),
            },
            {
                id: 'route_tag',
                label: t('settings.gateway.route_tag'),
                value: String(account?.route_tag || '').trim(),
            },
            {
                id: 'yolo',
                label: t('settings.triggers.yolo'),
                type: 'checkbox',
                value: account?.yolo !== false,
                description: '',
            },
            {
                id: 'thinking_enabled',
                label: t('settings.triggers.thinking_enabled'),
                type: 'checkbox',
                value: thinkingEnabled,
                description: '',
            },
            {
                id: 'thinking_effort',
                label: t('settings.triggers.thinking_effort'),
                type: 'select',
                value: String(account?.thinking?.effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT,
                options: THINKING_EFFORT_OPTIONS.map(option => ({ value: option, label: option, description: '' })),
            },
        ],
    });
    if (!values || typeof values !== 'object') {
        return null;
    }
    const displayName = String(values.display_name || '').trim();
    const workspaceId = String(values.workspace_id || '').trim();
    const nextSessionMode = String(values.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const orchestrationPresetId = String(values.orchestration_preset_id || '').trim();
    if (!displayName) {
        throw new Error(t('settings.gateway.missing_display_name'));
    }
    if (!workspaceId) {
        throw new Error(t('settings.gateway.missing_workspace'));
    }
    if (nextSessionMode === 'orchestration' && !orchestrationPresetId) {
        throw new Error(t('settings.gateway.missing_orchestration_preset_id'));
    }
    return {
        display_name: displayName,
        workspace_id: workspaceId,
        session_mode: nextSessionMode,
        base_url: String(values.base_url || '').trim(),
        cdn_base_url: String(values.cdn_base_url || '').trim(),
        route_tag: String(values.route_tag || '').trim(),
        yolo: values.yolo !== false,
        thinking: {
            enabled: values.thinking_enabled === true,
            effort: values.thinking_enabled === true
                ? (String(values.thinking_effort || DEFAULT_THINKING_EFFORT).trim() || DEFAULT_THINKING_EFFORT)
                : null,
        },
        normal_root_role_id: nextSessionMode === 'normal'
            ? (String(values.normal_root_role_id || '').trim() || null)
            : null,
        orchestration_preset_id: nextSessionMode === 'orchestration' ? orchestrationPresetId : null,
    };
}

async function requestDiscordAccountInput(account) {
    if (currentGatewayFeatureState.workspaces.length === 0) {
        throw new Error(t('settings.gateway.missing_workspace'));
    }
    if (typeof currentGatewayFeatureState.discordDialogResolve === 'function') {
        currentGatewayFeatureState.discordDialogResolve(null);
    }
    return await new Promise(resolve => {
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            discordEditingAccountId: String(account?.account_id || '').trim(),
            discordDraft: createDiscordAccountDraft(account),
            discordDialogResolve: resolve,
        };
        renderGatewayFeatureModal();
    });
}

async function requestXiaolubanAccountInput(account, submitHandler = null) {
    const isEditing = String(account?.account_id || '').trim().length > 0;
    const xiaolubanExtraApi = await loadXiaolubanExtraGatewayApi();
    let preparedAccount = null;
    if (!isEditing) {
        try {
            preparedAccount = await xiaolubanExtraApi.prepareXiaolubanGatewayAccount();
        } catch (error) {
            logWarn('Failed to prepare Xiaoluban account', error);
        }
    }
    const accountId = String(account?.account_id || preparedAccount?.account_id || '').trim();
    const tokenConfigured = account?.secret_status?.token_configured === true;
    const fallbackDisplayName = String(
        account?.display_name || t('settings.gateway.xiaoluban_title'),
    ).trim();
    const workspaceOptions = resolveXiaolubanNotificationWorkspaceOptions(
        currentGatewayFeatureState.workspaces,
    );
    const imWorkspaceOptions = resolveXiaolubanImWorkspaceOptions(
        currentGatewayFeatureState.workspaces,
    );
    const imConfig = getXiaolubanImConfig(account);
    const imWorkspaceId = imConfig.workspace_id || imWorkspaceOptions[0]?.value || '';
    const imForwardingCommand = accountId
        ? (isEditing
            ? await fetchXiaolubanImForwardingCommandText(accountId)
            : (preparedAccount?.listener_running === true
                ? normalizeXiaolubanForwardingCommand(preparedAccount?.forwarding_command)
                : ''))
        : '';
    const imWorkspaceDescription = t('settings.gateway.xiaoluban_im_workspace_copy');
    const imForwardingDescription = imForwardingCommand
        ? t('settings.gateway.xiaoluban_im_forwarding_copy')
        : t('settings.gateway.xiaoluban_im_forwarding_after_save_copy');
    const selectedWorkspaceIds = Array.isArray(account?.notification_workspace_ids)
        ? account.notification_workspace_ids.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const selectedWorkspaceValues = selectedWorkspaceIds.length > 0
        ? selectedWorkspaceIds
        : [XIAOLUBAN_NO_WORKSPACES_VALUE];
    const values = await showFormDialog({
        title: isEditing
            ? t('settings.gateway.xiaoluban_account_editor')
            : t('feature.gateway.add_xiaoluban'),
        message: [
            accountId
                ? formatMessage('settings.gateway.xiaoluban_internal_id_copy', {
                    account_id: accountId,
                })
                : '',
        ].filter(Boolean).join('\n'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: [
            {
                id: 'display_name',
                label: t('settings.gateway.display_name'),
                value: fallbackDisplayName,
            },
            {
                id: 'token',
                label: t('settings.gateway.xiaoluban_token'),
                type: 'password',
                value: isEditing && tokenConfigured ? '************' : '',
                maskedValue: isEditing && tokenConfigured ? '************' : '',
                placeholder: isEditing && tokenConfigured
                    ? t('settings.gateway.xiaoluban_token_edit_placeholder')
                    : 'uid_xxx...',
                description: isEditing && tokenConfigured
                    ? t('settings.gateway.xiaoluban_token_edit_copy')
                    : t('settings.gateway.xiaoluban_token_copy'),
                allowEmptyReveal: isEditing && tokenConfigured,
                showLabel: t('feedback.show_sensitive'),
                hideLabel: t('feedback.hide_sensitive'),
                revealHandler: isEditing && tokenConfigured
                    ? async () => {
                        const revealed = await xiaolubanExtraApi.revealXiaolubanGatewayAccountToken(accountId);
                        return String(revealed?.token || '');
                    }
                    : null,
            },
            {
                id: 'notification_workspace_ids',
                label: t('settings.gateway.xiaoluban_notification_workspaces'),
                type: 'multiselect',
                value: selectedWorkspaceValues,
                options: workspaceOptions,
                placeholder: t('settings.gateway.xiaoluban_notification_workspaces_placeholder'),
                description: t('settings.gateway.xiaoluban_notification_workspaces_copy'),
                summaryMode: 'count',
                summaryKey: 'settings.gateway.xiaoluban_notification_workspace_count',
                summaryAllValue: XIAOLUBAN_ALL_WORKSPACES_VALUE,
                summaryNoneValue: XIAOLUBAN_NO_WORKSPACES_VALUE,
            },
            {
                id: 'notification_receivers',
                label: t('settings.gateway.xiaoluban_notification_receivers'),
                type: 'textarea',
                value: normalizeXiaolubanReceiversForDisplay(account),
                placeholder: t('settings.gateway.xiaoluban_notification_receivers_placeholder'),
                description: t('settings.gateway.xiaoluban_notification_receivers_copy'),
                rows: 2,
                compact: true,
            },
            {
                id: 'xiaoluban_im_workspace_id',
                label: t('settings.gateway.xiaoluban_im_workspace'),
                type: 'select',
                value: imWorkspaceId,
                options: imWorkspaceOptions,
                description: imWorkspaceDescription,
            },
            ...(imForwardingCommand
                ? [
                    {
                        id: 'forwarding_command',
                        label: t('settings.gateway.xiaoluban_im_forwarding_command'),
                        type: 'copyable',
                        value: imForwardingCommand,
                        copyLabel: t('feedback.copy'),
                        description: imForwardingDescription,
                    },
                ]
                : []),
        ],
        submitHandler: typeof submitHandler === 'function'
            ? async formValues => {
                try {
                    const payload = buildXiaolubanAccountFormSubmission({
                        account,
                        values: formValues,
                        fallbackDisplayName,
                        isEditing,
                        workspaceOptions,
                        imWorkspaceOptions,
                        accountId,
                    });
                    return await submitHandler(payload);
                } catch (error) {
                    throw mapXiaolubanAccountFormError(error);
                }
            }
            : null,
    });
    if (!values) {
        return null;
    }
    if (typeof submitHandler === 'function') {
        return values;
    }
    if (typeof values !== 'object') {
        return null;
    }
    return buildXiaolubanAccountFormSubmission({
        account,
        values,
        fallbackDisplayName,
        isEditing,
        workspaceOptions,
        imWorkspaceOptions,
        accountId,
    });
}

async function loadXiaolubanExtraGatewayApi() {
    const api = await import('../core/api.js');
    return {
        prepareXiaolubanGatewayAccount: typeof api.prepareXiaolubanGatewayAccount === 'function'
            ? api.prepareXiaolubanGatewayAccount
            : async () => null,
        revealXiaolubanGatewayAccountToken: typeof api.revealXiaolubanGatewayAccountToken === 'function'
            ? api.revealXiaolubanGatewayAccountToken
            : async () => ({ token: '' }),
    };
}

function buildXiaolubanAccountFormSubmission({
    account,
    values,
    fallbackDisplayName,
    isEditing,
    workspaceOptions,
    imWorkspaceOptions,
    accountId,
}) {
    const displayName = String(values.display_name || '').trim() || fallbackDisplayName;
    const token = normalizeXiaolubanTokenFormValue(values.token);
    const notificationWorkspaceIds = normalizeXiaolubanNotificationWorkspaceSelection(
        values.notification_workspace_ids,
        workspaceOptions,
    );
    if (!isEditing && !token) {
        throw new Error(t('settings.gateway.xiaoluban_missing_token'));
    }
    const imWorkspaceId = String(values.xiaoluban_im_workspace_id || '').trim();
    if (imWorkspaceOptions.length === 0) {
        throw new Error(t('settings.gateway.xiaoluban_im_missing_workspace_options'));
    }
    if (!imWorkspaceId) {
        throw new Error(t('settings.gateway.xiaoluban_im_workspace_required'));
    }
    const accountPayload = {
        display_name: displayName,
        notification_workspace_ids: notificationWorkspaceIds,
        notification_receivers: normalizeXiaolubanNotificationReceivers(values.notification_receivers),
        notify_self: true,
    };
    if (!isEditing && accountId) {
        accountPayload.account_id = accountId;
    }
    if (token) {
        accountPayload.token = token;
    }
    return {
        account: accountPayload,
        im_config: {
            workspace_id: imWorkspaceId,
        },
    };
}

async function saveXiaolubanAccountFormSubmission(existingAccount, submission) {
    const accountId = String(existingAccount?.account_id || '').trim();
    const accountPayload = {
        ...submission.account,
        im_config: submission.im_config,
    };
    const savedAccount = accountId
        ? await updateXiaolubanGatewayAccount(accountId, accountPayload)
        : await createXiaolubanGatewayAccount(accountPayload);
    const savedAccountId = String(savedAccount?.account_id || accountId).trim();
    if (!savedAccountId) {
        throw new Error(t('settings.gateway.xiaoluban_save_failed_message'));
    }
    const forwardingCommand = await fetchXiaolubanImForwardingCommandText(savedAccountId);
    return {
        account: savedAccount,
        forwarding_command: forwardingCommand,
    };
}

export function initializeProjectView() {
    syncActionLabels();
    if (els.projectViewReloadBtn) {
        els.projectViewReloadBtn.onclick = () => {
            void refreshProjectView();
        };
    }
    if (els.projectViewCloseBtn) {
        els.projectViewCloseBtn.title = t('workspace_view.back');
        els.projectViewCloseBtn.setAttribute('aria-label', t('workspace_view.back'));
        els.projectViewCloseBtn.onclick = () => {
            hideProjectView();
        };
    }
    if (!languageBound && typeof document?.addEventListener === 'function') {
        document.addEventListener('agent-teams-language-changed', () => {
            syncActionLabels();
            if (currentAutomationEditorState.open === true) {
                renderAutomationEditorModal();
            }
            if (state.currentMainView !== 'project') {
                return;
            }
            if (currentProjectViewMode === 'feature') {
                if (currentFeatureViewId === FEATURE_VIEW_IDS.skills) {
                    void openSkillsFeatureView();
                } else if (currentFeatureViewId === FEATURE_VIEW_IDS.automation) {
                    if (currentAutomationFeatureSection === 'github') {
                        void openAutomationGitHubView(currentGitHubFeatureNodeKey);
                    } else {
                        void openAutomationHomeView(selectedAutomationHomeProjectId);
                    }
                } else if (currentFeatureViewId === FEATURE_VIEW_IDS.gateway) {
                    void openImFeatureView();
                } else if (currentFeatureViewId === FEATURE_VIEW_IDS.boards) {
                    void openBoardsFeatureView();
                }
                return;
            }
            if (currentProjectViewMode === 'automation') {
                if (currentAutomationProject) {
                    void openAutomationProjectView(currentAutomationProject);
                }
                return;
            }
            if (currentSnapshot) {
                renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
            } else {
                renderLoadingState(currentWorkspace);
            }
        });
        languageBound = true;
    }
}

function syncActionLabels() {
    if (els.projectViewReloadBtn) {
        els.projectViewReloadBtn.textContent = t('workspace_view.reload');
    }
    if (els.projectViewCloseBtn) {
        els.projectViewCloseBtn.title = t('workspace_view.back');
        els.projectViewCloseBtn.setAttribute('aria-label', t('workspace_view.back'));
    }
}

export async function openWorkspaceProjectView(workspace) {
    els.projectViewContent?.classList?.remove('is-boards-feature');
    const orderedWorkspace = normalizeWorkspaceRecordMountOrder(workspace);
    const workspaceId = String(orderedWorkspace?.workspace_id || '').trim();
    if (!workspaceId) {
        return;
    }

    rememberLastKnownWorkspaceId(workspaceId);
    abortCurrentFeatureRequest();
    cancelSkillsFeatureAsyncWork();
    currentFeatureRequestToken += 1;
    cacheProjectViewState();
    currentProjectViewMode = 'workspace';
    currentAutomationProject = null;
    currentFeatureViewId = '';
    state.currentFeatureViewId = null;
    currentWorkspace = orderedWorkspace;
    currentSnapshotWorkspaceId = workspaceId;
    state.currentMainView = 'project';
    state.currentProjectViewWorkspaceId = workspaceId;
    state.currentWorkspaceId = workspaceId;
    state.currentSessionId = null;
    clearNewSessionDraft();
    clearAllPanels();
    hideRoundNavigator();
    setProjectViewVisible(true);

    const restoredFromCache = restoreProjectViewState(workspaceId);
    if (restoredFromCache && currentSnapshot) {
        renderWorkspaceSnapshot(orderedWorkspace, currentSnapshot);
        if (selectedTreePath && findDiffSummary(selectedTreePath)) {
            void ensureDiffFileLoaded(selectedTreePath);
        }
    } else {
        resetProjectViewState(workspaceId);
        currentMountName = resolveWorkspaceInitialMountName(orderedWorkspace);
        currentDiffState = {
            ...createInitialDiffState(),
            status: 'loading',
        };
        renderLoadingState(orderedWorkspace);
    }

    const loadToken = ++currentLoadToken;
    void loadWorkspaceSnapshot(workspaceId, loadToken);
    void loadWorkspaceDiffs(workspaceId, loadToken);
}

export async function openAutomationProjectView(project) {
    const automationProjectId = String(project?.automation_project_id || '').trim();
    if (!automationProjectId) {
        return;
    }
    await openAutomationHomeView(automationProjectId);
}

export async function openSkillsFeatureView() {
    const request = beginFeatureRequest(FEATURE_VIEW_IDS.skills);
    const previousState = currentSkillsFeatureState || {};
    const searchQuery = String(previousState.searchQuery || '');
    currentSkillsStatus = null;
    currentSkillsFeatureState = restoreSkillsMarketStateFromCache({
        ...createInitialSkillsFeatureState(),
        activeTab: resolveSkillsFeatureTab(previousState.activeTab),
        searchQuery,
    }, searchQuery);
    renderSkillsFeatureView();
    if (
        currentSkillsFeatureState.activeTab === SKILLS_FEATURE_TABS.market
        && shouldFetchSkillsMarket(currentSkillsFeatureState.searchQuery)
    ) {
        void runSkillsMarketSearchNow(currentSkillsFeatureState.searchQuery, {
            limit: currentSkillsFeatureState.marketLimit,
        });
    }
    try {
        currentSkillsStatus = await fetchConfigStatus({ signal: request.signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.skills, request.token)) {
            return;
        }
        reconcileSkillsMarketInstalledState(currentSkillsStatus?.skills?.skills);
        renderSkillsFeatureView();
    } catch (error) {
        if (isAbortError(error) || !isCurrentFeatureRequest(FEATURE_VIEW_IDS.skills, request.token)) {
            return;
        }
        renderFeatureErrorState(t('feature.skills.title'), error, { showClose: false });
        sysLog(`Failed to load skills feature: ${error?.message || error}`, 'log-error');
    } finally {
        finishFeatureRequest(request.controller);
    }
}

async function openAutomationFeatureView(
    section,
    {
        projectId = '',
        nodeKey = '',
    } = {},
) {
    const request = beginFeatureRequest(FEATURE_VIEW_IDS.automation);
    currentAutomationFeatureSection = section === 'github' ? 'github' : 'schedules';
    selectedAutomationHomeProjectId = String(projectId || '').trim();
    if (nodeKey) {
        currentGitHubFeatureNodeKey = String(nodeKey).trim() || 'access';
    }
    renderFeaturePendingState(
        FEATURE_VIEW_IDS.automation,
        t('feature.automation.title'),
        getFeatureLoadingSummary(FEATURE_VIEW_IDS.automation),
        request,
    );
    try {
        if (currentAutomationFeatureSection === 'github') {
            await loadGitHubFeatureState({ signal: request.signal });
        } else {
            const projects = await fetchAutomationProjects({ signal: request.signal });
            currentAutomationProjects = Array.isArray(projects) ? projects : [];
            if (!selectedAutomationHomeProjectId && currentAutomationProjects.length > 0) {
                selectedAutomationHomeProjectId = String(
                    currentAutomationProjects[0]?.automation_project_id || '',
                ).trim();
            }
            if (selectedAutomationHomeProjectId) {
                await loadAutomationHomeDetail(selectedAutomationHomeProjectId, {
                    signal: request.signal,
                });
            } else {
                currentAutomationHomeDetail = createInitialAutomationHomeDetail();
                currentAutomationProject = null;
            }
        }
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.automation, request.token)) {
            return;
        }
        renderAutomationHomeView();
    } catch (error) {
        if (isAbortError(error) || !isCurrentFeatureRequest(FEATURE_VIEW_IDS.automation, request.token)) {
            return;
        }
        renderFeatureErrorState(t('feature.automation.title'), error);
        sysLog(`Failed to load automation feature: ${error?.message || error}`, 'log-error');
    } finally {
        finishFeatureRequest(request.controller);
    }
}

export async function openAutomationHomeView(projectId = '') {
    await openAutomationFeatureView('schedules', { projectId });
}

export async function openAutomationGitHubView(nodeKey = 'access') {
    await openAutomationFeatureView('github', { nodeKey });
}

export async function openImFeatureView() {
    const request = beginFeatureRequest(FEATURE_VIEW_IDS.gateway);
    const previousState = currentGatewayFeatureState || {};
    currentGatewayFeatureState = {
        ...createInitialGatewayFeatureState(),
        connectorSearch: String(previousState.connectorSearch || ''),
        connectorStatusFilter: String(previousState.connectorStatusFilter || 'all') || 'all',
        runtimeToolJobs: previousState.runtimeToolJobs || {},
    };
    renderGatewayFeatureView();
    const tasks = [
        loadGatewayConnectors(request.token, request.signal),
        loadGatewayFeishuAccounts(request.token, request.signal),
        loadGatewayXiaolubanAccounts(request.token, request.signal),
        loadGatewayWeChatAccounts(request.token, request.signal),
        loadGatewayDiscordAccounts(request.token, request.signal),
        loadGatewayWorkspaces(request.token, request.signal),
        loadGatewayRoleOptions(request.token, request.signal),
        loadGatewayOrchestrationConfig(request.token, request.signal),
        loadGatewayRuntimeTools(request.token, request.signal),
    ];
    void Promise.allSettled(tasks).finally(() => {
        finishFeatureRequest(request.controller);
    });
}

async function loadGatewayConnectors(requestToken, signal = null) {
    try {
        const connectorsResponse = await fetchConnectors({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            connectorsResponse,
            connectorsError: '',
        };
        renderGatewayFeatureView();
    } catch (error) {
        if (!logGatewayFeatureLoadFailure('connectors', error, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            connectorsResponse: null,
            connectorsError: readErrorDetail(error) || t('feature.connectors.load_failed.copy'),
        };
        renderGatewayFeatureView();
    }
}

async function loadGatewayFeishuAccounts(requestToken, signal = null) {
    try {
        const triggers = await fetchTriggers({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            feishuTriggers: normalizeFeishuTriggers(triggers),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('feishu accounts', error, requestToken);
    }
}

async function loadGatewayXiaolubanAccounts(requestToken, signal = null) {
    try {
        const xiaolubanAccounts = await fetchXiaolubanGatewayAccounts({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            xiaolubanAccounts: normalizeXiaolubanAccounts(xiaolubanAccounts),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('xiaoluban accounts', error, requestToken);
    }
}

async function loadGatewayWeChatAccounts(requestToken, signal = null) {
    try {
        const wechatAccounts = await fetchWeChatGatewayAccounts({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatAccounts: normalizeWeChatAccounts(wechatAccounts),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('wechat accounts', error, requestToken);
    }
}

async function loadGatewayDiscordAccounts(requestToken, signal = null) {
    try {
        const discordAccounts = await fetchDiscordGatewayAccounts({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            discordAccounts: normalizeDiscordAccounts(discordAccounts),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('discord accounts', error, requestToken);
    }
}

async function loadGatewayWorkspaces(requestToken, signal = null) {
    try {
        const workspaces = await fetchWorkspaces({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            workspaces: normalizeGatewayWorkspaces(workspaces),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('workspaces', error, requestToken);
    }
}

async function loadGatewayRoleOptions(requestToken, signal = null) {
    try {
        const roleOptions = await fetchRoleConfigOptions({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            normalRoles: normalizeRoleOptions(roleOptions),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('role options', error, requestToken);
    }
}

async function loadGatewayOrchestrationConfig(requestToken, signal = null) {
    try {
        const orchestrationConfig = await fetchOrchestrationConfig({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            orchestrationPresets: normalizeOrchestrationPresets(orchestrationConfig),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        logGatewayFeatureLoadFailure('orchestration config', error, requestToken);
    }
}

async function loadGatewayRuntimeTools(requestToken, signal = null) {
    try {
        const runtimeToolsResponse = await fetchRuntimeTools({ signal });
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolsResponse,
            runtimeToolsError: '',
            runtimeToolsSystemPathAdded: Boolean(runtimeToolsResponse?.system_path?.added),
        };
        resumeRuntimeToolDownloadPolling(runtimeToolsResponse);
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    } catch (error) {
        if (!logGatewayFeatureLoadFailure('runtime tools', error, requestToken)) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolsResponse: null,
            runtimeToolsError: readErrorDetail(error) || t('feature.connectors.runtime_tools.load_failed'),
        };
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
    }
}

function logGatewayFeatureLoadFailure(label, error, requestToken) {
    if (isAbortError(error) || !isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, requestToken)) {
        return false;
    }
    sysLog(`Failed to load gateway ${label}: ${error?.message || error}`, 'log-warn');
    return true;
}

export async function openBoardsFeatureView() {
    const preferredWorkspaceId = resolveBoardsFeaturePreferredWorkspaceId();
    const request = beginFeatureRequest(FEATURE_VIEW_IDS.boards);
    renderFeaturePendingState(
        FEATURE_VIEW_IDS.boards,
        t('feature.boards.title'),
        getFeatureLoadingSummary(FEATURE_VIEW_IDS.boards),
        request,
    );
    try {
        if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.boards, request.token)) {
            return;
        }
        renderBoardsFeatureView({ preferredWorkspaceId });
    } catch (error) {
        if (isAbortError(error) || !isCurrentFeatureRequest(FEATURE_VIEW_IDS.boards, request.token)) {
            return;
        }
        renderFeatureErrorState(t('feature.boards.title'), error);
        sysLog(`Failed to load boards feature: ${error?.message || error}`, 'log-error');
    } finally {
        finishFeatureRequest(request.controller);
    }
}

function resolveBoardsFeaturePreferredWorkspaceId() {
    const projectWorkspaceId = String(state.currentProjectViewWorkspaceId || '').trim();
    if (projectWorkspaceId && !projectWorkspaceId.startsWith('feature:')) {
        return projectWorkspaceId;
    }
    return String(
        state.pendingNewSessionWorkspaceId
        || state.currentWorkspaceId
        || lastKnownWorkspaceId
        || '',
    ).trim();
}

function renderBoardsFeatureView({ preferredWorkspaceId = '' } = {}) {
    hideProjectViewToolbar();
    if (!els.projectViewContent) {
        return;
    }
    els.projectViewContent.classList?.add('is-boards-feature');
    els.projectViewContent.innerHTML = `
        <section class="boards-feature-page" aria-label="${escapeHtml(t('feature.boards.title'))}">
            <div id="board-todo-root"></div>
        </section>
    `;
    mountBoardTodoBoard({ preferredWorkspaceId });
}

export async function refreshProjectView() {
    if (currentProjectViewMode === 'feature') {
        if (currentFeatureViewId === FEATURE_VIEW_IDS.skills) {
            await openSkillsFeatureView();
            return;
        }
        if (currentFeatureViewId === FEATURE_VIEW_IDS.automation) {
            if (currentAutomationFeatureSection === 'github') {
                await openAutomationGitHubView(currentGitHubFeatureNodeKey);
            } else {
                await openAutomationHomeView(selectedAutomationHomeProjectId);
            }
            return;
        }
        if (currentFeatureViewId === FEATURE_VIEW_IDS.gateway) {
            await openImFeatureView();
            return;
        }
        if (currentFeatureViewId === FEATURE_VIEW_IDS.boards) {
            await openBoardsFeatureView();
            return;
        }
    }
    if (currentProjectViewMode === 'automation') {
        if (!currentAutomationProject) {
            return;
        }
        await openAutomationProjectView(currentAutomationProject);
        return;
    }
    if (!currentWorkspace) {
        return;
    }
    await openWorkspaceProjectView(currentWorkspace);
}

export function hideProjectView() {
    abortCurrentFeatureRequest();
    cancelSkillsFeatureAsyncWork();
    currentFeatureRequestToken += 1;
    resetFeatureSurface();
    cacheProjectViewState();
    currentWorkspace = null;
    currentAutomationProject = null;
    currentProjectViewMode = 'workspace';
    currentFeatureViewId = '';
    state.currentFeatureViewId = null;
    currentAutomationProjects = [];
    selectedAutomationHomeProjectId = '';
    currentAutomationHomeDetail = createInitialAutomationHomeDetail();
    currentAutomationFeatureSection = 'schedules';
    currentGitHubFeatureState = createInitialGitHubFeatureState();
    currentGitHubFeatureNodeKey = 'access';
    currentSkillsStatus = null;
    currentGatewayFeatureState = createInitialGatewayFeatureState();
    renderGatewayFeatureModal();
    resetProjectViewState(null);
    state.currentMainView = 'session';
    state.currentProjectViewWorkspaceId = null;
    currentLoadToken += 1;
    setProjectViewVisible(false);
}

export function prepareExternalFeatureView(featureId) {
    const safeFeatureId = String(featureId || '').trim();
    if (!safeFeatureId) {
        return;
    }
    rememberLastKnownWorkspaceId();
    abortCurrentFeatureRequest();
    if (safeFeatureId !== FEATURE_VIEW_IDS.skills) {
        cancelSkillsFeatureAsyncWork();
    }
    currentFeatureRequestToken += 1;
    resetFeatureSurface();
    cacheProjectViewState();
    currentWorkspace = null;
    currentAutomationProject = null;
    currentProjectViewMode = 'feature';
    currentFeatureViewId = safeFeatureId;
    currentSnapshotWorkspaceId = null;
    state.currentFeatureViewId = safeFeatureId;
    state.currentMainView = 'project';
    state.currentProjectViewWorkspaceId = `feature:${safeFeatureId}`;
    state.currentWorkspaceId = null;
    state.currentSessionId = null;
    currentLoadToken += 1;
    setProjectViewVisible(true);
}

function resetProjectViewState(workspaceId) {
    currentSnapshot = null;
    currentSnapshotWorkspaceId = workspaceId;
    currentMountName = null;
    selectedTreePath = null;
    currentDiffState = createInitialDiffState();
    currentMountTrees.clear();
    expandedTreePaths.clear();
    loadingTreePaths.clear();
    treeLoadErrors.clear();
}

function createInitialDiffState() {
    return {
        status: 'idle',
        mountName: null,
        diffFiles: [],
        diffMessage: null,
        isGitRepository: null,
        gitRootPath: null,
        loadedDiffs: new Map(),
        loadingFilePaths: new Set(),
        fileErrors: new Map(),
    };
}

function cacheProjectViewState() {
    const workspaceId = String(currentSnapshotWorkspaceId || currentWorkspace?.workspace_id || '').trim();
    if (!workspaceId) {
        return;
    }
    if (!currentSnapshot && currentDiffState.status !== 'ready') {
        return;
    }
    workspaceViewCache.set(workspaceId, {
        snapshot: cloneSnapshot(currentSnapshot),
        currentMountName,
        selectedTreePath,
        mountTrees: Array.from(currentMountTrees.entries()).map(([mountName, tree]) => [
            String(mountName || '').trim(),
            cloneTreeNode(tree),
        ]),
        expandedTreePaths: Array.from(expandedTreePaths),
        diffState: cloneDiffState(currentDiffState),
    });
}

function restoreProjectViewState(workspaceId) {
    const cachedState = workspaceViewCache.get(workspaceId);
    resetProjectViewState(workspaceId);
    if (!cachedState) {
        return false;
    }

    currentSnapshot = cloneSnapshot(cachedState.snapshot);
    currentMountName = String(cachedState.currentMountName || '').trim() || null;
    selectedTreePath = String(cachedState.selectedTreePath || '').trim() || null;
    currentDiffState = cloneDiffState(cachedState.diffState);
    currentMountTrees.clear();
    for (const entry of Array.isArray(cachedState.mountTrees) ? cachedState.mountTrees : []) {
        if (!Array.isArray(entry) || entry.length < 2) {
            continue;
        }
        const mountName = String(entry[0] || '').trim();
        const tree = cloneTreeNode(entry[1]);
        if (!mountName || !tree) {
            continue;
        }
        currentMountTrees.set(mountName, tree);
    }

    for (const path of Array.isArray(cachedState.expandedTreePaths) ? cachedState.expandedTreePaths : []) {
        const normalizedPath = String(path || '').trim();
        if (normalizedPath) {
            expandedTreePaths.add(normalizedPath);
        }
    }

    return currentSnapshot !== null;
}

async function loadWorkspaceSnapshot(workspaceId, loadToken) {
    try {
        const snapshot = await fetchWorkspaceSnapshot(workspaceId);
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId) {
            return;
        }

        const nextSnapshot = normalizeSnapshot(snapshot, currentWorkspace);
        currentSnapshot = nextSnapshot;
        currentSnapshotWorkspaceId = workspaceId;
        currentMountName = resolveWorkspaceMountName(currentMountName, nextSnapshot);
        primeSnapshotMountTrees(nextSnapshot);

        ensureActiveMountTreeLoaded(loadToken);
        cacheProjectViewState();
    } catch (error) {
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId) {
            return;
        }
        if (!currentSnapshot) {
            currentDiffState = {
                ...createInitialDiffState(),
                status: 'error',
                diffMessage: String(error?.message || error || ''),
            };
            renderErrorState(currentWorkspace, error);
        }
        sysLog(`Failed to load project snapshot: ${error?.message || error}`, 'log-error');
    }
}

async function loadWorkspaceDiffs(workspaceId, loadToken) {
    const mountName = resolveActiveMountName();
    try {
        const payload = await fetchWorkspaceDiffs(workspaceId, mountName);
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId) {
            return;
        }

        const diffFiles = Array.isArray(payload?.diff_files) ? payload.diff_files : [];
        currentDiffState = {
            status: 'ready',
            mountName,
            diffFiles,
            diffMessage: String(payload?.diff_message || '').trim() || null,
            isGitRepository: payload?.is_git_repository === true,
            gitRootPath: payload?.git_root_path || null,
            loadedDiffs: filterLoadedDiffs(currentDiffState.loadedDiffs, diffFiles),
            loadingFilePaths: new Set(),
            fileErrors: filterFileErrors(currentDiffState.fileErrors, diffFiles),
        };
        if (!selectedTreePath && currentDiffState.diffFiles.length > 0) {
            selectedTreePath = String(currentDiffState.diffFiles[0]?.path || '').trim() || null;
        }
        if (currentSnapshot) {
            renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        }
        cacheProjectViewState();
        if (selectedTreePath && findDiffSummary(selectedTreePath)) {
            void ensureDiffFileLoaded(selectedTreePath);
        }
    } catch (error) {
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId) {
            return;
        }
        if (currentDiffState.status !== 'ready') {
            currentDiffState = {
                ...createInitialDiffState(),
                status: 'error',
                diffMessage: String(error?.message || error || ''),
            };
        }
        if (currentSnapshot) {
            renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        }
        sysLog(`Failed to load project diffs: ${error?.message || error}`, 'log-error');
    }
}

function setProjectViewVisible(visible) {
    if (els.projectView) {
        els.projectView.style.display = visible ? 'block' : 'none';
    }
    if (els.chatContainer) {
        els.chatContainer.style.display = visible ? 'none' : 'flex';
    }

    if (visible) {
        const observabilityView = document.getElementById('observability-view');
        const observabilityButton = document.getElementById('observability-btn');
        if (observabilityView) {
            observabilityView.style.display = 'none';
        }
        if (observabilityButton) {
            observabilityButton.classList.remove('active');
        }
        document.body?.classList?.remove('observability-mode');
    }
}

function renderFeatureErrorState(title, error, { showClose = true } = {}) {
    renderToolbar(null, {
        title,
        mode: 'feature',
        summary: t('workspace_view.load_failed'),
        showClose,
    });
    if (els.projectViewContent) {
        els.projectViewContent.innerHTML = `
            <div class="workspace-view-empty-state is-error">
                <p>${escapeHtml(t('workspace_view.load_failed'))}</p>
                <p>${escapeHtml(String(error?.message || error || ''))}</p>
            </div>
        `;
    }
}

function renderSkillsFeatureView() {
    const skills = Array.isArray(currentSkillsStatus?.skills?.skills)
        ? currentSkillsStatus.skills.skills
        : [];
    const activeTab = resolveSkillsFeatureTab(currentSkillsFeatureState.activeTab);
    renderToolbar(null, {
        title: t('feature.skills.title'),
        mode: 'feature',
        summary: resolveSkillsSummary(),
        actions: renderSkillsToolbarActions(),
        showClose: false,
    });
    if (!els.projectViewContent) {
        return;
    }
    els.projectViewContent.innerHTML = `
        <div class="feature-page feature-page-neutral feature-skills-page">
            ${renderSkillsPrimaryTabs(activeTab)}
            ${activeTab === SKILLS_FEATURE_TABS.market
                ? renderSkillsMarketView(skills)
                : renderInstalledSkillsView(skills)}
        </div>
    `;
    bindSkillsFeatureHandlers(activeTab);
}

function renderSkillsToolbarActions() {
    return `
        <div class="feature-skills-toolbar-actions">
            <label class="feature-skills-search">
                <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"></circle>
                    <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
                <input type="search" value="${escapeHtml(currentSkillsFeatureState.searchQuery)}" placeholder="${escapeHtml(t('feature.skills.search_placeholder'))}" data-feature-skills-search>
            </label>
            <button class="secondary-btn project-view-toolbar-btn feature-skills-add-btn" type="button" data-feature-skills-add>
                <span aria-hidden="true">+</span>
                <span>${escapeHtml(t('feature.skills.add'))}</span>
            </button>
            <button class="secondary-btn project-view-toolbar-btn feature-skills-settings-btn" type="button" data-feature-skills-clawhub-settings title="${escapeHtml(t('feature.skills.clawhub_settings'))}">
                <span>${escapeHtml(t('feature.skills.clawhub_settings'))}</span>
            </button>
        </div>
    `;
}

function renderSkillsPrimaryTabs(activeTab) {
    return `
        <div class="feature-skills-primary-tabs" role="tablist" aria-label="${escapeHtml(t('feature.skills.title'))}">
            ${renderSkillsPrimaryTab(SKILLS_FEATURE_TABS.market, t('feature.skills.market_tab'), activeTab)}
            ${renderSkillsPrimaryTab(SKILLS_FEATURE_TABS.installed, t('feature.skills.installed_tab'), activeTab)}
            ${renderSkillsInstalledTabTools(activeTab)}
        </div>
    `;
}

function renderSkillsInstalledTabTools(activeTab) {
    if (activeTab !== SKILLS_FEATURE_TABS.installed) {
        return '';
    }
    const skills = Array.isArray(currentSkillsStatus?.skills?.skills)
        ? currentSkillsStatus.skills.skills
        : [];
    return `
        <div class="feature-skills-installed-tab-tools" role="presentation">
            <span class="feature-skills-toolbar-count">${escapeHtml(formatMessage('feature.skills.installed_count', { count: skills.length }))}</span>
            <button class="secondary-btn project-view-toolbar-btn" type="button" data-feature-skills-reload>${escapeHtml(t('feature.skills.reload'))}</button>
        </div>
    `;
}

function renderSkillsPrimaryTab(tab, label, activeTab) {
    const active = tab === activeTab;
    return `
        <button class="feature-skills-primary-tab${active ? ' is-active' : ''}" type="button" role="tab" aria-selected="${active ? 'true' : 'false'}" data-feature-skills-tab="${escapeHtml(tab)}">
            ${escapeHtml(label)}
        </button>
    `;
}

function renderSkillsMarketView(skills) {
    const items = resolveSkillsMarketItems(skills);
    const query = String(currentSkillsFeatureState.searchQuery || '').trim();
    return `
        <section class="feature-skills-market" data-feature-skills-market>
            ${items.length > 0 ? `
                <div class="feature-skills-market-grid">
                    ${items.map(item => renderSkillsMarketCard(item)).join('')}
                </div>
                ${renderSkillsMarketPaging()}
            ` : `
                ${renderSkillsMarketEmptyState(query)}
            `}
        </section>
    `;
}

function renderSkillsMarketPaging() {
    if (currentSkillsFeatureState.marketStatus === 'loading_more') {
        return `
            <div class="feature-skills-market-more">
                <button class="secondary-btn project-view-toolbar-btn" type="button" data-feature-skills-market-more disabled>
                    ${escapeHtml(t('feature.skills.market_loading_more'))}
                </button>
            </div>
        `;
    }
    if (!currentSkillsFeatureState.marketHasMore) {
        return '';
    }
    return `
        <div class="feature-skills-market-more">
            <button class="secondary-btn project-view-toolbar-btn" type="button" data-feature-skills-market-more>
                ${escapeHtml(t('feature.skills.market_load_more'))}
            </button>
        </div>
    `;
}

function renderSkillsClawHubSettingsForm() {
    return `
        <div class="skills-clawhub-settings-form">
            <div class="proxy-form-grid">
                <div class="form-group proxy-inline-field">
                    <label for="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.tokenInputId)}">${escapeHtml(t('settings.clawhub.token'))}</label>
                    <div class="secure-input-row">
                        <input type="password" id="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.tokenInputId)}" placeholder="${escapeHtml(t('settings.clawhub.token_placeholder'))}" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
                        <button class="secure-input-btn" id="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.toggleTokenButtonId)}" type="button" title="${escapeHtml(t('settings.clawhub.show_token'))}" aria-label="${escapeHtml(t('settings.clawhub.show_token'))}" style="display:none;">
                            <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="form-group proxy-inline-field web-provider-inline-field">
                    <span class="settings-token-source-label">${escapeHtml(t('settings.clawhub.token_source'))}</span>
                    <a class="web-provider-link-card" id="feature-clawhub-token-link" href="https://clawhub.ai/settings" target="_blank" rel="noreferrer" title="https://clawhub.ai/settings" aria-label="https://clawhub.ai/settings">
                        <span class="web-provider-link-copy">
                            <span class="web-provider-link-badge">ClawHub</span>
                            <span class="web-provider-link-url">https://clawhub.ai/settings</span>
                            <span class="settings-token-source-note">${escapeHtml(t('settings.clawhub.token_source_help'))}</span>
                        </span>
                        <span class="web-provider-link-arrow" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" class="icon-sm">
                                <path d="M7 17L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                <path d="M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        </span>
                    </a>
                </div>
                <div class="form-group proxy-inline-field proxy-inline-field-actions">
                    <label for="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.saveButtonId)}">${escapeHtml(t('settings.clawhub.token_action'))}</label>
                    <div class="settings-inline-action-row">
                        <button class="secondary-btn section-action-btn proxy-inline-test-btn" id="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.probeButtonId)}" type="button">${escapeHtml(t('settings.clawhub.test_connection'))}</button>
                        <button class="primary-btn section-action-btn proxy-inline-test-btn" id="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.saveButtonId)}" type="button">${escapeHtml(t('settings.action.save'))}</button>
                    </div>
                </div>
            </div>
            <div class="proxy-probe-status" id="${escapeHtml(FEATURE_CLAWHUB_FIELD_IDS.statusId)}" style="display:none;"></div>
        </div>
    `;
}

function renderSkillsMarketEmptyState(query) {
    if (currentSkillsFeatureState.marketStatus === 'loading') {
        return renderFeatureEmptyState(
            t('feature.skills.market_searching'),
            query
                ? formatMessage('feature.skills.market_searching_copy', { query })
                : t('feature.skills.market_idle_copy'),
        );
    }
    if (currentSkillsFeatureState.marketStatus === 'error') {
        return renderFeatureEmptyState(
            t('feature.skills.market_error'),
            currentSkillsFeatureState.marketError || t('feature.skills.market_error_copy'),
        );
    }
    if (currentSkillsFeatureState.marketStatus === 'loaded') {
        return renderFeatureEmptyState(
            t('feature.skills.market_empty'),
            t('feature.skills.market_empty_copy'),
        );
    }
    return renderFeatureEmptyState(
        t('feature.skills.market_idle'),
        t('feature.skills.market_idle_copy'),
    );
}

function renderSkillsMarketCard(item) {
    const slug = String(item?.slug || '').trim();
    const title = String(item?.title || slug).trim() || slug;
    const summary = String(item?.summary || item?.description || '').trim();
    const initial = title.slice(0, 1).toUpperCase() || 'S';
    const installed = item?.installed === true;
    const runtimeRef = resolveSkillsMarketRuntimeRef(item);
    const detailKind = installed && runtimeRef ? 'installed' : 'market';
    const detailKey = detailKind === 'installed' ? runtimeRef : slug;
    const jobStatus = currentSkillsFeatureState.marketInstallJobs?.[slug] || '';
    const busy = jobStatus === 'installing' || jobStatus === 'uninstalling';
    const actionLabel = installed
        ? (jobStatus === 'uninstalling' ? t('feature.skills.uninstalling') : t('feature.skills.uninstall'))
        : (jobStatus === 'installing' ? t('feature.skills.installing') : t('feature.skills.install'));
    const actionAttr = installed
        ? `data-feature-skills-market-uninstall="${escapeHtml(slug)}"`
        : `data-feature-skills-market-install="${escapeHtml(slug)}"`;
    const actionClass = installed
        ? 'secondary-btn danger-btn'
        : 'primary-btn';
    const identityMeta = resolveSkillsMarketIdentityMeta(item);
    const statsItems = resolveSkillsMarketStatsItems(item);
    return `
        <article class="feature-skills-market-card" role="button" tabindex="0" data-skills-market-card="${escapeHtml(slug)}" data-feature-skill-detail="${escapeHtml(detailKind)}:${escapeHtml(detailKey)}" data-feature-skill-detail-kind="${escapeHtml(detailKind)}" data-feature-skill-detail-key="${escapeHtml(detailKey)}">
            <div class="feature-skills-card-icon is-gray" aria-hidden="true">${escapeHtml(initial)}</div>
            <div class="feature-skills-card-main">
                <div class="feature-skills-card-title-row">
                    <h4 title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
                    <button class="${actionClass} feature-skills-card-install" type="button" ${actionAttr} ${busy ? 'disabled' : ''}>${escapeHtml(actionLabel)}</button>
                </div>
                <p>${escapeHtml(summary || slug)}</p>
                <div class="feature-skills-market-identity" title="${escapeHtml(identityMeta)}">${escapeHtml(identityMeta)}</div>
                <div class="feature-skills-card-meta feature-skills-market-stats">
                    ${statsItems.length > 0
                        ? statsItems.map(meta => `
                            <span class="feature-skills-market-stat" title="${escapeHtml(`${meta.label}: ${meta.value}`)}" aria-label="${escapeHtml(`${meta.label}: ${meta.value}`)}">
                                ${renderSkillsMarketStatIcon(meta.icon)}
                                <strong>${escapeHtml(meta.value)}</strong>
                            </span>
                        `).join('')
                        : `<span><strong>${escapeHtml(t('feature.skills.market_result'))}</strong></span>`
                    }
                </div>
            </div>
        </article>
    `;
}

function resolveSkillsMarketIdentityMeta(item) {
    const slug = String(item?.slug || '').trim();
    const metaItems = slug ? [slug] : [];
    if (item?.version) {
        metaItems.push(formatMessage('feature.skills.market_version', { version: item.version }));
    }
    return metaItems.join(' · ') || t('feature.skills.market_result');
}

function resolveSkillsMarketStatsItems(item) {
    const metaItems = [];
    const stats = item?.stats || {};
    const installs = Number(stats?.installs_current ?? stats?.installs_all_time);
    const stars = Number(stats?.stars);
    const downloads = Number(stats?.downloads);
    if (Number.isFinite(installs)) {
        metaItems.push({
            value: formatSkillsMarketCount(installs),
            label: t('feature.skills.market_installs_short'),
            icon: 'package',
        });
    }
    if (Number.isFinite(stars)) {
        metaItems.push({
            value: formatSkillsMarketCount(stars),
            label: t('feature.skills.market_stars_short'),
            icon: 'star',
        });
    }
    if (Number.isFinite(downloads)) {
        metaItems.push({
            value: formatSkillsMarketCount(downloads),
            label: t('feature.skills.market_downloads_short'),
            icon: 'download',
        });
    }
    if (
        normalizeSearchQuery(currentSkillsFeatureState.searchQuery)
        && Number.isFinite(Number(item?.score))
    ) {
        metaItems.push({
            value: Number(item.score).toFixed(2),
            label: t('feature.skills.detail_score'),
            icon: 'target',
        });
    }
    return metaItems;
}

function renderSkillsMarketStatIcon(icon) {
    const name = String(icon || '').trim();
    if (name === 'star') {
        return `
            <svg viewBox="0 0 24 24" fill="none" class="feature-skills-market-stat-icon" aria-hidden="true">
                <path d="M12 3.5l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8L12 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
            </svg>
        `;
    }
    if (name === 'download') {
        return `
            <svg viewBox="0 0 24 24" fill="none" class="feature-skills-market-stat-icon" aria-hidden="true">
                <path d="M12 3v10m0 0l4-4m-4 4L8 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M5 17v1.5A2.5 2.5 0 0 0 7.5 21h9A2.5 2.5 0 0 0 19 18.5V17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
            </svg>
        `;
    }
    if (name === 'target') {
        return `
            <svg viewBox="0 0 24 24" fill="none" class="feature-skills-market-stat-icon" aria-hidden="true">
                <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"></circle>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"></circle>
            </svg>
        `;
    }
    return `
        <svg viewBox="0 0 24 24" fill="none" class="feature-skills-market-stat-icon" aria-hidden="true">
            <path d="M4.5 8.5L12 4l7.5 4.5v7L12 20 4.5 15.5v-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
            <path d="M4.8 8.7L12 13l7.2-4.3M12 13v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
    `;
}

function formatSkillsMarketCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '';
    }
    return new Intl.NumberFormat(undefined, {
        notation: numericValue >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: numericValue >= 10000 ? 1 : 0,
    }).format(numericValue);
}

function renderInstalledSkillsView(skills) {
    const filteredSkills = filterInstalledSkills(skills);
    return `
        <section class="skills-directory-panel">
            ${filteredSkills.length > 0 ? `
                <div class="skills-directory-grid">
                    ${filteredSkills.map(skill => renderInstalledSkillCard(skill)).join('')}
                </div>
            ` : `
                ${renderFeatureEmptyState(
                    t('feature.skills.empty'),
                    t('feature.skills.empty_copy'),
                )}
            `}
        </section>
    `;
}

function renderInstalledSkillCard(skill) {
    const name = String(skill?.name || skill?.ref || '').trim();
    const key = resolveInstalledSkillKey(skill);
    const uninstallSlug = resolveSkillUninstallSlug(skill);
    const canUninstall = isInstalledSkillUninstallable(skill) && Boolean(uninstallSlug);
    const jobStatus = uninstallSlug ? currentSkillsFeatureState.marketInstallJobs?.[uninstallSlug] || '' : '';
    const uninstalling = jobStatus === 'uninstalling';
    const initial = name.slice(0, 1).toUpperCase() || 'S';
    return `
        <article class="feature-skills-installed-card" role="button" tabindex="0" data-feature-skill-detail="installed:${escapeHtml(key)}" data-feature-skill-detail-kind="installed" data-feature-skill-detail-key="${escapeHtml(key)}">
            <div class="feature-skills-card-icon is-gray" aria-hidden="true">${escapeHtml(initial)}</div>
            <div class="feature-skills-card-main">
                <div class="feature-skills-card-title-row">
                    <h4 title="${escapeHtml(name)}">${escapeHtml(name)}</h4>
                    ${canUninstall
                        ? `<button class="secondary-btn danger-btn feature-skills-card-install" type="button" data-feature-skills-installed-uninstall="${escapeHtml(uninstallSlug)}" ${uninstalling ? 'disabled' : ''}>${escapeHtml(uninstalling ? t('feature.skills.uninstalling') : t('feature.skills.uninstall'))}</button>`
                        : renderFeatureStatusPill(resolveSkillScopeLabel(skill?.source || skill?.scope), 'neutral')}
                </div>
                <p>${escapeHtml(String(skill?.description || ''))}</p>
                <div class="feature-skills-installed-meta">
                    <code>${escapeHtml(String(skill?.ref || ''))}</code>
                    <span>${escapeHtml(String(skill?.path || skill?.instruction_path || ''))}</span>
                </div>
            </div>
        </article>
    `;
}

function bindSkillsFeatureHandlers(activeTab) {
    els.projectViewToolbarActions?.querySelector('[data-feature-skills-search]')?.addEventListener('input', event => {
        const searchQuery = String(event.target?.value || '');
        if (activeTab === SKILLS_FEATURE_TABS.market) {
            skillsMarketRequestToken += 1;
        }
        currentSkillsFeatureState = restoreSkillsMarketStateFromCache({
            ...currentSkillsFeatureState,
            searchQuery,
        }, searchQuery);
        if (activeTab === SKILLS_FEATURE_TABS.market) {
            renderSkillsFeatureView();
            focusSkillsSearchInput();
            if (shouldFetchSkillsMarket(searchQuery)) {
                scheduleSkillsMarketSearch(searchQuery);
            }
            return;
        }
        renderSkillsFeatureView();
        focusSkillsSearchInput();
    });
    els.projectViewToolbarActions?.querySelector('[data-feature-skills-search]')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || activeTab !== SKILLS_FEATURE_TABS.market) {
            return;
        }
        event.preventDefault();
        void runSkillsMarketSearchNow(currentSkillsFeatureState.searchQuery);
    });
    els.projectViewToolbarActions?.querySelector('[data-feature-skills-add]')?.addEventListener('click', () => {
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            activeTab: SKILLS_FEATURE_TABS.market,
        };
        renderSkillsFeatureView();
        void openSkillsMarketInstallDialog();
    });
    els.projectViewToolbarActions?.querySelector('[data-feature-skills-clawhub-settings]')?.addEventListener('click', () => {
        openSkillsClawHubSettingsModal();
    });
    els.projectViewContent?.querySelector('[data-feature-skills-reload]')?.addEventListener('click', () => {
        void handleSkillsReloadFeature();
    });
    els.projectViewContent?.querySelectorAll('[data-feature-skills-tab]').forEach(button => {
        button.addEventListener('click', () => {
            const activeTabValue = resolveSkillsFeatureTab(button.getAttribute('data-feature-skills-tab'));
            currentSkillsFeatureState = {
                ...currentSkillsFeatureState,
                activeTab: activeTabValue,
            };
            renderSkillsFeatureView();
            if (activeTabValue === SKILLS_FEATURE_TABS.market) {
                if (shouldFetchSkillsMarket(currentSkillsFeatureState.searchQuery)) {
                    void runSkillsMarketSearchNow(currentSkillsFeatureState.searchQuery, {
                        limit: currentSkillsFeatureState.marketLimit,
                    });
                }
            }
        });
    });
    els.projectViewContent?.querySelector('[data-feature-skills-market-more]')?.addEventListener('click', () => {
        void loadNextSkillsMarketPage();
    });
    els.projectViewContent?.querySelectorAll('[data-feature-skills-market-install]').forEach(button => {
        button.addEventListener('click', event => {
            event?.stopPropagation?.();
            const slug = String(button.getAttribute('data-feature-skills-market-install') || '').trim();
            const item = currentSkillsFeatureState.marketItems.find(candidate => String(candidate?.slug || '').trim() === slug);
            void handleSkillsMarketInstall({
                slug,
                version: item?.version || null,
                force: false,
            });
        });
    });
    els.projectViewContent?.querySelectorAll('[data-feature-skills-market-uninstall]').forEach(button => {
        button.addEventListener('click', event => {
            event?.stopPropagation?.();
            const slug = String(button.getAttribute('data-feature-skills-market-uninstall') || '').trim();
            void handleSkillsMarketUninstall({ slug });
        });
    });
    els.projectViewContent?.querySelectorAll('[data-feature-skills-installed-uninstall]').forEach(button => {
        button.addEventListener('click', event => {
            event?.stopPropagation?.();
            const slug = String(button.getAttribute('data-feature-skills-installed-uninstall') || '').trim();
            void handleInstalledSkillUninstall({ skillRef: slug });
        });
    });
    bindSkillDetailCardHandlers();
    if (activeTab === SKILLS_FEATURE_TABS.market) {
        bindSkillsMarketScrollLoader();
    }
}

function bindSkillDetailCardHandlers() {
    els.projectViewContent?.querySelectorAll('[data-feature-skill-detail]').forEach(card => {
        const open = () => {
            const compactDetail = String(card.getAttribute('data-feature-skill-detail') || '').trim();
            const separatorIndex = compactDetail.indexOf(':');
            openSkillDetailModal({
                kind: separatorIndex >= 0 ? compactDetail.slice(0, separatorIndex) : card.getAttribute('data-feature-skill-detail-kind'),
                key: separatorIndex >= 0 ? compactDetail.slice(separatorIndex + 1) : card.getAttribute('data-feature-skill-detail-key'),
            });
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            if (isInteractiveSkillCardEventTarget(event.target, card)) {
                return;
            }
            event.preventDefault();
            open();
        });
    });
}

function isInteractiveSkillCardEventTarget(target, card) {
    if (!target || target === card || typeof target.closest !== 'function') {
        return false;
    }
    const interactive = target.closest('button,a,input,textarea,select,summary,[role="button"],[tabindex]');
    if (!interactive || interactive === card) {
        return false;
    }
    return typeof card.contains === 'function'
        ? card.contains(interactive)
        : true;
}

function bindSkillsMarketScrollLoader() {
    if (skillsMarketScrollBound) {
        return;
    }
    skillsMarketScrollBound = true;
    els.projectViewContent?.addEventListener?.('scroll', handleSkillsMarketScroll, { passive: true });
    globalThis.window?.addEventListener?.('scroll', handleSkillsMarketScroll, { passive: true });
}

function handleSkillsMarketScroll() {
    if (
        currentFeatureViewId !== FEATURE_VIEW_IDS.skills
        || currentSkillsFeatureState.activeTab !== SKILLS_FEATURE_TABS.market
    ) {
        return;
    }
    if (!isSkillsMarketNearBottom()) {
        return;
    }
    void loadNextSkillsMarketPage();
}

function isSkillsMarketNearBottom() {
    const threshold = 320;
    const content = els.projectViewContent;
    if (
        content
        && Number.isFinite(Number(content.scrollHeight))
        && Number(content.scrollHeight) > 0
    ) {
        const scrollTop = Number(content.scrollTop || 0);
        const clientHeight = Number(content.clientHeight || 0);
        const scrollHeight = Number(content.scrollHeight || 0);
        if (scrollHeight > clientHeight) {
            return scrollHeight - scrollTop - clientHeight <= threshold;
        }
    }
    const doc = globalThis.document?.documentElement;
    if (!doc) {
        return false;
    }
    const scrollTop = Number(globalThis.scrollY || doc.scrollTop || 0);
    const clientHeight = Number(globalThis.innerHeight || doc.clientHeight || 0);
    const scrollHeight = Number(doc.scrollHeight || 0);
    return scrollHeight > clientHeight && scrollHeight - scrollTop - clientHeight <= threshold;
}

function ensureSkillsModalRoot() {
    if (!document?.body) {
        return null;
    }
    if (!skillsModalRoot) {
        try {
            skillsModalRoot = document.getElementById('skills-feature-modal-root');
        } catch {
            skillsModalRoot = null;
        }
    }
    if (!skillsModalRoot && typeof document.createElement === 'function') {
        skillsModalRoot = document.createElement('div');
        skillsModalRoot.id = 'skills-feature-modal-root';
        skillsModalRoot.className = 'gateway-feature-modal-root skills-feature-modal-root';
        if (typeof document.body.appendChild === 'function') {
            document.body.appendChild(skillsModalRoot);
        }
    }
    return skillsModalRoot;
}

function closeSkillsModal() {
    skillsDetailRequestToken += 1;
    if (skillsModalRoot) {
        skillsModalRoot.innerHTML = '';
    }
}

function bindSkillsModalCloseHandlers(modalRoot) {
    modalRoot.querySelectorAll('[data-feature-skills-modal-close]').forEach(button => {
        button.addEventListener('click', closeSkillsModal);
    });
    modalRoot.querySelector('[data-feature-skills-modal]')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) {
            closeSkillsModal();
        }
    });
}

function renderSkillsModalCloseButton() {
    return `
        <button class="skills-modal-close-btn" type="button" aria-label="${escapeHtml(t('settings.action.close'))}" title="${escapeHtml(t('settings.action.close'))}" data-feature-skills-modal-close>
            <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
        </button>
    `;
}

function openSkillsClawHubSettingsModal() {
    const modalRoot = ensureSkillsModalRoot();
    if (!modalRoot) {
        return;
    }
    modalRoot.innerHTML = `
        <div class="modal gateway-feature-modal skills-clawhub-settings-modal" data-feature-skills-modal>
            <div class="modal-content gateway-feature-modal-content skills-clawhub-settings-modal-content" role="dialog" aria-modal="true" aria-labelledby="skills-clawhub-settings-title">
                <div class="modal-header gateway-feature-modal-header">
                    <div class="gateway-feature-modal-heading">
                        <h3 id="skills-clawhub-settings-title">${escapeHtml(t('feature.skills.clawhub_settings_title'))}</h3>
                        <p>${escapeHtml(t('feature.skills.clawhub_settings_meta'))}</p>
                    </div>
                    ${renderSkillsModalCloseButton()}
                </div>
                <div class="gateway-feature-modal-body skills-clawhub-settings-modal-body">
                    ${renderSkillsClawHubSettingsForm()}
                </div>
            </div>
        </div>
    `;
    bindSkillsModalCloseHandlers(modalRoot);
    bindClawHubSettingsHandlers(FEATURE_CLAWHUB_FIELD_IDS);
    void loadClawHubSettingsPanel(FEATURE_CLAWHUB_FIELD_IDS);
}

function openSkillDetailModal({ kind, key }) {
    const detail = resolveSkillDetail({ kind, key });
    if (!detail) {
        return;
    }
    const modalRoot = ensureSkillsModalRoot();
    if (!modalRoot) {
        return;
    }
    const detailRequestToken = ++skillsDetailRequestToken;
    modalRoot.innerHTML = renderSkillDetailModal(detail);
    bindSkillsModalCloseHandlers(modalRoot);
    if (detail.runtimeRef) {
        void loadSkillDetailMarkdown(detail.runtimeRef, detailRequestToken);
    } else if (detail.marketSlug) {
        void loadMarketSkillDetailMarkdown({
            slug: detail.marketSlug,
            version: detail.marketVersion,
            requestToken: detailRequestToken,
        });
    }
    modalRoot.querySelector('[data-feature-skills-detail-install]')?.addEventListener('click', event => {
        event?.stopPropagation?.();
        const target = event?.currentTarget || modalRoot.querySelector('[data-feature-skills-detail-install]');
        const slug = String(target?.getAttribute('data-feature-skills-detail-install') || '').trim();
        const version = String(target?.getAttribute('data-feature-skills-detail-version') || '').trim() || null;
        closeSkillsModal();
        void handleSkillsMarketInstall({ slug, version, force: false });
    });
    modalRoot.querySelector('[data-feature-skills-detail-uninstall]')?.addEventListener('click', event => {
        event?.stopPropagation?.();
        const target = event?.currentTarget || modalRoot.querySelector('[data-feature-skills-detail-uninstall]');
        const slug = String(target?.getAttribute('data-feature-skills-detail-uninstall') || '').trim();
        const mode = String(target?.getAttribute('data-feature-skills-detail-uninstall-mode') || '').trim();
        closeSkillsModal();
        if (mode === 'runtime') {
            void handleInstalledSkillUninstall({ skillRef: slug });
            return;
        }
        void handleSkillsMarketUninstall({ slug });
    });
}

function resolveSkillDetail({ kind, key }) {
    const normalizedKind = String(kind || '').trim();
    const normalizedKey = String(key || '').trim();
    const skills = Array.isArray(currentSkillsStatus?.skills?.skills)
        ? currentSkillsStatus.skills.skills
        : [];
    if (normalizedKind === 'market') {
        const item = resolveSkillsMarketItems(skills).find(candidate => String(candidate?.slug || '').trim() === normalizedKey);
        if (!item) {
            return null;
        }
        const slug = String(item?.slug || '').trim();
        const title = String(item?.title || slug).trim() || slug;
        return {
            kind: 'market',
            title,
            subtitle: slug,
            description: String(item?.summary || item?.description || ''),
            initial: title.slice(0, 1).toUpperCase() || 'S',
            installed: item?.installed === true,
            canInstall: item?.installed !== true,
            canUninstall: item?.installed === true,
            actionSlug: slug,
            version: String(item?.version || '').trim(),
            marketSlug: slug,
            marketVersion: String(item?.version || '').trim(),
            rows: [
                { label: t('feature.skills.detail_slug'), value: slug, code: true },
                { label: t('feature.skills.detail_version'), value: String(item?.version || '').trim() },
                {
                    label: t('feature.skills.detail_score'),
                    value: normalizeSearchQuery(currentSkillsFeatureState.searchQuery)
                        && Number.isFinite(Number(item?.score))
                        ? Number(item.score).toFixed(2)
                        : '',
                },
                {
                    label: t('feature.skills.market_installs_short'),
                    value: formatSkillsMarketCount(item?.stats?.installs_current ?? item?.stats?.installs_all_time),
                },
                {
                    label: t('feature.skills.market_stars_short'),
                    value: formatSkillsMarketCount(item?.stats?.stars),
                },
                { label: t('feature.skills.detail_source'), value: t('feature.skills.market_result') },
            ],
            runtimeRef: item?.installed === true ? resolveSkillsMarketRuntimeRef(item) : '',
        };
    }
    if (normalizedKind !== 'installed') {
        return null;
    }
    const skill = skills.find(candidate => resolveInstalledSkillKey(candidate) === normalizedKey);
    if (!skill) {
        return null;
    }
    const title = String(skill?.name || skill?.ref || normalizedKey).trim() || normalizedKey;
    const uninstallSlug = resolveSkillUninstallSlug(skill);
    return {
        kind: 'installed',
        title,
        subtitle: resolveSkillScopeLabel(skill?.source || skill?.scope),
        description: String(skill?.description || ''),
        initial: title.slice(0, 1).toUpperCase() || 'S',
        installed: true,
        canInstall: false,
        canUninstall: isInstalledSkillUninstallable(skill) && Boolean(uninstallSlug),
        uninstallMode: 'runtime',
        actionSlug: uninstallSlug,
        version: '',
        rows: [
            { label: t('feature.skills.detail_ref'), value: String(skill?.ref || '').trim(), code: true },
            { label: t('feature.skills.detail_source'), value: resolveSkillScopeLabel(skill?.source || skill?.scope) },
            { label: t('feature.skills.detail_path'), value: String(skill?.path || '').trim(), code: true },
            { label: t('feature.skills.detail_instruction_path'), value: String(skill?.instruction_path || '').trim(), code: true },
        ],
        runtimeRef: String(skill?.ref || skill?.name || '').trim(),
    };
}

function renderSkillDetailModal(detail) {
    return `
        <div class="modal gateway-feature-modal skills-detail-modal" data-feature-skills-modal>
            <div class="modal-content gateway-feature-modal-content skills-detail-modal-content" role="dialog" aria-modal="true" aria-labelledby="skills-detail-modal-title">
                <div class="modal-header gateway-feature-modal-header skills-detail-modal-header">
                    <div class="skills-detail-heading">
                        <div class="feature-skills-card-icon is-gray" aria-hidden="true">${escapeHtml(detail.initial)}</div>
                        <div>
                            <h3 id="skills-detail-modal-title">${escapeHtml(detail.title)}</h3>
                            <p>${escapeHtml(detail.subtitle)}</p>
                        </div>
                    </div>
                    <div class="skills-detail-header-actions">
                        ${renderSkillDetailAction(detail)}
                        ${renderSkillsModalCloseButton()}
                    </div>
                </div>
                <div class="gateway-feature-modal-body skills-detail-modal-body">
                    ${detail.description
                        ? `<p class="skills-detail-description">${escapeHtml(detail.description)}</p>`
                        : ''}
                    <div class="skills-detail-markdown-shell">
                        <div class="skills-detail-markdown msg-text" data-feature-skills-detail-markdown>
                            ${detail.runtimeRef || detail.marketSlug
                                ? escapeHtml(t('feature.skills.detail_loading_markdown'))
                                : escapeHtml(t('feature.skills.detail_no_markdown'))}
                        </div>
                    </div>
                    <dl class="skills-detail-list">
                        ${detail.rows.map(row => renderSkillDetailRow(row)).join('')}
                    </dl>
                </div>
            </div>
        </div>
    `;
}

async function loadSkillDetailMarkdown(skillRef, requestToken) {
    const normalizedRef = String(skillRef || '').trim();
    if (!normalizedRef) {
        return;
    }
    try {
        const detail = await fetchRuntimeSkillDetail(normalizedRef);
        if (requestToken !== skillsDetailRequestToken) {
            return;
        }
        const markdown = stripMarkdownFrontmatter(
            String(detail?.manifest_content || detail?.instructions || ''),
        ).trim();
        const markdownEl = skillsModalRoot?.querySelector?.('[data-feature-skills-detail-markdown]');
        if (!markdownEl) {
            return;
        }
        markdownEl.innerHTML = markdown
            ? sanitizeSkillMarkdownHtml(parseMarkdown(markdown))
            : escapeHtml(t('feature.skills.detail_no_markdown'));
    } catch (error) {
        if (requestToken !== skillsDetailRequestToken) {
            return;
        }
        const markdownEl = skillsModalRoot?.querySelector?.('[data-feature-skills-detail-markdown]');
        if (markdownEl) {
            markdownEl.textContent = String(error?.message || error || t('feature.skills.detail_markdown_failed'));
        }
        sysLog(`Failed to load skill detail ${normalizedRef}: ${error?.message || error}`, 'log-warn');
    }
}

async function loadMarketSkillDetailMarkdown({ slug, version = '', requestToken }) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) {
        return;
    }
    const normalizedVersion = String(version || '').trim();
    const cachedDetail = getSkillsMarketDetailCacheEntry(normalizedSlug, normalizedVersion);
    if (cachedDetail) {
        if (requestToken !== skillsDetailRequestToken) {
            return;
        }
        renderMarketSkillDetailMarkdown(cachedDetail);
        return;
    }
    try {
        const detail = await fetchClawHubSkillMarketDetail(normalizedSlug, {
            version: normalizedVersion,
        });
        const markdown = stripMarkdownFrontmatter(
            String(detail?.manifest_content || ''),
        ).trim();
        if (detail?.ok !== false && markdown) {
            writeSkillsMarketDetailCache({
                slug: normalizedSlug,
                version: normalizedVersion,
                markdown,
                summary: String(detail?.summary || ''),
                source: String(detail?.source || ''),
                errorMessage: String(detail?.error_message || ''),
            });
        }
        if (requestToken !== skillsDetailRequestToken) {
            return;
        }
        renderMarketSkillDetailMarkdown({
            markdown,
            errorMessage: String(detail?.error_message || ''),
        });
    } catch (error) {
        if (requestToken !== skillsDetailRequestToken) {
            return;
        }
        const markdownEl = skillsModalRoot?.querySelector?.('[data-feature-skills-detail-markdown]');
        if (markdownEl) {
            markdownEl.textContent = String(error?.message || error || t('feature.skills.detail_markdown_failed'));
        }
        sysLog(`Failed to load ClawHub skill detail ${normalizedSlug}: ${error?.message || error}`, 'log-warn');
    }
}

function renderMarketSkillDetailMarkdown(detail) {
    const markdownEl = skillsModalRoot?.querySelector?.('[data-feature-skills-detail-markdown]');
    if (!markdownEl) {
        return;
    }
    const markdown = String(detail?.markdown || '').trim();
    markdownEl.innerHTML = markdown
        ? sanitizeSkillMarkdownHtml(parseMarkdown(markdown))
        : escapeHtml(String(detail?.errorMessage || t('feature.skills.detail_markdown_failed')));
}

function sanitizeSkillMarkdownHtml(html) {
    const rawHtml = String(html || '');
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const template = document.createElement('template');
        if (template?.content && typeof template.content.querySelectorAll === 'function') {
            template.innerHTML = rawHtml;
            sanitizeSkillMarkdownFragment(template.content);
            return template.innerHTML;
        }
    }
    return sanitizeSkillMarkdownHtmlFallback(rawHtml);
}

function sanitizeSkillMarkdownFragment(fragment) {
    const blockedTags = new Set([
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'link',
        'meta',
        'svg',
        'math',
        'form',
        'input',
        'button',
        'select',
        'textarea',
    ]);
    fragment.querySelectorAll('*').forEach(element => {
        const tagName = String(element?.tagName || '').toLowerCase();
        if (blockedTags.has(tagName)) {
            element.remove();
            return;
        }
        Array.from(element.attributes || []).forEach(attribute => {
            const name = String(attribute?.name || '').toLowerCase();
            if (
                name === 'style'
                || name === 'srcdoc'
                || name.startsWith('on')
                || (['href', 'src'].includes(name) && !isSafeSkillMarkdownUrl(attribute?.value))
            ) {
                element.removeAttribute(attribute.name);
            }
        });
    });
}

function sanitizeSkillMarkdownHtmlFallback(html) {
    return String(html || '')
        .replace(/<(script|style|iframe|object|embed|svg|math|form|button|select|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(link|meta|input)\b[^>]*>/gi, '')
        .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
        .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function isSafeSkillMarkdownUrl(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return true;
    }
    if (normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) {
        return true;
    }
    try {
        const parsed = new URL(normalized, globalThis.location?.href || 'http://localhost/');
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function renderSkillDetailAction(detail) {
    if (detail.canInstall) {
        return `
            <button class="primary-btn feature-skills-detail-action" type="button" data-feature-skills-detail-install="${escapeHtml(detail.actionSlug)}" data-feature-skills-detail-version="${escapeHtml(detail.version || '')}">
                ${escapeHtml(t('feature.skills.install'))}
            </button>
        `;
    }
    if (detail.canUninstall) {
        return `
            <button class="secondary-btn danger-btn feature-skills-detail-action" type="button" data-feature-skills-detail-uninstall="${escapeHtml(detail.actionSlug)}" data-feature-skills-detail-uninstall-mode="${escapeHtml(detail.uninstallMode || 'market')}">
                ${escapeHtml(t('feature.skills.uninstall'))}
            </button>
        `;
    }
    return `<span class="profile-card-chip">${escapeHtml(t('feature.skills.installed'))}</span>`;
}

function renderSkillDetailRow(row) {
    const value = String(row?.value || '').trim();
    if (!value) {
        return '';
    }
    return `
        <div class="skills-detail-row">
            <dt>${escapeHtml(row.label)}</dt>
            <dd>${row.code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd>
        </div>
    `;
}

function focusSkillsSearchInput() {
    const input = els.projectViewToolbarActions?.querySelector?.('[data-feature-skills-search]');
    if (!input || typeof input.focus !== 'function') {
        return;
    }
    input.focus({ preventScroll: true });
    const valueLength = String(input.value || '').length;
    if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(valueLength, valueLength);
    }
}

function resolveSkillsMarketItems(installedSkills, options = {}) {
    const installedSkillsByIdentity = resolveInstalledClawHubSkillLookup(installedSkills);
    const preserveCachedInstalled = options?.preserveCachedInstalled === true
        || (options?.preserveCachedInstalled !== false && currentSkillsStatus === null);
    return (Array.isArray(currentSkillsFeatureState.marketItems)
        ? currentSkillsFeatureState.marketItems
        : []
    ).map(item => {
        const installedSkill = resolveMarketItemInstalledSkill(item, installedSkillsByIdentity);
        const normalizedInstalledSkill = preserveCachedInstalled
            ? normalizeSkillsMarketInstalledSkill(item?.installedSkill || item?.installed_skill)
            : null;
        const resolvedInstalledSkill = installedSkill || normalizedInstalledSkill;
        return {
            ...item,
            installed: preserveCachedInstalled
                ? item?.installed === true || Boolean(resolvedInstalledSkill)
                : Boolean(resolvedInstalledSkill),
            installedSkill: resolvedInstalledSkill || null,
            runtimeRef: resolveInstalledSkillRuntimeRef(resolvedInstalledSkill),
        };
    });
}

function reconcileSkillsMarketInstalledState(installedSkills) {
    const currentItems = Array.isArray(currentSkillsFeatureState.marketItems)
        ? currentSkillsFeatureState.marketItems
        : [];
    if (currentItems.length === 0) {
        return;
    }
    const reconciledItems = resolveSkillsMarketItems(installedSkills, {
        preserveCachedInstalled: false,
    });
    if (!hasSkillsMarketInstalledStateChanged(currentItems, reconciledItems)) {
        return;
    }
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketItems: reconciledItems,
    };
    if (
        currentSkillsFeatureState.marketStatus === 'loading'
        || currentSkillsFeatureState.marketStatus === 'loading_more'
    ) {
        return;
    }
    writeSkillsMarketCache({
        query: currentSkillsFeatureState.searchQuery,
        status: currentSkillsFeatureState.marketStatus,
        error: currentSkillsFeatureState.marketError,
        items: reconciledItems,
        limit: currentSkillsFeatureState.marketLimit,
        hasMore: currentSkillsFeatureState.marketHasMore,
        nextCursor: currentSkillsFeatureState.marketNextCursor,
    });
}

function hasSkillsMarketInstalledStateChanged(leftItems, rightItems) {
    if (leftItems.length !== rightItems.length) {
        return true;
    }
    return leftItems.some((leftItem, index) => {
        const rightItem = rightItems[index] || {};
        return (
            leftItem?.installed !== rightItem?.installed
            || String(leftItem?.runtimeRef || leftItem?.runtime_ref || '') !== String(rightItem?.runtimeRef || rightItem?.runtime_ref || '')
            || String(leftItem?.installedSkill?.runtime_name || leftItem?.installed_skill?.runtime_name || '') !== String(rightItem?.installedSkill?.runtime_name || rightItem?.installed_skill?.runtime_name || '')
            || String(leftItem?.installedSkill?.ref || leftItem?.installed_skill?.ref || '') !== String(rightItem?.installedSkill?.ref || rightItem?.installed_skill?.ref || '')
        );
    });
}

function filterInstalledSkills(skills) {
    const query = normalizeSearchQuery(currentSkillsFeatureState.searchQuery);
    if (!query) {
        return skills;
    }
    return skills.filter(skill => [
        skill?.name,
        skill?.ref,
        skill?.description,
        skill?.path,
        skill?.instruction_path,
        skill?.source,
        skill?.scope,
    ].join(' ').toLowerCase().includes(query));
}

function resolveInstalledClawHubSkillLookup(skills) {
    const lookup = new Map();
    (Array.isArray(skills) ? skills : [])
        .filter(isInstalledClawHubSkill)
        .forEach(skill => {
            getSkillIdentityValues(skill).forEach(value => {
                lookup.set(normalizeSkillIdentity(value), skill);
            });
        });
    return lookup;
}

function resolveMarketItemInstalledSkill(item, installedSkillsByIdentity) {
    if (!(installedSkillsByIdentity instanceof Map)) {
        return null;
    }
    for (const value of getMarketItemIdentityValues(item)) {
        const skill = installedSkillsByIdentity.get(normalizeSkillIdentity(value));
        if (skill) {
            return normalizeSkillsMarketInstalledSkill(skill);
        }
    }
    return null;
}

function getMarketItemIdentityValues(item) {
    const installedSkill = item?.installedSkill || item?.installed_skill || {};
    return [
        item?.slug,
        item?.title,
        item?.runtimeRef,
        item?.runtime_ref,
        installedSkill?.skill_id,
        installedSkill?.runtime_name,
        installedSkill?.ref,
    ].map(value => String(value || '').trim()).filter(Boolean);
}

function getSkillIdentityValues(skill) {
    return [
        skill?.ref,
        skill?.name,
        skill?.skill_id,
        skill?.id,
        skill?.runtime_name,
    ].map(value => String(value || '').trim()).filter(Boolean);
}

function normalizeSkillIdentity(value) {
    return String(value || '').trim().toLowerCase();
}

function isInstalledClawHubSkill(skill) {
    const source = String(skill?.source || skill?.scope || '').trim().toLowerCase();
    return source === 'user_relay_teams';
}

function normalizeSkillsMarketInstalledSkill(skill) {
    if (!skill) {
        return null;
    }
    const ref = String(skill?.ref || skill?.skill_id || skill?.name || '').trim();
    const runtimeName = String(skill?.runtime_name || skill?.name || ref).trim();
    const skillId = String(skill?.skill_id || skill?.id || skill?.ref || skill?.name || '').trim();
    if (!ref && !runtimeName && !skillId) {
        return null;
    }
    return {
        skill_id: skillId,
        runtime_name: runtimeName,
        ref,
        source: String(skill?.source || skill?.scope || '').trim(),
        path: String(skill?.path || skill?.directory || '').trim(),
        instruction_path: String(skill?.instruction_path || skill?.manifest_path || '').trim(),
    };
}

function resolveInstalledSkillRuntimeRef(skill) {
    return String(
        skill?.ref
        || skill?.runtimeRef
        || skill?.runtime_ref
        || skill?.skill_id
        || skill?.runtime_name
        || skill?.name
        || '',
    ).trim();
}

function resolveSkillsMarketRuntimeRef(item) {
    return resolveInstalledSkillRuntimeRef(item?.installedSkill || item?.installed_skill || item);
}

function resolveSkillsFeatureTab(tab) {
    const value = String(tab || '').trim();
    return value === SKILLS_FEATURE_TABS.installed
        ? SKILLS_FEATURE_TABS.installed
        : SKILLS_FEATURE_TABS.market;
}

function normalizeSearchQuery(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveSkillsMarketMode(query) {
    return normalizeSearchQuery(query) ? 'search' : 'browse';
}

function resolveSkillsMarketCacheKey(query, sort = SKILLS_MARKET_BROWSE_SORT) {
    const mode = resolveSkillsMarketMode(query);
    const normalizedQuery = normalizeSearchQuery(query);
    const normalizedSort = mode === 'browse'
        ? String(sort || SKILLS_MARKET_BROWSE_SORT).trim() || SKILLS_MARKET_BROWSE_SORT
        : '';
    return `${mode}:${normalizedSort}:${normalizedQuery}`;
}

function resolvePersistentStorage() {
    let storage = null;
    try {
        storage = globalThis.localStorage || globalThis.window?.localStorage || null;
    } catch {
        return null;
    }
    if (
        !storage
        || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function'
    ) {
        return null;
    }
    return storage;
}

function readPersistentJson(storageKey) {
    const storage = resolvePersistentStorage();
    if (!storage) {
        return null;
    }
    try {
        const rawValue = storage.getItem(storageKey);
        return rawValue ? JSON.parse(rawValue) : null;
    } catch {
        return null;
    }
}

function writePersistentJson(storageKey, payload) {
    const storage = resolvePersistentStorage();
    if (!storage) {
        return;
    }
    try {
        storage.setItem(storageKey, JSON.stringify(payload));
    } catch {
        // Ignore storage quota and restricted-runtime failures.
    }
}

function removePersistentJson(storageKey) {
    const storage = resolvePersistentStorage();
    if (!storage || typeof storage.removeItem !== 'function') {
        return;
    }
    try {
        storage.removeItem(storageKey);
    } catch {
        // Ignore restricted-runtime failures.
    }
}

function isFreshPersistentCacheEntry(entry, ttlMs, now = Date.now()) {
    const updatedAt = Number(entry?.updatedAt);
    return (
        Number.isFinite(updatedAt)
        && updatedAt > 0
        && updatedAt <= now + 60 * 1000
        && now - updatedAt <= ttlMs
    );
}

function ensureSkillsMarketCacheLoaded() {
    if (skillsMarketCacheStorageLoaded) {
        return;
    }
    skillsMarketCacheStorageLoaded = true;
    const payload = readPersistentJson(SKILLS_MARKET_CACHE_STORAGE_KEY);
    if (!payload) {
        return;
    }
    if (Number(payload?.version) !== SKILLS_MARKET_CACHE_VERSION || !Array.isArray(payload?.entries)) {
        removePersistentJson(SKILLS_MARKET_CACHE_STORAGE_KEY);
        return;
    }
    const now = Date.now();
    let droppedEntry = false;
    payload.entries.forEach(entry => {
        const cached = normalizeSkillsMarketCacheEntry(entry, now);
        if (!cached) {
            droppedEntry = true;
            return;
        }
        skillsMarketCache.set(cached.key, cached);
    });
    trimSkillsMarketCache();
    if (droppedEntry || skillsMarketCache.size !== payload.entries.length) {
        persistSkillsMarketCache();
    }
}

function normalizeSkillsMarketCacheEntry(entry, now = Date.now()) {
    const key = String(entry?.key || '').trim();
    if (!key || !isFreshPersistentCacheEntry(entry, SKILLS_MARKET_CACHE_TTL_MS, now)) {
        return null;
    }
    return {
        key,
        mode: String(entry?.mode || '').trim(),
        sort: String(entry?.sort || '').trim(),
        query: String(entry?.query || '').trim(),
        status: String(entry?.status || 'loaded'),
        error: String(entry?.error || ''),
        items: dedupeSkillsMarketItems(entry?.items),
        limit: clampSkillsMarketLimit(entry?.limit),
        hasMore: entry?.hasMore === true,
        nextCursor: String(entry?.nextCursor || ''),
        updatedAt: Number(entry.updatedAt),
    };
}

function getSkillsMarketCacheEntry(query) {
    ensureSkillsMarketCacheLoaded();
    return skillsMarketCache.get(resolveSkillsMarketCacheKey(query));
}

function trimSkillsMarketCache() {
    const entries = Array.from(skillsMarketCache.entries())
        .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0));
    entries.slice(SKILLS_MARKET_CACHE_MAX_ENTRIES).forEach(([key]) => {
        skillsMarketCache.delete(key);
    });
}

function persistSkillsMarketCache() {
    trimSkillsMarketCache();
    const entries = Array.from(skillsMarketCache.values())
        .sort((left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
        .slice(0, SKILLS_MARKET_CACHE_MAX_ENTRIES);
    writePersistentJson(SKILLS_MARKET_CACHE_STORAGE_KEY, {
        version: SKILLS_MARKET_CACHE_VERSION,
        entries,
    });
}

function restoreSkillsMarketStateFromCache(stateValue, query) {
    const cached = getSkillsMarketCacheEntry(query);
    if (!cached) {
        return {
            ...stateValue,
            marketQuery: String(query || '').trim(),
            marketStatus: 'idle',
            marketError: '',
            marketItems: [],
            marketLimit: SKILLS_MARKET_PAGE_SIZE,
            marketHasMore: true,
            marketNextCursor: '',
        };
    }
    return {
        ...stateValue,
        marketQuery: String(cached.query || query || '').trim(),
        marketStatus: String(cached.status || 'loaded'),
        marketError: String(cached.error || ''),
        marketItems: Array.isArray(cached.items) ? cached.items : [],
        marketLimit: clampSkillsMarketLimit(cached.limit),
        marketHasMore: cached.hasMore !== false,
        marketNextCursor: String(cached.nextCursor || ''),
    };
}

function shouldFetchSkillsMarket(query) {
    const cached = getSkillsMarketCacheEntry(query);
    return !cached || cached.status === 'error';
}

function writeSkillsMarketCache({ query, status, error = '', items = [], limit, hasMore = true, nextCursor = '' }) {
    ensureSkillsMarketCacheLoaded();
    const key = resolveSkillsMarketCacheKey(query);
    const mode = resolveSkillsMarketMode(query);
    skillsMarketCache.set(key, {
        key,
        mode,
        sort: mode === 'browse' ? SKILLS_MARKET_BROWSE_SORT : '',
        query: String(query || '').trim(),
        status: String(status || 'loaded'),
        error: String(error || ''),
        items: dedupeSkillsMarketItems(items),
        limit: clampSkillsMarketLimit(limit),
        hasMore: hasMore === true,
        nextCursor: String(nextCursor || ''),
        updatedAt: Date.now(),
    });
    persistSkillsMarketCache();
}

function resolveSkillsMarketDetailCacheKey(slug, version = '') {
    const normalizedSlug = String(slug || '').trim();
    const normalizedVersion = String(version || '').trim() || 'latest';
    return `${normalizedSlug}@${normalizedVersion}`;
}

function ensureSkillsMarketDetailCacheLoaded() {
    if (skillsMarketDetailCacheStorageLoaded) {
        return;
    }
    skillsMarketDetailCacheStorageLoaded = true;
    const payload = readPersistentJson(SKILLS_MARKET_DETAIL_CACHE_STORAGE_KEY);
    if (!payload) {
        return;
    }
    if (Number(payload?.version) !== SKILLS_MARKET_CACHE_VERSION || !Array.isArray(payload?.entries)) {
        removePersistentJson(SKILLS_MARKET_DETAIL_CACHE_STORAGE_KEY);
        return;
    }
    const now = Date.now();
    let droppedEntry = false;
    payload.entries.forEach(entry => {
        const cached = normalizeSkillsMarketDetailCacheEntry(entry, now);
        if (!cached) {
            droppedEntry = true;
            return;
        }
        skillsMarketDetailCache.set(cached.key, cached);
    });
    trimSkillsMarketDetailCache();
    if (droppedEntry || skillsMarketDetailCache.size !== payload.entries.length) {
        persistSkillsMarketDetailCache();
    }
}

function normalizeSkillsMarketDetailCacheEntry(entry, now = Date.now()) {
    const key = String(entry?.key || '').trim();
    const slug = String(entry?.slug || '').trim();
    const markdown = String(entry?.markdown || '').trim();
    if (!key || !slug || !markdown || !isFreshPersistentCacheEntry(entry, SKILLS_MARKET_DETAIL_CACHE_TTL_MS, now)) {
        return null;
    }
    return {
        key,
        slug,
        version: String(entry?.version || '').trim(),
        markdown,
        summary: String(entry?.summary || ''),
        source: String(entry?.source || ''),
        errorMessage: String(entry?.errorMessage || ''),
        updatedAt: Number(entry.updatedAt),
    };
}

function getSkillsMarketDetailCacheEntry(slug, version = '') {
    ensureSkillsMarketDetailCacheLoaded();
    return skillsMarketDetailCache.get(resolveSkillsMarketDetailCacheKey(slug, version));
}

function writeSkillsMarketDetailCache({ slug, version = '', markdown = '', summary = '', source = '', errorMessage = '' }) {
    ensureSkillsMarketDetailCacheLoaded();
    const normalizedMarkdown = String(markdown || '').trim();
    if (!normalizedMarkdown) {
        return;
    }
    const key = resolveSkillsMarketDetailCacheKey(slug, version);
    skillsMarketDetailCache.set(key, {
        key,
        slug: String(slug || '').trim(),
        version: String(version || '').trim(),
        markdown: normalizedMarkdown,
        summary: String(summary || ''),
        source: String(source || ''),
        errorMessage: String(errorMessage || ''),
        updatedAt: Date.now(),
    });
    persistSkillsMarketDetailCache();
}

function trimSkillsMarketDetailCache() {
    const entries = Array.from(skillsMarketDetailCache.entries())
        .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0));
    entries.slice(SKILLS_MARKET_DETAIL_CACHE_MAX_ENTRIES).forEach(([key]) => {
        skillsMarketDetailCache.delete(key);
    });
}

function persistSkillsMarketDetailCache() {
    trimSkillsMarketDetailCache();
    const entries = Array.from(skillsMarketDetailCache.values())
        .sort((left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
        .slice(0, SKILLS_MARKET_DETAIL_CACHE_MAX_ENTRIES);
    writePersistentJson(SKILLS_MARKET_DETAIL_CACHE_STORAGE_KEY, {
        version: SKILLS_MARKET_CACHE_VERSION,
        entries,
    });
}

function clampSkillsMarketLimit(limit) {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
        return SKILLS_MARKET_PAGE_SIZE;
    }
    return Math.min(SKILLS_MARKET_MAX_LIMIT, Math.max(SKILLS_MARKET_PAGE_SIZE, Math.floor(numericLimit)));
}

function dedupeSkillsMarketItems(items) {
    const seen = new Set();
    const result = [];
    for (const item of Array.isArray(items) ? items : []) {
        const slug = String(item?.slug || '').trim();
        if (!slug || seen.has(slug)) {
            continue;
        }
        seen.add(slug);
        result.push(item);
    }
    return result;
}

function clearSkillsMarketSearchTimer() {
    if (!skillsMarketSearchTimer) {
        return;
    }
    globalThis.clearTimeout(skillsMarketSearchTimer);
    skillsMarketSearchTimer = null;
}

function cancelSkillsFeatureAsyncWork() {
    clearSkillsMarketSearchTimer();
    skillsMarketRequestToken += 1;
    skillsDetailRequestToken += 1;
}

function isSkillsMarketViewActive() {
    return (
        currentProjectViewMode === 'feature'
        && currentFeatureViewId === FEATURE_VIEW_IDS.skills
        && resolveSkillsFeatureTab(currentSkillsFeatureState.activeTab) === SKILLS_FEATURE_TABS.market
    );
}

function isCurrentSkillsMarketSearchResponse(requestToken, query) {
    return (
        requestToken === skillsMarketRequestToken
        && currentFeatureViewId === FEATURE_VIEW_IDS.skills
        && normalizeSearchQuery(currentSkillsFeatureState.searchQuery) === normalizeSearchQuery(query)
    );
}

function scheduleSkillsMarketSearch(rawQuery) {
    clearSkillsMarketSearchTimer();
    const query = String(rawQuery || '').trim();
    skillsMarketSearchTimer = globalThis.setTimeout(() => {
        skillsMarketSearchTimer = null;
        if (!isSkillsMarketViewActive()) {
            return;
        }
        void runSkillsMarketSearchNow(query, { force: true });
    }, SKILLS_MARKET_SEARCH_DELAY_MS);
}

async function loadNextSkillsMarketPage() {
    if (
        currentSkillsFeatureState.marketStatus === 'loading'
        || currentSkillsFeatureState.marketStatus === 'loading_more'
        || !currentSkillsFeatureState.marketHasMore
    ) {
        return;
    }
    const query = String(currentSkillsFeatureState.searchQuery || '').trim();
    if (!normalizeSearchQuery(query)) {
        const cursor = String(currentSkillsFeatureState.marketNextCursor || '').trim();
        if (!cursor) {
            return;
        }
        await runSkillsMarketSearchNow(query, {
            force: true,
            limit: SKILLS_MARKET_PAGE_SIZE,
            loadingMore: true,
            cursor,
        });
        return;
    }
    const currentLimit = clampSkillsMarketLimit(currentSkillsFeatureState.marketLimit);
    const nextLimit = clampSkillsMarketLimit(currentLimit + SKILLS_MARKET_PAGE_SIZE);
    if (nextLimit <= currentLimit) {
        return;
    }
    await runSkillsMarketSearchNow(query, {
        force: true,
        limit: nextLimit,
        loadingMore: true,
    });
}

async function runSkillsMarketSearchNow(rawQuery, options = {}) {
    clearSkillsMarketSearchTimer();
    if (!isSkillsMarketViewActive()) {
        return;
    }
    const query = String(rawQuery || '').trim();
    const browseMode = !normalizeSearchQuery(query);
    const requestedLimit = clampSkillsMarketLimit(options.limit || SKILLS_MARKET_PAGE_SIZE);
    if (options.force !== true) {
        const cached = getSkillsMarketCacheEntry(query);
        if (cached && cached.status !== 'error' && clampSkillsMarketLimit(cached.limit) >= requestedLimit) {
            currentSkillsFeatureState = restoreSkillsMarketStateFromCache({
                ...currentSkillsFeatureState,
                searchQuery: query,
            }, query);
            renderSkillsFeatureView();
            focusSkillsSearchInput();
            return;
        }
    }
    const requestToken = ++skillsMarketRequestToken;
    const loadingMore = options.loadingMore === true && currentSkillsFeatureState.marketItems.length > 0;
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        searchQuery: query,
        marketQuery: query,
        marketStatus: loadingMore ? 'loading_more' : 'loading',
        marketError: '',
        marketLimit: requestedLimit,
    };
    renderSkillsFeatureView();
    focusSkillsSearchInput();
    try {
        const response = browseMode
            ? await fetchClawHubSkillMarket({
                limit: requestedLimit,
                cursor: options.cursor,
                sort: SKILLS_MARKET_BROWSE_SORT,
            })
            : await searchClawHubSkillMarket(query, {
                limit: requestedLimit,
            });
        if (!isCurrentSkillsMarketSearchResponse(requestToken, query)) {
            return;
        }
        const responseItems = dedupeSkillsMarketItems(Array.isArray(response?.items) ? response.items : []);
        const items = browseMode && loadingMore
            ? dedupeSkillsMarketItems([
                ...currentSkillsFeatureState.marketItems,
                ...responseItems,
            ])
            : responseItems;
        const nextCursor = browseMode ? String(response?.next_cursor || '').trim() : '';
        const hasMore = response?.ok !== false && (
            browseMode
                ? Boolean(nextCursor)
                : items.length >= requestedLimit && requestedLimit < SKILLS_MARKET_MAX_LIMIT
        );
        const cacheLimit = browseMode ? Math.max(items.length, requestedLimit) : requestedLimit;
        writeSkillsMarketCache({
            query,
            status: response?.ok === false ? 'error' : 'loaded',
            error: response?.ok === false
                ? String(response?.error_message || t('feature.skills.market_error_copy'))
                : '',
            items,
            limit: cacheLimit,
            hasMore,
            nextCursor,
        });
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            marketQuery: query,
            marketStatus: response?.ok === false ? 'error' : 'loaded',
            marketError: response?.ok === false
                ? String(response?.error_message || t('feature.skills.market_error_copy'))
                : '',
            marketItems: items,
            marketLimit: cacheLimit,
            marketHasMore: hasMore,
            marketNextCursor: nextCursor,
        };
        renderSkillsFeatureView();
        focusSkillsSearchInput();
    } catch (error) {
        if (!isCurrentSkillsMarketSearchResponse(requestToken, query)) {
            return;
        }
        writeSkillsMarketCache({
            query,
            status: 'error',
            error: String(error?.message || error || t('feature.skills.market_error_copy')),
            items: currentSkillsFeatureState.marketItems,
            limit: requestedLimit,
            hasMore: currentSkillsFeatureState.marketHasMore,
            nextCursor: currentSkillsFeatureState.marketNextCursor,
        });
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            marketQuery: query,
            marketStatus: 'error',
            marketError: String(error?.message || error || t('feature.skills.market_error_copy')),
            marketLimit: requestedLimit,
        };
        renderSkillsFeatureView();
        focusSkillsSearchInput();
        sysLog(`Failed to search ClawHub skills: ${error?.message || error}`, 'log-warn');
    }
}

async function handleSkillsMarketInstall({ slug, version = null, force = false }) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug || currentSkillsFeatureState.marketInstallJobs?.[normalizedSlug]) {
        return;
    }
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketInstallJobs: {
            ...currentSkillsFeatureState.marketInstallJobs,
            [normalizedSlug]: 'installing',
        },
    };
    renderSkillsFeatureView();
    try {
        const response = await installClawHubMarketSkill({
            slug: normalizedSlug,
            version: String(version || '').trim() || null,
            force: force === true,
        });
        if (response?.ok === false) {
            showToast({
                title: t('feature.skills.install_failed'),
                message: String(response?.error_message || t('feature.skills.install_failed_copy')),
                tone: 'danger',
            });
            return;
        }
        markSkillsMarketItemInstalled(response, normalizedSlug);
        await refreshSkillsFeatureStatus();
        showToast({
            title: t('feature.skills.install_success'),
            message: formatMessage('feature.skills.install_success_copy', {
                skill: resolveInstalledSkillName(response, normalizedSlug),
            }),
            tone: 'success',
        });
    } catch (error) {
        showToast({
            title: t('feature.skills.install_failed'),
            message: String(error?.message || error || t('feature.skills.install_failed_copy')),
            tone: 'danger',
        });
        sysLog(`Failed to install ClawHub skill ${normalizedSlug}: ${error?.message || error}`, 'log-warn');
    } finally {
        const nextJobs = { ...currentSkillsFeatureState.marketInstallJobs };
        delete nextJobs[normalizedSlug];
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            marketInstallJobs: nextJobs,
        };
        if (currentFeatureViewId === FEATURE_VIEW_IDS.skills) {
            renderSkillsFeatureView();
        }
    }
}

async function handleSkillsMarketUninstall({ slug }) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug || currentSkillsFeatureState.marketInstallJobs?.[normalizedSlug]) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('feature.skills.uninstall_dialog_title'),
        message: formatMessage('feature.skills.uninstall_dialog_message', { skill: normalizedSlug }),
        tone: 'danger',
        confirmLabel: t('feature.skills.uninstall'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketInstallJobs: {
            ...currentSkillsFeatureState.marketInstallJobs,
            [normalizedSlug]: 'uninstalling',
        },
    };
    renderSkillsFeatureView();
    try {
        const response = await uninstallClawHubMarketSkill(normalizedSlug);
        if (response?.ok === false) {
            showToast({
                title: t('feature.skills.uninstall_failed'),
                message: String(response?.error_message || t('feature.skills.uninstall_failed_copy')),
                tone: 'danger',
            });
            return;
        }
        markSkillsMarketItemUninstalled(normalizedSlug, response);
        await refreshSkillsFeatureStatus();
        showToast({
            title: t('feature.skills.uninstall_success'),
            message: formatMessage('feature.skills.uninstall_success_copy', { skill: normalizedSlug }),
            tone: 'success',
        });
    } catch (error) {
        showToast({
            title: t('feature.skills.uninstall_failed'),
            message: String(error?.message || error || t('feature.skills.uninstall_failed_copy')),
            tone: 'danger',
        });
        sysLog(`Failed to uninstall ClawHub skill ${normalizedSlug}: ${error?.message || error}`, 'log-warn');
    } finally {
        const nextJobs = { ...currentSkillsFeatureState.marketInstallJobs };
        delete nextJobs[normalizedSlug];
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            marketInstallJobs: nextJobs,
        };
        if (currentFeatureViewId === FEATURE_VIEW_IDS.skills) {
            renderSkillsFeatureView();
        }
    }
}

async function handleInstalledSkillUninstall({ skillRef }) {
    const normalizedRef = String(skillRef || '').trim();
    if (!normalizedRef || currentSkillsFeatureState.marketInstallJobs?.[normalizedRef]) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('feature.skills.uninstall_dialog_title'),
        message: formatMessage('feature.skills.uninstall_dialog_message', { skill: normalizedRef }),
        tone: 'danger',
        confirmLabel: t('feature.skills.uninstall'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketInstallJobs: {
            ...currentSkillsFeatureState.marketInstallJobs,
            [normalizedRef]: 'uninstalling',
        },
    };
    renderSkillsFeatureView();
    try {
        const response = await uninstallRuntimeSkill(normalizedRef);
        if (response?.ok === false) {
            showToast({
                title: t('feature.skills.uninstall_failed'),
                message: String(response?.error_message || t('feature.skills.uninstall_failed_copy')),
                tone: 'danger',
            });
            return;
        }
        markSkillsMarketItemUninstalled(normalizedRef, response);
        await refreshSkillsFeatureStatus();
        showToast({
            title: t('feature.skills.uninstall_success'),
            message: formatMessage('feature.skills.uninstall_success_copy', { skill: normalizedRef }),
            tone: 'success',
        });
    } catch (error) {
        showToast({
            title: t('feature.skills.uninstall_failed'),
            message: String(error?.message || error || t('feature.skills.uninstall_failed_copy')),
            tone: 'danger',
        });
        sysLog(`Failed to uninstall skill ${normalizedRef}: ${error?.message || error}`, 'log-warn');
    } finally {
        const nextJobs = { ...currentSkillsFeatureState.marketInstallJobs };
        delete nextJobs[normalizedRef];
        currentSkillsFeatureState = {
            ...currentSkillsFeatureState,
            marketInstallJobs: nextJobs,
        };
        if (currentFeatureViewId === FEATURE_VIEW_IDS.skills) {
            renderSkillsFeatureView();
        }
    }
}

async function openSkillsMarketInstallDialog() {
    const result = await showFormDialog({
        title: t('feature.skills.install_dialog_title'),
        message: t('feature.skills.install_dialog_message'),
        confirmLabel: t('feature.skills.install'),
        fields: [
            {
                id: 'slug',
                label: t('feature.skills.install_slug'),
                placeholder: t('feature.skills.install_slug_placeholder'),
            },
            {
                id: 'version',
                label: t('feature.skills.install_version'),
                placeholder: t('feature.skills.install_version_placeholder'),
            },
            {
                id: 'force',
                type: 'checkbox',
                label: t('feature.skills.install_force'),
                description: t('feature.skills.install_force_copy'),
                value: false,
            },
        ],
        submitHandler: async values => {
            const slug = String(values?.slug || '').trim();
            if (!slug) {
                throw new Error(t('feature.skills.install_slug_required'));
            }
            const response = await installClawHubMarketSkill({
                slug,
                version: String(values?.version || '').trim() || null,
                force: values?.force === true,
            });
            if (response?.ok === false) {
                throw new Error(String(response?.error_message || t('feature.skills.install_failed_copy')));
            }
            markSkillsMarketItemInstalled(response, slug);
            await refreshSkillsFeatureStatus();
            return response;
        },
    });
    if (!result) {
        return;
    }
    showToast({
        title: t('feature.skills.install_success'),
        message: formatMessage('feature.skills.install_success_copy', {
            skill: resolveInstalledSkillName(result, String(result?.slug || '')),
        }),
        tone: 'success',
    });
}

function markSkillsMarketItemInstalled(response, fallbackSlug) {
    const installedSkill = normalizeSkillsMarketInstalledSkill(response?.installed_skill);
    const installedRefs = resolveInstallResponseIdentitySet(response, fallbackSlug);
    const markItemInstalled = item => {
        if (!skillsMarketItemMatchesIdentitySet(item, installedRefs)) {
            return item;
        }
        return {
            ...item,
            installed: true,
            installedSkill,
            runtimeRef: resolveInstalledSkillRuntimeRef(installedSkill),
        };
    };
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketItems: currentSkillsFeatureState.marketItems.map(markItemInstalled),
    };
    updateSkillsMarketCacheItems(markItemInstalled);
}

function markSkillsMarketItemUninstalled(slug, response = null) {
    const identitySet = resolveUninstallResponseIdentitySet(response, slug);
    if (identitySet.size <= 0) {
        return;
    }
    const markItemUninstalled = item => {
        if (!skillsMarketItemMatchesIdentitySet(item, identitySet)) {
            return item;
        }
        return {
            ...item,
            installed: false,
            installedSkill: null,
            runtimeRef: '',
        };
    };
    currentSkillsFeatureState = {
        ...currentSkillsFeatureState,
        marketItems: currentSkillsFeatureState.marketItems.map(markItemUninstalled),
    };
    updateSkillsMarketCacheItems(markItemUninstalled);
}

function resolveInstallResponseIdentitySet(response, fallbackSlug) {
    return new Set([
        fallbackSlug,
        response?.slug,
        response?.installed_skill?.skill_id,
        response?.installed_skill?.runtime_name,
        response?.installed_skill?.ref,
    ].map(normalizeSkillIdentity).filter(Boolean));
}

function resolveUninstallResponseIdentitySet(response, fallbackRef) {
    return new Set([
        fallbackRef,
        response?.slug,
        response?.ref,
        response?.skill_ref,
        response?.installed_skill?.skill_id,
        response?.installed_skill?.runtime_name,
        response?.installed_skill?.ref,
    ].map(normalizeSkillIdentity).filter(Boolean));
}

function skillsMarketItemMatchesIdentitySet(item, identitySet) {
    if (!(identitySet instanceof Set) || identitySet.size <= 0) {
        return false;
    }
    return getMarketItemIdentityValues(item)
        .map(normalizeSkillIdentity)
        .some(value => identitySet.has(value));
}

function updateSkillsMarketCacheItems(mapper) {
    ensureSkillsMarketCacheLoaded();
    skillsMarketCache.forEach((cached, key) => {
        const items = Array.isArray(cached?.items) ? cached.items : [];
        skillsMarketCache.set(key, {
            ...cached,
            items: items.map(mapper),
        });
    });
    persistSkillsMarketCache();
}

function resolveInstalledSkillName(response, fallbackSlug) {
    return String(
        response?.installed_skill?.runtime_name
        || response?.installed_skill?.ref
        || response?.installed_skill?.skill_id
        || response?.slug
        || fallbackSlug
        || '',
    ).trim();
}

function resolveInstalledSkillKey(skill) {
    return String(
        skill?.skill_id
        || skill?.id
        || skill?.ref
        || skill?.name
        || skill?.path
        || skill?.instruction_path
        || '',
    ).trim();
}

function resolveSkillUninstallSlug(skill) {
    return String(
        skill?.skill_id
        || skill?.ref
        || skill?.name
        || '',
    ).trim();
}

function isInstalledSkillUninstallable(skill) {
    const source = String(skill?.source || skill?.scope || '').trim().toLowerCase();
    return [
        'user_relay_teams',
        'user_agents',
        'user_claude',
        'user_codex',
        'user_opencode',
        'user',
    ].includes(source);
}

async function refreshSkillsFeatureStatus() {
    try {
        const status = await fetchConfigStatus();
        if (currentFeatureViewId !== FEATURE_VIEW_IDS.skills) {
            return;
        }
        currentSkillsStatus = status;
        renderSkillsFeatureView();
    } catch (error) {
        sysLog(`Failed to refresh skills status: ${error?.message || error}`, 'log-warn');
    }
}

function renderAutomationHomeView() {
    const projects = Array.isArray(currentAutomationProjects) ? currentAutomationProjects : [];
    const detail = currentAutomationHomeDetail?.project ? currentAutomationHomeDetail : createInitialAutomationHomeDetail();
    const selectedProjectId = String(detail?.project?.automation_project_id || selectedAutomationHomeProjectId || '').trim();
    const automationSummary = currentAutomationFeatureSection === 'github'
        ? formatMessage('feature.automation.github_summary', {
            accounts: currentGitHubFeatureState.accounts.length,
            repos: currentGitHubFeatureState.repos.length,
            rules: currentGitHubFeatureState.rules.length,
        })
        : resolveAutomationSummary(projects);
    renderToolbar(null, {
        title: t('feature.automation.title'),
        mode: 'feature',
        summary: automationSummary,
        actions: `
            <div class="feature-inline-actions">
                <button class="secondary-btn project-view-toolbar-btn feature-section-tab${currentAutomationFeatureSection === 'schedules' ? ' is-active' : ''}" type="button" data-automation-section="schedules">${escapeHtml(t('feature.automation.section_schedules'))}</button>
                <button class="secondary-btn project-view-toolbar-btn feature-section-tab${currentAutomationFeatureSection === 'github' ? ' is-active' : ''}" type="button" data-automation-section="github">${escapeHtml(t('feature.automation.section_github'))}</button>
                ${currentAutomationFeatureSection === 'github'
                    ? `<button class="secondary-btn project-view-toolbar-btn" type="button" data-github-account-create>${escapeHtml(t('feature.automation.github_new_account'))}</button>`
                    : `<button class="secondary-btn project-view-toolbar-btn" type="button" data-feature-automation-create>${escapeHtml(t('feature.automation.create'))}</button>`
                }
            </div>
        `,
    });
    if (!els.projectViewContent) {
        return;
    }
    if (currentAutomationFeatureSection === 'github') {
        els.projectViewContent.innerHTML = renderGitHubAutomationView();
        bindAutomationFeatureSectionButtons();
        bindGitHubAutomationView();
        return;
    }
    els.projectViewContent.innerHTML = `
        <div class="feature-page feature-page-neutral automation-home-page">
            <div class="automation-home-shell">
                <section class="workspace-view-panel feature-list-panel automation-list-panel">
                    <div class="feature-panel-body">
                    ${projects.length > 0 ? `
                        <div class="automation-record-list">
                            ${projects.map(project => {
                                const projectId = String(project?.automation_project_id || '').trim();
                                const status = String(project?.status || 'disabled').trim() || 'disabled';
                                return `
                                    <button class="automation-record${projectId === selectedProjectId ? ' is-active' : ''}" type="button" data-automation-home-project-id="${escapeHtml(projectId)}">
                                        <div class="automation-record-copy">
                                            <strong>${escapeHtml(String(project?.display_name || project?.name || projectId))}</strong>
                                            <span>${escapeHtml(describeAutomationScheduleText(project))}</span>
                                        </div>
                                        ${renderFeatureStatusPill(t(`automation.status.${status}`), status)}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    ` : renderFeatureEmptyState(
                        t('feature.automation.empty'),
                        t('feature.automation.empty_copy'),
                    )}
                    </div>
                </section>
                <section class="workspace-view-panel feature-detail-panel automation-detail-panel-surface">
                    <div class="feature-panel-body feature-panel-body-tight">
                    ${detail?.project ? renderAutomationHomeDetail(detail) : renderFeatureEmptyState(
                        t('feature.automation.empty'),
                        t('feature.automation.select'),
                    )}
                    </div>
                </section>
            </div>
        </div>
    `;
    bindAutomationFeatureSectionButtons();
    els.projectViewToolbarActions?.querySelector('[data-feature-automation-create]')?.addEventListener('click', () => {
        void handleAutomationCreateFeature();
    });
    els.projectViewContent.querySelectorAll('[data-automation-home-project-id]').forEach(button => {
        button.addEventListener('click', () => {
            void handleAutomationSelectFeatureProject(button.getAttribute('data-automation-home-project-id'));
        });
    });
    els.projectViewContent.querySelector('[data-automation-edit]')?.addEventListener('click', () => {
        void handleAutomationEditFeatureProject();
    });
    els.projectViewContent.querySelector('[data-automation-run]')?.addEventListener('click', () => {
        void handleAutomationRunFeatureProject();
    });
    els.projectViewContent.querySelector('[data-automation-toggle]')?.addEventListener('click', () => {
        void handleAutomationToggleFeatureProject();
    });
    els.projectViewContent.querySelector('[data-automation-delete]')?.addEventListener('click', () => {
        void handleAutomationDeleteFeatureProject();
    });
    els.projectViewContent.querySelectorAll('[data-automation-session-id]').forEach(node => {
        node.addEventListener('click', () => {
            const sessionId = String(node.getAttribute('data-automation-session-id') || '').trim();
            if (!sessionId) {
                return;
            }
            document.dispatchEvent(new CustomEvent('agent-teams-select-session', { detail: { sessionId } }));
        });
    });
}

function bindAutomationFeatureSectionButtons() {
    els.projectViewToolbarActions?.querySelectorAll('[data-automation-section]').forEach(button => {
        button.addEventListener('click', () => {
            const section = String(button.getAttribute('data-automation-section') || '').trim();
            if (section === 'github') {
                void openAutomationGitHubView(currentGitHubFeatureNodeKey);
                return;
            }
            void openAutomationHomeView(selectedAutomationHomeProjectId);
        });
    });
}

function renderGitHubAutomationView() {
    return `
        <div class="feature-page feature-page-neutral automation-home-page github-automation-page">
            <div class="automation-home-shell">
                <section class="workspace-view-panel feature-list-panel automation-list-panel">
                    <div class="feature-panel-body">
                        ${renderGitHubAutomationList()}
                    </div>
                </section>
                <section class="workspace-view-panel feature-detail-panel automation-detail-panel-surface">
                    <div class="feature-panel-body feature-panel-body-tight">
                        ${renderGitHubAutomationDetail()}
                    </div>
                </section>
            </div>
        </div>
    `;
}

function renderGitHubAutomationList() {
    const accounts = Array.isArray(currentGitHubFeatureState.accounts)
        ? currentGitHubFeatureState.accounts
        : [];
    return `
        <div class="automation-record-list github-automation-tree">
            <button class="automation-record${currentGitHubFeatureNodeKey === 'access' ? ' is-active' : ''}" type="button" data-github-node-key="access">
                <div class="automation-record-copy">
                    <strong>${escapeHtml(t('feature.automation.github_access'))}</strong>
                    <span>${escapeHtml(t('feature.automation.github_access_copy'))}</span>
                </div>
                ${renderFeatureStatusPill(t('feature.automation.github_access_status'), 'neutral')}
            </button>
            ${accounts.length > 0 ? accounts.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const repos = getGitHubReposForAccount(accountId);
                const accountStatus = String(account?.status || 'disabled').trim() || 'disabled';
                return `
                    <div class="github-automation-group">
                        <button class="automation-record${currentGitHubFeatureNodeKey === `account:${accountId}` ? ' is-active' : ''}" type="button" data-github-node-key="${escapeHtml(`account:${accountId}`)}">
                            <div class="automation-record-copy">
                                <strong>${escapeHtml(resolveGitHubAccountLabel(account))}</strong>
                                <span>${escapeHtml(String(account?.name || accountId))}</span>
                            </div>
                            ${renderFeatureStatusPill(t(`automation.status.${accountStatus}`), accountStatus)}
                        </button>
                        ${repos.map(repo => renderGitHubRepoListButton(repo, { child: true })).join('')}
                    </div>
                `;
            }).join('') : renderFeatureEmptyState(
                t('feature.automation.github_no_accounts'),
                t('feature.automation.github_no_accounts_copy'),
            )}
        </div>
    `;
}

function renderGitHubAutomationDetail() {
    const parsedNode = parseGitHubFeatureNodeKey(currentGitHubFeatureNodeKey);
    if (parsedNode.kind === 'account') {
        const account = findGitHubAccountById(parsedNode.id);
        if (account) {
            return renderGitHubAccountDetail(account);
        }
    }
    if (parsedNode.kind === 'repo') {
        const repo = findGitHubRepoById(parsedNode.id);
        if (repo) {
            return renderGitHubRepoDetail(repo);
        }
    }
    return renderGitHubAccessDetail();
}

function renderGitHubAccessDetail() {
    return `
        <div class="automation-home-detail github-automation-detail">
            <div class="feature-detail-head automation-detail-head">
                <div class="automation-detail-copy">
                    <div class="feature-detail-title-row">
                        <h3>${escapeHtml(t('feature.automation.github_access'))}</h3>
                        ${renderFeatureStatusPill(t('feature.automation.github_access_status'), 'neutral')}
                    </div>
                    <div class="automation-prompt-inline">${escapeHtml(t('feature.automation.github_access_copy'))}</div>
                </div>
            </div>
            <div class="feature-card-grid">
                <article class="feature-card">
                    <div class="feature-card-header">
                        <div>
                            <h4>${escapeHtml(t('feature.automation.github_summary_accounts'))}</h4>
                        </div>
                    </div>
                    <div class="feature-meta-list">
                        <div><strong>${escapeHtml(String(currentGitHubFeatureState.accounts.length))}</strong></div>
                    </div>
                </article>
                <article class="feature-card">
                    <div class="feature-card-header">
                        <div>
                            <h4>${escapeHtml(t('feature.automation.github_summary_repos'))}</h4>
                        </div>
                    </div>
                    <div class="feature-meta-list">
                        <div><strong>${escapeHtml(String(currentGitHubFeatureState.repos.length))}</strong></div>
                    </div>
                </article>
                <article class="feature-card">
                    <div class="feature-card-header">
                        <div>
                            <h4>${escapeHtml(t('feature.automation.github_summary_rules'))}</h4>
                        </div>
                    </div>
                    <div class="feature-meta-list">
                        <div><strong>${escapeHtml(String(currentGitHubFeatureState.rules.length))}</strong></div>
                    </div>
                </article>
            </div>
            <article class="feature-card github-access-card">
                <div class="feature-card-header">
                    <div>
                        <h4>${escapeHtml(t('feature.automation.github_access'))}</h4>
                        <p>${escapeHtml(t('feature.automation.github_access_detail_copy'))}</p>
                    </div>
                </div>
                ${renderGitHubAccessPanelMarkup(FEATURE_GITHUB_FIELD_IDS)}
            </article>
            <section class="automation-flat-section">
                <div class="automation-section-header">
                    <h4>${escapeHtml(t('feature.automation.github_repo_section'))}</h4>
                    <span class="workspace-view-panel-meta">${escapeHtml(String(currentGitHubFeatureState.repos.length))}</span>
                </div>
                ${currentGitHubFeatureState.repos.length > 0 ? `
                    <div class="automation-record-list github-automation-inline-list">
                        ${currentGitHubFeatureState.repos.map(repo => renderGitHubRepoListButton(repo, { includeAccount: true })).join('')}
                    </div>
                ` : renderFeatureEmptyState(
                    t('feature.automation.github_no_repos'),
                    t('feature.automation.github_no_repos_copy'),
                )}
            </section>
        </div>
    `;
}

function renderGitHubAccountDetail(account) {
    const accountId = String(account?.account_id || '').trim();
    const repos = getGitHubReposForAccount(accountId);
    const status = String(account?.status || 'disabled').trim() || 'disabled';
    return `
        <div class="automation-home-detail github-automation-detail">
            <div class="feature-detail-head automation-detail-head">
                <div class="automation-detail-copy">
                    <div class="feature-detail-title-row">
                        <h3>${escapeHtml(resolveGitHubAccountLabel(account))}</h3>
                        ${renderFeatureStatusPill(t(`automation.status.${status}`), status)}
                    </div>
                    <div class="automation-prompt-inline">${escapeHtml(String(account?.name || accountId))}</div>
                </div>
                <div class="feature-action-row">
                    <button class="secondary-btn" type="button" data-github-account-edit="${escapeHtml(accountId)}">${escapeHtml(t('automation.action.edit'))}</button>
                    <button class="secondary-btn" type="button" data-github-account-toggle="${escapeHtml(accountId)}">${escapeHtml(status === 'enabled' ? t('automation.action.disable') : t('automation.action.enable'))}</button>
                    <button class="secondary-btn" type="button" data-github-repo-create="${escapeHtml(accountId)}">${escapeHtml(t('feature.automation.github_new_repo'))}</button>
                    <button class="secondary-btn danger-btn" type="button" data-github-account-delete="${escapeHtml(accountId)}">${escapeHtml(t('settings.action.delete'))}</button>
                </div>
            </div>
            <div class="feature-card-grid">
                <article class="feature-card">
                    <div class="feature-meta-list">
                        <div><span>${escapeHtml(t('feature.automation.github_account_token'))}</span><strong>${escapeHtml(account?.token_configured ? t('feature.automation.github_configured') : t('feature.automation.github_not_configured'))}</strong></div>
                        <div><span>${escapeHtml(t('feature.automation.github_account_secret'))}</span><strong>${escapeHtml(account?.webhook_secret_configured ? t('feature.automation.github_configured') : t('feature.automation.github_not_configured'))}</strong></div>
                        <div><span>${escapeHtml(t('feature.automation.github_summary_repos'))}</span><strong>${escapeHtml(String(repos.length))}</strong></div>
                    </div>
                </article>
                <article class="feature-card">
                    <div class="feature-meta-list">
                        <div><span>${escapeHtml(t('automation.detail.last_error'))}</span><strong>${escapeHtml(String(account?.last_error || t('automation.detail.none')))}</strong></div>
                        <div><span>${escapeHtml(t('automation.detail.updated_at'))}</span><strong>${escapeHtml(String(account?.updated_at || t('automation.detail.none')))}</strong></div>
                    </div>
                </article>
            </div>
            <section class="automation-flat-section">
                <div class="automation-section-header">
                    <div>
                        <h4>${escapeHtml(t('feature.automation.github_repo_section'))}</h4>
                    </div>
                </div>
                ${repos.length > 0 ? `
                    <div class="automation-record-list github-automation-inline-list">
                        ${repos.map(repo => renderGitHubRepoListButton(repo)).join('')}
                    </div>
                ` : renderFeatureEmptyState(
                    t('feature.automation.github_no_repos'),
                    t('feature.automation.github_no_repos_copy'),
                )}
            </section>
        </div>
    `;
}

function renderGitHubRepoDetail(repo) {
    const repoId = String(repo?.repo_subscription_id || '').trim();
    const rules = getGitHubRulesForRepo(repoId);
    const account = findGitHubAccountById(repo?.account_id);
    const webhooksUrl = buildGitHubRepoWebhooksUrl(repo);
    return `
        <div class="automation-home-detail github-automation-detail">
            <div class="feature-detail-head automation-detail-head">
                <div class="automation-detail-copy">
                    <div class="feature-detail-title-row">
                        <h3>${escapeHtml(String(repo?.full_name || ''))}</h3>
                        ${renderFeatureStatusPill(repo?.enabled === false ? t('automation.status.disabled') : t('automation.status.enabled'), repo?.enabled === false ? 'disabled' : 'enabled')}
                    </div>
                    <div class="automation-prompt-inline">${escapeHtml(String(repo?.callback_url || ''))}</div>
                </div>
                <div class="feature-action-row">
                    <button class="secondary-btn" type="button" data-github-repo-edit="${escapeHtml(repoId)}">${escapeHtml(t('automation.action.edit'))}</button>
                    <button class="secondary-btn" type="button" data-github-repo-toggle="${escapeHtml(repoId)}">${escapeHtml(repo?.enabled === false ? t('automation.action.enable') : t('automation.action.disable'))}</button>
                    <button class="secondary-btn" type="button" data-github-rule-create="${escapeHtml(repoId)}">${escapeHtml(t('feature.automation.github_new_rule'))}</button>
                    <button class="secondary-btn danger-btn" type="button" data-github-repo-delete="${escapeHtml(repoId)}">${escapeHtml(t('settings.action.delete'))}</button>
                </div>
            </div>
            <div class="feature-card-grid">
                <article class="feature-card">
                    <div class="feature-meta-list">
                        <div><span>${escapeHtml(t('feature.automation.github_account'))}</span><strong>${escapeHtml(resolveGitHubAccountLabel(account))}</strong></div>
                        <div><span>${escapeHtml(t('feature.automation.github_callback_url'))}</span><code>${escapeHtml(String(repo?.callback_url || t('automation.detail.none')))}</code></div>
                        <div><span>${escapeHtml(t('feature.automation.github_webhook_status'))}</span><strong>${escapeHtml(formatGitHubWebhookStatusLabel(String(repo?.webhook_status || 'unregistered')))}</strong></div>
                    </div>
                </article>
                <article class="feature-card">
                    <div class="feature-meta-list">
                        <div><span>${escapeHtml(t('feature.automation.github_default_branch'))}</span><strong>${escapeHtml(String(repo?.default_branch || t('automation.detail.none')))}</strong></div>
                        <div><span>${escapeHtml(t('feature.automation.github_events'))}</span><strong>${escapeHtml(formatGitHubRepoEvents(repo))}</strong></div>
                        <div><span>${escapeHtml(t('automation.detail.last_error'))}</span><strong>${escapeHtml(String(repo?.last_error || t('automation.detail.none')))}</strong></div>
                    </div>
                </article>
                ${webhooksUrl
                    ? `
                        <article class="feature-card github-webhooks-card">
                            <span class="settings-token-source-label">${escapeHtml(t('feature.automation.github_open_webhooks'))}</span>
                            <a class="web-provider-link-card" href="${escapeHtml(webhooksUrl)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(webhooksUrl)}" aria-label="${escapeHtml(webhooksUrl)}">
                                <span class="web-provider-link-copy">
                                    <span class="web-provider-link-badge">GitHub</span>
                                    <span class="web-provider-link-url">${escapeHtml(webhooksUrl)}</span>
                                    <span class="settings-token-source-note">${escapeHtml(t('feature.automation.github_open_webhooks_help'))}</span>
                                </span>
                                <span class="web-provider-link-arrow" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" class="icon-sm">
                                        <path d="M7 17L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <path d="M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </span>
                            </a>
                        </article>
                    `
                    : ''
                }
            </div>
            <section class="automation-flat-section">
                <div class="automation-section-header automation-runs-header">
                    <h3>${escapeHtml(t('feature.automation.github_rule_section'))}</h3>
                    <span class="workspace-view-panel-meta">${escapeHtml(String(rules.length))}</span>
                </div>
                ${rules.length > 0 ? `
                    <div class="automation-run-list github-rule-list">
                        ${rules.map(rule => {
                            const ruleId = String(rule?.trigger_rule_id || '').trim();
                            const status = rule?.enabled === false ? 'disabled' : 'enabled';
                            return `
                                <article class="automation-run-card github-rule-card">
                                    <div class="automation-run-row github-rule-row">
                                        <div class="github-rule-heading">
                                            <strong>${escapeHtml(String(rule?.name || ruleId))}</strong>
                                            ${renderFeatureStatusPill(t(`automation.status.${status}`), status)}
                                        </div>
                                        <div class="feature-inline-actions github-rule-actions">
                                            <button class="secondary-btn" type="button" data-github-rule-edit="${escapeHtml(ruleId)}">${escapeHtml(t('automation.action.edit'))}</button>
                                            <button class="secondary-btn" type="button" data-github-rule-toggle="${escapeHtml(ruleId)}">${escapeHtml(status === 'enabled' ? t('automation.action.disable') : t('automation.action.enable'))}</button>
                                            <button class="secondary-btn danger-btn" type="button" data-github-rule-delete="${escapeHtml(ruleId)}">${escapeHtml(t('settings.action.delete'))}</button>
                                        </div>
                                    </div>
                                    <div class="automation-run-copy github-rule-copy">
                                        <div class="feature-meta-list github-rule-meta-list">
                                            <div><span>${escapeHtml(t('settings.triggers.workspace'))}</span><strong>${escapeHtml(formatGitHubRuleWorkspaceSummary(rule))}</strong></div>
                                            <div><span>${escapeHtml(t('feature.automation.github_event_subscription'))}</span><strong>${escapeHtml(resolveGitHubRuleEventLabel(rule))}</strong></div>
                                            <div><span>${escapeHtml(t('feature.automation.github_actions'))}</span><strong>${escapeHtml(resolveGitHubRuleActionsLabel(rule))}</strong></div>
                                            <div><span>${escapeHtml(t('feature.automation.github_draft_pr'))}</span><strong>${escapeHtml(resolveGitHubRuleDraftPrLabel(rule))}</strong></div>
                                            <div><span>${escapeHtml(t('feature.automation.github_base_branches'))}</span><strong>${escapeHtml(resolveGitHubRuleBaseBranchesLabel(rule))}</strong></div>
                                            <div class="github-rule-prompt-row"><span>${escapeHtml(t('automation.detail.prompt'))}</span><code class="github-rule-prompt">${escapeHtml(resolveGitHubRulePromptTemplate(rule))}</code></div>
                                        </div>
                                    </div>
                                </article>
                            `;
                        }).join('')}
                    </div>
                ` : renderFeatureEmptyState(
                    t('feature.automation.github_no_rules'),
                    t('feature.automation.github_no_rules_copy'),
                )}
            </section>
        </div>
    `;
}

function formatGitHubWebhookStatusLabel(status) {
    const normalizedStatus = String(status || 'unregistered').trim() || 'unregistered';
    if (normalizedStatus === 'registered') {
        return t('feature.automation.github_webhook_registered');
    }
    if (normalizedStatus === 'error') {
        return t('feature.automation.github_webhook_error');
    }
    return t('feature.automation.github_webhook_unregistered');
}

function buildGitHubRepoWebhooksUrl(repo) {
    const owner = String(repo?.owner || '').trim();
    const repoName = String(repo?.repo_name || '').trim();
    if (!owner || !repoName) {
        return '';
    }
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/settings/hooks`;
}

function formatGitHubRuleSummary(rule) {
    const matchConfig = rule?.match_config && typeof rule.match_config === 'object'
        ? rule.match_config
        : {};
    const eventName = String(matchConfig?.event_name || '').trim();
    const actions = Array.isArray(matchConfig?.actions) ? matchConfig.actions.join(', ') : '';
    return actions ? `${eventName}: ${actions}` : eventName;
}

function formatGitHubRuleWorkspaceSummary(rule) {
    return resolveGitHubWorkspaceLabel(resolveGitHubRuleWorkspaceId(rule));
}

function resolveGitHubRuleWorkspaceId(rule) {
    return String(rule?.dispatch_config?.run_template?.workspace_id || '').trim();
}

function resolveGitHubRuleEventLabel(rule) {
    const eventName = String(rule?.match_config?.event_name || '').trim();
    return resolveOptionLabel(getGitHubRuleEventOptions(), eventName, eventName || t('automation.detail.none'));
}

function resolveGitHubRuleActionsLabel(rule) {
    const actions = Array.isArray(rule?.match_config?.actions)
        ? rule.match_config.actions.map(action => String(action || '').trim()).filter(Boolean)
        : [];
    return actions.length > 0 ? actions.join(', ') : t('automation.detail.none');
}

function resolveGitHubRuleDraftPrLabel(rule) {
    const draftPrValue = resolveGitHubDraftPrFieldValue(rule?.match_config?.draft_pr);
    return resolveOptionLabel(getGitHubDraftPrOptions(), draftPrValue, t('automation.detail.none'));
}

function resolveGitHubRuleBaseBranchesLabel(rule) {
    const branches = Array.isArray(rule?.match_config?.base_branches)
        ? rule.match_config.base_branches.map(branch => String(branch || '').trim()).filter(Boolean)
        : [];
    return branches.length > 0 ? branches.join(', ') : t('feature.automation.github_base_branches_all');
}

function resolveGitHubRulePromptTemplate(rule) {
    const promptTemplate = String(rule?.dispatch_config?.run_template?.prompt_template || '').trim();
    return promptTemplate || t('automation.detail.none');
}

function resolveOptionLabel(options, value, fallback = '') {
    const normalizedValue = String(value || '').trim();
    const match = (Array.isArray(options) ? options : []).find(
        option => String(option?.value || '').trim() === normalizedValue,
    );
    return String(match?.label || fallback || normalizedValue || '').trim();
}

function resolveGitHubWorkspaceLabel(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
        return t('automation.detail.none');
    }
    const workspace = (Array.isArray(currentGitHubFeatureState.workspaces)
        ? currentGitHubFeatureState.workspaces
        : []).find(item => String(item?.workspace_id || '').trim() === normalizedWorkspaceId);
    return formatWorkspaceOptionLabel(workspace || { workspace_id: normalizedWorkspaceId });
}

function getGitHubRuleEventOptions() {
    return [
        {
            value: 'pull_request',
            label: t('feature.automation.github_event_pull_request'),
            description: '',
        },
        {
            value: 'issues',
            label: t('feature.automation.github_event_issues'),
            description: '',
        },
    ];
}

function getGitHubRuleActionOptions() {
    return [
        {
            value: 'opened',
            label: 'opened',
            description: '',
        },
        {
            value: 'reopened',
            label: 'reopened',
            description: '',
        },
        {
            value: 'edited',
            label: 'edited',
            description: '',
        },
        {
            value: 'synchronize',
            label: 'synchronize',
            description: '',
        },
        {
            value: 'review_requested',
            label: 'review_requested',
            description: '',
        },
    ];
}

function getGitHubDraftPrOptions() {
    return [
        {
            value: 'any',
            label: t('feature.automation.github_draft_pr_any'),
            description: '',
        },
        {
            value: 'false',
            label: t('feature.automation.github_draft_pr_false'),
            description: '',
        },
        {
            value: 'true',
            label: t('feature.automation.github_draft_pr_true'),
            description: '',
        },
    ];
}

function resolveGitHubDraftPrFieldValue(value) {
    if (value === true) {
        return 'true';
    }
    if (value === false) {
        return 'false';
    }
    return 'any';
}

function normalizeGitHubDraftPrValue(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    if (normalizedValue === 'true') {
        return true;
    }
    if (normalizedValue === 'false') {
        return false;
    }
    return null;
}

function bindGitHubAutomationView() {
    bindGitHubSettingsHandlers(FEATURE_GITHUB_FIELD_IDS);
    void loadGitHubSettingsPanel(FEATURE_GITHUB_FIELD_IDS);
    els.projectViewToolbarActions?.querySelector('[data-github-account-create]')?.addEventListener('click', () => {
        void handleGitHubCreateAccountFeature();
    });
    els.projectViewContent.querySelectorAll('[data-github-node-key]').forEach(button => {
        button.addEventListener('click', () => {
            const nodeKey = String(button.getAttribute('data-github-node-key') || '').trim();
            void openAutomationGitHubView(nodeKey || 'access');
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-account-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubEditAccountFeature(button.getAttribute('data-github-account-edit'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-account-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubToggleAccountFeature(button.getAttribute('data-github-account-toggle'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-account-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubDeleteAccountFeature(button.getAttribute('data-github-account-delete'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-repo-create]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubCreateRepoFeature(button.getAttribute('data-github-repo-create'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-repo-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubEditRepoFeature(button.getAttribute('data-github-repo-edit'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-repo-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubToggleRepoFeature(button.getAttribute('data-github-repo-toggle'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-repo-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubDeleteRepoFeature(button.getAttribute('data-github-repo-delete'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-rule-create]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubCreateRuleFeature(button.getAttribute('data-github-rule-create'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-rule-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubEditRuleFeature(button.getAttribute('data-github-rule-edit'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-rule-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubToggleRuleFeature(button.getAttribute('data-github-rule-toggle'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-github-rule-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleGitHubDeleteRuleFeature(button.getAttribute('data-github-rule-delete'));
        });
    });
}

function renderAutomationHomeDetail(detail) {
    const project = detail?.project || null;
    if (!project) {
        return '';
    }
    const sessions = Array.isArray(detail?.sessions) ? detail.sessions : [];
    const workspaceRecord = detail?.workspace;
    const deliveryBindings = Array.isArray(detail?.deliveryBindings) ? detail.deliveryBindings : [];
    const normalRoles = Array.isArray(detail?.normalRoles) ? detail.normalRoles : [];
    const orchestrationPresets = Array.isArray(detail?.orchestrationPresets) ? detail.orchestrationPresets : [];
    const runConfig = project?.run_config && typeof project.run_config === 'object' ? project.run_config : {};
    const sessionMode = String(runConfig?.session_mode || DEFAULT_SESSION_MODE).trim() || DEFAULT_SESSION_MODE;
    const normalRootRoleId = String(runConfig?.normal_root_role_id || '').trim();
    const orchestrationPresetId = String(runConfig?.orchestration_preset_id || '').trim();
    const status = String(project?.status || '').trim() || 'disabled';
    const statusLabel = t(`automation.status.${status}`);
    const deliveryBinding = project?.delivery_binding && typeof project.delivery_binding === 'object'
        ? project.delivery_binding
        : null;
    const deliveryBindingName = deliveryBinding
        ? resolveAutomationBindingDisplayName(deliveryBinding, deliveryBindings)
        : '';
    const deliveryEvents = Array.isArray(project?.delivery_events) ? project.delivery_events : [];
    const workspaceId = String(project?.workspace_id || '').trim() || 'automation-system';
    const workspaceRootPath = String(workspaceRecord?.root_path || t('automation.workspace.missing'));
    return `
        <div class="automation-home-detail">
            <div class="feature-detail-head automation-detail-head">
                <div class="automation-detail-copy">
                    <div class="feature-detail-title-row">
                        <h3>${escapeHtml(String(project?.display_name || project?.name || ''))}</h3>
                        ${renderFeatureStatusPill(statusLabel, status)}
                    </div>
                    <div class="automation-prompt-inline">${escapeHtml(String(project?.prompt || ''))}</div>
                </div>
                <div class="feature-action-row">
                    <button class="secondary-btn" type="button" data-automation-edit>${escapeHtml(t('automation.action.edit'))}</button>
                    <button class="secondary-btn" type="button" data-automation-run>${escapeHtml(t('automation.action.run_now'))}</button>
                    <button class="secondary-btn" type="button" data-automation-toggle>${escapeHtml(status === 'enabled' ? t('automation.action.disable') : t('automation.action.enable'))}</button>
                    <button class="secondary-btn danger-btn" type="button" data-automation-delete>${escapeHtml(t('settings.action.delete'))}</button>
                </div>
            </div>
            <div class="automation-detail-grid automation-section-shell">
                <section class="automation-flat-section automation-meta-section">
                    <div class="automation-section-header">
                        <div>
                            <h4>${escapeHtml(t('automation.detail.configuration'))}</h4>
                        </div>
                    </div>
                    <div class="feature-meta-list automation-meta-list">
                        <div><span>${escapeHtml(t('automation.detail.schedule'))}</span><strong>${escapeHtml(describeAutomationScheduleText(project))}</strong></div>
                        <div><span>${escapeHtml(t('automation.detail.timezone'))}</span><strong>${escapeHtml(String(project?.timezone || 'UTC'))}</strong></div>
                        <div><span>${escapeHtml(t('settings.triggers.mode'))}</span><strong>${escapeHtml(sessionMode === 'orchestration' ? t('composer.mode_orchestration') : t('composer.mode_normal'))}</strong></div>
                        <div><span>${escapeHtml(sessionMode === 'orchestration' ? t('settings.triggers.orchestration_preset_id') : t('settings.triggers.normal_root_role_id'))}</span><strong>${escapeHtml(
                            sessionMode === 'orchestration'
                                ? resolveAutomationPresetDisplayName(orchestrationPresetId, orchestrationPresets)
                                : resolveAutomationRoleDisplayName(normalRootRoleId, normalRoles)
                        )}</strong></div>
                        <div><span>${escapeHtml(t('automation.detail.next_run'))}</span><strong>${escapeHtml(formatAutomationUtcDateTime(project?.next_run_at, t('automation.detail.not_scheduled')))}</strong></div>
                        <div><span>${escapeHtml(t('automation.detail.last_run'))}</span><strong>${escapeHtml(formatAutomationUtcDateTime(project?.last_run_started_at, t('automation.detail.never')))}</strong></div>
                    </div>
                </section>
                <section class="automation-flat-section automation-meta-section">
                    <div class="automation-section-header">
                        <div>
                            <h4>${escapeHtml(t('workspace_view.bindings'))}</h4>
                        </div>
                    </div>
                    <div class="feature-meta-list automation-meta-list">
                        <div><span>${escapeHtml(t('automation.field.workspace'))}</span><strong>${escapeHtml(workspaceId)}</strong></div>
                        <div><span>${escapeHtml(t('automation.workspace.directory'))}</span><code>${escapeHtml(workspaceRootPath)}</code></div>
                        <div><span>${escapeHtml(t('workspace_view.delivery_events'))}</span><strong>${escapeHtml(deliveryEvents.length > 0 ? deliveryEvents.join(', ') : t('workspace_view.delivery_disabled'))}</strong></div>
                        ${deliveryBinding ? `
                            <div><span>${escapeHtml(t('workspace_view.delivery_provider'))}</span><strong>${escapeHtml(resolveDeliveryProviderLabel(deliveryBinding?.provider))}</strong></div>
                            <div><span>${escapeHtml(t('workspace_view.delivery_target'))}</span><strong>${escapeHtml(deliveryBindingName)}</strong></div>
                        ` : ''}
                    </div>
                </section>
            </div>
            <section class="automation-flat-section automation-runs-section">
                <div class="automation-section-header automation-runs-header">
                    <h3>${escapeHtml(t('automation.detail.recent_runs'))}</h3>
                    <span class="workspace-view-panel-meta">${escapeHtml(String(sessions.length))} ${escapeHtml(t('automation.detail.session_count'))}</span>
                </div>
                ${sessions.length > 0 ? `
                    <div class="automation-run-list">
                        ${sessions.map(session => {
                            const sessionStatus = String(session?.active_run_status || 'completed').trim() || 'completed';
                            return `
                                <article class="automation-run-card" data-automation-session-id="${escapeHtml(String(session?.session_id || ''))}">
                                    <div class="automation-run-card-header">
                                        ${renderFeatureStatusPill(t(`automation.run_status.${sessionStatus}`), sessionStatus)}
                                        <code class="workspace-diff-path">${escapeHtml(String(session?.metadata?.title || session?.session_id || ''))}</code>
                                    </div>
                                    <div class="automation-run-card-meta">
                                        <span>${escapeHtml(t('automation.detail.updated_at'))}</span>
                                        <strong>${escapeHtml(String(session?.updated_at || ''))}</strong>
                                    </div>
                                </article>
                            `;
                        }).join('')}
                    </div>
                ` : renderInlineState(t('automation.detail.no_runs'))}
            </section>
        </div>
    `;
}

function resolveFeishuTriggerAppName(trigger) {
    const sourceConfig = trigger?.source_config && typeof trigger.source_config === 'object' ? trigger.source_config : {};
    return String(sourceConfig?.app_name || sourceConfig?.app_id || '').trim();
}

function renderGatewaySummaryChips(labels) {
    return `
        <div class="profile-card-chips gateway-summary-chips">
            ${labels
                .filter(label => String(label || '').trim())
                .map(label => `<span class="profile-card-chip">${escapeHtml(String(label))}</span>`)
                .join('')}
        </div>
    `;
}

function renderGatewayFeishuRecords(triggers) {
    if (!Array.isArray(triggers) || triggers.length === 0) {
        return `
            <div class="feature-panel-body">
                ${renderFeatureEmptyState(
                    t('settings.triggers.none'),
                    t('settings.triggers.none_copy'),
                )}
            </div>
        `;
    }
    return `
        <div class="role-records trigger-records gateway-records">
            ${triggers.map(trigger => {
                const triggerId = String(trigger?.trigger_id || '').trim();
                const status = String(trigger?.status || 'disabled').trim() || 'disabled';
                const workspaceId = String(trigger?.target_config?.workspace_id || '').trim();
                const appName = resolveFeishuTriggerAppName(trigger);
                const credentialsReady = trigger?.secret_status?.app_secret_configured === true;
                return `
                    <div class="role-record gateway-feature-record" data-feature-feishu-record="${escapeHtml(triggerId)}">
                        <div class="role-record-main">
                            <div class="role-record-title-row trigger-record-title-row">
                                <div class="role-record-title">${escapeHtml(String(trigger?.display_name || trigger?.name || triggerId))}</div>
                                <div class="profile-card-chips role-record-chips">
                                    <span class="profile-card-chip">${escapeHtml(t(`automation.status.${status}`))}</span>
                                    <span class="profile-card-chip">${escapeHtml(credentialsReady ? t('settings.triggers.credentials_ready') : t('settings.triggers.credentials_missing'))}</span>
                                </div>
                            </div>
                            <div class="role-record-meta trigger-record-meta">
                                ${workspaceId ? `<span>${escapeHtml(workspaceId)}</span>` : ''}
                                ${appName ? `<span>${escapeHtml(appName)}</span>` : ''}
                            </div>
                        </div>
                        <div class="role-record-actions trigger-record-actions">
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-feishu-toggle="${escapeHtml(triggerId)}">${escapeHtml(status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-feishu-edit="${escapeHtml(triggerId)}">${escapeHtml(t('settings.action.edit'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-feishu-delete="${escapeHtml(triggerId)}">${escapeHtml(t('settings.action.delete'))}</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderGatewayWeChatRecords(accounts) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return `
            <div class="feature-panel-body">
                ${renderFeatureEmptyState(
                    t('settings.gateway.wechat_none'),
                    t('settings.gateway.wechat_none_copy'),
                )}
            </div>
        `;
    }
    return `
        <div class="role-records trigger-records gateway-records">
            ${accounts.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const status = String(account?.status || 'disabled').trim() || 'disabled';
                const statusLabel = account?.running === true
                    ? t('settings.gateway.status_running')
                    : t(`automation.status.${status}`);
                return `
                    <div class="role-record gateway-feature-record" data-feature-wechat-record="${escapeHtml(accountId)}">
                        <div class="role-record-main">
                            <div class="role-record-title-row trigger-record-title-row">
                                <div class="role-record-title">${escapeHtml(String(account?.display_name || accountId))}</div>
                                <div class="profile-card-chips role-record-chips">
                                    <span class="profile-card-chip">${escapeHtml(statusLabel)}</span>
                                    <span class="profile-card-chip">${escapeHtml(accountId)}</span>
                                </div>
                            </div>
                            <div class="role-record-meta trigger-record-meta">
                                ${account?.workspace_id ? `<span>${escapeHtml(String(account.workspace_id))}</span>` : ''}
                                ${account?.last_error ? `<span>${escapeHtml(`${t('settings.gateway.last_error')}: ${String(account.last_error)}`)}</span>` : ''}
                            </div>
                        </div>
                        <div class="role-record-actions trigger-record-actions">
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-wechat-toggle="${escapeHtml(accountId)}">${escapeHtml(status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-wechat-edit="${escapeHtml(accountId)}">${escapeHtml(t('settings.action.edit'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-wechat-delete="${escapeHtml(accountId)}">${escapeHtml(t('settings.action.delete'))}</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderGatewayXiaolubanRecords(accounts) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return `
            <div class="feature-panel-body">
                ${renderFeatureEmptyState(
                    t('settings.gateway.xiaoluban_none'),
                    t('settings.gateway.xiaoluban_none_copy'),
                )}
            </div>
        `;
    }
    return `
        <div class="role-records trigger-records gateway-records">
            ${accounts.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const status = String(account?.status || 'disabled').trim() || 'disabled';
                const derivedUid = String(account?.derived_uid || '').trim();
                const tokenConfigured = account?.secret_status?.token_configured === true;
                const workspaceIds = Array.isArray(account?.notification_workspace_ids)
                    ? account.notification_workspace_ids.map(value => String(value || '').trim()).filter(Boolean)
                    : [];
                const receiverLabel = formatXiaolubanReceiverSummary(account);
                const imStatus = getXiaolubanImStatus(account);
                return `
                    <div class="role-record gateway-feature-record" data-feature-xiaoluban-record="${escapeHtml(accountId)}">
                        <div class="role-record-main">
                            <div class="role-record-title-row trigger-record-title-row">
                                <div class="role-record-title">${escapeHtml(String(account?.display_name || accountId))}</div>
                                <div class="profile-card-chips role-record-chips">
                                    <span class="profile-card-chip">${escapeHtml(t(`automation.status.${status}`))}</span>
                                    <span class="profile-card-chip">${escapeHtml(tokenConfigured ? t('settings.triggers.credentials_ready') : t('settings.triggers.credentials_missing'))}</span>
                                    <span class="profile-card-chip">${escapeHtml(formatMessage('settings.gateway.xiaoluban_notification_workspace_count', { count: workspaceIds.length }))}</span>
                                    <span class="profile-card-chip">${escapeHtml(formatMessage('settings.gateway.xiaoluban_im_summary', { status: imStatus }))}</span>
                                    ${derivedUid ? `<span class="profile-card-chip">${escapeHtml(derivedUid)}</span>` : ''}
                                </div>
                            </div>
                            <div class="role-record-meta trigger-record-meta">
                                ${accountId ? `<span>${escapeHtml(formatMessage('settings.gateway.xiaoluban_internal_id_copy', { account_id: accountId }))}</span>` : ''}
                                <span>${escapeHtml(formatMessage('settings.gateway.xiaoluban_notification_receiver_summary', { receiver: receiverLabel }))}</span>
                            </div>
                        </div>
                        <div class="role-record-actions trigger-record-actions">
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-xiaoluban-toggle="${escapeHtml(accountId)}">${escapeHtml(status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-xiaoluban-edit="${escapeHtml(accountId)}">${escapeHtml(t('settings.action.edit'))}</button>
                            <button class="settings-inline-action settings-list-action" type="button" data-feature-xiaoluban-delete="${escapeHtml(accountId)}">${escapeHtml(t('settings.action.delete'))}</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function formatXiaolubanReceiverSummary(account) {
    const receivers = Array.isArray(account?.notification_receivers)
        ? account.notification_receivers.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const parts = [];
    parts.push(t('settings.gateway.xiaoluban_notification_receiver_self'));
    if (receivers.length > 0) {
        parts.push(formatMessage('settings.gateway.xiaoluban_notification_group_count', {
            count: receivers.length,
        }));
    }
    return parts.join(' + ') || t('settings.gateway.xiaoluban_notification_receiver_none');
}

function ensureGatewayModalRoot() {
    if (!document?.body) {
        return null;
    }
    if (!gatewayModalRoot) {
        try {
            gatewayModalRoot = document.getElementById('gateway-feature-modal-root');
        } catch {
            gatewayModalRoot = null;
        }
    }
    if (!gatewayModalRoot && typeof document.createElement === 'function') {
        gatewayModalRoot = document.createElement('div');
        gatewayModalRoot.id = 'gateway-feature-modal-root';
        gatewayModalRoot.className = 'gateway-feature-modal-root';
        if (typeof document.body.appendChild === 'function') {
            document.body.appendChild(gatewayModalRoot);
        }
    }
    return gatewayModalRoot;
}

function renderGatewayFeishuModal() {
    const draft = currentGatewayFeatureState.feishuDraft;
    if (!draft) {
        return '';
    }
    return `
        <div class="modal gateway-feature-modal" data-feature-gateway-modal>
            <div class="modal-content gateway-feature-modal-content gateway-feishu-modal-content" role="dialog" aria-modal="true" aria-labelledby="gateway-feature-modal-title">
                <div class="modal-header gateway-feature-modal-header">
                    <div class="gateway-feature-modal-heading">
                        <h3 id="gateway-feature-modal-title">${escapeHtml(String(draft.trigger_id || '').trim() ? t('settings.roles.edit') : t('feature.gateway.add_feishu'))}</h3>
                        <p>${escapeHtml(t('settings.triggers.feishu_detail_copy'))}</p>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-feature-gateway-modal-close>
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="gateway-feature-modal-body">
                    ${renderFeishuEditor()}
                </div>
            </div>
        </div>
    `;
}

function renderGatewayDiscordModal() {
    const draft = currentGatewayFeatureState.discordDraft;
    if (!draft) {
        return '';
    }
    const isEditing = String(draft.account_id || '').trim().length > 0;
    return `
        <div class="modal gateway-feature-modal" data-feature-gateway-modal>
            <div class="modal-content gateway-feature-modal-content gateway-discord-modal-content" role="dialog" aria-modal="true" aria-labelledby="gateway-feature-modal-title">
                <div class="modal-header gateway-feature-modal-header">
                    <div class="gateway-feature-modal-heading">
                        <h3 id="gateway-feature-modal-title">${escapeHtml(isEditing ? t('settings.gateway.discord_account_editor') : t('feature.gateway.add_discord'))}</h3>
                        <p>${escapeHtml(t('settings.gateway.discord_detail_copy'))}</p>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-feature-gateway-modal-close>
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="gateway-feature-modal-body">
                    ${renderDiscordEditor()}
                </div>
            </div>
        </div>
    `;
}

function renderGatewayWeChatConnectModal() {
    if (currentGatewayFeatureState.wechatModalOpen !== true) {
        return '';
    }
    const session = currentGatewayFeatureState.wechatLoginSession;
    const statusTone = String(currentGatewayFeatureState.wechatStatusTone || '').trim() || 'neutral';
    const statusMessage = String(currentGatewayFeatureState.wechatStatusMessage || '').trim();
    const canRetry = currentGatewayFeatureState.wechatConnecting !== true;
    return `
        <div class="modal gateway-feature-modal gateway-connect-modal" data-feature-wechat-modal>
            <div class="modal-content gateway-feature-modal-content gateway-connect-modal-content" role="dialog" aria-modal="true" aria-labelledby="gateway-connect-modal-title">
                <div class="modal-header gateway-feature-modal-header gateway-connect-modal-header">
                    <div class="gateway-feature-modal-heading gateway-connect-modal-heading">
                        <h3 id="gateway-connect-modal-title">${escapeHtml(t('settings.gateway.connect_wechat'))}</h3>
                        <p>${escapeHtml(t('settings.gateway.qr_copy'))}</p>
                    </div>
                    <button class="icon-btn" type="button" aria-label="${escapeHtml(t('settings.action.cancel'))}" data-feature-wechat-modal-close>
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="gateway-connect-modal-body">
                    ${statusMessage
                        ? `<div class="feature-inline-status is-${escapeHtml(statusTone)}">${escapeHtml(statusMessage)}</div>`
                        : ''
                    }
                    ${session?.qr_code_url
                        ? `
                            <div class="gateway-connect-modal-qr">
                                <img class="gateway-qr-image" src="${escapeHtml(session.qr_code_url)}" alt="${escapeHtml(t('settings.gateway.qr_title'))}">
                            </div>
                        `
                        : `
                            <div class="gateway-connect-modal-placeholder">
                                <h4>${escapeHtml(t('settings.gateway.qr_title'))}</h4>
                                <p>${escapeHtml(t('settings.gateway.login_waiting'))}</p>
                            </div>
                        `
                    }
                </div>
                <div class="gateway-connect-modal-actions">
                    <button class="secondary-btn" type="button" data-feature-wechat-modal-close>${escapeHtml(t('settings.action.cancel'))}</button>
                    ${canRetry
                        ? `<button class="primary-btn" type="button" data-feature-wechat-modal-retry>${escapeHtml(t('settings.gateway.connect_wechat'))}</button>`
                        : ''
                    }
                </div>
            </div>
        </div>
    `;
}

function renderGatewayFeatureModal() {
    const root = ensureGatewayModalRoot();
    if (!root) {
        return;
    }
    let content = '';
    if (currentGatewayFeatureState.feishuDraft) {
        content = renderGatewayFeishuModal();
    } else if (currentGatewayFeatureState.discordDraft) {
        content = renderGatewayDiscordModal();
    } else if (currentGatewayFeatureState.wechatModalOpen) {
        content = renderGatewayWeChatConnectModal();
    } else {
        content = renderConnectorConfigModal();
    }
    root.innerHTML = content;
    if (!content) {
        return;
    }
    bindConnectorConfigModalHandlers(root);
    root.querySelectorAll('[data-feature-gateway-modal-close]').forEach(button => {
        button.addEventListener('click', () => {
            if (currentGatewayFeatureState.discordDraft) {
                handleCancelDiscordFeatureAccount();
                return;
            }
            handleCancelFeishuFeatureTrigger();
        });
    });
    root.querySelectorAll('[data-feature-feishu-save]').forEach(button => {
        button.addEventListener('click', () => {
            void handleSaveFeishuFeatureTrigger();
        });
    });
    root.querySelectorAll('[data-feature-feishu-cancel]').forEach(button => {
        button.addEventListener('click', () => {
            handleCancelFeishuFeatureTrigger();
        });
    });
    root.querySelectorAll('[data-feature-discord-save]').forEach(button => {
        button.addEventListener('click', () => {
            handleSaveDiscordFeatureAccount();
        });
    });
    root.querySelectorAll('[data-feature-discord-cancel]').forEach(button => {
        button.addEventListener('click', () => {
            handleCancelDiscordFeatureAccount();
        });
    });
    root.querySelectorAll('[data-feature-wechat-modal-close]').forEach(button => {
        button.addEventListener('click', () => {
            handleCloseWeChatFeatureModal();
        });
    });
    root.querySelectorAll('[data-feature-wechat-modal-retry]').forEach(button => {
        button.addEventListener('click', () => {
            void handleStartWeChatFeatureLogin();
        });
    });
    bindGatewayRecordHandlers(root);
    bindFeishuEditorInputs();
    bindDiscordEditorInputs();
    bindGatewaySecretToggles(root);
}

function getCurrentConnectorModalItem() {
    const provider = String(currentGatewayFeatureState.connectorModalProvider || '').trim();
    if (!provider) {
        return null;
    }
    const items = Array.isArray(currentGatewayFeatureState.connectorsResponse?.items)
        ? currentGatewayFeatureState.connectorsResponse.items
        : [];
    return items.find(item => String(item?.provider || item?.connector_id || '').trim() === provider) || null;
}

function renderConnectorConfigModal() {
    const item = getCurrentConnectorModalItem();
    if (!item) {
        return '';
    }
    const provider = String(item.provider || item.connector_id || '').trim();
    const modalItem = provider === W3_PLATFORM
        ? {
            ...item,
            last_error: formatW3ConnectorStatusMessage(
                currentGatewayFeatureState.w3Connector,
                item.last_error,
            ) || item.last_error,
        }
        : item;
    return renderConnectorConfigModalMarkup({
        item: modalItem,
        accountManagementMarkup: renderConnectorAccountManagement(modalItem),
        showConfigureAction: provider !== W3_PLATFORM,
    });
}

function renderConnectorAccountManagement(item) {
    const provider = String(item?.provider || item?.connector_id || '').trim();
    if (provider === FEISHU_PLATFORM) {
        return renderConnectorAccountManagementSection(
            renderConnectorFeishuAccountList(currentGatewayFeatureState.feishuTriggers),
        );
    }
    if (provider === WECHAT_PLATFORM) {
        return renderConnectorAccountManagementSection(
            renderConnectorWeChatAccountList(currentGatewayFeatureState.wechatAccounts),
        );
    }
    if (provider === DISCORD_PLATFORM) {
        return renderConnectorAccountManagementSection(
            renderConnectorDiscordAccountList(currentGatewayFeatureState.discordAccounts),
        );
    }
    if (provider === XIAOLUBAN_PLATFORM) {
        return renderConnectorAccountManagementSection(
            renderConnectorXiaolubanAccountList(currentGatewayFeatureState.xiaolubanAccounts),
        );
    }
    if (provider === W3_PLATFORM) {
        return renderConnectorW3Management();
    }
    return '';
}

function renderConnectorW3Management() {
    const status = currentGatewayFeatureState.w3Connector || {};
    const draft = currentGatewayFeatureState.w3Draft || {};
    const username = String(draft.username || status.username || '').trim();
    const hasPassword = status.has_password === true;
    const passwordPlaceholder = hasPassword
        ? t('feature.connectors.w3.password_keep')
        : t('settings.model.password_placeholder');
    const busy = currentGatewayFeatureState.w3Saving;
    const saveLabel = hasPassword
        ? t('feature.connectors.w3.test_update_auth')
        : t('feature.connectors.w3.test_save_auth');
    const w3PasswordRevealed = currentGatewayFeatureState.w3PasswordRevealed === true;
    const hasPasswordValue = hasPassword || String(draft.password || '').trim().length > 0;
    const passwordToggleLabel = w3PasswordRevealed
        ? t('settings.model.hide_password')
        : t('settings.model.show_password');
    return `
        <section class="connectors-account-management connectors-w3-management">
            <div class="connectors-account-management-header">
                <h4>${escapeHtml(t('feature.connectors.w3.title'))}</h4>
            </div>
            <div class="connectors-w3-form">
                <label>
                    <span>${escapeHtml(t('settings.model.username'))}</span>
                    <input type="text" value="${escapeHtml(username)}" autocomplete="username" data-feature-w3-username>
                </label>
                <label>
                    <span>${escapeHtml(t('settings.model.password'))}</span>
                    <div class="secure-input-row">
                        <input type="${w3PasswordRevealed ? 'text' : 'password'}" value="${escapeHtml(String(draft.password || ''))}" placeholder="${escapeHtml(passwordPlaceholder)}" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" data-feature-w3-password>
                        <button class="secure-input-btn${w3PasswordRevealed ? ' is-active' : ''}" type="button" title="${escapeHtml(passwordToggleLabel)}" aria-label="${escapeHtml(passwordToggleLabel)}" data-feature-w3-password-toggle style="${hasPasswordValue ? '' : 'display:none;'}">
                            <svg viewBox="0 0 24 24" fill="none" class="icon-sm" aria-hidden="true">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"></circle>
                            </svg>
                        </button>
                    </div>
                </label>
                <div class="connectors-w3-actions">
                    <button class="primary-btn section-action-btn" type="button" data-feature-w3-save ${busy ? 'disabled' : ''}>${escapeHtml(currentGatewayFeatureState.w3Saving ? t('settings.action.saving') : saveLabel)}</button>
                </div>
                ${currentGatewayFeatureState.w3StatusMessage ? `<p class="connectors-w3-status is-${escapeHtml(currentGatewayFeatureState.w3StatusTone || 'info')}">${escapeHtml(currentGatewayFeatureState.w3StatusMessage)}</p>` : ''}
            </div>
        </section>
    `;
}

function renderConnectorAccountManagementSection(recordsMarkup) {
    return `
        <section class="connectors-account-management">
            <div class="connectors-account-management-header">
                <h4>${escapeHtml(t('feature.connectors.accounts.title'))}</h4>
            </div>
            ${recordsMarkup}
        </section>
    `;
}

function renderConnectorFeishuAccountList(triggers) {
    const rows = Array.isArray(triggers) ? triggers : [];
    if (rows.length === 0) {
        return renderConnectorAccountEmptyState();
    }
    return `
        <div class="connectors-account-list">
            ${rows.map(trigger => {
                const triggerId = String(trigger?.trigger_id || '').trim();
                const status = String(trigger?.status || 'disabled').trim() || 'disabled';
                const workspaceId = String(trigger?.target_config?.workspace_id || '').trim();
                const appName = resolveFeishuTriggerAppName(trigger);
                const credentialsReady = trigger?.secret_status?.app_secret_configured === true;
                return renderConnectorAccountRow({
                    id: triggerId,
                    title: String(trigger?.display_name || trigger?.name || triggerId),
                    chips: [
                        t(`automation.status.${status}`),
                        credentialsReady ? t('settings.triggers.credentials_ready') : t('settings.triggers.credentials_missing'),
                    ],
                    meta: [workspaceId, appName],
                    actions: [
                        {
                            attr: 'data-feature-feishu-toggle',
                            label: status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'),
                        },
                        { attr: 'data-feature-feishu-edit', label: t('settings.action.edit') },
                        { attr: 'data-feature-feishu-delete', label: t('settings.action.delete') },
                    ],
                });
            }).join('')}
        </div>
    `;
}

function renderConnectorWeChatAccountList(accounts) {
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.length === 0) {
        return renderConnectorAccountEmptyState();
    }
    return `
        <div class="connectors-account-list">
            ${rows.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const status = String(account?.status || 'disabled').trim() || 'disabled';
                const statusLabel = account?.running === true
                    ? t('settings.gateway.status_running')
                    : t(`automation.status.${status}`);
                const lastError = account?.last_error
                    ? `${t('settings.gateway.last_error')}: ${String(account.last_error)}`
                    : '';
                return renderConnectorAccountRow({
                    id: accountId,
                    title: String(account?.display_name || accountId),
                    chips: [statusLabel, accountId],
                    meta: [account?.workspace_id ? String(account.workspace_id) : '', lastError],
                    actions: [
                        {
                            attr: 'data-feature-wechat-toggle',
                            label: status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'),
                        },
                        { attr: 'data-feature-wechat-edit', label: t('settings.action.edit') },
                        { attr: 'data-feature-wechat-delete', label: t('settings.action.delete') },
                    ],
                });
            }).join('')}
        </div>
    `;
}

function renderConnectorDiscordAccountList(accounts) {
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.length === 0) {
        return renderConnectorAccountEmptyState();
    }
    return `
        <div class="connectors-account-list">
            ${rows.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const status = String(account?.status || 'disabled').trim() || 'disabled';
                const statusLabel = account?.running === true
                    ? t('settings.gateway.status_running')
                    : t(`automation.status.${status}`);
                const tokenConfigured = account?.secret_status?.bot_token_configured === true;
                const allowedChannelIds = Array.isArray(account?.allowed_channel_ids)
                    ? account.allowed_channel_ids.map(value => String(value || '').trim()).filter(Boolean)
                    : [];
                const applicationId = String(account?.application_id || '').trim();
                const lastError = account?.last_error
                    ? `${t('settings.gateway.last_error')}: ${String(account.last_error)}`
                    : '';
                return renderConnectorAccountRow({
                    id: accountId,
                    title: String(account?.display_name || accountId),
                    chips: [
                        statusLabel,
                        tokenConfigured ? t('settings.triggers.credentials_ready') : t('settings.triggers.credentials_missing'),
                        formatMessage('settings.gateway.discord_allowed_channel_count', { count: allowedChannelIds.length }),
                    ],
                    meta: [
                        account?.workspace_id ? String(account.workspace_id) : '',
                        applicationId,
                        lastError,
                    ],
                    actions: [
                        {
                            attr: 'data-feature-discord-toggle',
                            label: status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'),
                        },
                        { attr: 'data-feature-discord-edit', label: t('settings.action.edit') },
                        { attr: 'data-feature-discord-delete', label: t('settings.action.delete') },
                    ],
                });
            }).join('')}
        </div>
    `;
}

function renderConnectorXiaolubanAccountList(accounts) {
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.length === 0) {
        return renderConnectorAccountEmptyState();
    }
    return `
        <div class="connectors-account-list">
            ${rows.map(account => {
                const accountId = String(account?.account_id || '').trim();
                const status = String(account?.status || 'disabled').trim() || 'disabled';
                const derivedUid = String(account?.derived_uid || '').trim();
                const tokenConfigured = account?.secret_status?.token_configured === true;
                const workspaceIds = Array.isArray(account?.notification_workspace_ids)
                    ? account.notification_workspace_ids.map(value => String(value || '').trim()).filter(Boolean)
                    : [];
                const receiverLabel = formatXiaolubanReceiverSummary(account);
                const imStatus = getXiaolubanImStatus(account);
                return renderConnectorAccountRow({
                    id: accountId,
                    title: String(account?.display_name || accountId),
                    chips: [
                        t(`automation.status.${status}`),
                        tokenConfigured ? t('settings.triggers.credentials_ready') : t('settings.triggers.credentials_missing'),
                        formatMessage('settings.gateway.xiaoluban_notification_workspace_count', { count: workspaceIds.length }),
                        formatMessage('settings.gateway.xiaoluban_im_summary', { status: imStatus }),
                        derivedUid,
                    ],
                    meta: [
                        accountId ? formatMessage('settings.gateway.xiaoluban_internal_id_copy', { account_id: accountId }) : '',
                        formatMessage('settings.gateway.xiaoluban_notification_receiver_summary', { receiver: receiverLabel }),
                    ],
                    actions: [
                        {
                            attr: 'data-feature-xiaoluban-toggle',
                            label: status === 'enabled' ? t('settings.gateway.disable_account') : t('settings.gateway.enable_account'),
                        },
                        { attr: 'data-feature-xiaoluban-edit', label: t('settings.action.edit') },
                        { attr: 'data-feature-xiaoluban-delete', label: t('settings.action.delete') },
                    ],
                });
            }).join('')}
        </div>
    `;
}

function renderConnectorAccountRow({ id, title, chips, meta, actions }) {
    const visibleChips = Array.isArray(chips)
        ? chips.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const visibleMeta = Array.isArray(meta)
        ? meta.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const visibleActions = Array.isArray(actions) ? actions : [];
    return `
        <article class="connectors-account-row">
            <div class="connectors-account-main">
                <div class="connectors-account-title-row">
                    <strong>${escapeHtml(title)}</strong>
                    ${visibleChips.length > 0 ? `
                        <div class="connectors-account-chips">
                            ${visibleChips.map(value => `<span>${escapeHtml(value)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                ${visibleMeta.length > 0 ? `<p>${visibleMeta.map(escapeHtml).join(' · ')}</p>` : ''}
            </div>
            <div class="connectors-account-actions">
                ${visibleActions.map(action => `
                    <button class="settings-inline-action settings-list-action" type="button" ${action.attr}="${escapeHtml(id)}">${escapeHtml(action.label)}</button>
                `).join('')}
            </div>
        </article>
    `;
}

function renderConnectorAccountEmptyState() {
    return `
        <div class="connectors-account-empty">
            ${escapeHtml(t('feature.connectors.accounts.empty'))}
        </div>
    `;
}

function bindConnectorConfigModalHandlers(root) {
    root.querySelectorAll('[data-connector-modal-close]').forEach(button => {
        button.addEventListener('click', () => {
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                connectorModalProvider: '',
            };
            renderGatewayFeatureModal();
        });
    });
    root.querySelectorAll('[data-connector-configure]').forEach(button => {
        button.addEventListener('click', () => {
            void handleConnectConnectorFromModal(button.getAttribute('data-connector-configure'));
        });
    });
    root.querySelectorAll('[data-feature-w3-username]').forEach(input => {
        input.addEventListener('input', () => {
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                w3Draft: {
                    ...currentGatewayFeatureState.w3Draft,
                    username: String(input.value || ''),
                },
            };
        });
    });
    root.querySelectorAll('[data-feature-w3-password]').forEach(input => {
        input.addEventListener('input', () => {
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                w3Draft: {
                    ...currentGatewayFeatureState.w3Draft,
                    password: String(input.value || ''),
                },
            };
            const toggleBtn = root.querySelector('[data-feature-w3-password-toggle]');
            if (toggleBtn) {
                const hasVal = Boolean(input.value.trim());
                const hasPersisted = currentGatewayFeatureState.w3Connector?.has_password === true;
                toggleBtn.style.display = (hasVal || hasPersisted) ? '' : 'none';
            }
        });
    });
    root.querySelectorAll('[data-feature-w3-password-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const nextRevealed = !currentGatewayFeatureState.w3PasswordRevealed;
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                w3PasswordRevealed: nextRevealed,
            };
            const passwordInput = root.querySelector('[data-feature-w3-password]');
            if (passwordInput) {
                passwordInput.type = nextRevealed ? 'text' : 'password';
            }
            btn.className = 'secure-input-btn' + (nextRevealed ? ' is-active' : '');
            const label = nextRevealed ? t('settings.model.hide_password') : t('settings.model.show_password');
            btn.title = label;
            btn.setAttribute('aria-label', label);
        });
    });
    root.querySelectorAll('[data-feature-w3-save]').forEach(button => {
        button.addEventListener('click', () => {
            void handleSaveW3Connector();
        });
    });
}

function renderGatewayFeatureView({ restoreSearchFocus = false, searchSelectionStart = null, searchSelectionEnd = null } = {}) {
    hideProjectViewToolbar();
    if (!els.projectViewContent) {
        return;
    }
    els.projectViewContent.innerHTML = `
        ${renderConnectorsCardPageMarkup({
            connectorsResponse: currentGatewayFeatureState.connectorsResponse,
            connectorsError: currentGatewayFeatureState.connectorsError,
            runtimeToolsResponse: currentGatewayFeatureState.runtimeToolsResponse,
            runtimeToolsError: currentGatewayFeatureState.runtimeToolsError,
            runtimeToolJobs: currentGatewayFeatureState.runtimeToolJobs,
            systemPathBusy: currentGatewayFeatureState.runtimeToolsSystemPathBusy,
            systemPathAdded: currentGatewayFeatureState.runtimeToolsSystemPathAdded,
            systemPathMessage: currentGatewayFeatureState.runtimeToolsSystemPathMessage,
            systemPathTone: currentGatewayFeatureState.runtimeToolsSystemPathTone,
            searchQuery: currentGatewayFeatureState.connectorSearch,
            statusFilter: currentGatewayFeatureState.connectorStatusFilter,
        })}
    `;
    els.projectViewContent.querySelectorAll('[data-connectors-search]').forEach(input => {
        input.addEventListener('input', () => {
            const nextSearch = String(input.value || '');
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                connectorSearch: nextSearch,
            };
            renderGatewayFeatureView({
                restoreSearchFocus: true,
                searchSelectionStart: typeof input.selectionStart === 'number'
                    ? input.selectionStart
                    : nextSearch.length,
                searchSelectionEnd: typeof input.selectionEnd === 'number'
                    ? input.selectionEnd
                    : nextSearch.length,
            });
        });
    });
    els.projectViewContent.querySelectorAll('[data-connectors-filter]').forEach(button => {
        button.addEventListener('click', () => {
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                connectorStatusFilter: String(button.getAttribute('data-connectors-filter') || 'all').trim() || 'all',
            };
            renderGatewayFeatureView();
        });
    });
    els.projectViewContent.querySelectorAll('[data-connectors-retry]').forEach(button => {
        button.addEventListener('click', () => {
            retryGatewayConnectors();
        });
    });
    els.projectViewContent.querySelectorAll('[data-runtime-tools-retry]').forEach(button => {
        button.addEventListener('click', () => {
            retryGatewayRuntimeTools();
        });
    });
    els.projectViewContent.querySelectorAll('[data-connector-open]').forEach(button => {
        button.addEventListener('click', () => {
            void handleOpenConnectorCard(button.getAttribute('data-connector-open'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-connector-manage]').forEach(button => {
        button.addEventListener('click', () => {
            void handleManageConnectorCard(button.getAttribute('data-connector-manage'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-runtime-tool-download]').forEach(button => {
        button.addEventListener('click', () => {
            void handleDownloadRuntimeTool(button.getAttribute('data-runtime-tool-download'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-runtime-tool-copy-path]').forEach(button => {
        button.addEventListener('click', () => {
            void handleCopyRuntimeToolPath(button.getAttribute('data-runtime-tool-copy-path'));
        });
    });
    els.projectViewContent.querySelectorAll('[data-runtime-tools-system-path-add]').forEach(button => {
        button.addEventListener('click', () => {
            void handleAddRuntimeToolsSystemPath();
        });
    });
    bindGatewayRecordHandlers();
    renderGatewayFeatureModal();
    if (restoreSearchFocus) {
        restoreConnectorSearchFocus(searchSelectionStart, searchSelectionEnd);
    }
}

function retryGatewayConnectors() {
    if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, currentFeatureRequestToken)) {
        return;
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        connectorsResponse: null,
        connectorsError: '',
    };
    renderGatewayFeatureView();
    void loadGatewayConnectors(currentFeatureRequestToken);
}

function retryGatewayRuntimeTools() {
    if (!isCurrentFeatureRequest(FEATURE_VIEW_IDS.gateway, currentFeatureRequestToken)) {
        return;
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        runtimeToolsResponse: null,
        runtimeToolsError: '',
    };
    renderGatewayFeatureView();
    void loadGatewayRuntimeTools(currentFeatureRequestToken);
}

function restoreConnectorSearchFocus(selectionStart, selectionEnd) {
    const input = els.projectViewContent?.querySelector?.('[data-connectors-search]');
    if (!input || typeof input.focus !== 'function') {
        return;
    }
    input.focus({ preventScroll: true });
    if (typeof input.setSelectionRange !== 'function') {
        return;
    }
    const inputLength = String(input.value || '').length;
    const start = typeof selectionStart === 'number'
        ? Math.min(Math.max(selectionStart, 0), inputLength)
        : inputLength;
    const end = typeof selectionEnd === 'number'
        ? Math.min(Math.max(selectionEnd, 0), inputLength)
        : start;
    input.setSelectionRange(start, end);
}

async function handleOpenConnectorCard(provider) {
    const normalizedProvider = String(provider || '').trim();
    if (normalizedProvider === 'github') {
        await openAutomationGitHubView('access');
        return;
    }
    if (normalizedProvider === W3_PLATFORM) {
        await loadW3ConnectorState();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            connectorModalProvider: normalizedProvider,
        };
        renderGatewayFeatureModal();
        return;
    }
    if (normalizedProvider === RELAY_KNOWLEDGE_PLATFORM) {
        return;
    }
    const item = getConnectorItemByProvider(normalizedProvider);
    if (Number(item?.account_count || 0) === 0) {
        await handleConnectConnectorFromModal(normalizedProvider);
        return;
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        connectorModalProvider: normalizedProvider,
    };
    renderGatewayFeatureModal();
}

async function handleManageConnectorCard(provider) {
    const normalizedProvider = String(provider || '').trim();
    if (normalizedProvider === 'github') {
        await openAutomationGitHubView('access');
        return;
    }
    if (normalizedProvider === W3_PLATFORM) {
        await loadW3ConnectorState();
    }
    if (normalizedProvider === RELAY_KNOWLEDGE_PLATFORM) {
        return;
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        connectorModalProvider: normalizedProvider,
    };
    renderGatewayFeatureModal();
}

async function handleAddRuntimeToolsSystemPath() {
    if (currentGatewayFeatureState.runtimeToolsSystemPathBusy) {
        return;
    }
    if (
        currentGatewayFeatureState.runtimeToolsSystemPathAdded
        || currentGatewayFeatureState.runtimeToolsResponse?.system_path?.added
    ) {
        const confirmed = await showConfirmDialog({
            title: t('feature.connectors.runtime_tools.system_path_reset_title'),
            message: t('feature.connectors.runtime_tools.system_path_reset_message'),
            confirmLabel: t('feature.connectors.runtime_tools.system_path_reset_confirm'),
            cancelLabel: t('settings.action.cancel'),
        });
        if (!confirmed) {
            return;
        }
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        runtimeToolsSystemPathBusy: true,
        runtimeToolsSystemPathMessage: '',
        runtimeToolsSystemPathTone: '',
    };
    renderGatewayFeatureView();
    renderGatewayFeatureModal();
    try {
        const result = await addRuntimeToolsSystemPath();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolsSystemPathBusy: false,
            runtimeToolsSystemPathAdded: true,
            runtimeToolsResponse: withRuntimeToolsSystemPathAdded(
                currentGatewayFeatureState.runtimeToolsResponse,
                result,
            ),
            runtimeToolsSystemPathMessage: String(result?.message || t('feature.connectors.runtime_tools.system_path_success')),
            runtimeToolsSystemPathTone: 'success',
        };
        if (currentFeatureViewId === FEATURE_VIEW_IDS.gateway) {
            renderGatewayFeatureView();
            renderGatewayFeatureModal();
            showToast({
                title: t('feature.connectors.runtime_tools.system_path_add'),
                message: t('feature.connectors.runtime_tools.system_path_success'),
                tone: 'success',
            });
        }
    } catch (error) {
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolsSystemPathBusy: false,
            runtimeToolsSystemPathMessage: String(error?.message || error || ''),
            runtimeToolsSystemPathTone: 'danger',
        };
        if (currentFeatureViewId === FEATURE_VIEW_IDS.gateway) {
            renderGatewayFeatureView();
            renderGatewayFeatureModal();
            showToast({
                title: t('feature.connectors.runtime_tools.system_path_failed'),
                message: String(error?.message || error || ''),
                tone: 'danger',
            });
        }
    }
}

function withRuntimeToolsSystemPathAdded(runtimeToolsResponse, result) {
    const existingState = runtimeToolsResponse?.system_path || {};
    const binDir = String(result?.bin_dir || existingState.bin_dir || '');
    return {
        ...(runtimeToolsResponse || {}),
        system_path: {
            ...existingState,
            supported: existingState.supported !== false,
            added: true,
            ...(binDir ? { bin_dir: binDir } : {}),
        },
    };
}

async function handleDownloadRuntimeTool(toolId) {
    const normalizedToolId = String(toolId || '').trim();
    if (!normalizedToolId) {
        return;
    }
    try {
        const job = await startRuntimeToolDownload(normalizedToolId);
        if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolJobs: {
                ...currentGatewayFeatureState.runtimeToolJobs,
                [job.job_id]: job,
            },
        };
        await refreshRuntimeToolsStatus();
        if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway) {
            return;
        }
        renderGatewayFeatureView();
        renderGatewayFeatureModal();
        pollRuntimeToolDownload(job.job_id);
    } catch (error) {
        showToast({
            title: t('feature.connectors.runtime_tools.download_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function refreshRuntimeToolsStatus() {
    try {
        const runtimeToolsResponse = await fetchRuntimeTools();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            runtimeToolsResponse,
            runtimeToolsError: '',
            runtimeToolsSystemPathAdded: Boolean(runtimeToolsResponse?.system_path?.added),
        };
        resumeRuntimeToolDownloadPolling(runtimeToolsResponse);
    } catch (error) {
        sysLog(`Failed to refresh runtime tools: ${error?.message || error}`, 'log-warn');
    }
}

function pollRuntimeToolDownload(jobId) {
    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId || runtimeToolPollingJobIds.has(normalizedJobId)) {
        return;
    }
    runtimeToolPollingJobIds.add(normalizedJobId);
    scheduleRuntimeToolDownloadPoll(normalizedJobId);
}

function scheduleRuntimeToolDownloadPoll(normalizedJobId) {
    window.setTimeout(async () => {
        if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway) {
            runtimeToolPollingJobIds.delete(normalizedJobId);
            return;
        }
        try {
            const job = await fetchRuntimeToolDownload(normalizedJobId);
            if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway) {
                runtimeToolPollingJobIds.delete(normalizedJobId);
                return;
            }
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                runtimeToolJobs: {
                    ...currentGatewayFeatureState.runtimeToolJobs,
                    [job.job_id]: job,
                },
            };
            await refreshRuntimeToolsStatus();
            if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway) {
                runtimeToolPollingJobIds.delete(normalizedJobId);
                return;
            }
            renderGatewayFeatureView();
            renderGatewayFeatureModal();
            if (job.status === 'queued' || job.status === 'running') {
                scheduleRuntimeToolDownloadPoll(normalizedJobId);
            } else {
                runtimeToolPollingJobIds.delete(normalizedJobId);
            }
        } catch (error) {
            runtimeToolPollingJobIds.delete(normalizedJobId);
            sysLog(`Failed to poll runtime tool download: ${error?.message || error}`, 'log-warn');
        }
    }, 600);
}

function resumeRuntimeToolDownloadPolling(runtimeToolsResponse) {
    const items = Array.isArray(runtimeToolsResponse?.items)
        ? runtimeToolsResponse.items
        : [];
    items.forEach(item => {
        const status = String(item?.status || '').trim();
        const jobId = String(item?.download_job_id || '').trim();
        if (jobId && status === 'downloading') {
            pollRuntimeToolDownload(jobId);
        }
    });
}

function getConnectorItemByProvider(provider) {
    const items = Array.isArray(currentGatewayFeatureState.connectorsResponse?.items)
        ? currentGatewayFeatureState.connectorsResponse.items
        : [];
    return items.find(item => String(item?.provider || item?.connector_id || '').trim() === provider) || null;
}

function bindGatewayRecordHandlers(root = els.projectViewContent) {
    if (!root) {
        return;
    }
    root.querySelectorAll('[data-feature-gateway-add-feishu]').forEach(button => {
        button.addEventListener('click', () => {
            void handleCreateFeishuFeatureTrigger();
        });
    });
    root.querySelectorAll('[data-feature-gateway-add-xiaoluban]').forEach(button => {
        button.addEventListener('click', () => {
            void handleCreateXiaolubanFeatureAccount();
        });
    });
    root.querySelectorAll('[data-feature-gateway-connect-wechat]').forEach(button => {
        button.addEventListener('click', () => {
            void handleStartWeChatFeatureLogin();
        });
    });
    root.querySelectorAll('[data-feature-gateway-add-discord]').forEach(button => {
        button.addEventListener('click', () => {
            void handleCreateDiscordFeatureAccount();
        });
    });
    root.querySelectorAll('[data-feature-feishu-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleEditFeishuFeatureTrigger(button.getAttribute('data-feature-feishu-edit'));
        });
    });
    root.querySelectorAll('[data-feature-feishu-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleToggleFeishuFeatureTrigger(button.getAttribute('data-feature-feishu-toggle'));
        });
    });
    root.querySelectorAll('[data-feature-feishu-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleDeleteFeishuFeatureTrigger(button.getAttribute('data-feature-feishu-delete'));
        });
    });
    root.querySelectorAll('[data-feature-xiaoluban-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleEditXiaolubanFeatureAccount(button.getAttribute('data-feature-xiaoluban-edit'));
        });
    });
    root.querySelectorAll('[data-feature-xiaoluban-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleToggleXiaolubanFeatureAccount(button.getAttribute('data-feature-xiaoluban-toggle'));
        });
    });
    root.querySelectorAll('[data-feature-xiaoluban-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleDeleteXiaolubanFeatureAccount(button.getAttribute('data-feature-xiaoluban-delete'));
        });
    });
    root.querySelectorAll('[data-feature-wechat-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleEditWeChatFeatureAccount(button.getAttribute('data-feature-wechat-edit'));
        });
    });
    root.querySelectorAll('[data-feature-wechat-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleToggleWeChatFeatureAccount(button.getAttribute('data-feature-wechat-toggle'));
        });
    });
    root.querySelectorAll('[data-feature-wechat-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleDeleteWeChatFeatureAccount(button.getAttribute('data-feature-wechat-delete'));
        });
    });
    root.querySelectorAll('[data-feature-discord-edit]').forEach(button => {
        button.addEventListener('click', () => {
            void handleEditDiscordFeatureAccount(button.getAttribute('data-feature-discord-edit'));
        });
    });
    root.querySelectorAll('[data-feature-discord-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            void handleToggleDiscordFeatureAccount(button.getAttribute('data-feature-discord-toggle'));
        });
    });
    root.querySelectorAll('[data-feature-discord-delete]').forEach(button => {
        button.addEventListener('click', () => {
            void handleDeleteDiscordFeatureAccount(button.getAttribute('data-feature-discord-delete'));
        });
    });
}

async function handleConnectConnectorFromModal(provider) {
    const normalizedProvider = String(provider || '').trim();
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        connectorModalProvider: '',
    };
    renderGatewayFeatureModal();
    if (normalizedProvider === 'github') {
        await openAutomationGitHubView('access');
        return;
    }
    if (normalizedProvider === FEISHU_PLATFORM) {
        await handleCreateFeishuFeatureTrigger();
        return;
    }
    if (normalizedProvider === WECHAT_PLATFORM) {
        await handleStartWeChatFeatureLogin();
        return;
    }
    if (normalizedProvider === DISCORD_PLATFORM) {
        await handleCreateDiscordFeatureAccount();
        return;
    }
    if (normalizedProvider === XIAOLUBAN_PLATFORM) {
        await handleCreateXiaolubanFeatureAccount();
        return;
    }
    if (normalizedProvider === W3_PLATFORM) {
        await loadW3ConnectorState();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            connectorModalProvider: normalizedProvider,
        };
        renderGatewayFeatureModal();
        return;
    }
    if (normalizedProvider === RELAY_KNOWLEDGE_PLATFORM) {
        return;
    }
}

async function handleCopyRuntimeToolPath(toolId) {
    const path = getRuntimeToolPath(toolId);
    if (!path) {
        showToast({
            title: t('feature.connectors.runtime_tools.copy_path_failed'),
            message: t('feature.connectors.runtime_tools.copy_path_empty'),
            tone: 'danger',
        });
        return;
    }
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
        showToast({
            title: t('feature.connectors.runtime_tools.copy_path_failed'),
            message: t('message.copy_unavailable_message'),
            tone: 'danger',
        });
        return;
    }
    try {
        await clipboard.writeText(path);
        showToast({
            title: t('feature.connectors.runtime_tools.copy_path_success'),
            message: t('feature.connectors.runtime_tools.copy_path_success_message'),
            tone: 'success',
        });
    } catch (error) {
        showToast({
            title: t('feature.connectors.runtime_tools.copy_path_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

function getRuntimeToolPath(toolId) {
    const normalizedToolId = String(toolId || '').trim();
    if (!normalizedToolId) {
        return '';
    }
    const items = Array.isArray(currentGatewayFeatureState.runtimeToolsResponse?.items)
        ? currentGatewayFeatureState.runtimeToolsResponse.items
        : [];
    const item = items.find(candidate => String(candidate?.tool_id || '').trim() === normalizedToolId);
    if (!item) {
        return '';
    }
    const jobId = String(item?.download_job_id || '').trim();
    const job = jobId && currentGatewayFeatureState.runtimeToolJobs
        ? currentGatewayFeatureState.runtimeToolJobs[jobId]
        : null;
    return String(job?.path || item?.path || '').trim();
}

async function loadW3ConnectorState() {
    try {
        const status = await fetchW3Connector();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            w3Connector: status,
            w3Draft: {
                username: String(status?.username || ''),
                password: '',
            },
            w3StatusMessage: '',
            w3StatusTone: '',
            w3PasswordRevealed: false,
        };
    } catch (error) {
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            w3StatusMessage: String(error?.message || error || ''),
            w3StatusTone: 'danger',
        };
    }
}

async function refreshConnectorsAfterW3Change() {
    try {
        const connectorsResponse = await fetchConnectors();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            connectorsResponse,
        };
    } catch (error) {
        logWarn('Failed to refresh connectors after W3 change', error);
    }
}

function buildW3CredentialPayload() {
    const draft = currentGatewayFeatureState.w3Draft || {};
    const status = currentGatewayFeatureState.w3Connector || {};
    const username = String(draft.username || status.username || '').trim();
    const password = String(draft.password || '').trim();
    const payload = { username };
    if (password) {
        payload.password = password;
    }
    return payload;
}

function formatW3ConnectorResultMessage(result, fallbackMessage = '') {
    if (result?.ok === true) {
        return t(`${W3_MESSAGE_KEY_PREFIX}saved`);
    }
    const errorCode = String(result?.error_code || '').trim();
    if (errorCode) {
        const key = `${W3_MESSAGE_KEY_PREFIX}${errorCode}`;
        const localized = t(key);
        if (localized !== key) {
            return localized;
        }
    }
    return String(result?.message || fallbackMessage || '').trim();
}

function formatW3ConnectorStatusMessage(status, fallbackMessage = '') {
    const errorCode = String(status?.last_login_error_code || status?.error_code || '').trim();
    if (!errorCode) {
        return String(fallbackMessage || '').trim();
    }
    return formatW3ConnectorResultMessage(
        {
            ok: false,
            error_code: errorCode,
            message: status?.last_error,
        },
        fallbackMessage,
    );
}

function validateW3CredentialPayload(payload) {
    const status = currentGatewayFeatureState.w3Connector || {};
    const hasSavedPassword = status.has_password === true;
    if (!String(payload?.username || '').trim()) {
        return {
            ok: false,
            error_code: 'missing_credentials',
        };
    }
    if (!String(payload?.password || '').trim() && !hasSavedPassword) {
        return {
            ok: false,
            error_code: 'missing_credentials',
        };
    }
    return { ok: true };
}

async function handleSaveW3Connector() {
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        w3Saving: true,
        w3StatusMessage: '',
        w3StatusTone: '',
    };
    renderGatewayFeatureModal();
    try {
        const payload = buildW3CredentialPayload();
        const validation = validateW3CredentialPayload(payload);
        if (validation.ok !== true) {
            const message = formatW3ConnectorResultMessage(validation);
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                w3Saving: false,
                w3StatusMessage: message,
                w3StatusTone: 'danger',
            };
            renderGatewayFeatureModal();
            return;
        }
        const result = await saveW3Connector(payload);
        const message = formatW3ConnectorResultMessage(result);
        const status = await fetchW3Connector();
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            w3Connector: status,
            w3Draft: {
                username: String(status?.username || ''),
                password: '',
            },
            w3Saving: false,
            w3PasswordRevealed: false,
            w3StatusMessage: message,
            w3StatusTone: result?.ok === true ? 'success' : 'danger',
        };
        await refreshConnectorsAfterW3Change();
        renderGatewayFeatureView();
        showToast({
            title: t('feature.connectors.w3.saved_title'),
            message,
            tone: result?.ok === true ? 'success' : 'danger',
        });
    } catch (error) {
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            w3Saving: false,
            w3StatusMessage: String(error?.message || error || ''),
            w3StatusTone: 'danger',
        };
        renderGatewayFeatureModal();
    }
}

async function handleSkillsReloadFeature() {
    try {
        await reloadSkillsConfig();
        showToast({
            title: t('settings.system.skills_reloaded'),
            message: t('settings.system.skills_reloaded_message'),
            tone: 'success',
        });
        await openSkillsFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.system.reload_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

function notifyGitHubFeatureSaved(label) {
    showToast({
        title: t('feature.automation.github_saved_title'),
        message: String(label || t('feature.automation.github_saved_message')),
        tone: 'success',
    });
}

function notifyGitHubFeatureDeleted(label) {
    showToast({
        title: t('feature.automation.github_deleted_title'),
        message: String(label || t('feature.automation.github_deleted_message')),
        tone: 'success',
    });
}

function notifyGitHubFeatureError(error) {
    showToast({
        title: t('feature.automation.github_failed_title'),
        message: String(error?.message || error || t('feature.automation.github_failed_message')),
        tone: 'danger',
    });
}

async function handleGitHubCreateAccountFeature() {
    try {
        const account = await requestGitHubAccountInput(
            null,
            async payload => await createGitHubTriggerAccount(payload),
        );
        if (!account) {
            return;
        }
        notifyGitHubFeatureSaved(resolveGitHubAccountLabel(account));
        await openAutomationGitHubView(`account:${String(account?.account_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubEditAccountFeature(accountId) {
    try {
        const account = findGitHubAccountById(accountId);
        if (!account) {
            return;
        }
        const updated = await requestGitHubAccountInput(
            account,
            async payload => await updateGitHubTriggerAccount(
                String(account.account_id || '').trim(),
                payload,
            ),
        );
        if (!updated) {
            return;
        }
        notifyGitHubFeatureSaved(resolveGitHubAccountLabel(updated));
        await openAutomationGitHubView(`account:${String(updated?.account_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubToggleAccountFeature(accountId) {
    try {
        const account = findGitHubAccountById(accountId);
        if (!account) {
            return;
        }
        const updated = String(account?.status || '').trim() === 'enabled'
            ? await disableGitHubTriggerAccount(String(account.account_id || '').trim())
            : await enableGitHubTriggerAccount(String(account.account_id || '').trim());
        notifyGitHubFeatureSaved(resolveGitHubAccountLabel(updated));
        await openAutomationGitHubView(`account:${String(updated?.account_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubDeleteAccountFeature(accountId) {
    try {
        const account = findGitHubAccountById(accountId);
        if (!account) {
            return;
        }
        const confirmed = await showConfirmDialog({
            title: t('settings.action.delete'),
            message: formatMessage('feature.automation.github_delete_account_confirm', {
                name: resolveGitHubAccountLabel(account),
            }),
            tone: 'danger',
            confirmLabel: t('settings.action.delete'),
            cancelLabel: t('settings.action.cancel'),
        });
        if (!confirmed) {
            return;
        }
        await deleteGitHubTriggerAccount(String(account.account_id || '').trim());
        notifyGitHubFeatureDeleted(resolveGitHubAccountLabel(account));
        await openAutomationGitHubView('access');
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubCreateRepoFeature(accountId) {
    try {
        const account = findGitHubAccountById(accountId);
        if (!account) {
            return;
        }
        const payload = await requestGitHubRepoInput(account);
        if (!payload) {
            return;
        }
        const repo = await createGitHubRepoSubscription(payload);
        notifyGitHubFeatureSaved(String(repo?.full_name || ''));
        await openAutomationGitHubView(`repo:${String(repo?.repo_subscription_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubEditRepoFeature(repoSubscriptionId) {
    try {
        const repo = findGitHubRepoById(repoSubscriptionId);
        if (!repo) {
            return;
        }
        const account = findGitHubAccountById(repo.account_id);
        if (!account) {
            return;
        }
        const payload = await requestGitHubRepoInput(account, repo);
        if (!payload) {
            return;
        }
        const updated = await updateGitHubRepoSubscription(String(repo.repo_subscription_id || '').trim(), payload);
        notifyGitHubFeatureSaved(String(updated?.full_name || ''));
        await openAutomationGitHubView(`repo:${String(updated?.repo_subscription_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubToggleRepoFeature(repoSubscriptionId) {
    try {
        const repo = findGitHubRepoById(repoSubscriptionId);
        if (!repo) {
            return;
        }
        const updated = repo?.enabled === false
            ? await enableGitHubRepoSubscription(String(repo.repo_subscription_id || '').trim())
            : await disableGitHubRepoSubscription(String(repo.repo_subscription_id || '').trim());
        notifyGitHubFeatureSaved(String(updated?.full_name || ''));
        await openAutomationGitHubView(`repo:${String(updated?.repo_subscription_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubDeleteRepoFeature(repoSubscriptionId) {
    try {
        const repo = findGitHubRepoById(repoSubscriptionId);
        if (!repo) {
            return;
        }
        const confirmed = await showConfirmDialog({
            title: t('settings.action.delete'),
            message: formatMessage('feature.automation.github_delete_repo_confirm', {
                name: String(repo?.full_name || ''),
            }),
            tone: 'danger',
            confirmLabel: t('settings.action.delete'),
            cancelLabel: t('settings.action.cancel'),
        });
        if (!confirmed) {
            return;
        }
        await deleteGitHubRepoSubscription(String(repo.repo_subscription_id || '').trim());
        notifyGitHubFeatureDeleted(String(repo?.full_name || ''));
        await openAutomationGitHubView(`account:${String(repo?.account_id || '').trim()}`);
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubCreateRuleFeature(repoSubscriptionId) {
    try {
        const repo = findGitHubRepoById(repoSubscriptionId);
        if (!repo) {
            return;
        }
        const created = await requestGitHubRuleInput(
            repo,
            null,
            async payload => await createGitHubTriggerRule(payload),
        );
        if (!created) {
            return;
        }
        upsertGitHubRuleInState(created);
        notifyGitHubFeatureSaved(String(repo?.full_name || ''));
        renderAutomationHomeView();
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubEditRuleFeature(triggerRuleId) {
    try {
        const rule = findGitHubRuleById(triggerRuleId);
        if (!rule) {
            return;
        }
        const repo = findGitHubRepoById(rule.repo_subscription_id);
        if (!repo) {
            return;
        }
        const updated = await requestGitHubRuleInput(
            repo,
            rule,
            async payload => await updateGitHubTriggerRule(
                String(rule.trigger_rule_id || '').trim(),
                payload,
            ),
        );
        if (!updated) {
            return;
        }
        upsertGitHubRuleInState(updated);
        notifyGitHubFeatureSaved(String(rule?.name || ''));
        renderAutomationHomeView();
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubToggleRuleFeature(triggerRuleId) {
    try {
        const rule = findGitHubRuleById(triggerRuleId);
        if (!rule) {
            return;
        }
        const updated = rule?.enabled === false
            ? await enableGitHubTriggerRule(String(rule.trigger_rule_id || '').trim())
            : await disableGitHubTriggerRule(String(rule.trigger_rule_id || '').trim());
        upsertGitHubRuleInState(updated);
        notifyGitHubFeatureSaved(String(updated?.name || ''));
        renderAutomationHomeView();
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleGitHubDeleteRuleFeature(triggerRuleId) {
    try {
        const rule = findGitHubRuleById(triggerRuleId);
        if (!rule) {
            return;
        }
        const confirmed = await showConfirmDialog({
            title: t('settings.action.delete'),
            message: formatMessage('feature.automation.github_delete_rule_confirm', {
                name: String(rule?.name || ''),
            }),
            tone: 'danger',
            confirmLabel: t('settings.action.delete'),
            cancelLabel: t('settings.action.cancel'),
        });
        if (!confirmed) {
            return;
        }
        await deleteGitHubTriggerRule(String(rule.trigger_rule_id || '').trim());
        removeGitHubRuleFromState(rule.trigger_rule_id);
        notifyGitHubFeatureDeleted(String(rule?.name || ''));
        renderAutomationHomeView();
    } catch (error) {
        notifyGitHubFeatureError(error);
    }
}

async function handleAutomationCreateFeature() {
    const created = await requestAutomationProjectInput({}, {
        submitHandler: async payload => await createAutomationProject(payload),
    });
    if (!created) {
        return;
    }
    document.dispatchEvent(new CustomEvent('agent-teams-projects-changed'));
    await openAutomationHomeView(String(created?.automation_project_id || ''));
}

async function handleAutomationSelectFeatureProject(projectId) {
    selectedAutomationHomeProjectId = String(projectId || '').trim();
    await openAutomationHomeView(selectedAutomationHomeProjectId);
}

async function handleAutomationEditFeatureProject() {
    const project = currentAutomationHomeDetail?.project;
    if (!project) {
        return;
    }
    const updated = await requestAutomationProjectInput(project, {
        submitHandler: async payload => await updateAutomationProject(
            String(project?.automation_project_id || ''),
            payload,
        ),
    });
    if (!updated) {
        return;
    }
    document.dispatchEvent(new CustomEvent('agent-teams-projects-changed'));
    await openAutomationHomeView(
        String(updated?.automation_project_id || project?.automation_project_id || ''),
    );
}

async function handleAutomationRunFeatureProject() {
    const project = currentAutomationHomeDetail?.project;
    if (!project) {
        return;
    }
    const projectId = String(project?.automation_project_id || '').trim();
    const result = await runAutomationProject(String(project?.automation_project_id || ''));
    sysLog(formatAutomationRunLogMessage(result));
    dispatchAutomationRunSessionUpsert(project, result);
    document.dispatchEvent(new CustomEvent('agent-teams-projects-changed'));
    await openAutomationHomeView(projectId);
}

function dispatchAutomationRunSessionUpsert(project, result) {
    const sessionId = String(result?.session_id || '').trim();
    if (!sessionId) {
        return;
    }
    const workspaceId = String(project?.workspace_id || '').trim();
    const projectId = String(project?.automation_project_id || '').trim();
    const title = String(
        project?.display_name
        || project?.name
        || project?.prompt
        || sessionId,
    ).trim();
    document.dispatchEvent(new CustomEvent('agent-teams-session-upserted', {
        detail: {
            sessionId,
            workspaceId,
            session: {
                session_id: sessionId,
                workspace_id: workspaceId,
                project_kind: 'automation',
                project_id: projectId,
                metadata: title ? { title } : {},
            },
        },
    }));
}

async function handleAutomationToggleFeatureProject() {
    const project = currentAutomationHomeDetail?.project;
    if (!project) {
        return;
    }
    const projectId = String(project?.automation_project_id || '').trim();
    if (String(project?.status || '').trim() === 'enabled') {
        await disableAutomationProject(projectId);
    } else {
        await enableAutomationProject(projectId);
    }
    await openAutomationHomeView(projectId);
}

async function handleAutomationDeleteFeatureProject() {
    const project = currentAutomationHomeDetail?.project;
    if (!project) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('settings.action.delete'),
        message: String(project?.display_name || project?.name || ''),
        tone: 'danger',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    await deleteAutomationProject(String(project?.automation_project_id || '').trim());
    document.dispatchEvent(new CustomEvent('agent-teams-projects-changed'));
    await openAutomationHomeView();
}

async function handleCreateFeishuFeatureTrigger() {
    try {
        if (currentGatewayFeatureState.workspaces.length === 0) {
            throw new Error(t('settings.triggers.no_workspaces'));
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatModalOpen: false,
            wechatLoginSession: null,
            wechatConnecting: false,
            feishuEditingTriggerId: '',
            feishuDraft: createFeishuTriggerDraft(),
        };
        renderGatewayFeatureModal();
    } catch (error) {
        showToast({
            title: t('settings.triggers.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleEditFeishuFeatureTrigger(triggerId) {
    const trigger = currentGatewayFeatureState.feishuTriggers.find(item => item.trigger_id === String(triggerId || '').trim());
    if (!trigger) {
        return;
    }
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        wechatModalOpen: false,
        wechatLoginSession: null,
        wechatConnecting: false,
        feishuEditingTriggerId: trigger.trigger_id,
        feishuDraft: createFeishuTriggerDraft(trigger),
    };
    renderGatewayFeatureModal();
}

function handleCancelFeishuFeatureTrigger() {
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        feishuEditingTriggerId: '',
        feishuDraft: null,
    };
    renderGatewayFeatureView();
}

async function handleSaveFeishuFeatureTrigger() {
    try {
        const draft = syncFeishuDraftFromEditor();
        if (!draft) {
            return;
        }
        const isEditing = String(currentGatewayFeatureState.feishuEditingTriggerId || '').trim().length > 0;
        const payload = buildFeishuTriggerPayload(draft, { requireSecret: !isEditing });
        if (isEditing) {
            await updateTrigger(String(currentGatewayFeatureState.feishuEditingTriggerId || '').trim(), payload);
        } else {
            await createTrigger(payload);
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            feishuEditingTriggerId: '',
            feishuDraft: null,
        };
        showToast({
            title: t('settings.triggers.saved'),
            message: t('settings.triggers.saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.triggers.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleToggleFeishuFeatureTrigger(triggerId) {
    const trigger = currentGatewayFeatureState.feishuTriggers.find(item => item.trigger_id === String(triggerId || '').trim());
    if (!trigger) {
        return;
    }
    if (String(trigger?.status || '').trim() === 'enabled') {
        await disableTrigger(trigger.trigger_id);
    } else {
        await enableTrigger(trigger.trigger_id);
    }
    await openImFeatureView();
}

async function handleDeleteFeishuFeatureTrigger(triggerId) {
    const trigger = currentGatewayFeatureState.feishuTriggers.find(item => item.trigger_id === String(triggerId || '').trim());
    if (!trigger) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('settings.triggers.delete_confirm_title'),
        message: formatMessage('settings.triggers.delete_confirm_message', {
            name: String(trigger?.display_name || trigger?.name || trigger?.trigger_id || ''),
        }),
        tone: 'danger',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    await deleteTrigger(trigger.trigger_id);
    showToast({
        title: t('settings.triggers.deleted'),
        message: t('settings.triggers.deleted_message'),
        tone: 'success',
    });
    await openImFeatureView();
}

async function handleStartWeChatFeatureLogin() {
    const requestId = Date.now();
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        feishuEditingTriggerId: '',
        feishuDraft: null,
        wechatLoginRequestId: requestId,
        wechatModalOpen: true,
        wechatLoginSession: null,
        wechatStatusMessage: t('settings.gateway.login_waiting'),
        wechatStatusTone: '',
        wechatConnecting: true,
    };
    renderGatewayFeatureModal();
    try {
        const result = await startWeChatGatewayLogin({});
        if (currentGatewayFeatureState.wechatLoginRequestId !== requestId || currentGatewayFeatureState.wechatModalOpen !== true) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatModalOpen: true,
            wechatLoginSession: {
                session_key: String(result?.session_key || '').trim(),
                qr_code_url: String(result?.qr_code_url || '').trim(),
            },
        };
        renderGatewayFeatureModal();
        void finalizeWeChatFeatureLogin(String(result?.session_key || '').trim());
    } catch (error) {
        if (currentGatewayFeatureState.wechatLoginRequestId !== requestId || currentGatewayFeatureState.wechatModalOpen !== true) {
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatModalOpen: true,
            wechatLoginSession: null,
            wechatConnecting: false,
            wechatStatusMessage: String(error?.message || t('settings.gateway.login_failed')),
            wechatStatusTone: 'danger',
        };
        renderGatewayFeatureModal();
    }
}

function handleCloseWeChatFeatureModal() {
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        wechatLoginRequestId: 0,
        wechatModalOpen: false,
        wechatLoginSession: null,
        wechatConnecting: false,
    };
    renderGatewayFeatureModal();
}

async function finalizeWeChatFeatureLogin(sessionKey) {
    try {
        const result = await waitWeChatGatewayLogin({
            session_key: sessionKey,
            timeout_ms: 480000,
        });
        if (String(currentGatewayFeatureState?.wechatLoginSession?.session_key || '') !== String(sessionKey || '')) {
            return;
        }
        if (result?.connected === true) {
            showToast({
                title: t('settings.gateway.login_success'),
                message: String(result?.message || t('settings.gateway.login_success')),
                tone: 'success',
            });
            currentGatewayFeatureState = {
                ...currentGatewayFeatureState,
                wechatLoginRequestId: 0,
                wechatModalOpen: false,
                wechatConnecting: false,
                wechatLoginSession: null,
                wechatStatusMessage: String(result?.message || t('settings.gateway.login_success')),
                wechatStatusTone: 'success',
            };
            await openImFeatureView();
            return;
        }
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatLoginRequestId: 0,
            wechatModalOpen: true,
            wechatConnecting: false,
            wechatStatusMessage: String(result?.message || t('settings.gateway.login_failed')),
            wechatStatusTone: 'danger',
        };
        renderGatewayFeatureModal();
    } catch (error) {
        currentGatewayFeatureState = {
            ...currentGatewayFeatureState,
            wechatLoginRequestId: 0,
            wechatModalOpen: true,
            wechatLoginSession: null,
            wechatConnecting: false,
            wechatStatusMessage: String(error?.message || t('settings.gateway.login_failed')),
            wechatStatusTone: 'danger',
        };
        renderGatewayFeatureModal();
    }
}

async function handleEditWeChatFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.wechatAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    try {
        const payload = await requestWeChatAccountInput(account);
        if (!payload) {
            return;
        }
        await updateWeChatGatewayAccount(account.account_id, payload);
        showToast({
            title: t('settings.gateway.saved'),
            message: t('settings.gateway.saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.gateway.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

function resolveDiscordFeatureDialog(payload) {
    const resolve = currentGatewayFeatureState.discordDialogResolve;
    currentGatewayFeatureState = {
        ...currentGatewayFeatureState,
        discordEditingAccountId: '',
        discordDraft: null,
        discordDialogResolve: null,
    };
    renderGatewayFeatureModal();
    if (typeof resolve === 'function') {
        resolve(payload);
    }
}

function handleCancelDiscordFeatureAccount() {
    resolveDiscordFeatureDialog(null);
}

function handleSaveDiscordFeatureAccount() {
    try {
        const payload = buildDiscordAccountPayloadFromEditor(
            currentGatewayFeatureState.discordDraft,
        );
        setDiscordEditorError('');
        resolveDiscordFeatureDialog(payload);
    } catch (error) {
        setDiscordEditorError(readErrorDetail(error));
    }
}

async function handleCreateDiscordFeatureAccount() {
    try {
        const payload = await requestDiscordAccountInput(null);
        if (!payload) {
            return;
        }
        await createDiscordGatewayAccount(payload);
        showToast({
            title: t('settings.gateway.discord_saved_title'),
            message: t('settings.gateway.discord_saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.gateway.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleEditDiscordFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.discordAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    try {
        const payload = await requestDiscordAccountInput(account);
        if (!payload) {
            return;
        }
        await updateDiscordGatewayAccount(account.account_id, payload);
        showToast({
            title: t('settings.gateway.discord_saved_title'),
            message: t('settings.gateway.discord_saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.gateway.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleCreateXiaolubanFeatureAccount() {
    try {
        const result = await requestXiaolubanAccountInput(
            null,
            async submission => await saveXiaolubanAccountFormSubmission(null, submission),
        );
        if (!result) {
            return;
        }
        showToast({
            title: t('settings.gateway.xiaoluban_saved_title'),
            message: result.forwarding_command
                ? formatMessage('settings.gateway.xiaoluban_im_forwarding_saved_message', {
                    command: normalizeXiaolubanForwardingCommand(result.forwarding_command),
                })
                : t('settings.gateway.xiaoluban_saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.gateway.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleEditXiaolubanFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.xiaolubanAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    try {
        const result = await requestXiaolubanAccountInput(
            account,
            async submission => await saveXiaolubanAccountFormSubmission(account, submission),
        );
        if (!result) {
            return;
        }
        showToast({
            title: t('settings.gateway.xiaoluban_saved_title'),
            message: result.forwarding_command
                ? formatMessage('settings.gateway.xiaoluban_im_forwarding_saved_message', {
                    command: normalizeXiaolubanForwardingCommand(result.forwarding_command),
                })
                : t('settings.gateway.xiaoluban_saved_message'),
            tone: 'success',
        });
        await openImFeatureView();
    } catch (error) {
        showToast({
            title: t('settings.gateway.save_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function handleToggleXiaolubanFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.xiaolubanAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    if (String(account?.status || '').trim() === 'enabled') {
        await disableXiaolubanGatewayAccount(account.account_id);
    } else {
        await enableXiaolubanGatewayAccount(account.account_id);
    }
    await openImFeatureView();
}

async function handleDeleteXiaolubanFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.xiaolubanAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('settings.gateway.delete_confirm_title'),
        message: formatMessage('settings.gateway.delete_confirm_message', {
            name: String(account?.display_name || account?.account_id || ''),
        }),
        tone: 'danger',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    await deleteXiaolubanGatewayAccount(account.account_id);
    showToast({
        title: t('settings.gateway.deleted'),
        message: t('settings.gateway.xiaoluban_deleted_message'),
        tone: 'success',
    });
    await openImFeatureView();
}

async function handleToggleDiscordFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.discordAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    if (String(account?.status || '').trim() === 'enabled') {
        await disableDiscordGatewayAccount(account.account_id);
    } else {
        await enableDiscordGatewayAccount(account.account_id);
    }
    await openImFeatureView();
}

async function handleDeleteDiscordFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.discordAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('settings.gateway.delete_confirm_title'),
        message: formatMessage('settings.gateway.delete_confirm_message', {
            name: String(account?.display_name || account?.account_id || ''),
        }),
        tone: 'danger',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    await deleteDiscordGatewayAccount(account.account_id);
    showToast({
        title: t('settings.gateway.discord_deleted_title'),
        message: t('settings.gateway.discord_deleted_message'),
        tone: 'success',
    });
    await openImFeatureView();
}

async function handleToggleWeChatFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.wechatAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    if (String(account?.status || '').trim() === 'enabled') {
        await disableWeChatGatewayAccount(account.account_id);
    } else {
        await enableWeChatGatewayAccount(account.account_id);
    }
    await openImFeatureView();
}

async function handleDeleteWeChatFeatureAccount(accountId) {
    const account = currentGatewayFeatureState.wechatAccounts.find(item => item.account_id === String(accountId || '').trim());
    if (!account) {
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('settings.gateway.delete_confirm_title'),
        message: formatMessage('settings.gateway.delete_confirm_message', {
            name: String(account?.display_name || account?.account_id || ''),
        }),
        tone: 'danger',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (!confirmed) {
        return;
    }
    await deleteWeChatGatewayAccount(account.account_id);
    showToast({
        title: t('settings.gateway.deleted'),
        message: t('settings.gateway.deleted_message'),
        tone: 'success',
    });
    await openImFeatureView();
}

function renderAutomationLoadingState(project) {
    renderToolbar(project, {
        summary: t('workspace_view.loading_automation_project'),
        mode: 'automation',
        actions: '',
    });
    if (els.projectViewContent) {
        els.projectViewContent.innerHTML = `
            <div class="workspace-view-grid">
                <section class="workspace-view-panel">
                    <div class="workspace-view-panel-header">
                        <h3>Schedule</h3>
                        <span class="workspace-view-panel-meta">Automation</span>
                    </div>
                    ${renderInlineState(t('workspace_view.loading_automation_details'))}
                </section>
                <section class="workspace-view-panel workspace-diff-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.recent_runs'))}</h3>
                        <span class="workspace-view-panel-meta"></span>
                    </div>
                    ${renderInlineState(t('workspace_view.loading_automation_sessions'))}
                </section>
            </div>
        `;
    }
}

function renderAutomationErrorState(project, error) {
    renderToolbar(project, {
        summary: t('workspace_view.failed_automation_project'),
        mode: 'automation',
        actions: '',
    });
    if (els.projectViewContent) {
        els.projectViewContent.innerHTML = `
            <div class="workspace-view-empty-state is-error">
                <p>${escapeHtml(t('workspace_view.failed_automation_project'))}</p>
                <p>${escapeHtml(String(error?.message || error || ''))}</p>
            </div>
        `;
    }
}

function renderAutomationProjectView(project, sessions, workspaceRecord = null, deliveryBindings = []) {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const status = String(project?.status || '').trim() || 'unknown';
    const scheduleMode = String(project?.schedule_mode || '').trim() || 'cron';
    const scheduleText = describeAutomationScheduleText(project);
    const cronDescription = describeAutomationSchedule(project);
    const timezone = String(project?.timezone || 'UTC').trim() || 'UTC';
    const workspaceId = String(project?.workspace_id || '').trim() || 'automation-system';
    const workspaceRootPath = String(workspaceRecord?.root_path || '').trim() || t('automation.workspace.missing');
    const nextRunAt = formatAutomationUtcDateTime(project?.next_run_at, t('automation.detail.not_scheduled'));
    const lastRunAt = formatAutomationUtcDateTime(project?.last_run_started_at, t('automation.detail.never'));
    const lastError = String(project?.last_error || '').trim() || t('automation.detail.none');
    const deliveryBinding = project?.delivery_binding && typeof project.delivery_binding === 'object'
        ? project.delivery_binding
        : null;
    const deliveryBindingName = deliveryBinding
        ? resolveAutomationBindingDisplayName(deliveryBinding, deliveryBindings)
        : '';
    const deliveryEvents = Array.isArray(project?.delivery_events) ? project.delivery_events : [];
    const deliveryEventsLabel = deliveryEvents.length > 0 ? deliveryEvents.join(', ') : 'none';
    const runButtonLabel = t('automation.action.run_now');
    const toggleButtonLabel = status === 'enabled' ? t('automation.action.disable') : t('automation.action.enable');
    const statusLabel = t(`automation.status.${status}`);

    renderToolbar(project, {
        summary: `${statusLabel} - ${safeSessions.length} ${t('automation.detail.session_count')}`,
        mode: 'automation',
        actions: `
            <button class="secondary-btn project-view-toolbar-btn" type="button" data-automation-edit>${escapeHtml(t('automation.action.edit'))}</button>
            <button class="secondary-btn project-view-toolbar-btn" type="button" data-automation-run>${escapeHtml(runButtonLabel)}</button>
            <button class="secondary-btn project-view-toolbar-btn" type="button" data-automation-toggle>${escapeHtml(toggleButtonLabel)}</button>
        `,
    });
    if (!els.projectViewContent) {
        return;
    }

    els.projectViewContent.innerHTML = `
        <div class="automation-detail-layout">
            <section class="workspace-view-panel automation-hero-panel">
                <div class="automation-hero-grid">
                    <div class="automation-hero-copy">
                        <span class="automation-status-pill is-${escapeHtml(status.toLowerCase())}">${escapeHtml(statusLabel)}</span>
                        <h3>${escapeHtml(t('automation.detail.overview'))}</h3>
                    </div>
                    <div class="automation-stat-grid">
                        <article class="automation-stat-card automation-stat-card-wide">
                            <span>${escapeHtml(t('automation.detail.schedule'))}</span>
                            <strong>${escapeHtml(scheduleText)}</strong>
                            <p class="automation-stat-note">${escapeHtml(cronDescription)}</p>
                        </article>
                        <article class="automation-stat-card">
                            <span>${escapeHtml(t('automation.field.workspace'))}</span>
                            <strong>${escapeHtml(workspaceId)}</strong>
                        </article>
                        <article class="automation-stat-card">
                            <span>${escapeHtml(t('automation.detail.timezone'))}</span>
                            <strong>${escapeHtml(timezone)}</strong>
                        </article>
                        <article class="automation-stat-card">
                            <span>${escapeHtml(t('automation.detail.next_run'))}</span>
                            <strong>${escapeHtml(nextRunAt)}</strong>
                        </article>
                        <article class="automation-stat-card">
                            <span>${escapeHtml(t('automation.detail.last_run'))}</span>
                            <strong>${escapeHtml(lastRunAt)}</strong>
                        </article>
                    </div>
                </div>
            </section>
            <section class="workspace-view-panel automation-prompt-panel">
                <div class="workspace-view-panel-header">
                    <h3>${escapeHtml(t('automation.detail.prompt'))}</h3>
                </div>
                <div class="automation-prompt-content">${escapeHtml(String(project?.prompt || ''))}</div>
            </section>
            <div class="automation-detail-grid">
                <section class="workspace-view-panel automation-detail-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('automation.detail.configuration'))}</h3>
                        <span class="workspace-view-panel-meta">${escapeHtml(scheduleMode)}</span>
                    </div>
                    <div class="automation-detail-section">
                        <div class="automation-detail-grid-compact">
                            <div class="automation-detail-row">
                                <span class="automation-detail-label">${escapeHtml(t('automation.detail.schedule'))}</span>
                                <span class="automation-detail-value">${escapeHtml(scheduleText)}</span>
                            </div>
                            <div class="automation-detail-row">
                                <span class="automation-detail-label">${escapeHtml(t('automation.detail.timezone'))}</span>
                                <span class="automation-detail-value">${escapeHtml(timezone)}</span>
                            </div>
                            <div class="automation-detail-row">
                                <span class="automation-detail-label">${escapeHtml(t('automation.detail.next_run'))}</span>
                                <span class="automation-detail-value">${escapeHtml(nextRunAt)}</span>
                            </div>
                            <div class="automation-detail-row">
                                <span class="automation-detail-label">${escapeHtml(t('automation.detail.last_run'))}</span>
                                <span class="automation-detail-value">${escapeHtml(lastRunAt)}</span>
                            </div>
                        </div>
                        <div class="automation-detail-row">
                            <span class="automation-detail-label">${escapeHtml(t('automation.detail.last_error'))}</span>
                            <span class="automation-detail-value${lastError === t('automation.detail.none') ? '' : ' is-error'}">${escapeHtml(lastError)}</span>
                        </div>
                    </div>
                </section>
                <section class="workspace-view-panel automation-binding-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.bindings'))}</h3>
                        <span class="workspace-view-panel-meta">${escapeHtml(deliveryBinding ? resolveDeliveryProviderLabel(deliveryBinding?.provider) : t('workspace_view.delivery_disabled'))}</span>
                    </div>
                    <div class="automation-binding-list">
                        <div class="automation-binding-item">
                            <span>${escapeHtml(t('automation.field.workspace'))}</span>
                            <strong>${escapeHtml(workspaceId)}</strong>
                        </div>
                        <div class="automation-binding-item">
                            <span>${escapeHtml(t('automation.workspace.directory'))}</span>
                            <code>${escapeHtml(workspaceRootPath)}</code>
                        </div>
                        <div class="automation-binding-item">
                            <span>${escapeHtml(t('workspace_view.delivery_events'))}</span>
                            <strong>${escapeHtml(deliveryEventsLabel)}</strong>
                        </div>
                        ${deliveryBinding ? `
                            <div class="automation-binding-item">
                                <span>${escapeHtml(t('workspace_view.delivery_provider'))}</span>
                                <strong>${escapeHtml(resolveDeliveryProviderLabel(deliveryBinding?.provider))}</strong>
                            </div>
                            <div class="automation-binding-item">
                                <span>${escapeHtml(t('workspace_view.delivery_target'))}</span>
                                <strong>${escapeHtml(deliveryBindingName)}</strong>
                            </div>
                            ${String(deliveryBinding?.provider || '').trim().toLowerCase() === FEISHU_PLATFORM ? `
                                <div class="automation-binding-item">
                                <span>${escapeHtml(t('workspace_view.chat_type'))}</span>
                                <strong>${escapeHtml(String(deliveryBinding.chat_type || ''))}</strong>
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                </section>
            </div>
            <section class="workspace-view-panel automation-runs-panel">
                <div class="workspace-view-panel-header">
                    <h3>${escapeHtml(t('automation.detail.recent_runs'))}</h3>
                    <span class="workspace-view-panel-meta">${escapeHtml(String(safeSessions.length))} ${escapeHtml(t('automation.detail.session_count'))}</span>
                </div>
                ${safeSessions.length > 0 ? `
                    <div class="automation-run-list">
                        ${safeSessions.map(session => {
                            const sessionStatus = String(session.active_run_status || 'completed').trim() || 'completed';
                            const sessionStatusLabel = t(`automation.run_status.${sessionStatus}`);
                            const sessionTitle = String(session?.metadata?.title || session.session_id || '').trim() || String(session.session_id || '');
                            return `
                                <article class="automation-run-card" data-automation-session-id="${escapeHtml(String(session.session_id || ''))}">
                                    <div class="automation-run-card-header">
                                        <span class="workspace-diff-status is-modified">${escapeHtml(sessionStatusLabel)}</span>
                                        <code class="workspace-diff-path">${escapeHtml(sessionTitle)}</code>
                                    </div>
                                    <div class="automation-run-card-meta">
                                        <span>${escapeHtml(t('automation.detail.updated_at'))}</span>
                                        <strong>${escapeHtml(String(session.updated_at || ''))}</strong>
                                    </div>
                                </article>
                            `;
                        }).join('')}
                    </div>
                ` : renderInlineState(t('automation.detail.no_runs'))}
            </section>
        </div>
    `;

    const editAction = async () => {
        const updated = await requestAutomationProjectInput(project, {
            submitHandler: async payload => await updateAutomationProject(
                String(project?.automation_project_id || ''),
                payload,
            ),
        });
        if (!updated) {
            return;
        }
        document.dispatchEvent(new CustomEvent('agent-teams-projects-changed'));
        await openAutomationProjectView(
            updated?.automation_project_id ? updated : project,
        );
    };
    document.querySelector('[data-automation-edit]')?.addEventListener('click', editAction);
    const runAction = async () => {
        const result = await runAutomationProject(String(project?.automation_project_id || ''));
        if (result?.reused_bound_session === true) {
            sysLog(formatAutomationRunLogMessage(result));
            await openAutomationProjectView(project);
            return;
        }
        if (result?.session_id) {
            document.dispatchEvent(new CustomEvent('agent-teams-select-session', { detail: { sessionId: result.session_id } }));
        }
    };
    document.querySelector('[data-automation-run]')?.addEventListener('click', runAction);
    const toggleAction = async () => {
        const projectId = String(project?.automation_project_id || '');
        if (status === 'enabled') {
            await disableAutomationProject(projectId);
        } else {
            await enableAutomationProject(projectId);
        }
        await openAutomationProjectView(project);
    };
    document.querySelector('[data-automation-toggle]')?.addEventListener('click', toggleAction);
    els.projectViewContent.querySelectorAll('[data-automation-session-id]').forEach(node => {
        node.addEventListener('click', () => {
            const sessionId = String(node.getAttribute('data-automation-session-id') || '').trim();
            if (!sessionId) return;
            document.dispatchEvent(new CustomEvent('agent-teams-select-session', { detail: { sessionId } }));
        });
    });
}

function renderLoadingState(workspace) {
    renderToolbar(workspace, {
        summary: t('workspace_view.loading'),
    });
    if (els.projectViewContent) {
        els.projectViewContent.innerHTML = `
            <div class="workspace-view-grid">
                <section class="workspace-view-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.tree'))}</h3>
                        <span class="workspace-view-panel-meta"></span>
                    </div>
                    <div class="workspace-tree-shell">
                        ${renderInlineState(t('workspace_view.loading_tree'))}
                    </div>
                </section>
                <section class="workspace-view-panel workspace-diff-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.diffs'))}</h3>
                        <span class="workspace-view-panel-meta"></span>
                    </div>
                    ${renderInlineState(t('workspace_view.loading_diffs'))}
                </section>
            </div>
        `;
    }
}

function renderErrorState(workspace, error) {
    renderToolbar(workspace, {
        summary: t('workspace_view.load_failed'),
    });
    if (els.projectViewContent) {
        els.projectViewContent.innerHTML = `
            <div class="workspace-view-empty-state is-error">
                <p>${escapeHtml(t('workspace_view.load_failed'))}</p>
                <p>${escapeHtml(String(error?.message || error || ''))}</p>
            </div>
        `;
    }
}

function renderWorkspaceSnapshot(workspace, snapshot) {
    renderToolbar(workspace, { summary: summarizeDiffState() });
    if (!els.projectViewContent) {
        return;
    }
    const activeTree = getCurrentMountTree();

    els.projectViewContent.innerHTML = `
        <div class="workspace-view-layout">
            ${renderWorkspaceMountStrip(snapshot)}
            <div class="workspace-view-grid">
                <section class="workspace-view-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.tree'))}</h3>
                        <span class="workspace-view-panel-meta">${renderWorkspaceRootMeta(snapshot)}</span>
                    </div>
                    <div class="workspace-tree-shell">
                        ${renderTree(activeTree)}
                    </div>
                </section>
                <section class="workspace-view-panel workspace-diff-panel">
                    <div class="workspace-view-panel-header">
                        <h3>${escapeHtml(t('workspace_view.diffs'))}</h3>
                        <span class="workspace-view-panel-meta">${escapeHtml(resolveDiffPanelMeta())}</span>
                    </div>
                    ${renderDiffSection()}
                </section>
            </div>
        </div>
    `;

    bindWorkspaceHeaderInteractions();
    bindTreeInteractions();
    bindDiffInteractions();
}

function renderWorkspaceRootMeta(snapshot) {
    const mount = resolveCurrentMount(snapshot);
    const rootPath = String(mount?.rootReference || snapshot?.root_path || '').trim();
    if (!rootPath) {
        return '';
    }
    if (mount?.provider !== 'local') {
        return `
            <span class="workspace-view-root-meta" title="${escapeHtml(rootPath)}">
                <span class="workspace-view-provider-badge is-remote">${escapeHtml(renderMountProviderLabel(mount))}</span>
                <span class="workspace-view-path-text">${escapeHtml(rootPath)}</span>
            </span>
        `;
    }
    const openLabel = t('workspace_view.open_root');
    return `
        <button
            type="button"
            class="workspace-view-path-button"
            data-open-workspace-root
            title="${escapeHtml(openLabel)}"
            aria-label="${escapeHtml(`${openLabel}: ${rootPath}`)}"
        >
            <span class="workspace-view-path-text">${escapeHtml(rootPath)}</span>
        </button>
    `;
}

function getProjectViewToolbarElement() {
    return els.projectViewTitle?.closest?.('.project-view-toolbar') || null;
}

function hideProjectViewToolbar() {
    const toolbar = getProjectViewToolbarElement();
    toolbar?.classList?.add('is-hidden');
    if (els.projectViewTitle) {
        els.projectViewTitle.textContent = '';
    }
    if (els.projectViewSummary) {
        els.projectViewSummary.textContent = '';
    }
    if (els.projectViewToolbarActions) {
        els.projectViewToolbarActions.innerHTML = '';
    }
    els.projectViewReloadBtn = null;
    els.projectViewCloseBtn = null;
}

function resetFeatureSurface({ clearContent = true } = {}) {
    unmountBoardTodoBoard();
    els.projectViewContent?.classList?.remove('is-boards-feature');
    const toolbar = getProjectViewToolbarElement();
    toolbar?.classList?.remove('is-hidden');
    if (els.projectViewToolbarActions) {
        els.projectViewToolbarActions.innerHTML = '';
    }
    if (clearContent && els.projectViewContent) {
        els.projectViewContent.innerHTML = '';
    }
    els.projectViewReloadBtn = null;
    els.projectViewCloseBtn = null;
}

function renderToolbar(projectOrWorkspace, { title = '', summary = '', mode = 'workspace', actions = '', showClose = true } = {}) {
    const toolbar = getProjectViewToolbarElement();
    toolbar?.classList?.remove('is-hidden');
    if (els.projectViewTitle) {
        if (title) {
            els.projectViewTitle.textContent = title;
        } else {
            els.projectViewTitle.textContent = mode === 'automation'
                ? formatAutomationTitle(projectOrWorkspace)
                : formatWorkspaceTitle(projectOrWorkspace);
        }
    }
    if (els.projectViewSummary) {
        els.projectViewSummary.textContent = summary;
    }
    if (els.projectViewToolbarActions) {
        const reloadAction = mode === 'feature'
            ? ''
            : `<button id="project-view-reload" class="secondary-btn" type="button" data-project-view-reload>${escapeHtml(t('workspace_view.reload'))}</button>`;
        const closeAction = showClose
            ? `
                <button id="project-view-close" class="icon-btn" type="button" title="${escapeHtml(t('workspace_view.back'))}" aria-label="${escapeHtml(t('workspace_view.back'))}" data-project-view-close>
                    <svg viewBox="0 0 24 24" fill="none" class="icon" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            `
            : '';
        els.projectViewToolbarActions.innerHTML = `
            ${actions || ''}
            ${reloadAction}
            ${closeAction}
        `;
        els.projectViewReloadBtn = els.projectViewToolbarActions.querySelector('[data-project-view-reload]');
        els.projectViewCloseBtn = els.projectViewToolbarActions.querySelector('[data-project-view-close]');
        if (els.projectViewReloadBtn) {
            els.projectViewReloadBtn.onclick = () => {
                void refreshProjectView();
            };
        }
        if (els.projectViewCloseBtn) {
            els.projectViewCloseBtn.onclick = () => {
                hideProjectView();
            };
        }
    }
}

function summarizeDiffState() {
    if (currentDiffState.status === 'loading') {
        return t('workspace_view.loading_diffs');
    }
    if (currentDiffState.status === 'error') {
        return t('workspace_view.load_failed');
    }
    if (currentDiffState.status !== 'ready') {
        return '';
    }
    if (currentDiffState.isGitRepository !== true) {
        return currentDiffState.diffMessage || t('workspace_view.not_git_repository');
    }
    if (currentDiffState.diffMessage) {
        return currentDiffState.diffMessage;
    }
    return formatTemplate(t('workspace_view.diff_summary'), {
        count: currentDiffState.diffFiles.length,
    });
}

function resolveDiffPanelMeta() {
    if (currentDiffState.status === 'loading') {
        return t('workspace_view.loading_diffs');
    }
    if (currentDiffState.status !== 'ready') {
        return '';
    }
    if (currentDiffState.isGitRepository !== true || currentDiffState.diffMessage) {
        return '';
    }
    return summarizeDiffState();
}

function resolveWorkspaceInitialMountName(workspace) {
    const explicitMountName = String(workspace?.default_mount_name || '').trim();
    if (explicitMountName) {
        return explicitMountName;
    }
    const mounts = Array.isArray(workspace?.mounts) ? sortWorkspaceMounts(workspace.mounts) : [];
    const firstMount = mounts.find(Boolean) || null;
    return String(firstMount?.mount_name || '').trim() || null;
}

function isMountShellSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(snapshot, 'default_mount_name')
        || Object.prototype.hasOwnProperty.call(snapshot, 'default_mount_root');
}

function normalizeWorkspaceRecordMountOrder(workspace) {
    if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace.mounts)) {
        return workspace;
    }
    return {
        ...workspace,
        mounts: sortWorkspaceMounts(workspace.mounts),
    };
}

function normalizeWorkspaceMounts(workspace, snapshot, defaultMountName, rootPath) {
    const workspaceMounts = Array.isArray(workspace?.mounts)
        ? sortWorkspaceMounts(workspace.mounts)
            .map(mount => normalizeWorkspaceMount(mount, defaultMountName, rootPath))
            .filter(Boolean)
        : [];
    if (workspaceMounts.length > 0) {
        return sortWorkspaceMounts(workspaceMounts);
    }
    const shellChildren = Array.isArray(snapshot?.tree?.children) ? snapshot.tree.children : [];
    if (shellChildren.length > 0 && isMountShellSnapshot(snapshot)) {
        const mounts = sortWorkspaceMounts(shellChildren
            .map(child => {
                const mountName = String(child?.path || child?.name || '').trim();
                if (!mountName) {
                    return null;
                }
                const fallbackProvider = mountName === defaultMountName && rootPath ? 'local' : 'unknown';
                return {
                    mountName,
                    provider: fallbackProvider,
                    rootReference: mountName === defaultMountName ? rootPath : '',
                    sshProfileId: '',
                    isDefault: mountName === defaultMountName,
                    hasChildren: child?.has_children === true || child?.hasChildren === true,
                };
            })
            .filter(Boolean));
        if (mounts.length > 0) {
            return mounts;
        }
    }
    return [
        {
            mountName: defaultMountName,
            provider: rootPath ? 'local' : 'unknown',
            rootReference: rootPath,
            sshProfileId: '',
            isDefault: true,
            hasChildren: snapshot?.tree?.has_children === true || snapshot?.tree?.hasChildren === true,
        },
    ];
}

function sortWorkspaceMounts(mounts = []) {
    return [...mounts].sort(compareWorkspaceMounts);
}

function compareWorkspaceMounts(left, right) {
    const providerDelta = workspaceMountProviderOrder(left) - workspaceMountProviderOrder(right);
    if (providerDelta !== 0) {
        return providerDelta;
    }
    return compareWorkspaceMountNames(workspaceMountSortName(left), workspaceMountSortName(right));
}

function workspaceMountProviderOrder(mount) {
    const provider = String(mount?.provider || '').trim();
    if (provider === 'local') {
        return 0;
    }
    if (provider === 'ssh') {
        return 1;
    }
    return 2;
}

function workspaceMountSortName(mount) {
    return String(mount?.mount_name || mount?.mountName || '').trim();
}

function compareWorkspaceMountNames(leftName, rightName) {
    const left = String(leftName || '').toLowerCase();
    const right = String(rightName || '').toLowerCase();
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    const originalLeft = String(leftName || '');
    const originalRight = String(rightName || '');
    if (originalLeft < originalRight) {
        return -1;
    }
    if (originalLeft > originalRight) {
        return 1;
    }
    return 0;
}

function normalizeWorkspaceMount(mount, defaultMountName, rootPath) {
    if (!mount || typeof mount !== 'object') {
        return null;
    }
    const mountName = String(mount.mount_name || '').trim();
    if (!mountName) {
        return null;
    }
    const provider = String(mount.provider || '').trim() || 'unknown';
    const providerConfig = mount.provider_config && typeof mount.provider_config === 'object'
        ? mount.provider_config
        : {};
    const localRoot = String(providerConfig.root_path || '').trim();
    const remoteRoot = String(providerConfig.remote_root || '').trim();
    const sshProfileId = String(providerConfig.ssh_profile_id || '').trim();
    return {
        mountName,
        provider,
        rootReference: localRoot || remoteRoot || (mountName === defaultMountName ? rootPath : ''),
        sshProfileId,
        isDefault: mountName === defaultMountName,
        hasChildren: mount?.has_children === true || mount?.hasChildren === true,
    };
}

function renderWorkspaceMountStrip(snapshot) {
    const mounts = Array.isArray(snapshot?.mounts) ? sortWorkspaceMounts(snapshot.mounts) : [];
    if (!shouldRenderWorkspaceMountStrip(snapshot)) {
        return '';
    }
    return `
        <section class="workspace-mount-strip workspace-view-panel">
            <div class="workspace-view-panel-header">
                <div class="workspace-view-panel-header-copy">
                    <h3>${escapeHtml(t('workspace_view.mounts'))}</h3>
                    <span class="workspace-view-panel-meta">${escapeHtml(String(mounts.length))}</span>
                </div>
                <div class="workspace-panel-header-actions">
                    <button class="secondary-btn project-view-toolbar-btn workspace-panel-action-btn" type="button" data-workspace-add-mount>${escapeHtml(t('workspace_view.mount_add'))}</button>
                    <button class="secondary-btn project-view-toolbar-btn workspace-panel-action-btn" type="button" data-workspace-edit-mount>${escapeHtml(t('workspace_view.mount_edit'))}</button>
                    <button class="secondary-btn project-view-toolbar-btn workspace-panel-action-btn" type="button" data-workspace-open-settings>${escapeHtml(t('workspace_view.mount_profiles'))}</button>
                    <button class="secondary-btn project-view-toolbar-btn workspace-panel-action-btn" type="button" data-workspace-delete-mount ${mounts.length <= 1 ? 'disabled' : ''}>${escapeHtml(t('workspace_view.mount_remove'))}</button>
                </div>
            </div>
            <div class="workspace-mount-list">
                ${mounts.map(mount => renderWorkspaceMountCard(mount)).join('')}
            </div>
        </section>
    `;
}

function shouldRenderWorkspaceMountStrip(snapshot) {
    const mounts = Array.isArray(snapshot?.mounts) ? snapshot.mounts : [];
    return mounts.length > 0;
}

function renderWorkspaceMountCard(mount) {
    const mountName = String(mount?.mountName || '').trim();
    const rootReference = String(mount?.rootReference || '').trim();
    const sshProfileId = String(mount?.sshProfileId || '').trim();
    const isActive = resolveActiveMountName() === mountName;
    return `
        <button
            type="button"
            class="workspace-mount-card${isActive ? ' is-active' : ''}"
            data-workspace-mount="${escapeHtml(mountName)}"
            aria-pressed="${isActive ? 'true' : 'false'}"
        >
            <span class="workspace-mount-card-head">
                <strong>${escapeHtml(mountName)}</strong>
                <span class="workspace-mount-card-badges">
                    <span class="workspace-view-provider-badge">${escapeHtml(renderMountProviderLabel(mount))}</span>
                    ${mount?.isDefault ? `<span class="workspace-view-provider-badge is-default">${escapeHtml(t('workspace_view.mount_default'))}</span>` : ''}
                </span>
            </span>
            ${rootReference ? `<span class="workspace-mount-card-path">${escapeHtml(rootReference)}</span>` : ''}
            ${sshProfileId ? `<span class="workspace-mount-card-meta">${escapeHtml(`${t('workspace_view.mount_profile')}: ${sshProfileId}`)}</span>` : ''}
        </button>
    `;
}

function renderMountProviderLabel(mount) {
    const provider = String(mount?.provider || '').trim() || 'unknown';
    return t(`workspace_view.mount_provider.${provider}`);
}

function resolveWorkspaceMountName(candidateMountName, snapshot) {
    const mounts = Array.isArray(snapshot?.mounts) ? sortWorkspaceMounts(snapshot.mounts) : [];
    const normalizedCandidate = String(candidateMountName || '').trim();
    if (normalizedCandidate && mounts.some(mount => mount?.mountName === normalizedCandidate)) {
        return normalizedCandidate;
    }
    const defaultMountName = String(snapshot?.default_mount_name || '').trim();
    if (defaultMountName && mounts.some(mount => mount?.mountName === defaultMountName)) {
        return defaultMountName;
    }
    const firstMountName = String(mounts[0]?.mountName || '').trim();
    return firstMountName || null;
}

function resolveActiveMountName() {
    return currentSnapshot
        ? resolveWorkspaceMountName(currentMountName, currentSnapshot)
        : String(currentMountName || '').trim() || null;
}

function resolveCurrentMount(snapshot = currentSnapshot) {
    const mountName = resolveWorkspaceMountName(currentMountName, snapshot);
    if (!mountName) {
        return null;
    }
    const mounts = Array.isArray(snapshot?.mounts) ? snapshot.mounts : [];
    return mounts.find(mount => mount?.mountName === mountName) || null;
}

function createMountTreeRoot({ label = '.', hasChildren = false } = {}) {
    return {
        name: String(label || '.'),
        path: '.',
        kind: 'directory',
        hasChildren: hasChildren === true,
        children: [],
        childrenLoaded: false,
    };
}

function primeSnapshotMountTrees(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return;
    }
    if (snapshot.isMountShell === true) {
        for (const mount of Array.isArray(snapshot.mounts) ? snapshot.mounts : []) {
            if (currentMountTrees.has(mount.mountName)) {
                continue;
            }
            currentMountTrees.set(
                mount.mountName,
                createMountTreeRoot({
                    label: mount.mountName,
                    hasChildren: mount.hasChildren === true,
                }),
            );
        }
        return;
    }
    const mount = resolveCurrentMount(snapshot);
    const normalizedTree = cloneTreeNode(snapshot.tree);
    if (!mount || !normalizedTree) {
        return;
    }
    const existingTree = currentMountTrees.get(mount.mountName);
    if (existingTree) {
        mergeTreeState(normalizedTree, existingTree);
    }
    currentMountTrees.set(mount.mountName, normalizedTree);
}

function ensureCurrentMountTree() {
    const mount = resolveCurrentMount();
    if (!mount) {
        return null;
    }
    if (!currentMountTrees.has(mount.mountName)) {
        currentMountTrees.set(
            mount.mountName,
            createMountTreeRoot({
                label: mount.mountName,
                hasChildren: mount.hasChildren === true,
            }),
        );
    }
    return currentMountTrees.get(mount.mountName) || null;
}

function getCurrentMountTree() {
    const mountName = resolveActiveMountName();
    if (!mountName) {
        return null;
    }
    return currentMountTrees.get(mountName) || null;
}

function ensureActiveMountTreeLoaded(loadToken) {
    const tree = ensureCurrentMountTree();
    if (!currentSnapshot || !currentWorkspace) {
        return;
    }
    if (tree?.childrenLoaded === true) {
        loadingTreePaths.delete(buildTreeStateKey('.'));
        treeLoadErrors.delete(buildTreeStateKey('.'));
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        return;
    }
    loadingTreePaths.add(buildTreeStateKey('.'));
    treeLoadErrors.delete(buildTreeStateKey('.'));
    renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
    if (loadToken === currentLoadToken) {
        void loadWorkspaceTree('.');
    }
}

function buildTreeStateKey(path, mountName = resolveActiveMountName()) {
    const normalizedPath = String(path || '.').trim() || '.';
    const normalizedMountName = String(mountName || '').trim() || 'default';
    return `${normalizedMountName}:${normalizedPath}`;
}

function normalizeSnapshot(snapshot, workspace) {
    const isMountShell = isMountShellSnapshot(snapshot);
    const defaultMountName = String(
        snapshot?.default_mount_name
        || workspace?.default_mount_name
        || resolveWorkspaceInitialMountName(workspace)
        || 'default',
    ).trim() || 'default';
    const rootPath = String(snapshot?.root_path || snapshot?.default_mount_root || '').trim();
    const mounts = normalizeWorkspaceMounts(workspace, snapshot, defaultMountName, rootPath);
    return {
        workspace_id: String(snapshot?.workspace_id || workspace?.workspace_id || '').trim(),
        root_path: rootPath,
        default_mount_name: defaultMountName,
        isMountShell,
        mounts,
        tree: isMountShell ? null : normalizeTreeNode(snapshot?.tree, true),
    };
}

function normalizeTreeNode(node, childrenLoaded) {
    if (!node || typeof node !== 'object') {
        return null;
    }
    const isDirectory = node.kind === 'directory';
    const children = Array.isArray(node.children)
        ? node.children
            .map(child => normalizeTreeNode(child, false))
            .filter(Boolean)
        : [];
    return {
        name: String(node.name || node.path || '.'),
        path: String(node.path || '.').trim() || '.',
        kind: isDirectory ? 'directory' : 'file',
        hasChildren: node.has_children === true || node.hasChildren === true,
        children,
        childrenLoaded: childrenLoaded === true,
    };
}

function renderTree(tree) {
    if (!tree || typeof tree !== 'object') {
        return renderInlineState(t('workspace_view.loading_tree'));
    }
    const rootError = treeLoadErrors.get(buildTreeStateKey('.')) || '';
    if (tree.childrenLoaded !== true) {
        if (rootError) {
            return renderInlineState(rootError, 'is-error');
        }
        return renderInlineState(t('workspace_view.loading_tree'));
    }

    const children = Array.isArray(tree.children) ? tree.children : [];
    if (children.length === 0) {
        return renderInlineState(t('workspace_view.empty_tree'));
    }

    return `
        <div class="workspace-tree-root">
            ${children.map(child => renderTreeNode(child)).join('')}
        </div>
    `;
}

function renderTreeNode(node) {
    if (!node || typeof node !== 'object') {
        return '';
    }

    const nodePath = String(node.path || '.').trim() || '.';
    const nodeLabel = escapeHtml(node.name || node.path || '.');

    if (node.kind !== 'directory') {
        const isSelected = selectedTreePath === nodePath;
        return `
            <div class="workspace-tree-node is-file">
                <button
                    type="button"
                    class="workspace-tree-entry workspace-tree-file${isSelected ? ' is-selected' : ''}"
                    data-tree-file-path="${escapeHtml(nodePath)}"
                    aria-pressed="${isSelected ? 'true' : 'false'}"
                >
                    <span class="workspace-tree-chevron is-placeholder" aria-hidden="true"></span>
                    ${renderFileIcon()}
                    <span class="workspace-tree-label">${nodeLabel}</span>
                </button>
            </div>
        `;
    }

    const scopedPath = buildTreeStateKey(nodePath);
    const isExpanded = expandedTreePaths.has(scopedPath);
    const isLoading = loadingTreePaths.has(scopedPath);
    const loadError = treeLoadErrors.get(scopedPath) || '';
    return `
        <div class="workspace-tree-node is-directory">
            <button
                type="button"
                class="workspace-tree-toggle"
                data-tree-toggle-path="${escapeHtml(nodePath)}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
            >
                <span class="workspace-tree-chevron" aria-hidden="true">${isExpanded ? '&#9662;' : '&#9656;'}</span>
                ${renderFolderIcon(isExpanded)}
                <span class="workspace-tree-label">${nodeLabel}</span>
            </button>
            ${renderTreeChildren(node, { isExpanded, isLoading, loadError })}
        </div>
    `;
}

function renderTreeChildren(node, { isExpanded, isLoading, loadError }) {
    if (!isExpanded) {
        return '';
    }
    if (isLoading) {
        return `
            <div class="workspace-tree-children">
                ${renderTreePlaceholder(t('workspace_view.loading_directory'))}
            </div>
        `;
    }
    if (loadError) {
        return `
            <div class="workspace-tree-children">
                ${renderTreePlaceholder(loadError, 'is-error')}
            </div>
        `;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) {
        return '';
    }
    return `
        <div class="workspace-tree-children">
            ${children.map(child => renderTreeNode(child)).join('')}
        </div>
    `;
}

function renderTreePlaceholder(message, extraClass = '') {
    return `
        <div class="workspace-tree-placeholder ${extraClass}">
            <span>${escapeHtml(message)}</span>
        </div>
    `;
}

function renderDiffSection() {
    if (currentDiffState.status === 'loading') {
        return renderInlineState(t('workspace_view.loading_diffs'));
    }
    if (currentDiffState.status === 'error') {
        return renderInlineState(currentDiffState.diffMessage || t('workspace_view.load_failed'), 'is-error');
    }
    if (currentDiffState.status !== 'ready') {
        return renderInlineState(t('workspace_view.loading_diffs'));
    }
    if (currentDiffState.isGitRepository !== true) {
        return renderInlineState(currentDiffState.diffMessage || t('workspace_view.not_git_repository'));
    }
    if (currentDiffState.diffMessage) {
        return renderInlineState(currentDiffState.diffMessage, 'is-error');
    }
    if (currentDiffState.diffFiles.length === 0) {
        return renderInlineState(t('workspace_view.no_diffs'));
    }
    return `
        <div class="workspace-diff-list">
            ${currentDiffState.diffFiles.map(file => renderDiffFile(file)).join('')}
        </div>
    `;
}

function renderDiffFile(file) {
    const changeType = String(file?.change_type || '').trim() || 'modified';
    const changeLabel = t(`workspace_view.change.${changeType}`);
    const previousPath = String(file?.previous_path || '').trim();
    const filePath = String(file?.path || '').trim();
    const isSelected = filePath && selectedTreePath === filePath;
    const diffBody = renderDiffBody(filePath, isSelected);
    return `
        <article
            class="workspace-diff-card${isSelected ? ' is-selected' : ''}${diffBody ? ' has-body' : ''}"
            data-diff-path="${escapeHtml(filePath)}"
        >
            <div class="workspace-diff-header">
                <span class="workspace-diff-status is-${escapeHtml(changeType)}">${escapeHtml(changeLabel)}</span>
                <code class="workspace-diff-path">${escapeHtml(filePath)}</code>
                ${previousPath ? `<span class="workspace-diff-previous">${escapeHtml(previousPath)} -> ${escapeHtml(filePath)}</span>` : ''}
            </div>
            ${diffBody}
        </article>
    `;
}

function renderDiffBody(filePath, isSelected) {
    if (!isSelected) {
        return '';
    }
    if (currentDiffState.loadingFilePaths.has(filePath)) {
        return renderDiffBodyState(t('workspace_view.loading_diff'));
    }
    const loadError = currentDiffState.fileErrors.get(filePath);
    if (loadError) {
        return renderDiffBodyState(loadError, 'is-error');
    }
    const diffFile = currentDiffState.loadedDiffs.get(filePath);
    if (!diffFile) {
        return renderDiffBodyState(t('workspace_view.loading_diff'));
    }
    if (diffFile.is_binary === true) {
        return renderDiffBodyState(t('workspace_view.binary_diff'));
    }
    const diffText = String(diffFile.diff || '').replace(/\r\n/g, '\n');
    if (!diffText.trim()) {
        return renderDiffBodyState(t('workspace_view.empty_diff'));
    }
    return renderStructuredDiff(diffText);
}

function renderStructuredDiff(diffText) {
    const segments = parseDiffSegments(diffText);
    if (segments.length === 0) {
        return `
            <pre class="workspace-diff-pre"><code>${escapeHtml(diffText)}</code></pre>
        `;
    }
    return `
        <div class="workspace-diff-view">
            ${segments.map(renderDiffSegment).join('')}
        </div>
    `;
}

function parseDiffSegments(diffText) {
    const lines = String(diffText || '').split('\n');
    const segments = [];
    let currentSegment = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            const match = /@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/.exec(line);
            oldLine = Number(match?.[1] || 0);
            newLine = Number(match?.[3] || 0);
            currentSegment = {
                header: line,
                rows: [],
            };
            segments.push(currentSegment);
            continue;
        }

        if (!currentSegment) {
            currentSegment = {
                header: null,
                rows: [],
            };
            segments.push(currentSegment);
        }

        let kind = 'meta';
        let marker = '';
        let content = line;
        let oldNumber = '';
        let newNumber = '';

        if (line.startsWith('+') && !line.startsWith('+++')) {
            kind = 'added';
            marker = '+';
            content = line.slice(1);
            newNumber = String(newLine);
            newLine += 1;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            kind = 'deleted';
            marker = '-';
            content = line.slice(1);
            oldNumber = String(oldLine);
            oldLine += 1;
        } else if (line.startsWith(' ')) {
            kind = 'context';
            marker = ' ';
            content = line.slice(1);
            oldNumber = String(oldLine);
            newNumber = String(newLine);
            oldLine += 1;
            newLine += 1;
        } else if (line.startsWith('\\')) {
            kind = 'note';
            marker = '\\';
        }

        currentSegment.rows.push({
            kind,
            marker,
            content,
            oldNumber,
            newNumber,
        });
    }

    return segments;
}

function renderDiffSegment(segment) {
    const header = segment?.header
        ? `<div class="workspace-diff-hunk-header">${escapeHtml(segment.header)}</div>`
        : '';
    const rows = Array.isArray(segment?.rows) ? segment.rows.map(renderDiffRow).join('') : '';
    return `
        <section class="workspace-diff-hunk">
            ${header}
            <div class="workspace-diff-grid" role="table">
                ${rows}
            </div>
        </section>
    `;
}

function renderDiffRow(row) {
    const kind = String(row?.kind || 'context');
    return `
        <div class="workspace-diff-row is-${escapeHtml(kind)}" role="row">
            <span class="workspace-diff-line-number" role="cell">${escapeHtml(row?.oldNumber || '')}</span>
            <span class="workspace-diff-line-number" role="cell">${escapeHtml(row?.newNumber || '')}</span>
            <span class="workspace-diff-line-marker" role="cell">${escapeHtml(row?.marker || '')}</span>
            <code class="workspace-diff-line-text" role="cell">${escapeHtml(row?.content || '')}</code>
        </div>
    `;
}

function renderDiffBodyState(message, extraClass = '') {
    return `
        <div class="workspace-diff-body-state ${extraClass}">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function renderInlineState(message, extraClass = '') {
    return `
        <div class="workspace-view-empty-state ${extraClass}">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function bindWorkspaceHeaderInteractions() {
    if (!els.projectViewContent) {
        return;
    }
    for (const mountButton of els.projectViewContent.querySelectorAll('[data-workspace-mount]')) {
        const mountName = String(mountButton.getAttribute('data-workspace-mount') || '').trim();
        mountButton.onclick = () => {
            void switchWorkspaceMount(mountName);
        };
    }
    const addMountButton = els.projectViewContent?.querySelector('[data-workspace-add-mount]');
    if (addMountButton) {
        addMountButton.onclick = () => {
            void handleAddWorkspaceMount();
        };
    }
    const editMountButton = els.projectViewContent?.querySelector('[data-workspace-edit-mount]');
    if (editMountButton) {
        editMountButton.onclick = () => {
            void handleEditWorkspaceMount();
        };
    }
    const deleteMountButton = els.projectViewContent?.querySelector('[data-workspace-delete-mount]');
    if (deleteMountButton) {
        deleteMountButton.onclick = () => {
            void handleDeleteWorkspaceMount();
        };
    }
    const openSettingsButton = els.projectViewContent?.querySelector('[data-workspace-open-settings]');
    if (openSettingsButton) {
        openSettingsButton.onclick = () => {
            handleOpenWorkspaceSettings();
        };
    }
    const openRootButton = els.projectViewContent?.querySelector('[data-open-workspace-root]');
    if (!openRootButton) {
        return;
    }
    openRootButton.onclick = () => {
        void handleOpenWorkspaceRoot();
    };
}

function bindTreeInteractions() {
    if (!els.projectViewContent || typeof els.projectViewContent.querySelectorAll !== 'function') {
        return;
    }

    for (const toggle of els.projectViewContent.querySelectorAll('.workspace-tree-toggle')) {
        const togglePath = String(toggle.getAttribute('data-tree-toggle-path') || '').trim();
        toggle.onclick = () => {
            void toggleTreePath(togglePath);
        };
        toggle.onkeydown = (event) => {
            if (event?.key === 'Enter' || event?.key === ' ' || event?.key === 'Spacebar') {
                event.preventDefault?.();
                void toggleTreePath(togglePath);
            }
        };
    }

    for (const fileEntry of els.projectViewContent.querySelectorAll('.workspace-tree-file')) {
        const filePath = String(fileEntry.getAttribute('data-tree-file-path') || '').trim();
        fileEntry.onclick = () => {
            void selectTreePath(filePath);
        };
        fileEntry.onkeydown = (event) => {
            if (event?.key === 'Enter' || event?.key === ' ' || event?.key === 'Spacebar') {
                event.preventDefault?.();
                void selectTreePath(filePath);
            }
        };
    }
}

function bindDiffInteractions() {
    if (!els.projectViewContent || typeof els.projectViewContent.querySelectorAll !== 'function') {
        return;
    }

    for (const diffCard of els.projectViewContent.querySelectorAll('.workspace-diff-card')) {
        const diffPath = String(diffCard.getAttribute('data-diff-path') || '').trim();
        diffCard.onclick = () => {
            void selectTreePath(diffPath);
        };
    }
}

async function handleOpenWorkspaceRoot() {
    const workspaceId = String(currentWorkspace?.workspace_id || '').trim();
    const mountName = resolveActiveMountName();
    if (!workspaceId) {
        return;
    }
    try {
        await openWorkspaceRoot(workspaceId, mountName);
    } catch (error) {
        showToast({
            title: t('workspace_view.open_root_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

function handleOpenWorkspaceSettings() {
    const openSettingsHandler = globalThis.window?.openSettings || globalThis.openSettings;
    if (typeof openSettingsHandler === 'function') {
        openSettingsHandler('workspace');
        return;
    }
    showToast({
        title: t('workspace_view.mount_profiles'),
        message: t('workspace_view.mount_profiles_unavailable'),
        tone: 'warning',
    });
}

async function handleAddWorkspaceMount() {
    if (!currentWorkspace) {
        return;
    }
    const sshProfiles = await loadWorkspaceSshProfiles();
    await showFormDialog({
        title: t('workspace_view.mount_add'),
        message: t('workspace_view.mount_dialog_add'),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: buildWorkspaceMountDialogFields({
            sshProfiles,
            defaultMountName: String(currentWorkspace.default_mount_name || '').trim(),
        }),
        submitHandler: async values => submitWorkspaceMountChange({
            mode: 'create',
            values,
        }),
    });
}

async function handleEditWorkspaceMount() {
    const activeMount = resolveCurrentMount();
    if (!currentWorkspace || !activeMount) {
        return;
    }
    const sshProfiles = await loadWorkspaceSshProfiles();
    await showFormDialog({
        title: t('workspace_view.mount_edit'),
        message: formatMessage('workspace_view.mount_dialog_edit', {
            mount: activeMount.mountName,
        }),
        tone: 'info',
        confirmLabel: t('settings.action.save'),
        cancelLabel: t('settings.action.cancel'),
        fields: buildWorkspaceMountDialogFields({
            mount: activeMount,
            sshProfiles,
            defaultMountName: String(currentWorkspace.default_mount_name || '').trim(),
        }),
        submitHandler: async values => submitWorkspaceMountChange({
            mode: 'edit',
            values,
            sourceMountName: activeMount.mountName,
        }),
    });
}

async function handleDeleteWorkspaceMount() {
    if (!currentWorkspace) {
        return;
    }
    const activeMount = resolveCurrentMount();
    const mounts = Array.isArray(currentWorkspace.mounts) ? currentWorkspace.mounts : [];
    if (!activeMount) {
        return;
    }
    if (mounts.length <= 1) {
        showToast({
            title: t('workspace_view.mount_remove_failed'),
            message: t('workspace_view.mount_remove_last'),
            tone: 'warning',
        });
        return;
    }
    const confirmed = await showConfirmDialog({
        title: t('workspace_view.mount_remove'),
        message: formatMessage('workspace_view.mount_remove_confirm', {
            mount: activeMount.mountName,
        }),
        tone: 'warning',
        confirmLabel: t('settings.action.delete'),
        cancelLabel: t('settings.action.cancel'),
    });
    if (confirmed !== true) {
        return;
    }
    const nextMounts = sortWorkspaceMounts(
        mounts.filter(mount => String(mount?.mount_name || '').trim() !== activeMount.mountName),
    );
    const nextDefaultMountName = resolveUpdatedDefaultMountName({
        nextMounts,
        requestedDefaultMountName: String(currentWorkspace.default_mount_name || '').trim(),
        removedMountName: activeMount.mountName,
    });
    try {
        const updatedWorkspace = await updateWorkspace(String(currentWorkspace.workspace_id || '').trim(), {
            default_mount_name: nextDefaultMountName,
            mounts: nextMounts,
        });
        await applyUpdatedWorkspaceRecord(updatedWorkspace, nextDefaultMountName);
        showToast({
            title: t('workspace_view.mount_removed_title'),
            message: formatMessage('workspace_view.mount_removed_detail', {
                mount: activeMount.mountName,
            }),
            tone: 'success',
        });
    } catch (error) {
        showToast({
            title: t('workspace_view.mount_remove_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
    }
}

async function loadWorkspaceSshProfiles() {
    try {
        const loadedProfiles = await fetchSshProfiles();
        return Array.isArray(loadedProfiles) ? loadedProfiles : [];
    } catch (error) {
        showToast({
            title: t('workspace_view.mount_profiles_failed'),
            message: String(error?.message || error || ''),
            tone: 'danger',
        });
        return [];
    }
}

function buildWorkspaceMountDialogFields({
    mount = null,
    sshProfiles = [],
    defaultMountName = '',
} = {}) {
    const provider = String(mount?.provider || 'local').trim() || 'local';
    const isLocal = provider === 'local';
    const sshProfileId = String(mount?.sshProfileId || '').trim();
    const localRoot = isLocal ? String(mount?.rootReference || '').trim() : '';
    const remoteRoot = provider === 'ssh' ? String(mount?.rootReference || '').trim() : '';
    const sshProfileOptions = [
        {
            value: '',
            label: t('workspace_view.mount_profile_select_placeholder'),
        },
        ...sshProfiles.map(profile => {
            const sshProfileValue = String(profile?.ssh_profile_id || '').trim();
            return {
                value: sshProfileValue,
                label: sshProfileValue,
            };
        }).filter(option => option.value),
    ];
    return [
        {
            id: 'mount_name',
            label: t('workspace_view.mount_field_name'),
            type: 'text',
            value: String(mount?.mountName || '').trim(),
            placeholder: t('workspace_view.mount_field_name_placeholder'),
        },
        {
            id: 'provider',
            label: t('workspace_view.mount_field_provider'),
            type: 'select',
            value: provider,
            options: [
                { value: 'local', label: t('workspace_view.mount_provider.local') },
                { value: 'ssh', label: t('workspace_view.mount_provider.ssh') },
            ],
        },
        {
            id: 'local_root_path',
            label: t('workspace_view.mount_field_local_root'),
            type: 'text',
            value: localRoot,
            placeholder: t('workspace_view.mount_field_local_root_placeholder'),
            description: t('workspace_view.mount_field_local_root_copy'),
            visibleWhen: {
                field: 'provider',
                equals: 'local',
            },
        },
        {
            id: 'ssh_profile_id',
            label: t('workspace_view.mount_field_ssh_profile'),
            type: 'select',
            value: sshProfileId,
            options: sshProfileOptions,
            description: t('workspace_view.mount_field_ssh_profile_copy'),
            visibleWhen: {
                field: 'provider',
                equals: 'ssh',
            },
        },
        {
            id: 'remote_root',
            label: t('workspace_view.mount_field_remote_root'),
            type: 'text',
            value: remoteRoot,
            placeholder: t('workspace_view.mount_field_remote_root_placeholder'),
            description: t('workspace_view.mount_field_remote_root_copy'),
            visibleWhen: {
                field: 'provider',
                equals: 'ssh',
            },
        },
        {
            id: 'set_default',
            label: t('workspace_view.mount_field_default'),
            type: 'checkbox',
            value: String(mount?.mountName || '').trim()
                ? String(mount.mountName).trim() === defaultMountName
                : provider === 'local' && !defaultMountName,
            description: t('workspace_view.mount_field_default_copy'),
            visibleWhen: {
                field: 'provider',
                equals: 'local',
            },
        },
    ];
}

async function submitWorkspaceMountChange({
    mode,
    values,
    sourceMountName = '',
} = {}) {
    if (!currentWorkspace) {
        return null;
    }
    const workspaceId = String(currentWorkspace.workspace_id || '').trim();
    const existingMounts = Array.isArray(currentWorkspace.mounts) ? currentWorkspace.mounts : [];
    const normalizedSourceMountName = String(sourceMountName || '').trim();
    const existingMount = normalizedSourceMountName
        ? existingMounts.find(mount => String(mount?.mount_name || '').trim() === normalizedSourceMountName) || null
        : null;
    const nextMountRecord = buildWorkspaceMountRecordFromValues(values, {
        existingMount,
        mode,
    });
    validateWorkspaceMountSubmission({
        mount: nextMountRecord,
        mode,
        sourceMountName: normalizedSourceMountName,
        existingMounts,
    });
    const nextMounts = sortWorkspaceMounts(mode === 'edit'
        ? existingMounts.map(mount => {
            return String(mount?.mount_name || '').trim() === normalizedSourceMountName ? nextMountRecord : mount;
        })
        : [...existingMounts, nextMountRecord]);
    const nextDefaultMountName = resolveUpdatedDefaultMountName({
        nextMounts,
        requestedDefaultMountName: values?.set_default === true && String(nextMountRecord?.provider || '').trim() === 'local'
            ? nextMountRecord.mount_name
            : String(currentWorkspace.default_mount_name || '').trim(),
        removedMountName: mode === 'edit' ? normalizedSourceMountName : '',
        replacementMountName: nextMountRecord.mount_name,
    });
    const updatedWorkspace = await updateWorkspace(workspaceId, {
        default_mount_name: nextDefaultMountName,
        mounts: nextMounts,
    });
    await applyUpdatedWorkspaceRecord(updatedWorkspace, nextMountRecord.mount_name);
    showToast({
        title: mode === 'edit' ? t('workspace_view.mount_updated_title') : t('workspace_view.mount_added_title'),
        message: formatMessage(
            mode === 'edit' ? 'workspace_view.mount_updated_detail' : 'workspace_view.mount_added_detail',
            { mount: nextMountRecord.mount_name },
        ),
        tone: 'success',
    });
    return updatedWorkspace;
}

function buildWorkspaceMountRecordFromValues(values, {
    existingMount = null,
    mode = 'create',
} = {}) {
    const mountName = String(values?.mount_name || '').trim();
    const provider = String(values?.provider || 'local').trim() || 'local';
    const baseRecord = buildWorkspaceMountBaseRecord({
        existingMount,
        nextProvider: provider,
        mode,
    });
    if (provider === 'ssh') {
        return {
            ...baseRecord,
            mount_name: mountName,
            provider: 'ssh',
            provider_config: {
                ssh_profile_id: String(values?.ssh_profile_id || '').trim(),
                remote_root: String(values?.remote_root || '').trim(),
            },
        };
    }
    return {
        ...baseRecord,
        mount_name: mountName,
        provider: 'local',
        provider_config: {
            root_path: String(values?.local_root_path || '').trim(),
        },
    };
}

function buildWorkspaceMountBaseRecord({
    existingMount = null,
    nextProvider = '',
    mode = 'create',
} = {}) {
    if (mode !== 'edit' || !existingMount || typeof existingMount !== 'object') {
        return {};
    }
    const existingProvider = String(existingMount.provider || '').trim();
    const providerUnchanged = existingProvider === nextProvider;
    const nextRecord = {};
    if (typeof existingMount.working_directory === 'string') {
        nextRecord.working_directory = existingMount.working_directory;
    }
    if (Array.isArray(existingMount.readable_paths)) {
        nextRecord.readable_paths = [...existingMount.readable_paths];
    }
    if (Array.isArray(existingMount.writable_paths)) {
        nextRecord.writable_paths = [...existingMount.writable_paths];
    }
    if (providerUnchanged && existingMount.capabilities && typeof existingMount.capabilities === 'object') {
        nextRecord.capabilities = { ...existingMount.capabilities };
    }
    if (nextProvider === 'local') {
        for (const key of ['branch_name', 'source_root_path', 'forked_from_workspace_id']) {
            if (typeof existingMount[key] === 'string' && existingMount[key].trim()) {
                nextRecord[key] = existingMount[key];
            }
        }
    }
    return nextRecord;
}

function validateWorkspaceMountSubmission({
    mount,
    mode,
    sourceMountName = '',
    existingMounts = [],
} = {}) {
    const mountName = String(mount?.mount_name || '').trim();
    const provider = String(mount?.provider || '').trim();
    const normalizedSourceMountName = String(sourceMountName || '').trim();
    if (!mountName) {
        throw new Error(t('workspace_view.mount_validation_name'));
    }
    const duplicateMount = existingMounts.find(existingMount => {
        const existingMountName = String(existingMount?.mount_name || '').trim();
        if (!existingMountName) {
            return false;
        }
        if (mode === 'edit' && existingMountName === normalizedSourceMountName) {
            return false;
        }
        return existingMountName === mountName;
    });
    if (duplicateMount) {
        throw new Error(formatMessage('workspace_view.mount_validation_duplicate', { mount: mountName }));
    }
    if (provider === 'ssh') {
        const sshProfileId = String(mount?.provider_config?.ssh_profile_id || '').trim();
        const remoteRoot = String(mount?.provider_config?.remote_root || '').trim();
        if (!sshProfileId) {
            throw new Error(t('workspace_view.mount_validation_ssh_profile'));
        }
        if (!remoteRoot) {
            throw new Error(t('workspace_view.mount_validation_remote_root'));
        }
        return;
    }
    const localRootPath = String(mount?.provider_config?.root_path || '').trim();
    if (!localRootPath) {
        throw new Error(t('workspace_view.mount_validation_local_root'));
    }
}

function resolveUpdatedDefaultMountName({
    nextMounts = [],
    requestedDefaultMountName = '',
    removedMountName = '',
    replacementMountName = '',
} = {}) {
    const orderedMounts = sortWorkspaceMounts(nextMounts);
    const normalizedRequested = String(requestedDefaultMountName || '').trim();
    const normalizedRemoved = String(removedMountName || '').trim();
    const normalizedReplacement = String(replacementMountName || '').trim();
    const nextMountNames = orderedMounts
        .map(mount => String(mount?.mount_name || '').trim())
        .filter(Boolean);
    const requestedMount = findWorkspaceMountByName(orderedMounts, normalizedRequested);
    if (requestedMount && isLocalWorkspaceMount(requestedMount)) {
        return normalizedRequested;
    }
    const replacementMount = findWorkspaceMountByName(orderedMounts, normalizedReplacement);
    if (
        normalizedRequested
        && normalizedRemoved
        && normalizedRequested === normalizedRemoved
        && replacementMount
        && isLocalWorkspaceMount(replacementMount)
    ) {
        return normalizedReplacement;
    }
    const firstLocalMount = orderedMounts.find(mount => isLocalWorkspaceMount(mount)) || null;
    if (firstLocalMount) {
        return String(firstLocalMount.mount_name || '').trim() || 'default';
    }
    return nextMountNames[0] || 'default';
}

function findWorkspaceMountByName(mounts = [], mountName = '') {
    const normalizedMountName = String(mountName || '').trim();
    if (!normalizedMountName) {
        return null;
    }
    return mounts.find(mount => String(mount?.mount_name || '').trim() === normalizedMountName) || null;
}

function isLocalWorkspaceMount(mount) {
    return String(mount?.provider || '').trim() === 'local';
}

async function applyUpdatedWorkspaceRecord(updatedWorkspace, preferredMountName = '') {
    const orderedWorkspace = normalizeWorkspaceRecordMountOrder(updatedWorkspace);
    const workspaceId = String(orderedWorkspace?.workspace_id || '').trim();
    if (!workspaceId) {
        return;
    }
    currentWorkspace = orderedWorkspace;
    currentSnapshotWorkspaceId = workspaceId;
    state.currentWorkspaceId = workspaceId;
    workspaceViewCache.delete(workspaceId);
    resetProjectViewState(workspaceId);
    currentMountName = String(preferredMountName || orderedWorkspace.default_mount_name || '').trim() || resolveWorkspaceInitialMountName(orderedWorkspace);
    currentDiffState = {
        ...createInitialDiffState(),
        status: 'loading',
        mountName: currentMountName,
    };
    renderLoadingState(orderedWorkspace);
    const loadToken = ++currentLoadToken;
    void loadWorkspaceSnapshot(workspaceId, loadToken);
    void loadWorkspaceDiffs(workspaceId, loadToken);
}

async function switchWorkspaceMount(mountName) {
    const nextMountName = resolveWorkspaceMountName(mountName, currentSnapshot);
    if (!nextMountName || nextMountName === resolveActiveMountName() || !currentWorkspace || !currentSnapshot) {
        return;
    }
    currentMountName = nextMountName;
    selectedTreePath = null;
    currentDiffState = {
        ...createInitialDiffState(),
        status: 'loading',
        mountName: nextMountName,
    };
    const loadToken = ++currentLoadToken;
    ensureActiveMountTreeLoaded(loadToken);
    cacheProjectViewState();
    void loadWorkspaceDiffs(String(currentWorkspace.workspace_id || '').trim(), loadToken);
}

async function toggleTreePath(path) {
    if (!path || !currentWorkspace || !currentSnapshot) {
        return;
    }
    const scopedPath = buildTreeStateKey(path);

    if (expandedTreePaths.has(scopedPath)) {
        expandedTreePaths.delete(scopedPath);
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        cacheProjectViewState();
        return;
    }

    expandedTreePaths.add(scopedPath);
    treeLoadErrors.delete(scopedPath);
    const node = findTreeNode(getCurrentMountTree(), path);
    if (node?.kind === 'directory' && node.hasChildren && node.childrenLoaded !== true) {
        loadingTreePaths.add(scopedPath);
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        await loadWorkspaceTree(path);
        return;
    }
    renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
    cacheProjectViewState();
}

async function loadWorkspaceTree(path) {
    if (!currentWorkspace || !currentSnapshot) {
        return;
    }
    const workspaceId = String(currentWorkspace.workspace_id || '').trim();
    const mountName = resolveActiveMountName();
    const loadToken = currentLoadToken;
    try {
        const listing = await fetchWorkspaceTree(workspaceId, path, mountName);
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId || !currentSnapshot) {
            return;
        }
        const node = findTreeNode(getCurrentMountTree(), path);
        if (node) {
            node.children = Array.isArray(listing?.children)
                ? listing.children
                    .map(child => normalizeTreeNode(child, false))
                    .filter(Boolean)
                : [];
            node.childrenLoaded = true;
        }
        loadingTreePaths.delete(buildTreeStateKey(path, mountName));
        treeLoadErrors.delete(buildTreeStateKey(path, mountName));
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        cacheProjectViewState();
    } catch (error) {
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId) {
            return;
        }
        loadingTreePaths.delete(buildTreeStateKey(path, mountName));
        treeLoadErrors.set(
            buildTreeStateKey(path, mountName),
            String(error?.message || error || t('workspace_view.load_failed')),
        );
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        cacheProjectViewState();
        sysLog(`Failed to load project tree path ${path}: ${error?.message || error}`, 'log-error');
    }
}

async function selectTreePath(path) {
    if (!path || !currentWorkspace || !currentSnapshot) {
        return;
    }

    await revealTreePath(path);
    selectedTreePath = path;
    renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
    cacheProjectViewState();
    if (findDiffSummary(path)) {
        void ensureDiffFileLoaded(path);
    }
}

function findDiffSummary(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath || currentDiffState.status !== 'ready') {
        return null;
    }
    return currentDiffState.diffFiles.find(file => String(file?.path || '').trim() === normalizedPath) || null;
}

function ensureDiffFileLoaded(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath || currentDiffState.status !== 'ready') {
        return;
    }
    if (currentDiffState.loadedDiffs.has(normalizedPath) || currentDiffState.loadingFilePaths.has(normalizedPath)) {
        return;
    }
    currentDiffState.fileErrors.delete(normalizedPath);
    currentDiffState.loadingFilePaths.add(normalizedPath);
    renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
    cacheProjectViewState();
    void loadWorkspaceDiffFile(normalizedPath);
}

async function loadWorkspaceDiffFile(path) {
    if (!currentWorkspace || currentDiffState.status !== 'ready') {
        return;
    }

    const workspaceId = String(currentWorkspace.workspace_id || '').trim();
    const mountName = resolveActiveMountName();
    const loadToken = currentLoadToken;
    try {
        const diffFile = await fetchWorkspaceDiffFile(workspaceId, path, mountName);
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId || currentDiffState.status !== 'ready') {
            return;
        }
        currentDiffState.loadingFilePaths.delete(path);
        currentDiffState.fileErrors.delete(path);
        currentDiffState.loadedDiffs.set(path, diffFile);
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        cacheProjectViewState();
    } catch (error) {
        if (loadToken !== currentLoadToken || workspaceId !== currentSnapshotWorkspaceId || currentDiffState.status !== 'ready') {
            return;
        }
        currentDiffState.loadingFilePaths.delete(path);
        currentDiffState.fileErrors.set(path, String(error?.message || error || t('workspace_view.load_failed')));
        renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
        cacheProjectViewState();
        sysLog(`Failed to load project diff file ${path}: ${error?.message || error}`, 'log-error');
    }
}

async function revealTreePath(path) {
    if (!currentSnapshot || !currentWorkspace) {
        return;
    }
    const parentPaths = buildParentPaths(path);
    for (const parentPath of parentPaths) {
        expandedTreePaths.add(buildTreeStateKey(parentPath));
        const node = findTreeNode(getCurrentMountTree(), parentPath);
        if (node?.kind === 'directory' && node.hasChildren && node.childrenLoaded !== true) {
            loadingTreePaths.add(buildTreeStateKey(parentPath));
            renderWorkspaceSnapshot(currentWorkspace, currentSnapshot);
            await loadWorkspaceTree(parentPath);
        }
    }
    cacheProjectViewState();
}

function buildParentPaths(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath || normalizedPath === '.') {
        return [];
    }
    const segments = normalizedPath.split('/');
    const parentPaths = [];
    let currentPath = '';
    for (const segment of segments.slice(0, -1)) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        parentPaths.push(currentPath);
    }
    return parentPaths;
}

function findTreeNode(node, targetPath) {
    if (!node || typeof node !== 'object') {
        return null;
    }
    if (String(node.path || '.').trim() === targetPath) {
        return node;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
        const match = findTreeNode(child, targetPath);
        if (match) {
            return match;
        }
    }
    return null;
}

function mergeTreeState(nextNode, cachedNode) {
    if (!nextNode || !cachedNode || nextNode.kind !== 'directory' || cachedNode.kind !== 'directory') {
        return;
    }

    if (nextNode.childrenLoaded !== true && cachedNode.childrenLoaded === true) {
        nextNode.children = Array.isArray(cachedNode.children)
            ? cachedNode.children.map(child => cloneTreeNode(child)).filter(Boolean)
            : [];
        nextNode.childrenLoaded = true;
        nextNode.hasChildren = nextNode.hasChildren || nextNode.children.length > 0;
        return;
    }

    if (!Array.isArray(nextNode.children) || !Array.isArray(cachedNode.children)) {
        return;
    }

    const cachedChildrenByPath = new Map(
        cachedNode.children
            .filter(Boolean)
            .map(child => [String(child.path || '').trim(), child]),
    );

    for (const child of nextNode.children) {
        const childPath = String(child?.path || '').trim();
        const cachedChild = cachedChildrenByPath.get(childPath);
        if (cachedChild) {
            mergeTreeState(child, cachedChild);
        }
    }
}

function filterLoadedDiffs(loadedDiffs, diffFiles) {
    const nextLoadedDiffs = new Map();
    const safeLoadedDiffs = loadedDiffs instanceof Map ? loadedDiffs : new Map();
    for (const file of Array.isArray(diffFiles) ? diffFiles : []) {
        const filePath = String(file?.path || '').trim();
        if (!filePath || !safeLoadedDiffs.has(filePath)) {
            continue;
        }
        nextLoadedDiffs.set(filePath, cloneDiffFile(safeLoadedDiffs.get(filePath)));
    }
    return nextLoadedDiffs;
}

function filterFileErrors(fileErrors, diffFiles) {
    const nextFileErrors = new Map();
    const safeFileErrors = fileErrors instanceof Map ? fileErrors : new Map();
    for (const file of Array.isArray(diffFiles) ? diffFiles : []) {
        const filePath = String(file?.path || '').trim();
        if (!filePath || !safeFileErrors.has(filePath)) {
            continue;
        }
        nextFileErrors.set(filePath, String(safeFileErrors.get(filePath) || ''));
    }
    return nextFileErrors;
}

function cloneSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return null;
    }
    return {
        workspace_id: String(snapshot.workspace_id || ''),
        root_path: String(snapshot.root_path || ''),
        default_mount_name: String(snapshot.default_mount_name || 'default'),
        isMountShell: snapshot.isMountShell === true,
        mounts: Array.isArray(snapshot.mounts)
            ? snapshot.mounts.map(mount => ({
                mountName: String(mount?.mountName || '').trim(),
                provider: String(mount?.provider || '').trim() || 'unknown',
                rootReference: String(mount?.rootReference || '').trim(),
                sshProfileId: String(mount?.sshProfileId || '').trim(),
                isDefault: mount?.isDefault === true,
                hasChildren: mount?.hasChildren === true,
            }))
            : [],
        tree: cloneTreeNode(snapshot.tree),
    };
}

function cloneTreeNode(node) {
    if (!node || typeof node !== 'object') {
        return null;
    }
    return {
        name: String(node.name || node.path || '.'),
        path: String(node.path || '.').trim() || '.',
        kind: node.kind === 'directory' ? 'directory' : 'file',
        hasChildren: node.hasChildren === true,
        children: Array.isArray(node.children)
            ? node.children.map(child => cloneTreeNode(child)).filter(Boolean)
            : [],
        childrenLoaded: node.childrenLoaded === true,
    };
}

function cloneDiffState(diffState) {
    if (!diffState || typeof diffState !== 'object') {
        return createInitialDiffState();
    }
    return {
        status: String(diffState.status || 'idle'),
        mountName: diffState.mountName ? String(diffState.mountName) : null,
        diffFiles: Array.isArray(diffState.diffFiles)
            ? diffState.diffFiles.map(file => ({ ...file }))
            : [],
        diffMessage: diffState.diffMessage ? String(diffState.diffMessage) : null,
        isGitRepository: diffState.isGitRepository === true,
        gitRootPath: diffState.gitRootPath ? String(diffState.gitRootPath) : null,
        loadedDiffs: new Map(
            Array.from(diffState.loadedDiffs instanceof Map ? diffState.loadedDiffs.entries() : [])
                .map(([path, file]) => [String(path || '').trim(), cloneDiffFile(file)]),
        ),
        loadingFilePaths: new Set(),
        fileErrors: new Map(
            Array.from(diffState.fileErrors instanceof Map ? diffState.fileErrors.entries() : [])
                .map(([path, message]) => [String(path || '').trim(), String(message || '')]),
        ),
    };
}

function cloneDiffFile(diffFile) {
    if (!diffFile || typeof diffFile !== 'object') {
        return null;
    }
    return {
        ...diffFile,
        workspace_id: String(diffFile.workspace_id || ''),
        path: String(diffFile.path || ''),
        previous_path: diffFile.previous_path ? String(diffFile.previous_path) : null,
        change_type: String(diffFile.change_type || 'modified'),
        diff: diffFile.diff ? String(diffFile.diff) : '',
        is_binary: diffFile.is_binary === true,
    };
}


function describeCronExpression(expression) {
    const cron = String(expression || '').trim();
    if (!cron) {
        return t('automation.cron.empty');
    }
    const parts = cron.split(/\s+/);
    if (parts.length !== 5) {
        return formatTemplate(t('automation.cron.fallback'), { expression: cron });
    }
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (month === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
        return formatTemplate(t('automation.cron.daily'), {
            time: formatCronTime(hour, minute),
        });
    }
    if (month === '*' && dayOfMonth === '*' && dayOfWeek !== '*') {
        return formatTemplate(t('automation.cron.weekly'), {
            weekday: formatCronWeekday(dayOfWeek),
            time: formatCronTime(hour, minute),
        });
    }
    if (month === '*' && dayOfMonth !== '*' && dayOfWeek === '*') {
        return formatTemplate(t('automation.cron.monthly'), {
            day: dayOfMonth,
            time: formatCronTime(hour, minute),
        });
    }
    return formatTemplate(t('automation.cron.fallback'), { expression: cron });
}

function describeAutomationSchedule(project) {
    const scheduleMode = String(project?.schedule_mode || '').trim();
    if (scheduleMode === 'interval') {
        const count = String(project?.interval_every || '1');
        const unit = t(`automation.schedule.interval_unit.${String(project?.interval_unit || AUTOMATION_INTERVAL_UNITS.hours)}`);
        return formatTemplate(t('automation.schedule.summary.interval'), { count, unit });
    }
    if (scheduleMode === 'one_shot') {
        return t('automation.cron.one_shot');
    }
    return describeCronExpression(project?.cron_expression);
}

function describeAutomationScheduleText(project) {
    const scheduleMode = String(project?.schedule_mode || '').trim();
    if (scheduleMode === 'interval') {
        return describeAutomationSchedule(project);
    }
    if (scheduleMode === 'one_shot') {
        return String(project?.run_at || '').trim() || t('automation.detail.not_scheduled');
    }
    return String(project?.cron_expression || '').trim() || t('automation.detail.not_scheduled');
}

function formatCronTime(hour, minute) {
    const safeHour = /^\d+$/.test(String(hour || '')) ? String(hour).padStart(2, '0') : String(hour || '*');
    const safeMinute = /^\d+$/.test(String(minute || '')) ? String(minute).padStart(2, '0') : String(minute || '*');
    return `${safeHour}:${safeMinute}`;
}

function formatCronWeekday(value) {
    const map = {
        '0': t('automation.cron.weekday.sun'),
        '1': t('automation.cron.weekday.mon'),
        '2': t('automation.cron.weekday.tue'),
        '3': t('automation.cron.weekday.wed'),
        '4': t('automation.cron.weekday.thu'),
        '5': t('automation.cron.weekday.fri'),
        '6': t('automation.cron.weekday.sat'),
        '7': t('automation.cron.weekday.sun'),
    };
    return map[String(value || '').trim()] || String(value || '*');
}

function renderFolderIcon(isExpanded) {
    const folderClass = isExpanded ? 'workspace-tree-icon is-folder-open' : 'workspace-tree-icon is-folder';
    return `
        <span class="${folderClass}" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
                <path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.2 1.5H13.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
            </svg>
        </span>
    `;
}

function renderFileIcon() {
    return `
        <span class="workspace-tree-icon is-file" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
                <path d="M4 1.5h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
                <path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </span>
    `;
}

function formatAutomationTitle(project) {
    const label = String(project?.display_name || project?.name || project?.automation_project_id || '').trim();
    return label
        ? formatMessage('workspace_view.automation_suffix', { label })
        : t('workspace_view.automation_project');
}

function formatWorkspaceTitle(workspace) {
    const workspaceId = String(workspace?.workspace_id || '').trim();
    if (workspaceId) {
        return formatTemplate(t('workspace_view.title'), { workspace: workspaceId });
    }
    return t('workspace_view.title');
}

function formatTemplate(template, values) {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replace(`{${key}}`, String(value)),
        String(template || ''),
    );
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
