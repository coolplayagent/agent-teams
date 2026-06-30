import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installMockEventSource,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForEventSourceUrl,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-v2-composer-controls";
const SCREENSHOT_FOLDER = "frontend-v2-ts-composer-controls";
const IMAGE_NAME = "composer-chart.png";
const PROMPT_TEXT = "Composer browser line one\nline two after shift enter";

interface ComposerControlsState {
  modelProfilePatchRequests: Array<string | null>;
  runCreateRequests: Array<Record<string, unknown>>;
  session: Record<string, unknown>;
  topologyPatchRequests: Array<Record<string, unknown>>;
}

test("submits multiline image prompt with composer topology and run option controls", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: ComposerControlsState = {
    modelProfilePatchRequests: [],
    runCreateRequests: [],
    session: initialSession(),
    topologyPatchRequests: [],
  };
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerControlsApi(context, state),
      sessionTitle: "TS composer controls",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expect(page.getByText("No messages yet")).toBeVisible();

    await selectComposerOption(page, ".at-normal-root-role-select", "Writer");
    await expect.poll(() => state.topologyPatchRequests.length).toBe(1);
    expect(state.topologyPatchRequests.at(-1)).toMatchObject({
      normal_root_role_id: "Writer",
      orchestration_preset_id: null,
      session_mode: "normal",
    });

    await selectComposerOption(
      page,
      ".at-model-profile-select",
      "vision - gpt-4o-vision",
    );
    await expect.poll(() => state.modelProfilePatchRequests.at(-1)).toBe("vision");

    await page.locator(".at-session-mode-control").getByText("Orchestration")
      .click();
    await expect.poll(() => state.topologyPatchRequests.length).toBe(2);
    expect(state.topologyPatchRequests.at(-1)).toMatchObject({
      normal_root_role_id: null,
      orchestration_preset_id: "review",
      session_mode: "orchestration",
    });

    await selectComposerOption(page, ".at-orchestration-preset-select", "Ship");
    await expect.poll(() => state.topologyPatchRequests.length).toBe(3);
    expect(state.topologyPatchRequests.at(-1)).toMatchObject({
      normal_root_role_id: null,
      orchestration_preset_id: "ship",
      session_mode: "orchestration",
    });

    await selectComposerOption(page, ".at-role-select", "Reviewer");
    await page.getByRole("switch", { name: "Thinking" }).click();
    await page.getByRole("checkbox", { name: "Shell safety policy" }).click();
    await page.getByRole("checkbox", { name: "YOLO" }).click();

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.click();
    await page.keyboard.type("Composer browser line one");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("line two after shift enter");
    await expect(prompt).toHaveValue(PROMPT_TEXT);
    await pasteImageIntoPrompt(page, IMAGE_NAME);
    await expect(page.getByLabel("Prompt attachments")).toBeVisible();
    await expect(page.getByText(IMAGE_NAME)).toBeVisible();

    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    assertRunCreateRequest(state.runCreateRequests[0]);
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-composer-controls\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(prompt).toBeEnabled();
    await expect(page.locator(".at-role-select")).toHaveClass(/ant-select-disabled/);
    await expect(page.locator(".at-model-profile-select"))
      .toHaveClass(/ant-select-disabled/);
    await expect(page.locator(".at-thinking-effort-select"))
      .toHaveClass(/ant-select-disabled/);
    await expect(page.getByRole("checkbox", { name: "Shell safety policy" }))
      .toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "YOLO" })).toBeDisabled();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "composer controls flow should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath(
        "v2-composer-controls-options.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

async function handleComposerControlsApi(
  context: MockApiRouteContext,
  state: ComposerControlsState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(state.session);
    return true;
  }
  if (context.method === "GET" && context.path === "/roles:options") {
    await context.fulfillJson(roleOptions());
    return true;
  }
  if (
    context.method === "GET" &&
    context.path === "/system/configs/model/profiles"
  ) {
    await context.fulfillJson(modelProfiles());
    return true;
  }
  if (
    context.method === "GET" &&
    context.path === "/system/configs/orchestration"
  ) {
    await context.fulfillJson(orchestrationConfig());
    return true;
  }
  if (
    context.method === "PATCH" &&
    context.path === `/sessions/${SESSION_ID}/topology`
  ) {
    const payload = readRequestBody(context);
    state.topologyPatchRequests.push(payload);
    state.session = {
      ...state.session,
      normal_root_role_id:
        typeof payload.normal_root_role_id === "string"
          ? payload.normal_root_role_id
          : null,
      orchestration_preset_id:
        typeof payload.orchestration_preset_id === "string"
          ? payload.orchestration_preset_id
          : null,
      session_mode:
        payload.session_mode === "orchestration" ? "orchestration" : "normal",
    };
    await context.fulfillJson(state.session);
    return true;
  }
  if (
    context.method === "PATCH" &&
    context.path === `/sessions/${SESSION_ID}/normal-model-profile`
  ) {
    const payload = readRequestBody(context);
    const nextModelProfile =
      typeof payload.normal_model_profile === "string"
        ? payload.normal_model_profile
        : null;
    state.modelProfilePatchRequests.push(nextModelProfile);
    state.session = {
      ...state.session,
      normal_model_profile: nextModelProfile,
    };
    await context.fulfillJson(state.session);
    return true;
  }
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    const request = readRequestBody(context);
    state.runCreateRequests.push(request);
    await context.fulfillJson({
      run_id: RUN_ID,
      session_id: SESSION_ID,
      target_role_id:
        typeof request.target_role_id === "string"
          ? request.target_role_id
          : null,
    });
    return true;
  }
  return false;
}

async function selectComposerOption(
  page: Page,
  selector: string,
  optionText: string,
): Promise<void> {
  await page.locator(selector).click();
  const option = page
    .locator(".ant-select-item-option-content")
    .filter({ hasText: optionText })
    .last();
  await expect(option).toBeVisible();
  await option.click();
}

async function pasteImageIntoPrompt(page: Page, filename: string): Promise<void> {
  await page.getByRole("textbox", { name: "Prompt" }).evaluate((element, name) => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const file = new File([bytes], name, { type: "image/png" });
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [
          {
            getAsFile: () => file,
            type: "image/png",
          },
        ],
      },
    });
    element.dispatchEvent(event);
  }, filename);
}

function assertRunCreateRequest(request: Record<string, unknown> | undefined): void {
  expect(request).toMatchObject({
    session_id: SESSION_ID,
    shell_safety_policy_enabled: false,
    target_role_id: "Reviewer",
    thinking: {
      effort: "medium",
      enabled: true,
    },
    yolo: false,
  });
  const input = arrayValue(request?.input);
  expect(input).toHaveLength(2);
  expect(input[0]).toEqual({
    kind: "text",
    text: PROMPT_TEXT,
  });
  expect(input[1]).toMatchObject({
    height: null,
    kind: "inline_media",
    mime_type: "image/png",
    modality: "image",
    name: IMAGE_NAME,
    size_bytes: 8,
    width: null,
  });
  expect(stringValue(recordValue(input[1])?.base64_data).length).toBeGreaterThan(0);
  expect(request?.display_input).toEqual(input);
}

function initialSession(): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-25T08:00:00Z",
    normal_model_profile: "",
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: SESSION_ID,
    session_mode: "normal",
    title: "TS composer controls",
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function roleOptions(): Record<string, unknown> {
  const mainAgent = roleOption("MainAgent", "Main Agent");
  return {
    coordinator_role: roleOption("Coordinator", "Coordinator"),
    coordinator_role_id: "Coordinator",
    main_agent_role: mainAgent,
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      mainAgent,
      roleOption("Writer", "Writer"),
      roleOption("Reviewer", "Reviewer"),
    ],
    subagent_roles: [],
  };
}

function roleOption(roleId: string, name: string): Record<string, unknown> {
  return {
    capabilities: {
      input: {
        image: true,
      },
    },
    description: `${name} role`,
    input_modalities: ["text", "image"],
    name,
    role_id: roleId,
  };
}

function modelProfiles(): Record<string, unknown> {
  return {
    default: {
      capabilities: {
        input: {
          image: true,
        },
      },
      input_modalities: ["text", "image"],
      is_default: true,
      model: "gpt-4o-mini",
      provider: "openai",
    },
    fast: {
      capabilities: {
        input: {
          image: false,
        },
      },
      input_modalities: ["text"],
      model: "gpt-4o-fast",
      provider: "openai",
    },
    vision: {
      capabilities: {
        input: {
          image: true,
        },
      },
      input_modalities: ["text", "image"],
      model: "gpt-4o-vision",
      provider: "openai",
    },
  };
}

function orchestrationConfig(): Record<string, unknown> {
  return {
    default_orchestration_preset_id: "review",
    presets: [
      {
        name: "Review",
        orchestration_prompt: "Review implementation details.",
        preset_id: "review",
        role_ids: ["MainAgent", "Reviewer"],
      },
      {
        name: "Ship",
        orchestration_prompt: "Prepare the work for delivery.",
        preset_id: "ship",
        role_ids: ["Writer", "Reviewer"],
      },
    ],
  };
}

function readRequestBody(
  context: MockApiRouteContext,
): Record<string, unknown> {
  const body = context.route.request().postData();
  if (body === null || !body.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
