import { apiUrl } from "../api/http";
import { reduceRunEvent, type RuntimeState } from "./reducers";
import { AG_UI_EVENT_NAMES, type RunEventEnvelope } from "./events";

export interface RunStreamHandle {
  close: () => void;
}

export interface RunStreamOptions {
  runId: string;
  afterEventId: number;
  onState: (state: RuntimeState) => void;
  onError: (message: string) => void;
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

  const handleMessage = (message: MessageEvent<string>) => {
    const parsed = JSON.parse(message.data) as RunEventEnvelope | { error?: string };
    if ("error" in parsed && typeof parsed.error === "string") {
      options.onError(parsed.error);
      return;
    }
    runtimeState = reduceRunEvent(runtimeState, parsed as RunEventEnvelope);
    options.onState(runtimeState);
    if (!runtimeState.activeRunIds.includes(options.runId)) {
      source.close();
      options.onClosed?.(runtimeState);
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
    if (isMessageEvent(event)) {
      handleMessage(event);
      return;
    }
    options.onError("Run stream disconnected.");
  });
  source.onerror = (event) => {
    if (!isMessageEvent(event)) {
      options.onError("Run stream disconnected.");
    }
  };

  return {
    close: () => source.close(),
  };
}

function isMessageEvent(event: Event): event is MessageEvent<string> {
  return "data" in event && typeof event.data === "string";
}
