/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(
  "src/features/timeline/MessageTimeline.tsx",
  "utf8",
);

describe("timeline scroll state contract", () => {
  it("stores only bounded lightweight state per session or subagent scope", () => {
    expect(timelineSource).toContain(
      "const TIMELINE_SCROLL_SCOPE_CACHE_LIMIT = 100;",
    );
    expect(timelineSource).toContain(
      "new Map<string, TimelineContentSignature>()",
    );
    expect(timelineSource).not.toContain("Map<string, TimelineRow[]>");
    expect(timelineSource).toMatch(
      /while \(values\.size > TIMELINE_SCROLL_SCOPE_CACHE_LIMIT\)[\s\S]*?values\.delete\(oldestKey\);/,
    );
  });

  it("offers new-content feedback only for appended timeline content", () => {
    expect(timelineSource).toContain("timelineContentWasAppended(");
    expect(timelineSource).toContain(
      "next.lastRowContentLength > previous.lastRowContentLength",
    );
    expect(timelineSource).toContain('t("timelineJumpToLatest")');
    expect(timelineSource).toContain('t("timelineNewContent")');
  });

  it("scopes programmatic scroll events so they cannot pollute another timeline", () => {
    expect(timelineSource).toContain(
      "pendingProgrammaticScrollRef.current = {",
    );
    expect(timelineSource).toContain(
      "consumePendingProgrammaticTimelineScroll(",
    );
    expect(timelineSource).toContain(
      "timelineScopeKey: scopeKey",
    );
    expect(timelineSource).toContain(
      "pendingScroll.scopeKey === scopeKey",
    );
  });

  it("treats explicit scrolling away from the exact bottom as reading intent", () => {
    expect(timelineSource).toContain(
      "timelineUserScrollRequiresTransientAnchor(container)",
    );
    expect(timelineSource).toContain(
      "timelineRowTop(row) + timelineRowHeight(row) > hostHeight + 1",
    );
    expect(timelineSource).toContain(
      "snapshot?.shouldFollow === false",
    );
    expect(timelineSource).toContain(
      "snapshot.preferAnchor || contentChanged",
    );
  });
});
