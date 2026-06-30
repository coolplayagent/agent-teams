import { Button, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { listAgentMessages } from "../../api/client";
import type { ContentPart, JsonValue, TimelineMessage } from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import type { RuntimeRunState, TimelineEntry } from "../../runtime/reducers";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { useTranslations } from "../../i18n";
import { MessageTimeline } from "../timeline/MessageTimeline";
import type { ActiveSubagentSession } from "./SessionsSidebar";

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
  const runStreamControllerRef = useRef(runStreamController);
  const previouslyTrackedRunRef = useRef(false);
  const runId = subagent.runId.trim();
  const runtimeRunState = useRuntimeStore((state) =>
    runId ? state.runtimeState.runs[runId] ?? null : null,
  );
  const runtimeTerminalEventType = runtimeRunState?.terminalEventType ?? null;
  const displayedSubagent = useMemo(
    () => subagentWithRuntimeTerminalStatus(subagent, runtimeTerminalEventType),
    [runtimeTerminalEventType, subagent],
  );
  const expectedTerminalToolCallIds = useMemo(
    () => runtimeToolCallIds(runtimeRunState, subagent.sessionId, runId),
    [runId, runtimeRunState, subagent.sessionId],
  );
  const expectedTerminalToolCallKey = expectedTerminalToolCallIds.join("|");
  const streamStatusKey = [
    displayedSubagent.status,
    displayedSubagent.runStatus,
    displayedSubagent.runPhase,
  ].join("|");
  const trackedRunIdsKey = runStreamController.trackedRunIds.join("|");
  const messageQueryKey = useMemo(
    () => subagentMessagesQueryKey(subagent.sessionId, subagent.instanceId),
    [subagent.instanceId, subagent.sessionId],
  );
  const loadSubagentMessages = useCallback(
    () => listAgentMessages(subagent.sessionId, subagent.instanceId),
    [subagent.instanceId, subagent.sessionId],
  );
  const title =
    displayedSubagent.title ||
    humanizeRoleId(displayedSubagent.roleId) ||
    displayedSubagent.instanceId;

  useEffect(() => {
    runStreamControllerRef.current = runStreamController;
  }, [runStreamController]);

  useEffect(() => {
    let startedRunStream = false;
    if (
      shouldStreamSubagentRun(runId, streamStatusKey) &&
      !runStreamControllerRef.current.trackedRunIds.includes(runId) &&
      !runStreamControllerRef.current.suppressedRunIds.includes(runId)
    ) {
      runStreamControllerRef.current.startRunStream({
        afterEventId: subagent.lastEventId ?? undefined,
        foreground: true,
        runId,
        sessionId: subagent.sessionId,
      });
      startedRunStream = true;
    }
    return () => {
      if (startedRunStream) {
        runStreamControllerRef.current.clearRunStream();
      }
    };
  }, [runId, streamStatusKey, subagent.lastEventId, subagent.sessionId]);

  useEffect(() => {
    let cancelled = false;
    const tracked = runId.length > 0 && runStreamController.trackedRunIds.includes(runId);
    if (previouslyTrackedRunRef.current && !tracked) {
      void refreshSubagentTerminalHistory({
        expectedToolCallIds: expectedTerminalToolCallIds,
        instanceId: subagent.instanceId,
        isCancelled: () => cancelled,
        messageQueryKey,
        queryClient,
        sessionId: subagent.sessionId,
      }).finally(() => {
        if (cancelled) {
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: ["sessions", subagent.sessionId, "subagents"],
        });
        void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      });
    }
    previouslyTrackedRunRef.current = tracked;
    return () => {
      cancelled = true;
    };
  }, [
    expectedTerminalToolCallIds,
    expectedTerminalToolCallKey,
    subagent.instanceId,
    messageQueryKey,
    queryClient,
    runId,
    subagent.sessionId,
    trackedRunIdsKey,
    runStreamController.trackedRunIds,
  ]);

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
          <span>{displayedSubagent.roleId}</span>
          <span>{displayedSubagent.instanceId}</span>
        </div>
      </header>
      <div className="at-subagent-session-body">
        <MessageTimeline
          emptyDescription={t("subagentSessionEmpty")}
          fallbackRunId={runId}
          loadErrorDescription={t("subagentSessionLoadError")}
          loadMessages={loadSubagentMessages}
          messageQueryKey={messageQueryKey}
          roundsEnabled={false}
          runtimeRunId={runId}
          sessionId={subagent.sessionId}
        />
      </div>
    </div>
  );
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
    void queryClient.invalidateQueries({ queryKey: messageQueryKey });
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
