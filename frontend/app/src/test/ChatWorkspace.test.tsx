import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  it("moves the active run foreground without closing the stream when switching sessions", async () => {
    const runStreamController = createRunStreamController();
    const { rerender } = render(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-1"
      />,
    );

    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
    expect(runStreamController.setForegroundSessionId).toHaveBeenCalledTimes(1);
    expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith("session-1");

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-1"
      />,
    );

    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
    expect(runStreamController.setForegroundSessionId).toHaveBeenCalledTimes(1);

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-2"
      />,
    );

    await waitFor(() =>
      expect(runStreamController.setForegroundSessionId).toHaveBeenCalledTimes(2),
    );
    expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith("session-2");
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();

    rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId={null}
      />,
    );

    await waitFor(() =>
      expect(runStreamController.setForegroundSessionId).toHaveBeenCalledTimes(3),
    );
    expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith(null);
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
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
      expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith(
        "session-2",
      ),
    );
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
    expect(renderedSessionIds()).toEqual({
      composer: "session-2",
      recovery: "session-2",
      timeline: "session-2",
      tokenUsage: "session-2",
    });
  });

  it("keeps a loading frame visible while a fast session switch settles", async () => {
    const animationFrame = captureAnimationFrames();
    const runStreamController = createRunStreamController();

    try {
      const { rerender } = render(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-1"
          workspaceId="workspace-1"
        />,
      );

      rerender(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-2"
          workspaceId="workspace-2"
        />,
      );

      const chatView = htmlElement(
        screen.getByTestId("timeline").closest(".at-chat-view"),
        "chat view",
      );
      expect(chatView).toHaveClass("is-session-switching");
      expect(chatView).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Loading session...");
      expect(renderedSessionIds()).toEqual({
        composer: "session-2",
        recovery: "session-2",
        timeline: "session-2",
        tokenUsage: "session-2",
      });

      await act(async () => {
        animationFrame.flushNext();
      });
      expect(screen.getByRole("status")).toHaveTextContent("Loading session...");
      expect(chatView).toHaveClass("is-session-switching");

      await act(async () => {
        animationFrame.flushNext();
      });

      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(chatView).not.toHaveClass("is-session-switching");
      expect(chatView).not.toHaveAttribute("aria-busy");
    } finally {
      animationFrame.restore();
    }
  });

  it("shows a loading frame for same-session content activation without clearing streams", async () => {
    const animationFrame = captureAnimationFrames();
    const runStreamController = createRunStreamController();

    try {
      const { rerender } = render(
        <ChatWorkspace
          contentLoadingKey={0}
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-1"
          workspaceId="workspace-1"
        />,
      );

      rerender(
        <ChatWorkspace
          contentLoadingKey={1}
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-1"
          workspaceId="workspace-1"
        />,
      );

      const chatView = htmlElement(
        screen.getByTestId("timeline").closest(".at-chat-view"),
        "chat view",
      );
      expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
      expect(chatView).toHaveClass("is-session-switching");
      expect(chatView).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Loading session...");
      expect(renderedSessionIds()).toEqual({
        composer: "session-1",
        recovery: "session-1",
        timeline: "session-1",
        tokenUsage: "session-1",
      });

      await act(async () => {
        animationFrame.flushNext();
        animationFrame.flushNext();
      });

      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(chatView).not.toHaveClass("is-session-switching");
      expect(chatView).not.toHaveAttribute("aria-busy");
    } finally {
      animationFrame.restore();
    }
  });
});

function createRunStreamController(): RunStreamController {
  return {
    activeRunId: null,
    activeRunIds: [],
    clearRunStream: vi.fn(),
    setForegroundSessionId: vi.fn(),
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

interface CapturedAnimationFrames {
  readonly flushNext: () => void;
  readonly restore: () => void;
}

function captureAnimationFrames(): CapturedAnimationFrames {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let frameId = 0;

  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    frameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  window.cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });

  return {
    flushNext: () => {
      const next = callbacks.entries().next();
      if (next.done === true) {
        throw new Error("No animation frame is pending.");
      }
      const [id, callback] = next.value;
      callbacks.delete(id);
      callback(16);
    },
    restore: () => {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    },
  };
}

function htmlElement(element: Element | null, label: string): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing ${label}.`);
  }
  return element;
}
