/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
}

describe("semantic status colors", () => {
  it("defines theme-specific disabled status contrast", () => {
    expect(css.match(/--at-status-disabled:/g)).toHaveLength(2);
  });

  it.each([
    [".at-connectors-summary-cell.is-connected", "var(--at-success)"],
    [".at-connectors-summary-cell.is-needs_config", "var(--at-warning)"],
    [".at-connectors-summary-cell.is-disabled", "var(--at-status-disabled)"],
    [".at-connectors-status.is-connected > span", "var(--at-success)"],
    [".at-connectors-status.is-needs_config > span", "var(--at-warning)"],
    [".at-connectors-status.is-disabled > span", "var(--at-status-disabled)"],
  ])("uses semantic tokens for %s", (selector, token) => {
    const declaration = rule(selector);
    expect(declaration).toContain(token);
    expect(declaration).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
