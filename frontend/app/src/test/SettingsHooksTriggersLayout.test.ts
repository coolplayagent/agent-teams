/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hook and trigger settings layouts", () => {
  it("uses shared form layout primitives instead of legacy card classes", () => {
    for (const file of ["HooksSettingsSection.tsx", "TriggerSettingsSection.tsx"]) {
      const source = readFileSync(`src/features/settings/${file}`, "utf8");
      expect(source).toContain("at-settings-form-layout");
      expect(source).toContain("at-settings-form-card-layout");
      expect(source).not.toMatch(/at-settings-card-list(?:\s|\")/);
      expect(source).not.toMatch(/at-settings-form-card(?:\s|\")/);
    }
  });
});
