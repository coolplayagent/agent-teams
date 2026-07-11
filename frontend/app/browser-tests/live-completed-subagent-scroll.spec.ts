import { writeFile } from "node:fs/promises";
import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  screenshotPath,
  waitForAppShell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "live-completed-subagent-scroll";
const liveBaseUrl = process.env.LIVE_BASE_URL?.replace(/\/$/, "") ?? "";
const liveSessionId = process.env.LIVE_SESSION_ID?.trim() ?? "";
const liveWorkspaceId = process.env.LIVE_WORKSPACE_ID?.trim() || "default";
const liveSubagentTitle = process.env.LIVE_SUBAGENT_TITLE?.trim() ?? "";

interface LiveAcceptanceWindow extends Window {
  __agentTeamsActiveEventSources?: number;
  __agentTeamsLongTaskObserver?: PerformanceObserver;
  __agentTeamsLongTasks?: LongTaskSample[];
  __agentTeamsMaxEventSources?: number;
}

interface LongTaskSample {
  duration: number;
  startTime: number;
}

interface PerformanceSegment {
  endTime: number;
  label: string;
  layoutDurationMs: number;
  recalcStyleDurationMs: number;
  scriptDurationMs: number;
  startTime: number;
  taskDurationMs: number;
}

interface CdpPerformanceSnapshot {
  layoutDuration: number;
  recalcStyleDuration: number;
  scriptDuration: number;
  taskDuration: number;
}

interface PendingPerformanceSegment {
  label: string;
  startMetrics: CdpPerformanceSnapshot;
  startTime: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

test.setTimeout(60_000);

const cdpPerformanceSessions = new WeakMap<Page, CDPSession>();

test("scrolls and reopens a completed subagent from a live local deployment", async ({
  page,
}, testInfo) => {
  test.skip(
    liveBaseUrl.length === 0 || liveSessionId.length === 0,
    "Set LIVE_BASE_URL and LIVE_SESSION_ID to run the live deployment acceptance.",
  );
  assertLocalDeployment(liveBaseUrl);

  let pageCrashed = false;
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  const pageErrors: string[] = [];
  page.on("crash", () => {
    pageCrashed = true;
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await ensureScreenshotDir(SCREENSHOT_FOLDER);
  await installEventSourceProbe(page);
  await installLiveSessionState(page);
  await page.goto(`${liveBaseUrl}/?live_completed_subagent_scroll=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForAppShell(page);
  await installCdpPerformanceSession(page);

  const card = completedSubagentCard(page);
  await expect(card).not.toHaveCount(0);
  await expandProcessedGroupsUntilCardIsVisible(page, card);
  await expect(card).toBeVisible();
  await card.locator(".at-message-tool-summary").click();
  const panel = page.locator(".at-subagent-session-view");
  await expect(panel).toBeVisible();
  await page.waitForTimeout(100);
  await closeSubagentPanel(panel);
  await collectGarbage(page);
  await installLongTaskObserver(page);
  const heapBeforeBytes = await usedJsHeapSize(page);
  const performanceSegments: PerformanceSegment[] = [];

  const openStartedAt = performance.now();
  const openSegment = await beginPerformanceSegment(page, "open-subagent");
  await card.locator(".at-message-tool-summary").click();

  await expect(panel).toBeVisible();
  const prompt = panel.locator(".at-subagent-session-prompt");
  const timeline = panel.locator(
    ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
  );
  await expect(prompt).toBeVisible();
  await expect(timeline).toBeVisible();
  await endPerformanceSegment(page, openSegment, performanceSegments);
  const openSubagentMs = performance.now() - openStartedAt;
  await expectScrollable(prompt, "live subagent prompt");
  await expectScrollable(timeline, "live subagent transcript");

  await captureStableScreenshot(page, "live-subagent-before-wheel.jpg");

  const promptWheelStartedAt = performance.now();
  const promptWheelSegment = await beginPerformanceSegment(page, "prompt-wheel");
  await wheelToBottom(page, prompt);
  await endPerformanceSegment(page, promptWheelSegment, performanceSegments);
  const promptWheelToBottomMs = performance.now() - promptWheelStartedAt;
  const timelineBottomBefore = await bottomDistance(timeline);
  const timelineWheelStartedAt = performance.now();
  const timelineWheelSegment = await beginPerformanceSegment(page, "timeline-wheel");
  await timeline.hover();
  await page.mouse.wheel(0, -900);
  await expect.poll(() => bottomDistance(timeline)).toBeGreaterThan(
    timelineBottomBefore + 100,
  );
  await wheelToBottom(page, timeline);
  await endPerformanceSegment(page, timelineWheelSegment, performanceSegments);
  const timelineWheelRoundTripMs = performance.now() - timelineWheelStartedAt;
  await expectNoDocumentScroll(
    page,
    "live completed subagent scrolling must stay inside the side panel",
  );
  await captureStableScreenshot(page, "live-subagent-after-wheel.jpg");

  const backStartedAt = performance.now();
  const backSegment = await beginPerformanceSegment(page, "back-to-main");
  await closeSubagentPanel(panel);
  await endPerformanceSegment(page, backSegment, performanceSegments);
  const backToMainMs = performance.now() - backStartedAt;
  const switchSessionMs = await switchAwayAndBack(
    page,
    performanceSegments,
    "initial-switch",
  );
  const reopenStartedAt = performance.now();
  const reopenSegment = await beginPerformanceSegment(page, "reopen-subagent");
  await completedSubagentCard(page).locator(".at-message-tool-summary").click();
  await expect(panel).toBeVisible();
  await expect(panel.locator(".at-subagent-session-prompt")).toBeVisible();
  await expect(panel.locator(".at-timeline")).toBeVisible();
  await endPerformanceSegment(page, reopenSegment, performanceSegments);
  const reopenSubagentMs = performance.now() - reopenStartedAt;
  await captureStableScreenshot(page, "live-subagent-reopened.jpg");
  await closeSubagentPanel(panel);
  const repeatedCycles = await exerciseRepeatedNavigation(
    page,
    panel,
    5,
    performanceSegments,
  );
  await collectGarbage(page);
  const heapAfterBytes = await usedJsHeapSize(page);
  const eventSourceCounts = await page.evaluate(() => ({
    active: (window as LiveAcceptanceWindow).__agentTeamsActiveEventSources ?? 0,
    max: (window as LiveAcceptanceWindow).__agentTeamsMaxEventSources ?? 0,
  }));
  const longTasks = await readLongTasks(page);
  const segmentLongTasks = performanceSegments.map((segment) => {
    const matching = longTasks.filter((task) =>
      task.startTime >= segment.startTime && task.startTime < segment.endTime
    );
    return {
      ...segment,
      longTaskCount: matching.length,
      maxLongTaskMs: Math.max(0, ...matching.map((task) => task.duration)),
      totalLongTaskMs: matching.reduce(
        (total, task) => total + task.duration,
        0,
      ),
    };
  });
  const userActionLongTasks = longTasks.filter((task) =>
    performanceSegments.some((segment) =>
      task.startTime >= segment.startTime && task.startTime < segment.endTime
    )
  );
  const unexpectedFailedResponses = failedResponses.filter(
    (response) => !response.endsWith("/favicon.ico"),
  );
  const unexpectedConsoleErrors = consoleErrors.filter((message) =>
    message !== "Failed to load resource: the server responded with a status of 404 (Not Found)" ||
    unexpectedFailedResponses.length > 0
  );
  const metrics = {
    backToMainMs,
    consoleErrors,
    eventSourceCounts,
    failedResponses,
    heapAfterBytes,
    heapBeforeBytes,
    heapGrowthBytes:
      heapAfterBytes === null || heapBeforeBytes === null
        ? null
        : heapAfterBytes - heapBeforeBytes,
    longTaskCount: longTasks.length,
    maxLongTaskMs: Math.max(0, ...longTasks.map((task) => task.duration)),
    segmentLongTasks,
    totalLongTaskMs: longTasks.reduce(
      (total, task) => total + task.duration,
      0,
    ),
    totalUserActionLongTaskMs: userActionLongTasks.reduce(
      (total, task) => total + task.duration,
      0,
    ),
    openSubagentMs,
    pageCrashed,
    pageErrors,
    promptWheelToBottomMs,
    reopenSubagentMs,
    repeatedCycles,
    switchSessionMs,
    timelineWheelRoundTripMs,
    unexpectedConsoleErrors,
    unexpectedFailedResponses,
  };
  const metricsPath = testInfo.outputPath("live-subagent-pressure-metrics.json");
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await testInfo.attach("live-subagent-pressure-metrics", {
    contentType: "application/json",
    path: metricsPath,
  });

  expect(openSubagentMs).toBeLessThan(1_500);
  expect(promptWheelToBottomMs).toBeLessThan(500);
  expect(timelineWheelRoundTripMs).toBeLessThan(500);
  expect(backToMainMs).toBeLessThan(750);
  expect(switchSessionMs).toBeLessThan(1_500);
  expect(reopenSubagentMs).toBeLessThan(1_500);
  expect(Math.max(...repeatedCycles.map((cycle) => cycle.openMs)))
    .toBeLessThan(1_500);
  expect(Math.max(...repeatedCycles.map((cycle) => cycle.backMs)))
    .toBeLessThan(750);
  expect(Math.max(...repeatedCycles.map((cycle) => cycle.switchMs)))
    .toBeLessThan(1_500);
  expect(metrics.maxLongTaskMs).toBeLessThan(300);
  expect(metrics.totalLongTaskMs).toBeLessThan(2_000);
  expect(eventSourceCounts.max).toBeLessThanOrEqual(2);
  expect(eventSourceCounts.active).toBeLessThanOrEqual(1);
  if (metrics.heapGrowthBytes !== null) {
    expect(metrics.heapGrowthBytes).toBeLessThan(32 * 1024 * 1024);
  }
  expect(unexpectedFailedResponses).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(pageCrashed).toBe(false);
});

function assertLocalDeployment(baseUrl: string): void {
  const hostname = new URL(baseUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`LIVE_BASE_URL must target localhost, received ${hostname}`);
  }
}

async function installLiveSessionState(page: Page): Promise<void> {
  await page.addInitScript(({ sessionId, workspaceId }) => {
    window.localStorage.setItem("agentTeams.language", "zh");
    window.localStorage.setItem("agentTeams.themeMode", "light");
    window.localStorage.setItem("agent_teams_theme", "light");
    window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
    window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    window.localStorage.setItem("agentTeams.shellView", "chat");
    window.localStorage.setItem("agentTeams.subagentPanelWidth", "760");
    window.localStorage.removeItem("agentTeams.activeSubagentPanel");
  }, { sessionId: liveSessionId, workspaceId: liveWorkspaceId });
}

async function installEventSourceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    const NativeEventSource = window.EventSource;
    acceptanceWindow.__agentTeamsActiveEventSources = 0;
    acceptanceWindow.__agentTeamsMaxEventSources = 0;
    class TrackedEventSource extends NativeEventSource {
      private acceptanceClosed = false;

      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        acceptanceWindow.__agentTeamsActiveEventSources =
          (acceptanceWindow.__agentTeamsActiveEventSources ?? 0) + 1;
        acceptanceWindow.__agentTeamsMaxEventSources = Math.max(
          acceptanceWindow.__agentTeamsMaxEventSources ?? 0,
          acceptanceWindow.__agentTeamsActiveEventSources,
        );
      }

      override close(): void {
        if (!this.acceptanceClosed) {
          this.acceptanceClosed = true;
          acceptanceWindow.__agentTeamsActiveEventSources = Math.max(
            0,
            (acceptanceWindow.__agentTeamsActiveEventSources ?? 0) - 1,
          );
        }
        super.close();
      }
    }
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: TrackedEventSource,
      writable: true,
    });
  });
}

async function expandProcessedGroupsUntilCardIsVisible(
  page: Page,
  card: Locator,
): Promise<void> {
  const closedGroups = page.locator(
    "details.at-processed-group:not([open]) > .at-processed-group-summary",
  );
  for (let index = 0; index < 40; index += 1) {
    if (await card.isVisible()) {
      return;
    }
    const groupCount = await closedGroups.count();
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const summary = closedGroups.nth(groupIndex);
      if (await summary.isVisible()) {
        await summary.click();
        break;
      }
    }
    await page.waitForTimeout(100);
  }
}

function completedSubagentCard(page: Page): Locator {
  const cards = page.locator(
    '.at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]',
  );
  return liveSubagentTitle.length > 0
    ? cards.filter({ hasText: liveSubagentTitle }).first()
    : cards.first();
}

async function switchAwayAndBack(
  page: Page,
  segments?: PerformanceSegment[],
  label = "switch-session",
): Promise<number> {
  const selectedSession = page.locator(
    `.at-session-item[data-session-id="${liveSessionId}"] .at-session-select`,
  );
  const otherSession = page.locator(
    `.at-session-item:not([data-session-id="${liveSessionId}"]) .at-session-select:visible`,
  ).first();
  await expect(selectedSession).toHaveAttribute("aria-current", "page");
  await expect(otherSession).toBeVisible();
  const startedAt = performance.now();
  const segment = await beginPerformanceSegment(page, label);
  await otherSession.click();
  await expect(otherSession).toHaveAttribute("aria-current", "page");
  await selectedSession.click();
  await expect(selectedSession).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".at-message")).not.toHaveCount(0);
  if (segments !== undefined) {
    await endPerformanceSegment(page, segment, segments);
  }
  return performance.now() - startedAt;
}

async function exerciseRepeatedNavigation(
  page: Page,
  panel: Locator,
  count: number,
  segments: PerformanceSegment[],
): Promise<Array<{ backMs: number; openMs: number; switchMs: number }>> {
  const cycles: Array<{ backMs: number; openMs: number; switchMs: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const switchMs = await switchAwayAndBack(
      page,
      segments,
      `repeat-${index + 1}-switch`,
    );
    const card = completedSubagentCard(page);
    await expandProcessedGroupsUntilCardIsVisible(page, card);
    const openStartedAt = performance.now();
    const openSegment = await beginPerformanceSegment(
      page,
      `repeat-${index + 1}-open`,
    );
    await card.locator(".at-message-tool-summary").click();
    await expect(panel).toBeVisible();
    await endPerformanceSegment(page, openSegment, segments);
    const openMs = performance.now() - openStartedAt;
    const backStartedAt = performance.now();
    const backSegment = await beginPerformanceSegment(
      page,
      `repeat-${index + 1}-back`,
    );
    await closeSubagentPanel(panel);
    await endPerformanceSegment(page, backSegment, segments);
    cycles.push({
      backMs: performance.now() - backStartedAt,
      openMs,
      switchMs,
    });
  }
  return cycles;
}

async function closeSubagentPanel(panel: Locator): Promise<void> {
  const back = panel.getByRole("button", { name: /主会话|Main session/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(panel).toBeHidden();
}

async function expectScrollable(locator: Locator, label: string): Promise<void> {
  await expect.poll(() => locator.evaluate((element) => element.clientHeight), {
    message: `${label} must retain visible height`,
  }).toBeGreaterThan(100);
  const geometry = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.scrollHeight, `${label} fixture must overflow for this acceptance`)
    .toBeGreaterThan(geometry.clientHeight + 100);
}

async function wheelToBottom(page: Page, locator: Locator): Promise<void> {
  await locator.hover();
  for (let index = 0; index < 10; index += 1) {
    await page.mouse.wheel(0, 2_000);
  }
  await expect.poll(() => bottomDistance(locator)).toBeLessThanOrEqual(1);
}

async function bottomDistance(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    element.scrollHeight - element.clientHeight - element.scrollTop
  );
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    acceptanceWindow.__agentTeamsLongTasks = [];
    acceptanceWindow.__agentTeamsLongTaskObserver?.disconnect();
    const observer = new PerformanceObserver((list) => {
      acceptanceWindow.__agentTeamsLongTasks?.push(
        ...list.getEntries().map((entry) => ({
          duration: entry.duration,
          startTime: entry.startTime,
        })),
      );
    });
    observer.observe({ entryTypes: ["longtask"] });
    acceptanceWindow.__agentTeamsLongTaskObserver = observer;
  });
}

async function readLongTasks(page: Page): Promise<LongTaskSample[]> {
  return page.evaluate(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    acceptanceWindow.__agentTeamsLongTaskObserver?.disconnect();
    return acceptanceWindow.__agentTeamsLongTasks ?? [];
  });
}

async function beginPerformanceSegment(
  page: Page,
  label: string,
): Promise<PendingPerformanceSegment> {
  return {
    label,
    startMetrics: await readCdpPerformanceMetrics(page),
    startTime: await page.evaluate(() => performance.now()),
  };
}

async function endPerformanceSegment(
  page: Page,
  segment: PendingPerformanceSegment,
  segments: PerformanceSegment[],
): Promise<void> {
  const endMetrics = await readCdpPerformanceMetrics(page);
  segments.push({
    endTime: await page.evaluate(() => performance.now()),
    label: segment.label,
    layoutDurationMs: durationDeltaMs(
      endMetrics.layoutDuration,
      segment.startMetrics.layoutDuration,
    ),
    recalcStyleDurationMs: durationDeltaMs(
      endMetrics.recalcStyleDuration,
      segment.startMetrics.recalcStyleDuration,
    ),
    scriptDurationMs: durationDeltaMs(
      endMetrics.scriptDuration,
      segment.startMetrics.scriptDuration,
    ),
    startTime: segment.startTime,
    taskDurationMs: durationDeltaMs(
      endMetrics.taskDuration,
      segment.startMetrics.taskDuration,
    ),
  });
}

async function installCdpPerformanceSession(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  cdpPerformanceSessions.set(page, session);
}

async function readCdpPerformanceMetrics(
  page: Page,
): Promise<CdpPerformanceSnapshot> {
  const session = cdpPerformanceSessions.get(page);
  if (session === undefined) {
    throw new Error("CDP performance session is not installed.");
  }
  const response = await session.send("Performance.getMetrics");
  const metrics = new Map(response.metrics.map((metric) => [
    metric.name,
    metric.value,
  ]));
  return {
    layoutDuration: metrics.get("LayoutDuration") ?? 0,
    recalcStyleDuration: metrics.get("RecalcStyleDuration") ?? 0,
    scriptDuration: metrics.get("ScriptDuration") ?? 0,
    taskDuration: metrics.get("TaskDuration") ?? 0,
  };
}

function durationDeltaMs(endValue: number, startValue: number): number {
  return Math.max(0, (endValue - startValue) * 1_000);
}

async function usedJsHeapSize(page: Page): Promise<number | null> {
  return page.evaluate(() =>
    (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null
  );
}

async function collectGarbage(page: Page): Promise<void> {
  const session = cdpPerformanceSessions.get(page);
  if (session === undefined) {
    throw new Error("CDP performance session is not installed.");
  }
  await session.send("HeapProfiler.collectGarbage");
}

async function captureStableScreenshot(
  page: Page,
  fileName: string,
): Promise<void> {
  await pauseLongTaskObserver(page);
  const path = screenshotPath(fileName, SCREENSHOT_FOLDER);
  try {
    await waitForStablePaint(page);
    await page.screenshot({
      animations: "disabled",
      path,
      quality: 92,
      type: "jpeg",
    });
    await waitForStablePaint(page);
    await page.screenshot({
      animations: "disabled",
      path,
      quality: 92,
      type: "jpeg",
    });
  } finally {
    await resumeLongTaskObserver(page);
  }
}

async function pauseLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as LiveAcceptanceWindow).__agentTeamsLongTaskObserver?.disconnect();
  });
}

async function resumeLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as LiveAcceptanceWindow).__agentTeamsLongTaskObserver?.observe({
      entryTypes: ["longtask"],
    });
  });
}

async function waitForStablePaint(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  }));
  await page.waitForTimeout(800);
}
