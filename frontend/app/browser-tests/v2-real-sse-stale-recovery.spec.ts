import { expect, test, type Page } from "@playwright/test";

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
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-ts-real-sse-stale";
const SCREENSHOT_FOLDER = "frontend-v2-ts-stream";
const PROMPT = "Real SSE stale recovery probe";
const FIRST_CHUNK = "Real SSE chunk before malformed frame.";
const DUPLICATE_REPLAY_CHUNK = "real SSE after duplicate replay";
const FAILURE_MESSAGE = "real SSE provider failed before completion";
const QUEUED_INJECTION = "real SSE queued follow-up";
const INTERRUPT_INJECTION = "real SSE interrupt follow-up";
const RECOVERY_ACTION_FEEDBACK = "Use the existing TS browser command.";
const RECOVERY_ACTION_LAST_EVENT_ID = 7;
const RECOVERY_ACTION_RESUMED_CHUNK = "real SSE recovery action resumed chunk";
const RECOVERY_QUESTION_SUPPLEMENT = "Need release note coverage";
const REFRESH_RESUMED_CHUNK = "real SSE refresh resumed chunk";
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
  completed: boolean;
  injectionRequests: RealSseInjectionRequest[];
  lastEventId: number;
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

async function handleRealSseApi(
  context: MockApiRouteContext,
  state: RealSseState,
  mode:
    | RealSseActiveControlOptions["mode"]
    | RealSseDuplicateReplayOptions["mode"]
    | RealSseRecoveryActionOptions["mode"]
    | RealSseRefreshRecoveryOptions["mode"]
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
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(recoverySnapshot(state));
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
    const completeRefreshAfterFulfill =
      mode === "refresh-recovery" && afterEventId === "2";
    const completeDuplicateReplayAfterFulfill =
      mode === "duplicate-replay" && afterEventId === "2";
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
    background_tasks: [],
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

function sseBody(
  mode:
    | RealSseActiveControlOptions["mode"]
    | RealSseDuplicateReplayOptions["mode"]
    | RealSseRecoveryActionOptions["mode"]
    | RealSseRefreshRecoveryOptions["mode"]
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

function createRealSseState(overrides: Partial<RealSseState> = {}): RealSseState {
  return {
    approvalResolutions: [],
    completed: false,
    injectionRequests: [],
    lastEventId: 0,
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
  type: string;
}

function runEvent(options: RunEventOptions): Record<string, unknown> {
  return {
    event_id: options.eventId,
    occurred_at: `2026-06-26T12:00:0${options.eventId}Z`,
    payload: options.payload,
    relay_event_type: options.relayEventType,
    role_id: "MainAgent",
    run_id: RUN_ID,
    session_id: SESSION_ID,
    trace_id: "trace-ts-real-sse-stale",
    type: options.type,
  };
}
