import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  SESSION_ID,
  serveFrontendDist,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-settings-actions";

interface SettingsActionState {
  agentRuntimeConfigs: Record<string, Record<string, unknown>>;
  agentRuntimeDeleteRequests: string[];
  agentRuntimeSavePayloads: Record<string, unknown>[];
  agentRuntimeSaveRequests: string[];
  clawHubConfig: Record<string, unknown>;
  clawHubProbePayloads: Record<string, unknown>[];
  clawHubSavePayloads: Record<string, unknown>[];
  environmentDeleteRequests: Array<{
    key: string;
    scope: string;
  }>;
  environmentSavePayloads: Array<{
    key: string;
    payload: Record<string, unknown>;
    scope: string;
  }>;
  environmentVariables: {
    app: Record<string, unknown>[];
    system: Record<string, unknown>[];
  };
  failNextWebSave: boolean;
  hooksConfig: Record<string, unknown>;
  hooksSavePayloads: Record<string, unknown>[];
  hooksValidatePayloads: Record<string, unknown>[];
  modelCatalogRefreshCount: number;
  modelProfileReloadCount: number;
  modelProfileSavePayloads: Record<string, unknown>[];
  modelProfileSaveRequests: string[];
  modelProbePayloads: Record<string, unknown>[];
  modelProfiles: Record<string, Record<string, unknown>>;
  orchestrationConfig: Record<string, unknown>;
  orchestrationSavePayloads: Record<string, unknown>[];
  pluginDeleteRequests: Record<string, unknown>[];
  pluginDisableRequests: Record<string, unknown>[];
  pluginEnableRequests: Record<string, unknown>[];
  pluginUpdateRequests: Record<string, unknown>[];
  plugins: Record<string, unknown>[];
  requestedPaths: string[];
  roleConfigs: Record<string, Record<string, unknown>>;
  roleDeleteRequests: string[];
  roleSavePayloads: Record<string, unknown>[];
  roleValidatePayloads: Record<string, unknown>[];
  sshDeleteRequests: string[];
  sshProfiles: Record<string, unknown>[];
  sshSavePayloads: Record<string, unknown>[];
  sshSaveRequests: string[];
  session: Record<string, unknown>;
  topologyPayloads: Record<string, unknown>[];
  uiLanguage: "en-US" | "zh-CN";
  uiLanguageSavePayloads: Record<string, unknown>[];
  webConfig: Record<string, unknown>;
  webSavePayloads: Record<string, unknown>[];
}

test("keeps Settings open after outside drag and mask click", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS settings mask behavior",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const settingsBox = await settings.boundingBox();
    const mask = page.locator(".ant-drawer-mask");
    const maskBox = await mask.boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(maskBox).not.toBeNull();
    if (settingsBox === null || maskBox === null) {
      throw new Error("Expected Settings drawer and mask bounds.");
    }

    const startX = settingsBox.x + settingsBox.width / 2;
    const startY = settingsBox.y + settingsBox.height / 2;
    const maskX = Math.max(maskBox.x + 8, settingsBox.x - 24);
    const maskY = maskBox.y + 24;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(maskX, maskY);
    await page.mouse.up();
    await expect(settings).toBeVisible();

    await page.mouse.click(maskX, maskY);
    await expect(settings).toBeVisible();

    await expectNoDocumentScroll(
      page,
      "v2 settings outside click should stay inside the fixed shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-settings-mask-click.png", SCREENSHOT_FOLDER),
    });
    await settings.getByRole("button", { name: "Close" }).click();
    await expect(settings).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("manages Plugins from the System secondary settings page", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS plugins settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    await expect(sections.getByRole("button", { name: "Plugins" })).toHaveCount(0);

    await openSystemSettingsPage(settings, "Plugins");
    await expect(settings.getByRole("heading", { name: "Plugins" })).toBeVisible();
    await expect(settings.getByText("workspace-tools")).toBeVisible();
    await expect(settings.getByText("quality")).toBeVisible();

    const qualityRow = settings.locator(".at-plugin-list-row").filter({
      hasText: "quality",
    });
    await qualityRow.getByRole("button", { name: "Enable" }).click();
    await expect.poll(() => state.pluginEnableRequests).toEqual([
      { name: "quality", payload: { scope: "project" } },
    ]);

    const workspaceRow = settings.locator(".at-plugin-list-row").filter({
      hasText: "workspace-tools",
    });
    await workspaceRow.getByRole("button", { name: "Disable" }).click();
    await expect.poll(() => state.pluginDisableRequests).toEqual([
      { name: "workspace-tools", payload: { scope: "user" } },
    ]);

    await workspaceRow.getByRole("button", { name: "Update" }).click();
    await expect.poll(() => state.pluginUpdateRequests).toEqual([
      {
        name: "workspace-tools",
        payload: { scope: "user", version: "1.0.0" },
      },
    ]);

    await workspaceRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect.poll(() => state.pluginDeleteRequests).toEqual([
      { name: "workspace-tools", prune: "false", scope: "user" },
    ]);
    await expect(workspaceRow).toHaveCount(0);
    expect(state.requestedPaths).toContain("/system/configs/plugins");
    expect(state.requestedPaths).toContain("/system/configs/plugins/runtime");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 plugin settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-plugin-actions.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("validates and saves Hooks from the System secondary settings page", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS hooks settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    await expect(sections.getByRole("button", { name: "Hooks" })).toHaveCount(0);

    await openSystemSettingsPage(settings, "Hooks");
    await expect(settings.getByRole("heading", { name: "Hooks" })).toBeVisible();
    const editor = settings.getByLabel("Hooks JSON");
    await expect(editor).toHaveValue(JSON.stringify(state.hooksConfig, null, 2));

    await settings.getByRole("button", { name: "Validate" }).click();
    await expect.poll(() => state.hooksValidatePayloads).toEqual([
      state.hooksConfig,
    ]);

    const nextHooks = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                command: "python hooks/prompt.py",
                type: "command",
              },
            ],
            matcher: "*",
          },
        ],
      },
    };
    await editor.fill(JSON.stringify(nextHooks, null, 2));
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.hooksSavePayloads).toEqual([nextHooks]);
    await expect(editor).toHaveValue(JSON.stringify(nextHooks, null, 2));
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 hooks settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-hooks-editor-save.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("creates and deletes Agent Runtime configs from the System secondary settings page", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  const rolePrompt = "# Browser Role Prompt\nUse the browser-created runtime.";
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS agent runtime settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    await expect(sections.getByRole("button", { name: "Agent Runtime" }))
      .toHaveCount(0);

    await openSystemSettingsPage(settings, "Agent Runtime");
    await expect(settings.getByRole("heading", { name: "Agent Runtime" }))
      .toBeVisible();
    await expect(settings.getByText("Codex ACP")).toBeVisible();
    const newRuntimeButton = settings
      .locator(".at-agent-runtime-toolbar")
      .getByRole("button", { name: "New runtime" });
    await expect(newRuntimeButton).toBeVisible();
    await newRuntimeButton.evaluate((button) => (button as HTMLElement).click());

    await expect(settings.getByRole("heading", { name: "New runtime" }))
      .toBeVisible();
    await settings.getByLabel("Agent ID").fill("browser-agent-ts");
    await settings.getByLabel("Name").fill("Browser TS Agent");
    await settings
      .getByLabel("Description")
      .fill("Browser TS agent runtime.");
    await settings.getByLabel("Command").fill("python");
    await settings.getByLabel("Arguments").fill("-m\nrelay_teams");
    await settings.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => state.agentRuntimeSaveRequests)
      .toEqual(["browser-agent-ts"]);
    expect(state.agentRuntimeSavePayloads).toEqual([
      {
        agent_id: "browser-agent-ts",
        description: "Browser TS agent runtime.",
        name: "Browser TS Agent",
        native_config_enabled: false,
        native_config_provider: "",
        protocol: "acp",
        skill_bridge_enabled: false,
        skill_bridge_mode: "inline",
        skill_bridge_skills: [],
        transport: {
          args: ["-m", "relay_teams"],
          command: "python",
          env: [],
          transport: "stdio",
        },
      },
    ]);
    await expect(page.getByText("Agent runtime saved.")).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Edit runtime" }))
      .toBeVisible();
    await expect(settings.getByLabel("Agent ID")).toHaveValue("browser-agent-ts");

    await sections.getByRole("button", { name: "Roles" }).click();
    await expect(settings.getByRole("heading", { name: "Roles" })).toBeVisible();
    await settings.getByRole("button", { name: "New role" }).click();
    await settings.getByLabel("Role ID").fill("runtime-bound-role");
    await settings.getByLabel("Role name").fill("Runtime Bound Role");
    await settings
      .getByLabel("Description")
      .fill("Uses the browser-created runtime.");
    await settings
      .locator(".ant-form-item", { hasText: "Bound agent" })
      .locator(".ant-select-selector")
      .click();
    const boundAgentDropdown = page.locator(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden)",
    );
    const browserAgentOption = boundAgentDropdown.locator(
      ".ant-select-item-option-content",
      { hasText: "browser-agent-ts" },
    );
    await expect(browserAgentOption).toBeVisible();
    await browserAgentOption.click();
    await settings
      .getByLabel("System prompt")
      .fill(rolePrompt);
    await settings
      .locator(".at-role-prompt-editor")
      .getByText("Preview", { exact: true })
      .click();
    await expect(settings.getByRole("region", { name: "Preview" }))
      .toContainText("Browser Role Prompt");
    await settings.getByRole("button", { name: "Validate" }).click();
    await expect
      .poll(() => state.roleValidatePayloads.at(-1)?.bound_agent_id)
      .toBe("browser-agent-ts");
    expect(state.roleValidatePayloads.at(-1)).toMatchObject({
      role_id: "runtime-bound-role",
      system_prompt: rolePrompt,
    });

    await settings.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(() => state.roleSavePayloads.at(-1)?.bound_agent_id)
      .toBe("browser-agent-ts");
    expect(state.roleSavePayloads.at(-1)).toMatchObject({
      bound_agent_id: "browser-agent-ts",
      role_id: "runtime-bound-role",
      system_prompt: rolePrompt,
    });
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await settings.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect.poll(() => state.roleDeleteRequests).toContain(
      "runtime-bound-role",
    );
    await expect(settings.getByText("Runtime Bound Role")).toHaveCount(0);

    await sections.getByRole("button", { name: "System" }).click();
    await openSystemSettingsPage(settings, "Agent Runtime");
    const browserRuntimeRow = settings.locator(".at-settings-list-button").filter({
      hasText: "Browser TS Agent",
    });
    await expect(browserRuntimeRow).toBeVisible();
    await browserRuntimeRow.click();
    await expect(settings.getByRole("heading", { name: "Edit runtime" }))
      .toBeVisible();
    await settings
      .locator(".at-agent-runtime-detail")
      .getByRole("button", { name: "Delete" })
      .click();
    const confirm = page.locator(".ant-popconfirm");
    await expect(confirm).toContainText(
      'Delete agent runtime "browser-agent-ts"?',
    );
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect.poll(() => state.agentRuntimeDeleteRequests)
      .toEqual(["browser-agent-ts"]);
    await expect(page.getByText("Agent runtime deleted.")).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Agent Runtime" }))
      .toBeVisible();
    await expect(settings.getByText("Browser TS Agent")).toHaveCount(0);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 8000,
    });
    await expect(
      page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)"),
    ).toHaveCount(0);
    await expect(page.locator(".ant-popover")).toHaveCount(0);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 agent runtime settings should stay framed",
    );
    await page.screenshot({
      path: screenshotPath("v2-agent-runtime-create-delete.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("validates, deletes, and creates role configs from settings", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS roles settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Roles" })
      .click();

    await expect(settings.getByRole("heading", { name: "Roles" })).toBeVisible();
    const reviewerRow = settings.locator(".at-settings-list-button").filter({
      hasText: "Reviewer",
    });
    await expect(reviewerRow).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-roles-list.png", SCREENSHOT_FOLDER),
    });
    await reviewerRow.click();
    await expect(settings.getByLabel("Role ID")).toHaveValue("reviewer");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("Tools");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("1");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("Servers");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("filesystem");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("Skills");
    await expect(settings.locator(".at-role-config-properties"))
      .toContainText("review");
    await page.screenshot({
      path: screenshotPath("v2-roles-reviewer-detail.png", SCREENSHOT_FOLDER),
    });
    await settings
      .locator(".at-settings-section-body")
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    await page.screenshot({
      path: screenshotPath("v2-roles-reviewer-detail-fields.png", SCREENSHOT_FOLDER),
    });

    await settings.getByRole("button", { name: "Validate" }).click();
    await expect
      .poll(() => state.roleValidatePayloads.at(0)?.role_id)
      .toBe("reviewer");

    await settings.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect.poll(() => state.roleDeleteRequests).toEqual(["reviewer"]);

    await settings.getByRole("button", { name: "New role" }).click();
    await settings.getByLabel("Role ID").fill("analyst");
    await settings.getByLabel("Role name").fill("Analyst");
    await settings.getByLabel("Description").fill("Analyzes the current plan.");
    await settings
      .getByLabel("System prompt")
      .fill("Analyze the plan and report risks.");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(() => state.roleSavePayloads.at(0)?.role_id)
      .toBe("analyst");
    expect(state.roleSavePayloads[0]).not.toHaveProperty("file_name");
    expect(state.roleSavePayloads[0]).not.toHaveProperty("source");
    await expect(settings.getByLabel("Role ID")).toHaveValue("analyst");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 role settings should stay framed");
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-roles-create-save.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("sets defaults, deletes, and creates orchestration presets", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS orchestration settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Orchestration" })
      .click();

    await expect(settings.getByRole("heading", { name: "Orchestration" }))
      .toBeVisible();
    await expect(settings.locator(".at-settings-facts")).toContainText(
      "Default preset",
    );
    await expect(settings.locator(".at-settings-list-row")).toHaveCount(2);
    await page.screenshot({
      path: screenshotPath("v2-orchestration-list.png", SCREENSHOT_FOLDER),
    });
    const shippingRow = settings.locator(".at-settings-list-row").filter({
      hasText: "Shipping",
    });
    await expect(shippingRow).toBeVisible();
    await shippingRow.getByRole("button", { name: "Set default" }).click();
    await expect
      .poll(() =>
        state.orchestrationSavePayloads.at(0)?.default_orchestration_preset_id,
      )
      .toBe("shipping");
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);

    await settings
      .getByRole("button", { name: "Default 1 roles · Review flow" })
      .click();
    await expect(settings.getByLabel("Preset ID")).toHaveValue("default");
    await expect(
      settings.getByRole("checkbox", { name: "reviewer" }),
    ).toBeChecked();
    await expect(settings.getByLabel("Graph JSON")).toHaveValue(/"review"/);
    await page.screenshot({
      path: screenshotPath("v2-orchestration-default-detail.png", SCREENSHOT_FOLDER),
    });
    await settings
      .locator(".at-settings-section-body")
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    await page.screenshot({
      path: screenshotPath(
        "v2-orchestration-default-detail-policy.png",
        SCREENSHOT_FOLDER,
      ),
    });
    await settings
      .locator(".at-settings-section-body")
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await settings.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect
      .poll(() =>
        state.orchestrationSavePayloads.at(1)?.default_orchestration_preset_id,
      )
      .toBe("shipping");
    expect(
      (state.orchestrationSavePayloads[1]?.presets as unknown[] | undefined)
        ?.length,
    ).toBe(1);

    await settings.getByRole("button", { name: "New orchestration" }).click();
    await expect(settings.getByLabel("Preset ID")).toHaveValue("orchestration_2");
    await expect(
      settings.getByRole("checkbox", { name: "Reviewer" }),
    ).toBeChecked();
    await settings.getByLabel("Preset ID").fill("analysis");
    await settings.getByLabel("Preset name").fill("Analysis");
    await settings.getByLabel("Description").fill("Analysis flow");
    await settings
      .getByLabel("Orchestration prompt")
      .fill("Analyze the work and report risks.");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.orchestrationSavePayloads.length).toBe(3);
    const presets = state.orchestrationSavePayloads[2]?.presets as
      | Record<string, unknown>[]
      | undefined;
    expect(presets?.at(-1)?.preset_id).toBe("analysis");
    expect(presets?.at(-1)?.role_ids).toEqual(["reviewer"]);
    await expect
      .poll(() => orchestrationAnalysisIsRendered(settings))
      .toBe(true);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 orchestration settings should stay framed",
    );
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-orchestration-create-save.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("manages environment variables and session topology from V2 surfaces", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS environment topology",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Environment variables" })
      .click();

    await expect(settings.getByRole("heading", { name: "Environment variables" }))
      .toBeVisible();
    await expect(settings.getByText("EXISTING_BROWSER_ENV")).toBeVisible();
    await expect(settings.getByText("SYSTEM_BROWSER_ENV")).not.toBeVisible();

    await settings.locator(".at-settings-env-system-toggle").click();
    await expect(settings.getByText("SYSTEM_BROWSER_ENV")).toBeVisible();

    await settings.getByRole("button", { name: "New variable" }).click();
    const envDialog = page.getByRole("dialog", { name: "New variable" });
    await expect(envDialog).toBeVisible();
    await envDialog.getByLabel("Key").fill("BROWSER_TS_ENV");
    await envDialog.getByLabel("Value").fill("browser-ts-value");
    await envDialog.getByRole("button", { name: "Save" }).click();
    await expect(envDialog).toBeHidden();
    await expect(settings.getByText("BROWSER_TS_ENV")).toBeVisible();
    expect(state.environmentSavePayloads).toEqual([
      {
        key: "BROWSER_TS_ENV",
        payload: { source_key: null, value: "browser-ts-value" },
        scope: "app",
      },
    ]);

    const createdEnvRow = settings.locator(".at-settings-env-row").filter({
      hasText: "BROWSER_TS_ENV",
    });
    await createdEnvRow.getByRole("button", { name: "Delete" }).click();
    const confirm = page.locator(".ant-modal-confirm");
    await expect(confirm.locator(".ant-modal-confirm-title")).toHaveText(
      'Delete environment variable "BROWSER_TS_ENV"?',
    );
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(settings.getByText("BROWSER_TS_ENV")).toHaveCount(0);
    expect(state.environmentDeleteRequests).toEqual([
      { key: "BROWSER_TS_ENV", scope: "app" },
    ]);

    await settings.getByRole("button", { name: "Close" }).click();
    await expect(settings).toHaveCount(0);

    await expect(page.locator(".at-session-mode-control")).toBeVisible();
    await page.getByText("Orchestration", { exact: true }).click();
    await expect.poll(() => state.topologyPayloads.length).toBe(1);
    expect(state.topologyPayloads[0]).toEqual({
      normal_root_role_id: null,
      orchestration_preset_id: "default",
      session_mode: "orchestration",
    });
    await expect(
      page.getByRole("combobox", { name: "Orchestration preset" }),
    ).toBeVisible();
    await expect(page.getByText("Session topology updated.")).toBeVisible();

    await page.locator(".at-orchestration-preset-select").click();
    await page.getByRole("option", { name: "Shipping - shipping" }).click();
    await expect.poll(() => state.topologyPayloads.length).toBe(2);
    expect(state.topologyPayloads[1]).toEqual({
      normal_root_role_id: null,
      orchestration_preset_id: "shipping",
      session_mode: "orchestration",
    });

    await page.getByText("Normal", { exact: true }).click();
    await expect.poll(() => state.topologyPayloads.length).toBe(3);
    expect(state.topologyPayloads[2]).toEqual({
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_mode: "normal",
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 environment and topology workflow should stay framed",
    );
    await expectComposerControlsDoNotOverlap(page);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-environment-topology-workflow.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("tests and saves an existing model profile", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS model detail settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Model" })
      .click();

    await expect(settings.getByRole("heading", { name: "Model" })).toBeVisible();
    const visionRow = settings.locator(".at-model-profile-row").filter({
      hasText: "vision",
    });
    await expect(visionRow).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-model-profile-list.png", SCREENSHOT_FOLDER),
    });
    await visionRow.locator(".at-model-profile-row-main").click();

    const profileIdInput = settings.getByLabel("Profile ID");
    await expect(profileIdInput).toHaveValue("vision");
    const providerInput = settings.getByLabel("Provider");
    await expect(providerInput).toHaveValue("openai");
    await expect(settings.getByLabel("Base URL")).toHaveValue(
      "https://vision.example/v1",
    );

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/system/configs/model:probe") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Test" }).click(),
    ]);

    expect(state.modelProbePayloads).toEqual([
      { profile_name: "vision", timeout_ms: 15000 },
    ]);
    await expect(settings.getByText("Connection ok in 51ms.")).toBeVisible();

    await providerInput.fill("openai_compatible");
    await expect(settings.getByLabel("Base URL")).toHaveValue(
      "https://vision.example/v1",
    );
    await profileIdInput.fill("vision-browser");
    await settings.getByLabel("Model").fill("gpt-5.1-vision");
    await settings.getByLabel("Base URL").fill("https://vision.changed.example/v1");
    await settings.getByLabel("Context window").fill("128000");
    await settings.getByLabel("Max tokens").fill("4096");
    await settings.getByLabel("Fallback policy").fill(
      "same_provider_then_other_provider",
    );
    await settings.getByLabel("SSL verify").fill("true");

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/system/configs/model:reload") &&
          response.status() === 200,
      ),
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response
            .url()
            .endsWith("/api/system/configs/model/profiles/vision-browser") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.modelProfileSaveRequests).toEqual(["vision-browser"]);
    expect(state.modelProfileSavePayloads.at(-1)).toEqual({
      base_url: "https://vision.changed.example/v1",
      connect_timeout_seconds: 15,
      context_window: 128000,
      fallback_policy_id: "same_provider_then_other_provider",
      fallback_priority: 0,
      is_default: false,
      max_tokens: 4096,
      model: "gpt-5.1-vision",
      provider: "openai_compatible",
      source_name: "vision",
      ssl_verify: true,
      temperature: 0.7,
      top_p: 1,
    });
    expect(state.modelProfileReloadCount).toBe(1);
    await expect(page.getByText("Saved model profile vision-browser."))
      .toBeVisible();
    await expect(settings.getByLabel("Profile ID")).toHaveValue("vision-browser");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 model profile detail should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-model-profile-detail.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("creates a model profile from the catalog", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS model catalog settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Model" })
      .click();

    await expect(settings.getByRole("heading", { name: "Model" })).toBeVisible();
    expect(state.requestedPaths).not.toContain("/system/configs/model/catalog");

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().endsWith("/api/system/configs/model/catalog") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "New profile" }).click(),
    ]);

    await expect(settings.getByText("Model catalog", { exact: true })).toBeVisible();
    await settings.locator(".at-model-catalog-option").filter({
      hasText: "GPT-5 Catalog",
    }).click();
    await expect(settings.locator("input#provider")).toHaveValue(
      "openai_compatible",
    );
    await expect(settings.locator("input#model")).toHaveValue("gpt-5-catalog");
    await expect(settings.locator("input#base_url")).toHaveValue(
      "https://openai.example/v1",
    );
    await settings.locator("input#profile_id").fill("catalog-browser");

    await page.screenshot({
      path: screenshotPath(
        "v2-model-profile-catalog-picker.png",
        SCREENSHOT_FOLDER,
      ),
    });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/system/configs/model:reload") &&
          response.status() === 200,
      ),
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response
            .url()
            .endsWith("/api/system/configs/model/profiles/catalog-browser") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.modelProfileSaveRequests).toEqual(["catalog-browser"]);
    expect(state.modelProfileSavePayloads.at(-1)).toEqual({
      base_url: "https://openai.example/v1",
      capabilities: {
        input: { image: true, text: true },
        output: { text: true },
      },
      catalog_model_name: "GPT-5 Catalog",
      catalog_provider_id: "openai",
      catalog_provider_name: "OpenAI",
      connect_timeout_seconds: 15,
      context_window: 128000,
      fallback_policy_id: null,
      fallback_priority: 0,
      is_default: false,
      max_tokens: 8192,
      model: "gpt-5-catalog",
      provider: "openai_compatible",
      temperature: 0.7,
      top_p: 1,
    });
    expect(state.modelProfileReloadCount).toBe(1);
    await expect(page.getByText("Saved model profile catalog-browser."))
      .toBeVisible();
    await expect(settings.locator("input#profile_id")).toHaveValue(
      "catalog-browser",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 model catalog create should stay framed");
    await page.screenshot({
      path: screenshotPath(
        "v2-model-profile-catalog-create.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("matches Web settings declared defaults and persisted language", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  state.uiLanguage = "zh-CN";
  state.webConfig = {
    ...state.webConfig,
    exa_api_key: "browser-web-strict-key",
    fallback_provider: null,
    searxng_instance_seeds: [
      "https://search.mdosch.de/",
      "https://searx.space",
    ],
    searxng_instance_url: "https://search.mdosch.de/",
  };
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS web defaults",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: /^(Settings sections|设置分区)$/ })
      .getByRole("button", { name: "Web" })
      .click();

    await expect(settings.getByRole("heading", { name: "Web" })).toBeVisible();
    await expect(settings.getByText("提供商", { exact: true })).toBeVisible();
    await expect(settings.getByText("Exa API Key", { exact: true })).toBeVisible();
    await expect(settings.getByText("回退提供商", { exact: true })).toBeVisible();
    await expect(settings.getByText("留空会保留已保存的 API Key。"))
      .toBeVisible();
    await expect(settings.getByLabel("回退提供商")).toHaveValue("searxng");
    expect(await optionPairs(settings.getByLabel("回退提供商"))).toEqual([
      ["searxng", "SearXNG"],
      ["disabled", "禁用"],
    ]);
    await expect(settings.getByLabel("SearXNG 实例 URL")).toHaveValue(
      "https://search.mdosch.de/",
    );
    const builtins = settings.getByLabel("内置实例");
    await expect(builtins.getByText("内置实例", { exact: true })).toBeVisible();
    await expect(builtins.getByText("https://search.mdosch.de/")).toBeVisible();
    await expect(builtins.getByText("https://searx.space")).toBeVisible();
    const providerLink = settings.locator(".at-settings-provider-link");
    await expect(providerLink.getByText("提供商网站", { exact: true })).toBeVisible();
    await expect(providerLink.getByText("https://exa.ai")).toBeVisible();
    await expect(providerLink).toHaveAttribute("href", /^https:\/\/exa\.ai\/?$/);

    await settings.getByLabel("回退提供商").selectOption("disabled");
    await expect(settings.getByLabel("SearXNG 实例 URL")).toHaveCount(0);
    await expect(settings.getByLabel("内置实例")).toHaveCount(0);
    await settings.getByLabel("回退提供商").selectOption("searxng");
    await expect(settings.getByLabel("SearXNG 实例 URL")).toHaveValue(
      "https://search.mdosch.de/",
    );
    await expect(settings.getByLabel("内置实例")).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/ui-language") &&
          response.status() === 200,
      ),
      page
        .locator(".at-topbar")
        .getByRole("button", { name: "中文", exact: true })
        .evaluate((button) => (button as HTMLElement).click()),
    ]);
    expect(state.uiLanguageSavePayloads.at(-1)).toEqual({ language: "en-US" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(settings.getByText("Provider", { exact: true })).toBeVisible();
    await expect(settings.getByText("Fallback provider", { exact: true }))
      .toBeVisible();
    await expect(settings.getByLabel("SearXNG instance URL")).toHaveValue(
      "https://search.mdosch.de/",
    );
    await expect(settings.getByLabel("Built-in instances")).toBeVisible();
    expect(await optionPairs(settings.getByLabel("Fallback provider"))).toEqual([
      ["searxng", "SearXNG"],
      ["disabled", "Disabled"],
    ]);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/ui-language") &&
          response.status() === 200,
      ),
      page
        .locator(".at-topbar")
        .getByRole("button", { name: "EN", exact: true })
        .evaluate((button) => (button as HTMLElement).click()),
    ]);
    expect(state.uiLanguageSavePayloads.at(-1)).toEqual({ language: "zh-CN" });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(settings.getByText("提供商", { exact: true })).toBeVisible();
    await expect(settings.getByText("内置实例", { exact: true })).toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 web defaults should stay framed");
    await page.screenshot({
      path: screenshotPath(
        "v2-web-settings-defaults-language.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("saves Web settings and shows save errors", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS web settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Web" })
      .click();

    await expect(settings.getByRole("heading", { name: "Web" })).toBeVisible();
    await expect(settings.getByText("Leave blank to keep the saved API key."))
      .toBeVisible();
    const searxngUrl = settings.getByLabel("SearXNG instance URL");
    await expect(searxngUrl).toHaveValue("https://search.initial.example/");
    await expect(settings.getByText("https://searx.space")).toBeVisible();

    await searxngUrl.fill("https://search.changed.example/");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/web") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.webSavePayloads.at(-1)).toEqual({
      exa_api_key: "saved-exa-key",
      fallback_provider: "searxng",
      provider: "exa",
      searxng_instance_url: "https://search.changed.example/",
    });
    await expect(page.getByText("Web settings saved.")).toBeVisible();

    const fallbackProvider = settings.getByLabel("Fallback provider");
    await fallbackProvider.selectOption("disabled");
    await expect(searxngUrl).toHaveCount(0);
    await expect(settings.getByText("https://searx.space")).toHaveCount(0);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/web") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.webSavePayloads.at(-1)).toEqual({
      exa_api_key: "saved-exa-key",
      fallback_provider: "disabled",
      provider: "exa",
      searxng_instance_url: "https://search.changed.example/",
    });
    await fallbackProvider.selectOption("searxng");
    await expect(searxngUrl).toHaveValue("https://search.changed.example/");
    await expect(settings.getByText("https://searx.space")).toBeVisible();

    state.failNextWebSave = true;
    await searxngUrl.fill("https://search.failed.example/");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/web") &&
          response.status() === 500,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.webSavePayloads.at(-1)).toEqual({
      exa_api_key: "saved-exa-key",
      fallback_provider: "searxng",
      provider: "exa",
      searxng_instance_url: "https://search.failed.example/",
    });
    expect(state.webConfig.searxng_instance_url).toBe(
      "https://search.changed.example/",
    );
    const inlineSaveError = settings.locator(".ant-alert-error").filter({
      hasText: "Web settings save failed in browser test.",
    });
    await expect(inlineSaveError).toBeVisible();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await inlineSaveError.scrollIntoViewIfNeeded();
    await expect(inlineSaveError).toBeInViewport();
    await page.screenshot({
      path: screenshotPath("v2-web-settings-error.png", SCREENSHOT_FOLDER),
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 web settings should stay framed");
  } finally {
    await appServer.close();
  }
});

test("probes, saves, and clears ClawHub settings", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS ClawHub settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "ClawHub" })
      .click();

    await expect(settings.getByRole("heading", { name: "ClawHub" }))
      .toBeVisible();
    await expect(settings.locator(".at-settings-facts")).toContainText("Saved");
    await expect(settings.locator(".at-settings-facts")).toContainText("clawhub.ai");

    const tokenInput = settings.getByLabel("Token");
    await expect(tokenInput).toHaveAttribute("autocomplete", "new-password");
    await expect(tokenInput).toHaveAttribute("placeholder", "************");
    await expect(
      settings.getByRole("link", { name: /https:\/\/clawhub\.ai\/settings/ }),
    ).toHaveAttribute("href", /^https:\/\/clawhub\.ai\/settings\/?$/);

    await settings.getByRole("button", { name: "Test connection" }).click();
    await expect.poll(() => state.clawHubProbePayloads).toEqual([
      { token: "saved-clawhub-browser-token" },
    ]);
    await expect(
      settings.getByText(
        "Connected with clawhub 0.9.0 in 4,200 ms. Installed automatically.",
      ),
    ).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-clawhub-settings-probe.png", SCREENSHOT_FOLDER),
    });

    await tokenInput.fill("next-clawhub-browser-token");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/clawhub") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.clawHubSavePayloads.at(-1)).toEqual({
      token: "next-clawhub-browser-token",
    });
    await expect(page.getByText("ClawHub settings saved.")).toBeVisible();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);

    await settings.getByRole("button", { name: "Clear token" }).click();
    await expect(settings.locator(".at-settings-facts")).toContainText("Not saved");
    await settings.getByRole("button", { name: "Test connection" }).click();
    await expect(
      settings.getByText("Enter a ClawHub token before testing."),
    ).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-clawhub-settings-required.png", SCREENSHOT_FOLDER),
    });
    expect(state.clawHubProbePayloads).toEqual([
      { token: "saved-clawhub-browser-token" },
    ]);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/clawhub") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.clawHubSavePayloads.at(-1)).toEqual({ token: null });
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-clawhub-settings-clear.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 ClawHub settings should stay framed");
  } finally {
    await appServer.close();
  }
});

test("creates remote workspace SSH profiles from settings", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS remote workspace create",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Remote workspace" })
      .click();

    await expect(settings.getByRole("heading", { name: "Remote workspace" }))
      .toBeVisible();
    await settings.getByRole("button", { name: "New SSH profile" }).click();
    const editor = page.getByRole("dialog", { name: "New SSH profile" });
    await expect(editor).toBeVisible();

    for (const label of [
      "Profile ID",
      "Host",
      "Username",
      "Port",
      "Connect timeout (s)",
      "Remote shell",
      "Password",
      "Private key name",
      "Private key",
    ]) {
      await expect(editor.getByLabel(label, { exact: true })).toBeVisible();
    }
    await editor.screenshot({
      path: screenshotPath("v2-remote-workspace-editor.png", SCREENSHOT_FOLDER),
    });

    await editor.getByLabel("Profile ID", { exact: true }).fill("staging");
    await editor.getByLabel("Host", { exact: true }).fill("staging.example.com");
    await editor.getByLabel("Username", { exact: true }).fill("deploy");
    await editor.getByLabel("Port", { exact: true }).fill("2222");
    await editor.getByLabel("Connect timeout (s)", { exact: true }).fill("20");
    await editor.getByLabel("Remote shell", { exact: true }).fill("/bin/zsh");
    await editor.getByLabel("Password", { exact: true }).fill("secret-password");
    await editor.getByLabel("Private key name", { exact: true }).fill("id_staging");
    await editor
      .getByLabel("Private key", { exact: true })
      .fill("-----BEGIN OPENSSH PRIVATE KEY-----\nstaging\n-----END OPENSSH PRIVATE KEY-----");

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response
            .url()
            .endsWith("/api/system/configs/workspace/ssh-profiles/staging") &&
          response.status() === 200,
      ),
      editor.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.sshSaveRequests).toEqual(["staging"]);
    expect(state.sshSavePayloads).toEqual([
      {
        connect_timeout_seconds: 20,
        host: "staging.example.com",
        password: "secret-password",
        port: 2222,
        private_key: "-----BEGIN OPENSSH PRIVATE KEY-----\nstaging\n-----END OPENSSH PRIVATE KEY-----",
        private_key_name: "id_staging",
        remote_shell: "/bin/zsh",
        username: "deploy",
      },
    ]);
    await expect(editor).toHaveCount(0);
    await expect(page.getByText("Saved SSH profile staging.")).toBeVisible();
    await expect(
      settings.getByRole("button", {
        name: "staging staging.example.com · deploy · 2222 Password · Private key",
      }),
    ).toBeVisible();
    await settings
      .getByRole("button", {
        name: "staging staging.example.com · deploy · 2222 Password · Private key",
      })
      .click();
    await expect(settings.getByRole("heading", { name: "staging" })).toBeVisible();
    await expect(settings.getByText("staging.example.com · deploy · 2222").first())
      .toBeVisible();

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 remote workspace SSH create should stay framed",
    );
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-remote-workspace-create.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("requires confirmation before deleting remote workspace SSH profiles", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS remote workspace settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Remote workspace" })
      .click();

    await expect(settings.getByRole("heading", { name: "Remote workspace" }))
      .toBeVisible();
    await expect(settings.getByRole("heading", { name: "devbox" })).toBeVisible();
    await expect(settings.getByText("dev.example.com · yex · 22").first())
      .toBeVisible();

    await settings.getByRole("button", { name: "Delete" }).click();
    let confirm = page.getByRole("dialog").filter({
      hasText: 'Delete SSH profile "devbox"?',
    });
    await expect(confirm).toBeVisible();
    expect(state.sshDeleteRequests).toEqual([]);

    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    expect(state.sshDeleteRequests).toEqual([]);
    await expect(settings.getByRole("heading", { name: "devbox" })).toBeVisible();

    await settings.getByRole("button", { name: "Delete" }).click();
    confirm = page.getByRole("dialog").filter({
      hasText: 'Delete SSH profile "devbox"?',
    });
    await expect(confirm).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response
            .url()
            .endsWith("/api/system/configs/workspace/ssh-profiles/devbox") &&
          response.status() === 200,
      ),
      confirm.getByRole("button", { name: "Delete" }).click(),
    ]);

    expect(state.sshDeleteRequests).toEqual(["devbox"]);
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText("Deleted SSH profile devbox.")).toBeVisible();
    await expect(settings.getByText("No SSH profiles.")).toBeVisible();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 remote workspace settings should stay framed",
    );
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-remote-workspace-delete.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function openSettingsDialog(page: Page): Promise<Locator> {
  await page
    .locator(".at-topbar")
    .getByRole("button", { name: /^(Settings|设置)$/ })
    .click();
  const settings = page.getByRole("dialog", { name: /^(Settings|设置)$/ });
  await expect(settings).toBeVisible();
  return settings;
}

async function openSystemSettingsPage(
  settings: Locator,
  pageName: string,
): Promise<void> {
  await settings
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "System" })
    .click();
  await settings.locator(".at-settings-list-button").filter({ hasText: pageName })
    .click();
}

async function optionPairs(select: Locator): Promise<Array<[string, string]>> {
  return select.locator("option").evaluateAll((options) =>
    options.map((option) => {
      const item = option as HTMLOptionElement;
      return [
        item.value,
        item.label || item.textContent?.trim() || "",
      ] as [string, string];
    }),
  );
}

async function orchestrationAnalysisIsRendered(settings: Locator): Promise<boolean> {
  return settings.evaluate((element) => {
    const text = element.textContent ?? "";
    const hasAnalysisText = text.includes("Analysis") && text.includes("analysis");
    const hasAnalysisInput = Array.from(
      element.querySelectorAll<HTMLInputElement>("input"),
    ).some((input) => input.value === "analysis");
    return hasAnalysisText || hasAnalysisInput;
  });
}

function settingsActionState(): SettingsActionState {
  return {
    agentRuntimeConfigs: agentRuntimeConfigs(),
    agentRuntimeDeleteRequests: [],
    agentRuntimeSavePayloads: [],
    agentRuntimeSaveRequests: [],
    clawHubConfig: clawHubConfig(),
    clawHubProbePayloads: [],
    clawHubSavePayloads: [],
    environmentDeleteRequests: [],
    environmentSavePayloads: [],
    environmentVariables: environmentVariables(),
    failNextWebSave: false,
    hooksConfig: hooksConfig(),
    hooksSavePayloads: [],
    hooksValidatePayloads: [],
    modelCatalogRefreshCount: 0,
    modelProfileReloadCount: 0,
    modelProfileSavePayloads: [],
    modelProfileSaveRequests: [],
    modelProbePayloads: [],
    modelProfiles: modelProfiles(),
    orchestrationConfig: orchestrationConfig(),
    orchestrationSavePayloads: [],
    pluginDeleteRequests: [],
    pluginDisableRequests: [],
    pluginEnableRequests: [],
    pluginUpdateRequests: [],
    plugins: pluginsConfigItems(),
    requestedPaths: [],
    roleConfigs: roleConfigs(),
    roleDeleteRequests: [],
    roleSavePayloads: [],
    roleValidatePayloads: [],
    sshDeleteRequests: [],
    sshProfiles: sshProfiles(),
    sshSavePayloads: [],
    sshSaveRequests: [],
    session: sessionRecord({
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_mode: "normal",
    }),
    topologyPayloads: [],
    uiLanguage: "en-US",
    uiLanguageSavePayloads: [],
    webConfig: webConfig(),
    webSavePayloads: [],
  };
}

async function handleSettingsActionApi(
  context: MockApiRouteContext,
  state: SettingsActionState,
): Promise<boolean> {
  state.requestedPaths.push(context.path);
  const method = context.method;
  const path = context.path;
  if (method === "GET" && path === "/system/configs") {
    await context.fulfillJson(systemConfigResponse());
    return true;
  }
  if (method === "GET" && path === "/system/configs/ui-language") {
    await context.fulfillJson({ language: state.uiLanguage });
    return true;
  }
  if (method === "GET" && path === "/system/configs/environment-variables") {
    await context.fulfillJson(state.environmentVariables);
    return true;
  }
  if (
    method === "PUT" &&
    path.startsWith("/system/configs/environment-variables/")
  ) {
    const { key, scope } = environmentPathParts(path);
    const payload = readJsonBody(context);
    state.environmentSavePayloads.push({ key, payload, scope });
    state.environmentVariables.app = [
      ...state.environmentVariables.app.filter(
        (record) => String(record.key) !== key,
      ),
      {
        key,
        scope,
        value: String(payload.value ?? ""),
        value_kind: "string",
      },
    ];
    await context.fulfillJson({
      key,
      scope,
      value: String(payload.value ?? ""),
      value_kind: "string",
    });
    return true;
  }
  if (
    method === "DELETE" &&
    path.startsWith("/system/configs/environment-variables/")
  ) {
    const { key, scope } = environmentPathParts(path);
    state.environmentDeleteRequests.push({ key, scope });
    state.environmentVariables.app = state.environmentVariables.app.filter(
      (record) => String(record.key) !== key,
    );
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "PUT" && path === "/system/configs/ui-language") {
    const payload = readJsonBody(context);
    state.uiLanguageSavePayloads.push(payload);
    const language = payload.language;
    if (language === "en-US" || language === "zh-CN") {
      state.uiLanguage = language;
    }
    await context.fulfillJson({ language: state.uiLanguage });
    return true;
  }
  if (method === "GET" && path === "/system/configs/clawhub") {
    await context.fulfillJson(state.clawHubConfig);
    return true;
  }
  if (method === "POST" && path === "/system/configs/clawhub:probe") {
    const payload = readJsonBody(context);
    state.clawHubProbePayloads.push(payload);
    await context.fulfillJson({
      checked_at: "2026-06-30T00:00:00Z",
      clawhub_path: "C:/bin/clawhub.exe",
      clawhub_version: "clawhub 0.9.0",
      diagnostics: {
        binary_available: true,
        endpoint_fallback_used: false,
        installation_attempted: true,
        installed_during_probe: true,
        token_configured: true,
      },
      latency_ms: 4200,
      ok: true,
      retryable: false,
    });
    return true;
  }
  if (method === "PUT" && path === "/system/configs/clawhub") {
    const payload = readJsonBody(context);
    state.clawHubSavePayloads.push(payload);
    state.clawHubConfig = payload;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === `/sessions/${SESSION_ID}`) {
    await context.fulfillJson(state.session);
    return true;
  }
  if (method === "PATCH" && path === `/sessions/${SESSION_ID}/topology`) {
    const payload = readJsonBody(context);
    state.topologyPayloads.push(payload);
    state.session = sessionRecord({
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
    });
    await context.fulfillJson(state.session);
    return true;
  }
  if (method === "GET" && path === "/roles:options") {
    await context.fulfillJson(roleOptions());
    return true;
  }
  if (method === "GET" && path === "/roles/configs") {
    await context.fulfillJson(roleConfigSummaries(state));
    return true;
  }
  if (method === "GET" && path.startsWith("/roles/configs/")) {
    const roleId = path.replace("/roles/configs/", "");
    await context.fulfillJson(state.roleConfigs[roleId] ?? {}, roleId in state.roleConfigs ? 200 : 404);
    return true;
  }
  if (method === "PUT" && path.startsWith("/roles/configs/")) {
    const payload = readJsonBody(context);
    state.roleSavePayloads.push(payload);
    const roleId = String(payload.role_id ?? path.replace("/roles/configs/", ""));
    state.roleConfigs[roleId] = {
      ...payload,
      content: `---\nname: ${String(payload.name ?? roleId)}\n---\n${String(payload.system_prompt ?? "")}`,
      deletable: true,
      file_name: `${roleId}.md`,
      source: "project",
    };
    await context.fulfillJson(state.roleConfigs[roleId]);
    return true;
  }
  if (method === "DELETE" && path.startsWith("/roles/configs/")) {
    const roleId = path.replace("/roles/configs/", "");
    state.roleDeleteRequests.push(roleId);
    delete state.roleConfigs[roleId];
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/roles:validate-config") {
    const payload = readJsonBody(context);
    state.roleValidatePayloads.push(payload);
    const roleId = String(payload.role_id ?? "validated");
    await context.fulfillJson({
      role: {
        ...payload,
        content: `---\nname: ${String(payload.name ?? roleId)}\n---\n${String(payload.system_prompt ?? "")}`,
        deletable: true,
        file_name: `${roleId}.md`,
        source: "project",
      },
      valid: true,
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/model/profiles") {
    await context.fulfillJson(state.modelProfiles);
    return true;
  }
  if (method === "GET" && path === "/system/configs/model/catalog") {
    await context.fulfillJson(modelCatalogResponse());
    return true;
  }
  if (method === "POST" && path === "/system/configs/model/catalog:refresh") {
    state.modelCatalogRefreshCount += 1;
    await context.fulfillJson(modelCatalogResponse());
    return true;
  }
  if (method === "PUT" && path.startsWith("/system/configs/model/profiles/")) {
    const profileId = decodeURIComponent(
      path.replace("/system/configs/model/profiles/", ""),
    );
    const payload = readJsonBody(context);
    state.modelProfileSaveRequests.push(profileId);
    state.modelProfileSavePayloads.push(payload);
    const sourceName = payload.source_name;
    if (typeof sourceName === "string") {
      delete state.modelProfiles[sourceName];
    }
    state.modelProfiles[profileId] = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "source_name"),
    );
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/configs/model:reload") {
    state.modelProfileReloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/configs/model:probe") {
    const payload = readJsonBody(context);
    state.modelProbePayloads.push(payload);
    await context.fulfillJson({
      checked_at: "2026-06-26T00:00:00Z",
      diagnostics: {
        auth_valid: true,
        endpoint_reachable: true,
        rate_limited: false,
      },
      latency_ms: 51,
      model: "gpt-5-vision",
      ok: true,
      provider: "openai",
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/orchestration") {
    await context.fulfillJson(state.orchestrationConfig);
    return true;
  }
  if (method === "PUT" && path === "/system/configs/orchestration") {
    const payload = readJsonBody(context);
    state.orchestrationSavePayloads.push(payload);
    state.orchestrationConfig = payload;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/plugins") {
    await context.fulfillJson(pluginsConfigResponse(state));
    return true;
  }
  if (method === "GET" && path === "/system/configs/plugins/runtime") {
    await context.fulfillJson(pluginsConfigResponse(state));
    return true;
  }
  if (method === "POST" && path.startsWith("/system/configs/plugins/")) {
    await handlePluginPost(context, state, path);
    return true;
  }
  if (method === "DELETE" && path.startsWith("/system/configs/plugins/")) {
    const name = decodeURIComponent(path.replace("/system/configs/plugins/", ""));
    state.pluginDeleteRequests.push({
      name,
      prune: context.url.searchParams.get("prune") ?? "false",
      scope: context.url.searchParams.get("scope") ?? "",
    });
    state.plugins = state.plugins.filter((plugin) => plugin.name !== name);
    await context.fulfillJson(pluginsConfigResponse(state));
    return true;
  }
  if (method === "GET" && path === "/system/configs/hooks") {
    await context.fulfillJson(state.hooksConfig);
    return true;
  }
  if (method === "PUT" && path === "/system/configs/hooks") {
    const payload = readJsonBody(context);
    state.hooksSavePayloads.push(payload);
    state.hooksConfig = payload;
    await context.fulfillJson(state.hooksConfig);
    return true;
  }
  if (method === "POST" && path === "/system/configs/hooks:validate") {
    const payload = readJsonBody(context);
    state.hooksValidatePayloads.push(payload);
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/hooks/runtime") {
    await context.fulfillJson(hooksRuntimeResponse());
    return true;
  }
  if (method === "GET" && path === "/system/configs/agent-runtimes") {
    await context.fulfillJson(agentRuntimeSummaries(state));
    return true;
  }
  if (
    method === "GET" &&
    path.startsWith("/system/configs/agent-runtimes/")
  ) {
    const agentId = decodeURIComponent(
      path.replace("/system/configs/agent-runtimes/", ""),
    );
    await context.fulfillJson(
      state.agentRuntimeConfigs[agentId] ?? {},
      agentId in state.agentRuntimeConfigs ? 200 : 404,
    );
    return true;
  }
  if (
    method === "PUT" &&
    path.startsWith("/system/configs/agent-runtimes/")
  ) {
    const agentId = decodeURIComponent(
      path.replace("/system/configs/agent-runtimes/", ""),
    );
    const payload = readJsonBody(context);
    state.agentRuntimeSaveRequests.push(agentId);
    state.agentRuntimeSavePayloads.push(payload);
    state.agentRuntimeConfigs[agentId] = payload;
    await context.fulfillJson(payload);
    return true;
  }
  if (
    method === "DELETE" &&
    path.startsWith("/system/configs/agent-runtimes/")
  ) {
    const agentId = decodeURIComponent(
      path.replace("/system/configs/agent-runtimes/", ""),
    );
    state.agentRuntimeDeleteRequests.push(agentId);
    delete state.agentRuntimeConfigs[agentId];
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/web") {
    await context.fulfillJson(state.webConfig);
    return true;
  }
  if (method === "PUT" && path === "/system/configs/web") {
    const payload = readJsonBody(context);
    state.webSavePayloads.push(payload);
    if (state.failNextWebSave) {
      state.failNextWebSave = false;
      await context.fulfillJson(
        { detail: "Web settings save failed in browser test." },
        500,
      );
      return true;
    }
    state.webConfig = {
      ...state.webConfig,
      ...payload,
      searxng_instance_seeds: state.webConfig.searxng_instance_seeds,
    };
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/workspace/ssh-profiles") {
    await context.fulfillJson(state.sshProfiles);
    return true;
  }
  if (
    method === "PUT" &&
    path.startsWith("/system/configs/workspace/ssh-profiles/")
  ) {
    const profileId = decodeURIComponent(
      path.replace("/system/configs/workspace/ssh-profiles/", ""),
    );
    const payload = readJsonBody(context);
    const config = payload.config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Expected SSH profile config request body.");
    }
    const configRecord = config as Record<string, unknown>;
    state.sshSaveRequests.push(profileId);
    state.sshSavePayloads.push(configRecord);
    const profile = {
      connect_timeout_seconds: configRecord.connect_timeout_seconds,
      created_at: "2026-06-25T08:10:00Z",
      has_password:
        typeof configRecord.password === "string" && configRecord.password !== "",
      has_private_key:
        typeof configRecord.private_key === "string" &&
        configRecord.private_key !== "",
      host: configRecord.host,
      port: configRecord.port,
      private_key_name: configRecord.private_key_name,
      remote_shell: configRecord.remote_shell,
      ssh_profile_id: profileId,
      updated_at: "2026-06-25T08:10:00Z",
      username: configRecord.username,
    };
    state.sshProfiles = [
      ...state.sshProfiles.filter((entry) => entry.ssh_profile_id !== profileId),
      profile,
    ];
    await context.fulfillJson(profile);
    return true;
  }
  if (
    method === "DELETE" &&
    path.startsWith("/system/configs/workspace/ssh-profiles/")
  ) {
    const profileId = decodeURIComponent(
      path.replace("/system/configs/workspace/ssh-profiles/", ""),
    );
    state.sshDeleteRequests.push(profileId);
    state.sshProfiles = state.sshProfiles.filter(
      (profile) => profile.ssh_profile_id !== profileId,
    );
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  return false;
}

async function handlePluginPost(
  context: MockApiRouteContext,
  state: SettingsActionState,
  path: string,
): Promise<void> {
  const payload = readJsonBody(context);
  if (path.endsWith(":enable")) {
    const name = pluginNameFromPath(path, ":enable");
    state.pluginEnableRequests.push({ name, payload });
    setPluginEnabled(state, name, true);
    await context.fulfillJson(pluginsConfigResponse(state));
    return;
  }
  if (path.endsWith(":disable")) {
    const name = pluginNameFromPath(path, ":disable");
    state.pluginDisableRequests.push({ name, payload });
    setPluginEnabled(state, name, false);
    await context.fulfillJson(pluginsConfigResponse(state));
    return;
  }
  if (path.endsWith(":update")) {
    const name = pluginNameFromPath(path, ":update");
    state.pluginUpdateRequests.push({ name, payload });
    for (const plugin of state.plugins) {
      if (plugin.name === name && "version" in payload) {
        plugin.version = payload.version;
      }
    }
    await context.fulfillJson(pluginsConfigResponse(state));
  }
}

function readJsonBody(context: MockApiRouteContext): Record<string, unknown> {
  const body = context.route.request().postData();
  if (body === null || body.trim() === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object request body.");
  }
  return parsed as Record<string, unknown>;
}

function systemConfigResponse(): Record<string, unknown> {
  return {
    skills: {
      loaded: true,
      skills: [
        {
          description: "Create repeatable frontend parity notes.",
          name: "skill-creator",
          ref: "skill-creator",
          source: "user_codex",
        },
      ],
    },
  };
}

function environmentVariables(): {
  app: Record<string, unknown>[];
  system: Record<string, unknown>[];
} {
  return {
    app: [
      {
        key: "EXISTING_BROWSER_ENV",
        scope: "app",
        value: "existing-browser-value",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "SYSTEM_BROWSER_ENV",
        scope: "system",
        value: "%USERPROFILE%/agent-teams",
        value_kind: "expandable",
      },
    ],
  };
}

function environmentPathParts(path: string): { key: string; scope: string } {
  const [scope = "", ...keyParts] = path
    .replace("/system/configs/environment-variables/", "")
    .split("/");
  return {
    key: decodeURIComponent(keyParts.join("/")),
    scope: decodeURIComponent(scope),
  };
}

function sessionRecord({
  normal_root_role_id,
  orchestration_preset_id,
  session_mode,
}: {
  normal_root_role_id: string | null;
  orchestration_preset_id: string | null;
  session_mode: "normal" | "orchestration";
}): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-25T08:00:00Z",
    normal_model_profile: null,
    normal_root_role_id,
    orchestration_preset_id,
    session_id: SESSION_ID,
    session_mode,
    title: "TS environment topology",
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function roleOptions(): Record<string, unknown> {
  return {
    coordinator_role_id: null,
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [{ name: "Main Agent", role_id: "MainAgent" }],
    subagent_roles: [{ name: "Reviewer", role_id: "reviewer" }],
  };
}

function roleConfigs(): Record<string, Record<string, unknown>> {
  return {
    main: {
      bound_agent_id: null,
      content: "---\nname: Main Agent\n---\nHandle work.",
      deletable: false,
      description: "Main role",
      file_name: "main.md",
      mcp_servers: ["filesystem"],
      memory_profile: { enabled: true },
      mode: "primary",
      model_profile: "default",
      name: "Main Agent",
      role_id: "main",
      skills: ["core"],
      source: "app",
      source_role_id: "main",
      system_prompt: "Handle work.",
      tools: ["read_file"],
      version: "1.0.0",
    },
    reviewer: {
      bound_agent_id: "codex-local",
      content: "---\nname: Reviewer\n---\nReview carefully.",
      deletable: true,
      description: "Review changes",
      file_name: "reviewer.md",
      mcp_servers: ["filesystem"],
      memory_profile: { enabled: true },
      mode: "subagent",
      model_profile: "default",
      name: "Reviewer",
      role_id: "reviewer",
      skills: ["review"],
      source: "project",
      source_role_id: "reviewer",
      system_prompt: "Review carefully.",
      tools: ["read_file"],
      version: "1.0.0",
    },
  };
}

function roleConfigSummaries(state: SettingsActionState): Record<string, unknown>[] {
  return Object.values(state.roleConfigs).map((role) => ({
    bound_agent_id: role.bound_agent_id,
    deletable: role.deletable,
    description: role.description,
    mode: role.mode,
    model_profile: role.model_profile,
    name: role.name,
    role_id: role.role_id,
    source: role.source,
    version: role.version,
  }));
}

function agentRuntimeConfigs(): Record<string, Record<string, unknown>> {
  return {
    "codex-acp": {
      agent_id: "codex-acp",
      description: "Default coding agent runtime.",
      name: "Codex ACP",
      native_config_enabled: false,
      native_config_provider: "",
      protocol: "acp",
      skill_bridge_enabled: false,
      skill_bridge_mode: "inline",
      skill_bridge_skills: [],
      transport: {
        args: ["--model", "gpt-5-codex"],
        command: "codex",
        env: [],
        transport: "stdio",
      },
    },
  };
}

function agentRuntimeSummaries(
  state: SettingsActionState,
): Record<string, unknown>[] {
  return Object.values(state.agentRuntimeConfigs).map((runtime) => {
    const transport = runtime.transport;
    const transportRecord =
      transport !== null && typeof transport === "object" && !Array.isArray(transport)
        ? transport as Record<string, unknown>
        : null;
    const transportType =
      typeof transportRecord?.transport === "string"
        ? transportRecord.transport
        : null;
    return {
      agent_id: runtime.agent_id,
      description: runtime.description,
      name: runtime.name,
      protocol: runtime.protocol,
      transport: transportType,
    };
  });
}

function modelProfiles(): Record<string, Record<string, unknown>> {
  return {
    default: {
      base_url: "https://models.example/v1",
      connect_timeout_seconds: 15,
      context_window: 128000,
      is_default: true,
      model: "gpt-5-mini",
      provider: "openai_compatible",
      temperature: 0.7,
      top_p: 1.0,
    },
    vision: {
      base_url: "https://vision.example/v1",
      connect_timeout_seconds: 15,
      input_modalities: ["text", "image"],
      is_default: false,
      model: "gpt-5-vision",
      provider: "openai",
      temperature: 0.7,
      top_p: 1.0,
    },
  };
}

function modelCatalogResponse(): Record<string, unknown> {
  return {
    ok: true,
    providers: [
      {
        api: "https://openai.example/v1",
        id: "openai",
        models: [
          {
            capabilities: {
              input: { image: true, text: true },
              output: { text: true },
            },
            context_window: 128000,
            id: "gpt-5-catalog",
            input_modalities: ["text", "image"],
            name: "GPT-5 Catalog",
            output_limit: 8192,
            reasoning: true,
            tool_call: true,
          },
        ],
        name: "OpenAI",
        runtime_provider: "openai_compatible",
      },
    ],
    source_url: "https://models.dev/api.json",
  };
}

function webConfig(): Record<string, unknown> {
  return {
    exa_api_key: "saved-exa-key",
    fallback_provider: "searxng",
    provider: "exa",
    searxng_instance_seeds: ["https://searx.space"],
    searxng_instance_url: "https://search.initial.example/",
  };
}

function clawHubConfig(): Record<string, unknown> {
  return {
    token: "saved-clawhub-browser-token",
  };
}

function sshProfiles(): Record<string, unknown>[] {
  return [
    {
      connect_timeout_seconds: 15,
      created_at: "2026-06-25T08:00:00Z",
      has_password: true,
      has_private_key: false,
      host: "dev.example.com",
      port: 22,
      private_key_name: null,
      remote_shell: "/bin/bash",
      ssh_profile_id: "devbox",
      updated_at: "2026-06-25T08:05:00Z",
      username: "yex",
    },
  ];
}

function orchestrationConfig(): Record<string, unknown> {
  return {
    default_orchestration_preset_id: "default",
    presets: [
      {
        description: "Review flow",
        graph: {
          nodes: [
            {
              id: "review",
              role_id: "reviewer",
            },
          ],
        },
        name: "Default",
        orchestration_prompt: "Coordinate review work.",
        policy: {
          max_orchestration_cycles: 8,
          max_parallel_delegated_tasks: 4,
        },
        preset_id: "default",
        role_ids: ["reviewer"],
      },
      {
        description: "Ship flow",
        name: "Shipping",
        orchestration_prompt: "Ship completed work.",
        policy: {
          max_orchestration_cycles: 6,
          max_parallel_delegated_tasks: 2,
        },
        preset_id: "shipping",
        role_ids: ["reviewer"],
      },
    ],
  };
}

function pluginsConfigItems(): Record<string, unknown>[] {
  return [
    {
      command_sources: [{ name: "workspace-command" }],
      description: "Workspace utilities",
      enabled: true,
      name: "workspace-tools",
      scope: "user",
      skill_sources: [{ name: "workspace-skill" }],
      valid: true,
      version: "1.0.0",
    },
    {
      description: "Quality checks",
      enabled: false,
      hook_sources: [{ name: "quality-hook" }],
      name: "quality",
      scope: "project",
      valid: true,
      version: "2.0.0",
    },
  ];
}

function pluginsConfigResponse(state: SettingsActionState): Record<string, unknown> {
  return {
    diagnostics: [],
    plugins: state.plugins,
  };
}

function pluginNameFromPath(path: string, suffix: string): string {
  return decodeURIComponent(
    path.replace("/system/configs/plugins/", "").replace(suffix, ""),
  );
}

function setPluginEnabled(
  state: SettingsActionState,
  name: string,
  enabled: boolean,
): void {
  for (const plugin of state.plugins) {
    if (plugin.name === name) {
      plugin.enabled = enabled;
    }
  }
}

function hooksConfig(): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              command: "python hooks/start.py",
              name: "Session startup setup",
              type: "command",
            },
          ],
          matcher: "*",
        },
      ],
    },
  };
}

function hooksRuntimeResponse(): Record<string, unknown> {
  return {
    loaded_hooks: [
      {
        event: "SessionStart",
        handler: "python hooks/start.py",
        name: "Session startup setup",
        source: "project",
      },
    ],
    sources: [
      {
        path: "C:/repo/.relay/hooks",
        source: "project",
      },
    ],
  };
}
