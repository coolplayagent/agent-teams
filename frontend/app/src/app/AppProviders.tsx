import { App as AntApp, ConfigProvider, theme } from "antd";
import { XProvider } from "@ant-design/x";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";

import {
  appearanceChangedEvent,
  applyAppearanceSettings,
  readAppearanceSettings,
} from "../runtime/appearance";
import {
  applyDocumentThemeMode,
  currentSystemThemeMode,
  resolveThemeMode,
} from "../runtime/themeMode";
import { antSemanticTokens } from "../runtime/themeTokens";
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
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [systemThemeMode, setSystemThemeMode] = useState(currentSystemThemeMode);
  const resolvedThemeMode = themeMode === "system" ? systemThemeMode : resolveThemeMode(themeMode);
  const algorithm = resolvedThemeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  useLayoutEffect(() => {
    applyDocumentThemeMode(themeMode, resolvedThemeMode);
    applyAppearanceSettings(appearanceSettings, resolvedThemeMode);
  }, [appearanceSettings, resolvedThemeMode, themeMode]);

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      setSystemPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  const motionEnabled =
    appearanceSettings.motion === "full" ||
    (appearanceSettings.motion === "system" && !systemPrefersReducedMotion);

  const tokens = useMemo(
    () => ({
      ...antSemanticTokens(resolvedThemeMode, appearanceSettings),
      borderRadius: 8,
      fontFamily:
        appearanceSettings.uiFont.trim()
        || '"Aptos", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif',
      motion: motionEnabled,
    }),
    [appearanceSettings, motionEnabled, resolvedThemeMode],
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
