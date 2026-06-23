import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  listSidebarSessions,
  listWorkspaces,
} from "../api/client";
import { SessionsSidebar } from "../features/sessions/SessionsSidebar";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  createSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listWorkspaces: vi.fn(),
}));

const createSessionMock = vi.mocked(createSession);
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
const listWorkspacesMock = vi.mocked(listWorkspaces);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useUiStore.setState({
    selectedSessionId: null,
    selectedWorkspaceId: null,
  });
  vi.clearAllMocks();
});

describe("SessionsSidebar", () => {
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
        pending_tool_approval_count: 1,
        pending_user_question_count: 1,
        session_id: "session-running",
        title: "Running session",
        updated_at: "2026-06-23T00:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Running session")).toBeVisible();
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

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "desktop" },
    });

    expect(screen.getByText("Desktop")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.queryByText("Agent Teams")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});

function renderSidebar() {
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
          <SessionsSidebar />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
