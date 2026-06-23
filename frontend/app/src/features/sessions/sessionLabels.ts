import type { SessionSidebarRecord } from "../../api/contracts";

const labelMetadataKeys = ["title", "name", "label"] as const;

export function sessionDisplayLabel(
  session: SessionSidebarRecord | null,
  fallbackLabel = "",
): string {
  if (session !== null) {
    const metadataLabel = sessionMetadataLabel(session);
    if (metadataLabel) {
      return metadataLabel;
    }
    const legacyTitle = session.title?.trim();
    if (legacyTitle) {
      return legacyTitle;
    }
    if (session.session_id.trim()) {
      return session.session_id;
    }
  }
  return fallbackLabel.trim() || "Agent Teams";
}

function sessionMetadataLabel(session: SessionSidebarRecord): string {
  const metadata = session.metadata ?? {};
  for (const key of labelMetadataKeys) {
    const value = metadata[key];
    if (typeof value !== "string") {
      continue;
    }
    const label = value.trim();
    if (label) {
      return label;
    }
  }
  return "";
}
