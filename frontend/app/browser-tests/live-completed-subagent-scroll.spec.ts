import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

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
  __agentTeamsLongTaskObserver?: PerformanceObserver;
  __agentTeamsLongTasks?: number[];
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

test.setTimeout(60_000);

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
  await installLiveSessionState(page);
  await page.goto(`${liveBaseUrl}/?live_completed_subagent_scroll=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForAppShell(page);
  await installLongTaskObserver(page);
  const heapBeforeBytes = await usedJsHeapSize(page);

  const card = completedSubagentCard(page);
  await expect(card).not.toHaveCount(0);
  await expandProcessedGroupsUntilCardIsVisible(page, card);
  await expect(card).toBeVisible();
  const openStartedAt = performance.now();
  await card.locator(".at-message-tool-summary").click();

  const panel = page.locator(".at-subagent-session-view");
  await expect(panel).toBeVisible();
  const prompt = panel.locator(".at-subagent-session-prompt");
  const timeline = panel.locator(
    ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
  );
  await expect(prompt).toBeVisible();
  await expect(timeline).toBeVisible();
  const openSubagentMs = performance.now() - openStartedAt;
  await expectScrollable(prompt, "live subagent prompt");
  await expectScrollable(timeline, "live subagent transcript");

  await captureStableScreenshot(page, "live-subagent-before-wheel.jpg");

  const promptWheelStartedAt = performance.now();
  await wheelToBottom(page, prompt);
  const promptWheelToBottomMs = performance.now() - promptWheelStartedAt;
  const timelineBottomBefore = await bottomDistance(timeline);
  const timelineWheelStartedAt = performance.now();
  await timeline.hover();
  await page.mouse.wheel(0, -900);
  await expect.poll(() => bottomDistance(timeline)).toBeGreaterThan(
    timelineBottomBefore + 100,
  );
  await wheelToBottom(page, timeline);
  const timelineWheelRoundTripMs = performance.now() - timelineWheelStartedAt;
  await expectNoDocumentScroll(
    page,
    "live completed subagent scrolling must stay inside the side panel",
  );
  await captureStableScreenshot(page, "live-subagent-after-wheel.jpg");

  const backStartedAt = performance.now();
  await panel.locator(".at-subagent-session-header button").click();
  await expect(panel).toHaveCount(0);
  const backToMainMs = performance.now() - backStartedAt;
  const switchSessionMs = await switchAwayAndBack(page);
  const reopenStartedAt = performance.now();
  await completedSubagentCard(page).locator(".at-message-tool-summary").click();
  await expect(panel).toBeVisible();
  await expect(panel.locator(".at-subagent-session-prompt")).toBeVisible();
  await expect(panel.locator(".at-timeline")).toBeVisible();
  const reopenSubagentMs = performance.now() - reopenStartedAt;
  await captureStableScreenshot(page, "live-subagent-reopened.jpg");
  const heapAfterBytes = await usedJsHeapSize(page);
  const longTasks = await readLongTasks(page);
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
    failedResponses,
    heapAfterBytes,
    heapBeforeBytes,
    heapGrowthBytes:
      heapAfterBytes === null || heapBeforeBytes === null
        ? null
        : heapAfterBytes - heapBeforeBytes,
    longTaskCount: longTasks.length,
    maxLongTaskMs: Math.max(0, ...longTasks),
    openSubagentMs,
    pageCrashed,
    pageErrors,
    promptWheelToBottomMs,
    reopenSubagentMs,
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

  expect(openSubagentMs).toBeLessThan(3_000);
  expect(promptWheelToBottomMs).toBeLessThan(3_000);
  expect(timelineWheelRoundTripMs).toBeLessThan(3_000);
  expect(backToMainMs).toBeLessThan(2_000);
  expect(switchSessionMs).toBeLessThan(5_000);
  expect(reopenSubagentMs).toBeLessThan(3_000);
  expect(metrics.maxLongTaskMs).toBeLessThan(1_000);
  if (metrics.heapGrowthBytes !== null) {
    expect(metrics.heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);
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

async function switchAwayAndBack(page: Page): Promise<number> {
  const selectedSession = page.locator(
    `.at-session-item[data-session-id="${liveSessionId}"] .at-session-select`,
  );
  const otherSession = page.locator(
    `.at-session-item:not([data-session-id="${liveSessionId}"]) .at-session-select:visible`,
  ).first();
  await expect(selectedSession).toHaveAttribute("aria-current", "page");
  await expect(otherSession).toBeVisible();
  const startedAt = performance.now();
  await otherSession.click();
  await expect(otherSession).toHaveAttribute("aria-current", "page");
  await selectedSession.click();
  await expect(selectedSession).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".at-message")).not.toHaveCount(0);
  return performance.now() - startedAt;
}

async function expectScrollable(locator: Locator, label: string): Promise<void> {
  const geometry = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.clientHeight, `${label} must retain visible height`)
    .toBeGreaterThan(100);
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
        ...list.getEntries().map((entry) => entry.duration),
      );
    });
    observer.observe({ entryTypes: ["longtask"] });
    acceptanceWindow.__agentTeamsLongTaskObserver = observer;
  });
}

async function readLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    acceptanceWindow.__agentTeamsLongTaskObserver?.disconnect();
    return acceptanceWindow.__agentTeamsLongTasks ?? [];
  });
}

async function usedJsHeapSize(page: Page): Promise<number | null> {
  return page.evaluate(() =>
    (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null
  );
}

async function captureStableScreenshot(
  page: Page,
  fileName: string,
): Promise<void> {
  const path = screenshotPath(fileName, SCREENSHOT_FOLDER);
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
