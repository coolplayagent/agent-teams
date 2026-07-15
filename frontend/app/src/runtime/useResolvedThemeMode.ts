import { useEffect, useState } from "react";

import { currentSystemThemeMode, resolveThemeMode } from "./themeMode";
import type { ResolvedThemeMode } from "./themeMode";
import type { ThemeMode } from "./uiStore";

export function useResolvedThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  const [systemThemeMode, setSystemThemeMode] = useState(currentSystemThemeMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemThemeMode = () => {
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    };
    updateSystemThemeMode();
    mediaQuery.addEventListener("change", updateSystemThemeMode);
    return () => mediaQuery.removeEventListener("change", updateSystemThemeMode);
  }, []);

  return themeMode === "system" ? systemThemeMode : resolveThemeMode(themeMode);
}
