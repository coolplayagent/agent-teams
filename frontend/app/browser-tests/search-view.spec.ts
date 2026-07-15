import { expect, test } from "@playwright/test";

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
  waitForAppShell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-search";
const TARGET_SESSION_ID = "session-search-release";
const OTHER_SESSION_ID = "session-search-alpha";
const DESKTOP_WORKSPACE_ID = "workspace-search-desktop";

test("searches sessions across workspaces and opens the selected session", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = searchViewState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSearchApi(context, state),
      sessionTitle: "Current planning",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await expect(page.getByText("Current session body marker")).toBeVisible();

    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNav.getByRole("button", { name: "Search" }).click();

    const searchView = page.getByTestId("session-search-view");
    await expect(searchView).toBeVisible();
    const searchbox = page.getByRole("searchbox", { name: "Search sessions" });
    await expect(searchbox).toBeFocused();
    await expect(searchView.getByText("Recent sessions")).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Open Current planning" }),
    ).toHaveAttribute("aria-current", "page");

    await searchbox.fill("missing-result");
    await expect(searchView.getByText("No matches")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);

    await searchbox.fill("desktop release");
    await expect(searchView.getByText("1 results")).toBeVisible();
    const targetResult = page.getByRole("option", {
      name: "Open Release handoff notes",
    });
    await expect(targetResult).toBeVisible();
    await expect(targetResult).toHaveAttribute("aria-selected", "true");
    await expect(targetResult.locator(".at-session-search-mark")).toHaveCount(2);
    await expect(targetResult).toContainText("Desktop");
    await expect(targetResult).toContainText("C:/work/desktop");
    await expect(
      page.getByRole("option", { name: "Open Alpha session" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-session-search-filtered-results.png", SCREENSHOT_FOLDER),
    });

    await searchbox.press("Enter");
    await expect(page.locator(".at-chat-view")).toBeVisible();
    await expect(page.getByText("Release session opened marker")).toBeVisible();
    await expect(page.getByText("Current session body marker")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Release handoff notes" }),
    ).toBeVisible();
    await expect(page.locator(".at-session-item").filter({
      has: page.getByRole("button", { name: "Release handoff notes" }),
    })).toHaveClass(/is-selected/);
    await expect
      .poll(() => state.selectedSessionRequests)
      .toContain(TARGET_SESSION_ID);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "search surface and selected chat should stay inside the fixed shell",
    );
    await expectComposerControlsDoNotOverlap(page);
    await page.screenshot({
      path: screenshotPath("v2-session-search-selected-chat.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

interface SearchViewState {
  releaseInitialLoadRequests: Array<() => void>;
  readonly sessions: SearchSessionRecord[];
  slowInitialLoad: boolean;
  readonly workspaces: SearchWorkspaceRecord[];
  selectedSessionRequests: string[];
}

interface SearchSessionRecord {
  readonly created_at: string;
  readonly message_count: number;
  readonly session_id: string;
  readonly title: string;
  readonly updated_at: string;
  readonly workspace_id: string;
}

interface SearchWorkspaceRecord {
  readonly display_name: string;
  readonly last_session_id: string;
  readonly root_path: string;
  readonly updated_at: string;
  readonly workspace_id: string;
}

function searchViewState(): SearchViewState {
  return {
    releaseInitialLoadRequests: [],
    selectedSessionRequests: [],
    slowInitialLoad: false,
    sessions: [
      {
        created_at: "2026-06-25T08:00:00Z",
        message_count: 2,
        session_id: SESSION_ID,
        title: "Current planning",
        updated_at: "2026-06-25T08:30:00Z",
        workspace_id: WORKSPACE_ID,
      },
      {
        created_at: "2026-06-25T08:05:00Z",
        message_count: 2,
        session_id: TARGET_SESSION_ID,
        title: "Release handoff notes",
        updated_at: "2026-06-25T08:40:00Z",
        workspace_id: DESKTOP_WORKSPACE_ID,
      },
      {
        created_at: "2026-06-25T08:10:00Z",
        message_count: 1,
        session_id: OTHER_SESSION_ID,
        title: "Alpha session",
        updated_at: "2026-06-25T08:20:00Z",
        workspace_id: WORKSPACE_ID,
      },
    ],
    workspaces: [
      {
        display_name: "Agent Teams",
        last_session_id: SESSION_ID,
        root_path: "C:/work/agent-teams",
        updated_at: "2026-06-25T08:00:00Z",
        workspace_id: WORKSPACE_ID,
      },
      {
        display_name: "Desktop",
        last_session_id: TARGET_SESSION_ID,
        root_path: "C:/work/desktop",
        updated_at: "2026-06-25T08:00:00Z",
        workspace_id: DESKTOP_WORKSPACE_ID,
      },
    ],
  };
}

test("shows the Search loading state inside the fixed shell", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = searchViewState();
  state.slowInitialLoad = true;
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSearchApi(context, state),
      sessionTitle: "Search loading evidence",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/`);
    await waitForAppShell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Search" })
      .click();

    const searchView = page.getByTestId("session-search-view");
    await expect(searchView).toBeVisible();
    await expect(searchView.getByRole("searchbox", { name: "Search sessions" }))
      .toBeFocused();
    await expect(searchView.locator(".ant-skeleton")).toBeVisible();
    await expect(searchView.getByRole("option")).toHaveCount(0);
    await expectNoDocumentScroll(
      page,
      "search loading state should stay inside the fixed shell",
    );
    await page.screenshot({
      path: screenshotPath("v2-session-search-loading.png", SCREENSHOT_FOLDER),
    });

    releasePendingInitialLoadRequests(state);
    await expect(searchView.getByText("Recent sessions")).toBeVisible();
    await expect(searchView.locator(".ant-skeleton")).toHaveCount(0);

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
  } finally {
    releasePendingInitialLoadRequests(state);
    await appServer.close();
  }
});

async function handleSearchApi(
  context: MockApiRouteContext,
  state: SearchViewState,
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  if (context.path === "/workspaces") {
    await context.fulfillJson(state.workspaces);
    return true;
  }
  if (context.path === "/sessions/sidebar") {
    if (state.slowInitialLoad) {
      state.slowInitialLoad = false;
      await new Promise<void>((resolve) => {
        state.releaseInitialLoadRequests.push(resolve);
      });
    }
    await context.fulfillJson(state.sessions);
    return true;
  }
  const workspaceSessionsMatch = context.path.match(
    /^\/workspaces\/([^/]+)\/sessions\/sidebar$/,
  );
  if (workspaceSessionsMatch !== null) {
    const workspaceId = decodeURIComponent(workspaceSessionsMatch[1] ?? "");
    await context.fulfillJson({
      has_more: false,
      items: state.sessions.filter((session) => session.workspace_id === workspaceId),
      next_cursor: null,
    });
    return true;
  }
  const sessionMatch = context.path.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionMatch === null) {
    return false;
  }
  const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
  const leaf = sessionMatch[2];
  const session = state.sessions.find((candidate) => candidate.session_id === sessionId);
  if (session === undefined) {
    return false;
  }
  if (leaf === undefined) {
    state.selectedSessionRequests.push(sessionId);
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
  if (leaf === "agents" || leaf === "tasks" || leaf === "subagents") {
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
  return false;
}

function releasePendingInitialLoadRequests(state: SearchViewState): void {
  for (const release of state.releaseInitialLoadRequests.splice(0)) {
    release();
  }
}

function sessionDetail(session: SearchSessionRecord): Record<string, unknown> {
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

function sessionMessages(sessionId: string): Record<string, unknown>[] {
  if (sessionId === TARGET_SESSION_ID) {
    return [
      timelineTextMessage(
        "search-target-user",
        "user",
        "Open the release handoff session",
      ),
      timelineTextMessage(
        "search-target-assistant",
        "assistant",
        "Release session opened marker",
      ),
    ];
  }
  if (sessionId === OTHER_SESSION_ID) {
    return [
      timelineTextMessage("search-alpha-user", "user", "Alpha prompt"),
      timelineTextMessage("search-alpha-assistant", "assistant", "Alpha body marker"),
    ];
  }
  return [
    timelineTextMessage("search-current-user", "user", "Current prompt"),
    timelineTextMessage(
      "search-current-assistant",
      "assistant",
      "Current session body marker",
    ),
  ];
}

function timelineTextMessage(
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
