import { expect, test, type Locator } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-shell";
const LAZY_WORKSPACE_COUNT = 4;
const LAZY_SESSIONS_PER_WORKSPACE = 12;
const LAZY_SELECTED_SESSION_TITLE = "TS lazy session 0-0";
const UNREAD_TERMINAL_SESSION_ID = "session-v2-terminal-unread";

test("keeps V1 primary sidebar entries and opens real module surfaces", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const requestedPaths: string[] = [];
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleParityApi(context, requestedPaths),
      sessionTitle: "TS shell parity",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await expect(page.locator(".at-sidebar-nav")).toBeVisible();
    await expect
      .poll(() => page.locator(".at-sidebar-nav-label").allInnerTexts())
      .toEqual([
        "Chat",
        "Automation",
        "Skills",
        "Board",
        "Search",
        "Connectors",
        "Memory",
        "Observability",
        "Settings",
      ]);

    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNav.getByRole("button", { name: "Chat" }).click();
    await expect(page.locator(".at-chat-view")).toBeVisible();
    await expect(page.locator(".at-composer")).toBeVisible();

    await primaryNav.getByRole("button", { name: "Automation" }).click();
    await expect(page.getByRole("button", { name: "Daily triage" })).toBeVisible();
    await expect(page.getByText("Keep the V2 shell parity ledger current."))
      .toBeVisible();

    await primaryNav.getByRole("button", { name: "Skills" }).click();
    await expect(page.getByTestId("skills-view")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open skill Writer" }))
      .toBeVisible();

    await primaryNav.getByRole("button", { name: "Board" }).click();
    await expect(page.getByTestId("board-todo-todo-v2-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Keep module pages reachable" }))
      .toBeVisible();

    await primaryNav.getByRole("button", { name: "Search" }).click();
    await expect(page.getByTestId("session-search-view")).toBeVisible();

    await primaryNav.getByRole("button", { name: "Connectors" }).click();
    await expect(page.getByTestId("connectors-view")).toBeVisible();
    await expect(page.getByTestId("connector-card-github")).toBeVisible();
    await expect(page.getByTestId("runtime-tool-card-rg")).toBeVisible();

    await primaryNav.getByRole("button", { name: "Memory" }).click();
    await expect(page.getByTestId("memory-view")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-v2-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "V2 shell module parity" }))
      .toBeVisible();

    await primaryNav.getByRole("button", { name: "Observability" }).click();
    await expect(page.getByRole("heading", { name: "Observability" }))
      .toBeVisible();
    await expect(page.getByText("Metrics for the last 24 hours")).toBeVisible();

    await primaryNav.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expectSettingsDialogSettled(settings);
    await expect(settings.getByRole("navigation", { name: "Settings sections" }))
      .toBeVisible();
    await expect(settings.getByRole("button", { name: "Appearance", exact: true }))
      .toBeVisible();

    for (const path of [
      "/system/configs",
      "/system/skills/market/clawhub",
      "/observability/overview",
      "/observability/breakdowns",
      "/automation/projects",
      "/connectors",
      "/connectors/runtime-tools",
      "/boards/todos",
      "/memories",
      `/workspaces/${WORKSPACE_ID}/memories/memory-v2-shell`,
    ]) {
      expect(requestedPaths).toContain(path);
    }
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 sidebar modules should stay framed");
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-sidebar-module-parity.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps V1 settings sections and System secondary-page grouping", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const requestedPaths: string[] = [];
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleParityApi(context, requestedPaths),
      sessionTitle: "TS settings parity",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page.locator(".at-topbar").getByRole("button", { name: "Settings" })
      .click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expectSettingsDialogSettled(settings);
    const sections = settings.getByRole("navigation", {
      name: "Settings sections",
    });
    await expect(sections).toBeVisible();
    await expect.poll(() => sections.getByRole("button").allInnerTexts())
      .toEqual([
        "Appearance",
        "General",
        "Speech",
        "Notifications",
        "Models",
        "Roles",
        "Orchestration",
        "Web",
        "ClawHub",
        "Proxy",
        "Remote workspace",
        "Environment variables",
        "System",
      ]);

    for (const secondaryLabel of [
      "MCP",
      "Plugins",
      "Commands",
      "Hooks",
      "Agent Runtime",
      "GitHub",
      "Triggers",
    ]) {
      await expect(sections.getByRole("button", { name: secondaryLabel }))
        .toHaveCount(0);
    }

    await sections.getByRole("button", { name: "System" }).click();
    await expect(settings.getByRole("heading", { name: "System" }))
      .toBeVisible();
    await expect(settings.getByText("Global and workspace command files."))
      .toBeVisible();
    const systemPages = settings.locator(".at-settings-list-button");
    for (const secondaryLabel of [
      "MCP",
      "Plugins",
      "Commands",
      "Hooks",
      "Agent Runtime",
      "GitHub",
      "Triggers",
    ]) {
      await expect(systemPages.filter({ hasText: secondaryLabel })).toBeVisible();
    }

    await openSystemPage(settings, systemPages, "MCP");
    await expect(settings.getByText("stdio-shell")).toBeVisible();
    await expect(settings.getByText("run_command")).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "Plugins");
    await expect(settings.getByText("workspace-tools")).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "Commands");
    await expect(settings.getByText("Global commands")).toBeVisible();
    await expect(settings.getByText("/opsx:propose")).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "Hooks");
    await expect(
      settings.locator(".at-settings-list-row").filter({
        hasText: "Session startup setup",
      }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "Agent Runtime");
    await expect(settings.getByText("Codex CLI")).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "GitHub");
    await expect(settings.getByText("GitHub CLI", { exact: true })).toBeVisible();
    await expect(settings.getByText("Webhook base URL")).toBeVisible();
    await settings.getByRole("button", { name: "Back", exact: true }).click();

    await openSystemPage(settings, systemPages, "Triggers");
    await expect(settings.getByText("Feishu Main")).toBeVisible();
    await expect(settings.getByText("WeChat Main")).toBeVisible();

    for (const path of [
      "/mcp/servers",
      "/mcp/servers/stdio-shell/tools",
      "/system/configs/plugins/runtime",
      "/system/configs/hooks",
      "/system/configs/hooks/runtime",
      "/system/configs/agent-runtimes",
      "/system/commands:catalog",
      "/system/configs/github",
      "/system/configs/github/webhook/tunnel",
      "/gateway/feishu/accounts",
      "/gateway/wechat/accounts",
    ]) {
      expect(requestedPaths).toContain(path);
    }
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 settings parity should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-settings-system-parity.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("manages sessions and reloads MCP config through V2 shell actions", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = shellManagementState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleShellManagementApi(context, state),
      sessionTitle: "TS shell management",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await page
      .getByRole("button", { name: "New session", exact: true })
      .click();
    await expect
      .poll(() => state.sessionCreatePayloads)
      .toEqual([{ workspace_id: WORKSPACE_ID }]);
    const createdSessionButton = page.getByRole("button", {
      name: "TS managed session",
    });
    await expect(createdSessionButton).toBeVisible();
    const createdSessionItem = page.locator(".at-session-item").filter({
      has: createdSessionButton,
    });
    await expect(createdSessionItem).toHaveClass(/is-selected/);

    await createdSessionItem.hover();
    await createdSessionItem
      .getByRole("button", { name: "Rename session" })
      .click();
    const renameDialog = page.getByRole("dialog", { name: "Rename session" });
    await expect(renameDialog).toBeVisible();
    await renameDialog.getByLabel("Session name").fill("TS renamed session");
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(() => state.sessionRenamePayloads)
      .toEqual([
        {
          payload: { title: "TS renamed session" },
          sessionId: "session-v2-managed",
        },
      ]);
    await expect(renameDialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "TS renamed session" }),
    ).toBeVisible();
    await expect(page.getByText("Session renamed.")).toBeVisible();

    await page
      .locator(".at-topbar")
      .getByRole("button", { name: "Settings" })
      .click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expectSettingsDialogSettled(settings);
    await settings
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "System" })
      .click();
    await openSystemPage(settings, settings.locator(".at-settings-list-button"), "MCP");
    await expect(settings.getByText("stdio-shell")).toBeVisible();
    await settings.getByRole("button", { name: "Reload config" }).click();
    await expect.poll(() => state.mcpReloadCount).toBe(1);
    await expect(page.getByText("MCP config reloaded.")).toBeVisible();
    await settings.getByRole("button", { name: "Close" }).click();
    await expect(settings).toHaveCount(0);

    const renamedSessionButton = page.getByRole("button", {
      name: "TS renamed session",
    });
    const renamedSessionItem = page.locator(".at-session-item").filter({
      has: renamedSessionButton,
    });
    await renamedSessionItem.hover();
    await renamedSessionItem
      .getByRole("button", { name: "Delete session" })
      .click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete session" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect
      .poll(() => state.sessionDeleteRequests)
      .toEqual([
        {
          payload: { cascade: true, force: true },
          sessionId: "session-v2-managed",
        },
      ]);
    await expect(
      page.getByRole("button", { name: "TS renamed session" }),
    ).toHaveCount(0);
    await expect(deleteDialog).toHaveCount(0);
    await expect(page.getByText("Session deleted.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "TS shell management" }),
    ).toBeVisible();

    expect(state.requestedPaths).toContain("/mcp/servers");
    expect(state.requestedPaths).toContain("/mcp/servers/stdio-shell/tools");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "session management and MCP reload should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-shell-session-management-mcp.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("marks unread terminal runs viewed and keeps them viewed after reload", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state: TerminalViewedState = {
    terminalViewRequests: [],
    unread: true,
  };
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleTerminalViewedApi(context, state),
      sessionTitle: "Terminal view control",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const unreadButton = page.getByRole("button", {
      name: "Unread terminal session",
    });
    await expect(unreadButton).toBeVisible();
    const unreadItem = page.locator(".at-session-item").filter({
      has: unreadButton,
    });
    await expect(unreadItem).toHaveClass(/has-run-indicator-unread/);
    await expect(unreadItem.getByTitle("Unread terminal run")).toBeVisible();

    await unreadButton.click();
    await expect.poll(() => state.terminalViewRequests)
      .toEqual([UNREAD_TERMINAL_SESSION_ID]);
    await expect(unreadItem).not.toHaveClass(/has-run-indicator-unread/);
    await expect(unreadItem.getByTitle("Unread terminal run")).toHaveCount(0);

    await page.reload();
    await waitForV2Shell(page);
    const reloadedUnreadButton = page.getByRole("button", {
      name: "Unread terminal session",
    });
    const reloadedUnreadItem = page.locator(".at-session-item").filter({
      has: reloadedUnreadButton,
    });
    await expect(reloadedUnreadItem).toBeVisible();
    await expect(reloadedUnreadItem).not.toHaveClass(/has-run-indicator-unread/);
    await expect(reloadedUnreadItem.getByTitle("Unread terminal run")).toHaveCount(0);
    expect(state.terminalViewRequests).toEqual([UNREAD_TERMINAL_SESSION_ID]);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "terminal viewed reload state should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-terminal-viewed-reload.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("keeps subagent session lists lazy on large initial sidebar load", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const workspaces = lazyLoadWorkspaces();
  const sessions = lazyLoadSessions(workspaces);
  const state: SidebarLazyLoadState = {
    recoveryRequestPaths: [],
    sessionIndexRequestPaths: [],
    subagentRequestPaths: [],
  };
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) =>
        handleSidebarLazyLoadApi(context, state, workspaces, sessions),
      sessionTitle: LAZY_SELECTED_SESSION_TITLE,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const selectedButton = page.getByRole("button", {
      name: LAZY_SELECTED_SESSION_TITLE,
    });
    await expect(selectedButton).toBeVisible();
    const selectedItem = page.locator(".at-session-item").filter({
      has: selectedButton,
    });
    await expect(selectedItem).toHaveClass(/is-selected/);
    await expect(
      selectedItem.getByRole("button", { name: "Toggle subagent sessions" }),
    ).toBeVisible();
    await expect(page.locator(".at-session-subagent-list")).toHaveCount(0);

    await page.waitForTimeout(800);
    const initialSessionIndexRequestCount =
      state.sessionIndexRequestPaths.length;
    const initialRecoveryRequestCount = state.recoveryRequestPaths.length;
    await page.waitForTimeout(3200);

    expect(state.subagentRequestPaths).toEqual([]);
    expect(state.sessionIndexRequestPaths).toHaveLength(
      initialSessionIndexRequestCount,
    );
    expect(state.recoveryRequestPaths).toHaveLength(initialRecoveryRequestCount);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "large lazy sidebar load should stay inside the fixed V2 shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-sidebar-lazy-subagents.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function openSystemPage(
  settings: Locator,
  systemPages: Locator,
  label: string,
): Promise<void> {
  await systemPages.filter({ hasText: label }).click();
  await expect(settings.getByRole("heading", { name: label })).toBeVisible();
}

async function expectSettingsDialogSettled(settings: Locator): Promise<void> {
  await expect
    .poll(() =>
      settings.evaluate((element) =>
        Math.round(element.getBoundingClientRect().left),
      ),
    )
    .toBeLessThanOrEqual(320);
}

async function handleParityApi(
  context: MockApiRouteContext,
  requestedPaths: string[],
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  requestedPaths.push(context.path);
  const response = parityResponse(context.path);
  if (response === undefined) {
    return false;
  }
  await context.fulfillJson(response);
  return true;
}

interface TerminalViewedState {
  terminalViewRequests: string[];
  unread: boolean;
}

interface ShellManagementState {
  deletedSessions: ShellManagementSession[];
  mcpReloadCount: number;
  requestedPaths: string[];
  selectedSessionId: string;
  sessionCreatePayloads: Record<string, unknown>[];
  sessionDeleteRequests: Array<{
    payload: Record<string, unknown>;
    sessionId: string;
  }>;
  sessionRenamePayloads: Array<{
    payload: Record<string, unknown>;
    sessionId: string;
  }>;
  sessions: ShellManagementSession[];
}

interface ShellManagementSession {
  created_at: string;
  message_count: number;
  session_id: string;
  title: string;
  updated_at: string;
  workspace_id: string;
}

interface SidebarLazyLoadState {
  recoveryRequestPaths: string[];
  sessionIndexRequestPaths: string[];
  subagentRequestPaths: string[];
}

interface LazyLoadWorkspace {
  display_name: string;
  last_session_id: string;
  path: string;
  updated_at: string;
  workspace_id: string;
}

interface LazyLoadSession {
  active_run_status: null;
  created_at: string;
  message_count: number;
  session_id: string;
  subagent_count: number;
  title: string;
  updated_at: string;
  workspace_id: string;
}

async function handleSidebarLazyLoadApi(
  context: MockApiRouteContext,
  state: SidebarLazyLoadState,
  workspaces: LazyLoadWorkspace[],
  sessions: LazyLoadSession[],
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/workspaces") {
    await context.fulfillJson(workspaces);
    return true;
  }
  if (context.path === "/sessions/sidebar") {
    state.sessionIndexRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson(sessions);
    return true;
  }

  const workspaceSessionsMatch = context.path.match(
    /^\/workspaces\/([^/]+)\/sessions\/sidebar$/,
  );
  if (workspaceSessionsMatch !== null) {
    const workspaceId = workspaceSessionsMatch[1] ?? "";
    state.sessionIndexRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson({
      has_more: false,
      items: sessions.filter((session) => session.workspace_id === workspaceId),
      next_cursor: null,
    });
    return true;
  }

  const sessionMatch = context.path.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionMatch === null) {
    return false;
  }
  const sessionId = sessionMatch[1] ?? "";
  const leaf = sessionMatch[2];
  const session = sessions.find((item) => item.session_id === sessionId);
  if (session === undefined) {
    return false;
  }
  if (leaf === undefined) {
    await context.fulfillJson(lazyLoadSessionDetail(session));
    return true;
  }
  if (leaf === "messages") {
    await context.fulfillJson([]);
    return true;
  }
  if (leaf === "rounds") {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (leaf === "recovery") {
    state.recoveryRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson(emptyRecoverySnapshot());
    return true;
  }
  if (leaf === "token-usage") {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  if (leaf === "subagents") {
    state.subagentRequestPaths.push(`${context.path}${context.url.search}`);
    await context.fulfillJson([]);
    return true;
  }
  if (leaf === "agents" || leaf === "tasks") {
    await context.fulfillJson([]);
    return true;
  }
  return false;
}

function lazyLoadWorkspaces(): LazyLoadWorkspace[] {
  return Array.from({ length: LAZY_WORKSPACE_COUNT }, (_, workspaceIndex) => ({
    display_name: workspaceIndex === 0 ? "agent-teams" : `lazy-${workspaceIndex}`,
    last_session_id: lazySessionId(workspaceIndex, 0),
    path:
      workspaceIndex === 0
        ? "C:/Users/yex/Documents/workspace/agent-teams"
        : `C:/Users/yex/Documents/workspace/lazy-${workspaceIndex}`,
    updated_at: "2026-06-25T08:00:00Z",
    workspace_id:
      workspaceIndex === 0 ? WORKSPACE_ID : `workspace-v2-lazy-${workspaceIndex}`,
  }));
}

function lazyLoadSessions(workspaces: LazyLoadWorkspace[]): LazyLoadSession[] {
  const sessions: LazyLoadSession[] = [];
  for (const [workspaceIndex, workspace] of workspaces.entries()) {
    for (
      let sessionIndex = 0;
      sessionIndex < LAZY_SESSIONS_PER_WORKSPACE;
      sessionIndex += 1
    ) {
      sessions.push({
        active_run_status: null,
        created_at: "2026-06-25T08:00:00Z",
        message_count: sessionIndex + 1,
        session_id: lazySessionId(workspaceIndex, sessionIndex),
        subagent_count: 2,
        title: `TS lazy session ${workspaceIndex}-${sessionIndex}`,
        updated_at: `2026-06-25T08:${String(sessionIndex).padStart(2, "0")}:00Z`,
        workspace_id: workspace.workspace_id,
      });
    }
  }
  return sessions;
}

function lazySessionId(workspaceIndex: number, sessionIndex: number): string {
  if (workspaceIndex === 0 && sessionIndex === 0) {
    return SESSION_ID;
  }
  return `session-v2-lazy-${workspaceIndex}-${sessionIndex}`;
}

function lazyLoadSessionDetail(session: LazyLoadSession): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: session.created_at,
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: session.session_id,
    session_mode: "normal",
    title: session.title,
    updated_at: session.updated_at,
    workspace_id: session.workspace_id,
  };
}

function emptyRecoverySnapshot(): Record<string, unknown> {
  return {
    active_run: null,
    background_tasks: [],
    paused_subagents: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    recoverable_stopped_run: null,
  };
}

async function handleTerminalViewedApi(
  context: MockApiRouteContext,
  state: TerminalViewedState,
): Promise<boolean> {
  if (context.method === "POST") {
    if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}/terminal-view`) {
      state.terminalViewRequests.push(UNREAD_TERMINAL_SESSION_ID);
      state.unread = false;
      await context.fulfillJson({ status: "ok" });
      return true;
    }
    return false;
  }
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson(terminalViewedSidebarRecords(state.unread));
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: terminalViewedSidebarRecords(state.unread),
      next_cursor: null,
    });
    return true;
  }
  if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}`) {
    await context.fulfillJson(
      terminalViewedSessionRecord(
        UNREAD_TERMINAL_SESSION_ID,
        "Unread terminal session",
      ),
    );
    return true;
  }
  if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}/messages`) {
    await context.fulfillJson([]);
    return true;
  }
  if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}/rounds`) {
    await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
    return true;
  }
  if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}/recovery`) {
    await context.fulfillJson({
      active_run: null,
      background_tasks: [],
      paused_subagents: [],
      pending_tool_approvals: [],
      pending_user_questions: [],
      recoverable_stopped_run: null,
    });
    return true;
  }
  if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}/token-usage`) {
    await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
    return true;
  }
  for (const suffix of ["/subagents", "/agents", "/tasks"]) {
    if (context.path === `/sessions/${UNREAD_TERMINAL_SESSION_ID}${suffix}`) {
      await context.fulfillJson([]);
      return true;
    }
  }
  return false;
}

function shellManagementState(): ShellManagementState {
  return {
    deletedSessions: [],
    mcpReloadCount: 0,
    requestedPaths: [],
    selectedSessionId: SESSION_ID,
    sessionCreatePayloads: [],
    sessionDeleteRequests: [],
    sessionRenamePayloads: [],
    sessions: [
      {
        created_at: "2026-06-25T08:00:00Z",
        message_count: 2,
        session_id: SESSION_ID,
        title: "TS shell management",
        updated_at: "2026-06-25T08:30:00Z",
        workspace_id: WORKSPACE_ID,
      },
    ],
  };
}

async function handleShellManagementApi(
  context: MockApiRouteContext,
  state: ShellManagementState,
): Promise<boolean> {
  state.requestedPaths.push(context.path);
  if (context.method === "POST") {
    if (context.path === "/sessions") {
      const payload = readRecordPayload(context.route.request().postData());
      state.sessionCreatePayloads.push(payload);
      const session: ShellManagementSession = {
        created_at: "2026-06-25T08:35:00Z",
        message_count: 0,
        session_id: "session-v2-managed",
        title: "TS managed session",
        updated_at: "2026-06-25T08:35:00Z",
        workspace_id: WORKSPACE_ID,
      };
      state.selectedSessionId = session.session_id;
      state.sessions = [
        session,
        ...state.sessions.filter((item) => item.session_id !== session.session_id),
      ];
      await context.fulfillJson(shellManagementSessionDetail(session));
      return true;
    }
    if (context.path === "/system/configs/mcp:reload") {
      state.mcpReloadCount += 1;
      await context.fulfillJson({ status: "ok" });
      return true;
    }
    return false;
  }
  if (context.method === "PATCH") {
    const sessionId = sessionIdFromPath(context.path);
    if (sessionId === null) {
      return false;
    }
    const payload = readRecordPayload(context.route.request().postData());
    state.sessionRenamePayloads.push({ payload, sessionId });
    const title = typeof payload.title === "string" ? payload.title : null;
    state.sessions = state.sessions.map((session) =>
      session.session_id === sessionId && title !== null
        ? { ...session, title, updated_at: "2026-06-25T08:36:00Z" }
        : session,
    );
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (context.method === "DELETE") {
    const sessionId = sessionIdFromPath(context.path);
    if (sessionId === null) {
      return false;
    }
    const payload = readRecordPayload(context.route.request().postData());
    state.sessionDeleteRequests.push({ payload, sessionId });
    const deletedSession = state.sessions.find(
      (session) => session.session_id === sessionId,
    );
    if (deletedSession !== undefined) {
      state.deletedSessions = [deletedSession, ...state.deletedSessions];
    }
    state.sessions = state.sessions.filter((session) => session.session_id !== sessionId);
    if (state.selectedSessionId === sessionId) {
      state.selectedSessionId = state.sessions[0]?.session_id ?? "";
    }
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/sessions/sidebar") {
    await context.fulfillJson(state.sessions);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`) {
    await context.fulfillJson({
      has_more: false,
      items: state.sessions,
      next_cursor: null,
    });
    return true;
  }
  const sessionMatch = context.path.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionMatch !== null) {
    const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
    const leaf = sessionMatch[2];
    const session =
      state.sessions.find((item) => item.session_id === sessionId)
      ?? state.deletedSessions.find((item) => item.session_id === sessionId);
    if (session === undefined) {
      return false;
    }
    if (leaf === undefined) {
      await context.fulfillJson(shellManagementSessionDetail(session));
      return true;
    }
    if (leaf === "messages" || leaf === "subagents" || leaf === "agents" || leaf === "tasks") {
      await context.fulfillJson([]);
      return true;
    }
    if (leaf === "rounds") {
      await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
      return true;
    }
    if (leaf === "recovery") {
      await context.fulfillJson(emptyRecoverySnapshot());
      return true;
    }
    if (leaf === "token-usage") {
      await context.fulfillJson({ by_role: {}, input_tokens: 0, output_tokens: 0 });
      return true;
    }
  }
  const response = parityResponse(context.path);
  if (response === undefined) {
    return false;
  }
  await context.fulfillJson(response);
  return true;
}

function sessionIdFromPath(path: string): string | null {
  const match = path.match(/^\/sessions\/([^/]+)$/);
  if (match === null) {
    return null;
  }
  return decodeURIComponent(match[1] ?? "");
}

function shellManagementSessionDetail(
  session: ShellManagementSession,
): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: session.created_at,
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: session.session_id,
    session_mode: "normal",
    title: session.title,
    updated_at: session.updated_at,
    workspace_id: session.workspace_id,
  };
}

function readRecordPayload(body: string | null): Record<string, unknown> {
  if (body === null || body.trim() === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected browser test request body to be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function terminalViewedSidebarRecords(
  unread: boolean,
): Record<string, unknown>[] {
  return [
    {
      active_run_status: null,
      has_unread_terminal_run: unread,
      latest_terminal_run_id: "run-v2-terminal-completed",
      latest_terminal_run_status: "completed",
      latest_terminal_run_updated_at: "2026-06-25T08:35:00Z",
      message_count: 2,
      session_id: UNREAD_TERMINAL_SESSION_ID,
      title: "Unread terminal session",
      updated_at: "2026-06-25T08:35:00Z",
      workspace_id: WORKSPACE_ID,
    },
    {
      active_run_status: null,
      message_count: 1,
      session_id: "session-v2-shell",
      title: "Terminal view control",
      updated_at: "2026-06-25T08:34:00Z",
      workspace_id: WORKSPACE_ID,
    },
  ];
}

function terminalViewedSessionRecord(
  sessionId: string,
  title: string,
): Record<string, unknown> {
  return {
    can_switch_mode: true,
    created_at: "2026-06-25T08:00:00Z",
    normal_model_profile: null,
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    session_id: sessionId,
    session_mode: "normal",
    title,
    updated_at: "2026-06-25T08:35:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function parityResponse(path: string): unknown | undefined {
  if (path === "/system/configs") {
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
  if (path === "/system/skills/market/clawhub") {
    return skillsMarketResponse();
  }
  if (path === "/automation/projects") {
    return [automationProject()];
  }
  if (path === "/automation/projects/aut-daily") {
    return automationProject();
  }
  if (path === "/automation/projects/aut-daily/sessions") {
    return [
      {
        latest_terminal_run_status: "completed",
        metadata: { title: "Daily triage run" },
        session_id: "session-automation",
        updated_at: "2026-06-25T08:16:00Z",
        workspace_id: WORKSPACE_ID,
      },
    ];
  }
  if (path === "/connectors") {
    return connectorsResponse();
  }
  if (path === "/connectors/runtime-tools") {
    return runtimeToolsResponse();
  }
  if (path === "/boards/todos") {
    return boardResponse();
  }
  if (path === "/memories") {
    return memoryQueryResponse();
  }
  if (path === `/workspaces/${WORKSPACE_ID}/memories/memory-v2-shell`) {
    return memoryDetailResponse();
  }
  if (path === "/observability/overview") {
    return observabilityOverviewResponse();
  }
  if (path === "/observability/breakdowns") {
    return observabilityBreakdownsResponse();
  }
  if (path === "/mcp/servers") {
    return mcpServersResponse();
  }
  if (path === "/mcp/servers/stdio-shell/tools") {
    return mcpServerToolsResponse();
  }
  if (path === "/system/configs/plugins") {
    return pluginsConfigResponse();
  }
  if (path === "/system/configs/plugins/runtime") {
    return pluginsConfigResponse();
  }
  if (path === "/system/configs/hooks") {
    return hooksConfigResponse();
  }
  if (path === "/system/configs/hooks/runtime") {
    return hooksRuntimeResponse();
  }
  if (path === "/system/configs/agent-runtimes") {
    return agentRuntimesResponse();
  }
  if (path === "/system/commands:catalog") {
    return commandCatalogResponse();
  }
  if (path === "/system/configs/github") {
    return {
      token_configured: true,
      webhook_base_url: "https://example.invalid/hooks/github",
    };
  }
  if (path === "/system/configs/github/webhook/tunnel") {
    return { provider: "localhost.run", public_url: null, status: "idle" };
  }
  if (path === "/gateway/feishu/accounts") {
    return [feishuAccountResponse()];
  }
  if (path === "/gateway/wechat/accounts") {
    return [wechatAccountResponse()];
  }
  return undefined;
}

function skillsMarketResponse(): Record<string, unknown> {
  return {
    items: [
      {
        installed: false,
        owner_display_name: "Agent Teams",
        owner_handle: "agent-teams",
        owner_image: null,
        slug: "writer",
        stats: {
          comments: 1,
          downloads: 25,
          installs_all_time: 12,
          installs_current: 8,
          stars: 4,
          versions: 2,
        },
        summary: "Draft focused V2 frontend parity notes.",
        title: "Writer",
        version: "1.0.0",
      },
    ],
    next_cursor: null,
    ok: true,
    query: "",
    sort: "popular",
  };
}

function automationProject(): Record<string, unknown> {
  return {
    automation_project_id: "aut-daily",
    created_at: "2026-06-25T08:00:00Z",
    cron_expression: "0 9 * * *",
    delivery_binding: null,
    delivery_events: ["completed"],
    display_name: "Daily triage",
    interval_every: null,
    interval_unit: null,
    last_error: null,
    last_run_started_at: "2026-06-25T08:15:00Z",
    last_session_id: "session-automation",
    latest_terminal_run_status: "completed",
    latest_terminal_run_verification_status: "verified",
    name: "daily_triage",
    next_run_at: "2026-06-26T01:00:00Z",
    prompt: "Keep the V2 shell parity ledger current.",
    run_at: null,
    run_config: {
      normal_root_role_id: "MainAgent",
      session_mode: "normal",
      thinking: { effort: "medium", enabled: true },
      yolo: false,
    },
    schedule_mode: "cron",
    status: "enabled",
    timezone: "Asia/Shanghai",
    trigger_id: "trigger-daily",
    updated_at: "2026-06-25T08:20:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function connectorsResponse(): Record<string, unknown> {
  return {
    items: [
      {
        account_count: 1,
        auth_type: "cli",
        capabilities: ["repositories", "pull_requests"],
        category: "development",
        connector_id: "github",
        description: "GitHub repository and pull request connector.",
        display_name: "GitHub",
        enabled_count: 1,
        last_activity_at: "2026-06-25T08:00:00Z",
        last_error: null,
        provider: "github",
        status: "connected",
      },
    ],
    summary: {
      connected: 1,
      disabled: 0,
      error: 0,
      needs_config: 0,
      total: 1,
    },
  };
}

function runtimeToolsResponse(): Record<string, unknown> {
  return {
    items: [
      {
        display_name: "ripgrep",
        download_job_id: null,
        error_message: null,
        executable_name: "rg.exe",
        path: "C:/Users/yex/.agent-teams/bin/rg.exe",
        path_source: "managed",
        source_kind: "github_release",
        status: "ready",
        target_version: null,
        tool_id: "rg",
        update_available: false,
        version: "14.1.1",
      },
    ],
    system_path: {
      added: false,
      bin_dir: "C:/Users/yex/.agent-teams/bin",
      supported: true,
    },
  };
}

function boardResponse(): Record<string, unknown> {
  const item = {
    body: "Keep module pages reachable from the fixed V2 shell.",
    created_at: "2026-06-25T08:00:00Z",
    issue_number: 401,
    item_revision: 3,
    repository_full_name: "openai/agent-teams",
    run_recoverable: false,
    source_key: "openai/agent-teams#401",
    source_provider: "github",
    source_type: "github_issue",
    status: "todo",
    title: "Keep module pages reachable",
    todo_id: "todo-v2-shell",
    updated_at: "2026-06-25T08:10:00Z",
    workspace_id: WORKSPACE_ID,
  };
  return {
    board_workspace_id: WORKSPACE_ID,
    diagnostics: [],
    is_fork_view: false,
    items: [item],
    revision: 9,
    source_groups: [],
    status_counts: {
      archived: 0,
      done: 0,
      in_progress: 0,
      todo: 1,
    },
    synced_at: "2026-06-25T08:11:00Z",
    view_workspace_id: WORKSPACE_ID,
    workspace_id: WORKSPACE_ID,
  };
}

function memoryQueryResponse(): Record<string, unknown> {
  return {
    items: [memorySummary()],
    limit: 40,
    offset: 0,
    total_count: 1,
  };
}

function memoryDetailResponse(): Record<string, unknown> {
  return {
    ...memorySummary(),
    access_count: 2,
    content: {
      body: "Keep sidebar module entries aligned with V1.",
      context: "V2 frontend rewrite",
      outcome: "Do not flatten secondary pages into the root shell.",
      title: "V2 shell module parity",
    },
    last_accessed_at: null,
    metadata: {},
    parent_entry_id: null,
    run_id: null,
    source_ref: "",
    superseded_by_id: null,
  };
}

function memorySummary(): Record<string, unknown> {
  return {
    confidence_score: 0.96,
    content_body_preview: "Keep sidebar module entries aligned with V1.",
    content_title: "V2 shell module parity",
    created_at: "2026-06-25T08:00:00Z",
    expires_at: null,
    id: "memory-v2-shell",
    kind: "semantic",
    role_id: null,
    scope: "workspace",
    session_id: null,
    source: "manual",
    status: "active",
    tags: ["frontend"],
    tier: "long_term",
    updated_at: "2026-06-25T08:00:00Z",
    version: 1,
    workspace_id: WORKSPACE_ID,
  };
}

function observabilityOverviewResponse(): Record<string, unknown> {
  return {
    generated_at: "2026-06-25T08:00:00Z",
    highlights: [],
    health: {
      avg_run_seconds: 6,
      failed_runs: 0,
      running_runs: 1,
      total_runs: 4,
    },
    session: {
      session_id: "session-v2-shell",
      title: "TS shell parity",
    },
  };
}

function observabilityBreakdownsResponse(): Record<string, unknown> {
  return {
    generated_at: "2026-06-25T08:00:00Z",
    groups: [
      {
        count: 4,
        label: "Agent loop",
        rows: [],
      },
    ],
  };
}

function mcpServersResponse(): unknown[] {
  return [
    {
      discovery_status: "ready",
      enabled: true,
      last_checked_at: "2026-06-25T08:32:00Z",
      name: "stdio-shell",
      source: "app",
      tool_count: 1,
      transport: "stdio",
    },
  ];
}

function mcpServerToolsResponse(): Record<string, unknown> {
  return {
    enabled: true,
    last_checked_at: "2026-06-25T08:32:00Z",
    server: "stdio-shell",
    source: "app",
    status: "ready",
    tools: [
      {
        description: "Run workspace shell commands.",
        name: "run_command",
      },
    ],
    transport: "stdio",
  };
}

function pluginsConfigResponse(): Record<string, unknown> {
  return {
    diagnostics: [],
    plugins: [
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
    ],
  };
}

function hooksConfigResponse(): Record<string, unknown> {
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

function agentRuntimesResponse(): unknown[] {
  return [
    {
      agent_id: "codex-acp",
      description: "ACP adapter for OpenAI coding assistant",
      name: "Codex CLI",
      protocol: "acp",
      transport: "registry",
    },
  ];
}

function commandCatalogResponse(): Record<string, unknown> {
  return {
    app_commands: [
      {
        allowed_modes: ["normal"],
        aliases: ["proposal"],
        argument_hint: "issue",
        description: "Draft a proposal for the selected issue.",
        discovery_source: "app",
        name: "opsx:propose",
        scope: "app",
        source_path: "C:/Users/yex/.agent-teams/commands/opsx-propose.md",
        template: "Draft a proposal.",
      },
    ],
    workspaces: [
      {
        can_create_commands: true,
        commands: [],
        root_path: "C:/Users/yex/Documents/workspace/agent-teams",
        workspace_id: WORKSPACE_ID,
      },
    ],
  };
}

function feishuAccountResponse(): Record<string, unknown> {
  return {
    account_id: "feishu-main",
    created_at: "2026-06-25T08:00:00Z",
    display_name: "Feishu Main",
    name: "feishu-main",
    secret_status: {
      app_secret_configured: true,
      encrypt_key_configured: true,
      verification_token_configured: true,
    },
    source_config: {
      app_id: "cli_app_id",
      app_name: "Relay Bot",
      provider: "feishu",
      trigger_rule: "mention_only",
    },
    status: "enabled",
    target_config: {
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_mode: "normal",
      shell_safety_policy_enabled: true,
      thinking: { effort: "medium", enabled: true },
      workspace_id: WORKSPACE_ID,
      yolo: true,
    },
    updated_at: "2026-06-25T08:00:00Z",
  };
}

function wechatAccountResponse(): Record<string, unknown> {
  return {
    account_id: "wechat-main",
    base_url: "http://127.0.0.1:5900",
    cdn_base_url: "http://127.0.0.1:5901",
    created_at: "2026-06-25T08:00:00Z",
    display_name: "WeChat Main",
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    route_tag: "desktop",
    running: true,
    session_mode: "normal",
    status: "enabled",
    sync_cursor: "cursor-v2",
    thinking: { effort: null, enabled: false },
    updated_at: "2026-06-25T08:00:00Z",
    workspace_id: WORKSPACE_ID,
    yolo: true,
  };
}
