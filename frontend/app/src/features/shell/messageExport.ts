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
import {
  buildMessageTranscript,
  type MessageTranscript,
  type TranscriptEntry,
  type TranscriptEntryKind,
} from "./messageTranscript";

export type MessageExportFormat = "html" | "png";

export interface ExportSessionMessagesOptions {
  format: MessageExportFormat;
  rounds: SessionRound[];
  sessionId: string;
}

interface ExportBlock {
  kind?: TranscriptEntryKind;
  label: string;
  text: string;
}

interface PngBlock {
  kind?: TranscriptEntryKind;
  label: string;
  lines: string[];
  height: number;
}

const PNG_WIDTH = 960;
const PNG_PADDING_X = 36;
const PNG_PADDING_TOP = 32;
const PNG_PADDING_BOTTOM = 36;
const PNG_BLOCK_GAP = 18;
const PNG_LABEL_LINE_HEIGHT = 18;
const PNG_TEXT_LINE_HEIGHT = 21;
const PNG_TITLE_FONT = "600 20px sans-serif";
const PNG_META_FONT = "12px sans-serif";
const PNG_LABEL_FONT = "600 12px sans-serif";
const PNG_TEXT_FONT = "14px sans-serif";
const PNG_MAX_CONTENT_HEIGHT = 6000;

export async function exportSessionMessages({
  format,
  rounds,
  sessionId,
}: ExportSessionMessagesOptions): Promise<number> {
  const transcript = buildMessageTranscript(sessionId, rounds);
  if (format === "html") {
    const html = buildMessagesHtml(sessionId, rounds);
    downloadBlob(
      `${messageExportFilenameBase(sessionId)}.html`,
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    return 1;
  }

  const blobs = await buildMessagesPngBlobs(
    sessionId,
    transcript.entries.map((entry) => ({
      kind: entry.kind,
      label: entry.label,
      text: entry.text,
    })),
  );
  blobs.forEach((blob, index) => {
    const suffix = blobs.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
    downloadBlob(`${messageExportFilenameBase(sessionId)}${suffix}.png`, blob);
  });
  return blobs.length;
}

export function buildMessagesHtml(
  sessionId: string,
  rounds: SessionRound[],
): string {
  const transcript = buildMessageTranscript(sessionId, rounds);
  const rows = transcript.rounds.map(transcriptRoundHtml).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sessionId)} transcript</title>
  <style>
    :root { color-scheme: light dark; --bg: #f5f6f4; --panel: #fff; --text: #20231f; --muted: #6b7069; --line: #dfe1dc; --accent: #2563eb; --code: #f1f3ef; }
    @media (prefers-color-scheme: dark) { :root { --bg: #171917; --panel: #222522; --text: #eef0eb; --muted: #abb0a8; --line: #3a3e39; --accent: #7ca8ff; --code: #161816; } }
    * { box-sizing: border-box; }
    body { margin: 0; font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
    main { width: min(920px, calc(100% - 32px)); margin: 32px auto 64px; }
    .transcript-header { margin-bottom: 24px; }
    h1 { margin: 0 0 4px; overflow-wrap: anywhere; font-size: 24px; line-height: 1.3; }
    .meta { margin: 0; color: var(--muted); font-size: 12px; }
    .round { margin-top: 18px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
    .round-header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .round-title { margin: 0; font-size: 15px; }
    .entry { margin-top: 12px; padding: 12px 14px; border-left: 3px solid var(--line); border-radius: 7px; background: color-mix(in srgb, var(--panel) 94%, var(--line)); }
    .entry[data-kind="user"], .entry[data-kind="injection"] { border-left-color: var(--accent); }
    .entry[data-kind="thinking"] { opacity: .82; }
    .entry[data-kind="tool"], .entry[data-kind="question"] { background: var(--code); }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; color: var(--muted); font-size: 12px; }
    .entry-label { color: var(--text); font-weight: 650; }
    .content > :first-child { margin-top: 0; } .content > :last-child { margin-bottom: 0; }
    .content p, .content ul, .content ol, .content pre { margin: 8px 0; }
    pre, code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    pre { overflow-x: auto; padding: 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--code); white-space: pre-wrap; overflow-wrap: anywhere; }
    code { padding: 1px 4px; border-radius: 4px; background: var(--code); }
    pre code { padding: 0; background: transparent; }
    @media print { body { background: #fff; } main { width: 100%; margin: 0; } .round { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <header class="transcript-header">
      <h1>${escapeHtml(sessionId)}</h1>
      <p class="meta">${transcript.entries.length} entries · Exported ${escapeHtml(formatExportTime(transcript.exportedAt))}</p>
    </header>
    ${rows || '<p class="meta">No messages.</p>'}
  </main>
</body>
</html>`;
}

function transcriptRoundHtml(round: MessageTranscript["rounds"][number]): string {
  const meta = [round.createdAt ? formatExportTime(round.createdAt) : "", round.status ?? ""]
    .filter(Boolean)
    .join(" · ");
  return `<section class="round" data-run-id="${escapeHtml(round.runId)}">
    <header class="round-header">
      <h2 class="round-title">Round ${round.index + 1}</h2>
      <span class="meta">${escapeHtml(meta)}</span>
    </header>
    ${round.entries.map(transcriptEntryHtml).join("")}
  </section>`;
}

function transcriptEntryHtml(entry: TranscriptEntry): string {
  const time = entry.createdAt ? formatExportTime(entry.createdAt) : "";
  const content = entry.kind === "tool" || entry.kind === "question" || entry.kind === "status"
    ? `<pre><code>${escapeHtml(entry.text)}</code></pre>`
    : renderSafeMarkdown(entry.text);
  return `<article class="entry" data-kind="${entry.kind}" data-sequence="${entry.sequence}">
    <header class="entry-head">
      <span class="entry-label">${escapeHtml(entry.label)}</span>
      <time>${escapeHtml(time)}</time>
    </header>
    <div class="content">${content}</div>
  </article>`;
}

function renderSafeMarkdown(markdown: string): string {
  const codeBlocks: string[] = [];
  const withoutCode = markdown.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_match, language: string, code: string) => {
    const token = `MESSAGE_EXPORT_CODE_BLOCK_${codeBlocks.length}`;
    const languageClass = language.trim()
      ? ` class="language-${escapeHtml(language.trim().replace(/[^a-zA-Z0-9_-]/g, ""))}"`
      : "";
    codeBlocks.push(`<pre><code${languageClass}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\n${token}\n`;
  });
  const escaped = escapeHtml(withoutCode)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      const codeIndex = codeBlocks.findIndex((_value, index) => trimmed === `MESSAGE_EXPORT_CODE_BLOCK_${index}`);
      if (codeIndex >= 0) {
        return codeBlocks[codeIndex] ?? "";
      }
      const lines = trimmed.split("\n");
      if (lines.every((line) => /^[-*] /.test(line))) {
        return `<ul>${lines.map((line) => `<li>${line.slice(2)}</li>`).join("")}</ul>`;
      }
      return `<p>${lines.join("<br />")}</p>`;
    })
    .join("");
}

function formatExportTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

export async function buildMessagesPngBlobs(
  sessionId: string,
  blocks: ExportBlock[],
): Promise<Blob[]> {
  await waitForExportFonts();
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (measureContext === null) {
    throw new Error("PNG export is not supported by this browser.");
  }

  const pngBlocks = layoutPngBlocks(measureContext, blocks);
  const chunks = chunkPngBlocks(pngBlocks);
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const blobs: Blob[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? [];
    const height = measurePngHeight(chunk);
    const canvas = document.createElement("canvas");
    canvas.width = PNG_WIDTH;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("PNG export is not supported by this browser.");
    }
    drawMessagesPng(context, {
      blocks: chunk,
      chunkIndex: index,
      chunkTotal: chunks.length,
      height,
      sessionId,
    });
    blobs.push(await canvasToPngBlob(canvas));
  }
  return blobs;
}

function roundExportBlocks(rounds: SessionRound[]): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  rounds.forEach((round, index) => {
    blocks.push(roundSummaryBlock(round, index));
    const promptText = promptPartsText(round.intent_parts) ?? normalizedText(round.intent);
    if (promptText) {
      blocks.push({
        label: `Round ${index + 1} prompt`,
        text: promptText,
      });
    }
    for (const message of roundTimelineMessages(round)) {
      blocks.push({
        label: messageLabel(message),
        text: roundMessageText(message),
      });
    }
    if (round.pending_tool_approval_count !== undefined && round.pending_tool_approval_count > 0) {
      blocks.push({
        label: `Round ${index + 1} pending approvals`,
        text: `${round.pending_tool_approval_count} pending tool approval(s).`,
      });
    }
    if (round.pending_user_question_count !== undefined && round.pending_user_question_count > 0) {
      blocks.push({
        label: `Round ${index + 1} pending user questions`,
        text: `${round.pending_user_question_count} pending user question(s).`,
      });
    }
    blocks.push(...roundRetryEventBlocks(round, index));
    if (normalizedText(round.run_diagnostic_message)) {
      blocks.push({
        label: `Round ${index + 1} diagnostic`,
        text: normalizedText(round.run_diagnostic_message),
      });
    }
  });
  return blocks;
}

function roundHtml(round: SessionRound, index: number): string {
  const promptText = promptPartsText(round.intent_parts) ?? normalizedText(round.intent);
  const prompt = promptText
    ? exportMessageHtml("message-export-user", `Round ${index + 1} prompt`, promptText)
    : "";
  const messages = roundTimelineMessages(round)
    .map((message) =>
      exportMessageHtml(messageExportClass(message), messageLabel(message), roundMessageText(message)),
    )
    .join("");
  const statuses = roundStatusBlocks(round, index)
    .map((block) => exportMessageHtml("message-export-status", block.label, block.text))
    .join("");
  return `
    <section class="message-export-turn" data-run-id="${escapeHtml(round.run_id)}">
      <header class="message-export-turn-header">
        <h2 class="message-export-turn-title">Round ${index + 1}</h2>
        <div class="message-export-turn-meta">${escapeHtml(roundMetaText(round))}</div>
      </header>
      ${prompt}
      ${messages}
      ${statuses}
    </section>`;
}

function roundStatusBlocks(round: SessionRound, index: number): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  if (round.pending_tool_approval_count !== undefined && round.pending_tool_approval_count > 0) {
    blocks.push({
      label: `Round ${index + 1} pending approvals`,
      text: `${round.pending_tool_approval_count} pending tool approval(s).`,
    });
  }
  if (round.pending_user_question_count !== undefined && round.pending_user_question_count > 0) {
    blocks.push({
      label: `Round ${index + 1} pending user questions`,
      text: `${round.pending_user_question_count} pending user question(s).`,
    });
  }
  blocks.push(...roundRetryEventBlocks(round, index));
  if (normalizedText(round.run_diagnostic_message)) {
    blocks.push({
      label: `Round ${index + 1} diagnostic`,
      text: normalizedText(round.run_diagnostic_message),
    });
  }
  return blocks;
}

function exportMessageHtml(className: string, label: string, text: string): string {
  return `
      <article class="${className}">
        <div class="role">${escapeHtml(label)}</div>
        <pre>${escapeHtml(text)}</pre>
      </article>`;
}

function messageExportClass(message: SessionRoundMessage): string {
  const role = normalizedText(message.role).toLowerCase();
  const entryType = normalizedText(message.entry_type).toLowerCase();
  if (role === "user" || entryType === "injection") {
    return "message-export-user";
  }
  return "message-export-agent";
}

function roundMetaText(round: SessionRound): string {
  const status = [round.run_status, round.run_phase]
    .map((value) => normalizedText(value))
    .filter(Boolean)
    .join(" / ");
  return [
    round.run_id ? `Run: ${round.run_id}` : "",
    round.created_at ? `Created: ${round.created_at}` : "",
    status ? `Status: ${status}` : "",
    round.has_final_output === true ? "Final output: yes" : "",
  ].filter(Boolean).join(" · ");
}

function roundRetryEventBlocks(round: SessionRound, roundIndex: number): ExportBlock[] {
  return (round.retry_events ?? []).flatMap((event, eventIndex) => {
    const text = roundRetryEventText(event);
    if (text.length === 0) {
      return [];
    }
    return [
      {
        label: `Round ${roundIndex + 1} retry ${eventIndex + 1}`,
        text,
      },
    ];
  });
}

function roundRetryEventText(event: JsonValue): string {
  const object = jsonObject(event);
  if (object === null) {
    return jsonValueText(event).trim();
  }
  const lines = [
    objectString(object, "kind") ? `Kind: ${objectString(object, "kind")}` : "",
    objectString(object, "phase") ? `Phase: ${objectString(object, "phase")}` : "",
    retryAttemptText(object),
    objectPositiveNumber(object, "retry_in_ms") > 0
      ? `Retry delay: ${objectPositiveNumber(object, "retry_in_ms")}ms`
      : "",
    objectString(object, "to_profile_id")
      ? `Target profile: ${objectString(object, "to_profile_id")}`
      : "",
    objectString(object, "error_code") ? `Error code: ${objectString(object, "error_code")}` : "",
    objectString(object, "error_message")
      ? `Error: ${objectString(object, "error_message")}`
      : "",
    jsonScalarText(object.is_active) ? `Active: ${jsonScalarText(object.is_active)}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : jsonValueText(event).trim();
}

function retryAttemptText(object: Record<string, JsonValue>): string {
  const attempt = objectPositiveNumber(object, "attempt_number");
  const total = objectPositiveNumber(object, "total_attempts");
  if (attempt > 0 && total > 0) {
    return `Attempt: ${attempt}/${total}`;
  }
  if (attempt > 0) {
    return `Attempt: ${attempt}`;
  }
  return "";
}

function roundSummaryBlock(round: SessionRound, index: number): ExportBlock {
  const status = [round.run_status, round.run_phase]
    .map((value) => normalizedText(value))
    .filter(Boolean)
    .join(" / ");
  const lines = [
    `Run: ${round.run_id}`,
    round.created_at ? `Created: ${round.created_at}` : "",
    status ? `Status: ${status}` : "",
    round.has_final_output === true ? "Final output: yes" : "",
  ].filter(Boolean);
  return {
    label: `Round ${index + 1}`,
    text: lines.join("\n"),
  };
}

function roundTimelineMessages(round: SessionRound): SessionRoundMessage[] {
  const coordinatorMessages = (round.coordinator_messages ?? []).map(
    (message, index) => timelineSortableMessage(message, index),
  );
  const injectionMessages = (round.injection_messages ?? []).map(
    (message, index) => timelineSortableMessage(injectionToMessage(message), 100000 + index),
  );
  return [...coordinatorMessages, ...injectionMessages]
    .sort(compareTimelineMessages)
    .map(({ message }) => message);
}

function timelineSortableMessage(message: SessionRoundMessage, index: number) {
  return {
    index,
    message,
    sortAt: message.created_at ?? "",
  };
}

function injectionToMessage(message: SessionRoundMessage): SessionRoundMessage {
  const content =
    normalizedText(message.content)
    || promptPartsText(message.content_parts)
    || "injection";
  return {
    ...message,
    content,
    entry_type: "injection",
    label: message.source === "subagent" ? "Subagent injection" : "User injection",
    message: {
      parts: [
        {
          content,
          part_kind: "text",
        },
      ],
    },
    role: "user",
  };
}

function compareTimelineMessages(
  left: ReturnType<typeof timelineSortableMessage>,
  right: ReturnType<typeof timelineSortableMessage>,
): number {
  const leftAt = Date.parse(left.sortAt);
  const rightAt = Date.parse(right.sortAt);
  if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) {
    return leftAt - rightAt;
  }
  if (Number.isFinite(leftAt) && !Number.isFinite(rightAt)) {
    return 1;
  }
  if (!Number.isFinite(leftAt) && Number.isFinite(rightAt)) {
    return -1;
  }
  return left.index - right.index;
}

function messageLabel(message: SessionRoundMessage): string {
  const explicitLabel = normalizedText(message.label);
  if (explicitLabel) {
    return explicitLabel;
  }
  if (message.role_id?.trim()) {
    return message.role_id;
  }
  if (message.role?.trim()) {
    return message.role;
  }
  return message.entry_type ?? "message";
}

function roundMessageText(message: SessionRoundMessage): string {
  const parts = message.message?.parts ?? [];
  const partTexts = parts.map(partText).filter(isPresentText);
  if (partTexts.length > 0) {
    return partTexts.join("\n\n");
  }
  const nestedContent = normalizedText(message.message?.content);
  if (nestedContent) {
    return nestedContent;
  }
  const content = normalizedText(message.content);
  if (content) {
    return content;
  }
  const contentPartsText = promptPartsText(message.content_parts);
  if (contentPartsText) {
    return contentPartsText;
  }
  return message.entry_type ?? "message";
}

function partText(part: SessionRoundMessagePart): string | null {
  const kind = normalizedText(part.part_kind ?? part.kind);
  if (kind === "text" || kind === "user-prompt") {
    return normalizedText(part.content) || normalizedText(part.text) || null;
  }
  if (kind === "thinking") {
    const content = normalizedText(part.content);
    return content ? `Thinking:\n${content}` : null;
  }
  if (kind === "tool-call" || (part.tool_name !== undefined && part.args !== undefined)) {
    return [
      `Tool call: ${part.tool_name ?? "unknown_tool"}`,
      `Call id: ${part.tool_call_id ?? ""}`,
      `Args: ${jsonValueText(part.args ?? null)}`,
    ].join("\n");
  }
  if (kind === "tool-return") {
    const resultLabel = part.is_error === true ? "Tool error" : "Tool result";
    return [
      `${resultLabel}: ${part.tool_name ?? "unknown_tool"}`,
      `Call id: ${part.tool_call_id ?? ""}`,
      jsonValueText(part.content ?? null),
    ].join("\n");
  }
  if (kind === "media_ref") {
    return mediaReferenceText({
      mimeType: part.mime_type,
      modality: part.modality,
      name: part.name,
      url: part.url,
    });
  }
  return null;
}

function promptPartsText(parts: ContentPart[] | undefined): string | null {
  const partTexts = (parts ?? [])
    .map((part) => contentPartExportText(part))
    .filter(isPresentText);
  return partTexts.length > 0 ? partTexts.join("\n\n") : null;
}

function contentPartExportText(part: ContentPart): string | null {
  const text = contentPartText(part);
  if (isPresentText(text)) {
    return text;
  }
  if (isContentMediaRefPart(part)) {
    return mediaReferenceText({
      assetId: part.asset_id,
      mimeType: part.mime_type,
      modality: part.modality,
      name: part.name,
      url: part.url,
    });
  }
  if (isLegacyContentMediaRefPart(part)) {
    return mediaReferenceText({
      modality: part.media_type,
      name: part.name,
      url: part.url,
    });
  }
  if (isInlineMediaPart(part)) {
    return mediaReferenceText({
      mimeType: part.mime_type,
      modality: part.modality || mediaTypeModality(part.mime_type),
      name: part.name,
      url: mediaDataUrl(part.mime_type, part.base64_data),
    });
  }
  if (isBinaryMediaPart(part)) {
    return mediaReferenceText({
      mimeType: part.media_type,
      modality: mediaTypeModality(part.media_type),
      name: part.name,
      url: mediaDataUrl(part.media_type, part.data),
    });
  }
  if (isUrlMediaPart(part)) {
    return mediaReferenceText({
      mimeType: part.media_type,
      modality: part.kind.replace("-url", ""),
      name: part.name,
      url: part.url,
    });
  }
  return null;
}

function isContentMediaRefPart(part: ContentPart): part is ContentMediaRefPart {
  return "kind" in part && part.kind === "media_ref";
}

function isLegacyContentMediaRefPart(
  part: ContentPart,
): part is LegacyContentMediaRefPart {
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

function layoutPngBlocks(
  context: CanvasRenderingContext2D,
  blocks: ExportBlock[],
): PngBlock[] {
  context.font = PNG_TEXT_FONT;
  return blocks.flatMap((block) => {
    const lines = wrapText(
      context,
      block.text,
      PNG_WIDTH - PNG_PADDING_X * 2,
    );
    const splitLines = splitOversizedLines(lines);
    return splitLines.map((chunkLines, index) => ({
      height:
        PNG_LABEL_LINE_HEIGHT
        + Math.max(chunkLines.length, 1) * PNG_TEXT_LINE_HEIGHT
        + PNG_BLOCK_GAP,
      kind: block.kind,
      label: index === 0 ? block.label : `${block.label} (continued)`,
      lines: chunkLines,
    }));
  });
}

function splitOversizedLines(lines: string[]): string[][] {
  const maxLines = Math.max(
    1,
    Math.floor((PNG_MAX_CONTENT_HEIGHT - PNG_LABEL_LINE_HEIGHT - PNG_BLOCK_GAP) / PNG_TEXT_LINE_HEIGHT),
  );
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    chunks.push(lines.slice(index, index + maxLines));
  }
  return chunks.length > 0 ? chunks : [[""]];
}

function chunkPngBlocks(blocks: PngBlock[]): PngBlock[][] {
  const chunks: PngBlock[][] = [];
  let current: PngBlock[] = [];
  let currentHeight = 0;
  for (const block of blocks) {
    if (
      current.length > 0
      && currentHeight + block.height > PNG_MAX_CONTENT_HEIGHT
    ) {
      chunks.push(current);
      current = [];
      currentHeight = 0;
    }
    current.push(block);
    currentHeight += block.height;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function measurePngHeight(blocks: PngBlock[]): number {
  const contentHeight = blocks.reduce((total, block) => total + block.height, 0);
  return PNG_PADDING_TOP + 58 + contentHeight + PNG_PADDING_BOTTOM;
}

function drawMessagesPng(
  context: CanvasRenderingContext2D,
  options: {
    blocks: PngBlock[];
    chunkIndex: number;
    chunkTotal: number;
    height: number;
    sessionId: string;
  },
): void {
  context.fillStyle = "#f6f6f3";
  context.fillRect(0, 0, PNG_WIDTH, options.height);

  let cursorY = PNG_PADDING_TOP;
  context.fillStyle = "#20231f";
  context.font = PNG_TITLE_FONT;
  context.fillText(options.sessionId, PNG_PADDING_X, cursorY + 22);

  cursorY += 42;
  context.fillStyle = "#62665f";
  context.font = PNG_META_FONT;
  const chunkLabel = options.chunkTotal > 1
    ? `, part ${options.chunkIndex + 1} of ${options.chunkTotal}`
    : "";
  context.fillText(
    `Exported ${new Date().toLocaleString()}${chunkLabel}`,
    PNG_PADDING_X,
    cursorY,
  );

  cursorY += 24;
  if (options.blocks.length === 0) {
    context.fillText("No messages.", PNG_PADDING_X, cursorY);
    return;
  }

  for (const block of options.blocks) {
    context.fillStyle = pngBlockBackground(block.kind);
    context.fillRect(
      PNG_PADDING_X,
      cursorY,
      PNG_WIDTH - PNG_PADDING_X * 2,
      block.height - 6,
    );

    context.fillStyle = pngBlockAccent(block.kind);
    context.fillRect(PNG_PADDING_X, cursorY, 3, block.height - 6);

    cursorY += PNG_LABEL_LINE_HEIGHT;
    context.fillStyle = pngBlockAccent(block.kind);
    context.font = PNG_LABEL_FONT;
    context.fillText(block.label, PNG_PADDING_X, cursorY);

    cursorY += PNG_TEXT_LINE_HEIGHT;
    context.fillStyle = "#20231f";
    context.font = PNG_TEXT_FONT;
    for (const line of block.lines) {
      context.fillText(line, PNG_PADDING_X, cursorY);
      cursorY += PNG_TEXT_LINE_HEIGHT;
    }
    cursorY += PNG_BLOCK_GAP - PNG_TEXT_LINE_HEIGHT;
  }
}

function pngBlockAccent(kind: TranscriptEntryKind | undefined): string {
  switch (kind) {
    case "user":
    case "injection":
      return "#2563eb";
    case "question":
      return "#9a6700";
    case "tool":
      return "#6f42c1";
    case "status":
      return "#6b7069";
    default:
      return "#3d675c";
  }
}

function pngBlockBackground(kind: TranscriptEntryKind | undefined): string {
  switch (kind) {
    case "tool":
    case "question":
      return "#f0eef7";
    case "user":
    case "injection":
      return "#eef4ff";
    default:
      return "#ffffff";
  }
}

async function waitForExportFonts(): Promise<void> {
  if (document.fonts !== undefined) {
    await document.fonts.ready;
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    wrapParagraph(context, paragraph, maxWidth, lines);
  }
  return lines.length > 0 ? lines : ["message"];
}

function wrapParagraph(
  context: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number,
  lines: string[],
): void {
  let currentLine = "";
  for (const word of paragraph.split(/\s+/)) {
    if (context.measureText(word).width > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...breakLongWord(context, word, maxWidth));
      continue;
    }
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  }
  if (currentLine) {
    lines.push(currentLine);
  }
}

function breakLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of Array.from(word)) {
    const nextChunk = `${chunk}${character}`;
    if (chunk && context.measureText(nextChunk).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
      continue;
    }
    chunk = nextChunk;
  }
  if (chunk) {
    chunks.push(chunk);
  }
  return chunks;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob !== null) {
        resolve(blob);
        return;
      }
      reject(new Error("PNG export failed."));
    }, "image/png");
  });
}

function normalizedText(value: JsonValue | string | null | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function mediaReferenceText({
  assetId,
  mimeType,
  modality,
  name,
  url,
}: {
  assetId?: string;
  mimeType?: string;
  modality?: string;
  name?: string;
  url?: string;
}): string {
  const mediaType = normalizedText(modality) || "media";
  const label = normalizedText(name) || normalizedText(assetId) || normalizedText(url) || "reference";
  return [
    `[${mediaType}: ${label}]`,
    mimeType ? `Type: ${mimeType}` : "",
    url ? `URL: ${url}` : "",
  ].filter(Boolean).join("\n");
}

function mediaDataUrl(
  mediaType: string | undefined,
  data: string | undefined,
): string | undefined {
  const safeMediaType = normalizedText(mediaType);
  const safeData = normalizedText(data);
  if (!safeMediaType || !safeData) {
    return undefined;
  }
  return `data:${safeMediaType};base64,${safeData}`;
}

function mediaTypeModality(mediaType: string | undefined): string {
  const normalized = normalizedText(mediaType).toLowerCase();
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("image/")) {
    return "image";
  }
  return "media";
}

function jsonValueText(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
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

function jsonScalarText(value: JsonValue | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isPresentText(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

function messageExportFilenameBase(sessionId: string): string {
  const safeSessionId = sessionId
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 96);
  return `${safeSessionId || "session"}-messages`;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
