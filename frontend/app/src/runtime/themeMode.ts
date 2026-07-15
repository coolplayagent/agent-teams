import type { ThemeMode } from "./uiStore";

export type ResolvedThemeMode = "light" | "dark";

export function applyDocumentThemeMode(
  themeMode: ThemeMode,
  resolvedThemeMode: ResolvedThemeMode,
): void {
  document.documentElement.dataset.theme = resolvedThemeMode;
  document.documentElement.dataset.themeMode = themeMode;
}

export function currentSystemThemeMode(): ResolvedThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  if (themeMode === "system") {
    return currentSystemThemeMode();
  }
  return themeMode;
}

export function oppositeThemeMode(
  resolvedThemeMode: ResolvedThemeMode,
): ResolvedThemeMode {
  return resolvedThemeMode === "dark" ? "light" : "dark";
}
