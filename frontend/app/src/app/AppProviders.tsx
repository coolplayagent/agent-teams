import { App as AntApp, ConfigProvider, theme } from "antd";
import { XProvider } from "@ant-design/x";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  appearanceChangedEvent,
  applyAppearanceSettings,
  readAppearanceSettings,
} from "../runtime/appearance";
import { currentSystemThemeMode, resolveThemeMode } from "../runtime/themeMode";
import { useUiStore } from "../runtime/uiStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 5000,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const [appearanceSettings, setAppearanceSettings] = useState(readAppearanceSettings);
  const [systemThemeMode, setSystemThemeMode] = useState(currentSystemThemeMode);
  const resolvedThemeMode = themeMode === "system" ? systemThemeMode : resolveThemeMode(themeMode);
  const algorithm = resolvedThemeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);

  useEffect(() => {
    const syncAppearance = () => setAppearanceSettings(readAppearanceSettings());
    window.addEventListener(appearanceChangedEvent, syncAppearance);
    window.addEventListener("storage", syncAppearance);
    return () => {
      window.removeEventListener(appearanceChangedEvent, syncAppearance);
      window.removeEventListener("storage", syncAppearance);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemThemeMode = () =>
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", updateSystemThemeMode);
    return () => mediaQuery.removeEventListener("change", updateSystemThemeMode);
  }, []);

  const tokens = useMemo(
    () => ({
      borderRadius: 8,
      colorPrimary: appearanceSettings.accent.trim() || "#2f6f5e",
      fontFamily:
        appearanceSettings.uiFont.trim()
        || '"Aptos", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif',
    }),
    [appearanceSettings.accent, appearanceSettings.uiFont],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        button={{ autoInsertSpace: false }}
        theme={{
          algorithm,
          token: tokens,
          components: {
            Layout: {
              bodyBg: "var(--at-bg)",
              headerBg: "var(--at-topbar)",
              siderBg: "var(--at-sidebar)",
            },
            Button: {
              borderRadius: 8,
              controlHeight: 32,
            },
            Card: {
              borderRadiusLG: 8,
            },
          },
        }}
      >
        <XProvider>
          <AntApp>{children}</AntApp>
        </XProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
