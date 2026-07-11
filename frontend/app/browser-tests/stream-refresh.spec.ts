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
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-refresh";
const TOOL_REPLAY_RUN_ID = "run-ts-tool-refresh";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";

interface CapturedRunCreateRequest {
  input?: unknown;
  session_id?: string;
  shell_safety_policy_enabled?: boolean;
  yolo?: boolean;
}

interface RefreshRecoveryState {
  completed: boolean;
  lastEventId: number;
  messageRequestCount: number;
  persistedAssistantText: string;
  persistedPromptText?: string;
  persistedThinkingText?: string;
  roundHistoryEnabled?: boolean;
  runCreated: boolean;
}

interface ToolReplayRecoveryState {
  completed: boolean;
  lastEventId: number;
  persistedAfterRefresh: boolean;
  persistedResumeText: string;
  runCreated: boolean;
}

test.setTimeout(45_000);

test("resumes an active stream after refresh without duplicating hydrated output", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    messageRequestCount: 0,
    persistedAssistantText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Refresh stream recovery from TS browser";
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
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const persistedChunk = "TS refresh persisted chunk.";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: persistedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 2;
    recoveryState.persistedAssistantText = persistedChunk;
    await expect(page.getByText(persistedChunk)).toBeVisible();

    await page.reload();
    await waitForAppShell(page);
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=2$/,
    );
    await waitForEventSourceOpenCount(page, 1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: persistedChunk },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, token) =>
        (root.textContent ?? "").split(token as string).length - 1,
      persistedChunk),
    ).toBe(1);

    const resumedChunk = "TS after reload chunk.";
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { text: ` ${resumedChunk}` },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 3;
    await expect(page.getByText(resumedChunk)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, tokens) => {
        const text = root.textContent ?? "";
        const [first, second] = tokens as string[];
        return text.indexOf(first) >= 0 && text.indexOf(first) < text.indexOf(second);
      }, [persistedChunk, resumedChunk]),
    ).toBe(true);

    recoveryState.persistedAssistantText = `${persistedChunk} ${resumedChunk}`;
    recoveryState.lastEventId = 4;
    recoveryState.completed = true;
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByText(resumedChunk)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);

    await page.reload();
    await waitForAppShell(page);
    await expect(page.locator(".at-message").filter({ hasText: persistedChunk }))
      .toHaveCount(1);
    await expect(page.locator(".at-message").filter({ hasText: resumedChunk }))
      .toHaveCount(1);
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, tokens) => {
        const text = root.textContent ?? "";
        const [first, second] = tokens as string[];
        return {
          firstCount: text.split(first).length - 1,
          inOrder: text.indexOf(first) >= 0 && text.indexOf(first) < text.indexOf(second),
          secondCount: text.split(second).length - 1,
        };
      }, [persistedChunk, resumedChunk]),
    ).toEqual({
      firstCount: 1,
      inOrder: true,
      secondCount: 1,
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 refresh recovery should leave shell fixed-height",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-stream-refresh-replay.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("does not rebuild a fully displayed live answer when persisted history catches up", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    messageRequestCount: 0,
    persistedAssistantText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream terminal catchup",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill(
      "Terminal catch-up should not replay a completed live answer",
    );
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const finalText =
      "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_GAMMA LIVE_STREAM_DELTA";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: finalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 2;

    const liveAnswerRow = page.locator(
      `.at-timeline-row.at-message[data-run-id="${RUN_ID}"]`,
    );
    await expect(liveAnswerRow).toHaveCount(1);
    const streamingText = liveAnswerRow.locator(".at-message-streaming-text");
    await expect(streamingText).toBeVisible();
    await expect(streamingText).toHaveText(finalText);
    const markdownNode = liveAnswerRow.locator(".at-message-markdown");
    await expect(markdownNode).toHaveCount(1);
    await markdownNode.evaluate((element) => {
      element.setAttribute("data-stability-probe", "live-markdown");
    });
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-catchup-live-complete.png",
        SCREENSHOT_FOLDER,
      ),
    });
    await expect(liveAnswerRow.locator(".streaming-cursor")).toHaveCount(1);
    const liveRowKey = await liveAnswerRow.first().getAttribute("data-row-key");
    expect(liveRowKey).toContain("runtime-text:");
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-catchup-before-history.png",
        SCREENSHOT_FOLDER,
      ),
    });

    recoveryState.persistedAssistantText = finalText;
    recoveryState.lastEventId = 3;
    recoveryState.completed = true;
    const messageRequestsBeforeTerminal = recoveryState.messageRequestCount;
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();

    await expect(liveAnswerRow).toHaveCount(1);
    await expect(liveAnswerRow).toContainText(finalText);
    await expect(liveAnswerRow.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(liveAnswerRow.locator(".streaming-cursor")).toHaveCount(0);
    await expect(
      liveAnswerRow.locator(
        ".at-message-markdown[data-stability-probe='live-markdown']",
      ),
    ).toHaveCount(1);
    await expect.poll(() => liveAnswerRow.first().getAttribute("data-row-key"))
      .toBe(liveRowKey);
    await expect.poll(() => recoveryState.messageRequestCount)
      .toBeGreaterThan(messageRequestsBeforeTerminal);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((element, expectedText) =>
        (element.textContent ?? "").split(expectedText).length - 1,
      finalText),
    ).toBe(1);
    await expectSettledAnswerDoesNotReplay(page, liveAnswerRow, finalText, liveRowKey);
    await expect(
      liveAnswerRow.locator(
        ".at-message-markdown[data-stability-probe='live-markdown']",
      ),
    ).toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "terminal history catch-up should not rebuild the fixed V2 timeline",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-catchup-after-history.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("does not replay when persisted history renders before live replay arrives", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const finalText = [
    "LIVE_STREAM_ALPHA",
    "LIVE_STREAM_BETA",
    "LIVE_STREAM_GAMMA",
    "LIVE_STREAM_DELTA",
    "LIVE_STREAM_EPSILON",
    "LIVE_STREAM_ZETA",
    "LIVE_STREAM_ETA",
    "LIVE_STREAM_THETA",
    "LIVE_STREAM_IOTA",
    "LIVE_STREAM_KAPPA",
  ].join(" ");
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    messageRequestCount: 0,
    persistedAssistantText: finalText,
    runCreated: true,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream persisted before replay",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );

    const answerRow = page.locator(
      `.at-timeline-row.at-message[data-run-id="${RUN_ID}"]`,
    );
    await expect(answerRow).toHaveCount(1);
    expect(await answerRow.locator(".at-message-text").textContent())
      .toBe(finalText);
    await expect(answerRow).toContainText(finalText);
    await expect(answerRow.locator(".at-message-streaming-text")).toHaveText(finalText);
    await expect(answerRow.locator(".streaming-cursor")).toHaveCount(1);

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { text: finalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 1;

    await expect(answerRow).toHaveCount(1);
    await expect(answerRow.locator(".at-message-streaming-text")).toHaveText(finalText);
    await expect(answerRow.locator(".streaming-cursor")).toHaveCount(1);
    await expect.poll(async () => answerRow.locator(".at-message-text").textContent())
      .not.toBe("L");
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((element, expectedText) =>
        (element.textContent ?? "").split(expectedText).length - 1,
      finalText),
    ).toBe(1);

    recoveryState.completed = true;
    recoveryState.lastEventId = 2;
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(answerRow).toHaveCount(1);
    await expect(answerRow).toContainText(finalText);
    await expect(answerRow.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(answerRow.locator(".streaming-cursor")).toHaveCount(0);
    await expectSettledAnswerDoesNotReplay(
      page,
      answerRow,
      finalText,
      await answerRow.first().getAttribute("data-row-key"),
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "history-first live replay should not rebuild the fixed V2 timeline",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-history-first-live-replay.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("does not replay a completed live answer when terminal round history catches up", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    messageRequestCount: 0,
    persistedAssistantText: "",
    persistedPromptText: "Round hydration should not replay a completed live answer",
    persistedThinkingText: "The user wants me to output the requested deterministic text.",
    roundHistoryEnabled: true,
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream terminal round catchup",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill(
      recoveryState.persistedPromptText ?? "",
    );
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const finalText = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: finalText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 2;

    const liveAnswerRow = page.locator(
      `.at-timeline-row.at-message[data-run-id="${RUN_ID}"]`,
    );
    await expect(liveAnswerRow).toHaveCount(1);
    const streamingText = liveAnswerRow.locator(".at-message-streaming-text");
    await expect(streamingText).toBeVisible();
    await expect(streamingText).toHaveText(finalText);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-round-catchup-live-complete.png",
        SCREENSHOT_FOLDER,
      ),
    });
    const liveRowKey = await liveAnswerRow.first().getAttribute("data-row-key");
    expect(liveRowKey).toContain("runtime-text:");

    recoveryState.persistedAssistantText = finalText;
    recoveryState.lastEventId = 3;
    recoveryState.completed = true;
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();

    await expect(liveAnswerRow).toHaveCount(1);
    await expect(liveAnswerRow).toContainText(finalText);
    await expect(liveAnswerRow.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(liveAnswerRow.locator(".streaming-cursor")).toHaveCount(0);
    await expect.poll(() => liveAnswerRow.first().getAttribute("data-row-key"))
      .toBe(liveRowKey);
    await expect(page.locator("details.at-processed-group")).toHaveCount(1);
    await expect(page.locator("details.at-processed-group")).not.toHaveAttribute("open", "");
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((element, expectedText) =>
        (element.textContent ?? "").split(expectedText).length - 1,
      finalText),
    ).toBe(1);
    await expectSettledAnswerDoesNotReplay(page, liveAnswerRow, finalText, liveRowKey);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "terminal round history catch-up should not rebuild the live answer",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-round-catchup-no-replay.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("fills terminal structured output from a visible runtime prefix without replay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: RefreshRecoveryState = {
    completed: false,
    lastEventId: 0,
    messageRequestCount: 0,
    persistedAssistantText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS stream terminal fill",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    await page.getByRole("textbox", { name: "Prompt" }).fill(
      "Terminal structured output should continue from the visible prefix",
    );
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => runCreateRequests.length).toBe(1);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-refresh\/events\?after_event_id=0$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const visiblePrefix = "LI";
    const finalText =
      "LI LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_GAMMA LIVE_STREAM_DELTA LIVE_STREAM_EPSILON";
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: visiblePrefix },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    recoveryState.lastEventId = 2;

    const answerRow = page.locator(".at-timeline-row.at-message").filter({
      hasText: visiblePrefix,
    });
    await expect(answerRow).toHaveCount(1);
    const liveRowKey = await answerRow.first().getAttribute("data-row-key");
    expect(liveRowKey).toContain("runtime-text:");

    recoveryState.lastEventId = 3;
    recoveryState.completed = true;
    recoveryState.persistedAssistantText = finalText;
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: {
        output: [{ kind: "text", text: finalText }],
      },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect.poll(() => answerRow.first().getAttribute("data-row-key"))
      .toBe(liveRowKey);
    await expect(answerRow).toHaveCount(1);
    await expect(page.getByText(finalText)).toBeVisible();
    await expect(answerRow).toContainText(finalText);
    await expect(answerRow.locator(".streaming-cursor")).toHaveCount(0);
    await expect(answerRow.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((element, expectedText) =>
        (element.textContent ?? "").split(expectedText).length - 1,
      finalText),
    ).toBe(1);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-output-prefix-fill.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await expect.poll(() => answerRow.first().getAttribute("data-row-key"))
      .toBe(liveRowKey);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "terminal output prefix fill should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-terminal-output-prefix-final.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("continues a tool-heavy replay after refresh from the hydrated cursor", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const runCreateRequests: CapturedRunCreateRequest[] = [];
  const recoveryState: ToolReplayRecoveryState = {
    completed: false,
    lastEventId: 0,
    persistedAfterRefresh: false,
    persistedResumeText: "",
    runCreated: false,
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleToolReplayRefreshApi(context, runCreateRequests, recoveryState),
      sessionTitle: "TS tool replay refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const promptText = "Refresh a tool-heavy replay";
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(promptText);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => runCreateRequests.length).toBe(1);
    expect(runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: promptText }],
      session_id: SESSION_ID,
      shell_safety_policy_enabled: true,
      yolo: true,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-tool-refresh\/events\?after_event_id=0$/,
    );

    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      runId: TOOL_REPLAY_RUN_ID,
      type: "run.started",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { text: "Hydrated tool-heavy answer before refresh." },
      relayEventType: "text_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.text.delta",
    });
    await dispatchRunEvent(page, {
      eventId: 3,
      payload: {
        args: { path: "README.md" },
        tool_call_id: "call-tool-replay-read",
        tool_name: "read",
      },
      relayEventType: "tool_call",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_call.started",
    });
    await dispatchRunEvent(page, {
      eventId: 4,
      payload: {
        result: {
          data: "README excerpt from the pre-refresh replay.",
          ok: true,
        },
        tool_call_id: "call-tool-replay-read",
        tool_name: "read",
      },
      relayEventType: "tool_result",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_result.completed",
    });
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: {
        input_tokens: 144,
        output_tokens: 21,
        total_tokens: 165,
      },
      relayEventType: "token_usage",
      runId: TOOL_REPLAY_RUN_ID,
      type: "token_usage.updated",
    });
    recoveryState.lastEventId = 5;
    recoveryState.persistedAfterRefresh = true;

    await expect(page.getByText("Hydrated tool-heavy answer before refresh."))
      .toBeVisible();
    await expect(page.getByText("Read: read")).toBeVisible();
    await expect(page.getByText("Reading: read")).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(1);
    await expectToolChromeState(page, {
      completedCount: 1,
      errorCount: 0,
      spinnerCount: 0,
      validationCount: 0,
    });

    await page.reload();
    await waitForAppShell(page);
    await expect(page.getByText("Hydrated tool-heavy answer before refresh."))
      .toBeVisible();
    await expect(page.getByText("Read: read")).toBeVisible();
    await expect(page.getByText("Reading: read")).toHaveCount(0);
    await expect(page.getByText("Run failed: shell")).toBeVisible();
    await expect(page.getByText("Running: shell")).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(2);
    await expectToolChromeState(page, {
      completedCount: 1,
      errorCount: 1,
      spinnerCount: 0,
      validationCount: 0,
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-ts-tool-refresh\/events\?after_event_id=5$/,
    );
    await waitForEventSourceOpenCount(page, 1);

    const duplicateCursorText = "Duplicate cursor chunk should stay hidden.";
    await dispatchRunEvent(page, {
      eventId: 5,
      payload: { text: duplicateCursorText },
      relayEventType: "text_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.text.delta",
    });
    await expect(page.getByText(duplicateCursorText)).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(2);
    await expectToolChromeState(page, {
      completedCount: 1,
      errorCount: 1,
      spinnerCount: 0,
      validationCount: 0,
    });

    await dispatchRunEvent(page, {
      eventId: 6,
      payload: {
        details: "path is required",
        reason: "Input validation failed before tool execution.",
        tool_call_id: "call-tool-replay-validation",
        tool_name: "read",
      },
      relayEventType: "tool_input_validation_failed",
      runId: TOOL_REPLAY_RUN_ID,
      type: "tool_call.validation_failed",
    });
    recoveryState.lastEventId = 6;
    const resumedText = "Resumed output after the hydrated cursor.";
    await dispatchRunEvent(page, {
      eventId: 7,
      payload: {
        output: [{ kind: "text", text: resumedText }],
      },
      relayEventType: "output_delta",
      runId: TOOL_REPLAY_RUN_ID,
      type: "message.output.delta",
    });
    recoveryState.lastEventId = 7;
    recoveryState.persistedResumeText = resumedText;

    await expect(page.getByText("Tool validation: read")).toBeVisible();
    await expect(page.getByText(resumedText)).toBeVisible();
    await expect(page.locator(".at-message-tool")).toHaveCount(3);
    await expectToolChromeState(page, {
      completedCount: 1,
      errorCount: 1,
      spinnerCount: 0,
      validationCount: 1,
    });
    await expect(page.getByText(/Token usage:/)).toHaveCount(0);
    await expect(page.getByText(/Run started:/)).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "tool-heavy refresh replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-tool-heavy-refresh-replay.png",
        SCREENSHOT_FOLDER,
      ),
    });

    recoveryState.completed = true;
    recoveryState.lastEventId = 8;
    await dispatchRunEvent(page, {
      eventId: 8,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      runId: TOOL_REPLAY_RUN_ID,
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByText(resumedText)).toBeVisible();
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);

    await page.reload();
    await waitForAppShell(page);
    await expect(page.getByText("Hydrated tool-heavy answer before refresh."))
      .toBeVisible();
    await expect(page.getByText(resumedText)).toBeVisible();
    await expect(page.getByText("Read: read")).toBeVisible();
    await expect(page.getByText("Run failed: shell")).toBeVisible();
    await expect(page.getByText("Tool validation: read")).toBeVisible();
    await expect(page.getByText("Reading: read")).toHaveCount(0);
    await expect(page.getByText("Running: shell")).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(3);
    await expectToolChromeState(page, {
      completedCount: 1,
      errorCount: 1,
      spinnerCount: 0,
      validationCount: 1,
    });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate((root, tokens) => {
        const text = root.textContent ?? "";
        const [hydrated, resumed] = tokens as string[];
        return {
          hydratedCount: text.split(hydrated).length - 1,
          inOrder:
            text.indexOf(hydrated) >= 0 &&
            text.indexOf(hydrated) < text.indexOf(resumed),
          resumedCount: text.split(resumed).length - 1,
        };
      }, ["Hydrated tool-heavy answer before refresh.", resumedText]),
    ).toEqual({
      hydratedCount: 1,
      inOrder: true,
      resumedCount: 1,
    });
    await page.screenshot({
      path: screenshotPath(
        "v2-stream-tool-heavy-terminal-refresh-replay.png",
        SCREENSHOT_FOLDER,
      ),
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function expectToolChromeState(
  page: Page,
  expected: {
    completedCount: number;
    errorCount: number;
    spinnerCount: number;
    validationCount: number;
  },
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tools = Array.from(document.querySelectorAll(".at-message-tool"));
        return {
          completedCount: tools.filter(
            (tool) => tool.getAttribute("data-status") === "completed",
          ).length,
          errorCount: tools.filter(
            (tool) => tool.getAttribute("data-status") === "error",
          ).length,
          oldStatusCount: document.querySelectorAll(".at-message-tool-status").length,
          spinnerCount: document.querySelectorAll(".at-message-tool-spinner").length,
          validationCount: tools.filter(
            (tool) => tool.getAttribute("data-status") === "validation_failed",
          ).length,
        };
      }),
    )
    .toEqual({
      ...expected,
      oldStatusCount: 0,
    });
}

async function handleRefreshApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  recoveryState: RefreshRecoveryState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    recoveryState.runCreated = true;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    recoveryState.messageRequestCount += 1;
    await context.fulfillJson(persistedMessages(recoveryState));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson(persistedRounds(recoveryState));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(recoveryState));
    return true;
  }
  return false;
}

async function handleToolReplayRefreshApi(
  context: MockApiRouteContext,
  runCreateRequests: CapturedRunCreateRequest[],
  recoveryState: ToolReplayRecoveryState,
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    runCreateRequests.push(readRunCreateRequest(context.route.request().postData()));
    recoveryState.runCreated = true;
    await context.fulfillJson({
      run_id: TOOL_REPLAY_RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(toolReplayPersistedMessages(recoveryState));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(toolReplayRecoverySnapshot(recoveryState));
    return true;
  }
  return false;
}

function persistedMessages(recoveryState: RefreshRecoveryState): unknown[] {
  const text = recoveryState.persistedAssistantText.trim();
  if (!text) {
    return [];
  }
  return [
    {
      message: {
        parts: [
          {
            content: recoveryState.persistedAssistantText,
            part_kind: "text",
          },
        ],
      },
      message_id: "assistant-refresh-hydrated",
      role_id: "MainAgent",
      run_id: RUN_ID,
    },
  ];
}

function persistedRounds(recoveryState: RefreshRecoveryState): Record<string, unknown> {
  const text = recoveryState.persistedAssistantText.trim();
  if (recoveryState.roundHistoryEnabled !== true || !text) {
    return { has_more: false, items: [], next_cursor: null };
  }
  return {
    has_more: false,
    items: [
      {
        clear_marker_before: { cleared_at: "2026-06-26T10:00:00Z" },
        coordinator_messages: [
          {
            created_at: "2026-06-26T10:00:02Z",
            message: {
              parts: [
                ...(recoveryState.persistedThinkingText?.trim()
                  ? [
                      {
                        content: recoveryState.persistedThinkingText,
                        part_kind: "thinking",
                      },
                    ]
                  : []),
                {
                  content: recoveryState.persistedAssistantText,
                  part_kind: "text",
                },
              ],
            },
            message_id: "assistant-refresh-hydrated",
            role_id: "MainAgent",
          },
        ],
        created_at: "2026-06-26T10:00:01Z",
        has_final_output: true,
        intent: recoveryState.persistedPromptText ?? "Round hydrated live answer",
        intent_parts: [
          { kind: "text", text: recoveryState.persistedPromptText ?? "Round hydrated live answer" },
        ],
        run_id: RUN_ID,
        run_phase: "completed",
        run_status: "completed",
        run_user_message: recoveryState.persistedPromptText ?? "Round hydrated live answer",
      },
    ],
    next_cursor: null,
  };
}

function recoverySnapshot(recoveryState: RefreshRecoveryState): Record<string, unknown> {
  return {
    active_run:
      recoveryState.runCreated && !recoveryState.completed
        ? {
            last_event_id: recoveryState.lastEventId,
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
    paused_subagent: null,
    pending_tool_approvals: [],
    pending_user_questions: [],
    round_snapshot: null,
  };
}

function toolReplayPersistedMessages(
  recoveryState: ToolReplayRecoveryState,
): unknown[] {
  if (!recoveryState.persistedAfterRefresh) {
    return [];
  }
  const textParts = [
    {
      content: "Hydrated tool-heavy answer before refresh.",
      part_kind: "text",
    },
  ];
  if (recoveryState.persistedResumeText.trim().length > 0) {
    textParts.push({
      content: recoveryState.persistedResumeText,
      part_kind: "text",
    });
  }
  return [
    {
      content: "Refresh a tool-heavy replay",
      created_at: "2026-06-26T10:05:00Z",
      message_id: "tool-replay-user",
      role: "user",
      run_id: TOOL_REPLAY_RUN_ID,
    },
    {
      created_at: "2026-06-26T10:05:01Z",
      message: {
        parts: [
          ...textParts,
          {
            args: { path: "README.md" },
            kind: "tool-call",
            tool_call_id: "call-tool-replay-read",
            tool_name: "read",
          },
          {
            content: "README excerpt from the pre-refresh replay.",
            part_kind: "tool-return",
            tool_call_id: "call-tool-replay-read",
            tool_name: "read",
          },
          {
            args: { cmd: "npm run test:browser -- --project=chromium" },
            kind: "tool-call",
            tool_call_id: "call-tool-replay-shell",
            tool_name: "shell",
          },
          {
            content: {
              error: {
                message: "Browser test failed before refresh.",
                type: "runtime_error",
              },
              ok: false,
            },
            part_kind: "tool-return",
            tool_call_id: "call-tool-replay-shell",
            tool_name: "shell",
          },
          ...(recoveryState.lastEventId >= 6
            ? [
                {
                  content:
                    "Input validation failed before tool execution.\npath is required",
                  part_kind: "retry-prompt",
                  tool_call_id: "call-tool-replay-validation",
                  tool_name: "read",
                },
              ]
            : []),
        ],
      },
      message_id: "tool-replay-assistant",
      role_id: "MainAgent",
      run_id: TOOL_REPLAY_RUN_ID,
    },
  ];
}

function toolReplayRecoverySnapshot(
  recoveryState: ToolReplayRecoveryState,
): Record<string, unknown> {
  return {
    active_run:
      recoveryState.runCreated && !recoveryState.completed
        ? {
            last_event_id: recoveryState.lastEventId,
            pending_tool_approval_count: 0,
            pending_user_question_count: 0,
            phase: "streaming",
            run_id: TOOL_REPLAY_RUN_ID,
            session_id: SESSION_ID,
            should_show_recover: false,
            status: "running",
            stream_connected: false,
          }
        : null,
    background_tasks: [],
    paused_subagent: null,
    pending_tool_approvals: [],
    pending_user_questions: [],
    round_snapshot: null,
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

async function expectSettledAnswerDoesNotReplay(
  page: Page,
  answerRow: Locator,
  finalText: string,
  rowKey: string | null,
): Promise<void> {
  for (let frame = 0; frame < 20; frame += 1) {
    await page.waitForTimeout(35);
    await expect(answerRow).toHaveCount(1);
    await expect(answerRow).toContainText(finalText);
    await expect(answerRow.locator(".at-message-streaming-text")).toHaveCount(0);
    await expect(answerRow.locator(".streaming-cursor")).toHaveCount(0);
    await expect(answerRow.first()).toHaveAttribute("data-row-key", rowKey ?? "");
    const visibleCount = await page.locator(".at-chat-view").evaluate(
      (element, expectedText) =>
        (element.textContent ?? "").split(expectedText).length - 1,
      finalText,
    );
    expect(visibleCount).toBe(1);
  }
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  runId?: string;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const payload = {
    event_id: event.eventId,
    occurred_at: `2026-06-26T10:00:0${event.eventId}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: event.runId ?? RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-refresh",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    type: event.type,
  });
}
