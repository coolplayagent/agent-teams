/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

describe("settings appearance layout CSS", () => {
  it("uses the settings content width instead of leaving a fixed empty column", () => {
    expect(themeCss).toMatch(
      /\.at-appearance-page\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*920px;/s,
    );
    expect(themeCss).not.toContain("width: min(100%, 690px);");
  });
});
