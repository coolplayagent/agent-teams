/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedSelector}\\s*{`, "m").exec(themeCss);
  const start = match?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const end = themeCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return themeCss.slice(start, end);
}

describe("shell layout CSS", () => {
  it("keeps the chat shell locked to one page with independent scroll regions", () => {
    expect(themeCss).toMatch(
      /body,\s*#root\s*{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?width:\s*100%;/,
    );
    expect(themeCss).toMatch(/body\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(themeCss).toMatch(/#root\s*{[\s\S]*?display:\s*flex;[\s\S]*?overflow:\s*hidden;/);
    expect(themeCss).toMatch(
      /#root > \.ant-app\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-shell\s*{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-body\s*{[\s\S]*?height:\s*calc\(100dvh - 52px\);[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-sidebar \.ant-layout-sider-children\s*{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-session-list\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline-frame\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline-frame\s*{[\s\S]*?container-type:\s*inline-size;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline\s*{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer\s*{[\s\S]*?max-height:\s*min\(38dvh, 320px\);[\s\S]*?overflow:\s*auto;/,
    );
  });

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

  it("keeps sidebar creation and selected session chrome neutral like V1", () => {
    expect(themeCss).toMatch(
      /\.at-sidebar-new-session\.ant-btn\.ant-btn-primary\s*{[\s\S]*?border-color:\s*var\(--at-border\);[\s\S]*?background:\s*var\(--at-surface-muted\);[\s\S]*?box-shadow:\s*none;[\s\S]*?color:\s*var\(--at-text\);/,
    );
    expect(themeCss).toMatch(
      /\.at-sidebar-new-session\.ant-btn\.ant-btn-primary:not\(:disabled\):not\(\.ant-btn-disabled\):hover,[\s\S]*?\.at-sidebar-new-session\.ant-btn\.ant-btn-primary:not\(:disabled\):not\(\.ant-btn-disabled\):focus-visible\s*{[\s\S]*?background:\s*color-mix\(in srgb, var\(--at-surface-muted\) 82%, var\(--at-border\)\);/,
    );
    expect(themeCss).toMatch(
      /\.at-session-item\.is-selected\s*{[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--at-border-strong\) 55%, transparent\);[\s\S]*?background:\s*color-mix\(in srgb, var\(--at-surface-muted\) 78%, var\(--at-border\)\);/,
    );
    expect(themeCss).toMatch(
      /\.at-session-item\.is-selected:hover,[\s\S]*?\.at-session-item\.is-selected:focus-within\s*{[\s\S]*?background:\s*color-mix\(in srgb, var\(--at-surface-muted\) 72%, var\(--at-border-strong\)\);/,
    );
  });

  it("keeps settings navigation and content scrolling independently", () => {
    const settingsCenter = cssBlock(".at-settings-center");
    expect(settingsCenter).toContain("display: grid;");
    expect(settingsCenter).toContain("grid-template-columns: 190px minmax(0, 1fr);");
    expect(settingsCenter).toContain("height: 100%;");
    expect(settingsCenter).toContain("min-height: 0;");
    expect(settingsCenter).toContain("background: var(--at-surface);");

    const settingsNav = cssBlock(".at-settings-nav");
    expect(settingsNav).toContain("min-height: 0;");
    expect(settingsNav).toContain("overflow: auto;");
    expect(settingsNav).toContain("border-right: 1px solid var(--at-border);");
    expect(settingsNav).toContain("background: var(--at-sidebar);");

    const settingsNavItem = cssBlock(".at-settings-nav-item");
    expect(settingsNavItem).toContain("border: 0;");
    expect(settingsNavItem).toContain("border-radius: 6px;");
    expect(settingsNavItem).toContain("background: transparent;");

    expect(themeCss).toMatch(
      /\.at-settings-nav-item:hover,[\s\S]*?\.at-settings-nav-item:focus-visible,[\s\S]*?\.at-settings-nav-item\.is-active\s*{[\s\S]*?background:\s*var\(--at-surface-muted\);[\s\S]*?outline:\s*none;/,
    );
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

    const settingsSectionBody = cssBlock(".at-settings-section-body");
    expect(settingsSectionBody).not.toContain("border-top:");
    expect(themeCss).not.toContain(".settings-actions-bar");
  });

  it("keeps the workspace project view inside independent workbench scroll regions", () => {
    expect(themeCss).toMatch(
      /\.at-project-view\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-workbench\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-workbench-bar\s*{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?min-height:\s*42px;/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-workbench-content\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-workbench-content\.is-files\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(260px, 28%\);/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-workbench-content\.is-changes\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(240px, 26%\) minmax\(0, 1fr\) minmax\(240px, 24%\);/,
    );
    expect(themeCss).toMatch(
      /\.at-workspace-tree-list,\s*[\s\S]*?\.at-workspace-file-pane-list\s*{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-workspace-workbench-content\.is-files\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?grid-template-rows:\s*minmax\(220px, 0\.64fr\) minmax\(150px, 0\.36fr\);/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-workspace-workbench-content\.is-changes\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?grid-template-rows:\s*minmax\(140px, 0\.25fr\) minmax\(220px, 0\.5fr\) minmax\(150px, 0\.25fr\);/,
    );
  });

  it("keeps the timeline reading column narrower than the composer", () => {
    expect(themeCss).toMatch(/--at-timeline-column-width:\s*760px;/);
    expect(themeCss).not.toMatch(/\.at-timeline-toolbar\s*{/);
    expect(themeCss).toMatch(
      /\.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%\);[\s\S]*?margin:\s*0 auto;/,
    );
    expect(themeCss).toContain(
      "width: min(var(--at-timeline-column-width), 100%, max(320px, calc(100% - 288px)));",
    );
    expect(themeCss).not.toContain("max(0px, calc(100% - 288px))");
    expect(themeCss).toMatch(
      /\.at-message-actions\s*{[\s\S]*?min-height:\s*24px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-actions\s*{[\s\S]*?grid-column:\s*1;[\s\S]*?justify-self:\s*end;/,
    );
  });

  it("hides the round rail before it can collapse a split-panel timeline", () => {
    expect(themeCss).toMatch(
      /@container \(max-width: 1048px\)\s*{[\s\S]*?\.at-timeline-frame\.has-round-rail \.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%\);[\s\S]*?\.at-round-rail\s*{[\s\S]*?display:\s*none;/,
    );
  });

  it("keeps completed processed work visually folded until opened", () => {
    expect(themeCss).not.toContain(".at-processed-group-line");
    expect(themeCss).toMatch(
      /\.at-processed-group:not\(\[open\]\) > \.at-processed-group-body\s*{[\s\S]*?display:\s*none;/,
    );
    expect(themeCss).toMatch(
      /\.at-processed-group\[open\] > \.at-processed-group-summary \.at-processed-group-toggle\s*{[\s\S]*?transform:\s*rotate\(90deg\);/,
    );
    expect(themeCss).toMatch(
      /\.at-processed-group-summary\s*{[\s\S]*?display:\s*inline-flex;[\s\S]*?min-height:\s*24px;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-marker\s*{[\s\S]*?border-bottom:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-marker-intent\[data-open="true"\] \.at-round-marker-title\s*{[\s\S]*?display:\s*none;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-marker-intent\[data-open="true"\] \.at-round-marker-intent-summary\s*{[\s\S]*?justify-content:\s*flex-end;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-marker-intent-body\s*{[\s\S]*?margin-top:\s*6px;[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
  });

  it("keeps thinking blocks compact and collapsible in the message timeline", () => {
    const thinkingBlock = cssBlock(".at-message-thinking");
    expect(thinkingBlock).toContain("border-radius: 6px;");
    expect(thinkingBlock).toContain("background: var(--at-surface-muted);");
    expect(thinkingBlock).toContain("overflow: hidden;");

    const thinkingSummary = cssBlock(".at-message-thinking-summary");
    expect(thinkingSummary).toContain("display: flex;");
    expect(thinkingSummary).toContain("align-items: center;");
    expect(thinkingSummary).toContain("padding: 6px 10px;");
    expect(thinkingSummary).toContain("font-size: 12px;");
    expect(thinkingSummary).toContain("font-weight: 600;");

    expect(themeCss).toMatch(
      /\.at-message-thinking-summary::before\s*{[\s\S]*?content:\s*">";[\s\S]*?font-family:\s*var\(--at-font-mono\);[\s\S]*?transition:\s*transform 0\.16s ease;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-thinking\[open\] \.at-message-thinking-summary::before\s*{[\s\S]*?transform:\s*rotate\(90deg\);/,
    );
    expect(themeCss).toMatch(
      /\.at-message-thinking-body\s*{[\s\S]*?padding:\s*0 10px 8px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-thinking-body \.at-message-markdown\s*{[\s\S]*?line-height:\s*1\.48;/,
    );
  });

  it("keeps collapsed tool records compact in the message timeline", () => {
    expect(themeCss).toMatch(
      /\.at-message\.is-tool-only\s*{[\s\S]*?padding-top:\s*2px;[\s\S]*?padding-bottom:\s*2px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-tool-summary\s*{[\s\S]*?min-height:\s*30px;[\s\S]*?padding:\s*5px 8px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message\.is-tool-only \.at-message-tool-summary,[\s\S]*?\.at-processed-group-item\.is-tool-only \.at-message-tool-summary\s*{[\s\S]*?min-height:\s*28px;[\s\S]*?padding:\s*4px 8px;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-tool\[open\] \.at-message-tool-preview\s*{[\s\S]*?display:\s*none;/,
    );
  });

  it("keeps markdown code blocks constrained to the message column", () => {
    expect(themeCss).toMatch(
      /\.at-message-markdown\s*{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-markdown pre\s*{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-markdown pre code\s*{[\s\S]*?min-width:\s*max-content;[\s\S]*?white-space:\s*pre;/,
    );
  });

  it("keeps streaming message affordances declared in shared CSS", () => {
    expect(themeCss).toMatch(/@keyframes at-streaming-cursor-pulse/);
    expect(themeCss).toMatch(
      /\.streaming-cursor\s*{[\s\S]*?width:\s*6px;[\s\S]*?height:\s*6px;[\s\S]*?border-radius:\s*50%;[\s\S]*?animation:\s*at-streaming-cursor-pulse 0\.9s ease-in-out infinite alternate;/,
    );
    expect(themeCss).toMatch(
      /\.at-message-plain-stream\s*{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*pre-wrap;/,
    );
  });

  it("keeps legacy dist message and round selectors out of the V2 CSS surface", () => {
    expect(themeCss).not.toContain(".thinking-block");
    expect(themeCss).not.toContain(".user-prompt-block");
    expect(themeCss).not.toContain(".round-detail-header");
    expect(themeCss).not.toContain(".round-detail-topline");
    expect(themeCss).not.toContain(".round-detail-badges");
    expect(themeCss).not.toContain(".round-history-load-more");
    expect(themeCss).not.toContain(".round-nav-");
    expect(themeCss).not.toContain(".round-todo-card");
    expect(themeCss).not.toContain(".session-round-section");
  });

  it("keeps recovery prompts near the composer instead of above the timeline", () => {
    expect(themeCss).toMatch(
      /\.at-chat-view\s*{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\) auto auto auto;/,
    );
    expect(themeCss).toMatch(/\.at-timeline-frame\s*{[\s\S]*?grid-row:\s*1;/);
    expect(themeCss).toMatch(/\.at-recovery\s*{[\s\S]*?grid-row:\s*2;/);
    expect(themeCss).toMatch(
      /\.at-recovery-question\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
  });

  it("keeps fast session switch loading inside the timeline row", () => {
    expect(themeCss).toMatch(
      /\.at-chat-view\s*{[\s\S]*?position:\s*relative;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-session-switch-loading\s*{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*1;[\s\S]*?z-index:\s*5;[\s\S]*?min-height:\s*0;[\s\S]*?pointer-events:\s*none;/,
    );
    expect(themeCss).toMatch(/@keyframes at-session-switch-spin/);
  });

  it("keeps sidebar session motion limited to status and switch affordances", () => {
    expect(themeCss).toMatch(/@keyframes at-session-run-indicator-spin/);
    expect(themeCss).toMatch(
      /\.at-session-run-indicator\.is-running \.at-session-run-indicator-glyph\s*{[\s\S]*?animation:\s*at-session-run-indicator-spin 0\.82s linear infinite;/,
    );
    expect(themeCss).toMatch(/@keyframes at-session-switch-spin/);
    expect(themeCss).not.toContain("session-item-entering");
    expect(themeCss).not.toContain("session-item-removing");
    expect(themeCss).not.toContain("session-item-switch-target");
    expect(themeCss).not.toContain("sessionItemActivate");
    expect(themeCss).not.toContain("project-session-list.is-visibility");
    expect(themeCss).not.toContain("projectSessionVisibility");
  });

  it("keeps subagent sessions locked to the workspace frame", () => {
    expect(themeCss).toMatch(
      /\.at-subagent-session-view\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-subagent-session-title-row\s*{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\) max-content;/,
    );
    expect(themeCss).toMatch(
      /\.at-subagent-session-title\.ant-typography\s*{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-subagent-session-body\s*{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-subagent-session-body \.at-timeline\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?padding:\s*14px 16px 24px;/,
    );
  });

  it("keeps the desktop round rail overlaid without collapsing the chat column", () => {
    expect(themeCss).toMatch(
      /\.at-timeline-frame\.has-round-rail\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail\s*{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*16px;[\s\S]*?width:\s*128px;[\s\S]*?background:\s*transparent;/,
    );
    expect(themeCss).toMatch(
      /\.at-timeline-frame\.has-round-rail \.at-timeline-virtual\s*{[\s\S]*?width:\s*min\(var\(--at-timeline-column-width\), 100%, max\(320px, calc\(100% - 288px\)\)\);[\s\S]*?margin:\s*0 auto;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail-item:hover,[\s\S]*?\.at-round-rail-item:focus-visible,[\s\S]*?\.at-round-rail-item\.is-active\s*{[\s\S]*?background:\s*var\(--at-surface-muted\);[\s\S]*?outline:\s*none;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail-title\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail-todo li\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;[\s\S]*?min-width:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail-todo li span\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-round-rail-todo li em\s*{[\s\S]*?font-style:\s*normal;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 1160px\)[\s\S]*?\.at-timeline-frame\.has-round-rail\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.at-round-rail\s*{[\s\S]*?display:\s*none;/,
    );
  });

  it("keeps desktop composer controls readable inside the V1-wide shell", () => {
    expect(themeCss).toMatch(
      /\.at-composer\s*{[\s\S]*?padding:\s*0 24px 16px;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-inner\s*{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-controls\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;[\s\S]*?column-gap:\s*10px;[\s\S]*?row-gap:\s*6px;[\s\S]*?min-width:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-control-set\s*{[\s\S]*?column-gap:\s*8px !important;[\s\S]*?display:\s*flex !important;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*visible;[\s\S]*?row-gap:\s*6px !important;[\s\S]*?width:\s*100%;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-field\s*{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?gap:\s*6px;[\s\S]*?min-width:\s*0;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-field-label\s*{[\s\S]*?color:\s*var\(--at-text-muted\);[\s\S]*?font-size:\s*12px;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer-controls > \.ant-space:last-child\s*{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?justify-content:\s*flex-end;/,
    );
    expect(themeCss).toMatch(/\.at-session-mode-control\s*{[\s\S]*?width:\s*218px;/);
    expect(themeCss).toMatch(
      /\.at-session-mode-control \.ant-segmented-item\s*{[\s\S]*?min-width:\s*96px;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(themeCss).toMatch(
      /\.at-session-mode-control \.ant-segmented-item-label\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(themeCss).toMatch(
      /\.at-normal-root-role-select,\s*\.at-orchestration-preset-select\s*{[\s\S]*?width:\s*152px;/,
    );
    expect(themeCss).toMatch(
      /\.at-role-select\s*{[\s\S]*?width:\s*150px;/,
    );
    expect(themeCss).toMatch(
      /\.at-model-profile-select\s*{[\s\S]*?width:\s*146px;/,
    );
    expect(themeCss).toMatch(
      /\.at-composer \.ant-select-disabled \.ant-select-selector,[\s\S]*?\.at-composer \.ant-segmented-disabled\s*{[\s\S]*?background:\s*var\(--at-surface-muted\) !important;[\s\S]*?color:\s*var\(--at-text-muted\) !important;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-composer-controls\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 1320px\)[\s\S]*?\.at-composer-controls\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 1320px\)[\s\S]*?\.at-composer-controls > \.ant-space:last-child\s*{[\s\S]*?justify-content:\s*flex-end;[\s\S]*?width:\s*100%;/,
    );
    expect(themeCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-composer-control-set > \.ant-space-item:first-child\s*{[\s\S]*?grid-column:\s*1 \/ -1;/,
    );
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
