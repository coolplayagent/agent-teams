import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mainSource = readFileSync("src/main.tsx", "utf8");
const componentTheme = readFileSync("src/styles/componentTheme.css", "utf8");

describe("component semantic theme CSS", () => {
  it("loads after the base theme so semantic component rules win", () => {
    const baseThemeIndex = mainSource.indexOf('import "./styles/theme.css";');
    const componentThemeIndex = mainSource.indexOf(
      'import "./styles/componentTheme.css";',
    );
    expect(baseThemeIndex).toBeGreaterThanOrEqual(0);
    expect(componentThemeIndex).toBeGreaterThan(baseThemeIndex);
  });

  it("themes high-risk Ant surfaces and composer controls with semantic tokens", () => {
    for (const selector of [
      ".ant-segmented-item-selected",
      ".ant-select-dropdown",
      ".ant-modal .ant-modal-content",
      ".ant-popover .ant-popover-inner",
      ".ant-dropdown .ant-dropdown-menu",
      ".ant-tooltip .ant-tooltip-inner",
      ".at-composer .ant-select-selector",
      ".at-message-markdown code",
      ".at-tool-detail-section pre",
    ]) {
      expect(componentTheme).toContain(selector);
    }
    expect(componentTheme).toContain("var(--at-surface-selected)");
    expect(componentTheme).toContain("var(--at-control-text-disabled)");
    expect(componentTheme).toContain("var(--at-code-text)");
  });

  it("does not introduce fixed light or dark component colors", () => {
    expect(componentTheme).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(componentTheme).not.toMatch(/rgba?\(/i);
  });
});
