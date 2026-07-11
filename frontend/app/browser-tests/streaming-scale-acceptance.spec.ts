import { writeFile } from "node:fs/promises";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
  eventSourceOpenCount,
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
  waitForAppShell,
  waitForEventSourceOpenCount,
  waitForEventSourceUrl,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SESSION_COUNT = 30;
const SUBAGENT_COUNT = 30;
const MAIN_HISTORY_ROWS = 420;
const SUBAGENT_HISTORY_ROWS = 260;
const STREAM_BATCH_COUNT = 18;
const MAIN_RUN_ID = "run-v2-scale-main";
const SCREENSHOT_FOLDER = "frontend-v2-streaming-scale";

interface ScaleMetrics {
  childBatchDispatchMs: number;
  childClickLatencyMs: number;
  childRenderedRows: number;
  childScrollAfter: number;
  childScrollBefore: number;
  childTotalRows: number;
  hiddenSessionClickLatencyMs: number;
  inputLatencyMs: number;
  mainEventToPaintMs: number;
  mainRenderedRows: number;
  mainScrollAfter: number;
  mainScrollBefore: number;
  mainTotalRows: number;
  maxOpenEventSources: number;
  returnSessionClickLatencyMs: number;
  sidebarSessions: number;
}

interface ScaleState {
  agentMessageRequests: string[];
  maxOpenEventSources: number;
}

test("keeps large multi-session and multi-subagent streaming interactive", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const appServer = await serveFrontendDist();
  const state: ScaleState = {
    agentMessageRequests: [],
    maxOpenEventSources: 0,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleScaleApi(context, state),
      sessionTitle: scaleSessionTitle(0),
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${MAIN_RUN_ID}/events\\?after_event_id=0$`),
    );
    await waitForEventSourceOpenCount(page, 1);
    await updateMaxOpenEventSources(page, state);

    const mainTimeline = page.locator(".at-chat-view .at-timeline");
    await expect(mainTimeline).toHaveAttribute(
      "data-total-row-count",
      String(MAIN_HISTORY_ROWS + SUBAGENT_COUNT),
    );
    const initialMainStats = await timelineStats(mainTimeline);
    expect(initialMainStats.renderedRows).toBeLessThanOrEqual(40);
    expect(initialMainStats.totalRows).toBeGreaterThanOrEqual(MAIN_HISTORY_ROWS);

    await setTimelineAwayFromBottom(mainTimeline, 0.32);
    const mainScrollBefore = await timelineScrollTop(mainTimeline);
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.focus();
    await prompt.fill("Input stays responsive while many streams are active");

    const mainEventStarted = performance.now();
    await dispatchScaleEvent(page, {
      eventId: 1,
      payload: { text: "MAIN_SCALE_LIVE_DELTA" },
      relayEventType: "text_delta",
      roleId: "MainAgent",
      runId: MAIN_RUN_ID,
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await expect(page.getByText("MAIN_SCALE_LIVE_DELTA")).toBeAttached();
    const mainEventToPaintMs = performance.now() - mainEventStarted;
    const mainScrollAfter = await timelineScrollTop(mainTimeline);
    expect(Math.abs(mainScrollAfter - mainScrollBefore)).toBeLessThanOrEqual(2);
    await expect(prompt).toBeFocused();
    await expect(
      page.locator(".at-chat-view").getByRole("button", {
        name: "Jump to latest content",
      }),
    ).toBeVisible();

    const hiddenSessionTitle = scaleSessionTitle(17);
    const hiddenClickStarted = performance.now();
    await page.getByRole("button", { name: hiddenSessionTitle }).click();
    await expect(page.getByText(`${hiddenSessionTitle} history 220`)).toBeAttached();
    const hiddenSessionClickLatencyMs = performance.now() - hiddenClickStarted;
    await expect(page.getByText("MAIN_SCALE_LIVE_DELTA")).toHaveCount(0);
    await expect(prompt).toBeEnabled();
    expect(await eventSourceOpenCount(page)).toBe(1);

    await dispatchScaleEvent(page, {
      eventId: 2,
      payload: { text: "HIDDEN_SESSION_DELTA" },
      relayEventType: "text_delta",
      roleId: "MainAgent",
      runId: MAIN_RUN_ID,
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await expect(page.getByText("HIDDEN_SESSION_DELTA")).toHaveCount(0);
    await expect(prompt).toBeEnabled();

    const returnClickStarted = performance.now();
    await page.getByRole("button", { name: scaleSessionTitle(0) }).click();
    await expect(page.getByText("HIDDEN_SESSION_DELTA")).toBeAttached();
    const returnSessionClickLatencyMs = performance.now() - returnClickStarted;
    await expect.poll(() => timelineScrollTop(mainTimeline)).toBe(mainScrollBefore);

    const mainJump = page.locator(".at-chat-view").getByRole("button", {
      name: "Jump to latest content",
    });
    await mainJump.click();
    await expect(mainJump).toHaveCount(0);
    await expect.poll(() => timelineDistanceFromBottom(mainTimeline))
      .toBeLessThanOrEqual(2);

    const childTitle = scaleSubagentTitle(SUBAGENT_COUNT - 1);
    const childClickStarted = performance.now();
    await openSubagentPanel(page, childTitle);
    await expect(page.getByRole("heading", { name: childTitle })).toBeVisible();
    const childClickLatencyMs = performance.now() - childClickStarted;
    await waitForEventSourceOpenCount(page, 2);
    await updateMaxOpenEventSources(page, state);
    expect(await eventSourceOpenCount(page)).toBe(2);
    expect(await eventSourceUrls(page)).toHaveLength(2);

    const childTimeline = page.locator(
      ".at-subagent-session-view .at-timeline",
    );
    await expect(childTimeline).toHaveAttribute(
      "data-total-row-count",
      String(SUBAGENT_HISTORY_ROWS),
    );
    const childInitialStats = await timelineStats(childTimeline);
    expect(childInitialStats.renderedRows).toBeLessThanOrEqual(40);
    await setTimelineAwayFromBottom(childTimeline, 0.28);
    const childScrollBefore = await timelineScrollTop(childTimeline);
    const mainScrollWhileChildOpen = await timelineScrollTop(mainTimeline);

    const inputStarted = performance.now();
    await prompt.fill("Typing remains responsive during child stream pressure");
    const inputLatencyMs = performance.now() - inputStarted;
    await expect(prompt).toHaveValue(
      "Typing remains responsive during child stream pressure",
    );

    const childSourceIndex = (await eventSourceUrls(page)).length - 1;
    const batchStarted = performance.now();
    let nextEventId = 100;
    for (let batch = 0; batch < STREAM_BATCH_COUNT; batch += 1) {
      await dispatchScaleEvent(page, {
        eventId: nextEventId,
        payload: { text: `child thinking batch ${batch}` },
        relayEventType: "thinking_delta",
        roleId: scaleSubagentRole(SUBAGENT_COUNT - 1),
        runId: scaleSubagentRunId(SUBAGENT_COUNT - 1),
        sourceIndex: childSourceIndex,
        type: "message.thinking.delta",
      });
      nextEventId += 1;
      await dispatchScaleEvent(page, {
        eventId: nextEventId,
        payload: {
          args: { path: `frontend/scale-${batch}.ts` },
          tool_call_id: `scale-call-${batch}`,
          tool_name: "read",
        },
        relayEventType: "tool_call",
        roleId: scaleSubagentRole(SUBAGENT_COUNT - 1),
        runId: scaleSubagentRunId(SUBAGENT_COUNT - 1),
        sourceIndex: childSourceIndex,
        type: "tool_call.started",
      });
      nextEventId += 1;
      await dispatchScaleEvent(page, {
        eventId: nextEventId,
        payload: { text: ` CHILD_SCALE_BATCH_${batch}` },
        relayEventType: "text_delta",
        roleId: scaleSubagentRole(SUBAGENT_COUNT - 1),
        runId: scaleSubagentRunId(SUBAGENT_COUNT - 1),
        sourceIndex: childSourceIndex,
        type: "message.text.delta",
      });
      nextEventId += 1;
    }
    await expect(
      page.locator(".at-subagent-session-view").getByText(
        `CHILD_SCALE_BATCH_${STREAM_BATCH_COUNT - 1}`,
      ),
    ).toBeAttached();
    const childBatchDispatchMs = performance.now() - batchStarted;
    const childScrollAfter = await timelineScrollTop(childTimeline);
    expect(Math.abs(childScrollAfter - childScrollBefore)).toBeLessThanOrEqual(2);
    expect(await timelineScrollTop(mainTimeline)).toBe(mainScrollWhileChildOpen);
    await expect(prompt).toBeFocused();
    const childJump = page.locator(".at-subagent-session-view").getByRole(
      "button",
      { name: "Jump to latest content" },
    );
    await expect(childJump).toBeVisible();
    await childJump.click();
    await expect.poll(() => timelineDistanceFromBottom(childTimeline))
      .toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: "Main session" }).click();
    await expect(page.getByRole("heading", { name: childTitle })).toHaveCount(0);
    await waitForEventSourceOpenCount(page, 1);
    await expect.poll(() => timelineScrollTop(mainTimeline))
      .toBe(mainScrollWhileChildOpen);

    const secondChildTitle = scaleSubagentTitle(SUBAGENT_COUNT - 2);
    await openSubagentPanel(page, secondChildTitle);
    await expect(page.getByRole("heading", { name: secondChildTitle }))
      .toBeVisible();
    await waitForEventSourceOpenCount(page, 2);
    await updateMaxOpenEventSources(page, state);
    expect(state.maxOpenEventSources).toBe(2);
    await page.getByRole("button", { name: "Main session" }).click();
    await waitForEventSourceOpenCount(page, 1);

    const finalMainStats = await timelineStats(mainTimeline);
    const finalChildStats = childInitialStats;
    const metrics: ScaleMetrics = {
      childBatchDispatchMs,
      childClickLatencyMs,
      childRenderedRows: finalChildStats.renderedRows,
      childScrollAfter,
      childScrollBefore,
      childTotalRows: finalChildStats.totalRows,
      hiddenSessionClickLatencyMs,
      inputLatencyMs,
      mainEventToPaintMs,
      mainRenderedRows: finalMainStats.renderedRows,
      mainScrollAfter,
      mainScrollBefore,
      mainTotalRows: finalMainStats.totalRows,
      maxOpenEventSources: state.maxOpenEventSources,
      returnSessionClickLatencyMs,
      sidebarSessions: await page.locator(".at-session-item").count(),
    };
    assertStableScaleThresholds(metrics);
    await recordMetrics(testInfo, metrics);

    expect(new Set(state.agentMessageRequests)).toEqual(new Set([
      scaleSubagentInstanceId(SUBAGENT_COUNT - 1),
      scaleSubagentInstanceId(SUBAGENT_COUNT - 2),
    ]));
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "scale acceptance must stay within the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath(
        "v2-streaming-scale-accepted.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleScaleApi(
  context: MockApiRouteContext,
  state: ScaleState,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson(scaleSidebarRecords());
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: scaleSidebarRecords(),
      next_cursor: null,
    });
    return true;
  }
  const agentMatch = new RegExp(
    `^/sessions/${SESSION_ID}/agents/([^/]+)/messages$`,
  ).exec(context.path);
  if (agentMatch !== null) {
    const instanceId = agentMatch[1] ?? "";
    state.agentMessageRequests.push(instanceId);
    await context.fulfillJson(scaleSubagentMessages(instanceId));
    return true;
  }
  const sessionId = scaleSessionIdFromPath(context.path);
  if (sessionId === null) {
    return false;
  }
  const sessionIndex = scaleSessionIndex(sessionId);
  if (sessionIndex < 0) {
    return false;
  }
  if (context.path === `/sessions/${sessionId}`) {
    await context.fulfillJson(scaleSessionDetail(sessionIndex));
    return true;
  }
  if (context.path === `/sessions/${sessionId}/messages`) {
    await context.fulfillJson(scaleSessionMessages(sessionIndex));
    return true;
  }
  if (context.path === `/sessions/${sessionId}/rounds`) {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (context.path === `/sessions/${sessionId}/recovery`) {
    await context.fulfillJson(
      sessionIndex === 0 ? scaleActiveRecovery() : emptyRecovery(),
    );
    return true;
  }
  if (context.path === `/sessions/${sessionId}/token-usage`) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  if (context.path === `/sessions/${sessionId}/subagents`) {
    await context.fulfillJson(
      sessionIndex === 0 ? scaleSubagentRecords() : [],
    );
    return true;
  }
  if (
    context.path === `/sessions/${sessionId}/agents` ||
    context.path === `/sessions/${sessionId}/tasks`
  ) {
    await context.fulfillJson([]);
    return true;
  }
  return false;
}

function scaleSidebarRecords(): Array<Record<string, unknown>> {
  return Array.from({ length: SESSION_COUNT }, (_, index) => ({
    active_run_id: index === 0 ? MAIN_RUN_ID : `hidden-run-${index}`,
    active_run_phase: "streaming",
    active_run_status: "running",
    created_at: "2026-07-12T00:00:00Z",
    message_count: MAIN_HISTORY_ROWS,
    session_id: scaleSessionId(index),
    subagent_count: index === 0 ? SUBAGENT_COUNT : 0,
    title: scaleSessionTitle(index),
    updated_at: `2026-07-12T00:${String(index).padStart(2, "0")}:00Z`,
    workspace_id: WORKSPACE_ID,
  }));
}

function scaleSessionDetail(index: number): Record<string, unknown> {
  return {
    active_run_id: index === 0 ? MAIN_RUN_ID : `hidden-run-${index}`,
    active_run_phase: "streaming",
    active_run_status: "running",
    can_switch_mode: true,
    created_at: "2026-07-12T00:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: scaleSessionId(index),
    session_mode: "normal",
    title: scaleSessionTitle(index),
    updated_at: "2026-07-12T00:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function scaleSessionMessages(index: number): Array<Record<string, unknown>> {
  const history = Array.from(
    { length: index === 0 ? MAIN_HISTORY_ROWS : 220 },
    (_, rowIndex) => ({
      content: `${scaleSessionTitle(index)} history ${rowIndex + 1}`,
      created_at: `2026-07-12T00:${String(rowIndex % 60).padStart(2, "0")}:00Z`,
      message_id: `scale-message-${index}-${rowIndex}`,
      role_id: "MainAgent",
      run_id: `persisted-run-${index}-${Math.floor(rowIndex / 4)}`,
    }),
  );
  if (index !== 0) {
    return history;
  }
  return [
    ...history,
    ...Array.from({ length: SUBAGENT_COUNT }, (_, subagentIndex) =>
      scaleSubagentToolMessage(subagentIndex)),
  ];
}

function scaleSubagentToolMessage(index: number): Record<string, unknown> {
  return {
    created_at: `2026-07-12T01:${String(index).padStart(2, "0")}:00Z`,
    message: {
      parts: [{
        content: {
          prompt: `Scale-test child ${index + 1}`,
          subagent_instance_id: scaleSubagentInstanceId(index),
          subagent_role_id: scaleSubagentRole(index),
          subagent_run_id: scaleSubagentRunId(index),
          title: scaleSubagentTitle(index),
        },
        kind: "tool-return",
        outcome: "completed",
        tool_call_id: `scale-spawn-call-${index}`,
        tool_name: "spawn_subagent",
      }],
    },
    message_id: `scale-subagent-tool-${index}`,
    role_id: "MainAgent",
    run_id: `scale-parent-tool-run-${index}`,
  };
}

function scaleSubagentRecords(): Array<Record<string, unknown>> {
  return Array.from({ length: SUBAGENT_COUNT }, (_, index) => ({
    created_at: "2026-07-12T01:00:00Z",
    instance_id: scaleSubagentInstanceId(index),
    last_event_id: 0,
    role_id: scaleSubagentRole(index),
    run_id: scaleSubagentRunId(index),
    run_phase: "streaming",
    run_status: "running",
    session_id: SESSION_ID,
    status: "running",
    subagent_kind: "normal",
    title: scaleSubagentTitle(index),
    updated_at: "2026-07-12T01:01:00Z",
  }));
}

function scaleSubagentMessages(instanceId: string): Array<Record<string, unknown>> {
  const index = Number(instanceId.replace("scale-instance-", "")) - 1;
  return Array.from({ length: SUBAGENT_HISTORY_ROWS }, (_, rowIndex) => ({
    content: `${scaleSubagentTitle(index)} history ${rowIndex + 1}`,
    created_at: `2026-07-12T01:${String(rowIndex % 60).padStart(2, "0")}:00Z`,
    message_id: `scale-child-message-${index}-${rowIndex}`,
    role_id: scaleSubagentRole(index),
    run_id: scaleSubagentRunId(index),
  }));
}

function scaleActiveRecovery(): Record<string, unknown> {
  return {
    active_run: {
      last_event_id: 0,
      phase: "streaming",
      run_id: MAIN_RUN_ID,
      session_id: SESSION_ID,
      should_show_recover: false,
      status: "running",
    },
    background_tasks: [],
    paused_subagent: null,
    pending_tool_approvals: [],
    pending_user_questions: [],
    round_snapshot: null,
  };
}

function emptyRecovery(): Record<string, unknown> {
  return {
    active_run: null,
    background_tasks: [],
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
  };
}

interface ScaleEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  roleId: string;
  runId: string;
  sourceIndex: number;
  type: string;
}

async function dispatchScaleEvent(page: Page, event: ScaleEvent): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      instance_id: event.runId === MAIN_RUN_ID
        ? null
        : scaleSubagentInstanceId(SUBAGENT_COUNT - 1),
      occurred_at: "2026-07-12T02:00:00Z",
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: event.roleId,
      run_id: event.runId,
      session_id: SESSION_ID,
      trace_id: "trace-v2-streaming-scale",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    sourceIndex: event.sourceIndex,
    type: event.type,
  });
}

async function openSubagentPanel(page: Page, title: string): Promise<void> {
  const timeline = page.locator(".at-chat-view .at-timeline");
  await timeline.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  const card = page
    .locator('.at-chat-view .at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]')
    .filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.locator(".at-message-tool-summary").click();
}

async function setTimelineAwayFromBottom(
  timeline: ReturnType<Page["locator"]>,
  ratio: number,
): Promise<void> {
  await timeline.evaluate((element, scrollRatio) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.round(maxScrollTop * scrollRatio);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, ratio);
  await expect.poll(() => timelineDistanceFromBottom(timeline)).toBeGreaterThan(96);
}

async function timelineStats(
  timeline: ReturnType<Page["locator"]>,
): Promise<{ renderedRows: number; totalRows: number }> {
  return timeline.evaluate((element) => ({
    renderedRows: Number(element.getAttribute("data-rendered-row-count") ?? "0"),
    totalRows: Number(element.getAttribute("data-total-row-count") ?? "0"),
  }));
}

async function timelineScrollTop(
  timeline: ReturnType<Page["locator"]>,
): Promise<number> {
  return timeline.evaluate((element) => Math.round(element.scrollTop));
}

async function timelineDistanceFromBottom(
  timeline: ReturnType<Page["locator"]>,
): Promise<number> {
  return timeline.evaluate((element) =>
    Math.round(element.scrollHeight - element.clientHeight - element.scrollTop),
  );
}

async function updateMaxOpenEventSources(
  page: Page,
  state: ScaleState,
): Promise<void> {
  state.maxOpenEventSources = Math.max(
    state.maxOpenEventSources,
    await eventSourceOpenCount(page),
  );
}

function assertStableScaleThresholds(metrics: ScaleMetrics): void {
  expect(metrics.sidebarSessions).toBe(SESSION_COUNT);
  expect(metrics.mainTotalRows).toBeGreaterThanOrEqual(MAIN_HISTORY_ROWS);
  expect(metrics.childTotalRows).toBe(SUBAGENT_HISTORY_ROWS);
  expect(metrics.mainRenderedRows).toBeLessThanOrEqual(40);
  expect(metrics.childRenderedRows).toBeLessThanOrEqual(40);
  expect(metrics.maxOpenEventSources).toBeLessThanOrEqual(2);
  expect(metrics.mainEventToPaintMs).toBeLessThan(1_200);
  expect(metrics.inputLatencyMs).toBeLessThan(600);
  expect(metrics.childClickLatencyMs).toBeLessThan(2_500);
  expect(metrics.hiddenSessionClickLatencyMs).toBeLessThan(2_500);
  expect(metrics.returnSessionClickLatencyMs).toBeLessThan(2_500);
  expect(metrics.childBatchDispatchMs).toBeLessThan(7_500);
}

async function recordMetrics(
  testInfo: TestInfo,
  metrics: ScaleMetrics,
): Promise<void> {
  const path = testInfo.outputPath("streaming-scale-metrics.json");
  await writeFile(path, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await testInfo.attach("streaming-scale-metrics", {
    contentType: "application/json",
    path,
  });
}

function scaleSessionId(index: number): string {
  return index === 0 ? SESSION_ID : `scale-session-${index + 1}`;
}

function scaleSessionIndex(sessionId: string): number {
  if (sessionId === SESSION_ID) {
    return 0;
  }
  const match = /^scale-session-(\d+)$/.exec(sessionId);
  return match === null ? -1 : Number(match[1]) - 1;
}

function scaleSessionIdFromPath(path: string): string | null {
  return /^\/sessions\/([^/]+)(?:\/[^/]+)?$/.exec(path)?.[1] ?? null;
}

function scaleSessionTitle(index: number): string {
  return `Scale session ${String(index + 1).padStart(2, "0")}`;
}

function scaleSubagentInstanceId(index: number): string {
  return `scale-instance-${index + 1}`;
}

function scaleSubagentRole(index: number): string {
  return `ScaleRole${index + 1}`;
}

function scaleSubagentRunId(index: number): string {
  return `scale-subagent-run-${index + 1}`;
}

function scaleSubagentTitle(index: number): string {
  return `Scale child ${String(index + 1).padStart(2, "0")}`;
}
