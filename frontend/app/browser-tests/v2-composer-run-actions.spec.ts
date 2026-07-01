import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
  eventSourceUrls,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installMockEventSource,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForEventSourceOpenCount,
  waitForEventSourceUrl,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-v2-composer-actions";
const SCREENSHOT_FOLDER = "frontend-v2-ts-composer-run-actions";
const QUEUED_INJECTION = "Queue this follow-up for the running task";
const INTERRUPT_INJECTION = "Interrupt and inspect the stream edge case";
const RESUMED_TEXT = "Resumed action stream after checkpoint.";

interface ComposerRunActionsState {
  activeRun: Record<string, unknown> | null;
  injectRequests: Array<Record<string, unknown>>;
  lastEventId: number;
  resumeRequests: string[];
  stopRequests: string[];
}

test("queues, interrupts, stops, and resumes a running composer session", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: ComposerRunActionsState = {
    activeRun: activeRunRecord("running", false, 7),
    injectRequests: [],
    lastEventId: 7,
    resumeRequests: [],
    stopRequests: [],
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerRunActionsApi(context, state),
      sessionTitle: "TS composer run actions",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-composer-actions\/events\?after_event_id=7$/,
    );
    await expect(page.locator(".at-role-select")).toHaveClass(/ant-select-disabled/);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill(QUEUED_INJECTION);
    await page.getByRole("button", { name: "Queue" }).click();
    await expect.poll(() => state.injectRequests.length).toBe(1);
    expect(state.injectRequests[0]).toEqual({
      content: QUEUED_INJECTION,
      mode: "queued",
    });
    await expect(prompt).toHaveValue("");

    await prompt.fill(INTERRUPT_INJECTION);
    await page.getByRole("button", { name: "Interrupt" }).click();
    await expect.poll(() => state.injectRequests.length).toBe(2);
    expect(state.injectRequests[1]).toEqual({
      content: INTERRUPT_INJECTION,
      mode: "interrupt",
    });
    await expect(prompt).toHaveValue("");

    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => state.stopRequests).toEqual([RUN_ID]);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Queue" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Interrupt" })).toHaveCount(0);

    await page.reload();
    await waitForV2Shell(page);
    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText(`Run ${RUN_ID} is stopped`)).toBeVisible();
    await expect(recovery.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect.poll(() => eventSourceUrls(page)).toEqual([]);
    await page.screenshot({
      path: screenshotPath("v2-composer-run-actions-resume-ready.png", SCREENSHOT_FOLDER),
    });

    await recovery.getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => state.resumeRequests).toEqual([RUN_ID]);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-composer-actions\/events\?after_event_id=8$/,
    );
    await waitForEventSourceOpenCount(page, 1);
    await expect(recovery.getByRole("button", { name: "Resume" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 9,
      payload: { text: RESUMED_TEXT },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(RESUMED_TEXT)).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-composer-run-actions-resumed.png", SCREENSHOT_FOLDER),
    });

    await dispatchRunEvent(page, {
      eventId: 10,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "composer run actions should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    await appServer.close();
  }
});

async function handleComposerRunActionsApi(
  context: MockApiRouteContext,
  state: ComposerRunActionsState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(state));
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}/inject`) {
    state.injectRequests.push(readRequestBody(context));
    await context.fulfillJson({ run_id: RUN_ID, status: "ok" });
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}:stop`) {
    state.stopRequests.push(RUN_ID);
    state.lastEventId = 8;
    state.activeRun = activeRunRecord("stopped", true, state.lastEventId);
    await context.fulfillJson({ scope: "main", status: "ok" });
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}:resume`) {
    state.resumeRequests.push(RUN_ID);
    state.activeRun = activeRunRecord("running", false, state.lastEventId);
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      status: "running",
    });
    return true;
  }
  return false;
}

async function dispatchRunEvent(
  page: Page,
  event: {
    eventId: number;
    payload: Record<string, unknown>;
    relayEventType: string;
    type: string;
  },
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-07-01T08:00:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-v2-composer-actions",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

function recoverySnapshot(
  state: ComposerRunActionsState,
): Record<string, unknown> {
  return {
    active_run: state.activeRun,
    background_tasks: [],
    paused_subagent: null,
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
    round_snapshot: null,
  };
}

function activeRunRecord(
  status: "running" | "stopped",
  shouldShowRecover: boolean,
  lastEventId: number,
): Record<string, unknown> {
  return {
    last_event_id: lastEventId,
    phase: status,
    run_id: RUN_ID,
    session_id: SESSION_ID,
    should_show_recover: shouldShowRecover,
    status,
  };
}

function readRequestBody(
  context: MockApiRouteContext,
): Record<string, unknown> {
  const body = context.route.request().postData();
  if (body === null || !body.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}
