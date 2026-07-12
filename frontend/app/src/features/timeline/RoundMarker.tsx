import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type MouseEvent } from "react";

import type { SessionRound } from "../../api/contracts";
import type { Translate, TranslationKey } from "../../i18n";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import {
  formatRoundTokens,
  type RoundMicrocompactSummary,
  type RoundRetrySummary,
  roundStatusDisplayLabel,
  roundSummary,
} from "./roundMetadata";
import { recordTerminalDomSnapshot } from "./terminalDomSnapshot";
import "./RoundMarker.css";

interface RoundMarkerProps {
  index: number;
  onPromptOpenChange?: (open: boolean) => void;
  onPromptToggle?: (event: MouseEvent<HTMLButtonElement>) => void;
  promptOpen?: boolean;
  round: SessionRound;
  t: Translate;
}

export function RoundMarker({
  index,
  onPromptOpenChange,
  onPromptToggle,
  promptOpen = false,
  round,
  t,
}: RoundMarkerProps) {
  const summary = roundSummary(round, index);
  const runtimeTerminalEventType = useRuntimeStore(
    (state) => state.runtimeState.runs[round.run_id]?.terminalEventType ?? null,
  );
  const liveStatusLabel = terminalStatusLabel(runtimeTerminalEventType) ??
    summary.statusLabel;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const lastMarkedStatusRef = useRef("");
  const applyTerminalStatus = (status: string, terminalEventType: string | null) => {
    const normalizedStatus = status.trim().toLowerCase();
    if (!roundMarkerStatusIsTerminal(normalizedStatus)) {
      return;
    }
    const container = containerRef.current;
    if (container !== null) {
      container.dataset.roundStatus = normalizedStatus;
      if (terminalEventType === null) {
        delete container.dataset.runtimeTerminalEvent;
      } else {
        container.dataset.runtimeTerminalEvent = terminalEventType;
      }
      const markerRow = container.closest<HTMLElement>(".at-round-marker");
      if (markerRow !== null) {
        markerRow.dataset.runStatus = normalizedStatus;
        if (terminalEventType !== null) {
          markerRow.dataset.runtimeTerminalEvent = terminalEventType;
        }
      }
    }
    if (statusRef.current !== null) {
      statusRef.current.textContent = roundStatusDisplayLabel(normalizedStatus, t);
    }
    if (lastMarkedStatusRef.current === normalizedStatus) {
      return;
    }
    lastMarkedStatusRef.current = normalizedStatus;
    try {
      globalThis.performance?.mark(
        `agent-teams:terminal:light-dom:${round.run_id}:${normalizedStatus}`,
      );
      globalThis.performance?.mark(
        `agent-teams:terminal:dom:${round.run_id}:${normalizedStatus}`,
      );
      recordTerminalDomSnapshot(containerRef.current, round.run_id, "light");
    } catch {
      // Performance instrumentation must never affect marker rendering.
    }
  };
  useEffect(() => useRuntimeStore.subscribe((state) => {
    const terminalEventType = state.runtimeState.runs[round.run_id]?.terminalEventType ?? null;
    const status = terminalStatusLabel(terminalEventType);
    if (status !== null) {
      applyTerminalStatus(status, terminalEventType);
    }
  }), [round.run_id, t]);
  useLayoutEffect(() => {
    const status = liveStatusLabel?.trim().toLowerCase() ?? "";
    applyTerminalStatus(status, runtimeTerminalEventType);
  }, [liveStatusLabel, round.run_id, runtimeTerminalEventType]);
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
    summary.durationLabel !== null ? `${summary.durationLabel}` : "",
  ].filter(Boolean);
  const handlePromptSummaryClick = (event: MouseEvent<HTMLButtonElement>) => {
    onPromptOpenChange?.(!promptOpen);
    onPromptToggle?.(event);
  };
  const promptActionLabel = promptOpen
    ? t("timelineRoundCollapse")
    : t("timelineRoundExpand");

  return (
    <div
      className="at-round-marker-content"
      data-round-status={liveStatusLabel}
      data-runtime-terminal-event={runtimeTerminalEventType ?? undefined}
      ref={containerRef}
    >
      <div className="at-round-marker-meta">
        {metaItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span ref={statusRef}>{roundStatusDisplayLabel(liveStatusLabel, t)}</span>
      </div>
      {summary.promptCollapsible ? (
        <div
          className="at-round-marker-intent"
          data-open={promptOpen ? "true" : "false"}
        >
          <div
            className={[
              "at-round-prompt-body",
              promptOpen ? "is-expanded" : "is-collapsed",
            ].join(" ")}
          >
            {summary.promptText}
          </div>
          <button
            aria-expanded={promptOpen}
            className="at-round-prompt-toggle"
            onClick={handlePromptSummaryClick}
            type="button"
          >
            {promptOpen ? <ChevronUp aria-hidden="true" size={14} /> : (
              <ChevronDown aria-hidden="true" size={14} />
            )}
            <span className="at-round-marker-intent-action">
              {promptActionLabel}
            </span>
          </button>
        </div>
      ) : (
        <div className="at-round-marker-title">{summary.title}</div>
      )}
    </div>
  );
}

function roundMarkerStatusIsTerminal(status: string): boolean {
  return [
    "cancelled",
    "canceled",
    "completed",
    "failed",
    "paused",
    "stopped",
  ].includes(status);
}

function terminalStatusLabel(eventType: string | null): string | null {
  switch (eventType) {
    case "run_completed":
      return "completed";
    case "run_failed":
      return "failed";
    case "run_paused":
      return "paused";
    case "run_stopped":
      return "stopped";
    default:
      return null;
  }
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
