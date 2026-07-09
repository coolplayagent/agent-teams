/// <reference types="node" />

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const frontendTestRoots = [
  "tests/integration_tests/frontend",
  "tests/unit_tests/frontend",
];

describe("frontend Python UI harness parity", () => {
  it("keeps frontend UI proof paths in TypeScript instead of Python harnesses", () => {
    expect(frontendPythonTestFiles()).toEqual([]);
  });
});

function frontendPythonTestFiles(): string[] {
  const files: string[] = [];
  for (const relativeRoot of frontendTestRoots) {
    const root = resolve(repoRoot, relativeRoot);
    if (!existsSync(root)) {
      continue;
    }
    collectPythonFiles(root, files);
  }
  return files
    .map((filePath) => normalizePath(relative(repoRoot, filePath)))
    .sort((left, right) => left.localeCompare(right));
}

function collectPythonFiles(currentPath: string, files: string[]): void {
  const stats = statSync(currentPath);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      collectPythonFiles(resolve(currentPath, entry), files);
    }
    return;
  }
  if (extname(currentPath) === ".py" && !currentPath.endsWith("__init__.py")) {
    files.push(currentPath);
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
