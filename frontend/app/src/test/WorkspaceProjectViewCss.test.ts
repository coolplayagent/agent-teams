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
});
