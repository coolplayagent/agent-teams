import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  screenshotPath,
  waitForV2Shell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-managed-backend-live";
const MANAGED_LIVE_ENABLED = process.env.AGENT_TEAMS_MANAGED_LIVE_STREAM === "1";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

interface ManagedBackend {
  apiBaseUrl: string;
  close: () => Promise<void>;
}

interface ManagedProcess {
  logFile: string;
  logStream: ReturnType<typeof createWriteStream>;
  name: string;
  process: ChildProcessWithoutNullStreams;
}

interface SessionRecord {
  active_run_id?: string | null;
  latest_terminal_run_id?: string | null;
  latest_terminal_run_status?: string | null;
  metadata?: {
    title?: string | null;
  } | null;
  session_id: string;
  workspace_id?: string | null;
}

interface RunCreateResponse {
  run_id?: string | null;
  session_id?: string | null;
}

test.skip(
  !MANAGED_LIVE_ENABLED,
  "Set AGENT_TEAMS_MANAGED_LIVE_STREAM=1 to run managed fake-backend streaming checks.",
);

test.setTimeout(240_000);

let managedBackend: ManagedBackend;

test.beforeAll(async () => {
  managedBackend = await startManagedBackend();
});

test.afterAll(async () => {
  await managedBackend?.close();
});

test("managed backend normal stream reveals incrementally and survives session switch", async ({
  page,
}) => {
  const title = `managed-live-normal-${Date.now()}`;
  const session = await createSession(title);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const expectedText = slowStreamExpectedText(streamTag, 40);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, 39);
    const promptText = [
      `${title}: [slow-stream tag=${streamTag} repeat=40 delay=80 chunk=8]`,
      "请只输出 fake LLM 返回的慢速文本。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    const samples = await collectLiveStreamTextLengthSamples(page, 90_000, 35);
    expect(increasingSampleCount(samples)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...samples)).toBeLessThan(expectedText.length);
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 90_000 })
      .toContain(firstToken);
    const liveSnippet = await stableLiveStreamSnippet(page);

    await page.screenshot({
      fullPage: false,
      path: screenshotPath("managed-live-normal-streaming.png", SCREENSHOT_FOLDER),
    });

    await switchAwayAndBack(page, title);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 45_000 })
      .toContain(liveSnippet);
    await expect.poll(() => messageArticleContainingCount(page, liveSnippet))
      .toBe(1);

    await waitForRunToLeaveActive(session.session_id, runId, 120_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 45_000 })
      .toContain(lastToken);
    await expect.poll(() => messageArticleContainingCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, expectedText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed normal live stream should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath("managed-live-normal-after-switch.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend normal stream survives terminal hard refresh without duplicate rows", async ({
  page,
}) => {
  const title = `managed-live-refresh-${Date.now()}`;
  const session = await createSession(title);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const expectedText = slowStreamExpectedText(streamTag, 32);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, 31);
    const promptText = [
      `${title}: [slow-stream tag=${streamTag} repeat=32 delay=80 chunk=8]`,
      "请只输出 fake LLM 返回的慢速文本。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 90_000 })
      .toContain(firstToken);

    await waitForRunToLeaveActive(session.session_id, runId, 120_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 45_000 })
      .toContain(lastToken);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-normal-terminal-before-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(lastToken);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, expectedText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed normal terminal refresh should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-normal-terminal-after-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend active stream stays in one streaming row after hard refresh", async ({
  page,
}) => {
  const title = `managed-live-active-refresh-${Date.now()}`;
  const session = await createSession(title);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const expectedText = slowStreamExpectedText(streamTag, 64);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, 63);
    const promptText = [
      `${title}: [slow-stream tag=${streamTag} repeat=64 delay=100 chunk=8]`,
      "请只输出 fake LLM 返回的慢速文本。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 90_000 })
      .toContain(firstToken);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 45_000 })
      .toContain(firstToken);
    await expect.poll(() => messageArticleContainingCount(page, firstToken)).toBe(1);

    const samples = await collectLiveStreamTextLengthSamples(page, 90_000, 90);
    expect(increasingSampleCount(samples)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...samples)).toBeLessThan(expectedText.length);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-active-refresh-streaming.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await waitForRunToLeaveActive(session.session_id, createdRunId, 180_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(lastToken);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, expectedText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed active hard refresh should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-active-refresh-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

async function startManagedBackend(): Promise<ManagedBackend> {
  const fakeLlmPort = await findFreePort();
  const backendPort = await findFreePort();
  const runtimeRoot = await makeRuntimeRoot();
  const fakeLlmBaseUrl = `http://127.0.0.1:${fakeLlmPort}`;
  const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
  await writeRuntimeConfig(runtimeRoot, `${fakeLlmBaseUrl}/v1`);

  const env = managedProcessEnv(runtimeRoot);
  const fakeLlm = startManagedProcess({
    args: [
      "-m",
      "uvicorn",
      "integration_tests.support.fake_llm_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(fakeLlmPort),
      "--log-level",
      "warning",
    ],
    env,
    logFile: join(runtimeRoot, "fake-llm.log"),
    name: "fake-llm",
  });
  let backend: ManagedProcess | null = null;
  try {
    await waitForHttpReady(`${fakeLlmBaseUrl}/health`, fakeLlm, 20_000);
    backend = startManagedProcess({
      args: [
        "-m",
        "uvicorn",
        "relay_teams.interfaces.server.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(backendPort),
        "--log-level",
        "warning",
      ],
      env,
      logFile: join(runtimeRoot, "backend.log"),
      name: "agent-teams-backend",
    });
    await waitForHttpReady(`${apiBaseUrl}/api/system/health`, backend, 90_000);
    await waitForHttpReady(`${apiBaseUrl}/api/sessions?workspace_id=default`, backend, 90_000);
    return {
      apiBaseUrl,
      close: async () => {
        if (backend !== null) {
          await stopManagedProcess(backend);
        }
        await stopManagedProcess(fakeLlm);
        await rm(runtimeRoot, { force: true, recursive: true });
      },
    };
  } catch (error) {
    if (backend !== null) {
      await stopManagedProcess(backend);
    }
    await stopManagedProcess(fakeLlm);
    await rm(runtimeRoot, { force: true, recursive: true });
    throw error;
  }
}

async function makeRuntimeRoot(): Promise<string> {
  const root = join(tmpdir(), `agent-teams-managed-live-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeRuntimeConfig(
  runtimeRoot: string,
  fakeLlmV1BaseUrl: string,
): Promise<void> {
  const configDir = join(runtimeRoot, ".relay-teams");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "model.json"),
    JSON.stringify(
      {
        default: {
          api_key: "test-api-key",
          base_url: fakeLlmV1BaseUrl,
          context_window: 22000,
          max_tokens: 512,
          model: "fake-chat-model",
          temperature: 0,
          top_p: 1,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function managedProcessEnv(runtimeRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pythonPaths = [repoRoot, join(repoRoot, "src"), join(repoRoot, "tests")];
  const existingPythonPath = env.PYTHONPATH?.trim();
  if (existingPythonPath) {
    pythonPaths.push(existingPythonPath);
  }
  env.PYTHONPATH = pythonPaths.join(process.platform === "win32" ? ";" : ":");
  env.HOME = runtimeRoot;
  env.USERPROFILE = runtimeRoot;
  if (process.platform === "win32") {
    env.HOMEDRIVE = runtimeRoot.slice(0, 2);
    env.HOMEPATH = runtimeRoot.slice(2) || "\\";
  }
  env.AGENT_TEAMS_COMPUTER_RUNTIME = "fake";
  env.PYTHON_KEYRING_BACKEND = "keyring.backends.null.Keyring";
  env.RELAY_TEAMS_LLM_HTTP_MAX_CONCURRENCY = "4";
  for (const key of [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
    "SSL_VERIFY",
  ]) {
    delete env[key];
  }
  return env;
}

function startManagedProcess(options: {
  args: string[];
  env: NodeJS.ProcessEnv;
  logFile: string;
  name: string;
}): ManagedProcess {
  const logStream = createWriteStream(options.logFile, { flags: "a" });
  const child = spawn(pythonExecutable(), options.args, {
    cwd: repoRoot,
    env: options.env,
  });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  return {
    logFile: options.logFile,
    logStream,
    name: options.name,
    process: child,
  };
}

function pythonExecutable(): string {
  const configured = process.env.AGENT_TEAMS_TEST_PYTHON?.trim();
  if (configured) {
    return configured;
  }
  const windowsVenvPython = join(repoRoot, ".venv", "Scripts", "python.exe");
  if (existsSync(windowsVenvPython)) {
    return windowsVenvPython;
  }
  const unixVenvPython = join(repoRoot, ".venv", "bin", "python");
  if (existsSync(unixVenvPython)) {
    return unixVenvPython;
  }
  return "python";
}

async function stopManagedProcess(processInfo: ManagedProcess): Promise<void> {
  if (processInfo.process.exitCode === null && !processInfo.process.killed) {
    processInfo.process.kill();
    await Promise.race([
      new Promise<void>((resolve) => {
        processInfo.process.once("close", () => resolve());
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5_000);
      }),
    ]);
  }
  if (processInfo.process.exitCode === null && !processInfo.process.killed) {
    processInfo.process.kill("SIGKILL");
  }
  processInfo.logStream.end();
}

async function waitForHttpReady(
  url: string,
  processInfo: ManagedProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processInfo.process.exitCode !== null) {
      throw new Error(
        `${processInfo.name} exited before ${url} became ready.\n${await logTail(processInfo.logFile)}`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  throw new Error(
    `${processInfo.name} did not become ready at ${url}.\n${await logTail(processInfo.logFile)}`,
  );
}

async function logTail(logFile: string): Promise<string> {
  try {
    const content = await readFile(logFile, "utf-8");
    return content.slice(-4000);
  } catch {
    return "";
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPort(new Error("Expected TCP server to bind to a port."));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function openManagedSession(
  page: Page,
  session: SessionRecord,
  title: string,
): Promise<void> {
  await ensureScreenshotDir(SCREENSHOT_FOLDER);
  await page.addInitScript(({ sessionId, workspaceId }) => {
    window.localStorage.setItem("agentTeams.language", "zh");
    window.localStorage.setItem("agentTeams.themeMode", "light");
    window.localStorage.setItem("agent_teams_theme", "light");
    window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
    window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    window.localStorage.setItem("agentTeams.shellView", "chat");
    window.localStorage.removeItem("agentTeams.activeSubagentPanel");
  }, {
    sessionId: session.session_id,
    workspaceId: session.workspace_id ?? "default",
  });
  await page.goto(`${apiBaseUrl()}/app/?codex_verify=${encodeURIComponent(title)}`, {
    waitUntil: "domcontentloaded",
  });
}

async function expectManagedShellReady(page: Page): Promise<void> {
  await waitForV2Shell(page);
  await expect(page.locator(".at-chat-view")).toBeVisible();
  await expect(page.locator(".at-composer")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /提示词|Prompt/ })).toBeEnabled();
  await expectNoDocumentScroll(
    page,
    "managed backend live stream shell should stay fixed-height before run",
  );
}

async function submitPrompt(page: Page, promptText: string): Promise<void> {
  const prompt = page.getByRole("textbox", { name: /提示词|Prompt/ });
  await prompt.fill(promptText);
  const send = page.getByRole("button", { name: /^发送$|^Send$/ });
  await expect(send).toBeEnabled();
  await send.click();
}

function waitForRunCreateResponse(page: Page): Promise<RunCreateResponse> {
  return page
    .waitForResponse((response) =>
      response.url() === `${apiBaseUrl()}/api/ag-ui/runs` &&
      response.request().method() === "POST" &&
      response.ok(),
    )
    .then((response) => response.json() as Promise<RunCreateResponse>);
}

async function runIdFromResponse(response: RunCreateResponse): Promise<string> {
  const runId = response.run_id?.trim() ?? "";
  expect(runId.length).toBeGreaterThan(0);
  return runId;
}

async function switchAwayAndBack(page: Page, title: string): Promise<void> {
  const selected = page.locator(".at-session-item.is-selected");
  await expect(selected).toContainText(title);
  const fallback = await createSession(`managed-live-switch-target-${Date.now()}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectManagedShellReady(page);
  await page.locator(".at-session-item").filter({ hasText: fallback.metadata?.title ?? "" }).first()
    .click();
  await expect(page.locator(".at-session-item.is-selected")).not.toContainText(title);
  await page.locator(".at-session-item").filter({ hasText: title }).first().click();
  await expect(page.locator(".at-session-item.is-selected")).toContainText(title);
  await deleteSession(fallback.session_id);
}

async function collectLiveStreamTextLengthSamples(
  page: Page,
  timeoutMs: number,
  delayMs: number,
): Promise<number[]> {
  const samples: number[] = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    samples.push((await latestLiveStreamText(page)).length);
    if (
      increasingSampleCount(samples) >= 3 &&
      Math.max(...samples) > 8
    ) {
      return samples;
    }
    await page.waitForTimeout(delayMs);
  }
  return samples;
}

async function latestLiveStreamText(page: Page): Promise<string> {
  return liveStreamLocator(page).evaluateAll((nodes) => {
    const text = nodes.at(-1)?.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  });
}

function liveStreamLocator(page: Page): Locator {
  return page.locator(
    ".at-chat-view .at-message-streaming-text, .at-chat-view .at-message-plain-stream",
  );
}

async function stableLiveStreamSnippet(page: Page): Promise<string> {
  await expect
    .poll(async () => (await latestLiveStreamText(page)).length >= 24, {
      timeout: 90_000,
    })
    .toBe(true);
  const text = await latestLiveStreamText(page);
  return stableSnippetFromText(text);
}

function stableSnippetFromText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

function increasingSampleCount(samples: number[]): number {
  let increases = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] ?? 0;
    const current = samples[index] ?? 0;
    if (current > previous) {
      increases += 1;
    }
  }
  return increases;
}

async function messageArticleTextOccurrenceCount(page: Page, text: string): Promise<number> {
  return page.locator(".at-chat-view article.at-message").evaluateAll((nodes, needle) => {
    const haystack = nodes.map((node) => node.textContent ?? "").join("\n");
    if (needle.length === 0) {
      return 0;
    }
    return haystack.split(needle).length - 1;
  }, text);
}

async function messageArticleContainingCount(page: Page, text: string): Promise<number> {
  return page.locator(".at-chat-view article.at-message").evaluateAll((nodes, needle) =>
    nodes.filter((node) => (node.textContent ?? "").includes(needle)).length,
  text);
}

async function strictPrefixMessageArticleCount(
  page: Page,
  fullText: string,
): Promise<number> {
  return page.locator(".at-chat-view article.at-message").evaluateAll((nodes, expected) => {
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();
    return nodes.filter((node) => {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return (
        text.length > 0 &&
        text.length < normalizedExpected.length &&
        normalizedExpected.startsWith(text)
      );
    }).length;
  }, fullText);
}

async function mainTimelineMessageArticleText(page: Page): Promise<string> {
  return page.locator(".at-chat-view article.at-message").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent ?? "").join("\n"),
  );
}

async function waitForRunToLeaveActive(
  sessionId: string,
  runId: string,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(() => currentRunStatus(sessionId, runId), { timeout: timeoutMs })
    .toBe("terminal");
}

async function currentRunStatus(
  sessionId: string,
  runId: string,
): Promise<"active" | "terminal" | "unknown"> {
  const sessions = await fetchJson<SessionRecord[]>("/api/sessions?workspace_id=default")
    .catch(() => []);
  const session = sessions.find((item) => item.session_id === sessionId);
  if (session === undefined) {
    return "unknown";
  }
  if (session.active_run_id === runId) {
    return "active";
  }
  if (session.latest_terminal_run_id === runId) {
    const status = (session.latest_terminal_run_status ?? "").trim().toLowerCase();
    if (["completed", "failed", "stopped", "cancelled", "canceled"].includes(status)) {
      return "terminal";
    }
  }
  return "unknown";
}

async function createSession(title: string): Promise<SessionRecord> {
  return fetchJson<SessionRecord>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      metadata: { title },
      workspace_id: "default",
    }),
  });
}

async function stopRunIfPresent(runId: string | null): Promise<void> {
  if (runId === null) {
    return;
  }
  await fetchJson<Record<string, unknown>>(`/api/ag-ui/runs/${encodeURIComponent(runId)}:stop`, {
    method: "POST",
    body: JSON.stringify({ scope: "main" }),
  }).catch(() => null);
}

async function deleteSession(sessionId: string): Promise<void> {
  await fetchJson<Record<string, unknown>>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    body: JSON.stringify({ cascade: true, force: true }),
  }).catch(() => null);
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${path}${body ? `: ${body}` : ""}`);
  }
  return (await response.json()) as T;
}

function streamTagFromTitle(title: string): string {
  return title.replace(/[^A-Za-z0-9_-]/g, "_").replace(/-/g, "_");
}

function slowStreamExpectedText(tag: string, count: number): string {
  return Array.from({ length: count }, (_, index) =>
    slowStreamToken(tag, index),
  ).join(" ");
}

function slowStreamToken(tag: string, index: number): string {
  return `SLOW_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function apiBaseUrl(): string {
  return managedBackend.apiBaseUrl;
}
