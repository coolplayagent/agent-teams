import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getHookRuntimeView,
  getHooksConfig,
  getRoleConfigOptions,
  saveHooksConfig,
  validateHooksConfig,
} from "../api/client";
import type { HooksConfigPayload, RoleConfigOptions } from "../api/contracts";
import { HooksSettingsSection } from "../features/settings/HooksSettingsSection";

const antdMocks = vi.hoisted(() => ({
  message: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({
        message: antdMocks.message,
      }),
    },
  };
});

vi.mock("../api/client", () => ({
  getHookRuntimeView: vi.fn(),
  getHooksConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  saveHooksConfig: vi.fn(),
  validateHooksConfig: vi.fn(),
}));

const getHookRuntimeViewMock = vi.mocked(getHookRuntimeView);
const getHooksConfigMock = vi.mocked(getHooksConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const saveHooksConfigMock = vi.mocked(saveHooksConfig);
const validateHooksConfigMock = vi.mocked(validateHooksConfig);

describe("HooksSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHooksConfigMock.mockResolvedValue(hooksConfig());
    getHookRuntimeViewMock.mockResolvedValue({
      loaded_hooks: [
        {
          event: "PreToolUse",
          handler: "python hooks/start.py",
          matcher: "Write",
          name: "Loaded write guard",
          source: "project",
        },
      ],
      sources: [{ path: "C:/repo/.relay/hooks.json", source: "project" }],
    });
    getRoleConfigOptionsMock.mockResolvedValue(roleOptions());
    saveHooksConfigMock.mockImplementation(async (payload) => payload);
    validateHooksConfigMock.mockResolvedValue({ status: "ok" });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders configured hook cards and keeps them visible when runtime loading fails", async () => {
    getHookRuntimeViewMock.mockRejectedValueOnce(new Error("runtime unavailable"));
    renderSection();

    expect(await screen.findByText("Write guard")).toBeVisible();
    expect(screen.getByText("PreToolUse · Write")).toBeVisible();
    expect(screen.getByText("runtime unavailable")).toBeVisible();
    expect(screen.queryByLabelText("Hooks JSON")).toBeNull();
  });

  it("adds an agent hook through structured fields and saves the payload", async () => {
    getHooksConfigMock.mockResolvedValue({ hooks: {} });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Add hook" }));
    await chooseSelectOption("Event", "Stop");
    await chooseSelectOption("Handler type", "agent");
    await chooseSelectOption("Agent role", "Reviewer");
    fireEvent.change(screen.getAllByLabelText("Hook name")[0] as HTMLElement, {
      target: { value: "Verify final answer" },
    });
    fireEvent.change(screen.getAllByLabelText("Hook name")[1] as HTMLElement, {
      target: { value: "Ask reviewer" },
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Check whether the answer is complete." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  name: "Ask reviewer",
                  on_error: "ignore",
                  prompt: "Check whether the answer is complete.",
                  role_id: "reviewer",
                  type: "agent",
                },
              ],
              name: "Verify final answer",
            },
          ],
        },
      }),
    );
  }, 15000);

  it("validates edited command hooks through the structured serializer", async () => {
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "python hooks/changed.py" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await waitFor(() =>
      expect(validateHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  command: "python hooks/changed.py",
                  if: "Write(*.py)",
                  name: "lint changed files",
                  on_error: "ignore",
                  timeout: 5,
                  type: "command",
                },
              ],
              matcher: "Write",
              name: "Write guard",
              role_ids: ["coordinator"],
              run_kinds: ["foreground"],
              session_modes: ["normal"],
            },
          ],
        },
      }),
    );
  });

  it("blocks agent handlers without prompts before API validation", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                role_id: "reviewer",
                type: "agent",
              },
            ],
          },
        ],
      },
    });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Validate" }));

    await waitFor(() =>
      expect(antdMocks.message.error).toHaveBeenCalledWith("Prompt is required."),
    );
    expect(validateHooksConfigMock).not.toHaveBeenCalled();
  });

  it("blocks prompt handlers without prompts before API save", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "prompt",
              },
            ],
          },
        ],
      },
    });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(antdMocks.message.error).toHaveBeenCalledWith("Prompt is required."),
    );
    expect(saveHooksConfigMock).not.toHaveBeenCalled();
  });
});

async function chooseSelectOption(label: string, optionText: string) {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  const matches = await screen.findAllByText(optionText);
  fireEvent.click(matches[matches.length - 1] as HTMLElement);
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <HooksSettingsSection />
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function hooksConfig(): HooksConfigPayload {
  return {
    hooks: {
      PreToolUse: [
        {
          hooks: [
            {
              command: "python hooks/start.py",
              if: "Write(*.py)",
              name: "lint changed files",
              on_error: "ignore",
              timeout: 5,
              type: "command",
            },
          ],
          matcher: "Write",
          name: "Write guard",
          role_ids: ["coordinator"],
          run_kinds: ["foreground"],
          session_modes: ["normal"],
        },
      ],
    },
  };
}

function roleOptions(): RoleConfigOptions {
  return {
    coordinator_role: {
      name: "Coordinator",
      role_id: "coordinator",
    },
    coordinator_role_id: "coordinator",
    main_agent_role: {
      name: "Main Agent",
      role_id: "main",
    },
    main_agent_role_id: "main",
    normal_mode_roles: [
      {
        name: "Main Agent",
        role_id: "main",
      },
    ],
    subagent_roles: [
      {
        name: "Reviewer",
        role_id: "reviewer",
      },
    ],
  };
}
