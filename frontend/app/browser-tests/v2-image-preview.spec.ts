import { expect, test } from "@playwright/test";

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

const SCREENSHOT_FOLDER = "frontend-v2-ts-image-preview";
const IMAGE_NAME = "diagram-preview.svg";
const IMAGE_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxODAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTgwIDEyMCI+PHJlY3Qgd2lkdGg9IjE4MCIgaGVpZ2h0PSIxMjAiIHJ4PSIxMCIgZmlsbD0iIzA5NjlEQSIvPjxjaXJjbGUgY3g9IjUyIiBjeT0iNjAiIHI9IjI0IiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjAuODIiLz48cGF0aCBkPSJNODggODRMMTE4IDQ4TDE1MiA4NFoiIGZpbGw9IiNBNURGRkYiLz48cGF0aCBkPSJNMjQgMjRIMTU2IiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIwLjQ1Ii8+PC9zdmc+";

test("renders persisted image media and opens the timeline preview", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleImagePreviewApi,
      sessionTitle: "TS image preview evidence",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await expect(page.getByText("Image preview is attached below.")).toBeVisible();
    const inlineImage = page.locator(
      `.at-message-media img[alt="${IMAGE_NAME}"]`,
    );
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

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "image media hydration should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);

    await page.locator(".at-message-media .ant-image-mask").click();
    await expect(page.locator(".ant-image-preview-mask")).toBeVisible();
    const previewWrap = page.locator(".ant-image-preview-wrap");
    await expect(previewWrap).toBeVisible();
    await expect(page.locator(".ant-image-preview-img")).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: screenshotPath("v2-image-preview-open.png", SCREENSHOT_FOLDER),
    });

    await page.keyboard.press("Escape");
    await expect(previewWrap).toBeHidden();
    await expectNoDocumentScroll(
      page,
      "closing image preview should restore the fixed V2 shell",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function handleImagePreviewApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson(imagePreviewMessages());
    return true;
  }
  return false;
}

function imagePreviewMessages(): Record<string, unknown>[] {
  return [
    {
      content: "Can you show the generated diagram?",
      created_at: "2026-06-26T09:00:00Z",
      message_id: "message-image-preview-user",
      role: "user",
      run_id: "run-image-preview",
    },
    {
      created_at: "2026-06-26T09:00:02Z",
      message: {
        parts: [
          {
            kind: "text",
            text: "Image preview is attached below.",
          },
          {
            asset_id: "asset-image-preview",
            kind: "media_ref",
            mime_type: "image/svg+xml",
            modality: "image",
            name: IMAGE_NAME,
            url: IMAGE_DATA_URL,
          },
        ],
      },
      message_id: "message-image-preview-assistant",
      role_id: "MainAgent",
      run_id: "run-image-preview",
    },
  ];
}
