import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getRecoverySnapshot } from "../api/client";
import { openSessionActivityStream } from "./sessionActivityClient";
import type { SessionActivityEvent } from "./sessionActivityClient";
import { isTerminalRunEvent } from "./events";
import { useOptimisticRunStore } from "./optimisticRunStore";
import { useRuntimeStore } from "./runtimeStore";

const ACTIVITY_INVALIDATION_DELAY_MS = 250;
const DISCONNECTED_FALLBACK_REFRESH_MS = 30000;

export function useSessionActivityMonitor({
  locallyTrackedRunIds,
  queryClient,
  sessionId,
}: {
  locallyTrackedRunIds: string[];
  queryClient: QueryClient;
  sessionId: string | null;
}): void {
  const locallyTrackedRunIdsRef = useRef(locallyTrackedRunIds);
  locallyTrackedRunIdsRef.current = locallyTrackedRunIds;
  useEffect(() => {
    if (sessionId === null) {
      return undefined;
    }
    let fallbackTimer: number | null = null;
    let invalidationTimer: number | null = null;
    let pendingEvents: SessionActivityEvent[] = [];

    const refreshRecovery = () => {
      void queryClient.fetchQuery({
        queryKey: ["sessions", sessionId, "recovery"],
        queryFn: () => getRecoverySnapshot(sessionId, true),
        staleTime: 0,
      }).catch(() => undefined);
    };
    const invalidateSidebar = () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    };
    const invalidateSubagents = () => {
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "subagents"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "agents"],
      });
    };
    const invalidateExternalRunViews = () => {
      void queryClient.invalidateQueries({
        queryKey: ["sessions", "detail", sessionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "rounds"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "messages"],
      });
    };
    const scheduleRefresh = (event: SessionActivityEvent) => {
      pendingEvents.push(event);
      if (invalidationTimer !== null) {
        return;
      }
      invalidationTimer = window.setTimeout(() => {
        invalidationTimer = null;
        const events = pendingEvents;
        pendingEvents = [];
        const locallyKnown = localRunIdsForSession(
          sessionId,
          locallyTrackedRunIdsRef.current,
        );
        const localSubmissionActive =
          useOptimisticRunStore.getState().prompts[sessionId] !== undefined;
        const scopes = new Set(events.map((item) =>
          activityEventRefreshScope(
            item,
            locallyKnown,
            localSubmissionActive,
          )
        ));
        if (scopes.has("recovery") || scopes.has("subagent") || scopes.has("external")) {
          refreshRecovery();
          invalidateSidebar();
        }
        if (scopes.has("subagent") || scopes.has("external")) {
          invalidateSubagents();
        }
        if (scopes.has("external")) {
          invalidateExternalRunViews();
        }
      }, ACTIVITY_INVALIDATION_DELAY_MS);
    };
    const stopFallback = () => {
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const startFallback = () => {
      if (fallbackTimer !== null) {
        return;
      }
      fallbackTimer = window.setInterval(
        refreshRecovery,
        DISCONNECTED_FALLBACK_REFRESH_MS,
      );
    };
    const stream = openSessionActivityStream({
      onActivity: scheduleRefresh,
      onDisconnected: startFallback,
      onReady: () => {
        stopFallback();
        if (
          !sessionHasLocalActivity(sessionId, locallyTrackedRunIdsRef.current)
        ) {
          refreshRecovery();
        }
      },
      sessionId,
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshRecovery();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      stream.close();
      stopFallback();
      if (invalidationTimer !== null) {
        window.clearTimeout(invalidationTimer);
      }
    };
  }, [queryClient, sessionId]);
}

function localRunIdsForSession(
  sessionId: string,
  locallyTrackedRunIds: readonly string[],
): ReadonlySet<string> {
  const runIds = new Set(
    locallyTrackedRunIds
      .map((runId) => runId.trim())
      .filter((runId) => runId.length > 0),
  );
  for (const runState of Object.values(
    useRuntimeStore.getState().runtimeState.runs,
  )) {
    if (runState.sessionId === sessionId) {
      runIds.add(runState.runId);
    }
  }
  return runIds;
}

function sessionHasLocalActivity(
  sessionId: string,
  locallyTrackedRunIds: readonly string[],
): boolean {
  if (
    useOptimisticRunStore.getState().prompts[sessionId] !== undefined ||
    locallyTrackedRunIds.length > 0
  ) {
    return true;
  }
  const runtimeState = useRuntimeStore.getState().runtimeState;
  return runtimeState.activeRunIds.some(
    (runId) => runtimeState.runs[runId]?.sessionId === sessionId,
  );
}

type SessionActivityRefreshScope = "external" | "none" | "recovery" | "subagent";

const SESSION_ACTIVITY_EVENT_KINDS = {
  background_task_completed: "subagent",
  background_task_started: "subagent",
  background_task_stopped: "subagent",
  background_task_updated: "subagent",
  run_completed: "run",
  run_failed: "run",
  run_paused: "run",
  run_resumed: "run",
  run_started: "run",
  run_stopped: "run",
  subagent_resumed: "subagent",
  subagent_session_status_changed: "subagent",
  subagent_stopped: "subagent",
  tool_approval_requested: "recovery",
  tool_approval_resolved: "recovery",
  user_question_answered: "recovery",
  user_question_requested: "recovery",
} as const;

type SessionActivityEventKind =
  (typeof SESSION_ACTIVITY_EVENT_KINDS)[keyof typeof SESSION_ACTIVITY_EVENT_KINDS];
type SessionRunActivityEventType = {
  [EventType in keyof typeof SESSION_ACTIVITY_EVENT_KINDS]:
    (typeof SESSION_ACTIVITY_EVENT_KINDS)[EventType] extends "run"
      ? EventType
      : never;
}[keyof typeof SESSION_ACTIVITY_EVENT_KINDS];

function activityEventRefreshScope(
  event: SessionActivityEvent,
  locallyKnownRunIds: ReadonlySet<string>,
  localSubmissionActive: boolean,
): SessionActivityRefreshScope {
  const eventKind = sessionActivityEventKind(event.event_type);
  if (eventKind === null) {
    return "none";
  }
  if (eventKind !== "run") {
    return eventKind;
  }
  if (event.event_type === "run_started" && localSubmissionActive) {
    return "none";
  }
  if (!locallyKnownRunIds.has(event.run_id.trim())) {
    return "external";
  }
  return isTerminalRunEvent(event.event_type as SessionRunActivityEventType)
    ? "external"
    : "none";
}

function sessionActivityEventKind(
  eventType: string,
): SessionActivityEventKind | null {
  if (!Object.hasOwn(SESSION_ACTIVITY_EVENT_KINDS, eventType)) {
    return null;
  }
  return SESSION_ACTIVITY_EVENT_KINDS[
    eventType as keyof typeof SESSION_ACTIVITY_EVENT_KINDS
  ];
}
