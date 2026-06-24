import { ConfigProvider } from "antd";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionSidebarRecord, WorkspaceRecord } from "../api/contracts";
import { SessionSearchView } from "../features/search/SessionSearchView";
import { useUiStore } from "../runtime/uiStore";

const sessions: SessionSidebarRecord[] = [
  {
    session_id: "session-alpha",
    workspace_id: "workspace-main",
    title: "Alpha session",
    updated_at: "2026-06-23T10:00:00Z",
  },
  {
    session_id: "session-release",
    workspace_id: "workspace-desktop",
    title: "Release notes",
    updated_at: "2026-06-23T11:00:00Z",
  },
];

const workspaces: WorkspaceRecord[] = [
  {
    workspace_id: "workspace-main",
    root_path: "C:/work/agent-teams",
    display_name: "Agent Teams",
  },
  {
    workspace_id: "workspace-desktop",
    root_path: "C:/work/desktop",
    display_name: "Desktop",
  },
];

beforeEach(() => {
  useUiStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionSearchView", () => {
  it("filters sessions by title and workspace and selects the matching row", () => {
    const selectSession = vi.fn();
    renderSearch({ onSessionSelected: selectSession });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "desktop" },
    });

    expect(screen.getByText("Release notes")).toBeVisible();
    expect(screen.getByText("Desktop")).toBeVisible();
    expect(screen.queryByText("Alpha session")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Open Release notes" }));

    expect(selectSession).toHaveBeenCalledWith(sessions[1]);
  });

  it("opens the active result with the keyboard", async () => {
    const selectSession = vi.fn();
    renderSearch({ onSessionSelected: selectSession });

    const searchbox = screen.getByRole("searchbox", { name: "Search sessions" });
    await waitFor(() => expect(searchbox).toHaveFocus());
    fireEvent.change(searchbox, { target: { value: "alpha" } });
    fireEvent.keyDown(searchbox, { key: "Enter" });

    expect(selectSession).toHaveBeenCalledWith(sessions[0]);
  });

  it("shows an empty search state when nothing matches", () => {
    renderSearch();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No matches")).toBeVisible();
  });
});

function renderSearch({
  onSessionSelected = vi.fn(),
  selectedSessionId = null,
}: {
  onSessionSelected?: (session: SessionSidebarRecord) => void;
  selectedSessionId?: string | null;
} = {}) {
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <SessionSearchView
        onSessionSelected={onSessionSelected}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        workspaces={workspaces}
      />
    </ConfigProvider>,
  );
}
