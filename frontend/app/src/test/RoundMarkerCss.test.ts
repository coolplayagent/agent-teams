import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/timeline/RoundMarker.css", "utf8");

describe("RoundMarker CSS", () => {
  it("clamps collapsed prompts to two lines without a synthetic disclosure glyph", () => {
    expect(css).toMatch(
      /\.at-round-prompt-body\.is-collapsed\s*{[\s\S]*?-webkit-line-clamp:\s*2;/,
    );
    expect(css).not.toContain('content: ">"');
  });

  it("disables the prompt reveal animation for reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.at-round-prompt-body\.is-expanded\s*{[\s\S]*?animation:\s*none;/,
    );
  });
});
