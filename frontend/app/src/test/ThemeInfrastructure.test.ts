import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAppearanceSettings,
  defaultAppearanceSettings,
  resolveAppearanceColors,
} from "../runtime/appearance";
import { applyDocumentThemeMode, oppositeThemeMode } from "../runtime/themeMode";
import { antSemanticTokens } from "../runtime/themeTokens";

const themeCss = readFileSync("src/styles/theme.css", "utf8");

describe("theme infrastructure", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.removeAttribute("style");
  });

  it("applies the resolved mode before component styling", () => {
    applyDocumentThemeMode("system", "light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeMode).toBe("system");
  });

  it("toggles from the resolved system appearance instead of the stored system label", () => {
    expect(oppositeThemeMode("dark")).toBe("light");
    expect(oppositeThemeMode("light")).toBe("dark");
  });

  it("does not carry a dark appearance background into light mode", () => {
    const darkAppearance = {
      ...defaultAppearanceSettings,
      background: "#181818",
      foreground: "#FFFFFF",
    };

    expect(resolveAppearanceColors(darkAppearance, "dark")).toEqual({
      background: "#181818",
      foreground: "#FFFFFF",
    });
    expect(resolveAppearanceColors(darkAppearance, "light")).toEqual({
      background: "",
      foreground: "",
    });

    applyAppearanceSettings(darkAppearance, "dark");
    expect(document.documentElement.style.getPropertyValue("--at-bg")).toBe("#181818");
    applyAppearanceSettings(darkAppearance, "light");
    expect(document.documentElement.style.getPropertyValue("--at-bg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--at-text")).toBe("");
  });

  it("maps Ant controls onto the same semantic palette", () => {
    const tokens = antSemanticTokens("light", defaultAppearanceSettings);

    expect(tokens.colorBgLayout).toBe("#f6f6f3");
    expect(tokens.colorBgContainer).toBe("#ffffff");
    expect(tokens.colorText).toBe("#20231f");
    expect(tokens.controlItemBgActive).toBe("#e7e8e1");
  });

  it("declares semantic surface, control, text, code, and feedback tokens", () => {
    for (const token of [
      "--at-surface-base",
      "--at-surface-elevated",
      "--at-surface-hover",
      "--at-surface-selected",
      "--at-control-bg",
      "--at-control-text-disabled",
      "--at-text-subtle",
      "--at-text-secondary",
      "--at-muted",
      "--at-font",
      "--at-code-text",
      "--at-danger",
    ]) {
      expect(themeCss).toContain(token);
    }
  });
});
