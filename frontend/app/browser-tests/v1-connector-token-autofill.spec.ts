import { expect, test } from "@playwright/test";

import {
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  serveFrontendDist,
  waitForV1Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const GITHUB_SAVED_TOKEN = "ghp_browser_saved_token";
const CLAWHUB_SAVED_TOKEN = "ch_browser_saved_token";
const BROWSER_AUTOFILL_VALUE = "browser_password";

interface ConnectorTokenState {
  clawhubProbePayloads: Array<Record<string, unknown>>;
  clawhubSavePayloads: Array<Record<string, unknown>>;
  githubProbePayloads: Array<Record<string, unknown>>;
  githubSavePayloads: Array<Record<string, unknown>>;
}

test("keeps GitHub saved token protected from autofilled DOM values", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = createConnectorTokenState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleConnectorApi(context, state),
      sessionTitle: "TS GitHub connector token",
    });

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);

    await page.locator('.home-feature-item[data-feature-id="automation"]').click();
    await expect(page.locator("#project-view")).toBeVisible();
    await page.locator('[data-automation-section="github"]').click();
    await expect(page.locator("[data-github-open-connector]").first())
      .toBeVisible();
    await page.locator("[data-github-open-connector]").first().click();
    await expect(page.locator("[data-github-connector-modal]")).toBeVisible();

    const tokenInput = page.locator("#feature-github-token");
    await expect(tokenInput).toBeVisible();
    await expect(tokenInput).toHaveAttribute("autocomplete", "new-password");
    await expect(tokenInput).toHaveValue("");

    await tokenInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, BROWSER_AUTOFILL_VALUE);
    await expect(tokenInput).toHaveValue("");

    await page.locator("#feature-test-github-btn").click();
    await expect(page.locator("#feature-github-probe-status"))
      .toContainText("octocat");
    expect(state.githubProbePayloads).toEqual([{}]);

    await page.locator("#feature-save-github-btn").click();
    await expect.poll(() => state.githubSavePayloads.length).toBe(1);
    expect(state.githubSavePayloads).toEqual([{}]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("keeps ClawHub saved token protected from autofilled DOM values", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = createConnectorTokenState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleConnectorApi(context, state),
      sessionTitle: "TS ClawHub connector token",
    });

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);

    await page.locator('.home-feature-item[data-feature-id="skills"]').click();
    await expect(page.locator("#project-view")).toBeVisible();
    await expect(page.locator("[data-feature-skills-clawhub-settings]"))
      .toBeVisible();

    await page.locator("[data-feature-skills-clawhub-settings]").click();
    const modal = page.locator("[data-feature-skills-modal]");
    await expect(modal).toBeVisible();
    const tokenInput = page.locator("#feature-clawhub-token");
    await expect(tokenInput).toHaveAttribute("autocomplete", "new-password");
    await expect(tokenInput).toHaveValue("");

    await tokenInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
    }, BROWSER_AUTOFILL_VALUE);

    await page.locator("#feature-test-clawhub-btn").click();
    await expect(page.locator("#feature-clawhub-probe-status"))
      .toContainText("clawhub 0.4.2");
    expect(state.clawhubProbePayloads).toEqual([
      { token: CLAWHUB_SAVED_TOKEN },
    ]);

    await page.locator("#feature-save-clawhub-token-btn").click();
    await expect.poll(() => state.clawhubSavePayloads.length).toBe(1);
    expect(state.clawhubSavePayloads).toEqual([
      { token: CLAWHUB_SAVED_TOKEN },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleConnectorApi(
  context: MockApiRouteContext,
  state: ConnectorTokenState,
): Promise<boolean> {
  if (context.path === "/system/configs/github" && context.method === "GET") {
    await context.fulfillJson({
      token_configured: true,
      webhook_base_url: "",
    });
    return true;
  }
  if (
    context.path === "/system/configs/github/webhook/tunnel"
    && context.method === "GET"
  ) {
    await context.fulfillJson({
      provider: "localhost.run",
      public_url: null,
      status: "idle",
    });
    return true;
  }
  if (context.path === "/system/configs/github:probe" && context.method === "POST") {
    state.githubProbePayloads.push(readJsonPayload(context));
    await context.fulfillJson({
      gh_version: "2.88.1",
      latency_ms: 12,
      ok: true,
      username: "octocat",
    });
    return true;
  }
  if (context.path === "/system/configs/github" && context.method === "PUT") {
    state.githubSavePayloads.push(readJsonPayload(context));
    await context.fulfillJson({
      token_configured: true,
      webhook_base_url: "",
    });
    return true;
  }
  if (context.path === "/system/configs/clawhub" && context.method === "GET") {
    await context.fulfillJson({ token: CLAWHUB_SAVED_TOKEN });
    return true;
  }
  if (context.path === "/system/configs/clawhub:probe" && context.method === "POST") {
    state.clawhubProbePayloads.push(readJsonPayload(context));
    await context.fulfillJson({
      clawhub_version: "clawhub 0.4.2",
      diagnostics: { installed_during_probe: false },
      latency_ms: 12,
      ok: true,
    });
    return true;
  }
  if (context.path === "/system/configs/clawhub" && context.method === "PUT") {
    state.clawhubSavePayloads.push(readJsonPayload(context));
    await context.fulfillJson({ token: CLAWHUB_SAVED_TOKEN });
    return true;
  }
  if (context.method !== "GET") {
    return false;
  }
  const response = connectorPageResponse(context.path);
  if (response === undefined) {
    return false;
  }
  await context.fulfillJson(response);
  return true;
}

function connectorPageResponse(path: string): unknown | undefined {
  if (path === "/system/configs") {
    return {
      skills: {
        loaded: true,
        skills: [],
      },
    };
  }
  if (path === "/system/skills/market/clawhub") {
    return {
      items: [],
      next_cursor: null,
      ok: true,
      query: "",
      sort: "popular",
    };
  }
  if (
    path === "/triggers/github/accounts"
    || path === "/triggers/github/repos"
    || path === "/triggers/github/rules"
    || path === "/gateway/feishu/accounts"
    || path === "/gateway/wechat/accounts"
    || path === "/gateway/discord/accounts"
    || path === "/gateway/xiaoluban/accounts"
  ) {
    return [];
  }
  if (path === "/connectors") {
    return {
      items: [
        {
          account_count: 0,
          capabilities: ["repositories", "pull_requests"],
          connector_id: "github",
          description: "GitHub repository and pull request connector.",
          display_name: "GitHub",
          provider: "github",
          status: "needs_config",
        },
      ],
    };
  }
  if (path === "/connectors/runtime-tools") {
    return {
      items: [],
      system_path: { added: false },
    };
  }
  return undefined;
}

function createConnectorTokenState(): ConnectorTokenState {
  return {
    clawhubProbePayloads: [],
    clawhubSavePayloads: [],
    githubProbePayloads: [],
    githubSavePayloads: [],
  };
}

function readJsonPayload(context: MockApiRouteContext): Record<string, unknown> {
  const rawPayload = context.route.request().postData();
  if (rawPayload === null || rawPayload.trim() === "") {
    return {};
  }
  const payload = JSON.parse(rawPayload) as unknown;
  if (isRecord(payload)) {
    return payload;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
