import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listSidebarSessions } from "../api/client";
import type { JsonValue, SessionSidebarRecord } from "../api/contracts";
import {
  openMultiplexedRunStream,
  openRunStream,
  type RunStreamErrorKind,
  type RunStreamHandle,
  type RunStreamTarget,
} from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";
import type { RuntimeRunState, RuntimeState, TimelineEntry } from "./reducers";

const RUN_STREAM_MANUAL_RECONNECT_GRACE_MS = 3500;
const RUN_STREAM_RECONNECT_MAX_ATTEMPTS = 3;
const TERMINAL_SETTLEMENT_GUARD_LIMIT = 4096;

export interface StartRunStreamOptions {
  runId: string;
  sessionId: string;
  afterEventId?: number;
  createdAt?: string;
  foreground?: boolean;
  promptText?: string;
  targetRoleId?: string;
}

export interface StartRunStreamTarget {
  runId: string;
  afterEventId?: number;
  createdAt?: string;
  promptText?: string;
  targetRoleId?: string;
}

export interface StartRunStreamsOptions {
  sessionId: string;
  runs: StartRunStreamTarget[];
  foregroundRunIds?: string[];
}

export interface RunStreamController {
  activeRunId: string | null;
  activeRunIds: string[];
  clearRunStream: (options?: ClearRunStreamOptions) => void;
  setForegroundSessionId: (sessionId: string | null) => void;
  settleTerminalRunStream: (options: SettleTerminalRunStreamOptions) => void;
  startRunStream: (options: StartRunStreamOptions) => void;
  startRunStreams: (options: StartRunStreamsOptions) => void;
  suppressedRunIds: string[];
  trackedRunIds: string[];
  trackedSessionId?: string | null;
}

export interface ClearRunStreamOptions {
  suppressRunIds?: string[];
}

export interface SettleTerminalRunStreamOptions {
  runIds: string[];
  sessionId: string;
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
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const runtimeStateRef = useRef(useRuntimeStore.getState().runtimeState);
  const streamHandleRef = useRef<RunStreamHandle | null>(null);
  const terminalBackgroundTimersRef = useRef(new Set<number>());
  const foregroundRunIdsRef = useRef<string[]>([]);
  const foregroundSessionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamGenerationRef = useRef(0);
  const subagentDiscoveryEventKeysRef = useRef(new Set<string>());
  const recoveryInteractionEventKeysRef = useRef(new Set<string>());
  const terminalStoreMarkKeysRef = useRef(new Set<string>());
  const terminalSettlementKeysRef = useRef(new Map<string, number>());
  const terminalSettlementSequenceRef = useRef(0);
  const controllerOperationsRef = useRef<RunStreamControllerOperations | null>(null);
  const [activeRunIds, setActiveRunIds] = useState<string[]>([]);
  const [suppressedRunIds, setSuppressedRunIds] = useState<string[]>([]);
  const [trackedRunIds, setTrackedRunIds] = useState<string[]>([]);
  const [trackedSessionId, setTrackedSessionId] = useState<string | null>(null);
  const activeRunId = activeRunIds[0] ?? null;

  useEffect(
    () => useRuntimeStore.subscribe((state) => {
      runtimeStateRef.current = state.runtimeState;
    }),
    [],
  );

  useEffect(
    () => () => {
      clearReconnectTimer();
      for (const timerId of terminalBackgroundTimersRef.current) {
        window.clearTimeout(timerId);
      }
      terminalBackgroundTimersRef.current.clear();
      streamHandleRef.current?.close();
    },
    [],
  );

  const refreshRecoverySnapshot = (sessionId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "recovery"],
    });
  };

  const refreshSubagentDiscovery = (sessionId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "subagents"],
    });
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
  };

  const refreshForNewRuntimeEvents = (
    sessionId: string,
    nextRuntimeState: RuntimeState,
    previousRuntimeState: RuntimeState,
    changedRunIds: readonly string[],
  ) => {
    let hasNewSubagentDiscoveryEvent = false;
    let hasNewInteractionEvent = false;
    forEachChangedTimelineEntry(
      nextRuntimeState,
      previousRuntimeState,
      changedRunIds,
      (entry) => {
        if (isSubagentDiscoveryEvent(entry)) {
          const eventKey = subagentDiscoveryEventKey(entry);
          if (!subagentDiscoveryEventKeysRef.current.has(eventKey)) {
            subagentDiscoveryEventKeysRef.current.add(eventKey);
            hasNewSubagentDiscoveryEvent = true;
          }
        }
        if (
          entry.kind !== "user_question_requested" &&
          entry.kind !== "user_question_answered"
        ) {
          return;
        }
        const eventKey = `${entry.runId}:${entry.id}`;
        if (!recoveryInteractionEventKeysRef.current.has(eventKey)) {
          recoveryInteractionEventKeysRef.current.add(eventKey);
          hasNewInteractionEvent = true;
        }
      },
    );
    if (hasNewSubagentDiscoveryEvent) {
      refreshSubagentDiscovery(sessionId);
    }
    if (hasNewInteractionEvent) {
      refreshRecoverySnapshot(sessionId);
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const setActiveRunIdsIfChanged = (nextRunIds: string[]) => {
    setActiveRunIds((currentRunIds) =>
      stringArraysEqual(currentRunIds, nextRunIds) ? currentRunIds : nextRunIds,
    );
  };

  const scheduleTerminalBackgroundWork = (work: () => void) => {
    const timerId = window.setTimeout(() => {
      terminalBackgroundTimersRef.current.delete(timerId);
      work();
    }, 0);
    terminalBackgroundTimersRef.current.add(timerId);
  };

  const stopActiveRunStream = () => {
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    streamGenerationRef.current += 1;
    foregroundRunIdsRef.current = [];
    setActiveRunIdsIfChanged([]);
    setTrackedRunIds([]);
    setTrackedSessionId(null);
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

  const clearRunStream = (options?: ClearRunStreamOptions) => {
    const suppressRunIds = options?.suppressRunIds ?? [];
    if (suppressRunIds.length > 0) {
      suppressRunTargets(
        suppressRunIds.map((runId) => ({
          runId,
        })),
      );
    }
    stopActiveRunStream();
  };

  const settleTerminalRunStream = (options: SettleTerminalRunStreamOptions) => {
    const runs = Array.from(
      new Set(
        options.runIds
          .map((runId) => runId.trim())
          .filter((runId) => runId.length > 0),
      ),
    ).map((runId) => ({ runId }));
    if (runs.length === 0) {
      return;
    }
    finishClosedRunStream(options.sessionId, runs);
  };

  const setForegroundSessionId = (sessionId: string | null) => {
    foregroundSessionIdRef.current = sessionId;
    setActiveRunIdsIfChanged(
      activeTrackedRunIdsForSession(
        foregroundRunIdsRef.current,
        runtimeStateRef.current,
        foregroundSessionIdRef.current,
      ),
    );
  };

  const finishClosedRunStream = (
    sessionId: string,
    terminalTargets: StartRunStreamTarget[],
  ) => {
    const unsettledTargets = normalizeRunTargets(terminalTargets).filter((target) => {
      const key = `${sessionId}:${target.runId}`;
      if (terminalSettlementKeysRef.current.has(key)) {
        return false;
      }
      rememberTerminalSettlementKey(
        terminalSettlementKeysRef.current,
        key,
        terminalSettlementSequenceRef.current,
      );
      terminalSettlementSequenceRef.current += 1;
      return true;
    });
    if (unsettledTargets.length === 0) {
      return;
    }
    const streamGeneration = streamGenerationRef.current;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    streamHandleRef.current?.close();
    streamHandleRef.current = null;

    const closedRuntimeState = runtimeStateWithClosedTargets(
      runtimeStateRef.current,
      unsettledTargets,
    );
    if (closedRuntimeState !== runtimeStateRef.current) {
      runtimeStateRef.current = closedRuntimeState;
      setRuntimeState(closedRuntimeState);
    }
    const terminalRunIds = new Set(normalizedRunIds(unsettledTargets));
    const remainingRunTargets = trackedRunIds
      .filter(
        (runId) =>
          !terminalRunIds.has(runId) &&
          closedRuntimeState.runs[runId]?.status !== "closed" &&
          closedRuntimeState.runs[runId]?.status !== "failed",
      )
      .map((runId) => ({
        afterEventId: closedRuntimeState.runs[runId]?.lastEventId ?? 0,
        runId,
      }));
    foregroundRunIdsRef.current = foregroundRunIdsRef.current.filter(
      (runId) => !terminalRunIds.has(runId),
    );
    suppressRunTargets(unsettledTargets);
    setActiveRunIdsIfChanged(
      activeTrackedRunIdsForSession(
        foregroundRunIdsRef.current,
        closedRuntimeState,
        foregroundSessionIdRef.current,
      ),
    );
    setTrackedRunIds(remainingRunTargets.map((target) => target.runId));
    if (remainingRunTargets.length > 0) {
      openTrackedRunStream(
        {
          foregroundRunIds: foregroundRunIdsRef.current,
          runs: remainingRunTargets,
          sessionId,
        },
        streamGeneration,
      );
    }
    scheduleTerminalBackgroundWork(() => {
      const refreshHydratedSession = () => {
        void queryClient.invalidateQueries({
          queryKey: ["sessions", "detail", sessionId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["sessions", sessionId, "messages"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["sessions", sessionId, "rounds"],
        });
      };
      // The terminal stream event is authoritative for the local timeline. Refresh
      // each hydrated view once, then let the session-activity stream deliver any
      // later persistence convergence instead of polling round history.
      refreshHydratedSession();
      void Promise.resolve(listSidebarSessions(true)).then((sessions) => {
        if (streamGenerationRef.current !== streamGeneration) {
          return;
        }
        queryClient.setQueryData(
          ["sessions", "sidebar"],
          sidebarSessionsWithLocalTerminalRuns(
            sessions,
            sessionId,
            unsettledTargets,
            closedRuntimeState,
          ),
        );
      }).catch(() => {
        // The session activity stream will deliver a later authoritative refresh.
      });
      refreshRecoverySnapshot(sessionId);
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "token-usage"],
      });
    });
  };

  const openTrackedRunStream = (
    options: StartRunStreamsOptions,
    streamGeneration: number,
    replayMode: "all" | "active" = "all",
  ) => {
    const runs =
      replayMode === "active"
        ? resolveActiveReplayTargets(options.runs, runtimeStateRef.current)
        : resolveReplayTargets(options.runs, runtimeStateRef.current);
    if (runs.length === 0) {
      finishClosedRunStream(options.sessionId, options.runs);
      return;
    }
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
        const previousRuntimeState = runtimeStateRef.current;
        runtimeStateRef.current = nextRuntimeState;
        const changedRunIds = changedRuntimeRunIds(
          nextRuntimeState,
          options.runs,
        );
        markNewRuntimeTerminals(
          nextRuntimeState,
          changedRunIds,
          terminalStoreMarkKeysRef.current,
          "on-state",
        );
        setRuntimeState(nextRuntimeState);
        markNewRuntimeTerminals(
          nextRuntimeState,
          changedRunIds,
          terminalStoreMarkKeysRef.current,
          "store",
          true,
        );
        setActiveRunIdsIfChanged(
          activeTrackedRunIdsForSession(
            foregroundRunIdsRef.current,
            nextRuntimeState,
            foregroundSessionIdRef.current,
          ),
        );
        refreshForNewRuntimeEvents(
          options.sessionId,
          nextRuntimeState,
          previousRuntimeState,
          changedRunIds,
        );
      },
      onClosed: () => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        if (trackedRunTargetsShouldReconnectAfterClose(options.runs, runtimeStateRef.current)) {
          refreshRecoverySnapshot(options.sessionId);
          scheduleRunStreamReconnect(
            options,
            streamGeneration,
            "Run stream closed before terminal state.",
          );
          return;
        }
        finishClosedRunStream(options.sessionId, options.runs);
      },
      onError: (errorMessage, errorKind) => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        if (errorKind === "transport") {
          if (trackedRunTargetsClosed(options.runs, runtimeStateRef.current)) {
            finishClosedRunStream(options.sessionId, options.runs);
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
    for (const run of runs) {
      markRunStartTiming("controller-before-event-source", run.runId);
    }
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
      openTrackedRunStream(options, streamGeneration, "active");
    }, RUN_STREAM_MANUAL_RECONNECT_GRACE_MS * nextAttempt);
  };

  const startRunStream = (options: StartRunStreamOptions) => {
    markRunStartTiming("controller-start", options.runId);
    startRunStreams({
      sessionId: options.sessionId,
      runs: [startRunStreamTargetFromOptions(options)],
      foregroundRunIds: options.foreground === false ? [] : [options.runId],
    });
  };

  const startRunStreams = (options: StartRunStreamsOptions) => {
    for (const run of options.runs) {
      markRunStartTiming("controller-start-streams", run.runId);
    }
    const runs = normalizeRunTargets(options.runs);
    const foregroundRunIds = normalizeForegroundRunIds(options.foregroundRunIds, runs);
    foregroundRunIdsRef.current = foregroundRunIds;
    foregroundSessionIdRef.current = options.sessionId;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    streamGenerationRef.current += 1;
    const streamGeneration = streamGenerationRef.current;
    clearSuppressedRunTargets(runs);
    const nextRuntimeState = runtimeStatePreparedForReplayTargets(
      runtimeStateWithStartedTargets(
        runtimeStateRef.current,
        options.sessionId,
        runs,
      ),
      runs,
    );
    if (nextRuntimeState !== runtimeStateRef.current) {
      runtimeStateRef.current = nextRuntimeState;
      setRuntimeState(nextRuntimeState);
    }
    setActiveRunIdsIfChanged(
      activeTrackedRunIdsForSession(
        foregroundRunIds,
        nextRuntimeState,
        foregroundSessionIdRef.current,
      ),
    );
    setTrackedRunIds(runs.map((run) => run.runId));
    setTrackedSessionId(options.sessionId);
    openTrackedRunStream(
      {
        foregroundRunIds,
        sessionId: options.sessionId,
        runs,
      },
      streamGeneration,
    );
  };

  controllerOperationsRef.current = {
    clearRunStream,
    setForegroundSessionId,
    settleTerminalRunStream,
    startRunStream,
    startRunStreams,
  };
  const stableClearRunStream = useCallback((options?: ClearRunStreamOptions) => {
    controllerOperationsRef.current?.clearRunStream(options);
  }, []);
  const stableSetForegroundSessionId = useCallback((sessionId: string | null) => {
    controllerOperationsRef.current?.setForegroundSessionId(sessionId);
  }, []);
  const stableSettleTerminalRunStream = useCallback(
    (options: SettleTerminalRunStreamOptions) => {
      controllerOperationsRef.current?.settleTerminalRunStream(options);
    },
    [],
  );
  const stableStartRunStream = useCallback((options: StartRunStreamOptions) => {
    controllerOperationsRef.current?.startRunStream(options);
  }, []);
  const stableStartRunStreams = useCallback((options: StartRunStreamsOptions) => {
    controllerOperationsRef.current?.startRunStreams(options);
  }, []);

  return useMemo(() => ({
    activeRunId,
    activeRunIds,
    clearRunStream: stableClearRunStream,
    setForegroundSessionId: stableSetForegroundSessionId,
    settleTerminalRunStream: stableSettleTerminalRunStream,
    startRunStream: stableStartRunStream,
    startRunStreams: stableStartRunStreams,
    suppressedRunIds,
    trackedRunIds,
    trackedSessionId,
  }), [
    activeRunId,
    activeRunIds,
    stableClearRunStream,
    stableSetForegroundSessionId,
    stableSettleTerminalRunStream,
    stableStartRunStream,
    stableStartRunStreams,
    suppressedRunIds,
    trackedRunIds,
    trackedSessionId,
  ]);
}

function markNewRuntimeTerminals(
  runtimeState: RuntimeState,
  runIds: readonly string[],
  markedKeys: Set<string>,
  phase: "on-state" | "store",
  allowExisting = false,
): void {
  for (const runId of runIds) {
    const runState = runtimeState.runs[runId];
    if (runState === undefined) {
      continue;
    }
    const eventType = runState.terminalEventType?.trim() ?? "";
    if (eventType.length === 0) {
      continue;
    }
    const terminalKey = `${runState.runId}:${eventType}`;
    const phaseKey = `${phase}:${terminalKey}`;
    if (markedKeys.has(phaseKey)) {
      continue;
    }
    if (!allowExisting && markedKeys.has(`store:${terminalKey}`)) {
      continue;
    }
    markedKeys.add(phaseKey);
    try {
      globalThis.performance?.mark(
        `agent-teams:terminal:${phase}:${runState.runId}:${eventType}`,
      );
    } catch {
      // Performance instrumentation must never affect runtime state delivery.
    }
  }
}

function markRunStartTiming(phase: string, runId: string): void {
  try {
    globalThis.performance?.mark(`agent-teams:run-start:${phase}:${runId}`);
  } catch {
    // Performance instrumentation must never affect stream startup.
  }
}

type RunStreamControllerOperations = Pick<
  RunStreamController,
  | "clearRunStream"
  | "setForegroundSessionId"
  | "settleTerminalRunStream"
  | "startRunStream"
  | "startRunStreams"
>;

function normalizeRunTargets(runs: StartRunStreamTarget[]): StartRunStreamTarget[] {
  const normalizedRuns = runs.map(normalizeRunTarget);
  if (normalizedRuns.length === 0) {
    throw new Error("At least one run stream target is required.");
  }
  if (normalizedRuns.some((run) => run.runId.length === 0)) {
    throw new Error("Run stream target runId cannot be blank.");
  }
  const targetsByRunId = new Map<string, StartRunStreamTarget>();
  for (const run of normalizedRuns) {
    const existing = targetsByRunId.get(run.runId);
    targetsByRunId.set(run.runId, mergedRunTarget(existing, run));
  }
  return Array.from(targetsByRunId.values());
}

function startRunStreamTargetFromOptions(
  options: StartRunStreamOptions,
): StartRunStreamTarget {
  return normalizeRunTarget(options);
}

function normalizeRunTarget(run: StartRunStreamTarget): StartRunStreamTarget {
  const afterEventId =
    typeof run.afterEventId === "number" ? Math.max(0, run.afterEventId) : undefined;
  const createdAt = normalizedOptionalString(run.createdAt);
  const promptText = normalizedOptionalString(run.promptText);
  const targetRoleId = normalizedOptionalString(run.targetRoleId);
  return {
    ...(afterEventId !== undefined ? { afterEventId } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(promptText !== undefined ? { promptText } : {}),
    runId: run.runId.trim(),
    ...(targetRoleId !== undefined ? { targetRoleId } : {}),
  };
}

function mergedRunTarget(
  existing: StartRunStreamTarget | undefined,
  next: StartRunStreamTarget,
): StartRunStreamTarget {
  const afterEventId = Math.max(existing?.afterEventId ?? 0, next.afterEventId ?? 0);
  const createdAt = existing?.createdAt ?? next.createdAt;
  const promptText = existing?.promptText ?? next.promptText;
  const targetRoleId = existing?.targetRoleId ?? next.targetRoleId;
  return {
    ...(afterEventId > 0 ? { afterEventId } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(promptText !== undefined ? { promptText } : {}),
    runId: next.runId,
    ...(targetRoleId !== undefined ? { targetRoleId } : {}),
  };
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

function runtimeStateWithStartedTargets(
  runtimeState: RuntimeState,
  sessionId: string,
  runs: StartRunStreamTarget[],
): RuntimeState {
  let nextRuns: Record<string, RuntimeRunState> | null = null;
  for (const run of runs) {
    const currentRun = (nextRuns ?? runtimeState.runs)[run.runId];
    const nextRun = runtimeRunStateWithStartedTarget(currentRun, sessionId, run);
    if (nextRun === currentRun) {
      continue;
    }
    nextRuns ??= { ...runtimeState.runs };
    nextRuns[run.runId] = nextRun;
  }
  return nextRuns === null
    ? runtimeState
    : {
        ...runtimeState,
        changedRunIds: runs.map((run) => run.runId),
        runs: nextRuns,
      };
}

function runtimeRunStateWithStartedTarget(
  currentRun: RuntimeRunState | undefined,
  sessionId: string,
  target: StartRunStreamTarget,
): RuntimeRunState {
  const existingRun = currentRun ?? {
    entries: [],
    lastEventId: 0,
    runId: target.runId,
    seenEventKeys: [],
    status: "connecting",
    terminalEventType: null,
  } satisfies RuntimeRunState;
  const metadata = runtimeTargetMetadata(existingRun, sessionId, target);
  const status =
    existingRun.status === "closed" || existingRun.status === "failed"
      ? existingRun.status
      : "connecting";
  if (Object.keys(metadata).length === 0 && status === existingRun.status) {
    return existingRun;
  }
  return {
    ...existingRun,
    ...metadata,
    status,
  };
}

function runtimeStateWithClosedTargets(
  runtimeState: RuntimeState,
  runs: StartRunStreamTarget[],
): RuntimeState {
  const targetRunIds = new Set(normalizedRunIds(runs));
  if (targetRunIds.size === 0) {
    return runtimeState;
  }
  let nextRuns: Record<string, RuntimeRunState> | null = null;
  for (const runId of targetRunIds) {
    const currentRun = (nextRuns ?? runtimeState.runs)[runId];
    if (
      currentRun === undefined ||
      currentRun.status === "closed" ||
      currentRun.status === "failed"
    ) {
      continue;
    }
    nextRuns ??= { ...runtimeState.runs };
    nextRuns[runId] = {
      ...currentRun,
      status: "closed",
    };
  }
  const nextActiveRunIds = runtimeState.activeRunIds.filter(
    (runId) => !targetRunIds.has(runId),
  );
  if (
    nextRuns === null &&
    nextActiveRunIds.length === runtimeState.activeRunIds.length
  ) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    activeRunIds: nextActiveRunIds,
    ...(nextRuns !== null ? { changedRunIds: Array.from(targetRunIds) } : {}),
    ...(nextRuns !== null ? { runs: nextRuns } : {}),
  };
}

function runtimeTargetMetadata(
  currentRun: RuntimeRunState,
  sessionId: string,
  target: StartRunStreamTarget,
): Partial<RuntimeRunState> {
  const metadata: Partial<RuntimeRunState> = {};
  if (currentRun.sessionId === undefined && sessionId.trim().length > 0) {
    metadata.sessionId = sessionId;
  }
  if (currentRun.promptText === undefined && target.promptText !== undefined) {
    metadata.promptText = target.promptText;
  }
  if (currentRun.createdAt === undefined && target.createdAt !== undefined) {
    metadata.createdAt = target.createdAt;
  }
  if (currentRun.targetRoleId === undefined && target.targetRoleId !== undefined) {
    metadata.targetRoleId = target.targetRoleId;
  }
  return metadata;
}

function normalizedRunIds(runs: StartRunStreamTarget[]): string[] {
  return normalizeRunTargets(runs).map((run) => run.runId);
}

function isSubagentDiscoveryEvent(entry: TimelineEntry): boolean {
  return (
    entry.kind === "subagent_session_status_changed" ||
    entry.kind === "subagent_stopped" ||
    entry.kind === "subagent_resumed" ||
    isSubagentBackgroundTaskEvent(entry)
  );
}

function isSubagentBackgroundTaskEvent(entry: TimelineEntry): boolean {
  if (
    entry.kind !== "background_task_started" &&
    entry.kind !== "background_task_updated" &&
    entry.kind !== "background_task_completed" &&
    entry.kind !== "background_task_stopped"
  ) {
    return false;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null) {
    return false;
  }
  return (
    jsonString(payload.kind) === "subagent" ||
    jsonString(payload.subagent_run_id) !== null ||
    jsonString(payload.subagent_instance_id) !== null
  );
}

function subagentDiscoveryEventKey(entry: TimelineEntry): string {
  const payload = jsonObject(entry.payload);
  return [
    entry.runId,
    entry.kind,
    entry.instanceId ?? "",
    payload === null ? "" : jsonString(payload.background_task_id),
    payload === null ? "" : jsonString(payload.task_id),
    payload === null ? "" : jsonString(payload.instance_id),
    payload === null ? "" : jsonString(payload.subagent_instance_id),
    payload === null ? "" : jsonString(payload.subagent_run_id),
    payload === null ? "" : jsonString(payload.run_status),
    payload === null ? "" : jsonString(payload.status),
    payload === null ? "" : jsonString(payload.run_phase),
  ].join(":");
}

function forEachChangedTimelineEntry(
  nextRuntimeState: RuntimeState,
  previousRuntimeState: RuntimeState,
  changedRunIds: readonly string[],
  visit: (entry: TimelineEntry) => void,
): void {
  for (const runId of changedRunIds) {
    const run = nextRuntimeState.runs[runId];
    if (run === undefined) {
      continue;
    }
    const previousRun = previousRuntimeState.runs[runId];
    if (run === previousRun || run.entries === previousRun?.entries) {
      continue;
    }
    const previousEntries = previousRun?.entries ?? [];
    const commonLength = Math.min(previousEntries.length, run.entries.length);
    let firstChangedIndex = 0;
    while (
      firstChangedIndex < commonLength &&
      previousEntries[firstChangedIndex] === run.entries[firstChangedIndex]
    ) {
      firstChangedIndex += 1;
    }
    for (let index = firstChangedIndex; index < run.entries.length; index += 1) {
      const entry = run.entries[index];
      if (entry !== undefined) {
        visit(entry);
      }
    }
  }
}

function changedRuntimeRunIds(
  runtimeState: RuntimeState,
  fallbackTargets: readonly StartRunStreamTarget[],
): string[] {
  if (runtimeState.changedRunIds !== undefined) {
    return runtimeState.changedRunIds;
  }
  return Array.from(
    new Set(
      fallbackTargets
        .map((target) => target.runId.trim())
        .filter((runId) => runId.length > 0),
    ),
  );
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
    afterEventId: replayCursorWithLocalCoverage(
      runtimeState.runs[run.runId],
      run.afterEventId ?? 0,
    ),
    runId: run.runId,
  }));
}

function resolveActiveReplayTargets(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): RunStreamTarget[] {
  return normalizeRunTargets(runs)
    .filter((run) => runtimeState.runs[run.runId]?.status !== "closed")
    .map((run) => ({
      afterEventId: replayCursorWithLocalCoverage(
        runtimeState.runs[run.runId],
        run.afterEventId ?? 0,
      ),
      runId: run.runId,
    }));
}

function replayCursorWithLocalCoverage(
  runState: RuntimeRunState | undefined,
  requestedCursor: number,
): number {
  const localHighWatermark = continuousSeenEventHighWatermark(runState);
  if (
    localHighWatermark < (runState?.lastEventId ?? 0) ||
    requestedCursor > localHighWatermark
  ) {
    return 0;
  }
  return localHighWatermark;
}

function continuousSeenEventHighWatermark(
  runState: RuntimeRunState | undefined,
): number {
  const ranges = runState?.seenEventIdRanges ?? [];
  let highWatermark = 0;
  for (const range of ranges) {
    if (range[0] > highWatermark + 1) {
      break;
    }
    highWatermark = Math.max(highWatermark, range[1]);
  }
  return highWatermark;
}

function runtimeStatePreparedForReplayTargets(
  runtimeState: RuntimeState,
  runs: StartRunStreamTarget[],
): RuntimeState {
  let nextRuns: Record<string, RuntimeRunState> | null = null;
  for (const run of runs) {
    const currentRun = (nextRuns ?? runtimeState.runs)[run.runId];
    if (
      currentRun === undefined ||
      currentRun.replayAfterEventId === undefined ||
      replayCursorWithLocalCoverage(currentRun, run.afterEventId ?? 0) > 0
    ) {
      continue;
    }
    const { replayAfterEventId: _discardedReplayCursor, ...nextRun } = currentRun;
    nextRuns ??= { ...runtimeState.runs };
    nextRuns[run.runId] = nextRun;
  }
  return nextRuns === null
    ? runtimeState
    : {
        ...runtimeState,
        changedRunIds: runs.map((run) => run.runId),
        runs: nextRuns,
      };
}

function trackedRunTargetsClosed(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): boolean {
  return normalizeRunTargets(runs).every(
    (run) => runtimeState.runs[run.runId]?.status === "closed",
  );
}

function trackedRunTargetsShouldReconnectAfterClose(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): boolean {
  return normalizeRunTargets(runs).some((run) => {
    const runState = runtimeState.runs[run.runId];
    if (runState?.status === "closed") {
      return false;
    }
    if ((run.afterEventId ?? 0) > 0) {
      return true;
    }
    if ((runState?.lastEventId ?? 0) > 0) {
      return true;
    }
    return runState?.status === "open";
  });
}

function activeTrackedRunIdsForSession(
  runIds: string[],
  runtimeState: RuntimeState,
  sessionId: string | null,
): string[] {
  const scopedSessionId = sessionId?.trim() ?? "";
  if (scopedSessionId.length === 0) {
    return [];
  }
  return runIds.filter((runId) => {
    const runState = runtimeState.runs[runId];
    const runSessionId = runState?.sessionId?.trim();
    return (
      runState !== undefined &&
      runState.status !== "closed" &&
      (runSessionId === undefined || runSessionId === scopedSessionId)
    );
  });
}

function rememberTerminalSettlementKey(
  keys: Map<string, number>,
  key: string,
  sequence: number,
): void {
  if (keys.size >= TERMINAL_SETTLEMENT_GUARD_LIMIT) {
    const oldestKey = keys.keys().next().value;
    if (oldestKey !== undefined) {
      keys.delete(oldestKey);
    }
  }
  keys.set(key, sequence);
}

function sidebarSessionsWithLocalTerminalRuns(
  sessions: SessionSidebarRecord[],
  sessionId: string,
  targets: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): SessionSidebarRecord[] {
  const latestTarget = targets.at(-1);
  if (latestTarget === undefined) {
    return sessions;
  }
  const runState = runtimeState.runs[latestTarget.runId];
  const status = localTerminalStatus(runState?.terminalEventType ?? null);
  if (status === null) {
    return sessions;
  }
  return sessions.map((session) => session.session_id === sessionId
    ? {
        ...session,
        active_run_id: null,
        active_run_status: status,
        has_unread_terminal_run: true,
        latest_terminal_run_id: latestTarget.runId,
        latest_terminal_run_status: status,
      }
    : session);
}

function localTerminalStatus(
  eventType: string | null,
): NonNullable<SessionSidebarRecord["active_run_status"]> | null {
  switch (eventType) {
    case "run_completed":
      return "completed";
    case "run_failed":
      return "failed";
    case "run_paused":
      return "paused";
    case "run_stopped":
      return "stopped";
    default:
      return null;
  }
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function jsonString(value: JsonValue | undefined | null): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
