import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const view = readFileSync("src/features/search/SessionSearchView.tsx", "utf8");

describe("session search modal layout", () => {
  it("keeps header, toolbar, and the only scrolling results region separate", () => {
    expect(css).toMatch(/\.at-session-search-modal \.ant-modal-content\s*\{[^}]*display:\s*flex[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.at-session-search-modal \.ant-modal-body\s*\{[^}]*flex:\s*1 1 auto[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.at-session-search-results\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.at-session-search-results\s*\{[^}]*overscroll-behavior:\s*contain/s);
    expect(css).toMatch(/\.at-session-search-results\s*\{[^}]*touch-action:\s*pan-y/s);
    expect(view).toContain('className="at-session-search-results at-scroll-region"');
    expect(view).toContain("aria-activedescendant");
    expect(view).toContain('role="searchbox"');
    expect(view).not.toContain('type="search"');
  });

  it("keeps narrow results to a compact title and metadata pair", () => {
    expect(view).toContain('className="at-session-search-result-meta"');
    expect(view).toContain("at-session-search-result-time-compact");
    expect(view).toContain("at-session-search-result-time-wide");
    expect(view).toContain("title={row.workspaceRoot}");
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.at-session-search-result\s*\{[^}]*grid-template-columns:\s*1\.35rem minmax\(0, 1fr\)[^}]*align-items:\s*start/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.at-session-search-result-root,\s*\.at-session-search-result-time-wide\s*\{[^}]*display:\s*none/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.at-session-search-result-time-compact\s*\{[^}]*display:\s*block[^}]*min-width:\s*max-content[^}]*text-overflow:\s*clip/s,
    );
  });
});
