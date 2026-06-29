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
const CONTROL_SESSION_ID = "session-v2-subagent-control";
const SCREENSHOT_FOLDER = "frontend-v2-ts-subagent-session";

interface SubagentSessionMockState {
  completed: boolean;
  messageRequestCount: number;
}

interface SubagentRaceMockState {
  delayedParentRequestCount: number;
  delayParentRequests: boolean;
  releaseParentRequests: Array<() => void>;
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

test("keeps a subagent session selected while parent hydration races", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentRaceMockState = {
    delayedParentRequestCount: 0,
    delayParentRequests: false,
    releaseParentRequests: [],
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await page.addInitScript((controlSessionId) => {
      window.localStorage.setItem("agentTeams.selectedSessionId", controlSessionId);
    }, CONTROL_SESSION_ID);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSubagentRaceApi(context, state),
      sessionTitle: "TS race parent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByText("Control session output")).toBeVisible();

    await page.getByRole("button", { name: "Toggle subagent sessions" }).click();
    const subagentButton = page.getByRole("button", {
      name: "Open subagent session Race review",
    });
    await expect(subagentButton).toBeVisible();

    state.delayParentRequests = true;
    await page.getByRole("button", { name: "TS race parent" }).click();
    await expect.poll(() => state.delayedParentRequestCount).toBeGreaterThan(0);
    await subagentButton.click();

    await expect(page.getByRole("heading", { name: "Race review" })).toBeVisible();
    await expect(page.getByText("Race subagent checkpoint")).toBeVisible();
    await expect(page.getByText("Race parent output")).toHaveCount(0);

    releaseParentRequests(state);
    await expect(page.getByRole("heading", { name: "Race review" })).toBeVisible();
    await expect(page.getByText("Race subagent checkpoint")).toBeVisible();
    await expect(page.getByText("Race parent output")).toHaveCount(0);

    await page.getByRole("button", { name: "Main session" }).click();
    await expect(page.getByText("Race parent output")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Race review" })).toHaveCount(0);

    await page.getByRole("button", { name: "TS control session" }).click();
    await expect(page.getByText("Control session output")).toBeVisible();
    await subagentButton.click();
    await expect(page.getByRole("heading", { name: "Race review" })).toBeVisible();
    await expect(page.getByText("Race subagent checkpoint")).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "subagent session race should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-subagent-session-race.png", SCREENSHOT_FOLDER),
    });
  } finally {
    releaseParentRequests(state);
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

async function handleSubagentRaceApi(
  context: MockApiRouteContext,
  state: SubagentRaceMockState,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson([
      raceParentSidebarRecord(),
      controlSessionSidebarRecord(),
    ]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [raceParentSidebarRecord(), controlSessionSidebarRecord()],
      next_cursor: null,
    });
    return true;
  }
  if (isRaceParentHydrationPath(context.path)) {
    await delayParentRequestIfNeeded(state);
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(parentSessionRecord("TS race parent"));
    return true;
  }
  if (context.path === `/sessions/${CONTROL_SESSION_ID}`) {
    await context.fulfillJson(controlSessionRecord());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(raceParentMessages());
    return true;
  }
  if (context.path === `/sessions/${CONTROL_SESSION_ID}/messages`) {
    await context.fulfillJson(controlSessionMessages());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    await context.fulfillJson([raceSubagentRecord()]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${SUBAGENT_INSTANCE_ID}/messages`
  ) {
    await context.fulfillJson(raceSubagentMessages());
    return true;
  }
  for (const sessionId of [SESSION_ID, CONTROL_SESSION_ID]) {
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
  }
  return false;
}

async function delayParentRequestIfNeeded(
  state: SubagentRaceMockState,
): Promise<void> {
  if (!state.delayParentRequests) {
    return;
  }
  state.delayedParentRequestCount += 1;
  await new Promise<void>((resolve) => {
    state.releaseParentRequests.push(resolve);
  });
}

function releaseParentRequests(state: SubagentRaceMockState): void {
  state.delayParentRequests = false;
  const releases = state.releaseParentRequests.splice(0);
  for (const release of releases) {
    release();
  }
}

function isRaceParentHydrationPath(path: string): boolean {
  return (
    path === `/sessions/${SESSION_ID}` ||
    path === `/sessions/${SESSION_ID}/messages` ||
    path === `/sessions/${SESSION_ID}/rounds`
  );
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

function raceParentSidebarRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-26T10:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    subagent_count: 1,
    title: "TS race parent",
    updated_at: "2026-06-26T10:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function controlSessionSidebarRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-26T10:01:00Z",
    message_count: 1,
    session_id: CONTROL_SESSION_ID,
    title: "TS control session",
    updated_at: "2026-06-26T10:29:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function parentSessionRecord(title = "TS parent session"): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-26T09:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: SESSION_ID,
    session_mode: "normal",
    title,
    updated_at: "2026-06-26T09:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function controlSessionRecord(): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-26T10:01:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: CONTROL_SESSION_ID,
    session_mode: "normal",
    title: "TS control session",
    updated_at: "2026-06-26T10:29:00Z",
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

function raceParentMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Race parent output",
      created_at: "2026-06-26T10:00:01Z",
      message_id: "race-parent-message-1",
      role_id: "MainAgent",
      run_id: "run-race-parent",
    },
  ];
}

function controlSessionMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Control session output",
      created_at: "2026-06-26T10:01:01Z",
      message_id: "control-message-1",
      role_id: "MainAgent",
      run_id: "run-control",
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

function raceSubagentRecord(): Record<string, unknown> {
  return {
    created_at: "2026-06-26T10:05:00Z",
    instance_id: SUBAGENT_INSTANCE_ID,
    last_event_id: 12,
    role_id: "reviewer",
    run_id: SUBAGENT_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    session_id: SESSION_ID,
    status: "completed",
    subagent_kind: "normal",
    title: "Race review",
    updated_at: "2026-06-26T10:06:00Z",
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

function raceSubagentMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Race subagent checkpoint",
      created_at: "2026-06-26T10:06:00Z",
      message_id: "race-subagent-message-1",
      role_id: "reviewer",
      run_id: SUBAGENT_RUN_ID,
    },
  ];
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
