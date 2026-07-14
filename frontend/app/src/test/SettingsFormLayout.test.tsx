/// <reference types="node" />

import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SettingsFormActions,
  SettingsFormCard,
  SettingsFormGrid,
  SettingsFormLayout,
  SettingsSection,
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

    expect(
      screen.getByText("Field").closest(".at-settings-form-grid-layout"),
    ).toHaveClass("example-grid");
    expect(
      screen.getByRole("button", { name: "Save" }).parentElement,
    ).toHaveClass("at-settings-form-actions-layout", "example-actions");
    expect(
      screen.getByText("Field").closest(".at-settings-form-layout"),
    ).toHaveClass("example-layout");
  });

  it("uses a two-column desktop grid and one-column narrow grid", () => {
    expect(css).toMatch(
      /\.at-settings-form-grid-layout\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.at-settings-form-grid-layout\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });

  it("removes the nested header and scroll owner for embedded settings", () => {
    render(
      <SettingsSection embedded title="Nested title">
        <span>Embedded content</span>
      </SettingsSection>,
    );

    expect(
      screen.queryByRole("heading", { name: "Nested title" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Embedded content").closest(".at-settings-section"),
    ).toHaveClass("is-embedded");
    expect(css).toMatch(
      /\.at-settings-section\.is-embedded\s*>\s*\.at-settings-section-body\s*{[\s\S]*?overflow:\s*visible;[\s\S]*?padding:\s*0;/,
    );
  });

  it("gives GitHub equal-width responsive token and webhook columns", () => {
    expect(css).toMatch(
      /\.at-settings-github-section \.at-settings-form-layout\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.at-settings-github-section \.at-settings-form-layout\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });
});
