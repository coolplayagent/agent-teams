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

  it("persists a cursor choice from its visible row without moving the modal scroll owner", async () => {
    const changed = vi.fn();
    window.addEventListener(appearanceChangedEvent, changed);
    const { container } = renderAppearance();
    const scrollContainer = container.querySelector<HTMLElement>(".ant-modal-body");
    const controlRow = screen.getByText("Use pointer cursor").closest("label");
    expect(scrollContainer).not.toBeNull();
    expect(controlRow).not.toBeNull();
    if (scrollContainer === null || controlRow === null) {
      return;
    }
    scrollContainer.scrollTop = 72;

    fireEvent.click(controlRow);

    await waitFor(() =>
      expect(document.documentElement.dataset.pointerCursor).toBe("true"),
    );
    expect(scrollContainer.scrollTop).toBe(72);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}"))
      .toMatchObject({ pointerCursor: true });
    window.removeEventListener(appearanceChangedEvent, changed);
  });

  it("persists both diagnostic-detail states used by failed-run rendering", async () => {
    renderAppearance();

    const controlRow = screen.getByText("Show diagnostic details").closest("label");
    expect(controlRow).not.toBeNull();
    if (controlRow === null) {
      return;
    }

    fireEvent.click(controlRow);

    await waitFor(() =>
      expect(document.documentElement.dataset.diagnosticsVisible).toBe("true"),
    );
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}"))
      .toMatchObject({ showDiagnostics: true });

    fireEvent.click(controlRow);

    await waitFor(() =>
      expect(document.documentElement.dataset.diagnosticsVisible).toBeUndefined(),
    );
    expect(JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}"))
      .toMatchObject({ showDiagnostics: false });
  });

  it("opens the absolutely positioned preset menu without scheduling scroll repairs", () => {
    const animationFrame = vi.spyOn(window, "requestAnimationFrame");
    const timeout = vi.spyOn(window, "setTimeout");
    const { container } = renderAppearance();
    animationFrame.mockClear();
    timeout.mockClear();
    const settingsBody = container.querySelector<HTMLElement>(
      ".at-settings-section-body",
    );
    expect(settingsBody).not.toBeNull();
    if (settingsBody === null) {
      return;
    }
    settingsBody.scrollTop = 72;

    fireEvent.click(screen.getByRole("button", { name: "Theme preset" }));

    expect(screen.getByRole("listbox")).toBeVisible();
    expect(settingsBody.scrollTop).toBe(72);
    expect(animationFrame).not.toHaveBeenCalled();
    expect(timeout.mock.calls.map(([, delay]) => delay)).not.toContain(0);
    expect(timeout.mock.calls.map(([, delay]) => delay)).not.toContain(80);
    animationFrame.mockRestore();
    timeout.mockRestore();
  });
});

function renderAppearance() {
  window.localStorage.setItem(
    appearanceStorageKey,
    JSON.stringify(defaultAppearanceSettings),
  );
  return render(
    <div className="ant-modal-body" style={{ height: 120, overflow: "auto" }}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <SettingsAppearanceSection setThemeMode={vi.fn()} themeMode="light" />
        </AntApp>
      </ConfigProvider>
    </div>,
  );
}
