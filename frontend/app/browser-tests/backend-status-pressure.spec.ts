import { expect, test } from "@playwright/test";

import {
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  serveFrontendDist,
  waitForAppShell,
  SESSION_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

interface BrowserPressureWindow extends Window {
  __agentTeamsBackendPressureFetches?: Promise<unknown>[];
}

test("keeps backend status online while pressure requests are pending", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  let healthRequestCount = 0;
  let pressureRequestCount = 0;
  let releasePressureRequests!: () => void;
  const pressureGate = new Promise<void>((resolve) => {
    releasePressureRequests = resolve;
  });

  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleBackendPressureApi(context, {
          countHealth: () => {
            healthRequestCount += 1;
          },
          countPressure: () => {
            pressureRequestCount += 1;
          },
          pressureGate,
        }),
      sessionTitle: "TS backend pressure",
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const status = page.locator(".at-sidebar-backend-status");
    await expect(status).toHaveClass(/is-online/);

    await page.evaluate((sessionId) => {
      const browserWindow = window as BrowserPressureWindow;
      browserWindow.__agentTeamsBackendPressureFetches = Array.from(
        { length: 10 },
        (_value, index) =>
          fetch(`/api/sessions/${sessionId}/tasks?pressure=${index}`).then(
            (response) => response.json(),
          ),
      );
    }, SESSION_ID);
    await expect.poll(() => pressureRequestCount).toBe(10);

    await expect
      .poll(() => healthRequestCount, {
        message: "health polling should continue while pressure requests wait",
        timeout: 12_000,
      })
      .toBeGreaterThan(1);
    await expect(status).toHaveClass(/is-online/);
    await expect(status).not.toHaveClass(/is-busy|is-offline/);

    releasePressureRequests();
    await page.evaluate(() => {
      const browserWindow = window as BrowserPressureWindow;
      return Promise.all(browserWindow.__agentTeamsBackendPressureFetches ?? []);
    });
    await expect(status).toHaveClass(/is-online/);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    releasePressureRequests();
    await appServer.close();
  }
});

async function handleBackendPressureApi(
  context: MockApiRouteContext,
  options: {
    countHealth: () => void;
    countPressure: () => void;
    pressureGate: Promise<void>;
  },
): Promise<boolean> {
  if (context.path === "/system/health" && context.method === "GET") {
    options.countHealth();
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (isPressureTasksRequest(context)) {
    options.countPressure();
    await options.pressureGate;
    await context.fulfillJson({ ok: true });
    return true;
  }
  return false;
}

function isPressureTasksRequest(context: MockApiRouteContext): boolean {
  return (
    context.method === "GET" &&
    context.path === `/sessions/${SESSION_ID}/tasks` &&
    context.url.searchParams.has("pressure")
  );
}
