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
  status: StreamStatus;
  lastEventId: number;
  seenEventKeys: string[];
  terminalEventType: RunEventType | null;
  entries: TimelineEntry[];
}

export interface RuntimeState {
  runs: Record<string, RuntimeRunState>;
  activeRunIds: string[];
}

export const MAX_SEEN_EVENT_KEYS = 512;
const RAW_TEXT_PAYLOAD_KEYS = new Set(["text", "delta", "content", "message"]);

export const initialRuntimeState: RuntimeState = {
  runs: {},
  activeRunIds: [],
};

export function reduceRunEvent(
  state: RuntimeState,
  rawEvent: RunEventEnvelope,
): RuntimeState {
  const event = parseRunEvent(rawEvent);
  const runId = event.run_id;
  const existing = state.runs[runId] ?? createRunState(runId);
  const rawEventId = event.event_id;
  const hasPositiveEventId = typeof rawEventId === "number" && rawEventId > 0;
  if (hasPositiveEventId && rawEventId <= existing.lastEventId) {
    return state;
  }
  const dedupeKey = eventDedupeKey(event);
  if (dedupeKey !== null && existing.seenEventKeys.includes(dedupeKey)) {
    return state;
  }

  const eventId =
    hasPositiveEventId
      ? rawEventId
      : existing.lastEventId;
  const terminalEventType = nextTerminalEventType(
    existing.terminalEventType,
    event.event_type,
  );
  const status: StreamStatus = terminalEventType === null ? "open" : "closed";
  const nextRun: RuntimeRunState = {
    ...existing,
    status,
    lastEventId: Math.max(existing.lastEventId, eventId),
    seenEventKeys: dedupeKey === null
      ? existing.seenEventKeys
      : rememberSeenEventKey(existing.seenEventKeys, dedupeKey),
    terminalEventType,
    entries: appendTimelineEntry(existing.entries, {
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
    }),
  };

  const activeRunIds = new Set(state.activeRunIds);
  if (status === "closed") {
    activeRunIds.delete(runId);
  } else {
    activeRunIds.add(runId);
  }

  return {
    ...state,
    runs: {
      ...state.runs,
      [runId]: nextRun,
    },
    activeRunIds: Array.from(activeRunIds),
  };
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

function createRunState(runId: string): RuntimeRunState {
  return {
    runId,
    status: "connecting",
    lastEventId: 0,
    seenEventKeys: [],
    terminalEventType: null,
    entries: [],
  };
}

function appendTimelineEntry(
  entries: TimelineEntry[],
  nextEntry: TimelineEntry,
): TimelineEntry[] {
  if (!shouldRenderEntry(nextEntry.kind)) {
    return entries;
  }
  return [...entries, nextEntry];
}

function shouldRenderEntry(kind: RunEventType | "message"): boolean {
  return kind.trim().length > 0;
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
