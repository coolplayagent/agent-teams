import {
  type JsonValue,
  type SessionRound,
} from "../../api/contracts";
import {
  buildMessageTranscript,
  messagePresentationPartText,
  type MessageTranscript,
  type MessagePresentationPart,
  type MessagePresentationStatusPart,
  serializeMessageTranscript,
  type TranscriptEntry,
  type TranscriptEntryKind,
} from "../timeline/messagePresentation";

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
  active: string;
  assistant: string;
  asset: string;
  attempt: string;
  attachment: string;
  completed: string;
  conversation: string;
  diagnostic: string;
  empty: string;
  entries: string;
  error: string;
  errorMessage: string;
  exportedAt: string;
  failed: string;
  input: string;
  insertedMessage: string;
  mediaType: string;
  output: string;
  phase: string;
  pendingApprovals: string;
  pendingQuestions: string;
  reason: string;
  retry: string;
  retryDelay: string;
  round: string;
  rounds: string;
  status: string;
  stateLabels: Readonly<Record<string, string>>;
  subagent: string;
  targetProfile: string;
  thinking: string;
  tool: string;
  tools: string;
  totalAttempts: string;
  type: string;
  url: string;
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

  const copy = htmlExportCopy(activeExportLocale());
  const blobs = await buildMessagesPngBlobs(
    sessionId,
    transcriptPngBlocks(transcript.entries, copy),
  );
  blobs.forEach((blob, index) => {
    const suffix = blobs.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
    downloadBlob(`${messageExportFilenameBase(sessionId)}${suffix}.png`, blob);
  });
  return blobs.length;
}

function transcriptPngBlocks(
  entries: TranscriptEntry[],
  copy: HtmlExportCopy,
): ExportBlock[] {
  return entries.flatMap<ExportBlock>((entry): ExportBlock[] => {
    if (entry.kind === "status" && isRoutineStatusEntry(entry)) {
      return [];
    }
    if (entry.kind === "status") {
      return [{
        kind: entry.kind,
        label: statusEntryLabel(entry, copy),
        text: structuredValueText(statusEntryValue(entry, copy)),
      }];
    }
    if (entry.kind === "tool") {
      const tool = entry.metadata.tool;
      const sections = [
        tool?.args === undefined ? "" : `${copy.input}\n${structuredValueText(tool.args)}`,
        tool?.result === undefined ? "" : `${copy.output}\n${structuredValueText(tool.result)}`,
      ].filter(Boolean);
      return [{
        kind: entry.kind,
        label: `${copy.tool} · ${tool?.name || entry.label}`,
        text: sections.join("\n\n") || plainExportText(entry.text),
      }];
    }
    return [{
      kind: entry.kind,
      label: entry.kind === "thinking" ? copy.thinking : readableEntryLabel(entry, copy),
      text: entry.parts.map(messagePresentationPartText)
        .map(plainExportText)
        .filter(Boolean)
        .join("\n\n") || plainExportText(entry.text),
    }];
  });
}

function structuredValueText(value: JsonValue, indent = 0): string {
  if (value === null) {
    return "—";
  }
  if (typeof value === "string") {
    const parsed = parseJsonValue(value);
    return parsed !== null && parsed !== value
      ? structuredValueText(parsed, indent)
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      const rendered = structuredValueText(item, indent + 2);
      return `${prefix}- ${rendered.replace(/\n/g, `\n${prefix}  `)}`;
    }).join("\n");
  }
  return Object.entries(value).map(([key, fieldValue]) => {
    const rendered = structuredValueText(fieldValue, indent + 2);
    return rendered.includes("\n")
      ? `${prefix}${key}:\n${rendered}`
      : `${prefix}${key}: ${rendered}`;
  }).join("\n");
}

function plainExportText(value: string): string {
  return value
    .replace(/^```[^\n]*\n?|```$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
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
  const toolCount = transcript.entries.filter((entry) => entry.kind === "tool").length;
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
    figure.media { margin: 10px 0; }
    figure.media img { display: block; width: auto; max-width: min(100%, 720px); max-height: 520px; border: 1px solid var(--line); border-radius: 9px; object-fit: contain; }
    figure.media figcaption { margin-top: 5px; color: var(--muted); font-size: 12px; }
    p.media a { color: var(--accent); overflow-wrap: anywhere; }
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
  const meta = [
    round.createdAt ? formatExportTime(round.createdAt) : "",
    [round.status, round.phase]
      .filter((value): value is string => Boolean(value))
      .map((value) => localizedStateValue(value, copy))
      .join(" / "),
  ]
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
    if (isRoutineStatusEntry(entry)) {
      return "";
    }
    return `<details class="technical status-entry" data-actor="unknown" data-kind="status" data-sequence="${entry.sequence}">
      <summary><span class="entry-label">${escapeHtml(statusEntryLabel(entry, copy))}</span><time>${escapeHtml(time)}</time></summary>
      <div class="technical-body">${structuredValueHtml(statusEntryValue(entry, copy))}</div>
    </details>`;
  }
  const content = entry.kind === "question"
    ? structuredTextHtml(entry.text)
    : presentationPartsHtml(entry.parts, entry.text, copy);
  return `<article class="entry" data-actor="${escapeHtml(entry.metadata.actor)}" data-kind="${entry.kind}" data-sequence="${entry.sequence}">
    <header class="entry-head">
      <span class="entry-label">${escapeHtml(readableEntryLabel(entry, copy))}</span>
      <time>${escapeHtml(time)}</time>
    </header>
    <div class="content">${content}</div>
  </article>`;
}

function presentationPartsHtml(
  parts: MessagePresentationPart[],
  fallbackText: string,
  copy: HtmlExportCopy,
): string {
  const rendered = parts.flatMap((part) => {
    if (part.kind === "text") {
      return [part.markdown ? renderSafeMarkdown(part.text) : structuredTextHtml(part.text)];
    }
    if (part.kind === "media") {
      return [mediaPartHtml(part, copy)];
    }
    if (part.kind === "thinking") {
      return [renderSafeMarkdown(part.text)];
    }
    return [];
  }).join("");
  return rendered || renderSafeMarkdown(fallbackText);
}

function mediaPartHtml(
  part: Extract<MessagePresentationPart, { kind: "media" }>,
  copy: HtmlExportCopy,
): string {
  const label = part.name || part.modality || copy.attachment;
  const description = messagePresentationPartText(part);
  const safeUrl = safeMediaUrl(part.url, part.mimeType);
  if (safeUrl && (part.modality === "image" || part.mimeType.startsWith("image/"))) {
    return `<figure class="media"><img alt="${escapeHtml(label)}" loading="lazy" src="${escapeHtml(safeUrl)}" /><figcaption>${escapeHtml(label)}</figcaption></figure>`;
  }
  if (safeUrl) {
    return `<p class="media"><a href="${escapeHtml(safeUrl)}" rel="noreferrer">${escapeHtml(label)}</a></p>`;
  }
  return structuredValueHtml({
    [copy.attachment]: description,
    ...(part.mimeType ? { [copy.mediaType]: part.mimeType } : {}),
    ...(part.assetId ? { [copy.asset]: part.assetId } : {}),
    ...(part.url ? { [copy.url]: part.url } : {}),
  });
}

function safeMediaUrl(url: string, mimeType: string): string {
  const trimmed = url.trim();
  if (/^(?:https?:|blob:|file:)/i.test(trimmed)) {
    return trimmed;
  }
  const dataMatch = /^data:([^;,]+)(?:;base64)?,/i.exec(trimmed);
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

function toolEntryHtml(
  entry: TranscriptEntry,
  resultEntry: TranscriptEntry | undefined,
  copy: HtmlExportCopy,
): string {
  const call = entry.metadata.tool?.stage === "call" ? entry : undefined;
  const result = resultEntry ?? (entry.metadata.tool?.stage !== "call" ? entry : undefined);
  const metadata = call?.metadata.tool ?? result?.metadata.tool;
  const isError = result?.metadata.tool?.isError === true;
  const time = call?.createdAt ?? result?.createdAt;
  const formattedTime = time ? formatExportTime(time) : "";
  const input = metadata?.args;
  const output = metadata?.result;
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

function statusPart(entry: TranscriptEntry): MessagePresentationStatusPart | null {
  return entry.parts.find(
    (part): part is MessagePresentationStatusPart => part.kind === "status",
  ) ?? null;
}

function isRoutineStatusEntry(entry: TranscriptEntry): boolean {
  const part = statusPart(entry);
  return part !== null
    && part.retryEvent === undefined
    && part.diagnostic === undefined
    && part.errorCode === undefined
    && part.pendingApprovals === undefined
    && part.pendingQuestions === undefined
    && (part.status !== undefined || part.phase !== undefined);
}

function statusEntryLabel(entry: TranscriptEntry, copy: HtmlExportCopy): string {
  const retryIndex = statusPart(entry)?.retryIndex;
  return retryIndex === undefined
    ? entry.label || copy.status
    : `${copy.retry} ${retryIndex + 1}`;
}

function statusEntryValue(entry: TranscriptEntry, copy: HtmlExportCopy): JsonValue {
  const part = statusPart(entry);
  if (part === null) {
    return entry.text;
  }
  if (part.retryEvent !== undefined) {
    return localizedStatusEvent(part.retryEvent, copy);
  }
  const value: Record<string, JsonValue> = {};
  const status = [part.status, part.phase]
    .filter((item): item is string => Boolean(item))
    .map((item) => localizedStateValue(item, copy))
    .join(" / ");
  if (status.length > 0) {
    value[copy.status] = status;
  }
  if (part.errorCode !== undefined) {
    value[copy.error] = part.errorCode;
  }
  if (part.diagnostic !== undefined) {
    value[copy.diagnostic] = part.diagnostic;
  }
  if (part.pendingApprovals !== undefined) {
    value[copy.pendingApprovals] = part.pendingApprovals;
  }
  if (part.pendingQuestions !== undefined) {
    value[copy.pendingQuestions] = part.pendingQuestions;
  }
  return value;
}

function localizedStatusEvent(
  value: JsonValue,
  copy: HtmlExportCopy,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => localizedStatusEvent(item, copy));
  }
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" ? localizedStateValue(value, copy) : value;
  }
  const fieldLabels: Readonly<Record<string, string>> = {
    attempt_number: copy.attempt,
    diagnostic: copy.diagnostic,
    error_code: copy.error,
    error_message: copy.errorMessage,
    is_active: copy.active,
    kind: copy.type,
    pending_approvals: copy.pendingApprovals,
    pending_questions: copy.pendingQuestions,
    phase: copy.phase,
    reason: copy.reason,
    retry_in_ms: copy.retryDelay,
    status: copy.status,
    to_profile_id: copy.targetProfile,
    total_attempts: copy.totalAttempts,
  };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    fieldLabels[key] ?? key,
    localizedStatusEvent(item, copy),
  ]));
}

function localizedStateValue(value: string, copy: HtmlExportCopy): string {
  const normalized = value.trim().toLowerCase();
  return copy.stateLabels[normalized] ?? value;
}

function readableEntryLabel(entry: TranscriptEntry, copy: HtmlExportCopy): string {
  if (entry.kind === "user") {
    return copy.user;
  }
  if (entry.kind === "subagent") {
    return entry.label || copy.subagent;
  }
  if (entry.kind === "injection") {
    if (entry.label) {
      return entry.label;
    }
    return entry.metadata.actor === "subagent"
      ? `${copy.subagent} · ${copy.insertedMessage}`
      : copy.insertedMessage;
  }
  if (entry.kind === "assistant") {
    return entry.label || copy.assistant;
  }
  return entry.label || copy.status;
}

function activeExportLocale(): string {
  return document.documentElement.lang || navigator.language || "en";
}

function htmlExportCopy(locale: string): HtmlExportCopy {
  if (locale.toLowerCase().startsWith("zh")) {
    return {
      active: "生效中",
      assistant: "助手",
      asset: "资源标识",
      attempt: "当前次数",
      attachment: "附件",
      completed: "已完成",
      conversation: "会话记录",
      diagnostic: "诊断信息",
      empty: "此会话没有可导出的消息。",
      entries: "条会话消息",
      error: "错误",
      errorMessage: "错误信息",
      exportedAt: "导出于",
      failed: "失败",
      input: "输入",
      insertedMessage: "插入消息",
      mediaType: "媒体类型",
      output: "输出",
      phase: "阶段",
      pendingApprovals: "待审批",
      pendingQuestions: "待回答问题",
      reason: "原因",
      retry: "重试",
      retryDelay: "重试延迟（毫秒）",
      round: "轮次",
      rounds: "轮",
      status: "状态",
      stateLabels: {
        completed: "已完成",
        connecting: "连接中",
        failed: "失败",
        paused: "已暂停",
        queued: "排队中",
        retry: "重试",
        running: "运行中",
        scheduled: "已计划",
        stopped: "已停止",
        stopping: "停止中",
        waiting: "等待中",
      },
      subagent: "子代理",
      targetProfile: "目标配置",
      thinking: "思考",
      tool: "工具",
      tools: "次工具调用",
      totalAttempts: "总次数",
      type: "类型",
      url: "地址",
      user: "用户",
    };
  }
  return {
    active: "Active",
    assistant: "Assistant",
    asset: "Asset",
    attempt: "Attempt",
    attachment: "Attachment",
    completed: "Completed",
    conversation: "Conversation transcript",
    diagnostic: "Diagnostic",
    empty: "This session has no messages to export.",
    entries: "conversation messages",
    error: "Error",
    errorMessage: "Error message",
    exportedAt: "Exported",
    failed: "Failed",
    input: "Input",
    insertedMessage: "Inserted message",
    mediaType: "Media type",
    output: "Output",
    phase: "Phase",
    pendingApprovals: "Pending approvals",
    pendingQuestions: "Pending questions",
    reason: "Reason",
    retry: "Retry",
    retryDelay: "Retry delay (ms)",
    round: "Round",
    rounds: "rounds",
    status: "Status",
    stateLabels: {
      completed: "Completed",
      connecting: "Connecting",
      failed: "Failed",
      paused: "Paused",
      queued: "Queued",
      retry: "Retry",
      running: "Running",
      scheduled: "Scheduled",
      stopped: "Stopped",
      stopping: "Stopping",
      waiting: "Waiting",
    },
    subagent: "Subagent",
    targetProfile: "Target profile",
    thinking: "Thinking",
    tool: "Tool",
    tools: "tool calls",
    totalAttempts: "Total attempts",
    type: "Type",
    url: "URL",
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
