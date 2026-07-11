import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  screenshotPath,
  waitForAppShell,
} from "./support/frontend-app";
import {
  concatenatedTextDeltas,
  startRealAgUiSseProbe,
  tokenUsageModelProfiles,
  type AgUiSseEventEvidence,
  type RealAgUiSseProbe,
} from "./support/real-ag-ui-sse-evidence";
import {
  eventStreamEvidenceForRun,
  hasPositiveRecoveryCursor,
  observeEventStreams,
} from "./support/stream-network-recovery";

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

test("real backend normal stream receives ordered deltas and survives an active session switch", async ({
  page,
}, testInfo) => {
  const title = `real-live-normal-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  let evidenceProbe: RealAgUiSseProbe | null = null;
  const switchTargetSessionIds: string[] = [];
  try {
    const switchTarget = await createRealSession(
      `real-live-switch-target-${Date.now()}`,
    );
    switchTargetSessionIds.push(switchTarget.session_id);
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const nonce = realStreamNonce();
    const promptText = longPlainTextStreamingPrompt(nonce);
    await installUiPrefixSnapshotObserver(page, session.session_id);

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    evidenceProbe = startRealAgUiSseProbe(realBackendUrl(), runId);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    const initialDeltas = await evidenceProbe.waitForTextDeltas(1, 90_000);
    expect(hasTerminalEvent(evidenceProbe.events)).toBe(false);

    const lastEventBeforeSwitch = latestEventId(evidenceProbe.events);
    expect(initialDeltas.at(-1)?.eventId ?? 0).toBeLessThanOrEqual(
      lastEventBeforeSwitch,
    );
    expect(hasTerminalEvent(evidenceProbe.events)).toBe(false);
    const createdFallbackSessionId = await switchAwayFromSession(page, title);
    if (createdFallbackSessionId !== null) {
      switchTargetSessionIds.push(createdFallbackSessionId);
    }
    const backgroundDelta = await evidenceProbe.waitForEventAfter(
      lastEventBeforeSwitch,
      "text_delta",
      90_000,
    );
    await evidenceProbe.waitForTextDeltas(12, 90_000);
    const streamIdentity = streamIdentityFromOutput(
      concatenatedTextDeltas(evidenceProbe.events),
    );
    await expect(page.locator(".at-session-item.is-selected")).not.toContainText(title);
    await expect
      .poll(async () => normalizeStreamText(await mainTimelineMessageArticleText(page)))
      .not.toContain(streamIdentity);

    await switchBackToSession(page, title);
    await expect.poll(
      async () => normalizeStreamText(await mainTimelineMessageArticleText(page)),
    ).toContain(streamIdentity);
    await expect.poll(() => messageArticleContainingCount(page, streamIdentity)).toBe(1);
    expect(backgroundDelta.eventId).toBeGreaterThan(lastEventBeforeSwitch);
    if (!hasTerminalEvent(evidenceProbe.events)) {
      await page.screenshot({
        fullPage: false,
        path: screenshotPath("real-live-normal-streaming.png", SCREENSHOT_FOLDER),
      });
    }

    const terminal = await evidenceProbe.waitForTerminal(150_000);
    await expectUiRunSettled(page, session.session_id, runId, testInfo);
    const finalOutput = assertRealStreamEvidence(evidenceProbe.events, terminal);
    await expectFinalUiConvergence(page, streamIdentity, finalOutput, testInfo);
    const prefixSnapshots = await uiPrefixSnapshots(page);
    assertStrictUiPrefixSnapshots(prefixSnapshots, finalOutput);
    await recordRealStreamEvidence(testInfo, {
      events: evidenceProbe.events,
      modelProfiles: tokenUsageModelProfiles(evidenceProbe.events),
      prefixSnapshots,
      runId,
    });
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
    await evidenceProbe?.stop();
    await stopRunIfPresent(runId);
    for (const switchTargetSessionId of switchTargetSessionIds) {
      await deleteRealSession(switchTargetSessionId);
    }
    await deleteRealSession(session.session_id);
  }
});

test("real backend normal stream resumes the same active run after hard refresh", async ({
  page,
}, testInfo) => {
  const title = `real-live-refresh-${Date.now()}`;
  const session = await createRealSession(title);
  let runId: string | null = null;
  let evidenceProbe: RealAgUiSseProbe | null = null;
  const browserStreams = await observeEventStreams(page);
  try {
    await openRealBackendSession(page, session, title);
    await expectRealShellReady(page);

    const nonce = realStreamNonce();
    const promptText = longPlainTextStreamingPrompt(nonce);
    await installUiPrefixSnapshotObserver(page, session.session_id);

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);
    evidenceProbe = startRealAgUiSseProbe(realBackendUrl(), runId);
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });
    await evidenceProbe.waitForTextDeltas(1, 90_000);
    expect(hasTerminalEvent(evidenceProbe.events)).toBe(false);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRealShellReady(page);
    await installUiPrefixSnapshotObserver(page, session.session_id, true);
    await expect.poll(() => {
      const runStreams = eventStreamEvidenceForRun(browserStreams.requests, runId ?? "");
      return hasPositiveRecoveryCursor(runStreams);
    }, { timeout: 30_000 }).toBe(true);

    const terminal = await evidenceProbe.waitForTerminal(150_000);
    await expectUiRunSettled(page, session.session_id, runId, testInfo);
    const finalOutput = assertRealStreamEvidence(evidenceProbe.events, terminal);
    const streamIdentity = streamIdentityFromOutput(finalOutput);
    await expectFinalUiConvergence(page, streamIdentity, finalOutput, testInfo);
    const prefixSnapshots = await uiPrefixSnapshots(page);
    assertStrictUiPrefixSnapshots(prefixSnapshots, finalOutput);
    const recoveryRequests = eventStreamEvidenceForRun(
      browserStreams.requests,
      runId,
    );
    expect(hasPositiveRecoveryCursor(recoveryRequests)).toBe(true);
    await recordRealStreamEvidence(testInfo, {
      events: evidenceProbe.events,
      modelProfiles: tokenUsageModelProfiles(evidenceProbe.events),
      prefixSnapshots,
      recoveryRequests,
      runId,
    });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "real normal active refresh should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "real-live-normal-active-after-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await browserStreams.stop();
    await evidenceProbe?.stop();
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
    await waitForAppShell(page);
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
  await page.goto(`${realBackendUrl()}/?codex_verify=${encodeURIComponent(title)}`, {
    waitUntil: "domcontentloaded",
  });
}

function streamTagFromTitle(title: string): string {
  return title.replace(/[^A-Za-z0-9_-]/g, "_").replace(/-/g, "_");
}

function realStreamNonce(): string {
  return `LIVE${Date.now().toString(36).toUpperCase()}`;
}

function longPlainTextStreamingPrompt(nonce: string): string {
  return [
    "请不要调用任何工具，直接用中文完成写作。",
    `请以“流式证据 ${nonce}。”开头，随后写一篇约一千五百字的连贯说明文，`,
    "主题是大型软件系统中如何观察、恢复并验证实时文本流。",
    "内容应覆盖事件顺序、增量拼接、终态收敛、页面切换隔离、刷新恢复游标、重复消息防护和可诊断证据。",
    "请使用十五个自然段，每段至少三句，句式自然并提供具体技术推理。",
    "只输出纯文本段落，不使用标题、列表、Markdown、代码块或额外说明。",
  ].join("");
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
  await waitForAppShell(page);
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
  const createdFallbackSessionId = await switchAwayFromSession(page, title);
  await switchBackToSession(page, title);
  if (createdFallbackSessionId !== null) {
    await deleteRealSession(createdFallbackSessionId);
  }
}

async function switchAwayFromSession(
  page: Page,
  title: string,
): Promise<string | null> {
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
  return createdFallbackSessionId;
}

async function switchBackToSession(page: Page, title: string): Promise<void> {
  await page.locator(".at-session-item").filter({ hasText: title }).first().click();
  await expect(page.locator(".at-session-item.is-selected")).toContainText(title);
}

async function installUiPrefixSnapshotObserver(
  page: Page,
  sessionId: string,
  preserveExisting = false,
): Promise<void> {
  await page.evaluate(({ expectedSessionId, preserve }) => {
    const storageKey = "agentTeams.realStreamPrefixSnapshots";
    if (!preserve) {
      window.sessionStorage.setItem(storageKey, "[]");
    }
    const recordSnapshot = () => {
      if (
        window.localStorage.getItem("agentTeams.selectedSessionId") !==
        expectedSessionId
      ) {
        return;
      }
      const streamingNodes = document.querySelectorAll(
        ".at-chat-view .at-message-streaming-text, .at-chat-view .at-message-plain-stream",
      );
      const messageNodes = document.querySelectorAll(
        ".at-chat-view article.at-message",
      );
      const node = streamingNodes.item(streamingNodes.length - 1) ||
        messageNodes.item(messageNodes.length - 1);
      const text = (node?.textContent ?? "").replace(/\s+/g, "");
      if (text.length === 0) {
        return;
      }
      const parsed: unknown = JSON.parse(
        window.sessionStorage.getItem(storageKey) ?? "[]",
      );
      const snapshots = Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (snapshots.at(-1) !== text) {
        snapshots.push(text);
        window.sessionStorage.setItem(storageKey, JSON.stringify(snapshots));
      }
    };
    const observer = new MutationObserver(recordSnapshot);
    observer.observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    recordSnapshot();
  }, { expectedSessionId: sessionId, preserve: preserveExisting });
}

async function uiPrefixSnapshots(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem("agentTeams.realStreamPrefixSnapshots") ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  });
}

function assertStrictUiPrefixSnapshots(
  snapshots: string[],
  finalOutput: string,
): void {
  const normalizedFinal = normalizeStreamText(finalOutput);
  const strictPrefixes = snapshots.filter(
    (snapshot) =>
      snapshot.length > 0 &&
      snapshot.length < normalizedFinal.length &&
      normalizedFinal.startsWith(snapshot),
  );
  expect(strictPrefixes.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < strictPrefixes.length; index += 1) {
    const previous = strictPrefixes[index - 1] ?? "";
    const current = strictPrefixes[index] ?? "";
    expect(current.startsWith(previous)).toBe(true);
    expect(current.length).toBeGreaterThan(previous.length);
  }
}

function assertRealStreamEvidence(
  events: AgUiSseEventEvidence[],
  terminal: AgUiSseEventEvidence,
): string {
  expect(terminal.relayEventType).toBe("run_completed");
  const eventIds = events.map((event) => event.eventId);
  expect(eventIds.length).toBeGreaterThan(0);
  expect(new Set(eventIds).size).toBe(eventIds.length);
  for (let index = 1; index < eventIds.length; index += 1) {
    expect(eventIds[index] ?? 0).toBeGreaterThan(eventIds[index - 1] ?? 0);
  }
  const deltas = events.filter(
    (event) =>
      event.relayEventType === "text_delta" &&
      payloadText(event.payload).length > 0,
  );
  expect(deltas.length).toBeGreaterThanOrEqual(3);
  expect(deltas.every((event) => event.sequence < terminal.sequence)).toBe(true);
  expect(deltas.at(-1)?.eventId ?? 0).toBeLessThan(terminal.eventId);
  const finalOutput = concatenatedTextDeltas(events);
  expect(normalizeStreamText(finalOutput).length).toBeGreaterThan(300);
  const profiles = tokenUsageModelProfiles(events);
  expect(profiles.length).toBeGreaterThan(0);
  const configuredProfile = realModelProfile();
  if (configuredProfile !== null) {
    expect(profiles).toContain(configuredProfile);
  }
  return finalOutput;
}

async function expectFinalUiConvergence(
  page: Page,
  streamIdentity: string,
  finalOutput: string,
  testInfo: TestInfo,
): Promise<void> {
  const normalizedOutput = normalizeVisibleStreamText(finalOutput);
  await expect.poll(
    () => latestMessageArticleContainingText(page, streamIdentity),
    { timeout: 60_000 },
  ).toBe(normalizedOutput);
  try {
    await expect.poll(() => messageArticleContainingCount(page, streamIdentity)).toBe(1);
  } catch (error) {
    const articleDiagnostic = await page
      .locator(".at-chat-view article.at-message")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          className: node.className,
          rowKey: node.getAttribute("data-row-key"),
          runId: node.getAttribute("data-run-id"),
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
        })),
      );
    await testInfo.attach("duplicate-article-diagnostic", {
      body: JSON.stringify(articleDiagnostic, null, 2),
      contentType: "application/json",
    });
    throw new Error(
      `Final answer did not converge to one article. ${String(error)}\n` +
      JSON.stringify(articleDiagnostic, null, 2),
    );
  }
  await expect.poll(() => messageArticleExactTextCount(page, finalOutput)).toBe(1);
}

async function messageArticleExactTextCount(
  page: Page,
  text: string,
): Promise<number> {
  const normalizedExpected = normalizeVisibleStreamText(text);
  const articleTexts = await page
    .locator(".at-chat-view article.at-message")
    .allTextContents();
  return articleTexts.filter(
    (articleText) => normalizeVisibleStreamText(articleText) === normalizedExpected,
  ).length;
}

function normalizeVisibleStreamText(text: string): string {
  return normalizeStreamText(text.replaceAll("`", ""));
}

async function latestMessageArticleContainingText(
  page: Page,
  text: string,
): Promise<string> {
  const normalizedNeedle = normalizeStreamText(text);
  const articleTexts = await page
    .locator(".at-chat-view article.at-message")
    .allTextContents();
  const matching = articleTexts.filter((articleText) =>
    normalizeStreamText(articleText).includes(normalizedNeedle),
  );
  return normalizeVisibleStreamText(matching.at(-1) ?? "");
}

async function recordRealStreamEvidence(
  testInfo: TestInfo,
  evidence: Record<string, unknown>,
): Promise<void> {
  await testInfo.attach("real-ag-ui-stream-evidence", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
}

async function expectUiRunSettled(
  page: Page,
  sessionId: string,
  runId: string,
  testInfo: TestInfo,
): Promise<void> {
  try {
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeHidden({
      timeout: 30_000,
    });
  } catch (error) {
    const [session, recovery] = await Promise.all([
      fetchJson<Record<string, unknown>>(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
      ).catch((requestError: unknown) => ({
        request_error: String(requestError),
      })),
      fetchJson<Record<string, unknown>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/recovery?force_refresh=true`,
      ).catch((requestError: unknown) => ({
        request_error: String(requestError),
      })),
    ]);
    await testInfo.attach("ui-terminal-settle-diagnostic", {
      body: JSON.stringify({
        mainTimelineText: await mainTimelineMessageArticleText(page),
        recovery,
        runId,
        session,
        stopButtonCount: await page.getByRole("button", { name: /停止|Stop/ }).count(),
      }, null, 2),
      contentType: "application/json",
    });
    throw error;
  }
}

function normalizeStreamText(text: string): string {
  return text.replace(/\s+/g, "");
}

function streamIdentityFromOutput(text: string): string {
  const normalized = normalizeStreamText(text);
  expect(normalized.length).toBeGreaterThanOrEqual(12);
  return normalized.slice(0, Math.min(32, normalized.length));
}

function payloadText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "";
  }
  const text = (payload as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function latestEventId(events: AgUiSseEventEvidence[]): number {
  return events.at(-1)?.eventId ?? 0;
}

function hasTerminalEvent(events: AgUiSseEventEvidence[]): boolean {
  return events.some((event) =>
    ["run_completed", "run_failed", "run_stopped"].includes(
      event.relayEventType,
    ),
  );
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

async function messageArticleContainingCount(page: Page, text: string): Promise<number> {
  return page.locator(".at-chat-view article.at-message").evaluateAll(
    (nodes, needle) => {
      const normalizedNeedle = needle.replace(/\s+/g, "");
      return nodes.filter((node) =>
        (node.textContent ?? "").replace(/\s+/g, "").includes(normalizedNeedle),
      ).length;
    },
    text,
  );
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
  const session = await fetchJson<SessionRecord>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  ).catch(() => null);
  if (session === null) {
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
  const modelProfile = realModelProfile();
  return fetchJson<SessionRecord>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      metadata: { title },
      ...(modelProfile === null
        ? {}
        : { normal_model_profile: modelProfile }),
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

function realModelProfile(): string | null {
  const profile = process.env.AGENT_TEAMS_REAL_MODEL_PROFILE?.trim() ?? "";
  return profile.length > 0 ? profile : null;
}
