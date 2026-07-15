/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("network settings form layouts", () => {
  it("uses shared form layout and card primitives", () => {
    for (const file of [
      "ClawHubSettingsSection.tsx",
      "GitHubSettingsSection.tsx",
      "ProxySettingsSection.tsx",
      "SpeechSettingsSection.tsx",
      "WebSettingsSection.tsx",
    ]) {
      const source = readFileSync(`src/features/settings/${file}`, "utf8");
      expect(source).toContain("at-settings-form-layout");
      expect(source).toContain("at-settings-form-card-layout");
      expect(source).not.toMatch(/at-settings-card-list(?:\s|\")/);
      expect(source).not.toMatch(/at-settings-form-card(?:\s|\")/);
    }
  });
});
