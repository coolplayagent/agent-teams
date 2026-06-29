import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Composer } from "../composer/Composer";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { MessageTimeline } from "../timeline/MessageTimeline";
import { useTranslations } from "../../i18n";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { SessionTokenUsage } from "./SessionTokenUsage";

interface ChatWorkspaceProps {
  primaryRoleId: string | null;
  runStreamController: RunStreamController;
  sessionId: string | null;
  workspaceId?: string | null;
}

export function ChatWorkspace({
  primaryRoleId,
  runStreamController,
  sessionId,
  workspaceId,
}: ChatWorkspaceProps) {
  const t = useTranslations();
  const previousSessionIdRef = useRef(sessionId);
  const switchFrameRef = useRef<SessionSwitchFrame | null>(null);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      cancelSessionSwitchFrame(switchFrameRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousSessionIdRef.current === sessionId) {
      return;
    }
    previousSessionIdRef.current = sessionId;
    runStreamController.clearRunStream();
    cancelSessionSwitchFrame(switchFrameRef.current);
    switchFrameRef.current = null;

    if (sessionId === null) {
      setSwitchingSessionId(null);
      return;
    }

    setSwitchingSessionId(sessionId);
    switchFrameRef.current = scheduleSessionSwitchFrame(() => {
      switchFrameRef.current = null;
      setSwitchingSessionId((currentSessionId) =>
        currentSessionId === sessionId ? null : currentSessionId,
      );
    });
  }, [runStreamController, sessionId]);

  const switching = sessionId !== null && switchingSessionId === sessionId;

  return (
    <div
      aria-busy={switching ? "true" : undefined}
      className={switching ? "at-chat-view is-session-switching" : "at-chat-view"}
    >
      <RecoveryBar
        runStreamController={runStreamController}
        sessionId={sessionId}
      />
      <MessageTimeline sessionId={sessionId} workspaceId={workspaceId ?? null} />
      {switching ? (
        <div className="at-session-switch-loading" role="status">
          {t("sessionSwitchLoading")}
        </div>
      ) : null}
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
