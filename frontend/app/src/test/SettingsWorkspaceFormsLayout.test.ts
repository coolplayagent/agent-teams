/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workspace settings form layouts", () => {
  it("uses shared layouts while retaining free text and secret controls", () => {
    const environment = readFileSync(
      "src/features/settings/EnvironmentSettingsSection.tsx",
      "utf8",
    );
    const workspace = readFileSync(
      "src/features/settings/WorkspaceSettingsSection.tsx",
      "utf8",
    );

    expect(environment).toContain("at-settings-form-layout");
    expect(environment).toContain("at-settings-form-card-layout");
    expect(environment).toContain("<Input.Password");
    expect(workspace).toContain("at-settings-form-layout");
    expect(workspace).toContain("at-settings-form-card-layout");
    expect(workspace).toContain("<Input.Password");
    expect(workspace).toContain("<Input.TextArea");
  });
});
