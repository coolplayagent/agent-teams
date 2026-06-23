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
  getGeneralConfig,
  getHealth,
  getModelProfiles,
  getNotificationConfig,
  getOrchestrationConfig,
  getRoleConfigOptions,
  getWebConfig,
  saveGeneralConfig,
  saveNotificationConfig,
  saveWebConfig,
} from "../api/client";
import { SettingsDrawer } from "../features/shell/SettingsDrawer";
import { fetchSpeechConfig, saveSpeechConfig } from "../api/speech";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getGeneralConfig: vi.fn(),
  getHealth: vi.fn(),
  getModelProfiles: vi.fn(),
  getNotificationConfig: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getWebConfig: vi.fn(),
  saveGeneralConfig: vi.fn(),
  saveNotificationConfig: vi.fn(),
  saveWebConfig: vi.fn(),
}));

vi.mock("../api/speech", () => ({
  fetchSpeechConfig: vi.fn(),
  saveSpeechConfig: vi.fn(),
}));

const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getHealthMock = vi.mocked(getHealth);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getWebConfigMock = vi.mocked(getWebConfig);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);
const saveNotificationConfigMock = vi.mocked(saveNotificationConfig);
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
  saveGeneralConfigMock.mockResolvedValue({ status: "ok" });
  saveNotificationConfigMock.mockResolvedValue({ status: "ok" });
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
  saveWebConfigMock.mockResolvedValue({ status: "ok" });
  useUiStore.setState({
    language: "en",
    themeMode: "light",
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

  it("updates appearance state without pretending to call a backend", async () => {
    renderDrawer();

    fireEvent.click(await screen.findByText("Dark"));
    expect(useUiStore.getState().themeMode).toBe("dark");

    fireEvent.click(screen.getByText("中文"));
    expect(useUiStore.getState().language).toBe("zh-CN");
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
