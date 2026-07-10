import { expect, test, type Page } from "@playwright/test";

import {
  dispatchEventSourceMessage,
  ensureScreenshotDir,
  eventSourceUrls,
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

const SCREENSHOT_FOLDER = "frontend-v2-ts-recovery";
const RUN_ID = "run-v2-live";
const SUBAGENT_RUN_ID = "subagent-run-1";
const BACKGROUND_SUBAGENT_ID = "background-subagent-1";
const BACKGROUND_TASK_ID = "background-task-1";
const BACKGROUND_RUN_ID = "background-run-1";
const TOOL_CALL_ID = "tool-approval-1";
const WEBFETCH_TOOL_CALL_ID = "call-webfetch-1";
const WEBFETCH_APPROVAL_URL = "https://localhost/one";
const QUESTION_ID = "question-1";

test("resolves pending recovery approvals and user questions", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery).not.toContainText(`Run ${RUN_ID} is awaiting_tool_approval`);
    await expect(recovery.getByText("read", { exact: true })).toBeVisible();
    await expect(recovery.getByText("Planner needs input")).toBeVisible();
    await expect(recovery.getByText("Pick next step")).toBeVisible();
    await expectRecoveryBetweenTimelineAndComposer(page);
    await expectMainTimelineDoesNotContain(page, [
      "Planner needs input",
      "Pick next step",
      QUESTION_ID,
      "User question",
    ]);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-recovery-actions.png", SCREENSHOT_FOLDER),
    });

    await recovery.getByLabel("Approval feedback").fill("Looks safe");
    await recovery.getByRole("button", { name: "Allow once" }).click();
    await expect(recovery.getByText("read", { exact: true })).toHaveCount(0);
    expect(state.toolApprovalRequests).toEqual([
      {
        payload: {
          action: "approve",
          feedback: "Looks safe",
          option_id: "allow_once",
        },
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
      },
    ]);

    await recovery.getByLabel("Continue - Keep streaming").click();
    await recovery.getByRole("button", { name: "Answer" }).click();
    await expect(recovery.getByText("Planner needs input")).toHaveCount(0);
    await expectMainTimelineDoesNotContain(page, [
      "Planner needs input",
      "Pick next step",
      QUESTION_ID,
      "User question",
      "User question answered",
    ]);
    expect(state.questionAnswerRequests).toEqual([
      {
        payload: {
          answers: [
            {
              selections: [
                {
                  label: "Continue",
                },
              ],
            },
          ],
        },
        questionId: QUESTION_ID,
        runId: RUN_ID,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "recovery actions should stay inside the fixed V2 shell",
    );
  } finally {
    await appServer.close();
  }
});

test("renders one host-scoped webfetch recovery approval", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    questionPending: false,
    toolApprovalRecord: webfetchApprovalRecord(),
    toolCallId: WEBFETCH_TOOL_CALL_ID,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS webfetch approval",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery).not.toContainText(`Run ${RUN_ID} is awaiting_tool_approval`);
    const approval = recovery.locator(".at-recovery-item");
    await expect(approval).toHaveCount(1);
    await expect(approval).toContainText("webfetch");
    await expect(approval).toContainText(WEBFETCH_APPROVAL_URL);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-recovery-webfetch-approval.png", SCREENSHOT_FOLDER),
    });

    await approval.getByRole("button", { name: "Approve" }).click();

    await expect(approval).toHaveCount(0);
    expect(state.toolApprovalRequests).toEqual([
      {
        payload: {
          action: "approve",
        },
        runId: RUN_ID,
        toolCallId: WEBFETCH_TOOL_CALL_ID,
      },
    ]);
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "webfetch approval recovery should stay inside the fixed V2 shell",
    );
  } finally {
    await appServer.close();
  }
});

test("submits multi-prompt question supplements after focus refresh", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    phase: "awaiting_user_question",
    questionRecord: complexUserQuestionRecord(),
    status: "paused",
    toolApprovalPending: false,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery question supplements",
    });

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText("Planner needs input")).toBeVisible();
    await expect(recovery.getByText("Pick the labels to apply")).toBeVisible();
    await expect(recovery.getByText("Pick the handoff mode")).toBeVisible();
    await expectRecoveryBetweenTimelineAndComposer(page);
    await expectMainTimelineDoesNotContain(page, [
      "Planner needs input",
      "Pick the labels to apply",
      "Pick the handoff mode",
      QUESTION_ID,
    ]);

    await recovery.getByLabel("Ship", { exact: true }).check();
    await recovery.getByLabel("Docs", { exact: true }).check();
    const docsSupplement = recovery.getByLabel("Additional answer - Docs");
    await docsSupplement.fill("Ship code now, docs follow immediately.");
    await docsSupplement.focus();
    await docsSupplement.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent("compositionstart", { data: "测" }),
      );
    });

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect
      .poll(() => state.recoveryForceRefreshRequests, {
        message: "focus should force-refresh recovery",
      })
      .toBeGreaterThan(0);
    await expect(docsSupplement).toBeFocused();
    await expect(docsSupplement).toHaveValue(
      "Ship code now, docs follow immediately.",
    );
    await docsSupplement.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent("compositionend", { data: "试" }),
      );
    });

    await recovery.getByLabel("Other", { exact: true }).check();
    await recovery
      .getByLabel("Additional answer - Other")
      .fill("Ship now, docs follow immediately.");
    await recovery.getByRole("button", { name: "Answer" }).click();

    await expect(recovery.getByText("Planner needs input")).toHaveCount(0);
    await expectMainTimelineDoesNotContain(page, [
      "Planner needs input",
      "Pick the labels to apply",
      "Pick the handoff mode",
      QUESTION_ID,
      "User question answered",
    ]);
    expect(state.questionAnswerRequests).toEqual([
      {
        payload: {
          answers: [
            {
              selections: [
                {
                  label: "Ship",
                },
                {
                  label: "Docs",
                  supplement: "Ship code now, docs follow immediately.",
                },
              ],
            },
            {
              selections: [
                {
                  label: "__none_of_the_above__",
                  supplement: "Ship now, docs follow immediately.",
                },
              ],
            },
          ],
        },
        questionId: QUESTION_ID,
        runId: RUN_ID,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "question supplement recovery should stay inside the fixed V2 shell",
    );
  } finally {
    await appServer.close();
  }
});

test("keeps recovery action errors visible and retryable", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    failNextQuestionAnswer: true,
    failNextToolApproval: true,
    questionDescription: "Retry the pending plan",
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery errors",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText("read", { exact: true })).toBeVisible();
    await expect(recovery.getByText("Planner needs input")).toBeVisible();

    await recovery.getByRole("button", { name: "Allow once" }).click();
    await expect(
      recovery.getByText("Tool approval failed in browser test."),
    ).toBeVisible();
    await expect(recovery.getByText("read", { exact: true })).toBeVisible();
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-recovery-action-errors.png", SCREENSHOT_FOLDER),
    });

    await recovery.getByRole("button", { name: "Allow once" }).click();
    await expect(recovery.getByText("read", { exact: true })).toHaveCount(0);
    await expect(
      recovery.getByText("Tool approval failed in browser test."),
    ).toHaveCount(0);
    expect(state.toolApprovalRequests).toEqual([
      {
        payload: {
          action: "approve",
          option_id: "allow_once",
        },
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
      },
      {
        payload: {
          action: "approve",
          option_id: "allow_once",
        },
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
      },
    ]);

    await recovery.getByLabel("Continue - Retry the pending plan").click();
    await recovery.getByRole("button", { name: "Answer" }).click();
    await expect(
      recovery.getByText("User question answer failed in browser test."),
    ).toBeVisible();
    await expect(recovery.getByText("Planner needs input")).toBeVisible();

    await recovery.getByRole("button", { name: "Answer" }).click();
    await expect(recovery.getByText("Planner needs input")).toHaveCount(0);
    await expect(
      recovery.getByText("User question answer failed in browser test."),
    ).toHaveCount(0);
    expect(state.questionAnswerRequests).toEqual([
      {
        payload: {
          answers: [
            {
              selections: [
                {
                  label: "Continue",
                },
              ],
            },
          ],
        },
        questionId: QUESTION_ID,
        runId: RUN_ID,
      },
      {
        payload: {
          answers: [
            {
              selections: [
                {
                  label: "Continue",
                },
              ],
            },
          ],
        },
        questionId: QUESTION_ID,
        runId: RUN_ID,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "retryable recovery errors should stay inside the fixed V2 shell",
    );
  } finally {
    await appServer.close();
  }
});

test("resumes a stopped recovery run from its checkpoint", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    lastEventId: 42,
    phase: "stopped",
    questionPending: false,
    shouldShowRecover: true,
    status: "stopped",
    toolApprovalPending: false,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery resume",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText("Run stopped")).toBeVisible();
    await expect(recovery).not.toContainText(RUN_ID);
    await expect(recovery.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect.poll(() => eventSourceUrls(page)).toEqual([]);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-recovery-resume-before.png", SCREENSHOT_FOLDER),
    });

    await recovery.getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => state.resumeRunRequests).toEqual([RUN_ID]);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=42$`),
    );
    await waitForEventSourceOpenCount(page, 1);
    await expect(recovery.getByRole("button", { name: "Resume" })).toHaveCount(0);

    const resumedText = "Resumed stopped run output.";
    await dispatchRunEvent(page, {
      eventId: 43,
      payload: { text: resumedText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(resumedText)).toBeVisible();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "stopped recovery resume should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-recovery-resume-after.png", SCREENSHOT_FOLDER),
    });
    await dispatchRunEvent(page, {
      eventId: 44,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
  } finally {
    await appServer.close();
  }
});

test("reopens an active recovery stream from the latest checkpoint after refresh", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    lastEventId: 17,
    phase: "running",
    questionPending: false,
    status: "running",
    toolApprovalPending: false,
  });
  const persistedMessages: Record<string, unknown>[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (
          context.method === "GET" &&
          context.path === `/sessions/${SESSION_ID}/messages`
        ) {
          await context.fulfillJson(persistedMessages);
          return true;
        }
        return handleRecoveryApi(context, state);
      },
      sessionTitle: "TS active recovery refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expect(page.locator(".at-recovery")).toHaveCount(0);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=17$`),
    );

    const firstRecoveredText = "Recovered active stream checkpoint text.";
    await dispatchRunEvent(page, {
      eventId: 18,
      payload: { text: firstRecoveredText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(firstRecoveredText)).toBeVisible();

    state.lastEventId = 18;
    persistedMessages.push(recoveredAssistantMessage("active-recovered-18", firstRecoveredText));
    await page.reload();
    await waitForV2Shell(page);

    await expect(page.locator(".at-recovery")).toHaveCount(0);
    const checkpointRow = page.locator(".at-message").filter({
      hasText: firstRecoveredText,
    });
    await expect(checkpointRow).toHaveCount(1);
    expect(await checkpointRow.locator(".at-message-text").textContent())
      .toBe(firstRecoveredText);
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${RUN_ID}/events\\?after_event_id=18$`),
    );

    const secondRecoveredText = "Recovered active stream continued after reload.";
    await dispatchRunEvent(page, {
      eventId: 19,
      payload: { text: secondRecoveredText },
      relayEventType: "text_delta",
      type: "message.text.delta",
    });
    await expect(page.getByText(secondRecoveredText)).toBeVisible();
    await expect(checkpointRow).toHaveCount(1);
    await expect.poll(() =>
      page.locator(".at-chat-view").evaluate(
        (element, values) => {
          const text = element.textContent ?? "";
          const firstCount = text.split(values.first).length - 1;
          const secondCount = text.split(values.second).length - 1;
          return {
            firstBeforeSecond: text.indexOf(values.first) < text.indexOf(values.second),
            firstCount,
            secondCount,
          };
        },
        { first: firstRecoveredText, second: secondRecoveredText },
      ),
    ).toEqual({
      firstBeforeSecond: true,
      firstCount: 1,
      secondCount: 1,
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "active recovery refresh should resume from the checkpoint inside the fixed shell",
    );
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-active-recovery-refresh.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps recovered background subagent output out of the parent timeline", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    backgroundTasks: [backgroundSubagentRecord()],
    lastEventId: 5,
    phase: "running",
    questionPending: false,
    status: "running",
    toolApprovalPending: false,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery subagent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText("subagent:reviewer")).toBeVisible();
    await expect
      .poll(() => multiplexedRecoveryStreamRequest(page, appServer.url))
      .toEqual({
        afterEventIds: ["5", "0"],
        count: 1,
        path: "/api/ag-ui/runs/events",
        runIds: [RUN_ID, SUBAGENT_RUN_ID],
      });

    const parentText = "Parent orchestration still running.";
    const subagentText = "Reviewer subagent stream output.";
    await dispatchRunEvent(page, {
      eventId: 6,
      payload: { text: parentText },
      relayEventType: "text_delta",
      sourceIndex: 0,
      type: "message.text.delta",
    });
    await dispatchRunEvent(page, {
      eventId: 1,
      payload: { text: subagentText },
      relayEventType: "text_delta",
      roleId: "reviewer",
      runId: SUBAGENT_RUN_ID,
      sourceIndex: 0,
      type: "message.text.delta",
    });

    await expect(page.getByText(parentText)).toBeVisible();
    await expectMainTimelineDoesNotContain(page, [subagentText]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "background subagent recovery should stay isolated from the parent timeline",
    );
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(
        "v2-background-subagent-stream.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await dispatchRunEvent(page, {
      eventId: 7,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      sourceIndex: 0,
      type: "run.completed",
    });
    await dispatchRunEvent(page, {
      eventId: 2,
      payload: { status: "completed" },
      relayEventType: "run_completed",
      roleId: "reviewer",
      runId: SUBAGENT_RUN_ID,
      sourceIndex: 0,
      type: "run.completed",
    });
    await waitForEventSourceOpenCount(page, 0);
  } finally {
    await appServer.close();
  }
});

test("stops a recovered background task and refreshes the snapshot", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    activeRun: false,
    backgroundTasks: [backgroundCommandTaskRecord()],
    questionPending: false,
    toolApprovalPending: false,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS recovery background task",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText("Background task is still active"))
      .toBeVisible();
    await expect(recovery.getByText("Background tasks")).toBeVisible();
    await expect(recovery.getByText("1 active")).toBeVisible();
    await expect(recovery.getByText("python worker.py")).toBeVisible();
    await expect(recovery.getByText("C:/repo")).toBeVisible();
    await expect(recovery.getByText("Running")).toBeVisible();
    await waitForEventSourceUrl(
      page,
      new RegExp(`/api/ag-ui/runs/${BACKGROUND_RUN_ID}/events\\?after_event_id=0$`),
    );
    await recovery.getByRole("button", { name: "Hide" }).click();
    await expect(recovery.getByText("python worker.py")).toBeHidden();
    await recovery.getByRole("button", { name: "Show" }).click();
    await expect(recovery.getByText("python worker.py")).toBeVisible();
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(
        "v2-background-task-stop-before.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await recovery.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => state.backgroundTaskStopRequests).toEqual([
      {
        backgroundTaskId: BACKGROUND_TASK_ID,
        runId: BACKGROUND_RUN_ID,
      },
    ]);
    await expect(page.locator(".at-recovery")).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "background task stop should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath(
        "v2-background-task-stop-after.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await waitForEventSourceOpenCount(page, 0);
  } finally {
    await appServer.close();
  }
});

test("shows paused subagent recovery without a standalone resume action", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = recoveryMockState({
    activeRun: false,
    pausedSubagent: pausedSubagentRecord(),
    questionPending: false,
    toolApprovalPending: false,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await installMockEventSource(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRecoveryApi(context, state),
      sessionTitle: "TS paused subagent recovery",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const recovery = page.locator(".at-recovery");
    await expect(recovery).not.toContainText("Recovery needs attention");
    await expect(recovery.getByText("Paused subagent: reviewer")).toBeVisible();
    await expect(
      recovery.getByText("Waiting for follow-up in the paused subagent panel."),
    ).toBeVisible();
    await expect(
      recovery.getByText(
        "instance: reviewer-1 | task: task-review-1 | waiting for input",
      ),
    ).toBeVisible();
    await expect(recovery.getByRole("button", { name: "Resume" })).toHaveCount(0);
    await expect.poll(() => eventSourceUrls(page)).toEqual([]);
    await expectRecoveryBetweenTimelineAndComposer(page);
    await expectMainTimelineDoesNotContain(page, [
      "Paused subagent: reviewer",
      "Waiting for follow-up in the paused subagent panel.",
      "reviewer-1",
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "paused subagent recovery should stay inside the fixed V2 shell",
    );
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(
        "v2-paused-subagent-recovery.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleRecoveryApi(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    if (context.url.searchParams.get("force_refresh") === "true") {
      state.recoveryForceRefreshRequests += 1;
    }
    await context.fulfillJson(recoverySnapshotResponse(state));
    return true;
  }
  if (
    context.method === "POST" &&
    context.path === `/ag-ui/runs/${RUN_ID}/tool-approvals/${state.toolCallId}:resolve`
  ) {
    await handleToolApproval(context, state);
    return true;
  }
  if (
    context.method === "POST" &&
    context.path === `/ag-ui/runs/${RUN_ID}/questions/${QUESTION_ID}:answer`
  ) {
    await handleQuestionAnswer(context, state);
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}:resume`) {
    await handleResumeRun(context, state);
    return true;
  }
  if (
    context.method === "POST" &&
    context.path ===
      `/runs/${BACKGROUND_RUN_ID}/background-tasks/${BACKGROUND_TASK_ID}:stop`
  ) {
    await handleBackgroundTaskStop(context, state);
    return true;
  }
  return false;
}

async function expectRecoveryBetweenTimelineAndComposer(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const recovery = document.querySelector<HTMLElement>(".at-recovery");
        const timeline = document.querySelector<HTMLElement>(".at-timeline-frame");
        const composer = document.querySelector<HTMLElement>(".at-composer");
        if (recovery === null || timeline === null || composer === null) {
          return null;
        }
        const recoveryRect = recovery.getBoundingClientRect();
        const timelineRect = timeline.getBoundingClientRect();
        const composerRect = composer.getBoundingClientRect();
        return {
          composerTop: Math.round(composerRect.top),
          recoveryBottom: Math.round(recoveryRect.bottom),
          recoveryTop: Math.round(recoveryRect.top),
          timelineBottom: Math.round(timelineRect.bottom),
        };
      }),
    )
    .toEqual(expect.objectContaining({
      composerTop: expect.any(Number),
      recoveryBottom: expect.any(Number),
      recoveryTop: expect.any(Number),
      timelineBottom: expect.any(Number),
    }));

  const metrics = await page.evaluate(() => {
    const recovery = document.querySelector<HTMLElement>(".at-recovery");
    const timeline = document.querySelector<HTMLElement>(".at-timeline-frame");
    const composer = document.querySelector<HTMLElement>(".at-composer");
    if (recovery === null || timeline === null || composer === null) {
      throw new Error("Expected recovery, timeline, and composer elements.");
    }
    const recoveryRect = recovery.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    return {
      composerTop: composerRect.top,
      recoveryBottom: recoveryRect.bottom,
      recoveryTop: recoveryRect.top,
      timelineBottom: timelineRect.bottom,
    };
  });
  expect(metrics.recoveryTop).toBeGreaterThanOrEqual(metrics.timelineBottom - 1);
  expect(metrics.recoveryBottom).toBeLessThanOrEqual(metrics.composerTop + 1);
}

async function expectMainTimelineDoesNotContain(
  page: Page,
  texts: string[],
): Promise<void> {
  const timeline = page.locator(".at-timeline-frame");
  for (const text of texts) {
    await expect(timeline).not.toContainText(text);
  }
}

async function handleToolApproval(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<void> {
  const payload = requestPayload(context);
  state.toolApprovalRequests.push({
    payload,
    runId: RUN_ID,
    toolCallId: state.toolCallId,
  });
  if (state.failNextToolApproval) {
    state.failNextToolApproval = false;
    await context.fulfillJson(
      { detail: "Tool approval failed in browser test." },
      500,
    );
    return;
  }
  state.toolApprovalPending = false;
  await context.fulfillJson({ status: "ok" });
}

async function handleQuestionAnswer(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<void> {
  const payload = requestPayload(context);
  state.questionAnswerRequests.push({
    payload,
    questionId: QUESTION_ID,
    runId: RUN_ID,
  });
  if (state.failNextQuestionAnswer) {
    state.failNextQuestionAnswer = false;
    await context.fulfillJson(
      { detail: "User question answer failed in browser test." },
      500,
    );
    return;
  }
  state.questionPending = false;
  await context.fulfillJson({ status: "ok" });
}

async function handleResumeRun(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<void> {
  state.resumeRunRequests.push(RUN_ID);
  state.phase = "running";
  state.shouldShowRecover = false;
  state.status = "running";
  await context.fulfillJson({
    run_id: RUN_ID,
    session_id: SESSION_ID,
    status: "running",
  });
}

async function handleBackgroundTaskStop(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<void> {
  state.backgroundTaskStopRequests.push({
    backgroundTaskId: BACKGROUND_TASK_ID,
    runId: BACKGROUND_RUN_ID,
  });
  state.backgroundTasks = [];
  await context.fulfillJson({
    background_task: {
      ...backgroundCommandTaskRecord(),
      status: "stopped",
    },
  });
}

function requestPayload(context: MockApiRouteContext): unknown {
  const postData = context.route.request().postData();
  if (postData === null || postData.trim().length === 0) {
    return null;
  }
  return JSON.parse(postData) as unknown;
}

interface RecoveryMockState {
  activeRun: boolean;
  backgroundTaskStopRequests: RecoveryBackgroundTaskStopRequest[];
  failNextQuestionAnswer: boolean;
  failNextToolApproval: boolean;
  backgroundTasks: Record<string, unknown>[];
  lastEventId: number;
  pausedSubagent: Record<string, unknown> | null;
  phase: string;
  questionAnswerRequests: RecoveryQuestionAnswerRequest[];
  questionDescription: string;
  questionPending: boolean;
  questionRecord: Record<string, unknown> | null;
  recoveryForceRefreshRequests: number;
  resumeRunRequests: string[];
  shouldShowRecover: boolean;
  status: string;
  toolApprovalRecord: Record<string, unknown>;
  toolApprovalPending: boolean;
  toolApprovalRequests: RecoveryToolApprovalRequest[];
  toolCallId: string;
}

interface RecoveryToolApprovalRequest {
  payload: unknown;
  runId: string;
  toolCallId: string;
}

interface RecoveryQuestionAnswerRequest {
  payload: unknown;
  questionId: string;
  runId: string;
}

interface RecoveryBackgroundTaskStopRequest {
  backgroundTaskId: string;
  runId: string;
}

interface RecoveryMockStateOptions {
  activeRun?: boolean;
  backgroundTasks?: Record<string, unknown>[];
  failNextQuestionAnswer?: boolean;
  failNextToolApproval?: boolean;
  lastEventId?: number;
  pausedSubagent?: Record<string, unknown> | null;
  phase?: string;
  questionDescription?: string;
  questionPending?: boolean;
  questionRecord?: Record<string, unknown> | null;
  shouldShowRecover?: boolean;
  status?: string;
  toolApprovalRecord?: Record<string, unknown>;
  toolApprovalPending?: boolean;
  toolCallId?: string;
}

function recoveryMockState(
  options: RecoveryMockStateOptions = {},
): RecoveryMockState {
  const toolCallId = options.toolCallId ?? TOOL_CALL_ID;
  return {
    activeRun: options.activeRun ?? true,
    backgroundTaskStopRequests: [],
    backgroundTasks: options.backgroundTasks ?? [],
    failNextQuestionAnswer: options.failNextQuestionAnswer ?? false,
    failNextToolApproval: options.failNextToolApproval ?? false,
    lastEventId: options.lastEventId ?? 42,
    pausedSubagent: options.pausedSubagent ?? null,
    phase: options.phase ?? "awaiting_tool_approval",
    questionAnswerRequests: [],
    questionDescription: options.questionDescription ?? "Keep streaming",
    questionPending: options.questionPending ?? true,
    questionRecord: options.questionRecord ?? null,
    recoveryForceRefreshRequests: 0,
    resumeRunRequests: [],
    shouldShowRecover: options.shouldShowRecover ?? false,
    status: options.status ?? "paused",
    toolApprovalRecord: options.toolApprovalRecord ?? toolApprovalRecord(toolCallId),
    toolApprovalPending: options.toolApprovalPending ?? true,
    toolApprovalRequests: [],
    toolCallId,
  };
}

function recoverySnapshotResponse(
  state: RecoveryMockState,
): Record<string, unknown> {
  return {
    active_run: state.activeRun
      ? {
          last_event_id: state.lastEventId,
          pending_tool_approval_count: state.toolApprovalPending ? 1 : 0,
          pending_user_question_count: state.questionPending ? 1 : 0,
          phase: state.phase,
          run_id: RUN_ID,
          session_id: SESSION_ID,
          should_show_recover: state.shouldShowRecover,
          status: state.status,
          stream_connected: false,
        }
      : null,
    background_tasks: state.backgroundTasks,
    paused_subagent: state.pausedSubagent,
    pending_tool_approvals: state.toolApprovalPending
      ? [state.toolApprovalRecord]
      : [],
    pending_user_questions: state.questionPending
      ? [state.questionRecord ?? userQuestionRecord(state.questionDescription)]
      : [],
  };
}

interface BrowserRunEvent {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  roleId?: string;
  runId?: string;
  sourceIndex?: number | null;
  type: string;
}

async function dispatchRunEvent(page: Page, event: BrowserRunEvent): Promise<void> {
  const payload = {
    event_id: event.eventId,
    occurred_at: `2026-06-26T11:00:${String(event.eventId).padStart(2, "0")}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: event.roleId ?? "MainAgent",
    run_id: event.runId ?? RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-recovery",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    sourceIndex: event.sourceIndex,
    type: event.type,
  });
}

async function multiplexedRecoveryStreamRequest(
  page: Page,
  appBaseUrl: string,
): Promise<Record<string, unknown>> {
  const urls = await eventSourceUrls(page);
  const streamUrl = urls.at(0) ?? "";
  if (!streamUrl) {
    return { afterEventIds: [], count: urls.length, path: "", runIds: [] };
  }
  const parsed = new URL(streamUrl, appBaseUrl);
  return {
    afterEventIds: parsed.searchParams.getAll("after_event_id"),
    count: urls.length,
    path: parsed.pathname,
    runIds: parsed.searchParams.getAll("run_id"),
  };
}

function backgroundSubagentRecord(): Record<string, unknown> {
  return {
    background_task_id: BACKGROUND_SUBAGENT_ID,
    command: "subagent:reviewer",
    cwd: "C:/repo",
    execution_mode: "background",
    kind: "subagent",
    recent_output: ["reviewer booted"],
    run_id: RUN_ID,
    session_id: SESSION_ID,
    status: "running",
    subagent_run_id: SUBAGENT_RUN_ID,
  };
}

function backgroundCommandTaskRecord(): Record<string, unknown> {
  return {
    background_task_id: BACKGROUND_TASK_ID,
    command: "python worker.py",
    cwd: "C:/repo",
    execution_mode: "background",
    kind: "command",
    recent_output: ["worker booted"],
    run_id: BACKGROUND_RUN_ID,
    session_id: SESSION_ID,
    status: "running",
  };
}

function pausedSubagentRecord(): Record<string, unknown> {
  return {
    instance_id: "reviewer-1",
    reason: "waiting for input",
    role_id: "reviewer",
    task_id: "task-review-1",
  };
}

function toolApprovalRecord(toolCallId = TOOL_CALL_ID): Record<string, unknown> {
  return {
    acp_options: [
      {
        kind: "allow_once",
        name: "Allow once",
        optionId: "allow_once",
      },
      {
        kind: "reject_once",
        name: "Reject once",
        optionId: "reject_once",
      },
    ],
    args_preview: "{\"path\":\"README.md\"}",
    tool_call_id: toolCallId,
    tool_name: "read",
  };
}

function webfetchApprovalRecord(): Record<string, unknown> {
  return {
    args_preview: JSON.stringify({ url: WEBFETCH_APPROVAL_URL }),
    tool_call_id: WEBFETCH_TOOL_CALL_ID,
    tool_name: "webfetch",
  };
}

function recoveredAssistantMessage(
  messageId: string,
  content: string,
): Record<string, unknown> {
  return {
    created_at: "2026-06-26T11:00:18Z",
    message: {
      parts: [
        {
          content,
          part_kind: "text",
        },
      ],
    },
    message_id: messageId,
    role_id: "MainAgent",
    run_id: RUN_ID,
  };
}

function userQuestionRecord(description: string): Record<string, unknown> {
  return {
    question_id: QUESTION_ID,
    questions: [
      {
        multiple: false,
        options: [
          {
            description,
            label: "Continue",
          },
          {
            label: "Stop",
          },
        ],
        question: "Pick next step",
      },
    ],
    role_id: "Planner",
    run_id: RUN_ID,
  };
}

function complexUserQuestionRecord(): Record<string, unknown> {
  return {
    question_id: QUESTION_ID,
    questions: [
      {
        multiple: true,
        options: [
          { label: "Ship" },
          { label: "Docs" },
        ],
        question: "Pick the labels to apply",
      },
      {
        multiple: false,
        options: [
          { label: "Defer" },
          { label: "__none_of_the_above__" },
        ],
        question: "Pick the handoff mode",
      },
    ],
    role_id: "Planner",
    run_id: RUN_ID,
  };
}
