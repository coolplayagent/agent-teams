import { App, Button, Empty, Image, Skeleton, Tooltip, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Wrench } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { listSessionMessages, listSessionRounds } from "../../api/client";
import {
  contentPartText,
  type ContentPart,
  type JsonValue,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundsPage,
  type TimelineMessage,
} from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import type { TimelineEntry } from "../../runtime/reducers";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import { MarkdownMessage } from "./MarkdownMessage";
import { RoundRail } from "./RoundRail";

const TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX = 96;
const ROUND_RAIL_PAGE_LIMIT = 100;
const ROUND_RAIL_MAX_PAGES = 10;

interface MessageTimelineProps {
  sessionId: string | null;
}

export function MessageTimeline({ sessionId }: MessageTimelineProps) {
  const { message } = App.useApp();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const pendingRoundRunIdRef = useRef<string | null>(null);
  const scrollSessionIdRef = useRef<string | null>(sessionId);
  const scrollSnapshotRef = useRef<TimelineScrollSnapshot | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const messagesQuery = useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: () => listSessionMessages(sessionId ?? ""),
    enabled: sessionId !== null,
  });
  const roundsQuery = useQuery({
    queryKey: ["sessions", sessionId, "rounds", "rail"],
    queryFn: () => collectRoundRailRounds(sessionId ?? ""),
    enabled: sessionId !== null && !messagesQuery.isLoading && !messagesQuery.isError,
    staleTime: 10000,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const rounds = useMemo(
    () => roundsQuery.data ?? [],
    [roundsQuery.data],
  );
  const messageRoundLookup = useMemo(
    () => createMessageRoundLookup(rounds),
    [rounds],
  );
  const runtimeEntries = useMemo(
    () =>
      Object.values(runtimeState.runs)
        .flatMap((runState) => runState.entries)
        .filter((entry) => entry.sessionId === sessionId),
    [runtimeState, sessionId],
  );
  const runtimeRows = useMemo(
    () => runtimeEntriesToRows(runtimeEntries),
    [runtimeEntries],
  );
  const rows = useMemo(
    () => [
      ...messages.map((messageItem, index) =>
        messageToRow(messageItem, index, messageRoundLookup),
      ),
      ...runtimeRows,
    ],
    [messageRoundLookup, messages, runtimeRows],
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
  const activeRoundRunId = activeRunId ?? latestRowRunId(rows) ?? latestRoundRunId(rounds);
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
  const handleTimelineScroll = useCallback(() => {
    const container = parentRef.current;
    if (container !== null) {
      scrollSnapshotRef.current = captureTimelineScrollSnapshot(container);
      syncActiveRunIdFromViewport(container, pendingRoundRunIdRef, setActiveRunId);
    }
  }, []);
  const handleRoundSelect = useCallback((runId: string) => {
    pendingRoundRunIdRef.current = runId;
    setActiveRunId(runId);
    const rowIndex = rows.findIndex((row) => row.runId === runId);
    if (rowIndex >= 0) {
      virtualizer.scrollToIndex(rowIndex, { align: "start" });
    }
  }, [rows, virtualizer]);

  useEffect(() => {
    pendingRoundRunIdRef.current = null;
    setActiveRunId(null);
  }, [sessionId]);

  useLayoutEffect(() => {
    if (scrollSessionIdRef.current !== sessionId) {
      scrollSessionIdRef.current = sessionId;
      scrollSnapshotRef.current = null;
    }
    const container = parentRef.current;
    if (container === null) {
      return;
    }
    const snapshot = scrollSnapshotRef.current;
    if (snapshot === null) {
      scrollTimelineToBottom(container);
    } else {
      applyTimelineScrollSnapshot(container, snapshot);
    }
    scrollSnapshotRef.current = captureTimelineScrollSnapshot(container);
    syncActiveRunIdFromViewport(container, pendingRoundRunIdRef, setActiveRunId);
  }, [rows, sessionId, timelineHeight]);

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
    <div className="at-timeline-frame">
      <div className="at-timeline" onScroll={handleTimelineScroll} ref={parentRef}>
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
                data-index={virtualItem.index}
                data-row-key={row.key}
                data-run-id={row.runId ?? undefined}
                key={row.key}
                ref={virtualizer.measureElement}
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
      <RoundRail
        activeRunId={activeRoundRunId}
        error={roundsQuery.isError}
        loading={roundsQuery.isLoading}
        onSelectRun={handleRoundSelect}
        rounds={rounds}
      />
    </div>
  );
}

interface TimelineRow {
  key: string;
  role: string;
  text: string;
  kind: RunEventType | "message";
  parts: TimelineRenderPart[];
  runId: string | null;
  source: "message" | "runtime";
  copyable: boolean;
}

type TimelineRenderPart =
  | TimelineTextPart
  | TimelineMediaPart
  | TimelineThinkingPart
  | TimelineToolPart;

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
  action: string;
  body: string;
  callId: string;
  error: boolean;
  kind: "tool";
  phase:
    | "approval-requested"
    | "approval-resolved"
    | "call"
    | "result"
    | "validation";
  toolName: string;
}

interface TimelineThinkingPart {
  kind: "thinking";
  partIndex: string;
  streaming: boolean;
  text: string;
}

interface FallbackVirtualItem {
  index: number;
  start: number;
}

interface RuntimeThinkingAccumulator {
  inserted: boolean;
  part: TimelineThinkingPart;
  row: TimelineRow;
}

interface RuntimeTextAccumulator {
  part: TimelineTextPart;
  row: TimelineRow;
}

interface TimelineScrollAnchor {
  offset: number;
  rowKey: string;
}

interface TimelineScrollSnapshot {
  anchor: TimelineScrollAnchor | null;
  scrollTop: number;
  shouldFollow: boolean;
}

interface MessageRoundLookup {
  boundaries: RoundBoundary[];
  runIdByCreatedAt: Map<number, string>;
  runIdByMessageId: Map<string, string>;
}

interface RoundBoundary {
  createdAtMs: number;
  runId: string;
}

function captureTimelineScrollSnapshot(
  container: HTMLElement,
): TimelineScrollSnapshot {
  const scrollTop = scrollMetric(container.scrollTop);
  const shouldFollow = isTimelineNearBottom(container);
  return {
    anchor: shouldFollow ? null : captureTimelineScrollAnchor(container, scrollTop),
    scrollTop,
    shouldFollow,
  };
}

function applyTimelineScrollSnapshot(
  container: HTMLElement,
  snapshot: TimelineScrollSnapshot,
): void {
  if (snapshot.shouldFollow) {
    scrollTimelineToBottom(container);
    return;
  }
  const anchoredScrollTop = timelineAnchorScrollTop(container, snapshot);
  container.scrollTop = clampScrollTop(container, anchoredScrollTop);
}

function captureTimelineScrollAnchor(
  container: HTMLElement,
  scrollTop: number,
): TimelineScrollAnchor | null {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>("article.at-message[data-row-key]"),
  );
  for (const row of rows) {
    const rowKey = row.dataset.rowKey;
    if (rowKey === undefined) {
      continue;
    }
    const rowTop = timelineRowTop(row);
    const rowBottom = rowTop + timelineRowHeight(row);
    if (rowBottom >= scrollTop) {
      return {
        offset: scrollTop - rowTop,
        rowKey,
      };
    }
  }
  return null;
}

function timelineAnchorScrollTop(
  container: HTMLElement,
  snapshot: TimelineScrollSnapshot,
): number {
  if (snapshot.anchor === null) {
    return snapshot.scrollTop;
  }
  const row = findTimelineAnchorRow(container, snapshot.anchor.rowKey);
  if (row === null) {
    return snapshot.scrollTop;
  }
  return timelineRowTop(row) + snapshot.anchor.offset;
}

function findTimelineAnchorRow(
  container: HTMLElement,
  rowKey: string,
): HTMLElement | null {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>("article.at-message[data-row-key]"),
  );
  return rows.find((row) => row.dataset.rowKey === rowKey) ?? null;
}

function scrollTimelineToBottom(container: HTMLElement): void {
  container.scrollTop = timelineMaxScrollTop(container);
}

function isTimelineNearBottom(container: HTMLElement): boolean {
  return timelineMaxScrollTop(container) - scrollMetric(container.scrollTop)
    <= TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX;
}

function clampScrollTop(container: HTMLElement, scrollTop: number): number {
  return Math.min(
    timelineMaxScrollTop(container),
    Math.max(0, scrollMetric(scrollTop)),
  );
}

function timelineMaxScrollTop(container: HTMLElement): number {
  return Math.max(
    0,
    scrollMetric(container.scrollHeight) - scrollMetric(container.clientHeight),
  );
}

function timelineRowTop(row: HTMLElement): number {
  const virtualHost = row.closest(".at-timeline-virtual");
  const hostTop = virtualHost instanceof HTMLElement
    ? scrollMetric(virtualHost.offsetTop)
    : 0;
  return hostTop + translateY(row.style.transform);
}

function timelineRowHeight(row: HTMLElement): number {
  const offsetHeight = scrollMetric(row.offsetHeight);
  if (offsetHeight > 0) {
    return offsetHeight;
  }
  return scrollMetric(row.getBoundingClientRect().height);
}

function translateY(transform: string): number {
  const match = transform.match(/translateY\(([-\d.]+)px\)/);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

function scrollMetric(value: number): number {
  return Number.isFinite(value) ? value : 0;
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

function messageToRow(
  message: TimelineMessage,
  index: number,
  roundLookup: MessageRoundLookup,
): TimelineRow {
  const role = message.role_id ?? message.role ?? "agent";
  const parts = messageParts(message);
  const text = rowCopyText(parts);
  return {
    key: `message:${message.message_id ?? index}`,
    role,
    text,
    kind: "message",
    parts,
    runId: messageRunId(message, roundLookup),
    source: "message",
    copyable: isAnswerRole(role) && text.trim().length > 0,
  };
}

function runtimeEntriesToRows(entries: TimelineEntry[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const activeThinking = new Map<string, RuntimeThinkingAccumulator>();
  const activeText = new Map<string, RuntimeTextAccumulator>();
  let textSegmentSequence = 0;
  const nextTextSegmentSequence = () => {
    const sequence = textSegmentSequence;
    textSegmentSequence += 1;
    return sequence;
  };
  for (const entry of entries) {
    if (entry.kind === "text_delta") {
      if (
        applyRuntimeTextDeltaEvent(
          entry,
          rows,
          activeText,
          nextTextSegmentSequence,
        )
      ) {
        continue;
      }
      closeRuntimeTextSegment(entry, activeText);
      rows.push(runtimeEntryToRow(entry));
      continue;
    }
    if (entry.kind === "output_delta") {
      if (
        applyRuntimeOutputDeltaEvent(
          entry,
          rows,
          activeText,
          nextTextSegmentSequence,
        )
      ) {
        continue;
      }
      closeRuntimeTextSegment(entry, activeText);
      rows.push(runtimeEntryToRow(entry));
      continue;
    }
    if (isThinkingEvent(entry.kind)) {
      closeRuntimeTextSegment(entry, activeText);
      if (!applyRuntimeThinkingEvent(entry, rows, activeThinking)) {
        rows.push(runtimeEntryToRow(entry));
      }
      continue;
    }
    if (entryClosesThinking(entry.kind)) {
      closeActiveThinkingForRun(entry.runId, activeThinking);
    }
    closeRuntimeTextSegment(entry, activeText);
    rows.push(runtimeEntryToRow(entry));
  }
  return rows;
}

function runtimeEntryToRow(entry: TimelineEntry): TimelineRow {
  const parts = runtimeEntryParts(entry);
  return runtimeEntryToRowWithParts(entry, parts, `runtime:${entry.id}`);
}

function runtimeEntryToRowWithParts(
  entry: TimelineEntry,
  parts: TimelineRenderPart[],
  key: string,
): TimelineRow {
  const text = rowCopyText(parts);
  return {
    key,
    role: entry.roleId,
    text: text || entry.text,
    kind: entry.kind,
    parts,
    runId: entry.runId,
    source: "runtime",
    copyable: false,
  };
}

async function collectRoundRailRounds(sessionId: string): Promise<SessionRound[]> {
  const rounds: SessionRound[] = [];
  let cursorRunId: string | null = null;
  for (let pageIndex = 0; pageIndex < ROUND_RAIL_MAX_PAGES; pageIndex += 1) {
    const page: SessionRoundsPage = await listSessionRounds(sessionId, {
      cursorRunId,
      limit: ROUND_RAIL_PAGE_LIMIT,
    });
    rounds.push(...page.items);
    if (page.has_more !== true || page.next_cursor === null || page.next_cursor === undefined) {
      break;
    }
    cursorRunId = page.next_cursor;
  }
  return sortRoundsAscending(uniqueRoundsByRunId(rounds));
}

function uniqueRoundsByRunId(rounds: SessionRound[]): SessionRound[] {
  const byRunId = new Map<string, SessionRound>();
  for (const round of rounds) {
    const runId = round.run_id.trim();
    if (runId.length > 0) {
      byRunId.set(runId, round);
    }
  }
  return Array.from(byRunId.values());
}

function sortRoundsAscending(rounds: SessionRound[]): SessionRound[] {
  return [...rounds].sort((left, right) =>
    roundSortKey(left).localeCompare(roundSortKey(right)),
  );
}

function roundSortKey(round: SessionRound): string {
  return round.created_at?.trim() || round.run_id;
}

function latestRowRunId(rows: TimelineRow[]): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const runId = rows[index]?.runId;
    if (runId !== undefined && runId !== null && runId.trim().length > 0) {
      return runId;
    }
  }
  return null;
}

function latestRoundRunId(rounds: SessionRound[]): string | null {
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const runId = rounds[index]?.run_id;
    if (runId !== undefined && runId.trim().length > 0) {
      return runId;
    }
  }
  return null;
}

function visibleRunIdFromRenderedRows(container: HTMLElement): string | null {
  const containerTop = container.getBoundingClientRect().top;
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>("article.at-message[data-run-id]"),
  );
  for (const row of rows) {
    const runId = row.dataset.runId;
    if (runId === undefined || runId.trim().length === 0) {
      continue;
    }
    const rowRect = row.getBoundingClientRect();
    if (rowRect.bottom >= containerTop + 32) {
      return runId;
    }
  }
  return null;
}

function syncActiveRunIdFromViewport(
  container: HTMLElement,
  pendingRoundRunIdRef: { current: string | null },
  setActiveRunId: (runId: string) => void,
): void {
  const visibleRunId = visibleRunIdFromRenderedRows(container);
  if (visibleRunId === null) {
    return;
  }
  const pendingRunId = pendingRoundRunIdRef.current;
  if (pendingRunId !== null && visibleRunId !== pendingRunId) {
    return;
  }
  pendingRoundRunIdRef.current = null;
  setActiveRunId(visibleRunId);
}

function createMessageRoundLookup(rounds: SessionRound[]): MessageRoundLookup {
  const runIdByMessageId = new Map<string, string>();
  const runIdByCreatedAt = new Map<number, string>();
  const boundaries: RoundBoundary[] = [];

  for (const round of rounds) {
    const runId = round.run_id.trim();
    if (runId.length === 0) {
      continue;
    }
    const roundCreatedAt = timestampMs(round.created_at);
    if (roundCreatedAt !== null) {
      boundaries.push({ createdAtMs: roundCreatedAt, runId });
    }
    for (const message of roundMessages(round)) {
      const messageId = message.message_id?.trim();
      if (messageId !== undefined && messageId.length > 0) {
        runIdByMessageId.set(messageId, runId);
      }
      const createdAt = timestampMs(message.created_at);
      if (createdAt !== null) {
        runIdByCreatedAt.set(createdAt, runId);
      }
    }
  }

  return {
    boundaries: boundaries.sort((left, right) => left.createdAtMs - right.createdAtMs),
    runIdByCreatedAt,
    runIdByMessageId,
  };
}

function roundMessages(round: SessionRound): SessionRoundMessage[] {
  return [
    ...(round.coordinator_messages ?? []),
    ...(round.injection_messages ?? []),
  ];
}

function messageRunId(
  message: TimelineMessage,
  roundLookup: MessageRoundLookup,
): string | null {
  const explicitRunId = message.run_id?.trim();
  if (explicitRunId !== undefined && explicitRunId.length > 0) {
    return explicitRunId;
  }
  const messageId = message.message_id?.trim();
  if (messageId !== undefined && messageId.length > 0) {
    const runId = roundLookup.runIdByMessageId.get(messageId);
    if (runId !== undefined) {
      return runId;
    }
  }
  const createdAt = timestampMs(message.created_at);
  if (createdAt !== null) {
    const exactRunId = roundLookup.runIdByCreatedAt.get(createdAt);
    if (exactRunId !== undefined) {
      return exactRunId;
    }
    return runIdForTimestamp(createdAt, roundLookup.boundaries);
  }
  return null;
}

function runIdForTimestamp(
  createdAtMs: number,
  boundaries: RoundBoundary[],
): string | null {
  let matchedRunId: string | null = null;
  for (const boundary of boundaries) {
    if (boundary.createdAtMs > createdAtMs) {
      break;
    }
    matchedRunId = boundary.runId;
  }
  return matchedRunId;
}

function timestampMs(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function applyRuntimeTextDeltaEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  nextTextSegmentSequence: () => number,
): boolean {
  const text = runtimeTextDeltaText(entry);
  return appendRuntimeTextSegment(
    entry,
    text,
    rows,
    activeText,
    nextTextSegmentSequence,
  );
}

function applyRuntimeOutputDeltaEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  nextTextSegmentSequence: () => number,
): boolean {
  const parts = runtimeOutputParts(entry);
  if (parts === null || parts.length === 0) {
    return false;
  }
  let rendered = false;
  let structuredParts: TimelineRenderPart[] = [];
  let structuredRowSequence = 0;

  const flushStructuredParts = () => {
    if (structuredParts.length === 0) {
      return;
    }
    rows.push(runtimeEntryToRowWithParts(
      entry,
      structuredParts,
      `runtime-output:${entry.id}:${structuredRowSequence}`,
    ));
    structuredParts = [];
    structuredRowSequence += 1;
  };

  for (const part of parts) {
    if (part.kind === "text") {
      flushStructuredParts();
      if (
        appendRuntimeTextSegment(
          entry,
          part.text,
          rows,
          activeText,
          nextTextSegmentSequence,
        )
      ) {
        rendered = true;
      }
      continue;
    }
    closeRuntimeTextSegment(entry, activeText);
    structuredParts.push(part);
    rendered = true;
  }
  flushStructuredParts();
  return rendered;
}

function appendRuntimeTextSegment(
  entry: TimelineEntry,
  text: string,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  nextTextSegmentSequence: () => number,
): boolean {
  if (!text) {
    return false;
  }
  const groupKey = runtimeTextGroupKey(entry);
  const existing = activeText.get(groupKey);
  if (existing !== undefined) {
    existing.part.text += text;
    existing.row.text = existing.part.text;
    return true;
  }
  const accumulator = createRuntimeTextAccumulator(
    entry,
    text,
    nextTextSegmentSequence(),
  );
  activeText.set(groupKey, accumulator);
  rows.push(accumulator.row);
  return true;
}

function createRuntimeTextAccumulator(
  entry: TimelineEntry,
  text: string,
  sequence: number,
): RuntimeTextAccumulator {
  const part: TimelineTextPart = {
    kind: "text",
    text,
  };
  return {
    part,
    row: {
      key: `runtime-text:${entry.runId}:${runtimeStreamKey(entry)}:${sequence}`,
      role: entry.roleId,
      text,
      kind: entry.kind,
      parts: [part],
      runId: entry.runId,
      source: "runtime",
      copyable: false,
    },
  };
}

function closeRuntimeTextSegment(
  entry: TimelineEntry,
  activeText: Map<string, RuntimeTextAccumulator>,
): void {
  activeText.delete(runtimeTextGroupKey(entry));
}

function runtimeTextGroupKey(entry: TimelineEntry): string {
  return `${entry.runId}:${runtimeStreamKey(entry)}`;
}

function runtimeStreamKey(entry: TimelineEntry): string {
  return entry.instanceId || entry.roleId;
}

function runtimeEntryParts(entry: TimelineEntry): TimelineRenderPart[] {
  const output = runtimeOutputParts(entry);
  if (output !== null && output.length > 0) {
    return output;
  }
  const tool = runtimeToolPart(entry);
  if (tool !== null) {
    return [tool];
  }
  const approval = runtimeApprovalPart(entry);
  if (approval !== null) {
    return [approval];
  }
  return [{ kind: "text", text: entry.text }];
}

function runtimeOutputParts(entry: TimelineEntry): TimelineRenderPart[] | null {
  if (entry.kind !== "output_delta") {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return [];
  }
  const output = payload.output;
  if (!Array.isArray(output)) {
    return [];
  }
  return output.flatMap((part) => {
    const renderPart = outputDeltaRenderPart(part);
    return renderPart === null ? [] : [renderPart];
  });
}

function outputDeltaRenderPart(part: JsonValue): TimelineRenderPart | null {
  const outputPart = jsonObject(part);
  if (outputPart === null) {
    return null;
  }
  const kind = objectString(outputPart, "kind");
  if (kind === "text") {
    return outputDeltaTextPart(outputPart);
  }
  if (kind === "media_ref") {
    return outputDeltaMediaPart(outputPart);
  }
  return null;
}

function outputDeltaTextPart(
  part: Record<string, JsonValue>,
): TimelineTextPart | null {
  const text = objectRawString(part, "text") || objectRawString(part, "content");
  return text ? { kind: "text", text } : null;
}

function outputDeltaMediaPart(
  part: Record<string, JsonValue>,
): TimelineMediaPart | null {
  return mediaPartFromFields({
    mimeType: objectString(part, "mime_type"),
    modality: objectString(part, "modality"),
    name: objectString(part, "name"),
    url: objectString(part, "url"),
  });
}

function MessageRowContent({ parts }: { parts: TimelineRenderPart[] }) {
  return (
    <div className="at-message-content">
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return (
            <MarkdownMessage key={`text:${index}`} text={part.text} />
          );
        }
        if (part.kind === "tool") {
          return <MessageToolBlock key={`tool:${index}`} tool={part} />;
        }
        if (part.kind === "thinking") {
          return (
            <MessageThinkingBlock
              key={`thinking:${index}`}
              thinking={part}
            />
          );
        }
        return <MessageMediaPreview key={`media:${index}`} media={part} />;
      })}
    </div>
  );
}

function MessageThinkingBlock({ thinking }: { thinking: TimelineThinkingPart }) {
  const hasText = thinking.text.trim().length > 0;
  return (
    <details
      className="at-message-thinking"
      data-part-index={thinking.partIndex}
      data-streaming={thinking.streaming ? "true" : "false"}
      open={thinking.streaming ? true : undefined}
    >
      <summary className="at-message-thinking-summary">
        <span className="at-message-thinking-label">Thinking</span>
        {thinking.streaming ? (
          <span className="at-message-thinking-live">Live</span>
        ) : null}
      </summary>
      {hasText ? (
        <div className="at-message-thinking-body">
          <MarkdownMessage text={thinking.text} />
        </div>
      ) : null}
    </details>
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
  const thinking = contentPartThinking(part);
  if (thinking !== null) {
    return [thinking];
  }
  const tool = contentPartTool(part);
  if (tool !== null) {
    return [tool];
  }
  return [];
}

function contentPartThinking(part: ContentPart): TimelineThinkingPart | null {
  if (contentPartKind(part) !== "thinking") {
    return null;
  }
  return {
    kind: "thinking",
    partIndex: contentPartIndex(part),
    streaming: contentPartStreaming(part) && !contentPartFinished(part),
    text: thinkingContentText(part),
  };
}

function contentPartTool(part: ContentPart): TimelineToolPart | null {
  const kind = contentPartKind(part);
  if (kind === "tool-call" || contentPartHasToolCallShape(part)) {
    return {
      action: "",
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
      action: "",
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
      action: "",
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

function runtimeApprovalPart(entry: TimelineEntry): TimelineToolPart | null {
  if (
    entry.kind !== "tool_approval_requested" &&
    entry.kind !== "tool_approval_resolved"
  ) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const action = objectString(payload, "action");
  const feedback = objectString(payload, "feedback");
  const argsPreview = objectString(payload, "args_preview");
  const optionLabels = approvalOptionLabels(payload.acp_options);
  const callId = objectString(payload, "tool_call_id");
  const toolName = objectString(payload, "tool_name");
  if (!callId && !toolName && !action && !feedback && !argsPreview && !optionLabels) {
    return null;
  }
  return {
    action,
    body: approvalBody({
      action,
      argsPreview,
      feedback,
      optionLabels,
    }),
    callId,
    error: entry.kind === "tool_approval_resolved" && approvalActionIsError(action),
    kind: "tool",
    phase: entry.kind === "tool_approval_requested"
      ? "approval-requested"
      : "approval-resolved",
    toolName: toolName || entry.text || "unknown_tool",
  };
}

function applyRuntimeThinkingEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeThinking: Map<string, RuntimeThinkingAccumulator>,
): boolean {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return false;
  }
  const partIndex = thinkingPartIndex(payload);
  const groupKey = runtimeThinkingGroupKey(entry, partIndex);
  if (entry.kind === "thinking_started") {
    if (!activeThinking.has(groupKey)) {
      const accumulator = createRuntimeThinkingAccumulator(entry, partIndex);
      activeThinking.set(groupKey, accumulator);
    }
    return true;
  }
  if (entry.kind === "thinking_delta") {
    const deltaText = thinkingDeltaText(entry);
    if (!deltaText) {
      return false;
    }
    const accumulator = ensureRuntimeThinkingAccumulator(
      entry,
      partIndex,
      activeThinking,
    );
    accumulator.part.text += deltaText;
    accumulator.part.streaming = true;
    accumulator.row.text = accumulator.part.text;
    if (!accumulator.inserted) {
      rows.push(accumulator.row);
      accumulator.inserted = true;
    }
    return true;
  }
  if (entry.kind === "thinking_finished") {
    const accumulator = activeThinking.get(groupKey);
    if (accumulator !== undefined) {
      accumulator.part.streaming = false;
      activeThinking.delete(groupKey);
    }
    return true;
  }
  return false;
}

function closeActiveThinkingForRun(
  runId: string,
  activeThinking: Map<string, RuntimeThinkingAccumulator>,
): void {
  for (const [groupKey, accumulator] of activeThinking) {
    if (!groupKey.startsWith(`${runId}:`)) {
      continue;
    }
    accumulator.part.streaming = false;
    activeThinking.delete(groupKey);
  }
}

function createRuntimeThinkingAccumulator(
  entry: TimelineEntry,
  partIndex: string,
): RuntimeThinkingAccumulator {
  const row = runtimeThinkingRow(entry, partIndex);
  const part = row.parts[0];
  if (part?.kind !== "thinking") {
    throw new Error("Runtime thinking row must contain a thinking part.");
  }
  return { inserted: false, part, row };
}

function ensureRuntimeThinkingAccumulator(
  entry: TimelineEntry,
  partIndex: string,
  activeThinking: Map<string, RuntimeThinkingAccumulator>,
): RuntimeThinkingAccumulator {
  const groupKey = runtimeThinkingGroupKey(entry, partIndex);
  const existing = activeThinking.get(groupKey);
  if (existing !== undefined) {
    return existing;
  }
  const accumulator = createRuntimeThinkingAccumulator(entry, partIndex);
  activeThinking.set(groupKey, accumulator);
  return accumulator;
}

function runtimeThinkingRow(
  entry: TimelineEntry,
  partIndex: string,
): TimelineRow {
  const part: TimelineThinkingPart = {
    kind: "thinking",
    partIndex,
    streaming: true,
    text: "",
  };
  return {
    key: `runtime-thinking:${entry.runId}:${runtimeStreamKey(entry)}:${partIndex}:${entry.eventId}`,
    role: entry.roleId,
    text: "",
    kind: entry.kind,
    parts: [part],
    runId: entry.runId,
    source: "runtime",
    copyable: false,
  };
}

function runtimeThinkingGroupKey(entry: TimelineEntry, partIndex: string): string {
  return `${entry.runId}:${runtimeStreamKey(entry)}:${partIndex}`;
}

function runtimeToolPart(entry: TimelineEntry): TimelineToolPart | null {
  if (
    entry.kind !== "tool_call" &&
    entry.kind !== "tool_input_validation_failed" &&
    entry.kind !== "tool_result"
  ) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const toolName = objectString(payload, "tool_name") || entry.text || "unknown_tool";
  const callId = objectString(payload, "tool_call_id");
  if (entry.kind === "tool_call") {
    if (!callId && !objectString(payload, "tool_name") && payload.args === undefined) {
      return null;
    }
    return {
      action: "",
      body: jsonValueText(payload.args ?? null),
      callId,
      error: false,
      kind: "tool",
      phase: "call",
      toolName,
    };
  }
  if (entry.kind === "tool_input_validation_failed") {
    const body = validationFailureBody(payload);
    if (!callId && !objectString(payload, "tool_name") && !body) {
      return null;
    }
    return {
      action: "",
      body,
      callId,
      error: true,
      kind: "tool",
      phase: "validation",
      toolName,
    };
  }
  const result = payload.result ?? payload.content ?? null;
  if (!callId && !objectString(payload, "tool_name") && result === null) {
    return null;
  }
  return {
    action: "",
    body: jsonValueText(result),
    callId,
    error: objectBoolean(payload, "error") || jsonObjectHasFailedOk(result),
    kind: "tool",
    phase: "result",
    toolName,
  };
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

function thinkingContentText(part: ContentPart): string {
  if ("content" in part && typeof part.content === "string") {
    return part.content;
  }
  if ("text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function contentPartIndex(part: ContentPart): string {
  if ("part_index" in part) {
    const value = part.part_index;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "0";
}

function contentPartStreaming(part: ContentPart): boolean {
  return "streaming" in part && part.streaming === true;
}

function contentPartFinished(part: ContentPart): boolean {
  return "finished" in part && part.finished === true;
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
  const thinkingCount = row.parts.filter((part) => part.kind === "thinking").length;
  const thinkingTextLength = row.parts
    .filter((part): part is TimelineThinkingPart => part.kind === "thinking")
    .reduce((total, part) => total + part.text.length, 0);
  const toolCount = row.parts.filter((part) => part.kind === "tool").length;
  const textLength = row.text.length + thinkingTextLength;
  return 96
    + mediaCount * 138
    + thinkingCount * 42
    + toolCount * 118
    + Math.min(160, Math.ceil(textLength / 110) * 22);
}

function isThinkingEvent(kind: RunEventType | "message"): boolean {
  return (
    kind === "thinking_started" ||
    kind === "thinking_delta" ||
    kind === "thinking_finished"
  );
}

function entryClosesThinking(kind: RunEventType | "message"): boolean {
  return (
    kind === "run_completed" ||
    kind === "run_failed" ||
    kind === "run_paused" ||
    kind === "run_stopped"
  );
}

function toolPhaseLabel(tool: TimelineToolPart): string {
  if (tool.phase === "approval-requested") {
    return "Approval requested";
  }
  if (tool.phase === "approval-resolved") {
    if (approvalActionIsError(tool.action)) {
      return approvalDeniedLabel(tool.action);
    }
    if (approvalActionIsApproved(tool.action)) {
      return "Approval approved";
    }
    return "Approval resolved";
  }
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

function approvalBody({
  action,
  argsPreview,
  feedback,
  optionLabels,
}: {
  action: string;
  argsPreview: string;
  feedback: string;
  optionLabels: string;
}): string {
  return [
    argsPreview ? `Args: ${argsPreview}` : "",
    optionLabels ? `Options: ${optionLabels}` : "",
    action ? `Action: ${action}` : "",
    feedback ? `Feedback: ${feedback}` : "",
  ].filter(Boolean).join("\n");
}

function validationFailureBody(payload: Record<string, JsonValue>): string {
  return [
    objectString(payload, "reason"),
    objectString(payload, "details"),
  ].filter(Boolean).join("\n");
}

function thinkingPartIndex(payload: Record<string, JsonValue>): string {
  const value = payload.part_index;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "0";
}

function thinkingDeltaText(entry: TimelineEntry): string {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return "";
  }
  return objectRawString(payload, "text")
    || objectRawString(payload, "delta")
    || objectRawString(payload, "content")
    || objectRawString(payload, "message");
}

function runtimeTextDeltaText(entry: TimelineEntry): string {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return "";
  }
  return objectRawString(payload, "text")
    || objectRawString(payload, "delta")
    || objectRawString(payload, "content")
    || objectRawString(payload, "message");
}

function approvalActionIsApproved(action: string): boolean {
  const normalized = action.trim().toLowerCase();
  return normalized.startsWith("approve") || normalized.startsWith("allow");
}

function approvalActionIsError(action: string): boolean {
  const normalized = action.trim().toLowerCase();
  return (
    normalized === "cancel" ||
    normalized === "cancelled" ||
    normalized === "deny" ||
    normalized === "denied" ||
    normalized === "reject" ||
    normalized === "rejected" ||
    normalized === "timeout" ||
    normalized === "timed_out"
  );
}

function approvalDeniedLabel(action: string): string {
  const normalized = action.trim().toLowerCase();
  if (normalized === "timeout" || normalized === "timed_out") {
    return "Approval timed out";
  }
  if (normalized === "cancel" || normalized === "cancelled") {
    return "Approval cancelled";
  }
  return "Approval denied";
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

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function payloadHasParseError(payload: Record<string, JsonValue>): boolean {
  return payload.parse_error === true || payload.raw_payload_json !== undefined;
}

function objectString(
  object: Record<string, JsonValue>,
  key: string,
): string {
  const value = object[key];
  return typeof value === "string" ? value.trim() : "";
}

function objectRawString(
  object: Record<string, JsonValue>,
  key: string,
): string {
  const value = object[key];
  return typeof value === "string" ? value : "";
}

function objectBoolean(
  object: Record<string, JsonValue>,
  key: string,
): boolean {
  return object[key] === true;
}

function approvalOptionLabels(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => {
      const option = jsonObject(item);
      if (option === null) {
        return "";
      }
      return objectString(option, "label")
        || objectString(option, "name")
        || objectString(option, "optionId")
        || objectString(option, "option_id")
        || objectString(option, "id");
    })
    .filter(Boolean)
    .join(", ");
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
