import { App, ConfigProvider } from "antd";
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
  forwardRef,
  useImperativeHandle,
  useRef,
  type ClipboardEventHandler,
  type ForwardedRef,
  type KeyboardEventHandler,
} from "react";

import type { SessionRecord } from "../api/contracts";
import { NewSessionView } from "../features/sessions/NewSessionView";
import { useOptimisticRunStore } from "../runtime/optimisticRunStore";
import { useUiStore } from "../runtime/uiStore";

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
  Sender: forwardRef(function MockSender(
    props: MockSenderProps,
    ref: ForwardedRef<{
      blur: () => void;
      focus: () => void;
      nativeElement: HTMLDivElement;
    }>,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => ({
      blur: () => textareaRef.current?.blur(),
      focus: () => textareaRef.current?.focus(),
      nativeElement: rootRef.current as HTMLDivElement,
    }));
    return (
      <div className="at-composer-sender" ref={rootRef}>
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
          ref={textareaRef}
          value={props.value ?? ""}
        />
      </div>
    );
  }),
}));

const api = vi.hoisted(() => ({
  createRun: vi.fn(),
  createSession: vi.fn(),
  getCommandCatalog: vi.fn(),
  getGeneralConfig: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  resolveCommandPrompt: vi.fn(),
  searchWorkspacePaths: vi.fn(),
  updateSessionTopology: vi.fn(),
}));

vi.mock("../api/client", () => api);

const session: SessionRecord = {
  session_id: "session-created",
  workspace_id: "workspace-main",
  normal_root_role_id: "main",
  normal_model_profile: "default",
  session_mode: "normal",
};

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ language: "en" });
  api.getRoleConfigOptions.mockResolvedValue({
    main_agent_role_id: "main",
    normal_mode_roles: [{ role_id: "main", name: "Main agent" }],
    subagent_roles: [{ role_id: "reviewer", name: "Reviewer" }],
  });
  api.getModelProfiles.mockResolvedValue({
    default: { is_default: true, model: "gpt-5" },
  });
  api.getOrchestrationConfig.mockResolvedValue({
    default_orchestration_preset_id: "standard",
    presets: [{ preset_id: "standard", name: "Standard" }],
  });
  api.getGeneralConfig.mockResolvedValue({
    shell_safety_policy_enabled: true,
  });
  api.getCommandCatalog.mockResolvedValue({
    app_commands: [],
    workspaces: [],
  });
  api.searchWorkspacePaths.mockResolvedValue({
    query: "",
    results: [],
    workspace_id: "workspace-main",
  });
  api.resolveCommandPrompt.mockResolvedValue({
    expanded_prompt: "",
    matched: false,
  });
  api.createSession.mockResolvedValue(session);
  api.createRun.mockResolvedValue({
    run_id: "run-created",
    session_id: session.session_id,
  });
  api.updateSessionTopology.mockResolvedValue(session);
});

afterEach(() => {
  cleanup();
  useOptimisticRunStore.setState({ prompts: {} });
  vi.clearAllMocks();
});

describe("NewSessionView", () => {
  it("shows an in-context prompt and running state before session creation resolves", async () => {
    api.createSession.mockReturnValue(
      new Promise<SessionRecord>(() => undefined),
    );
    renderView();

    await waitForReady();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Initial task (optional)" }),
      {
        target: { value: "Start immediately" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create and run" }));

    const promptRow = document.querySelector(
      '[data-row-key="optimistic-new-session-prompt"]',
    );
    expect(promptRow).not.toBeNull();
    expect(promptRow).toHaveTextContent("Start immediately");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to the model",
    );
    await waitFor(() => expect(api.createSession).toHaveBeenCalledOnce());
  });

  it("creates the session with defaults and submits the initial task as the first run", async () => {
    const onCreated = vi.fn(() => {
      expect(
        useOptimisticRunStore.getState().prompts[session.session_id],
      ).toMatchObject({
        runId: "run-created",
        sessionId: session.session_id,
        text: "Plan the release",
      });
    });
    renderView(onCreated);

    await waitForReady();
    openRunSettings();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Session name (optional)" }),
      {
        target: { value: "Release planning" },
      },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Initial task (optional)" }),
      {
        target: { value: "  Plan the release  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create and run" }));

    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith({
        workspace_id: "workspace-main",
        normal_model_profile: "default",
        metadata: { title: "Release planning" },
      }),
    );
    expect(api.updateSessionTopology).not.toHaveBeenCalled();
    expect(api.createRun).toHaveBeenCalledWith({
      session_id: "session-created",
      input: [{ kind: "text", text: "Plan the release" }],
      display_input: [{ kind: "text", text: "Plan the release" }],
      target_role_id: null,
      thinking: { enabled: false, effort: "medium" },
      shell_safety_policy_enabled: true,
      yolo: true,
    });
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        session,
        { run_id: "run-created", session_id: "session-created" },
        "Plan the release",
      ),
    );
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("retries a failed initial run without creating a duplicate session", async () => {
    api.createRun
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({
        run_id: "run-created-after-retry",
        session_id: session.session_id,
      });
    const onCreated = vi.fn();
    renderView(onCreated);

    await waitForReady();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Initial task (optional)" }),
      {
        target: { value: "Retry only the run" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create and run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "provider unavailable",
    );
    expect(api.createSession).toHaveBeenCalledOnce();
    expect(api.createRun).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        session,
        {
          run_id: "run-created-after-retry",
          session_id: session.session_id,
        },
        "Retry only the run",
      ),
    );
    expect(api.createSession).toHaveBeenCalledOnce();
    expect(api.createRun).toHaveBeenCalledTimes(2);
  });

  it("uses the saved thinking effort and global shell policy for the first run", async () => {
    localStorage.setItem("agent_teams_thinking_enabled", "true");
    localStorage.setItem("agent_teams_thinking_effort", "high");
    api.getGeneralConfig.mockResolvedValue({
      shell_safety_policy_enabled: false,
    });
    renderView();

    fireEvent.change(
      await screen.findByRole("combobox", { name: "Initial task (optional)" }),
      { target: { value: "Use my run preferences" } },
    );
    const submit = screen.getByRole("button", { name: "Create and run" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(api.createRun).toHaveBeenCalledOnce());
    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        shell_safety_policy_enabled: false,
        thinking: { enabled: true, effort: "high" },
        yolo: true,
      }),
    );
  });

  it("does not submit a first run before general run preferences load", async () => {
    api.getGeneralConfig.mockReturnValue(new Promise(() => undefined));
    renderView();

    fireEvent.change(
      await screen.findByRole("combobox", { name: "Initial task (optional)" }),
      { target: { value: "Wait for preferences" } },
    );
    const submit = screen.getByRole("button", { name: "Create and run" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);

    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.createRun).not.toHaveBeenCalled();
  });

  it("can create an empty session without starting a run", async () => {
    const onCreated = vi.fn();
    renderView(onCreated);

    await waitForReady();
    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    await waitFor(() => expect(api.createSession).toHaveBeenCalled());
    expect(api.createRun).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(session, null, ""),
    );
  });

  it("persists orchestration mode and its registry preset before entering the session", async () => {
    const orchestratedSession = {
      ...session,
      session_mode: "orchestration" as const,
      orchestration_preset_id: "standard",
    };
    api.updateSessionTopology.mockResolvedValue(orchestratedSession);
    const onCreated = vi.fn();
    renderView(onCreated);

    await waitForReady();
    openRunSettings();
    fireEvent.click(screen.getByText("Orchestration"));
    expect(
      screen.getByRole("combobox", { name: "Orchestration preset" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    await waitFor(() =>
      expect(api.updateSessionTopology).toHaveBeenCalledWith(
        "session-created",
        {
          session_mode: "orchestration",
          orchestration_preset_id: "standard",
        },
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(orchestratedSession, null, "");
  });

  it("uses the shared composer surface and progressively discloses pre-create settings", async () => {
    renderView();

    await waitForReady();
    const composer = document.querySelector(".at-new-session-composer.at-composer");
    expect(composer).not.toBeNull();
    expect(composer?.querySelector(".at-composer-sender")).not.toBeNull();
    expect(composer?.querySelector(".at-composer-controls")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Add context or command" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Workspaces: Agent Teams" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Session name (optional)" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Workspaces: Agent Teams" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Workspaces" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Workspaces: Agent Teams" }),
    );

    openRunSettings();
    expect(
      screen.getByLabelText("Session mode"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Roles" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Model profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Initial task (optional)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Target role" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Session name (optional)" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Shell safety policy")).toBeChecked();
    expect(screen.getByLabelText("YOLO")).toBeChecked();
  });

  it("keeps the regular composer quick-action and slash-command interaction", async () => {
    const onCancel = vi.fn();
    api.getCommandCatalog.mockResolvedValue({
      app_commands: [],
      workspaces: [
        {
          commands: [
            {
              aliases: ["rev"],
              allowed_modes: ["normal"],
              argument_hint: "<path>",
              description: "Review the current workspace",
              discovery_source: "project_codex",
              name: "review",
              scope: "project",
              source_path: "C:/work/agent-teams/.codex/commands/review.md",
              template: "Review {{args}}",
            },
          ],
          root_path: "C:/work/agent-teams",
          workspace_id: "workspace-main",
        },
      ],
    });
    renderView(vi.fn(), onCancel);

    await waitForReady();
    fireEvent.click(
      screen.getByRole("button", { name: "Add context or command" }),
    );
    expect(await screen.findByRole("listbox")).toBeVisible();
    expect(screen.getByText("Files and folders")).toBeVisible();

    const prompt = screen.getByRole("combobox", {
      name: "Initial task (optional)",
    });
    fireEvent.change(prompt, { target: { value: "/rev" } });
    await waitFor(() => expect(screen.getByText("/review")).toBeVisible());

    fireEvent.keyDown(prompt, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits pasted images through the same media pipeline as an active session", async () => {
    api.getRoleConfigOptions.mockResolvedValue({
      main_agent_role_id: "main",
      normal_mode_roles: [
        {
          input_modalities: ["image"],
          name: "Main agent",
          role_id: "main",
        },
      ],
      subagent_roles: [],
    });
    api.getModelProfiles.mockResolvedValue({
      default: {
        input_modalities: ["text", "image"],
        is_default: true,
        model: "gpt-5",
      },
    });
    renderView();

    await waitForReady();
    const prompt = screen.getByRole("combobox", {
      name: "Initial task (optional)",
    });
    fireEvent.change(prompt, { target: { value: "Describe this image" } });
    const image = new File(["image-bytes"], "new-session.png", {
      type: "image/png",
    });
    fireEvent.paste(prompt, {
      clipboardData: {
        items: [
          {
            getAsFile: () => image,
            type: image.type,
          },
        ],
      },
    });

    expect(await screen.findByText("new-session.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create and run" }));

    await waitFor(() => expect(api.createRun).toHaveBeenCalledOnce());
    const request = api.createRun.mock.calls[0]?.[0];
    expect(request?.input).toHaveLength(2);
    expect(request?.input[0]).toEqual({
      kind: "text",
      text: "Describe this image",
    });
    expect(request?.input[1]).toMatchObject({
      kind: "inline_media",
      mime_type: "image/png",
      modality: "image",
      name: "new-session.png",
      size_bytes: image.size,
    });
    expect(request?.display_input).toEqual(request?.input);
  });
});

function renderView(onCreated = vi.fn(), onCancel = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ConfigProvider>
      <App>
        <QueryClientProvider client={queryClient}>
          <NewSessionView
            initialWorkspaceId="workspace-main"
            onCancel={onCancel}
            onCreated={onCreated}
            workspaces={[
              {
                workspace_id: "workspace-main",
                root_path: "C:/work/agent-teams",
                display_name: "Agent Teams",
              },
            ]}
          />
        </QueryClientProvider>
      </App>
    </ConfigProvider>,
  );
}

function openRunSettings(): void {
  fireEvent.click(
    screen.getByRole("button", { name: /^Run settings:/ }),
  );
}

async function waitForReady(): Promise<void> {
  await screen.findByRole("button", {
    name: /^Run settings:.*Main agent/,
  });
}
