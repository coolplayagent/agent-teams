import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import {
  createSession,
  deleteWorkspace,
  deleteSession,
  listSidebarSessions,
  listSessionSubagents,
  listWorkspaces,
  pickWorkspace,
  updateSession,
} from "../api/client";
import {
  SessionsSidebar,
  type ActiveSubagentSession,
  type SidebarBackendStatus,
  type SidebarNavigationItem,
} from "../features/sessions/SessionsSidebar";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  createSession: vi.fn(),
  deleteWorkspace: vi.fn(),
  deleteSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listSessionSubagents: vi.fn(),
  listWorkspaces: vi.fn(),
  pickWorkspace: vi.fn(),
  updateSession: vi.fn(),
}));

const createSessionMock = vi.mocked(createSession);
const deleteWorkspaceMock = vi.mocked(deleteWorkspace);
const deleteSessionMock = vi.mocked(deleteSession);
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
const listSessionSubagentsMock = vi.mocked(listSessionSubagents);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const pickWorkspaceMock = vi.mocked(pickWorkspace);
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
  it("does not recompute session timestamps for an unrelated parent update", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        session_id: `session-${index}`,
        title: `Session ${index}`,
        updated_at: "2026-07-12T01:00:00Z",
        workspace_id: "workspace-1",
      })),
    );
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-07-12T02:00:00Z"));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });

    function ParentWithUnrelatedState() {
      const [counter, setCounter] = useState(0);
      return (
        <>
          <button onClick={() => setCounter((current) => current + 1)}>
            Parent update {counter}
          </button>
          <SessionsSidebar />
        </>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <ParentWithUnrelatedState />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Session 0")).toBeVisible();
    await waitFor(() => expect(nowSpy.mock.calls.length).toBeGreaterThanOrEqual(10));
    const timestampComputationsAfterLoad = nowSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Parent update 0" }));

    expect(screen.getByRole("button", { name: "Parent update 1" })).toBeVisible();
    // jsdom may sample Date.now once while dispatching the click itself. Rendering
    // the ten session rows would add at least ten further timestamp computations.
    expect(nowSpy.mock.calls.length - timestampComputationsAfterLoad).toBeLessThanOrEqual(1);
    nowSpy.mockRestore();
  });

  it("keeps V1 frame details without adding primary navigation entries", async () => {
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
      backendStatus: {
        label: "Backend connected",
        tone: "online",
      },
      navigationItems: [
        {
          key: "search",
          label: "Search",
          onSelect: vi.fn(),
          shortcut: "Ctrl+K",
        },
      ],
    });

    expect(await screen.findByText("Workspaces")).toBeVisible();
    expect(screen.getByRole("button", { name: "New project" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sort by project update" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Filter sessions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh sessions" }),
    ).not.toBeInTheDocument();
    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(
      within(navigation).getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["SearchCtrl+K"]);
    expect(within(navigation).getByRole("button", { name: "Search" })).toBeVisible();
    expect(within(navigation).getByText("Ctrl+K")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    expect(screen.getByRole("status")).toHaveClass("is-online");
  });

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
    expect(screen.getByRole("button", { name: "Collapse Agent Teams" }))
      .toHaveAttribute("aria-description", "C:/work/agent-teams");

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));

    const searchbox = await screen.findByRole("searchbox", { name: "Search sessions" });
    await waitFor(() => expect(searchbox).toHaveFocus());
  });

  it("places the dedicated session search action beside new session", async () => {
    const openSessionSearch = vi.fn();
    const openNewSession = vi.fn();
    listWorkspacesMock.mockResolvedValue([{
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
    }]);

    renderSidebar({
      onOpenNewSession: openNewSession,
      onOpenSessionSearch: openSessionSearch,
    });

    const newSession = await screen.findByRole("button", { name: "New session" });
    const search = screen.getByRole("button", { name: "Search sessions" });
    expect(newSession.parentElement).toHaveClass("at-sidebar-primary-actions");
    expect(search.parentElement).toBe(newSession.parentElement);

    await waitFor(() => expect(newSession).toBeEnabled());
    fireEvent.click(newSession);
    expect(openNewSession).toHaveBeenCalledTimes(1);

    fireEvent.click(search);

    expect(openSessionSearch).toHaveBeenCalledTimes(1);
  });

  it("recovers the complete workspace and session inventory after a load failure", async () => {
    listWorkspacesMock
      .mockRejectedValueOnce(new Error("workspace offline"))
      .mockResolvedValue([
        {
          workspace_id: "workspace-1",
          root_path: "C:/work/agent-teams",
          display_name: "Agent Teams",
        },
      ]);
    listSidebarSessionsMock
      .mockRejectedValueOnce(new Error("sessions offline"))
      .mockResolvedValue([
        {
          session_id: "session-a",
          title: "Recovered session",
          updated_at: "2026-06-23T10:00:00Z",
          workspace_id: "workspace-1",
        },
      ]);

    renderSidebar();

    expect(await screen.findByText("Could not load sessions")).toBeVisible();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeVisible();
    fireEvent.click(retry);

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(await screen.findByText("Recovered session")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText("Could not load sessions")).not.toBeInTheDocument(),
    );
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    expect(listSidebarSessionsMock).toHaveBeenCalledTimes(2);
  });

  it("keeps sessions usable when only workspace metadata fails", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("workspace offline"));
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Fallback session",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Could not load workspaces")).toBeVisible();
    expect(screen.getByText("Fallback session")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("keeps workspace headers visually separate from selected sessions", async () => {
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

    renderSidebar();

    const workspaceHeader = (await screen.findByText("Agent Teams")).closest(
      ".at-workspace-group-header",
    );
    const selectedSession = screen.getByText("Alpha").closest(".at-session-item");

    expect(workspaceHeader).not.toHaveClass("is-selected");
    expect(selectedSession).toHaveClass("is-selected");
    const metaSlot = selectedSession?.querySelector(".at-session-meta-slot");
    expect(metaSlot?.querySelector(".at-session-time")).toHaveTextContent(/\S+/);
    expect(metaSlot?.querySelector(".at-session-actions")).toBeInTheDocument();
    expect(metaSlot?.querySelector(".at-session-actions")?.parentElement)
      .toBe(metaSlot);
  });

  it("retains selected session state without visually selecting it in a feature view", async () => {
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "workspace-1",
    });
    listWorkspacesMock.mockResolvedValue([{
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
      display_name: "Agent Teams",
    }]);
    listSidebarSessionsMock.mockResolvedValue([{
      session_id: "session-a",
      title: "Alpha",
      updated_at: "2026-06-23T10:00:00Z",
      workspace_id: "workspace-1",
    }]);

    renderSidebar({ visuallySelectedSessionId: null });

    const sessionButton = await screen.findByRole("button", { name: "Alpha" });
    const sessionRow = sessionButton.closest(".at-session-item");
    expect(sessionRow).not.toHaveClass("is-selected");
    expect(sessionButton).not.toHaveAttribute("aria-current");
    expect(useUiStore.getState().selectedSessionId).toBe("session-a");
  });

  it("scrolls the selected session into the visible sidebar list", async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn(
      (_options?: boolean | ScrollIntoViewOptions) => undefined,
    );
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      useUiStore.setState({
        selectedSessionId: "session-c",
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
        {
          session_id: "session-b",
          title: "Beta",
          updated_at: "2026-06-23T10:01:00Z",
          workspace_id: "workspace-1",
        },
        {
          session_id: "session-c",
          title: "Gamma",
          updated_at: "2026-06-23T10:02:00Z",
          workspace_id: "workspace-1",
        },
      ]);

      renderSidebar();

      const selectedSession = (await screen.findByText("Gamma")).closest(
        ".at-session-item",
      );
      expect(selectedSession).toHaveClass("is-selected");
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }),
      );
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("labels the generic default workspace by its root folder like V1", async () => {
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "default",
    });
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "default",
        root_path: "C:/work/agent-teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "default",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("agent-teams")).toBeVisible();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New session in agent-teams" }),
    ).toBeVisible();
  });

  it("does not expose the generic default workspace id before workspaces load", async () => {
    useUiStore.setState({
      selectedSessionId: "session-a",
      selectedWorkspaceId: "default",
    });
    listWorkspacesMock.mockImplementation(
      () => new Promise(() => undefined),
    );
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-a",
        title: "Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "default",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New session in Agent Teams" }),
    ).toBeVisible();
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

  it("carries the selected normal model profile into new sessions", async () => {
    useUiStore.setState({
      selectedSessionId: "session-current",
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
        session_id: "session-current",
        title: "Current session",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);
    createSessionMock.mockResolvedValue({
      session_id: "session-new",
      workspace_id: "workspace-1",
      normal_model_profile: "precise",
    });

    const queryClient = renderSidebar();
    queryClient.setQueryData(["sessions", "detail", "session-current"], {
      session_id: "session-current",
      workspace_id: "workspace-1",
      normal_model_profile: "precise",
    });

    await screen.findByText("Agent Teams");
    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith({
        normal_model_profile: "precise",
        workspace_id: "workspace-1",
      }),
    );
    expect(useUiStore.getState().selectedSessionId).toBe("session-new");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
  });

  it("adds a picked project through the V1 workspace toolbar action", async () => {
    const initialWorkspace = {
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
      display_name: "Agent Teams",
    };
    const pickedWorkspace = {
      workspace_id: "workspace-2",
      root_path: "C:/work/desktop",
      display_name: "Desktop",
    };
    listWorkspacesMock
      .mockResolvedValueOnce([initialWorkspace])
      .mockResolvedValue([initialWorkspace, pickedWorkspace]);
    listSidebarSessionsMock.mockResolvedValue([]);
    pickWorkspaceMock.mockResolvedValue({
      workspace: pickedWorkspace,
    });

    renderSidebar();

    await screen.findByText("Agent Teams");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));

    await waitFor(() => expect(pickWorkspaceMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Desktop")).toBeVisible();
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-2");
  });

  it("sorts projects from the V1 workspace toolbar menu", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/desktop",
        display_name: "Desktop",
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
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

    renderSidebar();

    const agentTeams = await screen.findByText("Agent Teams");
    const desktop = screen.getByText("Desktop");
    expect(appearsBefore(agentTeams, desktop)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Sort by project update" }));
    fireEvent.click(await screen.findByText("Sort by project creation"));

    await waitFor(() =>
      expect(
        appearsBefore(screen.getByText("Desktop"), screen.getByText("Agent Teams")),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: "Sort by project creation" }),
    ).toBeVisible();
  });

  it("restores the V1 chronological sessions mode without workspace cards", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/desktop",
        display_name: "Desktop",
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-old",
        title: "Older Alpha",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-new",
        title: "Newer Beta",
        updated_at: "2026-06-23T11:00:00Z",
        workspace_id: "workspace-2",
      },
    ]);

    renderSidebar();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sort by project update" }));

    expect(await screen.findByText("Sort by project creation")).toBeInTheDocument();
    expect(screen.getByText("Sort by project update")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Chronological sessions"));

    expect(
      await screen.findByRole("button", { name: "Chronological sessions" }),
    ).toBeVisible();
    expect(screen.getByText("Sessions")).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "New session in Agent Teams",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "New session in Desktop",
      }),
    ).not.toBeInTheDocument();
    expect(
      appearsBefore(screen.getByText("Newer Beta"), screen.getByText("Older Alpha")),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Newer Beta" }));

    expect(useUiStore.getState().selectedSessionId).toBe("session-new");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-2");
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

    let nameInput = await screen.findByRole("textbox", {
      name: "Session name",
    });
    let editedRow = nameInput.closest(".at-session-item");
    expect(editedRow).toHaveClass("is-editing");
    expect(within(editedRow as HTMLElement).getByRole("button", { name: "Cancel" }))
      .toBeVisible();
    expect(within(editedRow as HTMLElement).getByRole("button", { name: "Save" }))
      .toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(nameInput).toHaveValue("Old readable name");

    fireEvent.keyDown(nameInput, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Session name" }))
        .not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename session" }))
        .toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Rename session" }));
    nameInput = await screen.findByRole("textbox", { name: "Session name" });
    editedRow = nameInput.closest(".at-session-item");
    fireEvent.change(nameInput, { target: { value: "Next readable name" } });
    fireEvent.click(within(editedRow as HTMLElement).getByRole("button", { name: "Save" }));

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
      {
        session_id: "session-b",
        title: "Beta",
        updated_at: "2026-06-23T09:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);
    let resolveDelete: ((value: { status: string }) => void) | undefined;
    deleteSessionMock.mockReturnValue(new Promise((resolve) => {
      resolveDelete = resolve;
    }));

    const queryClient = renderSidebar();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    expect(await screen.findByText("Alpha")).toBeVisible();
    let alphaRow = screen.getByText("Alpha").closest(".at-session-item");
    fireEvent.click(within(alphaRow as HTMLElement)
      .getByRole("button", { name: "Delete session" }));

    expect(deleteSessionMock).not.toHaveBeenCalled();
    let deletingRow = screen.getByText("Alpha").closest(".at-session-item");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletingRow).toHaveClass("is-confirming");
    expect(within(deletingRow as HTMLElement).getByRole("button", { name: "Cancel" }))
      .toBeVisible();
    fireEvent.click(within(deletingRow as HTMLElement)
      .getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(within(screen.getByText("Alpha").closest(".at-session-item") as HTMLElement)
        .getByRole("button", { name: "Delete session" }))
        .toHaveFocus(),
    );
    expect(deleteSessionMock).not.toHaveBeenCalled();

    alphaRow = screen.getByText("Alpha").closest(".at-session-item");
    fireEvent.click(within(alphaRow as HTMLElement)
      .getByRole("button", { name: "Delete session" }));
    deletingRow = screen.getByText("Alpha").closest(".at-session-item");
    fireEvent.click(within(deletingRow as HTMLElement).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(within(deletingRow as HTMLElement)
        .getByRole("button", { name: "Delete" })).toBeDisabled(),
    );
    const otherRow = screen.getByText("Beta").closest(".at-session-item");
    expect(within(otherRow as HTMLElement)
      .getByRole("button", { name: "Rename session" })).toBeEnabled();

    if (resolveDelete === undefined) {
      throw new Error("Delete mutation did not start.");
    }
    await act(async () => resolveDelete?.({ status: "ok" }));

    await waitFor(() =>
      expect(deleteSessionMock).toHaveBeenCalledWith("session-a", {
        cascade: true,
        force: true,
      }),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "detail", "session-a"],
    });
    expect(useUiStore.getState().selectedSessionId).toBeNull();
  });

  it("confirms workspace removal without deleting the local directory by default", async () => {
    useUiStore.setState({
      selectedWorkspaceId: "workspace-1",
    });
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
      {
        workspace_id: "workspace-2",
        root_path: "C:/work/extra-project",
        display_name: "Extra Project",
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
    deleteWorkspaceMock.mockResolvedValue({ status: "ok" });

    renderSidebar();

    expect(await screen.findByText("Extra Project")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove workspace Extra Project" }),
    );

    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const workspaceHeader = screen.getByText("Extra Project")
      .closest(".at-workspace-group-header");
    expect(within(workspaceHeader as HTMLElement)
      .getByLabelText("Also remove the workspace directory"))
      .not.toBeChecked();
    expect(within(workspaceHeader as HTMLElement)
      .getByRole("button", { name: "Cancel" })).toBeVisible();
    fireEvent.click(within(workspaceHeader as HTMLElement)
      .getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2", {
        removeDirectory: false,
      }),
    );
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
    expect(screen.getByRole("button", { name: "新建项目" })).toBeVisible();
    expect(screen.getByRole("button", { name: "按项目更新时间" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "按项目更新时间" }));
    expect(await screen.findByText("按项目创建时间")).toBeInTheDocument();
    expect(screen.getByText("按时间顺序")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "搜索会话" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "筛选会话" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新会话" })).not.toBeInTheDocument();
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
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(screen.getByTitle("Running")).toHaveClass(
      "at-session-run-indicator",
      "is-running",
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

  it("uses V1-style terminal run indicators in the session status slot", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        active_run_status: "queued",
        session_id: "session-queued",
        title: "Queued session",
        updated_at: "2026-06-23T10:30:00Z",
        workspace_id: "workspace-1",
      },
      {
        active_run_status: "stopping",
        session_id: "session-stopping",
        title: "Stopping session",
        updated_at: "2026-06-23T10:15:00Z",
        workspace_id: "workspace-1",
      },
      {
        active_run_status: "failed",
        session_id: "session-failed",
        title: "Failed session",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        active_run_status: "stopped",
        session_id: "session-stopped",
        title: "Stopped session",
        updated_at: "2026-06-23T09:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        has_unread_terminal_run: true,
        latest_terminal_run_id: "run-completed",
        latest_terminal_run_status: "completed",
        latest_terminal_run_updated_at: "2026-06-23T08:30:00Z",
        session_id: "session-unread",
        title: "Unread terminal session",
        updated_at: "2026-06-23T08:30:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    const failedRow = (await screen.findByText("Failed session")).closest(
      ".at-session-item",
    );
    const queuedRow = screen.getByText("Queued session").closest(
      ".at-session-item",
    );
    const stoppingRow = screen.getByText("Stopping session").closest(
      ".at-session-item",
    );
    const stoppedRow = screen.getByText("Stopped session").closest(
      ".at-session-item",
    );
    const unreadRow = screen.getByText("Unread terminal session").closest(
      ".at-session-item",
    );

    expect(queuedRow).toHaveClass("has-run-indicator-running");
    expect(stoppingRow).toHaveClass("has-run-indicator-running");
    expect(failedRow).toHaveClass("has-run-indicator-failed");
    expect(stoppedRow).toHaveClass("has-run-indicator-stopped");
    expect(unreadRow).toHaveClass("has-run-indicator-unread");
    expect(screen.getAllByTitle("Running")).toHaveLength(2);
    expect(screen.getByTitle("Run failed")).toHaveClass("is-failed");
    expect(screen.getByTitle("Run stopped")).toHaveClass("is-stopped");
    expect(screen.getByTitle("Unread terminal run")).toHaveClass("is-unread");
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
    expect(screen.queryByText("stopped")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("suppresses stale unread terminal indicators for the selected session", async () => {
    useUiStore.setState({
      selectedSessionId: "session-selected",
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
        has_unread_terminal_run: true,
        latest_terminal_run_id: "run-failed",
        latest_terminal_run_status: "failed",
        latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
        session_id: "session-selected",
        title: "Current task",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar();

    const selectedRow = (await screen.findByText("Current task")).closest(
      ".at-session-item",
    );
    expect(selectedRow).toHaveClass("is-selected");
    expect(selectedRow).not.toHaveClass("has-run-indicator-unread");
    expect(screen.queryByTitle("Unread terminal run")).not.toBeInTheDocument();
  });

  it("clears the unread terminal indicator immediately when selecting that session", async () => {
    const onSessionSelected = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        has_unread_terminal_run: true,
        latest_terminal_run_id: "run-completed",
        latest_terminal_run_status: "completed",
        latest_terminal_run_updated_at: "2026-06-23T10:00:00Z",
        session_id: "session-unread",
        title: "Finished task",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-current",
        title: "Current task",
        updated_at: "2026-06-23T09:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({ onSessionSelected });

    const unreadRow = (await screen.findByText("Finished task")).closest(
      ".at-session-item",
    );
    expect(unreadRow).toHaveClass("has-run-indicator-unread");

    fireEvent.click(screen.getByRole("button", { name: "Finished task" }));

    expect(unreadRow).toHaveClass("is-selected");
    expect(unreadRow).not.toHaveClass("has-run-indicator-unread");
    expect(screen.queryByTitle("Unread terminal run")).not.toBeInTheDocument();
    expect(useUiStore.getState().selectedSessionId).toBe("session-unread");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    expect(onSessionSelected).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("keeps the latest rapid session click selected", async () => {
    const onSessionSelected = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-11",
        title: "Session 11",
        updated_at: "2026-06-23T10:11:00Z",
        workspace_id: "workspace-1",
      },
      {
        session_id: "session-10",
        title: "Session 10",
        updated_at: "2026-06-23T10:10:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({ onSessionSelected });

    const firstRow = (await screen.findByText("Session 11")).closest(
      ".at-session-item",
    );
    const secondRow = screen.getByText("Session 10").closest(".at-session-item");

    fireEvent.click(screen.getByRole("button", { name: "Session 11" }));
    fireEvent.click(screen.getByRole("button", { name: "Session 10" }));

    expect(firstRow).not.toHaveClass("is-selected");
    expect(secondRow).toHaveClass("is-selected");
    expect(useUiStore.getState().selectedSessionId).toBe("session-10");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    expect(onSessionSelected).toHaveBeenCalledTimes(2);
  });

  it("does not render subagent directory controls in the session list", async () => {
    const onSessionSelected = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-parent",
        subagent_count: 3,
        title: "Parent session",
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({ onSessionSelected });

    expect(await screen.findByText("Parent session")).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Toggle subagent sessions",
    })).not.toBeInTheDocument();
    expect(screen.queryByText("Explorer review")).not.toBeInTheDocument();
    expect(listSessionSubagentsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Parent session" }));

    expect(useUiStore.getState().selectedSessionId).toBe("session-parent");
    expect(onSessionSelected).toHaveBeenCalledTimes(1);
  });

  it("keeps session selection free of activation animation timers", async () => {
    const onSessionSelected = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue([
      {
        session_id: "session-11",
        title: "Session 11",
        updated_at: "2026-06-23T10:11:00Z",
        workspace_id: "workspace-1",
      },
    ]);

    renderSidebar({ onSessionSelected });

    const row = (await screen.findByText("Session 11")).closest(".at-session-item");
    fireEvent.click(screen.getByRole("button", { name: "Session 11" }));
    fireEvent.click(screen.getByRole("button", { name: "Session 11" }));

    expect(row).toHaveClass("is-selected");
    expect(row).not.toHaveClass("session-item-activating");
    expect(row).not.toHaveClass("at-session-item-activating");
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 180);
    expect(onSessionSelected).toHaveBeenCalledTimes(2);
    setTimeoutSpy.mockRestore();
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

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));
    const searchbox = await screen.findByRole("searchbox", { name: "Search sessions" });
    fireEvent.change(searchbox, {
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

    const openWorkspaceView = vi.fn();
    renderSidebar({ onOpenWorkspaceView: openWorkspaceView });

    expect(await screen.findByText("Alpha")).toBeVisible();
    const workspaceRow = screen.getByRole("button", { name: "Collapse Agent Teams" });
    expect(workspaceRow).toHaveAttribute("aria-description", "C:/work/agent-teams");
    expect(screen.queryByText("C:/work/agent-teams")).not.toBeInTheDocument();
    fireEvent.click(workspaceRow);

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Agent Teams" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Expand Agent Teams" }), {
      key: "Enter",
    });
    expect(await screen.findByText("Alpha")).toBeVisible();

    fireEvent.click(screen.getByRole("button", {
      name: "Open workspace view for Agent Teams",
    }));
    expect(openWorkspaceView).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Alpha")).toBeVisible();

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));
    const searchbox = await screen.findByRole("searchbox", { name: "Search sessions" });
    fireEvent.change(searchbox, {
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

  it("keeps a 2000-session workspace capped instead of expanding the full DOM", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue(
      Array.from({ length: 2000 }, (_, index) => ({
        session_id: `session-${String(index).padStart(4, "0")}`,
        title: `Session title ${index}`,
        updated_at: new Date(Date.UTC(2026, 5, 23, 10, 0, 2000 - index))
          .toISOString(),
        workspace_id: "workspace-1",
      })),
    );

    renderSidebar();

    expect(await screen.findByText("Session title 0")).toBeVisible();
    expect(screen.getByText("Session title 9")).toBeVisible();
    expect(screen.queryByText("Session title 10")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".at-session-item")).toHaveLength(10);
    expect(screen.getByText("10/2000")).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Show more sessions in Agent Teams",
    })).toBeVisible();
    expect(listSidebarSessionsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a capped workspace capped after creating a new session", async () => {
    const initialSessions = Array.from({ length: 12 }, (_, index) => ({
      session_id: `session-${String(index).padStart(2, "0")}`,
      title: `Existing session ${String(index).padStart(2, "0")}`,
      updated_at: new Date(Date.UTC(2026, 5, 23, 10, 0, 12 - index))
        .toISOString(),
      workspace_id: "workspace-1",
    }));
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock
      .mockResolvedValueOnce(initialSessions)
      .mockResolvedValue([
        {
          session_id: "session-new",
          title: "Fresh session",
          updated_at: "2026-06-23T11:00:00Z",
          workspace_id: "workspace-1",
        },
        ...initialSessions,
      ]);
    createSessionMock.mockResolvedValue({
      session_id: "session-new",
      workspace_id: "workspace-1",
    });

    renderSidebar();

    expect(await screen.findByText("Existing session 09")).toBeVisible();
    expect(screen.queryByText("Existing session 10")).not.toBeInTheDocument();
    expect(screen.getByText("10/12")).toBeVisible();

    fireEvent.click(screen.getByRole("button", {
      name: "New session in Agent Teams",
    }));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith({
        workspace_id: "workspace-1",
      }),
    );
    const freshRow = (await screen.findByText("Fresh session")).closest(
      ".at-session-item",
    );
    expect(freshRow).toHaveClass("is-selected");
    expect(document.querySelectorAll(".at-session-item")).toHaveLength(10);
    expect(screen.getByText("10/13")).toBeVisible();
    expect(screen.queryByText("Existing session 09")).not.toBeInTheDocument();
    expect(useUiStore.getState().selectedSessionId).toBe("session-new");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
  }, 10000);

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

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));
    const searchbox = await screen.findByRole("searchbox", { name: "Search sessions" });
    fireEvent.change(searchbox, {
      target: { value: "filtered" },
    });

    expect(await screen.findByText("Filtered result 01")).toBeVisible();
    expect(screen.getByText("Filtered result 02")).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Show more sessions in Agent Teams",
    })).not.toBeInTheDocument();
  }, 10000);

  it("indexes search and run indicators from loaded sidebar records only", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    listSidebarSessionsMock.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => {
        const ordinal = 50 - index;
        const sessionId = `session-${String(ordinal).padStart(2, "0")}`;
        return {
          ...(ordinal === 50 ? { active_run_status: "running" } : {}),
          session_id: sessionId,
          title: `Loaded session ${String(ordinal).padStart(2, "0")}`,
          updated_at: `2026-06-23T10:${String(ordinal).padStart(2, "0")}:00Z`,
          workspace_id: "workspace-1",
        };
      }),
    );

    renderSidebar();

    expect(await screen.findByText("Loaded session 50")).toBeVisible();
    expect(screen.getByTitle("Running")).toHaveClass(
      "at-session-run-indicator",
      "is-running",
    );
    expect(screen.queryByText("Loaded session 01")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden active session")).not.toBeInTheDocument();

    window.dispatchEvent(new Event("agent-teams-focus-session-search"));
    const searchbox = await screen.findByRole("searchbox", {
      name: "Search sessions",
    });
    fireEvent.change(searchbox, {
      target: { value: "Loaded session 01" },
    });

    expect(await screen.findByText("Loaded session 01")).toBeVisible();
    expect(screen.queryByText("Hidden active session")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Show more sessions in Agent Teams",
    })).not.toBeInTheDocument();
    expect(listSidebarSessionsMock).toHaveBeenCalledTimes(1);
    expect(listSidebarSessionsMock).toHaveBeenCalledWith(false);
    expect(listSessionSubagentsMock).not.toHaveBeenCalled();
  });
});

function renderSidebar(props?: {
  activeSubagent?: ActiveSubagentSession | null;
  backendStatus?: SidebarBackendStatus;
  navigationItems?: SidebarNavigationItem[];
  onOpenNewSession?: () => void;
  onOpenSessionSearch?: () => void;
  onOpenWorkspaceView?: () => void;
  onSessionSelected?: () => void;
  onSubagentSelected?: (subagent: ActiveSubagentSession) => void;
  visuallySelectedSessionId?: string | null;
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
            activeSubagent={props?.activeSubagent}
            backendStatus={props?.backendStatus}
            navigationItems={props?.navigationItems}
            onOpenNewSession={props?.onOpenNewSession}
            onOpenSessionSearch={props?.onOpenSessionSearch}
            onOpenWorkspaceView={props?.onOpenWorkspaceView}
            onSessionSelected={props?.onSessionSelected}
            onSubagentSelected={props?.onSubagentSelected}
            visuallySelectedSessionId={props?.visuallySelectedSessionId}
            workspaceViewActive={props?.workspaceViewActive}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

function appearsBefore(left: HTMLElement, right: HTMLElement): boolean {
  return (
    (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
}
