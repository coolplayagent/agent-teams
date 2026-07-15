import { spawn, type ChildProcess } from "node:child_process";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import {
  buildDesktopBackendPlan,
  type DesktopBackendPlan,
  type DesktopBackendStatus,
} from "./backendPlan.js";
import { normalizeExternalHttpUrl } from "./externalLinks.js";
import { selectAvailableDesktopPort } from "./ports.js";
import { bundledBackendExecutable } from "./releasePaths.js";
import {
  desktopStartupCopy,
  type DesktopStartupCopy,
} from "./startupCopy.js";
import {
  desktopFailureDocumentUrl,
  desktopLoadingDocumentUrl,
} from "./startupDocument.js";
import { buildDesktopWindowOptions } from "./windowOptions.js";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStatus: DesktopBackendStatus = {
  baseUrl: "",
  message: "",
  state: "starting",
};
let appQuitting = false;
let startupCopy: DesktopStartupCopy = desktopStartupCopy("en");

export interface DesktopHostOperations {
  copyText: (text: string) => void;
  onBackendReady: () => void;
  openExternal: (url: string) => Promise<void>;
}

let hostOperations: DesktopHostOperations | null = null;

export function startDesktopApplication(operations: DesktopHostOperations): void {
  hostOperations = operations;
  app.whenReady().then(() => {
    startupCopy = desktopStartupCopy(app.getLocale());
    backendStatus = {
      baseUrl: "",
      message: startupCopy.backendHasNotStarted,
      state: "starting",
    };
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
}

async function startDesktopApp(): Promise<void> {
  mainWindow = createMainWindow();
  await loadDesktopApp(mainWindow);
}

async function loadDesktopApp(window: BrowserWindow): Promise<void> {
  const plan = await buildRuntimeBackendPlan();
  setBackendStatus({
    baseUrl: plan.baseUrl,
    message: startupCopy.backendStarting,
    state: "starting",
  });
  await window.loadURL(desktopLoadingDocumentUrl(plan.baseUrl, startupCopy));

  try {
    await ensureBackendReady(plan);
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message: startupCopy.backendReady,
      state: "ready",
    });
    const appLoad = window.loadURL(plan.appUrl);
    requireHostOperations().onBackendReady();
    await appLoad;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : startupCopy.backendStartupFailed;
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message,
      state: "failed",
    });
    await window.loadURL(
      desktopFailureDocumentUrl(plan.baseUrl, message, startupCopy),
    );
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
        message: startupCopy.backendStopped,
        state: "stopped",
      });
      return;
    }
    const detail = signal !== null
      ? startupCopy.backendExitedSignal(signal)
      : code === null
        ? startupCopy.backendExitedUnknown
        : startupCopy.backendExitedCode(code);
    setBackendStatus({
      baseUrl: plan.baseUrl,
      message: startupCopy.backendProcessExited(detail),
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
  throw new Error(startupCopy.backendNotReady(plan.baseUrl));
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
  await requireHostOperations().openExternal(normalizedUrl);
}

function copyText(text: string): void {
  requireHostOperations().copyText(text);
}

function requireHostOperations(): DesktopHostOperations {
  if (hostOperations === null) {
    throw new Error("Desktop host operations have not been configured.");
  }
  return hostOperations;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
