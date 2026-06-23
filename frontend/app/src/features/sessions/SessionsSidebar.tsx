import {
  App,
  Button,
  Empty,
  Input,
  Skeleton,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FolderClosed, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createSession, listSidebarSessions, listWorkspaces } from "../../api/client";
import type { SessionSidebarRecord, WorkspaceRecord } from "../../api/contracts";
import { useUiStore } from "../../runtime/uiStore";
import { sessionDisplayLabel } from "./sessionLabels";

const initialVisibleSessionsPerGroup = 10;
const visibleSessionIncrement = 20;

export function SessionsSidebar() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const [filter, setFilter] = useState("");
  const [visibleSessionLimits, setVisibleSessionLimits] = useState<
    Record<string, number>
  >({});

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

  const createSessionMutation = useMutation({
    mutationFn: () => createSession({ workspace_id: effectiveWorkspaceId }),
    onSuccess: (session) => {
      setSelectedWorkspaceId(session.workspace_id);
      setSelectedSessionId(session.session_id);
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", session.session_id] });
      void message.success("Session created.");
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Session creation failed.",
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
        New session
      </Button>
      <div className="at-sidebar-search-row">
        <Input.Search
          allowClear
          aria-label="Search sessions"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search sessions"
          size="small"
          value={filter}
        />
        <Button
          aria-label="Refresh sessions"
          icon={<RefreshCcw size={15} />}
          loading={sessionsQuery.isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] })}
          size="small"
          type="text"
        />
      </div>
      {sessionsQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {sessionsQuery.isError ? (
        <Empty description="Could not load sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {!sessionsQuery.isLoading &&
      !sessionsQuery.isError &&
      totalVisibleSessions === 0 &&
      sessionGroups.length === 0 ? (
        <Empty description="No sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <div className="at-session-list">
        {sessionGroups.map((group) => {
          const visibleSessions = visibleSessionsForGroup(
            group,
            selectedSessionId,
            visibleSessionLimits[group.id],
            isFiltering,
          );
          const hiddenSessionCount = group.sessions.length - visibleSessions.length;
          return (
            <section className="at-workspace-group" key={group.id}>
              <button
                className={
                  group.id === selectedWorkspaceId
                    ? "at-workspace-group-header is-selected"
                    : "at-workspace-group-header"
                }
                onClick={() => setSelectedWorkspaceId(group.id)}
                title={group.pathHint || group.label}
                type="button"
              >
                <FolderClosed aria-hidden="true" size={15} />
                <span className="at-workspace-group-title">{group.label}</span>
                <span className="at-workspace-group-count">{group.sessions.length}</span>
              </button>
              {group.sessions.length === 0 ? (
                <div className="at-workspace-group-empty">No sessions</div>
              ) : (
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
                        {sessionMeta(session)}
                      </div>
                    </button>
                  ))}
                  {hiddenSessionCount > 0 ? (
                    <button
                      aria-label={`Show more sessions in ${group.label}`}
                      className="at-workspace-group-more"
                      onClick={() => showMoreSessions(group.id)}
                      type="button"
                    >
                      <ChevronDown aria-hidden="true" size={14} />
                      <span>Show more</span>
                      <span className="at-workspace-group-more-count">
                        {visibleSessions.length}/{group.sessions.length}
                      </span>
                    </button>
                  ) : null}
                </div>
              )}
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

function sessionMeta(session: SessionSidebarRecord) {
  const status = session.active_run_status || "";
  const updatedAt = formatRelativeTime(session.updated_at);
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
          title={`Run status: ${status}`}
        >
          {status}
        </span>
      ) : null}
      {backgroundTaskCount > 0 ? (
        <span
          className="at-session-background"
          title={`${backgroundTaskCount} background tasks`}
        >
          bg {backgroundTaskCount}
        </span>
      ) : null}
      {pendingApprovalCount > 0 ? (
        <span
          className="at-session-background"
          title={`${pendingApprovalCount} pending approvals`}
        >
          ap {pendingApprovalCount}
        </span>
      ) : null}
      {pendingQuestionCount > 0 ? (
        <span
          className="at-session-background"
          title={`${pendingQuestionCount} pending questions`}
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

function formatRelativeTime(value: string | undefined): string {
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
    return "now";
  }
  if (elapsedMs < hourMs) {
    return `${Math.floor(elapsedMs / minuteMs)}m`;
  }
  if (elapsedMs < dayMs) {
    return `${Math.floor(elapsedMs / hourMs)}h`;
  }
  if (elapsedMs < 7 * dayMs) {
    return `${Math.floor(elapsedMs / dayMs)}d`;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}
