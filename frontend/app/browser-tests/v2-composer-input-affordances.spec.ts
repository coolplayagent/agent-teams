import { expect, test, type Page } from "@playwright/test";

import {
  captureStableElementScreenshot,
  captureStableViewportScreenshot,
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
  WORKSPACE_ID,
  waitForEventSourceUrl,
  waitForV1Shell,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-v2-composer-affordances";
const SCREENSHOT_FOLDER = "frontend-v2-ts-composer-affordances";
const MENTION_PROMPT = "Draft the browser mention update";

interface ComposerAffordanceState {
  activeRunId: string | null;
  runCreateRequests: Array<Record<string, unknown>>;
  speechConfigured: boolean;
}

test("captures paired V1 and V2 leading mention menus", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state: ComposerAffordanceState = {
    activeRunId: null,
    runCreateRequests: [],
    speechConfigured: true,
  };
  try {
    await installVoiceRuntimeSupport(page);
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerAffordanceApi(context, state),
      sessionTitle: "TS paired composer mention",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);
    await ensureScreenshotDir("frontend-v2-ts-composer-closure");

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);

    const v1Prompt = page.locator("#prompt-input");
    await v1Prompt.fill("@W");
    const v1Suggestions = page.locator("#prompt-mention-menu");
    await expect(v1Suggestions).toBeVisible();
    await expect(v1Suggestions).toContainText("Writer");
    await expectNoDocumentScroll(page, "V1 mention comparison should stay framed");
    await captureStableViewportScreenshot(
      page,
      screenshotPath(
        "composer-pair-v1-mention.png",
        "frontend-v2-ts-composer-closure",
      ),
    );

    await page.getByRole("link", { name: "Open new interface" }).click();
    await page.waitForURL(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const v2Prompt = page.getByRole("textbox", { name: "Prompt" });
    await v2Prompt.fill("@W");
    const v2Suggestions = page.getByLabel("Prompt suggestions");
    await expect(v2Suggestions).toBeVisible();
    await expect(v2Suggestions).toContainText("Writer");
    await expectNoDocumentScroll(page, "V2 mention comparison should stay framed");
    await expectComposerControlsDoNotOverlap(page);
    await captureStableViewportScreenshot(
      page,
      screenshotPath(
        "composer-pair-v2-mention.png",
        "frontend-v2-ts-composer-closure",
      ),
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("selects a leading role mention and keeps voice input reachable", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: ComposerAffordanceState = {
    activeRunId: null,
    runCreateRequests: [],
    speechConfigured: true,
  };
  try {
    await installVoiceRuntimeSupport(page);
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerAffordanceApi(context, state),
      sessionTitle: "TS composer affordances",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const voiceButton = page.getByRole("button", { name: "Voice input" });
    await expect(voiceButton).toBeVisible();
    await expect(voiceButton).toBeEnabled();

    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await prompt.fill("@W");
    const suggestions = page.getByLabel("Prompt suggestions");
    await expect(suggestions).toBeVisible();
    const writerOption = page.getByRole("option", { name: /@Writer/ });
    await expect(writerOption).toContainText("Writes browser fixtures");
    await captureStableElementScreenshot(
      page.locator(".at-composer"),
      screenshotPath(
        "v2-composer-mention-menu-voice.png",
        SCREENSHOT_FOLDER,
      ),
    );
    await writerOption.click();
    await expect(prompt).toHaveValue("@Writer ");
    await expect(suggestions).toHaveCount(0);

    await prompt.fill(`@Writer ${MENTION_PROMPT}`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => state.runCreateRequests.length).toBe(1);
    expect(state.runCreateRequests[0]).toMatchObject({
      input: [{ kind: "text", text: MENTION_PROMPT }],
      session_id: SESSION_ID,
      target_role_id: "Writer",
    });
    await waitForEventSourceUrl(
      page,
      /\/api\/ag-ui\/runs\/run-v2-composer-affordances\/events\?after_event_id=0$/,
    );
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "composer mention and voice affordances should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await captureStableElementScreenshot(
      page.locator(".at-composer"),
      screenshotPath(
        "v2-composer-mention-voice-ready.png",
        SCREENSHOT_FOLDER,
      ),
    );
  } finally {
    await appServer.close();
  }
});

test("shows configured voice input as disabled when runtime support is missing", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: ComposerAffordanceState = {
    activeRunId: null,
    runCreateRequests: [],
    speechConfigured: true,
  };
  try {
    await removeVoiceRuntimeSupport(page);
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerAffordanceApi(context, state),
      sessionTitle: "TS composer voice disabled",
    });

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const unsupportedVoiceButton = page.getByRole("button", {
      name: "Voice input unsupported",
    });
    await expect(unsupportedVoiceButton).toBeVisible();
    await expect(unsupportedVoiceButton).toBeDisabled();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "disabled voice affordance should stay inside the fixed shell",
    );
  } finally {
    await appServer.close();
  }
});

async function handleComposerAffordanceApi(
  context: MockApiRouteContext,
  state: ComposerAffordanceState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === "/roles:options") {
    await context.fulfillJson(roleOptions());
    return true;
  }
  if (context.method === "GET" && context.path === `/sessions/${SESSION_ID}/recovery`) {
    await context.fulfillJson(composerRecoverySnapshot(state.activeRunId));
    return true;
  }
  if (context.method === "GET" && context.path === "/speech/config") {
    await context.fulfillJson({
      configured: state.speechConfigured,
      language: "en-US",
      stt_profile_name: state.speechConfigured ? "browser-stt" : null,
      supported_models: ["browser-stt"],
    });
    return true;
  }
  if (
    context.method === "GET" &&
    context.path === `/workspaces/${WORKSPACE_ID}/search`
  ) {
    await context.fulfillJson({
      query: context.url.searchParams.get("query") ?? "",
      results: [],
      workspace_id: WORKSPACE_ID,
    });
    return true;
  }
  if (context.method === "POST" && context.path === "/ag-ui/runs") {
    const request = readRequestBody(context);
    state.runCreateRequests.push(request);
    state.activeRunId = RUN_ID;
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

function composerRecoverySnapshot(activeRunId: string | null): Record<string, unknown> {
  return {
    active_run:
      activeRunId === null
        ? null
        : {
            last_event_id: 0,
            phase: "running",
            run_id: activeRunId,
            session_id: SESSION_ID,
            should_show_recover: false,
            status: "running",
          },
    background_tasks: [],
    paused_subagent: null,
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
    round_snapshot: null,
  };
}

async function installVoiceRuntimeSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class BrowserVoiceAudioContext {
      readonly sampleRate = 16000;
      close(): Promise<void> {
        return Promise.resolve();
      }
      createGain(): GainNode {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
          gain: { value: 1 },
        } as unknown as GainNode;
      }
      createMediaStreamSource(): MediaStreamAudioSourceNode {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        } as unknown as MediaStreamAudioSourceNode;
      }
      createScriptProcessor(): ScriptProcessorNode {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
          onaudioprocess: null,
        } as unknown as ScriptProcessorNode;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: BrowserVoiceAudioContext,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.resolve(new MediaStream()),
      },
    });
  });
}

async function removeVoiceRuntimeSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });
  });
}

function roleOptions(): Record<string, unknown> {
  const mainAgent = roleOption("MainAgent", "Main Agent", "Handles primary chat");
  return {
    coordinator_role: roleOption("Coordinator", "Coordinator", "Coordinates runs"),
    coordinator_role_id: "Coordinator",
    main_agent_role: mainAgent,
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      mainAgent,
      roleOption("Writer", "Writer", "Writes browser fixtures"),
      roleOption("Reviewer", "Reviewer", "Reviews browser fixtures"),
    ],
    subagent_roles: [],
  };
}

function roleOption(
  roleId: string,
  name: string,
  description: string,
): Record<string, unknown> {
  return {
    description,
    name,
    role_id: roleId,
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
