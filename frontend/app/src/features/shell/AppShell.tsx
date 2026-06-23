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
  Download,
  Menu,
  Moon,
  RefreshCcw,
  Settings,
  Sun,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  getHealth,
  getSession,
  listSessionMessages,
  listSidebarSessions,
} from "../../api/client";
import { Composer } from "../composer/Composer";
import { CurrentSessionIndicator } from "./CurrentSessionIndicator";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { SessionTokenUsage } from "./SessionTokenUsage";
import { SessionsSidebar } from "../sessions/SessionsSidebar";
import { SettingsDrawer } from "./SettingsDrawer";
import { MessageTimeline } from "../timeline/MessageTimeline";
import { useRunStreamController } from "../../runtime/useRunStreamController";
import { useUiStore } from "../../runtime/uiStore";
import { contentPartText, type TimelineMessage } from "../../api/contracts";

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
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setLanguage = useUiStore((state) => state.setLanguage);

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
          <Tooltip title="Export messages">
            <Button
              aria-label="Export messages"
              icon={<Download size={17} />}
              onClick={() => {
                void exportCurrentSessionMessages(selectedSessionId, message);
              }}
              type="text"
            />
          </Tooltip>
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
          <Sider className="at-sidebar" theme="light" width={sidebarWidth}>
            <SessionsSidebar />
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
}

async function exportCurrentSessionMessages(
  sessionId: string | null,
  messenger: ReturnType<typeof App.useApp>["message"],
): Promise<void> {
  if (sessionId === null) {
    void messenger.warning("Select a session before exporting.");
    return;
  }
  const messages = await listSessionMessages(sessionId);
  const html = buildMessagesHtml(sessionId, messages);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sessionId}-messages.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  void messenger.success("Messages exported.");
}

function buildMessagesHtml(sessionId: string, messages: TimelineMessage[]): string {
  const rows = messages
    .map(
      (item) => `
        <article class="message">
          <div class="role">${escapeHtml(item.role_id ?? item.role ?? "agent")}</div>
          <pre>${escapeHtml(messageText(item))}</pre>
        </article>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sessionId)} messages</title>
  <style>
    body { margin: 32px; font-family: sans-serif; color: #20231f; background: #f6f6f3; }
    .message { padding: 14px 0; border-bottom: 1px solid #d8d8d0; }
    .role { color: #62665f; font-size: 12px; margin-bottom: 6px; }
    pre { margin: 0; white-space: pre-wrap; font: inherit; }
  </style>
</head>
<body>
  <h1>${escapeHtml(sessionId)}</h1>
  ${rows || "<p>No messages.</p>"}
</body>
</html>`;
}

function messageText(messageItem: TimelineMessage): string {
  if (typeof messageItem.content === "string" && messageItem.content.trim()) {
    return messageItem.content;
  }
  for (const part of messageItem.parts ?? []) {
    const text = contentPartText(part);
    if (text !== null) {
      return text;
    }
  }
  return "message";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
