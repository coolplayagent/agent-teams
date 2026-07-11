import {
  type BinaryMediaPart,
  contentPartText,
  type ContentMediaRefPart,
  type ContentPart,
  type InlineMediaPart,
  type JsonValue,
  type LegacyContentMediaRefPart,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundMessagePart,
  type UrlMediaPart,
} from "../../api/contracts";

export const MESSAGE_TRANSCRIPT_SCHEMA = "relay-teams.session-transcript";
export const MESSAGE_TRANSCRIPT_VERSION = 1;

export type TranscriptEntryKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool"
  | "injection"
  | "question"
  | "subagent"
  | "status";

export interface TranscriptToolMetadata {
  args?: JsonValue;
  callId?: string;
  isError?: boolean;
  name: string;
  result?: JsonValue;
  stage: "call" | "return";
}

export interface TranscriptEntryMetadata {
  entryType?: string;
  injectionId?: string;
  instanceId?: string;
  messageId?: string;
  role?: string;
  roleId?: string;
  source?: string;
  status?: string;
  tool?: TranscriptToolMetadata;
}

export interface TranscriptEntry {
  createdAt?: string;
  id: string;
  kind: TranscriptEntryKind;
  label: string;
  metadata: TranscriptEntryMetadata;
  roundIndex: number;
  runId: string;
  sequence: number;
  text: string;
}

export interface TranscriptRound {
  createdAt?: string;
  entries: TranscriptEntry[];
  index: number;
  runId: string;
  status?: string;
}

export interface MessageTranscript {
  entries: TranscriptEntry[];
  exportedAt: string;
  rounds: TranscriptRound[];
  schema: typeof MESSAGE_TRANSCRIPT_SCHEMA;
  sessionId: string;
  version: typeof MESSAGE_TRANSCRIPT_VERSION;
}

interface SortableMessage {
  fallbackOrder: number;
  message: SessionRoundMessage;
}

export function buildMessageTranscript(
  sessionId: string,
  rounds: SessionRound[],
  exportedAt = new Date().toISOString(),
): MessageTranscript {
  let sequence = 0;
  const transcriptRounds = rounds.map((round, roundIndex): TranscriptRound => {
    const entries: TranscriptEntry[] = [];
    const prompt = contentPartsText(round.intent_parts) || normalizedText(round.intent);
    if (prompt) {
      entries.push({
        createdAt: round.created_at,
        id: `${round.run_id}:prompt`,
        kind: "user",
        label: "User",
        metadata: { role: "user" },
        roundIndex,
        runId: round.run_id,
        sequence: sequence++,
        text: prompt,
      });
    }

    const messages = mergeRoundMessages(round);
    messages.forEach((message, messageIndex) => {
      const projected = projectMessage(message, round, roundIndex, messageIndex, sequence);
      sequence += projected.length;
      entries.push(...projected);
    });

    const statusEntries = projectRoundStatus(round, roundIndex, sequence);
    sequence += statusEntries.length;
    entries.push(...statusEntries);
    return {
      createdAt: round.created_at,
      entries,
      index: roundIndex,
      runId: round.run_id,
      status: joinedStatus(round),
    };
  });
  return {
    entries: transcriptRounds.flatMap((round) => round.entries),
    exportedAt,
    rounds: transcriptRounds,
    schema: MESSAGE_TRANSCRIPT_SCHEMA,
    sessionId,
    version: MESSAGE_TRANSCRIPT_VERSION,
  };
}

export function serializeMessageTranscript(transcript: MessageTranscript): string {
  return JSON.stringify(transcript, null, 2);
}

function mergeRoundMessages(round: SessionRound): SessionRoundMessage[] {
  const coordinator = (round.coordinator_messages ?? []).map(
    (message, index): SortableMessage => ({ fallbackOrder: index, message }),
  );
  const injections = (round.injection_messages ?? []).map(
    (message, index): SortableMessage => ({
      fallbackOrder: coordinator.length + index,
      message: { ...message, entry_type: "injection" },
    }),
  );
  return [...coordinator, ...injections]
    .sort(compareMessages)
    .map((item) => item.message);
}

function compareMessages(left: SortableMessage, right: SortableMessage): number {
  const leftTime = parsedTime(left.message.created_at);
  const rightTime = parsedTime(right.message.created_at);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime !== null && rightTime === null) {
    return -1;
  }
  if (leftTime === null && rightTime !== null) {
    return 1;
  }
  return left.fallbackOrder - right.fallbackOrder;
}

function projectMessage(
  message: SessionRoundMessage,
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  firstSequence: number,
): TranscriptEntry[] {
  const parts = message.message?.parts ?? [];
  const partEntries = parts.flatMap((part, partIndex) => {
    const entry = projectPart(message, part, round, roundIndex, messageIndex, partIndex);
    return entry === null ? [] : [entry];
  });
  if (partEntries.length > 0) {
    return partEntries.map((entry, index) => ({ ...entry, sequence: firstSequence + index }));
  }
  const text = messageText(message);
  if (!text) {
    return [];
  }
  return [{
    ...baseEntry(message, round, roundIndex, messageIndex, 0),
    kind: messageKind(message),
    label: messageLabel(message),
    sequence: firstSequence,
    text,
  }];
}

function projectPart(
  message: SessionRoundMessage,
  part: SessionRoundMessagePart,
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "sequence"> | null {
  const kind = normalizedText(part.part_kind || part.kind).toLowerCase();
  const base = baseEntry(message, round, roundIndex, messageIndex, partIndex);
  if (kind === "thinking") {
    return { ...base, kind: "thinking", label: "Thinking", text: jsonText(part.content) };
  }
  if (kind === "tool-call" || (part.tool_name !== undefined && part.args !== undefined)) {
    const tool = toolName(part);
    return {
      ...base,
      kind: isQuestionTool(tool) ? "question" : "tool",
      label: isQuestionTool(tool) ? "Question" : tool,
      metadata: {
        ...base.metadata,
        tool: {
          args: part.args,
          callId: part.tool_call_id,
          name: tool,
          stage: "call",
        },
      },
      text: jsonText(part.args),
    };
  }
  if (kind === "tool-return") {
    const tool = toolName(part);
    return {
      ...base,
      kind: isQuestionTool(tool) ? "question" : "tool",
      label: part.is_error === true ? `${tool} error` : `${tool} result`,
      metadata: {
        ...base.metadata,
        tool: {
          callId: part.tool_call_id,
          isError: part.is_error,
          name: tool,
          result: part.content,
          stage: "return",
        },
      },
      text: jsonText(part.content),
    };
  }
  if (kind === "text" || kind === "user-prompt" || kind === "") {
    const text = normalizedText(part.text) || jsonText(part.content);
    return text ? { ...base, kind: messageKind(message), label: messageLabel(message), text } : null;
  }
  return null;
}

function baseEntry(
  message: SessionRoundMessage,
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "kind" | "label" | "sequence" | "text"> {
  return {
    createdAt: message.created_at,
    id: message.message_id || `${round.run_id}:message:${messageIndex}:part:${partIndex}`,
    metadata: {
      entryType: message.entry_type,
      injectionId: message.injection_id,
      instanceId: message.instance_id,
      messageId: message.message_id,
      role: message.role,
      roleId: message.role_id,
      source: message.source,
      status: message.status,
    },
    roundIndex,
    runId: round.run_id,
  };
}

function projectRoundStatus(
  round: SessionRound,
  roundIndex: number,
  firstSequence: number,
): TranscriptEntry[] {
  const details = [
    joinedStatus(round) ? `Status: ${joinedStatus(round)}` : "",
    round.run_error_code ? `Error: ${round.run_error_code}` : "",
    normalizedText(round.run_diagnostic_message),
    (round.pending_tool_approval_count ?? 0) > 0
      ? `Pending approvals: ${round.pending_tool_approval_count}`
      : "",
    (round.pending_user_question_count ?? 0) > 0
      ? `Pending questions: ${round.pending_user_question_count}`
      : "",
  ].filter(Boolean);
  const entries: TranscriptEntry[] = details.length === 0 ? [] : [{
      createdAt: round.run_updated_at ?? undefined,
      id: `${round.run_id}:status`,
      kind: "status",
      label: "Run status",
      metadata: { status: round.run_status ?? undefined },
      roundIndex,
      runId: round.run_id,
      sequence: firstSequence,
      text: details.join("\n"),
    }];
  (round.retry_events ?? []).forEach((event, index) => {
    entries.push({
      createdAt: round.run_updated_at ?? undefined,
      id: `${round.run_id}:retry:${index}`,
      kind: "status",
      label: `Retry ${index + 1}`,
      metadata: { entryType: "retry" },
      roundIndex,
      runId: round.run_id,
      sequence: firstSequence + entries.length,
      text: jsonText(event),
    });
  });
  return entries;
}

function messageKind(message: SessionRoundMessage): TranscriptEntryKind {
  if (normalizedText(message.entry_type).toLowerCase() === "injection") {
    return "injection";
  }
  if (normalizedText(message.source).toLowerCase() === "subagent" || message.instance_id) {
    return "subagent";
  }
  if (normalizedText(message.entry_type).toLowerCase().includes("question")) {
    return "question";
  }
  return normalizedText(message.role).toLowerCase() === "user" ? "user" : "assistant";
}

function messageLabel(message: SessionRoundMessage): string {
  const explicit = normalizedText(message.label) || normalizedText(message.role_id);
  if (explicit) {
    return explicit;
  }
  const kind = messageKind(message);
  if (kind === "injection") {
    return message.source === "subagent" ? "Subagent injection" : "Inserted message";
  }
  if (kind === "subagent") {
    return "Subagent";
  }
  return kind === "user" ? "User" : "Assistant";
}

function messageText(message: SessionRoundMessage): string {
  return normalizedText(message.content)
    || jsonText(message.message?.content)
    || contentPartsText(message.content_parts);
}

function contentPartsText(parts: ContentPart[] | undefined): string {
  return (parts ?? [])
    .map(contentPartDescription)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");
}

function contentPartDescription(part: ContentPart): string | null {
  const text = contentPartText(part);
  if (typeof text === "string" && text.trim()) {
    return text;
  }
  if (isContentMediaRefPart(part)) {
    return mediaDescription(part.modality, part.name, part.mime_type, part.url, part.asset_id);
  }
  if (isLegacyContentMediaRefPart(part)) {
    return mediaDescription(part.media_type, part.name, undefined, part.url);
  }
  if (isInlineMediaPart(part)) {
    return mediaDescription(
      part.modality,
      part.name,
      part.mime_type,
      `data:${part.mime_type};base64,${part.base64_data}`,
    );
  }
  if (isBinaryMediaPart(part)) {
    return mediaDescription(
      mediaModality(part.media_type),
      part.name,
      part.media_type,
      `data:${part.media_type};base64,${part.data}`,
    );
  }
  if (isUrlMediaPart(part)) {
    return mediaDescription(part.kind.replace("-url", ""), part.name, part.media_type, part.url);
  }
  return null;
}

function mediaDescription(
  modality: string | undefined,
  name: string | undefined,
  mimeType: string | undefined,
  url: string | undefined,
  assetId?: string,
): string {
  return [
    `[${normalizedText(modality) || mediaModality(mimeType) || "media"}: ${normalizedText(name) || "attachment"}]`,
    mimeType ? `Type: ${mimeType}` : "",
    assetId ? `Asset: ${assetId}` : "",
    url ? `URL: ${url}` : "",
  ].filter(Boolean).join("\n");
}

function mediaModality(mimeType: string | undefined): string {
  return normalizedText(mimeType).split("/", 1)[0] ?? "media";
}

function isContentMediaRefPart(part: ContentPart): part is ContentMediaRefPart {
  return "kind" in part && part.kind === "media_ref";
}

function isLegacyContentMediaRefPart(part: ContentPart): part is LegacyContentMediaRefPart {
  return "part_kind" in part && part.part_kind === "media_ref";
}

function isInlineMediaPart(part: ContentPart): part is InlineMediaPart {
  return "kind" in part && part.kind === "inline_media";
}

function isBinaryMediaPart(part: ContentPart): part is BinaryMediaPart {
  return "kind" in part && part.kind === "binary";
}

function isUrlMediaPart(part: ContentPart): part is UrlMediaPart {
  return "kind" in part
    && (part.kind === "image-url" || part.kind === "audio-url" || part.kind === "video-url");
}

function isQuestionTool(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === "ask_question" || normalized === "request_user_input";
}

function toolName(part: SessionRoundMessagePart): string {
  return normalizedText(part.tool_name) || "Tool";
}

function joinedStatus(round: SessionRound): string | undefined {
  const value = [round.run_status, round.run_phase]
    .map(normalizedText)
    .filter(Boolean)
    .join(" / ");
  return value || undefined;
}

function parsedTime(value: string | undefined): number | null {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function jsonText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
