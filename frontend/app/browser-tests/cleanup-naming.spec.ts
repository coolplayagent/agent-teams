import { expect, test } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForAppShell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-cleanup";

test("keeps temporary migration naming out of the visible app shell", async ({
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

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(/\bV2\b|\bv2\b/);
    await expectNoDocumentScroll(
      page,
      "cleanup naming check should stay inside the fixed shell",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.screenshot({
      path: screenshotPath("cleanup-no-migration-naming-visible.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});
