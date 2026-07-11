import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

    render(<ControlledRoundMarker prompt={prompt} />);

    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Expand"));

    expect(screen.getByText("Collapse")).toBeVisible();
    expect(screen.queryByText("Expand")).not.toBeInTheDocument();
    expect(screen.getAllByText(prompt)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse" }))
      .toHaveTextContent(/^Collapse$/);
    expect(screen.getByRole("button", { name: "Collapse" }))
      .not.toHaveTextContent("Run a long streaming validation prompt");
    expect(screen.getByRole("button", { name: "Collapse" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".at-round-prompt-body"))
      .toHaveClass("is-expanded");
  });

  it("uses one aligned disclosure control and keeps the body mounted", () => {
    render(
      <ControlledRoundMarker
        prompt="A long prompt that remains mounted while collapsed for a stable virtual row."
      />,
    );

    const button = screen.getByRole("button", { name: "Expand" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".at-round-prompt-body")).toHaveClass("is-collapsed");
    expect(document.querySelector(".at-round-marker-intent-summary")).toBeNull();

    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Collapse" })).toBe(button);
    expect(document.querySelector(".at-round-prompt-body")).toHaveClass("is-expanded");
  });
});

function ControlledRoundMarker({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <RoundMarker
      index={0}
      onPromptOpenChange={setOpen}
      promptOpen={open}
      round={round(prompt)}
      t={t}
    />
  );
}

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
