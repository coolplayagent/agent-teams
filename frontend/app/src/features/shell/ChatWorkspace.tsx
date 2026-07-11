import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
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
import { useTranslations } from "../../i18n";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { SessionTokenUsage } from "./SessionTokenUsage";

interface ChatWorkspaceProps {
  contentLoadingKey?: number;
  latestTerminalRunId?: string | null;
  latestTerminalRunStatus?: string | null;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  primaryRoleId: string | null;
  runStreamController: RunStreamController;
  sessionId: string | null;
  visible?: boolean;
  workspaceId?: string | null;
}

const RETAINED_TIMELINE_LIMIT = 2;

export interface RetainedTimelineContext {
  fallbackRunId: string | null;
  latestTerminalRunId: string | null;
  latestTerminalRunStatus: string | null;
  primaryRoleId: string | null;
  sessionId: string;
  workspaceId: string | null;
}

export const ChatWorkspace = memo(function ChatWorkspace({
  contentLoadingKey,
  latestTerminalRunId = null,
  latestTerminalRunStatus = null,
  onSubagentOpen,
  primaryRoleId,
  runStreamController,
  sessionId,
  visible = true,
  workspaceId,
}: ChatWorkspaceProps) {
  const t = useTranslations();
  const previousContentLoadingKeyRef = useRef<number | undefined>(undefined);
  const previousSessionIdRef = useRef(sessionId);
  const switchFrameRef = useRef<SessionSwitchFrame | null>(null);
  const retainedTimelinesRef = useRef(new Map<string, RetainedTimelineContext>());
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);

  const startSessionLoadingFrame = useCallback((nextSessionId: string) => {
    cancelSessionSwitchFrame(switchFrameRef.current);
    switchFrameRef.current = null;
    setSwitchingSessionId(nextSessionId);
    switchFrameRef.current = scheduleSessionSwitchFrame(() => {
      switchFrameRef.current = null;
      setSwitchingSessionId((currentSessionId) =>
        currentSessionId === nextSessionId ? null : currentSessionId,
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelSessionSwitchFrame(switchFrameRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    runStreamController.setForegroundSessionId(sessionId);
    if (previousSessionIdRef.current === sessionId) {
      return;
    }
    previousSessionIdRef.current = sessionId;

    if (sessionId === null) {
      cancelSessionSwitchFrame(switchFrameRef.current);
      switchFrameRef.current = null;
      setSwitchingSessionId(null);
      return;
    }

    startSessionLoadingFrame(sessionId);
  }, [runStreamController, sessionId, startSessionLoadingFrame]);

  useLayoutEffect(() => {
    const previousContentLoadingKey = previousContentLoadingKeyRef.current;
    previousContentLoadingKeyRef.current = contentLoadingKey;
    if (contentLoadingKey === undefined) {
      return;
    }
    const loadingRequested =
      previousContentLoadingKey === undefined
        ? contentLoadingKey > 0
        : previousContentLoadingKey !== contentLoadingKey;
    if (loadingRequested && sessionId !== null) {
      startSessionLoadingFrame(sessionId);
    }
  }, [contentLoadingKey, sessionId, startSessionLoadingFrame]);

  const switching = sessionId !== null && switchingSessionId === sessionId;
  const retainedTimelines = retainedTimelineContexts(
    retainedTimelinesRef.current,
    sessionId === null
      ? null
      : {
          fallbackRunId: runStreamController.activeRunId,
          latestTerminalRunId,
          latestTerminalRunStatus,
          primaryRoleId,
          sessionId,
          workspaceId: workspaceId ?? null,
        },
  );

  return (
    <div
      aria-busy={switching ? "true" : undefined}
      className={switching ? "at-chat-view is-session-switching" : "at-chat-view"}
    >
      {sessionId === null ? (
        <MessageTimeline
          fallbackRunId={runStreamController.activeRunId}
          onSubagentOpen={onSubagentOpen}
          primaryRoleId={primaryRoleId}
          sessionId={null}
          visible={visible && !switching}
          workspaceId={workspaceId ?? null}
        />
      ) : retainedTimelines.map((timeline) => {
        const active = timeline.sessionId === sessionId;
        return (
          <RetainedSessionTimeline
            active={active}
            context={timeline}
            key={timeline.sessionId}
            onSubagentOpen={onSubagentOpen}
            visible={visible && active && !switching}
          />
        );
      })}
      {switching ? (
        <div className="at-session-switch-loading" role="status">
          {t("sessionSwitchLoading")}
        </div>
      ) : null}
      <RecoveryBar
        onPendingSubagentQuestionOpen={
          onSubagentOpen === undefined || sessionId === null
            ? undefined
            : (question) => onSubagentOpen(
                pendingQuestionTimelineReference(sessionId, question),
              )
        }
        onPausedSubagentOpen={
          onSubagentOpen === undefined || sessionId === null
            ? undefined
            : (pausedSubagent, activeRun) =>
                onSubagentOpen(
                  pausedSubagentTimelineReference(
                    sessionId,
                    pausedSubagent,
                    activeRun,
                  ),
                )
        }
        runStreamController={runStreamController}
        sessionId={sessionId}
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

const RetainedSessionTimeline = memo(function RetainedSessionTimeline({
  active,
  context,
  onSubagentOpen,
  visible,
}: {
  active: boolean;
  context: RetainedTimelineContext;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  visible: boolean;
}) {
  return (
    <div
      aria-hidden={active ? undefined : "true"}
      className="at-retained-session-timeline"
      data-session-id={context.sessionId}
      hidden={!active}
    >
      <MessageTimeline
        fallbackRunId={context.fallbackRunId}
        latestTerminalRunId={context.latestTerminalRunId}
        latestTerminalRunStatus={context.latestTerminalRunStatus}
        onSubagentOpen={onSubagentOpen}
        primaryRoleId={context.primaryRoleId}
        runtimeUpdatesEnabled={active}
        sessionId={context.sessionId}
        visible={visible}
        workspaceId={context.workspaceId}
      />
    </div>
  );
});

export function retainedTimelineContexts(
  retained: Map<string, RetainedTimelineContext>,
  current: RetainedTimelineContext | null,
): RetainedTimelineContext[] {
  if (current === null) {
    retained.clear();
    return [];
  }
  const existing = retained.get(current.sessionId);
  const next = existing !== undefined && timelineContextsEqual(existing, current)
    ? existing
    : current;
  retained.delete(current.sessionId);
  retained.set(current.sessionId, next);
  while (retained.size > RETAINED_TIMELINE_LIMIT) {
    const oldestSessionId = retained.keys().next().value;
    if (typeof oldestSessionId !== "string") {
      break;
    }
    retained.delete(oldestSessionId);
  }
  return Array.from(retained.values());
}

function timelineContextsEqual(
  left: RetainedTimelineContext,
  right: RetainedTimelineContext,
): boolean {
  return left.fallbackRunId === right.fallbackRunId &&
    left.latestTerminalRunId === right.latestTerminalRunId &&
    left.latestTerminalRunStatus === right.latestTerminalRunStatus &&
    left.primaryRoleId === right.primaryRoleId &&
    left.sessionId === right.sessionId &&
    left.workspaceId === right.workspaceId;
}

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
    title: roleId || instanceId || "Subagent",
  };
}

interface SessionSwitchFrame {
  cancel: () => void;
}

function scheduleSessionSwitchFrame(onReady: () => void): SessionSwitchFrame {
  if (
    typeof window.requestAnimationFrame === "function" &&
    typeof window.cancelAnimationFrame === "function"
  ) {
    let cancelled = false;
    let readyFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      readyFrameId = window.requestAnimationFrame(() => {
        if (!cancelled) {
          onReady();
        }
      });
    });
    return {
      cancel: () => {
        cancelled = true;
        window.cancelAnimationFrame(firstFrameId);
        if (readyFrameId !== null) {
          window.cancelAnimationFrame(readyFrameId);
        }
      },
    };
  }
  const timeoutId = window.setTimeout(onReady, 24);
  return {
    cancel: () => {
      window.clearTimeout(timeoutId);
    },
  };
}

function cancelSessionSwitchFrame(frame: SessionSwitchFrame | null): void {
  if (frame === null) {
    return;
  }
  frame.cancel();
}
