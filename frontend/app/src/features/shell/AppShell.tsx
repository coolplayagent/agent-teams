import {
  Button,
  Layout,
  Space,
  Tooltip,
  App,
} from "antd";
import {
  Activity,
  CalendarClock,
  Database,
  MessageSquare,
  Menu,
  Moon,
  PlugZap,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Wrench,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  getHealth,
  getSession,
  listSidebarSessions,
  listWorkspaces,
} from "../../api/client";
import type { SessionSidebarRecord, WorkspaceRecord } from "../../api/contracts";
import { AutomationView } from "../automation/AutomationView";
import { BoardTodosView } from "../boards/BoardTodosView";
import { ConnectorsView } from "../connectors/ConnectorsView";
import { ChatWorkspace } from "./ChatWorkspace";
import { CurrentSessionIndicator } from "./CurrentSessionIndicator";
import { MemoryView } from "../memory/MemoryView";
import { MessageExportMenu, useMessageExporter } from "./MessageExportMenu";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { SessionSearchView } from "../search/SessionSearchView";
import { SkillsView } from "../skills/SkillsView";
import {
  SessionsSidebar,
  type ActiveSubagentSession,
  type SidebarBackendStatus,
  type SidebarNavigationItem,
} from "../sessions/SessionsSidebar";
import { SubagentSessionView } from "../sessions/SubagentSessionView";
import { SettingsDrawer } from "./SettingsDrawer";
import { WorkspaceProjectView } from "../workspaces/WorkspaceProjectView";
import { useRunStreamController } from "../../runtime/useRunStreamController";
import {
  sidebarWidthMax,
  sidebarWidthMin,
  useUiStore,
} from "../../runtime/uiStore";
import { useTranslations } from "../../i18n";

const { Header, Sider, Content } = Layout;
const healthyBackendStatuses = new Set(["alive", "ok", "ready"]);
const sidebarOverlayMediaQuery = "(max-width: 760px)";
const shellViewHistoryKey = "agentTeamsShellView";
const shellViewStorageKey = "agentTeams.shellView";

type ShellPrimaryView =
  | "automation"
  | "board"
  | "chat"
  | "connectors"
  | "memory"
  | "observability"
  | "search"
  | "skills"
  | "workspace";

type ShellView = ShellPrimaryView | "subagent-session";
type ShellHistoryMode = "push" | "replace";

export function AppShell() {
  const { message } = App.useApp();
  const t = useTranslations();
  const [activeView, setActiveView] = useState<ShellView>(
    () => readInitialShellView(),
  );
  const [activeSubagent, setActiveSubagent] =
    useState<ActiveSubagentSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const runStreamController = useRunStreamController();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const themeMode = useUiStore((state) => state.themeMode);
  const language = useUiStore((state) => state.language);
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [sidebarOverlayMode, setSidebarOverlayMode] = useState(readSidebarOverlayMode);
  const messageExporter = useMessageExporter({
    messenger: message,
    sessionId: selectedSessionId,
  });
  const navigateShellView = useCallback(
    (nextView: ShellView, historyMode: ShellHistoryMode = "push") => {
      setActiveView(nextView);
      if (nextView !== "subagent-session") {
        writeShellViewHistory(nextView, historyMode);
      }
    },
    [],
  );
  const openPrimaryShellView = useCallback(
    (
      nextView: ShellPrimaryView,
      historyMode: ShellHistoryMode = "push",
    ) => {
      setActiveSubagent(null);
      navigateShellView(nextView, historyMode);
    },
    [navigateShellView],
  );

  const healthQuery = useQuery({
    queryKey: ["server-health"],
    queryFn: getHealth,
    refetchInterval: 8000,
  });
  const sidebarSessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const sessionDetailQuery = useQuery({
    queryKey: ["sessions", "detail", selectedSessionId],
    queryFn: () => {
      if (selectedSessionId === null) {
        throw new Error("Session is required.");
      }
      return getSession(selectedSessionId);
    },
    enabled: selectedSessionId !== null,
    staleTime: 10000,
  });

  const healthLabel = useMemo(() => {
    if (healthQuery.isLoading) {
      return t("sidebarBackendChecking");
    }
    if (healthQuery.isError) {
      return t("sidebarBackendOffline");
    }
    const status = healthQuery.data?.status?.trim();
    if (status === undefined || healthyBackendStatuses.has(status.toLowerCase())) {
      return t("sidebarBackendConnected");
    }
    return status;
  }, [healthQuery.data?.status, healthQuery.isError, healthQuery.isLoading, t]);
  const sidebarBackendStatus = useMemo<SidebarBackendStatus>(
    () => ({
      label: healthLabel,
      tone: healthQuery.isLoading
        ? "checking"
        : healthQuery.isError
          ? "offline"
          : "online",
    }),
    [healthLabel, healthQuery.isError, healthQuery.isLoading],
  );
  const selectedSession = useMemo(
    () =>
      sidebarSessionsQuery.data?.find(
        (session) => session.session_id === selectedSessionId,
      ) ?? null,
    [selectedSessionId, sidebarSessionsQuery.data],
  );

  useEffect(() => {
    if (selectedSessionId !== null) {
      return;
    }
    const firstSession = sidebarSessionsQuery.data?.find((session) =>
      session.session_id.trim(),
    );
    if (firstSession === undefined) {
      return;
    }
    setSelectedSessionId(firstSession.session_id);
    if (firstSession.workspace_id !== undefined && firstSession.workspace_id.trim()) {
      setSelectedWorkspaceId(firstSession.workspace_id);
    }
  }, [
    selectedSessionId,
    setSelectedSessionId,
    setSelectedWorkspaceId,
    sidebarSessionsQuery.data,
  ]);

  const topbarWorkspaceId =
    selectedWorkspaceId ??
    selectedSession?.workspace_id ??
    sessionDetailQuery.data?.workspace_id ??
    null;
  const selectedWorkspace = useMemo(
    () =>
      workspacesQuery.data?.find(
        (workspace) => workspace.workspace_id === topbarWorkspaceId,
      ) ?? null,
    [topbarWorkspaceId, workspacesQuery.data],
  );
  const topbarWorkspaceLabel = workspaceDisplayLabel(
    selectedWorkspace,
    topbarWorkspaceId,
  );
  const sidebarNavigationItems = useMemo<SidebarNavigationItem[]>(
    () => [
      {
        active: activeView === "chat",
        icon: <MessageSquare size={15} />,
        key: "chat",
        label: t("appChat"),
        onSelect: () => openPrimaryShellView("chat"),
      },
      {
        active: activeView === "automation",
        icon: <CalendarClock size={15} />,
        key: "automation",
        label: t("appAutomation"),
        onSelect: () => openPrimaryShellView("automation"),
      },
      {
        active: activeView === "skills",
        icon: <Wrench size={15} />,
        key: "skills",
        label: t("appSkills"),
        onSelect: () => openPrimaryShellView("skills"),
      },
      {
        active: activeView === "board",
        icon: <SquareKanban size={15} />,
        key: "board",
        label: t("appBoard"),
        onSelect: () => openPrimaryShellView("board"),
      },
      {
        active: activeView === "search",
        icon: <Search size={15} />,
        key: "search",
        label: t("appSearch"),
        onSelect: () => openPrimaryShellView("search"),
        shortcut: "Ctrl+K",
      },
      {
        active: activeView === "connectors",
        icon: <PlugZap size={15} />,
        key: "connectors",
        label: t("appConnectors"),
        onSelect: () => openPrimaryShellView("connectors"),
      },
      {
        active: activeView === "memory",
        icon: <Database size={15} />,
        key: "memory",
        label: t("appMemory"),
        onSelect: () => openPrimaryShellView("memory"),
      },
      {
        active: activeView === "observability",
        icon: <Activity size={15} />,
        key: "observability",
        label: t("appObservability"),
        onSelect: () => openPrimaryShellView("observability"),
      },
      {
        icon: <Settings size={15} />,
        key: "settings",
        label: t("appSettings"),
        onSelect: () => setSettingsOpen(true),
      },
    ],
    [activeView, openPrimaryShellView, t],
  );

  useEffect(() => {
    writeShellViewHistory(asRestorableShellView(activeView), "replace");
    const handleShellHistory = (event: PopStateEvent) => {
      const nextView = shellViewFromHistoryState(event.state) ?? "chat";
      setActiveSubagent(null);
      setActiveView(nextView);
    };
    window.addEventListener("popstate", handleShellHistory);
    return () => window.removeEventListener("popstate", handleShellHistory);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(shellViewStorageKey, asRestorableShellView(activeView));
  }, [activeView]);

  useEffect(() => {
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      openPrimaryShellView("search");
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [openPrimaryShellView]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(sidebarOverlayMediaQuery);
    const handleSidebarOverlayModeChange = (event: MediaQueryListEvent) => {
      setSidebarOverlayMode(event.matches);
    };
    setSidebarOverlayMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleSidebarOverlayModeChange);
    return () =>
      mediaQuery.removeEventListener("change", handleSidebarOverlayModeChange);
  }, []);

  useEffect(() => {
    if (!sidebarResizing) {
      return undefined;
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      setSidebarWidth(event.clientX);
    };
    const handlePointerUp = () => {
      setSidebarResizing(false);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [setSidebarWidth, sidebarResizing]);

  return (
    <Layout className="at-shell">
      <Header className="at-topbar">
        <div className="at-topbar-left">
          <Tooltip title={t("appToggleSidebar")}>
            <Button
              aria-label={t("appToggleSidebar")}
              icon={<Menu size={17} />}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              type="text"
            />
          </Tooltip>
          <CurrentSessionIndicator
            selectedSessionId={selectedSessionId}
            session={selectedSession}
            workspaceLabel={topbarWorkspaceLabel}
          />
        </div>
        <Space size={8} className="at-topbar-right">
          <Button
            onClick={() => setLanguage(language === "zh-CN" ? "en" : "zh-CN")}
            size="small"
          >
            {language === "zh-CN"
              ? t("languageChinese")
              : t("languageEnglish")}
          </Button>
          <Tooltip title={t("appObservability")}>
            <Button
              aria-label={t("appObservability")}
              icon={<Activity size={17} />}
              onClick={() => openPrimaryShellView("observability")}
              type={activeView === "observability" ? "default" : "text"}
            />
          </Tooltip>
          <MessageExportMenu messenger={message} sessionId={selectedSessionId} />
          <Tooltip title={t("appSettings")}>
            <Button
              aria-label={t("appSettings")}
              icon={<Settings size={17} />}
              onClick={() => setSettingsOpen(true)}
              type="text"
            />
          </Tooltip>
          <Tooltip title={t("appToggleTheme")}>
            <Button
              aria-label={t("appToggleTheme")}
              icon={themeMode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              onClick={() =>
                setThemeMode(themeMode === "dark" ? "light" : "dark")
              }
              type="text"
            />
          </Tooltip>
          <Button href="/" size="small">
            V1
          </Button>
        </Space>
      </Header>
      <Layout className="at-body">
        {!sidebarCollapsed && sidebarOverlayMode ? (
          <button
            aria-label={t("appCloseSidebar")}
            className="at-sidebar-scrim"
            onClick={() => setSidebarCollapsed(true)}
            style={{
              left: `min(${sidebarWidth}px, calc(100vw - 44px))`,
            }}
            type="button"
          />
        ) : null}
        {!sidebarCollapsed ? (
          <Sider
            className={sidebarResizing ? "at-sidebar is-resizing" : "at-sidebar"}
            theme="light"
            width={sidebarWidth}
          >
            <SessionsSidebar
              activeSubagent={activeSubagent}
              backendStatus={sidebarBackendStatus}
              navigationItems={sidebarNavigationItems}
              onOpenWorkspaceView={() => openPrimaryShellView("workspace")}
              onSessionSelected={() => openPrimaryShellView("chat", "replace")}
              onSubagentSelected={(subagent) => {
                setActiveSubagent(subagent);
                navigateShellView("subagent-session");
              }}
              workspaceViewActive={activeView === "workspace"}
            />
            <div
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              aria-valuemax={sidebarWidthMax}
              aria-valuemin={sidebarWidthMin}
              aria-valuenow={sidebarWidth}
              className="at-sidebar-resizer"
              onKeyDown={handleSidebarResizeKeyDown}
              onPointerDown={handleSidebarResizePointerDown}
              role="separator"
              tabIndex={0}
            />
          </Sider>
        ) : null}
        <Content className="at-workspace">
          {activeView === "observability" ? (
            <ObservabilityPanel sessionId={selectedSessionId} />
          ) : activeView === "automation" ? (
            <AutomationView onSessionSelected={handleAutomationSessionSelected} />
          ) : activeView === "board" ? (
            <BoardTodosView
              loadingWorkspaces={workspacesQuery.isLoading}
              onWorkspaceSelected={setSelectedWorkspaceId}
              selectedWorkspaceId={selectedWorkspaceId}
              workspaces={workspacesQuery.data ?? []}
            />
          ) : activeView === "connectors" ? (
            <ConnectorsView />
          ) : activeView === "memory" ? (
            <MemoryView selectedWorkspaceId={selectedWorkspaceId} />
          ) : activeView === "skills" ? (
            <SkillsView />
          ) : activeView === "workspace" ? (
            <WorkspaceProjectView
              onBack={() => openPrimaryShellView("chat", "replace")}
              selectedWorkspaceId={selectedWorkspaceId}
            />
          ) : activeView === "search" ? (
            <SessionSearchView
              hasError={sidebarSessionsQuery.isError || workspacesQuery.isError}
              loading={sidebarSessionsQuery.isLoading || workspacesQuery.isLoading}
              onSessionSelected={handleSearchSessionSelected}
              selectedSessionId={selectedSessionId}
              sessions={sidebarSessionsQuery.data ?? []}
              workspaces={workspacesQuery.data ?? []}
            />
          ) : activeView === "subagent-session" && activeSubagent !== null ? (
            <SubagentSessionView
              onBack={() => openPrimaryShellView("chat", "replace")}
              subagent={activeSubagent}
            />
          ) : (
            <ChatWorkspace
              primaryRoleId={sessionDetailQuery.data?.normal_root_role_id ?? null}
              runStreamController={runStreamController}
              sessionId={selectedSessionId}
            />
          )}
        </Content>
      </Layout>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Layout>
  );

  function handleSidebarResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setSidebarResizing(true);
    setSidebarWidth(event.clientX);
  }

  function handleSidebarResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSidebarWidth(sidebarWidth - 16);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth(sidebarWidth + 16);
    }
  }

  function handleSearchSessionSelected(session: SessionSidebarRecord) {
    if (session.workspace_id !== undefined && session.workspace_id.trim()) {
      setSelectedWorkspaceId(session.workspace_id);
    }
    setSelectedSessionId(session.session_id);
    openPrimaryShellView("chat", "replace");
  }

  function handleAutomationSessionSelected(
    sessionId: string,
    workspaceId?: string | null,
  ) {
    if (workspaceId !== undefined && workspaceId !== null && workspaceId.trim()) {
      setSelectedWorkspaceId(workspaceId);
    }
    setSelectedSessionId(sessionId);
    openPrimaryShellView("chat", "replace");
  }
}

function workspaceDisplayLabel(
  workspace: WorkspaceRecord | null,
  workspaceId: string | null,
): string {
  return (
    workspace?.display_name?.trim() ||
    workspace?.name?.trim() ||
    workspace?.workspace_id.trim() ||
    workspaceId?.trim() ||
    "Agent Teams"
  );
}

function readSidebarOverlayMode(): boolean {
  return window.matchMedia(sidebarOverlayMediaQuery).matches;
}

function readInitialShellView(): ShellPrimaryView {
  return (
    shellViewFromHistoryState(window.history.state as unknown) ??
    normalizeShellView(window.localStorage.getItem(shellViewStorageKey)) ??
    "chat"
  );
}

function writeShellViewHistory(
  view: ShellPrimaryView,
  mode: "push" | "replace",
): void {
  const nextState = {
    ...currentHistoryState(),
    [shellViewHistoryKey]: view,
  };
  if (mode === "push") {
    window.history.pushState(nextState, "", window.location.href);
    return;
  }
  window.history.replaceState(nextState, "", window.location.href);
}

function shellViewFromHistoryState(state: unknown): ShellPrimaryView | null {
  if (!isRecord(state)) {
    return null;
  }
  return normalizeShellView(state[shellViewHistoryKey]);
}

function currentHistoryState(): Record<string, unknown> {
  const state = window.history.state as unknown;
  return isRecord(state) ? { ...state } : {};
}

function normalizeShellView(value: unknown): ShellPrimaryView | null {
  if (value === "automation") {
    return "automation";
  }
  if (value === "board") {
    return "board";
  }
  if (value === "chat") {
    return "chat";
  }
  if (value === "connectors") {
    return "connectors";
  }
  if (value === "memory") {
    return "memory";
  }
  if (value === "observability") {
    return "observability";
  }
  if (value === "search") {
    return "search";
  }
  if (value === "skills") {
    return "skills";
  }
  if (value === "workspace") {
    return "workspace";
  }
  return null;
}

function asRestorableShellView(view: ShellView): ShellPrimaryView {
  return view === "subagent-session" ? "chat" : view;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
