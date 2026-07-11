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
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-token-usage";

test("shows primary-role token context and force-refreshes usage in the V2 shell", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const requestedTokenUsageUrls: string[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleTokenUsageApi(context, requestedTokenUsageUrls),
      sessionTitle: "TS token context",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const tokenUsage = page.locator(".at-token-usage");
    const tokenPairs = tokenUsage.locator(".at-token-usage-pair");
    await expect(tokenUsage).toHaveAttribute("data-state", "ready");
    await expect(tokenUsage.getByText("Tokens")).toBeVisible();
    await expect(tokenPairs.filter({ hasText: "Input" })).toContainText("112k");
    await expect(tokenPairs.filter({ hasText: "Output" })).toContainText("791");
    await expect(tokenPairs.filter({ hasText: "Total" })).toContainText("113k");
    await expect(tokenPairs.filter({ hasText: "Context" }))
      .toContainText("112k / 10k");
    await expect(tokenUsage.getByText("200k / 2k")).toHaveCount(0);
    await expect(tokenUsage).toHaveAttribute(
      "title",
      /context MainAgent Latest request input \/ context window: 112,000 \/ 10,000/,
    );
    expect(requestedTokenUsageUrls).toEqual([
      `/sessions/${SESSION_ID}/token-usage`,
    ]);

    await page.getByRole("button", { name: "Refresh token usage" }).click();
    await expect
      .poll(() => requestedTokenUsageUrls)
      .toContain(`/sessions/${SESSION_ID}/token-usage?force_refresh=true`);
    await expect(tokenPairs.filter({ hasText: "Context" }))
      .toContainText("64k / 128k");
    await expect(tokenUsage).toHaveAttribute(
      "title",
      /context MainAgent Latest request input \/ context window: 64,000 \/ 128,000/,
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "token usage context indicator should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-token-usage-context.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleTokenUsageApi(
  context: MockApiRouteContext,
  requestedTokenUsageUrls: string[],
): Promise<boolean> {
  if (context.method !== "GET" || context.path !== `/sessions/${SESSION_ID}/token-usage`) {
    return false;
  }
  requestedTokenUsageUrls.push(`${context.path}${context.url.search}`);
  const forceRefresh = context.url.searchParams.get("force_refresh") === "true";
  await context.fulfillJson(
    forceRefresh
      ? tokenUsagePayload({
          contextWindow: 128_000,
          input: 64_000,
          output: 1_024,
          total: 65_024,
        })
      : tokenUsagePayload({
          contextWindow: 10_000,
          helperContextWindow: 2_000,
          helperInput: 200_000,
          input: 112_000,
          output: 791,
          total: 113_000,
        }),
  );
  return true;
}

interface TokenUsageFixture {
  contextWindow: number;
  helperContextWindow?: number;
  helperInput?: number;
  input: number;
  output: number;
  total: number;
}

function tokenUsagePayload(values: TokenUsageFixture): Record<string, unknown> {
  return {
    by_role: {
      MainAgent: {
        cached_input_tokens: 120,
        context_window: values.contextWindow,
        input_tokens: values.input,
        latest_input_tokens: values.input,
        max_input_tokens: values.input,
        model_profile: "default",
        output_tokens: values.output,
        reasoning_output_tokens: 40,
        requests: 2,
        role_id: "MainAgent",
        tool_calls: 1,
        total_tokens: values.total,
      },
      ...(values.helperInput !== undefined &&
      values.helperContextWindow !== undefined
        ? {
            HelperAgent: {
              cached_input_tokens: 0,
              context_window: values.helperContextWindow,
              input_tokens: values.helperInput,
              latest_input_tokens: values.helperInput,
              max_input_tokens: values.helperInput,
              model_profile: "default",
              output_tokens: 0,
              reasoning_output_tokens: 0,
              requests: 1,
              role_id: "HelperAgent",
              tool_calls: 0,
              total_tokens: values.helperInput,
            },
          }
        : {}),
    },
    session_id: SESSION_ID,
    total_cached_input_tokens: 120,
    total_input_tokens: values.input,
    total_output_tokens: values.output,
    total_reasoning_output_tokens: 40,
    total_requests: 2,
    total_tokens: values.total,
    total_tool_calls: 1,
  };
}
