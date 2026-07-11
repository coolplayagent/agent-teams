/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(
  "src/features/timeline/MessageTimeline.tsx",
  "utf8",
);

describe("streaming scale instrumentation", () => {
  it("reports total, rendered, and subscribed run counts independently", () => {
    expect(timelineSource).toContain(
      "data-rendered-row-count={renderedVirtualItems.length}",
    );
    expect(timelineSource).toContain("data-total-row-count={rows.length}");
    expect(timelineSource).toContain(
      "data-runtime-run-count={runtimeRunList.length}",
    );
  });

  it("keeps the scale counters on the virtualized scroll owner", () => {
    const timelineStart = timelineSource.indexOf('className="at-timeline"');
    const virtualizedRows = timelineSource.indexOf(
      "renderedVirtualItems.map((virtualItem)",
      timelineStart,
    );
    const timelineEnd = timelineSource.indexOf(
      "{newContentAvailable ? (",
      timelineStart,
    );

    expect(timelineStart).toBeGreaterThanOrEqual(0);
    expect(virtualizedRows).toBeGreaterThan(timelineStart);
    expect(timelineEnd).toBeGreaterThan(virtualizedRows);
    expect(
      timelineSource.slice(timelineStart, timelineEnd),
    ).toContain("data-total-row-count={rows.length}");
  });
});
