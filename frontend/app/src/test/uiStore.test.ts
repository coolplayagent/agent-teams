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

  it("keeps the V1 dark theme default when no new preference exists", async () => {
    const { useUiStore } = await import("../runtime/uiStore");

    expect(useUiStore.getState().themeMode).toBe("dark");
  });

  it("migrates the V1 theme preference when the new theme key is absent", async () => {
    window.localStorage.setItem("agent_teams_theme", "light");

    const { useUiStore } = await import("../runtime/uiStore");

    expect(useUiStore.getState().themeMode).toBe("light");
  });

  it("prefers the new theme key over the legacy V1 preference", async () => {
    window.localStorage.setItem("agent_teams_theme", "dark");
    window.localStorage.setItem("agentTeams.themeMode", "light");

    const { useUiStore } = await import("../runtime/uiStore");

    expect(useUiStore.getState().themeMode).toBe("light");
  });

  it("syncs React theme changes back to the V1 theme key", async () => {
    const { legacyThemeStorageKey, themeModeStorageKey, useUiStore } =
      await import("../runtime/uiStore");

    useUiStore.getState().setThemeMode("light");

    expect(window.localStorage.getItem(themeModeStorageKey)).toBe("light");
    expect(window.localStorage.getItem(legacyThemeStorageKey)).toBe("light");

    useUiStore.getState().setThemeMode("dark");

    expect(window.localStorage.getItem(themeModeStorageKey)).toBe("dark");
    expect(window.localStorage.getItem(legacyThemeStorageKey)).toBe("dark");
  });

  it("migrates old generated defaults while preserving resized widths", async () => {
    window.localStorage.setItem("agentTeams.sidebarWidth", "220");

    const compactDefaultStore = await import("../runtime/uiStore");

    expect(compactDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(compactDefaultStore.sidebarWidthDefault);
    expect(
      window.localStorage.getItem(compactDefaultStore.sidebarWidthStorageKey),
    ).toBe(String(compactDefaultStore.sidebarWidthDefault));

    vi.resetModules();
    window.localStorage.removeItem(
      compactDefaultStore.sidebarWidthMigrationStorageKey,
    );
    window.localStorage.setItem("agentTeams.sidebarWidth", "248");

    const oldCompactDefaultStore = await import("../runtime/uiStore");

    expect(oldCompactDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(oldCompactDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.removeItem(
      oldCompactDefaultStore.sidebarWidthMigrationStorageKey,
    );
    window.localStorage.setItem("agentTeams.sidebarWidth", "260");

    const compactGeneratedDefaultStore = await import("../runtime/uiStore");

    expect(compactGeneratedDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(compactGeneratedDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.removeItem(
      compactGeneratedDefaultStore.sidebarWidthMigrationStorageKey,
    );
    window.localStorage.setItem("agentTeams.sidebarWidth", "280");

    const wideGeneratedDefaultStore = await import("../runtime/uiStore");

    expect(wideGeneratedDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(wideGeneratedDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.removeItem(
      wideGeneratedDefaultStore.sidebarWidthMigrationStorageKey,
    );
    window.localStorage.setItem("agentTeams.sidebarWidth", "274");

    const wideDefaultStore = await import("../runtime/uiStore");

    expect(wideDefaultStore.useUiStore.getState().sidebarWidth)
      .toBe(wideDefaultStore.sidebarWidthDefault);

    vi.resetModules();
    window.localStorage.setItem("agentTeams.sidebarWidth", "296");

    const resizedStore = await import("../runtime/uiStore");

    expect(resizedStore.useUiStore.getState().sidebarWidth).toBe(296);
  });

  it("preserves user-selected legacy-sized sidebar widths after migration", async () => {
    const {
      sidebarWidthMigrationStorageKey,
      sidebarWidthStorageKey,
      useUiStore,
    } = await import("../runtime/uiStore");

    useUiStore.getState().setSidebarWidth(220);

    expect(window.localStorage.getItem(sidebarWidthStorageKey)).toBe("220");
    expect(window.localStorage.getItem(sidebarWidthMigrationStorageKey)).toBe("true");

    vi.resetModules();

    const reloadedStore = await import("../runtime/uiStore");

    expect(reloadedStore.useUiStore.getState().sidebarWidth).toBe(220);
  });

  it("preserves previously resized compact sidebars from the 260px migration", async () => {
    window.localStorage.setItem("agentTeams.sidebarWidth", "220");
    window.localStorage.setItem("agentTeams.sidebarWidthMigratedTo260", "true");

    const { useUiStore } = await import("../runtime/uiStore");

    expect(useUiStore.getState().sidebarWidth).toBe(220);
  });
});
