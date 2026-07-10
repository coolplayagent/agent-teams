const TERMINAL_RELAY_EVENT_TYPES = new Set([
  "run_completed",
  "run_failed",
  "run_stopped",
]);

export interface AgUiSseEventEvidence {
  eventId: number;
  payload: unknown;
  relayEventType: string;
  runId: string;
  sequence: number;
  type: string;
}

export interface RealAgUiSseProbe {
  events: AgUiSseEventEvidence[];
  stop: () => Promise<void>;
  waitForEventAfter: (
    eventId: number,
    relayEventType: string,
    timeoutMs: number,
  ) => Promise<AgUiSseEventEvidence>;
  waitForTerminal: (timeoutMs: number) => Promise<AgUiSseEventEvidence>;
  waitForTextDeltas: (
    count: number,
    timeoutMs: number,
  ) => Promise<AgUiSseEventEvidence[]>;
}

export function startRealAgUiSseProbe(
  baseUrl: string,
  runId: string,
  afterEventId = 0,
): RealAgUiSseProbe {
  const controller = new AbortController();
  const events: AgUiSseEventEvidence[] = [];
  let failure: Error | null = null;
  let notifyChanged: (() => void) | null = null;
  let changed = new Promise<void>((resolve) => {
    notifyChanged = resolve;
  });

  const signalChanged = () => {
    notifyChanged?.();
    changed = new Promise<void>((resolve) => {
      notifyChanged = resolve;
    });
  };

  const streamTask = consumeRunEventStream(
    baseUrl,
    runId,
    afterEventId,
    controller.signal,
    (event) => {
      events.push({ ...event, sequence: events.length });
      signalChanged();
    },
  ).catch((error: unknown) => {
    if (!controller.signal.aborted) {
      failure = error instanceof Error ? error : new Error(String(error));
      signalChanged();
    }
  });

  const waitFor = async <T>(
    description: string,
    timeoutMs: number,
    select: () => T | null,
  ): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const currentChange = changed;
      const selected = select();
      if (selected !== null) {
        return selected;
      }
      if (failure !== null) {
        throw failure;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Timed out waiting for ${description}; received ${events.length} AG-UI events.`,
        );
      }
      await waitForChange(currentChange, remaining, description);
    }
  };

  return {
    events,
    stop: async () => {
      controller.abort();
      await streamTask;
    },
    waitForEventAfter: (eventId, relayEventType, timeoutMs) =>
      waitFor(`${relayEventType} after event ${eventId}`, timeoutMs, () =>
        events.find(
          (event) =>
            event.eventId > eventId &&
            event.relayEventType === relayEventType &&
            nonEmptyTextDelta(event),
        ) ?? null,
      ),
    waitForTerminal: (timeoutMs) =>
      waitFor("terminal run event", timeoutMs, () =>
        events.find((event) =>
          TERMINAL_RELAY_EVENT_TYPES.has(event.relayEventType),
        ) ?? null,
      ),
    waitForTextDeltas: (count, timeoutMs) =>
      waitFor(`${count} non-empty text_delta events`, timeoutMs, () => {
        const deltas = textDeltaEvents(events);
        return deltas.length >= count ? deltas : null;
      }),
  };
}

function waitForChange(
  changed: Promise<void>,
  timeoutMs: number,
  description: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMs);
    void changed.then(() => {
      globalThis.clearTimeout(timeout);
      resolve();
    }, reject);
  });
}

export function concatenatedTextDeltas(
  events: AgUiSseEventEvidence[],
): string {
  return textDeltaEvents(events)
    .map((event) => textPayload(event.payload))
    .join("");
}

export function tokenUsageModelProfiles(
  events: AgUiSseEventEvidence[],
): string[] {
  return events
    .filter((event) => event.relayEventType === "token_usage")
    .map((event) => recordString(event.payload, "model_profile"))
    .filter((profile) => profile.length > 0);
}

async function consumeRunEventStream(
  baseUrl: string,
  runId: string,
  afterEventId: number,
  signal: AbortSignal,
  onEvent: (event: Omit<AgUiSseEventEvidence, "sequence">) => void,
): Promise<void> {
  const url = new URL(
    `/api/ag-ui/runs/${encodeURIComponent(runId)}/events`,
    `${baseUrl.replace(/\/$/, "")}/`,
  );
  url.searchParams.set("after_event_id", String(Math.max(0, afterEventId)));
  const response = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(`AG-UI SSE request failed with ${response.status} for ${url}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/event-stream")) {
    throw new Error(`Expected text/event-stream for ${url}, received ${contentType}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalReceived = false;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = splitCompleteSseFrames(buffer);
    buffer = frames.remainder;
    for (const frame of frames.complete) {
      const event = parseSseFrame(frame, runId);
      if (event === null) {
        continue;
      }
      onEvent(event);
      if (TERMINAL_RELAY_EVENT_TYPES.has(event.relayEventType)) {
        terminalReceived = true;
      }
    }
    if (done) {
      break;
    }
  }
  if (!signal.aborted && !terminalReceived) {
    throw new Error(`AG-UI SSE stream ended before a terminal event for ${runId}.`);
  }
}

function splitCompleteSseFrames(buffer: string): {
  complete: string[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  return {
    complete: frames.slice(0, -1),
    remainder: frames.at(-1) ?? "",
  };
}

function parseSseFrame(
  frame: string,
  expectedRunId: string,
): Omit<AgUiSseEventEvidence, "sequence"> | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data.length === 0) {
    return null;
  }
  const parsed: unknown = JSON.parse(data);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid AG-UI SSE payload: ${data}`);
  }
  const error = recordString(parsed, "error");
  if (error.length > 0) {
    throw new Error(`AG-UI SSE returned an error: ${error}`);
  }
  const eventId = parsed.event_id;
  const runId = recordString(parsed, "run_id");
  const relayEventType = recordString(parsed, "relay_event_type");
  const type = recordString(parsed, "type");
  if (!Number.isSafeInteger(eventId) || Number(eventId) <= 0) {
    throw new Error(`AG-UI SSE event is missing a positive event_id: ${data}`);
  }
  if (runId !== expectedRunId || relayEventType.length === 0 || type.length === 0) {
    throw new Error(`AG-UI SSE event has invalid run metadata: ${data}`);
  }
  return {
    eventId: Number(eventId),
    payload: parsed.payload,
    relayEventType,
    runId,
    type,
  };
}

function textDeltaEvents(
  events: AgUiSseEventEvidence[],
): AgUiSseEventEvidence[] {
  return events.filter(
    (event) => event.relayEventType === "text_delta" && nonEmptyTextDelta(event),
  );
}

function nonEmptyTextDelta(event: AgUiSseEventEvidence): boolean {
  return textPayload(event.payload).length > 0;
}

function textPayload(payload: unknown): string {
  return recordString(payload, "text");
}

function recordString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
