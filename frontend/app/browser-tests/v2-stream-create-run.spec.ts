import { expect, test, type Locator, type Page } from "@playwright/test";

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
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-stream";
const BURST_NEW_SESSION_COUNT = 3;
const BURST_SESSION_FEEDBACK_TIMEOUT_MS = 2500;
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
  shell_safety_policy_enabled?: boolean;
  thinking?: unknown;
  yolo?: boolean;
}

interface CapturedApiRequest {
  method: string;
  path: string;
}

interface BurstNewSessionState {
  apiRequests: CapturedApiRequest[];
  createdSessionCount: number;
  runCreateRequests: CapturedRunCreateRequest[];
}

test("creates a run from the V2 composer and renders live stream output", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleStreamApi(context, runCreateRequests),
      sessionTitle: "TS stream create run",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.getByText("No messages yet")).toBeVisible();

    const promptText = "Stream from TS browser";
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
    expect(runCreateRequests[0]).not.toHaveProperty("intent");
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-stream\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { status: "running" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: "TS browser stream chunk one." },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });

    await expect(page.getByText("TS browser stream chunk one.")).toBeVisible();
    await expect(page.getByText("Run started: status running")).toHaveCount(0);

    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { output: "stream finished", status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });

    await expect(
      page.getByText("Run completed: status completed · stream finished"),
    ).toHaveCount(0);
    await expect(page.getByText("TS browser stream chunk one.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 stream shell should stay fixed-height");
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-stream-create-run.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("renders received stream text incrementally and does not replay after terminal output", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleStreamApi(context, runCreateRequests),
      sessionTitle: "TS stream immediate delta",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill("Progressive stream check");
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-stream\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const firstDelta = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    const secondDelta = [
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const finalAnswer = `${firstDelta} ${secondDelta}`;

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { status: "running" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: firstDelta },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });

    const streamingText = page.locator(".at-message-streaming-text").first();
    await expect(streamingText).toBeVisible();
    await expect(streamingText).toHaveText(firstDelta);
    await expect(page.locator(".at-chat-view .at-message-streaming-text"))
      .toHaveCount(1);
    await expect.poll(() => emptyStreamingTextCount(page.locator(".at-chat-view")))
      .toBe(0);
    await expect(page.getByText(finalAnswer)).toHaveCount(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(1);

    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: ` ${secondDelta}` },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(streamingText).toHaveText(finalAnswer);
    await page.locator(".at-message-streaming-text").evaluate((element) => {
      element.setAttribute("data-stream-stable-node", "before-terminal");
    });

    const rowKeyBeforeTerminal = await page
      .locator("article.at-message")
      .first()
      .getAttribute("data-row-key");
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: {
        output: [{ kind: "text", text: finalAnswer }],
        status: "completed",
      },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);

    await expect(page.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect.poll(async () => page.locator(".streaming-cursor").count())
      .toBe(0);
    await expect(
      page.locator('.at-message-text[data-stream-stable-node="before-terminal"]'),
    ).toHaveCount(1);
    await expect(page.getByText(finalAnswer)).toHaveCount(1);
    await expect(page.locator("article.at-message")).toHaveCount(1);
    await expect(page.locator("article.at-message").first()).toHaveAttribute(
      "data-row-key",
      rowKeyBeforeTerminal ?? "",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      path: screenshotPath("v2-stream-received-delta-no-replay.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("starts burst new sessions with fast feedback and bounded requests", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: BurstNewSessionState = {
    apiRequests: [],
    createdSessionCount: 0,
    runCreateRequests: [],
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBurstNewSessionApi(context, state),
      sessionTitle: "TS burst seed",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByRole("button", { name: "TS burst seed" }))
      .toBeVisible();
    await expect(page.locator(".at-session-item.is-selected")).toContainText(
      "TS burst seed",
    );
    state.apiRequests = [];

    const feedbackTimesMs: number[] = [];
    for (let index = 0; index < BURST_NEW_SESSION_COUNT; index += 1) {
      await page.getByRole("button", { exact: true, name: "New session" }).click();
      await expect(page.getByRole("button", { name: burstSessionTitle(index) }))
        .toBeVisible();
      await expect(page.getByText("No messages yet")).toBeVisible();

      const promptText = `browser burst start ${index}`;
      await page.getByRole("textbox", { name: "Prompt" }).fill(promptText);
      const started = Date.now();
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({
        timeout: BURST_SESSION_FEEDBACK_TIMEOUT_MS,
      });
      feedbackTimesMs.push(Date.now() - started);

      await expect.poll(() => state.runCreateRequests.length).toBe(index + 1);
      expect(state.runCreateRequests[index]).toMatchObject({
        input: [{ kind: "text", text: promptText }],
        session_id: burstSessionId(index),
      });
      await waitForEventSourceUrl(
        page,
        new RegExp(
          `/api/ag-ui/runs/${burstRunId(index)}/events\\?after_event_id=0$`,
        ),
      );
      await dispatchBurstRunEvent(page, index, {
        eventId: 1,
        payload: { status: "running" },
        relayEventType: "run_started",
        type: "run.started",
      });
      await dispatchBurstRunEvent(page, index, {
        eventId: 2,
        payload: { text: `Burst output ${index}.` },
        relayEventType: "text_delta",
        type: "message.text.delta",
      });
      await expect(page.getByText(`Burst output ${index}.`)).toBeVisible();
    }

    await page.waitForTimeout(500);
    expect(feedbackTimesMs.every((value) => value < BURST_SESSION_FEEDBACK_TIMEOUT_MS))
      .toBe(true);
    expect(requestCount(state, "POST", "/sessions")).toBe(BURST_NEW_SESSION_COUNT);
    expect(requestCount(state, "POST", "/ag-ui/runs")).toBe(
      BURST_NEW_SESSION_COUNT,
    );
    expect(requestCount(state, "GET", "/workspaces")).toBe(0);
    expect(sessionIndexRequestCount(state)).toBeLessThanOrEqual(6);
    expect(recoveryRequestCount(state)).toBeLessThanOrEqual(6);
    expect(subagentRequestCount(state)).toBe(0);
    expect(requestCount(state, "GET", "/system/configs/model/profiles"))
      .toBeLessThanOrEqual(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "burst new session starts should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-burst-new-session-starts.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps copy last answer disabled until the live stream reaches terminal state", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await installClipboardProbe(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleStreamApi(context, runCreateRequests),
      sessionTitle: "TS stream copy terminal",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Copy should wait for terminal state";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-stream\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: "Terminal copy should wait." },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText("Terminal copy should wait.")).toBeVisible();

    const copyButton = page.getByRole("button", { name: "Copy last answer" });
    await expect(copyButton).toBeVisible();
    await expect(copyButton).toBeDisabled();
    await expectCopiedText(page, null);

    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    await expectCopiedText(page, "Terminal copy should wait.");
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "copy last answer terminal state should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-copy-last-answer-terminal.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleStreamApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
): Promise<boolean> {
  if (context.method !== "POST" || context.path !== "/ag-ui/runs") {
    return false;
  }
  runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
  await context.fulfillJson({
    run_id: RUN_ID,
    session_id: SESSION_ID,
    target_role_id: null,
  });
  return true;
}

async function handleBurstNewSessionApi(
  context: MockApiRouteContext,
  state: BurstNewSessionState,
): Promise<boolean> {
  state.apiRequests.push({
    method: context.method,
    path: `${context.path}${context.url.search}`,
  });

  if (context.method === "POST") {
    if (context.path === "/sessions") {
      const session = burstSessionRecord(state.createdSessionCount);
      state.createdSessionCount += 1;
      await context.fulfillJson(burstSessionDetail(session));
      return true;
    }
    if (context.path === "/ag-ui/runs") {
      const request = readRunCreateRequest(context.route.request().postData());
      state.runCreateRequests.push(request);
      const index = Math.max(state.runCreateRequests.length - 1, 0);
      await context.fulfillJson({
        run_id: burstRunId(index),
        session_id: request.session_id ?? burstSessionId(index),
        target_role_id: null,
      });
      return true;
    }
    return false;
  }

  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson(burstSidebarRecords(state));
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: burstSidebarRecords(state),
      next_cursor: null,
    });
    return true;
  }

  const sessionId = sessionIdFromPath(context.path);
  if (sessionId === null) {
    return false;
  }
  const session = burstSidebarRecords(state).find(
    (record) => record.session_id === sessionId,
  );
  if (session === undefined) {
    return false;
  }
  if (context.path === `/sessions/${sessionId}`) {
    await context.fulfillJson(burstSessionDetail(session));
    return true;
  }
  if (context.path === `/sessions/${sessionId}/messages`) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === `/sessions/${sessionId}/rounds`) {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (context.path === `/sessions/${sessionId}/recovery`) {
    await context.fulfillJson(emptyRecoverySnapshot());
    return true;
  }
  if (context.path === `/sessions/${sessionId}/token-usage`) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  for (const suffix of ["/subagents", "/agents", "/tasks"]) {
    if (context.path === `/sessions/${sessionId}${suffix}`) {
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

function burstSidebarRecords(
  state: BurstNewSessionState,
): Array<Record<string, unknown>> {
  const createdSessions = Array.from(
    { length: state.createdSessionCount },
    (_, index) => burstSessionRecord(index),
  ).reverse();
  return [burstSeedSessionRecord(), ...createdSessions];
}

function burstSeedSessionRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-26T13:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    title: "TS burst seed",
    updated_at: "2026-06-26T13:00:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function burstSessionRecord(index: number): Record<string, unknown> {
  return {
    active_run_status: "running",
    created_at: `2026-06-26T13:0${index + 1}:00Z`,
    message_count: 0,
    session_id: burstSessionId(index),
    title: burstSessionTitle(index),
    updated_at: `2026-06-26T13:0${index + 1}:00Z`,
    workspace_id: WORKSPACE_ID,
  };
}

function burstSessionId(index: number): string {
  return `session-v2-burst-${index}`;
}

function burstSessionTitle(index: number): string {
  return `Burst session ${index}`;
}

function burstRunId(index: number): string {
  return `run-v2-burst-${index}`;
}

function burstSessionDetail(session: Record<string, unknown>): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: session.created_at,
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: session.session_id,
    session_mode: "normal",
    title: session.title,
    updated_at: session.updated_at,
    workspace_id: session.workspace_id,
  };
}

function sessionIdFromPath(path: string): string | null {
  const match = /^\/sessions\/([^/]+)(?:\/[^/]+)?$/.exec(path);
  return match?.[1] ?? null;
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

function requestCount(
  state: BurstNewSessionState,
  method: string,
  path: string,
): number {
  return state.apiRequests.filter(
    (request) => request.method === method && request.path === path,
  ).length;
}

function sessionIndexRequestCount(state: BurstNewSessionState): number {
  return state.apiRequests.filter(
    (request) =>
      request.method === "GET" &&
      (request.path === "/sessions/sidebar" ||
        request.path.startsWith(`/workspaces/${WORKSPACE_ID}/sessions/sidebar`)),
  ).length;
}

function recoveryRequestCount(state: BurstNewSessionState): number {
  return state.apiRequests.filter(
    (request) =>
      request.method === "GET" &&
      request.path.startsWith("/sessions/") &&
      request.path.endsWith("/recovery"),
  ).length;
}

function subagentRequestCount(state: BurstNewSessionState): number {
  return state.apiRequests.filter(
    (request) =>
      request.method === "GET" &&
      request.path.startsWith("/sessions/") &&
      request.path.endsWith("/subagents"),
  ).length;
}

async function installClipboardProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem("agentTeams.browserTestCopiedText", text);
        },
      },
    });
    window.localStorage.removeItem("agentTeams.browserTestCopiedText");
  });
}

async function emptyStreamingTextCount(root: Locator): Promise<number> {
  return root.locator(".at-message-streaming-text").evaluateAll((elements) =>
    elements.filter((element) => (element.textContent ?? "").trim().length === 0)
      .length,
  );
}

async function expectCopiedText(
  page: Page,
  expectedText: string | null,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("agentTeams.browserTestCopiedText"),
      ),
    )
    .toBe(expectedText);
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchBurstRunEvent(
  page: Page,
  index: number,
  event: BrowserRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-06-26T13:0${index}:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: burstRunId(index),
      session_id: burstSessionId(index),
      trace_id: `trace-v2-burst-${index}`,
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const payload = {
    event_id: event.eventId,
    occurred_at: `2026-06-26T08:00:0${event.eventId}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-stream",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    type: event.type,
  });
}
