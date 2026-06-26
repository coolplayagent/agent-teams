import { expect, test } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
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
  questionAnswerRequests: RecoveryQuestionAnswerRequest[];
  questionDescription: string;
  questionPending: boolean;
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
  questionDescription?: string;
}

function recoveryMockState(
  options: RecoveryMockStateOptions = {},
): RecoveryMockState {
  return {
    failNextQuestionAnswer: options.failNextQuestionAnswer ?? false,
    failNextToolApproval: options.failNextToolApproval ?? false,
    questionAnswerRequests: [],
    questionDescription: options.questionDescription ?? "Keep streaming",
    questionPending: true,
    toolApprovalPending: true,
    toolApprovalRequests: [],
  };
}

function recoverySnapshotResponse(
  state: RecoveryMockState,
): Record<string, unknown> {
  return {
    active_run: {
      last_event_id: 42,
      pending_tool_approval_count: state.toolApprovalPending ? 1 : 0,
      pending_user_question_count: state.questionPending ? 1 : 0,
      phase: "awaiting_tool_approval",
      run_id: RUN_ID,
      session_id: SESSION_ID,
      should_show_recover: false,
      status: "paused",
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
