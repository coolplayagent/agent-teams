import {
  Button,
  Layout,
  Space,
  Tooltip,
  theme,
  App,
  Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import {
  Activity,
  CalendarClock,
  Database,
  Download,
  ExternalLink,
  Languages,
  Menu,
  Moon,
  MoreHorizontal,
  PlugZap,
  RefreshCcw,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  getHealth,
  getSession,
  listSidebarSessions,
  listWorkspaces,
} from "../../api/client";
import type { SessionSidebarRecord } from "../../api/contracts";
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
  type SidebarNavigationItem,
} from "../sessions/SessionsSidebar";
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
const narrowViewportQuery = "(max-width: 760px)";

export function AppShell() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const t = useTranslations();
  const [activeView, setActiveView] = useState<
    | "automation"
    | "board"
    | "chat"
    | "connectors"
    | "memory"
    | "observability"
    | "search"
    | "skills"
    | "workspace"
  >("chat");
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
  const isNarrowViewport = useNarrowViewport();
  const messageExporter = useMessageExporter({
    messenger: message,
    sessionId: selectedSessionId,
  });

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
      return t("healthChecking");
    }
    if (healthQuery.isError) {
      return t("healthOffline");
    }
    return healthQuery.data?.status ?? t("healthReady");
  }, [healthQuery.data?.status, healthQuery.isError, healthQuery.isLoading, t]);
  const selectedSession = useMemo(
    () =>
      sidebarSessionsQuery.data?.find(
        (session) => session.session_id === selectedSessionId,
      ) ?? null,
    [selectedSessionId, sidebarSessionsQuery.data],
  );
  const sidebarNavigationItems = useMemo<SidebarNavigationItem[]>(
    () => [
      {
        active: activeView === "search",
        icon: <Search size={15} />,
        key: "search",
        label: t("appSearch"),
        onSelect: () => {
          setActiveView("search");
          closeSidebarOnNarrow();
        },
      },
      {
        active: activeView === "skills",
        icon: <Wrench size={15} />,
        key: "skills",
        label: t("appSkills"),
        onSelect: () => {
          setActiveView("skills");
          closeSidebarOnNarrow();
        },
      },
      {
        active: activeView === "automation",
        icon: <CalendarClock size={15} />,
        key: "automation",
        label: t("appAutomation"),
        onSelect: () => {
          setActiveView("automation");
          closeSidebarOnNarrow();
        },
      },
      {
        active: activeView === "connectors",
        icon: <PlugZap size={15} />,
        key: "connectors",
        label: t("appConnectors"),
        onSelect: () => {
          setActiveView("connectors");
          closeSidebarOnNarrow();
        },
      },
      {
        active: activeView === "board",
        icon: <SquareKanban size={15} />,
        key: "board",
        label: t("appBoard"),
        onSelect: () => {
          setActiveView("board");
          closeSidebarOnNarrow();
        },
      },
      {
        active: activeView === "memory",
        icon: <Database size={15} />,
        key: "memory",
        label: t("appMemory"),
        onSelect: () => {
          setActiveView("memory");
          closeSidebarOnNarrow();
        },
      },
    ],
    [activeView, isNarrowViewport, setSidebarCollapsed, t],
  );
  const mobileActionItems = useMemo<MenuProps["items"]>(
    () => [
      {
        icon: <Languages size={15} />,
        key: "language",
        label:
          language === "zh-CN" ? t("languageChinese") : t("languageEnglish"),
      },
      {
        icon: <CalendarClock size={15} />,
        key: "automation",
        label: t("appAutomation"),
      },
      {
        icon: <Wrench size={15} />,
        key: "skills",
        label: t("appSkills"),
      },
      {
        icon: <SquareKanban size={15} />,
        key: "board",
        label: t("appBoard"),
      },
      {
        icon: <Activity size={15} />,
        key: "observability",
        label: t("appObservability"),
      },
      {
        icon: <PlugZap size={15} />,
        key: "connectors",
        label: t("appConnectors"),
      },
      {
        icon: <Database size={15} />,
        key: "memory",
        label: t("appMemory"),
      },
      {
        disabled: messageExporter.exporting !== null,
        icon: <Download size={15} />,
        key: "export-html",
        label: `${t("exportMessages")} (${t("exportAsHtml")})`,
      },
      {
        disabled: messageExporter.exporting !== null,
        icon: <Download size={15} />,
        key: "export-png",
        label: `${t("exportMessages")} (${t("exportAsPng")})`,
      },
      {
        icon: themeMode === "dark" ? <Sun size={15} /> : <Moon size={15} />,
        key: "theme",
        label: t("appToggleTheme"),
      },
      {
        icon: <RefreshCcw size={15} />,
        key: "health",
        label: `${t("settingsServerStatus")}: ${healthLabel}`,
      },
      {
        type: "divider",
      },
      {
        icon: <ExternalLink size={15} />,
        key: "v1",
        label: "V1",
      },
    ],
    [healthLabel, language, messageExporter.exporting, t, themeMode],
  );

  useEffect(() => {
    if (isNarrowViewport) {
      setSidebarCollapsed(true);
    }
  }, [isNarrowViewport, setSidebarCollapsed]);

  useEffect(() => {
    if (!isNarrowViewport || sidebarCollapsed) {
      return undefined;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNarrowViewport, setSidebarCollapsed, sidebarCollapsed]);

  useEffect(() => {
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      setActiveView("search");
      if (isNarrowViewport) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [isNarrowViewport, setSidebarCollapsed]);

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
          />
        </div>
        <Space size={8} className="at-topbar-right">
          {isNarrowViewport ? (
            <>
              <Tooltip title={t("appSettings")}>
                <Button
                  aria-label={t("appSettings")}
                  icon={<Settings size={17} />}
                  onClick={() => setSettingsOpen(true)}
                  type="text"
                />
              </Tooltip>
              <Dropdown
                menu={{
                  items: mobileActionItems,
                  onClick: handleMobileActionClick,
                }}
                placement="bottomRight"
                trigger={["click"]}
              >
                <Tooltip title={t("appMoreActions")}>
                  <Button
                    aria-label={t("appMoreActions")}
                    icon={<MoreHorizontal size={17} />}
                    loading={messageExporter.exporting !== null}
                    type="text"
                  />
                </Tooltip>
              </Dropdown>
            </>
          ) : (
            <>
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
                  onClick={() => setActiveView("observability")}
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
              <Button
                className="at-health-button"
                icon={<RefreshCcw size={15} />}
                loading={healthQuery.isFetching}
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["server-health"] })
                }
                size="small"
                style={{ borderColor: token.colorBorder }}
              >
                {healthLabel}
              </Button>
              <Button href="/" size="small">
                V1
              </Button>
            </>
          )}
        </Space>
      </Header>
      <Layout className="at-body">
        {!sidebarCollapsed && isNarrowViewport ? (
          <button
            aria-label={t("appCloseSidebar")}
            className="at-sidebar-scrim"
            onClick={() => setSidebarCollapsed(true)}
            type="button"
          />
        ) : null}
        {!sidebarCollapsed ? (
          <Sider
            className={sidebarResizing ? "at-sidebar is-resizing" : "at-sidebar"}
            theme="light"
            width={isNarrowViewport ? 0 : sidebarWidth}
          >
            <SessionsSidebar
              navigationItems={sidebarNavigationItems}
              onOpenWorkspaceView={() => {
                setActiveView("workspace");
                closeSidebarOnNarrow();
              }}
              onSessionSelected={() => {
                setActiveView("chat");
                closeSidebarOnNarrow();
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
              onBack={() => setActiveView("chat")}
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

  function closeSidebarOnNarrow() {
    if (isNarrowViewport) {
      setSidebarCollapsed(true);
    }
  }

  function handleSearchSessionSelected(session: SessionSidebarRecord) {
    if (session.workspace_id !== undefined && session.workspace_id.trim()) {
      setSelectedWorkspaceId(session.workspace_id);
    }
    setSelectedSessionId(session.session_id);
    setActiveView("chat");
    closeSidebarOnNarrow();
  }

  function handleMobileActionClick({ key }: { key: string }) {
    if (key === "language") {
      setLanguage(language === "zh-CN" ? "en" : "zh-CN");
      return;
    }
    if (key === "observability") {
      setActiveView("observability");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "automation") {
      setActiveView("automation");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "skills") {
      setActiveView("skills");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "board") {
      setActiveView("board");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "connectors") {
      setActiveView("connectors");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "memory") {
      setActiveView("memory");
      closeSidebarOnNarrow();
      return;
    }
    if (key === "export-html") {
      void messageExporter.exportMessages("html");
      return;
    }
    if (key === "export-png") {
      void messageExporter.exportMessages("png");
      return;
    }
    if (key === "theme") {
      setThemeMode(themeMode === "dark" ? "light" : "dark");
      return;
    }
    if (key === "health") {
      void queryClient.invalidateQueries({ queryKey: ["server-health"] });
      return;
    }
    if (key === "v1") {
      window.location.assign("/");
    }
  }

  function handleAutomationSessionSelected(
    sessionId: string,
    workspaceId?: string | null,
  ) {
    if (workspaceId !== undefined && workspaceId !== null && workspaceId.trim()) {
      setSelectedWorkspaceId(workspaceId);
    }
    setSelectedSessionId(sessionId);
    setActiveView("chat");
    closeSidebarOnNarrow();
  }
}

function useNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia(narrowViewportQuery).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(narrowViewportQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches);
    };
    setIsNarrow(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isNarrow;
}
