import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionRound } from "../api/contracts";
import { RoundRail } from "../features/timeline/RoundRail";
import { translate, type Translate } from "../i18n";

const t: Translate = (key, replacements) => translate("en", key, replacements);

describe("RoundRail", () => {
  it("preserves list scroll position across stable rerenders", () => {
    const rounds = [
      round("run-1", "Inspect issue"),
      round("run-2", "Implement feature"),
      round("run-3", "Verify behavior"),
    ];
    const { container, rerender } = render(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={rounds}
        t={t}
      />,
    );
    const list = container.querySelector<HTMLElement>(".at-round-rail-list");
    if (list === null) {
      throw new Error("Round rail list was not rendered.");
    }
    list.scrollTop = 96;

    rerender(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={rounds}
        t={t}
      />,
    );

    expect(screen.getByRole("button", { name: "Go to round 1: Inspect issue" }))
      .toHaveAttribute("aria-current", "step");
    expect(container.querySelector<HTMLElement>(".at-round-rail-list")?.scrollTop)
      .toBe(96);
  });
});

function round(runId: string, title: string): SessionRound {
  return {
    created_at: "2026-06-25T08:00:00Z",
    intent: title,
    intent_parts: [{ kind: "text", text: title }],
    run_id: runId,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: title,
    verification_status: "verified",
  };
}
