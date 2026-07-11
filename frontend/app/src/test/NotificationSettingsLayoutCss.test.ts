/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "src/features/settings/NotificationSettingsSection.css",
  "utf8",
);

describe("notification settings layout", () => {
  it("keeps rule copy and controls compact on desktop", () => {
    expect(css).toMatch(
      /\.at-notification-rule\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(240px, 300px\);/,
    );
    expect(css).toMatch(
      /\.at-notification-rule-toggle\s*{[\s\S]*?justify-content:\s*space-between;/,
    );
    expect(css).toMatch(
      /\.at-notification-rule-channels\s*{[\s\S]*?flex-wrap:\s*wrap;/,
    );
  });

  it("stacks each rule in order on narrow windows", () => {
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.at-notification-rule\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.at-notification-rule-controls\s*{[\s\S]*?border-left:\s*0;/,
    );
  });
});
