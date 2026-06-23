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
  RecoveryPausedSubagent,
  ToolApprovalAction,
  ToolApprovalOption,
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
  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
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
  const pausedSubagent = visiblePausedSubagent(
    recoveryQuery.data?.paused_subagent ?? null,
  );
  const activeBackgroundTasks = (recoveryQuery.data?.background_tasks ?? []).filter(
    isActiveBackgroundTask,
  );
  const recoverableRunId =
    activeRun?.should_show_recover === true ? activeRun.run_id : null;
  const showResumeAction = shouldShowResumeAction(
    activeRun,
    pendingApprovals,
    pendingQuestions,
    pausedSubagent,
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
    onMutate: (request) => {
      setApprovalErrors((current) => removeRecordKey(current, request.toolCallId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error, request) => {
      const messageText =
        error instanceof Error ? error.message : "Tool approval failed.";
      setApprovalErrors((current) => ({
        ...current,
        [request.toolCallId]: messageText,
      }));
      void message.error(messageText);
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
    onMutate: (question) => {
      setQuestionErrors((current) => removeRecordKey(current, question.question_id));
    },
    onSuccess: () => {
      setQuestionSelections({});
      setQuestionSupplements({});
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error, question) => {
      const messageText =
        error instanceof Error ? error.message : "Question answer failed.";
      setQuestionErrors((current) => ({
        ...current,
        [question.question_id]: messageText,
      }));
      void message.error(messageText);
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
          <PausedSubagentPanel pausedSubagent={pausedSubagent} />
          <PendingApprovals
            activeRunId={activeRun.run_id}
            approvals={pendingApprovals}
            busyToolCallId={
              approvalMutation.isPending
                ? approvalMutation.variables?.toolCallId ?? null
                : null
            }
            errors={approvalErrors}
            onResolve={(request) => approvalMutation.mutate(request)}
          />
          <PendingQuestions
            busyQuestionId={
              questionMutation.isPending
                ? questionMutation.variables?.question_id ?? null
                : null
            }
            errors={questionErrors}
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

interface PausedSubagentPanelProps {
  pausedSubagent: RecoveryPausedSubagent | null;
}

function PausedSubagentPanel({ pausedSubagent }: PausedSubagentPanelProps) {
  if (pausedSubagent === null) {
    return null;
  }
  const detail = pausedSubagentDetail(pausedSubagent);
  return (
    <div className="at-recovery-panel">
      <div className="at-recovery-item">
        <div className="at-recovery-copy">
          <Typography.Text strong>
            Paused subagent: {pausedSubagentLabel(pausedSubagent)}
          </Typography.Text>
          <Typography.Text type="secondary">
            Waiting for follow-up in the paused subagent panel.
          </Typography.Text>
          {detail ? (
            <Typography.Text type="secondary" ellipsis>
              {detail}
            </Typography.Text>
          ) : null}
        </div>
      </div>
    </div>
  );
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
  busyToolCallId: string | null;
  errors: Record<string, string>;
  onResolve: (request: ApprovalActionRequest) => void;
}

function PendingApprovals({
  activeRunId,
  approvals,
  busyToolCallId,
  errors,
  onResolve,
}: PendingApprovalsProps) {
  if (approvals.length === 0) {
    return null;
  }
  return (
    <div className="at-recovery-panel">
      {approvals.map((approval) => {
        const approvalOptions = normalizedApprovalOptions(approval.acp_options);
        const toolCallId = approval.tool_call_id;
        const busy = busyToolCallId === toolCallId;
        const disabled = busyToolCallId !== null;
        const error = errors[toolCallId] ?? "";
        return (
          <div className="at-recovery-item" key={toolCallId}>
            <div className="at-recovery-copy">
              <Typography.Text strong>
                {approval.tool_name?.trim() || toolCallId}
              </Typography.Text>
              {approval.args_preview?.trim() ? (
                <Typography.Text type="secondary" ellipsis>
                  {approval.args_preview}
                </Typography.Text>
              ) : null}
              {error ? (
                <Typography.Text type="danger">{error}</Typography.Text>
              ) : null}
            </div>
            <Space size={6} wrap>
              {approvalOptions.map((option) => (
                <Button
                  danger={option.action === "deny"}
                  disabled={disabled}
                  key={`${option.optionId}:${option.action}`}
                  loading={busy}
                  onClick={() =>
                    onResolve({
                      action: option.action,
                      optionId: option.optionId,
                      runId: activeRunId,
                      toolCallId,
                    })
                  }
                  size="small"
                >
                  {option.label}
                </Button>
              ))}
              <Button
                disabled={disabled}
                loading={busy}
                onClick={() =>
                  onResolve({
                    action: "approve",
                    runId: activeRunId,
                    toolCallId,
                  })
                }
                size="small"
                type="primary"
              >
                Approve
              </Button>
              <Button
                danger
                disabled={disabled}
                loading={busy}
                onClick={() =>
                  onResolve({
                    action: "deny",
                    runId: activeRunId,
                    toolCallId,
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
  busyQuestionId: string | null;
  errors: Record<string, string>;
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
  busyQuestionId,
  errors,
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
      {questions.map((question) => {
        const busy = busyQuestionId === question.question_id;
        const disabled = busyQuestionId !== null;
        const error = errors[question.question_id] ?? "";
        return (
          <div className="at-recovery-question" key={question.question_id}>
            <div className="at-recovery-copy">
              <Typography.Text strong>
                {question.role_id?.trim() || "Agent"} needs input
              </Typography.Text>
              {error ? (
                <Typography.Text type="danger">{error}</Typography.Text>
              ) : null}
            </div>
            {question.questions.map((prompt, index) => (
              <QuestionPromptControl
                key={`${question.question_id}:${index}`}
                onSelectionChange={(selectedLabels) =>
                  onSelectionChange(question.question_id, index, selectedLabels)
                }
                onSupplementChange={(supplement) =>
                  onSupplementChange(question.question_id, index, supplement)
                }
                disabled={disabled}
                prompt={prompt}
                selectedLabels={selections[selectionKey(question.question_id, index)] ?? []}
                selectedSupplement={
                  supplements[selectionKey(question.question_id, index)] ?? ""
                }
              />
            ))}
            <Button
              disabled={disabled || !hasSelections(question, selections)}
              loading={busy}
              onClick={() => onAnswer(question)}
              size="small"
              type="primary"
            >
              Answer
            </Button>
          </div>
        );
      })}
    </div>
  );
}

interface QuestionPromptControlProps {
  disabled: boolean;
  onSelectionChange: (selectedLabels: string[]) => void;
  onSupplementChange: (supplement: string) => void;
  prompt: UserQuestionPrompt;
  selectedLabels: string[];
  selectedSupplement: string;
}

function QuestionPromptControl({
  disabled,
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
          disabled={disabled || options.length === 0}
          onChange={(values) => onSelectionChange(values.map(String))}
          options={options}
          value={selectedLabels}
        />
      ) : (
        <Radio.Group
          disabled={disabled || options.length === 0}
          onChange={(event) => onSelectionChange([String(event.target.value)])}
          options={options}
          value={selectedLabels[0] ?? null}
        />
      )}
      {showSupplement ? (
        <Input
          aria-label="Additional answer"
          disabled={disabled}
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

function removeRecordKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in record)) {
    return record;
  }
  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
}

function visiblePausedSubagent(
  pausedSubagent: RecoveryPausedSubagent | null,
): RecoveryPausedSubagent | null {
  if (pausedSubagent === null) {
    return null;
  }
  const roleId = pausedSubagent.role_id?.trim() ?? "";
  const instanceId = pausedSubagent.instance_id?.trim() ?? "";
  if (isReservedPausedSubagentRole(roleId)) {
    return null;
  }
  if (!roleId && !instanceId) {
    return null;
  }
  return {
    instance_id: instanceId,
    reason: pausedSubagent.reason?.trim() || null,
    role_id: roleId,
    task_id: pausedSubagent.task_id?.trim() || null,
  };
}

function pausedSubagentLabel(pausedSubagent: RecoveryPausedSubagent): string {
  const roleId = pausedSubagent.role_id?.trim() ?? "";
  const instanceId = pausedSubagent.instance_id?.trim() ?? "";
  return roleId || instanceId || "unknown";
}

function isReservedPausedSubagentRole(roleId: string): boolean {
  const compactRoleId = roleId.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return (
    compactRoleId === "mainagent" ||
    compactRoleId === "coordinator" ||
    compactRoleId === "coordinatoragent"
  );
}

function pausedSubagentDetail(pausedSubagent: RecoveryPausedSubagent): string {
  return [
    pausedSubagent.instance_id?.trim()
      ? `instance: ${pausedSubagent.instance_id.trim()}`
      : "",
    pausedSubagent.task_id?.trim() ? `task: ${pausedSubagent.task_id.trim()}` : "",
    pausedSubagent.reason?.trim() ? pausedSubagent.reason.trim() : "",
  ]
    .filter(Boolean)
    .join(" | ");
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

interface NormalizedApprovalOption {
  action: ToolApprovalAction;
  label: string;
  optionId: string;
}

function normalizedApprovalOptions(
  options: ToolApprovalOption[] | undefined,
): NormalizedApprovalOption[] {
  if (options === undefined) {
    return [];
  }
  return options
    .map(normalizedApprovalOption)
    .filter((option): option is NormalizedApprovalOption => option !== null);
}

function normalizedApprovalOption(
  option: ToolApprovalOption,
): NormalizedApprovalOption | null {
  const optionId =
    approvalOptionText(option.optionId) ||
    approvalOptionText(option.option_id) ||
    approvalOptionText(option.id);
  const label = approvalOptionLabel(option);
  if (!optionId || !label) {
    return null;
  }
  return {
    action: approvalActionForAcpOption(option.kind),
    label,
    optionId,
  };
}

function approvalActionForAcpOption(kind: string | undefined): ToolApprovalAction {
  const normalizedKind = approvalOptionText(kind).toLowerCase();
  if (
    normalizedKind === "reject_once" ||
    normalizedKind === "reject_always" ||
    normalizedKind === "deny"
  ) {
    return "deny";
  }
  return "approve";
}

function approvalOptionLabel(option: ToolApprovalOption): string {
  const rawLabel =
    approvalOptionText(option.label) ||
    approvalOptionText(option.name) ||
    approvalOptionText(option.kind) ||
    approvalOptionText(option.optionId) ||
    approvalOptionText(option.option_id) ||
    approvalOptionText(option.id);
  return humanizeApprovalOptionLabel(rawLabel);
}

function approvalOptionText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function humanizeApprovalOptionLabel(value: string): string {
  if (!value.includes("_") && !value.includes("-")) {
    return value;
  }
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0) {
        return word;
      }
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}
