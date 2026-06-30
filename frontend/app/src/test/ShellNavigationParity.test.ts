/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { translate, type TranslationKey } from "../i18n";

const appShellSource = readFileSync("src/features/shell/AppShell.tsx", "utf8");

describe("shell navigation parity", () => {
  it("keeps the V1 primary sidebar order and labels", () => {
    expect(shellSidebarItems()).toEqual([
      { key: "search", label: "Search", shortcut: "Ctrl+K" },
      { key: "skills", label: "Skills" },
      { key: "automation", label: "Automation" },
      { key: "connectors", label: "Connectors" },
      { key: "board", label: "Board" },
      { key: "memory", label: "Memory" },
    ]);
  });

  it("keeps chat, observability, settings, and export out of the sidebar", () => {
    const sidebarBlock = sidebarNavigationBlock();

    for (const key of ["chat", "observability", "settings", "export"]) {
      expect(sidebarBlock).not.toContain(`key: "${key}"`);
    }
    for (const labelKey of [
      "appChat",
      "appObservability",
      "appSettings",
      "exportMessages",
    ]) {
      expect(sidebarBlock).not.toContain(`t("${labelKey}")`);
    }
  });

  it("keeps observability, message export, settings, and theme as top bar controls", () => {
    const topbarBlock = topbarControlsBlock();

    expect(topbarBlock).toContain('aria-label={t("appObservability")}');
    expect(topbarBlock).toContain("<MessageExportMenu");
    expect(topbarBlock).toContain('aria-label={t("appSettings")}');
    expect(topbarBlock).toContain('aria-label={t("appToggleTheme")}');
  });
});

interface ShellNavItem {
  key: string;
  label: string;
  shortcut?: string;
}

function shellSidebarItems(): ShellNavItem[] {
  return sidebarNavigationEntryBlocks().map((entryBlock) => {
    const key = requiredMatch(entryBlock, /key:\s*"([^"]+)"/);
    const labelKey = requiredMatch(entryBlock, /label:\s*t\("([^"]+)"\)/);
    const shortcut = entryBlock.match(/shortcut:\s*"([^"]+)"/)?.[1];
    return {
      key,
      label: translate("en", labelKey as TranslationKey),
      ...(shortcut === undefined ? {} : { shortcut }),
    };
  });
}

function sidebarNavigationEntryBlocks(): string[] {
  return [...sidebarNavigationBlock().matchAll(/\{\s*active:[\s\S]*?\n\s*\}/g)]
    .map((match) => match[0]);
}

function sidebarNavigationBlock(): string {
  const match = appShellSource.match(
    /const sidebarNavigationItems = useMemo<SidebarNavigationItem\[\]>\(\s*\(\) => \[([\s\S]*?)\],\s*\[activeView, openPrimaryShellView, settingsOpen, t\],\s*\);/,
  );
  return match?.[1] ?? "";
}

function topbarControlsBlock(): string {
  const match = appShellSource.match(
    /<Space size=\{8\} className="at-topbar-right">([\s\S]*?)<\/Space>/,
  );
  return match?.[1] ?? "";
}

function requiredMatch(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  if (match?.[1] === undefined) {
    throw new Error(`Expected source to match ${pattern}`);
  }
  return match[1];
}
