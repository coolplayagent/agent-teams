import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardEventHandler, KeyboardEventHandler, ReactNode } from "react";

import {
  createRun,
  getCommandCatalog,
  getGeneralConfig,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  getSession,
  injectRunMessage,
  resolveCommandPrompt,
  searchWorkspacePaths,
  stopRun,
  updateSessionTopology,
  updateSessionNormalModelProfile,
} from "../api/client";
import {
  createSpeechSttWebSocketUrl,
  fetchSpeechConfig,
} from "../api/speech";
import { Composer } from "../features/composer/Composer";
import type { RecoverySnapshot, SessionRecord } from "../api/contracts";
import { useUiStore } from "../runtime/uiStore";
import type { RunStreamController } from "../runtime/useRunStreamController";

interface MockSenderProps {
  "aria-label"?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  onPaste?: ClipboardEventHandler<HTMLElement>;
  onSubmit?: (message: string) => void;
  placeholder?: string;
  value?: string;
}

vi.mock("@ant-design/x", () => ({
  Sender: (props: MockSenderProps) => (
    <textarea
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      onChange={(event) => props.onChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          props.onSubmit?.(props.value ?? "");
        }
        props.onKeyDown?.(event);
      }}
      onPaste={props.onPaste}
      placeholder={props.placeholder}
      value={props.value ?? ""}
    />
  ),
}));

vi.mock("../api/client", () => ({
  createRun: vi.fn(),
  getCommandCatalog: vi.fn(),
  getGeneralConfig: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getSession: vi.fn(),
  injectRunMessage: vi.fn(),
  resolveCommandPrompt: vi.fn(),
  searchWorkspacePaths: vi.fn(),
  stopRun: vi.fn(),
  updateSessionTopology: vi.fn(),
  updateSessionNormalModelProfile: vi.fn(),
}));

vi.mock("../api/speech", () => ({
  createSpeechSttWebSocketUrl: vi.fn(),
  fetchSpeechConfig: vi.fn(),
}));

const createRunMock = vi.mocked(createRun);
const createSpeechSttWebSocketUrlMock = vi.mocked(createSpeechSttWebSocketUrl);
const fetchSpeechConfigMock = vi.mocked(fetchSpeechConfig);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getSessionMock = vi.mocked(getSession);
const injectRunMessageMock = vi.mocked(injectRunMessage);
const resolveCommandPromptMock = vi.mocked(resolveCommandPrompt);
const searchWorkspacePathsMock = vi.mocked(searchWorkspacePaths);
const stopRunMock = vi.mocked(stopRun);
const updateSessionTopologyMock = vi.mocked(updateSessionTopology);
const updateSessionNormalModelProfileMock = vi.mocked(
  updateSessionNormalModelProfile,
);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  createSpeechSttWebSocketUrlMock.mockReturnValue(
    "ws://localhost/api/speech/stt/stream",
  );
  fetchSpeechConfigMock.mockResolvedValue({
    configured: false,
    stt_profile_name: null,
  });
  getSessionMock.mockResolvedValue({
    session_id: "session-1",
    workspace_id: "workspace-1",
    session_mode: "normal",
    normal_root_role_id: null,
    normal_model_profile: null,
    orchestration_preset_id: null,
    can_switch_mode: true,
  });
  getGeneralConfigMock.mockResolvedValue({
    shell_safety_policy_enabled: true,
  });
  getModelProfilesMock.mockResolvedValue({
    default: {
      model: "gpt-4o-mini",
      is_default: true,
    },
  });
  getOrchestrationConfigMock.mockResolvedValue({
    default_orchestration_preset_id: "team",
    presets: [{ preset_id: "team", name: "Team" }],
  });
  getCommandCatalogMock.mockResolvedValue({
    app_commands: [],
    workspaces: [],
  });
  resolveCommandPromptMock.mockResolvedValue({
    matched: false,
    raw_text: "",
  });
  searchWorkspacePathsMock.mockResolvedValue({
    query: "",
    results: [],
    workspace_id: "workspace-1",
  });
});

afterEach(() => {
  cleanup();
  restoreVoiceRuntime();
  vi.clearAllMocks();
  localStorage.clear();
  useUiStore.setState({ language: "en" });
});

describe("Composer", () => {
  it("renders persistent run controls and scoped normal mode fields", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });

    renderComposer();

    expect(await screen.findByLabelText("Prompt")).toHaveAttribute(
      "placeholder",
      "What would you like the agents to do?",
    );
    expect(screen.getByText("Mode")).toBeVisible();
    expect(screen.getByText("Role")).toBeVisible();
    expect(screen.getByText("Target")).toBeVisible();
    expect(screen.getAllByText("Model")[0]).toBeVisible();
    expect(selectRoot("Root role")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Orchestration preset" }),
    ).not.toBeInTheDocument();
    expect(selectRoot("Target role")).toBeVisible();
    expect(selectRoot("Model profile")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Shell safety policy" }))
      .toBeChecked();
    expect(screen.getByRole("checkbox", { name: "YOLO" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Thinking" })).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Thinking effort" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));

    expect(selectRoot("Thinking effort")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
      "title",
      "Enter a prompt or attach a file before sending.",
    );
  });

  it("localizes the persistent composer frame in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "MainAgent",
          name: "Main Agent",
        },
      ],
    });

    renderComposer();

    expect(await screen.findByLabelText("提示词")).toHaveAttribute(
      "placeholder",
      "你希望这些代理帮你做什么？",
    );
    expect(screen.getByText("普通模式")).toBeVisible();
    expect(screen.getByText("模式")).toBeVisible();
    expect(screen.getByText("角色")).toBeVisible();
    expect(screen.getByText("目标")).toBeVisible();
    expect(screen.getAllByText("模型")[0]).toBeVisible();
    expect(screen.getByRole("combobox", { name: "根角色" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "编排预设" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "目标角色" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "模型配置" })).toBeVisible();
    expect(screen.getByText("思考")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Shell 安全策略" })).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeVisible();
    expect(screen.getByRole("button", { name: "发送" })).toBeVisible();
  });

  it("keeps composer topology controls scoped to the active session mode", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "orchestration",
      normal_root_role_id: "Writer",
      normal_model_profile: null,
      orchestration_preset_id: "team",
      can_switch_mode: true,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });

    renderComposer();

    expect(
      await screen.findByRole("combobox", { name: "Orchestration preset" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Root role" }),
    ).not.toBeInTheDocument();
  });

  it("passes the selected target role to AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      coordinator_role_id: "Coordinator",
      main_agent_role_id: "MainAgent",
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          description: "Writes copy",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "Writer",
    });
    const controller = runStreamController();

    renderComposer(controller);

    fireEvent.mouseDown(
      await screen.findByRole("combobox", { name: "Target role" }),
    );
    const writerOptions = await screen.findAllByText("Writer");
    const visibleWriterOption = writerOptions.at(-1);
    if (visibleWriterOption === undefined) {
      throw new Error("Writer option was not rendered.");
    }
    fireEvent.click(visibleWriterOption);
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Draft the update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "Draft the update" }],
          target_role_id: "Writer",
        }),
      ),
    );
    expect(controller.startRunStream).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session-1",
    });
  });

  it("refreshes sidebar sessions when a new run starts", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });
    const controller = runStreamController();
    const queryClient = createComposerQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderComposerWithClient(queryClient, controller);

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Start the session" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
  });

  it("explains why sending is disabled before input is available", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    const sendButton = await screen.findByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute(
      "title",
      "Enter a prompt or attach a file before sending.",
    );
  });

  it("resolves leading slash commands before AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/review file.py",
      parsed_name: "review",
      resolved_name: "review",
      args: "file.py",
      expanded_prompt: "Review file.py",
      expanded_prompt_length: 14,
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "/review file.py" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveCommandPromptMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
        raw_text: "/review file.py",
        mode: "normal",
      }),
    );
    expect(createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [{ kind: "text", text: "Review file.py" }],
        display_input: [{ kind: "text", text: "Review file.py" }],
      }),
    );
  });

  it("keeps unknown leading slash commands as raw prompt text", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: false,
      raw_text: "/missing value",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "/missing value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "/missing value" }],
        }),
      ),
    );
  });

  it("restores the composer when leading slash command resolution fails", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    resolveCommandPromptMock.mockRejectedValue(new Error("registry down"));
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, {
      target: { value: "/opsx:propose" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(resolveCommandPromptMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled(),
    );
    expect(prompt).toHaveValue("/opsx:propose");
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
      "title",
      "Send",
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("does not parse inline slash prose as a command or skill action", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Get the current time.",
          name: "time",
          ref: "builtin:time",
          source: "builtin",
        },
      ],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/time complexity",
      expanded_prompt: "This should not be used.",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Please explain /time complexity" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(resolveCommandPromptMock).not.toHaveBeenCalled();
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [
          {
            kind: "text",
            text: "Please explain /time complexity",
          },
        ],
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty("skills");
  });

  it("shows slash command suggestions from the command catalog", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [],
      workspaces: [
        {
          workspace_id: "workspace-1",
          root_path: "C:/work/agent-teams",
          commands: [
            {
              aliases: ["rev"],
              allowed_modes: ["normal"],
              argument_hint: "<path>",
              description: "Review a workspace file",
              discovery_source: "project_codex",
              name: "review",
              scope: "project",
              source_path: "C:/work/agent-teams/.codex/commands/review.md",
              template: "Review {{args}}",
            },
          ],
        },
      ],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/rev" } });

    const optionName = await screen.findByText("/review");
    expect(optionName).toBeVisible();
    expect(screen.getByText("Review a workspace file")).toBeVisible();
    const optionButton = optionName.closest("button");
    if (optionButton === null) {
      throw new Error("Slash command option button was not rendered.");
    }
    fireEvent.mouseDown(optionButton);

    expect(prompt).toHaveValue("/review ");
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("shows same-named slash command and skill suggestions separately", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [
        {
          aliases: [],
          allowed_modes: ["normal"],
          argument_hint: "",
          description: "Command probe",
          discovery_source: "app",
          name: "dedupe-probe",
          scope: "app",
          source_path: "C:/commands/dedupe-probe.md",
          template: "Command {{args}}",
        },
      ],
      workspaces: [],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });

    expect(await screen.findByText("Command probe")).toBeVisible();
    expect(await screen.findByText("Skill probe")).toBeVisible();
    expect(screen.getByText("Command")).toBeVisible();
    expect(screen.getByText("Skill")).toBeVisible();
    expect(screen.getAllByText("/dedupe-probe")).toHaveLength(2);
  });

  it("submits an explicitly selected slash skill without resolving it as a command", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [
        {
          aliases: [],
          allowed_modes: ["normal"],
          argument_hint: "",
          description: "Command probe",
          discovery_source: "app",
          name: "dedupe-probe",
          scope: "app",
          source_path: "C:/commands/dedupe-probe.md",
          template: "Command {{args}}",
        },
      ],
      workspaces: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/dedupe-probe topic",
      expanded_prompt: "Command should not run.",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const skillOption = await screen.findByText("Skill probe");
    const skillButton = skillOption.closest("button");
    if (skillButton === null) {
      throw new Error("Skill suggestion button was not rendered.");
    }
    fireEvent.mouseDown(skillButton);
    fireEvent.change(prompt, { target: { value: "/dedupe-probe topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(resolveCommandPromptMock).not.toHaveBeenCalled();
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [{ kind: "text", text: "topic" }],
        skills: ["dedupe-probe"],
      }),
    );
  });

  it("keeps a selected slash skill after committing a workspace mention", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [],
      workspaces: [],
    });
    searchWorkspacePathsMock.mockResolvedValue({
      query: "src",
      results: [
        {
          kind: "file",
          name: "main.py",
          path: "src/relay_teams/main.py",
        },
      ],
      workspace_id: "workspace-1",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const skillOption = await screen.findByText("Skill probe");
    const skillButton = skillOption.closest("button");
    if (skillButton === null) {
      throw new Error("Skill suggestion button was not rendered.");
    }
    fireEvent.mouseDown(skillButton);
    fireEvent.change(prompt, { target: { value: "/dedupe-probe @src" } });
    const resourceOption = await screen.findByText("@main.py");
    const resourceButton = resourceOption.closest("button");
    if (resourceButton === null) {
      throw new Error("Resource suggestion button was not rendered.");
    }
    fireEvent.mouseDown(resourceButton);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(resolveCommandPromptMock).not.toHaveBeenCalled();
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [
          {
            kind: "text",
            text: "@src/relay_teams/main.py",
          },
        ],
        skills: ["dedupe-probe"],
      }),
    );
  });

  it("falls back to command resolution when a selected slash skill becomes unavailable", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [],
      workspaces: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/dedupe-probe topic",
      expanded_prompt: "Command ran after skill removal.",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });
    const queryClient = renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const skillOption = await screen.findByText("Skill probe");
    const skillButton = skillOption.closest("button");
    if (skillButton === null) {
      throw new Error("Skill suggestion button was not rendered.");
    }
    fireEvent.mouseDown(skillButton);
    act(() => {
      queryClient.setQueryData(["roles", "options"], {
        normal_mode_roles: [],
        skills: [],
      });
    });
    fireEvent.change(prompt, { target: { value: "/dedupe-probe topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveCommandPromptMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
        raw_text: "/dedupe-probe topic",
        mode: "normal",
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [
          {
            kind: "text",
            text: "Command ran after skill removal.",
          },
        ],
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty("skills");
  });

  it("prefers command resolution over same-named skills when no skill was selected", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Research deeply.",
          name: "deepresearch",
          ref: "builtin:deepresearch",
          source: "builtin",
        },
      ],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/deepresearch topic",
      parsed_name: "deepresearch",
      resolved_name: "deepresearch",
      args: "topic",
      expanded_prompt: "Run the project command for the topic.",
      expanded_prompt_length: 34,
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "/deepresearch topic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveCommandPromptMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
        raw_text: "/deepresearch topic",
        mode: "normal",
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [
          {
            kind: "text",
            text: "Run the project command for the topic.",
          },
        ],
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty("skills");
  });

  it("falls back to a slash skill when command resolution misses", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: false,
      raw_text: "/dedupe-probe topic",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "/dedupe-probe topic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [{ kind: "text", text: "topic" }],
        skills: ["dedupe-probe"],
      }),
    );
  });

  it("falls back to a slash skill when a selected command becomes unavailable", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [
        {
          aliases: [],
          allowed_modes: ["normal"],
          argument_hint: "",
          description: "Command probe",
          discovery_source: "app",
          name: "dedupe-probe",
          scope: "app",
          source_path: "C:/commands/dedupe-probe.md",
          template: "Command {{args}}",
        },
      ],
      workspaces: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: false,
      raw_text: "/dedupe-probe topic",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const commandOption = await screen.findByText("Command probe");
    const commandButton = commandOption.closest("button");
    if (commandButton === null) {
      throw new Error("Command suggestion button was not rendered.");
    }
    fireEvent.mouseDown(commandButton);
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [],
      workspaces: [],
    });
    fireEvent.change(prompt, { target: { value: "/dedupe-probe topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveCommandPromptMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
        raw_text: "/dedupe-probe topic",
        mode: "normal",
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [{ kind: "text", text: "topic" }],
        skills: ["dedupe-probe"],
      }),
    );
  });

  it("falls back to a slash skill without workspace command resolution", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: null,
      session_mode: "normal",
      normal_root_role_id: null,
      normal_model_profile: null,
      orchestration_preset_id: null,
      can_switch_mode: true,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [
        {
          aliases: [],
          allowed_modes: ["normal"],
          argument_hint: "",
          description: "Command probe",
          discovery_source: "app",
          name: "dedupe-probe",
          scope: "app",
          source_path: "C:/commands/dedupe-probe.md",
          template: "Command {{args}}",
        },
      ],
      workspaces: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const commandOption = await screen.findByText("Command probe");
    const commandButton = commandOption.closest("button");
    if (commandButton === null) {
      throw new Error("Command suggestion button was not rendered.");
    }
    fireEvent.mouseDown(commandButton);
    fireEvent.change(prompt, { target: { value: "/dedupe-probe topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(resolveCommandPromptMock).not.toHaveBeenCalled();
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [{ kind: "text", text: "topic" }],
        skills: ["dedupe-probe"],
      }),
    );
  });

  it("does not submit a same-named skill when an explicitly selected command resolves", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
      skills: [
        {
          description: "Skill probe",
          name: "dedupe-probe",
          ref: "dedupe-probe",
          source: "project",
        },
      ],
    });
    getCommandCatalogMock.mockResolvedValue({
      app_commands: [
        {
          aliases: [],
          allowed_modes: ["normal"],
          argument_hint: "",
          description: "Command probe",
          discovery_source: "app",
          name: "dedupe-probe",
          scope: "app",
          source_path: "C:/commands/dedupe-probe.md",
          template: "Command {{args}}",
        },
      ],
      workspaces: [],
    });
    resolveCommandPromptMock.mockResolvedValue({
      matched: true,
      raw_text: "/dedupe-probe topic",
      expanded_prompt: "Command ran.",
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "/dedu" } });
    const commandOption = await screen.findByText("Command probe");
    const commandButton = commandOption.closest("button");
    if (commandButton === null) {
      throw new Error("Command suggestion button was not rendered.");
    }
    fireEvent.mouseDown(commandButton);
    fireEvent.change(prompt, { target: { value: "/dedupe-probe topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveCommandPromptMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
        raw_text: "/dedupe-probe topic",
        mode: "normal",
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: [{ kind: "text", text: "Command ran." }],
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty("skills");
  });

  it("shows workspace resource suggestions from prompt mentions", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    searchWorkspacePathsMock.mockResolvedValue({
      query: "src",
      results: [
        {
          kind: "file",
          name: "Composer.tsx",
          path: "frontend/app/src/features/composer/Composer.tsx",
        },
      ],
      workspace_id: "workspace-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "Inspect @src" } });

    await waitFor(() =>
      expect(searchWorkspacePathsMock).toHaveBeenCalledWith(
        "workspace-1",
        "src",
        80,
      ),
    );
    const optionName = await screen.findByText("@Composer.tsx");
    expect(optionName).toBeVisible();
    expect(
      screen.getByText("frontend/app/src/features/composer/Composer.tsx"),
    ).toBeVisible();
    const optionButton = optionName.closest("button");
    if (optionButton === null) {
      throw new Error("Workspace resource option button was not rendered.");
    }
    fireEvent.mouseDown(optionButton);

    expect(prompt).toHaveValue(
      "Inspect @frontend/app/src/features/composer/Composer.tsx ",
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("keeps directory prompt mentions open for deeper paths", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    searchWorkspacePathsMock.mockResolvedValue({
      query: "src",
      results: [
        {
          kind: "directory",
          name: "src",
          path: "frontend/app/src",
        },
      ],
      workspace_id: "workspace-1",
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "@src" } });

    const optionButton = await screen.findByRole("option", { name: /@src/ });
    fireEvent.mouseDown(optionButton);

    expect(prompt).toHaveValue("@frontend/app/src/");
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("uses a leading role mention as the run target and strips it from prompt text", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          description: "Writes copy",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "Writer",
    });

    renderComposer();

    await waitForRoleOption("Writer");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "@Writer Draft the update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "Draft the update" }],
          target_role_id: "Writer",
        }),
      ),
    );
  });

  it("shows leading role mention options and inserts a clicked role mention", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          description: "Writes copy",
        },
      ],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "@W" } });

    const option = await screen.findByRole("option", { name: /@Writer/ });
    expect(option).toHaveTextContent("Writes copy");
    fireEvent.mouseDown(option);

    expect(prompt).toHaveValue("@Writer ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects a leading role mention option from the keyboard", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
        {
          role_id: "Reviewer",
          name: "Reviewer",
        },
      ],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "@Rev" } });

    expect(await screen.findByRole("option", { name: /@Reviewer/ })).toBeVisible();
    fireEvent.keyDown(prompt, { key: "Enter" });

    expect(createRunMock).not.toHaveBeenCalled();
    expect(prompt).toHaveValue("@Reviewer ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("dismisses the leading role mention menu with Escape", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.change(prompt, { target: { value: "@W" } });

    expect(await screen.findByRole("option", { name: /@Writer/ })).toBeVisible();
    fireEvent.keyDown(prompt, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(prompt).toHaveValue("@W");
  });

  it("supports fullwidth leading role mention triggers", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "Writer",
    });

    renderComposer();

    await waitForRoleOption("Writer");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "＠Writer Draft the update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "Draft the update" }],
          target_role_id: "Writer",
        }),
      ),
    );
  });

  it("supports leading main agent display name mentions", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      main_agent_role_id: "MainAgent",
      main_agent_role: {
        role_id: "MainAgent",
        name: "Main Agent",
      },
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "MainAgent",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "@Main Agent Draft the update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "Draft the update" }],
          target_role_id: "MainAgent",
        }),
      ),
    );
  });

  it("blocks ambiguous leading role mentions", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "WriterA",
          name: "Writer",
        },
        {
          role_id: "WriterB",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    await waitForRoleOption("Writer");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "@Writer Draft the update" },
    });

    expect(await screen.findByText("Mention is ambiguous: Writer, Writer.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("requires content after a leading role mention unless an attachment is present", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    await waitForRoleOption("Writer");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "@Writer" },
    });

    expect(
      await screen.findByText("Enter a prompt after the role mention."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("allows a leading role mention with only a pasted image attachment", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "Writer",
    });

    renderComposer();

    await waitForRoleOption("Writer");
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "@Writer" },
    });
    pasteImage("mention-image.png");

    expect(await screen.findByText("mention-image.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        target_role_id: "Writer",
      }),
    );
    expect(createRunMock.mock.calls[0]?.[0].input).toHaveLength(1);
    expect(createRunMock.mock.calls[0]?.[0].input[0]).toMatchObject({
      kind: "inline_media",
      name: "mention-image.png",
    });
  });

  it("submits pasted image attachments as inline media parts", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });
    const controller = runStreamController();

    renderComposer(controller);

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Describe this image" },
    });
    expect(screen.queryByLabelText("Prompt attachments")).toBeNull();
    const imageFile = pasteImage("chart.png");

    expect(await screen.findByLabelText("Prompt attachments")).toBeVisible();
    expect(await screen.findByText("chart.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    const request = createRunMock.mock.calls[0]?.[0];
    expect(request?.input).toHaveLength(2);
    expect(request?.input[0]).toEqual({
      kind: "text",
      text: "Describe this image",
    });
    expect(request?.input[1]).toMatchObject({
      height: null,
      kind: "inline_media",
      mime_type: "image/png",
      modality: "image",
      name: "chart.png",
      size_bytes: imageFile.size,
      width: null,
    });
    expect(request?.input[1]).toHaveProperty("base64_data", expect.any(String));
    expect(request?.display_input).toEqual(request?.input);
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    await waitFor(() => expect(screen.queryByText("chart.png")).toBeNull());
  });

  it("creates a run from a media-only pasted image prompt", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("media-only.png");

    expect(await screen.findByText("media-only.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    const request = createRunMock.mock.calls[0]?.[0];
    expect(request?.input).toHaveLength(1);
    expect(request?.input[0]).toMatchObject({
      kind: "inline_media",
      mime_type: "image/png",
      modality: "image",
      name: "media-only.png",
    });
  });

  it("uses pasted image MIME subtype for unnamed attachment filenames", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("", "image/webp");

    expect(await screen.findByText("pasted-image-1.webp")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0].input[0]).toMatchObject({
      kind: "inline_media",
      mime_type: "image/webp",
      name: "pasted-image-1.webp",
    });
  });

  it("removes pasted image attachments before sending", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    pasteImage("removable.png");

    expect(await screen.findByLabelText("Prompt attachments")).toBeVisible();
    expect(await screen.findByText("removable.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove removable.png" }));

    await waitFor(() => expect(screen.queryByText("removable.png")).toBeNull());
    expect(screen.queryByLabelText("Prompt attachments")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("blocks image attachments when the selected role does not support image input", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["text"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Describe this image" },
    });
    pasteImage("unsupported.png");

    expect(
      await screen.findByText("Writer does not support image input."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("allows image attachments when the selected model profile supports image input", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: "Writer",
      normal_model_profile: "vision",
      orchestration_preset_id: null,
      can_switch_mode: true,
    });
    getModelProfilesMock.mockResolvedValue({
      vision: {
        input_modalities: ["image"],
        model: "vision-profile-model",
      },
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["text"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("profile-vision.png");

    expect(await screen.findByText("profile-vision.png")).toBeVisible();
    expect(screen.queryByText("Writer does not support image input."))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0].input[0]).toMatchObject({
      kind: "inline_media",
      name: "profile-vision.png",
    });
  });

  it("blocks image attachments when the selected model profile rejects image input", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: "Writer",
      normal_model_profile: "textOnly",
      orchestration_preset_id: null,
      can_switch_mode: true,
    });
    getModelProfilesMock.mockResolvedValue({
      textOnly: {
        input_modalities: [],
        model: "text-only-model",
      },
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("profile-text-only.png");

    expect(
      await screen.findByText("text-only-model does not support image input."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("waits for model profile saves before validating and sending image prompts", async () => {
    const profileUpdate = deferred<SessionRecord>();
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: "Writer",
      normal_model_profile: "textOnly",
      orchestration_preset_id: null,
      can_switch_mode: true,
    });
    getModelProfilesMock.mockResolvedValue({
      textOnly: {
        input_modalities: [],
        model: "text-only-model",
      },
      vision: {
        input_modalities: ["image"],
        model: "vision-profile-model",
      },
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    updateSessionNormalModelProfileMock.mockReturnValue(profileUpdate.promise);
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("profile-after-save.png");
    expect(
      await screen.findByText("text-only-model does not support image input."),
    ).toBeVisible();
    fireEvent.mouseDown(
      screen.getByRole("combobox", { name: "Model profile" }),
    );
    fireEvent.click(await screen.findByText("vision - vision-profile-model"));

    await waitFor(() =>
      expect(updateSessionNormalModelProfileMock).toHaveBeenCalledWith(
        "session-1",
        "vision",
      ),
    );
    expect(selectRoot("Model profile")).toHaveClass("ant-select-disabled");
    expect(screen.getByLabelText("Prompt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(createRunMock).not.toHaveBeenCalled();

    const updatedSession: SessionRecord = {
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: "Writer",
      normal_model_profile: "vision",
      orchestration_preset_id: null,
      can_switch_mode: true,
    };
    getSessionMock.mockResolvedValue(updatedSession);
    await act(async () => {
      profileUpdate.resolve(updatedSession);
      await profileUpdate.promise;
    });

    await waitFor(() =>
      expect(
        screen.queryByText("text-only-model does not support image input."),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0].input[0]).toMatchObject({
      kind: "inline_media",
      name: "profile-after-save.png",
    });
  });

  it("blocks image attachments when image support is unknown for the selected role", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("unknown-support.png");

    expect(
      await screen.findByText("Image input support for Writer is unknown."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("checks coordinator image support for orchestration image prompts", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "orchestration",
      normal_root_role_id: "Writer",
      normal_model_profile: null,
      orchestration_preset_id: "team",
      can_switch_mode: true,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      coordinator_role_id: "Coordinator",
      coordinator_role: {
        role_id: "Coordinator",
        name: "Coordinator",
        input_modalities: ["text"],
      },
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("orchestration-blocked.png");

    expect(
      await screen.findByText("Coordinator does not support image input."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("does not let orchestration target role selection bypass coordinator image support", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "orchestration",
      normal_root_role_id: "Writer",
      normal_model_profile: null,
      orchestration_preset_id: "team",
      can_switch_mode: true,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      coordinator_role_id: "Coordinator",
      coordinator_role: {
        role_id: "Coordinator",
        name: "Coordinator",
        input_modalities: ["text"],
      },
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["image"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.mouseDown(
      await screen.findByRole("combobox", { name: "Target role" }),
    );
    const writerOptions = await screen.findAllByText("Writer");
    const visibleWriterOption = writerOptions.at(-1);
    if (visibleWriterOption === undefined) {
      throw new Error("Writer option was not rendered.");
    }
    fireEvent.click(visibleWriterOption);
    pasteImage("target-role-bypass.png");

    expect(
      await screen.findByText("Coordinator does not support image input."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("allows orchestration image prompts when only the coordinator supports images", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "orchestration",
      normal_root_role_id: "Writer",
      normal_model_profile: null,
      orchestration_preset_id: "team",
      can_switch_mode: true,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      coordinator_role_id: "Coordinator",
      coordinator_role: {
        role_id: "Coordinator",
        name: "Coordinator",
        input_modalities: ["image"],
      },
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          input_modalities: ["text"],
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    pasteImage("orchestration-allowed.png");

    expect(await screen.findByText("orchestration-allowed.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0].input[0]).toMatchObject({
      kind: "inline_media",
      name: "orchestration-allowed.png",
    });
  });

  it("keeps runtime injections text-only when an image attachment is present", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Use this image" },
    });
    pasteImage("runtime.png");

    expect(
      await screen.findByText("Runtime injections support text only."),
    ).toBeVisible();
    const queueButton = screen.getByRole("button", { name: "Queue" });
    expect(queueButton).toBeDisabled();
    expect(queueButton).toHaveAttribute(
      "title",
      "Runtime injections support text only.",
    );
    fireEvent.click(queueButton);

    expect(injectRunMessageMock).not.toHaveBeenCalled();
  });

  it("explains disabled runtime injection buttons when no text is entered", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer(runStreamController("run-1"));

    expect(await screen.findByRole("button", { name: "Queue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Queue" })).toHaveAttribute(
      "title",
      "Enter text to inject into the active run.",
    );
    expect(screen.getByRole("button", { name: "Interrupt" })).toHaveAttribute(
      "title",
      "Enter text to inject into the active run.",
    );
  });

  it("keeps topology locked after creating the first run", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });
    const controller = runStreamController();

    renderComposer(controller);

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Start the session" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    await waitFor(() =>
      expect(selectRoot("Root role")).toHaveClass("ant-select-disabled"),
    );
    fireEvent.click(screen.getByText("Orchestration"));

    expect(updateSessionTopologyMock).not.toHaveBeenCalled();
  });

  it("keeps topology locked when stale session detail resolves after run creation", async () => {
    let resolveSession: ((session: SessionRecord) => void) | undefined;
    getSessionMock.mockReturnValue(
      new Promise<SessionRecord>((resolve) => {
        resolveSession = resolve;
      }),
    );
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });
    const controller = runStreamController();
    const queryClient = createComposerQueryClient();

    const firstRender = renderComposerWithClient(queryClient, controller);

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Start before session detail returns" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-1"));
    if (resolveSession === undefined) {
      throw new Error("Session detail query did not start.");
    }
    resolveSession({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: null,
      normal_model_profile: null,
      orchestration_preset_id: null,
      can_switch_mode: true,
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<SessionRecord>([
          "sessions",
          "detail",
          "session-1",
        ])?.can_switch_mode,
      ).toBe(true),
    );
    await waitFor(() =>
      expect(selectRoot("Root role")).toHaveClass("ant-select-disabled"),
    );
    firstRender.unmount();
    renderComposerWithClient(queryClient, runStreamController());
    await waitFor(() =>
      expect(selectRoot("Root role")).toHaveClass("ant-select-disabled"),
    );
    fireEvent.click(screen.getByText("Orchestration"));

    expect(updateSessionTopologyMock).not.toHaveBeenCalled();
  });

  it("detaches a created run to the background after switching sessions", async () => {
    getSessionMock.mockImplementation(async (sessionId: string) => ({
      session_id: sessionId,
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: null,
      normal_model_profile: null,
      orchestration_preset_id: null,
      can_switch_mode: true,
    }));
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    const runCreation = deferred<Awaited<ReturnType<typeof createRun>>>();
    createRunMock.mockReturnValue(runCreation.promise);
    const controller = runStreamController();
    const queryClient = createComposerQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const view = renderComposerWithClient(queryClient, controller, "session-a");

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0]).toMatchObject({
      input: [{ text: "hello" }],
      session_id: "session-a",
    });

    view.rerender(composerTree(queryClient, controller, "session-b"));

    await act(async () => {
      runCreation.resolve({
        run_id: "run-a",
        session_id: "session-a",
      });
      await runCreation.promise;
    });

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        foreground: false,
        runId: "run-a",
        sessionId: "session-a",
      }),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-a", "messages"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
  });

  it("updates the current session model profile", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    getModelProfilesMock.mockResolvedValue({
      default: {
        model: "gpt-4o-mini",
        is_default: true,
      },
      precise: {
        model: "gpt-4.1",
      },
    });
    updateSessionNormalModelProfileMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      normal_model_profile: "precise",
    });

    renderComposer();

    await waitFor(
      () =>
        expect(selectRoot("Model profile")).not.toHaveClass(
          "ant-select-disabled",
        ),
      { timeout: 5000 },
    );
    fireEvent.mouseDown(
      screen.getByRole("combobox", { name: "Model profile" }),
    );
    fireEvent.click(await screen.findByText("precise - gpt-4.1"));

    await waitFor(() =>
      expect(updateSessionNormalModelProfileMock).toHaveBeenCalledWith(
        "session-1",
        "precise",
      ),
    );
  });

  it("switches the current session to orchestration mode with the default preset", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    updateSessionTopologyMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "orchestration",
      orchestration_preset_id: "team",
      can_switch_mode: true,
    });

    renderComposer();

    await waitFor(() =>
      expect(segmentedItem("Orchestration")).not.toHaveClass(
        "ant-segmented-item-disabled",
      ),
    );
    fireEvent.click(segmentedItem("Orchestration"));

    await waitFor(() =>
      expect(updateSessionTopologyMock).toHaveBeenCalledWith("session-1", {
        session_mode: "orchestration",
        normal_root_role_id: null,
        orchestration_preset_id: "team",
      }),
    );
  });

  it("updates the current session normal root role", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
        {
          role_id: "Reviewer",
          name: "Reviewer",
        },
      ],
    });
    updateSessionTopologyMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: "Reviewer",
      can_switch_mode: true,
    });

    renderComposer();

    await waitFor(
      () => expect(selectRoot("Root role")).not.toHaveClass("ant-select-disabled"),
      { timeout: 5000 },
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Root role" }));
    const reviewerOptions = await screen.findAllByText("Reviewer");
    const visibleReviewerOption = reviewerOptions.at(-1);
    if (visibleReviewerOption === undefined) {
      throw new Error("Reviewer option was not rendered.");
    }
    fireEvent.click(visibleReviewerOption);

    await waitFor(() =>
      expect(updateSessionTopologyMock).toHaveBeenCalledWith("session-1", {
        session_mode: "normal",
        normal_root_role_id: "Reviewer",
        orchestration_preset_id: null,
      }),
    );
  });

  it("locks session topology controls after the session has started", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "workspace-1",
      session_mode: "normal",
      normal_root_role_id: null,
      normal_model_profile: null,
      orchestration_preset_id: null,
      can_switch_mode: false,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });

    renderComposer();

    await screen.findByText("Orchestration");
    expect(selectRoot("Root role")).toHaveClass("ant-select-disabled");
    await waitFor(() =>
      expect(selectRoot("Model profile")).not.toHaveClass(
        "ant-select-disabled",
      ),
    );
    fireEvent.click(screen.getByText("Orchestration"));

    expect(updateSessionTopologyMock).not.toHaveBeenCalled();
  });

  it("keeps model profile updates out of the sidebar cache namespace", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    getSessionMock.mockResolvedValue({
      session_id: "sidebar",
      workspace_id: "workspace-1",
      normal_model_profile: null,
    });
    getModelProfilesMock.mockResolvedValue({
      precise: {
        model: "gpt-4.1",
      },
    });
    const updatedSession = {
      session_id: "sidebar",
      workspace_id: "workspace-1",
      normal_model_profile: "precise",
    };
    updateSessionNormalModelProfileMock.mockImplementation(async () => {
      getSessionMock.mockResolvedValue(updatedSession);
      return updatedSession;
    });

    const queryClient = renderComposer(runStreamController(), "sidebar");
    const sidebarRows = [{ session_id: "sidebar", title: "Sidebar" }];
    queryClient.setQueryData(["sessions", "sidebar"], sidebarRows);

    await waitFor(
      () =>
        expect(selectRoot("Model profile")).not.toHaveClass(
          "ant-select-disabled",
        ),
      { timeout: 5000 },
    );
    fireEvent.mouseDown(
      screen.getByRole("combobox", { name: "Model profile" }),
    );
    fireEvent.click(await screen.findByText("precise - gpt-4.1"));

    await waitFor(() =>
      expect(updateSessionNormalModelProfileMock).toHaveBeenCalledWith(
        "sidebar",
        "precise",
      ),
    );
    expect(queryClient.getQueryData(["sessions", "sidebar"])).toEqual(
      sidebarRows,
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(["sessions", "detail", "sidebar"])).toEqual(
        updatedSession,
      ),
    );
  });

  it("disables the model profile selector until the session record loads", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    getSessionMock.mockReturnValue(new Promise(() => undefined));

    renderComposer();

    expect(selectRoot("Model profile")).toHaveClass("ant-select-disabled");
  });

  it("passes selected thinking settings to AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    expect(screen.getByText("Thinking")).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Thinking effort" }));
    fireEvent.click(await screen.findByText("High"));
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Think through the migration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          thinking: {
            enabled: true,
            effort: "high",
          },
        }),
      ),
    );
    expect(localStorage.getItem("agent_teams_thinking_enabled")).toBe("true");
    expect(localStorage.getItem("agent_teams_thinking_effort")).toBe("high");
  });

  it("passes the selected YOLO mode to AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const yoloToggle = await screen.findByRole("checkbox", { name: "YOLO" });
    expect(yoloToggle).toBeChecked();
    fireEvent.click(yoloToggle);
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Run with explicit approval boundaries" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [
            {
              kind: "text",
              text: "Run with explicit approval boundaries",
            },
          ],
          yolo: false,
        }),
      ),
    );
  });

  it("passes the shell safety policy override to AG-UI run creation", async () => {
    getGeneralConfigMock.mockResolvedValue({
      shell_safety_policy_enabled: false,
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const shellSafetyToggle = await screen.findByRole("checkbox", {
      name: "Shell safety policy",
    });
    await waitFor(() => expect(shellSafetyToggle).not.toBeChecked());
    fireEvent.click(shellSafetyToggle);
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Run with policy checks" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shell_safety_policy_enabled: true,
        }),
      ),
    );
  });

  it("omits the shell safety policy override before general config loads", async () => {
    getGeneralConfigMock.mockReturnValue(new Promise(() => undefined));
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    fireEvent.change(await screen.findByLabelText("Prompt"), {
      target: { value: "Run with backend defaults" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "shell_safety_policy_enabled",
    );
  });

  it("keeps the shell safety policy control disabled when general config fails", async () => {
    getGeneralConfigMock.mockRejectedValue(new Error("general config failed"));
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    const shellSafetyToggle = await screen.findByRole("checkbox", {
      name: "Shell safety policy",
    });
    await waitFor(() => expect(shellSafetyToggle).toBeDisabled());
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Run with backend safety default" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createRunMock).toHaveBeenCalledOnce());
    expect(createRunMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "shell_safety_policy_enabled",
    );
  });

  it("hides voice input when speech is not configured", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    await waitFor(() => expect(fetchSpeechConfigMock).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("button", { name: "Configure speech to text before using voice input" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Voice input unsupported" })).toBeNull();
  });

  it("keeps voice input disabled when configured speech runtime is unavailable", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    const voiceButton = await screen.findByRole("button", {
      name: "Voice input unsupported",
    });
    expect(voiceButton).toBeDisabled();
  });

  it("enables voice input when speech is configured and runtime support exists", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    const voiceButton = await screen.findByRole("button", {
      name: "Voice input",
    });
    await waitFor(() => expect(voiceButton).toBeEnabled());
  });

  it("cancels voice input while the WebSocket is still connecting", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    const voiceRuntime = installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    fireEvent.click(await screen.findByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(voiceRuntime.sockets).toHaveLength(1));
    const socket = voiceRuntime.sockets[0];
    const connectingButton = await screen.findByRole("button", {
      name: "Voice input connecting",
    });

    expect(connectingButton).toBeEnabled();
    fireEvent.click(connectingButton);

    await waitFor(() => expect(socket.readyState).toBe(WebSocket.CLOSED));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Voice input" })).toBeEnabled(),
    );
  });

  it("stops voice input while the WebSocket is open but not ready", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    const voiceRuntime = installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    fireEvent.click(await screen.findByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(voiceRuntime.sockets).toHaveLength(1));
    const socket = voiceRuntime.sockets[0];
    socket.open();
    const connectingButton = await screen.findByRole("button", {
      name: "Voice input connecting",
    });

    expect(connectingButton).toBeEnabled();
    fireEvent.click(connectingButton);

    expect(socket.sent).toContain(JSON.stringify({ type: "stop" }));
  });

  it("writes completed voice transcription into the prompt draft", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    const voiceRuntime = installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    const prompt = (await screen.findByLabelText("Prompt")) as HTMLTextAreaElement;
    fireEvent.change(prompt, {
      target: { value: "Before  after" },
    });
    prompt.focus();
    prompt.setSelectionRange(7, 7);
    const voiceButton = await screen.findByRole("button", { name: "Voice input" });
    voiceButton.focus();
    fireEvent.click(voiceButton);

    await waitFor(() => expect(voiceRuntime.sockets).toHaveLength(1));
    const socket = voiceRuntime.sockets[0];
    socket.open();
    socket.message({ type: "status", status: "ready", sample_rate: 16000 });
    await screen.findByRole("button", { name: "Stop voice input" });
    socket.message({ type: "completed", text: "dictated" });

    await waitFor(() => expect(prompt).toHaveValue("Before dictated after"));
  });

  it("stops voice input when the prompt is manually edited", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    const voiceRuntime = installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    const prompt = await screen.findByLabelText("Prompt");
    fireEvent.click(await screen.findByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(voiceRuntime.sockets).toHaveLength(1));
    const socket = voiceRuntime.sockets[0];
    socket.open();
    socket.message({ type: "status", status: "ready", sample_rate: 16000 });
    await screen.findByRole("button", { name: "Stop voice input" });

    fireEvent.change(prompt, {
      target: { value: "Manual edit" },
    });

    await waitFor(() =>
      expect(socket.sent).toContain(JSON.stringify({ type: "stop" })),
    );
    expect(prompt).toHaveValue("Manual edit");
    socket.message({ type: "completed", text: "late transcript" });
    expect(prompt).toHaveValue("Manual edit");
  });

  it("drops pre-ready voice audio when the server sample rate changes", async () => {
    fetchSpeechConfigMock.mockResolvedValue({
      configured: true,
      stt_profile_name: "stt",
    });
    const voiceRuntime = installVoiceRuntime();
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });

    renderComposer();

    fireEvent.click(await screen.findByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(voiceRuntime.sockets).toHaveLength(1));
    await waitFor(() => expect(voiceRuntime.contexts[0]?.processors).toHaveLength(1));
    const socket = voiceRuntime.sockets[0];
    const processor = voiceRuntime.contexts[0]?.processors[0];
    if (processor === undefined) {
      throw new Error("Voice processor was not created.");
    }
    processor.emit(new Float32Array([0.1, 0.2, 0.3]));
    socket.open();
    socket.message({ type: "status", status: "ready", sample_rate: 24000 });

    expect(socket.sent.every((item) => typeof item === "string")).toBe(true);
  });

  it("queues an injection instead of creating a run while a run is active", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Add a regression test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "Add a regression test",
        mode: "queued",
      }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("clears queued runtime injection text and refreshes recovery state", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });
    const queryClient = renderComposer(runStreamController("run-1"));
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const prompt = screen.getByLabelText("Prompt");

    fireEvent.change(prompt, {
      target: { value: "Continue after the failing tool" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "Continue after the failing tool",
        mode: "queued",
      }),
    );
    await waitFor(() => expect(prompt).toHaveValue(""));
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "recovery"],
    });
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("stops an active run and suppresses the stale recovery target", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    stopRunMock.mockResolvedValue({
      scope: "main",
      status: "ok",
    });
    const controller = runStreamController("run-1");
    const queryClient = renderComposer(controller);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const recoveryQueryKey = ["sessions", "session-1", "recovery"];
    queryClient.setQueryData<RecoverySnapshot>(recoveryQueryKey, {
      active_run: {
        run_id: "run-1",
        session_id: "session-1",
        status: "running",
        phase: "running",
        last_event_id: 41,
        should_show_recover: false,
      },
      background_tasks: [],
      paused_subagent: null,
      pending_tool_approvals: [],
      pending_user_questions: [],
      round_snapshot: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(stopRunMock).toHaveBeenCalledWith("run-1"));
    expect(controller.clearRunStream).toHaveBeenCalledWith({
      suppressRunIds: ["run-1"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(queryClient.getQueryData<RecoverySnapshot>(recoveryQueryKey)?.active_run)
      .toBeNull();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: recoveryQueryKey,
    });
  });

  it("keeps leading role mention text raw during runtime injection", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
        },
      ],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "@Writer Add a regression test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "@Writer Add a regression test",
        mode: "queued",
      }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("interrupts an active run with injected content", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Switch to the UI fix first" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "Switch to the UI fix first",
        mode: "interrupt",
      }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });
});

function renderComposer(
  controller = runStreamController(),
  sessionId = "session-1",
) {
  const queryClient = createComposerQueryClient();
  renderComposerWithClient(queryClient, controller, sessionId);
  return queryClient;
}

function createComposerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function renderComposerWithClient(
  queryClient: QueryClient,
  controller = runStreamController(),
  sessionId = "session-1",
) {
  return render(composerTree(queryClient, controller, sessionId));
}

function composerTree(
  queryClient: QueryClient,
  controller = runStreamController(),
  sessionId = "session-1",
) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <Composer runStreamController={controller} sessionId={sessionId} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: resolvePromise,
  };
}

function runStreamController(activeRunId: string | null = null): RunStreamController {
  return {
    activeRunId,
    activeRunIds: activeRunId === null ? [] : [activeRunId],
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    suppressedRunIds: [],
    trackedRunIds: activeRunId === null ? [] : [activeRunId],
  };
}

function selectRoot(label: string): HTMLElement {
  const element = screen.getByRole("combobox", { name: label }).closest(".ant-select");
  if (element === null) {
    throw new Error(`${label} select root was not rendered.`);
  }
  return element as HTMLElement;
}

function segmentedItem(label: string): HTMLElement {
  const element = screen.getByText(label).closest(".ant-segmented-item");
  if (element === null) {
    throw new Error(`${label} segmented item was not rendered.`);
  }
  return element as HTMLElement;
}

async function waitForRoleOption(label: string) {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Target role" }));
  await screen.findAllByText(label);
  fireEvent.keyDown(document.body, { key: "Escape" });
}

function pasteImage(filename: string, mimeType = "image/png"): File {
  const file = new File(["image-bytes"], filename, { type: mimeType });
  fireEvent.paste(screen.getByLabelText("Prompt"), {
    clipboardData: {
      items: [
        {
          getAsFile: () => file,
          type: mimeType,
        },
      ],
    },
  });
  return file;
}

interface VoiceRuntimeFixture {
  contexts: MockAudioContext[];
  sockets: MockVoiceWebSocket[];
}

const originalAudioContext = window.AudioContext;
const originalMediaDevices = navigator.mediaDevices;
const originalWebSocket = window.WebSocket;

class MockVoiceWebSocket extends EventTarget {
  binaryType: BinaryType = "blob";
  readonly sent: Parameters<WebSocket["send"]>[0][] = [];
  readyState: number = WebSocket.CONNECTING;
  readonly url: string;

  constructor(url: string, private readonly sockets: MockVoiceWebSocket[]) {
    super();
    this.url = url;
    this.sockets.push(this);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  message(payload: Record<string, unknown>) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    );
  }

  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  send(data: Parameters<WebSocket["send"]>[0]) {
    this.sent.push(data);
  }
}

function installVoiceRuntime(): VoiceRuntimeFixture {
  const fixture: VoiceRuntimeFixture = {
    contexts: [],
    sockets: [],
  };
  const mediaDevices = {
    getUserMedia: vi.fn(async () => mockMediaStream()),
  };
  class RuntimeWebSocket extends MockVoiceWebSocket {
    static readonly CLOSED = 3;
    static readonly CLOSING = 2;
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;

    constructor(url: string | URL) {
      super(String(url), fixture.sockets);
    }
  }
  class RuntimeAudioContext extends MockAudioContext {
    constructor() {
      super();
      fixture.contexts.push(this);
    }
  }

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: RuntimeAudioContext,
  });
  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    value: RuntimeWebSocket as unknown as typeof WebSocket,
  });
  return fixture;
}

function restoreVoiceRuntime() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: originalAudioContext,
  });
  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    value: originalWebSocket,
  });
}

class MockAudioContext {
  readonly destination = mockAudioNode() as AudioDestinationNode;
  readonly processors: MockScriptProcessorNode[] = [];
  readonly sampleRate = 16000;
  readonly state: AudioContextState = "running";

  close = vi.fn(async () => undefined);
  createGain = vi.fn(() => mockGainNode());
  createMediaStreamSource = vi.fn(() => mockAudioNode() as MediaStreamAudioSourceNode);
  createScriptProcessor = vi.fn(() => {
    const processor = new MockScriptProcessorNode();
    this.processors.push(processor);
    return processor as unknown as ScriptProcessorNode;
  });
  resume = vi.fn(async () => undefined);
}

function mockAudioNode(): Pick<AudioNode, "connect" | "disconnect"> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockGainNode(): GainNode {
  return {
    ...mockAudioNode(),
    gain: {
      value: 1,
    },
  } as unknown as GainNode;
}

class MockScriptProcessorNode {
  connect = vi.fn();
  disconnect = vi.fn();
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;

  emit(input: Float32Array) {
    this.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => input,
      } as unknown as AudioBuffer,
    } as unknown as AudioProcessingEvent);
  }
}

function mockMediaStream(): MediaStream {
  return {
    getTracks: () => [
      {
        stop: vi.fn(),
      } as unknown as MediaStreamTrack,
    ],
  } as unknown as MediaStream;
}
