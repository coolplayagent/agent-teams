import { App, Button, Empty, Image, Skeleton, Tooltip, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Copy, Volume2, Wrench } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  MouseEvent,
  PointerEvent,
  ReactNode,
  SyntheticEvent,
  UIEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";

import {
  buildWorkspaceImagePreviewUrl,
  listSessionMessages,
  listSessionRounds,
} from "../../api/client";
import {
  contentPartText,
  type ContentPart,
  type JsonValue,
  type SessionRound,
  type SessionRoundMessage,
  type SessionRoundMessagePart,
  type SessionRoundsPage,
  type TimelineMessage,
} from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import type { RuntimeRunState, TimelineEntry } from "../../runtime/reducers";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import { useTranslations, type Translate } from "../../i18n";
import { MarkdownMessage } from "./MarkdownMessage";
import { ModelRequestStatus } from "./ModelRequestStatus";
import { RoundMarker } from "./RoundMarker";
import { RoundRail } from "./RoundRail";
import { TimelineDisclosure } from "./TimelineDisclosure";
import { ToolCallDetails } from "./ToolCallDetails";
import {
  formatToolDuration,
  toolActionFamily,
  toolDurationMs,
} from "./toolPresentation";
import { roundPromptText, roundTitle } from "./roundMetadata";
import {
  boundedStringCacheValue,
  indexesWithLongerStrictPrefix,
  timelineDerivedValue,
  timelineFallbackVirtualItems,
  type TimelineDerivationCacheEntry,
} from "./timelinePerformance";
import {
  immediateTimelineHydrationRowKeys,
  rememberHydratedTimelineRow,
} from "./timelineRowHydration";
import {
  TimelineRowHydrationPlaceholder,
  TimelineVirtualRow,
  type TimelineVirtualRowRenderer,
} from "./TimelineVirtualRow";
import "./ToolCallDetails.css";

const TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX = 96;
const TIMELINE_SCROLL_SCOPE_CACHE_LIMIT = 100;
const TIMELINE_DERIVED_ROWS_CACHE_LIMIT = 8;
const TIMELINE_FALLBACK_RENDER_LIMIT = 8;
const TIMELINE_HYDRATED_OVERSCAN_CACHE_LIMIT = 512;
const TOOL_PREVIEW_CACHE_LIMIT = 256;
const ROUND_RAIL_PAGE_LIMIT = 100;
const ROUND_RAIL_MAX_PAGES = 10;
const TOOL_RESULT_MAX_LINES = 200;
const TOOL_RESULT_MAX_CHARS = 12000;
const TIMELINE_SUBAGENT_MARKER_MAX_DEPTH = 8;
const IMAGE_PATH_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
const THINKING_DELTA_TEXT_KEYS = [
  "text",
  "delta",
  "content",
  "message",
] as const;
const HIDDEN_RUNTIME_CHAT_EVENT_KINDS = new Set<string>([
  "background_task_completed",
  "background_task_started",
  "background_task_stopped",
  "injection_applied",
  "injection_enqueued",
  "model_step_finished",
  "model_step_started",
  "run_completed",
  "run_resumed",
  "run_started",
  "subagent_resumed",
  "subagent_session_status_changed",
  "subagent_stopped",
  "token_usage",
  "tool_call_batch_sealed",
  "user_question_answered",
  "user_question_requested",
]);
const INTERNAL_RUNTIME_STATUS_NOISE_EVENT_KINDS = new Set<string>([
  "generation_progress",
  "hook_completed",
  "hook_decision_applied",
  "hook_deferred",
  "hook_failed",
  "hook_matched",
  "hook_started",
  "runtime_guardrail_report",
  "spec_checkpoint_applied",
  "spec_checkpoint_evaluated",
]);
const INTERNAL_ORCHESTRATION_TIMELINE_ROLES = new Set<string>([
  "delegationplanner",
  "llmsecurityevaluator",
]);
const MAIN_TIMELINE_AGENT_ROLES = new Set<string>([
  "assistant",
  "coordinator",
  "mainagent",
]);
const runtimeRunStateDetachedRoleCache = new WeakMap<
  RuntimeRunState,
  ReadonlySet<string>
>();
const runtimeRunStateMainRoleCache = new WeakMap<RuntimeRunState, boolean>();
const firstNonEmptyLineCache = new Map<string, string>();
const parsedJsonObjectCache = new Map<string, Record<string, JsonValue> | null>();
const toolCallPreviewCache = new Map<string, string>();
const IMAGE_CODE_SPAN_PATTERN = /`([^`\n]+)`/g;
const IMAGE_BARE_PATH_PATTERN =
  /((?:\/|\.{1,2}\/|[A-Za-z]:[\\/])[^"'`\s<>]+?\.(?:avif|bmp|gif|jpe?g|png|webp))/gi;
const TRAILING_PATH_PUNCTUATION_PATTERN = /[),.:;!?\\\]}>，。！？；：）】》]+$/u;
const LIVE_ROUND_REFETCH_MS = 1500;
interface MessageTimelineProps {
  emptyDescription?: string;
  emptyFallback?: ReactNode;
  fallbackRunId?: string | null;
  latestTerminalRunId?: string | null;
  latestTerminalRunStatus?: string | null;
  loadErrorDescription?: string;
  loadMessages?: (sessionId: string) => Promise<TimelineMessage[]>;
  messageQueryKey?: readonly unknown[];
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  primaryRoleId?: string | null;
  roundsEnabled?: boolean;
  runtimeRunId?: string | null;
  sessionId: string | null;
  subagentScopeRoleId?: string | null;
  suppressExactText?: string;
  variant?: "session" | "subagent-panel";
  visible?: boolean;
  workspaceId?: string | null;
}

export interface TimelineSubagentReference {
  createdAt?: string;
  description?: string;
  instanceId?: string;
  interactive?: boolean;
  lastEventId?: number | null;
  prompt?: string;
  roleId?: string;
  runId?: string;
  runPhase?: string;
  runStatus?: string;
  sessionId: string;
  sourceRunId?: string;
  sourceToolCallId?: string;
  status?: string;
  subagentKind?: string;
  title?: string;
  updatedAt?: string;
}

function latestModelRequestPhase(
  runs: readonly RuntimeRunState[],
): RuntimeRunState["modelRequestPhase"] {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const runState = runs[index];
    if (runState?.status !== "closed" && runState?.modelRequestPhase != null) {
      return runState.modelRequestPhase;
    }
  }
  return null;
}

export function MessageTimeline({
  emptyDescription,
  emptyFallback,
  fallbackRunId = null,
  latestTerminalRunId = null,
  latestTerminalRunStatus = null,
  loadErrorDescription,
  loadMessages = listSessionMessages,
  messageQueryKey,
  onSubagentOpen,
  primaryRoleId = null,
  roundsEnabled = true,
  runtimeRunId = null,
  sessionId,
  subagentScopeRoleId = null,
  suppressExactText = "",
  variant = "session",
  visible = true,
  workspaceId = null,
}: MessageTimelineProps) {
  const { message } = App.useApp();
  const t = useTranslations();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const pendingProgrammaticScrollRef = useRef<PendingProgrammaticScroll | null>(
    null,
  );
  const pendingRoundRunIdRef = useRef<string | null>(null);
  const scrollScopeKey = timelineScrollScopeKey(sessionId, variant, runtimeRunId);
  const scrollScopeKeyRef = useRef(scrollScopeKey);
  const scrollSnapshotRef = useRef<TimelineScrollSnapshot | null>(null);
  const scrollSnapshotsByScopeRef = useRef(
    new Map<string, TimelineScrollSnapshot>(),
  );
  const contentSignaturesByScrollScopeRef = useRef(
    new Map<string, TimelineContentSignature>(),
  );
  const expandedDisclosureIdsBySessionRef = useRef(
    new Map<string, ReadonlySet<string>>(),
  );
  const persistedRowsByScopeRef = useRef(
    new Map<string, TimelineDerivationCacheEntry<TimelineRow[]>>(),
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [expandedHistorySegmentIds, setExpandedHistorySegmentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedDisclosureIds, setExpandedDisclosureIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [newContentAvailable, setNewContentAvailable] = useState(false);
  const hydrationFrameRef = useRef<number | null>(null);
  const hydratedOverscanRowsRef = useRef({
    rowKeys: new Set<string>(),
    scopeKey: scrollScopeKey,
  });
  const [, setHydrationRevision] = useState(0);
  if (hydratedOverscanRowsRef.current.scopeKey !== scrollScopeKey) {
    hydratedOverscanRowsRef.current = {
      rowKeys: new Set(),
      scopeKey: scrollScopeKey,
    };
  }
  const runtimeRunList = useRuntimeStore(useShallow((state) =>
    Object.values(state.runtimeState.runs).filter((runState) =>
      runtimeRunStateMatchesScope(runState, {
        primaryRoleId,
        runtimeRunId,
        sessionId,
        subagentRoleId: subagentScopeRoleId,
        variant,
      })
    )
  ));
  const runtimeRuns = useMemo(
    () => Object.fromEntries(runtimeRunList.map((runState) => [runState.runId, runState])),
    [runtimeRunList],
  );
  const visibleModelRequestPhase = latestModelRequestPhase(runtimeRunList);
  const messagesQuery = useQuery({
    queryKey: messageQueryKey ?? ["sessions", sessionId, "messages"],
    queryFn: () => loadMessages(sessionId ?? ""),
    enabled: sessionId !== null,
  });
  const roundsQuery = useQuery({
    queryKey: ["sessions", sessionId, "rounds", "rail"],
    queryFn: () => collectRoundRailRounds(sessionId ?? ""),
    enabled:
      roundsEnabled &&
      sessionId !== null &&
      !messagesQuery.isLoading &&
      !messagesQuery.isError,
    refetchInterval: (query) =>
      roundsNeedLiveRefetch(query.state.data as SessionRound[] | undefined)
        ? LIVE_ROUND_REFETCH_MS
        : false,
    staleTime: 0,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const rounds = useMemo(
    () => roundsQuery.data ?? [],
    [roundsQuery.data],
  );
  const roundChromeEnabled = variant === "session";
  const displayRounds = useMemo(
    () =>
      roundChromeEnabled
        ? roundsWithSessionTerminalStatus(
            roundsWithRuntimeRunState(
              rounds,
              runtimeRuns,
              sessionId,
              runtimeRunId,
              primaryRoleId,
              subagentScopeRoleId,
              variant,
            ),
            latestTerminalRunId,
            latestTerminalRunStatus,
          )
        : [],
    [
      latestTerminalRunId,
      latestTerminalRunStatus,
      primaryRoleId,
      roundChromeEnabled,
      rounds,
      runtimeRunId,
      runtimeRuns,
      sessionId,
      subagentScopeRoleId,
      variant,
    ],
  );
  const terminalRunIdOverrides = useMemo(
    () => terminalRunIdOverrideSet(latestTerminalRunId, latestTerminalRunStatus),
    [latestTerminalRunId, latestTerminalRunStatus],
  );
  const terminalScopeOverride = useMemo(
    () =>
      variant === "subagent-panel" &&
      normalizedTerminalRoundStatus(latestTerminalRunStatus) !== null,
    [latestTerminalRunStatus, variant],
  );
  const railRounds = useMemo(
    () => visibleRoundRailRounds(displayRounds, expandedHistorySegmentIds),
    [displayRounds, expandedHistorySegmentIds],
  );
  const terminalRuntimeSignature = useMemo(
    () => terminalRuntimeDerivationSignature(runtimeRunList),
    [runtimeRunList],
  );
  const persistedRows = useMemo(
    () => timelineDerivedValue({
      cache: persistedRowsByScopeRef.current,
      derive: () => {
        const messageRoundLookup = createMessageRoundLookup(displayRounds);
        const scopedMessages = messagesVisibleInTimelineScope(
          messages,
          displayRounds,
          runtimeRunId,
          fallbackRunId,
          primaryRoleId,
        );
        const persistedMessages = mergeTimelineMessages(scopedMessages, displayRounds);
        return mergeToolRowsByCallId(
          dropRoundPromptDuplicateUserRows(
            persistedMessages
              .map((messageItem, index) =>
                messageToRow(
                  messageItem,
                  index,
                  messageRoundLookup,
                  fallbackRunId,
                  workspaceId,
                ),
              )
              .filter(timelineRowHasRenderableContent),
            displayRounds,
          ),
        );
      },
      identities: [messages, rounds],
      key: persistedRowsCacheKey({
        fallbackRunId,
        primaryRoleId,
        runtimeRunId,
        sessionId,
        variant,
        workspaceId,
      }),
      limit: TIMELINE_DERIVED_ROWS_CACHE_LIMIT,
      signature: terminalRuntimeSignature === null
        ? null
        : [
            terminalRuntimeSignature,
            latestTerminalRunId ?? "",
            latestTerminalRunStatus ?? "",
          ].join("|"),
    }),
    [
      displayRounds,
      fallbackRunId,
      latestTerminalRunId,
      latestTerminalRunStatus,
      messages,
      primaryRoleId,
      rounds,
      runtimeRunId,
      sessionId,
      terminalRuntimeSignature,
      variant,
      workspaceId,
    ],
  );
  const roundStreamedPersistedRows = useMemo(
    () => persistedRowsWithOpenRoundStreaming(persistedRows, displayRounds),
    [displayRounds, persistedRows],
  );
  const anchoredPersistedRows = useMemo(
    () =>
      persistedRowsWithRuntimeTextAnchors(
        roundStreamedPersistedRows,
        runtimeRuns,
      ),
    [roundStreamedPersistedRows, runtimeRuns],
  );
  const hydratedOutputTextByRunId = useMemo(
    () => timelineOutputTextByRunId(anchoredPersistedRows),
    [anchoredPersistedRows],
  );
  const hydratedOutputSourcesByRunId = useMemo(
    () => timelineOutputSourcesByRunId(anchoredPersistedRows),
    [anchoredPersistedRows],
  );
  const hydratedThinkingTextByRunId = useMemo(
    () => timelineThinkingTextByRunId(anchoredPersistedRows),
    [anchoredPersistedRows],
  );
  const hydratedToolStatesByRunId = useMemo(
    () => timelineToolStatesByRunId(anchoredPersistedRows),
    [anchoredPersistedRows],
  );
  const runtimeEntries = useMemo(
    () =>
      Object.values(runtimeRuns)
        .flatMap((runState) =>
          runtimeEntriesAfterHydration(
            runState,
            sessionId,
            runtimeRunId,
            primaryRoleId,
            subagentScopeRoleId,
            variant,
            hydratedOutputTextByRunId,
            hydratedOutputSourcesByRunId,
            hydratedThinkingTextByRunId,
            hydratedToolStatesByRunId,
          ),
        ),
    [
      hydratedOutputTextByRunId,
      hydratedOutputSourcesByRunId,
      hydratedThinkingTextByRunId,
      hydratedToolStatesByRunId,
      primaryRoleId,
      runtimeRunId,
      runtimeRuns,
      sessionId,
      subagentScopeRoleId,
      variant,
    ],
  );
  const runtimeRows = useMemo(
    () =>
      dropCoveredCursorOnlyRows(
        runtimeEntriesToRows(
          runtimeEntries,
          runtimeRuns,
          variant,
          terminalRunIdOverrides,
          terminalScopeOverride,
        ),
      ),
    [
      runtimeEntries,
      runtimeRuns,
      terminalRunIdOverrides,
      terminalScopeOverride,
      variant,
    ],
  );
  const displayPersistedRows = useMemo(
    () =>
      dropPersistedRowsCoveredByTerminalRuntime(
        anchoredPersistedRows,
        runtimeRows,
        runtimeRuns,
      ),
    [anchoredPersistedRows, runtimeRows, runtimeRuns],
  );
  const timelineRowsBeforeGrouping = useMemo(
    () =>
      dropExactTextRows(
        dropStrictPrefixAnswerRows(
          mergeTerminalRuntimeTextRowsIntoPersistedAnswers(
            dropDuplicateFinalPartsFromWorkRows(
              dropDuplicateWorkRowsAfterToolMerge(
                mergeToolRowsByCallId(
                mergeRuntimeRowsIntoHydratedRows(
                  displayPersistedRows,
                    runtimeRows.filter(timelineRowHasRenderableContent),
                  ),
                  { dedupeNonToolRows: false },
                ),
              ),
            ),
          ),
        ),
        suppressExactText,
      ),
    [displayPersistedRows, runtimeRows, suppressExactText],
  );
  const rows = useMemo(
    () =>
      dedupeTimelineRowsByKey(
        dropStrictPrefixAnswerRows(
          collapseProcessedRows(
            insertRoundMarkerRowsIfEnabled(
              timelineRowsBeforeGrouping,
              displayRounds,
              expandedHistorySegmentIds,
              roundChromeEnabled,
            ),
            displayRounds,
            runtimeRuns,
            terminalRunIdOverrides,
          ),
        ),
      ),
    [
      displayRounds,
      expandedHistorySegmentIds,
      roundChromeEnabled,
      runtimeRuns,
      terminalRunIdOverrides,
      timelineRowsBeforeGrouping,
    ],
  );
  const streamOpenForSession = useMemo(
    () =>
      Object.values(runtimeRuns).some(
        (runState) => runState.status !== "closed" &&
          runtimeRunStateMatchesScope(runState, {
            primaryRoleId,
            runtimeRunId,
            sessionId,
            subagentRoleId: subagentScopeRoleId,
            variant,
          }),
      ),
    [
      primaryRoleId,
      runtimeRunId,
      runtimeRuns,
      sessionId,
      subagentScopeRoleId,
      variant,
    ],
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
  const lastAnswerKey = lastAnswer?.key ?? null;
  const canReadAnswerAloud = supportsMessageSpeech();
  const handleCopyAnswer = useCallback((row: TimelineRow | undefined) => {
    void copyLastAnswer(row, message, t);
  }, [message, t]);
  const handleReadAnswerAloud = useCallback((row: TimelineRow | undefined) => {
    void readLastAnswerAloud(row, message, t);
  }, [message, t]);
  const activeRoundRunId =
    activeRunId ?? latestRowRunId(rows) ?? latestRoundRunId(railRounds);
  const hasRoundRail =
    roundChromeEnabled &&
    !roundsQuery.isLoading &&
    !roundsQuery.isError &&
    railRounds.length > 0;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
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
  const immediateHydrationRowKeys = immediateTimelineHydrationRowKeys({
    alwaysHydrate: (row) => row.roundMarker !== null,
    anchorRowKey: scrollSnapshotRef.current?.anchor?.rowKey ?? null,
    container: parentRef.current,
    estimatedSize: estimateRowSize,
    lastAnswerKey,
    rowKey: (row) => row.key,
    rows,
    virtualItems: renderedVirtualItems,
  });
  const deferredHydrationRowKeys = renderedVirtualItems
    .map((virtualItem) => rows[virtualItem.index]?.key ?? "")
    .filter((rowKey) =>
      rowKey.length > 0 &&
      !immediateHydrationRowKeys.has(rowKey) &&
      !hydratedOverscanRowsRef.current.rowKeys.has(rowKey)
    );
  const deferredHydrationSignature = deferredHydrationRowKeys.join("|");
  const hydrateCurrentViewportRows = useCallback((container: HTMLElement) => {
    const rowKeys = immediateTimelineHydrationRowKeys({
      alwaysHydrate: (row: TimelineRow) => row.roundMarker !== null,
      anchorRowKey: scrollSnapshotRef.current?.anchor?.rowKey ?? null,
      container,
      estimatedSize: estimateRowSize,
      lastAnswerKey,
      rowKey: (row: TimelineRow) => row.key,
      rows,
      virtualItems: renderedVirtualItems,
    });
    let changed = false;
    for (const rowKey of rowKeys) {
      if (!hydratedOverscanRowsRef.current.rowKeys.has(rowKey)) {
        rememberHydratedTimelineRow(
          hydratedOverscanRowsRef.current.rowKeys,
          rowKey,
          TIMELINE_HYDRATED_OVERSCAN_CACHE_LIMIT,
        );
        changed = true;
      }
    }
    if (changed) {
      setHydrationRevision((revision) => revision + 1);
    }
  }, [lastAnswerKey, renderedVirtualItems, rows]);
  const handleTimelineScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (!visible || timelineContainerIsHidden(container)) {
      return;
    }
    if (isProgrammaticTimelineScrollEvent(event.nativeEvent)) {
      return;
    }
    if (event.nativeEvent.isTrusted) {
      if (
        consumePendingProgrammaticTimelineScroll(
          pendingProgrammaticScrollRef,
          container,
          scrollScopeKey,
        )
      ) {
        return;
      }
    } else {
      pendingProgrammaticScrollRef.current = null;
    }
    if (container === parentRef.current) {
      const snapshot = captureTimelineScrollSnapshot(
        container,
        timelineUserScrollRequiresTransientAnchor(container),
      );
      scrollSnapshotRef.current = snapshot;
      rememberTimelineScopeValue(
        scrollSnapshotsByScopeRef.current,
        scrollScopeKey,
        snapshot,
      );
      if (snapshot.shouldFollow) {
        setNewContentAvailable(false);
      }
      syncActiveRunIdFromViewport(container, pendingRoundRunIdRef, setActiveRunId);
      hydrateCurrentViewportRows(container);
    }
  }, [hydrateCurrentViewportRows, scrollScopeKey, visible]);
  const handleTimelinePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (
      target.closest(
        ".at-message-thinking-summary, .at-message-tool-summary, .at-processed-group-summary, .at-round-prompt-toggle",
      ) === null
    ) {
      return;
    }
    const container = parentRef.current;
    if (container !== null) {
      scrollSnapshotRef.current = captureTimelineScrollSnapshot(
        container,
        true,
        true,
      );
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
  const handleJumpToLatest = useCallback(() => {
    const container = parentRef.current;
    if (container === null) {
      return;
    }
    pendingProgrammaticScrollRef.current = {
      scopeKey: scrollScopeKey,
      scrollTop: syncTimelineScrollPosition(
        container,
        timelineMaxScrollTop(container),
        scrollScopeKey,
      ),
    };
    const snapshot = captureTimelineScrollSnapshot(container);
    scrollSnapshotRef.current = snapshot;
    rememberTimelineScopeValue(
      scrollSnapshotsByScopeRef.current,
      scrollScopeKey,
      snapshot,
    );
    setNewContentAvailable(false);
  }, [scrollScopeKey]);
  const handleToggleHistorySegment = useCallback((segmentId: string) => {
    setExpandedHistorySegmentIds((current) => {
      const next = new Set(current);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  }, []);
  const handleDisclosureChange = useCallback((disclosureId: string, expanded: boolean) => {
    setExpandedDisclosureIds((current) => {
      const alreadyExpanded = current.has(disclosureId);
      if (alreadyExpanded === expanded) {
        return current;
      }
      const next = new Set(current);
      if (expanded) {
        next.add(disclosureId);
      } else {
        next.delete(disclosureId);
      }
      if (sessionId !== null) {
        expandedDisclosureIdsBySessionRef.current.set(sessionId, next);
      }
      return next;
    });
  }, [sessionId]);
  const handleDisclosureToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const row = event.currentTarget.closest<HTMLElement>(
      ".at-timeline-row[data-row-key]",
    );
    if (row === null) {
      return;
    }
    window.requestAnimationFrame(() => virtualizer.measureElement(row));
  }, [virtualizer]);
  const renderVirtualRow = useCallback<TimelineVirtualRowRenderer<TimelineRow>>(
    (row, index, start, measureElement, contentReady) => timelineRowElement(
      row,
      index,
      start,
      measureElement,
      t,
      lastAnswerKey,
      streamOpenForSession,
      canReadAnswerAloud,
      handleCopyAnswer,
      handleReadAnswerAloud,
      handleToggleHistorySegment,
      expandedDisclosureIds,
      handleDisclosureChange,
      handleDisclosureToggle,
      onSubagentOpen,
      sessionId ?? "",
      variant,
      contentReady,
    ),
    [
      canReadAnswerAloud,
      expandedDisclosureIds,
      handleCopyAnswer,
      handleDisclosureChange,
      handleDisclosureToggle,
      handleReadAnswerAloud,
      handleToggleHistorySegment,
      lastAnswerKey,
      onSubagentOpen,
      sessionId,
      streamOpenForSession,
      t,
      variant,
    ],
  );

  useEffect(() => {
    pendingRoundRunIdRef.current = null;
    setActiveRunId(null);
    setExpandedHistorySegmentIds(new Set());
    setExpandedDisclosureIds(
      sessionId === null
        ? new Set()
        : expandedDisclosureIdsBySessionRef.current.get(sessionId) ?? new Set(),
    );
  }, [sessionId]);

  useEffect(() => {
    if (deferredHydrationRowKeys.length === 0) {
      return;
    }
    const hydrationScopeKey = scrollScopeKey;
    hydrationFrameRef.current = window.requestAnimationFrame(() => {
      hydrationFrameRef.current = null;
      const hydrationState = hydratedOverscanRowsRef.current;
      if (hydrationState.scopeKey !== hydrationScopeKey) {
        return;
      }
      for (const rowKey of deferredHydrationRowKeys) {
        rememberHydratedTimelineRow(
          hydrationState.rowKeys,
          rowKey,
          TIMELINE_HYDRATED_OVERSCAN_CACHE_LIMIT,
        );
      }
      startTransition(() => setHydrationRevision((revision) => revision + 1));
    });
    return () => {
      if (hydrationFrameRef.current !== null) {
        window.cancelAnimationFrame(hydrationFrameRef.current);
        hydrationFrameRef.current = null;
      }
    };
  }, [deferredHydrationSignature, scrollScopeKey]);

  useLayoutEffect(() => {
    if (parentRef.current !== null) {
      setHydrationRevision((revision) => revision + 1);
    }
  }, [rows.length > 0, scrollScopeKey]);

  useLayoutEffect(() => {
    if (scrollScopeKeyRef.current !== scrollScopeKey) {
      scrollScopeKeyRef.current = scrollScopeKey;
      if (pendingProgrammaticScrollRef.current?.scopeKey !== scrollScopeKey) {
        pendingProgrammaticScrollRef.current = null;
      }
      scrollSnapshotRef.current =
        scrollSnapshotsByScopeRef.current.get(scrollScopeKey) ?? null;
      setNewContentAvailable(false);
    }
    const container = parentRef.current;
    if (
      !visible ||
      container === null ||
      timelineContainerIsHidden(container)
    ) {
      return;
    }
    const snapshot = scrollSnapshotRef.current;
    const previousContentSignature =
      contentSignaturesByScrollScopeRef.current.get(scrollScopeKey);
    const nextContentSignature = timelineContentSignature(rows);
    const contentChanged =
      previousContentSignature !== undefined &&
      !timelineContentSignaturesEqual(
        previousContentSignature,
        nextContentSignature,
      );
    const contentAppended =
      previousContentSignature !== undefined &&
      timelineContentWasAppended(
        previousContentSignature,
        nextContentSignature,
      );
    if (
      contentAppended &&
      snapshot !== null &&
      !snapshot.shouldFollow
    ) {
      setNewContentAvailable(true);
    }
    pendingProgrammaticScrollRef.current = {
      scopeKey: scrollScopeKey,
      scrollTop: syncTimelineScrollPosition(
        container,
        snapshot === null
          ? timelineMaxScrollTop(container)
          : timelineScrollTopForSnapshot(
              container,
              snapshot,
              rows,
              snapshot.preferAnchor || (contentChanged && !contentAppended),
            ),
        scrollScopeKey,
      ),
    };
    scrollSnapshotRef.current = captureTimelineScrollSnapshot(
      container,
      snapshot?.shouldFollow === false,
      false,
    );
    rememberTimelineScopeValue(
      scrollSnapshotsByScopeRef.current,
      scrollScopeKey,
      scrollSnapshotRef.current,
    );
    rememberTimelineScopeValue(
      contentSignaturesByScrollScopeRef.current,
      scrollScopeKey,
      nextContentSignature,
    );
    syncActiveRunIdFromViewport(container, pendingRoundRunIdRef, setActiveRunId);
    hydrateCurrentViewportRows(container);
  }, [
    hydrateCurrentViewportRows,
    rows,
    scrollScopeKey,
    timelineHeight,
    visible,
  ]);

  if (sessionId === null) {
    return (
      <TimelineStateFrame variant={variant}>
        <Empty description={t("timelineSelectSession")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </TimelineStateFrame>
    );
  }

  if (messagesQuery.isLoading && rows.length === 0) {
    return (
      <TimelineStateFrame variant={variant}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </TimelineStateFrame>
    );
  }

  if (messagesQuery.isError && rows.length === 0) {
    return (
      <TimelineStateFrame variant={variant}>
        <Empty
          description={loadErrorDescription ?? t("timelineLoadError")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </TimelineStateFrame>
    );
  }

  if (rows.length === 0) {
    return (
      <TimelineStateFrame variant={variant}>
        {emptyFallback ?? (
          <Empty
            description={emptyDescription ?? t("timelineNoMessages")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </TimelineStateFrame>
    );
  }

  return (
    <div
      className={[
        "at-timeline-frame",
        hasRoundRail ? "has-round-rail" : "",
        variant === "subagent-panel" ? "is-subagent-panel" : "",
      ].filter(Boolean).join(" ")}
    >
      <div
        className="at-timeline"
        data-rendered-row-count={renderedVirtualItems.length}
        data-runtime-run-count={runtimeRunList.length}
        data-scroll-owner={variant}
        data-total-row-count={rows.length}
        onPointerDown={handleTimelinePointerDown}
        onScroll={handleTimelineScroll}
        ref={parentRef}
        tabIndex={0}
      >
        <div
          className="at-timeline-virtual"
          style={{ height: `${timelineHeight}px` }}
        >
          {renderedVirtualItems.map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (row === undefined) {
              return null;
            }
            return (
              <TimelineVirtualRow
                contentReady={
                  immediateHydrationRowKeys.has(row.key) ||
                  hydratedOverscanRowsRef.current.rowKeys.has(row.key)
                }
                index={virtualItem.index}
                key={row.key}
                measureElement={virtualizer.measureElement}
                renderRow={renderVirtualRow}
                row={row}
                start={virtualItem.start}
              />
            );
          })}
        </div>
      </div>
      <ModelRequestStatus
        openingLabel={t("timelineOpeningModelStream")}
        phase={visibleModelRequestPhase}
        waitingLabel={t("timelineWaitingForModelSlot")}
      />
      {newContentAvailable ? (
        <Button
          aria-label={t("timelineJumpToLatest")}
          className="at-timeline-new-content"
          icon={<ArrowDown aria-hidden="true" size={14} />}
          onClick={handleJumpToLatest}
          size="small"
        >
          {t("timelineNewContent")}
        </Button>
      ) : null}
      {hasRoundRail ? (
        <RoundRail
          activeRunId={activeRoundRunId}
          onSelectRun={handleRoundSelect}
          rounds={railRounds}
          t={t}
        />
      ) : null}
    </div>
  );
}

function TimelineStateFrame({
  children,
  variant = "session",
}: {
  children: ReactNode;
  variant?: "session" | "subagent-panel";
}) {
  return (
    <div
      className={[
        "at-timeline-frame",
        variant === "subagent-panel" ? "is-subagent-panel" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="at-timeline at-timeline-empty">
        {children}
      </div>
    </div>
  );
}

interface TimelineRow {
  key: string;
  role: string;
  instanceId?: string | null;
  text: string;
  kind: RunEventType | "message" | "processed" | "round";
  parts: TimelineRenderPart[];
  historyDivider?: TimelineHistoryDivider;
  injection?: TimelineInjectionRow;
  processedGroup?: TimelineProcessedGroup;
  roundMarker: TimelineRoundMarker | null;
  runId: string | null;
  runIdSource?: TimelineRunIdSource | null;
  source: "message" | "runtime";
  copyable: boolean;
}

interface PersistedRowsCacheKeyOptions {
  fallbackRunId: string | null;
  primaryRoleId: string | null;
  runtimeRunId: string | null;
  sessionId: string | null;
  variant: "session" | "subagent-panel";
  workspaceId: string | null;
}

interface TimelineInjectionRow {
  clientMessageId: string;
  injectionId: string;
  occurredAt: string;
  recipientInstanceId: string;
  status: "applied" | "failed" | "queued";
}

type TimelineRunIdSource = "fallback" | "round" | "run_id" | "trace_id";

interface TimelineProcessedGroup {
  rows: TimelineRow[];
}

interface TimelineHistoryDivider {
  expanded: boolean;
  hiddenMessageCount: number;
  hiddenRoundCount: number;
  markerTitle: string;
  segmentId: string;
}

interface TimelineRoundMarker {
  index: number;
  round: SessionRound;
}

type TimelineRenderPart =
  | TimelineTextPart
  | TimelineMediaPart
  | TimelineThinkingPart
  | TimelineToolPart;

interface TimelineTextPart {
  cursorOnly?: boolean;
  kind: "text";
  reveal?: boolean;
  streaming: boolean;
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
  durationMs?: number;
  error: boolean;
  kind: "tool";
  inputBody?: string;
  mediaParts: TimelineMediaPart[];
  outputBody?: string;
  phase:
    | "approval-requested"
    | "approval-resolved"
    | "call"
    | "result"
    | "validation";
  subagent: TimelineSubagentReference | null;
  sourceRunId?: string;
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
  placeholder: boolean;
  row: TimelineRow;
}

interface TimelineScrollAnchor {
  offset: number;
  rowKey: string;
}

interface TimelineScrollSnapshot {
  anchor: TimelineScrollAnchor | null;
  preferAnchor: boolean;
  scrollTop: number;
  shouldFollow: boolean;
}

interface PendingProgrammaticScroll {
  scopeKey: string;
  scrollTop: number;
}

interface TimelineContentSignature {
  lastRowContentLength: number;
  lastRowKey: string;
  rowCount: number;
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

function timelineContainerIsHidden(container: HTMLElement): boolean {
  return container.closest("[hidden]") !== null;
}

function timelineScrollScopeKey(
  sessionId: string | null,
  variant: "session" | "subagent-panel",
  runtimeRunId: string | null,
): string {
  return [variant, sessionId ?? "", runtimeRunId?.trim() ?? ""].join(":");
}

function persistedRowsCacheKey({
  fallbackRunId,
  primaryRoleId,
  runtimeRunId,
  sessionId,
  variant,
  workspaceId,
}: PersistedRowsCacheKeyOptions): string {
  return [
    variant,
    sessionId ?? "",
    runtimeRunId?.trim() ?? "",
    fallbackRunId?.trim() ?? "",
    primaryRoleId?.trim() ?? "",
    workspaceId?.trim() ?? "",
  ].join(":");
}

export function terminalRuntimeDerivationSignature(
  runs: readonly RuntimeRunState[],
): string | null {
  if (runs.some((run) => run.status !== "closed" && run.status !== "failed")) {
    return null;
  }
  return [...runs]
    .sort((left, right) => left.runId.localeCompare(right.runId))
    .map((run) => [
      run.runId,
      run.status,
      run.terminalEventType ?? "",
      String(run.lastEventId),
      String(run.entries.length),
    ].join(":"))
    .join("|");
}

function timelineContentSignature(rows: TimelineRow[]): TimelineContentSignature {
  const lastRow = rows.at(-1);
  return {
    lastRowContentLength: lastRow === undefined
      ? 0
      : timelineRowContentLength(lastRow),
    lastRowKey: lastRow?.key ?? "",
    rowCount: rows.length,
  };
}

function timelineRowContentLength(row: TimelineRow): number {
  return row.parts.reduce((total, part) => {
    if (part.kind === "text" || part.kind === "thinking") {
      return total + part.text.length;
    }
    if (part.kind === "tool") {
      return total + part.body.length + (part.inputBody?.length ?? 0) +
        (part.outputBody?.length ?? 0);
    }
    return total + part.name.length + part.url.length;
  }, row.text.length);
}

function timelineContentWasAppended(
  previous: TimelineContentSignature,
  next: TimelineContentSignature,
): boolean {
  if (next.rowCount > previous.rowCount) {
    return true;
  }
  return next.rowCount === previous.rowCount &&
    next.lastRowKey === previous.lastRowKey &&
    next.lastRowContentLength > previous.lastRowContentLength;
}

function timelineContentSignaturesEqual(
  previous: TimelineContentSignature,
  next: TimelineContentSignature,
): boolean {
  return previous.rowCount === next.rowCount &&
    previous.lastRowKey === next.lastRowKey &&
    previous.lastRowContentLength === next.lastRowContentLength;
}

function rememberTimelineScopeValue<Value>(
  values: Map<string, Value>,
  key: string,
  value: Value,
): void {
  values.delete(key);
  values.set(key, value);
  while (values.size > TIMELINE_SCROLL_SCOPE_CACHE_LIMIT) {
    const oldestKey = values.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    values.delete(oldestKey);
  }
}

function captureTimelineScrollSnapshot(
  container: HTMLElement,
  forceAnchor = false,
  preferAnchor = false,
): TimelineScrollSnapshot {
  const scrollTop = scrollMetric(container.scrollTop);
  const shouldFollow = !forceAnchor && isTimelineNearBottom(container);
  return {
    anchor: shouldFollow ? null : captureTimelineScrollAnchor(container, scrollTop),
    preferAnchor,
    scrollTop,
    shouldFollow,
  };
}

function timelineScrollTopForSnapshot(
  container: HTMLElement,
  snapshot: TimelineScrollSnapshot,
  rows: TimelineRow[],
  useAnchor: boolean,
): number {
  if (snapshot.shouldFollow) {
    return timelineMaxScrollTop(container);
  }
  if (!useAnchor) {
    return clampScrollTop(container, snapshot.scrollTop);
  }
  const anchoredScrollTop = timelineAnchorScrollTop(container, snapshot, rows);
  return clampScrollTop(container, anchoredScrollTop);
}

function captureTimelineScrollAnchor(
  container: HTMLElement,
  scrollTop: number,
): TimelineScrollAnchor | null {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(".at-timeline-row[data-row-key]"),
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
  rows: TimelineRow[],
): number {
  if (snapshot.anchor === null) {
    return snapshot.scrollTop;
  }
  const row = findTimelineAnchorRow(container, snapshot.anchor.rowKey);
  if (row === null) {
    const estimatedRowTop = estimatedTimelineRowTop(rows, snapshot.anchor.rowKey);
    return estimatedRowTop === null
      ? snapshot.scrollTop
      : estimatedRowTop + snapshot.anchor.offset;
  }
  return timelineRowTop(row) + snapshot.anchor.offset;
}

function estimatedTimelineRowTop(rows: TimelineRow[], rowKey: string): number | null {
  let top = 0;
  for (const row of rows) {
    if (row.key === rowKey) {
      return top;
    }
    top += estimateRowSize(row);
  }
  return null;
}

function findTimelineAnchorRow(
  container: HTMLElement,
  rowKey: string,
): HTMLElement | null {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(".at-timeline-row[data-row-key]"),
  );
  return rows.find((row) => row.dataset.rowKey === rowKey) ?? null;
}

function syncTimelineScrollPosition(
  container: HTMLElement,
  scrollTop: number,
  scopeKey: string,
): number {
  const nextScrollTop = clampScrollTop(container, scrollTop);
  container.scrollTop = nextScrollTop;
  const ownerWindow = container.ownerDocument.defaultView;
  ownerWindow?.setTimeout(() => {
    container.dispatchEvent(new ownerWindow.CustomEvent("scroll", {
      detail: {
        timelineProgrammatic: true,
        timelineScopeKey: scopeKey,
        timelineScrollTop: nextScrollTop,
      },
    }));
  }, 0);
  return nextScrollTop;
}

function isProgrammaticTimelineScrollEvent(event: Event): boolean {
  const detail = (event as CustomEvent<unknown>).detail;
  return typeof detail === "object" &&
    detail !== null &&
    (detail as { timelineProgrammatic?: unknown }).timelineProgrammatic === true;
}

function consumePendingProgrammaticTimelineScroll(
  pendingScrollRef: { current: PendingProgrammaticScroll | null },
  container: HTMLElement,
  scopeKey: string,
): boolean {
  const pendingScroll = pendingScrollRef.current;
  if (pendingScroll === null) {
    return false;
  }
  pendingScrollRef.current = null;
  return pendingScroll.scopeKey === scopeKey &&
    Math.abs(scrollMetric(container.scrollTop) - pendingScroll.scrollTop) <= 1;
}

function isTimelineNearBottom(container: HTMLElement): boolean {
  return timelineMaxScrollTop(container) - scrollMetric(container.scrollTop)
    <= TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX;
}

function timelineUserScrollRequiresTransientAnchor(
  container: HTMLElement,
): boolean {
  if (timelineMaxScrollTop(container) - scrollMetric(container.scrollTop) <= 1) {
    return false;
  }
  const virtualHost = container.querySelector<HTMLElement>(
    ".at-timeline-virtual",
  );
  if (virtualHost === null) {
    return false;
  }
  const hostHeight = scrollMetric(Number.parseFloat(virtualHost.style.height));
  return Array.from(
    container.querySelectorAll<HTMLElement>(".at-timeline-row[data-row-key]"),
  ).some((row) => timelineRowTop(row) + timelineRowHeight(row) > hostHeight + 1);
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
  return timelineFallbackVirtualItems(
    rows.map(estimateRowSize),
    TIMELINE_FALLBACK_RENDER_LIMIT,
  );
}

function fallbackTotalSize(rows: TimelineRow[]): number {
  return rows.reduce((total, row) => total + estimateRowSize(row), 0);
}

function timelineRowElement(
  row: TimelineRow,
  index: number,
  start: number,
  measureElement: (element: Element | null) => void,
  t: Translate,
  lastAnswerKey: string | null,
  streamOpenForSession: boolean,
  canReadAnswerAloud: boolean,
  onCopyAnswer: (row: TimelineRow | undefined) => void,
  onReadAnswerAloud: (row: TimelineRow | undefined) => void,
  onToggleHistorySegment: (segmentId: string) => void,
  expandedDisclosureIds: ReadonlySet<string>,
  onDisclosureChange: (disclosureId: string, expanded: boolean) => void,
  onDisclosureToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void,
  onSubagentOpen: ((subagent: TimelineSubagentReference) => void) | undefined,
  sessionId: string,
  variant: "session" | "subagent-panel",
  contentReady: boolean,
) {
  const style = { transform: `translateY(${start}px)` };
  if (row.processedGroup !== undefined) {
    return (
      <ProcessedGroupRow
        group={row.processedGroup}
        expanded={expandedDisclosureIds.has(`processed:${row.runId ?? row.key}`)}
        expandedDisclosureIds={expandedDisclosureIds}
        index={index}
        key={row.key}
        measureElement={measureElement}
        onSubagentOpen={onSubagentOpen}
        onDisclosureChange={onDisclosureChange}
        onDisclosureToggle={onDisclosureToggle}
        rowKey={row.key}
        runId={row.runId}
        sessionId={sessionId}
        style={style}
        t={t}
        contentReady={contentReady}
      />
    );
  }
  if (row.historyDivider !== undefined) {
    return (
      <TimelineHistoryDividerRow
        divider={row.historyDivider}
        index={index}
        key={row.key}
        measureElement={measureElement}
        onToggle={onToggleHistorySegment}
        rowKey={row.key}
        runId={row.runId}
        style={style}
        t={t}
        contentReady={contentReady}
      />
    );
  }
  if (row.roundMarker !== null) {
    const disclosureId = `round-prompt:${row.roundMarker.round.run_id}`;
    return (
      <section
        className="at-timeline-row at-round-marker"
        data-index={index}
        data-row-key={row.key}
        data-run-id={row.runId ?? undefined}
        key={row.key}
        ref={measureElement}
        style={style}
      >
        {contentReady ? <RoundMarker
          index={row.roundMarker.index}
          onPromptOpenChange={(expanded) =>
            onDisclosureChange(disclosureId, expanded)}
          onPromptToggle={(event) => {
            const markerRow = event.currentTarget.closest<HTMLElement>(
              ".at-timeline-row[data-row-key]",
            );
            if (markerRow !== null) {
              window.requestAnimationFrame(() => measureElement(markerRow));
            }
          }}
          promptOpen={expandedDisclosureIds.has(disclosureId)}
          round={row.roundMarker.round}
          t={t}
        /> : (
          <TimelineRowHydrationPlaceholder
            estimatedHeight={estimateRowSize(row) - 28}
            rowKey={row.key}
          />
        )}
      </section>
    );
  }
  const toolOnly = timelineRowIsToolOnly(row);
  const showRoleLabel = shouldShowRoleLabel(row, variant);
  const showActions = row.copyable && row.key === lastAnswerKey;
  const streaming = timelineRowHasStreamingContent(row);
  return (
    <article
      className={[
        "at-timeline-row",
        "at-message",
        row.source === "runtime" ? "is-runtime" : "",
        toolOnly ? "is-tool-only" : "",
        showRoleLabel ? "has-role-label" : "",
        streaming ? "is-streaming" : "",
      ].filter(Boolean).join(" ")}
      data-index={index}
      data-instance-id={row.instanceId ?? undefined}
      data-client-message-id={row.injection?.clientMessageId || undefined}
      data-injection-id={row.injection?.injectionId || undefined}
      data-injection-status={row.injection?.status}
      data-role-id={row.role}
      data-row-key={row.key}
      data-run-id={row.runId ?? undefined}
      key={row.key}
      ref={measureElement}
      style={style}
    >
      {contentReady && showRoleLabel ? (
        <Typography.Text className="at-message-role">
          {displayRole(row.role, t)}
        </Typography.Text>
      ) : null}
      {contentReady ? <MessageRowContent
        expandedDisclosureIds={expandedDisclosureIds}
        onDisclosureChange={onDisclosureChange}
        onDisclosureToggle={onDisclosureToggle}
        onSubagentOpen={onSubagentOpen}
        parts={row.parts}
        row={row}
        sessionId={sessionId}
        t={t}
      /> : (
        <TimelineRowHydrationPlaceholder
          estimatedHeight={estimateRowSize(row) - 28}
          rowKey={row.key}
        />
      )}
      {contentReady && showActions ? (
        <MessageRowActions
          canReadAloud={canReadAnswerAloud}
          disabled={streamOpenForSession}
          onCopy={() => onCopyAnswer(row)}
          onReadAloud={() => onReadAnswerAloud(row)}
          t={t}
        />
      ) : null}
    </article>
  );
}

function ProcessedGroupRow({
  contentReady,
  expanded,
  expandedDisclosureIds,
  group,
  index,
  measureElement,
  onSubagentOpen,
  onDisclosureChange,
  onDisclosureToggle,
  rowKey,
  runId,
  sessionId,
  style,
  t,
}: {
  contentReady: boolean;
  expanded: boolean;
  expandedDisclosureIds: ReadonlySet<string>;
  group: TimelineProcessedGroup;
  index: number;
  measureElement: (element: Element | null) => void;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  onDisclosureChange: (disclosureId: string, expanded: boolean) => void;
  onDisclosureToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
  rowKey: string;
  runId: string | null;
  sessionId: string;
  style: { transform: string };
  t: Translate;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const setRowRef = useCallback((element: HTMLElement | null) => {
    rowRef.current = element;
    measureElement(element);
  }, [measureElement]);
  const handleToggle = useCallback(() => {
    const element = rowRef.current;
    if (element === null) {
      return;
    }
    window.requestAnimationFrame(() => measureElement(element));
  }, [measureElement]);
  return (
    <section
      className="at-timeline-row at-processed-group-row"
      data-index={index}
      data-row-key={rowKey}
      data-run-id={runId ?? undefined}
      ref={setRowRef}
      style={style}
    >
      {contentReady ? <TimelineDisclosure
        className="at-processed-group"
        disclosureId={`processed:${runId ?? rowKey}`}
        expanded={expanded}
        onExpandedChange={onDisclosureChange}
        onToggle={(event) => {
          handleToggle();
          onDisclosureToggle(event);
        }}
      >
        <summary className="at-processed-group-summary">
          <span className="at-processed-group-toggle" aria-hidden="true">{">"}</span>
          <span className="at-processed-group-label">{t("timelineProcessedGroup")}</span>
        </summary>
        <div className="at-processed-group-body">
          {group.rows.map((groupRow) => (
            <div
              className={[
                "at-processed-group-item",
                timelineRowIsToolOnly(groupRow) ? "is-tool-only" : "",
              ].filter(Boolean).join(" ")}
              data-instance-id={groupRow.instanceId ?? undefined}
              data-role-id={groupRow.role}
              data-row-key={groupRow.key}
              data-run-id={groupRow.runId ?? undefined}
              key={groupRow.key}
            >
              <MessageRowContent
                expandedDisclosureIds={expandedDisclosureIds}
                onDisclosureChange={onDisclosureChange}
                onDisclosureToggle={onDisclosureToggle}
                onSubagentOpen={onSubagentOpen}
                parts={groupRow.parts}
                row={groupRow}
                sessionId={sessionId}
                t={t}
              />
            </div>
          ))}
        </div>
      </TimelineDisclosure> : (
        <TimelineRowHydrationPlaceholder estimatedHeight={24} rowKey={rowKey} />
      )}
    </section>
  );
}

function TimelineHistoryDividerRow({
  contentReady,
  divider,
  index,
  measureElement,
  onToggle,
  rowKey,
  runId,
  style,
  t,
}: {
  contentReady: boolean;
  divider: TimelineHistoryDivider;
  index: number;
  measureElement: (element: Element | null) => void;
  onToggle: (segmentId: string) => void;
  rowKey: string;
  runId: string | null;
  style: { transform: string };
  t: Translate;
}) {
  const actionLabel = divider.expanded
    ? t("timelineHideHistorySegment", { round: divider.markerTitle })
    : t("timelineShowHistorySegment", { round: divider.markerTitle });
  return (
    <section
      className="at-timeline-row at-history-divider"
      data-index={index}
      data-row-key={rowKey}
      data-run-id={runId ?? undefined}
      ref={measureElement}
      style={style}
    >
      {contentReady ? <button
        aria-expanded={divider.expanded}
        className="at-history-divider-button"
        onClick={() => onToggle(divider.segmentId)}
        type="button"
      >
        <span className="at-history-divider-title">{t("timelineHistoryCleared")}</span>
        <span className="at-history-divider-meta">
          {t("timelineHistoryCompacted", {
            messages: divider.hiddenMessageCount,
            round: divider.markerTitle,
            rounds: divider.hiddenRoundCount,
          })}
        </span>
        <span className="at-history-divider-action">{actionLabel}</span>
      </button> : (
        <TimelineRowHydrationPlaceholder estimatedHeight={24} rowKey={rowKey} />
      )}
    </section>
  );
}

function messageToRow(
  message: TimelineMessage,
  index: number,
  roundLookup: MessageRoundLookup,
  fallbackRunId: string | null,
  workspaceId: string | null,
): TimelineRow {
  const injection = timelineMessageInjectionRow(message);
  const role = injection === undefined
    ? message.role_id ?? message.role ?? "agent"
    : "user";
  const parts = messageParts(message, workspaceId);
  const text = rowCopyText(parts);
  const runIdentity = messageRunIdentity(message, roundLookup, fallbackRunId);
  return {
    key: injection === undefined
      ? `message:${message.message_id ?? index}`
      : timelineInjectionRowKey(runIdentity.runId, injection, message.message_id ?? index),
    role,
    text,
    kind: "message",
    injection,
    parts,
    roundMarker: null,
    runId: runIdentity.runId,
    runIdSource: runIdentity.source,
    source: "message",
    copyable: isAnswerRole(role) && text.trim().length > 0,
  };
}

function timelineMessageInjectionRow(
  message: TimelineMessage,
): TimelineInjectionRow | undefined {
  if (
    (message.entry_type ?? "").trim().toLowerCase() !== "injection" ||
    (message.visibility ?? "public").trim().toLowerCase() === "internal"
  ) {
    return undefined;
  }
  return {
    clientMessageId: message.client_message_id?.trim() ?? "",
    injectionId: message.injection_id?.trim() ?? "",
    occurredAt: timelineMessageOccurredAt(message),
    recipientInstanceId: message.recipient_instance_id?.trim() ?? "",
    status: normalizedInjectionStatus(
      message.injection_status ?? message.status ?? "applied",
    ),
  };
}

function timelineInjectionRowKey(
  runId: string | null,
  injection: TimelineInjectionRow,
  fallback: string | number,
): string {
  const identity = injection.clientMessageId.length > 0
    ? `client:${injection.clientMessageId}`
    : injection.injectionId.length > 0
      ? `id:${injection.injectionId}`
      : `fallback:${fallback}`;
  return `injection:${runId ?? ""}:${identity}`;
}

function normalizedInjectionStatus(
  status: string | null | undefined,
): TimelineInjectionRow["status"] {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "failed";
  }
  if (normalized.includes("appl") || normalized.includes("deliver")) {
    return "applied";
  }
  return "queued";
}

function insertRoundMarkerRows(
  baseRows: TimelineRow[],
  rounds: SessionRound[],
  expandedHistorySegmentIds: ReadonlySet<string>,
): TimelineRow[] {
  const rowsWithMarkers = insertPlainRoundMarkerRows(baseRows, rounds);
  return insertHistoryDividerRows(rowsWithMarkers, rounds, expandedHistorySegmentIds);
}

function insertRoundMarkerRowsIfEnabled(
  baseRows: TimelineRow[],
  rounds: SessionRound[],
  expandedHistorySegmentIds: ReadonlySet<string>,
  enabled: boolean,
): TimelineRow[] {
  if (!enabled) {
    return baseRows;
  }
  return insertRoundMarkerRows(baseRows, rounds, expandedHistorySegmentIds);
}

function dropExactTextRows(rows: TimelineRow[], suppressedText: string): TimelineRow[] {
  const normalizedSuppressedText = normalizedTimelineText(suppressedText);
  if (normalizedSuppressedText.length === 0) {
    return rows;
  }
  let removed = false;
  return rows.filter((row) => {
    if (removed) {
      return true;
    }
    if (normalizedTimelineText(row.text) !== normalizedSuppressedText) {
      return true;
    }
    removed = true;
    return false;
  });
}

function dropRoundPromptDuplicateUserRows(
  rows: TimelineRow[],
  rounds: SessionRound[],
): TimelineRow[] {
  const promptByRunId = new Map<string, string>();
  for (const round of rounds) {
    const runId = round.run_id.trim();
    const prompt = normalizedTimelineText(roundPromptText(round));
    if (runId.length > 0 && prompt.length > 0) {
      promptByRunId.set(runId, prompt);
    }
  }
  if (promptByRunId.size === 0) {
    return rows;
  }
  return rows.filter((row) => {
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0 || normalizedRole(row.role) !== "user") {
      return true;
    }
    return normalizedTimelineText(row.text) !== promptByRunId.get(runId);
  });
}

function collapseProcessedRows(
  rows: TimelineRow[],
  rounds: SessionRound[],
  runStates: Record<string, RuntimeRunState>,
  terminalRunIdOverrides: ReadonlySet<string>,
): TimelineRow[] {
  const roundByRunId = new Map(
    rounds.flatMap((round) => {
      const runId = round.run_id.trim();
      return runId.length > 0 ? [[runId, round] as const] : [];
    }),
  );
  const collapsedRows: TimelineRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (row === undefined || processedSegmentBoundary(row)) {
      if (row !== undefined) {
        collapsedRows.push(row);
      }
      index += 1;
      continue;
    }
    const runId = row.runId?.trim() ?? "";
    if (
      runId.length === 0 ||
      !runIsTerminal(runId, roundByRunId, runStates, terminalRunIdOverrides)
    ) {
      collapsedRows.push(row);
      index += 1;
      continue;
    }
    const segment: TimelineRow[] = [];
    while (index < rows.length) {
      const next = rows[index];
      const nextRunId = next?.runId?.trim() ?? "";
      if (
        next === undefined ||
        processedSegmentBoundary(next) ||
        nextRunId !== runId
      ) {
        break;
      }
      segment.push(next);
      index += 1;
    }
    collapsedRows.push(...collapseProcessedSegment(segment, runId));
  }
  return collapsedRows;
}

function processedSegmentBoundary(row: TimelineRow): boolean {
  return (
    row.historyDivider !== undefined ||
    row.processedGroup !== undefined ||
    row.roundMarker !== null
  );
}

function runIsTerminal(
  runId: string,
  roundByRunId: ReadonlyMap<string, SessionRound>,
  runStates: Record<string, RuntimeRunState>,
  terminalRunIdOverrides: ReadonlySet<string>,
): boolean {
  if (terminalRunIdOverrides.has(runId)) {
    return true;
  }
  const runState = runStates[runId];
  if (runState !== undefined) {
    return runtimeRunStateClosesText(runState);
  }
  const status = roundByRunId.get(runId)?.run_status?.trim().toLowerCase() ?? "";
  return [
    "cancelled",
    "canceled",
    "completed",
    "failed",
    "paused",
    "stopped",
  ].includes(status);
}

function terminalRunIdOverrideSet(
  latestTerminalRunId: string | null,
  latestTerminalRunStatus: string | null,
): ReadonlySet<string> {
  const runId = latestTerminalRunId?.trim() ?? "";
  if (runId.length === 0 || normalizedTerminalRoundStatus(latestTerminalRunStatus) === null) {
    return new Set();
  }
  return new Set([runId]);
}

function collapseProcessedSegment(
  segment: TimelineRow[],
  runId: string,
): TimelineRow[] {
  const terminalSegment = closeTerminalSegmentToolCalls(segment);
  const keepMainNarrationOutside = segment.some(timelineRowHasInjectionNotice);
  const surfacedRows = terminalSegment.filter((row) =>
    timelineRowStaysOutsideProcessedGroup(row, keepMainNarrationOutside),
  );
  const processableSegment = terminalSegment.filter(
    (row) => !timelineRowStaysOutsideProcessedGroup(row, keepMainNarrationOutside),
  );
  if (surfacedRows.length > 0 && processableSegment.length > 0) {
    return [
      ...surfacedRows,
      ...collapseProcessedSegmentCore(processableSegment, runId),
    ];
  }
  return collapseProcessedSegmentCore(terminalSegment, runId);
}

function closeTerminalSegmentToolCalls(segment: TimelineRow[]): TimelineRow[] {
  let changed = false;
  const rows = segment.map((row) => {
    let rowChanged = false;
    const parts = row.parts.map((part) => {
      if (part.kind !== "tool" || part.phase !== "call") {
        return part;
      }
      rowChanged = true;
      changed = true;
      return { ...part, phase: "result" as const };
    });
    return rowChanged
      ? {
          ...row,
          parts,
          text: rowCopyText(parts),
        }
      : row;
  });
  return changed ? rows : segment;
}

function collapseProcessedSegmentCore(
  segment: TimelineRow[],
  runId: string,
): TimelineRow[] {
  const firstWork = firstWorkPartLocation(segment);
  if (firstWork === null) {
    return segment;
  }
  const firstWorkSourceRow = segment[firstWork.rowIndex];
  if (firstWorkSourceRow === undefined) {
    return segment;
  }
  const leadingRows = segment.slice(0, firstWork.rowIndex);
  const leadingParts = firstWorkSourceRow.parts.slice(0, firstWork.partIndex);
  if (leadingParts.length > 0) {
    const leadingRow = rowWithParts(firstWorkSourceRow, leadingParts, "before-processed");
    if (timelineRowHasRenderableContent(leadingRow)) {
      leadingRows.push(leadingRow);
    }
  }
  const firstGroupedRow = rowWithParts(
    firstWorkSourceRow,
    firstWorkSourceRow.parts.slice(firstWork.partIndex),
    "processed-start",
  );
  const groupableRows = [firstGroupedRow, ...segment.slice(firstWork.rowIndex + 1)]
    .filter(timelineRowHasRenderableContent);
  const lastWork = lastWorkPartLocation(groupableRows);
  if (lastWork === null) {
    return segment;
  }
  const finalStart = finalPartLocationAfterWork(groupableRows, lastWork);
  const finalBoundary = finalStart ?? {
    partIndex: 0,
    rowIndex: groupableRows.length,
  };

  const groupedRows: TimelineRow[] = [];
  const finalSourceRow = finalStart === null ? undefined : groupableRows[finalStart.rowIndex];
  if (finalStart !== null && finalSourceRow === undefined) {
    return segment;
  }
  const groupedParts = finalSourceRow?.parts.slice(0, finalStart?.partIndex ?? 0) ?? [];
  const finalParts = finalSourceRow?.parts.slice(finalStart?.partIndex ?? 0) ?? [];
  for (let rowIndex = 0; rowIndex < finalBoundary.rowIndex; rowIndex += 1) {
    const row = groupableRows[rowIndex];
    if (row === undefined) {
      continue;
    }
    if (row.parts.length > 0) {
      groupedRows.push(rowWithParts(row, row.parts, "processed"));
    }
  }
  if (finalSourceRow !== undefined && groupedParts.length > 0) {
    groupedRows.push(rowWithParts(finalSourceRow, groupedParts, "processed"));
  }
  if (!groupedRows.some(timelineRowHasWorkPart)) {
    return segment;
  }

  const collapsedRows = [
    ...leadingRows,
    processedGroupRow(groupedRows, runId),
  ];
  if (finalSourceRow !== undefined && finalStart !== null) {
    const finalRow = finalParts.length === finalSourceRow.parts.length
      ? finalSourceRow
      : finalRowWithParts(finalSourceRow, finalParts);
    if (timelineRowHasRenderableContent(finalRow)) {
      collapsedRows.push(finalRow);
    }
    collapsedRows.push(...groupableRows.slice(finalStart.rowIndex + 1));
  }
  return collapsedRows;
}

function timelineRowStaysOutsideProcessedGroup(
  row: TimelineRow,
  keepMainNarrationOutside: boolean,
): boolean {
  if (timelineRowHasInjectionNotice(row)) {
    return true;
  }
  return (
    keepMainNarrationOutside &&
    timelineRoleIsMainTimelineAgent(row.role) &&
    !timelineRowHasWorkPart(row)
  );
}

function timelineRowHasInjectionNotice(row: TimelineRow): boolean {
  const textParts = row.parts.filter((part): part is TimelineTextPart =>
    part.kind === "text" && part.text.trim().length > 0
  );
  if (textParts.length === 0) {
    return false;
  }
  return textParts.some((part) =>
    part.text.trim().startsWith("Injection applied:") ||
    part.text.trim().startsWith("Injection failed:") ||
    part.text.trim().startsWith("Injection queued:")
  );
}

function firstWorkPartLocation(
  rows: TimelineRow[],
): { rowIndex: number; partIndex: number } | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row === undefined || normalizedRole(row.role) === "user") {
      continue;
    }
    for (let partIndex = 0; partIndex < row.parts.length; partIndex += 1) {
      const part = row.parts[partIndex];
      if (part !== undefined && timelinePartIsWork(part)) {
        return { rowIndex, partIndex };
      }
    }
  }
  return null;
}

function lastWorkPartLocation(
  rows: TimelineRow[],
): { rowIndex: number; partIndex: number } | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (row === undefined) {
      continue;
    }
    for (let partIndex = row.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = row.parts[partIndex];
      if (part !== undefined && timelinePartIsWork(part)) {
        return { partIndex, rowIndex };
      }
    }
  }
  return null;
}

function finalPartLocationAfterWork(
  rows: TimelineRow[],
  lastWork: { rowIndex: number; partIndex: number },
): { rowIndex: number; partIndex: number } | null {
  for (let rowIndex = rows.length - 1; rowIndex >= lastWork.rowIndex; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (row === undefined) {
      continue;
    }
    const partStart = rowIndex === lastWork.rowIndex ? lastWork.partIndex + 1 : 0;
    for (let partIndex = row.parts.length - 1; partIndex >= partStart; partIndex -= 1) {
      const part = row.parts[partIndex];
      if (part !== undefined && timelinePartIsFinal(part)) {
        return { partIndex, rowIndex };
      }
    }
  }
  return null;
}

function timelinePartIsWork(part: TimelineRenderPart): boolean {
  return part.kind === "thinking" || part.kind === "tool";
}

function timelinePartIsFinal(part: TimelineRenderPart): boolean {
  if (timelinePartIsWork(part)) {
    return false;
  }
  if (part.kind === "text") {
    return part.text.trim().length > 0;
  }
  return part.kind === "media";
}

function timelineRowHasWorkPart(row: TimelineRow): boolean {
  return row.parts.some(timelinePartIsWork);
}

function rowWithParts(
  row: TimelineRow,
  parts: TimelineRenderPart[],
  keySuffix: string,
): TimelineRow {
  const stableParts = parts.map((part) =>
    part.kind === "text" ? terminalTextPartWithoutReveal(part) : part,
  );
  const text = rowCopyText(stableParts);
  return {
    key: `${row.key}:${keySuffix}`,
    role: row.role,
    instanceId: row.instanceId,
    text,
    kind: row.kind,
    injection: row.injection,
    parts: stableParts,
    historyDivider: row.historyDivider,
    roundMarker: row.roundMarker,
    runId: row.runId,
    source: row.source,
    copyable: isAnswerRole(row.role) &&
      text.trim().length > 0 &&
      stableParts.every((part) => part.kind === "text"),
  };
}

function finalRowWithParts(
  row: TimelineRow,
  parts: TimelineRenderPart[],
): TimelineRow {
  const nextRow = rowWithParts(row, parts, "final");
  const runtimeKey = runtimeFinalRowAnchorKey(row.key);
  if (runtimeKey === null) {
    return nextRow;
  }
  return {
    ...nextRow,
    key: runtimeKey,
  };
}

function runtimeFinalRowAnchorKey(key: string): string | null {
  if (!key.startsWith("runtime-text:") && !key.startsWith("runtime:")) {
    return null;
  }
  return key
    .replace(/:processed-start(?::processed)?$/u, "")
    .replace(/:processed$/u, "");
}

function mergeRuntimeThinkingRowsIntoHydratedRows(
  hydratedRows: TimelineRow[],
  runtimeRows: TimelineRow[],
): TimelineRow[] {
  const runtimeThinkingRows = runtimeRows
    .map((row, index) => ({ index, row, thinking: singleThinkingPart(row) }))
    .filter((item): item is {
      index: number;
      row: TimelineRow;
      thinking: TimelineThinkingPart;
    } => item.thinking !== null && item.row.runId !== null);
  if (runtimeThinkingRows.length === 0) {
    return [...hydratedRows, ...runtimeRows];
  }

  const consumedRuntimeIndexes = new Set<number>();
  const nextHydratedRows = hydratedRows.map((row) => {
    const runId = row.runId?.trim() ?? "";
    if (!row.parts.some((part) => part.kind === "thinking")) {
      return row;
    }
    let changed = false;
    const rowThinkingPartCount = row.parts.filter((part) => part.kind === "thinking")
      .length;
    const nextParts = row.parts.map((part) => {
      if (part.kind !== "thinking") {
        return part;
      }
      const runtimeItem = runtimeThinkingMergeItem(
        runtimeThinkingRows,
        consumedRuntimeIndexes,
        runId,
        part.partIndex,
        rowThinkingPartCount,
      );
      if (runtimeItem === undefined) {
        return part;
      }
      consumedRuntimeIndexes.add(runtimeItem.index);
      const text = joinHydratedThinkingText(
        part.text,
        runtimeItem.thinking.text,
      );
      changed = true;
      return {
        ...part,
        streaming: runtimeItem.thinking.streaming,
        text,
      };
    });
    return changed
      ? {
          ...row,
          key: `${row.key}:runtime-thinking`,
          parts: nextParts,
          text: rowCopyText(nextParts),
        }
      : row;
  });

  const remainingRuntimeRows = runtimeRows.filter((_, index) =>
    !consumedRuntimeIndexes.has(index),
  );
  return [...nextHydratedRows, ...remainingRuntimeRows];
}

function mergeRuntimeRowsIntoHydratedRows(
  hydratedRows: TimelineRow[],
  runtimeRows: TimelineRow[],
): TimelineRow[] {
  const runtimeRowsByIdentity = new Map<string, TimelineRow>();
  for (const row of runtimeRows) {
    if (row.injection === undefined) {
      continue;
    }
    for (const key of timelineInjectionIdentityKeys(row.runId, row.injection)) {
      runtimeRowsByIdentity.set(key, row);
    }
  }
  const remainingHydratedRows = hydratedRows.filter((hydratedRow) => {
    if (hydratedRow.injection === undefined) {
      return true;
    }
    const runtimeRow = timelineInjectionIdentityKeys(
      hydratedRow.runId,
      hydratedRow.injection,
    )
      .map((key) => runtimeRowsByIdentity.get(key))
      .find((row): row is TimelineRow => row !== undefined);
    if (
      runtimeRow === undefined ||
      !timelineInjectionRecipientsMatch(runtimeRow.injection, hydratedRow.injection)
    ) {
      return true;
    }
    mergeHydratedInjectionIntoRuntimeRow(runtimeRow, hydratedRow);
    return false;
  });
  return mergeRuntimeThinkingRowsIntoHydratedRows(
    remainingHydratedRows,
    runtimeRows,
  );
}

function timelineInjectionRecipientsMatch(
  runtimeInjection: TimelineInjectionRow | undefined,
  persistedInjection: TimelineInjectionRow,
): boolean {
  const runtimeRecipient = runtimeInjection?.recipientInstanceId ?? "";
  const persistedRecipient = persistedInjection.recipientInstanceId;
  return (
    runtimeRecipient.length === 0 ||
    persistedRecipient.length === 0 ||
    runtimeRecipient === persistedRecipient
  );
}

function mergeHydratedInjectionIntoRuntimeRow(
  runtimeRow: TimelineRow,
  hydratedRow: TimelineRow,
): void {
  const runtimeInjection = runtimeRow.injection;
  const hydratedInjection = hydratedRow.injection;
  if (runtimeInjection === undefined || hydratedInjection === undefined) {
    return;
  }
  const priority: Record<TimelineInjectionRow["status"], number> = {
    applied: 2,
    failed: 3,
    queued: 1,
  };
  const useHydratedState =
    priority[hydratedInjection.status] >= priority[runtimeInjection.status];
  runtimeRow.injection = {
    ...mergedTimelineInjectionRow(runtimeInjection, hydratedInjection),
    status: useHydratedState ? hydratedInjection.status : runtimeInjection.status,
  };
  if (useHydratedState) {
    runtimeRow.parts = hydratedRow.parts;
    runtimeRow.text = hydratedRow.text;
  }
}

function mergeTerminalRuntimeTextRowsIntoPersistedAnswers(
  rows: TimelineRow[],
): TimelineRow[] {
  const runtimeCandidates = rows
    .map((row, index) => ({
      index,
      row,
      text: normalizedTimelineText(rowCopyText(row.parts)),
    }))
    .filter((candidate) => terminalRuntimeTextCandidate(candidate.row, candidate.text));
  if (runtimeCandidates.length === 0) {
    return rows;
  }

  const consumedRuntimeIndexes = new Set<number>();
  const mergedRows = rows.map((row) => {
    if (!persistedAnswerRowCanHydrateRuntimeText(row)) {
      return row;
    }
    const candidate = bestRuntimeTextCandidateForPersistedAnswer(
      row,
      runtimeCandidates,
      consumedRuntimeIndexes,
    );
    if (candidate === undefined) {
      return row;
    }
    consumedRuntimeIndexes.add(candidate.index);
    const persistedText = normalizedTimelineText(rowCopyText(row.parts));
    if (
      timelineRowHasRevealContent(candidate.row) &&
      runtimeTextIsStrictPrefixOfPersistedAnswer(candidate.text, persistedText)
    ) {
      return persistedRowWithRuntimeRevealParts(row, candidate.row);
    }
    return persistedRowWithRuntimeTextAnchor(row, candidate.row);
  });

  if (consumedRuntimeIndexes.size === 0) {
    return rows;
  }
  return mergedRows.filter((_, index) => !consumedRuntimeIndexes.has(index));
}

function dropStrictPrefixAnswerRows(rows: TimelineRow[]): TimelineRow[] {
  const answerRows = rows
    .flatMap((row) => row.processedGroup?.rows ?? [row])
    .filter(textOnlyAnswerRow)
    .map((row, index) => ({
      groupKey: strictPrefixAnswerGroupKey(row),
      index,
      row,
      text: normalizedTimelineText(rowCopyText(row.parts)),
    }))
    .filter((candidate) => candidate.text.length > 0);
  if (answerRows.length < 2) {
    return rows;
  }
  const rowsToDrop = indexesWithLongerStrictPrefix(answerRows);
  const rowIndexes = new Map(
    answerRows.map((candidate) => [candidate.row, candidate.index]),
  );
  const rowShouldRemain = (row: TimelineRow): boolean => {
    const index = rowIndexes.get(row);
    return index === undefined || !rowsToDrop.has(index);
  };
  return rows.flatMap((row) => {
    if (row.processedGroup === undefined) {
      return rowShouldRemain(row) ? [row] : [];
    }
    const groupedRows = row.processedGroup.rows.filter(rowShouldRemain);
    if (groupedRows.length === 0) {
      return [];
    }
    return [{
      ...row,
      processedGroup: {
        ...row.processedGroup,
        rows: groupedRows,
      },
    }];
  });
}

function strictPrefixAnswerGroupKey(row: TimelineRow): string {
  const runId = row.runId?.trim() ?? "";
  if (runId.length > 0) {
    return `run:${runId}`;
  }
  return `role:${stableTimelineRole(row.role)}`;
}

function dedupeTimelineRowsByKey(rows: TimelineRow[]): TimelineRow[] {
  const candidates = rows.flatMap((row) => row.processedGroup?.rows ?? [row]);
  const prefixCandidates = candidates.flatMap((candidate, index) => {
    if (candidate.parts.some((part) => part.kind !== "text")) {
      return [];
    }
    const text = normalizedTimelineText(rowCopyText(candidate.parts));
    return text.length === 0
      ? []
      : [{ groupKey: timelineRowRenderIdentity(candidate), index, text }];
  });
  const indexesToDrop = indexesWithLongerStrictPrefix(prefixCandidates);
  const rowsToDrop = new Set(
    Array.from(indexesToDrop).flatMap((index) => {
      const row = candidates[index];
      return row === undefined ? [] : [row];
    }),
  );

  const emittedCounts = new Map<string, number>();
  const stabilizeRow = (row: TimelineRow): TimelineRow | null => {
    if (rowsToDrop.has(row)) {
      return null;
    }
    const identity = timelineRowRenderIdentity(row);
    const occurrence = emittedCounts.get(identity) ?? 0;
    emittedCounts.set(identity, occurrence + 1);
    if (occurrence === 0) {
      return row;
    }
    return {
      ...row,
      key: `${row.key}:segment:${occurrence}`,
    };
  };

  return rows.flatMap((row) => {
    if (row.processedGroup === undefined) {
      const stabilized = stabilizeRow(row);
      return stabilized === null ? [] : [stabilized];
    }
    const groupedRows = row.processedGroup.rows.flatMap((groupedRow) => {
      const stabilized = stabilizeRow(groupedRow);
      return stabilized === null ? [] : [stabilized];
    });
    if (groupedRows.length === 0) {
      return [];
    }
    return [{
      ...row,
      processedGroup: {
        ...row.processedGroup,
        rows: groupedRows,
      },
    }];
  });
}

function timelineRowRenderIdentity(row: TimelineRow): string {
  return `${row.runId?.trim() ?? ""}\u0000${row.key}`;
}

function textOnlyAnswerRow(row: TimelineRow): boolean {
  return isAnswerRole(row.role) && row.parts.every((part) => part.kind === "text");
}

function persistedRowsWithRuntimeTextAnchors(
  persistedRows: TimelineRow[],
  runStates: Record<string, RuntimeRunState>,
): TimelineRow[] {
  let changed = false;
  const nextRows = persistedRows.map((row) => {
    const runtimeHydration = runtimeTextHydrationForPersistedRow(
      row,
      runStates,
    );
    const runtimeAnchorKey = runtimeHydration?.key ?? null;
    if (runtimeAnchorKey === null || runtimeAnchorKey === row.key) {
      if (runtimeHydration?.streaming === true) {
        changed = true;
        return persistedRowWithOpenRuntimeStreaming(row);
      }
      if (runtimeHydration !== null) {
        const closedRow = rowWithoutTextReveal(row);
        if (closedRow !== row) {
          changed = true;
        }
        return closedRow;
      }
      return row;
    }
    changed = true;
    const anchoredRow = {
      ...row,
      key: runtimeAnchorKey,
    };
    return runtimeHydration?.streaming === true
      ? persistedRowWithOpenRuntimeStreaming(anchoredRow)
      : rowWithoutTextReveal(anchoredRow);
  });
  return changed ? nextRows : persistedRows;
}

function persistedRowsWithOpenRoundStreaming(
  persistedRows: TimelineRow[],
  rounds: SessionRound[],
): TimelineRow[] {
  const openRunIds = new Set(
    rounds.flatMap((round) => {
      const runId = round.run_id.trim();
      if (
        runId.length > 0 &&
        !roundHasTerminalStatus(round) &&
        (
          isLiveRoundStatus(round.run_status) ||
          isLiveRoundStatus(round.run_phase)
        )
      ) {
        return [runId];
      }
      return [];
    }),
  );
  if (openRunIds.size === 0) {
    return persistedRows;
  }
  let changed = false;
  const streamedRows = persistedRows.map((row) => {
    const runId = row.runId?.trim() ?? "";
    if (!openRunIds.has(runId) || !persistedAnswerRowCanHydrateRuntimeText(row)) {
      return row;
    }
    changed = true;
    return persistedRowWithOpenRuntimeStreaming(row);
  });
  return changed ? streamedRows : persistedRows;
}

function runtimeTextIsStrictPrefixOfPersistedAnswer(
  runtimeText: string,
  persistedText: string,
): boolean {
  return (
    runtimeText.length > 0 &&
    runtimeText.length < persistedText.length &&
    persistedText.startsWith(runtimeText)
  );
}

interface RuntimeTextHydration {
  key: string | null;
  streaming: boolean;
}

function runtimeTextHydrationForPersistedRow(
  row: TimelineRow,
  runStates: Record<string, RuntimeRunState>,
): RuntimeTextHydration | null {
  if (!persistedAnswerRowCanHydrateRuntimeText(row)) {
    return null;
  }
  const runId = row.runId?.trim() ?? "";
  if (runId.length === 0) {
    return null;
  }
  const runState = runStates[runId];
  if (runState === undefined) {
    return null;
  }
  const streaming = !runtimeRunStateClosesText(runState);
  const hydratedText = normalizedTimelineText(rowCopyText(row.parts));
  const key = sequentialCoveredRuntimeTextAnchorKey(
    runState.entries,
    hydratedText,
  );
  if (streaming) {
    const openText = openRuntimeTextAnchorForHydration(runState.entries);
    if (openText.key !== null) {
      return key === openText.key
        ? {
            key,
            streaming: true,
          }
        : key === null
          ? null
          : {
              key,
              streaming: false,
            };
    }
    if (!openText.hasVisibleContent) {
      return {
        key,
        streaming: true,
      };
    }
    if (key !== null) {
      return {
        key,
        streaming: false,
      };
    }
    return null;
  }
  if (runState.hadVisibleTextStream !== true || key === null) {
    return null;
  }
  return {
    key,
    streaming: false,
  };
}

interface OpenRuntimeTextAnchor {
  hasVisibleContent: boolean;
  key: string | null;
}

function openRuntimeTextAnchorForHydration(
  entries: TimelineEntry[],
): OpenRuntimeTextAnchor {
  let hasVisibleContent = false;
  let openKey: string | null = null;
  let textSegmentSequence = 0;
  const activeGroupSequences = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "text_delta" || entry.kind === "output_delta") {
      const comparisonTexts = runtimeHydrationComparisonTexts(entry);
      if (comparisonTexts.length === 0) {
        continue;
      }
      hasVisibleContent = true;
      const groupKey = runtimeTextGroupKey(entry);
      let sequence = activeGroupSequences.get(groupKey);
      if (sequence === undefined) {
        sequence = textSegmentSequence;
        textSegmentSequence += 1;
        activeGroupSequences.set(groupKey, sequence);
      }
      openKey = runtimeTextRowKey(entry, sequence);
      continue;
    }
    if (runtimeEntryShouldRenderChatContent(entry)) {
      hasVisibleContent = true;
      openKey = null;
    }
    if (runtimeHiddenEntryClosesText(entry)) {
      activeGroupSequences.delete(runtimeTextGroupKey(entry));
      continue;
    }
    activeGroupSequences.delete(runtimeTextGroupKey(entry));
  }
  return {
    hasVisibleContent,
    key: openKey,
  };
}

function persistedRowWithOpenRuntimeStreaming(row: TimelineRow): TimelineRow {
  let changed = false;
  const parts = row.parts.map((part) => {
    if (part.kind !== "text") {
      return part;
    }
    if (part.streaming) {
      return part;
    }
    changed = true;
    return {
      ...part,
      cursorOnly: true,
      streaming: true,
    };
  });
  if (!changed) {
    return {
      ...row,
      copyable: false,
    };
  }
  return {
    ...row,
    copyable: false,
    parts,
    text: rowCopyText(parts),
  };
}

function latestCoveredRuntimeTextAnchorKey(
  entries: TimelineEntry[],
  hydratedText: string,
): string | null {
  if (hydratedText.length === 0) {
    return null;
  }
  let latestAnchorKey: string | null = null;
  let textSegmentSequence = 0;
  const activeGroupSequences = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "text_delta" || entry.kind === "output_delta") {
      const comparisonTexts = runtimeHydrationComparisonTexts(entry);
      if (comparisonTexts.length === 0) {
        continue;
      }
      const groupKey = runtimeTextGroupKey(entry);
      let sequence = activeGroupSequences.get(groupKey);
      if (sequence === undefined) {
        sequence = textSegmentSequence;
        textSegmentSequence += 1;
        activeGroupSequences.set(groupKey, sequence);
      }
      if (comparisonTexts.some((entryText) => hydratedText.includes(entryText))) {
        latestAnchorKey = runtimeTextRowKey(entry, sequence);
      }
      continue;
    }
    if (entry.kind === "run_completed" && runtimeEntryHasStructuredOutput(entry)) {
      const outputText = normalizedTimelineText(runtimeCompletedOutputText(entry));
      if (
        latestAnchorKey === null &&
        outputText.length > 0 &&
        hydratedText.includes(outputText)
      ) {
        latestAnchorKey = `runtime:${entry.id}`;
      }
      activeGroupSequences.delete(runtimeTextGroupKey(entry));
      continue;
    }
    if (runtimeHiddenEntryClosesText(entry)) {
      activeGroupSequences.delete(runtimeTextGroupKey(entry));
      continue;
    }
    activeGroupSequences.delete(runtimeTextGroupKey(entry));
  }
  return latestAnchorKey;
}

function sequentialCoveredRuntimeTextAnchorKey(
  entries: TimelineEntry[],
  hydratedText: string,
): string | null {
  if (hydratedText.length === 0) {
    return null;
  }
  const hydratedCursor = runtimeHydratedTextCursor(hydratedText);
  let latestAnchorKey: string | null = null;
  let textSegmentSequence = 0;
  const activeGroupSequences = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "text_delta" || entry.kind === "output_delta") {
      const comparisonTexts = runtimeHydrationComparisonTexts(entry);
      if (comparisonTexts.length === 0) {
        continue;
      }
      const groupKey = runtimeTextGroupKey(entry);
      let sequence = activeGroupSequences.get(groupKey);
      if (sequence === undefined) {
        sequence = textSegmentSequence;
        textSegmentSequence += 1;
        activeGroupSequences.set(groupKey, sequence);
      }
      if (openRuntimeTextCoveredByHydration(entry, hydratedCursor)) {
        latestAnchorKey = runtimeTextRowKey(entry, sequence);
      }
      continue;
    }
    if (entry.kind === "run_completed" && runtimeEntryHasStructuredOutput(entry)) {
      const outputText = normalizedTimelineText(runtimeCompletedOutputText(entry));
      const normalizedHydratedText = normalizedTimelineText(hydratedText);
      if (
        latestAnchorKey === null &&
        outputText.length > 0 &&
        normalizedHydratedText.startsWith(outputText)
      ) {
        latestAnchorKey = `runtime:${entry.id}`;
      }
      activeGroupSequences.delete(runtimeTextGroupKey(entry));
      continue;
    }
    activeGroupSequences.delete(runtimeTextGroupKey(entry));
  }
  return latestAnchorKey;
}

function persistedRowWithRuntimeTextAnchor(
  persistedRow: TimelineRow,
  runtimeRow: TimelineRow,
): TimelineRow {
  return rowWithoutTextReveal({
    ...persistedRow,
    key: runtimeRow.key,
  });
}

function persistedRowWithRuntimeRevealParts(
  persistedRow: TimelineRow,
  runtimeRow: TimelineRow,
): TimelineRow {
  const runtimeTextParts = runtimeRow.parts.filter(
    (part): part is TimelineTextPart => part.kind === "text",
  );
  if (runtimeTextParts.length === 0) {
    return runtimeRow;
  }
  const workParts = persistedRow.parts.filter((part) => part.kind !== "text");
  return rowWithoutTextReveal({
    ...runtimeRow,
    parts: [...workParts, ...runtimeTextParts],
    text: runtimeRow.text,
  });
}

function rowWithoutTextReveal(row: TimelineRow): TimelineRow {
  let changed = false;
  const parts = row.parts.map((part) => {
    if (part.kind !== "text") {
      return part;
    }
    if (part.reveal !== true && part.streaming !== true) {
      return part;
    }
    changed = true;
    return {
      kind: "text" as const,
      text: part.text,
      streaming: false,
    };
  });
  return changed
    ? {
        ...row,
        parts,
        text: rowCopyText(parts),
      }
    : row;
}

function terminalTextPartWithoutReveal(part: TimelineTextPart): TimelineTextPart {
  if (part.reveal !== true && part.streaming !== true) {
    return part;
  }
  return {
    kind: "text",
    text: part.text,
    streaming: false,
  };
}

function terminalRuntimeTextCandidate(row: TimelineRow, text: string): boolean {
  return (
    row.source === "runtime" &&
    isAnswerRole(row.role) &&
    text.length > 0 &&
    !timelineRowHasStreamingContent(row) &&
    row.parts.length > 0 &&
    row.parts.every((part) => part.kind === "text")
  );
}

function persistedAnswerRowCanHydrateRuntimeText(row: TimelineRow): boolean {
  return (
    row.source === "message" &&
    isAnswerRole(row.role) &&
    normalizedTimelineText(rowCopyText(row.parts)).length > 0
  );
}

function bestRuntimeTextCandidateForPersistedAnswer(
  persistedRow: TimelineRow,
  runtimeCandidates: Array<{
    index: number;
    row: TimelineRow;
    text: string;
  }>,
  consumedRuntimeIndexes: ReadonlySet<number>,
): {
  index: number;
  row: TimelineRow;
  text: string;
} | undefined {
  const persistedText = normalizedTimelineText(rowCopyText(persistedRow.parts));
  const candidates = runtimeCandidates
    .filter((candidate) =>
      !consumedRuntimeIndexes.has(candidate.index) &&
      runtimeTextOverlapsPersistedAnswer(candidate.text, persistedText) &&
      runtimeTextCandidateCanMatchPersistedAnswer(candidate.row, persistedRow, candidate.text),
    )
    .sort((left, right) =>
      runtimeTextCandidateScore(right.row, persistedRow, right.text) -
      runtimeTextCandidateScore(left.row, persistedRow, left.text),
    );
  return candidates.at(0);
}

function runtimeTextOverlapsPersistedAnswer(
  runtimeText: string,
  persistedText: string,
): boolean {
  if (runtimeText.length === 0 || persistedText.length === 0) {
    return false;
  }
  if (persistedText.includes(runtimeText) || runtimeText.includes(persistedText)) {
    return true;
  }
  if (!runtimeText.startsWith(persistedText)) {
    return false;
  }
  const repeatedTail = runtimeText.slice(persistedText.length);
  return (
    repeatedTail.length > 0 &&
    repeatedTail.length < persistedText.length &&
    persistedText.startsWith(repeatedTail)
  );
}

function runtimeTextCandidateCanMatchPersistedAnswer(
  runtimeRow: TimelineRow,
  persistedRow: TimelineRow,
  runtimeText: string,
): boolean {
  if (timelineRowsShareRunId(runtimeRow, persistedRow)) {
    return true;
  }
  return (
    runtimeText.length >= 6 &&
    stableTimelineRole(runtimeRow.role) === stableTimelineRole(persistedRow.role)
  );
}

function runtimeTextCandidateScore(
  runtimeRow: TimelineRow,
  persistedRow: TimelineRow,
  runtimeText: string,
): number {
  const runScore = timelineRowsShareRunId(runtimeRow, persistedRow) ? 100_000 : 0;
  return runScore + runtimeText.length;
}

function timelineRowsShareRunId(left: TimelineRow, right: TimelineRow): boolean {
  const leftRunId = left.runId?.trim() ?? "";
  const rightRunId = right.runId?.trim() ?? "";
  return leftRunId.length > 0 && leftRunId === rightRunId;
}

function runtimeThinkingMergeItem(
  runtimeThinkingRows: Array<{
    index: number;
    row: TimelineRow;
    thinking: TimelineThinkingPart;
  }>,
  consumedRuntimeIndexes: ReadonlySet<number>,
  runId: string,
  partIndex: string,
  rowThinkingPartCount: number,
): {
  index: number;
  row: TimelineRow;
  thinking: TimelineThinkingPart;
} | undefined {
  const candidates = runtimeThinkingRows.filter((item) =>
    !consumedRuntimeIndexes.has(item.index),
  );
  const exactMatch = candidates.find((item) =>
    item.row.runId === runId && item.thinking.partIndex === partIndex,
  );
  if (exactMatch !== undefined) {
    return exactMatch;
  }
  const runMatches = candidates.filter((item) => item.row.runId === runId);
  if (runId.length > 0 && rowThinkingPartCount === 1 && runMatches.length === 1) {
    return runMatches[0];
  }
  if (runId.length === 0 && rowThinkingPartCount === 1 && candidates.length === 1) {
    return candidates[0];
  }
  return undefined;
}

function singleThinkingPart(row: TimelineRow): TimelineThinkingPart | null {
  if (row.source !== "runtime") {
    return null;
  }
  const thinkingParts = row.parts.filter(
    (part): part is TimelineThinkingPart => part.kind === "thinking",
  );
  if (thinkingParts.length !== 1) {
    return null;
  }
  const hasOtherVisibleParts = row.parts.some((part) =>
    part.kind !== "thinking" && timelinePartVisibleText(part).trim().length > 0,
  );
  if (hasOtherVisibleParts) {
    return null;
  }
  const part = thinkingParts[0];
  if (part.text.trim().length === 0) {
    return null;
  }
  return part;
}

function timelinePartVisibleText(part: TimelineRenderPart): string {
  if (part.kind === "text" || part.kind === "thinking") {
    return part.text;
  }
  if (part.kind === "tool") {
    return [part.toolName, part.body].join(" ");
  }
  return [part.name, part.url].join(" ");
}

function joinHydratedThinkingText(hydratedText: string, runtimeText: string): string {
  const base = hydratedText.trimEnd();
  const continuation = runtimeText.trimStart();
  if (base.length === 0) {
    return runtimeText;
  }
  if (continuation.length === 0) {
    return hydratedText;
  }
  if (continuation.startsWith(base)) {
    return runtimeText;
  }
  if (base.includes(continuation)) {
    return hydratedText;
  }
  return `${base} ${continuation}`;
}

function processedGroupRow(rows: TimelineRow[], runId: string): TimelineRow {
  const firstKey = rows[0]?.key ?? "start";
  const lastKey = rows.at(-1)?.key ?? "end";
  return {
    key: `processed:${runId}:${firstKey}:${lastKey}`,
    role: "processed",
    text: "",
    kind: "processed",
    parts: [],
    processedGroup: { rows },
    roundMarker: null,
    runId,
    source: "message",
    copyable: false,
  };
}

function insertPlainRoundMarkerRows(
  baseRows: TimelineRow[],
  rounds: SessionRound[],
): TimelineRow[] {
  const markersByRunId = new Map<string, TimelineRow>();
  rounds.forEach((round, index) => {
    const runId = round.run_id.trim();
    if (runId.length > 0) {
      markersByRunId.set(runId, roundMarkerRow(round, index));
    }
  });
  if (markersByRunId.size === 0) {
    return baseRows;
  }

  const insertedRunIds = new Set<string>();
  const rows: TimelineRow[] = [];
  for (const row of baseRows) {
    const runId = row.runId;
    if (runId !== null && !insertedRunIds.has(runId)) {
      const marker = markersByRunId.get(runId);
      if (marker !== undefined) {
        rows.push(marker);
        insertedRunIds.add(runId);
      }
    }
    rows.push(row);
  }
  for (const [runId, marker] of markersByRunId) {
    if (!insertedRunIds.has(runId) && roundMarkerCanStandAlone(marker.roundMarker?.round)) {
      rows.push(marker);
    }
  }
  return rows;
}

function roundMarkerCanStandAlone(round: SessionRound | undefined): boolean {
  const status = round?.run_status?.trim().toLowerCase() ?? "";
  const phase = round?.run_phase?.trim().toLowerCase() ?? "";
  return (
    status === "running" ||
    status === "queued" ||
    status === "pending" ||
    phase === "connecting" ||
    phase === "running"
  );
}

function insertHistoryDividerRows(
  baseRows: TimelineRow[],
  rounds: SessionRound[],
  expandedHistorySegmentIds: ReadonlySet<string>,
): TimelineRow[] {
  const boundaries = rounds.flatMap((round, index) => {
    const runId = round.run_id.trim();
    return runId.length > 0 && roundHasClearMarker(round)
      ? [{ index, round, runId }]
      : [];
  });
  if (boundaries.length === 0) {
    return baseRows;
  }

  const rows: TimelineRow[] = [];
  let segmentStart = 0;
  for (const boundary of boundaries) {
    const boundaryIndex = baseRows.findIndex((row, index) => (
      index >= segmentStart &&
      row.runId === boundary.runId &&
      row.roundMarker?.round.run_id.trim() === boundary.runId
    ));
    if (boundaryIndex < 0) {
      continue;
    }
    const segmentRows = baseRows.slice(segmentStart, boundaryIndex);
    if (segmentRows.length > 0) {
      const divider = historyDividerRow(
        boundary.round,
        boundary.index,
        segmentRows,
        expandedHistorySegmentIds,
      );
      if (divider.historyDivider?.expanded === true) {
        rows.push(...segmentRows, divider);
      } else {
        rows.push(divider);
      }
    }
    segmentStart = boundaryIndex;
  }
  rows.push(...baseRows.slice(segmentStart));
  return rows;
}

function visibleRoundRailRounds(
  rounds: SessionRound[],
  expandedHistorySegmentIds: ReadonlySet<string>,
): SessionRound[] {
  const visibleRounds: SessionRound[] = [];
  let segmentRounds: SessionRound[] = [];
  for (const round of rounds) {
    const runId = round.run_id.trim();
    if (runId.length > 0 && roundHasClearMarker(round)) {
      const segmentId = `history-before:${runId}`;
      if (expandedHistorySegmentIds.has(segmentId)) {
        visibleRounds.push(...segmentRounds);
      }
      segmentRounds = [];
    }
    segmentRounds.push(round);
  }
  visibleRounds.push(...segmentRounds);
  return visibleRounds;
}

function roundMarkerRow(round: SessionRound, index: number): TimelineRow {
  const runId = round.run_id.trim();
  const title = roundTitle(round, index);
  return {
    key: `round:${runId}`,
    role: "round",
    text: title,
    kind: "round",
    parts: [],
    roundMarker: { index, round },
    runId,
    source: "message",
    copyable: false,
  };
}

function historyDividerRow(
  round: SessionRound,
  index: number,
  segmentRows: TimelineRow[],
  expandedHistorySegmentIds: ReadonlySet<string>,
): TimelineRow {
  const runId = round.run_id.trim();
  const title = roundTitle(round, index);
  const segmentId = `history-before:${runId}`;
  const hiddenRunIds = new Set(
    segmentRows.flatMap((row) => (row.runId === null ? [] : [row.runId])),
  );
  const hiddenRoundCount = segmentRows.filter((row) => row.roundMarker !== null).length
    || hiddenRunIds.size;
  const hiddenMessageCount = segmentRows.filter((row) => (
    row.roundMarker === null &&
    row.historyDivider === undefined &&
    timelineRowHasRenderableContent(row)
  )).length;
  return {
    key: `history:${segmentId}`,
    role: "history",
    text: title,
    kind: "round",
    parts: [],
    historyDivider: {
      expanded: expandedHistorySegmentIds.has(segmentId),
      hiddenMessageCount,
      hiddenRoundCount,
      markerTitle: title,
      segmentId,
    },
    roundMarker: null,
    runId,
    source: "message",
    copyable: false,
  };
}

function mergeToolRowsByCallId(
  rows: TimelineRow[],
  options: { dedupeNonToolRows?: boolean } = {},
): TimelineRow[] {
  const dedupeNonToolRows = options.dedupeNonToolRows ?? true;
  const mergedRows: TimelineRow[] = [];
  const toolRowsByKey = new Map<string, { row: TimelineRow; tool: TimelineToolPart }>();
  for (const originalRow of rows) {
    const row = mergeToolPartsWithinRow(originalRow);
    const keptParts: TimelineRenderPart[] = [];
    const newToolParts: { key: string; tool: TimelineToolPart }[] = [];
    let changed = false;
    for (const part of row.parts) {
      if (!mergeableToolPart(part)) {
        keptParts.push(part);
        continue;
      }
      const key = timelineToolRowMergeKey(row, part);
      if (key === null) {
        keptParts.push(part);
        continue;
      }
      const existing = toolRowsByKey.get(key);
      if (existing === undefined) {
        keptParts.push(part);
        newToolParts.push({ key, tool: part });
        continue;
      }
      mergeToolPartState(existing.tool, part);
      existing.row.text = rowCopyText(existing.row.parts);
      existing.row.copyable = false;
      changed = true;
    }
    const nextRow = changed
      ? {
          ...row,
          copyable: row.copyable && keptParts.every((part) => part.kind === "text"),
          parts: keptParts,
          text: rowCopyText(keptParts),
        }
      : row;
    if (timelineRowHasRenderableContent(nextRow)) {
      mergedRows.push(nextRow);
    }
    for (const { key, tool } of newToolParts) {
      toolRowsByKey.set(key, { row: nextRow, tool });
    }
  }
  return dedupeNonToolRows
    ? dropDuplicateRowsAfterToolMerge(mergedRows)
    : mergedRows;
}

function mergeToolPartsWithinRow(row: TimelineRow): TimelineRow {
  const toolPartsByKey = new Map<string, TimelineToolPart>();
  const mergedParts: TimelineRenderPart[] = [];
  let changed = false;
  for (const part of row.parts) {
    if (!mergeableToolPart(part)) {
      mergedParts.push(part);
      continue;
    }
    const key = part.callId.trim();
    const existing = toolPartsByKey.get(key);
    if (existing === undefined) {
      toolPartsByKey.set(key, part);
      mergedParts.push(part);
      continue;
    }
    mergeToolPartState(existing, part);
    changed = true;
  }
  if (!changed) {
    return row;
  }
  return {
    ...row,
    copyable: row.copyable && mergedParts.every((part) => part.kind === "text"),
    parts: mergedParts,
    text: rowCopyText(mergedParts),
  };
}

function mergeableToolPart(part: TimelineRenderPart): part is TimelineToolPart {
  return (
    part.kind === "tool" &&
    part.callId.trim().length > 0 &&
    part.phase !== "approval-requested" &&
    part.phase !== "approval-resolved"
  );
}

function dropDuplicateRowsAfterToolMerge(rows: TimelineRow[]): TimelineRow[] {
  const seenNonToolContent = new Set<string>();
  const dedupedRows: TimelineRow[] = [];
  for (const row of rows) {
    const dedupeKey = timelineRowNonToolContentDedupeKey(row);
    const hasTool = row.parts.some((part) => part.kind === "tool");
    if (!hasTool && dedupeKey !== null && seenNonToolContent.has(dedupeKey)) {
      continue;
    }
    dedupedRows.push(row);
    if (dedupeKey !== null) {
      seenNonToolContent.add(dedupeKey);
    }
  }
  return dedupedRows;
}

function dropDuplicateWorkRowsAfterToolMerge(rows: TimelineRow[]): TimelineRow[] {
  const seenWorkContent = new Set<string>();
  const dedupedRows: TimelineRow[] = [];
  for (const row of rows) {
    const workDedupeKey = timelineRowWorkContentDedupeKey(row);
    if (workDedupeKey !== null && seenWorkContent.has(workDedupeKey)) {
      const remainingParts = row.parts.filter((part) => part.kind !== "thinking");
      if (remainingParts.length === 0 || remainingParts.every(timelinePartIsWork)) {
        continue;
      }
      const dedupedRow = rowWithParts(row, remainingParts, "deduped-work");
      if (timelineRowHasRenderableContent(dedupedRow)) {
        dedupedRows.push(dedupedRow);
      }
      continue;
    }
    dedupedRows.push(row);
    if (workDedupeKey !== null) {
      seenWorkContent.add(workDedupeKey);
    }
  }
  return dedupedRows;
}

function dropDuplicateFinalPartsFromWorkRows(rows: TimelineRow[]): TimelineRow[] {
  const standaloneFinalKeys = new Set<string>();
  for (const row of rows) {
    if (timelineRowHasWorkPart(row)) {
      continue;
    }
    for (const key of timelineRowFinalTextDedupeKeys(row)) {
      standaloneFinalKeys.add(key);
    }
  }
  if (standaloneFinalKeys.size === 0) {
    return rows;
  }
  return rows.flatMap((row) => {
    if (!timelineRowHasWorkPart(row)) {
      return [row];
    }
    const remainingParts = row.parts.filter((part) => {
      if (part.kind !== "text") {
        return true;
      }
      return !standaloneFinalKeys.has(timelineRowPartTextDedupeKey(row, part.text));
    });
    if (remainingParts.length === row.parts.length) {
      return [row];
    }
    if (remainingParts.length === 0) {
      return [];
    }
    const dedupedRow = rowWithParts(row, remainingParts, "deduped-final");
    return timelineRowHasRenderableContent(dedupedRow) ? [dedupedRow] : [];
  });
}

function timelineRowNonToolContentDedupeKey(row: TimelineRow): string | null {
  const runId = row.runId?.trim() ?? "";
  if (runId.length === 0) {
    return null;
  }
  const text = normalizedTimelineText(
    row.parts
      .map(timelineNonToolPartDedupeText)
      .filter((partText) => partText.length > 0)
      .join("\n\n"),
  );
  if (text.length === 0) {
    return null;
  }
  return [
    runId,
    stableTimelineRole(row.role),
    row.instanceId ?? "",
    text,
  ].join(":");
}

function timelineRowFinalTextDedupeKeys(row: TimelineRow): string[] {
  return row.parts.flatMap((part) => {
    if (part.kind !== "text") {
      return [];
    }
    const text = normalizedTimelineText(part.text);
    return text.length > 0 ? [timelineRowPartTextDedupeKey(row, text)] : [];
  });
}

function timelineRowPartTextDedupeKey(row: TimelineRow, text: string): string {
  return [
    row.runId?.trim() ?? "",
    stableTimelineRole(row.role),
    row.instanceId ?? "",
    normalizedTimelineText(text),
  ].join(":");
}

function timelineRowWorkContentDedupeKey(row: TimelineRow): string | null {
  const runId = row.runId?.trim() ?? "";
  if (runId.length === 0) {
    return null;
  }
  const text = normalizedTimelineText(
    row.parts
      .map(timelineWorkPartDedupeText)
      .filter((partText) => partText.length > 0)
      .join("\n\n"),
  );
  if (text.length === 0) {
    return null;
  }
  return [
    runId,
    stableTimelineRole(row.role),
    row.instanceId ?? "",
    text,
  ].join(":");
}

function dropPersistedRowsCoveredByTerminalRuntime(
  persistedRows: TimelineRow[],
  runtimeRows: TimelineRow[],
  runStates: Record<string, RuntimeRunState>,
): TimelineRow[] {
  const terminalRuntimeTextsByRunId = new Map<string, Set<string>>();
  const openRuntimeTextRunIds = new Set<string>();
  const openRuntimeTextsByRunId = new Map<string, string[]>();
  const hydratedOpenRuntimeTextRunIds = new Set<string>();
  for (const row of runtimeRows) {
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0 || row.source !== "runtime") {
      continue;
    }
    const hasHydratedOpenText = row.parts.some(
      (part) =>
        part.kind === "text" &&
        part.streaming &&
        part.text.trim().length === 0,
    );
    if (hasHydratedOpenText) {
      hydratedOpenRuntimeTextRunIds.add(runId);
    }
    const hasOpenText = row.parts.some(
      (part) =>
        part.kind === "text" &&
        part.streaming &&
        part.text.trim().length > 0,
    );
    if (hasOpenText) {
      openRuntimeTextRunIds.add(runId);
      const openText = normalizedTimelineText(rowCopyText(row.parts));
      if (openText.length > 0) {
        const texts = openRuntimeTextsByRunId.get(runId) ?? [];
        texts.push(openText);
        openRuntimeTextsByRunId.set(runId, texts);
      }
      continue;
    }
    const text = normalizedTimelineText(rowCopyText(row.parts));
    if (text.length === 0) {
      continue;
    }
    const texts = terminalRuntimeTextsByRunId.get(runId) ?? new Set<string>();
    texts.add(text);
    terminalRuntimeTextsByRunId.set(runId, texts);
  }
  if (terminalRuntimeTextsByRunId.size === 0 && openRuntimeTextRunIds.size === 0) {
    return persistedRows;
  }
  return persistedRows.filter((row) => {
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0) {
      return true;
    }
    if (
      openRuntimeTextRunIds.has(runId) &&
      !hydratedOpenRuntimeTextRunIds.has(runId) &&
      !openRuntimeRunHasPersistedTextPrefix(runStates[runId], row) &&
      runStates[runId]?.status !== "closed" &&
      row.parts.every((part) => part.kind === "text") &&
      persistedAnswerRowCanHydrateRuntimeText(row)
    ) {
      const persistedText = normalizedTimelineText(rowCopyText(row.parts));
      const openTexts = openRuntimeTextsByRunId.get(runId) ?? [];
      return !openTexts.some((openText) =>
        runtimeTextOverlapsPersistedAnswer(openText, persistedText),
      );
    }
    if (row.parts.some((part) => part.kind !== "text")) {
      return true;
    }
    const terminalTexts = terminalRuntimeTextsByRunId.get(runId);
    if (terminalTexts === undefined) {
      return true;
    }
    const text = normalizedTimelineText(rowCopyText(row.parts));
    return text.length === 0 || !terminalTexts.has(text);
  });
}

function dropCoveredCursorOnlyRows(rows: TimelineRow[]): TimelineRow[] {
  const runsWithVisibleRuntimeContent = new Set<string>();
  for (const row of rows) {
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0 || timelineRowIsCursorOnly(row)) {
      continue;
    }
    if (timelineRowHasVisibleRuntimeContent(row)) {
      runsWithVisibleRuntimeContent.add(runId);
    }
  }
  if (runsWithVisibleRuntimeContent.size === 0) {
    return rows;
  }
  return rows.filter((row) => {
    const runId = row.runId?.trim() ?? "";
    return (
      runId.length === 0 ||
      !timelineRowIsCursorOnly(row) ||
      !runsWithVisibleRuntimeContent.has(runId)
    );
  });
}

function timelineRowIsCursorOnly(row: TimelineRow): boolean {
  if (row.parts.length !== 1) {
    return false;
  }
  const [part] = row.parts;
  return (
    part?.kind === "text" &&
    part.cursorOnly === true &&
    part.text.trim().length === 0
  );
}

function timelineRowHasVisibleRuntimeContent(row: TimelineRow): boolean {
  return row.parts.some((part) => {
    if (part.kind === "text") {
      return part.cursorOnly !== true && part.text.trim().length > 0;
    }
    return false;
  });
}

function openRuntimeRunHasPersistedTextPrefix(
  runState: RuntimeRunState | undefined,
  persistedRow: TimelineRow,
): boolean {
  if (runState === undefined || runState.status === "closed") {
    return false;
  }
  const targetText = normalizedTimelineText(rowCopyText(persistedRow.parts));
  if (targetText.length === 0) {
    return false;
  }
  let accumulatedText = "";
  for (const entry of runState.entries) {
    if (entry.kind === "text_delta" || entry.kind === "output_delta") {
      const entryText = runtimeHydrationComparisonTexts(entry).join(" ");
      if (entryText.length === 0) {
        continue;
      }
      accumulatedText = normalizedTimelineText(
        [accumulatedText, entryText].filter(Boolean).join(" "),
      );
      if (!targetText.startsWith(accumulatedText)) {
        return false;
      }
      if (accumulatedText === targetText) {
        return true;
      }
      continue;
    }
    if (accumulatedText.length > 0) {
      return false;
    }
  }
  return false;
}

function timelineNonToolPartDedupeText(part: TimelineRenderPart): string {
  if (part.kind === "text" || part.kind === "thinking") {
    return part.text;
  }
  if (part.kind === "media") {
    return part.url;
  }
  return "";
}

function timelineWorkPartDedupeText(part: TimelineRenderPart): string {
  if (part.kind === "thinking") {
    return part.text;
  }
  return "";
}

function timelineToolRowMergeKey(
  row: TimelineRow,
  tool: TimelineToolPart,
): string | null {
  const runId = row.runId?.trim() ?? "";
  const callId = tool.callId.trim();
  if (runId.length === 0 || callId.length === 0) {
    return null;
  }
  return `${runId}:${callId}`;
}

function mergeToolPartState(
  existing: TimelineToolPart,
  next: TimelineToolPart,
): void {
  if (next.phase === "call") {
    existing.inputBody = next.inputBody || next.body || existing.inputBody;
    existing.body = appendToolCallArgsToResultBody(existing.body, next.body);
    if (existing.toolName === "unknown_tool" && next.toolName !== "unknown_tool") {
      existing.toolName = next.toolName;
    }
    existing.subagent = mergeSubagentReference(existing.subagent, next.subagent);
    return;
  }
  const argsBody = existing.phase === "call" ? existing.body : "";
  const nextBody = next.body.trim().length > 0 ? next.body : existing.body;
  existing.action = next.action || existing.action;
  existing.body = argsBody
    ? appendToolCallArgsToResultBody(nextBody, argsBody)
    : nextBody;
  existing.error = next.error;
  existing.inputBody = existing.inputBody || argsBody || next.inputBody;
  existing.mediaParts = next.mediaParts.length > 0
    ? next.mediaParts
    : existing.mediaParts;
  existing.phase = next.phase;
  existing.outputBody = next.outputBody || nextBody || existing.outputBody;
  existing.subagent = mergeSubagentReference(existing.subagent, next.subagent);
  existing.toolName = next.toolName || existing.toolName;
}

function mergeSubagentReference(
  existing: TimelineSubagentReference | null,
  next: TimelineSubagentReference | null,
): TimelineSubagentReference | null {
  if (existing === null) {
    return next;
  }
  if (next === null) {
    return existing;
  }
  return {
    createdAt: next.createdAt || existing.createdAt,
    description: next.description || existing.description,
    instanceId: next.instanceId || existing.instanceId,
    interactive: next.interactive ?? existing.interactive,
    lastEventId: next.lastEventId ?? existing.lastEventId,
    prompt: next.prompt || existing.prompt,
    roleId: next.roleId || existing.roleId,
    runId: next.runId || existing.runId,
    runPhase: next.runPhase || existing.runPhase,
    runStatus: next.runStatus || existing.runStatus,
    sessionId: next.sessionId || existing.sessionId,
    status: next.status || existing.status,
    subagentKind: next.subagentKind || existing.subagentKind,
    title: next.title || existing.title,
    updatedAt: next.updatedAt || existing.updatedAt,
  };
}

function roundHasClearMarker(round: SessionRound): boolean {
  const marker = round.clear_marker_before;
  if (marker === undefined || marker === null) {
    return false;
  }
  if (typeof marker === "boolean") {
    return marker;
  }
  if (typeof marker === "string") {
    return marker.trim().length > 0;
  }
  if (typeof marker === "number") {
    return Number.isFinite(marker);
  }
  if (Array.isArray(marker)) {
    return marker.length > 0;
  }
  return Object.keys(marker).length > 0;
}

function runtimeEntriesToRows(
  entries: TimelineEntry[],
  runStates: Record<string, RuntimeRunState>,
  variant: "session" | "subagent-panel",
  terminalRunIdOverrides: ReadonlySet<string> = new Set(),
  terminalScopeOverride = false,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const activeThinking = new Map<string, RuntimeThinkingAccumulator>();
  const activeText = new Map<string, RuntimeTextAccumulator>();
  const injectionRowsByIdentity = new Map<string, TimelineRow>();
  const resolvedToolCallIds = new Set<string>();
  let textSegmentSequence = 0;
  const nextTextSegmentSequence = () => {
    const sequence = textSegmentSequence;
    textSegmentSequence += 1;
    return sequence;
  };
  for (const entry of entries) {
    rememberResolvedRuntimeToolCall(entry, resolvedToolCallIds);
    if (
      entry.kind === "background_task_updated" &&
      applyRuntimeBackgroundTaskUpdateEvent(
        entry,
        rows,
        activeText,
        nextTextSegmentSequence,
      )
    ) {
      continue;
    }
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
      closeRuntimeTextSegment(entry, rows, activeText);
      rows.push(runtimeEntryToRow(entry, variant));
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
      closeRuntimeTextSegment(entry, rows, activeText);
      rows.push(runtimeEntryToRow(entry, variant));
      continue;
    }
    if (isThinkingEvent(entry.kind)) {
      closeRuntimeTextSegment(entry, rows, activeText);
      if (!applyRuntimeThinkingEvent(entry, rows, activeThinking)) {
        rows.push(runtimeEntryToRow(entry, variant));
      }
      continue;
    }
    if (entryClosesThinking(entry.kind)) {
      closeActiveThinkingForRun(entry.runId, activeThinking);
    }
    if (mergeRuntimeCompletedOutputIntoActiveText(entry, rows, activeText)) {
      continue;
    }
    if (mergeRuntimeCompletedOutputIntoPreviousTextRow(entry, rows)) {
      continue;
    }
    if (runtimeEntryIsInjection(entry)) {
      closeRuntimeTextSegment(entry, rows, activeText);
      applyRuntimeInjectionEvent(entry, rows, injectionRowsByIdentity);
      if (runtimeInjectionSupersedesPendingToolCalls(entry)) {
        removeSupersededPendingToolRows(rows, entry, resolvedToolCallIds);
      }
      continue;
    }
    if (!runtimeEntryShouldRenderChatContent(entry)) {
      if (runtimeHiddenEntryClosesText(entry)) {
        closeRuntimeTextSegment(entry, rows, activeText, false);
      }
      continue;
    }
    closeRuntimeTextSegment(entry, rows, activeText);
    if (mergeRuntimeToolCallIntoResolvedRow(rows, entry, resolvedToolCallIds)) {
      continue;
    }
    if (mergeRuntimeToolResultIntoPendingRow(rows, entry)) {
      continue;
    }
    rows.push(runtimeEntryToRow(entry, variant));
  }
  closeTerminalRuntimeTextSegments(
    rows,
    activeText,
    runStates,
    terminalRunIdOverrides,
    terminalScopeOverride,
  );
  closeTerminalRuntimeToolCalls(
    rows,
    runStates,
    terminalRunIdOverrides,
    terminalScopeOverride,
  );
  return rows;
}

function applyRuntimeBackgroundTaskUpdateEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  nextTextSegmentSequence: () => number,
): boolean {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return false;
  }
  const delta = objectRawString(payload, "delta");
  if (delta.length === 0) {
    return false;
  }
  return appendRuntimeTextSegment(
    entry,
    delta,
    rows,
    activeText,
    nextTextSegmentSequence,
  );
}

function closeTerminalRuntimeTextSegments(
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  runStates: Record<string, RuntimeRunState>,
  terminalRunIdOverrides: ReadonlySet<string>,
  terminalScopeOverride: boolean,
): void {
  activeText.forEach((existing, groupKey) => {
    const runId = existing.row.runId;
    if (
      runId !== null &&
      (terminalScopeOverride ||
        runtimeRunStateClosesText(runStates[runId]) ||
        terminalRunIdOverrides.has(runId))
    ) {
      closeRuntimeTextAccumulator(rows, existing, false);
      activeText.delete(groupKey);
    }
  });
}

function runtimeRunStateClosesText(
  runState: RuntimeRunState | undefined,
): boolean {
  return (
    runState?.status === "closed" ||
    runState?.status === "failed" ||
    runState?.terminalEventType !== null
  );
}

function closeTerminalRuntimeToolCalls(
  rows: TimelineRow[],
  runStates: Record<string, RuntimeRunState>,
  terminalRunIdOverrides: ReadonlySet<string>,
  terminalScopeOverride: boolean,
): void {
  for (const row of rows) {
    if (row.source !== "runtime" || row.runId === null) {
      continue;
    }
    if (
      !terminalScopeOverride &&
      !runtimeRunStateClosesText(runStates[row.runId]) &&
      !terminalRunIdOverrides.has(row.runId)
    ) {
      continue;
    }
    for (const part of row.parts) {
      if (part.kind === "tool" && part.phase === "call") {
        part.phase = "result";
      }
    }
  }
}

function mergeRuntimeCompletedOutputIntoActiveText(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
): boolean {
  if (entry.kind !== "run_completed" || !runtimeEntryHasStructuredOutput(entry)) {
    return false;
  }
  const existing = activeText.get(runtimeTextGroupKey(entry));
  if (existing === undefined) {
    return false;
  }
  const outputText = runtimeCompletedOutputText(entry);
  if (outputText.length === 0) {
    return false;
  }
  const currentText = normalizedTimelineText(existing.part.text);
  const normalizedOutputText = normalizedTimelineText(outputText);
  if (
    currentText.length > 0 &&
    !normalizedOutputText.includes(currentText)
  ) {
    return false;
  }
  existing.part.text = outputText;
  delete existing.part.reveal;
  existing.row.text = outputText;
  existing.placeholder = false;
  closeRuntimeTextAccumulator(rows, existing, false);
  activeText.delete(runtimeTextGroupKey(entry));
  return true;
}

function mergeRuntimeCompletedOutputIntoPreviousTextRow(
  entry: TimelineEntry,
  rows: TimelineRow[],
): boolean {
  if (entry.kind !== "run_completed" || !runtimeEntryHasStructuredOutput(entry)) {
    return false;
  }
  const outputText = runtimeCompletedOutputText(entry);
  if (outputText.length === 0) {
    return false;
  }
  const outputComparisonText = normalizedTimelineText(outputText);
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (
      row === undefined ||
      row.runId !== entry.runId ||
      row.source !== "runtime" ||
      !isAnswerRole(row.role)
    ) {
      continue;
    }
    const textParts = row.parts.filter(
      (part): part is TimelineTextPart => part.kind === "text",
    );
    if (textParts.length !== row.parts.length || textParts.length !== 1) {
      return false;
    }
    const currentText = normalizedTimelineText(rowCopyText(row.parts));
    if (currentText.length === 0 || !outputComparisonText.includes(currentText)) {
      return false;
    }
    textParts[0].text = outputText;
    delete textParts[0].reveal;
    textParts[0].streaming = false;
    row.text = outputText;
    row.copyable = true;
    return true;
  }
  return false;
}

function runtimeCompletedOutputText(entry: TimelineEntry): string {
  const parts = runtimeOutputParts(entry) ?? [];
  if (parts.some((part) => part.kind !== "text")) {
    return "";
  }
  return parts
    .filter((part): part is TimelineTextPart => part.kind === "text")
    .map((part) => part.text)
    .join("");
}

function rememberResolvedRuntimeToolCall(
  entry: TimelineEntry,
  resolvedToolCallIds: Set<string>,
): void {
  if (
    entry.kind !== "tool_result" &&
    entry.kind !== "tool_input_validation_failed"
  ) {
    return;
  }
  const callId = runtimeEntryToolCallId(entry);
  if (callId.length > 0) {
    resolvedToolCallIds.add(runtimeToolCallKey(entry.runId, callId));
  }
}

function runtimeInjectionSupersedesPendingToolCalls(entry: TimelineEntry): boolean {
  if (entry.kind !== "injection_applied") {
    return false;
  }
  const payload = jsonObject(entry.payload);
  return payload?.supersedes_pending_tool_calls === true;
}

function runtimeEntryIsInjection(entry: TimelineEntry): boolean {
  return entry.kind === "injection_enqueued" || entry.kind === "injection_applied";
}

function applyRuntimeInjectionEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  rowsByIdentity: Map<string, TimelineRow>,
): void {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return;
  }
  removeSupersededRuntimeInjectionRows(rows, rowsByIdentity, entry, payload);
  if (!runtimeInjectionEntryIsVisible(entry)) {
    return;
  }
  const injection = runtimeInjectionRow(entry, payload);
  const identityKeys = timelineInjectionIdentityKeys(entry.runId, injection);
  const existing = identityKeys
    .map((key) => rowsByIdentity.get(key))
    .find((row): row is TimelineRow => row !== undefined);
  const text = runtimeInjectionRowText(payload, injection.status);
  if (text.length === 0) {
    return;
  }
  if (existing !== undefined) {
    const nextInjection = mergedTimelineInjectionRow(existing.injection, injection);
    existing.injection = nextInjection;
    existing.kind = entry.kind;
    existing.parts = [timelineTextPart(runtimeInjectionRowText(payload, nextInjection.status))];
    existing.text = rowCopyText(existing.parts);
    registerRuntimeInjectionRow(rowsByIdentity, entry.runId, existing);
    return;
  }
  const row = runtimeEntryToRowWithParts(
    entry,
    [timelineTextPart(text)],
    timelineInjectionRowKey(entry.runId, injection, entry.id),
  );
  row.copyable = false;
  row.injection = injection;
  row.role = "user";
  rows.push(row);
  registerRuntimeInjectionRow(rowsByIdentity, entry.runId, row);
}

function runtimeInjectionEntryIsVisible(entry: TimelineEntry): boolean {
  if (!runtimeEntryIsInjection(entry)) {
    return false;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return false;
  }
  return (
    objectString(payload, "visibility").toLowerCase() !== "internal" &&
    payload.content_redacted !== true
  );
}

function runtimeInjectionRow(
  entry: TimelineEntry,
  payload: Record<string, JsonValue>,
): TimelineInjectionRow {
  const payloadStatus = objectString(payload, "status");
  return {
    clientMessageId: objectString(payload, "client_message_id"),
    injectionId: objectString(payload, "injection_id"),
    occurredAt: objectString(payload, "created_at") || entry.occurredAt,
    recipientInstanceId:
      objectString(payload, "recipient_instance_id") || entry.instanceId || "",
    status: entry.kind === "injection_applied"
      ? "applied"
      : normalizedInjectionStatus(payloadStatus || "queued"),
  };
}

function runtimeInjectionRowText(
  payload: Record<string, JsonValue>,
  status: TimelineInjectionRow["status"],
): string {
  const summary = runtimeInjectionSummary(payload);
  return summary.length > 0 ? `${injectionStatusLabel(status)}: ${summary}` : "";
}

function mergedTimelineInjectionRow(
  existing: TimelineInjectionRow | undefined,
  next: TimelineInjectionRow,
): TimelineInjectionRow {
  if (existing === undefined) {
    return next;
  }
  return {
    clientMessageId: next.clientMessageId || existing.clientMessageId,
    injectionId: next.injectionId || existing.injectionId,
    occurredAt: existing.occurredAt || next.occurredAt,
    recipientInstanceId: next.recipientInstanceId || existing.recipientInstanceId,
    status: next.status,
  };
}

function timelineInjectionIdentityKeys(
  runId: string | null,
  injection: TimelineInjectionRow,
): string[] {
  return [
    injection.injectionId.length > 0
      ? `${runId ?? ""}:id:${injection.injectionId}`
      : "",
    injection.clientMessageId.length > 0
      ? `${runId ?? ""}:client:${injection.clientMessageId}`
      : "",
  ].filter(Boolean);
}

function registerRuntimeInjectionRow(
  rowsByIdentity: Map<string, TimelineRow>,
  runId: string,
  row: TimelineRow,
): void {
  if (row.injection === undefined) {
    return;
  }
  for (const key of timelineInjectionIdentityKeys(runId, row.injection)) {
    rowsByIdentity.set(key, row);
  }
}

function removeSupersededRuntimeInjectionRows(
  rows: TimelineRow[],
  rowsByIdentity: Map<string, TimelineRow>,
  entry: TimelineEntry,
  payload: Record<string, JsonValue>,
): void {
  const supersededKeys = new Set([
    ...jsonStringValues(payload.superseded_injection_ids)
      .map((id) => `${entry.runId}:id:${id}`),
    ...jsonStringValues(payload.superseded_client_message_ids)
      .map((id) => `${entry.runId}:client:${id}`),
  ]);
  if (supersededKeys.size === 0) {
    return;
  }
  const supersededRows = new Set(
    Array.from(supersededKeys).flatMap((key) => {
      const row = rowsByIdentity.get(key);
      return row === undefined || row.injection?.status !== "queued" ? [] : [row];
    }),
  );
  if (supersededRows.size === 0) {
    return;
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row !== undefined && supersededRows.has(row)) {
      rows.splice(index, 1);
    }
  }
  for (const [key, row] of rowsByIdentity) {
    if (supersededRows.has(row)) {
      rowsByIdentity.delete(key);
    }
  }
}

function jsonStringValues(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) =>
    typeof item === "string" && item.trim().length > 0 ? [item.trim()] : []
  );
}

function removeSupersededPendingToolRows(
  rows: TimelineRow[],
  entry: TimelineEntry,
  resolvedToolCallIds: Set<string>,
): void {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (
      row === undefined ||
      row.runId !== entry.runId ||
      !timelineRowIsPendingToolCall(row, resolvedToolCallIds)
    ) {
      continue;
    }
    rows.splice(index, 1);
  }
}

function timelineRowIsPendingToolCall(
  row: TimelineRow,
  resolvedToolCallIds: Set<string>,
): boolean {
  const tool = row.parts.find(
    (part): part is TimelineToolPart =>
      part.kind === "tool" && part.phase === "call",
  );
  if (tool === undefined || row.runId === null) {
    return false;
  }
  return (
    tool.callId.length === 0 ||
    !resolvedToolCallIds.has(runtimeToolCallKey(row.runId, tool.callId))
  );
}

function mergeRuntimeToolCallIntoResolvedRow(
  rows: TimelineRow[],
  entry: TimelineEntry,
  resolvedToolCallIds: Set<string>,
): boolean {
  if (entry.kind !== "tool_call") {
    return false;
  }
  const callId = runtimeEntryToolCallId(entry);
  if (callId.length === 0) {
    return false;
  }
  if (!resolvedToolCallIds.has(runtimeToolCallKey(entry.runId, callId))) {
    return false;
  }
  const callPart = runtimeToolPart(entry);
  if (callPart === null || callPart.phase !== "call") {
    return true;
  }
  const resolvedTool = findResolvedRuntimeToolPart(rows, entry.runId, callId);
  if (resolvedTool === null) {
    return false;
  }
  resolvedTool.inputBody = callPart.inputBody || callPart.body;
  resolvedTool.body = appendToolCallArgsToResultBody(
    resolvedTool.body,
    callPart.body,
  );
  return true;
}

function findResolvedRuntimeToolPart(
  rows: TimelineRow[],
  runId: string,
  callId: string,
): TimelineToolPart | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (row === undefined || row.runId !== runId) {
      continue;
    }
    const tool = row.parts.find(
      (part): part is TimelineToolPart =>
        part.kind === "tool" &&
        part.callId === callId &&
        (part.phase === "result" || part.phase === "validation"),
    );
    if (tool !== undefined) {
      return tool;
    }
  }
  return null;
}

function appendToolCallArgsToResultBody(resultBody: string, argsBody: string): string {
  const trimmedArgs = argsBody.trim();
  if (trimmedArgs.length === 0) {
    return resultBody;
  }
  const trimmedResult = resultBody.trim();
  if (trimmedResult.length === 0) {
    return trimmedArgs;
  }
  if (trimmedResult.includes(trimmedArgs)) {
    return trimmedResult;
  }
  return `${trimmedResult}\n\n${trimmedArgs}`;
}

function mergeRuntimeToolResultIntoPendingRow(
  rows: TimelineRow[],
  entry: TimelineEntry,
): boolean {
  if (entry.kind !== "tool_result" && entry.kind !== "tool_input_validation_failed") {
    return false;
  }
  const nextTool = runtimeToolPart(entry);
  if (nextTool === null || nextTool.callId.trim().length === 0) {
    return false;
  }
  const pendingTool = findPendingRuntimeToolPart(rows, entry.runId, nextTool.callId);
  if (pendingTool === null) {
    return false;
  }
  mergeToolPartState(pendingTool, nextTool);
  return true;
}

function findPendingRuntimeToolPart(
  rows: TimelineRow[],
  runId: string,
  callId: string,
): TimelineToolPart | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (row === undefined || row.runId !== runId) {
      continue;
    }
    const tool = row.parts.find(
      (part): part is TimelineToolPart =>
        part.kind === "tool" &&
        part.callId === callId &&
        part.phase === "call",
    );
    if (tool !== undefined) {
      return tool;
    }
  }
  return null;
}

function runtimeEntryToolCallId(entry: TimelineEntry): string {
  const payload = jsonObject(entry.payload);
  return payload === null ? "" : objectString(payload, "tool_call_id");
}

function runtimeToolCallKey(runId: string, callId: string): string {
  return `${runId}:${callId}`;
}

function runtimeEntryToRow(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): TimelineRow {
  const parts = runtimeEntryParts(entry, variant);
  return runtimeEntryToRowWithParts(entry, parts, `runtime:${entry.id}`);
}

function runtimeEntryToRowWithParts(
  entry: TimelineEntry,
  parts: TimelineRenderPart[],
  key: string,
): TimelineRow {
  const text = rowCopyText(parts);
  const fallbackText = runtimeFallbackText(entry);
  return {
    key,
    role: entry.roleId,
    instanceId: entry.instanceId || null,
    text: text || fallbackText,
    kind: entry.kind,
    parts,
    roundMarker: null,
    runId: entry.runId,
    source: "runtime",
    copyable: runtimeEntryCanBeCopied(entry, text),
  };
}

function runtimeEntryCanBeCopied(entry: TimelineEntry, text: string): boolean {
  if (!isAnswerRole(entry.roleId) || text.trim().length === 0) {
    return false;
  }
  return (
    entry.kind === "message" ||
    entry.kind === "output_delta" ||
    entry.kind === "text_delta"
  );
}

async function collectRoundRailRounds(sessionId: string): Promise<SessionRound[]> {
  const rounds: SessionRound[] = [];
  let cursorRunId: string | null = null;
  for (let pageIndex = 0; pageIndex < ROUND_RAIL_MAX_PAGES; pageIndex += 1) {
    const page: SessionRoundsPage = await listSessionRounds(sessionId, {
      cursorRunId,
      forceRefresh: true,
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

function roundsWithRuntimeRunState(
  rounds: SessionRound[],
  runStates: Record<string, RuntimeRunState>,
  sessionId: string | null,
  runtimeRunId: string | null,
  primaryRoleId: string | null,
  subagentScopeRoleId: string | null,
  variant: "session" | "subagent-panel",
): SessionRound[] {
  let changed = false;
  const existingRunIds = new Set<string>();
  const nextRounds = rounds.map((round) => {
    const roundRunId = round.run_id.trim();
    if (roundRunId.length > 0) {
      existingRunIds.add(roundRunId);
    }
    let nextRound = round;
    const runState = runStates[roundRunId];
    const runtimeStatus = runtimeRoundStatusLabel(runState);
    if (
      runtimeStatus !== null &&
      !roundHasTerminalStatus(nextRound) &&
      ((nextRound.run_status ?? null) !== runtimeStatus ||
        (nextRound.run_phase ?? null) !== null)
    ) {
      changed = true;
      nextRound = {
        ...nextRound,
        run_phase: null,
        run_status: runtimeStatus,
      };
    }
    const runtimePrompt = runState?.promptText?.trim() ?? "";
    if (
      runtimePrompt.length > 0 &&
      (nextRound.run_user_message?.trim() ?? "").length === 0
    ) {
      changed = true;
      nextRound = {
        ...nextRound,
        run_user_message: runtimePrompt,
      };
    }
    const runtimeRetryEvents = runtimeRetryEventsForRound(runState);
    if (runtimeRetryEvents.length > 0) {
      changed = true;
      nextRound = {
        ...nextRound,
        retry_events: mergeRoundRetryEvents(
          nextRound.retry_events,
          runtimeRetryEvents,
        ),
      };
    }
    return nextRound;
  });
  const runtimeOnlyRounds = Object.values(runStates).flatMap((runState) => {
    if (existingRunIds.has(runState.runId)) {
      return [];
    }
    const runtimeRound = runtimeRoundFromRunState(runState, {
      primaryRoleId,
      runtimeRunId,
      sessionId,
      subagentRoleId: subagentScopeRoleId,
      variant,
    });
    return runtimeRound === null ? [] : [runtimeRound];
  });
  const mergedRounds = runtimeOnlyRounds.length === 0
    ? (changed ? nextRounds : rounds)
    : sortRoundsAscending([...nextRounds, ...runtimeOnlyRounds]);
  return roundsVisibleInTimelineScope(mergedRounds, {
    primaryRoleId,
    runtimeRunId,
    sessionId,
    subagentRoleId: subagentScopeRoleId,
    variant,
  });
}

function roundsWithSessionTerminalStatus(
  rounds: SessionRound[],
  latestTerminalRunId: string | null,
  latestTerminalRunStatus: string | null,
): SessionRound[] {
  const terminalRunId = latestTerminalRunId?.trim() ?? "";
  const terminalStatus = normalizedTerminalRoundStatus(latestTerminalRunStatus);
  if (terminalRunId.length === 0 || terminalStatus === null) {
    return rounds;
  }
  let changed = false;
  const nextRounds = rounds.map((round) => {
    if (round.run_id.trim() !== terminalRunId || roundHasTerminalStatus(round)) {
      return round;
    }
    changed = true;
    return {
      ...round,
      run_phase: null,
      run_status: terminalStatus,
    };
  });
  return changed ? nextRounds : rounds;
}

function roundsVisibleInTimelineScope(
  rounds: SessionRound[],
  scope: RuntimeTimelineScope,
): SessionRound[] {
  if (
    scope.sessionId === null ||
    scope.variant === "subagent-panel" ||
    (scope.runtimeRunId?.trim() ?? "").length > 0
  ) {
    return rounds;
  }
  return rounds.filter(
    (round) => !timelineRoundLooksDetachedSubagent(round, scope.primaryRoleId),
  );
}

function timelineRoundLooksDetachedSubagent(
  round: SessionRound,
  primaryRoleId: string | null,
): boolean {
  if (round.run_id.toLowerCase().includes("subagent")) {
    return true;
  }
  return roundMessages(round).some((message) =>
    timelineMessageLooksDetachedSubagent(
      roundMessageToTimelineMessage(message, round.run_id),
      primaryRoleId,
    ),
  );
}

function roundHasTerminalStatus(round: SessionRound): boolean {
  return isTerminalRoundStatus(round.run_status) || isTerminalRoundStatus(round.run_phase);
}

function roundsNeedLiveRefetch(rounds: SessionRound[] | undefined): boolean {
  return rounds?.some(roundNeedsLiveRefetch) ?? false;
}

function roundNeedsLiveRefetch(round: SessionRound): boolean {
  if (roundHasTerminalStatus(round)) {
    return false;
  }
  return (
    isLiveRoundStatus(round.run_status) ||
    isLiveRoundStatus(round.run_phase)
  );
}

function isLiveRoundStatus(status: string | null | undefined): boolean {
  switch ((status ?? "").trim().toLowerCase()) {
    case "active":
    case "connecting":
    case "executing":
    case "pending":
    case "queued":
    case "running":
    case "started":
    case "streaming":
    case "subagent_running":
      return true;
    default:
      return false;
  }
}

function isTerminalRoundStatus(status: string | null | undefined): boolean {
  return normalizedTerminalRoundStatus(status) !== null;
}

function normalizedTerminalRoundStatus(status: string | null | undefined): string | null {
  switch ((status ?? "").trim().toLowerCase()) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

function runtimeRoundFromRunState(
  runState: RuntimeRunState,
  scope: RuntimeTimelineScope,
): SessionRound | null {
  const runId = runState.runId.trim();
  if (runId.length === 0 || !runtimeRunStateMatchesScope(runState, scope)) {
    return null;
  }
  const promptText = runState.promptText?.trim() ?? "";
  const hasScopedEntries = runState.entries.some((entry) =>
    runtimeEntryMatchesScope(entry, runState, scope),
  );
  if (promptText.length === 0 || (!hasScopedEntries && runState.entries.length > 0)) {
    return null;
  }
  const createdAt = runtimeRunCreatedAt(runState);
  return {
    ...(createdAt !== undefined ? { created_at: createdAt } : {}),
    primary_role_id: runState.targetRoleId ?? null,
    run_id: runId,
    run_phase: runtimeRoundPhaseLabel(runState),
    run_status: runtimeOpenRoundStatusLabel(runState),
    run_user_message: promptText.length > 0 ? promptText : null,
  };
}

function runtimeRunStateMatchesScope(
  runState: RuntimeRunState,
  scope: RuntimeTimelineScope,
): boolean {
  const { primaryRoleId, runtimeRunId, sessionId, subagentRoleId, variant } =
    scope;
  if (sessionId === null) {
    return false;
  }
  const scopedRunId = runtimeRunId?.trim() ?? "";
  if (scopedRunId.length > 0) {
    if (
      scopedRunId !== runState.runId ||
      !runtimeRunStateHasSession(runState, sessionId)
    ) {
      return false;
    }
    return variant !== "subagent-panel" ||
      runtimeRunStateHasSubagentScopeRole(runState, subagentRoleId);
  }
  if (variant === "subagent-panel" || !runtimeRunStateHasSession(runState, sessionId)) {
    return false;
  }
  return runtimeRunStateBelongsToMainTimeline(runState, primaryRoleId);
}

function runtimeRunStateHasSession(
  runState: RuntimeRunState,
  sessionId: string,
): boolean {
  if ((runState.sessionId?.trim() ?? "") === sessionId) {
    return true;
  }
  return runState.entries.some((entry) => entry.sessionId === sessionId);
}

function runtimeRunStateHasSubagentScopeRole(
  runState: RuntimeRunState,
  roleId: string | null,
): boolean {
  const normalizedRole = stableTimelineRole(roleId ?? "");
  if (normalizedRole.length === 0) {
    return true;
  }
  return runState.entries.some(
    (entry) => stableTimelineRole(entry.roleId) === normalizedRole,
  );
}

function runtimeEntryMatchesSubagentScopeRole(
  entry: TimelineEntry,
  roleId: string | null,
  variant: "session" | "subagent-panel",
): boolean {
  if (variant !== "subagent-panel") {
    return true;
  }
  const normalizedRole = stableTimelineRole(roleId ?? "");
  return (
    normalizedRole.length === 0 ||
    stableTimelineRole(entry.roleId) === normalizedRole
  );
}

function runtimeRunCreatedAt(runState: RuntimeRunState): string | undefined {
  const explicit = runState.createdAt?.trim() ?? "";
  if (explicit.length > 0) {
    return explicit;
  }
  for (const entry of runState.entries) {
    const occurredAt = entry.occurredAt.trim();
    if (occurredAt.length > 0) {
      return occurredAt;
    }
  }
  return undefined;
}

function runtimeRoundPhaseLabel(runState: RuntimeRunState): string | null {
  if (runState.status === "connecting") {
    return "connecting";
  }
  return null;
}

function runtimeOpenRoundStatusLabel(runState: RuntimeRunState): string | null {
  const terminalStatus = runtimeRoundStatusLabel(runState);
  if (terminalStatus !== null) {
    return terminalStatus;
  }
  if (runState.status === "connecting" || runState.status === "open") {
    return "running";
  }
  if (runState.status === "failed") {
    return "failed";
  }
  return null;
}

function runtimeRetryEventsForRound(
  runState: RuntimeRunState | undefined,
): JsonValue[] {
  if (runState === undefined) {
    return [];
  }
  const events = runState.entries.flatMap((entry) => {
    const retryEvent = runtimeRetryEvent(entry);
    return retryEvent === null ? [] : [retryEvent];
  });
  if (events.length === 0) {
    return [];
  }
  const terminalKind =
    runState.terminalEventType ?? latestTerminalEntryKind(runState.entries);
  if (terminalKind === "run_completed") {
    return [];
  }
  if (terminalKind !== null) {
    return events.filter(runtimeRetryEventIsTerminal);
  }
  return events;
}

function runtimeRetryEvent(entry: TimelineEntry): Record<string, JsonValue> | null {
  if (!runtimeEntryIsRetryEvent(entry.kind)) {
    return null;
  }
  const payload = jsonObject(entry.payload) ?? {};
  const occurredAt = objectString(payload, "occurred_at") || entry.occurredAt.trim();
  const nextEvent: Record<string, JsonValue> = {
    ...payload,
    event_id: entry.eventId,
    kind: runtimeRetryKind(entry.kind, payload),
    phase: runtimeRetryPhase(entry.kind, payload),
  };
  if (occurredAt.length > 0) {
    nextEvent.occurred_at = occurredAt;
  }
  const roleId = objectString(payload, "role_id") || entry.roleId.trim();
  if (roleId.length > 0) {
    nextEvent.role_id = roleId;
  }
  const instanceId =
    objectString(payload, "instance_id") || (entry.instanceId ?? "").trim();
  if (instanceId.length > 0) {
    nextEvent.instance_id = instanceId;
  }
  return nextEvent;
}

function runtimeEntryIsRetryEvent(kind: RunEventType | "message"): boolean {
  return (
    kind === "llm_retry_scheduled" ||
    kind === "llm_retry_exhausted" ||
    kind === "llm_fallback_activated" ||
    kind === "llm_fallback_exhausted"
  );
}

function runtimeRetryKind(
  kind: RunEventType | "message",
  payload: Record<string, JsonValue>,
): string {
  if (kind === "llm_fallback_activated" || kind === "llm_fallback_exhausted") {
    return "fallback";
  }
  return objectString(payload, "kind") || "retry";
}

function runtimeRetryPhase(
  kind: RunEventType | "message",
  payload: Record<string, JsonValue>,
): string {
  const phase = objectString(payload, "phase");
  if (phase.length > 0) {
    return phase;
  }
  if (kind === "llm_retry_exhausted" || kind === "llm_fallback_exhausted") {
    return "failed";
  }
  if (kind === "llm_fallback_activated") {
    return "fallback";
  }
  return "scheduled";
}

function runtimeRetryEventIsTerminal(event: JsonValue): boolean {
  const object = jsonObject(event);
  if (object === null) {
    return false;
  }
  const phase = objectString(object, "phase").toLowerCase();
  return (
    phase === "failed" ||
    phase === "exhausted" ||
    phase === "succeeded" ||
    objectString(object, "kind").toLowerCase() === "fallback"
  );
}

function mergeRoundRetryEvents(
  existingEvents: JsonValue[] | undefined,
  runtimeEvents: JsonValue[],
): JsonValue[] {
  const merged = new Map<string, JsonValue>();
  for (const event of existingEvents ?? []) {
    merged.set(roundRetryEventKey(event, `persisted:${merged.size}`), inactiveRetryEvent(event));
  }
  runtimeEvents.forEach((event, index) => {
    const nextEvent = index === runtimeEvents.length - 1
      ? activeRetryEvent(event)
      : inactiveRetryEvent(event);
    merged.set(roundRetryEventKey(event, `runtime:${index}`), nextEvent);
  });
  return Array.from(merged.values());
}

function activeRetryEvent(event: JsonValue): JsonValue {
  const object = jsonObject(event);
  return object === null ? event : { ...object, is_active: true };
}

function inactiveRetryEvent(event: JsonValue): JsonValue {
  const object = jsonObject(event);
  return object === null ? event : { ...object, is_active: false };
}

function roundRetryEventKey(event: JsonValue, fallback: string): string {
  const object = jsonObject(event);
  if (object === null) {
    return fallback;
  }
  const eventId = object["event_id"];
  if (typeof eventId === "number" && Number.isFinite(eventId)) {
    return `event:${eventId}`;
  }
  const eventIdText = objectString(object, "event_id") || objectString(object, "eventId");
  if (eventIdText.length > 0) {
    return `event:${eventIdText}`;
  }
  return [
    objectString(object, "kind"),
    objectString(object, "phase"),
    String(objectNumber(object, "attempt_number")),
    objectString(object, "occurred_at"),
  ].join("|") || fallback;
}

function runtimeRoundStatusLabel(
  runState: RuntimeRunState | undefined,
): string | null {
  if (runState === undefined || runState.status !== "closed") {
    return null;
  }
  return terminalRoundStatusLabel(
    runState.terminalEventType ?? latestTerminalEntryKind(runState.entries),
  );
}

function latestTerminalEntryKind(entries: TimelineEntry[]): RunEventType | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry !== undefined && terminalRoundStatusLabel(entry.kind) !== null) {
      return entry.kind;
    }
  }
  return null;
}

function terminalRoundStatusLabel(kind: RunEventType | null): string | null {
  switch (kind) {
    case "run_completed":
      return "completed";
    case "run_failed":
      return "failed";
    case "run_paused":
      return "paused";
    case "run_stopped":
      return "stopped";
    default:
      return null;
  }
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

function timelineOutputTextByRunId(rows: TimelineRow[]): Map<string, string> {
  const textByRunId = new Map<string, string>();
  for (const row of rows) {
    if (!isAnswerRole(row.role)) {
      continue;
    }
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0) {
      continue;
    }
    const text = normalizedTimelineText(row.text);
    if (text.length > 0) {
      textByRunId.set(
        runId,
        [textByRunId.get(runId) ?? "", text].filter(Boolean).join(" "),
      );
    }
  }
  return textByRunId;
}

function timelineOutputSourcesByRunId(
  rows: TimelineRow[],
): Map<string, Set<TimelineRunIdSource>> {
  const sourcesByRunId = new Map<string, Set<TimelineRunIdSource>>();
  for (const row of rows) {
    if (!isAnswerRole(row.role)) {
      continue;
    }
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0 || row.runIdSource === undefined || row.runIdSource === null) {
      continue;
    }
    const sources = sourcesByRunId.get(runId) ?? new Set<TimelineRunIdSource>();
    sources.add(row.runIdSource);
    sourcesByRunId.set(runId, sources);
  }
  return sourcesByRunId;
}

type TimelineToolHydrationState = "pending" | "resolved";

function timelineToolStatesByRunId(
  rows: TimelineRow[],
): Map<string, Map<string, TimelineToolHydrationState>> {
  const toolStatesByRunId = new Map<
    string,
    Map<string, TimelineToolHydrationState>
  >();
  for (const row of rows) {
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0) {
      continue;
    }
    for (const part of row.parts) {
      if (part.kind !== "tool" || part.callId.trim().length === 0) {
        continue;
      }
      const toolStates =
        toolStatesByRunId.get(runId) ??
        new Map<string, TimelineToolHydrationState>();
      const key = timelineToolHydrationKey(part.callId);
      const nextState = part.phase === "call" ? "pending" : "resolved";
      const existingState = toolStates.get(key);
      toolStates.set(
        key,
        existingState === "resolved" ? existingState : nextState,
      );
      toolStatesByRunId.set(runId, toolStates);
    }
  }
  return toolStatesByRunId;
}

function timelineThinkingTextByRunId(rows: TimelineRow[]): Map<string, string> {
  const textByRunId = new Map<string, string>();
  for (const row of rows) {
    if (!isAnswerRole(row.role)) {
      continue;
    }
    const runId = row.runId?.trim() ?? "";
    if (runId.length === 0) {
      continue;
    }
    const text = normalizedTimelineText(
      row.parts
        .filter((part): part is TimelineThinkingPart => part.kind === "thinking")
        .map((part) => part.text)
        .join(" "),
    );
    if (text.length > 0) {
      textByRunId.set(
        runId,
        [textByRunId.get(runId) ?? "", text].filter(Boolean).join(" "),
      );
    }
  }
  return textByRunId;
}

function runtimeEntriesAfterHydration(
  runState: RuntimeRunState,
  sessionId: string | null,
  runtimeRunId: string | null,
  primaryRoleId: string | null,
  subagentScopeRoleId: string | null,
  variant: "session" | "subagent-panel",
  hydratedOutputTextByRunId: Map<string, string>,
  hydratedOutputSourcesByRunId: Map<string, Set<TimelineRunIdSource>>,
  hydratedThinkingTextByRunId: Map<string, string>,
  hydratedToolStatesByRunId: Map<string, Map<string, TimelineToolHydrationState>>,
): TimelineEntry[] {
  const scopedEntries = runState.entries.filter((entry) =>
    runtimeEntryMatchesScope(entry, runState, {
      primaryRoleId,
      runtimeRunId,
      sessionId,
      subagentRoleId: subagentScopeRoleId,
      variant,
    }),
  );
  const hydratedText = hydratedOutputTextByRunId.get(runState.runId);
  const hydratedOutputSources = hydratedOutputSourcesByRunId.get(runState.runId);
  const hydratedThinkingText = hydratedThinkingTextByRunId.get(runState.runId);
  const hydratedToolStates =
    hydratedToolStatesByRunId.get(runState.runId) ??
    new Map<string, TimelineToolHydrationState>();
  if (
    hydratedText === undefined &&
    hydratedThinkingText === undefined &&
    hydratedToolStates.size === 0
  ) {
    return openRuntimeEntriesWithIdleCursor(runState, scopedEntries, variant);
  }
  const closedRuntimeTextAnchorKey = closedRuntimeTextAnchorKeyForHydration(
    runState,
    scopedEntries,
    hydratedText ?? "",
  );
  if (runState.status === "closed") {
    return scopedEntries.flatMap((entry) => {
      const nextEntry = runtimeEntryAfterThinkingHydration(
        entry,
        hydratedThinkingText ?? "",
      );
      if (nextEntry === null) {
        return [];
      }
      const coveredByHydration = runtimeEntryIsCoveredByHydratedOutput(
        nextEntry,
        runState,
        hydratedText ?? "",
        hydratedThinkingText ?? "",
        hydratedToolStates,
        closedRuntimeTextAnchorKey,
      );
      if (coveredByHydration) {
        return [];
      }
      return terminalRuntimeTextSupersededByHydratedAnswer(
        nextEntry,
        runState,
        hydratedText ?? "",
        hydratedOutputSources,
      )
        ? []
        : [nextEntry];
    });
  }
  const hydratedEntries: TimelineEntry[] = [];
  const safeHydratedText = hydratedText ?? "";
  const hydratedCursor = runtimeHydratedTextCursor(safeHydratedText);
  let suppressCoveredText =
    safeHydratedText.trim().length > 0 || runState.hadVisibleTextStream !== true;
  for (const entry of scopedEntries) {
    const nextEntry = runtimeEntryAfterThinkingHydration(
      entry,
      hydratedThinkingText ?? "",
    );
    if (nextEntry === null) {
      continue;
    }
    if (
      suppressCoveredText &&
      openRuntimeTextCoveredByHydration(nextEntry, hydratedCursor)
    ) {
      if (safeHydratedText.trim().length === 0) {
        hydratedEntries.push(runtimeHydrationCursorEntry(nextEntry));
      }
      continue;
    }
    hydratedEntries.push(nextEntry);
    suppressCoveredText = false;
  }
  return openRuntimeEntriesWithIdleCursor(
    runState,
    hydratedEntries,
    variant,
    safeHydratedText.trim().length > 0,
  );
}

function openRuntimeEntriesWithIdleCursor(
  runState: RuntimeRunState,
  entries: TimelineEntry[],
  variant: "session" | "subagent-panel",
  suppressPendingCursor = false,
): TimelineEntry[] {
  if (runState.status === "closed" || entries.length === 0) {
    return entries;
  }
  const visibleEntries = entries.filter(
    (entry) =>
      runtimeEntryShouldRenderChatContent(entry) &&
      !runtimeSilentOpenLifecycleEntry(entry, variant),
  );
  const rowPipelineEntries = entries.filter(
    (entry) =>
      (
        runtimeEntryShouldRenderChatContent(entry) &&
        !runtimeSilentOpenLifecycleEntry(entry, variant)
      ) ||
      runtimeHiddenEntryClosesText(entry),
  );
  const latestVisibleEntry = visibleEntries.at(-1);
  if (
    latestVisibleEntry !== undefined &&
    runtimeEntryRestoresIdleCursor(latestVisibleEntry)
  ) {
    return [...rowPipelineEntries, runtimeIdleCursorEntry(latestVisibleEntry)];
  }
  if (visibleEntries.some((entry) => runtimeEntryProducesRenderableRow(entry, variant))) {
    return rowPipelineEntries;
  }
  const latestEntry = entries.at(-1);
  if (latestEntry !== undefined) {
    if (suppressPendingCursor) {
      return rowPipelineEntries;
    }
    return [...rowPipelineEntries, runtimePendingCursorEntry(latestEntry, runState)];
  }
  return rowPipelineEntries;
}

function terminalRuntimeTextSupersededByHydratedAnswer(
  entry: TimelineEntry,
  runState: RuntimeRunState,
  hydratedText: string,
  hydratedOutputSources: ReadonlySet<TimelineRunIdSource> | undefined,
): boolean {
  return (
    runState.status === "closed" &&
    runState.hadVisibleTextStream !== true &&
    hydratedText.trim().length > 0 &&
    hydratedOutputSources?.has("trace_id") === true &&
    (entry.kind === "text_delta" || entry.kind === "output_delta")
  );
}

function runtimeSilentOpenLifecycleEntry(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): boolean {
  if (entry.kind !== "run_started" && entry.kind !== "run_resumed") {
    return false;
  }
  return runtimeStructuredEventText(entry, variant) === null;
}

function runtimeEntryProducesRenderableRow(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): boolean {
  return (
    runtimeEntryShouldRenderChatContent(entry) &&
    runtimeEntryParts(entry, variant).length > 0
  );
}

function runtimeEntryRestoresIdleCursor(entry: TimelineEntry): boolean {
  return (
    entry.kind === "thinking_finished" ||
    entry.kind === "tool_result" ||
    entry.kind === "tool_input_validation_failed"
  );
}

function openRuntimeTextCoveredByHydration(
  entry: TimelineEntry,
  hydratedCursor: RuntimeHydratedTextCursor,
): boolean {
  if (entry.kind !== "text_delta" && entry.kind !== "output_delta") {
    return false;
  }
  const entryText = runtimeHydrationComparisonTexts(entry).join(" ");
  if (entryText.length === 0 || hydratedCursor.remainingText.length === 0) {
    return false;
  }
  if (!hydratedCursor.remainingText.startsWith(entryText)) {
    return false;
  }
  hydratedCursor.remainingText = hydratedCursor.remainingText
    .slice(entryText.length)
    .trimStart();
  return true;
}

interface RuntimeHydratedTextCursor {
  remainingText: string;
}

function runtimeHydratedTextCursor(hydratedText: string): RuntimeHydratedTextCursor {
  return { remainingText: normalizedTimelineText(hydratedText) };
}

function closedRuntimeTextAnchorKeyForHydration(
  runState: RuntimeRunState,
  entries: TimelineEntry[],
  hydratedText: string,
): string | null {
  if (
    runState.status !== "closed" ||
    runState.hadVisibleTextStream !== true ||
    hydratedText.trim().length === 0
  ) {
    return null;
  }
  if (normalizedTimelineText(closedRuntimeVisibleText(entries)) !== hydratedText) {
    return null;
  }
  return latestCoveredRuntimeTextAnchorKey(entries, hydratedText);
}

function closedRuntimeVisibleText(entries: TimelineEntry[]): string {
  let text = "";
  for (const entry of entries) {
    if (entry.kind === "text_delta") {
      text += runtimeTextDeltaText(entry);
      continue;
    }
    if (entry.kind === "output_delta") {
      const parts = runtimeOutputParts(entry);
      if (parts === null || parts.some((part) => part.kind !== "text")) {
        continue;
      }
      text += parts
        .filter((part): part is TimelineTextPart => part.kind === "text")
        .map((part) => part.text)
        .join("");
      continue;
    }
    if (entry.kind !== "run_completed" || !runtimeEntryHasStructuredOutput(entry)) {
      continue;
    }
    const outputText = runtimeCompletedOutputText(entry);
    if (outputText.length === 0) {
      continue;
    }
    const currentText = normalizedTimelineText(text);
    const normalizedOutputText = normalizedTimelineText(outputText);
    if (currentText.length === 0 || normalizedOutputText.includes(currentText)) {
      text = outputText;
    }
  }
  return text;
}

function runtimeHydrationCursorEntry(entry: TimelineEntry): TimelineEntry {
  return {
    ...entry,
    id: `${entry.id}:hydration-cursor`,
    kind: "text_delta",
    payload: {
      covered_event_kind: entry.kind,
      hydration_cursor_placeholder: true,
      text: "",
    },
    text: "",
  };
}

function runtimeIdleCursorEntry(entry: TimelineEntry): TimelineEntry {
  return {
    ...entry,
    id: `${entry.id}:idle-cursor`,
    kind: "text_delta",
    payload: {
      idle_cursor_placeholder: true,
      source_event_kind: entry.kind,
      text: "",
    },
    text: "",
  };
}

function runtimePendingCursorEntry(
  entry: TimelineEntry,
  runState: RuntimeRunState,
): TimelineEntry {
  return {
    ...entry,
    id: `${entry.id}:pending-cursor`,
    kind: "text_delta",
    payload: {
      pending_cursor_placeholder: true,
      source_event_kind: entry.kind,
      text: "",
    },
    roleId: runState.targetRoleId?.trim() || entry.roleId,
    text: "",
  };
}

interface RuntimeTimelineScope {
  primaryRoleId: string | null;
  runtimeRunId: string | null;
  sessionId: string | null;
  subagentRoleId: string | null;
  variant: "session" | "subagent-panel";
}

function runtimeEntryMatchesScope(
  entry: TimelineEntry,
  runState: RuntimeRunState,
  scope: RuntimeTimelineScope,
): boolean {
  const { primaryRoleId, runtimeRunId, sessionId, subagentRoleId, variant } =
    scope;
  if (entry.sessionId !== sessionId) {
    return false;
  }
  const scopedRunId = runtimeRunId?.trim() ?? "";
  if (scopedRunId.length > 0) {
    return entry.runId === scopedRunId &&
      runtimeEntryMatchesSubagentScopeRole(entry, subagentRoleId, variant);
  }
  if (variant === "subagent-panel") {
    return false;
  }
  return runtimeEntryBelongsToMainTimeline(entry, runState, primaryRoleId);
}

function runtimeEntryBelongsToMainTimeline(
  entry: TimelineEntry,
  runState: RuntimeRunState,
  primaryRoleId: string | null,
): boolean {
  if (runtimeEntryLooksLikeDetachedSubagent(entry, runState, primaryRoleId)) {
    return false;
  }
  if (timelineRoleIsInternalOrchestration(entry.roleId)) {
    return false;
  }
  const normalizedPrimaryRole = stableTimelineRole(primaryRoleId ?? "");
  if (timelineRoleIsMainTimelineAgent(entry.roleId)) {
    return true;
  }
  if (normalizedPrimaryRole.length === 0) {
    return true;
  }
  const entryRole = stableTimelineRole(entry.roleId);
  if (entryRole.length > 0) {
    return entryRole === normalizedPrimaryRole;
  }
  return (
    runtimeRunStateBelongsToMainTimeline(runState, primaryRoleId)
  );
}

function runtimeRunStateBelongsToMainTimeline(
  runState: RuntimeRunState,
  primaryRoleId: string | null,
): boolean {
  if (runtimeRunStateIdentityLooksLikeDetachedSubagent(runState, primaryRoleId)) {
    return false;
  }
  const normalizedPrimaryRole = stableTimelineRole(primaryRoleId ?? "");
  if (normalizedPrimaryRole.length === 0) {
    return true;
  }
  const runRole = stableTimelineRole(runState.targetRoleId ?? "");
  if (timelineRoleIsMainTimelineAgent(runState.targetRoleId ?? "")) {
    return true;
  }
  if (runRole === normalizedPrimaryRole) {
    return true;
  }
  return runState.entries.some(
    (entry) => stableTimelineRole(entry.roleId) === normalizedPrimaryRole,
  );
}

function runtimeRunStateIdentityLooksLikeDetachedSubagent(
  runState: RuntimeRunState,
  primaryRoleId: string | null,
): boolean {
  if (runState.scope === "subagent") {
    return true;
  }
  const identifiers = [
    runState.runId,
    runState.targetRoleId ?? "",
  ].join(" ").toLowerCase();
  if (identifiers.includes("subagent")) {
    return true;
  }
  if (timelineRoleIsMainTimelineAgent(runState.targetRoleId ?? "")) {
    return false;
  }
  if (timelineRoleIsInternalOrchestration(runState.targetRoleId ?? "")) {
    return false;
  }
  if (runtimeRunStateHasMainTimelineAgentEntry(runState)) {
    return false;
  }
  return (
    timelineRoleCanBeDetachedAgent(runState.targetRoleId ?? "", primaryRoleId) &&
    timelineIdentifiersIncludeGeneratedReference([runState.runId])
  );
}

function runtimeRunStateHasMainTimelineAgentEntry(
  runState: RuntimeRunState,
): boolean {
  const cached = runtimeRunStateMainRoleCache.get(runState);
  if (cached !== undefined) {
    return cached;
  }
  const hasMainRole = runState.entries.some((entry) =>
    timelineRoleIsMainTimelineAgent(entry.roleId)
  );
  runtimeRunStateMainRoleCache.set(runState, hasMainRole);
  return hasMainRole;
}

function runtimeEntryLooksLikeDetachedSubagent(
  entry: TimelineEntry,
  runState: RuntimeRunState,
  primaryRoleId: string | null,
): boolean {
  if (entry.kind === "subagent_session_status_changed") {
    return false;
  }
  if (runState.scope === "subagent") {
    return true;
  }
  if (runtimeEntryHasDetachedSubagentPayload(entry)) {
    return true;
  }
  const identifiers = [
    entry.instanceId ?? "",
    entry.runId,
    runState.runId,
    runState.targetRoleId ?? "",
  ].join(" ").toLowerCase();
  if (identifiers.includes("subagent")) {
    return true;
  }
  const roleId = entry.roleId.trim().length > 0
    ? entry.roleId
    : (runState.targetRoleId ?? "");
  if (timelineRoleIsMainTimelineAgent(roleId)) {
    return false;
  }
  if (!timelineRoleCanBeDetachedAgent(roleId, primaryRoleId)) {
    return false;
  }
  if (
    runtimeRunStateReferencesDetachedSubagentRole(
      runState,
      roleId,
      primaryRoleId,
    )
  ) {
    return true;
  }
  const instanceId = (entry.instanceId ?? "").trim();
  if (
    instanceId.length > 0 &&
    timelineIdentifierLooksGeneratedAgentInstance(instanceId)
  ) {
    return true;
  }
  return timelineIdentifiersIncludeGeneratedReference([
    entry.runId,
    runState.runId,
  ]);
}

function runtimeRunStateReferencesDetachedSubagentRole(
  runState: RuntimeRunState,
  roleId: string,
  primaryRoleId: string | null,
): boolean {
  const normalizedRole = stableTimelineRole(roleId);
  if (normalizedRole.length === 0) {
    return false;
  }
  const normalizedPrimaryRole = stableTimelineRole(primaryRoleId ?? "");
  if (
    normalizedPrimaryRole.length > 0 &&
    normalizedPrimaryRole === normalizedRole
  ) {
    return false;
  }
  return runtimeRunStateDetachedSubagentRoles(runState).has(normalizedRole);
}

function runtimeRunStateDetachedSubagentRoles(
  runState: RuntimeRunState,
): ReadonlySet<string> {
  const cached = runtimeRunStateDetachedRoleCache.get(runState);
  if (cached !== undefined) {
    return cached;
  }
  const roles = new Set<string>();
  for (const entry of runState.entries) {
    const role = runtimeEntrySubagentReferenceRole(entry);
    if (role.length > 0) {
      roles.add(role);
    }
  }
  runtimeRunStateDetachedRoleCache.set(runState, roles);
  return roles;
}

function runtimeEntrySubagentReferenceRole(entry: TimelineEntry): string {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return "";
  }
  const toolName = objectString(payload, "tool_name") || entry.text;
  const reference = subagentReferenceFromValues({
    callId: runtimeEntryToolCallId(entry),
    payload: entry.payload,
    toolName,
  });
  return stableTimelineRole(reference?.roleId ?? "");
}

function runtimeEntryIsCoveredByHydratedOutput(
  entry: TimelineEntry,
  runState: RuntimeRunState,
  hydratedText: string,
  hydratedThinkingText: string,
  hydratedToolStates: ReadonlyMap<string, TimelineToolHydrationState>,
  closedRuntimeTextAnchorKey: string | null = null,
): boolean {
  if (runtimeEntryIsCoveredByHydratedTool(entry, hydratedToolStates)) {
    return true;
  }
  if (runtimeEntryIsCoveredByHydratedThinking(entry, hydratedThinkingText)) {
    return true;
  }
  if (entry.kind === "run_completed" && runtimeEntryHasStructuredOutput(entry)) {
    if (closedRuntimeTextAnchorKey === `runtime:${entry.id}`) {
      return false;
    }
    const outputText = normalizedTimelineText(
      rowCopyText(runtimeOutputParts(entry) ?? []),
    );
    return outputText.length > 0 && hydratedText.includes(outputText);
  }
  if (entry.kind === "text_delta" || entry.kind === "output_delta") {
    if (closedRuntimeTextAnchorKey !== null) {
      return false;
    }
    const entryTexts = runtimeHydrationComparisonTexts(entry);
    return entryTexts.some((entryText) => hydratedText.includes(entryText));
  }
  return (
    entry.kind === "run_started" ||
    entry.kind === "run_resumed" ||
    (entry.kind === "run_completed" && !runtimeEntryHasStructuredOutput(entry))
  );
}

function runtimeEntryIsCoveredByHydratedThinking(
  entry: TimelineEntry,
  hydratedThinkingText: string,
): boolean {
  if (entry.kind !== "thinking_delta" || hydratedThinkingText.length === 0) {
    return false;
  }
  const text = normalizedTimelineText(thinkingDeltaText(entry));
  return text.length > 0 && hydratedThinkingText.includes(text);
}

function runtimeEntryAfterThinkingHydration(
  entry: TimelineEntry,
  hydratedThinkingText: string,
): TimelineEntry | null {
  if (entry.kind !== "thinking_delta" || hydratedThinkingText.length === 0) {
    return entry;
  }
  const text = thinkingDeltaText(entry);
  const normalizedText = normalizedTimelineText(text);
  if (normalizedText.length === 0) {
    return entry;
  }
  const normalizedHydratedThinkingText = normalizedTimelineText(
    hydratedThinkingText,
  );
  if (normalizedHydratedThinkingText.includes(normalizedText)) {
    return null;
  }
  const trimmedText = trimHydratedThinkingPrefix(
    text,
    normalizedHydratedThinkingText,
  );
  if (normalizedTimelineText(trimmedText).length === 0) {
    return null;
  }
  return trimmedText === text
    ? entry
    : runtimeThinkingDeltaEntryWithText(entry, trimmedText);
}

function trimHydratedThinkingPrefix(
  text: string,
  normalizedHydratedThinkingText: string,
): string {
  const normalizedText = normalizedTimelineText(text);
  const overlapLength = hydratedThinkingPrefixOverlapLength(
    normalizedHydratedThinkingText,
    normalizedText,
  );
  const minimumOverlapLength = Math.min(
    normalizedText.length,
    Math.max(4, Math.floor(normalizedText.length / 4)),
  );
  if (overlapLength < minimumOverlapLength) {
    return text;
  }
  if (overlapLength >= normalizedText.length) {
    return "";
  }
  const rawIndex = rawIndexAfterNormalizedPrefix(text, overlapLength);
  return text.slice(rawIndex).replace(/^\s+/u, "");
}

function hydratedThinkingPrefixOverlapLength(
  normalizedHydratedThinkingText: string,
  normalizedText: string,
): number {
  if (
    normalizedHydratedThinkingText.length === 0 ||
    normalizedText.length === 0
  ) {
    return 0;
  }
  const firstChar = normalizedText[0];
  if (firstChar === undefined) {
    return 0;
  }
  let index = normalizedHydratedThinkingText.lastIndexOf(firstChar);
  while (index >= 0) {
    const suffix = normalizedHydratedThinkingText.slice(index);
    if (normalizedText.startsWith(suffix)) {
      return suffix.length;
    }
    index = normalizedHydratedThinkingText.lastIndexOf(firstChar, index - 1);
  }
  return 0;
}

function rawIndexAfterNormalizedPrefix(
  text: string,
  normalizedPrefixLength: number,
): number {
  let normalizedLength = 0;
  let pendingWhitespace = false;
  let sawText = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined) {
      continue;
    }
    if (/\s/u.test(char)) {
      if (sawText) {
        pendingWhitespace = true;
      }
      continue;
    }
    if (pendingWhitespace) {
      normalizedLength += 1;
      pendingWhitespace = false;
    }
    sawText = true;
    normalizedLength += 1;
    if (normalizedLength >= normalizedPrefixLength) {
      return index + 1;
    }
  }
  return text.length;
}

function runtimeThinkingDeltaEntryWithText(
  entry: TimelineEntry,
  text: string,
): TimelineEntry {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return entry;
  }
  const textKey = thinkingDeltaTextKey(payload);
  return {
    ...entry,
    payload: {
      ...payload,
      [textKey]: text,
    },
    text,
  };
}

function thinkingDeltaTextKey(payload: Record<string, JsonValue>): string {
  return THINKING_DELTA_TEXT_KEYS.find((key) => typeof payload[key] === "string")
    ?? "text";
}

function runtimeEntryShouldRenderChatContent(entry: TimelineEntry): boolean {
  if (runtimeEntryIsInjection(entry)) {
    return runtimeInjectionEntryIsVisible(entry);
  }
  if (entry.kind === "run_completed" && runtimeEntryHasStructuredOutput(entry)) {
    return true;
  }
  return (
    !HIDDEN_RUNTIME_CHAT_EVENT_KINDS.has(entry.kind) &&
    !runtimeEntryIsInternalStatusNoise(entry)
  );
}

function runtimeEntryIsInternalStatusNoise(entry: TimelineEntry): boolean {
  if (!INTERNAL_RUNTIME_STATUS_NOISE_EVENT_KINDS.has(entry.kind)) {
    return false;
  }
  const payload = jsonObject(entry.payload);
  const status = payload === null
    ? ""
    : objectString(payload, "status") ||
      objectString(payload, "phase") ||
      objectString(payload, "result");
  return runtimeStatusNoiseText(entry.text) || runtimeStatusNoiseText(status);
}

function runtimeStatusNoiseText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "passed" ||
    normalized === "completed" ||
    normalized === "succeeded" ||
    normalized === "success"
  );
}

function runtimeHiddenEntryClosesText(entry: TimelineEntry): boolean {
  return (
    entry.kind === "injection_applied" ||
    entry.kind === "injection_enqueued" ||
    entry.kind === "background_task_completed" ||
    entry.kind === "background_task_stopped" ||
    entry.kind === "run_completed" ||
    entry.kind === "user_question_answered" ||
    entry.kind === "user_question_requested"
  );
}

function runtimeEntryIsCoveredByHydratedTool(
  entry: TimelineEntry,
  hydratedToolStates: ReadonlyMap<string, TimelineToolHydrationState>,
): boolean {
  const runtimeToolKey = runtimeToolHydrationKey(entry);
  if (runtimeToolKey === null) {
    return false;
  }
  const hydratedState = hydratedToolStates.get(runtimeToolKey);
  if (hydratedState === undefined) {
    return false;
  }
  if (entry.kind === "tool_call") {
    return true;
  }
  return hydratedState === "resolved";
}

function runtimeToolHydrationKey(entry: TimelineEntry): string | null {
  if (!runtimeEntryIsToolHydrationCandidate(entry.kind)) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null) {
    return null;
  }
  const callId = objectString(payload, "tool_call_id");
  return callId.length > 0 ? timelineToolHydrationKey(callId) : null;
}

function runtimeEntryIsToolHydrationCandidate(
  kind: TimelineEntry["kind"],
): boolean {
  switch (kind) {
    case "tool_call":
    case "tool_result":
    case "tool_input_validation_failed":
      return true;
    default:
      return false;
  }
}

function timelineToolHydrationKey(callId: string): string {
  return callId.trim();
}

function runtimeHydrationComparisonTexts(entry: TimelineEntry): string[] {
  if (entry.kind === "output_delta") {
    const parts = runtimeOutputParts(entry) ?? [];
    return parts
      .filter((part): part is TimelineTextPart => part.kind === "text")
      .map((part) => normalizedTimelineText(part.text))
      .filter((text) => text.length > 0);
  }
  const text = normalizedTimelineText(entry.text);
  return text.length > 0 ? [text] : [];
}

function normalizedTimelineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function visibleRunIdFromRenderedRows(container: HTMLElement): string | null {
  const containerTop = container.getBoundingClientRect().top;
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(".at-timeline-row[data-run-id]"),
  );
  if (isTimelineNearBottom(container)) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const runId = rows[index]?.dataset.runId;
      if (runId !== undefined && runId.trim().length > 0) {
        return runId;
      }
    }
  }
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
  if (scrollMetric(container.clientHeight) <= 0 || scrollMetric(container.scrollHeight) <= 0) {
    return;
  }
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

function messagesVisibleInTimelineScope(
  messages: TimelineMessage[],
  _rounds: SessionRound[],
  runtimeRunId: string | null,
  fallbackRunId: string | null,
  primaryRoleId: string | null,
): TimelineMessage[] {
  const transcriptMessages = messages.filter(
    (message) => !timelineMessageIsInternalBackgroundTaskNotification(message),
  );
  if (!timelineScopeIsMainSession(runtimeRunId, fallbackRunId)) {
    return transcriptMessages;
  }
  return transcriptMessages.filter(
    (message) =>
      !timelineMessageLooksDetachedSubagent(message, primaryRoleId) &&
      !timelineMessageIsInternalOrchestrationNoise(message),
  );
}

function timelineMessageIsInternalBackgroundTaskNotification(
  message: TimelineMessage,
): boolean {
  const text = timelineMessageSearchText(message);
  return (
    text.includes("<background-task-notification>") ||
    (
      text.includes("A managed background task finished.") &&
      text.includes("wait_background_task(background_task_id)")
    )
  );
}

function timelineMessageSearchText(message: TimelineMessage): string {
  return [
    message.content ?? "",
    message.message?.content ?? "",
    ...messageContentParts(message).map(contentPartSearchText),
  ].join("\n");
}

function contentPartSearchText(part: ContentPart): string {
  const text = contentPartText(part);
  if (text !== null) {
    return text;
  }
  if ("content" in part) {
    return jsonValueText(part.content);
  }
  return "";
}

function timelineScopeIsMainSession(
  runtimeRunId: string | null,
  fallbackRunId: string | null,
): boolean {
  return (
    (runtimeRunId?.trim() ?? "").length === 0 &&
    (fallbackRunId?.trim() ?? "").length === 0
  );
}

function explicitTimelineMessageRunId(message: TimelineMessage): string {
  return (message.run_id ?? message.trace_id ?? "").trim();
}

function timelineMessageLooksDetachedSubagent(
  message: TimelineMessage,
  primaryRoleId: string | null,
): boolean {
  const role = stableTimelineRole(message.role_id ?? message.role ?? "");
  if (timelineMessageHasSubagentToolPart(message)) {
    return false;
  }
  if (timelineMessageHasDetachedSubagentPayload(message)) {
    return true;
  }
  const identifiers = [
    message.instance_id ?? "",
    message.run_id ?? "",
    message.trace_id ?? "",
    message.source ?? "",
  ].join(" ").toLowerCase();
  if (identifiers.includes("subagent")) {
    return true;
  }
  if (!timelineRoleCanBeDetachedAgent(role, primaryRoleId)) {
    return false;
  }
  const instanceId = (message.instance_id?.trim() ?? "");
  if (
    instanceId.length > 0 &&
    timelineIdentifierLooksGeneratedAgentInstance(instanceId)
  ) {
    return true;
  }
  return timelineIdentifiersIncludeGeneratedReference([
    message.run_id ?? "",
    message.trace_id ?? "",
  ]);
}

function timelineMessageIsInternalOrchestrationNoise(
  message: TimelineMessage,
): boolean {
  return (
    timelineRoleIsInternalOrchestration(message.role_id ?? message.role ?? "") ||
    timelineMessageLooksInternalOrchestrationPrompt(message)
  );
}

function timelineRoleIsInternalOrchestration(roleName: string): boolean {
  return INTERNAL_ORCHESTRATION_TIMELINE_ROLES.has(stableTimelineRole(roleName));
}

function timelineRoleIsMainTimelineAgent(roleName: string): boolean {
  return MAIN_TIMELINE_AGENT_ROLES.has(stableTimelineRole(roleName));
}

function timelineMessageLooksInternalOrchestrationPrompt(
  message: TimelineMessage,
): boolean {
  const text = timelineMessageSearchText(message).trim().toLowerCase();
  return (
    text.includes("return only the delegation plan json object") ||
    text.includes("[fake-llm] return only the delegation plan json object")
  );
}

function timelineMessageHasSubagentToolPart(message: TimelineMessage): boolean {
  return messageContentParts(message).some((part) => {
    const kind = contentPartKind(part);
    const toolName = "tool_name" in part ? part.tool_name ?? "" : "";
    return (
      (kind === "tool-call" ||
        kind === "tool-return" ||
        contentPartHasToolCallShape(part)) &&
      toolActionCategory(toolName) === "subagent"
    );
  });
}

function runtimeEntryHasDetachedSubagentPayload(entry: TimelineEntry): boolean {
  if (runtimeEntryIsSubagentToolLifecycle(entry)) {
    return false;
  }
  return jsonValueHasDetachedSubagentMarker(entry.payload, 0);
}

function runtimeEntryIsSubagentToolLifecycle(entry: TimelineEntry): boolean {
  if (
    entry.kind !== "tool_call" &&
    entry.kind !== "tool_input_validation_failed" &&
    entry.kind !== "tool_result"
  ) {
    return false;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return false;
  }
  const toolName = objectString(payload, "tool_name") || entry.text;
  return toolActionCategory(toolName) === "subagent";
}

function timelineMessageHasDetachedSubagentPayload(message: TimelineMessage): boolean {
  return jsonValueHasDetachedSubagentMarker(jsonCompatibleValue(message), 0);
}

function jsonValueHasDetachedSubagentMarker(
  value: JsonValue,
  depth: number,
): boolean {
  if (depth > TIMELINE_SUBAGENT_MARKER_MAX_DEPTH) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) =>
      jsonValueHasDetachedSubagentMarker(item, depth + 1),
    );
  }
  const object = jsonObject(value);
  if (object === null) {
    return false;
  }
  if (jsonObjectHasDetachedSubagentMarker(object)) {
    return true;
  }
  return Object.values(object).some((child) =>
    jsonValueHasDetachedSubagentMarker(child, depth + 1),
  );
}

function jsonObjectHasDetachedSubagentMarker(
  object: Record<string, JsonValue>,
): boolean {
  if (
    objectString(object, "subagent_instance_id").length > 0 ||
    objectString(object, "subagentInstanceId").length > 0 ||
    objectString(object, "subagent_run_id").length > 0 ||
    objectString(object, "subagentRunId").length > 0 ||
    objectString(object, "subagent_role_id").length > 0 ||
    objectString(object, "subagentRoleId").length > 0 ||
    objectString(object, "subagent_kind").length > 0 ||
    objectString(object, "subagentKind").length > 0
  ) {
    return true;
  }
  const kind = objectString(object, "kind").toLowerCase();
  const mode = objectString(object, "mode").toLowerCase();
  return (
    (kind === "subagent" || mode === "subagent") &&
    (
      objectString(object, "run_id").length > 0 ||
      objectString(object, "runId").length > 0 ||
      objectString(object, "instance_id").length > 0 ||
      objectString(object, "instanceId").length > 0
    )
  );
}

function timelineRoleCanBeDetachedAgent(
  roleName: string,
  primaryRoleId: string | null,
): boolean {
  const role = stableTimelineRole(roleName);
  if (
    role === "user" ||
    role.length === 0 ||
    MAIN_TIMELINE_AGENT_ROLES.has(role)
  ) {
    return false;
  }
  const primaryRole = stableTimelineRole(primaryRoleId ?? "");
  return primaryRole.length === 0 || role !== primaryRole;
}

function timelineIdentifierLooksGeneratedAgentInstance(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value.trim());
}

function timelineIdentifiersIncludeGeneratedReference(values: string[]): boolean {
  return values.some((value) => timelineIdentifierLooksGeneratedAgentInstance(value));
}

function mergeTimelineMessages(
  messages: TimelineMessage[],
  rounds: SessionRound[],
): TimelineMessage[] {
  const merged = messages.map((message, index) => ({ index, message }));
  const mergedByKey = new Map<string, { index: number; message: TimelineMessage }>();
  for (const item of merged) {
    for (const key of timelineMessageDedupeKeys(item.message)) {
      mergedByKey.set(key, item);
    }
  }
  for (const message of messages) {
    removeSupersededTimelineMessages(merged, mergedByKey, message);
  }
  let nextIndex = messages.length;
  for (const round of rounds) {
    for (const roundMessage of roundMessages(round)) {
      const message = roundMessageToTimelineMessage(roundMessage, round.run_id);
      removeSupersededTimelineMessages(merged, mergedByKey, message);
      const keys = timelineMessageDedupeKeys(message);
      const existingItem = keys
        .map((key) => mergedByKey.get(key))
        .find((item): item is { index: number; message: TimelineMessage } =>
          item !== undefined,
        );
      if (existingItem !== undefined) {
        existingItem.message = mergeTimelineMessageData(existingItem.message, message);
        for (const key of timelineMessageDedupeKeys(existingItem.message)) {
          mergedByKey.set(key, existingItem);
        }
        continue;
      }
      const item = { index: nextIndex, message };
      for (const key of keys) {
        mergedByKey.set(key, item);
      }
      merged.push(item);
      nextIndex += 1;
    }
  }
  return merged
    .sort((left, right) => compareTimelineMessageItems(left, right))
    .map((item) => item.message);
}

function removeSupersededTimelineMessages(
  merged: Array<{ index: number; message: TimelineMessage }>,
  mergedByKey: Map<string, { index: number; message: TimelineMessage }>,
  message: TimelineMessage,
): void {
  const runId = (message.run_id ?? message.trace_id ?? "").trim();
  const supersededKeys = [
    ...(message.superseded_injection_ids ?? []).map(
      (id) => `injection:${runId}:id:${id.trim()}`,
    ),
    ...(message.superseded_client_message_ids ?? []).map(
      (id) => `injection:${runId}:client:${id.trim()}`,
    ),
  ].filter((key) => !key.endsWith(":"));
  const rowsToRemove = new Set(
    supersededKeys.flatMap((key) => {
      const item = mergedByKey.get(key);
      return item === undefined ||
        normalizedInjectionStatus(
          item.message.injection_status ?? item.message.status,
        ) !== "queued"
        ? []
        : [item];
    }),
  );
  if (rowsToRemove.size === 0) {
    return;
  }
  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const item = merged[index];
    if (item !== undefined && rowsToRemove.has(item)) {
      merged.splice(index, 1);
    }
  }
  for (const [key, item] of mergedByKey) {
    if (rowsToRemove.has(item)) {
      mergedByKey.delete(key);
    }
  }
}

function mergeTimelineMessageData(
  existing: TimelineMessage,
  next: TimelineMessage,
): TimelineMessage {
  const merged: TimelineMessage = { ...existing };
  mergeTimelineMessageStringField(merged, next, "run_id");
  mergeTimelineMessageStringField(merged, next, "trace_id");
  mergeTimelineMessageStringField(merged, next, "role_id");
  mergeTimelineMessageStringField(merged, next, "role");
  mergeTimelineMessageStringField(merged, next, "instance_id");
  mergeTimelineMessageStringField(merged, next, "created_at");
  mergeTimelineMessageStringField(merged, next, "client_message_id");
  mergeTimelineMessageStringField(merged, next, "entry_type");
  mergeTimelineMessageStringField(merged, next, "injection_id");
  mergeTimelineMessageStringField(merged, next, "recipient_instance_id");
  mergeTimelineMessageStringField(merged, next, "source");
  mergeTimelineMessageStringField(merged, next, "visibility");
  if (timelineMessageIsInjection(merged) || timelineMessageIsInjection(next)) {
    mergeTimelineInjectionStatus(merged, next);
  } else {
    mergeTimelineMessageStringField(merged, next, "status");
  }
  if ((merged.content?.trim() ?? "").length === 0 && (next.content?.trim() ?? "").length > 0) {
    merged.content = next.content;
  }
  if ((merged.parts?.length ?? 0) === 0 && (next.parts?.length ?? 0) > 0) {
    merged.parts = next.parts;
  } else {
    const mergedParts = mergeTimelineMessageParts(merged.parts, next.parts);
    if (mergedParts !== undefined) {
      merged.parts = mergedParts;
    }
  }
  const messageBody = mergeTimelineMessageBody(merged.message, next.message);
  if (messageBody !== undefined) {
    merged.message = messageBody;
  }
  return merged;
}

type TimelineMessageStringField =
  | "client_message_id"
  | "created_at"
  | "entry_type"
  | "injection_id"
  | "instance_id"
  | "role"
  | "role_id"
  | "recipient_instance_id"
  | "run_id"
  | "source"
  | "status"
  | "trace_id"
  | "visibility";

function timelineMessageIsInjection(message: TimelineMessage): boolean {
  return (message.entry_type ?? "").trim().toLowerCase() === "injection";
}

function mergeTimelineInjectionStatus(
  target: TimelineMessage,
  source: TimelineMessage,
): void {
  const current = normalizedInjectionStatus(
    target.injection_status ?? target.status,
  );
  const nextStatus = normalizedInjectionStatus(
    source.injection_status ?? source.status,
  );
  const priority: Record<TimelineInjectionRow["status"], number> = {
    applied: 2,
    failed: 3,
    queued: 1,
  };
  if (priority[nextStatus] >= priority[current]) {
    target.injection_status = nextStatus;
    target.status = nextStatus;
  }
}

function mergeTimelineMessageStringField(
  target: TimelineMessage,
  source: TimelineMessage,
  field: TimelineMessageStringField,
): void {
  const current = target[field]?.trim() ?? "";
  const next = source[field]?.trim() ?? "";
  if (current.length === 0 && next.length > 0) {
    target[field] = source[field];
  }
}

function mergeTimelineMessageBody(
  existing: TimelineMessage["message"],
  next: TimelineMessage["message"],
): TimelineMessage["message"] {
  if (existing === undefined) {
    return next;
  }
  if (next === undefined) {
    return existing;
  }
  const merged = { ...existing };
  if ((merged.content?.trim() ?? "").length === 0 && (next.content?.trim() ?? "").length > 0) {
    merged.content = next.content;
  }
  if ((merged.parts?.length ?? 0) === 0 && (next.parts?.length ?? 0) > 0) {
    merged.parts = next.parts;
  } else {
    const mergedParts = mergeTimelineMessageParts(merged.parts, next.parts);
    if (mergedParts !== undefined) {
      merged.parts = mergedParts;
    }
  }
  return merged;
}

function mergeTimelineMessageParts(
  existing: ContentPart[] | undefined,
  next: ContentPart[] | undefined,
): ContentPart[] | undefined {
  if (existing === undefined || existing.length === 0) {
    return next;
  }
  if (next === undefined || next.length === 0) {
    return existing;
  }
  return timelineMessagePartsShouldReplace(existing, next) ? next : existing;
}

function timelineMessagePartsShouldReplace(
  existing: ContentPart[],
  next: ContentPart[],
): boolean {
  const existingText = normalizedTimelineText(
    existing.map(contentPartText).filter((text): text is string => text !== null).join(" "),
  );
  const nextText = normalizedTimelineText(
    next.map(contentPartText).filter((text): text is string => text !== null).join(" "),
  );
  if (existingText.length === 0 || nextText.length === 0) {
    return timelineMessagePartsRichness(next) > timelineMessagePartsRichness(existing);
  }
  if (existingText !== nextText && !nextText.includes(existingText)) {
    return false;
  }
  return timelineMessagePartsRichness(next) > timelineMessagePartsRichness(existing);
}

function timelineMessagePartsRichness(parts: ContentPart[]): number {
  let score = parts.length;
  for (const part of parts) {
    if (contentPartTimelineKind(part) !== "text") {
      score += 100;
    }
  }
  return score;
}

function contentPartTimelineKind(part: ContentPart): string {
  if ("part_kind" in part) {
    return part.part_kind;
  }
  if ("kind" in part) {
    return part.kind;
  }
  return "";
}

function compareTimelineMessageItems(
  left: { index: number; message: TimelineMessage },
  right: { index: number; message: TimelineMessage },
): number {
  const leftTimestamp = timestampMs(timelineMessageOccurredAt(left.message));
  const rightTimestamp = timestampMs(timelineMessageOccurredAt(right.message));
  if (leftTimestamp !== null && rightTimestamp !== null) {
    const diff = leftTimestamp - rightTimestamp;
    return diff === 0 ? left.index - right.index : diff;
  }
  return left.index - right.index;
}

function roundMessageToTimelineMessage(
  message: SessionRoundMessage,
  runId: string,
): TimelineMessage {
  const contentParts = message.content_parts ?? [];
  const bodyParts = roundMessageParts(message.message?.parts ?? []);
  const bodyContent = jsonValueText(message.message?.content ?? null);
  return {
    client_message_id: message.client_message_id,
    content: message.content,
    created_at: message.queued_at ?? message.created_at ?? message.occurred_at,
    entry_type: message.entry_type,
    injection_id: message.injection_id,
    injection_status: message.injection_status,
    recipient_instance_id: message.recipient_instance_id,
    instance_id: message.instance_id,
    message: {
      ...(bodyContent.trim().length > 0 ? { content: bodyContent } : {}),
      ...(bodyParts.length > 0 ? { parts: bodyParts } : {}),
    },
    message_id: message.message_id,
    parts: contentParts.length > 0 ? contentParts : undefined,
    role: message.role,
    role_id: message.role_id,
    run_id: runId,
    source: message.source,
    status: message.status,
    superseded_client_message_ids: message.superseded_client_message_ids,
    superseded_injection_ids: message.superseded_injection_ids,
    visibility: message.visibility,
  };
}

function roundMessageParts(parts: SessionRoundMessagePart[]): ContentPart[] {
  return parts.flatMap((part) => {
    const contentPart = roundMessagePart(part);
    return contentPart === null ? [] : [contentPart];
  });
}

function roundMessagePart(part: SessionRoundMessagePart): ContentPart | null {
  const kind = part.part_kind ?? part.kind ?? "";
  const text = roundMessagePartText(part);
  if (kind === "text" && text.length > 0) {
    return { part_kind: "text", content: text };
  }
  if (kind === "user-prompt") {
    return { part_kind: "user-prompt", content: text };
  }
  if (kind === "thinking") {
    return {
      part_kind: "thinking",
      content: text,
    };
  }
  if (kind === "media_ref") {
    return {
      part_kind: "media_ref",
      media_type: part.mime_type,
      name: part.name,
      url: part.url,
    };
  }
  if (kind === "tool-call") {
    return {
      part_kind: "tool-call",
      args: part.args,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  if (kind === "tool-return") {
    return {
      part_kind: "tool-return",
      content: part.content,
      is_error: part.is_error,
      outcome: part.outcome,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  if (kind === "retry-prompt") {
    return {
      part_kind: "retry-prompt",
      content: part.content,
      tool_call_id: part.tool_call_id,
      tool_name: part.tool_name,
    };
  }
  return null;
}

function roundMessagePartText(part: SessionRoundMessagePart): string {
  if (typeof part.text === "string") {
    return part.text;
  }
  return jsonValueText(part.content ?? null);
}

function timelineMessageDedupeKeys(message: TimelineMessage): string[] {
  return [
    ...timelineMessageInjectionDedupeKeys(message),
    timelineMessageIdDedupeKey(message),
    timelineMessageFingerprintDedupeKey(message),
    timelineMessageContentDedupeKey(message),
  ].filter((key): key is string => key !== null);
}

function timelineMessageInjectionDedupeKeys(message: TimelineMessage): string[] {
  if ((message.entry_type ?? "").trim().toLowerCase() !== "injection") {
    return [];
  }
  const runId = (message.run_id ?? message.trace_id ?? "").trim();
  const injectionId = message.injection_id?.trim() ?? "";
  const clientMessageId = message.client_message_id?.trim() ?? "";
  return [
    injectionId.length > 0 ? `injection:${runId}:id:${injectionId}` : "",
    clientMessageId.length > 0 ? `injection:${runId}:client:${clientMessageId}` : "",
  ].filter(Boolean);
}

function timelineMessageIdDedupeKey(message: TimelineMessage): string | null {
  const messageId = message.message_id?.trim() ?? "";
  if (messageId.length > 0) {
    return `id:${messageId}`;
  }
  return null;
}

function timelineMessageFingerprintDedupeKey(message: TimelineMessage): string {
  return [
    "fingerprint",
    message.run_id ?? message.trace_id ?? "",
    timelineMessageOccurredAt(message),
    message.entry_type ?? "",
    message.role_id ?? message.role ?? "",
    timelineMessagePrimaryText(message),
  ].join(":");
}

function timelineMessageContentDedupeKey(message: TimelineMessage): string | null {
  const runId = (message.run_id ?? message.trace_id ?? "").trim();
  const text = normalizedTimelineText(timelineMessagePrimaryText(message));
  if (runId.length === 0 || text.length === 0) {
    return null;
  }
  return [
    "content",
    runId,
    message.entry_type ?? "",
    timelineMessageStableRole(message),
    text,
  ].join(":");
}

function timelineMessageStableRole(message: TimelineMessage): string {
  return stableTimelineRole(message.role_id ?? message.role ?? "");
}

function stableTimelineRole(roleName: string): string {
  const role = roleName.trim().toLowerCase();
  if (role === "agent" || role === "assistant" || role === "mainagent") {
    return "assistant";
  }
  return role;
}

function messageRunIdentity(
  message: TimelineMessage,
  roundLookup: MessageRoundLookup,
  fallbackRunId: string | null,
): {
  runId: string | null;
  source: TimelineRunIdSource | null;
} {
  const explicitRunId = message.run_id?.trim() ?? "";
  if (explicitRunId.length > 0) {
    return { runId: explicitRunId, source: "run_id" };
  }
  const traceRunId = message.trace_id?.trim() ?? "";
  if (traceRunId.length > 0) {
    return { runId: traceRunId, source: "trace_id" };
  }
  const messageId = message.message_id?.trim();
  if (messageId !== undefined && messageId.length > 0) {
    const runId = roundLookup.runIdByMessageId.get(messageId);
    if (runId !== undefined) {
      return { runId, source: "round" };
    }
  }
  const createdAt = timestampMs(timelineMessageOccurredAt(message));
  if (createdAt !== null) {
    const exactRunId = roundLookup.runIdByCreatedAt.get(createdAt);
    if (exactRunId !== undefined) {
      return { runId: exactRunId, source: "round" };
    }
    const boundaryRunId = runIdForTimestamp(createdAt, roundLookup.boundaries);
    if (boundaryRunId !== null) {
      return { runId: boundaryRunId, source: "round" };
    }
  }
  const normalizedFallbackRunId = fallbackRunId?.trim() ?? "";
  return normalizedFallbackRunId.length > 0
    ? { runId: normalizedFallbackRunId, source: "fallback" }
    : { runId: null, source: null };
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

function timelineMessageOccurredAt(message: TimelineMessage): string {
  return (
    message.queued_at ??
    message.created_at ??
    message.occurred_at ??
    message.applied_at ??
    ""
  ).trim();
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
    runtimeTextDeltaIsCursorPlaceholder(entry),
  );
}

function applyRuntimeOutputDeltaEvent(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  nextTextSegmentSequence: () => number,
): boolean {
  const parts = runtimeOutputParts(entry);
  if (parts === null) {
    return false;
  }
  if (parts.length === 0) {
    return appendRuntimeTextSegment(
      entry,
      runtimeTextDeltaText(entry),
      rows,
      activeText,
      nextTextSegmentSequence,
    );
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
    closeRuntimeTextSegment(entry, rows, activeText);
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
  allowEmpty = false,
): boolean {
  if (!text && !allowEmpty) {
    return false;
  }
  const groupKey = runtimeTextGroupKey(entry);
  const existing = activeText.get(groupKey);
  if (existing !== undefined) {
    existing.part.text += text;
    existing.row.text = existing.part.text;
    if (text.length > 0) {
      existing.placeholder = false;
      delete existing.part.cursorOnly;
    }
    return true;
  }
  const accumulator = createRuntimeTextAccumulator(
    entry,
    text,
    nextTextSegmentSequence(),
    allowEmpty,
  );
  activeText.set(groupKey, accumulator);
  rows.push(accumulator.row);
  return true;
}

function runtimeTextDeltaIsCursorPlaceholder(entry: TimelineEntry): boolean {
  const payload = jsonObject(entry.payload);
  return (
    payload?.hydration_cursor_placeholder === true ||
    payload?.idle_cursor_placeholder === true ||
    payload?.pending_cursor_placeholder === true
  );
}

function createRuntimeTextAccumulator(
  entry: TimelineEntry,
  text: string,
  sequence: number,
  placeholder: boolean,
): RuntimeTextAccumulator {
  const part = timelineTextPart(text, true);
  if (placeholder && text.length === 0) {
    part.cursorOnly = true;
  }
  return {
    part,
    placeholder,
    row: {
      key: runtimeTextRowKey(entry, sequence),
      role: entry.roleId,
      instanceId: entry.instanceId || null,
      text,
      kind: entry.kind,
      parts: [part],
      roundMarker: null,
      runId: entry.runId,
      source: "runtime",
      copyable: isAnswerRole(entry.roleId) && text.trim().length > 0,
    },
  };
}

function runtimeTextRowKey(entry: TimelineEntry, sequence: number): string {
  return `runtime-text:${entry.runId}:${runtimeStreamKey(entry)}:${sequence}`;
}

function closeRuntimeTextSegment(
  entry: TimelineEntry,
  rows: TimelineRow[],
  activeText: Map<string, RuntimeTextAccumulator>,
  reveal = true,
): void {
  const groupKey = runtimeTextGroupKey(entry);
  const existing = activeText.get(groupKey);
  if (existing !== undefined) {
    closeRuntimeTextAccumulator(rows, existing, reveal);
  }
  activeText.delete(groupKey);
}

function closeRuntimeTextAccumulator(
  rows: TimelineRow[],
  existing: RuntimeTextAccumulator,
  reveal = true,
): void {
  if (existing.placeholder && existing.part.text.length === 0) {
    const rowIndex = rows.indexOf(existing.row);
    if (rowIndex >= 0) {
      rows.splice(rowIndex, 1);
    }
    return;
  }
  if (reveal) {
    existing.part.reveal = true;
  } else {
    delete existing.part.reveal;
  }
  existing.part.streaming = false;
}

function timelineTextPart(
  text: string,
  streaming = false,
  reveal = false,
): TimelineTextPart {
  return {
    kind: "text",
    ...(reveal ? { reveal } : {}),
    streaming,
    text,
  };
}

function runtimeTextGroupKey(entry: TimelineEntry): string {
  return `${entry.runId}:${runtimeStreamKey(entry)}`;
}

function runtimeStreamKey(entry: TimelineEntry): string {
  return entry.instanceId || entry.roleId;
}

function runtimeEntryParts(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): TimelineRenderPart[] {
  if (!runtimeEntryShouldRenderChatContent(entry)) {
    return [];
  }
  const runtimeMessageParts = runtimeMessageRenderParts(entry);
  if (runtimeMessageParts !== null) {
    return runtimeMessageParts;
  }
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
  const subagentPanelParts = runtimeSubagentPanelStructuredEventParts(entry, variant);
  if (subagentPanelParts !== null) {
    return subagentPanelParts;
  }
  const structuredText = runtimeStructuredEventText(entry, variant);
  if (structuredText !== null) {
    return [timelineTextPart(structuredText)];
  }
  const fallbackText = runtimeFallbackText(entry);
  return fallbackText.trim().length > 0 ? [timelineTextPart(fallbackText)] : [];
}

function runtimeMessageRenderParts(entry: TimelineEntry): TimelineRenderPart[] | null {
  if (entry.kind !== "message") {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const payloadParts = runtimeMessageContentParts(payload);
  if (payloadParts.length > 0) {
    return payloadParts.flatMap((part) => contentPartToRenderParts(part, null));
  }
  const text =
    objectRawString(payload, "text") ||
    objectRawString(payload, "content") ||
    objectRawString(payload, "message") ||
    runtimeNestedMessageText(payload);
  if (text.trim().length === 0 || runtimeMessageTextIsProtocolPlaceholder(payload, text)) {
    return [];
  }
  return textRenderParts(timelineDisplayText(text), null);
}

function runtimeNestedMessageText(payload: Record<string, JsonValue>): string {
  const message = jsonObject(payload.message);
  if (message === null) {
    return "";
  }
  return objectRawString(message, "text") || objectRawString(message, "content");
}

function runtimeMessageTextIsProtocolPlaceholder(
  payload: Record<string, JsonValue>,
  text: string,
): boolean {
  const directMessage = objectRawString(payload, "message");
  return (
    directMessage.trim().toLowerCase() === "message" &&
    objectRawString(payload, "text").trim().length === 0 &&
    objectRawString(payload, "content").trim().length === 0 &&
    text.trim().toLowerCase() === "message"
  );
}

function runtimeMessageContentParts(payload: Record<string, JsonValue>): ContentPart[] {
  const directParts = jsonContentParts(payload.parts);
  if (directParts.length > 0) {
    return directParts;
  }
  const message = jsonObject(payload.message);
  return message === null ? [] : jsonContentParts(message.parts);
}

function jsonContentParts(value: JsonValue | undefined): ContentPart[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((part) => {
    const contentPart = jsonContentPart(part);
    return contentPart === null ? [] : [contentPart];
  });
}

function jsonContentPart(value: JsonValue): ContentPart | null {
  const object = jsonObject(value);
  if (object === null || !jsonObjectLooksLikeContentPart(object)) {
    return null;
  }
  return object as unknown as ContentPart;
}

function jsonObjectLooksLikeContentPart(object: Record<string, JsonValue>): boolean {
  return (
    objectString(object, "kind").length > 0 ||
    objectString(object, "part_kind").length > 0 ||
    objectString(object, "text").length > 0 ||
    objectString(object, "content").length > 0 ||
    "args" in object ||
    "tool_name" in object ||
    "url" in object
  );
}

function runtimeFallbackText(entry: TimelineEntry): string {
  if (entry.kind === "message" && entry.text.trim().toLowerCase() === "message") {
    return "";
  }
  if (
    entry.kind === "subagent_session_status_changed" ||
    entry.kind.startsWith("background_task_")
  ) {
    return "";
  }
  return entry.text;
}

function runtimeSubagentPanelStructuredEventParts(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): TimelineRenderPart[] | null {
  if (variant !== "subagent-panel") {
    return null;
  }
  if (
    entry.kind === "subagent_session_status_changed" ||
    entry.kind === "background_task_started" ||
    entry.kind === "background_task_completed" ||
    entry.kind === "background_task_stopped"
  ) {
    return [];
  }
  if (entry.kind !== "background_task_updated") {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return [];
  }
  const text = runtimeBackgroundTaskPrimaryText(entry.kind, payload);
  return text.trim().length > 0 ? [timelineTextPart(text)] : [];
}

function runtimeStructuredEventText(
  entry: TimelineEntry,
  variant: "session" | "subagent-panel",
): string | null {
  if (
    variant === "subagent-panel" &&
    (
      entry.kind === "subagent_session_status_changed" ||
      entry.kind.startsWith("background_task_")
    )
  ) {
    return null;
  }
  if (entry.kind === "token_usage") {
    return runtimeTokenUsageText(entry);
  }
  if (entry.kind === "state_snapshot" || entry.kind === "state_delta") {
    return runtimeStateEventText(entry);
  }
  if (entry.kind === "todo_updated") {
    return runtimeTodoUpdatedText(entry);
  }
  const lifecycleText = runtimeLifecycleEventText(entry);
  if (lifecycleText !== null) {
    return lifecycleText;
  }
  const coordinationText = runtimeCoordinationEventText(entry);
  if (coordinationText !== null) {
    return coordinationText;
  }
  return null;
}

function runtimeTokenUsageText(entry: TimelineEntry): string | null {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const total = objectNumber(payload, "total_tokens");
  const input = objectNumber(payload, "input_tokens");
  const output = objectNumber(payload, "output_tokens");
  const cached = objectNumber(payload, "cached_input_tokens");
  const reasoning = objectNumber(payload, "reasoning_output_tokens");
  const parts = [
    total > 0 ? `Total ${formatRuntimeCount(total)}` : "",
    input > 0 ? `Input ${formatRuntimeCount(input)}` : "",
    cached > 0 ? `Cached ${formatRuntimeCount(cached)}` : "",
    output > 0 ? `Output ${formatRuntimeCount(output)}` : "",
    reasoning > 0 ? `Reasoning ${formatRuntimeCount(reasoning)}` : "",
  ].filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return `Token usage: ${parts.join(" · ")}`;
}

function runtimeStateEventText(entry: TimelineEntry): string | null {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const summary = runtimePayloadSummary(payload);
  if (summary.length === 0) {
    return null;
  }
  const label = entry.kind === "state_snapshot" ? "State snapshot" : "State delta";
  return `${label}: ${summary}`;
}

function runtimePayloadSummary(payload: Record<string, JsonValue>): string {
  return objectString(payload, "summary")
    || objectString(payload, "title")
    || objectString(payload, "message")
    || objectString(payload, "status")
    || runtimeScalarFieldSummary(payload)
    || truncatePreview(firstNonEmptyLine(jsonValueText(payload)));
}

function runtimeScalarFieldSummary(payload: Record<string, JsonValue>): string {
  return Object.entries(payload)
    .flatMap(([key, value]) => {
      const text = jsonScalarText(value);
      return text.length > 0 ? [`${key}: ${text}`] : [];
    })
    .slice(0, 3)
    .join(" · ");
}

function runtimeTodoUpdatedText(entry: TimelineEntry): string | null {
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const items = Array.isArray(payload.items)
    ? payload.items.flatMap((item) => {
        const todo = jsonObject(item);
        return todo === null ? [] : [todo];
      })
    : [];
  const counts = runtimeTodoStatusCounts(items);
  const activeItem = runtimeTodoActiveItem(items);
  const version = objectNumber(payload, "version");
  const updatedBy = objectString(payload, "updated_by_instance_id")
    || objectString(payload, "updated_by_role_id");
  const fallbackSummary = objectString(payload, "summary")
    || objectString(payload, "title")
    || objectString(payload, "message");
  const parts = [
    items.length > 0 ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "",
    counts.length > 0 ? counts.join(", ") : "",
    activeItem.length > 0 ? `Current ${activeItem}` : "",
    version > 0 ? `v${formatRuntimeCount(version)}` : "",
    updatedBy.length > 0 ? `by ${updatedBy}` : "",
    items.length === 0 ? fallbackSummary : "",
  ].filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return `Todo updated: ${parts.join(" · ")}`;
}

function runtimeTodoStatusCounts(items: Record<string, JsonValue>[]): string[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const status = objectString(item, "status");
    if (status.length > 0) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  });
  return Array.from(counts.entries()).map(
    ([status, count]) => `${formatRuntimeCount(count)} ${status}`,
  );
}

function runtimeTodoActiveItem(items: Record<string, JsonValue>[]): string {
  const inProgress = items.find((item) => objectString(item, "status") === "in_progress");
  const pending = items.find((item) => objectString(item, "status") === "pending");
  const firstItem = inProgress ?? pending ?? items.at(0);
  return firstItem === undefined ? "" : objectString(firstItem, "content");
}

function runtimeLifecycleEventText(entry: TimelineEntry): string | null {
  const label = runtimeLifecycleEventLabel(entry.kind);
  if (label === null) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const summary = runtimeLifecycleEventSummary(entry.kind, payload);
  if (summary.length === 0) {
    return null;
  }
  return `${label}: ${summary}`;
}

function runtimeLifecycleEventLabel(kind: string): string | null {
  switch (kind) {
    case "model_step_started":
      return "Model step started";
    case "model_step_finished":
      return "Model step finished";
    case "notification_requested":
      return "Notification";
    case "background_task_started":
      return "Background task started";
    case "background_task_updated":
      return "Background task updated";
    case "background_task_completed":
      return "Background task completed";
    case "background_task_stopped":
      return "Background task stopped";
    default:
      return null;
  }
}

function runtimeLifecycleEventSummary(
  kind: string,
  payload: Record<string, JsonValue>,
): string {
  if (kind === "model_step_started" || kind === "model_step_finished") {
    return runtimeModelStepSummary(payload);
  }
  if (kind === "notification_requested") {
    return runtimeNotificationSummary(payload);
  }
  if (kind.startsWith("background_task_")) {
    return runtimeBackgroundTaskSummary(kind, payload);
  }
  return runtimePayloadSummary(payload);
}

function runtimeModelStepSummary(payload: Record<string, JsonValue>): string {
  const roleId = objectString(payload, "role_id");
  const instanceId = objectString(payload, "instance_id");
  const parts = [
    roleId.length > 0 ? `role ${roleId}` : "",
    instanceId.length > 0 ? `instance ${instanceId}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : runtimePayloadSummary(payload);
}

function runtimeNotificationSummary(payload: Record<string, JsonValue>): string {
  const title = objectString(payload, "title")
    || objectString(payload, "body")
    || runtimePayloadSummary(payload);
  const notificationType = objectString(payload, "notification_type")
    || objectString(payload, "type");
  const channels = jsonStringArrayInlineText(payload.channels);
  return [
    title,
    notificationType.length > 0 ? `type ${notificationType}` : "",
    channels.length > 0 ? `channels ${channels}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeBackgroundTaskSummary(
  kind: string,
  payload: Record<string, JsonValue>,
): string {
  const primary = runtimeBackgroundTaskPrimaryText(kind, payload);
  const status = objectString(payload, "status");
  const exitCode = jsonScalarText(payload.exit_code);
  const taskKind = objectString(payload, "kind");
  const taskId = objectString(payload, "background_task_id");
  return [
    primary.length > 0 ? truncatePreview(primary) : "",
    status.length > 0 ? `status ${status}` : "",
    exitCode.length > 0 ? `exit ${exitCode}` : "",
    taskKind.length > 0 ? `kind ${taskKind}` : "",
    taskId.length > 0 ? `#${taskId}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeBackgroundTaskPrimaryText(
  kind: string,
  payload: Record<string, JsonValue>,
): string {
  if (kind === "background_task_updated") {
    return objectString(payload, "delta")
      || objectString(payload, "output_excerpt")
      || objectString(payload, "title")
      || objectString(payload, "command")
      || runtimePayloadSummary(payload);
  }
  return objectString(payload, "title")
    || objectString(payload, "input_text")
    || objectString(payload, "command")
    || objectString(payload, "output_excerpt")
    || runtimePayloadSummary(payload);
}

function runtimeCoordinationEventText(entry: TimelineEntry): string | null {
  const label = runtimeCoordinationEventLabel(entry.kind);
  if (label === null) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const summary = runtimeCoordinationEventSummary(entry.kind, payload);
  if (summary.length === 0) {
    return null;
  }
  return `${label}: ${summary}`;
}

function runtimeCoordinationEventLabel(kind: string): string | null {
  switch (kind) {
    case "user_question_requested":
      return "User question";
    case "user_question_answered":
      return "User question answered";
    case "injection_enqueued":
      return "Injection queued";
    case "injection_applied":
      return "Injection applied";
    case "subagent_session_status_changed":
      return "Subagent status";
    case "subagent_stopped":
      return "Subagent stopped";
    case "subagent_resumed":
      return "Subagent resumed";
    case "awaiting_manual_action":
      return "Awaiting manual action";
    case "run_started":
      return "Run started";
    case "run_paused":
      return "Run paused";
    case "run_resumed":
      return "Run resumed";
    case "run_completed":
      return "Run completed";
    case "run_stopped":
      return "Run stopped";
    case "run_failed":
      return "Run failed";
    default:
      return null;
  }
}

function runtimeCoordinationEventSummary(
  kind: string,
  payload: Record<string, JsonValue>,
): string {
  if (kind === "user_question_requested") {
    return runtimeUserQuestionRequestedSummary(payload);
  }
  if (kind === "user_question_answered") {
    return runtimeUserQuestionAnsweredSummary(payload);
  }
  if (kind === "injection_enqueued" || kind === "injection_applied") {
    return runtimeInjectionSummary(payload);
  }
  if (kind === "subagent_session_status_changed") {
    return runtimeSubagentStatusSummary(payload);
  }
  if (kind === "subagent_stopped" || kind === "subagent_resumed") {
    return runtimeSubagentLifecycleSummary(payload);
  }
  if (kind === "awaiting_manual_action") {
    return runtimeManualActionSummary(payload);
  }
  if (kind.startsWith("run_")) {
    return runtimeRunLifecycleSummary(payload);
  }
  return runtimePayloadSummary(payload);
}

function runtimeUserQuestionRequestedSummary(payload: Record<string, JsonValue>): string {
  const questions = Array.isArray(payload.questions)
    ? payload.questions.flatMap((item) => {
        const question = jsonObject(item);
        return question === null ? [] : [question];
      })
    : [];
  const firstQuestion = questions.at(0);
  const text = firstQuestion === undefined
    ? runtimePayloadSummary(payload)
    : objectString(firstQuestion, "question")
      || objectString(firstQuestion, "header")
      || runtimePayloadSummary(firstQuestion);
  const questionId = objectString(payload, "question_id");
  return [
    text.length > 0 ? truncatePreview(text) : "",
    questions.length > 1 ? `${questions.length} questions` : "",
    questionId.length > 0 ? `#${questionId}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeUserQuestionAnsweredSummary(payload: Record<string, JsonValue>): string {
  const questionId = objectString(payload, "question_id");
  const status = objectString(payload, "status");
  const answerCount = Array.isArray(payload.answers) ? payload.answers.length : 0;
  return [
    status.length > 0 ? `status ${status}` : "",
    answerCount > 0 ? `${answerCount} ${answerCount === 1 ? "answer" : "answers"}` : "",
    questionId.length > 0 ? `#${questionId}` : "",
    status.length === 0 && answerCount === 0 ? runtimePayloadSummary(payload) : "",
  ].filter(Boolean).join(" · ");
}

function runtimeInjectionSummary(payload: Record<string, JsonValue>): string {
  const content = runtimeContentValueText(payload.content);
  const redactedLength = objectNumber(payload, "content_length");
  const source = objectString(payload, "source");
  const deliveryMode = objectString(payload, "delivery_mode")
    || objectString(payload, "internal_delivery_mode");
  const recipient = objectString(payload, "recipient_instance_id");
  return [
    content.length > 0 ? truncatePreview(content) : "",
    content.length === 0 && redactedLength > 0 ? `redacted ${formatRuntimeCount(redactedLength)} chars` : "",
    source.length > 0 ? `source ${source}` : "",
    deliveryMode.length > 0 ? `mode ${deliveryMode}` : "",
    recipient.length > 0 ? `to ${recipient}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeSubagentStatusSummary(payload: Record<string, JsonValue>): string {
  const title = objectString(payload, "title");
  const status = objectString(payload, "status")
    || objectString(payload, "run_status");
  const phase = objectString(payload, "run_phase");
  const roleId = objectString(payload, "subagent_role_id")
    || objectString(payload, "role_id");
  const instanceId = objectString(payload, "subagent_instance_id")
    || objectString(payload, "instance_id");
  return [
    title.length > 0 ? truncatePreview(title) : "",
    status.length > 0 ? `status ${status}` : "",
    phase.length > 0 ? `phase ${phase}` : "",
    roleId.length > 0 ? `role ${roleId}` : "",
    instanceId.length > 0 ? `instance ${instanceId}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeSubagentLifecycleSummary(payload: Record<string, JsonValue>): string {
  const reason = objectString(payload, "reason");
  const roleId = objectString(payload, "role_id");
  const instanceId = objectString(payload, "instance_id");
  const taskId = objectString(payload, "task_id");
  return [
    reason.length > 0 ? `reason ${reason}` : "",
    roleId.length > 0 ? `role ${roleId}` : "",
    instanceId.length > 0 ? `instance ${instanceId}` : "",
    taskId.length > 0 ? `task ${taskId}` : "",
  ].filter(Boolean).join(" · ");
}

function runtimeManualActionSummary(payload: Record<string, JsonValue>): string {
  const rootTaskId = objectString(payload, "root_task_id")
    || objectString(payload, "root_task");
  return rootTaskId.length > 0 ? `root task ${rootTaskId}` : runtimePayloadSummary(payload);
}

function runtimeRunLifecycleSummary(payload: Record<string, JsonValue>): string {
  const status = objectString(payload, "status");
  const output = objectString(payload, "output")
    || objectString(payload, "message")
    || objectString(payload, "error")
    || objectString(payload, "reason");
  const rootTaskId = objectString(payload, "root_task_id")
    || objectString(payload, "root_task");
  const hasPrimarySummary =
    status.length > 0 || output.length > 0 || rootTaskId.length > 0;
  return [
    status.length > 0 ? `status ${status}` : "",
    output.length > 0 ? truncatePreview(output) : "",
    rootTaskId.length > 0 ? `root task ${rootTaskId}` : "",
    hasPrimarySummary || Object.keys(payload).length === 0
      ? ""
      : runtimePayloadSummary(payload),
  ].filter(Boolean).join(" · ");
}

function runtimeContentValueText(value: JsonValue | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return jsonContentParts(value)
    .map(contentPartText)
    .filter((text): text is string => text !== null && text.trim().length > 0)
    .join("\n")
    .trim();
}

function runtimeOutputParts(entry: TimelineEntry): TimelineRenderPart[] | null {
  if (entry.kind !== "output_delta" && entry.kind !== "run_completed") {
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

function runtimeEntryHasStructuredOutput(entry: TimelineEntry): boolean {
  const parts = runtimeOutputParts(entry);
  return parts !== null && parts.length > 0;
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
  return text ? timelineTextPart(text) : null;
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

function MessageRowContent({
  expandedDisclosureIds,
  onDisclosureChange,
  onDisclosureToggle,
  onSubagentOpen,
  parts,
  row,
  sessionId,
  t,
}: {
  expandedDisclosureIds: ReadonlySet<string>;
  onDisclosureChange: (disclosureId: string, expanded: boolean) => void;
  onDisclosureToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  parts: TimelineRenderPart[];
  row: TimelineRow;
  sessionId: string;
  t: Translate;
}) {
  let textIndex = 0;
  let toolIndex = 0;
  let thinkingIndex = 0;
  let mediaIndex = 0;
  return (
    <div className="at-message-content">
      {parts.map((part) => {
        if (part.kind === "text") {
          const partKey = `text:${textIndex}`;
          textIndex += 1;
          return (
            <MessageText
              key={partKey}
              part={part}
              streamIdentity={streamIdentityForTextPart(row, partKey)}
            />
          );
        }
        if (part.kind === "tool") {
          const partKey = `tool:${toolIndex}`;
          toolIndex += 1;
          const disclosureId = toolDisclosureId(row, part, partKey);
          return (
            <MessageToolBlock
              disclosureId={disclosureId}
              expanded={expandedDisclosureIds.has(disclosureId)}
              key={partKey}
              onDisclosureChange={onDisclosureChange}
              onDisclosureToggle={onDisclosureToggle}
              onSubagentOpen={onSubagentOpen}
              sessionId={sessionId}
              tool={part}
              t={t}
            />
          );
        }
        if (part.kind === "thinking") {
          const partKey = `thinking:${thinkingIndex}`;
          thinkingIndex += 1;
          const disclosureId = thinkingDisclosureId(row, part, partKey);
          return (
            <MessageThinkingBlock
              disclosureId={disclosureId}
              expanded={expandedDisclosureIds.has(disclosureId)}
              key={partKey}
              onDisclosureChange={onDisclosureChange}
              onDisclosureToggle={onDisclosureToggle}
              thinking={part}
              t={t}
            />
          );
        }
        const partKey = `media:${mediaIndex}`;
        mediaIndex += 1;
        return <MessageMediaPreview key={partKey} media={part} t={t} />;
      })}
    </div>
  );
}

function toolDisclosureId(
  row: TimelineRow,
  tool: TimelineToolPart,
  partKey: string,
): string {
  const toolIdentity = tool.callId.trim() || tool.toolName.trim() || partKey;
  return `tool:${row.runId ?? stableStreamRowKey(row)}:${toolIdentity}`;
}

function thinkingDisclosureId(
  row: TimelineRow,
  thinking: TimelineThinkingPart,
  partKey: string,
): string {
  return [
    "thinking",
    row.runId ?? stableStreamRowKey(row),
    row.instanceId?.trim() || stableTimelineRole(row.role),
    thinking.partIndex || partKey,
  ].join(":");
}

function streamIdentityForTextPart(row: TimelineRow, partKey: string): string {
  return `${stableStreamRowKey(row)}:${partKey}`;
}

function stableStreamRowKey(row: TimelineRow): string {
  const normalizedKey = stableStreamKeyFromRowKey(row.key);
  if (normalizedKey.startsWith("runtime-text:")) {
    return normalizedKey;
  }
  const runId = row.runId?.trim() ?? "";
  if (runId.length > 0) {
    return [
      "run-text",
      runId,
      row.instanceId?.trim() || stableTimelineRole(row.role),
      normalizedKey,
    ].join(":");
  }
  return normalizedKey;
}

function stableStreamKeyFromRowKey(rowKey: string): string {
  let key = rowKey;
  let nextKey = streamKeyWithoutTransientSuffix(key);
  while (nextKey !== key) {
    key = nextKey;
    nextKey = streamKeyWithoutTransientSuffix(key);
  }
  return key;
}

function streamKeyWithoutTransientSuffix(rowKey: string): string {
  return rowKey
    .replace(/:before-processed$/u, "")
    .replace(/:processed-start$/u, "")
    .replace(/:processed$/u, "")
    .replace(/:final$/u, "");
}

function MessageText({
  part,
  streamIdentity,
}: {
  part: TimelineTextPart;
  streamIdentity: string;
}) {
  void streamIdentity;
  const visuallyStreaming = part.streaming;
  const cursorVisible = part.streaming;
  const text = part.text;
  return (
    <div
      className={[
        "at-message-text",
        visuallyStreaming ? "at-message-streaming-text" : "",
      ].filter(Boolean).join(" ")}
      data-streaming={visuallyStreaming ? "true" : undefined}
    >
      <MarkdownMessage streamingPlain={visuallyStreaming} text={text} />
      {cursorVisible ? <StreamingCursor /> : null}
    </div>
  );
}

function StreamingCursor() {
  return <span aria-hidden="true" className="streaming-cursor" />;
}

function MessageRowActions({
  canReadAloud,
  disabled,
  onCopy,
  onReadAloud,
  t,
}: {
  canReadAloud: boolean;
  disabled: boolean;
  onCopy: () => void;
  onReadAloud: () => void;
  t: Translate;
}) {
  return (
    <div className="at-message-actions">
      <Tooltip
        title={disabled ? t("timelineCopyAfterStream") : t("timelineCopyLastAnswer")}
      >
        <Button
          aria-label={t("timelineCopyLastAnswer")}
          disabled={disabled}
          icon={<Copy size={14} />}
          onClick={onCopy}
          size="small"
          type="text"
        />
      </Tooltip>
      {canReadAloud ? (
        <Tooltip
          title={disabled ? t("timelineReadAloudAfterStream") : t("timelineReadAloudLastAnswer")}
        >
          <Button
            aria-label={t("timelineReadAloudLastAnswer")}
            disabled={disabled}
            icon={<Volume2 size={14} />}
            onClick={onReadAloud}
            size="small"
            type="text"
          />
        </Tooltip>
      ) : null}
    </div>
  );
}

function MessageThinkingBlock({
  disclosureId,
  expanded,
  onDisclosureChange,
  onDisclosureToggle,
  thinking,
  t,
}: {
  disclosureId: string;
  expanded: boolean;
  onDisclosureChange: (disclosureId: string, expanded: boolean) => void;
  onDisclosureToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
  thinking: TimelineThinkingPart;
  t: Translate;
}) {
  const hasText = thinking.text.trim().length > 0;
  if (!hasText) {
    return null;
  }
  return (
    <TimelineDisclosure
      className="at-message-thinking"
      data-part-index={thinking.partIndex}
      data-streaming={thinking.streaming ? "true" : "false"}
      disclosureId={disclosureId}
      expanded={expanded}
      forceOpen={thinking.streaming}
      onExpandedChange={onDisclosureChange}
      onToggle={onDisclosureToggle}
    >
      <summary className="at-message-thinking-summary">
        <span className="at-message-thinking-label">{t("timelineThinking")}</span>
        {thinking.streaming ? (
          <span className="at-message-thinking-live">{t("timelineLive")}</span>
        ) : null}
      </summary>
      {hasText ? (
        <div className="at-message-thinking-body">
          {thinking.streaming ? (
            <div className="at-message-markdown at-message-streaming-plain">
              {thinking.text}
            </div>
          ) : (
            <MarkdownMessage text={thinking.text} />
          )}
        </div>
      ) : null}
    </TimelineDisclosure>
  );
}

function MessageToolBlock({
  disclosureId,
  expanded,
  onDisclosureChange,
  onDisclosureToggle,
  onSubagentOpen,
  sessionId,
  tool,
  t,
}: {
  disclosureId: string;
  expanded: boolean;
  onDisclosureChange: (disclosureId: string, expanded: boolean) => void;
  onDisclosureToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
  onSubagentOpen?: (subagent: TimelineSubagentReference) => void;
  sessionId: string;
  tool: TimelineToolPart;
  t: Translate;
}) {
  const phaseLabel = toolPhaseLabel(tool, t);
  const displayName = toolDisplayName(tool);
  const title = displayName === null ? phaseLabel : `${phaseLabel}: ${displayName}`;
  const preview = toolSummaryPreview(tool);
  const status = toolBlockStatus(tool);
  const isRunning = status === "running";
  const isSubagentTool = toolActionCategory(tool.toolName) === "subagent";
  const subagentReference = completeSubagentReference(
    tool.subagent,
    sessionId,
    status,
  );
  const openSubagentReference = subagentReference === null
    ? null
    : {
      ...subagentReference,
      sourceRunId: subagentReference.sourceRunId ?? tool.sourceRunId,
      sourceToolCallId: subagentReference.sourceToolCallId ?? tool.callId,
    };
  const canOpenSubagent =
    onSubagentOpen !== undefined &&
    openSubagentReference !== null;
  const hasDetails =
    !isSubagentTool &&
    (
      tool.callId.trim().length > 0 ||
      tool.body.trim().length > 0 ||
      tool.mediaParts.length > 0
    );
  const handleSummaryClick = canOpenSubagent
    ? (event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
        onSubagentOpen(openSubagentReference);
      }
    : undefined;
  return (
    <TimelineDisclosure
      className={[
        "at-message-tool",
        tool.error ? "is-error" : "",
        canOpenSubagent ? "is-openable-subagent" : "",
      ].filter(Boolean).join(" ")}
      data-status={status}
      data-subagent-instance-id={openSubagentReference?.instanceId ?? undefined}
      data-subagent-run-id={openSubagentReference?.runId ?? undefined}
      data-tool-call-id={tool.callId || undefined}
      data-tool-name={tool.toolName}
      disclosureId={disclosureId}
      expanded={expanded}
      onExpandedChange={onDisclosureChange}
      onToggle={onDisclosureToggle}
    >
      <summary
        aria-label={canOpenSubagent ? t("timelineOpenSubagentPanel") : undefined}
        className="at-message-tool-summary"
        onClick={handleSummaryClick}
      >
        <span className="at-message-tool-title">
          <Wrench aria-hidden="true" size={14} />
          <span title={title}>{title}</span>
        </span>
        {preview ? (
          <span className="at-message-tool-preview" title={preview}>{preview}</span>
        ) : null}
        {tool.durationMs !== undefined ? (
          <span className="at-message-tool-duration">
            {formatToolDuration(tool.durationMs)}
          </span>
        ) : null}
        {isRunning ? (
          <span className="at-message-tool-spinner" aria-label={t("timelineToolRunningStatus")} />
        ) : null}
      </summary>
      {hasDetails ? (
        <div className="at-message-tool-body">
          <ToolCallDetails
            callId={tool.callId}
            error={tool.error}
            input={tool.inputBody ?? (tool.phase === "call" ? tool.body : "")}
            output={tool.outputBody ?? (tool.phase === "call" ? "" : tool.body)}
            raw={tool.body}
            t={t}
            toolName={tool.toolName}
          />
          {tool.mediaParts.map((media, index) => (
            <MessageMediaPreview
              key={`tool-media:${index}:${media.url}`}
              media={media}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </TimelineDisclosure>
  );
}

function toolBlockStatus(
  tool: TimelineToolPart,
): "completed" | "error" | "running" | "validation_failed" {
  if (tool.phase === "call" || tool.phase === "approval-requested") {
    return "running";
  }
  if (tool.phase === "validation") {
    return "validation_failed";
  }
  if (tool.error) {
    return "error";
  }
  return "completed";
}

function MessageMediaPreview({
  media,
  t,
}: {
  media: TimelineMediaPart;
  t: Translate;
}) {
  const label = media.name || media.modality || "media";
  if (media.modality === "image" || media.mimeType.startsWith("image/")) {
    return (
      <figure className="at-message-media">
        <Image
          alt={label}
          className="at-message-media-image"
          preview={{ mask: t("timelinePreview") }}
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

function messageParts(
  message: TimelineMessage,
  workspaceId: string | null,
): TimelineRenderPart[] {
  const injection = persistedInjectionPart(message);
  if (injection !== null) {
    return [injection];
  }
  if (timelineMessageIsInjection(message)) {
    return [];
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return textRenderParts(timelineDisplayText(message.content), workspaceId);
  }
  const parts = messageContentParts(message).flatMap((part) =>
    contentPartToRenderParts(part, workspaceId),
  );
  if (parts.length > 0) {
    return parts;
  }
  if (typeof message.message?.content === "string" && message.message.content.trim()) {
    return textRenderParts(timelineDisplayText(message.message.content), workspaceId);
  }
  return [];
}

function persistedInjectionPart(message: TimelineMessage): TimelineTextPart | null {
  if (
    (message.entry_type ?? "").trim().toLowerCase() !== "injection" ||
    (message.visibility ?? "public").trim().toLowerCase() === "internal"
  ) {
    return null;
  }
  const payload = persistedInjectionPayload(message);
  const summary = runtimeInjectionSummary(payload);
  if (summary.length === 0) {
    return null;
  }
  const status = (message.injection_status ?? message.status ?? "applied")
    .trim()
    .toLowerCase();
  const label = injectionStatusLabel(normalizedInjectionStatus(status));
  return timelineTextPart(`${label}: ${summary}`);
}

function injectionStatusLabel(status: TimelineInjectionRow["status"]): string {
  if (status === "failed") {
    return "Injection failed";
  }
  return status === "applied" ? "Injection applied" : "Injection queued";
}

function persistedInjectionPayload(message: TimelineMessage): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = {};
  const content = timelineMessagePrimaryText(message);
  if (content.length > 0) {
    payload.content = content;
  }
  const source = message.source?.trim() ?? "";
  if (source.length > 0) {
    payload.source = source;
  }
  const injectionId = message.injection_id?.trim() ?? "";
  if (injectionId.length > 0) {
    payload.injection_id = injectionId;
  }
  return payload;
}

function timelineMessagePrimaryText(message: TimelineMessage): string {
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }
  for (const part of messageContentParts(message)) {
    const text = contentPartText(part);
    if (text !== null && text.trim().length > 0) {
      return text.trim();
    }
  }
  if (
    typeof message.message?.content === "string" &&
    message.message.content.trim().length > 0
  ) {
    return message.message.content.trim();
  }
  return "";
}

function messageContentParts(message: TimelineMessage): ContentPart[] {
  return message.parts ?? message.message?.parts ?? [];
}

function textRenderParts(
  text: string,
  workspaceId: string | null,
): TimelineRenderPart[] {
  return [
    timelineTextPart(text),
    ...workspaceImagePreviewParts(text, workspaceId),
  ];
}

function workspaceImagePreviewParts(
  text: string,
  workspaceId: string | null,
): TimelineMediaPart[] {
  const safeWorkspaceId = workspaceId?.trim() ?? "";
  if (!safeWorkspaceId) {
    return [];
  }
  const seenPaths = new Set<string>();
  return [
    ...extractWorkspaceImagePathCandidates(text, IMAGE_CODE_SPAN_PATTERN),
    ...extractWorkspaceImagePathCandidates(text, IMAGE_BARE_PATH_PATTERN),
  ].flatMap((path) => {
    if (seenPaths.has(path)) {
      return [];
    }
    seenPaths.add(path);
    const url = buildWorkspaceImagePreviewUrl(safeWorkspaceId, path);
    const media = mediaPartFromFields({
      mimeType: imageMimeTypeFromPath(path),
      modality: "image",
      name: imageNameFromPath(path),
      url,
    });
    return media === null ? [] : [media];
  });
}

function extractWorkspaceImagePathCandidates(
  text: string,
  pattern: RegExp,
): string[] {
  return Array.from(text.matchAll(pattern))
    .map((match) => normalizeWorkspaceImagePath(match[1]))
    .filter((path) => path.length > 0);
}

function normalizeWorkspaceImagePath(value: string | undefined): string {
  const candidate = (value ?? "")
    .trim()
    .replace(TRAILING_PATH_PUNCTUATION_PATTERN, "")
    .replaceAll("\\", "/");
  return candidate && IMAGE_PATH_PATTERN.test(candidate) ? candidate : "";
}

function imageNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function imageMimeTypeFromPath(path: string): string {
  const extension = imageNameFromPath(path).split(".").at(-1)?.toLowerCase() ?? "";
  switch (extension) {
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/*";
  }
}

function contentPartToRenderParts(
  part: ContentPart,
  workspaceId: string | null,
): TimelineRenderPart[] {
  const text = contentPartDisplayText(part);
  if (text !== null && text.trim().length > 0) {
    return textRenderParts(text, workspaceId);
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

function contentPartDisplayText(part: ContentPart): string | null {
  const text = contentPartText(part);
  if (text !== null) {
    return timelineDisplayText(text);
  }
  if (contentPartKind(part) === "user-prompt" && "content" in part) {
    const content = part.content;
    return typeof content === "string" ? userPromptDisplayText(content) : null;
  }
  return null;
}

function userPromptDisplayText(text: string): string {
  const marker = "\n\n## Skill Candidates";
  const markerIndex = text.indexOf(marker);
  const displayText = markerIndex >= 0 ? text.slice(0, markerIndex) : text;
  return displayText.trim();
}

function timelineDisplayText(text: string): string {
  return compactApiErrorText(text) ?? text;
}

function compactApiErrorText(text: string): string | null {
  const prefix = "The request could not be completed because of an API or execution error.";
  if (!text.includes(prefix)) {
    return null;
  }
  const status = text.match(/status_code:\s*(\d+)/)?.[1]?.trim() ?? "";
  const model = text.match(/model_name:\s*([^,\n]+)/)?.[1]?.trim() ?? "";
  const errorMessage =
    firstRegexGroup(text, /body:\s*\{\s*'message':\s*'([^']+)'/) ||
    firstRegexGroup(text, /'error':\s*\{\s*'message':\s*'([^']+)'/) ||
    firstRegexGroup(text, /"error":\s*\{\s*"message":\s*"([^"]+)"/);
  const title = [
    "API request failed",
    status.length > 0 ? `(${status})` : "",
    model.length > 0 ? `- ${model}` : "",
  ].filter(Boolean).join(" ");
  return [title, errorMessage].filter((line) => line.trim().length > 0).join("\n\n");
}

function firstRegexGroup(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[1]?.trim() ?? "";
}

function contentPartThinking(part: ContentPart): TimelineThinkingPart | null {
  if (contentPartKind(part) !== "thinking") {
    return null;
  }
  const text = thinkingContentText(part);
  if (text.trim().length === 0) {
    return null;
  }
  return {
    kind: "thinking",
    partIndex: contentPartIndex(part),
    streaming: contentPartStreaming(part) && !contentPartFinished(part),
    text,
  };
}

function contentPartTool(part: ContentPart): TimelineToolPart | null {
  const kind = contentPartKind(part);
  if (kind === "tool-call" || contentPartHasToolCallShape(part)) {
    const inputBody = toolArgsBody("args" in part ? part.args ?? null : null);
    return {
      action: "",
      body: inputBody,
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      error: false,
      kind: "tool",
      inputBody,
      mediaParts: [],
      phase: "call",
      subagent: subagentReferenceFromValues({
        callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
        payload: "args" in part ? jsonCompatibleValue(part.args ?? null) : null,
        toolName: "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool",
      }),
      toolName: "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool",
    };
  }
  if (kind === "tool-return") {
    const content = "content" in part ? part.content ?? null : null;
    const error = toolReturnIsError(part, content);
    const toolName = "tool_name" in part ? part.tool_name ?? "unknown_tool" : "unknown_tool";
    const outputBody = toolReturnBody(content, error, toolName);
    return {
      action: "",
      body: outputBody,
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      durationMs: toolDurationMs(jsonValueText(content)) ?? undefined,
      error,
      kind: "tool",
      mediaParts: toolReturnMediaParts(content),
      outputBody,
      phase: "result",
      subagent: subagentReferenceFromValues({
        callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
        payload: jsonCompatibleValue(content),
        toolName,
      }),
      toolName,
    };
  }
  if (kind === "retry-prompt") {
    const outputBody = jsonValueText("content" in part ? part.content ?? null : null);
    return {
      action: "",
      body: outputBody,
      callId: "tool_call_id" in part ? part.tool_call_id ?? "" : "",
      error: true,
      kind: "tool",
      mediaParts: [],
      outputBody,
      phase: "validation",
      subagent: null,
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
    mediaParts: [],
    phase: entry.kind === "tool_approval_requested"
      ? "approval-requested"
      : "approval-resolved",
    subagent: null,
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
    if (deltaText.trim().length === 0) {
      ensureRuntimeThinkingAccumulator(entry, partIndex, activeThinking);
      return true;
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
    instanceId: entry.instanceId || null,
    text: "",
    kind: entry.kind,
    parts: [part],
    roundMarker: null,
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
    const inputBody = toolArgsBody(payload.args ?? null);
    return {
      action: "",
      body: inputBody,
      callId,
      error: false,
      kind: "tool",
      inputBody,
      mediaParts: [],
      phase: "call",
      subagent: subagentReferenceWithSource(
        subagentReferenceFromValues({
          callId,
          payload: payload.args ?? null,
          toolName,
        }),
        entry,
        callId,
      ),
      sourceRunId: entry.runId,
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
      mediaParts: [],
      outputBody: body,
      phase: "validation",
      subagent: null,
      toolName,
    };
  }
  const result = payload.result ?? payload.content ?? null;
  if (!callId && !objectString(payload, "tool_name") && result === null) {
    return null;
  }
  const error = objectBoolean(payload, "error") || toolResultIndicatesError(result);
  const outputBody = toolReturnBody(result, error, toolName);
  return {
    action: "",
    body: outputBody,
    callId,
    durationMs: toolDurationMs(jsonValueText(result)) ?? undefined,
    error,
    kind: "tool",
    mediaParts: toolReturnMediaParts(result),
    outputBody,
    phase: "result",
    subagent: subagentReferenceWithSource(
      subagentReferenceFromValues({
        callId,
        payload: result,
        toolName,
      }),
      entry,
      callId,
    ),
    sourceRunId: entry.runId,
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

function toolReturnMediaParts(value: unknown): TimelineMediaPart[] {
  const mediaParts: TimelineMediaPart[] = [];
  const seenUrls = new Set<string>();
  for (const candidate of toolReturnMediaCandidates(value)) {
    const media = mediaPartFromRecord(candidate);
    if (media === null || seenUrls.has(media.url)) {
      continue;
    }
    seenUrls.add(media.url);
    mediaParts.push(media);
  }
  return mediaParts;
}

function toolReturnMediaCandidates(value: unknown): Record<string, JsonValue>[] {
  if (Array.isArray(value)) {
    return value.flatMap(toolReturnMediaCandidates);
  }
  const object = unknownJsonObject(value);
  if (object === null) {
    return [];
  }
  const candidates: Record<string, JsonValue>[] = [];
  const kind = objectString(object, "kind") || objectString(object, "part_kind");
  if (kind === "media_ref") {
    candidates.push(object);
  }
  for (const key of ["content", "parts", "output", "data", "result"] as const) {
    const child = object[key];
    if (child !== undefined) {
      candidates.push(...toolReturnMediaCandidates(child));
    }
  }
  return candidates;
}

function mediaPartFromRecord(object: Record<string, JsonValue>): TimelineMediaPart | null {
  return mediaPartFromFields({
    mimeType: objectString(object, "mime_type") || objectString(object, "media_type"),
    modality: objectString(object, "modality"),
    name: objectString(object, "name"),
    url: objectString(object, "url"),
  });
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

function timelineRowHasRenderableContent(row: TimelineRow): boolean {
  return (
    row.processedGroup !== undefined ||
    row.roundMarker !== null ||
    row.parts.some(timelinePartHasRenderableContent) ||
    row.text.trim().length > 0
  );
}

function timelinePartHasRenderableContent(part: TimelineRenderPart): boolean {
  if (part.kind === "text") {
    return part.streaming || part.text.trim().length > 0;
  }
  if (part.kind === "thinking") {
    return part.text.trim().length > 0;
  }
  if (part.kind === "tool") {
    return part.toolName.trim().length > 0 ||
      part.body.trim().length > 0 ||
      part.action.trim().length > 0 ||
      part.mediaParts.length > 0;
  }
  return part.url.trim().length > 0 || part.name.trim().length > 0;
}

function timelineRowHasStreamingContent(row: TimelineRow): boolean {
  return row.parts.some((part) => (
    (part.kind === "text" || part.kind === "thinking") &&
    part.streaming
  ));
}

function timelineRowHasRevealContent(row: TimelineRow): boolean {
  return row.parts.some((part) => part.kind === "text" && part.reveal === true);
}

function shouldShowRoleLabel(
  row: TimelineRow,
  variant: "session" | "subagent-panel",
): boolean {
  void row;
  void variant;
  return false;
}

function estimateRowSize(row: TimelineRow | undefined): number {
  if (row === undefined) {
    return 120;
  }
  if (row.roundMarker !== null) {
    return 84;
  }
  if (row.processedGroup !== undefined) {
    return 34;
  }
  const mediaCount = row.parts.filter((part) => part.kind === "media").length;
  const thinkingCount = row.parts.filter((part) => part.kind === "thinking").length;
  const thinkingTextLength = row.parts
    .filter((part): part is TimelineThinkingPart => part.kind === "thinking")
    .reduce((total, part) => total + (part.streaming ? part.text.length : 0), 0);
  const toolCount = row.parts.filter((part) => part.kind === "tool").length;
  const visibleTextLength = row.parts
    .filter((part): part is TimelineTextPart => part.kind === "text")
    .reduce((total, part) => total + part.text.length, 0);
  const textLength = visibleTextLength + thinkingTextLength;
  return 64
    + mediaCount * 138
    + thinkingCount * 52
    + toolCount * 30
    + Math.min(160, Math.ceil(textLength / 110) * 22);
}

function timelineRowIsToolOnly(row: TimelineRow): boolean {
  return row.parts.length > 0 && row.parts.every((part) => part.kind === "tool");
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

function toolPhaseLabel(tool: TimelineToolPart, t: Translate): string {
  if (tool.phase === "approval-requested") {
    return t("timelineApprovalRequested");
  }
  if (tool.phase === "approval-resolved") {
    if (approvalActionIsError(tool.action)) {
      return t("timelineApprovalDenied");
    }
    if (approvalActionIsApproved(tool.action)) {
      return t("timelineApprovalApproved");
    }
    return t("timelineApprovalResolved");
  }
  if (tool.phase === "call") {
    return toolActionLabel(tool.toolName, "running", t);
  }
  if (tool.phase === "validation") {
    return t("timelineToolValidation");
  }
  if (tool.error) {
    return toolActionLabel(tool.toolName, "error", t);
  }
  return toolActionLabel(tool.toolName, "completed", t);
}

function toolActionLabel(
  toolName: string,
  phase: "completed" | "error" | "running",
  t: Translate,
): string {
  const category = toolActionCategory(toolName);
  if (category === "subagent") {
    if (phase === "running") {
      return t("timelineToolRunningSubagent");
    }
    if (phase === "error") {
      return t("timelineToolErrorSubagent");
    }
    return t("timelineToolCompletedSubagent");
  }
  if (category === "run") {
    if (phase === "running") {
      return t("timelineToolRunningRun");
    }
    if (phase === "error") {
      return t("timelineToolErrorRun");
    }
    return t("timelineToolCompletedRun");
  }
  if (category === "read") {
    if (phase === "running") {
      return t("timelineToolRunningRead");
    }
    if (phase === "error") {
      return t("timelineToolErrorRead");
    }
    return t("timelineToolCompletedRead");
  }
  if (category === "edit") {
    if (phase === "running") {
      return t("timelineToolRunningEdit");
    }
    if (phase === "error") {
      return t("timelineToolErrorEdit");
    }
    return t("timelineToolCompletedEdit");
  }
  if (category === "search") {
    if (phase === "running") {
      return t("timelineToolRunningSearch");
    }
    if (phase === "error") {
      return t("timelineToolErrorSearch");
    }
    return t("timelineToolCompletedSearch");
  }
  if (phase === "running") {
    return t("timelineToolRunningGeneric");
  }
  if (phase === "error") {
    return t("timelineToolErrorGeneric");
  }
  return t("timelineToolCompletedGeneric");
}

function toolActionCategory(
  toolName: string,
): "edit" | "generic" | "read" | "run" | "search" | "subagent" {
  return toolActionFamily(toolName);
}

function toolDisplayName(tool: TimelineToolPart): string | null {
  return toolActionCategory(tool.toolName) === "subagent" ? null : tool.toolName;
}

function subagentReferenceFromValues({
  callId,
  payload,
  toolName,
}: {
  callId: string;
  payload: JsonValue;
  toolName: string;
}): TimelineSubagentReference | null {
  const candidateObjects = subagentCandidateObjects(payload);
  const hasSubagentShape =
    toolActionCategory(toolName) === "subagent" ||
    candidateObjects.some(subagentObjectHasExplicitReferenceFields);
  if (!hasSubagentShape) {
    return null;
  }
  const textReference = subagentReferenceFromText(jsonValueText(payload));
  const reference: TimelineSubagentReference = {
    createdAt: subagentStringField(candidateObjects, ["created_at", "createdAt"]),
    description: subagentStringField(candidateObjects, [
      "description",
      "task",
    ]),
    instanceId: subagentStringField(candidateObjects, [
      "subagent_instance_id",
      "instance_id",
      "instanceId",
    ]),
    interactive: subagentBooleanField(candidateObjects, ["interactive"]),
    lastEventId: subagentNumberField(candidateObjects, [
      "last_event_id",
      "checkpoint_event_id",
      "lastEventId",
    ]),
    prompt: subagentStringField(candidateObjects, [
      "prompt",
      "instructions",
      "task",
    ]),
    roleId: subagentStringField(candidateObjects, [
      "subagent_role_id",
      "role_id",
      "roleId",
    ]),
    runId: subagentStringField(candidateObjects, [
      "subagent_run_id",
      "subagentRunId",
    ]),
    runPhase: subagentStringField(candidateObjects, ["run_phase", "runPhase"]),
    runStatus: subagentStringField(candidateObjects, ["run_status", "runStatus"]),
    sessionId: subagentStringField(candidateObjects, ["session_id", "sessionId"]),
    status: subagentStringField(candidateObjects, ["status", "outcome"]),
    subagentKind: subagentStringField(candidateObjects, [
      "subagent_kind",
      "kind",
      "subagentKind",
    ]),
    title: subagentStringField(candidateObjects, ["title", "name", "label"]),
    updatedAt: subagentStringField(candidateObjects, ["updated_at", "updatedAt"]),
  };
  const merged = mergeSubagentReference(reference, textReference);
  if (merged === null) {
    return null;
  }
  const runId = merged.runId?.trim() ?? "";
  const instanceId = merged.instanceId?.trim() ?? "";
  if (runId.length === 0 && instanceId.length === 0) {
    const description = merged.description?.trim() ?? "";
    if (callId.trim().length === 0 && description.length === 0) {
      return null;
    }
  }
  return merged;
}

function completeSubagentReference(
  reference: TimelineSubagentReference | null,
  sessionId: string,
  fallbackStatus = "",
): TimelineSubagentReference | null {
  if (reference === null) {
    return null;
  }
  const status = firstNonBlankTimelineValue(
    reference.status,
    reference.runStatus,
    fallbackStatus,
  );
  const runStatus = firstNonBlankTimelineValue(reference.runStatus, status);
  return {
    ...reference,
    runStatus,
    sessionId: reference.sessionId.trim() || sessionId,
    status,
  };
}

function subagentReferenceWithSource(
  reference: TimelineSubagentReference | null,
  entry: TimelineEntry,
  callId: string,
): TimelineSubagentReference | null {
  if (reference === null) {
    return null;
  }
  return {
    ...reference,
    sourceRunId: entry.runId,
    sourceToolCallId: callId.trim(),
  };
}

function firstNonBlankTimelineValue(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}

function subagentCandidateObjects(
  value: JsonValue,
  depth = 0,
): Record<string, JsonValue>[] {
  if (depth > 4) {
    return [];
  }
  const object = jsonObject(value);
  if (object !== null) {
    return [
      object,
      ...Object.values(object).flatMap((child) =>
        child === value ? [] : subagentCandidateObjects(child, depth + 1),
      ),
    ];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child) => subagentCandidateObjects(child, depth + 1));
  }
  if (typeof value === "string") {
    const parsed = parseJsonObjectText(value);
    return parsed === null ? [] : subagentCandidateObjects(parsed, depth + 1);
  }
  return [];
}

function subagentObjectHasExplicitReferenceFields(
  object: Record<string, JsonValue>,
): boolean {
  return [
    "subagent_instance_id",
    "subagent_run_id",
    "subagent_role_id",
  ].some((key) => objectString(object, key).length > 0);
}

function subagentStringField(
  objects: Record<string, JsonValue>[],
  keys: string[],
): string {
  for (const object of objects) {
    for (const key of keys) {
      const value = objectString(object, key);
      if (value.length > 0) {
        return value;
      }
    }
  }
  return "";
}

function subagentNumberField(
  objects: Record<string, JsonValue>[],
  keys: string[],
): number | null {
  for (const object of objects) {
    for (const key of keys) {
      const value = objectNumber(object, key);
      if (value > 0) {
        return value;
      }
    }
  }
  return null;
}

function subagentBooleanField(
  objects: Record<string, JsonValue>[],
  keys: string[],
): boolean | undefined {
  for (const object of objects) {
    for (const key of keys) {
      if (object[key] === true || object[key] === false) {
        return objectBoolean(object, key);
      }
    }
  }
  return undefined;
}

function subagentReferenceFromText(text: string): TimelineSubagentReference | null {
  const runId = firstRegexGroup(
    text,
    /(?:subagent_run_id|subagentRunId)\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)/i,
  );
  const instanceId = firstRegexGroup(
    text,
    /(?:subagent_instance_id|instance_id|instanceId)\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)/i,
  );
  const roleId = firstRegexGroup(
    text,
    /(?:subagent_role_id|role_id|roleId)\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)/i,
  );
  if (runId.length === 0 && instanceId.length === 0 && roleId.length === 0) {
    return null;
  }
  return {
    instanceId,
    roleId,
    runId,
    sessionId: "",
  };
}

function displayRole(role: string, t: Translate): string {
  const normalized = normalizedRole(role);
  if (normalized === "user") {
    return t("timelineRoleUser");
  }
  if (normalized === "assistant") {
    return t("timelineRoleAssistant");
  }
  if (normalized === "agent") {
    return t("timelineRoleAgent");
  }
  return role;
}

function normalizedRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "用户") {
    return "user";
  }
  if (normalized === "助手" || normalized === "助理") {
    return "assistant";
  }
  if (normalized === "代理") {
    return "agent";
  }
  return normalized;
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

function toolReturnBody(value: unknown, error: boolean, toolName = ""): string {
  if (error) {
    const summary = toolErrorSummary(value);
    return boundedToolBody(summary || jsonValueText(value));
  }
  const summary = toolSuccessSummary(value, toolName);
  return boundedToolBody(summary || jsonValueText(value));
}

function toolErrorSummary(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  const object = unknownJsonObject(value);
  if (object === null) {
    return "";
  }
  const lines: string[] = [];
  appendUniqueLine(
    lines,
    objectString(object, "message") ||
      objectString(object, "error_message") ||
      objectString(object, "reason"),
  );
  const errorValue = object.error;
  if (typeof errorValue === "string") {
    appendUniqueLine(lines, errorValue);
  }
  const errorObject = unknownJsonObject(errorValue);
  if (errorObject !== null) {
    appendUniqueLine(
      lines,
      objectString(errorObject, "message") ||
        objectString(errorObject, "detail") ||
        objectString(errorObject, "reason"),
    );
    const errorType = objectString(errorObject, "type");
    if (errorType.length > 0) {
      appendUniqueLine(lines, `Type: ${errorType}`);
    }
    const retryable = jsonScalarText(errorObject.retryable);
    if (retryable.length > 0) {
      appendUniqueLine(lines, `Retryable: ${retryable}`);
    }
  }
  appendUniqueLine(lines, toolDataSummary(object.data));
  if (lines.length === 0 && object.ok === false) {
    return "ok: false";
  }
  return lines.join("\n");
}

function toolSuccessSummary(value: unknown, toolName = ""): string {
  if (toolName === "read") {
    const readSummary = readToolPayloadSummary(value);
    if (readSummary.length > 0) {
      return readSummary;
    }
  }
  if (typeof value === "string") {
    return value.trim();
  }
  const object = unknownJsonObject(value);
  if (object === null) {
    return "";
  }
  if (object.ok === true && object.data !== undefined) {
    const dataSummary = toolDataSummary(object.data);
    return dataSummary || jsonValueText(object.data);
  }
  return toolDataSummary(value);
}

function readToolPayloadSummary(value: unknown): string {
  for (const candidate of readToolPayloadCandidates(value)) {
    const parsed = parseTaggedReadPayload(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}

function readToolPayloadCandidates(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(readToolPayloadCandidates);
  }
  const object = unknownJsonObject(value);
  if (object === null) {
    return [];
  }
  const candidates: string[] = [];
  for (const key of ["content", "data", "output", "result", "text"] as const) {
    const child = object[key];
    if (child !== undefined) {
      candidates.push(...readToolPayloadCandidates(child));
    }
  }
  return candidates;
}

function parseTaggedReadPayload(text: string): string {
  const metadata = [
    taggedMetadataLine(text, "path", "Path"),
    taggedMetadataLine(text, "type", "Type"),
  ].filter((line) => line.length > 0);
  const content = extractTaggedSection(text, "content");
  if (content.length > 0) {
    return [...metadata, "", content].join("\n").trim();
  }
  const entries = extractTaggedSection(text, "entries");
  if (entries.length > 0) {
    return [...metadata, "", entries].join("\n").trim();
  }
  return metadata.join("\n").trim();
}

function taggedMetadataLine(text: string, tagName: string, label: string): string {
  const value = extractTaggedSection(text, tagName);
  return value.length > 0 ? `${label}: ${value}` : "";
}

function extractTaggedSection(text: string, tagName: string): string {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(text);
  return match?.[1]?.trim() ?? "";
}

function boundedToolBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const lines = trimmed.split(/\r?\n/);
  const lineLimited = lines.length > TOOL_RESULT_MAX_LINES;
  const visibleLines = lineLimited ? lines.slice(0, TOOL_RESULT_MAX_LINES) : lines;
  let body = visibleLines.join("\n").trimEnd();
  const charLimited = body.length > TOOL_RESULT_MAX_CHARS;
  if (charLimited) {
    body = body.slice(0, TOOL_RESULT_MAX_CHARS).trimEnd();
  }
  if (!lineLimited && !charLimited) {
    return body;
  }
  const limits: string[] = [];
  if (lineLimited) {
    limits.push(`first ${TOOL_RESULT_MAX_LINES} of ${lines.length} lines`);
  }
  if (charLimited) {
    limits.push(`first ${TOOL_RESULT_MAX_CHARS} characters`);
  }
  return `${body}\n\nPreview truncated. Showing ${limits.join(" and ")}.`;
}

function toolDataSummary(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const stringItems = value.filter((item): item is string => typeof item === "string");
    return stringItems.length === value.length ? stringItems.join("\n").trim() : "";
  }
  const object = unknownJsonObject(value);
  if (object === null) {
    return "";
  }
  return (
    objectString(object, "output_excerpt") ||
    objectString(object, "output") ||
    jsonStringArrayText(object.recent_output) ||
    objectString(object, "message") ||
    objectString(object, "status")
  );
}

function jsonStringArrayText(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings.join("\n").trim() : "";
}

function jsonStringArrayInlineText(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings.join(", ").trim() : "";
}

function toolSummaryPreview(tool: TimelineToolPart): string {
  if (tool.subagent !== null) {
    return truncatePreview(
      firstNonEmptyString([
        tool.subagent.title,
        tool.subagent.description,
        tool.subagent.roleId,
      ]),
    );
  }
  if (tool.phase === "call") {
    return truncatePreview(toolCallPreview(tool.body));
  }
  return truncatePreview(firstNonEmptyLine(tool.body));
}

function firstNonEmptyString(values: Array<string | undefined>): string {
  for (const value of values) {
    const candidate = value?.trim() ?? "";
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return "";
}

function toolCallPreview(body: string): string {
  return boundedStringCacheValue({
    cache: toolCallPreviewCache,
    create: () => {
      const parsed = parseJsonObjectText(body);
      if (parsed !== null) {
        const raw = objectRawString(parsed, "__raw");
        if (raw.length > 0) {
          return raw;
        }
        const items = jsonStringArrayInlineText(parsed.__items);
        if (items.length > 0) {
          return items;
        }
        return (
          objectRawString(parsed, "command") ||
          objectRawString(parsed, "cmd") ||
          objectRawString(parsed, "description") ||
          objectRawString(parsed, "path") ||
          objectRawString(parsed, "file_path") ||
          objectRawString(parsed, "filepath") ||
          objectRawString(parsed, "target_path") ||
          objectRawString(parsed, "query") ||
          objectRawString(parsed, "q") ||
          objectRawString(parsed, "search_query") ||
          objectRawString(parsed, "pattern") ||
          objectRawString(parsed, "url") ||
          objectRawString(parsed, "uri") ||
          firstNonEmptyLine(jsonValueText(parsed))
        );
      }
      return firstNonEmptyLine(body);
    },
    key: body,
    limit: TOOL_PREVIEW_CACHE_LIMIT,
  });
}

function toolArgsBody(value: unknown): string {
  return jsonValueText(normalizedToolArgs(value));
}

function normalizedToolArgs(value: unknown): JsonValue {
  if (typeof value !== "string") {
    return jsonCompatibleValue(value);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed) as JsonValue;
    if (Array.isArray(parsed)) {
      return { __items: parsed };
    }
    return parsed;
  } catch {
    return { __raw: value };
  }
}

function jsonCompatibleValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(jsonCompatibleValue);
  }
  const object = unknownJsonObject(value);
  return object ?? "";
}

function parseJsonObjectText(value: string): Record<string, JsonValue> | null {
  return boundedStringCacheValue({
    cache: parsedJsonObjectCache,
    create: () => {
      try {
        return unknownJsonObject(JSON.parse(value) as unknown);
      } catch {
        return null;
      }
    },
    key: value,
    limit: TOOL_PREVIEW_CACHE_LIMIT,
  });
}

function firstNonEmptyLine(value: string): string {
  return boundedStringCacheValue({
    cache: firstNonEmptyLineCache,
    create: () => value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "",
    key: value,
    limit: TOOL_PREVIEW_CACHE_LIMIT,
  });
}

function truncatePreview(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 96) {
    return singleLine;
  }
  return `${singleLine.slice(0, 95)}...`;
}

function appendUniqueLine(lines: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed.length > 0 && !lines.includes(trimmed)) {
    lines.push(trimmed);
  }
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
  return toolResultIndicatesError(content);
}

function toolOutcomeIsError(outcome: unknown): boolean {
  if (typeof outcome !== "string") {
    return false;
  }
  const normalized = outcome.trim().toLowerCase();
  return normalized === "failed" || normalized === "denied";
}

function toolResultIndicatesError(value: unknown): boolean {
  const object = unknownJsonObject(value);
  if (object === null) {
    return false;
  }
  if ("ok" in object && object.ok === false) {
    return true;
  }
  if (
    toolOutcomeIsError(object.status) ||
    toolOutcomeIsError(object.outcome)
  ) {
    return true;
  }
  if (numericJsonValueIsNonZero(object.exit_code)) {
    return true;
  }
  const data = unknownJsonObject(object.data);
  return data !== null && toolResultIndicatesError(data);
}

function numericJsonValueIsNonZero(value: JsonValue | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function jsonObject(value: JsonValue): Record<string, JsonValue> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function unknownJsonObject(value: unknown): Record<string, JsonValue> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, JsonValue>;
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

function objectNumber(
  object: Record<string, JsonValue>,
  key: string,
): number {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
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

function formatRuntimeCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function isAnswerRole(role: string): boolean {
  return role.trim().toLowerCase() !== "user";
}

function supportsMessageSpeech(): boolean {
  return (
    typeof globalThis.speechSynthesis !== "undefined" &&
    typeof globalThis.SpeechSynthesisUtterance !== "undefined"
  );
}

async function readLastAnswerAloud(
  row: TimelineRow | undefined,
  messenger: ReturnType<typeof App.useApp>["message"],
  t: Translate,
): Promise<void> {
  const text = row?.text.trim() ?? "";
  if (!text) {
    void messenger.warning(t("timelineReadAloudEmpty"));
    return;
  }
  if (!supportsMessageSpeech()) {
    void messenger.warning(t("timelineReadAloudUnavailable"));
    return;
  }
  try {
    globalThis.speechSynthesis.cancel();
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    const language = document.documentElement.lang || navigator.language;
    if (language.trim().length > 0) {
      utterance.lang = language;
    }
    globalThis.speechSynthesis.speak(utterance);
    void messenger.success(t("timelineReadAloudStarted"));
  } catch (_error) {
    void messenger.error(t("timelineReadAloudUnavailable"));
  }
}

async function copyLastAnswer(
  row: TimelineRow | undefined,
  messenger: ReturnType<typeof App.useApp>["message"],
  t: Translate,
): Promise<void> {
  const text = row?.text.trim() ?? "";
  if (!text) {
    void messenger.warning(t("timelineCopyEmpty"));
    return;
  }
  try {
    if (navigator.clipboard?.writeText === undefined) {
      throw new Error(t("timelineClipboardUnavailable"));
    }
    await navigator.clipboard.writeText(text);
    void messenger.success(t("timelineCopySuccess"));
  } catch (_error) {
    void messenger.error(t("timelineClipboardUnavailable"));
  }
}
