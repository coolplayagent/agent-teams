import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ActiveSubagentSession } from "../features/sessions/SessionsSidebar";
import {
  subagentTabKey,
  useSubagentWorkbench,
} from "../features/sessions/useSubagentWorkbench";

describe("useSubagentWorkbench", () => {
  it("chooses the adjacent tab from the closing tab's session", () => {
    const first = createSubagent("session-a", "run-a-1", "First");
    const otherSession = createSubagent("session-b", "run-b-1", "Other");
    const second = createSubagent("session-a", "run-a-2", "Second");
    const { result } = renderHook(() => useSubagentWorkbench(first));

    act(() => result.current.openSubagent(otherSession));
    act(() => result.current.openSubagent(second));
    expect(result.current.activeSubagent?.runId).toBe("run-a-2");

    act(() => result.current.closeSubagent(subagentTabKey(second)));
    expect(result.current.activeSubagent?.runId).toBe("run-a-1");
    expect(result.current.tabs.map((tab) => tab.runId)).toEqual([
      "run-a-1",
      "run-b-1",
    ]);
  });

  it("keeps inactive session tabs without selecting them after the last local close", () => {
    const local = createSubagent("session-a", "run-a-1", "Local");
    const otherSession = createSubagent("session-b", "run-b-1", "Other");
    const { result } = renderHook(() => useSubagentWorkbench(local));
    act(() => result.current.openSubagent(otherSession));
    act(() => result.current.activateSubagent(local));

    act(() => result.current.closeSubagent(subagentTabKey(local)));

    expect(result.current.activeSubagent).toBeNull();
    expect(result.current.tabs).toEqual([otherSession]);
  });

  it("keeps lightweight timeline state across tab switches and releases it on close", () => {
    const first = createSubagent("session-a", "run-a-1", "First");
    const second = createSubagent("session-a", "run-a-2", "Second");
    const { result } = renderHook(() => useSubagentWorkbench(first));
    const firstKey = subagentTabKey(first);
    const uiState = {
      expandedDisclosureIds: ["thinking:first"],
      expandedHistorySegmentIds: ["history:first"],
      measurementCache: [],
      scrollSnapshot: null,
    };

    act(() => result.current.setSubagentUiState(firstKey, uiState));
    act(() => result.current.openSubagent(second));
    act(() => result.current.setSubagentUiState(firstKey, uiState));
    act(() => result.current.activateSubagent(first));

    expect(result.current.getSubagentUiState(firstKey)).toEqual(uiState);
    act(() => result.current.closeSubagent(firstKey));
    act(() => result.current.setSubagentUiState(firstKey, uiState));
    expect(result.current.getSubagentUiState(firstKey)).toBeNull();
  });

  it("accepts a fresh snapshot after explicitly reopening a closed tab", () => {
    const first = createSubagent("session-a", "run-a-1", "First");
    const { result } = renderHook(() => useSubagentWorkbench(first));
    const firstKey = subagentTabKey(first);
    const uiState = {
      expandedDisclosureIds: [],
      expandedHistorySegmentIds: [],
      measurementCache: [],
      scrollSnapshot: null,
    };

    act(() => result.current.closeSubagent(firstKey));
    act(() => result.current.setSubagentUiState(firstKey, uiState));
    expect(result.current.getSubagentUiState(firstKey)).toBeNull();

    act(() => result.current.openSubagent(first));
    act(() => result.current.setSubagentUiState(firstKey, uiState));
    expect(result.current.getSubagentUiState(firstKey)).toEqual(uiState);
  });
});

function createSubagent(
  sessionId: string,
  runId: string,
  title: string,
): ActiveSubagentSession {
  return {
    createdAt: "",
    instanceId: `instance-${runId}`,
    interactive: false,
    lastEventId: null,
    promptText: "",
    roleId: "explorer",
    runId,
    runPhase: "running",
    runStatus: "running",
    sessionId,
    sourceRunId: "",
    sourceToolCallId: `call-${runId}`,
    status: "running",
    subagentKind: "normal",
    taskId: "",
    title,
    updatedAt: "",
  };
}
