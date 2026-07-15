import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";
import { vi } from "vitest";

configure({ asyncUtilTimeout: 5_000 });

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});
