import { expect, test, type Page } from "@playwright/test";

import {
  captureStableViewportScreenshot,
  ensureScreenshotDir,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV1Shell,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v1-v2-primary-surfaces";
const WIDE_VIEWPORT = { height: 900, width: 1280 };
const NARROW_VIEWPORT = { height: 760, width: 720 };
const SEARCH_V1_TARGET_SESSION_ID = "session-search-release";

test("pairs V1 and V2 primary surfaces for Skills, Board, Search, and Memory", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await page.setViewportSize(WIDE_VIEWPORT);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handlePrimarySurfacesApi,
      sessionTitle: currentSession().title,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForV1Shell(page);

    await assertV1Skills(page);
    await assertV1Board(page);
    await assertV1Search(page);
    await assertV1Memory(page);

    await page.getByRole("link", { name: "Open new interface" }).click();
    await page.waitForURL(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await assertV2Skills(page);
    await assertV2Board(page);
    await assertV2Search(page);
    await assertV2Memory(page);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

test("keeps V2 primary surfaces horizontally framed at 720x760", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const unhandledApiRoutes: string[] = [];
  try {
    await page.setViewportSize(NARROW_VIEWPORT);
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: handlePrimarySurfacesApi,
      sessionTitle: currentSession().title,
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });

    await primaryNav.getByRole("button", { name: "Skills" }).click();
    const skillsView = page.getByTestId("skills-view");
    await expect(skillsView).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Open skill Writer" }),
    ).toBeVisible();
    await expectV2NoHorizontalClip(
      page,
      '[data-testid="skills-view"]',
      "narrow Skills surface should not overflow or clip under the sidebar",
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath("primary-narrow-v2-skills.png", SCREENSHOT_FOLDER),
    );

    await primaryNav.getByRole("button", { name: "Board" }).click();
    const boardView = page.getByTestId("board-todos-view");
    await expect(boardView).toBeVisible();
    await expect(boardView.getByTestId("board-todo-todo-v2-shell")).toBeVisible();
    await expectV2NoHorizontalClip(
      page,
      '[data-testid="board-todos-view"]',
      "narrow Board surface should not overflow or clip under the sidebar",
    );
    await expectBoardColumnsRemainUsable(page);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("primary-narrow-v2-board.png", SCREENSHOT_FOLDER),
    );

    await primaryNav.getByRole("button", { name: "Search" }).click();
    const searchView = page.getByTestId("session-search-view");
    await expect(searchView).toBeVisible();
    await expect(
      searchView.getByRole("searchbox", { name: "Search sessions" }),
    ).toBeFocused();
    await searchView
      .getByRole("searchbox", { name: "Search sessions" })
      .fill("release");
    await expect(
      page.getByRole("option", { name: "Open Release handoff notes" }),
    ).toBeVisible();
    await expectV2NoHorizontalClip(
      page,
      '[data-testid="session-search-view"]',
      "narrow Search surface should not overflow or clip under the sidebar",
    );
    await expectSearchControlsRemainUsable(page);
    await captureStableViewportScreenshot(
      page,
      screenshotPath("primary-narrow-v2-search.png", SCREENSHOT_FOLDER),
    );

    await primaryNav.getByRole("button", { name: "Memory" }).click();
    const memoryView = page.getByTestId("memory-view");
    await expect(memoryView).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toBeVisible();
    await expectV2NoHorizontalClip(
      page,
      '[data-testid="memory-view"]',
      "narrow Memory surface should not overflow or clip under the sidebar",
    );
    await captureStableViewportScreenshot(
      page,
      screenshotPath("primary-narrow-v2-memory.png", SCREENSHOT_FOLDER),
    );

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    await appServer.close();
  }
});

async function assertV1Skills(page: Page): Promise<void> {
  await page.locator('.home-feature-item[data-feature-id="skills"]').click();
  const projectView = page.locator("#project-view");
  await expect(projectView).toBeVisible();
  await expect(page.locator("#project-view-title")).toHaveText("Skills");
  await expect(page.locator('[data-feature-skills-search]')).toBeVisible();
  await expect(page.locator('[data-feature-skills-clawhub-settings]')).toBeVisible();
  await expect(page.getByText("Writer", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft project updates.")).toBeVisible();
  await page.locator('[data-feature-skill-detail="market:writer"]').click();
  const detailModal = page.locator('[data-feature-skills-modal] [role="dialog"]');
  await expect(detailModal).toBeVisible();
  await expect(detailModal.getByRole("heading", { level: 3, name: "Writer" }))
    .toBeVisible();
  await expect(
    detailModal.locator("code").filter({ hasText: "writer" }).first(),
  ).toBeVisible();
  await expect(detailModal.getByText("Draft project updates.").first()).toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v1-skills.png", SCREENSHOT_FOLDER),
  );
  await page.locator("[data-feature-skills-modal-close]").last().click();
  await expect(detailModal).toHaveCount(0);
}

async function assertV1Board(page: Page): Promise<void> {
  await page.locator('.home-feature-item[data-feature-id="boards"]').click();
  const boardView = page.locator(".board-todos");
  await expect(boardView).toBeVisible();
  await expect(boardView.getByRole("heading", { level: 2, name: "Boards" }))
    .toBeVisible();
  await expect(page.locator("[data-board-todo-workspace]")).toBeVisible();
  await expect(page.locator('[data-board-todo-action="sync"]')).toBeVisible();
  await expect(page.locator('[data-board-todo-action="sources"]')).toBeVisible();
  await expect(page.locator('[data-board-todo-card="todo-v2-shell"]')).toBeVisible();
  await expect(
    boardView.getByRole("heading", { level: 3, name: "Keep module pages reachable" }),
  ).toBeVisible();
  await page.locator('[data-board-todo-action="sources"]').click();
  const settingsDialog = page.locator(".board-todo-source-settings-modal");
  await expect(settingsDialog).toBeVisible();
  await expect(
    settingsDialog.getByRole("heading", {
      level: 3,
      name: "TODO settings",
    }),
  ).toBeVisible();
  await expect(settingsDialog.getByText("TODO source list")).toBeVisible();
  await expect(
    settingsDialog.getByRole("heading", { level: 4, name: "GitHub issues" }),
  ).toBeVisible();
  await expect(settingsDialog.getByText("openai/agent-teams")).toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v1-board.png", SCREENSHOT_FOLDER),
  );
  await settingsDialog
    .locator('.board-todo-source-settings-footer [data-board-todo-source-action="close"]')
    .click();
  await expect(settingsDialog).toHaveCount(0);
}

async function assertV1Search(page: Page): Promise<void> {
  await page.locator(".home-session-search-btn").click();
  const searchPanel = page.locator(".session-search-panel");
  await expect(searchPanel).toBeVisible();
  const searchInput = page.locator(".session-search-input");
  await expect(searchInput).toBeFocused();
  await expect(searchPanel.getByText("Recent conversations")).toBeVisible();
  await searchInput.fill("release");
  await expect(searchPanel.getByText("Matching conversations")).toBeVisible();
  const releaseResult = page.locator(
    `.session-search-result[data-session-id="${SEARCH_V1_TARGET_SESSION_ID}"]`,
  );
  await expect(releaseResult).toBeVisible();
  await expect(releaseResult).toContainText("Release handoff notes");
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v1-search.png", SCREENSHOT_FOLDER),
  );
  await searchInput.press("Enter");
  await expect(page.locator(".session-search-root")).toHaveCount(0);
  await expect(page.locator("#current-session-id-badge")).toHaveText(
    SEARCH_V1_TARGET_SESSION_ID,
  );
  await expect(page.locator("#prompt-input")).toBeVisible();
}

async function assertV1Memory(page: Page): Promise<void> {
  await page.locator('.home-feature-item[data-feature-id="memory"]').click();
  const projectView = page.locator("#project-view");
  await expect(projectView).toBeVisible();
  await expect(page.locator("#project-view-title")).toHaveText("Memory");
  await expect(page.locator("#project-view-summary")).toHaveText("2 entries");
  await expect(page.locator('[data-memory-search]')).toBeVisible();
  await expect(page.getByText("Capture")).toBeVisible();
  await expect(page.getByText("Reuse")).toBeVisible();
  await expect(page.locator('[data-memory-id="memory-shell-frame"]')).toBeVisible();
  await expect(page.locator(".memory-detail")).toContainText("Fixed shell frame");
  await page.locator('[data-memory-tab="skill-drafts"]').click();
  await expect(page.locator(".memory-draft-shell")).toBeVisible();
  await expect(page.locator('[data-draft-id="draft-1"]')).toBeVisible();
  await expect(page.locator(".memory-draft-editor")).toContainText("workspace-frame");
  await expect(page.locator(".memory-draft-editor")).toContainText(
    "Add one usage example before applying.",
  );
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v1-memory.png", SCREENSHOT_FOLDER),
  );
}

async function assertV2Skills(page: Page): Promise<void> {
  const primaryNav = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await primaryNav.getByRole("button", { name: "Skills" }).click();
  const skillsView = page.getByTestId("skills-view");
  await expect(skillsView).toBeVisible();
  await expect(skillsView.getByText("1 installed")).toBeVisible();
  await expect(
    skillsView.getByRole("button", { name: "Open skill Writer" }),
  ).toBeVisible();
  await expect(skillsView.getByText("Installs: 7")).toBeVisible();
  await expect(
    skillsView.getByRole("searchbox", { name: "Search skills" }),
  ).toBeVisible();
  await skillsView.getByRole("button", { name: "Open skill Writer" }).click();
  const detailDialog = page.getByRole("dialog", { name: "Skill detail" });
  await expect(detailDialog).toBeVisible();
  await expect(
    detailDialog.getByRole("heading", { level: 3, name: "Writer" }),
  ).toBeVisible();
  await expect(detailDialog.getByText("Draft project updates.").first())
    .toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v2-skills.png", SCREENSHOT_FOLDER),
  );
  await page.keyboard.press("Escape");
  await expect(detailDialog).toBeHidden();
}

async function assertV2Board(page: Page): Promise<void> {
  const primaryNav = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await primaryNav.getByRole("button", { name: "Board" }).click();
  const boardView = page.getByTestId("board-todos-view");
  await expect(boardView).toBeVisible();
  await expect(
    boardView.getByRole("heading", { name: "Keep module pages reachable" }),
  ).toBeVisible();
  await expect(boardView.getByRole("searchbox", { name: "Search board TODOs" }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Sync board" })).toBeVisible();
  await expect(boardView.locator(".at-board-scope")).toContainText("Revision");
  await expect(boardView.getByText("9")).toBeVisible();
  await boardView.getByRole("button", { name: "Board sources" }).click();
  const drawer = page.getByRole("dialog", { name: "Board sources" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("GitHub issues", { exact: true })).toBeVisible();
  await expect(drawer.getByText("openai/agent-teams")).toBeVisible();
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v2-board.png", SCREENSHOT_FOLDER),
  );
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
}

async function assertV2Search(page: Page): Promise<void> {
  const primaryNav = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await primaryNav.getByRole("button", { name: "Search" }).click();
  const searchView = page.getByTestId("session-search-view");
  await expect(searchView).toBeVisible();
  const searchbox = searchView.getByRole("searchbox", {
    name: "Search sessions",
  });
  await expect(searchbox).toBeFocused();
  await expect(searchView.getByText("Recent sessions")).toBeVisible();
  await searchbox.fill("release");
  await expect(searchView.getByText("1 results")).toBeVisible();
  const result = page.getByRole("option", {
    name: "Open Release handoff notes",
  });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Release handoff notes");
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v2-search.png", SCREENSHOT_FOLDER),
  );
  await searchbox.press("Enter");
  await expect(page.locator(".at-chat-view")).toBeVisible();
  await expect(page.getByText("Release session opened marker")).toBeVisible();
  await expect(page.getByText("Memory session opened marker")).toHaveCount(0);
}

async function assertV2Memory(page: Page): Promise<void> {
  const primaryNav = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await primaryNav.getByRole("button", { name: "Memory" }).click();
  const memoryView = page.getByTestId("memory-view");
  await expect(memoryView).toBeVisible();
  await expect(memoryView.getByText(`Workspace ${WORKSPACE_ID}`)).toBeVisible();
  await expect(memoryView.getByText("2 memories")).toBeVisible();
  await expect(
    memoryView.getByRole("searchbox", { name: "Search memories" }),
  ).toBeVisible();
  await expect(page.getByTestId("memory-row-memory-shell-frame")).toBeVisible();
  await expect(page.getByTestId("memory-detail")).toContainText("Fixed shell frame");
  await memoryView.getByText("Skill Drafts", { exact: true }).click();
  await expect(page.getByTestId("memory-skill-drafts")).toBeVisible();
  await expect(page.getByTestId("memory-draft-row-draft-1")).toBeVisible();
  await expect(page.getByTestId("memory-draft-editor")).toContainText(
    "workspace-frame",
  );
  await expect(page.getByTestId("memory-draft-editor")).toContainText(
    "Add one usage example before applying.",
  );
  await expect(page.getByTestId("memory-draft-editor")).toContainText("SKILL.md");
  await captureStableViewportScreenshot(
    page,
    screenshotPath("primary-pair-v2-memory.png", SCREENSHOT_FOLDER),
  );
}

async function expectV2NoHorizontalClip(
  page: Page,
  selector: string,
  message: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((selector) => {
          const surface = document.querySelector<HTMLElement>(selector);
          const sidebar = document.querySelector<HTMLElement>(".at-sidebar");
          if (surface === null || sidebar === null) {
            return {
              documentOverflowsX: true,
              sidebarClipsSurface: true,
              surfaceRightOverflow: true,
            };
          }
          const surfaceRect = surface.getBoundingClientRect();
          const sidebarRect = sidebar.getBoundingClientRect();
          return {
            documentOverflowsX:
              document.documentElement.scrollWidth > window.innerWidth + 1,
            sidebarClipsSurface: surfaceRect.left < sidebarRect.right - 1,
            surfaceRightOverflow: surfaceRect.right > window.innerWidth + 1,
          };
        }, selector),
      { message },
    )
    .toEqual({
      documentOverflowsX: false,
      sidebarClipsSurface: false,
      surfaceRightOverflow: false,
    });
}

async function expectBoardColumnsRemainUsable(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const columns = document.querySelector<HTMLElement>(".at-board-columns");
        const firstColumn = document.querySelector<HTMLElement>(".at-board-column");
        if (columns === null || firstColumn === null) {
          return false;
        }
        const overflowX = window.getComputedStyle(columns).overflowX;
        return (
          firstColumn.getBoundingClientRect().width >= 248
          &&
            columns.scrollWidth > columns.clientWidth
          && (overflowX === "auto" || overflowX === "scroll")
        );
      }),
    )
    .toBe(true);
}

async function expectSearchControlsRemainUsable(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>(
          '[data-testid="session-search-view"]',
        );
        const input = document.querySelector<HTMLElement>(
          '[data-testid="session-search-view"] input[type="search"]',
        );
        const result = document.querySelector<HTMLElement>(
          '[role="option"][aria-label="Open Release handoff notes"]',
        );
        if (surface === null || input === null || result === null) {
          return false;
        }
        const surfaceRect = surface.getBoundingClientRect();
        return [input, result].every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= surfaceRect.left - 1 && rect.right <= surfaceRect.right + 1;
        });
      }),
    )
    .toBe(true);
}

async function handlePrimarySurfacesApi(
  context: MockApiRouteContext,
): Promise<boolean> {
  if (context.method === "GET" && context.path === "/workspaces") {
    await context.fulfillJson([workspaceRecord()]);
    return true;
  }
  if (context.method === "GET" && context.path === "/sessions/sidebar") {
    await context.fulfillJson(sessionSidebarRecords());
    return true;
  }
  if (
    context.method === "GET"
    && context.path === `/workspaces/${WORKSPACE_ID}/sessions/sidebar`
  ) {
    await context.fulfillJson({
      has_more: false,
      items: sessionSidebarRecords(),
      next_cursor: null,
    });
    return true;
  }
  if (context.method === "GET" && context.path === "/system/configs") {
    await context.fulfillJson(skillsConfigResponse());
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub"
  ) {
    await context.fulfillJson(skillsMarketResponse());
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub/writer"
  ) {
    await context.fulfillJson(skillsMarketDetailResponse());
    return true;
  }
  if (context.method === "GET" && context.path === "/memories") {
    await context.fulfillJson(memoryListResponse(context.url.searchParams));
    return true;
  }
  if (context.method === "POST" && context.path === "/memories/search") {
    const payload = readRecordPayload(context.route.request().postData());
    await context.fulfillJson(memorySearchResponse(payload));
    return true;
  }
  if (
    context.method === "GET"
    && context.path.startsWith(`/workspaces/${WORKSPACE_ID}/memories/`)
  ) {
    const memoryId = decodeURIComponent(context.path.split("/").at(-1) ?? "");
    await context.fulfillJson(memoryDetailResponse(memoryId));
    return true;
  }
  if (context.method === "GET" && context.path === "/memories/skill-drafts") {
    await context.fulfillJson(memorySkillDraftListResponse());
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/memories/skill-drafts/draft-1"
  ) {
    await context.fulfillJson(memorySkillDraftResponse());
    return true;
  }
  if (context.method === "GET" && context.path === "/boards/todos") {
    await context.fulfillJson(
      boardResponse(context.url.searchParams.get("include_archived") === "true"),
    );
    return true;
  }
  if (context.method === "GET" && context.path === "/boards/todos:changes") {
    await context.fulfillJson(
      boardResponse(context.url.searchParams.get("include_archived") === "true"),
    );
    return true;
  }
  if (context.method === "POST" && context.path === "/boards/todos:sync") {
    const payload = readRecordPayload(context.route.request().postData());
    await context.fulfillJson(boardResponse(payload.include_archived === true));
    return true;
  }
  if (
    context.method === "POST"
    && context.path === "/boards/todos:sync-changes"
  ) {
    const payload = readRecordPayload(context.route.request().postData());
    await context.fulfillJson(boardResponse(payload.include_archived === true));
    return true;
  }
  if (context.method === "GET" && context.path === "/boards/todo-sources") {
    await context.fulfillJson(boardSourceSettingsResponse());
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/boards/todo-handoff-templates"
  ) {
    await context.fulfillJson({
      templates: [],
    });
    return true;
  }
  if (context.method === "GET" && context.path.startsWith("/sessions/")) {
    const sessionMatch = context.path.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
    if (sessionMatch === null) {
      return false;
    }
    const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
    const leaf = sessionMatch[2];
    const session = sessionById(sessionId);
    if (session === null) {
      return false;
    }
    if (leaf === undefined) {
      await context.fulfillJson(sessionDetail(session));
      return true;
    }
    if (leaf === "messages") {
      await context.fulfillJson(sessionMessages(sessionId));
      return true;
    }
    if (leaf === "rounds") {
      await context.fulfillJson({ has_more: false, items: [], next_cursor: null });
      return true;
    }
    if (leaf === "agents" || leaf === "subagents" || leaf === "tasks") {
      await context.fulfillJson([]);
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
  return false;
}

function currentSession(): SessionRecord {
  return {
    created_at: "2026-06-25T08:00:00Z",
    message_count: 2,
    session_id: SESSION_ID,
    title: "Current planning",
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function allSessions(): SessionRecord[] {
  return [
    currentSession(),
    {
      created_at: "2026-06-25T08:05:00Z",
      message_count: 2,
      session_id: SEARCH_V1_TARGET_SESSION_ID,
      title: "Release handoff notes",
      updated_at: "2026-06-25T08:40:00Z",
      workspace_id: WORKSPACE_ID,
    },
    {
      created_at: "2026-06-25T08:10:00Z",
      message_count: 2,
      session_id: "session-search-memory",
      title: "Memory review notes",
      updated_at: "2026-06-25T08:45:00Z",
      workspace_id: WORKSPACE_ID,
    },
  ];
}

function sessionById(sessionId: string): SessionRecord | null {
  return allSessions().find((session) => session.session_id === sessionId) ?? null;
}

function sessionSidebarRecords(): Array<Record<string, unknown>> {
  return allSessions().map((session) => ({
    active_run_status: null,
    created_at: session.created_at,
    metadata: { title: session.title },
    message_count: session.message_count,
    session_id: session.session_id,
    title: session.title,
    updated_at: session.updated_at,
    workspace_id: session.workspace_id,
  }));
}

function sessionDetail(session: SessionRecord): Record<string, unknown> {
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

function sessionMessages(sessionId: string): Array<Record<string, unknown>> {
  if (sessionId === SEARCH_V1_TARGET_SESSION_ID) {
    return [
      timelineMessage("release-user", "user", "Open the release handoff session"),
      timelineMessage(
        "release-assistant",
        "assistant",
        "Release session opened marker",
      ),
    ];
  }
  if (sessionId === "session-search-memory") {
    return [
      timelineMessage("memory-user", "user", "Open the memory review session"),
      timelineMessage(
        "memory-assistant",
        "assistant",
        "Memory session opened marker",
      ),
    ];
  }
  return [
    timelineMessage("current-user", "user", "Open the current session"),
    timelineMessage(
      "current-assistant",
      "assistant",
      "Current session body marker",
    ),
  ];
}

function timelineMessage(
  messageId: string,
  role: "assistant" | "user",
  content: string,
): Record<string, unknown> {
  return {
    content,
    created_at: "2026-06-25T08:30:00Z",
    message_id: messageId,
    role,
    run_id: `${messageId}-run`,
  };
}

function workspaceRecord(): Record<string, unknown> {
  return {
    display_name: "agent-teams",
    last_session_id: SESSION_ID,
    path: "C:/Users/yex/Documents/workspace/agent-teams",
    root_path: "C:/Users/yex/Documents/workspace/agent-teams",
    updated_at: "2026-06-25T08:00:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function skillsConfigResponse(): Record<string, unknown> {
  return {
    skills: {
      loaded: true,
      skills: [
        {
          description: "Create reusable skills.",
          instruction_path: "C:/skills/skill-creator/SKILL.md",
          name: "skill-creator",
          path: "C:/skills/skill-creator",
          ref: "skill-creator",
          source: "builtin",
        },
      ],
    },
  };
}

function skillsMarketResponse(): Record<string, unknown> {
  return {
    items: [
      {
        installed: false,
        slug: "writer",
        stats: { downloads: 12, installs_current: 7, stars: 3 },
        summary: "Draft project updates.",
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

function skillsMarketDetailResponse(): Record<string, unknown> {
  return {
    files: [{ path: "SKILL.md", size: 128 }],
    manifest_content: "# Writer\n\nDraft project updates.",
    ok: true,
    slug: "writer",
    stats: { downloads: 12, installs_current: 7, stars: 3 },
    summary: "Draft project updates.",
    title: "Writer",
    version: "1.0.0",
  };
}

function boardResponse(includeArchived = false): Record<string, unknown> {
  const items: Array<Record<string, unknown>> = [
    {
      body: "Keep module pages reachable from the fixed shell.",
      created_at: "2026-06-25T08:00:00Z",
      issue_number: 401,
      item_revision: 3,
      repository_full_name: "openai/agent-teams",
      run_recoverable: false,
      source_id: "source-1",
      source_key: "openai/agent-teams#401",
      source_provider: "github",
      source_type: "github_issue",
      status: "todo",
      title: "Keep module pages reachable",
      todo_id: "todo-v2-shell",
      updated_at: "2026-06-25T08:10:00Z",
      workspace_id: WORKSPACE_ID,
    },
  ];
  if (includeArchived) {
    items.push({
      archived_at: "2026-06-25T08:13:00Z",
      body: "Archived board work should stay hidden until requested.",
      created_at: "2026-06-25T08:07:00Z",
      issue_number: 404,
      item_revision: 3,
      last_status_reason: "Archived after verification",
      repository_full_name: "openai/agent-teams",
      run_recoverable: false,
      source_id: "source-1",
      source_key: "openai/agent-teams#404",
      source_provider: "github",
      source_type: "github_issue",
      status: "archived",
      title: "Archived board verification",
      todo_id: "todo-v2-archived",
      updated_at: "2026-06-25T08:13:00Z",
      workspace_id: WORKSPACE_ID,
    });
  }
  return {
    board_workspace_id: WORKSPACE_ID,
    diagnostics: [],
    is_fork_view: false,
    items,
    repository_full_name: "openai/agent-teams",
    revision: 9,
    source_groups: [
      {
        display_name: "GitHub issues",
        enabled: true,
        group_id: "source-1",
        kind: "github_issues",
        repository_full_name: "openai/agent-teams",
        source_id: "source-1",
      },
    ],
    status_counts: {
      archived: includeArchived ? 1 : 0,
      done: 0,
      in_progress: 0,
      review: 0,
      todo: 1,
    },
    synced_at: "2026-06-25T08:11:00Z",
    view_workspace_id: WORKSPACE_ID,
    workspace_id: WORKSPACE_ID,
  };
}

function boardSourceSettingsResponse(): Record<string, unknown> {
  return {
    board_workspace_id: WORKSPACE_ID,
    diagnostics: [],
    is_fork_view: false,
    sources: [
      {
        source: {
          created_at: "2026-06-25T08:00:00Z",
          display_name: "GitHub issues",
          enabled: true,
          kind: "github_issues",
          provider: "github",
          repository_full_name: "openai/agent-teams",
          source_id: "source-1",
          system_managed: false,
          updated_at: "2026-06-25T08:20:00Z",
          workspace_id: WORKSPACE_ID,
        },
        state: {
          last_diagnostics: [],
          last_sync_finished_at: "2026-06-25T08:11:00Z",
          last_sync_started_at: "2026-06-25T08:10:00Z",
          last_sync_status: "succeeded",
          source_id: "source-1",
          sync_cursor: "issue-cursor",
          workspace_id: WORKSPACE_ID,
        },
      },
    ],
    view_workspace_id: WORKSPACE_ID,
    workspace_id: WORKSPACE_ID,
  };
}

function memoryListResponse(searchParams: URLSearchParams): Record<string, unknown> {
  const status = searchParams.get("status") ?? "active";
  const items = memorySummaries().filter((entry) => entry.status === status);
  return {
    items,
    limit: 40,
    offset: 0,
    total_count: items.length,
  };
}

function memorySearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.text_query !== "subagent") {
    return {
      items: [],
      total_count: 0,
    };
  }
  return {
    items: [
      {
        entry: memorySummary("memory-search-hit"),
        rank: 1,
        score: 0.93,
        snippet: "subagent stream stays isolated from the parent timeline",
      },
    ],
    total_count: 1,
  };
}

function memorySkillDraftListResponse(): Record<string, unknown> {
  return {
    items: [memorySkillDraftSummary()],
    limit: 30,
    offset: 0,
    total_count: 1,
  };
}

function memorySkillDraftResponse(): Record<string, unknown> {
  return {
    applied_at: null,
    applied_ref: null,
    applied_skill_id: null,
    created_at: "2026-06-25T08:45:00Z",
    description: "Turn stable workspace-frame memories into a reusable skill.",
    draft_kind: "skill",
    files: [
      {
        content: "# Workspace frame skill",
        encoding: "utf-8",
        path: "SKILL.md",
      },
    ],
    generation_error: "",
    id: "draft-1",
    instructions: "Keep workspace pages fixed-height and locally scrollable.",
    runtime_name: "workspace-frame",
    scope_kind: "workspace",
    source_memory_ids: ["memory-shell-frame", "memory-search-hit"],
    status: "draft",
    updated_at: "2026-06-25T08:50:00Z",
    validated_at: null,
    validation_messages: [
      {
        code: "missing-example",
        message: "Add one usage example before applying.",
        path: "SKILL.md",
        severity: "warning",
      },
    ],
    workspace_id: WORKSPACE_ID,
    workspace_ids: [WORKSPACE_ID],
  };
}

function memorySkillDraftSummary(): Record<string, unknown> {
  return {
    applied_ref: null,
    created_at: "2026-06-25T08:45:00Z",
    description: "Turn stable workspace-frame memories into a reusable skill.",
    draft_kind: "skill",
    id: "draft-1",
    runtime_name: "workspace-frame",
    scope_kind: "workspace",
    source_memory_count: 2,
    status: "draft",
    updated_at: "2026-06-25T08:50:00Z",
    validation_error_count: 0,
    validation_warning_count: 1,
    workspace_id: WORKSPACE_ID,
    workspace_ids: [WORKSPACE_ID],
  };
}

function memorySummaries(): Array<Record<string, unknown>> {
  return [
    memorySummary("memory-shell-frame"),
    memorySummary("memory-role-routing"),
    memorySummary("memory-superseded"),
  ];
}

function memorySummary(memoryId: string): Record<string, unknown> {
  const base = {
    confidence_score: 0.91,
    created_at: "2026-06-25T08:00:00Z",
    expires_at: null,
    id: memoryId,
    role_id: null,
    scope: "workspace",
    session_id: null,
    source: "manual",
    status: "active",
    tags: ["frontend"],
    tier: "persistent",
    updated_at: "2026-06-25T08:20:00Z",
    version: 1,
    workspace_id: WORKSPACE_ID,
  };
  if (memoryId === "memory-role-routing") {
    return {
      ...base,
      content_body_preview: "Keep orchestration role routing explicit.",
      content_title: "Role routing decision",
      kind: "decision",
      tags: ["runtime", "orchestration"],
      tier: "medium_term",
    };
  }
  if (memoryId === "memory-superseded") {
    return {
      ...base,
      confidence_score: 0.71,
      content_body_preview: "Older prompt display rule retained for audit.",
      content_title: "Superseded prompt note",
      kind: "summary",
      status: "superseded",
      tags: ["timeline"],
      tier: "working",
    };
  }
  if (memoryId === "memory-search-hit") {
    return {
      ...base,
      confidence_score: 0.94,
      content_body_preview: "Subagent stream rows stay out of the parent timeline.",
      content_title: "Subagent stream isolation",
      kind: "constraint",
      tags: ["subagent", "stream"],
    };
  }
  return {
    ...base,
    content_body_preview: "Keep the app viewport locked while chat scrolls independently.",
    content_title: "Fixed shell frame",
    kind: "constraint",
  };
}

function memoryDetailResponse(memoryId: string): Record<string, unknown> {
  const summary = memorySummary(memoryId);
  if (summary.id === "memory-role-routing") {
    return {
      ...summary,
      access_count: 4,
      content: {
        body: "Use the selected orchestration role only for routed work.",
        context: "Composer run controls",
        outcome: "Normal mode remains Main Agent unless the user changes it.",
        title: "Role routing decision",
      },
      last_accessed_at: null,
      metadata: {
        area: "orchestration",
        owner: "runtime",
      },
      parent_entry_id: null,
      run_id: null,
      source_ref: "",
      superseded_by_id: null,
    };
  }
  if (summary.id === "memory-superseded") {
    return {
      ...summary,
      access_count: 3,
      content: {
        body: "This prompt instruction was replaced by the processed group rule.",
        context: "Timeline replay cleanup",
        outcome: "Superseded rows remain inspectable but are filtered by default.",
        title: "Superseded prompt note",
      },
      last_accessed_at: null,
      metadata: { owner: "memory" },
      parent_entry_id: null,
      run_id: null,
      source_ref: "",
      superseded_by_id: null,
    };
  }
  if (summary.id === "memory-search-hit") {
    return {
      ...summary,
      access_count: 4,
      content: {
        body: "Subagent stream rows must stay in the right panel and never leak into the parent timeline.",
        context: "Runtime stream recovery",
        outcome: "Parent replay and live streaming remain ordered.",
        title: "Subagent stream isolation",
      },
      last_accessed_at: null,
      metadata: { owner: "stream" },
      parent_entry_id: null,
      run_id: null,
      source_ref: "",
      superseded_by_id: null,
    };
  }
  return {
    ...summary,
    access_count: 4,
    content: {
      body: "Keep the app viewport locked while chat scrolls independently.",
      context: "Frontend rewrite shell parity",
      outcome: "Sidebar, timeline, and composer keep fixed-page behavior.",
      title: "Fixed shell frame",
    },
    last_accessed_at: null,
    metadata: { owner: "frontend" },
    parent_entry_id: null,
    run_id: null,
    source_ref: "",
    superseded_by_id: null,
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

function readRecordPayload(body: string | null): Record<string, unknown> {
  if (body === null || body.trim() === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

interface SessionRecord {
  created_at: string;
  message_count: number;
  session_id: string;
  title: string;
  updated_at: string;
  workspace_id: string;
}
