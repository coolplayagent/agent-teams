import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceError,
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
const ORCHESTRATION_RUN_ID = "run-ts-orchestration-session-switch";
const SECOND_SESSION_ID = "session-v2-secondary";
const SCREENSHOT_FOLDER = "frontend-v2-ts-session-switch";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
}

interface SessionSwitchMockState {
  completed: boolean;
  runId: string;
  runCreateRequests: CapturedRunCreateRequest[];
  secondarySessionTitle: string;
  sourceSessionMode: "normal" | "orchestration";
  sourceSessionTitle: string;
}

test("isolates an active foreground stream and restores exact content after switching back", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SessionSwitchMockState = {
    completed: false,
    runId: RUN_ID,
    runCreateRequests: [],
    secondarySessionTitle: "TS secondary session",
    sourceSessionMode: "normal",
    sourceSessionTitle: "TS active stream source",
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleSessionSwitchApi(context, state),
      sessionTitle: state.sourceSessionTitle,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const promptText = "Switch sessions during an active stream";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    expect(state.runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(page, runEventsUrlPattern(RUN_ID, 0));
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

    await page.getByRole("button", { name: state.secondarySessionTitle }).click();

    await expect(page.getByText("Second session hydrated output")).toBeVisible();
    await expect(page.getByText(streamedText)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(prompt).toBeEnabled();
    await expect.poll(() => eventSourceOpenCount(page)).toBe(1);

    const hiddenBackgroundChunk = "Late source-session chunk should stay hidden.";
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: hiddenBackgroundChunk },
      relayEventType: "text_delta",
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await expect(page.getByText(hiddenBackgroundChunk)).toHaveCount(0);

    await page.getByRole("button", { name: state.sourceSessionTitle }).click();
    await expect(page.getByText("Second session hydrated output")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByText(streamedText)).toHaveCount(1);
    await expect(page.getByText(hiddenBackgroundChunk)).toHaveCount(1);
    await expect.poll(() => timelineMessageTexts(page)).toEqual([
      `${streamedText}${hiddenBackgroundChunk}`,
    ]);

    const foregroundContinuation = " Foreground continuation after switching back.";
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: { text: foregroundContinuation },
      relayEventType: "text_delta",
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await expect.poll(() => timelineMessageTexts(page)).toEqual([
      `${streamedText}${hiddenBackgroundChunk}${foregroundContinuation}`,
    ]);
    state.completed = true;
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      sourceIndex: 0,
      type: "run.completed",
    });
    await expect.poll(() => eventSourceOpenCount(page)).toBe(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect(page.locator(".at-session-item.is-selected.has-run-indicator-running"))
      .toHaveCount(0);
    await expect(page.locator(".at-session-item.is-selected").getByText("Running"))
      .toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "active stream session switch recovery should stay inside the fixed V2 shell",
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

test("resumes an interrupted stream while another session is selected", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SessionSwitchMockState = {
    completed: false,
    runId: RUN_ID,
    runCreateRequests: [],
    secondarySessionTitle: "TS interrupt secondary session",
    sourceSessionMode: "normal",
    sourceSessionTitle: "TS interrupted stream source",
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSessionSwitchApi(context, state),
      sessionTitle: state.sourceSessionTitle,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const promptText = "Switch away while an interrupted stream reconnects";
    await page.getByRole("textbox", { name: "Prompt" }).fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(page, runEventsUrlPattern(RUN_ID, 0));
    await waitForEventSourceOpenCount(page, 1);

    const firstChunk = "Interrupted stream prefix.";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: firstChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect.poll(() => timelineMarkdownTexts(page)).toEqual([firstChunk]);

    await page.getByRole("button", { name: state.secondarySessionTitle }).click();
    await expect(page.getByText("Second session hydrated output")).toBeVisible();
    await expect(page.getByText(firstChunk)).toHaveCount(0);

    await dispatchEventSourceError(page, 0);
    await waitForEventSourceUrl(page, runEventsUrlPattern(RUN_ID, 2));
    await waitForEventSourceOpenCount(page, 1);

    const hiddenRecoveryChunk = " Hidden recovery chunk after reconnect.";
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: hiddenRecoveryChunk },
      relayEventType: "text_delta",
      sourceIndex: 1,
      type: "message.text.delta",
    });
    await expect(page.getByText(hiddenRecoveryChunk.trim())).toHaveCount(0);

    await page.getByRole("button", { name: state.sourceSessionTitle }).click();
    await expect(page.getByText("Second session hydrated output")).toHaveCount(0);
    await expect.poll(() => timelineMarkdownTexts(page)).toEqual([
      `${firstChunk}${hiddenRecoveryChunk}`,
    ]);
    await expect(page.locator(".at-message-markdown")).toHaveCount(1);

    const visibleContinuation = " Visible continuation after returning.";
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: { text: visibleContinuation },
      relayEventType: "text_delta",
      sourceIndex: 1,
      type: "message.text.delta",
    });
    await expect.poll(() => timelineMarkdownTexts(page)).toEqual([
      `${firstChunk}${hiddenRecoveryChunk}${visibleContinuation}`,
    ]);
    await expect(page.getByText(firstChunk)).toHaveCount(1);

    state.completed = true;
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      sourceIndex: 1,
      type: "run.completed",
    });
    await expect.poll(() => eventSourceOpenCount(page)).toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect(page.locator(".at-message-markdown")).toHaveCount(1);
    await expect.poll(() => timelineMarkdownTexts(page)).toEqual([
      `${firstChunk}${hiddenRecoveryChunk}${visibleContinuation}`,
    ]);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "interrupted stream session switch recovery should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-interrupted-stream-session-switch-recovery.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("restores orchestration thinking, tools, and text in order after session switch", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SessionSwitchMockState = {
    completed: false,
    runId: ORCHESTRATION_RUN_ID,
    runCreateRequests: [],
    secondarySessionTitle: "TS quiet secondary session",
    sourceSessionMode: "orchestration",
    sourceSessionTitle: "TS orchestration tool stream",
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSessionSwitchApi(context, state),
      sessionTitle: state.sourceSessionTitle,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const promptText = "Switch sessions during orchestration tool-heavy stream";
    await page.getByRole("textbox", { name: "Prompt" }).fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    expect(state.runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(page, runEventsUrlPattern(ORCHESTRATION_RUN_ID, 0));
    await waitForEventSourceOpenCount(page, 1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const thinkingText = "Coordinator plans the read before delegating.";
    const toolPath = "src/relay_teams/agents/orchestration/coordinator.py";
    const toolResult = "Read 42 orchestration lines.";
    const hiddenOutput = "Background orchestration output after read.";
    const foregroundOutput = " Foreground orchestration answer tail.";

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      runId: ORCHESTRATION_RUN_ID,
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { part_index: 0 },
      relayEventType: "thinking_started",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      type: "thinking.started",
    });
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { part_index: 0, text: thinkingText },
      relayEventType: "thinking_delta",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      type: "thinking.delta",
    });
    await expect(page.locator(".at-message-thinking")).toContainText(thinkingText);
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: {
        args: { path: toolPath },
        tool_call_id: "call-orchestration-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      type: "tool_call.started",
    });
    await expect(page.locator(".at-message-tool", { hasText: "Reading: read" }))
      .toHaveCount(1);

    await page.getByRole("button", { name: state.secondarySessionTitle }).click();
    await expect(page.getByText("Second session hydrated output")).toBeVisible();
    await expect(page.getByText(thinkingText)).toHaveCount(0);
    await expect(page.getByText(toolPath)).toHaveCount(0);

    await dispatchRunEvent(page, {
      eventId: 5,
      payload: {
        result: { data: toolResult, ok: true },
        tool_call_id: "call-orchestration-read",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      sourceIndex: 0,
      type: "tool_result.completed",
    });
    await dispatchRunEvent(page, {
      eventId: 6,
      payload: { output: [{ kind: "text", text: hiddenOutput }] },
      relayEventType: "output_delta",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      sourceIndex: 0,
      type: "message.output.delta",
    });
    await expect(page.getByText(toolResult)).toHaveCount(0);
    await expect(page.getByText(hiddenOutput)).toHaveCount(0);

    await page.getByRole("button", { name: state.sourceSessionTitle }).click();
    await expect(page.getByText("Second session hydrated output")).toHaveCount(0);
    await expect(page.locator(".at-message-thinking")).toHaveCount(1);
    await expect(page.locator(".at-message-thinking")).toContainText(thinkingText);
    const completedTool = page.locator(".at-message-tool", {
      hasText: "Read: read",
    });
    await expect(completedTool).toHaveCount(1);
    await completedTool.locator(".at-message-tool-summary").click();
    await expect(completedTool).toContainText(toolResult);
    await expect(page.getByText(hiddenOutput)).toHaveCount(1);
    await expect(page.locator(".at-message-role")).toHaveCount(0);
    await expect.poll(() =>
      timelineOrderedCheckpoints(page, [thinkingText, "Read: read", hiddenOutput]),
    ).toEqual([thinkingText, "Read: read", hiddenOutput]);

    await dispatchRunEvent(page, {
      eventId: 7,
      payload: { output: [{ kind: "text", text: foregroundOutput }] },
      relayEventType: "output_delta",
      roleId: "Coordinator",
      runId: ORCHESTRATION_RUN_ID,
      sourceIndex: 0,
      type: "message.output.delta",
    });
    await expect(page.getByText(`${hiddenOutput}${foregroundOutput}`)).toHaveCount(1);
    await expect(page.locator(".at-message-role")).toHaveCount(0);
    await expect.poll(() => roleOnlyLineCount(page, ["Coordinator"])).toBe(0);

    state.completed = true;
    await dispatchRunEvent(page, {
      eventId: 8,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      runId: ORCHESTRATION_RUN_ID,
      sourceIndex: 0,
      type: "run.completed",
    });
    await expect.poll(() => eventSourceOpenCount(page)).toBe(0);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByText(`${hiddenOutput}${foregroundOutput}`)).toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "orchestration tool-heavy session switch should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-orchestration-tool-session-switch.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleSessionSwitchApi(
  context: MockApiRouteContext,
  state: SessionSwitchMockState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    state.runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    state.completed = false;
    await context.fulfillJson({
      run_id: state.runId,
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
      sourceSessionSidebarRecord(state),
      secondarySessionSidebarRecord(state),
    ]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [sourceSessionSidebarRecord(state), secondarySessionSidebarRecord(state)],
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(
      sessionRecord(SESSION_ID, state.sourceSessionTitle, state.sourceSessionMode),
    );
    return true;
  }
  if (context.path === `/sessions/${SECOND_SESSION_ID}`) {
    await context.fulfillJson(
      sessionRecord(SECOND_SESSION_ID, state.secondarySessionTitle, "normal"),
    );
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
    await context.fulfillJson(
      context.path === `/sessions/${SESSION_ID}/recovery` &&
        state.runCreateRequests.length > 0 &&
        !state.completed
        ? activeRecoverySnapshot(state.runId, SESSION_ID)
        : emptyRecoverySnapshot(),
    );
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

async function timelineMessageTexts(page: Page): Promise<string[]> {
  return page.locator(".at-timeline article.at-message")
    .allTextContents()
    .then((texts) =>
      texts.map((text) => text.replace(/\s+/g, " ").trim())
        .filter((text) => text.length > 0),
    );
}

async function timelineMarkdownTexts(page: Page): Promise<string[]> {
  return page.locator(".at-timeline .at-message-markdown")
    .allTextContents()
    .then((texts) =>
      texts.map((text) => text.replace(/\s+/g, " ").trim())
        .filter((text) => text.length > 0),
    );
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

function sourceSessionSidebarRecord(state: SessionSwitchMockState): Record<string, unknown> {
  return {
    active_run_status: state.completed ? null : "running",
    created_at: "2026-06-25T08:00:00Z",
    message_count: 1,
    session_id: SESSION_ID,
    session_mode: state.sourceSessionMode,
    title: state.sourceSessionTitle,
    updated_at: "2026-06-25T08:32:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function secondarySessionSidebarRecord(state?: SessionSwitchMockState): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-25T08:01:00Z",
    message_count: 1,
    session_id: SECOND_SESSION_ID,
    session_mode: "normal",
    title: state?.secondarySessionTitle ?? "TS secondary session",
    updated_at: "2026-06-25T08:31:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function sessionRecord(
  sessionId: string,
  title: string,
  sessionMode: "normal" | "orchestration",
): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-25T08:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: sessionMode === "normal" ? "MainAgent" : null,
    orchestration_preset_id: sessionMode === "orchestration" ? "default" : null,
    session_id: sessionId,
    session_mode: sessionMode,
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

function activeRecoverySnapshot(runId: string, sessionId: string): Record<string, unknown> {
  return {
    ...emptyRecoverySnapshot(),
    active_run: {
      last_event_id: 0,
      pending_tool_approval_count: 0,
      pending_user_question_count: 0,
      phase: "running",
      run_id: runId,
      session_id: sessionId,
      should_show_recover: false,
      status: "running",
      stream_connected: true,
    },
  };
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  roleId?: string;
  runId?: string;
  sourceIndex?: number;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const runId = event.runId ?? RUN_ID;
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-06-26T10:00:0${event.eventId}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: event.roleId ?? "MainAgent",
      run_id: runId,
      session_id: SESSION_ID,
      trace_id: "trace-ts-session-switch",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    sourceIndex: event.sourceIndex ?? null,
    type: event.type,
  });
}

function runEventsUrlPattern(runId: string, afterEventId: number): RegExp {
  return new RegExp(
    `/api/ag-ui/runs/${runId}/events\\?after_event_id=${afterEventId}$`,
  );
}

async function timelineOrderedCheckpoints(
  page: Page,
  checkpoints: string[],
): Promise<string[]> {
  return page.locator(".at-timeline").evaluate((timeline, expected) => {
    const text = timeline.textContent ?? "";
    return expected
      .map((checkpoint) => ({
        checkpoint,
        index: text.indexOf(checkpoint),
      }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index)
      .map((item) => item.checkpoint);
  }, checkpoints);
}

async function roleOnlyLineCount(page: Page, roleNames: string[]): Promise<number> {
  return page.locator(".at-timeline").evaluate((timeline, roles) => {
    const roleSet = new Set(roles);
    return (timeline.textContent ?? "")
      .split("\n")
      .filter((line) => roleSet.has(line.trim()))
      .length;
  }, roleNames);
}
