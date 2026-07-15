import type { SessionRound } from "../../api/contracts";
import {
  buildMessageTranscript,
  serializeMessageTranscript,
} from "../timeline/messagePresentation";

export type MessageExportFormat = "html" | "json" | "png";

export interface ExportSessionMessagesOptions {
  format: MessageExportFormat;
  rounds: SessionRound[];
  sessionId: string;
}

interface ExportBlock {
  kind?: string;
  label: string;
  text: string;
}

interface PngBlock {
  kind?: string;
  label: string;
  lines: string[];
  height: number;
}

interface PngExportCopy {
  continued: string;
  empty: string;
  exported: string;
  of: string;
  part: string;
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
  if (format === "json") {
    downloadBlob(
      `${messageExportFilenameBase(sessionId)}.json`,
      new Blob([serializeMessageTranscript(transcript)], {
        type: "application/json;charset=utf-8",
      }),
    );
    return 1;
  }

  const locale = activeExportLocale();
  if (format === "html") {
    const renderedDocument = await buildMessagesHtml(sessionId, rounds, locale);
    downloadBlob(
      `${messageExportFilenameBase(sessionId)}.html`,
      new Blob([renderedDocument], { type: "text/html;charset=utf-8" }),
    );
    return 1;
  }

  const { messageTranscriptExportBlocks } = await import(
    "../timeline/MessageTranscriptDocument"
  );
  const blobs = await buildMessagesPngBlobs(
    sessionId,
    messageTranscriptExportBlocks(transcript, locale),
    locale,
  );
  blobs.forEach((blob, index) => {
    const suffix = blobs.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
    downloadBlob(`${messageExportFilenameBase(sessionId)}${suffix}.png`, blob);
  });
  return blobs.length;
}

export function buildMessagesJson(
  sessionId: string,
  rounds: SessionRound[],
  exportedAt?: string,
): string {
  return serializeMessageTranscript(
    buildMessageTranscript(sessionId, rounds, exportedAt),
  );
}

/**
 * Export deliberately reuses the timeline's React presentation tree. This
 * function only supplies the offline document shell around that shared view.
 */
export async function buildMessagesHtml(
  sessionId: string,
  rounds: SessionRound[],
  locale = "en",
): Promise<string> {
  const { buildMessageExportDocument } = await import("./messageExportDocument");
  return buildMessageExportDocument(
    buildMessageTranscript(sessionId, rounds),
    locale,
  );
}

function activeExportLocale(): string {
  return document.documentElement.lang || navigator.language || "en";
}

export async function buildMessagesPngBlobs(
  sessionId: string,
  blocks: ExportBlock[],
  locale = activeExportLocale(),
): Promise<Blob[]> {
  await waitForExportFonts();
  const copy = pngExportCopy(locale);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (measureContext === null) {
    throw new Error("PNG export is not supported by this browser.");
  }

  const pngBlocks = layoutPngBlocks(measureContext, blocks, copy);
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
      copy,
      height,
      sessionId,
    });
    blobs.push(await canvasToPngBlob(canvas));
  }
  return blobs;
}

function layoutPngBlocks(
  context: CanvasRenderingContext2D,
  blocks: ExportBlock[],
  copy: PngExportCopy,
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
      label: index === 0 ? block.label : `${block.label} (${copy.continued})`,
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
    copy: PngExportCopy;
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
    ? `, ${options.copy.part} ${options.chunkIndex + 1} ${options.copy.of} ${options.chunkTotal}`
    : "";
  context.fillText(
    `${options.copy.exported} ${new Date().toLocaleString()}${chunkLabel}`,
    PNG_PADDING_X,
    cursorY,
  );

  cursorY += 24;
  if (options.blocks.length === 0) {
    context.fillText(options.copy.empty, PNG_PADDING_X, cursorY);
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

function pngBlockAccent(kind: string | undefined): string {
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

function pngBlockBackground(kind: string | undefined): string {
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

function pngExportCopy(locale: string): PngExportCopy {
  if (locale.toLowerCase().startsWith("zh")) {
    return {
      continued: "续",
      empty: "没有可导出的消息。",
      exported: "导出于",
      of: "/",
      part: "第",
    };
  }
  return {
    continued: "continued",
    empty: "No messages.",
    exported: "Exported",
    of: "of",
    part: "part",
  };
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
