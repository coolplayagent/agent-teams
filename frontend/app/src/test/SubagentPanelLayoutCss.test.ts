/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const panelCss = readFileSync("src/styles/subagentPanel.css", "utf8");
const shell = readFileSync("src/features/shell/AppShell.tsx", "utf8");

describe("subagent panel layout CSS", () => {
  it("splits the workspace between the main timeline and the resizable workbench", () => {
    expect(shell).toContain("style={subagentPanelStyle(subagentPanelWidth)}");
    expect(shell).toContain('"at-workspace-chat-shell has-subagent-panel"');
    expect(panelCss).toMatch(
      /\.at-workspace-chat-shell\.has-subagent-panel\s*{[\s\S]*?grid-template-columns:[\s\S]*?minmax\(480px, 1fr\)[\s\S]*?minmax\(420px, var\(--at-subagent-panel-width, 50%\)\);/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-panel-resizer\s*{[\s\S]*?position:\s*relative;[\s\S]*?grid-column:\s*2;/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-side-panel\s*{[\s\S]*?position:\s*relative;[\s\S]*?grid-column:\s*3;[\s\S]*?contain:\s*layout paint style;/,
    );
    expect(shell).not.toContain("at-subagent-side-panel is-hidden");
  });

  it("keeps tabs outside the one timeline scroll owner", () => {
    expect(panelCss).toMatch(
      /\.at-subagent-side-panel\s*{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-workbench-content\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);[\s\S]*?min-height:\s*0;/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-heavy-surface\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);[\s\S]*?min-height:\s*0;/,
    );
    expect(css).toMatch(
      /\.at-subagent-session-view\s*{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(css).toMatch(
      /\.at-subagent-session-body\s*>\s*\.at-timeline-frame\s*>\s*\.at-timeline\s*{[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(css).not.toContain(".at-subagent-session-prompt");
  });
});
