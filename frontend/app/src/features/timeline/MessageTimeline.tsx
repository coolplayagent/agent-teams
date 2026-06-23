import { App, Button, Empty, Image, Skeleton, Tooltip, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Wrench } from "lucide-react";
import { useMemo, useRef } from "react";

import { listSessionMessages } from "../../api/client";
import { contentPartText, type ContentPart, type TimelineMessage } from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import type { TimelineEntry } from "../../runtime/reducers";
import { useRuntimeStore } from "../../runtime/runtimeStore";

interface MessageTimelineProps {
  sessionId: string | null;
}

export function MessageTimeline({ sessionId }: MessageTimelineProps) {
  const { message } = App.useApp();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const messagesQuery = useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: () => listSessionMessages(sessionId ?? ""),
    enabled: sessionId !== null,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const runtimeEntries = useMemo(
    () =>
      Object.values(runtimeState.runs)
        .flatMap((runState) => runState.entries)
        .filter((entry) => entry.sessionId === sessionId),
    [runtimeState, sessionId],
  );
  const rows = useMemo(
    () => [
      ...messages.map(messageToRow),
      ...runtimeEntries.map(runtimeEntryToRow),
    ],
    [messages, runtimeEntries],
  );
  const streamOpenForSession = useMemo(
    () =>
      Object.values(runtimeState.runs).some(
        (runState) =>
          runState.status !== "closed" &&
          runState.entries.some((entry) => entry.sessionId === sessionId),
      ),
    [runtimeState.runs, sessionId],
  );
  const lastAnswer = useMemo(() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row !== undefined && row.copyable) {
        return row;
      }
    }
    return undefined;
  }, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateRowSize(rows[index]),
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const renderedVirtualItems = virtualItems.length > 0
    ? virtualItems
    : fallbackVirtualItems(rows);
  const timelineHeight = virtualItems.length > 0
    ? virtualizer.getTotalSize()
    : fallbackTotalSize(rows);

  if (sessionId === null) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="Select a session" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (messagesQuery.isLoading) {
    return (
      <div className="at-timeline">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (messagesQuery.isError) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="Could not load messages" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="No messages yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className="at-timeline" ref={parentRef}>
      <div className="at-timeline-toolbar">
        <Tooltip
          title={
            streamOpenForSession ? "Copy is available after streaming finishes" : "Copy last answer"
          }
        >
          <Button
            aria-label="Copy last answer"
            disabled={lastAnswer === undefined || streamOpenForSession}
            icon={<Copy size={15} />}
            onClick={() => {
              void copyLastAnswer(lastAnswer, message);
            }}
            size="small"
            type="text"
          />
        </Tooltip>
      </div>
      <div
        className="at-timeline-virtual"
        style={{ height: `${timelineHeight}px` }}
      >
        {renderedVirtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          return (
            <article
              className={`at-message ${row.source === "runtime" ? "is-runtime" : ""}`}
              key={row.key}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <Typography.Text className="at-message-role">
                {row.role}
              </Typography.Text>
              <MessageRowContent parts={row.parts} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

interface TimelineRow {
  key: string;
  role: string;
  text: string;
  kind: RunEventType | "message";
  parts: TimelineRenderPart[];
  source: "message" | "runtime";
  copyable: boolean;
}

type TimelineRenderPart = TimelineTextPart | TimelineMediaPart | TimelineToolPart;

interface TimelineTextPart {
  kind: "text";
  text: string;
}

interface TimelineMediaPart {
  kind: "media";
  mimeType: string;
  modality: string;
  name: string;
  url: string;
}

interface TimelineToolPart {
  body: string;
  callId: string;
  error: boolean;
  kind: "tool";
  phase: "call" | "result" | "validation";
  toolName: string;
}

interface FallbackVirtualItem {
  index: number;
  start: number;
}

function fallbackVirtualItems(rows: TimelineRow[]): FallbackVirtualItem[] {
  let start = 0;
  return rows.map((row, index) => {
    const item = { index, start };
    start += estimateRowSize(row);
    return item;
  });
}

function fallbackTotalSize(rows: TimelineRow[]): number {
  return rows.reduce((total, row) => total + estimateRowSize(row), 0);
}

function messageToRow(message: TimelineMessage, index: number): TimelineRow {
  const role = message.role_id ?? message.role ?? "agent";
  const parts = messageParts(message);
  const text = rowCopyText(parts);
  return {
    key: `message:${message.message_id ?? index}`,
    role,
    text,
    kind: "message",
    parts,
    source: "message",
    copyable: isAnswerRole(role) && text.trim().length > 0,
  };
}

function runtimeEntryToRow(entry: TimelineEntry): TimelineRow {
  return {
    key: `runtime:${entry.id}`,
    role: entry.roleId,
    text: entry.text,
    kind: entry.kind,
    parts: [{ kind: "text", text: entry.text }],
    source: "runtime",
    copyable: false,
  };
}

function MessageRowContent({ parts }: { parts: TimelineRenderPart[] }) {
  return (
    <div className="at-message-content">
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return (
            <Typography.Paragraph
              className="at-message-text"
              key={`text:${index}`}
            >
              {part.text}
            </Typography.Paragraph>
          );
        }
        if (part.kind === "tool") {
          return <MessageToolBlock key={`tool:${index}`} tool={part} />;
        }
        return <MessageMediaPreview key={`media:${index}`} media={part} />;
      })}
    </div>
  );
}

function MessageToolBlock({ tool }: { tool: TimelineToolPart }) {
  const title = `${toolPhaseLabel(tool)}: ${tool.toolName}`;
  return (
    <div className={`at-message-tool ${tool.error ? "is-error" : ""}`}>
      <div className="at-message-tool-title">
        <Wrench aria-hidden="true" size={14} />
        <span>{title}</span>
      </div>
      {tool.callId ? (
        <div className="at-message-tool-meta">Call id: {tool.callId}</div>
      ) : null}
      {tool.body ? <pre>{tool.body}</pre> : null}
    </div>
  );
}

function MessageMediaPreview({ media }: { media: TimelineMediaPart }) {
  const label = media.name || media.modality || "media";
  if (media.modality === "image" || media.mimeType.startsWith("image/")) {
    return (
      <figure className="at-message-media">
        <Image
          alt={label}
          className="at-message-media-image"
          preview={{ mask: "Preview" }}
          src={media.url}
        />
        <figcaption>{label}</figcaption>
      </figure>
    );
  }
  return (
    <a
      className="at-message-media-link"
      href={media.url}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

function messageParts(message: TimelineMessage): TimelineRenderPart[] {
  if (typeof message.content === "string" && message.content.trim()) {
    return [{ kind: "text", text: message.content }];
  }
  const parts = messageContentParts(message).flatMap(contentPartToRenderParts);
  if (parts.length > 0) {
    return parts;
  }
  if (typeof message.message?.content === "string" && message.message.content.trim()) {
    return [{ kind: "text", text: message.message.content }];
  }
  return [{ kind: "text", text: message.entry_type ?? "message" }];
}

function messageContentParts(message: TimelineMessage): ContentPart[] {
  return message.parts ?? message.message?.parts ?? [];
}

function contentPartToRenderParts(part: ContentPart): TimelineRenderPart[] {
  const text = contentPartText(part);
  if (text !== null) {
    return [{ kind: "text", text }];
  }
  const media = contentPartMedia(part);
  if (media !== null) {
    return [media];
  }
  const tool = contentPartTool(part);
  if (tool !== null) {
    return [tool];
  }
  return [];
}

function contentPartTool(part: ContentPart): TimelineToolPart | null {
  const kind = contentPartKind(part);
  if (kind === "tool-call" || contentPartHasToolCallShape(part)) {
    return {
      body: jsonValueText("args" in part ? part.args ?? null : null),
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      error: false,
      kind: "tool",
      phase: "call",
      toolName: "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool",
    };
  }
  if (kind === "tool-return") {
    const content = "content" in part ? part.content ?? null : null;
    return {
      body: jsonValueText(content),
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      error: toolReturnIsError(part, content),
      kind: "tool",
      phase: "result",
      toolName: "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool",
    };
  }
  if (kind === "retry-prompt") {
    return {
      body: jsonValueText("content" in part ? part.content ?? null : null),
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      error: true,
      kind: "tool",
      phase: "validation",
      toolName: "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool",
    };
  }
  return null;
}

function contentPartKind(part: ContentPart): string {
  if ("part_kind" in part) {
    return part.part_kind;
  }
  if ("kind" in part) {
    return part.kind;
  }
  return "";
}

function contentPartHasToolCallShape(part: ContentPart): boolean {
  return "tool_name" in part && "args" in part && part.tool_name !== undefined;
}

function contentPartMedia(part: ContentPart): TimelineMediaPart | null {
  if ("kind" in part && part.kind === "media_ref") {
    return mediaPartFromFields({
      mimeType: part.mime_type,
      modality: part.modality,
      name: part.name,
      url: part.url,
    });
  }
  if ("part_kind" in part && part.part_kind === "media_ref") {
    return mediaPartFromFields({
      mimeType: part.media_type,
      modality: mediaTypeModality(part.media_type),
      name: part.name,
      url: part.url,
    });
  }
  return null;
}

function mediaPartFromFields({
  mimeType,
  modality,
  name,
  url,
}: {
  mimeType?: string;
  modality?: string;
  name?: string;
  url?: string;
}): TimelineMediaPart | null {
  const safeUrl = url?.trim() ?? "";
  if (!safeUrl) {
    return null;
  }
  const safeMimeType = mimeType?.trim() ?? "";
  const safeModality = modality?.trim() || mediaTypeModality(safeMimeType);
  return {
    kind: "media",
    mimeType: safeMimeType,
    modality: safeModality || "media",
    name: name?.trim() || safeModality || "media",
    url: safeUrl,
  };
}

function mediaTypeModality(mediaType: string | undefined): string {
  const normalized = mediaType?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  return "media";
}

function rowCopyText(parts: TimelineRenderPart[]): string {
  return parts
    .filter((part): part is TimelineTextPart => part.kind === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function estimateRowSize(row: TimelineRow | undefined): number {
  if (row === undefined) {
    return 120;
  }
  const mediaCount = row.parts.filter((part) => part.kind === "media").length;
  const toolCount = row.parts.filter((part) => part.kind === "tool").length;
  const textLength = row.text.length;
  return 96
    + mediaCount * 138
    + toolCount * 118
    + Math.min(160, Math.ceil(textLength / 110) * 22);
}

function toolPhaseLabel(tool: TimelineToolPart): string {
  if (tool.phase === "call") {
    return "Tool call";
  }
  if (tool.phase === "validation") {
    return "Tool validation";
  }
  if (tool.error) {
    return "Tool error";
  }
  return "Tool result";
}

function toolReturnIsError(
  part: ContentPart,
  content: unknown,
): boolean {
  if ("is_error" in part && part.is_error === true) {
    return true;
  }
  if ("outcome" in part && toolOutcomeIsError(part.outcome)) {
    return true;
  }
  return jsonObjectHasFailedOk(content);
}

function toolOutcomeIsError(outcome: unknown): boolean {
  if (typeof outcome !== "string") {
    return false;
  }
  const normalized = outcome.trim().toLowerCase();
  return normalized === "failed" || normalized === "denied";
}

function jsonObjectHasFailedOk(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return "ok" in value && value.ok === false;
}

function jsonValueText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function isAnswerRole(role: string): boolean {
  return role.trim().toLowerCase() !== "user";
}

async function copyLastAnswer(
  row: TimelineRow | undefined,
  messenger: ReturnType<typeof App.useApp>["message"],
): Promise<void> {
  const text = row?.text.trim() ?? "";
  if (!text) {
    void messenger.warning("No answer content to copy.");
    return;
  }
  try {
    if (navigator.clipboard?.writeText === undefined) {
      throw new Error("Clipboard is unavailable.");
    }
    await navigator.clipboard.writeText(text);
    void messenger.success("Last answer copied.");
  } catch (_error) {
    void messenger.error("Clipboard is unavailable.");
  }
}
