import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { listSessionRounds, listSidebarSessions } from "../api/client";
import type { JsonValue, SessionRound, SessionSidebarRecord } from "../api/contracts";
import {
  openMultiplexedRunStream,
  openRunStream,
  type RunStreamErrorKind,
  type RunStreamHandle,
  type RunStreamTarget,
} from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";
import type { RuntimeRunState, RuntimeState, TimelineEntry } from "./reducers";

const RECOVERY_CONTINUITY_REFRESH_MS = 10000;
const RUN_STREAM_MANUAL_RECONNECT_GRACE_MS = 3500;
const RUN_STREAM_RECONNECT_MAX_ATTEMPTS = 3;
const TERMINAL_ROUND_SETTLE_DELAY_MS = 900;
const TERMINAL_ROUND_SETTLE_MAX_ATTEMPTS = 24;
const TERMINAL_ROUND_SETTLE_PAGE_LIMIT = 100;
const TERMINAL_SESSION_SETTLE_DELAY_MS = 1500;
const TERMINAL_SESSION_SETTLE_MAX_ATTEMPTS = 60;

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
  startRunStream: (options: StartRunStreamOptions) => void;
  startRunStreams: (options: StartRunStreamsOptions) => void;
  suppressedRunIds: string[];
  trackedRunIds: string[];
}

export interface ClearRunStreamOptions {
  suppressRunIds?: string[];
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
  const foregroundRunIdsRef = useRef<string[]>([]);
  const foregroundSessionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamGenerationRef = useRef(0);
  const subagentDiscoveryEventKeysRef = useRef(new Set<string>());
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

  const refreshSubagentDiscovery = (sessionId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "subagents"],
    });
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
  };

  const refreshSidebarSessions = () => {
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    void queryClient.refetchQueries({
      queryKey: ["sessions", "sidebar"],
      type: "active",
    });
  };

  const refreshSubagentDiscoveryForNewEvents = (
    sessionId: string,
    nextRuntimeState: RuntimeState,
  ) => {
    let hasNewSubagentDiscoveryEvent = false;
    for (const run of Object.values(nextRuntimeState.runs)) {
      for (const entry of run.entries) {
        if (!isSubagentDiscoveryEvent(entry)) {
          continue;
        }
        const eventKey = subagentDiscoveryEventKey(entry);
        if (subagentDiscoveryEventKeysRef.current.has(eventKey)) {
          continue;
        }
        subagentDiscoveryEventKeysRef.current.add(eventKey);
        hasNewSubagentDiscoveryEvent = true;
      }
    }
    if (hasNewSubagentDiscoveryEvent) {
      refreshSubagentDiscovery(sessionId);
    }
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

  const setActiveRunIdsIfChanged = (nextRunIds: string[]) => {
    setActiveRunIds((currentRunIds) =>
      stringArraysEqual(currentRunIds, nextRunIds) ? currentRunIds : nextRunIds,
    );
  };

  const startContinuityRefresh = (sessionId: string) => {
    stopContinuityRefresh();
    refreshRecoverySnapshot(sessionId);
    continuityRefreshTimerRef.current = window.setInterval(() => {
      refreshRecoverySnapshot(sessionId);
      refreshSubagentDiscovery(sessionId);
    }, RECOVERY_CONTINUITY_REFRESH_MS);
  };

  const stopActiveRunStream = () => {
    streamGenerationRef.current += 1;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    foregroundRunIdsRef.current = [];
    setActiveRunIdsIfChanged([]);
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
    const roundSettleTargets = terminalRoundSettleTargets(
      terminalTargets,
      runtimeStateRef.current,
    );
    const closedRuntimeState = runtimeStateWithClosedTargets(
      runtimeStateRef.current,
      terminalTargets,
    );
    if (closedRuntimeState !== runtimeStateRef.current) {
      runtimeStateRef.current = closedRuntimeState;
      setRuntimeState(closedRuntimeState);
    }
    const streamGeneration = streamGenerationRef.current;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    suppressRunTargets(terminalTargets);
    foregroundRunIdsRef.current = [];
    setActiveRunIdsIfChanged([]);
    setTrackedRunIds([]);
    refreshSidebarSessions();
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
      refreshSidebarSessions();
      void queryClient.refetchQueries({
        queryKey: ["sessions", "detail", sessionId],
        type: "active",
      });
      void queryClient.refetchQueries({
        queryKey: ["sessions", sessionId, "messages"],
        type: "active",
      });
      void queryClient.refetchQueries({
        queryKey: ["sessions", sessionId, "rounds"],
        type: "active",
      });
      void queryClient.refetchQueries({
        queryKey: ["sessions", "sidebar"],
        type: "active",
      });
    };
    const refreshSidebarSessionsFromServer = async () => {
      const sessions = await listSidebarSessions(true);
      queryClient.setQueryData(["sessions", "sidebar"], sessions);
      return sessions;
    };
    if (roundSettleTargets.length === 0) {
      refreshHydratedSession();
    } else {
      void settleTerminalRoundsFromHistory({
        currentStreamGeneration: () => streamGenerationRef.current,
        onReady: refreshHydratedSession,
        sessionId,
        streamGeneration,
        targets: roundSettleTargets,
      });
    }
    void settleTerminalSessionFromSidebar({
      currentStreamGeneration: () => streamGenerationRef.current,
      onReady: refreshHydratedSession,
      refreshSidebarSessions: refreshSidebarSessionsFromServer,
      sessionId,
      streamGeneration,
      targets: terminalTargets,
    });
    refreshRecoverySnapshot(sessionId);
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "token-usage"],
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
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
        setActiveRunIdsIfChanged(
          activeTrackedRunIdsForSession(
            foregroundRunIdsRef.current,
            nextRuntimeState,
            foregroundSessionIdRef.current,
          ),
        );
        refreshSubagentDiscoveryForNewEvents(options.sessionId, nextRuntimeState);
      },
      onClosed: () => {
        if (streamGeneration !== streamGenerationRef.current) {
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
    startRunStreams({
      sessionId: options.sessionId,
      runs: [startRunStreamTargetFromOptions(options)],
      foregroundRunIds: options.foreground === false ? [] : [options.runId],
    });
  };

  const startRunStreams = (options: StartRunStreamsOptions) => {
    const runs = normalizeRunTargets(options.runs);
    const foregroundRunIds = normalizeForegroundRunIds(options.foregroundRunIds, runs);
    foregroundRunIdsRef.current = foregroundRunIds;
    foregroundSessionIdRef.current = options.sessionId;
    streamGenerationRef.current += 1;
    const streamGeneration = streamGenerationRef.current;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    clearSuppressedRunTargets(runs);
    const nextRuntimeState = runtimeStateWithStartedTargets(
      runtimeStateRef.current,
      options.sessionId,
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
    setForegroundSessionId,
    startRunStream,
    startRunStreams,
    suppressedRunIds,
    trackedRunIds,
  };
}

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
  return [
    entry.runId,
    String(entry.eventId),
    entry.kind,
    entry.instanceId ?? "",
    entry.occurredAt,
  ].join(":");
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

function resolveActiveReplayTargets(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): RunStreamTarget[] {
  return normalizeRunTargets(runs)
    .filter((run) => runtimeState.runs[run.runId]?.status !== "closed")
    .map((run) => ({
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

function stringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

interface TerminalRoundSettleTarget {
  expectedToolCallIds: string[];
  runId: string;
}

interface TerminalRoundSettleOptions {
  currentStreamGeneration: () => number;
  onReady: () => void;
  sessionId: string;
  streamGeneration: number;
  targets: TerminalRoundSettleTarget[];
}

interface TerminalSessionSettleOptions {
  currentStreamGeneration: () => number;
  onReady: () => void;
  refreshSidebarSessions: () => Promise<SessionSidebarRecord[]>;
  sessionId: string;
  streamGeneration: number;
  targets: StartRunStreamTarget[];
}

function terminalRoundSettleTargets(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): TerminalRoundSettleTarget[] {
  return normalizeRunTargets(runs).map((run) => ({
    expectedToolCallIds: runtimeToolCallIds(runtimeState.runs[run.runId]),
    runId: run.runId,
  }));
}

async function settleTerminalRoundsFromHistory({
  currentStreamGeneration,
  onReady,
  sessionId,
  streamGeneration,
  targets,
}: TerminalRoundSettleOptions): Promise<void> {
  const isCurrentGeneration = () => currentStreamGeneration() === streamGeneration;
  for (let attempt = 0; attempt < TERMINAL_ROUND_SETTLE_MAX_ATTEMPTS; attempt += 1) {
    if (!isCurrentGeneration()) {
      return;
    }
    try {
      const page = await listSessionRounds(sessionId, {
        forceRefresh: true,
        limit: TERMINAL_ROUND_SETTLE_PAGE_LIMIT,
      });
      if (!isCurrentGeneration()) {
        return;
      }
      if (terminalRoundsHaveExpectedToolCalls(page.items, targets)) {
        onReady();
        return;
      }
    } catch {
      if (!isCurrentGeneration()) {
        return;
      }
    }
    if (attempt + 1 < TERMINAL_ROUND_SETTLE_MAX_ATTEMPTS) {
      await terminalRoundSettleDelay();
    }
  }
  if (isCurrentGeneration()) {
    onReady();
  }
}

async function settleTerminalSessionFromSidebar({
  currentStreamGeneration,
  onReady,
  refreshSidebarSessions,
  sessionId,
  streamGeneration,
  targets,
}: TerminalSessionSettleOptions): Promise<void> {
  const targetRunIds = normalizedRunIds(targets);
  if (targetRunIds.length === 0) {
    return;
  }
  const isCurrentGeneration = () => currentStreamGeneration() === streamGeneration;
  for (let attempt = 0; attempt < TERMINAL_SESSION_SETTLE_MAX_ATTEMPTS; attempt += 1) {
    if (!isCurrentGeneration()) {
      return;
    }
    try {
      const sessions = await refreshSidebarSessions();
      if (!isCurrentGeneration()) {
        return;
      }
      if (terminalSessionHasTargetRun(sessions, sessionId, targetRunIds)) {
        onReady();
        return;
      }
    } catch {
      if (!isCurrentGeneration()) {
        return;
      }
    }
    if (attempt + 1 < TERMINAL_SESSION_SETTLE_MAX_ATTEMPTS) {
      await terminalSessionSettleDelay();
    }
  }
}

function terminalSessionSettleDelay(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, TERMINAL_SESSION_SETTLE_DELAY_MS);
  });
}

function terminalSessionHasTargetRun(
  sessions: SessionSidebarRecord[],
  sessionId: string,
  targetRunIds: string[],
): boolean {
  const session = sessions.find((item) => item.session_id === sessionId);
  if (session === undefined) {
    return false;
  }
  const latestRunId = session.latest_terminal_run_id?.trim() ?? "";
  const latestStatus = session.latest_terminal_run_status?.trim().toLowerCase() ?? "";
  return targetRunIds.includes(latestRunId) && isTerminalStatus(latestStatus);
}

function terminalRoundSettleDelay(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, TERMINAL_ROUND_SETTLE_DELAY_MS);
  });
}

function terminalRoundsHaveExpectedToolCalls(
  rounds: SessionRound[],
  targets: TerminalRoundSettleTarget[],
): boolean {
  const roundsByRunId = new Map(rounds.map((round) => [round.run_id, round]));
  return targets.every((target) => {
    const round = roundsByRunId.get(target.runId);
    if (round === undefined) {
      return false;
    }
    if (!roundHasTerminalStatus(round)) {
      return false;
    }
    const toolCallIds = persistedRoundToolCallIds(round);
    return target.expectedToolCallIds.every((toolCallId) =>
      toolCallIds.has(toolCallId),
    );
  });
}

function roundHasTerminalStatus(round: SessionRound): boolean {
  return isTerminalStatus(round.run_status) || isTerminalStatus(round.run_phase);
}

function isTerminalStatus(value: string | null | undefined): boolean {
  switch ((value ?? "").trim().toLowerCase()) {
    case "completed":
    case "failed":
    case "stopped":
    case "paused":
    case "cancelled":
    case "canceled":
      return true;
    default:
      return false;
  }
}

function runtimeToolCallIds(runState: RuntimeRunState | undefined): string[] {
  if (runState === undefined) {
    return [];
  }
  const toolCallIds: string[] = [];
  for (const entry of runState.entries) {
    if (entry.kind !== "tool_call") {
      continue;
    }
    const toolCallId = timelineEntryToolCallId(entry);
    if (toolCallId !== null && !toolCallIds.includes(toolCallId)) {
      toolCallIds.push(toolCallId);
    }
  }
  return toolCallIds;
}

function timelineEntryToolCallId(entry: TimelineEntry): string | null {
  const payload = jsonObject(entry.payload);
  if (payload === null) {
    return null;
  }
  return jsonString(payload.tool_call_id);
}

function persistedRoundToolCallIds(round: SessionRound | undefined): ReadonlySet<string> {
  const toolCallIds = new Set<string>();
  if (round === undefined) {
    return toolCallIds;
  }
  for (const message of round.coordinator_messages ?? []) {
    for (const part of message.message?.parts ?? []) {
      const toolCallId = jsonString(part.tool_call_id ?? null);
      if (toolCallId !== null && roundPartIsToolCall(part.kind, part.part_kind)) {
        toolCallIds.add(toolCallId);
      }
    }
    for (const part of message.content_parts ?? []) {
      const toolCallId = "tool_call_id" in part
        ? jsonString(part.tool_call_id ?? null)
        : null;
      const kind = "kind" in part ? part.kind : undefined;
      const partKind = "part_kind" in part ? part.part_kind : undefined;
      if (toolCallId !== null && roundPartIsToolCall(kind, partKind)) {
        toolCallIds.add(toolCallId);
      }
    }
  }
  return toolCallIds;
}

function roundPartIsToolCall(
  kind: string | undefined,
  partKind: string | undefined,
): boolean {
  return kind === "tool-call" || kind === "tool_call" || partKind === "tool-call";
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
