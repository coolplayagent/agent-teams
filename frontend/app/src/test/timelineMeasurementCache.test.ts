import { describe, expect, it } from "vitest";

import {
  boundedTimelineMeasurementCache,
  TIMELINE_MEASUREMENT_CACHE_LIMIT,
} from "../features/timeline/timelineMeasurementCache";

describe("boundedTimelineMeasurementCache", () => {
  it("keeps the current anchor and its nearest measured rows within the limit", () => {
    const rowKeys = Array.from({ length: 700 }, (_, index) => `row-${index}`);
    const measurements = rowKeys.map((key, index) => ({
      end: index * 40 + 40,
      index,
      key,
      lane: 0,
      size: 40,
      start: index * 40,
    }));

    const bounded = boundedTimelineMeasurementCache(
      measurements,
      rowKeys,
      "row-650",
    );

    expect(bounded).toHaveLength(TIMELINE_MEASUREMENT_CACHE_LIMIT);
    expect(bounded.some((item) => item.key === "row-650")).toBe(true);
    expect(bounded.some((item) => item.key === "row-0")).toBe(false);
    expect(bounded.map((item) => item.index)).toEqual(
      [...bounded]
        .map((item) => item.index)
        .sort((left, right) => left - right),
    );
  });

  it("drops stale, mismatched, and invalid measurements", () => {
    const bounded = boundedTimelineMeasurementCache(
      [
        { end: 40, index: 0, key: "row-0", lane: 0, size: 40, start: 0 },
        { end: 80, index: 1, key: "stale-row", lane: 0, size: 40, start: 40 },
        { end: 120, index: 2, key: "row-2", lane: 0, size: -1, start: 80 },
      ],
      ["row-0", "row-1", "row-2"],
      "row-1",
    );

    expect(bounded).toEqual([
      { end: 40, index: 0, key: "row-0", lane: 0, size: 40, start: 0 },
    ]);
  });
});
