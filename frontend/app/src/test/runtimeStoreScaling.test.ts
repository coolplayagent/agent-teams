import { afterEach, describe, expect, it } from "vitest";

import type { RuntimeRunState, RuntimeState } from "../runtime/reducers";
import {
  MAX_RETAINED_TERMINAL_RUNS,
  useRuntimeStore,
} from "../runtime/runtimeStore";

afterEach(() => {
  useRuntimeStore.getState().resetRuntimeState();
});

describe("runtime store scaling", () => {
  it("retains every active run while bounding persisted terminal projections", () => {
    const activeRunCount = 48;
    let runtimeState: RuntimeState = {
      activeRunIds: [],
      runs: {},
    };
    for (let index = 0; index < activeRunCount; index += 1) {
      const runId = `active-${index}`;
      runtimeState = runtimeStateWithRun(runtimeState, openRun(runId), true);
      useRuntimeStore.getState().setRuntimeState(runtimeState);
      runtimeState = useRuntimeStore.getState().runtimeState;
    }

    const selectedActiveRun = runtimeState.runs["active-0"];
    const activeSessionRuns = useRuntimeStore.getState()
      .runtimeRunsBySession["active-session"];
    let selectedRunChanges = 0;
    let previousSelectedRun = selectedActiveRun;
    const unsubscribe = useRuntimeStore.subscribe((state) => {
      const nextSelectedRun = state.runtimeState.runs["active-0"];
      if (nextSelectedRun !== previousSelectedRun) {
        selectedRunChanges += 1;
        previousSelectedRun = nextSelectedRun;
      }
    });

    const terminalRunCount = MAX_RETAINED_TERMINAL_RUNS * 3;
    for (let index = 0; index < terminalRunCount; index += 1) {
      const runId = `terminal-${index}`;
      runtimeState = runtimeStateWithRun(runtimeState, terminalRun(runId), false);
      useRuntimeStore.getState().setRuntimeState(runtimeState);
      runtimeState = useRuntimeStore.getState().runtimeState;
    }
    unsubscribe();

    const retainedRunIds = Object.keys(runtimeState.runs);
    const retainedTerminalRunIds = retainedRunIds.filter((runId) =>
      runId.startsWith("terminal-")
    );
    expect(retainedTerminalRunIds).toHaveLength(MAX_RETAINED_TERMINAL_RUNS);
    expect(retainedRunIds.filter((runId) => runId.startsWith("active-")))
      .toHaveLength(activeRunCount);
    expect(runtimeState.runs["active-0"]).toBe(selectedActiveRun);
    expect(useRuntimeStore.getState().runtimeRunsBySession["active-session"])
      .toBe(activeSessionRuns);
    expect(useRuntimeStore.getState().runtimeRunsBySession["terminal-session"])
      .toHaveLength(MAX_RETAINED_TERMINAL_RUNS);
    expect(selectedRunChanges).toBe(0);
    expect(runtimeState.runs["terminal-0"]).toBeUndefined();
    expect(runtimeState.runs[`terminal-${terminalRunCount - 1}`]).toBeDefined();
  });

  it("evicts only the explicitly requested run identities", () => {
    const first = terminalRun("first");
    const second = terminalRun("second");
    useRuntimeStore.getState().setRuntimeState({
      activeRunIds: [],
      changedRunIds: ["first", "second"],
      runs: { first, second },
    });

    useRuntimeStore.getState().evictRuntimeRuns([" first ", "first"]);

    const runtimeState = useRuntimeStore.getState().runtimeState;
    expect(runtimeState.runs.first).toBeUndefined();
    expect(runtimeState.runs.second).toBe(second);
    expect(runtimeState.changedRunIds).toEqual(["first"]);
  });
});

function runtimeStateWithRun(
  runtimeState: RuntimeState,
  runState: RuntimeRunState,
  active: boolean,
): RuntimeState {
  return {
    ...runtimeState,
    activeRunIds: active
      ? [...runtimeState.activeRunIds, runState.runId]
      : runtimeState.activeRunIds,
    changedRunIds: [runState.runId],
    runs: {
      ...runtimeState.runs,
      [runState.runId]: runState,
    },
  };
}

function openRun(runId: string): RuntimeRunState {
  return {
    entries: [],
    lastEventId: 1,
    runId,
    sessionId: "active-session",
    seenEventKeys: [],
    status: "open",
    terminalEventType: null,
  };
}

function terminalRun(runId: string): RuntimeRunState {
  return {
    entries: [],
    lastEventId: 2,
    runId,
    sessionId: "terminal-session",
    seenEventKeys: [],
    status: "closed",
    terminalEventType: "run_completed",
  };
}
