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
    expect(css).toMatch(
      /\.at-choice-control\.is-row\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.at-choice-control\.is-row:hover\s*\{[^}]*background:\s*var\(--at-surface-hover\);/s,
    );
    expect(css).not.toMatch(
      /\.at-choice-control\.is-row\.is-checked\s*\{[^}]*border-color/s,
    );
    expect(css).not.toMatch(
      /:has\(\.at-choice-control-input:focus-visible\)\s*\{[^}]*box-shadow/s,
    );
    expect(css).toMatch(
      /\.at-choice-control-input:focus-visible\s*\+\s*\.at-choice-control-indicator\s*\{[^}]*box-shadow:\s*0 0 0 3px var\(--at-focus-ring\)/s,
    );
    expect(css).toMatch(
      /\.at-choice-control-input:focus-visible\s*\{[^}]*outline:\s*none;/s,
    );
  });

  it("anchors the native input to its visible control so focusing cannot scroll elsewhere", () => {
    expect(css).toMatch(
      /\.at-choice-control\s*\{[^}]*position:\s*relative;/s,
    );
    expect(css).toMatch(
      /\.at-choice-control-input\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*left:\s*0;/s,
    );
  });
});
