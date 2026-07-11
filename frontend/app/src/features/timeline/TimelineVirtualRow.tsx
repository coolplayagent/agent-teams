import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

export interface HydratableTimelineRow {
  key: string;
}

export type TimelineVirtualRowRenderer<Row extends HydratableTimelineRow> = (
  row: Row,
  index: number,
  start: number,
  measureElement: (element: Element | null) => void,
  contentReady: boolean,
) => ReactNode;

interface TimelineVirtualRowProps<Row extends HydratableTimelineRow> {
  contentReady: boolean;
  index: number;
  measureElement: (element: Element | null) => void;
  renderRow: TimelineVirtualRowRenderer<Row>;
  row: Row;
  start: number;
}

export function TimelineRowHydrationPlaceholder({
  estimatedHeight,
  rowKey,
}: {
  estimatedHeight: number;
  rowKey: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="at-timeline-row-placeholder"
      data-placeholder-row-key={rowKey}
      style={{ minHeight: `${Math.max(24, estimatedHeight)}px` }}
    />
  );
}

function TimelineVirtualRowBase<Row extends HydratableTimelineRow>({
  contentReady,
  index,
  measureElement,
  renderRow,
  row,
  start,
}: TimelineVirtualRowProps<Row>) {
  const rowElementRef = useRef<Element | null>(null);
  const setRowElement = useCallback((element: Element | null) => {
    rowElementRef.current = element;
    measureElement(element);
  }, [measureElement]);
  useLayoutEffect(() => {
    if (contentReady && rowElementRef.current !== null) {
      measureElement(rowElementRef.current);
    }
  }, [contentReady, measureElement]);
  return renderRow(row, index, start, setRowElement, contentReady);
}

export const TimelineVirtualRow = memo(TimelineVirtualRowBase) as
  typeof TimelineVirtualRowBase;
