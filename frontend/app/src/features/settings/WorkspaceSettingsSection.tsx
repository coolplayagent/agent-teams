import {
  App,
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { Activity, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  deleteSshProfile,
  listSshProfiles,
  probeSshProfileConnection,
  revealSshProfilePassword,
  saveSshProfile,
} from "../../api/client";
import type {
  SshProfileConfig,
  SshProfileConnectivityProbeResult,
  SshProfileRecord,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type SshProfileEditorMode = "create" | "edit";

interface SshProfileEditorState {
  mode: SshProfileEditorMode;
  profile: SshProfileRecord | null;
}

interface SshProfileFormValues {
  ssh_profile_id: string;
  host: string;
  username: string;
  port?: number | null;
  remote_shell?: string | null;
  connect_timeout_seconds?: number | null;
  password?: string | null;
  private_key?: string | null;
  private_key_name?: string | null;
}

interface ProbeState {
  label: string;
  result: SshProfileConnectivityProbeResult;
}

export function WorkspaceSettingsSection() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editor, setEditor] = useState<SshProfileEditorState | null>(null);
  const [probeState, setProbeState] = useState<ProbeState | null>(null);
  const [form] = Form.useForm<SshProfileFormValues>();

  const profilesQuery = useQuery({
    queryKey: ["settings", "workspace", "ssh-profiles"],
    queryFn: listSshProfiles,
  });
  const profiles = useMemo(
    () => sortProfiles(profilesQuery.data ?? []),
    [profilesQuery.data],
  );
  const activeProfile =
    profiles.find((profile) => profile.ssh_profile_id === activeProfileId) ??
    profiles[0] ??
    null;

  useEffect(() => {
    if (profiles.length === 0) {
      setActiveProfileId(null);
      return;
    }
    if (!profiles.some((profile) => profile.ssh_profile_id === activeProfileId)) {
      setActiveProfileId(profiles[0].ssh_profile_id);
    }
  }, [activeProfileId, profiles]);

  useEffect(() => {
    if (editor === null) {
      form.resetFields();
      return;
    }
    form.setFieldsValue(formValuesFromProfile(editor.profile));
  }, [editor, form]);

  const saveMutation = useMutation({
    mutationFn: ({
      config,
      sshProfileId,
    }: {
      config: SshProfileConfig;
      sshProfileId: string;
    }) => saveSshProfile(sshProfileId, config),
    onSuccess: (profile) => {
      void message.success(
        t("settingsWorkspaceSaved", { profile: profile.ssh_profile_id }),
      );
      setEditor(null);
      setActiveProfileId(profile.ssh_profile_id);
      void queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "ssh-profiles"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["workspace", "ssh-profiles"],
      });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSshProfile,
    onSuccess: (_, sshProfileId) => {
      void message.success(t("settingsWorkspaceDeleted", { profile: sshProfileId }));
      if (activeProfileId === sshProfileId) {
        setActiveProfileId(null);
      }
      void queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "ssh-profiles"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["workspace", "ssh-profiles"],
      });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });
  const probeMutation = useMutation({
    mutationFn: ({
      request,
    }: {
      label: string;
      request: Parameters<typeof probeSshProfileConnection>[0];
    }) => probeSshProfileConnection(request),
    onSuccess: (result, variables) => {
      setProbeState({ label: variables.label, result });
      if (result.ok) {
        void message.success(
          t("settingsWorkspaceProbeSuccess", {
            latency: String(result.latency_ms),
            profile: variables.label,
          }),
        );
        return;
      }
      void message.error(result.error_message || t("settingsWorkspaceProbeFailed"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsWorkspaceProbeFailed"),
      );
    },
  });
  const revealMutation = useMutation({
    mutationFn: revealSshProfilePassword,
    onSuccess: (payload) => {
      if (payload.password === null || payload.password === "") {
        void message.info(t("settingsWorkspaceNoStoredPassword"));
        return;
      }
      form.setFieldValue("password", payload.password);
      void message.success(t("settingsWorkspacePasswordRevealed"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsWorkspacePasswordRevealFailed"),
      );
    },
  });

  function openCreateEditor() {
    setEditor({ mode: "create", profile: null });
    setProbeState(null);
  }

  function openEditEditor(profile: SshProfileRecord) {
    setEditor({ mode: "edit", profile });
    setProbeState(null);
  }

  function submit(values: SshProfileFormValues) {
    const sshProfileId = values.ssh_profile_id.trim();
    saveMutation.mutate({
      sshProfileId,
      config: configFromValues(values),
    });
  }

  async function probeDraft() {
    const values = await form.validateFields();
    const label = values.ssh_profile_id.trim() || t("settingsWorkspaceDraft");
    probeMutation.mutate({
      label,
      request: {
        ssh_profile_id: editor?.mode === "edit" ? label : null,
        override: configFromValues(values),
        timeout_ms: probeTimeoutMs(values),
      },
    });
  }

  function probeSaved(profile: SshProfileRecord) {
    probeMutation.mutate({
      label: profile.ssh_profile_id,
      request: {
        ssh_profile_id: profile.ssh_profile_id,
        timeout_ms: probeTimeoutMs({
          connect_timeout_seconds: profile.connect_timeout_seconds,
        }),
      },
    });
  }

  function confirmDelete(profile: SshProfileRecord) {
    modal.confirm({
      title: t("settingsWorkspaceDeleteConfirm", {
        profile: profile.ssh_profile_id,
      }),
      okText: t("settingsWorkspaceDelete"),
      okButtonProps: { danger: true },
      cancelText: t("sidebarDeleteCancel"),
      onOk: () => deleteMutation.mutateAsync(profile.ssh_profile_id),
    });
  }

  return (
    <SettingsSection title={t("settingsWorkspace")}>
      <SettingsQueryState error={profilesQuery.error} loading={profilesQuery.isLoading} />
      {!profilesQuery.isLoading && profilesQuery.data !== undefined ? (
        <>
          <div className="at-settings-section-actions">
            <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
              {t("settingsWorkspaceAddProfile")}
            </Button>
          </div>
          {probeState !== null ? (
            <SshProbeResultAlert probeState={probeState} t={t} />
          ) : null}
          {profiles.length === 0 ? (
            <div className="at-settings-empty">{t("settingsWorkspaceNoProfiles")}</div>
          ) : (
            <div className="at-settings-workspace-grid">
              <div className="at-settings-list" aria-label={t("settingsWorkspaceProfiles")}>
                {profiles.map((profile) => (
                  <button
                    className={
                      profile.ssh_profile_id === activeProfile?.ssh_profile_id
                        ? "at-settings-list-row at-settings-list-button is-active"
                        : "at-settings-list-row at-settings-list-button"
                    }
                    key={profile.ssh_profile_id}
                    onClick={() => setActiveProfileId(profile.ssh_profile_id)}
                    type="button"
                  >
                    <div className="at-settings-list-main">
                      <span>{profile.ssh_profile_id}</span>
                      <Typography.Text ellipsis title={profileSummary(profile, t)}>
                        {profileSummary(profile, t)}
                      </Typography.Text>
                    </div>
                    <Typography.Text className="at-settings-list-meta" ellipsis>
                      {authSummary(profile, t)}
                    </Typography.Text>
                  </button>
                ))}
              </div>
              {activeProfile !== null ? (
                <SshProfileDetail
                  deleteLoading={deleteMutation.isPending}
                  onDelete={() => confirmDelete(activeProfile)}
                  onEdit={() => openEditEditor(activeProfile)}
                  onProbe={() => probeSaved(activeProfile)}
                  probeLoading={probeMutation.isPending}
                  profile={activeProfile}
                  t={t}
                />
              ) : null}
            </div>
          )}
        </>
      ) : null}
      <SshProfileEditorModal
        editor={editor}
        form={form}
        onCancel={() => setEditor(null)}
        onProbe={probeDraft}
        onRevealPassword={(profileId) => revealMutation.mutate(profileId)}
        onSubmit={submit}
        probeLoading={probeMutation.isPending}
        revealLoading={revealMutation.isPending}
        saving={saveMutation.isPending}
        t={t}
      />
    </SettingsSection>
  );
}

function SshProfileDetail({
  deleteLoading,
  onDelete,
  onEdit,
  onProbe,
  probeLoading,
  profile,
  t,
}: {
  deleteLoading: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onProbe: () => void;
  probeLoading: boolean;
  profile: SshProfileRecord;
  t: Translate;
}) {
  return (
    <div className="at-settings-workspace-detail">
      <div className="at-settings-detail-header">
        <div>
          <Typography.Title level={4}>{profile.ssh_profile_id}</Typography.Title>
          <Typography.Text>{profileSummary(profile, t)}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button
            icon={<Activity size={15} />}
            loading={probeLoading}
            onClick={onProbe}
          >
            {t("settingsWorkspaceTest")}
          </Button>
          <Button icon={<Pencil size={15} />} onClick={onEdit}>
            {t("settingsWorkspaceEdit")}
          </Button>
          <Button
            danger
            icon={<Trash2 size={15} />}
            loading={deleteLoading}
            onClick={onDelete}
          >
            {t("settingsWorkspaceDelete")}
          </Button>
        </div>
      </div>
      <dl className="at-settings-facts at-settings-workspace-facts">
        <div>
          <dt>{t("settingsWorkspaceHost")}</dt>
          <dd>{profile.host}</dd>
        </div>
        <div>
          <dt>{t("settingsWorkspaceUsername")}</dt>
          <dd>{profile.username?.trim() || "-"}</dd>
        </div>
        <div>
          <dt>{t("settingsWorkspaceAuth")}</dt>
          <dd>{authSummary(profile, t)}</dd>
        </div>
        <div>
          <dt>{t("settingsWorkspaceRemoteShell")}</dt>
          <dd>{profile.remote_shell?.trim() || "-"}</dd>
        </div>
      </dl>
    </div>
  );
}

function SshProbeResultAlert({
  probeState,
  t,
}: {
  probeState: ProbeState;
  t: Translate;
}) {
  const result = probeState.result;
  const detail = result.ok
    ? t("settingsWorkspaceProbeSuccess", {
        latency: String(result.latency_ms),
        profile: probeState.label,
      })
    : result.error_message || t("settingsWorkspaceProbeFailed");
  return (
    <Alert
      className="at-settings-probe-result"
      message={detail}
      showIcon
      type={result.ok ? "success" : "error"}
    />
  );
}

function SshProfileEditorModal({
  editor,
  form,
  onCancel,
  onProbe,
  onRevealPassword,
  onSubmit,
  probeLoading,
  revealLoading,
  saving,
  t,
}: {
  editor: SshProfileEditorState | null;
  form: FormInstance<SshProfileFormValues>;
  onCancel: () => void;
  onProbe: () => void;
  onRevealPassword: (profileId: string) => void;
  onSubmit: (values: SshProfileFormValues) => void;
  probeLoading: boolean;
  revealLoading: boolean;
  saving: boolean;
  t: Translate;
}) {
  const profile = editor?.profile ?? null;
  return (
    <Modal
      cancelText={t("sidebarDeleteCancel")}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t("sidebarDeleteCancel")}
        </Button>,
        <Button
          icon={<Activity size={15} />}
          key="probe"
          loading={probeLoading}
          onClick={onProbe}
        >
          {t("settingsWorkspaceTestDraft")}
        </Button>,
        <Button
          key="save"
          loading={saving}
          onClick={() => form.submit()}
          type="primary"
        >
          {t("settingsSave")}
        </Button>,
      ]}
      onCancel={onCancel}
      open={editor !== null}
      title={
        editor?.mode === "edit"
          ? t("settingsWorkspaceEditProfile")
          : t("settingsWorkspaceAddProfile")
      }
      width={620}
    >
      <Form
        className="at-settings-form at-settings-wide-form"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        <div className="at-settings-card-list">
          <div className="at-settings-form-card">
            <Form.Item
              label={t("settingsWorkspaceProfileId")}
              name="ssh_profile_id"
              rules={[{ required: true, message: t("settingsWorkspaceProfileIdRequired") }]}
            >
              <Input
                disabled={editor?.mode === "edit"}
                placeholder={t("settingsWorkspaceProfileIdPlaceholder")}
              />
            </Form.Item>
            <Form.Item
              label={t("settingsWorkspaceHost")}
              name="host"
              rules={[{ required: true, message: t("settingsWorkspaceHostRequired") }]}
            >
              <Input placeholder={t("settingsWorkspaceHostPlaceholder")} />
            </Form.Item>
            <Form.Item
              label={t("settingsWorkspaceUsername")}
              name="username"
              rules={[{ required: true, message: t("settingsWorkspaceUsernameRequired") }]}
            >
              <Input placeholder={t("settingsWorkspaceUsernamePlaceholder")} />
            </Form.Item>
            <div className="at-settings-inline-controls">
              <Form.Item label={t("settingsWorkspacePort")} name="port">
                <InputNumber min={1} max={65535} />
              </Form.Item>
              <Form.Item
                label={t("settingsWorkspaceConnectTimeout")}
                name="connect_timeout_seconds"
              >
                <InputNumber min={1} />
              </Form.Item>
            </div>
          </div>
          <div className="at-settings-form-card">
            <Form.Item label={t("settingsWorkspaceRemoteShell")} name="remote_shell">
              <Input placeholder="/bin/bash" />
            </Form.Item>
            <Form.Item label={t("settingsWorkspacePassword")} name="password">
              <Input.Password
                autoComplete="off"
                placeholder={
                  profile?.has_password
                    ? "************"
                    : t("settingsWorkspacePasswordPlaceholder")
                }
              />
            </Form.Item>
            {profile?.has_password === true ? (
              <Button
                icon={<KeyRound size={15} />}
                loading={revealLoading}
                onClick={() => onRevealPassword(profile.ssh_profile_id)}
              >
                {t("settingsWorkspaceRevealPassword")}
              </Button>
            ) : null}
            <Form.Item
              label={t("settingsWorkspacePrivateKeyName")}
              name="private_key_name"
            >
              <Input placeholder={t("settingsWorkspacePrivateKeyNamePlaceholder")} />
            </Form.Item>
            <Form.Item label={t("settingsWorkspacePrivateKey")} name="private_key">
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder={
                  profile?.has_private_key
                    ? t("settingsWorkspacePrivateKeyPreserved")
                    : t("settingsWorkspacePrivateKeyPlaceholder")
                }
              />
            </Form.Item>
          </div>
        </div>
      </Form>
    </Modal>
  );
}

function sortProfiles(profiles: SshProfileRecord[]): SshProfileRecord[] {
  return [...profiles].sort((left, right) =>
    left.ssh_profile_id.localeCompare(right.ssh_profile_id),
  );
}

function formValuesFromProfile(
  profile: SshProfileRecord | null,
): Partial<SshProfileFormValues> {
  if (profile === null) {
    return {
      ssh_profile_id: "",
      host: "",
      username: "",
      port: 22,
      connect_timeout_seconds: 15,
      remote_shell: "",
      password: "",
      private_key: "",
      private_key_name: "",
    };
  }
  return {
    ssh_profile_id: profile.ssh_profile_id,
    host: profile.host,
    username: profile.username ?? "",
    port: profile.port ?? 22,
    connect_timeout_seconds: profile.connect_timeout_seconds ?? 15,
    remote_shell: profile.remote_shell ?? "",
    password: "",
    private_key: "",
    private_key_name: profile.private_key_name ?? "",
  };
}

function configFromValues(values: SshProfileFormValues): SshProfileConfig {
  return {
    host: values.host.trim(),
    username: values.username.trim(),
    password: optionalText(values.password),
    port: optionalNumber(values.port),
    remote_shell: optionalText(values.remote_shell),
    connect_timeout_seconds: optionalNumber(values.connect_timeout_seconds),
    private_key: optionalText(values.private_key),
    private_key_name: optionalText(values.private_key_name),
  };
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function optionalNumber(value: number | null | undefined): number | null {
  return value ?? null;
}

function probeTimeoutMs(values: Pick<SshProfileFormValues, "connect_timeout_seconds">) {
  return Math.max(1000, (values.connect_timeout_seconds ?? 15) * 1000);
}

function profileSummary(profile: SshProfileRecord, t: Translate): string {
  return [
    profile.host,
    profile.username?.trim() || t("settingsWorkspaceUsernameMissing"),
    profile.port !== null && profile.port !== undefined ? String(profile.port) : "",
  ].filter(Boolean).join(" · ");
}

function authSummary(profile: SshProfileRecord, t: Translate): string {
  const values = [
    profile.has_password === true ? t("workspaceSshProfilePassword") : "",
    profile.has_private_key === true ? t("workspaceSshProfilePrivateKey") : "",
  ].filter(Boolean);
  return values.length > 0
    ? values.join(" · ")
    : t("workspaceSshProfileSystemAuth");
}
