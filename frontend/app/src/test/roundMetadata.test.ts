import { afterEach, describe, expect, it } from "vitest";

import type { SessionRound } from "../api/contracts";
import {
  roundStatusDisplayLabel,
  roundSummary,
  sanitizeRoundDiagnosticText,
} from "../features/timeline/roundMetadata";
import { translate, type Translate } from "../i18n";

const en: Translate = (key, replacements) => translate("en", key, replacements);
const zh: Translate = (key, replacements) => translate("zh-CN", key, replacements);

afterEach(() => {
  delete document.documentElement.dataset.diagnosticsVisible;
});

describe("roundMetadata", () => {
  it("localizes known runtime statuses while preserving unknown provider states", () => {
    const expectedChineseStatuses = new Map([
      ["queued", "已排队"],
      ["running", "运行中"],
      ["stopping", "正在停止"],
      ["paused", "已暂停"],
      ["stopped", "已停止"],
      ["completed", "已完成"],
      ["failed", "失败"],
      ["idle", "空闲"],
      ["streaming", "运行中"],
      ["coordinator_running", "运行中"],
      ["subagent_running", "运行中"],
      ["awaiting_tool_approval", "等待审批"],
      ["awaiting_manual_action", "等待输入"],
      ["awaiting_subagent_followup", "等待子代理"],
      ["awaiting_recovery", "恢复中"],
      ["terminal", "已结束"],
      ["manual", "手动处理"],
    ]);
    for (const [status, expected] of expectedChineseStatuses) {
      expect(roundStatusDisplayLabel(status, zh)).toBe(expected);
    }
    expect(roundStatusDisplayLabel("completed", en)).toBe("Completed");
    expect(roundStatusDisplayLabel("verification failed", zh)).toBe("验证失败");
    expect(roundStatusDisplayLabel("provider_warming", zh)).toBe("provider_warming");
    expect(roundStatusDisplayLabel(null, zh)).toBe("");
  });
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
        run_user_message: "Plan the React shell\nKeep V1 navigation intact",
      }),
      0,
    );

    expect(summary.title).toBe("Plan the React shell Keep V1 navigation intact");
    expect(summary.promptText).toBe("Plan the React shell\nKeep V1 navigation intact");
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

  it("formats round durations with seconds, minutes, and hours", () => {
    expect(
      roundSummary(
        round({
          run_started_at: "2026-06-23T12:00:00Z",
          run_updated_at: "2026-06-23T12:00:34Z",
        }),
        0,
      ).durationLabel,
    ).toBe("34s");
    expect(
      roundSummary(
        round({
          run_started_at: "2026-06-23T12:00:00Z",
          run_updated_at: "2026-06-23T12:03:04Z",
        }),
        0,
      ).durationLabel,
    ).toBe("3m 4s");
    expect(
      roundSummary(
        round({
          run_started_at: "2026-06-23T12:00:00Z",
          run_updated_at: "2026-06-23T13:02:00Z",
        }),
        0,
      ).durationLabel,
    ).toBe("1h 2m");
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
