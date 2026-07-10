import { expect, test, type Page } from "@playwright/test";

import {
  captureStableViewportScreenshot,
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV1Shell,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-complex-replay";
const COMPLEX_RUN_ID = "run-v2-complex-replay";
const COMPLEX_PROMPT_PREFIX = "流式从头到尾慢速真实验证-1782818317613";
const COMPLEX_PROMPT =
  `${COMPLEX_PROMPT_PREFIX}：请启动一个 Explorer 子代理，只读检查下面 10 个文件，` +
  "并在子代理完成后用中文总结 6 点。";
const THINKING_TEXT = "先确认回放顺序，再读取目标文件，最后汇总。";
const TOOL_RESULT_TEXT = "src/relay_teams/skills/__init__.py exists";
const FINAL_TEXT = "复杂回放最终回答：内容顺序稳定，没有重复用户消息。";

interface FinalAnswerActionMetrics {
  actionButtonCount: number;
  actionCount: number;
  actionInsideProcessedGroup: boolean;
  actionTop: number;
  articleBottom: number;
  articleLeft: number;
  articleRight: number;
  contentBottom: number;
  contentTop: number;
  finalTextOccurrencesInAnswerArticle: number;
}

interface CollapsedRoundMetrics {
  intentHeight: number;
  intentTop: number;
  processedHeight: number;
  processedTop: number;
  scrollTop: number;
}

test("pairs V1 and V2 complex completed replay from one fixture", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installChineseLightShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleComplexReplayApi,
      sessionTitle: "复杂回放验证",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);
    await page.setViewportSize({ height: 900, width: 1280 });

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);
    await expect(page.getByText(FINAL_TEXT)).toBeVisible();
    const v1Intent = page.locator(".round-detail-intent");
    await expect(v1Intent).toHaveCount(1);
    const v1CollapsedMetrics = await v1CollapsedRoundMetrics(page);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v1-complex-replay-collapsed.png", SCREENSHOT_FOLDER),
    );
    await v1Intent.locator(".round-detail-intent-summary").click();
    await expect(v1Intent.locator(".round-detail-intent-content"))
      .toHaveText(COMPLEX_PROMPT);
    const v1Processed = page.locator("details.tool-group");
    await expect(v1Processed).toHaveCount(1);
    await v1Processed.locator(".tool-group-summary").click();
    await expect(v1Processed.locator(".thinking-block")).toHaveCount(1);
    await expect(v1Processed.locator(".tool-block")).toHaveCount(1);
    await expect.poll(() => textOccurrenceCountInV1Timeline(page, COMPLEX_PROMPT_PREFIX))
      .toBe(2);
    await expect.poll(() => textOccurrenceCountInV1Timeline(page, FINAL_TEXT))
      .toBe(1);
    await expectV1FinalAnswerActionsPlacedUnderAnswer(page);
    await expectNoDocumentScroll(page, "V1 complex replay pair should stay framed");
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v1-complex-replay.png", SCREENSHOT_FOLDER),
    );
    await v1Processed.locator(".tool-group-summary").click();
    await v1Intent.locator(".round-detail-intent-summary").click();
    await expect(v1Processed).not.toHaveAttribute("open", "");
    await expect(v1Intent).not.toHaveAttribute("open", "");
    expectCollapsedRoundMetricsStable(
      v1CollapsedMetrics,
      await v1CollapsedRoundMetrics(page),
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath(
        "runtime-pair-v1-complex-replay-collapsed-after-toggle.png",
        SCREENSHOT_FOLDER,
      ),
    );

    await page.getByRole("link", { name: "Open new interface" }).click();
    await page.waitForURL(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expectComplexReplayCollapsed(page);
    const collapsedMetrics = await collapsedRoundMetrics(page);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v2-complex-replay-collapsed.png", SCREENSHOT_FOLDER),
    );
    await expandRoundPromptAndProcessedWork(page);
    await expectComplexReplayExpanded(page);
    await expectFinalAnswerActionsPlacedUnderAnswer(page);
    await expectNoDocumentScroll(page, "V2 complex replay pair should stay framed");
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v2-complex-replay.png", SCREENSHOT_FOLDER),
    );
    await collapseRoundPromptAndProcessedWork(page);
    await expectComplexReplayCollapsed(page);
    expectCollapsedRoundMetricsStable(
      collapsedMetrics,
      await collapsedRoundMetrics(page),
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath(
        "runtime-pair-v2-complex-replay-collapsed-after-toggle.png",
        SCREENSHOT_FOLDER,
      ),
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("replays complex history without duplicated expanded round prompt after refresh", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installChineseLightShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleComplexReplayApi,
      sessionTitle: "复杂回放验证",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expectComplexReplayCollapsed(page);
    await expandRoundPromptAndProcessedWork(page);
    await expectComplexReplayExpanded(page);
    await expectFinalAnswerActionsPlacedUnderAnswer(page);
    await page.screenshot({
      path: screenshotPath("v2-complex-replay-expanded-before-refresh.png", SCREENSHOT_FOLDER),
    });

    await page.reload();
    await waitForV2Shell(page);

    await expectComplexReplayCollapsed(page);
    await expandRoundPromptAndProcessedWork(page);
    await expectComplexReplayExpanded(page);
    await expectFinalAnswerActionsPlacedUnderAnswer(page);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "complex replay and refreshed expansion should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-complex-replay-expanded-after-refresh.png", SCREENSHOT_FOLDER),
    });
    await page.screenshot({
      path: screenshotPath("v2-complex-replay-final-actions-placement.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function installChineseLightShellState(page: Page): Promise<void> {
  await installShellState(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("agentTeams.language", "zh-CN");
    window.localStorage.setItem("agentTeams.themeMode", "light");
    window.localStorage.setItem("agent_teams_theme", "light");
  });
}

async function expectComplexReplayCollapsed(page: Page): Promise<void> {
  await expect(page.getByText(FINAL_TEXT)).toBeVisible();
  await expect(page.locator(".at-session-title")).toHaveText("复杂回放验证");
  await expect(page.locator(".at-round-marker-meta")).toContainText("已完成");
  await expect(page.locator(".at-round-marker-meta")).not.toContainText(
    "completed",
  );

  const marker = page.locator(".at-round-marker-intent");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("data-open", "false");
  await expect(marker.locator(".at-round-marker-intent-summary"))
    .toContainText(COMPLEX_PROMPT_PREFIX);
  await expect(marker.locator(".at-round-marker-intent-body")).toHaveCount(0);
  await expect.poll(() => textOccurrenceCountInTimeline(page, COMPLEX_PROMPT_PREFIX))
    .toBe(1);

  const processed = page.locator("details.at-processed-group");
  await expect(processed).toHaveCount(1);
  await expect(processed).not.toHaveAttribute("open", "");
  await expect(page.locator(".at-processed-group-line")).toHaveCount(0);
  await expect(processed.locator(".at-processed-group-body")).toBeHidden();
}

async function expandRoundPromptAndProcessedWork(page: Page): Promise<void> {
  await page.locator(".at-round-marker-intent-summary").click();
  await page.locator(".at-processed-group-summary").click();
}

async function collapseRoundPromptAndProcessedWork(page: Page): Promise<void> {
  await page.locator(".at-processed-group-summary").click();
  await page.locator(".at-round-marker-intent-summary").click();
}

async function expectComplexReplayExpanded(page: Page): Promise<void> {
  const marker = page.locator(".at-round-marker-intent");
  const summary = marker.locator(".at-round-marker-intent-summary");
  await expect(marker).toHaveAttribute("data-open", "true");
  await expect(summary).toContainText(/收起|Collapse/);
  await expect(summary).not.toContainText(COMPLEX_PROMPT_PREFIX);
  await expect(marker.locator(".at-round-marker-intent-body"))
    .toHaveText(COMPLEX_PROMPT);
  await expect.poll(() => textOccurrenceCountInLocator(marker, COMPLEX_PROMPT_PREFIX))
    .toBe(1);
  await expect.poll(() => textOccurrenceCountInTimeline(page, COMPLEX_PROMPT_PREFIX))
    .toBe(1);

  const processed = page.locator("details.at-processed-group");
  await expect(processed).toHaveAttribute("open", "");
  await expect(processed.locator(".at-message-thinking")).toHaveCount(1);
  await expect(processed.locator(".at-message-tool")).toHaveCount(1);
  await expect(processed.locator(".at-message-tool"))
    .toHaveAttribute("data-status", "completed");
  await expect(processed.locator(".at-message-tool-preview"))
    .toHaveText(TOOL_RESULT_TEXT);
  await expect(processed.getByText(FINAL_TEXT)).toHaveCount(0);
}

async function expectFinalAnswerActionsPlacedUnderAnswer(page: Page): Promise<void> {
  const finalArticle = page.locator("article.at-message").filter({ hasText: FINAL_TEXT });
  await expect(finalArticle).toHaveCount(1);
  await expect(finalArticle.locator(".at-message-actions")).toHaveCount(1);
  await expect(finalArticle.locator(".at-message-actions button")).toHaveCount(2);

  await expect.poll(() => finalAnswerActionMetrics(page))
    .toMatchObject({
      actionButtonCount: 2,
      actionCount: 1,
      actionInsideProcessedGroup: false,
      finalTextOccurrencesInAnswerArticle: 1,
    });
  const metrics = await finalAnswerActionMetrics(page);
  expect(metrics.actionTop).toBeGreaterThanOrEqual(metrics.contentBottom - 1);
  expect(metrics.actionTop).toBeLessThanOrEqual(metrics.articleBottom);
  expect(metrics.contentTop).toBeGreaterThanOrEqual(0);
  expect(metrics.articleLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.articleRight).toBeGreaterThan(metrics.articleLeft);
}

async function expectV1FinalAnswerActionsPlacedUnderAnswer(page: Page): Promise<void> {
  const metrics = await page.evaluate((finalText) => {
    const messages = Array.from(
      document.querySelectorAll<HTMLElement>("#chat-messages .message"),
    );
    const answer = messages.find((message) =>
      (message.textContent ?? "").includes(finalText),
    );
    if (answer === undefined) {
      throw new Error("V1 final answer message was not rendered.");
    }
    const actions = answer.querySelector<HTMLElement>(".message-copy-actions");
    if (actions === null) {
      throw new Error("V1 final answer actions were not rendered.");
    }
    const content = answer.querySelector<HTMLElement>(".msg-content");
    if (content === null) {
      throw new Error("V1 final answer content was not rendered.");
    }
    return {
      actionButtonCount: actions.querySelectorAll("button").length,
      actionCount: answer.querySelectorAll(".message-copy-actions").length,
      actionInsideProcessedGroup: actions.closest("details.tool-group") !== null,
      actionTop: actions.getBoundingClientRect().top,
      contentBottom: content.getBoundingClientRect().bottom,
      finalTextOccurrences: (answer.textContent ?? "").split(finalText).length - 1,
    };
  }, FINAL_TEXT);
  expect(metrics).toMatchObject({
    actionButtonCount: 2,
    actionCount: 1,
    actionInsideProcessedGroup: false,
    finalTextOccurrences: 1,
  });
  expect(metrics.actionTop).toBeGreaterThanOrEqual(metrics.contentBottom - 1);
}

async function collapsedRoundMetrics(page: Page): Promise<CollapsedRoundMetrics> {
  return page.evaluate(() => {
    const intent = document.querySelector<HTMLElement>(".at-round-marker-intent");
    const processed = document.querySelector<HTMLElement>("details.at-processed-group");
    const timeline = document.querySelector<HTMLElement>(".at-timeline-virtual");
    if (intent === null || processed === null || timeline === null) {
      throw new Error("Collapsed round surfaces were not rendered.");
    }
    const intentRect = intent.getBoundingClientRect();
    const processedRect = processed.getBoundingClientRect();
    return {
      intentHeight: intentRect.height,
      intentTop: intentRect.top,
      processedHeight: processedRect.height,
      processedTop: processedRect.top,
      scrollTop: timeline.scrollTop,
    };
  });
}

async function v1CollapsedRoundMetrics(page: Page): Promise<CollapsedRoundMetrics> {
  return page.evaluate(() => {
    const intent = document.querySelector<HTMLElement>(".round-detail-intent");
    const processed = document.querySelector<HTMLElement>("details.tool-group");
    const timeline = document.querySelector<HTMLElement>("#chat-messages");
    if (intent === null || processed === null || timeline === null) {
      throw new Error("V1 collapsed round surfaces were not rendered.");
    }
    const intentRect = intent.getBoundingClientRect();
    const processedRect = processed.getBoundingClientRect();
    return {
      intentHeight: intentRect.height,
      intentTop: intentRect.top,
      processedHeight: processedRect.height,
      processedTop: processedRect.top,
      scrollTop: timeline.scrollTop,
    };
  });
}

function expectCollapsedRoundMetricsStable(
  before: CollapsedRoundMetrics,
  after: CollapsedRoundMetrics,
): void {
  expect(Math.abs(after.intentHeight - before.intentHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.intentTop - before.intentTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.processedHeight - before.processedHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.processedTop - before.processedTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1);
}

async function finalAnswerActionMetrics(page: Page): Promise<FinalAnswerActionMetrics> {
  return page.evaluate((finalText) => {
    const articles = Array.from(document.querySelectorAll<HTMLElement>("article.at-message"));
    const answerArticle = articles.find((article) =>
      (article.textContent ?? "").includes(finalText),
    );
    if (answerArticle === undefined) {
      throw new Error("Final answer article was not rendered.");
    }
    const content = answerArticle.querySelector<HTMLElement>(".at-message-content");
    const actions = answerArticle.querySelector<HTMLElement>(".at-message-actions");
    if (content === null || actions === null) {
      throw new Error("Final answer content or actions were not rendered.");
    }
    const articleRect = answerArticle.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    return {
      actionButtonCount: actions.querySelectorAll("button").length,
      actionCount: answerArticle.querySelectorAll(".at-message-actions").length,
      actionInsideProcessedGroup: actions.closest("details.at-processed-group") !== null,
      actionTop: actionRect.top,
      articleBottom: articleRect.bottom,
      articleLeft: articleRect.left,
      articleRight: articleRect.right,
      contentBottom: contentRect.bottom,
      contentTop: contentRect.top,
      finalTextOccurrencesInAnswerArticle:
        (answerArticle.textContent ?? "").split(finalText).length - 1,
    };
  }, FINAL_TEXT);
}

async function textOccurrenceCountInTimeline(
  page: Page,
  text: string,
): Promise<number> {
  return page.locator(".at-timeline-virtual").evaluate((element, needle) => {
    if (needle.length === 0) {
      return 0;
    }
    return (element.textContent ?? "").split(needle).length - 1;
  }, text);
}

async function textOccurrenceCountInV1Timeline(
  page: Page,
  text: string,
): Promise<number> {
  return page.locator("#chat-messages").evaluate((element, needle) => {
    if (needle.length === 0) {
      return 0;
    }
    return (element.textContent ?? "").split(needle).length - 1;
  }, text);
}

async function textOccurrenceCountInLocator(
  locator: ReturnType<Page["locator"]>,
  text: string,
): Promise<number> {
  return locator.evaluate((element, needle) => {
    if (needle.length === 0) {
      return 0;
    }
    return (element.textContent ?? "").split(needle).length - 1;
  }, text);
}

async function handleComplexReplayApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === "/system/configs/ui-language") {
    await context.fulfillJson({ language: "zh-CN" });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(complexReplayMessages());
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [complexReplayRound()],
      next_cursor: null,
    });
    return true;
  }
  if (
    context.method === "GET" &&
    context.path === `/sessions/${SESSION_ID}/runs/${COMPLEX_RUN_ID}/token-usage`
  ) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  return false;
}

function complexReplayMessages(): Record<string, unknown>[] {
  return [
    {
      content: COMPLEX_PROMPT,
      created_at: "2026-07-01T11:22:02Z",
      message_id: "complex-replay-user",
      role: "user",
      run_id: COMPLEX_RUN_ID,
    },
    {
      created_at: "2026-07-01T11:22:04Z",
      message: {
        parts: [
          {
            content: THINKING_TEXT,
            part_kind: "thinking",
          },
          {
            args: {
              path: "src/relay_teams/skills/__init__.py",
            },
            part_kind: "tool-call",
            tool_call_id: "call-complex-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "complex-replay-work-start",
      role_id: "MainAgent",
      run_id: COMPLEX_RUN_ID,
    },
    {
      created_at: "2026-07-01T11:22:06Z",
      message: {
        parts: [
          {
            content: TOOL_RESULT_TEXT,
            part_kind: "tool-return",
            tool_call_id: "call-complex-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "complex-replay-work-result",
      role_id: "MainAgent",
      run_id: COMPLEX_RUN_ID,
    },
    {
      created_at: "2026-07-01T11:22:08Z",
      message: {
        parts: [
          {
            content: FINAL_TEXT,
            part_kind: "text",
          },
        ],
      },
      message_id: "complex-replay-final",
      role_id: "MainAgent",
      run_id: COMPLEX_RUN_ID,
    },
  ];
}

function complexReplayRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-07-01T11:22:04Z",
        message: {
          parts: [
            {
              content: THINKING_TEXT,
              part_kind: "thinking",
            },
            {
              args: {
                path: "src/relay_teams/skills/__init__.py",
              },
              part_kind: "tool-call",
              tool_call_id: "call-complex-read",
              tool_name: "read",
            },
            {
              content: TOOL_RESULT_TEXT,
              part_kind: "tool-return",
              tool_call_id: "call-complex-read",
              tool_name: "read",
            },
            {
              content: FINAL_TEXT,
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-07-01T11:22:02Z",
    has_final_output: true,
    input_tokens: 28200,
    intent: COMPLEX_PROMPT,
    intent_parts: [{ kind: "text", text: COMPLEX_PROMPT }],
    output_tokens: 779,
    run_id: COMPLEX_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_updated_at: "2026-07-01T11:22:47Z",
    run_user_message: COMPLEX_PROMPT,
    verification_status: "verified",
  };
}
