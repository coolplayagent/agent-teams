/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/connectors/ConnectorsLayout.css", "utf8");
const source = readFileSync(
  "src/features/connectors/ConnectorsView.tsx",
  "utf8",
);

describe("connectors workbench layout", () => {
  it("uses compact status chips and a single scrolling card grid", () => {
    expect(css).toMatch(
      /\.at-connectors-summary\s*{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/,
    );
    expect(css).toMatch(
      /\.at-connectors-card-list\s*{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, minmax\(280px, 1fr\)\);[\s\S]*?overflow:\s*visible;/,
    );
    expect(css).toMatch(
      /\.at-connectors-workbench\s*{[\s\S]*?overflow:\s*auto;/,
    );
  });

  it("opens detail and gateway work in responsive centered modals", () => {
    expect(source.match(/<Modal/g)).toHaveLength(2);
    expect(source).toContain("className=\"at-connectors-modal\"");
    expect(source).toContain("at-gateway-connector-modal");
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.at-connectors-modal\s*{[\s\S]*?width:\s*calc\(100vw - 16px\) !important;/,
    );
  });
});
