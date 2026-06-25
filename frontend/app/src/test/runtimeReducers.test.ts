import { describe, expect, it } from "vitest";

import {
  initialRuntimeState,
  MAX_SEEN_EVENT_KEYS,
  reduceRunEvent,
} from "../runtime/reducers";
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

  it("ignores replayed event ids at or below the local stream cursor", () => {
    const state = reduceRunEvent(
      {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 12,
            runId: "run-1",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
      runEvent({
        event_id: 11,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "old replay chunk" }),
      }),
    );

    expect(state.runs["run-1"].entries).toHaveLength(0);
    expect(state.runs["run-1"].lastEventId).toBe(12);
  });

  it("bounds fallback dedupe keys for long streams", () => {
    const state = Array.from({ length: MAX_SEEN_EVENT_KEYS + 8 }, (_value, index) =>
      runEvent({
        event_id: null,
        event_type: "generation_progress",
        payload_json: JSON.stringify({ text: `progress ${index}` }),
      }),
    ).reduce(reduceRunEvent, initialRuntimeState);

    expect(state.runs["run-1"].seenEventKeys).toHaveLength(MAX_SEEN_EVENT_KEYS);
    expect(state.runs["run-1"].entries).toHaveLength(MAX_SEEN_EVENT_KEYS + 8);
  });

  it("keeps repeated cursorless stream deltas when no stable replay key exists", () => {
    const first = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ delta: " " }),
      }),
    );
    const second = reduceRunEvent(
      first,
      runEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ delta: " " }),
      }),
    );

    expect(second.runs["run-1"].entries).toHaveLength(2);
    expect(second.runs["run-1"].entries.map((entry) => entry.text)).toEqual([
      " ",
      " ",
    ]);
    expect(second.runs["run-1"].seenEventKeys).toEqual([]);
  });

  it("deduplicates cursorless replay events when timestamp metadata is stable", () => {
    const event = runEvent({
      event_id: null,
      event_type: "tool_result",
      occurred_at: "2026-06-23T00:00:07Z",
      payload_json: JSON.stringify({ text: "same replayed result" }),
    });
    const once = reduceRunEvent(initialRuntimeState, event);
    const twice = reduceRunEvent(once, event);

    expect(twice.runs["run-1"].entries).toHaveLength(1);
    expect(twice.runs["run-1"].seenEventKeys).toHaveLength(1);
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

  it("does not reopen completed runs for trailing replay events", () => {
    const completed = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 10, event_type: "run_completed" }),
    );
    const withTokenUsage = reduceRunEvent(
      completed,
      runEvent({
        event_id: 11,
        event_type: "token_usage",
        payload_json: JSON.stringify({ total_tokens: 123 }),
      }),
    );

    expect(withTokenUsage.activeRunIds).toEqual([]);
    expect(withTokenUsage.runs["run-1"]).toMatchObject({
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(withTokenUsage.runs["run-1"].entries.map((entry) => entry.kind)).toEqual([
      "run_completed",
      "token_usage",
    ]);
  });

  it("reopens a paused run when replay reaches a resume event", () => {
    const paused = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 5, event_type: "run_paused" }),
    );
    const resumed = reduceRunEvent(
      paused,
      runEvent({ event_id: 6, event_type: "run_resumed" }),
    );

    expect(paused.activeRunIds).toEqual([]);
    expect(resumed.activeRunIds).toEqual(["run-1"]);
    expect(resumed.runs["run-1"]).toMatchObject({
      status: "open",
      terminalEventType: null,
    });
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

  it("uses diagnostic payload text for failed and stopped runtime events", () => {
    const failed = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 2,
        event_type: "run_failed",
        payload_json: JSON.stringify({
          error_message: "Provider stream ended before finish reason",
          error_code: "network_stream_interrupted",
        }),
      }),
    );
    const stopped = reduceRunEvent(
      failed,
      runEvent({
        event_id: 3,
        event_type: "run_stopped",
        payload_json: JSON.stringify({
          reason: "User requested stop",
        }),
      }),
    );

    expect(stopped.runs["run-1"].entries).toMatchObject([
      {
        kind: "run_failed",
        text: "Provider stream ended before finish reason",
      },
      {
        kind: "run_stopped",
        text: "User requested stop",
      },
    ]);
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
