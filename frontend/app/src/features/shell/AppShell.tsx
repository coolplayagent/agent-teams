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
import { useRunStreamController } from "../../runtime/useRunStreamController";
import { useUiStore } from "../../runtime/uiStore";

const { Header, Sider, Content } = Layout;

export function AppShell() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const [activeView, setActiveView] = useState<"chat" | "observability">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const runStreamController = useRunStreamController();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const themeMode = useUiStore((state) => state.themeMode);
  const language = useUiStore((state) => state.language);
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const [sidebarResizing, setSidebarResizing] = useState(false);

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
      return "Checking";
    }
    if (healthQuery.isError) {
      return "Offline";
    }
    return healthQuery.data?.status ?? "Ready";
  }, [healthQuery.data?.status, healthQuery.isError, healthQuery.isLoading]);
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
        label: "Chat",
        onSelect: () => setActiveView("chat"),
      },
      {
        icon: <Search size={15} />,
        key: "search",
        label: "Search",
        onSelect: () => window.dispatchEvent(new Event("agent-teams-focus-session-search")),
      },
      {
        active: activeView === "observability",
        icon: <Activity size={15} />,
        key: "observability",
        label: "Observability",
        onSelect: () => setActiveView("observability"),
      },
      {
        icon: <Settings size={15} />,
        key: "settings",
        label: "Settings",
        onSelect: () => setSettingsOpen(true),
      },
    ],
    [activeView],
  );

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
          <Tooltip title="Toggle sidebar">
            <Button
              aria-label="Toggle sidebar"
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
            {language === "zh-CN" ? "中文" : "EN"}
          </Button>
          <Tooltip title="Observability">
            <Button
              aria-label="Observability"
              icon={<Activity size={17} />}
              onClick={() => setActiveView("observability")}
              type={activeView === "observability" ? "default" : "text"}
            />
          </Tooltip>
          <MessageExportMenu messenger={message} sessionId={selectedSessionId} />
          <Tooltip title="Settings">
            <Button
              aria-label="Settings"
              icon={<Settings size={17} />}
              onClick={() => setSettingsOpen(true)}
              type="text"
            />
          </Tooltip>
          <Tooltip title="Toggle theme">
            <Button
              aria-label="Toggle theme"
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
        {!sidebarCollapsed ? (
          <Sider
            className={sidebarResizing ? "at-sidebar is-resizing" : "at-sidebar"}
            theme="light"
            width={sidebarWidth}
          >
            <SessionsSidebar navigationItems={sidebarNavigationItems} />
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
          ) : (
            <>
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
            </>
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
}
