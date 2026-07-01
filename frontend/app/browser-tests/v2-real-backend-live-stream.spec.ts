import { expect, test, type Page } from "@playwright/test";

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

test("real backend normal stream reveals incrementally and survives session switch", async ({
  page,
}) => {
  const title = `real-live-normal-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const promptText = [
      `${title}: 请只输出下面这一段文字，不要调用任何工具。`,
      "输出时保持原文顺序：",
      "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_GAMMA LIVE_STREAM_DELTA LIVE_STREAM_EPSILON LIVE_STREAM_ZETA LIVE_STREAM_ETA LIVE_STREAM_THETA LIVE_STREAM_IOTA LIVE_STREAM_KAPPA。",
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
    await expect(
      page.locator(".at-chat-view .at-message-streaming-text").last(),
    ).toBeVisible({ timeout: 90_000 });

    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-normal-streaming.png", SCREENSHOT_FOLDER),
    });

    await switchAwayAndBack(page, title);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .toContain("LIVE_STREAM_KAPPA");
    await expect.poll(() => messageArticleTextOccurrenceCount(page, "LIVE_STREAM_ALPHA"))
      .toBe(1);

    await waitForRunToLeaveActive(page, session.session_id, runId, 120_000);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, "LIVE_STREAM_ALPHA"))
      .toBe(1);
    await expect
      .poll(() =>
        strictPrefixMessageArticleCount(
          page,
          "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_GAMMA LIVE_STREAM_DELTA LIVE_STREAM_EPSILON LIVE_STREAM_ZETA LIVE_STREAM_ETA LIVE_STREAM_THETA LIVE_STREAM_IOTA LIVE_STREAM_KAPPA",
        ),
      )
      .toBe(0);
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

test("real backend subagent stream opens while running and stays out of main timeline", async ({
  page,
}) => {
  const title = `real-live-subagent-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const childMarker = `REAL_SUBAGENT_CHILD_${Date.now()}`;
    const promptText = [
      `${title}: 请启动一个 Crafter 子代理验证右侧面板流式显示。`,
      "子代理只允许执行下面这个 shell 命令，不要修改任何文件：",
      `python -c "import time; print('${childMarker}_1', flush=True); time.sleep(2); print('${childMarker}_2', flush=True); time.sleep(2); print('${childMarker}_DONE', flush=True)"`,
      "主代理不要复述子代理过程；子代理完成后主代理只用一句中文总结。",
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
      .toContain(childMarker);

    await expect(
      panel.locator(".at-message-tool, .at-message-streaming-text, .at-message").first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect
      .poll(() => panel.textContent(), { timeout: 120_000 })
      .toContain(`${childMarker}_1`);

    await page.screenshot({
      fullPage: false,
      path: screenshotPath("real-live-subagent-running-panel.png", SCREENSHOT_FOLDER),
    });

    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(`${childMarker}_1`);
    await switchAwayAndBack(page, title);
    await subagentCard.click();
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => panel.locator(".at-subagent-session-prompt").textContent())
      .toContain(childMarker);

    await waitForRunToLeaveActive(page, session.session_id, runId, 150_000);
    await expect
      .poll(() => panel.textContent(), { timeout: 120_000 })
      .toContain(`${childMarker}_DONE`);
    await expect(panel.locator(".at-subagent-session-badge")).not.toContainText(
      /running/i,
    );
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(`${childMarker}_DONE`);
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
    window.localStorage.setItem("agentTeams.subagentPanelWidth", "760");
    window.localStorage.removeItem("agentTeams.activeSubagentPanel");
  }, {
    sessionId: session.session_id,
    workspaceId: session.workspace_id ?? "default",
  });
  await page.goto(`${realBackendUrl()}/app/?codex_verify=${encodeURIComponent(title)}`, {
    waitUntil: "domcontentloaded",
  });
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
  const candidates = page.locator(".at-session-item").filter({ hasNotText: title });
  await expect(candidates.first()).toBeVisible({ timeout: 20_000 });
  await candidates.first().click();
  await expect(selected).not.toContainText(title);
  await page.locator(".at-session-item").filter({ hasText: title }).first().click();
  await expect(page.locator(".at-session-item.is-selected")).toContainText(title);
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
  return page.locator(".at-chat-view .at-message-streaming-text").evaluateAll((nodes) => {
    const text = nodes.at(-1)?.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  });
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
  page: Page,
  sessionId: string,
  runId: string,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(() => currentRunStatus(sessionId, runId), { timeout: timeoutMs })
    .not.toBe("active");
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

function realBackendUrl(): string {
  return (
    process.env.AGENT_TEAMS_REAL_BACKEND_URL?.replace(/\/$/, "") ??
    DEFAULT_REAL_BACKEND_URL
  );
}
