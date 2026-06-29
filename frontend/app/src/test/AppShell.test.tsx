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
  listWorkspaces,
  markSessionTerminalRunViewed,
  saveUiLanguageSettings,
} from "../api/client";
import type { SessionRecord, SessionSidebarRecord } from "../api/contracts";
import { AppShell } from "../features/shell/AppShell";
import type { ActiveSubagentSession } from "../features/sessions/SessionsSidebar";
import { sidebarWidthDefault, useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  fetchUiLanguageSettings: vi.fn(),
  getHealth: vi.fn(),
  getSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listWorkspaces: vi.fn(),
  markSessionTerminalRunViewed: vi.fn(),
  saveUiLanguageSettings: vi.fn(),
}));

vi.mock("../features/composer/Composer", () => ({
  Composer: () => <div data-testid="composer" />,
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
  RecoveryBar: () => <div data-testid="recovery" />,
}));

vi.mock("../features/sessions/SessionsSidebar", () => ({
  SessionsSidebar: ({
    backendStatus,
    navigationItems = [],
    onOpenWorkspaceView,
    onSessionSelected,
    onSubagentSelected,
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
    onOpenWorkspaceView?: () => void;
    onSessionSelected?: () => void;
    onSubagentSelected?: (subagent: ActiveSubagentSession) => void;
  }) => (
    <div data-testid="sessions-sidebar">
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
      <button onClick={onOpenWorkspaceView} type="button">
        Open workspace view
      </button>
      <span
        data-testid="select-session-from-sidebar"
        onClick={onSessionSelected}
      />
      <span
        data-testid="open-subagent-session"
        onClick={() =>
          onSubagentSelected?.({
            createdAt: "2026-06-23T10:02:00Z",
            instanceId: "subagent-instance-1",
            interactive: false,
            lastEventId: 41,
            roleId: "explorer",
            runId: "subagent-run-1",
            runPhase: "running",
            runStatus: "running",
            sessionId: "session-1",
            status: "running",
            subagentKind: "normal",
            title: "Subagent Explorer",
            updatedAt: "2026-06-23T10:03:00Z",
          })
        }
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
    <div aria-label={session?.title ?? selectedSessionId ?? ""}>
      <span>{workspaceLabel}</span>
      <span hidden>{session?.title ?? selectedSessionId ?? ""}</span>
    </div>
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
  SessionTokenUsage: () => <div data-testid="token-usage" />,
}));

vi.mock("../features/sessions/SubagentSessionView", () => ({
  SubagentSessionView: ({
    onBack,
    subagent,
  }: {
    onBack: () => void;
    subagent: ActiveSubagentSession;
  }) => (
    <div data-testid="subagent-session-view">
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
  MessageTimeline: () => <div data-testid="timeline" />,
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
const listWorkspacesMock = vi.mocked(listWorkspaces);
const markSessionTerminalRunViewedMock = vi.mocked(markSessionTerminalRunViewed);
const saveUiLanguageSettingsMock = vi.mocked(saveUiLanguageSettings);

beforeEach(() => {
  window.history.replaceState(null, "", window.location.href);
  mockViewportMatch(false);
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
      title: "Session 1",
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

  it("keeps the workspace title separate from the current session identity", async () => {
    renderShell();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.getByLabelText("Session 1")).toHaveTextContent("Agent Teams");
    expect(screen.getByText("Session 1")).not.toBeVisible();
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
        title: "Session 1",
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

    expect(await screen.findByText("agent-teams")).toBeVisible();
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
        title: "Session 1",
      },
    ]);
    listWorkspacesMock.mockImplementation(
      () => new Promise(() => undefined),
    );
    useUiStore.setState({
      selectedWorkspaceId: "default",
    });

    renderShell();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });

  it("opens the first available session when no session was restored", async () => {
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-first",
        workspace_id: "workspace-1",
        title: "First session",
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
      "Agent Teams",
    );
    await waitFor(() =>
      expect(useUiStore.getState().selectedSessionId).toBe("session-first"),
    );
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith("session-first"));
  });

  it("marks selected terminal runs viewed from sidebar records without masking newer runs", async () => {
    const firstTerminalSession: SessionSidebarRecord = {
      has_unread_terminal_run: true,
      latest_terminal_run_id: "run-1",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
      session_id: "session-1",
      title: "Session 1",
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
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "detail", "session-1"],
    });
  });

  it("keeps the V1 primary sidebar item order", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    const sidebarButtons = within(sidebar)
      .getAllByRole("button")
      .map((button) => button.textContent?.trim() ?? "");

    expect(sidebarButtons.slice(0, 6)).toEqual([
      "SearchCtrl+K",
      "Skills",
      "Automation",
      "Connectors",
      "Board",
      "Memory",
    ]);
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
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();
  });

  it("keeps the primary sidebar entries aligned with V1", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");

    expect(
      within(sidebar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual([
      "Search",
      "Skills",
      "Automation",
      "Connectors",
      "Board",
      "Memory",
      "Open workspace view",
    ]);
    expect(within(sidebar).queryByRole("button", { name: "Chat" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Observability" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Settings" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).getByText("Ctrl+K")).toBeVisible();
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

  it("keeps V1 topbar actions visible in the narrow shell", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");
    expect(within(topbar).getByRole("button", { name: "Settings" })).toBeVisible();
    expect(within(topbar).queryByRole("button", { name: "More actions" })).toBeNull();
    expect(within(topbar).getByRole("link", { name: "V1" })).toBeVisible();
    expect(
      within(topbar).getByRole("button", { name: "Observability" }),
    ).toBeVisible();
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

    fireEvent.click(within(sidebar).getByRole("button", { name: "Search" }));

    expect(await screen.findByTestId("session-search-view")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toBeVisible();
    expect(
      within(screen.getByTestId("session-search-view")).getByText("Session 1"),
    ).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Skills" }));

    expect(await screen.findByTestId("skills-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Automation" }));

    expect(await screen.findByTestId("automation-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Connectors" }));

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Board" }));

    expect(await screen.findByTestId("board-todos-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Memory" }));

    expect(await screen.findByTestId("memory-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    expect(within(sidebar).queryByRole("button", { name: "Observability" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Settings" }))
      .not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Chat" }))
      .not.toBeInTheDocument();
  });

  it("keeps observability and settings top bar shortcuts visible", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    const topbar = htmlElement(document.querySelector(".at-topbar"), "topbar");

    fireEvent.click(within(topbar).getByRole("button", { name: "Observability" }));

    expect(await screen.findByTestId("observability")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(topbar).getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Settings");
  });

  it("opens the real session search surface from the keyboard shortcut", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });

    expect(await screen.findByTestId("session-search-view")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toHaveFocus();
  });

  it("switches shell navigation labels when language changes", async () => {
    renderShell();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    expect(within(sidebar).getByRole("button", { name: "Search" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "搜索" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "技能" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "自动化" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "连接器" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "看板" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "记忆" })).toBeVisible();
    expect(within(sidebar).queryByRole("button", { name: "聊天" }))
      .not.toBeInTheDocument();
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
    expect(document.querySelector(".at-chat-view")).toBeNull();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.getByTestId("timeline").closest(".at-chat-view")).not.toBeNull();
  });

  it("restores the V1 secondary workspace surface after shell reload", async () => {
    window.localStorage.setItem("agentTeams.shellView", "workspace");

    renderShell();

    expect(await screen.findByTestId("workspace-project-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();
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

  it("opens subagent sessions as a secondary workspace surface without right drawer entrypoints", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(screen.getByTestId("open-subagent-session"));

    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();
    expect(screen.getByText("Subagent Explorer")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();
    expect(document.querySelector("#agent-drawer")).toBeNull();
    expect(document.querySelector("#right-rail")).toBeNull();
    expect(document.querySelector(".agent-panel")).toBeNull();

    const sidebar = await screen.findByTestId("sessions-sidebar");
    fireEvent.click(within(sidebar).getByRole("button", { name: "Search" }));

    expect(await screen.findByTestId("session-search-view")).toBeVisible();
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(screen.queryByText("Subagent Explorer")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId("open-subagent-session"));
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
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();
  });

  it("clears the active subagent view when the sidebar returns to chat", async () => {
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    fireEvent.click(screen.getByTestId("open-subagent-session"));
    expect(await screen.findByTestId("subagent-session-view")).toBeVisible();

    fireEvent.click(screen.getByTestId("select-session-from-sidebar"));

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.queryByTestId("subagent-session-view")).not.toBeInTheDocument();
    expect(useUiStore.getState().selectedSessionId).toBe("session-1");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
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
