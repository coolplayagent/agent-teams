import { writeFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV1Shell,
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
  failNextNotificationSave: boolean;
  notificationConfig: Record<string, Record<string, unknown>>;
  notificationSavePayloads: Record<string, unknown>[];
  proxyConfig: Record<string, unknown>;
  proxyProbePayloads: Record<string, unknown>[];
  proxyReloadCount: number;
  proxySavePayloads: Record<string, unknown>[];
  requestedPaths: string[];
}

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
    await expect(settings.getByText("Enabled")).toBeVisible();
    await expect(settings.getByText("Frontend parity verification.")).not.toBeVisible();
    await expect
      .poll(async () => systemPageLabels(settings))
      .toEqual([...SECONDARY_SYSTEM_PAGES]);
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
      path: screenshotPath("v2-settings-system-landing.png", SCREENSHOT_FOLDER),
    });
    await page.screenshot({
      path: screenshotPath("v2-settings-v1-section-survey.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("shows System status loading and error states without flattening secondary pages", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  let systemStatusRequests = 0;
  let resolveStatusRequest: () => void = () => undefined;
  let resolveStatusResponse: () => void = () => undefined;
  const statusRequestStarted = new Promise<void>((resolve) => {
    resolveStatusRequest = resolve;
  });
  const statusResponseReleased = new Promise<void>((resolve) => {
    resolveStatusResponse = resolve;
  });
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: async (context) => {
        if (context.method === "GET" && context.path === "/system/configs") {
          systemStatusRequests += 1;
          if (systemStatusRequests === 1) {
            resolveStatusRequest();
            await statusResponseReleased;
          }
          await context.fulfillJson(
            { detail: "System status unavailable for parity." },
            500,
          );
          return true;
        }
        return handleSettingsParityApi(context, state);
      },
      sessionTitle: "TS system status states",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });

    await sections.getByRole("button", { name: "System" }).click();
    await statusRequestStarted;
    await expect(settings.getByRole("heading", { name: "System" })).toBeVisible();
    await expect(settings.locator(".at-settings-section .ant-skeleton"))
      .toBeVisible();
    await expect
      .poll(async () => systemPageLabels(settings))
      .toEqual([...SECONDARY_SYSTEM_PAGES]);
    await page.screenshot({
      path: screenshotPath("v2-settings-system-status-loading.png", SCREENSHOT_FOLDER),
    });

    resolveStatusResponse();
    await expect(settings.getByText("System status unavailable for parity."))
      .toBeVisible();
    await expect(settings.locator(".at-settings-section .ant-skeleton"))
      .toHaveCount(0);
    await expect
      .poll(async () => systemPageLabels(settings))
      .toEqual([...SECONDARY_SYSTEM_PAGES]);
    for (const secondaryLabel of SECONDARY_SYSTEM_PAGES) {
      await expect(sections.getByRole("button", { name: secondaryLabel }))
        .toHaveCount(0);
    }
    expect(systemStatusRequests).toBeGreaterThanOrEqual(1);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 System status loading and error states should stay framed",
    );
    await page.screenshot({
      path: screenshotPath("v2-settings-system-status-error.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("pairs V1 General notification controls with the V2 Notifications page", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = settingsParityState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS notification V1 V2 pairing",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);
    await page.locator("#settings-btn").click();
    await expect(page.locator("#settings-modal.settings-modal-visible"))
      .toBeVisible();
    await page.locator('.settings-tab[data-tab="general"]').click();
    await expect(page.locator("#general-panel .notification-row"))
      .toHaveCount(4);
    await expect(page.locator("#save-general-btn")).toBeVisible();
    await expect(page.locator("#save-notifications-btn")).toHaveCount(0);
    const v1Rows = await extractV1NotificationRows(page);
    expect(v1Rows).toEqual(EXPECTED_NOTIFICATION_ROWS);
    await page
      .locator('#general-panel .notification-row[data-notif-type="run_failed"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: screenshotPath("v1-general-notifications-pairing.png", SCREENSHOT_FOLDER),
    });

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const settings = await openSettingsDialog(page);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Notifications" })
      .click();
    await expect(settings.getByRole("heading", { name: "Notifications" }))
      .toBeVisible();
    await expect(settings.locator(".at-notification-row")).toHaveCount(4);
    const v2Rows = await extractV2NotificationRows(settings);
    expect(v2Rows).toEqual(
      EXPECTED_NOTIFICATION_ROWS.map((row) =>
        row.type === "run_failed"
          ? { ...row, hiddenText: ["1 hidden channel preserved."] }
          : row,
      ),
    );
    await expect(settings.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(settings.getByRole("button", { name: "Save" })).toBeVisible();
    await settings.getByRole("button", { name: "Save" }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: screenshotPath("v2-notifications-v1-pairing.png", SCREENSHOT_FOLDER),
    });

    await writeFile(
      screenshotPath("notifications-v1-v2-dom.json", SCREENSHOT_FOLDER),
      `${JSON.stringify(
        {
          v1: {
            action: "General Save owns notification persistence",
            rows: v1Rows,
          },
          v2: {
            action: "Notifications page exposes Reset and Save",
            rows: v2Rows,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v1/v2 notification pairing should stay framed");
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
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSettingsParityApi(context, state),
      sessionTitle: "TS settings general related routes",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
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
    await expect(settings.locator(".at-notification-row")).toHaveCount(0);
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
    await expect(settings.locator(".at-notification-row")).toHaveCount(4);

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
      proxy_password: "saved-proxy-password",
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

async function sectionLabels(sections: Locator): Promise<string[]> {
  return sections.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => button.textContent?.trim() ?? ""),
  );
}

async function systemPageLabels(settings: Locator): Promise<string[]> {
  return settings.locator(".at-settings-list-button").evaluateAll((buttons) =>
    buttons.map((button) =>
      button.querySelector(".at-settings-list-main span")?.textContent?.trim() ?? "",
    ),
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
