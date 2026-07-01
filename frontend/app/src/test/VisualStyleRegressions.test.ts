/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

const settingsSources = {
  commands: readFileSync(
    "src/features/settings/CommandsSettingsSection.tsx",
    "utf8",
  ),
  environment: readFileSync(
    "src/features/settings/EnvironmentSettingsSection.tsx",
    "utf8",
  ),
  github: readFileSync(
    "src/features/settings/GitHubSettingsSection.tsx",
    "utf8",
  ),
  mcp: readFileSync("src/features/settings/McpSettingsSection.tsx", "utf8"),
  orchestration: readFileSync(
    "src/features/settings/OrchestrationSettingsSection.tsx",
    "utf8",
  ),
  runtime: readFileSync(
    "src/features/settings/RuntimeSettingsSections.tsx",
    "utf8",
  ),
  settingsCenter: readFileSync(
    "src/features/settings/SettingsCenter.tsx",
    "utf8",
  ),
  triggers: readFileSync(
    "src/features/settings/TriggerSettingsSection.tsx",
    "utf8",
  ),
  web: readFileSync("src/features/settings/WebSettingsSection.tsx", "utf8"),
  workspace: readFileSync(
    "src/features/settings/WorkspaceSettingsSection.tsx",
    "utf8",
  ),
};

const observabilitySources = {
  panel: readFileSync("src/features/shell/ObservabilityPanel.tsx", "utf8"),
  trends: readFileSync("src/features/shell/ObservabilityTrends.tsx", "utf8"),
};

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedSelector}\\s*{`, "m").exec(themeCss);
  const start = match?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const end = themeCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return themeCss.slice(start, end);
}

function cssRange(startSelector: string, endSelector: string): string {
  const start = themeCss.indexOf(`${startSelector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = themeCss.indexOf(`${endSelector} {`, start);
  expect(end).toBeGreaterThan(start);
  return themeCss.slice(start, end);
}

function expectNoDecorativeSurface(css: string): void {
  expect(css).not.toMatch(/radial-gradient|filter:\s*blur|backdrop-filter/);
  expect(css).not.toMatch(/linear-gradient/);
  expect(css).not.toMatch(/translate[XY]\(/);
  expect(css).not.toMatch(/box-shadow:\s*0\s+2[0-9]px/);
}

describe("visual style regressions", () => {
  it("keeps connector and observability surfaces plain and theme-compatible", () => {
    const connectorsCss = cssRange(".at-connectors-view", ".at-runtime-tools");
    const observabilityCss = cssRange(".at-stat-grid", ".at-spec-lineage");

    for (const css of [connectorsCss, observabilityCss]) {
      expect(css).not.toContain("--surface-panel");
      expect(css).not.toContain("--surface-subtle");
      expect(css).not.toContain("--text-muted");
      expect(css).toContain("var(--at-surface)");
      expect(css).toContain("var(--at-text-muted)");
      expect(css).toContain("var(--at-border)");
      expectNoDecorativeSurface(css);
    }
    expect(connectorsCss).toContain("var(--at-surface-muted)");

    const connectorCard = cssBlock(".at-connectors-card");
    expect(connectorCard).toContain("border-radius: 8px;");
    expect(connectorCard).toContain("background: var(--at-surface);");
    expect(connectorCard).not.toContain("border-radius: 999px;");

    const observabilityCard = cssBlock(".at-trend-card");
    expect(observabilityCard).toContain("border-radius: 8px;");
    expect(observabilityCard).toContain("background: var(--at-surface);");
    expect(observabilityCard).not.toContain("border-radius: 999px;");
  });

  it("keeps observability chart styling centralized in CSS variables", () => {
    expect(observabilitySources.panel).toContain("data-observability-metric");
    expect(observabilitySources.trends).toContain("className=\"at-trend-bar\"");
    expect(observabilitySources.panel).not.toMatch(/rgba\(\s*37,\s*99,\s*235/);
    expect(observabilitySources.panel).not.toMatch(/rgba\(\s*124,\s*58,\s*237/);
    expect(observabilitySources.trends).not.toMatch(/rgba\(\s*37,\s*99,\s*235/);
    expect(observabilitySources.trends).not.toMatch(/rgba\(\s*124,\s*58,\s*237/);

    const trendBar = cssBlock(".at-trend-bar");
    expect(trendBar).toContain("var(--at-primary)");
    expect(trendBar).toContain("var(--at-surface)");
    expect(trendBar).not.toMatch(/rgba\(\s*37,\s*99,\s*235/);
    expect(trendBar).not.toMatch(/rgba\(\s*124,\s*58,\s*237/);
  });

  it("keeps settings pages on shared list, form, and empty-state primitives", () => {
    for (const source of [
      settingsSources.commands,
      settingsSources.environment,
      settingsSources.orchestration,
      settingsSources.runtime,
      settingsSources.settingsCenter,
      settingsSources.triggers,
      settingsSources.workspace,
    ]) {
      expect(source).toContain("at-settings-list");
      expect(source).toContain("at-settings-list-row");
      expect(source).toContain("at-settings-list-main");
      expect(source).toContain("at-settings-empty");
    }
    expect(settingsSources.mcp).toContain("at-mcp-server-card");
    expect(settingsSources.mcp).toContain("at-mcp-tool-row");
    expect(settingsSources.mcp).toContain("at-settings-empty");

    for (const source of [
      settingsSources.commands,
      settingsSources.environment,
      settingsSources.github,
      settingsSources.mcp,
      settingsSources.runtime,
      settingsSources.triggers,
      settingsSources.web,
      settingsSources.workspace,
    ]) {
      expect(source).toContain("at-settings-form-card");
    }

    expect(settingsSources.commands).toContain("at-commands-groups");
    expect(settingsSources.commands).toContain("at-settings-list at-commands-list");
    expect(settingsSources.commands).not.toContain("commands-table");
    expect(settingsSources.commands).not.toContain("commands-table-head");
    expect(settingsSources.commands).not.toContain("commands-total");
    expect(settingsSources.commands).not.toContain("commands-empty-icon");
    expect(settingsSources.runtime).not.toContain("plugins-toolbar-stats");
    expect(settingsSources.runtime).not.toContain("plugins-inline-hint");
    expect(settingsSources.runtime).not.toContain("settings.plugins.git_ref_help");
  });

  it("keeps shared settings primitives visually restrained", () => {
    const formCard = cssBlock(".at-settings-form-card");
    expect(formCard).toContain("border: 1px solid var(--at-border);");
    expect(formCard).toContain("border-radius: 8px;");
    expect(formCard).toContain("background: var(--at-surface);");
    expectNoDecorativeSurface(formCard);

    const settingsList = cssBlock(".at-settings-list");
    expect(settingsList).toContain("border: 1px solid var(--at-border);");
    expect(settingsList).toContain("border-radius: 8px;");
    expect(settingsList).toContain("background: var(--at-surface);");
    expectNoDecorativeSurface(settingsList);

    const settingsRow = cssBlock(".at-settings-list-row");
    expect(settingsRow).toContain("border-bottom: 1px solid var(--at-border);");
    expect(settingsRow).toContain("background: transparent;");

    const settingsEmpty = cssBlock(".at-settings-empty");
    expect(settingsEmpty).toContain("border: 1px dashed var(--at-border);");
    expect(settingsEmpty).toContain("border-radius: 8px;");
    expect(settingsEmpty).toContain("background: var(--at-surface);");
    expectNoDecorativeSurface(settingsEmpty);

    const providerLink = cssBlock(".at-settings-provider-link");
    expect(providerLink).toContain("border: 1px solid var(--at-border);");
    expect(providerLink).toContain("border-radius: 8px;");
    expect(providerLink).not.toContain("border-radius: 999px;");
    expectNoDecorativeSurface(providerLink);
  });

  it("keeps settings option lists vertically scrollable instead of clipped", () => {
    const sectionBody = cssBlock(".at-settings-section-body");
    expect(sectionBody).toContain("overflow: auto;");

    const settingsList = cssBlock(".at-settings-list");
    expect(settingsList).toContain("overflow: hidden;");
    expect(settingsList).not.toContain("overflow: auto;");

    const catalogList = cssBlock(".at-model-catalog-list");
    expect(catalogList).toContain("max-height: 240px;");
    expect(catalogList).toContain("overflow: auto;");

    const nativeSelect = cssBlock(".at-settings-native-select");
    expect(nativeSelect).toContain("width: 100%;");
    expect(nativeSelect).toContain("min-width: 0;");
  });
});
