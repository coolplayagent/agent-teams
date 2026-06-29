import { afterEach, describe, expect, it } from "vitest";

import type { SessionRound } from "../api/contracts";
import {
  roundSummary,
  sanitizeRoundDiagnosticText,
} from "../features/timeline/roundMetadata";

afterEach(() => {
  delete document.documentElement.dataset.diagnosticsVisible;
});

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

  it("hides raw verification diagnostics until diagnostics are enabled", () => {
    const rawDiagnostic = "verification_failedruntime_guardrail:pre_execution_boundary";

    expect(sanitizeRoundDiagnosticText(rawDiagnostic)).toBe(
      "Verification not passed.",
    );
    expect(
      sanitizeRoundDiagnosticText(
        "The verification_failed error code means the run did not satisfy a verifier.",
      ),
    ).toBe(
      "The verification_failed error code means the run did not satisfy a verifier.",
    );

    document.documentElement.dataset.diagnosticsVisible = "true";

    expect(sanitizeRoundDiagnosticText(rawDiagnostic)).toBe(rawDiagnostic);
  });

  it("uses safe diagnostic text for fallback round titles and labels", () => {
    const summary = roundSummary(
      round({
        run_diagnostic_message: [
          "Kept answer.",
          "",
          "Verification failed.",
          "Failed:",
          "[FAIL] runtime_guardrail:pre_execution_boundary -- blocked.",
        ].join("\n"),
        run_user_message: "",
      }),
      0,
    );

    expect(summary.title).toBe("Kept answer. Verification not passed.");
    expect(summary.diagnosticLabel).toBe("Kept answer. Verification not passed.");
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
