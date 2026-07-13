import type { WorkspaceRecord } from "../../api/contracts";

const defaultWorkspaceLabel = "Agent Teams";

export function workspaceDisplayLabel(
  workspace: WorkspaceRecord | null,
  fallbackLabel: string | null | undefined = defaultWorkspaceLabel,
): string {
  if (workspace !== null) {
    const explicitLabel = firstTrimmed(workspace.display_name, workspace.name);
    if (explicitLabel) {
      return explicitLabel;
    }
    const workspaceId = workspace.workspace_id.trim();
    const rootLabel = rootPathLabel(workspace.root_path);
    if (rootLabel) {
      return rootLabel;
    }
    if (workspaceId) {
      return workspaceId;
    }
  }
  return workspaceFallbackLabel(fallbackLabel);
}

export function workspaceFallbackLabel(
  workspaceId: string | null | undefined,
  fallbackLabel = defaultWorkspaceLabel,
): string {
  const trimmedWorkspaceId = workspaceId?.trim() ?? "";
  if (!trimmedWorkspaceId) {
    return fallbackLabel;
  }
  return trimmedWorkspaceId;
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
