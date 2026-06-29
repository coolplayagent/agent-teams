/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { translate, type TranslationKey } from "../i18n";

const settingsCenterSource = readFileSync("src/features/settings/SettingsCenter.tsx", "utf8");

describe("settings navigation parity", () => {
  it("keeps the V1 settings section order and labels", () => {
    const primarySections = settingsSections();

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
    expect(systemSettingsPages()).toEqual([
      { key: "mcp", label: "MCP" },
      { key: "plugins", label: "Plugins" },
      { key: "commands", label: "Commands" },
      { key: "hooks", label: "Hooks" },
      { key: "agent-runtime", label: "Agent Runtime" },
      { key: "github", label: "GitHub" },
      { key: "triggers", label: "Gateway" },
    ]);
    expect(settingsCenterSource).toMatch(
      /selectedPage !== null[\s\S]*?<SystemSettingsPageContent page={selectedPage} \/>/,
    );
  });
});

interface SettingsNavItem {
  key: string;
  label: string;
}

function settingsSections(): SettingsNavItem[] {
  const match = settingsCenterSource.match(
    /const sections = useMemo\([\s\S]*?\(\) => \[([\s\S]*?)\],\s*\[t\],\s*\);/,
  );
  const sectionBlock = match?.[1] ?? "";
  return [...sectionBlock.matchAll(/key:\s*"([^"]+)" as const,\s*label:\s*t\("([^"]+)"\)/g)]
    .map((sectionMatch) => ({
      key: sectionMatch[1],
      label: translate("en", sectionMatch[2] as TranslationKey),
    }));
}

function systemSettingsPages(): SettingsNavItem[] {
  const match = settingsCenterSource.match(
    /const systemItems = useMemo\([\s\S]*?\(\) => \[([\s\S]*?)\],\s*\[t\],\s*\);/,
  );
  const pageBlock = match?.[1] ?? "";
  return [...pageBlock.matchAll(/key:\s*"([^"]+)",[\s\S]*?title:\s*t\("([^"]+)"\)/g)]
    .map((pageMatch) => ({
      key: pageMatch[1],
      label: translate("en", pageMatch[2] as TranslationKey),
    }));
}
