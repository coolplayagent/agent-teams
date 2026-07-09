import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  screenshotPath,
  waitForV2Shell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-real-backend-live";
const DEFAULT_REAL_BACKEND_URL = "http://127.0.0.1:8000";
const REAL_LIVE_ENABLED = process.env.AGENT_TEAMS_REAL_LIVE_STREAM === "1";

interface SessionRecord {
  active_run_id?: string | null;
  active_run_status?: string | null;
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
  !REAL_LIVE_ENABLED,
  "Set AGENT_TEAMS_REAL_LIVE_STREAM=1 to run live backend streaming checks.",
);

test.setTimeout(240_000);

test("real backend normal stream receives incremental chunks and survives session switch", async ({
  page,
}) => {
  const title = `real-live-normal-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const expectedText = slowStreamExpectedText(streamTag, 48);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, 47);
    const promptText = [
      `${title}: 请不要调用任何工具。`,
      "请只输出下面这一段文字，保持原文顺序，不要解释，不要添加额外内容：",
      expectedText,
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    const samples = await collectLiveStreamTextLengthSamples(page, 90_000, 30);
    expect(increasingSampleCount(samples)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...samples)).toBeGreaterThan(8);
    await expect(liveStreamLocator(page)).toBeVisible({ timeout: 90_000 });
    const liveSnippet = await stableLiveStreamSnippet(page);

    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-normal-streaming.png", SCREENSHOT_FOLDER),
    });

    await switchAwayAndBack(page, title);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .toContain(liveSnippet);
    await expect.poll(() => messageArticleContainingCount(page, liveSnippet))
      .toBe(1);

    await waitForRunToLeaveActive(page, session.session_id, runId, 120_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 30_000 })
      .toContain(lastToken);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 30_000 })
      .toContain(liveSnippet);
    await expect.poll(() => messageArticleContainingCount(page, firstToken))
      .toBe(1);
    await expect.poll(() => messageArticleContainingCount(page, liveSnippet))
      .toBe(1);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "real normal live stream should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-normal-after-switch.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteRealSession(session.session_id);
  }
});

test("real backend normal stream survives terminal hard refresh without duplicate rows", async ({
  page,
}) => {
  const title = `real-live-refresh-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const refreshTag = streamTagFromTitle(title);
    const refreshText = slowStreamExpectedText(refreshTag, REAL_REFRESH_TOKEN_COUNT);
    const firstToken = slowStreamToken(refreshTag, 0);
    const lastToken = slowStreamToken(refreshTag, REAL_REFRESH_TOKEN_COUNT - 1);
    const promptText = [
      `${title}: 请不要调用任何工具。`,
      "请只输出下面这一段文字，保持原文顺序，不要解释，不要添加额外内容：",
      refreshText,
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 90_000 })
      .toContain(firstToken);

    await waitForRunToLeaveActive(page, session.session_id, runId, 150_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 20_000 })
      .toContain(lastToken);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-normal-terminal-catchup-before-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRealShellReady(page);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(lastToken);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, refreshText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "real normal terminal refresh should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-normal-terminal-after-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteRealSession(session.session_id);
  }
});

test("real backend subagent stream opens while running and stays out of main timeline", async ({
  page,
}) => {
  const title = `real-live-subagent-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const childTag = streamTagFromTitle(title);
    const childTokenCount = 10;
    const childFirstToken = subagentStreamToken(childTag, 0);
    const childLastToken = subagentStreamToken(childTag, childTokenCount - 1);
    const shellCommand = subagentStreamingShellCommand(childTag, childTokenCount);
    const promptText = [
      `${title}: 请启动一个 Crafter 子代理验证右侧面板真实流式显示。`,
      "子代理只允许调用 shell 工具执行下面这个命令，不要改写命令，不要自己输出 token，不要调用其它工具：",
      shellCommand,
      "子代理执行完成后只需报告 shell stdout 已输出完成。",
      "主代理不要复述子代理 stdout，只用一句中文总结子代理已完成。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    const subagentCard = page.locator(".at-chat-view .at-message-tool.is-openable-subagent")
      .first();
    await expect(subagentCard).toBeVisible({ timeout: 120_000 });
    await subagentCard.click();

    const panel = page.locator(".at-subagent-session-view");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => panel.locator(".at-subagent-session-prompt").textContent())
      .toContain(childTag);

    await expect(
      panel.locator(
        ".at-message-tool, .at-message-streaming-text, .at-message-plain-stream, .at-message",
      ).first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => latestSubagentPanelRuntimeText(panel), {
      timeout: 120_000,
    })
      .toContain(childFirstToken);
    expect(await latestSubagentPanelRuntimeText(panel)).not.toContain(childLastToken);
    const panelSamples = await collectSubagentPanelTextLengthSamples(
      panel,
      90_000,
      40,
    );
    expect(increasingSampleCount(panelSamples)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...panelSamples)).toBeGreaterThan(childFirstToken.length);

    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-subagent-running-panel.png", SCREENSHOT_FOLDER),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForV2Shell(page);
    await expect(page.locator(".at-subagent-session-view")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => page.locator(".at-subagent-session-prompt").textContent(), {
        timeout: 45_000,
      })
      .toContain(childTag);
    await expect
      .poll(() => page.locator(".at-subagent-session-view").textContent(), {
        timeout: 90_000,
      })
      .toContain(childFirstToken);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-subagent-after-running-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(childFirstToken);
    await switchAwayAndBack(page, title);
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => panel.locator(".at-subagent-session-prompt").textContent())
      .toContain(childTag);

    await waitForRunToLeaveActive(page, session.session_id, runId, 150_000);
    await expect
      .poll(() => panel.textContent(), { timeout: 120_000 })
      .toContain(childLastToken);
    await expect(panel.locator(".at-subagent-session-badge")).not.toContainText(
      /running/i,
    );
    await expect(panel.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(panel.locator(".ant-skeleton")).toHaveCount(0);
    await expect
      .poll(() => mainRoundMarkerText(page), { timeout: 45_000 })
      .not.toMatch(/\brunning\b/i);
    await expect
      .poll(() => workspaceChatShellText(page), { timeout: 45_000 })
      .not.toMatch(/\brunning\b/i);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(childLastToken);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "real subagent live stream should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-subagent-completed.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteRealSession(session.session_id);
  }
});

test("real backend orchestration tool stream reaches running state and survives session switch without role leakage", async ({
  page,
}) => {
  const title = `real-live-orchestration-tool-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await updateRealSessionTopology(session.session_id, {
      session_mode: "orchestration",
      orchestration_preset_id: null,
      normal_root_role_id: null,
    });
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);
    await expect(page.locator(".at-composer")).toContainText(/编排模式|Orchestration/);

    const promptText = [
      `${title}: run deterministic orchestration tool pressure for UI verification.`,
      "[orch-tool-pressure count=4 tools=8 delay=2000] dispatch tool-heavy workers in orchestrated mode.",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    await waitForVisibleMainTimelineToolCard(page, 120_000);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("tool-pressure-0");
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");

    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-orchestration-tool-running.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await switchAwayAndBack(page, title);
    await waitForVisibleMainTimelineToolCard(page, 45_000);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");
    await expect(page.locator(".at-message-role")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "real orchestration running tool stream should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-orchestration-tool-after-switch.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteRealSession(session.session_id);
  }
});

async function openRealBackendSession(
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
    window.localStorage.setItem("agentTeams.subagentPanelWidth", "560");
    if (window.sessionStorage.getItem("agentTeams.realBackendLiveState") !== "1") {
      window.localStorage.removeItem("agentTeams.activeSubagentPanel");
      window.sessionStorage.setItem("agentTeams.realBackendLiveState", "1");
    }
  }, {
    sessionId: session.session_id,
    workspaceId: session.workspace_id ?? "default",
  });
  await page.goto(`${realBackendUrl()}/app/?codex_verify=${encodeURIComponent(title)}`, {
    waitUntil: "domcontentloaded",
  });
}

const REAL_REFRESH_TOKEN_COUNT = 32;

function streamTagFromTitle(title: string): string {
  return title.replace(/[^A-Za-z0-9_-]/g, "_").replace(/-/g, "_");
}

function slowStreamExpectedText(tag: string, count: number): string {
  return Array.from({ length: count }, (_, index) =>
    slowStreamToken(tag, index),
  ).join(" ");
}

function subagentStreamExpectedText(tag: string, count: number): string {
  return Array.from({ length: count }, (_, index) =>
    subagentStreamToken(tag, index),
  ).join(" ");
}

function slowStreamToken(tag: string, index: number): string {
  return `SLOW_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function subagentStreamToken(tag: string, index: number): string {
  return `SUBAGENT_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function subagentStreamingShellCommand(tag: string, count: number): string {
  const script = [
    "import time",
    `tag=${JSON.stringify(tag)}`,
    `count=${count}`,
    "[print(f'SUBAGENT_STREAM_{tag}_{index:02d}', flush=True) " +
      "or time.sleep(0.45) for index in range(count)]",
  ].join("; ");
  return `python -c ${JSON.stringify(script)}`;
}

async function expectRealShellReady(page: Page): Promise<void> {
  await waitForV2Shell(page);
  await expect(page.locator(".at-chat-view")).toBeVisible();
  await expect(page.locator(".at-composer")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /提示词|Prompt/ })).toBeEnabled();
  await expectNoDocumentScroll(
    page,
    "real backend live stream shell should stay fixed-height before run",
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
      response.url() === `${realBackendUrl()}/api/ag-ui/runs` &&
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
  let createdFallbackSessionId: string | null = null;
  let candidates = page.locator(".at-session-item").filter({ hasNotText: title });
  if (await candidates.count() === 0) {
    const fallback = await createRealSession(`real-live-switch-target-${Date.now()}`);
    createdFallbackSessionId = fallback.session_id;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRealShellReady(page);
    candidates = page.locator(".at-session-item").filter({ hasNotText: title });
  }
  await expect(candidates.first()).toBeVisible({ timeout: 20_000 });
  await candidates.first().click();
  await expect(selected).not.toContainText(title);
  await page.locator(".at-session-item").filter({ hasText: title }).first().click();
  await expect(page.locator(".at-session-item.is-selected")).toContainText(title);
  if (createdFallbackSessionId !== null) {
    await deleteRealSession(createdFallbackSessionId);
  }
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

async function stableSubagentPanelSnippet(panel: Locator): Promise<string> {
  await expect
    .poll(async () => (await subagentPanelRuntimeSnippet(panel)).length >= 24, {
      timeout: 120_000,
    })
    .toBe(true);
  return subagentPanelRuntimeSnippet(panel);
}

async function subagentPanelRuntimeSnippet(panel: Locator): Promise<string> {
  return panel
    .locator(
      ".at-message-streaming-text, .at-message-plain-stream, article.at-message, .at-message-tool",
    )
    .evaluateAll((nodes) => {
      const ignored = new Set(["思考", "Thinking"]);
      const candidate = nodes
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .find((text) => text.length >= 24 && !ignored.has(text));
      return candidate ?? "";
    })
    .then(stableSnippetFromText);
}

async function collectSubagentPanelTextLengthSamples(
  panel: Locator,
  timeoutMs: number,
  delayMs: number,
): Promise<number[]> {
  const samples: number[] = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    samples.push((await latestSubagentPanelRuntimeText(panel)).length);
    if (
      increasingSampleCount(samples) >= 1 &&
      Math.max(...samples) > 8
    ) {
      return samples;
    }
    await panel.page().waitForTimeout(delayMs);
  }
  return samples;
}

async function latestSubagentPanelRuntimeText(panel: Locator): Promise<string> {
  return panel
    .locator(
      ".at-message-tool, .at-message-streaming-text, .at-message-plain-stream, article.at-message",
    )
    .evaluateAll((nodes) => {
      const ignored = new Set(["思考", "Thinking"]);
      return nodes
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((candidate) => candidate.length > 0 && !ignored.has(candidate))
        .at(-1) ?? "";
    });
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

async function mainRoundMarkerText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const shell = document.querySelector(".at-workspace-chat-shell");
    const chat = shell?.querySelector(":scope > .at-chat-view") ??
      document.querySelector(".at-chat-view");
    return Array.from(chat?.querySelectorAll(".at-round-marker") ?? [])
      .map((node) => node.textContent ?? "")
      .join("\n");
  });
}

async function workspaceChatShellText(page: Page): Promise<string> {
  return page.locator(".at-workspace-chat-shell").evaluate((node) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

async function waitForRunToLeaveActive(
  page: Page,
  sessionId: string,
  runId: string,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(() => currentRunStatus(sessionId, runId), { timeout: timeoutMs })
    .toBe("terminal");
  await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeHidden({
    timeout: 20_000,
  });
}

async function currentRunStatus(
  sessionId: string,
  runId: string,
): Promise<"active" | "terminal" | "unknown"> {
  const sessions = await fetchJson<SessionRecord[]>(
    "/api/sessions?workspace_id=default",
  ).catch(() => []);
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

async function createRealSession(title: string): Promise<SessionRecord> {
  return fetchJson<SessionRecord>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      metadata: { title },
      workspace_id: "default",
    }),
  });
}

async function updateRealSessionTopology(
  sessionId: string,
  request: {
    normal_root_role_id?: string | null;
    orchestration_preset_id?: string | null;
    session_mode: "normal" | "orchestration";
  },
): Promise<SessionRecord> {
  return fetchJson<SessionRecord>(`/api/sessions/${encodeURIComponent(sessionId)}/topology`, {
    method: "PATCH",
    body: JSON.stringify(request),
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

async function deleteRealSession(sessionId: string): Promise<void> {
  await fetchJson<Record<string, unknown>>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    body: JSON.stringify({ cascade: true, force: true }),
  }).catch(() => null);
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${realBackendUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

async function visibleMainTimelineToolCardCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".at-chat-view .at-message-tool"));
    return nodes.filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (node.closest("details.at-processed-group:not([open])") !== null) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        node.getClientRects().length > 0
      );
    }).length;
  });
}

async function waitForVisibleMainTimelineToolCard(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  try {
    await expect
      .poll(() => visibleMainTimelineToolCardCount(page), { timeout: timeoutMs })
      .toBeGreaterThanOrEqual(1);
  } catch (error) {
    const diagnostic = await mainTimelineToolCardDiagnostic(page);
    throw new Error(
      [
        "Timed out waiting for a visible main timeline tool card.",
        diagnostic,
        error instanceof Error ? error.message : String(error),
      ].join("\n\n"),
    );
  }
}

async function mainTimelineToolCardDiagnostic(page: Page): Promise<string> {
  return page.evaluate(() => {
    const chat = document.querySelector(".at-chat-view");
    const toolCards = Array.from(chat?.querySelectorAll(".at-message-tool") ?? []);
    const toolRows = toolCards.map((node, index) => {
      if (!(node instanceof HTMLElement)) {
        return `#${index}: non-element`;
      }
      const style = window.getComputedStyle(node);
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return [
        `#${index}`,
        `status=${node.dataset.status ?? ""}`,
        `tool=${node.dataset.toolName ?? ""}`,
        `closedProcessedGroup=${node.closest("details.at-processed-group:not([open])") !== null}`,
        `display=${style.display}`,
        `visibility=${style.visibility}`,
        `rects=${node.getClientRects().length}`,
        `text=${text.slice(0, 240)}`,
      ].join(" ");
    });
    const visibleText = (chat instanceof HTMLElement ? chat.innerText : chat?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    return [
      `toolCardCount=${toolCards.length}`,
      `visibleText=${visibleText}`,
      "toolCards:",
      toolRows.join("\n"),
    ].join("\n");
  });
}

async function nakedRuntimeRoleLineCount(page: Page): Promise<number> {
  return page.locator(".at-chat-view").evaluate((chat) => {
    const roleNames = new Set(["Coordinator", "Explorer", "Designer", "Crafter", "Gater"]);
    return (chat.textContent ?? "")
      .split("\n")
      .filter((line) => roleNames.has(line.trim()))
      .length;
  });
}

function realBackendUrl(): string {
  return (
    process.env.AGENT_TEAMS_REAL_BACKEND_URL?.replace(/\/$/, "") ??
    DEFAULT_REAL_BACKEND_URL
  );
}
