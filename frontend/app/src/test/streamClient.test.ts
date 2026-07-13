import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgUiRunEvent, RelayRunEvent } from "../runtime/events";
import { initialRuntimeState, type RuntimeState } from "../runtime/reducers";
import {
  openMultiplexedRunStream,
  openRunStream,
  openSessionSubagentRunStream,
  type MultiplexedRunStreamOptions,
  type RunStreamOptions,
  type SessionSubagentRunStreamOptions,
} from "../runtime/streamClient";

type EventSourceListener = EventListenerOrEventListenerObject;

class MockEventSource {
  static latest: MockEventSource | null = null;

  readonly close = vi.fn(() => {
    this.closed = true;
  });
  readonly url: string | URL;
  onerror: ((this: EventSource, event: Event) => void) | null = null;
  onmessage: ((this: EventSource, event: MessageEvent<string>) => void) | null = null;
  closed = false;

  private readonly listeners = new Map<string, EventSourceListener[]>();

  constructor(url: string | URL) {
    this.url = url;
    MockEventSource.latest = this;
  }

  addEventListener(type: string, listener: EventSourceListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...listeners, listener]);
  }

  removeEventListener(type: string, listener: EventSourceListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((current) => current !== listener),
    );
  }

  dispatchMessage(type: string, data: string, lastEventId = ""): void {
    const event = new MessageEvent<string>(type, { data, lastEventId });
    if (type === "message") {
      this.onmessage?.call(this as unknown as EventSource, event);
    }
    this.dispatchToListeners(type, event);
  }

  dispatchTransportError(): void {
    const event = new Event("error");
    this.dispatchToListeners("error", event);
    this.onerror?.call(this as unknown as EventSource, event);
  }

  private dispatchToListeners(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener.call(this as unknown as EventSource, event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  MockEventSource.latest = null;
});

describe("openRunStream", () => {
  it("opens from the replay cursor and reduces named AG-UI events", () => {
    const stream = openTestStream({ afterEventId: 42 });

    expect(String(stream.source.url)).toBe(
      "/api/ag-ui/runs/run-1/events?after_event_id=42",
    );

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: 43,
          payload: { text: "hello over replay" },
        }),
      ),
    );

    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 43,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries[0].text).toBe(
      "hello over replay",
    );
  });

  it("seeds the replay cursor so boundary events are ignored after refresh", () => {
    const stream = openTestStream({ afterEventId: 42 });

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: 42,
          payload: { text: "duplicate boundary chunk" },
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: 43,
          payload: { text: "fresh replay chunk" },
        }),
      ),
    );

    expect(stream.activities).toHaveLength(2);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 43,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries).toHaveLength(1);
    expect(stream.states[0].runs["run-1"].entries[0].text).toBe(
      "fresh replay chunk",
    );
  });

  it("reduces AG-UI state snapshot and delta events from named stream events", async () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "state.snapshot",
      JSON.stringify(
        agUiEvent({
          event_id: 2,
          payload: { title: "state snapshot visible" },
          relay_event_type: "state_snapshot",
          type: "state.snapshot",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "state.delta",
      JSON.stringify(
        agUiEvent({
          event_id: 3,
          payload: { summary: "state delta visible" },
          relay_event_type: "state_delta",
          type: "state.delta",
        }),
      ),
    );

    await vi.waitFor(() => expect(stream.states).toHaveLength(2));
    expect(stream.states[1].runs["run-1"].entries).toMatchObject([
      {
        eventId: 2,
        kind: "state_snapshot",
        text: "state snapshot visible",
      },
      {
        eventId: 3,
        kind: "state_delta",
        text: "state delta visible",
      },
    ]);
  });

  it("uses SSE Last-Event-ID as the replay cursor when payload event id is missing", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: null,
          payload: { text: "cursor from sse id" },
        }),
      ),
      "44",
    );

    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 44,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries[0]).toMatchObject({
      eventId: 44,
      text: "cursor from sse id",
    });
  });

  it("deduplicates native reconnect events that only carry SSE Last-Event-ID", () => {
    const stream = openTestStream();
    const event = JSON.stringify(
      agUiEvent({
        event_id: null,
        payload: { text: "replayed from native cursor" },
      }),
    );

    stream.source.dispatchMessage("message.text.delta", event, "44");
    stream.source.dispatchMessage("message.text.delta", event, "44");

    expect(stream.activities).toHaveLength(2);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 44,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries).toHaveLength(1);
    expect(stream.states[0].runs["run-1"].entries[0]).toMatchObject({
      eventId: 44,
      text: "replayed from native cursor",
    });
  });

  it("keeps payload event ids ahead of SSE Last-Event-ID values", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: 45,
          payload: { text: "cursor from payload" },
        }),
      ),
      "44",
    );

    expect(stream.states[0].runs["run-1"].lastEventId).toBe(45);
    expect(stream.states[0].runs["run-1"].entries[0]).toMatchObject({
      eventId: 45,
      text: "cursor from payload",
    });
  });

  it("ignores non-numeric SSE Last-Event-ID values", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        agUiEvent({
          event_id: null,
          payload: { text: "cursorless event" },
        }),
      ),
      "event-44",
    );

    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 0,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries[0]).toMatchObject({
      eventId: 0,
      text: "cursorless event",
    });
  });

  it("ignores events for runs outside the single-run stream target", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 2,
          payload_json: JSON.stringify({ text: "wrong run" }),
          run_id: "run-other",
          trace_id: "run-other",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 3,
          payload_json: JSON.stringify({ text: "right run" }),
        }),
      ),
    );

    expect(stream.errors).toEqual([]);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-other"]).toBeUndefined();
    expect(stream.states[0].runs["run-1"].entries[0].text).toBe("right run");
  });

  it("routes selected subagent run events from the replay cursor until terminal close", () => {
    const stream = openTestStream({
      afterEventId: 9,
      runId: "subagent_run_1",
    });

    expect(String(stream.source.url)).toBe(
      "/api/ag-ui/runs/subagent_run_1/events?after_event_id=9",
    );

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 10,
          instance_id: "inst-sub-1",
          payload_json: JSON.stringify({ text: "subagent output" }),
          role_id: "Explorer",
          run_id: "subagent_run_1",
          trace_id: "subagent_run_1",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 11,
          event_type: "run_completed",
          instance_id: "inst-sub-1",
          payload_json: JSON.stringify({ status: "completed" }),
          role_id: "Explorer",
          run_id: "subagent_run_1",
          trace_id: "subagent_run_1",
        }),
      ),
    );

    expect(stream.states).toHaveLength(2);
    expect(stream.states[0].runs["subagent_run_1"].entries[0]).toMatchObject({
      eventId: 10,
      instanceId: "inst-sub-1",
      roleId: "Explorer",
      runId: "subagent_run_1",
      text: "subagent output",
    });
    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["subagent_run_1"]).toMatchObject({
      lastEventId: 11,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("publishes a pending final delta before the terminal lifecycle state", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(agUiEvent({ event_id: 1, payload: { text: "prefix" } })),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(agUiEvent({ event_id: 2, payload: { text: " final" } })),
    );
    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(relayEvent({
        event_id: 3,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
      })),
    );

    expect(stream.states).toHaveLength(2);
    expect(stream.states[1].runs["run-1"]).toMatchObject({
      status: "open",
      terminalEventType: null,
    });
    expect(stream.states[1].runs["run-1"].entries.map((entry) => entry.text).join(""))
      .toBe("prefix final");

    vi.advanceTimersByTime(0);

    expect(stream.states).toHaveLength(3);
    expect(stream.states[2].runs["run-1"]).toMatchObject({
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(stream.states[2].runs["run-1"].entries.map((entry) => entry.eventId))
      .toEqual([1, 3]);
    expect(stream.states[2].runs["run-1"].entries[0]?.lastMergedEventId).toBe(2);
    expect(stream.states[2].runs["run-1"].entries.map((entry) => entry.text).join(""))
      .toContain("prefix final");
    expect(stream.closedStates).toHaveLength(1);
    vi.useRealTimers();
  });

  it("routes selected normal-mode subagent events from the session stream", () => {
    const stream = openTestSessionSubagentStream({
      afterEventId: 12,
      runId: "subagent_run_1",
      sessionId: "session-parent",
    });

    expect(String(stream.source.url)).toBe(
      "/api/sessions/session-parent/subagents/events?after_event_id=12",
    );

    stream.source.dispatchMessage(
      "message",
      JSON.stringify(
        relayEvent({
          event_id: 13,
          payload_json: JSON.stringify({ text: "other subagent" }),
          run_id: "subagent_run_other",
          trace_id: "subagent_run_other",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message",
      JSON.stringify(
        relayEvent({
          event_id: 14,
          instance_id: "inst-sub-1",
          payload_json: JSON.stringify({ text: "selected subagent output" }),
          run_id: "subagent_run_1",
          trace_id: "subagent_run_1",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message",
      JSON.stringify(
        relayEvent({
          event_id: 15,
          event_type: "run_completed",
          instance_id: "inst-sub-1",
          payload_json: JSON.stringify({ status: "completed" }),
          run_id: "subagent_run_1",
          trace_id: "subagent_run_1",
        }),
      ),
    );

    expect(stream.states).toHaveLength(2);
    expect(stream.states[0].runs["subagent_run_other"]).toBeUndefined();
    expect(stream.states[0].runs["subagent_run_1"].entries[0]).toMatchObject({
      eventId: 14,
      instanceId: "inst-sub-1",
      runId: "subagent_run_1",
      text: "selected subagent output",
    });
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["subagent_run_1"]).toMatchObject({
      lastEventId: 15,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("does not notify state when replay delivers duplicate events", () => {
    const stream = openTestStream();
    const event = JSON.stringify(
      relayEvent({
        event_id: 5,
        payload_json: JSON.stringify({ text: "deduped replay chunk" }),
      }),
    );

    stream.source.dispatchMessage("message.text.delta", event);
    stream.source.dispatchMessage("message.text.delta", event);

    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-1"]).toMatchObject({
      lastEventId: 5,
      status: "open",
    });
    expect(stream.states[0].runs["run-1"].entries).toHaveLength(1);
  });

  it("reports activity for duplicate replay events without notifying state", () => {
    const stream = openTestStream({
      initialState: runtimeStateWithOpenRun(5),
    });

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 5,
          payload_json: JSON.stringify({ text: "already seen replay chunk" }),
        }),
      ),
    );

    expect(stream.activities).toHaveLength(1);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).not.toHaveBeenCalled();
  });

  it("closes once when a terminal event arrives", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 7,
          event_type: "run_completed",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 7,
          event_type: "run_completed",
        }),
      ),
    );

    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].activeRunIds).toEqual([]);
  });

  it("preserves burst text exactly before publishing the terminal state", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const stream = openTestStream();
    const chunks = Array.from({ length: 200 }, (_, index) =>
      String.fromCharCode(65 + (index % 26)),
    );

    chunks.forEach((text, index) => {
      stream.source.dispatchMessage(
        "message.text.delta",
        JSON.stringify(
          relayEvent({
            event_id: index + 1,
            payload_json: JSON.stringify({
              metadata: index === 0 ? "first" : `later-${index}`,
              part_index: 0,
              text,
            }),
          }),
        ),
      );
    });
    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: chunks.length + 1,
          event_type: "run_completed",
          payload_json: JSON.stringify({ status: "completed" }),
        }),
      ),
    );

    expect(stream.states).toHaveLength(2);
    expect(stream.states.at(-1)?.runs["run-1"]).toMatchObject({
      lastEventId: chunks.length,
      status: "open",
      terminalEventType: null,
    });
    vi.advanceTimersByTime(0);

    expect(stream.states).toHaveLength(3);
    const terminalState = stream.states.at(-1);
    expect(terminalState?.runs["run-1"]).toMatchObject({
      lastEventId: chunks.length + 1,
      seenEventIdRanges: [[1, chunks.length + 1]],
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(
      terminalState?.runs["run-1"].entries
        .filter((entry) => entry.kind === "text_delta")
        .map((entry) => entry.text)
        .join(""),
    ).toBe(chunks.join(""));
    const compactedTextEntry = terminalState?.runs["run-1"].entries.find(
      (entry) => entry.kind === "text_delta",
    );
    expect(compactedTextEntry).toMatchObject({
      eventId: 1,
      id: "run-1:1:0",
      lastMergedEventId: chunks.length,
      payload: {
        metadata: "first",
        part_index: 0,
        text: chunks.join(""),
      },
    });
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0]).toBe(terminalState);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
  });

  it("flushes an accepted batched delta before an explicit stream replacement", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const stream = openTestStream();

    for (const [index, text] of ["A", "B"].entries()) {
      stream.source.dispatchMessage(
        "message.text.delta",
        JSON.stringify(
          relayEvent({
            event_id: index + 1,
            payload_json: JSON.stringify({ text }),
          }),
        ),
      );
    }
    expect(stream.states).toHaveLength(1);

    stream.handle.close();

    expect(stream.states).toHaveLength(2);
    expect(
      stream.states.at(-1)?.runs["run-1"].entries
        .filter((entry) => entry.kind === "text_delta")
        .map((entry) => entry.text)
        .join(""),
    ).toBe("AB");
    expect(stream.source.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["run.failed", "run_failed"],
    ["run.paused", "run_paused"],
    ["run.stopped", "run_stopped"],
  ])("closes when %s terminal event arrives", (eventName, eventType) => {
    const stream = openTestStream();

    stream.source.dispatchMessage(
      eventName,
      JSON.stringify(
        relayEvent({
          event_id: 8,
          event_type: eventType,
          payload_json: JSON.stringify({
            message: `${eventType} diagnostic`,
            status: eventType.replace("run_", ""),
          }),
        }),
      ),
    );

    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].activeRunIds).toEqual([]);
    expect(stream.closedStates[0].runs["run-1"]).toMatchObject({
      lastEventId: 8,
      status: "closed",
      terminalEventType: eventType,
    });
  });

  it("closes when replay only delivers a duplicate terminal event", () => {
    const stream = openTestStream({
      initialState: runtimeStateWithClosedRun(7),
    });

    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 7,
          event_type: "run_completed",
        }),
      ),
    );

    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["run-1"]).toMatchObject({
      lastEventId: 7,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("closes immediately when replay starts from an already terminal run", () => {
    const stream = openTestStream({
      initialState: runtimeStateWithClosedRun(7),
    });

    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["run-1"]).toMatchObject({
      lastEventId: 7,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("reports server error payloads without reducing them", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage("error", JSON.stringify({ error: "resume failed" }));

    expect(stream.errors).toEqual([{ kind: "server", message: "resume failed" }]);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
  });

  it("treats empty data error events as transport interruptions", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage("error", "");

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).not.toHaveBeenCalled();
  });

  it("treats malformed data error events as transport interruptions", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage("error", "{bad json");

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).not.toHaveBeenCalled();
  });

  it("reports malformed stream events without throwing", () => {
    const stream = openTestStream();

    expect(() => stream.source.dispatchMessage("message.text.delta", "{bad json")).not.toThrow();

    expect(stream.errors).toEqual([
      { kind: "malformed", message: "Malformed run stream event." },
    ]);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).not.toHaveBeenCalled();
  });

  it("reports structurally invalid stream events without reducing them", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage("message.text.delta", JSON.stringify({ ok: true }));

    expect(stream.errors).toEqual([
      { kind: "malformed", message: "Malformed run stream event." },
    ]);
    expect(stream.states).toEqual([]);
  });

  it("lets EventSource attempt native reconnect after a transport error", () => {
    const stream = openTestStream();

    stream.source.dispatchTransportError();

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.source.close).not.toHaveBeenCalled();
  });

  it("closes multiplexed streams on transport errors so reconnect can resume each run cursor", () => {
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 5, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
      ],
    });

    stream.source.dispatchTransportError();

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
  });

  it("closes multiplexed streams on malformed error events before manual reconnect", () => {
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 5, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
      ],
    });

    stream.source.dispatchMessage("error", "{bad json");

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
  });

  it("opens multiplexed streams and waits for every tracked run to close", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 4, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
      ],
    });

    expect(String(stream.source.url)).toBe(
      "/api/ag-ui/runs/events?run_id=run-a&after_event_id=4&run_id=run-b&after_event_id=9",
    );

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 5,
          payload_json: JSON.stringify({ text: "run a" }),
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 10,
          payload_json: JSON.stringify({ text: "run b" }),
          run_id: "run-b",
          trace_id: "run-b",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 11,
          event_type: "run_completed",
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );

    expect(stream.source.close).not.toHaveBeenCalled();
    expect(stream.closedStates).toHaveLength(0);

    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 12,
          event_type: "run_completed",
          run_id: "run-b",
          trace_id: "run-b",
        }),
      ),
    );

    vi.advanceTimersByTime(0);

    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].activeRunIds).toEqual([]);
  });

  it("deduplicates multiplexed stream targets with the highest replay cursor", () => {
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 4, runId: "run-a" },
        { afterEventId: 11, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
        { afterEventId: 7, runId: "run-b" },
      ],
    });

    expect(String(stream.source.url)).toBe(
      "/api/ag-ui/runs/events?run_id=run-a&after_event_id=11&run_id=run-b&after_event_id=9",
    );
  });

  it("seeds multiplexed replay cursors so duplicate boundary events stay hidden", () => {
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 11, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
      ],
    });

    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 11,
          payload_json: JSON.stringify({ text: "duplicate run a" }),
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 9,
          payload_json: JSON.stringify({ text: "duplicate run b" }),
          run_id: "run-b",
          trace_id: "run-b",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 12,
          payload_json: JSON.stringify({ text: "fresh run a" }),
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );

    expect(stream.activities).toHaveLength(3);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-a"].entries).toHaveLength(1);
    expect(stream.states[0].runs["run-a"].entries[0].text).toBe("fresh run a");
    expect(stream.states[0].runs["run-b"].entries).toHaveLength(0);
  });

  it("ignores untracked events while a multiplexed replay is open", () => {
    const stream = openTestMultiplexedStream({
      runs: [
        { afterEventId: 4, runId: "run-a" },
        { afterEventId: 9, runId: "run-b" },
      ],
    });

    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 99,
          event_type: "run_completed",
          run_id: "run-other",
          trace_id: "run-other",
        }),
      ),
    );
    stream.source.dispatchMessage(
      "message.text.delta",
      JSON.stringify(
        relayEvent({
          event_id: 5,
          payload_json: JSON.stringify({ text: "run a" }),
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );

    expect(stream.source.close).not.toHaveBeenCalled();
    expect(stream.closedStates).toEqual([]);
    expect(stream.states).toHaveLength(1);
    expect(stream.states[0].runs["run-other"]).toBeUndefined();
  });

  it("closes multiplexed replay when tracked runs only receive duplicate terminal events", () => {
    const stream = openTestMultiplexedStream({
      initialState: runtimeStateWithClosedRuns([
        { lastEventId: 11, runId: "run-a" },
        { lastEventId: 12, runId: "run-b" },
      ]),
      runs: [
        { afterEventId: 11, runId: "run-a" },
        { afterEventId: 12, runId: "run-b" },
      ],
    });

    stream.source.dispatchMessage(
      "run.completed",
      JSON.stringify(
        relayEvent({
          event_id: 11,
          event_type: "run_completed",
          run_id: "run-a",
          trace_id: "run-a",
        }),
      ),
    );

    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["run-a"]).toMatchObject({
      lastEventId: 11,
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(stream.closedStates[0].runs["run-b"]).toMatchObject({
      lastEventId: 12,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("closes immediately when every multiplexed replay target is already terminal", () => {
    const stream = openTestMultiplexedStream({
      initialState: runtimeStateWithClosedRuns([
        { lastEventId: 11, runId: "run-a" },
        { lastEventId: 12, runId: "run-b" },
      ]),
      runs: [
        { afterEventId: 11, runId: "run-a" },
        { afterEventId: 12, runId: "run-b" },
      ],
    });

    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
    expect(stream.closedStates).toHaveLength(1);
    expect(stream.closedStates[0].runs["run-a"]).toMatchObject({
      lastEventId: 11,
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(stream.closedStates[0].runs["run-b"]).toMatchObject({
      lastEventId: 12,
      status: "closed",
      terminalEventType: "run_completed",
    });
  });

  it("rejects multiplexed streams without run targets", () => {
    expect(() =>
      openTestMultiplexedStream({
        runs: [],
      }),
    ).toThrow("At least one run stream target is required.");
  });
});

function openTestStream(overrides: Partial<RunStreamOptions> = {}): {
  activities: string[];
  closedStates: RuntimeState[];
  errors: Array<{ kind: string; message: string }>;
  handle: ReturnType<typeof openRunStream>;
  source: MockEventSource;
  states: RuntimeState[];
} {
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  const activities: string[] = [];
  const states: RuntimeState[] = [];
  const errors: Array<{ kind: string; message: string }> = [];
  const closedStates: RuntimeState[] = [];
  const handle = openRunStream({
    runId: "run-1",
    afterEventId: 0,
    initialState: initialRuntimeState,
    onState: (state) => {
      states.push(state);
    },
    onActivity: () => {
      activities.push("activity");
    },
    onError: (message, kind) => {
      errors.push({ kind, message });
    },
    onClosed: (state) => {
      closedStates.push(state);
    },
    ...overrides,
  });
  return {
    activities,
    closedStates,
    errors,
    handle,
    source: latestEventSource(),
    states,
  };
}

function openTestMultiplexedStream(
  overrides: Partial<MultiplexedRunStreamOptions> = {},
): {
  activities: string[];
  closedStates: RuntimeState[];
  errors: Array<{ kind: string; message: string }>;
  handle: ReturnType<typeof openMultiplexedRunStream>;
  source: MockEventSource;
  states: RuntimeState[];
} {
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  const activities: string[] = [];
  const states: RuntimeState[] = [];
  const errors: Array<{ kind: string; message: string }> = [];
  const closedStates: RuntimeState[] = [];
  const handle = openMultiplexedRunStream({
    initialState: initialRuntimeState,
    onClosed: (state) => {
      closedStates.push(state);
    },
    onError: (message, kind) => {
      errors.push({ kind, message });
    },
    onActivity: () => {
      activities.push("activity");
    },
    onState: (state) => {
      states.push(state);
    },
    runs: [{ afterEventId: 0, runId: "run-1" }],
    ...overrides,
  });
  return {
    activities,
    closedStates,
    errors,
    handle,
    source: latestEventSource(),
    states,
  };
}

function openTestSessionSubagentStream(
  overrides: Partial<SessionSubagentRunStreamOptions> = {},
): {
  activities: string[];
  closedStates: RuntimeState[];
  errors: Array<{ kind: string; message: string }>;
  handle: ReturnType<typeof openSessionSubagentRunStream>;
  source: MockEventSource;
  states: RuntimeState[];
} {
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  const activities: string[] = [];
  const states: RuntimeState[] = [];
  const errors: Array<{ kind: string; message: string }> = [];
  const closedStates: RuntimeState[] = [];
  const handle = openSessionSubagentRunStream({
    afterEventId: 0,
    initialState: initialRuntimeState,
    onActivity: () => {
      activities.push("activity");
    },
    onClosed: (state) => {
      closedStates.push(state);
    },
    onError: (message, kind) => {
      errors.push({ kind, message });
    },
    onState: (state) => {
      states.push(state);
    },
    runId: "subagent_run_1",
    sessionId: "session-parent",
    ...overrides,
  });
  return {
    activities,
    closedStates,
    errors,
    handle,
    source: latestEventSource(),
    states,
  };
}

function latestEventSource(): MockEventSource {
  if (MockEventSource.latest === null) {
    throw new Error("Expected stream client to create an EventSource.");
  }
  return MockEventSource.latest;
}

function relayEvent(overrides: Partial<RelayRunEvent> = {}): RelayRunEvent {
  return {
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "trace-1",
    event_type: "text_delta",
    payload_json: JSON.stringify({ text: "hello" }),
    event_id: 1,
    occurred_at: "2026-06-25T00:00:00Z",
    ...overrides,
  };
}

function agUiEvent(overrides: Partial<AgUiRunEvent> = {}): AgUiRunEvent {
  return {
    type: "message.text.delta",
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "trace-1",
    relay_event_type: "text_delta",
    payload: { text: "hello" },
    event_id: 1,
    occurred_at: "2026-06-25T00:00:00Z",
    ...overrides,
  };
}

function runtimeStateWithClosedRun(lastEventId: number): RuntimeState {
  return runtimeStateWithClosedRuns([
    {
      lastEventId,
      runId: "run-1",
    },
  ]);
}

function runtimeStateWithOpenRun(lastEventId: number): RuntimeState {
  return {
    activeRunIds: ["run-1"],
    runs: {
      "run-1": {
        entries: [],
        lastEventId,
        runId: "run-1",
        seenEventKeys: [`run-1:${lastEventId}`],
        status: "open",
        terminalEventType: null,
      },
    },
  };
}

function runtimeStateWithClosedRuns(
  runs: Array<{ lastEventId: number; runId: string }>,
): RuntimeState {
  return {
    activeRunIds: [],
    runs: Object.fromEntries(
      runs.map((run) => [
        run.runId,
        {
        entries: [],
          lastEventId: run.lastEventId,
          runId: run.runId,
          seenEventKeys: [`${run.runId}:${run.lastEventId}`],
        status: "closed",
        terminalEventType: "run_completed",
      },
      ]),
    ),
  };
}
