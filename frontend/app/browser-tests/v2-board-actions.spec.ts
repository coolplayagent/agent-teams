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
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-board-actions";

interface BoardActionState {
  boardHandoffPreviewPayloads: Record<string, unknown>[];
  boardHandoffStartPayloads: Record<string, unknown>[];
  boardHandoffStarted: boolean;
  boardRequestChangesPayloads: Record<string, unknown>[];
  boardRequestChangesPreviewPayloads: Record<string, unknown>[];
  boardRequestChangesStarted: boolean;
  boardSourceCreatePayloads: Record<string, unknown>[];
  boardSourceCreated: boolean;
  boardSourceDeleteRequests: string[];
  boardSourceDeleted: boolean;
  boardSourceDisplayName: string;
  boardSourceEnabled: boolean;
  boardSourceUpdatePayloads: Record<string, unknown>[];
  boardSyncPayloads: Record<string, unknown>[];
  requestedPaths: string[];
  requestedUrls: string[];
}

test("filters Board cards and reveals archived status groups", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = boardActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBoardActionApi(context, state),
      sessionTitle: "TS board filters",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const boardView = await openBoardView(page);

    await expect(boardView.getByTestId("board-todo-todo-v2-shell")).toBeVisible();
    await expect(boardView.getByTestId("board-todo-todo-v2-review")).toBeVisible();
    await expect(boardView.getByTestId("board-todo-todo-v2-done")).toBeVisible();
    await expect(boardView.getByRole("heading", { exact: true, name: "Archived" }))
      .toHaveCount(0);
    await expect(boardView.locator(".at-board-scope")).toContainText("Showing");
    await expect(boardView.locator(".at-board-scope")).toContainText("Sources");
    await expect(boardView.locator(".at-board-scope")).toContainText("1");

    await boardView
      .getByRole("searchbox", { name: "Search board TODOs" })
      .fill("review");
    await expect(boardView.getByTestId("board-todo-todo-v2-review")).toBeVisible();
    await expect(boardView.getByTestId("board-todo-todo-v2-shell")).toHaveCount(0);
    await expect(boardView.getByTestId("board-todo-todo-v2-done")).toHaveCount(0);
    await expect(
      boardView.locator(".at-board-column.is-review .at-board-column-header"),
    ).toContainText("1");
    await page.screenshot({
      path: screenshotPath("v2-board-filtered-review.png", SCREENSHOT_FOLDER),
    });

    await boardView
      .getByRole("searchbox", { name: "Search board TODOs" })
      .fill("");
    await boardView.getByText("Include archived").click();
    await expect(boardView.getByRole("heading", { exact: true, name: "Archived" }))
      .toBeVisible();
    await expect(boardView.getByTestId("board-todo-todo-v2-archived"))
      .toBeVisible();
    await expect(
      boardView.getByTestId("board-todo-todo-v2-archived")
        .getByRole("button", { name: "Restore" }),
    ).toBeVisible();
    await expect
      .poll(() => state.requestedUrls)
      .toContain(`/boards/todos?workspace_id=${WORKSPACE_ID}&include_archived=true`);
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 board filters and archived groups should stay framed",
    );
    await page.screenshot({
      path: screenshotPath("v2-board-archived-visible.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("syncs the Board view through the real endpoint", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const state = boardActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBoardActionApi(context, state),
      sessionTitle: "TS board sync",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const boardView = await openBoardView(page);

    await expect(boardView.getByTestId("board-todo-todo-v2-shell")).toBeVisible();
    await expect(boardView.getByText("Revision")).toBeVisible();
    await expect(boardView.getByText("9")).toBeVisible();

    await page.getByRole("button", { name: "Sync board" }).click();

    await expect(boardView.getByTestId("board-todo-todo-v2-synced"))
      .toBeVisible();
    await expect(boardView.getByText("Board sync updated the module action"))
      .toBeVisible();
    await expect(boardView.getByText("10")).toBeVisible();
    expect(state.boardSyncPayloads).toEqual([
      {
        include_archived: false,
        workspace_id: WORKSPACE_ID,
      },
    ]);
    expect(state.requestedPaths).toContain("/boards/todos:sync");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 board sync should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-board-sync.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("previews and starts a Board handoff through the real endpoints", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = boardActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBoardActionApi(context, state),
      sessionTitle: "TS board handoff",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const boardView = await openBoardView(page);

    const todoCard = boardView.getByTestId("board-todo-todo-v2-shell");
    await expect(todoCard).toBeVisible();
    await todoCard.getByRole("button", { name: "Start handoff" }).click();

    const drawer = page.getByRole("dialog", { name: "Start board TODO" });
    await expect(drawer).toBeVisible();
    const finalPrompt = drawer.getByLabel("Final prompt");
    await expect(finalPrompt).toHaveValue("Previewed board handoff prompt");
    await finalPrompt.fill("Final browser board handoff prompt");
    await drawer.getByRole("button", { name: "Start" }).click();

    await expect(page.getByText("Board handoff started.")).toBeVisible();
    await expect(todoCard.getByText("Queued for board todo handoff")).toBeVisible();
    await expect(todoCard.getByText("running")).toBeVisible();
    await expect(drawer).toBeHidden();
    expect(state.boardHandoffPreviewPayloads).toEqual([
      {
        queue_if_full: true,
        view_workspace_id: WORKSPACE_ID,
      },
    ]);
    expect(state.boardHandoffStartPayloads).toEqual([
      {
        execution_policy: "fork_git_worktree",
        final_prompt: "Final browser board handoff prompt",
        normal_root_role_id: null,
        orchestration_preset_id: null,
        queue_if_full: true,
        runtime_target_id: null,
        session_mode: null,
        thinking: { enabled: false, effort: null },
        view_workspace_id: WORKSPACE_ID,
        yolo: true,
      },
    ]);
    expect(state.requestedPaths).toContain(
      "/boards/todos/todo-v2-shell:preview-start",
    );
    expect(state.requestedPaths).toContain("/boards/todos/todo-v2-shell:start");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 board handoff should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-board-handoff-started.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("previews and requests Board changes through the real endpoints", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = boardActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBoardActionApi(context, state),
      sessionTitle: "TS board request changes",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const boardView = await openBoardView(page);

    const reviewCard = boardView.getByTestId("board-todo-todo-v2-review");
    await expect(reviewCard).toBeVisible();
    await reviewCard.getByRole("button", { name: "Request changes" }).click();

    const drawer = page.getByRole("dialog", { name: "Request board changes" });
    await expect(drawer).toBeVisible();
    await drawer
      .getByLabel("Feedback")
      .fill("Tighten the board card action flow.");
    await drawer.getByRole("button", { name: "Preview request" }).click();

    const finalPrompt = drawer.getByLabel("Final prompt");
    await expect(finalPrompt).toHaveValue(
      "Previewed board request changes prompt",
    );
    await finalPrompt.fill("Final browser board request changes prompt");
    await drawer.getByRole("button", { name: "Request changes" }).click();

    await expect(page.getByText("Board change request queued.")).toBeVisible();
    await expect(
      reviewCard.getByText("Queued board change request from browser"),
    ).toBeVisible();
    await expect(reviewCard.getByText("running")).toBeVisible();
    await expect(drawer).toBeHidden();
    expect(state.boardRequestChangesPreviewPayloads).toEqual([
      {
        feedback: "Tighten the board card action flow.",
        queue_if_full: true,
        view_workspace_id: WORKSPACE_ID,
      },
    ]);
    expect(state.boardRequestChangesPayloads).toEqual([
      {
        execution_policy: "current_workspace",
        feedback: "Tighten the board card action flow.",
        final_prompt: "Final browser board request changes prompt",
        queue_if_full: true,
        runtime_target_id: null,
        thinking: { enabled: false, effort: null },
        view_workspace_id: WORKSPACE_ID,
        yolo: true,
      },
    ]);
    expect(state.requestedPaths).toContain(
      "/boards/todos/todo-v2-review:preview-request-changes",
    );
    expect(state.requestedPaths).toContain(
      "/boards/todos/todo-v2-review:request-changes",
    );
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 board request changes should stay framed",
    );
    await page.screenshot({
      path: screenshotPath("v2-board-request-changes.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

test("edits, creates, and deletes Board sources through the real endpoints", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = boardActionState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleBoardActionApi(context, state),
      sessionTitle: "TS board sources",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    const boardView = await openBoardView(page);

    await expect(boardView.getByTestId("board-todo-todo-v2-shell")).toBeVisible();
    await boardView.getByRole("button", { name: "Board sources" }).click();

    const drawer = page.getByRole("dialog", { name: "Board sources" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("GitHub issues", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Edit source" }).click();
    await drawer.getByLabel("Name").fill("GitHub issues browser");
    await drawer.getByRole("switch", { name: "Enabled" }).click();
    await drawer.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Board source saved.")).toBeVisible();
    await expect(drawer.getByText("GitHub issues browser")).toBeVisible();

    await drawer.getByRole("button", { name: "Add source" }).click();
    await drawer.getByLabel("Name").fill("Agent Teams triage");
    await drawer.getByLabel("Repository").fill("openai/agent-teams-triage");
    await drawer.getByRole("button", { name: "Create" }).click();

    await expect(drawer.getByText("Agent Teams triage")).toBeVisible();

    await drawer.getByRole("button", { name: "Delete source" }).first().click();
    await page.getByRole("button", { name: "OK" }).click();

    await expect(page.getByText("Board source deleted.")).toBeVisible();
    expect(state.boardSourceUpdatePayloads).toEqual([
      {
        display_name: "GitHub issues browser",
        enabled: false,
        repository_full_name: "openai/agent-teams",
        workspace_id: WORKSPACE_ID,
      },
    ]);
    expect(state.boardSourceCreatePayloads).toEqual([
      {
        display_name: "Agent Teams triage",
        enabled: true,
        kind: "github_issues",
        repository_full_name: "openai/agent-teams-triage",
        workspace_id: WORKSPACE_ID,
      },
    ]);
    expect(state.boardSourceDeleteRequests).toEqual(["source-1"]);
    expect(state.requestedPaths).toContain("/boards/todo-sources");
    expect(state.requestedPaths).toContain("/boards/todo-sources/source-1");
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(page, "v2 board source settings should stay framed");
    await page.screenshot({
      path: screenshotPath("v2-board-source-settings.png", SCREENSHOT_FOLDER),
    });
  } finally {
    await appServer.close();
  }
});

async function openBoardView(page: Page): Promise<Locator> {
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Board" })
    .click();
  const boardView = page.getByTestId("board-todos-view");
  await expect(boardView).toBeVisible();
  return boardView;
}

function boardActionState(): BoardActionState {
  return {
    boardHandoffPreviewPayloads: [],
    boardHandoffStartPayloads: [],
    boardHandoffStarted: false,
    boardRequestChangesPayloads: [],
    boardRequestChangesPreviewPayloads: [],
    boardRequestChangesStarted: false,
    boardSourceCreatePayloads: [],
    boardSourceCreated: false,
    boardSourceDeleteRequests: [],
    boardSourceDeleted: false,
    boardSourceDisplayName: "GitHub issues",
    boardSourceEnabled: true,
    boardSourceUpdatePayloads: [],
    boardSyncPayloads: [],
    requestedPaths: [],
    requestedUrls: [],
  };
}

async function handleBoardActionApi(
  context: MockApiRouteContext,
  state: BoardActionState,
): Promise<boolean> {
  state.requestedPaths.push(context.path);
  state.requestedUrls.push(`${context.path}${context.url.search}`);
  const method = context.method;
  const path = context.path;
  if (method === "GET" && path === "/boards/todos") {
    await context.fulfillJson(
      boardResponse(
        state,
        context.url.searchParams.get("include_archived") === "true",
      ),
    );
    return true;
  }
  if (method === "GET" && path === "/boards/todo-sources") {
    await context.fulfillJson(boardSourceSettings(state));
    return true;
  }
  if (method === "POST" && path === "/boards/todos:sync") {
    state.boardSyncPayloads.push(readJsonBody(context));
    await context.fulfillJson(boardSyncedResponse());
    return true;
  }
  if (
    method === "POST"
    && path === "/boards/todos/todo-v2-shell:preview-start"
  ) {
    state.boardHandoffPreviewPayloads.push(readJsonBody(context));
    await context.fulfillJson(boardHandoffPreview());
    return true;
  }
  if (method === "POST" && path === "/boards/todos/todo-v2-shell:start") {
    state.boardHandoffStartPayloads.push(readJsonBody(context));
    state.boardHandoffStarted = true;
    await context.fulfillJson(boardHandoffStartedItem());
    return true;
  }
  if (
    method === "POST"
    && path === "/boards/todos/todo-v2-review:preview-request-changes"
  ) {
    state.boardRequestChangesPreviewPayloads.push(readJsonBody(context));
    await context.fulfillJson(boardRequestChangesPreview());
    return true;
  }
  if (
    method === "POST"
    && path === "/boards/todos/todo-v2-review:request-changes"
  ) {
    state.boardRequestChangesPayloads.push(readJsonBody(context));
    state.boardRequestChangesStarted = true;
    await context.fulfillJson(boardRequestChangesStartedItem());
    return true;
  }
  if (method === "POST" && path === "/boards/todo-sources") {
    const payload = readJsonBody(context);
    state.boardSourceCreatePayloads.push(payload);
    state.boardSourceCreated = true;
    await context.fulfillJson(boardSourceView(state, "source-created").source);
    return true;
  }
  if (method === "PATCH" && path === "/boards/todo-sources/source-1") {
    const payload = readJsonBody(context);
    state.boardSourceUpdatePayloads.push(payload);
    state.boardSourceDisplayName = String(
      payload.display_name ?? state.boardSourceDisplayName,
    );
    state.boardSourceEnabled = Boolean(
      payload.enabled ?? state.boardSourceEnabled,
    );
    await context.fulfillJson(boardSourceView(state, "source-1").source);
    return true;
  }
  if (method === "DELETE" && path === "/boards/todo-sources/source-1") {
    state.boardSourceDeleteRequests.push("source-1");
    state.boardSourceDeleted = true;
    await context.fulfillJson({ deleted: true, source_id: "source-1" });
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

function boardResponse(
  state: BoardActionState,
  includeArchived = false,
): Record<string, unknown> {
  const item = state.boardHandoffStarted
    ? boardHandoffStartedItem()
    : {
        body: "Keep module pages reachable from the fixed shell.",
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
  const reviewItem = state.boardRequestChangesStarted
    ? boardRequestChangesStartedItem()
    : boardReviewItem();
  return boardResponseItems(
    [
      item,
      reviewItem,
      boardDoneItem(),
      ...(includeArchived ? [boardArchivedItem()] : []),
    ],
    9,
    "2026-06-25T08:11:00Z",
  );
}

function boardHandoffPreview(): Record<string, unknown> {
  return {
    board_workspace_id: WORKSPACE_ID,
    concurrency: concurrencySnapshot(),
    diagnostics: [],
    execution_policy: "fork_git_worktree",
    execution_workspace_preview: {
      display_name: "Agent Teams fork",
      policy: "fork_git_worktree",
      source_workspace_id: WORKSPACE_ID,
      workspace_id: "workspace-v2-shell-fork",
    },
    is_fork_view: false,
    prompt: "Previewed board handoff prompt",
    queue_preview: {
      queue_if_full: true,
      slot_available: true,
      will_queue: false,
    },
    runtime_target_id: null,
    template_kind: "start",
    template_source: "built_in",
    thinking: { enabled: false, effort: null },
    todo_id: "todo-v2-shell",
    view_workspace_id: WORKSPACE_ID,
    yolo: true,
  };
}

function boardHandoffStartedItem(): Record<string, unknown> {
  return {
    body: "Keep module pages reachable from the fixed shell.",
    created_at: "2026-06-25T08:00:00Z",
    execution_workspace_id: "workspace-v2-shell-fork",
    issue_number: 401,
    item_revision: 4,
    last_status_reason: "Queued for board todo handoff",
    repository_full_name: "openai/agent-teams",
    run_id: "run-board-v2-shell",
    run_recoverable: false,
    run_status: "running",
    session_id: "session-board-v2-shell",
    source_key: "openai/agent-teams#401",
    source_provider: "github",
    source_type: "github_issue",
    status: "in_progress",
    title: "Keep module pages reachable",
    todo_id: "todo-v2-shell",
    updated_at: "2026-06-25T08:24:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function boardReviewItem(): Record<string, unknown> {
  return {
    body: "Review the module page actions before handoff.",
    created_at: "2026-06-25T08:03:00Z",
    item_revision: 3,
    last_status_reason: "Waiting for reviewer changes",
    pull_request_number: 17,
    repository_full_name: "openai/agent-teams",
    run_recoverable: false,
    source_key: "openai/agent-teams#17",
    source_provider: "github",
    source_type: "github_pull_request",
    status: "review",
    title: "Review board request changes",
    todo_id: "todo-v2-review",
    updated_at: "2026-06-25T08:14:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function boardRequestChangesPreview(): Record<string, unknown> {
  return {
    board_workspace_id: WORKSPACE_ID,
    concurrency: concurrencySnapshot(),
    diagnostics: [],
    execution_policy: "current_workspace",
    execution_workspace_preview: null,
    is_fork_view: false,
    prompt: "Previewed board request changes prompt",
    queue_preview: {
      queue_if_full: true,
      slot_available: true,
      will_queue: false,
    },
    runtime_target_id: null,
    template_kind: "request_changes",
    template_source: "built_in",
    thinking: { enabled: false, effort: null },
    todo_id: "todo-v2-review",
    view_workspace_id: WORKSPACE_ID,
    yolo: true,
  };
}

function boardRequestChangesStartedItem(): Record<string, unknown> {
  return {
    ...boardReviewItem(),
    item_revision: 4,
    last_status_reason: "Queued board change request from browser",
    run_id: "run-board-v2-review",
    run_status: "running",
    session_id: "session-board-v2-review",
    status: "in_progress",
    updated_at: "2026-06-25T08:27:00Z",
  };
}

function boardDoneItem(): Record<string, unknown> {
  return {
    body: "Completed board work can be archived from the module page.",
    created_at: "2026-06-25T08:05:00Z",
    issue_number: 403,
    item_revision: 2,
    repository_full_name: "openai/agent-teams",
    run_recoverable: false,
    source_key: "openai/agent-teams#403",
    source_provider: "github",
    source_type: "github_issue",
    status: "done",
    title: "Archive completed board action",
    todo_id: "todo-v2-done",
    updated_at: "2026-06-25T08:12:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function boardArchivedItem(): Record<string, unknown> {
  return {
    archived_at: "2026-06-25T08:13:00Z",
    body: "Archived board work should stay hidden until requested.",
    created_at: "2026-06-25T08:07:00Z",
    issue_number: 404,
    item_revision: 3,
    last_status_reason: "Archived after verification",
    repository_full_name: "openai/agent-teams",
    run_recoverable: false,
    source_key: "openai/agent-teams#404",
    source_provider: "github",
    source_type: "github_issue",
    status: "archived",
    title: "Archived board verification",
    todo_id: "todo-v2-archived",
    updated_at: "2026-06-25T08:13:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function boardSyncedResponse(): Record<string, unknown> {
  const item = {
    body: "The browser flow replaced the board data after POST sync.",
    created_at: "2026-06-25T08:20:00Z",
    issue_number: 402,
    item_revision: 4,
    repository_full_name: "openai/agent-teams",
    run_recoverable: false,
    source_key: "openai/agent-teams#402",
    source_provider: "github",
    source_type: "github_issue",
    status: "done",
    title: "Board sync updated the module action",
    todo_id: "todo-v2-synced",
    updated_at: "2026-06-25T08:21:00Z",
    workspace_id: WORKSPACE_ID,
  };
  return boardResponseItems([item], 10, "2026-06-25T08:22:00Z");
}

function boardResponseItems(
  items: Record<string, unknown>[],
  revision: number,
  syncedAt: string,
): Record<string, unknown> {
  return {
    board_workspace_id: WORKSPACE_ID,
    diagnostics: [],
    is_fork_view: false,
    items,
    repository_full_name: "openai/agent-teams",
    revision,
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
      archived: statusCount(items, "archived"),
      done: statusCount(items, "done"),
      in_progress: statusCount(items, "in_progress"),
      review: statusCount(items, "review"),
      todo: statusCount(items, "todo"),
    },
    synced_at: syncedAt,
    view_workspace_id: WORKSPACE_ID,
    workspace_id: WORKSPACE_ID,
  };
}

function statusCount(items: Record<string, unknown>[], status: string): number {
  return items.filter((item) => item.status === status).length;
}

function boardSourceSettings(state: BoardActionState): Record<string, unknown> {
  const sources: Record<string, unknown>[] = [];
  if (!state.boardSourceDeleted) {
    sources.push(boardSourceView(state, "source-1"));
  }
  if (state.boardSourceCreated) {
    sources.push(boardSourceView(state, "source-created"));
  }
  return {
    board_workspace_id: WORKSPACE_ID,
    diagnostics: [],
    is_fork_view: false,
    sources,
    view_workspace_id: WORKSPACE_ID,
    workspace_id: WORKSPACE_ID,
  };
}

function boardSourceView(
  state: BoardActionState,
  sourceId: string,
): { source: Record<string, unknown>; state: Record<string, unknown> } {
  const displayName =
    sourceId === "source-created"
      ? "Agent Teams triage"
      : state.boardSourceDisplayName;
  const repository =
    sourceId === "source-created"
      ? "openai/agent-teams-triage"
      : "openai/agent-teams";
  return {
    source: {
      created_at: "2026-06-25T08:00:00Z",
      display_name: displayName,
      enabled: state.boardSourceEnabled,
      kind: "github_issues",
      provider: "github",
      repository_full_name: repository,
      source_id: sourceId,
      system_managed: false,
      updated_at: "2026-06-25T08:20:00Z",
      workspace_id: WORKSPACE_ID,
    },
    state: {
      last_diagnostics: [],
      last_sync_finished_at: "2026-06-25T08:11:00Z",
      last_sync_started_at: "2026-06-25T08:10:00Z",
      last_sync_status: "succeeded",
      source_id: sourceId,
      sync_cursor: "issue-cursor",
      workspace_id: WORKSPACE_ID,
    },
  };
}

function concurrencySnapshot(): Record<string, number> {
  return {
    runtime_target_active: 0,
    runtime_target_limit: 1,
    source_workspace_active: 0,
    source_workspace_limit: 2,
  };
}
