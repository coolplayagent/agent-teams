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

const SCREENSHOT_FOLDER = "frontend-v2-ts-tool-lifecycle";
const TOOL_RUN_ID = "run-v2-tool-lifecycle";

test("merges persisted tool call and result messages into one completed card", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleToolLifecycleApi,
      sessionTitle: "TS tool lifecycle",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const completedTool = page.locator(".at-message-tool", {
      hasText: "Tool result: read",
    });
    await expect(completedTool).toHaveCount(1);
    await expect(completedTool).toHaveAttribute("data-status", "completed");
    await expect(completedTool.locator(".at-message-tool-spinner")).toHaveCount(0);
    await expect(completedTool.locator(".at-message-tool-preview"))
      .toHaveText("README excerpt from history.");
    await expect(page.getByText("Tool call: read")).toHaveCount(0);
    await expect(page.locator(".at-message-tool")).toHaveCount(1);
    await expect(page.locator(".at-message-tool-status")).toHaveCount(0);

    const toolBody = completedTool.locator(".at-message-tool-body");
    await expect(toolBody).toBeHidden();
    await completedTool.locator(".at-message-tool-summary").click();
    await expect(toolBody).toBeVisible();
    await expect(toolBody).toContainText("README excerpt from history.");
    await expect(toolBody).toContainText('"path": "README.md"');
    await expect(page.getByText("Tool lifecycle final answer.")).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "persisted tool lifecycle replay should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-tool-lifecycle-merged-card.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleToolLifecycleApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(toolLifecycleMessages());
    return true;
  }
  return false;
}

function toolLifecycleMessages(): unknown[] {
  return [
    {
      content: "Inspect README",
      created_at: "2026-07-01T09:00:00Z",
      message_id: "tool-lifecycle-user",
      role: "user",
      run_id: TOOL_RUN_ID,
    },
    {
      created_at: "2026-07-01T09:00:01Z",
      message: {
        parts: [
          {
            args: { path: "README.md" },
            part_kind: "tool-call",
            tool_call_id: "call-tool-lifecycle-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "tool-lifecycle-call",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
    {
      created_at: "2026-07-01T09:00:02Z",
      message: {
        parts: [
          {
            content: "README excerpt from history.",
            part_kind: "tool-return",
            tool_call_id: "call-tool-lifecycle-read",
            tool_name: "read",
          },
        ],
      },
      message_id: "tool-lifecycle-result",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
    {
      content: "Tool lifecycle final answer.",
      created_at: "2026-07-01T09:00:03Z",
      message_id: "tool-lifecycle-final",
      role_id: "MainAgent",
      run_id: TOOL_RUN_ID,
    },
  ];
}
