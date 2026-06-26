import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Route } from "@playwright/test";

const SESSION_ID = "session-v2-shell";
const WORKSPACE_ID = "workspace-v2-shell";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const distRoot = resolve(packageRoot, "../dist");
const appRoot = join(distRoot, "app");

test("switches from V1 to the V2 shell and back", async ({ page }) => {
  const appServer = await serveFrontendDist();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes);

    const screenshotDir = join(repoRoot, ".tmp", "frontend-v2-ts-route-switch");
    await mkdir(screenshotDir, { recursive: true });

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".app-shell")).toBeVisible();
    const newInterfaceLink = page.getByRole("link", {
      name: "Open new interface",
    });
    await expect(newInterfaceLink).toBeVisible();
    await expectNoDocumentScroll(page, "v1 root should stay framed");
    await page.screenshot({
      path: join(screenshotDir, "ts-v1-root-before-switch.png"),
    });

    await newInterfaceLink.click();
    await page.waitForURL(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".at-shell")).toBeVisible();
    await expect(page.getByRole("link", { name: "V1" })).toBeVisible();
    await expectNoDocumentScroll(page, "v2 shell should stay fixed-height");
    await page.screenshot({
      path: join(screenshotDir, "ts-v2-after-new-ui-switch.png"),
    });

    await page.getByRole("link", { name: "V1" }).click();
    await page.waitForURL(`${appServer.url}/`);
    await waitForV1Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(newInterfaceLink).toBeVisible();
    await expectNoDocumentScroll(page, "v1 shell should stay framed after return");
    await page.screenshot({
      path: join(screenshotDir, "ts-v1-after-return.png"),
    });
  } finally {
    await appServer.close();
  }
});

async function installShellState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ sessionId, workspaceId }) => {
      window.localStorage.setItem("agentTeams.language", "en");
      window.localStorage.setItem("agentTeams.themeMode", "dark");
      window.localStorage.setItem("agent_teams_theme", "dark");
      window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
      window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
      window.localStorage.setItem("agentTeams.shellView", "chat");
      window.localStorage.removeItem("agentTeams.sidebarWidth");
      window.localStorage.removeItem("agentTeams.sidebarWidthMigratedTo280");
      window.localStorage.removeItem("agentTeams.sidebarWidthMigratedTo260");
    },
    { sessionId: SESSION_ID, workspaceId: WORKSPACE_ID },
  );
}

async function mockShellApi(
  page: Page,
  appBaseUrl: string,
  unhandledApiRoutes: string[],
): Promise<void> {
  await page.route(apiRoutePattern(appBaseUrl), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    if (route.request().method() !== "GET") {
      await fulfillJson(route, { status: "ok" });
      return;
    }
    if (path === "/system/health") {
      await fulfillJson(route, { status: "ok" });
      return;
    }
    if (path === "/system/live") {
      await fulfillJson(route, { status: "ok" });
      return;
    }
    if (path === "/system/control-plane") {
      await fulfillJson(route, { enabled: false });
      return;
    }
    if (path === "/system/configs/ui-language") {
      await fulfillJson(route, { language: "zh-CN" });
      return;
    }
    if (path === "/system/configs/general") {
      await fulfillJson(route, { shell_safety_policy_enabled: true });
      return;
    }
    if (path === "/speech/config") {
      await fulfillJson(route, {
        configured: false,
        language: "zh-CN",
        supported_models: [],
      });
      return;
    }
    if (path === "/workspaces") {
      await fulfillJson(route, [
        {
          display_name: "agent-teams",
          last_session_id: SESSION_ID,
          path: "C:/Users/yex/Documents/workspace/agent-teams",
          updated_at: "2026-06-25T08:00:00Z",
          workspace_id: WORKSPACE_ID,
        },
      ]);
      return;
    }
    if (path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
      await fulfillJson(route, {
        has_more: false,
        items: [
          {
            active_run_status: null,
            created_at: "2026-06-25T08:00:00Z",
            message_count: 2,
            session_id: SESSION_ID,
            title: "V2 shell route switch",
            updated_at: "2026-06-25T08:30:00Z",
            workspace_id: WORKSPACE_ID,
          },
        ],
        next_cursor: null,
      });
      return;
    }
    if (path === "/roles:options") {
      await fulfillJson(route, {
        coordinator_role: {
          description: "Coordinates delegated work.",
          name: "Coordinator",
          role_id: "Coordinator",
        },
        coordinator_role_id: "Coordinator",
        main_agent_role: {
          description: "Handles primary chat work.",
          name: "Main Agent",
          role_id: "MainAgent",
        },
        main_agent_role_id: "MainAgent",
        normal_mode_roles: [
          {
            description: "Default chat role.",
            name: "Default",
            role_id: "MainAgent",
          },
        ],
        subagent_roles: [],
      });
      return;
    }
    if (path === "/automation/projects") {
      await fulfillJson(route, []);
      return;
    }
    if (path === "/system/configs/model/profiles") {
      await fulfillJson(route, {
        default: {
          is_default: true,
          model: "gpt-4o-mini",
          provider: "openai",
        },
      });
      return;
    }
    if (path === "/system/configs/orchestration") {
      await fulfillJson(route, {
        default_orchestration_preset_id: "team",
        presets: [
          {
            name: "Team",
            orchestration_prompt: "Coordinate delegated work.",
            preset_id: "team",
            role_ids: ["MainAgent"],
          },
        ],
      });
      return;
    }
    if (path === "/sessions/sidebar") {
      await fulfillJson(route, [
        {
          active_run_status: null,
          created_at: "2026-06-25T08:00:00Z",
          message_count: 2,
          session_id: SESSION_ID,
          title: "V2 shell route switch",
          updated_at: "2026-06-25T08:30:00Z",
          workspace_id: WORKSPACE_ID,
        },
      ]);
      return;
    }
    if (path === `/sessions/${SESSION_ID}`) {
      await fulfillJson(route, {
        created_at: "2026-06-25T08:00:00Z",
        normal_root_role_id: "MainAgent",
        session_id: SESSION_ID,
        session_mode: "normal",
        title: "V2 shell route switch",
        updated_at: "2026-06-25T08:30:00Z",
        workspace_id: WORKSPACE_ID,
      });
      return;
    }
    if (path === `/sessions/${SESSION_ID}/messages`) {
      await fulfillJson(route, []);
      return;
    }
    if (path === `/sessions/${SESSION_ID}/agents`) {
      await fulfillJson(route, []);
      return;
    }
    if (path === `/sessions/${SESSION_ID}/tasks`) {
      await fulfillJson(route, []);
      return;
    }
    if (path === `/sessions/${SESSION_ID}/rounds`) {
      await fulfillJson(route, { has_more: false, items: [], next_cursor: null });
      return;
    }
    if (path === `/sessions/${SESSION_ID}/recovery`) {
      await fulfillJson(route, {
        active_run: null,
        background_tasks: [],
        paused_subagents: [],
        pending_tool_approvals: [],
        pending_user_questions: [],
        recoverable_stopped_run: null,
      });
      return;
    }
    if (path === `/sessions/${SESSION_ID}/token-usage`) {
      await fulfillJson(route, { by_role: {}, input_tokens: 0, output_tokens: 0 });
      return;
    }
    unhandledApiRoutes.push(`${route.request().method()} ${path}${url.search}`);
    await fulfillJson(route, { detail: `Unhandled TS browser API route: ${path}` }, 404);
  });
}

async function waitForV1Shell(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open new interface" })).toBeVisible();
  await expectBootstrapReady(page);
  await expect(page.locator(".initial-runtime-loader")).toBeHidden();
  await expect(page.locator("#backend-status")).toHaveAttribute("data-status", "online");
  await expect(page.locator("#runtime-loading-banner")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#runtime-loading-banner")).not.toHaveClass(/is-visible/);
  await expect(page.locator("text=Unhandled TS browser API route")).toHaveCount(0);
}

async function waitForV2Shell(page: Page): Promise<void> {
  await expect(page.locator(".at-shell")).toBeVisible();
  await expect(page.getByRole("link", { name: "V1" })).toBeVisible();
  await expectBootstrapReady(page);
  await expect(page.locator(".initial-app-loader")).toBeHidden();
}

function expectNoUnhandledApiRoutes(unhandledApiRoutes: string[]): void {
  expect(unhandledApiRoutes, `Unhandled API routes: ${unhandledApiRoutes.join(", ")}`).toEqual([]);
}

async function expectBootstrapReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.bootstrapState))
    .toBe("ready");
}

async function expectNoDocumentScroll(page: Page, message: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollHeight <= window.innerHeight,
        ),
      { message },
    )
    .toBe(true);
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function serveFrontendDist(): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  return new Promise((resolveServer) => {
    const server = createServer((request, response) => {
      serveStaticFile(request, response);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected frontend test server to bind a TCP port.");
      }
      resolveServer({
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }
              resolveClose();
            });
          }),
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function apiRoutePattern(appBaseUrl: string): RegExp {
  return new RegExp(`^${escapeRegExp(appBaseUrl)}/api/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const requestPath = decodeURIComponent(requestUrl.pathname);
  const filePath = resolveFrontendFile(requestPath);
  if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

function resolveFrontendFile(requestPath: string): string | null {
  const filePath = frontendFilePath(requestPath);
  const resolvedFilePath = resolve(filePath);
  if (!resolvedFilePath.startsWith(distRoot)) {
    return null;
  }
  return resolvedFilePath;
}

function frontendFilePath(requestPath: string): string {
  if (requestPath === "/" || requestPath === "") {
    return join(distRoot, "index.html");
  }
  if (requestPath === "/app" || requestPath === "/app/") {
    return join(appRoot, "index.html");
  }
  if (requestPath.startsWith("/app/")) {
    return join(appRoot, requestPath.slice("/app/".length));
  }
  const candidate = join(distRoot, requestPath.slice(1));
  if (existsSync(candidate)) {
    return candidate;
  }
  return join(distRoot, "index.html");
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
