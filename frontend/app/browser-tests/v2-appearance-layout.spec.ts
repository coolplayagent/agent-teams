import { expect, test, type Page } from "@playwright/test";

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

async function appearanceStorage(page: Page): Promise<AppearanceStorage> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("agent_teams_appearance") ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
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
