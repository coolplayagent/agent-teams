import type { JsonValue } from "../api/contracts";
import {
  eventDedupeKey,
  isTerminalRunEvent,
  parseRunEvent,
  type RelayRunEvent,
  type RunEventType,
  type StreamStatus,
} from "./events";

export interface TimelineEntry {
  id: string;
  runId: string;
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
  rawEvent: RelayRunEvent,
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
      runId,
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
  return (
    kind === "message" ||
    kind === "run_started" ||
    kind === "run_resumed" ||
    kind === "run_paused" ||
    kind === "text_delta" ||
    kind === "output_delta" ||
    kind === "thinking_started" ||
    kind === "thinking_delta" ||
    kind === "thinking_finished" ||
    kind === "tool_call" ||
    kind === "tool_input_validation_failed" ||
    kind === "tool_result" ||
    kind === "tool_approval_requested" ||
    kind === "tool_approval_resolved" ||
    kind === "user_question_requested" ||
    kind === "user_question_answered" ||
    kind === "background_task_started" ||
    kind === "background_task_updated" ||
    kind === "background_task_completed" ||
    kind === "background_task_stopped" ||
    kind === "todo_updated" ||
    kind === "token_usage" ||
    kind === "run_stopped" ||
    kind === "run_completed" ||
    kind === "run_failed"
  );
}

function eventText(payload: JsonValue, eventType: RunEventType): string {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const text = payload.text ?? payload.delta ?? payload.content ?? payload.message;
    if (typeof text === "string") {
      return text;
    }
    const toolName = payload.tool_name;
    if (typeof toolName === "string" && toolName.trim()) {
      return toolName;
    }
  }
  return eventType.replaceAll("_", " ");
}
