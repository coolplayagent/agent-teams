import type { Language } from "../../runtime/uiStore";
import { translate, type Translate } from "../../i18n";
import {
  type MessageTranscript,
  messagePresentationPartText,
  type TranscriptEntry,
  type TranscriptRound,
} from "./messagePresentation";
import {
  MessagePresentationView,
  messagePresentationStatusIsRoutine,
  type MessagePresentationLabels,
} from "./MessagePresentationView";

export interface MessageTranscriptDocumentProps {
  locale: string;
  transcript: MessageTranscript;
}

export interface MessageTranscriptExportBlock {
  kind?: string;
  label: string;
  text: string;
}

export function messageTranscriptExportBlocks(
  transcript: MessageTranscript,
  locale: string,
): MessageTranscriptExportBlock[] {
  const copy = messageTranscriptCopy(locale);
  return transcript.rounds.flatMap((round) =>
    transcriptDisplayEntries(round.entries).flatMap((display) => {
      const parts = display.parts.length > 0
        ? display.parts
        : [{ kind: "text" as const, markdown: true, text: display.entry.text }];
      const text = parts
        .map(messagePresentationPartText)
        .filter((value) => value.trim().length > 0)
        .join("\n\n")
        .trim();
      return text.length === 0 ? [] : [{
        kind: display.entry.kind,
        label: transcriptEntryLabel(display.entry, copy),
        text,
      }];
    }),
  );
}

export function MessageTranscriptDocument({
  locale,
  transcript,
}: MessageTranscriptDocumentProps) {
  const copy = messageTranscriptCopy(locale);
  const language: Language = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  const t: Translate = (key, replacements) => translate(language, key, replacements);
  const toolCount = transcript.entries.filter((entry) => entry.kind === "tool").length;
  const conversationEntryCount = transcript.entries.filter((entry) =>
    ["assistant", "injection", "subagent", "user"].includes(entry.kind)
  ).length;
  return (
    <main className="at-message-transcript-document">
      <header className="at-message-transcript-header">
        <p className="at-message-transcript-eyebrow">{copy.conversation}</p>
        <h1>{transcript.sessionId}</h1>
        <div className="at-message-transcript-metrics" aria-label={copy.status}>
          <span><strong>{transcript.rounds.length}</strong> {copy.rounds}</span>
          <span><strong>{conversationEntryCount}</strong> {copy.entries}</span>
          <span><strong>{toolCount}</strong> {copy.tools}</span>
          <span>{copy.exportedAt} {formatTranscriptTime(transcript.exportedAt)}</span>
        </div>
      </header>
      {transcript.rounds.length === 0 ? (
        <p className="at-message-transcript-empty">{copy.empty}</p>
      ) : transcript.rounds.map((round) => (
        <MessageTranscriptRound
          copy={copy}
          key={round.runId}
          round={round}
          t={t}
        />
      ))}
    </main>
  );
}

function MessageTranscriptRound({
  copy,
  round,
  t,
}: {
  copy: MessageTranscriptCopy;
  round: TranscriptRound;
  t: Translate;
}) {
  const meta = [
    round.createdAt ? formatTranscriptTime(round.createdAt) : "",
    [round.status, round.phase].filter(Boolean).join(" / "),
  ].filter(Boolean).join(" · ");
  return (
    <section
      className="at-message-transcript-round"
      data-run-id={round.runId}
      id={`round-${round.index + 1}`}
    >
      <header className="at-message-transcript-round-header">
        <h2>{copy.round} {round.index + 1}</h2>
        <span>{meta}</span>
      </header>
      {transcriptDisplayEntries(round.entries).map((display) => (
        <MessageTranscriptEntry
          copy={copy}
          display={display}
          key={`${display.entry.id}:${display.entry.sequence}`}
          t={t}
        />
      ))}
    </section>
  );
}

interface TranscriptDisplayEntry {
  entry: TranscriptEntry;
  parts: TranscriptEntry["parts"];
}

function transcriptDisplayEntries(entries: TranscriptEntry[]): TranscriptDisplayEntry[] {
  const display: TranscriptDisplayEntry[] = [];
  const pendingToolCalls = new Map<string, number>();
  for (const entry of entries) {
    if (entry === undefined || transcriptEntryIsRoutineStatus(entry)) {
      continue;
    }
    const tool = entry.kind === "tool" ? entry.metadata.tool : undefined;
    const callId = tool?.callId?.trim() ?? "";
    if (tool !== undefined && tool.stage !== "call" && callId.length > 0) {
      const callIndex = pendingToolCalls.get(callId);
      const pendingCall = callIndex === undefined ? undefined : display[callIndex];
      if (pendingCall !== undefined) {
        pendingCall.parts = [...pendingCall.parts, ...entry.parts];
        pendingToolCalls.delete(callId);
        continue;
      }
    }
    display.push({
      entry,
      parts: entry.parts,
    });
    if (tool?.stage === "call" && callId.length > 0) {
      pendingToolCalls.set(callId, display.length - 1);
    }
  }
  return display;
}

function MessageTranscriptEntry({
  copy,
  display,
  t,
}: {
  copy: MessageTranscriptCopy;
  display: TranscriptDisplayEntry;
  t: Translate;
}) {
  const { entry, parts } = display;
  const visibleParts = parts.length > 0
    ? parts
    : [{ kind: "text" as const, markdown: true, text: entry.text }];
  return (
    <article
      className="at-message-transcript-entry at-message"
      data-actor={entry.metadata.actor}
      data-export-block={entry.kind}
      data-kind={entry.kind}
      data-sequence={entry.sequence}
    >
      <header className="at-message-transcript-entry-header">
        <span className="at-message-transcript-entry-label">
          {transcriptEntryLabel(entry, copy)}
        </span>
        <time>{entry.createdAt ? formatTranscriptTime(entry.createdAt) : ""}</time>
      </header>
      <MessagePresentationView
        disclosurePrefix={`entry:${entry.sequence}`}
        interactive={false}
        labels={copy}
        parts={visibleParts}
        t={t}
      />
    </article>
  );
}

function transcriptEntryIsRoutineStatus(entry: TranscriptEntry): boolean {
  if (entry.kind !== "status") {
    return false;
  }
  const status = entry.parts.find((part) => part.kind === "status");
  return status !== undefined && messagePresentationStatusIsRoutine(status);
}

function transcriptEntryLabel(
  entry: TranscriptEntry,
  copy: MessageTranscriptCopy,
): string {
  if (entry.kind === "user") return copy.user;
  if (entry.kind === "thinking") return copy.timelineThinking;
  if (entry.kind === "tool") return copy.timelineCall;
  if (entry.kind === "subagent") return entry.label || copy.subagent;
  if (entry.kind === "injection") {
    return entry.label || (entry.metadata.actor === "subagent"
      ? `${copy.subagent} · ${copy.insertedMessage}`
      : copy.insertedMessage);
  }
  if (entry.kind === "assistant") return entry.label || copy.assistant;
  return entry.label || copy.status;
}

interface MessageTranscriptCopy extends MessagePresentationLabels {
  assistant: string;
  conversation: string;
  empty: string;
  entries: string;
  exportedAt: string;
  insertedMessage: string;
  round: string;
  rounds: string;
  subagent: string;
  tools: string;
  user: string;
}

export function messageTranscriptCopy(locale: string): MessageTranscriptCopy {
  const language: Language = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  const value = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return {
    assistant: value("exportTranscriptAssistant"),
    attachment: value("exportTranscriptAttachment"),
    conversation: value("exportTranscriptConversation"),
    empty: value("exportTranscriptEmpty"),
    entries: value("exportTranscriptEntries"),
    error: value("timelineToolError"),
    exportedAt: value("exportTranscriptExportedAt"),
    insertedMessage: value("exportTranscriptInsertedMessage"),
    mediaType: value("exportTranscriptMediaType"),
    retry: value("exportTranscriptRetry"),
    round: value("exportTranscriptRound"),
    rounds: value("exportTranscriptRounds"),
    status: value("exportTranscriptStatus"),
    subagent: value("exportTranscriptSubagent"),
    timelineCall: value("exportTranscriptToolCall"),
    timelineCompleted: value("timelineToolCompletedGeneric"),
    timelineInput: value("timelineToolInput"),
    timelineOutput: value("timelineToolOutput"),
    timelineThinking: value("timelineThinking"),
    timelineValidation: value("timelineToolValidation"),
    tools: value("exportTranscriptTools"),
    url: "URL",
    user: value("exportTranscriptUser"),
  };
}

function formatTranscriptTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}
