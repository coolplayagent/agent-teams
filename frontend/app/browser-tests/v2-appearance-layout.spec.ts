import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV2Shell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-appearance";
const APPEARANCE_PRESETS = [
  "GitHub",
  "Codex",
  "Notion",
  "One",
  "Proof",
  "Raycast",
  "Rose Pine",
  "Solarized",
  "Vercel",
  "VS Code Plus",
  "Xcode",
  "Tokyo Night",
] as const;
const APPEARANCE_ROW_LABELS = [
  "Accent",
  "Background",
  "Foreground",
  "UI font",
  "Code font",
  "Translucent sidebar",
  "Contrast",
  "Use pointer cursor",
  "Reduce motion",
  "UI font size",
  "Code font size",
  "Line height",
  "Message spacing",
  "Diff markers",
  "Show diagnostic information",
] as const;

test("applies a dark appearance preset while keeping settings framed", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "TS appearance layout",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page.locator(".at-topbar").getByRole("button", { name: "Settings" })
      .click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Appearance" }))
      .toBeVisible();

    const darkTheme = settings.getByRole("button", { name: "Dark" });
    await expect(darkTheme).toHaveAttribute("aria-pressed", "true");
    const presetButton = settings.getByRole("button", { name: "Theme preset" });
    await expect(presetButton).toContainText("Codex");
    await presetButton.click();
    const listbox = settings.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await listbox.getByRole("option", { name: "Rose Pine" }).click();

    await expect(settings.getByRole("listbox")).toHaveCount(0);
    await expect(presetButton).toContainText("Rose Pine");
    await expect.poll(() => appearanceStorage(page)).toMatchObject({
      accent: "#C4A7E7",
      background: "#191724",
      foreground: "#E0DEF4",
      themePreset: "rose-pine",
    });
    await expect.poll(() => appearanceFrameMetrics(page)).toMatchObject({
      accent: "#C4A7E7",
      background: "#191724",
      bodyOverflow: "hidden",
      documentScrollHeight: 720,
      foreground: "#E0DEF4",
      rootTheme: "dark",
      settingsBodyOverflowY: "auto",
    });
    const metrics = await appearanceFrameMetrics(page);
    expect(metrics.settingsBodyScrollHeight).toBeGreaterThan(
      metrics.settingsBodyClientHeight,
    );
    expect(metrics.previewHeights).toHaveLength(3);
    expect(metrics.previewHeights.every((height) => height >= 110)).toBe(true);
    expect(metrics.previewWidths.every((width) => width >= 160)).toBe(true);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "appearance settings should keep shell fixed");
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-appearance-dark-rose-pine.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("captures the light appearance controls and preset menu", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "TS light appearance controls",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page.locator(".at-topbar").getByRole("button", { name: "Settings" })
      .click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Appearance" }))
      .toBeVisible();

    const lightTheme = settings.getByRole("button", { name: "Light" });
    await lightTheme.click();
    await expect(lightTheme).toHaveAttribute("aria-pressed", "true");
    const presetButton = settings.getByRole("button", { name: "Theme preset" });
    await expect(presetButton).toContainText("GitHub");
    await expect(settings.getByText("Light theme")).toBeVisible();
    await expect
      .poll(async () => appearanceRowLabels(settings))
      .toEqual([...APPEARANCE_ROW_LABELS]);

    await expect.poll(() => appearanceStorage(page)).toMatchObject({
      accent: "#0969DA",
      background: "#FFFFFF",
      foreground: "#1F2328",
      themePreset: "github",
    });
    await expect.poll(() => appearanceFrameMetrics(page)).toMatchObject({
      accent: "#0969DA",
      background: "#FFFFFF",
      bodyOverflow: "hidden",
      documentScrollHeight: 720,
      foreground: "#1F2328",
      rootTheme: "light",
      settingsBodyOverflowY: "auto",
    });
    await expectNoDocumentScroll(page, "light appearance settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-appearance-light-github.png", SCREENSHOT_FOLDER),
    });

    await presetButton.click();
    const listbox = settings.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect
      .poll(async () => presetOptionLabels(listbox))
      .toEqual([...APPEARANCE_PRESETS]);
    await expect.poll(() => appearanceMenuMetrics(page)).toMatchObject({
      optionCount: APPEARANCE_PRESETS.length,
      rowCount: APPEARANCE_ROW_LABELS.length,
    });
    const menuMetrics = await appearanceMenuMetrics(page);
    expect(menuMetrics.menuRight).toBeLessThanOrEqual(menuMetrics.dialogRight);
    expect(menuMetrics.menuBottom).toBeLessThanOrEqual(menuMetrics.dialogBottom);
    await expectNoDocumentScroll(page, "appearance preset menu should not move the document");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      path: screenshotPath("v2-appearance-light-preset-menu.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("copies, imports, and resets appearance themes through browser controls", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.localStorage.setItem("agentTeams.testAppearanceClipboard", value);
          },
        },
      });
    });
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "TS appearance import copy reset",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page.locator(".at-topbar").getByRole("button", { name: "Settings" })
      .click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Light" }).click();
    await expect(settings.getByRole("button", { name: "Theme preset" }))
      .toContainText("GitHub");

    await settings.getByRole("button", { name: "Copy theme" }).click();
    await expect
      .poll(async () => copiedAppearanceTheme(page))
      .toMatchObject({
        accent: "#0969DA",
        background: "#FFFFFF",
        foreground: "#1F2328",
        themePreset: "github",
      });

    const importedTheme = {
      accent: "#D946EF",
      background: "#FEF2F2",
      codeFont: "JetBrains Mono, ui-monospace",
      codeFontSize: 13,
      contrast: 58,
      diffMarker: "sign",
      foreground: "#111827",
      lineHeight: 160,
      messageDensity: 70,
      motion: "reduce",
      pointerCursor: true,
      showDiagnostics: true,
      themePreset: "imported-magenta",
      translucentSidebar: true,
      uiFont: "Inter, sans-serif",
      uiFontSize: 15,
    } as const;
    const fileChooserPromise = page.waitForEvent("filechooser");
    await settings.getByRole("button", { name: "Import" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      buffer: Buffer.from(JSON.stringify(importedTheme)),
      mimeType: "application/json",
      name: "imported-magenta-theme.json",
    });

    await expect.poll(() => appearanceStorage(page)).toMatchObject(importedTheme);
    await expect.poll(() => appearanceFrameMetrics(page)).toMatchObject({
      accent: "#D946EF",
      background: "#FEF2F2",
      foreground: "#111827",
    });
    await expect(settings.getByRole("button", { name: "Theme preset" }))
      .toContainText("imported-magenta");
    await expect(settings.getByRole("textbox", { name: "UI font" }))
      .toHaveValue("Inter, sans-serif");
    await expect(settings.getByRole("textbox", { name: "Code font" }))
      .toHaveValue("JetBrains Mono, ui-monospace");
    await expect(settings.getByLabel("Translucent sidebar")).toBeChecked();
    await expect(settings.getByLabel("Use pointer cursor")).toBeChecked();
    await expect(settings.getByLabel("Show diagnostic information")).toBeChecked();

    await page.screenshot({
      path: screenshotPath("v2-appearance-imported-theme.png", SCREENSHOT_FOLDER),
    });
    await settings.getByRole("button", { name: "Reset appearance" }).click();
    await expect.poll(() => appearanceStorage(page)).toEqual({});
    await expect.poll(() => appearanceFrameMetrics(page)).toMatchObject({
      accent: "",
      background: "",
      foreground: "",
    });
    await expect(settings.getByRole("button", { name: "Theme preset" }))
      .toContainText("GitHub");
    await expect(settings.getByLabel("Translucent sidebar")).not.toBeChecked();
    await expect(settings.getByLabel("Use pointer cursor")).not.toBeChecked();
    await expect(settings.getByLabel("Show diagnostic information")).not.toBeChecked();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "appearance import/copy/reset should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-appearance-reset-default.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps the workspace fixed under the narrow sidebar overlay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await page.setViewportSize({ height: 740, width: 390 });
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "TS narrow shell",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect.poll(() =>
      page.evaluate(() => window.matchMedia("(max-width: 760px)").matches),
    ).toBe(true);

    await expect(page.locator(".at-sidebar")).toBeVisible();
    await expect(page.locator(".at-sidebar-scrim")).toBeVisible();
    await expect(page.locator(".at-sidebar-resizer")).toBeHidden();
    await expect.poll(() => shellFrameMetrics(page)).toMatchObject({
      bodyOverflow: "hidden",
      documentClientHeight: 740,
      documentScrollHeight: 740,
      workspaceLeft: 0,
      workspaceWidth: 390,
    });

    const openMetrics = await shellFrameMetrics(page);
    expect(openMetrics.documentScrollWidth).toBeLessThanOrEqual(391);
    expect(openMetrics.sidebarWidth).toBeLessThanOrEqual(346);
    expect(openMetrics.scrimLeft).toBeGreaterThanOrEqual(openMetrics.sidebarWidth);

    await page.getByRole("button", { name: "Close sidebar" }).click();
    await expect(page.locator(".at-sidebar")).toHaveCount(0);
    await expect.poll(() => shellFrameMetrics(page)).toMatchObject({
      documentScrollHeight: 740,
      workspaceLeft: 0,
      workspaceWidth: 390,
    });
    const closedMetrics = await shellFrameMetrics(page);
    expect(closedMetrics.documentScrollWidth).toBeLessThanOrEqual(391);

    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(page.locator(".at-sidebar")).toBeVisible();
    await expect(page.locator(".at-sidebar-scrim")).toBeVisible();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "narrow shell should not scroll document");
    await page.screenshot({
      path: screenshotPath("v2-narrow-sidebar-overlay.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

interface AppearanceFrameMetrics {
  accent: string;
  background: string;
  bodyOverflow: string;
  documentScrollHeight: number;
  foreground: string;
  previewHeights: number[];
  previewWidths: number[];
  rootTheme: string;
  settingsBodyClientHeight: number;
  settingsBodyOverflowY: string;
  settingsBodyScrollHeight: number;
}

interface AppearanceMenuMetrics {
  dialogBottom: number;
  dialogRight: number;
  menuBottom: number;
  menuRight: number;
  optionCount: number;
  rowCount: number;
}

interface ShellFrameMetrics {
  bodyOverflow: string;
  documentClientHeight: number;
  documentScrollHeight: number;
  documentScrollWidth: number;
  scrimLeft: number;
  sidebarWidth: number;
  workspaceLeft: number;
  workspaceWidth: number;
}

interface AppearanceStorage {
  accent?: string;
  background?: string;
  foreground?: string;
  themePreset?: string;
}

async function appearanceRowLabels(settings: Locator): Promise<string[]> {
  return settings.locator(".at-appearance-table-row").evaluateAll((rows) =>
    rows.map((row) =>
      row.querySelector(".at-appearance-row-copy .ant-typography")
        ?.textContent?.trim() ?? "",
    ),
  );
}

async function presetOptionLabels(listbox: Locator): Promise<string[]> {
  return listbox.getByRole("option").evaluateAll((options) =>
    options.map((option) =>
      option.querySelector(".at-appearance-preset-option > span:last-child")
        ?.textContent?.trim() ?? "",
    ),
  );
}

async function appearanceStorage(page: Page): Promise<AppearanceStorage> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("agent_teams_appearance") ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  });
}

async function copiedAppearanceTheme(page: Page): Promise<AppearanceStorage> {
  return page.evaluate(() => {
    const raw =
      window.localStorage.getItem("agentTeams.testAppearanceClipboard") ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  });
}

async function appearanceMenuMetrics(page: Page): Promise<AppearanceMenuMetrics> {
  return page.evaluate(() => {
    const dialog = document.querySelector(".at-settings-drawer");
    const menu = document.querySelector(".at-appearance-preset-menu");
    const rows = document.querySelectorAll(".at-appearance-table-row");
    const options = document.querySelectorAll(".at-appearance-preset-menu-option");
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Settings dialog is missing.");
    }
    if (!(menu instanceof HTMLElement)) {
      throw new Error("Appearance preset menu is missing.");
    }
    const dialogRect = dialog.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      dialogBottom: Math.round(dialogRect.bottom),
      dialogRight: Math.round(dialogRect.right),
      menuBottom: Math.round(menuRect.bottom),
      menuRight: Math.round(menuRect.right),
      optionCount: options.length,
      rowCount: rows.length,
    };
  });
}

async function appearanceFrameMetrics(
  page: Page,
): Promise<AppearanceFrameMetrics> {
  return page.evaluate(() => {
    const settingsBody = document.querySelector(".at-settings-section-body");
    const previews = Array.from(
      document.querySelectorAll(".at-appearance-theme-preview"),
    );
    if (!(settingsBody instanceof HTMLElement)) {
      throw new Error("Settings body is missing.");
    }
    return {
      accent: document.documentElement.style.getPropertyValue("--at-primary").trim(),
      background: document.documentElement.style.getPropertyValue("--at-bg").trim(),
      bodyOverflow: window.getComputedStyle(document.body).overflow,
      documentScrollHeight: document.documentElement.scrollHeight,
      foreground: document.documentElement.style.getPropertyValue("--at-text").trim(),
      previewHeights: previews.map((preview) =>
        Math.round(preview.getBoundingClientRect().height),
      ),
      previewWidths: previews.map((preview) =>
        Math.round(preview.getBoundingClientRect().width),
      ),
      rootTheme: document.documentElement.dataset.theme ?? "",
      settingsBodyClientHeight: settingsBody.clientHeight,
      settingsBodyOverflowY: window.getComputedStyle(settingsBody).overflowY,
      settingsBodyScrollHeight: settingsBody.scrollHeight,
    };
  });
}

async function shellFrameMetrics(page: Page): Promise<ShellFrameMetrics> {
  return page.evaluate(() => {
    const workspace = document.querySelector(".at-workspace");
    const sidebar = document.querySelector(".at-sidebar");
    const scrim = document.querySelector(".at-sidebar-scrim");
    if (!(workspace instanceof HTMLElement)) {
      throw new Error("Workspace is missing.");
    }
    const workspaceRect = workspace.getBoundingClientRect();
    const sidebarRect = sidebar instanceof HTMLElement
      ? sidebar.getBoundingClientRect()
      : null;
    const scrimRect = scrim instanceof HTMLElement
      ? scrim.getBoundingClientRect()
      : null;
    return {
      bodyOverflow: window.getComputedStyle(document.body).overflow,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      scrimLeft: scrimRect === null ? -1 : Math.round(scrimRect.left),
      sidebarWidth: sidebarRect === null ? 0 : Math.round(sidebarRect.width),
      workspaceLeft: Math.round(workspaceRect.left),
      workspaceWidth: Math.round(workspaceRect.width),
    };
  });
}
