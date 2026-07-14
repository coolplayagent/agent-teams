import { describe, expect, it } from "vitest";

import {
  shouldAdjustTimelineScrollForItemSizeChange,
  timelineScrollTopForViewportAnchor,
} from "../features/timeline/timelineScrollAnchoring";

describe("timeline scroll anchoring", () => {
  it("restores a saved viewport offset without content-coordinate assumptions", () => {
    expect(
      timelineScrollTopForViewportAnchor(3_441, 214.21875, 228.21875),
    ).toBe(3_427);
  });

  it("suppresses size compensation only while external restoration is pending", () => {
    expect(
      shouldAdjustTimelineScrollForItemSizeChange(true, 3_409, 3_427),
    ).toBe(false);
    expect(
      timelineScrollTopForViewportAnchor(3_441, 214.21875, 228.21875),
    ).toBe(3_427);
    expect(
      shouldAdjustTimelineScrollForItemSizeChange(false, 3_409, 3_427),
    ).toBe(true);
    expect(
      shouldAdjustTimelineScrollForItemSizeChange(false, 3_500, 3_427),
    ).toBe(false);
  });
});
