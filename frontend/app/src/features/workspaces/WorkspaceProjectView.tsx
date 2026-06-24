import { useEffect, useState } from "react";
import {
  App,
  Button,
  Empty,
  Input,
  Skeleton,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ExternalLink,
  File,
  FolderClosed,
  GitBranch,
  RefreshCcw,
  Search,
} from "lucide-react";

import {
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listWorkspaces,
  openWorkspaceRoot,
  searchWorkspacePaths,
} from "../../api/client";
import type {
  WorkspaceDiffFile,
  WorkspaceDiffFileSummary,
  WorkspaceRecord,
  WorkspaceSearchResult,
  WorkspaceSnapshot,
  WorkspaceTreeNode,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";

type WorkspaceProjectMode = "files" | "changes";

interface WorkspaceProjectViewProps {
  onBack: () => void;
  selectedWorkspaceId: string | null;
}

interface DiffLine {
  kind: "added" | "context" | "deleted" | "hunk" | "meta";
  lineNumber: number;
  text: string;
}

type WorkspaceFilePaneEntry = WorkspaceTreeNode | WorkspaceSearchResult;

export function WorkspaceProjectView({
  onBack,
  selectedWorkspaceId,
}: WorkspaceProjectViewProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [modeOverride, setModeOverride] = useState<WorkspaceProjectMode | null>(null);
  const [activeMountNameOverride, setActiveMountNameOverride] = useState<string | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState("");

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const workspaces = workspacesQuery.data ?? [];
  const workspace =
    workspaces.find((item) => item.workspace_id === selectedWorkspaceId) ??
    workspaces[0] ??
    null;
  const workspaceId = workspace?.workspace_id ?? "";

  useEffect(() => {
    setModeOverride(null);
    setActiveMountNameOverride(null);
    setSelectedDiffPath(null);
    setTreeFilter("");
  }, [workspaceId]);

  const snapshotQuery = useQuery({
    queryKey: ["workspaces", "snapshot", workspaceId],
    queryFn: () => getWorkspaceSnapshot(workspaceId),
    enabled: workspaceId.length > 0,
  });
  const snapshot = snapshotQuery.data;
  const rootEntries = snapshot?.tree.children ?? [];
  const defaultMountName = snapshot?.default_mount_name?.trim() || "default";
  const mountNames = uniqueValues([
    defaultMountName,
    ...rootEntries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.name.trim())
      .filter((name) => name.length > 0),
  ]);
  const activeMountNameCandidate = activeMountNameOverride ?? defaultMountName;
  const activeMountName = mountNames.includes(activeMountNameCandidate)
    ? activeMountNameCandidate
    : defaultMountName;

  const diffsQuery = useQuery({
    queryKey: ["workspaces", "diffs", workspaceId, activeMountName],
    queryFn: () => getWorkspaceDiffs(workspaceId, activeMountName),
    enabled: workspaceId.length > 0 && activeMountName.length > 0,
  });
  const diffFiles = diffsQuery.data?.diff_files ?? [];
  const diffFilesByPath = new Map(diffFiles.map((file) => [file.path, file]));
  const activeMode: WorkspaceProjectMode =
    modeOverride ?? (diffFiles.length > 0 ? "changes" : "files");
  const selectedDiff =
    selectedDiffPath === null
      ? diffFiles[0] ?? null
      : diffFiles.find((file) => file.path === selectedDiffPath) ?? diffFiles[0] ?? null;
  const effectiveSelectedDiffPath = selectedDiff?.path ?? null;
  const mountName =
    diffsQuery.data?.mount_name?.trim() ||
    activeMountName;

  const rootTreeQuery = useQuery({
    queryKey: ["workspaces", "tree", workspaceId, activeMountName, "."],
    queryFn: () => getWorkspaceTree(workspaceId, ".", activeMountName),
    enabled: workspaceId.length > 0 && activeMountName.length > 0,
  });
  const normalizedTreeFilter = treeFilter.trim();
  const fileSearchQuery = useQuery({
    queryKey: [
      "workspaces",
      "search",
      workspaceId,
      activeMountName,
      normalizedTreeFilter,
    ],
    queryFn: () =>
      searchWorkspacePaths(workspaceId, normalizedTreeFilter, 80, activeMountName),
    enabled:
      workspaceId.length > 0 &&
      activeMountName.length > 0 &&
      normalizedTreeFilter.length > 0,
  });
  const rootTreeEntries = rootTreeQuery.data?.children ?? [];
  const filePaneEntries =
    normalizedTreeFilter.length > 0
      ? fileSearchQuery.data?.results ?? []
      : rootTreeEntries;

  const diffFileQuery = useQuery({
    queryKey: ["workspaces", "diff", workspaceId, mountName, effectiveSelectedDiffPath],
    queryFn: () => {
      if (effectiveSelectedDiffPath === null) {
        throw new Error("Diff path is required.");
      }
      return getWorkspaceDiffFile(workspaceId, effectiveSelectedDiffPath, mountName);
    },
    enabled:
      activeMode === "changes" &&
      workspaceId.length > 0 &&
      effectiveSelectedDiffPath !== null,
  });

  const openRootMutation = useMutation({
    mutationFn: () => openWorkspaceRoot(workspaceId, mountName),
    onSuccess: () => {
      void message.success(t("workspaceFolderOpened"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("workspaceOpenFolderError"),
      );
    },
  });

  if (workspacesQuery.isLoading) {
    return (
      <section aria-label={t("workspaceProjectView")} className="at-project-view">
        <Skeleton active paragraph={{ rows: 12 }} />
      </section>
    );
  }

  if (workspace === null) {
    return (
      <section aria-label={t("workspaceProjectView")} className="at-project-view">
        <Empty description={t("workspaceNoSelected")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </section>
    );
  }

  return (
    <section aria-label={t("workspaceProjectView")} className="at-project-view">
      <div className="at-project-toolbar">
        <div className="at-project-toolbar-copy">
          <h2>{workspaceLabel(workspace)}</h2>
          <Typography.Text ellipsis title={workspaceRoot(workspace, snapshot)}>
            {workspaceRoot(workspace, snapshot)}
          </Typography.Text>
        </div>
        <div className="at-project-toolbar-actions">
          <Button
            icon={<ExternalLink size={15} />}
            loading={openRootMutation.isPending}
            onClick={() => openRootMutation.mutate()}
            size="small"
          >
            {t("workspaceOpenFolder")}
          </Button>
          <Button
            aria-label={t("workspaceReloadView")}
            icon={<RefreshCcw size={15} />}
            loading={snapshotQuery.isFetching || diffsQuery.isFetching}
            onClick={() => refreshWorkspace(workspaceId)}
            size="small"
          >
            {t("workspaceReload")}
          </Button>
          <Button
            aria-label={t("workspaceBackToChat")}
            icon={<ChevronLeft size={15} />}
            onClick={onBack}
            size="small"
            type="text"
          />
        </div>
      </div>

      <div className="at-workspace-workbench">
        <div className="at-workspace-workbench-bar">
          <div
            aria-label={t("workspaceProjectView")}
            className="at-workspace-mode-tabs"
            role="tablist"
          >
            <button
              aria-selected={activeMode === "files"}
              className={
                activeMode === "files"
                  ? "at-workspace-mode-tab is-active"
                  : "at-workspace-mode-tab"
              }
              onClick={() => setModeOverride("files")}
              role="tab"
              type="button"
            >
              {t("workspaceFiles")}
            </button>
            <button
              aria-label={`${t("workspaceChanges")} ${diffFiles.length}`}
              aria-selected={activeMode === "changes"}
              className={
                activeMode === "changes"
                  ? "at-workspace-mode-tab is-active"
                  : "at-workspace-mode-tab"
              }
              onClick={() => setModeOverride("changes")}
              role="tab"
              type="button"
            >
              <span>{t("workspaceChanges")}</span>
              <span className="at-workspace-mode-count">{diffFiles.length}</span>
            </button>
          </div>
          <div className="at-workspace-mount-menu" aria-label={t("workspaceMount")}>
            <span>{t("workspaceMount")}</span>
            {mountNames.map((name) => (
              <button
                aria-pressed={name === activeMountName}
                className={name === activeMountName ? "is-active" : undefined}
                key={name}
                onClick={() => {
                  setActiveMountNameOverride(name);
                  setSelectedDiffPath(null);
                  setTreeFilter("");
                }}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="at-workspace-workbench-spacer" />
          <Button
            aria-label={t("workspaceOpenFolder")}
            icon={<ExternalLink size={15} />}
            loading={openRootMutation.isPending}
            onClick={() => openRootMutation.mutate()}
            size="small"
            type="text"
          />
        </div>

        {activeMode === "files" ? (
          <div className="at-workspace-workbench-content is-files">
            {rootTreeQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 12 }} />
            ) : null}
            {rootTreeQuery.isError ? (
              <div className="at-project-state is-error">
                {errorMessage(rootTreeQuery.error, t("workspaceLoadTreeError"))}
              </div>
            ) : null}
            {!rootTreeQuery.isLoading &&
            !rootTreeQuery.isError &&
            rootTreeEntries.length === 0 ? (
              <div className="at-project-state">{t("workspaceNoRootEntries")}</div>
            ) : null}
            {rootTreeEntries.length > 0 ? (
              <div className="at-workspace-tree-list">
                {rootTreeEntries.map((entry) => (
                  <WorkspaceTreeEntry entry={entry} key={entry.path || entry.name} t={t} />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="at-workspace-workbench-content is-changes">
            <section
              aria-label={t("workspaceChangesListLabel")}
              className="at-workspace-diff-list"
            >
              {diffsQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
              {diffsQuery.isError ? (
                <div className="at-project-state is-error">
                  {errorMessage(diffsQuery.error, t("workspaceLoadChangesError"))}
                </div>
              ) : null}
              {diffsQuery.data !== undefined && diffFiles.length === 0 ? (
                <div className="at-project-state">
                  {diffsQuery.data.diff_message ?? t("workspaceNoChanges")}
                </div>
              ) : null}
              {diffFiles.map((file) => (
                <WorkspaceDiffEntry
                  file={file}
                  key={`${file.change_type}:${file.path}`}
                  onSelect={() => setSelectedDiffPath(file.path)}
                  selected={file.path === effectiveSelectedDiffPath}
                />
              ))}
            </section>
            <section
              aria-label={t("workspaceDiffPreview")}
              className="at-workspace-diff-preview"
            >
              <WorkspaceDiffPreview
                diffFile={diffFileQuery.data}
                error={diffFileQuery.error}
                loading={diffFileQuery.isFetching}
                selectedPath={effectiveSelectedDiffPath}
                t={t}
              />
            </section>
            <WorkspaceFilePane
              diffFilesByPath={diffFilesByPath}
              entries={filePaneEntries}
              error={
                normalizedTreeFilter.length > 0
                  ? fileSearchQuery.error
                  : rootTreeQuery.error
              }
              filter={treeFilter}
              loading={
                normalizedTreeFilter.length > 0
                  ? fileSearchQuery.isFetching
                  : rootTreeQuery.isLoading
              }
              onFilterChange={setTreeFilter}
              onSelectDiff={(path) => setSelectedDiffPath(path)}
              selectedPath={effectiveSelectedDiffPath}
              t={t}
            />
          </div>
        )}
      </div>
    </section>
  );

  function refreshWorkspace(targetWorkspaceId: string) {
    void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "snapshot", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "diffs", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "diff", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "tree", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "search", targetWorkspaceId],
    });
  }
}

function WorkspaceTreeEntry({
  entry,
  t,
}: {
  entry: WorkspaceFilePaneEntry;
  t: Translate;
}) {
  const Icon = entry.kind === "directory" ? FolderClosed : File;
  return (
    <div className="at-workspace-tree-row" title={entry.path}>
      <Icon aria-hidden="true" size={15} />
      <span>{entry.name}</span>
      {entry.kind === "directory" &&
      "has_children" in entry &&
      entry.has_children === true ? (
        <span className="at-workspace-tree-meta">{t("workspaceContainsItems")}</span>
      ) : null}
    </div>
  );
}

function WorkspaceFilePane({
  diffFilesByPath,
  entries,
  error,
  filter,
  loading,
  onFilterChange,
  onSelectDiff,
  selectedPath,
  t,
}: {
  diffFilesByPath: Map<string, WorkspaceDiffFileSummary>;
  entries: WorkspaceFilePaneEntry[];
  error: Error | null;
  filter: string;
  loading: boolean;
  onFilterChange: (value: string) => void;
  onSelectDiff: (path: string) => void;
  selectedPath: string | null;
  t: Translate;
}) {
  return (
    <section aria-label={t("workspaceFileTree")} className="at-workspace-file-pane">
      <div className="at-workspace-file-pane-filter">
        <Input
          allowClear
          aria-label={t("workspaceFilterFiles")}
          className="at-workspace-tree-filter"
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder={t("workspaceFilterFiles")}
          prefix={<Search aria-hidden="true" size={14} />}
          size="small"
          value={filter}
        />
      </div>
      {loading && entries.length === 0 ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
      {error !== null ? (
        <div className="at-project-state is-error">
          {errorMessage(
            error,
            filter.trim().length > 0
              ? t("workspaceSearchFilesError")
              : t("workspaceLoadTreeError"),
          )}
        </div>
      ) : null}
      {!loading && error === null && entries.length === 0 ? (
        <div className="at-project-state">
          {filter.trim().length > 0
            ? t("workspaceNoFileMatches")
            : t("workspaceNoRootEntries")}
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="at-workspace-file-pane-list">
          {entries.map((entry) => (
            <WorkspaceFilePaneRow
              diffFile={diffFilesByPath.get(entry.path)}
              entry={entry}
              key={`${entry.kind}:${entry.path}`}
              onSelectDiff={onSelectDiff}
              selected={entry.path === selectedPath}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceFilePaneRow({
  diffFile,
  entry,
  onSelectDiff,
  selected,
  t,
}: {
  diffFile: WorkspaceDiffFileSummary | undefined;
  entry: WorkspaceFilePaneEntry;
  onSelectDiff: (path: string) => void;
  selected: boolean;
  t: Translate;
}) {
  const Icon = entry.kind === "directory" ? FolderClosed : File;
  const content = (
    <>
      <Icon aria-hidden="true" size={15} />
      <span className="at-workspace-file-pane-name">{entry.name}</span>
      {diffFile !== undefined ? (
        <span className={`at-workspace-diff-status is-${diffFile.change_type}`}>
          {changeLabel(diffFile.change_type)}
        </span>
      ) : null}
    </>
  );
  if (diffFile !== undefined) {
    return (
      <button
        aria-current={selected ? "page" : undefined}
        aria-label={t("workspaceOpenChangedFile", { path: entry.path })}
        className={
          selected
            ? "at-workspace-file-pane-row is-action is-selected"
            : "at-workspace-file-pane-row is-action"
        }
        onClick={() => onSelectDiff(entry.path)}
        title={entry.path}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="at-workspace-file-pane-row" title={entry.path}>
      {content}
    </div>
  );
}

function WorkspaceDiffEntry({
  file,
  onSelect,
  selected,
}: {
  file: WorkspaceDiffFileSummary;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-current={selected ? "page" : undefined}
      aria-label={`${changeLabel(file.change_type)} ${file.path}`}
      className={
        selected
          ? "at-workspace-diff-file is-selected"
          : "at-workspace-diff-file"
      }
      onClick={onSelect}
      title={file.path}
      type="button"
    >
      <GitBranch aria-hidden="true" size={15} />
      <span className={`at-workspace-diff-status is-${file.change_type}`}>
        {changeLabel(file.change_type)}
      </span>
      <span className="at-workspace-diff-path">{file.path}</span>
    </button>
  );
}

function WorkspaceDiffPreview({
  diffFile,
  error,
  loading,
  selectedPath,
  t,
}: {
  diffFile: WorkspaceDiffFile | undefined;
  error: Error | null;
  loading: boolean;
  selectedPath: string | null;
  t: Translate;
}) {
  if (selectedPath === null) {
    return <div className="at-project-state">{t("workspaceNoDiffSelected")}</div>;
  }
  if (loading && diffFile === undefined) {
    return <Skeleton active paragraph={{ rows: 14 }} />;
  }
  if (error !== null) {
    return (
      <div className="at-project-state is-error">
        {errorMessage(error, t("workspaceDiffLoadError"))}
      </div>
    );
  }
  if (diffFile?.is_binary === true) {
    return <div className="at-project-state">{t("workspaceBinaryDiff")}</div>;
  }
  const lines = buildDiffLines(diffFile?.diff ?? "");
  if (lines.length === 0) {
    return <div className="at-project-state">{t("workspaceNoChanges")}</div>;
  }
  return (
    <div className={loading ? "at-workspace-diff-body is-loading" : "at-workspace-diff-body"}>
      {lines.map((line) => (
        <div
          className={`at-workspace-diff-line is-${line.kind}`}
          key={`${line.lineNumber}:${line.text}`}
        >
          <span className="at-workspace-diff-line-number">{line.lineNumber}</span>
          <span className="at-workspace-diff-line-text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}

function buildDiffLines(diff: string): DiffLine[] {
  return diff.split(/\r?\n/).map((text, index) => ({
    kind: diffLineKind(text),
    lineNumber: index + 1,
    text,
  }));
}

function diffLineKind(text: string): DiffLine["kind"] {
  if (text.startsWith("@@")) {
    return "hunk";
  }
  if (text.startsWith("+++") || text.startsWith("---")) {
    return "meta";
  }
  if (text.startsWith("+")) {
    return "added";
  }
  if (text.startsWith("-")) {
    return "deleted";
  }
  return "context";
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
}

function workspaceRoot(
  workspace: WorkspaceRecord,
  snapshot: WorkspaceSnapshot | undefined,
): string {
  return (
    snapshot?.root_path?.trim() ||
    snapshot?.default_mount_root?.trim() ||
    workspace.root_path.trim() ||
    workspace.workspace_id
  );
}

function changeLabel(changeType: string): string {
  return changeType.replaceAll("_", " ");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}
