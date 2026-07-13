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

import {
  createAutomationProject,
  deleteAutomationProject,
  disableAutomationProject,
  enableAutomationProject,
  getAutomationProject,
  getOrchestrationConfig,
  getRoleConfigOptions,
  listAutomationDeliveryBindings,
  listAutomationProjects,
  listAutomationProjectSessions,
  listWorkspaces,
  runAutomationProject,
  updateAutomationProject,
} from "../api/client";
import type {
  AutomationProjectRecord,
  AutomationXiaolubanBindingCandidate,
} from "../api/contracts";
import { AutomationView } from "../features/automation/AutomationView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  createAutomationProject: vi.fn(),
  deleteAutomationProject: vi.fn(),
  disableAutomationProject: vi.fn(),
  enableAutomationProject: vi.fn(),
  getAutomationProject: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  listAutomationDeliveryBindings: vi.fn(),
  listAutomationProjectSessions: vi.fn(),
  listAutomationProjects: vi.fn(),
  listWorkspaces: vi.fn(),
  runAutomationProject: vi.fn(),
  updateAutomationProject: vi.fn(),
}));

vi.mock("../features/settings/GitHubSettingsSection", () => ({
  GitHubSettingsSection: () => <div>Inline GitHub configuration</div>,
}));

const createAutomationProjectMock = vi.mocked(createAutomationProject);
const deleteAutomationProjectMock = vi.mocked(deleteAutomationProject);
const disableAutomationProjectMock = vi.mocked(disableAutomationProject);
const enableAutomationProjectMock = vi.mocked(enableAutomationProject);
const getAutomationProjectMock = vi.mocked(getAutomationProject);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const listAutomationDeliveryBindingsMock = vi.mocked(listAutomationDeliveryBindings);
const listAutomationProjectSessionsMock = vi.mocked(listAutomationProjectSessions);
const listAutomationProjectsMock = vi.mocked(listAutomationProjects);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const runAutomationProjectMock = vi.mocked(runAutomationProject);
const updateAutomationProjectMock = vi.mocked(updateAutomationProject);

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ language: "en" });
  getRoleConfigOptionsMock.mockResolvedValue({
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      { name: "Main Agent", role_id: "MainAgent" },
      { name: "Writer", role_id: "Writer" },
    ],
    subagent_roles: [],
  });
  getOrchestrationConfigMock.mockResolvedValue({
    default_orchestration_preset_id: "default-orchestration",
    presets: [
      { name: "Default orchestration", preset_id: "default-orchestration" },
      { name: "Release workflow", preset_id: "release-workflow" },
    ],
  });
  listAutomationProjectsMock.mockResolvedValue([
    automationProject({
      automation_project_id: "aut-daily",
      cron_expression: "0 9 * * *",
      display_name: "Daily triage",
      name: "daily_triage",
      status: "enabled",
      workspace_id: "workspace-1",
    }),
    automationProject({
      automation_project_id: "aut-weekly",
      display_name: "Weekly report",
      interval_every: 1,
      interval_unit: "days",
      name: "weekly_report",
      schedule_mode: "interval",
      status: "disabled",
      workspace_id: "workspace-2",
    }),
  ]);
  getAutomationProjectMock.mockImplementation((projectId) =>
    Promise.resolve(
      automationProject({
        automation_project_id: projectId,
        cron_expression: projectId === "aut-daily" ? "0 9 * * *" : null,
        display_name: projectId === "aut-daily" ? "Daily triage" : "Weekly report",
        interval_every: projectId === "aut-daily" ? null : 1,
        interval_unit: projectId === "aut-daily" ? null : "days",
        name: projectId,
        schedule_mode: projectId === "aut-daily" ? "cron" : "interval",
        status: projectId === "aut-daily" ? "enabled" : "disabled",
        workspace_id: projectId === "aut-daily" ? "workspace-1" : "workspace-2",
      }),
    ),
  );
  listAutomationProjectSessionsMock.mockResolvedValue([
    {
      latest_terminal_run_status: "completed",
      metadata: { title: "Daily triage run" },
      session_id: "session-automation",
      updated_at: "2026-06-24T06:15:00Z",
      workspace_id: "workspace-1",
    },
  ]);
  listAutomationDeliveryBindingsMock.mockResolvedValue([
    deliveryBindingCandidate({
      display_name: "Daily room",
      source_label: "Xiaoluban",
    }),
  ]);
  listWorkspacesMock.mockResolvedValue([
    {
      display_name: "Agent Teams",
      root_path: "C:/work/agent-teams",
      workspace_id: "workspace-1",
    },
  ]);
  runAutomationProjectMock.mockResolvedValue({
    automation_project_id: "aut-daily",
    queued: false,
    reused_bound_session: false,
    run_id: "run-1",
    session_id: "session-automation",
  });
  createAutomationProjectMock.mockResolvedValue(
    automationProject({ automation_project_id: "aut-created" }),
  );
  updateAutomationProjectMock.mockImplementation((projectId, request) =>
    Promise.resolve(
      automationProject({
        automation_project_id: projectId,
        display_name: request.display_name ?? "Daily triage",
        interval_every: request.interval_every ?? null,
        interval_unit: request.interval_unit ?? null,
        run_at: request.run_at ?? null,
        run_config: request.run_config ?? automationProject({}).run_config,
        schedule_mode: request.schedule_mode ?? "cron",
      }),
    ),
  );
  deleteAutomationProjectMock.mockResolvedValue({ status: "deleted" });
  disableAutomationProjectMock.mockResolvedValue(
    automationProject({
      automation_project_id: "aut-daily",
      display_name: "Daily triage",
      name: "daily_triage",
      status: "disabled",
    }),
  );
  enableAutomationProjectMock.mockResolvedValue(
    automationProject({
      automation_project_id: "aut-weekly",
      display_name: "Weekly report",
      name: "weekly_report",
      status: "enabled",
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AutomationView", () => {
  it("keeps Schedules primary and renders GitHub inside the automation workspace", async () => {
    const onOpenGitHubSettings = vi.fn();
    renderAutomation(vi.fn(), onOpenGitHubSettings);

    expect(await screen.findByRole("tab", { name: "Schedules" }))
      .toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "GitHub" }));

    expect(screen.getByRole("tab", { name: "GitHub" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Inline GitHub configuration")).toBeVisible();
    expect(screen.getByRole("tabpanel", { name: "GitHub" })).toBeVisible();
    expect(onOpenGitHubSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Schedules" }));
    expect(screen.getByRole("button", { name: /Daily triage/ })).toBeVisible();
  });

  it("renders real automation projects and selected project detail", async () => {
    renderAutomation();

    expect(await screen.findByRole("button", { name: /Daily triage/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Weekly report/ })).toBeVisible();
    expect(await screen.findByText("Prompt")).toBeVisible();
    expect(screen.getByText("0 9 * * *")).toBeVisible();
    expect(screen.getByText("Daily triage run")).toBeVisible();
    expect(screen.getByText("C:/work/agent-teams")).toBeVisible();
    expect(screen.getByText("Xiaoluban / Daily room")).toBeVisible();
  });

  it("filters automation projects without replacing backend data", async () => {
    renderAutomation();

    expect(await screen.findByRole("button", { name: /Daily triage/ })).toBeVisible();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search automation projects" }),
      { target: { value: "weekly" } },
    );

    const projectList = screen.getByLabelText("Automation projects");
    expect(
      within(projectList).queryByRole("button", { name: /Daily triage/ }),
    ).not.toBeInTheDocument();
    expect(
      within(projectList).getByRole("button", { name: /Weekly report/ }),
    ).toBeVisible();
    expect(listAutomationProjectsMock).toHaveBeenCalledTimes(1);
  });

  it("provides an in-place return from detail for narrow workbench layouts", async () => {
    renderAutomation();

    fireEvent.click(await screen.findByRole("button", { name: /Weekly report/ }));
    const schedulesPanel = screen.getByRole("tabpanel", { name: "Schedules" });
    expect(schedulesPanel).toHaveClass("is-detail-open");

    fireEvent.click(
      await screen.findByRole("button", { name: "Automation projects" }),
    );
    expect(schedulesPanel).not.toHaveClass("is-detail-open");
  });

  it("runs an automation and opens the returned session", async () => {
    const onSessionSelected = vi.fn();
    renderAutomation(onSessionSelected);

    expect(await screen.findByText("Daily triage")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() =>
      expect(runAutomationProjectMock).toHaveBeenCalledWith("aut-daily"),
    );
    expect(onSessionSelected).toHaveBeenCalledWith(
      "session-automation",
      "workspace-1",
    );
  });

  it("toggles the selected automation through the real status endpoint", async () => {
    renderAutomation();

    expect(await screen.findByText("Daily triage")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(disableAutomationProjectMock).toHaveBeenCalledWith("aut-daily"),
    );
    expect(await screen.findByRole("button", { name: "Enable" })).toBeVisible();
  });

  it("shows pending feedback only on the action that is running", async () => {
    let resolveDisable: ((project: AutomationProjectRecord) => void) | undefined;
    disableAutomationProjectMock.mockImplementationOnce(
      () =>
        new Promise<AutomationProjectRecord>((resolve) => {
          resolveDisable = resolve;
        }),
    );
    renderAutomation();

    expect(await screen.findByText("Daily triage")).toBeVisible();
    const runButton = screen.getByRole("button", { name: "Run now" });
    const disableButton = screen.getByRole("button", { name: "Disable" });
    fireEvent.click(disableButton);

    await waitFor(() => expect(disableButton).toHaveClass("ant-btn-loading"));
    expect(runButton).not.toHaveClass("ant-btn-loading");
    resolveDisable?.(
      automationProject({
        automation_project_id: "aut-daily",
        status: "disabled",
      }),
    );
    await waitFor(() => expect(disableAutomationProjectMock).toHaveBeenCalled());
  });

  it("does not render failed project or session requests as empty valid data", async () => {
    getAutomationProjectMock.mockRejectedValueOnce(new Error("detail unavailable"));
    const first = renderAutomation();

    expect(
      await screen.findByText("Could not load automation project details."),
    ).toBeVisible();
    expect(screen.queryByText("No runs yet.")).not.toBeInTheDocument();
    first.unmount();
    cleanup();

    listAutomationProjectSessionsMock.mockRejectedValueOnce(
      new Error("runs unavailable"),
    );
    renderAutomation();
    expect(
      await screen.findByText("Could not load recent automation runs."),
    ).toBeVisible();
    expect(screen.queryByText("No runs yet.")).not.toBeInTheDocument();
  });

  it("edits an existing project and persists an interval schedule through PATCH", async () => {
    renderAutomation();

    expect(await screen.findByText("Daily triage")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("dialog", { name: "Edit" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Focused triage" },
    });
    fireEvent.mouseDown(screen.getByLabelText("Schedule preset"));
    fireEvent.click(await screen.findByText("Interval", { selector: ".ant-select-item-option-content" }));
    fireEvent.change(screen.getByLabelText("Every"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateAutomationProjectMock).toHaveBeenCalledWith(
        "aut-daily",
        expect.objectContaining({
          cron_expression: null,
          display_name: "Focused triage",
          interval_every: 3,
          interval_unit: "hours",
          run_at: null,
          schedule_mode: "interval",
        }),
      ),
    );
    const updateRequest = updateAutomationProjectMock.mock.calls.at(-1)?.[1];
    expect(updateRequest).not.toHaveProperty("run_config");
  }, 20_000);

  it("creates with visible saved runtime preferences instead of hidden overrides", async () => {
    localStorage.setItem("agent_teams_thinking_enabled", "true");
    localStorage.setItem("agent_teams_thinking_effort", "high");
    renderAutomation();

    fireEvent.click(await screen.findByRole("button", { name: "New automation" }));
    const dialog = await screen.findByRole("dialog", { name: "New automation" });
    expect(within(dialog).getByText("Main Agent")).toBeInTheDocument();
    expect(within(dialog).getByText("AI execution")).toBeInTheDocument();
    expect(within(dialog).getByText("high")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Thinking" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "YOLO" })).toBeChecked();

    fireEvent.change(within(dialog).getByLabelText("Display name"), {
      target: { value: "Preference-aware run" },
    });
    fireEvent.change(within(dialog).getByLabelText("Project ID"), {
      target: { value: "preference_aware" },
    });
    fireEvent.change(within(dialog).getByLabelText("Prompt"), {
      target: { value: "Run with the selected preferences." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createAutomationProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          run_config: {
            execution_mode: "ai",
            normal_root_role_id: "MainAgent",
            orchestration_preset_id: null,
            session_mode: "normal",
            thinking: { effort: "high", enabled: true },
            yolo: true,
          },
        }),
      ),
    );
  });

  it("reads back and explicitly updates the selected runtime contract", async () => {
    getAutomationProjectMock.mockImplementation((projectId) =>
      Promise.resolve(
        automationProject({
          automation_project_id: projectId,
          run_config: {
            execution_mode: "manual",
            normal_root_role_id: null,
            orchestration_preset_id: "release-workflow",
            session_mode: "orchestration",
            thinking: { effort: "high", enabled: true },
            yolo: false,
          },
        }),
      ),
    );
    renderAutomation();

    expect(await screen.findByText("Manual execution")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit" });
    expect(within(dialog).getByText("Orchestration")).toBeInTheDocument();
    expect(within(dialog).getByText("Release workflow")).toBeInTheDocument();
    expect(within(dialog).getByText("Manual execution")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Thinking" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "YOLO" })).not.toBeChecked();

    fireEvent.mouseDown(within(dialog).getByLabelText("Session mode"));
    fireEvent.click(
      await screen.findByText("Normal", {
        selector: ".ant-select-item-option-content",
      }),
    );
    fireEvent.mouseDown(within(dialog).getByLabelText("Root role"));
    fireEvent.click(
      await screen.findByText("Writer", {
        selector: ".ant-select-item-option-content",
      }),
    );
    fireEvent.mouseDown(within(dialog).getByLabelText("Execution mode"));
    fireEvent.click(
      await screen.findByText("AI execution", {
        selector: ".ant-select-item-option-content",
      }),
    );
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Thinking" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "YOLO" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateAutomationProjectMock).toHaveBeenCalledWith(
        "aut-daily",
        expect.objectContaining({
          run_config: {
            execution_mode: "ai",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
            session_mode: "normal",
            thinking: { effort: "high", enabled: false },
            yolo: true,
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit" })).not.toBeInTheDocument(),
    );
    const properties = document.querySelector(".at-automation-properties");
    expect(properties).not.toBeNull();
    const executionRow = within(properties as HTMLElement)
      .getByText("Execution mode")
      .closest(".at-automation-property-row");
    const roleRow = within(properties as HTMLElement)
      .getByText("Root role")
      .closest(".at-automation-property-row");
    expect(executionRow).toHaveTextContent("AI execution");
    expect(roleRow).toHaveTextContent("Writer");
  });

  it("creates a one-shot project without leaking cron or interval fields", async () => {
    renderAutomation();

    fireEvent.click(await screen.findByRole("button", { name: "New automation" }));
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Release reminder" },
    });
    fireEvent.change(screen.getByLabelText("Project ID"), {
      target: { value: "release_reminder" },
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Review the release checklist." },
    });
    fireEvent.mouseDown(screen.getByLabelText("Schedule preset"));
    fireEvent.click(
      await screen.findByText("Runs once", {
        selector: ".ant-select-item-option-content",
      }),
    );
    fireEvent.change(screen.getByLabelText("Run at"), {
      target: { value: "2026-07-12T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createAutomationProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cron_expression: null,
          interval_every: null,
          interval_unit: null,
          run_at: "2026-07-12T09:30",
          schedule_mode: "one_shot",
        }),
      ),
    );
  });
});

function renderAutomation(
  onSessionSelected = vi.fn(),
  onOpenGitHubSettings = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AutomationView
            onOpenGitHubSettings={onOpenGitHubSettings}
            onSessionSelected={onSessionSelected}
          />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  );
}

function deliveryBindingCandidate(
  overrides: Partial<AutomationXiaolubanBindingCandidate>,
): AutomationXiaolubanBindingCandidate {
  return {
    account_id: "xiaoluban-account",
    derived_uid: "daily-room",
    display_name: "Daily room",
    provider: "xiaoluban",
    source_label: "Xiaoluban",
    updated_at: "2026-06-24T06:15:00Z",
    ...overrides,
  };
}

function automationProject(
  overrides: Partial<AutomationProjectRecord>,
): AutomationProjectRecord {
  return {
    active_run_status: null,
    automation_project_id: "aut-daily",
    created_at: "2026-06-24T00:00:00Z",
    cron_expression: "0 9 * * *",
    delivery_binding: {
      account_id: "xiaoluban-account",
      derived_uid: "daily-room",
      display_name: "Daily room",
      provider: "xiaoluban",
      source_label: "Xiaoluban",
    },
    delivery_events: [],
    display_name: "Daily triage",
    interval_every: null,
    interval_unit: null,
    last_error: null,
    last_run_started_at: "2026-06-24T06:10:00Z",
    last_session_id: "session-automation",
    latest_terminal_run_status: "completed",
    latest_terminal_run_verification_status: null,
    name: "daily_triage",
    next_run_at: "2026-06-25T01:00:00Z",
    prompt: "Summarize daily project status.",
    run_at: null,
    run_config: {
      normal_root_role_id: "MainAgent",
      session_mode: "normal",
      yolo: true,
    },
    schedule_mode: "cron",
    status: "enabled",
    timezone: "Asia/Shanghai",
    trigger_id: "schedule-aut-daily",
    updated_at: "2026-06-24T06:15:00Z",
    workspace_id: "workspace-1",
    ...overrides,
  };
}
