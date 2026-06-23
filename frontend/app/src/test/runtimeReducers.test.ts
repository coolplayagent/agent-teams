import { describe, expect, it } from "vitest";

import { initialRuntimeState, reduceRunEvent } from "../runtime/reducers";
import type { RelayRunEvent } from "../runtime/events";

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
