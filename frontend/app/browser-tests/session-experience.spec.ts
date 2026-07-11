import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  eventSourceOpenCount,
  expectNoUnhandledApiRoutes,
  installMockEventSource,
  installShellState,
  mockShellApi,
  serveFrontendDist,
  SESSION_ID,
  waitForAppShell,
  waitForEventSourceOpenCount,
  waitForEventSourceUrl,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-session-experience-navigation";

test("keeps an active chat mounted and streaming across feature navigation", async ({
  page,
}, testInfo) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleSessionExperienceApi,
      sessionTitle: "TS active navigation stream",
    });

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=0$`),
    );
    await waitForEventSourceOpenCount(page, 1);

    const timeline = page.locator(".at-timeline");
    const thinking = page.locator("details.at-message-thinking");
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(thinking).toHaveCount(1);
    await thinking.locator(".at-message-thinking-summary").click();
    await expect(thinking).toHaveAttribute("open", "");
    await prompt.fill("draft survives feature navigation");

    const maxScrollTop = await timeline.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    );
    expect(maxScrollTop).toBeGreaterThan(500);
    const awayScrollTop = Math.round(maxScrollTop * 0.45);
    await timeline.evaluate((element, nextTop) => {
      element.scrollTop = nextTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, awayScrollTop);
    const timelineNodeBefore = await timeline.evaluate((element) => {
      element.dataset.sessionExperienceIdentity = "preserved";
      return element.dataset.sessionExperienceIdentity;
    });

    await page.getByRole("button", { name: "Automation" }).click();
    await expect(page.getByText("No automation projects yet.")).toBeVisible();
    expect(await eventSourceOpenCount(page)).toBe(1);

    const backgroundText = "stream continued while Automation was visible";
    await dispatchRuntimeText(page, 301, backgroundText);
    await expect(page.getByText(backgroundText)).not.toBeVisible();
    expect(await eventSourceOpenCount(page)).toBe(1);

    const returnStartedAt = Date.now();
    await page.getByRole("button", { name: "TS active navigation stream" }).click();
    await expect(page.getByText(backgroundText)).toBeVisible({ timeout: 1_000 });
    const returnReadyMs = Date.now() - returnStartedAt;
    expect(returnReadyMs).toBeLessThan(1_000);
    await expect(prompt).toHaveValue("draft survives feature navigation");
    await expect(thinking).toHaveAttribute("open", "");
    expect(await eventSourceOpenCount(page)).toBe(1);
    expect(await timeline.evaluate(
      (element) => element.dataset.sessionExperienceIdentity,
    )).toBe(timelineNodeBefore);
    expect(Math.abs((await timeline.evaluate((element) => element.scrollTop)) - awayScrollTop))
      .toBeLessThanOrEqual(2);

    await testInfo.attach("feature-navigation-stream-continuity", {
      body: JSON.stringify({
        eventSourceOpenCount: await eventSourceOpenCount(page),
        returnReadyMs,
        timelineScrollTop: await timeline.evaluate((element) => element.scrollTop),
      }, null, 2),
      contentType: "application/json",
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleSessionExperienceApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/automation/projects") {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === "/automation/delivery-bindings") {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(longSessionHistory());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/recovery`) {
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
        stream_connected: true,
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

function longSessionHistory(): Array<Record<string, unknown>> {
  return [
    ...Array.from({ length: 36 }, (_, index) => ({
      content: `Navigation history row ${String(index + 1).padStart(2, "0")} ${"x".repeat(80)}`,
      created_at: `2026-07-01T10:${String(index).padStart(2, "0")}:00Z`,
      message_id: `message-navigation-${index}`,
      role_id: "MainAgent",
      run_id: `run-history-${index}`,
    })),
    {
      created_at: "2026-07-01T10:40:00Z",
      message: {
        parts: [
          {
            content: "Expanded reasoning must survive feature navigation.",
            kind: "thinking",
            status: "completed",
          },
        ],
      },
      message_id: "message-navigation-thinking",
      role_id: "MainAgent",
      run_id: "run-history-thinking",
    },
  ];
}

async function dispatchRuntimeText(
  page: Page,
  eventId: number,
  text: string,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: eventId,
      occurred_at: "2026-07-01T10:45:00Z",
      payload: { text },
      relay_event_type: "text_delta",
      role_id: "MainAgent",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-session-experience-navigation",
      type: "message.text.delta",
    },
    lastEventId: String(eventId),
    type: "message.text.delta",
  });
}
