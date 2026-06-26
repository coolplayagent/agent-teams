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
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-refresh";
const TOOL_REPLAY_RUN_ID = "run-ts-tool-refresh";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
  shell_safety_policy_enabled?: boolean;
  yolo?: boolean;
}

interface RefreshRecoveryState {
  completed: boolean;
  lastEventId: number;
  persistedAssistantText: string;
  runCreated: boolean;
}

interface ToolReplayRecoveryState {
  completed: boolean;
  lastEventId: number;
  persistedAfterRefresh: boolean;
  persistedResumeText: string;
  runCreated: boolean;
}

test.setTimeout(45_000);

test("resumes an active stream after refresh without duplicating hydrated output", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    persistedAssistantText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Refresh stream recovery from TS browser";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(promptText);
    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
      shell_safety_policy_enabled: true,
      yolo: true,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const persistedChunk = "TS refresh persisted chunk.";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: persistedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 2;
    recoveryState.persistedAssistantText = persistedChunk;
    await expect(page.getByText(persistedChunk)).toBeVisible();

    await page.reload();
    await waitForV2Shell(page);
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=2$/,
    );
    await waitForEventSourceOpenCount(page, 1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const resumedChunk = "TS after reload chunk.";
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: resumedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 3;
    await expect(page.getByText(resumedChunk)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);

    recoveryState.persistedAssistantText = `${persistedChunk}${resumedChunk}`;
    recoveryState.lastEventId = 4;
    recoveryState.completed = true;
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByText(resumedChunk)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 refresh recovery should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-stream-refresh-replay.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("continues a tool-heavy replay after refresh from the hydrated cursor", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: ToolReplayRecoveryState = {
    completed: false,
    lastEventId: 0,
    persistedAfterRefresh: false,
    persistedResumeText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleToolReplayRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS tool replay refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Refresh a tool-heavy replay";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
      shell_safety_policy_enabled: true,
      yolo: true,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-tool-refresh\/events\?after_event_id=0$/,
    );

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      runId: TOOL_REPLAY_RUN_ID,
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: "Hydrated tool-heavy answer before refresh." },
      relayEventType: "text_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.text.delta",
    });
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: {
        args: { path: "README.md" },
        tool_call_id: "call-tool-replay-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_call.started",
    });
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: {
        result: {
          data: "README excerpt from the pre-refresh replay.",
          ok: true,
        },
        tool_call_id: "call-tool-replay-read",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_result.completed",
    });
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: {
        input_tokens: 144,
        output_tokens: 21,
        total_tokens: 165,
      },
      relayEventType: "token_usage",
      runId: TOOL_REPLAY_RUN_ID,
      type: "token_usage.updated",
    });
    recoveryState.lastEventId = 5;
    recoveryState.persistedAfterRefresh = true;

    await expect(page.getByText("Hydrated tool-heavy answer before refresh."))
      .toBeVisible();
    await expect(page.getByText("Tool call: read")).toBeVisible();
    await expect(page.getByText("Tool result: read")).toBeVisible();

    await page.reload();
    await waitForV2Shell(page);
    await expect(page.getByText("Hydrated tool-heavy answer before refresh."))
      .toBeVisible();
    await expect(page.getByText("Tool call: read")).toBeVisible();
    await expect(page.getByText("Tool result: read")).toBeVisible();
    await expect(page.locator(".at-message-tool")).toHaveCount(4);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-tool-refresh\/events\?after_event_id=5$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const duplicateCursorText = "Duplicate cursor chunk should stay hidden.";
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: { text: duplicateCursorText },
      relayEventType: "text_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.text.delta",
    });
    await expect(page.getByText(duplicateCursorText)).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(4);

    await dispatchRunEvent(page, {
      eventId: 6,
      payload: {
        details: "path is required",
        reason: "Input validation failed before tool execution.",
        tool_call_id: "call-tool-replay-validation",
        tool_name: "read",
      },
      relayEventType: "tool_input_validation_failed",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_call.validation_failed",
    });
    const resumedText = "Resumed output after the hydrated cursor.";
    await dispatchRunEvent(page, {
      eventId: 7,
      payload: {
        output: [{ kind: "text", text: resumedText }],
      },
      relayEventType: "output_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.output.delta",
    });
    recoveryState.lastEventId = 7;
    recoveryState.persistedResumeText = resumedText;

    await expect(page.getByText("Tool validation: read")).toBeVisible();
    await expect(page.getByText(resumedText)).toBeVisible();
    await expect(page.locator(".at-message-tool")).toHaveCount(5);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "tool-heavy refresh replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-tool-heavy-refresh-replay.png",
        SCREENSHOT_FOLDER,
      ),
    });

    recoveryState.completed = true;
    recoveryState.lastEventId = 8;
    await dispatchRunEvent(page, {
      eventId: 8,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      runId: TOOL_REPLAY_RUN_ID,
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByText(resumedText)).toBeVisible();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleRefreshApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  recoveryState: RefreshRecoveryState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    recoveryState.runCreated = true;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(persistedMessages(recoveryState));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(recoveryState));
    return true;
  }
  return false;
}

async function handleToolReplayRefreshApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  recoveryState: ToolReplayRecoveryState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    recoveryState.runCreated = true;
    await context.fulfillJson({
      run_id: TOOL_REPLAY_RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(toolReplayPersistedMessages(recoveryState));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(toolReplayRecoverySnapshot(recoveryState));
    return true;
  }
  return false;
}

function persistedMessages(recoveryState: RefreshRecoveryState): unknown[] {
  const text = recoveryState.persistedAssistantText.trim();
  if (!text) {
    return [];
  }
  return [
    {
      message: {
        parts: [
          {
            content: recoveryState.persistedAssistantText,
            part_kind: "text",
          },
        ],
      },
      message_id: "assistant-refresh-hydrated",
      role_id: "MainAgent",
      run_id: RUN_ID,
    },
  ];
}

function recoverySnapshot(recoveryState: RefreshRecoveryState): Record<string, unknown> {
  return {
    active_run:
      recoveryState.runCreated && !recoveryState.completed
        ? {
            last_event_id: recoveryState.lastEventId,
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

function toolReplayPersistedMessages(
  recoveryState: ToolReplayRecoveryState,
): unknown[] {
  if (!recoveryState.persistedAfterRefresh) {
    return [];
  }
  const textParts = [
    {
      content: "Hydrated tool-heavy answer before refresh.",
      part_kind: "text",
    },
  ];
  if (recoveryState.persistedResumeText.trim().length > 0) {
    textParts.push({
      content: recoveryState.persistedResumeText,
      part_kind: "text",
    });
  }
  return [
    {
      content: "Refresh a tool-heavy replay",
      created_at: "2026-06-26T10:05:00Z",
      message_id: "tool-replay-user",
      role: "user",
      run_id: TOOL_REPLAY_RUN_ID,
    },
    {
      created_at: "2026-06-26T10:05:01Z",
      message: {
        parts: [
          ...textParts,
          {
            args: { path: "README.md" },
            kind: "tool-call",
            tool_call_id: "call-tool-replay-read",
            tool_name: "read",
          },
          {
            content: "README excerpt from the pre-refresh replay.",
            part_kind: "tool-return",
            tool_call_id: "call-tool-replay-read",
            tool_name: "read",
          },
          {
            args: { cmd: "npm run test:browser -- --project=chromium" },
            kind: "tool-call",
            tool_call_id: "call-tool-replay-shell",
            tool_name: "shell",
          },
          {
            content: {
              error: {
                message: "Browser test failed before refresh.",
                type: "runtime_error",
              },
              ok: false,
            },
            part_kind: "tool-return",
            tool_call_id: "call-tool-replay-shell",
            tool_name: "shell",
          },
        ],
      },
      message_id: "tool-replay-assistant",
      role_id: "MainAgent",
      run_id: TOOL_REPLAY_RUN_ID,
    },
  ];
}

function toolReplayRecoverySnapshot(
  recoveryState: ToolReplayRecoveryState,
): Record<string, unknown> {
  return {
    active_run:
      recoveryState.runCreated && !recoveryState.completed
        ? {
            last_event_id: recoveryState.lastEventId,
            pending_tool_approval_count: 0,
            pending_user_question_count: 0,
            phase: "streaming",
            run_id: TOOL_REPLAY_RUN_ID,
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
  runId?: string;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const payload = {
    event_id: event.eventId,
    occurred_at: `2026-06-26T10:00:0${event.eventId}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: event.runId ?? RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-refresh",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    type: event.type,
  });
}
