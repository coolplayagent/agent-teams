import { useEffect, useState } from "react";
import {
  App,
  Button,
  Empty,
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
} from "lucide-react";

import {
  getWorkspaceDiffs,
  getWorkspaceSnapshot,
  listWorkspaces,
  openWorkspaceRoot,
} from "../../api/client";
import type {
  SessionSidebarRecord,
  WorkspaceDiffFileSummary,
  WorkspaceRecord,
  WorkspaceSnapshot,
  WorkspaceTreeNode,
} from "../../api/contracts";
import { useUiStore } from "../../runtime/uiStore";
import { sessionDisplayLabel } from "../sessions/sessionLabels";

const visibleRootEntries = 36;
const visibleDiffEntries = 12;
const visibleSessionEntries = 12;

interface WorkspaceProjectViewProps {
  onBack: () => void;
  selectedWorkspaceId: string | null;
  sessions: SessionSidebarRecord[];
}

export function WorkspaceProjectView({
  onBack,
  selectedWorkspaceId,
  sessions,
}: WorkspaceProjectViewProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const [showAllRootEntries, setShowAllRootEntries] = useState(false);
  const [showAllDiffEntries, setShowAllDiffEntries] = useState(false);
  const [showAllSessionEntries, setShowAllSessionEntries] = useState(false);

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
    setShowAllRootEntries(false);
    setShowAllDiffEntries(false);
    setShowAllSessionEntries(false);
  }, [workspaceId]);

  const snapshotQuery = useQuery({
    queryKey: ["workspaces", "snapshot", workspaceId],
    queryFn: () => getWorkspaceSnapshot(workspaceId),
    enabled: workspaceId.length > 0,
  });
  const diffsQuery = useQuery({
    queryKey: ["workspaces", "diffs", workspaceId],
    queryFn: () => getWorkspaceDiffs(workspaceId),
    enabled: workspaceId.length > 0,
  });
  const openRootMutation = useMutation({
    mutationFn: () => openWorkspaceRoot(workspaceId),
    onSuccess: () => {
      void message.success("Workspace folder opened.");
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Could not open workspace folder.",
      );
    },
  });

  const workspaceSessions = sessions.filter(
    (session) => session.workspace_id === workspaceId,
  );

  if (workspacesQuery.isLoading) {
    return (
      <section aria-label="Workspace project view" className="at-project-view">
        <Skeleton active paragraph={{ rows: 12 }} />
      </section>
    );
  }

  if (workspace === null) {
    return (
      <section aria-label="Workspace project view" className="at-project-view">
        <Empty description="No workspace selected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </section>
    );
  }

  const snapshot = snapshotQuery.data;
  const rootEntries = snapshot?.tree.children ?? [];
  const diffFiles = diffsQuery.data?.diff_files ?? [];
  const rootEntriesToRender = showAllRootEntries
    ? rootEntries
    : rootEntries.slice(0, visibleRootEntries);
  const diffFilesToRender = showAllDiffEntries
    ? diffFiles
    : diffFiles.slice(0, visibleDiffEntries);
  const sessionsToRender = showAllSessionEntries
    ? workspaceSessions
    : workspaceSessions.slice(0, visibleSessionEntries);

  return (
    <section aria-label="Workspace project view" className="at-project-view">
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
            Open folder
          </Button>
          <Button
            aria-label="Reload workspace view"
            icon={<RefreshCcw size={15} />}
            loading={snapshotQuery.isFetching || diffsQuery.isFetching}
            onClick={() => refreshWorkspace(workspaceId)}
            size="small"
          >
            Reload
          </Button>
          <Button
            aria-label="Back to chat"
            icon={<ChevronLeft size={15} />}
            onClick={onBack}
            size="small"
            type="text"
          />
        </div>
      </div>

      <div className="at-project-view-grid">
        <section className="at-project-panel at-project-panel-summary">
          <div className="at-project-panel-header">
            <h3>Workspace</h3>
          </div>
          {snapshotQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : null}
          {snapshotQuery.isError ? (
            <div className="at-project-state is-error">
              {errorMessage(snapshotQuery.error, "Could not load workspace snapshot.")}
            </div>
          ) : null}
          {snapshot !== undefined ? (
            <dl className="at-project-facts">
              <div>
                <dt>Workspace ID</dt>
                <dd>{snapshot.workspace_id}</dd>
              </div>
              <div>
                <dt>Root</dt>
                <dd>{workspaceRoot(workspace, snapshot)}</dd>
              </div>
              <div>
                <dt>Default mount</dt>
                <dd>{snapshot.default_mount_name ?? "default"}</dd>
              </div>
              <div>
                <dt>Root entries</dt>
                <dd>{rootEntries.length}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="at-project-panel at-project-panel-files">
          <div className="at-project-panel-header">
            <h3>Files</h3>
            <span>{shownCountLabel(rootEntriesToRender.length, rootEntries.length)}</span>
          </div>
          {snapshotQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : null}
          {!snapshotQuery.isLoading && rootEntries.length === 0 ? (
            <div className="at-project-state">No root entries loaded.</div>
          ) : null}
          {rootEntries.length > 0 ? (
            <div className="at-project-file-list">
              {rootEntriesToRender.map((entry) => (
                <WorkspaceTreeEntry entry={entry} key={entry.path || entry.name} />
              ))}
            </div>
          ) : null}
          {rootEntries.length > visibleRootEntries ? (
            <ProjectListToggle
              expanded={showAllRootEntries}
              label="files"
              onToggle={() => setShowAllRootEntries((value) => !value)}
              total={rootEntries.length}
            />
          ) : null}
        </section>

        <section className="at-project-panel at-project-panel-changes">
          <div className="at-project-panel-header">
            <h3>Changes</h3>
            <span>{shownCountLabel(diffFilesToRender.length, diffFiles.length)}</span>
          </div>
          {diffsQuery.isLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
          {diffsQuery.isError ? (
            <div className="at-project-state is-error">
              {errorMessage(diffsQuery.error, "Could not load workspace changes.")}
            </div>
          ) : null}
          {diffsQuery.data !== undefined && diffFiles.length === 0 ? (
            <div className="at-project-state">
              {diffsQuery.data.diff_message ?? "No workspace changes."}
            </div>
          ) : null}
          {diffFiles.length > 0 ? (
            <div className="at-project-change-list">
              {diffFilesToRender.map((file) => (
                <WorkspaceDiffEntry file={file} key={`${file.change_type}:${file.path}`} />
              ))}
            </div>
          ) : null}
          {diffFiles.length > visibleDiffEntries ? (
            <ProjectListToggle
              expanded={showAllDiffEntries}
              label="changes"
              onToggle={() => setShowAllDiffEntries((value) => !value)}
              total={diffFiles.length}
            />
          ) : null}
        </section>

        <section className="at-project-panel at-project-panel-sessions">
          <div className="at-project-panel-header">
            <h3>Sessions</h3>
            <span>{shownCountLabel(sessionsToRender.length, workspaceSessions.length)}</span>
          </div>
          {workspaceSessions.length === 0 ? (
            <div className="at-project-state">No sessions in this workspace.</div>
          ) : (
            <div className="at-project-session-list">
              {sessionsToRender.map((session) => (
                <button
                  className="at-project-session-row"
                  key={session.session_id}
                  onClick={() => {
                    setSelectedWorkspaceId(workspaceId);
                    setSelectedSessionId(session.session_id);
                    onBack();
                  }}
                  type="button"
                >
                  <span>{sessionDisplayLabel(session, session.session_id)}</span>
                  <span>{formatProjectTime(session.updated_at)}</span>
                </button>
              ))}
            </div>
          )}
          {workspaceSessions.length > visibleSessionEntries ? (
            <ProjectListToggle
              expanded={showAllSessionEntries}
              label="sessions"
              onToggle={() => setShowAllSessionEntries((value) => !value)}
              total={workspaceSessions.length}
            />
          ) : null}
        </section>
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
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
  }
}

function ProjectListToggle({
  expanded,
  label,
  onToggle,
  total,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
  total: number;
}) {
  const actionLabel = expanded ? `Show fewer ${label}` : `Show all ${label}`;
  return (
    <div className="at-project-list-actions">
      <Button
        aria-label={actionLabel}
        onClick={onToggle}
        size="small"
        type="text"
      >
        {expanded ? "Show fewer" : `Show all ${total}`}
      </Button>
    </div>
  );
}

function WorkspaceTreeEntry({ entry }: { entry: WorkspaceTreeNode }) {
  const Icon = entry.kind === "directory" ? FolderClosed : File;
  return (
    <div className="at-project-file-row" title={entry.path}>
      <Icon aria-hidden="true" size={15} />
      <span>{entry.name}</span>
      {entry.kind === "directory" && entry.has_children === true ? (
        <span className="at-project-file-meta">contains items</span>
      ) : null}
    </div>
  );
}

function WorkspaceDiffEntry({ file }: { file: WorkspaceDiffFileSummary }) {
  return (
    <div className="at-project-change-row" title={file.path}>
      <GitBranch aria-hidden="true" size={15} />
      <span className={`at-project-change-kind is-${file.change_type}`}>
        {changeLabel(file.change_type)}
      </span>
      <span>{file.path}</span>
    </div>
  );
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

function shownCountLabel(shown: number, total: number): string {
  if (total === 0) {
    return "0";
  }
  return `${shown}/${total}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatProjectTime(value: string | undefined): string {
  if (value === undefined || !value.trim()) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}
