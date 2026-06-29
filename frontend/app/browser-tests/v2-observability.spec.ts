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

const SCREENSHOT_FOLDER = "frontend-v2-ts-observability";
const RUN_ID = "run-shell";
const SPEC_TASK_ID = "task-spec-lineage";

test("opens observability from the top bar and renders spec lineage", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const requestedUrls: string[] = [];
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleObservabilityApi(context, requestedUrls),
      sessionTitle: "TS observability",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await page
      .getByRole("banner")
      .getByRole("button", { name: "Observability" })
      .click();
    const observability = page.locator(".at-surface-view").filter({
      hasText: "Observability",
    });
    await expect(
      observability.getByRole("heading", { name: "Observability" }),
    ).toBeVisible();
    await expect(
      observability.locator(".at-stat").filter({ hasText: "Steps" }).filter({
        hasText: "12",
      }),
    ).toBeVisible();
    await expect(observability.getByText("Agent loop")).toBeVisible();

    await observability.getByText("Session", { exact: true }).click();
    await expect(
      observability.locator(".at-stat").filter({ hasText: "Steps" }).filter({
        hasText: "3",
      }),
    ).toBeVisible();
    await expect(observability.getByText("Session tools")).toBeVisible();

    await observability.getByText("Global", { exact: true }).click();
    const gatewaySignals = observability.locator(
      '[data-observability-section="gateway-signals"]',
    );
    await expect(gatewaySignals.getByText("Gateway Signals")).toBeVisible();
    await expect(
      gatewaySignals
        .locator('[data-observability-metric="gateway_calls"]')
        .filter({ hasText: "Gateway Calls" })
        .filter({ hasText: "3" }),
    ).toBeVisible();
    await expect(
      gatewaySignals
        .locator(
          '[data-observability-metric="gateway_prompt_avg_first_update_ms"]',
        )
        .filter({ hasText: "Prompt First Update ms" })
        .filter({ hasText: "180" }),
    ).toBeVisible();
    await expect(
      observability.locator('[data-observability-section="gateway-breakdowns"]'),
    ).toContainText("Gateway Breakdown");
    await expect(
      observability.locator('[data-observability-section="gateway-breakdowns"]'),
    ).toContainText("session_prompt");
    await expect(
      observability.locator('[data-observability-section="gateway-breakdowns"]'),
    ).toContainText("Gateway Latency");
    await expect(
      observability.locator('[data-observability-chart="gateway-breakdown-calls"]'),
    ).toContainText("Gateway Calls");
    await expect(
      observability.locator('[data-observability-chart="gateway-breakdown-duration"]'),
    ).toContainText("Gateway Latency");
    await expect(
      observability.locator(
        '[data-observability-chart="gateway-breakdown-cold-starts"]',
      ),
    ).toContainText("Gateway Cold Starts");

    const specLineage = observability.locator(".at-spec-lineage");
    await expect(
      specLineage.getByRole("heading", { name: "Spec lineage" }),
    ).toBeVisible();
    await expect(specLineage.getByLabel("Task")).toHaveValue(SPEC_TASK_ID);
    await expect(specLineage.getByText("Requirements")).toBeVisible();
    await expect(specLineage.getByText("+ Keep spec diff visible"))
      .toBeVisible();
    await expect(specLineage.getByText("Spec remains aligned with the shell target."))
      .toBeVisible();

    for (const requestedUrl of [
      "/observability/overview?scope=global&time_window_minutes=1440",
      "/observability/breakdowns?scope=global&time_window_minutes=1440",
      `/observability/overview?scope=session&scope_id=${SESSION_ID}&time_window_minutes=1440`,
      `/observability/breakdowns?scope=session&scope_id=${SESSION_ID}&time_window_minutes=1440`,
      `/tasks/runs/${RUN_ID}?include_root=true`,
      `/tasks/${SPEC_TASK_ID}/spec-artifacts`,
      `/tasks/${SPEC_TASK_ID}/spec-artifacts/2/diff?from_version=1`,
      `/tasks/${SPEC_TASK_ID}/spec-checkpoint-evaluations`,
    ]) {
      expect(requestedUrls).toContain(requestedUrl);
    }
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 observability should stay inside the fixed shell",
    );
    await page.mouse.move(320, 120);
    await page.screenshot({
      path: screenshotPath("v2-observability-session.png", SCREENSHOT_FOLDER),
    });
    await gatewaySignals.scrollIntoViewIfNeeded();
    await page.mouse.move(320, 340);
    await page.screenshot({
      path: screenshotPath("v2-observability-gateway.png", SCREENSHOT_FOLDER),
    });
    await specLineage.scrollIntoViewIfNeeded();
    await page.mouse.move(320, 340);
    await page.screenshot({
      path: screenshotPath("v2-observability-spec-lineage.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function handleObservabilityApi(
  context: MockApiRouteContext,
  requestedUrls: string[],
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  requestedUrls.push(`${context.path}${context.url.search}`);
  const response = observabilityResponse(context.path, context.url.searchParams);
  if (response === undefined) {
    return false;
  }
  await context.fulfillJson(response);
  return true;
}

function observabilityResponse(
  path: string,
  searchParams: URLSearchParams,
): unknown | undefined {
  if (path === `/sessions/${SESSION_ID}/rounds`) {
    return roundsPageResponse();
  }
  if (path === "/observability/overview") {
    return observabilityOverviewResponse(searchParams);
  }
  if (path === "/observability/breakdowns") {
    return observabilityBreakdownsResponse(searchParams);
  }
  if (path === `/tasks/runs/${RUN_ID}`) {
    return runTasksResponse();
  }
  if (path === `/tasks/${SPEC_TASK_ID}/spec-artifacts`) {
    return specArtifactsResponse();
  }
  if (path === `/tasks/${SPEC_TASK_ID}/spec-artifacts/2/diff`) {
    return specArtifactDiffResponse();
  }
  if (path === `/tasks/${SPEC_TASK_ID}/spec-checkpoint-evaluations`) {
    return specCheckpointEvaluationsResponse();
  }
  return undefined;
}

function roundsPageResponse(): Record<string, unknown> {
  return {
    has_more: false,
    items: [
      {
        created_at: "2026-06-25T08:00:01Z",
        has_final_output: true,
        intent: "Observability prompt",
        intent_parts: [{ kind: "text", text: "Observability prompt" }],
        run_id: RUN_ID,
        run_phase: "completed",
        run_status: "completed",
        run_updated_at: "2026-06-25T08:15:00Z",
        run_user_message: "Observability prompt",
      },
    ],
    next_cursor: null,
  };
}

function observabilityOverviewResponse(
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const scope = searchParams.get("scope") ?? "global";
  if (scope === "session") {
    return {
      kpis: {
        input_tokens: 2048,
        output_tokens: 512,
        steps: 3,
        tool_avg_duration_ms: 55,
        tool_calls: 2,
        tool_success_rate: 1,
      },
      scope: "session",
      scope_id: searchParams.get("scope_id") ?? "",
      updated_at: "2026-06-25T08:31:00Z",
    };
  }
  return {
    kpis: {
      input_tokens: 112000,
      output_tokens: 790,
      gateway_calls: 3,
      gateway_cold_start_calls: 1,
      gateway_prompt_avg_first_update_ms: 180,
      steps: 12,
      tool_avg_duration_ms: 88,
      tool_calls: 7,
      tool_success_rate: 0.9,
    },
    scope: "global",
    updated_at: "2026-06-25T08:30:00Z",
  };
}

function observabilityBreakdownsResponse(
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const scope = searchParams.get("scope") ?? "global";
  if (scope === "session") {
    return {
      rows: [
        {
          avg_duration_ms: 55,
          calls: 2,
          name: "Session tools",
          success_rate: 1,
        },
      ],
      updated_at: "2026-06-25T08:31:00Z",
    };
  }
  return {
    rows: [
      {
        avg_duration_ms: 88,
        calls: 7,
        name: "Agent loop",
        success_rate: 0.9,
      },
    ],
    gateway_rows: [
      {
        avg_duration_ms: 93,
        calls: 3,
        cold_start_calls: 1,
        failures: 0,
        gateway_operation: "session_prompt",
        gateway_phase: "request",
        gateway_transport: "stdio",
        success_rate: 1,
      },
    ],
    updated_at: "2026-06-25T08:30:00Z",
  };
}

function runTasksResponse(): Record<string, unknown> {
  return {
    tasks: [
      {
        objective: "Keep the task projection visible.",
        status: "completed",
        task_id: "task-plain",
        title: "Plain task",
      },
      {
        objective: "Show spec artifact history in the shell.",
        spec_artifact_id: "spec-2",
        status: "completed",
        task_id: SPEC_TASK_ID,
        title: "Implement spec lineage",
      },
    ],
  };
}

function specArtifactsResponse(): Record<string, unknown> {
  return {
    task_id: SPEC_TASK_ID,
    versions: [
      {
        artifact_id: "spec-1",
        created_at: "2026-06-25T08:05:00Z",
        session_id: SESSION_ID,
        task_id: SPEC_TASK_ID,
        trace_id: RUN_ID,
        updated_at: "2026-06-25T08:05:00Z",
        version: 1,
      },
      {
        artifact_id: "spec-2",
        created_at: "2026-06-25T08:15:00Z",
        session_id: SESSION_ID,
        task_id: SPEC_TASK_ID,
        trace_id: RUN_ID,
        updated_at: "2026-06-25T08:15:00Z",
        version: 2,
      },
    ],
  };
}

function specArtifactDiffResponse(): Record<string, unknown> {
  return {
    field_changes: [
      {
        added_items: ["Keep spec diff visible"],
        change_type: "modified",
        field_label: "Requirements",
        field_name: "requirements",
        removed_items: ["Sketch spec history offline"],
      },
    ],
    from_artifact_id: "spec-1",
    from_version: 1,
    has_changes: true,
    summary: "Spec lineage became a visible observability surface.",
    task_id: SPEC_TASK_ID,
    to_artifact_id: "spec-2",
    to_version: 2,
  };
}

function specCheckpointEvaluationsResponse(): Record<string, unknown> {
  return {
    evaluations: [
      {
        artifact_id: "spec-2",
        checkpoint_seq: 2,
        created_at: "2026-06-25T08:16:00Z",
        drift_detected: false,
        evaluation_id: "eval-spec-lineage",
        evaluator: "reviewer",
        overall_score: 4.5,
        session_id: SESSION_ID,
        summary: "Spec remains aligned with the shell target.",
        task_id: SPEC_TASK_ID,
        trace_id: RUN_ID,
      },
    ],
    task_id: SPEC_TASK_ID,
  };
}
