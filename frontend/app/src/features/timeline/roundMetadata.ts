import {
  contentPartText,
  type JsonValue,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundMessagePart,
} from "../../api/contracts";

export type RoundTone = "error" | "warning";

export type RoundRetryPhase =
  | "failed"
  | "fallback"
  | "fallbackFailed"
  | "retrying"
  | "scheduled"
  | "succeeded";

export interface RoundRetrySummary {
  attemptNumber: number;
  errorLabel: string;
  phase: RoundRetryPhase;
  retryDelaySeconds: number;
  targetLabel: string;
  totalAttempts: number;
}

export interface RoundSummary {
  diagnosticLabel: string | null;
  durationLabel: string | null;
  inputTokens: number;
  outputTokens: number;
  pendingApprovalCount: number;
  pendingQuestionCount: number;
  retry: RoundRetrySummary | null;
  statusLabel: string | null;
  timeLabel: string;
  title: string;
  tone: RoundTone | null;
  toolCount: number;
}

export function roundSummary(round: SessionRound, index: number): RoundSummary {
  const retry = roundRetrySummary(round);
  const pendingApprovalCount = positiveNumber(round.pending_tool_approval_count);
  const pendingQuestionCount = positiveNumber(round.pending_user_question_count);
  return {
    diagnosticLabel: roundDiagnosticLabel(round),
    durationLabel: roundDurationLabel(round),
    inputTokens: roundInputTokens(round),
    outputTokens: roundOutputTokens(round),
    pendingApprovalCount,
    pendingQuestionCount,
    retry,
    statusLabel: roundStatusLabel(round),
    timeLabel: roundTimeLabel(round.created_at, index),
    title: roundTitle(round, index),
    tone: roundTone({
      pendingApprovalCount,
      pendingQuestionCount,
      retry,
      round,
    }),
    toolCount: roundToolCount(round),
  };
}

export function roundTitle(round: SessionRound, index: number): string {
  const intentText = normalizedText(round.run_user_message)
    || normalizedText(roundIntentText(round))
    || normalizedText(round.intent)
    || normalizedText(round.run_diagnostic_message);
  if (intentText) {
    return intentText;
  }
  return `Round ${index + 1}`;
}

export function roundTimeLabel(value: string | undefined, index: number): string {
  if (value === undefined || value.trim().length === 0) {
    return `#${index + 1}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `#${index + 1}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRoundTokens(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function roundIntentText(round: SessionRound): string {
  const parts = round.intent_parts ?? [];
  return parts
    .map((part) => contentPartText(part))
    .filter((text): text is string => text !== null && text.trim().length > 0)
    .join("");
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function roundMessages(round: SessionRound): SessionRoundMessage[] {
  return [
    ...(round.coordinator_messages ?? []),
    ...(round.injection_messages ?? []),
  ];
}

function roundInputTokens(round: SessionRound): number {
  return roundMessages(round).reduce(
    (total, message) => total + positiveNumber(message.message?.usage?.input_tokens),
    0,
  );
}

function roundOutputTokens(round: SessionRound): number {
  return roundMessages(round).reduce(
    (total, message) => total + positiveNumber(message.message?.usage?.output_tokens),
    0,
  );
}

function roundToolCount(round: SessionRound): number {
  return roundMessages(round).reduce(
    (total, message) => total + messageParts(message).filter(isToolCallPart).length,
    0,
  );
}

function messageParts(message: SessionRoundMessage): SessionRoundMessagePart[] {
  return message.message?.parts ?? [];
}

function isToolCallPart(part: SessionRoundMessagePart): boolean {
  return part.part_kind === "tool-call" || part.kind === "tool_call";
}

function positiveNumber(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundDiagnosticLabel(round: SessionRound): string | null {
  const diagnostic = normalizedText(round.run_diagnostic_message);
  return diagnostic.length > 0 ? truncateLabel(diagnostic) : null;
}

function roundRetrySummary(round: SessionRound): RoundRetrySummary | null {
  const events = (round.retry_events ?? []).flatMap((event) => {
    const object = jsonObject(event);
    return object === null ? [] : [object];
  });
  const latest = events.find((event) => objectBoolean(event, "is_active")) ?? events.at(-1);
  if (latest === undefined) {
    return null;
  }
  const kind = objectString(latest, "kind");
  const phase = retryPhase(kind, objectString(latest, "phase"));
  return {
    attemptNumber: objectPositiveNumber(latest, "attempt_number"),
    errorLabel: objectString(latest, "error_message") || objectString(latest, "error_code"),
    phase,
    retryDelaySeconds: Math.ceil(objectPositiveNumber(latest, "retry_in_ms") / 1000),
    targetLabel: objectString(latest, "to_profile_id")
      || objectString(latest, "target_profile_id")
      || objectString(latest, "model_profile_id"),
    totalAttempts: objectPositiveNumber(latest, "total_attempts"),
  };
}

function retryPhase(kind: string, phase: string): RoundRetryPhase {
  const normalizedKind = kind.toLowerCase();
  const normalizedPhase = phase.toLowerCase();
  if (normalizedKind === "fallback") {
    return normalizedPhase === "failed" ? "fallbackFailed" : "fallback";
  }
  if (normalizedPhase === "failed" || normalizedPhase === "exhausted") {
    return "failed";
  }
  if (normalizedPhase === "retrying" || normalizedPhase === "running") {
    return "retrying";
  }
  if (normalizedPhase === "succeeded" || normalizedPhase === "resumed") {
    return "succeeded";
  }
  return "scheduled";
}

function roundTone({
  pendingApprovalCount,
  pendingQuestionCount,
  retry,
  round,
}: {
  pendingApprovalCount: number;
  pendingQuestionCount: number;
  retry: RoundRetrySummary | null;
  round: SessionRound;
}): RoundTone | null {
  if (roundVerificationStatus(round) === "failed") {
    return "warning";
  }
  if (
    retry?.phase === "failed" ||
    retry?.phase === "fallbackFailed" ||
    normalizedText(round.run_status).toLowerCase() === "failed"
  ) {
    return "error";
  }
  if (pendingApprovalCount > 0 || pendingQuestionCount > 0 || retry !== null) {
    return "warning";
  }
  return null;
}

function roundStatusLabel(round: SessionRound): string | null {
  if (roundVerificationStatus(round) === "failed") {
    return "verification failed";
  }
  const rawStatus = normalizedText(round.run_status)
    || normalizedText(round.run_phase)
    || normalizedText(round.verification_status);
  return rawStatus || null;
}

function roundVerificationStatus(round: SessionRound): string {
  return normalizedText(round.verification_status).toLowerCase();
}

function roundDurationLabel(round: SessionRound): string | null {
  const start = timestampMs(round.run_started_at) ?? timestampMs(round.created_at);
  const end = timestampMs(round.run_updated_at);
  if (start === null || end === null || end <= start) {
    return null;
  }
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function timestampMs(value: string | null | undefined): number | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function objectString(
  object: Record<string, JsonValue>,
  key: string,
): string {
  const value = object[key];
  return typeof value === "string" ? value.trim() : "";
}

function objectPositiveNumber(
  object: Record<string, JsonValue>,
  key: string,
): number {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function objectBoolean(
  object: Record<string, JsonValue>,
  key: string,
): boolean {
  return object[key] === true;
}

function truncateLabel(value: string): string {
  if (value.length <= 90) {
    return value;
  }
  return `${value.slice(0, 87)}...`;
}
