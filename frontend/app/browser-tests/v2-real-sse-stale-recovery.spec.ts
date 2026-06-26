import { expect, test, type Locator, type Page } from "@playwright/test";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-real-sse-stale";
const SUBAGENT_RUN_ID = "subagent-run-ts-real-sse";
const BACKGROUND_TASK_ID = "background-task-ts-real-sse";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";
const PROMPT = "Real SSE stale recovery probe";
const FIRST_CHUNK = "Real SSE chunk before malformed frame.";
const MAIN_MULTIPLEX_CHUNK = "real SSE main multiplex chunk";
const SUBAGENT_MULTIPLEX_CHUNK = "real SSE subagent multiplex chunk";
const DUPLICATE_REPLAY_CHUNK = "real SSE after duplicate replay";
const FAILURE_MESSAGE = "real SSE provider failed before completion";
const QUEUED_INJECTION = "real SSE queued follow-up";
const INTERRUPT_INJECTION = "real SSE interrupt follow-up";
const RECOVERY_ACTION_FEEDBACK = "Use the existing TS browser command.";
const RECOVERY_ACTION_LAST_EVENT_ID = 7;
const RECOVERY_ACTION_RESUMED_CHUNK = "real SSE recovery action resumed chunk";
const RECOVERY_QUESTION_SUPPLEMENT = "Need release note coverage";
const REFRESH_RESUMED_CHUNK = "real SSE refresh resumed chunk";
const RUNTIME_CURSOR_RESUMED_CHUNK = "real SSE resumed chunk";
const RICH_REPLAY_THINKING_PREFIX = "checking replay state";
const RICH_REPLAY_THINKING_SUFFIX = " after reconnect";
const RICH_REPLAY_THINKING = `${RICH_REPLAY_THINKING_PREFIX}${RICH_REPLAY_THINKING_SUFFIX}`;
const RICH_REPLAY_TOOL_CALL_ID = "call-ts-rich-replay";
const RICH_REPLAY_TOOL_OUTPUT = "recovered tool output";
const RICH_REPLAY_OUTPUT_TEXT = "structured replay output part";
const RICH_REPLAY_OUTPUT_IMAGE = "runtime-rich-image.png";
const RICH_REPLAY_OUTPUT_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const RICH_REPLAY_VALIDATION_REASON =
  "Input validation failed before tool execution.";
const RICH_REPLAY_VALIDATION_DETAILS = "cmd is required for replay validation";
const RICH_REPLAY_TOKEN_SUMMARY = "Token usage: Total 18 · Input 11 · Output 7";
const RICH_REPLAY_MODEL_STEP = "model step replay visible";
const RICH_REPLAY_MODEL_STEP_STARTED_SUMMARY =
  `Model step started: ${RICH_REPLAY_MODEL_STEP}`;
const RICH_REPLAY_MODEL_STEP_FINISHED_SUMMARY =
  `Model step finished: ${RICH_REPLAY_MODEL_STEP} finished`;
const RICH_REPLAY_STATE_SNAPSHOT = "state snapshot replay visible";
const RICH_REPLAY_STATE_SNAPSHOT_SUMMARY =
  `State snapshot: ${RICH_REPLAY_STATE_SNAPSHOT}`;
const RICH_REPLAY_STATE_DELTA = "state delta replay visible";
const RICH_REPLAY_STATE_DELTA_SUMMARY = `State delta: ${RICH_REPLAY_STATE_DELTA}`;
const RICH_REPLAY_TODO_CURRENT = "verify rich replay todos";
const RICH_REPLAY_TODO_SUMMARY =
  `Todo updated: 3 items · 1 completed, 1 in_progress, 1 pending · Current ${RICH_REPLAY_TODO_CURRENT} · v4 · by replay-agent`;
const RICH_REPLAY_INJECTION = "queued replay injection";
const RICH_REPLAY_INJECTION_QUEUED_SUMMARY =
  `Injection queued: ${RICH_REPLAY_INJECTION} · source user · mode queued · to replay-agent`;
const RICH_REPLAY_INJECTION_APPLIED = "applied replay injection";
const RICH_REPLAY_INJECTION_APPLIED_SUMMARY =
  `Injection applied: ${RICH_REPLAY_INJECTION_APPLIED} · source system · mode guidance · to replay-agent`;
const RICH_REPLAY_QUESTION_ID = "question-rich-replay";
const RICH_REPLAY_QUESTION = "Choose replay path";
const RICH_REPLAY_QUESTION_SUMMARY =
  `User question: ${RICH_REPLAY_QUESTION} · #${RICH_REPLAY_QUESTION_ID}`;
const RICH_REPLAY_QUESTION_ANSWER_SUMMARY =
  `User question answered: 1 answer · #${RICH_REPLAY_QUESTION_ID}`;
const RICH_REPLAY_NOTIFICATION = "notification replay visible";
const RICH_REPLAY_NOTIFICATION_SUMMARY =
  `Notification: ${RICH_REPLAY_NOTIFICATION}`;
const RICH_REPLAY_SUBAGENT_STATUS = "subagent status replay visible";
const RICH_REPLAY_SUBAGENT_STATUS_SUMMARY =
  `Subagent status: ${RICH_REPLAY_SUBAGENT_STATUS} · status running`;
const RICH_REPLAY_SUBAGENT_STOPPED_SUMMARY =
  "Subagent stopped: reason stopped_by_user · role reviewer · instance subagent-rich · task task-rich";
const RICH_REPLAY_SUBAGENT_RESUMED_SUMMARY =
  "Subagent resumed: role reviewer · instance subagent-rich · task task-rich";
const RICH_REPLAY_MANUAL_ACTION_SUMMARY = "Awaiting manual action: root task root-rich";
const RICH_REPLAY_BACKGROUND_TASK = "background task replay visible";
const RICH_REPLAY_BACKGROUND_TASK_SUMMARY =
  `Background task started: ${RICH_REPLAY_BACKGROUND_TASK}`;
const STOPPED_MESSAGE = "real SSE run stopped before completion";
const STREAM_UNAVAILABLE = "run recovery stream is no longer available";
const TOOL_CALL_ID = "call-ts-real-sse-approval";
const QUESTION_ID = "question-ts-real-sse-recovery";

test.setTimeout(45_000);

test("suppresses stale auto recovery after a real SSE server error", async ({
  page,
}) => {
  await runRealSseStaleRecoveryScenario(page, {
    mode: "server-error",
    screenshotName: "v2-real-sse-server-error-stale-recovery.png",
  });
});

test("suppresses stale auto recovery after a real SSE malformed event", async ({
  page,
}) => {
  await runRealSseStaleRecoveryScenario(page, {
    mode: "malformed-event",
    screenshotName: "v2-real-sse-malformed-stale-recovery.png",
  });
});

test("finalizes a real SSE run.failed event without stale reconnect", async ({
  page,
}) => {
  await runRealSseTerminalScenario(page, {
    mode: "run-failed",
    screenshotName: "v2-real-sse-run-failed-terminal.png",
    terminalSummary: "Run failed: status failed",
    terminalText: FAILURE_MESSAGE,
  });
});

test("finalizes a real SSE run.stopped event without stale reconnect", async ({
  page,
}) => {
  await runRealSseTerminalScenario(page, {
    mode: "run-stopped",
    screenshotName: "v2-real-sse-run-stopped-terminal.png",
    terminalSummary: "Run stopped: status stopped",
    terminalText: STOPPED_MESSAGE,
  });
});

test("stops a real SSE active run and suppresses stale reconnect", async ({
  page,
}) => {
  await runRealSseActiveControlScenario(page, {
    mode: "active-stop",
    screenshotName: "v2-real-sse-active-stop-restored.png",
  });
});

test("injects into a real SSE active run without creating a second run", async ({
  page,
}) => {
  await runRealSseActiveControlScenario(page, {
    mode: "active-inject",
    screenshotName: "v2-real-sse-active-inject-controls.png",
  });
});

test("resumes a real SSE recoverable run before resolving tool approval", async ({
  page,
}) => {
  await runRealSseRecoveryActionScenario(page, {
    mode: "recovery-approval",
    screenshotName: "v2-real-sse-recovery-approval-resume.png",
  });
});

test("resumes a real SSE recoverable run before answering user question", async ({
  page,
}) => {
  await runRealSseRecoveryActionScenario(page, {
    mode: "recovery-question",
    screenshotName: "v2-real-sse-recovery-question-resume.png",
  });
});

test("resumes a real SSE recoverable run from the standalone action", async ({
  page,
}) => {
  await runRealSseStandaloneResumeScenario(page, {
    mode: "recoverable-resume",
    screenshotName: "v2-real-sse-recoverable-resume.png",
  });
});

test("reopens a real SSE stream from the recovery checkpoint after refresh", async ({
  page,
}) => {
  await runRealSseRefreshRecoveryScenario(page, {
    mode: "refresh-recovery",
    screenshotName: "v2-real-sse-refresh-recovery.png",
  });
});

test("dedupes the real SSE cursor event before continuing replay", async ({
  page,
}) => {
  await runRealSseDuplicateReplayScenario(page, {
    mode: "duplicate-replay",
    screenshotName: "v2-real-sse-duplicate-replay.png",
  });
});

test("preserves rich real SSE replay events after reconnect", async ({ page }) => {
  await runRealSseRichReplayScenario(page, {
    mode: "rich-replay",
    screenshotName: "v2-real-sse-rich-replay.png",
  });
});

test("reconnects a real SSE interruption from the runtime cursor", async ({
  page,
}) => {
  await runRealSseRuntimeCursorReconnectScenario(page, {
    mode: "runtime-cursor-reconnect",
    screenshotName: "v2-real-sse-runtime-cursor-reconnect.png",
  });
});

test("streams real SSE recovered background subagent output through multiplexed runs", async ({
  page,
}) => {
  await runRealSseBackgroundSubagentScenario(page, {
    mode: "background-subagent-multiplex",
    screenshotName: "v2-real-sse-background-subagent-multiplex.png",
  });
});

test("streams only the real SSE background subagent for a recoverable parent", async ({
  page,
}) => {
  await runRealSseBackgroundSubagentScenario(page, {
    mode: "background-subagent-only",
    screenshotName: "v2-real-sse-background-subagent-only.png",
  });
});

interface RealSseScenarioOptions {
  mode: "malformed-event" | "server-error";
  screenshotName: string;
}

interface RealSseActiveControlOptions {
  mode: "active-inject" | "active-stop";
  screenshotName: string;
}

interface RealSseRecoveryActionOptions {
  mode: "recovery-approval" | "recovery-question";
  screenshotName: string;
}

interface RealSseRefreshRecoveryOptions {
  mode: "refresh-recovery";
  screenshotName: string;
}

interface RealSseDuplicateReplayOptions {
  mode: "duplicate-replay";
  screenshotName: string;
}

interface RealSseRichReplayOptions {
  mode: "rich-replay";
  screenshotName: string;
}

interface RealSseRuntimeCursorReconnectOptions {
  mode: "runtime-cursor-reconnect";
  screenshotName: string;
}

interface RealSseBackgroundSubagentOptions {
  mode: "background-subagent-multiplex" | "background-subagent-only";
  screenshotName: string;
}

interface RealSseStandaloneResumeOptions {
  mode: "recoverable-resume";
  screenshotName: string;
}

interface RealSseTerminalOptions {
  mode: "run-failed" | "run-stopped";
  screenshotName: string;
  terminalSummary: string;
  terminalText: string;
}

interface RealSseState {
  approvalResolutions: RealSseRecoveryActionRequest[];
  backgroundSubagentRecovery: boolean;
  completed: boolean;
  injectionRequests: RealSseInjectionRequest[];
  lastEventId: number;
  multiplexRequests: RealSseMultiplexRequest[];
  pendingToolApproval: boolean;
  pendingUserQuestion: boolean;
  persistedAssistantText: string;
  questionAnswers: RealSseRecoveryActionRequest[];
  requestSequence: string[];
  resumeRequests: string[];
  runCreated: boolean;
  runCreateCount: number;
  shouldShowRecover: boolean;
  stopRequests: unknown[];
  streamRequests: RealSseRequest[];
  subagentStreamRequests: RealSseRequest[];
}

interface RealSseInjectionRequest {
  content?: unknown;
  mode?: unknown;
}

interface RealSseRecoveryActionRequest {
  payload: unknown;
  runId: string;
}

interface RealSseRequest {
  afterEventId: string | null;
  lastEventId: string | null;
}

interface RealSseMultiplexRequest {
  lastEventId: string | null;
  runOffsets: Record<string, string>;
}

async function runRealSseStaleRecoveryScenario(
  page: Page,
  options: RealSseScenarioOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);

    if (options.mode === "malformed-event") {
      await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    }

    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.locator(".at-recovery")).toHaveCount(0);

    await page.waitForTimeout(1_500);
    expect(state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should not reopen stale recovery outside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseTerminalScenario(
  page: Page,
  options: RealSseTerminalOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    await expect(page.getByText(options.terminalText)).toBeVisible();
    await expect(page.getByText(options.terminalSummary)).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.locator(".at-recovery")).toHaveCount(0);

    await page.waitForTimeout(1_500);
    expect(state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should close the real SSE stream inside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseActiveControlScenario(
  page: Page,
  options: RealSseActiveControlOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeVisible();

    if (options.mode === "active-inject") {
      await expect(page.getByRole("button", { exact: true, name: "Queue" })).toBeVisible();
      await expect(page.getByRole("button", { exact: true, name: "Interrupt" })).toBeVisible();
      await prompt.fill(QUEUED_INJECTION);
      await page.getByRole("button", { exact: true, name: "Queue" }).click();
      await expect(prompt).toHaveValue("");
      await prompt.fill(INTERRUPT_INJECTION);
      await page.getByRole("button", { exact: true, name: "Interrupt" }).click();
      await expect(prompt).toHaveValue("");
      expect(state.injectionRequests).toEqual([
        { content: QUEUED_INJECTION, mode: "queued" },
        { content: INTERRUPT_INJECTION, mode: "interrupt" },
      ]);
      expect(state.runCreateCount).toBe(1);
      expect(state.stopRequests).toEqual([]);
      await page.mouse.move(320, 120);
      await page.screenshot({
        path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
      });
    }

    await page.getByRole("button", { exact: true, name: "Stop" }).click();
    await expect.poll(() => state.stopRequests).toEqual([{ scope: "main" }]);
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    await expect(page.locator(".at-recovery")).toHaveCount(0);

    await page.waitForTimeout(4_000);
    expect(state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should stop the real SSE stream without stale reconnect`,
    );
    await expectComposerControlsDoNotOverlap(page);
    if (options.mode === "active-stop") {
      await page.mouse.move(320, 120);
      await page.screenshot({
        path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
      });
    }
  } finally {
    await appServer.close();
  }
}

async function runRealSseRecoveryActionScenario(
  page: Page,
  options: RealSseRecoveryActionOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState({
    lastEventId: RECOVERY_ACTION_LAST_EVENT_ID,
    pendingToolApproval: options.mode === "recovery-approval",
    pendingUserQuestion: options.mode === "recovery-question",
    runCreated: true,
    shouldShowRecover: true,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: `TS ${options.mode}`,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const recovery = page.locator(".at-recovery");
    if (options.mode === "recovery-approval") {
      await expect(recovery.getByText("execute_command")).toBeVisible();
      await expect(recovery.getByText('{"cmd":"npm test"}')).toBeVisible();
      await expect(recovery.getByRole("button", { name: "Resume" })).toHaveCount(0);
      await recovery.getByLabel("Approval feedback").fill(RECOVERY_ACTION_FEEDBACK);
      await recovery.getByRole("button", { name: "Allow once" }).click();
      await expect.poll(() => state.approvalResolutions).toEqual([
        {
          payload: {
            action: "approve",
            feedback: RECOVERY_ACTION_FEEDBACK,
            option_id: "allow_once",
          },
          runId: RUN_ID,
        },
      ]);
      expect(sequenceIndex(state, "resume")).toBeLessThan(sequenceIndex(state, "approval"));
    } else {
      await expect(recovery.getByText("Planner needs input")).toBeVisible();
      await expect(recovery.getByText("Pick the handoff mode")).toBeVisible();
      await expect(recovery.getByRole("button", { name: "Resume" })).toHaveCount(0);
      await recovery.getByLabel("Ship - Deploy now").click();
      await recovery.getByLabel("Other").click();
      await recovery.getByLabel("Additional answer").fill(RECOVERY_QUESTION_SUPPLEMENT);
      await recovery.getByRole("button", { name: "Answer" }).click();
      await expect.poll(() => state.questionAnswers).toEqual([
        {
          payload: {
            answers: [
              {
                selections: [
                  { label: "Ship" },
                  {
                    label: "__none_of_the_above__",
                    supplement: RECOVERY_QUESTION_SUPPLEMENT,
                  },
                ],
              },
            ],
          },
          runId: RUN_ID,
        },
      ]);
      expect(sequenceIndex(state, "resume")).toBeLessThan(sequenceIndex(state, "question"));
    }

    await expect.poll(() => state.resumeRequests).toEqual([RUN_ID]);
    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: String(RECOVERY_ACTION_LAST_EVENT_ID),
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(RECOVERY_ACTION_RESUMED_CHUNK)).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.locator(".at-recovery")).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should resume through real SSE inside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseStandaloneResumeScenario(
  page: Page,
  options: RealSseStandaloneResumeOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState({
    lastEventId: RECOVERY_ACTION_LAST_EVENT_ID,
    runCreated: true,
    shouldShowRecover: true,
  });
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: "TS recoverable resume",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const recovery = page.locator(".at-recovery");
    await expect(recovery.getByText(`Run ${RUN_ID} is stopped`)).toBeVisible();
    await expect(recovery.getByRole("button", { name: "Resume" })).toBeVisible();

    await recovery.getByRole("button", { name: "Resume" }).click();

    await expect.poll(() => state.resumeRequests).toEqual([RUN_ID]);
    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: String(RECOVERY_ACTION_LAST_EVENT_ID),
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(RECOVERY_ACTION_RESUMED_CHUNK)).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.locator(".at-recovery")).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "standalone recoverable resume should continue through real SSE inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseRefreshRecoveryScenario(
  page: Page,
  options: RealSseRefreshRecoveryOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: "TS real SSE refresh",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expect.poll(() => state.streamRequests).toEqual([
      {
        afterEventId: "0",
        lastEventId: null,
      },
    ]);
    await expect(page.getByText(FIRST_CHUNK)).toBeVisible();
    expect(state.lastEventId).toBe(2);
    expect(state.persistedAssistantText).toBe(FIRST_CHUNK);
    expect(state.runCreateCount).toBe(1);

    await page.reload();
    await waitForV2Shell(page);
    await expect(page.locator(".at-message").filter({ hasText: FIRST_CHUNK }))
      .toHaveCount(1);
    await expect.poll(() => state.streamRequests.at(-1)).toEqual({
      afterEventId: "2",
      lastEventId: null,
    });
    await expect(page.getByText(REFRESH_RESUMED_CHUNK)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: FIRST_CHUNK }))
      .toHaveCount(1);
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.locator(".at-recovery")).toHaveCount(0);
    expect(state.runCreateCount).toBe(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "real SSE refresh recovery should continue from the persisted checkpoint inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseDuplicateReplayScenario(
  page: Page,
  options: RealSseDuplicateReplayOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: "TS real SSE duplicate replay",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expect.poll(() => state.streamRequests.at(0)).toEqual({
      afterEventId: "0",
      lastEventId: null,
    });
    const firstChunkMessage = page.locator(".at-message").filter({
      hasText: FIRST_CHUNK,
    });
    await expect(firstChunkMessage).toBeVisible();
    await expect.poll(() => state.streamRequests.some(
      (request) => request.afterEventId === "2",
    )).toBe(true);
    await expect(page.getByText(DUPLICATE_REPLAY_CHUNK)).toBeVisible();

    const messageText = await firstChunkMessage.first().innerText();
    expect(countOccurrences(messageText, FIRST_CHUNK.trim())).toBe(1);
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.getByText(`Run ${RUN_ID} is streaming`)).toBeHidden();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "real SSE duplicate replay should continue once from the runtime cursor inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseRichReplayScenario(
  page: Page,
  options: RealSseRichReplayOptions,
): Promise<void> {
  const appServer = await serveFrontendDist();
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: "TS real SSE rich replay",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    await expectTimelineTextVisible(page, FIRST_CHUNK);
    await expect.poll(() => state.streamRequests.some(
      (request) => request.afterEventId === "2",
    )).toBe(true);

    const thinkingSummary = await expectTimelineSelectorVisible(
      page,
      ".at-message-thinking-summary",
    );
    await thinkingSummary.click();
    await expectTimelineTextVisible(page, RICH_REPLAY_THINKING);

    for (const text of [
      RICH_REPLAY_TOKEN_SUMMARY,
      RICH_REPLAY_MODEL_STEP_STARTED_SUMMARY,
      RICH_REPLAY_MODEL_STEP_FINISHED_SUMMARY,
      RICH_REPLAY_STATE_SNAPSHOT_SUMMARY,
      RICH_REPLAY_STATE_DELTA_SUMMARY,
      RICH_REPLAY_TODO_SUMMARY,
      RICH_REPLAY_NOTIFICATION_SUMMARY,
      RICH_REPLAY_SUBAGENT_STATUS_SUMMARY,
      RICH_REPLAY_BACKGROUND_TASK_SUMMARY,
      RICH_REPLAY_INJECTION_QUEUED_SUMMARY,
      RICH_REPLAY_INJECTION_APPLIED_SUMMARY,
      RICH_REPLAY_QUESTION_SUMMARY,
      RICH_REPLAY_QUESTION_ANSWER_SUMMARY,
      RICH_REPLAY_SUBAGENT_STOPPED_SUMMARY,
      RICH_REPLAY_SUBAGENT_RESUMED_SUMMARY,
      RICH_REPLAY_MANUAL_ACTION_SUMMARY,
      RICH_REPLAY_OUTPUT_TEXT,
    ]) {
      await expectTimelineTextVisible(page, text);
    }
    await expectTimelineTextVisible(page, "Tool call: read");
    await expectTimelineTextVisible(page, "Tool result: read");

    const outputImage = page.getByRole("img", { name: RICH_REPLAY_OUTPUT_IMAGE });
    await expect(outputImage).toBeVisible();
    await expect(outputImage).toHaveAttribute("src", RICH_REPLAY_OUTPUT_IMAGE_URL);

    await expectTimelineTextVisible(page, "Tool validation: execute_command");
    await page.getByText("Tool validation: execute_command").first().click();
    await expectTimelineTextVisible(page, RICH_REPLAY_VALIDATION_DETAILS);
    await expectTimelineTextVisible(page, FIRST_CHUNK);

    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.getByText(`Run ${RUN_ID} is streaming`)).toBeHidden();
    const roundMarker = page.locator(".at-round-marker").first();
    await expect(roundMarker).toContainText("completed");
    await expect(roundMarker).not.toContainText("running");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "rich real SSE replay should preserve non-text events inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseRuntimeCursorReconnectScenario(
  page: Page,
  options: RealSseRuntimeCursorReconnectOptions,
): Promise<void> {
  const state = createRealSseState();
  const unhandledApiRoutes: string[] = [];
  const appServer = await serveFrontendDist({
    handleRequest: (request, response) =>
      handleRuntimeCursorHttpApi(request, response, state, unhandledApiRoutes),
  });
  try {
    await installShellState(page);
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(prompt).toBeEnabled();
    await prompt.fill(PROMPT);
    await page.getByRole("button", { exact: true, name: "Send" }).click();

    const firstChunkMessage = page.locator(".at-message").filter({
      hasText: FIRST_CHUNK,
    });
    await expect(firstChunkMessage).toBeVisible();
    await expect.poll(() => state.streamRequests.some(
      (request) => request.afterEventId === "0" && request.lastEventId === "2",
    )).toBe(true);
    await expect.poll(() => state.streamRequests.some(
      (request) => request.afterEventId === "2",
    )).toBe(true);
    await expect(page.getByText(RUNTIME_CURSOR_RESUMED_CHUNK)).toBeVisible();
    await expect(page.locator(".at-message").filter({ hasText: FIRST_CHUNK }))
      .toHaveCount(1);
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    expect(state.runCreateCount).toBe(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "real SSE interruption should reconnect from the runtime cursor inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function runRealSseBackgroundSubagentScenario(
  page: Page,
  options: RealSseBackgroundSubagentOptions,
): Promise<void> {
  const state = createRealSseState({
    backgroundSubagentRecovery: true,
    lastEventId: options.mode === "background-subagent-multiplex" ? 5 : 7,
    runCreated: true,
    shouldShowRecover: options.mode === "background-subagent-only",
  });
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRealSseApi(context, state, options.mode),
      sessionTitle: "TS real SSE background subagent",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);

    if (options.mode === "background-subagent-multiplex") {
      await expect.poll(() => state.multiplexRequests).toEqual([
        {
          lastEventId: null,
          runOffsets: {
            [RUN_ID]: "5",
            [SUBAGENT_RUN_ID]: "0",
          },
        },
      ]);
      await expectTimelineTextVisible(page, MAIN_MULTIPLEX_CHUNK);
    } else {
      await expect.poll(() => state.subagentStreamRequests).toEqual([
        {
          afterEventId: "0",
          lastEventId: null,
        },
      ]);
      expect(state.multiplexRequests).toEqual([]);
      expect(state.streamRequests).toEqual([]);
    }

    await expectTimelineTextVisible(page, SUBAGENT_MULTIPLEX_CHUNK);
    await expect(page.getByRole("button", { exact: true, name: "Stop" })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { exact: true, name: "Send" })).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Queue" })).toBeHidden();
    await expect(
      page.getByRole("button", { exact: true, name: "Interrupt" }),
    ).toBeHidden();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      `${options.mode} should keep recovered subagent output inside the fixed shell`,
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath(options.screenshotName, SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
}

async function handleRealSseApi(
  context: MockApiRouteContext,
  state: RealSseState,
  mode:
    | RealSseActiveControlOptions["mode"]
    | RealSseBackgroundSubagentOptions["mode"]
    | RealSseDuplicateReplayOptions["mode"]
    | RealSseRecoveryActionOptions["mode"]
    | RealSseRefreshRecoveryOptions["mode"]
    | RealSseRichReplayOptions["mode"]
    | RealSseRuntimeCursorReconnectOptions["mode"]
    | RealSseScenarioOptions["mode"]
    | RealSseStandaloneResumeOptions["mode"]
    | RealSseTerminalOptions["mode"],
): Promise<boolean> {
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    state.runCreated = true;
    state.runCreateCount += 1;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(realSsePersistedMessages(state));
    return true;
  }
  if (
    mode === "rich-replay" &&
    context.method === "GET" &&
    context.path === `/sessions/${SESSION_ID}/rounds`
  ) {
    await context.fulfillJson(realSseRounds(state));
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(state));
    return true;
  }
  if (
    mode === "background-subagent-multiplex" &&
    context.method === "GET" &&
    context.path === "/ag-ui/runs/events"
  ) {
    state.multiplexRequests.push({
      lastEventId: context.route.request().headers()["last-event-id"] ?? null,
      runOffsets: runOffsetsFromSearchParams(context.url.searchParams),
    });
    await context.route.fulfill({
      body: backgroundSubagentMultiplexSseFrames(),
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
      status: 200,
    });
    state.completed = true;
    state.backgroundSubagentRecovery = false;
    state.lastEventId = 7;
    return true;
  }
  if (
    mode === "background-subagent-only" &&
    context.method === "GET" &&
    context.path === `/ag-ui/runs/${SUBAGENT_RUN_ID}/events`
  ) {
    state.subagentStreamRequests.push({
      afterEventId: context.url.searchParams.get("after_event_id"),
      lastEventId: context.route.request().headers()["last-event-id"] ?? null,
    });
    await context.route.fulfill({
      body: backgroundSubagentOnlySseFrames(),
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
      status: 200,
    });
    state.backgroundSubagentRecovery = false;
    return true;
  }
  if (context.method === "GET" && context.path === `/ag-ui/runs/${RUN_ID}/events`) {
    state.streamRequests.push({
      afterEventId: context.url.searchParams.get("after_event_id"),
      lastEventId: context.route.request().headers()["last-event-id"] ?? null,
    });
    state.requestSequence.push("stream");
    const afterEventId = context.url.searchParams.get("after_event_id");
    if (mode === "refresh-recovery" && afterEventId === "0") {
      state.lastEventId = 2;
      state.persistedAssistantText = FIRST_CHUNK;
    }
    if (mode === "duplicate-replay" && afterEventId === "0") {
      state.lastEventId = 2;
    }
    if (mode === "rich-replay" && afterEventId === "0") {
      state.lastEventId = 2;
    }
    if (mode === "runtime-cursor-reconnect" && afterEventId === "0") {
      state.lastEventId = 2;
    }
    const completeRefreshAfterFulfill =
      mode === "refresh-recovery" && afterEventId === "2";
    const completeDuplicateReplayAfterFulfill =
      mode === "duplicate-replay" && afterEventId === "2";
    const completeRichReplayAfterFulfill =
      mode === "rich-replay" && afterEventId === "2";
    const completeRuntimeCursorAfterFulfill =
      mode === "runtime-cursor-reconnect" && afterEventId === "2";
    if (mode === "recovery-approval" || mode === "recovery-question") {
      state.completed = true;
      state.lastEventId = 10;
    }
    await context.route.fulfill({
      body: sseBody(mode, afterEventId),
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
      status: 200,
    });
    if (completeRefreshAfterFulfill) {
      state.completed = true;
      state.lastEventId = 4;
    }
    if (completeDuplicateReplayAfterFulfill) {
      state.completed = true;
      state.lastEventId = 4;
    }
    if (completeRichReplayAfterFulfill) {
      state.completed = true;
      state.lastEventId = 27;
    }
    if (completeRuntimeCursorAfterFulfill) {
      state.completed = true;
      state.lastEventId = 4;
    }
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}:resume`) {
    state.resumeRequests.push(RUN_ID);
    state.requestSequence.push("resume");
    state.runCreated = true;
    state.shouldShowRecover = false;
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      status: "ok",
    });
    return true;
  }
  if (
    context.method === "POST" &&
    context.path === `/ag-ui/runs/${RUN_ID}/tool-approvals/${TOOL_CALL_ID}:resolve`
  ) {
    state.approvalResolutions.push({
      payload: requestPayload(context),
      runId: RUN_ID,
    });
    state.pendingToolApproval = false;
    state.requestSequence.push("approval");
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (
    context.method === "POST" &&
    context.path === `/ag-ui/runs/${RUN_ID}/questions/${QUESTION_ID}:answer`
  ) {
    state.questionAnswers.push({
      payload: requestPayload(context),
      runId: RUN_ID,
    });
    state.pendingUserQuestion = false;
    state.requestSequence.push("question");
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}:stop`) {
    state.stopRequests.push(requestPayload(context));
    await context.fulfillJson({ scope: "main", status: "ok" });
    return true;
  }
  if (context.method === "POST" && context.path === `/ag-ui/runs/${RUN_ID}/inject`) {
    const payload = requestPayload(context);
    state.injectionRequests.push(readInjectionRequest(payload));
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  return false;
}

async function handleRuntimeCursorHttpApi(
  request: IncomingMessage,
  response: ServerResponse,
  state: RealSseState,
  unhandledApiRoutes: string[],
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/")) {
    return false;
  }
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method ?? "GET";
  if (method === "POST" && path === "/ag-ui/runs") {
    state.runCreated = true;
    state.runCreateCount += 1;
    sendJson(response, {
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id: null,
    });
    return true;
  }
  if (method === "GET" && path === `/ag-ui/runs/${RUN_ID}/events`) {
    handleRuntimeCursorSse(request, response, state, url);
    return true;
  }
  if (method !== "GET") {
    sendJson(response, { status: "ok" });
    return true;
  }
  if (path === "/system/health" || path === "/system/live") {
    sendJson(response, { status: "ok" });
    return true;
  }
  if (path === "/system/control-plane") {
    sendJson(response, { enabled: false });
    return true;
  }
  if (path === "/system/configs/ui-language") {
    sendJson(response, { language: "zh-CN" });
    return true;
  }
  if (path === "/system/configs/general") {
    sendJson(response, { shell_safety_policy_enabled: true });
    return true;
  }
  if (path === "/speech/config") {
    sendJson(response, {
      configured: false,
      language: "zh-CN",
      supported_models: [],
    });
    return true;
  }
  if (path === "/workspaces") {
    sendJson(response, [
      {
        display_name: "agent-teams",
        last_session_id: SESSION_ID,
        path: "C:/Users/yex/Documents/workspace/agent-teams",
        updated_at: "2026-06-25T08:00:00Z",
        workspace_id: WORKSPACE_ID,
      },
    ]);
    return true;
  }
  if (path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    sendJson(response, {
      has_more: false,
      items: [runtimeCursorSidebarSession()],
      next_cursor: null,
    });
    return true;
  }
  if (path === "/sessions/sidebar") {
    sendJson(response, [runtimeCursorSidebarSession()]);
    return true;
  }
  if (path === `/sessions/${SESSION_ID}`) {
    sendJson(response, {
      can_switch_mode: true,
      created_at: "2026-06-25T08:00:00Z",
      normal_model_profile: null,
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_id: SESSION_ID,
      session_mode: "normal",
      title: "TS real SSE cursor reconnect",
      updated_at: "2026-06-25T08:30:00Z",
      workspace_id: WORKSPACE_ID,
    });
    return true;
  }
  if (
    path === `/sessions/${SESSION_ID}/messages` ||
    path === `/sessions/${SESSION_ID}/subagents` ||
    path === `/sessions/${SESSION_ID}/agents` ||
    path === `/sessions/${SESSION_ID}/tasks` ||
    path === "/automation/projects"
  ) {
    sendJson(response, []);
    return true;
  }
  if (path === `/sessions/${SESSION_ID}/rounds`) {
    sendJson(response, { has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (path === `/sessions/${SESSION_ID}/recovery`) {
    sendJson(response, recoverySnapshot(state));
    return true;
  }
  if (path === `/sessions/${SESSION_ID}/token-usage`) {
    sendJson(response, { by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  if (path === "/roles:options") {
    sendJson(response, {
      coordinator_role: {
        description: "Coordinates delegated work.",
        name: "Coordinator",
        role_id: "Coordinator",
      },
      coordinator_role_id: "Coordinator",
      main_agent_role: {
        description: "Handles primary chat work.",
        name: "Main Agent",
        role_id: "MainAgent",
      },
      main_agent_role_id: "MainAgent",
      normal_mode_roles: [
        {
          description: "Default chat role.",
          name: "Default",
          role_id: "MainAgent",
        },
      ],
      subagent_roles: [],
    });
    return true;
  }
  if (path === "/system/configs/model/profiles") {
    sendJson(response, {
      default: {
        is_default: true,
        model: "gpt-4o-mini",
        provider: "openai",
      },
    });
    return true;
  }
  if (path === "/system/configs/orchestration") {
    sendJson(response, {
      default_orchestration_preset_id: "team",
      presets: [
        {
          name: "Team",
          orchestration_prompt: "Coordinate delegated work.",
          preset_id: "team",
          role_ids: ["MainAgent"],
        },
      ],
    });
    return true;
  }
  unhandledApiRoutes.push(`${method} ${path}${url.search}`);
  sendJson(response, { detail: `Unhandled real SSE HTTP route: ${path}` }, 404);
  return true;
}

function handleRuntimeCursorSse(
  request: IncomingMessage,
  response: ServerResponse,
  state: RealSseState,
  url: URL,
): void {
  const afterEventId = url.searchParams.get("after_event_id") ?? "0";
  const lastEventIdHeader = request.headers["last-event-id"];
  const lastEventId = Array.isArray(lastEventIdHeader)
    ? lastEventIdHeader[0] ?? null
    : lastEventIdHeader ?? null;
  state.streamRequests.push({
    afterEventId,
    lastEventId,
  });
  state.requestSequence.push("stream");
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  if (afterEventId === "2") {
    response.write(sseFrame({
      data: runEvent({
        eventId: 3,
        payload: { text: RUNTIME_CURSOR_RESUMED_CHUNK },
        relayEventType: "text_delta",
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 3,
    }));
    response.write(sseFrame({
      data: runEvent({
        eventId: 4,
        payload: { status: "completed" },
        relayEventType: "run_completed",
        type: "run.completed",
      }),
      event: "run.completed",
      id: 4,
    }));
    state.completed = true;
    state.lastEventId = 4;
    response.end();
    return;
  }
  if (lastEventId === "2") {
    response.write("retry: 60000\n\n");
    response.end();
    return;
  }
  state.lastEventId = 2;
  response.write("retry: 100\n\n");
  response.write(sseFrame({
    data: runEvent({
      eventId: 1,
      payload: { phase: "streaming" },
      relayEventType: "run_started",
      type: "run.started",
    }),
    event: "run.started",
    id: 1,
  }));
  response.write(sseFrame({
    data: runEvent({
      eventId: 2,
      payload: { text: FIRST_CHUNK },
      relayEventType: "text_delta",
      type: "message.text.delta",
    }),
    event: "message.text.delta",
    id: 2,
  }));
  response.end();
}

function runtimeCursorSidebarSession(): Record<string, unknown> {
  return {
    active_run_status: null,
    created_at: "2026-06-25T08:00:00Z",
    message_count: 2,
    session_id: SESSION_ID,
    title: "TS real SSE cursor reconnect",
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function sendJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function recoverySnapshot(state: RealSseState): Record<string, unknown> {
  return {
    active_run: state.runCreated && !state.completed
      ? {
          last_event_id: state.lastEventId,
          pending_tool_approval_count: state.pendingToolApproval ? 1 : 0,
          pending_user_question_count: state.pendingUserQuestion ? 1 : 0,
          phase: recoveryPhase(state),
          run_id: RUN_ID,
          session_id: SESSION_ID,
          should_show_recover: state.shouldShowRecover,
          status: state.shouldShowRecover ? "stopped" : "running",
          stream_connected: false,
        }
      : null,
    background_tasks: state.backgroundSubagentRecovery
      ? [backgroundSubagentTaskRecord()]
      : [],
    paused_subagent: null,
    pending_tool_approvals: state.pendingToolApproval ? [toolApprovalRecord()] : [],
    pending_user_questions: state.pendingUserQuestion ? [userQuestionRecord()] : [],
    round_snapshot: null,
  };
}

function recoveryPhase(state: RealSseState): string {
  if (!state.shouldShowRecover) {
    return "streaming";
  }
  if (state.pendingToolApproval) {
    return "awaiting_tool_approval";
  }
  if (state.pendingUserQuestion) {
    return "awaiting_user_question";
  }
  return "stopped";
}

function backgroundSubagentTaskRecord(): Record<string, unknown> {
  return {
    background_task_id: BACKGROUND_TASK_ID,
    command: "reviewer subagent",
    cwd: "C:/Users/yex/Documents/workspace/agent-teams",
    execution_mode: "background",
    kind: "subagent",
    recent_output: ["reviewing recovered stream"],
    role_id: "reviewer",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    status: "running",
    subagent_run_id: SUBAGENT_RUN_ID,
    title: "reviewer subagent",
  };
}

function sseBody(
  mode:
    | RealSseActiveControlOptions["mode"]
    | RealSseBackgroundSubagentOptions["mode"]
    | RealSseDuplicateReplayOptions["mode"]
    | RealSseRecoveryActionOptions["mode"]
    | RealSseRefreshRecoveryOptions["mode"]
    | RealSseRichReplayOptions["mode"]
    | RealSseRuntimeCursorReconnectOptions["mode"]
    | RealSseScenarioOptions["mode"]
    | RealSseStandaloneResumeOptions["mode"]
    | RealSseTerminalOptions["mode"],
  afterEventId: string | null = null,
): string {
  if (mode === "server-error") {
    return sseFrame({
      data: { error: STREAM_UNAVAILABLE },
      event: "error",
    });
  }
  if (mode === "run-failed" || mode === "run-stopped") {
    const failed = mode === "run-failed";
    return [
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
      sseFrame({
        data: runEvent({
          eventId: 3,
          payload: {
            message: failed ? FAILURE_MESSAGE : STOPPED_MESSAGE,
            root_task_id: "root-ts-real-sse-terminal",
            status: failed ? "failed" : "stopped",
          },
          relayEventType: failed ? "run_failed" : "run_stopped",
          type: failed ? "run.failed" : "run.stopped",
        }),
        event: failed ? "run.failed" : "run.stopped",
        id: 3,
      }),
    ].join("");
  }
  if (
    mode === "recoverable-resume" ||
    mode === "recovery-approval" ||
    mode === "recovery-question"
  ) {
    return [
      sseFrame({
        data: runEvent({
          eventId: 8,
          payload: { phase: "streaming" },
          relayEventType: "run_resumed",
          type: "run.resumed",
        }),
        event: "run.resumed",
        id: 8,
      }),
      sseFrame({
        data: runEvent({
          eventId: 9,
          payload: { text: RECOVERY_ACTION_RESUMED_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 9,
      }),
      sseFrame({
        data: runEvent({
          eventId: 10,
          payload: { status: "completed" },
          relayEventType: "run_completed",
          type: "run.completed",
        }),
        event: "run.completed",
        id: 10,
      }),
    ].join("");
  }
  if (mode === "refresh-recovery") {
    if (afterEventId === "2") {
      return [
        sseFrame({
          data: runEvent({
            eventId: 3,
            payload: { text: REFRESH_RESUMED_CHUNK },
            relayEventType: "text_delta",
            type: "message.text.delta",
          }),
          event: "message.text.delta",
          id: 3,
        }),
        sseFrame({
          data: runEvent({
            eventId: 4,
            payload: { status: "completed" },
            relayEventType: "run_completed",
            type: "run.completed",
          }),
          event: "run.completed",
          id: 4,
        }),
      ].join("");
    }
    return [
      "retry: 60000\n\n",
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
    ].join("");
  }
  if (mode === "duplicate-replay") {
    if (afterEventId === "2") {
      return [
        sseFrame({
          data: runEvent({
            eventId: 2,
            payload: { text: FIRST_CHUNK },
            relayEventType: "text_delta",
            type: "message.text.delta",
          }),
          event: "message.text.delta",
          id: 2,
        }),
        sseFrame({
          data: runEvent({
            eventId: 3,
            payload: { text: DUPLICATE_REPLAY_CHUNK },
            relayEventType: "text_delta",
            type: "message.text.delta",
          }),
          event: "message.text.delta",
          id: 3,
        }),
        sseFrame({
          data: runEvent({
            eventId: 4,
            payload: { status: "completed" },
            relayEventType: "run_completed",
            type: "run.completed",
          }),
          event: "run.completed",
          id: 4,
        }),
      ].join("");
    }
    return [
      "retry: 60000\n\n",
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
    ].join("");
  }
  if (mode === "rich-replay") {
    if (afterEventId === "2") {
      return richReplaySseFrames();
    }
    return [
      "retry: 60000\n\n",
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
    ].join("");
  }
  if (mode === "runtime-cursor-reconnect") {
    if (afterEventId === "2") {
      return [
        sseFrame({
          data: runEvent({
            eventId: 3,
            payload: { text: RUNTIME_CURSOR_RESUMED_CHUNK },
            relayEventType: "text_delta",
            type: "message.text.delta",
          }),
          event: "message.text.delta",
          id: 3,
        }),
        sseFrame({
          data: runEvent({
            eventId: 4,
            payload: { status: "completed" },
            relayEventType: "run_completed",
            type: "run.completed",
          }),
          event: "run.completed",
          id: 4,
        }),
      ].join("");
    }
    return [
      "retry: 100\n\n",
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
    ].join("");
  }
  if (mode === "active-inject" || mode === "active-stop") {
    return [
      sseFrame({
        data: runEvent({
          eventId: 1,
          payload: { phase: "streaming" },
          relayEventType: "run_started",
          type: "run.started",
        }),
        event: "run.started",
        id: 1,
      }),
      sseFrame({
        data: runEvent({
          eventId: 2,
          payload: { text: FIRST_CHUNK },
          relayEventType: "text_delta",
          type: "message.text.delta",
        }),
        event: "message.text.delta",
        id: 2,
      }),
    ].join("");
  }
  return [
    sseFrame({
      data: runEvent({
        eventId: 1,
        payload: { phase: "streaming" },
        relayEventType: "run_started",
        type: "run.started",
      }),
      event: "run.started",
      id: 1,
    }),
    sseFrame({
      data: runEvent({
        eventId: 2,
        payload: { text: FIRST_CHUNK },
        relayEventType: "text_delta",
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 2,
    }),
    sseFrame({
      data: { ok: true },
      event: "message.text.delta",
    }),
  ].join("");
}

function backgroundSubagentMultiplexSseFrames(): string {
  return [
    sseFrame({
      data: runEvent({
        eventId: 6,
        payload: { text: MAIN_MULTIPLEX_CHUNK },
        relayEventType: "text_delta",
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 6,
    }),
    sseFrame({
      data: runEvent({
        eventId: 2,
        payload: { text: SUBAGENT_MULTIPLEX_CHUNK },
        relayEventType: "text_delta",
        roleId: "reviewer",
        runId: SUBAGENT_RUN_ID,
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 2,
    }),
    sseFrame({
      data: runEvent({
        eventId: 7,
        payload: { status: "completed" },
        relayEventType: "run_completed",
        type: "run.completed",
      }),
      event: "run.completed",
      id: 7,
    }),
    sseFrame({
      data: runEvent({
        eventId: 4,
        payload: { status: "completed" },
        relayEventType: "run_completed",
        roleId: "reviewer",
        runId: SUBAGENT_RUN_ID,
        type: "run.completed",
      }),
      event: "run.completed",
      id: 4,
    }),
  ].join("");
}

function backgroundSubagentOnlySseFrames(): string {
  return [
    sseFrame({
      data: runEvent({
        eventId: 1,
        payload: { text: SUBAGENT_MULTIPLEX_CHUNK },
        relayEventType: "text_delta",
        roleId: "reviewer",
        runId: SUBAGENT_RUN_ID,
        type: "message.text.delta",
      }),
      event: "message.text.delta",
      id: 1,
    }),
    sseFrame({
      data: runEvent({
        eventId: 2,
        payload: { status: "completed" },
        relayEventType: "run_completed",
        roleId: "reviewer",
        runId: SUBAGENT_RUN_ID,
        type: "run.completed",
      }),
      event: "run.completed",
      id: 2,
    }),
  ].join("");
}

function richReplaySseFrames(): string {
  return [
    sseFrame({
      data: runEvent({
        eventId: 3,
        payload: { part_index: 0 },
        relayEventType: "thinking_started",
        type: "thinking.started",
      }),
      event: "thinking.started",
      id: 3,
    }),
    sseFrame({
      data: runEvent({
        eventId: 4,
        payload: { delta: RICH_REPLAY_THINKING, part_index: 0 },
        relayEventType: "thinking_delta",
        type: "thinking.delta",
      }),
      event: "thinking.delta",
      id: 4,
    }),
    sseFrame({
      data: runEvent({
        eventId: 5,
        payload: {
          args: { path: "README.md" },
          tool_call_id: RICH_REPLAY_TOOL_CALL_ID,
          tool_name: "read",
        },
        relayEventType: "tool_call",
        type: "tool_call.started",
      }),
      event: "tool_call.started",
      id: 5,
    }),
    sseFrame({
      data: runEvent({
        eventId: 6,
        payload: {
          result: { data: RICH_REPLAY_TOOL_OUTPUT, ok: true },
          tool_call_id: RICH_REPLAY_TOOL_CALL_ID,
          tool_name: "read",
        },
        relayEventType: "tool_result",
        type: "tool_result.completed",
      }),
      event: "tool_result.completed",
      id: 6,
    }),
    sseFrame({
      data: runEvent({
        eventId: 7,
        payload: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
        relayEventType: "token_usage",
        type: "token_usage.updated",
      }),
      event: "token_usage.updated",
      id: 7,
    }),
    sseFrame({
      data: runEvent({
        eventId: 8,
        payload: { summary: RICH_REPLAY_MODEL_STEP },
        relayEventType: "model_step_started",
        type: "model_step.started",
      }),
      event: "model_step.started",
      id: 8,
    }),
    sseFrame({
      data: runEvent({
        eventId: 9,
        payload: { summary: `${RICH_REPLAY_MODEL_STEP} finished` },
        relayEventType: "model_step_finished",
        type: "model_step.finished",
      }),
      event: "model_step.finished",
      id: 9,
    }),
    sseFrame({
      data: runEvent({
        eventId: 10,
        payload: { summary: RICH_REPLAY_STATE_SNAPSHOT },
        relayEventType: "state_snapshot",
        type: "state.snapshot",
      }),
      event: "state.snapshot",
      id: 10,
    }),
    sseFrame({
      data: runEvent({
        eventId: 11,
        payload: { summary: RICH_REPLAY_STATE_DELTA },
        relayEventType: "state_delta",
        type: "state.delta",
      }),
      event: "state.delta",
      id: 11,
    }),
    sseFrame({
      data: runEvent({
        eventId: 12,
        payload: {
          items: [
            { content: "inspect replay hydration", status: "completed" },
            { content: RICH_REPLAY_TODO_CURRENT, status: "in_progress" },
            { content: "capture replay evidence", status: "pending" },
          ],
          run_id: RUN_ID,
          session_id: SESSION_ID,
          updated_by_instance_id: "replay-agent",
          version: 4,
        },
        relayEventType: "todo_updated",
        type: "todo.updated",
      }),
      event: "todo.updated",
      id: 12,
    }),
    sseFrame({
      data: runEvent({
        eventId: 13,
        payload: { title: RICH_REPLAY_NOTIFICATION },
        relayEventType: "notification_requested",
        type: "notification.requested",
      }),
      event: "notification.requested",
      id: 13,
    }),
    sseFrame({
      data: runEvent({
        eventId: 14,
        payload: { status: "running", title: RICH_REPLAY_SUBAGENT_STATUS },
        relayEventType: "subagent_session_status_changed",
        type: "subagent_session.status_changed",
      }),
      event: "subagent_session.status_changed",
      id: 14,
    }),
    sseFrame({
      data: runEvent({
        eventId: 15,
        payload: { title: RICH_REPLAY_BACKGROUND_TASK },
        relayEventType: "background_task_started",
        type: "background_task.started",
      }),
      event: "background_task.started",
      id: 15,
    }),
    sseFrame({
      data: runEvent({
        eventId: 16,
        payload: {
          content: RICH_REPLAY_INJECTION,
          delivery_mode: "queued",
          recipient_instance_id: "replay-agent",
          source: "user",
        },
        relayEventType: "injection_enqueued",
        type: "injection.enqueued",
      }),
      event: "injection.enqueued",
      id: 16,
    }),
    sseFrame({
      data: runEvent({
        eventId: 17,
        payload: {
          content: RICH_REPLAY_INJECTION_APPLIED,
          internal_delivery_mode: "guidance",
          recipient_instance_id: "replay-agent",
          source: "system",
        },
        relayEventType: "injection_applied",
        type: "injection.applied",
      }),
      event: "injection.applied",
      id: 17,
    }),
    sseFrame({
      data: runEvent({
        eventId: 18,
        payload: {
          question_id: RICH_REPLAY_QUESTION_ID,
          questions: [{ question: RICH_REPLAY_QUESTION }],
        },
        relayEventType: "user_question_requested",
        type: "user_question.requested",
      }),
      event: "user_question.requested",
      id: 18,
    }),
    sseFrame({
      data: runEvent({
        eventId: 19,
        payload: {
          answers: [{ selections: [{ label: "Continue" }] }],
          question_id: RICH_REPLAY_QUESTION_ID,
        },
        relayEventType: "user_question_answered",
        type: "user_question.answered",
      }),
      event: "user_question.answered",
      id: 19,
    }),
    sseFrame({
      data: runEvent({
        eventId: 20,
        payload: {
          instance_id: "subagent-rich",
          reason: "stopped_by_user",
          role_id: "reviewer",
          task_id: "task-rich",
        },
        relayEventType: "subagent_stopped",
        type: "subagent.stopped",
      }),
      event: "subagent.stopped",
      id: 20,
    }),
    sseFrame({
      data: runEvent({
        eventId: 21,
        payload: {
          instance_id: "subagent-rich",
          role_id: "reviewer",
          task_id: "task-rich",
        },
        relayEventType: "subagent_resumed",
        type: "subagent.resumed",
      }),
      event: "subagent.resumed",
      id: 21,
    }),
    sseFrame({
      data: runEvent({
        eventId: 22,
        payload: { root_task_id: "root-rich" },
        relayEventType: "awaiting_manual_action",
        type: "run.awaiting_manual_action",
      }),
      event: "run.awaiting_manual_action",
      id: 22,
    }),
    sseFrame({
      data: runEvent({
        eventId: 23,
        payload: {
          output: [
            { kind: "text", text: RICH_REPLAY_OUTPUT_TEXT },
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: RICH_REPLAY_OUTPUT_IMAGE,
              url: RICH_REPLAY_OUTPUT_IMAGE_URL,
            },
          ],
        },
        relayEventType: "output_delta",
        type: "message.output.delta",
      }),
      event: "message.output.delta",
      id: 23,
    }),
    sseFrame({
      data: runEvent({
        eventId: 24,
        payload: {
          details: RICH_REPLAY_VALIDATION_DETAILS,
          reason: RICH_REPLAY_VALIDATION_REASON,
          tool_call_id: "call-ts-rich-validation",
          tool_name: "execute_command",
        },
        relayEventType: "tool_input_validation_failed",
        type: "tool_call.validation_failed",
      }),
      event: "tool_call.validation_failed",
      id: 24,
    }),
    sseFrame({
      data: runEvent({
        eventId: 25,
        payload: { part_index: 0 },
        relayEventType: "thinking_finished",
        type: "thinking.finished",
      }),
      event: "thinking.finished",
      id: 25,
    }),
    sseFrame({
      data: runEvent({
        eventId: 27,
        payload: { status: "completed" },
        relayEventType: "run_completed",
        type: "run.completed",
      }),
      event: "run.completed",
      id: 27,
    }),
  ].join("");
}

function createRealSseState(overrides: Partial<RealSseState> = {}): RealSseState {
  return {
    approvalResolutions: [],
    backgroundSubagentRecovery: false,
    completed: false,
    injectionRequests: [],
    lastEventId: 0,
    multiplexRequests: [],
    pendingToolApproval: false,
    pendingUserQuestion: false,
    persistedAssistantText: "",
    questionAnswers: [],
    requestSequence: [],
    resumeRequests: [],
    runCreated: false,
    runCreateCount: 0,
    shouldShowRecover: false,
    stopRequests: [],
    streamRequests: [],
    subagentStreamRequests: [],
    ...overrides,
  };
}

function realSsePersistedMessages(state: RealSseState): Record<string, unknown>[] {
  if (!state.persistedAssistantText.trim()) {
    return [];
  }
  return [
    {
      message: {
        parts: [
          {
            content: state.persistedAssistantText,
            part_kind: "text",
          },
        ],
      },
      message_id: "real-sse-refresh-hydrated",
      role_id: "MainAgent",
      run_id: RUN_ID,
    },
  ];
}

function realSseRounds(state: RealSseState): Record<string, unknown> {
  return {
    has_more: false,
    items: [
      {
        coordinator_messages: [
          {
            message: {
              parts: [{ part_kind: "tool-call", tool_name: "read" }],
              usage: { input_tokens: 11, output_tokens: 7 },
            },
          },
        ],
        created_at: "2026-06-26T12:00:00Z",
        run_id: RUN_ID,
        run_phase: state.completed ? "completed" : "streaming",
        run_started_at: "2026-06-26T12:00:00Z",
        run_status: state.completed ? "completed" : "running",
        run_updated_at: state.completed
          ? "2026-06-26T12:00:27Z"
          : "2026-06-26T12:00:02Z",
        run_user_message: PROMPT,
      },
    ],
    next_cursor: null,
  };
}

async function expectTimelineTextVisible(page: Page, text: string): Promise<void> {
  const locator = page.getByText(text).first();
  if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
    return;
  }
  const maxScroll = await page.evaluate(() => {
    const timeline = document.querySelector(".at-timeline");
    if (!(timeline instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(0, timeline.scrollHeight - timeline.clientHeight);
  });
  for (const ratio of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    await page.evaluate((scrollTop) => {
      const timeline = document.querySelector(".at-timeline");
      if (!(timeline instanceof HTMLElement)) {
        return;
      }
      timeline.scrollTop = scrollTop;
      timeline.dispatchEvent(new Event("scroll"));
    }, Math.round(maxScroll * ratio));
    await page.waitForTimeout(150);
    if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
      return;
    }
  }
  await expect(locator).toBeVisible();
}

async function expectTimelineSelectorVisible(
  page: Page,
  selector: string,
): Promise<Locator> {
  const locator = page.locator(selector).first();
  if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
    return locator;
  }
  const maxScroll = await page.evaluate(() => {
    const timeline = document.querySelector(".at-timeline");
    if (!(timeline instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(0, timeline.scrollHeight - timeline.clientHeight);
  });
  for (const ratio of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    await page.evaluate((scrollTop) => {
      const timeline = document.querySelector(".at-timeline");
      if (!(timeline instanceof HTMLElement)) {
        return;
      }
      timeline.scrollTop = scrollTop;
      timeline.dispatchEvent(new Event("scroll"));
    }, Math.round(maxScroll * ratio));
    await page.waitForTimeout(150);
    if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
      return locator;
    }
  }
  await expect(locator).toBeVisible();
  return locator;
}

function countOccurrences(value: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return value.split(needle).length - 1;
}

function sequenceIndex(state: RealSseState, item: string): number {
  const index = state.requestSequence.indexOf(item);
  expect(index, `Expected request sequence to include ${item}`).toBeGreaterThanOrEqual(0);
  return index;
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
    args_preview: '{"cmd":"npm test"}',
    role_id: "MainAgent",
    status: "pending",
    tool_call_id: TOOL_CALL_ID,
    tool_name: "execute_command",
  };
}

function userQuestionRecord(): Record<string, unknown> {
  return {
    question_id: QUESTION_ID,
    questions: [
      {
        multiple: true,
        options: [
          {
            description: "Deploy now",
            label: "Ship",
          },
          {
            label: "__none_of_the_above__",
          },
        ],
        placeholder: "Add handoff detail",
        question: "Pick the handoff mode",
      },
    ],
    role_id: "Planner",
    run_id: RUN_ID,
    status: "pending",
  };
}

function requestPayload(context: MockApiRouteContext): unknown {
  const postData = context.route.request().postData();
  if (postData === null || postData.trim().length === 0) {
    return null;
  }
  return JSON.parse(postData) as unknown;
}

function runOffsetsFromSearchParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const runIds = searchParams.getAll("run_id");
  const afterEventIds = searchParams.getAll("after_event_id");
  const offsets: Record<string, string> = {};
  for (const [index, runId] of runIds.entries()) {
    offsets[runId] = afterEventIds[index] ?? "0";
  }
  return offsets;
}

function readInjectionRequest(payload: unknown): RealSseInjectionRequest {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  return {
    content: record.content,
    mode: record.mode,
  };
}

interface SseFrameOptions {
  data: unknown;
  event: string;
  id?: number;
}

function sseFrame(options: SseFrameOptions): string {
  const lines = [];
  if (options.id !== undefined) {
    lines.push(`id: ${options.id}`);
  }
  lines.push(`event: ${options.event}`);
  lines.push(`data: ${JSON.stringify(options.data)}`);
  return `${lines.join("\n")}\n\n`;
}

interface RunEventOptions {
  eventId: number;
  payload: Record<string, unknown>;
  relayEventType: string;
  roleId?: string;
  runId?: string;
  type: string;
}

function runEvent(options: RunEventOptions): Record<string, unknown> {
  const second = String(options.eventId % 60).padStart(2, "0");
  return {
    event_id: options.eventId,
    occurred_at: `2026-06-26T12:00:${second}Z`,
    payload: options.payload,
    relay_event_type: options.relayEventType,
    role_id: options.roleId ?? "MainAgent",
    run_id: options.runId ?? RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-real-sse-stale",
    type: options.type,
  };
}
