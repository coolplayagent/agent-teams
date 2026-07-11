import { useEffect, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Skeleton,
  Tooltip,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  File,
  FolderClosed,
  GitBranch,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Trash2,
} from "lucide-react";

import {
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceFileContent,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listSshProfiles,
  listWorkspaces,
  openWorkspaceRoot,
  searchWorkspacePaths,
  updateWorkspace,
} from "../../api/client";
import type {
  SshProfileRecord,
  WorkspaceDiffFile,
  WorkspaceDiffFileSummary,
  WorkspaceDiffListing,
  WorkspaceFileContent,
  WorkspaceLocalMountConfig,
  WorkspaceMountProvider,
  WorkspaceMountRecord,
  WorkspaceRecord,
  WorkspaceSearchResult,
  WorkspaceSshMountConfig,
  WorkspaceSnapshot,
  WorkspaceTreeNode,
  WorkspaceUpdateRequest,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import "./WorkspaceProjectView.css";

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
type WorkspaceMountDialogMode = "create" | "edit";

interface WorkspaceMountDialogState {
  mode: WorkspaceMountDialogMode;
  mount: WorkspaceMountRecord | null;
}

interface WorkspaceMountFormValues {
  local_root_path?: string;
  mount_name?: string;
  provider?: WorkspaceMountProvider;
  remote_root?: string;
  set_default?: boolean;
  ssh_profile_id?: string;
}

interface WorkspaceMountUpdateInput {
  preferredMountName: string;
  request: WorkspaceUpdateRequest;
  successMessage: string;
}

export function WorkspaceProjectView({
  onBack,
  selectedWorkspaceId,
}: WorkspaceProjectViewProps) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [mountForm] = Form.useForm<WorkspaceMountFormValues>();
  const [modeOverride, setModeOverride] = useState<WorkspaceProjectMode | null>(null);
  const [activeMountNameOverride, setActiveMountNameOverride] = useState<string | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState("");
  const [mountDialog, setMountDialog] = useState<WorkspaceMountDialogState | null>(null);
  const [sshProfilesOpen, setSshProfilesOpen] = useState(false);

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
    setSelectedFilePath(null);
    setTreeFilter("");
  }, [workspaceId]);

  const snapshotQuery = useQuery({
    queryKey: ["workspaces", "snapshot", workspaceId],
    queryFn: () => getWorkspaceSnapshot(workspaceId),
    enabled: workspaceId.length > 0,
  });
  const snapshot = snapshotQuery.data;
  const defaultMountName =
    workspace?.default_mount_name?.trim() ||
    snapshot?.default_mount_name?.trim() ||
    "default";
  const workspaceMounts = resolveWorkspaceMounts(workspace, snapshot, defaultMountName);
  const mountNames = uniqueValues([
    defaultMountName,
    ...workspaceMounts
      .map((mount) => mount.mount_name.trim())
      .filter((name) => name.length > 0),
  ]);
  const activeMountNameCandidate = activeMountNameOverride ?? defaultMountName;
  const activeMountName = mountNames.includes(activeMountNameCandidate)
    ? activeMountNameCandidate
    : defaultMountName;
  const activeMount =
    workspaceMounts.find((mount) => mount.mount_name === activeMountName) ??
    workspaceMounts[0] ??
    null;

  const diffsQuery = useQuery({
    queryKey: ["workspaces", "diffs", workspaceId, activeMountName],
    queryFn: () => getWorkspaceDiffs(workspaceId, activeMountName),
    enabled: workspaceId.length > 0 && activeMountName.length > 0,
  });
  const diffFiles = diffsQuery.data?.diff_files ?? [];
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

  const fileContentQuery = useQuery({
    queryKey: ["workspaces", "file", workspaceId, activeMountName, selectedFilePath],
    queryFn: () => {
      if (selectedFilePath === null) {
        throw new Error("File path is required.");
      }
      return getWorkspaceFileContent(workspaceId, selectedFilePath, activeMountName);
    },
    enabled:
      activeMode === "files" &&
      workspaceId.length > 0 &&
      activeMountName.length > 0 &&
      selectedFilePath !== null,
  });

  const sshProfilesQuery = useQuery({
    queryKey: ["settings", "workspace", "ssh-profiles"],
    queryFn: listSshProfiles,
    enabled: mountDialog !== null || sshProfilesOpen,
  });

  const openRootMutation = useMutation({
    mutationFn: () => openWorkspaceRoot(workspaceId, activeMountName),
    onSuccess: () => {
      void message.success(t("workspaceFolderOpened"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("workspaceOpenFolderError"),
      );
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (input: WorkspaceMountUpdateInput) =>
      updateWorkspace(workspaceId, input.request),
  });

  useEffect(() => {
    if (mountDialog === null) {
      return;
    }
    mountForm.setFieldsValue(
      mountDialogValues({
        defaultMountName,
        mode: mountDialog.mode,
        mount: mountDialog.mount,
      }),
    );
  }, [defaultMountName, mountDialog, mountForm]);

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
                  setSelectedFilePath(null);
                  setTreeFilter("");
                }}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="at-workspace-mount-actions">
            <Tooltip title={t("workspaceMountAdd")}>
              <Button
                aria-label={t("workspaceMountAdd")}
                icon={<Plus size={14} />}
                onClick={() => setMountDialog({ mode: "create", mount: null })}
                size="small"
                type="text"
              />
            </Tooltip>
            <Tooltip title={t("workspaceMountEdit")}>
              <Button
                aria-label={t("workspaceMountEdit")}
                disabled={activeMount === null}
                icon={<Pencil size={14} />}
                onClick={() => setMountDialog({ mode: "edit", mount: activeMount })}
                size="small"
                type="text"
              />
            </Tooltip>
            <Tooltip title={t("workspaceSshProfiles")}>
              <Button
                aria-label={t("workspaceSshProfiles")}
                icon={<Server size={14} />}
                onClick={() => setSshProfilesOpen(true)}
                size="small"
                type="text"
              />
            </Tooltip>
            <Tooltip title={t("workspaceMountRemove")}>
              <Button
                aria-label={t("workspaceMountRemove")}
                danger
                disabled={activeMount === null || workspaceMounts.length <= 1}
                icon={<Trash2 size={14} />}
                onClick={handleRemoveWorkspaceMount}
                size="small"
                type="text"
              />
            </Tooltip>
          </div>
          <div className="at-workspace-workbench-spacer" />
        </div>

        {activeMode === "files" ? (
          <div className="at-workspace-workbench-content is-files">
            <section
              aria-label={t("workspaceFilePreview")}
              className="at-workspace-file-preview"
            >
              <WorkspaceFilePreview
                error={fileContentQuery.error}
                fileContent={fileContentQuery.data}
                loading={fileContentQuery.isFetching}
                selectedPath={selectedFilePath}
                t={t}
              />
            </section>
            <WorkspaceFileExplorer
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
              mountName={activeMountName}
              onFilterChange={setTreeFilter}
              onSelectFile={setSelectedFilePath}
              selectedPath={selectedFilePath}
              t={t}
              workspaceId={workspaceId}
            />
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
                  {workspaceDiffEmptyMessage(diffsQuery.data, t)}
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
          </div>
        )}
      </div>
      <WorkspaceMountDialog
        defaultMountName={defaultMountName}
        form={mountForm}
        mode={mountDialog?.mode ?? "create"}
        onCancel={() => setMountDialog(null)}
        onSubmit={handleSubmitWorkspaceMount}
        open={mountDialog !== null}
        selectedMount={mountDialog?.mount ?? null}
        sshProfiles={sshProfilesQuery.data ?? []}
        sshProfilesError={sshProfilesQuery.error}
        sshProfilesLoading={sshProfilesQuery.isLoading}
        submitting={updateWorkspaceMutation.isPending}
        t={t}
      />
      <WorkspaceSshProfilesModal
        error={sshProfilesQuery.error}
        loading={sshProfilesQuery.isLoading}
        onClose={() => setSshProfilesOpen(false)}
        open={sshProfilesOpen}
        profiles={sshProfilesQuery.data ?? []}
        t={t}
      />
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
      queryKey: ["workspaces", "file", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "tree", targetWorkspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspaces", "search", targetWorkspaceId],
    });
  }

  async function handleSubmitWorkspaceMount(values: WorkspaceMountFormValues) {
    if (workspace === null) {
      return;
    }
    const sourceMountName = mountDialog?.mount?.mount_name ?? "";
    const mode = mountDialog?.mode ?? "create";
    try {
      const nextMount = buildWorkspaceMountRecordFromValues(values, {
        existingMount: mountDialog?.mount ?? null,
        mode,
      });
      validateWorkspaceMountSubmission({
        existingMounts: workspaceMounts,
        mode,
        mount: nextMount,
        sourceMountName,
        t,
      });
      const nextMounts = sortWorkspaceMountRecords(
        mode === "edit"
          ? workspaceMounts.map((mount) =>
              mount.mount_name === sourceMountName ? nextMount : mount,
            )
          : [...workspaceMounts, nextMount],
      );
      const nextDefaultMountName = resolveUpdatedDefaultMountName({
        nextMounts,
        removedMountName: mode === "edit" ? sourceMountName : "",
        replacementMountName: nextMount.mount_name,
        requestedDefaultMountName:
          values.set_default === true && nextMount.provider === "local"
            ? nextMount.mount_name
            : defaultMountName,
      });
      await submitWorkspaceMountUpdate({
        preferredMountName: nextMount.mount_name,
        request: {
          default_mount_name: nextDefaultMountName,
          mounts: nextMounts,
        },
        successMessage: t(
          mode === "edit" ? "workspaceMountUpdated" : "workspaceMountAdded",
          { mount: nextMount.mount_name },
        ),
      });
      setMountDialog(null);
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : t("workspaceMountSaveFailed"),
      );
    }
  }

  function handleRemoveWorkspaceMount() {
    if (activeMount === null) {
      return;
    }
    if (workspaceMounts.length <= 1) {
      void message.warning(t("workspaceMountRemoveLast"));
      return;
    }
    modal.confirm({
      cancelText: t("sidebarDeleteCancel"),
      content: t("workspaceMountRemoveConfirm", { mount: activeMount.mount_name }),
      okButtonProps: { danger: true },
      okText: t("sidebarDeleteConfirm"),
      onOk: () => removeWorkspaceMount(activeMount),
      title: t("workspaceMountRemove"),
    });
  }

  async function removeWorkspaceMount(mount: WorkspaceMountRecord) {
    const nextMounts = sortWorkspaceMountRecords(
      workspaceMounts.filter((item) => item.mount_name !== mount.mount_name),
    );
    const nextDefaultMountName = resolveUpdatedDefaultMountName({
      nextMounts,
      removedMountName: mount.mount_name,
      requestedDefaultMountName: defaultMountName,
    });
    try {
      await submitWorkspaceMountUpdate({
        preferredMountName: nextDefaultMountName,
        request: {
          default_mount_name: nextDefaultMountName,
          mounts: nextMounts,
        },
        successMessage: t("workspaceMountRemoved", { mount: mount.mount_name }),
      });
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : t("workspaceMountRemoveFailed"),
      );
      throw error;
    }
  }

  async function submitWorkspaceMountUpdate(input: WorkspaceMountUpdateInput) {
    const updatedWorkspace = await updateWorkspaceMutation.mutateAsync(input);
    queryClient.setQueryData<WorkspaceRecord[]>(["workspaces"], (current) => {
      const existing = current ?? [];
      if (
        existing.some(
          (item) => item.workspace_id === updatedWorkspace.workspace_id,
        )
      ) {
        return existing.map((item) =>
          item.workspace_id === updatedWorkspace.workspace_id
            ? updatedWorkspace
            : item,
        );
      }
      return [updatedWorkspace, ...existing];
    });
    setActiveMountNameOverride(input.preferredMountName);
    setSelectedDiffPath(null);
    setSelectedFilePath(null);
    setTreeFilter("");
    refreshWorkspace(updatedWorkspace.workspace_id);
    void message.success(input.successMessage);
  }
}

function WorkspaceMountDialog({
  defaultMountName,
  form,
  mode,
  onCancel,
  onSubmit,
  open,
  selectedMount,
  sshProfiles,
  sshProfilesError,
  sshProfilesLoading,
  submitting,
  t,
}: {
  defaultMountName: string;
  form: FormInstance<WorkspaceMountFormValues>;
  mode: WorkspaceMountDialogMode;
  onCancel: () => void;
  onSubmit: (values: WorkspaceMountFormValues) => void;
  open: boolean;
  selectedMount: WorkspaceMountRecord | null;
  sshProfiles: SshProfileRecord[];
  sshProfilesError: Error | null;
  sshProfilesLoading: boolean;
  submitting: boolean;
  t: Translate;
}) {
  const provider = Form.useWatch("provider", form) ?? "local";
  const sshOptions = sshProfiles.map((profile) => ({
    label: profile.ssh_profile_id,
    value: profile.ssh_profile_id,
  }));
  return (
    <Modal
      cancelText={t("sidebarDeleteCancel")}
      destroyOnHidden
      okText={t("settingsSave")}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => form.submit()}
      open={open}
      title={
        mode === "edit"
          ? t("workspaceMountEditTitle", {
              mount: selectedMount?.mount_name ?? defaultMountName,
            })
          : t("workspaceMountAdd")
      }
      width={520}
    >
      <Form
        className="at-workspace-mount-form"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        <Form.Item
          label={t("workspaceMountName")}
          name="mount_name"
          rules={[{ required: true, message: t("workspaceMountValidationName") }]}
        >
          <Input placeholder={t("workspaceMountNamePlaceholder")} />
        </Form.Item>
        <Form.Item
          label={t("workspaceMountProvider")}
          name="provider"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { label: t("workspaceMountProviderLocal"), value: "local" },
              { label: t("workspaceMountProviderSsh"), value: "ssh" },
            ]}
          />
        </Form.Item>
        {provider === "ssh" ? (
          <>
            <Form.Item
              label={t("workspaceMountSshProfile")}
              name="ssh_profile_id"
              rules={[
                {
                  required: true,
                  message: t("workspaceMountValidationSshProfile"),
                },
              ]}
            >
              <Select
                loading={sshProfilesLoading}
                options={sshOptions}
                placeholder={t("workspaceMountSshProfilePlaceholder")}
              />
            </Form.Item>
            {sshProfilesError !== null ? (
              <div className="at-project-state is-error">
                {errorMessage(sshProfilesError, t("workspaceSshProfilesLoadError"))}
              </div>
            ) : null}
            {!sshProfilesLoading && sshProfilesError === null && sshProfiles.length === 0 ? (
              <div className="at-project-state">
                {t("workspaceNoSshProfiles")}
              </div>
            ) : null}
            <Form.Item
              label={t("workspaceMountRemoteRoot")}
              name="remote_root"
              rules={[
                {
                  required: true,
                  message: t("workspaceMountValidationRemoteRoot"),
                },
              ]}
            >
              <Input placeholder={t("workspaceMountRemoteRootPlaceholder")} />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item
              label={t("workspaceMountLocalRoot")}
              name="local_root_path"
              rules={[
                {
                  required: true,
                  message: t("workspaceMountValidationLocalRoot"),
                },
              ]}
            >
              <Input placeholder={t("workspaceMountLocalRootPlaceholder")} />
            </Form.Item>
            <Form.Item name="set_default" valuePropName="checked">
              <Checkbox>{t("workspaceMountSetDefault")}</Checkbox>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}

function WorkspaceSshProfilesModal({
  error,
  loading,
  onClose,
  open,
  profiles,
  t,
}: {
  error: Error | null;
  loading: boolean;
  onClose: () => void;
  open: boolean;
  profiles: SshProfileRecord[];
  t: Translate;
}) {
  return (
    <Modal
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("workspaceSshProfiles")}
      width={560}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
      {error !== null ? (
        <div className="at-project-state is-error">
          {errorMessage(error, t("workspaceSshProfilesLoadError"))}
        </div>
      ) : null}
      {!loading && error === null && profiles.length === 0 ? (
        <div className="at-project-state">{t("workspaceNoSshProfiles")}</div>
      ) : null}
      {!loading && error === null && profiles.length > 0 ? (
        <List
          className="at-workspace-ssh-profile-list"
          dataSource={profiles}
          renderItem={(profile) => (
            <List.Item>
              <List.Item.Meta
                description={sshProfileDescription(profile, t)}
                title={profile.ssh_profile_id}
              />
            </List.Item>
          )}
        />
      ) : null}
    </Modal>
  );
}

function WorkspaceFilePreview({
  error,
  fileContent,
  loading,
  selectedPath,
  t,
}: {
  error: Error | null;
  fileContent: WorkspaceFileContent | undefined;
  loading: boolean;
  selectedPath: string | null;
  t: Translate;
}) {
  if (selectedPath === null) {
    return <div className="at-project-state">{t("workspaceNoFileSelected")}</div>;
  }
  if (loading && fileContent === undefined) {
    return <Skeleton active paragraph={{ rows: 14 }} />;
  }
  if (error !== null) {
    return (
      <div className="at-project-state is-error">
        {errorMessage(error, t("workspaceFileLoadError"))}
      </div>
    );
  }
  if (fileContent?.is_binary === true) {
    return <div className="at-project-state">{t("workspaceBinaryFile")}</div>;
  }
  const lines = splitFileLines(fileContent?.content ?? "");
  return (
    <div className={loading ? "at-workspace-file-body is-loading" : "at-workspace-file-body"}>
      {fileContent?.truncated === true ? (
        <div className="at-workspace-file-notice">
          {t("workspaceFileTruncated", { size: formatBytes(fileContent.size_bytes) })}
        </div>
      ) : null}
      {lines.map((line, index) => (
        <div className="at-workspace-file-line" key={`${index}:${line}`}>
          <span className="at-workspace-file-line-number">{index + 1}</span>
          <code className="at-workspace-file-line-text">{line || " "}</code>
        </div>
      ))}
    </div>
  );
}

function workspaceDiffEmptyMessage(
  listing: WorkspaceDiffListing,
  t: Translate,
): string {
  const backendMessage = listing.diff_message?.trim() ?? "";
  if (backendMessage.length > 0) {
    return backendMessage;
  }
  if (listing.is_git_repository === false) {
    return t("workspaceNotGitRepository");
  }
  return t("workspaceNoChanges");
}

function WorkspaceFileExplorer({
  entries,
  error,
  filter,
  loading,
  mountName,
  onFilterChange,
  onSelectFile,
  selectedPath,
  t,
  workspaceId,
}: {
  entries: WorkspaceFilePaneEntry[];
  error: Error | null;
  filter: string;
  loading: boolean;
  mountName: string;
  onFilterChange: (value: string) => void;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  t: Translate;
  workspaceId: string;
}) {
  const normalizedFilter = filter.trim();
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
            normalizedFilter.length > 0
              ? t("workspaceSearchFilesError")
              : t("workspaceLoadTreeError"),
          )}
        </div>
      ) : null}
      {!loading && error === null && entries.length === 0 ? (
        <div className="at-project-state">
          {normalizedFilter.length > 0
            ? t("workspaceNoFileMatches")
            : t("workspaceNoRootEntries")}
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="at-workspace-file-pane-list">
          {entries.map((entry) =>
            normalizedFilter.length > 0 ? (
              <WorkspaceFilteredFileRow
                entry={entry}
                key={`${entry.kind}:${entry.path}`}
                onSelectFile={onSelectFile}
                selected={entry.path === selectedPath}
                t={t}
              />
            ) : (
              <WorkspaceFileTreeNode
                entry={entry}
                key={`${entry.kind}:${entry.path}`}
                mountName={mountName}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
                t={t}
                workspaceId={workspaceId}
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceFileTreeNode({
  entry,
  mountName,
  onSelectFile,
  selectedPath,
  t,
  workspaceId,
}: {
  entry: WorkspaceFilePaneEntry;
  mountName: string;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  t: Translate;
  workspaceId: string;
}) {
  if (entry.kind === "directory") {
    return (
      <WorkspaceDirectoryNode
        entry={entry}
        mountName={mountName}
        onSelectFile={onSelectFile}
        selectedPath={selectedPath}
        t={t}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <WorkspaceFileTreeFile
      entry={entry}
      onSelectFile={onSelectFile}
      selected={entry.path === selectedPath}
      t={t}
    />
  );
}

function WorkspaceDirectoryNode({
  entry,
  mountName,
  onSelectFile,
  selectedPath,
  t,
  workspaceId,
}: {
  entry: WorkspaceFilePaneEntry;
  mountName: string;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  t: Translate;
  workspaceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const canLoadChildren =
    "has_children" in entry ? entry.has_children === true : true;
  const childrenQuery = useQuery({
    queryKey: ["workspaces", "tree", workspaceId, mountName, entry.path],
    queryFn: () => getWorkspaceTree(workspaceId, entry.path, mountName),
    enabled: expanded && canLoadChildren && workspaceId.length > 0 && mountName.length > 0,
  });
  const inlineChildren = "children" in entry && Array.isArray(entry.children)
    ? entry.children
    : [];
  const children = childrenQuery.data?.children ?? inlineChildren;
  return (
    <div className="at-workspace-tree-node">
      <button
        aria-expanded={expanded}
        aria-label={t("workspaceToggleDirectory", { path: entry.path })}
        className="at-workspace-tree-row is-action"
        onClick={() => setExpanded(!expanded)}
        title={entry.path}
        type="button"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" size={14} />
        ) : (
          <ChevronRight aria-hidden="true" size={14} />
        )}
        <FolderClosed aria-hidden="true" size={15} />
        <span className="at-workspace-file-pane-name">{entry.name}</span>
      </button>
      {expanded ? (
        <div className="at-workspace-tree-children">
          {childrenQuery.isLoading ? (
            <div className="at-project-state">{t("workspaceLoadingDirectory")}</div>
          ) : null}
          {childrenQuery.isError ? (
            <div className="at-project-state is-error">
              {errorMessage(childrenQuery.error, t("workspaceLoadTreeError"))}
            </div>
          ) : null}
          {children.map((child) => (
            <WorkspaceFileTreeNode
              entry={child}
              key={`${child.kind}:${child.path}`}
              mountName={mountName}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
              t={t}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceFileTreeFile({
  entry,
  onSelectFile,
  selected,
  t,
}: {
  entry: WorkspaceFilePaneEntry;
  onSelectFile: (path: string) => void;
  selected: boolean;
  t: Translate;
}) {
  return (
    <button
      aria-current={selected ? "page" : undefined}
      aria-label={t("workspaceOpenFile", { path: entry.path })}
      className={
        selected
          ? "at-workspace-file-pane-row is-action is-selected"
          : "at-workspace-file-pane-row is-action"
      }
      onClick={() => onSelectFile(entry.path)}
      title={entry.path}
      type="button"
    >
      <File aria-hidden="true" size={15} />
      <span className="at-workspace-file-pane-name">{entry.name}</span>
    </button>
  );
}

function WorkspaceFilteredFileRow({
  entry,
  onSelectFile,
  selected,
  t,
}: {
  entry: WorkspaceFilePaneEntry;
  onSelectFile: (path: string) => void;
  selected: boolean;
  t: Translate;
}) {
  if (entry.kind === "directory") {
    return (
      <div className="at-workspace-file-pane-row" title={entry.path}>
        <FolderClosed aria-hidden="true" size={15} />
        <span className="at-workspace-file-pane-name">{entry.name}</span>
      </div>
    );
  }
  return (
    <WorkspaceFileTreeFile
      entry={entry}
      onSelectFile={onSelectFile}
      selected={selected}
      t={t}
    />
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

function splitFileLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.length === 0 ? [""] : normalized.split("\n");
}

function resolveWorkspaceMounts(
  workspace: WorkspaceRecord | null,
  snapshot: WorkspaceSnapshot | undefined,
  defaultMountName: string,
): WorkspaceMountRecord[] {
  if (workspace?.mounts !== undefined && workspace.mounts.length > 0) {
    return sortWorkspaceMountRecords(workspace.mounts);
  }
  const rootPath = workspaceRoot(workspace, snapshot);
  const snapshotMountNames = (snapshot?.tree.children ?? [])
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.name.trim())
    .filter((name) => name.length > 0);
  const names = uniqueValues([defaultMountName, ...snapshotMountNames]);
  return sortWorkspaceMountRecords(
    names.map((name) => ({
      mount_name: name,
      provider: "local",
      provider_config: {
        root_path: name === defaultMountName ? rootPath : name,
      },
      working_directory: ".",
      readable_paths: ["."],
      writable_paths: ["."],
    })),
  );
}

function sortWorkspaceMountRecords(
  mounts: WorkspaceMountRecord[],
): WorkspaceMountRecord[] {
  return [...mounts].sort(compareWorkspaceMountRecords);
}

function compareWorkspaceMountRecords(
  left: WorkspaceMountRecord,
  right: WorkspaceMountRecord,
): number {
  const providerDelta = mountProviderOrder(left.provider) - mountProviderOrder(right.provider);
  if (providerDelta !== 0) {
    return providerDelta;
  }
  return left.mount_name.localeCompare(right.mount_name);
}

function mountProviderOrder(provider: WorkspaceMountProvider): number {
  return provider === "local" ? 0 : 1;
}

function mountDialogValues({
  defaultMountName,
  mode,
  mount,
}: {
  defaultMountName: string;
  mode: WorkspaceMountDialogMode;
  mount: WorkspaceMountRecord | null;
}): WorkspaceMountFormValues {
  if (mode === "create" || mount === null) {
    return {
      mount_name: "",
      provider: "local",
      local_root_path: "",
      set_default: false,
    };
  }
  const config = mount.provider_config;
  if (isWorkspaceSshMountConfig(config)) {
    return {
      mount_name: mount.mount_name,
      provider: "ssh",
      remote_root: config.remote_root,
      set_default: false,
      ssh_profile_id: config.ssh_profile_id,
    };
  }
  return {
    local_root_path: config.root_path,
    mount_name: mount.mount_name,
    provider: "local",
    set_default: mount.mount_name === defaultMountName,
  };
}

function buildWorkspaceMountRecordFromValues(
  values: WorkspaceMountFormValues,
  {
    existingMount,
    mode,
  }: {
    existingMount: WorkspaceMountRecord | null;
    mode: WorkspaceMountDialogMode;
  },
): WorkspaceMountRecord {
  const mountName = values.mount_name?.trim() ?? "";
  const provider = values.provider === "ssh" ? "ssh" : "local";
  const baseRecord = buildWorkspaceMountBaseRecord({
    existingMount,
    mode,
    nextProvider: provider,
  });
  if (provider === "ssh") {
    return {
      ...baseRecord,
      mount_name: mountName,
      provider,
      provider_config: {
        remote_root: values.remote_root?.trim() ?? "",
        ssh_profile_id: values.ssh_profile_id?.trim() ?? "",
      },
    };
  }
  return {
    ...baseRecord,
    mount_name: mountName,
    provider,
    provider_config: {
      root_path: values.local_root_path?.trim() ?? "",
    },
  };
}

function buildWorkspaceMountBaseRecord({
  existingMount,
  mode,
  nextProvider,
}: {
  existingMount: WorkspaceMountRecord | null;
  mode: WorkspaceMountDialogMode;
  nextProvider: WorkspaceMountProvider;
}): Partial<
  Pick<
    WorkspaceMountRecord,
    | "branch_name"
    | "capabilities"
    | "forked_from_workspace_id"
    | "readable_paths"
    | "source_root_path"
    | "working_directory"
    | "writable_paths"
  >
> {
  if (mode !== "edit" || existingMount === null) {
    return {};
  }
  const providerUnchanged = existingMount.provider === nextProvider;
  const nextRecord: Partial<
    Pick<
      WorkspaceMountRecord,
      | "branch_name"
      | "capabilities"
      | "forked_from_workspace_id"
      | "readable_paths"
      | "source_root_path"
      | "working_directory"
      | "writable_paths"
    >
  > = {};
  nextRecord.working_directory = existingMount.working_directory;
  nextRecord.readable_paths = [...(existingMount.readable_paths ?? [])];
  nextRecord.writable_paths = [...(existingMount.writable_paths ?? [])];
  if (providerUnchanged && existingMount.capabilities !== undefined) {
    nextRecord.capabilities = existingMount.capabilities;
  }
  if (nextProvider === "local") {
    nextRecord.branch_name = existingMount.branch_name;
    nextRecord.source_root_path = existingMount.source_root_path;
    nextRecord.forked_from_workspace_id = existingMount.forked_from_workspace_id;
  }
  return nextRecord;
}

function validateWorkspaceMountSubmission({
  existingMounts,
  mode,
  mount,
  sourceMountName,
  t,
}: {
  existingMounts: WorkspaceMountRecord[];
  mode: WorkspaceMountDialogMode;
  mount: WorkspaceMountRecord;
  sourceMountName: string;
  t: Translate;
}) {
  const mountName = mount.mount_name.trim();
  if (!mountName) {
    throw new Error(t("workspaceMountValidationName"));
  }
  const duplicateMount = existingMounts.find((existingMount) => {
    if (mode === "edit" && existingMount.mount_name === sourceMountName) {
      return false;
    }
    return existingMount.mount_name === mountName;
  });
  if (duplicateMount !== undefined) {
    throw new Error(t("workspaceMountValidationDuplicate", { mount: mountName }));
  }
  if (mount.provider === "ssh") {
    const config = mount.provider_config;
    if (!isWorkspaceSshMountConfig(config) || !config.ssh_profile_id.trim()) {
      throw new Error(t("workspaceMountValidationSshProfile"));
    }
    if (!config.remote_root.trim()) {
      throw new Error(t("workspaceMountValidationRemoteRoot"));
    }
    return;
  }
  const config = mount.provider_config;
  if (!isWorkspaceLocalMountConfig(config) || !config.root_path.trim()) {
    throw new Error(t("workspaceMountValidationLocalRoot"));
  }
}

function resolveUpdatedDefaultMountName({
  nextMounts,
  removedMountName = "",
  replacementMountName = "",
  requestedDefaultMountName,
}: {
  nextMounts: WorkspaceMountRecord[];
  removedMountName?: string;
  replacementMountName?: string;
  requestedDefaultMountName: string;
}): string {
  const requestedMount = findWorkspaceMountByName(nextMounts, requestedDefaultMountName);
  if (requestedMount !== null) {
    return requestedMount.mount_name;
  }
  const replacementMount = findWorkspaceMountByName(nextMounts, replacementMountName);
  if (
    requestedDefaultMountName.trim() &&
    removedMountName.trim() &&
    requestedDefaultMountName === removedMountName &&
    replacementMount !== null
  ) {
    return replacementMount.mount_name;
  }
  const firstLocalMount = nextMounts.find((mount) => mount.provider === "local");
  return firstLocalMount?.mount_name ?? nextMounts[0]?.mount_name ?? "default";
}

function findWorkspaceMountByName(
  mounts: WorkspaceMountRecord[],
  mountName: string,
): WorkspaceMountRecord | null {
  const normalizedMountName = mountName.trim();
  if (!normalizedMountName) {
    return null;
  }
  return mounts.find((mount) => mount.mount_name === normalizedMountName) ?? null;
}

function isWorkspaceLocalMountConfig(
  config: WorkspaceMountRecord["provider_config"],
): config is WorkspaceLocalMountConfig {
  return "root_path" in config;
}

function isWorkspaceSshMountConfig(
  config: WorkspaceMountRecord["provider_config"],
): config is WorkspaceSshMountConfig {
  return "ssh_profile_id" in config;
}

function sshProfileDescription(profile: SshProfileRecord, t: Translate): string {
  const auth = [
    profile.has_password === true ? t("workspaceSshProfilePassword") : "",
    profile.has_private_key === true
      ? profile.private_key_name?.trim() || t("workspaceSshProfilePrivateKey")
      : "",
  ].filter(Boolean).join(" / ") || t("workspaceSshProfileSystemAuth");
  return [
    profile.host,
    profile.username?.trim() ? `${profile.username}${profile.port ? `:${profile.port}` : ""}` : "",
    profile.remote_shell?.trim() || "",
    auth,
  ].filter(Boolean).join(" · ");
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 102.4) / 10} KB`;
  }
  return `${Math.round(sizeBytes / 1024 / 102.4) / 10} MB`;
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
  workspace: WorkspaceRecord | null,
  snapshot: WorkspaceSnapshot | undefined,
): string {
  return (
    snapshot?.root_path?.trim() ||
    snapshot?.default_mount_root?.trim() ||
    workspace?.root_path.trim() ||
    workspace?.workspace_id ||
    ""
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
