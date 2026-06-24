import { Composer } from "../composer/Composer";
import { RecoveryBar } from "../recovery/RecoveryBar";
import { MessageTimeline } from "../timeline/MessageTimeline";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { SessionTokenUsage } from "./SessionTokenUsage";

interface ChatWorkspaceProps {
  primaryRoleId: string | null;
  runStreamController: RunStreamController;
  sessionId: string | null;
}

export function ChatWorkspace({
  primaryRoleId,
  runStreamController,
  sessionId,
}: ChatWorkspaceProps) {
  return (
    <div className="at-chat-view">
      <RecoveryBar
        runStreamController={runStreamController}
        sessionId={sessionId}
      />
      <MessageTimeline sessionId={sessionId} />
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
