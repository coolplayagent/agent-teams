import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV1Shell,
  waitForV2Shell,
} from "./support/frontend-app";

test("switches from V1 to the V2 shell and back", async ({ page }) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes);
    await ensureScreenshotDir();

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".app-shell")).toBeVisible();
    const newInterfaceLink = page.getByRole("link", {
      name: "Open new interface",
    });
    await expect(newInterfaceLink).toBeVisible();
    await expectNoDocumentScroll(page, "v1 root should stay framed");
    await page.screenshot({
      path: screenshotPath("ts-v1-root-before-switch.png"),
    });

    await newInterfaceLink.click();
    await page.waitForURL(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".at-shell")).toBeVisible();
    await expect(page.getByRole("link", { name: "V1" })).toBeVisible();
    await expectNewUiTextHasNoTemporaryNaming(page);
    await expectNoDocumentScroll(page, "v2 shell should stay fixed-height");
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("ts-v2-after-new-ui-switch.png"),
    });

    await page.getByRole("link", { name: "V1" }).click();
    await page.waitForURL(`${appServer.url}/`);
    await waitForV1Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(newInterfaceLink).toBeVisible();
    await expectNoDocumentScroll(page, "v1 shell should stay framed after return");
    await page.screenshot({
      path: screenshotPath("ts-v1-after-return.png"),
    });
  } finally {
    await appServer.close();
  }
});

test("captures paired V1 and V2 fixed shell layout metrics", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const viewportCases: ViewportCase[] = [
    { height: 720, label: "desktop", width: 1280 },
    { height: 720, label: "narrow", width: 720 },
  ];
  try {
    for (const viewportCase of viewportCases) {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });
      await installShellState(page);
      const unhandledApiRoutes: string[] = [];
      await mockShellApi(page, appServer.url, unhandledApiRoutes, {
        sessionTitle: `TS shell pair ${viewportCase.label}`,
      });
      await ensureScreenshotDir();

      await page.goto(`${appServer.url}/`);
      await waitForV1Shell(page);
      const v1Metrics = await shellFrameMetrics(page, {
        body: ".app-container",
        chat: "#chat-container",
        composer: "#input-container",
        scrollRegion: "#chat-messages",
        shell: ".app-shell",
        sidebar: ".sidebar",
        workspace: ".workspace",
      });
      expectFixedFrame(v1Metrics, viewportCase);
      expectNoUnhandledApiRoutes(unhandledApiRoutes);
      await expectNoDocumentScroll(
        page,
        `v1 ${viewportCase.label} paired shell should stay fixed-height`,
      );
      await page.screenshot({
        path: screenshotPath(`shell-pair-v1-${viewportCase.label}.png`),
      });

      await page.getByRole("link", { name: "Open new interface" }).click();
      await page.waitForURL(`${appServer.url}/app/`);
      await waitForV2Shell(page);
      const v2Metrics = await shellFrameMetrics(page, {
        body: ".at-body",
        chat: ".at-chat-view",
        composer: ".at-composer",
        scrollRegion: ".at-timeline",
        shell: ".at-shell",
        sidebar: ".at-sidebar",
        workspace: ".at-workspace",
      });
      expectFixedFrame(v2Metrics, viewportCase);
      expect(v2Metrics.scrollRegion.clientHeight).toBeGreaterThan(120);
      expect(v2Metrics.composer.bottom).toBeLessThanOrEqual(
        viewportCase.height,
      );
      if (viewportCase.width > 640) {
        expect(v2Metrics.composer.left).toBeGreaterThanOrEqual(
          v2Metrics.sidebar.left + v2Metrics.sidebar.width,
        );
      }
      expectNoUnhandledApiRoutes(unhandledApiRoutes);
      await expectNoDocumentScroll(
        page,
        `v2 ${viewportCase.label} paired shell should stay fixed-height`,
      );
      await expectComposerControlsDoNotOverlap(page);
      await page.screenshot({
        path: screenshotPath(`shell-pair-v2-${viewportCase.label}.png`),
      });
    }
  } finally {
    await appServer.close();
  }
});

async function expectNewUiTextHasNoTemporaryNaming(page: Page): Promise<void> {
  const visibleText = await page.locator(".at-shell").innerText();
  expect(visibleText).not.toMatch(/\b[Vv]2\b|新版|旧版/);
}

async function shellFrameMetrics(
  page: Page,
  selectors: ShellFrameSelectors,
): Promise<ShellFrameMetrics> {
  return page.evaluate((targetSelectors) => {
    function readElement(selector: string): ShellFrameElementMetrics {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) {
        throw new Error(`Missing shell frame element: ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        clientHeight: Math.round(element.clientHeight),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        scrollHeight: Math.round(element.scrollHeight),
        scrollTop: Math.round(element.scrollTop),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    }
    return {
      body: readElement(targetSelectors.body),
      chat: readElement(targetSelectors.chat),
      composer: readElement(targetSelectors.composer),
      documentScrollHeight: Math.round(document.documentElement.scrollHeight),
      documentScrollTop: Math.round(document.documentElement.scrollTop),
      scrollRegion: readElement(targetSelectors.scrollRegion),
      shell: readElement(targetSelectors.shell),
      sidebar: readElement(targetSelectors.sidebar),
      viewportHeight: Math.round(window.innerHeight),
      viewportWidth: Math.round(window.innerWidth),
      workspace: readElement(targetSelectors.workspace),
    };
  }, selectors);
}

function expectFixedFrame(
  metrics: ShellFrameMetrics,
  viewportCase: ViewportCase,
): void {
  expect(metrics.viewportHeight).toBe(viewportCase.height);
  expect(metrics.viewportWidth).toBe(viewportCase.width);
  expect(metrics.documentScrollTop).toBe(0);
  expect(metrics.documentScrollHeight).toBeLessThanOrEqual(viewportCase.height);
  expect(metrics.shell.top).toBe(0);
  expect(metrics.shell.height).toBe(viewportCase.height);
  expect(metrics.body.height).toBeGreaterThan(0);
  expect(metrics.body.bottom).toBeLessThanOrEqual(viewportCase.height);
  expect(metrics.sidebar.top).toBeGreaterThanOrEqual(0);
  expect(metrics.sidebar.bottom).toBeLessThanOrEqual(viewportCase.height);
  expect(metrics.workspace.height).toBeGreaterThan(0);
  expect(metrics.chat.height).toBeGreaterThan(0);
  expect(metrics.composer.bottom).toBeLessThanOrEqual(viewportCase.height);
  expect(metrics.scrollRegion.clientHeight).toBeGreaterThan(80);
}

interface ViewportCase {
  height: number;
  label: string;
  width: number;
}

interface ShellFrameSelectors {
  body: string;
  chat: string;
  composer: string;
  scrollRegion: string;
  shell: string;
  sidebar: string;
  workspace: string;
}

interface ShellFrameMetrics {
  body: ShellFrameElementMetrics;
  chat: ShellFrameElementMetrics;
  composer: ShellFrameElementMetrics;
  documentScrollHeight: number;
  documentScrollTop: number;
  scrollRegion: ShellFrameElementMetrics;
  shell: ShellFrameElementMetrics;
  sidebar: ShellFrameElementMetrics;
  viewportHeight: number;
  viewportWidth: number;
  workspace: ShellFrameElementMetrics;
}

interface ShellFrameElementMetrics {
  bottom: number;
  clientHeight: number;
  height: number;
  left: number;
  scrollHeight: number;
  scrollTop: number;
  top: number;
  width: number;
}
