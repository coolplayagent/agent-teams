import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installMockEventSource,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForEventSourceUrl,
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-timeline-scroll";
const RUN_ID = "run-v2-timeline-scroll";

test("keeps the V2 timeline anchored away from bottom and follows new text at bottom", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const messages = longHistoryMessages();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleTimelineScrollApi(context, messages),
      sessionTitle: "TS timeline scroll",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=0$`),
    );

    const timeline = page.locator(".at-timeline");
    await expect(timeline).toBeVisible();
    await expect
      .poll(() => timelineMetrics(page).then((metrics) => metrics.maxScrollTop))
      .toBeGreaterThan(800);

    const maxBeforeAwayStream = (await timelineMetrics(page)).maxScrollTop;
    const awayScrollTop = Math.round(maxBeforeAwayStream * 0.45);
    await setTimelineScrollTop(page, awayScrollTop);
    const awayBefore = await timelineMetrics(page);

    const awayText = "STREAM_SCROLL_AWAY_FROM_BOTTOM";
    await dispatchRuntimeText(page, 1, awayText);
    await page.waitForTimeout(120);

    const awayAfter = await timelineMetrics(page);
    expect(Math.abs(awayAfter.scrollTop - awayBefore.scrollTop)).toBeLessThanOrEqual(2);

    await setTimelineScrollTop(page, awayAfter.maxScrollTop);
    await expect(page.getByText(awayText)).toBeVisible();

    const bottomText = "STREAM_SCROLL_BOTTOM_FOLLOW";
    await setTimelineScrollTop(page, (await timelineMetrics(page)).maxScrollTop);
    await dispatchRuntimeText(page, 2, `\n${bottomText}`);
    await expect(page.getByText(bottomText)).toBeVisible();
    await expect
      .poll(async () => {
        const metrics = await timelineMetrics(page);
        return Math.round(metrics.maxScrollTop - metrics.scrollTop);
      })
      .toBeLessThanOrEqual(2);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "V2 timeline streaming scroll should stay inside the fixed shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-timeline-scroll-bottom-follow.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleTimelineScrollApi(
  context: MockApiRouteContext,
  messages: Record<string, unknown>[],
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(messages);
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson({
      active_run: {
        last_event_id: 0,
        pending_tool_approval_count: 0,
        pending_user_question_count: 0,
        phase: "running",
        run_id: RUN_ID,
        session_id: SESSION_ID,
        should_show_recover: false,
        status: "running",
        stream_connected: false,
      },
      background_tasks: [],
      paused_subagent: null,
      pending_tool_approvals: [],
      pending_user_questions: [],
      recoverable_stopped_run: null,
    });
    return true;
  }
  return false;
}

async function dispatchRuntimeText(
  page: Page,
  eventId: number,
  text: string,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: eventId,
      occurred_at: `2026-07-01T10:30:${String(eventId).padStart(2, "0")}Z`,
      payload: { text },
      relay_event_type: "text_delta",
      role_id: "MainAgent",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-v2-timeline-scroll",
      type: "message.text.delta",
    },
    lastEventId: String(eventId),
    type: "message.text.delta",
  });
}

async function setTimelineScrollTop(page: Page, top: number): Promise<void> {
  await page.locator(".at-timeline").evaluate((element, nextTop) => {
    element.scrollTop = nextTop;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, top);
}

async function timelineMetrics(page: Page): Promise<TimelineMetrics> {
  return page.locator(".at-timeline").evaluate((element) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    return {
      clientHeight: element.clientHeight,
      maxScrollTop,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  });
}

interface TimelineMetrics {
  clientHeight: number;
  maxScrollTop: number;
  scrollHeight: number;
  scrollTop: number;
}

function longHistoryMessages(): Record<string, unknown>[] {
  return Array.from({ length: 42 }, (_, index) => ({
    created_at: `2026-07-01T09:${String(index).padStart(2, "0")}:00Z`,
    message_id: `scroll-history-${index}`,
    message: {
      parts: [
        {
          content: [
            `Scroll history row ${index + 1}`,
            "This fixture is intentionally tall so browser scroll anchoring is observable.",
            "The V2 shell should not move the reader when a stream arrives below the viewport.",
          ].join("\n"),
          part_kind: "text",
        },
      ],
    },
    role_id: index % 2 === 0 ? "user" : "MainAgent",
    run_id: `scroll-history-run-${index}`,
  }));
}
