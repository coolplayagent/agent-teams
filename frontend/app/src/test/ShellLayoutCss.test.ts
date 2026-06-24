/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

describe("shell layout CSS", () => {
  it("keeps settings navigation and content scrolling independently", () => {
    expect(themeCss).toMatch(
      /\.at-settings-drawer \.ant-drawer-body\s*{[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-settings-center\s*{[\s\S]*?grid-template-columns:\s*190px minmax\(0, 1fr\);[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-settings-nav\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-settings-content\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-settings-section-body\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/,
    );
  });

  it("keeps the timeline reading column narrower than the composer", () => {
    expect(themeCss).toMatch(/--at-timeline-column-width:\s*760px;/);
    expect(themeCss).toMatch(
      /\.at-timeline-toolbar\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%\);[\s\S]*?margin:\s*0 auto 8px;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%\);[\s\S]*?margin:\s*0 auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-inner\s*{[\s\S]*?width:\s*min\(940px, 100%\);/,
    );
  });

  it("keeps the narrow workspace full width behind the sidebar overlay", () => {
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-body\s*{[\s\S]*?position:\s*relative;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-sidebar-scrim\s*{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*11;[\s\S]*?inset:\s*0;[\s\S]*?display:\s*block;/,
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
