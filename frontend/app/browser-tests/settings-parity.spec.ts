import { writeFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  LEGACY_SETTINGS_TAB_DEFINITIONS,
  SETTINGS_SECTION_DEFINITIONS,
} from "../src/features/settings/settingsNavigation";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installMockEventSource,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForAppShell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-settings-parity";

const V2_LABEL_BY_SECTION = {
  appearance: "Appearance",
  "agent-runtime": "Agent Runtime",
  commands: "Commands",
  environment: "Environment variables",
  general: "General",
  hooks: "Hooks",
  mcp: "MCP",
  models: "Model",
  notifications: "Notifications",
  orchestration: "Orchestration",
  plugins: "Plugins",
  proxy: "Proxy",
  roles: "Roles",
  speech: "Speech",
  web: "Web",
  workspace: "Remote workspace",
} as const;

const V2_SETTINGS_SECTIONS = SETTINGS_SECTION_DEFINITIONS.map(
  (section) => V2_LABEL_BY_SECTION[section.key],
);

const HOMEPAGE_CONTEXT_LABELS = ["ClawHub", "GitHub", "Gateway", "System"];

interface SettingsParityState {
  failNextNotificationSave: boolean;
  notificationConfig: Record<string, Record<string, unknown>>;
  notificationSavePayloads: Record<string, unknown>[];
  proxyConfig: Record<string, unknown>;
  proxyProbePayloads: Record<string, unknown>[];
  proxyReloadCount: number;
  proxySavePayloads: Record<string, unknown>[];
  requestedPaths: string[];
}

interface SettingsSurfaceSnapshot {
  controlCount: number;
  controls: string[];
  id: string;
  label: string;
  text: string;
}

interface SettingsSurfaceContract {
  id: string;
  v1Controls?: string[];
  v1Text: string[];
  v2Controls: string[];
  v2Id: string;
  v2Text: string[];
}

interface V1DetailSurfaceContract {
  controls: string[];
  id: string;
  tabKey: string;
  text: string[];
  trigger: string;
}

interface V2DetailSurfaceContract {
  closeAction: "Back" | "Cancel";
  controls: string[];
  dialogName?: string;
  id: string;
  rowIsButton?: boolean;
  rowText: string;
  tabKey: string;
  useEditAction?: boolean;
}

const SETTINGS_SURFACE_CONTRACTS: SettingsSurfaceContract[] = [
  {
    id: "appearance",
    v1Text: ["Accent", "Background", "UI Font Size", "Line Height", "Message Spacing"],
    v2Controls: ["Theme preset", "Accent color value", "UI font", "Line height", "Message spacing"],
    v2Id: "appearance",
    v2Text: ["System", "Light", "Dark", "Contrast", "Diff markers"],
  },
  {
    id: "general",
    v1Controls: ["Show diagnostic information", "Enable local shell safeguards", "STT Profile", "Language"],
    v1Text: ["Diagnostics", "Shell Policy", "Speech to Text", "Notifications"],
    v2Controls: ["Shell safety policy", "Show diagnostic information", "Speech", "Notifications", "Save"],
    v2Id: "general",
    v2Text: ["Shell policy", "Related settings", "Speech", "Notifications"],
  },
  {
    id: "model",
    v1Controls: ["Set default", "Test", "Edit", "Delete"],
    v1Text: ["default", "OpenAI Compatible", "gpt-5-mini", "Fallback disabled"],
    v2Controls: ["New profile", "Default", "Test", "Delete"],
    v2Id: "models",
    v2Text: ["Profiles", "Default profile", "gpt-5-mini", "openai_compatible"],
  },
  {
    id: "mcp",
    v1Text: ["No MCP servers loaded", "reload"],
    v2Controls: ["Refresh", "Reload config", "Add Server"],
    v2Id: "mcp",
    v2Text: ["Servers", "Enabled", "Tools", "No MCP servers configured"],
  },
  {
    id: "plugins",
    v1Text: ["No plugins installed", "roles", "skills", "hooks", "commands", "MCP servers"],
    v2Controls: ["Refresh", "Add Plugin"],
    v2Id: "plugins",
    v2Text: ["Plugins", "Diagnostics", "No plugins configured"],
  },
  {
    id: "commands",
    v1Text: ["No commands discovered", "app config commands", "workspace command"],
    v2Controls: ["Search command or workspace", "Refresh", "Add Command"],
    v2Id: "commands",
    v2Text: ["Commands", "Workspaces", "Global", "No commands discovered"],
  },
  {
    id: "hooks",
    v1Text: ["No hooks configured", "Add a hook"],
    v2Controls: ["Refresh", "Add hook", "Validate", "Save"],
    v2Id: "hooks",
    v2Text: ["Configured groups", "Loaded hooks", "Sources", "No hooks configured"],
  },
  {
    id: "agents",
    v1Controls: ["Edit"],
    v1Text: ["Codex ACP", "ACP", "Stdio", "Default coding runtime"],
    v2Controls: ["Refresh", "ACP registry", "New runtime", "Codex ACP"],
    v2Id: "agent-runtime",
    v2Text: ["Agent runtimes", "Default coding runtime", "acp", "stdio"],
  },
  {
    id: "roles",
    v1Controls: ["Edit"],
    v1Text: ["Main Agent", "main", "v1.0.0", "default", "api"],
    v2Controls: ["New role", "Main Agent"],
    v2Id: "roles",
    v2Text: ["Coordinator", "Main agent", "Normal roles", "Subagent roles", "Default role"],
  },
  {
    id: "orchestration",
    v1Controls: ["Set default", "Edit"],
    v1Text: ["Default", "Roles: 1", "Main plus reviewer"],
    v2Controls: ["New orchestration", "Default", "Set default", "Edit"],
    v2Id: "orchestration",
    v2Text: ["Default preset", "Presets", "Main plus reviewer"],
  },
  {
    id: "web",
    v1Controls: ["Provider", "Exa API Key", "Fallback Provider", "SearXNG Instance URL"],
    v1Text: ["Web Search Provider", "Built-in Instances", "Provider website"],
    v2Controls: ["Exa API key", "Fallback provider", "SearXNG instance URL", "Save"],
    v2Id: "web",
    v2Text: ["Provider", "Built-in instances", "Provider website", "https://exa.ai"],
  },
  {
    id: "proxy",
    v1Controls: ["HTTP Proxy", "HTTPS Proxy", "ALL Proxy", "NO_PROXY", "Default SSL Verification", "Target URL", "Timeout (ms)"],
    v1Text: ["Proxy Settings", "Connectivity Test"],
    v2Controls: ["HTTP Proxy", "HTTPS Proxy", "ALL Proxy", "NO_PROXY", "Default SSL verification", "Target URL", "Timeout (ms)", "Test URL", "Save"],
    v2Id: "proxy",
    v2Text: ["Proxy settings", "Proxy authentication", "Connectivity test"],
  },
  {
    id: "workspace",
    v1Controls: ["Test", "Edit", "Delete"],
    v1Text: ["devbox", "dev.example.com", "Password"],
    v2Controls: ["New SSH profile", "Test", "Edit", "Delete"],
    v2Id: "workspace",
    v2Text: ["devbox", "dev.example.com", "Authentication", "Remote shell"],
  },
  {
    id: "environment",
    v1Controls: ["Edit", "Delete", "System Variables 1 Show"],
    v1Text: ["App Variables", "System Variables", "V2_PARITY_ENV"],
    v2Controls: ["New variable", "Edit", "Delete", "System1"],
    v2Id: "environment",
    v2Text: ["App", "System", "V2_PARITY_ENV", "String"],
  },
];

const V1_DETAIL_SURFACE_CONTRACTS: V1DetailSurfaceContract[] = [
  {
    controls: ["Profile Name", "API Protocol", "Base URL", "Model", "API Key"],
    id: "model/edit",
    tabKey: "model",
    text: ["Provider and Model", "Advanced Options", "Fallback"],
    trigger: "Edit",
  },
  {
    controls: ["Agent ID", "Name", "Description", "Protocol", "Transport"],
    id: "agents/edit",
    tabKey: "agents",
    text: ["Stdio Transport", "Environment Bindings", "Custom", "Registry"],
    trigger: "Edit",
  },
  {
    controls: ["Role ID", "Name", "Description", "Version", "Model Profile", "Bound Agent", "Execution Surface"],
    id: "roles/edit",
    tabKey: "roles",
    text: ["Role Editor", "Tool Groups", "MCP Servers", "Skills", "Durable Memory"],
    trigger: "Edit",
  },
  {
    controls: ["Orchestration ID", "Orchestration Name", "Description", "Max Cycles", "Max Parallel Tasks"],
    id: "orchestration/edit",
    tabKey: "orchestration",
    text: ["Orchestration Editor", "Allowed Roles", "Delete Orchestration"],
    trigger: "Edit",
  },
  {
    controls: ["Profile ID", "Host", "Port", "Remote Shell", "Connect Timeout (s)", "Username", "Password", "Private Key"],
    id: "workspace/edit",
    tabKey: "workspace",
    text: ["SSH Profile", "Authentication"],
    trigger: "Edit",
  },
  {
    controls: ["Key", "Value"],
    id: "environment/edit",
    tabKey: "environment",
    text: ["App Variables", "System Variables"],
    trigger: "Edit",
  },
];

const V2_DETAIL_SURFACE_CONTRACTS: V2DetailSurfaceContract[] = [
  {
    closeAction: "Back",
    controls: ["Profile ID", "Provider", "Model", "Base URL", "API Key"],
    id: "model/edit",
    rowText: "gpt-5-mini",
    tabKey: "model",
  },
  {
    closeAction: "Back",
    controls: ["Agent ID", "Name", "Description", "Protocol", "Transport"],
    id: "agents/edit",
    rowIsButton: true,
    rowText: "Default coding runtime",
    tabKey: "agents",
  },
  {
    closeAction: "Back",
    controls: [
      "Role ID",
      "Role name",
      "Description",
      "Version",
      "Model profile",
      "Bound agent",
      "Execution surface",
    ],
    id: "roles/edit",
    rowText: "Default role",
    tabKey: "roles",
  },
  {
    closeAction: "Back",
    controls: [
      "Preset ID",
      "Preset name",
      "Description",
      "Max cycles",
      "Max parallel tasks",
    ],
    id: "orchestration/edit",
    rowText: "Main plus reviewer",
    tabKey: "orchestration",
  },
  {
    closeAction: "Cancel",
    controls: [
      "Profile ID",
      "Host",
      "Port",
      "Remote shell",
      "Connect timeout (s)",
      "Username",
      "Password",
      "Private key",
    ],
    dialogName: "Edit SSH profile",
    id: "workspace/edit",
    rowText: "dev.example.com",
    tabKey: "workspace",
    useEditAction: true,
  },
  {
    closeAction: "Cancel",
    controls: ["Key", "Value"],
    dialogName: "Edit environment variable",
    id: "environment/edit",
    rowText: "V2_PARITY_ENV",
    tabKey: "environment",
    useEditAction: true,
  },
];

interface NotificationRowSnapshot {
  browserChecked: boolean;
  browserDisabled: boolean;
  description: string;
  enabled: boolean;
  hasHiddenChannels: boolean;
  hiddenText: string[];
  title: string;
  toastChecked: boolean;
  toastDisabled: boolean;
  type: string;
}

const EXPECTED_NOTIFICATION_ROWS: NotificationRowSnapshot[] = [
  {
    browserChecked: true,
    browserDisabled: false,
    description: "When an agent asks for approval before a tool call.",
    enabled: true,
    hasHiddenChannels: false,
    hiddenText: [],
    title: "Tool approval requested",
    toastChecked: true,
    toastDisabled: false,
    type: "tool_approval_requested",
  },
  {
    browserChecked: false,
    browserDisabled: false,
    description: "When a run finishes successfully.",
    enabled: true,
    hasHiddenChannels: false,
    hiddenText: [],
    title: "Run completed",
    toastChecked: true,
    toastDisabled: false,
    type: "run_completed",
  },
  {
    browserChecked: true,
    browserDisabled: false,
    description: "When a run stops because of an error.",
    enabled: true,
    hasHiddenChannels: true,
    hiddenText: [],
    title: "Run failed",
    toastChecked: false,
    toastDisabled: false,
    type: "run_failed",
  },
  {
    browserChecked: false,
    browserDisabled: true,
    description: "When a run is stopped by user action.",
    enabled: false,
    hasHiddenChannels: false,
    hiddenText: [],
    title: "Run stopped",
    toastChecked: false,
    toastDisabled: true,
    type: "run_stopped",
  },
];

test("surveys the flat V1-aligned settings navigation without homepage duplicates", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings parity survey",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await expect
      .poll(async () => sectionLabels(sections))
      .toEqual(V2_SETTINGS_SECTIONS);
    for (const homepageLabel of HOMEPAGE_CONTEXT_LABELS) {
      await expect(sections.getByRole("button", { name: homepageLabel }))
        .toHaveCount(0);
    }

    for (const sectionLabel of V2_SETTINGS_SECTIONS) {
      await sections.getByRole("button", { name: sectionLabel }).click();
      await expect(settings.getByRole("heading", { name: sectionLabel }))
        .toBeVisible();
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

test("keeps compact settings navigation discoverable at tablet and phone widths", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await page.setViewportSize({ height: 780, width: 768 });
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS compact settings navigation",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    let settings = await openSettingsDialog(page);
    const compactNavigation = settings.locator(".at-settings-mobile-navigation");
    await expect(compactNavigation).toBeVisible();
    await expect(
      settings.getByRole("navigation", { name: "Settings sections" }),
    ).toBeHidden();
    const selector = compactNavigation.getByRole("combobox", {
      name: "Settings sections",
    });
    await expect(selector).toBeVisible();
    await expect.poll(() => settings.evaluate((element) => (
      element.scrollWidth <= element.clientWidth
    ))).toBe(true);
    await page.setViewportSize({ height: 780, width: 390 });
    await expect(compactNavigation).toBeVisible();
    await compactNavigation.locator(".ant-select-selector").click();
    for (let index = 0; index < 5; index += 1) {
      await selector.press("ArrowDown");
    }
    await selector.press("Enter");
    await expect(settings.getByRole("heading", { name: "MCP" })).toBeVisible();
    await expect(compactNavigation).toContainText("MCP");
    await expect.poll(() => settings.evaluate((element) => (
      element.scrollWidth <= element.clientWidth
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    ))).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath("v2-settings-compact-navigation-390.png", SCREENSHOT_FOLDER),
    });

    await settings.getByRole("button", { name: "Close" }).click();
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Connectors" })
      .click();
    await page.getByRole("button", { name: "Close sidebar" }).click();
    await page.getByTestId("connector-action-github").click();
    settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings.getByRole("heading", { name: "GitHub" })).toBeVisible();
    const contextualNavigation = settings.locator(".at-settings-mobile-navigation");
    await expect(contextualNavigation).toContainText("GitHub");
    await contextualNavigation.locator(".ant-select-selector").click();
    const contextualSelector = contextualNavigation.getByRole("combobox", {
      name: "Settings sections",
    });
    await contextualSelector.press("ArrowDown");
    await contextualSelector.press("Enter");
    await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await expect(contextualNavigation).toContainText("Appearance");
    await expectNoDocumentScroll(page, "compact contextual settings should stay framed");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("recovers primary and role-detail settings after their automatic retries fail", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  let generalRequests = 0;
  let roleDetailRequests = 0;
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "GET" && context.path === "/system/configs/general") {
          generalRequests += 1;
          if (generalRequests <= 2) {
            await context.fulfillJson({ detail: "General settings unavailable." }, 500);
          } else {
            await context.fulfillJson({ shell_safety_policy_enabled: true });
          }
          return true;
        }
        if (context.method === "GET" && context.path === "/roles/configs/main") {
          roleDetailRequests += 1;
          if (roleDetailRequests <= 2) {
            await context.fulfillJson({ detail: "Role detail unavailable." }, 500);
          } else {
            await context.fulfillJson(roleConfigDocument());
          }
          return true;
        }
        return handleSettingsParityApi(context, state);
      },
      sessionTitle: "TS settings retry recovery",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await sections.getByRole("button", { name: "General" }).click();
    await expect(settings.getByText("General settings unavailable."))
      .toBeVisible();
    await settings.getByRole("button", { name: "Retry" }).click();
    await expect(settings.getByRole("switch", { name: "Shell safety policy" }))
      .toBeChecked();
    await expect(settings.getByText("General settings unavailable."))
      .toHaveCount(0);
    expect(generalRequests).toBeGreaterThanOrEqual(3);

    await sections.getByRole("button", { name: "Roles" }).click();
    const mainRole = settings.locator(".at-settings-list-button").filter({
      hasText: "Main Agent",
    });
    await expect(mainRole).toHaveCount(1);
    await mainRole.click();
    await expect(settings.getByText("Role detail unavailable."))
      .toBeVisible();
    await settings.getByRole("button", { name: "Retry" }).click();
    await expect(settings.getByLabel("Role ID")).toHaveValue("main");
    await expect(settings.locator(
      '.ant-select-selection-item[title="workspace"]',
    )).toBeVisible();
    await expect(settings.getByText("Role detail unavailable."))
      .toHaveCount(0);
    expect(roleDetailRequests).toBeGreaterThanOrEqual(3);

    await expect(page.locator(".at-topbar")).toBeVisible();
    await expect(settings.getByRole("navigation", { name: "Settings sections" }))
      .toBeVisible();
    await page.waitForTimeout(1800);
    await expectNoDocumentScroll(page, "settings retry recovery should stay framed");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath("v2-settings-primary-detail-recovered.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("recovers every remaining primary Settings page after loading and request failure", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  const recoveryPaths = [
    "/system/configs/model/profiles",
    "/roles/configs",
    "/system/configs/orchestration",
    "/system/configs/web",
    "/system/configs/proxy",
    "/system/configs/workspace/ssh-profiles",
    "/system/configs/environment-variables",
  ] as const;
  const gates = new Map<string, ReturnType<typeof createRequestGate>>(
    recoveryPaths.map((path) => [path, createRequestGate()]),
  );
  const requestCounts = new Map<string, number>();
  const manualRecoveryAllowed = new Set<string>();
  const errorMessages = new Map<string, string>(
    recoveryPaths.map((path) => [
      path,
      `Unavailable during Settings recovery: ${path}`,
    ]),
  );
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        const gate = gates.get(context.path);
        if (context.method === "GET" && gate !== undefined) {
          const requestCount = (requestCounts.get(context.path) ?? 0) + 1;
          requestCounts.set(context.path, requestCount);
          if (requestCount === 1) {
            gate.markStarted();
            await gate.release;
          }
          if (!manualRecoveryAllowed.has(context.path)) {
            await context.fulfillJson(
              { detail: errorMessages.get(context.path) },
              500,
            );
            return true;
          }
        }
        return handleSettingsParityApi(context, state);
      },
      sessionTitle: "TS Settings complete recovery",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const settings = await openSettingsDialog(page);
    const navigation = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    const cases: Array<{
      name: string;
      path: (typeof recoveryPaths)[number];
      recovered: () => Promise<void>;
      slug: string;
    }> = [
      {
        name: "Model",
        path: "/system/configs/model/profiles",
        recovered: async () => {
          await expect(settings.getByText("gpt-5-mini")).toBeVisible();
        },
        slug: "model",
      },
      {
        name: "Roles",
        path: "/roles/configs",
        recovered: async () => {
          await expect(
            settings.locator(".at-settings-list-button").filter({ hasText: "Main Agent" }),
          ).toBeVisible();
        },
        slug: "roles",
      },
      {
        name: "Orchestration",
        path: "/system/configs/orchestration",
        recovered: async () => {
          await expect(
            settings.getByRole("button", { name: /Default 1 roles/ }),
          ).toBeVisible();
        },
        slug: "orchestration",
      },
      {
        name: "Web",
        path: "/system/configs/web",
        recovered: async () => {
          await expect(settings.getByLabel("Exa API key")).toBeVisible();
        },
        slug: "web",
      },
      {
        name: "Proxy",
        path: "/system/configs/proxy",
        recovered: async () => {
          await expect(settings.getByLabel("HTTP proxy")).toBeVisible();
        },
        slug: "proxy",
      },
      {
        name: "Remote workspace",
        path: "/system/configs/workspace/ssh-profiles",
        recovered: async () => {
          await expect(
            settings.getByRole("button", { name: /devbox dev\.example\.com/ }),
          ).toBeVisible();
        },
        slug: "remote-workspace",
      },
      {
        name: "Environment variables",
        path: "/system/configs/environment-variables",
        recovered: async () => {
          await expect(settings.getByText("V2_PARITY_ENV")).toBeVisible();
        },
        slug: "environment",
      },
    ];

    for (const recoveryCase of cases) {
      await navigation.getByRole("button", { name: recoveryCase.name }).click();
      await gates.get(recoveryCase.path)?.started;
      if (recoveryCase.name !== "Orchestration") {
        await expect(settings.locator(".at-settings-section .ant-skeleton"))
          .toBeVisible();
      }
      gates.get(recoveryCase.path)?.releaseRequest();
      const errorMessage = errorMessages.get(recoveryCase.path) ?? "Unavailable";
      await expect(settings.getByText(errorMessage)).toBeVisible();
      await expect(settings.locator(".at-settings-section .ant-skeleton"))
        .toHaveCount(0);
      await page.screenshot({
        animations: "disabled",
        path: screenshotPath(
          `v2-settings-${recoveryCase.slug}-load-error.png`,
          SCREENSHOT_FOLDER,
        ),
      });
      manualRecoveryAllowed.add(recoveryCase.path);
      await settings.getByRole("button", { name: "Retry" }).click();
      await recoveryCase.recovered();
      await expect(settings.getByText(errorMessage)).toHaveCount(0);
      expect(requestCounts.get(recoveryCase.path)).toBeGreaterThanOrEqual(2);
    }

    await expectNoDocumentScroll(
      page,
      "remaining Settings loading and recovery should stay framed",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      animations: "disabled",
      path: screenshotPath(
        "v2-settings-all-remaining-pages-recovered.png",
        SCREENSHOT_FOLDER,
      ),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps General related settings as routed pages instead of flattened controls", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await installShellState(page);
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings general related routes",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await sections.getByRole("button", { name: "General" }).click();
    await expect(settings.getByRole("heading", { name: "General" }))
      .toBeVisible();
    await expect(settings.getByText("Shell policy")).toBeVisible();
    await expect(settings.getByRole("switch", { name: "Shell safety policy" }))
      .toBeVisible();

    const related = settings.getByRole("region", { name: "Related settings" });
    await expect(related.getByRole("button", {
      name: /Show diagnostic information/,
    })).toBeVisible();
    await expect(related.getByRole("button", { name: /Speech/ })).toBeVisible();
    await expect(related.getByRole("button", { name: /Notifications/ }))
      .toBeVisible();
    await expect(settings.locator(".at-notification-rule")).toHaveCount(0);
    await expect(settings.getByText("Tool approval requested")).toHaveCount(0);

    await related.getByRole("button", { name: /Speech/ }).click();
    await expect(settings.getByRole("heading", { name: "Speech" })).toBeVisible();

    await sections.getByRole("button", { name: "General" }).click();
    await settings
      .getByRole("region", { name: "Related settings" })
      .getByRole("button", { name: /Notifications/ })
      .click();
    await expect(settings.getByRole("heading", { name: "Notifications" }))
      .toBeVisible();
    await expect(settings.locator(".at-notification-rule")).toHaveCount(4);

    await sections.getByRole("button", { name: "General" }).click();
    await settings
      .getByRole("region", { name: "Related settings" })
      .getByRole("button", { name: /Show diagnostic information/ })
      .click();
    await expect(settings.getByRole("heading", { name: "Appearance" }))
      .toBeVisible();

    await expectNoDocumentScroll(page, "v2 general related routes should stay framed");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await page.screenshot({
      path: screenshotPath("v2-general-related-routes.png", SCREENSHOT_FOLDER),
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
    await installMockEventSource(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings actions parity",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
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
    const failedSwitch = failedRow.getByRole("switch", { name: "Enabled" });
    await failedSwitch.click();
    await expect(failedSwitch).not.toBeChecked();
    await settings.getByRole("button", { name: "Reset" }).click();
    await expect(failedSwitch).toBeChecked();
    expect(state.notificationSavePayloads).toHaveLength(0);

    await failedSwitch.click();
    state.failNextNotificationSave = true;
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/notifications") &&
          response.status() === 500,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    await expect(page.getByText("Notification save failed for parity."))
      .toBeVisible();
    await expect(failedSwitch).not.toBeChecked();
    expect(state.notificationSavePayloads).toHaveLength(1);
    expect(state.notificationConfig.run_failed?.enabled).toBe(true);
    await page.screenshot({
      path: screenshotPath("v2-settings-notifications-reset-error.png", SCREENSHOT_FOLDER),
    });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/system/configs/notifications") &&
          response.status() === 200,
      ),
      settings.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(state.notificationSavePayloads).toHaveLength(2);
    expect(state.notificationSavePayloads[1]).toMatchObject({
      config: {
        run_failed: {
          enabled: false,
        },
      },
    });
    await expect(page.getByText("Notification settings saved.")).toBeVisible();
    await page.getByText("Notification save failed for parity.").waitFor({
      state: "hidden",
      timeout: 6000,
    });
    await page.getByText("Notification settings saved.").waitFor({
      state: "hidden",
      timeout: 6000,
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
      preserve_password: true,
      proxy_password: null,
      ssl_verify: null,
    });
    expect(state.proxyReloadCount).toBe(1);
    await expect(page.getByText("Proxy settings saved and reloaded."))
      .toBeVisible();
    await page.getByText("Proxy settings saved and reloaded.").waitFor({
      state: "hidden",
      timeout: 6000,
    });
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

function expectSettingsSurfaceContracts(
  v1Surfaces: SettingsSurfaceSnapshot[],
  v2Surfaces: SettingsSurfaceSnapshot[],
): void {
  for (const contract of SETTINGS_SURFACE_CONTRACTS) {
    const v1 = v1Surfaces.find((surface) => surface.id === contract.id);
    const v2 = v2Surfaces.find((surface) => surface.id === contract.v2Id);
    expect(v1, `Missing V1 surface ${contract.id}`).toBeDefined();
    expect(v2, `Missing V2 surface ${contract.v2Id}`).toBeDefined();
    for (const token of contract.v1Text) {
      expect(v1?.text, `V1 ${contract.id} is missing text ${token}`).toContain(token);
    }
    for (const control of contract.v1Controls ?? []) {
      expect(
        v1?.controls.some((candidate) => candidate.includes(control)),
        `V1 ${contract.id} is missing control ${control}`,
      ).toBe(true);
    }
    for (const token of contract.v2Text) {
      expect(v2?.text, `V2 ${contract.v2Id} is missing text ${token}`).toContain(token);
    }
    for (const control of contract.v2Controls) {
      expect(
        v2?.controls.some((candidate) => candidate.includes(control)),
        `V2 ${contract.v2Id} is missing control ${control}`,
      ).toBe(true);
    }
  }
}

function expectV1DetailSurfaceContracts(
  detailSurfaces: SettingsSurfaceSnapshot[],
): void {
  expect(detailSurfaces).toHaveLength(V1_DETAIL_SURFACE_CONTRACTS.length);
  for (const contract of V1_DETAIL_SURFACE_CONTRACTS) {
    const surface = detailSurfaces.find((candidate) => candidate.id === contract.id);
    expect(surface, `Missing V1 detail surface ${contract.id}`).toBeDefined();
    for (const token of contract.text) {
      expect(
        surface?.text,
        `V1 detail ${contract.id} is missing text ${token}`,
      ).toContain(token);
    }
    for (const control of contract.controls) {
      expect(
        surface?.controls.some((candidate) => candidate.includes(control)),
        `V1 detail ${contract.id} is missing control ${control}`,
      ).toBe(true);
    }
  }
}

function expectV2DetailSurfaceContracts(
  detailSurfaces: SettingsSurfaceSnapshot[],
): void {
  expect(detailSurfaces).toHaveLength(V2_DETAIL_SURFACE_CONTRACTS.length);
  for (const contract of V2_DETAIL_SURFACE_CONTRACTS) {
    const surface = detailSurfaces.find((candidate) => candidate.id === contract.id);
    expect(surface, `Missing V2 detail surface ${contract.id}`).toBeDefined();
    for (const control of contract.controls) {
      expect(
        surface?.controls.some((candidate) => candidate.includes(control)),
        `V2 detail ${contract.id} is missing control ${control}`,
      ).toBe(true);
    }
  }
}

async function captureV2DetailSurface(
  page: Page,
  settings: Locator,
  tabKey: string,
): Promise<SettingsSurfaceSnapshot | null> {
  const contract = V2_DETAIL_SURFACE_CONTRACTS.find(
    (candidate) => candidate.tabKey === tabKey,
  );
  if (contract === undefined) {
    return null;
  }

  const row = settings.locator(".at-settings-list-row").filter({
    hasText: contract.rowText,
  });
  await expect(row).toHaveCount(1);
  if (contract.useEditAction === true) {
    if (contract.tabKey === "workspace") {
      await row.click();
      const detail = settings.locator(".at-settings-workspace-detail");
      await expect(detail).toBeVisible();
      await detail.getByRole("button", { name: "Edit", exact: true }).click();
    } else {
      await row.getByRole("button", { name: "Edit", exact: true }).click();
    }
  } else if (
    contract.rowIsButton === true
    || await row.evaluate((element) => element instanceof HTMLButtonElement)
  ) {
    await row.click();
  } else {
    const detailButton = row.locator(
      ".at-settings-list-button, .at-model-profile-row-main",
    );
    await expect(detailButton).toHaveCount(1);
    await detailButton.click();
  }

  const surface = contract.dialogName === undefined
    ? settings.locator(".at-settings-section-body")
    : page.getByRole("dialog", { name: contract.dialogName });
  await expect(surface).toBeVisible();
  for (const control of contract.controls) {
    await expect(surface.getByLabel(control, { exact: true })).toBeVisible();
  }
  if (contract.dialogName !== undefined) {
    await page.waitForTimeout(300);
  }
  const snapshot = {
    id: contract.id,
    label: `${tabKey} detail`,
    ...await settingsSurfaceSnapshot(surface),
  };
  await page.screenshot({
    path: screenshotPath(
      `v2-settings-${tabKey}-detail-complete-pairing.png`,
      SCREENSHOT_FOLDER,
    ),
  });
  await surface.getByRole("button", {
    name: contract.closeAction,
    exact: true,
  }).click();
  if (contract.dialogName !== undefined) {
    await expect(surface).toBeHidden();
  }
  return snapshot;
}

async function settingsSurfaceSnapshot(
  surface: Locator,
): Promise<Omit<SettingsSurfaceSnapshot, "id" | "label">> {
  await expect(surface).toBeVisible();
  return surface.evaluate((element) => {
    function normalize(value: string | null | undefined): string {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }
    const controls = Array.from(
      element.querySelectorAll("button, input, select, textarea, [role='switch']"),
    )
      .filter((control) => {
        const style = window.getComputedStyle(control);
        return control.getClientRects().length > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      })
      .map((control) => {
        const id = control.getAttribute("id") ?? "";
        const label = id
          ? element.querySelector(`label[for="${CSS.escape(id)}"]`)
          : null;
        return normalize(
          control.getAttribute("aria-label")
          ?? label?.textContent
          ?? control.getAttribute("placeholder")
          ?? control.textContent,
        );
      })
      .filter(Boolean);
    return {
      controlCount: controls.length,
      controls,
      text: normalize((element as HTMLElement).innerText).slice(0, 1200),
    };
  });
}

async function expectV1CoreControl(settings: Locator, tabKey: string): Promise<void> {
  const selectorByTab: Record<string, string> = {
    agents: "#add-agent-btn",
    appearance: "#appearance-ui-font",
    commands: "#add-command-btn",
    environment: "#add-env-btn",
    general: "#settings-shell-safety-policy-toggle",
    hooks: "#add-hook-btn",
    mcp: "#add-mcp-server-btn",
    model: "#add-profile-btn",
    orchestration: "#add-orchestration-preset-btn",
    plugins: "#plugins-panel",
    proxy: "#proxy-http-proxy",
    roles: "#add-role-btn",
    web: "#web-provider",
    workspace: "#add-ssh-profile-btn",
  };
  const selector = selectorByTab[tabKey];
  expect(selector).toBeDefined();
  await expect(settings.locator(selector ?? "[data-missing-v1-control]"))
    .toBeVisible();
}

async function expectV2CoreControl(settings: Locator, v1TabKey: string): Promise<void> {
  const buttonNameByTab: Record<string, string> = {
    agents: "New runtime",
    commands: "Add Command",
    environment: "New variable",
    hooks: "Add hook",
    mcp: "Add Server",
    model: "New profile",
    orchestration: "New orchestration",
    plugins: "Refresh",
    roles: "New role",
    workspace: "New SSH profile",
  };
  const buttonName = buttonNameByTab[v1TabKey];
  if (buttonName !== undefined) {
    await expect(settings.getByRole("button", { name: buttonName, exact: true }))
      .toBeVisible();
    return;
  }
  if (v1TabKey === "web") {
    await expect(settings.getByLabel("Exa API key", { exact: true })).toBeVisible();
    return;
  }
  const labelByTab: Record<string, string> = {
    appearance: "UI font",
    general: "Shell safety policy",
    proxy: "HTTP Proxy",
  };
  const label = labelByTab[v1TabKey];
  expect(label).toBeDefined();
  await expect(settings.getByLabel(label ?? "missing V2 control", { exact: true }))
    .toBeVisible();
}

async function sectionLabels(sections: Locator): Promise<string[]> {
  return sections.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.textContent?.trim() ?? ""),
  );
}

async function extractV1NotificationRows(page: Page): Promise<NotificationRowSnapshot[]> {
  return page.locator("#general-panel .notification-row").evaluateAll((rows) =>
    rows.map((row) => {
      function normalize(text: string | null | undefined): string {
        return (text ?? "").replace(/\s+/g, " ").trim();
      }
      function text(selector: string): string {
        return normalize(row.querySelector(selector)?.textContent);
      }
      function inputState(selector: string): { checked: boolean; disabled: boolean } {
        const input = row.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) {
          return { checked: false, disabled: false };
        }
        return { checked: input.checked, disabled: input.disabled };
      }
      const enabled = inputState('input[id$="-enabled"]');
      const browser = inputState('input[id$="-browser"]');
      const toast = inputState('input[id$="-toast"]');
      return {
        browserChecked: browser.checked,
        browserDisabled: browser.disabled,
        description: text(".notification-row-desc"),
        enabled: enabled.checked,
        hasHiddenChannels: row.getAttribute("data-has-hidden-channels") === "true",
        hiddenText: [],
        title: text(".notification-row-title"),
        toastChecked: toast.checked,
        toastDisabled: toast.disabled,
        type: row.getAttribute("data-notif-type") ?? "",
      };
    }),
  );
}

async function extractV2NotificationRows(
  settings: Locator,
): Promise<NotificationRowSnapshot[]> {
  return settings.locator(".at-notification-row").evaluateAll((rows) =>
    rows.map((row) => {
      function normalize(text: string | null | undefined): string {
        return (text ?? "").replace(/\s+/g, " ").trim();
      }
      function typeFromTitle(title: string): string {
        if (title === "Tool approval requested") {
          return "tool_approval_requested";
        }
        if (title === "Run completed") {
          return "run_completed";
        }
        if (title === "Run failed") {
          return "run_failed";
        }
        if (title === "Run stopped") {
          return "run_stopped";
        }
        return "";
      }
      const labels = Array.from(row.querySelectorAll(".ant-checkbox-wrapper")).map(
        (label) => {
          const input = label.querySelector("input");
          return {
            checked: input instanceof HTMLInputElement ? input.checked : false,
            disabled: input instanceof HTMLInputElement ? input.disabled : false,
            label: normalize(label.textContent),
          };
        },
      );
      const browser = labels.find((label) => label.label === "Browser");
      const toast = labels.find((label) => label.label === "Toast");
      const copyLines = Array.from(
        row.querySelectorAll(".at-notification-copy > span"),
      )
        .map((item) => normalize(item.textContent))
        .filter(Boolean);
      const switchElement = row.querySelector('[role="switch"]');
      const type = typeFromTitle(copyLines[0] ?? "");
      const hiddenText = copyLines.slice(2);
      return {
        browserChecked: browser?.checked ?? false,
        browserDisabled: browser?.disabled ?? false,
        description: copyLines[1] ?? "",
        enabled: switchElement?.getAttribute("aria-checked") === "true",
        hasHiddenChannels: hiddenText.length > 0,
        hiddenText,
        title: copyLines[0] ?? "",
        toastChecked: toast?.checked ?? false,
        toastDisabled: toast?.disabled ?? false,
        type,
      };
    }),
  );
}

function settingsParityState(): SettingsParityState {
  return {
    failNextNotificationSave: false,
    notificationConfig: notificationConfig(),
    notificationSavePayloads: [],
    proxyConfig: proxyConfig(),
    proxyProbePayloads: [],
    proxyReloadCount: 0,
    proxySavePayloads: [],
    requestedPaths: [],
  };
}

function createRequestGate() {
  let markStarted: () => void = () => undefined;
  let releaseRequest: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  return { markStarted, release, releaseRequest, started };
}

async function handleSettingsParityApi(
  context: MockApiRouteContext,
  state: SettingsParityState,
): Promise<boolean> {
  state.requestedPaths.push(context.path);
  const method = context.method;
  const path = context.path;
  if (method === "GET" && path === "/connectors") {
    await context.fulfillJson({
      items: [
        {
          account_count: 0,
          auth_type: "api_token",
          capabilities: ["repositories", "pull_requests"],
          category: "development",
          connector_id: "github",
          description: "Connect repositories and pull requests.",
          display_name: "GitHub",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "github",
          status: "needs_config",
        },
      ],
      summary: {
        connected: 0,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 1,
      },
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/github") {
    await context.fulfillJson({
      token_configured: false,
      webhook_base_url: "https://hooks.example",
    });
    return true;
  }
  if (method === "GET" && path === "/system/configs/github/webhook/tunnel") {
    await context.fulfillJson({
      provider: null,
      public_url: null,
      status: "inactive",
    });
    return true;
  }
  if (
    method === "GET"
    && (path === "/system/configs/model-fallback" || path === "/connectors/w3")
  ) {
    await context.fulfillJson({});
    return true;
  }
  if (method === "GET" && path === "/mcp/servers") {
    await context.fulfillJson([]);
    return true;
  }
  if (method === "GET" && path === "/system/commands:catalog") {
    await context.fulfillJson({ app_commands: [], workspaces: [] });
    return true;
  }
  if (
    method === "GET"
    && (path === "/system/configs/plugins"
      || path === "/system/configs/plugins/runtime")
  ) {
    await context.fulfillJson({ diagnostics: [], plugins: [] });
    return true;
  }
  if (method === "GET" && path === "/system/configs/hooks") {
    await context.fulfillJson({ hooks: {} });
    return true;
  }
  if (method === "GET" && path === "/system/configs/hooks/runtime") {
    await context.fulfillJson({ loaded_hooks: [], sources: [] });
    return true;
  }
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
  if (method === "GET" && path === "/roles/configs/main") {
    await context.fulfillJson(roleConfigDocument());
    return true;
  }
  if (method === "GET" && path === "/system/configs/model/profiles") {
    await context.fulfillJson(modelProfiles());
    return true;
  }
  if (method === "GET" && path === "/system/configs/speech") {
    await context.fulfillJson(speechConfig());
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
  if (
    method === "GET"
    && path === "/system/configs/agent-runtimes/codex-acp"
  ) {
    await context.fulfillJson(agentRuntimeDocument());
    return true;
  }
  if (method === "GET" && path === "/system/configs/web") {
    await context.fulfillJson(webConfig());
    return true;
  }
  if (method === "GET" && path === "/system/configs/clawhub") {
    await context.fulfillJson({ token_configured: true });
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
    const hasPassword = payload.preserve_password === true
      ? state.proxyConfig.has_password === true
      : typeof payload.proxy_password === "string"
        && payload.proxy_password.trim() !== "";
    const {
      preserve_password: _preservePassword,
      proxy_password: _proxyPassword,
      ...publicConfig
    } = payload;
    state.proxyConfig = { ...publicConfig, has_password: hasPassword };
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
    if (state.failNextNotificationSave) {
      state.failNextNotificationSave = false;
      await context.fulfillJson({ detail: "Notification save failed for parity." }, 500);
      return true;
    }
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

function roleConfigDocument(): Record<string, unknown> {
  return {
    bound_agent_id: null,
    deletable: false,
    description: "Default role",
    execution_surface: "workspace",
    file_name: "main.md",
    mcp_servers: ["filesystem"],
    memory_profile: { enabled: true },
    mode: "primary",
    model_profile: "default",
    name: "Main Agent",
    role_id: "main",
    skills: ["builtin:time"],
    source: "app",
    system_prompt: "Handle the user request.",
    tools: ["read", "shell"],
    version: "1.0.0",
  };
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

function speechConfig(): Record<string, unknown> {
  return {
    language: "en-US",
    prompt: "Use concise speech transcription.",
    stt_profile_name: "default",
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

function agentRuntimeDocument(): Record<string, unknown> {
  return {
    agent_id: "codex-acp",
    description: "Default coding runtime.",
    name: "Codex ACP",
    native_config_enabled: false,
    native_config_provider: "",
    protocol: "acp",
    skill_bridge_enabled: false,
    skill_bridge_mode: "inline",
    skill_bridge_skills: [],
    transport: {
      args: ["--model", "gpt-5-mini"],
      command: "codex",
      env: [],
      transport: "stdio",
    },
  };
}

function webConfig(): Record<string, unknown> {
  return {
    exa_api_key_configured: true,
    fallback_provider: "searxng",
    fallback_provider_options: [
      {
        display_name: "SearXNG",
        provider: "searxng",
        uses_instance_url: true,
      },
      {
        display_name: "Disabled",
        provider: "disabled",
        uses_instance_url: false,
      },
    ],
    provider: "exa",
    provider_options: [
      {
        display_name: "Exa",
        provider: "exa",
        website_url: "https://exa.ai",
      },
    ],
    searxng_instance_seeds: ["https://searx.space"],
    searxng_instance_url: "https://search.example/",
  };
}

function environmentVariables(): Record<string, Record<string, unknown>[]> {
  return {
    app: [
      {
        key: "V2_PARITY_ENV",
        masked: false,
        scope: "app",
        value: "enabled",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "PATH",
        masked: false,
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
    has_password: true,
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
