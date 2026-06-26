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
  waitForEventSourceUrl,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-stream";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
  shell_safety_policy_enabled?: boolean;
  thinking?: unknown;
  yolo?: boolean;
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
    await expect(page.getByText("Run started: status running")).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { output: "stream finished", status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });

    await expect(
      page.getByText("Run completed: status completed · stream finished"),
    ).toBeVisible();
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
