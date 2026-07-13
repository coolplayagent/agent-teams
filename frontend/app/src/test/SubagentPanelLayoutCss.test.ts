/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const panelCss = readFileSync("src/styles/subagentPanel.css", "utf8");
const shell = readFileSync("src/features/shell/AppShell.tsx", "utf8");

describe("subagent panel layout CSS", () => {
  it("overlays the panel without resizing the main timeline", () => {
    expect(shell).toContain('className="at-workspace-chat-shell"');
    expect(shell).toContain("style={subagentPanelStyle(subagentPanelWidth)}");
    expect(shell).not.toContain('"at-workspace-chat-shell has-subagent-panel"');
    expect(panelCss).toMatch(
      /\.at-subagent-side-panel\s*{[\s\S]*?position:\s*absolute;[\s\S]*?contain:\s*layout paint style;/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-panel-resizer\s*{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*var\(--at-subagent-panel-width, 620px\);/,
    );
    expect(shell).not.toContain("at-subagent-side-panel is-hidden");
  });

  it("keeps a definite panel height and one internal scroll owner", () => {
    expect(panelCss).toMatch(
      /\.at-subagent-side-panel\s*{[\s\S]*?inset:\s*0 0 0 auto;/,
    );
    expect(panelCss).toMatch(
      /\.at-subagent-heavy-surface\s*{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
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
