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
const TOOL_CALL_ID = "tool-approval-1";
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
    await expect(recovery.getByText(`Run ${RUN_ID} is awaiting_tool_approval`))
      .toBeVisible();
    await expect(recovery.getByText("read", { exact: true })).toBeVisible();
    await expect(recovery.getByText("Planner needs input")).toBeVisible();
    await expect(recovery.getByText("Pick next step")).toBeVisible();
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
    await expect(recovery.getByText(`Run ${RUN_ID} is stopped`)).toBeVisible();
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

async function handleRecoveryApi(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshotResponse(state));
    return true;
  }
  if (
    context.method === "POST" &&
    context.path === `/ag-ui/runs/${RUN_ID}/tool-approvals/${TOOL_CALL_ID}:resolve`
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
  return false;
}

async function handleToolApproval(
  context: MockApiRouteContext,
  state: RecoveryMockState,
): Promise<void> {
  const payload = requestPayload(context);
  state.toolApprovalRequests.push({
    payload,
    runId: RUN_ID,
    toolCallId: TOOL_CALL_ID,
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

function requestPayload(context: MockApiRouteContext): unknown {
  const postData = context.route.request().postData();
  if (postData === null || postData.trim().length === 0) {
    return null;
  }
  return JSON.parse(postData) as unknown;
}

interface RecoveryMockState {
  failNextQuestionAnswer: boolean;
  failNextToolApproval: boolean;
  lastEventId: number;
  phase: string;
  questionAnswerRequests: RecoveryQuestionAnswerRequest[];
  questionDescription: string;
  questionPending: boolean;
  resumeRunRequests: string[];
  shouldShowRecover: boolean;
  status: string;
  toolApprovalPending: boolean;
  toolApprovalRequests: RecoveryToolApprovalRequest[];
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

interface RecoveryMockStateOptions {
  failNextQuestionAnswer?: boolean;
  failNextToolApproval?: boolean;
  lastEventId?: number;
  phase?: string;
  questionDescription?: string;
  questionPending?: boolean;
  shouldShowRecover?: boolean;
  status?: string;
  toolApprovalPending?: boolean;
}

function recoveryMockState(
  options: RecoveryMockStateOptions = {},
): RecoveryMockState {
  return {
    failNextQuestionAnswer: options.failNextQuestionAnswer ?? false,
    failNextToolApproval: options.failNextToolApproval ?? false,
    lastEventId: options.lastEventId ?? 42,
    phase: options.phase ?? "awaiting_tool_approval",
    questionAnswerRequests: [],
    questionDescription: options.questionDescription ?? "Keep streaming",
    questionPending: options.questionPending ?? true,
    resumeRunRequests: [],
    shouldShowRecover: options.shouldShowRecover ?? false,
    status: options.status ?? "paused",
    toolApprovalPending: options.toolApprovalPending ?? true,
    toolApprovalRequests: [],
  };
}

function recoverySnapshotResponse(
  state: RecoveryMockState,
): Record<string, unknown> {
  return {
    active_run: {
      last_event_id: state.lastEventId,
      pending_tool_approval_count: state.toolApprovalPending ? 1 : 0,
      pending_user_question_count: state.questionPending ? 1 : 0,
      phase: state.phase,
      run_id: RUN_ID,
      session_id: SESSION_ID,
      should_show_recover: state.shouldShowRecover,
      status: state.status,
      stream_connected: false,
    },
    background_tasks: [],
    paused_subagent: null,
    pending_tool_approvals: state.toolApprovalPending ? [toolApprovalRecord()] : [],
    pending_user_questions: state.questionPending
      ? [userQuestionRecord(state.questionDescription)]
      : [],
  };
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
    occurred_at: `2026-06-26T11:00:${String(event.eventId).padStart(2, "0")}Z`,
    payload: event.payload,
    relay_event_type: event.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-recovery",
    type: event.type,
  };
  await dispatchEventSourceMessage(page, {
    data: payload,
    lastEventId: String(event.eventId),
    type: event.type,
  });
}

function toolApprovalRecord(): Record<string, unknown> {
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
    tool_call_id: TOOL_CALL_ID,
    tool_name: "read",
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
