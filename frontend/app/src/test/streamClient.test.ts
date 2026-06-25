import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgUiRunEvent, RelayRunEvent } from "../runtime/events";
import { initialRuntimeState, type RuntimeState } from "../runtime/reducers";
import { openRunStream, type RunStreamOptions } from "../runtime/streamClient";

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

  dispatchMessage(type: string, data: string): void {
    const event = new MessageEvent<string>(type, { data });
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

  it("does not double-report a transport error", () => {
    const stream = openTestStream();

    stream.source.dispatchTransportError();

    expect(stream.errors).toEqual([
      { kind: "transport", message: "Run stream disconnected." },
    ]);
    expect(stream.source.close).toHaveBeenCalledTimes(1);
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
