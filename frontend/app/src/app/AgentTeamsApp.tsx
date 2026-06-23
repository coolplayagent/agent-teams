import { useEffect } from "react";

import { AppShell } from "../features/shell/AppShell";
import { useUiStore } from "../runtime/uiStore";

export function AgentTeamsApp() {
  const themeMode = useUiStore((state) => state.themeMode);
  const language = useUiStore((state) => state.language);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
  }, [language, themeMode]);

  return <AppShell />;
}
