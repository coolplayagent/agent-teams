import {
  App,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Tooltip,
  Typography,
} from "antd";
import type { InputRef, MenuProps } from "antd";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderSearch,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createSession,
  deleteWorkspace,
  deleteSession,
  listSidebarSessions,
  listSessionSubagents,
  listWorkspaces,
  pickWorkspace,
  updateSession,
} from "../../api/client";
import type {
  SessionCreateRequest,
  SessionRecord,
  SessionSidebarRecord,
  SessionSubagentRecord,
  WorkspaceRecord,
} from "../../api/contracts";
import {
  workspaceDisplayLabel,
  workspaceFallbackLabel,
} from "../workspaces/workspaceLabels";
import { useUiStore, type Language } from "../../runtime/uiStore";
import { useTranslations, type Translate } from "../../i18n";
import { sessionDisplayLabel } from "./sessionLabels";

const initialVisibleSessionsPerGroup = 10;
const visibleSessionIncrement = 20;
const activeRunIndicatorStatuses = new Set(["queued", "running", "stopping"]);
const maxConcurrentSessionSubagentLoads = 2;
const chronologicalSessionGroupId = "__chronological_sessions__";
let activeSessionSubagentLoads = 0;
const queuedSessionSubagentLoads: SessionSubagentLoadTask[] = [];

type SessionRunIndicatorType = "failed" | "running" | "stopped" | "unread";
type WorkspaceSortMode = "project_updated" | "project_created" | "time";

interface SessionSubagentLoadTask {
  run: () => void;
}

export interface SidebarNavigationItem {
  active?: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}

export type SidebarBackendStatusTone = "busy" | "checking" | "offline" | "online";

export interface SidebarBackendStatus {
  label: string;
  tone: SidebarBackendStatusTone;
}

export interface ActiveSubagentSession {
  createdAt: string;
  instanceId: string;
  interactive: boolean;
  lastEventId: number | null;
  promptText: string;
  roleId: string;
  runId: string;
  runPhase: string;
  runStatus: string;
  sessionId: string;
  sourceRunId?: string;
  sourceToolCallId?: string;
  status: string;
  subagentKind: string;
  title: string;
  updatedAt: string;
}

interface SessionsSidebarProps {
  activeSubagent?: ActiveSubagentSession | null;
  backendStatus?: SidebarBackendStatus;
  navigationItems?: SidebarNavigationItem[];
  onOpenNewSession?: () => void;
  onOpenSessionSearch?: () => void;
  onOpenWorkspaceView?: () => void;
  onSessionSelected?: () => void;
  onSubagentSelected?: (subagent: ActiveSubagentSession) => void;
  workspaceViewActive?: boolean;
}

interface RenameSessionPayload {
  sessionId: string;
  title: string;
}

interface DeleteWorkspacePayload {
  removeDirectory: boolean;
  workspaceId: string;
}

function sessionDetailQueryKey(sessionId: string) {
  return ["sessions", "detail", sessionId] as const;
}

function normalModelProfileForNewSession(
  queryClient: QueryClient,
  selectedSessionId: string | null,
): string | null {
  if (selectedSessionId === null) {
    return null;
  }
  const selectedSession = queryClient.getQueryData<SessionRecord>(
    sessionDetailQueryKey(selectedSessionId),
  );
  const normalModelProfile = selectedSession?.normal_model_profile?.trim() ?? "";
  return normalModelProfile.length > 0 ? normalModelProfile : null;
}

function sessionCreateRequest(
  queryClient: QueryClient,
  selectedSessionId: string | null,
  workspaceId: string,
): SessionCreateRequest {
  const normalModelProfile = normalModelProfileForNewSession(
    queryClient,
    selectedSessionId,
  );
  if (normalModelProfile === null) {
    return { workspace_id: workspaceId };
  }
  return {
    normal_model_profile: normalModelProfile,
    workspace_id: workspaceId,
  };
}

export function SessionsSidebar({
  activeSubagent = null,
  backendStatus,
  navigationItems = [],
  onOpenNewSession,
  onOpenSessionSearch,
  onOpenWorkspaceView,
  onSessionSelected,
  onSubagentSelected,
  workspaceViewActive = false,
}: SessionsSidebarProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const language = useUiStore((state) => state.language);
  const selectedSessionId = useUiStore((state) => state.selectedSessionId);
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSelectedSessionId = useUiStore((state) => state.setSelectedSessionId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const [filter, setFilter] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [workspaceSortMode, setWorkspaceSortMode] =
    useState<WorkspaceSortMode>("project_updated");
  const [visibleSessionLimits, setVisibleSessionLimits] = useState<
    Record<string, number>
  >({});
  const [workspaceExpanded, setWorkspaceExpanded] = useState<
    Record<string, boolean>
  >({});
  const [expandedSubagentSessions, setExpandedSubagentSessions] = useState<
    Record<string, boolean>
  >({});
  const [renameTarget, setRenameTarget] = useState<SessionSidebarRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SessionSidebarRecord | null>(null);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] =
    useState<WorkspaceRecord | null>(null);
  const [deleteWorkspaceRemoveDirectory, setDeleteWorkspaceRemoveDirectory] =
    useState(false);
  const searchInputRef = useRef<InputRef>(null);
  const focusSearchOnExpandRef = useRef(false);
  const selectedSessionItemRef = useRef<HTMLDivElement | null>(null);
  const scrolledSelectedSessionIdRef = useRef<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "sidebar"],
    queryFn: () => listSidebarSessions(false),
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const sidebarQueryError = sessionsQuery.isError
    ? t("sidebarSessionsLoadError")
    : workspacesQuery.isError
      ? t("sidebarWorkspacesLoadError")
      : null;
  const retrySidebarQueries = () => {
    void Promise.all([sessionsQuery.refetch(), workspacesQuery.refetch()]);
  };

  const workspaceOptions = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const workspaceById = useMemo(
    () =>
      new Map(
        workspaceOptions.map((workspace) => [workspace.workspace_id, workspace]),
      ),
    [workspaceOptions],
  );
  const loadedWorkspaceIds = useMemo(
    () => new Set((workspacesQuery.data ?? []).map((item) => item.workspace_id)),
    [workspacesQuery.data],
  );
  const selectedLoadedWorkspaceId =
    selectedWorkspaceId !== null && loadedWorkspaceIds.has(selectedWorkspaceId)
      ? selectedWorkspaceId
      : null;
  const effectiveWorkspaceId =
    selectedLoadedWorkspaceId ?? workspaceOptions[0]?.workspace_id ?? "";

  useEffect(() => {
    const firstWorkspaceId = workspacesQuery.data?.[0]?.workspace_id;
    if (firstWorkspaceId === undefined) {
      return;
    }
    if (selectedWorkspaceId === null || !loadedWorkspaceIds.has(selectedWorkspaceId)) {
      setSelectedWorkspaceId(firstWorkspaceId);
    }
  }, [
    loadedWorkspaceIds,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesQuery.data,
  ]);
  useEffect(() => {
    const focusSearch = () => {
      if (searchExpanded) {
        searchInputRef.current?.focus();
        return;
      }
      focusSearchOnExpandRef.current = true;
      setSearchExpanded(true);
    };
    window.addEventListener("agent-teams-focus-session-search", focusSearch);
    return () => {
      window.removeEventListener("agent-teams-focus-session-search", focusSearch);
    };
  }, [searchExpanded]);
  useEffect(() => {
    if (!searchExpanded || !focusSearchOnExpandRef.current) {
      return;
    }
    focusSearchOnExpandRef.current = false;
    searchInputRef.current?.focus();
  }, [searchExpanded]);

  const createSessionMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      createSession(
        sessionCreateRequest(queryClient, selectedSessionId, workspaceId),
      ),
    onSuccess: (session) => {
      setSelectedWorkspaceId(session.workspace_id);
      setSelectedSessionId(session.session_id);
      onSessionSelected?.();
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", session.session_id] });
      void message.success(t("sidebarCreated"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarCreateFailed"),
      );
    },
  });
  const pickWorkspaceMutation = useMutation({
    mutationFn: () => pickWorkspace(),
    onSuccess: (response) => {
      const workspace = response.workspace;
      if (workspace === null) {
        return;
      }
      setSelectedWorkspaceId(workspace.workspace_id);
      queryClient.setQueryData<WorkspaceRecord[]>(["workspaces"], (current) =>
        upsertWorkspace(current ?? [], workspace),
      );
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void message.success(t("sidebarNewProjectSaved"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarNewProjectFailed"),
      );
    },
  });
  const renameSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: RenameSessionPayload) =>
      updateSession(sessionId, { title }),
    onSuccess: (_result, payload) => {
      resetRenameSession();
      invalidateSessionCaches(payload.sessionId);
      void message.success(t("sidebarRenameSaved"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarRenameFailed"),
      );
    },
  });
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      deleteSession(sessionId, { cascade: true, force: true }),
    onSuccess: (_result, sessionId) => {
      resetDeleteSession();
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
      invalidateSessionCaches(sessionId);
      void message.success(t("sidebarDeleteSaved"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarDeleteFailed"),
      );
    },
  });
  const deleteWorkspaceMutation = useMutation({
    mutationFn: ({ removeDirectory, workspaceId }: DeleteWorkspacePayload) =>
      deleteWorkspace(workspaceId, { removeDirectory }),
    onSuccess: (_result, payload) => {
      const remainingWorkspaces = workspaceOptions.filter(
        (workspace) => workspace.workspace_id !== payload.workspaceId,
      );
      resetDeleteWorkspace();
      queryClient.setQueryData<WorkspaceRecord[]>(["workspaces"], (current) =>
        (current ?? []).filter(
          (workspace) => workspace.workspace_id !== payload.workspaceId,
        ),
      );
      if (selectedWorkspaceId === payload.workspaceId) {
        setSelectedWorkspaceId(remainingWorkspaces[0]?.workspace_id ?? null);
        setSelectedSessionId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void message.success(t("sidebarDeleteWorkspaceSaved"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("sidebarDeleteWorkspaceFailed"),
      );
    },
  });

  const filteredSessions = useMemo(() => {
    const records = sessionsQuery.data ?? [];
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) {
      return records;
    }
    const workspaceLabels = new Map(
      workspaceOptions.map((workspace) => [
        workspace.workspace_id,
        workspaceLabel(workspace).toLowerCase(),
      ]),
    );
    return records.filter((session) => {
      const workspaceId = session.workspace_id ?? "";
      const workspaceSearch =
        workspaceLabels.get(workspaceId) ?? workspaceFallbackLabel(workspaceId);
      return (
        sessionLabel(session).toLowerCase().includes(normalizedFilter) ||
        workspaceSearch.includes(normalizedFilter)
      );
    });
  }, [filter, sessionsQuery.data, workspaceOptions]);
  const isFiltering = filter.trim().length > 0;
  const isChronologicalMode = workspaceSortMode === "time";
  const includeEmptyWorkspaces = !isFiltering && !isChronologicalMode;
  const chronologicalSessions = useMemo(
    () => sortSessions(filteredSessions),
    [filteredSessions],
  );
  const visibleChronologicalSessions = visibleSessionsForList(
    chronologicalSessions,
    selectedSessionId,
    visibleSessionLimits[chronologicalSessionGroupId],
    isFiltering,
  );
  const hiddenChronologicalSessionCount =
    chronologicalSessions.length - visibleChronologicalSessions.length;
  const sessionGroups = useMemo(
    () =>
      buildSessionGroups(
        workspaceOptions,
        filteredSessions,
        includeEmptyWorkspaces,
        workspaceSortMode,
      ),
    [filteredSessions, includeEmptyWorkspaces, workspaceOptions, workspaceSortMode],
  );
  const totalVisibleSessions = sessionGroups.reduce(
    (total, group) => total + group.sessions.length,
    0,
  );
  const totalAvailableSessions = isChronologicalMode
    ? chronologicalSessions.length
    : totalVisibleSessions;
  const showSearchRow = searchExpanded || isFiltering;
  const sortLabel = workspaceSortLabel(workspaceSortMode, t);
  const sortMenuItems: MenuProps["items"] = [
    {
      key: "project_created",
      label: t("sidebarSortProjectCreated"),
    },
    {
      key: "project_updated",
      label: t("sidebarSortProjectUpdated"),
    },
    {
      key: "time",
      label: t("sidebarSortChronologicalSessions"),
    },
  ];

  useEffect(() => {
    if (selectedSessionId === null) {
      scrolledSelectedSessionIdRef.current = null;
      return;
    }
    const selectedSessionItem = selectedSessionItemRef.current;
    if (selectedSessionItem === null) {
      return;
    }
    if (typeof selectedSessionItem.scrollIntoView !== "function") {
      return;
    }
    if (scrolledSelectedSessionIdRef.current === selectedSessionId) {
      return;
    }
    scrolledSelectedSessionIdRef.current = selectedSessionId;
    selectedSessionItem.scrollIntoView({ block: "nearest" });
  }, [selectedSessionId, totalAvailableSessions]);

  function renderSessionStack(session: SessionSidebarRecord) {
    const selected = session.session_id === selectedSessionId;
    const rawIndicatorType = sessionRunIndicatorType(session);
    const indicatorType =
      selected && rawIndicatorType === "unread" ? null : rawIndicatorType;
    return (
      <div className="at-session-stack" key={session.session_id}>
        <div
          className={`${sessionItemClassName(selected, indicatorType)}${
            deleteTarget?.session_id === session.session_id
              ? " has-open-confirm"
              : ""
          }`}
          ref={selected ? selectedSessionItemRef : undefined}
        >
          <div className="at-session-copy">
            <button
              aria-current={selected ? "page" : undefined}
              className="at-session-select"
              onClick={() => selectSession(session)}
              title={sessionLabel(session)}
              type="button"
            >
              <Typography.Text
                className="at-session-label"
                ellipsis
                title={sessionLabel(session)}
              >
                {sessionLabel(session)}
              </Typography.Text>
            </button>
            <div className="at-session-meta-slot">
              {sessionMeta(session, t, language, indicatorType)}
              <div className="at-session-actions">
                <Tooltip title={t("sidebarRenameSession")}>
                  <Button
                    aria-label={t("sidebarRenameSession")}
                    className="at-session-action-button"
                    icon={<Pencil size={13} />}
                    onClick={() => openRenameSession(session)}
                    size="small"
                    type="text"
                  />
                </Tooltip>
                <Popconfirm
                  cancelText={t("sidebarDeleteCancel")}
                  description={t("sidebarDeleteMessage", {
                    label: sessionLabel(session) || session.session_id,
                  })}
                  okButtonProps={{ danger: true, loading: deleteSessionMutation.isPending }}
                  okText={t("sidebarDeleteConfirm")}
                  onConfirm={submitDeleteSession}
                  onOpenChange={(open) => {
                    if (open) {
                      setDeleteTarget(session);
                    } else if (!deleteSessionMutation.isPending) {
                      resetDeleteSession();
                    }
                  }}
                  open={deleteTarget?.session_id === session.session_id}
                  title={t("sidebarDeleteTitle")}
                >
                  <Tooltip title={t("sidebarDeleteSession")}>
                    <Button
                      aria-label={t("sidebarDeleteSession")}
                      className="at-session-action-button"
                      danger
                      icon={<Trash2 size={13} />}
                      size="small"
                      type="text"
                    />
                  </Tooltip>
                </Popconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="at-sidebar-inner">
      <div className="at-sidebar-primary-actions">
        <Button
          block
          className="at-sidebar-new-session"
          disabled={workspaceOptions.length === 0 || !effectiveWorkspaceId.trim()}
          icon={<Plus size={15} />}
          loading={createSessionMutation.isPending}
          onClick={() => {
            if (onOpenNewSession !== undefined) {
              onOpenNewSession();
              return;
            }
            createSessionMutation.mutate(effectiveWorkspaceId);
          }}
          type="primary"
        >
          {t("sidebarNewSession")}
        </Button>
        {onOpenSessionSearch !== undefined ? (
          <Tooltip title={`${t("sidebarSearchSessions")} (Ctrl+K)`}>
            <Button
              aria-label={t("sidebarSearchSessions")}
              className="at-sidebar-open-search"
              icon={<Search size={16} />}
              onClick={onOpenSessionSearch}
              type="default"
            />
          </Tooltip>
        ) : null}
      </div>
      {navigationItems.length > 0 ? (
        <nav aria-label={t("sidebarPrimaryNavigation")} className="at-sidebar-nav">
          {navigationItems.map((item) => (
            <button
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
              className={
                item.active ? "at-sidebar-nav-item is-active" : "at-sidebar-nav-item"
              }
              key={item.key}
              onClick={item.onSelect}
              type="button"
            >
              <span aria-hidden="true" className="at-sidebar-nav-icon">
                {item.icon}
              </span>
              <span className="at-sidebar-nav-label">{item.label}</span>
              {item.shortcut !== undefined ? (
                <span aria-hidden="true" className="at-sidebar-nav-shortcut">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="at-sidebar-section-header">
        <span>{t("sidebarWorkspaces")}</span>
        <div className="at-sidebar-section-actions">
          <Tooltip title={t("sidebarNewProject")}>
            <Button
              aria-label={t("sidebarNewProject")}
              icon={<Plus size={14} />}
              loading={pickWorkspaceMutation.isPending}
              onClick={() => pickWorkspaceMutation.mutate()}
              size="small"
              type="text"
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: sortMenuItems,
              onClick: ({ key }) => {
                if (
                  key === "project_created" ||
                  key === "project_updated" ||
                  key === "time"
                ) {
                  setWorkspaceSortMode(key);
                }
              },
              selectedKeys: [workspaceSortMode],
            }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <Button
              aria-haspopup="menu"
              aria-label={sortLabel}
              icon={<ArrowDownUp size={14} />}
              size="small"
              title={sortLabel}
              type="text"
            />
          </Dropdown>
        </div>
      </div>
      {showSearchRow ? (
        <div className="at-sidebar-search-row">
          <Input.Search
            allowClear
            aria-label={t("sidebarSearchSessions")}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("sidebarSearchSessions")}
            ref={searchInputRef}
            size="small"
            value={filter}
          />
        </div>
      ) : null}
      {sessionsQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {sidebarQueryError !== null ? (
        <Empty
          className="at-sidebar-query-error"
          description={sidebarQueryError}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            icon={<RefreshCw aria-hidden="true" size={13} />}
            loading={sessionsQuery.isFetching || workspacesQuery.isFetching}
            onClick={retrySidebarQueries}
            size="small"
          >
            {t("sidebarRetryLoad")}
          </Button>
        </Empty>
      ) : null}
      {!sessionsQuery.isLoading &&
      !sessionsQuery.isError &&
      totalAvailableSessions === 0 &&
      sessionGroups.length === 0 ? (
        <Empty description={t("sidebarNoSessions")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <div className="at-session-list">
        {isChronologicalMode && chronologicalSessions.length > 0 ? (
          <section
            aria-label={t("sidebarSortChronologicalSessions")}
            className="at-workspace-group at-session-flat-group"
          >
            <div className="at-workspace-group-header at-session-flat-header">
              <span className="at-workspace-group-title">
                {t("workspaceSessions")}
              </span>
              <span className="at-workspace-group-path">
                {visibleChronologicalSessions.length}/{chronologicalSessions.length}
              </span>
            </div>
            <div className="at-workspace-group-sessions">
              {visibleChronologicalSessions.map(renderSessionStack)}
              {hiddenChronologicalSessionCount > 0 ? (
                <button
                  aria-label={t("sidebarShowMoreSessions")}
                  className="at-workspace-group-more"
                  onClick={() => showMoreSessions(chronologicalSessionGroupId)}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" size={14} />
                  <span>{t("sidebarShowMore")}</span>
                  <span className="at-workspace-group-more-count">
                    {visibleChronologicalSessions.length}/
                    {chronologicalSessions.length}
                  </span>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
        {!isChronologicalMode ? sessionGroups.map((group) => {
          const workspaceRecord = workspaceById.get(group.id);
          const groupExpanded = isFiltering || workspaceExpanded[group.id] !== false;
          const visibleSessions = visibleSessionsForGroup(
            group,
            selectedSessionId,
            visibleSessionLimits[group.id],
            isFiltering,
          );
          const hiddenSessionCount = group.sessions.length - visibleSessions.length;
          return (
            <section className="at-workspace-group" key={group.id}>
              <div
                aria-expanded={groupExpanded}
                aria-description={group.pathHint || undefined}
                aria-label={t(
                  groupExpanded ? "sidebarCollapse" : "sidebarExpand",
                  { label: group.label },
                )}
                className="at-workspace-group-header"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest(".at-workspace-group-actions")) {
                    return;
                  }
                  toggleWorkspaceGroup(group.id);
                }}
                onKeyDown={(event) => {
                  if ((event.target as HTMLElement).closest(".at-workspace-group-actions")) {
                    return;
                  }
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  toggleWorkspaceGroup(group.id);
                }}
                role="button"
                tabIndex={0}
              >
                <span className="at-workspace-group-toggle" aria-hidden="true">
                  <FolderClosed aria-hidden="true" size={15} />
                  {groupExpanded ? (
                    <ChevronDown aria-hidden="true" size={13} />
                  ) : (
                    <ChevronRight aria-hidden="true" size={13} />
                  )}
                </span>
                <Tooltip title={group.pathHint || group.label}>
                  <span className="at-workspace-group-title">{group.label}</span>
                </Tooltip>
                <div className="at-workspace-group-actions">
                  {onOpenWorkspaceView !== undefined ? (
                    <Tooltip
                      title={t("sidebarOpenWorkspaceViewFor", { label: group.label })}
                    >
                      <Button
                        aria-label={t("sidebarOpenWorkspaceViewFor", {
                          label: group.label,
                        })}
                        aria-pressed={workspaceViewActive && group.id === selectedWorkspaceId}
                        className={
                          workspaceViewActive && group.id === selectedWorkspaceId
                            ? "is-active"
                            : undefined
                        }
                        disabled={workspaceOptions.length === 0}
                        icon={<FolderSearch size={14} />}
                        onClick={() => {
                          setSelectedWorkspaceId(group.id);
                          onOpenWorkspaceView();
                        }}
                        size="small"
                        type="text"
                      />
                    </Tooltip>
                  ) : null}
                  <Tooltip
                    title={t("sidebarNewSessionInWorkspace", { label: group.label })}
                  >
                    <Button
                      aria-label={t("sidebarNewSessionInWorkspace", {
                        label: group.label,
                      })}
                      disabled={!group.id.trim()}
                      icon={<Plus size={14} />}
                      loading={createSessionMutation.isPending}
                      onClick={() => createSessionMutation.mutate(group.id)}
                      size="small"
                      type="text"
                    />
                  </Tooltip>
                  {workspaceRecord !== undefined ? (
                    <Popconfirm
                      cancelText={t("sidebarDeleteCancel")}
                      description={(
                        <div className="at-workspace-delete-confirm">
                          <Typography.Paragraph>
                            {t("sidebarDeleteWorkspaceMessage", { label: group.label })}
                          </Typography.Paragraph>
                          <Checkbox
                            aria-label={t("sidebarDeleteWorkspaceRemoveDirectory")}
                            checked={deleteWorkspaceRemoveDirectory}
                            disabled={deleteWorkspaceMutation.isPending}
                            onChange={(event) =>
                              setDeleteWorkspaceRemoveDirectory(event.target.checked)
                            }
                          >
                            {t("sidebarDeleteWorkspaceRemoveDirectory")}
                          </Checkbox>
                          <Typography.Paragraph>
                            {t("sidebarDeleteWorkspaceRemoveDirectoryHelp")}
                          </Typography.Paragraph>
                        </div>
                      )}
                      okButtonProps={{ danger: true, loading: deleteWorkspaceMutation.isPending }}
                      okText={t("sidebarDeleteConfirm")}
                      onConfirm={submitDeleteWorkspace}
                      onOpenChange={(open) => {
                        if (open) {
                          setDeleteWorkspaceTarget(workspaceRecord);
                          setDeleteWorkspaceRemoveDirectory(false);
                        } else if (!deleteWorkspaceMutation.isPending) {
                          resetDeleteWorkspace();
                        }
                      }}
                      open={deleteWorkspaceTarget?.workspace_id === group.id}
                      title={t("sidebarDeleteWorkspaceTitle")}
                    >
                      <Tooltip title={t("sidebarDeleteWorkspaceFor", { label: group.label })}>
                        <Button
                          aria-label={t("sidebarDeleteWorkspaceFor", { label: group.label })}
                          danger
                          disabled={!group.id.trim()}
                          icon={<Trash2 size={14} />}
                          size="small"
                          type="text"
                        />
                      </Tooltip>
                    </Popconfirm>
                  ) : null}
                </div>
              </div>
              {groupExpanded && group.sessions.length === 0 ? (
                <div className="at-workspace-group-empty">{t("sidebarNoSessions")}</div>
              ) : null}
              {groupExpanded && group.sessions.length > 0 ? (
                <div className="at-workspace-group-sessions">
                  {visibleSessions.map(renderSessionStack)}
                  {hiddenSessionCount > 0 ? (
                    <button
                      aria-label={t("sidebarShowMoreInWorkspace", {
                        label: group.label,
                      })}
                      className="at-workspace-group-more"
                      onClick={() => showMoreSessions(group.id)}
                      type="button"
                    >
                      <ChevronDown aria-hidden="true" size={14} />
                      <span>{t("sidebarShowMore")}</span>
                      <span className="at-workspace-group-more-count">
                        {visibleSessions.length}/{group.sessions.length}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        }) : null}
      </div>
      {backendStatus !== undefined ? (
        <div className="at-sidebar-footer">
          <div
            aria-busy={
              backendStatus.tone === "checking" ? "true" : "false"
            }
            className={`at-sidebar-backend-status is-${backendStatus.tone}`}
            role="status"
            title={backendStatus.label}
          >
            <span aria-hidden="true" className="at-sidebar-backend-dot" />
            <span className="at-sidebar-backend-label">{backendStatus.label}</span>
          </div>
        </div>
      ) : null}
      <Modal
        cancelText={t("sidebarRenameCancel")}
        destroyOnHidden
        okButtonProps={{
          disabled: renameValue.trim().length === 0,
          loading: renameSessionMutation.isPending,
        }}
        okText={t("sidebarRenameSave")}
        onCancel={closeRenameSession}
        onOk={submitRenameSession}
        open={renameTarget !== null}
        title={t("sidebarRenameTitle")}
      >
        <Typography.Paragraph className="at-session-modal-copy">
          {t("sidebarRenameMessage")}
        </Typography.Paragraph>
        <Input
          aria-label={t("sidebarRenameInput")}
          autoFocus
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={submitRenameSession}
          value={renameValue}
        />
      </Modal>
    </div>
  );

  function selectSession(session: SessionSidebarRecord) {
    if (session.workspace_id) {
      setSelectedWorkspaceId(session.workspace_id);
    }
    setSelectedSessionId(session.session_id);
    onSessionSelected?.();
  }

  function selectSubagent(subagent: ActiveSubagentSession) {
    const parent = sessionsQuery.data?.find(
      (session) => session.session_id === subagent.sessionId,
    );
    if (parent?.workspace_id) {
      setSelectedWorkspaceId(parent.workspace_id);
    }
    setSelectedSessionId(subagent.sessionId);
    onSubagentSelected?.(subagent);
  }

  function openRenameSession(session: SessionSidebarRecord) {
    setRenameTarget(session);
    setRenameValue(sessionLabel(session));
  }

  function closeRenameSession() {
    if (renameSessionMutation.isPending) {
      return;
    }
    resetRenameSession();
  }

  function resetRenameSession() {
    setRenameTarget(null);
    setRenameValue("");
  }

  function submitRenameSession() {
    const title = renameValue.trim();
    if (renameTarget === null || !title || renameSessionMutation.isPending) {
      return;
    }
    if (title === sessionLabel(renameTarget)) {
      closeRenameSession();
      return;
    }
    renameSessionMutation.mutate({
      sessionId: renameTarget.session_id,
      title,
    });
  }

  function resetDeleteSession() {
    setDeleteTarget(null);
  }

  function submitDeleteSession() {
    if (deleteTarget === null || deleteSessionMutation.isPending) {
      return;
    }
    deleteSessionMutation.mutate(deleteTarget.session_id);
  }

  function resetDeleteWorkspace() {
    setDeleteWorkspaceTarget(null);
    setDeleteWorkspaceRemoveDirectory(false);
  }

  function submitDeleteWorkspace() {
    if (deleteWorkspaceTarget === null || deleteWorkspaceMutation.isPending) {
      return;
    }
    deleteWorkspaceMutation.mutate({
      removeDirectory: deleteWorkspaceRemoveDirectory,
      workspaceId: deleteWorkspaceTarget.workspace_id,
    });
  }

  function invalidateSessionCaches(sessionId: string) {
    void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
    void queryClient.invalidateQueries({
      queryKey: ["sessions", "detail", sessionId],
    });
  }

  function showMoreSessions(groupId: string) {
    setVisibleSessionLimits((current) => ({
      ...current,
      [groupId]:
        (current[groupId] ?? initialVisibleSessionsPerGroup) +
        visibleSessionIncrement,
    }));
  }

  function toggleWorkspaceGroup(groupId: string) {
    setWorkspaceExpanded((current) => ({
      ...current,
      [groupId]: current[groupId] === false,
    }));
  }

  function toggleSessionSubagents(sessionId: string) {
    setExpandedSubagentSessions((current) => ({
      ...current,
      [sessionId]: current[sessionId] !== true,
    }));
  }
}

interface SessionSubagentListProps {
  activeSubagent: ActiveSubagentSession | null;
  onSubagentSelected: (subagent: ActiveSubagentSession) => void;
  parentSession: SessionSidebarRecord;
}

function SessionSubagentList({
  activeSubagent,
  onSubagentSelected,
  parentSession,
}: SessionSubagentListProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const language = useUiStore((state) => state.language);
  const subagentQueryKey = useMemo(
    () => ["sessions", parentSession.session_id, "subagents"] as const,
    [parentSession.session_id],
  );
  const subagentsQuery = useQuery({
    queryKey: subagentQueryKey,
    queryFn: () =>
      listSessionSubagentsWithLimit(
        parentSession.session_id,
        queryClient.getQueryState(subagentQueryKey)?.isInvalidated === true,
      ),
    staleTime: 5000,
  });
  const subagents = useMemo(
    () =>
      (subagentsQuery.data ?? [])
        .map((record) => normalizeSessionSubagent(record, parentSession.session_id))
        .filter((record): record is ActiveSubagentSession => record !== null)
        .sort((left, right) =>
          String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
        ),
    [parentSession.session_id, subagentsQuery.data],
  );

  if (subagentsQuery.isLoading) {
    return (
      <div className="at-session-subagent-list" role="status">
        <div className="at-session-subagent-empty">
          {t("sidebarSubagentSessionsLoading")}
        </div>
      </div>
    );
  }
  if (subagentsQuery.isError) {
    return (
      <div className="at-session-subagent-list" role="status">
        <div className="at-session-subagent-empty is-error">
          {t("sidebarSubagentSessionsLoadError")}
        </div>
      </div>
    );
  }
  if (subagents.length === 0) {
    return (
      <div className="at-session-subagent-list">
        <div className="at-session-subagent-empty">
          {t("sidebarSubagentSessionsEmpty")}
        </div>
      </div>
    );
  }
  return (
    <div
      aria-label={t("sidebarSubagentSessionsList", {
        label: sessionLabel(parentSession),
      })}
      className="at-session-subagent-list"
      role="group"
    >
      {subagents.map((subagent) => {
        const label = subagentSessionLabel(subagent);
        const active =
          activeSubagent?.sessionId === subagent.sessionId &&
          activeSubagent.instanceId === subagent.instanceId;
        return (
          <button
            aria-current={active ? "page" : undefined}
            aria-label={t("sidebarOpenSubagentSession", { label })}
            className={
              active
                ? "at-session-subagent-item is-active"
                : "at-session-subagent-item"
            }
            key={subagent.instanceId}
            onClick={() => onSubagentSelected(subagent)}
            title={label}
            type="button"
          >
            <span className="at-session-subagent-label">{label}</span>
            <span className="at-session-subagent-meta">
              <span className={subagentStatusClassName(subagent)}>
                {subagentStatusLabel(subagent)}
              </span>
              {subagent.updatedAt ? (
                <span title={subagent.updatedAt}>
                  {formatRelativeTime(subagent.updatedAt, language)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface SessionGroup {
  createdAt: number;
  id: string;
  label: string;
  pathHint: string;
  sessions: SessionSidebarRecord[];
  updatedAt: number;
}

function sessionLabel(session: SessionSidebarRecord): string {
  return sessionDisplayLabel(session, session.session_id);
}

function listSessionSubagentsWithLimit(
  sessionId: string,
  forceRefresh: boolean,
): Promise<SessionSubagentRecord[]> {
  return new Promise<SessionSubagentRecord[]>((resolve, reject) => {
    queuedSessionSubagentLoads.push({
      run: () => {
        activeSessionSubagentLoads += 1;
        void Promise.resolve()
          .then(() => listSessionSubagents(sessionId, forceRefresh))
          .then(resolve, reject)
          .finally(() => {
            activeSessionSubagentLoads -= 1;
            drainSessionSubagentLoadQueue();
          });
      },
    });
    drainSessionSubagentLoadQueue();
  });
}

function drainSessionSubagentLoadQueue(): void {
  while (
    activeSessionSubagentLoads < maxConcurrentSessionSubagentLoads &&
    queuedSessionSubagentLoads.length > 0
  ) {
    queuedSessionSubagentLoads.shift()?.run();
  }
}

export function normalizeSessionSubagent(
  record: SessionSubagentRecord,
  fallbackSessionId: string,
): ActiveSubagentSession | null {
  const sessionId = firstTrimmed(
    record.session_id,
    fallbackSessionId,
  );
  const instanceId = firstTrimmed(
    record.subagent_instance_id,
    record.instance_id,
  );
  const roleId = firstTrimmed(record.subagent_role_id, record.role_id);
  const runId = firstTrimmed(record.subagent_run_id, record.run_id);
  const subagentKind = normalizeSubagentKind(record);
  if (!sessionId || !instanceId || !roleId || !runId) {
    return null;
  }
  if (isReservedRootRoleId(roleId)) {
    return null;
  }
  const status = normalizeSubagentStatus(record.status);
  return {
    createdAt: firstTrimmed(record.created_at),
    instanceId,
    interactive: record.interactive === true || subagentKind === "orchestration",
    lastEventId: normalizedPositiveInteger(record.last_event_id),
    promptText: "",
    roleId,
    runId,
    runPhase: firstTrimmed(record.run_phase),
    runStatus: normalizeSubagentStatus(record.run_status, status),
    sessionId,
    status,
    subagentKind,
    title: firstTrimmed(record.title),
    updatedAt: firstTrimmed(record.updated_at, record.created_at),
  };
}

function normalizedPositiveInteger(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

function normalizeSubagentKind(record: SessionSubagentRecord): string {
  const explicit = firstTrimmed(record.subagent_kind).toLowerCase();
  if (explicit === "orchestration" || explicit === "live") {
    return "orchestration";
  }
  if (explicit === "normal" || explicit === "session") {
    return "normal";
  }
  const runId = firstTrimmed(record.subagent_run_id, record.run_id);
  return runId.startsWith("subagent_run_") ? "normal" : "orchestration";
}

function normalizeSubagentStatus(
  status: string | undefined,
  fallback = "idle",
): string {
  const safeStatus = firstTrimmed(status, fallback).toLowerCase();
  if (safeStatus === "started" || safeStatus === "pending") {
    return "running";
  }
  return safeStatus || "idle";
}

function isReservedRootRoleId(roleId: string): boolean {
  const normalizedRoleId = roleId.trim().toLowerCase();
  return normalizedRoleId === "coordinator" || normalizedRoleId === "mainagent";
}

function subagentSessionLabel(subagent: ActiveSubagentSession): string {
  return (
    subagent.title ||
    humanizeRoleId(subagent.roleId) ||
    shortIdentifier(subagent.instanceId)
  );
}

function humanizeRoleId(roleId: string): string {
  const safeRoleId = roleId.trim();
  if (!safeRoleId) {
    return "";
  }
  return safeRoleId
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function subagentStatusLabel(subagent: ActiveSubagentSession): string {
  return subagent.runStatus || subagent.status || "idle";
}

function subagentStatusClassName(subagent: ActiveSubagentSession): string {
  const status = subagentStatusLabel(subagent).toLowerCase();
  if (activeRunIndicatorStatuses.has(status)) {
    return "at-session-subagent-status is-running";
  }
  if (status === "failed" || status === "error") {
    return "at-session-subagent-status is-failed";
  }
  if (status === "stopped" || status === "cancelled" || status === "canceled") {
    return "at-session-subagent-status is-stopped";
  }
  return "at-session-subagent-status";
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function shortIdentifier(value: string): string {
  const safeValue = value.trim();
  if (!safeValue) {
    return "unknown";
  }
  return safeValue.length > 8 ? safeValue.slice(0, 8) : safeValue;
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return workspaceDisplayLabel(workspace);
}

function workspaceSortLabel(sortMode: WorkspaceSortMode, t: Translate): string {
  if (sortMode === "project_created") {
    return t("sidebarSortProjectCreated");
  }
  if (sortMode === "time") {
    return t("sidebarSortChronologicalSessions");
  }
  return t("sidebarSortProjectUpdated");
}

function upsertWorkspace(
  workspaces: WorkspaceRecord[],
  workspace: WorkspaceRecord,
): WorkspaceRecord[] {
  const existingIndex = workspaces.findIndex(
    (item) => item.workspace_id === workspace.workspace_id,
  );
  if (existingIndex === -1) {
    return [workspace, ...workspaces];
  }
  return workspaces.map((item, index) =>
    index === existingIndex ? workspace : item,
  );
}

function workspaceCreatedTimestampValue(workspace: WorkspaceRecord): number {
  return timestampValue(workspace.created_at) || workspaceUpdatedTimestampValue(workspace);
}

function workspaceUpdatedTimestampValue(workspace: WorkspaceRecord): number {
  return timestampValue(workspace.updated_at) || timestampValue(workspace.created_at);
}

function buildSessionGroups(
  workspaces: WorkspaceRecord[],
  sessions: SessionSidebarRecord[],
  includeEmptyWorkspaces: boolean,
  sortMode: WorkspaceSortMode,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.workspace_id, workspace]),
  );
  if (includeEmptyWorkspaces) {
    workspaces.forEach((workspace) => {
      groups.set(workspace.workspace_id, {
        createdAt: workspaceCreatedTimestampValue(workspace),
        id: workspace.workspace_id,
        label: workspaceLabel(workspace),
        pathHint: workspace.root_path,
        sessions: [],
        updatedAt: workspaceUpdatedTimestampValue(workspace),
      });
    });
  }
  sessions.forEach((session) => {
    const workspaceId = session.workspace_id?.trim() || "unknown";
    const existing = groups.get(workspaceId);
    const workspace = workspaceById.get(workspaceId);
    const group = existing ?? {
      createdAt:
        workspace === undefined ? 0 : workspaceCreatedTimestampValue(workspace),
      id: workspaceId,
      label:
        workspace === undefined
          ? workspaceFallbackLabel(workspaceId)
          : workspaceLabel(workspace),
      pathHint: workspace?.root_path ?? "",
      sessions: [],
      updatedAt:
        workspace === undefined ? 0 : workspaceUpdatedTimestampValue(workspace),
    };
    group.sessions.push(session);
    group.updatedAt = Math.max(group.updatedAt, sessionTimestampValue(session));
    groups.set(workspaceId, group);
  });
  return Array.from(groups.values())
    .map((group) => {
      const sortedSessions = sortSessions(group.sessions);
      return {
        ...group,
        sessions: sortedSessions,
        updatedAt: group.updatedAt,
      };
    })
    .sort((left, right) => (
      groupSortValue(right, sortMode) - groupSortValue(left, sortMode) ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id)
    ));
}

function groupSortValue(group: SessionGroup, sortMode: WorkspaceSortMode): number {
  return sortMode === "project_created" ? group.createdAt : group.updatedAt;
}

function sortSessions(sessions: SessionSidebarRecord[]): SessionSidebarRecord[] {
  return [...sessions].sort((left, right) => (
    sessionTimestampValue(right) - sessionTimestampValue(left) ||
    sessionLabel(left).localeCompare(sessionLabel(right)) ||
    left.session_id.localeCompare(right.session_id)
  ));
}

function visibleSessionsForGroup(
  group: SessionGroup,
  selectedSessionId: string | null,
  visibleLimit: number | undefined,
  isFiltering: boolean,
): SessionSidebarRecord[] {
  return visibleSessionsForList(
    group.sessions,
    selectedSessionId,
    visibleLimit,
    isFiltering,
  );
}

function visibleSessionsForList(
  sessions: SessionSidebarRecord[],
  selectedSessionId: string | null,
  visibleLimit: number | undefined,
  isFiltering: boolean,
): SessionSidebarRecord[] {
  if (isFiltering) {
    return sessions;
  }
  const limit = Math.max(
    initialVisibleSessionsPerGroup,
    visibleLimit ?? initialVisibleSessionsPerGroup,
  );
  if (sessions.length <= limit) {
    return sessions;
  }
  const selectedIndex = sessions.findIndex(
    (session) => session.session_id === selectedSessionId,
  );
  if (selectedIndex >= limit && limit > 1) {
    return [
      ...sessions.slice(0, limit - 1),
      sessions[selectedIndex],
    ];
  }
  return sessions.slice(0, limit);
}

function sessionTimestampValue(session: SessionSidebarRecord): number {
  return timestampValue(session.updated_at);
}

function timestampValue(value: string | undefined): number {
  if (value === undefined || !value.trim()) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sessionItemClassName(
  selected: boolean,
  indicatorType: SessionRunIndicatorType | null,
): string {
  return [
    "at-session-item",
    selected ? "is-selected" : "",
    indicatorType === null ? "" : "has-run-indicator",
    indicatorType === null ? "" : `has-run-indicator-${indicatorType}`,
  ].filter(Boolean).join(" ");
}

function sessionRunIndicatorType(
  session: SessionSidebarRecord,
): SessionRunIndicatorType | null {
  const status = (session.active_run_status ?? "").trim().toLowerCase();
  if (activeRunIndicatorStatuses.has(status)) {
    return "running";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "stopped") {
    return "stopped";
  }
  if (session.has_unread_terminal_run === true) {
    return "unread";
  }
  return null;
}

function sessionRunIndicatorLabel(
  indicatorType: SessionRunIndicatorType,
  t: Translate,
): string {
  if (indicatorType === "running") {
    return t("sidebarSessionRunning");
  }
  if (indicatorType === "failed") {
    return t("sidebarSessionFailed");
  }
  if (indicatorType === "unread") {
    return t("sidebarSessionUnread");
  }
  return t("sidebarSessionStopped");
}

function sessionMeta(
  session: SessionSidebarRecord,
  t: Translate,
  language: Language,
  indicatorType: SessionRunIndicatorType | null,
) {
  const updatedAt = formatRelativeTime(session.updated_at, language);
  const backgroundTaskCount = positiveCount(session.background_task_count);
  const pendingApprovalCount = positiveCount(session.pending_tool_approval_count);
  const pendingQuestionCount = positiveCount(session.pending_user_question_count);
  if (
    indicatorType === null &&
    !updatedAt &&
    backgroundTaskCount === 0 &&
    pendingApprovalCount === 0 &&
    pendingQuestionCount === 0
  ) {
    return null;
  }
  return (
    <span className="at-session-meta">
      {backgroundTaskCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarBackgroundTasks", { count: backgroundTaskCount })}
        >
          bg {backgroundTaskCount}
        </span>
      ) : null}
      {pendingApprovalCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarPendingApprovals", { count: pendingApprovalCount })}
        >
          ap {pendingApprovalCount}
        </span>
      ) : null}
      {pendingQuestionCount > 0 ? (
        <span
          className="at-session-background"
          title={t("sidebarPendingQuestions", { count: pendingQuestionCount })}
        >
          q {pendingQuestionCount}
        </span>
      ) : null}
      {indicatorType !== null ? (
        <span
          aria-label={sessionRunIndicatorLabel(indicatorType, t)}
          className={`at-session-run-indicator is-${indicatorType}`}
          title={sessionRunIndicatorLabel(indicatorType, t)}
        >
          <span aria-hidden="true" className="at-session-run-indicator-glyph" />
        </span>
      ) : null}
      {updatedAt ? (
        <span className="at-session-time" title={session.updated_at}>
          {updatedAt}
        </span>
      ) : null}
    </span>
  );
}

function positiveCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function formatRelativeTime(value: string | undefined, language: Language): string {
  if (value === undefined || !value.trim()) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs < minuteMs) {
    return language === "zh-CN" ? "现在" : "now";
  }
  if (elapsedMs < hourMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / minuteMs)}分`
      : `${Math.floor(elapsedMs / minuteMs)}m`;
  }
  if (elapsedMs < dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / hourMs)}时`
      : `${Math.floor(elapsedMs / hourMs)}h`;
  }
  if (elapsedMs < 7 * dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / dayMs)}天`
      : `${Math.floor(elapsedMs / dayMs)}d`;
  }
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}
