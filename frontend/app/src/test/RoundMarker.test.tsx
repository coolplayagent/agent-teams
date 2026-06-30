import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionRound } from "../api/contracts";
import { RoundMarker } from "../features/timeline/RoundMarker";
import { translate, type Translate } from "../i18n";

const t: Translate = (key, replacements) => translate("en", key, replacements);

describe("RoundMarker", () => {
  it("does not repeat the prompt in the header after expansion", () => {
    const prompt = [
      "Run a long streaming validation prompt and start an Explorer subagent,",
      "then inspect ten files before writing the summary.",
    ].join(" ");

    render(<RoundMarker index={0} round={round(prompt)} t={t} />);

    fireEvent.click(screen.getByText("Expand"));

    expect(screen.getByText("Collapse")).toBeVisible();
    expect(screen.queryByText("Expand")).not.toBeInTheDocument();
    expect(screen.getAllByText(prompt)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse" }))
      .not.toHaveTextContent("Run a long streaming validation prompt");
  });
});

function round(prompt: string): SessionRound {
  return {
    created_at: "2026-06-25T08:00:00Z",
    intent: prompt,
    intent_parts: [{ kind: "text", text: prompt }],
    run_id: "run-1",
    run_phase: "completed",
    run_status: "completed",
    run_user_message: prompt,
    verification_status: "verified",
  };
}
