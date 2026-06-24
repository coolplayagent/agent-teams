/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

describe("shell layout CSS", () => {
  it("keeps the narrow workspace full width behind the sidebar overlay", () => {
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-body\s*{[\s\S]*?position:\s*relative;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-sidebar\s*{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*12;[\s\S]*?inset:\s*0 auto 0 0;[\s\S]*?max-width:\s*calc\(100vw - 44px\);/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-sidebar-resizer\s*{[\s\S]*?display:\s*none;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-workspace\s*{[\s\S]*?flex:\s*1 1 100%;[\s\S]*?min-width:\s*0;/,
    );
  });
});
