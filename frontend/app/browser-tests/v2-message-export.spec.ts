import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import {
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  serveFrontendDist,
  SESSION_ID,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

test("downloads message exports as HTML and PNG from the V2 top bar", async ({
  page,
}, testInfo) => {
  const appServer = await serveFrontendDist();
  let roundsRequestCount = 0;
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleMessageExportApi(context, () => {
          roundsRequestCount += 1;
        }),
      sessionTitle: "TS message export",
    });

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.getByRole("button", { name: "Export messages" }))
      .toBeVisible();
    await expect.poll(() => roundsRequestCount).toBeGreaterThanOrEqual(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    const roundsRequestCountBeforeExport = roundsRequestCount;

    await page.getByRole("button", { name: "Export messages" }).click();
    const htmlDownloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "HTML" }).click();
    const htmlDownload = await htmlDownloadPromise;
    expect(htmlDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.html`);
    const htmlPath = testInfo.outputPath(htmlDownload.suggestedFilename());
    await htmlDownload.saveAs(htmlPath);
    const html = await readFile(htmlPath, "utf8");
    expect(html).toContain(`<title>${SESSION_ID} transcript</title>`);
    expect(html).toContain("Round 1 prompt");
    expect(html).toContain("V2 export prompt");
    expect(html).toContain("Exported V2 transcript content");

    await page.getByRole("button", { name: "Export messages" }).click();
    const pngDownloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "PNG" }).click();
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.png`);
    const pngPath = testInfo.outputPath(pngDownload.suggestedFilename());
    await pngDownload.saveAs(pngPath);
    const png = await readFile(pngPath);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    expect(roundsRequestCount).toBe(roundsRequestCountBeforeExport + 2);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleMessageExportApi(
  context: MockApiRouteContext,
  onRoundsRequest: () => void,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    onRoundsRequest();
    await context.fulfillJson({
      has_more: false,
      items: [exportRound()],
      next_cursor: null,
    });
    return true;
  }
  return false;
}

function exportRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:00:02Z",
        message: {
          parts: [
            {
              content: "Exported V2 transcript content",
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
    run_id: "run-v2-export",
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
      run_id: "run-v2-export",
      session_id: SESSION_ID,
      updated_at: "2026-06-25T08:00:03Z",
      version: 1,
    },
    verification_status: "verified",
  };
}
