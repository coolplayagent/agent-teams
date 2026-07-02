/// <reference types="node" />

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeRoots = ["index.html", "src"];
const migrationBoundaryRoots = ["index.html", "src", "browser-tests"];
const testCleanupRoots = ["src/test", "browser-tests/support"];
const runtimeExtensions = new Set([".css", ".html", ".ts", ".tsx"]);
const skippedRuntimeSegments = new Set(["test"]);
const userFacingV2Pattern = /\bV2\b|\bv2\b/;
const pathV2Pattern = /(^|[-_/])v2($|[-_.\\/])|V2/;
const migrationBrowserSpecPathPattern = /^browser-tests\/v2-[a-z0-9-]+\.spec\.ts$/;

describe("user-facing naming parity", () => {
  it("keeps temporary V2 names out of runtime UI source", () => {
    expect(userFacingV2Findings()).toEqual([]);
  });

  it("keeps migration-only V2 file names isolated to browser proof specs", () => {
    expect(filePathV2Findings()).toEqual([]);
  });

  it("keeps non-runtime test support V2 names limited to documented boundaries", () => {
    expect(testSupportV2Findings()).toEqual([]);
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
    collectSourceFiles(root, files, { skipTestSegments: true });
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function migrationBoundaryFiles(): string[] {
  const files: string[] = [];
  for (const root of migrationBoundaryRoots) {
    collectSourceFiles(root, files, { skipTestSegments: false });
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function testCleanupFiles(): string[] {
  const files: string[] = [];
  for (const root of testCleanupRoots) {
    collectSourceFiles(root, files, { skipTestSegments: false });
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function collectSourceFiles(
  currentPath: string,
  files: string[],
  options: { skipTestSegments: boolean },
): void {
  const stats = statSync(currentPath);
  if (stats.isDirectory()) {
    const relativePath = normalizePath(relative(".", currentPath));
    const segments = relativePath.split("/");
    if (
      options.skipTestSegments
      && segments.some((segment) => skippedRuntimeSegments.has(segment))
    ) {
      return;
    }
    for (const entry of readdirSync(currentPath)) {
      collectSourceFiles(join(currentPath, entry), files, options);
    }
    return;
  }
  if (runtimeExtensions.has(extname(currentPath))) {
    files.push(currentPath);
  }
}

function filePathV2Findings(): string[] {
  return migrationBoundaryFiles()
    .map((filePath) => normalizePath(relative(".", filePath)))
    .filter((relativePath) => pathV2Pattern.test(relativePath))
    .filter((relativePath) => !migrationBrowserSpecPathPattern.test(relativePath));
}

function testSupportV2Findings(): string[] {
  const findings: string[] = [];
  for (const filePath of testCleanupFiles()) {
    const relativePath = normalizePath(relative(".", filePath));
    if (relativePath === "src/test/UserFacingNamingParity.test.ts") {
      continue;
    }
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!userFacingV2Pattern.test(line)) {
        return;
      }
      if (isAllowedTestCleanupBoundary(relativePath, line)) {
        return;
      }
      findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }
  return findings;
}

function isAllowedMigrationBoundary(relativePath: string, line: string): boolean {
  return (
    relativePath === "src/features/settings/SettingsCenter.tsx"
    && line.includes("snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/")
  );
}

function isAllowedTestCleanupBoundary(relativePath: string, line: string): boolean {
  return (
    relativePath === "src/test/SettingsDrawer.test.tsx"
    && line.includes("snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/")
  );
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
