/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formCss = readFileSync(
  "src/features/settings/SettingsFormLayout.css",
  "utf8",
);
const catalogCss = readFileSync(
  "src/features/settings/ModelCatalogPicker.css",
  "utf8",
);

describe("settings editor width contract", () => {
  it("keeps orchestration details stronger than the shared capped detail rule", () => {
    expect(formCss).toMatch(
      /\.at-settings-detail-page\.at-orchestration-preset-detail[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/,
    );
    expect(formCss).toMatch(
      /\.at-orchestration-preset-form > \.at-settings-form-layout[\s\S]*?max-width:\s*none;/,
    );
  });

  it("lets the model catalog use the available settings width", () => {
    expect(catalogCss).toMatch(
      /\.at-model-profile-detail \.at-model-catalog-panel\s*{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/,
    );
  });
});
