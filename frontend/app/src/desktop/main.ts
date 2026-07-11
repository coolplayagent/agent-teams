import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";

import {
  buildDesktopBackendPlan,
  type DesktopBackendPlan,
  type DesktopBackendStatus,
} from "./backendPlan.js";
import { normalizeExternalHttpUrl } from "./externalLinks.js";
import { selectAvailableDesktopPort } from "./ports.js";
import { bundledBackendExecutable } from "./releasePaths.js";
import { buildDesktopWindowOptions } from "./windowOptions.js";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStatus: DesktopBackendStatus = {
  baseUrl: "",
  message: "Backend has not started.",
  state: "starting",
};
let appQuitting = false;
const desktopAutoQuitAfterReadyEnv = "AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS";
const desktopAutoQuitTraceEnv = "AGENT_TEAMS_DESKTOP_AUTO_QUIT_TRACE";
const desktopCopyTextLogEnv = "AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG";
const desktopOpenExternalLogEnv = "AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG";
const desktopTestModeEnv = "AGENT_TEAMS_DESKTOP_TEST_MODE";

app.whenReady().then(() => {
  registerIpcHandlers();
  void startDesktopApp();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void startDesktopApp();
  }
});

app.on("before-quit", () => {
  appQuitting = true;
  stopManagedBackend();
});

async function startDesktopApp(): Promise<void> {
  mainWindow = createMainWindow();
  await loadDesktopApp(mainWindow);
}

async function loadDesktopApp(window: BrowserWindow): Promise<void> {
  const plan = await buildRuntimeBackendPlan();
  setBackendStatus({
    baseUrl: plan.baseUrl,
    message: "Starting backend.",
    state: "starting",
  });
  await window.loadURL(loadingDocumentUrl(plan));

  try {
    await ensureBackendReady(plan);
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message: "Backend ready.",
      state: "ready",
    });
    const appLoad = window.loadURL(plan.appUrl);
    scheduleAutoQuitAfterReady();
    await appLoad;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend startup failed.";
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message,
      state: "failed",
    });
    await window.loadURL(failureDocumentUrl(plan, message));
  }
}

async function buildRuntimeBackendPlan(): Promise<DesktopBackendPlan> {
  const hasExplicitEndpoint = Boolean(
    process.env.AGENT_TEAMS_BACKEND_URL?.trim()
    || process.env.AGENT_TEAMS_BACKEND_PORT?.trim(),
  );
  const defaultPort = hasExplicitEndpoint
    ? undefined
    : await selectAvailableDesktopPort("127.0.0.1");
  const managedCommand = bundledBackendExecutable({
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  }) ?? undefined;
  return buildDesktopBackendPlan({
    defaultPort,
    env: process.env,
    managedCommand,
  });
}

function createMainWindow(): BrowserWindow {
  const desktopDir = dirname(fileURLToPath(import.meta.url));
  const preload = join(desktopDir, "preload.cjs");
  const window = new BrowserWindow(buildDesktopWindowOptions(preload));

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle("agent-teams:copy-text", (_event, text: unknown) => {
    if (typeof text !== "string") {
      throw new Error("Copied text must be a string.");
    }
    copyText(text);
  });
  ipcMain.handle("agent-teams:get-version", () => app.getVersion());
  ipcMain.handle("agent-teams:get-backend-status", () => backendStatus);
  ipcMain.handle("agent-teams:open-external", async (_event, url: unknown) => {
    if (typeof url !== "string") {
      throw new Error("External URL must be a string.");
    }
    await openExternalUrl(url);
  });
  ipcMain.handle("agent-teams:retry-startup", async () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      await startDesktopApp();
      return;
    }
    await loadDesktopApp(mainWindow);
  });
}

async function ensureBackendReady(plan: DesktopBackendPlan): Promise<void> {
  if (await isBackendHealthy(plan.healthUrl)) {
    return;
  }
  if (plan.ownership === "external") {
    await waitForBackend(plan);
    return;
  }
  startManagedBackend(plan);
  await waitForBackend(plan);
}

function startManagedBackend(plan: DesktopBackendPlan): void {
  if (plan.command === null || backendProcess !== null) {
    return;
  }
  backendProcess = spawn(plan.command, plan.args, {
    cwd: isAbsolute(plan.command) ? dirname(plan.command) : undefined,
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  });
  backendProcess.once("exit", (code, signal) => {
    backendProcess = null;
    if (appQuitting) {
      setBackendStatus({
        baseUrl: plan.baseUrl,
        message: "Backend stopped.",
        state: "stopped",
      });
      return;
    }
    const detail = signal !== null ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message: `Backend process exited with ${detail}.`,
      state: "failed",
    });
  });
}

function stopManagedBackend(): void {
  if (backendProcess === null) {
    return;
  }
  backendProcess.kill();
  backendProcess = null;
}

function scheduleAutoQuitAfterReady(): void {
  if (!isDesktopTestMode()) {
    return;
  }
  const delayMs = readNonNegativeInteger(process.env[desktopAutoQuitAfterReadyEnv]);
  if (delayMs === null) {
    return;
  }
  traceAutoQuit(`scheduled:${delayMs}`);
  setTimeout(() => {
    traceAutoQuit("fired");
    appQuitting = true;
    stopManagedBackend();
    process.exit(0);
  }, delayMs);
}

function traceAutoQuit(message: string): void {
  if (!isDesktopTestMode()) {
    return;
  }
  const tracePath = process.env[desktopAutoQuitTraceEnv]?.trim();
  if (tracePath === undefined || tracePath === "") {
    return;
  }
  appendFileSync(tracePath, `${message}\n`, { encoding: "utf-8" });
}

function readNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function waitForBackend(plan: DesktopBackendPlan): Promise<void> {
  const deadline = Date.now() + plan.startupTimeoutMs;
  while (Date.now() <= deadline) {
    if (await isBackendHealthy(plan.healthUrl)) {
      return;
    }
    await sleep(plan.healthPollMs);
  }
  throw new Error(`Backend was not ready at ${plan.baseUrl}.`);
}

async function isBackendHealthy(healthUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function setBackendStatus(status: DesktopBackendStatus): void {
  backendStatus = status;
  mainWindow?.webContents.send("agent-teams:backend-status", status);
}

async function openExternalUrl(url: string): Promise<void> {
  const normalizedUrl = normalizeExternalHttpUrl(url);
  const externalLogPath = process.env[desktopOpenExternalLogEnv]?.trim();
  if (isDesktopTestMode() && externalLogPath !== undefined && externalLogPath !== "") {
    appendFileSync(externalLogPath, `${normalizedUrl}\n`, { encoding: "utf-8" });
    return;
  }
  await shell.openExternal(normalizedUrl);
}

function copyText(text: string): void {
  const copyLogPath = process.env[desktopCopyTextLogEnv]?.trim();
  if (isDesktopTestMode() && copyLogPath !== undefined && copyLogPath !== "") {
    appendFileSync(copyLogPath, `${text}\n`, { encoding: "utf-8" });
    return;
  }
  clipboard.writeText(text);
}

function isDesktopTestMode(): boolean {
  return process.env[desktopTestModeEnv] === "1";
}

function loadingDocumentUrl(plan: DesktopBackendPlan): string {
  return dataDocumentUrl(
    "Agent Teams",
    `<main class="desktop-status" aria-live="polite"><div class="status-label">Starting</div><h1>Agent Teams</h1><p>Starting local backend at ${escapeHtml(
      plan.baseUrl,
    )}.</p></main>`,
  );
}

function failureDocumentUrl(plan: DesktopBackendPlan, message: string): string {
  const diagnostic = `Backend: ${plan.baseUrl}\nStatus: ${message}`;
  return dataDocumentUrl(
    "Agent Teams startup failed",
    `<main class="desktop-status is-failed" role="alert"><div class="status-label">Agent Teams</div><h1>Startup failed</h1><p>${escapeHtml(
      message,
    )}</p><code id="desktop-diagnostic">${escapeHtml(
      diagnostic,
    )}</code><div class="status-actions"><button type="button" onclick="window.agentTeamsDesktop.copyText(document.getElementById('desktop-diagnostic')?.innerText ?? '')">Copy diagnostics</button><button type="button" onclick="window.agentTeamsDesktop.retryStartup()">Retry startup</button></div></main>`,
  );
}

function dataDocumentUrl(title: string, body: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f3; color: #1f2328; font: 14px system-ui, sans-serif; }
      .desktop-status { display: grid; gap: 12px; width: min(480px, calc(100vw - 48px)); padding: 24px; border: 1px solid #d8d6cf; border-radius: 8px; background: #ffffff; }
      .status-label { color: #5b625f; font-size: 12px; }
      h1 { margin: 0; font-size: 22px; font-weight: 650; }
      p { margin: 0; color: #656d76; line-height: 1.45; }
      code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; border: 1px solid #e5e2da; border-radius: 6px; padding: 10px; background: #faf9f5; color: #24292f; }
      .status-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      button { height: 32px; border: 1px solid #d0d7de; border-radius: 6px; background: #ffffff; color: #24292f; font: inherit; padding: 0 12px; }
      button:hover { background: #f6f8fa; }
    </style>
  </head>
  <body>${body}</body>
</html>`)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
