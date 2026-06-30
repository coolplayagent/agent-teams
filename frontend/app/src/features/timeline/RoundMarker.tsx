import type { SessionRound } from "../../api/contracts";
import type { Translate, TranslationKey } from "../../i18n";
import {
  formatRoundTokens,
  type RoundMicrocompactSummary,
  type RoundRetrySummary,
  roundSummary,
} from "./roundMetadata";

interface RoundMarkerProps {
  index: number;
  round: SessionRound;
  t: Translate;
}

export function RoundMarker({ index, round, t }: RoundMarkerProps) {
  const summary = roundSummary(round, index);
  const metaItems = [
    summary.timeLabel,
    summary.inputTokens > 0
      ? `${t("tokenInput")} ${formatRoundTokens(summary.inputTokens)}`
      : "",
    summary.outputTokens > 0
      ? `${t("tokenOutput")} ${formatRoundTokens(summary.outputTokens)}`
      : "",
    summary.toolCount > 0 ? `${t("timelineTools")} ${summary.toolCount}` : "",
    summary.pendingApprovalCount > 0
      ? t("timelinePendingApprovals", { count: summary.pendingApprovalCount })
      : "",
    summary.pendingQuestionCount > 0
      ? t("timelinePendingQuestions", { count: summary.pendingQuestionCount })
      : "",
    summary.retry !== null ? roundRetryMeta(summary.retry, t) : "",
    summary.microcompact !== null ? roundMicrocompactMeta(summary.microcompact, t) : "",
    summary.diagnosticLabel !== null
      ? `${t("timelineRoundDiagnostic")}: ${summary.diagnosticLabel}`
      : "",
    summary.statusLabel ?? "",
    summary.durationLabel !== null ? `${summary.durationLabel}` : "",
  ].filter(Boolean);

  return (
    <div className="at-round-marker-content">
      <div className="at-round-marker-meta">
        {metaItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {summary.promptCollapsible ? (
        <details className="at-round-marker-intent">
          <summary className="at-round-marker-intent-summary">
            <span className="at-round-marker-title">{summary.title}</span>
            <span className="at-round-marker-intent-action" aria-hidden="true">
              <span className="at-round-marker-intent-action-expand">
                {t("timelineRoundExpand")}
              </span>
              <span className="at-round-marker-intent-action-collapse">
                {t("timelineRoundCollapse")}
              </span>
            </span>
          </summary>
          <div className="at-round-marker-intent-body">{summary.promptText}</div>
        </details>
      ) : (
        <div className="at-round-marker-title">{summary.title}</div>
      )}
    </div>
  );
}

function roundMicrocompactMeta(
  microcompact: RoundMicrocompactSummary,
  t: Translate,
): string {
  return t("timelineMicrocompact", {
    after: formatRoundTokens(microcompact.estimatedTokensAfter),
    before: formatRoundTokens(microcompact.estimatedTokensBefore),
  });
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
