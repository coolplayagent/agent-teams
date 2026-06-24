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
  deleteWeChatGatewayAccount,
  disableFeishuGatewayAccount,
  disableWeChatGatewayAccount,
  enableFeishuGatewayAccount,
  enableWeChatGatewayAccount,
  getOrchestrationConfig,
  getRoleConfigOptions,
  listFeishuGatewayAccounts,
  listWeChatGatewayAccounts,
  listWorkspaces,
  reloadFeishuGateway,
  reloadWeChatGateway,
  startWeChatGatewayLogin,
  updateFeishuGatewayAccount,
  updateWeChatGatewayAccount,
  waitWeChatGatewayLogin,
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
  WeChatGatewayAccountRecord,
  WeChatGatewayAccountUpdateInput,
  WeChatLoginStartResponse,
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

interface WeChatEditorState {
  account: WeChatGatewayAccountRecord;
}

interface WeChatGatewayFormValues {
  base_url: string;
  cdn_base_url: string;
  display_name: string;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  route_tag?: string | null;
  session_mode: SessionMode;
  thinking_effort: ThinkingEffort;
  thinking_enabled: boolean;
  workspace_id: string;
  yolo: boolean;
}

interface WeChatSaveRequest {
  editor: WeChatEditorState;
  values: WeChatGatewayFormValues;
}

interface Notice {
  kind: "error" | "info" | "success" | "warning";
  message: string;
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
  const [wechatForm] = Form.useForm<WeChatGatewayFormValues>();
  const [editor, setEditor] = useState<FeishuEditorState | null>(null);
  const [wechatEditor, setWeChatEditor] = useState<WeChatEditorState | null>(null);
  const [wechatLoginSession, setWeChatLoginSession] =
    useState<WeChatLoginStartResponse | null>(null);
  const [wechatNotice, setWeChatNotice] = useState<Notice | null>(null);
  const sessionMode = Form.useWatch("session_mode", form) ?? DEFAULT_SESSION_MODE;
  const thinkingEnabled = Form.useWatch("thinking_enabled", form) ?? false;
  const wechatSessionMode =
    Form.useWatch("session_mode", wechatForm) ?? DEFAULT_SESSION_MODE;
  const wechatThinkingEnabled =
    Form.useWatch("thinking_enabled", wechatForm) ?? false;

  const accountsQuery = useQuery({
    queryKey: ["settings", "triggers", "feishu", "accounts"],
    queryFn: listFeishuGatewayAccounts,
  });
  const wechatAccountsQuery = useQuery({
    queryKey: ["settings", "triggers", "wechat", "accounts"],
    queryFn: listWeChatGatewayAccounts,
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
  const wechatAccounts = useMemo(
    () => sortWeChatAccounts(wechatAccountsQuery.data ?? []),
    [wechatAccountsQuery.data],
  );
  const loading =
    accountsQuery.isLoading ||
    wechatAccountsQuery.isLoading ||
    workspacesQuery.isLoading ||
    rolesQuery.isLoading ||
    orchestrationQuery.isLoading;
  const error =
    accountsQuery.error ??
    wechatAccountsQuery.error ??
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

  useEffect(() => {
    if (wechatEditor === null) {
      return;
    }
    wechatForm.setFieldsValue(
      wechatFormValuesFromEditor(
        wechatEditor,
        workspacesQuery.data ?? [],
        rolesQuery.data,
        orchestrationQuery.data,
      ),
    );
  }, [
    orchestrationQuery.data,
    rolesQuery.data,
    wechatEditor,
    wechatForm,
    workspacesQuery.data,
  ]);

  function invalidateFeishuQueries() {
    void queryClient.invalidateQueries({
      queryKey: ["settings", "triggers", "feishu", "accounts"],
    });
  }

  function invalidateWeChatQueries() {
    void queryClient.invalidateQueries({
      queryKey: ["settings", "triggers", "wechat", "accounts"],
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
      invalidateFeishuQueries();
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
      invalidateFeishuQueries();
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
      invalidateFeishuQueries();
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
      invalidateFeishuQueries();
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
      invalidateFeishuQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const wechatSaveMutation = useMutation({
    mutationFn: ({ editor: saveEditor, values }: WeChatSaveRequest) =>
      updateWeChatGatewayAccount(
        saveEditor.account.account_id,
        wechatPayloadFromValues(values),
      ),
    onSuccess: () => {
      void message.success(t("settingsTriggersWeChatSaved"));
      setWeChatEditor(null);
      setWeChatNotice({
        kind: "success",
        message: t("settingsTriggersWeChatSaved"),
      });
      invalidateWeChatQueries();
    },
    onError: (mutationError) => {
      const fallback = t("settingsSaveFailed");
      void message.error(
        mutationError instanceof Error ? mutationError.message : fallback,
      );
    },
  });
  const wechatEnableMutation = useMutation({
    mutationFn: (accountId: string) => enableWeChatGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersWeChatEnabled"));
      invalidateWeChatQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const wechatDisableMutation = useMutation({
    mutationFn: (accountId: string) => disableWeChatGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersWeChatDisabled"));
      invalidateWeChatQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const wechatDeleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteWeChatGatewayAccount(accountId),
    onSuccess: () => {
      void message.success(t("settingsTriggersWeChatDeleted"));
      setWeChatEditor(null);
      setWeChatNotice({
        kind: "success",
        message: t("settingsTriggersWeChatDeleted"),
      });
      invalidateWeChatQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const wechatReloadMutation = useMutation({
    mutationFn: () => reloadWeChatGateway(),
    onSuccess: () => {
      void message.success(t("settingsTriggersWeChatReloaded"));
      invalidateWeChatQueries();
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsSaveFailed"),
      );
    },
  });
  const wechatWaitLoginMutation = useMutation({
    mutationFn: (sessionKey: string) =>
      waitWeChatGatewayLogin({ session_key: sessionKey, timeout_ms: 480000 }),
    onSuccess: (result) => {
      setWeChatLoginSession(null);
      if (result.connected) {
        setWeChatNotice({
          kind: "success",
          message: result.message || t("settingsTriggersWeChatConnected"),
        });
        void message.success(result.message || t("settingsTriggersWeChatConnected"));
        invalidateWeChatQueries();
        return;
      }
      setWeChatNotice({
        kind: "error",
        message: result.message || t("settingsTriggersWeChatLoginFailed"),
      });
    },
    onError: (mutationError) => {
      setWeChatLoginSession(null);
      setWeChatNotice({
        kind: "error",
        message:
          mutationError instanceof Error
            ? mutationError.message
            : t("settingsTriggersWeChatLoginFailed"),
      });
    },
  });
  const wechatStartLoginMutation = useMutation({
    mutationFn: () => startWeChatGatewayLogin({}),
    onSuccess: (session) => {
      setWeChatLoginSession(session);
      setWeChatNotice({
        kind: "info",
        message: session.message || t("settingsTriggersWeChatLoginWaiting"),
      });
      wechatWaitLoginMutation.mutate(session.session_key);
    },
    onError: (mutationError) => {
      setWeChatNotice({
        kind: "error",
        message:
          mutationError instanceof Error
            ? mutationError.message
            : t("settingsTriggersWeChatLoginFailed"),
      });
    },
  });

  function openCreateEditor() {
    setWeChatEditor(null);
    setEditor({ account: null, mode: "create" });
  }

  function openEditEditor(account: FeishuGatewayAccountRecord) {
    setWeChatEditor(null);
    setEditor({ account, mode: "edit" });
  }

  function openEditWeChatEditor(account: WeChatGatewayAccountRecord) {
    setEditor(null);
    setWeChatEditor({ account });
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

  function toggleWeChatAccount(account: WeChatGatewayAccountRecord) {
    if (account.status === "enabled") {
      wechatDisableMutation.mutate(account.account_id);
      return;
    }
    wechatEnableMutation.mutate(account.account_id);
  }

  function confirmDeleteWeChat(account: WeChatGatewayAccountRecord) {
    modal.confirm({
      title: t("settingsTriggersDeleteWeChatConfirm", {
        name: account.display_name || account.account_id,
      }),
      okText: t("settingsTriggersDelete"),
      okButtonProps: { danger: true },
      cancelText: t("sidebarDeleteCancel"),
      onOk: () => wechatDeleteMutation.mutateAsync(account.account_id),
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

  function submitWeChat(values: WeChatGatewayFormValues) {
    if (wechatEditor === null) {
      return;
    }
    const displayName = normalizeOptionalString(values.display_name);
    if (displayName === null) {
      wechatForm.setFields([
        {
          errors: [t("settingsTriggersWeChatDisplayNameRequired")],
          name: "display_name",
        },
      ]);
      return;
    }
    const workspaceId = normalizeOptionalString(values.workspace_id);
    if (workspaceId === null) {
      wechatForm.setFields([
        { errors: [t("settingsTriggersWorkspaceRequired")], name: "workspace_id" },
      ]);
      return;
    }
    const presetId = normalizeOptionalString(values.orchestration_preset_id);
    if (values.session_mode === "orchestration" && presetId === null) {
      wechatForm.setFields([
        {
          errors: [t("settingsTriggersPresetRequired")],
          name: "orchestration_preset_id",
        },
      ]);
      return;
    }
    wechatSaveMutation.mutate({ editor: wechatEditor, values });
  }

  const enabledCount = accounts.filter((account) => account.status === "enabled").length;
  const credentialsReadyCount = accounts.filter(hasAppSecret).length;
  const wechatEnabledCount = wechatAccounts.filter(
    (account) => account.status === "enabled",
  ).length;
  const wechatRunningCount = wechatAccounts.filter((account) => account.running).length;

  if (wechatEditor !== null) {
    const account = wechatEditor.account;
    return (
      <SettingsSection title={t("settingsTriggers")}>
        <div className="at-settings-detail-page">
          <div className="at-settings-detail-header">
            <div className="at-settings-list-main">
              <span>{account.display_name || account.account_id}</span>
              <Typography.Text>{t("settingsTriggersWeChatDetail")}</Typography.Text>
            </div>
            <div className="at-settings-detail-actions">
              <Button
                icon={<Power size={15} />}
                loading={
                  wechatEnableMutation.isPending || wechatDisableMutation.isPending
                }
                onClick={() => toggleWeChatAccount(account)}
              >
                {account.status === "enabled"
                  ? t("settingsTriggersDisableAccount")
                  : t("settingsTriggersEnableAccount")}
              </Button>
              <Button
                danger
                icon={<Trash2 size={15} />}
                loading={wechatDeleteMutation.isPending}
                onClick={() => confirmDeleteWeChat(account)}
              >
                {t("settingsTriggersDelete")}
              </Button>
              <Button
                form="at-wechat-trigger-form"
                htmlType="submit"
                icon={<Save size={15} />}
                loading={wechatSaveMutation.isPending}
                type="primary"
              >
                {t("settingsSave")}
              </Button>
              <Button onClick={() => setWeChatEditor(null)}>{t("settingsBack")}</Button>
            </div>
          </div>
          <dl className="at-settings-facts">
            <Fact label={t("settingsTriggersAccountId")} value={account.account_id} />
            <Fact label={t("settingsTriggersStatus")} value={wechatStatusLabel(account, t)} />
            <Fact
              label={t("settingsTriggersRunning")}
              value={account.running ? t("settingsEnabled") : t("settingsDisabled")}
            />
            <Fact
              label={t("settingsTriggersRemoteUser")}
              value={formatOptionalValue(account.remote_user_id)}
            />
            <Fact
              label={t("settingsTriggersLastLogin")}
              value={formatOptionalValue(account.last_login_at)}
            />
            <Fact
              label={t("settingsTriggersUpdated")}
              value={formatOptionalValue(account.updated_at)}
            />
          </dl>
          {account.last_error ? (
            <Alert message={account.last_error} showIcon type="error" />
          ) : null}
          <WeChatGatewayForm
            form={wechatForm}
            onSubmit={submitWeChat}
            orchestration={orchestrationQuery.data}
            roles={rolesQuery.data}
            sessionMode={wechatSessionMode}
            t={t}
            thinkingEnabled={wechatThinkingEnabled}
            workspaces={workspacesQuery.data ?? []}
          />
        </div>
      </SettingsSection>
    );
  }

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
      {!loading &&
      accountsQuery.data !== undefined &&
      wechatAccountsQuery.data !== undefined ? (
        <div className="at-trigger-provider-grid">
          <section className="at-trigger-provider-section">
            <div className="at-trigger-provider-head">
              <div className="at-settings-list-main">
                <span>{t("settingsTriggersFeishu")}</span>
                <Typography.Text>{t("settingsTriggersFeishuDetail")}</Typography.Text>
              </div>
              <div className="at-trigger-provider-actions">
                <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
                  {t("settingsTriggersAddFeishu")}
                </Button>
                <Button
                  icon={<RefreshCw size={15} />}
                  loading={reloadMutation.isPending}
                  onClick={() => reloadMutation.mutate()}
                >
                  {t("settingsTriggersReloadFeishu")}
                </Button>
              </div>
            </div>
            <dl className="at-settings-facts">
              <Fact
                label={t("settingsTriggersFeishuAccounts")}
                value={String(accounts.length)}
              />
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
          </section>

          <section className="at-trigger-provider-section">
            <div className="at-trigger-provider-head">
              <div className="at-settings-list-main">
                <span>{t("settingsTriggersWeChat")}</span>
                <Typography.Text>{t("settingsTriggersWeChatListDetail")}</Typography.Text>
              </div>
              <div className="at-trigger-provider-actions">
                <Button
                  icon={<Plus size={15} />}
                  loading={
                    wechatStartLoginMutation.isPending ||
                    wechatWaitLoginMutation.isPending
                  }
                  onClick={() => wechatStartLoginMutation.mutate()}
                >
                  {t("settingsTriggersConnectWeChat")}
                </Button>
                <Button
                  icon={<RefreshCw size={15} />}
                  loading={wechatReloadMutation.isPending}
                  onClick={() => wechatReloadMutation.mutate()}
                >
                  {t("settingsTriggersReloadWeChat")}
                </Button>
              </div>
            </div>
            <dl className="at-settings-facts">
              <Fact
                label={t("settingsTriggersWeChatAccounts")}
                value={String(wechatAccounts.length)}
              />
              <Fact
                label={t("settingsTriggersEnabledCount")}
                value={String(wechatEnabledCount)}
              />
              <Fact
                label={t("settingsTriggersRunning")}
                value={String(wechatRunningCount)}
              />
            </dl>
            {wechatNotice !== null ? (
              <Alert
                className="at-trigger-notice"
                message={wechatNotice.message}
                showIcon
                type={wechatNotice.kind}
              />
            ) : null}
            {wechatLoginSession?.qr_code_url ? (
              <div className="at-trigger-login-panel">
                <img
                  alt={t("settingsTriggersWeChatQrTitle")}
                  className="at-trigger-login-qr"
                  src={wechatLoginSession.qr_code_url}
                />
                <div className="at-settings-list-main">
                  <span>{t("settingsTriggersWeChatQrTitle")}</span>
                  <Typography.Text>{t("settingsTriggersWeChatQrCopy")}</Typography.Text>
                </div>
              </div>
            ) : null}
            {wechatAccounts.length === 0 ? (
              <div className="at-settings-empty">{t("settingsTriggersWeChatNoAccounts")}</div>
            ) : (
              <div className="at-settings-list" aria-label={t("settingsTriggersWeChatAccounts")}>
                {wechatAccounts.map((account) => (
                  <div className="at-settings-list-row at-trigger-row" key={account.account_id}>
                    <button
                      className="at-trigger-row-main"
                      onClick={() => openEditWeChatEditor(account)}
                      type="button"
                    >
                      <div className="at-settings-list-main">
                        <span>{account.display_name || account.account_id}</span>
                        <Typography.Text ellipsis title={wechatAccountDetail(account, t)}>
                          {wechatAccountDetail(account, t)}
                        </Typography.Text>
                      </div>
                    </button>
                    <div className="at-trigger-row-actions">
                      <Typography.Text className="at-settings-list-meta" ellipsis>
                        {wechatStatusLabel(account, t)}
                      </Typography.Text>
                      <Button
                        icon={<Power size={14} />}
                        loading={
                          wechatEnableMutation.isPending ||
                          wechatDisableMutation.isPending
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleWeChatAccount(account);
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
                          openEditWeChatEditor(account);
                        }}
                        size="small"
                      >
                        {t("settingsTriggersEditAccount")}
                      </Button>
                      <Button
                        danger
                        icon={<Trash2 size={14} />}
                        loading={wechatDeleteMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmDeleteWeChat(account);
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
          </section>
        </div>
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

function WeChatGatewayForm({
  form,
  onSubmit,
  orchestration,
  roles,
  sessionMode,
  t,
  thinkingEnabled,
  workspaces,
}: {
  form: FormInstance<WeChatGatewayFormValues>;
  onSubmit: (values: WeChatGatewayFormValues) => void;
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
      id="at-wechat-trigger-form"
      layout="vertical"
      onFinish={onSubmit}
    >
      <div className="at-settings-card-list">
        <div className="at-settings-form-card">
          <Typography.Text strong>{t("settingsTriggersAccount")}</Typography.Text>
          <Form.Item
            label={t("settingsTriggersDisplayName")}
            name="display_name"
            rules={[
              {
                required: true,
                message: t("settingsTriggersWeChatDisplayNameRequired"),
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label={t("settingsTriggersBaseUrl")} name="base_url">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label={t("settingsTriggersCdnBaseUrl")} name="cdn_base_url">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label={t("settingsTriggersRouteTag")} name="route_tag">
            <Input autoComplete="off" />
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

function sortWeChatAccounts(
  accounts: WeChatGatewayAccountRecord[],
): WeChatGatewayAccountRecord[] {
  return [...accounts].sort((left, right) =>
    (left.display_name || left.account_id).localeCompare(
      right.display_name || right.account_id,
    ),
  );
}

function wechatPayloadFromValues(
  values: WeChatGatewayFormValues,
): WeChatGatewayAccountUpdateInput {
  const sessionMode = values.session_mode || DEFAULT_SESSION_MODE;
  return {
    base_url: normalizeOptionalString(values.base_url),
    cdn_base_url: normalizeOptionalString(values.cdn_base_url),
    display_name: values.display_name.trim(),
    normal_root_role_id:
      sessionMode === "normal" ? normalizeOptionalString(values.normal_root_role_id) : null,
    orchestration_preset_id:
      sessionMode === "orchestration"
        ? normalizeOptionalString(values.orchestration_preset_id)
        : null,
    route_tag: normalizeOptionalString(values.route_tag),
    session_mode: sessionMode,
    thinking: {
      enabled: values.thinking_enabled === true,
      effort:
        values.thinking_enabled === true
          ? values.thinking_effort || DEFAULT_THINKING_EFFORT
          : null,
    },
    workspace_id: values.workspace_id.trim(),
    yolo: values.yolo === true,
  };
}

function wechatFormValuesFromEditor(
  editor: WeChatEditorState,
  workspaces: WorkspaceRecord[],
  roles: RoleConfigOptions | undefined,
  orchestration: OrchestrationConfig | undefined,
): WeChatGatewayFormValues {
  const account = editor.account;
  return {
    base_url: account.base_url,
    cdn_base_url: account.cdn_base_url,
    display_name: account.display_name,
    normal_root_role_id: account.normal_root_role_id ?? defaultNormalRoleId(roles),
    orchestration_preset_id:
      account.orchestration_preset_id ?? defaultOrchestrationPresetId(orchestration),
    route_tag: account.route_tag ?? "",
    session_mode: account.session_mode ?? DEFAULT_SESSION_MODE,
    thinking_effort: account.thinking.effort ?? DEFAULT_THINKING_EFFORT,
    thinking_enabled: account.thinking.enabled === true,
    workspace_id: account.workspace_id || defaultWorkspaceId(workspaces),
    yolo: account.yolo === true,
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

function wechatAccountDetail(
  account: WeChatGatewayAccountRecord,
  t: Translate,
): string {
  const workspaceId = account.workspace_id || DEFAULT_WORKSPACE_ID;
  const routeTag = account.route_tag ? ` · ${account.route_tag}` : "";
  return `${workspaceId}${routeTag} · ${
    account.running ? t("settingsTriggersRunning") : t("settingsTriggersStopped")
  }`;
}

function statusLabel(account: FeishuGatewayAccountRecord, t: Translate): string {
  return account.status === "enabled" ? t("settingsEnabled") : t("settingsDisabled");
}

function wechatStatusLabel(account: WeChatGatewayAccountRecord, t: Translate): string {
  if (account.status !== "enabled") {
    return t("settingsDisabled");
  }
  return account.running
    ? `${t("settingsEnabled")} · ${t("settingsTriggersRunning")}`
    : t("settingsEnabled");
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

function formatOptionalValue(value: string | null | undefined): string {
  return normalizeOptionalString(value) ?? "-";
}
