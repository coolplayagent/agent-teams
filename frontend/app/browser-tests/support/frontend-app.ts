import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, type Route } from "@playwright/test";

export const SESSION_ID = "session-v2-shell";
export const WORKSPACE_ID = "workspace-v2-shell";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(packageRoot, "../..");
const distRoot = resolve(packageRoot, "../dist");
const appRoot = join(distRoot, "app");

export interface FrontendTestServer {
  close: () => Promise<void>;
  url: string;
}

export interface FrontendTestServerOptions {
  handleRequest?: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => boolean | Promise<boolean>;
}

export interface MockApiRouteContext {
  fulfillJson: (body: unknown, status?: number) => Promise<void>;
  method: string;
  path: string;
  route: Route;
  url: URL;
}

export interface MockShellApiOptions {
  handleRequest?: (context: MockApiRouteContext) => Promise<boolean>;
  sessionTitle?: string;
}

export interface MockEventSourceDispatch {
  data: unknown;
  lastEventId?: string;
  sourceIndex?: number | null;
  type: string;
}

interface BrowserTestEventSourceHarness {
  dispatch: (
    sourceIndex: number | null,
    type: string,
    data: string,
    lastEventId: string,
  ) => void;
  dispatchError: (sourceIndex: number | null) => void;
  openCount: () => number;
  urls: () => string[];
}

declare global {
  interface Window {
    __agentTeamsBrowserTestEventSource?: BrowserTestEventSourceHarness;
  }
}

export function screenshotPath(
  name: string,
  folder = "frontend-v2-ts-route-switch",
): string {
  return join(repoRoot, ".tmp", folder, name);
}

export async function ensureScreenshotDir(
  folder = "frontend-v2-ts-route-switch",
): Promise<void> {
  await mkdir(join(repoRoot, ".tmp", folder), {
    recursive: true,
  });
}

export async function serveFrontendDist(
  options: FrontendTestServerOptions = {},
): Promise<FrontendTestServer> {
  return new Promise((resolveServer) => {
    const server = createServer(async (request, response) => {
      if (await options.handleRequest?.(request, response)) {
        return;
      }
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

export async function installShellState(page: Page): Promise<void> {
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

export async function installMockEventSource(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type EventSourceListener = EventListenerOrEventListenerObject;

    class BrowserTestEventSource {
      static readonly CLOSED = 2;
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;

      readonly url: string;
      onerror: ((this: EventSource, event: Event) => void) | null = null;
      onmessage: ((this: EventSource, event: MessageEvent<string>) => void) | null =
        null;
      onopen: ((this: EventSource, event: Event) => void) | null = null;
      readyState = BrowserTestEventSource.CONNECTING;
      withCredentials = false;

      private readonly listeners = new Map<string, EventSourceListener[]>();

      constructor(url: string | URL) {
        this.url = String(url);
        sources.push(this);
        window.queueMicrotask(() => {
          if (this.readyState !== BrowserTestEventSource.CONNECTING) {
            return;
          }
          this.readyState = BrowserTestEventSource.OPEN;
          this.onopen?.call(this as unknown as EventSource, new Event("open"));
        });
      }

      addEventListener(type: string, listener: EventSourceListener): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: EventSourceListener): void {
        const listeners = this.listeners.get(type) ?? [];
        this.listeners.set(
          type,
          listeners.filter((entry) => entry !== listener),
        );
      }

      close(): void {
        this.readyState = BrowserTestEventSource.CLOSED;
      }

      dispatchError(): void {
        if (this.readyState === BrowserTestEventSource.CLOSED) {
          return;
        }
        const event = new Event("error");
        this.onerror?.call(this as unknown as EventSource, event);
        for (const listener of this.listeners.get("error") ?? []) {
          if (typeof listener === "function") {
            listener.call(this as unknown as EventSource, event);
          } else {
            listener.handleEvent(event);
          }
        }
      }

      dispatch(type: string, data: string, lastEventId: string): void {
        if (this.readyState === BrowserTestEventSource.CLOSED) {
          return;
        }
        const event = new MessageEvent<string>(type, {
          data,
          lastEventId,
        });
        if (type === "message") {
          this.onmessage?.call(this as unknown as EventSource, event);
        }
        for (const listener of this.listeners.get(type) ?? []) {
          if (typeof listener === "function") {
            listener.call(this as unknown as EventSource, event);
          } else {
            listener.handleEvent(event);
          }
        }
      }
    }

    const sources: BrowserTestEventSource[] = [];
    window.__agentTeamsBrowserTestEventSource = {
      dispatch: (
        sourceIndex: number | null,
        type: string,
        data: string,
        lastEventId: string,
      ) => {
        const source = sourceAt(sourceIndex);
        if (source === undefined) {
          throw new Error("Missing browser test EventSource.");
        }
        source.dispatch(type, data, lastEventId);
      },
      dispatchError: (sourceIndex: number | null) => {
        const source = sourceAt(sourceIndex);
        if (source === undefined) {
          throw new Error("Missing browser test EventSource for error.");
        }
        source.dispatchError();
      },
      openCount: () =>
        sources.filter(
          (source) => source.readyState !== BrowserTestEventSource.CLOSED,
        ).length,
      urls: () => sources.map((source) => source.url),
    };

    function sourceAt(
      sourceIndex: number | null,
    ): BrowserTestEventSource | undefined {
      if (sourceIndex !== null) {
        return sources[sourceIndex];
      }
      return sources
        .filter((source) => source.readyState !== BrowserTestEventSource.CLOSED)
        .at(-1);
    }

    window.EventSource = BrowserTestEventSource as unknown as typeof EventSource;
  });
}

export async function dispatchEventSourceMessage(
  page: Page,
  dispatch: MockEventSourceDispatch,
): Promise<void> {
  await page.evaluate(
    ({ data, lastEventId, sourceIndex, type }) => {
      const harness = window.__agentTeamsBrowserTestEventSource;
      if (harness === undefined) {
        throw new Error("Browser test EventSource harness was not installed.");
      }
      harness.dispatch(
        sourceIndex,
        type,
        JSON.stringify(data),
        lastEventId,
      );
    },
    {
      data: dispatch.data,
      lastEventId: dispatch.lastEventId ?? "",
      sourceIndex: dispatch.sourceIndex ?? null,
      type: dispatch.type,
    },
  );
}

export async function dispatchEventSourceError(
  page: Page,
  sourceIndex: number | null = null,
): Promise<void> {
  await page.evaluate((targetSourceIndex) => {
    const harness = window.__agentTeamsBrowserTestEventSource;
    if (harness === undefined) {
      throw new Error("Browser test EventSource harness was not installed.");
    }
    harness.dispatchError(targetSourceIndex);
  }, sourceIndex);
}

export async function waitForEventSourceUrl(
  page: Page,
  pattern: RegExp,
): Promise<string> {
  await expect
    .poll(() => eventSourceUrls(page))
    .toContainEqual(expect.stringMatching(pattern));
  const urls = await eventSourceUrls(page);
  const url = urls.find((candidate) => pattern.test(candidate));
  if (url === undefined) {
    throw new Error(`Expected EventSource URL matching ${pattern.source}.`);
  }
  return url;
}

export async function eventSourceUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__agentTeamsBrowserTestEventSource?.urls() ?? []);
}

export async function eventSourceOpenCount(page: Page): Promise<number> {
  return page.evaluate(
    () => window.__agentTeamsBrowserTestEventSource?.openCount() ?? 0,
  );
}

export async function waitForEventSourceOpenCount(
  page: Page,
  count: number,
): Promise<void> {
  await expect.poll(() => eventSourceOpenCount(page)).toBe(count);
}

export async function mockShellApi(
  page: Page,
  appBaseUrl: string,
  unhandledApiRoutes: string[],
  options: MockShellApiOptions = {},
): Promise<void> {
  const sessionTitle = options.sessionTitle ?? "V2 shell route switch";
  await page.route(apiRoutePattern(appBaseUrl), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = route.request().method();
    const context: MockApiRouteContext = {
      fulfillJson: (body, status) => fulfillJson(route, body, status),
      method,
      path,
      route,
      url,
    };
    if (options.handleRequest !== undefined && await options.handleRequest(context)) {
      return;
    }
    if (method !== "GET") {
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
      await fulfillJson(route, { language: "en-US" });
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
      await fulfillJson(route, [workspaceRecord()]);
      return;
    }
    if (path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
      await fulfillJson(route, {
        has_more: false,
        items: [sessionSidebarRecord(sessionTitle)],
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
      await fulfillJson(route, [sessionSidebarRecord(sessionTitle)]);
      return;
    }
    if (path === `/sessions/${SESSION_ID}`) {
      await fulfillJson(route, {
        can_switch_mode: true,
        created_at: "2026-06-25T08:00:00Z",
        normal_model_profile: null,
        normal_root_role_id: "MainAgent",
        orchestration_preset_id: null,
        session_id: SESSION_ID,
        session_mode: "normal",
        title: sessionTitle,
        updated_at: "2026-06-25T08:30:00Z",
        workspace_id: WORKSPACE_ID,
      });
      return;
    }
    if (path === `/sessions/${SESSION_ID}/messages`) {
      await fulfillJson(route, []);
      return;
    }
    if (path === `/sessions/${SESSION_ID}/subagents`) {
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
    unhandledApiRoutes.push(`${method} ${path}${url.search}`);
    await fulfillJson(route, { detail: `Unhandled TS browser API route: ${path}` }, 404);
  });
}

export async function waitForV1Shell(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open new interface" })).toBeVisible();
  await expectBootstrapReady(page);
  await expect(page.locator(".initial-runtime-loader")).toBeHidden();
  await expect(page.locator("#backend-status")).toHaveAttribute("data-status", "online");
  await expect(page.locator("#runtime-loading-banner")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#runtime-loading-banner")).not.toHaveClass(/is-visible/);
  await expect(page.locator("text=Unhandled TS browser API route")).toHaveCount(0);
}

export async function waitForV2Shell(page: Page): Promise<void> {
  await expect(page.locator(".at-shell")).toBeVisible();
  await expect(page.getByRole("link", { name: "V1" })).toBeVisible();
  await expectBootstrapReady(page);
  await expect(page.locator(".initial-app-loader")).toBeHidden();
}

export function expectNoUnhandledApiRoutes(unhandledApiRoutes: string[]): void {
  expect(unhandledApiRoutes, `Unhandled API routes: ${unhandledApiRoutes.join(", ")}`).toEqual([]);
}

export async function expectComposerControlsDoNotOverlap(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const controls = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".at-composer-control-set > .ant-space-item, .at-composer-controls > .ant-space:last-child",
            ),
          )
            .filter((element) => {
              const style = window.getComputedStyle(element);
              const box = element.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                box.width > 0 &&
                box.height > 0
              );
            })
            .map((element, index) => {
              const box = element.getBoundingClientRect();
              return {
                bottom: box.bottom,
                index,
                label: element.textContent?.replace(/\s+/g, " ").trim() || element.className,
                left: box.left,
                right: box.right,
                top: box.top,
              };
            });
          const overlaps: string[] = [];
          for (const current of controls) {
            for (const next of controls.slice(current.index + 1)) {
              const xOverlap = Math.min(current.right, next.right) - Math.max(current.left, next.left);
              const yOverlap = Math.min(current.bottom, next.bottom) - Math.max(current.top, next.top);
              if (xOverlap > 1 && yOverlap > 1) {
                overlaps.push(`${current.label} overlaps ${next.label}`);
              }
            }
          }
          return overlaps;
        }),
      { message: "composer controls should not visually overlap" },
    )
    .toEqual([]);
}

export async function expectNoDocumentScroll(
  page: Page,
  message: string,
): Promise<void> {
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

export async function fulfillJson(
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

function workspaceRecord(): Record<string, unknown> {
  return {
    display_name: "agent-teams",
    last_session_id: SESSION_ID,
    path: "C:/Users/yex/Documents/workspace/agent-teams",
    updated_at: "2026-06-25T08:00:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function sessionSidebarRecord(title: string): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-25T08:00:00Z",
    message_count: 2,
    session_id: SESSION_ID,
    title,
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

async function expectBootstrapReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.bootstrapState))
    .toBe("ready");
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
