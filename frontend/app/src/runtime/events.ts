import type { JsonValue } from "../api/contracts";

export type RunEventType =
  | "run_started"
  | "run_paused"
  | "run_resumed"
  | "todo_updated"
  | "background_task_started"
  | "background_task_updated"
  | "background_task_completed"
  | "background_task_stopped"
  | "model_step_started"
  | "model_step_finished"
  | "text_delta"
  | "output_delta"
  | "generation_progress"
  | "thinking_started"
  | "thinking_delta"
  | "thinking_finished"
  | "tool_call"
  | "tool_call_batch_sealed"
  | "tool_input_validation_failed"
  | "tool_result"
  | "injection_enqueued"
  | "injection_applied"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "user_question_requested"
  | "user_question_answered"
  | "notification_requested"
  | "subagent_session_status_changed"
  | "subagent_stopped"
  | "subagent_resumed"
  | "run_stopped"
  | "run_completed"
  | "run_failed"
  | "awaiting_manual_action"
  | "token_usage"
  | string;

export interface RelayRunEvent {
  session_id: string;
  run_id: string;
  trace_id: string;
  task_id?: string | null;
  instance_id?: string | null;
  role_id?: string | null;
  event_type: RunEventType;
  payload_json?: string;
  occurred_at?: string;
  event_id?: number | null;
}

export interface ParsedRunEvent extends RelayRunEvent {
  payload: JsonValue;
}

export type StreamStatus = "idle" | "connecting" | "open" | "closed" | "failed";

export function parseRunEvent(event: RelayRunEvent): ParsedRunEvent {
  const rawPayload = event.payload_json ?? "{}";
  return {
    ...event,
    payload: parsePayload(rawPayload),
  };
}

function parsePayload(rawPayload: string): JsonValue {
  if (!rawPayload.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawPayload) as JsonValue;
  } catch {
    return { raw_payload: rawPayload, parse_error: true };
  }
}

export function isTerminalRunEvent(eventType: RunEventType): boolean {
  return (
    eventType === "run_completed" ||
    eventType === "run_failed" ||
    eventType === "run_stopped" ||
    eventType === "run_paused"
  );
}

export function eventDedupeKey(event: RelayRunEvent): string {
  if (typeof event.event_id === "number" && event.event_id > 0) {
    return `${event.run_id}:${event.event_id}`;
  }
  return [
    event.run_id,
    event.trace_id,
    event.event_type,
    event.task_id ?? "",
    event.instance_id ?? "",
    event.payload_json ?? "",
  ].join(":");
}
