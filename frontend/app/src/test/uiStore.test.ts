import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("uiStore", () => {
  it("uses the V1-sized desktop sidebar default", async () => {
    const { sidebarWidthDefault, useUiStore } = await import("../runtime/uiStore");

    expect(sidebarWidthDefault).toBe(280);
    expect(useUiStore.getState().sidebarWidth).toBe(sidebarWidthDefault);
  });

  it("migrates old generated defaults while preserving resized widths", async () => {
    window.localStorage.setItem("agentTeams.sidebarWidth", "220");

    const compactDefaultStore = await import("../runtime/uiStore");

    expect(compactDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(compactDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.setItem("agentTeams.sidebarWidth", "248");

    const narrowDefaultStore = await import("../runtime/uiStore");

    expect(narrowDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(narrowDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.setItem("agentTeams.sidebarWidth", "274");

    const wideDefaultStore = await import("../runtime/uiStore");

    expect(wideDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(wideDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.setItem("agentTeams.sidebarWidth", "296");

    const resizedStore = await import("../runtime/uiStore");

    expect(resizedStore.useUiStore.getState().sidebarWidth).toBe(296);
  });
});
