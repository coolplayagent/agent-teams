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
  type TimelineMessage,
  type ToolActionFamily,
  type ToolSemanticCategory,
  type UrlMediaPart,
} from "../../api/contracts";
import { toolOutcomeIsError } from "./timelineEventContracts";

export const MESSAGE_TRANSCRIPT_SCHEMA = "relay-teams.session-transcript";
export const MESSAGE_TRANSCRIPT_VERSION = 3;

export type MessagePresentationPart =
  | MessagePresentationTextPart
  | MessagePresentationMediaPart
  | MessagePresentationThinkingPart
  | MessagePresentationToolPart
  | MessagePresentationStatusPart;

export interface MessagePresentationGroup {
  kind: "content" | "status" | "thinking" | "tool";
  parts: MessagePresentationPart[];
}

export interface MessagePresentationTextPart {
  kind: "text";
  markdown: boolean;
  text: string;
}

export interface MessagePresentationMediaPart {
  assetId?: string;
  kind: "media";
  mimeType: string;
  modality: string;
  name: string;
  sessionId?: string;
  url: string;
}

export interface MessagePresentationThinkingPart {
  kind: "thinking";
  partIndex: string;
  streaming: boolean;
  text: string;
}

export interface MessagePresentationToolPart {
  actionFamily?: ToolActionFamily;
  callId: string;
  error: boolean;
  kind: "tool";
  semanticCategory?: ToolSemanticCategory;
  stage: "call" | "return" | "validation";
  toolName: string;
  value: JsonValue;
}

export interface MessagePresentationStatusPart {
  diagnostic?: string;
  errorCode?: string;
  kind: "status";
  pendingApprovals?: number;
  pendingQuestions?: number;
  phase?: string;
  retryEvent?: JsonValue;
  retryIndex?: number;
  status?: string;
}

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
  stage: "call" | "return" | "validation";
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
  parts: MessagePresentationPart[];
  roundIndex: number;
  runId: string;
  sequence: number;
  text: string;
}

export interface TranscriptRound {
  createdAt?: string;
  entries: TranscriptEntry[];
  index: number;
  phase?: string;
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

export interface PresentationRoundMessage {
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
    const promptParts = contentPartsPresentation(round.intent_parts);
    const prompt = promptParts.map(messagePresentationPartText).filter(Boolean).join("\n\n")
      || normalizedText(round.intent);
    if (prompt) {
      entries.push({
        createdAt: round.created_at,
        id: `${round.run_id}:prompt`,
        kind: "user",
        label: "",
        metadata: { actor: "user", role: "user" },
        parts: promptParts.length > 0 ? promptParts : [textPresentationPart(prompt)],
        roundIndex,
        runId: round.run_id,
        sequence: sequence++,
        text: prompt,
      });
    }

    const messages = presentationRoundMessages(round);
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
      phase: normalizedText(round.run_phase) || undefined,
      runId: round.run_id,
      status: normalizedText(round.run_status) || undefined,
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

export function presentationRoundMessages(round: SessionRound): PresentationRoundMessage[] {
  const coordinator = (round.coordinator_messages ?? []).map(
    (message, index): PresentationRoundMessage => ({
      fallbackOrder: index,
      message,
      origin: "coordinator",
    }),
  );
  const injections = (round.injection_messages ?? []).map(
    (message, index): PresentationRoundMessage => ({
      fallbackOrder: coordinator.length + index,
      message,
      origin: "injection",
    }),
  );
  return [...coordinator, ...injections]
    .filter(({ message }) => messageIsPresentationVisible(message))
    .sort(compareMessages);
}

function compareMessages(
  left: PresentationRoundMessage,
  right: PresentationRoundMessage,
): number {
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
  origin: PresentationRoundMessage["origin"],
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  firstSequence: number,
): TranscriptEntry[] {
  const projectedMessage = sessionRoundMessageToTimelineMessage(message, round.run_id);
  const parts = timelineMessagePresentationParts(projectedMessage);
  const presentationGroups = messagePresentationGroups(parts);
  const partEntries = presentationGroups.flatMap((group, groupIndex) => {
    const entry = projectPresentationGroup(
      message, origin, group, round, roundIndex, messageIndex, groupIndex,
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
    label: messageLabel(message, origin),
    parts: [textPresentationPart(text)],
    sequence: firstSequence,
    text,
  }];
}

function projectPresentationGroup(
  message: SessionRoundMessage,
  origin: PresentationRoundMessage["origin"],
  group: MessagePresentationGroup,
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "sequence"> | null {
  const base = baseEntry(message, origin, round, roundIndex, messageIndex, partIndex);
  const part = group.parts[0];
  if (part === undefined) {
    return null;
  }
  if (group.kind === "thinking" && part.kind === "thinking") {
    return { ...base, kind: "thinking", label: "", parts: [part], text: part.text };
  }
  if (group.kind === "tool" && part.kind === "tool") {
    const toolParts = group.parts.filter(
      (candidate): candidate is MessagePresentationToolPart => candidate.kind === "tool",
    );
    const callPart = toolParts.find((candidate) => candidate.stage === "call");
    const resultPart = toolParts.find((candidate) => candidate.stage !== "call");
    const effectivePart = resultPart ?? callPart ?? part;
    const tool = effectivePart.toolName;
    return {
      ...base,
      kind: "tool",
      label: tool,
      metadata: {
        ...base.metadata,
        tool: {
          actionFamily: effectivePart.actionFamily,
          ...(callPart === undefined ? {} : { args: callPart.value }),
          callId: effectivePart.callId,
          isError: effectivePart.error,
          name: tool,
          ...(resultPart === undefined ? {} : { result: resultPart.value }),
          semanticCategory: effectivePart.semanticCategory,
          stage: effectivePart.stage,
        },
      },
      parts: toolParts,
      text: jsonText(effectivePart.value),
    };
  }
  const text = group.parts.map(messagePresentationPartText).filter(Boolean).join("\n\n");
  if (text.length > 0) {
    return {
      ...base,
      kind: messageKind(message, origin, round),
      label: messageLabel(message, origin),
      parts: group.parts,
      text,
    };
  }
  return null;
}

function baseEntry(
  message: SessionRoundMessage,
  origin: PresentationRoundMessage["origin"],
  round: SessionRound,
  roundIndex: number,
  messageIndex: number,
  partIndex: number,
): Omit<TranscriptEntry, "kind" | "label" | "parts" | "sequence" | "text"> {
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
  const statusPart: MessagePresentationStatusPart = {
    ...(normalizedText(round.run_diagnostic_message).length > 0
      ? { diagnostic: normalizedText(round.run_diagnostic_message) }
      : {}),
    ...(normalizedText(round.run_error_code).length > 0
      ? { errorCode: normalizedText(round.run_error_code) }
      : {}),
    ...((round.pending_tool_approval_count ?? 0) > 0
      ? { pendingApprovals: round.pending_tool_approval_count }
      : {}),
    ...((round.pending_user_question_count ?? 0) > 0
      ? { pendingQuestions: round.pending_user_question_count }
      : {}),
    ...(normalizedText(round.run_phase).length > 0
      ? { phase: normalizedText(round.run_phase) }
      : {}),
    ...(normalizedText(round.run_status).length > 0
      ? { status: normalizedText(round.run_status) }
      : {}),
    kind: "status",
  };
  const hasStatus = Object.keys(statusPart).some((key) => key !== "kind");
  const statusText = jsonText(statusPartValue(statusPart));
  const entries: TranscriptEntry[] = !hasStatus ? [] : [{
      createdAt: round.run_updated_at ?? undefined,
      id: `${round.run_id}:status`,
      kind: "status",
      label: "",
      metadata: { actor: "unknown", status: round.run_status ?? undefined },
      parts: [statusPart],
      roundIndex,
      runId: round.run_id,
      sequence: firstSequence,
      text: statusText,
    }];
  (round.retry_events ?? []).forEach((event, index) => {
    const retryPart: MessagePresentationStatusPart = {
      kind: "status",
      retryEvent: event,
      retryIndex: index,
    };
    entries.push({
      createdAt: round.run_updated_at ?? undefined,
      id: `${round.run_id}:retry:${index}`,
      kind: "status",
      label: "",
      metadata: { actor: "unknown", entryType: "retry" },
      parts: [retryPart],
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
  origin: PresentationRoundMessage["origin"],
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
  origin: PresentationRoundMessage["origin"],
): string {
  if (origin === "injection") {
    return "";
  }
  const explicit = normalizedText(message.label) || normalizedText(message.role_id);
  if (explicit) {
    return explicit;
  }
  return "";
}

function messageActor(
  message: SessionRoundMessage,
  origin: PresentationRoundMessage["origin"],
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
  return timelineMessagePresentationParts(
    sessionRoundMessageToTimelineMessage(message, ""),
  ).map(messagePresentationPartText).filter(Boolean).join("\n\n");
}

export function sessionRoundMessageToTimelineMessage(
  message: SessionRoundMessage,
  runId: string,
): TimelineMessage {
  const contentParts = message.content_parts ?? [];
  const bodyParts = sessionRoundMessagePartsToContentParts(message.message?.parts ?? []);
  const bodyContent = jsonText(message.message?.content);
  return {
    agent_role_id: message.agent_role_id,
    client_message_id: message.client_message_id,
    conversation_id: message.conversation_id,
    content: message.content,
    created_at: message.queued_at ?? message.created_at ?? message.occurred_at,
    entry_type: message.entry_type,
    injection_id: message.injection_id,
    injection_status: message.injection_status,
    recipient_instance_id: message.recipient_instance_id,
    instance_id: message.instance_id,
    message: {
      ...(bodyContent.trim().length > 0 ? { content: bodyContent } : {}),
      ...(message.message?.metadata === undefined ? {} : { metadata: message.message.metadata }),
      ...(bodyParts.length > 0 ? { parts: bodyParts } : {}),
    },
    message_id: message.message_id,
    presentation_kind: message.presentation_kind,
    parts: contentParts.length > 0 ? contentParts : undefined,
    role: message.role,
    role_id: message.role_id,
    run_id: runId,
    source: message.source,
    status: message.status,
    task_id: message.task_id,
    superseded_client_message_ids: message.superseded_client_message_ids,
    superseded_injection_ids: message.superseded_injection_ids,
    visibility: message.visibility,
  };
}

export function sessionRoundMessagePartsToContentParts(
  parts: SessionRoundMessagePart[],
): ContentPart[] {
  return parts.flatMap((part) => {
    const contentPart = sessionRoundMessagePartToContentPart(part);
    return contentPart === null ? [] : [contentPart];
  });
}

function sessionRoundMessagePartToContentPart(
  part: SessionRoundMessagePart,
): ContentPart | null {
  const kind = normalizedText(part.part_kind ?? part.kind);
  const text = typeof part.text === "string" ? part.text : jsonText(part.content);
  if (kind === "text" && text.length > 0) {
    return { part_kind: "text", content: text };
  }
  if (kind === "user-prompt") {
    return { part_kind: "user-prompt", content: text };
  }
  if (kind === "thinking") {
    return { part_kind: "thinking", content: text };
  }
  if (kind === "media_ref") {
    return {
      part_kind: "media_ref",
      media_type: part.mime_type,
      name: part.name,
      url: part.url,
    };
  }
  if (kind === "tool-call") {
    return {
      action_family: part.action_family,
      part_kind: "tool-call",
      args: part.args,
      semantic_category: part.semantic_category,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  if (kind === "tool-return") {
    return {
      action_family: part.action_family,
      part_kind: "tool-return",
      content: part.content,
      is_error: part.is_error,
      outcome: part.outcome,
      semantic_category: part.semantic_category,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  if (kind === "retry-prompt") {
    return {
      action_family: part.action_family,
      part_kind: "retry-prompt",
      content: part.content,
      semantic_category: part.semantic_category,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  return null;
}

export function timelineMessagePresentationParts(
  message: TimelineMessage,
): MessagePresentationPart[] {
  if (!messageIsPresentationVisible(message)) {
    return [];
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return [textPresentationPart(message.content)];
  }
  const parts = contentPartsPresentation(message.parts ?? message.message?.parts);
  if (parts.length > 0) {
    return parts;
  }
  if (
    typeof message.message?.content === "string" &&
    message.message.content.trim().length > 0
  ) {
    return [textPresentationPart(message.message.content)];
  }
  return [];
}

export function messagePresentationGroups(
  parts: MessagePresentationPart[],
): MessagePresentationGroup[] {
  const groups: MessagePresentationGroup[] = [];
  for (const part of parts) {
    if (part.kind === "text" || part.kind === "media") {
      const previous = groups.at(-1);
      if (previous?.kind === "content") {
        previous.parts.push(part);
      } else {
        groups.push({ kind: "content", parts: [part] });
      }
      continue;
    }
    if (part.kind === "tool") {
      const previous = groups.at(-1);
      const previousTool = previous?.kind === "tool"
        ? previous.parts.at(-1)
        : undefined;
      if (
        previousTool?.kind === "tool"
        && previousTool.stage === "call"
        && part.stage !== "call"
        && previousTool.callId.length > 0
        && previousTool.callId === part.callId
      ) {
        previous?.parts.push(part);
      } else {
        groups.push({ kind: "tool", parts: [part] });
      }
      continue;
    }
    groups.push({ kind: part.kind, parts: [part] });
  }
  return groups;
}

export function messageIsPresentationVisible(
  message: Pick<TimelineMessage, "visibility"> | Pick<SessionRoundMessage, "visibility">,
): boolean {
  return normalizedText(message.visibility ?? "public").toLowerCase() !== "internal";
}

export function contentPartsPresentation(
  parts: ContentPart[] | undefined,
): MessagePresentationPart[] {
  return (parts ?? []).flatMap((part) => {
    const presentation = contentPartPresentation(part);
    return presentation === null ? [] : [presentation];
  });
}

export function contentPartPresentation(
  part: ContentPart,
): MessagePresentationPart | null {
  const text = contentPartText(part);
  if (typeof text === "string" && text.trim()) {
    return textPresentationPart(text);
  }
  const kind = contentPartKind(part);
  if (kind === "user-prompt" && "content" in part && typeof part.content === "string") {
    return textPresentationPart(part.content);
  }
  if (kind === "thinking") {
    const thinkingText = "content" in part && typeof part.content === "string"
      ? part.content
      : "text" in part && typeof part.text === "string" ? part.text : "";
    if (thinkingText.trim().length === 0) {
      return null;
    }
    return {
      kind: "thinking",
      partIndex: contentPartIndex(part),
      streaming: "streaming" in part && part.streaming === true &&
        !("finished" in part && part.finished === true),
      text: thinkingText,
    };
  }
  if (kind === "tool-call" || contentPartHasToolCallShape(part)) {
    return toolPresentationPart(part, "call", "args" in part ? part.args ?? null : null, false);
  }
  if (kind === "tool-return") {
    const value = "content" in part ? part.content ?? null : null;
    return toolPresentationPart(
      part,
      "return",
      value,
      toolPartIsError(part) || toolResultIndicatesError(value),
    );
  }
  if (kind === "retry-prompt") {
    const value = "content" in part ? part.content ?? null : null;
    return toolPresentationPart(part, "validation", value, true);
  }
  if (isContentMediaRefPart(part)) {
    return mediaPresentationPart({
      assetId: part.asset_id,
      mimeType: part.mime_type,
      modality: part.modality,
      name: part.name,
      sessionId: part.session_id,
      url: part.url,
    });
  }
  if (isLegacyContentMediaRefPart(part)) {
    return mediaPresentationPart({
      mimeType: part.media_type,
      modality: mediaModality(part.media_type),
      name: part.name,
      url: part.url,
    });
  }
  if (isInlineMediaPart(part)) {
    return mediaPresentationPart({
      mimeType: part.mime_type,
      modality: part.modality,
      name: part.name,
      url: inlineMediaUrl(part.mime_type, part.base64_data),
    });
  }
  if (isBinaryMediaPart(part)) {
    return mediaPresentationPart({
      mimeType: part.media_type,
      modality: mediaModality(part.media_type),
      name: part.name,
      url: inlineMediaUrl(part.media_type, part.data),
    });
  }
  if (isUrlMediaPart(part)) {
    return mediaPresentationPart({
      mimeType: part.media_type,
      modality: part.kind.replace("-url", ""),
      name: part.name,
      url: part.url,
    });
  }
  return null;
}

export function messagePresentationPartText(part: MessagePresentationPart): string {
  if (part.kind === "text" || part.kind === "thinking") {
    return part.text;
  }
  if (part.kind === "tool") {
    return jsonText(part.value);
  }
  if (part.kind === "status") {
    return jsonText(statusPartValue(part));
  }
  return part.name || part.url || part.assetId || part.modality;
}

export function textPresentationPart(
  text: string,
  markdown = true,
): MessagePresentationTextPart {
  return { kind: "text", markdown, text };
}

function toolPresentationPart(
  part: ContentPart,
  stage: MessagePresentationToolPart["stage"],
  value: JsonValue,
  error: boolean,
): MessagePresentationToolPart {
  return {
    actionFamily: "action_family" in part ? part.action_family : undefined,
    callId: "tool_call_id" in part ? normalizedText(part.tool_call_id) : "",
    error,
    kind: "tool",
    semanticCategory: "semantic_category" in part ? part.semantic_category : undefined,
    stage,
    toolName: "tool_name" in part ? normalizedText(part.tool_name) : "",
    value,
  };
}

function statusPartValue(part: MessagePresentationStatusPart): JsonValue {
  return {
    ...(part.diagnostic === undefined ? {} : { diagnostic: part.diagnostic }),
    ...(part.errorCode === undefined ? {} : { error_code: part.errorCode }),
    kind: part.kind,
    ...(part.pendingApprovals === undefined
      ? {}
      : { pending_approvals: part.pendingApprovals }),
    ...(part.pendingQuestions === undefined
      ? {}
      : { pending_questions: part.pendingQuestions }),
    ...(part.phase === undefined ? {} : { phase: part.phase }),
    ...(part.retryEvent === undefined ? {} : { retry_event: part.retryEvent }),
    ...(part.retryIndex === undefined ? {} : { retry_index: part.retryIndex }),
    ...(part.status === undefined ? {} : { status: part.status }),
  };
}

function toolPartIsError(part: ContentPart): boolean {
  if (!("is_error" in part) && !("outcome" in part)) {
    return false;
  }
  if ("is_error" in part && part.is_error === true) {
    return true;
  }
  const outcome = "outcome" in part ? normalizedText(part.outcome).toLowerCase() : "";
  return outcome === "failed" || outcome === "denied";
}

function toolResultIndicatesError(value: JsonValue): boolean {
  const object = jsonObject(value);
  if (object === null) {
    return false;
  }
  return object.ok === false
    || toolOutcomeIsError(object.status)
    || toolOutcomeIsError(object.outcome)
    || numericJsonValueIsNonZero(object.exit_code);
}

function numericJsonValueIsNonZero(value: JsonValue | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function contentPartKind(part: ContentPart): string {
  if ("part_kind" in part) {
    return part.part_kind;
  }
  return "kind" in part ? part.kind : "";
}

function contentPartHasToolCallShape(part: ContentPart): boolean {
  return "tool_name" in part && "args" in part && part.tool_name !== undefined;
}

function contentPartIndex(part: ContentPart): string {
  if ("part_index" in part) {
    const value = part.part_index;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "0";
}

function mediaPresentationPart({
  assetId,
  mimeType,
  modality,
  name,
  sessionId,
  url,
}: {
  assetId?: string;
  mimeType?: string;
  modality?: string;
  name?: string;
  sessionId?: string;
  url?: string;
}): MessagePresentationMediaPart | null {
  const safeAssetId = normalizedText(assetId);
  const safeMimeType = normalizedText(mimeType);
  const safeModality = normalizedText(modality) || mediaModality(safeMimeType);
  const safeUrl = normalizedText(url);
  if (safeUrl.length === 0 && safeAssetId.length === 0) {
    return null;
  }
  return {
    ...(safeAssetId.length > 0 ? { assetId: safeAssetId } : {}),
    kind: "media",
    mimeType: safeMimeType,
    modality: safeModality,
    name: normalizedText(name),
    ...(normalizedText(sessionId).length > 0 ? { sessionId: normalizedText(sessionId) } : {}),
    url: safeUrl,
  };
}

function inlineMediaUrl(mimeType: string | undefined, data: string | undefined): string {
  const safeMimeType = normalizedText(mimeType);
  const safeData = normalizedText(data);
  return safeMimeType.length > 0 && safeData.length > 0
    ? `data:${safeMimeType};base64,${safeData}`
    : "";
}

function mediaModality(mimeType: string | undefined): string {
  return normalizedText(mimeType).split("/", 1)[0] ?? "";
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
