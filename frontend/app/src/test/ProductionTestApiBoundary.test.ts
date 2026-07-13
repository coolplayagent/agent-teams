import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productionModules = [
  "src/api/http.ts",
  "src/components/feedbackMessages.ts",
  "src/runtime/frontendLogger.ts",
];

describe("production test API boundary", () => {
  it.each(productionModules)("keeps test-only reset APIs out of %s", (filePath) => {
    const source = readFileSync(filePath, "utf-8");

    expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+\w*ForTests\b/);
  });
});
