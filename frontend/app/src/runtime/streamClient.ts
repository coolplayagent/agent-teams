import { apiUrl } from "../api/http";
import {
  reduceRunEvents,
  type RuntimeRunState,
  type RuntimeState,
} from "./reducers";
import {
  AG_UI_EVENT_NAMES,
  isTerminalRunEvent,
  parseRunEvent,
  type RunEventEnvelope,
} from "./events";

const STREAM_STATE_NOTIFICATION_INTERVAL_MS = 100;
const STREAM_EVENT_BATCH_SIZE = 512;

export interface RunStreamHandle {
  close: () => void;
}

export type RunStreamErrorKind = "malformed" | "server" | "transport";

export interface RunStreamOptions {
  runId: string;
  afterEventId: number;
  onState: (state: RuntimeState) => void;
  onActivity?: () => void;
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
  onActivity?: () => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

export interface SessionSubagentRunStreamOptions {
  sessionId: string;
  runId: string;
  afterEventId: number;
  onState: (state: RuntimeState) => void;
  onActivity?: () => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

export function openRunStream(options: RunStreamOptions): RunStreamHandle {
  const run = {
    afterEventId: Math.max(0, options.afterEventId),
    runId: options.runId,
  };
  return openRunEventSource({
    initialState: runtimeStateWithReplayCursors(options.initialState, [run]),
    onActivity: options.onActivity,
    onClosed: options.onClosed,
    onError: options.onError,
    onState: options.onState,
    trackedRunIds: [run.runId],
    url: runStreamUrl(run.runId, run.afterEventId),
  });
}

export function openMultiplexedRunStream(
  options: MultiplexedRunStreamOptions,
): RunStreamHandle {
  const runs = normalizeRunStreamTargets(options.runs);
  return openRunEventSource({
    initialState: runtimeStateWithReplayCursors(options.initialState, runs),
    onActivity: options.onActivity,
    onClosed: options.onClosed,
    onError: options.onError,
    onState: options.onState,
    trackedRunIds: runs.map((run) => run.runId),
    url: multiplexedRunStreamUrl(runs),
  });
}

export function openSessionSubagentRunStream(
  options: SessionSubagentRunStreamOptions,
): RunStreamHandle {
  const run = {
    afterEventId: Math.max(0, options.afterEventId),
    runId: options.runId.trim(),
  };
  const initialState = runtimeStateWithRunScope(
    runtimeStateWithReplayCursors(options.initialState, [run]),
    run.runId,
    "subagent",
  );
  return openRunEventSource({
    initialState,
    onActivity: options.onActivity,
    onClosed: options.onClosed,
    onError: options.onError,
    onState: options.onState,
    trackedRunIds: [run.runId],
    url: sessionSubagentRunStreamUrl(options.sessionId, run.afterEventId),
  });
}

interface RunEventSourceOptions {
  url: string;
  trackedRunIds: string[];
  onState: (state: RuntimeState) => void;
  onActivity?: () => void;
  onError: (message: string, kind: RunStreamErrorKind) => void;
  onClosed?: (state: RuntimeState) => void;
  initialState: RuntimeState;
}

function openRunEventSource(options: RunEventSourceOptions): RunStreamHandle {
  for (const runId of options.trackedRunIds) {
    markStreamStartTiming("event-source-construct", runId);
  }
  const source = new EventSource(apiUrl(options.url));
  let runtimeState = options.initialState;
  let didNotifyClosed = false;
  let sourceClosed = false;
  let pendingStateNotification: ReturnType<typeof globalThis.setTimeout> | null = null;
  let pendingTerminalFrame: number | null = null;
  let pendingTerminalTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
  let pendingTerminalEvents: RunEventEnvelope[] = [];
  let pendingEvents: RunEventEnvelope[] = [];
  let pendingEventHead = 0;
  let lastStateNotificationAt = Number.NEGATIVE_INFINITY;
  const preferManualReconnect = options.trackedRunIds.length > 1;

  const cancelPendingStateNotification = () => {
    if (pendingStateNotification === null) {
      return;
    }
    globalThis.clearTimeout(pendingStateNotification);
    pendingStateNotification = null;
  };

  const cancelPendingTerminalNotification = () => {
    if (pendingTerminalFrame !== null) {
      globalThis.cancelAnimationFrame?.(pendingTerminalFrame);
      pendingTerminalFrame = null;
    }
    if (pendingTerminalTimeout !== null) {
      globalThis.clearTimeout(pendingTerminalTimeout);
      pendingTerminalTimeout = null;
    }
  };

  const applyPendingEventBatch = (limit = STREAM_EVENT_BATCH_SIZE) => {
    const pendingCount = pendingEvents.length - pendingEventHead;
    if (pendingCount === 0) {
      return false;
    }
    const eventCount = Math.min(limit, pendingCount);
    const events = pendingEvents.slice(pendingEventHead, pendingEventHead + eventCount);
    pendingEventHead += eventCount;
    if (pendingEventHead === pendingEvents.length) {
      pendingEvents = [];
      pendingEventHead = 0;
    } else if (pendingEventHead >= STREAM_EVENT_BATCH_SIZE * 4) {
      pendingEvents = pendingEvents.slice(pendingEventHead);
      pendingEventHead = 0;
    }
    const nextRuntimeState = reduceRunEvents(runtimeState, events);
    if (nextRuntimeState === runtimeState) {
      return false;
    }
    runtimeState = nextRuntimeState;
    return true;
  };

  const notifyStateNow = () => {
    cancelPendingStateNotification();
    const stateChanged = applyPendingEventBatch();
    if (stateChanged) {
      lastStateNotificationAt = Date.now();
      options.onState(runtimeState);
    }
    if (pendingEvents.length > pendingEventHead) {
      pendingStateNotification = globalThis.setTimeout(
        notifyStateNow,
        STREAM_STATE_NOTIFICATION_INTERVAL_MS,
      );
    } else if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
      notifyClosed();
    }
  };

  const flushPendingStateNotification = () => {
    if (
      pendingStateNotification === null &&
      pendingEvents.length === pendingEventHead
    ) {
      return;
    }
    cancelPendingStateNotification();
    if (pendingEvents.length === pendingEventHead) {
      return;
    }
    const nextRuntimeState = reduceRunEvents(
      runtimeState,
      pendingEvents.slice(pendingEventHead),
    );
    pendingEvents = [];
    pendingEventHead = 0;
    if (nextRuntimeState !== runtimeState) {
      runtimeState = nextRuntimeState;
      lastStateNotificationAt = Date.now();
      options.onState(runtimeState);
    }
  };

  const flushPendingTerminalNotification = () => {
    if (pendingTerminalEvents.length === 0) {
      return;
    }
    cancelPendingTerminalNotification();
    pendingEvents.push(...pendingTerminalEvents);
    pendingTerminalEvents = [];
    flushPendingStateNotification();
    if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
      notifyClosed();
    }
  };

  const scheduleTerminalNotificationAfterDeltaPaint = (
    terminalEvent: RunEventEnvelope,
  ) => {
    pendingTerminalEvents.push(terminalEvent);
    if (pendingTerminalFrame !== null || pendingTerminalTimeout !== null) {
      return;
    }
    if (typeof globalThis.requestAnimationFrame === "function") {
      pendingTerminalFrame = globalThis.requestAnimationFrame(() => {
        pendingTerminalFrame = null;
        if (pendingTerminalTimeout !== null) {
          globalThis.clearTimeout(pendingTerminalTimeout);
        }
        pendingTerminalTimeout = globalThis.setTimeout(() => {
          pendingTerminalTimeout = null;
          flushPendingTerminalNotification();
        }, 0);
      });
    }
    pendingTerminalTimeout = globalThis.setTimeout(
      flushPendingTerminalNotification,
      100,
    );
  };

  const notifyStateOnStreamCadence = () => {
    const elapsed = Date.now() - lastStateNotificationAt;
    if (elapsed >= STREAM_STATE_NOTIFICATION_INTERVAL_MS) {
      notifyStateNow();
      return;
    }
    if (pendingStateNotification !== null) {
      return;
    }
    pendingStateNotification = globalThis.setTimeout(() => {
      pendingStateNotification = null;
      notifyStateNow();
    }, STREAM_STATE_NOTIFICATION_INTERVAL_MS - elapsed);
  };

  const closeSource = () => {
    if (sourceClosed) {
      return;
    }
    sourceClosed = true;
    source.close();
  };

  const closeWithStateFlush = () => {
    flushPendingStateNotification();
    flushPendingTerminalNotification();
    closeSource();
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
      flushPendingStateNotification();
      closeSource();
      options.onError(parsed.error, "server");
      return;
    }
    const event = withLastEventIdFallback(parsed, lastEventId);
    if (!options.trackedRunIds.includes(event.run_id)) {
      return;
    }
    options.onActivity?.();
    pendingEvents.push(event);
    const eventType = parseRunEvent(event).event_type;
    if (isTerminalRunEvent(eventType)) {
      markStreamTerminalTiming("received", event.run_id, eventType);
      const terminalEvent = pendingEvents.pop();
      const hasPendingDeltaState = pendingEvents.length > pendingEventHead;
      flushPendingStateNotification();
      if (terminalEvent !== undefined && hasPendingDeltaState) {
        scheduleTerminalNotificationAfterDeltaPaint(terminalEvent);
      } else if (terminalEvent !== undefined) {
        pendingEvents.push(terminalEvent);
        flushPendingStateNotification();
        if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
          notifyClosed();
        }
      }
      return;
    }
    notifyStateOnStreamCadence();
    if (
      pendingEvents.length === pendingEventHead &&
      trackedRunsClosed(runtimeState, options.trackedRunIds)
    ) {
      notifyClosed();
    }
  };

  const handleMessage = (message: MessageEvent<string>) => {
    if (sourceClosed) {
      return;
    }
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
      flushPendingStateNotification();
      if (preferManualReconnect) {
        closeSource();
      }
      options.onError("Run stream disconnected.", "transport");
      return;
    }
    const parsed = parseStreamPayload(event.data);
    if (parsed === null) {
      flushPendingStateNotification();
      if (preferManualReconnect) {
        closeSource();
      }
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

  if (trackedRunsClosed(runtimeState, options.trackedRunIds)) {
    notifyClosed();
  }

  return {
    close: closeWithStateFlush,
  };
}

function markStreamStartTiming(phase: string, runId: string): void {
  try {
    globalThis.performance?.mark(`agent-teams:run-start:${phase}:${runId}`);
  } catch {
    // Performance instrumentation must never affect stream startup.
  }
}

function markStreamTerminalTiming(
  phase: "received",
  runId: string,
  eventType: string,
): void {
  try {
    globalThis.performance?.mark(
      `agent-teams:terminal:${phase}:${runId}:${eventType}`,
    );
  } catch {
    // Performance instrumentation must never affect stream delivery.
  }
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

function sessionSubagentRunStreamUrl(
  sessionId: string,
  afterEventId: number,
): string {
  const params = new URLSearchParams();
  params.set("after_event_id", String(Math.max(0, afterEventId)));
  return `/sessions/${encodeURIComponent(sessionId)}/subagents/events?${params.toString()}`;
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

function runtimeStateWithReplayCursors(
  initialState: RuntimeState,
  runs: RunStreamTarget[],
): RuntimeState {
  let nextRuns: Record<string, RuntimeRunState> | null = null;
  for (const run of runs) {
    if (run.afterEventId <= 0) {
      continue;
    }
    const currentRun = (nextRuns ?? initialState.runs)[run.runId];
    if (currentRun !== undefined && currentRun.lastEventId >= run.afterEventId) {
      continue;
    }
    nextRuns ??= { ...initialState.runs };
    nextRuns[run.runId] = {
      entries: currentRun?.entries ?? [],
      lastEventId: run.afterEventId,
      ...optionalRuntimeRunMetadata(currentRun),
      replayAfterEventId: Math.max(
        currentRun?.replayAfterEventId ?? 0,
        run.afterEventId,
      ),
      runId: run.runId,
      ...(currentRun?.seenEventIdRanges !== undefined
        ? { seenEventIdRanges: currentRun.seenEventIdRanges }
        : {}),
      seenEventKeys: currentRun?.seenEventKeys ?? [],
      status: currentRun?.status ?? "connecting",
      terminalEventType: currentRun?.terminalEventType ?? null,
    } satisfies RuntimeRunState;
  }
  return nextRuns === null
    ? initialState
    : {
        ...initialState,
        runs: nextRuns,
  };
}

function runtimeStateWithRunScope(
  initialState: RuntimeState,
  runId: string,
  scope: NonNullable<RuntimeRunState["scope"]>,
): RuntimeState {
  const currentRun = initialState.runs[runId];
  const scopedRun: RuntimeRunState = {
    entries: currentRun?.entries ?? [],
    lastEventId: currentRun?.lastEventId ?? 0,
    ...optionalRuntimeRunMetadata(currentRun),
    runId,
    ...(currentRun?.seenEventIdRanges !== undefined
      ? { seenEventIdRanges: currentRun.seenEventIdRanges }
      : {}),
    seenEventKeys: currentRun?.seenEventKeys ?? [],
    status: currentRun?.status ?? "connecting",
    terminalEventType: currentRun?.terminalEventType ?? null,
    scope,
  };
  if (currentRun?.replayAfterEventId !== undefined) {
    scopedRun.replayAfterEventId = currentRun.replayAfterEventId;
  }
  return {
    ...initialState,
    runs: {
      ...initialState.runs,
      [runId]: scopedRun,
    },
  };
}

function optionalRuntimeRunMetadata(
  runState: RuntimeRunState | undefined,
): Partial<RuntimeRunState> {
  if (runState === undefined) {
    return {};
  }
  const metadata: Partial<RuntimeRunState> = {};
  if (runState.sessionId !== undefined) {
    metadata.sessionId = runState.sessionId;
  }
  if (runState.promptText !== undefined) {
    metadata.promptText = runState.promptText;
  }
  if (runState.createdAt !== undefined) {
    metadata.createdAt = runState.createdAt;
  }
  if (runState.targetRoleId !== undefined) {
    metadata.targetRoleId = runState.targetRoleId;
  }
  if (runState.scope !== undefined) {
    metadata.scope = runState.scope;
  }
  return metadata;
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
