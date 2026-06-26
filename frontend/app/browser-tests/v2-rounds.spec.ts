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

test("opens round rail retry and todo detail", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const requestedUrls: string[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
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
      name: "Go to round 1: V2 export prompt",
    });
    await expect(roundButton).toBeVisible();
    await expect(roundButton).toHaveClass(/is-warning/);
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
    await expect(detail.getByText("Todo")).toBeVisible();
    await expect(detail.getByText("2 items")).toBeVisible();
    await expect(detail.getByText("Confirm deploy window")).toBeVisible();
    await expect(detail.getByText("Capture approval result")).toBeVisible();
    expect(requestedUrls).toContain(`/sessions/${SESSION_ID}/rounds?limit=100`);

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

async function expectDarkComposerPrompt(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(".at-composer-sender .ant-sender-input")
        .evaluate((element) => window.getComputedStyle(element).backgroundColor),
    )
    .not.toBe("rgb(255, 255, 255)");
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
    intent: "V2 export prompt",
    intent_parts: [{ kind: "text", text: "V2 export prompt" }],
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
    run_user_message: "V2 export prompt",
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
