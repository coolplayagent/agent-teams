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
