/// <reference types="node" />

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const distAppRoot = join("..", "dist", "app");
const appIndexHtmlPath = join(distAppRoot, "index.html");

describe("React app build artifacts", () => {
  it("keeps the committed React app entry wired to existing bundled assets", () => {
    const html = readFileSync(appIndexHtmlPath, "utf8");
    const assetPaths = appAssetReferences(html);

    expect(assetPaths.some((assetPath) => assetPath.endsWith(".js"))).toBe(true);
    expect(assetPaths.some((assetPath) => assetPath.endsWith(".css"))).toBe(true);

    for (const assetPath of assetPaths) {
      const filePath = join(distAppRoot, assetPath.replace(/^\/app\//, ""));
      expect(normalize(filePath).startsWith(normalize(distAppRoot))).toBe(true);
      expect(existsSync(filePath), `${assetPath} should exist`).toBe(true);
      expect(statSync(filePath).size, `${assetPath} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("keeps the React app entry independent from retired hand-maintained modules", () => {
    const html = readFileSync(appIndexHtmlPath, "utf8");

    expect(html).not.toContain("/js/");
    expect(html).not.toContain("frontend/dist/js");
    expect(html).not.toContain("newSessionDraft.js");
    expect(html).not.toContain("subagentRail.js");
  });
});

function appAssetReferences(html: string): string[] {
  return Array.from(html.matchAll(/\b(?:src|href)="(\/app\/assets\/[^"]+)"/g))
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => left.localeCompare(right));
}
