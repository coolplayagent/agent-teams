import {
  contentPartText,
  type TimelineMessage,
} from "../../api/contracts";

export type MessageExportFormat = "html" | "png";

export interface ExportSessionMessagesOptions {
  format: MessageExportFormat;
  messages: TimelineMessage[];
  sessionId: string;
}

interface PngMessageBlock {
  role: string;
  lines: string[];
  height: number;
}

const PNG_WIDTH = 960;
const PNG_PADDING_X = 36;
const PNG_PADDING_TOP = 32;
const PNG_PADDING_BOTTOM = 36;
const PNG_MESSAGE_GAP = 18;
const PNG_ROLE_LINE_HEIGHT = 18;
const PNG_TEXT_LINE_HEIGHT = 21;
const PNG_TITLE_FONT = "600 20px sans-serif";
const PNG_META_FONT = "12px sans-serif";
const PNG_ROLE_FONT = "600 12px sans-serif";
const PNG_TEXT_FONT = "14px sans-serif";
const MAX_PNG_HEIGHT = 16384;

export async function exportSessionMessages({
  format,
  messages,
  sessionId,
}: ExportSessionMessagesOptions): Promise<number> {
  if (format === "html") {
    const html = buildMessagesHtml(sessionId, messages);
    downloadBlob(
      `${messageExportFilenameBase(sessionId)}.html`,
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    return 1;
  }

  const blob = await buildMessagesPngBlob(sessionId, messages);
  downloadBlob(`${messageExportFilenameBase(sessionId)}.png`, blob);
  return 1;
}

export function buildMessagesHtml(
  sessionId: string,
  messages: TimelineMessage[],
): string {
  const rows = messages.map(messageHtml).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sessionId)} messages</title>
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

export async function buildMessagesPngBlob(
  sessionId: string,
  messages: TimelineMessage[],
): Promise<Blob> {
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (measureContext === null) {
    throw new Error("PNG export is not supported by this browser.");
  }

  const blocks = layoutPngBlocks(measureContext, messages);
  const height = measurePngHeight(blocks);
  if (height > MAX_PNG_HEIGHT) {
    throw new Error("PNG export is too large for one image. Export HTML instead.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = PNG_WIDTH;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("PNG export is not supported by this browser.");
  }

  drawMessagesPng(context, sessionId, blocks, height);
  return await canvasToPngBlob(canvas);
}

function messageHtml(message: TimelineMessage): string {
  return `
    <article class="message">
      <div class="role">${escapeHtml(messageRole(message))}</div>
      <pre>${escapeHtml(messageText(message))}</pre>
    </article>`;
}

function layoutPngBlocks(
  context: CanvasRenderingContext2D,
  messages: TimelineMessage[],
): PngMessageBlock[] {
  context.font = PNG_TEXT_FONT;
  return messages.map((message) => {
    const lines = wrapText(
      context,
      messageText(message),
      PNG_WIDTH - PNG_PADDING_X * 2,
    );
    return {
      height:
        PNG_ROLE_LINE_HEIGHT
        + Math.max(lines.length, 1) * PNG_TEXT_LINE_HEIGHT
        + PNG_MESSAGE_GAP,
      lines,
      role: messageRole(message),
    };
  });
}

function measurePngHeight(blocks: PngMessageBlock[]): number {
  const messageHeight = blocks.reduce((total, block) => total + block.height, 0);
  return PNG_PADDING_TOP + 58 + messageHeight + PNG_PADDING_BOTTOM;
}

function drawMessagesPng(
  context: CanvasRenderingContext2D,
  sessionId: string,
  blocks: PngMessageBlock[],
  height: number,
): void {
  context.fillStyle = "#f6f6f3";
  context.fillRect(0, 0, PNG_WIDTH, height);

  let cursorY = PNG_PADDING_TOP;
  context.fillStyle = "#20231f";
  context.font = PNG_TITLE_FONT;
  context.fillText(sessionId, PNG_PADDING_X, cursorY + 22);

  cursorY += 42;
  context.fillStyle = "#62665f";
  context.font = PNG_META_FONT;
  context.fillText(`Exported ${new Date().toLocaleString()}`, PNG_PADDING_X, cursorY);

  cursorY += 24;
  if (blocks.length === 0) {
    context.fillText("No messages.", PNG_PADDING_X, cursorY);
    return;
  }

  for (const block of blocks) {
    context.strokeStyle = "#d8d8d0";
    context.beginPath();
    context.moveTo(PNG_PADDING_X, cursorY);
    context.lineTo(PNG_WIDTH - PNG_PADDING_X, cursorY);
    context.stroke();

    cursorY += PNG_ROLE_LINE_HEIGHT;
    context.fillStyle = "#62665f";
    context.font = PNG_ROLE_FONT;
    context.fillText(block.role, PNG_PADDING_X, cursorY);

    cursorY += PNG_TEXT_LINE_HEIGHT;
    context.fillStyle = "#20231f";
    context.font = PNG_TEXT_FONT;
    for (const line of block.lines) {
      context.fillText(line, PNG_PADDING_X, cursorY);
      cursorY += PNG_TEXT_LINE_HEIGHT;
    }
    cursorY += PNG_MESSAGE_GAP - PNG_TEXT_LINE_HEIGHT;
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

function messageText(messageItem: TimelineMessage): string {
  if (typeof messageItem.content === "string" && messageItem.content.trim()) {
    return messageItem.content;
  }
  const partTexts = (messageItem.parts ?? [])
    .map((part) => contentPartText(part))
    .filter(isPresentText);
  if (partTexts.length > 0) {
    return partTexts.join("\n\n");
  }
  return "message";
}

function messageRole(messageItem: TimelineMessage): string {
  return messageItem.role_id ?? messageItem.role ?? "agent";
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
