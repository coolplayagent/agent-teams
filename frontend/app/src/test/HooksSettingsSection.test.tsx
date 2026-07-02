import { ConfigProvider } from "antd";
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

import {
  getHookRuntimeView,
  getHooksConfig,
  getRoleConfigOptions,
  saveHooksConfig,
  validateHooksConfig,
} from "../api/client";
import type { HooksConfigPayload, JsonValue, RoleConfigOptions } from "../api/contracts";
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

  it("allows a new structured hook to be added after config loading fails", async () => {
    getHooksConfigMock.mockRejectedValueOnce(new Error("broken config"));
    renderSection();

    expect(await screen.findByText("broken config")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add hook" }));

    await waitFor(() => expect(screen.queryByText("broken config")).toBeNull());
    fireEvent.change(screen.getAllByLabelText("Hook name")[0] as HTMLElement, {
      target: { value: "Recovered policy" },
    });
    fireEvent.change(screen.getAllByLabelText("Hook name")[1] as HTMLElement, {
      target: { value: "Recovered command" },
    });
    fireEvent.change(screen.getByLabelText("Matcher"), {
      target: { value: "Write" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "python hooks/recovered.py" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  command: "python hooks/recovered.py",
                  name: "Recovered command",
                  on_error: "ignore",
                  type: "command",
                },
              ],
              matcher: "Write",
              name: "Recovered policy",
            },
          ],
        },
      }),
    );
  });

  it("renders multiple configured matchers under the same hook event", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                command: "python hooks/write.py",
                name: "lint changed files",
                type: "command",
              },
            ],
            matcher: "Write",
            name: "Write guard",
          },
          {
            hooks: [
              {
                command: "python hooks/edit.py",
                name: "format changed files",
                type: "command",
              },
            ],
            matcher: "Edit",
            name: "Edit formatter",
          },
        ],
      },
    });
    renderSection();

    expect(await screen.findByText("Write guard")).toBeVisible();
    expect(screen.getByText("Edit formatter")).toBeVisible();
    expect(screen.getByText("PreToolUse · Write")).toBeVisible();
    expect(screen.getByText("PreToolUse · Edit")).toBeVisible();
    expect(screen.getByText("Configured groups").nextElementSibling?.textContent).toBe(
      "2",
    );
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
      expect(antdMocks.message.error).toHaveBeenCalledWith(
        "Failed to validate hooks config: Prompt is required.",
      ),
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
      expect(antdMocks.message.error).toHaveBeenCalledWith(
        "Failed to save hooks config: Prompt is required.",
      ),
    );
    expect(saveHooksConfigMock).not.toHaveBeenCalled();
  });

  it("maps structured backend validation details to hook locations and field labels", async () => {
    validateHooksConfigMock.mockRejectedValueOnce(
      hookBackendError("validation failed", [
        {
          loc: ["hooks", "PreToolUse", 0, "hooks", 0, "command"],
          msg: "Field required",
        },
      ]),
    );
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Validate" }));

    await waitFor(() =>
      expect(antdMocks.message.error).toHaveBeenCalledWith(
        "Failed to validate hooks config: PreToolUse hook 1, handler 1: Command is required.",
      ),
    );
  });

  it("maps flattened agent hook backend details before showing validate and save errors", async () => {
    validateHooksConfigMock.mockRejectedValueOnce(
      hookBackendError(
        "generic failure",
        "hooks.Stop.0.hooks.0.role_id: Value error, Agent hook role_id must reference a subagent role: MainAgent",
      ),
    );
    saveHooksConfigMock.mockRejectedValueOnce(
      hookBackendError(
        "generic failure",
        "hooks.Stop.0.hooks.0.role_id: Value error, Unknown agent hook role_id: MissingReviewer",
      ),
    );
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                prompt: "review the answer",
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(antdMocks.message.error).toHaveBeenCalledWith(
        'Failed to validate hooks config: Agent role "MainAgent" cannot run as a subagent.',
      ),
    );
    expect(antdMocks.message.error).toHaveBeenCalledWith(
      'Failed to save hooks config: Agent role "MissingReviewer" does not exist.',
    );
  });

  it("autosaves an empty config after deleting the last saved hook group", async () => {
    renderSection();

    await confirmDeleteForCard("Write guard");

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({ hooks: {} }),
    );
    expect(antdMocks.message.success).not.toHaveBeenCalledWith("Hooks saved.");
    expect(await screen.findByText("No hooks configured.")).toBeVisible();
  });

  it("discards unsaved new hook groups without autosaving", async () => {
    getHooksConfigMock.mockResolvedValue({ hooks: {} });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Add hook" }));
    await confirmDeleteForCard("Tool policy guard");

    expect(saveHooksConfigMock).not.toHaveBeenCalled();
    expect(await screen.findByText("No hooks configured.")).toBeVisible();
  });

  it("autosaves delete from the saved baseline without persisting sibling drafts", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                command: "python hooks/write.py",
                name: "lint changed files",
                type: "command",
              },
            ],
            matcher: "Write",
            name: "Write guard",
          },
          {
            hooks: [
              {
                command: "python hooks/shell.py",
                name: "check shell",
                type: "command",
              },
            ],
            matcher: "Bash",
            name: "Shell guard",
          },
        ],
      },
    });
    renderSection();

    await editCard("Shell guard");
    fireEvent.change(screen.getAllByLabelText("Hook name")[0] as HTMLElement, {
      target: { value: "Draft shell guard" },
    });
    await confirmDeleteForCard("Write guard");

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  command: "python hooks/shell.py",
                  name: "check shell",
                  on_error: "ignore",
                  type: "command",
                },
              ],
              matcher: "Bash",
              name: "Shell guard",
            },
          ],
        },
      }),
    );
    expect(screen.getByDisplayValue("Draft shell guard")).toBeVisible();
  });

  it("restores a deleted hook group and shows a delete-specific error when autosave fails", async () => {
    saveHooksConfigMock.mockRejectedValueOnce(new Error("write denied"));
    renderSection();

    await confirmDeleteForCard("Write guard");

    await waitFor(() =>
      expect(antdMocks.message.error).toHaveBeenCalledWith(
        "Failed to delete hook: write denied",
      ),
    );
    expect(await screen.findByText("Write guard")).toBeVisible();
  });

  it("edits handler status messages and preserves prompt model extras on save", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        Notification: [
          {
            hooks: [
              {
                command: "python notify.py",
                name: "notify",
                run_async: true,
                shell: "powershell",
                status_message: "Sending notification",
                type: "command",
              },
            ],
            name: "Command policy",
            role_ids: ["coordinator"],
            run_kinds: ["foreground"],
            session_modes: ["normal"],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                model: "gpt-test",
                name: "summarize final answer",
                prompt: "summarize",
                type: "prompt",
              },
            ],
            name: "Prompt policy",
          },
        ],
      },
    });
    renderSection();

    await editCard("Command policy");
    fireEvent.change(screen.getByLabelText("Status message"), {
      target: { value: "Posting notification" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          Notification: [
            {
              hooks: [
                {
                  command: "python notify.py",
                  name: "notify",
                  on_error: "ignore",
                  run_async: true,
                  shell: "powershell",
                  status_message: "Posting notification",
                  type: "command",
                },
              ],
              name: "Command policy",
              role_ids: ["coordinator"],
              run_kinds: ["foreground"],
              session_modes: ["normal"],
            },
          ],
          Stop: [
            {
              hooks: [
                {
                  model: "gpt-test",
                  name: "summarize final answer",
                  on_error: "ignore",
                  prompt: "summarize",
                  type: "prompt",
                },
              ],
              name: "Prompt policy",
            },
          ],
        },
      }),
    );
  });

  it("preserves http handler fields and group scope fields on save", async () => {
    getHooksConfigMock.mockResolvedValue({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                allowed_env_vars: ["HOOK_TOKEN"],
                headers: { Authorization: "Bearer $HOOK_TOKEN" },
                if: "shell(git *)",
                name: "notify policy",
                on_error: "fail",
                timeout: 12,
                type: "http",
                url: "https://example.test/hook",
              },
            ],
            matcher: "shell",
            name: "HTTP policy",
            role_ids: ["coordinator"],
            run_kinds: ["foreground"],
            session_modes: ["normal"],
          },
        ],
      },
    });
    renderSection();

    await editCard("HTTP policy");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveHooksConfigMock).toHaveBeenCalledWith({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  allowed_env_vars: ["HOOK_TOKEN"],
                  headers: { Authorization: "Bearer $HOOK_TOKEN" },
                  if: "shell(git *)",
                  name: "notify policy",
                  on_error: "fail",
                  timeout: 12,
                  type: "http",
                  url: "https://example.test/hook",
                },
              ],
              matcher: "shell",
              name: "HTTP policy",
              role_ids: ["coordinator"],
              run_kinds: ["foreground"],
              session_modes: ["normal"],
            },
          ],
        },
      }),
    );
  });
});

async function chooseSelectOption(label: string, optionText: string) {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  const matches = await screen.findAllByText(optionText);
  fireEvent.click(matches[matches.length - 1] as HTMLElement);
}

async function editCard(cardName: string) {
  const card = await findHookCard(cardName);
  fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
}

async function confirmDeleteForCard(cardName: string) {
  const card = await findHookCard(cardName);
  fireEvent.click(within(card).getByRole("button", { name: "Delete" }));
  fireEvent.click(await screen.findByRole("button", { name: "OK" }));
}

async function findHookCard(cardName: string): Promise<HTMLElement> {
  const text = await screen.findByText(cardName);
  const card = text.closest(".at-hooks-config-card");
  if (card === null) {
    throw new Error(`Hook card not found: ${cardName}`);
  }
  return card as HTMLElement;
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

function hookBackendError(message: string, detail: JsonValue): Error {
  const error = new Error(message) as Error & { detail: JsonValue };
  error.detail = detail;
  return error;
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
