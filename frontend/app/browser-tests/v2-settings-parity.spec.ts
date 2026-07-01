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

const SCREENSHOT_FOLDER = "frontend-v2-ts-settings-parity";

const V1_SETTINGS_SECTIONS = [
  "Appearance",
  "General",
  "Speech",
  "Notifications",
  "Model",
  "Roles",
  "Orchestration",
  "Web",
  "ClawHub",
  "Proxy",
  "Remote workspace",
  "Environment variables",
  "System",
] as const;

const SECONDARY_SYSTEM_PAGES = [
  "MCP",
  "Plugins",
  "Commands",
  "Hooks",
  "Agent Runtime",
  "GitHub",
  "Gateway",
] as const;

interface SettingsParityState {
  notificationConfig: Record<string, Record<string, unknown>>;
  notificationSavePayloads: Record<string, unknown>[];
  proxyConfig: Record<string, unknown>;
  proxyProbePayloads: Record<string, unknown>[];
  proxyReloadCount: number;
  proxySavePayloads: Record<string, unknown>[];
  requestedPaths: string[];
}

test("surveys V1 settings sections and nested system pages from the browser", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings parity survey",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await expect
      .poll(async () => sectionLabels(sections))
      .toEqual([...V1_SETTINGS_SECTIONS]);
    for (const secondaryLabel of SECONDARY_SYSTEM_PAGES) {
      await expect(sections.getByRole("button", { name: secondaryLabel }))
        .toHaveCount(0);
    }

    for (const sectionLabel of V1_SETTINGS_SECTIONS) {
      await sections.getByRole("button", { name: sectionLabel }).click();
      await expect(settings.getByRole("heading", { name: sectionLabel }))
        .toBeVisible();
    }

    await expect(settings.getByText("Skills loaded")).toBeVisible();
    for (const secondaryLabel of SECONDARY_SYSTEM_PAGES) {
      await expect(
        settings.locator(".at-settings-list-button").filter({
          hasText: secondaryLabel,
        }),
      ).toBeVisible();
    }

    await expectNoDocumentScroll(page, "v2 settings parity survey should stay framed");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      path: screenshotPath("v2-settings-v1-section-survey.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("saves Notifications and Proxy settings through real V2 controls", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings actions parity",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await sections.getByRole("button", { name: "Notifications" }).click();
    await expect(settings.getByRole("heading", { name: "Notifications" }))
      .toBeVisible();
    await expect(settings.getByText("Tool approval requested")).toBeVisible();
    await expect(settings.getByText("Run completed")).toBeVisible();
    const failedRow = settings.locator(".at-notification-row").filter({
      hasText: "Run failed",
    });
    await expect(failedRow.getByText("1 hidden channel preserved.")).toBeVisible();
    await failedRow.getByRole("switch", { name: "Enabled" }).click();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/notifications") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.notificationSavePayloads).toHaveLength(1);
    expect(state.notificationSavePayloads[0]).toMatchObject({
      config: {
        run_failed: {
          enabled: false,
        },
      },
    });

    await sections.getByRole("button", { name: "Proxy" }).click();
    await expect(settings.getByRole("heading", { name: "Proxy" })).toBeVisible();
    await expect(settings.getByLabel("Default SSL verification"))
      .toHaveValue("");
    await settings.getByLabel("HTTP Proxy").fill("http://127.0.0.1:7890");
    await settings.getByLabel("Target URL").fill("https://example.org");
    await settings.getByRole("button", { name: "Test URL" }).click();
    await expect(settings.getByText("HEAD 204 in 33ms")).toBeVisible();
    await expect(settings.getByText("Proxy was used for this URL.")).toBeVisible();
    expect(state.proxyProbePayloads.at(-1)).toMatchObject({
      proxy_override: {
        http_proxy: "http://127.0.0.1:7890",
        ssl_verify: null,
      },
      timeout_ms: 5000,
      url: "https://example.org",
    });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/system/configs/proxy:reload") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.proxySavePayloads.at(-1)).toMatchObject({
      http_proxy: "http://127.0.0.1:7890",
      proxy_password: "saved-proxy-password",
      ssl_verify: null,
    });
    expect(state.proxyReloadCount).toBe(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 notification and proxy settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-settings-notification-proxy-actions.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function openSettingsDialog(page: Page): Promise<Locator> {
  await page
    .locator(".at-topbar")
    .getByRole("button", { name: "Settings" })
    .click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  return settings;
}

async function sectionLabels(sections: Locator): Promise<string[]> {
  return sections.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.textContent?.trim() ?? ""),
  );
}

function settingsParityState(): SettingsParityState {
  return {
    notificationConfig: notificationConfig(),
    notificationSavePayloads: [],
    proxyConfig: proxyConfig(),
    proxyProbePayloads: [],
    proxyReloadCount: 0,
    proxySavePayloads: [],
    requestedPaths: [],
  };
}

async function handleSettingsParityApi(
  context: MockApiRouteContext,
  state: SettingsParityState,
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
    await context.fulfillJson(roleConfigSummaries());
    return true;
  }
  if (method === "GET" && path === "/system/configs/model/profiles") {
    await context.fulfillJson(modelProfiles());
    return true;
  }
  if (method === "GET" && path === "/system/configs/orchestration") {
    await context.fulfillJson(orchestrationConfig());
    return true;
  }
  if (method === "GET" && path === "/system/configs/agent-runtimes") {
    await context.fulfillJson(agentRuntimes());
    return true;
  }
  if (method === "GET" && path === "/system/configs/web") {
    await context.fulfillJson(webConfig());
    return true;
  }
  if (method === "GET" && path === "/system/configs/clawhub") {
    await context.fulfillJson({ token: "saved-clawhub-token" });
    return true;
  }
  if (method === "GET" && path === "/system/configs/environment-variables") {
    await context.fulfillJson(environmentVariables());
    return true;
  }
  if (method === "GET" && path === "/system/configs/workspace/ssh-profiles") {
    await context.fulfillJson(sshProfiles());
    return true;
  }
  if (method === "GET" && path === "/system/configs/proxy") {
    await context.fulfillJson(state.proxyConfig);
    return true;
  }
  if (method === "PUT" && path === "/system/configs/proxy") {
    const payload = readJsonBody(context);
    state.proxySavePayloads.push(payload);
    state.proxyConfig = payload;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/configs/proxy:reload") {
    state.proxyReloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (method === "POST" && path === "/system/configs/web:probe") {
    const payload = readJsonBody(context);
    state.proxyProbePayloads.push(payload);
    await context.fulfillJson({
      checked_at: "2026-06-30T12:00:00Z",
      diagnostics: {
        endpoint_reachable: true,
        redirected: false,
        used_proxy: true,
      },
      final_url: "https://example.org",
      latency_ms: 33,
      ok: true,
      status_code: 204,
      url: "https://example.org",
      used_method: "HEAD",
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/notifications") {
    await context.fulfillJson(state.notificationConfig);
    return true;
  }
  if (method === "PUT" && path === "/system/configs/notifications") {
    const payload = readJsonBody(context);
    state.notificationSavePayloads.push(payload);
    const config = payload.config;
    if (isRecordOfRecords(config)) {
      state.notificationConfig = config;
    }
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  return false;
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

function isRecordOfRecords(value: unknown): value is Record<string, Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item),
    )
  );
}

function systemConfigResponse(): Record<string, unknown> {
  return {
    skills: {
      loaded: true,
      skills: [
        {
          description: "Frontend parity verification.",
          name: "frontend-parity",
          ref: "frontend-parity",
          source: "project",
        },
      ],
    },
  };
}

function roleOptions(): Record<string, unknown> {
  return {
    coordinator_role_id: null,
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      {
        description: "Default chat role.",
        name: "Main Agent",
        role_id: "MainAgent",
      },
    ],
    subagent_roles: [
      {
        description: "Reviews delegated work.",
        name: "Reviewer",
        role_id: "reviewer",
      },
    ],
  };
}

function roleConfigSummaries(): Record<string, unknown>[] {
  return [
    {
      bound_agent_id: null,
      deletable: false,
      description: "Default role",
      mode: "primary",
      model_profile: "default",
      name: "Main Agent",
      role_id: "main",
      source: "app",
      version: "1.0.0",
    },
  ];
}

function modelProfiles(): Record<string, Record<string, unknown>> {
  return {
    default: {
      base_url: "https://models.example/v1",
      context_window: 128000,
      is_default: true,
      model: "gpt-5-mini",
      provider: "openai_compatible",
    },
  };
}

function orchestrationConfig(): Record<string, unknown> {
  return {
    default_orchestration_preset_id: "default",
    presets: [
      {
        description: "Main plus reviewer.",
        name: "Default",
        orchestration_prompt: "Coordinate delegated work.",
        preset_id: "default",
        role_ids: ["reviewer"],
      },
    ],
  };
}

function agentRuntimes(): Record<string, unknown>[] {
  return [
    {
      agent_id: "codex-acp",
      description: "Default coding runtime.",
      name: "Codex ACP",
      protocol: "acp",
      transport: "stdio",
    },
  ];
}

function webConfig(): Record<string, unknown> {
  return {
    exa_api_key: "saved-exa-key",
    fallback_provider: "searxng",
    provider: "exa",
    searxng_instance_seeds: ["https://searx.space"],
    searxng_instance_url: "https://search.example/",
  };
}

function environmentVariables(): Record<string, Record<string, unknown>[]> {
  return {
    app: [
      {
        key: "V2_PARITY_ENV",
        scope: "app",
        value: "enabled",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "PATH",
        scope: "system",
        value: "C:/Windows/System32",
        value_kind: "expandable",
      },
    ],
  };
}

function sshProfiles(): Record<string, unknown>[] {
  return [
    {
      connect_timeout_seconds: 15,
      has_password: true,
      has_private_key: false,
      host: "dev.example.com",
      port: 22,
      remote_shell: "/bin/bash",
      ssh_profile_id: "devbox",
      username: "yex",
    },
  ];
}

function proxyConfig(): Record<string, unknown> {
  return {
    all_proxy: null,
    http_proxy: null,
    https_proxy: "http://127.0.0.1:7891",
    no_proxy: "localhost;127.*",
    proxy_password: "saved-proxy-password",
    proxy_username: "proxy-user",
    ssl_verify: null,
  };
}

function notificationConfig(): Record<string, Record<string, unknown>> {
  return {
    monitor_triggered: {
      channels: ["toast"],
      enabled: true,
    },
    run_completed: {
      channels: ["toast"],
      enabled: true,
    },
    run_failed: {
      channels: ["browser", "feishu"],
      enabled: true,
    },
    run_stopped: {
      channels: [],
      enabled: false,
    },
    tool_approval_requested: {
      channels: ["browser", "toast"],
      enabled: true,
    },
  };
}
