import { Typography } from "antd";

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
  const accessibleSessionLabel = status ? `${label} ${status}` : label;
  return (
    <div className="at-topbar-identity" aria-label={accessibleSessionLabel}>
      <Typography.Text
        className="at-workspace-title"
        ellipsis
        title={workspaceLabel}
      >
        {workspaceLabel}
      </Typography.Text>
      <span className="at-sr-only">{accessibleSessionLabel}</span>
    </div>
  );
}
