import { expect, test, type Locator } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-connectors";

test("filters connector statuses and probes the selected connector", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = connectorsViewState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleConnectorsApi(context, state),
      sessionTitle: "TS connectors view",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();

    const connectorsView = page.getByTestId("connectors-view");
    await expect(connectorsView).toBeVisible();
    await expect(page.getByTestId("connector-card-github")).toBeVisible();
    await expect(page.getByTestId("connector-card-w3")).toBeVisible();
    await expect(page.getByTestId("connector-card-slack")).toBeVisible();
    await expect(page.getByTestId("connector-card-relay-knowledge")).toHaveCount(0);
    await page
      .getByTestId("connector-card-github")
      .getByRole("button", { name: "Open GitHub details" })
      .click();
    await expect(page.getByTestId("connector-detail-github")).toBeVisible();
    await expect(page.getByTestId("connector-detail-github"))
      .toContainText("repositories");
    await expect(page.getByTestId("connector-detail-github"))
      .toContainText("pull requests");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await page.getByText("CLI tools", { exact: true }).click();
    await expect(page.getByTestId("runtime-tools-section")).toBeVisible();
    await expect(page.getByTestId("runtime-tool-card-rg")).toContainText("Ready");
    await expect(page.getByTestId("runtime-tool-card-gh")).toContainText("Missing");
    await page.getByText("Connectors", { exact: true }).click();

    const summary = connectorsView.locator(".at-connectors-summary");
    await expect(summary.locator(".at-connectors-summary-cell").nth(0))
      .toContainText("3");
    await expect(summary.locator(".at-connectors-summary-cell").nth(1))
      .toContainText("1");
    await expect(summary.locator(".at-connectors-summary-cell").nth(2))
      .toContainText("1");
    await expect(summary.locator(".at-connectors-summary-cell").nth(4))
      .toContainText("1");

    await connectorsView
      .getByRole("searchbox", { name: "Search connectors" })
      .fill("w3");
    await expect(page.getByTestId("connector-card-w3")).toBeVisible();
    await expect(page.getByTestId("connector-card-github")).toHaveCount(0);
    await page.getByTestId("connector-action-w3").click();
    const w3Detail = page.getByTestId("connector-detail-w3");
    await expect(w3Detail).toContainText("Missing credentials");
    await expect(w3Detail.getByLabel("Username")).toHaveValue("w3-user");
    await w3Detail.getByLabel("Username").fill("w3-next");
    await w3Detail.getByLabel("Password").fill("secret-next");
    await w3Detail.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.w3SaveRequests).toEqual([
      { password: "secret-next", username: "w3-next" },
    ]);
    await page.screenshot({
      path: screenshotPath("v2-connectors-search-w3.png", SCREENSHOT_FOLDER),
    });
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await connectorsView
      .getByRole("searchbox", { name: "Search connectors" })
      .fill("");
    await connectorsView.locator(".at-connectors-controls").getByText(
      "Error",
      { exact: true },
    ).click();
    await expect(page.getByTestId("connector-card-slack")).toBeVisible();
    await page
      .getByTestId("connector-card-slack")
      .getByRole("button", { name: "Open Slack details" })
      .click();
    await expect(page.getByTestId("connector-detail-slack")).toBeVisible();
    await expect(page.getByTestId("connector-detail-slack"))
      .toContainText("Webhook expired");
    await expect(page.getByTestId("connector-card-github")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-connectors-error-filter.png", SCREENSHOT_FOLDER),
    });
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await connectorsView.locator(".at-connectors-controls").getByText(
      "All",
      { exact: true },
    ).click();
    await page
      .getByTestId("connector-card-github")
      .getByRole("button", { name: "Open GitHub details" })
      .click();
    const githubDialog = page.getByRole("dialog");
    await githubDialog
      .getByRole("button", { name: "Test GitHub connection" })
      .click();
    await expect(page.getByText("github is healthy")).toBeVisible();
    await expect(page.getByText("GitHub connection is healthy.")).toBeVisible();
    expect(state.connectorTestRequests).toEqual(["github"]);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 connectors filters and details should stay inside the fixed shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-connectors-probe-result.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps connector loading and retryable error states framed at 720px", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = connectorsViewState();
  let failConnectors = false;
  let releaseInitialLoad: () => void = () => undefined;
  const initialLoad = new Promise<void>((resolve) => {
    releaseInitialLoad = resolve;
  });
  let initialLoadPending = true;
  try {
    await page.setViewportSize({ height: 760, width: 720 });
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "GET" && context.path === "/connectors") {
          if (initialLoadPending) {
            await initialLoad;
            initialLoadPending = false;
          }
          if (failConnectors) {
            await context.fulfillJson({ detail: "connectors unavailable" }, 500);
          } else {
            await context.fulfillJson(connectorsResponse());
          }
          return true;
        }
        return handleConnectorsApi(context, state);
      },
      sessionTitle: "TS connectors states",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();

    const connectorsView = page.getByTestId("connectors-view");
    await expect(connectorsView.locator(".ant-skeleton")).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-connectors-loading-narrow.png", SCREENSHOT_FOLDER),
    });

    releaseInitialLoad();
    await expect(page.getByTestId("connector-card-github")).toBeVisible();
    failConnectors = true;
    await connectorsView
      .getByRole("button", { name: "Refresh connectors" })
      .click();
    await expect(connectorsView.getByText("Could not load connectors.")).toBeVisible();
    await expectNoDocumentScroll(
      page,
      "connector loading and error states should stay inside the 720px shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-connectors-error-narrow.png", SCREENSHOT_FOLDER),
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    releaseInitialLoad();
    await appServer.close();
  }
});

test("uses a dense responsive connector grid without a vacant detail column", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = connectorsViewState();
  try {
    await page.setViewportSize({ height: 820, width: 1440 });
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "GET" && context.path === "/connectors") {
          await context.fulfillJson(denseConnectorsResponse());
          return true;
        }
        return handleConnectorsApi(context, state);
      },
      sessionTitle: "TS dense connectors grid",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();

    const connectorsView = page.getByTestId("connectors-view");
    const grid = connectorsView.locator(".at-connectors-card-list");
    await expect(page.getByTestId("connector-card-wechat")).toBeVisible();
    await expectGridColumns(grid, 3);
    const wideCards = await grid.locator(".at-connectors-card").evaluateAll(
      (cards) => cards.map((card) => card.getBoundingClientRect()),
    );
    expect(new Set(wideCards.map((card) => Math.round(card.x))).size).toBe(3);
    expect(new Set(wideCards.map((card) => Math.round(card.y))).size).toBe(2);
    expect(Math.max(...wideCards.map((card) => card.height))).toBeLessThanOrEqual(130);
    await page.screenshot({
      path: screenshotPath("v2-connectors-dense-wide.png", SCREENSHOT_FOLDER),
    });

    await page.setViewportSize({ height: 820, width: 1000 });
    await expectGridColumns(grid, 2);

    await page.setViewportSize({ height: 820, width: 720 });
    await expectGridColumns(grid, 1);
    await expectNoDocumentScroll(
      page,
      "responsive connector cards should scroll inside the fixed shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-connectors-dense-narrow.png", SCREENSHOT_FOLDER),
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function expectGridColumns(
  grid: Locator,
  expected: number,
): Promise<void> {
  await expect
    .poll(async () =>
      grid.evaluate((element) =>
        window.getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(expected);
}

interface ConnectorsViewState {
  connectorTestRequests: string[];
  w3SaveRequests: Array<{ password: string | null; username: string }>;
}

function connectorsViewState(): ConnectorsViewState {
  return {
    connectorTestRequests: [],
    w3SaveRequests: [],
  };
}

async function handleConnectorsApi(
  context: MockApiRouteContext,
  state: ConnectorsViewState,
): Promise<boolean> {
  if (context.method === "GET") {
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
        last_error: null,
        last_verified_at: "2026-06-25T08:00:00Z",
        status: "needs_config",
        username: "w3-user",
      });
      return true;
    }
    return false;
  }
  if (context.method === "PUT" && context.path === "/connectors/w3") {
    const payload = JSON.parse(context.route.request().postData() ?? "{}") as {
      password?: string | null;
      username?: string;
    };
    state.w3SaveRequests.push({
      password: payload.password ?? null,
      username: payload.username ?? "",
    });
    await context.fulfillJson({
      has_password: true,
      message: "W3 credentials saved.",
      ok: true,
      status: "connected",
      username: payload.username ?? "",
    });
    return true;
  }
  if (
    context.method === "POST"
    && context.path === "/connectors/github:test"
  ) {
    state.connectorTestRequests.push("github");
    await context.fulfillJson({
      account_count: 2,
      capabilities: ["repositories", "pull_requests"],
      checked_at: "2026-06-25T08:42:00Z",
      checks: [],
      connector_id: "github",
      enabled_count: 1,
      last_error: null,
      login_active: null,
      message: "GitHub connection is healthy.",
      ok: true,
      provider: "github",
      runtime_running: null,
      status: "connected",
    });
    return true;
  }
  return false;
}

function connectorsResponse(): Record<string, unknown> {
  return {
    items: [
      {
        account_count: 2,
        auth_type: "api_token",
        capabilities: ["repositories", "pull_requests"],
        category: "development",
        connector_id: "github",
        description: "Connect repositories and pull requests.",
        display_name: "GitHub",
        enabled_count: 1,
        last_activity_at: "2026-06-25T08:00:00Z",
        last_error: null,
        provider: "github",
        status: "connected",
      },
      {
        account_count: 0,
        auth_type: "username_password",
        capabilities: ["w3_auth"],
        category: "auth",
        connector_id: "w3",
        description: "Connect W3 authentication.",
        display_name: "W3",
        enabled_count: 0,
        last_activity_at: null,
        last_error: "Missing credentials",
        provider: "w3",
        status: "needs_config",
      },
      {
        account_count: 1,
        auth_type: "webhook",
        capabilities: ["messages", "notifications"],
        category: "im",
        connector_id: "slack",
        description: "Route Slack messages into Agent Teams.",
        display_name: "Slack",
        enabled_count: 0,
        last_activity_at: "2026-06-25T07:30:00Z",
        last_error: "Webhook expired",
        provider: "slack",
        status: "error",
      },
      {
        account_count: 1,
        auth_type: "cli",
        capabilities: ["cli_upgrade"],
        category: "development",
        connector_id: "relay-knowledge",
        description: "Install and update the Relay Knowledge CLI.",
        display_name: "Relay Knowledge",
        enabled_count: 1,
        last_activity_at: null,
        last_error: null,
        provider: "relay-knowledge",
        status: "connected",
      },
    ],
    summary: {
      connected: 2,
      disabled: 0,
      error: 1,
      needs_config: 1,
      total: 4,
    },
  };
}

function denseConnectorsResponse(): Record<string, unknown> {
  const items = [
    ...((connectorsResponse().items as Array<Record<string, unknown>>).filter(
      (item) => item.connector_id !== "relay-knowledge",
    )),
    {
      account_count: 0,
      auth_type: "api_token",
      capabilities: ["messages"],
      category: "im",
      connector_id: "discord",
      description: "Connect Discord direct messages and mentions.",
      display_name: "Discord",
      enabled_count: 0,
      last_activity_at: null,
      last_error: null,
      provider: "discord",
      status: "needs_config",
    },
    {
      account_count: 1,
      auth_type: "webhook",
      capabilities: ["messages", "notifications"],
      category: "im",
      connector_id: "feishu",
      description: "Connect Feishu chats and bot events.",
      display_name: "Feishu",
      enabled_count: 1,
      last_activity_at: "2026-06-25T07:30:00Z",
      last_error: null,
      provider: "feishu",
      status: "connected",
    },
    {
      account_count: 0,
      auth_type: "qr_login",
      capabilities: ["messages"],
      category: "im",
      connector_id: "wechat",
      description: "Connect WeChat conversations.",
      display_name: "WeChat",
      enabled_count: 0,
      last_activity_at: null,
      last_error: null,
      provider: "wechat",
      status: "disabled",
    },
  ];
  return {
    items,
    summary: {
      connected: 2,
      disabled: 1,
      error: 1,
      needs_config: 2,
      total: 6,
    },
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
      {
        display_name: "GitHub CLI",
        download_job_id: null,
        error_message: null,
        executable_name: "gh.exe",
        path: null,
        path_source: null,
        source_kind: "github_release",
        status: "missing",
        target_version: "2.74.2",
        tool_id: "gh",
        update_available: false,
        version: null,
      },
    ],
    system_path: {
      added: false,
      bin_dir: "C:/Users/yex/.agent-teams/bin",
      supported: true,
    },
  };
}
