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

test.setTimeout(60_000);

test("scrolls and reopens a completed subagent from a live local deployment", async ({
  page,
}) => {
  test.skip(
    liveBaseUrl.length === 0 || liveSessionId.length === 0,
    "Set LIVE_BASE_URL and LIVE_SESSION_ID to run the live deployment acceptance.",
  );
  assertLocalDeployment(liveBaseUrl);

  let pageCrashed = false;
  page.on("crash", () => {
    pageCrashed = true;
  });
  await ensureScreenshotDir(SCREENSHOT_FOLDER);
  await installLiveSessionState(page);
  await page.goto(`${liveBaseUrl}/?live_completed_subagent_scroll=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForAppShell(page);

  const card = completedSubagentCard(page);
  await expect(card).not.toHaveCount(0);
  await expandProcessedGroupsUntilCardIsVisible(page, card);
  await expect(card).toBeVisible();
  await card.locator(".at-message-tool-summary").click();

  const panel = page.locator(".at-subagent-session-view");
  await expect(panel).toBeVisible();
  const prompt = panel.locator(".at-subagent-session-prompt");
  const timeline = panel.locator(
    ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
  );
  await expect(prompt).toBeVisible();
  await expect(timeline).toBeVisible();
  await expectScrollable(prompt, "live subagent prompt");
  await expectScrollable(timeline, "live subagent transcript");

  await page.screenshot({
    animations: "disabled",
    path: screenshotPath("live-subagent-before-wheel.png", SCREENSHOT_FOLDER),
  });

  await wheelToBottom(page, prompt);
  const timelineBottomBefore = await bottomDistance(timeline);
  await timeline.hover();
  await page.mouse.wheel(0, -900);
  await expect.poll(() => bottomDistance(timeline)).toBeGreaterThan(
    timelineBottomBefore + 100,
  );
  await wheelToBottom(page, timeline);
  await expectNoDocumentScroll(
    page,
    "live completed subagent scrolling must stay inside the side panel",
  );
  await page.screenshot({
    animations: "disabled",
    path: screenshotPath("live-subagent-after-wheel.png", SCREENSHOT_FOLDER),
  });

  await panel.locator(".at-subagent-session-header button").click();
  await expect(panel).toHaveCount(0);
  await completedSubagentCard(page).locator(".at-message-tool-summary").click();
  await expect(panel).toBeVisible();
  await expect(panel.locator(".at-subagent-session-prompt")).toBeVisible();
  await expect(panel.locator(".at-timeline")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: screenshotPath("live-subagent-reopened.png", SCREENSHOT_FOLDER),
  });
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
