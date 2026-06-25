import type { WorkspaceRecord } from "../../api/contracts";

const genericWorkspaceIds = new Set(["default"]);

export function workspaceDisplayLabel(
  workspace: WorkspaceRecord | null,
  fallbackLabel = "Agent Teams",
): string {
  if (workspace !== null) {
    const explicitLabel = firstTrimmed(workspace.display_name, workspace.name);
    if (explicitLabel) {
      return explicitLabel;
    }
    const workspaceId = workspace.workspace_id.trim();
    if (workspaceId && !genericWorkspaceIds.has(workspaceId.toLowerCase())) {
      return workspaceId;
    }
    const rootLabel = rootPathLabel(workspace.root_path);
    if (rootLabel) {
      return rootLabel;
    }
    if (workspaceId) {
      return workspaceId;
    }
  }
  return fallbackLabel.trim() || "Agent Teams";
}

function rootPathLabel(rootPath: string): string {
  const normalizedPath = rootPath.trim().replace(/[\\/]+$/, "");
  if (!normalizedPath) {
    return "";
  }
  const segments = normalizedPath.split(/[\\/]+/);
  return segments[segments.length - 1]?.trim() ?? "";
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}
