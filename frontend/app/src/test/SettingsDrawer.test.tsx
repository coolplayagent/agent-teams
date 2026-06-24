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
  deleteEnvironmentVariable,
  deleteMcpServer,
  deleteSshProfile,
  getAgentRuntimes,
  getCommandCatalog,
  getEnvironmentVariables,
  getGeneralConfig,
  getHookRuntimeView,
  getHooksConfig,
  getMcpServer,
  getMcpServerTools,
  getModelProfiles,
  getOrchestrationConfig,
  getPluginsRuntime,
  getProxyConfig,
  getRoleConfigOptions,
  getWebConfig,
  listSshProfiles,
  listMcpServers,
  probeSshProfileConnection,
  probeWebConnectivity,
  revealSshProfilePassword,
  refreshMcpServerTools,
  reloadMcpConfig,
  reloadProxyConfig,
  saveEnvironmentVariable,
  saveGeneralConfig,
  saveProxyConfig,
  saveSshProfile,
  saveWebConfig,
  setMcpServerEnabled,
  testMcpServerConnection,
  updateCommand,
  updateMcpServer,
} from "../api/client";
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
  deleteEnvironmentVariable: vi.fn(),
  deleteMcpServer: vi.fn(),
  deleteSshProfile: vi.fn(),
  getAgentRuntimes: vi.fn(),
  getCommandCatalog: vi.fn(),
  getEnvironmentVariables: vi.fn(),
  getGeneralConfig: vi.fn(),
  getHookRuntimeView: vi.fn(),
  getHooksConfig: vi.fn(),
  getMcpServer: vi.fn(),
  getMcpServerTools: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getPluginsRuntime: vi.fn(),
  getProxyConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  listMcpServers: vi.fn(),
  listSshProfiles: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  probeWebConnectivity: vi.fn(),
  revealSshProfilePassword: vi.fn(),
  refreshMcpServerTools: vi.fn(),
  reloadMcpConfig: vi.fn(),
  reloadProxyConfig: vi.fn(),
  saveEnvironmentVariable: vi.fn(),
  saveGeneralConfig: vi.fn(),
  saveProxyConfig: vi.fn(),
  saveSshProfile: vi.fn(),
  saveWebConfig: vi.fn(),
  setMcpServerEnabled: vi.fn(),
  testMcpServerConnection: vi.fn(),
  updateCommand: vi.fn(),
  updateMcpServer: vi.fn(),
}));

vi.setConfig({ testTimeout: 15000 });

const addMcpServerMock = vi.mocked(addMcpServer);
const createCommandMock = vi.mocked(createCommand);
const deleteEnvironmentVariableMock = vi.mocked(deleteEnvironmentVariable);
const deleteMcpServerMock = vi.mocked(deleteMcpServer);
const deleteSshProfileMock = vi.mocked(deleteSshProfile);
const getAgentRuntimesMock = vi.mocked(getAgentRuntimes);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const getEnvironmentVariablesMock = vi.mocked(getEnvironmentVariables);
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getHookRuntimeViewMock = vi.mocked(getHookRuntimeView);
const getHooksConfigMock = vi.mocked(getHooksConfig);
const getMcpServerMock = vi.mocked(getMcpServer);
const getMcpServerToolsMock = vi.mocked(getMcpServerTools);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getPluginsRuntimeMock = vi.mocked(getPluginsRuntime);
const getProxyConfigMock = vi.mocked(getProxyConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const listMcpServersMock = vi.mocked(listMcpServers);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const probeWebConnectivityMock = vi.mocked(probeWebConnectivity);
const revealSshProfilePasswordMock = vi.mocked(revealSshProfilePassword);
const refreshMcpServerToolsMock = vi.mocked(refreshMcpServerTools);
const reloadMcpConfigMock = vi.mocked(reloadMcpConfig);
const reloadProxyConfigMock = vi.mocked(reloadProxyConfig);
const saveEnvironmentVariableMock = vi.mocked(saveEnvironmentVariable);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);
const saveProxyConfigMock = vi.mocked(saveProxyConfig);
const saveSshProfileMock = vi.mocked(saveSshProfile);
const saveWebConfigMock = vi.mocked(saveWebConfig);
const setMcpServerEnabledMock = vi.mocked(setMcpServerEnabled);
const testMcpServerConnectionMock = vi.mocked(testMcpServerConnection);
const updateCommandMock = vi.mocked(updateCommand);
const updateMcpServerMock = vi.mocked(updateMcpServer);

beforeEach(() => {
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
      "Models",
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
    expect(within(sections).queryByRole("button", { name: "Speech" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "ClawHub" })).toBeNull();
    expect(within(sections).queryByRole("button", { name: "System" })).toBeNull();

    await waitFor(() => expect(getRoleConfigOptionsMock).toHaveBeenCalledTimes(1));
    expect(getModelProfilesMock).toHaveBeenCalledTimes(1);
    expect(getOrchestrationConfigMock).toHaveBeenCalledTimes(1);

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
    await waitFor(() => expect(screen.getAllByText("Coordinator").length).toBeGreaterThan(0));
    expect(screen.getByText("Reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));
    expect(await screen.findByText("Default")).toBeVisible();
    expect(screen.getByText("2 roles · Main plus reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Commands" }));
    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    expect(screen.getByText("Global commands")).toBeVisible();
    expect(getCommandCatalogMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Plugins" }));
    expect(await screen.findByText("workspace-tools")).toBeVisible();
    expect(screen.getByText("2 components")).toBeVisible();
    expect(getPluginsRuntimeMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Hooks" }));
    expect(await screen.findByText("Session startup setup")).toBeVisible();
    expect(screen.getByText("SessionStart · python hooks/start.py")).toBeVisible();
    expect(getHooksConfigMock).toHaveBeenCalledTimes(1);
    expect(getHookRuntimeViewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Agent Runtime" }));
    expect(await screen.findByText("Codex CLI")).toBeVisible();
    expect(screen.getByText("acp · registry")).toBeVisible();
    expect(getAgentRuntimesMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Web" }));
    expect(await screen.findByText("https://search.example/")).toBeVisible();
    expect(getWebConfigMock).toHaveBeenCalledTimes(1);
  });

  it("manages MCP servers through the MCP config clients", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "MCP" }));

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
  }, 20000);

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
  }, 10000);

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
      motion: "reduce",
      translucentSidebar: true,
      uiFont: '"Inter", sans-serif',
      uiFontSize: 16,
    });
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
    fireEvent.click(within(sections).getByRole("button", { name: "Commands" }));

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

    fireEvent.click(within(sections).getByRole("button", { name: "Commands" }));
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
  }, 15000);

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

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
