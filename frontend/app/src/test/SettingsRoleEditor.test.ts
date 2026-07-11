/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/settings/SettingsCenter.tsx", "utf8");
const css = readFileSync(
  "src/features/settings/SettingsRoleEditor.css",
  "utf8",
);

describe("role settings editor", () => {
  it("uses registry-backed capability multi-selects without free-form tags", () => {
    expect(source).toMatch(/interface RoleRegistryOptionsView[\s\S]*?mcp_servers\?: string\[\];[\s\S]*?tools\?: string\[\];/);
    expect(source).toMatch(/name="tools"[\s\S]*?mode="multiple"[\s\S]*?options=\{toolOptions\}/);
    expect(source).toMatch(/name="mcp_servers"[\s\S]*?mode="multiple"[\s\S]*?options=\{mcpServerOptions\}/);
    expect(source).not.toMatch(/name="tools"[\s\S]{0,180}?mode="tags"/);
    expect(source).not.toMatch(/name="mcp_servers"[\s\S]{0,180}?mode="tags"/);
  });

  it("keeps dirty persisted values visible and folds low-frequency fields", () => {
    expect(source).toContain("settingsRolePersistedUnknownOption");
    expect(source).toContain('<details className="at-role-advanced-disclosure">');
    expect(css).toMatch(/\.at-role-primary-grid\s*{[\s\S]*?repeat\(4,/);
    expect(source).not.toContain('className="at-settings-list at-role-config-properties"');
    expect(source).toContain("at-role-config-metadata");
    expect(source).not.toMatch(/at-role-config-metadata[\s\S]{0,300}?settingsRoleModelProfile/);
    expect(css).toMatch(/\.at-role-config-detail \.at-role-config-form[\s\S]*?max-width:\s*none;/);
    expect(css).toMatch(
      /\.at-settings-detail-page\.at-role-config-detail[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/,
    );
  });
});
