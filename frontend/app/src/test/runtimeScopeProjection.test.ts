import { describe, expect, it, vi } from "vitest";

import type { TimelineEntry } from "../runtime/reducers";
import {
  mergeRuntimeTimelineEntries,
  projectRuntimeEntriesForScope,
  type RuntimeEntryScopeProjection,
} from "../features/timeline/runtimeScopeProjection";

describe("runtime scope projection", () => {
  it("filters only appended events after the initial large projection", () => {
    const matchesEntry = vi.fn((entry: TimelineEntry) =>
      entry.instanceId === "child-instance"
    );
    const initialEntries = Array.from({ length: 10_000 }, (_, index) =>
      runtimeEntry(index, index % 20 === 0 ? "child-instance" : "root-instance")
    );

    let projection = projectRuntimeEntriesForScope(
      initialEntries,
      undefined,
      matchesEntry,
    );
    expect(matchesEntry).toHaveBeenCalledTimes(10_000);
    expect(projection.scopedEntries).toHaveLength(500);

    matchesEntry.mockClear();
    const appendedEntries = [
      ...initialEntries,
      runtimeEntry(10_000, "root-instance"),
      runtimeEntry(10_001, "child-instance"),
    ];
    projection = projectRuntimeEntriesForScope(
      appendedEntries,
      projection,
      matchesEntry,
    );

    expect(matchesEntry).toHaveBeenCalledTimes(2);
    expect(projection.scopedEntries).toHaveLength(501);
    expect(projection.scopedEntries.at(-1)?.instanceId).toBe("child-instance");
  });

  it("reuses the projection when an unrelated runtime update keeps the source array", () => {
    const matchesEntry = vi.fn(() => true);
    const sourceEntries = [runtimeEntry(1, "child-instance")];
    const previous = projectRuntimeEntriesForScope(
      sourceEntries,
      undefined,
      matchesEntry,
    );
    matchesEntry.mockClear();

    const next = projectRuntimeEntriesForScope(
      sourceEntries,
      previous,
      matchesEntry,
    );

    expect(next).toBe(previous);
    expect(matchesEntry).not.toHaveBeenCalled();
  });

  it("recomputes after replacement or truncation instead of keeping stale rows", () => {
    const matchesEntry = vi.fn((entry: TimelineEntry) =>
      entry.instanceId === "child-instance"
    );
    const previous: RuntimeEntryScopeProjection = projectRuntimeEntriesForScope(
      [runtimeEntry(1, "child-instance"), runtimeEntry(2, "root-instance")],
      undefined,
      matchesEntry,
    );
    matchesEntry.mockClear();
    const replacement = [runtimeEntry(3, "root-instance")];

    const next = projectRuntimeEntriesForScope(
      replacement,
      previous,
      matchesEntry,
    );

    expect(matchesEntry).toHaveBeenCalledTimes(1);
    expect(next.scopedEntries).toEqual([]);
  });

  it("adopts append-only stream snapshots without rebuilding or sorting history", () => {
    const currentEntries = Array.from({ length: 10_000 }, (_, index) =>
      runtimeEntry(index, "child-instance")
    );
    const nextEntries = [
      ...currentEntries,
      runtimeEntry(10_000, "child-instance"),
    ];

    expect(mergeRuntimeTimelineEntries(currentEntries, nextEntries)).toBe(nextEntries);
    expect(mergeRuntimeTimelineEntries(nextEntries, currentEntries)).toBe(nextEntries);
  });

  it("deduplicates and orders non-append stream recovery snapshots", () => {
    const first = runtimeEntry(1, "child-instance");
    const replacement = { ...first, text: "recovered" };
    const recovered = mergeRuntimeTimelineEntries(
      [first, runtimeEntry(3, "child-instance")],
      [replacement, runtimeEntry(2, "child-instance")],
    );

    expect(recovered.map((entry) => entry.eventId)).toEqual([1, 2, 3]);
    expect(recovered[0]?.text).toBe("recovered");
  });
});

function runtimeEntry(eventId: number, instanceId: string): TimelineEntry {
  return {
    eventId,
    id: `run-root:${eventId}:0`,
    instanceId,
    kind: "text_delta",
    occurredAt: `2026-07-13T00:00:${String(eventId % 60).padStart(2, "0")}Z`,
    payload: { text: `entry-${eventId}` },
    roleId: instanceId === "child-instance" ? "Crafter" : "Coordinator",
    runId: "run-root",
    sessionId: "session-root",
    text: `entry-${eventId}`,
  };
}
