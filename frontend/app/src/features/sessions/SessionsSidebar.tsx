import { Button, Empty, Input, List, Skeleton, Space, Tag, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { listSidebarSessions } from "../../api/client";
import type { SessionSidebarRecord } from "../../api/contracts";
import { useUiStore } from "../../runtime/uiStore";

export function SessionsSidebar() {
  const queryClient = useQueryClient();
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const [filter, setFilter] = useState("");

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
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
