import { App as AntApp, ConfigProvider, theme } from "antd";
import { XProvider } from "@ant-design/x";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo } from "react";

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
  const algorithm = themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;
  const tokens = useMemo(
    () => ({
      borderRadius: 8,
      colorPrimary: "#2f6f5e",
      fontFamily:
        '"Aptos", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif',
    }),
    [],
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
