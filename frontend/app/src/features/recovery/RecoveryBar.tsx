import { Alert, App, Button, Checkbox, Radio, Space, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  answerUserQuestion,
  getRecoverySnapshot,
  resolveToolApproval,
  resumeRun,
} from "../../api/client";
import type {
  PendingToolApproval,
  PendingUserQuestion,
  ToolApprovalAction,
  UserQuestionAnswerSubmission,
  UserQuestionPrompt,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";

interface RecoveryBarProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

export function RecoveryBar({ runStreamController, sessionId }: RecoveryBarProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [questionSelections, setQuestionSelections] = useState<Record<string, string[]>>(
    {},
  );
  const recoveryQuery = useQuery({
    queryKey: ["sessions", sessionId, "recovery"],
    queryFn: () => getRecoverySnapshot(sessionId ?? ""),
    enabled: sessionId !== null,
    refetchInterval: 10000,
  });

  const activeRun = recoveryQuery.data?.active_run ?? null;
  const pendingApprovals = recoveryQuery.data?.pending_tool_approvals ?? [];
  const pendingQuestions = recoveryQuery.data?.pending_user_questions ?? [];
  const recoverableRunId =
    activeRun?.should_show_recover === true ? activeRun.run_id : null;

  const resumeRecoverableRun = async (runId: string) => {
    const result = await resumeRun(runId);
    runStreamController.startRunStream({
      runId: result.run_id,
      sessionId: result.session_id,
      afterEventId: activeRun?.last_event_id,
    });
    return result;
  };

  const resumeMutation = useMutation({
    mutationFn: () => resumeRecoverableRun(recoverableRunId ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : "Resume failed.");
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async (request: ApprovalActionRequest) => {
      if (recoverableRunId === request.runId) {
        await resumeRecoverableRun(request.runId);
      }
      return resolveToolApproval(
        request.runId,
        request.toolCallId,
        request.action,
        request.optionId,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Tool approval failed.",
      );
    },
  });

  const questionMutation = useMutation({
    mutationFn: (question: PendingUserQuestion) => {
      const answers = buildQuestionAnswer(question, questionSelections);
      if (answers === null) {
        throw new Error("Select an answer for each question.");
      }
      return answerUserQuestion(question.run_id, question.question_id, answers);
    },
    onSuccess: () => {
      setQuestionSelections({});
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Question answer failed.",
      );
    },
  });

  if (sessionId === null || recoveryQuery.isLoading || activeRun === null) {
    return null;
  }

  return (
    <Alert
      className="at-recovery"
      message={
        <div className="at-recovery-body">
          <Space size={8}>
            <span>
              Run {activeRun.run_id} is {activeRun.phase ?? activeRun.status}
            </span>
            {recoverableRunId !== null ? (
              <Button
                loading={resumeMutation.isPending}
                onClick={() => resumeMutation.mutate()}
                size="small"
                type="primary"
              >
                Resume
              </Button>
            ) : null}
          </Space>
          <PendingApprovals
            activeRunId={activeRun.run_id}
            approvals={pendingApprovals}
            busy={approvalMutation.isPending}
            onResolve={(request) => approvalMutation.mutate(request)}
          />
          <PendingQuestions
            busy={questionMutation.isPending}
            onAnswer={(question) => questionMutation.mutate(question)}
            onSelectionChange={(questionId, promptIndex, selectedLabels) => {
              setQuestionSelections((current) => ({
                ...current,
                [selectionKey(questionId, promptIndex)]: selectedLabels,
              }));
            }}
            questions={pendingQuestions}
            selections={questionSelections}
          />
        </div>
      }
      showIcon
      type={recoverableRunId !== null ? "warning" : "info"}
    />
  );
}

interface ApprovalActionRequest {
  action: ToolApprovalAction;
  optionId?: string;
  runId: string;
  toolCallId: string;
}

interface PendingApprovalsProps {
  activeRunId: string;
  approvals: PendingToolApproval[];
  busy: boolean;
  onResolve: (request: ApprovalActionRequest) => void;
}

function PendingApprovals({
  activeRunId,
  approvals,
  busy,
  onResolve,
}: PendingApprovalsProps) {
  if (approvals.length === 0) {
    return null;
  }
  return (
    <div className="at-recovery-panel">
      {approvals.map((approval) => {
        const option = preferredApprovalOption(approval);
        return (
          <div className="at-recovery-item" key={approval.tool_call_id}>
            <div className="at-recovery-copy">
              <Typography.Text strong>
                {approval.tool_name?.trim() || approval.tool_call_id}
              </Typography.Text>
              {approval.args_preview?.trim() ? (
                <Typography.Text type="secondary" ellipsis>
                  {approval.args_preview}
                </Typography.Text>
              ) : null}
            </div>
            <Space size={6}>
              <Button
                disabled={busy}
                onClick={() =>
                  onResolve({
                    action: "approve",
                    optionId: option,
                    runId: activeRunId,
                    toolCallId: approval.tool_call_id,
                  })
                }
                size="small"
                type="primary"
              >
                Approve
              </Button>
              <Button
                danger
                disabled={busy}
                onClick={() =>
                  onResolve({
                    action: "deny",
                    runId: activeRunId,
                    toolCallId: approval.tool_call_id,
                  })
                }
                size="small"
              >
                Deny
              </Button>
            </Space>
          </div>
        );
      })}
    </div>
  );
}

interface PendingQuestionsProps {
  busy: boolean;
  onAnswer: (question: PendingUserQuestion) => void;
  onSelectionChange: (
    questionId: string,
    promptIndex: number,
    selectedLabels: string[],
  ) => void;
  questions: PendingUserQuestion[];
  selections: Record<string, string[]>;
}

function PendingQuestions({
  busy,
  onAnswer,
  onSelectionChange,
  questions,
  selections,
}: PendingQuestionsProps) {
  if (questions.length === 0) {
    return null;
  }
  return (
    <div className="at-recovery-panel">
      {questions.map((question) => (
        <div className="at-recovery-question" key={question.question_id}>
          <Typography.Text strong>
            {question.role_id?.trim() || "Agent"} needs input
          </Typography.Text>
          {question.questions.map((prompt, index) => (
            <QuestionPromptControl
              key={`${question.question_id}:${index}`}
              onSelectionChange={(selectedLabels) =>
                onSelectionChange(question.question_id, index, selectedLabels)
              }
              prompt={prompt}
              selectedLabels={selections[selectionKey(question.question_id, index)] ?? []}
            />
          ))}
          <Button
            disabled={busy || !hasSelections(question, selections)}
            onClick={() => onAnswer(question)}
            size="small"
            type="primary"
          >
            Answer
          </Button>
        </div>
      ))}
    </div>
  );
}

interface QuestionPromptControlProps {
  onSelectionChange: (selectedLabels: string[]) => void;
  prompt: UserQuestionPrompt;
  selectedLabels: string[];
}

function QuestionPromptControl({
  onSelectionChange,
  prompt,
  selectedLabels,
}: QuestionPromptControlProps) {
  const options = prompt.options.map((option) => ({
    label: option.description?.trim()
      ? `${option.label} - ${option.description}`
      : option.label,
    value: option.label,
  }));
  return (
    <div className="at-recovery-prompt">
      <Typography.Text>{prompt.question}</Typography.Text>
      {prompt.multiple === true ? (
        <Checkbox.Group
          disabled={options.length === 0}
          onChange={(values) => onSelectionChange(values.map(String))}
          options={options}
          value={selectedLabels}
        />
      ) : (
        <Radio.Group
          disabled={options.length === 0}
          onChange={(event) => onSelectionChange([String(event.target.value)])}
          options={options}
          value={selectedLabels[0] ?? null}
        />
      )}
    </div>
  );
}

function buildQuestionAnswer(
  question: PendingUserQuestion,
  selections: Record<string, string[]>,
): UserQuestionAnswerSubmission | null {
  const answers = question.questions.map((prompt, index) => {
    const selectedLabels = selections[selectionKey(question.question_id, index)] ?? [];
    return {
      selections: selectedLabels.map((label) => ({ label })),
    };
  });
  if (answers.length === 0 || answers.some((answer) => answer.selections.length === 0)) {
    return null;
  }
  return { answers };
}

function hasSelections(
  question: PendingUserQuestion,
  selections: Record<string, string[]>,
): boolean {
  return question.questions.every(
    (_prompt, index) =>
      (selections[selectionKey(question.question_id, index)] ?? []).length > 0,
  );
}

function preferredApprovalOption(approval: PendingToolApproval): string {
  const options = approval.acp_options ?? [];
  const option = options.find((item) => {
    const kind = String(item.kind ?? "").toLowerCase();
    const id = approvalOptionId(item).toLowerCase();
    return kind.includes("allow") || id.includes("allow");
  });
  return option === undefined ? "" : approvalOptionId(option);
}

function approvalOptionId(option: {
  id?: string;
  option_id?: string;
  optionId?: string;
}): string {
  return option.option_id ?? option.optionId ?? option.id ?? "";
}

function selectionKey(questionId: string, promptIndex: number): string {
  return `${questionId}:${promptIndex}`;
}
