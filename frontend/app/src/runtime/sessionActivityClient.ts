import { apiUrl } from "../api/http";

export interface SessionActivityStreamHandle {
  close: () => void;
}

export interface SessionActivityStreamOptions {
  onActivity: (event: SessionActivityEvent) => void;
  onDisconnected: () => void;
  onReady: () => void;
  sessionId: string;
}

export interface SessionActivityEvent {
  event_type: string;
  run_id: string;
}

export function openSessionActivityStream(
  options: SessionActivityStreamOptions,
): SessionActivityStreamHandle {
  const source = new EventSource(
    apiUrl(
      `/sessions/${encodeURIComponent(options.sessionId)}/activity/events`,
    ),
  );
  let closed = false;
  source.addEventListener("ready", () => {
    if (!closed) {
      options.onReady();
    }
  });
  source.onmessage = (message) => {
    if (closed) {
      return;
    }
    try {
      const event = JSON.parse(message.data) as SessionActivityEvent;
      if (typeof event.event_type === "string" && typeof event.run_id === "string") {
        options.onActivity(event);
      }
    } catch {
      options.onDisconnected();
    }
  };
  source.onerror = () => {
    if (!closed) {
      options.onDisconnected();
    }
  };
  return {
    close: () => {
      closed = true;
      source.close();
    },
  };
}
