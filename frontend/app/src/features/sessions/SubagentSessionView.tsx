import { Button, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listAgentMessages, listSessionSubagents } from "../../api/client";
import type { ContentPart, JsonValue, TimelineMessage } from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import type { RuntimeRunState, RuntimeState, TimelineEntry } from "../../runtime/reducers";
import {
  openSessionSubagentRunStream,
  type RunStreamHandle,
} from "../../runtime/streamClient";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { useTranslations } from "../../i18n";
import { MarkdownMessage } from "../timeline/MarkdownMessage";
import { MessageTimeline } from "../timeline/MessageTimeline";
import {
  normalizeSessionSubagent,
  type ActiveSubagentSession,
} from "./SessionsSidebar";

const SUBAGENT_TERMINAL_SETTLE_DELAY_MS = 80;
const SUBAGENT_TERMINAL_SETTLE_MAX_ATTEMPTS = 3;

interface SubagentSessionViewProps {
  subagent: ActiveSubagentSession;
  onBack: () => void;
  runStreamController: RunStreamController;
}

export function SubagentSessionView({
  onBack,
  runStreamController,
  subagent,
}: SubagentSessionViewProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const runtimeStateRef = useRef(runtimeState);
  const latestStreamTargetRef = useRef<SubagentStreamTarget | null>(null);
  const subagentStreamRef = useRef<RunStreamHandle | null>(null);
  const streamedRunIdRef = useRef<string | null>(null);
  const [pollSubagentRecord, setPollSubagentRecord] = useState(
    () => subagentHasStreamingStatus(subagent),
  );
  const subagentRecordsQuery = useQuery({
    queryKey: ["sessions", subagent.sessionId, "subagents"],
    queryFn: () => listSessionSubagents(subagent.sessionId, true),
    enabled: subagent.sessionId.trim().length > 0,
    refetchInterval: pollSubagentRecord ? 2000 : false,
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
  const instanceId = recordAwareSubagent.instanceId.trim();
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
  const shouldShowSubagentPrompt = subagentPromptText.length > 0;
  const streamStatusKey = [
    displayedSubagent.status,
    displayedSubagent.runStatus,
    displayedSubagent.runPhase,
  ].join("|");
  const hasMessageHistoryTarget = instanceId.length > 0;
  const canRenderTimeline = hasMessageHistoryTarget || runId.length > 0;
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
    ),
    [hasMessageHistoryTarget, instanceId, runId, sessionId, title],
  );
  const loadSubagentMessages = useCallback(
    () => (
      hasMessageHistoryTarget
        ? listAgentMessages(sessionId, instanceId)
        : Promise.resolve([])
    ),
    [hasMessageHistoryTarget, instanceId, sessionId],
  );

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(() => {
    latestStreamTargetRef.current = {
      instanceId,
      messageQueryKey,
      queryClient,
      sessionId,
    };
  }, [instanceId, messageQueryKey, queryClient, sessionId]);

  useEffect(() => {
    setPollSubagentRecord(subagentHasStreamingStatus(subagent));
  }, [
    subagent.instanceId,
    subagent.runId,
    subagent.runPhase,
    subagent.runStatus,
    subagent.sessionId,
    subagent.status,
  ]);

  useEffect(() => {
    if (
      latestSubagentRecord !== null &&
      !subagentHasStreamingStatus(latestSubagentRecord)
    ) {
      setPollSubagentRecord(false);
    }
  }, [latestSubagentRecord]);

  useEffect(() => {
    if (!shouldStreamSubagentRun(runId, streamStatusKey)) {
      return;
    }
    if (streamedRunIdRef.current === runId) {
      return;
    }
    subagentStreamRef.current?.close();
    streamedRunIdRef.current = runId;
    const currentRuntimeState = runtimeStateRef.current;
    const streamHandle = openSessionSubagentRunStream({
      afterEventId: currentRuntimeState.runs[runId]?.lastEventId ?? 0,
      initialState: currentRuntimeState,
      onClosed: (closedRuntimeState) => {
        const displayRuntimeState = subagentClosedRuntimeStateForDisplay({
          closedRuntimeState,
          currentRuntimeState: runtimeStateRef.current,
          runId,
        });
        runtimeStateRef.current = displayRuntimeState;
        setRuntimeState(displayRuntimeState);
        if (streamedRunIdRef.current === runId) {
          streamedRunIdRef.current = null;
          subagentStreamRef.current = null;
        }
        const latestTarget = latestStreamTargetRef.current;
        if (latestTarget === null) {
          return;
        }
        const terminalInstanceId =
          latestTarget.instanceId.trim() ||
          runtimeInstanceId(closedRuntimeState.runs[runId]);
        void refreshSubagentTerminalHistoryFromRuntime({
          instanceId: terminalInstanceId,
          messageQueryKey: latestTarget.messageQueryKey,
          queryClient: latestTarget.queryClient,
          runId,
          runtimeState: displayRuntimeState,
          sessionId: latestTarget.sessionId,
        });
      },
      onError: () => {
        if (streamedRunIdRef.current === runId) {
          streamedRunIdRef.current = null;
          subagentStreamRef.current = null;
        }
      },
      onState: (nextRuntimeState) => {
        if (nextRuntimeState.runs[runId]?.status === "closed") {
          runtimeStateRef.current = subagentClosedRuntimeStateForDisplay({
            closedRuntimeState: nextRuntimeState,
            currentRuntimeState: runtimeStateRef.current,
            runId,
          });
          return;
        }
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
      },
      runId,
      sessionId,
    });
    subagentStreamRef.current = streamHandle;
  }, [runId, sessionId, setRuntimeState, streamStatusKey]);

  useEffect(() => {
    return () => {
      if (streamedRunIdRef.current === runId) {
        subagentStreamRef.current?.close();
        subagentStreamRef.current = null;
        streamedRunIdRef.current = null;
      }
    };
  }, [runId, sessionId]);

  useEffect(() => {
    return () => {
      subagentStreamRef.current?.close();
      subagentStreamRef.current = null;
      streamedRunIdRef.current = null;
    };
  }, []);

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
          <span className={subagentBadgeClassName(displayedSubagent)}>
            {displayedSubagent.runStatus || displayedSubagent.status || "idle"}
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
        {shouldShowSubagentPrompt ? (
          <div className="at-subagent-session-prompt">
            <MarkdownMessage text={subagentPromptText} />
          </div>
        ) : null}
        {canRenderTimeline ? (
          <MessageTimeline
            emptyDescription={t("subagentSessionEmpty")}
            emptyFallback={
              subagentWaitingForOutput ? (
                <SubagentPendingState label={t("subagentSessionWaiting")} />
              ) : undefined
            }
            fallbackRunId={runId}
            loadErrorDescription={t("subagentSessionLoadError")}
            loadMessages={loadSubagentMessages}
            messageQueryKey={messageQueryKey}
            roundsEnabled={false}
            runtimeRunId={runId}
            sessionId={sessionId}
            variant="subagent-panel"
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
}

function subagentClosedRuntimeStateForDisplay({
  closedRuntimeState,
  currentRuntimeState,
  runId,
}: {
  closedRuntimeState: RuntimeState;
  currentRuntimeState: RuntimeState;
  runId: string;
}): RuntimeState {
  const closedRun = closedRuntimeState.runs[runId];
  const currentRun = currentRuntimeState.runs[runId];
  if (closedRun === undefined || currentRun === undefined) {
    return closedRuntimeState;
  }
  const mergedEntries = mergeTimelineEntries(currentRun.entries, closedRun.entries);
  if (mergedEntries.length === closedRun.entries.length) {
    return closedRuntimeState;
  }
  return {
    ...closedRuntimeState,
    runs: {
      ...closedRuntimeState.runs,
      [runId]: {
        ...closedRun,
        entries: mergedEntries,
        lastEventId: Math.max(closedRun.lastEventId, currentRun.lastEventId),
        scope: "subagent",
      },
    },
  };
}

function mergeTimelineEntries(
  currentEntries: TimelineEntry[],
  closedEntries: TimelineEntry[],
): TimelineEntry[] {
  const entriesById = new Map<string, TimelineEntry>();
  for (const entry of currentEntries) {
    entriesById.set(entry.id, entry);
  }
  for (const entry of closedEntries) {
    entriesById.set(entry.id, entry);
  }
  return Array.from(entriesById.values()).sort(
    (left, right) => left.eventId - right.eventId,
  );
}

async function refreshSubagentTerminalHistoryFromRuntime({
  instanceId,
  messageQueryKey,
  queryClient,
  runId,
  runtimeState,
  sessionId,
}: {
  instanceId: string;
  messageQueryKey: readonly unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
  runId: string;
  runtimeState: RuntimeState;
  sessionId: string;
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
}: {
  expectedToolCallIds: string[];
  instanceId: string;
  isCancelled: () => boolean;
  messageQueryKey: readonly unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
  sessionId: string;
}): Promise<void> {
  if (expectedToolCallIds.length === 0) {
    try {
      const latestMessages = await listAgentMessages(sessionId, instanceId);
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
    let latestMessages: TimelineMessage[] = [];
    for (let attempt = 1; attempt <= SUBAGENT_TERMINAL_SETTLE_MAX_ATTEMPTS; attempt += 1) {
      latestMessages = await listAgentMessages(sessionId, instanceId);
      if (isCancelled()) {
        return;
      }
      if (
        agentMessagesHaveExpectedToolCalls(latestMessages, expectedToolCallIds) ||
        attempt === SUBAGENT_TERMINAL_SETTLE_MAX_ATTEMPTS
      ) {
        queryClient.setQueryData(messageQueryKey, latestMessages);
        return;
      }
      await subagentTerminalSettleDelay();
      if (isCancelled()) {
        return;
      }
    }
  } catch {
    if (!isCancelled()) {
      void queryClient.invalidateQueries({ queryKey: messageQueryKey });
    }
  }
}

function subagentTerminalSettleDelay(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, SUBAGENT_TERMINAL_SETTLE_DELAY_MS);
  });
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
  const roleId = subagent.roleId.trim().toLowerCase();
  for (const record of normalized) {
    if (runId.length > 0 && record.runId === runId) {
      return record;
    }
    if (instanceId.length > 0 && record.instanceId === instanceId) {
      return record;
    }
  }
  if (normalized.length === 1) {
    const onlyRecord = normalized[0];
    if (
      onlyRecord !== undefined &&
      (
        roleId.length === 0 ||
        onlyRecord.roleId.trim().toLowerCase() === roleId
      )
    ) {
      return onlyRecord;
    }
  }
  return null;
}

function mergeSubagentRecordContext(
  record: ActiveSubagentSession,
  source: ActiveSubagentSession,
): ActiveSubagentSession {
  return {
    ...record,
    promptText: firstNonEmpty(record.promptText, source.promptText),
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
): readonly unknown[] {
  return ["sessions", sessionId, "agents", instanceId, "messages"] as const;
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
  const status = (subagent.runStatus || subagent.status).toLowerCase();
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

function humanizeRoleId(roleId: string): string {
  return roleId
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function firstNonEmpty(first: string, second: string): string {
  return first.trim() || second.trim();
}
