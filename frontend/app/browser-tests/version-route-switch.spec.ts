import { expect, test } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForAppShell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-version-route-switch";

test("switches between V2 and V1 while keeping API traffic on the same origin", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const apiOrigins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      apiOrigins.add(url.origin);
    }
  });

  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "Version route switch",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const v1Link = page.getByRole("link", { name: "V1" });
    await expect(v1Link).toBeVisible();
    await expect(v1Link).toHaveAttribute("href", "/v1/");

    await v1Link.click();
    await page.waitForURL(`${appServer.url}/v1/`);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator("#backend-status")).toHaveAttribute(
      "data-status",
      "online",
    );
    const v2Link = page.getByRole("link", { name: "Switch to V2" });
    await expect(v2Link).toBeVisible();
    await expect(v2Link).toHaveAttribute("href", "/");
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath("v1-route.png", SCREENSHOT_FOLDER),
    });

    await v2Link.click();
    await page.waitForURL(`${appServer.url}/`);
    await waitForAppShell(page);
    await expect(page.getByRole("link", { name: "V1" })).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath("v2-route.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    expect(Array.from(apiOrigins)).toEqual([appServer.url]);
  } finally {
    await appServer.close();
  }
});
