import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Select,
  Switch,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createFeishuGatewayAccount,
  deleteFeishuGatewayAccount,
  disableFeishuGatewayAccount,
  enableFeishuGatewayAccount,
  getOrchestrationConfig,
  getRoleConfigOptions,
  listFeishuGatewayAccounts,
  listWorkspaces,
  reloadFeishuGateway,
  updateFeishuGatewayAccount,
} from "../../api/client";
import type {
  FeishuGatewayAccountCreateInput,
  FeishuGatewayAccountRecord,
  FeishuGatewayAccountUpdateInput,
  FeishuTriggerRule,
  FeishuTriggerSecretConfig,
  FeishuTriggerTargetConfig,
  OrchestrationConfig,
  RoleConfigOptions,
  RoleOption,
  SessionMode,
  ThinkingEffort,
  WorkspaceRecord,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type FeishuEditorMode = "create" | "edit";

interface FeishuEditorState {
  account: FeishuGatewayAccountRecord | null;
  mode: FeishuEditorMode;
}

interface FeishuTriggerFormValues {
  app_id: string;
  app_name: string;
  app_secret?: string | null;
  display_name?: string | null;
  encrypt_key?: string | null;
  name: string;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  session_mode: SessionMode;
  shell_safety_policy_enabled: boolean;
  thinking_effort: ThinkingEffort;
  thinking_enabled: boolean;
  trigger_rule: FeishuTriggerRule;
  verification_token?: string | null;
  workspace_id: string;
  yolo: boolean;
}

interface FeishuSaveRequest {
  editor: FeishuEditorState;
  values: FeishuTriggerFormValues;
}

const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_TRIGGER_RULE: FeishuTriggerRule = "mention_only";
const DEFAULT_SESSION_MODE: SessionMode = "normal";
const DEFAULT_THINKING_EFFORT: ThinkingEffort = "medium";

export function TriggerSettingsSection() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<FeishuTriggerFormValues>();
  const [editor, setEditor] = useState<FeishuEditorState | null>(null);
  const sessionMode = Form.useWatch("session_mode", form) ?? DEFAULT_SESSION_MODE;
  const thinkingEnabled = Form.useWatch("thinking_enabled", form) ?? false;

  const accountsQuery = useQuery({
    queryKey: ["settings", "triggers", "feishu", "accounts"],
    queryFn: listFeishuGatewayAccounts,
  });
  const workspacesQuery = useQuery({
    queryKey: ["settings", "triggers", "workspaces"],
    queryFn: listWorkspaces,
  });
  const rolesQuery = useQuery({
    queryKey: ["settings", "triggers", "roles", "options"],
    queryFn: getRoleConfigOptions,
  });
  const orchestrationQuery = useQuery({
    queryKey: ["settings", "triggers", "orchestration"],
    queryFn: getOrchestrationConfig,
  });

  const accounts = useMemo(
    () => sortAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );
  const loading =
    accountsQuery.isLoading ||
    workspacesQuery.isLoading ||
    rolesQuery.isLoading ||
    orchestrationQuery.isLoading;
  const error =
    accountsQuery.error ??
    workspacesQuery.error ??
    rolesQuery.error ??
    orchestrationQuery.error;

  useEffect(() => {
    if (editor === null) {
      return;
    }
    form.setFieldsValue(
      formValuesFromEditor(
        editor,
        workspacesQuery.data ?? [],
        rolesQuery.data,
        orchestrationQuery.data,
      ),
    );
  }, [editor, form, orchestrationQuery.data, rolesQuery.data, workspacesQuery.data]);

  function invalidateTriggerQueries() {
    void queryClient.invalidateQueries({
      queryKey: ["settings", "triggers", "feishu", "accounts"],
    });
  }

  const saveMutation = useMutation({
    mutationFn: ({ editor: saveEditor, values }: FeishuSaveRequest) => {
      const payload = accountPayloadFromValues(values);
      if (saveEditor.mode === "edit" && saveEditor.account !== null) {
        return updateFeishuGatewayAccount(
          saveEditor.account.account_id,
          updatePayloadFromPayload(payload),
        );
      }
      return createFeishuGatewayAccount(payload);
    },
    onSuccess: (_, request) => {
      void message.success(
        request.editor.mode === "edit"
          ? t("settingsTriggersSaved")
          : t("settingsTriggersCreated"),
      );
      setEditor(null);
      invalidateTriggerQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const enableMutation = useMutation({
    mutationFn: (accountId: string) => enableFeishuGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersEnabled"));
      invalidateTriggerQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const disableMutation = useMutation({
    mutationFn: (accountId: string) => disableFeishuGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersDisabled"));
      invalidateTriggerQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteFeishuGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersDeleted"));
      setEditor(null);
      invalidateTriggerQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const reloadMutation = useMutation({
    mutationFn: () => reloadFeishuGateway(),
    onSuccess: () => {
      void message.success(t("settingsTriggersReloaded"));
      invalidateTriggerQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });

  function openCreateEditor() {
    setEditor({ account: null, mode: "create" });
  }

  function openEditEditor(account: FeishuGatewayAccountRecord) {
    setEditor({ account, mode: "edit" });
  }

  function toggleAccount(account: FeishuGatewayAccountRecord) {
    if (account.status === "enabled") {
      disableMutation.mutate(account.account_id);
      return;
    }
    enableMutation.mutate(account.account_id);
  }

  function confirmDelete(account: FeishuGatewayAccountRecord) {
    modal.confirm({
      title: t("settingsTriggersDeleteConfirm", { name: account.name }),
      okText: t("settingsTriggersDelete"),
      okButtonProps: { danger: true },
      cancelText: t("sidebarDeleteCancel"),
      onOk: () => deleteMutation.mutateAsync(account.account_id),
    });
  }

  function submit(values: FeishuTriggerFormValues) {
    if (editor === null) {
      return;
    }
    const secret = normalizeOptionalString(values.app_secret);
    if (editor.mode === "create" && secret === null) {
      form.setFields([
        { errors: [t("settingsTriggersAppSecretRequired")], name: "app_secret" },
      ]);
      return;
    }
    const presetId = normalizeOptionalString(values.orchestration_preset_id);
    if (values.session_mode === "orchestration" && presetId === null) {
      form.setFields([
        {
          errors: [t("settingsTriggersPresetRequired")],
          name: "orchestration_preset_id",
        },
      ]);
      return;
    }
    saveMutation.mutate({ editor, values });
  }

  const enabledCount = accounts.filter((account) => account.status === "enabled").length;
  const credentialsReadyCount = accounts.filter(hasAppSecret).length;

  if (editor !== null) {
    return (
      <SettingsSection title={t("settingsTriggers")}>
        <div className="at-settings-detail-page">
          <div className="at-settings-detail-header">
            <div className="at-settings-list-main">
              <span>
                {editor.mode === "edit" && editor.account !== null
                  ? editor.account.display_name || editor.account.name
                  : t("settingsTriggersNewFeishu")}
              </span>
              <Typography.Text>
                {editor.mode === "edit" && editor.account !== null
                  ? editor.account.account_id
                  : t("settingsTriggersNewFeishuDetail")}
              </Typography.Text>
            </div>
            <div className="at-settings-detail-actions">
              {editor.mode === "edit" && editor.account !== null ? (
                <>
                  <Button
                    icon={<Power size={15} />}
                    loading={enableMutation.isPending || disableMutation.isPending}
                    onClick={() => toggleAccount(editor.account as FeishuGatewayAccountRecord)}
                  >
                    {editor.account.status === "enabled"
                      ? t("settingsTriggersDisableAccount")
                      : t("settingsTriggersEnableAccount")}
                  </Button>
                  <Button
                    danger
                    icon={<Trash2 size={15} />}
                    loading={deleteMutation.isPending}
                    onClick={() => confirmDelete(editor.account as FeishuGatewayAccountRecord)}
                  >
                    {t("settingsTriggersDelete")}
                  </Button>
                </>
              ) : null}
              <Button
                form="at-feishu-trigger-form"
                htmlType="submit"
                icon={<Save size={15} />}
                loading={saveMutation.isPending}
                type="primary"
              >
                {t("settingsSave")}
              </Button>
              <Button onClick={() => setEditor(null)}>{t("settingsBack")}</Button>
            </div>
          </div>
          {editor.mode === "edit" && editor.account !== null ? (
            <dl className="at-settings-facts">
              <Fact label={t("settingsTriggersAccountId")} value={editor.account.account_id} />
              <Fact
                label={t("settingsTriggersStatus")}
                value={statusLabel(editor.account, t)}
              />
              <Fact
                label={t("settingsTriggersCredentials")}
                value={credentialStatusLabel(editor.account, t)}
              />
              <Fact
                label={t("settingsTriggersUpdated")}
                value={editor.account.updated_at || "-"}
              />
            </dl>
          ) : null}
          {editor.account?.last_error ? (
            <Alert message={editor.account.last_error} showIcon type="error" />
          ) : null}
          <FeishuTriggerForm
            form={form}
            mode={editor.mode}
            onSubmit={submit}
            orchestration={orchestrationQuery.data}
            roles={rolesQuery.data}
            sessionMode={sessionMode}
            t={t}
            thinkingEnabled={thinkingEnabled}
            workspaces={workspacesQuery.data ?? []}
          />
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("settingsTriggers")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && accountsQuery.data !== undefined ? (
        <>
          <div className="at-settings-section-actions">
            <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
              {t("settingsTriggersAddFeishu")}
            </Button>
            <Button
              icon={<RefreshCw size={15} />}
              loading={reloadMutation.isPending}
              onClick={() => reloadMutation.mutate()}
            >
              {t("settingsTriggersReload")}
            </Button>
          </div>
          <dl className="at-settings-facts">
            <Fact label={t("settingsTriggersFeishuAccounts")} value={String(accounts.length)} />
            <Fact label={t("settingsTriggersEnabledCount")} value={String(enabledCount)} />
            <Fact
              label={t("settingsTriggersCredentialsReady")}
              value={`${credentialsReadyCount}/${accounts.length}`}
            />
          </dl>
          {accounts.length === 0 ? (
            <div className="at-settings-empty">{t("settingsTriggersNoFeishuAccounts")}</div>
          ) : (
            <div className="at-settings-list" aria-label={t("settingsTriggersFeishuAccounts")}>
              {accounts.map((account) => (
                <div className="at-settings-list-row at-trigger-row" key={account.account_id}>
                  <button
                    className="at-trigger-row-main"
                    onClick={() => openEditEditor(account)}
                    type="button"
                  >
                    <div className="at-settings-list-main">
                      <span>{account.display_name || account.name}</span>
                      <Typography.Text ellipsis title={accountDetail(account)}>
                        {accountDetail(account)}
                      </Typography.Text>
                    </div>
                  </button>
                  <div className="at-trigger-row-actions">
                    <Typography.Text className="at-settings-list-meta" ellipsis>
                      {statusLabel(account, t)}
                    </Typography.Text>
                    <Button
                      icon={<Power size={14} />}
                      loading={enableMutation.isPending || disableMutation.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleAccount(account);
                      }}
                      size="small"
                    >
                      {account.status === "enabled"
                        ? t("settingsTriggersDisableAccount")
                        : t("settingsTriggersEnableAccount")}
                    </Button>
                    <Button
                      icon={<Pencil size={14} />}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditEditor(account);
                      }}
                      size="small"
                    >
                      {t("settingsTriggersEditAccount")}
                    </Button>
                    <Button
                      danger
                      icon={<Trash2 size={14} />}
                      loading={deleteMutation.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDelete(account);
                      }}
                      size="small"
                    >
                      {t("settingsTriggersDelete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </SettingsSection>
  );
}

function FeishuTriggerForm({
  form,
  mode,
  onSubmit,
  orchestration,
  roles,
  sessionMode,
  t,
  thinkingEnabled,
  workspaces,
}: {
  form: FormInstance<FeishuTriggerFormValues>;
  mode: FeishuEditorMode;
  onSubmit: (values: FeishuTriggerFormValues) => void;
  orchestration: OrchestrationConfig | undefined;
  roles: RoleConfigOptions | undefined;
  sessionMode: SessionMode;
  t: Translate;
  thinkingEnabled: boolean;
  workspaces: WorkspaceRecord[];
}) {
  return (
    <Form
      className="at-settings-form at-settings-wide-form"
      form={form}
      id="at-feishu-trigger-form"
      layout="vertical"
      onFinish={onSubmit}
    >
      <div className="at-settings-card-list">
        <div className="at-settings-form-card">
          <Typography.Text strong>{t("settingsTriggersAppConfig")}</Typography.Text>
          <Form.Item
            label={t("settingsTriggersName")}
            name="name"
            rules={[{ required: true, message: t("settingsTriggersNameRequired") }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label={t("settingsTriggersDisplayName")} name="display_name">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t("settingsTriggersAppId")}
            name="app_id"
            rules={[{ required: true, message: t("settingsTriggersAppIdRequired") }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t("settingsTriggersAppName")}
            name="app_name"
            rules={[{ required: true, message: t("settingsTriggersAppNameRequired") }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </div>
        <div className="at-settings-form-card">
          <Typography.Text strong>{t("settingsTriggersCredentials")}</Typography.Text>
          <Form.Item
            extra={
              mode === "edit" ? t("settingsTriggersSecretPreserved") : undefined
            }
            label={t("settingsTriggersAppSecret")}
            name="app_secret"
          >
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item
            extra={mode === "edit" ? t("settingsTriggersSecretPreserved") : undefined}
            label={t("settingsTriggersVerificationToken")}
            name="verification_token"
          >
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item
            extra={mode === "edit" ? t("settingsTriggersSecretPreserved") : undefined}
            label={t("settingsTriggersEncryptKey")}
            name="encrypt_key"
          >
            <Input.Password autoComplete="off" />
          </Form.Item>
        </div>
        <div className="at-settings-form-card">
          <Typography.Text strong>{t("settingsTriggersSessionConfig")}</Typography.Text>
          <Form.Item
            label={t("settingsTriggersWorkspace")}
            name="workspace_id"
            rules={[{ required: true, message: t("settingsTriggersWorkspaceRequired") }]}
          >
            <Select options={workspaceOptions(workspaces)} />
          </Form.Item>
          <Form.Item label={t("settingsTriggersRule")} name="trigger_rule">
            <Select
              options={[
                {
                  label: t("settingsTriggersRuleMention"),
                  value: "mention_only",
                },
                {
                  label: t("settingsTriggersRuleAll"),
                  value: "all_messages",
                },
              ]}
            />
          </Form.Item>
          <Form.Item label={t("settingsTriggersMode")} name="session_mode">
            <Select
              options={[
                { label: t("settingsTriggersModeNormal"), value: "normal" },
                {
                  label: t("settingsTriggersModeOrchestration"),
                  value: "orchestration",
                },
              ]}
            />
          </Form.Item>
          {sessionMode === "normal" ? (
            <Form.Item
              label={t("settingsTriggersNormalRootRole")}
              name="normal_root_role_id"
            >
              <Select options={normalRoleOptions(roles)} />
            </Form.Item>
          ) : null}
          {sessionMode === "orchestration" ? (
            <Form.Item
              label={t("settingsTriggersOrchestrationPreset")}
              name="orchestration_preset_id"
            >
              <Select options={orchestrationPresetOptions(orchestration)} />
            </Form.Item>
          ) : null}
          <Form.Item
            label={t("settingsTriggersYolo")}
            name="yolo"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label={t("settingsTriggersShellSafetyPolicy")}
            name="shell_safety_policy_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label={t("settingsTriggersThinking")}
            name="thinking_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {thinkingEnabled ? (
            <Form.Item label={t("settingsTriggersThinkingEffort")} name="thinking_effort">
              <Select
                options={[
                  { label: "minimal", value: "minimal" },
                  { label: "low", value: "low" },
                  { label: "medium", value: "medium" },
                  { label: "high", value: "high" },
                ]}
              />
            </Form.Item>
          ) : null}
        </div>
      </div>
    </Form>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function sortAccounts(
  accounts: FeishuGatewayAccountRecord[],
): FeishuGatewayAccountRecord[] {
  return [...accounts].sort((left, right) =>
    (left.display_name || left.name).localeCompare(right.display_name || right.name),
  );
}

function accountPayloadFromValues(
  values: FeishuTriggerFormValues,
): FeishuGatewayAccountCreateInput {
  const sessionMode = values.session_mode || DEFAULT_SESSION_MODE;
  const targetConfig: FeishuTriggerTargetConfig = {
    normal_root_role_id:
      sessionMode === "normal" ? normalizeOptionalString(values.normal_root_role_id) : null,
    orchestration_preset_id:
      sessionMode === "orchestration"
        ? normalizeOptionalString(values.orchestration_preset_id)
        : null,
    session_mode: sessionMode,
    shell_safety_policy_enabled: values.shell_safety_policy_enabled !== false,
    thinking: {
      enabled: values.thinking_enabled === true,
      effort:
        values.thinking_enabled === true
          ? values.thinking_effort || DEFAULT_THINKING_EFFORT
          : null,
    },
    workspace_id: values.workspace_id.trim(),
    yolo: values.yolo !== false,
  };
  const payload: FeishuGatewayAccountCreateInput = {
    display_name: normalizeOptionalString(values.display_name),
    enabled: true,
    name: values.name.trim(),
    source_config: {
      app_id: values.app_id.trim(),
      app_name: values.app_name.trim(),
      provider: "feishu",
      trigger_rule: values.trigger_rule || DEFAULT_TRIGGER_RULE,
    },
    target_config: targetConfig,
  };
  const secretConfig = secretConfigFromValues(values);
  if (secretConfig !== null) {
    payload.secret_config = secretConfig;
  }
  return payload;
}

function updatePayloadFromPayload(
  payload: FeishuGatewayAccountCreateInput,
): FeishuGatewayAccountUpdateInput {
  const updatePayload: FeishuGatewayAccountUpdateInput = {
    display_name: payload.display_name ?? null,
    name: payload.name,
    source_config: payload.source_config,
    target_config: payload.target_config,
  };
  if (payload.secret_config !== undefined) {
    updatePayload.secret_config = payload.secret_config;
  }
  return updatePayload;
}

function secretConfigFromValues(
  values: FeishuTriggerFormValues,
): FeishuTriggerSecretConfig | null {
  const secretConfig: FeishuTriggerSecretConfig = {};
  const appSecret = normalizeOptionalString(values.app_secret);
  const verificationToken = normalizeOptionalString(values.verification_token);
  const encryptKey = normalizeOptionalString(values.encrypt_key);
  if (appSecret !== null) {
    secretConfig.app_secret = appSecret;
  }
  if (verificationToken !== null) {
    secretConfig.verification_token = verificationToken;
  }
  if (encryptKey !== null) {
    secretConfig.encrypt_key = encryptKey;
  }
  if (
    secretConfig.app_secret === undefined &&
    secretConfig.verification_token === undefined &&
    secretConfig.encrypt_key === undefined
  ) {
    return null;
  }
  return secretConfig;
}

function formValuesFromEditor(
  editor: FeishuEditorState,
  workspaces: WorkspaceRecord[],
  roles: RoleConfigOptions | undefined,
  orchestration: OrchestrationConfig | undefined,
): FeishuTriggerFormValues {
  const account = editor.account;
  const targetConfig = account?.target_config ?? null;
  const sourceConfig = account?.source_config;
  return {
    app_id: sourceConfig?.app_id ?? "",
    app_name: sourceConfig?.app_name ?? "",
    app_secret: "",
    display_name: account?.display_name ?? "",
    encrypt_key: "",
    name: account?.name ?? "",
    normal_root_role_id:
      targetConfig?.normal_root_role_id ?? defaultNormalRoleId(roles),
    orchestration_preset_id:
      targetConfig?.orchestration_preset_id ??
      defaultOrchestrationPresetId(orchestration),
    session_mode: targetConfig?.session_mode ?? DEFAULT_SESSION_MODE,
    shell_safety_policy_enabled:
      targetConfig?.shell_safety_policy_enabled !== false,
    thinking_effort: targetConfig?.thinking?.effort ?? DEFAULT_THINKING_EFFORT,
    thinking_enabled: targetConfig?.thinking?.enabled === true,
    trigger_rule: sourceConfig?.trigger_rule ?? DEFAULT_TRIGGER_RULE,
    verification_token: "",
    workspace_id: targetConfig?.workspace_id ?? defaultWorkspaceId(workspaces),
    yolo: targetConfig?.yolo !== false,
  };
}

function defaultWorkspaceId(workspaces: WorkspaceRecord[]): string {
  return workspaces[0]?.workspace_id ?? DEFAULT_WORKSPACE_ID;
}

function defaultNormalRoleId(roles: RoleConfigOptions | undefined): string {
  return (
    roles?.main_agent_role_id ??
    roles?.main_agent_role?.role_id ??
    roles?.normal_mode_roles[0]?.role_id ??
    ""
  );
}

function defaultOrchestrationPresetId(
  orchestration: OrchestrationConfig | undefined,
): string {
  return (
    orchestration?.default_orchestration_preset_id ??
    orchestration?.presets?.[0]?.preset_id ??
    ""
  );
}

function workspaceOptions(workspaces: WorkspaceRecord[]) {
  const options = workspaces.map((workspace) => ({
    label: workspaceLabel(workspace),
    value: workspace.workspace_id,
  }));
  if (options.length === 0) {
    return [{ label: DEFAULT_WORKSPACE_ID, value: DEFAULT_WORKSPACE_ID }];
  }
  return options;
}

function normalRoleOptions(roles: RoleConfigOptions | undefined) {
  const roleOptions = uniqueRoles(roles?.normal_mode_roles ?? []).map((role) => ({
    label: roleLabel(role),
    value: role.role_id,
  }));
  return [{ label: "-", value: "" }, ...roleOptions];
}

function orchestrationPresetOptions(orchestration: OrchestrationConfig | undefined) {
  return (orchestration?.presets ?? []).map((preset) => ({
    label: preset.name ? `${preset.name} (${preset.preset_id})` : preset.preset_id,
    value: preset.preset_id,
  }));
}

function uniqueRoles(roles: RoleOption[]): RoleOption[] {
  const seen = new Set<string>();
  return roles.filter((role) => {
    if (seen.has(role.role_id)) {
      return false;
    }
    seen.add(role.role_id);
    return true;
  });
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  const name = workspace.display_name ?? workspace.name ?? workspace.workspace_id;
  if (workspace.root_path.trim()) {
    return `${name} · ${workspace.root_path}`;
  }
  return name;
}

function roleLabel(role: RoleOption): string {
  return role.name ? `${role.name} (${role.role_id})` : role.role_id;
}

function accountDetail(account: FeishuGatewayAccountRecord): string {
  const appName = account.source_config.app_name || "-";
  const workspaceId = account.target_config?.workspace_id ?? DEFAULT_WORKSPACE_ID;
  return `${appName} · ${workspaceId} · ${account.source_config.trigger_rule}`;
}

function statusLabel(account: FeishuGatewayAccountRecord, t: Translate): string {
  return account.status === "enabled" ? t("settingsEnabled") : t("settingsDisabled");
}

function credentialStatusLabel(
  account: FeishuGatewayAccountRecord,
  t: Translate,
): string {
  const secretStatus = account.secret_status;
  if (secretStatus?.app_secret_configured === true) {
    return t("settingsTriggersCredentialsReady");
  }
  return t("settingsTriggersCredentialsMissing");
}

function hasAppSecret(account: FeishuGatewayAccountRecord): boolean {
  return account.secret_status?.app_secret_configured === true;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
