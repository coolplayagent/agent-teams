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

async function expectNewUiTextHasNoTemporaryNaming(page: Page): Promise<void> {
  const visibleText = await page.locator(".at-shell").innerText();
  expect(visibleText).not.toMatch(/\b[Vv]2\b|新版|旧版/);
}
