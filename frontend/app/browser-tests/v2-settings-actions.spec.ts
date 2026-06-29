import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-settings-actions";

interface SettingsActionState {
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
    await reviewerRow.click();
    await expect(settings.getByLabel("Role ID")).toHaveValue("reviewer");

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

    await settings
      .getByRole("button", { name: "Default 1 roles · Review flow" })
      .click();
    await expect(settings.getByLabel("Preset ID")).toHaveValue("default");
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
    await expect(settings.getByLabel("Preset ID")).toHaveValue("analysis");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 orchestration settings should stay framed",
    );
    await page.screenshot({
      path: screenshotPath("v2-orchestration-create-save.png", SCREENSHOT_FOLDER),
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
      .getByRole("button", { name: "Models" })
      .click();

    await expect(settings.getByRole("heading", { name: "Models" })).toBeVisible();
    const visionRow = settings.locator(".at-model-profile-row").filter({
      hasText: "vision",
    });
    await expect(visionRow).toBeVisible();
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
      .getByRole("button", { name: "Models" })
      .click();

    await expect(settings.getByRole("heading", { name: "Models" })).toBeVisible();
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

    await expect(settings.getByText("Model catalog")).toBeVisible();
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
        .getByRole("button", { name: "中文" })
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
        .getByRole("button", { name: "EN" })
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
    await expect(
      settings.getByRole("alert").getByText("Web settings save failed in browser test."),
    ).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-web-settings-error.png", SCREENSHOT_FOLDER),
    });
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 web settings should stay framed");
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

function settingsActionState(): SettingsActionState {
  return {
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
