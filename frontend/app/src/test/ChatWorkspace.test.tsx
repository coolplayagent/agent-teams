import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "../features/shell/ChatWorkspace";
import { useOptimisticRunStore } from "../runtime/optimisticRunStore";
import type { RunStreamController } from "../runtime/useRunStreamController";

const timelineRenderMock = vi.hoisted(() => vi.fn());

vi.mock("../features/composer/Composer", () => ({
  Composer: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="composer">{sessionId}</div>
  ),
}));

vi.mock("../features/recovery/RecoveryBar", () => ({
  RecoveryBar: ({
    onPausedSubagentOpen,
    sessionId,
  }: {
    onPausedSubagentOpen?: (
      pausedSubagent: {
        instance_id?: string;
        reason?: string | null;
        role_id?: string;
        task_id?: string | null;
      },
      activeRun: {
        phase?: string;
        run_id: string;
        session_id: string;
        status: string;
      } | null,
    ) => void;
    sessionId: string | null;
  }) => (
    <div data-testid="recovery">
      {sessionId}
      {onPausedSubagentOpen === undefined ? null : (
        <button
          onClick={() =>
            onPausedSubagentOpen(
              {
                instance_id: "paused-instance",
                reason: "Waiting for reviewer input",
                role_id: "reviewer",
                task_id: "paused-task",
              },
              {
                phase: "awaiting_subagent_followup",
                run_id: "parent-run",
                session_id: sessionId ?? "",
                status: "paused",
              },
            )
          }
          type="button"
        >
          Open paused recovery fixture
        </button>
      )}
    </div>
  ),
}));

vi.mock("../features/shell/SessionTokenUsage", () => ({
  SessionTokenUsage: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="token-usage">{sessionId}</div>
  ),
}));

vi.mock("../features/timeline/MessageTimeline", () => ({
  MessageTimeline: ({
    primaryRoleId,
    sessionId,
    visible,
    workspaceId,
  }: {
    primaryRoleId?: string | null;
    sessionId: string | null;
    visible?: boolean;
    workspaceId?: string | null;
  }) => {
    timelineRenderMock(sessionId);
    return (
      <div
        data-primary-role-id={primaryRoleId ?? ""}
        data-testid="timeline"
        data-visible={visible === false ? "false" : "true"}
        data-workspace-id={workspaceId ?? ""}
      >
        {sessionId}
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  useOptimisticRunStore.setState({ prompts: {} });
  vi.clearAllMocks();
});

describe("ChatWorkspace", () => {
  it("does not rebuild the main timeline for an unrelated parent render", () => {
    const controller = createRunStreamController();
    const props = {
      primaryRoleId: "MainAgent",
      runStreamController: controller,
      sessionId: "session-1",
    };
    const view = render(<ChatWorkspace {...props} />);
    const initialTimelineRenders = timelineRenderMock.mock.calls.length;

    view.rerender(<ChatWorkspace {...props} />);

    expect(timelineRenderMock).toHaveBeenCalledTimes(initialTimelineRenders);
  });

  it("routes a paused recovery subagent through the shared panel reference", () => {
    const onSubagentOpen = vi.fn();
    render(
      <ChatWorkspace
        onSubagentOpen={onSubagentOpen}
        primaryRoleId="MainAgent"
        runStreamController={createRunStreamController()}
        sessionId="session-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open paused recovery fixture" }),
    );

    expect(onSubagentOpen).toHaveBeenCalledWith({
      description: "Waiting for reviewer input",
      instanceId: "paused-instance",
      prompt: "Waiting for reviewer input",
      roleId: "reviewer",
      runPhase: "awaiting_subagent_followup",
      runStatus: "paused",
      sessionId: "session-1",
      sourceRunId: "parent-run",
      status: "paused",
      title: "reviewer",
    });
  });

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

    expect(renderedSessionIds()).toEqual({
      composer: "session-2",
      recovery: "session-2",
      timeline: "session-1",
      tokenUsage: "session-2",
    });
    await waitFor(() =>
      expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith(
        "session-2",
      ),
    );
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
    await waitFor(() => expect(textForTestId("timeline")).toBe("session-2"));
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
      expect(screen.getByTestId("timeline")).toHaveAttribute(
        "data-visible",
        "false",
      );
      expect(renderedSessionIds()).toEqual({
        composer: "session-2",
        recovery: "session-2",
        timeline: "session-1",
        tokenUsage: "session-2",
      });

      await waitFor(() => expect(textForTestId("timeline")).toBe("session-2"));

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
      expect(screen.getByTestId("timeline")).toHaveAttribute(
        "data-visible",
        "true",
      );
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

  it("keeps a newly-created prompt visible while the chat timeline takes ownership", async () => {
    const animationFrame = captureAnimationFrames();
    const runStreamController = createRunStreamController();

    try {
      const view = render(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-1"
        />,
      );
      const promptId = useOptimisticRunStore
        .getState()
        .beginPrompt("session-created", "Keep feedback continuous");
      useOptimisticRunStore
        .getState()
        .confirmPrompt("session-created", promptId, "run-created");

      view.rerender(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-created"
        />,
      );

      expect(screen.getByText("Keep feedback continuous")).toBeVisible();
      expect(screen.getByText("Connecting to the model")).toBeVisible();
      expect(screen.getByTestId("timeline")).toHaveAttribute("data-visible", "false");

      await act(async () => animationFrame.flushNext());
      expect(screen.getByText("Keep feedback continuous")).toBeVisible();
      expect(useOptimisticRunStore.getState().prompts["session-created"])
        .toBeDefined();

      await act(async () => animationFrame.flushNext());
      await waitFor(() => {
        expect(screen.getByTestId("timeline")).toHaveAttribute("data-visible", "true");
      });
      expect(useOptimisticRunStore.getState().prompts["session-created"])
        .toBeDefined();
    } finally {
      animationFrame.restore();
    }
  });

  it("commits only the latest timeline during a rapid A to B to C switch", async () => {
    vi.useFakeTimers();
    const runStreamController = createRunStreamController();
    try {
      const view = render(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-a"
        />,
      );

      view.rerender(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-b"
        />,
      );
      view.rerender(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-c"
        />,
      );

      expect(textForTestId("timeline")).toBe("session-a");
      expect(textForTestId("composer")).toBe("session-c");
      expect(screen.getByRole("status")).toHaveTextContent("Loading session...");

      await act(async () => {
        vi.runOnlyPendingTimers();
      });

      expect(textForTestId("timeline")).toBe("session-c");
      expect(timelineRenderMock).not.toHaveBeenCalledWith("session-b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending timeline handoff on unmount", () => {
    vi.useFakeTimers();
    const runStreamController = createRunStreamController();
    try {
      const view = render(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-a"
        />,
      );
      view.rerender(
        <ChatWorkspace
          primaryRoleId="MainAgent"
          runStreamController={runStreamController}
          sessionId="session-b"
        />,
      );

      view.unmount();
      act(() => vi.runOnlyPendingTimers());

      expect(timelineRenderMock).not.toHaveBeenCalledWith("session-b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates metadata synchronously when the session identity is unchanged", () => {
    const runStreamController = createRunStreamController();
    const view = render(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-a"
        workspaceId="workspace-a"
      />,
    );

    view.rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-a"
        workspaceId="workspace-b"
      />,
    );

    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-primary-role-id",
      "Reviewer",
    );
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-workspace-id",
      "workspace-b",
    );
  });
});

function createRunStreamController(): RunStreamController {
  return {
    activeRunId: null,
    activeRunIds: [],
    clearRunStream: vi.fn(),
    setForegroundSessionId: vi.fn(),
    settleTerminalRunStream: vi.fn(),
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
