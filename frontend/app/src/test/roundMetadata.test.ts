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
