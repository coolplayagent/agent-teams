/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const newSessionCss = readFileSync(
  "src/features/sessions/NewSessionView.css",
  "utf8",
);
const newSessionSource = readFileSync(
  "src/features/sessions/NewSessionView.tsx",
  "utf8",
);

describe("new session empty-state layout", () => {
  it("keeps workspace context and project shortcuts above a bottom composer", () => {
    expect(newSessionSource).toContain("newSessionWorkspaceHeading");
    expect(newSessionSource).toContain('role="group"');
    expect(newSessionSource).toContain("newSessionQuickTasks(t)");
    expect(newSessionSource).toContain("<ComposerSurface");
    expect(newSessionSource).toContain("<ComposerRunControls");
    expect(newSessionCss).toMatch(
      /\.at-new-session-stage\s*{[\s\S]*?grid-template-rows:\s*minmax\(260px, 1fr\) auto;/,
    );
    expect(newSessionCss).toMatch(
      /\.at-new-session-composer\.at-composer\s*{[\s\S]*?grid-row:\s*2;[\s\S]*?width:\s*min\(1020px, 100%\);/,
    );
  });

  it("preserves density with explicit narrow-screen control layers", () => {
    expect(newSessionCss).toMatch(
      /\.at-new-session-quick-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/,
    );
    expect(newSessionCss).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.at-new-session-quick-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(newSessionCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.at-new-session-view\s*{[\s\S]*?padding:\s*16px 12px 12px;/,
    );
    expect(newSessionCss).toContain("text-wrap: balance");
  });

  it("uses keyboard focus and reduced-motion states with token-based colors", () => {
    expect(newSessionCss).toMatch(
      /\.at-new-session-quick-card:focus-visible\s*{[\s\S]*?outline:\s*2px solid var\(--at-accent\);/,
    );
    expect(newSessionCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(newSessionCss).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
