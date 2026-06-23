import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardEventHandler, KeyboardEventHandler, ReactNode } from "react";

import {
  createRun,
  getGeneralConfig,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  getSession,
  injectRunMessage,
  updateSessionTopology,
  updateSessionNormalModelProfile,
} from "../api/client";
import {
  createSpeechSttWebSocketUrl,
  fetchSpeechConfig,
} from "../api/speech";
import { Composer } from "../features/composer/Composer";
import type { SessionRecord } from "../api/contracts";
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
  getGeneralConfig: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  getSession: vi.fn(),
  injectRunMessage: vi.fn(),
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
const getGeneralConfigMock = vi.mocked(getGeneralConfig);
const getModelProfilesMock = vi.mocked(getModelProfiles);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const getSessionMock = vi.mocked(getSession);
const injectRunMessageMock = vi.mocked(injectRunMessage);
const updateSessionTopologyMock = vi.mocked(updateSessionTopology);
const updateSessionNormalModelProfileMock = vi.mocked(
  updateSessionNormalModelProfile,
);

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
  restoreVoiceRuntime();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Composer", () => {
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
    const imageFile = pasteImage("chart.png");

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

    expect(await screen.findByText("removable.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove removable.png" }));

    await waitFor(() => expect(screen.queryByText("removable.png")).toBeNull());
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
    expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    expect(injectRunMessageMock).not.toHaveBeenCalled();
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

    await waitFor(() =>
      expect(selectRoot("Model profile")).not.toHaveClass("ant-select-disabled"),
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

    await waitFor(() =>
      expect(selectRoot("Model profile")).not.toHaveClass("ant-select-disabled"),
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
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AntApp>
          <Composer runStreamController={controller} sessionId={sessionId} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function runStreamController(activeRunId: string | null = null): RunStreamController {
  return {
    activeRunId,
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
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
