import { describe, expect, it, vi } from "vitest";

import { terminalRuntimeDerivationSignature } from "../features/timeline/MessageTimeline";
import {
  boundedStringCacheValue,
  indexesWithLongerStrictPrefix,
  timelineDerivedValue,
  timelineFallbackVirtualItems,
  type TimelineDerivationCacheEntry,
} from "../features/timeline/timelinePerformance";
import type { RuntimeRunState } from "../runtime/reducers";

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

describe("terminal timeline derivation cache", () => {
  it("accepts stable closed runs and rejects an active run", () => {
    const closedRun = runtimeRunState("run-a", "closed");
    const openRun = runtimeRunState("run-b", "open");

    expect(terminalRuntimeDerivationSignature([closedRun])).toContain(
      "run-a:closed",
    );
    expect(terminalRuntimeDerivationSignature([closedRun, openRun])).toBeNull();
  });

  it("reuses terminal A rows after switching A to B and back to A", () => {
    const cache = new Map<string, TimelineDerivationCacheEntry<string[]>>();
    const messagesA: object[] = [];
    const roundsA: object[] = [];
    const messagesB: object[] = [];
    const roundsB: object[] = [];
    const deriveRows = vi.fn((sessionId: string) => [`rows:${sessionId}`]);
    const derive = (
      key: string,
      identities: readonly object[],
      signature: string | null,
    ) => timelineDerivedValue({
      cache,
      derive: () => deriveRows(key),
      identities,
      key,
      limit: 8,
      signature,
    });

    const firstA = derive("session:A", [messagesA, roundsA], "run-a:closed:24");
    derive("session:B", [messagesB, roundsB], "run-b:closed:18");
    const secondA = derive("session:A", [messagesA, roundsA], "run-a:closed:24");

    expect(secondA).toBe(firstA);
    expect(deriveRows).toHaveBeenCalledTimes(2);
  });

  it("never reuses rows while a runtime signature is nonterminal", () => {
    const cache = new Map<string, TimelineDerivationCacheEntry<string[]>>();
    const messages: object[] = [];
    const rounds: object[] = [];
    const deriveRows = vi.fn(() => ["live rows"]);
    const derive = () => timelineDerivedValue({
      cache,
      derive: deriveRows,
      identities: [messages, rounds],
      key: "session:live",
      limit: 8,
      signature: null,
    });

    derive();
    derive();

    expect(deriveRows).toHaveBeenCalledTimes(2);
    expect(cache).toHaveLength(0);
  });
});

describe("timeline fallback virtual window", () => {
  it("renders only the tail budget with offsets in the full timeline", () => {
    const sizes = Array.from({ length: 20 }, (_value, index) => 20 + index);

    const items = timelineFallbackVirtualItems(sizes, 8);
    const totalSize = sizes.reduce((total, size) => total + size, 0);
    const lastItem = items.at(-1);

    expect(items).toHaveLength(8);
    expect(items[0]).toEqual({
      index: 12,
      start: sizes.slice(0, 12).reduce((total, size) => total + size, 0),
    });
    expect(lastItem?.index).toBe(19);
    expect((lastItem?.start ?? 0) + (sizes[19] ?? 0)).toBe(totalSize);
  });
});

describe("bounded string derivation cache", () => {
  it("reuses null and large-text derivations", () => {
    const cache = new Map<string, string | null>();
    const createNull = vi.fn(() => null);
    const largeText = "x".repeat(12_000);
    const createLarge = vi.fn(() => largeText.slice(0, 96));

    for (let index = 0; index < 2; index += 1) {
      boundedStringCacheValue({ cache, create: createNull, key: "invalid", limit: 3 });
      boundedStringCacheValue({ cache, create: createLarge, key: largeText, limit: 3 });
    }

    expect(createNull).toHaveBeenCalledTimes(1);
    expect(createLarge).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used string at the configured boundary", () => {
    const cache = new Map<string, string>();
    const read = (key: string) => boundedStringCacheValue({
      cache,
      create: () => key.toUpperCase(),
      key,
      limit: 2,
    });

    read("a");
    read("b");
    read("a");
    read("c");

    expect([...cache.keys()]).toEqual(["a", "c"]);
  });
});

function runtimeRunState(
  runId: string,
  status: RuntimeRunState["status"],
): RuntimeRunState {
  return {
    entries: [],
    lastEventId: 24,
    runId,
    seenEventKeys: [],
    status,
    terminalEventType: status === "closed" ? "run_completed" : null,
  };
}
