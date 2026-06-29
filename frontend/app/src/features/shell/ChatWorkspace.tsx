import { useEffect, useRef } from "react";

import { Composer } from "../composer/Composer";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { MessageTimeline } from "../timeline/MessageTimeline";
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
  const previousSessionIdRef = useRef(sessionId);

  useEffect(() => {
    if (previousSessionIdRef.current === sessionId) {
      return;
    }
    previousSessionIdRef.current = sessionId;
    runStreamController.clearRunStream();
  }, [runStreamController, sessionId]);

  return (
    <div className="at-chat-view">
      <RecoveryBar
        runStreamController={runStreamController}
        sessionId={sessionId}
      />
      <MessageTimeline sessionId={sessionId} workspaceId={workspaceId ?? null} />
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
