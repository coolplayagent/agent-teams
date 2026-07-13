import { App as AntApp, ConfigProvider } from "antd";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsAppearanceSection } from "../features/settings/SettingsAppearanceSection";
import {
  appearanceChangedEvent,
  appearanceStorageKey,
  defaultAppearanceSettings,
} from "../runtime/appearance";

describe("appearance settings controls", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-diagnostics-visible");
    document.documentElement.removeAttribute("data-pointer-cursor");
    document.documentElement.removeAttribute("style");
  });

  it("persists a cursor choice once without moving its scroll container", async () => {
    const changed = vi.fn();
    window.addEventListener(appearanceChangedEvent, changed);
    const { container } = renderAppearance();
    const scrollContainer = container.firstElementChild as HTMLElement;
    scrollContainer.scrollTop = 72;

    fireEvent.click(screen.getByRole("switch", { name: "Use pointer cursor" }));

    await waitFor(() =>
      expect(document.documentElement.dataset.pointerCursor).toBe("true"),
    );
    expect(scrollContainer.scrollTop).toBe(72);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}"))
      .toMatchObject({ pointerCursor: true });
    window.removeEventListener(appearanceChangedEvent, changed);
  });

  it("persists the diagnostic-detail choice used by failed-run rendering", async () => {
    renderAppearance();

    fireEvent.click(screen.getByRole("switch", { name: "Show diagnostic details" }));

    await waitFor(() =>
      expect(document.documentElement.dataset.diagnosticsVisible).toBe("true"),
    );
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}"))
      .toMatchObject({ showDiagnostics: true });
  });
});

function renderAppearance() {
  window.localStorage.setItem(
    appearanceStorageKey,
    JSON.stringify(defaultAppearanceSettings),
  );
  return render(
    <div style={{ height: 120, overflow: "auto" }}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <SettingsAppearanceSection setThemeMode={vi.fn()} themeMode="light" />
        </AntApp>
      </ConfigProvider>
    </div>,
  );
}
