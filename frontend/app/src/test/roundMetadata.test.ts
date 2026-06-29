import { describe, expect, it } from "vitest";

import type { SessionRound } from "../api/contracts";
import { roundSummary } from "../features/timeline/roundMetadata";

describe("roundMetadata", () => {
  it("keeps verification failures in the warning lane instead of failed-run error tone", () => {
    const summary = roundSummary(
      round({
        run_status: "failed",
        verification_status: "failed",
      }),
      0,
    );

    expect(summary.statusLabel).toBe("verification failed");
    expect(summary.tone).toBe("warning");
  });

  it("keeps ordinary failed rounds in the error lane", () => {
    const summary = roundSummary(
      round({
        run_status: "failed",
        verification_status: "verified",
      }),
      0,
    );

    expect(summary.statusLabel).toBe("failed");
    expect(summary.tone).toBe("error");
  });

  it("normalizes marker titles while preserving multiline prompt text", () => {
    const summary = roundSummary(
      round({
        run_user_message: "Plan the V2 shell\nKeep V1 navigation intact",
      }),
      0,
    );

    expect(summary.title).toBe("Plan the V2 shell Keep V1 navigation intact");
    expect(summary.promptText).toBe("Plan the V2 shell\nKeep V1 navigation intact");
    expect(summary.promptCollapsible).toBe(true);
  });

  it("keeps short round prompts as plain marker titles", () => {
    const summary = roundSummary(
      round({
        run_user_message: "Review deployment",
      }),
      0,
    );

    expect(summary.title).toBe("Review deployment");
    expect(summary.promptText).toBe("Review deployment");
    expect(summary.promptCollapsible).toBe(false);
  });
});

function round(overrides: Partial<SessionRound> = {}): SessionRound {
  return {
    created_at: "2026-06-23T12:42:33Z",
    run_id: "run-1",
    run_phase: "terminal",
    run_user_message: "Verify deployment",
    ...overrides,
  };
}
