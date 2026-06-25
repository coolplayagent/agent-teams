import { Button, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { listAgentMessages } from "../../api/client";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { useTranslations } from "../../i18n";
import { MessageTimeline } from "../timeline/MessageTimeline";
import type { ActiveSubagentSession } from "./SessionsSidebar";

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
  const streamStatusKey = [
    subagent.status,
    subagent.runStatus,
    subagent.runPhase,
  ].join("|");
  const trackedRunIdsKey = runStreamController.trackedRunIds.join("|");
  const messageQueryKey = useMemo(
    () => subagentMessagesQueryKey(subagent.sessionId, subagent.instanceId),
    [subagent.instanceId, subagent.sessionId],
  );
  const title = subagent.title || humanizeRoleId(subagent.roleId) || subagent.instanceId;

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
    const tracked = runId.length > 0 && runStreamController.trackedRunIds.includes(runId);
    if (previouslyTrackedRunRef.current && !tracked) {
      void queryClient.invalidateQueries({ queryKey: messageQueryKey });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", subagent.sessionId, "subagents"],
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    }
    previouslyTrackedRunRef.current = tracked;
  }, [
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
          <span className={subagentBadgeClassName(subagent)}>
            {subagent.runStatus || subagent.status || "idle"}
          </span>
        </div>
        <div className="at-subagent-session-meta">
          <span>{t("subagentSessionReadOnly")}</span>
          <span>{subagent.roleId}</span>
          <span>{subagent.instanceId}</span>
        </div>
      </header>
      <div className="at-subagent-session-body">
        <MessageTimeline
          emptyDescription={t("subagentSessionEmpty")}
          fallbackRunId={runId}
          loadErrorDescription={t("subagentSessionLoadError")}
          loadMessages={() => listAgentMessages(subagent.sessionId, subagent.instanceId)}
          messageQueryKey={messageQueryKey}
          roundsEnabled={false}
          runtimeRunId={runId}
          sessionId={subagent.sessionId}
        />
      </div>
    </div>
  );
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
  if (status === "stopped" || status === "cancelled" || status === "canceled") {
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
