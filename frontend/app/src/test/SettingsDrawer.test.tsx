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
  createCommand,
  deleteAgentRuntime,
  deleteEnvironmentVariable,
  deleteMcpServer,
  deleteSshProfile,
  getAgentRuntime,
  getAgentRuntimeRegistry,
  getAgentRuntimes,
  getAgentRuntimeTestJob,
  getClawHubConfig,
  getCommandCatalog,
  getConfigStatus,
  getEnvironmentVariables,
  getGeneralConfig,
  getHookRuntimeView,
  getHooksConfig,
  getMcpServer,
  getMcpServerTools,
  getModelProfiles,
  getNotificationConfig,
  getOrchestrationConfig,
  getPluginsRuntime,
  getProxyConfig,
  getRoleConfig,
  getRoleConfigOptions,
  getWebConfig,
  installAgentRuntimeFromRegistry,
  listRoleConfigs,
  listSshProfiles,
  listMcpServers,
  probeSshProfileConnection,
  probeClawHubConnectivity,
  probeWebConnectivity,
  revealSshProfilePassword,
  refreshAgentRuntimeRegistry,
  refreshMcpServerTools,
  reloadMcpConfig,
  reloadProxyConfig,
  saveEnvironmentVariable,
  saveAgentRuntime,
  saveClawHubConfig,
  saveGeneralConfig,
  saveNotificationConfig,
  saveOrchestrationConfig,
  saveProxyConfig,
  saveRoleConfig,
  saveSshProfile,
  saveWebConfig,
  setMcpServerEnabled,
  startAgentRuntimeTestJob,
  testMcpServerConnection,
  updateCommand,
  updateMcpServer,
} from "../api/client";
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
  createCommand: vi.fn(),
  deleteAgentRuntime: vi.fn(),
  deleteEnvironmentVariable: vi.fn(),
  deleteMcpServer: vi.fn(),
  deleteSshProfile: vi.fn(),
  getAgentRuntime: vi.fn(),
  getAgentRuntimeRegistry: vi.fn(),
  getAgentRuntimes: vi.fn(),
  getAgentRuntimeTestJob: vi.fn(),
  getClawHubConfig: vi.fn(),
  getCommandCatalog: vi.fn(),
  getConfigStatus: vi.fn(),
  getEnvironmentVariables: vi.fn(),
  getGeneralConfig: vi.fn(),
  getHookRuntimeView: vi.fn(),
  getHooksConfig: vi.fn(),
  getMcpServer: vi.fn(),
  getMcpServerTools: vi.fn(),
  getModelProfiles: vi.fn(),
  getNotificationConfig: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getPluginsRuntime: vi.fn(),
  getProxyConfig: vi.fn(),
  getRoleConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  installAgentRuntimeFromRegistry: vi.fn(),
  listRoleConfigs: vi.fn(),
  listMcpServers: vi.fn(),
  listSshProfiles: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  probeClawHubConnectivity: vi.fn(),
  probeWebConnectivity: vi.fn(),
  revealSshProfilePassword: vi.fn(),
  refreshAgentRuntimeRegistry: vi.fn(),
  refreshMcpServerTools: vi.fn(),
  reloadMcpConfig: vi.fn(),
  reloadProxyConfig: vi.fn(),
  saveEnvironmentVariable: vi.fn(),
  saveAgentRuntime: vi.fn(),
  saveClawHubConfig: vi.fn(),
  saveGeneralConfig: vi.fn(),
  saveNotificationConfig: vi.fn(),
  saveOrchestrationConfig: vi.fn(),
  saveProxyConfig: vi.fn(),
  saveRoleConfig: vi.fn(),
  saveSshProfile: vi.fn(),
  saveWebConfig: vi.fn(),
  setMcpServerEnabled: vi.fn(),
  startAgentRuntimeTestJob: vi.fn(),
  testMcpServerConnection: vi.fn(),
  updateCommand: vi.fn(),
  updateMcpServer: vi.fn(),
}));

vi.mock("../api/speech", () => ({
  fetchSpeechConfig: vi.fn(),
  saveSpeechConfig: vi.fn(),
}));

vi.setConfig({ testTimeout: 15000 });

const addMcpServerMock = vi.mocked(addMcpServer);
const createCommandMock = vi.mocked(createCommand);
const deleteAgentRuntimeMock = vi.mocked(deleteAgentRuntime);
const deleteEnvironmentVariableMock = vi.mocked(deleteEnvironmentVariable);
const deleteMcpServerMock = vi.mocked(deleteMcpServer);
const deleteSshProfileMock = vi.mocked(deleteSshProfile);
const getAgentRuntimeMock = vi.mocked(getAgentRuntime);
const getAgentRuntimeRegistryMock = vi.mocked(getAgentRuntimeRegistry);
const getAgentRuntimesMock = vi.mocked(getAgentRuntimes);
const getAgentRuntimeTestJobMock = vi.mocked(getAgentRuntimeTestJob);
const getClawHubConfigMock = vi.mocked(getClawHubConfig);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const getConfigStatusMock = vi.mocked(getConfigStatus);
const getEnvironmentVariablesMock = vi.mocked(getEnvironmentVariables);
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getHookRuntimeViewMock = vi.mocked(getHookRuntimeView);
const getHooksConfigMock = vi.mocked(getHooksConfig);
const getMcpServerMock = vi.mocked(getMcpServer);
const getMcpServerToolsMock = vi.mocked(getMcpServerTools);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getPluginsRuntimeMock = vi.mocked(getPluginsRuntime);
const getProxyConfigMock = vi.mocked(getProxyConfig);
const getRoleConfigMock = vi.mocked(getRoleConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const installAgentRuntimeFromRegistryMock = vi.mocked(installAgentRuntimeFromRegistry);
const listRoleConfigsMock = vi.mocked(listRoleConfigs);
const listMcpServersMock = vi.mocked(listMcpServers);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const probeClawHubConnectivityMock = vi.mocked(probeClawHubConnectivity);
const probeWebConnectivityMock = vi.mocked(probeWebConnectivity);
const revealSshProfilePasswordMock = vi.mocked(revealSshProfilePassword);
const refreshAgentRuntimeRegistryMock = vi.mocked(refreshAgentRuntimeRegistry);
const refreshMcpServerToolsMock = vi.mocked(refreshMcpServerTools);
const reloadMcpConfigMock = vi.mocked(reloadMcpConfig);
const reloadProxyConfigMock = vi.mocked(reloadProxyConfig);
const saveEnvironmentVariableMock = vi.mocked(saveEnvironmentVariable);
const saveAgentRuntimeMock = vi.mocked(saveAgentRuntime);
const saveClawHubConfigMock = vi.mocked(saveClawHubConfig);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);
const saveNotificationConfigMock = vi.mocked(saveNotificationConfig);
const saveOrchestrationConfigMock = vi.mocked(saveOrchestrationConfig);
const saveProxyConfigMock = vi.mocked(saveProxyConfig);
const saveRoleConfigMock = vi.mocked(saveRoleConfig);
const saveSshProfileMock = vi.mocked(saveSshProfile);
const saveWebConfigMock = vi.mocked(saveWebConfig);
const setMcpServerEnabledMock = vi.mocked(setMcpServerEnabled);
const startAgentRuntimeTestJobMock = vi.mocked(startAgentRuntimeTestJob);
const testMcpServerConnectionMock = vi.mocked(testMcpServerConnection);
const updateCommandMock = vi.mocked(updateCommand);
const updateMcpServerMock = vi.mocked(updateMcpServer);
const fetchSpeechConfigMock = vi.mocked(fetchSpeechConfig);
const saveSpeechConfigMock = vi.mocked(saveSpeechConfig);

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
  getOrchestrationConfigMock.mockResolvedValue({
    default_orchestration_preset_id: "default",
    presets: [
      {
        description: "Main plus reviewer",
        name: "Default",
        orchestration_prompt: "Coordinate the work.",
        policy: {
          auto_plan_long_tasks: true,
          max_orchestration_cycles: 8,
          planner_role_id: "planner",
        },
        preset_id: "default",
        role_ids: ["main", "reviewer"],
      },
    ],
  });
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
      mode: "primary",
      model_profile: "default",
      name: "Main Agent",
      role_id: "main",
      source: "app",
      version: "1.0.0",
    },
    {
      bound_agent_id: "codex-local",
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
  getPluginsRuntimeMock.mockResolvedValue({
    diagnostics: [],
    plugins: [
      {
        command_sources: [{ name: "workspace-command" }],
        description: "Workspace utilities",
        enabled: true,
        name: "workspace-tools",
        skill_sources: [{ name: "workspace-skill" }],
        valid: true,
      },
    ],
  });
  getHooksConfigMock.mockResolvedValue({
    hooks: {
      SessionStart: [
        {
          command: "python hooks/start.py",
          name: "Session startup setup",
        },
      ],
    },
  });
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
  window.localStorage.clear();
  applyAppearanceSettings(defaultAppearanceSettings);
  vi.clearAllMocks();
});

describe("SettingsDrawer", () => {
  it("renders a real settings center backed by existing config endpoints", async () => {
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
      "Models",
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

    fireEvent.click(within(sections).getByRole("button", { name: "Models" }));
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
    expect(await screen.findByText("Role ID")).toBeVisible();
    expect(getRoleConfigMock).toHaveBeenCalledWith("reviewer");
    expect(screen.getByText("reviewer")).toBeVisible();
    expect(screen.getByDisplayValue("Review carefully.")).toBeVisible();
    expect(screen.getByDisplayValue("subagent")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getAllByText("Main Agent").length).toBeGreaterThan(0));

    fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));
    expect(await screen.findByText("Default")).toBeVisible();
    expect(screen.getByText("2 roles · Main plus reviewer")).toBeVisible();
    const defaultPresetRow = screen.getByText("Default").closest("button");
    expect(defaultPresetRow).not.toBeNull();
    fireEvent.click(defaultPresetRow as HTMLElement);
    expect(await screen.findByText("Preset ID")).toBeVisible();
    const presetNameInput = screen.getByDisplayValue("Default");
    const presetDescriptionInput = screen.getByDisplayValue("Main plus reviewer");
    const presetRolesInput = screen.getByDisplayValue("main, reviewer");
    const presetPromptInput = screen.getByDisplayValue("Coordinate the work.");
    expect(presetRolesInput).toBeVisible();
    fireEvent.change(presetNameInput, { target: { value: "Edited Default" } });
    fireEvent.change(presetDescriptionInput, { target: { value: "Edited reviewer flow" } });
    fireEvent.change(presetRolesInput, {
      target: { value: "main, reviewer, qa, reviewer" },
    });
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
          name: "Edited Default",
          orchestration_prompt: "Coordinate edited work.",
          policy: {
            auto_plan_long_tasks: true,
            max_orchestration_cycles: 8,
            planner_role_id: "planner",
          },
          preset_id: "default",
          role_ids: ["main", "reviewer", "qa"],
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
    expect(await screen.findByText("MCP")).toBeVisible();
    expect(screen.getByText("Global and workspace command files.")).toBeVisible();
    expect(getConfigStatusMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Commands").closest("button") as HTMLElement);
    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    expect(screen.getByText("Global commands")).toBeVisible();
    expect(getCommandCatalogMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(screen.getByText("Plugins").closest("button") as HTMLElement);
    expect(await screen.findByText("workspace-tools")).toBeVisible();
    expect(screen.getByText("2 components")).toBeVisible();
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
          enabled: true,
        },
        role_id: "reviewer",
        skills: ["review"],
        source_role_id: "reviewer",
        system_prompt: "Review deeply before approving.",
        tools: ["read_file"],
      }),
    );
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
    expect(screen.queryByText("http://hidden-proxy.example:8080")).toBeNull();
    expect(getEnvironmentVariablesMock).toHaveBeenCalledTimes(1);

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
    fireEvent.change(screen.getByLabelText("Line height"), {
      target: { value: "160" },
    });
    fireEvent.change(screen.getByLabelText("Message spacing"), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Translucent sidebar" }));
    fireEvent.change(screen.getByLabelText("Contrast"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByText("On"));
    fireEvent.click(screen.getByText("+/-"));

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
    expect(document.documentElement.style.getPropertyValue("--at-message-line-height")).toBe(
      "1.60",
    );
    expect(document.documentElement.style.getPropertyValue("--at-message-gap")).toBe(
      "0.95rem",
    );
    expect(document.documentElement.style.getPropertyValue("--at-contrast-filter")).toBe(
      "contrast(1.15)",
    );
    expect(document.documentElement.dataset.translucentSidebar).toBe("true");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.diffMarker).toBe("sign");
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}")).toMatchObject({
      accent: "#336699",
      contrast: 60,
      diffMarker: "sign",
      lineHeight: 160,
      messageDensity: 95,
      motion: "reduce",
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

  it("saves web settings while preserving the saved Exa key when the key field is blank", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Web" }));

    const searxngUrl = await screen.findByLabelText("SearXNG instance URL");
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
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Proxy" }));

    const httpProxy = await screen.findByLabelText("HTTP Proxy");
    fireEvent.change(httpProxy, {
      target: { value: "http://edited.example:8080" },
    });
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "placeholder",
      "************",
    );
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

function lastBackButton(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Back" });
  return buttons[buttons.length - 1] as HTMLElement;
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
