import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "../features/shell/ChatWorkspace";
import type { RunStreamController } from "../runtime/useRunStreamController";

vi.mock("../features/composer/Composer", () => ({
  Composer: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="composer">{sessionId}</div>
  ),
}));

vi.mock("../features/recovery/RecoveryBar", () => ({
  RecoveryBar: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="recovery">{sessionId}</div>
  ),
}));

vi.mock("../features/shell/SessionTokenUsage", () => ({
  SessionTokenUsage: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="token-usage">{sessionId}</div>
  ),
}));

vi.mock("../features/timeline/MessageTimeline", () => ({
  MessageTimeline: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="timeline">{sessionId}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatWorkspace", () => {
  it("clears the active run stream when switching sessions", async () => {
    const runStreamController = createRunStreamController();
    const { rerender } = render(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-1"
      />,
    );

    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-1"
      />,
    );

    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-2"
      />,
    );

    await waitFor(() =>
      expect(runStreamController.clearRunStream).toHaveBeenCalledTimes(1),
    );

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId={null}
      />,
    );

    await waitFor(() =>
      expect(runStreamController.clearRunStream).toHaveBeenCalledTimes(2),
    );
  });

  it("moves every session-scoped surface to the new session during a switch", async () => {
    const runStreamController = createRunStreamController();
    const { rerender } = render(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-1"
        workspaceId="workspace-1"
      />,
    );

    expect(renderedSessionIds()).toEqual({
      composer: "session-1",
      recovery: "session-1",
      timeline: "session-1",
      tokenUsage: "session-1",
    });

    rerender(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-2"
        workspaceId="workspace-2"
      />,
    );

    await waitFor(() =>
      expect(runStreamController.clearRunStream).toHaveBeenCalledTimes(1),
    );
    expect(renderedSessionIds()).toEqual({
      composer: "session-2",
      recovery: "session-2",
      timeline: "session-2",
      tokenUsage: "session-2",
    });
  });
});

function createRunStreamController(): RunStreamController {
  return {
    activeRunId: null,
    activeRunIds: [],
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    suppressedRunIds: [],
    trackedRunIds: [],
  };
}

function renderedSessionIds(): Record<string, string> {
  return {
    composer: textForTestId("composer"),
    recovery: textForTestId("recovery"),
    timeline: textForTestId("timeline"),
    tokenUsage: textForTestId("token-usage"),
  };
}

function textForTestId(testId: string): string {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (element === null) {
    throw new Error(`Missing test element: ${testId}`);
  }
  return element.textContent ?? "";
}
