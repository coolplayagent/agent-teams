/// <reference types="node" />

import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SettingsFormActions,
  SettingsFormCard,
  SettingsFormGrid,
  SettingsFormLayout,
} from "../features/settings/SettingsShared";

const css = readFileSync(
  "src/features/settings/SettingsFormLayout.css",
  "utf8",
);

describe("settings form layout primitives", () => {
  it("composes focused layout classes without dropping caller classes", () => {
    render(
      <SettingsFormLayout className="example-layout">
        <SettingsFormCard className="example-card">
          <SettingsFormGrid className="example-grid">
            <span>Field</span>
          </SettingsFormGrid>
          <SettingsFormActions className="example-actions">
            <button type="button">Save</button>
          </SettingsFormActions>
        </SettingsFormCard>
      </SettingsFormLayout>,
    );

    expect(screen.getByText("Field").closest(".at-settings-form-grid-layout"))
      .toHaveClass("example-grid");
    expect(screen.getByRole("button", { name: "Save" }).parentElement)
      .toHaveClass("at-settings-form-actions-layout", "example-actions");
    expect(screen.getByText("Field").closest(".at-settings-form-layout"))
      .toHaveClass("example-layout");
  });

  it("uses a two-column desktop grid and one-column narrow grid", () => {
    expect(css).toMatch(
      /\.at-settings-form-grid-layout\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.at-settings-form-grid-layout\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });
});
