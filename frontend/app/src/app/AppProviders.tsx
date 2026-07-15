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
import { applyDocumentThemeMode } from "../runtime/themeMode";
import { antSemanticTokens } from "../runtime/themeTokens";
import { useUiStore } from "../runtime/uiStore";
import { useResolvedThemeMode } from "../runtime/useResolvedThemeMode";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 5000,
    },
  },
});

const antButtonConfig = { autoInsertSpace: false } as const;

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const [appearanceSettings, setAppearanceSettings] = useState(readAppearanceSettings);
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
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
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      setSystemPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  const motionEnabled =
    appearanceSettings.motion === "full" ||
    (appearanceSettings.motion === "system" && !systemPrefersReducedMotion);

  const semanticAppearance = useMemo(
    () => ({
      accent: appearanceSettings.accent,
      background: appearanceSettings.background,
      foreground: appearanceSettings.foreground,
    }),
    [
      appearanceSettings.accent,
      appearanceSettings.background,
      appearanceSettings.foreground,
    ],
  );

  const tokens = useMemo(
    () => ({
      ...antSemanticTokens(resolvedThemeMode, semanticAppearance),
      borderRadius: 8,
      fontFamily:
        appearanceSettings.uiFont.trim()
        || '"Aptos", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif',
      motion: motionEnabled,
    }),
    [appearanceSettings.uiFont, motionEnabled, resolvedThemeMode, semanticAppearance],
  );

  const antTheme = useMemo(
    () => ({
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
    }),
    [algorithm, tokens],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        button={antButtonConfig}
        theme={antTheme}
      >
        <XProvider>
          <AntApp>{children}</AntApp>
        </XProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
