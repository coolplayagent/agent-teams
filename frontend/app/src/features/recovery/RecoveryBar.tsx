import { Alert, App, Button, Checkbox, Input, Radio, Space, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  answerUserQuestion,
  getRecoverySnapshot,
  resolveToolApproval,
  resumeRun,
  stopBackgroundTask,
} from "../../api/client";
import type {
  PendingToolApproval,
  PendingUserQuestion,
  RecoveryBackgroundTask,
  ToolApprovalAction,
  UserQuestionAnswerSubmission,
  UserQuestionPrompt,
  RecoveryRun,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";

const NONE_OF_THE_ABOVE_OPTION_LABEL = "__none_of_the_above__";

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
  const [questionSupplements, setQuestionSupplements] = useState<Record<string, string>>(
    {},
  );
  const [backgroundTaskErrors, setBackgroundTaskErrors] = useState<Record<string, string>>(
    {},
  );
  const [collapsedBackgroundRunIds, setCollapsedBackgroundRunIds] = useState<
    Record<string, boolean>
  >({});
  const recoveryQuery = useQuery({
    queryKey: ["sessions", sessionId, "recovery"],
    queryFn: () => getRecoverySnapshot(sessionId ?? ""),
    enabled: sessionId !== null,
    refetchInterval: 10000,
  });

  const activeRun = recoveryQuery.data?.active_run ?? null;
  const pendingApprovals = recoveryQuery.data?.pending_tool_approvals ?? [];
  const pendingQuestions = recoveryQuery.data?.pending_user_questions ?? [];
  const activeBackgroundTasks = (recoveryQuery.data?.background_tasks ?? []).filter(
    isActiveBackgroundTask,
  );
  const recoverableRunId =
    activeRun?.should_show_recover === true ? activeRun.run_id : null;
  const showResumeAction = shouldShowResumeAction(
    activeRun,
    pendingApprovals,
    pendingQuestions,
    recoveryQuery.data?.paused_subagent ?? null,
    runStreamController.activeRunId,
  );

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
      if (shouldResumeBeforeApproval(activeRun, request.runId)) {
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
      const answers = buildQuestionAnswer(
        question,
        questionSelections,
        questionSupplements,
      );
      if (answers === null) {
        throw new Error("Select an answer for each question.");
      }
      return answerUserQuestion(question.run_id, question.question_id, answers);
    },
    onSuccess: () => {
      setQuestionSelections({});
      setQuestionSupplements({});
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Question answer failed.",
      );
    },
  });

  const stopBackgroundTaskMutation = useMutation({
    mutationFn: (request: BackgroundTaskStopRequest) =>
      stopBackgroundTask(request.runId, request.backgroundTaskId),
    onMutate: (request) => {
      setBackgroundTaskErrors((current) => {
        const next = { ...current };
        delete next[request.backgroundTaskId];
        return next;
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error, request) => {
      const messageText =
        error instanceof Error ? error.message : "Background task stop failed.";
      setBackgroundTaskErrors((current) => ({
        ...current,
        [request.backgroundTaskId]: messageText,
      }));
      void message.error(messageText);
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
            {showResumeAction ? (
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
          <BackgroundTasksPanel
            activeRunId={activeRun.run_id}
            busyTaskId={
              stopBackgroundTaskMutation.isPending
                ? stopBackgroundTaskMutation.variables?.backgroundTaskId ?? null
                : null
            }
            collapsed={collapsedBackgroundRunIds[activeRun.run_id] === true}
            errors={backgroundTaskErrors}
            onStop={(request) => stopBackgroundTaskMutation.mutate(request)}
            onToggle={(runId) => {
              setCollapsedBackgroundRunIds((current) => ({
                ...current,
                [runId]: current[runId] !== true,
              }));
            }}
            tasks={activeBackgroundTasks}
          />
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
            onSupplementChange={(questionId, promptIndex, supplement) => {
              setQuestionSupplements((current) => ({
                ...current,
                [selectionKey(questionId, promptIndex)]: supplement,
              }));
            }}
            questions={pendingQuestions}
            selections={questionSelections}
            supplements={questionSupplements}
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

interface BackgroundTaskStopRequest {
  backgroundTaskId: string;
  runId: string;
}

interface BackgroundTasksPanelProps {
  activeRunId: string;
  busyTaskId: string | null;
  collapsed: boolean;
  errors: Record<string, string>;
  onStop: (request: BackgroundTaskStopRequest) => void;
  onToggle: (runId: string) => void;
  tasks: RecoveryBackgroundTask[];
}

function BackgroundTasksPanel({
  activeRunId,
  busyTaskId,
  collapsed,
  errors,
  onStop,
  onToggle,
  tasks,
}: BackgroundTasksPanelProps) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <div aria-live="polite" className="at-recovery-panel at-recovery-background">
      <div className="at-recovery-background-header">
        <Space size={8}>
          <Typography.Text strong>Background tasks</Typography.Text>
          <Typography.Text type="secondary">{tasks.length} active</Typography.Text>
        </Space>
        <Button onClick={() => onToggle(activeRunId)} size="small">
          {collapsed ? "Show" : "Hide"}
        </Button>
      </div>
      {collapsed ? null : (
        <div className="at-recovery-background-list">
          {tasks.map((task) => {
            const taskId = task.background_task_id.trim();
            const taskRunId = task.run_id.trim() || activeRunId;
            const busy = busyTaskId === taskId;
            const error = errors[taskId] ?? "";
            const statusText = error || (busy ? "Stopping" : backgroundTaskStatusLabel(task));
            return (
              <div
                className="at-recovery-item at-recovery-background-item"
                key={taskId}
                title={backgroundTaskDetails(task, statusText)}
              >
                <div className="at-recovery-copy">
                  <Space size={8} wrap>
                    <Typography.Text strong ellipsis>
                      {backgroundTaskTitle(task)}
                    </Typography.Text>
                    <Typography.Text type={error ? "danger" : "secondary"}>
                      {statusText}
                    </Typography.Text>
                  </Space>
                  {task.cwd.trim() ? (
                    <Typography.Text type="secondary" ellipsis>
                      {task.cwd}
                    </Typography.Text>
                  ) : null}
                </div>
                <Button
                  danger
                  disabled={busyTaskId !== null}
                  loading={busy}
                  onClick={() =>
                    onStop({
                      backgroundTaskId: taskId,
                      runId: taskRunId,
                    })
                  }
                  size="small"
                >
                  Stop
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
      {approvals.map((approval) => (
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
      ))}
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
  onSupplementChange: (
    questionId: string,
    promptIndex: number,
    supplement: string,
  ) => void;
  questions: PendingUserQuestion[];
  selections: Record<string, string[]>;
  supplements: Record<string, string>;
}

function PendingQuestions({
  busy,
  onAnswer,
  onSelectionChange,
  onSupplementChange,
  questions,
  selections,
  supplements,
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
              onSupplementChange={(supplement) =>
                onSupplementChange(question.question_id, index, supplement)
              }
              prompt={prompt}
              selectedLabels={selections[selectionKey(question.question_id, index)] ?? []}
              selectedSupplement={
                supplements[selectionKey(question.question_id, index)] ?? ""
              }
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
  onSupplementChange: (supplement: string) => void;
  prompt: UserQuestionPrompt;
  selectedLabels: string[];
  selectedSupplement: string;
}

function QuestionPromptControl({
  onSelectionChange,
  onSupplementChange,
  prompt,
  selectedLabels,
  selectedSupplement,
}: QuestionPromptControlProps) {
  const options = prompt.options.map((option) => ({
    label: questionOptionLabel(option.label, option.description),
    value: option.label,
  }));
  const showSupplement = selectedLabels.includes(NONE_OF_THE_ABOVE_OPTION_LABEL);
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
      {showSupplement ? (
        <Input
          aria-label="Additional answer"
          onChange={(event) => onSupplementChange(event.target.value)}
          placeholder={prompt.placeholder?.trim() || "Add details"}
          size="small"
          value={selectedSupplement}
        />
      ) : null}
    </div>
  );
}

function buildQuestionAnswer(
  question: PendingUserQuestion,
  selections: Record<string, string[]>,
  supplements: Record<string, string>,
): UserQuestionAnswerSubmission | null {
  const answers = question.questions.map((prompt, index) => {
    const key = selectionKey(question.question_id, index);
    const selectedLabels = selections[key] ?? [];
    return {
      selections: selectedLabels.map((label) => {
        const supplement =
          label === NONE_OF_THE_ABOVE_OPTION_LABEL
            ? supplements[key]?.trim()
            : "";
        return supplement ? { label, supplement } : { label };
      }),
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

function questionOptionLabel(label: string, description: string | undefined): string {
  if (label === NONE_OF_THE_ABOVE_OPTION_LABEL) {
    return "Other";
  }
  return description?.trim() ? `${label} - ${description}` : label;
}

function selectionKey(questionId: string, promptIndex: number): string {
  return `${questionId}:${promptIndex}`;
}

function isActiveBackgroundTask(task: RecoveryBackgroundTask): boolean {
  return (
    task.background_task_id.trim().length > 0 &&
    task.execution_mode !== "foreground" &&
    (task.status === "running" || task.status === "blocked")
  );
}

function backgroundTaskTitle(task: RecoveryBackgroundTask): string {
  const command = task.command.trim();
  if (command) {
    return command;
  }
  const title = task.title?.trim();
  if (title) {
    return title;
  }
  return shortRunId(task.background_task_id);
}

function backgroundTaskDetails(
  task: RecoveryBackgroundTask,
  statusText: string,
): string {
  return [
    statusText,
    backgroundTaskTitle(task),
    task.cwd.trim() ? `cwd: ${task.cwd.trim()}` : "",
    task.log_path?.trim() ? `log: ${task.log_path.trim()}` : "",
    task.exit_code === null || task.exit_code === undefined
      ? ""
      : `exit: ${task.exit_code}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function backgroundTaskStatusLabel(task: RecoveryBackgroundTask): string {
  switch (task.status) {
    case "running":
      return "Running";
    case "blocked":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

function shortRunId(runId: string): string {
  return runId.length > 16 ? `${runId.slice(0, 8)}...${runId.slice(-4)}` : runId;
}

function shouldShowResumeAction(
  activeRun: RecoveryRun | null,
  pendingApprovals: PendingToolApproval[],
  pendingQuestions: PendingUserQuestion[],
  pausedSubagent: unknown,
  activeStreamRunId: string | null,
): boolean {
  if (activeRun?.should_show_recover !== true || !activeRun.run_id) {
    return false;
  }
  if (activeStreamRunId === activeRun.run_id) {
    return false;
  }
  if (pendingApprovals.length > 0 || pendingQuestions.length > 0 || pausedSubagent) {
    return false;
  }
  if (activeRun.status === "stopping" || activeRun.phase === "stopping") {
    return false;
  }
  return (
    activeRun.status === "stopped" ||
    activeRun.phase === "stopped" ||
    activeRun.status === "paused" ||
    activeRun.phase === "awaiting_recovery"
  );
}

function shouldResumeBeforeApproval(
  activeRun: RecoveryRun | null,
  runId: string,
): boolean {
  return (
    activeRun?.should_show_recover === true &&
    activeRun.run_id === runId &&
    (activeRun.status === "stopped" || activeRun.phase === "stopped")
  );
}
