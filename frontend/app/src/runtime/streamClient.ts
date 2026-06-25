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

export function openRunStream(options: RunStreamOptions): RunStreamHandle {
  const params = new URLSearchParams();
  params.set("after_event_id", String(Math.max(0, options.afterEventId)));
  const source = new EventSource(
    apiUrl(`/ag-ui/runs/${encodeURIComponent(options.runId)}/events?${params.toString()}`),
  );
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

  const handleMessage = (message: MessageEvent<string>) => {
    if (sourceClosed) {
      return;
    }
    const parsed = parseStreamPayload(message.data);
    if (parsed === null) {
      options.onError("Malformed run stream event.", "malformed");
      return;
    }
    if (isStreamErrorPayload(parsed)) {
      options.onError(parsed.error, "server");
      return;
    }
    runtimeState = reduceRunEvent(runtimeState, parsed);
    options.onState(runtimeState);
    if (!runtimeState.activeRunIds.includes(options.runId)) {
      notifyClosed();
    }
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
    if (sourceClosed) {
      return;
    }
    if (isMessageEvent(event)) {
      handleMessage(event);
      return;
    }
    closeSource();
    options.onError("Run stream disconnected.", "transport");
  });

  return {
    close: closeSource,
  };
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
