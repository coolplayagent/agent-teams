import { App, Button, Checkbox, Empty, Form, Input, Select, Skeleton, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createDiscordGatewayAccount,
  createXiaolubanGatewayAccount,
  deleteDiscordGatewayAccount,
  deleteXiaolubanGatewayAccount,
  disableDiscordGatewayAccount,
  disableXiaolubanGatewayAccount,
  enableDiscordGatewayAccount,
  enableXiaolubanGatewayAccount,
  listDiscordGatewayAccounts,
  listWorkspaces,
  listXiaolubanGatewayAccounts,
  updateDiscordGatewayAccount,
  updateXiaolubanGatewayAccount,
} from "../../api/client";
import type {
  DiscordGatewayAccountRecord,
  WorkspaceRecord,
  XiaolubanGatewayAccountRecord,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";

export type GatewayConnectorProvider = "discord" | "xiaoluban";

interface GatewayConnectorEditorProps {
  onClose: () => void;
  provider: GatewayConnectorProvider;
}

interface GatewayAccountFormValues {
  allowChannelMessages: boolean;
  allowedChannelIds: string;
  applicationId: string;
  baseUrl: string;
  displayName: string;
  enabled: boolean;
  token: string;
  workspaceId: string;
}

type GatewayAccountRecord =
  | DiscordGatewayAccountRecord
  | XiaolubanGatewayAccountRecord;

export function GatewayConnectorEditor({
  onClose,
  provider,
}: GatewayConnectorEditorProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<GatewayAccountFormValues>();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const accountsQuery = useQuery<GatewayAccountRecord[]>({
    queryFn: async (): Promise<GatewayAccountRecord[]> =>
      provider === "discord"
        ? await listDiscordGatewayAccounts()
        : await listXiaolubanGatewayAccounts(),
    queryKey: ["connectors", "gateway-accounts", provider],
  });
  const workspacesQuery = useQuery({
    queryFn: listWorkspaces,
    queryKey: ["workspaces"],
  });
  const accounts = useMemo<GatewayAccountRecord[]>(
    () => accountsQuery.data ?? [],
    [accountsQuery.data],
  );
  const selectedAccount =
    accounts.find((account) => account.account_id === editingAccountId) ?? null;

  useEffect(() => {
    if (editingAccountId !== null && selectedAccount === null) {
      setEditingAccountId(null);
    }
  }, [editingAccountId, selectedAccount]);

  useEffect(() => {
    if (!creatingNew && editingAccountId === null && accounts.length > 0) {
      setEditingAccountId(accounts[0]?.account_id ?? null);
    }
  }, [accounts, creatingNew, editingAccountId]);

  useEffect(() => {
    if (accountsQuery.isLoading) {
      return;
    }
    form.setFieldsValue(
      gatewayAccountFormValues(provider, selectedAccount, workspacesQuery.data ?? []),
    );
  }, [accountsQuery.isLoading, form, provider, selectedAccount, workspacesQuery.data]);

  const refreshAccounts = () =>
    queryClient.invalidateQueries({
      queryKey: ["connectors", "gateway-accounts", provider],
    });
  const saveMutation = useMutation({
    mutationFn: (values: GatewayAccountFormValues) =>
      saveGatewayAccount(provider, selectedAccount, values),
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("connectorsSaveFailed"));
    },
    onSuccess: (account) => {
      setCreatingNew(false);
      setEditingAccountId(account.account_id);
      void refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void message.success(t("connectorsGatewaySaved"));
    },
  });
  const toggleMutation = useMutation({
    mutationFn: (account: GatewayAccountRecord) =>
      toggleGatewayAccount(provider, account),
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("connectorsGatewayActionFailed"),
      );
    },
    onSuccess: () => {
      void refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteGatewayAccount(provider, accountId),
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("connectorsGatewayActionFailed"),
      );
    },
    onSuccess: () => {
      setCreatingNew(false);
      setEditingAccountId(null);
      void refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
  });

  const requestDelete = (account: GatewayAccountRecord) => {
    modal.confirm({
      content: t("connectorsGatewayDeleteConfirm", { name: account.display_name }),
      okText: t("settingsDelete"),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(account.account_id),
      title: t("settingsDelete"),
    });
  };

  return (
    <section className="at-gateway-connector-editor" data-testid={`gateway-editor-${provider}`}>
      <header className="at-gateway-connector-head">
        <div>
          <Typography.Title level={4}>
            {t("connectorsGatewayAccounts", {
              provider: provider === "discord" ? "Discord" : "Xiaoluban",
            })}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("connectorsGatewayAccountsHelp")}
          </Typography.Text>
        </div>
        <Button aria-label={t("connectorsGatewayClose")} icon={<X size={16} />} onClick={onClose} />
      </header>
      {accountsQuery.isLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
      {!accountsQuery.isLoading && accountsQuery.isError ? (
        <Empty description={t("connectorsGatewayLoadFailed")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {!accountsQuery.isLoading && !accountsQuery.isError ? (
        <div className="at-gateway-connector-body">
          <aside className="at-gateway-account-list" aria-label={t("connectorsGatewayAccountList")}>
            <Button
              icon={<Plus size={14} />}
              onClick={() => {
                setCreatingNew(true);
                setEditingAccountId(null);
              }}
              type={editingAccountId === null ? "primary" : "default"}
            >
              {t("connectorsGatewayNewAccount")}
            </Button>
            {accounts.map((account) => (
              <button
                aria-pressed={account.account_id === editingAccountId}
                className={account.account_id === editingAccountId ? "is-selected" : ""}
                key={account.account_id}
                onClick={() => {
                  setCreatingNew(false);
                  setEditingAccountId(account.account_id);
                }}
                type="button"
              >
                <strong>{account.display_name}</strong>
                <span>{account.status === "enabled" ? t("settingsEnabled") : t("settingsDisabled")}</span>
              </button>
            ))}
          </aside>
          <Form
            className="at-gateway-account-form"
            form={form}
            layout="vertical"
            onFinish={(values) => saveMutation.mutate(values)}
          >
            <Form.Item
              label={t("connectorsGatewayDisplayName")}
              name="displayName"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              extra={selectedAccount === null ? undefined : t("connectorsGatewayTokenPreserved")}
              label={t("connectorsGatewayToken")}
              name="token"
              rules={[{ required: selectedAccount === null }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            {provider === "discord" ? (
              <>
                <Form.Item label={t("connectorsGatewayApplicationId")} name="applicationId">
                  <Input />
                </Form.Item>
                <Form.Item label={t("connectorsGatewayAllowedChannels")} name="allowedChannelIds">
                  <Input placeholder="123, 456" />
                </Form.Item>
                <Form.Item name="allowChannelMessages" valuePropName="checked">
                  <Checkbox>{t("connectorsGatewayAllowChannelMessages")}</Checkbox>
                </Form.Item>
              </>
            ) : (
              <Form.Item label={t("connectorsGatewayBaseUrl")} name="baseUrl">
                <Input />
              </Form.Item>
            )}
            <Form.Item label={t("settingsTriggersWorkspace")} name="workspaceId" rules={[{ required: true }]}>
              <Select
                options={(workspacesQuery.data ?? []).map((workspace) => ({
                  label: workspace.display_name || workspace.workspace_id,
                  value: workspace.workspace_id,
                }))}
              />
            </Form.Item>
            <Form.Item name="enabled" valuePropName="checked">
              <Checkbox>{t("settingsEnabled")}</Checkbox>
            </Form.Item>
            <div className="at-gateway-account-actions">
              {selectedAccount !== null ? (
                <>
                  <Button loading={toggleMutation.isPending} onClick={() => toggleMutation.mutate(selectedAccount)}>
                    {selectedAccount.status === "enabled" ? t("settingsTriggersDisableAccount") : t("settingsTriggersEnableAccount")}
                  </Button>
                  <Button
                    danger
                    icon={<Trash2 size={14} />}
                    loading={deleteMutation.isPending}
                    onClick={() => requestDelete(selectedAccount)}
                  >
                    {t("settingsDelete")}
                  </Button>
                </>
              ) : null}
              <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
                {t("connectorsConfigureSave")}
              </Button>
            </div>
          </Form>
        </div>
      ) : null}
    </section>
  );
}

function gatewayAccountFormValues(
  provider: GatewayConnectorProvider,
  account: GatewayAccountRecord | null,
  workspaces: WorkspaceRecord[],
): GatewayAccountFormValues {
  const workspaceId =
    (account !== null && "workspace_id" in account ? account.workspace_id : account?.im_config.workspace_id) ??
    workspaces[0]?.workspace_id ??
    "";
  return {
    allowChannelMessages:
      account !== null && "allow_channel_messages" in account
        ? account.allow_channel_messages
        : false,
    allowedChannelIds:
      account !== null && "allowed_channel_ids" in account
        ? account.allowed_channel_ids.join(", ")
        : "",
    applicationId:
      account !== null && "application_id" in account ? account.application_id ?? "" : "",
    baseUrl: account !== null && "base_url" in account ? account.base_url : "https://api.xiaoluban.com",
    displayName: account?.display_name ?? (provider === "discord" ? "Discord" : "Xiaoluban"),
    enabled: account?.status !== "disabled",
    token: "",
    workspaceId,
  };
}

async function saveGatewayAccount(
  provider: GatewayConnectorProvider,
  account: GatewayAccountRecord | null,
  values: GatewayAccountFormValues,
): Promise<GatewayAccountRecord> {
  const token = values.token.trim();
  if (provider === "discord") {
    const body = {
      allow_channel_messages: values.allowChannelMessages,
      allowed_channel_ids: splitIdentifiers(values.allowedChannelIds),
      application_id: values.applicationId.trim() || null,
      display_name: values.displayName.trim(),
      enabled: values.enabled,
      workspace_id: values.workspaceId,
    };
    return account === null
      ? createDiscordGatewayAccount({ ...body, bot_token: token })
      : updateDiscordGatewayAccount(account.account_id, {
          ...body,
          bot_token: token || null,
        });
  }
  const body = {
    base_url: values.baseUrl.trim(),
    display_name: values.displayName.trim(),
    enabled: values.enabled,
    im_config: { workspace_id: values.workspaceId },
  };
  return account === null
    ? createXiaolubanGatewayAccount({ ...body, token })
    : updateXiaolubanGatewayAccount(account.account_id, {
        ...body,
        token: token || null,
      });
}

function toggleGatewayAccount(
  provider: GatewayConnectorProvider,
  account: GatewayAccountRecord,
): Promise<GatewayAccountRecord> {
  if (provider === "discord") {
    return account.status === "enabled"
      ? disableDiscordGatewayAccount(account.account_id)
      : enableDiscordGatewayAccount(account.account_id);
  }
  return account.status === "enabled"
    ? disableXiaolubanGatewayAccount(account.account_id)
    : enableXiaolubanGatewayAccount(account.account_id);
}

function deleteGatewayAccount(
  provider: GatewayConnectorProvider,
  accountId: string,
): Promise<{ status: string }> {
  return provider === "discord"
    ? deleteDiscordGatewayAccount(accountId)
    : deleteXiaolubanGatewayAccount(accountId);
}

function splitIdentifiers(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
