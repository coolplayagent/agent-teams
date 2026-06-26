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
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SUBAGENT_INSTANCE_ID = "subagent-instance-browser";
const SUBAGENT_RUN_ID = "subagent_run_browser_1";
const SCREENSHOT_FOLDER = "frontend-v2-ts-subagent-session";

interface SubagentSessionMockState {
  completed: boolean;
  messageRequestCount: number;
}

test("opens a nested subagent session and refreshes history after terminal stream", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    messageRequestCount: 0,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSubagentSessionApi(context, state),
      sessionTitle: "TS parent session",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByRole("button", { name: "TS parent session" }))
      .toBeVisible();
    await expect(page.getByText("Parent session output")).toBeVisible();

    await page.getByRole("button", { name: "Toggle subagent sessions" }).click();
    await expect(page.getByRole("button", {
      name: "Open subagent session Explorer review",
    })).toBeVisible();
    await page.getByRole("button", {
      name: "Open subagent session Explorer review",
    }).click();

    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(page.getByText("Read-only subagent session")).toBeVisible();
    await expect(page.getByText("Persisted subagent checkpoint")).toBeVisible();
    await expect.poll(() => state.messageRequestCount).toBe(1);
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/ag-ui/runs/${SUBAGENT_RUN_ID}/events\\?after_event_id=41$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: "Live browser subagent output." },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText("Live browser subagent output.")).toBeVisible();

    state.completed = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.locator(".at-subagent-session-badge")).toHaveText("completed");
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Final persisted subagent answer")).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "subagent session view should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-subagent-session-completed.png", SCREENSHOT_FOLDER),
    });

    await page.getByRole("button", { name: "Main session" }).click();
    await expect(page.getByText("Parent session output")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toHaveCount(0);
    await expectComposerControlsDoNotOverlap(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleSubagentSessionApi(
  context: MockApiRouteContext,
  state: SubagentSessionMockState,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson([parentSessionSidebarRecord(state)]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [parentSessionSidebarRecord(state)],
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(parentSessionRecord());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(parentSessionMessages());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    await context.fulfillJson([subagentRecord(state)]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${SUBAGENT_INSTANCE_ID}/messages`
  ) {
    state.messageRequestCount += 1;
    await context.fulfillJson(subagentMessages(state));
    return true;
  }
  return false;
}

function parentSessionSidebarRecord(
  state: SubagentSessionMockState,
): Record<string, unknown> {
  return {
    active_run_status: state.completed ? null : "running",
    created_at: "2026-06-26T09:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    subagent_count: 1,
    title: "TS parent session",
    updated_at: "2026-06-26T09:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function parentSessionRecord(): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-26T09:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: SESSION_ID,
    session_mode: "normal",
    title: "TS parent session",
    updated_at: "2026-06-26T09:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function parentSessionMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Parent session output",
      created_at: "2026-06-26T09:00:01Z",
      message_id: "parent-message-1",
      role_id: "MainAgent",
      run_id: "run-parent",
    },
  ];
}

function subagentRecord(state: SubagentSessionMockState): Record<string, unknown> {
  return {
    created_at: "2026-06-26T09:05:00Z",
    instance_id: SUBAGENT_INSTANCE_ID,
    last_event_id: state.completed ? 43 : 41,
    role_id: "explorer",
    run_id: SUBAGENT_RUN_ID,
    run_phase: state.completed ? "completed" : "running",
    run_status: state.completed ? "completed" : "running",
    session_id: SESSION_ID,
    status: state.completed ? "completed" : "running",
    subagent_kind: "normal",
    title: "Explorer review",
    updated_at: state.completed
      ? "2026-06-26T09:08:00Z"
      : "2026-06-26T09:06:00Z",
  };
}

function subagentMessages(state: SubagentSessionMockState): Record<string, unknown>[] {
  if (state.completed) {
    return [
      {
        content: "Final persisted subagent answer",
        created_at: "2026-06-26T09:08:00Z",
        message_id: "subagent-final-message",
        role_id: "explorer",
        run_id: SUBAGENT_RUN_ID,
      },
    ];
  }
  return [
    {
      content: "Persisted subagent checkpoint",
      created_at: "2026-06-26T09:06:00Z",
      message_id: "subagent-checkpoint-message",
      role_id: "explorer",
      run_id: SUBAGENT_RUN_ID,
    },
  ];
}

interface BrowserSubagentRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchSubagentRunEvent(
  page: Page,
  event: BrowserSubagentRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      instance_id: SUBAGENT_INSTANCE_ID,
      occurred_at: `2026-06-26T09:07:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "explorer",
      run_id: SUBAGENT_RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-ts-subagent-session",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}
