import { describe, expect, it } from "vitest";

import { initialRuntimeState, reduceRunEvent } from "../runtime/reducers";
import type { AgUiRunEvent, RelayRunEvent } from "../runtime/events";

describe("runtime reducers", () => {
  it("deduplicates replayed events by run and event id", () => {
    const event = runEvent({
      event_id: 7,
      event_type: "text_delta",
      payload_json: JSON.stringify({ delta: "hello" }),
    });
    const once = reduceRunEvent(initialRuntimeState, event);
    const twice = reduceRunEvent(once, event);

    expect(twice.runs["run-1"].entries).toHaveLength(1);
    expect(twice.runs["run-1"].lastEventId).toBe(7);
  });

  it("closes active run state on terminal events", () => {
    const started = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 1, event_type: "run_started" }),
    );
    const completed = reduceRunEvent(
      started,
      runEvent({ event_id: 2, event_type: "run_completed" }),
    );

    expect(started.activeRunIds).toEqual(["run-1"]);
    expect(completed.activeRunIds).toEqual([]);
    expect(completed.runs["run-1"].terminalEventType).toBe("run_completed");
  });

  it("keeps invalid payload text instead of dropping the event", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({ payload_json: "{bad json", event_type: "tool_result" }),
    );

    expect(state.runs["run-1"].entries[0].payload).toEqual({
      raw_payload: "{bad json",
      parse_error: true,
    });
  });

  it("preserves instance ids for runtime stream grouping", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: "worker-a",
        role_id: "MainAgent",
        payload_json: JSON.stringify({ text: "hello" }),
      }),
    );

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      instanceId: "worker-a",
      roleId: "MainAgent",
    });
  });

  it("reduces AG-UI envelopes without reparsing payload JSON", () => {
    const state = reduceRunEvent(initialRuntimeState, agUiEvent());

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      sessionId: "session-1",
      text: "hello from ag-ui",
      eventId: 12,
    });
  });

  it("preserves every runtime event kind so replay cannot drop new server events", () => {
    const eventTypes = [
      "model_step_started",
      "model_step_finished",
      "generation_progress",
      "tool_call_batch_sealed",
      "injection_enqueued",
      "injection_applied",
      "notification_requested",
      "subagent_session_status_changed",
      "subagent_stopped",
      "subagent_resumed",
      "awaiting_manual_action",
      "llm_retry_scheduled",
      "llm_fallback_activated",
      "state_snapshot",
      "state_delta",
      "runtime_guardrail_alert",
      "hook_started",
      "unknown_future_event",
    ] as const;

    const state = eventTypes.reduce(
      (currentState, eventType, index) =>
        reduceRunEvent(
          currentState,
          runEvent({
            event_id: index + 1,
            event_type: eventType,
            payload_json: JSON.stringify({
              title: `${eventType} visible`,
            }),
          }),
        ),
      initialRuntimeState,
    );

    const entries = state.runs["run-1"].entries;
    expect(entries.map((entry) => entry.kind)).toEqual([...eventTypes]);
    expect(entries.map((entry) => entry.text)).toEqual(
      eventTypes.map((eventType) => `${eventType} visible`),
    );
  });
});

function runEvent(overrides: Partial<RelayRunEvent>): RelayRunEvent {
  return {
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "run-1",
    event_type: "text_delta",
    payload_json: "{}",
    event_id: 1,
    occurred_at: "2026-06-23T00:00:00Z",
    ...overrides,
  };
}

function agUiEvent(): AgUiRunEvent {
  return {
    type: "message.text.delta",
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "run-1",
    relay_event_type: "text_delta",
    payload: { text: "hello from ag-ui" },
    event_id: 12,
    occurred_at: "2026-06-23T00:00:00Z",
  };
}
