import { Image } from "antd";
import { Wrench } from "lucide-react";
import type { MouseEventHandler, ReactNode, Ref } from "react";

import type { JsonValue } from "../../api/contracts";
import type { Translate } from "../../i18n";
import { MarkdownMessage } from "./MarkdownMessage";
import {
  messagePresentationGroups,
  type MessagePresentationGroup,
  type MessagePresentationMediaPart,
  type MessagePresentationPart,
  type MessagePresentationStatusPart,
  type MessagePresentationToolPart,
} from "./messagePresentation";
import {
  toolActionFamily,
  type ToolActionFamily,
  type ToolSemanticCategory,
} from "./toolPresentation";
import {
  approvalActionIsApproved,
  approvalActionIsError,
} from "./timelineEventContracts";
import { ToolCallDetails } from "./ToolCallDetails";

export interface MessagePresentationLabels {
  attachment: string;
  error: string;
  mediaType: string;
  retry: string;
  status: string;
  timelineCall: string;
  timelineCompleted: string;
  timelineInput: string;
  timelineOutput: string;
  timelineThinking: string;
  timelineValidation: string;
  url: string;
}

interface MessagePresentationViewProps {
  disclosurePrefix: string;
  interactive?: boolean;
  labels: MessagePresentationLabels;
  parts: MessagePresentationPart[];
  t: Translate;
}

export interface MessageDisclosurePresentation {
  attributes: Record<string, string | undefined>;
  body: ReactNode;
  className: string;
  defaultOpen: boolean;
  elementRef?: Ref<HTMLDetailsElement>;
  summary: ReactNode;
}

export type MessageDisclosureRenderer = (
  presentation: MessageDisclosurePresentation,
) => ReactNode;

export interface MessageToolPresentationProps {
  bodyExtras?: ReactNode;
  callId: string;
  className?: string;
  defaultOpen?: boolean;
  detailsEnabled?: boolean;
  disclosureId: string;
  elementRef?: Ref<HTMLDetailsElement>;
  error: boolean;
  input: string;
  interactive?: boolean;
  output: string;
  preview: string;
  raw: string;
  renderDisclosure?: MessageDisclosureRenderer;
  status: string;
  summaryExtras?: ReactNode;
  summaryLabel?: string;
  summaryOnClick?: MouseEventHandler<HTMLElement>;
  t: Translate;
  title: string;
  toolName: string;
}

export interface MessageToolPresentationModel {
  category: ToolActionFamily;
  callId: string;
  error: boolean;
  input: string;
  output: string;
  phaseLabel: string;
  preview: string;
  raw: string;
  status: "completed" | "error" | "running" | "validation_failed";
  title: string;
  toolName: string;
}

export function buildMessageToolPresentationModel(options: {
  action?: string;
  actionFamily?: ToolActionFamily;
  body: string;
  callId: string;
  error: boolean;
  input: string;
  output: string;
  raw: string;
  semanticCategory?: ToolSemanticCategory;
  stage:
    | "approval-requested"
    | "approval-resolved"
    | "call"
    | "return"
    | "validation";
  subagent?: boolean;
  t: Translate;
  toolName: string;
}): MessageToolPresentationModel {
  const category = options.subagent === true
    ? "subagent"
    : toolActionFamily({
      actionFamily: options.actionFamily,
      semanticCategory: options.semanticCategory,
    });
  const phase = messageToolPhaseLabel({
    action: options.action ?? "",
    category,
    error: options.error,
    stage: options.stage,
    t: options.t,
  });
  return {
    category,
    callId: options.callId,
    error: options.error,
    input: options.input,
    output: options.output,
    phaseLabel: phase,
    preview: messageToolPreview(options),
    raw: options.raw,
    status: options.stage === "validation"
      ? "validation_failed"
      : options.error
        ? "error"
        : options.stage === "call"
          ? "running"
          : "completed",
    title: options.toolName.trim().length > 0
      ? `${phase}: ${options.toolName}`
      : phase,
    toolName: options.toolName,
  };
}

function messageToolPhaseLabel(options: {
  action: string;
  category: ToolActionFamily;
  error: boolean;
  stage: MessageToolPresentationModelOptions["stage"];
  t: Translate;
}): string {
  if (options.stage === "approval-requested") {
    return options.t("timelineApprovalRequested");
  }
  if (options.stage === "approval-resolved") {
    if (approvalActionIsError(options.action)) {
      return options.t("timelineApprovalDenied");
    }
    if (approvalActionIsApproved(options.action)) {
      return options.t("timelineApprovalApproved");
    }
    return options.t("timelineApprovalResolved");
  }
  if (options.stage === "validation") {
    return options.t("timelineToolValidation");
  }
  const phase = options.stage === "call"
    ? "running"
    : options.error ? "error" : "completed";
  return messageToolActionLabel(options.category, phase, options.t);
}

function messageToolActionLabel(
  category: ToolActionFamily,
  phase: "completed" | "error" | "running",
  t: Translate,
): string {
  if (category === "orchestration") {
    if (phase === "running") return t("timelineToolRunningOrchestration");
    if (phase === "error") return t("timelineToolErrorOrchestration");
    return t("timelineToolCompletedOrchestration");
  }
  if (category === "subagent") {
    if (phase === "running") return t("timelineToolRunningSubagent");
    if (phase === "error") return t("timelineToolErrorSubagent");
    return t("timelineToolCompletedSubagent");
  }
  if (category === "run") {
    if (phase === "running") return t("timelineToolRunningRun");
    if (phase === "error") return t("timelineToolErrorRun");
    return t("timelineToolCompletedRun");
  }
  if (category === "read") {
    if (phase === "running") return t("timelineToolRunningRead");
    if (phase === "error") return t("timelineToolErrorRead");
    return t("timelineToolCompletedRead");
  }
  if (category === "edit") {
    if (phase === "running") return t("timelineToolRunningEdit");
    if (phase === "error") return t("timelineToolErrorEdit");
    return t("timelineToolCompletedEdit");
  }
  if (category === "search") {
    if (phase === "running") return t("timelineToolRunningSearch");
    if (phase === "error") return t("timelineToolErrorSearch");
    return t("timelineToolCompletedSearch");
  }
  if (phase === "running") return t("timelineToolRunningGeneric");
  if (phase === "error") return t("timelineToolErrorGeneric");
  return t("timelineToolCompletedGeneric");
}

type MessageToolPresentationModelOptions = Parameters<
  typeof buildMessageToolPresentationModel
>[0];

function messageToolPreview(options: MessageToolPresentationModelOptions): string {
  const source = options.stage === "call" ? options.input : options.output || options.body;
  const parsed = parsePresentationJson(source);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of ["__items", "entries", "files", "items", "matches", "paths", "results"]) {
      const items = parsed[key];
      if (Array.isArray(items) && items.every((item) => typeof item === "string")) {
        return normalizedMessageToolPreview(items.join(", "));
      }
    }
    for (const key of [
      "__raw", "command", "cmd", "description", "path", "file_path",
      "filepath", "target_path", "query", "q", "search_query", "pattern",
      "url", "uri", "output_excerpt", "output", "message", "status",
    ]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return normalizedMessageToolPreview(value);
      }
    }
  }
  return normalizedMessageToolPreview(firstMessageToolLine(source));
}

function firstMessageToolLine(value: string): string {
  return value.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? "";
}

export function MessagePresentationView({
  disclosurePrefix,
  interactive = true,
  labels,
  parts,
  t,
}: MessagePresentationViewProps) {
  return (
    <div className="at-message-content">
      {messagePresentationGroups(parts).map((group, index) => (
        <MessagePresentationGroupView
          disclosureId={`${disclosurePrefix}:${index}`}
          group={group}
          interactive={interactive}
          key={`${group.kind}:${index}`}
          labels={labels}
          t={t}
        />
      ))}
    </div>
  );
}

export function MessagePresentationGroupView({
  disclosureId,
  group,
  interactive = true,
  labels,
  t,
}: {
  disclosureId: string;
  group: MessagePresentationGroup;
  interactive?: boolean;
  labels: MessagePresentationLabels;
  t: Translate;
}) {
  if (group.kind === "content") {
    return <MessagePresentationContent interactive={interactive} parts={group.parts} t={t} />;
  }
  if (group.kind === "thinking") {
    const thinking = group.parts.find((part) => part.kind === "thinking");
    return thinking === undefined || thinking.text.trim().length === 0 ? null : (
      <MessagePresentationThinking
        disclosureId={disclosureId}
        label={labels.timelineThinking}
        streaming={thinking.streaming}
        text={thinking.text}
      />
    );
  }
  if (group.kind === "tool") {
    return (
      <MessagePresentationToolGroup
        disclosureId={disclosureId}
        interactive={interactive}
        parts={group.parts}
        t={t}
      />
    );
  }
  const status = group.parts.find((part) => part.kind === "status");
  return status === undefined || messagePresentationStatusIsRoutine(status) ? null : (
    <details
      className="at-message-tool at-message-status"
      data-disclosure-id={disclosureId}
      data-export-block="status"
      data-status={status.errorCode === undefined ? "completed" : "error"}
    >
      <summary className="at-message-tool-summary">
        <span className="at-message-tool-title">
          <span>{messagePresentationStatusLabel(status, labels)}</span>
        </span>
      </summary>
      <div className="at-message-tool-body">
        <MessageStructuredValue value={messagePresentationStatusValue(status, labels)} />
      </div>
    </details>
  );
}

export function MessagePresentationContent({
  interactive = true,
  parts,
  t,
}: {
  interactive?: boolean;
  parts: MessagePresentationPart[];
  t: Translate;
}) {
  return parts.map((part, index) => {
    if (part.kind === "text") {
      return (
        <MessagePresentationText key={`text:${index}`} text={part.text} />
      );
    }
    if (part.kind === "media") {
      return (
        <MessagePresentationMedia
          interactive={interactive}
          key={`media:${index}`}
          media={part}
          t={t}
        />
      );
    }
    return null;
  });
}

export function MessagePresentationText({
  cursor,
  elementRef,
  resizeTimelineRow,
  streaming = false,
  tail = "",
  text,
}: {
  cursor?: ReactNode;
  elementRef?: Ref<HTMLDivElement>;
  resizeTimelineRow?: (index: number, size: number) => void;
  streaming?: boolean;
  tail?: string;
  text: string;
}) {
  return (
    <div
      className={`at-message-text${streaming ? " at-message-streaming-text" : ""}`}
      data-export-block="content"
      data-streaming={streaming ? "true" : undefined}
      ref={elementRef}
    >
      <MarkdownMessage
        resizeTimelineRow={resizeTimelineRow}
        streaming={streaming}
        text={text}
      />
      {tail.length > 0 ? (
        <span className="at-message-terminal-tail" style={{ whiteSpace: "pre-wrap" }}>
          {tail}
        </span>
      ) : null}
      {cursor}
    </div>
  );
}

export function MessagePresentationThinking({
  defaultOpen = false,
  disclosureId,
  label,
  liveLabel,
  renderDisclosure,
  resizeTimelineRow,
  streaming,
  text,
}: {
  defaultOpen?: boolean;
  disclosureId: string;
  label: string;
  liveLabel?: string;
  renderDisclosure?: MessageDisclosureRenderer;
  resizeTimelineRow?: (index: number, size: number) => void;
  streaming: boolean;
  text: string;
}) {
  if (text.trim().length === 0) {
    return null;
  }
  const summary = (
    <summary className="at-message-thinking-summary" data-disclosure-id={disclosureId}>
      <span className="at-message-thinking-label">{label}</span>
      {streaming && liveLabel ? (
        <span className="at-message-thinking-live">{liveLabel}</span>
      ) : null}
    </summary>
  );
  const body = (
    <div className="at-message-thinking-body">
      <MarkdownMessage
        resizeTimelineRow={resizeTimelineRow}
        streaming={streaming}
        text={text}
      />
    </div>
  );
  return renderMessageDisclosure({
    attributes: {
      "data-disclosure-id": disclosureId,
      "data-export-block": "thinking",
      "data-streaming": streaming ? "true" : "false",
    },
    body,
    className: "at-message-thinking",
    defaultOpen,
    summary,
  }, renderDisclosure);
}

export function MessagePresentationMedia({
  interactive = true,
  media,
  t,
}: {
  interactive?: boolean;
  media: MessagePresentationMediaPart;
  t: Translate;
}) {
  const rawLabel = (media.name || media.modality).trim();
  const label = rawLabel.length === 0 || rawLabel.toLowerCase() === "media"
    ? t("timelineMedia")
    : rawLabel;
  const safeUrl = safePresentationMediaUrl(media.url, media.mimeType);
  if (safeUrl && (media.modality === "image" || media.mimeType.startsWith("image/"))) {
    return (
      <figure className="at-message-media" data-export-block="media">
        {interactive ? (
          <Image
            alt={label}
            className="at-message-media-image"
            preview={{ mask: t("timelinePreview") }}
            src={safeUrl}
          />
        ) : (
          <img alt={label} className="at-message-media-image" src={safeUrl} />
        )}
        <figcaption>{label}</figcaption>
      </figure>
    );
  }
  if (safeUrl) {
    return (
      <a
        className="at-message-media-link"
        data-export-block="media"
        href={safeUrl}
        rel="noreferrer"
        target="_blank"
      >
        {label}
      </a>
    );
  }
  return (
    <div className="at-message-media-reference" data-export-block="media">
      <span>{label}</span>
      {media.mimeType ? <code>{media.mimeType}</code> : null}
      {media.url ? <code>{media.url}</code> : null}
    </div>
  );
}

function MessagePresentationToolGroup({
  disclosureId,
  interactive = true,
  parts,
  t,
}: {
  disclosureId: string;
  interactive?: boolean;
  parts: MessagePresentationPart[];
  t: Translate;
}) {
  const toolParts = parts.filter(
    (part): part is MessagePresentationToolPart => part.kind === "tool",
  );
  const call = toolParts.find((part) => part.stage === "call");
  const result = toolParts.find((part) => part.stage !== "call");
  const effective = result ?? call;
  if (effective === undefined) {
    return null;
  }
  const input = call === undefined ? "" : presentationJsonText(call.value);
  const output = result === undefined ? "" : presentationJsonText(result.value);
  const presentation = buildMessageToolPresentationModel({
    actionFamily: result?.actionFamily ?? call?.actionFamily,
    body: output || input,
    callId: effective.callId,
    error: effective.error,
    input,
    output,
    raw: output || input,
    semanticCategory: result?.semanticCategory ?? call?.semanticCategory,
    stage: result?.stage === "validation"
      ? "validation"
      : result === undefined ? "call" : "return",
    t,
    toolName: effective.toolName,
  });
  return (
    <MessagePresentationTool
      {...presentation}
      disclosureId={disclosureId}
      interactive={interactive}
      t={t}
    />
  );
}

export function MessagePresentationTool({
  bodyExtras,
  callId,
  className = "",
  defaultOpen = false,
  detailsEnabled = true,
  disclosureId,
  elementRef,
  error,
  input,
  interactive = true,
  output,
  preview,
  raw,
  renderDisclosure,
  status,
  summaryExtras,
  summaryLabel,
  summaryOnClick,
  t,
  title,
  toolName,
}: MessageToolPresentationProps) {
  const summary = (
    <summary
      aria-label={summaryLabel}
      className="at-message-tool-summary"
      data-disclosure-id={disclosureId}
      onClick={summaryOnClick}
    >
      <span className="at-message-tool-title">
        <Wrench aria-hidden="true" size={14} />
        <span title={interactive ? title : undefined}>{title}</span>
      </span>
      {preview ? (
        <span
          className="at-message-tool-preview"
          title={interactive ? preview : undefined}
        >
          {preview}
        </span>
      ) : null}
      {summaryExtras}
    </summary>
  );
  const hasDetails = detailsEnabled && (callId.trim().length > 0
    || input.trim().length > 0
    || output.trim().length > 0
    || raw.trim().length > 0
    || bodyExtras !== undefined);
  const body = hasDetails ? (
    <div className="at-message-tool-body">
      <ToolCallDetails
        callId={callId}
        error={error}
        input={input}
        interactive={interactive}
        output={output}
        raw={raw}
        t={t}
        toolName={toolName}
      />
      {bodyExtras}
    </div>
  ) : null;
  return renderMessageDisclosure({
    attributes: {
      "data-disclosure-id": disclosureId,
      "data-export-block": "tool",
      "data-status": status,
      "data-tool-call-id": callId || undefined,
      "data-tool-name": toolName,
    },
    body,
    className: ["at-message-tool", error ? "is-error" : "", className]
      .filter(Boolean)
      .join(" "),
    defaultOpen,
    elementRef,
    summary,
  }, renderDisclosure);
}

function renderMessageDisclosure(
  presentation: MessageDisclosurePresentation,
  renderDisclosure?: MessageDisclosureRenderer,
): ReactNode {
  if (renderDisclosure !== undefined) {
    return renderDisclosure(presentation);
  }
  return (
    <details
      {...presentation.attributes}
      className={presentation.className}
      open={presentation.defaultOpen}
      ref={presentation.elementRef}
    >
      {presentation.summary}
      {presentation.body}
    </details>
  );
}

export function MessageStructuredValue({ value }: { value: JsonValue }): ReactNode {
  if (value === null) {
    return <span className="at-message-value-empty">—</span>;
  }
  if (typeof value === "string") {
    const parsed = parsePresentationJson(value);
    if (parsed !== null && parsed !== value) {
      return <MessageStructuredValue value={parsed} />;
    }
    return value.includes("\n")
      ? <pre><code>{value}</code></pre>
      : <code>{value || "—"}</code>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? <span className="at-message-value-empty">—</span> : (
      <ol className="at-message-structured-list">
        {value.map((item, index) => (
          <li key={index}><MessageStructuredValue value={item} /></li>
        ))}
      </ol>
    );
  }
  const fields = Object.entries(value);
  return fields.length === 0 ? <span className="at-message-value-empty">—</span> : (
    <dl className="at-message-structured-fields">
      {fields.map(([key, fieldValue]) => (
        <div className="at-message-structured-field" key={key}>
          <dt>{key}</dt>
          <dd><MessageStructuredValue value={fieldValue} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function messagePresentationStatusIsRoutine(
  part: MessagePresentationStatusPart,
): boolean {
  return part.retryEvent === undefined
    && part.diagnostic === undefined
    && part.errorCode === undefined
    && part.pendingApprovals === undefined
    && part.pendingQuestions === undefined
    && (part.status !== undefined || part.phase !== undefined);
}

function messagePresentationStatusLabel(
  part: MessagePresentationStatusPart,
  labels: MessagePresentationLabels,
): string {
  return part.retryIndex === undefined
    ? labels.status
    : `${labels.retry} ${part.retryIndex + 1}`;
}

function messagePresentationStatusValue(
  part: MessagePresentationStatusPart,
  labels: MessagePresentationLabels,
): JsonValue {
  if (part.retryEvent !== undefined) {
    return part.retryEvent;
  }
  const value: Record<string, JsonValue> = {};
  const state = [part.status, part.phase].filter(Boolean).join(" / ");
  if (state.length > 0) value[labels.status] = state;
  if (part.errorCode !== undefined) value[labels.error] = part.errorCode;
  if (part.diagnostic !== undefined) value[labels.error] = part.diagnostic;
  return value;
}

function normalizedMessageToolPreview(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 180);
}

function presentationJsonText(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function safePresentationMediaUrl(url: string, mimeType: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  if (/^(?:https?:|blob:|file:)/iu.test(trimmed)) {
    return trimmed;
  }
  const dataMatch = /^data:([^;,]+)(?:;base64)?,/iu.exec(trimmed);
  if (dataMatch === null) {
    return "";
  }
  const embeddedMimeType = dataMatch[1]?.toLowerCase() ?? "";
  const declaredMimeType = mimeType.trim().toLowerCase();
  return embeddedMimeType.startsWith("image/")
    || embeddedMimeType.startsWith("audio/")
    || embeddedMimeType.startsWith("video/")
    || (declaredMimeType.length > 0 && embeddedMimeType === declaredMimeType)
    ? trimmed
    : "";
}

function parsePresentationJson(value: string): JsonValue | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))
    && !(trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isPresentationJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPresentationJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPresentationJsonValue);
  }
  return typeof value === "object" && Object.values(value).every(isPresentationJsonValue);
}
