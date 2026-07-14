import { useCallback, useReducer, useRef } from "react";

import type { ActiveSubagentSession } from "./SessionsSidebar";
import type { MessageTimelineUiState } from "../timeline/MessageTimeline";

const closedSubagentTabKeyLimit = 256;

interface SubagentWorkbenchState {
  activeSubagent: ActiveSubagentSession | null;
  tabs: ActiveSubagentSession[];
}

type SubagentWorkbenchAction =
  | { subagent: ActiveSubagentSession; type: "activate" }
  | { subagent: ActiveSubagentSession; type: "open" }
  | {
      next: ActiveSubagentSession;
      previous: ActiveSubagentSession | null;
      type: "hydrate";
    }
  | { tabKey: string; type: "close" }
  | { type: "deactivate" };

export function useSubagentWorkbench(
  initialSubagent: ActiveSubagentSession | null,
) {
  const uiStateByTabKeyRef = useRef(new Map<string, MessageTimelineUiState>());
  const closedTabKeysRef = useRef(new Set<string>());
  const [state, dispatch] = useReducer(
    reduceSubagentWorkbench,
    initialSubagent,
    (subagent): SubagentWorkbenchState => ({
      activeSubagent: subagent,
      tabs: subagent === null ? [] : [subagent],
    }),
  );
  const openSubagent = useCallback((subagent: ActiveSubagentSession) => {
    closedTabKeysRef.current.delete(subagentTabKey(subagent));
    dispatch({ subagent, type: "open" });
  }, []);
  const activateSubagent = useCallback((subagent: ActiveSubagentSession) => {
    closedTabKeysRef.current.delete(subagentTabKey(subagent));
    dispatch({ subagent, type: "activate" });
  }, []);
  const hydrateSubagent = useCallback(
    (previous: ActiveSubagentSession | null, next: ActiveSubagentSession) => {
      if (previous !== null) {
        const previousKey = subagentTabKey(previous);
        const nextKey = subagentTabKey(next);
        if (closedTabKeysRef.current.has(previousKey)) {
          rememberClosedSubagentTabKey(closedTabKeysRef.current, nextKey);
          return;
        }
        closedTabKeysRef.current.delete(nextKey);
        if (previousKey !== nextKey) {
          const previousUiState = uiStateByTabKeyRef.current.get(previousKey);
          uiStateByTabKeyRef.current.delete(previousKey);
          if (previousUiState !== undefined) {
            uiStateByTabKeyRef.current.set(nextKey, previousUiState);
          }
        }
      }
      dispatch({ next, previous, type: "hydrate" });
    },
    [],
  );
  const closeSubagent = useCallback((tabKey: string) => {
    rememberClosedSubagentTabKey(closedTabKeysRef.current, tabKey);
    uiStateByTabKeyRef.current.delete(tabKey);
    dispatch({ tabKey, type: "close" });
  }, []);
  const getSubagentUiState = useCallback((tabKey: string) =>
    uiStateByTabKeyRef.current.get(tabKey) ?? null, []);
  const setSubagentUiState = useCallback(
    (tabKey: string, uiState: MessageTimelineUiState) => {
      if (closedTabKeysRef.current.has(tabKey)) {
        return;
      }
      uiStateByTabKeyRef.current.set(tabKey, uiState);
    },
    [],
  );
  const deactivateSubagent = useCallback(() => {
    dispatch({ type: "deactivate" });
  }, []);

  return {
    activateSubagent,
    activeSubagent: state.activeSubagent,
    closeSubagent,
    deactivateSubagent,
    getSubagentUiState,
    hydrateSubagent,
    openSubagent,
    setSubagentUiState,
    tabs: state.tabs,
  };
}

function rememberClosedSubagentTabKey(
  tabKeys: Set<string>,
  tabKey: string,
): void {
  tabKeys.delete(tabKey);
  tabKeys.add(tabKey);
  while (tabKeys.size > closedSubagentTabKeyLimit) {
    const oldestTabKey = tabKeys.values().next().value;
    if (typeof oldestTabKey !== "string") {
      return;
    }
    tabKeys.delete(oldestTabKey);
  }
}

function reduceSubagentWorkbench(
  state: SubagentWorkbenchState,
  action: SubagentWorkbenchAction,
): SubagentWorkbenchState {
  if (action.type === "open") {
    const tabs = upsertSubagentTab(state.tabs, action.subagent);
    return {
      activeSubagent:
        tabs.find((candidate) =>
          subagentPanelIdentityMatches(candidate, action.subagent),
        ) ?? action.subagent,
      tabs,
    };
  }
  if (action.type === "activate") {
    return {
      ...state,
      activeSubagent:
        state.tabs.find((candidate) =>
          subagentPanelIdentityMatches(candidate, action.subagent),
        ) ?? action.subagent,
    };
  }
  if (action.type === "hydrate") {
    const tabs = replaceSubagentTab(state.tabs, action.previous, action.next);
    const shouldReplaceActive =
      state.activeSubagent === null ||
      (action.previous !== null &&
        subagentPanelIdentityMatches(state.activeSubagent, action.previous));
    return {
      activeSubagent: shouldReplaceActive ? action.next : state.activeSubagent,
      tabs,
    };
  }
  if (action.type === "deactivate") {
    return { ...state, activeSubagent: null };
  }

  const closingTab = state.tabs.find(
    (subagent) => subagentTabKey(subagent) === action.tabKey,
  );
  if (closingTab === undefined) {
    return state;
  }
  const tabs = state.tabs.filter(
    (subagent) => subagentTabKey(subagent) !== action.tabKey,
  );
  if (
    state.activeSubagent !== null &&
    subagentTabKey(state.activeSubagent) !== action.tabKey
  ) {
    return { ...state, tabs };
  }

  const sessionTabs = state.tabs.filter(
    (subagent) => subagent.sessionId === closingTab.sessionId,
  );
  const sessionClosingIndex = sessionTabs.findIndex(
    (subagent) => subagentTabKey(subagent) === action.tabKey,
  );
  const remainingSessionTabs = sessionTabs.filter(
    (subagent) => subagentTabKey(subagent) !== action.tabKey,
  );
  const nextIndex = Math.min(
    sessionClosingIndex,
    remainingSessionTabs.length - 1,
  );
  return {
    activeSubagent:
      (nextIndex >= 0 ? remainingSessionTabs[nextIndex] : undefined) ?? null,
    tabs,
  };
}

function upsertSubagentTab(
  tabs: ActiveSubagentSession[],
  subagent: ActiveSubagentSession,
): ActiveSubagentSession[] {
  const existingIndex = tabs.findIndex((candidate) =>
    subagentPanelIdentityMatches(candidate, subagent),
  );
  if (existingIndex < 0) {
    return [...tabs, subagent];
  }
  return tabs.map((candidate, index) =>
    index === existingIndex
      ? mergeActiveSubagentPanelContext(subagent, candidate)
      : candidate,
  );
}

function replaceSubagentTab(
  tabs: ActiveSubagentSession[],
  previous: ActiveSubagentSession | null,
  next: ActiveSubagentSession,
): ActiveSubagentSession[] {
  if (previous === null) {
    return upsertSubagentTab(tabs, next);
  }
  const previousIndex = tabs.findIndex((candidate) =>
    subagentPanelIdentityMatches(candidate, previous),
  );
  if (previousIndex < 0) {
    return upsertSubagentTab(tabs, next);
  }
  return tabs.map((candidate, index) =>
    index === previousIndex ? next : candidate,
  );
}

function mergeActiveSubagentPanelContext(
  authoritative: ActiveSubagentSession,
  previous: ActiveSubagentSession,
): ActiveSubagentSession {
  return {
    ...authoritative,
    promptText: firstNonBlank(authoritative.promptText, previous.promptText),
    sourceRunId: firstNonBlank(authoritative.sourceRunId, previous.sourceRunId),
    sourceToolCallId: firstNonBlank(
      authoritative.sourceToolCallId,
      previous.sourceToolCallId,
    ),
    title: firstNonBlank(authoritative.title, previous.title),
  };
}

export function subagentTabKey(subagent: ActiveSubagentSession): string {
  const semanticIdentity = firstNonBlank(
    subagent.sourceToolCallId,
    subagent.taskId,
    subagent.runId,
    subagent.instanceId,
    subagent.title,
  );
  return `${encodeURIComponent(subagent.sessionId)}:${encodeURIComponent(semanticIdentity)}`;
}

export function subagentDisplayTitle(
  subagent: ActiveSubagentSession,
  fallbackTitle: string,
): string {
  return firstNonBlank(
    subagent.title,
    subagent.roleId,
    subagent.taskId,
    subagent.runId,
    subagent.instanceId,
    fallbackTitle,
  );
}

export function subagentPanelIdentityMatches(
  left: ActiveSubagentSession,
  right: ActiveSubagentSession,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.sessionId !== right.sessionId) {
    return false;
  }
  const leftTaskId = left.taskId?.trim() ?? "";
  const rightTaskId = right.taskId?.trim() ?? "";
  if (leftTaskId.length > 0 && rightTaskId.length > 0) {
    return leftTaskId === rightTaskId;
  }
  if (left.instanceId.length > 0 && right.instanceId.length > 0) {
    return left.instanceId === right.instanceId;
  }
  if (left.runId.length > 0 && right.runId.length > 0) {
    return left.runId === right.runId;
  }
  const leftToolCallId = left.sourceToolCallId?.trim() ?? "";
  const rightToolCallId = right.sourceToolCallId?.trim() ?? "";
  return (
    leftToolCallId.length > 0 &&
    rightToolCallId.length > 0 &&
    leftToolCallId === rightToolCallId
  );
}

function firstNonBlank(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}
