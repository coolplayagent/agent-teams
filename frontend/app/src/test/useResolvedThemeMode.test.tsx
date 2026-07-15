import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResolvedThemeMode } from "../runtime/useResolvedThemeMode";

describe("useResolvedThemeMode", () => {
  afterEach(() => {
    vi.mocked(window.matchMedia).mockReset();
  });

  it("updates system mode when the operating-system preference changes", () => {
    const media = mutableMediaQuery(true);
    vi.mocked(window.matchMedia).mockReturnValue(media.query);

    const { result } = renderHook(() => useResolvedThemeMode("system"));
    expect(result.current).toBe("dark");

    act(() => media.setMatches(false));
    expect(result.current).toBe("light");
  });

  it("keeps an explicit mode while still listening safely for later system use", () => {
    const media = mutableMediaQuery(true);
    vi.mocked(window.matchMedia).mockReturnValue(media.query);

    const { result } = renderHook(() => useResolvedThemeMode("light"));
    act(() => media.setMatches(false));

    expect(result.current).toBe("light");
  });
});

function mutableMediaQuery(initialMatches: boolean): {
  query: MediaQueryList;
  setMatches: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<EventListener>();
  const query = {
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.add(listener);
      }
    }),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    removeEventListener: vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.delete(listener);
        }
      },
    ),
    removeListener: vi.fn(),
  } satisfies MediaQueryList;

  return {
    query,
    setMatches: (nextMatches) => {
      matches = nextMatches;
      const event = new Event("change");
      listeners.forEach((listener) => listener(event));
    },
  };
}
