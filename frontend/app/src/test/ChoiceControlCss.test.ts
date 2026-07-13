import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/components/ChoiceControl.css", "utf8");

describe("choice control styling", () => {
  it("keeps dense targets keyboard-visible and theme-token based", () => {
    expect(css).toContain("min-height: 32px");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("--at-control-bg");
    expect(css).toContain("--at-primary");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".at-choice-control.is-row");
    expect(css).toContain(".at-choice-control.is-switch.is-row");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) var(--at-choice-size)");
  });

  it("does not draw a full-row frame for mouse selection", () => {
    expect(css).not.toMatch(
      /\.at-choice-control\.is-row\.is-checked\s*\{[^}]*border-color/s,
    );
    expect(css).toMatch(
      /:has\(\.at-choice-control-input:focus-visible\)\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--at-primary\)/s,
    );
  });
});
