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
  serializeMessageTranscript,
  type TranscriptEntry,
  type TranscriptEntryKind,
} from "./messageTranscript";

export type MessageExportFormat = "html" | "json" | "png";

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

interface HtmlExportCopy {
  assistant: string;
  completed: string;
  conversation: string;
  empty: string;
  entries: string;
  exportedAt: string;
  failed: string;
  input: string;
  insertedMessage: string;
  output: string;
  round: string;
  rounds: string;
  status: string;
  subagent: string;
  thinking: string;
  tool: string;
  tools: string;
  user: string;
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
  if (format === "html") {
    const html = buildMessagesHtml(sessionId, rounds, activeExportLocale());
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

export function buildMessagesJson(
  sessionId: string,
  rounds: SessionRound[],
  exportedAt?: string,
): string {
  return serializeMessageTranscript(
    buildMessageTranscript(sessionId, rounds, exportedAt),
  );
}

export function buildMessagesHtml(
  sessionId: string,
  rounds: SessionRound[],
  locale = "en",
): string {
  const transcript = buildMessageTranscript(sessionId, rounds);
  const copy = htmlExportCopy(locale);
  const rows = transcript.rounds.map((round) => transcriptRoundHtml(round, copy)).join("");
  const toolCount = transcript.entries.filter(
    (entry) => entry.metadata.tool?.stage === "call",
  ).length;
  const conversationEntryCount = transcript.entries.filter(
    (entry) => entry.kind === "user"
      || entry.kind === "assistant"
      || entry.kind === "subagent"
      || entry.kind === "injection",
  ).length;
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sessionId)} · ${copy.conversation}</title>
  <style>
    :root { color-scheme: light dark; --bg: #f6f7f5; --panel: #fff; --surface: #f0f2ee; --surface-strong: #e5e9e2; --text: #20231f; --muted: #656b63; --line: #d9ddd6; --accent: #1769d2; --accent-soft: #edf5ff; --danger: #b42318; --danger-soft: #fff1f0; --code: #f1f3ef; }
    @media (prefers-color-scheme: dark) { :root { --bg: #171917; --panel: #222522; --surface: #2b2f2a; --surface-strong: #353a34; --text: #eef0eb; --muted: #b3b8af; --line: #3f443d; --accent: #82b2ff; --accent-soft: #1c2c42; --danger: #ff9b91; --danger-soft: #3b2422; --code: #191b19; } }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font: 15px/1.65 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
    .page { display: grid; grid-template-columns: minmax(0, 1fr); width: min(1040px, calc(100% - 32px)); margin: 36px auto 72px; }
    main { min-width: 0; }
    .transcript-header { padding: 0 4px 24px; border-bottom: 1px solid var(--line); }
    .eyebrow { margin: 0 0 5px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 0; overflow-wrap: anywhere; font-size: clamp(24px, 4vw, 34px); line-height: 1.25; letter-spacing: -.02em; }
    .meta { margin: 0; color: var(--muted); font-size: 12px; }
    .export-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; }
    .metric { display: inline-flex; align-items: baseline; gap: 5px; color: var(--muted); font-size: 13px; }
    .metric strong { color: var(--text); font-size: 14px; }
    .round { margin-top: 28px; }
    .round-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
    .round-title { margin: 0; font-size: 17px; line-height: 1.35; }
    .entry { margin-top: 12px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 11px; background: var(--panel); }
    .entry[data-kind="user"] { margin-left: clamp(0px, 8vw, 84px); border-color: #b8d4f6; background: var(--accent-soft); }
    .entry[data-kind="assistant"], .entry[data-kind="subagent"] { border-color: transparent; background: transparent; }
    .entry[data-kind="subagent"] { border-left: 3px solid var(--line); border-radius: 0; }
    .entry[data-kind="injection"], .entry[data-kind="question"] { border-left: 3px solid var(--accent); background: var(--panel); }
    .entry-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 7px; color: var(--muted); font-size: 12px; }
    .entry-label { color: var(--text); font-weight: 700; }
    .content { min-width: 0; overflow-wrap: anywhere; }
    .content > :first-child { margin-top: 0; } .content > :last-child { margin-bottom: 0; }
    .content p, .content ul, .content ol, .content pre, .content blockquote, .content table { margin: 9px 0; }
    .content h2, .content h3, .content h4, .content h5, .content h6 { margin: 20px 0 8px; line-height: 1.35; }
    .content h2 { font-size: 19px; } .content h3 { font-size: 17px; } .content h4, .content h5, .content h6 { font-size: 15px; }
    .content ul, .content ol { padding-left: 24px; }
    blockquote { padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); }
    pre, code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    pre { max-width: 100%; overflow-x: auto; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--code); white-space: pre-wrap; overflow-wrap: anywhere; }
    code { padding: 1px 4px; border-radius: 4px; background: var(--code); }
    pre code { padding: 0; background: transparent; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: var(--surface); font-weight: 700; }
    details.technical { margin-top: 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); }
    details.technical > summary { display: flex; align-items: center; gap: 9px; padding: 9px 12px; cursor: pointer; list-style: none; color: var(--muted); font-size: 13px; }
    details.technical > summary::-webkit-details-marker { display: none; }
    details.technical > summary::before { content: "›"; color: var(--muted); font-size: 18px; line-height: 1; transform-origin: center; transition: transform .14s ease; }
    details.technical[open] > summary::before { transform: rotate(90deg); }
    details.technical > summary .entry-label { flex: 1; }
    .technical-body { padding: 2px 14px 14px 38px; }
    .technical-section + .technical-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
    .technical-section h4 { margin: 0 0 7px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .badge { display: inline-flex; align-items: center; min-height: 22px; padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: 11px; white-space: nowrap; }
    .badge.failed { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
    .structured-fields { display: grid; grid-template-columns: minmax(110px, .3fr) minmax(0, 1fr); margin: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .structured-fields dt, .structured-fields dd { min-width: 0; margin: 0; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .structured-fields dt { background: var(--surface); color: var(--muted); font-size: 12px; font-weight: 650; overflow-wrap: anywhere; }
    .structured-fields dd { overflow-wrap: anywhere; }
    .structured-fields > :nth-last-child(-n+2) { border-bottom: 0; }
    .structured-list { margin: 0; padding-left: 24px; }
    .value-empty { color: var(--muted); }
    .routine-status { display: none; }
    * { scrollbar-width: thin; scrollbar-color: var(--surface-strong) transparent; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: var(--surface-strong); background-clip: padding-box; }
    @media (max-width: 640px) {
      .page { width: min(100% - 20px, 1040px); margin-top: 20px; }
      .round-header, .entry-head { align-items: flex-start; flex-direction: column; gap: 4px; }
      .entry[data-kind="user"] { margin-left: 0; }
      .structured-fields { grid-template-columns: 1fr; }
      .structured-fields dt { border-bottom: 0; }
      .structured-fields > :nth-last-child(-n+2) { border-bottom: 1px solid var(--line); }
      .structured-fields > :last-child { border-bottom: 0; }
      .technical-body { padding-left: 14px; }
    }
    @media print {
      :root { color-scheme: light; --bg: #fff; --panel: #fff; --surface: #f4f4f2; --text: #111; --muted: #555; --line: #d2d2ce; --accent-soft: #f5f9ff; }
      body { background: #fff; font-size: 11pt; }
      .page { display: block; width: 100%; margin: 0; }
      .transcript-header { padding: 0 0 16px; }
      .round { break-before: auto; }
      .entry { break-inside: avoid; }
      details.technical { break-inside: avoid; }
      details.technical:not([open]) .technical-body { display: none; }
    }
  </style>
</head>
<body>
  <div class="page"><main>
    <header class="transcript-header">
      <p class="eyebrow">${copy.conversation}</p>
      <h1>${escapeHtml(sessionId)}</h1>
      <div class="export-meta" aria-label="${copy.status}">
        <span class="metric"><strong>${transcript.rounds.length}</strong> ${copy.rounds}</span>
        <span class="metric"><strong>${conversationEntryCount}</strong> ${copy.entries}</span>
        <span class="metric"><strong>${toolCount}</strong> ${copy.tools}</span>
        <span class="metric">${copy.exportedAt} ${escapeHtml(formatExportTime(transcript.exportedAt))}</span>
      </div>
    </header>
    ${rows || `<p class="meta">${copy.empty}</p>`}
  </main></div>
</body>
</html>`;
}

function transcriptRoundHtml(
  round: MessageTranscript["rounds"][number],
  copy: HtmlExportCopy,
): string {
  const meta = [round.createdAt ? formatExportTime(round.createdAt) : "", round.status ?? ""]
    .filter(Boolean)
    .join(" · ");
  return `<section class="round" id="round-${round.index + 1}" data-run-id="${escapeHtml(round.runId)}">
    <header class="round-header">
      <h2 class="round-title">${copy.round} ${round.index + 1}</h2>
      <span class="meta">${escapeHtml(meta)}</span>
    </header>
    ${transcriptEntriesHtml(round.entries, copy)}
  </section>`;
}

function transcriptEntriesHtml(entries: TranscriptEntry[], copy: HtmlExportCopy): string {
  const rendered: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    if (entry.kind === "tool") {
      const next = entries[index + 1];
      const sameCall = entry.metadata.tool?.stage === "call"
        && next?.kind === "tool"
        && next.metadata.tool?.stage === "return"
        && entry.metadata.tool.callId
        && entry.metadata.tool.callId === next.metadata.tool.callId;
      rendered.push(toolEntryHtml(entry, sameCall ? next : undefined, copy));
      if (sameCall) {
        index += 1;
      }
      continue;
    }
    rendered.push(transcriptEntryHtml(entry, copy));
  }
  return rendered.join("");
}

function transcriptEntryHtml(entry: TranscriptEntry, copy: HtmlExportCopy): string {
  const time = entry.createdAt ? formatExportTime(entry.createdAt) : "";
  if (entry.kind === "thinking") {
    return `<details class="technical thinking-entry" data-actor="${escapeHtml(entry.metadata.actor)}" data-kind="thinking" data-sequence="${entry.sequence}">
      <summary><span class="entry-label">${copy.thinking}</span><time>${escapeHtml(time)}</time></summary>
      <div class="technical-body content">${renderSafeMarkdown(entry.text)}</div>
    </details>`;
  }
  if (entry.kind === "status") {
    if (isRoutineStatus(entry.text)) {
      return `<span class="routine-status" aria-hidden="true">${escapeHtml(entry.text)}</span>`;
    }
    return `<details class="technical status-entry" data-actor="unknown" data-kind="status" data-sequence="${entry.sequence}">
      <summary><span class="entry-label">${escapeHtml(entry.label || copy.status)}</span><time>${escapeHtml(time)}</time></summary>
      <div class="technical-body">${structuredTextHtml(entry.text)}</div>
    </details>`;
  }
  const content = entry.kind === "question"
    ? structuredTextHtml(entry.text)
    : renderSafeMarkdown(entry.text);
  return `<article class="entry" data-actor="${escapeHtml(entry.metadata.actor)}" data-kind="${entry.kind}" data-sequence="${entry.sequence}">
    <header class="entry-head">
      <span class="entry-label">${escapeHtml(readableEntryLabel(entry, copy))}</span>
      <time>${escapeHtml(time)}</time>
    </header>
    <div class="content">${content}</div>
  </article>`;
}

function toolEntryHtml(
  entry: TranscriptEntry,
  resultEntry: TranscriptEntry | undefined,
  copy: HtmlExportCopy,
): string {
  const call = entry.metadata.tool?.stage === "call" ? entry : undefined;
  const result = resultEntry ?? (entry.metadata.tool?.stage === "return" ? entry : undefined);
  const metadata = call?.metadata.tool ?? result?.metadata.tool;
  const isError = result?.metadata.tool?.isError === true;
  const time = call?.createdAt ?? result?.createdAt;
  const formattedTime = time ? formatExportTime(time) : "";
  const input = call?.metadata.tool?.args;
  const output = result?.metadata.tool?.result;
  return `<details class="technical tool-entry" data-actor="${escapeHtml(entry.metadata.actor)}" data-kind="tool" data-sequence="${entry.sequence}">
    <summary>
      <span class="entry-label">${copy.tool} · ${escapeHtml(metadata?.name || entry.label)}</span>
      <span class="badge${isError ? " failed" : ""}">${isError ? copy.failed : result ? copy.completed : copy.status}</span>
      <time>${escapeHtml(formattedTime)}</time>
    </summary>
    <div class="technical-body">
      ${input === undefined && call === undefined ? "" : technicalSectionHtml(copy.input, input ?? call?.text ?? "")}
      ${output === undefined && result === undefined ? "" : technicalSectionHtml(copy.output, output ?? result?.text ?? "")}
    </div>
  </details>`;
}

function technicalSectionHtml(label: string, value: JsonValue): string {
  return `<section class="technical-section"><h4>${escapeHtml(label)}</h4>${structuredValueHtml(value)}</section>`;
}

function renderSafeMarkdown(markdown: string): string {
  const rendered: string[] = [];
  const fencePattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  for (const match of markdown.matchAll(fencePattern)) {
    const matchIndex = match.index;
    if (matchIndex === undefined) {
      continue;
    }
    rendered.push(renderSafeMarkdownText(markdown.slice(cursor, matchIndex)));
    const language = match[1]?.trim().replace(/[^a-zA-Z0-9_-]/g, "") ?? "";
    const code = match[2] ?? "";
    const languageClass = language
      ? ` class="language-${escapeHtml(language)}"`
      : "";
    rendered.push(
      `<pre><code${languageClass}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`,
    );
    cursor = matchIndex + match[0].length;
  }
  rendered.push(renderSafeMarkdownText(markdown.slice(cursor)));
  return rendered.join("");
}

function renderSafeMarkdownText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map(renderMarkdownBlock)
    .join("");
}

function renderMarkdownBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) {
    return "";
  }
  const lines = trimmed.split("\n");
  if (isMarkdownTable(lines)) {
    return renderMarkdownTable(lines);
  }
  if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
    return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^\s*[-*+]\s+/, ""))}</li>`).join("")}</ul>`;
  }
  if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
    return `<ol>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
  }
  if (lines.every((line) => /^\s*>\s?/.test(line))) {
    return `<blockquote>${lines.map((line) => renderInlineMarkdown(line.replace(/^\s*>\s?/, ""))).join("<br />")}</blockquote>`;
  }
  if (lines.length === 1) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(lines[0] ?? "");
    if (heading) {
      const level = Math.min(6, Math.max(2, (heading[1]?.length ?? 1) + 1));
      return `<h${level}>${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`;
    }
  }
  return `<p>${lines.map(renderInlineMarkdown).join("<br />")}</p>`;
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
}

function isMarkdownTable(lines: string[]): boolean {
  if (lines.length < 2) {
    return false;
  }
  const separator = tableCells(lines[1] ?? "");
  return separator.length > 0
    && separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderMarkdownTable(lines: string[]): string {
  const headers = tableCells(lines[0] ?? "");
  const bodyRows = lines.slice(2).map(tableCells);
  return `<table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell.trim())}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index]?.trim() ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed ? trimmed.split("|") : [];
}

function structuredTextHtml(text: string): string {
  const parsed = parseJsonValue(text);
  if (parsed !== null) {
    return structuredValueHtml(parsed);
  }
  const fields = parseKeyValueLines(text);
  return fields === null
    ? structuredValueHtml(text)
    : structuredValueHtml(fields);
}

function parseKeyValueLines(value: string): Record<string, JsonValue> | null {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const fields: Record<string, JsonValue> = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    const key = line.slice(0, separator).trim();
    const fieldValue = line.slice(separator + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(fields, key)) {
      return null;
    }
    fields[key] = fieldValue;
  }
  return fields;
}

function structuredValueHtml(value: JsonValue): string {
  if (value === null) {
    return '<span class="value-empty">—</span>';
  }
  if (typeof value === "string") {
    const parsed = parseJsonValue(value);
    if (parsed !== null && parsed !== value) {
      return structuredValueHtml(parsed);
    }
    return value.includes("\n")
      ? `<pre><code>${escapeHtml(value)}</code></pre>`
      : `<code>${escapeHtml(value || "—")}</code>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<span>${escapeHtml(String(value))}</span>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="value-empty">—</span>';
    }
    return `<ol class="structured-list">${value.map((item) => `<li>${structuredValueHtml(item)}</li>`).join("")}</ol>`;
  }
  const fields = Object.entries(value);
  if (fields.length === 0) {
    return '<span class="value-empty">—</span>';
  }
  return `<dl class="structured-fields">${fields.map(([key, fieldValue]) => `<dt>${escapeHtml(key)}</dt><dd>${structuredValueHtml(fieldValue)}</dd>`).join("")}</dl>`;
}

function parseJsonValue(value: string): JsonValue | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))
    && !(trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object") {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function isRoutineStatus(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length === 1 && lines[0]?.startsWith("Status:") === true;
}

function readableEntryLabel(entry: TranscriptEntry, copy: HtmlExportCopy): string {
  if (entry.kind === "user") {
    return copy.user;
  }
  if (entry.kind === "subagent") {
    return entry.label === "Subagent" ? copy.subagent : entry.label;
  }
  if (entry.kind === "injection") {
    return entry.label === "Inserted message" ? copy.insertedMessage : entry.label;
  }
  if (entry.kind === "assistant") {
    return entry.label === "Assistant" ? copy.assistant : entry.label;
  }
  return entry.label;
}

function activeExportLocale(): string {
  return document.documentElement.lang || navigator.language || "en";
}

function htmlExportCopy(locale: string): HtmlExportCopy {
  if (locale.toLowerCase().startsWith("zh")) {
    return {
      assistant: "助手",
      completed: "已完成",
      conversation: "会话记录",
      empty: "此会话没有可导出的消息。",
      entries: "条会话消息",
      exportedAt: "导出于",
      failed: "失败",
      input: "输入",
      insertedMessage: "插入消息",
      output: "输出",
      round: "轮次",
      rounds: "轮",
      status: "状态",
      subagent: "子代理",
      thinking: "思考",
      tool: "工具",
      tools: "次工具调用",
      user: "用户",
    };
  }
  return {
    assistant: "Assistant",
    completed: "Completed",
    conversation: "Conversation transcript",
    empty: "This session has no messages to export.",
    entries: "conversation messages",
    exportedAt: "Exported",
    failed: "Failed",
    input: "Input",
    insertedMessage: "Inserted message",
    output: "Output",
    round: "Round",
    rounds: "rounds",
    status: "Status",
    subagent: "Subagent",
    thinking: "Thinking",
    tool: "Tool",
    tools: "tool calls",
    user: "User",
  };
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
    label: "Inserted message",
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
