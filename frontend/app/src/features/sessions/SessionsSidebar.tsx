import {
  App,
  Button,
  Empty,
  Input,
  List,
  Select,
  Skeleton,
  Space,
  Tag,
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
  const effectiveWorkspaceId =
    selectedWorkspaceId ?? workspaceOptions[0]?.value ?? "default";

  useEffect(() => {
    const workspaceIds = new Set((workspacesQuery.data ?? []).map((item) => item.workspace_id));
    const firstWorkspaceId = workspacesQuery.data?.[0]?.workspace_id;
    if (firstWorkspaceId === undefined) {
      return;
    }
    if (selectedWorkspaceId === null || !workspaceIds.has(selectedWorkspaceId)) {
      setSelectedWorkspaceId(firstWorkspaceId);
    }
  }, [selectedWorkspaceId, setSelectedWorkspaceId, workspacesQuery.data]);

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
        value={selectedWorkspaceId ?? undefined}
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
            <Space direction="vertical" size={4} className="at-session-copy">
              <Typography.Text ellipsis title={sessionLabel(session)}>
                {sessionLabel(session)}
              </Typography.Text>
              <Space size={4} wrap>
                {session.session_mode ? <Tag>{session.session_mode}</Tag> : null}
                {statusTag(session)}
              </Space>
            </Space>
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

function statusTag(session: SessionSidebarRecord) {
  const status = session.active_run_status || "";
  if (!status) {
    return null;
  }
  const color =
    status === "running" || status === "queued"
      ? "processing"
      : status === "failed"
        ? "error"
        : status === "stopped"
          ? "warning"
          : "default";
  return <Tag color={color}>{status}</Tag>;
}
