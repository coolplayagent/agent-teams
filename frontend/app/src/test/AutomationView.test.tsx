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
  disableAutomationProject,
  enableAutomationProject,
  getAutomationProject,
  listAutomationProjects,
  listAutomationProjectSessions,
  listWorkspaces,
  runAutomationProject,
} from "../api/client";
import type { AutomationProjectRecord } from "../api/contracts";
import { AutomationView } from "../features/automation/AutomationView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  disableAutomationProject: vi.fn(),
  enableAutomationProject: vi.fn(),
  getAutomationProject: vi.fn(),
  listAutomationProjectSessions: vi.fn(),
  listAutomationProjects: vi.fn(),
  listWorkspaces: vi.fn(),
  runAutomationProject: vi.fn(),
}));

const disableAutomationProjectMock = vi.mocked(disableAutomationProject);
const enableAutomationProjectMock = vi.mocked(enableAutomationProject);
const getAutomationProjectMock = vi.mocked(getAutomationProject);
const listAutomationProjectSessionsMock = vi.mocked(listAutomationProjectSessions);
const listAutomationProjectsMock = vi.mocked(listAutomationProjects);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const runAutomationProjectMock = vi.mocked(runAutomationProject);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
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
  it("renders real automation projects and selected project detail", async () => {
    renderAutomation();

    expect(await screen.findByRole("button", { name: /Daily triage/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Weekly report/ })).toBeVisible();
    expect(await screen.findByText("Prompt")).toBeVisible();
    expect(screen.getByText("0 9 * * *")).toBeVisible();
    expect(screen.getByText("Daily triage run")).toBeVisible();
    expect(screen.getByText("C:/work/agent-teams")).toBeVisible();
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

  it("runs an automation and opens the returned session", async () => {
    const onSessionSelected = vi.fn();
    renderAutomation(onSessionSelected);

    expect(await screen.findByText("Daily triage")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() =>
      expect(runAutomationProjectMock).toHaveBeenCalledWith("aut-daily"),
    );
    expect(onSessionSelected).toHaveBeenCalledWith("session-automation");
  });

  it("toggles the selected automation through the real status endpoint", async () => {
    renderAutomation();

    expect(await screen.findByText("Daily triage")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(disableAutomationProjectMock).toHaveBeenCalledWith("aut-daily"),
    );
  });
});

function renderAutomation(onSessionSelected = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AutomationView onSessionSelected={onSessionSelected} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  );
}

function automationProject(
  overrides: Partial<AutomationProjectRecord>,
): AutomationProjectRecord {
  return {
    active_run_status: null,
    automation_project_id: "aut-daily",
    created_at: "2026-06-24T00:00:00Z",
    cron_expression: "0 9 * * *",
    delivery_binding: null,
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
