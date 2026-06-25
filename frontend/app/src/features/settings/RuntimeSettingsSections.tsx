import { Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Popconfirm, Progress, Select, Switch, Typography } from "antd";
import { useEffect, useState } from "react";

import {
  deletePlugin,
  deleteAgentRuntime,
  disablePlugin,
  enablePlugin,
  getAgentRuntime,
  getAgentRuntimeRegistry,
  getAgentRuntimes,
  getAgentRuntimeTestJob,
  getHookRuntimeView,
  getHooksConfig,
  getPluginsConfig,
  getPluginsRuntime,
  installAgentRuntimeFromRegistry,
  refreshAgentRuntimeRegistry,
  saveAgentRuntime,
  startAgentRuntimeTestJob,
  updatePlugin,
} from "../../api/client";
import type {
  AcpRegistryAgentView,
  AcpRegistryCatalogResponse,
  AcpRegistryDistribution,
  AgentRuntimeConfig,
  AgentRuntimeProtocol,
  AgentRuntimeSecretBinding,
  AgentRuntimeSummary,
  AgentRuntimeTestJob,
  AgentRuntimeTransportConfig,
  AgentRuntimeTransportType,
  HooksConfigPayload,
  JsonValue,
  LoadedHookRecord,
  PluginRuntimeDiagnostics,
  PluginRuntimeRecord,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type AgentRuntimeBindingConfig = AgentRuntimeSecretBinding;
type PluginScope = NonNullable<PluginRuntimeRecord["scope"]>;
type PluginAction = "delete" | "disable" | "enable" | "update";

interface PluginActionRequest {
  action: PluginAction;
  plugin: PluginRuntimeRecord;
}

export function PluginsSettingsSection() {
  const t = useTranslations();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["settings", "plugins", "config"],
    queryFn: getPluginsConfig,
  });
  const runtimeQuery = useQuery({
    queryKey: ["settings", "plugins", "runtime"],
    queryFn: getPluginsRuntime,
  });
  const plugins = configQuery.data?.plugins ?? [];
  const diagnostics = runtimeQuery.data?.diagnostics ?? configQuery.data?.diagnostics ?? [];
  const actionMutation = useMutation({
    mutationFn: async ({ action, plugin }: PluginActionRequest) => {
      const name = pluginName(plugin);
      if (name === null) {
        throw new Error(t("settingsPluginsNameRequired"));
      }
      const scope = pluginScope(plugin);
      if (action === "enable") {
        return enablePlugin(name, { scope });
      }
      if (action === "disable") {
        return disablePlugin(name, { scope });
      }
      if (action === "update") {
        return updatePlugin(name, { scope, version: plugin.version ?? null });
      }
      return deletePlugin(name, { prune: false, scope });
    },
    onSuccess: (_result, variables) => {
      void message.success(pluginActionSuccessMessage(variables.action, t));
      void queryClient.invalidateQueries({ queryKey: ["settings", "plugins"] });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsPluginsActionFailed"),
      );
    },
  });
  const loading = configQuery.isLoading || runtimeQuery.isLoading;
  const error = configQuery.error ?? runtimeQuery.error;
  const pendingActionKey =
    actionMutation.isPending && actionMutation.variables !== undefined
      ? pluginActionKey(actionMutation.variables)
      : null;
  return (
    <SettingsSection title={t("settingsPlugins")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && configQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsPluginsTotal")} value={String(plugins.length)} />
            <Fact
              label={t("settingsPluginsDiagnostics")}
              value={String(diagnostics.length)}
            />
          </div>
          <div className="at-settings-section-actions at-plugin-toolbar">
            <Button
              icon={<RefreshCw size={15} />}
              loading={configQuery.isFetching || runtimeQuery.isFetching}
              onClick={() => {
                void configQuery.refetch();
                void runtimeQuery.refetch();
              }}
            >
              {t("settingsPluginsRefresh")}
            </Button>
          </div>
          <PluginRuntimeList
            onAction={(request) => actionMutation.mutate(request)}
            pendingActionKey={pendingActionKey}
            plugins={plugins}
          />
          <PluginDiagnosticsList diagnostics={diagnostics} />
        </>
      ) : null}
    </SettingsSection>
  );
}

export function HooksSettingsSection() {
  const t = useTranslations();
  const hooksQuery = useQuery({
    queryKey: ["settings", "hooks", "config"],
    queryFn: getHooksConfig,
  });
  const runtimeQuery = useQuery({
    queryKey: ["settings", "hooks", "runtime"],
    queryFn: getHookRuntimeView,
  });
  const configuredGroups = hookGroups(hooksQuery.data);
  const loadedHooks = runtimeQuery.data?.loaded_hooks ?? [];
  const sources = runtimeQuery.data?.sources ?? [];
  const loading = hooksQuery.isLoading || runtimeQuery.isLoading;
  const error = hooksQuery.error ?? runtimeQuery.error;
  return (
    <SettingsSection title={t("settingsHooks")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && error === null ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsHooksConfigured")}
              value={String(configuredGroups.length)}
            />
            <Fact
              label={t("settingsHooksLoaded")}
              value={String(loadedHooks.length)}
            />
            <Fact label={t("settingsHooksSources")} value={String(sources.length)} />
          </div>
          <HookRuntimeList hooks={loadedHooks} />
        </>
      ) : null}
    </SettingsSection>
  );
}

export function AgentRuntimeSettingsSection() {
  const t = useTranslations();
  const [view, setView] = useState<AgentRuntimeView>({ type: "list" });
  const query = useQuery({
    queryKey: ["settings", "agent-runtimes"],
    queryFn: getAgentRuntimes,
  });
  const runtimes = query.data ?? [];

  if (view.type === "registry") {
    return (
      <SettingsSection title={t("settingsAgentRuntime")}>
        <AgentRuntimeRegistryView onBack={() => setView({ type: "list" })} />
      </SettingsSection>
    );
  }

  if (view.type === "detail") {
    return (
      <SettingsSection title={t("settingsAgentRuntime")}>
        <AgentRuntimeEditor
          agentId={view.agentId}
          onBack={() => setView({ type: "list" })}
        />
      </SettingsSection>
    );
  }

  if (view.type === "create") {
    return (
      <SettingsSection title={t("settingsAgentRuntime")}>
        <AgentRuntimeEditor
          onBack={() => setView({ type: "list" })}
          onSaved={(savedAgentId) => setView({ agentId: savedAgentId, type: "detail" })}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("settingsAgentRuntime")}>
      <SettingsQueryState error={query.error} loading={query.isLoading} />
      {!query.isLoading && query.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsAgentRuntimeTotal")}
              value={String(runtimes.length)}
            />
          </div>
          <div className="at-settings-section-actions at-agent-runtime-toolbar">
            <Button
              icon={<RefreshCw size={15} />}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t("settingsAgentRuntimeRefresh")}
            </Button>
            <Button
              icon={<RefreshCw size={15} />}
              onClick={() => setView({ type: "registry" })}
            >
              {t("settingsAgentRuntimeRegistry")}
            </Button>
            <Button
              icon={<Plus size={15} />}
              onClick={() => setView({ type: "create" })}
              type="primary"
            >
              {t("settingsAgentRuntimeAdd")}
            </Button>
          </div>
          <AgentRuntimeList
            onSelect={(agentId) => setView({ agentId, type: "detail" })}
            runtimes={runtimes}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

function PluginRuntimeList({
  onAction,
  pendingActionKey,
  plugins,
}: {
  onAction: (request: PluginActionRequest) => void;
  pendingActionKey: string | null;
  plugins: PluginRuntimeRecord[];
}) {
  const t = useTranslations();
  if (plugins.length === 0) {
    return <div className="at-settings-empty">{t("settingsPluginsEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {plugins.map((plugin) => {
        const title = pluginTitle(plugin, t("settingsPluginsUnnamed"));
        const name = pluginName(plugin);
        const enabled = plugin.enabled !== false;
        return (
          <div
            className="at-settings-list-row at-plugin-list-row"
            key={pluginKey(plugin, title)}
          >
            <div className="at-settings-list-main">
              <span>{title}</span>
              <Typography.Text ellipsis title={pluginDetail(plugin, t)}>
                {pluginDetail(plugin, t)}
              </Typography.Text>
            </div>
            <Typography.Text
              className="at-settings-list-meta"
              ellipsis
              title={pluginStatus(plugin, t)}
            >
              {pluginStatus(plugin, t)}
            </Typography.Text>
            <div className="at-settings-list-actions at-plugin-actions">
              <Button
                disabled={name === null}
                loading={pendingActionKey === pluginActionKey({ action: enabled ? "disable" : "enable", plugin })}
                onClick={() =>
                  onAction({ action: enabled ? "disable" : "enable", plugin })
                }
                size="small"
              >
                {enabled ? t("settingsPluginsDisable") : t("settingsPluginsEnable")}
              </Button>
              <Button
                disabled={name === null}
                icon={<RefreshCw size={14} />}
                loading={pendingActionKey === pluginActionKey({ action: "update", plugin })}
                onClick={() => onAction({ action: "update", plugin })}
                size="small"
              >
                {t("settingsPluginsUpdate")}
              </Button>
              <Popconfirm
                disabled={name === null}
                onConfirm={() => onAction({ action: "delete", plugin })}
                title={t("settingsPluginsDeleteConfirm", { name: title })}
              >
                <Button
                  danger
                  disabled={name === null}
                  icon={<Trash2 size={14} />}
                  loading={pendingActionKey === pluginActionKey({ action: "delete", plugin })}
                  size="small"
                >
                  {t("settingsPluginsDelete")}
                </Button>
              </Popconfirm>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PluginDiagnosticsList({
  diagnostics,
}: {
  diagnostics: PluginRuntimeDiagnostics[];
}) {
  const t = useTranslations();
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {diagnostics.map((diagnostic, index) => (
        <div className="at-settings-list-row" key={`${diagnostic.plugin ?? "plugin"}-${index}`}>
          <div className="at-settings-list-main">
            <span>{diagnostic.plugin ?? t("settingsPluginsDiagnostic")}</span>
            <Typography.Text ellipsis title={diagnostic.message ?? ""}>
              {diagnostic.message ?? "-"}
            </Typography.Text>
          </div>
          <Typography.Text className="at-settings-list-meta" ellipsis>
            {diagnostic.level ?? diagnostic.code ?? "-"}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function HookRuntimeList({ hooks }: { hooks: LoadedHookRecord[] }) {
  const t = useTranslations();
  if (hooks.length === 0) {
    return <div className="at-settings-empty">{t("settingsHooksEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {hooks.map((hook, index) => (
        <div className="at-settings-list-row" key={`${hook.name ?? hook.event ?? "hook"}-${index}`}>
          <div className="at-settings-list-main">
            <span>{hook.name ?? hook.event ?? t("settingsHooksUnnamed")}</span>
            <Typography.Text ellipsis title={hookDetail(hook)}>
              {hookDetail(hook)}
            </Typography.Text>
          </div>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={hook.source ?? "-"}
          >
            {hook.source ?? "-"}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

type AgentRuntimeView =
  | { type: "list" }
  | { type: "create" }
  | { agentId: string; type: "detail" }
  | { type: "registry" };

interface AgentRuntimeFormValues {
  adapter_id?: string;
  agent_id: string;
  args?: string;
  command?: string;
  custom_config?: string;
  description?: string;
  name: string;
  native_config_enabled?: boolean;
  native_config_provider?: string;
  protocol: AgentRuntimeProtocol;
  http_headers?: AgentRuntimeBindingFormRow[];
  registry_distribution?: AcpRegistryDistribution;
  registry_env?: AgentRuntimeBindingFormRow[];
  registry_id?: string;
  skill_bridge_enabled?: boolean;
  skill_bridge_mode?: "inline" | "directory";
  skill_bridge_skills?: string;
  ssl_verify?: "inherit" | "true" | "false";
  stdio_env?: AgentRuntimeBindingFormRow[];
  transport: AgentRuntimeTransportType;
  url?: string;
}

interface AgentRuntimeBindingFormRow {
  name?: string;
  secret?: boolean;
  value?: string;
}

function AgentRuntimeList({
  onSelect,
  runtimes,
}: {
  onSelect: (agentId: string) => void;
  runtimes: AgentRuntimeSummary[];
}) {
  const t = useTranslations();
  if (runtimes.length === 0) {
    return <div className="at-settings-empty">{t("settingsAgentRuntimeEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {runtimes.map((runtime) => (
        <button
          className="at-settings-list-button at-settings-list-row"
          key={runtime.agent_id}
          onClick={() => onSelect(runtime.agent_id)}
          type="button"
        >
          <div className="at-settings-list-main">
            <span>{runtime.name?.trim() || runtime.agent_id}</span>
            <Typography.Text ellipsis title={runtime.description ?? ""}>
              {runtime.description ?? "-"}
            </Typography.Text>
          </div>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={agentRuntimeDetail(runtime)}
          >
            {agentRuntimeDetail(runtime)}
          </Typography.Text>
        </button>
      ))}
    </div>
  );
}

function AgentRuntimeEditor({
  agentId,
  onBack,
  onSaved,
}: {
  agentId?: string;
  onBack: () => void;
  onSaved?: (agentId: string) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<AgentRuntimeFormValues>();
  const [transport, setTransport] = useState<AgentRuntimeTransportType>("stdio");
  const [testJob, setTestJob] = useState<AgentRuntimeTestJob | null>(null);
  const isCreate = agentId === undefined;
  const query = useQuery({
    queryKey: ["settings", "agent-runtime", agentId],
    queryFn: () => getAgentRuntime(agentId ?? ""),
    enabled: !isCreate,
  });

  useEffect(() => {
    if (isCreate) {
      const values = configToForm(createBlankAgentRuntimeConfig());
      form.setFieldsValue(values);
      setTransport(values.transport);
    }
  }, [form, isCreate]);

  useEffect(() => {
    if (query.data !== undefined) {
      const values = configToForm(query.data);
      form.setFieldsValue(values);
      setTransport(values.transport);
    }
  }, [form, query.data]);

  const saveMutation = useMutation({
    mutationFn: (values: AgentRuntimeFormValues) => {
      const payload = buildAgentRuntimeSavePayload(values, query.data);
      return saveAgentRuntime(payload.pathAgentId, payload.config);
    },
    onSuccess: async (saved) => {
      void message.success(t("settingsAgentRuntimeSaved"));
      form.setFieldsValue(configToForm(saved));
      setTransport(saved.transport.transport);
      await invalidateAgentRuntimeQueries(queryClient);
      onSaved?.(saved.agent_id);
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgentRuntime(agentId ?? ""),
    onSuccess: async () => {
      void message.success(t("settingsAgentRuntimeDeleted"));
      await invalidateAgentRuntimeQueries(queryClient);
      onBack();
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      const payload = buildAgentRuntimeSavePayload(values, query.data);
      const saved = await saveAgentRuntime(payload.pathAgentId, payload.config);
      const job = await waitForAgentRuntimeTestJob(saved.agent_id);
      return { job, saved };
    },
    onSuccess: async ({ job, saved }) => {
      setTestJob(job);
      form.setFieldsValue(configToForm(saved));
      setTransport(saved.transport.transport);
      await invalidateAgentRuntimeQueries(queryClient);
      if (job.status === "succeeded") {
        void message.success(job.result?.message || job.message || t("settingsAgentRuntimeTestPassed"));
      } else if (isActiveAgentRuntimeJob(job)) {
        void message.info(job.message || t("settingsAgentRuntimeTestRunning"));
      } else {
        void message.error(job.error_message || job.message || t("settingsAgentRuntimeTestFailed"));
      }
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsAgentRuntimeTestFailed"));
    },
  });

  const busy = saveMutation.isPending || deleteMutation.isPending || testMutation.isPending;

  return (
    <div className="at-settings-detail-page at-agent-runtime-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <Typography.Title level={4}>
            {isCreate ? t("settingsAgentRuntimeAdd") : t("settingsAgentRuntimeEdit")}
          </Typography.Title>
          <Typography.Text className="at-settings-list-meta">
            {agentId ?? t("settingsAgentRuntimeNew")}
          </Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button onClick={onBack}>{t("settingsBack")}</Button>
          {!isCreate ? (
            <Popconfirm
              cancelText={t("sidebarDeleteCancel")}
              okButtonProps={{ danger: true }}
              okText={t("sidebarDeleteConfirm")}
              onConfirm={() => deleteMutation.mutate()}
              title={t("settingsAgentRuntimeDeleteConfirm", { name: agentId ?? "" })}
            >
              <Button danger icon={<Trash2 size={15} />} loading={deleteMutation.isPending}>
                {t("settingsAgentRuntimeDelete")}
              </Button>
            </Popconfirm>
          ) : null}
          <Button
            icon={<Play size={15} />}
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {t("settingsAgentRuntimeTest")}
          </Button>
          <Button
            loading={saveMutation.isPending}
            onClick={() => form.submit()}
            type="primary"
          >
            {t("settingsSave")}
          </Button>
        </div>
      </div>
      <SettingsQueryState error={query.error} loading={query.isLoading} />
      {isCreate || query.data !== undefined ? (
        <>
          <Form<AgentRuntimeFormValues>
            className="at-settings-form at-settings-wide-form at-agent-runtime-form"
            disabled={busy}
            form={form}
            layout="vertical"
            onFinish={(values) => saveMutation.mutate(values)}
            onValuesChange={(changedValues) => {
              if (isAgentRuntimeTransport(changedValues.transport)) {
                setTransport(changedValues.transport);
              }
            }}
          >
            <div className="at-settings-form-card">
              <Form.Item
                label={t("settingsAgentRuntimeId")}
                name="agent_id"
                rules={[{ required: true, message: t("settingsAgentRuntimeIdRequired") }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                label={t("settingsAgentRuntimeName")}
                name="name"
                rules={[{ required: true, message: t("settingsAgentRuntimeNameRequired") }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item label={t("settingsAgentRuntimeDescription")} name="description">
                <Input.TextArea autoSize={{ maxRows: 4, minRows: 2 }} />
              </Form.Item>
            </div>
            <div className="at-settings-form-card">
              <div className="at-agent-runtime-form-grid">
                <Form.Item label={t("settingsAgentRuntimeProtocol")} name="protocol">
                  <Select
                    options={[
                      { label: "ACP", value: "acp" },
                      { label: "A2A", value: "a2a" },
                      { label: "CLI", value: "cli" },
                    ]}
                  />
                </Form.Item>
                <Form.Item label={t("settingsAgentRuntimeTransport")} name="transport">
                  <Select
                    options={[
                      { label: "stdio", value: "stdio" },
                      { label: "streamable_http", value: "streamable_http" },
                      { label: "custom", value: "custom" },
                      { label: "registry", value: "registry" },
                    ]}
                  />
                </Form.Item>
              </div>
              <TransportFields transport={transport} />
            </div>
            <div className="at-settings-form-card">
              <div className="at-agent-runtime-form-grid">
                <Form.Item
                  label={t("settingsAgentRuntimeNativeConfig")}
                  name="native_config_enabled"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
                <Form.Item
                  label={t("settingsAgentRuntimeNativeProvider")}
                  name="native_config_provider"
                >
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item
                  label={t("settingsAgentRuntimeSkillBridge")}
                  name="skill_bridge_enabled"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
                <Form.Item
                  label={t("settingsAgentRuntimeSkillBridgeMode")}
                  name="skill_bridge_mode"
                >
                  <Select
                    options={[
                      { label: "inline", value: "inline" },
                      { label: "directory", value: "directory" },
                    ]}
                  />
                </Form.Item>
              </div>
              <Form.Item
                label={t("settingsAgentRuntimeSkillBridgeSkills")}
                name="skill_bridge_skills"
              >
                <Input.TextArea autoSize={{ maxRows: 4, minRows: 2 }} />
              </Form.Item>
            </div>
          </Form>
          {testJob !== null ? <AgentRuntimeTestStatus job={testJob} /> : null}
        </>
      ) : null}
    </div>
  );
}

function TransportFields({ transport }: { transport: AgentRuntimeTransportType }) {
  const t = useTranslations();
  if (transport === "streamable_http") {
    return (
      <>
        <Form.Item
          label={t("settingsAgentRuntimeUrl")}
          name="url"
          rules={[{ required: true, message: t("settingsAgentRuntimeUrlRequired") }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsAgentRuntimeSslVerify")} name="ssl_verify">
          <Select
            options={[
              { label: t("settingsAgentRuntimeSslInherit"), value: "inherit" },
              { label: t("settingsAgentRuntimeSslVerifyOn"), value: "true" },
              { label: t("settingsAgentRuntimeSslVerifyOff"), value: "false" },
            ]}
          />
        </Form.Item>
        <BindingFields
          addLabel={t("settingsAgentRuntimeAddHeader")}
          name="http_headers"
          title={t("settingsAgentRuntimeHttpHeaders")}
        />
      </>
    );
  }
  if (transport === "custom") {
    return (
      <>
        <Form.Item
          label={t("settingsAgentRuntimeAdapterId")}
          name="adapter_id"
          rules={[{ required: true, message: t("settingsAgentRuntimeAdapterRequired") }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsAgentRuntimeCustomConfig")} name="custom_config">
          <Input.TextArea autoSize={{ maxRows: 10, minRows: 6 }} />
        </Form.Item>
      </>
    );
  }
  if (transport === "registry") {
    return (
      <div className="at-agent-runtime-form-grid">
        <Form.Item
          label={t("settingsAgentRuntimeRegistryId")}
          name="registry_id"
          rules={[{ required: true, message: t("settingsAgentRuntimeRegistryIdRequired") }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label={t("settingsAgentRuntimeRegistryDistribution")}
          name="registry_distribution"
        >
          <Select
            options={[
              { label: "auto", value: "auto" },
              { label: "binary", value: "binary" },
              { label: "npx", value: "npx" },
              { label: "uvx", value: "uvx" },
            ]}
          />
        </Form.Item>
        <BindingFields
          addLabel={t("settingsAgentRuntimeAddEnv")}
          name="registry_env"
          title={t("settingsAgentRuntimeRegistryEnv")}
        />
      </div>
    );
  }
  return (
    <>
      <Form.Item
        label={t("settingsAgentRuntimeCommand")}
        name="command"
        rules={[{ required: true, message: t("settingsAgentRuntimeCommandRequired") }]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item label={t("settingsAgentRuntimeArgs")} name="args">
        <Input.TextArea autoSize={{ maxRows: 6, minRows: 3 }} />
      </Form.Item>
      <BindingFields
        addLabel={t("settingsAgentRuntimeAddEnv")}
        name="stdio_env"
        title={t("settingsAgentRuntimeStdioEnv")}
      />
    </>
  );
}

function BindingFields({
  addLabel,
  name,
  title,
}: {
  addLabel: string;
  name: "http_headers" | "registry_env" | "stdio_env";
  title: string;
}) {
  const t = useTranslations();
  return (
    <div className="at-agent-runtime-bindings">
      <div className="at-agent-runtime-bindings-head">
        <Typography.Text strong>{title}</Typography.Text>
        <Form.List name={name}>
          {(fields, { add, remove }) => (
            <>
              <Button
                icon={<Plus size={14} />}
                onClick={() => add({ name: "", secret: false, value: "" })}
              >
                {addLabel}
              </Button>
              {fields.length === 0 ? (
                <div className="at-settings-empty">
                  {t("settingsAgentRuntimeNoBindings")}
                </div>
              ) : (
                <div className="at-agent-runtime-binding-list">
                  {fields.map((field) => (
                    <div className="at-agent-runtime-binding-row" key={field.key}>
                      <Form.Item
                        label={t("settingsAgentRuntimeBindingName")}
                        name={[field.name, "name"]}
                      >
                        <Input autoComplete="off" />
                      </Form.Item>
                      <Form.Item
                        label={t("settingsAgentRuntimeBindingValue")}
                        name={[field.name, "value"]}
                      >
                        <Input
                          autoComplete="off"
                          placeholder={t("settingsAgentRuntimeSecretPlaceholder")}
                        />
                      </Form.Item>
                      <Form.Item
                        label={t("settingsAgentRuntimeBindingSecret")}
                        name={[field.name, "secret"]}
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      <Button
                        aria-label={t("settingsAgentRuntimeRemoveBinding")}
                        icon={<Trash2 size={14} />}
                        onClick={() => remove(field.name)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Form.List>
      </div>
    </div>
  );
}

function AgentRuntimeRegistryView({ onBack }: { onBack: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["settings", "agent-runtime-registry"],
    queryFn: () => getAgentRuntimeRegistry(false),
  });
  const refreshMutation = useMutation({
    mutationFn: refreshAgentRuntimeRegistry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["settings", "agent-runtime-registry"],
      });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsLoadFailed"));
    },
  });
  const installMutation = useMutation({
    mutationFn: (agent: AcpRegistryAgentView) =>
      installAgentRuntimeFromRegistry(agent.registry_id, {
        agent_id: agent.installed_agent_id ?? undefined,
        distribution: "auto",
        env: agent.installed_agent_id ? null : {},
      }),
    onSuccess: async (result) => {
      void message.success(result.message || t("settingsAgentRuntimeRegistryInstalled"));
      await invalidateAgentRuntimeQueries(queryClient);
      await queryClient.invalidateQueries({
        queryKey: ["settings", "agent-runtime-registry"],
      });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });
  const catalog = query.data;
  const agents = catalog?.agents ?? [];

  return (
    <div className="at-settings-detail-page at-agent-runtime-registry">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <Typography.Title level={4}>
            {t("settingsAgentRuntimeRegistry")}
          </Typography.Title>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={registrySource(catalog)}
          >
            {registrySource(catalog)}
          </Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button onClick={onBack}>{t("settingsBack")}</Button>
          <Button
            icon={<RefreshCw size={15} />}
            loading={query.isFetching || refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {t("settingsAgentRuntimeRefresh")}
          </Button>
        </div>
      </div>
      <SettingsQueryState error={query.error} loading={query.isLoading} />
      {!query.isLoading && catalog !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsAgentRuntimeRegistryAgents")}
              value={String(agents.length)}
            />
            <Fact
              label={t("settingsAgentRuntimeRegistryVersion")}
              value={catalog.registry_version?.trim() || "-"}
            />
            <Fact
              label={t("settingsAgentRuntimeRegistryStatus")}
              value={catalog.error_message ? t("settingsAgentRuntimeRegistryStale") : "ok"}
            />
          </div>
          {catalog.error_message ? (
            <div className="at-settings-empty is-warning">{catalog.error_message}</div>
          ) : null}
          {agents.length === 0 ? (
            <div className="at-settings-empty">{t("settingsAgentRuntimeRegistryEmpty")}</div>
          ) : (
            <div className="at-settings-list at-runtime-settings-list">
              {agents.map((agent) => (
                <div className="at-settings-list-row" key={agent.registry_id}>
                  <div className="at-settings-list-main">
                    <span>{agent.name || agent.registry_id}</span>
                    <Typography.Text ellipsis title={agent.description ?? ""}>
                      {agent.description || agent.registry_id}
                    </Typography.Text>
                  </div>
                  <div className="at-agent-runtime-registry-actions">
                    <Typography.Text className="at-settings-list-meta" ellipsis>
                      {registryAgentMeta(agent, t)}
                    </Typography.Text>
                    <Button
                      disabled={agent.installed === true && agent.update_available !== true}
                      loading={installMutation.isPending}
                      onClick={() => installMutation.mutate(agent)}
                    >
                      {registryInstallLabel(agent, t)}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function AgentRuntimeTestStatus({ job }: { job: AgentRuntimeTestJob }) {
  const t = useTranslations();
  const percent = job.progress_percent ?? undefined;
  const message = job.error_message || job.result?.message || job.message || "-";
  const isFailure = job.status === "failed";
  const isActive = isActiveAgentRuntimeJob(job);
  return (
    <div className={isFailure ? "at-agent-runtime-test-status is-danger" : "at-agent-runtime-test-status"}>
      <div className="at-settings-list-main">
        <span>
          {isFailure
            ? t("settingsAgentRuntimeTestFailed")
            : isActive
              ? t("settingsAgentRuntimeTestRunning")
              : t("settingsAgentRuntimeTestStatus")}
        </span>
        <Typography.Text className="at-settings-list-meta">{message}</Typography.Text>
      </div>
      <Progress percent={percent} status={isFailure ? "exception" : "normal"} />
    </div>
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

function hookGroups(config: HooksConfigPayload | undefined): Array<[string, JsonValue]> {
  return Object.entries(config?.hooks ?? {});
}

function hookDetail(hook: LoadedHookRecord): string {
  return [hook.event, hook.matcher, hook.handler]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ") || "-";
}

function pluginTitle(plugin: PluginRuntimeRecord, fallback: string): string {
  return plugin.name?.trim() || plugin.plugin_id?.trim() || pluginSourceLabel(plugin) || fallback;
}

function pluginKey(plugin: PluginRuntimeRecord, title: string): string {
  return [
    plugin.scope ?? "user",
    plugin.manifest_path?.trim() || plugin.plugin_id?.trim() || plugin.name?.trim() || title,
  ].join(":");
}

function pluginDetail(plugin: PluginRuntimeRecord, t: ReturnType<typeof useTranslations>): string {
  const componentCount = [
    plugin.skill_sources,
    plugin.role_sources,
    plugin.command_sources,
    plugin.hook_sources,
    plugin.mcp_sources,
    plugin.settings_sources,
  ].reduce((total, sources) => total + (sources?.length ?? 0), 0);
  if (componentCount > 0) {
    return t("settingsPluginsComponents", { count: componentCount });
  }
  return plugin.description?.trim() || plugin.manifest_path?.trim() || t("settingsNoComponents");
}

function pluginStatus(plugin: PluginRuntimeRecord, t: ReturnType<typeof useTranslations>): string {
  if (plugin.valid === false) {
    return t("settingsInvalid");
  }
  if (plugin.enabled === false) {
    return t("settingsDisabled");
  }
  return t("settingsEnabled");
}

function pluginName(plugin: PluginRuntimeRecord): string | null {
  const name = plugin.name?.trim() || plugin.plugin_id?.trim();
  return name && name.length > 0 ? name : null;
}

function pluginScope(plugin: PluginRuntimeRecord): PluginScope {
  return plugin.scope ?? "user";
}

function pluginSourceLabel(plugin: PluginRuntimeRecord): string {
  const source = plugin.source;
  if (typeof source === "string") {
    return source.trim();
  }
  if (source !== null && typeof source === "object" && !Array.isArray(source)) {
    const value = source.value;
    if (typeof value === "string") {
      return value.trim();
    }
  }
  return "";
}

function pluginActionKey(request: PluginActionRequest): string {
  return `${request.action}:${pluginScope(request.plugin)}:${pluginName(request.plugin) ?? ""}`;
}

function pluginActionSuccessMessage(
  action: PluginAction,
  t: ReturnType<typeof useTranslations>,
): string {
  if (action === "enable") {
    return t("settingsPluginsEnabled");
  }
  if (action === "disable") {
    return t("settingsPluginsDisabled");
  }
  if (action === "update") {
    return t("settingsPluginsUpdated");
  }
  return t("settingsPluginsDeleted");
}

function agentRuntimeDetail(runtime: AgentRuntimeSummary): string {
  return [runtime.protocol, runtime.transport]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ") || "-";
}

function createBlankAgentRuntimeConfig(): AgentRuntimeConfig {
  return {
    agent_id: "",
    description: "",
    name: "",
    native_config_enabled: false,
    native_config_provider: "",
    protocol: "acp",
    skill_bridge_enabled: false,
    skill_bridge_mode: "inline",
    skill_bridge_skills: [],
    transport: {
      args: [],
      command: "",
      env: [],
      transport: "stdio",
    },
  };
}

function configToForm(config: AgentRuntimeConfig): AgentRuntimeFormValues {
  const base = {
    agent_id: config.agent_id,
    description: config.description ?? "",
    name: config.name,
    native_config_enabled: config.native_config_enabled === true,
    native_config_provider: config.native_config_provider ?? "",
    protocol: config.protocol ?? "acp",
    skill_bridge_enabled: config.skill_bridge_enabled === true,
    skill_bridge_mode: config.skill_bridge_mode ?? "inline",
    skill_bridge_skills: linesFromList(config.skill_bridge_skills ?? []),
    transport: config.transport.transport,
  };
  if (config.transport.transport === "streamable_http") {
    return {
      ...base,
      http_headers: bindingsToForm(config.transport.headers ?? []),
      ssl_verify: sslVerifyToForm(config.transport.ssl_verify),
      url: config.transport.url,
    };
  }
  if (config.transport.transport === "custom") {
    return {
      ...base,
      adapter_id: config.transport.adapter_id,
      custom_config: JSON.stringify(config.transport.config ?? {}, null, 2),
    };
  }
  if (config.transport.transport === "registry") {
    return {
      ...base,
      registry_distribution: config.transport.distribution ?? "auto",
      registry_env: bindingsToForm(config.transport.env ?? []),
      registry_id: config.transport.registry_id,
    };
  }
  return {
    ...base,
    args: linesFromList(config.transport.args ?? []),
    command: config.transport.command,
    stdio_env: bindingsToForm(config.transport.env ?? []),
  };
}

function buildAgentRuntimeSavePayload(
  values: AgentRuntimeFormValues,
  current: AgentRuntimeConfig | undefined,
): { config: AgentRuntimeConfig; pathAgentId: string } {
  const agentId = values.agent_id.trim();
  const name = values.name.trim();
  if (!agentId) {
    throw new Error("Agent ID is required.");
  }
  if (!name) {
    throw new Error("Agent name is required.");
  }
  validateProtocolTransport(values.protocol, values.transport);
  const config: AgentRuntimeConfig = {
    agent_id: agentId,
    description: values.description?.trim() ?? "",
    name,
    native_config_enabled: values.native_config_enabled === true,
    native_config_provider: values.native_config_provider?.trim() ?? "",
    protocol: values.protocol,
    skill_bridge_enabled: values.skill_bridge_enabled === true,
    skill_bridge_mode: values.skill_bridge_mode ?? "inline",
    skill_bridge_skills: listFromLines(values.skill_bridge_skills),
    transport: buildAgentRuntimeTransport(values, current?.transport),
  };
  return {
    config,
    pathAgentId: current?.agent_id.trim() || agentId,
  };
}

function buildAgentRuntimeTransport(
  values: AgentRuntimeFormValues,
  current: AgentRuntimeTransportConfig | undefined,
): AgentRuntimeTransportConfig {
  if (values.transport === "streamable_http") {
    const existing = current?.transport === "streamable_http" ? current : undefined;
    const url = values.url?.trim() ?? "";
    if (!url) {
      throw new Error("HTTP transport URL is required.");
    }
    return {
      headers: bindingsFromForm(values.http_headers, existing?.headers ?? []),
      ssl_verify: sslVerifyFromForm(values.ssl_verify),
      transport: "streamable_http",
      url,
    };
  }
  if (values.transport === "custom") {
    const adapterId = values.adapter_id?.trim() ?? "";
    if (!adapterId) {
      throw new Error("Custom adapter ID is required.");
    }
    return {
      adapter_id: adapterId,
      config: parseCustomConfig(values.custom_config),
      transport: "custom",
    };
  }
  if (values.transport === "registry") {
    const existing = current?.transport === "registry" ? current : undefined;
    const registryId = values.registry_id?.trim() ?? "";
    if (!registryId) {
      throw new Error("Registry ID is required.");
    }
    return {
      distribution: values.registry_distribution ?? "auto",
      env: bindingsFromForm(values.registry_env, existing?.env ?? []),
      registry_entry: existing?.registry_entry ?? null,
      registry_id: registryId,
      registry_version: existing?.registry_version ?? "",
      transport: "registry",
    };
  }
  const existing = current?.transport === "stdio" ? current : undefined;
  const command = values.command?.trim() ?? "";
  if (!command) {
    throw new Error("Command is required.");
  }
  return {
    args: listFromLines(values.args),
    command,
    env: bindingsFromForm(values.stdio_env, existing?.env ?? []),
    transport: "stdio",
  };
}

function validateProtocolTransport(
  protocol: AgentRuntimeProtocol,
  transport: AgentRuntimeTransportType,
): void {
  if (protocol === "a2a" && transport !== "streamable_http") {
    throw new Error("A2A agent runtimes require streamable_http transport.");
  }
  if (protocol === "cli" && transport !== "stdio") {
    throw new Error("CLI agent runtimes require stdio transport.");
  }
  if (transport === "registry" && protocol !== "acp") {
    throw new Error("Registry agent runtimes require ACP protocol.");
  }
}

function bindingsToForm(
  bindings: readonly AgentRuntimeBindingConfig[],
): AgentRuntimeBindingFormRow[] {
  return bindings.map((binding) => ({
    name: binding.name,
    secret: binding.secret === true,
    value: binding.value ?? "",
  }));
}

function bindingsFromForm(
  rows: readonly AgentRuntimeBindingFormRow[] | undefined,
  existing: readonly AgentRuntimeBindingConfig[],
): AgentRuntimeBindingConfig[] {
  const existingByName = new Map(
    existing.map((binding) => [binding.name.trim(), binding]),
  );
  return (rows ?? [])
    .map((row) => {
      const name = row.name?.trim() ?? "";
      const value = row.value ?? "";
      const existingBinding = existingByName.get(name);
      return {
        configured: existingBinding?.configured === true && !value.trim(),
        name,
        secret: row.secret === true,
        value,
      };
    })
    .filter((binding) => binding.name);
}

function parseCustomConfig(value: string | undefined): Record<string, JsonValue> {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return {};
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, JsonValue>;
  }
  throw new Error("Custom config must be a JSON object.");
}

function linesFromList(values: readonly string[]): string {
  return values.join("\n");
}

function listFromLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sslVerifyToForm(value: boolean | null | undefined): "inherit" | "true" | "false" {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "inherit";
}

function sslVerifyFromForm(value: "inherit" | "true" | "false" | undefined): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function isAgentRuntimeTransport(value: unknown): value is AgentRuntimeTransportType {
  return (
    value === "stdio"
    || value === "streamable_http"
    || value === "custom"
    || value === "registry"
  );
}

async function waitForAgentRuntimeTestJob(agentId: string): Promise<AgentRuntimeTestJob> {
  let job = await startAgentRuntimeTestJob(agentId);
  for (let attempt = 0; attempt < 60 && isActiveAgentRuntimeJob(job); attempt += 1) {
    await delay(600);
    job = await getAgentRuntimeTestJob(job.job_id);
  }
  return job;
}

function isActiveAgentRuntimeJob(job: AgentRuntimeTestJob): boolean {
  return job.status === "queued" || job.status === "running";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function invalidateAgentRuntimeQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["settings", "agent-runtimes"] }),
    queryClient.invalidateQueries({ queryKey: ["settings", "roles", "options"] }),
  ]);
}

function registrySource(catalog: AcpRegistryCatalogResponse | undefined): string {
  return catalog?.source_url?.trim() || "-";
}

function registryAgentMeta(
  agent: AcpRegistryAgentView,
  t: ReturnType<typeof useTranslations>,
): string {
  const status = agent.installed === true
    ? agent.update_available === true
      ? t("settingsAgentRuntimeRegistryUpdateAvailable")
      : t("settingsAgentRuntimeRegistryInstalled")
    : t("settingsAgentRuntimeRegistryAvailable");
  const distributions = (agent.distributions ?? []).join(", ") || "-";
  return `${agent.version} · ${distributions} · ${status}`;
}

function registryInstallLabel(
  agent: AcpRegistryAgentView,
  t: ReturnType<typeof useTranslations>,
): string {
  if (agent.installed === true && agent.update_available !== true) {
    return t("settingsAgentRuntimeRegistryInstalled");
  }
  if (agent.update_available === true) {
    return t("settingsAgentRuntimeRegistryUpdate");
  }
  return t("settingsAgentRuntimeRegistryInstall");
}
