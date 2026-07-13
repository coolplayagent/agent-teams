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
    metadata: { title: "Alpha session" },
    updated_at: "2026-06-23T10:00:00Z",
  },
  {
    session_id: "session-release",
    workspace_id: "workspace-desktop",
    metadata: { title: "Release notes" },
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
    const closeSearch = vi.fn();
    renderSearch({ onClose: closeSearch, onSessionSelected: selectSession });

    const searchbox = screen.getByRole("searchbox", { name: "Search sessions" });
    const listbox = screen.getByRole("listbox");
    await waitFor(() => expect(searchbox).toHaveFocus());
    expect(searchbox).toHaveAttribute("aria-controls", listbox.id);
    expect(searchbox).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-option-0`,
    );
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    expect(searchbox).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-option-1`,
    );
    fireEvent.keyDown(searchbox, { key: "Home" });
    expect(searchbox).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-option-0`,
    );
    fireEvent.keyDown(searchbox, { key: "End" });
    expect(searchbox).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-option-1`,
    );
    fireEvent.change(searchbox, { target: { value: "alpha" } });
    expect(searchbox).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-option-0`,
    );
    fireEvent.keyDown(searchbox, { key: "Enter" });

    expect(selectSession).toHaveBeenCalledWith(sessions[0]);
    fireEvent.keyDown(searchbox, { key: "Escape" });
    expect(closeSearch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
  });

  it("keeps the active keyboard result visible inside the results scroller", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderSearch();

    const searchbox = screen.getByRole("searchbox", { name: "Search sessions" });
    await waitFor(() => expect(searchbox).toHaveFocus());
    scrollIntoView.mockClear();
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });
  });

  it("keeps wheel and touchpad deltas inside the results scroller", () => {
    const outerWheel = vi.fn();
    render(
      <div onWheel={outerWheel}>
        <ConfigProvider button={{ autoInsertSpace: false }}>
          <SessionSearchView
            onSessionSelected={vi.fn()}
            selectedSessionId={null}
            sessions={sessions}
            workspaces={workspaces}
          />
        </ConfigProvider>
      </div>,
    );

    const listbox = screen.getByRole("listbox");
    Object.defineProperties(listbox, {
      clientHeight: { configurable: true, value: 240 },
      scrollHeight: { configurable: true, value: 1600 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    fireEvent.wheel(listbox, { deltaMode: 0, deltaY: 125 });
    expect(listbox.scrollTop).toBe(125);
    expect(outerWheel).not.toHaveBeenCalled();

    fireEvent.wheel(listbox, { deltaMode: 2, deltaY: 1 });
    expect(listbox.scrollTop).toBe(365);
    expect(outerWheel).not.toHaveBeenCalled();
  });

  it("does not let programmatic scrolling under a stationary pointer replace keyboard selection", async () => {
    renderSearch();

    const searchbox = screen.getByRole("searchbox", { name: "Search sessions" });
    const results = screen.getByRole("listbox");
    const firstOption = screen.getByRole("option", { name: "Open Release notes" });
    const lastOption = screen.getByRole("option", { name: "Open Alpha session" });
    await waitFor(() => expect(searchbox).toHaveFocus());

    fireEvent.pointerEnter(results, { clientX: 240, clientY: 220 });
    fireEvent.keyDown(searchbox, { key: "End" });
    expect(lastOption).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerMove(firstOption, { clientX: 240, clientY: 220 });
    expect(lastOption).toHaveAttribute("aria-selected", "true");
    expect(firstOption).toHaveAttribute("aria-selected", "false");

    fireEvent.pointerMove(firstOption, { clientX: 242, clientY: 220 });
    expect(firstOption).toHaveAttribute("aria-selected", "true");
  });

  it("shows an empty search state when nothing matches", () => {
    renderSearch();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No matches")).toBeVisible();
  });

  it("shows a load error state when session data fails", () => {
    renderSearch({ hasError: true });

    expect(screen.getByText("Could not load sessions")).toBeVisible();
  });
});

function renderSearch({
  hasError = false,
  onSessionSelected = vi.fn(),
  onClose,
  selectedSessionId = null,
}: {
  hasError?: boolean;
  onSessionSelected?: (session: SessionSidebarRecord) => void;
  onClose?: () => void;
  selectedSessionId?: string | null;
} = {}) {
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <SessionSearchView
        onSessionSelected={onSessionSelected}
        onClose={onClose}
        hasError={hasError}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        workspaces={workspaces}
      />
    </ConfigProvider>,
  );
}
