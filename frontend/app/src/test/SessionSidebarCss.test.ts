import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");

describe("session sidebar row styles", () => {
  it("shares one metadata slot without reserving extra title width", () => {
    expect(css).toMatch(/\.at-session-item\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.at-session-meta-slot\s*\{[^}]*display:\s*inline-grid[^}]*grid-template-areas:\s*"session-meta"/s);
    expect(css).toMatch(/\.at-session-meta-slot > \.at-session-meta,[\s\S]*\.at-session-meta-slot > \.at-session-actions\s*\{[^}]*grid-area:\s*session-meta/s);
    expect(css).not.toMatch(/\.at-session-actions\s*\{[^}]*position:\s*absolute/s);
    expect(css).not.toMatch(/\.at-session-actions\s*\{[^}]*background:\s*(?:white|#fff|var\(--at-surface-muted\))/s);
  });

  it("shows actions only for hover, focus, or an open confirmation", () => {
    expect(css).toMatch(/\.at-session-item:hover \.at-session-actions,[\s\S]*\.at-session-item\.has-open-confirm \.at-session-actions\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/s);
    expect(css).not.toContain(".at-session-item.is-selected .at-session-actions");
    expect(css).toMatch(/\.at-session-item:hover \.at-session-meta-slot > \.at-session-meta,[\s\S]*\.has-open-confirm \.at-session-meta-slot > \.at-session-meta\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/s);
  });

  it("prevents drag selection while preserving editable text selection", () => {
    expect(css).toMatch(/\.at-sidebar-inner\s*\{[^}]*user-select:\s*none/s);
    expect(css).toMatch(/\.at-sidebar-inner input,[\s\S]*\[contenteditable="true"\]\s*\{[^}]*user-select:\s*text/s);
  });
});
