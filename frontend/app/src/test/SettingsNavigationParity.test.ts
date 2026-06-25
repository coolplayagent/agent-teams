/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsCenterSource = readFileSync("src/features/settings/SettingsCenter.tsx", "utf8");

describe("settings navigation parity", () => {
  it("keeps the V1 settings section order", () => {
    expect(settingsSectionKeys()).toEqual([
      "appearance",
      "general",
      "speech",
      "notifications",
      "models",
      "roles",
      "orchestration",
      "web",
      "clawhub",
      "proxy",
      "workspace",
      "environment",
      "system",
    ]);
  });

  it("keeps system settings pages behind the secondary page launcher", () => {
    expect(systemSettingsPageIds()).toEqual([
      "mcp",
      "plugins",
      "commands",
      "hooks",
      "agent-runtime",
      "github",
      "triggers",
    ]);
    expect(settingsCenterSource).toMatch(
      /selectedPage !== null[\s\S]*?<SystemSettingsPageContent page={selectedPage} \/>/,
    );
  });
});

function settingsSectionKeys(): string[] {
  const match = settingsCenterSource.match(
    /const sections = useMemo\([\s\S]*?\(\) => \[([\s\S]*?)\],\s*\[t\],\s*\);/,
  );
  const sectionBlock = match?.[1] ?? "";
  return [...sectionBlock.matchAll(/key:\s*"([^"]+)" as const/g)].map(
    (keyMatch) => keyMatch[1],
  );
}

function systemSettingsPageIds(): string[] {
  const match = settingsCenterSource.match(
    /const SYSTEM_SETTINGS_PAGE_IDS = \[([\s\S]*?)\] as const;/,
  );
  const pageBlock = match?.[1] ?? "";
  return [...pageBlock.matchAll(/"([^"]+)"/g)].map((pageMatch) => pageMatch[1]);
}
