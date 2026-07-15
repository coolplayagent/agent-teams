#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const outputDir = resolve(repoRoot, options.outDir);
const chromePath = options.chromePath ?? findChromePath();
const captures = [
  { name: "v1-desktop", path: "/", width: 1280, height: 720 },
  { name: "v2-desktop", path: "/app/", width: 1280, height: 720 },
  { name: "v1-mobile", path: "/", width: 390, height: 844, mobile: true },
  { name: "v2-mobile", path: "/app/", width: 390, height: 844, mobile: true },
];

async function main() {
  if (chromePath === null) {
    throw new Error("Chrome or Edge executable was not found. Set CHROME_PATH to the browser executable.");
  }

  await mkdir(outputDir, { recursive: true });

  const port = await findFreeDebugPort();
  const profileDir = join(outputDir, `.chrome-profile-${process.pid}`);
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });

  const browserProcess = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );

  let browserClosed = false;
  browserProcess.once("exit", () => {
    browserClosed = true;
  });

  try {
    const webSocketDebuggerUrl = await waitForDebuggerUrl(port, browserProcess);
    const client = await CdpClient.connect(webSocketDebuggerUrl);
    try {
      for (const capture of captures) {
        await capturePage(client, capture);
      }
    } finally {
      client.close();
    }
  } finally {
    if (!browserClosed) {
      browserProcess.kill();
      await waitForProcessExit(browserProcess);
    }
    await rm(profileDir, { recursive: true, force: true });
  }

  console.log(`Captured ${captures.length} frontend views to ${outputDir}`);
}

async function capturePage(client, capture) {
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", {
    flatten: true,
    targetId: target.targetId,
  });
  const sessionId = attached.sessionId;
  const url = new URL(capture.path, options.baseUrl).toString();

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Emulation.setDeviceMetricsOverride",
    {
      deviceScaleFactor: 1,
      height: capture.height,
      mobile: Boolean(capture.mobile),
      width: capture.width,
    },
    sessionId,
  );
  await client.send("Page.navigate", { url }, sessionId);
  await delay(options.waitMs);

  const metrics = await client.send(
    "Runtime.evaluate",
    {
      awaitPromise: true,
      expression: `(${collectMetrics.toString()})()`,
      returnByValue: true,
    },
    sessionId,
  );
  const screenshot = await client.send(
    "Page.captureScreenshot",
    {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    },
    sessionId,
  );

  await writeFile(join(outputDir, `${capture.name}.png`), Buffer.from(screenshot.data, "base64"));
  await writeFile(
    join(outputDir, `${capture.name}.json`),
    `${JSON.stringify(metrics.result.value, null, 2)}\n`,
    "utf8",
  );
  await client.send("Target.closeTarget", { targetId: target.targetId });
}

function collectMetrics() {
  const pick = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      selector,
      className: String(element.className || ""),
      text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
      rect: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      },
      scroll: {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      },
      style: {
        marginRight: style.marginRight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        position: style.position,
      },
    };
  };
  return {
    url: location.href,
    title: document.title,
    viewport: {
      height: innerHeight,
      width: innerWidth,
    },
    document: {
      bodyClientHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      scrollX,
      scrollY,
    },
    elements: [
      ".topbar",
      ".sidebar",
      "#chat-container",
      ".at-topbar",
      ".at-body",
      ".at-sidebar",
      ".at-sidebar-resizer",
      ".at-workspace",
      ".at-chat-view",
      ".at-timeline",
      ".at-composer-shell",
      ".at-settings-drawer",
      ".at-settings-center",
    ].map(pick),
  };
}

class CdpClient {
  static connect(url) {
    return new Promise((resolvePromise, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolvePromise(client), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools.")), {
        once: true,
      });
    });
  }

  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") {
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId !== undefined) {
      payload.sessionId = sessionId;
    }
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { reject, resolve: resolvePromise });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForDebuggerUrl(port, browserProcess) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools started with code ${browserProcess.exitCode}.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const version = await response.json();
        if (typeof version.webSocketDebuggerUrl === "string") {
          return version.webSocketDebuggerUrl;
        }
      }
    } catch {
      await delay(100);
    }
  }
  throw new Error("Timed out waiting for Chrome DevTools.");
}

async function findFreeDebugPort() {
  for (let offset = 0; offset < 50; offset += 1) {
    const port = 9333 + offset;
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(100) });
    } catch {
      return port;
    }
  }
  throw new Error("Could not find a free Chrome DevTools port.");
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function waitForProcessExit(processHandle) {
  if (processHandle.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolvePromise) => {
    processHandle.once("exit", () => resolvePromise());
  });
}

function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseArgs(args) {
  const parsed = {
    baseUrl: "http://127.0.0.1:8000",
    chromePath: null,
    outDir: ".tmp/frontend-visual-capture",
    waitMs: 2500,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base-url") {
      parsed.baseUrl = readArgValue(args, index);
      index += 1;
    } else if (arg === "--chrome") {
      parsed.chromePath = readArgValue(args, index);
      index += 1;
    } else if (arg === "--out") {
      parsed.outDir = readArgValue(args, index);
      index += 1;
    } else if (arg === "--wait-ms") {
      parsed.waitMs = Number(readArgValue(args, index));
      if (!Number.isFinite(parsed.waitMs) || parsed.waitMs < 0) {
        throw new Error("--wait-ms must be a non-negative number.");
      }
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function readArgValue(args, index) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }
  return value;
}

await main();
