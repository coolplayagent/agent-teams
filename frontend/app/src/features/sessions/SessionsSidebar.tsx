import {
  App,
  Button,
  Empty,
  Input,
  Skeleton,
  Tooltip,
  Typography,
} from "antd";
import type { InputRef } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderSearch,
  Plus,
  RefreshCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createSession, listSidebarSessions, listWorkspaces } from "../../api/client";
import type { SessionSidebarRecord, WorkspaceRecord } from "../../api/contracts";
import { useUiStore, type Language } from "../../runtime/uiStore";
import { useTranslations, type Translate } from "../../i18n";
import { sessionDisplayLabel } from "./sessionLabels";

const initialVisibleSessionsPerGroup = 10;
const visibleSessionIncrement = 20;

export interface SidebarNavigationItem {
  active?: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  onSelect: () => void;
}

interface SessionsSidebarProps {
  navigationItems?: SidebarNavigationItem[];
  onOpenWorkspaceView?: () => void;
  onSessionSelected?: () => void;
  workspaceViewActive?: boolean;
}

export function SessionsSidebar({
  navigationItems = [],
  onOpenWorkspaceView,
  onSessionSelected,
  workspaceViewActive = false,
}: SessionsSidebarProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const language = useUiStore((state) => state.language);
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const [filter, setFilter] = useState("");
  const [visibleSessionLimits, setVisibleSessionLimits] = useState<
    Record<string, number>
  >({});
  const [workspaceExpanded, setWorkspaceExpanded] = useState<
    Record<string, boolean>
  >({});
  const searchInputRef = useRef<InputRef>(null);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });

  const workspaceOptions = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const loadedWorkspaceIds = useMemo(
    () => new Set((workspacesQuery.data ?? []).map((item) => item.workspace_id)),
    [workspacesQuery.data],
  );
  const selectedLoadedWorkspaceId =
    selectedWorkspaceId !== null && loadedWorkspaceIds.has(selectedWorkspaceId)
      ? selectedWorkspaceId
      : null;
  const effectiveWorkspaceId =
    selectedLoadedWorkspaceId ?? workspaceOptions[0]?.workspace_id ?? "";

  useEffect(() => {
    const firstWorkspaceId = workspacesQuery.data?.[0]?.workspace_id;
    if (firstWorkspaceId === undefined) {
      return;
    }
    if (selectedWorkspaceId === null || !loadedWorkspaceIds.has(selectedWorkspaceId)) {
      setSelectedWorkspaceId(firstWorkspaceId);
    }
  }, [
    loadedWorkspaceIds,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesQuery.data,
  ]);
  useEffect(() => {
    const focusSearch = (event: globalThis.Event) => {
      if (event instanceof KeyboardEvent) {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
          return;
        }
        event.preventDefault();
      }
      searchInputRef.current?.focus();
    };
    window.addEventListener("agent-teams-focus-session-search", focusSearch);
    window.addEventListener("keydown", focusSearch);
    return () => {
      window.removeEventListener("agent-teams-focus-session-search", focusSearch);
      window.removeEventListener("keydown", focusSearch);
    };
  }, []);

  const createSessionMutation = useMutation({
    mutationFn: () => createSession({ workspace_id: effectiveWorkspaceId }),
    onSuccess: (session) => {
      setSelectedWorkspaceId(session.workspace_id);
      setSelectedSessionId(session.session_id);
      onSessionSelected?.();
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", session.session_id] });
      void message.success(t("sidebarCreated"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarCreateFailed"),
      );
    },
  });

  const filteredSessions = useMemo(() => {
    const records = sessionsQuery.data ?? [];
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) {
      return records;
    }
    const workspaceLabels = new Map(
      workspaceOptions.map((workspace) => [
        workspace.workspace_id,
        workspaceLabel(workspace).toLowerCase(),
      ]),
    );
    return records.filter((session) => {
      const workspaceId = session.workspace_id ?? "";
      const workspaceSearch = workspaceLabels.get(workspaceId) ?? workspaceId;
      return (
        sessionLabel(session).toLowerCase().includes(normalizedFilter) ||
        workspaceSearch.includes(normalizedFilter)
      );
    });
  }, [filter, sessionsQuery.data, workspaceOptions]);
  const isFiltering = filter.trim().length > 0;
  const includeEmptyWorkspaces = !isFiltering;
  const sessionGroups = useMemo(
    () => buildSessionGroups(workspaceOptions, filteredSessions, includeEmptyWorkspaces),
    [filteredSessions, includeEmptyWorkspaces, workspaceOptions],
  );
  const totalVisibleSessions = sessionGroups.reduce(
    (total, group) => total + group.sessions.length,
    0,
  );

  return (
    <div className="at-sidebar-inner">
      <Button
        block
        className="at-sidebar-new-session"
        disabled={workspaceOptions.length === 0 || !effectiveWorkspaceId.trim()}
        icon={<Plus size={15} />}
        loading={createSessionMutation.isPending}
        onClick={() => createSessionMutation.mutate()}
        type="primary"
      >
        {t("sidebarNewSession")}
      </Button>
      {navigationItems.length > 0 ? (
        <nav aria-label={t("sidebarPrimaryNavigation")} className="at-sidebar-nav">
          {navigationItems.map((item) => (
            <button
              aria-current={item.active ? "page" : undefined}
              className={
                item.active ? "at-sidebar-nav-item is-active" : "at-sidebar-nav-item"
              }
              key={item.key}
              onClick={item.onSelect}
              type="button"
            >
              {item.icon !== undefined ? (
                <span aria-hidden="true" className="at-sidebar-nav-icon">
                  {item.icon}
                </span>
              ) : null}
              <span className="at-sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      ) : null}
      <div className="at-sidebar-section-header">
        <span>{t("sidebarWorkspaces")}</span>
        <div className="at-sidebar-section-actions">
          <span>{sessionGroups.length}</span>
          {onOpenWorkspaceView !== undefined ? (
            <Tooltip title={t("sidebarOpenWorkspaceView")}>
              <Button
                aria-label={t("sidebarOpenWorkspaceView")}
                aria-pressed={workspaceViewActive}
                className={workspaceViewActive ? "is-active" : undefined}
                disabled={workspaceOptions.length === 0}
                icon={<FolderSearch size={14} />}
                onClick={onOpenWorkspaceView}
                size="small"
                type="text"
              />
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="at-sidebar-search-row">
        <Input.Search
          allowClear
          aria-label={t("sidebarSearchSessions")}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("sidebarSearchSessions")}
          ref={searchInputRef}
          size="small"
          value={filter}
        />
        <Button
          aria-label={t("sidebarRefreshSessions")}
          icon={<RefreshCcw size={15} />}
          loading={sessionsQuery.isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] })}
          size="small"
          type="text"
        />
      </div>
      {sessionsQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {sessionsQuery.isError ? (
        <Empty description={t("sidebarSessionsLoadError")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {!sessionsQuery.isLoading &&
      !sessionsQuery.isError &&
      totalVisibleSessions === 0 &&
      sessionGroups.length === 0 ? (
        <Empty description={t("sidebarNoSessions")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <div className="at-session-list">
        {sessionGroups.map((group) => {
          const groupExpanded = isFiltering || workspaceExpanded[group.id] !== false;
          const visibleSessions = visibleSessionsForGroup(
            group,
            selectedSessionId,
            visibleSessionLimits[group.id],
            isFiltering,
          );
          const hiddenSessionCount = group.sessions.length - visibleSessions.length;
          return (
            <section className="at-workspace-group" key={group.id}>
              <div
                className={
                  group.id === selectedWorkspaceId
                    ? "at-workspace-group-header is-selected"
                    : "at-workspace-group-header"
                }
                title={group.pathHint || group.label}
              >
                <button
                  aria-expanded={groupExpanded}
                  aria-label={t(
                    groupExpanded ? "sidebarCollapse" : "sidebarExpand",
                    { label: group.label },
                  )}
                  className="at-workspace-group-toggle"
                  onClick={() => toggleWorkspaceGroup(group.id)}
                  type="button"
                >
                  <FolderClosed aria-hidden="true" size={15} />
                  {groupExpanded ? (
                    <ChevronDown aria-hidden="true" size={13} />
                  ) : (
                    <ChevronRight aria-hidden="true" size={13} />
                  )}
                </button>
                <button
                  className="at-workspace-group-title-button"
                  onClick={() => setSelectedWorkspaceId(group.id)}
                  type="button"
                >
                  <span className="at-workspace-group-title">{group.label}</span>
                </button>
                <span className="at-workspace-group-count">{group.sessions.length}</span>
              </div>
              {groupExpanded && group.sessions.length === 0 ? (
                <div className="at-workspace-group-empty">{t("sidebarNoSessions")}</div>
              ) : null}
              {groupExpanded && group.sessions.length > 0 ? (
                <div className="at-workspace-group-sessions">
                  {visibleSessions.map((session) => (
                    <button
                      aria-current={
                        session.session_id === selectedSessionId ? "page" : undefined
                      }
                      className={
                        session.session_id === selectedSessionId
                          ? "at-session-item is-selected"
                          : "at-session-item"
                      }
                      key={session.session_id}
                      onClick={() => {
                        if (session.workspace_id) {
                          setSelectedWorkspaceId(session.workspace_id);
                        }
                        setSelectedSessionId(session.session_id);
                        onSessionSelected?.();
                      }}
                      title={sessionLabel(session)}
                      type="button"
                    >
                      <div className="at-session-copy">
                        <Typography.Text
                          className="at-session-label"
                          ellipsis
                          title={sessionLabel(session)}
                        >
                          {sessionLabel(session)}
                        </Typography.Text>
                        {sessionMeta(session, t, language)}
                      </div>
                    </button>
                  ))}
                  {hiddenSessionCount > 0 ? (
                    <button
                      aria-label={t("sidebarShowMoreInWorkspace", {
                        label: group.label,
                      })}
                      className="at-workspace-group-more"
                      onClick={() => showMoreSessions(group.id)}
                      type="button"
                    >
                      <ChevronDown aria-hidden="true" size={14} />
                      <span>{t("sidebarShowMore")}</span>
                      <span className="at-workspace-group-more-count">
                        {visibleSessions.length}/{group.sessions.length}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );

  function showMoreSessions(groupId: string) {
    setVisibleSessionLimits((current) => ({
      ...current,
      [groupId]:
        (current[groupId] ?? initialVisibleSessionsPerGroup) +
        visibleSessionIncrement,
    }));
  }

  function toggleWorkspaceGroup(groupId: string) {
    setWorkspaceExpanded((current) => ({
      ...current,
      [groupId]: current[groupId] === false,
    }));
  }
}

interface SessionGroup {
  id: string;
  label: string;
  pathHint: string;
  sessions: SessionSidebarRecord[];
  updatedAt: number;
}

function sessionLabel(session: SessionSidebarRecord): string {
  return sessionDisplayLabel(session, session.session_id);
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
}

function buildSessionGroups(
  workspaces: WorkspaceRecord[],
  sessions: SessionSidebarRecord[],
  includeEmptyWorkspaces: boolean,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.workspace_id, workspace]),
  );
  if (includeEmptyWorkspaces) {
    workspaces.forEach((workspace) => {
      groups.set(workspace.workspace_id, {
        id: workspace.workspace_id,
        label: workspaceLabel(workspace),
        pathHint: workspace.root_path,
        sessions: [],
        updatedAt: 0,
      });
    });
  }
  sessions.forEach((session) => {
    const workspaceId = session.workspace_id?.trim() || "unknown";
    const existing = groups.get(workspaceId);
    const workspace = workspaceById.get(workspaceId);
    const group = existing ?? {
      id: workspaceId,
      label: workspace === undefined ? workspaceId : workspaceLabel(workspace),
      pathHint: workspace?.root_path ?? "",
      sessions: [],
      updatedAt: 0,
    };
    group.sessions.push(session);
    group.updatedAt = Math.max(group.updatedAt, sessionTimestampValue(session));
    groups.set(workspaceId, group);
  });
  return Array.from(groups.values())
    .map((group) => {
      const sortedSessions = sortSessions(group.sessions);
      return {
        ...group,
        sessions: sortedSessions,
        updatedAt: group.updatedAt,
      };
    })
    .sort((left, right) => (
      right.updatedAt - left.updatedAt ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id)
    ));
}

function sortSessions(sessions: SessionSidebarRecord[]): SessionSidebarRecord[] {
  return [...sessions].sort((left, right) => (
    sessionTimestampValue(right) - sessionTimestampValue(left) ||
    sessionLabel(left).localeCompare(sessionLabel(right)) ||
    left.session_id.localeCompare(right.session_id)
  ));
}

function visibleSessionsForGroup(
  group: SessionGroup,
  selectedSessionId: string | null,
  visibleLimit: number | undefined,
  isFiltering: boolean,
): SessionSidebarRecord[] {
  if (isFiltering) {
    return group.sessions;
  }
  const limit = Math.max(
    initialVisibleSessionsPerGroup,
    visibleLimit ?? initialVisibleSessionsPerGroup,
  );
  if (group.sessions.length <= limit) {
    return group.sessions;
  }
  const selectedIndex = group.sessions.findIndex(
    (session) => session.session_id === selectedSessionId,
  );
  if (selectedIndex >= limit && limit > 1) {
    return [
      ...group.sessions.slice(0, limit - 1),
      group.sessions[selectedIndex],
    ];
  }
  return group.sessions.slice(0, limit);
}

function sessionTimestampValue(session: SessionSidebarRecord): number {
  const value = session.updated_at;
  if (value === undefined || !value.trim()) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sessionMeta(session: SessionSidebarRecord, t: Translate, language: Language) {
  const status = session.active_run_status || "";
  const updatedAt = formatRelativeTime(session.updated_at, language);
  const backgroundTaskCount = positiveCount(session.background_task_count);
  const pendingApprovalCount = positiveCount(session.pending_tool_approval_count);
  const pendingQuestionCount = positiveCount(session.pending_user_question_count);
  if (
    !status &&
    !updatedAt &&
    backgroundTaskCount === 0 &&
    pendingApprovalCount === 0 &&
    pendingQuestionCount === 0
  ) {
    return null;
  }
  return (
    <span className="at-session-meta">
      {status ? (
        <span
          className={`at-session-status is-${status}`}
          title={t("sidebarRunStatus", { status })}
        >
          {status}
        </span>
      ) : null}
      {backgroundTaskCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarBackgroundTasks", { count: backgroundTaskCount })}
        >
          bg {backgroundTaskCount}
        </span>
      ) : null}
      {pendingApprovalCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarPendingApprovals", { count: pendingApprovalCount })}
        >
          ap {pendingApprovalCount}
        </span>
      ) : null}
      {pendingQuestionCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarPendingQuestions", { count: pendingQuestionCount })}
        >
          q {pendingQuestionCount}
        </span>
      ) : null}
      {updatedAt ? <span title={session.updated_at}>{updatedAt}</span> : null}
    </span>
  );
}

function positiveCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function formatRelativeTime(value: string | undefined, language: Language): string {
  if (value === undefined || !value.trim()) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs < minuteMs) {
    return language === "zh-CN" ? "现在" : "now";
  }
  if (elapsedMs < hourMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / minuteMs)}分`
      : `${Math.floor(elapsedMs / minuteMs)}m`;
  }
  if (elapsedMs < dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / hourMs)}时`
      : `${Math.floor(elapsedMs / hourMs)}h`;
  }
  if (elapsedMs < 7 * dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / dayMs)}天`
      : `${Math.floor(elapsedMs / dayMs)}d`;
  }
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}
