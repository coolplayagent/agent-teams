import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { listSessionRounds } from "../api/client";
import type { JsonValue, SessionRound } from "../api/contracts";
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
  clearRunStream: (options?: ClearRunStreamOptions) => void;
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

  const finishClosedRunStream = (
    sessionId: string,
    terminalTargets: StartRunStreamTarget[],
  ) => {
    const roundSettleTargets = terminalRoundSettleTargets(
      terminalTargets,
      runtimeStateRef.current,
    );
    const streamGeneration = streamGenerationRef.current;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    suppressRunTargets(terminalTargets);
    setActiveRunIds([]);
    setTrackedRunIds([]);
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "messages"],
    });
    const refreshRounds = () => {
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "rounds"],
      });
    };
    if (roundSettleTargets.length === 0) {
      refreshRounds();
    } else {
      void settleTerminalRoundsFromHistory({
        currentStreamGeneration: () => streamGenerationRef.current,
        onReady: refreshRounds,
        sessionId,
        streamGeneration,
        targets: roundSettleTargets,
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
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
        setActiveRunIds(
          activeTrackedRunIds(options.foregroundRunIds ?? [], nextRuntimeState),
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

function activeTrackedRunIds(runIds: string[], runtimeState: RuntimeState): string[] {
  return runIds.filter((runId) => runtimeState.runs[runId]?.status !== "closed");
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

function terminalRoundSettleTargets(
  runs: StartRunStreamTarget[],
  runtimeState: RuntimeState,
): TerminalRoundSettleTarget[] {
  return normalizeRunTargets(runs)
    .map((run) => ({
      expectedToolCallIds: runtimeToolCallIds(runtimeState.runs[run.runId]),
      runId: run.runId,
    }))
    .filter((target) => target.expectedToolCallIds.length > 0);
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
    const toolCallIds = persistedRoundToolCallIds(roundsByRunId.get(target.runId));
    return target.expectedToolCallIds.every((toolCallId) =>
      toolCallIds.has(toolCallId),
    );
  });
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
