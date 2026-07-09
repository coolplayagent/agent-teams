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
  commandCatalog: Record<string, unknown>;
  commandCreatePayloads: Record<string, unknown>[];
  commandUpdatePayloads: Record<string, unknown>[];
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
  feishuGatewayAccounts: Record<string, unknown>[];
  feishuGatewayDisableRequests: string[];
  feishuGatewayReloadCount: number;
  feishuGatewayUpdatePayloads: Record<string, unknown>[];
  feishuGatewayUpdateRequests: string[];
  failNextHooksValidateDetail: Record<string, unknown>[] | null;
  hooksConfig: Record<string, unknown>;
  hooksSavePayloads: Record<string, unknown>[];
  hooksValidatePayloads: Record<string, unknown>[];
  githubConfig: Record<string, unknown>;
  githubProbePayloads: Record<string, unknown>[];
  githubRevealCount: number;
  githubSavePayloads: Record<string, unknown>[];
  githubTunnelStartPayloads: Record<string, unknown>[];
  githubTunnelStatus: Record<string, unknown>;
  githubTunnelStopPayloads: Record<string, unknown>[];
  githubWebhookProbePayloads: Record<string, unknown>[];
  mcpAddPayloads: Record<string, unknown>[];
  mcpEnablePayloads: Record<string, unknown>[];
  mcpRefreshToolRequests: string[];
  mcpReloadCount: number;
  mcpServers: Record<string, unknown>[];
  mcpTestRequests: string[];
  mcpUpdatePayloads: Array<{ name: string; payload: Record<string, unknown> }>;
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
  pluginInstallRequests: Record<string, unknown>[];
  pluginMarketplaceRequests: Record<string, unknown>[];
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
  wechatGatewayAccounts: Record<string, unknown>[];
  wechatGatewayLoginStartCount: number;
  wechatGatewayLoginWaitPayloads: Record<string, unknown>[];
  wechatGatewayReloadCount: number;
  wechatGatewayUpdatePayloads: Record<string, unknown>[];
  wechatGatewayUpdateRequests: string[];
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
    await expect(settings.getByText("quality", { exact: true })).toBeVisible();

    const qualityRow = settings.locator(".at-plugin-list-row").filter({
      hasText: "1 components",
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

    await settings.getByRole("button", { name: "Add Plugin" }).click();
    await settings
      .locator(".ant-form-item", { hasText: "Source type" })
      .locator(".ant-select-selector")
      .click();
    const sourceKindDropdown = page.locator(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden)",
    );
    const marketplaceSourceOption = sourceKindDropdown.locator(
      ".ant-select-item-option-content",
      { hasText: "Marketplace" },
    );
    await expect(marketplaceSourceOption).toBeVisible();
    await marketplaceSourceOption.click();
    await settings
      .getByRole("textbox", { exact: true, name: "Marketplace" })
      .fill("C:/plugins/marketplace.json");
    await settings.getByRole("button", { name: "Load marketplace" }).click();
    await expect.poll(() => state.pluginMarketplaceRequests).toEqual([
      {
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        fetch_all: true,
        include_details: false,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        refresh: true,
      },
    ]);
    await expect(settings.getByText("market-install 0.2.0")).toBeVisible();
    await expect(settings.getByText("unsupported-quality")).toHaveCount(0);
    await settings.getByRole("button", { name: "Add Plugin" }).click();
    await expect.poll(() => state.pluginInstallRequests).toEqual([
      {
        allow_community_plugins: false,
        allow_executes_code: false,
        allow_missing_digest: false,
        allow_unclean_scan: false,
        enabled: true,
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_ref: "",
        marketplace_source: "",
        scope: "user",
        source: "market-install",
        source_kind: "marketplace",
        version: null,
      },
    ]);
    await expect(settings.getByText("market-install")).toBeVisible();

    const marketplaceRow = settings.locator(".at-plugin-list-row").filter({
      hasText: "Marketplace quality tools",
    });
    await marketplaceRow.getByRole("button", { name: "Update" }).click();
    await expect.poll(() => state.pluginMarketplaceRequests.length).toBe(2);
    expect(state.pluginMarketplaceRequests[1]).toEqual({
      allow_missing_digest: false,
      fetch_all: true,
      include_details: false,
      marketplace: "C:/plugins/marketplace.json",
      marketplace_provider: "local_json",
      marketplace_ref: "",
      marketplace_source: "",
      refresh: true,
    });
    await expect(settings.getByText("latest (1.2.0)")).toBeVisible();
    await settings
      .locator(".ant-form-item", { hasText: "Version" })
      .locator(".ant-select-selector")
      .click();
    const versionDropdown = page.locator(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden)",
    );
    const previousVersionOption = versionDropdown.locator(
      ".ant-select-item-option-content",
      { hasText: "1.1.0 v1.1.0" },
    );
    await expect(previousVersionOption).toBeVisible();
    await previousVersionOption.click();
    await settings.getByRole("button", { name: "Update" }).click();
    await expect.poll(() => state.pluginUpdateRequests).toEqual([
      {
        name: "workspace-tools",
        payload: { scope: "user", version: "1.0.0" },
      },
      {
        name: "market-quality",
        payload: {
          allow_missing_digest: false,
          scope: "user",
          version: "1.1.0",
        },
      },
    ]);
    await page.screenshot({
      path: screenshotPath("v2-plugin-marketplace-actions.png", SCREENSHOT_FOLDER),
    });

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
    await expect(settings.getByLabel("Hooks JSON")).toHaveCount(0);
    await expect(settings.getByText("Session startup setup").first()).toBeVisible();
    await expect(
      settings.getByText("SessionStart · python hooks/start.py"),
    ).toBeVisible();
    await expect(settings.getByText("project", { exact: true })).toBeVisible();

    const existingHooksPayload = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                command: "python hooks/start.py",
                name: "Session startup setup",
                on_error: "ignore",
                type: "command",
              },
            ],
            matcher: "*",
          },
        ],
      },
    };

    await settings.getByRole("button", { name: "Validate" }).click();
    await expect.poll(() => state.hooksValidatePayloads).toEqual([
      existingHooksPayload,
    ]);

    await settings.getByRole("button", { name: "Edit" }).click();
    await settings.getByLabel("Command").fill("python hooks/session_start.py");
    const nextHooks = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                command: "python hooks/session_start.py",
                name: "Session startup setup",
                on_error: "ignore",
                type: "command",
              },
            ],
            matcher: "*",
          },
        ],
      },
    };
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.hooksSavePayloads).toEqual([nextHooks]);
    await expect(page.getByText("Hooks saved.")).toBeVisible();
    await settings.getByRole("button", { name: "Edit" }).click();
    const savedCommand = settings.getByLabel("Command");
    await expect(savedCommand).toHaveValue(
      "python hooks/session_start.py",
    );
    state.failNextHooksValidateDetail = [
      {
        loc: ["hooks", "PreToolUse", 0, "hooks", 0, "command"],
        msg: "Field required",
      },
    ];
    await savedCommand.fill("");
    await settings.getByRole("button", { name: "Validate" }).click();
    await expect(
      page.getByText(
        "Failed to validate hooks config: PreToolUse hook 1, handler 1: Command is required.",
      ),
    ).toBeVisible();
    await savedCommand.scrollIntoViewIfNeeded();
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 hooks settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-hooks-structured-editor-save.png", SCREENSHOT_FOLDER),
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

test("manages Gateway accounts from the System secondary settings page", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS gateway settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    await expect(sections.getByRole("button", { name: "Gateway" }))
      .toHaveCount(0);

    await openSystemSettingsPage(settings, "Gateway");
    await expect(settings.getByRole("heading", { name: "Gateway" })).toBeVisible();
    await expect(settings.getByText("Feishu Main")).toBeVisible();
    await expect(settings.getByText("WeChat Main")).toBeVisible();
    await expect(settings.getByText("Relay Bot · workspace-1 · mention_only"))
      .toBeVisible();
    await expect(settings.getByText("workspace-1 · desktop · Running"))
      .toBeVisible();
    expect(state.requestedPaths).toContain("/gateway/feishu/accounts");
    expect(state.requestedPaths).toContain("/gateway/wechat/accounts");

    await settings.getByRole("button", { name: "Reload Feishu gateway" }).click();
    await expect.poll(() => state.feishuGatewayReloadCount).toBe(1);
    await settings.getByRole("button", { name: "Reload WeChat gateway" }).click();
    await expect.poll(() => state.wechatGatewayReloadCount).toBe(1);

    await settings.getByRole("button", { name: "Connect WeChat" }).click();
    await expect.poll(() => state.wechatGatewayLoginStartCount).toBe(1);
    await expect.poll(() => state.wechatGatewayLoginWaitPayloads).toEqual([
      { session_key: "wechat-session", timeout_ms: 480000 },
    ]);
    await expect(settings.getByText("Connected.")).toBeVisible();

    const feishuRow = settings.locator(".at-trigger-row").filter({
      hasText: "Feishu Main",
    });
    await feishuRow.getByRole("button", { name: "Disable" }).click();
    await expect.poll(() => state.feishuGatewayDisableRequests)
      .toEqual(["feishu-main"]);
    const disabledFeishuRow = settings.locator(".at-trigger-row").filter({
      hasText: "Feishu Main",
    });
    await expect(disabledFeishuRow).toContainText("Disabled");

    await disabledFeishuRow.locator(".at-trigger-row-main").click();
    await expect(settings.getByText("Account ID")).toBeVisible();
    await expect(
      settings.locator(".at-settings-detail-page"),
    ).toContainText("feishu-main");
    await settings.getByRole("textbox", { name: "* Name" })
      .fill("feishu-updated");
    await settings.getByRole("textbox", { name: "* App name" })
      .fill("Relay Bot Updated");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.feishuGatewayUpdateRequests)
      .toEqual(["feishu-main"]);
    expect(state.feishuGatewayUpdatePayloads.at(-1)).toMatchObject({
      display_name: "Feishu Main",
      name: "feishu-updated",
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot Updated",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        workspace_id: "workspace-1",
        yolo: true,
      },
    });
    expect(state.feishuGatewayUpdatePayloads.at(-1))
      .not.toHaveProperty("secret_config");

    await expect(settings.getByText("WeChat Main")).toBeVisible();
    const wechatRow = settings.locator(".at-trigger-row").filter({
      hasText: "WeChat Main",
    });
    await wechatRow.locator(".at-trigger-row-main").click();
    await expect(
      settings.getByText("WeChat gateway account and session target."),
    ).toBeVisible();
    await settings.getByLabel("Display name").fill("WeChat Updated");
    await settings.getByLabel("Route tag").fill("mobile");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.wechatGatewayUpdateRequests)
      .toEqual(["wechat-main"]);
    expect(state.wechatGatewayUpdatePayloads.at(-1)).toMatchObject({
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      display_name: "WeChat Updated",
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      route_tag: "mobile",
      session_mode: "normal",
      thinking: {
        enabled: false,
        effort: null,
      },
      workspace_id: "workspace-1",
      yolo: true,
    });

    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 8000,
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 gateway settings should stay framed");
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-gateway-settings-actions.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("manages MCP, Commands, and GitHub from System secondary settings", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS system secondary settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    for (const secondaryName of ["MCP", "Commands", "GitHub"]) {
      await expect(sections.getByRole("button", { name: secondaryName }))
        .toHaveCount(0);
    }

    await openSystemSettingsPage(settings, "Commands");
    await expect(settings.getByRole("heading", { name: "Commands" }))
      .toBeVisible();
    await expect(settings.getByText("/opsx:propose")).toBeVisible();
    await settings.getByRole("button", { name: "Edit /opsx:propose" }).click();
    await settings.getByLabel("Description").fill("Updated proposal command");
    await settings.getByLabel("Allowed modes").fill("normal, orchestration");
    await settings.getByLabel("Prompt template").fill("Updated {{args}}");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.commandUpdatePayloads).toEqual([
      {
        aliases: ["opsx/propose"],
        allowed_modes: ["normal", "orchestration"],
        argument_hint: "<change-id>",
        description: "Updated proposal command",
        name: "opsx:propose",
        source_path: "C:/repo/.claude/commands/opsx/propose.md",
        template: "Updated {{args}}",
      },
    ]);

    await settings.getByRole("button", { name: "Add Command" }).click();
    await settings.getByLabel("Command name").fill("opsx:review");
    await expect(settings.getByLabel("File path")).toHaveValue("opsx/review.md");
    await settings.getByLabel("Description").fill("Created command");
    await settings.getByLabel("Prompt template").fill("Review {{args}}");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.commandCreatePayloads).toEqual([
      {
        aliases: [],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Created command",
        name: "opsx:review",
        relative_path: "opsx/review.md",
        scope: "project",
        source: "relay_teams",
        template: "Review {{args}}",
        workspace_id: "workspace-1",
      },
    ]);
    await expect(settings.getByText("/opsx:review")).toBeVisible();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 8000,
    });
    await page.screenshot({
      path: screenshotPath("v2-commands-secondary-actions.png", SCREENSHOT_FOLDER),
    });

    await openSystemSettingsPage(settings, "MCP");
    await expect(settings.getByRole("heading", { name: "MCP" })).toBeVisible();
    await expect(settings.getByText("filesystem")).toBeVisible();
    await expect(settings.getByText("github")).toBeVisible();
    await expect(settings.getByText("read_file")).toBeVisible();
    await settings.getByRole("button", { name: "Test filesystem" }).click();
    await expect.poll(() => state.mcpTestRequests).toEqual(["filesystem"]);
    await expect(settings.getByText("filesystem connected with 2 tools."))
      .toBeVisible();
    await settings.getByRole("button", { name: "Refresh tools for filesystem" }).click();
    await expect.poll(() => state.mcpRefreshToolRequests).toEqual(["filesystem"]);
    await expect(settings.getByText("list_files")).toBeVisible();
    await settings.getByRole("button", { name: "Disable filesystem" }).click();
    await expect.poll(() => state.mcpEnablePayloads).toEqual([
      { enabled: false, name: "filesystem" },
    ]);

    await settings.getByRole("button", { name: "Edit filesystem" }).click();
    await expect(settings.getByLabel("Command")).toHaveValue("node");
    await settings.getByLabel("Command").fill("npx");
    await settings.getByLabel("Arguments").fill("-y\nserver.js");
    await settings.getByLabel("Environment").fill("MCP_LOG=debug");
    await settings.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => state.mcpUpdatePayloads).toEqual([
      {
        name: "filesystem",
        payload: {
          config: {
            args: ["-y", "server.js"],
            command: "npx",
            env: { MCP_LOG: "debug" },
            transport: "stdio",
          },
        },
      },
    ]);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 8000,
    });
    await page.screenshot({
      path: screenshotPath("v2-mcp-secondary-actions.png", SCREENSHOT_FOLDER),
    });

    await openSystemSettingsPage(settings, "GitHub");
    await expect(settings.getByRole("heading", { name: "GitHub" })).toBeVisible();
    await expect(settings.locator("strong", { hasText: "GitHub CLI" }))
      .toBeVisible();
    await expect(
      settings.getByText("https://hooks.example/api/triggers/github/deliveries"),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Reveal token" }).click();
    await expect.poll(() => state.githubRevealCount).toBe(1);
    await expect(settings.locator("input[value='ghp_saved']")).toBeVisible();
    await settings.getByLabel("Token").fill("ghp_next");
    await settings.getByRole("button", { name: "Test GitHub CLI" }).click();
    await expect.poll(() => state.githubProbePayloads).toEqual([
      { token: "ghp_next" },
    ]);
    await expect(settings.getByText("Connected as octocat in 21 ms."))
      .toBeVisible();
    await settings.getByRole("button", { name: "Save token" }).click();
    await expect.poll(() => state.githubSavePayloads.at(-1)).toEqual({
      token: "ghp_next",
    });
    await settings.getByLabel("Webhook base URL").fill("https://changed.example");
    await expect(
      settings.getByText("https://changed.example/api/triggers/github/deliveries"),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Test callback" }).click();
    await expect.poll(() => state.githubWebhookProbePayloads).toEqual([
      { webhook_base_url: "https://changed.example" },
    ]);
    await expect(settings.getByText("Callback returned 200 in 34 ms."))
      .toBeVisible();
    await settings.getByRole("button", { name: "Save webhook" }).click();
    await expect.poll(() => state.githubSavePayloads.at(-1)).toEqual({
      webhook_base_url: "https://changed.example",
    });
    await settings.getByRole("button", { name: "Stop tunnel" }).click();
    await expect.poll(() => state.githubTunnelStopPayloads).toEqual([
      { clear_webhook_base_url_if_matching: true },
    ]);
    await settings.getByRole("button", { name: "Start tunnel" }).click();
    await expect.poll(() => state.githubTunnelStartPayloads).toEqual([
      { auto_save_webhook_base_url: true },
    ]);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 8000,
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 MCP, Commands, and GitHub settings should stay framed",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-github-secondary-actions.png", SCREENSHOT_FOLDER),
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
    await page.screenshot({
      path: screenshotPath("v2-environment-variables-list.png", SCREENSHOT_FOLDER),
    });

    await settings.getByRole("button", { name: "New variable" }).click();
    const envDialog = page.getByRole("dialog", { name: "New variable" });
    await expect(envDialog).toBeVisible();
    await envDialog.getByLabel("Key").fill("BROWSER_TS_ENV");
    await envDialog.getByLabel("Value").fill("browser-ts-value");
    await envDialog.screenshot({
      path: screenshotPath("v2-environment-variable-create-dialog.png", SCREENSHOT_FOLDER),
    });
    await envDialog.getByRole("button", { name: "Save" }).click();
    await expect(envDialog).toBeHidden();
    await expect(settings.getByText("BROWSER_TS_ENV")).toBeVisible();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-environment-variable-created.png", SCREENSHOT_FOLDER),
    });
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
    await createdEnvRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Edit environment variable",
    });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel("Key")).toHaveValue("BROWSER_TS_ENV");
    await expect(editDialog.getByLabel("Value")).toHaveValue("browser-ts-value");
    await editDialog.getByLabel("Value").fill("browser-ts-value-edited");
    await editDialog.screenshot({
      path: screenshotPath("v2-environment-variable-edit-dialog.png", SCREENSHOT_FOLDER),
    });
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden();
    await expect(settings.getByText("browser-ts-value-edited")).toBeVisible();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    expect(state.environmentSavePayloads).toEqual([
      {
        key: "BROWSER_TS_ENV",
        payload: { source_key: null, value: "browser-ts-value" },
        scope: "app",
      },
      {
        key: "BROWSER_TS_ENV",
        payload: {
          source_key: "BROWSER_TS_ENV",
          value: "browser-ts-value-edited",
        },
        scope: "app",
      },
    ]);
    await page.screenshot({
      path: screenshotPath("v2-environment-variable-edited.png", SCREENSHOT_FOLDER),
    });

    await createdEnvRow.getByRole("button", { name: "Delete" }).click();
    const confirm = page.locator(".ant-modal-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm.locator(".ant-modal-confirm-title")).toHaveText(
      'Delete environment variable "BROWSER_TS_ENV"?',
    );
    await expect(confirm.getByRole("button", { name: "Delete" })).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(settings.getByText("BROWSER_TS_ENV")).toHaveCount(0);
    expect(state.environmentDeleteRequests).toEqual([
      { key: "BROWSER_TS_ENV", scope: "app" },
    ]);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-environment-variable-deleted.png", SCREENSHOT_FOLDER),
    });

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

test("creates a MaaS model profile from the catalog with profile credentials", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsActionApi(context, state),
      sessionTitle: "TS model MaaS settings",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Model" })
      .click();

    await settings.getByRole("button", { name: "New profile" }).click();
    await expect(settings.getByText("Model catalog", { exact: true })).toBeVisible();
    await settings.locator(".at-model-catalog-option").filter({ hasText: "MaaS" }).click();

    await expect(settings.locator("input#provider")).toHaveValue("maas");
    await expect(settings.locator("input#model")).toHaveValue("maas-chat");
    await expect(settings.locator("input#base_url")).toHaveValue(
      "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/",
    );
    await expect(settings.getByLabel("API Key")).toHaveCount(0);
    await settings.locator("input#profile_id").fill("maas-browser");
    await settings.getByLabel("MaaS username").fill("relay-user");
    await settings.getByLabel("MaaS password").fill("relay-password");

    await page.screenshot({
      path: screenshotPath("v2-model-profile-maas-credentials.png", SCREENSHOT_FOLDER),
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
            .endsWith("/api/system/configs/model/profiles/maas-browser") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);

    expect(state.modelProfileSaveRequests).toEqual(["maas-browser"]);
    expect(state.modelProfileSavePayloads.at(-1)).toEqual({
      base_url: "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/",
      catalog_model_name: "MaaS Chat",
      catalog_provider_id: "maas",
      catalog_provider_name: "MaaS",
      connect_timeout_seconds: 15,
      context_window: null,
      fallback_policy_id: null,
      fallback_priority: 0,
      is_default: false,
      maas_auth: {
        auth_source: "profile",
        password: "relay-password",
        username: "relay-user",
      },
      max_tokens: null,
      model: "maas-chat",
      provider: "maas",
      temperature: 0.7,
      top_p: 1,
    });
    expect(state.modelProfileSavePayloads.at(-1)).not.toHaveProperty("api_key");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 MaaS model profile should stay framed");
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
  const target = settings.locator(".at-settings-list-button")
    .filter({ hasText: pageName });
  const visible = await target.first().isVisible().catch(() => false);
  if (!visible) {
    const backButton = settings.getByRole("button", { name: "Back" });
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
    }
  }
  await expect(target.first()).toBeVisible();
  await target.first().click();
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
    commandCatalog: commandCatalog(),
    commandCreatePayloads: [],
    commandUpdatePayloads: [],
    environmentDeleteRequests: [],
    environmentSavePayloads: [],
    environmentVariables: environmentVariables(),
    failNextHooksValidateDetail: null,
    failNextWebSave: false,
    feishuGatewayAccounts: feishuGatewayAccounts(),
    feishuGatewayDisableRequests: [],
    feishuGatewayReloadCount: 0,
    feishuGatewayUpdatePayloads: [],
    feishuGatewayUpdateRequests: [],
    hooksConfig: hooksConfig(),
    hooksSavePayloads: [],
    hooksValidatePayloads: [],
    githubConfig: githubConfig(),
    githubProbePayloads: [],
    githubRevealCount: 0,
    githubSavePayloads: [],
    githubTunnelStartPayloads: [],
    githubTunnelStatus: githubTunnelStatus("active"),
    githubTunnelStopPayloads: [],
    githubWebhookProbePayloads: [],
    mcpAddPayloads: [],
    mcpEnablePayloads: [],
    mcpRefreshToolRequests: [],
    mcpReloadCount: 0,
    mcpServers: mcpServers(),
    mcpTestRequests: [],
    mcpUpdatePayloads: [],
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
    pluginInstallRequests: [],
    pluginMarketplaceRequests: [],
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
    wechatGatewayAccounts: wechatGatewayAccounts(),
    wechatGatewayLoginStartCount: 0,
    wechatGatewayLoginWaitPayloads: [],
    wechatGatewayReloadCount: 0,
    wechatGatewayUpdatePayloads: [],
    wechatGatewayUpdateRequests: [],
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
  if (method === "GET" && path === "/workspaces") {
    await context.fulfillJson([
      { root_path: "C:/repo", workspace_id: "workspace-1" },
    ]);
    return true;
  }
  if (method === "GET" && path === "/system/commands:catalog") {
    await context.fulfillJson(state.commandCatalog);
    return true;
  }
  if (method === "PUT" && path === "/system/commands") {
    const payload = readJsonBody(context);
    state.commandUpdatePayloads.push(payload);
    updateCommandCatalog(state, payload);
    await context.fulfillJson({ command: payload, status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/commands") {
    const payload = readJsonBody(context);
    state.commandCreatePayloads.push(payload);
    createCommandInCatalog(state, payload);
    await context.fulfillJson({ command: payload, status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/mcp/servers") {
    await context.fulfillJson(state.mcpServers);
    return true;
  }
  if (method === "POST" && path === "/mcp/servers") {
    const payload = readJsonBody(context);
    state.mcpAddPayloads.push(payload);
    state.mcpServers = [
      ...state.mcpServers,
      {
        discovery_status: "pending",
        enabled: true,
        name: String(payload.name ?? "new-server"),
        source: "app",
        tool_count: 0,
        transport: "stdio",
      },
    ];
    await context.fulfillJson({
      config_path: "C:/config/mcp.json",
      server: state.mcpServers.at(-1),
    });
    return true;
  }
  if (method === "POST" && path === "/system/configs/mcp:reload") {
    state.mcpReloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (path.startsWith("/mcp/servers/")) {
    const handled = await handleMcpApi(context, state, path);
    if (handled) {
      return true;
    }
  }
  if (method === "GET" && path === "/system/configs/github") {
    await context.fulfillJson(state.githubConfig);
    return true;
  }
  if (method === "POST" && path === "/system/configs/github:reveal") {
    state.githubRevealCount += 1;
    await context.fulfillJson({ token: "ghp_saved" });
    return true;
  }
  if (method === "PUT" && path === "/system/configs/github") {
    const payload = readJsonBody(context);
    state.githubSavePayloads.push(payload);
    state.githubConfig = { ...state.githubConfig, ...payload };
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/configs/github:probe") {
    const payload = readJsonBody(context);
    state.githubProbePayloads.push(payload);
    await context.fulfillJson({
      latency_ms: 21,
      ok: true,
      username: "octocat",
    });
    return true;
  }
  if (method === "POST" && path === "/system/configs/github/webhook:probe") {
    const payload = readJsonBody(context);
    state.githubWebhookProbePayloads.push(payload);
    await context.fulfillJson({
      callback_url: "https://hooks.example/api/triggers/github/deliveries",
      latency_ms: 34,
      ok: true,
      status_code: 200,
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/github/webhook/tunnel") {
    await context.fulfillJson(state.githubTunnelStatus);
    return true;
  }
  if (
    method === "POST" &&
    path === "/system/configs/github/webhook/tunnel:stop"
  ) {
    const payload = readJsonBody(context);
    state.githubTunnelStopPayloads.push(payload);
    state.githubTunnelStatus = githubTunnelStatus("inactive");
    await context.fulfillJson(state.githubTunnelStatus);
    return true;
  }
  if (
    method === "POST" &&
    path === "/system/configs/github/webhook/tunnel:start"
  ) {
    const payload = readJsonBody(context);
    state.githubTunnelStartPayloads.push(payload);
    state.githubTunnelStatus = githubTunnelStatus("active");
    await context.fulfillJson(state.githubTunnelStatus);
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
  if (method === "POST" && path === "/system/configs/plugins:install") {
    const payload = readJsonBody(context);
    state.pluginInstallRequests.push(payload);
    state.plugins = [
      ...state.plugins,
      {
        description: "Installed from marketplace",
        enabled: payload.enabled !== false,
        name: String(payload.source ?? "market-install"),
        scope: String(payload.scope ?? "user"),
        source: {
          kind: "marketplace",
          marketplace: String(payload.marketplace ?? ""),
          marketplace_provider: String(payload.marketplace_provider ?? "local_json"),
          marketplace_source: String(payload.marketplace_source ?? ""),
          value: String(payload.source ?? ""),
        },
        valid: true,
        version: payload.version,
      },
    ];
    await context.fulfillJson(pluginsConfigResponse(state));
    return true;
  }
  if (method === "POST" && path === "/system/configs/plugins/marketplace") {
    const payload = readJsonBody(context);
    state.pluginMarketplaceRequests.push(payload);
    await context.fulfillJson(pluginMarketplaceResponse());
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
    if (state.failNextHooksValidateDetail !== null) {
      await context.fulfillJson({ detail: state.failNextHooksValidateDetail }, 422);
      state.failNextHooksValidateDetail = null;
      return true;
    }
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/hooks/runtime") {
    await context.fulfillJson(hooksRuntimeResponse());
    return true;
  }
  if (method === "GET" && path === "/gateway/feishu/accounts") {
    await context.fulfillJson(state.feishuGatewayAccounts);
    return true;
  }
  if (method === "POST" && path === "/gateway/feishu/reload") {
    state.feishuGatewayReloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (
    method === "POST" &&
    path.startsWith("/gateway/feishu/accounts/") &&
    path.endsWith(":disable")
  ) {
    const accountId = decodeURIComponent(
      path
        .replace("/gateway/feishu/accounts/", "")
        .replace(":disable", ""),
    );
    state.feishuGatewayDisableRequests.push(accountId);
    state.feishuGatewayAccounts = state.feishuGatewayAccounts.map((account) =>
      account.account_id === accountId ? { ...account, status: "disabled" } : account,
    );
    await context.fulfillJson(
      state.feishuGatewayAccounts.find((account) => account.account_id === accountId) ??
        {},
    );
    return true;
  }
  if (
    method === "PATCH" &&
    path.startsWith("/gateway/feishu/accounts/")
  ) {
    const accountId = decodeURIComponent(
      path.replace("/gateway/feishu/accounts/", ""),
    );
    const payload = readJsonBody(context);
    state.feishuGatewayUpdateRequests.push(accountId);
    state.feishuGatewayUpdatePayloads.push(payload);
    state.feishuGatewayAccounts = state.feishuGatewayAccounts.map((account) =>
      account.account_id === accountId
        ? {
            ...account,
            display_name: payload.display_name ?? account.display_name,
            name: payload.name ?? account.name,
            source_config: payload.source_config ?? account.source_config,
            target_config: payload.target_config ?? account.target_config,
            updated_at: "2026-06-26T10:00:00Z",
          }
        : account,
    );
    await context.fulfillJson(
      state.feishuGatewayAccounts.find((account) => account.account_id === accountId) ??
        {},
    );
    return true;
  }
  if (method === "GET" && path === "/gateway/wechat/accounts") {
    await context.fulfillJson(state.wechatGatewayAccounts);
    return true;
  }
  if (method === "POST" && path === "/gateway/wechat/reload") {
    state.wechatGatewayReloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/gateway/wechat/login/start") {
    state.wechatGatewayLoginStartCount += 1;
    await context.fulfillJson({
      message: "Scan the QR code.",
      qr_code_url: "data:image/png;base64,abc",
      session_key: "wechat-session",
    });
    return true;
  }
  if (method === "POST" && path === "/gateway/wechat/login/wait") {
    const payload = readJsonBody(context);
    state.wechatGatewayLoginWaitPayloads.push(payload);
    await context.fulfillJson({
      account_id: "wechat-main",
      connected: true,
      message: "Connected.",
    });
    return true;
  }
  if (
    method === "PATCH" &&
    path.startsWith("/gateway/wechat/accounts/")
  ) {
    const accountId = decodeURIComponent(
      path.replace("/gateway/wechat/accounts/", ""),
    );
    const payload = readJsonBody(context);
    state.wechatGatewayUpdateRequests.push(accountId);
    state.wechatGatewayUpdatePayloads.push(payload);
    state.wechatGatewayAccounts = state.wechatGatewayAccounts.map((account) =>
      account.account_id === accountId
        ? {
            ...account,
            base_url: payload.base_url ?? account.base_url,
            cdn_base_url: payload.cdn_base_url ?? account.cdn_base_url,
            display_name: payload.display_name ?? account.display_name,
            normal_root_role_id:
              payload.normal_root_role_id ?? account.normal_root_role_id,
            orchestration_preset_id:
              payload.orchestration_preset_id ?? account.orchestration_preset_id,
            route_tag: payload.route_tag ?? account.route_tag,
            session_mode: payload.session_mode ?? account.session_mode,
            thinking: payload.thinking ?? account.thinking,
            updated_at: "2026-06-26T10:00:00Z",
            workspace_id: payload.workspace_id ?? account.workspace_id,
            yolo: payload.yolo ?? account.yolo,
          }
        : account,
    );
    await context.fulfillJson(
      state.wechatGatewayAccounts.find((account) => account.account_id === accountId) ??
        {},
    );
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

async function handleMcpApi(
  context: MockApiRouteContext,
  state: SettingsActionState,
  path: string,
): Promise<boolean> {
  const method = context.method;
  const pathAfterServerPrefix = path.replace("/mcp/servers/", "");
  if (method === "GET" && pathAfterServerPrefix.endsWith("/tools")) {
    const serverName = decodeURIComponent(
      pathAfterServerPrefix.replace("/tools", ""),
    );
    await context.fulfillJson(mcpToolsSummary(serverName));
    return true;
  }
  if (method === "POST" && pathAfterServerPrefix.endsWith("/tools:refresh")) {
    const serverName = decodeURIComponent(
      pathAfterServerPrefix.replace("/tools:refresh", ""),
    );
    state.mcpRefreshToolRequests.push(serverName);
    await context.fulfillJson({
      ...mcpToolsSummary(serverName),
      tools: [
        { description: "Read a file", name: "read_file" },
        { description: "Write a file", name: "write_file" },
        { description: "List files", name: "list_files" },
      ],
    });
    return true;
  }
  if (method === "POST" && pathAfterServerPrefix.endsWith("/test")) {
    const serverName = decodeURIComponent(
      pathAfterServerPrefix.replace("/test", ""),
    );
    state.mcpTestRequests.push(serverName);
    await context.fulfillJson({
      enabled: true,
      ok: true,
      server: serverName,
      source: "app",
      tool_count: 2,
      tools: [
        { description: "Read a file", name: "read_file" },
        { description: "Write a file", name: "write_file" },
      ],
      transport: "stdio",
    });
    return true;
  }
  if (method === "PUT" && pathAfterServerPrefix.endsWith("/enabled")) {
    const serverName = decodeURIComponent(
      pathAfterServerPrefix.replace("/enabled", ""),
    );
    const payload = readJsonBody(context);
    const enabled = payload.enabled === true;
    state.mcpEnablePayloads.push({ enabled, name: serverName });
    state.mcpServers = state.mcpServers.map((server) =>
      server.name === serverName
        ? {
            ...server,
            discovery_status: enabled ? "ready" : "disabled",
            enabled,
          }
        : server,
    );
    await context.fulfillJson(
      state.mcpServers.find((server) => server.name === serverName) ?? {},
    );
    return true;
  }
  if (method === "GET") {
    const serverName = decodeURIComponent(pathAfterServerPrefix);
    await context.fulfillJson(mcpServerConfig(serverName, state));
    return true;
  }
  if (method === "PUT") {
    const serverName = decodeURIComponent(pathAfterServerPrefix);
    const payload = readJsonBody(context);
    state.mcpUpdatePayloads.push({ name: serverName, payload });
    state.mcpServers = state.mcpServers.map((server) =>
      server.name === serverName
        ? {
            ...server,
            discovery_status: "pending",
            enabled: true,
            tool_count: 0,
          }
        : server,
    );
    await context.fulfillJson(mcpServerConfig(serverName, state, payload.config));
    return true;
  }
  return false;
}

function updateCommandCatalog(
  state: SettingsActionState,
  payload: Record<string, unknown>,
): void {
  const sourcePath = String(payload.source_path ?? "");
  const workspaces = Array.isArray(state.commandCatalog.workspaces)
    ? state.commandCatalog.workspaces
    : [];
  state.commandCatalog = {
    ...state.commandCatalog,
    workspaces: workspaces.map((workspace) => {
      if (
        workspace === null ||
        typeof workspace !== "object" ||
        Array.isArray(workspace)
      ) {
        return workspace;
      }
      const workspaceRecord = workspace as Record<string, unknown>;
      const commands = Array.isArray(workspaceRecord.commands)
        ? workspaceRecord.commands
        : [];
      return {
        ...workspaceRecord,
        commands: commands.map((command) => {
          if (
            command !== null &&
            typeof command === "object" &&
            !Array.isArray(command) &&
            (command as Record<string, unknown>).source_path === sourcePath
          ) {
            return { ...command as Record<string, unknown>, ...payload };
          }
          return command;
        }),
      };
    }),
  };
}

function createCommandInCatalog(
  state: SettingsActionState,
  payload: Record<string, unknown>,
): void {
  const workspaces = Array.isArray(state.commandCatalog.workspaces)
    ? state.commandCatalog.workspaces
    : [];
  const newCommand = {
    aliases: payload.aliases ?? [],
    allowed_modes: payload.allowed_modes ?? ["normal"],
    argument_hint: payload.argument_hint ?? "",
    description: payload.description ?? "",
    discovery_source: "project_relay_teams",
    name: payload.name,
    scope: payload.scope ?? "project",
    source_path: `C:/repo/.relay-teams/commands/${String(
      payload.relative_path ?? "new-command.md",
    )}`,
    template: payload.template ?? "",
  };
  state.commandCatalog = {
    ...state.commandCatalog,
    workspaces: workspaces.map((workspace) => {
      if (
        workspace === null ||
        typeof workspace !== "object" ||
        Array.isArray(workspace)
      ) {
        return workspace;
      }
      const workspaceRecord = workspace as Record<string, unknown>;
      if (workspaceRecord.workspace_id !== payload.workspace_id) {
        return workspace;
      }
      return {
        ...workspaceRecord,
        commands: [...(Array.isArray(workspaceRecord.commands)
          ? workspaceRecord.commands
          : []), newCommand],
      };
    }),
  };
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

function feishuGatewayAccounts(): Record<string, unknown>[] {
  return [
    {
      account_id: "feishu-main",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "Feishu Main",
      name: "feishu-main",
      secret_status: {
        app_secret_configured: true,
      },
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      status: "enabled",
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        thinking: {
          enabled: false,
          effort: null,
        },
        workspace_id: "workspace-1",
        yolo: true,
      },
      updated_at: "2026-06-24T00:00:00Z",
    },
  ];
}

function wechatGatewayAccounts(): Record<string, unknown>[] {
  return [
    {
      account_id: "wechat-main",
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "WeChat Main",
      last_error: null,
      last_event_at: null,
      last_inbound_at: null,
      last_login_at: "2026-06-24T00:00:00Z",
      last_outbound_at: null,
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      remote_user_id: "wxid_main",
      route_tag: "desktop",
      running: true,
      session_mode: "normal",
      status: "enabled",
      sync_cursor: "",
      thinking: { enabled: false, effort: null },
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "workspace-1",
      yolo: true,
    },
  ];
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
    normal_mode_roles: [
      { name: "Main Agent", role_id: "MainAgent" },
      { name: "Main", role_id: "main" },
    ],
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
      {
        api: null,
        id: "maas",
        models: [
          {
            id: "maas-chat",
            name: "MaaS Chat",
          },
        ],
        name: "MaaS",
        runtime_provider: "maas",
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

function commandCatalog(): Record<string, unknown> {
  return {
    app_commands: [
      {
        aliases: ["g"],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Global command",
        discovery_source: "app",
        name: "global",
        scope: "app",
        source_path: "C:/config/commands/global.md",
        template: "Global {{args}}",
      },
    ],
    workspaces: [
      {
        can_create_commands: true,
        commands: [
          {
            aliases: ["opsx/propose"],
            allowed_modes: ["normal"],
            argument_hint: "<change-id>",
            description: "Create an OpenSpec proposal",
            discovery_source: "project_claude",
            name: "opsx:propose",
            scope: "project",
            source_path: "C:/repo/.claude/commands/opsx/propose.md",
            template: "Propose {{args}}",
          },
        ],
        root_path: "C:/repo",
        workspace_id: "workspace-1",
      },
    ],
  };
}

function mcpServers(): Record<string, unknown>[] {
  return [
    {
      discovery_status: "ready",
      enabled: true,
      last_checked_at: "2026-06-24T00:00:00Z",
      name: "filesystem",
      source: "app",
      tool_count: 2,
      transport: "stdio",
    },
    {
      discovery_status: "disabled",
      enabled: false,
      name: "github",
      source: "plugin",
      tool_count: 0,
      transport: "streamable-http",
    },
  ];
}

function mcpToolsSummary(serverName: string): Record<string, unknown> {
  return {
    enabled: serverName === "filesystem",
    last_checked_at: "2026-06-24T00:00:00Z",
    server: serverName,
    source: serverName === "filesystem" ? "app" : "plugin",
    status: serverName === "filesystem" ? "ready" : "disabled",
    tools:
      serverName === "filesystem"
        ? [
            { description: "Read a file", name: "read_file" },
            { description: "Write a file", name: "write_file" },
          ]
        : [],
    transport: serverName === "filesystem" ? "stdio" : "streamable-http",
  };
}

function mcpServerConfig(
  serverName: string,
  state: SettingsActionState,
  configOverride?: unknown,
): Record<string, unknown> {
  const server =
    state.mcpServers.find((candidate) => candidate.name === serverName) ??
    {
      discovery_status: "ready",
      enabled: true,
      name: serverName,
      source: "app",
      tool_count: 0,
      transport: "stdio",
    };
  const config =
    configOverride !== undefined
      ? configOverride
      : {
          args: ["server.js"],
          command: "node",
          env: {
            MCP_LOG: "info",
          },
          transport: "stdio",
        };
  return { config, server };
}

function githubConfig(): Record<string, unknown> {
  return {
    token_configured: true,
    webhook_base_url: "https://hooks.example",
  };
}

function githubTunnelStatus(status: "active" | "inactive"): Record<string, unknown> {
  return {
    provider: "localhost.run",
    public_url: status === "active" ? "https://relay.localhost.run" : null,
    status,
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
    {
      description: "Marketplace quality tools",
      enabled: true,
      name: "market-quality",
      scope: "user",
      source: {
        kind: "marketplace",
        marketplace: "C:/plugins/marketplace.json",
        marketplace_provider: "local_json",
        marketplace_source: "",
        value: "market-quality",
      },
      valid: true,
      version: "1.1.0",
    },
  ];
}

function pluginsConfigResponse(state: SettingsActionState): Record<string, unknown> {
  return {
    diagnostics: [],
    plugins: state.plugins,
  };
}

function pluginMarketplaceResponse(): Record<string, unknown> {
  return {
    plugins: [
      {
        latest: "0.2.0",
        name: "market-install",
        versions: [
          {
            source: {
              kind: "git",
              ref: "v0.2.0",
              value: "https://repo.example/market-install",
            },
            version: "0.2.0",
          },
        ],
      },
      {
        latest: "1.2.0",
        name: "market-quality",
        versions: [
          {
            source: {
              kind: "git",
              ref: "v1.1.0",
              value: "https://repo.example/quality",
            },
            version: "1.1.0",
          },
          {
            source: {
              kind: "git",
              ref: "v1.2.0",
              value: "https://repo.example/quality",
            },
            version: "1.2.0",
          },
        ],
      },
      {
        latest: "2.0.0",
        name: "unsupported-quality",
        versions: [
          {
            source: { kind: "unsupported", value: "@example/plugin" },
            unsupported_reason: "npm is not supported",
            version: "2.0.0",
          },
        ],
      },
    ],
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
