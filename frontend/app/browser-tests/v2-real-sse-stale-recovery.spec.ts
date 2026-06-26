import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-real-sse-stale";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";
const PROMPT = "Real SSE stale recovery probe";
const FIRST_CHUNK = "Real SSE chunk before malformed frame.";
const FAILURE_MESSAGE = "real SSE provider failed before completion";
const STOPPED_MESSAGE = "real SSE run stopped before completion";
const STREAM_UNAVAILABLE = "run recovery stream is no longer available";

test.setTimeout(45_000);

test("suppresses stale auto recovery after a real SSE server error", async ({
  page,
}) => {
  await runRealSseStaleRecoveryScenario(page, {
    mode: "server-error",
    screenshotName: "v2-real-sse-server-error-stale-recovery.png",
  });
});

test("suppresses stale auto recovery after a real SSE malformed event", async ({
  page,
}) => {
  await runRealSseStaleRecoveryScenario(page, {
    mode: "malformed-event",
    screenshotName: "v2-real-sse-malformed-stale-recovery.png",
  });
});

test("finalizes a real SSE run.failed event without stale reconnect", async ({
  page,
}) => {
  await runRealSseTerminalScenario(page, {
    mode: "run-failed",
    screenshotName: "v2-real-sse-run-failed-terminal.png",
    terminalSummary: "Run failed: status failed",
    terminalText: FAILURE_MESSAGE,
  });
});

test("finalizes a real SSE run.stopped event without stale reconnect", async ({
  page,
}) => {
  await runRealSseTerminalScenario(page, {
    mode: "run-stopped",
    screenshotName: "v2-real-sse-run-stopped-terminal.png",
    terminalSummary: "Run stopped: status stopped",
    terminalText: STOPPED_MESSAGE,
  });
});

interface RealSseScenarioOptions {
  mode: "malformed-event" | "server-error";
  screenshotName: string;
}

interface RealSseTerminalOptions {
  mode: "run-failed" | "run-stopped";
  screenshotName: string;
  terminalSummary: string;
  terminalText: string;
}

interface RealSseState {
  runCreated: boolean;
  streamRequests: RealSseRequest[];
}

interface RealSseRequest {
  afterEventId: string | null;
  lastEventId: string | null;
}

async function runRealSseStaleRecoveryScenario(
  page: Page,
  options: RealSseScenarioOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state: RealSseState = {
    runCreated: false,
    streamRequests: [],
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);

    if (options.mode === "malformed-event") {
      await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    }

    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.locator(".at-recovery")).toHaveCount(0);

    await page.waitForTimeout(1_500);
    expect(state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should not reopen stale recovery outside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseTerminalScenario(
  page: Page,
  options: RealSseTerminalOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state: RealSseState = {
    runCreated: false,
    streamRequests: [],
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    await expect(page.getByText(options.terminalText)).toBeVisible();
    await expect(page.getByText(options.terminalSummary)).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.locator(".at-recovery")).toHaveCount(0);

    await page.waitForTimeout(1_500);
    expect(state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should close the real SSE stream inside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function handleRealSseApi(
  context: MockApiRouteContext,
  state: RealSseState,
  mode: RealSseScenarioOptions["mode"] | RealSseTerminalOptions["mode"],
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    state.runCreated = true;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/ag-ui/runs/${RUN_ID}/events`) {
    state.streamRequests.push({
      afterEventId: context.url.searchParams.get("after_event_id"),
      lastEventId: context.route.request().headers()["last-event-id"] ?? null,
    });
    await context.route.fulfill({
      body: sseBody(mode),
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
      status: 200,
    });
    return true;
  }
  return false;
}

function recoverySnapshot(state: RealSseState): Record<string, unknown> {
  return {
    active_run: state.runCreated
      ? {
          last_event_id: 0,
          pending_tool_approval_count: 0,
          pending_user_question_count: 0,
          phase: "streaming",
          run_id: RUN_ID,
          session_id: SESSION_ID,
          should_show_recover: false,
          status: "running",
          stream_connected: false,
        }
      : null,
    background_tasks: [],
    paused_subagent: null,
    pending_tool_approvals: [],
    pending_user_questions: [],
    round_snapshot: null,
  };
}

function sseBody(
  mode: RealSseScenarioOptions["mode"] | RealSseTerminalOptions["mode"],
): string {
  if (mode === "server-error") {
    return sseFrame({
      data: { error: STREAM_UNAVAILABLE },
      event: "error",
    });
  }
  if (mode === "run-failed" || mode === "run-stopped") {
    const failed = mode === "run-failed";
    return [
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
      sseFrame({
        data: runEvent({
          eventId: 3,
          payload: {
            message: failed ? FAILURE_MESSAGE : STOPPED_MESSAGE,
            root_task_id: "root-ts-real-sse-terminal",
            status: failed ? "failed" : "stopped",
          },
          relayEventType: failed ? "run_failed" : "run_stopped",
          type: failed ? "run.failed" : "run.stopped",
        }),
        event: failed ? "run.failed" : "run.stopped",
        id: 3,
      }),
    ].join("");
  }
  return [
    sseFrame({
      data: runEvent({
        eventId: 1,
        payload: { phase: "streaming" },
        relayEventType: "run_started",
        type: "run.started",
      }),
      event: "run.started",
      id: 1,
    }),
    sseFrame({
      data: runEvent({
        eventId: 2,
        payload: { text: FIRST_CHUNK },
        relayEventType: "text_delta",
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 2,
    }),
    sseFrame({
      data: { ok: true },
      event: "message.text.delta",
    }),
  ].join("");
}

interface SseFrameOptions {
  data: unknown;
  event: string;
  id?: number;
}

function sseFrame(options: SseFrameOptions): string {
  const lines = [];
  if (options.id !== undefined) {
    lines.push(`id: ${options.id}`);
  }
  lines.push(`event: ${options.event}`);
  lines.push(`data: ${JSON.stringify(options.data)}`);
  return `${lines.join("\n")}\n\n`;
}

interface RunEventOptions {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

function runEvent(options: RunEventOptions): Record<string, unknown> {
  return {
    event_id: options.eventId,
    occurred_at: `2026-06-26T12:00:0${options.eventId}Z`,
    payload: options.payload,
    relay_event_type: options.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-real-sse-stale",
    type: options.type,
  };
}
