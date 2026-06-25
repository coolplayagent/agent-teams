import { useState, type FocusEvent, type MouseEvent } from "react";

import type { SessionRound, SessionRoundTodoItem } from "../../api/contracts";
import type { Translate, TranslationKey } from "../../i18n";
import { type RoundRetrySummary, roundSummary, type RoundSummary } from "./roundMetadata";

interface RoundRailProps {
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  rounds: SessionRound[];
  t: Translate;
}

export function RoundRail({
  activeRunId,
  onSelectRun,
  rounds,
  t,
}: RoundRailProps) {
  const [activeDetail, setActiveDetail] = useState<RoundRailDetailPosition | null>(null);
  const showDetail = (runId: string, element: HTMLElement) => {
    setActiveDetail(detailPosition(runId, element.getBoundingClientRect()));
  };
  const hideDetail = () => {
    setActiveDetail(null);
  };

  return (
    <nav aria-label={t("timelineRounds")} className="at-round-rail">
      <div className="at-round-rail-list">
        {rounds.map((round, index) => {
          const summary = roundSummary(round, index);
          const active = round.run_id === activeRunId;
          const detailId = `at-round-rail-detail-${index}`;
          const todoItems = round.todo?.items ?? [];
          const detailOpen = activeDetail?.runId === round.run_id;
          const classNames = [
            "at-round-rail-item",
            active ? "is-active" : "",
            summary.tone !== null ? `is-${summary.tone}` : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              className="at-round-rail-node"
              key={round.run_id}
              onBlur={(event) => handleDetailBlur(event, hideDetail)}
              onFocus={(event) => showDetail(round.run_id, event.currentTarget)}
              onMouseEnter={(event) => showDetail(round.run_id, event.currentTarget)}
              onMouseLeave={hideDetail}
            >
              <button
                aria-current={active ? "step" : undefined}
                aria-describedby={detailId}
                aria-label={t("timelineGoToRound", {
                  round: index + 1,
                  title: summary.title,
                })}
                className={classNames}
                onClick={() => onSelectRun(round.run_id)}
                title={`${summary.timeLabel} ${summary.title}`}
                type="button"
              >
                <span className="at-round-rail-dot" />
                <span className="at-round-rail-time">{summary.timeLabel}</span>
                <span className="at-round-rail-title">{summary.title}</span>
              </button>
              <div
                aria-label={t("timelineRoundDetail")}
                className={
                  detailOpen
                    ? "at-round-rail-detail is-open"
                    : "at-round-rail-detail"
                }
                id={detailId}
                style={
                  detailOpen
                    ? { left: activeDetail.left, top: activeDetail.top }
                    : undefined
                }
              >
                <RoundRailDetail summary={summary} t={t} todoItems={todoItems} />
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

interface RoundRailDetailPosition {
  left: number;
  runId: string;
  top: number;
}

const ROUND_RAIL_DETAIL_WIDTH = 272;
const ROUND_RAIL_DETAIL_MAX_HEIGHT = 320;
const ROUND_RAIL_DETAIL_GAP = 8;
const ROUND_RAIL_DETAIL_MARGIN = 12;

function detailPosition(runId: string, rect: DOMRect): RoundRailDetailPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(
    ROUND_RAIL_DETAIL_MARGIN,
    Math.min(
      rect.left - ROUND_RAIL_DETAIL_WIDTH - ROUND_RAIL_DETAIL_GAP,
      viewportWidth - ROUND_RAIL_DETAIL_WIDTH - ROUND_RAIL_DETAIL_MARGIN,
    ),
  );
  const top = Math.max(
    ROUND_RAIL_DETAIL_MARGIN,
    Math.min(rect.top, viewportHeight - ROUND_RAIL_DETAIL_MAX_HEIGHT - ROUND_RAIL_DETAIL_MARGIN),
  );
  return { left, runId, top };
}

function handleDetailBlur(
  event: FocusEvent<HTMLDivElement>,
  hideDetail: () => void,
): void {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
    return;
  }
  hideDetail();
}

function RoundRailDetail({
  summary,
  t,
  todoItems,
}: {
  summary: RoundSummary;
  t: Translate;
  todoItems: SessionRoundTodoItem[];
}) {
  const metaItems = roundDetailMetaItems(summary, t);
  return (
    <>
      {metaItems.length > 0 ? (
        <div className="at-round-rail-detail-meta">
          {metaItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      {todoItems.length > 0 ? (
        <div className="at-round-rail-todo">
          <div className="at-round-rail-todo-head">
            <strong>{t("timelineRoundTodo")}</strong>
            <span>{t("timelineRoundTodoItems", { count: todoItems.length })}</span>
          </div>
          <ul>
            {todoItems.map((item, index) => (
              <li key={`${item.status}-${index}-${item.content}`}>
                <span title={item.content}>{item.content}</span>
                <em>{todoStatusLabel(item.status, t)}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function roundDetailMetaItems(summary: RoundSummary, t: Translate): string[] {
  return [
    summary.statusLabel ?? "",
    summary.pendingApprovalCount > 0
      ? t("timelinePendingApprovals", { count: summary.pendingApprovalCount })
      : "",
    summary.pendingQuestionCount > 0
      ? t("timelinePendingQuestions", { count: summary.pendingQuestionCount })
      : "",
    summary.retry !== null ? roundRetryMeta(summary.retry, t) : "",
    summary.diagnosticLabel !== null
      ? `${t("timelineRoundDiagnostic")}: ${summary.diagnosticLabel}`
      : "",
  ].filter(Boolean);
}

function roundRetryMeta(retry: RoundRetrySummary, t: Translate): string {
  const details = [
    retry.attemptNumber > 0 && retry.totalAttempts > 0
      ? t("timelineRetryAttempt", {
          attempt: retry.attemptNumber,
          total: retry.totalAttempts,
        })
      : "",
    retry.retryDelaySeconds > 0
      ? t("timelineRetryDelay", { seconds: retry.retryDelaySeconds })
      : "",
    retry.targetLabel.length > 0
      ? t("timelineRetryTarget", { target: retry.targetLabel })
      : "",
    retry.errorLabel,
  ].filter(Boolean);
  const label = t(retryLabelKey(retry));
  return details.length > 0 ? `${label}: ${details.join(" · ")}` : label;
}

function retryLabelKey(retry: RoundRetrySummary): TranslationKey {
  switch (retry.phase) {
    case "failed":
      return "timelineRetryFailed";
    case "fallback":
      return "timelineFallback";
    case "fallbackFailed":
      return "timelineFallbackFailed";
    case "retrying":
      return "timelineRetrying";
    case "succeeded":
      return "timelineRetryResumed";
    case "scheduled":
      return "timelineRetryScheduled";
  }
}

function todoStatusLabel(status: string, t: Translate): string {
  const key = todoStatusKey(status);
  return key === null ? status : t(key);
}

function todoStatusKey(status: string): TranslationKey | null {
  switch (status) {
    case "completed":
      return "timelineTodoCompleted";
    case "in_progress":
      return "timelineTodoInProgress";
    case "pending":
      return "timelineTodoPending";
    default:
      return null;
  }
}
