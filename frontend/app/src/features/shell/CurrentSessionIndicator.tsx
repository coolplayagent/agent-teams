import { Typography } from "antd";

import type { SessionSidebarRecord } from "../../api/contracts";
import { type Translate, useTranslations } from "../../i18n";
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
  const t = useTranslations();
  const label = sessionDisplayLabel(session, selectedSessionId ?? "Agent Teams");
  const status = session?.active_run_status || "";
  const statusLabel = sessionStatusLabel(status, t);
  const accessibleSessionLabel = statusLabel ? `${label} ${statusLabel}` : label;
  return (
    <div
      aria-atomic="true"
      aria-label={accessibleSessionLabel}
      aria-live="polite"
      className="at-topbar-identity"
      role="status"
    >
      <Typography.Text
        className="at-session-title"
        ellipsis
        title={`${workspaceLabel} · ${label}`}
      >
        {label}
      </Typography.Text>
    </div>
  );
}

function sessionStatusLabel(status: string, t: Translate): string {
  switch (status.trim().toLowerCase()) {
    case "queued":
      return t("timelineRoundStatusQueued");
    case "running":
      return t("timelineRoundStatusRunning");
    case "stopping":
      return t("timelineRoundStatusStopping");
    case "paused":
      return t("timelineRoundStatusPaused");
    case "stopped":
      return t("timelineRoundStatusStopped");
    case "completed":
      return t("timelineRoundStatusCompleted");
    case "failed":
      return t("timelineRoundStatusFailed");
    default:
      return "";
  }
}
