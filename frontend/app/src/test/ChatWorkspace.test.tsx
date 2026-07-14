import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "../features/shell/ChatWorkspace";
import type { RunStreamController } from "../runtime/useRunStreamController";

const timelineRenderMock = vi.hoisted(() => vi.fn());

vi.mock("../features/composer/Composer", () => ({
  Composer: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="composer">{sessionId}</div>
  ),
}));

vi.mock("../features/recovery/RecoveryBar", () => ({
  RecoveryBar: ({
    onPausedSubagentChange,
    sessionId,
  }: {
    onPausedSubagentChange?: (
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
    <>
      <div data-testid="recovery">{sessionId}</div>
      {onPausedSubagentChange === undefined ? null : (
        <button
          onClick={() =>
            onPausedSubagentChange(
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
          Publish paused recovery fixture
        </button>
      )}
    </>
  ),
}));

vi.mock("../features/shell/SessionTokenUsage", () => ({
  SessionTokenUsage: ({ sessionId }: { sessionId: string | null }) => (
    <div data-testid="token-usage">{sessionId}</div>
  ),
}));

vi.mock("../features/timeline/MessageTimeline", () => ({
  MessageTimeline: ({
    associatedToolCallId,
    onSubagentOpen,
    pausedSubagent,
    primaryRoleId,
    sessionId,
    toolCallLocateRequest,
    visible,
    workspaceId,
  }: {
    associatedToolCallId?: string | null;
    onSubagentOpen?: (subagent: Record<string, unknown>) => void;
    pausedSubagent?: Record<string, unknown> | null;
    primaryRoleId?: string | null;
    sessionId: string | null;
    toolCallLocateRequest?: { requestId: number; toolCallId: string } | null;
    visible?: boolean;
    workspaceId?: string | null;
  }) => {
    timelineRenderMock(sessionId);
    return (
      <div
        data-primary-role-id={primaryRoleId ?? ""}
        data-testid="timeline"
        data-associated-tool-call-id={associatedToolCallId ?? ""}
        data-locate-request-id={toolCallLocateRequest?.requestId ?? ""}
        data-visible={visible === false ? "false" : "true"}
        data-workspace-id={workspaceId ?? ""}
      >
        {sessionId}
        <details
          className={
            associatedToolCallId === "call-subagent"
              ? "at-message-tool is-associated-subagent"
              : "at-message-tool"
          }
          data-testid="subagent-tool-row"
          data-tool-call-id="call-subagent"
        />
        {pausedSubagent === null || pausedSubagent === undefined ||
            onSubagentOpen === undefined ? null : (
          <button onClick={() => onSubagentOpen(pausedSubagent)} type="button">
            Continue paused subagent
          </button>
        )}
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
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

  it("passes contextual association and one-shot locate requests to the timeline", async () => {
    const props = {
      associatedSubagentToolCallId: "call-subagent",
      primaryRoleId: "MainAgent",
      runStreamController: createRunStreamController(),
      sessionId: "session-1",
    };
    const view = render(<ChatWorkspace {...props} />);
    const toolRow = screen.getByTestId("subagent-tool-row");

    await waitFor(() => expect(toolRow).toHaveClass("is-associated-subagent"));
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-associated-tool-call-id",
      "call-subagent",
    );

    view.rerender(
      <ChatWorkspace
        {...props}
        subagentToolLocateRequest={{
          requestId: 1,
          toolCallId: "call-subagent",
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-locate-request-id",
      "1",
    ));

    view.rerender(
      <ChatWorkspace
        {...props}
        subagentToolLocateRequest={{
          requestId: 1,
          toolCallId: "call-subagent",
        }}
      />,
    );
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-locate-request-id",
      "1",
    );
  });

  it("routes a paused recovery subagent through the shared panel reference", () => {
    const onSubagentOpen = vi.fn();
    const onSubagentContextChange = vi.fn();
    render(
      <ChatWorkspace
        onSubagentContextChange={onSubagentContextChange}
        onSubagentOpen={onSubagentOpen}
        primaryRoleId="MainAgent"
        runStreamController={createRunStreamController()}
        sessionId="session-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Publish paused recovery fixture" }),
    );
    expect(onSubagentContextChange).toHaveBeenCalledWith({
      description: "Waiting for reviewer input",
      instanceId: "paused-instance",
      prompt: "Waiting for reviewer input",
      roleId: "reviewer",
      runPhase: "awaiting_subagent_followup",
      runStatus: "paused",
      sessionId: "session-1",
      sourceRunId: "parent-run",
      status: "paused",
      taskId: "paused-task",
      title: "reviewer",
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue paused subagent" }));

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
      taskId: "paused-task",
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
      timeline: "session-2",
      tokenUsage: "session-2",
    });
    await waitFor(() =>
      expect(runStreamController.setForegroundSessionId).toHaveBeenLastCalledWith(
        "session-2",
      ),
    );
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("switches the timeline without an artificial loading frame", () => {
    const runStreamController = createRunStreamController();
    const view = render(
      <ChatWorkspace
        primaryRoleId="MainAgent"
        runStreamController={runStreamController}
        sessionId="session-a"
      />,
    );

    view.rerender(
      <ChatWorkspace
        primaryRoleId="Reviewer"
        runStreamController={runStreamController}
        sessionId="session-b"
      />,
    );

    expect(renderedSessionIds()).toEqual({
      composer: "session-b",
      recovery: "session-b",
      timeline: "session-b",
      tokenUsage: "session-b",
    });
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-visible", "true");
    expect(screen.queryByRole("status")).toBeNull();
    expect(runStreamController.clearRunStream).not.toHaveBeenCalled();
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
