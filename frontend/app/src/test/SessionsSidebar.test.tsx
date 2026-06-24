import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  deleteSession,
  listSidebarSessions,
  listWorkspaces,
  updateSession,
} from "../api/client";
import {
  SessionsSidebar,
  type SidebarNavigationItem,
} from "../features/sessions/SessionsSidebar";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listWorkspaces: vi.fn(),
  updateSession: vi.fn(),
}));

const createSessionMock = vi.mocked(createSession);
const deleteSessionMock = vi.mocked(deleteSession);
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const updateSessionMock = vi.mocked(updateSession);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useUiStore.setState({
    language: "en",
    selectedSessionId: null,
    selectedWorkspaceId: null,
  });
  vi.clearAllMocks();
});

describe("SessionsSidebar", () => {
  it("renders real primary navigation actions and focuses search shortcuts", async () => {
    const openObservability = vi.fn();
    const openWorkspaceView = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({
      navigationItems: [
        {
          key: "observability",
          label: "Observability",
          onSelect: openObservability,
        },
      ],
      onOpenWorkspaceView: openWorkspaceView,
      workspaceViewActive: true,
    });

    expect(await screen.findByText("Workspaces")).toBeVisible();
    expect(await screen.findByText("Alpha")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Observability" }));

    expect(openObservability).toHaveBeenCalledTimes(1);

    const workspaceViewButton = screen.getByRole("button", {
      name: "Open workspace view for Agent Teams",
    });
    expect(workspaceViewButton).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(workspaceViewButton).toBeEnabled());
    fireEvent.click(workspaceViewButton);

    expect(openWorkspaceView).toHaveBeenCalledTimes(1);
    expect(screen.getByText("C:/work/agent-teams")).toBeVisible();

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));

    const searchbox = await screen.findByRole("searchbox", { name: "Search sessions" });
    expect(searchbox).toHaveFocus();
  });

  it("creates a session in the selected workspace and selects it", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([]);
    createSessionMock.mockResolvedValue({
      session_id: "session-new",
      workspace_id: "workspace-1",
    });

    renderSidebar();

    await screen.findByText("Agent Teams");
    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
      }),
    );
    expect(useUiStore.getState().selectedSessionId).toBe("session-new");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
  });

  it("creates a session from a workspace project row", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/desktop",
        display_name: "Desktop",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([]);
    createSessionMock.mockResolvedValue({
      session_id: "session-new",
      workspace_id: "workspace-2",
    });

    renderSidebar();

    await screen.findByText("Desktop");
    fireEvent.click(screen.getByRole("button", {
      name: "New session in Desktop",
    }));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith({
        workspace_id: "workspace-2",
      }),
    );
    expect(useUiStore.getState().selectedSessionId).toBe("session-new");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-2");
  });

  it("renames a session through the real session metadata endpoint", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        metadata: {
          title: "Old readable name",
        },
        session_id: "session-a",
        title: "Legacy title",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);
    updateSessionMock.mockResolvedValue({ status: "ok" });

    renderSidebar();

    expect(await screen.findByText("Old readable name")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Rename session" }));

    const nameInput = await screen.findByRole("textbox", {
      name: "Session name",
    });
    expect(nameInput).toHaveValue("Old readable name");
    fireEvent.change(nameInput, { target: { value: "Next readable name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateSessionMock).toHaveBeenCalledWith("session-a", {
        title: "Next readable name",
      }),
    );
  });

  it("confirms session deletion before calling the cascading delete endpoint", async () => {
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "workspace-1",
    });
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);
    deleteSessionMock.mockResolvedValue({ status: "ok" });

    renderSidebar();

    expect(await screen.findByText("Alpha")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete session" }));

    expect(deleteSessionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Delete Alpha/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteSessionMock).toHaveBeenCalledWith("session-a", {
        cascade: true,
        force: true,
      }),
    );
    expect(useUiStore.getState().selectedSessionId).toBeNull();
  });

  it("localizes the persistent sidebar frame in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({
      onOpenWorkspaceView: vi.fn(),
    });

    expect(await screen.findByText("工作空间")).toBeVisible();
    expect(screen.getByRole("button", { name: "新建会话" })).toBeVisible();
    expect(screen.queryByRole("searchbox", { name: "搜索会话" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "筛选会话" }));
    expect(screen.getByRole("searchbox", { name: "搜索会话" })).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新会话" })).toBeVisible();
    expect(await screen.findByRole("button", {
      name: "打开 Agent Teams 的工作区视图",
    })).toBeVisible();
  });

  it("ignores a stale stored workspace id when creating a session", async () => {
    useUiStore.setState({
      selectedWorkspaceId: "missing-workspace",
    });
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([]);
    createSessionMock.mockResolvedValue({
      session_id: "session-new",
      workspace_id: "workspace-1",
    });

    renderSidebar();

    await screen.findByText("Agent Teams");
    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
      }),
    );
    expect(createSessionMock).not.toHaveBeenCalledWith({
      workspace_id: "missing-workspace",
    });
  });

  it("renders compact session status, background work, and update time", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        active_run_status: "running",
        background_task_count: 2,
        metadata: {
          title: "Readable running session",
        },
        pending_tool_approval_count: 1,
        pending_user_question_count: 1,
        session_id: "session-running",
        title: "Legacy title",
        updated_at: "2026-06-23T00:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Readable running session")).toBeVisible();
    expect(screen.queryByText("Legacy title")).not.toBeInTheDocument();
    expect(screen.getByText("running")).toHaveAttribute(
      "title",
      "Run status: running",
    );
    expect(screen.getByText("bg 2")).toHaveAttribute(
      "title",
      "2 background tasks",
    );
    expect(screen.getByText("ap 1")).toHaveAttribute(
      "title",
      "1 pending approvals",
    );
    expect(screen.getByText("q 1")).toHaveAttribute(
      "title",
      "1 pending questions",
    );
    expect(screen.getByTitle("2026-06-23T00:00:00Z")).toBeVisible();
  });

  it("groups sessions by workspace and switches workspace with the selected session", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/desktop",
        display_name: "Desktop",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-b",
        title: "Beta",
        updated_at: "2026-06-23T11:00:00Z",
        workspace_id: "workspace-2",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.getByText("Desktop")).toBeVisible();
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

    expect(useUiStore.getState().selectedSessionId).toBe("session-b");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-2");
  });

  it("filters sessions by workspace label without showing empty workspace groups", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/desktop",
        display_name: "Desktop",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-b",
        title: "Beta",
        updated_at: "2026-06-23T11:00:00Z",
        workspace_id: "workspace-2",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Agent Teams")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Filter sessions" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "desktop" },
    });

    expect(screen.getByText("Desktop")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.queryByText("Agent Teams")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("collapses workspace groups while keeping search results visible", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-b",
        title: "Beta",
        updated_at: "2026-06-23T11:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Alpha")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Agent Teams" }));

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Agent Teams" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter sessions" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "alpha" },
    });

    expect(await screen.findByText("Alpha")).toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse Agent Teams" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("limits large workspace groups until the user asks for more sessions", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, index) => ({
        session_id: `session-visible-${index}`,
        title: `Visible session ${index + 1}`,
        updated_at: `2026-06-23T10:${String(index).padStart(2, "0")}:00Z`,
        workspace_id: "workspace-1",
      })),
      {
        session_id: "session-hidden-1",
        title: "Hidden session 1",
        updated_at: "2026-06-23T09:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-hidden-2",
        title: "Hidden session 2",
        updated_at: "2026-06-23T08:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Visible session 10")).toBeVisible();
    expect(screen.queryByText("Hidden session 1")).not.toBeInTheDocument();
    expect(screen.getByText("10/12")).toBeVisible();

    fireEvent.click(screen.getByRole("button", {
      name: "Show more sessions in Agent Teams",
    }));

    expect(await screen.findByText("Hidden session 1")).toBeVisible();
    expect(screen.getByText("Hidden session 2")).toBeVisible();
  });

  it("keeps filtered workspace results uncapped", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        session_id: `session-result-${index}`,
        title: `Filtered result ${String(index + 1).padStart(2, "0")}`,
        updated_at: `2026-06-23T10:${String(index).padStart(2, "0")}:00Z`,
        workspace_id: "workspace-1",
      })),
    );

    renderSidebar();

    expect(await screen.findByText("Filtered result 12")).toBeVisible();
    expect(screen.queryByText("Filtered result 01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter sessions" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "filtered" },
    });

    expect(await screen.findByText("Filtered result 01")).toBeVisible();
    expect(screen.getByText("Filtered result 02")).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Show more sessions in Agent Teams",
    })).not.toBeInTheDocument();
  });
});

function renderSidebar(props?: {
  navigationItems?: SidebarNavigationItem[];
  onOpenWorkspaceView?: () => void;
  onSessionSelected?: () => void;
  workspaceViewActive?: boolean;
}) {
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
      <ConfigProvider>
        <AntApp>
          <SessionsSidebar
            navigationItems={props?.navigationItems}
            onOpenWorkspaceView={props?.onOpenWorkspaceView}
            onSessionSelected={props?.onSessionSelected}
            workspaceViewActive={props?.workspaceViewActive}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
