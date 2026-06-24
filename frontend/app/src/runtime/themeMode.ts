import type { ThemeMode } from "./uiStore";

export type ResolvedThemeMode = "light" | "dark";

export function currentSystemThemeMode(): ResolvedThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  if (themeMode === "system") {
    return currentSystemThemeMode();
  }
  return themeMode;
}
