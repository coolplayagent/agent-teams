import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const configProviderMotion = vi.hoisted(() => vi.fn<(enabled: boolean) => void>());

vi.mock("antd", () => ({
  App: ({ children }: { children: ReactNode }) => children,
  ConfigProvider: ({
    children,
    theme: themeConfig,
  }: {
    children: ReactNode;
    theme: { token: { motion: boolean } };
  }) => {
    configProviderMotion(themeConfig.token.motion);
    return children;
  },
  theme: {
    darkAlgorithm: "dark",
    defaultAlgorithm: "light",
  },
}));

vi.mock("@ant-design/x", () => ({
  XProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AppProviders } from "../app/AppProviders";
import { appearanceStorageKey } from "../runtime/appearance";

describe("AppProviders motion", () => {
  afterEach(() => {
    window.localStorage.clear();
    configProviderMotion.mockClear();
    vi.mocked(window.matchMedia).mockImplementation(defaultMatchMedia);
  });

  it("disables Ant motion when appearance explicitly reduces motion", async () => {
    setAppearanceMotion("reduce");

    render(<AppProviders>content</AppProviders>);

    await waitFor(() => expect(configProviderMotion).toHaveBeenLastCalledWith(false));
  });

  it("follows the system reduced-motion preference in system mode", async () => {
    setAppearanceMotion("system");
    vi.mocked(window.matchMedia).mockImplementation((query) =>
      mediaQueryList(query, query === "(prefers-reduced-motion: reduce)"),
    );

    render(<AppProviders>content</AppProviders>);

    await waitFor(() => expect(configProviderMotion).toHaveBeenLastCalledWith(false));
  });

  it("allows explicit full motion even when the system preference is reduced", async () => {
    setAppearanceMotion("full");
    vi.mocked(window.matchMedia).mockImplementation((query) =>
      mediaQueryList(query, query === "(prefers-reduced-motion: reduce)"),
    );

    render(<AppProviders>content</AppProviders>);

    await waitFor(() => expect(configProviderMotion).toHaveBeenLastCalledWith(true));
  });
});

function setAppearanceMotion(motion: "full" | "reduce" | "system") {
  window.localStorage.setItem(appearanceStorageKey, JSON.stringify({ motion }));
}

function defaultMatchMedia(query: string): MediaQueryList {
  return mediaQueryList(query, false);
}

function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };
}
