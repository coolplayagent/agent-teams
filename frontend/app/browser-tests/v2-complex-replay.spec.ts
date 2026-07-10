import { expect, test, type Page } from "@playwright/test";

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
