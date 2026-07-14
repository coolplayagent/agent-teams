const TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX = 96;

export const TIMELINE_DISCLOSURE_CONTROL_SELECTOR = [
  ".at-message-thinking-summary",
  ".at-message-tool-summary",
  ".at-processed-group-summary",
  ".at-round-prompt-toggle",
].join(", ");

export interface TimelineScrollAnchor {
  rowKey: string;
  viewportOffset: number;
}

export interface TimelineScrollSnapshot {
  anchor: TimelineScrollAnchor | null;
  preferAnchor: boolean;
  scrollTop: number;
  shouldFollow: boolean;
}

export interface PendingProgrammaticScroll {
  scopeKey: string;
  scrollTop: number;
}

export interface PendingInteractionAnchor {
  control: HTMLElement;
  controlIndex: number;
  controlViewportTop: number;
  disclosureId: string | null;
  rowKey: string;
  scopeKey: string;
}

export function captureTimelineScrollSnapshot(
  container: HTMLElement,
  forceAnchor = false,
  preferAnchor = false,
  anchor: TimelineScrollAnchor | null = null,
): TimelineScrollSnapshot {
  const scrollTop = scrollMetric(container.scrollTop);
  const shouldFollow = !forceAnchor && isTimelineNearBottom(container);
  return {
    anchor: shouldFollow ? null : anchor,
    preferAnchor,
    scrollTop,
    shouldFollow,
  };
}

export function timelineScrollTopForSnapshot(
  container: HTMLElement,
  snapshot: TimelineScrollSnapshot,
  useAnchor: boolean,
): number {
  if (snapshot.shouldFollow) {
    return timelineMaxScrollTop(container);
  }
  if (!useAnchor) {
    return clampScrollTop(container, snapshot.scrollTop);
  }
  return clampScrollTop(
    container,
    timelineAnchorScrollTop(container, snapshot),
  );
}

export function timelineAnchorScrollTop(
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
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return timelineScrollTopForViewportAnchor(
    container.scrollTop,
    rowRect.top - containerRect.top,
    snapshot.anchor.viewportOffset,
  );
}

export function findTimelineAnchorRow(
  container: HTMLElement,
  rowKey: string,
): HTMLElement | null {
  const escapedRowKey = rowKey.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return container.querySelector<HTMLElement>(
    `.at-timeline-row[data-row-key="${escapedRowKey}"]`,
  );
}

export function syncTimelineScrollPosition(
  container: HTMLElement,
  scrollTop: number,
): number {
  const nextScrollTop = clampScrollTop(container, scrollTop);
  container.scrollTop = nextScrollTop;
  return nextScrollTop;
}

export function restorePendingInteractionAnchor(
  container: HTMLElement,
  pendingAnchorRef: { current: PendingInteractionAnchor | null },
  scopeKey: string,
): number | null {
  const pending = pendingAnchorRef.current;
  if (pending === null) {
    return null;
  }
  if (pending.scopeKey !== scopeKey) {
    pendingAnchorRef.current = null;
    return null;
  }
  const row = findTimelineAnchorRow(container, pending.rowKey);
  if (row === null) {
    pendingAnchorRef.current = null;
    return null;
  }
  const control =
    pending.disclosureId === null
      ? row.querySelectorAll<HTMLElement>(TIMELINE_DISCLOSURE_CONTROL_SELECTOR)[
          pending.controlIndex
        ]
      : (row.querySelector<HTMLElement>(
          `[data-disclosure-id="${CSS.escape(pending.disclosureId)}"]`,
        ) ?? undefined);
  if (control === undefined) {
    pendingAnchorRef.current = null;
    return null;
  }
  pending.control = control;
  const delta =
    control.getBoundingClientRect().top - pending.controlViewportTop;
  const nextScrollTop =
    Math.abs(delta) <= 0.5
      ? container.scrollTop
      : syncTimelineScrollPosition(container, container.scrollTop + delta);
  return scrollMetric(nextScrollTop);
}

export function requiredTimelineInteractionSpacer(
  container: HTMLElement,
  currentSpacer: number,
): number {
  const naturalScrollHeight = Math.max(
    container.clientHeight,
    container.scrollHeight - currentSpacer,
  );
  const naturalMaxScrollTop = naturalScrollHeight - container.clientHeight;
  return scrollMetric(Math.max(0, container.scrollTop - naturalMaxScrollTop));
}

export function captureTimelineViewportAnchor(
  container: HTMLElement,
): TimelineScrollAnchor | null {
  const containerRect = container.getBoundingClientRect();
  const renderedRows = container.querySelectorAll<HTMLElement>(
    ".at-timeline-row[data-row-key]",
  );
  for (const row of renderedRows) {
    const rowKey = row.dataset.rowKey;
    if (rowKey === undefined) {
      continue;
    }
    const rowRect = row.getBoundingClientRect();
    if (
      rowRect.bottom < containerRect.top ||
      rowRect.top > containerRect.bottom
    ) {
      continue;
    }
    return {
      rowKey,
      viewportOffset: rowRect.top - containerRect.top,
    };
  }
  return null;
}

export function timelineScrollTopForViewportAnchor(
  scrollTop: number,
  currentViewportOffset: number,
  savedViewportOffset: number,
): number {
  return scrollMetric(scrollTop + currentViewportOffset - savedViewportOffset);
}

export function shouldAdjustTimelineScrollForItemSizeChange(
  externalRestorePending: boolean,
  itemStart: number,
  scrollOffset: number,
): boolean {
  return !externalRestorePending && itemStart < scrollOffset;
}

export function consumePendingProgrammaticTimelineScroll(
  pendingScrollRef: { current: PendingProgrammaticScroll | null },
  container: HTMLElement,
  scopeKey: string,
): boolean {
  const pendingScroll = pendingScrollRef.current;
  if (pendingScroll === null) {
    return false;
  }
  pendingScrollRef.current = null;
  return (
    pendingScroll.scopeKey === scopeKey &&
    Math.abs(scrollMetric(container.scrollTop) - pendingScroll.scrollTop) <= 1
  );
}

export function isTimelineNearBottom(container: HTMLElement): boolean {
  return (
    timelineMaxScrollTop(container) - scrollMetric(container.scrollTop) <=
    TIMELINE_BOTTOM_FOLLOW_THRESHOLD_PX
  );
}

export function clampScrollTop(
  container: HTMLElement,
  scrollTop: number,
): number {
  return Math.min(
    timelineMaxScrollTop(container),
    Math.max(0, scrollMetric(scrollTop)),
  );
}

export function timelineMaxScrollTop(container: HTMLElement): number {
  return Math.max(
    0,
    scrollMetric(container.scrollHeight) - scrollMetric(container.clientHeight),
  );
}

export function scrollMetric(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
