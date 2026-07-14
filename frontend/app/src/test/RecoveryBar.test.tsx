import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";

import {
  answerUserQuestion,
  getRecoverySnapshot,
  resolveToolApproval,
  resumeRun,
  stopBackgroundTask,
} from "../api/client";
import type { RecoverySnapshot } from "../api/contracts";
import {
  RecoveryBar,
  SubagentQuestionBar,
} from "../features/recovery/RecoveryBar";
import { useUiStore } from "../runtime/uiStore";
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

beforeEach(() => {
  useUiStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  useUiStore.setState({ language: "en" });
  vi.clearAllMocks();
});

describe("RecoveryBar", () => {
  it("does not poll recovery for a hidden idle chat surface", async () => {
    getRecoverySnapshotMock.mockResolvedValue(recoverySnapshot());

    renderRecoveryBar(runStreamController(), undefined, false);

    await act(async () => Promise.resolve());
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps centralized recovery observation active for a hidden tracked run", async () => {
    getRecoverySnapshotMock.mockResolvedValue(recoverySnapshot());

    renderRecoveryBar(runStreamController("run-1"), undefined, false);

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
  });

  it("refreshes recovery from session activity invalidation without business polling", async () => {
    getRecoverySnapshotMock.mockResolvedValue(recoverySnapshot());
    const queryClient = renderRecoveryBar();

    await waitFor(() => expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "recovery"],
      });
    });

    await waitFor(() => expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(2));
  });

  it("accepts a partial recovery snapshot without paused_subagent", async () => {
    const snapshot = recoverySnapshot();
    delete snapshot.paused_subagent;
    getRecoverySnapshotMock.mockResolvedValue(snapshot);

    renderRecoveryBar();

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    expect(screen.queryByText("Subagent paused")).not.toBeInTheDocument();
  });

  it("does not refetch a fresh idle recovery snapshot on repeated focus", async () => {
    getRecoverySnapshotMock.mockResolvedValue(recoverySnapshot());

    renderRecoveryBar();

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));

    await act(async () => Promise.resolve());
    expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(1);
  });

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

  it("submits optional approval feedback with the selected action", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
            acp_options: [
              { kind: "reject_once", name: "Reject once", optionId: "reject_once" },
            ],
          },
        ],
      }),
    );
    resolveToolApprovalMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    fireEvent.change(await screen.findByLabelText("Approval feedback"), {
      target: { value: "Use a read-only command instead." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject once" }));

    await waitFor(() =>
      expect(resolveToolApprovalMock).toHaveBeenCalledWith(
        "run-1",
        "tool-call-1",
        "deny",
        "reject_once",
        "Use a read-only command instead.",
      ),
    );
  });

  it("localizes recovery action prompts in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_tool_approvals: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "execute_command",
          },
        ],
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
              },
            ],
          },
        ],
      }),
    );

    renderRecoveryBar();

    const approvalFeedback = await screen.findByLabelText("审批反馈");
    expect(approvalFeedback).toHaveAttribute("placeholder", "可选审批反馈");
    expect(screen.getByRole("button", { name: /批\s*准/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /拒\s*绝/ })).toBeVisible();

    fireEvent.click(screen.getByLabelText("其他"));
    expect(screen.queryByLabelText("Approval feedback")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Additional answer")).not.toBeInTheDocument();
    const supplement = screen.getByLabelText("补充回答 - 其他");
    expect(supplement).toHaveAttribute("placeholder", "补充说明");
    expect(screen.getByText("Explorer 需要输入")).toBeVisible();
    expect(screen.getByRole("button", { name: /回\s*答/ })).toBeVisible();
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

  it("removes resolved approvals after recovery refresh", async () => {
    getRecoverySnapshotMock
      .mockResolvedValueOnce(
        recoverySnapshot({
          pending_tool_approvals: [
            {
              tool_call_id: "tool-call-1",
              tool_name: "execute_command",
              args_preview: '{"cmd":"npm test"}',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(recoverySnapshot({ pending_tool_approvals: [] }));
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
    await waitFor(() => expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("execute_command")).not.toBeInTheDocument(),
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
    fireEvent.change(screen.getByLabelText("Additional answer - Go"), {
      target: { value: "Keep the fast path" },
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
                  label: "Go",
                  supplement: "Keep the fast path",
                },
              ],
            },
          ],
        },
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
    const answerButton = screen.getByRole("button", { name: "Answer" });
    fireEvent.click(answerButton);

    await waitFor(() => expect(answerButton).toBeDisabled());
    answerDeferred.reject(new Error("question unavailable"));

    await screen.findByText("question unavailable");
    expect(answerButton).not.toBeDisabled();
  });

  it("keeps concurrent subagent question submissions isolated by run and question", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            instance_id: "subagent-a",
            question_id: "question-a",
            run_id: "sub-run-a",
            role_id: "Explorer",
            questions: [
              {
                question: "Choose the Explorer path",
                options: [{ label: "Inspect" }],
                multiple: false,
              },
            ],
          },
          {
            instance_id: "subagent-b",
            question_id: "question-b",
            run_id: "sub-run-b",
            role_id: "Reviewer",
            questions: [
              {
                question: "Choose the Reviewer path",
                options: [{ label: "Verify" }],
                multiple: false,
              },
            ],
          },
        ],
      }),
    );
    const firstAnswer = deferredResponse<{ status: string }>();
    answerUserQuestionMock
      .mockReturnValueOnce(firstAnswer.promise)
      .mockResolvedValueOnce({ status: "ok" });

    renderRecoveryBar();

    fireEvent.click(await screen.findByLabelText("Inspect"));
    fireEvent.click(screen.getByLabelText("Verify"));
    const explorerItem = screen.getByText("Choose the Explorer path")
      .closest(".at-recovery-question");
    const reviewerItem = screen.getByText("Choose the Reviewer path")
      .closest(".at-recovery-question");
    if (!(explorerItem instanceof HTMLElement) || !(reviewerItem instanceof HTMLElement)) {
      throw new Error("Concurrent question recovery items were not rendered.");
    }

    const explorerAnswer = within(explorerItem).getByRole("button", { name: "Answer" });
    const reviewerAnswer = within(reviewerItem).getByRole("button", { name: "Answer" });
    fireEvent.click(explorerAnswer);
    await waitFor(() => expect(explorerAnswer).toBeDisabled());
    expect(reviewerAnswer).not.toBeDisabled();

    fireEvent.click(reviewerAnswer);
    await waitFor(() => expect(answerUserQuestionMock).toHaveBeenCalledTimes(2));
    expect(answerUserQuestionMock).toHaveBeenNthCalledWith(
      1,
      "sub-run-a",
      "question-a",
      { answers: [{ selections: [{ label: "Inspect" }] }] },
    );
    expect(answerUserQuestionMock).toHaveBeenNthCalledWith(
      2,
      "sub-run-b",
      "question-b",
      { answers: [{ selections: [{ label: "Verify" }] }] },
    );

    firstAnswer.reject(new Error("Explorer question unavailable"));
    await within(explorerItem).findByText("Explorer question unavailable");
    expect(explorerAnswer).not.toBeDisabled();
    expect(within(reviewerItem).queryByText("Explorer question unavailable"))
      .not.toBeInTheDocument();
  });

  it("keeps root questions in place and opens subagent questions contextually", async () => {
    const subagentQuestion = {
      instance_id: "subagent-explorer",
      question_id: "question-subagent",
      questions: [{
        multiple: false,
        options: [{ label: "Inspect" }],
        question: "Choose the child path",
      }],
      role_id: "Explorer",
      run_id: "run-subagent",
    };
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            question_id: "question-root",
            questions: [{
              multiple: false,
              options: [{ label: "Continue" }],
              question: "Choose the root path",
            }],
            role_id: "MainAgent",
            run_id: "run-1",
          },
          subagentQuestion,
        ],
      }),
    );
    const onOpen = vi.fn();

    render(
      <TestProviders>
        <RecoveryBar
          onPendingSubagentQuestionOpen={onOpen}
          runStreamController={runStreamController()}
          sessionId="session-1"
        />
      </TestProviders>,
    );

    expect(await screen.findByText("Choose the root path")).toBeVisible();
    expect(screen.queryByText("Choose the child path")).not.toBeInTheDocument();
    expect(screen.getByText("Explorer needs input")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open subagent panel" }));
    expect(onOpen).toHaveBeenCalledWith(subagentQuestion);
  });

  it("answers only the question routed to the selected subagent panel", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            instance_id: "subagent-explorer",
            question_id: "question-explorer",
            questions: [{
              multiple: false,
              options: [{ label: "Inspect" }],
              question: "Explorer decision",
            }],
            role_id: "Explorer",
            run_id: "run-explorer",
          },
          {
            instance_id: "subagent-reviewer",
            question_id: "question-reviewer",
            questions: [{
              multiple: false,
              options: [{ label: "Verify" }],
              question: "Reviewer decision",
            }],
            role_id: "Reviewer",
            run_id: "run-reviewer",
          },
        ],
      }),
    );
    answerUserQuestionMock.mockResolvedValue({ status: "ok" });

    render(
      <TestProviders>
        <SubagentQuestionBar
          instanceId="subagent-explorer"
          runId="run-explorer"
          sessionId="session-1"
        />
      </TestProviders>,
    );

    expect(await screen.findByText("Explorer decision")).toBeVisible();
    expect(screen.queryByText("Reviewer decision")).not.toBeInTheDocument();
    expect(screen.getByText("Explorer needs input")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Inspect"));
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    await waitFor(() =>
      expect(answerUserQuestionMock).toHaveBeenCalledWith(
        "run-explorer",
        "question-explorer",
        { answers: [{ selections: [{ label: "Inspect" }] }] },
      ),
    );
  });

  it("localizes ask_question inside the selected subagent panel", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        pending_user_questions: [
          {
            instance_id: "subagent-explorer",
            question_id: "question-explorer",
            questions: [
              {
                multiple: false,
                options: [{ label: "检查" }],
                question: "选择子代理路径",
              },
            ],
            role_id: "Explorer",
            run_id: "run-explorer",
          },
        ],
      }),
    );
    answerUserQuestionMock.mockRejectedValue({ status: "unavailable" });

    render(
      <TestProviders>
        <SubagentQuestionBar
          instanceId="subagent-explorer"
          runId="run-explorer"
          sessionId="session-1"
        />
      </TestProviders>,
    );

    expect(await screen.findByText("选择子代理路径")).toBeVisible();
    expect(screen.getByText("Explorer 需要输入")).toBeVisible();
    fireEvent.click(screen.getByLabelText("检查"));
    fireEvent.click(screen.getByRole("button", { name: /回\s*答/u }));

    expect(await screen.findByText("提交回答失败。")).toBeVisible();
    expect(screen.queryByText("Question answer failed.")).not.toBeInTheDocument();
  });

  it("resumes a shared stopped run once for concurrent question answers", async () => {
    const questions = ["First decision", "Second decision"].map((question, index) => ({
      question_id: `question-${index + 1}`,
      questions: [{
        multiple: false,
        options: [{ label: `Option ${index + 1}` }],
        question,
      }],
      role_id: index === 0 ? "Explorer" : "Reviewer",
      run_id: "run-shared",
    }));
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          last_event_id: 14,
          phase: "stopped",
          run_id: "run-shared",
          session_id: "session-1",
          should_show_recover: true,
          status: "stopped",
        },
        pending_user_questions: questions,
      }),
    );
    const resumed = deferredResponse<{
      run_id: string;
      session_id: string;
      status: string;
    }>();
    resumeRunMock.mockReturnValue(resumed.promise);
    answerUserQuestionMock.mockResolvedValue({ status: "ok" });

    renderRecoveryBar();

    fireEvent.click(await screen.findByLabelText("Option 1"));
    fireEvent.click(screen.getByLabelText("Option 2"));
    const answerButtons = screen.getAllByRole("button", { name: "Answer" });
    fireEvent.click(answerButtons[0]);
    fireEvent.click(answerButtons[1]);
    await waitFor(() => expect(resumeRunMock).toHaveBeenCalledTimes(1));
    expect(answerUserQuestionMock).not.toHaveBeenCalled();

    resumed.resolve({
      run_id: "run-shared",
      session_id: "session-1",
      status: "running",
    });
    await waitFor(() => expect(answerUserQuestionMock).toHaveBeenCalledTimes(2));
    expect(answerUserQuestionMock).toHaveBeenCalledWith(
      "run-shared",
      "question-1",
      { answers: [{ selections: [{ label: "Option 1" }] }] },
    );
    expect(answerUserQuestionMock).toHaveBeenCalledWith(
      "run-shared",
      "question-2",
      { answers: [{ selections: [{ label: "Option 2" }] }] },
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
    fireEvent.change(screen.getByLabelText("Additional answer - Other"), {
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

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 42,
        foreground: true,
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("does not auto-start streams for an idle recovery snapshot", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: null,
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("settles an observed active run when the authoritative snapshot becomes idle", async () => {
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
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RecoveryBar runStreamController={controller} sessionId="session-1" />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 42,
        foreground: true,
        runId: "run-1",
        sessionId: "session-1",
      }),
    );
    controller.activeRunId = "run-1";
    controller.activeRunIds = ["run-1"];
    controller.trackedRunIds = ["run-1"];

    act(() => {
      queryClient.setQueryData(
        ["sessions", "session-1", "recovery"],
        recoverySnapshot({ active_run: null }),
      );
    });

    await waitFor(() =>
      expect(controller.settleTerminalRunStream).toHaveBeenCalledWith({
        runIds: ["run-1"],
        sessionId: "session-1",
      }),
    );
    expect(controller.clearRunStream).not.toHaveBeenCalled();
  });

  it("keeps a newly tracked run open while recovery has not observed it", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({ active_run: null }),
    );
    const controller = runStreamController();
    controller.trackedRunIds = ["run-1"];

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    await act(async () => Promise.resolve());
    expect(getRecoverySnapshotMock).not.toHaveBeenCalledWith("session-1", true);
    expect(controller.settleTerminalRunStream).not.toHaveBeenCalled();
  });

  it("does not reconcile a background run owned by another selected session", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({ active_run: null }),
    );
    const controller = runStreamController();
    controller.trackedRunIds = ["run-background-session"];
    controller.trackedSessionId = "session-2";

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    await act(async () => Promise.resolve());
    expect(getRecoverySnapshotMock).not.toHaveBeenCalledWith("session-1", true);
    expect(controller.settleTerminalRunStream).not.toHaveBeenCalled();
  });

  it("clears question form state when the selected session changes", async () => {
    getRecoverySnapshotMock.mockImplementation((sessionId) =>
      Promise.resolve(recoverySnapshot({
        pending_user_questions: [
          {
            question_id: "shared-question-id",
            questions: [{
              multiple: false,
              options: [{ label: sessionId === "session-a" ? "Session A" : "Session B" }],
              question: `Decision for ${sessionId}`,
            }],
            role_id: "Explorer",
            run_id: `run-${sessionId}`,
          },
        ],
      })),
    );
    const controller = runStreamController();
    const view = render(
      <TestProviders>
        <RecoveryBar runStreamController={controller} sessionId="session-a" />
      </TestProviders>,
    );

    const sessionAOption = await screen.findByLabelText("Session A");
    fireEvent.click(sessionAOption);
    expect(sessionAOption).toBeChecked();
    expect(screen.getByRole("button", { name: "Answer" })).not.toBeDisabled();

    view.rerender(
      <TestProviders>
        <RecoveryBar runStreamController={controller} sessionId="session-b" />
      </TestProviders>,
    );

    const sessionBOption = await screen.findByLabelText("Session B");
    await waitFor(() => expect(sessionBOption).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Answer" })).toBeDisabled();
  });

  it("settles only a vanished foreground run while a background run remains active", async () => {
    const backgroundTask: RecoverySnapshot["background_tasks"][number] = {
      background_task_id: "background-task-1",
      run_id: "background-run-1",
      session_id: "session-1",
      kind: "command",
      command: "python worker.py",
      cwd: "C:/repo",
      execution_mode: "background",
      status: "running",
      recent_output: [],
    };
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
        background_tasks: [backgroundTask],
      }),
    );
    const controller = runStreamController();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RecoveryBar runStreamController={controller} sessionId="session-1" />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(controller.startRunStreams).toHaveBeenCalled());
    controller.activeRunId = "run-1";
    controller.activeRunIds = ["run-1"];
    controller.trackedRunIds = ["run-1", "background-run-1"];

    act(() => {
      queryClient.setQueryData(
        ["sessions", "session-1", "recovery"],
        recoverySnapshot({
          active_run: null,
          background_tasks: [backgroundTask],
        }),
      );
    });

    await waitFor(() =>
      expect(controller.settleTerminalRunStream).toHaveBeenCalledWith({
        runIds: ["run-1"],
        sessionId: "session-1",
      }),
    );
  });

  it("does not auto-start streams for terminal active runs", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "run-1",
          session_id: "session-1",
          status: "completed",
          phase: "completed",
          last_event_id: 42,
          should_show_recover: false,
        },
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("starts foreground recovery streams for the newly selected session", async () => {
    getRecoverySnapshotMock.mockImplementation(async (sessionId: string) =>
      sessionId === "session-b"
        ? recoverySnapshot({
            active_run: {
              run_id: "run-b",
              session_id: "session-b",
              status: "running",
              phase: "running",
              last_event_id: 88,
              should_show_recover: false,
            },
          })
        : recoverySnapshot({ active_run: null }),
    );
    const controller = runStreamController();
    const view = render(
      <TestProviders>
        <RecoveryBar runStreamController={controller} sessionId="session-a" />
      </TestProviders>,
    );

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-a"),
    );
    expect(controller.startRunStream).not.toHaveBeenCalled();

    view.rerender(
      <TestProviders>
        <RecoveryBar runStreamController={controller} sessionId="session-b" />
      </TestProviders>,
    );

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 88,
        foreground: true,
        runId: "run-b",
        sessionId: "session-b",
      }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("rebinds a matching run id when it is tracked for another session", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: {
          run_id: "shared-run-id",
          session_id: "session-1",
          status: "running",
          phase: "running",
          last_event_id: 42,
          should_show_recover: false,
        },
      }),
    );
    const controller = runStreamController();
    controller.trackedRunIds = ["shared-run-id"];
    controller.trackedSessionId = "session-2";

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 42,
        foreground: true,
        runId: "shared-run-id",
        sessionId: "session-1",
      }),
    );
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
    expect(screen.getByText("Run stopped")).toBeVisible();
    expect(screen.queryByText(/run-1/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("is-resume-only");
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
            last_event_id: 9,
          },
        ],
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("subagent:reviewer");
    await waitFor(() =>
      expect(controller.startRunStreams).toHaveBeenCalledWith({
        foregroundRunIds: ["run-1"],
        runs: [
          { afterEventId: 42, runId: "run-1" },
          { afterEventId: 9, runId: "subagent-run-1" },
        ],
        sessionId: "session-1",
      }),
    );
    expect(controller.startRunStream).not.toHaveBeenCalled();
  });

  it("streams only the subagent output run when the parent run is stopped and recoverable", async () => {
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
            last_event_id: 9,
          },
        ],
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("subagent:reviewer");
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 9,
        foreground: false,
        runId: "subagent-run-1",
        sessionId: "session-1",
      }),
    );
    expect(controller.startRunStreams).not.toHaveBeenCalled();
  });

  it("does not auto-stream a recoverable stopped parent for same-run background work", async () => {
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
        background_tasks: [
          {
            background_task_id: "background-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "command",
            command: "npm run watch",
            cwd: "C:/repo",
            execution_mode: "background",
            status: "running",
            recent_output: [],
          },
        ],
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await screen.findByText("npm run watch");
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
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

  it("does not auto-start stale recovery targets after a stream error suppresses them", async () => {
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
    const controller: RunStreamController = {
      ...runStreamController(),
      suppressedRunIds: ["run-1"],
    };

    renderRecoveryBar(controller);

    await waitFor(() =>
      expect(screen.queryByText("Run run-1 is running")).not.toBeInTheDocument(),
    );
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
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

    await waitFor(() =>
      expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("projects paused subagent recovery without rendering a standalone alert", async () => {
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

    const onPausedSubagentChange = vi.fn();
    renderRecoveryBar(runStreamController(), onPausedSubagentChange);

    await waitFor(() => expect(onPausedSubagentChange).toHaveBeenCalledWith(
      {
        instance_id: "inst-2",
        role_id: "spec_coder",
        task_id: "task-7",
        reason: "waiting for local follow-up",
      },
      expect.objectContaining({
        phase: "awaiting_subagent_followup",
        run_id: "run-1",
      }),
    ));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("does not expose structured paused-subagent identities in the recovery surface", async () => {
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
          instance_id: "coordinator-inst",
          role_id: "CoordinatorAgent",
          task_id: "task-coordinator",
        },
      }),
    );

    const onPausedSubagentChange = vi.fn();
    renderRecoveryBar(runStreamController(), onPausedSubagentChange);

    await waitFor(() => expect(onPausedSubagentChange).toHaveBeenCalled());
    expect(screen.queryByText(/coordinator-inst|task-coordinator/)).not.toBeInTheDocument();
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

  it("localizes background task status, controls, and details in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
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
            log_path: "C:/repo/task.log",
          },
        ],
      }),
    );

    renderRecoveryBar();

    expect(await screen.findByText("后台任务")).toBeVisible();
    expect(screen.getByText("1 个运行中")).toBeVisible();
    expect(screen.getByText("已暂停")).toBeVisible();
    expect(screen.getByRole("button", { name: /隐\s*藏/u })).toBeVisible();
    expect(screen.getByRole("button", { name: /停\s*止/u })).toBeVisible();
    const taskItem = screen.getByText("uv run pytest").closest(
      ".at-recovery-background-item",
    );
    expect(taskItem).toHaveAttribute(
      "title",
      "已暂停\nuv run pytest\n工作目录：C:/repo\n日志：C:/repo/task.log",
    );
  });

  it("ignores foreground command task records in recovery background tasks", async () => {
    getRecoverySnapshotMock.mockResolvedValue(
      recoverySnapshot({
        active_run: null,
        background_tasks: [
          {
            background_task_id: "foreground-task-1",
            run_id: "run-1",
            session_id: "session-1",
            kind: "command",
            command: "python script.py",
            cwd: "C:/repo",
            execution_mode: "foreground",
            status: "running",
            recent_output: [],
          },
        ],
      }),
    );
    const controller = runStreamController();

    renderRecoveryBar(controller);

    await waitFor(() => expect(getRecoverySnapshotMock).toHaveBeenCalledOnce());
    expect(screen.queryByText("python script.py")).not.toBeInTheDocument();
    expect(screen.queryByText("A background task is still active"))
      .not.toBeInTheDocument();
    expect(controller.startRunStream).not.toHaveBeenCalled();
    expect(controller.startRunStreams).not.toHaveBeenCalled();
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

    await screen.findByText("A background task is still active");
    expect(screen.getByText("python worker.py")).toBeInTheDocument();
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: undefined,
        foreground: false,
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

function renderRecoveryBar(
  controller = runStreamController(),
  onPausedSubagentChange?: ComponentProps<typeof RecoveryBar>["onPausedSubagentChange"],
  visible = true,
) {
  const queryClient = createTestQueryClient();
  render(
    <TestProviders queryClient={queryClient}>
      <RecoveryBar
        onPausedSubagentChange={onPausedSubagentChange}
        runStreamController={controller}
        sessionId="session-1"
        visible={visible}
      />
    </TestProviders>,
  );
  return queryClient;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function TestProviders({
  children,
  queryClient = createTestQueryClient(),
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
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
    setForegroundSessionId: vi.fn(),
    settleTerminalRunStream: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    suppressedRunIds: [],
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
