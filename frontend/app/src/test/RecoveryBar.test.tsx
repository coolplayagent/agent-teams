import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  answerUserQuestion,
  getRecoverySnapshot,
  resolveToolApproval,
  resumeRun,
  stopBackgroundTask,
} from "../api/client";
import type { RecoverySnapshot } from "../api/contracts";
import { RecoveryBar } from "../features/recovery/RecoveryBar";
import type { RunStreamController } from "../runtime/useRunStreamController";

vi.mock("../api/client", () => ({
  answerUserQuestion: vi.fn(),
  getRecoverySnapshot: vi.fn(),
  resolveToolApproval: vi.fn(),
  resumeRun: vi.fn(),
  stopBackgroundTask: vi.fn(),
}));

const getRecoverySnapshotMock = vi.mocked(getRecoverySnapshot);
const resolveToolApprovalMock = vi.mocked(resolveToolApproval);
const answerUserQuestionMock = vi.mocked(answerUserQuestion);
const resumeRunMock = vi.mocked(resumeRun);
const stopBackgroundTaskMock = vi.mocked(stopBackgroundTask);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecoveryBar", () => {
  it("lets the backend choose the safest ACP approval option", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
            args_preview: '{"cmd":"npm test"}',
            acp_options: [
              { optionId: "allow_always", kind: "allow_always" },
              { optionId: "allow_once", kind: "allow_once" },
            ],
          },
        ],
      }),
    );
    resolveToolApprovalMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    await screen.findByText("execute_command");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(resolveToolApprovalMock).toHaveBeenCalledWith(
        "run-1",
        "tool-call-1",
        "approve",
        undefined,
      ),
    );
  });

  it("resolves explicit ACP approval options with their option ids", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
            acp_options: [
              {
                kind: "allow_always",
                name: "Allow always",
                optionId: "allow_always",
              },
              {
                kind: "reject_once",
                name: "Reject once",
                optionId: "reject_once",
              },
            ],
          },
        ],
      }),
    );
    resolveToolApprovalMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    await screen.findByRole("button", { name: "Allow always" });
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow always" }));

    await waitFor(() =>
      expect(resolveToolApprovalMock).toHaveBeenCalledWith(
        "run-1",
        "tool-call-1",
        "approve",
        "allow_always",
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reject once" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject once" }));

    await waitFor(() =>
      expect(resolveToolApprovalMock).toHaveBeenLastCalledWith(
        "run-1",
        "tool-call-1",
        "deny",
        "reject_once",
      ),
    );
  });

  it("shows approval errors locally and clears them before retrying", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
          },
        ],
      }),
    );
    resolveToolApprovalMock
      .mockRejectedValueOnce(new Error("approval unavailable"))
      .mockResolvedValueOnce({ status: "ok" });

    renderRecoveryBar();

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await screen.findByText("approval unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(resolveToolApprovalMock).toHaveBeenCalledTimes(2));
    const approvalItem = screen
      .getByText("execute_command")
      .closest(".at-recovery-item");
    if (!(approvalItem instanceof HTMLElement)) {
      throw new Error("Approval item was not rendered.");
    }
    await waitFor(() =>
      expect(within(approvalItem).queryByText("approval unavailable")).not.toBeInTheDocument(),
    );
  });

  it("submits selected answers for pending user questions", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            question_id: "question-1",
            run_id: "sub-run-1",
            role_id: "Explorer",
            questions: [
              {
                question: "Pick next step",
                options: [{ label: "Go", description: "Continue" }],
                multiple: false,
              },
            ],
          },
        ],
      }),
    );
    answerUserQuestionMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    fireEvent.click(await screen.findByLabelText("Go - Continue"));
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    await waitFor(() =>
      expect(answerUserQuestionMock).toHaveBeenCalledWith(
        "sub-run-1",
        "question-1",
        { answers: [{ selections: [{ label: "Go" }] }] },
      ),
    );
  });

  it("shows pending question busy and error states locally", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            question_id: "question-1",
            run_id: "sub-run-1",
            role_id: "Explorer",
            questions: [
              {
                question: "Pick next step",
                options: [{ label: "Go" }],
                multiple: false,
              },
            ],
          },
        ],
      }),
    );
    const answerDeferred = deferredResponse<{ status: string }>();
    answerUserQuestionMock.mockReturnValueOnce(answerDeferred.promise);

    renderRecoveryBar();

    fireEvent.click(await screen.findByLabelText("Go"));
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Answer" })).toBeDisabled(),
    );
    answerDeferred.reject(new Error("question unavailable"));

    await screen.findByText("question unavailable");
    expect(screen.getByRole("button", { name: "Answer" })).not.toBeDisabled();
  });

  it("hides the reserved question option label and submits supplements", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            question_id: "question-1",
            run_id: "sub-run-1",
            role_id: "Explorer",
            questions: [
              {
                question: "Pick next step",
                options: [
                  { label: "Go", description: "Continue" },
                  { label: "__none_of_the_above__" },
                ],
                multiple: false,
                placeholder: "Describe the next step",
              },
            ],
          },
        ],
      }),
    );
    answerUserQuestionMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    expect(screen.queryByText("__none_of_the_above__")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("Other"));
    fireEvent.change(screen.getByLabelText("Additional answer"), {
      target: { value: "Try a narrower search" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    await waitFor(() =>
      expect(answerUserQuestionMock).toHaveBeenCalledWith(
        "sub-run-1",
        "question-1",
        {
          answers: [
            {
              selections: [
                {
                  label: "__none_of_the_above__",
                  supplement: "Try a narrower search",
                },
              ],
            },
          ],
        },
      ),
    );
  });

  it("resumes a recoverable run from the standalone resume action", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "stopped",
          phase: "stopped",
          last_event_id: 42,
          should_show_recover: true,
        },
      }),
    );
    resumeRunMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
      session_id: "session-1",
    });
    const controller = runStreamController();

    renderRecoveryBar(controller);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
        afterEventId: 42,
      }),
    );
  });

  it("starts a live active run stream from the recovery snapshot", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "running",
          phase: "running",
          last_event_id: 42,
          should_show_recover: false,
        },
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("Run run-1 is running");
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 42,
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("keeps a standalone stopped recoverable run on explicit resume", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "stopped",
          phase: "stopped",
          last_event_id: 42,
          should_show_recover: true,
        },
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByRole("button", { name: "Resume" });
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("starts a multiplex stream for active background subagent recovery", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "running",
          phase: "running",
          last_event_id: 42,
          should_show_recover: false,
        },
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "subagent",
            command: "subagent:reviewer",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
            subagent_run_id: "subagent-run-1",
          },
        ],
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("subagent:reviewer");
    await waitFor(() =>
      expect(controller.startRunStreams).toHaveBeenCalledWith({
        runs: [
          { afterEventId: 42, runId: "run-1" },
          { runId: "subagent-run-1" },
        ],
        sessionId: "session-1",
      }),
    );
    expect(controller.startRunStream).not.toHaveBeenCalled();
  });

  it("keeps recovered multiplex streams active when run ids are reordered", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "running",
          phase: "running",
          last_event_id: 42,
          should_show_recover: false,
        },
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "subagent",
            command: "subagent:reviewer",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
            subagent_run_id: "subagent-run-1",
          },
        ],
      }),
    );
    const controller: RunStreamController = {
      ...runStreamController(),
      activeRunId: "subagent-run-1",
      activeRunIds: ["subagent-run-1", "run-1"],
      trackedRunIds: ["subagent-run-1", "run-1"],
    };

    renderRecoveryBar(controller);

    await screen.findByText("subagent:reviewer");
    expect(controller.startRunStreams).not.toHaveBeenCalled();
    expect(controller.startRunStream).not.toHaveBeenCalled();
  });

  it("keeps a multiplex stream open when active run ids shrink but tracked ids still match recovery targets", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "running",
          phase: "running",
          last_event_id: 42,
          should_show_recover: false,
        },
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "subagent",
            command: "subagent:reviewer",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
            subagent_run_id: "subagent-run-1",
          },
        ],
      }),
    );
    const controller: RunStreamController = {
      ...runStreamController("run-1"),
      trackedRunIds: ["run-1", "subagent-run-1"],
    };

    renderRecoveryBar(controller);

    await screen.findByText("subagent:reviewer");
    expect(controller.startRunStreams).not.toHaveBeenCalled();
    expect(controller.startRunStream).not.toHaveBeenCalled();
  });

  it("resumes a disconnected recoverable run before resolving approval", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "stopped",
          phase: "awaiting_tool_approval",
          last_event_id: 42,
          should_show_recover: true,
        },
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
          },
        ],
      }),
    );
    resumeRunMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
      session_id: "session-1",
    });
    resolveToolApprovalMock.mockResolvedValue({ status: "ok" });
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("execute_command");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
        afterEventId: 42,
      }),
    );
    expect(resolveToolApprovalMock).toHaveBeenCalledWith(
      "run-1",
      "tool-call-1",
      "approve",
      undefined,
    );
  });

  it("resumes a disconnected recoverable run before answering a user question", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "stopped",
          phase: "awaiting_user_question",
          last_event_id: 42,
          should_show_recover: true,
        },
        pending_user_questions: [
          {
            question_id: "question-1",
            run_id: "run-1",
            role_id: "Planner",
            questions: [
              {
                question: "Pick next step",
                options: [{ label: "Continue" }],
                multiple: false,
              },
            ],
          },
        ],
      }),
    );
    resumeRunMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
      session_id: "session-1",
    });
    answerUserQuestionMock.mockResolvedValue({ status: "ok" });
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("Planner needs input");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Continue"));
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        runId: "run-1",
        sessionId: "session-1",
        afterEventId: 42,
      }),
    );
    expect(answerUserQuestionMock).toHaveBeenCalledWith(
      "run-1",
      "question-1",
      { answers: [{ selections: [{ label: "Continue" }] }] },
    );
  });

  it("hides the standalone resume action while the run is already streaming", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "stopped",
          phase: "stopped",
          last_event_id: 42,
          should_show_recover: true,
        },
      }),
    );

    renderRecoveryBar(runStreamController("run-1"));

    await screen.findByText("Run run-1 is stopped");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("shows a paused subagent recovery state instead of a standalone resume action", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "paused",
          phase: "awaiting_subagent_followup",
          last_event_id: 42,
          should_show_recover: true,
        },
        paused_subagent: {
          instance_id: "inst-2",
          role_id: "spec_coder",
          task_id: "task-7",
          reason: "waiting for local follow-up",
        },
      }),
    );

    renderRecoveryBar();

    await screen.findByText("Paused subagent: spec_coder");
    expect(
      screen.getByText("Waiting for follow-up in the paused subagent panel."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("instance: inst-2 | task: task-7 | waiting for local follow-up"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("ignores reserved paused subagent roles from recovery snapshots", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "paused",
          phase: "awaiting_subagent_followup",
          last_event_id: 42,
          should_show_recover: true,
        },
        paused_subagent: {
          instance_id: "main-inst",
          role_id: "MainAgent",
          task_id: "task-main",
        },
      }),
    );

    renderRecoveryBar();

    await screen.findByText("Run run-1 is awaiting_subagent_followup");
    expect(screen.queryByText(/Paused subagent:/)).not.toBeInTheDocument();
  });

  it("shows active background tasks and stops them through the run API", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "command",
            command: "npm run test",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
          },
          {
            background_task_id: "background-task-2",
            run_id: "run-1",
            session_id: "session-1",
            kind: "command",
            command: "completed task",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "completed",
            recent_output: [],
          },
        ],
      }),
    );
    stopBackgroundTaskMock.mockResolvedValue({
      background_task: {
        background_task_id: "background-task-1",
        run_id: "run-1",
        session_id: "session-1",
        kind: "command",
        command: "npm run test",
        cwd: "C:/repo",
        execution_mode: "background",
        status: "stopped",
        recent_output: [],
      },
    });

    renderRecoveryBar();

    await screen.findByText("Background tasks");
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByText("npm run test")).toBeInTheDocument();
    expect(screen.queryByText("completed task")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() =>
      expect(stopBackgroundTaskMock).toHaveBeenCalledWith(
        "run-1",
        "background-task-1",
      ),
    );
  });

  it("shows and tracks background tasks when no active run is registered", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: null,
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "background-run-1",
            session_id: "session-1",
            kind: "command",
            command: "python worker.py",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
          },
        ],
      }),
    );
    stopBackgroundTaskMock.mockResolvedValue({
      background_task: {
        background_task_id: "background-task-1",
        run_id: "background-run-1",
        session_id: "session-1",
        kind: "command",
        command: "python worker.py",
        cwd: "C:/repo",
        execution_mode: "background",
        status: "stopped",
        recent_output: [],
      },
    });
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("Background task is still active");
    expect(screen.getByText("python worker.py")).toBeInTheDocument();
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: undefined,
        runId: "background-run-1",
        sessionId: "session-1",
      }),
    );
    expect(controller.startRunStreams).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() =>
      expect(stopBackgroundTaskMock).toHaveBeenCalledWith(
        "background-run-1",
        "background-task-1",
      ),
    );
  });

  it("collapses and expands the background task list", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "command",
            command: "uv run pytest",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "blocked",
            recent_output: [],
          },
        ],
      }),
    );

    renderRecoveryBar();

    await screen.findByText("uv run pytest");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText("uv run pytest")).not.toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("uv run pytest")).toBeInTheDocument();
  });
});

function renderRecoveryBar(controller = runStreamController()) {
  render(
    <TestProviders>
      <RecoveryBar runStreamController={controller} sessionId="session-1" />
    </TestProviders>,
  );
}

function TestProviders({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

function runStreamController(activeRunId: string | null = null): RunStreamController {
  return {
    activeRunId,
    activeRunIds: activeRunId === null ? [] : [activeRunId],
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    trackedRunIds: activeRunId === null ? [] : [activeRunId],
  };
}

function recoverySnapshot(
  overrides: Partial<RecoverySnapshot> = {},
): RecoverySnapshot {
  return {
    active_run: {
      run_id: "run-1",
      session_id: "session-1",
      status: "paused",
      phase: "awaiting_manual_action",
      last_event_id: 12,
      should_show_recover: false,
    },
    background_tasks: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    paused_subagent: null,
    round_snapshot: null,
    ...overrides,
  };
}

function deferredResponse<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}
