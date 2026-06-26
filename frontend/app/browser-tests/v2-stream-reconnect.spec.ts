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

async function dispatchErrorAndWaitForReconnect(
  page: Page,
  totalSourceCount: number,
): Promise<void> {
  await dispatchEventSourceError(page);
  await expect
    .poll(() => eventSourceUrls(page), { timeout: 13_000 })
    .toHaveLength(totalSourceCount);
  await waitForEventSourceUrl(
    page,
    /\/api\/ag-ui\/runs\/run-ts-reconnect\/events\?after_event_id=2$/,
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
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const payload = {
    event_id: event.eventId,
    occurred_at: `2026-06-26T09:00:0${event.eventId}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-reconnect",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    type: event.type,
  });
}
