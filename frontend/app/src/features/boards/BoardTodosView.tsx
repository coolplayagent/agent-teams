import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  ExternalLink,
  MessageSquareReply,
  Play,
  RefreshCcw,
  RotateCw,
  Undo2,
  Search,
  SquareKanban,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  archiveBoardTodo,
  listBoardTodos,
  markBoardTodoDone,
  previewRequestChangesBoardTodo,
  previewStartBoardTodo,
  requestChangesBoardTodo,
  restoreBoardTodo,
  startBoardTodo,
  syncBoardTodos,
} from "../../api/client";
import type {
  BoardTodoBoardResponse,
  BoardTodoItem,
  BoardTodoPreviewRequestChangesResponse,
  BoardTodoPreviewStartResponse,
  BoardTodoStatus,
  BoardTodoStatusCounts,
  WorkspaceRecord,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";

const boardColumns: Array<{
  status: BoardTodoStatus;
  titleKey:
    | "boardColumnArchived"
    | "boardColumnDone"
    | "boardColumnInProgress"
    | "boardColumnReview"
    | "boardColumnTodo";
}> = [
  { status: "todo", titleKey: "boardColumnTodo" },
  { status: "in_progress", titleKey: "boardColumnInProgress" },
  { status: "review", titleKey: "boardColumnReview" },
  { status: "done", titleKey: "boardColumnDone" },
  { status: "archived", titleKey: "boardColumnArchived" },
];

export function BoardTodosView({
  loadingWorkspaces,
  onWorkspaceSelected,
  selectedWorkspaceId,
  workspaces,
}: {
  loadingWorkspaces: boolean;
  onWorkspaceSelected: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
  workspaces: WorkspaceRecord[];
}) {
  const t = useTranslations();
  const { message } = App.useApp();
  const language = useUiStore((state) => state.language);
  const queryClient = useQueryClient();
  const [handoffTarget, setHandoffTarget] = useState<BoardTodoItem | null>(null);
  const [handoffPrompt, setHandoffPrompt] = useState("");
  const [requestChangesTarget, setRequestChangesTarget] =
    useState<BoardTodoItem | null>(null);
  const [requestChangesFeedback, setRequestChangesFeedback] = useState("");
  const [requestChangesPrompt, setRequestChangesPrompt] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchText, setSearchText] = useState("");
  const workspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => ({
        label: workspaceDisplayName(workspace),
        value: workspace.workspace_id,
      })),
    [workspaces],
  );
  const activeWorkspaceId =
    selectedWorkspaceId ?? workspaceOptions[0]?.value ?? null;
  const boardQueryKey = [
    "board-todos",
    activeWorkspaceId ?? "",
    includeArchived,
  ] as const;

  const boardQuery = useQuery({
    enabled: activeWorkspaceId !== null,
    queryFn: () =>
      listBoardTodos({
        includeArchived,
        workspaceId: requireWorkspaceId(activeWorkspaceId),
      }),
    queryKey: boardQueryKey,
  });
  const syncMutation = useMutation({
    mutationFn: () =>
      syncBoardTodos({
        includeArchived,
        workspaceId: requireWorkspaceId(activeWorkspaceId),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(boardQueryKey, response);
    },
  });
  const previewHandoffMutation = useMutation({
    mutationFn: (item: BoardTodoItem) =>
      previewStartBoardTodo(item.todo_id, {
        queue_if_full: true,
        view_workspace_id: requireWorkspaceId(activeWorkspaceId),
      }),
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: (preview) => {
      setHandoffPrompt(preview.prompt);
    },
  });
  const startHandoffMutation = useMutation({
    mutationFn: () => {
      const preview = previewHandoffMutation.data;
      if (handoffTarget === null || preview === undefined) {
        throw new Error(t("boardHandoffNoPreview"));
      }
      return startBoardTodo(handoffTarget.todo_id, {
        execution_policy: preview.execution_policy,
        final_prompt: handoffPrompt,
        normal_root_role_id: preview.normal_root_role_id ?? null,
        orchestration_preset_id: preview.orchestration_preset_id ?? null,
        queue_if_full: preview.queue_preview.queue_if_full,
        runtime_target_id: preview.runtime_target_id ?? null,
        session_mode: preview.session_mode ?? null,
        thinking: preview.thinking,
        view_workspace_id: requireWorkspaceId(activeWorkspaceId),
        yolo: preview.yolo,
      });
    },
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: (item) => {
      queryClient.setQueryData<BoardTodoBoardResponse>(
        boardQueryKey,
        (current) => replaceBoardItem(current, item),
      );
      void message.success(t("boardHandoffStarted"));
      resetHandoffDrawer();
    },
  });
  const previewRequestChangesMutation = useMutation({
    mutationFn: () => {
      if (requestChangesTarget === null) {
        throw new Error(t("boardRequestChangesNoTarget"));
      }
      return previewRequestChangesBoardTodo(requestChangesTarget.todo_id, {
        feedback: requestChangesFeedback.trim(),
        queue_if_full: true,
        view_workspace_id: requireWorkspaceId(activeWorkspaceId),
      });
    },
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: (preview) => {
      setRequestChangesPrompt(preview.prompt);
    },
  });
  const requestChangesMutation = useMutation({
    mutationFn: () => {
      const preview = previewRequestChangesMutation.data;
      if (requestChangesTarget === null || preview === undefined) {
        throw new Error(t("boardRequestChangesNoPreview"));
      }
      return requestChangesBoardTodo(requestChangesTarget.todo_id, {
        execution_policy: preview.execution_policy ?? null,
        feedback: requestChangesFeedback.trim(),
        final_prompt: requestChangesPrompt,
        queue_if_full: preview.queue_preview.queue_if_full,
        runtime_target_id: preview.runtime_target_id ?? null,
        thinking: preview.thinking,
        view_workspace_id: requireWorkspaceId(activeWorkspaceId),
        yolo: preview.yolo,
      });
    },
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: (item) => {
      queryClient.setQueryData<BoardTodoBoardResponse>(
        boardQueryKey,
        (current) => replaceBoardItem(current, item, includeArchived),
      );
      void message.success(t("boardRequestChangesQueued"));
      resetRequestChangesDrawer();
    },
  });
  const statusActionMutation = useMutation({
    mutationFn: (request: BoardStatusActionRequest) => {
      if (request.action === "mark-done") {
        return markBoardTodoDone(request.item.todo_id);
      }
      if (request.action === "archive") {
        return archiveBoardTodo(request.item.todo_id);
      }
      return restoreBoardTodo(request.item.todo_id);
    },
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: (item, request) => {
      queryClient.setQueryData<BoardTodoBoardResponse>(
        boardQueryKey,
        (current) => replaceBoardItem(current, item, includeArchived),
      );
      void message.success(boardStatusActionSuccess(request.action, t));
    },
  });

  const trimmedSearchText = searchText.trim().toLowerCase();
  const visibleColumns = includeArchived
    ? boardColumns
    : boardColumns.filter((column) => column.status !== "archived");
  const rows = boardQuery.data?.items ?? [];
  const filteredRows = useMemo(
    () =>
      rows
        .filter((item) => matchesSearch(item, trimmedSearchText))
        .sort(compareBoardTodoItems),
    [rows, trimmedSearchText],
  );
  const columnItems = useMemo(
    () =>
      new Map(
        visibleColumns.map((column) => [
          column.status,
          filteredRows.filter((item) => item.status === column.status),
        ]),
      ),
    [filteredRows, visibleColumns],
  );
  const activeWorkspaceLabel =
    workspaceOptions.find((option) => option.value === activeWorkspaceId)?.label ??
    activeWorkspaceId ??
    t("boardNoWorkspace");
  const handoffPreview = previewHandoffMutation.data;
  const requestChangesPreview = previewRequestChangesMutation.data;

  function openStartHandoff(item: BoardTodoItem) {
    setHandoffTarget(item);
    setHandoffPrompt("");
    previewHandoffMutation.reset();
    startHandoffMutation.reset();
    previewHandoffMutation.mutate(item);
  }

  function closeHandoffDrawer() {
    if (previewHandoffMutation.isPending || startHandoffMutation.isPending) {
      return;
    }
    resetHandoffDrawer();
  }

  function resetHandoffDrawer() {
    setHandoffTarget(null);
    setHandoffPrompt("");
    previewHandoffMutation.reset();
    startHandoffMutation.reset();
  }

  function openRequestChanges(item: BoardTodoItem) {
    setRequestChangesTarget(item);
    setRequestChangesFeedback("");
    setRequestChangesPrompt("");
    previewRequestChangesMutation.reset();
    requestChangesMutation.reset();
  }

  function closeRequestChangesDrawer() {
    if (
      previewRequestChangesMutation.isPending
      || requestChangesMutation.isPending
    ) {
      return;
    }
    resetRequestChangesDrawer();
  }

  function resetRequestChangesDrawer() {
    setRequestChangesTarget(null);
    setRequestChangesFeedback("");
    setRequestChangesPrompt("");
    previewRequestChangesMutation.reset();
    requestChangesMutation.reset();
  }

  function updateRequestChangesFeedback(feedback: string) {
    setRequestChangesFeedback(feedback);
    setRequestChangesPrompt("");
    previewRequestChangesMutation.reset();
    requestChangesMutation.reset();
  }

  return (
    <section
      aria-label={t("boardTitle")}
      className="at-board-view"
      data-testid="board-todos-view"
    >
      <div className="at-board-toolbar">
        <div className="at-board-title">
          <span className="at-board-title-icon" aria-hidden="true">
            <SquareKanban size={18} />
          </span>
          <div>
            <Typography.Title level={3}>{t("boardTitle")}</Typography.Title>
            <Typography.Text type="secondary">
              {activeWorkspaceLabel}
            </Typography.Text>
          </div>
        </div>
        <div className="at-board-toolbar-actions">
          <Tooltip title={t("boardRefresh")}>
            <Button
              aria-label={t("boardRefresh")}
              disabled={activeWorkspaceId === null}
              icon={<RefreshCcw size={15} />}
              loading={boardQuery.isFetching && !syncMutation.isPending}
              onClick={() => void boardQuery.refetch()}
              type="text"
            />
          </Tooltip>
          <Tooltip title={t("boardSync")}>
            <Button
              aria-label={t("boardSync")}
              disabled={activeWorkspaceId === null}
              icon={<RotateCw size={15} />}
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
              type="text"
            />
          </Tooltip>
        </div>
      </div>

      <div className="at-board-content">
        <div className="at-board-controls">
          <Select
            aria-label={t("boardWorkspaceLabel")}
            className="at-board-workspace-select"
            disabled={loadingWorkspaces || workspaceOptions.length === 0}
            loading={loadingWorkspaces}
            onChange={onWorkspaceSelected}
            options={workspaceOptions}
            placeholder={t("boardWorkspacePlaceholder")}
            value={activeWorkspaceId ?? undefined}
          />
          <Input
            allowClear
            aria-label={t("boardSearchLabel")}
            className="at-board-search"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("boardSearchPlaceholder")}
            prefix={<Search aria-hidden="true" size={15} />}
            type="search"
            value={searchText}
          />
          <label className="at-board-archive-toggle">
            <Switch checked={includeArchived} onChange={setIncludeArchived} />
            <span>{t("boardIncludeArchived")}</span>
            <Archive aria-hidden="true" size={14} />
          </label>
        </div>

        {activeWorkspaceId === null && !loadingWorkspaces ? (
          <Empty
            className="at-board-empty"
            description={t("boardNoWorkspace")}
          />
        ) : null}

        {boardQuery.isError ? (
          <Alert
            message={t("boardLoadError")}
            showIcon
            type="error"
            description={errorText(boardQuery.error)}
          />
        ) : null}

        {syncMutation.isError ? (
          <Alert
            message={t("boardSyncError")}
            showIcon
            type="error"
            description={errorText(syncMutation.error)}
          />
        ) : null}

        {boardQuery.data ? (
          <BoardScopeSummary
            board={boardQuery.data}
            filteredCount={filteredRows.length}
            language={language}
          />
        ) : null}

        {boardQuery.isLoading ? (
          <div className="at-board-loading" data-testid="board-loading">
            <Skeleton active paragraph={{ rows: 8 }} title={false} />
          </div>
        ) : (
          <div
            className={
              includeArchived
                ? "at-board-columns is-archived-visible"
                : "at-board-columns"
            }
            data-testid="board-columns"
          >
            {visibleColumns.map((column) => {
              const items = columnItems.get(column.status) ?? [];
              return (
                <section
                  className={`at-board-column is-${statusClass(column.status)}`}
                  key={column.status}
                >
                  <header className="at-board-column-header">
                    <h3>{t(column.titleKey)}</h3>
                    <span>{items.length}</span>
                  </header>
                  <div className="at-board-column-list">
                    {items.length > 0 ? (
                      items.map((item) => (
                        <BoardTodoCard
                          item={item}
                          key={item.todo_id}
                          language={language}
                          onArchive={(target) =>
                            statusActionMutation.mutate({
                              action: "archive",
                              item: target,
                            })
                          }
                          onMarkDone={(target) =>
                            statusActionMutation.mutate({
                              action: "mark-done",
                              item: target,
                            })
                          }
                          onRequestChanges={openRequestChanges}
                          onRestore={(target) =>
                            statusActionMutation.mutate({
                              action: "restore",
                              item: target,
                            })
                          }
                          onStartHandoff={openStartHandoff}
                          statusAction={statusActionMutation.variables ?? null}
                          statusBusy={statusActionMutation.isPending}
                          startBusy={
                            handoffTarget?.todo_id === item.todo_id
                            && (previewHandoffMutation.isPending
                              || startHandoffMutation.isPending)
                          }
                        />
                      ))
                    ) : (
                      <div className="at-board-column-empty">
                        {t("boardColumnEmpty")}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
      <BoardHandoffDrawer
        item={handoffTarget}
        onClose={closeHandoffDrawer}
        onPromptChange={setHandoffPrompt}
        onStart={() => startHandoffMutation.mutate()}
        open={handoffTarget !== null}
        preview={handoffPreview}
        previewError={previewHandoffMutation.error}
        previewLoading={previewHandoffMutation.isPending}
        prompt={handoffPrompt}
        startError={startHandoffMutation.error}
        starting={startHandoffMutation.isPending}
      />
      <BoardRequestChangesDrawer
        feedback={requestChangesFeedback}
        item={requestChangesTarget}
        onClose={closeRequestChangesDrawer}
        onFeedbackChange={updateRequestChangesFeedback}
        onPreview={() => previewRequestChangesMutation.mutate()}
        onPromptChange={setRequestChangesPrompt}
        onSubmit={() => requestChangesMutation.mutate()}
        open={requestChangesTarget !== null}
        preview={requestChangesPreview}
        previewError={previewRequestChangesMutation.error}
        previewLoading={previewRequestChangesMutation.isPending}
        prompt={requestChangesPrompt}
        submitError={requestChangesMutation.error}
        submitting={requestChangesMutation.isPending}
      />
    </section>
  );
}

function BoardScopeSummary({
  board,
  filteredCount,
  language,
}: {
  board: BoardTodoBoardResponse;
  filteredCount: number;
  language: Language;
}) {
  const t = useTranslations();
  return (
    <dl className="at-board-scope">
      <div>
        <dt>{t("boardShowing")}</dt>
        <dd>{filteredCount}</dd>
      </div>
      <div>
        <dt>{t("boardRevision")}</dt>
        <dd>{board.revision}</dd>
      </div>
      <div>
        <dt>{t("boardSources")}</dt>
        <dd>{board.source_groups.length}</dd>
      </div>
      <div>
        <dt>{t("boardSynced")}</dt>
        <dd>{formatDateTime(board.synced_at, language) || t("boardNotSynced")}</dd>
      </div>
      {board.repository_full_name ? (
        <div>
          <dt>{t("boardRepository")}</dt>
          <dd title={board.repository_full_name}>{board.repository_full_name}</dd>
        </div>
      ) : null}
      {board.is_fork_view && board.board_workspace_id ? (
        <div>
          <dt>{t("boardBoardWorkspace")}</dt>
          <dd title={board.board_workspace_id}>{board.board_workspace_id}</dd>
        </div>
      ) : null}
      {board.diagnostics.length > 0 ? (
        <div className="at-board-scope-diagnostics">
          <dt>{t("boardDiagnostics")}</dt>
          <dd title={board.diagnostics.join("\n")}>
            {board.diagnostics.join(" / ")}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function BoardTodoCard({
  item,
  language,
  onArchive,
  onMarkDone,
  onRequestChanges,
  onRestore,
  onStartHandoff,
  statusAction,
  statusBusy,
  startBusy,
}: {
  item: BoardTodoItem;
  language: Language;
  onArchive: (item: BoardTodoItem) => void;
  onMarkDone: (item: BoardTodoItem) => void;
  onRequestChanges: (item: BoardTodoItem) => void;
  onRestore: (item: BoardTodoItem) => void;
  onStartHandoff: (item: BoardTodoItem) => void;
  statusAction: BoardStatusActionRequest | null;
  statusBusy: boolean;
  startBusy: boolean;
}) {
  const t = useTranslations();
  const sourceLabel = formatSourceLabel(item, t);
  const updatedAt = formatDateTime(item.updated_at, language);
  const busyAction =
    statusBusy && statusAction?.item.todo_id === item.todo_id
      ? statusAction.action
      : null;
  return (
    <article className="at-board-card" data-testid={`board-todo-${item.todo_id}`}>
      <header className="at-board-card-header">
        <h4 title={item.title}>{item.title}</h4>
        {item.html_url ? (
          <Tooltip title={t("boardOpenSource")}>
            <Button
              aria-label={t("boardOpenSource")}
              href={item.html_url}
              icon={<ExternalLink size={14} />}
              rel="noreferrer"
              target="_blank"
              type="text"
            />
          </Tooltip>
        ) : null}
      </header>
      {item.body.trim() ? (
        <p className="at-board-card-body">{item.body.trim()}</p>
      ) : null}
      <div className="at-board-card-tags">
        <Tag>{sourceLabel}</Tag>
        {item.run_status ? <Tag>{item.run_status}</Tag> : null}
        {item.linked_pr_number ? (
          <Tag>
            {t("boardPullRequestNumber", { number: item.linked_pr_number })}
          </Tag>
        ) : null}
      </div>
      <dl className="at-board-card-facts">
        {item.repository_full_name ? (
          <div>
            <dt>{t("boardRepository")}</dt>
            <dd title={item.repository_full_name}>{item.repository_full_name}</dd>
          </div>
        ) : null}
        {item.execution_workspace_id ? (
          <div>
            <dt>{t("boardExecutionWorkspace")}</dt>
            <dd title={item.execution_workspace_id}>
              {item.execution_workspace_id}
            </dd>
          </div>
        ) : null}
        {item.session_id ? (
          <div>
            <dt>{t("boardSession")}</dt>
            <dd title={item.session_id}>{item.session_id}</dd>
          </div>
        ) : null}
        {updatedAt ? (
          <div>
            <dt>{t("boardUpdated")}</dt>
            <dd>{updatedAt}</dd>
          </div>
        ) : null}
      </dl>
      {item.last_status_reason ? (
        <div className="at-board-card-reason">{item.last_status_reason}</div>
      ) : null}
      {boardCardActions(item).length > 0 ? (
        <div className="at-board-card-actions">
          {canStartBoardTodo(item) ? (
            <Button
              icon={<Play size={14} />}
              loading={startBusy}
              onClick={() => onStartHandoff(item)}
              size="small"
            >
              {t("boardHandoffStart")}
            </Button>
          ) : null}
          {canRequestBoardChanges(item) ? (
            <Button
              icon={<MessageSquareReply size={14} />}
              onClick={() => onRequestChanges(item)}
              size="small"
            >
              {t("boardRequestChanges")}
            </Button>
          ) : null}
          {canMarkBoardDone(item) ? (
            <Popconfirm
              onConfirm={() => onMarkDone(item)}
              title={t("boardMarkDoneConfirm")}
            >
              <Button
                icon={<Check size={14} />}
                loading={busyAction === "mark-done"}
                size="small"
              >
                {t("boardMarkDone")}
              </Button>
            </Popconfirm>
          ) : null}
          {canArchiveBoardTodo(item) ? (
            <Popconfirm
              onConfirm={() => onArchive(item)}
              title={t("boardArchiveConfirm")}
            >
              <Button
                icon={<Archive size={14} />}
                loading={busyAction === "archive"}
                size="small"
              >
                {t("boardArchive")}
              </Button>
            </Popconfirm>
          ) : null}
          {canRestoreBoardTodo(item) ? (
            <Popconfirm
              onConfirm={() => onRestore(item)}
              title={t("boardRestoreConfirm")}
            >
              <Button
                icon={<Undo2 size={14} />}
                loading={busyAction === "restore"}
                size="small"
              >
                {t("boardRestore")}
              </Button>
            </Popconfirm>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function BoardHandoffDrawer({
  item,
  onClose,
  onPromptChange,
  onStart,
  open,
  preview,
  previewError,
  previewLoading,
  prompt,
  startError,
  starting,
}: {
  item: BoardTodoItem | null;
  onClose: () => void;
  onPromptChange: (prompt: string) => void;
  onStart: () => void;
  open: boolean;
  preview: BoardTodoPreviewStartResponse | undefined;
  previewError: Error | null;
  previewLoading: boolean;
  prompt: string;
  startError: Error | null;
  starting: boolean;
}) {
  const t = useTranslations();
  const busy = previewLoading || starting;
  const trimmedPrompt = prompt.trim();
  return (
    <Drawer
      destroyOnClose
      onClose={onClose}
      open={open}
      title={t("boardHandoffTitle")}
      width={560}
    >
      <div className="at-board-handoff">
        {item !== null ? (
          <section className="at-board-handoff-item">
            <h3>{item.title}</h3>
            {item.body.trim() ? <p>{item.body.trim()}</p> : null}
          </section>
        ) : null}
        {previewLoading && preview === undefined ? (
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        ) : null}
        {previewError !== null ? (
          <Alert
            description={errorText(previewError)}
            message={t("boardHandoffPreviewError")}
            showIcon
            type="error"
          />
        ) : null}
        {startError !== null ? (
          <Alert
            description={errorText(startError)}
            message={t("boardHandoffStartError")}
            showIcon
            type="error"
          />
        ) : null}
        {preview !== undefined ? (
          <>
            <dl className="at-board-handoff-meta">
              <div>
                <dt>{t("boardHandoffTemplate")}</dt>
                <dd>{preview.template_source}</dd>
              </div>
              <div>
                <dt>{t("boardHandoffExecutionPolicy")}</dt>
                <dd>{formatBoardValue(preview.execution_policy)}</dd>
              </div>
              {preview.execution_workspace_preview !== null
              && preview.execution_workspace_preview !== undefined ? (
                <div>
                  <dt>{t("boardHandoffExecutionWorkspace")}</dt>
                  <dd title={preview.execution_workspace_preview.display_name}>
                    {preview.execution_workspace_preview.display_name}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{t("boardHandoffQueue")}</dt>
                <dd>{handoffQueueLabel(preview, t)}</dd>
              </div>
              <div>
                <dt>{t("boardHandoffConcurrency")}</dt>
                <dd>
                  {preview.concurrency.source_workspace_active}/
                  {preview.concurrency.source_workspace_limit} ·{" "}
                  {preview.concurrency.runtime_target_active}/
                  {preview.concurrency.runtime_target_limit}
                </dd>
              </div>
            </dl>
            {preview.diagnostics.length > 0 ? (
              <Alert
                description={preview.diagnostics.join(" / ")}
                message={t("boardDiagnostics")}
                showIcon
                type="warning"
              />
            ) : null}
            <label className="at-board-handoff-prompt">
              <span>{t("boardHandoffFinalPrompt")}</span>
              <Input.TextArea
                autoSize={{ minRows: 8, maxRows: 14 }}
                onChange={(event) => onPromptChange(event.target.value)}
                value={prompt}
              />
            </label>
          </>
        ) : null}
        <div className="at-board-handoff-actions">
          <Button disabled={busy} onClick={onClose}>
            {t("boardHandoffCancel")}
          </Button>
          <Button
            disabled={preview === undefined || trimmedPrompt.length === 0}
            loading={starting}
            onClick={onStart}
            type="primary"
          >
            {t("boardHandoffSubmit")}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function BoardRequestChangesDrawer({
  feedback,
  item,
  onClose,
  onFeedbackChange,
  onPreview,
  onPromptChange,
  onSubmit,
  open,
  preview,
  previewError,
  previewLoading,
  prompt,
  submitError,
  submitting,
}: {
  feedback: string;
  item: BoardTodoItem | null;
  onClose: () => void;
  onFeedbackChange: (feedback: string) => void;
  onPreview: () => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  open: boolean;
  preview: BoardTodoPreviewRequestChangesResponse | undefined;
  previewError: Error | null;
  previewLoading: boolean;
  prompt: string;
  submitError: Error | null;
  submitting: boolean;
}) {
  const t = useTranslations();
  const busy = previewLoading || submitting;
  const trimmedFeedback = feedback.trim();
  const trimmedPrompt = prompt.trim();
  return (
    <Drawer
      destroyOnClose
      onClose={onClose}
      open={open}
      title={t("boardRequestChangesTitle")}
      width={560}
    >
      <div className="at-board-request">
        {item !== null ? (
          <section className="at-board-request-item">
            <h3>{item.title}</h3>
            {item.body.trim() ? <p>{item.body.trim()}</p> : null}
          </section>
        ) : null}
        <label className="at-board-request-feedback">
          <span>{t("boardRequestChangesFeedback")}</span>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 8 }}
            disabled={busy}
            onChange={(event) => onFeedbackChange(event.target.value)}
            value={feedback}
          />
        </label>
        <div className="at-board-request-preview-actions">
          <Button
            disabled={trimmedFeedback.length === 0 || busy}
            loading={previewLoading}
            onClick={onPreview}
          >
            {t("boardRequestChangesPreview")}
          </Button>
        </div>
        {previewError !== null ? (
          <Alert
            description={errorText(previewError)}
            message={t("boardRequestChangesPreviewError")}
            showIcon
            type="error"
          />
        ) : null}
        {submitError !== null ? (
          <Alert
            description={errorText(submitError)}
            message={t("boardRequestChangesError")}
            showIcon
            type="error"
          />
        ) : null}
        {previewLoading && preview === undefined ? (
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        ) : null}
        {preview !== undefined ? (
          <>
            <dl className="at-board-request-meta">
              <div>
                <dt>{t("boardHandoffTemplate")}</dt>
                <dd>{preview.template_source}</dd>
              </div>
              {preview.execution_policy ? (
                <div>
                  <dt>{t("boardHandoffExecutionPolicy")}</dt>
                  <dd>{formatBoardValue(preview.execution_policy)}</dd>
                </div>
              ) : null}
              {preview.execution_workspace_preview !== null
              && preview.execution_workspace_preview !== undefined ? (
                <div>
                  <dt>{t("boardHandoffExecutionWorkspace")}</dt>
                  <dd title={preview.execution_workspace_preview.display_name}>
                    {preview.execution_workspace_preview.display_name}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{t("boardHandoffQueue")}</dt>
                <dd>{requestChangesQueueLabel(preview, t)}</dd>
              </div>
              {preview.run_id ? (
                <div>
                  <dt>{t("boardRun")}</dt>
                  <dd>{preview.run_id}</dd>
                </div>
              ) : null}
            </dl>
            {preview.diagnostics.length > 0 ? (
              <Alert
                description={preview.diagnostics.join(" / ")}
                message={t("boardDiagnostics")}
                showIcon
                type="warning"
              />
            ) : null}
            <label className="at-board-request-prompt">
              <span>{t("boardHandoffFinalPrompt")}</span>
              <Input.TextArea
                autoSize={{ minRows: 8, maxRows: 14 }}
                onChange={(event) => onPromptChange(event.target.value)}
                value={prompt}
              />
            </label>
          </>
        ) : null}
        <div className="at-board-request-actions">
          <Button disabled={busy} onClick={onClose}>
            {t("boardHandoffCancel")}
          </Button>
          <Button
            disabled={preview === undefined || trimmedPrompt.length === 0}
            loading={submitting}
            onClick={onSubmit}
            type="primary"
          >
            {t("boardRequestChangesSubmit")}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function compareBoardTodoItems(left: BoardTodoItem, right: BoardTodoItem) {
  const leftTime = Date.parse(left.updated_at);
  const rightTime = Date.parse(right.updated_at);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return rightTime - leftTime;
  }
  return left.title.localeCompare(right.title);
}

function canStartBoardTodo(item: BoardTodoItem): boolean {
  return item.status === "todo";
}

function canRequestBoardChanges(item: BoardTodoItem): boolean {
  return item.status === "review";
}

function canMarkBoardDone(item: BoardTodoItem): boolean {
  return item.status === "review";
}

function canArchiveBoardTodo(item: BoardTodoItem): boolean {
  return item.status === "done";
}

function canRestoreBoardTodo(item: BoardTodoItem): boolean {
  return item.status === "archived";
}

function boardCardActions(item: BoardTodoItem): string[] {
  return [
    canStartBoardTodo(item) ? "start" : "",
    canRequestBoardChanges(item) ? "request-changes" : "",
    canMarkBoardDone(item) ? "mark-done" : "",
    canArchiveBoardTodo(item) ? "archive" : "",
    canRestoreBoardTodo(item) ? "restore" : "",
  ].filter(Boolean);
}

type BoardStatusAction = "archive" | "mark-done" | "restore";

interface BoardStatusActionRequest {
  action: BoardStatusAction;
  item: BoardTodoItem;
}

function boardStatusActionSuccess(
  action: BoardStatusAction,
  t: (
    key: "boardArchived" | "boardMarkedDone" | "boardRestored",
  ) => string,
): string {
  if (action === "mark-done") {
    return t("boardMarkedDone");
  }
  if (action === "archive") {
    return t("boardArchived");
  }
  return t("boardRestored");
}

function replaceBoardItem(
  board: BoardTodoBoardResponse | undefined,
  item: BoardTodoItem,
  includeArchived = true,
): BoardTodoBoardResponse | undefined {
  if (board === undefined) {
    return undefined;
  }
  const shouldKeepItem = includeArchived || item.status !== "archived";
  const found = board.items.some((candidate) => candidate.todo_id === item.todo_id);
  const nextItems = found
    ? board.items.flatMap((candidate) => {
        if (candidate.todo_id !== item.todo_id) {
          return [candidate];
        }
        return shouldKeepItem ? [item] : [];
      })
    : shouldKeepItem
      ? [item, ...board.items]
      : board.items;
  return {
    ...board,
    items: nextItems,
    revision: Math.max(board.revision, item.item_revision),
    status_counts: boardStatusCounts(nextItems),
  };
}

function boardStatusCounts(items: BoardTodoItem[]): BoardTodoStatusCounts {
  return {
    archived: items.filter((item) => item.status === "archived").length,
    done: items.filter((item) => item.status === "done").length,
    in_progress: items.filter((item) => item.status === "in_progress").length,
    review: items.filter((item) => item.status === "review").length,
    todo: items.filter((item) => item.status === "todo").length,
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string | null | undefined, language: Language) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function formatSourceLabel(
  item: BoardTodoItem,
  t: (
    key: "boardIssueNumber" | "boardManualSource" | "boardPullRequestNumber",
    replacements?: Record<string, string | number>,
  ) => string,
) {
  if (item.pull_request_number !== null && item.pull_request_number !== undefined) {
    return t("boardPullRequestNumber", { number: item.pull_request_number });
  }
  if (item.issue_number !== null && item.issue_number !== undefined) {
    return t("boardIssueNumber", { number: item.issue_number });
  }
  if (item.source_provider === "local") {
    return t("boardManualSource");
  }
  return item.source_key;
}

function matchesSearch(item: BoardTodoItem, query: string) {
  if (!query) {
    return true;
  }
  return [
    item.title,
    item.body,
    item.repository_full_name ?? "",
    item.source_key,
    item.session_id ?? "",
    item.run_id ?? "",
    item.last_status_reason ?? "",
  ]
    .join("\n")
    .toLowerCase()
    .includes(query);
}

function requireWorkspaceId(workspaceId: string | null) {
  if (workspaceId === null) {
    throw new Error("Workspace is required.");
  }
  return workspaceId;
}

function handoffQueueLabel(
  preview: BoardTodoPreviewStartResponse,
  t: (
    key:
      | "boardHandoffQueueAvailable"
      | "boardHandoffQueueDisabled"
      | "boardHandoffQueueWillQueue",
  ) => string,
) {
  if (preview.queue_preview.will_queue) {
    return t("boardHandoffQueueWillQueue");
  }
  if (preview.queue_preview.slot_available) {
    return t("boardHandoffQueueAvailable");
  }
  return t("boardHandoffQueueDisabled");
}

function requestChangesQueueLabel(
  preview: BoardTodoPreviewRequestChangesResponse,
  t: (
    key:
      | "boardHandoffQueueAvailable"
      | "boardHandoffQueueDisabled"
      | "boardHandoffQueueWillQueue",
  ) => string,
) {
  if (preview.queue_preview.will_queue) {
    return t("boardHandoffQueueWillQueue");
  }
  if (preview.queue_preview.slot_available) {
    return t("boardHandoffQueueAvailable");
  }
  return t("boardHandoffQueueDisabled");
}

function formatBoardValue(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: BoardTodoStatus) {
  return status.replace("_", "-");
}

function workspaceDisplayName(workspace: WorkspaceRecord) {
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
}
