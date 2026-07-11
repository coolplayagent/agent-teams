/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "src/features/workspaces/WorkspaceProjectView.css",
  "utf8",
);

describe("workspace project view CSS", () => {
  it("gives the changes workbench a two-pane layout", () => {
    expect(css).toMatch(
      /\.at-workspace-workbench-content\.is-changes\s*{[\s\S]*?grid-template-columns:\s*minmax\(220px, 24%\) minmax\(0, 1fr\);/,
    );
    expect(css).not.toMatch(
      /grid-template-columns:[^;]*minmax\([^;]*\)[^;]*minmax\([^;]*\)[^;]*minmax\(/,
    );
  });

  it("stacks only the change list and diff preview on narrow screens", () => {
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.at-workspace-workbench-content\.is-changes\s*{[\s\S]*?grid-template-rows:\s*minmax\(140px, 0\.3fr\) minmax\(220px, 0\.7fr\);/,
    );
  });

  it("stretches one shared diff canvas while preserving long-line scrolling", () => {
    expect(css).toMatch(
      /\.at-workspace-diff-canvas\s*{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*100%;/,
    );
    expect(css).toMatch(
      /\.at-workspace-diff-line\s*{[\s\S]*?grid-template-columns:\s*4\.5rem max-content;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*100%;/,
    );
    expect(css).toMatch(
      /\.at-workspace-diff-line-number\s*{[\s\S]*?position:\s*sticky;[\s\S]*?left:\s*0;/,
    );
    expect(css).toMatch(
      /\.at-workspace-diff-line-text\s*{[\s\S]*?white-space:\s*pre;/,
    );
    expect(css).not.toMatch(/min-width:\s*[1-9]\d{3,}px/);
  });

  it("animates directory disclosure once and respects reduced motion", () => {
    expect(css).toMatch(
      /\.at-workspace-tree-disclosure\s*{[\s\S]*?grid-template-rows:\s*0fr;[\s\S]*?opacity:\s*0;[\s\S]*?grid-template-rows 180ms ease,[\s\S]*?opacity 180ms ease,/,
    );
    expect(css).toMatch(
      /\.at-workspace-tree-disclosure\.is-expanded\s*{[\s\S]*?grid-template-rows:\s*1fr;[\s\S]*?opacity:\s*1;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.at-workspace-tree-disclosure,[\s\S]*?transition:\s*none;[\s\S]*?\.at-workspace-loading-dot\s*{[\s\S]*?animation:\s*none;/,
    );
  });
});
