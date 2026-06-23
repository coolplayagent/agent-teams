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
  getOrchestrationConfig,
  getRoleConfigOptions,
  saveGeneralConfig,
} from "../api/client";
import { SettingsDrawer } from "../features/shell/SettingsDrawer";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getGeneralConfig: vi.fn(),
  getHealth: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  saveGeneralConfig: vi.fn(),
}));

const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getHealthMock = vi.mocked(getHealth);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const saveGeneralConfigMock = vi.mocked(saveGeneralConfig);

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
  saveGeneralConfigMock.mockResolvedValue({ status: "ok" });
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
    expect(within(sections).getByRole("button", { name: "Models" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Roles" })).toBeVisible();
    expect(within(sections).getByRole("button", { name: "Orchestration" })).toBeVisible();
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
