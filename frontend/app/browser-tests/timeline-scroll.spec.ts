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
    const awayAnchorBefore = await visibleTimelineAnchor(page);

    const awayText = "STREAM_SCROLL_AWAY_FROM_BOTTOM";
    await dispatchRuntimeText(page, 1, awayText);
    await page.waitForTimeout(120);

    const awayAfter = await timelineMetrics(page);
    const awayAnchorAfter = await timelineAnchorByKey(page, awayAnchorBefore.rowKey);
    expect(Math.abs(awayAnchorAfter.viewportTop - awayAnchorBefore.viewportTop))
      .toBeLessThanOrEqual(1);

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

test("keeps disclosure clicks responsive and anchored during a long interleaved stream", async ({
  page,
}, testInfo) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleTimelineScrollApi(context, longHistoryMessages()),
      sessionTitle: "TS timeline responsiveness",
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=0$`),
    );
    await installResponsivenessProbe(page);
    await dispatchThinkingBurst(page, 1_200);

    const thinking = page.locator("details.at-message-thinking");
    await expect(thinking).toHaveCount(1);
    const thinkingSummary = thinking.locator(".at-message-thinking-summary");
    await thinkingSummary.scrollIntoViewIfNeeded();
    if (await thinking.getAttribute("open") !== null) {
      const closeTopBefore = await elementViewportTop(thinkingSummary);
      await thinkingSummary.click();
      await expect(thinking).not.toHaveAttribute("open", "");
      expect(Math.abs((await elementViewportTop(thinkingSummary)) - closeTopBefore))
        .toBeLessThanOrEqual(1);
    }
    const thinkingTopBefore = await elementViewportTop(thinkingSummary);
    const thinkingClickMs = await measuredClick(thinkingSummary);
    await expect(thinking).toHaveAttribute("open", "");
    const thinkingHeaderShiftPx = Math.abs(
      (await elementViewportTop(thinkingSummary)) - thinkingTopBefore,
    );
    expect(thinkingClickMs).toBeLessThan(1_000);
    expect(thinkingHeaderShiftPx).toBeLessThanOrEqual(1);

    await dispatchRuntimeText(page, 1_203, "stream continues while thinking stays open");
    await expect(thinking).toHaveAttribute("open", "");

    await dispatchToolLifecycle(page, 1_204);
    const tool = page.locator("details.at-message-tool").last();
    await expect(tool).toBeVisible();
    const toolSummary = tool.locator(".at-message-tool-summary");
    await toolSummary.scrollIntoViewIfNeeded();
    const toolTopBefore = await elementViewportTop(toolSummary);
    const toolClickMs = await measuredClick(toolSummary);
    await expect(tool).toHaveAttribute("open", "");
    const toolHeaderShiftPx = Math.abs(
      (await elementViewportTop(toolSummary)) - toolTopBefore,
    );
    expect(toolClickMs).toBeLessThan(1_000);
    expect(toolHeaderShiftPx).toBeLessThanOrEqual(1);

    const probe = await responsivenessProbe(page);
    await testInfo.attach("timeline-responsiveness", {
      body: JSON.stringify({
        ...probe,
        thinkingClickMs,
        thinkingHeaderShiftPx,
        toolClickMs,
        toolHeaderShiftPx,
      }, null, 2),
      contentType: "application/json",
    });
    expect(probe.heartbeatCount).toBeGreaterThan(3);
    expect(probe.maxHeartbeatGapMs).toBeLessThan(1_000);
    expect(probe.maxLongTaskMs).toBeLessThan(1_000);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("expands a long user prompt below its stable disclosure control", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handlePromptDisclosureApi,
      sessionTitle: "TS prompt disclosure anchor",
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const toggle = page.locator(".at-round-prompt-toggle");
    const body = page.locator(".at-round-prompt-body");
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.scrollIntoViewIfNeeded();
    const topBefore = await elementViewportTop(toggle);

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const topAfter = await elementViewportTop(toggle);
    expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);
    const geometry = await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>(".at-round-prompt-toggle");
      const prompt = document.querySelector<HTMLElement>(".at-round-prompt-body");
      if (control === null || prompt === null) {
        throw new Error("Prompt disclosure geometry was not rendered.");
      }
      return {
        controlBottom: control.getBoundingClientRect().bottom,
        promptTop: prompt.getBoundingClientRect().top,
      };
    });
    expect(geometry.promptTop).toBeGreaterThanOrEqual(geometry.controlBottom - 1);
    await expect(body).toContainText("PROMPT_DISCLOSURE_FINAL_LINE");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
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

async function handlePromptDisclosureApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([
      {
        content: longPrompt(),
        created_at: "2026-07-01T11:00:00Z",
        message_id: "prompt-disclosure-user",
        role: "user",
        run_id: "run-prompt-disclosure",
      },
      {
        content: "Prompt disclosure response",
        created_at: "2026-07-01T11:00:01Z",
        message_id: "prompt-disclosure-assistant",
        role_id: "MainAgent",
        run_id: "run-prompt-disclosure",
      },
    ]);
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [{
        created_at: "2026-07-01T11:00:00Z",
        intent: longPrompt(),
        intent_parts: [{ kind: "text", text: longPrompt() }],
        run_id: "run-prompt-disclosure",
        run_status: "completed",
        run_user_message: longPrompt(),
      }],
      next_cursor: null,
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

async function dispatchThinkingBurst(page: Page, deltaCount: number): Promise<void> {
  await page.evaluate(({ count, runId, sessionId }) => {
    const harness = window.__agentTeamsBrowserTestEventSource;
    if (harness === undefined) {
      throw new Error("Browser test EventSource harness was not installed.");
    }
    const dispatch = (
      type: string,
      relayEventType: string,
      eventId: number,
      payload: Record<string, unknown>,
    ) => {
      harness.dispatch(
        null,
        type,
        JSON.stringify({
          event_id: eventId,
          occurred_at: "2026-07-01T10:45:00Z",
          payload,
          relay_event_type: relayEventType,
          role_id: "MainAgent",
          run_id: runId,
          session_id: sessionId,
          trace_id: "trace-v2-timeline-pressure",
          type,
        }),
        String(eventId),
      );
    };
    dispatch("thinking.started", "thinking_started", 1, { part_index: 0 });
    for (let index = 0; index < count; index += 1) {
      dispatch("thinking.delta", "thinking_delta", index + 2, {
        part_index: 0,
        text: `${index % 10}`,
      });
    }
    dispatch("thinking.finished", "thinking_finished", count + 2, {
      part_index: 0,
    });
  }, { count: deltaCount, runId: RUN_ID, sessionId: SESSION_ID });
}

async function dispatchToolLifecycle(page: Page, eventId: number): Promise<void> {
  for (const event of [
    {
      eventId,
      payload: {
        args: { path: "frontend/app/src/features/timeline" },
        tool_call_id: "pressure-tool-call",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      type: "tool_call.started",
    },
    {
      eventId: eventId + 1,
      payload: {
        content: "timeline source loaded",
        tool_call_id: "pressure-tool-call",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      type: "tool_result.completed",
    },
  ]) {
    await dispatchEventSourceMessage(page, {
      data: {
        event_id: event.eventId,
        occurred_at: "2026-07-01T10:46:00Z",
        payload: event.payload,
        relay_event_type: event.relayEventType,
        role_id: "MainAgent",
        run_id: RUN_ID,
        session_id: SESSION_ID,
        trace_id: "trace-v2-timeline-pressure",
        type: event.type,
      },
      lastEventId: String(event.eventId),
      type: event.type,
    });
  }
}

async function installResponsivenessProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const metrics = {
      heartbeatCount: 0,
      lastHeartbeatAt: performance.now(),
      maxHeartbeatGapMs: 0,
      maxLongTaskMs: 0,
    };
    window.setInterval(() => {
      const now = performance.now();
      metrics.maxHeartbeatGapMs = Math.max(
        metrics.maxHeartbeatGapMs,
        now - metrics.lastHeartbeatAt,
      );
      metrics.lastHeartbeatAt = now;
      metrics.heartbeatCount += 1;
    }, 25);
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.maxLongTaskMs = Math.max(metrics.maxLongTaskMs, entry.duration);
        }
      }).observe({ entryTypes: ["longtask"] });
    }
    Object.assign(window, { __agentTeamsTimelineResponsiveness: metrics });
  });
}

async function responsivenessProbe(page: Page): Promise<ResponsivenessProbe> {
  return page.evaluate(() => {
    const value = (window as Window & {
      __agentTeamsTimelineResponsiveness?: ResponsivenessProbe;
    }).__agentTeamsTimelineResponsiveness;
    if (value === undefined) {
      throw new Error("Timeline responsiveness probe was not installed.");
    }
    return value;
  });
}

async function measuredClick(locator: import("@playwright/test").Locator): Promise<number> {
  const startedAt = performance.now();
  await locator.click();
  return performance.now() - startedAt;
}

async function elementViewportTop(
  locator: import("@playwright/test").Locator,
): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top);
}

interface ResponsivenessProbe {
  heartbeatCount: number;
  lastHeartbeatAt: number;
  maxHeartbeatGapMs: number;
  maxLongTaskMs: number;
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

async function visibleTimelineAnchor(page: Page): Promise<TimelineViewportAnchor> {
  return page.locator(".at-timeline").evaluate((timeline) => {
    const timelineRect = timeline.getBoundingClientRect();
    const rows = Array.from(
      timeline.querySelectorAll<HTMLElement>(".at-timeline-row[data-row-key]"),
    );
    const row = rows.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.top >= timelineRect.top + 12 && rect.bottom <= timelineRect.bottom - 12;
    });
    if (row === undefined || row.dataset.rowKey === undefined) {
      throw new Error("No fully visible timeline anchor row was available.");
    }
    return {
      rowKey: row.dataset.rowKey,
      viewportTop: row.getBoundingClientRect().top,
    };
  });
}

async function timelineAnchorByKey(
  page: Page,
  rowKey: string,
): Promise<TimelineViewportAnchor> {
  return page.locator(".at-timeline").evaluate((timeline, key) => {
    const row = Array.from(
      timeline.querySelectorAll<HTMLElement>(".at-timeline-row[data-row-key]"),
    ).find((candidate) => candidate.dataset.rowKey === key);
    if (row === undefined) {
      throw new Error(`Timeline anchor row ${key} was not retained.`);
    }
    return {
      rowKey: key,
      viewportTop: row.getBoundingClientRect().top,
    };
  }, rowKey);
}

interface TimelineMetrics {
  clientHeight: number;
  maxScrollTop: number;
  scrollHeight: number;
  scrollTop: number;
}

interface TimelineViewportAnchor {
  rowKey: string;
  viewportTop: number;
}

function longPrompt(): string {
  return [
    "Inspect the timeline interaction model and preserve the reader position.",
    "Keep every disclosure local to the content the user selected.",
    "Do not pull an inspecting reader back to the live tail.",
    "PROMPT_DISCLOSURE_FINAL_LINE",
  ].join("\n");
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
