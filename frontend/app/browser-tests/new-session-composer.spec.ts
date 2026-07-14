import { expect, test } from "@playwright/test";

import {
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  SESSION_ID,
  serveFrontendDist,
  WORKSPACE_ID,
  waitForAppShell,
} from "./support/frontend-app";

test("creates sessions from the same contextual composer surface as chat", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async ({ fulfillJson, method, path }) => {
        if (method === "POST" && path === "/sessions") {
          await fulfillJson({
            can_switch_mode: true,
            normal_model_profile: "default",
            normal_root_role_id: "MainAgent",
            orchestration_preset_id: null,
            session_id: SESSION_ID,
            session_mode: "normal",
            title: "Inspect the workspace",
            workspace_id: WORKSPACE_ID,
          });
          return true;
        }
        if (method === "POST" && path === "/runs") {
          await fulfillJson({ run_id: "run-new-session", session_id: SESSION_ID });
          return true;
        }
        return false;
      },
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page.locator(".at-sidebar-new-session").click();

    await expect(
      page.getByRole("heading", { name: "New session" }),
    ).toBeVisible();
    const composer = page.locator(".at-new-session-composer.at-composer");
    await expect(composer).toBeVisible();
    await expect(composer.locator(".at-composer-sender")).toBeVisible();
    await expect(composer.locator(".at-composer-controls")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Session name (optional)" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /^Workspaces:/ }).click();
    await expect(
      page.getByRole("combobox", { name: "Workspaces" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Workspaces:/ }).click();

    await page.getByRole("button", { name: /^Run settings:/ }).click();
    await expect(page.getByLabel("Session mode")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Model profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Session name (optional)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Run settings:/ }).click();

    await page
      .getByRole("combobox", { name: "Initial task (optional)" })
      .fill("Inspect the workspace");
    await expect(
      page.getByRole("button", { name: "Create and run" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Create and run" }).click();
    await expect(
      page.getByRole("heading", { name: "New session" }),
    ).toHaveCount(0);
    await expect(page.getByText("Inspect the workspace", { exact: true })).toBeVisible();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});
