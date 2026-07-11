import { describe, expect, it } from "vitest";

import { indexesWithLongerStrictPrefix } from "../features/timeline/timelinePerformance";

describe("timeline prefix indexing", () => {
  it("drops only strict prefixes within the same stream group", () => {
    const indexes = indexesWithLongerStrictPrefix([
      { groupKey: "run:a", index: 0, text: "hello" },
      { groupKey: "run:a", index: 1, text: "hello world" },
      { groupKey: "run:a", index: 2, text: "unrelated" },
      { groupKey: "run:b", index: 3, text: "hello" },
    ]);

    expect(indexes).toEqual(new Set([0]));
  });

  it("handles a provider-sized candidate set without pairwise scanning", () => {
    const candidates = Array.from({ length: 10_000 }, (_value, index) => ({
      groupKey: `run:${index % 20}`,
      index,
      text: `segment-${String(index).padStart(5, "0")}`,
    }));
    candidates.push({
      groupKey: "run:0",
      index: candidates.length,
      text: "segment-00000-complete",
    });

    const indexes = indexesWithLongerStrictPrefix(candidates);

    expect(indexes.has(0)).toBe(true);
  });
});
