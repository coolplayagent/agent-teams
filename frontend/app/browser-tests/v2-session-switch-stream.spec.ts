import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
  eventSourceOpenCount,
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
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-session-switch";
const SECOND_SESSION_ID = "session-v2-secondary";
const SCREENSHOT_FOLDER = "frontend-v2-ts-session-switch";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
}

test("clears an active foreground stream when switching sessions", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleSessionSwitchApi(context, runCreateRequests),
      sessionTitle: "TS active stream source",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const promptText = "Switch sessions during an active stream";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-session-switch\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const streamedText = "First session is still streaming.";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: streamedText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(streamedText)).toBeVisible();

    await page.getByRole("button", { name: "TS secondary session" }).click();

    await expect(page.getByText("Second session hydrated output")).toBeVisible();
    await expect(page.getByText(streamedText)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(prompt).toBeEnabled();
    await expect.poll(() => eventSourceOpenCount(page)).toBe(0);

    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: "Late source-session chunk should stay hidden." },
      relayEventType: "text_delta",
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await expect(page.getByText("Late source-session chunk should stay hidden."))
      .toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "active stream session switch should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-active-stream-session-switch.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleSessionSwitchApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson([
      sourceSessionSidebarRecord(),
      secondarySessionSidebarRecord(),
    ]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [sourceSessionSidebarRecord(), secondarySessionSidebarRecord()],
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(sessionRecord(SESSION_ID, "TS active stream source"));
    return true;
  }
  if (context.path === `/sessions/${SECOND_SESSION_ID}`) {
    await context.fulfillJson(sessionRecord(SECOND_SESSION_ID, "TS secondary session"));
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === `/sessions/${SECOND_SESSION_ID}/messages`) {
    await context.fulfillJson([secondarySessionMessage()]);
    return true;
  }
  if (
    context.path === `/sessions/${SESSION_ID}/rounds` ||
    context.path === `/sessions/${SECOND_SESSION_ID}/rounds`
  ) {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (
    context.path === `/sessions/${SESSION_ID}/recovery` ||
    context.path === `/sessions/${SECOND_SESSION_ID}/recovery`
  ) {
    await context.fulfillJson(emptyRecoverySnapshot());
    return true;
  }
  if (
    context.path === `/sessions/${SESSION_ID}/token-usage` ||
    context.path === `/sessions/${SECOND_SESSION_ID}/token-usage`
  ) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  for (const suffix of ["/subagents", "/agents", "/tasks"]) {
    if (
      context.path === `/sessions/${SESSION_ID}${suffix}` ||
      context.path === `/sessions/${SECOND_SESSION_ID}${suffix}`
    ) {
      await context.fulfillJson([]);
      return true;
    }
  }
  return false;
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

function sourceSessionSidebarRecord(): Record<string, unknown> {
  return {
    active_run_status: "running",
    created_at: "2026-06-25T08:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    title: "TS active stream source",
    updated_at: "2026-06-25T08:32:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function secondarySessionSidebarRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-25T08:01:00Z",
    message_count: 1,
    session_id: SECOND_SESSION_ID,
    title: "TS secondary session",
    updated_at: "2026-06-25T08:31:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function sessionRecord(sessionId: string, title: string): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-25T08:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: sessionId,
    session_mode: "normal",
    title,
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function secondarySessionMessage(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:31:00Z",
    message: {
      parts: [
        {
          content: "Second session hydrated output",
          part_kind: "text",
        },
      ],
    },
    message_id: "message-secondary-session",
    role_id: "MainAgent",
    run_id: "run-secondary-session",
  };
}

function emptyRecoverySnapshot(): Record<string, unknown> {
  return {
    active_run: null,
    background_tasks: [],
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
  };
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  sourceIndex?: number;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-06-26T10:00:0${event.eventId}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-ts-session-switch",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    sourceIndex: event.sourceIndex ?? null,
    type: event.type,
  });
}
