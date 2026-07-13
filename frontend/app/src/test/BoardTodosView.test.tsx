import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveBoardTodo,
  createBoardTodoSource,
  listBoardTodos,
  listBoardTodoSources,
  markBoardTodoDone,
  previewRequestChangesBoardTodo,
  previewStartBoardTodo,
  requestChangesBoardTodo,
  restoreBoardTodo,
  startBoardTodo,
  syncBoardTodos,
  updateBoardTodoSource,
} from "../api/client";
import type {
  BoardTodoBoardResponse,
  BoardTodoItem,
  BoardTodoSourceSettingsResponse,
  WorkspaceRecord,
} from "../api/contracts";
import { BoardTodosView } from "../features/boards/BoardTodosView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  archiveBoardTodo: vi.fn(),
  createBoardTodoSource: vi.fn(),
  deleteBoardTodoSource: vi.fn(),
  listBoardTodos: vi.fn(),
  listBoardTodoSources: vi.fn(),
  markBoardTodoDone: vi.fn(),
  previewRequestChangesBoardTodo: vi.fn(),
  previewStartBoardTodo: vi.fn(),
  requestChangesBoardTodo: vi.fn(),
  restoreBoardTodo: vi.fn(),
  startBoardTodo: vi.fn(),
  syncBoardTodos: vi.fn(),
  updateBoardTodoSource: vi.fn(),
}));

const archiveBoardTodoMock = vi.mocked(archiveBoardTodo);
const createBoardTodoSourceMock = vi.mocked(createBoardTodoSource);
const listBoardTodosMock = vi.mocked(listBoardTodos);
const listBoardTodoSourcesMock = vi.mocked(listBoardTodoSources);
const markBoardTodoDoneMock = vi.mocked(markBoardTodoDone);
const previewRequestChangesBoardTodoMock = vi.mocked(
  previewRequestChangesBoardTodo,
);
const previewStartBoardTodoMock = vi.mocked(previewStartBoardTodo);
const requestChangesBoardTodoMock = vi.mocked(requestChangesBoardTodo);
const restoreBoardTodoMock = vi.mocked(restoreBoardTodo);
const startBoardTodoMock = vi.mocked(startBoardTodo);
const syncBoardTodosMock = vi.mocked(syncBoardTodos);
const updateBoardTodoSourceMock = vi.mocked(updateBoardTodoSource);

const workspaces: WorkspaceRecord[] = [
  {
    display_name: "Agent Teams",
    root_path: "C:/work/agent-teams",
    workspace_id: "workspace-1",
  },
];

const todoItem: BoardTodoItem = {
  body: "Match the fixed shell and keep the board in one viewport.",
  created_at: "2026-06-24T00:00:00Z",
  issue_number: 401,
  item_revision: 2,
  repository_full_name: "openai/agent-teams",
  run_recoverable: false,
  source_key: "openai/agent-teams#401",
  source_provider: "github",
  source_type: "github_issue",
  status: "todo",
  title: "Implement fixed board surface",
  todo_id: "todo-1",
  updated_at: "2026-06-24T00:10:00Z",
  workspace_id: "workspace-1",
};

const reviewItem: BoardTodoItem = {
  body: "Review handoff prompt defaults before enabling start actions.",
  created_at: "2026-06-24T00:01:00Z",
  item_revision: 3,
  last_status_reason: "Waiting for UI parity pass",
  pull_request_number: 12,
  repository_full_name: "openai/agent-teams",
  run_recoverable: false,
  source_key: "openai/agent-teams#12",
  source_provider: "github",
  source_type: "github_pull_request",
  status: "review",
  title: "Review board handoff",
  todo_id: "todo-2",
  updated_at: "2026-06-24T00:20:00Z",
  workspace_id: "workspace-1",
};

const syncedItem: BoardTodoItem = {
  ...todoItem,
  status: "done",
  title: "Board sync completed",
  todo_id: "todo-3",
  updated_at: "2026-06-24T00:30:00Z",
};

const doneItem: BoardTodoItem = {
  ...todoItem,
  body: "Archive the completed board item from the active board.",
  item_revision: 3,
  issue_number: 402,
  status: "done",
  title: "Archive completed board TODO",
  todo_id: "todo-3",
  updated_at: "2026-06-24T00:30:00Z",
};

const archivedItem: BoardTodoItem = {
  ...doneItem,
  archived_at: "2026-06-24T00:40:00Z",
  item_revision: 4,
  last_status_reason: "Archived after completion",
  status: "archived",
};

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  listBoardTodosMock.mockResolvedValue(
    boardResponse([todoItem, reviewItem, doneItem], 7),
  );
  listBoardTodoSourcesMock.mockResolvedValue(sourceSettingsResponse());
  archiveBoardTodoMock.mockResolvedValue(archivedItem);
  createBoardTodoSourceMock.mockResolvedValue({
    created_at: "2026-06-24T00:00:00Z",
    display_name: "Agent Teams triage",
    enabled: true,
    kind: "github_issues",
    provider: "github",
    repository_full_name: "openai/agent-teams-triage",
    source_id: "source-2",
    system_managed: false,
    updated_at: "2026-06-24T00:00:00Z",
    workspace_id: "workspace-1",
  });
  markBoardTodoDoneMock.mockResolvedValue({
    ...reviewItem,
    item_revision: 5,
    last_status_reason: "Review accepted",
    status: "done",
  });
  previewRequestChangesBoardTodoMock.mockResolvedValue({
    board_workspace_id: "workspace-1",
    concurrency: {
      runtime_target_active: 0,
      runtime_target_limit: 1,
      source_workspace_active: 0,
      source_workspace_limit: 2,
    },
    diagnostics: [],
    execution_policy: "current_workspace",
    execution_workspace_preview: null,
    is_fork_view: false,
    prompt: "Preview prompt for board change request",
    queue_preview: {
      queue_if_full: true,
      slot_available: true,
      will_queue: false,
    },
    runtime_target_id: null,
    template_kind: "request_changes",
    template_source: "built_in",
    thinking: { enabled: false, effort: null },
    todo_id: "todo-2",
    view_workspace_id: "workspace-1",
    yolo: true,
  });
  requestChangesBoardTodoMock.mockResolvedValue({
    ...reviewItem,
    item_revision: 6,
    last_status_reason: "Queued board change request",
    run_id: "run-board-changes-1",
    session_id: "session-board-changes-1",
    status: "in_progress",
  });
  restoreBoardTodoMock.mockResolvedValue({
    ...archivedItem,
    archived_at: null,
    item_revision: 5,
    last_status_reason: "Restored from archive",
    status: "todo",
  });
  previewStartBoardTodoMock.mockResolvedValue({
    board_workspace_id: "workspace-1",
    concurrency: {
      runtime_target_active: 0,
      runtime_target_limit: 1,
      source_workspace_active: 0,
      source_workspace_limit: 2,
    },
    diagnostics: [],
    execution_policy: "fork_git_worktree",
    execution_workspace_preview: {
      display_name: "Agent Teams fork",
      policy: "fork_git_worktree",
      source_workspace_id: "workspace-1",
      workspace_id: "workspace-1-fork",
    },
    is_fork_view: false,
    prompt: "Preview prompt for board handoff",
    queue_preview: {
      queue_if_full: true,
      slot_available: true,
      will_queue: false,
    },
    runtime_target_id: null,
    template_kind: "start",
    template_source: "built_in",
    thinking: { enabled: false, effort: null },
    todo_id: "todo-1",
    view_workspace_id: "workspace-1",
    yolo: true,
  });
  startBoardTodoMock.mockResolvedValue({
    ...todoItem,
    item_revision: 4,
    last_status_reason: "Queued for board todo handoff",
    run_id: "run-board-1",
    session_id: "session-board-1",
    status: "in_progress",
  });
  syncBoardTodosMock.mockResolvedValue(boardResponse([syncedItem], 8));
  updateBoardTodoSourceMock.mockResolvedValue({
    created_at: "2026-06-24T00:00:00Z",
    display_name: "GitHub issues updated",
    enabled: false,
    kind: "github_issues",
    provider: "github",
    repository_full_name: "openai/agent-teams",
    source_id: "source-1",
    system_managed: false,
    updated_at: "2026-06-24T00:05:00Z",
    workspace_id: "workspace-1",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BoardTodosView", () => {
  it("uses source type semantics when provider identifiers are renamed or unknown", async () => {
    const manualItem = {
      ...todoItem,
      issue_number: undefined,
      repository_full_name: undefined,
      source_key: "manual-entry",
      source_provider: "renamed-board-adapter",
      source_type: "manual",
      title: "Manual board task",
      todo_id: "todo-manual",
    } as unknown as BoardTodoItem;
    const futureItem = {
      ...manualItem,
      source_key: "future-source-reference",
      source_type: "future_source_kind",
      title: "Future source task",
      todo_id: "todo-future",
    } as unknown as BoardTodoItem;
    listBoardTodosMock.mockResolvedValue(
      boardResponse([manualItem, futureItem], 2),
    );

    renderView();

    expect(await screen.findByText("Manual")).toBeVisible();
    expect(screen.getByText("future-source-reference")).toBeVisible();
  });

  it("renders board TODO cards grouped by status", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();
    expect(screen.getByText("Implement fixed board surface")).toBeVisible();
    expect(screen.getByText("Issue #401")).toBeVisible();
    expect(screen.getByText("Review board handoff")).toBeVisible();
    expect(screen.getByText("PR #12")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/Showing\s+3/);
    expect(screen.queryByText("Revision")).not.toBeInTheDocument();
    expect(
      document.querySelector(".at-board-overview"),
    ).not.toBeInTheDocument();
    expect(listBoardTodosMock).toHaveBeenCalledWith({
      includeArchived: false,
      workspaceId: "workspace-1",
    });
  });

  it("keeps secondary card metadata collapsed until requested", async () => {
    renderView();

    const card = await screen.findByTestId("board-todo-todo-1");
    expect(within(card).getByText("Issue #401")).toBeVisible();
    expect(
      within(card).getByText(
        "Match the fixed shell and keep the board in one viewport.",
      ),
    ).not.toBeVisible();

    fireEvent.click(
      within(card)
        .getByText(/Updated/)
        .closest("summary") as HTMLElement,
    );
    expect(
      within(card).getByText(
        "Match the fixed shell and keep the board in one viewport.",
      ),
    ).toBeVisible();
    expect(within(card).getByText("openai/agent-teams")).toBeVisible();
  });

  it("filters visible cards without refetching the board", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search board TODOs" }),
      {
        target: { value: "handoff" },
      },
    );

    expect(screen.queryByTestId("board-todo-todo-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("board-todo-todo-2")).toBeVisible();
    expect(listBoardTodosMock).toHaveBeenCalledTimes(1);
  });

  it("syncs the current workspace and replaces board data", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Sync board" }));

    await waitFor(() =>
      expect(syncBoardTodosMock).toHaveBeenCalledWith({
        includeArchived: false,
        workspaceId: "workspace-1",
      }),
    );
    expect(await screen.findByText("Board sync completed")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/Showing\s+1/);
  });

  it("opens board source settings and saves source changes", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Board sources" }));

    const drawer = await screen.findByRole("dialog", { name: "Board sources" });
    expect(
      await within(drawer).findByText("GitHub issues"),
    ).toBeInTheDocument();
    expect(within(drawer).getByText("openai/agent-teams")).toBeInTheDocument();
    expect(listBoardTodoSourcesMock).toHaveBeenCalledWith("workspace-1");

    fireEvent.click(
      within(drawer).getByRole("button", { name: "Edit source" }),
    );
    fireEvent.change(within(drawer).getByLabelText("Name"), {
      target: { value: "GitHub issues updated" },
    });
    fireEvent.click(within(drawer).getByRole("switch", { name: "Enabled" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateBoardTodoSourceMock).toHaveBeenCalledWith("source-1", {
        display_name: "GitHub issues updated",
        enabled: false,
        repository_full_name: "openai/agent-teams",
        workspace_id: "workspace-1",
      }),
    );

    fireEvent.click(within(drawer).getByRole("button", { name: "Add source" }));
    fireEvent.change(within(drawer).getByLabelText("Name"), {
      target: { value: "Agent Teams triage" },
    });
    fireEvent.change(within(drawer).getByLabelText("Repository"), {
      target: { value: "openai/agent-teams-triage" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createBoardTodoSourceMock).toHaveBeenCalledWith({
        display_name: "Agent Teams triage",
        enabled: true,
        kind: "github_issues",
        repository_full_name: "openai/agent-teams-triage",
        workspace_id: "workspace-1",
      }),
    );
  }, 15000);

  it("previews and starts a board TODO handoff from the card drawer", async () => {
    renderView();

    const card = await screen.findByTestId("board-todo-todo-1");
    fireEvent.click(
      within(card).getByRole("button", { name: "Start handoff" }),
    );

    await waitFor(() =>
      expect(previewStartBoardTodoMock).toHaveBeenCalledWith("todo-1", {
        queue_if_full: true,
        view_workspace_id: "workspace-1",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Start board TODO" }),
    ).toBeInTheDocument();
    const finalPrompt = await screen.findByLabelText("Final prompt");
    expect(finalPrompt).toHaveValue("Preview prompt for board handoff");

    fireEvent.change(finalPrompt, {
      target: { value: "Final prompt from reviewer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(startBoardTodoMock).toHaveBeenCalledWith("todo-1", {
        execution_policy: "fork_git_worktree",
        final_prompt: "Final prompt from reviewer",
        normal_root_role_id: null,
        orchestration_preset_id: null,
        queue_if_full: true,
        runtime_target_id: null,
        session_mode: null,
        thinking: { enabled: false, effort: null },
        view_workspace_id: "workspace-1",
        yolo: true,
      }),
    );
    const updatedCard = await screen.findByTestId("board-todo-todo-1");
    expandBoardCardDetails(updatedCard);
    expect(
      await within(updatedCard).findByText("Queued for board todo handoff"),
    ).toBeVisible();
    expect(screen.getByText("In progress")).toBeVisible();
  });

  it("previews and requests changes from a review card drawer", async () => {
    renderView();

    const card = await screen.findByTestId("board-todo-todo-2");
    fireEvent.click(
      within(card).getByRole("button", { name: "Request changes" }),
    );

    const drawer = await screen.findByRole("dialog", {
      name: "Request board changes",
    });
    const feedback = within(drawer).getByLabelText("Feedback");
    fireEvent.change(feedback, {
      target: { value: "Please tighten the board action copy." },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Preview request" }),
    );

    await waitFor(() =>
      expect(previewRequestChangesBoardTodoMock).toHaveBeenCalledWith(
        "todo-2",
        {
          feedback: "Please tighten the board action copy.",
          queue_if_full: true,
          view_workspace_id: "workspace-1",
        },
      ),
    );
    const finalPrompt = await within(drawer).findByLabelText("Final prompt");
    expect(finalPrompt).toHaveValue("Preview prompt for board change request");

    fireEvent.change(finalPrompt, {
      target: { value: "Final board change request prompt" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Request changes" }),
    );

    await waitFor(() =>
      expect(requestChangesBoardTodoMock).toHaveBeenCalledWith("todo-2", {
        execution_policy: "current_workspace",
        feedback: "Please tighten the board action copy.",
        final_prompt: "Final board change request prompt",
        queue_if_full: true,
        runtime_target_id: null,
        thinking: { enabled: false, effort: null },
        view_workspace_id: "workspace-1",
        yolo: true,
      }),
    );
    const updatedCard = await screen.findByTestId("board-todo-todo-2");
    expandBoardCardDetails(updatedCard);
    expect(
      await within(updatedCard).findByText("Queued board change request"),
    ).toBeVisible();
    expect(screen.getByText("In progress")).toBeVisible();
  });

  it("marks review cards done and archives done cards after confirmation", async () => {
    renderView();

    const reviewCard = await screen.findByTestId("board-todo-todo-2");
    fireEvent.click(
      within(reviewCard).getByRole("button", { name: "Mark done" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));

    await waitFor(() =>
      expect(markBoardTodoDoneMock).toHaveBeenCalledWith("todo-2"),
    );
    const acceptedCard = await screen.findByTestId("board-todo-todo-2");
    expandBoardCardDetails(acceptedCard);
    expect(
      await within(acceptedCard).findByText("Review accepted"),
    ).toBeVisible();

    const doneCard = await screen.findByTestId("board-todo-todo-3");
    fireEvent.click(within(doneCard).getByRole("button", { name: "Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));

    await waitFor(() =>
      expect(archiveBoardTodoMock).toHaveBeenCalledWith("todo-3"),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("board-todo-todo-3")).not.toBeInTheDocument(),
    );
  });
});

function expandBoardCardDetails(card: HTMLElement): void {
  const details = card.querySelector(".at-board-card-details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("Board card details were not rendered.");
  }
  if (!details.open) {
    fireEvent.click(details.querySelector("summary") as HTMLElement);
  }
}

function boardResponse(
  items: BoardTodoItem[],
  revision: number,
): BoardTodoBoardResponse {
  return {
    board_workspace_id: "workspace-1",
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
      archived: items.filter((item) => item.status === "archived").length,
      done: items.filter((item) => item.status === "done").length,
      in_progress: items.filter((item) => item.status === "in_progress").length,
      review: items.filter((item) => item.status === "review").length,
      todo: items.filter((item) => item.status === "todo").length,
    },
    synced_at: "2026-06-24T00:00:00Z",
    view_workspace_id: "workspace-1",
    workspace_id: "workspace-1",
  };
}

function sourceSettingsResponse(): BoardTodoSourceSettingsResponse {
  return {
    board_workspace_id: "workspace-1",
    diagnostics: [],
    is_fork_view: false,
    sources: [
      {
        source: {
          created_at: "2026-06-24T00:00:00Z",
          display_name: "GitHub issues",
          enabled: true,
          kind: "github_issues",
          provider: "github",
          repository_full_name: "openai/agent-teams",
          source_id: "source-1",
          system_managed: false,
          updated_at: "2026-06-24T00:00:00Z",
          workspace_id: "workspace-1",
        },
        state: {
          last_diagnostics: [],
          last_sync_finished_at: "2026-06-24T00:00:00Z",
          last_sync_started_at: "2026-06-23T23:59:00Z",
          last_sync_status: "succeeded",
          source_id: "source-1",
          sync_cursor: "cursor-1",
          workspace_id: "workspace-1",
        },
      },
    ],
    view_workspace_id: "workspace-1",
    workspace_id: "workspace-1",
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <BoardTodosView
            loadingWorkspaces={false}
            onWorkspaceSelected={vi.fn()}
            selectedWorkspaceId="workspace-1"
            workspaces={workspaces}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
