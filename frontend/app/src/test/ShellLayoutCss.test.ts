/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

describe("shell layout CSS", () => {
  it("keeps the desktop sidebar separated by the V1 resize gutter", () => {
    expect(themeCss).toMatch(
      /\.at-sidebar\s*{[\s\S]*?margin-right:\s*6px;/,
    );
    expect(themeCss).toMatch(
      /\.at-sidebar\s*{[\s\S]*?overflow:\s*visible;/,
    );
    expect(themeCss).toMatch(
      /\.at-sidebar-resizer\s*{[\s\S]*?right:\s*-6px;[\s\S]*?width:\s*6px;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-sidebar\s*{[\s\S]*?margin-right:\s*0;/,
    );
  });

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
    expect(themeCss).not.toMatch(/\.at-timeline-toolbar\s*{/);
    expect(themeCss).toMatch(
      /\.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%\);[\s\S]*?margin:\s*0 auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-actions\s*{[\s\S]*?min-height:\s*24px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-actions\s*{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end;/,
    );
  });

  it("keeps streaming message affordances declared in shared CSS", () => {
    expect(themeCss).toMatch(/@keyframes at-streaming-cursor-pulse/);
    expect(themeCss).toMatch(
      /\.streaming-cursor\s*{[\s\S]*?width:\s*2px;[\s\S]*?animation:\s*at-streaming-cursor-pulse 0\.9s ease-in-out infinite alternate;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-plain-stream\s*{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*pre-wrap;/,
    );
  });

  it("keeps the desktop round rail overlaid instead of reserving a chat column", () => {
    expect(themeCss).toMatch(
      /\.at-timeline-frame\.has-round-rail\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail\s*{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*16px;[\s\S]*?width:\s*128px;[\s\S]*?background:\s*transparent;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline-frame\.has-round-rail \.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), max\(0px, calc\(100% - 288px\)\)\);[\s\S]*?margin:\s*0 auto;/,
    );
  });

  it("keeps desktop composer controls compact inside the V1-wide shell", () => {
    expect(themeCss).toMatch(
      /\.at-composer\s*{[\s\S]*?padding:\s*0 24px 16px;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-inner\s*{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-controls\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;[\s\S]*?min-width:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-control-set\s*{[\s\S]*?display:\s*flex !important;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?min-width:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-controls > \.ant-space:last-child\s*{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?justify-content:\s*flex-end;/,
    );
    expect(themeCss).toMatch(/\.at-session-mode-control\s*{[\s\S]*?width:\s*204px;/);
    expect(themeCss).toMatch(
      /\.at-session-mode-control \.ant-segmented-item\s*{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-session-mode-control \.ant-segmented-item-label\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-normal-root-role-select,\s*\.at-orchestration-preset-select\s*{[\s\S]*?width:\s*116px;/,
    );
    expect(themeCss).toMatch(/\.at-role-select\s*{[\s\S]*?width:\s*116px;/);
    expect(themeCss).toMatch(/\.at-model-profile-select\s*{[\s\S]*?width:\s*128px;/);
  });

  it("keeps the appearance diff preview semantically green for additions", () => {
    expect(themeCss).toMatch(
      /\.at-appearance-theme-preview\s*{[\s\S]*?min-height:\s*120px;[\s\S]*?aspect-ratio:\s*1\.45;/,
    );
    expect(themeCss).toMatch(
      /\.at-appearance-diff-preview\s*{[\s\S]*?--at-appearance-diff-added:\s*#1a7f37;[\s\S]*?--at-appearance-diff-added-bg:\s*#dafbe1;/,
    );
    expect(themeCss).toMatch(
      /:root\[data-theme="dark"\] \.at-appearance-diff-preview\s*{[\s\S]*?--at-appearance-diff-added:\s*#3fb950;[\s\S]*?--at-appearance-diff-added-bg:\s*#13351f;/,
    );
    expect(themeCss).toMatch(
      /\.at-appearance-diff-side\.is-added \.at-appearance-code-line\.is-marked\s*{[\s\S]*?background:\s*var\(--at-appearance-diff-added-bg\);/,
    );
    expect(themeCss).toMatch(
      /\.at-appearance-diff-side\.is-added \.at-appearance-code-line > span:nth-child\(2\)\s*{[\s\S]*?color:\s*var\(--at-appearance-diff-added\);/,
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
