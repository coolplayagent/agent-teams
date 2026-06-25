import type { WorkspaceRecord } from "../../api/contracts";

const genericWorkspaceIds = new Set(["default"]);
const defaultWorkspaceLabel = "Agent Teams";

export function workspaceDisplayLabel(
  workspace: WorkspaceRecord | null,
  fallbackLabel: string | null | undefined = defaultWorkspaceLabel,
): string {
  if (workspace !== null) {
    const explicitLabel = firstTrimmed(workspace.display_name, workspace.name);
    if (explicitLabel && !isGenericWorkspaceId(explicitLabel)) {
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
      return workspaceFallbackLabel(workspaceId);
    }
  }
  return workspaceFallbackLabel(fallbackLabel);
}

export function workspaceFallbackLabel(
  workspaceId: string | null | undefined,
  fallbackLabel = defaultWorkspaceLabel,
): string {
  const trimmedWorkspaceId = workspaceId?.trim() ?? "";
  if (!trimmedWorkspaceId || isGenericWorkspaceId(trimmedWorkspaceId)) {
    return fallbackLabel;
  }
  return trimmedWorkspaceId;
}

function isGenericWorkspaceId(workspaceId: string): boolean {
  return genericWorkspaceIds.has(workspaceId.toLowerCase());
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
