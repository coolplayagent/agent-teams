/// <reference types="node" />

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeRoots = ["index.html", "src"];
const runtimeExtensions = new Set([".css", ".html", ".ts", ".tsx"]);
const skippedRuntimeSegments = new Set(["test"]);
const userFacingV2Pattern = /\bV2\b|\bv2\b/;

describe("user-facing naming parity", () => {
  it("keeps temporary V2 names out of runtime UI source", () => {
    expect(userFacingV2Findings()).toEqual([]);
  });
});

function userFacingV2Findings(): string[] {
  const findings: string[] = [];
  for (const filePath of runtimeSourceFiles()) {
    const relativePath = normalizePath(relative(".", filePath));
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!userFacingV2Pattern.test(line)) {
        return;
      }
      if (isAllowedMigrationBoundary(relativePath, line)) {
        return;
      }
      findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }
  return findings;
}

function runtimeSourceFiles(): string[] {
  const files: string[] = [];
  for (const root of runtimeRoots) {
    collectRuntimeSourceFiles(root, files);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function collectRuntimeSourceFiles(currentPath: string, files: string[]): void {
  const stats = statSync(currentPath);
  if (stats.isDirectory()) {
    const relativePath = normalizePath(relative(".", currentPath));
    const segments = relativePath.split("/");
    if (segments.some((segment) => skippedRuntimeSegments.has(segment))) {
      return;
    }
    for (const entry of readdirSync(currentPath)) {
      collectRuntimeSourceFiles(join(currentPath, entry), files);
    }
    return;
  }
  if (runtimeExtensions.has(extname(currentPath))) {
    files.push(currentPath);
  }
}

function isAllowedMigrationBoundary(relativePath: string, line: string): boolean {
  return (
    relativePath === "src/features/settings/SettingsCenter.tsx"
    && line.includes("snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/")
  );
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
