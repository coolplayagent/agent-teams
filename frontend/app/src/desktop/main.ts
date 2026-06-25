import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, shell } from "electron";

import {
  buildDesktopBackendPlan,
  type DesktopBackendPlan,
  type DesktopBackendStatus,
} from "./backendPlan.js";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStatus: DesktopBackendStatus = {
  baseUrl: "",
  message: "Backend has not started.",
  state: "starting",
};
let appQuitting = false;

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
  const plan = buildDesktopBackendPlan({ env: process.env });
  setBackendStatus({
    baseUrl: plan.baseUrl,
    message: "Starting backend.",
    state: "starting",
  });
  mainWindow = createMainWindow();
  await mainWindow.loadURL(loadingDocumentUrl(plan));

  try {
    await ensureBackendReady(plan);
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message: "Backend ready.",
      state: "ready",
    });
    await mainWindow.loadURL(plan.appUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend startup failed.";
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message,
      state: "failed",
    });
    await mainWindow.loadURL(failureDocumentUrl(plan, message));
  }
}

function createMainWindow(): BrowserWindow {
  const desktopDir = dirname(fileURLToPath(import.meta.url));
  const preload = join(desktopDir, "preload.js");
  const window = new BrowserWindow({
    height: 820,
    minHeight: 640,
    minWidth: 900,
    show: false,
    title: "Agent Teams",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true,
    },
    width: 1280,
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle("agent-teams:get-version", () => app.getVersion());
  ipcMain.handle("agent-teams:get-backend-status", () => backendStatus);
  ipcMain.handle("agent-teams:open-external", async (_event, url: unknown) => {
    if (typeof url !== "string") {
      throw new Error("External URL must be a string.");
    }
    await openExternalUrl(url);
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
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https links can be opened externally.");
  }
  await shell.openExternal(parsed.toString());
}

function loadingDocumentUrl(plan: DesktopBackendPlan): string {
  return dataDocumentUrl(
    "Agent Teams",
    `<main><h1>Agent Teams</h1><p>Starting local backend at ${escapeHtml(
      plan.baseUrl,
    )}.</p></main>`,
  );
}

function failureDocumentUrl(plan: DesktopBackendPlan, message: string): string {
  return dataDocumentUrl(
    "Agent Teams startup failed",
    `<main><h1>Startup failed</h1><p>${escapeHtml(message)}</p><code>${escapeHtml(
      plan.baseUrl,
    )}</code></main>`,
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
      main { display: grid; gap: 10px; width: min(420px, calc(100vw - 48px)); }
      h1 { margin: 0; font-size: 24px; }
      p { margin: 0; color: #656d76; }
      code { overflow-wrap: anywhere; }
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
