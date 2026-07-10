import { describe, expect, it } from "vitest";

import { translate } from "../i18n";
import {
  SETTINGS_SECTION_DEFINITIONS,
  SYSTEM_SETTINGS_PAGE_DEFINITIONS,
  V1_LEGACY_SETTINGS_TAB_DEFINITIONS,
} from "../features/settings/settingsNavigation";

describe("settings navigation parity", () => {
  it("keeps the V1 settings section order and labels", () => {
    const primarySections = SETTINGS_SECTION_DEFINITIONS.map((section) => ({
      key: section.key,
      label: translate("en", section.labelKey),
    }));

    expect(primarySections).toEqual([
      { key: "appearance", label: "Appearance" },
      { key: "general", label: "General" },
      { key: "speech", label: "Speech" },
      { key: "notifications", label: "Notifications" },
      { key: "models", label: "Model" },
      { key: "roles", label: "Roles" },
      { key: "orchestration", label: "Orchestration" },
      { key: "web", label: "Web" },
      { key: "clawhub", label: "ClawHub" },
      { key: "proxy", label: "Proxy" },
      { key: "workspace", label: "Remote workspace" },
      { key: "environment", label: "Environment variables" },
      { key: "system", label: "System" },
    ]);

    const primaryLabels = primarySections.map((section) => section.label);
    for (const secondaryOnlyLabel of [
      "MCP",
      "Plugins",
      "Commands",
      "Hooks",
      "Agent Runtime",
      "GitHub",
      "Gateway",
      "Skills",
      "Model Profiles",
      "MCP Config",
    ]) {
      expect(primaryLabels).not.toContain(secondaryOnlyLabel);
    }
  });

  it("keeps system settings pages behind the secondary page launcher", () => {
    expect(SYSTEM_SETTINGS_PAGE_DEFINITIONS.map((page) => ({
      key: page.key,
      label: translate("en", page.labelKey),
    }))).toEqual([
      { key: "mcp", label: "MCP" },
      { key: "plugins", label: "Plugins" },
      { key: "commands", label: "Commands" },
      { key: "hooks", label: "Hooks" },
      { key: "agent-runtime", label: "Agent Runtime" },
      { key: "github", label: "GitHub" },
      { key: "triggers", label: "Gateway" },
    ]);
  });

  it("maps every live V1 settings tab to one V2 page without inventing entries", () => {
    expect(V1_LEGACY_SETTINGS_TAB_DEFINITIONS.map((tab) => tab.label)).toEqual([
      "Appearance",
      "General",
      "Model",
      "MCP",
      "Plugins",
      "Commands",
      "Hooks",
      "Agent Runtime",
      "Roles",
      "Orchestration",
      "Web",
      "Proxy",
      "Remote Workspace",
      "Environment",
    ]);

    const mappedPrimarySections = new Set(
      V1_LEGACY_SETTINGS_TAB_DEFINITIONS.flatMap((tab) =>
        "v2Section" in tab ? [tab.v2Section] : [],
      ),
    );
    const mappedSystemPages = new Set(
      V1_LEGACY_SETTINGS_TAB_DEFINITIONS.flatMap((tab) =>
        "v2SystemPage" in tab ? [tab.v2SystemPage] : [],
      ),
    );
    expect([...mappedPrimarySections]).toEqual([
      "appearance",
      "general",
      "models",
      "roles",
      "orchestration",
      "web",
      "proxy",
      "workspace",
      "environment",
    ]);
    expect([...mappedSystemPages]).toEqual([
      "mcp",
      "plugins",
      "commands",
      "hooks",
      "agent-runtime",
    ]);
  });
});
