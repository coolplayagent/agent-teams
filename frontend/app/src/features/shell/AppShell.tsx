import {
  Button,
  Layout,
  Space,
  Tooltip,
  theme,
  App,
} from "antd";
import {
  Activity,
  Menu,
  MessageSquare,
  Moon,
  RefreshCcw,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  getHealth,
  getSession,
  listSidebarSessions,
} from "../../api/client";
import { Composer } from "../composer/Composer";
import { CurrentSessionIndicator } from "./CurrentSessionIndicator";
import { MessageExportMenu } from "./MessageExportMenu";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { SessionTokenUsage } from "./SessionTokenUsage";
import {
  SessionsSidebar,
  type SidebarNavigationItem,
} from "../sessions/SessionsSidebar";
import { SettingsDrawer } from "./SettingsDrawer";
import { MessageTimeline } from "../timeline/MessageTimeline";
import { WorkspaceProjectView } from "../workspaces/WorkspaceProjectView";
import { useRunStreamController } from "../../runtime/useRunStreamController";
import { useUiStore } from "../../runtime/uiStore";
import { useTranslations } from "../../i18n";

const { Header, Sider, Content } = Layout;
const narrowViewportQuery = "(max-width: 760px)";

export function AppShell() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const t = useTranslations();
  const [activeView, setActiveView] = useState<
    "chat" | "observability" | "workspace"
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
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const isNarrowViewport = useNarrowViewport();

  const healthQuery = useQuery({
    queryKey: ["server-health"],
    queryFn: getHealth,
    refetchInterval: 8000,
  });
  const sidebarSessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
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
        active: activeView === "chat",
        icon: <MessageSquare size={15} />,
        key: "chat",
        label: t("appChat"),
        onSelect: () => {
          setActiveView("chat");
          closeSidebarOnNarrow();
        },
      },
      {
        icon: <Search size={15} />,
        key: "search",
        label: t("appSearch"),
        onSelect: () => window.dispatchEvent(new Event("agent-teams-focus-session-search")),
      },
      {
        active: activeView === "observability",
        icon: <Activity size={15} />,
        key: "observability",
        label: t("appObservability"),
        onSelect: () => {
          setActiveView("observability");
          closeSidebarOnNarrow();
        },
      },
      {
        icon: <Settings size={15} />,
        key: "settings",
        label: t("appSettings"),
        onSelect: () => setSettingsOpen(true),
      },
    ],
    [activeView, isNarrowViewport, setSidebarCollapsed, t],
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
          <Button
            onClick={() => setLanguage(language === "zh-CN" ? "en" : "zh-CN")}
            size="small"
          >
            {language === "zh-CN" ? t("languageChinese") : t("languageEnglish")}
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
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
              type="text"
            />
          </Tooltip>
          <Button
            className="at-health-button"
            icon={<RefreshCcw size={15} />}
            loading={healthQuery.isFetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: ["server-health"] })}
            size="small"
            style={{ borderColor: token.colorBorder }}
          >
            {healthLabel}
          </Button>
          <Button href="/" size="small">
            V1
          </Button>
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
              aria-valuemax={360}
              aria-valuemin={220}
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
          ) : activeView === "workspace" ? (
            <WorkspaceProjectView
              onBack={() => setActiveView("chat")}
              selectedWorkspaceId={selectedWorkspaceId}
              sessions={sidebarSessionsQuery.data ?? []}
            />
          ) : (
            <div className="at-chat-view">
              <RecoveryBar
                runStreamController={runStreamController}
                sessionId={selectedSessionId}
              />
              <MessageTimeline sessionId={selectedSessionId} />
              <SessionTokenUsage
                primaryRoleId={sessionDetailQuery.data?.normal_root_role_id ?? null}
                sessionId={selectedSessionId}
              />
              <Composer
                runStreamController={runStreamController}
                sessionId={selectedSessionId}
              />
            </div>
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
