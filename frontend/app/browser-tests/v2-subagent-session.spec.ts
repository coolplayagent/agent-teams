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

const SUBAGENT_INSTANCE_ID = "22cd6473-7579-438e-90df-d8177cc31e93";
const SUBAGENT_RUN_ID = "87f9f69e-8622-4d46-958f-aa0d7d283095";
const CONTROL_SESSION_ID = "session-v2-subagent-control";
const PRESSURE_NEW_SESSION_ID = "session-v2-pressure-new";
const PRESSURE_RUN_ID = "run-v2-pressure-send";
const PARENT_MARKER_RUN_ID = "run-v2-parent-marker";
const SCREENSHOT_FOLDER = "frontend-v2-ts-subagent-session";
const SUBAGENT_PROMPT = "Inspect the project and report the subagent stream checkpoints.";
const ORCHESTRATION_LIVE_PROMPT =
  "Stream orchestration child work into the right panel only.";
const PARENT_MARKER_PROMPT = "Verify parent run keeps child markers isolated";
const PARENT_MARKER_VISIBLE_TEXT = "PARENT_MARKER_VISIBLE_STREAM";
const PARENT_MARKER_CHILD_TEXT = "LEAK_PARENT_RUN_CHILD_TEXT";
const PARENT_MARKER_CHILD_THINKING = "LEAK_PARENT_RUN_CHILD_THINKING";
const PARENT_MARKER_CHILD_TOOL_PATH = "LEAK_PARENT_RUN_CHILD_TOOL.md";
const PARENT_MARKER_ROLE_ONLY_CHILD_TEXT = "LEAK_PARENT_RUN_ROLE_ONLY_CHILD_TEXT";
const PARENT_MARKER_ROLE_ONLY_TOOL_PATH = "LEAK_PARENT_RUN_ROLE_ONLY_TOOL.md";

interface SubagentSessionMockState {
  completed: boolean;
  delayFinalMessages: boolean;
  finalMessageContent?: string;
  releaseFinalMessages: Array<() => void>;
  messageRequestCount: number;
  parentNormalRootRoleId?: string | null;
  parentRunCreateRequests?: Array<Record<string, unknown>>;
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
    delayFinalMessages: false,
    releaseFinalMessages: [],
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

    await openSubagentPanelFromToolCard(page, "Explorer review");

    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(page.getByText("Read-only subagent session")).toBeVisible();
    await expect(page.getByText("Persisted subagent checkpoint")).toBeVisible();
    await expect.poll(() => state.messageRequestCount).toBe(1);
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: "Live browser subagent output." },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(
      page.locator(".at-subagent-session-view")
        .getByText("Live browser subagent output."),
    ).toBeVisible();
    await expect(
      page.locator(".at-chat-view").getByText("Live browser subagent output."),
    ).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-subagent-session-live.png", SCREENSHOT_FOLDER),
    });

    state.completed = true;
    state.delayFinalMessages = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Live browser subagent output.")).toBeVisible();
    await expect(page.getByText("No subagent activity")).toHaveCount(0);
    await expect(page.locator(".at-subagent-session-view .ant-skeleton")).toHaveCount(0);

    releaseFinalSubagentMessages(state);
    await expect(page.locator(".at-subagent-session-badge")).toHaveText("completed");
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
    await expect(
      page.locator(".at-chat-view").getByText("Live browser subagent output."),
    ).toHaveCount(0);
    await expect(
      page.locator(".at-chat-view").getByText("Final persisted subagent answer"),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toHaveCount(0);
    await expectComposerControlsDoNotOverlap(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    releaseFinalSubagentMessages(state);
    await appServer.close();
  }
});

test("keeps subagent-marked parent-run stream rows out of the main timeline", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: true,
    delayFinalMessages: false,
    releaseFinalMessages: [],
    messageRequestCount: 0,
    parentNormalRootRoleId: null,
    parentRunCreateRequests: [],
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
    await expect(page.getByText("Parent session output")).toBeVisible();
    const subagentCard = page
      .locator('.at-chat-view .at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]')
      .filter({ hasText: "Explorer review" });
    await expect(subagentCard).toHaveCount(1);

    await page.getByRole("textbox", { name: "Prompt" }).fill(PARENT_MARKER_PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => state.parentRunCreateRequests?.length ?? 0).toBe(1);
    expect(state.parentRunCreateRequests?.[0]).toMatchObject({
      input: [{ kind: "text", text: PARENT_MARKER_PROMPT }],
      session_id: SESSION_ID,
    });
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/ag-ui/runs/${PARENT_MARKER_RUN_ID}/events\\?after_event_id=0$`,
      ),
    );

    await dispatchParentMarkerRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      roleId: "MainAgent",
      type: "run.started",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 2,
      payload: {
        result: {
          subagent_instance_id: SUBAGENT_INSTANCE_ID,
          subagent_role_id: "Explorer",
          subagent_run_id: SUBAGENT_RUN_ID,
          title: "Explorer role-only stream review",
        },
        tool_call_id: "call-v2-parent-marker-runtime-subagent",
        tool_name: "spawn_subagent",
      },
      relayEventType: "tool_result",
      roleId: "MainAgent",
      type: "tool_result.completed",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 3,
      payload: { text: PARENT_MARKER_ROLE_ONLY_CHILD_TEXT },
      relayEventType: "text_delta",
      roleId: "Explorer",
      type: "message.text.delta",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 4,
      payload: {
        args: { path: PARENT_MARKER_ROLE_ONLY_TOOL_PATH },
        tool_call_id: "call-v2-parent-marker-role-only-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      roleId: "Explorer",
      type: "tool_call.started",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 5,
      payload: {
        subagent_instance_id: SUBAGENT_INSTANCE_ID,
        subagent_role_id: "Explorer",
        subagent_run_id: SUBAGENT_RUN_ID,
        text: PARENT_MARKER_CHILD_THINKING,
      },
      relayEventType: "thinking_delta",
      roleId: "Explorer",
      type: "message.thinking.delta",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 6,
      payload: {
        kind: "subagent",
        run_id: SUBAGENT_RUN_ID,
        text: PARENT_MARKER_CHILD_TEXT,
      },
      relayEventType: "text_delta",
      roleId: "Explorer",
      type: "message.text.delta",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 7,
      payload: {
        args: { path: PARENT_MARKER_CHILD_TOOL_PATH },
        subagent_instance_id: SUBAGENT_INSTANCE_ID,
        subagent_role_id: "Explorer",
        subagent_run_id: SUBAGENT_RUN_ID,
        tool_call_id: "call-v2-parent-marker-child-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      roleId: "Explorer",
      type: "tool_call.started",
    });
    await dispatchParentMarkerRunEvent(page, {
      eventId: 8,
      payload: { text: PARENT_MARKER_VISIBLE_TEXT },
      relayEventType: "text_delta",
      roleId: "MainAgent",
      type: "message.text.delta",
    });

    const mainTimeline = page.locator(".at-chat-view");
    await expect(mainTimeline.getByText(PARENT_MARKER_VISIBLE_TEXT)).toBeVisible();
    await dispatchParentMarkerRunEvent(page, {
      eventId: 9,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      roleId: "MainAgent",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(mainTimeline.getByText(PARENT_MARKER_VISIBLE_TEXT)).toBeVisible();
    await expect(mainTimeline.locator(".streaming-cursor")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(mainTimeline.getByText(PARENT_MARKER_ROLE_ONLY_CHILD_TEXT))
      .toHaveCount(0);
    await expect(mainTimeline.getByText(PARENT_MARKER_ROLE_ONLY_TOOL_PATH))
      .toHaveCount(0);
    await expect(mainTimeline.getByText(PARENT_MARKER_CHILD_THINKING)).toHaveCount(0);
    await expect(mainTimeline.getByText(PARENT_MARKER_CHILD_TEXT)).toHaveCount(0);
    await expect(mainTimeline.getByText(PARENT_MARKER_CHILD_TOOL_PATH)).toHaveCount(0);
    await expect(mainTimeline.getByText("Explorer", { exact: true })).toHaveCount(0);
    await expect(subagentCard).toHaveCount(1);

    await subagentCard.locator(".at-message-tool-summary").click();
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(
      page.locator(".at-subagent-session-view")
        .getByText("Final persisted subagent answer"),
    ).toBeVisible();
    await expect(mainTimeline.getByText("Final persisted subagent answer"))
      .toHaveCount(0);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-parent-run-marker-isolated.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "parent-run subagent markers should stay out of the main timeline",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    releaseFinalSubagentMessages(state);
    await appServer.close();
  }
});

test("streams subagent deltas incrementally before terminal history refill", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    releaseFinalMessages: [],
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
    await expect(page.getByText("Parent session output")).toBeVisible();

    await openSubagentPanelFromToolCard(page, "Explorer review");
    const panel = page.locator(".at-subagent-session-view");
    await expect(panel.locator(".at-subagent-session-prompt")).toContainText(
      SUBAGENT_PROMPT,
    );
    await expect.poll(() => subagentPromptLayout(page)).toMatchObject({
      promptBeforeTimeline: true,
    });
    await expect(panel.getByText("Persisted subagent checkpoint")).toBeVisible();
    await expect.poll(() => state.messageRequestCount).toBe(1);
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    const firstStreamText = Array.from(
      { length: 18 },
      (_, index) => `SUB_STREAM_ALPHA_${index}`,
    ).join(" ");
    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: firstStreamText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    const liveRow = panel
      .locator(`.at-timeline-row.is-streaming[data-run-id="${SUBAGENT_RUN_ID}"]`);
    const liveStreamText = liveRow.locator(".at-message-streaming-text");
    await expect(liveRow).toHaveCount(1);
    await expect(liveStreamText).toBeVisible();
    const firstDisplaySample = await liveStreamText.textContent();
    expect(firstDisplaySample ?? "").not.toContain("SUB_STREAM_ALPHA_17");
    const revealSamples = await sampleTextLengths(liveStreamText, 6, 70);
    const firstStreamLength = firstStreamText.length;
    expect(revealSamples[0] ?? firstStreamLength).toBeLessThan(firstStreamLength);
    expect(Math.max(...revealSamples)).toBeLessThan(firstStreamLength);
    expect(new Set(revealSamples).size).toBeGreaterThanOrEqual(4);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-typewriter-mid-reveal.png",
        SCREENSHOT_FOLDER,
      ),
    });
    await expect(liveRow).toContainText(firstStreamText);
    await expect(liveRow).not.toContainText("BETA");
    await expect(
      page.locator(".at-chat-view").getByText(firstStreamText),
    ).toHaveCount(0);
    await expect(page.getByText("Final persisted subagent answer")).toHaveCount(0);
    await expect.poll(() => state.messageRequestCount).toBe(1);

    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { text: " and BETA" },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(liveRow).toHaveCount(1);
    await expect(liveRow).toContainText(`${firstStreamText} and BETA`);
    await expect(
      page.locator(".at-chat-view").getByText(`${firstStreamText} and BETA`),
    ).toHaveCount(0);
    await expect.poll(() => state.messageRequestCount).toBe(1);

    state.completed = true;
    state.delayFinalMessages = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 44,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    const terminalRuntimeRow = panel
      .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: firstStreamText });
    await expect(terminalRuntimeRow).toContainText(`${firstStreamText} and BETA`);
    await expect(page.getByText("Final persisted subagent answer")).toHaveCount(0);

    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-incremental-stream-before-refill.png",
        SCREENSHOT_FOLDER,
      ),
    });

    releaseFinalSubagentMessages(state);
    await expect(panel.getByText("Final persisted subagent answer")).toBeVisible();
    await expect(panel.locator(".at-subagent-session-badge")).toHaveText("completed");
    await expect(
      page.locator(".at-chat-view").getByText("Final persisted subagent answer"),
    ).toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "incremental subagent stream should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    releaseFinalSubagentMessages(state);
    await appServer.close();
  }
});

test("settles terminal subagent output immediately before history refill", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    releaseFinalMessages: [],
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
    await openSubagentPanelFromToolCard(page, "Explorer review");
    const panel = page.locator(".at-subagent-session-view");
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    const terminalText = Array.from(
      { length: 40 },
      (_, index) => `TERMINAL_STREAM_${index}`,
    ).join(" ");
    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: terminalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    const terminalRow = panel
      .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: "TERMINAL_STREAM" });
    const terminalDisplay = terminalRow.locator(".at-message-streaming-text");
    await expect(terminalDisplay).toBeVisible();
    const preTerminalText = await terminalDisplay.textContent();
    expect(preTerminalText ?? "").not.toContain("TERMINAL_STREAM_39");

    state.completed = true;
    state.delayFinalMessages = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    await expect(terminalDisplay).toHaveCount(0);
    await expect(terminalRow).toContainText(terminalText);
    await expect(panel.locator(".streaming-cursor")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-terminal-settled-before-refill.png",
        SCREENSHOT_FOLDER,
      ),
    });

    releaseFinalSubagentMessages(state);
    await expect(panel.getByText("Final persisted subagent answer")).toBeVisible();
    await expect(
      panel
        .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
        .filter({ hasText: "TERMINAL_STREAM_" }),
    ).toHaveCount(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "terminal typewriter catch-up should stay inside the fixed V2 shell",
    );
  } finally {
    releaseFinalSubagentMessages(state);
    await appServer.close();
  }
});

test("does not replay an already complete subagent stream during terminal hydration", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const terminalText = Array.from(
    { length: 18 },
    (_, index) => `HYDRATED_STREAM_${index}`,
  ).join(" ");
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    finalMessageContent: terminalText,
    releaseFinalMessages: [],
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
    await openSubagentPanelFromToolCard(page, "Explorer review");
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: terminalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    const panel = page.locator(".at-subagent-session-view");
    const liveRow = panel
      .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: "HYDRATED_STREAM_" });
    await expect(liveRow.locator(".at-message-streaming-text")).toBeVisible();
    await expect(liveRow).toContainText(terminalText);

    state.completed = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);

    await expect(panel.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(panel.locator(".streaming-cursor")).toHaveCount(0);
    await expect.poll(() => panelVisibleTextOccurrences(page, terminalText))
      .toBe(1);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-complete-stream-terminal-hydration.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "complete subagent stream hydration should not replay finished text",
    );
  } finally {
    await appServer.close();
  }
});

test("recovers a settled subagent stream after refresh before history refill", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    releaseFinalMessages: [],
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
    await openSubagentPanelFromToolCard(page, "Explorer review");
    const terminalText = Array.from(
      { length: 32 },
      (_, index) => `REFRESH_STREAM_${index}`,
    ).join(" ");
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: terminalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    const initialPanel = page.locator(".at-subagent-session-view");
    await expect(
      initialPanel.locator(".at-message-streaming-text"),
    ).toBeVisible();

    state.completed = true;
    state.delayFinalMessages = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    await expect(initialPanel.locator(".at-message-streaming-text"))
      .toHaveCount(0);
    await expect(initialPanel).toContainText(terminalText);

    await page.reload();
    await waitForV2Shell(page);
    const restoredPanel = page.locator(".at-subagent-session-view");
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(restoredPanel.locator(".at-subagent-session-prompt"))
      .toContainText(SUBAGENT_PROMPT);
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: terminalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    const restoredRow = restoredPanel
      .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: "REFRESH_STREAM" });
    const restoredDisplay = restoredRow.locator(".at-message-streaming-text");
    await expect(restoredDisplay).toBeVisible();
    const restoredSamples = await sampleTextLengths(restoredDisplay, 4, 70);
    expect(restoredSamples[0] ?? terminalText.length).toBeLessThan(
      terminalText.length,
    );
    expect(Math.max(...restoredSamples)).toBeLessThan(terminalText.length);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-refresh-catchup-restored-mid.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(restoredDisplay).toHaveCount(0);
    await expect(restoredRow).toContainText(terminalText);
    await expect(restoredPanel.locator(".streaming-cursor")).toHaveCount(0);
    await expect(
      page.locator(".at-chat-view").getByText("REFRESH_STREAM_"),
    ).toHaveCount(0);

    releaseFinalSubagentMessages(state);
    await expect(restoredPanel.getByText("Final persisted subagent answer"))
      .toBeVisible();
    await expect(
      restoredPanel
        .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
        .filter({ hasText: "REFRESH_STREAM_" }),
    ).toHaveCount(1);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-refresh-catchup-restored-final.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "subagent refresh catch-up should stay inside the fixed V2 shell",
    );
  } finally {
    releaseFinalSubagentMessages(state);
    await appServer.close();
  }
});

test("streams top-level subagent output deltas inside the right panel", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    releaseFinalMessages: [],
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
    await openSubagentPanelFromToolCard(page, "Explorer review");
    const panel = page.locator(".at-subagent-session-view");
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: "SUB_STDOUT_1\n" },
      relayEventType: "output_delta",
      type: "message.output.delta",
    });
    const liveRow = panel
      .locator(`.at-timeline-row.is-streaming[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: "SUB_STDOUT_1" });
    await expect(liveRow).toHaveCount(1);
    await expect(liveRow.locator(".streaming-cursor")).toHaveCount(1);
    await expect(
      page.locator(".at-chat-view").getByText("SUB_STDOUT_1"),
    ).toHaveCount(0);

    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { delta: "SUB_STDOUT_2\n" },
      relayEventType: "output_delta",
      type: "message.output.delta",
    });
    await expect(liveRow).toContainText("SUB_STDOUT_1");
    await expect(liveRow).toContainText("SUB_STDOUT_2");
    await expect(
      panel.locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
        .filter({ hasText: "SUB_STDOUT_" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".at-chat-view").getByText("SUB_STDOUT_2"),
    ).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-top-level-output-delta.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "subagent output deltas should stay inside the fixed V2 shell",
    );
  } finally {
    await appServer.close();
  }
});

test("restores an open subagent panel after hard refresh without replay leakage", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: true,
    delayFinalMessages: false,
    releaseFinalMessages: [],
    messageRequestCount: 0,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSubagentSessionApi(context, state),
      sessionTitle: "TS parent session",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByText("Parent session output")).toBeVisible();
    await openSubagentPanelFromToolCard(page, "Explorer review");
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(
      page.locator(".at-subagent-session-view")
        .getByText("Final persisted subagent answer"),
    ).toBeVisible();
    await expect(
      page.locator(".at-chat-view").getByText("Final persisted subagent answer"),
    ).toHaveCount(0);
    await expect.poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("agentTeams.activeSubagentPanel"),
      ),
    ).not.toBeNull();

    await page.reload();
    await waitForV2Shell(page);
    await expect(page.getByRole("heading", { name: "Explorer review" }))
      .toBeVisible();
    await expect(
      page.locator(".at-subagent-session-view")
        .getByText("Final persisted subagent answer"),
    ).toBeVisible();
    await expect(
      page.locator(".at-chat-view").getByText("Final persisted subagent answer"),
    ).toHaveCount(0);
    await expect(
      page.locator(".at-subagent-session-body").getByText("explorer"),
    ).toHaveCount(0);
    await expect(
      page.locator(
        '.at-chat-view .at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]',
      ).filter({ hasText: "Explorer review" }),
    )
      .toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "subagent hard-refresh replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-hard-refresh-restored.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("replays an orchestration subagent panel without parent leakage after refresh", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleOrchestrationSubagentReplayApi,
      sessionTitle: "TS orchestration parent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByText("Coordinator summarized the orchestration plan."))
      .toBeVisible();
    await expect(page.getByText("Crafter completed the right-panel replay task."))
      .toHaveCount(0);

    await openSubagentPanelFromToolCard(page, "Crafter replay review");
    const panel = page.locator(".at-subagent-session-view");
    await expect(page.getByRole("heading", { name: "Crafter replay review" }))
      .toBeVisible();
    await expect(panel.locator(".at-subagent-session-badge")).toHaveText("completed");
    await expect(panel.locator(".at-subagent-session-prompt")).toContainText(
      "Review the orchestration replay transcript and summarize only the child work.",
    );
    await expect.poll(() => subagentPromptLayout(page)).toMatchObject({
      promptBeforeTimeline: true,
    });
    await expect(panel.getByText("Crafter checked the orchestration inputs."))
      .toBeVisible();
    await expect(panel.getByText("Crafter completed the right-panel replay task."))
      .toBeVisible();
    await expect(
      panel.locator(".at-subagent-session-body").getByText("Crafter", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator(".at-chat-view")
        .getByText("Crafter completed the right-panel replay task."),
    ).toHaveCount(0);

    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-orchestration-replay-panel.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await page.reload();
    await waitForV2Shell(page);
    await expect(page.getByRole("heading", { name: "Crafter replay review" }))
      .toBeVisible();
    await expect(
      page.locator(".at-subagent-session-view")
        .getByText("Crafter completed the right-panel replay task."),
    ).toBeVisible();
    await expect(
      page.locator(".at-chat-view")
        .getByText("Crafter completed the right-panel replay task."),
    ).toHaveCount(0);
    await expect(
      page.locator(
        '.at-chat-view .at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]',
      ).filter({ hasText: "Crafter replay review" }),
    ).toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "orchestration subagent replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    await appServer.close();
  }
});

test("streams a live orchestration subagent with right-panel cadence", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: SubagentSessionMockState = {
    completed: false,
    delayFinalMessages: false,
    releaseFinalMessages: [],
    messageRequestCount: 0,
  };
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleOrchestrationSubagentLiveApi(
        context,
        state,
      ),
      sessionTitle: "TS orchestration parent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByText("Coordinator is waiting for live orchestration child output."))
      .toBeVisible();

    await openSubagentPanelFromToolCard(page, "Crafter live stream review");
    const panel = page.locator(".at-subagent-session-view");
    await expect(page.getByRole("heading", { name: "Crafter live stream review" }))
      .toBeVisible();
    await expect(panel.locator(".at-subagent-session-badge")).toHaveText("running");
    await expect(panel.locator(".at-subagent-session-prompt"))
      .toContainText(ORCHESTRATION_LIVE_PROMPT);
    await waitForEventSourceUrl(
      page,
      new RegExp(
        `/api/sessions/${SESSION_ID}/subagents/events\\?after_event_id=0$`,
      ),
    );
    await waitForEventSourceOpenCount(page, 1);

    const firstStreamText = Array.from(
      { length: 28 },
      (_, index) => `ORCH_LIVE_${index}`,
    ).join(" ");
    await dispatchSubagentRunEvent(page, {
      eventId: 42,
      payload: { text: firstStreamText },
      relayEventType: "text_delta",
      roleId: "Crafter",
      type: "message.text.delta",
    });
    const liveRow = panel
      .locator(`.at-timeline-row.is-streaming[data-run-id="${SUBAGENT_RUN_ID}"]`);
    const liveText = liveRow.locator(".at-message-streaming-text");
    await expect(liveRow).toHaveCount(1);
    await expect(liveText).toBeVisible();
    await expect(
      panel.locator(".at-subagent-session-body").getByText("Crafter", {
        exact: true,
      }),
    ).toHaveCount(0);
    const revealSamples = await sampleTextLengths(liveText, 5, 70);
    expect(revealSamples[0] ?? firstStreamText.length).toBeLessThan(
      firstStreamText.length,
    );
    expect(Math.max(...revealSamples)).toBeLessThan(firstStreamText.length);
    expect(new Set(revealSamples).size).toBeGreaterThanOrEqual(3);
    await expect(
      page.locator(".at-chat-view").getByText("ORCH_LIVE_"),
    ).toHaveCount(0);

    await dispatchSubagentRunEvent(page, {
      eventId: 43,
      payload: { delta: " ORCH_LIVE_TAIL" },
      relayEventType: "output_delta",
      roleId: "Crafter",
      type: "message.output.delta",
    });
    await expect(liveRow).toContainText(`${firstStreamText} ORCH_LIVE_TAIL`);
    await expect(
      panel.locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
        .filter({ hasText: "ORCH_LIVE_" }),
    ).toHaveCount(1);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-orchestration-live-stream-mid.png",
        SCREENSHOT_FOLDER,
      ),
    });

    state.completed = true;
    state.delayFinalMessages = true;
    await dispatchSubagentRunEvent(page, {
      eventId: 44,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      roleId: "Crafter",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect.poll(() => state.messageRequestCount).toBeGreaterThanOrEqual(2);
    const terminalRow = panel
      .locator(`.at-timeline-row[data-run-id="${SUBAGENT_RUN_ID}"]`)
      .filter({ hasText: "ORCH_LIVE_" });
    await expect(terminalRow).toHaveCount(1);
    await expect(terminalRow).toContainText(`${firstStreamText} ORCH_LIVE_TAIL`);
    await expect(panel.getByText("Final orchestration child answer"))
      .toHaveCount(0);

    releaseFinalSubagentMessages(state);
    await expect(panel.locator(".at-subagent-session-badge")).toHaveText("completed");
    await expect(panel.getByText("Final orchestration child answer")).toBeVisible();
    await expect(panel.locator(".streaming-cursor")).toHaveCount(0);
    await expect(
      page.locator(".at-chat-view").getByText("Final orchestration child answer"),
    ).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath(
        "v2-subagent-orchestration-live-stream-final.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "live orchestration subagent stream should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
  } finally {
    releaseFinalSubagentMessages(state);
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

    const childStarted = Date.now();
    await openSubagentPanelFromToolCard(page, "Pressure review");
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

    await openSubagentPanelFromToolCard(page, "Pressure review");
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

    await page.getByRole("button", { name: "TS race parent" }).click();
    await expect(page.getByText("Race parent output")).toBeVisible();
    await openSubagentPanelFromToolCard(page, "Race review");
    await expect(page.getByRole("heading", { name: "Race review" })).toBeVisible();
    await page.getByRole("button", { name: "TS control session" }).click();
    await expect(page.getByText("Control session output")).toBeVisible();

    state.delayParentRequests = true;
    await page.getByRole("button", { name: "TS race parent" }).click();
    await expect.poll(() => state.delayedParentRequestCount).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Race review" })).toHaveCount(0);
    await expect(page.getByText("Race subagent checkpoint")).toHaveCount(0);

    releaseParentRequests(state);
    await expect(page.getByText("Race parent output")).toBeVisible();
    await openSubagentPanelFromToolCard(page, "Race review");
    await expect(page.getByRole("heading", { name: "Race review" })).toBeVisible();
    await expect(page.getByText("Race subagent checkpoint")).toBeVisible();

    await page.getByRole("button", { name: "TS control session" }).click();
    await expect(page.getByText("Control session output")).toBeVisible();
    await page.getByRole("button", { name: "TS race parent" }).click();
    await expect(page.getByText("Race parent output")).toBeVisible();
    await openSubagentPanelFromToolCard(page, "Race review");
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
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    if (state.parentRunCreateRequests === undefined) {
      return false;
    }
    state.parentRunCreateRequests.push(
      readRecordPayload(context.route.request().postData()),
    );
    await context.fulfillJson({
      run_id: PARENT_MARKER_RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
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
    await context.fulfillJson(
      parentSessionRecord(
        "TS parent session",
        state.parentNormalRootRoleId === undefined
          ? "MainAgent"
          : state.parentNormalRootRoleId,
      ),
    );
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
    if (state.completed && state.delayFinalMessages) {
      await new Promise<void>((resolve) => {
        state.releaseFinalMessages.push(resolve);
      });
    }
    await context.fulfillJson(subagentMessages(state));
    return true;
  }
  return false;
}

async function handleOrchestrationSubagentReplayApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson([orchestrationParentSidebarRecord()]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [orchestrationParentSidebarRecord()],
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(orchestrationParentSessionRecord());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(orchestrationParentMessages());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    await context.fulfillJson([orchestrationSubagentRecord()]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${SUBAGENT_INSTANCE_ID}/messages`
  ) {
    await context.fulfillJson(orchestrationSubagentMessages());
    return true;
  }
  return false;
}

async function handleOrchestrationSubagentLiveApi(
  context: MockApiRouteContext,
  state: SubagentSessionMockState,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson([orchestrationParentSidebarRecord()]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: [orchestrationParentSidebarRecord()],
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(orchestrationParentSessionRecord());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(orchestrationLiveParentMessages());
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    await context.fulfillJson([orchestrationLiveSubagentRecord(state)]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${SUBAGENT_INSTANCE_ID}/messages`
  ) {
    state.messageRequestCount += 1;
    if (state.completed && state.delayFinalMessages) {
      await new Promise<void>((resolve) => {
        state.releaseFinalMessages.push(resolve);
      });
    }
    await context.fulfillJson(orchestrationLiveSubagentMessages(state));
    return true;
  }
  return false;
}

async function openSubagentPanelFromToolCard(
  page: Page,
  title: string,
): Promise<void> {
  const card = page
    .locator('.at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]')
    .filter({ hasText: title })
    .first();
  await expect(card).toBeVisible();
  await card.locator(".at-message-tool-summary").click();
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
  if (context.path === "/automation/delivery-bindings") {
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

function releaseFinalSubagentMessages(state: SubagentSessionMockState): void {
  state.delayFinalMessages = false;
  const releases = state.releaseFinalMessages.splice(0);
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

function parentSessionRecord(
  title = "TS parent session",
  normalRootRoleId: string | null = "MainAgent",
): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-26T09:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: normalRootRoleId,
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

function orchestrationParentSidebarRecord(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-26T12:30:00Z",
    message_count: 2,
    session_id: SESSION_ID,
    subagent_count: 1,
    title: "TS orchestration parent",
    updated_at: "2026-06-26T12:42:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function orchestrationParentSessionRecord(): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-26T12:30:00Z",
    normal_model_profile: null,
    normal_root_role_id: null,
    orchestration_preset_id: "default",
    session_id: SESSION_ID,
    session_mode: "orchestration",
    title: "TS orchestration parent",
    updated_at: "2026-06-26T12:42:00Z",
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
    ...(session.session_id === SESSION_ID
      ? [
        subagentToolMessage({
          createdAt: "2026-06-26T11:00:02Z",
          messageId: "pressure-subagent-tool",
          roleId: "reviewer",
          title: "Pressure review",
        }),
      ]
      : []),
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
    subagentToolMessage({
      createdAt: "2026-06-26T09:00:02Z",
      messageId: "parent-subagent-tool",
      roleId: "explorer",
      title: "Explorer review",
    }),
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
    subagentToolMessage({
      createdAt: "2026-06-26T10:00:02Z",
      messageId: "race-subagent-tool",
      roleId: "reviewer",
      title: "Race review",
    }),
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

function orchestrationParentMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Coordinator summarized the orchestration plan.",
      created_at: "2026-06-26T12:30:01Z",
      message_id: "orchestration-parent-message-1",
      role_id: "Coordinator",
      run_id: "run-orchestration-parent",
    },
    subagentToolMessage({
      createdAt: "2026-06-26T12:30:02Z",
      messageId: "orchestration-subagent-tool",
      prompt:
        "Review the orchestration replay transcript and summarize only the child work.",
      roleId: "Crafter",
      title: "Crafter replay review",
    }),
  ];
}

function orchestrationLiveParentMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Coordinator is waiting for live orchestration child output.",
      created_at: "2026-06-26T12:31:01Z",
      message_id: "orchestration-live-parent-message-1",
      role_id: "Coordinator",
      run_id: "run-orchestration-live-parent",
    },
    subagentToolMessage({
      createdAt: "2026-06-26T12:31:02Z",
      messageId: "orchestration-live-subagent-tool",
      prompt: ORCHESTRATION_LIVE_PROMPT,
      roleId: "Crafter",
      title: "Crafter live stream review",
    }),
  ];
}

function subagentToolMessage({
  createdAt,
  messageId,
  prompt = SUBAGENT_PROMPT,
  roleId,
  title,
}: {
  createdAt: string;
  messageId: string;
  prompt?: string;
  roleId: string;
  title: string;
}): Record<string, unknown> {
  return {
    created_at: createdAt,
    message: {
      parts: [
        {
          content: {
            subagent_instance_id: SUBAGENT_INSTANCE_ID,
            subagent_role_id: roleId,
            subagent_run_id: SUBAGENT_RUN_ID,
            prompt,
            title,
          },
          kind: "tool-return",
          outcome: "completed",
          tool_call_id: `call-${messageId}`,
          tool_name: "spawn_subagent",
        },
      ],
    },
    message_id: messageId,
    role_id: "MainAgent",
    run_id: `run-${messageId}`,
  };
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

function orchestrationSubagentRecord(): Record<string, unknown> {
  return {
    created_at: "2026-06-26T12:35:00Z",
    instance_id: SUBAGENT_INSTANCE_ID,
    last_event_id: 19,
    role_id: "Crafter",
    run_id: SUBAGENT_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    session_id: SESSION_ID,
    status: "completed",
    subagent_kind: "orchestration",
    title: "Crafter replay review",
    updated_at: "2026-06-26T12:40:00Z",
  };
}

function orchestrationLiveSubagentRecord(
  state: SubagentSessionMockState,
): Record<string, unknown> {
  return {
    created_at: "2026-06-26T12:31:05Z",
    instance_id: SUBAGENT_INSTANCE_ID,
    last_event_id: state.completed ? 44 : 41,
    role_id: "Crafter",
    run_id: SUBAGENT_RUN_ID,
    run_phase: state.completed ? "completed" : "running",
    run_status: state.completed ? "completed" : "running",
    session_id: SESSION_ID,
    status: state.completed ? "completed" : "running",
    subagent_kind: "orchestration",
    title: "Crafter live stream review",
    updated_at: state.completed
      ? "2026-06-26T12:34:00Z"
      : "2026-06-26T12:32:00Z",
  };
}

function subagentMessages(state: SubagentSessionMockState): Record<string, unknown>[] {
  if (state.completed) {
    return [
      {
        content: state.finalMessageContent ?? "Final persisted subagent answer",
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

function orchestrationLiveSubagentMessages(
  state: SubagentSessionMockState,
): Record<string, unknown>[] {
  if (state.completed) {
    return [
      {
        content: "Final orchestration child answer",
        created_at: "2026-06-26T12:34:00Z",
        message_id: "orchestration-live-subagent-final",
        role_id: "Crafter",
        run_id: SUBAGENT_RUN_ID,
      },
    ];
  }
  return [
    {
      content: "Crafter live orchestration checkpoint",
      created_at: "2026-06-26T12:32:00Z",
      message_id: "orchestration-live-subagent-checkpoint",
      role_id: "Crafter",
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

function orchestrationSubagentMessages(): Array<Record<string, unknown>> {
  return [
    {
      content: "Crafter checked the orchestration inputs.",
      created_at: "2026-06-26T12:36:00Z",
      message_id: "orchestration-subagent-message-1",
      role_id: "Crafter",
      run_id: SUBAGENT_RUN_ID,
    },
    {
      content: [
        "Crafter completed the right-panel replay task.",
        "",
        "- Parent timeline stayed clean.",
        "- Child replay remained readable.",
      ].join("\n"),
      created_at: "2026-06-26T12:40:00Z",
      message_id: "orchestration-subagent-message-2",
      role_id: "Crafter",
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
  roleId?: string;
  type: string;
}

interface BrowserParentMarkerRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  roleId?: string;
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

async function dispatchParentMarkerRunEvent(
  page: Page,
  event: BrowserParentMarkerRunEvent,
): Promise<void> {
  await dispatchEventSourceMessage(page, {
    data: {
      event_id: event.eventId,
      occurred_at: `2026-06-26T09:09:${String(event.eventId).padStart(2, "0")}Z`,
      payload: event.payload,
      relay_event_type: event.relayEventType,
      role_id: event.roleId ?? "MainAgent",
      run_id: PARENT_MARKER_RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-v2-parent-marker",
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
      role_id: event.roleId ?? "explorer",
      run_id: SUBAGENT_RUN_ID,
      session_id: SESSION_ID,
      trace_id: "trace-ts-subagent-session",
      type: event.type,
    },
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

async function sampleTextLengths(
  locator: Locator,
  count: number,
  intervalMs: number,
): Promise<number[]> {
  const lengths: number[] = [];
  for (let index = 0; index < count; index += 1) {
    lengths.push(((await locator.textContent()) ?? "").length);
    await locator.page().waitForTimeout(intervalMs);
  }
  return lengths;
}

async function panelVisibleTextOccurrences(
  page: Page,
  needle: string,
): Promise<number> {
  return page.locator(".at-subagent-session-view").evaluate((panel, text) => {
    const haystack = panel.textContent ?? "";
    if (text.length === 0) {
      return 0;
    }
    return haystack.split(text).length - 1;
  }, needle);
}

interface SubagentPromptLayout {
  promptBeforeTimeline: boolean;
  promptTop: number;
  timelineTop: number;
}

async function subagentPromptLayout(page: Page): Promise<SubagentPromptLayout> {
  return page.locator(".at-subagent-session-view").evaluate((root) => {
    const prompt = root.querySelector(".at-subagent-session-prompt");
    const timeline = root.querySelector(".at-timeline");
    if (!(prompt instanceof HTMLElement) || !(timeline instanceof HTMLElement)) {
      return {
        promptBeforeTimeline: false,
        promptTop: 0,
        timelineTop: 0,
      };
    }
    const promptRect = prompt.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    return {
      promptBeforeTimeline: promptRect.top < timelineRect.top,
      promptTop: promptRect.top,
      timelineTop: timelineRect.top,
    };
  });
}
