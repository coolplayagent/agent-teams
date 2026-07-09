import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceError,
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

const RUN_ID = "run-ts-reconnect";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
  shell_safety_policy_enabled?: boolean;
  yolo?: boolean;
}

test.setTimeout(45_000);

test("exhausts manual stream reconnects and restores composer controls", async ({
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
      sessionTitle: "TS stream reconnect",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Reconnect from TS browser";
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
      /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const streamedChunk = "TS reconnect chunk survives.";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: streamedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(streamedChunk)).toBeVisible();

    await dispatchErrorAndWaitForReconnect(page, 2);
    await dispatchErrorAndWaitForReconnect(page, 3);
    await dispatchErrorAndWaitForReconnect(page, 4);

    await dispatchEventSourceError(page);
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(prompt).toBeEnabled();
    await expect(sendButton).toBeVisible();
    await expect(page.getByText(streamedChunk)).toBeVisible();

    await page.waitForTimeout(4_000);
    await expect.poll(() => eventSourceUrls(page)).toHaveLength(4);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 reconnect exhaustion should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-reconnect-exhausted.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("preserves non-text stream events after reconnect", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleStreamApi(context, runCreateRequests),
      sessionTitle: "TS non-text reconnect",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Reconnect non-text events";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(promptText);
    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=0$/,
    );

    const streamedChunk = "TS non-text base chunk.";
    const thinkingPrefix = "TS reconnect reasoning starts ";
    const thinkingSuffix = "and continues.";
    const toolOutput = "TS reconnect tool output";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: streamedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { part_index: 0 },
      relayEventType: "thinking_started",
      type: "thinking.started",
    });
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: { delta: thinkingPrefix, part_index: 0 },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });

    await expect(page.getByText(streamedChunk)).toBeVisible();
    await expect(
      page.locator(".at-message-thinking").filter({ hasText: thinkingPrefix }),
    ).toBeVisible();

    await dispatchErrorAndWaitForReconnect(page, 2, 4);

    await dispatchRunEvent(page, {
      eventId: 5,
      payload: { delta: thinkingSuffix, part_index: 0 },
      relayEventType: "thinking_delta",
      type: "thinking.delta",
    });
    await expect(
      page
        .locator(".at-message-thinking")
        .filter({ hasText: `${thinkingPrefix}${thinkingSuffix}` }),
    ).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: streamedChunk }))
      .toHaveCount(1);

    await dispatchRunEvent(page, {
      eventId: 6,
      payload: {
        args: { path: "README.md" },
        tool_call_id: "call-ts-reconnect-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      type: "tool_call.started",
    });
    await dispatchRunEvent(page, {
      eventId: 7,
      payload: {
        result: { data: toolOutput, ok: true },
        tool_call_id: "call-ts-reconnect-read",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      type: "tool_result.completed",
    });
    await expect(page.getByText("Tool result: read")).toBeVisible();
    await expect(page.getByText("Tool call: read")).toHaveCount(0);
    await expect(
      page.locator(".at-message-tool-preview").getByText(toolOutput, {
        exact: true,
      }),
    ).toBeVisible();
    const readTool = page.locator(".at-message-tool").filter({
      hasText: "Tool result: read",
    });
    await expect(readTool).toHaveCount(1);
    await readTool.locator(".at-message-tool-summary").click();
    await expect(readTool.getByText(/README\.md/)).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 non-text reconnect should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-stream-non-text-reconnect.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("renders late unseen stream events in event id order", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleStreamApi(context, runCreateRequests),
      sessionTitle: "TS late stream event",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill("Late event order check");
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=0$/,
    );

    const firstChunk = "ORDER_EVENT_10";
    const lateChunk = "ORDER_EVENT_11";
    const thirdChunk = "ORDER_EVENT_12";
    await dispatchRunEvent(page, {
      eventId: 10,
      payload: { text: firstChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await dispatchRunEvent(page, {
      eventId: 12,
      payload: { text: thirdChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(firstChunk)).toBeVisible();
    await expect(page.getByText(thirdChunk)).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 11,
      payload: { text: lateChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(lateChunk)).toBeVisible();
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, tokens) => {
        const text = root.textContent ?? "";
        const indexes = (tokens as string[]).map((token) => text.indexOf(token));
        return (
          indexes.every((index) => index >= 0) &&
          indexes[0] < indexes[1] &&
          indexes[1] < indexes[2]
        );
      }, [firstChunk, lateChunk, thirdChunk]),
    ).toBe(true);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, token) =>
        (root.textContent ?? "").split(token as string).length - 1,
      lateChunk),
    ).toBe(1);

    await dispatchRunEvent(page, {
      eventId: 13,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 late stream event order should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-late-stream-event-order.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("reconnects from SSE Last-Event-ID when payload event id is missing", async ({
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
      sessionTitle: "TS last event id reconnect",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Reconnect from SSE last event id";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(promptText);
    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const boundaryChunk = "Chunk keyed only by SSE Last-Event-ID.";
    await dispatchRunEvent(page, {
      eventId: null,
      lastEventId: "11",
      payload: { text: boundaryChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(boundaryChunk)).toBeVisible();

    await dispatchEventSourceError(page);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=11$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchRunEvent(page, {
      eventId: null,
      lastEventId: "11",
      payload: { text: boundaryChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.locator(".at-message").filter({ hasText: boundaryChunk }))
      .toHaveCount(1);

    const continuationChunk = " Fresh chunk after SSE cursor reconnect.";
    await dispatchRunEvent(page, {
      eventId: null,
      lastEventId: "12",
      payload: { text: continuationChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(
      page.locator(".at-message").filter({ hasText: continuationChunk.trim() }),
    ).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 13,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(sendButton).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 Last-Event-ID reconnect should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-last-event-id-reconnect.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function dispatchErrorAndWaitForReconnect(
  page: Page,
  totalSourceCount: number,
  afterEventId = 2,
): Promise<void> {
  await dispatchEventSourceError(page);
  await expect
    .poll(() => eventSourceUrls(page), { timeout: 13_000 })
    .toHaveLength(totalSourceCount);
  await waitForEventSourceUrl(
    page,
    new RegExp(
      `/api/ag-ui/runs/run-ts-reconnect/events\\?after_event_id=${afterEventId}$`,
    ),
  );
  await waitForEventSourceOpenCount(page, 1);
}

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
  eventId: number | null;
  lastEventId?: string;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const numericEventId = event.eventId ?? Number(event.lastEventId ?? 0);
  const payload: Record<string, unknown> = {
    occurred_at: `2026-06-26T09:00:${String(numericEventId).padStart(2, "0")}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-reconnect",
    type: event.type,
  };
  if (event.eventId !== null) {
    payload.event_id = event.eventId;
  }
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId:
      event.lastEventId ?? (event.eventId === null ? "" : String(event.eventId)),
    type: event.type,
  });
}
