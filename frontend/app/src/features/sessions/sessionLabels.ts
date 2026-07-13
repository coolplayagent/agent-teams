import type { SessionSidebarRecord } from "../../api/contracts";

export function sessionDisplayLabel(
  session: SessionSidebarRecord | null,
  fallbackLabel = "",
): string {
  if (session !== null) {
    const title = session.metadata?.title?.trim();
    if (title) {
      return title;
    }
    if (session.session_id.trim()) {
      return session.session_id;
    }
  }
  return fallbackLabel.trim() || "Agent Teams";
}
