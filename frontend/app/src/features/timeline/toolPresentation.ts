export type ToolSemanticCategory =
  | "execution"
  | "file-edit"
  | "file-read"
  | "interactive"
  | "memory-artifact"
  | "orchestration"
  | "planning"
  | "unknown"
  | "web";

export type ToolActionFamily =
  | "edit"
  | "generic"
  | "read"
  | "run"
  | "search"
  | "subagent";

const FILE_EDIT_TOKENS = [
  "apply_patch",
  "diff",
  "edit",
  "notebook_edit",
  "patch",
  "replace",
  "write",
];
const FILE_READ_TOKENS = ["glob", "grep", "list_directory", "read", "rg"];
const EXECUTION_TOKENS = [
  "background_task",
  "command",
  "exec",
  "process",
  "run_command",
  "shell",
  "terminal",
];
const WEB_TOKENS = ["browser", "fetch", "search", "url", "web"];
const ORCHESTRATION_TOKENS = [
  "activate_skill_roles",
  "create_task",
  "dispatch_task",
  "orchestration",
  "spawn_subagent",
  "subagent",
  "update_task",
];
const INTERACTIVE_TOKENS = ["approval", "ask_question", "confirm", "select"];
const PLANNING_TOKENS = ["plan", "todo"];
const MEMORY_ARTIFACT_TOKENS = ["artifact", "attachment", "memory"];

export function toolSemanticCategory(toolName: string): ToolSemanticCategory {
  const normalized = normalizedToolName(toolName);
  if (containsToken(normalized, ORCHESTRATION_TOKENS)) {
    return "orchestration";
  }
  if (containsToken(normalized, INTERACTIVE_TOKENS)) {
    return "interactive";
  }
  if (containsToken(normalized, PLANNING_TOKENS)) {
    return "planning";
  }
  if (containsToken(normalized, MEMORY_ARTIFACT_TOKENS)) {
    return "memory-artifact";
  }
  if (containsToken(normalized, FILE_EDIT_TOKENS)) {
    return "file-edit";
  }
  if (containsToken(normalized, EXECUTION_TOKENS)) {
    return "execution";
  }
  if (containsToken(normalized, WEB_TOKENS)) {
    return "web";
  }
  if (
    containsToken(normalized, FILE_READ_TOKENS) ||
    normalized.includes("find_file") ||
    normalized.includes("list_file") ||
    normalized === "open"
  ) {
    return "file-read";
  }
  return "unknown";
}

export function toolActionFamily(toolName: string): ToolActionFamily {
  const category = toolSemanticCategory(toolName);
  if (category === "orchestration") {
    return "subagent";
  }
  if (category === "execution") {
    return "run";
  }
  if (category === "file-edit") {
    return "edit";
  }
  if (category === "web") {
    return "search";
  }
  if (category === "file-read") {
    const normalized = normalizedToolName(toolName);
    return containsToken(normalized, ["glob", "grep", "rg", "find"])
      ? "search"
      : "read";
  }
  return "generic";
}

export function humanReadableToolText(toolName: string, text: string): string {
  const parsed = parseStructuredText(text);
  if (parsed === null) {
    return text;
  }
  const stringList = readableStringList(parsed);
  if (stringList !== null) {
    return stringList.map((item) => `- ${item}`).join("\n");
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return JSON.stringify(parsed, null, 2);
  }
  const parsedObject = recordValue(parsed);
  if (parsedObject === null) {
    return JSON.stringify(parsed, null, 2);
  }
  const displayObject = visibleToolEnvelope(parsedObject);
  const entries = Object.entries(displayObject);
  if (entries.length === 0) {
    return "(empty)";
  }
  const concise = entries.every(([, value]) => isReadableScalar(value));
  if (concise || toolSemanticCategory(toolName) !== "unknown") {
    return entries.map(([key, value]) => readableObjectLine(key, value)).join("\n");
  }
  return JSON.stringify(parsed, null, 2);
}

export function toolDurationMs(text: string): number | null {
  const parsed = parseStructuredText(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const parsedObject = recordValue(parsed);
  if (parsedObject === null) {
    return null;
  }
  const direct = nonNegativeNumber(parsedObject.duration_ms);
  if (direct !== null) {
    return direct;
  }
  const meta = recordValue(parsedObject.meta);
  return meta === null ? null : nonNegativeNumber(meta.duration_ms);
}

export function formatToolDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function normalizedToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replaceAll("-", "_");
}

function containsToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value === token || value.includes(token));
}

function parseStructuredText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function readableStringList(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  for (const key of ["entries", "files", "items", "matches", "paths", "results"]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
      return candidate;
    }
  }
  return null;
}

function isReadableScalar(value: unknown): boolean {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function readableObjectLine(key: string, value: unknown): string {
  const label = key.replaceAll("_", " ");
  if (isReadableScalar(value)) {
    return `${label}: ${value === null ? "none" : String(value)}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${label}: none`;
    }
    if (value.every(isReadableScalar)) {
      return `${label}: ${value.map((item) => item === null ? "none" : String(item)).join(", ")}`;
    }
  }
  return `${label}:\n${indent(JSON.stringify(value, null, 2))}`;
}

function visibleToolEnvelope(value: Record<string, unknown>): Record<string, unknown> {
  if (!("ok" in value) || !("data" in value || "error" in value)) {
    return value;
  }
  const visible: Record<string, unknown> = {};
  if (value.error !== undefined && value.error !== null && value.error !== "") {
    visible.error = value.error;
  }
  const data = recordValue(value.data);
  if (data !== null) {
    Object.assign(visible, data);
  } else if (value.data !== undefined && value.data !== null) {
    visible.result = value.data;
  }
  if (Object.keys(visible).length === 0) {
    visible.status = value.ok === true ? "completed" : "failed";
  }
  return visible;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function indent(value: string): string {
  return value.split("\n").map((line) => `  ${line}`).join("\n");
}
