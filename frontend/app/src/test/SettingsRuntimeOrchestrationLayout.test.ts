/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime and orchestration settings layouts", () => {
  it("uses shared form layout, card, and grid primitives", () => {
    const runtime = readFileSync(
      "src/features/settings/RuntimeSettingsSections.tsx",
      "utf8",
    );
    const orchestration = readFileSync(
      "src/features/settings/OrchestrationSettingsSection.tsx",
      "utf8",
    );

    expect(runtime).toContain("at-settings-form-layout at-agent-runtime-form");
    expect(runtime).toContain("at-settings-form-card-layout");
    expect(orchestration).toContain(
      'className="at-settings-form at-orchestration-preset-form"',
    );
    expect(orchestration).toContain("<SettingsFormLayout>");
    expect(orchestration).toContain("<SettingsFormCard>");
    expect(orchestration).toContain("<SettingsFormGrid>");
    expect(orchestration).not.toContain("at-orchestration-preset-properties");
    expect(orchestration).not.toContain("at-orchestration-preset-metadata");
  });

  it("uses contextual field types and progressively discloses raw graph JSON", () => {
    const orchestration = readFileSync(
      "src/features/settings/OrchestrationSettingsSection.tsx",
      "utf8",
    );

    expect(orchestration).toMatch(
      /name="description"[\s\S]*?<Input\.TextArea/,
    );
    expect(orchestration).toMatch(
      /name="role_ids"[\s\S]*?<Select[\s\S]*?mode="multiple"/,
    );
    expect(orchestration).not.toContain("<Checkbox.Group");
    expect(orchestration).toContain(
      '<details className="at-settings-advanced-disclosure">',
    );
  });
});
