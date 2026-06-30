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

const SCREENSHOT_FOLDER = "frontend-v2-ts-markdown-media";
const IMAGE_NAME = "markdown-diagram.svg";
const IMAGE_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMjAiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMjIwIDEyOCI+PHJlY3Qgd2lkdGg9IjIyMCIgaGVpZ2h0PSIxMjgiIHJ4PSIxMiIgZmlsbD0iIzA5NjlEQSIvPjxjaXJjbGUgY3g9IjU4IiBjeT0iNjQiIHI9IjI4IiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9Ii44NSIvPjxwYXRoIGQ9Ik0xMDAgOTBMMTMwIDUyTDE3MiA5MFoiIGZpbGw9IiNBNURGRkYiLz48cGF0aCBkPSJNMzAgMjhIMTkwIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIuNDgiLz48L3N2Zz4=";

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
  return false;
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
    const elementRect = element.getBoundingClientRect();
    const timelineRect = timeline?.getBoundingClientRect() ?? elementRect;
    return {
      staysInsideTimeline: elementRect.right <= timelineRect.right + 1,
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
  staysInsideTimeline: boolean;
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
        parts: [
          {
            kind: "text",
            text: markdownFixture(),
          },
          {
            asset_id: "asset-markdown-diagram",
            kind: "media_ref",
            mime_type: "image/svg+xml",
            modality: "image",
            name: IMAGE_NAME,
            url: IMAGE_DATA_URL,
          },
        ],
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

function markdownFixture(): string {
  const longValue = "x".repeat(220);
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
  ].join("\n");
}
