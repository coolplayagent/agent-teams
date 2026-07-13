import { create } from "zustand";

import {
  initialRuntimeState,
  type RuntimeRunState,
  type RuntimeState,
} from "./reducers";

export const MAX_RETAINED_TERMINAL_RUNS = 64;

interface RuntimeStoreState {
  runtimeState: RuntimeState;
  runtimeRunsBySession: Record<string, readonly RuntimeRunState[]>;
  evictRuntimeRuns: (runIds: readonly string[]) => void;
  setRuntimeState: (runtimeState: RuntimeState) => void;
  resetRuntimeState: () => void;
}

export const useRuntimeStore = create<RuntimeStoreState>((set) => {
  const retainedTerminalRunIds: string[] = [];

  const removeRetainedTerminalRunId = (runId: string) => {
    const index = retainedTerminalRunIds.indexOf(runId);
    if (index >= 0) {
      retainedTerminalRunIds.splice(index, 1);
    }
  };

  const trackChangedTerminalRuns = (runtimeState: RuntimeState) => {
    for (const runId of runtimeState.changedRunIds ?? []) {
      removeRetainedTerminalRunId(runId);
      if (
        isTerminalRun(runtimeState.runs[runId]) &&
        !runtimeState.activeRunIds.includes(runId)
      ) {
        retainedTerminalRunIds.push(runId);
      }
    }
  };

  const boundedRuntimeState = (runtimeState: RuntimeState): RuntimeState => {
    trackChangedTerminalRuns(runtimeState);
    if (retainedTerminalRunIds.length <= MAX_RETAINED_TERMINAL_RUNS) {
      return runtimeState;
    }
    const evictedRunIds: string[] = [];
    while (retainedTerminalRunIds.length > MAX_RETAINED_TERMINAL_RUNS) {
      const runId = retainedTerminalRunIds.shift();
      if (runId === undefined) {
        break;
      }
      evictedRunIds.push(runId);
    }
    return runtimeStateWithoutRuns(runtimeState, evictedRunIds, true);
  };

  return {
    runtimeState: initialRuntimeState,
    runtimeRunsBySession: {},
    evictRuntimeRuns: (runIds) => {
      const normalizedRunIds = normalizedUniqueRunIds(runIds);
      if (normalizedRunIds.length === 0) {
        return;
      }
      for (const runId of normalizedRunIds) {
        removeRetainedTerminalRunId(runId);
      }
      set((state) => {
        const runtimeState = runtimeStateWithoutRuns(
          state.runtimeState,
          normalizedRunIds,
        );
        return {
          runtimeRunsBySession: runtimeRunsBySessionAfterChange(
            state.runtimeRunsBySession,
            state.runtimeState,
            runtimeState,
          ),
          runtimeState,
        };
      });
    },
    setRuntimeState: (runtimeState) => set((state) => {
      const boundedState = boundedRuntimeState(runtimeState);
      return {
        runtimeRunsBySession: runtimeRunsBySessionAfterChange(
          state.runtimeRunsBySession,
          state.runtimeState,
          boundedState,
        ),
        runtimeState: boundedState,
      };
    }),
    resetRuntimeState: () => {
      retainedTerminalRunIds.splice(0, retainedTerminalRunIds.length);
      set({ runtimeRunsBySession: {}, runtimeState: initialRuntimeState });
    },
  };
});

function isTerminalRun(runState: RuntimeRunState | undefined): boolean {
  return runState?.status === "closed" || runState?.status === "failed";
}

function normalizedUniqueRunIds(runIds: readonly string[]): string[] {
  return Array.from(
    new Set(
      runIds
        .map((runId) => runId.trim())
        .filter((runId) => runId.length > 0),
    ),
  );
}

function runtimeStateWithoutRuns(
  runtimeState: RuntimeState,
  runIds: readonly string[],
  preserveChangedRunIds = false,
): RuntimeState {
  const evictedRunIds = new Set(runIds);
  if (evictedRunIds.size === 0) {
    return runtimeState;
  }
  let runs: Record<string, RuntimeRunState> | null = null;
  for (const runId of evictedRunIds) {
    if (runtimeState.runs[runId] === undefined) {
      continue;
    }
    runs ??= { ...runtimeState.runs };
    delete runs[runId];
  }
  if (runs === null) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    activeRunIds: runtimeState.activeRunIds.filter(
      (runId) => !evictedRunIds.has(runId),
    ),
    changedRunIds: Array.from(new Set([
      ...(preserveChangedRunIds ? runtimeState.changedRunIds ?? [] : []),
      ...evictedRunIds,
    ])),
    runs,
  };
}

function runtimeRunsBySessionAfterChange(
  currentIndex: Record<string, readonly RuntimeRunState[]>,
  previousState: RuntimeState,
  nextState: RuntimeState,
): Record<string, readonly RuntimeRunState[]> {
  let nextIndex: Record<string, readonly RuntimeRunState[]> | null = null;
  for (const runId of nextState.changedRunIds ?? []) {
    const previousRun = previousState.runs[runId];
    const nextRun = nextState.runs[runId];
    const previousSessionId = runtimeRunSessionId(previousRun);
    const nextSessionId = runtimeRunSessionId(nextRun);
    if (previousSessionId !== null && previousSessionId !== nextSessionId) {
      nextIndex ??= { ...currentIndex };
      const remainingRuns = (nextIndex[previousSessionId] ?? [])
        .filter((runState) => runState.runId !== runId);
      if (remainingRuns.length === 0) {
        delete nextIndex[previousSessionId];
      } else {
        nextIndex[previousSessionId] = remainingRuns;
      }
    }
    if (nextSessionId === null || nextRun === undefined) {
      continue;
    }
    const indexedRuns = (nextIndex ?? currentIndex)[nextSessionId] ?? [];
    const currentRunIndex = indexedRuns.findIndex((runState) => runState.runId === runId);
    if (currentRunIndex >= 0 && indexedRuns[currentRunIndex] === nextRun) {
      continue;
    }
    nextIndex ??= { ...currentIndex };
    nextIndex[nextSessionId] = currentRunIndex < 0
      ? [...indexedRuns, nextRun]
      : indexedRuns.map((runState, index) => index === currentRunIndex ? nextRun : runState);
  }
  return nextIndex ?? currentIndex;
}

function runtimeRunSessionId(runState: RuntimeRunState | undefined): string | null {
  const explicitSessionId = runState?.sessionId?.trim() ?? "";
  if (explicitSessionId.length > 0) {
    return explicitSessionId;
  }
  const entrySessionId = runState?.entries.find((entry) =>
    entry.sessionId.trim().length > 0
  )?.sessionId.trim() ?? "";
  return entrySessionId.length > 0 ? entrySessionId : null;
}
