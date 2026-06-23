import { apiUrl } from "../api/http";
import { reduceRunEvent, type RuntimeState } from "./reducers";
import type { RelayRunEvent } from "./events";

export interface RunStreamHandle {
  close: () => void;
}

export interface RunStreamOptions {
  runId: string;
  afterEventId: number;
  onState: (state: RuntimeState) => void;
  onError: (message: string) => void;
  initialState: RuntimeState;
}

export function openRunStream(options: RunStreamOptions): RunStreamHandle {
  const params = new URLSearchParams();
  params.set("after_event_id", String(Math.max(0, options.afterEventId)));
  const source = new EventSource(
    apiUrl(`/runs/${encodeURIComponent(options.runId)}/events?${params.toString()}`),
  );
  let runtimeState = options.initialState;

  source.onmessage = (message) => {
    const parsed = JSON.parse(message.data) as RelayRunEvent | { error?: string };
    if ("error" in parsed && typeof parsed.error === "string") {
      options.onError(parsed.error);
      return;
    }
    runtimeState = reduceRunEvent(runtimeState, parsed as RelayRunEvent);
    options.onState(runtimeState);
  };
  source.onerror = () => {
    options.onError("Run stream disconnected.");
  };

  return {
    close: () => source.close(),
  };
}
