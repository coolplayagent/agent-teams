import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Tooltip,
  Typography,
  type FormInstance,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  PauseCircle,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createAutomationProject,
  deleteAutomationProject,
  disableAutomationProject,
  enableAutomationProject,
  getAutomationProject,
  listAutomationDeliveryBindings,
  listAutomationProjects,
  listAutomationProjectSessions,
  listWorkspaces,
  runAutomationProject,
  updateAutomationProject,
} from "../../api/client";
import type {
  AutomationDeliveryBinding,
  AutomationDeliveryBindingCandidate,
  AutomationDeliveryEvent,
  AutomationProjectCreateRequest,
  AutomationProjectUpdateRequest,
  AutomationIntervalUnit,
  AutomationProjectRecord,
  AutomationProjectSessionRecord,
  WorkspaceRecord,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { GitHubSettingsSection } from "../settings/GitHubSettingsSection";

interface AutomationViewProps {
  /** @deprecated GitHub configuration now renders inside the automation workspace. */
  onOpenGitHubSettings?: () => void;
  onSessionSelected?: (sessionId: string, workspaceId?: string | null) => void;
}

type AutomationSchedulePreset =
  | "custom"
  | "daily"
  | "interval"
  | "one_shot"
  | "weekdays";
const DISABLED_DELIVERY_TARGET = "none";

interface AutomationEditorValues {
  cronExpression: string;
  deliveryEvents: AutomationDeliveryEvent[];
  deliveryTargetId: string;
  displayName: string;
  intervalEvery: number;
  intervalUnit: AutomationIntervalUnit;
  name: string;
  prompt: string;
  runAt: string;
  schedulePreset: AutomationSchedulePreset;
  time: string;
  timezone: string;
  workspaceId: string;
}

export function AutomationView({
  onSessionSelected,
}: AutomationViewProps) {
  const { message, modal } = App.useApp();
  const [createForm] = Form.useForm<AutomationEditorValues>();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"github" | "schedules">("schedules");
  const [githubVisited, setGitHubVisited] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selectTab = (tab: "github" | "schedules") => {
    setActiveTab(tab);
    if (tab === "github") {
      setGitHubVisited(true);
    }
  };

  const projectsQuery = useQuery({
    queryKey: ["automation", "projects"],
    queryFn: listAutomationProjects,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const deliveryBindingsQuery = useQuery({
    queryKey: ["automation", "delivery-bindings"],
    queryFn: listAutomationDeliveryBindings,
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const deliveryBindingCandidates = useMemo(
    () => deliveryBindingsQuery.data ?? [],
    [deliveryBindingsQuery.data],
  );
  const filteredProjects = useMemo(
    () => filterAutomationProjects(projects, filter),
    [filter, projects],
  );
  const currentProjectId =
    selectedProjectId !== null &&
    projects.some((project) => project.automation_project_id === selectedProjectId)
      ? selectedProjectId
      : (filteredProjects[0]?.automation_project_id ?? projects[0]?.automation_project_id ?? null);

  useEffect(() => {
    if (currentProjectId !== null && currentProjectId !== selectedProjectId) {
      setSelectedProjectId(currentProjectId);
    }
  }, [currentProjectId, selectedProjectId]);

  const projectQuery = useQuery({
    queryKey: ["automation", "projects", currentProjectId],
    queryFn: () => getAutomationProject(currentProjectId ?? ""),
    enabled: currentProjectId !== null,
  });
  const sessionsQuery = useQuery({
    queryKey: ["automation", "projects", currentProjectId, "sessions"],
    queryFn: () => listAutomationProjectSessions(currentProjectId ?? ""),
    enabled: currentProjectId !== null,
  });

  const workspacesById = useMemo(
    () =>
      new Map(
        (workspacesQuery.data ?? []).map((workspace) => [
          workspace.workspace_id,
          workspace,
        ]),
      ),
    [workspacesQuery.data],
  );
  const selectedProject =
    projectQuery.data ??
    projects.find((project) => project.automation_project_id === currentProjectId) ??
    null;
  const selectedSessions = sessionsQuery.data ?? [];
  const openCreate = () => {
    setEditingProjectId(null);
    createForm.setFieldsValue(
      defaultAutomationEditorValues(
        workspacesQuery.data?.[0]?.workspace_id ??
          selectedProject?.workspace_id ??
          projects[0]?.workspace_id ??
          "",
      ),
    );
    setCreateOpen(true);
  };
  const closeCreate = () => {
    setCreateOpen(false);
    setEditingProjectId(null);
  };
  const openEdit = (project: AutomationProjectRecord) => {
    createForm.setFieldsValue(automationEditorValuesFromProject(project));
    setEditingProjectId(project.automation_project_id);
    setCreateOpen(true);
  };

  const runMutation = useMutation({
    mutationFn: (automationProjectId: string) =>
      runAutomationProject(automationProjectId),
    onSuccess: (result) => {
      void message.success(t("automationRunStarted"));
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["automation", "projects", result.automation_project_id, "sessions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      if (result.session_id.trim()) {
        const runProject =
          selectedProject?.automation_project_id === result.automation_project_id
            ? selectedProject
            : projects.find(
                (project) =>
                  project.automation_project_id === result.automation_project_id,
              );
        onSessionSelected?.(result.session_id, runProject?.workspace_id ?? null);
      }
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationRunFailed"),
      );
    },
  });
  const enableMutation = useMutation({
    mutationFn: (automationProjectId: string) =>
      enableAutomationProject(automationProjectId),
    onSuccess: (project) => {
      void message.success(t("automationEnabled"));
      updateAutomationProjectCache(queryClient, project);
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationToggleFailed"),
      );
    },
  });
  const disableMutation = useMutation({
    mutationFn: (automationProjectId: string) =>
      disableAutomationProject(automationProjectId),
    onSuccess: (project) => {
      void message.success(t("automationDisabled"));
      updateAutomationProjectCache(queryClient, project);
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationToggleFailed"),
      );
    },
  });
  const createMutation = useMutation({
    mutationFn: (values: AutomationEditorValues) =>
      createAutomationProject(
        automationCreateRequest(values, deliveryBindingCandidates),
      ),
    onSuccess: (project) => {
      void message.success(t("automationCreated"));
      closeCreate();
      updateAutomationProjectCache(queryClient, project);
      setSelectedProjectId(project.automation_project_id);
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationCreateFailed"),
      );
    },
  });
  const updateMutation = useMutation({
    mutationFn: (values: AutomationEditorValues) => {
      if (editingProjectId === null) {
        throw new Error(t("automationUpdateFailed"));
      }
      return updateAutomationProject(
        editingProjectId,
        automationUpdateRequest(values, deliveryBindingCandidates),
      );
    },
    onSuccess: (project) => {
      void message.success(t("automationUpdated"));
      closeCreate();
      updateAutomationProjectCache(queryClient, project);
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationUpdateFailed"),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (automationProjectId: string) =>
      deleteAutomationProject(automationProjectId, { cascade: true }),
    onSuccess: (_result, automationProjectId) => {
      void message.success(t("automationDeleted"));
      setSelectedProjectId((current) =>
        current === automationProjectId ? null : current,
      );
      queryClient.setQueryData<AutomationProjectRecord[]>(
        ["automation", "projects"],
        (entries) =>
          entries?.filter(
            (entry) => entry.automation_project_id !== automationProjectId,
          ) ?? [],
      );
      queryClient.removeQueries({
        exact: true,
        queryKey: ["automation", "projects", automationProjectId],
      });
      queryClient.removeQueries({
        exact: true,
        queryKey: ["automation", "projects", automationProjectId, "sessions"],
      });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["automation", "projects"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("automationDeleteFailed"),
      );
    },
  });

  if (projectsQuery.isLoading) {
    return (
      <div className="at-automation-view">
        <AutomationToolbar
          activeTab={activeTab}
          filter={filter}
          onCreate={openCreate}
          onFilterChange={setFilter}
          onTabChange={selectTab}
          onRefresh={() => void refreshAutomation(queryClient)}
          refreshing={projectsQuery.isFetching}
          t={t}
        />
        <div
          aria-busy={projectsQuery.isFetching}
          aria-labelledby="automation-schedules-tab"
          className="at-automation-loading"
          hidden={activeTab !== "schedules"}
          id="automation-schedules-panel"
          role="tabpanel"
        >
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
        {githubVisited ? (
          <AutomationGitHubPanel active={activeTab === "github"} />
        ) : null}
        <AutomationCreateModal
          form={createForm}
          loading={createMutation.isPending || updateMutation.isPending}
          mode={editingProjectId === null ? "create" : "edit"}
          deliveryBindingCandidates={deliveryBindingCandidates}
          deliveryBindingsLoading={deliveryBindingsQuery.isLoading}
          onCancel={closeCreate}
          onSubmit={(values) =>
            editingProjectId === null
              ? createMutation.mutate(values)
              : updateMutation.mutate(values)
          }
          open={createOpen}
          t={t}
          workspaces={workspacesQuery.data ?? []}
        />
      </div>
    );
  }

  if (projectsQuery.isError) {
    return (
      <div className="at-automation-view">
        <AutomationToolbar
          activeTab={activeTab}
          filter={filter}
          onCreate={openCreate}
          onFilterChange={setFilter}
          onTabChange={selectTab}
          onRefresh={() => void refreshAutomation(queryClient)}
          refreshing={projectsQuery.isFetching}
          t={t}
        />
        <div
          aria-labelledby="automation-schedules-tab"
          className="at-automation-state"
          hidden={activeTab !== "schedules"}
          id="automation-schedules-panel"
          role="tabpanel"
        >
          <Alert
            action={
              <Button
                loading={projectsQuery.isFetching}
                onClick={() => void projectsQuery.refetch()}
                size="small"
              >
                {t("automationRefresh")}
              </Button>
            }
            message={t("automationLoadError")}
            showIcon
            type="error"
          />
        </div>
        {githubVisited ? (
          <AutomationGitHubPanel active={activeTab === "github"} />
        ) : null}
        <AutomationCreateModal
          form={createForm}
          loading={createMutation.isPending || updateMutation.isPending}
          mode={editingProjectId === null ? "create" : "edit"}
          deliveryBindingCandidates={deliveryBindingCandidates}
          deliveryBindingsLoading={deliveryBindingsQuery.isLoading}
          onCancel={closeCreate}
          onSubmit={(values) =>
            editingProjectId === null
              ? createMutation.mutate(values)
              : updateMutation.mutate(values)
          }
          open={createOpen}
          t={t}
          workspaces={workspacesQuery.data ?? []}
        />
      </div>
    );
  }

  return (
    <div className="at-automation-view">
      <AutomationToolbar
        activeTab={activeTab}
        filter={filter}
        onCreate={openCreate}
        onFilterChange={setFilter}
        onTabChange={selectTab}
        onRefresh={() => void refreshAutomation(queryClient)}
        refreshing={projectsQuery.isFetching}
        t={t}
      />
      <div
        aria-busy={projectsQuery.isFetching}
        aria-labelledby="automation-schedules-tab"
        className={[
          "at-automation-content",
          projectsQuery.isFetching ? "is-refreshing" : "",
          mobileDetailOpen ? "is-detail-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        hidden={activeTab !== "schedules"}
        id="automation-schedules-panel"
        role="tabpanel"
      >
        <aside className="at-automation-list" aria-label={t("automationProjects")}>
          {filteredProjects.length === 0 ? (
            <div className="at-automation-state">
              <Empty
                description={
                  projects.length === 0
                    ? t("automationEmpty")
                    : t("automationNoMatches")
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            automationProjectGroups(filteredProjects, t).map((group) => (
              <section
                aria-labelledby={`automation-group-${group.id}`}
                className="at-automation-project-group"
                key={group.id}
              >
                <div className="at-automation-project-group-head">
                  <strong id={`automation-group-${group.id}`}>{group.label}</strong>
                  <span>{group.projects.length}</span>
                </div>
                {group.projects.map((project) => (
                  <AutomationProjectButton
                    key={project.automation_project_id}
                    onSelect={() => {
                      setSelectedProjectId(project.automation_project_id);
                      setMobileDetailOpen(true);
                    }}
                    project={project}
                    selected={project.automation_project_id === currentProjectId}
                    t={t}
                  />
                ))}
              </section>
            ))
          )}
        </aside>
        <main className="at-automation-detail">
          {selectedProject === null ? (
            <div className="at-automation-state">
              <Empty
                description={t("automationSelectProject")}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            <AutomationProjectDetail
              actionPending={{
                delete:
                  deleteMutation.isPending &&
                  deleteMutation.variables === selectedProject.automation_project_id,
                run:
                  runMutation.isPending &&
                  runMutation.variables === selectedProject.automation_project_id,
                toggle:
                  (enableMutation.isPending &&
                    enableMutation.variables === selectedProject.automation_project_id) ||
                  (disableMutation.isPending &&
                    disableMutation.variables === selectedProject.automation_project_id),
                update:
                  updateMutation.isPending &&
                  editingProjectId === selectedProject.automation_project_id,
              }}
              loading={projectQuery.isLoading || sessionsQuery.isLoading}
              refreshing={projectQuery.isFetching || sessionsQuery.isFetching}
              errorMessage={
                projectQuery.isError
                  ? t("automationProjectLoadError")
                  : sessionsQuery.isError
                    ? t("automationSessionsLoadError")
                    : null
              }
              onDelete={() => {
                modal.confirm({
                  cancelText: t("sidebarRenameCancel"),
                  okButtonProps: { danger: true },
                  okText: t("automationDelete"),
                  onOk: () =>
                    deleteMutation.mutateAsync(
                      selectedProject.automation_project_id,
                    ),
                  title: t("automationDeleteConfirm", {
                    name: automationTitle(selectedProject),
                  }),
                });
              }}
              onEdit={() => openEdit(selectedProject)}
              onBack={() => setMobileDetailOpen(false)}
              onRetry={() => {
                void projectQuery.refetch();
                void sessionsQuery.refetch();
              }}
              onRun={() => runMutation.mutate(selectedProject.automation_project_id)}
              onSessionSelected={onSessionSelected}
              onToggle={() => {
                if (selectedProject.status === "enabled") {
                  disableMutation.mutate(selectedProject.automation_project_id);
                } else {
                  enableMutation.mutate(selectedProject.automation_project_id);
                }
              }}
              project={selectedProject}
              sessions={selectedSessions}
              t={t}
              workspace={workspacesById.get(selectedProject.workspace_id) ?? null}
            />
          )}
        </main>
      </div>
      {githubVisited ? (
        <AutomationGitHubPanel active={activeTab === "github"} />
      ) : null}
      <AutomationCreateModal
        form={createForm}
        loading={createMutation.isPending || updateMutation.isPending}
        mode={editingProjectId === null ? "create" : "edit"}
        deliveryBindingCandidates={deliveryBindingCandidates}
        deliveryBindingsLoading={deliveryBindingsQuery.isLoading}
        onCancel={closeCreate}
        onSubmit={(values) =>
          editingProjectId === null
            ? createMutation.mutate(values)
            : updateMutation.mutate(values)
        }
        open={createOpen}
        t={t}
        workspaces={workspacesQuery.data ?? []}
      />
    </div>
  );
}

function AutomationToolbar({
  activeTab,
  filter,
  onCreate,
  onFilterChange,
  onTabChange,
  onRefresh,
  refreshing,
  t,
}: {
  activeTab: "github" | "schedules";
  filter: string;
  onCreate: () => void;
  onFilterChange: (value: string) => void;
  onTabChange: (tab: "github" | "schedules") => void;
  onRefresh: () => void;
  refreshing: boolean;
  t: Translate;
}) {
  return (
    <div className="at-automation-toolbar">
      <div className="at-automation-title">
        <h3>{t("automationTitle")}</h3>
        <Typography.Text type="secondary">{t("automationSubtitle")}</Typography.Text>
        <div className="at-automation-tabs" role="tablist">
          <Button
            aria-controls="automation-schedules-panel"
            aria-selected={activeTab === "schedules"}
            id="automation-schedules-tab"
            onClick={() => onTabChange("schedules")}
            role="tab"
            size="small"
            type="text"
          >
            {t("automationSchedules")}
          </Button>
          <Button
            aria-controls="automation-github-panel"
            aria-selected={activeTab === "github"}
            id="automation-github-tab"
            onClick={() => onTabChange("github")}
            role="tab"
            size="small"
            type="text"
          >
            {t("automationGitHub")}
          </Button>
        </div>
      </div>
      <div className="at-automation-actions" hidden={activeTab !== "schedules"}>
        <Input
          allowClear
          aria-label={t("automationSearchLabel")}
          className="at-automation-search"
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder={t("automationSearchPlaceholder")}
          prefix={<Search size={14} />}
          value={filter}
        />
        <Button icon={<Plus size={15} />} onClick={onCreate} type="primary">
          {t("automationNew")}
        </Button>
        <Tooltip title={t("automationRefresh")}>
          <Button
            aria-label={t("automationRefresh")}
            icon={<RefreshCcw size={15} />}
            loading={refreshing}
            onClick={onRefresh}
          />
        </Tooltip>
      </div>
    </div>
  );
}

function AutomationGitHubPanel({ active }: { active: boolean }) {
  return (
    <section
      aria-labelledby="automation-github-tab"
      className="at-automation-github-panel"
      hidden={!active}
      id="automation-github-panel"
      role="tabpanel"
    >
      <GitHubSettingsSection />
    </section>
  );
}

function AutomationProjectButton({
  onSelect,
  project,
  selected,
  t,
}: {
  onSelect: () => void;
  project: AutomationProjectRecord;
  selected: boolean;
  t: Translate;
}) {
  return (
    <button
      aria-label={automationTitle(project)}
      aria-current={selected ? "page" : undefined}
      className={
        selected ? "at-automation-project is-selected" : "at-automation-project"
      }
      onClick={onSelect}
      type="button"
    >
      <span className="at-automation-project-main">
        <strong>{automationTitle(project)}</strong>
        <span>{project.workspace_id}</span>
      </span>
      <span className="at-automation-project-meta">
        <span className={`at-automation-status is-${project.status}`}>
          {automationStatusLabel(project.status, t)}
        </span>
        <span>{scheduleSummary(project, t)}</span>
      </span>
    </button>
  );
}

function AutomationProjectDetail({
  actionPending,
  errorMessage,
  loading,
  onDelete,
  onBack,
  onEdit,
  onRetry,
  onRun,
  onSessionSelected,
  onToggle,
  project,
  refreshing,
  sessions,
  t,
  workspace,
}: {
  actionPending: {
    delete: boolean;
    run: boolean;
    toggle: boolean;
    update: boolean;
  };
  errorMessage: string | null;
  loading: boolean;
  onDelete: () => void;
  onBack: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onRun: () => void;
  onSessionSelected?: (sessionId: string, workspaceId?: string | null) => void;
  onToggle: () => void;
  project: AutomationProjectRecord;
  refreshing: boolean;
  sessions: AutomationProjectSessionRecord[];
  t: Translate;
  workspace: WorkspaceRecord | null;
}) {
  if (loading) {
    return (
      <div className="at-automation-detail-loading">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }
  if (errorMessage !== null) {
    return (
      <Alert
        action={
          <Button loading={refreshing} onClick={onRetry} size="small">
            {t("automationRefresh")}
          </Button>
        }
        message={errorMessage}
        showIcon
        type="error"
      />
    );
  }

  const busy = Object.values(actionPending).some(Boolean);

  const runMode =
    project.run_config.session_mode === "orchestration"
      ? t("composerOrchestration")
      : t("composerNormal");
  const roleOrPreset =
    project.run_config.session_mode === "orchestration"
      ? (project.run_config.orchestration_preset_id ?? t("automationNone"))
      : (project.run_config.normal_root_role_id ?? t("automationNone"));
  const deliveryLabel = project.delivery_binding
    ? deliveryBindingLabel(project.delivery_binding)
    : t("automationDeliveryDisabled");

  return (
    <div
      aria-busy={refreshing || busy}
      className={
        refreshing
          ? "at-automation-detail-grid is-refreshing"
          : "at-automation-detail-grid"
      }
    >
      <section className="at-automation-document">
        <Button
          className="at-automation-back"
          icon={<ArrowLeft size={15} />}
          onClick={onBack}
          type="text"
        >
          {t("automationProjects")}
        </Button>
        <div className="at-automation-detail-head">
          <div>
            <h3>{automationTitle(project)}</h3>
            <Typography.Text type="secondary">
              {project.automation_project_id}
            </Typography.Text>
          </div>
          <div className="at-automation-detail-actions">
            <Button
              disabled={busy}
              icon={<Pencil size={15} />}
              loading={actionPending.update}
              onClick={onEdit}
            >
              {t("automationEdit")}
            </Button>
            <Button
              disabled={busy}
              icon={<Play size={15} />}
              loading={actionPending.run}
              onClick={onRun}
            >
              {t("automationRunNow")}
            </Button>
            <Button
              disabled={busy}
              icon={
                project.status === "enabled" ? (
                  <PauseCircle size={15} />
                ) : (
                  <RotateCw size={15} />
                )
              }
              loading={actionPending.toggle}
              onClick={onToggle}
            >
              {project.status === "enabled"
                ? t("automationDisable")
                : t("automationEnable")}
            </Button>
            <Button
              danger
              disabled={busy}
              icon={<Trash2 size={15} />}
              loading={actionPending.delete}
              onClick={onDelete}
            >
              {t("automationDelete")}
            </Button>
          </div>
        </div>
        <section className="at-automation-section">
          <h4>{t("automationPrompt")}</h4>
          <p>{project.prompt}</p>
        </section>
        <section className="at-automation-section">
          <div className="at-automation-section-title">
            <h4>{t("automationRecentRuns")}</h4>
            <span>{t("automationRunsCount").replace("{count}", String(sessions.length))}</span>
          </div>
          {sessions.length === 0 ? (
            <div className="at-automation-inline-empty">
              {t("automationNoRuns")}
            </div>
          ) : (
            <div className="at-automation-runs">
              {sessions.map((session) => (
                <button
                  className="at-automation-run"
                  key={session.session_id}
                  onClick={() =>
                    onSessionSelected?.(session.session_id, session.workspace_id ?? null)
                  }
                  type="button"
                >
                  <span>
                    <strong>{sessionTitle(session)}</strong>
                    <span>{session.session_id}</span>
                  </span>
                  <span>
                    {runStatusLabel(session, t)}
                    {session.updated_at ? ` · ${formatDateTime(session.updated_at)}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
      <aside className="at-automation-properties">
        <h4>{t("automationConfiguration")}</h4>
        <PropertyRow
          label={t("automationStatus")}
          value={automationStatusLabel(project.status, t)}
        />
        <PropertyRow label={t("automationSchedule")} value={scheduleText(project, t)} />
        <PropertyRow label={t("automationScheduleSummary")} value={scheduleSummary(project, t)} />
        <PropertyRow label={t("automationTimezone")} value={project.timezone} />
        <PropertyRow
          label={t("automationNextRun")}
          value={formatOptionalDate(project.next_run_at, t("automationNotScheduled"))}
        />
        <PropertyRow
          label={t("automationLastRun")}
          value={formatOptionalDate(project.last_run_started_at, t("automationNever"))}
        />
        <PropertyRow
          label={t("automationLastError")}
          value={project.last_error?.trim() || t("automationNone")}
          warning={Boolean(project.last_error?.trim())}
        />
        <h4>{t("automationRuntime")}</h4>
        <PropertyRow label={t("composerSessionMode")} value={runMode} />
        <PropertyRow label={t("composerRootRole")} value={roleOrPreset} />
        <PropertyRow label={t("automationDelivery")} value={deliveryLabel} />
        <h4>{t("automationWorkspace")}</h4>
        <PropertyRow label={t("automationWorkspaceId")} value={project.workspace_id} />
        <PropertyRow
          code
          label={t("automationWorkspaceRoot")}
          value={workspace?.root_path ?? t("automationWorkspaceMissing")}
        />
      </aside>
    </div>
  );
}

function AutomationCreateModal({
  deliveryBindingCandidates,
  deliveryBindingsLoading,
  form,
  loading,
  mode,
  onCancel,
  onSubmit,
  open,
  t,
  workspaces,
}: {
  deliveryBindingCandidates: AutomationDeliveryBindingCandidate[];
  deliveryBindingsLoading: boolean;
  form: FormInstance<AutomationEditorValues>;
  loading: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (values: AutomationEditorValues) => void;
  open: boolean;
  t: Translate;
  workspaces: WorkspaceRecord[];
}) {
  useEffect(() => {
    if (!open || workspaces.length === 0 || form.getFieldValue("workspaceId")) {
      return;
    }
    form.setFieldValue("workspaceId", workspaces[0]?.workspace_id ?? "");
  }, [form, open, workspaces]);

  const deliveryOptions = [
    { label: t("automationDeliveryDisabled"), value: DISABLED_DELIVERY_TARGET },
    ...deliveryBindingCandidates.map((candidate) => ({
      label: deliveryCandidateLabel(candidate),
      value: deliveryCandidateValue(candidate),
    })),
  ];

  return (
    <Modal
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
        }
      }}
      cancelText={t("sidebarRenameCancel")}
      className="at-automation-create-modal"
      confirmLoading={loading}
      okText={mode === "edit" ? t("automationSave") : t("automationCreate")}
      onCancel={onCancel}
      onOk={() => form.submit()}
      open={open}
      style={{ top: 32 }}
      title={mode === "edit" ? t("automationEdit") : t("automationNew")}
      width={620}
    >
      <Form
        className="at-automation-create-form"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
      >
        <div className="at-automation-form-grid">
          <Form.Item
            label={t("automationDisplayName")}
            name="displayName"
            rules={[
              {
                message: t("automationDisplayNameRequired"),
                required: true,
                whitespace: true,
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t("automationName")}
            name="name"
            rules={[
              {
                message: t("automationNamePattern"),
                pattern: /^[A-Za-z0-9_-]*$/,
              },
            ]}
          >
            <Input autoComplete="off" placeholder={t("automationNamePlaceholder")} />
          </Form.Item>
        </div>
        <Form.Item
          label={t("automationWorkspaceId")}
          name="workspaceId"
          rules={[
            {
              message: t("automationWorkspaceRequired"),
              required: true,
            },
          ]}
        >
          <Select
            notFoundContent={t("automationWorkspaceMissing")}
            optionFilterProp="label"
            options={workspaces.map((workspace) => ({
              label: workspaceLabel(workspace),
              value: workspace.workspace_id,
            }))}
            showSearch
          />
        </Form.Item>
        <Form.Item
          label={t("automationPrompt")}
          name="prompt"
          rules={[
            {
              message: t("automationPromptRequired"),
              required: true,
              whitespace: true,
            },
          ]}
        >
          <Input.TextArea rows={5} />
        </Form.Item>
        <div className="at-automation-form-grid">
          <Form.Item
            label={t("automationSchedulePreset")}
            name="schedulePreset"
            rules={[
              {
                message: t("automationScheduleRequired"),
                required: true,
              },
            ]}
          >
            <Select
              options={[
                { label: t("automationWeekdays"), value: "weekdays" },
                { label: t("automationDaily"), value: "daily" },
                { label: t("automationCustomCron"), value: "custom" },
                { label: t("automationInterval"), value: "interval" },
                { label: t("automationOneShot"), value: "one_shot" },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(previous, current) =>
              previous.schedulePreset !== current.schedulePreset
            }
          >
            {({ getFieldValue }) =>
              getFieldValue("schedulePreset") === "custom" ? (
                <Form.Item
                  label={t("automationCronExpression")}
                  name="cronExpression"
                  rules={[
                    {
                      message: t("automationCronRequired"),
                      required: true,
                      whitespace: true,
                    },
                  ]}
                >
                  <Input autoComplete="off" />
                </Form.Item>
              ) : getFieldValue("schedulePreset") === "interval" ? (
                <div className="at-automation-form-grid at-automation-form-grid-compact">
                  <Form.Item
                    label={t("automationIntervalEvery")}
                    name="intervalEvery"
                    rules={[{ required: true, message: t("automationIntervalRequired") }]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    label={t("automationIntervalUnit")}
                    name="intervalUnit"
                    rules={[{ required: true, message: t("automationIntervalUnitRequired") }]}
                  >
                    <Select
                      options={[
                        { label: t("automationMinutes"), value: "minutes" },
                        { label: t("automationHours"), value: "hours" },
                        { label: t("automationDays"), value: "days" },
                      ]}
                    />
                  </Form.Item>
                </div>
              ) : getFieldValue("schedulePreset") === "one_shot" ? (
                <Form.Item
                  label={t("automationRunAt")}
                  name="runAt"
                  rules={[{ required: true, message: t("automationRunAtRequired") }]}
                >
                  <Input type="datetime-local" />
                </Form.Item>
              ) : (
                <Form.Item
                  label={t("automationTime")}
                  name="time"
                  rules={[
                    {
                      message: t("automationTimeRequired"),
                      required: true,
                    },
                  ]}
                >
                  <Input type="time" />
                </Form.Item>
              )
            }
          </Form.Item>
        </div>
        <Form.Item
          label={t("automationTimezone")}
          name="timezone"
          rules={[
            {
              message: t("automationTimezoneRequired"),
              required: true,
              whitespace: true,
            },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <div className="at-automation-form-grid">
          <Form.Item
            label={t("automationDeliveryTarget")}
            name="deliveryTargetId"
          >
            <Select
              loading={deliveryBindingsLoading}
              notFoundContent={t("automationDeliveryNoTargets")}
              optionFilterProp="label"
              options={deliveryOptions}
              showSearch
            />
          </Form.Item>
          <Form.Item
            label={t("automationDeliveryEvents")}
            name="deliveryEvents"
          >
            <Checkbox.Group
              options={[
                { label: t("automationDeliveryStarted"), value: "started" },
                { label: t("automationDeliveryCompleted"), value: "completed" },
                { label: t("automationDeliveryFailed"), value: "failed" },
              ]}
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function PropertyRow({
  code = false,
  label,
  value,
  warning = false,
}: {
  code?: boolean;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="at-automation-property-row">
      <span>{label}</span>
      {code ? (
        <code title={value}>{value}</code>
      ) : (
        <strong className={warning ? "is-warning" : undefined} title={value}>
          {value}
        </strong>
      )}
    </div>
  );
}

function defaultAutomationEditorValues(workspaceId: string): AutomationEditorValues {
  return {
    cronExpression: "0 9 * * 1-5",
    deliveryEvents: ["completed"],
    deliveryTargetId: DISABLED_DELIVERY_TARGET,
    displayName: "",
    intervalEvery: 1,
    intervalUnit: "hours",
    name: "",
    prompt: "",
    runAt: "",
    schedulePreset: "weekdays",
    time: "09:00",
    timezone: browserTimezone(),
    workspaceId,
  };
}

function automationCreateRequest(
  values: AutomationEditorValues,
  deliveryBindingCandidates: AutomationDeliveryBindingCandidate[],
): AutomationProjectCreateRequest {
  const displayName = values.displayName.trim();
  const deliveryBinding = deliveryBindingFromEditor(
    values.deliveryTargetId,
    deliveryBindingCandidates,
  );
  return {
    cron_expression:
      values.schedulePreset === "interval" || values.schedulePreset === "one_shot"
        ? null
        : cronExpressionFromEditor(values),
    delivery_binding: deliveryBinding,
    delivery_events: deliveryBinding
      ? deliveryEventsFromEditor(values.deliveryEvents)
      : ["completed"],
    display_name: displayName,
    enabled: true,
    name: values.name.trim() || automationNameFromDisplayName(displayName),
    prompt: values.prompt.trim(),
    run_config: {
      normal_root_role_id: null,
      orchestration_preset_id: null,
      session_mode: "normal",
      thinking: { effort: "medium", enabled: true },
      yolo: false,
    },
    interval_every:
      values.schedulePreset === "interval" ? values.intervalEvery : null,
    interval_unit:
      values.schedulePreset === "interval" ? values.intervalUnit : null,
    run_at: values.schedulePreset === "one_shot" ? values.runAt : null,
    schedule_mode: scheduleModeFromEditor(values),
    timezone: values.timezone.trim() || "UTC",
    workspace_id: values.workspaceId.trim(),
  };
}

function automationUpdateRequest(
  values: AutomationEditorValues,
  deliveryBindingCandidates: AutomationDeliveryBindingCandidate[],
): AutomationProjectUpdateRequest {
  const request = automationCreateRequest(values, deliveryBindingCandidates);
  return {
    cron_expression: request.cron_expression,
    delivery_binding: request.delivery_binding,
    delivery_events: request.delivery_events,
    display_name: request.display_name,
    interval_every: request.interval_every,
    interval_unit: request.interval_unit,
    name: request.name,
    prompt: request.prompt,
    run_at: request.run_at,
    schedule_mode: request.schedule_mode,
    timezone: request.timezone,
    workspace_id: request.workspace_id,
  };
}

function automationEditorValuesFromProject(
  project: AutomationProjectRecord,
): AutomationEditorValues {
  const cronPreset = cronPresetFromProject(project);
  return {
    cronExpression: project.cron_expression?.trim() || "0 9 * * 1-5",
    deliveryEvents: project.delivery_events,
    deliveryTargetId: deliveryBindingValue(project.delivery_binding ?? null),
    displayName: project.display_name,
    intervalEvery: project.interval_every ?? 1,
    intervalUnit: project.interval_unit ?? "hours",
    name: project.name,
    prompt: project.prompt,
    runAt: dateTimeLocalValue(project.run_at),
    schedulePreset:
      project.schedule_mode === "cron" ? cronPreset : project.schedule_mode,
    time: timeFromCron(project.cron_expression),
    timezone: project.timezone,
    workspaceId: project.workspace_id,
  };
}

function scheduleModeFromEditor(
  values: AutomationEditorValues,
): AutomationProjectCreateRequest["schedule_mode"] {
  if (values.schedulePreset === "interval") {
    return "interval";
  }
  if (values.schedulePreset === "one_shot") {
    return "one_shot";
  }
  return "cron";
}

function cronPresetFromProject(
  project: AutomationProjectRecord,
): AutomationSchedulePreset {
  const expression = project.cron_expression?.trim() ?? "";
  if (/^\d+\s+\d+\s+\*\s+\*\s+1-5$/.test(expression)) {
    return "weekdays";
  }
  if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(expression)) {
    return "daily";
  }
  return "custom";
}

function timeFromCron(expression: string | null | undefined): string {
  const [minute = "0", hour = "9"] = (expression?.trim() ?? "").split(/\s+/);
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function dateTimeLocalValue(value: string | null | undefined): string {
  return value?.trim() ? value.trim().slice(0, 16) : "";
}

function deliveryBindingValue(binding: AutomationDeliveryBinding | null): string {
  if (binding === null) {
    return DISABLED_DELIVERY_TARGET;
  }
  if (binding.provider === "feishu") {
    return `feishu::${binding.trigger_id}::${binding.session_id ?? ""}`;
  }
  return `xiaoluban::${binding.account_id}`;
}

function deliveryEventsFromEditor(
  deliveryEvents: AutomationDeliveryEvent[],
): AutomationDeliveryEvent[] {
  return deliveryEvents.length === 0 ? ["completed"] : deliveryEvents;
}

function deliveryBindingFromEditor(
  deliveryTargetId: string,
  deliveryBindingCandidates: AutomationDeliveryBindingCandidate[],
): AutomationDeliveryBinding | null {
  if (deliveryTargetId === DISABLED_DELIVERY_TARGET) {
    return null;
  }
  const candidate = deliveryBindingCandidates.find(
    (entry) => deliveryCandidateValue(entry) === deliveryTargetId,
  );
  if (candidate === undefined) {
    return null;
  }
  if (candidate.provider === "feishu") {
    return {
      provider: "feishu",
      chat_id: candidate.chat_id,
      chat_type: candidate.chat_type,
      session_id: candidate.session_id,
      source_label: candidate.source_label,
      tenant_key: candidate.tenant_key,
      trigger_id: candidate.trigger_id,
    };
  }
  return {
    provider: "xiaoluban",
    account_id: candidate.account_id,
    derived_uid: candidate.derived_uid,
    display_name: candidate.display_name,
    source_label: candidate.source_label,
  };
}

function deliveryCandidateValue(
  candidate: AutomationDeliveryBindingCandidate,
): string {
  if (candidate.provider === "feishu") {
    return `feishu::${candidate.trigger_id}::${candidate.session_id}`;
  }
  return `xiaoluban::${candidate.account_id}`;
}

function deliveryCandidateLabel(
  candidate: AutomationDeliveryBindingCandidate,
): string {
  if (candidate.provider === "feishu") {
    return `Feishu / ${candidate.source_label}`;
  }
  return `Xiaoluban / ${candidate.display_name}`;
}

function cronExpressionFromEditor(values: AutomationEditorValues): string {
  if (values.schedulePreset === "custom") {
    return values.cronExpression.trim();
  }
  const { hour, minute } = parseTime(values.time);
  if (values.schedulePreset === "daily") {
    return `${minute} ${hour} * * *`;
  }
  return `${minute} ${hour} * * 1-5`;
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = value.split(":");
  return {
    hour: clampCronPart(Number.parseInt(hourRaw ?? "", 10), 0, 23, 9),
    minute: clampCronPart(Number.parseInt(minuteRaw ?? "", 10), 0, 59, 0),
  };
}

function clampCronPart(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function automationNameFromDisplayName(displayName: string): string {
  const normalized = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `automation_${Date.now().toString(36)}`;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
}

function filterAutomationProjects(
  projects: AutomationProjectRecord[],
  filter: string,
): AutomationProjectRecord[] {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) {
    return projects;
  }
  return projects.filter((project) =>
    [
      project.automation_project_id,
      project.display_name,
      project.name,
      project.prompt,
      project.workspace_id,
      project.status,
      project.cron_expression ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function automationProjectGroups(
  projects: AutomationProjectRecord[],
  t: Translate,
): Array<{
  id: "current" | "paused" | "running";
  label: string;
  projects: AutomationProjectRecord[];
}> {
  const groups: Array<{
    id: "current" | "paused" | "running";
    label: string;
    projects: AutomationProjectRecord[];
  }> = [
    { id: "running", label: t("automationGroupRunning"), projects: [] },
    { id: "paused", label: t("automationGroupPaused"), projects: [] },
    { id: "current", label: t("automationGroupCurrent"), projects: [] },
  ];
  for (const project of projects) {
    const activeStatus = project.active_run_status?.trim().toLowerCase();
    const groupId =
      activeStatus === "running"
        ? "running"
        : project.status === "disabled"
          ? "paused"
          : "current";
    groups.find((group) => group.id === groupId)?.projects.push(project);
  }
  return groups.filter((group) => group.projects.length > 0);
}

function automationTitle(project: AutomationProjectRecord): string {
  return project.display_name.trim() || project.name.trim() || project.automation_project_id;
}

function automationStatusLabel(status: string, t: Translate): string {
  return status === "enabled" ? t("automationEnabledStatus") : t("automationDisabledStatus");
}

function scheduleText(project: AutomationProjectRecord, t: Translate): string {
  if (project.schedule_mode === "interval") {
    const unit = project.interval_unit ?? "minutes";
    return t("automationIntervalSchedule")
      .replace("{count}", String(project.interval_every ?? 1))
      .replace("{unit}", intervalUnitLabel(unit, t));
  }
  if (project.schedule_mode === "one_shot") {
    return project.run_at ?? t("automationNotScheduled");
  }
  return project.cron_expression ?? t("automationNotScheduled");
}

function scheduleSummary(project: AutomationProjectRecord, t: Translate): string {
  if (project.schedule_mode === "one_shot") {
    return t("automationOneShot");
  }
  if (project.schedule_mode === "interval") {
    return scheduleText(project, t);
  }
  return t("automationCronSchedule").replace(
    "{expression}",
    project.cron_expression ?? t("automationNotScheduled"),
  );
}

function intervalUnitLabel(unit: string, t: Translate): string {
  if (unit === "hours") {
    return t("automationHours");
  }
  if (unit === "days") {
    return t("automationDays");
  }
  return t("automationMinutes");
}

function sessionTitle(session: AutomationProjectSessionRecord): string {
  return (
    session.title?.trim() ||
    session.metadata?.title?.trim() ||
    session.session_id
  );
}

function runStatusLabel(
  session: AutomationProjectSessionRecord,
  t: Translate,
): string {
  const status =
    session.active_run_status ??
    session.latest_terminal_run_status ??
    (session.latest_terminal_run_verification_status === "failed" ? "warning" : "");
  if (status === "running") {
    return t("automationRunStatusRunning");
  }
  if (status === "queued") {
    return t("automationRunStatusQueued");
  }
  if (status === "failed") {
    return t("automationRunStatusFailed");
  }
  if (status === "stopped") {
    return t("automationRunStatusStopped");
  }
  if (status === "warning") {
    return t("automationRunStatusWarning");
  }
  return t("automationRunStatusCompleted");
}

function deliveryBindingLabel(
  binding: NonNullable<AutomationProjectRecord["delivery_binding"]>,
): string {
  if (binding.provider === "feishu") {
    return `Feishu / ${binding.source_label}`;
  }
  return `Xiaoluban / ${binding.display_name}`;
}

function formatOptionalDate(value: string | null | undefined, fallback: string): string {
  return value?.trim() ? formatDateTime(value) : fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

async function refreshAutomation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["automation", "delivery-bindings"] }),
    queryClient.invalidateQueries({ queryKey: ["automation", "projects"] }),
    queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  ]);
}

function updateAutomationProjectCache(
  queryClient: QueryClient,
  project: AutomationProjectRecord,
): void {
  queryClient.setQueryData(
    ["automation", "projects", project.automation_project_id],
    project,
  );
  queryClient.setQueryData<AutomationProjectRecord[]>(
    ["automation", "projects"],
    (projects) => {
      if (projects === undefined) {
        return [project];
      }
      const replacedProjects = projects.map((entry) =>
        entry.automation_project_id === project.automation_project_id
          ? project
          : entry,
      );
      return projects.some(
        (entry) => entry.automation_project_id === project.automation_project_id,
      )
        ? replacedProjects
        : [project, ...projects];
    },
  );
}
