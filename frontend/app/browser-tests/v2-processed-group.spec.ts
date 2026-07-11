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

const SCREENSHOT_FOLDER = "frontend-v2-ts-processed-group";
const PROCESSED_RUN_ID = "run-v2-processed-group";

interface ProcessedGroupMetrics {
  groupHeight: number;
  hiddenBody: boolean;
  lineCount: number;
  timelineHeight: number;
  visibleToolCount: number;
  workTextVisible: boolean;
}

test("processed work stays folded and remeasures when expanded", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleProcessedGroupApi,
      sessionTitle: "TS processed group",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const processed = page.locator("details.at-processed-group");
    await expect(processed).toHaveCount(1);
    await expect(processed).not.toHaveAttribute("open", "");
    await expect(processed.locator(".at-processed-group-label"))
      .toHaveText("Processed");
    await expect(page.getByText("Processed final answer.")).toBeVisible();
    await expect(processed.getByText("Read: read")).toBeHidden();
    await expect(processed.getByText("Inspecting workspace before final answer."))
      .toBeHidden();
    await expect(page.locator(".at-processed-group-line")).toHaveCount(0);

    const collapsed = await processedGroupMetrics(page);
    expect(collapsed.hiddenBody).toBe(true);
    expect(collapsed.lineCount).toBe(0);
    expect(collapsed.visibleToolCount).toBe(0);
    expect(collapsed.workTextVisible).toBe(false);

    await processed.locator(".at-processed-group-summary").click();
    await expect(processed).toHaveAttribute("open", "");
    await expect(processed.getByText("Read: read")).toBeVisible();
    await expect(processed.getByText("Inspecting workspace before final answer."))
      .toBeHidden();

    await expect.poll(() => processedGroupMetrics(page))
      .toMatchObject({
        hiddenBody: false,
        lineCount: 0,
        visibleToolCount: 1,
        workTextVisible: false,
      });
    const expanded = await processedGroupMetrics(page);
    expect(expanded.groupHeight).toBeGreaterThan(collapsed.groupHeight + 20);
    expect(expanded.timelineHeight).toBeGreaterThan(collapsed.timelineHeight + 20);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "processed group expansion should stay inside the fixed V2 shell",
    );
    await page.screenshot({
      path: screenshotPath(
        "v2-processed-group-expanded.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleProcessedGroupApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(processedGroupMessages());
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [
        {
          created_at: "2026-07-01T10:00:00Z",
          run_id: PROCESSED_RUN_ID,
          run_status: "completed",
          run_user_message: "Processed group browser check",
        },
      ],
      next_cursor: null,
    });
    return true;
  }
  return false;
}

function processedGroupMessages(): unknown[] {
  return [
    {
      content: "Processed group browser check",
      created_at: "2026-07-01T10:00:00Z",
      message_id: "processed-group-user",
      role: "user",
      run_id: PROCESSED_RUN_ID,
    },
    {
      created_at: "2026-07-01T10:00:01Z",
      message: {
        parts: [
          {
            content: "Inspecting workspace before final answer.",
            part_kind: "thinking",
          },
          {
            args: { path: "README.md" },
            part_kind: "tool-call",
            tool_call_id: "call-processed-read",
            tool_name: "read",
          },
          {
            content: "README excerpt for processed group.",
            part_kind: "tool-return",
            tool_call_id: "call-processed-read",
            tool_name: "read",
          },
          {
            content: "Processed final answer.",
            part_kind: "text",
          },
        ],
      },
      message_id: "processed-group-assistant",
      role_id: "MainAgent",
      run_id: PROCESSED_RUN_ID,
    },
  ];
}

async function processedGroupMetrics(page: Page): Promise<ProcessedGroupMetrics> {
  return page.evaluate(() => {
    function isActuallyVisible(element: HTMLElement | undefined): boolean {
      if (element === undefined) {
        return false;
      }
      if (element.parentElement?.closest("details:not([open])") !== null) {
        return false;
      }
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      );
    }

    const group = document.querySelector<HTMLElement>(".at-processed-group");
    const body = document.querySelector<HTMLElement>(".at-processed-group-body");
    const timeline = document.querySelector<HTMLElement>(".at-timeline-virtual");
    const workTextNode = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .find((node) => node.textContent === "Inspecting workspace before final answer.");
    return {
      groupHeight: group?.getBoundingClientRect().height ?? 0,
      hiddenBody: body === null || getComputedStyle(body).display === "none",
      lineCount: document.querySelectorAll(".at-processed-group-line").length,
      timelineHeight: timeline?.getBoundingClientRect().height ?? 0,
      visibleToolCount: Array.from(document.querySelectorAll<HTMLElement>(".at-message-tool"))
        .filter((tool) => isActuallyVisible(tool))
        .length,
      workTextVisible: isActuallyVisible(workTextNode),
    };
  });
}
