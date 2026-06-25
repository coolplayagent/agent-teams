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
  const dedupeKey = eventDedupeKey(event);
  if (existing.seenEventKeys.includes(dedupeKey)) {
    return state;
  }

  const eventId =
    typeof event.event_id === "number" && event.event_id > 0
      ? event.event_id
      : existing.lastEventId;
  const status: StreamStatus = isTerminalRunEvent(event.event_type) ? "closed" : "open";
  const nextRun: RuntimeRunState = {
    ...existing,
    status,
    lastEventId: Math.max(existing.lastEventId, eventId),
    seenEventKeys: [...existing.seenEventKeys, dedupeKey],
    terminalEventType: isTerminalRunEvent(event.event_type)
      ? event.event_type
      : existing.terminalEventType,
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
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}
