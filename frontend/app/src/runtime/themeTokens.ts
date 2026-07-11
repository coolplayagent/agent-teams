import type { AppearanceSettings } from "./appearance";
import { resolveAppearanceColors } from "./appearance";
import type { ResolvedThemeMode } from "./themeMode";

interface SemanticThemePalette {
  base: string;
  border: string;
  borderStrong: string;
  danger: string;
  elevated: string;
  hover: string;
  muted: string;
  primary: string;
  selected: string;
  success: string;
  surface: string;
  text: string;
  textMuted: string;
  warning: string;
}

const lightPalette: SemanticThemePalette = {
  base: "#f6f6f3",
  border: "#d8d8d0",
  borderStrong: "#c2c2b8",
  danger: "#b42318",
  elevated: "#ffffff",
  hover: "#f1f1ec",
  muted: "#f1f1ec",
  primary: "#2f6f5e",
  selected: "#e7e8e1",
  success: "#257a4f",
  surface: "#ffffff",
  text: "#20231f",
  textMuted: "#62665f",
  warning: "#a16207",
};

const darkPalette: SemanticThemePalette = {
  base: "#151613",
  border: "#373a32",
  borderStrong: "#474b41",
  danger: "#f97066",
  elevated: "#242621",
  hover: "#2d3029",
  muted: "#282b25",
  primary: "#6fa38e",
  selected: "#34382f",
  success: "#7ebf95",
  surface: "#20221e",
  text: "#f1f2ed",
  textMuted: "#b4b8ad",
  warning: "#d99a2b",
};

export function antSemanticTokens(
  resolvedThemeMode: ResolvedThemeMode,
  appearance: AppearanceSettings,
) {
  const palette = resolvedThemeMode === "dark" ? darkPalette : lightPalette;
  const customColors = resolveAppearanceColors(appearance, resolvedThemeMode);
  const background = customColors.background || palette.base;
  const surface = customColors.background || palette.surface;
  const text = customColors.foreground || palette.text;
  const primary = appearance.accent.trim() || palette.primary;

  return {
    colorBgBase: background,
    colorBgContainer: surface,
    colorBgElevated: customColors.background || palette.elevated,
    colorBgLayout: background,
    colorBorder: palette.border,
    colorBorderSecondary: palette.border,
    colorError: palette.danger,
    colorFill: palette.selected,
    colorFillSecondary: palette.muted,
    colorFillTertiary: palette.hover,
    colorPrimary: primary,
    colorSuccess: palette.success,
    colorText: text,
    colorTextDisabled: palette.textMuted,
    colorTextSecondary: palette.textMuted,
    colorTextTertiary: palette.textMuted,
    colorWarning: palette.warning,
    controlItemBgActive: palette.selected,
    controlItemBgHover: palette.hover,
  };
}
