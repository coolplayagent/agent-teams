import {
  App,
  Button,
  Empty,
  Input,
  List,
  Select,
  Skeleton,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createSession, listSidebarSessions, listWorkspaces } from "../../api/client";
import type { SessionSidebarRecord, WorkspaceRecord } from "../../api/contracts";
import { useUiStore } from "../../runtime/uiStore";

export function SessionsSidebar() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const [filter, setFilter] = useState("");

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });

  const workspaceOptions = useMemo(
    () =>
      (workspacesQuery.data ?? []).map((workspace) => ({
        label: workspaceLabel(workspace),
        value: workspace.workspace_id,
      })),
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
  const effectiveWorkspaceId = selectedLoadedWorkspaceId ?? workspaceOptions[0]?.value ?? "";

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

  const sessions = useMemo(() => {
    const records = sessionsQuery.data ?? [];
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) {
      return records;
    }
    return records.filter((session) =>
      sessionLabel(session).toLowerCase().includes(normalizedFilter),
    );
  }, [filter, sessionsQuery.data]);

  return (
    <div className="at-sidebar-inner">
      <div className="at-sidebar-toolbar">
        <Input.Search
          allowClear
          aria-label="Search sessions"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search sessions"
          size="small"
          value={filter}
        />
        <Tooltip title="New session">
          <Button
            aria-label="New session"
            disabled={workspaceOptions.length === 0 || !effectiveWorkspaceId.trim()}
            icon={<Plus size={15} />}
            loading={createSessionMutation.isPending}
            onClick={() => createSessionMutation.mutate()}
            size="small"
            type="primary"
          />
        </Tooltip>
        <Button
          aria-label="Refresh sessions"
          icon={<RefreshCcw size={15} />}
          loading={sessionsQuery.isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] })}
          size="small"
          type="text"
        />
      </div>
      <Select
        aria-label="Workspace"
        className="at-workspace-select"
        disabled={workspaceOptions.length === 0}
        loading={workspacesQuery.isLoading}
        onChange={(workspaceId) => setSelectedWorkspaceId(workspaceId)}
        optionFilterProp="label"
        options={workspaceOptions}
        placeholder="Workspace"
        showSearch
        size="small"
        value={selectedLoadedWorkspaceId ?? undefined}
      />
      {sessionsQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {sessionsQuery.isError ? (
        <Empty description="Could not load sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 ? (
        <Empty description="No sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <List
        className="at-session-list"
        dataSource={sessions}
        renderItem={(session) => (
          <List.Item
            className={
              session.session_id === selectedSessionId
                ? "at-session-item is-selected"
                : "at-session-item"
            }
            onClick={() => setSelectedSessionId(session.session_id)}
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
          </List.Item>
        )}
      />
    </div>
  );
}

function sessionLabel(session: SessionSidebarRecord): string {
  return session.title?.trim() || session.session_id;
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
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
