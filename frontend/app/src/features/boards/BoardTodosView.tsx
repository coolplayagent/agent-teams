import {
  Alert,
  App,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
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
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCw,
  Settings2,
  Trash2,
  Undo2,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import "./BoardModals.css";
import "./BoardLayout.css";

import {
  archiveBoardTodo,
  createBoardTodoSource,
  deleteBoardTodoSource,
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
} from "../../api/client";
import type {
  BoardTodoBoardResponse,
  BoardTodoItem,
  BoardTodoPreviewRequestChangesResponse,
  BoardTodoPreviewStartResponse,
  BoardTodoSourceCreateRequest,
  BoardTodoSourceSettingsResponse,
  BoardTodoSourceUpdateRequest,
  BoardTodoSourceView,
  BoardTodoStatus,
  BoardTodoStatusCounts,
  WorkspaceRecord,
} from "../../api/contracts";
import { ChoiceControl } from "../../components/ChoiceControl";
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
  const [handoffTarget, setHandoffTarget] = useState<BoardTodoItem | null>(
    null,
  );
  const [handoffPrompt, setHandoffPrompt] = useState("");
  const [requestChangesTarget, setRequestChangesTarget] =
    useState<BoardTodoItem | null>(null);
  const [requestChangesFeedback, setRequestChangesFeedback] = useState("");
  const [requestChangesPrompt, setRequestChangesPrompt] = useState("");
  const [sourceSettingsOpen, setSourceSettingsOpen] = useState(false);
  const [sourceEditor, setSourceEditor] =
    useState<BoardSourceEditorState | null>(null);
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
  const sourceSettingsQueryKey = [
    "board-todo-sources",
    activeWorkspaceId ?? "",
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
  const sourceSettingsQuery = useQuery({
    enabled: sourceSettingsOpen && activeWorkspaceId !== null,
    queryFn: () => listBoardTodoSources(requireWorkspaceId(activeWorkspaceId)),
    queryKey: sourceSettingsQueryKey,
  });
  const createSourceMutation = useMutation({
    mutationFn: (request: BoardTodoSourceCreateRequest) =>
      createBoardTodoSource(request),
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: () => {
      resetSourceEditor();
      refreshBoardSourceData();
      void message.success(t("boardSourceSaved"));
    },
  });
  const updateSourceMutation = useMutation({
    mutationFn: (request: BoardSourceUpdateMutationRequest) =>
      updateBoardTodoSource(request.sourceId, request.payload),
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: () => {
      resetSourceEditor();
      refreshBoardSourceData();
      void message.success(t("boardSourceSaved"));
    },
  });
  const deleteSourceMutation = useMutation({
    mutationFn: (sourceId: string) => deleteBoardTodoSource(sourceId),
    onError: (error) => {
      void message.error(errorText(error));
    },
    onSuccess: () => {
      resetSourceEditor();
      refreshBoardSourceData();
      void message.success(t("boardSourceDeleted"));
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
    workspaceOptions.find((option) => option.value === activeWorkspaceId)
      ?.label ??
    activeWorkspaceId ??
    t("boardNoWorkspace");
  const handoffPreview = previewHandoffMutation.data;
  const requestChangesPreview = previewRequestChangesMutation.data;
  const sourceSettingsBusy =
    createSourceMutation.isPending ||
    updateSourceMutation.isPending ||
    deleteSourceMutation.isPending;

  function openStartHandoff(item: BoardTodoItem) {
    setHandoffTarget(item);
    setHandoffPrompt("");
    previewHandoffMutation.reset();
    startHandoffMutation.reset();
    previewHandoffMutation.mutate(item);
  }

  function openSourceSettings() {
    setSourceSettingsOpen(true);
    resetSourceEditor();
  }

  function closeSourceSettings() {
    if (sourceSettingsBusy) {
      return;
    }
    setSourceSettingsOpen(false);
    resetSourceEditor();
  }

  function refreshBoardSourceData() {
    void queryClient.invalidateQueries({ queryKey: sourceSettingsQueryKey });
    void queryClient.invalidateQueries({ queryKey: boardQueryKey });
  }

  function startCreateSource() {
    setSourceEditor(createEmptyBoardSourceEditor());
    createSourceMutation.reset();
    updateSourceMutation.reset();
    deleteSourceMutation.reset();
  }

  function startEditSource(sourceView: BoardTodoSourceView) {
    setSourceEditor({
      displayName: sourceView.source.display_name,
      enabled: sourceView.source.enabled,
      repositoryFullName: sourceView.source.repository_full_name ?? "",
      sourceId: sourceView.source.source_id,
    });
    createSourceMutation.reset();
    updateSourceMutation.reset();
    deleteSourceMutation.reset();
  }

  function updateSourceEditor(patch: Partial<BoardSourceEditorState>) {
    setSourceEditor((current) =>
      current === null ? current : { ...current, ...patch },
    );
  }

  function resetSourceEditor() {
    setSourceEditor(null);
    createSourceMutation.reset();
    updateSourceMutation.reset();
    deleteSourceMutation.reset();
  }

  function saveSourceEditor() {
    if (sourceEditor === null) {
      return;
    }
    const displayName = sourceEditor.displayName.trim();
    const repositoryFullName = sourceEditor.repositoryFullName.trim();
    if (!displayName || !repositoryFullName) {
      void message.error(t("boardSourceRequired"));
      return;
    }
    const workspaceId = requireWorkspaceId(activeWorkspaceId);
    if (sourceEditor.sourceId === null) {
      createSourceMutation.mutate({
        display_name: displayName,
        enabled: sourceEditor.enabled,
        kind: "github_issues",
        repository_full_name: repositoryFullName,
        workspace_id: workspaceId,
      });
      return;
    }
    updateSourceMutation.mutate({
      payload: {
        display_name: displayName,
        enabled: sourceEditor.enabled,
        repository_full_name: repositoryFullName,
        workspace_id: workspaceId,
      },
      sourceId: sourceEditor.sourceId,
    });
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
      previewRequestChangesMutation.isPending ||
      requestChangesMutation.isPending
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
          <Typography.Title level={3}>{t("boardTitle")}</Typography.Title>
          <Typography.Text type="secondary">
            {activeWorkspaceLabel}
          </Typography.Text>
        </div>
        <div className="at-board-toolbar-actions">
          <Tooltip title={t("boardSourceSettings")}>
            <Button
              aria-label={t("boardSourceSettings")}
              disabled={activeWorkspaceId === null}
              icon={<Settings2 size={15} />}
              loading={sourceSettingsQuery.isFetching && sourceSettingsOpen}
              onClick={openSourceSettings}
              type="text"
            />
          </Tooltip>
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
          <Typography.Text
            aria-live="polite"
            className="at-board-result-count"
            title={
              boardQuery.data?.synced_at
                ? `${t("boardSynced")} ${formatDateTime(boardQuery.data.synced_at, language)}`
                : undefined
            }
            role="status"
            type="secondary"
          >
            {t("boardShowing")} <strong>{filteredRows.length}</strong>
          </Typography.Text>
          <ChoiceControl
            checked={includeArchived}
            kind="switch"
            label={
              <>
                {t("boardIncludeArchived")}
                <Archive aria-hidden="true" size={14} />
              </>
            }
            onChange={setIncludeArchived}
          />
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

        {boardQuery.data?.diagnostics.length ? (
          <Alert
            description={boardQuery.data.diagnostics.join(" / ")}
            message={t("boardDiagnostics")}
            showIcon
            type="warning"
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
                            handoffTarget?.todo_id === item.todo_id &&
                            (previewHandoffMutation.isPending ||
                              startHandoffMutation.isPending)
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
      <BoardSourceSettingsModal
        busy={sourceSettingsBusy}
        deletingSourceId={deleteSourceMutation.variables ?? null}
        editor={sourceEditor}
        language={language}
        loadError={sourceSettingsQuery.error}
        loading={
          sourceSettingsQuery.isFetching &&
          sourceSettingsQuery.data === undefined
        }
        onClose={closeSourceSettings}
        onDelete={(sourceId) => deleteSourceMutation.mutate(sourceId)}
        onEditorChange={updateSourceEditor}
        onRefresh={() => void sourceSettingsQuery.refetch()}
        onSave={saveSourceEditor}
        onStartCreate={startCreateSource}
        onStartEdit={startEditSource}
        onStopEdit={resetSourceEditor}
        open={sourceSettingsOpen}
        settings={sourceSettingsQuery.data}
        workspaceLabel={activeWorkspaceLabel}
      />
      <BoardHandoffModal
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
      <BoardRequestChangesModal
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
    <article
      className="at-board-card"
      data-testid={`board-todo-${item.todo_id}`}
    >
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
      <div className="at-board-card-tags">
        <Tag>{sourceLabel}</Tag>
        {item.run_status ? <Tag>{item.run_status}</Tag> : null}
        {item.linked_pr_number ? (
          <Tag>
            {t("boardPullRequestNumber", { number: item.linked_pr_number })}
          </Tag>
        ) : null}
      </div>
      {item.body.trim() ||
      item.repository_full_name ||
      item.execution_workspace_id ||
      item.session_id ||
      updatedAt ||
      item.last_status_reason ? (
        <details className="at-board-card-details">
          <summary>
            {updatedAt ? `${t("boardUpdated")} ${updatedAt}` : sourceLabel}
          </summary>
          <div className="at-board-card-details-body">
            {item.body.trim() ? (
              <p className="at-board-card-body">{item.body.trim()}</p>
            ) : null}
            <dl className="at-board-card-facts">
              {item.repository_full_name ? (
                <div>
                  <dt>{t("boardRepository")}</dt>
                  <dd title={item.repository_full_name}>
                    {item.repository_full_name}
                  </dd>
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
            </dl>
            {item.last_status_reason ? (
              <div className="at-board-card-reason">
                {item.last_status_reason}
              </div>
            ) : null}
          </div>
        </details>
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

function BoardSourceSettingsModal({
  busy,
  deletingSourceId,
  editor,
  language,
  loadError,
  loading,
  onClose,
  onDelete,
  onEditorChange,
  onRefresh,
  onSave,
  onStartCreate,
  onStartEdit,
  onStopEdit,
  open,
  settings,
  workspaceLabel,
}: {
  busy: boolean;
  deletingSourceId: string | null;
  editor: BoardSourceEditorState | null;
  language: Language;
  loadError: Error | null;
  loading: boolean;
  onClose: () => void;
  onDelete: (sourceId: string) => void;
  onEditorChange: (patch: Partial<BoardSourceEditorState>) => void;
  onRefresh: () => void;
  onSave: () => void;
  onStartCreate: () => void;
  onStartEdit: (sourceView: BoardTodoSourceView) => void;
  onStopEdit: () => void;
  open: boolean;
  settings: BoardTodoSourceSettingsResponse | undefined;
  workspaceLabel: string;
}) {
  const t = useTranslations();
  const sourceCount = settings?.sources.length ?? 0;
  const canSave =
    editor !== null &&
    editor.displayName.trim().length > 0 &&
    editor.repositoryFullName.trim().length > 0 &&
    !busy;
  return (
    <Modal
      centered
      className="at-board-modal at-board-sources-modal"
      classNames={{ body: "at-scroll-region" }}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("boardSourceSettingsTitle")}
      width={720}
    >
      <div className="at-board-sources">
        <header className="at-board-sources-header">
          <div>
            <strong>{workspaceLabel}</strong>
            <span>{t("boardSourceCount", { count: sourceCount })}</span>
          </div>
          <div>
            <Tooltip title={t("boardRefresh")}>
              <Button
                aria-label={t("boardRefresh")}
                icon={<RefreshCcw size={14} />}
                loading={loading}
                onClick={onRefresh}
                type="text"
              />
            </Tooltip>
            <Button
              icon={<Plus size={14} />}
              onClick={onStartCreate}
              type="primary"
            >
              {t("boardSourceAdd")}
            </Button>
          </div>
        </header>

        {loadError !== null ? (
          <Alert
            description={errorText(loadError)}
            message={t("boardSourceLoadError")}
            showIcon
            type="error"
          />
        ) : null}

        {settings !== undefined && settings.diagnostics.length > 0 ? (
          <Alert
            description={settings.diagnostics.join(" / ")}
            message={t("boardDiagnostics")}
            showIcon
            type="warning"
          />
        ) : null}

        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        ) : null}

        {settings !== undefined && settings.sources.length === 0 ? (
          <Empty description={t("boardSourcesEmpty")} />
        ) : null}

        {settings !== undefined && settings.sources.length > 0 ? (
          <div className="at-board-source-list">
            {settings.sources.map((sourceView) => (
              <BoardSourceRow
                deleting={deletingSourceId === sourceView.source.source_id}
                key={sourceView.source.source_id}
                language={language}
                onDelete={onDelete}
                onEdit={onStartEdit}
                sourceView={sourceView}
              />
            ))}
          </div>
        ) : null}

        {editor !== null ? (
          <section
            aria-label={
              editor.sourceId === null
                ? t("boardSourceCreateTitle")
                : t("boardSourceEditTitle")
            }
            className="at-board-source-editor"
          >
            <header>
              <h3>
                {editor.sourceId === null
                  ? t("boardSourceCreateTitle")
                  : t("boardSourceEditTitle")}
              </h3>
            </header>
            <label className="at-board-source-field">
              <span>{t("boardSourceName")}</span>
              <Input
                disabled={busy}
                onChange={(event) =>
                  onEditorChange({ displayName: event.target.value })
                }
                value={editor.displayName}
              />
            </label>
            <label className="at-board-source-field">
              <span>{t("boardSourceRepository")}</span>
              <Input
                disabled={busy}
                onChange={(event) =>
                  onEditorChange({ repositoryFullName: event.target.value })
                }
                placeholder={t("boardSourceRepositoryPlaceholder")}
                value={editor.repositoryFullName}
              />
            </label>
            <ChoiceControl
              checked={editor.enabled}
              disabled={busy}
              kind="switch"
              label={t("boardSourceEnabled")}
              onChange={(enabled) => onEditorChange({ enabled })}
            />
            <div className="at-board-source-editor-actions">
              <Button disabled={busy} onClick={onStopEdit}>
                {t("boardHandoffCancel")}
              </Button>
              <Button
                disabled={!canSave}
                loading={busy}
                onClick={onSave}
                type="primary"
              >
                {editor.sourceId === null
                  ? t("boardSourceCreate")
                  : t("boardSourceSave")}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

function BoardSourceRow({
  deleting,
  language,
  onDelete,
  onEdit,
  sourceView,
}: {
  deleting: boolean;
  language: Language;
  onDelete: (sourceId: string) => void;
  onEdit: (sourceView: BoardTodoSourceView) => void;
  sourceView: BoardTodoSourceView;
}) {
  const t = useTranslations();
  const { source, state } = sourceView;
  const lastFinished = formatDateTime(state?.last_sync_finished_at, language);
  const diagnostics = state?.last_diagnostics ?? [];
  return (
    <article className="at-board-source-row">
      <header>
        <div>
          <strong title={source.display_name}>{source.display_name}</strong>
          <span title={source.repository_full_name ?? ""}>
            {source.repository_full_name ?? t("boardSourceNoRepository")}
          </span>
        </div>
        <div>
          <Tag>
            {source.enabled
              ? t("boardSourceEnabled")
              : t("boardSourceDisabled")}
          </Tag>
          {source.system_managed ? (
            <Tag>{t("boardSourceSystemManaged")}</Tag>
          ) : null}
          <Tooltip title={t("boardSourceEdit")}>
            <Button
              aria-label={t("boardSourceEdit")}
              disabled={source.system_managed}
              icon={<Pencil size={14} />}
              onClick={() => onEdit(sourceView)}
              type="text"
            />
          </Tooltip>
          <Popconfirm
            disabled={source.system_managed}
            onConfirm={() => onDelete(source.source_id)}
            title={t("boardSourceDeleteConfirm")}
          >
            <Button
              aria-label={t("boardSourceDelete")}
              danger
              disabled={source.system_managed}
              icon={<Trash2 size={14} />}
              loading={deleting}
              type="text"
            />
          </Popconfirm>
        </div>
      </header>
      <dl className="at-board-source-meta">
        <div>
          <dt>{t("boardSourceKind")}</dt>
          <dd>{formatBoardValue(source.kind)}</dd>
        </div>
        <div>
          <dt>{t("boardSourceSyncStatus")}</dt>
          <dd>{state?.last_sync_status ?? "idle"}</dd>
        </div>
        <div>
          <dt>{t("boardSynced")}</dt>
          <dd>{lastFinished || t("boardNotSynced")}</dd>
        </div>
      </dl>
      {diagnostics.length > 0 ? (
        <div className="at-board-source-diagnostics">
          {diagnostics.join(" / ")}
        </div>
      ) : null}
    </article>
  );
}

function BoardHandoffModal({
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
    <Modal
      centered
      className="at-board-modal"
      classNames={{ body: "at-scroll-region" }}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("boardHandoffTitle")}
      width={640}
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
              {preview.execution_workspace_preview !== null &&
              preview.execution_workspace_preview !== undefined ? (
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
    </Modal>
  );
}

function BoardRequestChangesModal({
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
    <Modal
      centered
      className="at-board-modal"
      classNames={{ body: "at-scroll-region" }}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("boardRequestChangesTitle")}
      width={640}
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
              {preview.execution_workspace_preview !== null &&
              preview.execution_workspace_preview !== undefined ? (
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
    </Modal>
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

interface BoardSourceEditorState {
  displayName: string;
  enabled: boolean;
  repositoryFullName: string;
  sourceId: string | null;
}

interface BoardSourceUpdateMutationRequest {
  payload: BoardTodoSourceUpdateRequest;
  sourceId: string;
}

function createEmptyBoardSourceEditor(): BoardSourceEditorState {
  return {
    displayName: "GitHub issues",
    enabled: true,
    repositoryFullName: "",
    sourceId: null,
  };
}

function boardStatusActionSuccess(
  action: BoardStatusAction,
  t: (key: "boardArchived" | "boardMarkedDone" | "boardRestored") => string,
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
  const found = board.items.some(
    (candidate) => candidate.todo_id === item.todo_id,
  );
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
  if (
    item.pull_request_number !== null &&
    item.pull_request_number !== undefined
  ) {
    return t("boardPullRequestNumber", { number: item.pull_request_number });
  }
  if (item.issue_number !== null && item.issue_number !== undefined) {
    return t("boardIssueNumber", { number: item.issue_number });
  }
  if (item.source_type === "manual") {
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
