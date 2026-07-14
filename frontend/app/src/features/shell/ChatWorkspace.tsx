import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import { Composer } from "../composer/Composer";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { MessageTimeline } from "../timeline/MessageTimeline";
import type { TimelineSubagentReference } from "../timeline/MessageTimeline";
import type {
  RecoveryPausedSubagent,
  RecoveryRun,
  PendingUserQuestion,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { SessionTokenUsage } from "./SessionTokenUsage";

interface ChatWorkspaceProps {
  associatedSubagentToolCallId?: string | null;
  latestTerminalRunId?: string | null;
  latestTerminalRunStatus?: string | null;
  onSubagentContextChange?: (
    subagent: TimelineSubagentReference | null,
  ) => void;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  subagentToolLocateRequest?: SubagentToolLocateRequest | null;
  primaryRoleId: string | null;
  runStreamController: RunStreamController;
  sessionId: string | null;
  visible?: boolean;
  workspaceId?: string | null;
}

export interface SubagentToolLocateRequest {
  requestId: number;
  toolCallId: string;
}

export const ChatWorkspace = memo(function ChatWorkspace({
  associatedSubagentToolCallId = null,
  latestTerminalRunId = null,
  latestTerminalRunStatus = null,
  onSubagentContextChange,
  onSubagentOpen,
  primaryRoleId,
  runStreamController,
  sessionId,
  subagentToolLocateRequest = null,
  visible = true,
  workspaceId,
}: ChatWorkspaceProps) {
  const [pausedSubagentReference, setPausedSubagentReference] =
    useState<TimelineSubagentReference | null>(null);

  useEffect(() => {
    setPausedSubagentReference(null);
  }, [sessionId]);

  const handlePausedSubagentChange = useCallback((
    pausedSubagent: RecoveryPausedSubagent | null,
    activeRun: RecoveryRun | null,
  ) => {
    const nextReference = sessionId === null || pausedSubagent === null
      ? null
      : pausedSubagentTimelineReference(sessionId, pausedSubagent, activeRun);
    setPausedSubagentReference((current) =>
      timelineSubagentReferencesEqual(current, nextReference)
        ? current
        : nextReference
    );
  }, [sessionId]);

  useEffect(() => {
    onSubagentContextChange?.(pausedSubagentReference);
  }, [onSubagentContextChange, pausedSubagentReference]);

  useLayoutEffect(() => {
    runStreamController.setForegroundSessionId(sessionId);
  }, [runStreamController, sessionId]);

  return (
    <div className="at-chat-view">
      <MessageTimeline
        associatedToolCallId={associatedSubagentToolCallId}
        fallbackRunId={runStreamController.activeRunId}
        latestTerminalRunId={latestTerminalRunId}
        latestTerminalRunStatus={latestTerminalRunStatus}
        onSubagentOpen={onSubagentOpen}
        pausedSubagent={pausedSubagentReference}
        primaryRoleId={primaryRoleId}
        sessionId={sessionId}
        toolCallLocateRequest={subagentToolLocateRequest}
        visible={visible}
        workspaceId={workspaceId ?? null}
      />
      <RecoveryBar
        onPendingSubagentQuestionOpen={
          onSubagentOpen === undefined || sessionId === null
            ? undefined
            : (question) => onSubagentOpen(
                pendingQuestionTimelineReference(sessionId, question),
              )
        }
        onPausedSubagentChange={handlePausedSubagentChange}
        runStreamController={runStreamController}
        sessionId={sessionId}
        visible={visible}
      />
      <SessionTokenUsage
        primaryRoleId={primaryRoleId}
        sessionId={sessionId}
      />
      <Composer
        runStreamController={runStreamController}
        sessionId={sessionId}
      />
    </div>
  );
});

function pendingQuestionTimelineReference(
  sessionId: string,
  question: PendingUserQuestion,
): TimelineSubagentReference {
  const instanceId = question.instance_id?.trim() ?? "";
  const roleId = question.role_id?.trim() ?? "";
  const prompt = question.questions.map((item) => item.question).join("\n");
  return {
    description: prompt,
    instanceId,
    prompt,
    roleId,
    runId: question.run_id,
    runPhase: "awaiting_manual_action",
    runStatus: "paused",
    sessionId,
    sourceRunId: question.run_id,
    status: "paused",
    title: roleId || instanceId || "Subagent",
  };
}

function pausedSubagentTimelineReference(
  sessionId: string,
  pausedSubagent: RecoveryPausedSubagent,
  activeRun: RecoveryRun | null,
): TimelineSubagentReference {
  const instanceId = pausedSubagent.instance_id?.trim() ?? "";
  const roleId = pausedSubagent.role_id?.trim() ?? "";
  const detail = pausedSubagent.reason?.trim() ?? "";
  return {
    description: detail,
    instanceId,
    prompt: detail,
    roleId,
    runPhase: activeRun?.phase?.trim() || "awaiting_subagent_followup",
    runStatus: "paused",
    sessionId,
    sourceRunId: activeRun?.run_id,
    status: "paused",
    taskId: pausedSubagent.task_id?.trim() ?? "",
    title: roleId || instanceId || "Subagent",
  };
}

function timelineSubagentReferencesEqual(
  left: TimelineSubagentReference | null,
  right: TimelineSubagentReference | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return left.instanceId === right.instanceId &&
    left.roleId === right.roleId &&
    left.runPhase === right.runPhase &&
    left.runStatus === right.runStatus &&
    left.sessionId === right.sessionId &&
    left.sourceRunId === right.sourceRunId &&
    left.status === right.status &&
    left.taskId === right.taskId &&
    left.title === right.title &&
    left.description === right.description;
}
