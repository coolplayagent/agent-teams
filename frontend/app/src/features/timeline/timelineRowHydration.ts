export interface TimelineHydrationVirtualItem {
  end?: number;
  index: number;
  start: number;
}

interface ImmediateTimelineHydrationOptions<Row> {
  alwaysHydrate?: (row: Row) => boolean;
  anchorRowKey: string | null;
  container: HTMLElement | null;
  estimatedSize: (row: Row) => number;
  lastAnswerKey: string | null;
  rowKey: (row: Row) => string;
  rows: readonly Row[];
  virtualItems: readonly TimelineHydrationVirtualItem[];
}

export function immediateTimelineHydrationRowKeys<Row>({
  alwaysHydrate,
  anchorRowKey,
  container,
  estimatedSize,
  lastAnswerKey,
  rowKey,
  rows,
  virtualItems,
}: ImmediateTimelineHydrationOptions<Row>): ReadonlySet<string> {
  const rowKeys = new Set<string>();
  if (anchorRowKey !== null) {
    rowKeys.add(anchorRowKey);
  }
  if (lastAnswerKey !== null) {
    rowKeys.add(lastAnswerKey);
  }
  if (alwaysHydrate !== undefined) {
    for (const virtualItem of virtualItems) {
      const row = rows[virtualItem.index];
      if (row !== undefined && alwaysHydrate(row)) {
        rowKeys.add(rowKey(row));
      }
    }
  }
  if (container === null) {
    return rowKeys;
  }
  const viewportStart = finiteScrollMetric(container.scrollTop);
  const viewportHeight = finiteScrollMetric(container.clientHeight);
  if (viewportHeight === 0 && container.closest("[hidden]") === null) {
    for (const virtualItem of virtualItems) {
      const row = rows[virtualItem.index];
      if (row !== undefined) {
        rowKeys.add(rowKey(row));
      }
    }
    return rowKeys;
  }
  const viewportEnd = viewportStart + viewportHeight;
  for (const virtualItem of virtualItems) {
    const row = rows[virtualItem.index];
    if (row === undefined) {
      continue;
    }
    const itemEnd = virtualItem.end ?? virtualItem.start + estimatedSize(row);
    if (itemEnd >= viewportStart && virtualItem.start <= viewportEnd) {
      rowKeys.add(rowKey(row));
    }
  }
  return rowKeys;
}

export function rememberHydratedTimelineRow(
  rowKeys: Set<string>,
  rowKey: string,
  limit: number,
): void {
  rowKeys.delete(rowKey);
  rowKeys.add(rowKey);
  while (rowKeys.size > limit) {
    const oldestRowKey = rowKeys.values().next().value;
    if (typeof oldestRowKey !== "string") {
      return;
    }
    rowKeys.delete(oldestRowKey);
  }
}

function finiteScrollMetric(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
