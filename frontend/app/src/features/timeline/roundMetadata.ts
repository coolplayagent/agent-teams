import {
  contentPartText,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundMessagePart,
} from "../../api/contracts";

export interface RoundSummary {
  durationLabel: string | null;
  inputTokens: number;
  outputTokens: number;
  statusLabel: string | null;
  timeLabel: string;
  title: string;
  toolCount: number;
}

export function roundSummary(round: SessionRound, index: number): RoundSummary {
  return {
    durationLabel: roundDurationLabel(round),
    inputTokens: roundInputTokens(round),
    outputTokens: roundOutputTokens(round),
    statusLabel: roundStatusLabel(round),
    timeLabel: roundTimeLabel(round.created_at, index),
    title: roundTitle(round, index),
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

function roundStatusLabel(round: SessionRound): string | null {
  const rawStatus = normalizedText(round.run_status)
    || normalizedText(round.run_phase)
    || normalizedText(round.verification_status);
  return rawStatus || null;
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
