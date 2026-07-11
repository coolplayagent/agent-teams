import type { JsonValue } from "../api/contracts";
import {
  eventDedupeKey,
  isTerminalRunEvent,
  parseRunEvent,
  type RunEventEnvelope,
  type RunEventType,
  type StreamStatus,
} from "./events";

export interface TimelineEntry {
  id: string;
  sessionId: string;
  runId: string;
  instanceId?: string;
  roleId: string;
  kind: RunEventType | "message";
  text: string;
  payload: JsonValue;
  eventId: number;
  occurredAt: string;
}

export interface RuntimeRunState {
  runId: string;
  sessionId?: string;
  promptText?: string;
  createdAt?: string;
  targetRoleId?: string;
  scope?: "session" | "subagent";
  status: StreamStatus;
  lastEventId: number;
  hadVisibleTextStream?: boolean;
  replayAfterEventId?: number;
  seenEventIdRanges?: Array<[number, number]>;
  seenEventKeys: string[];
  terminalEventType: RunEventType | null;
  entries: TimelineEntry[];
}

export interface RuntimeState {
  runs: Record<string, RuntimeRunState>;
  activeRunIds: string[];
}

export const MAX_SEEN_EVENT_KEYS = 512;
const SUBAGENT_REFERENCE_MAX_DEPTH = 8;
const RAW_TEXT_PAYLOAD_KEYS = new Set(["text", "delta", "content", "message"]);
const SUBAGENT_EXPLICIT_RUN_KEYS = ["subagent_run_id", "subagentRunId"] as const;
const SUBAGENT_COMPANION_RUN_KEYS = ["run_id", "runId"] as const;

export const initialRuntimeState: RuntimeState = {
  runs: {},
  activeRunIds: [],
};

export function runtimeStateWithScopedRun(
  runtimeState: RuntimeState,
  runId: string,
  sessionId: string,
  scope: NonNullable<RuntimeRunState["scope"]>,
): RuntimeState {
  const normalizedRunId = runId.trim();
  if (normalizedRunId.length === 0) {
    return runtimeState;
  }
  const nextRun = runtimeRunStateWithScope(
    runtimeState.runs[normalizedRunId],
    normalizedRunId,
    sessionId,
    scope,
  );
  if (nextRun === runtimeState.runs[normalizedRunId]) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    runs: {
      ...runtimeState.runs,
      [normalizedRunId]: nextRun,
    },
  };
}

export function reduceRunEvent(
  state: RuntimeState,
  rawEvent: RunEventEnvelope,
): RuntimeState {
  const event = parseRunEvent(rawEvent);
  const runId = event.run_id;
  const existing = state.runs[runId] ?? createRunState(runId);
  const rawEventId = event.event_id;
  const hasPositiveEventId = typeof rawEventId === "number" && rawEventId > 0;
  if (hasPositiveEventId && rawEventId <= (existing.replayAfterEventId ?? 0)) {
    return state;
  }
  const positiveEventDedupeKey = hasPositiveEventId
    ? `${runId}:${rawEventId}`
    : null;
  if (
    hasPositiveEventId &&
    (seenEventIdRangesInclude(existing.seenEventIdRanges ?? [], rawEventId) ||
      existing.seenEventKeys.includes(positiveEventDedupeKey ?? ""))
  ) {
    return state;
  }
  const dedupeKey = hasPositiveEventId ? null : eventDedupeKey(event);
  if (dedupeKey !== null && existing.seenEventKeys.includes(dedupeKey)) {
    return state;
  }

  const eventId =
    hasPositiveEventId
      ? rawEventId
      : existing.lastEventId;
  const nextEntry = {
    id: `${runId}:${eventId}:${existing.entries.length}`,
    sessionId: event.session_id,
    runId,
    instanceId: event.instance_id ?? "",
    roleId: event.role_id ?? event.instance_id ?? "agent",
    kind: event.event_type,
    text: eventText(event.payload, event.event_type),
    payload: event.payload,
    eventId,
    occurredAt: event.occurred_at ?? "",
  } satisfies TimelineEntry;
  const entries = appendTimelineEntry(existing.entries, nextEntry);
  const terminalEventType = isRunLifecycleEntry(nextEntry.kind)
    ? terminalEventTypeFromEntries(entries, existing.terminalEventType)
    : existing.terminalEventType;
  const status: StreamStatus = terminalEventType === null ? "open" : "closed";
  const nextRun: RuntimeRunState = {
    ...existing,
    ...runtimeMetadataFromEvent(existing, event),
    status,
    lastEventId: Math.max(existing.lastEventId, eventId),
    hadVisibleTextStream: existing.hadVisibleTextStream === true ||
      eventHasVisibleTextStream(event.event_type, event.payload),
    seenEventKeys: dedupeKey === null
      ? existing.seenEventKeys
      : rememberSeenEventKey(existing.seenEventKeys, dedupeKey),
    seenEventIdRanges: hasPositiveEventId
      ? rememberSeenEventId(existing.seenEventIdRanges ?? [], rawEventId)
      : existing.seenEventIdRanges,
    terminalEventType,
    entries,
  };

  const activeRunIds = new Set(state.activeRunIds);
  if (status === "closed") {
    activeRunIds.delete(runId);
  } else {
    activeRunIds.add(runId);
  }

  const nextRuns = markReferencedSubagentRuns(
    {
      ...state.runs,
      [runId]: nextRun,
    },
    event.payload,
    event.session_id,
    runId,
  );

  return {
    ...state,
    runs: nextRuns,
    activeRunIds: Array.from(activeRunIds),
  };
}

export function reduceRunEvents(
  state: RuntimeState,
  rawEvents: readonly RunEventEnvelope[],
): RuntimeState {
  let nextState = state;
  for (const rawEvent of rawEvents) {
    nextState = reduceRunEvent(nextState, rawEvent);
  }
  return nextState;
}

function markReferencedSubagentRuns(
  runs: Record<string, RuntimeRunState>,
  payload: JsonValue,
  sessionId: string,
  sourceRunId: string,
): Record<string, RuntimeRunState> {
  const referencedRunIds = subagentRunReferences(payload)
    .filter((runId) => runId.length > 0 && runId !== sourceRunId);
  if (referencedRunIds.length === 0) {
    return runs;
  }
  let nextRuns: Record<string, RuntimeRunState> | null = null;
  for (const runId of referencedRunIds) {
    const currentRun = (nextRuns ?? runs)[runId];
    const nextRun = runtimeRunStateWithScope(
      currentRun,
      runId,
      sessionId,
      "subagent",
    );
    if (nextRun === currentRun) {
      continue;
    }
    nextRuns ??= { ...runs };
    nextRuns[runId] = nextRun;
  }
  return nextRuns ?? runs;
}

function runtimeRunStateWithScope(
  currentRun: RuntimeRunState | undefined,
  runId: string,
  sessionId: string,
  scope: NonNullable<RuntimeRunState["scope"]>,
): RuntimeRunState {
  if (
    currentRun !== undefined &&
    currentRun.scope === scope &&
    currentRun.sessionId !== undefined
  ) {
    return currentRun;
  }
  return {
    entries: currentRun?.entries ?? [],
    lastEventId: currentRun?.lastEventId ?? 0,
    ...(currentRun?.hadVisibleTextStream === true
      ? { hadVisibleTextStream: true }
      : {}),
    ...(currentRun?.createdAt !== undefined ? { createdAt: currentRun.createdAt } : {}),
    ...(currentRun?.promptText !== undefined ? { promptText: currentRun.promptText } : {}),
    ...(currentRun?.targetRoleId !== undefined
      ? { targetRoleId: currentRun.targetRoleId }
      : {}),
    runId,
    ...(currentRun?.seenEventIdRanges !== undefined
      ? { seenEventIdRanges: currentRun.seenEventIdRanges }
      : {}),
    seenEventKeys: currentRun?.seenEventKeys ?? [],
    sessionId: currentRun?.sessionId ?? sessionId,
    status: currentRun?.status ?? "connecting",
    terminalEventType: currentRun?.terminalEventType ?? null,
    ...(currentRun?.replayAfterEventId !== undefined
      ? { replayAfterEventId: currentRun.replayAfterEventId }
      : {}),
    scope,
  };
}

function subagentRunReferences(payload: JsonValue): string[] {
  const runIds = new Set<string>();
  collectSubagentRunReferences(payload, runIds, 0);
  return Array.from(runIds);
}

function collectSubagentRunReferences(
  value: JsonValue,
  runIds: Set<string>,
  depth: number,
): void {
  if (depth > SUBAGENT_REFERENCE_MAX_DEPTH) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSubagentRunReferences(item, runIds, depth + 1);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const key of SUBAGENT_EXPLICIT_RUN_KEYS) {
    const runId = jsonStringField(value, key);
    if (runId.length > 0) {
      runIds.add(runId);
    }
  }
  if (jsonObjectHasSubagentMarker(value)) {
    for (const key of SUBAGENT_COMPANION_RUN_KEYS) {
      const runId = jsonStringField(value, key);
      if (runId.length > 0) {
        runIds.add(runId);
      }
    }
  }
  for (const child of Object.values(value)) {
    collectSubagentRunReferences(child, runIds, depth + 1);
  }
}

function jsonObjectHasSubagentMarker(value: Record<string, JsonValue>): boolean {
  return (
    jsonStringField(value, "kind").toLowerCase() === "subagent" ||
    jsonStringField(value, "mode").toLowerCase() === "subagent" ||
    jsonStringField(value, "subagent_instance_id").length > 0 ||
    jsonStringField(value, "subagentInstanceId").length > 0 ||
    jsonStringField(value, "subagent_role_id").length > 0 ||
    jsonStringField(value, "subagentRoleId").length > 0 ||
    jsonStringField(value, "subagent_kind").length > 0 ||
    jsonStringField(value, "subagentKind").length > 0
  );
}

function jsonStringField(
  value: Record<string, JsonValue>,
  key: string,
): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function runtimeMetadataFromEvent(
  existing: RuntimeRunState,
  event: ReturnType<typeof parseRunEvent>,
): Partial<RuntimeRunState> {
  const metadata: Partial<RuntimeRunState> = {};
  if (existing.sessionId === undefined && event.session_id.trim().length > 0) {
    metadata.sessionId = event.session_id;
  }
  if (existing.targetRoleId === undefined) {
    const roleId = event.role_id?.trim() ?? "";
    if (roleId.length > 0) {
      metadata.targetRoleId = roleId;
    }
  }
  if (existing.createdAt === undefined) {
    const occurredAt = event.occurred_at?.trim() ?? "";
    if (occurredAt.length > 0) {
      metadata.createdAt = occurredAt;
    }
  }
  return metadata;
}

function nextTerminalEventType(
  existingTerminalEventType: RunEventType | null,
  eventType: RunEventType,
): RunEventType | null {
  if (eventType === "run_resumed") {
    return null;
  }
  if (isTerminalRunEvent(eventType)) {
    return eventType;
  }
  return existingTerminalEventType;
}

function rememberSeenEventKey(
  seenEventKeys: string[],
  dedupeKey: string,
): string[] {
  const nextKeys = [...seenEventKeys, dedupeKey];
  if (nextKeys.length <= MAX_SEEN_EVENT_KEYS) {
    return nextKeys;
  }
  return nextKeys.slice(nextKeys.length - MAX_SEEN_EVENT_KEYS);
}

function seenEventIdRangesInclude(
  ranges: Array<[number, number]>,
  eventId: number,
): boolean {
  let lower = 0;
  let upper = ranges.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const range = ranges[middle];
    if (range === undefined) {
      return false;
    }
    if (eventId < range[0]) {
      upper = middle;
    } else if (eventId > range[1]) {
      lower = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

function rememberSeenEventId(
  ranges: Array<[number, number]>,
  eventId: number,
): Array<[number, number]> {
  let insertionIndex = 0;
  while (
    insertionIndex < ranges.length &&
    (ranges[insertionIndex]?.[1] ?? Number.NEGATIVE_INFINITY) < eventId - 1
  ) {
    insertionIndex += 1;
  }
  const currentRange = ranges[insertionIndex];
  if (currentRange === undefined) {
    return [...ranges, [eventId, eventId]];
  }
  if (eventId < currentRange[0] - 1) {
    return [
      ...ranges.slice(0, insertionIndex),
      [eventId, eventId],
      ...ranges.slice(insertionIndex),
    ];
  }

  let mergedStart = Math.min(currentRange[0], eventId);
  let mergedEnd = Math.max(currentRange[1], eventId);
  let mergeEndIndex = insertionIndex + 1;
  while (
    mergeEndIndex < ranges.length &&
    (ranges[mergeEndIndex]?.[0] ?? Number.POSITIVE_INFINITY) <= mergedEnd + 1
  ) {
    const nextRange = ranges[mergeEndIndex];
    if (nextRange !== undefined) {
      mergedStart = Math.min(mergedStart, nextRange[0]);
      mergedEnd = Math.max(mergedEnd, nextRange[1]);
    }
    mergeEndIndex += 1;
  }
  return [
    ...ranges.slice(0, insertionIndex),
    [mergedStart, mergedEnd],
    ...ranges.slice(mergeEndIndex),
  ];
}

function createRunState(runId: string): RuntimeRunState {
  return {
    runId,
    status: "connecting",
    lastEventId: 0,
    seenEventIdRanges: [],
    seenEventKeys: [],
    terminalEventType: null,
    entries: [],
  };
}

function eventHasVisibleTextStream(
  eventType: RunEventType,
  payload: JsonValue,
): boolean {
  if (
    eventType !== "text_delta" &&
    eventType !== "output_delta" &&
    eventType !== "run_completed"
  ) {
    return false;
  }
  return visibleTextFromStreamPayload(payload).trim().length > 0;
}

function visibleTextFromStreamPayload(payload: JsonValue): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(visibleTextFromStreamPayload).join("");
  }
  if (typeof payload !== "object" || payload === null) {
    return "";
  }
  const directText = firstPayloadString(payload, ["text", "delta", "content", "message"]);
  if (directText !== null) {
    return directText;
  }
  const output = payload.output;
  return output === undefined ? "" : visibleTextFromStreamPayload(output);
}

function appendTimelineEntry(
  entries: TimelineEntry[],
  nextEntry: TimelineEntry,
): TimelineEntry[] {
  if (!shouldRenderEntry(nextEntry.kind)) {
    return entries;
  }
  const lastEntry = entries.at(-1);
  const compactedEntry = compactAdjacentDeltaEntry(lastEntry, nextEntry);
  if (compactedEntry !== null) {
    return [...entries.slice(0, -1), compactedEntry];
  }
  if (
    lastEntry === undefined ||
    compareTimelineEntries(lastEntry, nextEntry) <= 0
  ) {
    return [...entries, nextEntry];
  }
  const insertionIndex = timelineEntryInsertionIndex(entries, nextEntry);
  return [
    ...entries.slice(0, insertionIndex),
    nextEntry,
    ...entries.slice(insertionIndex),
  ];
}

function compactAdjacentDeltaEntry(
  previous: TimelineEntry | undefined,
  next: TimelineEntry,
): TimelineEntry | null {
  if (
    previous === undefined ||
    previous.kind !== next.kind ||
    !isCompactableDeltaKind(next.kind) ||
    previous.runId !== next.runId ||
    previous.instanceId !== next.instanceId ||
    previous.roleId !== next.roleId ||
    previous.eventId <= 0 ||
    next.eventId !== previous.eventId + 1
  ) {
    return null;
  }
  const previousPayload = jsonObject(previous.payload);
  const nextPayload = jsonObject(next.payload);
  if (
    previousPayload === null ||
    nextPayload === null ||
    payloadPartIndex(previousPayload) !== payloadPartIndex(nextPayload)
  ) {
    return null;
  }
  const previousText = rawPayloadText(previousPayload);
  const nextText = rawPayloadText(nextPayload);
  if (previousText === null || nextText === null) {
    return null;
  }
  return {
    ...previous,
    eventId: next.eventId,
    payload: {
      ...previousPayload,
      [previousText.key]: previousText.value + nextText.value,
    },
    text: previousText.value + nextText.value,
  };
}

function isCompactableDeltaKind(kind: RunEventType | "message"): boolean {
  return kind === "text_delta" || kind === "output_delta" || kind === "thinking_delta";
}

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function payloadPartIndex(payload: Record<string, JsonValue>): string {
  const value = payload.part_index;
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function rawPayloadText(
  payload: Record<string, JsonValue>,
): { key: string; value: string } | null {
  for (const key of RAW_TEXT_PAYLOAD_KEYS) {
    const value = payload[key];
    if (typeof value === "string") {
      return { key, value };
    }
  }
  return null;
}

function timelineEntryInsertionIndex(
  entries: TimelineEntry[],
  nextEntry: TimelineEntry,
): number {
  let lower = 0;
  let upper = entries.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const middleEntry = entries[middle];
    if (
      middleEntry !== undefined &&
      compareTimelineEntries(middleEntry, nextEntry) <= 0
    ) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  return lower;
}

function shouldRenderEntry(kind: RunEventType | "message"): boolean {
  return kind.trim().length > 0;
}

function compareTimelineEntries(left: TimelineEntry, right: TimelineEntry): number {
  if (left.eventId > 0 && right.eventId > 0 && left.eventId !== right.eventId) {
    return left.eventId - right.eventId;
  }
  return 0;
}

function terminalEventTypeFromEntries(
  entries: TimelineEntry[],
  fallbackTerminalEventType: RunEventType | null,
): RunEventType | null {
  let terminalEventType: RunEventType | null = fallbackTerminalEventType;
  let hasLifecycleEntry = false;
  for (const entry of entries) {
    if (!isRunLifecycleEntry(entry.kind)) {
      continue;
    }
    if (!hasLifecycleEntry) {
      terminalEventType = null;
      hasLifecycleEntry = true;
    }
    terminalEventType = nextTerminalEventType(terminalEventType, entry.kind);
  }
  return terminalEventType;
}

function isRunLifecycleEntry(kind: RunEventType | "message"): boolean {
  return kind === "run_resumed" || isTerminalRunEvent(kind);
}

function eventText(payload: JsonValue, eventType: RunEventType): string {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const text = firstPayloadString(payload, [
      "text",
      "delta",
      "content",
      "message",
      "title",
      "summary",
      "error",
      "error_message",
      "reason",
      "error_code",
      "phase",
      "status",
    ]);
    if (text !== null) {
      return text;
    }
    const toolName = firstPayloadString(payload, ["tool_name", "name"]);
    if (toolName !== null) {
      return toolName;
    }
  }
  return eventType.replaceAll("_", " ");
}

function firstPayloadString(
  payload: Record<string, JsonValue>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "string") {
      continue;
    }
    if (RAW_TEXT_PAYLOAD_KEYS.has(key)) {
      if (value.length > 0) {
        return value;
      }
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
