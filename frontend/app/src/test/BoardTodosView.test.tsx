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
  listBoardTodos,
  previewStartBoardTodo,
  startBoardTodo,
  syncBoardTodos,
} from "../api/client";
import type {
  BoardTodoBoardResponse,
  BoardTodoItem,
  WorkspaceRecord,
} from "../api/contracts";
import { BoardTodosView } from "../features/boards/BoardTodosView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  listBoardTodos: vi.fn(),
  previewStartBoardTodo: vi.fn(),
  startBoardTodo: vi.fn(),
  syncBoardTodos: vi.fn(),
}));

const listBoardTodosMock = vi.mocked(listBoardTodos);
const previewStartBoardTodoMock = vi.mocked(previewStartBoardTodo);
const startBoardTodoMock = vi.mocked(startBoardTodo);
const syncBoardTodosMock = vi.mocked(syncBoardTodos);

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

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  listBoardTodosMock.mockResolvedValue(boardResponse([todoItem, reviewItem], 7));
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BoardTodosView", () => {
  it("renders board TODO cards grouped by status", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();
    expect(screen.getByText("Implement fixed board surface")).toBeVisible();
    expect(screen.getByText("Issue #401")).toBeVisible();
    expect(screen.getByText("Review board handoff")).toBeVisible();
    expect(screen.getByText("PR #12")).toBeVisible();
    expect(screen.getByText("Revision")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(listBoardTodosMock).toHaveBeenCalledWith({
      includeArchived: false,
      workspaceId: "workspace-1",
    });
  });

  it("filters visible cards without refetching the board", async () => {
    renderView();

    expect(await screen.findByTestId("board-todo-todo-1")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search board TODOs" }), {
      target: { value: "handoff" },
    });

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
    expect(screen.getByText("8")).toBeVisible();
  });

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
    expect(await screen.findByRole("dialog", { name: "Start board TODO" }))
      .toBeVisible();
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
    expect(await screen.findByText("Queued for board todo handoff")).toBeVisible();
    expect(screen.getByText("In progress")).toBeVisible();
  });
});

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
      archived: 0,
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
