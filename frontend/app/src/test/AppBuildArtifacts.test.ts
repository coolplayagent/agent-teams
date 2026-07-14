/// <reference types="node" />

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const distAppRoot = join("..", "dist");
const appIndexHtmlPath = join(distAppRoot, "index.html");
const legacySourceRoot = join("..", "legacy", "src");
const legacyIndexHtmlPath = join(legacySourceRoot, "index.html");

describe("React app build artifacts", () => {
  it("declares an inline favicon so browsers do not request a missing asset", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toContain('<link rel="icon" href="data:," />');
  });

  it("keeps the committed React app entry wired to existing bundled assets", () => {
    const html = readFileSync(appIndexHtmlPath, "utf8");
    const assetPaths = appAssetReferences(html);

    expect(assetPaths.some((assetPath) => assetPath.endsWith(".js"))).toBe(true);
    expect(assetPaths.some((assetPath) => assetPath.endsWith(".css"))).toBe(true);

    for (const assetPath of assetPaths) {
      const filePath = join(distAppRoot, assetPath.replace(/^\//, ""));
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

describe("legacy app source", () => {
  it("keeps V1 assets scoped to its independent route", () => {
    const html = readFileSync(legacyIndexHtmlPath, "utf8");
    const assetPaths = Array.from(
      html.matchAll(/\b(?:src|href)="(\/v1\/(?:assets|css|js|vendor)\/[^\"]+)"/g),
    ).map((match) => match[1]);

    expect(assetPaths.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\b(?:src|href)="\/(?:assets|css|js|vendor)\//);
    for (const assetPath of assetPaths) {
      const sourcePath = join(legacySourceRoot, assetPath.replace(/^\/v1\//, ""));
      expect(existsSync(sourcePath), `${assetPath} should have source`).toBe(true);
      expect(statSync(sourcePath).size, `${assetPath} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("provides an unconditional route back to V2", () => {
    const html = readFileSync(legacyIndexHtmlPath, "utf8");

    expect(html).toContain('id="new-interface-link"');
    expect(html).toContain('href="/"');
    expect(html).toContain("V2");
  });
});

function appAssetReferences(html: string): string[] {
  return Array.from(html.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/g))
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => left.localeCompare(right));
}
