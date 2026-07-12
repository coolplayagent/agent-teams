/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(
  "src/features/shell/SettingsDrawer.tsx",
  "utf8",
);
const skillsSource = readFileSync("src/features/skills/SkillsView.tsx", "utf8");
const boardsSource = readFileSync(
  "src/features/boards/BoardTodosView.tsx",
  "utf8",
);
const settingsCss = readFileSync(
  "src/features/shell/SettingsModal.css",
  "utf8",
);
const skillsCss = readFileSync(
  "src/features/skills/SkillsModals.css",
  "utf8",
);
const boardsCss = readFileSync(
  "src/features/boards/BoardModals.css",
  "utf8",
);
const boardLayoutCss = readFileSync(
  "src/features/boards/BoardLayout.css",
  "utf8",
);

describe("independent modal surfaces", () => {
  it("opens settings as a centered, non-mask-closable modal", () => {
    expect(settingsSource).toContain("<Modal");
    expect(settingsSource).toContain("centered");
    expect(settingsSource).toContain("maskClosable={false}");
    expect(settingsSource).toContain("onCancel={onClose}");
    expect(settingsSource).not.toContain("<Drawer");
    expect(settingsCss).toContain("height: min(860px, calc(100dvh - 48px));");
    expect(settingsCss).toContain("overflow: hidden;");
  });

  it("opens skill work and detail surfaces as responsive scrolling modals", () => {
    expect(skillsSource).toContain("<SkillInstallModal");
    expect(skillsSource).toContain("<ClawHubSettingsModal");
    expect(skillsSource).toContain("<SkillDetailModal");
    expect(skillsSource).not.toContain("<Drawer");
    expect(skillsCss).toContain("max-height: min(720px, calc(100dvh - 160px));");
    expect(skillsCss).toContain("overflow-y: auto;");
  });

  it("opens board source and workflow surfaces as responsive scrolling modals", () => {
    expect(boardsSource).toContain("<BoardSourceSettingsModal");
    expect(boardsSource).toContain("<BoardHandoffModal");
    expect(boardsSource).toContain("<BoardRequestChangesModal");
    expect(boardsSource).not.toContain("<Drawer");
    expect(boardsCss).toContain("max-height: min(720px, calc(100dvh - 160px));");
    expect(boardsCss).toContain("overflow-y: auto;");
    expect(boardLayoutCss).toContain(".at-board-view .at-board-title {");
    expect(boardLayoutCss).toContain(".at-board-view .at-board-title h3 {");
    expect(boardLayoutCss).toContain("max-width: none;");
    expect(boardLayoutCss).toContain("text-overflow: clip;");
  });
});
