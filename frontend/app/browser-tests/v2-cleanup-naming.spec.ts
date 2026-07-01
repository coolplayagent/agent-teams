import { expect, test } from "@playwright/test";

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

const SCREENSHOT_FOLDER = "frontend-v2-ts-cleanup";

test("keeps temporary V2 naming out of the visible app shell", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "Cleanup naming",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(/\bV2\b|\bv2\b/);
    await expectNoDocumentScroll(
      page,
      "cleanup naming check should stay inside the fixed shell",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.screenshot({
      path: screenshotPath("v2-cleanup-no-v2-visible.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});
