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
  getClawHubConfig,
  getCommandCatalog,
  getConfigStatus,
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
  getModelProfiles,
  getNotificationConfig,
  getOrchestrationConfig,
  getPluginsConfig,
  getPluginsRuntime,
  getProxyConfig,
  getRoleConfig,
  getRoleConfigOptions,
  getWebConfig,
  installAgentRuntimeFromRegistry,
  listRoleConfigs,
  listSshProfiles,
  listMcpServers,
  probeModelConnection,
  probeSshProfileConnection,
  probeClawHubConnectivity,
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
  saveClawHubConfig,
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
import type { OrchestrationConfig } from "../api/contracts";
import { fetchSpeechConfig, saveSpeechConfig } from "../api/speech";
import { SettingsDrawer } from "../features/shell/SettingsDrawer";
import {
  appearanceStorageKey,
  applyAppearanceSettings,
  defaultAppearanceSettings,
} from "../runtime/appearance";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  addMcpServer: vi.fn(),
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
  getClawHubConfig: vi.fn(),
  getCommandCatalog: vi.fn(),
  getConfigStatus: vi.fn(),
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
  getModelProfiles: vi.fn(),
  getNotificationConfig: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getPluginsConfig: vi.fn(),
  getPluginsRuntime: vi.fn(),
  getProxyConfig: vi.fn(),
  getRoleConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  installAgentRuntimeFromRegistry: vi.fn(),
  listRoleConfigs: vi.fn(),
  listMcpServers: vi.fn(),
  listSshProfiles: vi.fn(),
  listWorkspaces: vi.fn(),
  probeModelConnection: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  probeClawHubConnectivity: vi.fn(),
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
  saveClawHubConfig: vi.fn(),
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

vi.setConfig({ testTimeout: 15000 });

const addMcpServerMock = vi.mocked(addMcpServer);
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
const getClawHubConfigMock = vi.mocked(getClawHubConfig);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const getConfigStatusMock = vi.mocked(getConfigStatus);
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
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getPluginsConfigMock = vi.mocked(getPluginsConfig);
const getPluginsRuntimeMock = vi.mocked(getPluginsRuntime);
const getProxyConfigMock = vi.mocked(getProxyConfig);
const getRoleConfigMock = vi.mocked(getRoleConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const installAgentRuntimeFromRegistryMock = vi.mocked(installAgentRuntimeFromRegistry);
const listRoleConfigsMock = vi.mocked(listRoleConfigs);
const listMcpServersMock = vi.mocked(listMcpServers);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const probeModelConnectionMock = vi.mocked(probeModelConnection);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const probeClawHubConnectivityMock = vi.mocked(probeClawHubConnectivity);
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
const saveClawHubConfigMock = vi.mocked(saveClawHubConfig);
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
  getGeneralConfigMock.mockResolvedValue({ shell_safety_policy_enabled: true });
  getConfigStatusMock.mockResolvedValue({
    skills: {
      loaded: true,
      skills: [
        {
          description: "Create skills.",
          name: "skill-creator",
          ref: "skill-creator",
          source: "builtin",
        },
      ],
    },
  });
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
  getClawHubConfigMock.mockResolvedValue({ token: "saved-clawhub-token" });
  saveClawHubConfigMock.mockResolvedValue({ status: "ok" });
  probeClawHubConnectivityMock.mockResolvedValue({
    checked_at: "2026-06-24T00:00:00Z",
    clawhub_version: "1.2.3",
    diagnostics: {
      binary_available: true,
      endpoint_fallback_used: false,
      installation_attempted: false,
      installed_during_probe: false,
      token_configured: true,
    },
    latency_ms: 31,
    ok: true,
    retryable: false,
  });
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
    exa_api_key: "saved-exa-key",
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
    proxy_password: "saved-secret",
    proxy_username: "alice",
    ssl_verify: false,
  });
  getEnvironmentVariablesMock.mockResolvedValue({
    app: [
      {
        key: "OPENAI_API_KEY",
        scope: "app",
        value: "saved-openai-key",
        value_kind: "string",
      },
      {
        key: "HTTP_PROXY",
        scope: "app",
        value: "http://hidden-proxy.example:8080",
        value_kind: "string",
      },
      {
        key: "SSL_VERIFY",
        scope: "app",
        value: "false",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "PATH",
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
        name: "workspace-tools",
        scope: "user",
        skill_sources: [{ name: "workspace-skill" }],
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
    scope: "app",
    value: "saved-anthropic-key",
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
  delete window.agentTeamsDesktop;
  window.localStorage.clear();
  applyAppearanceSettings(defaultAppearanceSettings);
  vi.clearAllMocks();
});

describe("SettingsDrawer", () => {
  it("renders a real settings center backed by existing config endpoints", async () => {
    installDesktopApi("9.8.7");
    renderDrawer();

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeVisible();
    const sections = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(sections).getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "Appearance",
      "General",
      "Speech",
      "Notifications",
      "Model",
      "Roles",
      "Orchestration",
      "Web",
      "ClawHub",
      "Proxy",
      "Remote workspace",
      "Environment variables",
      "System",
    ]);
    expect(within(sections).queryByRole("button", { name: "MCP" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Plugins" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Commands" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Hooks" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Agent Runtime" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "GitHub" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Gateway" })).toBeNull();

    await waitFor(() => expect(getRoleConfigOptionsMock).toHaveBeenCalledTimes(1));
    expect(getModelProfilesMock).toHaveBeenCalledTimes(1);
    expect(getOrchestrationConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Speech" }));
    expect(await screen.findByText("STT profile")).toBeVisible();
    expect(screen.getByDisplayValue("domain terms")).toBeVisible();
    expect(fetchSpeechConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Tool approval requested")).toBeVisible();
    expect(screen.getByText("Run completed")).toBeVisible();
    expect(getNotificationConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    await waitFor(() => expect(screen.getAllByText("default").length).toBeGreaterThan(0));
    expect(screen.getByText("gpt-5-mini · in: image, text / out: text")).toBeVisible();
    const defaultProfileRow = screen
      .getByText("gpt-5-mini · in: image, text / out: text")
      .closest("button");
    expect(defaultProfileRow).not.toBeNull();
    fireEvent.click(defaultProfileRow as HTMLElement);
    expect(await screen.findByText("Realtime speech")).toBeVisible();
    expect(screen.getByText("gpt-5-mini")).toBeVisible();
    expect(screen.getByText("image, text")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("vision")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    await waitFor(() => expect(listRoleConfigsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText("Coordinator").length).toBeGreaterThan(0));
    expect(screen.getByText("Reviewer")).toBeVisible();
    const reviewerRoleRow = screen.getByText("Reviewer").closest("button");
    expect(reviewerRoleRow).not.toBeNull();
    fireEvent.click(reviewerRoleRow as HTMLElement);
    expect(getRoleConfigMock).toHaveBeenCalledWith("reviewer");
    expect(await screen.findByLabelText("Role ID")).toBeVisible();
    expect(screen.getByDisplayValue("reviewer")).toBeVisible();
    expect(await screen.findByDisplayValue("Review carefully.")).toBeVisible();
    expect(screen.getByDisplayValue("subagent")).toBeVisible();
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
    expect(screen.getByRole("checkbox", { name: "main" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "reviewer" })).toBeChecked();
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
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "ClawHub" }));
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(screen.getByText("clawhub.ai")).toBeVisible();
    expect(getClawHubConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    expect(await screen.findByText("Desktop version")).toBeVisible();
    expect(screen.getByText("9.8.7")).toBeVisible();
    expect(await screen.findByText("MCP")).toBeVisible();
    expect(screen.getByText("Global and workspace command files.")).toBeVisible();
    expect(screen.getByText("GitHub CLI token, webhook callback, and tunnel.")).toBeVisible();
    expect(screen.getByText("Feishu gateway trigger accounts and session targets.")).toBeVisible();
    expect(getConfigStatusMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Commands").closest("button") as HTMLElement);
    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    expect(screen.getByText("Global commands")).toBeVisible();
    expect(getCommandCatalogMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(screen.getByText("Plugins").closest("button") as HTMLElement);
    expect(await screen.findByText("workspace-tools")).toBeVisible();
    expect(screen.getByText("2 components")).toBeVisible();
    expect(getPluginsConfigMock).toHaveBeenCalledTimes(1);
    expect(getPluginsRuntimeMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(screen.getByText("Hooks").closest("button") as HTMLElement);
    expect(await screen.findByText("Session startup setup")).toBeVisible();
    expect(screen.getByText("SessionStart · python hooks/start.py")).toBeVisible();
    expect(getHooksConfigMock).toHaveBeenCalledTimes(1);
    expect(getHookRuntimeViewMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(screen.getByText("Agent Runtime").closest("button") as HTMLElement);
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    expect(screen.getByText("acp · registry")).toBeVisible();
    expect(getAgentRuntimesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Codex CLI").closest("button") as HTMLElement);
    expect(await screen.findByText("Agent ID")).toBeVisible();
    expect(screen.getByDisplayValue("Codex CLI")).toBeVisible();
    expect(screen.getByDisplayValue("openai/codex")).toBeVisible();
    expect(screen.getByDisplayValue("OPENAI_API_KEY")).toBeVisible();
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
  }, 70000);

  it("keeps saved ClawHub tokens intact for unchanged probe and save actions", async () => {
    await openClawHubSettings();

    const tokenInput = screen.getByLabelText("Token") as HTMLInputElement;
    expect(tokenInput).toHaveAttribute("autocomplete", "new-password");
    expect(tokenInput).toHaveAttribute("placeholder", "************");
    expect(
      screen.getByRole("link", { name: /https:\/\/clawhub\.ai\/settings/ }),
    ).toHaveAttribute("rel", "noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() =>
      expect(probeClawHubConnectivityMock).toHaveBeenCalledWith({
        token: "saved-clawhub-token",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveClawHubConfigMock).toHaveBeenCalledWith({
        token: "saved-clawhub-token",
      }),
    );
  });

  it("ignores ClawHub browser autofill until the token field is edited", async () => {
    await openClawHubSettings();

    const tokenInput = screen.getByLabelText("Token") as HTMLInputElement;
    tokenInput.value = "browser_password";

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() =>
      expect(probeClawHubConnectivityMock).toHaveBeenCalledWith({
        token: "saved-clawhub-token",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveClawHubConfigMock).toHaveBeenCalledWith({
        token: "saved-clawhub-token",
      }),
    );
  });

  it("clears saved ClawHub tokens and reports auto-install probe results", async () => {
    probeClawHubConnectivityMock.mockResolvedValueOnce({
      checked_at: "2026-06-24T00:00:00Z",
      clawhub_version: "clawhub 0.9.0",
      diagnostics: {
        binary_available: true,
        endpoint_fallback_used: false,
        installation_attempted: true,
        installed_during_probe: true,
        token_configured: true,
      },
      latency_ms: 4200,
      ok: true,
      retryable: false,
    });
    await openClawHubSettings();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText(
        "Connected with clawhub 0.9.0 in 4,200 ms. Installed automatically.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear token" }));
    expect(screen.getByText("Not saved")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText("Enter a ClawHub token before testing."),
    ).toBeVisible();
    expect(probeClawHubConnectivityMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveClawHubConfigMock).toHaveBeenCalledWith({
        token: null,
      }),
    );
  });

  it("links migrated settings labels to real controls across secondary pages", async () => {
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
    expect(screen.getByLabelText("Image Input")).toBeVisible();
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
    expect(screen.getByRole("switch", { name: "Memory enabled" })).toBeVisible();
  }, 30000);

  it("manages plugins from the System secondary page", async () => {
    renderDrawer();

    fireEvent.click((await screen.findAllByRole("button", { name: "System" }))[0] as HTMLElement);
    fireEvent.click((await screen.findByText("Plugins")).closest("button") as HTMLElement);

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

  it("validates and saves hooks from the System secondary page", async () => {
    renderDrawer();

    fireEvent.click((await screen.findAllByRole("button", { name: "System" }))[0] as HTMLElement);
    fireEvent.click((await screen.findByText("Hooks")).closest("button") as HTMLElement);

    const editor = await screen.findByLabelText("Hooks JSON");
    expect(editor).toHaveValue(
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    );
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
                  type: "command",
                },
              ],
              matcher: "*",
            },
          ],
        },
      }),
    );

    const nextHooks = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                command: "python hooks/prompt.py",
                type: "command",
              },
            ],
            matcher: "*",
          },
        ],
      },
    };
    fireEvent.change(editor, {
      target: { value: JSON.stringify(nextHooks, null, 2) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveHooksConfigMock).toHaveBeenCalledWith(nextHooks));
  });

  it("manages GitHub settings from the System secondary page", async () => {
    getGitHubWebhookTunnelStatusMock.mockResolvedValue({
      provider: "localhost.run",
      public_url: "https://relay.localhost.run",
      status: "active",
    });
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(sections).queryByRole("button", { name: "GitHub" })).toBeNull();

    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    const githubRow = (await screen.findByText("GitHub")).closest("button");
    expect(githubRow).not.toBeNull();
    fireEvent.click(githubRow as HTMLElement);

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
  }, 45000);

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
  }, 45000);

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

  it("keeps orchestration presets visible when role option loading fails", async () => {
    getRoleConfigOptionsMock.mockRejectedValueOnce(new Error("System roles unavailable."));
    await openOrchestrationSettings();

    expect(await screen.findByText("2 roles · Main plus reviewer")).toBeVisible();
    expect(screen.getByText("Shipping")).toBeVisible();
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

  it("creates and deletes agent runtimes from the System secondary page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    fireEvent.click(
      (await screen.findByText("Agent Runtime")).closest("button") as HTMLElement,
    );

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
  }, 45000);

  it("refreshes the ACP registry from the Agent Runtime secondary view", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    fireEvent.click(
      (await screen.findByText("Agent Runtime")).closest("button") as HTMLElement,
    );
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "ACP registry" }));

    expect(await screen.findByText("Codex Runtime")).toBeVisible();
    expect(getAgentRuntimeRegistryMock).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(refreshAgentRuntimeRegistryMock).toHaveBeenCalledTimes(1));
  }, 25000);

  it("manages trigger gateway accounts from the System secondary page", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(sections).queryByRole("button", { name: "Gateway" })).toBeNull();

    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    const triggersRow = (await screen.findByText("Gateway")).closest("button");
    expect(triggersRow).not.toBeNull();
    fireEvent.click(triggersRow as HTMLElement);

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

  it("validates, deletes, and creates role configs from the roles page", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "New role" }));
    fireEvent.change(await screen.findByLabelText("Role ID"), {
      target: { value: "analyst" },
    });
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Analyst" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Analyzes the current plan." },
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
    fireEvent.change(screen.getByLabelText("SSL verify"), {
      target: { value: "true" },
    });
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
    expect(screen.getByLabelText("Provider")).toHaveValue("openai_compatible");
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
    expect(screen.getByLabelText("Image Input")).toHaveValue("unsupported");

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "replacement-secret-key" },
    });
    fireEvent.change(screen.getByLabelText("Image Input"), {
      target: { value: "supported" },
    });
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

  it("creates a model profile from the catalog without changing settings navigation", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    expect(await screen.findByText("vision")).toBeVisible();
    expect(getModelCatalogMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    await waitFor(() => expect(getModelCatalogMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Model catalog")).toBeVisible();
    expect(await screen.findByText("OpenAI")).toBeVisible();

    fireEvent.click((await screen.findByText("GPT-5 Catalog")).closest("button") as HTMLElement);
    expect(screen.getByLabelText("Provider")).toHaveValue("openai_compatible");
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
    expect(within(sections).queryByRole("button", { name: "Plugins" })).toBeNull();
  }, 25000);

  it("manages MCP servers through the MCP config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    fireEvent.click((await screen.findByText("MCP")).closest("button") as HTMLElement);

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
  }, 18000);

  it("manages app environment variables through the environment config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(
      within(sections).getByRole("button", { name: "Environment variables" }),
    );

    expect(await screen.findByText("OPENAI_API_KEY")).toBeVisible();
    expect(screen.getByText("saved-openai-key")).toBeVisible();
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
    expect(screen.getByLabelText("Value")).toHaveValue("saved-openai-key");
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "edited-openai-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveEnvironmentVariableMock).toHaveBeenCalledWith(
        "app",
        "OPENAI_API_KEY",
        {
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
  }, 20000);

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
      screen.getByRole("switch", { name: "Show diagnostic information" }),
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
        exa_api_key: "saved-exa-key",
        fallback_provider: "searxng",
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
        exa_api_key: "saved-exa-key",
        fallback_provider: "searxng",
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

    fireEvent.change(fallbackProvider, { target: { value: "disabled" } });
    expect(screen.queryByLabelText("SearXNG instance URL")).toBeNull();
    expect(screen.queryByLabelText("Built-in instances")).toBeNull();

    fireEvent.change(fallbackProvider, { target: { value: "searxng" } });
    expect(screen.getByLabelText("SearXNG instance URL")).toHaveValue(
      "https://search.example/",
    );
  });

  it("creates and edits commands through the command settings clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    fireEvent.click((await screen.findByText("Commands")).closest("button") as HTMLElement);

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
  }, 25000);

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
    expect(screen.getByLabelText("Default SSL verification")).toHaveValue("false");
    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test URL" }));

    await waitFor(() =>
      expect(probeWebConnectivityMock).toHaveBeenCalledWith({
        proxy_override: expect.objectContaining({
          http_proxy: "http://edited.example:8080",
          proxy_password: "saved-secret",
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
          proxy_password: "saved-secret",
          proxy_username: "alice",
          ssl_verify: false,
        }),
      ),
    );
    await waitFor(() => expect(reloadProxyConfigMock).toHaveBeenCalledTimes(1));
  }, 10000);

  it("defaults missing Proxy SSL verification to skip verification", async () => {
    getProxyConfigMock.mockResolvedValueOnce({
      all_proxy: null,
      http_proxy: null,
      https_proxy: null,
      no_proxy: null,
      proxy_password: null,
      proxy_username: null,
      ssl_verify: null,
    });
    await openProxySettings();

    expect(screen.getByLabelText("Default SSL verification")).toHaveValue("false");
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
        proxy_override: expect.objectContaining({
          proxy_password: "saved-secret",
        }),
        timeout_ms: 5000,
        url: "https://example.com",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy_password: "saved-secret",
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
          proxy_password: null,
        }),
      ),
    );
    await waitFor(() => expect(reloadProxyConfigMock).toHaveBeenCalledTimes(1));
  });

});

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>{renderWithStrictModeBoundary(<SettingsDrawer onClose={vi.fn()} open />)}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

async function openClawHubSettings() {
  renderDrawer();
  const sections = await screen.findByRole("navigation", {
    name: "Settings sections",
  });
  fireEvent.click(within(sections).getByRole("button", { name: "ClawHub" }));
  await screen.findByText("Credentials");
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
  await screen.findByText("Default preset");
}

function installDesktopApi(version: string) {
  const desktopApi: NonNullable<Window["agentTeamsDesktop"]> = {
    copyText: vi.fn().mockResolvedValue(undefined),
    getBackendStatus: vi.fn().mockResolvedValue({
      baseUrl: "http://127.0.0.1:8000",
      message: "Backend ready.",
      state: "ready",
    }),
    getVersion: vi.fn().mockResolvedValue(version),
    onBackendStatus: vi.fn(() => () => undefined),
    openExternal: vi.fn().mockResolvedValue(undefined),
    retryStartup: vi.fn().mockResolvedValue(undefined),
  };
  Object.defineProperty(window, "agentTeamsDesktop", {
    configurable: true,
    value: desktopApi,
  });
}

function lastBackButton(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Back" });
  return buttons[buttons.length - 1] as HTMLElement;
}

function lastDeleteButton(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Delete" });
  return buttons[buttons.length - 1] as HTMLElement;
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
