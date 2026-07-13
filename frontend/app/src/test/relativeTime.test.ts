import { describe, expect, it } from "vitest";

import { formatCompactRelativeTime } from "../runtime/relativeTime";

const now = Date.parse("2026-07-13T08:00:00Z");

describe("formatCompactRelativeTime", () => {
  it("uses locale data instead of hand-maintained language branches", () => {
    expect(formatCompactRelativeTime("2026-07-13T07:59:30Z", "en", now)).toBe("now");
    expect(formatCompactRelativeTime("2026-07-13T07:59:30Z", "zh-CN", now)).toBe("现在");
    expect(formatCompactRelativeTime("2026-07-13T07:58:00Z", "en", now)).toBe("2m");
    expect(formatCompactRelativeTime("2026-07-13T07:58:00Z", "zh-CN", now)).toBe("2分钟");
  });

  it("keeps invalid and missing timestamps empty", () => {
    expect(formatCompactRelativeTime(undefined, "en", now)).toBe("");
    expect(formatCompactRelativeTime("not-a-date", "en", now)).toBe("");
  });
});
