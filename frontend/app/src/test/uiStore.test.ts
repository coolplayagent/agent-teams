import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("uiStore", () => {
  it("uses the V1-sized desktop sidebar default", async () => {
    const { sidebarWidthDefault, useUiStore } = await import("../runtime/uiStore");

    expect(sidebarWidthDefault).toBe(220);
    expect(useUiStore.getState().sidebarWidth).toBe(sidebarWidthDefault);
  });

  it("migrates the old oversized default while preserving resized widths", async () => {
    window.localStorage.setItem("agentTeams.sidebarWidth", "280");

    const oldDefaultStore = await import("../runtime/uiStore");

    expect(oldDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(oldDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.setItem("agentTeams.sidebarWidth", "296");

    const resizedStore = await import("../runtime/uiStore");

    expect(resizedStore.useUiStore.getState().sidebarWidth).toBe(296);
  });
});
