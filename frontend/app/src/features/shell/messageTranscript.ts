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
export const MESSAGE_TRANSCRIPT_VERSION = 2;

export type TranscriptEntryKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool"
  | "injection"
  | "question"
  | "subagent"
  | "status";

export type TranscriptActorKind = "assistant" | "subagent" | "unknown" | "user";

export interface TranscriptToolMetadata {
  actionFamily?: SessionRoundMessagePart["action_family"];
  args?: JsonValue;
  callId?: string;
  isError?: boolean;
  name: string;
  result?: JsonValue;
  semanticCategory?: SessionRoundMessagePart["semantic_category"];
  stage: "call" | "return";
}

export interface TranscriptEntryMetadata {
  actor: TranscriptActorKind;
  entryType?: string;
  injectionId?: string;
  instanceId?: string;
  messageId?: string;
  role?: string;
  roleId?: string;
  senderInstanceId?: string;
  senderRoleId?: string;
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
  origin: "coordinator" | "injection";
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
        metadata: { actor: "user", role: "user" },
        roundIndex,
        runId: round.run_id,
        sequence: sequence++,
        text: prompt,
      });
    }

    const messages = mergeRoundMessages(round);
    messages.forEach(({ message, origin }, messageIndex) => {
      const projected = projectMessage(
        message,
        origin,
        round,
        roundIndex,
        messageIndex,
        sequence,
      );
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

function mergeRoundMessages(round: SessionRound): SortableMessage[] {
  const coordinator = (round.coordinator_messages ?? []).map(
    (message, index): SortableMessage => ({
      fallbackOrder: index,
      message,
      origin: "coordinator",
    }),
  );
  const injections = (round.injection_messages ?? []).map(
    (message, index): SortableMessage => ({
      fallbackOrder: coordinator.length + index,
      message,
      origin: "injection",
    }),
  );
  return [...coordinator, ...injections].sort(compareMessages);
}

function compareMessages(left: SortableMessage, right: SortableMessage): number {
  const leftTime = parsedTime(messageOccurredAt(left.message));
  const rightTime = parsedTime(messageOccurredAt(right.message));
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
  origin: SortableMessage["origin"],
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  firstSequence: number,
): TranscriptEntry[] {
  const parts = message.message?.parts ?? [];
  const partEntries = parts.flatMap((part, partIndex) => {
    const entry = projectPart(
      message,
      origin,
      part,
      round,
      roundIndex,
      messageIndex,
      partIndex,
    );
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
    ...baseEntry(message, origin, round, roundIndex, messageIndex, 0),
    kind: messageKind(message, origin, round),
    label: messageLabel(message, origin, round),
    sequence: firstSequence,
    text,
  }];
}

function projectPart(
  message: SessionRoundMessage,
  origin: SortableMessage["origin"],
  part: SessionRoundMessagePart,
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "sequence"> | null {
  const kind = normalizedText(part.part_kind || part.kind).toLowerCase();
  const base = baseEntry(message, origin, round, roundIndex, messageIndex, partIndex);
  if (kind === "thinking") {
    return { ...base, kind: "thinking", label: "Thinking", text: jsonText(part.content) };
  }
  if (kind === "tool-call" || (part.tool_name !== undefined && part.args !== undefined)) {
    const tool = toolName(part);
    return {
      ...base,
      kind: "tool",
      label: tool,
      metadata: {
        ...base.metadata,
        tool: {
          actionFamily: part.action_family,
          args: part.args,
          callId: part.tool_call_id,
          name: tool,
          semanticCategory: part.semantic_category,
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
      kind: "tool",
      label: part.is_error === true ? `${tool} error` : `${tool} result`,
      metadata: {
        ...base.metadata,
        tool: {
          actionFamily: part.action_family,
          callId: part.tool_call_id,
          isError: part.is_error,
          name: tool,
          result: part.content,
          semanticCategory: part.semantic_category,
          stage: "return",
        },
      },
      text: jsonText(part.content),
    };
  }
  if (kind === "text" || kind === "user-prompt" || kind === "") {
    const text = normalizedText(part.text) || jsonText(part.content);
    return text ? {
      ...base,
      kind: messageKind(message, origin, round),
      label: messageLabel(message, origin, round),
      text,
    } : null;
  }
  return null;
}

function baseEntry(
  message: SessionRoundMessage,
  origin: SortableMessage["origin"],
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "kind" | "label" | "sequence" | "text"> {
  return {
    createdAt: messageOccurredAt(message),
    id: message.message_id || `${round.run_id}:message:${messageIndex}:part:${partIndex}`,
    metadata: {
      actor: messageActor(message, origin, round),
      entryType: message.entry_type,
      injectionId: message.injection_id,
      instanceId: message.instance_id,
      messageId: message.message_id,
      role: message.role,
      roleId: message.role_id,
      senderInstanceId: message.sender_instance_id,
      senderRoleId: message.sender_role_id,
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
      metadata: { actor: "unknown", status: round.run_status ?? undefined },
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
      metadata: { actor: "unknown", entryType: "retry" },
      roundIndex,
      runId: round.run_id,
      sequence: firstSequence + entries.length,
      text: jsonText(event),
    });
  });
  return entries;
}

function messageKind(
  message: SessionRoundMessage,
  origin: SortableMessage["origin"],
  round: SessionRound,
): TranscriptEntryKind {
  if (origin === "injection") {
    return "injection";
  }
  const actor = messageActor(message, origin, round);
  if (actor === "subagent") {
    return "subagent";
  }
  return actor === "user" ? "user" : "assistant";
}

function messageLabel(
  message: SessionRoundMessage,
  origin: SortableMessage["origin"],
  round: SessionRound,
): string {
  const actor = messageActor(message, origin, round);
  if (origin === "injection") {
    return actor === "subagent" ? "Subagent injection" : "Inserted message";
  }
  const explicit = normalizedText(message.label) || normalizedText(message.role_id);
  if (explicit) {
    return explicit;
  }
  const kind = messageKind(message, origin, round);
  if (kind === "subagent") {
    return "Subagent";
  }
  return kind === "user" ? "User" : "Assistant";
}

function messageActor(
  message: SessionRoundMessage,
  origin: SortableMessage["origin"],
  round: SessionRound,
): TranscriptActorKind {
  if (origin === "injection") {
    return injectionActor(message, round);
  }
  if (normalizedText(message.role).toLowerCase() === "user") {
    return "user";
  }
  const instanceId = normalizedText(message.instance_id);
  const primaryInstanceId = normalizedText(round.primary_instance_id);
  if (instanceId && primaryInstanceId && instanceId === primaryInstanceId) {
    return "assistant";
  }
  if (isKnownNonPrimaryInstance(instanceId, primaryInstanceId, round)) {
    return "subagent";
  }
  return "assistant";
}

function injectionActor(
  message: SessionRoundMessage,
  round: SessionRound,
): TranscriptActorKind {
  const senderInstanceId = normalizedText(message.sender_instance_id);
  const primaryInstanceId = normalizedText(round.primary_instance_id);
  if (senderInstanceId && primaryInstanceId && senderInstanceId === primaryInstanceId) {
    return "assistant";
  }
  if (isKnownNonPrimaryInstance(senderInstanceId, primaryInstanceId, round)) {
    return "subagent";
  }
  return "unknown";
}

function isKnownNonPrimaryInstance(
  instanceId: string,
  primaryInstanceId: string,
  round: SessionRound,
): boolean {
  return Boolean(
    instanceId
    && primaryInstanceId
    && instanceId !== primaryInstanceId
    && Object.prototype.hasOwnProperty.call(round.instance_role_map ?? {}, instanceId),
  );
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

function messageOccurredAt(message: SessionRoundMessage): string | undefined {
  return message.applied_at
    ?? message.occurred_at
    ?? message.created_at
    ?? message.queued_at;
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
