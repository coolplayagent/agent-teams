import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  screenshotPath,
  waitForAppShell,
} from "./support/frontend-app";
import {
  type ManagedRealBackend,
  startManagedRealBackend,
} from "./support/managed-real-backend";
import {
  eventStreamEvidenceForSubagentSession,
  eventStreamEvidenceForRun,
  eventStreamFailuresForSubagentSession,
  eventStreamFailuresForRun,
  hasPositiveRecoveryCursor,
  observeEventStreams,
  type EventStreamProbe,
} from "./support/stream-network-recovery";

const SCREENSHOT_FOLDER = "frontend-v2-managed-backend-live";
const MANAGED_LIVE_ENABLED = process.env.AGENT_TEAMS_MANAGED_LIVE_STREAM === "1";
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

interface StreamVisibilityProbe {
  eventSourceCount: number;
  eventSourceUrls: string[];
  connectingVisibleAt: number | null;
  localPromptVisibleAt: number | null;
  promptText: string;
  sendAt: number | null;
  firstSubagentEventAt: number | null;
  firstSubagentVisibleAt: number | null;
}

test.skip(
  !MANAGED_LIVE_ENABLED,
  "Set AGENT_TEAMS_MANAGED_LIVE_STREAM=1 to run managed fake-backend streaming checks.",
);

test.setTimeout(240_000);

let managedBackend: ManagedRealBackend;

test.beforeAll(async () => {
  managedBackend = await startManagedRealBackend();
});

test.afterAll(async () => {
  await managedBackend?.close();
});

test("managed backend normal stream receives incremental chunks and survives session switch", async ({
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
    await expectTerminalAnswerDoesNotReplay(page, expectedText);
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
      `${title}: [slow-stream tag=${streamTag} repeat=32 delay=80 chunk=8 hold=2500]`,
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
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 90_000 })
      .toContain(lastToken);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    const liveCompleteSnapshot = await terminalAnswerSnapshot(page, expectedText);
    expect(liveCompleteSnapshot.answerCount).toBe(1);
    expect(liveCompleteSnapshot.answerLength).toBeGreaterThanOrEqual(expectedText.length);
    expect(liveCompleteSnapshot.rowKey).not.toBe("");
    const liveCompleteProbeId = await markTerminalAnswerProbe(page, expectedText);

    await waitForRunToLeaveActive(session.session_id, runId, 120_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 45_000 })
      .toContain(lastToken);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectTerminalAnswerDoesNotReplay(
      page,
      expectedText,
      liveCompleteSnapshot.rowKey,
      liveCompleteProbeId,
    );
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
    await expectTerminalAnswerDoesNotReplay(page, expectedText);
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

test("managed backend keeps a fully displayed live answer stable when terminal status arrives", async ({
  page,
}) => {
  const title = `managed-live-hold-${Date.now()}`;
  const session = await createSession(title);
  let runId: string | null = null;
  const expectedText = "[fake-llm] Holding slow stream for concurrency validation.";
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, `${title}: [slow-stream-hold ms=5000]`);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 45_000 })
      .toContain(expectedText);
    const liveSnapshot = await terminalAnswerSnapshot(page, expectedText);
    expect(liveSnapshot.answerCount).toBe(1);
    expect(liveSnapshot.answerLength).toBeGreaterThanOrEqual(expectedText.length);
    expect(liveSnapshot.rowKey).not.toBe("");
    const liveProbeId = await markTerminalAnswerProbe(page, expectedText);

    await waitForRunToLeaveActive(session.session_id, runId, 90_000);
    await expectTerminalAnswerDoesNotReplay(
      page,
      expectedText,
      liveSnapshot.rowKey,
      liveProbeId,
    );
    await expectNoDocumentScroll(
      page,
      "managed held live stream should not rebuild when terminal status arrives",
    );
    await page.screenshot({
      fullPage: false,
      path: screenshotPath("managed-live-hold-terminal-stable.png", SCREENSHOT_FOLDER),
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

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expectTerminalAnswerDoesNotReplay(page, expectedText);
    await expectNoDocumentScroll(
      page,
      "managed active terminal hard refresh should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-active-refresh-terminal-reload.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend active stream recovers when stored selection points elsewhere", async ({
  page,
}) => {
  const title = `managed-live-stale-selection-${Date.now()}`;
  const session = await createSession(title);
  const fallback = await createSession(`managed-live-hidden-target-${Date.now()}`);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const expectedText = slowStreamExpectedText(streamTag, 72);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, 71);
    const promptText = [
      `${title}: [slow-stream tag=${streamTag} repeat=72 delay=100 chunk=8]`,
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

    const liveSnippet = await stableLiveStreamSnippet(page);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");

    await expect
      .poll(() => messageArticleContainingCount(page, liveSnippet))
      .toBe(1);
    await page.locator(".at-session-item").filter({
      hasText: fallback.metadata?.title ?? "",
    }).first().click();
    await expect(page.locator(".at-session-item.is-selected")).not.toContainText(title);
    await expect(page.getByText(liveSnippet)).toHaveCount(0);
    await page.evaluate(({ sessionId, workspaceId }) => {
      window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
      window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    }, {
      sessionId: fallback.session_id,
      workspaceId: fallback.workspace_id ?? "default",
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect(page.locator(".at-session-item.is-selected")).toContainText(title);
    await expect.poll(() => messageArticleContainingCount(page, liveSnippet))
      .toBe(1);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect
      .poll(() => latestLiveStreamText(page), { timeout: 90_000 })
      .toContain(firstToken);
    const recoveredSamples = await collectLiveStreamTextLengthSamples(page, 90_000, 80);
    expect(increasingSampleCount(recoveredSamples)).toBeGreaterThanOrEqual(2);

    await waitForRunToLeaveActive(session.session_id, createdRunId, 180_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(lastToken);
    await expectTerminalAnswerDoesNotReplay(page, expectedText);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, expectedText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed stale-selection active refresh should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-stale-selection-active-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(fallback.session_id);
    await deleteSession(session.session_id);
  }
});

test("managed backend normal stream resumes exactly after a Chromium network cut", async ({
  page,
}) => {
  const title = `managed-live-network-cut-${Date.now()}`;
  const session = await createSession(title);
  const probe = await observeEventStreams(page);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const streamTag = streamTagFromTitle(title);
    const tokenCount = 72;
    const expectedText = slowStreamExpectedText(streamTag, tokenCount);
    const firstToken = slowStreamToken(streamTag, 0);
    const lastToken = slowStreamToken(streamTag, tokenCount - 1);
    const promptText = [
      `${title}: [slow-stream tag=${streamTag} repeat=${tokenCount} delay=110 chunk=8]`,
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
    const beforeCutText = await latestLiveStreamText(page);
    expect(beforeCutText.length).toBeGreaterThan(0);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");

    await interruptManagedStreamAndExpectRecovery(probe, createdRunId);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");

    const recoveredSamples = await collectLiveStreamTextLengthSamples(page, 90_000, 80);
    expect(increasingSampleCount([beforeCutText.length, ...recoveredSamples]))
      .toBeGreaterThanOrEqual(2);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-network-cut-recovered-streaming.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await waitForRunToLeaveActive(session.session_id, createdRunId, 180_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(lastToken);
    await expectTerminalAnswerDoesNotReplay(page, expectedText);
    await expect.poll(() => messageArticleTextOccurrenceCount(page, firstToken))
      .toBe(1);
    await expect
      .poll(() => strictPrefixMessageArticleCount(page, expectedText))
      .toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed network-cut stream should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-network-cut-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await probe.stop();
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend normal tool pressure streams compact lifecycle cards", async ({
  page,
}) => {
  const title = `managed-live-tool-pressure-${Date.now()}`;
  const session = await createSession(title);
  const probe = await observeEventStreams(page);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const toolTag = streamTagFromTitle(title);
    const toolCount = 3;
    const finalText = `[fake-llm] normal tool pressure completed ${toolCount} shell calls.`;
    const promptText = [
      `${title}: [normal-tool-pressure count=${toolCount} delay=9000 tag=${toolTag}]`,
      "请运行 fake LLM 请求的 shell 工具并用最终文本收尾。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    await expect.poll(() => visibleRunningToolCardCount(page), {
      timeout: 90_000,
    }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => toolCardCount(page), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(toolCount);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-tool-pressure-running.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await interruptManagedStreamAndExpectRecovery(probe, createdRunId);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect.poll(() => toolCardCount(page), { timeout: 45_000 })
      .toBeGreaterThanOrEqual(toolCount);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-tool-pressure-after-network-recovery.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect.poll(() => toolCardCount(page), { timeout: 45_000 })
      .toBeGreaterThanOrEqual(toolCount);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-tool-pressure-after-active-refresh.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await switchAwayAndBack(page, title);
    await expect.poll(() => toolCardCount(page), { timeout: 45_000 })
      .toBeGreaterThanOrEqual(toolCount);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);

    await waitForRunToLeaveActive(session.session_id, createdRunId, 180_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(finalText);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectToolPressureTerminalState(page, toolCount, finalText);
    await expectNoDocumentScroll(
      page,
      "managed normal tool pressure should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-tool-pressure-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await probe.stop();
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend orchestration tool stream survives active refresh without role leakage", async ({
  page,
}) => {
  const title = `managed-live-orchestration-tool-${Date.now()}`;
  const session = await createSession(title);
  const probe = await observeEventStreams(page);
  let runId: string | null = null;
  try {
    await updateSessionTopology(session.session_id, {
      session_mode: "orchestration",
      orchestration_preset_id: null,
      normal_root_role_id: null,
    });
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);
    await expect(page.locator(".at-composer")).toContainText(/编排模式|Orchestration/);

    const taskCount = 2;
    const titleTag = streamTagFromTitle(title);
    const finalText = `[fake-llm] orchestration tool pressure completed ${taskCount} tasks.`;
    const promptText = [
      `${title}: [orch-tool-pressure count=${taskCount} tools=2 delay=5000]`,
      `请以编排模式执行工具压力验证，标记 ${titleTag}。`,
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    await expect.poll(() => toolCardCount(page), { timeout: 120_000 })
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-orchestration-tool-running.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await interruptManagedStreamAndExpectRecovery(probe, createdRunId, 500);
    await expect(page.locator(".at-composer")).toContainText(/编排模式|Orchestration/);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect.poll(() => toolCardCount(page), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-orchestration-tool-after-network-recovery.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect(page.locator(".at-composer")).toContainText(/编排模式|Orchestration/);
    await expect
      .poll(() => currentRunStatus(session.session_id, createdRunId))
      .toBe("active");
    await expect.poll(() => toolCardCount(page), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");

    await switchAwayAndBack(page, title);
    await expect(page.locator(".at-composer")).toContainText(/编排模式|Orchestration/);
    await expect.poll(() => toolCardCount(page), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect
      .poll(() => mainTimelineMessageArticleText(page))
      .not.toContain("Return only the delegation plan JSON object");

    await waitForRunToLeaveActive(session.session_id, createdRunId, 240_000);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 90_000 })
      .toContain(finalText);
    await expect.poll(() => messageArticleContainingCount(page, finalText)).toBe(1);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect.poll(() => nakedRuntimeRoleLineCount(page)).toBe(0);
    await expect(page.locator(".at-message-role")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed orchestration tool stream should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-orchestration-tool-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await probe.stop();
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend subagent stream receives incremental chunks in the right panel", async ({
  page,
}) => {
  const title = `managed-live-subagent-${Date.now()}`;
  const session = await createSession(title);
  const probe = await observeEventStreams(page);
  let runId: string | null = null;
  try {
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const childTag = streamTagFromTitle(title);
    const childTokenCount = 14;
    const firstToken = subagentStreamToken(childTag, 0);
    const lastToken = subagentStreamToken(childTag, childTokenCount - 1);
    const finalText = "[fake-llm] subagent lifecycle completed";
    const promptText = [
      `${title}: [hook-subagent-lifecycle tag=${childTag}]`,
      "请通过 spawn_subagent 启动 Explorer 子代理，并让子代理流式输出确定性 token。",
      "主代理不要复述子代理 token，子代理完成后只输出 fake LLM 的最终完成句。",
    ].join("\n");

    const runResponse = waitForRunCreateResponse(page);
    await submitPrompt(page, promptText);
    const createdRunId = await runIdFromResponse(await runResponse);
    runId = createdRunId;
    await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({
      timeout: 20_000,
    });

    const subagentCard = page.locator(".at-chat-view .at-message-tool.is-openable-subagent")
      .first();
    await expect(subagentCard).toBeVisible({ timeout: 90_000 });
    await subagentCard.click();

    const panel = page.locator(".at-subagent-session-view");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => panel.locator(".at-subagent-session-prompt").textContent())
      .toContain(childTag);
    await expect
      .poll(() => latestSubagentPanelRuntimeText(panel), { timeout: 90_000 })
      .toContain(firstToken);
    expect(await latestSubagentPanelRuntimeText(panel)).not.toContain(lastToken);

    await interruptManagedSubagentStreamAndExpectRecovery(
      probe,
      session.session_id,
    );
    await expect(panel).toBeVisible();
    await expect
      .poll(() => panel.locator(".at-subagent-session-prompt").textContent())
      .toContain(childTag);
    await expect
      .poll(() => latestSubagentPanelRuntimeText(panel), { timeout: 45_000 })
      .toContain(firstToken);
    expect(await latestSubagentPanelRuntimeText(panel)).not.toContain(lastToken);
    await expect.poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(firstToken);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-subagent-panel-after-network-recovery.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectManagedShellReady(page);
    await expect(page.locator(".at-subagent-session-view")).toBeVisible({
      timeout: 30_000,
    });
    const restoredPanel = page.locator(".at-subagent-session-view");
    await expect
      .poll(() => restoredPanel.locator(".at-subagent-session-prompt").textContent(), {
        timeout: 45_000,
      })
      .toContain(childTag);
    await expect
      .poll(() => latestSubagentPanelRuntimeText(restoredPanel), { timeout: 60_000 })
      .toContain(firstToken);
    expect(await latestSubagentPanelRuntimeText(restoredPanel)).not.toContain(lastToken);

    const tokenSamples = await collectSubagentPanelTokenProgressSamples(
      restoredPanel,
      childTag,
      childTokenCount,
      90_000,
      45,
    );
    expect(increasingSampleCount(tokenSamples)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tokenSamples)).toBeLessThan(childTokenCount - 1);
    await expect.poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(firstToken);
    await expect.poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(lastToken);

    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-subagent-panel-restored-streaming.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await waitForRunToLeaveActive(session.session_id, createdRunId, 180_000);
    await expect
      .poll(() => restoredPanel.textContent(), { timeout: 60_000 })
      .toContain(lastToken);
    await expect
      .poll(() => mainTimelineMessageArticleText(page), { timeout: 60_000 })
      .toContain(finalText);
    await expect.poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(firstToken);
    await expect.poll(() => mainTimelineMessageArticleText(page))
      .not.toContain(lastToken);
    await expect(restoredPanel.locator(".streaming-cursor")).toHaveCount(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "managed subagent live stream should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      fullPage: false,
      path: screenshotPath(
        "managed-live-subagent-panel-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await probe.stop();
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

test("managed backend makes thinking and subagent activity visible within one second", async ({
  page,
}) => {
  const title = `managed-live-visibility-sla-${Date.now()}`;
  const session = await createSession(title);
  let runId: string | null = null;
  try {
    await installStreamVisibilityProbe(page);
    await openManagedSession(page, session, title);
    await expectManagedShellReady(page);

    const childTag = streamTagFromTitle(title);
    const promptText = [
      `${title}: [hook-subagent-lifecycle tag=${childTag} worker_repeat=24 worker_delay=120]`,
      "请通过 spawn_subagent 启动 Explorer 子代理。",
    ].join("\n");
    const runResponse = waitForRunCreateResponse(page);
    await armStreamVisibilityProbe(page, promptText);
    await submitPrompt(page, promptText);
    runId = await runIdFromResponse(await runResponse);

    await expect.poll(() => streamVisibilityProbe(page), { timeout: 90_000 })
      .toMatchObject({
        connectingVisibleAt: expect.any(Number),
        localPromptVisibleAt: expect.any(Number),
        sendAt: expect.any(Number),
        firstSubagentEventAt: expect.any(Number),
        firstSubagentVisibleAt: expect.any(Number),
      });
    const probe = await streamVisibilityProbe(page);
    expect(visibilityDelay(probe.sendAt, probe.localPromptVisibleAt)).toBeLessThan(100);
    expect(visibilityDelay(probe.sendAt, probe.connectingVisibleAt)).toBeLessThan(1_000);
    expect(visibilityDelay(probe.firstSubagentEventAt, probe.firstSubagentVisibleAt))
      .toBeLessThan(1_000);
  } finally {
    await stopRunIfPresent(runId);
    await deleteSession(session.session_id);
  }
});

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
    if (window.sessionStorage.getItem("agentTeams.managedBackendLiveState") !== "1") {
      window.localStorage.removeItem("agentTeams.activeSubagentPanel");
      window.sessionStorage.setItem("agentTeams.managedBackendLiveState", "1");
    }
  }, {
    sessionId: session.session_id,
    workspaceId: session.workspace_id ?? "default",
  });
  await page.goto(`${apiBaseUrl()}/?codex_verify=${encodeURIComponent(title)}`, {
    waitUntil: "domcontentloaded",
  });
}

async function installStreamVisibilityProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: StreamVisibilityProbe = {
      eventSourceCount: 0,
      eventSourceUrls: [],
      connectingVisibleAt: null,
      localPromptVisibleAt: null,
      promptText: "",
      sendAt: null,
      firstSubagentEventAt: null,
      firstSubagentVisibleAt: null,
    };
    Object.defineProperty(window, "__agentTeamsStreamVisibilityProbe", {
      configurable: true,
      value: probe,
    });
    const NativeEventSource = window.EventSource;
    class ProbedEventSource extends NativeEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        probe.eventSourceCount += 1;
        probe.eventSourceUrls.push(String(url));
        this.addEventListener("subagent_session.status_changed", () => {
          probe.firstSubagentEventAt ??= performance.now();
        });
      }
    }
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: ProbedEventSource,
    });
    const captureVisibleState = () => {
      if (
        probe.sendAt !== null &&
        probe.localPromptVisibleAt === null &&
        probe.promptText.length > 0 &&
        Array.from(document.querySelectorAll(".at-chat-view .at-message")).some(
          (element) => element.textContent?.includes(probe.promptText) === true,
        )
      ) {
        probe.localPromptVisibleAt = performance.now();
      }
      if (
        probe.sendAt !== null &&
        probe.connectingVisibleAt === null &&
        document.querySelector(".at-chat-view .at-model-request-status") !== null
      ) {
        probe.connectingVisibleAt = performance.now();
      }
      if (
        probe.firstSubagentEventAt !== null &&
        probe.firstSubagentVisibleAt === null &&
        document.querySelector(
          ".at-chat-view .at-message-tool.is-openable-subagent",
        ) !== null
      ) {
        probe.firstSubagentVisibleAt = performance.now();
      }
    };
    new MutationObserver(captureVisibleState).observe(document, {
      childList: true,
      subtree: true,
    });
  });
}

async function armStreamVisibilityProbe(page: Page, promptText: string): Promise<void> {
  await page.evaluate((nextPromptText) => {
    const probe = (window as Window & {
      __agentTeamsStreamVisibilityProbe?: StreamVisibilityProbe;
    }).__agentTeamsStreamVisibilityProbe;
    if (probe === undefined) {
      throw new Error("Stream visibility probe was not installed.");
    }
    probe.promptText = nextPromptText;
    probe.sendAt = performance.now();
  }, promptText);
}

async function streamVisibilityProbe(page: Page): Promise<StreamVisibilityProbe> {
  return page.evaluate(() => {
    const probe = (window as Window & {
      __agentTeamsStreamVisibilityProbe?: StreamVisibilityProbe;
    }).__agentTeamsStreamVisibilityProbe;
    if (probe === undefined) {
      throw new Error("Stream visibility probe was not installed.");
    }
    return { ...probe };
  });
}

function visibilityDelay(
  eventAt: number | null,
  visibleAt: number | null,
): number {
  if (eventAt === null || visibleAt === null) {
    return Number.POSITIVE_INFINITY;
  }
  return visibleAt - eventAt;
}

async function expectManagedShellReady(page: Page): Promise<void> {
  await waitForAppShell(page);
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

async function collectSubagentPanelTokenProgressSamples(
  panel: Locator,
  tag: string,
  count: number,
  timeoutMs: number,
  delayMs: number,
): Promise<number[]> {
  const samples: number[] = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    samples.push(await highestVisibleSubagentTokenIndex(panel, tag, count));
    if (
      increasingSampleCount(samples) >= 3 &&
      Math.max(...samples) > 1 &&
      Math.max(...samples) < count - 1
    ) {
      return samples;
    }
    await panel.page().waitForTimeout(delayMs);
  }
  return samples;
}

async function highestVisibleSubagentTokenIndex(
  panel: Locator,
  tag: string,
  count: number,
): Promise<number> {
  const text = await latestSubagentPanelRuntimeText(panel);
  let highest = -1;
  for (let index = 0; index < count; index += 1) {
    if (text.includes(subagentStreamToken(tag, index))) {
      highest = index;
    }
  }
  return highest;
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

async function expectToolPressureTerminalState(
  page: Page,
  toolCount: number,
  finalText: string,
): Promise<void> {
  await expect.poll(() => messageArticleContainingCount(page, finalText))
    .toBe(1);
  const processed = page.locator("details.at-processed-group");
  await expect(processed).toHaveCount(1);
  const expectedCompletedSnapshot = Array.from(
    { length: toolCount },
    () => "completed:closed",
  ).join("|");
  await expect.poll(() => toolStatusSnapshot(page), { timeout: 60_000 })
    .toBe(expectedCompletedSnapshot);
  await expect(processed).not.toHaveAttribute("open", "");
  await expect.poll(() => visibleProcessedToolCardCount(page)).toBe(0);
  await processed.locator(".at-processed-group-summary").click();
  await expect(processed).toHaveAttribute("open", "");
  const completedTools = processed.locator(".at-message-tool[data-status='completed']");
  await expect(completedTools).toHaveCount(toolCount);
  await expect(processed.locator(".at-message-tool-spinner")).toHaveCount(0);
  await expect(processed.getByText("Running: shell")).toHaveCount(0);
  await expect(page.locator(".at-message-role")).toHaveCount(0);
  for (let index = 1; index <= toolCount; index += 1) {
    await expect(processed).toContainText(`tool-pressure-${index}`);
  }
}

async function interruptManagedStreamAndExpectRecovery(
  probe: EventStreamProbe,
  runId: string,
  offlineMs = 2_000,
): Promise<void> {
  const requestCountBeforeCut = eventStreamEvidenceForRun(
    probe.requests,
    runId,
  ).length;
  const failureCountBeforeCut = eventStreamFailuresForRun(
    probe.failures,
    runId,
  ).length;
  await managedBackend.interruptNetwork(offlineMs);
  await expect.poll(
    () => eventStreamFailuresForRun(probe.failures, runId).length,
    { timeout: 20_000 },
  ).toBeGreaterThan(failureCountBeforeCut);
  await expect.poll(
    () => eventStreamEvidenceForRun(probe.requests, runId).length,
    { timeout: 30_000 },
  ).toBeGreaterThan(requestCountBeforeCut);
  await expect.poll(() => hasPositiveRecoveryCursor(
    eventStreamEvidenceForRun(probe.requests, runId).slice(requestCountBeforeCut),
  ), { timeout: 20_000 }).toBe(true);
}

async function interruptManagedSubagentStreamAndExpectRecovery(
  probe: EventStreamProbe,
  sessionId: string,
): Promise<void> {
  const requestCountBeforeCut = eventStreamEvidenceForSubagentSession(
    probe.requests,
    sessionId,
  ).length;
  const failureCountBeforeCut = eventStreamFailuresForSubagentSession(
    probe.failures,
    sessionId,
  ).length;
  await managedBackend.interruptNetwork(500);
  await expect.poll(
    () => eventStreamFailuresForSubagentSession(probe.failures, sessionId).length,
    { timeout: 20_000 },
  ).toBeGreaterThan(failureCountBeforeCut);
  await expect.poll(
    () => eventStreamEvidenceForSubagentSession(probe.requests, sessionId).length,
    { timeout: 30_000 },
  ).toBeGreaterThan(requestCountBeforeCut);
  try {
    await expect.poll(() => hasPositiveRecoveryCursor(
      eventStreamEvidenceForSubagentSession(
        probe.requests,
        sessionId,
      ).slice(requestCountBeforeCut),
    ), { timeout: 20_000 }).toBe(true);
  } catch (error) {
    const recoveryEvidence = eventStreamEvidenceForSubagentSession(
      probe.requests,
      sessionId,
    ).slice(requestCountBeforeCut);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nSubagent recovery evidence: ${JSON.stringify(recoveryEvidence)}`,
    );
  }
}

async function toolCardCount(page: Page): Promise<number> {
  return page.locator(".at-chat-view .at-message-tool").count();
}

async function toolStatusSnapshot(page: Page): Promise<string> {
  return page.locator(".at-chat-view .at-message-tool").evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement;
      const status = element.dataset.status ?? "";
      const inClosedGroup =
        element.closest("details.at-processed-group:not([open])") !== null;
      return `${status}:${inClosedGroup ? "closed" : "visible"}`;
    }).join("|"),
  );
}

async function visibleProcessedToolCardCount(page: Page): Promise<number> {
  return page.locator("details.at-processed-group .at-message-tool")
    .evaluateAll((nodes) =>
      nodes.filter((node) => {
        const element = node as HTMLElement;
        return element.offsetParent !== null;
      }).length,
    );
}

async function visibleRunningToolCardCount(page: Page): Promise<number> {
  return page.locator(".at-chat-view .at-message-tool[data-status='running']")
    .evaluateAll((nodes) =>
      nodes.filter((node) => {
        const element = node as HTMLElement;
        return element.offsetParent !== null;
      }).length,
    );
}

async function nakedRuntimeRoleLineCount(page: Page): Promise<number> {
  return page.locator(".at-chat-view").evaluate((root) =>
    Array.from(root.querySelectorAll("article.at-message, .at-message-text"))
      .filter((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        return text === "MainAgent" || text === "Explorer" || text === "Crafter";
      }).length,
  );
}

async function expectTerminalAnswerDoesNotReplay(
  page: Page,
  expectedText: string,
  expectedRowKey?: string,
  expectedProbeId?: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const snapshot = await terminalAnswerSnapshot(page, expectedText);
      return [
        snapshot.answerCount,
        snapshot.cursorCount,
        snapshot.prefixRowCount,
        snapshot.streamingCount,
      ].join("|");
    }, { timeout: 20_000 })
    .toBe("1|0|0|0");
  const baseline = await terminalAnswerSnapshot(page, expectedText);
  expect(baseline.answerCount).toBe(1);
  expect(baseline.answerLength).toBeGreaterThanOrEqual(expectedText.length);
  expect(baseline.cursorCount).toBe(0);
  expect(baseline.prefixRowCount).toBe(0);
  expect(baseline.streamingCount).toBe(0);
  if (expectedRowKey !== undefined) {
    expect(baseline.rowKey).toBe(expectedRowKey);
  }
  const probeId = expectedProbeId ?? (await markTerminalAnswerProbe(page, expectedText));
  expect(baseline.probeId).toBe(expectedProbeId ?? "");
  for (let sampleIndex = 0; sampleIndex < 20; sampleIndex += 1) {
    await page.waitForTimeout(120);
    const sample = await terminalAnswerSnapshot(page, expectedText);
    expect(sample.answerCount).toBe(1);
    expect(sample.answerLength).toBeGreaterThanOrEqual(expectedText.length);
    expect(sample.cursorCount).toBe(0);
    expect(sample.prefixRowCount).toBe(0);
    expect(sample.rowKey).toBe(baseline.rowKey);
    expect(sample.streamingCount).toBe(0);
    expect(sample.probeId).toBe(probeId);
  }
}

async function markTerminalAnswerProbe(
  page: Page,
  expectedText: string,
): Promise<string> {
  const probeId = `terminal-answer-probe-${Date.now()}`;
  await page.locator(".at-chat-view").evaluate((root, payload) => {
    const normalizedExpected = payload.expectedText.replace(/\s+/g, " ").trim();
    const answer = Array.from(root.querySelectorAll("article.at-message"))
      .find((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        return text.includes(normalizedExpected);
      });
    if (answer instanceof HTMLElement) {
      answer.dataset.terminalAnswerProbe = payload.probeId;
    }
  }, { expectedText, probeId });
  return probeId;
}

async function terminalAnswerSnapshot(
  page: Page,
  expectedText: string,
): Promise<{
  answerCount: number;
  answerLength: number;
  cursorCount: number;
  prefixRowCount: number;
  probeId: string;
  rowKey: string;
  streamingCount: number;
}> {
  return page.locator(".at-chat-view").evaluate((root, expected) => {
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();
    const articles = Array.from(root.querySelectorAll("article.at-message"));
    const matchingArticles = articles.filter((node) => {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return text.includes(normalizedExpected);
    });
    const prefixRows = articles.filter((node) => {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return (
        text.length > 0 &&
        text.length < normalizedExpected.length &&
        normalizedExpected.startsWith(text)
      );
    });
    const answer = matchingArticles[0];
    return {
      answerCount: matchingArticles.length,
      answerLength: (answer?.textContent ?? "").replace(/\s+/g, " ").trim().length,
      cursorCount: root.querySelectorAll(".streaming-cursor").length,
      prefixRowCount: prefixRows.length,
      probeId: answer instanceof HTMLElement
        ? answer.dataset.terminalAnswerProbe ?? ""
        : "",
      rowKey: answer?.getAttribute("data-row-key") ?? "",
      streamingCount: root.querySelectorAll(".at-message-streaming-text, .at-message-plain-stream")
        .length,
    };
  }, expectedText);
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

async function updateSessionTopology(
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

function subagentStreamToken(tag: string, index: number): string {
  return `SUBAGENT_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function apiBaseUrl(): string {
  return managedBackend.apiBaseUrl;
}
