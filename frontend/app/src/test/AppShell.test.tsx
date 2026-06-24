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
import type { ReactNode } from "react";

import {
  getHealth,
  getSession,
  listSidebarSessions,
  listWorkspaces,
} from "../api/client";
import { AppShell } from "../features/shell/AppShell";
import { sidebarWidthDefault, useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getHealth: vi.fn(),
  getSession: vi.fn(),
  listSidebarSessions: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock("../features/composer/Composer", () => ({
  Composer: () => <div data-testid="composer" />,
}));

vi.mock("../features/connectors/ConnectorsView", () => ({
  ConnectorsView: () => <div data-testid="connectors-view" />,
}));

vi.mock("../features/recovery/RecoveryBar", () => ({
  RecoveryBar: () => <div data-testid="recovery" />,
}));

vi.mock("../features/sessions/SessionsSidebar", () => ({
  SessionsSidebar: ({
    navigationItems = [],
    onOpenWorkspaceView,
  }: {
    navigationItems?: Array<{
      key: string;
      label: string;
      onSelect: () => void;
    }>;
    onOpenWorkspaceView?: () => void;
  }) => (
    <div data-testid="sessions-sidebar">
      {navigationItems.map((item) => (
        <button key={item.key} onClick={item.onSelect} type="button">
          {item.label}
        </button>
      ))}
      <button onClick={onOpenWorkspaceView} type="button">
        Open workspace view
      </button>
    </div>
  ),
}));

vi.mock("../features/shell/CurrentSessionIndicator", () => ({
  CurrentSessionIndicator: () => <span>session-1</span>,
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
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
const listWorkspacesMock = vi.mocked(listWorkspaces);

beforeEach(() => {
  mockViewportMatch(false);
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
  vi.clearAllMocks();
});

describe("AppShell", () => {
  it("toggles the session sidebar without unmounting the workspace", async () => {
    renderShell();

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
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

  it("collapses the mobile sidebar by default and reopens it as an overlay", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByTestId("sessions-sidebar")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(await screen.findByTestId("sessions-sidebar")).toBeVisible();
    const closeOverlay = screen.getByRole("button", { name: "Close sidebar" });
    expect(closeOverlay).toBeVisible();

    fireEvent.click(closeOverlay);

    await waitFor(() =>
      expect(screen.queryByTestId("sessions-sidebar")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("timeline")).toBeVisible();
  });

  it("keeps secondary actions in a compact mobile topbar menu", async () => {
    mockViewportMatch(true);
    renderShell();

    expect(await screen.findByTestId("timeline")).toBeVisible();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "More actions" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "V1" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Observability" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByText("Observability")).toBeInTheDocument();
    expect(screen.getByText("Connectors")).toBeInTheDocument();
    expect(screen.getByText("Export messages (HTML)")).toBeInTheDocument();
    expect(screen.getByText("Export messages (PNG)")).toBeInTheDocument();
    expect(screen.getByText("V1")).toBeInTheDocument();
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
    fireEvent.click(within(sidebar).getByRole("button", { name: "Observability" }));

    expect(await screen.findByTestId("observability")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Connectors" }));

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(screen.queryByTestId("timeline")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Search" }));

    expect(await screen.findByTestId("session-search-view")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toBeVisible();
    expect(screen.getByText("Session 1")).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Chat" }));

    expect(await screen.findByTestId("timeline")).toBeVisible();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Settings" }));

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
    expect(within(sidebar).getByRole("button", { name: "Chat" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "聊天" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "连接器" })).toBeVisible();
    expect(within(sidebar).getByRole("button", { name: "观测" })).toBeVisible();
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
