import { expect, test, type Page } from "@playwright/test";

import {
  captureStableViewportScreenshot,
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForAppShell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-operational-surfaces";

test("verifies Automation from the operational fixture", async ({ page }) => {
  await runOperationalSurface(page, assertV2Automation);
});

test("verifies Connectors from the operational fixture", async ({ page }) => {
  await runOperationalSurface(page, assertV2Connectors);
});

test("verifies Observability from the operational fixture", async ({ page }) => {
  await runOperationalSurface(page, assertV2Observability);
});

test("opens Automation secondary destinations through their real controls", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleOperationalApi,
      sessionTitle: "Automation destinations",
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("button", { name: "Automation" }).click();
    const view = page.locator(".at-automation-view");
    await expect(view).toBeVisible();

    await view.getByRole("button", { name: /Operational automation run/ }).click();
    await expect(view).toBeHidden();
    await expect(page.getByText("No messages yet", { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "session-automation" })).toBeVisible();

    await nav.getByRole("button", { name: "Automation" }).click();
    await view.getByRole("tab", { name: "GitHub" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("heading", { name: "GitHub" })).toBeVisible();
    await expect(settings.getByText("GitHub CLI", { exact: true })).toBeVisible();
    await expect(settings.getByText("Webhook", { exact: true }).last()).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("keeps Automation loading and error states framed at 720px", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  let failProjects = false;
  let releaseProjects: () => void = () => undefined;
  const projectsPending = new Promise<void>((resolve) => {
    releaseProjects = resolve;
  });
  try {
    await page.setViewportSize({ height: 760, width: 720 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "GET" && context.path === "/automation/projects") {
          await projectsPending;
          if (failProjects) {
            await context.fulfillJson({ detail: "automation unavailable" }, 500);
          } else {
            await context.fulfillJson(automationProjects());
          }
          return true;
        }
        return handleOperationalApi(context);
      },
      sessionTitle: "Automation states",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Automation" })
      .click();

    const view = page.locator(".at-automation-view");
    await expect(view.locator(".ant-skeleton")).toBeVisible();
    await captureStableViewportScreenshot(
      page,
      screenshotPath("operational-v2-automation-loading-narrow.png", SCREENSHOT_FOLDER),
    );

    failProjects = true;
    releaseProjects();
    await expect(view.getByText("Could not load automation projects."))
      .toBeVisible();
    await expectNoDocumentScroll(
      page,
      "Automation loading and error states should stay inside the 720px shell",
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath("operational-v2-automation-error-narrow.png", SCREENSHOT_FOLDER),
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    releaseProjects();
    await appServer.close();
  }
});

test("keeps gateway connector editors usable at 720px", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  const discordCreatePayloads: Array<Record<string, unknown>> = [];
  try {
    await page.setViewportSize({ height: 760, width: 720 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "POST" && context.path === "/gateway/discord/accounts") {
          discordCreatePayloads.push(
            context.route.request().postDataJSON() as Record<string, unknown>,
          );
          await context.fulfillJson({
            account_id: "discord-narrow",
            allow_channel_messages: false,
            allowed_channel_ids: [],
            application_id: null,
            bot_user_id: null,
            created_at: "2026-07-11T00:00:00Z",
            display_name: "Discord narrow",
            last_error: null,
            normal_root_role_id: null,
            orchestration_preset_id: null,
            running: true,
            secret_status: { bot_token_configured: true },
            session_mode: "normal",
            shell_safety_policy_enabled: true,
            status: "enabled",
            thinking: { effort: "medium", enabled: true },
            updated_at: "2026-07-11T00:00:00Z",
            workspace_id: WORKSPACE_ID,
            yolo: true,
          });
          return true;
        }
        return handleOperationalApi(context);
      },
      sessionTitle: "Connector editor narrow",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();
    const view = page.getByTestId("connectors-view");
    await view.getByTestId("connector-action-discord").click();
    const editor = view.getByTestId("gateway-editor-discord");
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel("Display name")).toBeVisible();
    await expect(editor.getByLabel("Token")).toBeVisible();
    await editor.getByLabel("Display name").fill("Discord narrow");
    await editor.getByLabel("Token").fill("narrow-token");
    const save = editor.getByRole("button", { name: "Save" });
    await save.scrollIntoViewIfNeeded();
    await save.click();
    await expect.poll(() => discordCreatePayloads).toContainEqual(
      expect.objectContaining({
        bot_token: "narrow-token",
        display_name: "Discord narrow",
        workspace_id: WORKSPACE_ID,
      }),
    );
    await editor.scrollIntoViewIfNeeded();
    await expectNoDocumentScroll(
      page,
      "gateway connector editors should stay inside the 720px shell",
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath("operational-v2-connectors-discord-editor-narrow.png", SCREENSHOT_FOLDER),
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function runOperationalSurface(
  page: Page,
  assertSurface: (page: Page) => Promise<void>,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await page.setViewportSize({ height: 900, width: 1280 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleOperationalApi,
      sessionTitle: "Operational surface parity",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await assertSurface(page);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "operational surfaces should stay inside the fixed app frame",
    );
  } finally {
    await appServer.close();
  }
}

async function assertV1Automation(page: Page): Promise<void> {
  await page.locator('.home-feature-item[data-feature-id="automation"]').click();
  const projectView = page.locator("#project-view");
  await expect(projectView).toBeVisible();
  await expect(page.locator("#project-view-title")).toHaveText("Automation");
  await expect(projectView.getByText("Running", { exact: true })).toBeVisible();
  await expect(projectView.getByText("Paused", { exact: true })).toBeVisible();
  await expect(projectView.getByText("Current", { exact: true })).toBeVisible();
  for (const title of ["Live incident watch", "Paused review", "Daily triage"]) {
    await expect(projectView.getByRole("button", { name: title })).toBeVisible();
  }
  await expect(projectView.locator('[data-automation-section="github"]'))
    .toBeVisible();
  await expect(projectView.locator('[data-automation-section="schedules"]'))
    .toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v1-automation.png", SCREENSHOT_FOLDER),
  );
  await expect(projectView.getByText("Monitor", { exact: true })).toHaveCount(0);
  await expect(projectView.getByText("Follow-up", { exact: true })).toHaveCount(0);
  await projectView.getByRole("button", { name: "Live incident watch" }).click();
  await expect(projectView.locator('[data-automation-session-id="session-automation"]'))
    .toBeVisible();
}

async function assertV1Connectors(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Feature navigation" })
    .getByRole("button", { name: "Connectors" })
    .click();
  const projectView = page.locator("#project-view");
  await expect(projectView).toBeVisible();
  await expect(projectView.getByRole("heading", { exact: true, name: "Connectors" }))
    .toBeVisible();
  await expect(projectView.locator("[data-connectors-search]")).toBeVisible();
  await expect(projectView.getByText("Connected", { exact: true }).first())
    .toBeVisible();
  for (const provider of ["GitHub", "W3", "Discord", "Feishu", "WeChat", "Xiaoluban"]) {
    await expect(projectView.getByText(provider, { exact: true }).first())
      .toBeVisible();
  }
  await expect(projectView.getByText("CLI tools", { exact: true })).toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v1-connectors.png", SCREENSHOT_FOLDER),
  );
  await projectView.locator('[data-connector-open="discord"]').click();
  await expect(page.locator(".gateway-discord-editor")).toBeVisible();
  await page.locator("[data-feature-discord-cancel]").click();
  await expect(page.locator(".gateway-discord-editor")).toBeHidden();

  await projectView.locator('[data-connector-open="xiaoluban"]').click();
  const xiaolubanDialog = page.getByRole("alertdialog");
  await expect(xiaolubanDialog).toBeVisible();
  await expect(xiaolubanDialog).toContainText("Xiaoluban");
  await xiaolubanDialog.locator("[data-feedback-cancel]").click();
  await expect(xiaolubanDialog).toBeHidden();
}

async function assertV1Observability(page: Page): Promise<void> {
  await page.locator("#observability-btn").click();
  const observability = page.locator("#observability-view");
  await expect(observability).toBeVisible();
  await expect(observability.getByText("Observability", { exact: true }))
    .toBeVisible();
  for (const selector of [
    "#observability-metric-cached-input-chart",
    "#observability-metric-uncached-input-chart",
    "#observability-metric-cached-chart",
    "#observability-metric-retrieval-searches-chart",
    "#observability-metric-retrieval-failures-chart",
    "#observability-metric-retrieval-duration-chart",
    "#observability-metric-retrieval-documents-chart",
    "#observability-metric-integrations-chart",
  ]) {
    await expect(observability.locator(selector)).toBeVisible();
  }
  await expect(observability.locator('[data-observability-metric="gateway_calls"]'))
    .toBeVisible();
  await expect(observability.getByRole("heading", { name: "Cached Input Tokens", exact: true }))
    .toBeVisible();
  await expect(observability.getByRole("heading", { name: "Retrieval Searches", exact: true }))
    .toBeVisible();
  await expect(observability.getByRole("heading", { name: "Skill Calls / MCP Calls", exact: true }))
    .toBeVisible();
  await expect(observability.getByRole("heading", { name: "Events", exact: true }))
    .toHaveCount(0);
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v1-observability.png", SCREENSHOT_FOLDER),
  );
}

async function assertV2Automation(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Automation" }).click();
  const view = page.locator(".at-automation-view");
  await expect(view).toBeVisible();
  for (const group of ["Running", "Paused", "Current"]) {
    await expect(view.getByText(group, { exact: true })).toBeVisible();
  }
  for (const title of ["Live incident watch", "Paused review", "Daily triage"]) {
    await expect(view.getByRole("button", { name: title })).toBeVisible();
  }
  await expect(view.getByRole("tab", { name: "Schedules" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(view.getByRole("tab", { name: "GitHub" })).toBeEnabled();
  await expect(view.getByRole("button", { name: "New automation" })).toBeVisible();
  await expect(view.getByRole("button", { name: /Operational automation run/ }))
    .toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v2-automation.png", SCREENSHOT_FOLDER),
  );
}

async function assertV2Connectors(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Connectors" }).click();
  const view = page.getByTestId("connectors-view");
  await expect(view).toBeVisible();
  await expect(view.getByRole("searchbox", { name: "Search connectors" }))
    .toBeVisible();
  for (const provider of ["GitHub", "W3", "Discord", "Feishu", "WeChat", "Xiaoluban"]) {
    await expect(view.getByText(provider, { exact: true }).first()).toBeVisible();
  }
  await expect(view.getByText("CLI tools", { exact: true })).toBeVisible();
  await expect(view.getByTestId("connector-action-github")).toHaveText("Configure");
  await expect(view.getByTestId("connector-action-w3")).toHaveText("Configure");
  await expect(view.getByTestId("connector-action-feishu")).toHaveText("Configure");
  await expect(view.getByTestId("connector-action-wechat")).toHaveText("Configure");
  await expect(view.getByTestId("connector-action-discord")).toHaveText("Configure");
  await expect(view.getByTestId("connector-action-xiaoluban")).toHaveText("Configure");
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v2-connectors.png", SCREENSHOT_FOLDER),
  );
  for (const provider of ["discord", "xiaoluban"] as const) {
    await view.getByTestId(`connector-action-${provider}`).click();
    const editor = view.getByTestId(`gateway-editor-${provider}`);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("button", { name: "New account" })).toBeVisible();
    await captureStableViewportScreenshot(
      page,
      screenshotPath(`operational-pair-v2-connectors-${provider}-editor.png`, SCREENSHOT_FOLDER),
    );
    await editor.getByRole("button", { name: "Close connector settings" }).click();
    await expect(editor).toBeHidden();
  }
}

async function assertV2Observability(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Observability" }).click();
  const view = page.locator(".at-surface-view").filter({
    has: page.getByRole("heading", { name: "Observability" }),
  });
  await expect(view).toBeVisible();
  for (const metric of [
    "cached_input_tokens",
    "uncached_input_tokens",
    "cached_token_ratio",
    "retrieval_searches",
    "retrieval_failure_rate",
    "retrieval_avg_duration_ms",
    "retrieval_document_count",
    "skill_calls",
    "mcp_calls",
    "gateway_calls",
  ]) {
    await expect(view.locator(`[data-observability-metric="${metric}"]`))
      .toBeVisible();
  }
  await expect(view.getByText("Agent loop", { exact: true })).toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("operational-pair-v2-observability.png", SCREENSHOT_FOLDER),
  );
}

async function handleOperationalApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (
    context.method === "POST" &&
    context.path === "/gateway/xiaoluban/accounts:prepare"
  ) {
    await context.fulfillJson({
      account_id: "xiaoluban-prepared",
      forwarding_command: "https://example.invalid/callback g",
      forwarding_url: "https://example.invalid/callback",
      listener_running: true,
    });
    return true;
  }
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/system/configs/github") {
    await context.fulfillJson({ token_configured: true, webhook_base_url: null });
    return true;
  }
  if (context.path === "/system/configs") {
    await context.fulfillJson({ skills: { loaded: true, skills: [] } });
    return true;
  }
  if (context.path === "/system/configs/github/webhook/tunnel") {
    await context.fulfillJson({ provider: "localhost.run", status: "stopped" });
    return true;
  }
  if (context.path === "/automation/projects") {
    await context.fulfillJson(automationProjects());
    return true;
  }
  if (context.path === "/automation/delivery-bindings") {
    await context.fulfillJson([]);
    return true;
  }
  const automationMatch = context.path.match(/^\/automation\/projects\/([^/]+)$/);
  if (automationMatch) {
    const project = automationProjects().find(
      (item) => item.automation_project_id === automationMatch[1],
    );
    await context.fulfillJson(project ?? automationProjects()[0]);
    return true;
  }
  if (/^\/automation\/projects\/[^/]+\/sessions$/.test(context.path)) {
    await context.fulfillJson([automationSession()]);
    return true;
  }
  if (context.path === "/sessions/session-automation") {
    await context.fulfillJson({
      can_switch_mode: true,
      created_at: "2026-06-25T08:00:00Z",
      normal_model_profile: null,
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_id: "session-automation",
      session_mode: "normal",
      title: "Operational automation run",
      updated_at: "2026-06-25T08:16:00Z",
      workspace_id: WORKSPACE_ID,
    });
    return true;
  }
  if ([
    "/sessions/session-automation/messages",
    "/sessions/session-automation/subagents",
    "/sessions/session-automation/agents",
    "/sessions/session-automation/tasks",
  ].includes(context.path)) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === "/sessions/session-automation/rounds") {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (context.path === "/sessions/session-automation/recovery") {
    await context.fulfillJson({
      active_run: null,
      background_tasks: [],
      paused_subagents: [],
      pending_tool_approvals: [],
      pending_user_questions: [],
      recoverable_stopped_run: null,
    });
    return true;
  }
  if (context.path === "/sessions/session-automation/token-usage") {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  if (context.path === "/connectors") {
    await context.fulfillJson(connectorsResponse());
    return true;
  }
  if (context.path === "/connectors/runtime-tools") {
    await context.fulfillJson(runtimeToolsResponse());
    return true;
  }
  if (context.path === "/connectors/w3") {
    await context.fulfillJson({
      has_password: true,
      last_login_error_code: null,
      last_verified_at: "2026-06-25T08:00:00Z",
      status: "connected",
      username: "parity-user",
    });
    return true;
  }
  if ([
    "/gateway/feishu/accounts",
    "/gateway/xiaoluban/accounts",
    "/gateway/wechat/accounts",
    "/gateway/discord/accounts",
  ].includes(context.path)) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === "/roles:options") {
    await context.fulfillJson({ roles: [] });
    return true;
  }
  if (context.path === "/system/configs/orchestration") {
    await context.fulfillJson({ presets: [] });
    return true;
  }
  if (context.path === "/observability/overview") {
    await context.fulfillJson(observabilityOverview(context.url.searchParams));
    return true;
  }
  if (context.path === "/observability/breakdowns") {
    await context.fulfillJson(observabilityBreakdowns());
    return true;
  }
  return false;
}

function automationProjects(): Array<Record<string, unknown>> {
  return [
    automationProject("aut-running", "Live incident watch", "running", "running"),
    automationProject("aut-paused", "Paused review", "disabled", null),
    automationProject("aut-current", "Daily triage", "enabled", "completed"),
  ];
}

function automationProject(
  id: string,
  displayName: string,
  status: string,
  runStatus: string | null,
): Record<string, unknown> {
  return {
    active_run_status: runStatus === "running" ? "running" : null,
    automation_project_id: id,
    created_at: "2026-06-25T08:00:00Z",
    cron_expression: "0 9 * * *",
    delivery_binding: null,
    delivery_events: ["completed"],
    display_name: displayName,
    interval_every: null,
    interval_unit: null,
    last_error: null,
    last_run_started_at: "2026-06-25T08:15:00Z",
    last_session_id: "session-automation",
    latest_terminal_run_status: runStatus,
    latest_terminal_run_verification_status: "verified",
    name: id,
    next_run_at: "2026-06-26T01:00:00Z",
    prompt: "Keep operational parity visible.",
    run_at: null,
    run_config: {
      normal_root_role_id: "MainAgent",
      session_mode: "normal",
      thinking: { effort: "medium", enabled: true },
      yolo: false,
    },
    schedule_mode: "cron",
    status: status === "running" ? "enabled" : status,
    timezone: "Asia/Shanghai",
    trigger_id: `trigger-${id}`,
    updated_at: "2026-06-25T08:20:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function automationSession(): Record<string, unknown> {
  return {
    latest_terminal_run_status: "completed",
    metadata: { title: "Operational automation run" },
    session_id: "session-automation",
    updated_at: "2026-06-25T08:16:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function connectorsResponse(): Record<string, unknown> {
  const items = [
    connector("github", "GitHub", "connected", 1, "api_token", ["repositories", "pull_requests"]),
    connector("w3", "W3", "connected", 1, "username_password", ["w3_auth"]),
    connector("discord", "Discord", "needs_config", 0, "api_token", ["messages"]),
    connector("feishu", "Feishu", "needs_config", 0, "api_key", ["bot_events"]),
    connector("wechat", "WeChat", "needs_config", 0, "qr_login", ["direct_messages"]),
    connector("xiaoluban", "Xiaoluban", "needs_config", 0, "api_token", ["im_forwarding"]),
  ];
  return {
    items,
    summary: { connected: 2, disabled: 0, error: 0, needs_config: 4, total: 6 },
  };
}

function connector(
  provider: string,
  displayName: string,
  status: string,
  accountCount: number,
  authType: string,
  capabilities: string[],
): Record<string, unknown> {
  return {
    account_count: accountCount,
    auth_type: authType,
    capabilities,
    category: provider === "github" ? "development" : provider === "w3" ? "auth" : "im",
    connector_id: provider,
    description: `${displayName} operational connector.`,
    display_name: displayName,
    enabled_count: accountCount,
    last_activity_at: accountCount > 0 ? "2026-06-25T08:00:00Z" : null,
    last_error: null,
    provider,
    status,
  };
}

function runtimeToolsResponse(): Record<string, unknown> {
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
      added: true,
      bin_dir: "C:/Users/yex/.agent-teams/bin",
      supported: true,
    },
  };
}

function observabilityOverview(searchParams: URLSearchParams): Record<string, unknown> {
  const scope = searchParams.get("scope") ?? "global";
  return {
    kpis: {
      cached_input_tokens: 80000,
      cached_token_ratio: 0.714,
      gateway_calls: 3,
      gateway_cold_start_calls: 1,
      gateway_prompt_avg_first_update_ms: 180,
      input_tokens: 112000,
      mcp_calls: 4,
      output_tokens: 790,
      retrieval_avg_duration_ms: 54,
      retrieval_document_count: 27,
      retrieval_failure_rate: 0.111,
      retrieval_searches: 9,
      skill_calls: 6,
      steps: 12,
      tool_avg_duration_ms: 88,
      tool_calls: 7,
      tool_success_rate: 0.9,
      uncached_input_tokens: 32000,
    },
    scope,
    scope_id: scope === "session" ? SESSION_ID : undefined,
    trends: [
      {
        bucket_start: "2026-06-25T07:00:00Z",
        input_tokens: 50000,
        output_tokens: 300,
        steps: 5,
        tool_calls: 3,
      },
      {
        bucket_start: "2026-06-25T08:00:00Z",
        input_tokens: 62000,
        output_tokens: 490,
        steps: 7,
        tool_calls: 4,
      },
    ],
    updated_at: "2026-06-25T08:30:00Z",
  };
}

function observabilityBreakdowns(): Record<string, unknown> {
  return {
    gateway_rows: [
      {
        avg_duration_ms: 93,
        calls: 3,
        cold_start_calls: 1,
        gateway_operation: "session_prompt",
        gateway_phase: "request",
        gateway_transport: "stdio",
        success_rate: 1,
      },
    ],
    role_rows: [
      {
        cached_input_tokens: 50000,
        failures: 0,
        input_tokens: 70000,
        name: "MainAgent",
      },
    ],
    rows: [
      { avg_duration_ms: 88, calls: 7, name: "Agent loop", success_rate: 0.9 },
    ],
    updated_at: "2026-06-25T08:30:00Z",
  };
}
