import { useEffect, useState } from "react";

import { AppShell } from "../features/shell/AppShell";
import { currentSystemThemeMode, resolveThemeMode } from "../runtime/themeMode";
import { useUiStore } from "../runtime/uiStore";

export function AgentTeamsApp() {
  const themeMode = useUiStore((state) => state.themeMode);
  const language = useUiStore((state) => state.language);
  const [systemThemeMode, setSystemThemeMode] = useState(currentSystemThemeMode);
  const resolvedThemeMode = themeMode === "system" ? systemThemeMode : resolveThemeMode(themeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeMode;
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
  }, [language, resolvedThemeMode, themeMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemThemeMode = () =>
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", updateSystemThemeMode);
    return () => mediaQuery.removeEventListener("change", updateSystemThemeMode);
  }, []);

  return <AppShell />;
}
