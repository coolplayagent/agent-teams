import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
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
