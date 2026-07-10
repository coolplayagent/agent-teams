import { Alert, App, Button, Checkbox, Input, Radio, Space, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { useTranslations, type Translate } from "../../i18n";
import type {
  RunStreamController,
  StartRunStreamTarget,
} from "../../runtime/useRunStreamController";

const NONE_OF_THE_ABOVE_OPTION_LABEL = "__none_of_the_above__";

interface RecoveryBarProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

export function RecoveryBar({ runStreamController, sessionId }: RecoveryBarProps) {
  const { message } = App.useApp();
  const t = useTranslations();
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
  const [approvalFeedbacks, setApprovalFeedbacks] = useState<Record<string, string>>(
    {},
  );
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [collapsedBackgroundRunIds, setCollapsedBackgroundRunIds] = useState<
    Record<string, boolean>
  >({});
  const observedActiveRunKeysRef = useRef(new Set<string>());
  const pendingIdleConfirmationRunKeysRef = useRef(new Set<string>());
  const recoveryQuery = useQuery({
    queryKey: ["sessions", sessionId, "recovery"],
    queryFn: () => getRecoverySnapshot(sessionId ?? ""),
    enabled: sessionId !== null,
    refetchOnWindowFocus: false,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (sessionId === null) {
      return undefined;
    }
    const refreshRecovery = () => {
      void queryClient.fetchQuery({
        queryKey: ["sessions", sessionId, "recovery"],
        queryFn: () => getRecoverySnapshot(sessionId, true),
        staleTime: 0,
      }).catch(() => undefined);
    };
    window.addEventListener("focus", refreshRecovery);
    return () => window.removeEventListener("focus", refreshRecovery);
  }, [queryClient, sessionId]);

  const activeRun = recoveryQuery.data?.active_run ?? null;
  const pendingApprovals = recoveryQuery.data?.pending_tool_approvals ?? [];
  const pendingQuestions = recoveryQuery.data?.pending_user_questions ?? [];
  const pausedSubagent = visiblePausedSubagent(
    recoveryQuery.data?.paused_subagent ?? null,
  );
  const activeBackgroundTasks = useMemo(
    () =>
      (recoveryQuery.data?.background_tasks ?? []).filter(isActiveBackgroundTask),
    [recoveryQuery.data?.background_tasks],
  );
  const hasPendingRecoveryItems =
    pendingApprovals.length > 0 ||
    pendingQuestions.length > 0 ||
    pausedSubagent !== null ||
    activeBackgroundTasks.length > 0;
  const visibleActiveRun =
    activeRun !== null &&
    runStreamController.suppressedRunIds.includes(activeRun.run_id) &&
    !hasPendingRecoveryItems
      ? null
      : activeRun;
  const recoveryRunStreamTargets = useMemo(
    () => buildRecoveryRunStreamTargets(activeRun, activeBackgroundTasks),
    [activeBackgroundTasks, activeRun],
  );
  const foregroundRecoveryRunIds = useMemo(
    () => foregroundRecoveryRunIdsFor(activeRun),
    [activeRun],
  );
  const streamableRecoveryRunStreamTargets = useMemo(
    () =>
      recoveryRunStreamTargets.filter(
        (target) => !runStreamController.suppressedRunIds.includes(target.runId),
      ),
    [recoveryRunStreamTargets, runStreamController.suppressedRunIds],
  );
  const recoveryRunStreamTargetsKey = recoveryRunStreamTargets
    .map(recoveryRunStreamTargetKey)
    .join("|");
  const streamableRecoveryRunStreamTargetsKey = streamableRecoveryRunStreamTargets
    .map(recoveryRunStreamTargetKey)
    .join("|");
  const foregroundRecoveryRunIdsKey = foregroundRecoveryRunIds.join("|");
  const trackedRunIdsForSession =
    runStreamController.trackedSessionId === undefined ||
      runStreamController.trackedSessionId === sessionId
      ? runStreamController.trackedRunIds
      : [];
  const trackedRunIdsKey = trackedRunIdsForSession.join("|");
  const suppressedRunIdsKey = runStreamController.suppressedRunIds.join("|");
  const recoverableRunId =
    visibleActiveRun?.should_show_recover === true ? visibleActiveRun.run_id : null;
  const showResumeAction = shouldShowResumeAction(
    visibleActiveRun,
    pendingApprovals,
    pendingQuestions,
    pausedSubagent,
    runStreamController.activeRunIds,
  );

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    for (const target of recoveryRunStreamTargets) {
      observedActiveRunKeysRef.current.add(
        recoveryRunObservationKey(sessionId, target.runId),
      );
    }
  }, [recoveryRunStreamTargets, recoveryRunStreamTargetsKey, sessionId]);

  useEffect(() => {
    if (sessionId === null || recoveryQuery.data === undefined) {
      return;
    }
    let disposed = false;
    const authoritativeActiveRunIds = new Set(
      recoveryRunStreamTargets.map((target) => target.runId),
    );
    const observedTerminalRunIds = trackedRunIdsForSession.filter(
      (runId) =>
        observedActiveRunKeysRef.current.has(
          recoveryRunObservationKey(sessionId, runId),
        ) && !authoritativeActiveRunIds.has(runId),
    );
    for (const runId of observedTerminalRunIds) {
      observedActiveRunKeysRef.current.delete(
        recoveryRunObservationKey(sessionId, runId),
      );
    }
    if (observedTerminalRunIds.length > 0) {
      runStreamController.settleTerminalRunStream({
        runIds: observedTerminalRunIds,
        sessionId,
      });
    }

    const unconfirmedRunIds = trackedRunIdsForSession.filter((runId) => {
      const observationKey = recoveryRunObservationKey(sessionId, runId);
      return (
        !authoritativeActiveRunIds.has(runId) &&
        !observedActiveRunKeysRef.current.has(observationKey) &&
        !pendingIdleConfirmationRunKeysRef.current.has(observationKey)
      );
    });
    if (unconfirmedRunIds.length === 0) {
      return;
    }
    const confirmationKeys = unconfirmedRunIds.map((runId) =>
      recoveryRunObservationKey(sessionId, runId),
    );
    for (const confirmationKey of confirmationKeys) {
      pendingIdleConfirmationRunKeysRef.current.add(confirmationKey);
    }
    void getRecoverySnapshot(sessionId, true)
      .then((snapshot) => {
        if (disposed) {
          return;
        }
        queryClient.setQueryData(["sessions", sessionId, "recovery"], snapshot);
        const confirmedActiveRunIds = new Set(
          buildRecoveryRunStreamTargets(
            snapshot.active_run,
            snapshot.background_tasks.filter(isActiveBackgroundTask),
          ).map((target) => target.runId),
        );
        const confirmedTerminalRunIds = unconfirmedRunIds.filter(
          (runId) => !confirmedActiveRunIds.has(runId),
        );
        if (confirmedTerminalRunIds.length > 0) {
          runStreamController.settleTerminalRunStream({
            runIds: confirmedTerminalRunIds,
            sessionId,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        for (const confirmationKey of confirmationKeys) {
          pendingIdleConfirmationRunKeysRef.current.delete(confirmationKey);
        }
      });
    return () => {
      disposed = true;
    };
  }, [
    queryClient,
    recoveryQuery.data,
    recoveryRunStreamTargets.length,
    runStreamController,
    sessionId,
    trackedRunIdsKey,
  ]);

  useEffect(() => {
    if (sessionId === null || streamableRecoveryRunStreamTargets.length === 0) {
      return;
    }
    if (
      runStreamIdsMatchTargets(
        runStreamController.trackedRunIds,
        streamableRecoveryRunStreamTargets,
      )
    ) {
      return;
    }
    if (streamableRecoveryRunStreamTargets.length === 1) {
      const [target] = streamableRecoveryRunStreamTargets;
      runStreamController.startRunStream({
        afterEventId: target.afterEventId,
        foreground: foregroundRecoveryRunIds.includes(target.runId),
        runId: target.runId,
        sessionId,
      });
      return;
    }
    runStreamController.startRunStreams({
      foregroundRunIds: foregroundRecoveryRunIds,
      runs: streamableRecoveryRunStreamTargets,
      sessionId,
    });
  }, [
    trackedRunIdsKey,
    suppressedRunIdsKey,
    recoveryRunStreamTargetsKey,
    streamableRecoveryRunStreamTargetsKey,
    streamableRecoveryRunStreamTargets,
    foregroundRecoveryRunIdsKey,
    foregroundRecoveryRunIds,
    runStreamController,
    sessionId,
  ]);

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
      if (shouldResumeBeforeRecoveryAction(activeRun, request.runId)) {
        await resumeRecoverableRun(request.runId);
      }
      const feedback = request.feedback?.trim() ?? "";
      if (feedback) {
        return resolveToolApproval(
          request.runId,
          request.toolCallId,
          request.action,
          request.optionId,
          feedback,
        );
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
    onSuccess: (_result, request) => {
      setApprovalFeedbacks((current) => removeRecordKey(current, request.toolCallId));
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
    mutationFn: async (question: PendingUserQuestion) => {
      const answers = buildQuestionAnswer(
        question,
        questionSelections,
        questionSupplements,
      );
      if (answers === null) {
        throw new Error("Select an answer for each question.");
      }
      if (shouldResumeBeforeRecoveryAction(activeRun, question.run_id)) {
        await resumeRecoverableRun(question.run_id);
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

  if (sessionId === null || recoveryQuery.isLoading) {
    return null;
  }
  const recoveryPanelRunId = recoveryPanelRunKey(activeRun, activeBackgroundTasks);
  if (!hasPendingRecoveryItems && !showResumeAction) {
    return null;
  }

  return (
    <Alert
      className={
        showResumeAction && !hasPendingRecoveryItems
          ? "at-recovery is-resume-only"
          : "at-recovery"
      }
      message={
        <div className="at-recovery-body">
          {showResumeAction || activeBackgroundTasks.length > 0 ? (
            <Space size={8}>
              <span>
                {recoveryStatusText(
                  showResumeAction ? visibleActiveRun : null,
                  activeBackgroundTasks,
                  t,
                )}
              </span>
              {showResumeAction ? (
                <Button
                  loading={resumeMutation.isPending}
                  onClick={() => resumeMutation.mutate()}
                  size="small"
                  type="primary"
                >
                  {t("recoveryResume")}
                </Button>
              ) : null}
            </Space>
          ) : null}
          <BackgroundTasksPanel
            activeRunId={recoveryPanelRunId}
            busyTaskId={
              stopBackgroundTaskMutation.isPending
                ? stopBackgroundTaskMutation.variables?.backgroundTaskId ?? null
                : null
            }
            collapsed={collapsedBackgroundRunIds[recoveryPanelRunId] === true}
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
          {visibleActiveRun === null ? null : (
            <PendingApprovals
              activeRunId={visibleActiveRun.run_id}
              approvals={pendingApprovals}
              busyToolCallId={
                approvalMutation.isPending
                  ? approvalMutation.variables?.toolCallId ?? null
                  : null
              }
              errors={approvalErrors}
              feedbacks={approvalFeedbacks}
              onFeedbackChange={(toolCallId, feedback) => {
                setApprovalFeedbacks((current) => ({
                  ...current,
                  [toolCallId]: feedback,
                }));
              }}
              onResolve={(request) => approvalMutation.mutate(request)}
            />
          )}
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
            onSupplementChange={(questionId, promptIndex, label, supplement) => {
              setQuestionSupplements((current) => ({
                ...current,
                [supplementKey(questionId, promptIndex, label)]: supplement,
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
  feedback?: string;
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

function recoveryStatusText(
  activeRun: RecoveryRun | null,
  activeBackgroundTasks: RecoveryBackgroundTask[],
  t: Translate,
): string {
  if (activeRun !== null) {
    return activeRun.status === "stopped" || activeRun.phase === "stopped"
      ? t("recoveryRunStopped")
      : t("recoveryRunPaused");
  }
  if (activeBackgroundTasks.length === 1) {
    return t("recoveryBackgroundTaskActive");
  }
  if (activeBackgroundTasks.length > 1) {
    return t("recoveryBackgroundTasksActive", {
      count: activeBackgroundTasks.length,
    });
  }
  return t("recoveryNeedsAttention");
}

function recoveryPanelRunKey(
  activeRun: RecoveryRun | null,
  activeBackgroundTasks: RecoveryBackgroundTask[],
): string {
  const activeRunId = activeRun?.run_id.trim() ?? "";
  if (activeRunId) {
    return activeRunId;
  }
  for (const task of activeBackgroundTasks) {
    const taskRunId = task.run_id.trim();
    if (taskRunId) {
      return taskRunId;
    }
  }
  return "recovery";
}

interface PendingApprovalsProps {
  activeRunId: string;
  approvals: PendingToolApproval[];
  busyToolCallId: string | null;
  errors: Record<string, string>;
  feedbacks: Record<string, string>;
  onFeedbackChange: (toolCallId: string, feedback: string) => void;
  onResolve: (request: ApprovalActionRequest) => void;
}

function PendingApprovals({
  activeRunId,
  approvals,
  busyToolCallId,
  errors,
  feedbacks,
  onFeedbackChange,
  onResolve,
}: PendingApprovalsProps) {
  const t = useTranslations();
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
        const feedback = feedbacks[toolCallId] ?? approval.feedback ?? "";
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
              <Input
                aria-label={t("recoveryApprovalFeedbackLabel")}
                className="at-recovery-approval-feedback"
                disabled={disabled}
                onChange={(event) => onFeedbackChange(toolCallId, event.target.value)}
                placeholder={t("recoveryApprovalFeedbackPlaceholder")}
                size="small"
                value={feedback}
              />
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
                      feedback,
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
                    feedback,
                    runId: activeRunId,
                    toolCallId,
                  })
                }
                size="small"
                type="primary"
              >
                {t("recoveryApprove")}
              </Button>
              <Button
                danger
                disabled={disabled}
                loading={busy}
                onClick={() =>
                  onResolve({
                    action: "deny",
                    feedback,
                    runId: activeRunId,
                    toolCallId,
                  })
                }
                size="small"
              >
                {t("recoveryDeny")}
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
    label: string,
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
  const t = useTranslations();
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
                onSupplementChange={(label, supplement) =>
                  onSupplementChange(question.question_id, index, label, supplement)
                }
                disabled={disabled}
                prompt={prompt}
                selectedLabels={selections[selectionKey(question.question_id, index)] ?? []}
                selectedSupplement={(label) =>
                  supplements[supplementKey(question.question_id, index, label)] ?? ""
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
              {t("recoveryAnswer")}
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
  onSupplementChange: (label: string, supplement: string) => void;
  prompt: UserQuestionPrompt;
  selectedLabels: string[];
  selectedSupplement: (label: string) => string;
}

function QuestionPromptControl({
  disabled,
  onSelectionChange,
  onSupplementChange,
  prompt,
  selectedLabels,
  selectedSupplement,
}: QuestionPromptControlProps) {
  const t = useTranslations();
  const options = prompt.options.map((option) => ({
    label: questionOptionLabel(option.label, option.description, t("recoveryOtherOption")),
    supplementLabel: questionSupplementLabel(option.label, t("recoveryOtherOption")),
    value: option.label,
  }));
  const toggleCheckboxLabel = (label: string, checked: boolean) => {
    const nextLabels = checked
      ? [...selectedLabels, label].filter(uniqueLabel)
      : selectedLabels.filter((value) => value !== label);
    onSelectionChange(nextLabels);
  };
  return (
    <div className="at-recovery-prompt">
      <Typography.Text>{prompt.question}</Typography.Text>
      {prompt.multiple === true ? (
        <div className="at-recovery-option-list">
          {options.map((option) => {
            const selected = selectedLabels.includes(option.value);
            return (
              <div className="at-recovery-option" key={option.value}>
                <Checkbox
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleCheckboxLabel(option.value, event.target.checked)
                  }
                >
                  {option.label}
                </Checkbox>
                {selected ? (
                  <Input
                    aria-label={`${t("recoverySupplementLabel")} - ${option.supplementLabel}`}
                    className="at-recovery-option-supplement"
                    disabled={disabled}
                    onChange={(event) =>
                      onSupplementChange(option.value, event.target.value)
                    }
                    placeholder={
                      prompt.placeholder?.trim() || t("recoverySupplementPlaceholder")
                    }
                    size="small"
                    value={selectedSupplement(option.value)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <Radio.Group
          disabled={disabled || options.length === 0}
          onChange={(event) => onSelectionChange([String(event.target.value)])}
          value={selectedLabels[0] ?? null}
        >
          <div className="at-recovery-option-list">
            {options.map((option) => {
              const selected = selectedLabels.includes(option.value);
              return (
                <div className="at-recovery-option" key={option.value}>
                  <Radio value={option.value}>{option.label}</Radio>
                  {selected ? (
                    <Input
                      aria-label={`${t("recoverySupplementLabel")} - ${option.supplementLabel}`}
                      className="at-recovery-option-supplement"
                      disabled={disabled}
                      onChange={(event) =>
                        onSupplementChange(option.value, event.target.value)
                      }
                      placeholder={
                        prompt.placeholder?.trim()
                        || t("recoverySupplementPlaceholder")
                      }
                      size="small"
                      value={selectedSupplement(option.value)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </Radio.Group>
      )}
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
          supplements[supplementKey(question.question_id, index, label)]?.trim() ?? "";
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

function questionOptionLabel(
  label: string,
  description: string | undefined,
  otherLabel: string,
): string {
  if (label === NONE_OF_THE_ABOVE_OPTION_LABEL) {
    return otherLabel;
  }
  return description?.trim() ? `${label} - ${description}` : label;
}

function questionSupplementLabel(label: string, otherLabel: string): string {
  if (label === NONE_OF_THE_ABOVE_OPTION_LABEL) {
    return otherLabel;
  }
  return label;
}

function selectionKey(questionId: string, promptIndex: number): string {
  return `${questionId}:${promptIndex}`;
}

function supplementKey(
  questionId: string,
  promptIndex: number,
  label: string,
): string {
  return `${selectionKey(questionId, promptIndex)}:${label}`;
}

function uniqueLabel(label: string, index: number, labels: string[]): boolean {
  return labels.indexOf(label) === index;
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

function buildRecoveryRunStreamTargets(
  activeRun: RecoveryRun | null,
  activeBackgroundTasks: RecoveryBackgroundTask[],
): StartRunStreamTarget[] {
  const targets: StartRunStreamTarget[] = [];
  const activeRunStreamable = shouldStreamActiveRun(activeRun);
  if (activeRunStreamable) {
    addRecoveryRunStreamTarget(targets, activeRun.run_id, activeRun.last_event_id);
  }
  for (const task of activeBackgroundTasks) {
    addBackgroundRecoveryRunStreamTarget(
      targets,
      { runId: task.run_id },
      activeRun,
      activeRunStreamable,
    );
    addBackgroundRecoveryRunStreamTarget(
      targets,
      backgroundTaskOutputRunTarget(task),
      activeRun,
      activeRunStreamable,
    );
  }
  return targets;
}

function shouldStreamActiveRun(
  activeRun: RecoveryRun | null,
): activeRun is RecoveryRun {
  if (activeRun === null || activeRun.run_id.trim().length === 0) {
    return false;
  }
  if (activeRun.should_show_recover === true) {
    return false;
  }
  return (
    isStreamingRunStatus(activeRun.status) || isStreamingRunStatus(activeRun.phase)
  );
}

function foregroundRecoveryRunIdsFor(activeRun: RecoveryRun | null): string[] {
  const activeRunId = activeRun?.run_id.trim() ?? "";
  if (!activeRunId || activeRun?.should_show_recover === true) {
    return [];
  }
  if (
    !isStreamingRunStatus(activeRun?.status) &&
    !isStreamingRunStatus(activeRun?.phase)
  ) {
    return [];
  }
  return [activeRunId];
}

function addBackgroundRecoveryRunStreamTarget(
  targets: StartRunStreamTarget[],
  target: BackgroundRecoveryRunStreamTarget,
  activeRun: RecoveryRun | null,
  activeRunStreamable: boolean,
): void {
  const normalizedRunId = target.runId.trim();
  if (!normalizedRunId) {
    return;
  }
  const activeRunId = activeRun?.run_id.trim() ?? "";
  if (activeRunId && normalizedRunId === activeRunId && !activeRunStreamable) {
    return;
  }
  const activeRunAfterEventId =
    activeRunStreamable && normalizedRunId === activeRunId
      ? activeRun?.last_event_id
      : undefined;
  const afterEventId = target.afterEventId ?? activeRunAfterEventId;
  addRecoveryRunStreamTarget(targets, normalizedRunId, afterEventId);
}

function isStreamingRunStatus(status: string | undefined): boolean {
  switch (status?.trim().toLowerCase()) {
    case "queued":
    case "running":
    case "stopping":
      return true;
    default:
      return false;
  }
}

interface BackgroundRecoveryRunStreamTarget {
  afterEventId?: number;
  runId: string;
}

function backgroundTaskOutputRunTarget(
  task: RecoveryBackgroundTask,
): BackgroundRecoveryRunStreamTarget {
  if (task.kind === "subagent") {
    const subagentRunId = task.subagent_run_id?.trim() ?? "";
    if (subagentRunId) {
      return {
        afterEventId: normalizedRecoveryEventId(task.last_event_id),
        runId: subagentRunId,
      };
    }
  }
  return { runId: task.run_id };
}

function normalizedRecoveryEventId(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function addRecoveryRunStreamTarget(
  targets: StartRunStreamTarget[],
  runId: string,
  afterEventId: number | undefined,
): void {
  const normalizedRunId = runId.trim();
  if (!normalizedRunId) {
    return;
  }
  const existingIndex = targets.findIndex((target) => target.runId === normalizedRunId);
  if (existingIndex >= 0) {
    const existing = targets[existingIndex];
    if (afterEventId !== undefined) {
      targets[existingIndex] = {
        ...existing,
        afterEventId: Math.max(existing.afterEventId ?? 0, afterEventId),
      };
    }
    return;
  }
  if (afterEventId === undefined) {
    targets.push({ runId: normalizedRunId });
    return;
  }
  targets.push({ afterEventId, runId: normalizedRunId });
}

function recoveryRunObservationKey(sessionId: string, runId: string): string {
  return `${sessionId.trim()}:${runId.trim()}`;
}

function runStreamIdsMatchTargets(
  activeRunIds: string[],
  targets: StartRunStreamTarget[],
): boolean {
  if (activeRunIds.length !== targets.length) {
    return false;
  }
  const activeRunIdSet = new Set(activeRunIds);
  if (activeRunIdSet.size !== activeRunIds.length) {
    return false;
  }
  return targets.every((target) => activeRunIdSet.has(target.runId));
}

function recoveryRunStreamTargetKey(target: StartRunStreamTarget): string {
  return `${target.runId}:${target.afterEventId ?? ""}`;
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
  activeStreamRunIds: string[],
): boolean {
  if (activeRun?.should_show_recover !== true || !activeRun.run_id) {
    return false;
  }
  if (activeStreamRunIds.includes(activeRun.run_id)) {
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

function shouldResumeBeforeRecoveryAction(
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
