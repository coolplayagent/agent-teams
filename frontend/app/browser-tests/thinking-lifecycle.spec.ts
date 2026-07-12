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

const RUN_ID = "run-ts-thinking-lifecycle";
const SCREENSHOT_FOLDER = "frontend-v2-ts-thinking";
const THINKING_PROMPT = "Browser thinking lifecycle check";
const THINKING_PREFIX = "Browser recovered thought prefix.";
const THINKING_SUFFIX = " Continued after refresh.";
const FINAL_TEXT = "Thinking lifecycle final answer.";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
}

interface ThinkingLifecycleState {
  completed: boolean;
  lastEventId: number;
  persistedFinalText: string;
  persistedThinkingText: string;
  runCreated: boolean;
}

test("streams thinking once, resumes after refresh, and folds terminal replay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const state: ThinkingLifecycleState = {
    completed: false,
    lastEventId: 0,
    persistedFinalText: "",
    persistedThinkingText: "",
    runCreated: false,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleThinkingLifecycleApi(context, runCreateRequests, state),
      sessionTitle: "TS thinking lifecycle",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill(THINKING_PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: THINKING_PROMPT }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-thinking-lifecycle\/events\?after_event_id=0$/,
    );

    await dispatchThinkingRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchThinkingRunEvent(page, {
      eventId: 2,
      payload: { part_index: 0 },
      relayEventType: "thinking_started",
      type: "thinking.started",
    });
    await expect(page.locator(".at-message-thinking")).toHaveCount(0);

    await dispatchThinkingRunEvent(page, {
      eventId: 3,
      payload: { part_index: 0, text: "   " },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });
    await expect(page.locator(".at-message-thinking")).toHaveCount(0);

    await dispatchThinkingRunEvent(page, {
      eventId: 4,
      payload: { part_index: 0, text: THINKING_PREFIX },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });
    state.lastEventId = 4;
    state.persistedThinkingText = THINKING_PREFIX;
    await expectLiveThinking(page, THINKING_PREFIX);
    await expect.poll(() => textOccurrenceCountInChat(page, THINKING_PREFIX))
      .toBe(1);

    await page.reload();
    await waitForAppShell(page);
    await expectLiveThinking(page, THINKING_PREFIX);
    await expect.poll(() => textOccurrenceCountInChat(page, THINKING_PREFIX))
      .toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-thinking-lifecycle\/events\?after_event_id=4$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchThinkingRunEvent(page, {
      eventId: 5,
      payload: {
        part_index: 0,
        text: `${THINKING_PREFIX}${THINKING_SUFFIX}`,
      },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });
    state.lastEventId = 5;
    state.persistedThinkingText = `${THINKING_PREFIX}${THINKING_SUFFIX}`;
    await expectLiveThinking(page, `${THINKING_PREFIX}${THINKING_SUFFIX}`);
    await expect.poll(() => textOccurrenceCountInChat(page, THINKING_PREFIX))
      .toBe(1);
    await page.screenshot({
      path: screenshotPath("v2-thinking-live-resumed.png", SCREENSHOT_FOLDER),
    });

    await dispatchThinkingRunEvent(page, {
      eventId: 6,
      payload: { part_index: 0 },
      relayEventType: "thinking_finished",
      type: "thinking.finished",
    });
    state.completed = true;
    state.lastEventId = 7;
    state.persistedFinalText = FINAL_TEXT;
    await dispatchThinkingRunEvent(page, {
      eventId: 7,
      payload: {
        output: [{ kind: "text", text: FINAL_TEXT }],
        status: "completed",
      },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByText(FINAL_TEXT)).toBeVisible();
    await expect(page.locator(".at-message-thinking[data-streaming='true']"))
      .toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-thinking-live-terminal.png", SCREENSHOT_FOLDER),
    });

    await page.reload();
    await waitForAppShell(page);
    await expect(page.getByText(FINAL_TEXT)).toBeVisible();
    const processed = page.locator("details.at-processed-group");
    await expect(processed).toHaveCount(1);
    await expect(processed).not.toHaveAttribute("open", "");
    await expect(processed.locator(".at-message-thinking")).toBeHidden();
    await expect.poll(() => textOccurrenceCountInChat(page, THINKING_PREFIX))
      .toBe(1);

    await processed.locator(".at-processed-group-summary").click();
    await expect(processed).toHaveAttribute("open", "");
    await expect(processed.locator(".at-message-thinking")).toHaveCount(1);
    await expect(processed.locator(".at-message-thinking"))
      .toContainText(`${THINKING_PREFIX}${THINKING_SUFFIX}`);
    await expect(processed.locator(".at-message-thinking[data-streaming='true']"))
      .toHaveCount(0);
    await processed.locator(".at-message-thinking-summary").click();
    await expect(processed.locator(".at-message-thinking")).toHaveAttribute(
      "open",
      "",
    );
    await expect.poll(() => textOccurrenceCountInChat(page, THINKING_PREFIX))
      .toBe(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "thinking lifecycle replay should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-thinking-terminal-replay-expanded.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps processed work and the final answer geometrically stable at terminal", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const state: ThinkingLifecycleState = {
    completed: false,
    lastEventId: 0,
    persistedFinalText: "",
    persistedThinkingText: "",
    runCreated: false,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleThinkingLifecycleApi(context, runCreateRequests, state),
      sessionTitle: "TS terminal geometry",
    });
    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    await page.getByRole("textbox", { name: "Prompt" }).fill(THINKING_PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-thinking-lifecycle\/events\?after_event_id=0$/,
    );
    await dispatchThinkingRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchThinkingRunEvent(page, {
      eventId: 2,
      payload: { part_index: 0, text: THINKING_PREFIX },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });
    await dispatchThinkingRunEvent(page, {
      eventId: 3,
      payload: { part_index: 0 },
      relayEventType: "thinking_finished",
      type: "thinking.finished",
    });
    await dispatchThinkingRunEvent(page, {
      eventId: 4,
      payload: { text: FINAL_TEXT },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(FINAL_TEXT)).toBeVisible();
    const liveGeometry = await processedAnswerGeometry(page, FINAL_TEXT);
    expect(liveGeometry.answerTop + 1).toBeGreaterThanOrEqual(liveGeometry.processedBottom);
    expect(liveGeometry.processedHeight)
      .toBeGreaterThanOrEqual(liveGeometry.processedScrollHeight - 1);

    state.completed = true;
    state.lastEventId = 5;
    state.persistedFinalText = FINAL_TEXT;
    state.persistedThinkingText = THINKING_PREFIX;
    await dispatchThinkingRunEvent(page, {
      eventId: 5,
      payload: {
        output: [{ kind: "text", text: FINAL_TEXT }],
        status: "completed",
      },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    const settledGeometry = await processedAnswerGeometry(page, FINAL_TEXT);
    expect(settledGeometry.answerTop + 1)
      .toBeGreaterThanOrEqual(settledGeometry.processedBottom);
    expect(settledGeometry.processedHeight)
      .toBeGreaterThanOrEqual(settledGeometry.processedScrollHeight - 1);
    expect(Math.abs(
      settledGeometry.timelineScrollHeight - liveGeometry.timelineScrollHeight,
    )).toBeLessThan(2);
    expect(Math.abs(
      settledGeometry.timelineScrollTop - liveGeometry.timelineScrollTop,
    )).toBeLessThan(2);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function processedAnswerGeometry(page: Page, answerText: string): Promise<{
  answerTop: number;
  processedBottom: number;
  processedHeight: number;
  processedScrollHeight: number;
  timelineScrollHeight: number;
  timelineScrollTop: number;
}> {
  return page.evaluate((text) => {
    const processed = document.querySelector<HTMLElement>(
      ".at-timeline-virtual > .at-processed-group-row",
    );
    const answer = Array.from(document.querySelectorAll<HTMLElement>(
      ".at-timeline-virtual > article.at-message",
    )).find((element) => element.textContent?.includes(text));
    const timeline = document.querySelector<HTMLElement>(".at-timeline");
    if (processed === null || answer === undefined || timeline === null) {
      throw new Error("Expected processed group, final answer, and timeline geometry");
    }
    const processedRect = processed.getBoundingClientRect();
    return {
      answerTop: answer.getBoundingClientRect().top,
      processedBottom: processedRect.bottom,
      processedHeight: processedRect.height,
      processedScrollHeight: processed.scrollHeight,
      timelineScrollHeight: timeline.scrollHeight,
      timelineScrollTop: timeline.scrollTop,
    };
  }, answerText);
}

async function handleThinkingLifecycleApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  state: ThinkingLifecycleState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    state.runCreated = true;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(thinkingLifecycleMessages(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(thinkingLifecycleRecovery(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [
        {
          created_at: "2026-07-01T13:00:00Z",
          run_id: RUN_ID,
          run_status: state.completed ? "completed" : "running",
          run_user_message: THINKING_PROMPT,
        },
      ],
      next_cursor: null,
    });
    return true;
  }
  return false;
}

function thinkingLifecycleMessages(
  state: ThinkingLifecycleState,
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (state.runCreated) {
    messages.push({
      content: THINKING_PROMPT,
      created_at: "2026-07-01T13:00:00Z",
      message_id: "thinking-lifecycle-user",
      role: "user",
      run_id: RUN_ID,
    });
  }
  const parts: Array<Record<string, unknown>> = [];
  if (state.persistedThinkingText.trim().length > 0) {
    parts.push({
      content: state.persistedThinkingText,
      part_kind: "thinking",
      part_index: 0,
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
      created_at: "2026-07-01T13:00:01Z",
      message: { parts },
      message_id: "thinking-lifecycle-assistant",
      role_id: "MainAgent",
      run_id: RUN_ID,
    });
  }
  return messages;
}

function thinkingLifecycleRecovery(
  state: ThinkingLifecycleState,
): Record<string, unknown> {
  return {
    active_run:
      state.runCreated && !state.completed
        ? {
            last_event_id: state.lastEventId,
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

async function dispatchThinkingRunEvent(
  page: Page,
  event: BrowserRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-07-01T13:00:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-ts-thinking-lifecycle",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

async function expectLiveThinking(page: Page, text: string): Promise<void> {
  const thinking = page.locator(".at-chat-view .at-message-thinking");
  await expect(thinking).toHaveCount(1);
  await expect(thinking).toContainText(text);
}

async function textOccurrenceCountInChat(
  page: Page,
  text: string,
): Promise<number> {
  return page.locator(".at-chat-view").evaluate((element, needle) => {
    if (needle.length === 0) {
      return 0;
    }
    return (element.textContent ?? "").split(needle).length - 1;
  }, text);
}
