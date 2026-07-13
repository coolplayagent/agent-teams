import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  fetchUiLanguageSettings,
  getHealth,
  getSession,
  listSidebarSessions,
  listSessionSubagents,
  listWorkspaces,
  markSessionTerminalRunViewed,
  saveUiLanguageSettings,
} from "../api/client";
import type {
  SessionRecord,
  SessionSidebarRecord,
  SessionSubagentRecord,
} from "../api/contracts";
import { ApiError } from "../api/http";
import { AppShell } from "../features/shell/AppShell";
import type { ActiveSubagentSession } from "../features/sessions/SessionsSidebar";
import {
  useRunStreamController,
  type RunStreamController,
} from "../runtime/useRunStreamController";
import { sidebarWidthDefault, useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  fetchUiLanguageSettings: vi.fn(),
  getHealth: vi.fn(),
  getSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listSessionSubagents: vi.fn(),
  listWorkspaces: vi.fn(),
  markSessionTerminalRunViewed: vi.fn(),
  saveUiLanguageSettings: vi.fn(),
}));

vi.mock("../runtime/useRunStreamController", () => ({
  useRunStreamController: vi.fn(),
}));

vi.mock("../runtime/useSessionActivityMonitor", () => ({
  useSessionActivityMonitor: vi.fn(),
}));

vi.mock("../features/composer/Composer", () => ({
  Composer: ({ sessionId }: { sessionId: string | null }) => (
    <div data-session-id={sessionId ?? ""} data-testid="composer" />
  ),
}));

vi.mock("../features/automation/AutomationView", () => ({
  AutomationView: () => <div data-testid="automation-view" />,
}));

vi.mock("../features/boards/BoardTodosView", () => ({
  BoardTodosView: () => <div data-testid="board-todos-view" />,
}));

vi.mock("../features/connectors/ConnectorsView", () => ({
  ConnectorsView: () => <div data-testid="connectors-view" />,
}));

vi.mock("../features/memory/MemoryView", () => ({
  MemoryView: () => <div data-testid="memory-view" />,
}));

vi.mock("../features/skills/SkillsView", () => ({
  SkillsView: () => <div data-testid="skills-view" />,
}));

vi.mock("../features/recovery/RecoveryBar", () => ({
  RecoveryBar: ({ sessionId }: { sessionId: string | null }) => (
    <div data-session-id={sessionId ?? ""} data-testid="recovery" />
  ),
}));

vi.mock("../features/sessions/SessionsSidebar", () => ({
  normalizeSessionSubagent: (
    record: {
      created_at?: string;
      instance_id?: string;
      interactive?: boolean;
      last_event_id?: number;
      role_id?: string;
      run_id?: string;
      run_phase?: string;
      run_status?: string;
      session_id?: string;
      status?: string;
      subagent_instance_id?: string;
      subagent_kind?: string;
      subagent_role_id?: string;
      subagent_run_id?: string;
      title?: string;
      updated_at?: string;
    },
    fallbackSessionId: string,
  ) => {
    const firstTrimmed = (...values: Array<string | undefined>) =>
      values.map((value) => value?.trim() ?? "").find((value) => value.length > 0) ?? "";
    const sessionId = firstTrimmed(record.session_id, fallbackSessionId);
    const instanceId = firstTrimmed(record.subagent_instance_id, record.instance_id);
    const roleId = firstTrimmed(record.subagent_role_id, record.role_id);
    const runId = firstTrimmed(record.subagent_run_id, record.run_id);
    if (!sessionId || !instanceId || !roleId || !runId) {
      return null;
    }
    const status = firstTrimmed(record.status, "idle").toLowerCase();
    return {
      createdAt: firstTrimmed(record.created_at),
      instanceId,
      interactive: record.interactive === true,
      lastEventId:
        typeof record.last_event_id === "number" && record.last_event_id > 0
          ? Math.floor(record.last_event_id)
          : null,
      promptText: "",
      roleId,
      runId,
      runPhase: firstTrimmed(record.run_phase),
      runStatus: firstTrimmed(record.run_status, status).toLowerCase(),
      sessionId,
      status,
      subagentKind: firstTrimmed(record.subagent_kind, "normal"),
      title: firstTrimmed(record.title),
      updatedAt: firstTrimmed(record.updated_at, record.created_at),
    };
  },
  SessionsSidebar: ({
    backendStatus,
    navigationItems = [],
    onOpenNewSession,
    onOpenSessionSearch,
    onOpenWorkspaceView,
    onSessionSelected,
    visuallySelectedSessionId,
  }: {
    backendStatus?: {
      label: string;
      tone: string;
    };
    navigationItems?: Array<{
      active?: boolean;
      key: string;
      label: string;
      onSelect: () => void;
      shortcut?: string;
    }>;
    onOpenSessionSearch?: () => void;
    onOpenNewSession?: () => void;
    onOpenWorkspaceView?: () => void;
    onSessionSelected?: () => void;
    visuallySelectedSessionId?: string | null;
  }) => (
    <div
      data-testid="sessions-sidebar"
      data-visually-selected-session-id={visuallySelectedSessionId ?? ""}
    >
      {navigationItems.map((item) => (
        <button
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          key={item.key}
          onClick={item.onSelect}
          type="button"
        >
          {item.label}
          {item.shortcut !== undefined ? (
            <span aria-hidden="true">{item.shortcut}</span>
          ) : null}
        </button>
      ))}
      <button
        aria-label="Search sessions"
        onClick={onOpenSessionSearch}
        type="button"
      />
      <button onClick={onOpenWorkspaceView} type="button">
        Open workspace view
      </button>
      <span
        data-testid="create-new-session-from-sidebar"
        onClick={onOpenNewSession}
      />
      <span
        data-testid="select-session-from-sidebar"
        onClick={onSessionSelected}
      />
      {backendStatus !== undefined ? (
        <div
          aria-busy={backendStatus.tone === "checking" ? "true" : "false"}
          data-tone={backendStatus.tone}
          role="status"
        >
          {backendStatus.label}
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock("../features/shell/CurrentSessionIndicator", () => ({
  CurrentSessionIndicator: ({
    selectedSessionId,
    session,
    workspaceLabel,
  }: {
    selectedSessionId: string | null;
    session: SessionSidebarRecord | null;
    workspaceLabel: string;
  }) => (
    <div aria-label={session?.metadata?.title ?? selectedSessionId ?? ""}>
      <span title={`${workspaceLabel} · ${session?.metadata?.title ?? selectedSessionId ?? ""}`}>
        {session?.metadata?.title ?? selectedSessionId ?? ""}
      </span>
    </div>
  ),
}));

vi.mock("../features/sessions/NewSessionView", () => ({
  NewSessionView: ({ onCancel }: { onCancel: () => void }) => (
    <section data-testid="new-session-view">
      <button onClick={onCancel} type="button">Cancel new session</button>
    </section>
  ),
}));

vi.mock("../features/shell/MessageExportMenu", () => ({
  MessageExportMenu: () => <button type="button">Export</button>,
  useMessageExporter: () => ({
    exporting: null,
    exportMessages: vi.fn(),
  }),
}));

vi.mock("../features/shell/ObservabilityPanel", () => ({
  ObservabilityPanel: () => <div data-testid="observability" />,
}));

vi.mock("../features/shell/SessionTokenUsage", () => ({
  SessionTokenUsage: ({
    primaryRoleId,
    sessionId,
  }: {
    primaryRoleId: string | null;
    sessionId: string | null;
  }) => (
    <div
      data-primary-role-id={primaryRoleId ?? ""}
      data-session-id={sessionId ?? ""}
      data-testid="token-usage"
    />
  ),
}));

vi.mock("../features/sessions/SubagentSessionView", () => ({
  SubagentSessionView: ({
    onBack,
    subagent,
    visible,
  }: {
    onBack: () => void;
    subagent: ActiveSubagentSession;
    visible?: boolean;
  }) => (
    <div
      data-instance-id={subagent.instanceId}
      data-prompt-text={subagent.promptText}
      data-run-id={subagent.runId}
      data-run-status={subagent.runStatus}
      data-session-id={subagent.sessionId}
      data-testid="subagent-session-view"
      data-visible={visible === true ? "true" : "false"}
    >
      <span>{subagent.title}</span>
      <button onClick={onBack} type="button">
        Back to chat
      </button>
    </div>
  ),
}));

vi.mock("../features/shell/SettingsDrawer", () => ({
  SettingsDrawer: ({ open }: { onClose: () => void; open: boolean }) =>
    open ? <div role="dialog">Settings</div> : null,
}));

vi.mock("../features/timeline/MessageTimeline", () => ({
  MessageTimeline: ({
    onSubagentOpen,
    sessionId,
    workspaceId,
  }: {
    onSubagentOpen?: (subagent: {
      description?: string;
      instanceId?: string;
      prompt?: string;
      roleId?: string;
      runId?: string;
      sessionId: string;
      title?: string;
    }) => void;
    sessionId: string | null;
    workspaceId?: string | null;
  }) => (
    <div
      data-session-id={sessionId ?? ""}
      data-testid="timeline"
      data-workspace-id={workspaceId ?? ""}
    >
      <button
        data-testid="open-subagent-from-timeline"
        onClick={() => {
          const secondSession = sessionId === "session-2";
          onSubagentOpen?.({
            instanceId: secondSession ? "subagent-instance-2" : "subagent-instance-1",
            prompt: secondSession ? "Research second session" : "Explore first session",
            roleId: "explorer",
            runId: secondSession ? "subagent-run-2" : "subagent-run-1",
            sessionId: sessionId ?? "session-1",
            title: secondSession ? "Subagent Research" : "Subagent Explorer",
          });
        }}
        type="button"
      >
        Subagent tool
      </button>
      <button
        data-testid="open-pending-subagent-from-timeline"
        onClick={() => {
          onSubagentOpen?.({
            description: "Explore skills implementation",
            prompt: "Explore skills without editing files.",
            roleId: "explorer",
            runId: "subagent-run-pending",
            sessionId: sessionId ?? "session-1",
            title: "Explore skills implementation",
          });
        }}
        type="button"
      >
        Pending subagent tool
      </button>
    </div>
  ),
}));

vi.mock("../features/workspaces/WorkspaceProjectView", () => ({
  WorkspaceProjectView: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="workspace-project-view">
      <button onClick={onBack} type="button">
        Back to chat
      </button>
    </div>
  ),
}));

const getHealthMock = vi.mocked(getHealth);
const getSessionMock = vi.mocked(getSession);
const fetchUiLanguageSettingsMock = vi.mocked(fetchUiLanguageSettings);
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
const listSessionSubagentsMock = vi.mocked(listSessionSubagents);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const markSessionTerminalRunViewedMock = vi.mocked(markSessionTerminalRunViewed);
const saveUiLanguageSettingsMock = vi.mocked(saveUiLanguageSettings);
const useRunStreamControllerMock = vi.mocked(useRunStreamController);
let runStreamControllerMock: RunStreamController;

beforeEach(() => {
  window.history.replaceState(null, "", window.location.href);
  mockViewportMatch(false);
  runStreamControllerMock = createRunStreamController();
  useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);
  fetchUiLanguageSettingsMock.mockResolvedValue({ language: "en-US" });
  getHealthMock.mockResolvedValue({ status: "ok" });
  getSessionMock.mockResolvedValue({
    session_id: "session-1",
    workspace_id: "workspace-1",
    normal_root_role_id: "MainAgent",
  });
  listSidebarSessionsMock.mockResolvedValue([
    {
      session_id: "session-1",
      workspace_id: "workspace-1",
      metadata: { title: "Session 1" },
    },
  ]);
  listSessionSubagentsMock.mockResolvedValue([
    {
      created_at: "2026-06-23T10:02:00Z",
      instance_id: "subagent-instance-1",
      last_event_id: 41,
      role_id: "explorer",
      run_id: "subagent-run-1",
      run_status: "running",
      session_id: "session-1",
      status: "running",
      subagent_kind: "normal",
      title: "Subagent Explorer",
      updated_at: "2026-06-23T10:03:00Z",
    },
  ]);
  listWorkspacesMock.mockResolvedValue([
    {
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
      display_name: "Agent Teams",
    },
  ]);
  markSessionTerminalRunViewedMock.mockResolvedValue({ status: "ok" });
  saveUiLanguageSettingsMock.mockImplementation(async (settings) => settings);
  useUiStore.setState({
    language: "en",
    selectedSessionId: "session-1",
    selectedWorkspaceId: "workspace-1",
    sidebarCollapsed: false,
    sidebarWidth: sidebarWidthDefault,
    themeMode: "light",
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", window.location.href);
  vi.clearAllMocks();
});

describe("AppShell", () => {
  it("keeps the shell usable while optional sidebar and subagent data is malformed", async () => {
    listSidebarSessionsMock.mockResolvedValue(
      [undefined] as unknown as SessionSidebarRecord[],
    );
    listSessionSubagentsMock.mockResolvedValue(
      [undefined] as unknown as SessionSubagentRecord[],
    );

    renderShell();

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-pending-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toHaveAttribute(
      "data-instance-id",
      "",
    );
  });

  it("toggles the session sidebar without unmounting the workspace", async () => {
    renderShell();

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Close sidebar" }))
      .not.toBeInTheDocument();
    expect(screen.getByTestId("timeline")).toBeVisible();
    expect(screen.getByTestId("timeline").closest(".at-chat-view")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    await waitFor(() =>
      expect(screen.queryByTestId("sessions-sidebar")).toBeNull(),
    );
    expect(screen.getByTestId("timeline")).toBeVisible();
  });

  it("renders the desktop chat as one fixed workspace frame", async () => {
    renderShell();

    const sidebar = htmlElement(
      (await screen.findByTestId("sessions-sidebar")).closest(".at-sidebar"),
      "sidebar",
    );
    const timeline = screen.getByTestId("timeline");
    const workspace = htmlElement(timeline.closest(".at-workspace"), "workspace");
    const chatView = htmlElement(timeline.closest(".at-chat-view"), "chat view");
    const bodyFrame = htmlElement(timeline.closest(".at-body"), "body frame");
    const shell = htmlElement(document.querySelector(".at-shell"), "shell");

    expect(shell).toContainElement(bodyFrame);
    expect(bodyFrame).toContainElement(sidebar);
    expect(bodyFrame).toContainElement(workspace);
    expect(chatView).toContainElement(screen.getByTestId("composer"));
    expect(screen.getByRole("separator", { name: "Resize sidebar" }))
      .toHaveAttribute("aria-valuenow", String(sidebarWidthDefault));
  });

  it("shows the current session identity in the top bar", async () => {
    renderShell();

    expect(await screen.findByText("Session 1")).toBeVisible();
    expect(screen.getByLabelText("Session 1")).toHaveTextContent("Session 1");
    expect(screen.getByText("Session 1")).toHaveAttribute(
      "title",
      "Agent Teams · Session 1",
    );
  });

  it("uses the root folder label for the generic default workspace", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "default",
      normal_root_role_id: "MainAgent",
    });
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-1",
        workspace_id: "default",
        metadata: { title: "Session 1" },
      },
    ]);
    listWorkspacesMock.mockResolvedValue([
      {
        name: "default",
        workspace_id: "default",
        root_path: "C:/work/agent-teams",
      },
    ]);
    useUiStore.setState({
      selectedWorkspaceId: "default",
    });

    renderShell();

    expect(await screen.findByTitle("agent-teams · Session 1")).toBeVisible();
  });

  it("does not expose the generic default workspace id while workspace data loads", async () => {
    getSessionMock.mockResolvedValue({
      session_id: "session-1",
      workspace_id: "default",
      normal_root_role_id: "MainAgent",
    });
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-1",
        workspace_id: "default",
        metadata: { title: "Session 1" },
      },
    ]);
    listWorkspacesMock.mockImplementation(
      () => new Promise(() => undefined),
    );
    useUiStore.setState({
      selectedWorkspaceId: "default",
    });

    renderShell();

    expect(await screen.findByTitle("Agent Teams · Session 1")).toBeVisible();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });

  it("opens the first available session when no session was restored", async () => {
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-first",
        workspace_id: "workspace-1",
        metadata: { title: "First session" },
      },
    ]);
    getSessionMock.mockResolvedValue({
      session_id: "session-first",
      workspace_id: "workspace-1",
      normal_root_role_id: "MainAgent",
    });
    useUiStore.setState({
      selectedSessionId: null,
      selectedWorkspaceId: null,
    });

    renderShell();

    expect(await screen.findByLabelText("First session")).toHaveTextContent(
      "First session",
    );
    await waitFor(() =>
      expect(useUiStore.getState().selectedSessionId).toBe("session-first"),
    );
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-first"));
  });

  it("ignores stale session detail after rapid selection changes", async () => {
    const sessionResolvers = new Map<string, (session: SessionRecord) => void>();
    getSessionMock.mockImplementation(
      (sessionId: string) =>
        new Promise<SessionRecord>((resolve) => {
          sessionResolvers.set(sessionId, resolve);
        }),
    );
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        workspace_id: "workspace-a",
        metadata: { title: "Session A" },
      },
      {
        session_id: "session-b",
        workspace_id: "workspace-b",
        metadata: { title: "Session B" },
      },
    ]);
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-a",
        root_path: "C:/work/a",
        display_name: "Workspace A",
      },
      {
        workspace_id: "workspace-b",
        root_path: "C:/work/b",
        display_name: "Workspace B",
      },
    ]);
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "workspace-a",
    });

    renderShell();

    expect(await screen.findByTestId("timeline")).toHaveAttribute(
      "data-session-id",
      "session-a",
    );
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-a"));

    await act(async () => {
      useUiStore.getState().setSelectedWorkspaceId("workspace-b");
      useUiStore.getState().setSelectedSessionId("session-b");
    });
    expect(await screen.findByTestId("timeline")).toHaveAttribute(
      "data-session-id",
      "session-b",
    );
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-b"));

    await act(async () => {
      useUiStore.getState().setSelectedWorkspaceId("workspace-a");
      useUiStore.getState().setSelectedSessionId("session-a");
    });
    expect(await screen.findByTestId("timeline")).toHaveAttribute(
      "data-session-id",
      "session-a",
    );

    const resolveSessionB = sessionResolvers.get("session-b");
    if (resolveSessionB === undefined) {
      throw new Error("Session B detail query did not start.");
    }
    await act(async () => {
      resolveSessionB({
        normal_root_role_id: "Reviewer",
        session_id: "session-b",
        workspace_id: "workspace-b",
      });
    });

    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-session-id",
      "session-a",
    );
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-workspace-id",
      "workspace-a",
    );
    expect(screen.getByTestId("composer")).toHaveAttribute(
      "data-session-id",
      "session-a",
    );
    expect(screen.getByTestId("token-usage")).not.toHaveAttribute(
      "data-primary-role-id",
      "Reviewer",
    );

    const resolveSessionA = sessionResolvers.get("session-a");
    if (resolveSessionA === undefined) {
      throw new Error("Session A detail query did not start.");
    }
    await act(async () => {
      resolveSessionA({
        normal_root_role_id: "MainAgent",
        session_id: "session-a",
        workspace_id: "workspace-a",
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("token-usage")).toHaveAttribute(
        "data-primary-role-id",
        "MainAgent",
      ),
    );
  });

  it("marks selected terminal runs viewed from sidebar records without masking newer runs", async () => {
    const firstTerminalSession: SessionSidebarRecord = {
      has_unread_terminal_run: true,
      latest_terminal_run_id: "run-1",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
      session_id: "session-1",
      metadata: { title: "Session 1" },
      workspace_id: "workspace-1",
    };
    listSidebarSessionsMock.mockResolvedValue([firstTerminalSession]);
    const queryClient = renderShell();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledWith("session-1"),
    );

    queryClient.setQueryData<SessionSidebarRecord[]>(["sessions", "sidebar"], [
      {
        ...firstTerminalSession,
        has_unread_terminal_run: true,
        latest_terminal_run_id: "run-2",
        latest_terminal_run_updated_at: "2026-06-23T10:01:00Z",
      },
    ]);

    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledTimes(2),
    );
    expect(markSessionTerminalRunViewedMock).toHaveBeenLastCalledWith("session-1");
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("marks the selected terminal run when returning from a subagent view", async () => {
    listSidebarSessionsMock.mockResolvedValue([
      {
        has_unread_terminal_run: true,
        latest_terminal_run_id: "run-subagent-return",
        latest_terminal_run_status: "completed",
        latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
        session_id: "session-1",
        metadata: { title: "Session 1" },
        workspace_id: "workspace-1",
      },
    ]);

    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledWith("session-1"),
    );
  });

  it("does not mark a terminal run for a stale selected session after sidebar hydration", async () => {
    let resolveSidebarSessions:
      | ((sessions: SessionSidebarRecord[]) => void)
      | undefined;
    listSidebarSessionsMock.mockReturnValue(
      new Promise<SessionSidebarRecord[]>((resolve) => {
        resolveSidebarSessions = resolve;
      }),
    );
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-a",
        root_path: "C:/work/a",
        display_name: "Workspace A",
      },
      {
        workspace_id: "workspace-b",
        root_path: "C:/work/b",
        display_name: "Workspace B",
      },
    ]);
    getSessionMock.mockImplementation((sessionId: string) =>
      Promise.resolve({
        normal_root_role_id: sessionId === "session-b" ? "Reviewer" : "MainAgent",
        session_id: sessionId,
        workspace_id: sessionId === "session-b" ? "workspace-b" : "workspace-a",
      }),
    );
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "workspace-a",
    });

    renderShell();

    await act(async () => {
      useUiStore.getState().setSelectedWorkspaceId("workspace-b");
      useUiStore.getState().setSelectedSessionId("session-b");
    });

    if (resolveSidebarSessions === undefined) {
      throw new Error("Sidebar session query did not start.");
    }
    const resolvePendingSidebarSessions = resolveSidebarSessions;
    await act(async () => {
      resolvePendingSidebarSessions([
        {
          has_unread_terminal_run: true,
          latest_terminal_run_id: "run-stale",
          latest_terminal_run_status: "completed",
          latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
          session_id: "session-a",
          metadata: { title: "Session A" },
          workspace_id: "workspace-a",
        },
        {
          session_id: "session-b",
          metadata: { title: "Session B" },
          workspace_id: "workspace-b",
        },
      ]);
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline")).toHaveAttribute(
        "data-session-id",
        "session-b",
      ),
    );
    expect(markSessionTerminalRunViewedMock).not.toHaveBeenCalledWith("session-a");
    expect(markSessionTerminalRunViewedMock).not.toHaveBeenCalled();
  });

  it("lets the server finish one deferred terminal view mark without polling", async () => {
    const firstTerminalSession: SessionSidebarRecord = {
      has_unread_terminal_run: true,
      latest_terminal_run_id: "run-deferred",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
      session_id: "session-1",
      metadata: { title: "Session 1" },
      workspace_id: "workspace-1",
    };
    listSidebarSessionsMock.mockResolvedValue([firstTerminalSession]);
    markSessionTerminalRunViewedMock.mockResolvedValue({ status: "deferred" });
    const queryClient = renderShell();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledTimes(1),
    );

    expect(markSessionTerminalRunViewedMock).toHaveBeenNthCalledWith(
      1,
      "session-1",
    );
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("does not timer-retry a persistently deferred terminal view mark", async () => {
    listSidebarSessionsMock.mockResolvedValue([{
      has_unread_terminal_run: true,
      latest_terminal_run_id: "run-deferred-exhausted",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
      session_id: "session-1",
      metadata: { title: "Session 1" },
      workspace_id: "workspace-1",
    }]);
    markSessionTerminalRunViewedMock.mockResolvedValue({ status: "deferred" });
    const queryClient = renderShell();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledTimes(1),
    );
    expect(markSessionTerminalRunViewedMock).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("invalidates after one failed terminal view mark without timer retry", async () => {
    const firstTerminalSession: SessionSidebarRecord = {
      has_unread_terminal_run: true,
      latest_terminal_run_id: "run-overloaded",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
      session_id: "session-1",
      metadata: { title: "Session 1" },
      workspace_id: "workspace-1",
    };
    listSidebarSessionsMock.mockResolvedValue([firstTerminalSession]);
    markSessionTerminalRunViewedMock.mockRejectedValue(
      new ApiError("Backend overloaded", 503, null),
    );
    const queryClient = renderShell();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() =>
      expect(markSessionTerminalRunViewedMock).toHaveBeenCalledTimes(1),
    );

    expect(markSessionTerminalRunViewedMock).toHaveBeenNthCalledWith(
      1,
      "session-1",
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "detail", "session-1"],
    });
  });

  it("keeps only primary feature destinations in the sidebar navigation", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    const sidebarButtons = within(sidebar)
      .getAllByRole("button")
      .map((button) => button.textContent?.trim() ?? "");

    expect(sidebarButtons.slice(0, 5)).toEqual([
      "Automation",
      "Skills",
      "Board",
      "Connectors",
      "Memory",
    ]);
    expect(within(sidebar).getByRole("button", { name: "Search sessions" }))
      .toBeVisible();
  });

  it("keeps the narrow sidebar visible in the V1 workspace frame", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
    const closeSidebarScrim = screen.getByRole("button", { name: "Close sidebar" });
    expect(closeSidebarScrim).toHaveClass("at-sidebar-scrim");
    expect(closeSidebarScrim).toHaveStyle({
      left: `min(${sidebarWidthDefault}px, calc(100vw - 44px))`,
    });

    fireEvent.click(closeSidebarScrim);

    await waitFor(() =>
      expect(screen.queryByTestId("sessions-sidebar")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("timeline")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close sidebar" })).toHaveClass(
      "at-sidebar-scrim",
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    await waitFor(() =>
      expect(screen.queryByTestId("sessions-sidebar")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("timeline")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
  });

  it("routes narrow sidebar entries without closing the sidebar", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    const sidebar = await screen.findByTestId("sessions-sidebar");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Board" }));

    expect(await screen.findByTestId("board-todos-view")).toBeVisible();
    expect(screen.getByTestId("sessions-sidebar")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();
  });

  it("keeps observability and settings out of the primary sidebar", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");

    expect(
      within(sidebar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual([
      "Automation",
      "Skills",
      "Board",
      "Connectors",
      "Memory",
      "Search sessions",
      "Open workspace view",
    ]);
    expect(within(sidebar).queryByRole("button", { name: "Chat" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Observability" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Settings" }))
      .not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(sidebar).getByRole("status")).toHaveTextContent(
        "Backend connected",
      ),
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "data-tone",
      "online",
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).queryByRole("button", { name: "Backend connected" }))
      .not.toBeInTheDocument();
  });

  it("keeps the sidebar backend status busy only while health initializes", async () => {
    let resolveHealth: (value: { status: string }) => void = () => undefined;
    getHealthMock.mockReturnValue(
      new Promise<{ status: string }>((resolve) => {
        resolveHealth = resolve;
      }),
    );

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    const status = within(sidebar).getByRole("status");
    expect(status).toHaveTextContent("Checking backend");
    expect(status).toHaveAttribute("data-tone", "checking");
    expect(status).toHaveAttribute("aria-busy", "true");

    resolveHealth({ status: "ok" });
    await waitFor(() =>
      expect(within(sidebar).getByRole("status")).toHaveTextContent(
        "Backend connected",
      ),
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "data-tone",
      "online",
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("surfaces backend health failures without falling back to a fake busy state", async () => {
    getHealthMock.mockRejectedValue(new ApiError("Health check failed", 503, null));

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    await waitFor(() =>
      expect(within(sidebar).getByRole("status")).toHaveTextContent(
        "Backend offline",
      ),
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "data-tone",
      "offline",
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "aria-busy",
      "false",
    );

    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).queryByRole("button", { name: "Backend offline" }))
      .not.toBeInTheDocument();
  });

  it("shows reachable non-ok backend statuses in the sidebar", async () => {
    getHealthMock.mockResolvedValue({ status: "starting" });

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    await waitFor(() =>
      expect(within(sidebar).getByRole("status")).toHaveTextContent("starting"),
    );
    expect(within(sidebar).getByRole("status")).toHaveAttribute(
      "data-tone",
      "online",
    );

    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).queryByRole("button", { name: "starting" }))
      .not.toBeInTheDocument();
  });

  it("keeps primary topbar actions visible in the narrow shell", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).getByRole("button", { name: "Settings" })).toBeVisible();
    expect(within(topbar).queryByRole("button", { name: "More actions" })).toBeNull();
    expect(within(topbar).queryByRole("link")).toBeNull();
    expect(
      within(topbar).getByRole("button", { name: "Observability" }),
    ).toBeVisible();
    expect(within(topbar).queryByRole("button", { name: "Backend connected" }))
      .not.toBeInTheDocument();
  });

  it("resizes the sidebar from the keyboard-accessible separator", async () => {
    renderShell();

    const resizer = await screen.findByRole("separator", {
      name: "Resize sidebar",
    });
    expect(resizer).toHaveAttribute("aria-valuenow", String(sidebarWidthDefault));

    fireEvent.keyDown(resizer, { key: "ArrowRight" });

    expect(useUiStore.getState().sidebarWidth).toBe(sidebarWidthDefault + 16);
    await waitFor(() =>
      expect(
        screen.getByRole("separator", { name: "Resize sidebar" }),
      ).toHaveAttribute("aria-valuenow", String(sidebarWidthDefault + 16)),
    );

    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize sidebar" }), {
      key: "ArrowLeft",
    });

    expect(useUiStore.getState().sidebarWidth).toBe(sidebarWidthDefault);
  });

  it("routes primary sidebar navigation to real shell surfaces", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Automation" }));

    expect(await screen.findByTestId("automation-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(screen.getByTestId("select-session-from-sidebar"));

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Skills" }));

    expect(await screen.findByTestId("skills-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Board" }));

    expect(await screen.findByTestId("board-todos-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Search sessions" }),
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(screen.getByTestId("session-search-view")).toBeVisible();
    expect(screen.getByTestId("board-todos-view")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toBeVisible();
    expect(
      within(screen.getByTestId("session-search-view")).getByText("Session 1"),
    ).toBeVisible();
    fireEvent.click(
      within(screen.getByTestId("session-search-view"))
        .getByText("Session 1")
        .closest("button") as HTMLButtonElement,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("timeline")).toBeVisible();
    expect(sidebar).toHaveAttribute(
      "data-visually-selected-session-id",
      "session-1",
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Connectors" }));

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Memory" }));

    expect(await screen.findByTestId("memory-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    fireEvent.click(within(topbar).getByRole("button", { name: "Observability" }));

    expect(await screen.findByTestId("observability")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(within(topbar).getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Settings");
  });

  it("returns from every feature surface without remounting the selected chat", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    const timeline = await screen.findByTestId("timeline");
    const composer = screen.getByTestId("composer");
    const featureDestinations = [
      ["Automation", "automation-view"],
      ["Board", "board-todos-view"],
      ["Connectors", "connectors-view"],
      ["Skills", "skills-view"],
      ["Memory", "memory-view"],
    ] as const;

    for (const [label, testId] of featureDestinations) {
      fireEvent.click(within(sidebar).getByRole("button", { name: label }));
      expect(await screen.findByTestId(testId)).toBeVisible();
      expect(timeline).not.toBeVisible();

      expect(sidebar).toHaveAttribute("data-visually-selected-session-id", "");
      fireEvent.click(screen.getByTestId("select-session-from-sidebar"));

      expect(timeline).toBeVisible();
      expect(screen.getByTestId("timeline")).toBe(timeline);
      expect(screen.getByTestId("composer")).toBe(composer);
      expect(useUiStore.getState().selectedSessionId).toBe("session-1");
      expect(sidebar).toHaveAttribute(
        "data-visually-selected-session-id",
        "session-1",
      );
    }

    fireEvent.click(within(topbar).getByRole("button", { name: "Observability" }));
    expect(await screen.findByTestId("observability")).toBeVisible();
    fireEvent.click(screen.getByTestId("select-session-from-sidebar"));
    expect(screen.getByTestId("timeline")).toBe(timeline);

    fireEvent.click(within(topbar).getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Settings");
    expect(sidebar).toHaveAttribute(
      "data-visually-selected-session-id",
      "session-1",
    );
    fireEvent.click(screen.getByTestId("select-session-from-sidebar"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline")).toBe(timeline);

    expect(runStreamControllerMock.clearRunStream).not.toHaveBeenCalled();
  });

  it("preserves the active foreground stream while visiting a feature surface", async () => {
    runStreamControllerMock = createRunStreamController({
      activeRunId: "run-active",
      activeRunIds: ["run-active"],
      trackedRunIds: ["run-active"],
    });
    useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Skills" }));

    expect(await screen.findByTestId("skills-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();
    expect(runStreamControllerMock.clearRunStream).not.toHaveBeenCalled();
  });

  it("does not poll session detail while a foreground run is active", async () => {
    vi.useFakeTimers();
    try {
      runStreamControllerMock = createRunStreamController({
        activeRunId: "run-active",
        activeRunIds: ["run-active"],
        trackedRunIds: ["run-active"],
      });
      useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);

      const queryClient = renderShell();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getSessionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(getSessionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["sessions", "detail", "session-1"],
        });
      });
      expect(getSessionMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles a foreground stream when the selected session reaches terminal state", async () => {
    runStreamControllerMock = createRunStreamController({
      activeRunId: "run-active",
      activeRunIds: ["run-active"],
      trackedRunIds: ["run-active"],
    });
    useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);
    getSessionMock.mockResolvedValue({
      latest_terminal_run_id: "run-active",
      latest_terminal_run_status: "completed",
      normal_root_role_id: "MainAgent",
      session_id: "session-1",
      workspace_id: "workspace-1",
    });
    listSidebarSessionsMock.mockResolvedValue([
      {
        latest_terminal_run_id: "run-active",
        latest_terminal_run_status: "completed",
        session_id: "session-1",
        metadata: { title: "Session 1" },
        workspace_id: "workspace-1",
      },
    ]);

    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    await waitFor(() =>
      expect(runStreamControllerMock.settleTerminalRunStream).toHaveBeenCalledWith({
        runIds: ["run-active"],
        sessionId: "session-1",
      }),
    );
    expect(runStreamControllerMock.clearRunStream).not.toHaveBeenCalled();
  });

  it("detaches a stale active foreground stream when creating a session from an empty shell", async () => {
    window.localStorage.setItem("agentTeams.shellView", "workspace");
    runStreamControllerMock = createRunStreamController({
      activeRunId: "run-stale",
      activeRunIds: ["run-stale"],
      trackedRunIds: ["run-stale"],
    });
    useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);
    listSidebarSessionsMock.mockResolvedValue([]);
    useUiStore.setState({
      selectedSessionId: null,
      selectedWorkspaceId: "workspace-1",
    });

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();

    fireEvent.click(screen.getByTestId("create-new-session-from-sidebar"));

    expect(await screen.findByTestId("new-session-view")).toBeVisible();
    expect(runStreamControllerMock.clearRunStream).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel new session" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();
  });

  it("detaches the active foreground stream before opening the workspace view", async () => {
    runStreamControllerMock = createRunStreamController({
      activeRunId: "run-active",
      activeRunIds: ["run-active"],
      trackedRunIds: ["run-active"],
    });
    useRunStreamControllerMock.mockReturnValue(runStreamControllerMock);

    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Open workspace view" }),
    );

    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();
    expect(screen.getByTestId("composer")).not.toBeVisible();
    expect(runStreamControllerMock.clearRunStream).not.toHaveBeenCalled();
    expect(useUiStore.getState().selectedSessionId).toBe("session-1");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
  });

  it("keeps observability and settings top bar shortcuts visible", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");

    fireEvent.click(within(topbar).getByRole("button", { name: "Observability" }));

    expect(await screen.findByTestId("observability")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(within(topbar).getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Settings");
  });

  it("opens the real session search surface from the keyboard shortcut", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });

    await waitFor(() =>
      expect(screen.getByTestId("session-search-view")).toBeVisible(),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search sessions" }))
        .toHaveFocus(),
    );
  });

  it("switches shell navigation labels when language changes", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(
      within(sidebar).getByRole("button", { name: "Search sessions" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
    expect(within(sidebar).queryByRole("button", { name: "聊天" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "自动化" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "技能" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "看板" })).toBeVisible();
    expect(
      within(sidebar).getByRole("button", { name: "Search sessions" }),
    ).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "连接器" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "记忆" })).toBeVisible();
    expect(within(sidebar).queryByRole("button", { name: "观测" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "设置" }))
      .not.toBeInTheDocument();
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).getByRole("button", { name: "观测" })).toBeVisible();
    expect(within(topbar).getByRole("button", { name: "设置" })).toBeVisible();
    expect(screen.getByRole("button", { name: "切换侧边栏" })).toBeVisible();
  });

  it("opens and closes the real workspace shell surface from the sidebar", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Open workspace view" }),
    );

    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();
    expect(document.querySelector(".at-chat-view")).not.toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.getByTestId("timeline").closest(".at-chat-view")).not.toBeNull();
  });

  it("restores the V1 secondary workspace surface after shell reload", async () => {
    window.localStorage.setItem("agentTeams.shellView", "workspace");

    renderShell();

    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();
    expect(screen.getByTestId("timeline")).not.toBeVisible();
    expect(window.localStorage.getItem("agentTeams.shellView")).toBe("workspace");
  });

  it("keeps browser back behavior at the shell secondary view boundary", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Open workspace view" }),
    );

    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();

    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { agentTeamsShellView: "chat" },
      }),
    );

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.queryByTestId("workspace-project-view")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("agentTeams.shellView")).toBe("chat");
  });

  it("opens subagent sessions from the timeline tool card in a right-side panel", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));

    const subagentSurface = await screen.findByTestId("subagent-session-view");
    expect(subagentSurface).toBeVisible();
    expect(subagentSurface).toHaveAttribute("data-session-id", "session-1");
    expect(subagentSurface).toHaveAttribute(
      "data-instance-id",
      "subagent-instance-1",
    );
    expect(subagentSurface).toHaveAttribute("data-run-id", "subagent-run-1");
    expect(subagentSurface).toHaveAttribute("data-run-status", "running");
    expect(screen.getByText("Subagent Explorer")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
    expect(screen.getByTestId("composer")).toBeVisible();
    expect(document.querySelector(".at-subagent-side-panel")).not.toBeNull();
    const panelResizer = screen.getByRole("separator", {
      name: "Resize subagent panel",
    });
    expect(panelResizer).toHaveAttribute("aria-valuenow", "560");
    fireEvent.keyDown(panelResizer, { key: "ArrowLeft" });
    expect(panelResizer).toHaveAttribute("aria-valuenow", "584");
    expect(window.localStorage.getItem("agentTeams.subagentPanelWidth")).toBe("584");
    expect(document.querySelector("#agent-drawer")).toBeNull();
    expect(document.querySelector("#right-rail")).toBeNull();
    expect(document.querySelector(".agent-panel")).toBeNull();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Search sessions" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("session-search-view")).toBeVisible(),
    );
    expect(screen.getByTestId("subagent-session-view")).toBeVisible();
    expect(screen.getByText("Subagent Explorer")).toBeVisible();
  });

  it("clamps subagent panel resizing to the available workspace width", async () => {
    const restoreClientWidth = mockClientWidthForClass(
      "at-workspace-chat-shell",
      996,
    );
    try {
      renderShell();

      expect(await screen.findByTestId("timeline")).toBeVisible();
      fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));

      expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
      const panelResizer = screen.getByRole("separator", {
        name: "Resize subagent panel",
      });
      await waitFor(() =>
        expect(panelResizer).toHaveAttribute("aria-valuemax", "508"),
      );

      expect(panelResizer).toHaveAttribute("aria-valuenow", "508");
      fireEvent.keyDown(panelResizer, { key: "ArrowRight" });
      expect(panelResizer).toHaveAttribute("aria-valuenow", "484");
      fireEvent.keyDown(panelResizer, { key: "ArrowLeft" });

      expect(panelResizer).toHaveAttribute("aria-valuenow", "508");
      expect(window.localStorage.getItem("agentTeams.subagentPanelWidth"))
        .toBe("508");
    } finally {
      restoreClientWidth();
    }
  });

  it("resizes the subagent panel from pointer drag using the workspace right edge", async () => {
    const restoreClientWidth = mockClientWidthForClass(
      "at-workspace-chat-shell",
      1200,
    );
    const restoreShellRect = mockBoundingRectForClass("at-workspace-chat-shell", {
      height: 720,
      left: 100,
      top: 0,
      width: 1000,
    });
    try {
      renderShell();

      expect(await screen.findByTestId("timeline")).toBeVisible();
      fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
      expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
      const panelResizer = screen.getByRole("separator", {
        name: "Resize subagent panel",
      });
      expect(panelResizer).toHaveAttribute("aria-valuenow", "560");

      fireEvent.pointerDown(panelResizer, { button: 0, clientX: 540 });
      fireEvent.pointerMove(window, { clientX: 460 });

      expect(panelResizer).toHaveAttribute("aria-valuenow", "640");
      expect(window.localStorage.getItem("agentTeams.subagentPanelWidth"))
        .toBe("640");

      fireEvent.pointerUp(window);
      expect(panelResizer).not.toHaveClass("is-resizing");
    } finally {
      restoreShellRect();
      restoreClientWidth();
    }
  });

  it("opens running subagent timeline cards before backend instance ids hydrate", async () => {
    let resolveSubagents: ((records: SessionSubagentRecord[]) => void) | undefined;
    listSessionSubagentsMock.mockReturnValue(
      new Promise<SessionSubagentRecord[]>((resolve) => {
        resolveSubagents = resolve;
      }),
    );
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-pending-subagent-from-timeline"));

    const subagentSurface = await screen.findByTestId("subagent-session-view");
    expect(subagentSurface).toHaveAttribute("data-session-id", "session-1");
    expect(subagentSurface).toHaveAttribute("data-instance-id", "");
    expect(subagentSurface).toHaveAttribute("data-run-id", "subagent-run-pending");
    expect(subagentSurface).toHaveAttribute("data-run-status", "running");
    expect(screen.getByText("Explore skills implementation")).toBeVisible();

    await waitFor(() =>
      expect(listSessionSubagentsMock).toHaveBeenCalledWith("session-1", true),
    );
    if (resolveSubagents === undefined) {
      throw new Error("Subagent discovery query did not start.");
    }
    const resolveHydratedSubagents = resolveSubagents;
    await act(async () => {
      resolveHydratedSubagents([
        {
          created_at: "2026-06-23T10:02:00Z",
          instance_id: "subagent-instance-running",
          last_event_id: 11,
          role_id: "explorer",
          run_id: "subagent-run-pending",
          run_status: "running",
          session_id: "session-1",
          status: "running",
          subagent_instance_id: "subagent-instance-running",
          subagent_kind: "normal",
          subagent_role_id: "explorer",
          subagent_run_id: "subagent-run-pending",
          title: "Explore skills implementation",
          updated_at: "2026-06-23T10:03:00Z",
        },
      ]);
    });
    await waitFor(() =>
      expect(screen.getByTestId("subagent-session-view")).toHaveAttribute(
        "data-instance-id",
        "subagent-instance-running",
      ),
    );
    expect(screen.getByTestId("subagent-session-view")).toHaveAttribute(
      "data-run-id",
      "subagent-run-pending",
    );
  });

  it("hydrates a pending timeline subagent from activity-driven query invalidation", async () => {
    listSessionSubagentsMock.mockResolvedValueOnce([]);
    const queryClient = renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-pending-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toHaveAttribute(
      "data-instance-id",
      "",
    );
    await waitFor(() =>
      expect(listSessionSubagentsMock).toHaveBeenCalledTimes(1),
    );

    listSessionSubagentsMock.mockResolvedValueOnce([{
      created_at: "2026-06-23T10:02:00Z",
      instance_id: "subagent-instance-event",
      last_event_id: 12,
      role_id: "explorer",
      run_id: "subagent-run-pending",
      run_status: "running",
      session_id: "session-1",
      status: "running",
      subagent_kind: "normal",
      title: "Explore skills implementation",
      updated_at: "2026-06-23T10:03:00Z",
    }]);
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "subagents"],
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("subagent-session-view")).toHaveAttribute(
        "data-instance-id",
        "subagent-instance-event",
      ),
    );
    expect(listSessionSubagentsMock).toHaveBeenCalledTimes(2);
  });

  it("does not reopen a closed subagent when authoritative hydration arrives late", async () => {
    let resolveSubagents: ((records: SessionSubagentRecord[]) => void) | undefined;
    listSessionSubagentsMock.mockReturnValue(
      new Promise<SessionSubagentRecord[]>((resolve) => {
        resolveSubagents = resolve;
      }),
    );
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();

    if (resolveSubagents === undefined) {
      throw new Error("Subagent discovery query did not start.");
    }
    const resolveHydratedSubagents = resolveSubagents;
    await act(async () => {
      resolveHydratedSubagents([
        {
          created_at: "2026-06-23T10:02:00Z",
          instance_id: "subagent-instance-1",
          last_event_id: 12,
          role_id: "explorer",
          run_id: "subagent-run-1",
          run_status: "completed",
          session_id: "session-1",
          status: "completed",
          subagent_instance_id: "subagent-instance-1",
          subagent_kind: "normal",
          subagent_role_id: "explorer",
          subagent_run_id: "subagent-run-1",
          title: "Subagent Explorer",
          updated_at: "2026-06-23T10:03:00Z",
        },
      ]);
      await Promise.resolve();
    });

    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("agentTeams.activeSubagentPanel")).toBeNull();
  });

  it("unmounts a completed subagent surface while retaining cached identity", async () => {
    listSessionSubagentsMock.mockResolvedValue([
      {
        created_at: "2026-06-23T10:02:00Z",
        instance_id: "subagent-instance-1",
        last_event_id: 12,
        role_id: "explorer",
        run_id: "subagent-run-1",
        run_status: "completed",
        session_id: "session-1",
        status: "completed",
        subagent_instance_id: "subagent-instance-1",
        subagent_kind: "normal",
        subagent_role_id: "explorer",
        subagent_run_id: "subagent-run-1",
        title: "Subagent Explorer",
        updated_at: "2026-06-23T10:03:00Z",
      },
    ]);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    const subagentSurface = await screen.findByTestId("subagent-session-view");
    await waitFor(() =>
      expect(subagentSurface).toHaveAttribute("data-run-status", "completed"),
    );
    expect(subagentSurface).toHaveAttribute("data-visible", "true");

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    const reopenedSurface = await screen.findByTestId("subagent-session-view");
    expect(reopenedSurface).not.toBe(subagentSurface);
    expect(reopenedSurface).toBeVisible();
    expect(reopenedSurface).toHaveAttribute("data-visible", "true");
  });

  it("keeps the subagent surface active when pending main session detail resolves", async () => {
    let resolveSession: ((session: SessionRecord) => void) | undefined;
    getSessionMock.mockReturnValue(
      new Promise<SessionRecord>((resolve) => {
        resolveSession = resolve;
      }),
    );

    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();

    if (resolveSession === undefined) {
      throw new Error("Session detail query did not start.");
    }
    const resolvePendingSession = resolveSession;
    await act(async () => {
      resolvePendingSession({
        normal_root_role_id: "MainAgent",
        session_id: "session-1",
        workspace_id: "workspace-1",
      });
    });

    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
    expect(screen.getByText("Subagent Explorer")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
  });

  it("keeps a cross-session subagent selection out of the main chat hydration path", async () => {
    let resolveSession: ((session: SessionRecord) => void) | undefined;
    getSessionMock.mockImplementation(
      (sessionId: string) =>
        new Promise<SessionRecord>((resolve) => {
          resolveSession = resolve;
          if (sessionId !== "session-2") {
            resolve({
              normal_root_role_id: "MainAgent",
              session_id: sessionId,
              workspace_id: "workspace-1",
            });
          }
        }),
    );
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-1",
        workspace_id: "workspace-1",
        metadata: { title: "Session 1" },
      },
      {
        session_id: "session-2",
        workspace_id: "workspace-2",
        metadata: { title: "Session 2" },
      },
    ]);
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/research",
        display_name: "Research",
      },
    ]);
    useUiStore.setState({
      selectedSessionId: "session-2",
      selectedWorkspaceId: "workspace-2",
    });

    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));

    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
    expect(screen.getByText("Subagent Research")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-2"));

    if (resolveSession === undefined) {
      throw new Error("Session detail query did not start.");
    }
    const resolvePendingSession = resolveSession;
    await act(async () => {
      resolvePendingSession({
        normal_root_role_id: "Reviewer",
        session_id: "session-2",
        workspace_id: "workspace-2",
      });
    });

    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
    expect(screen.getByText("Subagent Research")).toBeVisible();
    expect(screen.getByTestId("timeline")).toBeVisible();
    expect(useUiStore.getState().selectedSessionId).toBe("session-2");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-2");
  });

  it("closes the active subagent panel only from its explicit back action", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    const runningSubagentSurface = await screen.findByTestId(
      "subagent-session-view",
    );
    expect(runningSubagentSurface).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.getByTestId("composer")).toHaveAttribute(
      "data-session-id",
      "session-1",
    );
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("agentTeams.activeSubagentPanel")).toBeNull();
    expect(useUiStore.getState().selectedSessionId).toBe("session-1");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");

    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    const reopenedSubagentSurface = await screen.findByTestId(
      "subagent-session-view",
    );
    expect(reopenedSubagentSurface).not.toBe(runningSubagentSurface);
    expect(reopenedSubagentSurface).toBeVisible();
  });

  it("hides the active subagent panel across session switches until reopened from the current timeline", async () => {
    getSessionMock.mockImplementation(async (sessionId: string) => ({
      normal_root_role_id: "MainAgent",
      session_id: sessionId,
      workspace_id: sessionId === "session-2" ? "workspace-2" : "workspace-1",
    }));
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-1",
        workspace_id: "workspace-1",
        metadata: { title: "Session 1" },
      },
      {
        session_id: "session-2",
        workspace_id: "workspace-2",
        metadata: { title: "Session 2" },
      },
    ]);
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/research",
        display_name: "Research",
      },
    ]);

    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));

    const subagentSurface = await screen.findByTestId("subagent-session-view");
    expect(subagentSurface).toHaveAttribute("data-session-id", "session-1");
    expect(subagentSurface).toHaveAttribute(
      "data-instance-id",
      "subagent-instance-1",
    );
    expect(window.localStorage.getItem("agentTeams.activeSubagentPanel")).toContain(
      "subagent-instance-1",
    );

    await act(async () => {
      useUiStore.getState().setSelectedSessionId("session-2");
      useUiStore.getState().setSelectedWorkspaceId("workspace-2");
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline")).toHaveAttribute(
        "data-session-id",
        "session-2",
      ),
    );
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("agentTeams.activeSubagentPanel")).toContain(
      "subagent-instance-1",
    );

    await act(async () => {
      useUiStore.getState().setSelectedSessionId("session-1");
      useUiStore.getState().setSelectedWorkspaceId("workspace-1");
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline")).toHaveAttribute(
        "data-session-id",
        "session-1",
      ),
    );
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("agentTeams.activeSubagentPanel")).toContain(
      "subagent-instance-1",
    );
    fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
    expect(await screen.findByTestId("subagent-session-view")).toHaveAttribute(
      "data-instance-id",
      "subagent-instance-1",
    );
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-session-id",
      "session-1",
    );
  });

  it("keeps subagent re-entry active when delayed main session hydration settles", async () => {
    const animationFrame = captureAnimationFrames();
    let resolveSession: ((session: SessionRecord) => void) | undefined;
    getSessionMock.mockReturnValue(
      new Promise<SessionRecord>((resolve) => {
        resolveSession = resolve;
      }),
    );

    try {
      renderShell();

      expect(await screen.findByTestId("timeline")).toBeVisible();
      fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
      expect(screen.getByText("Starting subagent...")).toBeVisible();
      await act(async () => {
        animationFrame.flushAll();
        await Promise.resolve();
      });
      expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
      expect(screen.getByText("Subagent Explorer")).toBeVisible();

      fireEvent.click(screen.getByTestId("select-session-from-sidebar"));
      expect(await screen.findByTestId("timeline")).toBeVisible();
      expect(screen.queryByText("Loading session...")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("open-subagent-from-timeline"));
      expect(await screen.findByTestId("subagent-session-view")).toBeVisible();

      if (resolveSession === undefined) {
        throw new Error("Session detail query did not start.");
      }
      const resolvePendingSession = resolveSession;
      await act(async () => {
        resolvePendingSession({
          normal_root_role_id: "MainAgent",
          session_id: "session-1",
          workspace_id: "workspace-1",
        });
      });

      expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
      expect(screen.getByText("Subagent Explorer")).toBeVisible();
      expect(screen.getByTestId("timeline")).toBeVisible();
      expect(screen.getByTestId("composer")).toBeVisible();
      expect(animationFrame.pendingCount()).toBeGreaterThanOrEqual(1);
      expect(useUiStore.getState().selectedSessionId).toBe("session-1");
      expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    } finally {
      animationFrame.restore();
    }
  });
});

function renderShell() {
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
        <AntApp>{renderWithStrictModeBoundary(<AppShell />)}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}

function createRunStreamController(
  overrides: Partial<RunStreamController> = {},
): RunStreamController {
  return {
    activeRunId: null,
    activeRunIds: [],
    clearRunStream: vi.fn(),
    setForegroundSessionId: vi.fn(),
    settleTerminalRunStream: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    suppressedRunIds: [],
    trackedRunIds: [],
    ...overrides,
  };
}

function htmlElement(element: Element | null, label: string): HTMLElement {
  if (element instanceof HTMLElement) {
    return element;
  }
  throw new Error(`${label} element not found.`);
}

function mockViewportMatch(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

function mockClientWidthForClass(className: string, width: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains(className)) {
        return width;
      }
      return descriptor?.get?.call(this) ?? 0;
    },
  });
  return () => {
    if (descriptor === undefined) {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      return;
    }
    Object.defineProperty(HTMLElement.prototype, "clientWidth", descriptor);
  };
}

function mockBoundingRectForClass(
  className: string,
  rect: Pick<DOMRect, "height" | "left" | "top" | "width">,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "getBoundingClientRect",
  );
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains(className)) {
        return testDomRect(rect.left, rect.top, rect.width, rect.height);
      }
      return originalGetBoundingClientRect.call(this);
    },
  });
  return () => {
    if (descriptor === undefined) {
      delete (HTMLElement.prototype as { getBoundingClientRect?: () => DOMRect })
        .getBoundingClientRect;
      return;
    }
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", descriptor);
  };
}

function testDomRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON() {
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
      };
    },
  };
}

interface CapturedAnimationFrames {
  readonly flushAll: () => void;
  readonly pendingCount: () => number;
  readonly restore: () => void;
}

function captureAnimationFrames(): CapturedAnimationFrames {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let frameId = 0;

  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    frameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  window.cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });

  return {
    flushAll: () => {
      const pendingCallbacks = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pendingCallbacks) {
        callback(performance.now());
      }
    },
    pendingCount: () => callbacks.size,
    restore: () => {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    },
  };
}
