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
  hooksConfig: Record<string, unknown>;
  hooksSavePayloads: Record<string, unknown>[];
  hooksValidatePayloads: Record<string, unknown>[];
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
}

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

async function openSettingsDialog(page: Page): Promise<Locator> {
  await page.locator(".at-topbar").getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
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

function settingsActionState(): SettingsActionState {
  return {
    hooksConfig: hooksConfig(),
    hooksSavePayloads: [],
    hooksValidatePayloads: [],
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
