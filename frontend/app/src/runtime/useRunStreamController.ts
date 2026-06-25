import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  openMultiplexedRunStream,
  openRunStream,
  type RunStreamErrorKind,
  type RunStreamHandle,
  type RunStreamTarget,
} from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";
import type { RuntimeState } from "./reducers";

const RECOVERY_CONTINUITY_REFRESH_MS = 10000;
const RUN_STREAM_MANUAL_RECONNECT_GRACE_MS = 3500;
const RUN_STREAM_RECONNECT_MAX_ATTEMPTS = 3;

export interface StartRunStreamOptions {
  runId: string;
  sessionId: string;
  afterEventId?: number;
  foreground?: boolean;
}

export interface StartRunStreamTarget {
  runId: string;
  afterEventId?: number;
}

export interface StartRunStreamsOptions {
  sessionId: string;
  runs: StartRunStreamTarget[];
  foregroundRunIds?: string[];
}

export interface RunStreamController {
  activeRunId: string | null;
  activeRunIds: string[];
  clearRunStream: () => void;
  startRunStream: (options: StartRunStreamOptions) => void;
  startRunStreams: (options: StartRunStreamsOptions) => void;
  suppressedRunIds: string[];
  trackedRunIds: string[];
}

interface RunStreamCallbacks {
  initialState: RuntimeState;
  onActivity: () => void;
  onState: (nextRuntimeState: RuntimeState) => void;
  onClosed: () => void;
  onError: (errorMessage: string, errorKind: RunStreamErrorKind) => void;
}

export function useRunStreamController(): RunStreamController {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const runtimeStateRef = useRef(runtimeState);
  const streamHandleRef = useRef<RunStreamHandle | null>(null);
  const continuityRefreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamGenerationRef = useRef(0);
  const [activeRunIds, setActiveRunIds] = useState<string[]>([]);
  const [suppressedRunIds, setSuppressedRunIds] = useState<string[]>([]);
  const [trackedRunIds, setTrackedRunIds] = useState<string[]>([]);
  const activeRunId = activeRunIds[0] ?? null;

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(
    () => () => {
      stopContinuityRefresh();
      clearReconnectTimer();
      streamHandleRef.current?.close();
    },
    [],
  );

  const refreshRecoverySnapshot = (sessionId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "recovery"],
    });
  };

  const stopContinuityRefresh = () => {
    if (continuityRefreshTimerRef.current !== null) {
      window.clearInterval(continuityRefreshTimerRef.current);
      continuityRefreshTimerRef.current = null;
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const startContinuityRefresh = (sessionId: string) => {
    stopContinuityRefresh();
    refreshRecoverySnapshot(sessionId);
    continuityRefreshTimerRef.current = window.setInterval(() => {
      refreshRecoverySnapshot(sessionId);
    }, RECOVERY_CONTINUITY_REFRESH_MS);
  };

  const stopActiveRunStream = () => {
    streamGenerationRef.current += 1;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    setActiveRunIds([]);
    setTrackedRunIds([]);
  };

  const clearSuppressedRunTargets = (runs: StartRunStreamTarget[]) => {
    const runIds = normalizedRunIds(runs);
    if (runIds.length === 0) {
      return;
    }
    setSuppressedRunIds((current) => current.filter((runId) => !runIds.includes(runId)));
  };

  const suppressRunTargets = (runs: StartRunStreamTarget[]) => {
    const runIds = normalizedRunIds(runs);
    if (runIds.length === 0) {
      return;
    }
    setSuppressedRunIds((current) => {
      const merged = new Set(current);
      for (const runId of runIds) {
        merged.add(runId);
      }
      return Array.from(merged);
    });
  };

  const clearRunStream = () => {
    stopActiveRunStream();
  };

  const finishClosedRunStream = (sessionId: string) => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    setActiveRunIds([]);
    setTrackedRunIds([]);
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "messages"],
    });
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    refreshRecoverySnapshot(sessionId);
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "token-usage"],
    });
  };

  const openTrackedRunStream = (
    options: StartRunStreamsOptions,
    streamGeneration: number,
  ) => {
    const runs = resolveReplayTargets(options.runs, runtimeStateRef.current);
    const callbacks: RunStreamCallbacks = {
      initialState: runtimeStateRef.current,
      onActivity: () => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        clearReconnectTimer();
        reconnectAttemptRef.current = 0;
      },
      onState: (nextRuntimeState) => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        clearReconnectTimer();
        reconnectAttemptRef.current = 0;
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
        setActiveRunIds(
          activeTrackedRunIds(options.foregroundRunIds ?? [], nextRuntimeState),
        );
      },
      onClosed: () => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        finishClosedRunStream(options.sessionId);
      },
      onError: (errorMessage, errorKind) => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        if (errorKind === "transport") {
          if (trackedRunTargetsClosed(options.runs, runtimeStateRef.current)) {
            finishClosedRunStream(options.sessionId);
            return;
          }
          refreshRecoverySnapshot(options.sessionId);
          scheduleRunStreamReconnect(options, streamGeneration, errorMessage);
          return;
        }
        suppressRunTargets(options.runs);
        refreshRecoverySnapshot(options.sessionId);
        stopActiveRunStream();
        void message.error(errorMessage);
      },
    };
    streamHandleRef.current =
      runs.length === 1
        ? openRunStream({
            ...callbacks,
            afterEventId: runs[0].afterEventId,
            runId: runs[0].runId,
          })
        : openMultiplexedRunStream({
            ...callbacks,
            runs,
          });
  };

  const scheduleRunStreamReconnect = (
    options: StartRunStreamsOptions,
    streamGeneration: number,
    errorMessage: string,
  ) => {
    if (reconnectAttemptRef.current >= RUN_STREAM_RECONNECT_MAX_ATTEMPTS) {
      suppressRunTargets(options.runs);
      stopActiveRunStream();
      void message.error(errorMessage);
      return;
    }
    if (reconnectTimerRef.current !== null) {
      return;
    }
    const nextAttempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = nextAttempt;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (streamGeneration !== streamGenerationRef.current) {
        return;
      }
      streamHandleRef.current?.close();
      streamHandleRef.current = null;
      openTrackedRunStream(options, streamGeneration);
    }, RUN_STREAM_MANUAL_RECONNECT_GRACE_MS * nextAttempt);
  };

  const startRunStream = (options: StartRunStreamOptions) => {
    startRunStreams({
      sessionId: options.sessionId,
      runs: [
        {
          afterEventId: options.afterEventId,
          runId: options.runId,
        },
      ],
      foregroundRunIds: options.foreground === false ? [] : [options.runId],
    });
  };

  const startRunStreams = (options: StartRunStreamsOptions) => {
    const runs = normalizeRunTargets(options.runs);
    const foregroundRunIds = normalizeForegroundRunIds(options.foregroundRunIds, runs);
    streamGenerationRef.current += 1;
    const streamGeneration = streamGenerationRef.current;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    clearSuppressedRunTargets(runs);
    setActiveRunIds(foregroundRunIds);
    setTrackedRunIds(runs.map((run) => run.runId));
    startContinuityRefresh(options.sessionId);
    openTrackedRunStream(
      {
        foregroundRunIds,
        sessionId: options.sessionId,
        runs,
      },
      streamGeneration,
    );
  };

  return {
    activeRunId,
    activeRunIds,
    clearRunStream,
    startRunStream,
    startRunStreams,
    suppressedRunIds,
    trackedRunIds,
  };
}

function normalizeRunTargets(runs: StartRunStreamTarget[]): StartRunStreamTarget[] {
  const normalizedRuns = runs.map((run) => ({
    afterEventId:
      typeof run.afterEventId === "number" ? Math.max(0, run.afterEventId) : undefined,
    runId: run.runId.trim(),
  }));
  if (normalizedRuns.length === 0) {
    throw new Error("At least one run stream target is required.");
  }
  if (normalizedRuns.some((run) => run.runId.length === 0)) {
    throw new Error("Run stream target runId cannot be blank.");
  }
  const targetsByRunId = new Map<string, StartRunStreamTarget>();
  for (const run of normalizedRuns) {
    const existing = targetsByRunId.get(run.runId);
    targetsByRunId.set(run.runId, {
      afterEventId: Math.max(existing?.afterEventId ?? 0, run.afterEventId ?? 0),
      runId: run.runId,
    });
  }
  return Array.from(targetsByRunId.values());
}

function normalizedRunIds(runs: StartRunStreamTarget[]): string[] {
  return normalizeRunTargets(runs).map((run) => run.runId);
}

function normalizeForegroundRunIds(
  foregroundRunIds: string[] | undefined,
  runs: StartRunStreamTarget[],
): string[] {
  const runIds = new Set(normalizedRunIds(runs));
  if (foregroundRunIds === undefined) {
    return Array.from(runIds);
  }
  const foregroundIds: string[] = [];
  for (const runId of foregroundRunIds) {
    const normalizedRunId = runId.trim();
    if (!runIds.has(normalizedRunId) || foregroundIds.includes(normalizedRunId)) {
      continue;
    }
    foregroundIds.push(normalizedRunId);
  }
  return foregroundIds;
}

function resolveReplayTargets(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): RunStreamTarget[] {
  return normalizeRunTargets(runs).map((run) => ({
    afterEventId: Math.max(
      runtimeState.runs[run.runId]?.lastEventId ?? 0,
      run.afterEventId ?? 0,
    ),
    runId: run.runId,
  }));
}

function trackedRunTargetsClosed(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): boolean {
  return normalizeRunTargets(runs).every(
    (run) => runtimeState.runs[run.runId]?.status === "closed",
  );
}

function activeTrackedRunIds(runIds: string[], runtimeState: RuntimeState): string[] {
  return runIds.filter((runId) => runtimeState.runs[runId]?.status !== "closed");
}
