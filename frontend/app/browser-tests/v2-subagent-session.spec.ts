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
const PRESSURE_NEW_SESSION_ID = "session-v2-pressure-new";
const PRESSURE_RUN_ID = "run-v2-pressure-send";
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

interface SubagentPressureMockState {
  createdSessionAdded: boolean;
  runCreateRequests: Array<Record<string, unknown>>;
  sessionIndexRequestPaths: string[];
  subagentListRequestPaths: string[];
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

test("keeps send, session switch, and subagent view responsive under sidebar load", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentPressureMockState = {
    createdSessionAdded: false,
    runCreateRequests: [],
    sessionIndexRequestPaths: [],
    subagentListRequestPaths: [],
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSubagentPressureApi(context, state),
      sessionTitle: "TS pressure parent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByText("Pressure parent output")).toBeVisible();
    state.sessionIndexRequestPaths = [];
    state.subagentListRequestPaths = [];

    for (const title of pressureSwitchTargetTitles()) {
      await page.getByRole("button", { name: title }).click();
      await expect(page.getByText(`${title} output`)).toBeVisible();
    }
    await expect(page.locator(".at-session-item.is-selected")).toContainText(
      "TS pressure seed 24",
    );

    await page.getByRole("button", { exact: true, name: "New session" }).click();
    await expect(page.getByRole("button", { name: "New pressure session" }))
      .toBeVisible();
    await expect(page.getByText("No messages yet")).toBeVisible();

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill("你好");
    const sendStarted = Date.now();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({
      timeout: 2500,
    });
    expect(Date.now() - sendStarted).toBeLessThan(2500);
    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    expect(state.runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: "你好" }],
      session_id: PRESSURE_NEW_SESSION_ID,
    });

    await dispatchPressureRunEvent(page, {
      eventId: 1,
      payload: { status: "running" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchPressureRunEvent(page, {
      eventId: 2,
      payload: { text: "Pressure run live output." },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText("Pressure run live output.")).toBeVisible();

    await page.getByRole("button", { name: "TS pressure parent" }).click();
    await expect(page.getByText("Pressure parent output")).toBeVisible({
      timeout: 1000,
    });
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();

    const subagentToggle = page.getByRole("button", {
      name: "Toggle subagent sessions",
    });
    await subagentToggle.click();
    const childButton = page.getByRole("button", {
      name: "Open subagent session Pressure review",
    });
    await expect(childButton).toBeVisible();
    const childStarted = Date.now();
    await childButton.click();
    await expect(page.getByRole("heading", { name: "Pressure review" }))
      .toBeVisible({ timeout: 2500 });
    expect(Date.now() - childStarted).toBeLessThan(2500);
    await expect(page.getByText("Pressure subagent checkpoint")).toBeVisible();

    const parentStarted = Date.now();
    await page.getByRole("button", { name: "Main session" }).click();
    await expect(page.getByText("Pressure parent output")).toBeVisible({
      timeout: 1000,
    });
    expect(Date.now() - parentStarted).toBeLessThan(1000);
    await expect(page.getByRole("heading", { name: "Pressure review" }))
      .toHaveCount(0);

    await childButton.click();
    await expect(page.getByRole("heading", { name: "Pressure review" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Main session" }).click();
    await expect(page.getByText("Pressure parent output")).toBeVisible();

    await page.getByRole("button", { name: "Automation" }).click();
    await expect(page.getByText("No automation projects yet.")).toBeVisible();
    await page.getByRole("button", { name: "TS pressure parent" }).click();
    await expect(page.getByText("Pressure parent output")).toBeVisible();
    await expect(page.getByText("No automation projects yet.")).toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    expect(state.subagentListRequestPaths.length).toBeLessThanOrEqual(2);
    expect(state.sessionIndexRequestPaths.length).toBeLessThanOrEqual(4);
    await expectNoDocumentScroll(
      page,
      "send and subagent pressure flow should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-subagent-send-switch-pressure.png", SCREENSHOT_FOLDER),
    });
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

async function handleSubagentPressureApi(
  context: MockApiRouteContext,
  state: SubagentPressureMockState,
): Promise<boolean> {
  if (context.method === "POST") {
    if (context.path === "/sessions") {
      state.createdSessionAdded = true;
      await context.fulfillJson(pressureSessionDetail(pressureNewSessionRecord()));
      return true;
    }
    if (context.path === "/ag-ui/runs") {
      state.runCreateRequests.push(readRecordPayload(context.route.request().postData()));
      await context.fulfillJson({
        run_id: PRESSURE_RUN_ID,
        session_id: PRESSURE_NEW_SESSION_ID,
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
    state.sessionIndexRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson(pressureSidebarRecords(state));
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    state.sessionIndexRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson({
      has_more: false,
      items: pressureSidebarRecords(state),
      next_cursor: null,
    });
    return true;
  }
  if (context.path === "/automation/projects") {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    state.subagentListRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson([pressureSubagentRecord()]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${SUBAGENT_INSTANCE_ID}/messages`
  ) {
    await context.fulfillJson(pressureSubagentMessages());
    return true;
  }

  const sessionId = pressureSessionIdFromPath(context.path);
  if (sessionId === null) {
    return false;
  }
  const session = pressureSidebarRecords(state).find(
    (record) => record.session_id === sessionId,
  );
  if (session === undefined) {
    return false;
  }
  if (context.path === `/sessions/${sessionId}`) {
    await context.fulfillJson(pressureSessionDetail(session));
    return true;
  }
  if (context.path === `/sessions/${sessionId}/messages`) {
    await context.fulfillJson(pressureSessionMessages(session));
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
      if (suffix === "/subagents") {
        state.subagentListRequestPaths.push(`${context.path}${context.url.search}`);
      }
      await context.fulfillJson([]);
      return true;
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

function pressureSidebarRecords(
  state: SubagentPressureMockState,
): Array<Record<string, unknown>> {
  const records = [pressureParentRecord(), ...pressureSeedRecords()];
  if (state.createdSessionAdded) {
    return [pressureNewSessionRecord(), ...records];
  }
  return records;
}

function pressureParentRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-26T11:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    subagent_count: 1,
    title: "TS pressure parent",
    updated_at: "2026-06-26T11:59:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function pressureSeedRecords(): Array<Record<string, unknown>> {
  return Array.from({ length: 32 }, (_, index) => ({
    active_run_status: null,
    created_at: "2026-06-26T10:00:00Z",
    message_count: 1,
    session_id: pressureSeedSessionId(index),
    title: pressureSeedTitle(index),
    updated_at: `2026-06-26T11:${String(index).padStart(2, "0")}:00Z`,
    workspace_id: WORKSPACE_ID,
  }));
}

function pressureNewSessionRecord(): Record<string, unknown> {
  return {
    active_run_status: "running",
    created_at: "2026-06-26T12:00:00Z",
    message_count: 0,
    session_id: PRESSURE_NEW_SESSION_ID,
    title: "New pressure session",
    updated_at: "2026-06-26T12:00:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function pressureSeedSessionId(index: number): string {
  return `session-v2-pressure-seed-${String(index).padStart(2, "0")}`;
}

function pressureSeedTitle(index: number): string {
  return `TS pressure seed ${String(index).padStart(2, "0")}`;
}

function pressureSwitchTargetTitles(): string[] {
  return Array.from({ length: 8 }, (_, offset) => pressureSeedTitle(31 - offset));
}

function pressureSessionIdFromPath(path: string): string | null {
  const match = /^\/sessions\/([^/]+)(?:\/[^/]+)?$/.exec(path);
  return match?.[1] ?? null;
}

function pressureSessionDetail(session: Record<string, unknown>): Record<string, unknown> {
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

function pressureSessionMessages(
  session: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (session.session_id === PRESSURE_NEW_SESSION_ID) {
    return [];
  }
  const title = String(session.title ?? session.session_id);
  const content =
    session.session_id === SESSION_ID
      ? "Pressure parent output"
      : `${title} output`;
  return [
    {
      content,
      created_at: "2026-06-26T11:00:01Z",
      message_id: `message-${String(session.session_id)}`,
      role_id: "MainAgent",
      run_id: `run-${String(session.session_id)}`,
    },
  ];
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

function pressureSubagentRecord(): Record<string, unknown> {
  return {
    created_at: "2026-06-26T11:15:00Z",
    instance_id: SUBAGENT_INSTANCE_ID,
    last_event_id: 8,
    role_id: "reviewer",
    run_id: SUBAGENT_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    session_id: SESSION_ID,
    status: "completed",
    subagent_kind: "normal",
    title: "Pressure review",
    updated_at: "2026-06-26T11:16:00Z",
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

function pressureSubagentMessages(): Array<Record<string, unknown>> {
  return [
    {
      content: "Pressure subagent checkpoint",
      created_at: "2026-06-26T11:16:00Z",
      message_id: "pressure-subagent-message-1",
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

function readRecordPayload(body: string | null): Record<string, unknown> {
  if (body === null || !body.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

interface BrowserPressureRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  type: string;
}

async function dispatchPressureRunEvent(
  page: Page,
  event: BrowserPressureRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-06-26T12:00:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: "MainAgent",
      run_id: PRESSURE_RUN_ID,
      session_id: PRESSURE_NEW_SESSION_ID,
      trace_id: "trace-ts-pressure-send",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
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
