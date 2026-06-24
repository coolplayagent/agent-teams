import { Tag, Typography } from "antd";

import type { SessionSidebarRecord } from "../../api/contracts";
import { sessionDisplayLabel } from "../sessions/sessionLabels";

interface CurrentSessionIndicatorProps {
  selectedSessionId: string | null;
  session: SessionSidebarRecord | null;
  workspaceLabel: string;
}

export function CurrentSessionIndicator({
  selectedSessionId,
  session,
  workspaceLabel,
}: CurrentSessionIndicatorProps) {
  const label = sessionDisplayLabel(session, selectedSessionId ?? "Agent Teams");
  const status = session?.active_run_status || "";
  return (
    <div className="at-topbar-identity">
      <Typography.Text
        className="at-workspace-title"
        ellipsis
        title={workspaceLabel}
      >
        {workspaceLabel}
      </Typography.Text>
      <div className="at-current-session">
        <Typography.Text className="at-current-session-label" ellipsis title={label}>
          {label}
        </Typography.Text>
        {status ? <Tag color={statusColor(status)}>{status}</Tag> : null}
      </div>
    </div>
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
