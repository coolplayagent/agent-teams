import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Select,
  Skeleton,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listWorkspaces } from "../../api/client";
import { FormChoiceControl } from "../../components/ChoiceControl";
import { useTranslations } from "../../i18n";

import {
  gatewayAccountFormValues,
  gatewayConnectorAdapter,
  type GatewayAccountFormValues,
  type GatewayAccountRecord,
  type GatewayConnectorProvider,
} from "./gatewayConnectorAdapters";

export type { GatewayConnectorProvider } from "./gatewayConnectorAdapters";

interface GatewayConnectorEditorProps {
  onSaved?: () => void;
  provider: GatewayConnectorProvider;
}

export function GatewayConnectorEditor({
  onSaved,
  provider,
}: GatewayConnectorEditorProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<GatewayAccountFormValues>();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const adapter = gatewayConnectorAdapter(provider);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const accountsQuery = useQuery<GatewayAccountRecord[]>({
    queryFn: adapter.list,
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
      gatewayAccountFormValues(
        adapter,
        selectedAccount,
        workspacesQuery.data ?? [],
      ),
    );
  }, [
    accountsQuery.isLoading,
    adapter,
    form,
    selectedAccount,
    workspacesQuery.data,
  ]);

  const refreshAccounts = () =>
    queryClient.invalidateQueries({
      queryKey: ["connectors", "gateway-accounts", provider],
    });
  const saveMutation = useMutation({
    mutationFn: (values: GatewayAccountFormValues) =>
      adapter.save(selectedAccount, values),
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("connectorsSaveFailed"),
      );
    },
    onSuccess: (account) => {
      setCreatingNew(false);
      setEditingAccountId(account.account_id);
      void refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void message.success(t("connectorsGatewaySaved"));
      onSaved?.();
    },
  });
  const toggleMutation = useMutation({
    mutationFn: (account: GatewayAccountRecord) => adapter.toggle(account),
    onError: (error) => {
      void message.error(
        error instanceof Error
          ? error.message
          : t("connectorsGatewayActionFailed"),
      );
    },
    onSuccess: () => {
      void refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: adapter.remove,
    onError: (error) => {
      void message.error(
        error instanceof Error
          ? error.message
          : t("connectorsGatewayActionFailed"),
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
      content: t("connectorsGatewayDeleteConfirm", {
        name: account.display_name,
      }),
      okText: t("settingsDelete"),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(account.account_id),
      title: t("settingsDelete"),
    });
  };

  return (
    <section
      className="at-gateway-connector-editor"
      data-testid={`gateway-editor-${provider}`}
    >
      <header className="at-gateway-connector-head">
        <Typography.Text type="secondary">
          {t("connectorsGatewayAccountsHelp")}
        </Typography.Text>
      </header>
      {accountsQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : null}
      {!accountsQuery.isLoading && accountsQuery.isError ? (
        <Empty
          description={t("connectorsGatewayLoadFailed")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : null}
      {!accountsQuery.isLoading && !accountsQuery.isError ? (
        <div className="at-gateway-connector-body">
          <aside
            className="at-gateway-account-list"
            aria-label={t("connectorsGatewayAccountList")}
          >
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
                className={
                  account.account_id === editingAccountId ? "is-selected" : ""
                }
                key={account.account_id}
                onClick={() => {
                  setCreatingNew(false);
                  setEditingAccountId(account.account_id);
                }}
                type="button"
              >
                <strong>{account.display_name}</strong>
                <span>
                  {account.status === "enabled"
                    ? t("settingsEnabled")
                    : t("settingsDisabled")}
                </span>
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
              rules={[
                {
                  message: t("settingsHooksFieldRequired"),
                  required: true,
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              extra={
                selectedAccount === null
                  ? undefined
                  : t("connectorsGatewayTokenPreserved")
              }
              label={t("connectorsGatewayToken")}
              name="token"
              rules={[
                {
                  message: t("settingsHooksFieldRequired"),
                  required: selectedAccount === null,
                },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            {adapter.fields === "discord" ? (
              <>
                <Form.Item
                  label={t("connectorsGatewayApplicationId")}
                  name="applicationId"
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t("connectorsGatewayAllowedChannels")}
                  name="allowedChannelIds"
                >
                  <Input placeholder="123, 456" />
                </Form.Item>
                <Form.Item name="allowChannelMessages" valuePropName="checked">
                  <FormChoiceControl
                    label={t("connectorsGatewayAllowChannelMessages")}
                  />
                </Form.Item>
              </>
            ) : (
              <Form.Item label={t("connectorsGatewayBaseUrl")} name="baseUrl">
                <Input />
              </Form.Item>
            )}
            <Form.Item
              label={t("settingsTriggersWorkspace")}
              name="workspaceId"
              rules={[
                {
                  message: t("settingsTriggersWorkspaceRequired"),
                  required: true,
                },
              ]}
            >
              <Select
                options={(workspacesQuery.data ?? []).map((workspace) => ({
                  label: workspace.display_name || workspace.workspace_id,
                  value: workspace.workspace_id,
                }))}
              />
            </Form.Item>
            <Form.Item name="enabled" valuePropName="checked">
              <FormChoiceControl kind="switch" label={t("settingsEnabled")} />
            </Form.Item>
            <div className="at-gateway-account-actions">
              {selectedAccount !== null ? (
                <>
                  <Button
                    loading={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate(selectedAccount)}
                  >
                    {selectedAccount.status === "enabled"
                      ? t("settingsTriggersDisableAccount")
                      : t("settingsTriggersEnableAccount")}
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
              <Button
                htmlType="submit"
                loading={saveMutation.isPending}
                type="primary"
              >
                {t("connectorsConfigureSave")}
              </Button>
            </div>
          </Form>
        </div>
      ) : null}
    </section>
  );
}
