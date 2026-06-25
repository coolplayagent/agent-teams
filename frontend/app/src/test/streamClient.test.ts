import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgUiRunEvent, RelayRunEvent } from "../runtime/events";
import { initialRuntimeState, type RuntimeState } from "../runtime/reducers";
import {
  openMultiplexedRunStream,
  openRunStream,
  type MultiplexedRunStreamOptions,
  type RunStreamOptions,
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
  vi.unstubAllGlobals();
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

  it("reduces AG-UI state snapshot and delta events from named stream events", () => {
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

    expect(stream.states).toHaveLength(2);
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

  it("reports server error payloads without reducing them", () => {
    const stream = openTestStream();

    stream.source.dispatchMessage("error", JSON.stringify({ error: "resume failed" }));

    expect(stream.errors).toEqual([{ kind: "server", message: "resume failed" }]);
    expect(stream.states).toEqual([]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
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

  it("opens multiplexed streams and waits for every tracked run to close", () => {
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

  it("rejects multiplexed streams without run targets", () => {
    expect(() =>
      openTestMultiplexedStream({
        runs: [],
      }),
    ).toThrow("At least one run stream target is required.");
  });
});

function openTestStream(overrides: Partial<RunStreamOptions> = {}): {
  closedStates: RuntimeState[];
  errors: Array<{ kind: string; message: string }>;
  handle: ReturnType<typeof openRunStream>;
  source: MockEventSource;
  states: RuntimeState[];
} {
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
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
    onError: (message, kind) => {
      errors.push({ kind, message });
    },
    onClosed: (state) => {
      closedStates.push(state);
    },
    ...overrides,
  });
  return {
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
  closedStates: RuntimeState[];
  errors: Array<{ kind: string; message: string }>;
  handle: ReturnType<typeof openMultiplexedRunStream>;
  source: MockEventSource;
  states: RuntimeState[];
} {
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
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
    onState: (state) => {
      states.push(state);
    },
    runs: [{ afterEventId: 0, runId: "run-1" }],
    ...overrides,
  });
  return {
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
