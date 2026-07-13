import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const frontendRoot = join(repoRoot, "frontend", "dist");
const testMainScript = join(packageRoot, "dist-desktop", "desktop", "testMain.js");
const desktopArtifactRoot = join(repoRoot, ".tmp", "frontend-desktop");
const desktopReleaseRoot = join(repoRoot, ".tmp", "desktop-release");
const packagedAppRoot = join(desktopReleaseRoot, "win-unpacked");
const packagedExecutable = join(packagedAppRoot, "Agent Teams.exe");
const packagedBackendExecutable = join(
  packagedAppRoot,
  "resources",
  "backend",
  "relay-teams-backend.exe",
);
const packagedRendererEntry = join(
  packagedAppRoot,
  "resources",
  "backend",
  "_internal",
  "relay_teams",
  "frontend",
  "dist",
  "index.html",
);
const packagedAsar = join(packagedAppRoot, "resources", "app.asar");

const waitTimeoutMs = 20_000;
const workspaceId = "workspace-desktop-smoke";
const sessionId = "session-desktop-smoke";
const desktopApiKeys = [
  "copyText",
  "getBackendStatus",
  "getVersion",
  "onBackendStatus",
  "openExternal",
  "retryStartup",
];

interface DesktopBackendServer {
  close: () => Promise<void>;
  url: string;
}

interface ElectronLaunch {
  debugPort: number;
  process: ChildProcessWithoutNullStreams;
}

interface BrowserDiagnostics {
  entries: string[];
}

type JsonResponse = null | boolean | number | string | JsonResponse[] | {
  [key: string]: JsonResponse;
};

test.describe.configure({ mode: "serial" });
test.skip(
  !hasGraphicalSession(),
  "Electron smoke test requires a graphical desktop session.",
);
test.skip(!existsSync(electronExecutable()), `Electron executable is not installed.`);

test("packaged distribution starts bundled backend and survives renderer refresh", async () => {
  test.skip(
    !existsSync(packagedExecutable),
    "Run npm run desktop:release before the packaged distribution smoke.",
  );

  expect(existsSync(packagedBackendExecutable)).toBe(true);
  expect(existsSync(packagedRendererEntry)).toBe(true);
  expect(existsSync(packagedAsar)).toBe(true);
  expect(
    existsSync(join(desktopReleaseRoot, "Agent-Teams-Setup-0.0.3-dev.0-x64.exe")),
  ).toBe(true);

  const electron = await launchPackagedElectron();
  let backendUrl = "";
  try {
    const browser = await connectToElectron(electron.debugPort);
    try {
      const page = await firstPage(browser);
      await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+\//, {
        timeout: 90_000,
      });
      backendUrl = new URL(page.url()).origin;

      await expect(page.locator(".at-shell")).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => Object.keys(window.agentTeamsDesktop ?? {}).sort()))
        .toEqual([...desktopApiKeys].sort());
      expect(await page.evaluate(() => typeof window.process)).toBe("undefined");
      expect(await page.evaluate(() => window.agentTeamsDesktop?.getVersion()))
        .toBe("0.0.3-dev.0");
      await expect.poll(async () => {
        const response = await fetch(`${backendUrl}/api/system/health`);
        return response.ok;
      }).toBe(true);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".at-shell")).toBeVisible({ timeout: 60_000 });
      await saveDesktopScreenshot(page, "electron-packaged-renderer.png");

      await page.evaluate(() => window.close());
      await waitForProcessExit(electron.process, 20_000);
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    stopElectron(electron.process);
  }

  expect(backendUrl).not.toBe("");
  await waitForBackendDown(backendUrl);
});

test("electron loads renderer with isolated preload", async () => {
  expect(
    existsSync(testMainScript),
    "Run npm run desktop:build before desktop smoke tests.",
  ).toBe(true);

  const backend = await serveDesktopBackend(true);
  const electron = await launchElectron(backend.url);
  try {
    const browser = await connectToElectron(electron.debugPort);
    try {
      const page = await firstPage(browser);
      const diagnostics = capturePageDiagnostics(page);
      await page.waitForURL(`${backend.url}/`, { timeout: waitTimeoutMs });

      try {
        await expect(page.locator(".at-shell")).toBeVisible({
          timeout: waitTimeoutMs,
        });
      } catch (error) {
        await saveDesktopScreenshot(page, "electron-renderer-failed.png");
        throw new Error(await desktopPageDiagnostics(page, diagnostics), {
          cause: error,
        });
      }

      await expect(page.locator(".at-sidebar-new-session")).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(page.getByText("agent-teams").first()).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(page.locator(".at-sidebar-backend-status.is-online")).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(page.getByText("Electron renderer smoke")).toBeVisible({
        timeout: waitTimeoutMs,
      });

      const exposedKeys = await page.evaluate(() =>
        Object.keys(window.agentTeamsDesktop ?? {}).sort(),
      );
      expect(exposedKeys).toEqual([...desktopApiKeys].sort());
      await expect
        .poll(() => page.evaluate(() => typeof window.require))
        .toBe("undefined");
      await expect
        .poll(() => page.evaluate(() => typeof window.process))
        .toBe("undefined");

      const appVersion = await page.evaluate(() =>
        window.agentTeamsDesktop?.getVersion(),
      );
      expect(appVersion?.trim()).toBeTruthy();

      const backendStatus = await page.evaluate(() =>
        window.agentTeamsDesktop?.getBackendStatus(),
      );
      expect(backendStatus).toEqual({
        baseUrl: backend.url,
        message: "Backend ready.",
        state: "ready",
      });

      await saveDesktopScreenshot(page, "electron-renderer.png");
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    stopElectron(electron.process);
    await backend.close();
  }
});

test("electron shows backend startup failure", async () => {
  const copyLog = join(desktopArtifactRoot, "copy-diagnostics.log");
  removeIfExists(copyLog);

  const backend = await serveDesktopBackend(false);
  const electron = await launchElectron(backend.url, {
    AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG: copyLog,
    AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS: "900",
  });
  try {
    const browser = await connectToElectron(electron.debugPort);
    try {
      const page = await firstPage(browser);
      const diagnostics = capturePageDiagnostics(page);

      await expect(page.getByRole("heading", { name: "Startup failed" })).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(
        page.getByRole("button", { name: "Copy diagnostics" }),
      ).toBeVisible({ timeout: waitTimeoutMs });
      await expect(page.getByRole("button", { name: "Retry startup" })).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(
        page.getByText(`Backend was not ready at ${backend.url}.`, { exact: true }),
      ).toBeVisible({ timeout: waitTimeoutMs });

      const backendStatus = await page.evaluate(() =>
        window.agentTeamsDesktop?.getBackendStatus(),
      );
      expect(backendStatus).toEqual({
        baseUrl: backend.url,
        message: `Backend was not ready at ${backend.url}.`,
        state: "failed",
      });

      await page.getByRole("button", { name: "Copy diagnostics" }).click();
      await expect.poll(() => readTextIfExists(copyLog)).toContain(`Backend: ${backend.url}`);

      await page.getByRole("button", { name: "Retry startup" }).click();
      await expect(page.locator(".status-label", { hasText: "Starting" })).toBeVisible({
        timeout: waitTimeoutMs,
      });
      await expect(page.getByRole("heading", { name: "Startup failed" })).toBeVisible({
        timeout: waitTimeoutMs,
      });
      expect(diagnostics.entries.filter((entry) => entry.startsWith("pageerror:"))).toEqual([]);

      await saveDesktopScreenshot(page, "electron-startup-failed.png");
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    stopElectron(electron.process);
    await backend.close();
  }
});

test("electron open external uses preload main boundary", async () => {
  const externalLog = join(desktopArtifactRoot, "open-external.log");
  removeIfExists(externalLog);

  const backend = await serveDesktopBackend(true);
  const electron = await launchElectron(backend.url, {
    AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG: externalLog,
  });
  try {
    const browser = await connectToElectron(electron.debugPort);
    try {
      const page = await firstPage(browser);
      await page.waitForURL(`${backend.url}/`, { timeout: waitTimeoutMs });

      await page.getByRole("link", { name: "Desktop docs" }).click();
      await expect
        .poll(() => readTextIfExists(externalLog))
        .toContain("https://example.com/docs?source=markdown#desktop");

      await page.evaluate(async () => {
        await window.agentTeamsDesktop?.openExternal(
          "https://example.com/docs?source=electron#desktop",
        );
      });
      await expect
        .poll(() => readTextIfExists(externalLog))
        .toContain("https://example.com/docs?source=electron#desktop");

      const invalidResult = await page.evaluate(async () => {
        try {
          await window.agentTeamsDesktop?.openExternal("file:///C:/Users/yex/token.txt");
          return "resolved";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      });
      expect(invalidResult).toContain(
        "Only http and https links can be opened externally.",
      );
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    stopElectron(electron.process);
    await backend.close();
  }
});

test("electron managed backend starts and stops with main lifecycle", async () => {
  const backendPort = await availablePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const requestLog = join(desktopArtifactRoot, `managed-${backendPort}.log`);
  const traceLog = join(desktopArtifactRoot, `auto-quit-${backendPort}.log`);
  const stubScript = writeManagedBackendStub();
  removeIfExists(requestLog);
  removeIfExists(traceLog);

  const electron = await launchElectron(null, {
    AGENT_TEAMS_BACKEND_COMMAND: process.execPath,
    AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON: JSON.stringify([
      stubScript,
      "--host",
      "{host}",
      "--port",
      "{port}",
    ]),
    AGENT_TEAMS_BACKEND_HOST: "127.0.0.1",
    AGENT_TEAMS_BACKEND_PORT: String(backendPort),
    AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS: "750",
    AGENT_TEAMS_DESKTOP_AUTO_QUIT_TRACE: traceLog,
    AGENT_TEAMS_DESKTOP_MANAGED_REQUEST_LOG: requestLog,
    AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS: "4000",
  });
  try {
    await expect.poll(() => readTextIfExists(traceLog), { timeout: waitTimeoutMs })
      .toContain("fired");
    const traceLogText = readTextIfExists(traceLog);
    expect(traceLogText).toContain("scheduled:750");

    const requestLogText = readTextIfExists(requestLog);
    expect(requestLogText).toContain("/api/system/health");
    expect(requestLogText).toMatch(/(?:^|\r?\n)\/(?:\r?\n|$)/);
    await waitForBackendDown(backendUrl);
  } finally {
    stopElectron(electron.process);
  }
});

async function serveDesktopBackend(healthy: boolean): Promise<DesktopBackendServer> {
  return new Promise((resolveServer) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/api/system/health") {
        sendJson(response, healthy ? { status: "ok" } : { status: "starting" }, healthy ? 200 : 503);
        return;
      }
      if (requestUrl.pathname.startsWith("/api/")) {
        sendJson(response, apiResponse(requestUrl.pathname));
        return;
      }
      serveStaticAppFile(response, requestUrl.pathname);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected desktop backend server to bind a TCP port.");
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

function apiResponse(path: string): JsonResponse {
  if (path === "/api/system/health" || path === "/api/system/live") {
    return { status: "ok" };
  }
  if (path === "/api/system/control-plane") {
    return { enabled: false };
  }
  if (path === "/api/workspaces") {
    return [
      {
        display_name: "agent-teams",
        last_session_id: sessionId,
        path: "C:/Users/yex/Documents/workspace/agent-teams",
        root_path: "C:/Users/yex/Documents/workspace/agent-teams",
        updated_at: "2026-06-25T09:00:00Z",
        workspace_id: workspaceId,
      },
    ];
  }
  if (path === "/api/sessions/sidebar") {
    return [sessionSidebarRecord()];
  }
  if (path === `/api/workspaces/${workspaceId}/sessions/sidebar`) {
    return {
      has_more: false,
      items: [sessionSidebarRecord()],
      next_cursor: null,
    };
  }
  if (path === `/api/sessions/${sessionId}`) {
    return {
      can_switch_mode: true,
      normal_model_profile: "default",
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: "default",
      session_id: sessionId,
      session_mode: "normal",
      title: "Desktop smoke",
      workspace_id: workspaceId,
    };
  }
  if (path === `/api/sessions/${sessionId}/messages`) {
    const text = "Electron renderer smoke [Desktop docs](https://example.com/docs?source=markdown#desktop)";
    return [
      {
        content: text,
        created_at: "2026-06-25T09:01:30Z",
        message_id: "message-desktop-smoke",
        parts: [{ kind: "text", text }],
        role: "assistant",
        role_id: "MainAgent",
        run_id: "run-desktop-smoke",
        trace_id: "trace-desktop-smoke",
      },
    ];
  }
  if (path === `/api/sessions/${sessionId}/rounds`) {
    return {
      has_more: false,
      items: [
        {
          created_at: "2026-06-25T09:01:00Z",
          id: "round-desktop-smoke",
          prompt: "Open desktop",
          status: "completed",
        },
      ],
      next_cursor: null,
    };
  }
  if (path === `/api/sessions/${sessionId}/token-usage`) {
    return { by_role: {}, input_tokens: 0, output_tokens: 0 };
  }
  if (path === `/api/sessions/${sessionId}/recovery`) {
    return {
      active_run: null,
      background_tasks: [],
      paused_subagents: [],
      pending_tool_approvals: [],
      pending_user_questions: [],
      recoverable_stopped_run: null,
    };
  }
  if (
    path === `/api/sessions/${sessionId}/agents`
    || path === `/api/sessions/${sessionId}/subagents`
    || path === `/api/sessions/${sessionId}/tasks`
    || path === "/api/automation/projects"
  ) {
    return [];
  }
  if (path === "/api/roles:options") {
    return {
      coordinator_role_id: "Coordinator",
      main_agent_role_id: "MainAgent",
      normal_mode_roles: [
        {
          description: "Default desktop role.",
          name: "Default",
          role_id: "MainAgent",
        },
      ],
      subagent_roles: [],
    };
  }
  if (path === "/api/system/configs/general") {
    return { shell_safety_policy_enabled: true };
  }
  if (path === "/api/system/configs/ui-language") {
    return { language: "en" };
  }
  if (path === "/api/system/configs/model/profiles") {
    return { active_profile_id: "default", profiles: [] };
  }
  if (path === "/api/system/configs/orchestration") {
    return { default_preset_id: "default", presets: [] };
  }
  if (path === "/api/speech/config") {
    return {
      configured: false,
      language: "en",
      supported_models: [],
    };
  }
  return { detail: `Unhandled desktop smoke API route: ${path}` };
}

function sessionSidebarRecord(): JsonResponse {
  return {
    active_run_id: null,
    active_run_phase: "",
    active_run_status: "",
    created_at: "2026-06-25T09:00:00Z",
    message_count: 1,
    session_id: sessionId,
    session_mode: "normal",
    title: "Desktop smoke",
    updated_at: "2026-06-25T09:01:00Z",
    workspace_id: workspaceId,
  };
}

function serveStaticAppFile(response: ServerResponse, requestPath: string): void {
  const target = resolveDesktopFile(decodeURIComponent(requestPath));
  if (target === null || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentType(target) });
  createReadStream(target).pipe(response);
}

function resolveDesktopFile(requestPath: string): string | null {
  const candidate = join(frontendRoot, requestPath.slice(1));
  const target = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(frontendRoot, "index.html");
  const resolvedTarget = resolve(target);
  return resolvedTarget.startsWith(resolve(frontendRoot)) ? resolvedTarget : null;
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".json") || filePath.endsWith(".map")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function sendJson(response: ServerResponse, payload: JsonResponse, status = 200): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  response.end(body);
}

async function launchElectron(
  backendUrl: string | null,
  extraEnv: Record<string, string> = {},
): Promise<ElectronLaunch> {
  const debugPort = await availablePort();
  const userDataDir = join(desktopArtifactRoot, `user-data-${debugPort}`);
  mkdirSync(userDataDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_TEAMS_BACKEND_HEALTH_POLL_MS: "100",
    ...extraEnv,
  };
  if (backendUrl !== null) {
    env.AGENT_TEAMS_BACKEND_URL = backendUrl;
  }
  const child = spawn(
    electronExecutable(),
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      testMainScript,
    ],
    {
      cwd: packageRoot,
      env,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  await waitForCdp(debugPort, child);
  return { debugPort, process: child };
}

async function launchPackagedElectron(): Promise<ElectronLaunch> {
  const debugPort = await availablePort();
  const userDataDir = join(desktopArtifactRoot, `packaged-user-data-${debugPort}`);
  mkdirSync(userDataDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_TEAMS_BACKEND_HEALTH_POLL_MS: "100",
    AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS: "90000",
  };
  delete env.AGENT_TEAMS_BACKEND_COMMAND;
  delete env.AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON;
  delete env.AGENT_TEAMS_BACKEND_PORT;
  delete env.AGENT_TEAMS_BACKEND_URL;

  const child = spawn(
    packagedExecutable,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
    ],
    {
      cwd: packagedAppRoot,
      env,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  await waitForCdp(debugPort, child);
  return { debugPort, process: child };
}

async function connectToElectron(port: number): Promise<Browser> {
  const websocketUrl = await cdpWebsocketUrl(port);
  return chromium.connectOverCDP(websocketUrl);
}

async function cdpWebsocketUrl(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  const payload = await response.json() as { webSocketDebuggerUrl?: unknown };
  if (typeof payload.webSocketDebuggerUrl !== "string") {
    throw new Error("Electron CDP version endpoint did not expose a websocket URL.");
  }
  return payload.webSocketDebuggerUrl;
}

async function firstPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + 10_000;
  while (Date.now() <= deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages()[0];
      if (page !== undefined) {
        return page;
      }
    }
    await sleep(100);
  }
  throw new Error("Electron did not expose a renderer page over CDP.");
}

function capturePageDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = { entries: [] };
  page.on("console", (message) => {
    diagnostics.entries.push(`console:${message.type()}:${message.text()}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.entries.push(`pageerror:${String(error)}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.entries.push(
      `requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText ?? ""}`,
    );
  });
  return diagnostics;
}

async function desktopPageDiagnostics(
  page: Page,
  diagnostics: BrowserDiagnostics,
): Promise<string> {
  const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
  const rootHtml = await page.locator("#root").evaluate((node) => node.innerHTML).catch(() => "");
  const bootstrapState = await page.evaluate(() => document.body.dataset.bootstrapState);
  const desktopApiType = await page.evaluate(() => typeof window.agentTeamsDesktop);
  return [
    "Electron renderer did not show the application shell.",
    `url: ${page.url()}`,
    `title: ${await page.title()}`,
    `bootstrap: ${bootstrapState ?? ""}`,
    `desktop_api: ${desktopApiType}`,
    `body:\n${bodyText}`,
    `root_html:\n${rootHtml}`,
    "events:",
    ...diagnostics.entries,
  ].join("\n");
}

async function saveDesktopScreenshot(page: Page, filename: string): Promise<void> {
  mkdirSync(desktopArtifactRoot, { recursive: true });
  await page.screenshot({ path: join(desktopArtifactRoot, filename) });
}

async function waitForCdp(
  port: number,
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() <= deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        [
          "Electron exited before CDP was ready.",
          `stdout:\n${readStreamNow(child.stdout)}`,
          `stderr:\n${readStreamNow(child.stderr)}`,
        ].join("\n"),
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Electron CDP endpoint did not open on port ${port}.`);
}

function stopElectron(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null) {
    return;
  }
  child.kill();
}

async function waitForProcessExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await sleep(100);
  }
  throw new Error("Packaged Electron process did not exit after its window closed.");
}

function electronExecutable(): string {
  const electronRoot = join(packageRoot, "node_modules", "electron", "dist");
  if (process.platform === "win32") {
    return join(electronRoot, "electron.exe");
  }
  if (process.platform === "darwin") {
    return join(electronRoot, "Electron.app", "Contents", "MacOS", "Electron");
  }
  return join(electronRoot, "electron");
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        rejectPort(new Error("Expected TCP server to expose a numeric port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

function writeManagedBackendStub(): string {
  mkdirSync(desktopArtifactRoot, { recursive: true });
  const stubPath = join(desktopArtifactRoot, "managed-backend-stub.mjs");
  writeFileSync(
    stubPath,
    `
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const host = argValue("--host");
const port = Number.parseInt(argValue("--port"), 10);

const server = createServer((request, response) => {
  const requestLog = process.env.AGENT_TEAMS_DESKTOP_MANAGED_REQUEST_LOG;
  if (requestLog) {
    appendFileSync(requestLog, \`\${request.url}\\n\`, { encoding: "utf-8" });
  }
  if (request.url === "/api/system/health") {
    writeJson(response, { status: "ok" });
    return;
  }
  if (request.url === "/") {
    const body = "<!doctype html><html><body><main><h1>Managed backend ready</h1></main></body></html>";
    response.writeHead(200, {
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(body);
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

server.listen(port, host);

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) {
    throw new Error(\`Missing required argument: \${name}\`);
  }
  return process.argv[index + 1];
}

function writeJson(response, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(200, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  response.end(body);
}
`.trimStart(),
    { encoding: "utf-8" },
  );
  return stubPath;
}

async function waitForBackendDown(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() <= deadline) {
    if (!await isBackendHealthy(baseUrl)) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Managed backend was still healthy at ${baseUrl}.`);
}

async function isBackendHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/system/health`, {
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf-8");
}

function removeIfExists(path: string): void {
  if (existsSync(path)) {
    writeFileSync(path, "", { encoding: "utf-8" });
  }
}

function hasGraphicalSession(): boolean {
  return process.platform === "win32"
    || process.platform === "darwin"
    || Boolean(process.env.DISPLAY);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function readStreamNow(stream: NodeJS.ReadableStream): string {
  const path = Reflect.get(stream, "path");
  if (typeof path === "string" && existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return "";
}
