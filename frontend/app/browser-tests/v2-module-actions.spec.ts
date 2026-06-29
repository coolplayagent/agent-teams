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
const CREATED_AUTOMATION_PROJECT_ID = "aut-browser-created";
const CREATED_AUTOMATION_SESSION_ID = "session-automation-created";

declare global {
  interface Window {
    __runtimeToolCopiedPaths?: string[];
  }
}

interface ModuleActionState {
  automationCreatePayloads: Record<string, unknown>[];
  automationDeleteRequests: Array<{
    payload: Record<string, unknown>;
    projectId: string;
  }>;
  automationDisableRequests: string[];
  automationEnableRequests: string[];
  automationRunRequests: string[];
  automationStatus: "disabled" | "enabled";
  createdAutomationProject: Record<string, unknown> | null;
  createdAutomationSessionVisible: boolean;
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

test("creates, runs, and deletes an automation project through real endpoints", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = moduleActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleModuleActionApi(context, state),
      sessionTitle: "TS automation create",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Automation" })
      .click();

    await page.getByRole("button", { name: "New automation" }).click();
    const dialog = page.getByRole("dialog", { name: "New automation" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Display name").fill("Browser Automation TS");
    await dialog.getByLabel("Project ID").fill(CREATED_AUTOMATION_PROJECT_ID);
    await dialog
      .getByLabel("Prompt")
      .fill("Create a browser covered V2 automation project.");
    await dialog.getByLabel("Timezone").fill("Asia/Shanghai");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden();

    const automationDetail = page.locator(".at-automation-detail");
    await expect(
      automationDetail.getByRole("heading", { name: "Browser Automation TS" }),
    ).toBeVisible();
    expect(state.automationCreatePayloads).toHaveLength(1);
    expect(state.automationCreatePayloads[0]).toMatchObject({
      cron_expression: "0 9 * * 1-5",
      display_name: "Browser Automation TS",
      name: CREATED_AUTOMATION_PROJECT_ID,
      prompt: "Create a browser covered V2 automation project.",
      schedule_mode: "cron",
      timezone: "Asia/Shanghai",
      workspace_id: WORKSPACE_ID,
    });
    await expectNoDocumentScroll(
      page,
      "v2 automation creation should keep the shell frame fixed",
    );
    await page.screenshot({
      path: screenshotPath("v2-automation-create-detail.png", SCREENSHOT_FOLDER),
    });

    await automationDetail.getByRole("button", { name: "Run now" }).click();
    await expect
      .poll(() => state.automationRunRequests)
      .toEqual([CREATED_AUTOMATION_PROJECT_ID]);
    await expect(
      page.getByRole("button", { name: "Browser Automation TS run" }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Automation" })
      .click();
    await page
      .locator(".at-automation-list")
      .getByRole("button", { name: "Browser Automation TS" })
      .click();
    await automationDetail.getByRole("button", { name: "Delete" }).click();
    const confirm = page.locator(".ant-modal-confirm");
    await expect(
      confirm.locator(".ant-modal-confirm-title"),
    ).toHaveText('Delete automation project "Browser Automation TS"?');
    await expect(
      confirm.locator(".ant-modal-confirm-title"),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect(
      page.locator(".at-automation-list").getByText("Browser Automation TS"),
    ).toHaveCount(0);
    expect(state.automationDeleteRequests).toEqual([
      {
        payload: { cascade: true, force: false, reason: null },
        projectId: CREATED_AUTOMATION_PROJECT_ID,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 automation delete should keep the shell frame fixed",
    );
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
    automationCreatePayloads: [],
    automationDeleteRequests: [],
    automationDisableRequests: [],
    automationEnableRequests: [],
    automationRunRequests: [],
    automationStatus: "enabled",
    createdAutomationProject: null,
    createdAutomationSessionVisible: false,
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
  if (context.method === "DELETE") {
    if (context.path === `/automation/projects/${CREATED_AUTOMATION_PROJECT_ID}`) {
      const payload = readRecordPayload(context.route.request().postData());
      state.automationDeleteRequests.push({
        payload,
        projectId: CREATED_AUTOMATION_PROJECT_ID,
      });
      state.createdAutomationProject = null;
      state.createdAutomationSessionVisible = false;
      await context.fulfillJson({ status: "ok" });
      return true;
    }
    return false;
  }
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
    if (context.path === "/automation/projects") {
      const payload = readRecordPayload(context.route.request().postData());
      state.automationCreatePayloads.push(payload);
      state.createdAutomationProject = createdAutomationProject(payload);
      await context.fulfillJson(state.createdAutomationProject);
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
    if (context.path === `/automation/projects/${CREATED_AUTOMATION_PROJECT_ID}:run`) {
      state.automationRunRequests.push(CREATED_AUTOMATION_PROJECT_ID);
      state.createdAutomationSessionVisible = true;
      if (state.createdAutomationProject !== null) {
        state.createdAutomationProject = {
          ...state.createdAutomationProject,
          last_run_started_at: "2026-06-25T08:45:00Z",
          last_session_id: CREATED_AUTOMATION_SESSION_ID,
          latest_terminal_run_status: "queued",
          updated_at: "2026-06-25T08:45:00Z",
        };
      }
      await context.fulfillJson({
        automation_project_id: CREATED_AUTOMATION_PROJECT_ID,
        queued: true,
        reused_bound_session: false,
        run_id: "run-browser-created",
        session_id: CREATED_AUTOMATION_SESSION_ID,
      });
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
    return automationProjects(state);
  }
  if (path === "/automation/projects/aut-daily") {
    return automationProject(state);
  }
  if (
    path === `/automation/projects/${CREATED_AUTOMATION_PROJECT_ID}` &&
    state.createdAutomationProject !== null
  ) {
    return state.createdAutomationProject;
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
  if (path === `/automation/projects/${CREATED_AUTOMATION_PROJECT_ID}/sessions`) {
    return state.createdAutomationSessionVisible
      ? [createdAutomationSession()]
      : [];
  }
  if (path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    return {
      has_more: false,
      items: sessionSidebarRecords(state, "TS automation create"),
      next_cursor: null,
    };
  }
  if (path === "/sessions/sidebar") {
    return sessionSidebarRecords(state, "TS automation create");
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}`) {
    return {
      can_switch_mode: true,
      created_at: "2026-06-25T08:45:00Z",
      normal_model_profile: null,
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_id: CREATED_AUTOMATION_SESSION_ID,
      session_mode: "normal",
      title: "Browser Automation TS run",
      updated_at: "2026-06-25T08:46:00Z",
      workspace_id: WORKSPACE_ID,
    };
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/messages`) {
    return [];
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/subagents`) {
    return [];
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/agents`) {
    return [];
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/tasks`) {
    return [];
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/rounds`) {
    return { has_more: false, items: [], next_cursor: null };
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/recovery`) {
    return {
      active_run: null,
      background_tasks: [],
      paused_subagents: [],
      pending_tool_approvals: [],
      pending_user_questions: [],
      recoverable_stopped_run: null,
    };
  }
  if (path === `/sessions/${CREATED_AUTOMATION_SESSION_ID}/token-usage`) {
    return { by_role: {}, input_tokens: 0, output_tokens: 0 };
  }
  return undefined;
}

function automationProjects(state: ModuleActionState): Record<string, unknown>[] {
  return [
    automationProject(state),
    ...(state.createdAutomationProject === null
      ? []
      : [state.createdAutomationProject]),
  ];
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

function createdAutomationProject(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const displayName = stringField(payload, "display_name") || "Browser Automation TS";
  return {
    automation_project_id: CREATED_AUTOMATION_PROJECT_ID,
    created_at: "2026-06-25T08:40:00Z",
    cron_expression: stringField(payload, "cron_expression") || null,
    delivery_binding: null,
    delivery_events: ["completed"],
    display_name: displayName,
    interval_every: null,
    interval_unit: null,
    last_error: null,
    last_run_started_at: null,
    last_session_id: null,
    latest_terminal_run_status: null,
    latest_terminal_run_verification_status: null,
    name: stringField(payload, "name") || CREATED_AUTOMATION_PROJECT_ID,
    next_run_at: "2026-06-26T01:00:00Z",
    prompt: stringField(payload, "prompt"),
    run_at: null,
    run_config: {
      normal_root_role_id: "MainAgent",
      session_mode: "normal",
      thinking: { effort: "medium", enabled: true },
      yolo: false,
    },
    schedule_mode: "cron",
    status: payload.enabled === false ? "disabled" : "enabled",
    timezone: stringField(payload, "timezone") || "UTC",
    trigger_id: "trigger-browser-created",
    updated_at: "2026-06-25T08:40:00Z",
    workspace_id: stringField(payload, "workspace_id") || WORKSPACE_ID,
  };
}

function createdAutomationSession(): Record<string, unknown> {
  return {
    active_run_status: "queued",
    latest_terminal_run_status: "queued",
    metadata: { title: "Browser Automation TS run" },
    session_id: CREATED_AUTOMATION_SESSION_ID,
    title: "Browser Automation TS run",
    updated_at: "2026-06-25T08:45:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function sessionSidebarRecords(
  state: ModuleActionState,
  title: string,
): Record<string, unknown>[] {
  return [
    {
      active_run_status: null,
      created_at: "2026-06-25T08:00:00Z",
      message_count: 2,
      session_id: SESSION_ID,
      title,
      updated_at: "2026-06-25T08:30:00Z",
      workspace_id: WORKSPACE_ID,
    },
    ...(state.createdAutomationSessionVisible
      ? [
          {
            active_run_status: "queued",
            created_at: "2026-06-25T08:45:00Z",
            message_count: 0,
            session_id: CREATED_AUTOMATION_SESSION_ID,
            title: "Browser Automation TS run",
            updated_at: "2026-06-25T08:45:00Z",
            workspace_id: WORKSPACE_ID,
          },
        ]
      : []),
  ];
}

function readRecordPayload(rawPayload: string | null): Record<string, unknown> {
  if (rawPayload === null || !rawPayload.trim()) {
    return {};
  }
  const parsed = JSON.parse(rawPayload) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object request payload.");
  }
  return parsed as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
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
