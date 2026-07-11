import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const source = readFileSync(
  "src/features/automation/AutomationView.tsx",
  "utf8",
);

describe("automation responsive workbench", () => {
  it("uses its own container and collapses the detail sidebar before it clips", () => {
    expect(css).toMatch(
      /\.at-automation-view\s*{[\s\S]*?container:\s*at-automation\s*\/\s*inline-size;/,
    );
    expect(css).toMatch(
      /@container at-automation \(max-width: 1050px\)[\s\S]*?\.at-automation-detail-grid\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /\.at-automation-content\s*{[\s\S]*?overflow-x:\s*clip;/,
    );
  });

  it("switches narrow layouts between the list and detail with an in-place back action", () => {
    expect(css).toMatch(
      /@container at-automation \(max-width: 760px\)[\s\S]*?\.at-automation-content:not\(\.is-detail-open\) \.at-automation-detail,[\s\S]*?\.at-automation-content\.is-detail-open \.at-automation-list\s*{[\s\S]*?display:\s*none;/,
    );
    expect(source).toContain('className="at-automation-back"');
    expect(source).toContain("setMobileDetailOpen(false)");
  });
});
