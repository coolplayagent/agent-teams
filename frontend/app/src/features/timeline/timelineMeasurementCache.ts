import type { VirtualItem } from "@tanstack/react-virtual";

export const TIMELINE_MEASUREMENT_CACHE_LIMIT = 512;

export interface TimelineMeasurementCacheItem {
  end: number;
  index: number;
  key: string;
  lane: number;
  size: number;
  start: number;
}

export function boundedTimelineMeasurementCache(
  items: readonly VirtualItem[],
  rowKeys: readonly string[],
  anchorRowKey: string | null,
  limit = TIMELINE_MEASUREMENT_CACHE_LIMIT,
): TimelineMeasurementCacheItem[] {
  if (limit <= 0 || rowKeys.length === 0) {
    return [];
  }
  const matchingItems = items.flatMap((item) => {
    if (
      typeof item.key !== "string" ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      rowKeys[item.index] !== item.key ||
      !Number.isInteger(item.lane) ||
      item.lane < 0 ||
      !Number.isFinite(item.start) ||
      !Number.isFinite(item.end) ||
      !Number.isFinite(item.size) ||
      item.size <= 0 ||
      item.end < item.start
    ) {
      return [];
    }
    return [
      {
        end: item.end,
        index: item.index,
        key: item.key,
        lane: item.lane,
        size: item.size,
        start: item.start,
      },
    ];
  });
  const boundedLimit = Math.min(Math.floor(limit), matchingItems.length);
  if (matchingItems.length <= boundedLimit) {
    return matchingItems.sort((left, right) => left.index - right.index);
  }
  const requestedAnchorIndex =
    anchorRowKey === null ? -1 : rowKeys.indexOf(anchorRowKey);
  const anchorIndex =
    requestedAnchorIndex >= 0 ? requestedAnchorIndex : rowKeys.length - 1;
  return matchingItems
    .sort((left, right) => {
      const distanceDelta =
        Math.abs(left.index - anchorIndex) -
        Math.abs(right.index - anchorIndex);
      return distanceDelta === 0 ? left.index - right.index : distanceDelta;
    })
    .slice(0, boundedLimit)
    .sort((left, right) => left.index - right.index);
}
