import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Composer } from "../composer/Composer";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { MessageTimeline } from "../timeline/MessageTimeline";
import type { TimelineSubagentReference } from "../timeline/MessageTimeline";
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
  workspaceId?: string | null;
}

export function ChatWorkspace({
  contentLoadingKey,
  latestTerminalRunId = null,
  latestTerminalRunStatus = null,
  onSubagentOpen,
  primaryRoleId,
  runStreamController,
  sessionId,
  workspaceId,
}: ChatWorkspaceProps) {
  const t = useTranslations();
  const previousContentLoadingKeyRef = useRef<number | undefined>(undefined);
  const previousSessionIdRef = useRef(sessionId);
  const switchFrameRef = useRef<SessionSwitchFrame | null>(null);
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

  return (
    <div
      aria-busy={switching ? "true" : undefined}
      className={switching ? "at-chat-view is-session-switching" : "at-chat-view"}
    >
      <MessageTimeline
        fallbackRunId={runStreamController.activeRunId}
        latestTerminalRunId={latestTerminalRunId}
        latestTerminalRunStatus={latestTerminalRunStatus}
        onSubagentOpen={onSubagentOpen}
        primaryRoleId={primaryRoleId}
        sessionId={sessionId}
        workspaceId={workspaceId ?? null}
      />
      {switching ? (
        <div className="at-session-switch-loading" role="status">
          {t("sessionSwitchLoading")}
        </div>
      ) : null}
      <RecoveryBar
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
