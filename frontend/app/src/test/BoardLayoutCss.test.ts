/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/boards/BoardLayout.css", "utf8");

describe("board workbench layout", () => {
  it("keeps four usable columns in the remaining board height", () => {
    expect(css).toMatch(
      /\.at-board-columns,[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(220px, 1fr\)\);[\s\S]*?overflow-x:\s*auto;[\s\S]*?overflow-y:\s*hidden;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?grid-auto-flow:\s*column;[\s\S]*?grid-template-columns:\s*none;/,
    );
  });

  it("keeps the title and controls compact", () => {
    expect(css).toMatch(
      /\.at-board-toolbar\s*{[\s\S]*?min-height:\s*44px;[\s\S]*?padding:\s*7px 16px;/,
    );
    expect(css).toMatch(
      /\.at-board-content\s*{[\s\S]*?gap:\s*8px;[\s\S]*?padding:\s*10px 14px 14px;/,
    );
    expect(css).toMatch(
      /\.at-board-view \.at-board-archive-toggle\s*{[\s\S]*?display:\s*inline-grid;[\s\S]*?align-items:\s*center;[\s\S]*?min-height:\s*32px;/,
    );
    expect(css).toMatch(
      /\.at-board-view \.at-board-archive-toggle \.at-choice-control-label\s*{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?line-height:\s*1;/,
    );
  });
});
