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

import type { SessionRecord } from "../api/contracts";
import { NewSessionView } from "../features/sessions/NewSessionView";
import { useOptimisticRunStore } from "../runtime/optimisticRunStore";
import { useUiStore } from "../runtime/uiStore";

const api = vi.hoisted(() => ({
  createRun: vi.fn(),
  createSession: vi.fn(),
  getModelProfiles: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
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

    await screen.findByText("Main agent");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Initial task (optional)" }),
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

    await screen.findByText("Main agent");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Session name (optional)" }),
      {
        target: { value: "Release planning" },
      },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Initial task (optional)" }),
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
      thinking: { enabled: false, effort: null },
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

    await screen.findByText("Main agent");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Initial task (optional)" }),
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

  it("can create an empty session without starting a run", async () => {
    const onCreated = vi.fn();
    renderView(onCreated);

    await screen.findByText("Main agent");
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

    await screen.findByText("Main agent");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Mode" }));
    fireEvent.click(await screen.findByText("Orchestration"));
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

  it("exposes the V1 pre-create controls and keeps advanced run settings disclosed", async () => {
    renderView();

    await screen.findByText("Main agent");
    expect(
      screen.getByRole("combobox", { name: "Workspaces" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Roles" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Model profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Initial task (optional)" }),
    ).toBeVisible();
    const advancedTrigger = screen.getByRole("button", {
      name: "Advanced runtime settings",
    });
    expect(advancedTrigger).toBeVisible();
    expect(advancedTrigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("combobox", { name: "Target role" }),
    ).not.toBeInTheDocument();

    fireEvent.click(advancedTrigger);

    expect(advancedTrigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("combobox", { name: "Target role" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Shell safety")).toBeVisible();
    expect(screen.getByText("YOLO")).toBeVisible();
  });
});

function renderView(onCreated = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ConfigProvider>
      <App>
        <QueryClientProvider client={queryClient}>
          <NewSessionView
            initialWorkspaceId="workspace-main"
            onCancel={vi.fn()}
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
