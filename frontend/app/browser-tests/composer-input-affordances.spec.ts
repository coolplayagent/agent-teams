import { expect, test, type Page } from "@playwright/test";
import { createServer as createViteServer } from "vite";

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
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const RUN_ID = "run-v2-composer-affordances";
const SCREENSHOT_FOLDER = "frontend-v2-ts-composer-affordances";
const MENTION_PROMPT = "Draft the browser mention update";

interface ComposerAffordanceState {
  activeRunId: string | null;
  runCreateRequests: Array<Record<string, unknown>>;
  speechConfigured: boolean;
}test("selects a leading role mention and keeps voice input reachable", async ({
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
    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

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
    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

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

test("keeps wrapped slash selections fully visible across sticky groups", async ({
  page,
}) => {
  const appServer = await serveFrontendSource();
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
      sessionTitle: "TS composer wrapped menu navigation",
    });

    await page.setViewportSize({ height: 768, width: 1024 });
    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);

    const prompt = page.getByRole("combobox", { name: "Prompt" });
    await prompt.fill("/");
    const menu = page.getByLabel("Prompt suggestions");
    await expect(menu).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(13);

    await prompt.press("ArrowUp");
    await expect(page.getByRole("option", { selected: true }))
      .toContainText("/skill-02");
    await expectActiveMentionFullyVisible(page);

    await prompt.press("ArrowDown");
    await expect(page.getByRole("option", { selected: true }))
      .toContainText("/command-00");
    await expectActiveMentionFullyVisible(page);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("keeps the contextual composer and primary action inside supported viewports", async ({
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
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleComposerAffordanceApi(context, state),
      sessionTitle: "TS responsive composer",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    for (const width of [1440, 1280, 1024, 768]) {
      await page.setViewportSize({ height: width === 768 ? 768 : 900, width });
      await page.goto(`${appServer.url}/`);
      await waitForAppShell(page);

      const composer = page.locator(".at-composer-inner");
      const send = page.getByRole("button", { name: "Send" });
      await expect(composer).toBeVisible();
      await expect(send).toBeVisible();
      const [composerBox, sendBox] = await Promise.all([
        composer.boundingBox(),
        send.boundingBox(),
      ]);
      expect(composerBox).not.toBeNull();
      expect(sendBox).not.toBeNull();
      if (composerBox === null || sendBox === null) {
        throw new Error("Composer bounds were unavailable.");
      }
      expect(composerBox.x).toBeGreaterThanOrEqual(0);
      expect(composerBox.x + composerBox.width).toBeLessThanOrEqual(width);
      expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(
        composerBox.x + composerBox.width,
      );
      expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(
        composerBox.y + composerBox.height,
      );

      await page.getByRole("button", { name: "Add context or command" }).click();
      const menu = page.getByLabel("Prompt suggestions");
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();
      if (menuBox !== null) {
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      }
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);

      if (width === 1280 || width === 768) {
        await captureStableElementScreenshot(
          composer,
          screenshotPath(`v2-contextual-composer-${width}.png`, SCREENSHOT_FOLDER),
        );
      }
      await expectComposerControlsDoNotOverlap(page);
      await expectNoDocumentScroll(
        page,
        `contextual composer should stay in the ${width}px shell`,
      );
    }
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
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
  if (context.method === "GET" && context.path === "/system/commands:catalog") {
    await context.fulfillJson({
      app_commands: Array.from({ length: 24 }, (_, index) => ({
        aliases: [],
        description: `Browser command ${index}`,
        discovery_source: "app",
        name: `command-${String(index).padStart(2, "0")}`,
        scope: "app",
        source_path: `C:/commands/command-${index}.md`,
        template: `Run browser command ${index}`,
      })),
      workspaces: [],
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
    skills: Array.from({ length: 3 }, (_, index) => ({
      description: `Browser skill ${index}`,
      name: `skill-${String(index).padStart(2, "0")}`,
      ref: `user:skill-${String(index).padStart(2, "0")}`,
      source: "user",
    })),
    subagent_roles: [],
  };
}

async function expectActiveMentionFullyVisible(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>(
          ".at-prompt-mention-menu-list",
        );
        const active = list?.querySelector<HTMLElement>(
          '[role="option"][aria-selected="true"]',
        );
        if (list === null || active === null || active === undefined) {
          return false;
        }
        const listRect = list.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const stickyHeaderHeight = Array.from(
          list.querySelectorAll<HTMLElement>(".at-prompt-mention-group-label"),
        ).reduce(
          (height, label) => Math.max(height, label.getBoundingClientRect().height),
          0,
        );
        return (
          activeRect.top >= listRect.top + stickyHeaderHeight - 0.5 &&
          activeRect.bottom <= listRect.bottom + 0.5
        );
      }),
    )
    .toBe(true);
}

async function serveFrontendSource(): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  const server = await createViteServer({
    configFile: "vite.config.ts",
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await server.close();
    throw new Error("Expected the Vite browser test server to expose a URL.");
  }
  return {
    close: () => server.close(),
    url: url.replace(/\/$/, ""),
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
