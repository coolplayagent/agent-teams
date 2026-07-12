/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/connectors/ConnectorsLayout.css", "utf8");
const source = readFileSync(
  "src/features/connectors/ConnectorsView.tsx",
  "utf8",
);
const mainSource = readFileSync("src/main.tsx", "utf8");

describe("connectors workbench layout", () => {
  it("loads the focused connector layout after the shared theme cascade", () => {
    expect(mainSource).toContain('import "./features/connectors/ConnectorsLayout.css"');
    expect(mainSource.indexOf('import "./features/connectors/ConnectorsLayout.css"'))
      .toBeGreaterThan(mainSource.indexOf('import "./styles/theme.css"'));
    expect(source).not.toContain('import "./ConnectorsLayout.css"');
  });

  it("uses compact status chips and a dense three-column scrolling card grid", () => {
    expect(css).toMatch(
      /\.at-connectors-overview\s*{[\s\S]*?justify-content:\s*space-between;/,
    );
    expect(css).toMatch(
      /\.at-connectors-summary\s*{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/,
    );
    expect(css).toMatch(
      /\.at-connectors-card-list\s*{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/,
    );
    expect(css).toMatch(
      /\.at-connectors-workbench\s*{[\s\S]*?overflow:\s*auto;/,
    );
    expect(css).toMatch(
      /\.at-connectors-content\s*{[\s\S]*?overflow:\s*hidden;/,
    );
    expect(css).toMatch(
      /\.at-connectors-card-footer\s*{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*space-between;/,
    );
    expect(source).toContain('className="at-connectors-card-meta"');
    expect(source).toContain('className="at-connectors-card-actions"');
  });

  it("steps the connector grid down to two and one columns", () => {
    expect(css).toMatch(
      /@media \(max-width: 1180px\)[\s\S]*?\.at-connectors-card-list,\s*\.at-runtime-tools-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-connectors-card-list,\s*\.at-runtime-tools-grid\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /\.at-runtime-tools-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /\.at-runtime-tools\s*{[\s\S]*?align-content:\s*start;[\s\S]*?grid-auto-rows:\s*max-content;/,
    );
    expect(css).toMatch(
      /\.at-runtime-tools-grid\s*{[\s\S]*?grid-auto-rows:\s*max-content;[\s\S]*?align-items:\s*start;/,
    );
    expect(css).toMatch(
      /\.at-runtime-tool-card\s*{[\s\S]*?align-content:\s*start;[\s\S]*?min-height:\s*104px;/,
    );
  });

  it("opens detail and gateway work in responsive centered modals", () => {
    expect(source.match(/<Modal/g)).toHaveLength(2);
    expect(source).toContain("className=\"at-connectors-modal\"");
    expect(source).toContain("at-gateway-connector-modal");
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.at-connectors-modal\s*{[\s\S]*?width:\s*calc\(100vw - 16px\) !important;/,
    );
  });
});
