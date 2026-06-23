import { Tag, Typography } from "antd";

import type { SessionSidebarRecord } from "../../api/contracts";

interface CurrentSessionIndicatorProps {
  selectedSessionId: string | null;
  session: SessionSidebarRecord | null;
}

export function CurrentSessionIndicator({
  selectedSessionId,
  session,
}: CurrentSessionIndicatorProps) {
  const label = sessionLabel(session, selectedSessionId);
  const status = session?.active_run_status || "";
  return (
    <div className="at-current-session">
      <Typography.Text className="at-workspace-title" ellipsis title={label}>
        {label}
      </Typography.Text>
      {status ? <Tag color={statusColor(status)}>{status}</Tag> : null}
    </div>
  );
}

function sessionLabel(
  session: SessionSidebarRecord | null,
  selectedSessionId: string | null,
): string {
  return (
    session?.title?.trim() ||
    session?.session_id ||
    selectedSessionId?.trim() ||
    "Agent Teams"
  );
}

function statusColor(status: string): string {
  if (status === "running" || status === "queued") {
    return "processing";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "stopped") {
    return "warning";
  }
  return "default";
}
