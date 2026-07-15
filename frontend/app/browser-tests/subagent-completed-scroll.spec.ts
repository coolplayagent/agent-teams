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
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const INSTANCE_ID = "subagent-completed-scroll-instance";
const RUN_ID = "subagent-completed-scroll-run";
const SCREENSHOT_FOLDER = "subagent-completed-scroll";

test("keeps long completed subagent prompt and transcript independently scrollable", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handleCompletedSubagentApi,
      sessionTitle: "Completed subagent scroll owner",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);
    await page.setViewportSize({ height: 832, width: 860 });
    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const card = page
      .locator('.at-message-tool.is-openable-subagent[data-tool-name="spawn_subagent"]')
      .filter({ hasText: "Long completed investigation" });
    await expect(card).toBeVisible();
    await card.locator(".at-message-tool-summary").click();

    const panel = page.locator(".at-subagent-session-view");
    await expect(panel.getByRole("heading", {
      name: "Long completed investigation",
    })).toBeVisible();
    const prompt = panel.locator(".at-subagent-session-prompt");
    const timeline = panel.locator(
      ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
    );
    await expect(prompt).toBeVisible();
    await expect(timeline).toBeVisible();
    await expect(timeline).toHaveAttribute("data-total-row-count", "1");
    const promptGeometry = await prompt.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    const geometryBefore = await timeline.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(promptGeometry.clientHeight).toBeGreaterThan(160);
    expect(promptGeometry.scrollHeight).toBeGreaterThan(
      promptGeometry.clientHeight + 500,
    );
    expect(geometryBefore.clientHeight).toBeGreaterThan(220);
    expect(geometryBefore.scrollHeight).toBeGreaterThan(
      geometryBefore.clientHeight + 800,
    );

    await page.screenshot({
      animations: "disabled",
      path: screenshotPath(
        "v2-completed-subagent-before-scroll.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await prompt.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => prompt.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    for (let index = 0; index < 8; index += 1) {
      await page.mouse.wheel(0, 2_000);
    }
    await expect.poll(() => prompt.evaluate((element) =>
      element.scrollHeight - element.clientHeight - element.scrollTop
    )).toBeLessThanOrEqual(1);

    await timeline.hover();
    await page.mouse.wheel(0, -900);
    await expect.poll(() => timeline.evaluate((element) => element.scrollTop))
      .toBeLessThan(geometryBefore.scrollTop);
    const scrolledUp = await timeline.evaluate((element) => element.scrollTop);
    expect(scrolledUp).toBeGreaterThanOrEqual(0);

    for (let index = 0; index < 8; index += 1) {
      await page.mouse.wheel(0, 2_000);
    }
    await expect.poll(() => timeline.evaluate((element) =>
      element.scrollHeight - element.clientHeight - element.scrollTop
    )).toBeLessThanOrEqual(1);
    await expectNoDocumentScroll(
      page,
      "completed subagent prompt and transcript must scroll inside the panel",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath(
        "v2-completed-subagent-after-scroll.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleCompletedSubagentApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === `/sessions/${SESSION_ID}/messages`) {
    await context.fulfillJson([completedSubagentToolMessage()]);
    return true;
  }
  if (context.path === `/sessions/${SESSION_ID}/subagents`) {
    await context.fulfillJson([completedSubagentRecord()]);
    return true;
  }
  if (
    context.path ===
    `/sessions/${SESSION_ID}/agents/${INSTANCE_ID}/messages`
  ) {
    await context.fulfillJson(completedSubagentMessages());
    return true;
  }
  return false;
}

function completedSubagentToolMessage(): Record<string, unknown> {
  return {
    created_at: "2026-07-12T00:00:00Z",
    message: {
      parts: [{
        content: {
          prompt: completedSubagentPrompt(),
          subagent_instance_id: INSTANCE_ID,
          subagent_role_id: "Explorer",
          subagent_run_id: RUN_ID,
          title: "Long completed investigation",
        },
        kind: "tool-return",
        outcome: "completed",
        tool_call_id: "call-completed-subagent-scroll",
        tool_name: "spawn_subagent",
      }],
    },
    message_id: "message-completed-subagent-scroll",
    role_id: "MainAgent",
    run_id: "parent-completed-subagent-scroll",
  };
}

function completedSubagentPrompt(): string {
  return Array.from({ length: 36 }, (_, index) => [
    `${index + 1}. Investigate completed workflow area ${index + 1}.`,
    "Verify navigation, restoration, streaming state, and failure recovery with concrete evidence.",
  ].join(" ")).join("\n\n");
}

function completedSubagentRecord(): Record<string, unknown> {
  return {
    created_at: "2026-07-12T00:00:00Z",
    instance_id: INSTANCE_ID,
    last_event_id: 240,
    role_id: "Explorer",
    run_id: RUN_ID,
    run_phase: "completed",
    run_status: "completed",
    session_id: SESSION_ID,
    status: "completed",
    subagent_kind: "normal",
    title: "Long completed investigation",
    updated_at: "2026-07-12T00:05:00Z",
  };
}

function completedSubagentMessages(): Array<Record<string, unknown>> {
  return [{
    content: Array.from({ length: 80 }, (_, index) => [
      `## Completed section ${String(index + 1).padStart(3, "0")}`,
      "",
      "The completed agent report remains readable while the parent session stays mounted.",
      "",
      `- Evidence ${index + 1}: ${"detail ".repeat(14)}`,
    ].join("\n")).join("\n\n"),
    created_at: "2026-07-12T00:05:00Z",
    message_id: "completed-subagent-message",
    role_id: "Explorer",
    run_id: RUN_ID,
  }];
}
