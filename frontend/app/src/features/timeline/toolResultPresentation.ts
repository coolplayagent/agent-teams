interface WorkspaceReadPresentation {
  content?: unknown;
  entries?: unknown;
  kind: "workspace-read";
  path: string;
  resource_type: "directory" | "file" | "image" | "notebook";
}

export function fileReadResultText(value: unknown): string {
  const presentation = workspaceReadPresentation(value);
  if (presentation !== null) {
    return renderWorkspaceReadPresentation(presentation);
  }
  return genericPlainTextResult(value);
}

function workspaceReadPresentation(value: unknown): WorkspaceReadPresentation | null {
  const envelope = recordValue(value);
  if (envelope === null) {
    return null;
  }
  const data = recordValue(envelope.data) ?? envelope;
  const presentation = recordValue(data.presentation);
  if (
    presentation === null ||
    presentation.kind !== "workspace-read" ||
    typeof presentation.path !== "string" ||
    !isWorkspaceReadResourceType(presentation.resource_type)
  ) {
    return null;
  }
  return {
    content: presentation.content,
    entries: presentation.entries,
    kind: "workspace-read",
    path: presentation.path,
    resource_type: presentation.resource_type,
  };
}

function renderWorkspaceReadPresentation(value: WorkspaceReadPresentation): string {
  const metadata = [`Path: ${value.path}`, `Type: ${value.resource_type}`];
  const body = readPresentationBody(value);
  return body.length > 0 ? [...metadata, "", body].join("\n") : metadata.join("\n");
}

function readPresentationBody(value: WorkspaceReadPresentation): string {
  if (Array.isArray(value.entries)) {
    const entries = value.entries.filter((entry): entry is string => typeof entry === "string");
    if (entries.length > 0) {
      return entries.join("\n");
    }
  }
  if (typeof value.content === "string") {
    return value.content.trim();
  }
  if (value.content !== null && value.content !== undefined) {
    return JSON.stringify(value.content, null, 2);
  }
  return "";
}

function genericPlainTextResult(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string");
    return strings.length === value.length ? strings.join("\n").trim() : "";
  }
  const object = recordValue(value);
  if (object === null) {
    return "";
  }
  for (const key of ["data", "output", "result", "text", "content"] as const) {
    if (object[key] === undefined) {
      continue;
    }
    const text = genericPlainTextResult(object[key]);
    if (text.length > 0) {
      return text;
    }
  }
  return "";
}

function isWorkspaceReadResourceType(
  value: unknown,
): value is WorkspaceReadPresentation["resource_type"] {
  return value === "directory" || value === "file" || value === "image" || value === "notebook";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
