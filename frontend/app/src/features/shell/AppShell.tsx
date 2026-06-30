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
  Menu,
  Moon,
  PlugZap,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  fetchUiLanguageSettings,
  getHealth,
  getSession,
  listSidebarSessions,
  listWorkspaces,
  markSessionTerminalRunViewed,
  saveUiLanguageSettings,
} from "../../api/client";
import type {
  SessionSidebarRecord,
  UiLanguage,
  UiLanguageSettings,
} from "../../api/contracts";
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
import { SpecLineagePanel } from "./SpecLineagePanel";
import {
  SessionsSidebar,
  type ActiveSubagentSession,
  type SidebarBackendStatus,
  type SidebarNavigationItem,
} from "../sessions/SessionsSidebar";
import { SubagentSessionView } from "../sessions/SubagentSessionView";
import { SettingsDrawer } from "./SettingsDrawer";
import { WorkspaceProjectView } from "../workspaces/WorkspaceProjectView";
import { workspaceDisplayLabel } from "../workspaces/workspaceLabels";
import { useRunStreamController } from "../../runtime/useRunStreamController";
import {
  sidebarWidthMax,
  sidebarWidthMin,
  useUiStore,
} from "../../runtime/uiStore";
import type { Language } from "../../runtime/uiStore";
import { useTranslations } from "../../i18n";
import { ApiError } from "../../api/http";

const { Header, Sider, Content } = Layout;
const healthyBackendStatuses = new Set(["alive", "ok", "ready"]);
const terminalViewMarkMaxAttempts = 3;
const terminalViewMarkRetryDelayMs = 120;
const sidebarOverlayMediaQuery = "(max-width: 760px)";
const shellViewHistoryKey = "agentTeamsShellView";
const shellViewStorageKey = "agentTeams.shellView";
const uiLanguageSettingsQueryKey = ["ui-language-settings"] as const;

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

type ShellView = ShellPrimaryView | "spec-lineage" | "subagent-session";
type ShellHistoryMode = "push" | "replace";

export function AppShell() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const initialSpecLineageTaskId = readSpecLineageTaskIdFromLocation();
  const [activeView, setActiveView] = useState<ShellView>(() =>
    initialSpecLineageTaskId === null ? readInitialShellView() : "spec-lineage",
  );
  const [specLineageTaskId, setSpecLineageTaskId] = useState<string | null>(
    initialSpecLineageTaskId,
  );
  const [chatContentLoadingKey, setChatContentLoadingKey] = useState(0);
  const [activeSubagent, setActiveSubagent] =
    useState<ActiveSubagentSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const terminalViewMarksRef = useRef(new Set<string>());
  const terminalViewRetryTimersRef = useRef(new Set<number>());
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
      if (isPrimaryShellView(nextView)) {
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
      if (nextView !== "chat" && runStreamController.activeRunIds.length > 0) {
        runStreamController.clearRunStream();
      }
      const leavingSubagentView = activeSubagent !== null;
      setSettingsOpen(false);
      setActiveSubagent(null);
      if (nextView === "chat" && (activeView !== "chat" || leavingSubagentView)) {
        setChatContentLoadingKey((currentKey) => currentKey + 1);
      }
      navigateShellView(nextView, historyMode);
    },
    [activeSubagent, activeView, navigateShellView, runStreamController],
  );

  const healthQuery = useQuery({
    queryKey: ["server-health"],
    queryFn: getHealth,
    refetchInterval: 8000,
  });
  const uiLanguageQuery = useQuery({
    queryKey: uiLanguageSettingsQueryKey,
    queryFn: fetchUiLanguageSettings,
    staleTime: 60000,
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
    const savedLanguage = uiLanguageQuery.data?.language;
    if (savedLanguage === undefined) {
      return;
    }
    const nextLanguage = languageFromApi(savedLanguage);
    if (nextLanguage !== language) {
      setLanguage(nextLanguage);
    }
  }, [language, setLanguage, uiLanguageQuery.data?.language]);

  const handleLanguageToggle = useCallback(() => {
    const previousLanguage = language;
    const nextLanguage: Language = language === "zh-CN" ? "en" : "zh-CN";
    const savedLanguage = languageToApi(nextLanguage);
    const previousSettings = queryClient.getQueryData<UiLanguageSettings>(
      uiLanguageSettingsQueryKey,
    );
    queryClient.setQueryData<UiLanguageSettings>(uiLanguageSettingsQueryKey, {
      language: savedLanguage,
    });
    setLanguage(nextLanguage);
    void saveUiLanguageSettings({ language: savedLanguage })
      .then((settings) => {
        queryClient.setQueryData(uiLanguageSettingsQueryKey, settings);
      })
      .catch((error) => {
        queryClient.setQueryData<UiLanguageSettings>(
          uiLanguageSettingsQueryKey,
          previousSettings ?? { language: languageToApi(previousLanguage) },
        );
        setLanguage(previousLanguage);
        void message.error(
          error instanceof Error ? error.message : t("settingsSaveFailed"),
        );
      });
  }, [language, message, queryClient, setLanguage, t]);

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

  useEffect(() => {
    if (selectedSession === null || selectedSession.has_unread_terminal_run !== true) {
      return;
    }
    const sessionId = selectedSession.session_id.trim();
    if (!sessionId) {
      return;
    }
    const terminalMarkKey = terminalViewMarkKey(selectedSession);
    if (terminalViewMarksRef.current.has(terminalMarkKey)) {
      return;
    }
    terminalViewMarksRef.current.add(terminalMarkKey);
    queryClient.setQueryData<SessionSidebarRecord[]>(
      ["sessions", "sidebar"],
      (current) => markSidebarTerminalRunViewed(current, sessionId),
    );

    const invalidateSessionTerminalView = () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", "detail", sessionId],
      });
    };
    const releaseTerminalViewMark = () => {
      terminalViewMarksRef.current.delete(terminalMarkKey);
    };
    const scheduleRetry = (nextAttempt: number) => {
      const timerId = window.setTimeout(() => {
        terminalViewRetryTimersRef.current.delete(timerId);
        markTerminalView(nextAttempt);
      }, terminalViewMarkRetryDelayMs);
      terminalViewRetryTimersRef.current.add(timerId);
    };
    const markTerminalView = (attempt: number) => {
      void markSessionTerminalRunViewed(sessionId)
        .then((result) => {
          if (result.status === "deferred") {
            if (attempt < terminalViewMarkMaxAttempts) {
              scheduleRetry(attempt + 1);
              return;
            }
            releaseTerminalViewMark();
            invalidateSessionTerminalView();
            return;
          }
          invalidateSessionTerminalView();
        })
        .catch((error: unknown) => {
          if (
            isRetryableTerminalViewMarkError(error) &&
            attempt < terminalViewMarkMaxAttempts
          ) {
            scheduleRetry(attempt + 1);
            return;
          }
          releaseTerminalViewMark();
          invalidateSessionTerminalView();
        });
    };

    markTerminalView(1);
  }, [queryClient, selectedSession]);

  useEffect(() => {
    return () => {
      for (const timerId of terminalViewRetryTimersRef.current) {
        window.clearTimeout(timerId);
      }
      terminalViewRetryTimersRef.current.clear();
    };
  }, []);

  function isRetryableTerminalViewMarkError(error: unknown): boolean {
    if (!(error instanceof ApiError)) {
      return false;
    }
    return (
      error.status === 429 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    );
  }

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
        active: !settingsOpen && activeView === "search",
        icon: <Search size={15} />,
        key: "search",
        label: t("appSearch"),
        onSelect: () => openPrimaryShellView("search"),
        shortcut: "Ctrl+K",
      },
      {
        active: !settingsOpen && activeView === "skills",
        icon: <Wrench size={15} />,
        key: "skills",
        label: t("appSkills"),
        onSelect: () => openPrimaryShellView("skills"),
      },
      {
        active: !settingsOpen && activeView === "automation",
        icon: <CalendarClock size={15} />,
        key: "automation",
        label: t("appAutomation"),
        onSelect: () => openPrimaryShellView("automation"),
      },
      {
        active: !settingsOpen && activeView === "connectors",
        icon: <PlugZap size={15} />,
        key: "connectors",
        label: t("appConnectors"),
        onSelect: () => openPrimaryShellView("connectors"),
      },
      {
        active: !settingsOpen && activeView === "board",
        icon: <SquareKanban size={15} />,
        key: "board",
        label: t("appBoard"),
        onSelect: () => openPrimaryShellView("board"),
      },
      {
        active: !settingsOpen && activeView === "memory",
        icon: <Database size={15} />,
        key: "memory",
        label: t("appMemory"),
        onSelect: () => openPrimaryShellView("memory"),
      },
    ],
    [activeView, openPrimaryShellView, settingsOpen, t],
  );

  useEffect(() => {
    writeShellViewHistory(asRestorableShellView(activeView), "replace");
    const openSpecLineageFromLocation = () => {
      const taskId = readSpecLineageTaskIdFromLocation();
      if (taskId === null) {
        return false;
      }
      setSettingsOpen(false);
      setActiveSubagent(null);
      setSpecLineageTaskId(taskId);
      setActiveView("spec-lineage");
      return true;
    };
    const handleShellHistory = (event: PopStateEvent) => {
      if (openSpecLineageFromLocation()) {
        return;
      }
      const nextView = shellViewFromHistoryState(event.state) ?? "chat";
      setActiveSubagent(null);
      setSpecLineageTaskId(null);
      setActiveView(nextView);
    };
    const handleSpecLineageHashChange = () => {
      void openSpecLineageFromLocation();
    };
    window.addEventListener("popstate", handleShellHistory);
    window.addEventListener("hashchange", handleSpecLineageHashChange);
    return () => {
      window.removeEventListener("popstate", handleShellHistory);
      window.removeEventListener("hashchange", handleSpecLineageHashChange);
    };
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
            onClick={handleLanguageToggle}
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
            type={isObservabilityActive(activeView) ? "default" : "text"}
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
          {activeView === "spec-lineage" ? (
            <SpecLineagePanel
              onBack={handleSpecLineageBack}
              sessionId={selectedSessionId}
              standalone
              taskId={specLineageTaskId}
            />
          ) : activeView === "observability" ? (
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
              runStreamController={runStreamController}
              subagent={activeSubagent}
            />
          ) : (
            <ChatWorkspace
              contentLoadingKey={chatContentLoadingKey}
              primaryRoleId={sessionDetailQuery.data?.normal_root_role_id ?? null}
              runStreamController={runStreamController}
              sessionId={selectedSessionId}
              workspaceId={sessionDetailQuery.data?.workspace_id ?? selectedSession?.workspace_id ?? null}
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

  function handleSpecLineageBack() {
    clearSpecLineageTaskIdFromLocation();
    setSpecLineageTaskId(null);
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

function readSidebarOverlayMode(): boolean {
  return window.matchMedia(sidebarOverlayMediaQuery).matches;
}

function terminalViewMarkKey(session: SessionSidebarRecord): string {
  return [
    session.session_id,
    session.latest_terminal_run_id ?? "",
    session.latest_terminal_run_status ?? "",
    session.latest_terminal_run_updated_at ?? "",
  ].join(":");
}

function markSidebarTerminalRunViewed(
  sessions: SessionSidebarRecord[] | undefined,
  sessionId: string,
): SessionSidebarRecord[] | undefined {
  if (sessions === undefined) {
    return undefined;
  }
  return sessions.map((session) => (
    session.session_id === sessionId
      ? { ...session, has_unread_terminal_run: false }
      : session
  ));
}

function languageFromApi(language: UiLanguage): Language {
  return language === "zh-CN" ? "zh-CN" : "en";
}

function languageToApi(language: Language): UiLanguage {
  return language === "zh-CN" ? "zh-CN" : "en-US";
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
  return isPrimaryShellView(view) ? view : "chat";
}

function isPrimaryShellView(view: ShellView): view is ShellPrimaryView {
  return view !== "spec-lineage" && view !== "subagent-session";
}

function isObservabilityActive(view: ShellView): boolean {
  return view === "observability" || view === "spec-lineage";
}

function readSpecLineageTaskIdFromLocation(): string | null {
  const fromSearch = readTaskIdFromSearchParams(window.location.search);
  if (fromSearch !== null) {
    return fromSearch;
  }
  const hash = window.location.hash.trim();
  if (!hash.startsWith("#spec-lineage")) {
    return null;
  }
  const queryStart = hash.indexOf("?");
  if (queryStart < 0) {
    return null;
  }
  return readTaskIdFromSearchParams(hash.slice(queryStart));
}

function readTaskIdFromSearchParams(search: string): string | null {
  const taskId = new URLSearchParams(search).get("task_id")?.trim() ?? "";
  return taskId.length > 0 ? taskId : null;
}

function clearSpecLineageTaskIdFromLocation(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("task_id");
  if (url.hash.startsWith("#spec-lineage")) {
    url.hash = "";
  }
  window.history.replaceState(currentHistoryState(), "", url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
