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
} from "../api/client";
import type { RecoverySnapshot } from "../api/contracts";
import { RecoveryBar } from "../features/recovery/RecoveryBar";
import type { RunStreamController } from "../runtime/useRunStreamController";

vi.mock("../api/client", () => ({
  answerUserQuestion: vi.fn(),
  getRecoverySnapshot: vi.fn(),
  resolveToolApproval: vi.fn(),
  resumeRun: vi.fn(),
}));

const getRecoverySnapshotMock = vi.mocked(getRecoverySnapshot);
const resolveToolApprovalMock = vi.mocked(resolveToolApproval);
const answerUserQuestionMock = vi.mocked(answerUserQuestion);
const resumeRunMock = vi.mocked(resumeRun);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecoveryBar", () => {
  it("resolves pending tool approvals through AG-UI", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
            args_preview: '{"cmd":"npm test"}',
            acp_options: [{ id: "allow_once", kind: "allow_once" }],
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
        "allow_once",
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
      "",
    );
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

function runStreamController(): RunStreamController {
  return {
    activeRunId: null,
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
