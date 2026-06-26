import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  SESSION_ID,
  serveFrontendDist,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-module-actions";

declare global {
  interface Window {
    __runtimeToolCopiedPaths?: string[];
  }
}

interface ModuleActionState {
  automationDisableRequests: string[];
  automationEnableRequests: string[];
  automationStatus: "disabled" | "enabled";
  requestedPaths: string[];
  runtimeToolsSystemPathAdded: boolean;
  runtimeToolsSystemPathRequests: string[];
}

test("persists V2 sidebar mouse resize after reload", async ({ page }) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellStatePreservingSidebarWidth(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      sessionTitle: "TS sidebar resize",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expect.poll(() => sidebarWidth(page)).toBe(260);
    const resizer = page.locator(".at-sidebar-resizer");
    await expect(resizer).toHaveAttribute("aria-valuenow", "260");
    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      throw new Error("Expected sidebar resizer to have a bounding box.");
    }
    const dragY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, dragY);
    await page.mouse.down();
    await page.mouse.move(220, dragY);
    await page.mouse.up();

    await expect.poll(() => sidebarWidth(page)).toBe(220);
    await expect(resizer).toHaveAttribute("aria-valuenow", "220");
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("agentTeams.sidebarWidth")),
      )
      .toBe("220");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("agentTeams.sidebarWidthMigratedTo260"),
        ),
      )
      .toBe("true");

    await page.reload();
    await waitForV2Shell(page);

    await expect.poll(() => sidebarWidth(page)).toBe(220);
    await expect(page.locator(".at-sidebar-resizer")).toHaveAttribute(
      "aria-valuenow",
      "220",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 sidebar resize should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-sidebar-resize-reload.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("copies runtime tool paths and adds the managed tool directory to PATH", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = moduleActionState();
  try {
    await page.addInitScript(() => {
      window.__runtimeToolCopiedPaths = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.__runtimeToolCopiedPaths?.push(String(value));
          },
        },
      });
    });
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleModuleActionApi(context, state),
      sessionTitle: "TS runtime tools",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();

    const runtimeTools = page.getByTestId("runtime-tools-section");
    await expect(runtimeTools).toBeVisible();
    const ripgrepCard = page.getByTestId("runtime-tool-card-rg");
    await expect(ripgrepCard).toBeVisible();
    await expect(ripgrepCard.getByText("Ready")).toBeVisible();
    await expect(ripgrepCard.getByText("Version 14.1.1")).toBeVisible();

    await ripgrepCard.getByRole("button", { name: "Copy binary path" }).click();
    await expect(page.getByText("Path copied")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__runtimeToolCopiedPaths ?? []))
      .toEqual(["C:/Users/yex/.agent-teams/bin/rg.exe"]);

    await runtimeTools
      .getByRole("button", { name: "Add to system environment variables" })
      .click();
    await expect(
      runtimeTools.getByRole("button", {
        name: "Added to system environment variables",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Runtime tools directory added to system PATH."),
    ).toBeVisible();

    expect(state.runtimeToolsSystemPathRequests).toEqual(["add"]);
    expect(state.requestedPaths).toContain(
      "/connectors/runtime-tools/system-path:add",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 runtime tools should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-runtime-tools-actions.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("toggles an automation project through the real endpoints", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = moduleActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleModuleActionApi(context, state),
      sessionTitle: "TS automation toggle",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Automation" })
      .click();

    const automationDetail = page.locator(".at-automation-detail");
    await expect(
      automationDetail.getByRole("heading", { name: "Daily triage" }),
    ).toBeVisible();
    await expect(
      automationDetail.getByRole("button", { name: "Disable" }),
    ).toBeVisible();

    await automationDetail.getByRole("button", { name: "Disable" }).click();

    await expect(
      automationDetail.getByRole("button", { name: "Enable" }),
    ).toBeVisible();
    await expect(automationDetail.getByText("Disabled", { exact: true }))
      .toBeVisible();
    expect(state.automationDisableRequests).toEqual(["aut-daily"]);
    expect(state.requestedPaths).toContain("/automation/projects/aut-daily:disable");

    await automationDetail.getByRole("button", { name: "Enable" }).click();

    await expect(
      automationDetail.getByRole("button", { name: "Disable" }),
    ).toBeVisible();
    await expect(automationDetail.getByText("Enabled", { exact: true }))
      .toBeVisible();
    expect(state.automationEnableRequests).toEqual(["aut-daily"]);
    expect(state.requestedPaths).toContain("/automation/projects/aut-daily:enable");

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 automation detail should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-automation-toggle-actions.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function sidebarWidth(page: Page): Promise<number> {
  return page.locator(".at-sidebar").evaluate((element) =>
    Math.round(element.getBoundingClientRect().width),
  );
}

async function installShellStatePreservingSidebarWidth(
  page: Page,
): Promise<void> {
  await page.addInitScript(
    ({ sessionId, workspaceId }) => {
      window.localStorage.setItem("agentTeams.language", "en");
      window.localStorage.setItem("agentTeams.themeMode", "dark");
      window.localStorage.setItem("agent_teams_theme", "dark");
      window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
      window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
      window.localStorage.setItem("agentTeams.shellView", "chat");
    },
    { sessionId: SESSION_ID, workspaceId: WORKSPACE_ID },
  );
}

function moduleActionState(): ModuleActionState {
  return {
    automationDisableRequests: [],
    automationEnableRequests: [],
    automationStatus: "enabled",
    requestedPaths: [],
    runtimeToolsSystemPathAdded: false,
    runtimeToolsSystemPathRequests: [],
  };
}

async function handleModuleActionApi(
  context: MockApiRouteContext,
  state: ModuleActionState,
): Promise<boolean> {
  state.requestedPaths.push(context.path);
  if (context.method === "POST") {
    if (context.path === "/connectors/runtime-tools/system-path:add") {
      state.runtimeToolsSystemPathRequests.push("add");
      state.runtimeToolsSystemPathAdded = true;
      await context.fulfillJson({
        bin_dir: "C:/Users/yex/.agent-teams/bin",
        message: "Runtime tools directory added to system PATH.",
        requires_terminal_restart: true,
        status: "updated",
      });
      return true;
    }
    if (context.path === "/automation/projects/aut-daily:disable") {
      state.automationDisableRequests.push("aut-daily");
      state.automationStatus = "disabled";
      await context.fulfillJson(automationProject(state));
      return true;
    }
    if (context.path === "/automation/projects/aut-daily:enable") {
      state.automationEnableRequests.push("aut-daily");
      state.automationStatus = "enabled";
      await context.fulfillJson(automationProject(state));
      return true;
    }
    return false;
  }
  const response = moduleActionResponse(context.path, state);
  if (response === undefined) {
    return false;
  }
  await context.fulfillJson(response);
  return true;
}

function moduleActionResponse(
  path: string,
  state: ModuleActionState,
): unknown | undefined {
  if (path === "/connectors") {
    return connectorsResponse();
  }
  if (path === "/connectors/runtime-tools") {
    return runtimeToolsResponse(state);
  }
  if (path === "/automation/projects") {
    return [automationProject(state)];
  }
  if (path === "/automation/projects/aut-daily") {
    return automationProject(state);
  }
  if (path === "/automation/projects/aut-daily/sessions") {
    return [
      {
        latest_terminal_run_status: "completed",
        metadata: { title: "Daily triage run" },
        session_id: "session-automation",
        updated_at: "2026-06-25T08:16:00Z",
        workspace_id: WORKSPACE_ID,
      },
    ];
  }
  return undefined;
}

function automationProject(state: ModuleActionState): Record<string, unknown> {
  return {
    automation_project_id: "aut-daily",
    created_at: "2026-06-25T08:00:00Z",
    cron_expression: "0 9 * * *",
    delivery_binding: null,
    delivery_events: ["completed"],
    display_name: "Daily triage",
    interval_every: null,
    interval_unit: null,
    last_error: null,
    last_run_started_at: "2026-06-25T08:15:00Z",
    last_session_id: "session-automation",
    latest_terminal_run_status: "completed",
    latest_terminal_run_verification_status: "verified",
    name: "daily_triage",
    next_run_at: "2026-06-26T01:00:00Z",
    prompt: "Keep the V2 shell parity ledger current.",
    run_at: null,
    run_config: {
      normal_root_role_id: "MainAgent",
      session_mode: "normal",
      thinking: { effort: "medium", enabled: true },
      yolo: false,
    },
    schedule_mode: "cron",
    status: state.automationStatus,
    timezone: "Asia/Shanghai",
    trigger_id: "trigger-daily",
    updated_at: "2026-06-25T08:20:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function connectorsResponse(): Record<string, unknown> {
  return {
    items: [
      {
        account_count: 1,
        auth_type: "cli",
        capabilities: ["repositories", "pull_requests"],
        category: "development",
        connector_id: "github",
        description: "GitHub repository and pull request connector.",
        display_name: "GitHub",
        enabled_count: 1,
        last_activity_at: "2026-06-25T08:00:00Z",
        last_error: null,
        provider: "github",
        status: "connected",
      },
    ],
    summary: {
      connected: 1,
      disabled: 0,
      error: 0,
      needs_config: 0,
      total: 1,
    },
  };
}

function runtimeToolsResponse(
  state: ModuleActionState,
): Record<string, unknown> {
  return {
    items: [
      {
        display_name: "ripgrep",
        download_job_id: null,
        error_message: null,
        executable_name: "rg.exe",
        path: "C:/Users/yex/.agent-teams/bin/rg.exe",
        path_source: "managed",
        source_kind: "github_release",
        status: "ready",
        target_version: null,
        tool_id: "rg",
        update_available: false,
        version: "14.1.1",
      },
    ],
    system_path: {
      added: state.runtimeToolsSystemPathAdded,
      bin_dir: "C:/Users/yex/.agent-teams/bin",
      supported: true,
    },
  };
}
