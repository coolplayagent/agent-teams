import { Button, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listAgentMessages, listSessionSubagents } from "../../api/client";
import {
  type ContentPart,
  type JsonValue,
  type TimelineMessage,
} from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import {
  runtimeStateWithScopedRun,
  type RuntimeRunState,
  type RuntimeState,
  type TimelineEntry,
} from "../../runtime/reducers";
import {
  openSessionSubagentRunStream,
  type RunStreamHandle,
} from "../../runtime/streamClient";
import { useTranslations, type Translate } from "../../i18n";
import { MessageTimeline } from "../timeline/MessageTimeline";
import { mergeRuntimeTimelineEntries } from "../timeline/runtimeScopeProjection";
import { SubagentQuestionBar } from "../recovery/RecoveryBar";
import {
  normalizeSessionSubagent,
  type ActiveSubagentSession,
} from "./SessionsSidebar";

const SUBAGENT_STREAM_RECONNECT_DELAY_MS = 750;
const SUBAGENT_STREAM_RECONNECT_MAX_ATTEMPTS = 3;

interface SubagentSessionViewProps {
  subagent: ActiveSubagentSession;
  onBack: () => void;
  visible?: boolean;
}

export const SubagentSessionView = memo(function SubagentSessionView({
  onBack,
  subagent,
  visible = true,
}: SubagentSessionViewProps) {
  if (!visible) {
    return null;
  }
  return <ActiveSubagentSessionView onBack={onBack} subagent={subagent} />;
});

function ActiveSubagentSessionView({
  onBack,
  subagent,
}: Omit<SubagentSessionViewProps, "visible">) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const latestStreamTargetRef = useRef<SubagentStreamTarget | null>(null);
  const subagentReconnectAttemptRef = useRef(0);
  const subagentReconnectTimerRef = useRef<number | null>(null);
  const subagentStreamRef = useRef<RunStreamHandle | null>(null);
  const streamedRunIdRef = useRef<string | null>(null);
  const [streamReconnectGeneration, setStreamReconnectGeneration] = useState(0);
  const subagentRecordsQuery = useQuery({
    queryKey: ["sessions", subagent.sessionId, "subagents"],
    queryFn: () => listSessionSubagents(subagent.sessionId, true),
    enabled: subagent.sessionId.trim().length > 0,
    staleTime: 1000,
  });
  const latestSubagentRecord = useMemo(
    () => matchingSubagentFromRecords(subagentRecordsQuery.data, subagent),
    [subagent, subagentRecordsQuery.data],
  );
  const recordAwareSubagent =
    latestSubagentRecord === null
      ? subagent
      : mergeSubagentRecordContext(latestSubagentRecord, subagent);
  const sessionId = recordAwareSubagent.sessionId;
  const runId = recordAwareSubagent.runId.trim();
  const dedicatedRunId = recordAwareSubagent.subagentKind === "orchestration"
    ? ""
    : runId;
  const sourceRunId = recordAwareSubagent.sourceRunId?.trim() ?? "";
  const timelineRunId = runId || sourceRunId;
  const instanceId = recordAwareSubagent.instanceId.trim();
  const usesSharedTimelineRun =
    recordAwareSubagent.subagentKind === "orchestration" ||
    (runId.length === 0 && sourceRunId.length > 0);
  const runtimeRunState = useRuntimeStore((state) =>
    runId ? state.runtimeState.runs[runId] ?? null : null,
  );
  const runtimeTerminalEventType = runtimeRunState?.terminalEventType ?? null;
  const displayedSubagent = useMemo(
    () => subagentWithRuntimeTerminalStatus(
      recordAwareSubagent,
      runtimeTerminalEventType,
    ),
    [recordAwareSubagent, runtimeTerminalEventType],
  );
  const subagentWaitingForOutput = subagentHasStreamingStatus(displayedSubagent);
  const subagentPromptText = displayedSubagent.promptText.trim();
  const streamStatusKey = [
    displayedSubagent.status,
    displayedSubagent.runStatus,
    displayedSubagent.runPhase,
  ].join("|");
  const hasMessageHistoryTarget = instanceId.length > 0;
  const messageTaskId = recordAwareSubagent.subagentKind === "orchestration"
    ? displayedSubagent.taskId?.trim() ?? ""
    : "";
  const canRenderTimeline = hasMessageHistoryTarget || timelineRunId.length > 0;
  const title =
    displayedSubagent.title ||
    humanizeRoleId(displayedSubagent.roleId) ||
    displayedSubagent.instanceId;
  const messageQueryKey = useMemo(
    () => subagentMessagesQueryKey(
      sessionId,
      hasMessageHistoryTarget
        ? instanceId
        : `pending:${runId || title}`,
      messageTaskId,
    ),
    [hasMessageHistoryTarget, instanceId, messageTaskId, runId, sessionId, title],
  );
  const loadSubagentMessages = useCallback(
    async () => {
      if (!hasMessageHistoryTarget) {
        return subagentTaskMessages({
          messages: [],
          promptText: subagentPromptText,
          scopeToTask: recordAwareSubagent.subagentKind === "orchestration",
          taskId: displayedSubagent.taskId ?? "",
        });
      }
      const messages = await listScopedAgentMessages(
        sessionId,
        instanceId,
        messageTaskId,
      );
      return subagentTaskMessages({
        messages,
        promptText: subagentPromptText,
        scopeToTask: recordAwareSubagent.subagentKind === "orchestration",
        taskId: displayedSubagent.taskId ?? "",
      });
    },
    [
      displayedSubagent.taskId,
      hasMessageHistoryTarget,
      instanceId,
      messageTaskId,
      sessionId,
      subagentPromptText,
      recordAwareSubagent.subagentKind,
    ],
  );

  useEffect(() => {
    latestStreamTargetRef.current = {
      instanceId,
      messageQueryKey,
      queryClient,
      sessionId,
      taskId: messageTaskId,
    };
  }, [instanceId, messageQueryKey, messageTaskId, queryClient, sessionId]);

  const clearSubagentReconnectTimer = useCallback(() => {
    if (subagentReconnectTimerRef.current !== null) {
      window.clearTimeout(subagentReconnectTimerRef.current);
      subagentReconnectTimerRef.current = null;
    }
  }, []);

  const resetSubagentReconnect = useCallback(() => {
    clearSubagentReconnectTimer();
    subagentReconnectAttemptRef.current = 0;
  }, [clearSubagentReconnectTimer]);

  const scheduleSubagentReconnect = useCallback(() => {
    if (
      subagentReconnectTimerRef.current !== null ||
      subagentReconnectAttemptRef.current >= SUBAGENT_STREAM_RECONNECT_MAX_ATTEMPTS
    ) {
      return;
    }
    const nextAttempt = subagentReconnectAttemptRef.current + 1;
    subagentReconnectAttemptRef.current = nextAttempt;
    subagentReconnectTimerRef.current = window.setTimeout(() => {
      subagentReconnectTimerRef.current = null;
      setStreamReconnectGeneration((generation) => generation + 1);
    }, SUBAGENT_STREAM_RECONNECT_DELAY_MS * nextAttempt);
  }, []);

  useEffect(() => {
    if (!shouldStreamSubagentRun(dedicatedRunId, streamStatusKey)) {
      return;
    }
    if (streamedRunIdRef.current === dedicatedRunId) {
      return;
    }
    subagentStreamRef.current?.close();
    streamedRunIdRef.current = dedicatedRunId;
    const storeRuntimeState = useRuntimeStore.getState().runtimeState;
    const currentRuntimeState = runtimeStateWithScopedRun(
      storeRuntimeState,
      dedicatedRunId,
      sessionId,
      "subagent",
    );
    if (currentRuntimeState !== storeRuntimeState) {
      setRuntimeState(currentRuntimeState);
    }
    const streamHandle = openSessionSubagentRunStream({
      afterEventId: currentRuntimeState.runs[dedicatedRunId]?.lastEventId ?? 0,
      initialState: currentRuntimeState,
      onActivity: resetSubagentReconnect,
      onClosed: (closedRuntimeState) => {
        resetSubagentReconnect();
        const latestRuntimeState = useRuntimeStore.getState().runtimeState;
        const displayRuntimeState = subagentClosedRuntimeStateForDisplay({
          closedRuntimeState,
          currentRuntimeState: latestRuntimeState,
          runId: dedicatedRunId,
          sessionId,
        });
        setRuntimeState(displayRuntimeState);
        if (streamedRunIdRef.current === dedicatedRunId) {
          streamedRunIdRef.current = null;
          subagentStreamRef.current = null;
        }
        const latestTarget = latestStreamTargetRef.current;
        if (latestTarget === null) {
          return;
        }
        const terminalInstanceId =
          latestTarget.instanceId.trim() ||
          runtimeInstanceId(closedRuntimeState.runs[dedicatedRunId]);
        void refreshSubagentTerminalHistoryFromRuntime({
          instanceId: terminalInstanceId,
          messageQueryKey: latestTarget.messageQueryKey,
          queryClient: latestTarget.queryClient,
          runId: dedicatedRunId,
          runtimeState: displayRuntimeState,
          sessionId: latestTarget.sessionId,
          taskId: latestTarget.taskId,
        });
      },
      onError: (_message, errorKind) => {
        if (streamedRunIdRef.current === dedicatedRunId) {
          subagentStreamRef.current?.close();
          streamedRunIdRef.current = null;
          subagentStreamRef.current = null;
        }
        if (errorKind === "transport") {
          scheduleSubagentReconnect();
        }
      },
      onState: (nextRuntimeState) => {
        const nextSubagentRun = nextRuntimeState.runs[dedicatedRunId];
        const latestRuntimeState = useRuntimeStore.getState().runtimeState;
        const scopedRuntimeState = mergeSubagentRunIntoRuntimeState(
          latestRuntimeState,
          nextSubagentRun,
          dedicatedRunId,
          sessionId,
        );
        if (scopedRuntimeState.runs[dedicatedRunId]?.status === "closed") {
          const displayRuntimeState = subagentClosedRuntimeStateForDisplay({
            closedRuntimeState: scopedRuntimeState,
            currentRuntimeState: latestRuntimeState,
            runId: dedicatedRunId,
            sessionId,
          });
          setRuntimeState(displayRuntimeState);
          return;
        }
        setRuntimeState(scopedRuntimeState);
      },
      runId: dedicatedRunId,
      sessionId,
    });
    subagentStreamRef.current = streamHandle;
  }, [
    resetSubagentReconnect,
    dedicatedRunId,
    scheduleSubagentReconnect,
    sessionId,
    setRuntimeState,
    streamReconnectGeneration,
    streamStatusKey,
  ]);

  useEffect(() => {
    return () => {
      resetSubagentReconnect();
      if (streamedRunIdRef.current === dedicatedRunId) {
        subagentStreamRef.current?.close();
        subagentStreamRef.current = null;
        streamedRunIdRef.current = null;
      }
    };
  }, [dedicatedRunId, resetSubagentReconnect, sessionId]);

  useEffect(() => {
    return () => {
      resetSubagentReconnect();
      subagentStreamRef.current?.close();
      subagentStreamRef.current = null;
      streamedRunIdRef.current = null;
    };
  }, [resetSubagentReconnect]);

  return (
    <div className="at-subagent-session-view">
      <header className="at-subagent-session-header">
        <div className="at-subagent-session-title-row">
          <Button icon={<ArrowLeft size={15} />} onClick={onBack} size="small">
            {t("subagentSessionBack")}
          </Button>
          <Typography.Title className="at-subagent-session-title" level={2}>
            {title}
          </Typography.Title>
          <span
            className={subagentBadgeClassName(displayedSubagent)}
            data-status={subagentRawStatus(displayedSubagent)}
          >
            {subagentBadgeLabel(displayedSubagent, t)}
          </span>
        </div>
        <div className="at-subagent-session-meta">
          <span>{t("subagentSessionReadOnly")}</span>
          {displayedSubagent.roleId.trim().length > 0 ? (
            <span>{displayedSubagent.roleId}</span>
          ) : null}
        </div>
      </header>
      <div className="at-subagent-session-body">
        {runId ? (
          <SubagentQuestionBar
            enabled
            instanceId={instanceId}
            runId={runId}
            sessionId={sessionId}
          />
        ) : null}
        {canRenderTimeline ? (
          <MessageTimeline
            emptyDescription={t("subagentSessionEmpty")}
            emptyFallback={
              subagentWaitingForOutput ? (
                <SubagentPendingState label={t("subagentSessionWaiting")} />
              ) : undefined
            }
            fallbackRunId={timelineRunId}
            latestTerminalRunId={timelineRunId}
            latestTerminalRunStatus={
              displayedSubagent.runStatus || displayedSubagent.status || null
            }
            loadErrorDescription={t("subagentSessionLoadError")}
            loadMessages={loadSubagentMessages}
            messageQueryKey={messageQueryKey}
            roundsEnabled={false}
            runtimeRunId={timelineRunId}
            sessionId={sessionId}
            subagentScopeInstanceId={
              usesSharedTimelineRun ? instanceId : null
            }
            subagentScopeRoleId={
              usesSharedTimelineRun
                ? recordAwareSubagent.roleId
                : null
            }
            subagentScopeTaskId={
              usesSharedTimelineRun
                ? displayedSubagent.taskId ?? null
                : null
            }
            variant="subagent-panel"
            visible
          />
        ) : (
          <SubagentPendingState label={t("subagentSessionStarting")} />
        )}
      </div>
    </div>
  );
}

function SubagentPendingState({ label }: { label: string }) {
  return (
    <div className="at-subagent-session-pending" role="status">
      <span aria-hidden="true" className="at-subagent-session-pending-dot" />
      <span>{label}</span>
    </div>
  );
}

interface SubagentStreamTarget {
  instanceId: string;
  messageQueryKey: readonly unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
  sessionId: string;
  taskId: string;
}

function subagentClosedRuntimeStateForDisplay({
  closedRuntimeState,
  currentRuntimeState,
  runId,
  sessionId,
}: {
  closedRuntimeState: RuntimeState;
  currentRuntimeState: RuntimeState;
  runId: string;
  sessionId: string;
}): RuntimeState {
  const closedRun = closedRuntimeState.runs[runId];
  const currentRun = currentRuntimeState.runs[runId];
  if (closedRun === undefined) {
    return currentRuntimeState;
  }
  const mergedRun = mergeSubagentRunState(currentRun, closedRun, runId, sessionId);
  return runtimeStateWithSubagentRun(currentRuntimeState, mergedRun);
}

function mergeSubagentRunIntoRuntimeState(
  currentRuntimeState: RuntimeState,
  nextRun: RuntimeRunState | undefined,
  runId: string,
  sessionId: string,
): RuntimeState {
  if (nextRun === undefined) {
    return runtimeStateWithScopedRun(
      currentRuntimeState,
      runId,
      sessionId,
      "subagent",
    );
  }
  const mergedRun = mergeSubagentRunState(
    currentRuntimeState.runs[runId],
    nextRun,
    runId,
    sessionId,
  );
  return runtimeStateWithSubagentRun(currentRuntimeState, mergedRun);
}

function runtimeStateWithSubagentRun(
  currentRuntimeState: RuntimeState,
  subagentRun: RuntimeRunState,
): RuntimeState {
  const activeRunIds = new Set(currentRuntimeState.activeRunIds);
  if (subagentRun.status === "closed" || subagentRun.status === "failed") {
    activeRunIds.delete(subagentRun.runId);
  } else {
    activeRunIds.add(subagentRun.runId);
  }
  return {
    ...currentRuntimeState,
    activeRunIds: Array.from(activeRunIds),
    runs: {
      ...currentRuntimeState.runs,
      [subagentRun.runId]: subagentRun,
    },
  };
}

function mergeSubagentRunState(
  currentRun: RuntimeRunState | undefined,
  nextRun: RuntimeRunState,
  runId: string,
  sessionId: string,
): RuntimeRunState {
  const mergedEntries = mergeRuntimeTimelineEntries(
    currentRun?.entries ?? [],
    nextRun.entries,
  );
  return {
    ...nextRun,
    entries: mergedEntries,
    hadVisibleTextStream:
      currentRun?.hadVisibleTextStream === true ||
      nextRun.hadVisibleTextStream === true,
    lastEventId: Math.max(currentRun?.lastEventId ?? 0, nextRun.lastEventId),
    runId,
    seenEventKeys: mergeSeenEventKeys(
      currentRun?.seenEventKeys ?? [],
      nextRun.seenEventKeys,
    ),
    sessionId: nextRun.sessionId ?? currentRun?.sessionId ?? sessionId,
    scope: "subagent",
  };
}

function mergeSeenEventKeys(left: string[], right: string[]): string[] {
  if (left === right || left.length === 0) {
    return right;
  }
  if (right.length === 0) {
    return left;
  }
  if (
    right.length > left.length &&
    right[left.length - 1] === left[left.length - 1]
  ) {
    return right;
  }
  if (
    left.length > right.length &&
    left[right.length - 1] === right[right.length - 1]
  ) {
    return left;
  }
  return Array.from(new Set([...left, ...right]));
}

async function refreshSubagentTerminalHistoryFromRuntime({
  instanceId,
  messageQueryKey,
  queryClient,
  runId,
  runtimeState,
  sessionId,
  taskId,
}: {
  instanceId: string;
  messageQueryKey: readonly unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
  runId: string;
  runtimeState: RuntimeState;
  sessionId: string;
  taskId: string;
}): Promise<boolean> {
  if (instanceId.trim().length === 0) {
    void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "subagents"] });
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    return false;
  }
  await refreshSubagentTerminalHistory({
    expectedToolCallIds: runtimeToolCallIds(
      runtimeState.runs[runId] ?? null,
      sessionId,
      runId,
    ),
    instanceId,
    isCancelled: () => false,
    messageQueryKey,
    queryClient,
    sessionId,
    taskId,
  });
  void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "subagents"] });
  void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
  return true;
}

async function refreshSubagentTerminalHistory({
  expectedToolCallIds,
  instanceId,
  isCancelled,
  messageQueryKey,
  queryClient,
  sessionId,
  taskId,
}: {
  expectedToolCallIds: string[];
  instanceId: string;
  isCancelled: () => boolean;
  messageQueryKey: readonly unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
  sessionId: string;
  taskId: string;
}): Promise<void> {
  if (expectedToolCallIds.length === 0) {
    try {
      const latestMessages = await listScopedAgentMessages(
        sessionId,
        instanceId,
        taskId,
      );
      if (!isCancelled()) {
        queryClient.setQueryData(messageQueryKey, latestMessages);
      }
    } catch {
      if (!isCancelled()) {
        void queryClient.invalidateQueries({ queryKey: messageQueryKey });
      }
    }
    return;
  }

  try {
    const latestMessages = await listScopedAgentMessages(
      sessionId,
      instanceId,
      taskId,
    );
    if (isCancelled()) {
      return;
    }
    if (agentMessagesHaveExpectedToolCalls(latestMessages, expectedToolCallIds)) {
      queryClient.setQueryData(messageQueryKey, latestMessages);
    }
  } catch {
    if (!isCancelled()) {
      void queryClient.invalidateQueries({ queryKey: messageQueryKey });
    }
  }
}

function runtimeToolCallIds(
  runState: RuntimeRunState | null,
  sessionId: string,
  runId: string,
): string[] {
  if (runState === null) {
    return [];
  }
  const toolCallIds = new Set<string>();
  for (const entry of runState.entries) {
    if (!runtimeEntryMatchesSubagentRun(entry, sessionId, runId)) {
      continue;
    }
    const payload = jsonObject(entry.payload);
    const toolCallId = jsonString(payload?.tool_call_id);
    if (toolCallId !== null) {
      toolCallIds.add(toolCallId);
    }
  }
  return Array.from(toolCallIds);
}

function runtimeInstanceId(runState: RuntimeRunState | undefined): string {
  if (runState === undefined) {
    return "";
  }
  for (const entry of runState.entries) {
    const instanceId = entry.instanceId?.trim() ?? "";
    if (instanceId.length > 0) {
      return instanceId;
    }
  }
  return "";
}

function runtimeEntryMatchesSubagentRun(
  entry: TimelineEntry,
  sessionId: string,
  runId: string,
): boolean {
  return (
    entry.kind === "tool_call" &&
    entry.sessionId === sessionId &&
    entry.runId === runId
  );
}

function agentMessagesHaveExpectedToolCalls(
  messages: TimelineMessage[],
  expectedToolCallIds: string[],
): boolean {
  const availableToolCallIds = new Set<string>();
  for (const message of messages) {
    for (const part of timelineMessageParts(message)) {
      const toolCallId = persistedToolCallId(part);
      if (toolCallId !== null) {
        availableToolCallIds.add(toolCallId);
      }
    }
  }
  return expectedToolCallIds.every((toolCallId) =>
    availableToolCallIds.has(toolCallId),
  );
}

function subagentTaskMessages({
  messages,
  promptText,
  scopeToTask,
  taskId,
}: {
  messages: TimelineMessage[];
  promptText: string;
  scopeToTask: boolean;
  taskId: string;
}): TimelineMessage[] {
  const normalizedTaskId = taskId.trim() || latestMessageTaskId(messages);
  const scopedMessages = normalizedTaskId.length === 0 || !scopeToTask
    ? messages
    : messages.filter(
        (message) => message.task_id?.trim() === normalizedTaskId,
      );
  const normalizedPrompt = promptText.trim();
  if (
    normalizedPrompt.length === 0 ||
    scopedMessages.some(
      (message) =>
        message.role?.trim().toLowerCase() === "user" &&
        timelineMessageText(message) === normalizedPrompt,
    )
  ) {
    return scopedMessages;
  }
  return [
    {
      content: normalizedPrompt,
      role: "user",
      task_id: normalizedTaskId || undefined,
    },
    ...scopedMessages,
  ];
}

function timelineMessageText(message: TimelineMessage): string {
  const directText = message.content?.trim() || message.message?.content?.trim();
  if (directText !== undefined && directText.length > 0) {
    return directText;
  }
  return timelineMessageParts(message)
    .map((part) =>
      "text" in part && typeof part.text === "string" ? part.text : ""
    )
    .join("")
    .trim();
}

function latestMessageTaskId(messages: TimelineMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const taskId = messages[index]?.task_id?.trim() ?? "";
    if (taskId.length > 0) {
      return taskId;
    }
  }
  return "";
}

function timelineMessageParts(message: TimelineMessage): ContentPart[] {
  return [
    ...(message.message?.parts ?? []),
    ...(message.parts ?? []),
  ];
}

function persistedToolCallId(part: ContentPart): string | null {
  const kind = "kind" in part ? part.kind : null;
  const partKind = "part_kind" in part ? part.part_kind : null;
  if (kind !== "tool-call" && partKind !== "tool-call") {
    return null;
  }
  return "tool_call_id" in part ? jsonString(part.tool_call_id) : null;
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

function matchingSubagentFromRecords(
  records: Awaited<ReturnType<typeof listSessionSubagents>> | undefined,
  subagent: ActiveSubagentSession,
): ActiveSubagentSession | null {
  const normalized = (records ?? [])
    .map((record) => normalizeSessionSubagent(record, subagent.sessionId))
    .filter((record): record is ActiveSubagentSession => record !== null);
  const runId = subagent.runId.trim();
  const instanceId = subagent.instanceId.trim();
  const taskId = subagent.taskId?.trim() ?? "";
  if (taskId.length > 0) {
    const taskMatches = normalized.filter((record) => record.taskId === taskId);
    const compatibleTaskMatches = taskMatches.filter((record) =>
      subagentRecordMatchesKnownIdentity(record, instanceId, runId),
    );
    return compatibleTaskMatches.length === 1
      ? compatibleTaskMatches[0] ?? null
      : null;
  }
  if (instanceId.length > 0) {
    const instanceMatches = normalized.filter(
      (record) => record.instanceId === instanceId,
    );
    const compatibleInstanceMatches = instanceMatches.filter((record) =>
      subagentRecordMatchesKnownIdentity(record, instanceId, runId),
    );
    if (compatibleInstanceMatches.length === 1) {
      return compatibleInstanceMatches[0] ?? null;
    }
    if (instanceMatches.length > 0) {
      return null;
    }
  }
  const runMatches = normalized.filter(
    (record) => runId.length > 0 && record.runId === runId,
  );
  if (runMatches.length === 1) {
    return runMatches[0] ?? null;
  }
  const roleId = subagent.roleId.trim();
  if (roleId.length > 0) {
    const roleMatches = (runId.length > 0 ? runMatches : normalized).filter(
      (record) => record.roleId === roleId,
    );
    if (roleMatches.length === 1) {
      return roleMatches[0] ?? null;
    }
  }
  return runId.length === 0 && instanceId.length === 0 && normalized.length === 1
    ? normalized[0] ?? null
    : null;
}

function subagentRecordMatchesKnownIdentity(
  record: ActiveSubagentSession,
  instanceId: string,
  runId: string,
): boolean {
  return (
    (instanceId.length === 0 || record.instanceId === instanceId) &&
    (runId.length === 0 || record.runId === runId)
  );
}

function mergeSubagentRecordContext(
  record: ActiveSubagentSession,
  source: ActiveSubagentSession,
): ActiveSubagentSession {
  return {
    ...record,
    promptText: firstNonEmpty(record.promptText, source.promptText),
    sourceRunId: firstNonEmpty(record.sourceRunId, source.sourceRunId),
    sourceToolCallId: firstNonEmpty(
      record.sourceToolCallId,
      source.sourceToolCallId,
    ),
    taskId: firstNonEmpty(record.taskId, source.taskId),
    title: firstNonEmpty(record.title, source.title),
  };
}

function subagentWithRuntimeTerminalStatus(
  subagent: ActiveSubagentSession,
  terminalEventType: RunEventType | null,
): ActiveSubagentSession {
  const terminalStatus = terminalStatusForEvent(terminalEventType);
  if (terminalStatus === null) {
    return subagent;
  }
  return {
    ...subagent,
    runPhase: terminalStatus,
    runStatus: terminalStatus,
    status: terminalStatus,
  };
}

function terminalStatusForEvent(eventType: RunEventType | null): string | null {
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

function subagentMessagesQueryKey(
  sessionId: string,
  instanceId: string,
  taskId: string,
): readonly unknown[] {
  if (taskId.length === 0) {
    return ["sessions", sessionId, "agents", instanceId, "messages"] as const;
  }
  return [
    "sessions",
    sessionId,
    "agents",
    instanceId,
    "tasks",
    taskId,
    "messages",
  ] as const;
}

function listScopedAgentMessages(
  sessionId: string,
  instanceId: string,
  taskId: string,
): Promise<TimelineMessage[]> {
  if (taskId.length === 0) {
    return listAgentMessages(sessionId, instanceId);
  }
  return listAgentMessages(sessionId, instanceId, { taskId });
}

function shouldStreamSubagentRun(runId: string, streamStatusKey: string): boolean {
  if (runId.length === 0) {
    return false;
  }
  const statuses = streamStatusKey.split("|");
  if (statuses.some(isTerminalRunStatus)) {
    return false;
  }
  return statuses.some(isStreamingRunStatus);
}

function isStreamingRunStatus(status: string | undefined): boolean {
  switch (status?.trim().toLowerCase()) {
    case "queued":
    case "running":
    case "stopping":
      return true;
    default:
      return false;
  }
}

function isTerminalRunStatus(status: string | undefined): boolean {
  switch (status?.trim().toLowerCase()) {
    case "cancelled":
    case "canceled":
    case "completed":
    case "failed":
    case "paused":
    case "stopped":
      return true;
    default:
      return false;
  }
}

function subagentHasStreamingStatus(subagent: ActiveSubagentSession): boolean {
  return [
    subagent.runPhase,
    subagent.runStatus,
    subagent.status,
  ].some(isStreamingRunStatus);
}

function subagentBadgeClassName(subagent: ActiveSubagentSession): string {
  const status = subagentRawStatus(subagent);
  if (status === "running" || status === "queued" || status === "stopping") {
    return "at-subagent-session-badge is-running";
  }
  if (status === "failed" || status === "error") {
    return "at-subagent-session-badge is-failed";
  }
  if (
    status === "paused" ||
    status === "stopped" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "at-subagent-session-badge is-stopped";
  }
  return "at-subagent-session-badge";
}

function subagentBadgeLabel(
  subagent: ActiveSubagentSession,
  t: Translate,
): string {
  const status = subagentRawStatus(subagent);
  switch (status) {
    case "queued":
      return t("subagentSessionStatusQueued");
    case "running":
      return t("subagentSessionStatusRunning");
    case "stopping":
      return t("subagentSessionStatusStopping");
    case "completed":
      return t("subagentSessionStatusCompleted");
    case "failed":
    case "error":
      return t("subagentSessionStatusFailed");
    case "paused":
      return t("subagentSessionStatusPaused");
    case "cancelled":
    case "canceled":
    case "stopped":
      return t("subagentSessionStatusStopped");
    case "idle":
      return t("subagentSessionStatusIdle");
    default:
      return status;
  }
}

function subagentRawStatus(subagent: ActiveSubagentSession): string {
  return (subagent.runStatus || subagent.status || "idle").trim().toLowerCase();
}

function humanizeRoleId(roleId: string): string {
  return roleId
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function firstNonEmpty(
  first: string | null | undefined,
  second: string | null | undefined,
): string {
  return (first ?? "").trim() || (second ?? "").trim();
}
