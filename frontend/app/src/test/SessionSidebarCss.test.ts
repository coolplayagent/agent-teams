import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");

describe("session sidebar row styles", () => {
  it("overlays session actions on metadata without reserving title width", () => {
    expect(css).toMatch(/\.at-session-item\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.at-session-actions\s*\{[^}]*position:\s*absolute[^}]*right:\s*5px/s);
    expect(css).toMatch(/\.at-session-item:hover \.at-session-actions,[\s\S]*\.at-session-item\.has-open-confirm \.at-session-actions\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/s);
  });

  it("prevents drag selection while preserving editable text selection", () => {
    expect(css).toMatch(/\.at-sidebar-inner\s*\{[^}]*user-select:\s*none/s);
    expect(css).toMatch(/\.at-sidebar-inner input,[\s\S]*\[contenteditable="true"\]\s*\{[^}]*user-select:\s*text/s);
  });
});
