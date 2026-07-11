import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const view = readFileSync("src/features/search/SessionSearchView.tsx", "utf8");

describe("session search modal layout", () => {
  it("keeps header, toolbar, and the only scrolling results region separate", () => {
    expect(css).toMatch(/\.at-session-search-modal \.ant-modal-content\s*\{[^}]*display:\s*flex[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.at-session-search-modal \.ant-modal-body\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.at-session-search-results\s*\{[^}]*overflow:\s*auto/s);
    expect(view).toContain('className="at-session-search-results at-scroll-region"');
    expect(view).toContain("aria-activedescendant");
  });
});
