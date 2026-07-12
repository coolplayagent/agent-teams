import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-message-export";

test("downloads semantic JSON, standalone HTML, and rendered PNG transcripts", async ({
  page,
}, testInfo) => {
  const appServer = await serveFrontendDist();
  let roundsRequestCount = 0;
  try {
    await installShellState(page);
    await installExportMimeProbe(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleMessageExportApi(context, () => {
          roundsRequestCount += 1;
        }),
      sessionTitle: "TS message export",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await expect(page.getByRole("button", { name: "Export messages" }))
      .toBeVisible();
    await expect.poll(() => roundsRequestCount).toBeGreaterThanOrEqual(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    const roundsRequestCountBeforeExport = roundsRequestCount;

    await page.getByRole("button", { name: "Export messages" }).click();
    await page.getByRole("menuitem", { name: "JSON" }).click();
    const jsonDialog = page.getByRole("dialog", { name: "Select rounds" });
    await expect(jsonDialog).toContainText("2 of 2 selected");
    const jsonDownloadPromise = page.waitForEvent("download");
    await jsonDialog.getByRole("button", { name: "Export selected" }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.json`);
    const jsonPath = testInfo.outputPath(jsonDownload.suggestedFilename());
    await jsonDownload.saveAs(jsonPath);
    const jsonTranscript = JSON.parse(await readFile(jsonPath, "utf8")) as {
      entries: Array<{ kind: string; text: string }>;
      schema: string;
      sessionId: string;
      version: number;
    };
    expect(jsonTranscript).toMatchObject({
      schema: "relay-teams.session-transcript",
      sessionId: SESSION_ID,
      version: 1,
    });
    expect(jsonTranscript.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "user", text: "First user prompt" }),
        expect.objectContaining({ kind: "assistant", text: "First agent answer." }),
        expect.objectContaining({ kind: "tool" }),
      ]),
    );

    await page.getByRole("button", { name: "Export messages" }).click();
    await page.getByRole("menuitem", { name: "HTML" }).click();
    const htmlDialog = page.getByRole("dialog", { name: "Select rounds" });
    const htmlDialogContent = page
      .locator(".ant-modal-content")
      .filter({ hasText: "Select rounds" });
    await expect(htmlDialog).toBeVisible();
    await expect(htmlDialogContent).toBeVisible();
    await expect(page.locator(".ant-dropdown").filter({ hasText: "HTML" })).toBeHidden();
    await expect(htmlDialog).toContainText("2 of 2 selected");
    await expect(htmlDialog).toContainText("First user prompt");
    await expect(htmlDialog).toContainText("Second user prompt");
    await htmlDialogContent.screenshot({
      path: screenshotPath("v2-message-export-round-selection.png", SCREENSHOT_FOLDER),
    });

    const allHtmlDownloadPromise = page.waitForEvent("download");
    await htmlDialog.getByRole("button", { name: "Export selected" }).click();
    const allHtmlDownload = await allHtmlDownloadPromise;
    expect(allHtmlDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.html`);
    const allHtmlPath = testInfo.outputPath(
      `all-${allHtmlDownload.suggestedFilename()}`,
    );
    await allHtmlDownload.saveAs(allHtmlPath);
    const allHtml = await readFile(allHtmlPath, "utf8");
    const allHtmlSummary = await summarizeExportHtml(page, allHtml);
    expect(allHtmlSummary.hasTranscriptStyles).toBe(true);
    expect(allHtmlSummary.turnCount).toBe(2);
    expect(allHtmlSummary.messageCount).toBe(9);
    expect(allHtmlSummary.labels).toEqual(
      expect.arrayContaining([
        "Round 1",
        "User",
        "MainAgent",
        "read_file",
        "Run status",
        "Retry 1",
        "Round 2",
      ]),
    );
    expect(allHtmlSummary.bodyText).toContain("First user prompt");
    expect(allHtmlSummary.bodyText).toContain("First agent answer.");
    expect(allHtmlSummary.bodyText).toContain("read_file");
    expect(allHtmlSummary.bodyText).toContain("src/a.py");
    expect(allHtmlSummary.bodyText).toContain("Pending approvals: 2");
    expect(allHtmlSummary.bodyText).toContain("Pending questions: 1");
    expect(allHtmlSummary.bodyText).toContain("rate limited");
    expect(allHtmlSummary.bodyText).toContain("Waiting for user confirmation");
    expect(allHtmlSummary.bodyText).toContain("Second agent answer.");

    await page.getByRole("button", { name: "Export messages" }).click();
    await page.getByRole("menuitem", { name: "HTML" }).click();
    const selectedHtmlDialog = page.getByRole("dialog", { name: "Select rounds" });
    await expect(selectedHtmlDialog).toBeVisible();
    await selectedHtmlDialog
      .locator(".at-message-export-selection-row")
      .filter({ hasText: "First user prompt" })
      .getByRole("checkbox")
      .uncheck();
    await expect(selectedHtmlDialog).toContainText("1 of 2 selected");
    const htmlDownloadPromise = page.waitForEvent("download");
    await selectedHtmlDialog.getByRole("button", { name: "Export selected" }).click();
    const htmlDownload = await htmlDownloadPromise;
    expect(htmlDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.html`);
    const htmlPath = testInfo.outputPath(
      `selected-${htmlDownload.suggestedFilename()}`,
    );
    await htmlDownload.saveAs(htmlPath);
    const html = await readFile(htmlPath, "utf8");
    expect(html).toContain(`<title>${SESSION_ID} transcript</title>`);
    const htmlSummary = await summarizeExportHtml(page, html);
    expect(htmlSummary.title).toBe(`${SESSION_ID} transcript`);
    expect(htmlSummary.heading).toBe(SESSION_ID);
    expect(htmlSummary.hasSidebarTime).toBe(false);
    expect(htmlSummary.hasTranscriptStyles).toBe(true);
    expect(htmlSummary.turnCount).toBe(1);
    expect(htmlSummary.messageCount).toBe(3);
    expect(htmlSummary.labels).toEqual([
      "Round 1",
      "User",
      "MainAgent",
      "Run status",
    ]);
    expect(htmlSummary.texts).toEqual(
      expect.arrayContaining([
        "Second user prompt",
        "Second agent answer.",
      ]),
    );
    expect(htmlSummary.bodyText).not.toContain("First user prompt");
    expect(htmlSummary.bodyText).not.toContain("First agent answer.");
    expect(htmlSummary.bodyText).not.toContain("Tool call: read_file");
    expect(htmlSummary.bodyText).not.toContain("rate limited");

    await page.getByRole("button", { name: "Export messages" }).click();
    await page.getByRole("menuitem", { name: "PNG" }).click();
    const pngDialog = page.getByRole("dialog", { name: "Select rounds" });
    await expect(pngDialog).toBeVisible();
    await expect(pngDialog).toContainText("2 of 2 selected");
    const pngDownloadPromise = page.waitForEvent("download");
    await pngDialog.getByRole("button", { name: "Export selected" }).click();
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toBe(`${SESSION_ID}-messages.png`);
    const pngPath = testInfo.outputPath(pngDownload.suggestedFilename());
    await pngDownload.saveAs(pngPath);
    const png = await readFile(pngPath);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const pngDecode = await decodePngInBrowser(page, png);
    expect(pngDecode.type).toBe("image/png");
    expect(pngDecode.size).toBeGreaterThan(0);
    expect(pngDecode.decoded).toBe(true);
    expect(pngDecode.width).toBeGreaterThan(0);
    expect(pngDecode.height).toBeGreaterThan(0);

    expect(await readExportMimeTypes(page)).toEqual([
      "application/json;charset=utf-8",
      "text/html;charset=utf-8",
      "text/html;charset=utf-8",
      "image/png",
    ]);
    expect(roundsRequestCount).toBe(roundsRequestCountBeforeExport + 4);
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
      items: [exportRoundOne(), exportRoundTwo()],
      next_cursor: null,
    });
    return true;
  }
  return false;
}

interface ExportHtmlSummary {
  bodyText: string;
  hasTranscriptStyles: boolean;
  hasSidebarTime: boolean;
  heading: string;
  labels: string[];
  messageCount: number;
  texts: string[];
  title: string;
  turnCount: number;
}

interface PngDecodeResult {
  decoded: boolean;
  error: string;
  height: number;
  size: number;
  type: string;
  width: number;
}

async function summarizeExportHtml(
  page: Page,
  html: string,
): Promise<ExportHtmlSummary> {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "text/html");
    return {
      bodyText: doc.body.textContent ?? "",
      hasTranscriptStyles: source.includes(".entry[data-kind=\"user\"]")
        && !!doc.querySelector(".round .entry[data-kind]"),
      hasSidebarTime: source.includes("1时"),
      heading: doc.querySelector("h1")?.textContent?.trim() ?? "",
      labels: [
        ...Array.from(doc.querySelectorAll(".round-title")).map(
          (item) => item.textContent?.trim() ?? "",
        ),
        ...Array.from(doc.querySelectorAll(".entry-label")).map(
          (item) => item.textContent?.trim() ?? "",
        ),
      ],
      messageCount: doc.querySelectorAll(
        ".entry",
      ).length,
      texts: Array.from(doc.querySelectorAll(".entry .content")).map(
        (item) => item.textContent?.trim() ?? "",
      ),
      title: doc.title,
      turnCount: doc.querySelectorAll(".round").length,
    };
  }, html);
}

async function installExportMimeProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const mimeTypes: string[] = [];
    Object.defineProperty(window, "__messageExportMimeTypes", {
      configurable: true,
      value: mimeTypes,
    });
    URL.createObjectURL = (object: Blob | MediaSource): string => {
      if (object instanceof Blob) {
        mimeTypes.push(object.type);
      }
      return originalCreateObjectUrl(object);
    };
  });
}

async function readExportMimeTypes(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const value = Reflect.get(window, "__messageExportMimeTypes");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  });
}

async function decodePngInBrowser(
  page: Page,
  png: Buffer,
): Promise<PngDecodeResult> {
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const result = {
      decoded: false,
      error: "",
      height: 0,
      size: blob.size,
      type: blob.type,
      width: 0,
    };
    try {
      const bitmap = await createImageBitmap(blob);
      result.decoded = true;
      result.width = bitmap.width;
      result.height = bitmap.height;
      bitmap.close();
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    return result;
  }, dataUrl);
}

function exportRoundOne(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:00:02Z",
        message: {
          parts: [
            {
              content: "I will inspect files.",
              part_kind: "text",
            },
            {
              args: { path: "src/a.py" },
              part_kind: "tool-call",
              tool_call_id: "call-export-1",
              tool_name: "read_file",
            },
            {
              content: "First agent answer.",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:00:01Z",
    has_final_output: true,
    intent: "First user prompt",
    intent_parts: [{ kind: "text", text: "First user prompt" }],
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
    run_id: "run-v2-export-1",
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "First user prompt",
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
      run_id: "run-v2-export-1",
      session_id: SESSION_ID,
      updated_at: "2026-06-25T08:00:03Z",
      version: 1,
    },
    verification_status: "verified",
  };
}

function exportRoundTwo(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-06-25T08:05:02Z",
        message: {
          parts: [
            {
              content: "Second agent answer.",
              part_kind: "text",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-06-25T08:05:01Z",
    has_final_output: true,
    intent: "Second user prompt",
    intent_parts: [{ kind: "text", text: "Second user prompt" }],
    run_id: "run-v2-export-2",
    run_phase: "completed",
    run_status: "completed",
    run_user_message: "Second user prompt",
    verification_status: "verified",
  };
}
