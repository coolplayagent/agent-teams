import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
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
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-tool-lifecycle";
const TOOL_RUN_ID = "run-v2-tool-lifecycle";
const LIVE_TOOL_RUN_ID = "run-v2-tool-live-lifecycle";
const LIVE_TOOL_PROMPT = "Read README with live tool lifecycle";
const LIVE_TOOL_PATH = "README.md";
const LIVE_TOOL_OUTPUT = "README live lifecycle excerpt.";
const LIVE_TOOL_FINAL = "Live tool lifecycle final answer.";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
}

interface LiveToolLifecycleState {
  completed: boolean;
  lastEventId: number;
  persistedFinalText: string;
  persistedToolCall: boolean;
  persistedToolResult: boolean;
  runCreated: boolean;
}

test("merges persisted tool call and result messages into one completed card", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleToolLifecycleApi,
      sessionTitle: "TS tool lifecycle",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const completedTool = page.locator(".at-message-tool", {
      hasText: "Read: read",
    });
    await expect(completedTool).toHaveCount(1);
    await expect(completedTool).toHaveAttribute("data-status", "completed");
    await expect(completedTool.locator(".at-message-tool-spinner")).toHaveCount(0);
    await expect(completedTool.locator(".at-message-tool-preview"))
      .toHaveText("README excerpt from history.");
    await expect(page.getByText("Reading: read")).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(1);
    await expect(page.locator(".at-message-tool-status")).toHaveCount(0);

    const toolBody = completedTool.locator(".at-message-tool-body");
    await expect(toolBody).toBeHidden();
    await completedTool.locator(".at-message-tool-summary").click();
    await expect(toolBody).toBeVisible();
    await expect(toolBody).toContainText("README excerpt from history.");
    await expect(toolBody).toContainText('"path": "README.md"');
    await expect(page.getByText("Tool lifecycle final answer.")).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "persisted tool lifecycle replay should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-tool-lifecycle-merged-card.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps a live tool call as one card through refresh, result, and terminal replay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const state: LiveToolLifecycleState = {
    completed: false,
    lastEventId: 0,
    persistedFinalText: "",
    persistedToolCall: false,
    persistedToolResult: false,
    runCreated: false,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleLiveToolLifecycleApi(context, runCreateRequests, state),
      sessionTitle: "TS live tool lifecycle",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill(LIVE_TOOL_PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: LIVE_TOOL_PROMPT }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-tool-live-lifecycle\/events\?after_event_id=0$/,
    );

    await dispatchLiveToolRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchLiveToolRunEvent(page, {
      eventId: 2,
      payload: {
        args: { path: LIVE_TOOL_PATH },
        tool_call_id: "call-v2-live-tool-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      type: "tool_call.started",
    });
    state.lastEventId = 2;
    state.persistedToolCall = true;

    await expectRunningReadTool(page);
    await page.screenshot({
      path: screenshotPath("v2-tool-lifecycle-live-running.png", SCREENSHOT_FOLDER),
    });

    await page.reload();
    await waitForAppShell(page);
    await expectRunningReadTool(page);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-tool-live-lifecycle\/events\?after_event_id=2$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchLiveToolRunEvent(page, {
      eventId: 3,
      payload: {
        result: { data: LIVE_TOOL_OUTPUT, ok: true },
        tool_call_id: "call-v2-live-tool-read",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      type: "tool_result.completed",
    });
    state.lastEventId = 3;
    state.persistedToolResult = true;

    await expectCompletedReadTool(page);
    await page.screenshot({
      path: screenshotPath("v2-tool-lifecycle-live-completed.png", SCREENSHOT_FOLDER),
    });

    await dispatchLiveToolRunEvent(page, {
      eventId: 4,
      payload: {
        output: [{ kind: "text", text: LIVE_TOOL_FINAL }],
      },
      relayEventType: "output_delta",
      type: "message.output.delta",
    });
    state.lastEventId = 5;
    state.persistedFinalText = LIVE_TOOL_FINAL;
    state.completed = true;
    await dispatchLiveToolRunEvent(page, {
      eventId: 5,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);

    await page.reload();
    await waitForAppShell(page);
    await expect(page.getByText(LIVE_TOOL_FINAL)).toBeVisible();
    const processed = page.locator("details.at-processed-group");
    await expect(processed).toHaveCount(1);
    await expect(processed).not.toHaveAttribute("open", "");
    await expect(processed.locator(".at-message-tool")).toBeHidden();
    await processed.locator(".at-processed-group-summary").click();
    await expect(processed).toHaveAttribute("open", "");
    const replayedTool = processed.locator(".at-message-tool", {
      hasText: "Read: read",
    });
    await expect(replayedTool).toHaveCount(1);
    await expect(replayedTool).toHaveAttribute("data-status", "completed");
    await expect(replayedTool.locator(".at-message-tool-spinner")).toHaveCount(0);
    await expect(page.getByText("Reading: read")).toHaveCount(0);
    await replayedTool.locator(".at-message-tool-summary").click();
    await expect(replayedTool.locator(".at-message-tool-body")).toContainText(
      LIVE_TOOL_PATH,
    );
    await expect(replayedTool.locator(".at-message-tool-body")).toContainText(
      LIVE_TOOL_OUTPUT,
    );
    await page.screenshot({
      path: screenshotPath("v2-tool-lifecycle-live-replay.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "live tool lifecycle replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    await appServer.close();
  }
});

async function handleToolLifecycleApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(toolLifecycleMessages());
    return true;
  }
  return false;
}

function toolLifecycleMessages(): unknown[] {
  return [
    {
      content: "Inspect README",
      created_at: "2026-07-01T09:00:00Z",
      message_id: "tool-lifecycle-user",
      role: "user",
      run_id: TOOL_RUN_ID,
    },
    {
      created_at: "2026-07-01T09:00:01Z",
      message: {
        parts: [
          {
            args: { path: "README.md" },
            part_kind: "tool-call",
            tool_call_id: "call-tool-lifecycle-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "tool-lifecycle-call",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
    {
      created_at: "2026-07-01T09:00:02Z",
      message: {
        parts: [
          {
            content: "README excerpt from history.",
            part_kind: "tool-return",
            tool_call_id: "call-tool-lifecycle-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "tool-lifecycle-result",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
    {
      content: "Tool lifecycle final answer.",
      created_at: "2026-07-01T09:00:03Z",
      message_id: "tool-lifecycle-final",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
  ];
}

async function handleLiveToolLifecycleApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  state: LiveToolLifecycleState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    state.runCreated = true;
    await context.fulfillJson({
      run_id: LIVE_TOOL_RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(liveToolLifecycleMessages(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(liveToolLifecycleRecovery(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [
        {
          created_at: "2026-07-01T14:00:00Z",
          run_id: LIVE_TOOL_RUN_ID,
          run_status: state.completed ? "completed" : "running",
          run_user_message: LIVE_TOOL_PROMPT,
        },
      ],
      next_cursor: null,
    });
    return true;
  }
  return false;
}

function liveToolLifecycleMessages(
  state: LiveToolLifecycleState,
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (state.runCreated) {
    messages.push({
      content: LIVE_TOOL_PROMPT,
      created_at: "2026-07-01T14:00:00Z",
      message_id: "live-tool-lifecycle-user",
      role: "user",
      run_id: LIVE_TOOL_RUN_ID,
    });
  }
  const parts: Array<Record<string, unknown>> = [];
  if (state.persistedToolCall) {
    parts.push({
      args: { path: LIVE_TOOL_PATH },
      part_kind: "tool-call",
      tool_call_id: "call-v2-live-tool-read",
      tool_name: "read",
    });
  }
  if (state.persistedToolResult) {
    parts.push({
      content: LIVE_TOOL_OUTPUT,
      part_kind: "tool-return",
      tool_call_id: "call-v2-live-tool-read",
      tool_name: "read",
    });
  }
  if (state.persistedFinalText.trim().length > 0) {
    parts.push({
      content: state.persistedFinalText,
      part_kind: "text",
    });
  }
  if (parts.length > 0) {
    messages.push({
      created_at: "2026-07-01T14:00:01Z",
      message: { parts },
      message_id: "live-tool-lifecycle-assistant",
      role_id: "MainAgent",
      run_id: LIVE_TOOL_RUN_ID,
    });
  }
  return messages;
}

function liveToolLifecycleRecovery(
  state: LiveToolLifecycleState,
): Record<string, unknown> {
  return {
    active_run:
      state.runCreated && !state.completed
        ? {
            last_event_id: state.lastEventId,
            pending_tool_approval_count: 0,
            pending_user_question_count: 0,
            phase: "streaming",
            run_id: LIVE_TOOL_RUN_ID,
            session_id: SESSION_ID,
            should_show_recover: false,
            status: "running",
            stream_connected: false,
          }
        : null,
    background_tasks: [],
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
  };
}

function readRunCreateRequest(body: string | null): CapturedRunCreateRequest {
  if (body === null || !body.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as CapturedRunCreateRequest;
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchLiveToolRunEvent(
  page: Page,
  event: BrowserRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-07-01T14:00:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: LIVE_TOOL_RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-v2-live-tool-lifecycle",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

async function expectRunningReadTool(page: Page): Promise<void> {
  const tool = page.locator(".at-message-tool", { hasText: "Reading: read" });
  await expect(tool).toHaveCount(1);
  await expect(tool).toHaveAttribute("data-status", "running");
  await expect(tool.locator(".at-message-tool-spinner")).toHaveCount(1);
  await expect(tool.locator(".at-message-tool-preview"))
    .toHaveText(LIVE_TOOL_PATH);
  await expect(page.getByText("Read: read")).toHaveCount(0);
  await expect(page.locator(".at-message-tool")).toHaveCount(1);
}

async function expectCompletedReadTool(page: Page): Promise<void> {
  const tool = page.locator(".at-message-tool", { hasText: "Read: read" });
  await expect(tool).toHaveCount(1);
  await expect(tool).toHaveAttribute("data-status", "completed");
  await expect(tool.locator(".at-message-tool-spinner")).toHaveCount(0);
  await expect(tool.locator(".at-message-tool-preview"))
    .toHaveText(LIVE_TOOL_OUTPUT);
  await expect(page.getByText("Reading: read")).toHaveCount(0);
  await expect(page.locator(".at-message-tool")).toHaveCount(1);
}
