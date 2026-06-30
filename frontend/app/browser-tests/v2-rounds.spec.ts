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

const SCREENSHOT_FOLDER = "frontend-v2-ts-rounds";
const ROUND_RUN_ID = "run-v2-export";
const TODO_RUN_ID = "run-v2-todo";
const PAGED_ARCHIVE_RUN_ID = "run-v2-paged-archive";
const PAGED_MIDDLE_RUN_ID = "run-v2-paged-middle";
const PAGED_LATEST_RUN_ID = "run-v2-paged-latest";
const PAGED_CURSOR_RUN_ID = "run-v2-paged-cursor";
const VERIFICATION_RUN_ID = "run-v2-verification-warning";
const LONG_PROMPT_RUN_ID = "run-v2-long-prompt-marker";

const LONG_PROMPT_PREFIX = "流式从头到尾慢速真实验证-1782818317613";
const LONG_PROMPT_TEXT =
  `${LONG_PROMPT_PREFIX}：请启动一个 Explorer 子代理，只读检查下面 10 个文件，` +
  "并在子代理完成后用中文总结 6 点：src/relay_teams/skills/__init__.py、" +
  "src/relay_teams/skills/skill_models.py、src/relay_teams/skills/discovery.py、" +
  "src/relay_teams/skills/skill_registry.py、src/relay_teams/skills/skill_routing_service.py、" +
  "src/relay_teams/skills/skill_team_roles.py、src/relay_teams/skills/skill_cli.py、" +
  "src/relay_teams/skills/config_reload_service.py、src/relay_teams/agent_runtimes/skill_bridge.py、" +
  "tests/unit_tests/skills/test_skill_registry.py。不要修改任何文件。";

async function useWideRoundRailViewport(page: Page): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1680 });
}

test("opens round rail retry and todo detail", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const requestedUrls: string[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await useWideRoundRailViewport(page);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleRoundsApi(context, requestedUrls),
      sessionTitle: "TS rounds",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const roundRail = page.getByRole("navigation", { name: "Rounds" });
    await expect(roundRail).toBeVisible();
    const roundButton = page.getByRole("button", {
      name: "Go to round 1: Export prompt",
    });
    await expect(roundButton).toBeVisible();
    await expect(roundButton).toHaveClass(/is-warning/);
    await expect(roundRail.locator(".at-round-rail-item")).toHaveCount(1);
    await expect(roundRail.locator(".at-round-rail-dot")).toHaveCount(1);
    await expect(roundRail.locator(".at-round-rail-title")).toHaveText("Export prompt");
    await expect(
      roundRail.locator(".idx, .round-nav-node, .round-nav-item, .round-nav-dot, .round-nav-detail"),
    ).toHaveCount(0);
    await expect(roundButton.locator(".at-round-rail-dot")).not.toHaveAttribute("title", /.+/);
    await roundButton.hover();

    const detail = page.getByLabel("Round detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("2 pending approvals")).toBeVisible();
    await expect(detail.getByText("1 pending questions")).toBeVisible();
    await expect(
      detail.getByText("Retry scheduled: attempt 3/5 · in 3s · rate limited"),
    ).toBeVisible();
    await expect(
      detail.getByText("Diagnostic: Waiting for user confirmation"),
    ).toBeVisible();
    await expect(detail.getByText("Todo", { exact: true })).toBeVisible();
    await expect(detail.getByText("2 items")).toBeVisible();
    await expect(detail.getByText("Confirm deploy window")).toBeVisible();
    await expect(detail.getByText("Capture approval result")).toBeVisible();
    expect(
      requestedUrls.some((url) => requestedRoundUrlIncludes(url, { limit: "100" })),
    ).toBe(true);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectDarkComposerPrompt(page);
    await expectNoDocumentScroll(
      page,
      "round rail detail should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-round-rail-detail.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps todo details scoped to the round rail", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await useWideRoundRailViewport(page);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleTodoRailApi,
      sessionTitle: "TS round todos",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const roundRail = page.getByRole("navigation", { name: "Rounds" });
    await expect(roundRail).toBeVisible();
    const roundButton = page.getByRole("button", {
      name: "Go to round 1: Maintain run todo state",
    });
    await expect(roundButton).toBeVisible();
    await expect(roundButton).toHaveAttribute("aria-current", "step");
    await expect(roundRail.locator(".at-round-rail-dot")).toHaveCount(1);
    await expect(
      roundRail.locator(".idx, .round-nav-resizer, .round-nav-dot"),
    ).toHaveCount(0);

    const message = page.locator(".at-message").filter({
      hasText: "Todo persistence finished",
    });
    await expect(message).toBeVisible();
    await expect(message).not.toContainText("Inspect issue 399 requirements");
    await expect(message).not.toContainText("Implement run todo persistence");
    await expect(page.locator(".round-todo-card")).toHaveCount(0);
    await expect(page.locator(".session-round-section .round-nav-todo"))
      .toHaveCount(0);

    await roundButton.hover();
    const detail = page.getByLabel("Round detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Todo", { exact: true })).toBeVisible();
    await expect(detail.getByText("3 items")).toBeVisible();
    await expect(detail.getByText("Inspect issue 399 requirements")).toBeVisible();
    await expect(detail.getByText("Implement run todo persistence")).toBeVisible();
    await expect(detail.getByText("Verify browser rendering")).toBeVisible();
    await expect(
      detail.locator("li").filter({ hasText: "Inspect issue 399 requirements" }),
    ).toContainText("Completed");
    await expect(
      detail.locator("li").filter({ hasText: "Implement run todo persistence" }),
    ).toContainText("In progress");
    await expect(
      detail.locator("li").filter({ hasText: "Verify browser rendering" }),
    ).toContainText("Pending");
    await expect(
      detail
        .locator("li")
        .filter({ hasText: "Inspect issue 399 requirements" })
        .locator("span"),
    ).toHaveAttribute("title", "Inspect issue 399 requirements");

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "round todo detail should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-round-todo-detail.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("does not repeat the round prompt title after expanding the marker", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleLongPromptRoundApi,
      sessionTitle: "TS long prompt marker",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expect(page.getByText("Long prompt marker answer")).toBeVisible();
    const marker = page.locator(".at-round-marker-intent");
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute("data-open", "false");
    const summary = marker.locator(".at-round-marker-intent-summary");
    await expect(summary).toContainText(LONG_PROMPT_PREFIX);

    await summary.click();

    await expect(marker).toHaveAttribute("data-open", "true");
    await expect(summary).toHaveText("Collapse");
    await expect(summary).not.toContainText(LONG_PROMPT_TEXT);
    await expect(summary).not.toContainText(LONG_PROMPT_PREFIX);
    await expect(summary.locator(".at-round-marker-title")).toHaveCount(0);
    await expect(marker.locator(".at-round-marker-intent-body"))
      .toHaveText(LONG_PROMPT_TEXT);
    await expect(
      page
        .locator(".at-round-marker-intent-body")
        .filter({ hasText: LONG_PROMPT_TEXT }),
    ).toHaveCount(1);
    await expect
      .poll(() =>
        marker.evaluate((element, prompt) => {
          const markerText = element.textContent ?? "";
          return markerText.split(prompt).length - 1;
        }, LONG_PROMPT_TEXT),
      )
      .toBe(1);
    await expect
      .poll(() =>
        marker.evaluate((element, promptPrefix) => {
          const markerText = element.textContent ?? "";
          return markerText.split(promptPrefix).length - 1;
        }, LONG_PROMPT_PREFIX),
      )
      .toBe(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "expanded round prompt marker should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath(
        "v2-round-marker-expanded-no-duplicate.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("collects paged round rail history and navigates older rounds", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const requestedUrls: string[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await useWideRoundRailViewport(page);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handlePagedRoundsApi(context, requestedUrls),
      sessionTitle: "TS paged rounds",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expect
      .poll(() =>
        requestedUrls.some((url) => requestedRoundUrlIncludes(url, { limit: "100" })),
      )
      .toBe(true);
    await expect
      .poll(() =>
        requestedUrls.some((url) =>
          requestedRoundUrlIncludes(url, {
            cursor_run_id: PAGED_CURSOR_RUN_ID,
            limit: "100",
          }),
        ),
      )
      .toBe(true);

    const roundRail = page.getByRole("navigation", { name: "Rounds" });
    await expect(roundRail).toBeVisible();
    await expect(roundRail.getByRole("button")).toHaveCount(3);

    const archiveButton = page.getByRole("button", {
      name: "Go to round 1: Paged archive branch",
    });
    const middleButton = page.getByRole("button", {
      name: "Go to round 2: Paged middle branch",
    });
    const latestButton = page.getByRole("button", {
      name: "Go to round 3: Paged latest branch",
    });
    await expect(archiveButton).toBeVisible();
    await expect(middleButton).toBeVisible();
    await expect(latestButton).toBeVisible();
    await expect(latestButton).toHaveAttribute("aria-current", "step");
    await expect(archiveButton).not.toHaveAttribute("aria-current", "step");
    await expect(middleButton).not.toHaveAttribute("aria-current", "step");

    const timeline = page.locator(".at-timeline");
    const initialScrollTop = await timeline.evaluate((element) => element.scrollTop);
    expect(initialScrollTop).toBeGreaterThan(0);

    await archiveButton.click();
    await expect(archiveButton).toHaveAttribute("aria-current", "step");
    await expect(middleButton).not.toHaveAttribute("aria-current", "step");
    await expect(latestButton).not.toHaveAttribute("aria-current", "step");
    await expect
      .poll(() => timeline.evaluate((element) => element.scrollTop))
      .toBeLessThan(initialScrollTop);
    await expect(
      page.locator(".at-message").filter({ hasText: "Paged archive output" }),
    ).toBeVisible();

    await archiveButton.hover();
    const detail = roundRail.locator(".at-round-rail-detail.is-open");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Todo", { exact: true })).toBeVisible();
    await expect(detail.getByText("Audit old replay boundary")).toBeVisible();
    await expect(detail.getByText("Replay archived stream")).toBeVisible();
    await expect(detail.getByText("1 pending approvals")).toBeVisible();
    await expect(
      page.locator(".at-message").filter({ hasText: "Audit old replay boundary" }),
    ).toHaveCount(0);

    await latestButton.hover();
    await expect(archiveButton).toHaveAttribute("aria-current", "step");
    await expect(roundRail.locator(".at-round-rail-detail.is-open")).toContainText(
      "Confirm latest handoff",
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "paged round history should keep scrolling inside the V2 timeline shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-round-paged-history.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps verification failed rounds in the warning lane", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await useWideRoundRailViewport(page);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleVerificationRoundApi,
      sessionTitle: "TS round verification",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const roundButton = page.getByRole("button", {
      name: "Go to round 1: Verify deploy guardrail",
    });
    await expect(roundButton).toBeVisible();
    await expect(roundButton).toHaveClass(/is-warning/);
    await expect(roundButton).not.toHaveClass(/is-error/);

    await roundButton.hover();
    const detail = page.getByLabel("Round detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("verification failed")).toBeVisible();
    await expect(detail.getByText("Diagnostic: Verification not passed.")).toBeVisible();
    await expect(page.getByText("runtime_guardrail:pre_execution_boundary"))
      .toHaveCount(0);
    await expect(
      page.locator(".at-message", { hasText: "Verification warning output" }),
    ).toHaveCount(1);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "verification warning round should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-round-verification-warning.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleRoundsApi(
  context: MockApiRouteContext,
  requestedUrls: string[],
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    requestedUrls.push(`${context.path}${context.url.search}`);
    await context.fulfillJson({
      has_more: false,
      items: [roundRailRound()],
      next_cursor: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([roundRailMessage()]);
    return true;
  }
  return false;
}

function requestedRoundUrlIncludes(
  url: string,
  expectedSearchParams: Readonly<Record<string, string>>,
): boolean {
  const parsed = new URL(url, "http://agent-teams.test");
  if (parsed.pathname !== `/sessions/${SESSION_ID}/rounds`) {
    return false;
  }
  return Object.entries(expectedSearchParams).every(
    ([name, value]) => parsed.searchParams.get(name) === value,
  );
}

async function handlePagedRoundsApi(
  context: MockApiRouteContext,
  requestedUrls: string[],
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    requestedUrls.push(`${context.path}${context.url.search}`);
    const cursorRunId = context.url.searchParams.get("cursor_run_id");
    if (cursorRunId === PAGED_CURSOR_RUN_ID) {
      await context.fulfillJson({
        has_more: false,
        items: [pagedArchiveRound()],
        next_cursor: null,
      });
      return true;
    }
    if (cursorRunId === null) {
      await context.fulfillJson({
        has_more: true,
        items: [pagedLatestRound(), pagedMiddleRound()],
        next_cursor: PAGED_CURSOR_RUN_ID,
      });
      return true;
    }
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(pagedRoundMessages());
    return true;
  }
  return false;
}

async function handleVerificationRoundApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [verificationWarningRound()],
      next_cursor: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([verificationWarningMessage()]);
    return true;
  }
  return false;
}

async function handleTodoRailApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [todoRailRound()],
      next_cursor: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([todoRailMessage()]);
    return true;
  }
  return false;
}

async function handleLongPromptRoundApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [longPromptRound()],
      next_cursor: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([longPromptMessage()]);
    return true;
  }
  return false;
}

function roundRailMessage(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:00:02Z",
    message: {
      parts: [
        {
          content: "Round rail visible output",
          part_kind: "text",
        },
      ],
    },
    message_id: "message-round-rail-output",
    role_id: "MainAgent",
    run_id: ROUND_RUN_ID,
  };
}

function todoRailMessage(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:15:02Z",
    message: {
      parts: [
        {
          content: "Todo persistence finished",
          part_kind: "text",
        },
      ],
    },
    message_id: "message-round-todo-output",
    role_id: "MainAgent",
    run_id: TODO_RUN_ID,
  };
}

function verificationWarningMessage(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:25:02Z",
    message: {
      parts: [
        {
          content: "Verification warning output",
          part_kind: "text",
        },
      ],
    },
    message_id: "message-round-verification-warning-output",
    role_id: "MainAgent",
    run_id: VERIFICATION_RUN_ID,
  };
}

function longPromptMessage(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:30:02Z",
    message: {
      parts: [
        {
          content: "Long prompt marker answer",
          part_kind: "text",
        },
      ],
    },
    message_id: "message-long-prompt-output",
    role_id: "MainAgent",
    run_id: LONG_PROMPT_RUN_ID,
  };
}

function pagedRoundMessages(): Record<string, unknown>[] {
  return [
    pagedRoundMessage({
      content: "Paged archive output",
      createdAt: "2026-06-25T07:00:02Z",
      messageId: "message-paged-archive-output",
      runId: PAGED_ARCHIVE_RUN_ID,
    }),
    ...Array.from({ length: 18 }, (_, index) =>
      pagedRoundMessage({
        content: `Paged middle branch filler ${index + 1}`,
        createdAt: `2026-06-25T07:${String(index + 10).padStart(2, "0")}:00Z`,
        messageId: `message-paged-middle-${index + 1}`,
        runId: PAGED_MIDDLE_RUN_ID,
      }),
    ),
    pagedRoundMessage({
      content: "Paged latest output",
      createdAt: "2026-06-25T08:00:02Z",
      messageId: "message-paged-latest-output",
      runId: PAGED_LATEST_RUN_ID,
    }),
  ];
}

function pagedRoundMessage({
  content,
  createdAt,
  messageId,
  runId,
}: {
  content: string;
  createdAt: string;
  messageId: string;
  runId: string;
}): Record<string, unknown> {
  return {
    created_at: createdAt,
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
    run_id: runId,
  };
}

async function expectDarkComposerPrompt(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(".at-composer-sender .ant-sender-input")
        .evaluate((element) => window.getComputedStyle(element).backgroundColor),
    )
    .not.toBe("rgb(255, 255, 255)");
}

function pagedArchiveRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T07:00:02Z",
        message: {
          parts: [
            {
              content: "Paged archive output",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T07:00:01Z",
    has_final_output: true,
    intent: "Paged archive branch",
    intent_parts: [{ kind: "text", text: "Paged archive branch" }],
    pending_tool_approval_count: 1,
    run_id: PAGED_ARCHIVE_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Paged archive branch",
    todo: {
      items: [
        {
          content: "Audit old replay boundary",
          status: "completed",
        },
        {
          content: "Replay archived stream",
          status: "pending",
        },
      ],
      run_id: PAGED_ARCHIVE_RUN_ID,
      session_id: SESSION_ID,
      updated_at: "2026-06-25T07:00:03Z",
      version: 7,
    },
    verification_status: "verified",
  };
}

function pagedMiddleRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T07:10:00Z",
        message: {
          parts: [
            {
              content: "Paged middle branch filler 1",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T07:10:00Z",
    has_final_output: true,
    intent: "Paged middle branch",
    intent_parts: [{ kind: "text", text: "Paged middle branch" }],
    run_id: PAGED_MIDDLE_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Paged middle branch",
    verification_status: "verified",
  };
}

function pagedLatestRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:00:02Z",
        message: {
          parts: [
            {
              content: "Paged latest output",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:00:01Z",
    has_final_output: true,
    intent: "Paged latest branch",
    intent_parts: [{ kind: "text", text: "Paged latest branch" }],
    run_id: PAGED_LATEST_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Paged latest branch",
    todo: {
      items: [
        {
          content: "Confirm latest handoff",
          status: "in_progress",
        },
      ],
      run_id: PAGED_LATEST_RUN_ID,
      session_id: SESSION_ID,
      updated_at: "2026-06-25T08:00:03Z",
      version: 3,
    },
    verification_status: "verified",
  };
}

function verificationWarningRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:25:02Z",
        message: {
          parts: [
            {
              content: "Verification warning output",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:25:01Z",
    has_final_output: true,
    intent: "Verify deploy guardrail",
    intent_parts: [{ kind: "text", text: "Verify deploy guardrail" }],
    run_id: VERIFICATION_RUN_ID,
    run_phase: "terminal",
    run_status: "failed",
    run_diagnostic_message:
      "verification_failedruntime_guardrail:pre_execution_boundary",
    run_user_message: "Verify deploy guardrail",
    verification_status: "failed",
  };
}

function todoRailRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:15:02Z",
        message: {
          parts: [
            {
              content: "Todo persistence finished",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:15:01Z",
    has_final_output: true,
    intent: "Maintain run todo state",
    intent_parts: [{ kind: "text", text: "Maintain run todo state" }],
    run_id: TODO_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Maintain run todo state",
    todo: {
      items: [
        {
          content: "Inspect issue 399 requirements",
          status: "completed",
        },
        {
          content: "Implement run todo persistence",
          status: "in_progress",
        },
        {
          content: "Verify browser rendering",
          status: "pending",
        },
      ],
      run_id: TODO_RUN_ID,
      session_id: SESSION_ID,
      updated_at: "2026-06-25T08:15:03Z",
      version: 2,
    },
    verification_status: "verified",
  };
}

function roundRailRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:00:02Z",
        message: {
          parts: [
            {
              content: "Round rail visible output",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:00:01Z",
    has_final_output: true,
    intent: "Export prompt",
    intent_parts: [{ kind: "text", text: "Export prompt" }],
    pending_tool_approval_count: 2,
    pending_user_question_count: 1,
    retry_events: [
      {
        attempt_number: 3,
        error_message: "rate limited",
        is_active: true,
        phase: "scheduled",
        retry_in_ms: 2500,
        total_attempts: 5,
      },
    ],
    run_diagnostic_message: "Waiting for user confirmation",
    run_id: ROUND_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Export prompt",
    todo: {
      items: [
        {
          content: "Confirm deploy window",
          status: "in_progress",
        },
        {
          content: "Capture approval result",
          status: "pending",
        },
      ],
      run_id: ROUND_RUN_ID,
      session_id: SESSION_ID,
      updated_at: "2026-06-25T08:00:03Z",
      version: 1,
    },
    verification_status: "verified",
  };
}

function longPromptRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:30:02Z",
        message: {
          parts: [
            {
              content: "Long prompt marker answer",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:30:01Z",
    has_final_output: true,
    intent: LONG_PROMPT_TEXT,
    intent_parts: [{ kind: "text", text: LONG_PROMPT_TEXT }],
    run_id: LONG_PROMPT_RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: null,
    verification_status: "verified",
  };
}
