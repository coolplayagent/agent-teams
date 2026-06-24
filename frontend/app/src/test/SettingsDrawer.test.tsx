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
  deleteEnvironmentVariable,
  deleteSshProfile,
  getClawHubConfig,
  getEnvironmentVariables,
  getGeneralConfig,
  getHealth,
  getModelProfiles,
  getNotificationConfig,
  getOrchestrationConfig,
  getProxyConfig,
  getRoleConfigOptions,
  getWebConfig,
  listSshProfiles,
  probeClawHubConnectivity,
  probeSshProfileConnection,
  probeWebConnectivity,
  revealSshProfilePassword,
  reloadProxyConfig,
  saveEnvironmentVariable,
  saveGeneralConfig,
  saveClawHubConfig,
  saveNotificationConfig,
  saveProxyConfig,
  saveSshProfile,
  saveWebConfig,
} from "../api/client";
import { SettingsDrawer } from "../features/shell/SettingsDrawer";
import { fetchSpeechConfig, saveSpeechConfig } from "../api/speech";
import {
  appearanceStorageKey,
  applyAppearanceSettings,
  defaultAppearanceSettings,
} from "../runtime/appearance";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  deleteEnvironmentVariable: vi.fn(),
  deleteSshProfile: vi.fn(),
  getClawHubConfig: vi.fn(),
  getEnvironmentVariables: vi.fn(),
  getGeneralConfig: vi.fn(),
  getHealth: vi.fn(),
  getModelProfiles: vi.fn(),
  getNotificationConfig: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getProxyConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  listSshProfiles: vi.fn(),
  probeClawHubConnectivity: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  probeWebConnectivity: vi.fn(),
  revealSshProfilePassword: vi.fn(),
  reloadProxyConfig: vi.fn(),
  saveEnvironmentVariable: vi.fn(),
  saveGeneralConfig: vi.fn(),
  saveClawHubConfig: vi.fn(),
  saveNotificationConfig: vi.fn(),
  saveProxyConfig: vi.fn(),
  saveSshProfile: vi.fn(),
  saveWebConfig: vi.fn(),
}));

vi.mock("../api/speech", () => ({
  fetchSpeechConfig: vi.fn(),
  saveSpeechConfig: vi.fn(),
}));

vi.setConfig({ testTimeout: 15000 });

const deleteEnvironmentVariableMock = vi.mocked(deleteEnvironmentVariable);
const deleteSshProfileMock = vi.mocked(deleteSshProfile);
const getClawHubConfigMock = vi.mocked(getClawHubConfig);
const getEnvironmentVariablesMock = vi.mocked(getEnvironmentVariables);
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getHealthMock = vi.mocked(getHealth);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getProxyConfigMock = vi.mocked(getProxyConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const probeClawHubConnectivityMock = vi.mocked(probeClawHubConnectivity);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const probeWebConnectivityMock = vi.mocked(probeWebConnectivity);
const revealSshProfilePasswordMock = vi.mocked(revealSshProfilePassword);
const reloadProxyConfigMock = vi.mocked(reloadProxyConfig);
const saveEnvironmentVariableMock = vi.mocked(saveEnvironmentVariable);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);
const saveClawHubConfigMock = vi.mocked(saveClawHubConfig);
const saveNotificationConfigMock = vi.mocked(saveNotificationConfig);
const saveProxyConfigMock = vi.mocked(saveProxyConfig);
const saveSshProfileMock = vi.mocked(saveSshProfile);
const saveWebConfigMock = vi.mocked(saveWebConfig);
const fetchSpeechConfigMock = vi.mocked(fetchSpeechConfig);
const saveSpeechConfigMock = vi.mocked(saveSpeechConfig);

beforeEach(() => {
  getGeneralConfigMock.mockResolvedValue({ shell_safety_policy_enabled: true });
  getHealthMock.mockResolvedValue({
    components: {
      database: { status: "ok" },
      runtime: "ready",
    },
    status: "ok",
    version: "2.0-test",
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
    configured: false,
    language: null,
    noise_reduction: "near_field",
    prompt: null,
    stt_profile_name: null,
    supported_models: ["whisper-1", "gpt-4o-transcribe"],
    vad_prefix_padding_ms: 300,
    vad_silence_duration_ms: 500,
    vad_threshold: 0.5,
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
  getNotificationConfigMock.mockResolvedValue({
    monitor_triggered: {
      channels: ["browser", "toast"],
      enabled: true,
    },
    run_completed: {
      channels: ["toast", "feishu"],
      enabled: true,
    },
    run_failed: {
      channels: ["browser", "toast", "feishu"],
      enabled: true,
    },
    run_stopped: {
      channels: ["toast"],
      enabled: false,
    },
    tool_approval_requested: {
      channels: ["browser", "toast"],
      enabled: true,
    },
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
  getClawHubConfigMock.mockResolvedValue({ token: "saved-clawhub-token" });
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
  probeClawHubConnectivityMock.mockResolvedValue({
    checked_at: "2026-06-24T00:00:00Z",
    clawhub_path: "C:/Users/yex/.local/bin/clawhub.exe",
    clawhub_version: "1.2.3",
    diagnostics: {
      binary_available: true,
      endpoint_fallback_used: false,
      installation_attempted: false,
      installed_during_probe: false,
      registry: "https://clawhub.ai",
      token_configured: true,
    },
    error_code: null,
    error_message: null,
    exit_code: 0,
    latency_ms: 51,
    ok: true,
    retryable: false,
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
  saveClawHubConfigMock.mockResolvedValue({ status: "ok" });
  saveNotificationConfigMock.mockResolvedValue({ status: "ok" });
  reloadProxyConfigMock.mockResolvedValue({ status: "ok" });
  saveSpeechConfigMock.mockResolvedValue({
    configured: true,
    language: "zh-CN",
    noise_reduction: "near_field",
    prompt: "domain terms",
    stt_profile_name: "stt",
    vad_prefix_padding_ms: 300,
    vad_silence_duration_ms: 500,
    vad_threshold: 0.5,
  });
  saveProxyConfigMock.mockResolvedValue({ status: "ok" });
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
    expect(within(sections).getByRole("button", { name: "Appearance" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "General" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Speech" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Notifications" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Models" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Roles" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Orchestration" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Web" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "ClawHub" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Proxy" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Remote workspace" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Environment variables" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "System" })).toBeVisible();

    await waitFor(() => expect(getRoleConfigOptionsMock).toHaveBeenCalledTimes(1));
    expect(getModelProfilesMock).toHaveBeenCalledTimes(1);
    expect(getOrchestrationConfigMock).toHaveBeenCalledTimes(1);
    expect(getHealthMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Models" }));
    await waitFor(() => expect(screen.getAllByText("default").length).toBeGreaterThan(0));
    expect(screen.getByText("gpt-5-mini · in: image, text / out: text")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Roles" }));
    await waitFor(() => expect(screen.getAllByText("Coordinator").length).toBeGreaterThan(0));
    expect(screen.getByText("Reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Orchestration" }));
    expect(await screen.findByText("Default")).toBeVisible();
    expect(screen.getByText("2 roles · Main plus reviewer")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "System" }));
    expect(await screen.findByText("2.0-test")).toBeVisible();
    expect(screen.getByText("database")).toBeVisible();

    fireEvent.click(within(sections).getByRole("button", { name: "Web" }));
    expect(await screen.findByText("https://search.example/")).toBeVisible();
    expect(getWebConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sections).getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Run completed")).toBeVisible();
    expect(getNotificationConfigMock).toHaveBeenCalledTimes(1);
  });

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

  it("saves and probes ClawHub settings through the settings center", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "ClawHub" }));

    expect(await screen.findByText("clawhub.ai")).toBeVisible();
    expect(screen.getByLabelText("Token")).toHaveAttribute(
      "placeholder",
      "************",
    );
    expect(getClawHubConfigMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Token"), {
      target: { value: "next-clawhub-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() =>
      expect(probeClawHubConnectivityMock).toHaveBeenCalledWith({
        token: "next-clawhub-token",
      }),
    );
    expect(await screen.findByText("Connected with 1.2.3 in 51 ms.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveClawHubConfigMock).toHaveBeenCalledWith({
        token: "next-clawhub-token",
      }),
    );
  }, 10000);

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

  it("saves notification settings without dropping hidden delivery channels", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Notifications" }));

    const runCompleted = await screen.findByText("Run completed");
    const row = runCompleted.closest(".at-notification-row");
    if (!(row instanceof HTMLElement)) {
      throw new Error("Run completed notification row was not rendered.");
    }
    fireEvent.click(within(row).getByLabelText("Browser"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveNotificationConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          run_completed: expect.objectContaining({
            channels: ["feishu", "browser", "toast"],
            enabled: true,
          }),
        }),
      ),
    );
  });

  it("saves speech settings through the speech config API", async () => {
    renderDrawer();

    const sections = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    fireEvent.click(within(sections).getByRole("button", { name: "Speech" }));

    const profile = await screen.findByLabelText("STT profile");
    fireEvent.change(profile, { target: { value: "stt" } });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "zh-CN" },
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "domain terms" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveSpeechConfigMock).toHaveBeenCalledWith({
        language: "zh-CN",
        noise_reduction: "near_field",
        prompt: "domain terms",
        stt_profile_name: "stt",
        vad_prefix_padding_ms: 300,
        vad_silence_duration_ms: 500,
        vad_threshold: 0.5,
      }),
    );
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

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
