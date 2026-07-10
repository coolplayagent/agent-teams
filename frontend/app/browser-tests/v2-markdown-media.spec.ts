import { expect, test, type Page } from "@playwright/test";

import {
  captureStableViewportScreenshot,
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
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

const SCREENSHOT_FOLDER = "frontend-v2-ts-markdown-media";
const IMAGE_NAME = "markdown-diagram.svg";
const IMAGE_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMjAiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMjIwIDEyOCI+PHJlY3Qgd2lkdGg9IjIyMCIgaGVpZ2h0PSIxMjgiIHJ4PSIxMiIgZmlsbD0iIzA5NjlEQSIvPjxjaXJjbGUgY3g9IjU4IiBjeT0iNjQiIHI9IjI4IiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9Ii44NSIvPjxwYXRoIGQ9Ik0xMDAgOTBMMTMwIDUyTDE3MiA5MFoiIGZpbGw9IiNBNURGRkYiLz48cGF0aCBkPSJNMzAgMjhIMTkwIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIuNDgiLz48L3N2Zz4=";
const LONG_OUTPUT_LINES = Array.from(
  { length: 18 },
  (_, index) =>
    `Long output checkpoint ${String(index + 1).padStart(2, "0")} stays ordered.`,
);
const LONG_OUTPUT_FIRST = LONG_OUTPUT_LINES[0] ?? "";
const LONG_OUTPUT_LAST = LONG_OUTPUT_LINES.at(-1) ?? "";

test("pairs V1 and V2 markdown media replay from one fixture", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.setViewportSize({ height: 900, width: 1280 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleMarkdownMediaApi,
      sessionTitle: "TS markdown media evidence",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);
    await page.waitForTimeout(500);
    expect(pageErrors).toEqual([]);
    await expectMarkdownMediaContent(page);
    await expect(page.getByText("title: hidden")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "rewrite docs" }))
      .not.toHaveAttribute("target", "_blank");
    const v1Code = page.locator("pre code.language-ts");
    await expect(v1Code).toContainText("renderLongMarkdownLine");
    await expect(page.getByRole("img", { name: IMAGE_NAME })).toHaveCount(0);
    await expectLongOutputOrderAndUniqueness(page);
    await expectNoDocumentScroll(page, "V1 markdown/media pair should stay framed");
    await setReplayScrollTop(page, "#chat-messages", 0);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v1-markdown-media.png", SCREENSHOT_FOLDER),
    );

    await page.getByRole("link", { name: "Open new interface" }).click();
    await page.waitForURL(`${appServer.url}/app/`);
    await page.waitForTimeout(500);
    expect(pageErrors).toEqual([]);
    await waitForV2Shell(page);
    await setTimelineScrollTop(page, 0);
    await expectMarkdownMediaContent(page);
    await expect(page.getByText("title: hidden")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "rewrite docs" }))
      .toHaveAttribute("target", "_blank");
    const v2Code = page.locator(".at-message-markdown pre code.language-ts");
    await expect(v2Code).toHaveAttribute("data-language", "ts");
    await expect(v2Code.locator(".hljs-keyword").first()).toBeVisible();
    await expect.poll(() => codeOverflowMetrics(page)).toEqual(
      expect.objectContaining({ staysInsideTimeline: true, xScrollable: true }),
    );
    await expect(page.locator(`.at-message-media img[alt="${IMAGE_NAME}"]`))
      .toBeVisible();
    expect(await rowsDoNotOverlap(page)).toBe(true);
    await expectLongOutputOrderAndUniqueness(page);
    await expectNoDocumentScroll(page, "V2 markdown/media pair should stay framed");
    await expectComposerControlsDoNotOverlap(page);
    await setTimelineScrollTop(page, 0);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v2-markdown-media.png", SCREENSHOT_FOLDER),
    );
    await page.locator(".at-message-media .ant-image-mask").click();
    const previewWrap = page.locator(".ant-image-preview-wrap");
    await expect(previewWrap).toBeVisible();
    await expect(page.locator(".ant-image-preview-img")).toBeVisible();
    await captureStableViewportScreenshot(
      page,
      screenshotPath(
        "runtime-pair-v2-markdown-media-preview.png",
        SCREENSHOT_FOLDER,
      ),
    );
    await page.keyboard.press("Escape");
    await expect(previewWrap).toBeHidden();

    await page.reload();
    await waitForV2Shell(page);
    await setTimelineScrollTop(page, 0);
    await expectMarkdownMediaContent(page);
    await expectLongOutputOrderAndUniqueness(page);
    await expect(page.getByText("title: hidden")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "rewrite docs" }))
      .toHaveAttribute("target", "_blank");
    await expect(page.locator(`.at-message-media img[alt="${IMAGE_NAME}"]`))
      .toBeVisible();
    await expect.poll(() => codeOverflowMetrics(page)).toEqual(
      expect.objectContaining({ staysInsideTimeline: true, xScrollable: true }),
    );
    await expectNoDocumentScroll(page, "refreshed markdown/media replay should stay framed");
    await captureStableViewportScreenshot(
      page,
      screenshotPath("runtime-pair-v2-markdown-media-refreshed.png", SCREENSHOT_FOLDER),
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("renders markdown tables links highlighted code image media and long output in the V2 timeline", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await page.setViewportSize({ height: 900, width: 1280 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleMarkdownMediaApi,
      sessionTitle: "TS markdown media evidence",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await setTimelineScrollTop(page, 0);

    await expect(
      page.getByRole("heading", { level: 2, name: "Renderer Evidence" }),
    ).toBeVisible();
    await expect(page.getByText("title: hidden")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Timeline" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Stable" })).toBeVisible();

    const docsLink = page.getByRole("link", { name: "rewrite docs" });
    await expect(docsLink).toHaveAttribute("href", "/docs/frontend-rewrite");
    await expect(docsLink).toHaveAttribute("target", "_blank");

    const codeBlock = page.locator(".at-message-markdown pre code.language-ts");
    await expect(codeBlock).toContainText("renderLongMarkdownLine");
    await expect(codeBlock).toHaveAttribute("data-language", "ts");
    await expect(codeBlock.locator(".hljs-keyword").first()).toBeVisible();
    await expect
      .poll(() => codeOverflowMetrics(page))
      .toEqual(expect.objectContaining({
        staysInsideTimeline: true,
        xScrollable: true,
      }));

    const inlineImage = page.locator(`.at-message-media img[alt="${IMAGE_NAME}"]`);
    await expect(inlineImage).toBeVisible();
    await expect(page.getByText(IMAGE_NAME)).toBeVisible();
    await expect
      .poll(() =>
        inlineImage.evaluate((element) => {
          if (!(element instanceof HTMLImageElement)) {
            return false;
          }
          return element.complete && element.naturalWidth > 0;
        }),
      )
      .toBe(true);

    await expect(page.getByText("After markdown media block")).toBeVisible();
    expect(await rowsDoNotOverlap(page)).toBe(true);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "markdown/media/code replay should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-markdown-media-code.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleMarkdownMediaApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(markdownMediaMessages());
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/rounds`) {
    await context.fulfillJson({
      has_more: false,
      items: [markdownMediaRound()],
      next_cursor: null,
    });
    return true;
  }
  if (
    context.method === "GET" &&
    context.path === `/sessions/${SESSION_ID}/runs/run-markdown-media/token-usage`
  ) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  return false;
}

async function expectMarkdownMediaContent(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 2, name: "Renderer Evidence" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Stable" })).toBeVisible();
  const docsLink = page.getByRole("link", { name: "rewrite docs" });
  await expect(docsLink).toHaveAttribute("href", "/docs/frontend-rewrite");
  await expect(page.getByText("After markdown media block")).toBeVisible();
  await expect(page.getByText(LONG_OUTPUT_FIRST)).toHaveCount(1);
  await expect(page.getByText(LONG_OUTPUT_LAST)).toHaveCount(1);
}

async function expectLongOutputOrderAndUniqueness(page: Page): Promise<void> {
  const metrics = await page.evaluate((lines) => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("li"));
    const matches = lines.map((line) =>
      elements.filter((element) => (element.textContent ?? "").trim() === line),
    );
    return {
      counts: matches.map((items) => items.length),
      tops: matches.map((items) => items[0]?.getBoundingClientRect().top ?? null),
    };
  }, LONG_OUTPUT_LINES);
  expect(metrics.counts).toEqual(LONG_OUTPUT_LINES.map(() => 1));
  expect(metrics.tops.every((top) => top !== null)).toBe(true);
  const tops = metrics.tops.filter((top): top is number => top !== null);
  expect(tops).toEqual([...tops].sort((left, right) => left - right));
}

async function setReplayScrollTop(
  page: Page,
  selector: string,
  top: number,
): Promise<void> {
  await page.locator(selector).evaluate((element, nextTop) => {
    element.scrollTop = nextTop;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, top);
}

async function setTimelineScrollTop(page: Page, top: number): Promise<void> {
  await page.locator(".at-timeline").evaluate((element, nextTop) => {
    element.scrollTop = nextTop;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, top);
}

async function codeOverflowMetrics(page: Page): Promise<CodeOverflowMetrics> {
  return page.locator(".at-message-markdown pre").evaluate((element) => {
    const timeline = element.closest(".at-timeline");
    const markdown = element.closest(".at-message-markdown");
    const message = element.closest(".at-message");
    const content = element.closest(".at-message-content");
    const code = element.querySelector("code");
    const elementRect = element.getBoundingClientRect();
    const timelineRect = timeline?.getBoundingClientRect() ?? elementRect;
    return {
      codeScrollWidth: code?.scrollWidth ?? 0,
      contentWidth: content?.getBoundingClientRect().width ?? 0,
      markdownWidth: markdown?.getBoundingClientRect().width ?? 0,
      messageWidth: message?.getBoundingClientRect().width ?? 0,
      parentChain: Array.from(
        (function* parentElements(start: Element): Generator<Element> {
          let current: Element | null = start;
          while (current !== null && current !== document.body) {
            yield current;
            current = current.parentElement;
          }
        })(element),
      ).map((node) => `${node.tagName.toLowerCase()}.${node.className}`),
      preClientWidth: element.clientWidth,
      preScrollWidth: element.scrollWidth,
      preWidth: elementRect.width,
      staysInsideTimeline: elementRect.right <= timelineRect.right + 1,
      timelineWidth: timelineRect.width,
      xScrollable: element.scrollWidth > element.clientWidth,
    };
  });
}

async function rowsDoNotOverlap(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".at-timeline-row.at-message"),
    );
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]?.getBoundingClientRect();
      const current = rows[index]?.getBoundingClientRect();
      if (previous === undefined || current === undefined) {
        return false;
      }
      if (current.top < previous.bottom - 1) {
        return false;
      }
    }
    return rows.length >= 2;
  });
}

interface CodeOverflowMetrics {
  codeScrollWidth: number;
  contentWidth: number;
  markdownWidth: number;
  messageWidth: number;
  parentChain: string[];
  preClientWidth: number;
  preScrollWidth: number;
  preWidth: number;
  staysInsideTimeline: boolean;
  timelineWidth: number;
  xScrollable: boolean;
}

function markdownMediaMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Show the markdown, code, and image replay fixture.",
      created_at: "2026-07-01T12:00:00Z",
      message_id: "markdown-media-user",
      role: "user",
      run_id: "run-markdown-media",
    },
    {
      created_at: "2026-07-01T12:00:02Z",
      message: {
        parts: markdownMediaAssistantParts(),
      },
      message_id: "markdown-media-assistant",
      role_id: "MainAgent",
      run_id: "run-markdown-media",
    },
    {
      content: "After markdown media block",
      created_at: "2026-07-01T12:00:04Z",
      message_id: "markdown-media-after",
      role_id: "MainAgent",
      run_id: "run-markdown-media",
    },
  ];
}

function markdownMediaRound(): Record<string, unknown> {
  return {
    coordinator_messages: [
      {
        created_at: "2026-07-01T12:00:02Z",
        message: {
          parts: [markdownTextPart()],
        },
        role_id: "MainAgent",
      },
      {
        created_at: "2026-07-01T12:00:04Z",
        message: {
          parts: [
            { content: "After markdown media block", part_kind: "text" },
          ],
        },
        role_id: "MainAgent",
      },
    ],
    created_at: "2026-07-01T12:00:00Z",
    has_final_output: true,
    input_tokens: 42,
    intent: "Show the markdown, code, and image replay fixture.",
    intent_parts: [
      { kind: "text", text: "Show the markdown, code, and image replay fixture." },
    ],
    output_tokens: 84,
    run_id: "run-markdown-media",
    run_phase: "completed",
    run_status: "completed",
    run_updated_at: "2026-07-01T12:00:04Z",
    run_user_message: "Show the markdown, code, and image replay fixture.",
    verification_status: "verified",
  };
}

function markdownMediaAssistantParts(): Record<string, unknown>[] {
  return [
    markdownTextPart(),
    {
      asset_id: "asset-markdown-diagram",
      content: "",
      kind: "media_ref",
      mime_type: "image/svg+xml",
      modality: "image",
      name: IMAGE_NAME,
      part_kind: "media_ref",
      text: "",
      url: IMAGE_DATA_URL,
    },
  ];
}

function markdownTextPart(): Record<string, unknown> {
  return {
    content: markdownFixture(),
    kind: "text",
    part_kind: "text",
    text: markdownFixture(),
  };
}

function markdownFixture(): string {
  const longValue = "x".repeat(220);
  const longOutput = Array.from(
    { length: 18 },
    (_, index) => `- Long output checkpoint ${String(index + 1).padStart(2, "0")} stays ordered.`,
  );
  return [
    "---",
    "title: hidden",
    "---",
    "## Renderer Evidence",
    "",
    "| Surface | State |",
    "| --- | --- |",
    "| Timeline | Stable |",
    "",
    "Open the [rewrite docs](/docs/frontend-rewrite).",
    "",
    "```ts",
    "export function renderLongMarkdownLine() {",
    `  const value = "${longValue}";`,
    "  return value.length;",
    "}",
    "```",
    "",
    "### Long output",
    "",
    ...longOutput,
  ].join("\n");
}
