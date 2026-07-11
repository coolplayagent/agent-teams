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
      "at-settings-form-layout at-orchestration-preset-form",
    );
    expect(orchestration).toContain("at-settings-form-grid-layout");
    expect(orchestration).not.toContain("at-orchestration-preset-properties");
    expect(orchestration).toContain("at-orchestration-preset-metadata");
  });
});
