/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/settings/SettingsCenter.tsx", "utf8");
const css = readFileSync(
  "src/features/settings/SettingsModelEditor.css",
  "utf8",
);

describe("model profile editor layout", () => {
  it("does not repeat editable model capabilities below the form", () => {
    expect(source).not.toContain('<details className="at-model-capability-disclosure">');
    expect(source).not.toContain('className="at-model-capability-grid"');
    expect(source).not.toContain('className="at-settings-list at-model-profile-properties"');
  });

  it("uses contextual short and wide field spans", () => {
    expect(source).toContain('className="at-model-field-short"');
    expect(source).toContain('className="at-model-field-wide"');
    expect(css).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(css).toMatch(/\.at-model-field-wide\s*{[\s\S]*?grid-column:\s*span 2;/);
    expect(css).toMatch(/\.at-model-profile-detail \.at-model-profile-form\s*{[\s\S]*?max-width:\s*none;/);
  });
});
