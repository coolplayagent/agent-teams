import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  addMcpServer,
  configurePlugin,
  createFeishuGatewayAccount,
  createCommand,
  deleteAgentRuntime,
  deleteFeishuGatewayAccount,
  deleteModelProfile,
  deleteRoleConfig,
  deleteWeChatGatewayAccount,
  deleteEnvironmentVariable,
  deleteMcpServer,
  deleteSshProfile,
  disableFeishuGatewayAccount,
  disableWeChatGatewayAccount,
  enableFeishuGatewayAccount,
  enableWeChatGatewayAccount,
  getAgentRuntime,
  getAgentRuntimeRegistry,
  getAgentRuntimes,
  getAgentRuntimeTestJob,
  getCommandCatalog,
  getEnvironmentVariables,
  getGeneralConfig,
  getGitHubConfig,
  getGitHubWebhookTunnelStatus,
  getHookRuntimeView,
  getHooksConfig,
  listFeishuGatewayAccounts,
  listWeChatGatewayAccounts,
  getMcpServer,
  getMcpServerTools,
  getModelCatalog,
  getModelFallbackConfig,
  getModelProfiles,
  getNotificationConfig,
  getOrchestrationConfig,
  getPluginsConfig,
  getPluginsRuntime,
  getProxyConfig,
  getRoleConfig,
  getRoleConfigOptions,
  getWebConfig,
  installPlugin,
  installAgentRuntimeFromRegistry,
  loadPluginMarketplace,
  listRoleConfigs,
  listSshProfiles,
  listMcpServers,
  probeModelConnection,
  probeSshProfileConnection,
  probeGitHubConnectivity,
  probeGitHubWebhookConnectivity,
  probeWebConnectivity,
  listWorkspaces,
  revealSshProfilePassword,
  revealGitHubToken,
  refreshAgentRuntimeRegistry,
  refreshModelCatalog,
  reloadModelConfig,
  refreshMcpServerTools,
  reloadFeishuGateway,
  reloadWeChatGateway,
  reloadMcpConfig,
  reloadProxyConfig,
  saveEnvironmentVariable,
  saveAgentRuntime,
  saveGeneralConfig,
  saveGitHubConfig,
  saveHooksConfig,
  saveModelProfile,
  saveNotificationConfig,
  saveOrchestrationConfig,
  saveProxyConfig,
  saveRoleConfig,
  saveSshProfile,
  saveWebConfig,
  setMcpServerEnabled,
  deletePlugin,
  disablePlugin,
  enablePlugin,
  startWeChatGatewayLogin,
  startAgentRuntimeTestJob,
  startGitHubWebhookTunnel,
  stopGitHubWebhookTunnel,
  testMcpServerConnection,
  updateCommand,
  updateFeishuGatewayAccount,
  updateWeChatGatewayAccount,
  updateMcpServer,
  updatePlugin,
  validateHooksConfig,
  validateRoleConfig,
  waitWeChatGatewayLogin,
} from "../api/client";
import type {
  McpServerToolsSummary,
  OrchestrationConfig,
  OrchestrationPreset,
  RoleConfigOptions,
} from "../api/contracts";
import { fetchSpeechConfig, saveSpeechConfig } from "../api/speech";
import { SettingsDrawer } from "../features/shell/SettingsDrawer";
import type { SystemSettingsPage } from "../features/settings/settingsNavigation";
import {
  appearanceStorageKey,
  applyAppearanceSettings,
  defaultAppearanceSettings,
} from "../runtime/appearance";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  addMcpServer: vi.fn(),
  configurePlugin: vi.fn(),
  createFeishuGatewayAccount: vi.fn(),
  createCommand: vi.fn(),
  deleteAgentRuntime: vi.fn(),
  deleteFeishuGatewayAccount: vi.fn(),
  deleteModelProfile: vi.fn(),
  deleteRoleConfig: vi.fn(),
  deleteWeChatGatewayAccount: vi.fn(),
  deleteEnvironmentVariable: vi.fn(),
  deleteMcpServer: vi.fn(),
  deleteSshProfile: vi.fn(),
  disableFeishuGatewayAccount: vi.fn(),
  disableWeChatGatewayAccount: vi.fn(),
  enableFeishuGatewayAccount: vi.fn(),
  enableWeChatGatewayAccount: vi.fn(),
  getAgentRuntime: vi.fn(),
  getAgentRuntimeRegistry: vi.fn(),
  getAgentRuntimes: vi.fn(),
  getAgentRuntimeTestJob: vi.fn(),
  getCommandCatalog: vi.fn(),
  getEnvironmentVariables: vi.fn(),
  getGeneralConfig: vi.fn(),
  getGitHubConfig: vi.fn(),
  getGitHubWebhookTunnelStatus: vi.fn(),
  getHookRuntimeView: vi.fn(),
  getHooksConfig: vi.fn(),
  listFeishuGatewayAccounts: vi.fn(),
  listWeChatGatewayAccounts: vi.fn(),
  getMcpServer: vi.fn(),
  getMcpServerTools: vi.fn(),
  getModelCatalog: vi.fn(),
  getModelFallbackConfig: vi.fn(),
  getModelProfiles: vi.fn(),
  getNotificationConfig: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getPluginsConfig: vi.fn(),
  getPluginsRuntime: vi.fn(),
  getProxyConfig: vi.fn(),
  getRoleConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  installPlugin: vi.fn(),
  installAgentRuntimeFromRegistry: vi.fn(),
  loadPluginMarketplace: vi.fn(),
  listRoleConfigs: vi.fn(),
  listMcpServers: vi.fn(),
  listSshProfiles: vi.fn(),
  listWorkspaces: vi.fn(),
  probeModelConnection: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  probeGitHubConnectivity: vi.fn(),
  probeGitHubWebhookConnectivity: vi.fn(),
  probeWebConnectivity: vi.fn(),
  revealSshProfilePassword: vi.fn(),
  revealGitHubToken: vi.fn(),
  refreshAgentRuntimeRegistry: vi.fn(),
  refreshModelCatalog: vi.fn(),
  reloadModelConfig: vi.fn(),
  refreshMcpServerTools: vi.fn(),
  reloadFeishuGateway: vi.fn(),
  reloadWeChatGateway: vi.fn(),
  reloadMcpConfig: vi.fn(),
  reloadProxyConfig: vi.fn(),
  saveEnvironmentVariable: vi.fn(),
  saveAgentRuntime: vi.fn(),
  saveGeneralConfig: vi.fn(),
  saveGitHubConfig: vi.fn(),
  saveHooksConfig: vi.fn(),
  saveModelProfile: vi.fn(),
  saveNotificationConfig: vi.fn(),
  saveOrchestrationConfig: vi.fn(),
  saveProxyConfig: vi.fn(),
  saveRoleConfig: vi.fn(),
  saveSshProfile: vi.fn(),
  saveWebConfig: vi.fn(),
  setMcpServerEnabled: vi.fn(),
  deletePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  startWeChatGatewayLogin: vi.fn(),
  startAgentRuntimeTestJob: vi.fn(),
  startGitHubWebhookTunnel: vi.fn(),
  stopGitHubWebhookTunnel: vi.fn(),
  testMcpServerConnection: vi.fn(),
  updateCommand: vi.fn(),
  updateFeishuGatewayAccount: vi.fn(),
  updateWeChatGatewayAccount: vi.fn(),
  updateMcpServer: vi.fn(),
  updatePlugin: vi.fn(),
  validateHooksConfig: vi.fn(),
  validateRoleConfig: vi.fn(),
  waitWeChatGatewayLogin: vi.fn(),
}));

vi.mock("../api/speech", () => ({
  fetchSpeechConfig: vi.fn(),
  saveSpeechConfig: vi.fn(),
}));

vi.setConfig({ testTimeout: 60000 });

const addMcpServerMock = vi.mocked(addMcpServer);
const configurePluginMock = vi.mocked(configurePlugin);
const createFeishuGatewayAccountMock = vi.mocked(createFeishuGatewayAccount);
const createCommandMock = vi.mocked(createCommand);
const deleteAgentRuntimeMock = vi.mocked(deleteAgentRuntime);
const deleteFeishuGatewayAccountMock = vi.mocked(deleteFeishuGatewayAccount);
const deleteModelProfileMock = vi.mocked(deleteModelProfile);
const deleteWeChatGatewayAccountMock = vi.mocked(deleteWeChatGatewayAccount);
const deleteEnvironmentVariableMock = vi.mocked(deleteEnvironmentVariable);
const deleteMcpServerMock = vi.mocked(deleteMcpServer);
const deleteRoleConfigMock = vi.mocked(deleteRoleConfig);
const deleteSshProfileMock = vi.mocked(deleteSshProfile);
const disableFeishuGatewayAccountMock = vi.mocked(disableFeishuGatewayAccount);
const disableWeChatGatewayAccountMock = vi.mocked(disableWeChatGatewayAccount);
const enableFeishuGatewayAccountMock = vi.mocked(enableFeishuGatewayAccount);
const enableWeChatGatewayAccountMock = vi.mocked(enableWeChatGatewayAccount);
const getAgentRuntimeMock = vi.mocked(getAgentRuntime);
const getAgentRuntimeRegistryMock = vi.mocked(getAgentRuntimeRegistry);
const getAgentRuntimesMock = vi.mocked(getAgentRuntimes);
const getAgentRuntimeTestJobMock = vi.mocked(getAgentRuntimeTestJob);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const getEnvironmentVariablesMock = vi.mocked(getEnvironmentVariables);
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getGitHubConfigMock = vi.mocked(getGitHubConfig);
const getGitHubWebhookTunnelStatusMock = vi.mocked(getGitHubWebhookTunnelStatus);
const getHookRuntimeViewMock = vi.mocked(getHookRuntimeView);
const getHooksConfigMock = vi.mocked(getHooksConfig);
const listFeishuGatewayAccountsMock = vi.mocked(listFeishuGatewayAccounts);
const listWeChatGatewayAccountsMock = vi.mocked(listWeChatGatewayAccounts);
const getMcpServerMock = vi.mocked(getMcpServer);
const getMcpServerToolsMock = vi.mocked(getMcpServerTools);
const getModelCatalogMock = vi.mocked(getModelCatalog);
const getModelFallbackConfigMock = vi.mocked(getModelFallbackConfig);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getPluginsConfigMock = vi.mocked(getPluginsConfig);
const getPluginsRuntimeMock = vi.mocked(getPluginsRuntime);
const getProxyConfigMock = vi.mocked(getProxyConfig);
const getRoleConfigMock = vi.mocked(getRoleConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const installPluginMock = vi.mocked(installPlugin);
const installAgentRuntimeFromRegistryMock = vi.mocked(installAgentRuntimeFromRegistry);
const loadPluginMarketplaceMock = vi.mocked(loadPluginMarketplace);
const listRoleConfigsMock = vi.mocked(listRoleConfigs);
const listMcpServersMock = vi.mocked(listMcpServers);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const probeModelConnectionMock = vi.mocked(probeModelConnection);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const probeGitHubConnectivityMock = vi.mocked(probeGitHubConnectivity);
const probeGitHubWebhookConnectivityMock = vi.mocked(probeGitHubWebhookConnectivity);
const probeWebConnectivityMock = vi.mocked(probeWebConnectivity);
const revealSshProfilePasswordMock = vi.mocked(revealSshProfilePassword);
const revealGitHubTokenMock = vi.mocked(revealGitHubToken);
const refreshAgentRuntimeRegistryMock = vi.mocked(refreshAgentRuntimeRegistry);
const refreshModelCatalogMock = vi.mocked(refreshModelCatalog);
const reloadModelConfigMock = vi.mocked(reloadModelConfig);
const refreshMcpServerToolsMock = vi.mocked(refreshMcpServerTools);
const reloadFeishuGatewayMock = vi.mocked(reloadFeishuGateway);
const reloadWeChatGatewayMock = vi.mocked(reloadWeChatGateway);
const reloadMcpConfigMock = vi.mocked(reloadMcpConfig);
const reloadProxyConfigMock = vi.mocked(reloadProxyConfig);
const saveEnvironmentVariableMock = vi.mocked(saveEnvironmentVariable);
const saveAgentRuntimeMock = vi.mocked(saveAgentRuntime);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);
const saveGitHubConfigMock = vi.mocked(saveGitHubConfig);
const saveHooksConfigMock = vi.mocked(saveHooksConfig);
const saveModelProfileMock = vi.mocked(saveModelProfile);
const saveNotificationConfigMock = vi.mocked(saveNotificationConfig);
const saveOrchestrationConfigMock = vi.mocked(saveOrchestrationConfig);
const saveProxyConfigMock = vi.mocked(saveProxyConfig);
const saveRoleConfigMock = vi.mocked(saveRoleConfig);
const saveSshProfileMock = vi.mocked(saveSshProfile);
const saveWebConfigMock = vi.mocked(saveWebConfig);
const setMcpServerEnabledMock = vi.mocked(setMcpServerEnabled);
const deletePluginMock = vi.mocked(deletePlugin);
const disablePluginMock = vi.mocked(disablePlugin);
const enablePluginMock = vi.mocked(enablePlugin);
const startWeChatGatewayLoginMock = vi.mocked(startWeChatGatewayLogin);
const startAgentRuntimeTestJobMock = vi.mocked(startAgentRuntimeTestJob);
const startGitHubWebhookTunnelMock = vi.mocked(startGitHubWebhookTunnel);
const stopGitHubWebhookTunnelMock = vi.mocked(stopGitHubWebhookTunnel);
const testMcpServerConnectionMock = vi.mocked(testMcpServerConnection);
const updateCommandMock = vi.mocked(updateCommand);
const updateFeishuGatewayAccountMock = vi.mocked(updateFeishuGatewayAccount);
const updateWeChatGatewayAccountMock = vi.mocked(updateWeChatGatewayAccount);
const updateMcpServerMock = vi.mocked(updateMcpServer);
const updatePluginMock = vi.mocked(updatePlugin);
const validateHooksConfigMock = vi.mocked(validateHooksConfig);
const validateRoleConfigMock = vi.mocked(validateRoleConfig);
const waitWeChatGatewayLoginMock = vi.mocked(waitWeChatGatewayLogin);
const fetchSpeechConfigMock = vi.mocked(fetchSpeechConfig);
const saveSpeechConfigMock = vi.mocked(saveSpeechConfig);
const activeQueryClients = new Set<QueryClient>();

function orchestrationConfigFixture(): OrchestrationConfig {
  return {
    default_orchestration_preset_id: "default",
    presets: [
      {
        description: "Main plus reviewer",
        graph: {
          nodes: [
            {
              id: "review",
              role_id: "reviewer",
            },
          ],
        },
        name: "Default",
        orchestration_prompt: "Coordinate the work.",
        policy: {
          auto_plan_long_tasks: true,
          max_orchestration_cycles: 8,
          max_parallel_delegated_tasks: 4,
          planner_role_id: "planner",
        },
        preset_id: "default",
        role_ids: ["main", "reviewer"],
      },
      {
        description: "Release flow",
        name: "Shipping",
        orchestration_prompt: "Ship the work.",
        policy: {
          max_orchestration_cycles: 6,
          max_parallel_delegated_tasks: 2,
        },
        preset_id: "shipping",
        role_ids: ["reviewer"],
      },
    ],
  };
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  getGeneralConfigMock.mockResolvedValue({ shell_safety_policy_enabled: true });
  getModelProfilesMock.mockResolvedValue({
    default: {
      is_default: true,
      model: "gpt-5-mini",
      provider: "openai",
      resolved_capabilities: {
        input: { image: true, text: true },
        output: { text: true },
      },
    },
    vision: {
      input_modalities: ["text", "image"],
      model: "gpt-5-vision",
      provider: "openai",
    },
    stt: {
      model: "qwen3-omni-flash",
      provider: "openai_compatible",
      resolved_capabilities: {
        input: { audio: true, text: true },
        output: { text: true },
      },
      speech_realtime: {
        model: "qwen3-omni-flash",
      },
    },
  });
  getModelFallbackConfigMock.mockResolvedValue({ policies: [] });
  fetchSpeechConfigMock.mockResolvedValue({
    language: "zh-CN",
    prompt: "domain terms",
    stt_profile_name: "stt",
  });
  saveSpeechConfigMock.mockResolvedValue({
    language: "en-US",
    prompt: "edited terms",
    stt_profile_name: "stt",
  });
  getNotificationConfigMock.mockResolvedValue({
    monitor_triggered: {
      channels: ["toast"],
      enabled: true,
    },
    run_completed: {
      channels: ["browser", "toast"],
      enabled: true,
    },
    run_failed: {
      channels: ["toast"],
      enabled: true,
    },
    run_stopped: {
      channels: ["toast"],
      enabled: false,
    },
    tool_approval_requested: {
      channels: ["browser"],
      enabled: true,
    },
  });
  saveNotificationConfigMock.mockResolvedValue({ status: "ok" });
  getGitHubConfigMock.mockResolvedValue({
    token_configured: true,
    webhook_base_url: "https://hooks.example",
  });
  revealGitHubTokenMock.mockResolvedValue({ token: "ghp_saved" });
  saveGitHubConfigMock.mockResolvedValue({ status: "ok" });
  probeGitHubConnectivityMock.mockResolvedValue({
    checked_at: "2026-06-24T00:00:00Z",
    diagnostics: {
      auth_valid: true,
      binary_available: true,
      bundled_binary: true,
      used_proxy: false,
    },
    gh_version: "gh version 2.0.0",
    host: "github.com",
    latency_ms: 21,
    ok: true,
    retryable: false,
    username: "octocat",
  });
  probeGitHubWebhookConnectivityMock.mockResolvedValue({
    callback_url: "https://hooks.example/api/triggers/github/deliveries",
    checked_at: "2026-06-24T00:00:00Z",
    diagnostics: {
      endpoint_reachable: true,
      redirected: false,
      used_proxy: false,
    },
    latency_ms: 34,
    ok: true,
    retryable: false,
    status_code: 200,
    webhook_base_url: "https://hooks.example",
  });
  getGitHubWebhookTunnelStatusMock.mockResolvedValue({
    provider: "localhost.run",
    public_url: null,
    status: "idle",
  });
  startGitHubWebhookTunnelMock.mockResolvedValue({
    provider: "localhost.run",
    public_url: "https://relay.localhost.run",
    status: "active",
  });
  stopGitHubWebhookTunnelMock.mockResolvedValue({
    provider: "localhost.run",
    public_url: "https://relay.localhost.run",
    status: "stopped",
  });
  listWorkspacesMock.mockResolvedValue([
    {
      root_path: "C:/repo",
      workspace_id: "workspace-1",
    },
  ]);
  listFeishuGatewayAccountsMock.mockResolvedValue([
    {
      account_id: "feishu-main",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "Feishu Main",
      name: "feishu-main",
      secret_status: {
        app_secret_configured: true,
      },
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      status: "enabled",
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        thinking: {
          enabled: false,
          effort: null,
        },
        workspace_id: "workspace-1",
        yolo: true,
      },
      updated_at: "2026-06-24T00:00:00Z",
    },
  ]);
  createFeishuGatewayAccountMock.mockImplementation((request) =>
    Promise.resolve({
      account_id: request.name,
      created_at: "2026-06-24T00:00:00Z",
      display_name: request.display_name ?? request.name,
      name: request.name,
      secret_status: {
        app_secret_configured: Boolean(request.secret_config?.app_secret),
      },
      source_config: request.source_config,
      status: request.enabled === false ? "disabled" : "enabled",
      target_config: request.target_config,
      updated_at: "2026-06-24T00:00:00Z",
    }),
  );
  updateFeishuGatewayAccountMock.mockImplementation((accountId, request) =>
    Promise.resolve({
      account_id: accountId,
      created_at: "2026-06-24T00:00:00Z",
      display_name: request.display_name ?? request.name ?? accountId,
      name: request.name ?? accountId,
      secret_status: {
        app_secret_configured: true,
      },
      source_config: request.source_config ?? {
        app_id: "cli_app_id",
        app_name: "Relay Bot",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      status: "enabled",
      target_config: request.target_config ?? {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        thinking: {
          enabled: false,
          effort: null,
        },
        workspace_id: "workspace-1",
        yolo: true,
      },
      updated_at: "2026-06-24T00:00:00Z",
    }),
  );
  enableFeishuGatewayAccountMock.mockResolvedValue({
    account_id: "feishu-main",
    created_at: "2026-06-24T00:00:00Z",
    display_name: "Feishu Main",
    name: "feishu-main",
    secret_status: { app_secret_configured: true },
    source_config: {
      app_id: "cli_app_id",
      app_name: "Relay Bot",
      provider: "feishu",
      trigger_rule: "mention_only",
    },
    status: "enabled",
    target_config: {
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      session_mode: "normal",
      shell_safety_policy_enabled: true,
      thinking: { enabled: false, effort: null },
      workspace_id: "workspace-1",
      yolo: true,
    },
    updated_at: "2026-06-24T00:00:00Z",
  });
  disableFeishuGatewayAccountMock.mockResolvedValue({
    account_id: "feishu-main",
    created_at: "2026-06-24T00:00:00Z",
    display_name: "Feishu Main",
    name: "feishu-main",
    secret_status: { app_secret_configured: true },
    source_config: {
      app_id: "cli_app_id",
      app_name: "Relay Bot",
      provider: "feishu",
      trigger_rule: "mention_only",
    },
    status: "disabled",
    target_config: {
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      session_mode: "normal",
      shell_safety_policy_enabled: true,
      thinking: { enabled: false, effort: null },
      workspace_id: "workspace-1",
      yolo: true,
    },
    updated_at: "2026-06-24T00:00:00Z",
  });
  deleteFeishuGatewayAccountMock.mockResolvedValue({ status: "ok" });
  reloadFeishuGatewayMock.mockResolvedValue({ status: "ok" });
  listWeChatGatewayAccountsMock.mockResolvedValue([
    {
      account_id: "wechat-main",
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "WeChat Main",
      last_error: null,
      last_event_at: null,
      last_inbound_at: null,
      last_login_at: "2026-06-24T00:00:00Z",
      last_outbound_at: null,
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      remote_user_id: "wxid_main",
      route_tag: "desktop",
      running: true,
      session_mode: "normal",
      status: "enabled",
      sync_cursor: "",
      thinking: { enabled: false, effort: null },
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "workspace-1",
      yolo: true,
    },
  ]);
  updateWeChatGatewayAccountMock.mockImplementation((accountId, request) =>
    Promise.resolve({
      account_id: accountId,
      base_url: request.base_url ?? "http://127.0.0.1:5900",
      cdn_base_url: request.cdn_base_url ?? "http://127.0.0.1:5901",
      created_at: "2026-06-24T00:00:00Z",
      display_name: request.display_name ?? "WeChat Main",
      last_error: null,
      last_event_at: null,
      last_inbound_at: null,
      last_login_at: "2026-06-24T00:00:00Z",
      last_outbound_at: null,
      normal_root_role_id: request.normal_root_role_id ?? "main",
      orchestration_preset_id: request.orchestration_preset_id ?? null,
      remote_user_id: "wxid_main",
      route_tag: request.route_tag ?? "desktop",
      running: true,
      session_mode: request.session_mode ?? "normal",
      status: "enabled",
      sync_cursor: "",
      thinking: request.thinking ?? { enabled: false, effort: null },
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: request.workspace_id ?? "workspace-1",
      yolo: request.yolo === true,
    }),
  );
  enableWeChatGatewayAccountMock.mockResolvedValue({
    account_id: "wechat-main",
    base_url: "http://127.0.0.1:5900",
    cdn_base_url: "http://127.0.0.1:5901",
    created_at: "2026-06-24T00:00:00Z",
    display_name: "WeChat Main",
    last_error: null,
    last_event_at: null,
    last_inbound_at: null,
    last_login_at: "2026-06-24T00:00:00Z",
    last_outbound_at: null,
    normal_root_role_id: "main",
    orchestration_preset_id: null,
    remote_user_id: "wxid_main",
    route_tag: "desktop",
    running: true,
    session_mode: "normal",
    status: "enabled",
    sync_cursor: "",
    thinking: { enabled: false, effort: null },
    updated_at: "2026-06-24T00:00:00Z",
    workspace_id: "workspace-1",
    yolo: true,
  });
  disableWeChatGatewayAccountMock.mockResolvedValue({
    account_id: "wechat-main",
    base_url: "http://127.0.0.1:5900",
    cdn_base_url: "http://127.0.0.1:5901",
    created_at: "2026-06-24T00:00:00Z",
    display_name: "WeChat Main",
    last_error: null,
    last_event_at: null,
    last_inbound_at: null,
    last_login_at: "2026-06-24T00:00:00Z",
    last_outbound_at: null,
    normal_root_role_id: "main",
    orchestration_preset_id: null,
    remote_user_id: "wxid_main",
    route_tag: "desktop",
    running: false,
    session_mode: "normal",
    status: "disabled",
    sync_cursor: "",
    thinking: { enabled: false, effort: null },
    updated_at: "2026-06-24T00:00:00Z",
    workspace_id: "workspace-1",
    yolo: true,
  });
  deleteWeChatGatewayAccountMock.mockResolvedValue({ status: "ok" });
  reloadWeChatGatewayMock.mockResolvedValue({ status: "ok" });
  startWeChatGatewayLoginMock.mockResolvedValue({
    message: "Scan the QR code.",
    qr_code_url: "data:image/png;base64,abc",
    session_key: "wechat-session",
  });
  waitWeChatGatewayLoginMock.mockResolvedValue({
    account_id: "wechat-main",
    connected: true,
    message: "Connected.",
  });
  getCommandCatalogMock.mockResolvedValue({
    app_commands: [
      {
        aliases: ["g"],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Global command",
        discovery_source: "app",
        name: "global",
        scope: "app",
        source_path: "C:/config/commands/global.md",
        template: "Global {{args}}",
      },
    ],
    workspaces: [
      {
        can_create_commands: true,
        commands: [
          {
            aliases: ["opsx/propose"],
            allowed_modes: ["normal"],
            argument_hint: "<change-id>",
            description: "Create an OpenSpec proposal",
            discovery_source: "project_claude",
            name: "opsx:propose",
            scope: "project",
            source_path: "C:/repo/.claude/commands/opsx/propose.md",
            template: "Propose {{args}}",
          },
        ],
        root_path: "C:/repo",
        workspace_id: "workspace-1",
      },
    ],
  });
  listMcpServersMock.mockResolvedValue([
    {
      discovery_status: "ready",
      enabled: true,
      last_checked_at: "2026-06-24T00:00:00Z",
      name: "filesystem",
      source: "app",
      tool_count: 2,
      transport: "stdio",
    },
    {
      discovery_status: "disabled",
      enabled: false,
      name: "github",
      source: "plugin",
      tool_count: 0,
      transport: "streamable-http",
    },
  ]);
  getMcpServerToolsMock.mockResolvedValue({
    enabled: true,
    last_checked_at: "2026-06-24T00:00:00Z",
    server: "filesystem",
    source: "app",
    status: "ready",
    tools: [
      { description: "Read a file", name: "read_file" },
      { description: "Write a file", name: "write_file" },
    ],
    transport: "stdio",
  });
  getMcpServerMock.mockResolvedValue({
    config: {
      args: ["server.js"],
      command: "node",
      env: {
        MCP_LOG: "info",
      },
      transport: "stdio",
    },
    server: {
      discovery_status: "ready",
      enabled: true,
      name: "filesystem",
      source: "app",
      tool_count: 2,
      transport: "stdio",
    },
  });
  testMcpServerConnectionMock.mockResolvedValue({
    enabled: true,
    ok: true,
    server: "filesystem",
    source: "app",
    tool_count: 2,
    tools: [
      { description: "Read a file", name: "read_file" },
      { description: "Write a file", name: "write_file" },
    ],
    transport: "stdio",
  });
  refreshMcpServerToolsMock.mockResolvedValue({
    enabled: true,
    last_checked_at: "2026-06-24T00:00:00Z",
    server: "filesystem",
    source: "app",
    status: "ready",
    tools: [
      { description: "Read a file", name: "read_file" },
      { description: "Write a file", name: "write_file" },
      { description: "List files", name: "list_files" },
    ],
    transport: "stdio",
  });
  setMcpServerEnabledMock.mockResolvedValue({
    discovery_status: "disabled",
    enabled: false,
    name: "filesystem",
    source: "app",
    tool_count: 2,
    transport: "stdio",
  });
  reloadMcpConfigMock.mockResolvedValue({ status: "ok" });
  addMcpServerMock.mockResolvedValue({
    config_path: "C:/config/mcp.json",
    server: {
      discovery_status: "pending",
      enabled: true,
      name: "demo",
      source: "app",
      tool_count: 0,
      transport: "stdio",
    },
  });
  updateMcpServerMock.mockResolvedValue({
    config: {
      args: ["server.js"],
      command: "node",
      transport: "stdio",
    },
    server: {
      discovery_status: "pending",
      enabled: true,
      name: "filesystem",
      source: "app",
      tool_count: 0,
      transport: "stdio",
    },
  });
  deleteMcpServerMock.mockResolvedValue({
    discovery_status: "disabled",
    enabled: false,
    name: "filesystem",
    source: "app",
    tool_count: 0,
    transport: "stdio",
  });
  getOrchestrationConfigMock.mockResolvedValue(orchestrationConfigFixture());
  getRoleConfigOptionsMock.mockResolvedValue({
    coordinator_role: {
      name: "Coordinator",
      role_id: "coordinator",
    },
    coordinator_role_id: "coordinator",
    main_agent_role: {
      model_profile: "default",
      name: "Main Agent",
      role_id: "main",
    },
    main_agent_role_id: "main",
    normal_mode_roles: [
      {
        model_name: "gpt-5-mini",
        model_profile: "default",
        name: "Main Agent",
        role_id: "main",
      },
    ],
    subagent_roles: [
      {
        input_modalities: ["text"],
        model_profile: "default",
        name: "Reviewer",
        role_id: "reviewer",
      },
    ],
    skills: [
      {
        description: "Review delivered work.",
        name: "Review",
        ref: "review",
        source: "builtin",
      },
    ],
  });
  listRoleConfigsMock.mockResolvedValue([
    {
      description: "Main role",
      deletable: false,
      mode: "primary",
      model_profile: "default",
      name: "Main Agent",
      role_id: "main",
      source: "app",
      version: "1.0.0",
    },
    {
      bound_agent_id: "codex-local",
      deletable: true,
      description: "Review changes",
      mode: "subagent",
      model_profile: "default",
      name: "Reviewer",
      role_id: "reviewer",
      source: "project",
      version: "1.0.0",
    },
  ]);
  getRoleConfigMock.mockImplementation((roleId) =>
    Promise.resolve({
      bound_agent_id: roleId === "reviewer" ? "codex-local" : null,
      content: "---\nname: Reviewer\n---\nReview carefully.",
      contract: {
        invariants: [{ invariant: "must_review" }],
      },
      description: roleId === "reviewer" ? "Review changes" : "Main role",
      deletable: roleId === "reviewer",
      execution_surface: roleId === "reviewer" ? "browser" : "api",
      file_name: `${roleId}.md`,
      mcp_servers: ["filesystem"],
      memory_profile: {
        enabled: true,
      },
      mode: roleId === "reviewer" ? "subagent" : "primary",
      model_profile: "default",
      name: roleId === "reviewer" ? "Reviewer" : "Main Agent",
      role_id: roleId,
      skills: ["review"],
      source: "project",
      source_role_id: roleId,
      system_prompt: roleId === "reviewer" ? "Review carefully." : "Handle work.",
      tools: ["read_file"],
      version: "1.0.0",
    }),
  );
  deleteRoleConfigMock.mockResolvedValue({ status: "ok" });
  validateRoleConfigMock.mockImplementation(async (document) => ({
    role: document,
    valid: true,
  }));
  getWebConfigMock.mockResolvedValue({
    exa_api_key_configured: true,
    fallback_provider: "searxng",
    provider: "exa",
    searxng_instance_seeds: ["https://search.example/"],
    searxng_instance_url: "https://search.example/",
  });
  getProxyConfigMock.mockResolvedValue({
    all_proxy: "socks5://proxy.example:1080",
    http_proxy: "http://proxy.example:8080",
    https_proxy: "http://proxy.example:8443",
    no_proxy: "localhost,127.0.0.1",
    has_password: true,
    proxy_username: "alice",
    ssl_verify: false,
  });
  getEnvironmentVariablesMock.mockResolvedValue({
    app: [
      {
        key: "OPENAI_API_KEY",
        masked: true,
        scope: "app",
        value: "************",
        value_kind: "string",
      },
      {
        key: "HTTP_PROXY",
        masked: false,
        scope: "app",
        value: "http://hidden-proxy.example:8080",
        value_kind: "string",
      },
      {
        key: "SSL_VERIFY",
        masked: false,
        scope: "app",
        value: "false",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "PATH",
        masked: false,
        scope: "system",
        value: "C:/Windows/System32",
        value_kind: "expandable",
      },
    ],
  });
  getPluginsConfigMock.mockResolvedValue({
    diagnostics: [],
    plugins: [
      {
        command_sources: [{ name: "workspace-command" }],
        description: "Workspace utilities",
        enabled: true,
        manifest: {
          user_config: {
            allow: {
              sensitive: true,
              title: "Allow",
              type: "boolean",
            },
            endpoint: {
              title: "Endpoint",
              type: "string",
            },
            payload: {
              title: "Payload",
              type: "object",
            },
          },
        },
        name: "workspace-tools",
        scope: "user",
        skill_sources: [{ name: "workspace-skill" }],
        user_config: {
          allow: "<configured>",
          endpoint: "https://docs.example",
          payload: { mode: "strict" },
        },
        valid: true,
        version: "1.0.0",
      },
      {
        description: "Quality checks",
        enabled: false,
        hook_sources: [{ name: "quality-hook" }],
        name: "quality",
        scope: "project",
        valid: true,
        version: "2.0.0",
      },
      {
        description: "Marketplace quality tools",
        enabled: true,
        name: "market-quality",
        scope: "user",
        source: {
          kind: "marketplace",
          marketplace: "C:/plugins/marketplace.json",
          marketplace_provider: "local_json",
          marketplace_source: "",
          value: "market-quality",
        },
        valid: true,
        version: "1.1.0",
      },
    ],
  });
  getPluginsRuntimeMock.mockResolvedValue({
    diagnostics: [],
    plugins: [
      {
        command_sources: [{ name: "workspace-command" }],
        description: "Workspace utilities",
        enabled: true,
        name: "workspace-tools",
        scope: "user",
        skill_sources: [{ name: "workspace-skill" }],
        valid: true,
        version: "1.0.0",
      },
    ],
  });
  enablePluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  disablePluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  updatePluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  deletePluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  installPluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  loadPluginMarketplaceMock.mockResolvedValue({
    plugins: [
      {
        latest: "1.2.0",
        name: "market-quality",
        versions: [
          {
            source: { kind: "git", ref: "v1.1.0", value: "https://repo/quality" },
            version: "1.1.0",
          },
          {
            source: { kind: "git", ref: "v1.2.0", value: "https://repo/quality" },
            version: "1.2.0",
          },
        ],
      },
      {
        latest: "2.0.0",
        name: "unsupported-quality",
        versions: [
          {
            source: { kind: "unsupported", value: "@example/plugin" },
            unsupported_reason: "npm is not supported",
            version: "2.0.0",
          },
        ],
      },
    ],
  });
  configurePluginMock.mockResolvedValue({ diagnostics: [], plugins: [] });
  getHooksConfigMock.mockResolvedValue({
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              command: "python hooks/start.py",
              name: "Session startup setup",
              type: "command",
            },
          ],
          matcher: "*",
        },
      ],
    },
  });
  saveHooksConfigMock.mockImplementation(async (payload) => payload);
  validateHooksConfigMock.mockResolvedValue({ status: "ok" });
  getHookRuntimeViewMock.mockResolvedValue({
    loaded_hooks: [
      {
        event: "SessionStart",
        handler: "python hooks/start.py",
        name: "Session startup setup",
        source: "project",
      },
    ],
    sources: [
      {
        path: "C:/repo/.relay/hooks",
        source: "project",
      },
    ],
  });
  getAgentRuntimesMock.mockResolvedValue([
    {
      agent_id: "codex-acp",
      description: "ACP adapter for OpenAI's coding assistant",
      name: "Codex CLI",
      protocol: "acp",
      transport: "registry",
    },
  ]);
  getAgentRuntimeMock.mockResolvedValue({
    agent_id: "codex-acp",
    description: "ACP adapter for OpenAI's coding assistant",
    name: "Codex CLI",
    native_config_enabled: false,
    native_config_provider: "",
    protocol: "acp",
    skill_bridge_enabled: false,
    skill_bridge_mode: "inline",
    skill_bridge_skills: [],
    transport: {
      distribution: "auto",
      env: [
        {
          configured: true,
          name: "OPENAI_API_KEY",
          secret: true,
          value: "",
        },
      ],
      registry_id: "openai/codex",
      registry_version: "1.0.0",
      transport: "registry",
    },
  });
  getAgentRuntimeRegistryMock.mockResolvedValue({
    agents: [
      {
        description: "Runs Codex from the ACP registry.",
        distributions: ["npx"],
        installed: false,
        name: "Codex Runtime",
        registry_id: "openai/codex",
        supports_current_platform: true,
        update_available: false,
        version: "1.0.0",
      },
    ],
    cache_path: "C:/cache/acp-registry.json",
    registry_version: "2026.06",
    source_url: "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json",
    stale: false,
  });
  refreshAgentRuntimeRegistryMock.mockResolvedValue({
    agents: [],
    cache_path: "C:/cache/acp-registry.json",
  });
  installAgentRuntimeFromRegistryMock.mockResolvedValue({
    agent: {
      agent_id: "codex-acp",
      description: "Runs Codex from the ACP registry.",
      name: "Codex Runtime",
      protocol: "acp",
      transport: {
        distribution: "auto",
        registry_id: "openai/codex",
        transport: "registry",
      },
    },
    message: "Installed",
    registry_agent: {
      distributions: ["npx"],
      installed: true,
      name: "Codex Runtime",
      registry_id: "openai/codex",
      version: "1.0.0",
    },
    status: "ok",
  });
  saveAgentRuntimeMock.mockImplementation((_agentId, payload) => Promise.resolve(payload));
  deleteAgentRuntimeMock.mockResolvedValue({ status: "ok" });
  startAgentRuntimeTestJobMock.mockResolvedValue({
    agent_id: "codex-acp",
    job_id: "job-1",
    message: "Connected",
    phase: "completed",
    progress_percent: 100,
    result: {
      message: "Connected",
      ok: true,
      protocol: "acp",
    },
    status: "succeeded",
  });
  getAgentRuntimeTestJobMock.mockResolvedValue({
    agent_id: "codex-acp",
    job_id: "job-1",
    message: "Connected",
    phase: "completed",
    progress_percent: 100,
    result: {
      message: "Connected",
      ok: true,
      protocol: "acp",
    },
    status: "succeeded",
  });
  probeWebConnectivityMock.mockResolvedValue({
    diagnostics: {
      endpoint_reachable: true,
      redirected: false,
      used_proxy: true,
    },
    final_url: "https://example.com",
    latency_ms: 38,
    ok: true,
    status_code: 200,
    used_method: "HEAD",
  });
  listSshProfilesMock.mockResolvedValue([
    {
      ssh_profile_id: "devbox",
      host: "dev.example.com",
      username: "yex",
      port: 22,
      remote_shell: "/bin/bash",
      connect_timeout_seconds: 15,
      has_password: true,
      has_private_key: false,
      private_key_name: null,
    },
  ]);
  probeSshProfileConnectionMock.mockResolvedValue({
    checked_at: "2026-06-24T00:00:00Z",
    diagnostics: {
      binary_available: true,
      host_reachable: true,
      used_password: true,
      used_private_key: false,
      used_system_config: false,
    },
    host: "dev.example.com",
    latency_ms: 44,
    ok: true,
    port: 22,
    username: "yex",
  });
  revealSshProfilePasswordMock.mockResolvedValue({ password: "saved-password" });
  saveGeneralConfigMock.mockResolvedValue({ status: "ok" });
  getModelCatalogMock.mockResolvedValue({
    ok: true,
    providers: [
      {
        api: "https://openai.example/v1",
        id: "openai",
        models: [
          {
            capabilities: {
              input: { image: true, text: true },
              output: { text: true },
            },
            context_window: 128000,
            id: "gpt-5-catalog",
            input_modalities: ["text", "image"],
            name: "GPT-5 Catalog",
            output_limit: 8192,
            reasoning: true,
            tool_call: true,
          },
        ],
        name: "OpenAI",
        runtime_provider: "openai_compatible",
      },
    ],
    source_url: "https://models.dev/api.json",
  });
  refreshModelCatalogMock.mockResolvedValue({
    ok: true,
    providers: [],
    source_url: "https://models.dev/api.json",
  });
  saveModelProfileMock.mockResolvedValue({ status: "ok" });
  deleteModelProfileMock.mockResolvedValue({ status: "ok" });
  reloadModelConfigMock.mockResolvedValue({ status: "ok" });
  probeModelConnectionMock.mockResolvedValue({
    checked_at: "2026-06-26T00:00:00Z",
    diagnostics: {
      auth_valid: true,
      endpoint_reachable: true,
      rate_limited: false,
    },
    latency_ms: 42,
    model: "gpt-5-vision",
    ok: true,
    provider: "openai",
  });
  saveOrchestrationConfigMock.mockResolvedValue({ status: "ok" });
  saveRoleConfigMock.mockImplementation((_roleId, document) =>
    Promise.resolve(document),
  );
  reloadProxyConfigMock.mockResolvedValue({ status: "ok" });
  saveProxyConfigMock.mockResolvedValue({ status: "ok" });
  createCommandMock.mockResolvedValue({
    command: {
      aliases: [],
      allowed_modes: ["normal"],
      argument_hint: "",
      description: "Created command",
      discovery_source: "project_relay_teams",
      name: "opsx:review",
      scope: "project",
      source_path: "C:/repo/.relay-teams/commands/opsx/review.md",
      template: "Review {{args}}",
    },
    workspace_id: "workspace-1",
  });
  updateCommandMock.mockResolvedValue({
    command: {
      aliases: ["opsx/propose"],
      allowed_modes: ["normal", "orchestration"],
      argument_hint: "<change-id>",
      description: "Updated proposal command",
      discovery_source: "project_claude",
      name: "opsx:propose",
      scope: "project",
      source_path: "C:/repo/.claude/commands/opsx/propose.md",
      template: "Updated {{args}}",
    },
    workspace_id: "workspace-1",
  });
  saveEnvironmentVariableMock.mockResolvedValue({
    key: "ANTHROPIC_API_KEY",
    masked: true,
    scope: "app",
    value: "************",
    value_kind: "string",
  });
  deleteEnvironmentVariableMock.mockResolvedValue({ status: "ok" });
  saveSshProfileMock.mockResolvedValue({
    ssh_profile_id: "devbox",
    host: "edited.example.com",
    username: "deploy",
    port: 2222,
    has_password: true,
    has_private_key: false,
  });
  deleteSshProfileMock.mockResolvedValue({ status: "ok" });
  saveWebConfigMock.mockResolvedValue({ status: "ok" });
  useUiStore.setState({
    language: "en",
    themeMode: "light",
  });
});

afterEach(() => {
  cleanup();
  for (const queryClient of activeQueryClients) {
    queryClient.clear();
  }
  activeQueryClients.clear();
  delete window.agentTeamsDesktop;
  window.localStorage.clear();
  applyAppearanceSettings(defaultAppearanceSettings);
  vi.resetAllMocks();
});

describe("SettingsDrawer", () => {
  it("shows contextual routes in the compact selector and can return to settings", async () => {
    renderDrawer("github");

    expect(await screen.findByText("GitHub CLI")).toBeVisible();
    const compactNavigation = document.querySelector<HTMLElement>(
      ".at-settings-mobile-navigation",
    );
    expect(compactNavigation).not.toBeNull();
    expect(compactNavigation).toHaveTextContent("GitHub");
    const selector = within(compactNavigation as HTMLElement).getByRole("combobox", {
      hidden: true,
      name: "Settings sections",
    });
    fireEvent.mouseDown(selector);
    fireEvent.click(await screen.findByText("Appearance", { selector: ".ant-select-item-option-content" }));

    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeVisible();
    expect(compactNavigation).toHaveTextContent("Appearance");
  });

  it("renders a real settings center backed by existing config endpoints", async () => {
    renderDrawer();

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    await waitFor(() => expect(settingsDialog).toBeVisible());
    const sections = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(sections).getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "Appearance",
      "General",
      "Speech",
      "Notifications",
      "Model",
      "MCP",
      "Plugins",
      "Commands",
      "Hooks",
      "Agent Runtime",
      "Roles",
      "Orchestration",
      "Web",
      "Proxy",
      "Remote workspace",
      "Environment variables",
    ]);
    expect(within(sections).queryByRole("button", { name: "ClawHub" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "GitHub" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Gateway" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "System" })).toBeNull();

    await waitFor(() => expect(getRoleConfigOptionsMock).toHaveBeenCalledTimes(1));
    expect(getModelProfilesMock).toHaveBeenCalledTimes(1);
    expect(getOrchestrationConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Speech" }));
    expect(await screen.findByText("STT profile")).toBeVisible();
    expect(screen.getByDisplayValue("domain terms")).toBeVisible();
    expect(fetchSpeechConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Notifications" }));
    const approvalTitle = await screen.findByText("Tool approval requested");
    expect(approvalTitle).toBeVisible();
    const approvalRule = approvalTitle.closest("article");
    expect(approvalRule).not.toBeNull();
    expect(
      within(approvalRule as HTMLElement).getByRole("switch", {
        name: "Tool approval requested · Enabled",
      }),
    ).toBeChecked();
    expect(screen.getByText("Run completed")).toBeVisible();
    const stoppedRule = screen.getByText("Run stopped").closest("article");
    expect(stoppedRule).not.toBeNull();
    expect(within(stoppedRule as HTMLElement).getByText("Disabled")).toBeVisible();
    expect(
      within(stoppedRule as HTMLElement).getByRole("checkbox", {
        name: "Browser",
      }),
    ).toBeDisabled();
    expect(
      within(stoppedRule as HTMLElement).getByRole("checkbox", { name: "Toast" }),
    ).toBeDisabled();
    expect(getNotificationConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    await waitFor(() => expect(screen.getAllByText("default").length).toBeGreaterThan(0));
    expect(screen.getByText("gpt-5-mini · in: image, text / out: text")).toBeVisible();
    const defaultProfileRow = screen
      .getByText("gpt-5-mini · in: image, text / out: text")
      .closest("button");
    expect(defaultProfileRow).not.toBeNull();
    fireEvent.click(defaultProfileRow as HTMLElement);
    expect(await screen.findByLabelText("Image Input")).toBeInTheDocument();
    expect(screen.getByText("Follow detection")).toBeVisible();
    expect(screen.queryByText("Model capabilities")).toBeNull();
    expect(screen.queryByText("Realtime speech")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("vision")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    await waitFor(() => expect(listRoleConfigsMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Reviewer")).toBeVisible();
    expect(screen.queryByText("Normal roles")).toBeNull();
    expect(screen.queryByText("Subagent roles")).toBeNull();
    const reviewerRoleRow = screen.getByText("Reviewer").closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);
    expect(getRoleConfigMock).toHaveBeenCalledWith("reviewer");
    expect(await screen.findByLabelText("Role ID")).toBeVisible();
    expect(screen.getByDisplayValue("reviewer")).toBeVisible();
    expect(await screen.findByDisplayValue("Review carefully.")).toBeVisible();
    expect(screen.getByText("Subagent")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getAllByText("Main Agent").length).toBeGreaterThan(0));

    fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));
    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();
    const defaultPresetRow = screen
      .getByText("2 roles · Main plus reviewer")
      .closest(".at-settings-list-row");
    expect(defaultPresetRow).not.toBeNull();
    fireEvent.click(within(defaultPresetRow as HTMLElement).getByRole("button", { name: /Default/ }));
    expect(await screen.findByLabelText("Preset ID")).toBeVisible();
    const presetNameInput = screen.getByDisplayValue("Default");
    const presetDescriptionInput = screen.getByDisplayValue("Main plus reviewer");
    const presetPromptInput = screen.getByDisplayValue("Coordinate the work.");
    const presetRoles = screen.getByRole("combobox", { name: "Roles" })
      .closest(".ant-select");
    expect(presetRoles).not.toBeNull();
    expect(presetRoles).toHaveTextContent("main");
    expect(presetRoles).toHaveTextContent("Reviewer (reviewer)");
    fireEvent.change(presetNameInput, { target: { value: "Edited Default" } });
    fireEvent.change(presetDescriptionInput, { target: { value: "Edited reviewer flow" } });
    fireEvent.change(presetPromptInput, {
      target: { value: "Coordinate edited work." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(1));
    expect(saveOrchestrationConfigMock.mock.calls[0]?.[0]).toEqual({
      default_orchestration_preset_id: "default",
      presets: [
        {
          description: "Edited reviewer flow",
          graph: {
            nodes: [
              {
                id: "review",
                role_id: "reviewer",
              },
            ],
          },
          name: "Edited Default",
          orchestration_prompt: "Coordinate edited work.",
          policy: {
            auto_plan_long_tasks: true,
            max_orchestration_cycles: 8,
            max_parallel_delegated_tasks: 4,
            planner_role_id: "planner",
          },
          preset_id: "default",
          role_ids: ["main", "reviewer"],
        },
        {
          description: "Release flow",
          name: "Shipping",
          orchestration_prompt: "Ship the work.",
          policy: {
            max_orchestration_cycles: 6,
            max_parallel_delegated_tasks: 2,
          },
          preset_id: "shipping",
          role_ids: ["reviewer"],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Commands" }));
    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    expect(screen.getByText("Global commands")).toBeVisible();
    expect(getCommandCatalogMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Plugins" }));
    expect(await screen.findByText("workspace-tools")).toBeVisible();
    expect(screen.getByText("2 components")).toBeVisible();
    expect(getPluginsConfigMock).toHaveBeenCalledTimes(1);
    expect(getPluginsRuntimeMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Hooks" }));
    expect((await screen.findAllByText("Session startup setup")).length).toBeGreaterThan(0);
    expect(screen.getByText("SessionStart · python hooks/start.py")).toBeVisible();
    expect(getHooksConfigMock).toHaveBeenCalledTimes(1);
    expect(getHookRuntimeViewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Agent Runtime" }));
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    expect(screen.getByText("acp · registry")).toBeVisible();
    expect(getAgentRuntimesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Codex CLI").closest("button") as HTMLElement);
    expect(await screen.findByText("Agent ID")).toBeVisible();
    expect(screen.getByDisplayValue("Codex CLI")).toBeVisible();
    expect(screen.getByDisplayValue("openai/codex")).toBeVisible();
    expect(await screen.findByText("OPENAI_API_KEY · App")).toBeVisible();
    expect(getAgentRuntimeMock).toHaveBeenCalledWith("codex-acp");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAgentRuntimeMock).toHaveBeenCalledTimes(1));
    expect(saveAgentRuntimeMock.mock.calls[0]?.[0]).toBe("codex-acp");
    expect(saveAgentRuntimeMock.mock.calls[0]?.[1]).toMatchObject({
      agent_id: "codex-acp",
      transport: {
        env: [
          {
            configured: true,
            name: "OPENAI_API_KEY",
            secret: true,
            value: "",
          },
        ],
        registry_id: "openai/codex",
        transport: "registry",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(startAgentRuntimeTestJobMock).toHaveBeenCalledWith("codex-acp"));
    fireEvent.click(lastBackButton());
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ACP registry" }));
    expect(await screen.findByText("Codex Runtime")).toBeVisible();
    expect(screen.getByText("1.0.0 · npx · Available")).toBeVisible();
    expect(getAgentRuntimeRegistryMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() =>
      expect(installAgentRuntimeFromRegistryMock).toHaveBeenCalledWith(
        "openai/codex",
        {
          distribution: "auto",
          env: {},
        },
      ),
    );
    fireEvent.click(lastBackButton());

    fireEvent.click(within(sections).getByRole("button", { name: "Web" }));
    expect(await screen.findByText("https://search.example/")).toBeVisible();
    expect(getWebConfigMock).toHaveBeenCalledTimes(1);
  }, 120000);

  it("saves speech settings while preserving runtime tuning fields", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      language: "zh-CN",
      noise_reduction: "near_field",
      profile_eligibility: [
        {
          eligible: true,
          model: "qwen3-omni-flash",
          profile_name: "stt",
          reason: null,
        },
      ],
      prompt: "existing terms",
      stt_profile_name: null,
      vad_prefix_padding_ms: 240,
      vad_silence_duration_ms: 620,
      vad_threshold: 0.62,
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Speech" }));

    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "STT profile" }));
    await clickAntdSelectOption("stt (qwen3-omni-flash)");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Language" }));
    await clickAntdSelectOption("English (US)");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "edited terms" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveSpeechConfigMock).toHaveBeenCalledWith({
        language: "en-US",
        noise_reduction: "near_field",
        prompt: "edited terms",
        stt_profile_name: "stt",
        vad_prefix_padding_ms: 240,
        vad_silence_duration_ms: 620,
        vad_threshold: 0.62,
      }),
    );
  });

  it("explains unavailable speech profiles when no realtime STT option can be selected", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      language: "es-MX",
      profile_eligibility: [
        {
          eligible: false,
          model: "gpt-4o-transcribe-diarize",
          profile_name: "diarize",
          reason: "diarization_not_supported",
        },
        {
          eligible: false,
          model: "text-only",
          profile_name: "no_speech",
          reason: "input_audio_not_supported",
        },
        {
          eligible: false,
          model: "gpt-5-mini",
          profile_name: "openai",
          reason: "provider_not_supported",
        },
        {
          eligible: false,
          model: "tts-1",
          profile_name: "tts",
          reason: "tts_only",
        },
        {
          eligible: false,
          model: "custom-voice",
          profile_name: "unknown",
          reason: "realtime_stt_not_declared",
        },
      ],
      prompt: "",
      stt_profile_name: "missing-saved-profile",
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Speech" }));

    expect(
      await screen.findByText("No realtime STT model profiles are available."),
    ).toBeVisible();
    expect(screen.getByText("Unavailable profiles")).toBeVisible();
    expect(screen.getByText("missing-saved-profile")).toBeVisible();
    expect(
      screen.getByText("Only OpenAI Compatible profiles can use realtime STT."),
    ).toBeVisible();
    expect(
      screen.getByText("Diarization models are not supported for realtime input."),
    ).toBeVisible();
    expect(screen.getByText("This profile is marked as a TTS model.")).toBeVisible();
    expect(screen.getByText("Speech is disabled for this profile.")).toBeVisible();
    expect(
      screen.getByText("Mark this profile as an STT model in Model settings."),
    ).toBeVisible();
  });

  it("links migrated model and proxy labels to real controls", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    const visionRow = (await screen.findByText("vision")).closest(".at-model-profile-row");
    expect(visionRow).not.toBeNull();
    fireEvent.click(within(visionRow as HTMLElement).getByRole("button", { name: /vision/ }));
    expect(await screen.findByLabelText("Profile ID")).toBeVisible();
    expect(screen.getByLabelText("Model")).toBeVisible();
    expect(screen.getByLabelText("Base URL")).toBeVisible();
    expect(screen.getByLabelText("API Key")).toBeVisible();
    expect(screen.getByLabelText("Image Input")).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toBeVisible();
    expect(screen.getByLabelText("Top P")).toBeVisible();
    expect(screen.getByLabelText("Max tokens")).toBeVisible();
    expect(screen.getByLabelText("Context window")).toBeVisible();
    expect(screen.getByLabelText("Timeout seconds")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Proxy" }));
    expect(await screen.findByLabelText("HTTP Proxy")).toBeVisible();
    expect(screen.getByLabelText("HTTPS Proxy")).toBeVisible();
    expect(screen.getByLabelText("ALL Proxy")).toBeVisible();
    expect(screen.getByLabelText("NO_PROXY")).toBeVisible();
    expect(screen.getByLabelText("Target URL")).toBeVisible();
    expect(screen.getByLabelText("Timeout (ms)")).toBeVisible();
  }, 30000);

  it("links migrated workspace and role labels to real controls", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });

    fireEvent.click(within(sections).getByRole("button", { name: "Remote workspace" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Profile ID")).toHaveValue("devbox");
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Remote shell")).toBeInTheDocument();
    expect(screen.getByLabelText("Connect timeout (s)")).toBeInTheDocument();
    expect(screen.getByLabelText("Private key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    const reviewerRoleRow = (await screen.findByText("Reviewer")).closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);
    expect(await screen.findByLabelText("Role ID")).toBeVisible();
    expect(screen.getByLabelText("Role name")).toBeVisible();
    expect(screen.getByLabelText("Version")).toBeVisible();
    expect(screen.getByLabelText("Model profile")).toBeVisible();
    fireEvent.click(screen.getByText("Advanced runtime settings"));
    expect(screen.getByRole("switch", { name: "Memory enabled" })).toBeVisible();
  }, 30000);

  it("edits role config capabilities without dropping V1 role fields", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    const reviewerRoleRow = (await screen.findByText("Reviewer")).closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);

    expect(await screen.findByLabelText("Role ID")).toHaveValue("reviewer");
    fireEvent.click(screen.getByText("Advanced runtime settings"));
    expect(screen.getByText("browser (unavailable saved value)")).toBeVisible();
    expect(
      screen.getAllByText("read_file (unavailable saved value)").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("filesystem (unavailable saved value)").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Review (builtin)").length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByLabelText("Prompt view")).getByText("Preview"));
    expect(screen.getByRole("region", { name: "Preview" })).toHaveTextContent(
      "Review carefully.",
    );
    fireEvent.click(within(screen.getByLabelText("Prompt view")).getByText("Edit"));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Review changed work." },
    });
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "Review carefully and cite risks." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveRoleConfigMock).toHaveBeenCalledTimes(1));
    expect(saveRoleConfigMock.mock.calls[0]?.[0]).toBe("reviewer");
    expect(saveRoleConfigMock.mock.calls[0]?.[1]).toMatchObject({
      bound_agent_id: "codex-local",
      description: "Review changed work.",
      execution_surface: "browser",
      mcp_servers: ["filesystem"],
      memory_profile: { enabled: true },
      model_profile: "default",
      role_id: "reviewer",
      skills: ["review"],
      system_prompt: "Review carefully and cite risks.",
      tools: ["read_file"],
    });
  });

  it("uses registry selects while keeping unavailable saved role values visible", async () => {
    getRoleConfigMock.mockResolvedValueOnce({
      bound_agent_id: null,
      description: "Legacy role",
      execution_surface: "api",
      mode: "legacy-mode",
      model_profile: "missing-profile",
      mcp_servers: ["missing-mcp"],
      name: "Reviewer",
      role_id: "reviewer",
      skills: ["missing-skill"],
      system_prompt: "Review legacy work.",
      tools: ["missing-tool"],
      version: "1.0.0",
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    const reviewerRoleRow = (await screen.findByText("Reviewer")).closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);

    expect(
      await screen.findByText("missing-profile (unavailable saved value)"),
    ).toBeVisible();
    expect(screen.getByText("legacy-mode (unavailable saved value)")).toBeVisible();
    expect(screen.getByText("missing-skill (unavailable saved value)")).toBeVisible();
    expect(screen.getByText("missing-tool (unavailable saved value)")).toBeVisible();
    expect(screen.getByText("missing-mcp (unavailable saved value)")).toBeVisible();

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Model profile" }));
    expect(await screen.findByRole("option", { name: "default" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Mode" }));
    expect(await screen.findByRole("option", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Subagent" })).toBeInTheDocument();
  });

  it("manages plugins from its primary settings page", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");

    expect(await screen.findByText("workspace-tools")).toBeVisible();
    expect(screen.getByText("quality")).toBeVisible();
    expect(getPluginsConfigMock).toHaveBeenCalledTimes(1);
    expect(getPluginsRuntimeMock).toHaveBeenCalledTimes(1);

    const enabledRow = screen
      .getByText("workspace-tools")
      .closest(".at-plugin-list-row") as HTMLElement;
    const disabledRow = screen
      .getByText("quality")
      .closest(".at-plugin-list-row") as HTMLElement;

    fireEvent.click(within(disabledRow).getByRole("button", { name: "Enable" }));
    await waitFor(() =>
      expect(enablePluginMock).toHaveBeenCalledWith("quality", { scope: "project" }),
    );

    fireEvent.click(within(enabledRow).getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(disablePluginMock).toHaveBeenCalledWith("workspace-tools", {
        scope: "user",
      }),
    );

    fireEvent.click(within(enabledRow).getByRole("button", { name: "Update" }));
    await waitFor(() =>
      expect(updatePluginMock).toHaveBeenCalledWith("workspace-tools", {
        scope: "user",
        version: "1.0.0",
      }),
    );

    fireEvent.click(within(enabledRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    await waitFor(() =>
      expect(deletePluginMock).toHaveBeenCalledWith("workspace-tools", {
        prune: false,
        scope: "user",
      }),
    );
  });

  it("renders plugin empty state without adding a search UI", async () => {
    getPluginsConfigMock.mockResolvedValueOnce({ diagnostics: [], plugins: [] });
    getPluginsRuntimeMock.mockResolvedValueOnce({ diagnostics: [], plugins: [] });
    renderDrawer();

    await openSettingsSection("Plugins");

    expect(await screen.findByText("No plugins configured.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Plugin" })).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/plugin/i)).not.toBeInTheDocument();
    expect(document.querySelector(".at-plugin-list-row")).toBeNull();
  });

  it("installs a plugin from the System Plugins secondary page", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));

    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Git"));
    fireEvent.change(await screen.findByLabelText("Source"), {
      target: { value: "https://example.test/plugins/quality.git" },
    });
    fireEvent.change(await screen.findByLabelText("Source ref"), {
      target: { value: "v1.2.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));

    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        enabled: true,
        scope: "user",
        source: "https://example.test/plugins/quality.git",
        source_kind: "git",
        source_ref: "v1.2.0",
      }),
    );
    await waitForPluginListSettled();
  });

  it("shows a pending state while plugin install is running", async () => {
    let resolveInstall: (
      value: Awaited<ReturnType<typeof installPlugin>>,
    ) => void = () => undefined;
    installPluginMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInstall = resolve;
        }),
    );
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));
    fireEvent.change(await screen.findByLabelText("Source"), {
      target: { value: "C:/plugins/local-quality" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));

    await waitFor(() => expect(installPluginMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Add Plugin/ })).toBeDisabled();
    resolveInstall({ diagnostics: [], plugins: [] });
    await waitFor(() => expect(screen.getByText("workspace-tools")).toBeVisible());
  });

  it("keeps marketplace install fields scoped to marketplace mode", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));

    expect(await screen.findByLabelText("Source")).toBeVisible();
    expect(screen.queryByLabelText("Marketplace")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace provider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load marketplace" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "C:/plugins/local-quality" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));

    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        enabled: true,
        scope: "user",
        source: "C:/plugins/local-quality",
        source_kind: "local",
      }),
    );
    await waitForPluginListSettled();
  });

  it("loads marketplace plugins before installing the selected version", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));

    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Marketplace"));
    fireEvent.change(await screen.findByLabelText("Marketplace"), {
      target: { value: "C:/plugins/marketplace.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load marketplace" }));

    await waitFor(() =>
      expect(loadPluginMarketplaceMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        fetch_all: true,
        include_details: false,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        refresh: true,
      }),
    );
    expect(await screen.findByText("market-quality 1.2.0")).toBeVisible();
    expect(screen.queryByText("unsupported-quality")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));
    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        enabled: true,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        scope: "user",
        source: "market-quality",
        source_kind: "marketplace",
        version: null,
      }),
    );
    await waitForPluginListSettled();
  });

  it("blocks unsupported marketplace entries after loading them", async () => {
    loadPluginMarketplaceMock.mockResolvedValueOnce({
      plugins: [
        {
          latest: "2.0.0",
          name: "unsupported-quality",
          versions: [
            {
              source: { kind: "unsupported", value: "@example/plugin" },
              unsupported_reason: "npm packages are not supported",
              version: "2.0.0",
            },
          ],
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));
    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Marketplace"));
    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Marketplace provider" }));
    await clickAntdSelectOption("claude");
    fireEvent.click(screen.getByRole("button", { name: "Load marketplace" }));

    expect(await screen.findByText(/No supported marketplace versions/)).toBeVisible();
    expect(screen.getByText(/npm packages are not supported/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Plugin" })).toBeDisabled();
    expect(screen.queryByText("unsupported-quality 2.0.0")).not.toBeInTheDocument();
    expect(installPluginMock).not.toHaveBeenCalled();
  });

  it("uses semantic version details when marketplace entries have no latest version", async () => {
    loadPluginMarketplaceMock.mockResolvedValueOnce({
      plugins: [
        {
          name: "market-beta",
          versions: [
            {
              source: {
                kind: "http_archive",
                sha: "sha-alpha-beta",
                value: "https://repo/beta.zip",
              },
              version: "0.1.0",
            },
          ],
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));
    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Marketplace"));
    fireEvent.change(await screen.findByLabelText("Marketplace"), {
      target: { value: "C:/plugins/marketplace.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load marketplace" }));

    expect(await screen.findByText("market-beta")).toBeVisible();
    expect(await screen.findByText("0.1.0 sha-alpha-beta")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));

    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        enabled: true,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        scope: "user",
        source: "market-beta",
        source_kind: "marketplace",
        version: "0.1.0",
      }),
    );
    await waitForPluginListSettled();
  });

  it("loads Claude marketplace plugins with provider defaults", async () => {
    loadPluginMarketplaceMock.mockResolvedValueOnce({
      plugins: [
        {
          latest: "0.3.0",
          name: "claude-memory",
          versions: [
            {
              source: {
                kind: "git",
                ref: "v0.3.0",
                value: "https://github.com/anthropics/claude-memory",
              },
              version: "0.3.0",
            },
          ],
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));

    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Marketplace"));
    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Marketplace provider" }));
    await clickAntdSelectOption("claude");
    await waitFor(() =>
      expect(screen.getByLabelText("Marketplace")).toHaveValue(
        "claude-plugins-official",
      ),
    );
    expect(screen.getByLabelText("Marketplace source")).toHaveValue(
      "anthropics/claude-plugins-official",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load marketplace" }));

    await waitFor(() =>
      expect(loadPluginMarketplaceMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        fetch_all: true,
        include_details: false,
        marketplace: "claude-plugins-official",
        marketplace_provider: "claude",
        marketplace_ref: "",
        marketplace_source: "anthropics/claude-plugins-official",
        refresh: true,
      }),
    );
    expect(await screen.findByText("claude-memory 0.3.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));

    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        enabled: true,
        marketplace: "claude-plugins-official",
        marketplace_provider: "claude",
        marketplace_ref: "",
        marketplace_source: "anthropics/claude-plugins-official",
        scope: "user",
        source: "claude-memory",
        source_kind: "marketplace",
        version: null,
      }),
    );
    await waitForPluginListSettled();
  });

  it("loads ClawHub marketplace entries with safe direct compatibility defaults", async () => {
    loadPluginMarketplaceMock.mockResolvedValueOnce({
      plugins: [
        {
          compatibility: "direct",
          latest: "1.0.0",
          name: "direct-plugin",
          provider_family: "clawhub",
          versions: [
            {
              source: { kind: "git", ref: "v1.0.0", value: "https://repo/direct" },
              version: "1.0.0",
              warnings: ["review permissions"],
            },
          ],
        },
        {
          compatibility: "partial",
          latest: "1.0.0",
          name: "partial-plugin",
          provider_family: "clawhub",
          versions: [
            {
              source: { kind: "git", ref: "v1.0.0", value: "https://repo/partial" },
              version: "1.0.0",
            },
          ],
        },
        {
          compatibility: "unknown",
          latest: "1.0.0",
          name: "unknown-plugin",
          provider_family: "clawhub",
          versions: [
            {
              source: { kind: "git", ref: "v1.0.0", value: "https://repo/unknown" },
              version: "1.0.0",
            },
          ],
        },
        {
          compatibility: "direct",
          latest: "2.0.0",
          name: "unsupported-plugin",
          provider_family: "clawhub",
          versions: [
            {
              source: { kind: "unsupported", value: "@example/plugin" },
              unsupported_reason: "npm packages are not supported",
              version: "2.0.0",
            },
          ],
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    fireEvent.click(await screen.findByRole("button", { name: "Add Plugin" }));

    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Source type" }));
    fireEvent.click(await screen.findByText("Marketplace"));
    fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Marketplace provider" }));
    await clickAntdSelectOption("clawhub");
    fireEvent.click(screen.getByRole("button", { name: "Load marketplace" }));

    await waitFor(() =>
      expect(loadPluginMarketplaceMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: true,
        allow_unclean_scan: false,
        fetch_all: true,
        include_details: false,
        marketplace: "clawhub",
        marketplace_provider: "clawhub",
        marketplace_ref: "",
        marketplace_source: "https://clawhub.ai",
        refresh: true,
      }),
    );
    expect(await screen.findByText("direct-plugin 1.0.0")).toBeVisible();
    expect(screen.queryByText("partial-plugin 1.0.0")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown-plugin 1.0.0")).not.toBeInTheDocument();
    expect(screen.queryByText("unsupported-plugin 2.0.0")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Plugin" }));
    await waitFor(() =>
      expect(installPluginMock).toHaveBeenCalledWith({
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: true,
        allow_unclean_scan: false,
        enabled: true,
        marketplace: "clawhub",
        marketplace_provider: "clawhub",
        marketplace_ref: "",
        marketplace_source: "https://clawhub.ai",
        scope: "user",
        source: "direct-plugin",
        source_kind: "marketplace",
        version: null,
      }),
    );
    await waitForPluginListSettled();
  });

  it("selects a marketplace version before updating marketplace plugins", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");

    const marketRow = (await screen.findByText("market-quality")).closest(
      ".at-plugin-list-row",
    ) as HTMLElement;
    fireEvent.click(within(marketRow).getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(loadPluginMarketplaceMock).toHaveBeenCalledWith({
        allow_missing_digest: false,
        fetch_all: true,
        include_details: false,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        refresh: true,
      }),
    );
    expect(await screen.findByText("latest (1.2.0)")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Version" }));
    fireEvent.click(await screen.findByText("1.1.0 v1.1.0"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(updatePluginMock).toHaveBeenCalledWith("market-quality", {
        allow_missing_digest: false,
        scope: "user",
        version: "1.1.0",
      }),
    );
  });

  it("updates ClawHub marketplace plugins by matching the source value", async () => {
    getPluginsConfigMock.mockResolvedValueOnce({
      diagnostics: [],
      plugins: [
        {
          description: "Feishu integration",
          enabled: true,
          name: "feishu",
          scope: "user",
          source: {
            kind: "marketplace",
            marketplace: "clawhub",
            marketplace_provider: "clawhub",
            marketplace_source: "https://clawhub.ai",
            value: "@openclaw/feishu",
          },
          valid: true,
          version: "0.9.0",
        },
      ],
    });
    loadPluginMarketplaceMock.mockResolvedValueOnce({
      plugins: [
        {
          compatibility: "direct",
          latest: "2.0.0",
          name: "@openclaw/feishu",
          provider_family: "clawhub",
          versions: [
            {
              source: { kind: "unsupported", value: "@openclaw/feishu" },
              unsupported_reason: "native package is not supported",
              version: "2.0.0",
            },
            {
              source: { kind: "git", ref: "v1.1.0", value: "https://repo/feishu" },
              version: "1.1.0",
            },
          ],
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    const feishuRow = (await screen.findByText("feishu")).closest(
      ".at-plugin-list-row",
    ) as HTMLElement;
    fireEvent.click(within(feishuRow).getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(loadPluginMarketplaceMock).toHaveBeenCalledWith({
        allow_missing_digest: true,
        fetch_all: true,
        include_details: true,
        marketplace: "clawhub",
        marketplace_provider: "clawhub",
        marketplace_ref: "",
        marketplace_source: "https://clawhub.ai",
        refresh: true,
      }),
    );
    expect(await screen.findByText("1.1.0 v1.1.0")).toBeVisible();
    expect(screen.queryByText("2.0.0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(updatePluginMock).toHaveBeenCalledWith("feishu", {
        allow_missing_digest: true,
        scope: "user",
        version: "1.1.0",
      }),
    );
  });

  it("configures plugin user_config without resending unchanged sensitive values", async () => {
    renderDrawer();

    await openSettingsSection("Plugins");

    const enabledRow = (await screen.findByText("workspace-tools")).closest(
      ".at-plugin-list-row",
    ) as HTMLElement;
    fireEvent.click(within(enabledRow).getByRole("button", { name: "Configure" }));

    fireEvent.change(await screen.findByLabelText("Endpoint"), {
      target: { value: "https://docs.changed" },
    });
    fireEvent.change(await screen.findByLabelText("Payload"), {
      target: { value: '{"mode":"loose"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(configurePluginMock).toHaveBeenCalledWith("workspace-tools", {
        scope: "user",
        user_config: {
          endpoint: "https://docs.changed",
          payload: { mode: "loose" },
        },
      }),
    );
  });

  it("round-trips json plugin config strings", async () => {
    getPluginsConfigMock.mockResolvedValueOnce({
      diagnostics: [],
      plugins: [
        {
          description: "JSON config",
          enabled: true,
          manifest: {
            user_config: {
              payload: {
                title: "Payload",
                type: "json",
              },
            },
          },
          name: "json-config",
          scope: "user",
          user_config: {
            payload: "token",
          },
          valid: true,
          version: "1.0.0",
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    const jsonRow = (await screen.findByText("json-config")).closest(
      ".at-plugin-list-row",
    ) as HTMLElement;
    fireEvent.click(within(jsonRow).getByRole("button", { name: "Configure" }));

    expect(await screen.findByLabelText("Payload")).toHaveValue("\"token\"");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(configurePluginMock).toHaveBeenCalledWith("json-config", {
        scope: "user",
        user_config: {
          payload: "token",
        },
      }),
    );
  });

  it("validates typed plugin user_config values before saving", async () => {
    getPluginsConfigMock.mockResolvedValueOnce({
      diagnostics: [],
      plugins: [
        {
          description: "Typed configuration",
          enabled: true,
          manifest: {
            user_config: {
              existing_optional: {
                title: "Existing optional",
                type: "string",
              },
              metadata: {
                title: "Metadata",
                type: "object",
              },
              notes: {
                title: "Notes",
              },
              retries: {
                title: "Retries",
                type: "integer",
              },
              secret_flag: {
                sensitive: true,
                title: "Secret flag",
                type: "boolean",
              },
              secret_json: {
                sensitive: true,
                title: "Secret JSON",
                type: "object",
              },
              tags: {
                title: "Tags",
                type: "array",
              },
            },
          },
          name: "typed-config",
          scope: "user",
          user_config: {
            existing_optional: "clear me",
            secret_flag: "<configured>",
            secret_json: "<configured>",
          },
          valid: true,
          version: "1.0.0",
        },
      ],
    });
    renderDrawer();

    await openSettingsSection("Plugins");
    const typedRow = (await screen.findByText("typed-config")).closest(
      ".at-plugin-list-row",
    ) as HTMLElement;
    fireEvent.click(within(typedRow).getByRole("button", { name: "Configure" }));

    fireEvent.change(await screen.findByLabelText("Retries"), {
      target: { value: "2.9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(configurePluginMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Retries"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "[\"fast\",\"safe\"]" },
    });
    fireEvent.change(screen.getByLabelText("Metadata"), {
      target: { value: "{\"mode\":\"strict\"}" },
    });
    fireEvent.change(screen.getByLabelText("Existing optional"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Secret flag" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(configurePluginMock).toHaveBeenCalledWith("typed-config", {
        scope: "user",
        user_config: {
          existing_optional: "",
          metadata: { mode: "strict" },
          retries: 100,
          secret_flag: false,
          tags: ["fast", "safe"],
        },
      }),
    );
  });

  it("validates and saves hooks from its primary settings page", async () => {
    renderDrawer();

    await openSettingsSection("Hooks");

    expect((await screen.findAllByText("Session startup setup")).length).toBeGreaterThan(0);
    expect(screen.getByText("SessionStart · python hooks/start.py")).toBeVisible();
    expect(getHooksConfigMock).toHaveBeenCalledTimes(1);
    expect(getHookRuntimeViewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() =>
      expect(validateHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  command: "python hooks/start.py",
                  name: "Session startup setup",
                  on_error: "ignore",
                  type: "command",
                },
              ],
              matcher: "*",
            },
          ],
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getAllByLabelText("Hook name")[0] as HTMLElement, {
      target: { value: "Updated session setup" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "python hooks/session_start.py" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  command: "python hooks/session_start.py",
                  name: "Session startup setup",
                  on_error: "ignore",
                  type: "command",
                },
              ],
              matcher: "*",
              name: "Updated session setup",
            },
          ],
        },
      }),
    );
  });

  it("manages GitHub settings from its homepage contextual route", async () => {
    getGitHubWebhookTunnelStatusMock.mockResolvedValue({
      provider: "localhost.run",
      public_url: "https://relay.localhost.run",
      status: "active",
    });
    renderDrawer("github");

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(sections).queryByRole("button", { name: "GitHub" })).toBeNull();

    expect(await screen.findByText("GitHub CLI")).toBeVisible();
    expect(screen.getByText("https://hooks.example/api/triggers/github/deliveries")).toBeVisible();
    expect(getGitHubConfigMock).toHaveBeenCalledTimes(1);
    expect(getGitHubWebhookTunnelStatusMock).toHaveBeenCalledTimes(1);
    expect(startGitHubWebhookTunnelMock).not.toHaveBeenCalled();
    expect(stopGitHubWebhookTunnelMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reveal token" }));
    await waitFor(() => expect(revealGitHubTokenMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("ghp_saved")).toBeVisible();

    const tokenInput = screen.getByLabelText("Token");
    fireEvent.focus(tokenInput);
    fireEvent.change(tokenInput, {
      target: { value: "ghp_next" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test GitHub CLI" }));
    await waitFor(() =>
      expect(probeGitHubConnectivityMock).toHaveBeenCalledWith({
        token: "ghp_next",
      }),
    );
    expect(await screen.findByText("Connected as octocat in 21 ms.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() => expect(saveGitHubConfigMock).toHaveBeenCalledTimes(1));
    expect(saveGitHubConfigMock).toHaveBeenNthCalledWith(1, {
      token: "ghp_next",
    });

    fireEvent.change(screen.getByLabelText("Webhook base URL"), {
      target: { value: "https://changed.example" },
    });
    expect(screen.getByText("https://changed.example/api/triggers/github/deliveries")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Test callback" }));
    await waitFor(() =>
      expect(probeGitHubWebhookConnectivityMock).toHaveBeenCalledWith({
        webhook_base_url: "https://changed.example",
      }),
    );
    expect(await screen.findByText("Callback returned 200 in 34 ms.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() => expect(saveGitHubConfigMock).toHaveBeenCalledTimes(2));
    expect(saveGitHubConfigMock).toHaveBeenNthCalledWith(2, {
      webhook_base_url: "https://changed.example",
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop tunnel" }));
    await waitFor(() =>
      expect(stopGitHubWebhookTunnelMock).toHaveBeenCalledWith({
        clear_webhook_base_url_if_matching: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Start tunnel" }));
    await waitFor(() =>
      expect(startGitHubWebhookTunnelMock).toHaveBeenCalledWith({
        auto_save_webhook_base_url: true,
      }),
    );
  }, 75000);

  it("sets defaults, deletes, and creates orchestration presets", async () => {
    let orchestrationConfig = orchestrationConfigFixture();
    getOrchestrationConfigMock.mockImplementation(async () => orchestrationConfig);
    saveOrchestrationConfigMock.mockImplementation(async (nextConfig) => {
      orchestrationConfig = nextConfig;
      return { status: "ok" };
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));

    const shippingRow = (await screen.findByText("1 roles · Release flow")).closest(
      ".at-settings-list-row",
    );
    expect(shippingRow).not.toBeNull();
    fireEvent.click(within(shippingRow as HTMLElement).getByRole("button", { name: "Set default" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(1));
    expect(saveOrchestrationConfigMock.mock.calls[0]?.[0]).toEqual({
      default_orchestration_preset_id: "shipping",
      presets: orchestrationConfigFixture().presets,
    });

    const defaultRow = (await screen.findByText("2 roles · Main plus reviewer")).closest(
      ".at-settings-list-row",
    );
    expect(defaultRow).not.toBeNull();
    fireEvent.click(within(defaultRow as HTMLElement).getByRole("button", { name: /Default/ }));
    expect(await screen.findByLabelText("Preset ID")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(2));
    expect(saveOrchestrationConfigMock.mock.calls[1]?.[0]).toEqual({
      default_orchestration_preset_id: "shipping",
      presets: [orchestrationConfigFixture().presets?.[1]],
    });

    fireEvent.click(await screen.findByRole("button", { name: "New orchestration" }));
    expectSelectedSelectOption("Roles", "Reviewer (reviewer)");
    fireEvent.change(await screen.findByLabelText("Preset ID"), {
      target: { value: "analysis" },
    });
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "Analysis" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Analysis role flow" },
    });
    fireEvent.change(screen.getByLabelText("Orchestration prompt"), {
      target: { value: "Analyze and report risks." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(3));
    expect(saveOrchestrationConfigMock.mock.calls[2]?.[0]).toEqual({
      default_orchestration_preset_id: "shipping",
      presets: [
        orchestrationConfigFixture().presets?.[1],
        {
          description: "Analysis role flow",
          name: "Analysis",
          orchestration_prompt: "Analyze and report risks.",
          policy: {
            max_orchestration_cycles: 8,
            max_parallel_delegated_tasks: 4,
          },
          preset_id: "analysis",
          role_ids: ["reviewer"],
        },
      ],
    });
  }, 75000);

  it("round-trips inherited orchestration policies across default, rename, and delete", async () => {
    const inheritedPreset: OrchestrationPreset = {
      description: "Inherited limits",
      name: "Inherited",
      orchestration_prompt: "Use inherited runtime limits.",
      policy: {
        auto_plan_long_tasks: null,
        max_orchestration_cycles: null,
        planner_role_id: null,
      },
      preset_id: "inherited",
      role_ids: ["reviewer"],
    };
    const omittedPolicyPreset: OrchestrationPreset = {
      description: "Omitted policy",
      name: "Omitted",
      orchestration_prompt: "Use the server policy.",
      preset_id: "omitted",
      role_ids: ["reviewer"],
    };
    const explicitPreset: OrchestrationPreset = {
      description: "Explicit limits",
      name: "Explicit",
      orchestration_prompt: "Use explicit runtime limits.",
      policy: {
        coordinator_inline_budget_steps: null,
        max_orchestration_cycles: 12,
        max_parallel_delegated_tasks: 3,
        max_temporary_roles_per_run: null,
      },
      preset_id: "explicit",
      role_ids: ["reviewer"],
    };
    let orchestrationConfig: OrchestrationConfig = {
      default_orchestration_preset_id: "inherited",
      presets: [inheritedPreset, omittedPolicyPreset, explicitPreset],
    };
    getOrchestrationConfigMock.mockImplementation(async () => orchestrationConfig);
    saveOrchestrationConfigMock.mockImplementation(async (nextConfig) => {
      orchestrationConfig = nextConfig;
      return { status: "ok" };
    });
    renderDrawer();
    await openSettingsSection("Orchestration");

    const omittedRow = (await screen.findByText("1 roles · Omitted policy")).closest(
      ".at-settings-list-row",
    );
    expect(omittedRow).not.toBeNull();
    fireEvent.click(
      within(omittedRow as HTMLElement).getByRole("button", { name: "Set default" }),
    );
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(1));
    expect(saveOrchestrationConfigMock.mock.calls[0]?.[0]).toStrictEqual({
      default_orchestration_preset_id: "omitted",
      presets: [inheritedPreset, omittedPolicyPreset, explicitPreset],
    });

    fireEvent.click(
      within(omittedRow as HTMLElement).getByRole("button", { name: /Omitted/ }),
    );
    const presetIdInput = await screen.findByLabelText("Preset ID");
    fireEvent.change(presetIdInput, { target: { value: "omitted-renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(2));
    const renamedOmittedPreset: OrchestrationPreset = {
      ...omittedPolicyPreset,
      preset_id: "omitted-renamed",
    };
    expect(saveOrchestrationConfigMock.mock.calls[1]?.[0]).toStrictEqual({
      default_orchestration_preset_id: "omitted-renamed",
      presets: [inheritedPreset, renamedOmittedPreset, explicitPreset],
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        saveOrchestrationConfigMock.mock.calls[1]?.[0].presets?.[1],
        "policy",
      ),
    ).toBe(false);

    const backButton = screen.queryByRole("button", { name: "Back" });
    if (backButton !== null) {
      fireEvent.click(backButton);
    }
    const inheritedRow = (await screen.findByText("1 roles · Inherited limits")).closest(
      ".at-settings-list-row",
    );
    expect(inheritedRow).not.toBeNull();
    fireEvent.click(
      within(inheritedRow as HTMLElement).getByRole("button", { name: /Inherited/ }),
    );
    fireEvent.change(await screen.findByLabelText("Preset ID"), {
      target: { value: "inherited-renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(3));
    const renamedInheritedPreset: OrchestrationPreset = {
      ...inheritedPreset,
      preset_id: "inherited-renamed",
    };
    expect(saveOrchestrationConfigMock.mock.calls[2]?.[0]).toStrictEqual({
      default_orchestration_preset_id: "omitted-renamed",
      presets: [renamedInheritedPreset, renamedOmittedPreset, explicitPreset],
    });

    const renamedBackButton = screen.queryByRole("button", { name: "Back" });
    if (renamedBackButton !== null) {
      fireEvent.click(renamedBackButton);
    }
    const explicitRow = (await screen.findByText("1 roles · Explicit limits")).closest(
      ".at-settings-list-row",
    );
    expect(explicitRow).not.toBeNull();
    fireEvent.click(
      within(explicitRow as HTMLElement).getByRole("button", { name: /Explicit/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(4));
    expect(saveOrchestrationConfigMock.mock.calls[3]?.[0]).toStrictEqual({
      default_orchestration_preset_id: "omitted-renamed",
      presets: [renamedInheritedPreset, renamedOmittedPreset],
    });
  }, 75000);

  it("keeps orchestration draft cancellation out of the persisted preset list", async () => {
    await openOrchestrationSettings();

    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();
    expect(screen.getByText("Shipping")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "New orchestration" }));
    expect(await screen.findByDisplayValue("orchestration_3")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Shipping")).toBeVisible();
    expect(screen.queryByDisplayValue("orchestration_3")).toBeNull();
    expect(screen.queryByText("New Orchestration")).toBeNull();
    expect(saveOrchestrationConfigMock).not.toHaveBeenCalled();
  });

  it("waits for role options before freezing a new orchestration draft", async () => {
    let resolveRoles: (roles: RoleConfigOptions) => void = () => undefined;
    getRoleConfigOptionsMock.mockReturnValueOnce(
      new Promise<RoleConfigOptions>((resolve) => {
        resolveRoles = resolve;
      }),
    );
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(
      within(sections).getByRole("button", { name: "Orchestration" }),
    );
    const newButton = await screen.findByRole("button", {
      name: "New orchestration",
    });
    expect(newButton).toBeDisabled();

    resolveRoles({
      coordinator_role_id: "coordinator",
      main_agent_role_id: "main",
      normal_mode_roles: [{ name: "Main Agent", role_id: "main" }],
      subagent_roles: [{ name: "Reviewer", role_id: "reviewer" }],
    });

    await waitFor(() => expect(newButton).toBeEnabled());
    fireEvent.click(newButton);
    expect(await screen.findByDisplayValue("orchestration_3")).toBeVisible();
    expectSelectedSelectOption("Roles", "Reviewer (reviewer)");
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "Frozen draft" },
    });
    expect(screen.getByLabelText("Preset name")).toHaveValue("Frozen draft");
  });

  it("keeps orchestration presets visible when role option loading fails", async () => {
    getRoleConfigOptionsMock.mockRejectedValueOnce(new Error("System roles unavailable."));
    await openOrchestrationSettings();

    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();
    expect(screen.getByText("Shipping")).toBeVisible();
    expect(screen.getByText("System roles unavailable.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.queryByText("System roles unavailable.")).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Preset ID")).toBeNull();
    expect(saveOrchestrationConfigMock).not.toHaveBeenCalled();
  });

  it("preserves orchestration graph templates when saving an existing preset", async () => {
    const defaultPreset = orchestrationConfigFixture().presets?.[0];
    if (!defaultPreset) {
      throw new Error("Missing default orchestration preset fixture.");
    }

    await openOrchestrationSettings();

    const defaultRow = (await screen.findByText("2 roles · Main plus reviewer")).closest(
      ".at-settings-list-row",
    );
    expect(defaultRow).not.toBeNull();
    fireEvent.click(within(defaultRow as HTMLElement).getByRole("button", { name: /Default/ }));

    expect(await screen.findByLabelText("Preset ID")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /default/i })).toBeNull();
    const graphInput = screen.getByLabelText("Graph JSON");
    expect(graphInput).toHaveValue(JSON.stringify(defaultPreset.graph, null, 2));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveOrchestrationConfigMock).toHaveBeenCalledTimes(1));
    const savedConfig = saveOrchestrationConfigMock.mock.calls[0]?.[0];
    if (!savedConfig?.presets) {
      throw new Error("Expected orchestration settings save payload.");
    }
    const savedPreset = savedConfig.presets.find((preset) => preset.preset_id === "default");
    expect(savedPreset).toMatchObject({
      graph: defaultPreset.graph,
      policy: {
        auto_plan_long_tasks: true,
        max_orchestration_cycles: 8,
        max_parallel_delegated_tasks: 4,
        planner_role_id: "planner",
      },
    });
  });

  it("creates and deletes agent runtimes from its primary settings page", async () => {
    renderDrawer();

    await openSettingsSection("Agent Runtime");

    expect(await screen.findByText("Codex CLI")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "New runtime" }));

    expect(await screen.findByText("Unsaved runtime")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Agent ID"), {
      target: { value: "local-cli" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Local CLI" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Local command runtime" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "codex" },
    });
    fireEvent.change(screen.getByLabelText("Arguments"), {
      target: { value: "--serve\n--profile local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveAgentRuntimeMock).toHaveBeenCalledWith(
        "local-cli",
        expect.objectContaining({
          agent_id: "local-cli",
          description: "Local command runtime",
          name: "Local CLI",
          protocol: "acp",
          transport: {
            args: ["--serve", "--profile local"],
            command: "codex",
            env: [],
            transport: "stdio",
          },
        }),
      ),
    );

    fireEvent.click(lastBackButton());
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    fireEvent.click(screen.getByText("Codex CLI").closest("button") as HTMLElement);
    expect(await screen.findByText("Agent ID")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByText('Delete agent runtime "codex-acp"?'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(1),
    );
    fireEvent.click(lastDeleteButton());

    await waitFor(() => expect(deleteAgentRuntimeMock).toHaveBeenCalledWith("codex-acp"));
  }, 75000);

  it("refreshes the ACP registry from the Agent Runtime secondary view", async () => {
    renderDrawer();

    await openSettingsSection("Agent Runtime");
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "ACP registry" }));

    expect(await screen.findByText("Codex Runtime")).toBeVisible();
    expect(getAgentRuntimeRegistryMock).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(refreshAgentRuntimeRegistryMock).toHaveBeenCalledTimes(1));
  }, 45000);

  it("manages trigger gateway accounts from its homepage contextual route", async () => {
    renderDrawer("triggers");

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(sections).queryByRole("button", { name: "Gateway" })).toBeNull();

    expect(await screen.findByText("Feishu Main")).toBeVisible();
    expect(await screen.findByText("WeChat Main")).toBeVisible();
    expect(screen.getByText("Relay Bot · workspace-1 · mention_only")).toBeVisible();
    expect(screen.getByText("workspace-1 · desktop · Running")).toBeVisible();
    expect(listFeishuGatewayAccountsMock).toHaveBeenCalledTimes(1);
    expect(listWeChatGatewayAccountsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reload Feishu gateway" }));
    await waitFor(() => expect(reloadFeishuGatewayMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Reload WeChat gateway" }));
    await waitFor(() => expect(reloadWeChatGatewayMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Connect WeChat" }));
    await waitFor(() => expect(startWeChatGatewayLoginMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(waitWeChatGatewayLoginMock).toHaveBeenCalledWith({
        session_key: "wechat-session",
        timeout_ms: 480000,
      }),
    );

    const feishuRow = screen.getByText("Feishu Main").closest(".at-trigger-row");
    expect(feishuRow).not.toBeNull();
    fireEvent.click(within(feishuRow as HTMLElement).getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(disableFeishuGatewayAccountMock).toHaveBeenCalledWith("feishu-main"),
    );

    const accountRowMain = screen.getByText("Feishu Main").closest("button");
    expect(accountRowMain).not.toBeNull();
    fireEvent.click(accountRowMain as HTMLElement);

    expect(await screen.findByText("Account ID")).toBeVisible();
    expect(screen.getAllByText("feishu-main").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "feishu-updated" },
    });
    fireEvent.change(screen.getByLabelText("App name"), {
      target: { value: "Relay Bot Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateFeishuGatewayAccountMock).toHaveBeenCalledTimes(1));
    expect(updateFeishuGatewayAccountMock.mock.calls[0]?.[0]).toBe("feishu-main");
    const updatePayload = updateFeishuGatewayAccountMock.mock.calls[0]?.[1];
    expect(updatePayload).toMatchObject({
      display_name: "Feishu Main",
      name: "feishu-updated",
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot Updated",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        workspace_id: "workspace-1",
        yolo: true,
      },
    });
    expect(updatePayload).not.toHaveProperty("secret_config");

    expect(await screen.findByText("WeChat Main")).toBeVisible();
    const wechatRowMain = screen.getByText("WeChat Main").closest("button");
    expect(wechatRowMain).not.toBeNull();
    fireEvent.click(wechatRowMain as HTMLElement);

    expect(await screen.findByText("WeChat gateway account and session target.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "WeChat Updated" },
    });
    fireEvent.change(screen.getByLabelText("Route tag"), {
      target: { value: "mobile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateWeChatGatewayAccountMock).toHaveBeenCalledTimes(1));
    expect(updateWeChatGatewayAccountMock.mock.calls[0]?.[0]).toBe("wechat-main");
    expect(updateWeChatGatewayAccountMock.mock.calls[0]?.[1]).toMatchObject({
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      display_name: "WeChat Updated",
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      route_tag: "mobile",
      session_mode: "normal",
      thinking: {
        enabled: false,
        effort: null,
      },
      workspace_id: "workspace-1",
      yolo: true,
    });
  }, 45000);

  it("saves editable role configs from the role detail page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));

    const reviewerRoleRow = (await screen.findByText("Reviewer")).closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);

    fireEvent.change(await screen.findByDisplayValue("Review changes"), {
      target: { value: "Review changes carefully" },
    });
    fireEvent.change(screen.getByDisplayValue("Review carefully."), {
      target: { value: "Review deeply before approving." },
    });
    const memorySwitch = screen.getByRole("switch", { name: "Memory enabled" });
    expect(memorySwitch).toBeChecked();
    fireEvent.click(memorySwitch);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveRoleConfigMock).toHaveBeenCalledTimes(1));
    expect(saveRoleConfigMock).toHaveBeenCalledWith(
      "reviewer",
      expect.objectContaining({
        bound_agent_id: "codex-local",
        contract: {
          invariants: [{ invariant: "must_review" }],
        },
        description: "Review changes carefully",
        mcp_servers: ["filesystem"],
        memory_profile: {
          enabled: false,
        },
        role_id: "reviewer",
        skills: ["review"],
        source_role_id: "reviewer",
        system_prompt: "Review deeply before approving.",
        tools: ["read_file"],
      }),
    );
  }, 25000);

  it("validates and deletes role configs from the roles page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));

    const reviewerRoleRow = (await screen.findByText("Reviewer")).closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);

    expect(await screen.findByDisplayValue("Review carefully.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(validateRoleConfigMock).toHaveBeenCalledTimes(1));
    expect(validateRoleConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ role_id: "reviewer" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    await waitFor(() => expect(deleteRoleConfigMock).toHaveBeenCalledWith("reviewer"));
  }, 30000);

  it("validates and creates a role config from the roles page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));

    fireEvent.click(await screen.findByRole("button", { name: "New role" }));
    for (const label of ["Role name", "Description", "Version", "System prompt"]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    for (const message of [
      "Role name is required.",
      "Role description is required.",
      "Role version is required.",
      "System prompt is required.",
    ]) {
      expect(await screen.findByText(message)).toBeVisible();
    }
    expect(saveRoleConfigMock).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText("Role ID"), {
      target: { value: "analyst" },
    });
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Analyst" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Analyzes the current plan." },
    });
    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "1.0.0" },
    });
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "Analyze the plan and report risks." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveRoleConfigMock).toHaveBeenCalledWith(
        "analyst",
        expect.objectContaining({
          description: "Analyzes the current plan.",
          name: "Analyst",
          role_id: "analyst",
          system_prompt: "Analyze the plan and report risks.",
        }),
      ),
    );
  }, 30000);

  it("uses the structured default model profile when creating a role", async () => {
    getModelProfilesMock.mockResolvedValue({
      economy: {
        is_default: false,
        model: "gpt-5-mini",
        provider: "openai",
      },
      production: {
        is_default: true,
        model: "gpt-5",
        provider: "openai",
      },
      vision: {
        model: "gpt-5-vision",
        provider: "openai",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    fireEvent.click(await screen.findByRole("button", { name: "New role" }));

    expectSelectedSelectOption("Model profile", "production");
    fillNewRoleRequiredFields("analyst");
    listRoleConfigsMock.mockResolvedValue([
      {
        description: "Analyzes the current plan.",
        mode: "primary",
        model_profile: "production",
        name: "Analyst",
        role_id: "analyst",
        source: "app",
        version: "1.0.0",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveRoleConfigMock).toHaveBeenCalledWith(
        "analyst",
        expect.objectContaining({ model_profile: "production" }),
      ),
    );
    await waitFor(() =>
      expectSelectedSelectOption("Model profile", "production"),
    );
  }, 30000);

  it("requires an explicit model profile when the registry has no default", async () => {
    getModelProfilesMock.mockResolvedValue({
      economy: {
        model: "gpt-5-mini",
        provider: "openai",
      },
      production: {
        model: "gpt-5",
        provider: "openai",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    fireEvent.click(await screen.findByRole("button", { name: "New role" }));
    fillNewRoleRequiredFields("analyst");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Model profile is required.")).toBeVisible();
    expect(saveRoleConfigMock).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Model profile" }));
    await clickAntdSelectOption("production");
    listRoleConfigsMock.mockResolvedValue([
      {
        description: "Analyzes the current plan.",
        mode: "primary",
        model_profile: "production",
        name: "Analyst",
        role_id: "analyst",
        source: "app",
        version: "1.0.0",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveRoleConfigMock).toHaveBeenCalledWith(
        "analyst",
        expect.objectContaining({ model_profile: "production" }),
      ),
    );
    await waitFor(() =>
      expectSelectedSelectOption("Model profile", "production"),
    );
  }, 30000);

  it("sets default and deletes model profiles through real model config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));

    const visionRow = (await screen.findByText("vision")).closest(".at-model-profile-row");
    expect(visionRow).not.toBeNull();
    fireEvent.click(within(visionRow as HTMLElement).getByRole("button", { name: "Default" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "vision",
      expect.objectContaining({
        base_url: "",
        connect_timeout_seconds: 15,
        context_window: null,
        fallback_policy_id: null,
        fallback_priority: 0,
        is_default: true,
        model: "gpt-5-vision",
        provider: "openai",
        temperature: 0.7,
        top_p: 1,
      }),
    );
    expect(reloadModelConfigMock).toHaveBeenCalledTimes(1);

    const sttRow = screen.getByText("stt").closest(".at-model-profile-row");
    expect(sttRow).not.toBeNull();
    fireEvent.click(within(sttRow as HTMLElement).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText('Delete model profile "stt"?')).toBeInTheDocument();
    fireEvent.click(lastDeleteButton());

    await waitFor(() => expect(deleteModelProfileMock).toHaveBeenCalledWith("stt"));
    await waitFor(() => expect(reloadModelConfigMock).toHaveBeenCalledTimes(2));
  }, 25000);

  it("shows a successful model test result in its profile row", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));

    const visionRow = (await screen.findByText("vision")).closest(
      ".at-model-profile-row",
    );
    expect(visionRow).not.toBeNull();
    fireEvent.click(
      within(visionRow as HTMLElement).getByRole("button", { name: "Test" }),
    );

    expect(
      await within(visionRow as HTMLElement).findByRole("status"),
    ).toHaveTextContent("Connection ok in 42ms.");
    expect(
      within(visionRow as HTMLElement).getByRole("status"),
    ).toHaveClass("is-success");
  });

  it("keeps testing and failure feedback isolated by model profile", async () => {
    let resolveVisionProbe: (
      result: Awaited<ReturnType<typeof probeModelConnection>>,
    ) => void = () => undefined;
    probeModelConnectionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVisionProbe = resolve;
        }),
    );
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    const visionRow = (await screen.findByText("vision")).closest(
      ".at-model-profile-row",
    );
    const sttRow = screen.getByText("stt").closest(".at-model-profile-row");
    expect(visionRow).not.toBeNull();
    expect(sttRow).not.toBeNull();

    fireEvent.click(
      within(visionRow as HTMLElement).getByRole("button", { name: "Test" }),
    );
    expect(
      await within(visionRow as HTMLElement).findByText("Testing connection…"),
    ).toBeVisible();
    expect(within(sttRow as HTMLElement).queryByRole("status")).toBeNull();

    resolveVisionProbe({
      checked_at: "2026-06-26T00:00:00Z",
      diagnostics: {
        auth_valid: true,
        endpoint_reachable: true,
        rate_limited: false,
      },
      latency_ms: 42,
      model: "gpt-5-vision",
      ok: true,
      provider: "openai",
    });
    expect(
      await within(visionRow as HTMLElement).findByText("Connection ok in 42ms."),
    ).toBeVisible();

    probeModelConnectionMock.mockResolvedValueOnce({
      checked_at: "2026-06-26T00:00:01Z",
      diagnostics: {
        auth_valid: false,
        endpoint_reachable: true,
        rate_limited: false,
      },
      error_message: "token=do-not-render rejected",
      latency_ms: 12,
      model: "whisper-1",
      ok: false,
      provider: "openai",
    });
    fireEvent.click(
      within(sttRow as HTMLElement).getByRole("button", { name: "Test" }),
    );
    const failureStatus = await within(sttRow as HTMLElement).findByRole("status");
    expect(failureStatus).toHaveTextContent("Connection failed: token=[redacted] rejected");
    expect(failureStatus).not.toHaveTextContent("do-not-render");
    expect(failureStatus).toHaveClass("is-error");
    expect(within(visionRow as HTMLElement).getByRole("status")).toHaveTextContent(
      "Connection ok in 42ms.",
    );
  });

  it("edits and tests an existing model profile from the detail page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));

    const visionRow = (await screen.findByText("vision")).closest(".at-model-profile-row");
    expect(visionRow).not.toBeNull();
    fireEvent.click(within(visionRow as HTMLElement).getByRole("button", { name: /vision/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(probeModelConnectionMock).toHaveBeenCalledWith({
        profile_name: "vision",
        timeout_ms: 15000,
      }),
    );
    expect(await screen.findByText("Connection ok in 42ms.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Profile ID"), {
      target: { value: "vision-renamed" },
    });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-5.1-vision" },
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://models.example/v1" },
    });
    fireEvent.change(screen.getByLabelText("Context window"), {
      target: { value: "128000" },
    });
    fireEvent.change(screen.getByLabelText("Max tokens"), {
      target: { value: "4096" },
    });
    fireEvent.change(screen.getByLabelText("Fallback policy"), {
      target: { value: "same_provider_then_other_provider" },
    });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "SSL verify" }));
    await clickAntdSelectOption("Verify");
    saveModelProfileMock.mockImplementationOnce((nextProfileId, payload) => {
      getModelProfilesMock.mockResolvedValue({
        default: {
          is_default: true,
          model: "gpt-5-mini",
          provider: "openai",
        },
        [nextProfileId]: {
          base_url: payload.base_url,
          connect_timeout_seconds: payload.connect_timeout_seconds,
          context_window: payload.context_window,
          is_default: payload.is_default,
          max_tokens: payload.max_tokens,
          model: payload.model,
          provider: payload.provider,
          temperature: payload.temperature,
          top_p: payload.top_p,
        },
      });
      return Promise.resolve({ status: "ok" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "vision-renamed",
      expect.objectContaining({
        base_url: "https://models.example/v1",
        context_window: 128000,
        max_tokens: 4096,
        model: "gpt-5.1-vision",
        provider: "openai",
        source_name: "vision",
        ssl_verify: true,
      }),
    );
    await waitFor(() => expect(reloadModelConfigMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Profile ID")).toHaveValue("vision-renamed");
  }, 25000);

  it("edits model profile API key and image capability through accessible form controls", async () => {
    getModelProfilesMock.mockResolvedValue({
      default: {
        is_default: true,
        model: "gpt-5-mini",
        provider: "openai",
      },
      vision: {
        base_url: "https://models.example/v1",
        capabilities: {
          input: { image: false, text: true },
          output: { text: true },
        },
        has_api_key: true,
        input_modalities: ["text"],
        model: "gpt-5-vision",
        provider: "openai_compatible",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));

    const visionRow = (await screen.findByText("vision")).closest(".at-model-profile-row");
    expect(visionRow).not.toBeNull();
    fireEvent.click(within(visionRow as HTMLElement).getByRole("button", { name: /vision/ }));

    expect(await screen.findByLabelText("Profile ID")).toHaveValue("vision");
    expectSelectedSelectOption("Provider", "openai_compatible");
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5-vision");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://models.example/v1");
    expect(screen.getByLabelText("Temperature")).toBeVisible();
    expect(screen.getByLabelText("Top P")).toBeVisible();
    expect(screen.getByLabelText("Context window")).toBeVisible();
    expect(screen.getByLabelText("Max tokens")).toBeVisible();
    expect(screen.getByLabelText("Timeout seconds")).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveAttribute(
      "placeholder",
      "Leave blank to keep the saved API key.",
    );
    expect(screen.getByText("Text only")).toBeVisible();

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "replacement-secret-key" },
    });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Image Input" }));
    await clickAntdSelectOption("Supports image input");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "vision",
      expect.objectContaining({
        api_key: "replacement-secret-key",
        capabilities: {
          input: { image: true, text: true },
          output: { text: true },
        },
      }),
    );
  }, 25000);

  it("creates a MaaS model profile with profile-owned credentials", async () => {
    getModelCatalogMock.mockResolvedValueOnce({
      ok: true,
      providers: [
        {
          api: null,
          default_base_url:
            "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/",
          id: "maas",
          models: [
            {
              id: "maas-chat",
              name: "MaaS Chat",
            },
          ],
          name: "MaaS",
          runtime_provider: "maas",
        },
      ],
      source_url: "https://models.dev/api.json",
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    fireEvent.click(await screen.findByRole("button", { name: "New profile" }));

    expect(await screen.findByText("MaaS · maas")).toBeVisible();
    const maasModelSelect = screen.getByRole("combobox", { name: "Search models" });
    fireEvent.mouseDown(maasModelSelect);
    await clickFirstOpenSelectOption();
    fireEvent.change(await screen.findByLabelText("Profile ID"), {
      target: { value: "maas-profile" },
    });
    expect(screen.getByLabelText("Profile ID")).toHaveValue("maas-profile");
    expectSelectedSelectOption("Provider", "maas");
    expect(screen.getByLabelText("Model")).toHaveValue("maas-chat");
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/",
    );

    const maasUsername = await screen.findByLabelText("MaaS username");
    expect(screen.queryByLabelText("API Key")).toBeNull();
    fireEvent.change(maasUsername, {
      target: { value: "relay-user" },
    });
    fireEvent.change(screen.getByLabelText("MaaS password"), {
      target: { value: "relay-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "maas-profile",
      expect.objectContaining({
        base_url: "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/",
        maas_auth: {
          auth_source: "profile",
          password: "relay-password",
          username: "relay-user",
        },
        model: "maas-chat",
        provider: "maas",
      }),
    );
    expect(saveModelProfileMock.mock.calls[0]?.[1]).not.toHaveProperty("api_key");
  }, 25000);

  it("preserves saved CodeAgent password credentials when the password is left blank", async () => {
    getModelProfilesMock.mockResolvedValue({
      "codeagent-profile": {
        base_url: "https://codeagentcli.rnd.huawei.com/codeAgentPro",
        codeagent_auth: {
          auth_method: "password",
          auth_source: "profile",
          has_password: true,
          username: "saved-codeagent-user",
        },
        connect_timeout_seconds: 15,
        is_default: false,
        model: "codeagent-chat",
        provider: "codeagent",
      },
      default: {
        is_default: true,
        model: "gpt-5-mini",
        provider: "openai",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));

    const codeAgentRow = (await screen.findByText("codeagent-profile")).closest(
      ".at-model-profile-row",
    );
    expect(codeAgentRow).not.toBeNull();
    fireEvent.click(
      within(codeAgentRow as HTMLElement).getByRole("button", {
        name: /codeagent-profile/,
      }),
    );

    expect(await screen.findByText("Username and password")).toBeVisible();
    expect(screen.getByLabelText("CodeAgent username")).toHaveValue("saved-codeagent-user");
    expect(screen.getByLabelText("CodeAgent password")).toHaveAttribute(
      "placeholder",
      "Leave blank to keep the saved password.",
    );
    expect(screen.queryByLabelText("API Key")).toBeNull();

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "codeagent-chat-next" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "codeagent-profile",
      expect.objectContaining({
        codeagent_auth: {
          auth_method: "password",
          auth_source: "profile",
          has_password: true,
          username: "saved-codeagent-user",
        },
        model: "codeagent-chat-next",
        provider: "codeagent",
      }),
    );
    expect(saveModelProfileMock.mock.calls[0]?.[1]).not.toHaveProperty("api_key");
  }, 25000);

  it("replaces saved CodeAgent password credentials when a new password is entered", async () => {
    getModelProfilesMock.mockResolvedValue({
      "codeagent-profile": {
        base_url: "https://codeagentcli.rnd.huawei.com/codeAgentPro",
        codeagent_auth: {
          auth_method: "password",
          auth_source: "profile",
          has_password: true,
          username: "saved-codeagent-user",
        },
        connect_timeout_seconds: 15,
        is_default: false,
        model: "codeagent-chat",
        provider: "codeagent",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    const codeAgentRow = (await screen.findByText("codeagent-profile")).closest(
      ".at-model-profile-row",
    );
    fireEvent.click(
      within(codeAgentRow as HTMLElement).getByRole("button", {
        name: /codeagent-profile/,
      }),
    );
    fireEvent.change(await screen.findByLabelText("CodeAgent password"), {
      target: { value: "replacement-codeagent-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "codeagent-profile",
      expect.objectContaining({
        codeagent_auth: {
          auth_method: "password",
          auth_source: "profile",
          password: "replacement-codeagent-password",
          username: "saved-codeagent-user",
        },
      }),
    );
  }, 25000);

  it("creates a model profile from the catalog without changing settings navigation", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    const visionProfile = await screen.findByText("vision");
    await waitFor(() => expect(visionProfile).toBeVisible());
    expect(getModelCatalogMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    await waitFor(() => expect(getModelCatalogMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Model catalog")).toBeVisible();
    expect(await screen.findByText("OpenAI · openai_compatible")).toBeVisible();

    const catalogModelSelect = screen.getByRole("combobox", { name: "Search models" });
    fireEvent.mouseDown(catalogModelSelect);
    await clickFirstOpenSelectOption();
    expectSelectedSelectOption("Provider", "openai_compatible");
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5-catalog");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://openai.example/v1");
    expect(screen.getByLabelText("Context window")).toHaveValue(128000);
    expect(screen.getByLabelText("Max tokens")).toHaveValue(8192);

    fireEvent.change(screen.getByLabelText("Profile ID"), {
      target: { value: "catalog-profile" },
    });
    saveModelProfileMock.mockImplementationOnce((nextProfileId, payload) => {
      getModelProfilesMock.mockResolvedValue({
        "catalog-profile": {
          base_url: payload.base_url,
          catalog_model_name: payload.catalog_model_name,
          catalog_provider_id: payload.catalog_provider_id,
          catalog_provider_name: payload.catalog_provider_name,
          capabilities: payload.capabilities,
          context_window: payload.context_window,
          is_default: payload.is_default,
          max_tokens: payload.max_tokens,
          model: payload.model,
          provider: payload.provider,
          temperature: payload.temperature,
          top_p: payload.top_p,
        },
        default: {
          is_default: true,
          model: "gpt-5-mini",
          provider: "openai",
        },
      });
      return Promise.resolve({ status: "ok" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveModelProfileMock).toHaveBeenCalledTimes(1));
    expect(saveModelProfileMock).toHaveBeenCalledWith(
      "catalog-profile",
      expect.objectContaining({
        base_url: "https://openai.example/v1",
        catalog_model_name: "GPT-5 Catalog",
        catalog_provider_id: "openai",
        catalog_provider_name: "OpenAI",
        capabilities: {
          input: { image: true, text: true },
          output: { text: true },
        },
        context_window: 128000,
        is_default: false,
        max_tokens: 8192,
        model: "gpt-5-catalog",
        provider: "openai_compatible",
        temperature: 0.7,
        top_p: 1,
      }),
    );
    expect(saveModelProfileMock.mock.calls[0]?.[1]).not.toHaveProperty("source_name");
    await waitFor(() => expect(reloadModelConfigMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Profile ID")).toHaveValue("catalog-profile");
    expect(within(sections).getByRole("button", { name: "Plugins" })).toBeVisible();
  }, 35000);

  it("manages MCP servers through the MCP config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");

    expect(await screen.findByText("filesystem")).toBeVisible();
    expect(screen.getByText("github")).toBeVisible();
    expect(listMcpServersMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("read_file")).toBeVisible();
    expect(getMcpServerToolsMock).toHaveBeenCalledWith("filesystem");

    fireEvent.click(screen.getByRole("button", { name: "Test filesystem" }));
    await waitFor(() =>
      expect(testMcpServerConnectionMock).toHaveBeenCalledWith("filesystem"),
    );
    expect(await screen.findByText("filesystem connected with 2 tools.")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh tools for filesystem" }),
    );
    await waitFor(() =>
      expect(refreshMcpServerToolsMock).toHaveBeenCalledWith("filesystem"),
    );
    expect(await screen.findByText("list_files")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Disable filesystem" }));
    await waitFor(() =>
      expect(setMcpServerEnabledMock).toHaveBeenCalledWith("filesystem", false),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));
    fireEvent.change(await screen.findByLabelText("Server name"), {
      target: { value: "demo" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "npx" },
    });
    fireEvent.change(screen.getByLabelText("Arguments"), {
      target: { value: "@modelcontextprotocol/server-filesystem\nC:/repo" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "MCP_LOG=debug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(addMcpServerMock).toHaveBeenCalledWith({
        config: {
          args: ["@modelcontextprotocol/server-filesystem", "C:/repo"],
          command: "npx",
          env: { MCP_LOG: "debug" },
          transport: "stdio",
        },
        name: "demo",
        overwrite: false,
      }),
    );
  }, 60000);

  it("imports MCP server JSON into the React MCP editor and preserves hidden fields", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");
    fireEvent.click(await screen.findByRole("button", { name: "Add Server" }));

    fireEvent.change(await screen.findByLabelText("Import JSON"), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            docs: {
              args: ["@modelcontextprotocol/server-filesystem"],
              command: "npx",
              cwd: "C:/repo",
              env: { DEBUG: "pw:mcp" },
              read_timeout: 300,
              type: "local",
            },
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Server name")).toHaveValue("docs"),
    );
    expect(screen.getByLabelText("Command")).toHaveValue("npx");
    expect(screen.getByLabelText("Arguments")).toHaveValue(
      "@modelcontextprotocol/server-filesystem",
    );
    expect(screen.getByLabelText("Environment")).toHaveValue("DEBUG=pw:mcp");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(addMcpServerMock).toHaveBeenCalledWith({
        config: {
          args: ["@modelcontextprotocol/server-filesystem"],
          command: "npx",
          cwd: "C:/repo",
          env: { DEBUG: "pw:mcp" },
          read_timeout: 300,
          transport: "stdio",
        },
        name: "docs",
        overwrite: false,
      }),
    );
  }, 35000);

  it("imports remote MCP JSON aliases and array commands", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");
    fireEvent.click(await screen.findByRole("button", { name: "Add Server" }));

    fireEvent.change(await screen.findByLabelText("Import JSON"), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            docs: {
              headers: { Authorization: "Bearer token" },
              type: "streamablehttp",
              url: "https://example.com/mcp",
            },
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Server name")).toHaveValue("docs"),
    );
    expect(screen.getByText("streamable HTTP")).toBeVisible();
    expect(screen.getByLabelText("URL")).toHaveValue("https://example.com/mcp");
    expect(screen.getByLabelText("Headers")).toHaveValue("Authorization=Bearer token");

    fireEvent.change(screen.getByLabelText("Import JSON"), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            localDocs: {
              command: ["npx", "-y", "docs-mcp"],
              type: "local",
            },
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Server name")).toHaveValue("localDocs"),
    );
    expect(screen.getByLabelText("Command")).toHaveValue("npx");
    expect(screen.getByLabelText("Arguments")).toHaveValue("-y\ndocs-mcp");
  }, 60000);

  it("keeps hidden MCP config fields when editing an existing server", async () => {
    getMcpServerMock.mockResolvedValueOnce({
      config: {
        args: ["server-filesystem"],
        command: "npx",
        cwd: "C:/workspace",
        env: { TOKEN: "old" },
        read_timeout: 300,
        transport: "stdio",
      },
      server: {
        discovery_status: "ready",
        enabled: true,
        name: "filesystem",
        source: "app",
        tool_count: 2,
        transport: "stdio",
      },
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");
    fireEvent.click(await screen.findByRole("button", { name: "Edit filesystem" }));

    await waitFor(() => expect(getMcpServerMock).toHaveBeenCalledWith("filesystem"));
    fireEvent.change(await screen.findByLabelText("Command"), {
      target: { value: "uvx" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "TOKEN=new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateMcpServerMock).toHaveBeenCalledWith("filesystem", {
        config: {
          args: ["server-filesystem"],
          command: "uvx",
          cwd: "C:/workspace",
          env: { TOKEN: "new" },
          read_timeout: 300,
          transport: "stdio",
        },
      }),
    );
  }, 35000);

  it("renders MCP tool loading state before delayed discovery resolves", async () => {
    let resolveTools: (value: McpServerToolsSummary) => void = () => undefined;
    getMcpServerToolsMock.mockReturnValue(
      new Promise<McpServerToolsSummary>((resolve) => {
        resolveTools = resolve;
      }),
    );
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");

    expect(await screen.findByText("Loading tools.")).toBeVisible();
    expect(screen.queryByText("delayed_tool")).toBeNull();

    resolveTools({
      enabled: true,
      server: "filesystem",
      source: "app",
      status: "ready",
      tools: [{ description: "Delayed tool", name: "delayed_tool" }],
      transport: "stdio",
    });

    expect(await screen.findByText("delayed_tool")).toBeVisible();
    expect(screen.getByText("Delayed tool")).toBeVisible();
  }, 35000);

  it("confirms MCP server deletion and hides delete for non-app servers", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("MCP");

    expect(await screen.findByText("filesystem")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete github" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete filesystem" }));
    expect((await screen.findAllByText("Delete MCP server")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMcpServerMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete filesystem" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(deleteMcpServerMock).toHaveBeenCalledWith("filesystem"),
    );
  }, 35000);

  it("manages remote workspace SSH profiles through the workspace config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Remote workspace" }));

    await waitFor(() => expect(screen.getAllByText("devbox").length).toBeGreaterThan(0));
    expect(screen.getAllByText("dev.example.com · yex · 22").length).toBeGreaterThan(0);
    expect(listSshProfilesMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(probeSshProfileConnectionMock).toHaveBeenCalledWith({
        ssh_profile_id: "devbox",
        timeout_ms: 15000,
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("devbox connected in 44ms.").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Host"), {
      target: { value: "edited.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "deploy" },
    });
    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: 2222 },
    });
    fireEvent.focus(screen.getByLabelText("Password"));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "changed-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveSshProfileMock).toHaveBeenCalledWith("devbox", {
        connect_timeout_seconds: 15,
        host: "edited.example.com",
        password: "changed-secret",
        port: 2222,
        private_key: null,
        private_key_name: null,
        remote_shell: "/bin/bash",
        username: "deploy",
      }),
    );
  }, 30000);

  it("manages app environment variables through the environment config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(
      within(sections).getByRole("button", { name: "Environment variables" }),
    );

    expect(await screen.findByText("OPENAI_API_KEY")).toBeVisible();
    expect(screen.getByText("************")).toBeVisible();
    expect(screen.queryByText("saved-openai-key")).not.toBeInTheDocument();
    expect(screen.getByText("App")).toBeVisible();
    expect(screen.getAllByText("System").length).toBeGreaterThan(1);
    expect(screen.queryByText("http://hidden-proxy.example:8080")).toBeNull();
    expect(screen.queryByText("SSL_VERIFY")).toBeNull();
    expect(screen.queryByText("PATH")).toBeNull();
    expect(getEnvironmentVariablesMock).toHaveBeenCalledTimes(1);

    const systemToggle = screen.getByRole("button", { name: "System1" });
    expect(systemToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(systemToggle);
    expect(await screen.findByText("PATH")).toBeVisible();
    expect(screen.getByText("C:/Windows/System32")).toBeVisible();
    expect(systemToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "New variable" }));
    const keyInput = await screen.findByLabelText("Key");
    fireEvent.change(keyInput, {
      target: { value: "ANTHROPIC_API_KEY" },
    });
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "saved-anthropic-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveEnvironmentVariableMock).toHaveBeenCalledWith(
        "app",
        "ANTHROPIC_API_KEY",
        {
          preserve_existing: false,
          source_key: null,
          value: "saved-anthropic-key",
        },
      ),
    );

    await waitFor(() => expect(screen.queryByLabelText("Value")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Key")).toHaveValue("OPENAI_API_KEY"),
    );
    const secretEditor = (await screen.findByText("Edit environment variable")).closest(
      '[role="dialog"]',
    );
    expect(secretEditor).not.toBeNull();
    expect(within(secretEditor as HTMLElement).getByLabelText("Value")).toHaveValue("");
    expect(
      within(secretEditor as HTMLElement).getByText("Leave blank to keep the saved secret."),
    ).toBeInTheDocument();
    fireEvent.click(within(secretEditor as HTMLElement).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveEnvironmentVariableMock).toHaveBeenCalledWith(
        "app",
        "OPENAI_API_KEY",
        {
          preserve_existing: true,
          source_key: "OPENAI_API_KEY",
          value: "",
        },
      ),
    );

    await waitFor(() => expect(screen.queryByLabelText("Value")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const replacementEditor = (await screen.findByText("Edit environment variable")).closest(
      '[role="dialog"]',
    );
    expect(replacementEditor).not.toBeNull();
    await waitFor(() =>
      expect(within(replacementEditor as HTMLElement).getByLabelText("Key")).toHaveValue("OPENAI_API_KEY"),
    );
    fireEvent.change(within(replacementEditor as HTMLElement).getByLabelText("Value"), {
      target: { value: "edited-openai-key" },
    });
    fireEvent.click(within(replacementEditor as HTMLElement).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveEnvironmentVariableMock).toHaveBeenCalledWith(
        "app",
        "OPENAI_API_KEY",
        {
          preserve_existing: false,
          source_key: "OPENAI_API_KEY",
          value: "edited-openai-key",
        },
      ),
    );

    await waitFor(() => expect(screen.queryByLabelText("Value")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        screen.getAllByText('Delete environment variable "OPENAI_API_KEY"?').length,
      ).toBeGreaterThan(0),
    );
    fireEvent.click(lastDeleteButton());

    await waitFor(() =>
      expect(deleteEnvironmentVariableMock).toHaveBeenCalledWith(
        "app",
        "OPENAI_API_KEY",
      ),
    );
  }, 60000);

  it("saves the general shell policy through the real general config client", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "General" }));

    const shellSafety = await screen.findByRole("switch", {
      name: "Shell safety policy",
    });
    fireEvent.click(shellSafety);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveGeneralConfigMock).toHaveBeenCalledWith({
        shell_safety_policy_enabled: false,
      }),
    );
  });

  it("hydrates general settings only after their form is mounted", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      renderDrawer();

      await waitFor(() => expect(getGeneralConfigMock).toHaveBeenCalled());
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      expect(
        consoleError.mock.calls.some((call) =>
          call.some((value) =>
            String(value).includes("Instance created by `useForm` is not connected"),
          ),
        ),
      ).toBe(false);

      const sections = screen.getByRole("navigation", {
        name: "Settings sections",
      });
      fireEvent.click(within(sections).getByRole("button", { name: "General" }));

      expect(
        await screen.findByRole("switch", { name: "Shell safety policy" }),
      ).toBeChecked();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps V1 general items discoverable without flattening their pages", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "General" }));

    expect(await screen.findByText("Shell policy")).toBeVisible();
    expect(screen.getByText("Related settings")).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Shell safety policy" }),
    ).toBeVisible();

    const related = screen.getByRole("region", { name: "Related settings" });
    expect(
      within(related).getByRole("button", {
        name: /Appearance/,
      }),
    ).toBeVisible();
    expect(within(related).getByRole("button", { name: /Speech/ })).toBeVisible();
    expect(
      within(related).getByRole("button", { name: /Notifications/ }),
    ).toBeVisible();
    expect(screen.queryByText("Tool approval requests")).toBeNull();

    fireEvent.click(within(related).getByRole("button", { name: /Speech/ }));
    expect(
      await screen.findByRole("heading", { name: "Speech" }),
    ).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "General" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Related settings" })).getByRole(
        "button",
        { name: /Notifications/ },
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Notifications" }),
    ).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "General" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Related settings" })).getByRole(
        "button",
        { name: /Appearance/ },
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Appearance" }),
    ).toBeVisible();
  });

  it("updates appearance state and applies V1 appearance overrides locally", async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole("button", { name: "Dark" }));
    expect(useUiStore.getState().themeMode).toBe("dark");

    expect(screen.getByText("Dark theme")).toBeVisible();
    expect(screen.getByText("Copy theme")).toBeVisible();
    expect(screen.getByText("Use pointer cursor")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Accent color value"), {
      target: { value: "#336699" },
    });
    fireEvent.change(screen.getByLabelText("UI font"), {
      target: { value: '"Inter", sans-serif' },
    });
    fireEvent.change(screen.getByLabelText("UI font size"), {
      target: { value: "16" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Translucent sidebar" }));
    fireEvent.change(screen.getByLabelText("Contrast"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText("Line height"), {
      target: { value: "160" },
    });
    fireEvent.change(screen.getByLabelText("Message spacing"), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByText("On"));
    fireEvent.click(screen.getByText("+/-"));
    fireEvent.click(
      screen.getByRole("switch", { name: "Show diagnostic details" }),
    );

    expect(document.documentElement.style.getPropertyValue("--at-primary")).toBe(
      "#336699",
    );
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#336699");
    expect(document.documentElement.style.getPropertyValue("--at-font-ui")).toBe(
      '"Inter", sans-serif',
    );
    expect(document.documentElement.style.getPropertyValue("--at-ui-font-size")).toBe(
      "16px",
    );
    expect(document.documentElement.style.getPropertyValue("--at-contrast-filter")).toBe(
      "contrast(1.15)",
    );
    expect(document.documentElement.style.getPropertyValue("--at-message-line-height")).toBe(
      "1.60",
    );
    expect(document.documentElement.style.getPropertyValue("--msg-line-height")).toBe(
      "1.60",
    );
    expect(document.documentElement.style.getPropertyValue("--at-message-gap")).toBe(
      "0.95rem",
    );
    expect(document.documentElement.style.getPropertyValue("--msg-gap")).toBe(
      "0.95rem",
    );
    expect(document.documentElement.dataset.translucentSidebar).toBe("true");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.diffMarker).toBe("sign");
    expect(document.documentElement.dataset.diagnosticsVisible).toBe("true");
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}")).toMatchObject({
      accent: "#336699",
      contrast: 60,
      diffMarker: "sign",
      lineHeight: 160,
      messageDensity: 95,
      motion: "reduce",
      showDiagnostics: true,
      translucentSidebar: true,
      uiFont: '"Inter", sans-serif',
      uiFontSize: 16,
    });
  });

  it("resets local appearance overrides from the appearance page", async () => {
    renderDrawer();

    fireEvent.change(await screen.findByLabelText("Accent color value"), {
      target: { value: "#336699" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Translucent sidebar" }));

    expect(window.localStorage.getItem(appearanceStorageKey)).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue("--at-primary")).toBe(
      "#336699",
    );
    expect(document.documentElement.dataset.translucentSidebar).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Reset appearance" }));

    expect(window.localStorage.getItem(appearanceStorageKey)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--at-primary")).toBe("");
    expect(document.documentElement.dataset.translucentSidebar).toBeUndefined();
  });

  it("closes the appearance preset menu after choosing a preset", async () => {
    renderDrawer();

    const presetButton = await screen.findByRole("button", {
      name: "Theme preset",
    });
    fireEvent.click(presetButton);

    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.click(screen.getByRole("option", { name: "Vercel" }));

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(presetButton).toHaveTextContent("Vercel");
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}")).toMatchObject({
      accent: "#0070F3",
      background: "#FFFFFF",
      foreground: "#111111",
      themePreset: "vercel",
    });
  });

  it("saves web settings while preserving the saved Exa key when the key field is blank", async () => {
    await openWebSettings();

    const apiKey = screen.getByLabelText("Exa API key");
    expect(apiKey).toHaveAttribute("autocomplete", "new-password");
    expect(apiKey).toHaveAttribute("placeholder", "************");
    expect(
      screen.getByRole("link", { name: /https:\/\/exa\.ai/ }),
    ).toHaveAttribute("rel", "noreferrer");

    const searxngUrl = screen.getByLabelText("SearXNG instance URL");
    fireEvent.change(searxngUrl, {
      target: { value: "https://search.changed.example/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveWebConfigMock).toHaveBeenCalledWith({
        exa_api_key: null,
        fallback_provider: "searxng",
        preserve_exa_api_key: true,
        provider: "exa",
        searxng_instance_url: "https://search.changed.example/",
      }),
    );
  });

  it("ignores Web settings API key autofill until the field is edited", async () => {
    await openWebSettings();

    const apiKey = screen.getByLabelText("Exa API key") as HTMLInputElement;
    apiKey.value = "browser_password";

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveWebConfigMock).toHaveBeenCalledWith({
        exa_api_key: null,
        fallback_provider: "searxng",
        preserve_exa_api_key: true,
        provider: "exa",
        searxng_instance_url: "https://search.example/",
      }),
    );
  });

  it("replaces and clears saved Web settings API keys explicitly", async () => {
    await openWebSettings();

    const apiKey = screen.getByLabelText("Exa API key");
    fireEvent.change(apiKey, { target: { value: "replacement-exa-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveWebConfigMock).toHaveBeenCalledWith({
        exa_api_key: "replacement-exa-key",
        fallback_provider: "searxng",
        preserve_exa_api_key: false,
        provider: "exa",
        searxng_instance_url: "https://search.example/",
      }),
    );

    saveWebConfigMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear API key" }));
    expect(
      screen.getByText(
        "The API key is optional and raises provider rate limits when configured.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveWebConfigMock).toHaveBeenCalledWith({
        exa_api_key: null,
        fallback_provider: "searxng",
        preserve_exa_api_key: false,
        provider: "exa",
        searxng_instance_url: "https://search.example/",
      }),
    );
  });

  it("keeps Web settings SearXNG fields behind the fallback selector", async () => {
    await openWebSettings();

    const fallbackProvider = screen.getByLabelText("Fallback provider");
    expect(screen.getByLabelText("SearXNG instance URL")).toHaveValue(
      "https://search.example/",
    );
    expect(screen.getByLabelText("Built-in instances")).toHaveTextContent(
      "https://search.example/",
    );

    fireEvent.mouseDown(fallbackProvider);
    await clickAntdSelectOption("Disabled");
    await waitFor(() => expect(screen.queryByLabelText("SearXNG instance URL")).toBeNull());
    expect(screen.queryByLabelText("Built-in instances")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Fallback provider" }));
    await clickAntdSelectOption("SearXNG");
    expect(await screen.findByLabelText("SearXNG instance URL")).toHaveValue(
      "https://search.example/",
    );
  });

  it("creates and edits commands through the command settings clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    await openSettingsSection("Commands");

    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit /opsx:propose" }),
    );
    fireEvent.change(await screen.findByLabelText("Description"), {
      target: { value: "Updated proposal command" },
    });
    fireEvent.change(screen.getByLabelText("Allowed modes"), {
      target: { value: "normal, orchestration" },
    });
    fireEvent.change(screen.getByLabelText("Prompt template"), {
      target: { value: "Updated {{args}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateCommandMock).toHaveBeenCalledWith({
        aliases: ["opsx/propose"],
        allowed_modes: ["normal", "orchestration"],
        argument_hint: "<change-id>",
        description: "Updated proposal command",
        name: "opsx:propose",
        source_path: "C:/repo/.claude/commands/opsx/propose.md",
        template: "Updated {{args}}",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add Command" }));
    fireEvent.change(await screen.findByLabelText("Command name"), {
      target: { value: "opsx:review" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("File path")).toHaveValue("opsx/review.md"),
    );
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Created command" },
    });
    fireEvent.change(screen.getByLabelText("Prompt template"), {
      target: { value: "Review {{args}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createCommandMock).toHaveBeenCalledWith({
        aliases: [],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Created command",
        name: "opsx:review",
        relative_path: "opsx/review.md",
        scope: "project",
        source: "relay_teams",
        template: "Review {{args}}",
        workspace_id: "workspace-1",
      }),
    );
  }, 40000);

  it("saves and probes proxy settings while preserving the saved password", async () => {
    await openProxySettings();

    const httpProxy = screen.getByLabelText("HTTP Proxy");
    fireEvent.change(httpProxy, {
      target: { value: "http://edited.example:8080" },
    });
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "************",
    );
    expect(screen.getByText("Skip verification")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test URL" }));

    await waitFor(() =>
      expect(probeWebConnectivityMock).toHaveBeenCalledWith({
        preserve_saved_proxy_password: true,
        proxy_override: expect.objectContaining({
          http_proxy: "http://edited.example:8080",
          proxy_password: null,
          proxy_username: "alice",
          ssl_verify: false,
        }),
        timeout_ms: 5000,
        url: "https://example.com",
      }),
    );
    expect(await screen.findByText("HEAD 200 in 38ms")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          all_proxy: "socks5://proxy.example:1080",
          http_proxy: "http://edited.example:8080",
          https_proxy: "http://proxy.example:8443",
          no_proxy: "localhost,127.0.0.1",
          preserve_password: true,
          proxy_password: null,
          proxy_username: "alice",
          ssl_verify: false,
        }),
      ),
    );
    await waitFor(() => expect(reloadProxyConfigMock).toHaveBeenCalledTimes(1));
  }, 25000);

  it("defaults missing Proxy SSL verification to inherit", async () => {
    getProxyConfigMock.mockResolvedValueOnce({
      all_proxy: null,
      http_proxy: null,
      https_proxy: null,
      no_proxy: null,
      has_password: false,
      proxy_username: null,
      ssl_verify: null,
    });
    await openProxySettings();

    expect(screen.getByLabelText("Default SSL verification")).toHaveValue("");
  });

  it("ignores Proxy password autofill events until the password field is focused", async () => {
    await openProxySettings();

    const password = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "browser_password" } });
    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test URL" }));

    await waitFor(() =>
      expect(probeWebConnectivityMock).toHaveBeenCalledWith({
        preserve_saved_proxy_password: true,
        proxy_override: expect.objectContaining({
          proxy_password: null,
        }),
        timeout_ms: 5000,
        url: "https://example.com",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          preserve_password: true,
          proxy_password: null,
        }),
      ),
    );
  });

  it("replaces and clears saved Proxy passwords explicitly", async () => {
    await openProxySettings();

    const password = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.focus(password);
    fireEvent.change(password, { target: { value: "replacement-secret" } });
    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test URL" }));

    await waitFor(() =>
      expect(probeWebConnectivityMock).toHaveBeenCalledWith({
        preserve_saved_proxy_password: false,
        proxy_override: expect.objectContaining({
          proxy_password: "replacement-secret",
        }),
        timeout_ms: 5000,
        url: "https://example.com",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          preserve_password: false,
          proxy_password: "replacement-secret",
        }),
      ),
    );

    probeWebConnectivityMock.mockClear();
    saveProxyConfigMock.mockClear();
    reloadProxyConfigMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "Optional proxy password",
    );
    fireEvent.click(screen.getByRole("button", { name: "Test URL" }));
    await waitFor(() =>
      expect(probeWebConnectivityMock).toHaveBeenCalledWith({
        preserve_saved_proxy_password: false,
        proxy_override: expect.objectContaining({
          proxy_password: null,
        }),
        timeout_ms: 5000,
        url: "https://example.com",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          preserve_password: false,
          proxy_password: null,
        }),
      ),
    );
    await waitFor(() => expect(reloadProxyConfigMock).toHaveBeenCalledTimes(1));
  });

});

function renderDrawer(initialSystemPage: SystemSettingsPage | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  activeQueryClients.add(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        button={{ autoInsertSpace: false }}
        theme={{ token: { motion: false } }}
      >
        <AntApp>
          {renderWithStrictModeBoundary(
            <SettingsDrawer
              initialSystemPage={initialSystemPage}
              onClose={vi.fn()}
              open
            />,
          )}
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
  // Unit tests exercise settings behavior, while browser coverage owns the
  // entrance animation. Keep rc-motion's prepare frame from making otherwise
  // mounted controls appear invisible for several jsdom polling intervals.
  const modal = document.querySelector<HTMLElement>(".at-settings-modal");
  if (modal !== null) {
    modal.style.opacity = "1";
  }
}

async function clickFirstOpenSelectOption() {
  let option: HTMLElement | null = null;
  await waitFor(() => {
    option = document.querySelector(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
    );
    expect(option).not.toBeNull();
  });
  if (option === null) {
    throw new Error("Expected an open Select option.");
  }
  fireEvent.click(option);
}

async function openSettingsSection(label: string) {
  const sections = await screen.findByRole("navigation", {
    name: "Settings sections",
  });
  fireEvent.click(within(sections).getByRole("button", { name: label }));
}

async function openWebSettings() {
  renderDrawer();
  const sections = await screen.findByRole("navigation", {
    name: "Settings sections",
  });
  fireEvent.click(within(sections).getByRole("button", { name: "Web" }));
  await screen.findByLabelText("Exa API key");
}

async function openProxySettings() {
  renderDrawer();
  const sections = await screen.findByRole("navigation", {
    name: "Settings sections",
  });
  fireEvent.click(within(sections).getByRole("button", { name: "Proxy" }));
  await screen.findByLabelText("HTTP Proxy");
}

async function openOrchestrationSettings() {
  renderDrawer();
  const sections = await screen.findByRole("navigation", {
    name: "Settings sections",
  });
  fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));
  await screen.findByText("2 roles · Main plus reviewer");
}

async function clickAntdSelectOption(label: string) {
  const matchingNodes = await screen.findAllByText(label);
  const optionContent = matchingNodes.find((node) =>
    node.classList.contains("ant-select-item-option-content"),
  );
  if (!(optionContent instanceof HTMLElement)) {
    throw new Error(`Select option not found: ${label}`);
  }
  fireEvent.click(optionContent);
}

function fillNewRoleRequiredFields(roleId: string) {
  fireEvent.change(screen.getByLabelText("Role ID"), {
    target: { value: roleId },
  });
  fireEvent.change(screen.getByLabelText("Role name"), {
    target: { value: "Analyst" },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Analyzes the current plan." },
  });
  fireEvent.change(screen.getByLabelText("Version"), {
    target: { value: "1.0.0" },
  });
  fireEvent.change(screen.getByLabelText("System prompt"), {
    target: { value: "Analyze the plan and report risks." },
  });
}

function expectSelectedSelectOption(label: string, value: string) {
  const select = screen.getByRole("combobox", { name: label }).closest(".ant-select");
  if (!(select instanceof HTMLElement)) {
    throw new Error(`Select not found: ${label}`);
  }
  expect(within(select).getByText(value)).toBeVisible();
}

function lastBackButton(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Back" });
  return buttons[buttons.length - 1] as HTMLElement;
}

async function waitForPluginListSettled() {
  await waitFor(() => expect(screen.getByText("workspace-tools")).toBeVisible());
}

function lastDeleteButton(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Delete" });
  return buttons[buttons.length - 1] as HTMLElement;
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
