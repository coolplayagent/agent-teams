import { appendFileSync } from "node:fs";

import { app, clipboard, shell } from "electron";

import { startDesktopApplication } from "./application.js";

const autoQuitAfterReadyEnv = "AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS";
const autoQuitTraceEnv = "AGENT_TEAMS_DESKTOP_AUTO_QUIT_TRACE";
const copyTextLogEnv = "AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG";
const openExternalLogEnv = "AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG";

startDesktopApplication({
  copyText: (text) => {
    if (appendEnvLog(copyTextLogEnv, text)) {
      return;
    }
    clipboard.writeText(text);
  },
  onBackendReady: () => {
    const delayMs = readNonNegativeInteger(process.env[autoQuitAfterReadyEnv]);
    if (delayMs === null) {
      return;
    }
    appendEnvLog(autoQuitTraceEnv, `scheduled:${delayMs}`);
    setTimeout(() => {
      appendEnvLog(autoQuitTraceEnv, "fired");
      app.quit();
    }, delayMs);
  },
  openExternal: async (url) => {
    if (appendEnvLog(openExternalLogEnv, url)) {
      return;
    }
    await shell.openExternal(url);
  },
});

function appendEnvLog(envName: string, message: string): boolean {
  const logPath = process.env[envName]?.trim();
  if (logPath === undefined || logPath === "") {
    return false;
  }
  appendFileSync(logPath, `${message}\n`, { encoding: "utf-8" });
  return true;
}

function readNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
