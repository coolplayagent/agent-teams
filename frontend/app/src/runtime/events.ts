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
  | "monitor_created"
  | "monitor_triggered"
  | "monitor_stopped"
  | "llm_retry_scheduled"
  | "llm_retry_exhausted"
  | "llm_fallback_activated"
  | "llm_fallback_exhausted"
  | "state_snapshot"
  | "state_delta"
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
  | "spec_checkpoint_applied"
  | "spec_checkpoint_evaluated"
  | "injection_enqueued"
  | "injection_applied"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "runtime_guardrail_alert"
  | "runtime_guardrail_report"
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
  | "hook_matched"
  | "hook_started"
  | "hook_completed"
  | "hook_failed"
  | "hook_conflict"
  | "hook_decision_applied"
  | "hook_deferred"
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

export interface AgUiRunEvent {
  type: string;
  event_id?: number | null;
  session_id: string;
  run_id: string;
  trace_id: string;
  task_id?: string | null;
  instance_id?: string | null;
  role_id?: string | null;
  relay_event_type: RunEventType;
  occurred_at?: string;
  payload: JsonValue;
}

export interface ParsedRunEvent extends RelayRunEvent {
  payload: JsonValue;
}

export type StreamStatus = "idle" | "connecting" | "open" | "closed" | "failed";
export type RunEventEnvelope = RelayRunEvent | AgUiRunEvent;

export const AG_UI_EVENT_NAMES = [
  "run.started",
  "run.paused",
  "run.resumed",
  "run.completed",
  "run.stopped",
  "run.failed",
  "run.awaiting_manual_action",
  "llm_retry.scheduled",
  "llm_retry.exhausted",
  "llm_fallback.activated",
  "llm_fallback.exhausted",
  "state.snapshot",
  "state.delta",
  "model_step.started",
  "model_step.finished",
  "message.text.delta",
  "message.output.delta",
  "generation.progress",
  "thinking.started",
  "thinking.delta",
  "thinking.finished",
  "tool_call.started",
  "tool_call.batch_sealed",
  "tool_call.validation_failed",
  "tool_result.completed",
  "tool_approval.requested",
  "tool_approval.resolved",
  "user_question.requested",
  "user_question.answered",
  "injection.enqueued",
  "injection.applied",
  "token_usage.updated",
  "todo.updated",
  "background_task.started",
  "background_task.updated",
  "background_task.completed",
  "background_task.stopped",
  "subagent_session.status_changed",
  "subagent.stopped",
  "subagent.resumed",
  "notification.requested",
  "runtime_guardrail.alert",
  "runtime_guardrail.report",
  "hook.started",
  "hook.completed",
  "hook.failed",
  "hook.conflict",
  "hook.decision_applied",
  "hook.deferred",
  "relay.event",
] as const;

export function parseRunEvent(event: RunEventEnvelope): ParsedRunEvent {
  if (isAgUiRunEvent(event)) {
    return {
      session_id: event.session_id,
      run_id: event.run_id,
      trace_id: event.trace_id,
      task_id: event.task_id,
      instance_id: event.instance_id,
      role_id: event.role_id,
      event_type: event.relay_event_type,
      occurred_at: event.occurred_at,
      event_id: event.event_id,
      payload: event.payload,
    };
  }
  const rawPayload = event.payload_json ?? "{}";
  return {
    ...event,
    payload: parsePayload(rawPayload),
  };
}

function isAgUiRunEvent(event: RunEventEnvelope): event is AgUiRunEvent {
  return "relay_event_type" in event;
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

export function eventDedupeKey(event: ParsedRunEvent): string | null {
  if (typeof event.event_id === "number" && event.event_id > 0) {
    return `${event.run_id}:${event.event_id}`;
  }
  const occurredAt = event.occurred_at?.trim();
  if (!occurredAt) {
    return null;
  }
  return [
    event.run_id,
    event.trace_id,
    event.event_type,
    event.task_id ?? "",
    event.instance_id ?? "",
    occurredAt,
    event.payload_json ?? JSON.stringify(event.payload),
  ].join(":");
}
