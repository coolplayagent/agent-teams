import { describe, expect, it } from "vitest";

import { translate } from "../i18n";
import {
  CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS,
  CONTEXTUAL_SETTINGS_PAGE_KEYS,
  INFRASTRUCTURE_SETTINGS_SECTION_KEYS,
  LEGACY_SETTINGS_TAB_DEFINITIONS,
  SETTINGS_SECTION_DEFINITIONS,
} from "../features/settings/settingsNavigation";

describe("settings navigation parity", () => {
  it("keeps the V1 infrastructure pages at one clear settings level", () => {
    expect(primarySections()).toEqual([
      { key: "appearance", label: "Appearance" },
      { key: "general", label: "General" },
      { key: "speech", label: "Speech" },
      { key: "notifications", label: "Notifications" },
      { key: "models", label: "Model" },
      { key: "mcp", label: "MCP" },
      { key: "plugins", label: "Plugins" },
      { key: "commands", label: "Commands" },
      { key: "hooks", label: "Hooks" },
      { key: "agent-runtime", label: "Agent Runtime" },
      { key: "roles", label: "Roles" },
      { key: "orchestration", label: "Orchestration" },
      { key: "web", label: "Web" },
      { key: "proxy", label: "Proxy" },
      { key: "workspace", label: "Remote workspace" },
      { key: "environment", label: "Environment variables" },
    ]);
  });

  it("keeps homepage-owned products out of settings navigation", () => {
    const labels = primarySections().map((section) => section.label);
    expect(labels).not.toContain("ClawHub");
    expect(labels).not.toContain("GitHub");
    expect(labels).not.toContain("Gateway");
    expect(labels).not.toContain("System");
  });

  it("retains contextual connector routes without exposing duplicate entries", () => {
    expect(CONTEXTUAL_SETTINGS_PAGE_KEYS).toEqual(["github", "triggers"]);
    expect(CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS).toEqual([
      { key: "github", labelKey: "settingsGitHub" },
      { key: "triggers", labelKey: "settingsTriggers" },
    ]);
    expect(LEGACY_SETTINGS_TAB_DEFINITIONS.every((tab) => "section" in tab))
      .toBe(true);
  });

  it("defines every infrastructure destination exactly once", () => {
    const primaryKeys = SETTINGS_SECTION_DEFINITIONS.map((section) => section.key);
    expect(INFRASTRUCTURE_SETTINGS_SECTION_KEYS).toEqual([
      "mcp",
      "plugins",
      "commands",
      "hooks",
      "agent-runtime",
    ]);
    for (const key of INFRASTRUCTURE_SETTINGS_SECTION_KEYS) {
      expect(primaryKeys.filter((candidate) => candidate === key)).toHaveLength(1);
    }
    for (const key of CONTEXTUAL_SETTINGS_PAGE_KEYS) {
      expect(primaryKeys).not.toContain(key);
    }
  });
});

function primarySections(): Array<{ key: string; label: string }> {
  return SETTINGS_SECTION_DEFINITIONS.map((section) => ({
    key: section.key,
    label: translate("en", section.labelKey),
  }));
}
