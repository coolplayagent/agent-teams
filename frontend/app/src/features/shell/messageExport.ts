import {
  contentPartText,
  type ContentPart,
  type JsonValue,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundMessagePart,
} from "../../api/contracts";

export type MessageExportFormat = "html" | "png";

export interface ExportSessionMessagesOptions {
  format: MessageExportFormat;
  rounds: SessionRound[];
  sessionId: string;
}

interface ExportBlock {
  label: string;
  text: string;
}

interface PngBlock {
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
  const blocks = roundExportBlocks(rounds);
  if (format === "html") {
    const html = buildMessagesHtml(sessionId, rounds);
    downloadBlob(
      `${messageExportFilenameBase(sessionId)}.html`,
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    return 1;
  }

  const blobs = await buildMessagesPngBlobs(sessionId, blocks);
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
  const blocks = roundExportBlocks(rounds);
  const rows = blocks.map(blockHtml).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sessionId)} transcript</title>
  <style>
    body { margin: 32px; font-family: sans-serif; color: #20231f; background: #f6f6f3; }
    main { max-width: 960px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.3; }
    .meta { margin: 0 0 24px; color: #62665f; font-size: 12px; }
    .message { padding: 14px 0; border-top: 1px solid #d8d8d0; }
    .role { color: #62665f; font-size: 12px; margin-bottom: 6px; }
    pre { margin: 0; white-space: pre-wrap; font: inherit; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(sessionId)}</h1>
    <p class="meta">Exported ${escapeHtml(new Date().toLocaleString())}</p>
    ${rows || '<p class="meta">No messages.</p>'}
  </main>
</body>
</html>`;
}

export async function buildMessagesPngBlobs(
  sessionId: string,
  blocks: ExportBlock[],
): Promise<Blob[]> {
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
    if (normalizedText(round.run_diagnostic_message)) {
      blocks.push({
        label: `Round ${index + 1} diagnostic`,
        text: normalizedText(round.run_diagnostic_message),
      });
    }
  });
  return blocks;
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

function blockHtml(block: ExportBlock): string {
  return `
    <article class="message">
      <div class="role">${escapeHtml(block.label)}</div>
      <pre>${escapeHtml(block.text)}</pre>
    </article>`;
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
    return [
      "Media reference",
      part.name ? `Name: ${part.name}` : "",
      part.mime_type ? `Type: ${part.mime_type}` : "",
      part.url ? `URL: ${part.url}` : "",
    ].filter(Boolean).join("\n");
  }
  return null;
}

function promptPartsText(parts: ContentPart[] | undefined): string | null {
  const partTexts = (parts ?? [])
    .map((part) => contentPartText(part))
    .filter(isPresentText);
  return partTexts.length > 0 ? partTexts.join("\n\n") : null;
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
    context.strokeStyle = "#d8d8d0";
    context.beginPath();
    context.moveTo(PNG_PADDING_X, cursorY);
    context.lineTo(PNG_WIDTH - PNG_PADDING_X, cursorY);
    context.stroke();

    cursorY += PNG_LABEL_LINE_HEIGHT;
    context.fillStyle = "#62665f";
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

function jsonValueText(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
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
