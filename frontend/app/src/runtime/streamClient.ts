import { apiUrl } from "../api/http";
import { reduceRunEvent, type RuntimeState } from "./reducers";
import { AG_UI_EVENT_NAMES, type RunEventEnvelope } from "./events";

export interface RunStreamHandle {
  close: () => void;
}

export type RunStreamErrorKind = "malformed" | "server" | "transport";

export interface RunStreamOptions {
  runId: string;
  afterEventId: number;
  onState: (state: RuntimeState) => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

export interface RunStreamTarget {
  runId: string;
  afterEventId: number;
}

export interface MultiplexedRunStreamOptions {
  runs: RunStreamTarget[];
  onState: (state: RuntimeState) => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

export function openRunStream(options: RunStreamOptions): RunStreamHandle {
  return openRunEventSource({
    initialState: options.initialState,
    onClosed: options.onClosed,
    onError: options.onError,
    onState: options.onState,
    trackedRunIds: [options.runId],
    url: runStreamUrl(options.runId, options.afterEventId),
  });
}

export function openMultiplexedRunStream(
  options: MultiplexedRunStreamOptions,
): RunStreamHandle {
  const runs = normalizeRunStreamTargets(options.runs);
  return openRunEventSource({
    initialState: options.initialState,
    onClosed: options.onClosed,
    onError: options.onError,
    onState: options.onState,
    trackedRunIds: runs.map((run) => run.runId),
    url: multiplexedRunStreamUrl(runs),
  });
}

interface RunEventSourceOptions {
  url: string;
  trackedRunIds: string[];
  onState: (state: RuntimeState) => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

function openRunEventSource(options: RunEventSourceOptions): RunStreamHandle {
  const source = new EventSource(apiUrl(options.url));
  let runtimeState = options.initialState;
  let didNotifyClosed = false;
  let sourceClosed = false;

  const closeSource = () => {
    if (sourceClosed) {
      return;
    }
    sourceClosed = true;
    source.close();
  };

  const notifyClosed = () => {
    if (didNotifyClosed) {
      return;
    }
    didNotifyClosed = true;
    closeSource();
    options.onClosed?.(runtimeState);
  };

  const handleParsedPayload = (
    parsed: RunEventEnvelope | StreamErrorPayload,
    lastEventId: string,
  ) => {
    if (sourceClosed) {
      return;
    }
    if (isStreamErrorPayload(parsed)) {
      closeSource();
      options.onError(parsed.error, "server");
      return;
    }
    const event = withLastEventIdFallback(parsed, lastEventId);
    if (!options.trackedRunIds.includes(event.run_id)) {
      return;
    }
    const nextRuntimeState = reduceRunEvent(runtimeState, event);
    if (nextRuntimeState === runtimeState) {
      if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
        notifyClosed();
      }
      return;
    }
    runtimeState = nextRuntimeState;
    options.onState(runtimeState);
    if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
      notifyClosed();
    }
  };

  const handleMessage = (message: MessageEvent<string>) => {
    const parsed = parseStreamPayload(message.data);
    if (parsed === null) {
      options.onError("Malformed run stream event.", "malformed");
      return;
    }
    handleParsedPayload(parsed, message.lastEventId);
  };

  const handleErrorEvent = (event: Event) => {
    if (sourceClosed) {
      return;
    }
    if (!isMessageEvent(event)) {
      options.onError("Run stream disconnected.", "transport");
      return;
    }
    const parsed = parseStreamPayload(event.data);
    if (parsed === null) {
      options.onError("Run stream disconnected.", "transport");
      return;
    }
    handleParsedPayload(parsed, event.lastEventId);
  };

  source.onmessage = handleMessage;
  for (const eventName of AG_UI_EVENT_NAMES) {
    source.addEventListener(eventName, (event) => {
      if (isMessageEvent(event)) {
        handleMessage(event);
      }
    });
  }
  source.addEventListener("error", (event) => {
    handleErrorEvent(event);
  });

  return {
    close: closeSource,
  };
}

function runStreamUrl(runId: string, afterEventId: number): string {
  const params = new URLSearchParams();
  params.set("after_event_id", String(Math.max(0, afterEventId)));
  return `/ag-ui/runs/${encodeURIComponent(runId)}/events?${params.toString()}`;
}

function multiplexedRunStreamUrl(runs: RunStreamTarget[]): string {
  const params = new URLSearchParams();
  for (const run of runs) {
    params.append("run_id", run.runId);
    params.append("after_event_id", String(Math.max(0, run.afterEventId)));
  }
  return `/ag-ui/runs/events?${params.toString()}`;
}

function normalizeRunStreamTargets(runs: RunStreamTarget[]): RunStreamTarget[] {
  const normalizedRuns = runs.map((run) => ({
    afterEventId: Math.max(0, run.afterEventId),
    runId: run.runId.trim(),
  }));
  if (normalizedRuns.length === 0) {
    throw new Error("At least one run stream target is required.");
  }
  if (normalizedRuns.some((run) => run.runId.length === 0)) {
    throw new Error("Run stream target runId cannot be blank.");
  }
  const targetsByRunId = new Map<string, RunStreamTarget>();
  for (const run of normalizedRuns) {
    const existing = targetsByRunId.get(run.runId);
    targetsByRunId.set(run.runId, {
      afterEventId: Math.max(existing?.afterEventId ?? 0, run.afterEventId),
      runId: run.runId,
    });
  }
  return Array.from(targetsByRunId.values());
}

function trackedRunsClosed(
  runtimeState: RuntimeState,
  trackedRunIds: string[],
): boolean {
  return trackedRunIds.every(
    (runId) => runtimeState.runs[runId]?.status === "closed",
  );
}

function isMessageEvent(event: Event): event is MessageEvent<string> {
  return "data" in event && typeof event.data === "string";
}

function parseStreamPayload(rawData: string): RunEventEnvelope | StreamErrorPayload | null {
  try {
    const parsed = JSON.parse(rawData) as unknown;
    if (isStreamErrorPayload(parsed)) {
      return parsed;
    }
    if (isRunEventEnvelope(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function withLastEventIdFallback(
  event: RunEventEnvelope,
  lastEventId: string,
): RunEventEnvelope {
  if (typeof event.event_id === "number" && event.event_id > 0) {
    return event;
  }
  const fallbackEventId = parsePositiveEventId(lastEventId);
  if (fallbackEventId === null) {
    return event;
  }
  return {
    ...event,
    event_id: fallbackEventId,
  };
}

function parsePositiveEventId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

interface StreamErrorPayload {
  error: string;
}

function isStreamErrorPayload(value: unknown): value is StreamErrorPayload {
  return (
    isRecord(value) &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function isRunEventEnvelope(value: unknown): value is RunEventEnvelope {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.session_id !== "string" ||
    typeof value.run_id !== "string" ||
    typeof value.trace_id !== "string"
  ) {
    return false;
  }
  if (typeof value.relay_event_type === "string") {
    return typeof value.type === "string" && "payload" in value;
  }
  return typeof value.event_type === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
