import { useEffect } from "react";

import { AppShell } from "../features/shell/AppShell";
import { useUiStore } from "../runtime/uiStore";
import { markBootstrapReady } from "./bootstrapState";

export function AgentTeamsApp() {
  const language = useUiStore((state) => state.language);

  useEffect(() => {
    markBootstrapReady();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
  }, [language]);

  return <AppShell />;
}
