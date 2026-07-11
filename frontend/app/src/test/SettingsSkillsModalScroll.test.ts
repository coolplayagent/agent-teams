/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(
  "src/features/shell/SettingsDrawer.tsx",
  "utf8",
);
const settingsCss = readFileSync(
  "src/features/shell/SettingsModal.css",
  "utf8",
);
const skillsSource = readFileSync("src/features/skills/SkillsView.tsx", "utf8");
const skillsCss = readFileSync(
  "src/features/skills/SkillsModals.css",
  "utf8",
);

describe("settings and skills modal scroll ownership", () => {
  it("makes the settings modal body the only vertical scroll owner", () => {
    expect(settingsSource).toContain('classNames={{ body: "at-scroll-region" }}');
    expect(settingsCss).toMatch(
      /\.at-settings-modal \.ant-modal-body\s*{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(settingsCss).toMatch(
      /\.at-settings-modal \.at-settings-content,[\s\S]*?\.at-settings-modal \.at-settings-section-body\s*{[\s\S]*?overflow:\s*visible;/,
    );
  });

  it("lets long skill markdown participate in the modal body scroll", () => {
    expect(skillsSource.match(/classNames=\{\{ body: "at-scroll-region" \}\}/g))
      .toHaveLength(3);
    expect(skillsCss).toMatch(
      /\.at-skills-detail-modal \.at-skills-detail-markdown\s*{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/,
    );
  });
});
