import { Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Popconfirm, Progress, Select, Switch, Typography } from "antd";
import { useEffect, useState, type ReactNode } from "react";

import {
  configurePlugin,
  deletePlugin,
  deleteAgentRuntime,
  disablePlugin,
  enablePlugin,
  getEnvironmentVariables,
  getAgentRuntime,
  getAgentRuntimeRegistry,
  getAgentRuntimes,
  getAgentRuntimeTestJob,
  getPluginsConfig,
  getPluginsRuntime,
  installPlugin,
  installAgentRuntimeFromRegistry,
  loadPluginMarketplace,
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
  EnvironmentVariableCatalog,
  EnvironmentVariableRecord,
  JsonValue,
  PluginInstallRequest,
  PluginInstallSourceKind,
  PluginMarketplaceEntry,
  PluginMarketplaceIndex,
  PluginMarketplaceRequest,
  PluginMarketplaceVersion,
  PluginRuntimeDiagnostics,
  PluginRuntimeRecord,
  PluginUserConfigField,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type AgentRuntimeBindingConfig = AgentRuntimeSecretBinding;
type PluginScope = NonNullable<PluginRuntimeRecord["scope"]>;
type PluginAction = "delete" | "disable" | "enable" | "update";
type PluginSettingsView =
  | { type: "list" }
  | { type: "install" }
  | { plugin: PluginRuntimeRecord; type: "configure" }
  | { plugin: PluginRuntimeRecord; type: "marketplace-update" };

interface PluginActionRequest {
  action: PluginAction;
  plugin: PluginRuntimeRecord;
}

interface PluginInstallFormValues {
  allow_community_plugins?: boolean;
  allow_executes_code?: boolean;
  allow_missing_digest?: boolean;
  allow_unclean_scan?: boolean;
  marketplace?: string;
  marketplace_provider?: PluginInstallRequest["marketplace_provider"];
  marketplace_ref?: string;
  marketplace_source?: string;
  scope?: PluginScope;
  source?: string;
  source_kind?: PluginInstallSourceKind;
  source_ref?: string;
  version?: string;
}

interface PluginMarketplaceSourceDraft {
  marketplace: string;
  marketplace_provider?: PluginInstallRequest["marketplace_provider"];
  marketplace_ref?: string;
  marketplace_source?: string;
  value?: string;
}

type PluginConfigFormValue = boolean | number | string | undefined;
type PluginConfigFormValues = Record<string, PluginConfigFormValue>;

export function PluginsSettingsSection() {
  const t = useTranslations();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [view, setView] = useState<PluginSettingsView>({ type: "list" });
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
  const requestPluginAction = (request: PluginActionRequest) => {
    if (request.action === "update" && pluginMarketplaceSource(request.plugin) !== null) {
      setView({ plugin: request.plugin, type: "marketplace-update" });
      return;
    }
    actionMutation.mutate(request);
  };
  if (view.type === "install") {
    return (
      <SettingsSection title={t("settingsPlugins")}>
        <PluginInstallView
          onBack={() => setView({ type: "list" })}
          onSaved={() => setView({ type: "list" })}
        />
      </SettingsSection>
    );
  }
  if (view.type === "configure") {
    return (
      <SettingsSection title={t("settingsPlugins")}>
        <PluginConfigureView
          onBack={() => setView({ type: "list" })}
          onSaved={() => setView({ type: "list" })}
          plugin={view.plugin}
        />
      </SettingsSection>
    );
  }
  if (view.type === "marketplace-update") {
    return (
      <SettingsSection title={t("settingsPlugins")}>
        <PluginMarketplaceUpdateView
          onBack={() => setView({ type: "list" })}
          onSaved={() => setView({ type: "list" })}
          plugin={view.plugin}
        />
      </SettingsSection>
    );
  }
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
            <Button
              icon={<Plus size={15} />}
              onClick={() => setView({ type: "install" })}
              type="primary"
            >
              {t("settingsPluginsInstall")}
            </Button>
          </div>
          <PluginRuntimeList
            onConfigure={(plugin) => setView({ plugin, type: "configure" })}
            onAction={requestPluginAction}
            pendingActionKey={pendingActionKey}
            plugins={plugins}
          />
          <PluginDiagnosticsList diagnostics={diagnostics} />
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

function PluginInstallView({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<PluginInstallFormValues>();
  const [marketplaceIndex, setMarketplaceIndex] =
    useState<PluginMarketplaceIndex | null>(null);
  const sourceKind = Form.useWatch("source_kind", form) ?? "local";
  const selectedSource = Form.useWatch("source", form) ?? "";
  const marketplaceEntries = marketplaceEntriesForInstall(marketplaceIndex);
  const selectedMarketplaceEntry = marketplaceEntries.find(
    (entry) => entry.name === selectedSource,
  );
  const marketplaceVersionOptions =
    marketplaceVersionSelectOptions(selectedMarketplaceEntry);
  const marketplaceLoadedWithoutEntries =
    sourceKind === "marketplace" &&
    marketplaceIndex !== null &&
    marketplaceEntries.length === 0;
  const marketplaceUnsupportedDetail = marketplaceUnsupportedReason(marketplaceIndex);
  const installMutation = useMutation({
    mutationFn: (values: PluginInstallFormValues) =>
      installPlugin(buildPluginInstallRequest(values)),
    onSuccess: async () => {
      void message.success(t("settingsPluginsInstalled"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "plugins"] });
      onSaved();
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });
  const marketplaceMutation = useMutation({
    mutationFn: () =>
      loadPluginMarketplace(buildPluginMarketplaceRequest(form.getFieldsValue(), true)),
    onSuccess: (index) => {
      const entries = marketplaceEntriesForInstall(index);
      setMarketplaceIndex(index);
      if (entries.length > 0) {
        form.setFieldsValue({
          source: entries[0].name,
          version: marketplaceDefaultVersion(entries[0]),
        });
      }
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  return (
    <>
      <div className="at-settings-section-actions">
        <Button onClick={onBack}>{t("settingsBack")}</Button>
      </div>
      <Form
        form={form}
        initialValues={{
          allow_community_plugins: false,
          allow_executes_code: false,
          allow_missing_digest: false,
          allow_unclean_scan: false,
          marketplace_provider: "local_json",
          scope: "user",
          source_kind: "local",
        }}
        layout="vertical"
        onFinish={(values) => installMutation.mutate(values)}
      >
        <Form.Item
          label={t("settingsPluginsInstallSourceType")}
          name="source_kind"
          rules={[{ required: true }]}
        >
          <Select
            onChange={(value) => {
              if (value === "marketplace") {
                form.setFieldsValue(pluginMarketplaceProviderDefaults("local_json"));
              }
              setMarketplaceIndex(null);
            }}
            options={[
              { label: t("settingsPluginsInstallSourceLocal"), value: "local" },
              { label: t("settingsPluginsInstallSourceGit"), value: "git" },
              {
                label: t("settingsPluginsInstallSourceGitSubdir"),
                value: "git_subdir",
              },
              {
                label: t("settingsPluginsInstallSourceArchive"),
                value: "http_archive",
              },
              {
                label: t("settingsPluginsInstallSourceMarketplace"),
                value: "marketplace",
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={t("settingsPluginsInstallSource")}
          name="source"
          rules={[{ required: true, whitespace: true }]}
        >
          {sourceKind === "marketplace" && marketplaceEntries.length > 0 ? (
            <Select
              onChange={(value) => {
                const entry = marketplaceEntries.find((item) => item.name === value);
                form.setFieldsValue({ version: marketplaceDefaultVersion(entry) });
              }}
              options={marketplaceEntries.map((entry) => ({
                label: marketplaceEntryLabel(entry),
                value: entry.name,
              }))}
            />
          ) : (
            <Input />
          )}
        </Form.Item>
        <Form.Item label={t("settingsPluginsInstallScope")} name="scope">
          <Select
            options={[
              { label: t("settingsPluginsScopeUser"), value: "user" },
              { label: t("settingsPluginsScopeProject"), value: "project" },
              { label: t("settingsPluginsScopeLocal"), value: "local" },
            ]}
          />
        </Form.Item>
        {sourceKind === "git" ||
        sourceKind === "git_subdir" ||
        sourceKind === "http_archive" ? (
          <Form.Item label={t("settingsPluginsInstallSourceRef")} name="source_ref">
            <Input />
          </Form.Item>
        ) : null}
        {sourceKind === "marketplace" ? (
          <>
            <Form.Item
              label={t("settingsPluginsInstallMarketplace")}
              name="marketplace"
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsInstallMarketplaceProvider")}
              name="marketplace_provider"
            >
              <Select
                onChange={(value) => {
                  form.setFieldsValue(pluginMarketplaceProviderDefaults(value));
                  setMarketplaceIndex(null);
                }}
                options={[
                  { label: "local_json", value: "local_json" },
                  { label: "claude", value: "claude" },
                  { label: "clawhub", value: "clawhub" },
                ]}
              />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsInstallMarketplaceSource")}
              name="marketplace_source"
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsInstallMarketplaceRef")}
              name="marketplace_ref"
            >
              <Input />
            </Form.Item>
            <Form.Item label={t("settingsPluginsInstallVersion")} name="version">
              {marketplaceVersionOptions.length > 0 ? (
                <Select options={marketplaceVersionOptions} />
              ) : (
                <Input />
              )}
            </Form.Item>
            <div className="at-settings-section-actions">
              <Button
                loading={marketplaceMutation.isPending}
                onClick={() => marketplaceMutation.mutate()}
              >
                {t("settingsPluginsLoadMarketplace")}
              </Button>
            </div>
            {marketplaceLoadedWithoutEntries ? (
              <div className="at-settings-empty">
                {[
                  t("settingsPluginsMarketplaceEmpty"),
                  marketplaceUnsupportedDetail,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </div>
            ) : null}
            <Form.Item
              label={t("settingsPluginsAllowCommunity")}
              name="allow_community_plugins"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsAllowExecutesCode")}
              name="allow_executes_code"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsAllowMissingDigest")}
              name="allow_missing_digest"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label={t("settingsPluginsAllowUncleanScan")}
              name="allow_unclean_scan"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </>
        ) : null}
        <div className="at-settings-section-actions">
          <Button
            disabled={marketplaceLoadedWithoutEntries}
            htmlType="submit"
            loading={installMutation.isPending}
            type="primary"
          >
            {t("settingsPluginsInstall")}
          </Button>
          <Button onClick={onBack}>{t("sidebarDeleteCancel")}</Button>
        </div>
      </Form>
    </>
  );
}

function PluginConfigureView({
  onBack,
  onSaved,
  plugin,
}: {
  onBack: () => void;
  onSaved: () => void;
  plugin: PluginRuntimeRecord;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<PluginConfigFormValues>();
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(() => new Set());
  const fields = pluginConfigFields(plugin);
  const title = pluginTitle(plugin, t("settingsPluginsUnnamed"));
  const configureMutation = useMutation({
    mutationFn: (values: PluginConfigFormValues) => {
      const name = pluginName(plugin);
      if (name === null) {
        throw new Error(t("settingsPluginsNameRequired"));
      }
      return configurePlugin(name, {
        scope: pluginScope(plugin),
        user_config: buildPluginConfigPayload(plugin, values, dirtyFields, t),
      });
    },
    onSuccess: async () => {
      void message.success(t("settingsPluginsConfigured"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "plugins"] });
      onSaved();
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    form.setFieldsValue(pluginConfigInitialValues(plugin));
    setDirtyFields(new Set());
  }, [form, plugin]);

  return (
    <>
      <div className="at-settings-section-actions">
        <Button onClick={onBack}>{t("settingsBack")}</Button>
      </div>
      <Typography.Title level={4}>{title}</Typography.Title>
      {fields.length === 0 ? (
        <div className="at-settings-empty">{t("settingsPluginsNoConfig")}</div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => configureMutation.mutate(values)}
          onValuesChange={(changedValues) => {
            const changedKeys = Object.keys(changedValues);
            setDirtyFields((current) => {
              const next = new Set(current);
              for (const key of changedKeys) {
                next.add(key);
              }
              return next;
            });
          }}
        >
          {fields.map(([key, field]) => (
            <PluginConfigFormItem field={field} key={key} name={key} />
          ))}
          <div className="at-settings-section-actions">
            <Button
              htmlType="submit"
              loading={configureMutation.isPending}
              type="primary"
            >
              {t("settingsSave")}
            </Button>
            <Button onClick={onBack}>{t("sidebarDeleteCancel")}</Button>
          </div>
        </Form>
      )}
    </>
  );
}

function PluginMarketplaceUpdateView({
  onBack,
  onSaved,
  plugin,
}: {
  onBack: () => void;
  onSaved: () => void;
  plugin: PluginRuntimeRecord;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const source = pluginMarketplaceSource(plugin);
  const [selectedVersion, setSelectedVersion] = useState("");
  const title = pluginTitle(plugin, t("settingsPluginsUnnamed"));
  const marketplaceQuery = useQuery({
    enabled: source !== null,
    queryKey: ["settings", "plugins", "marketplace-update", pluginKey(plugin, title)],
    queryFn: () => loadPluginMarketplace(buildPluginMarketplaceRequestFromSource(source)),
  });
  const marketplaceEntry = marketplaceEntryForPlugin(plugin, marketplaceQuery.data);
  const versionOptions = marketplaceVersionSelectOptions(marketplaceEntry);
  const updateMutation = useMutation({
    mutationFn: () => {
      const name = pluginName(plugin);
      if (name === null) {
        throw new Error(t("settingsPluginsNameRequired"));
      }
      return updatePlugin(name, {
        allow_missing_digest: source?.marketplace_provider === "clawhub",
        scope: pluginScope(plugin),
        version: selectedVersion || null,
      });
    },
    onSuccess: async () => {
      void message.success(t("settingsPluginsUpdated"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "plugins"] });
      onSaved();
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    setSelectedVersion(marketplaceDefaultVersion(marketplaceEntry));
  }, [marketplaceEntry]);

  return (
    <>
      <div className="at-settings-section-actions">
        <Button onClick={onBack}>{t("settingsBack")}</Button>
      </div>
      <Typography.Title level={4}>{title}</Typography.Title>
      <SettingsQueryState
        error={marketplaceQuery.error}
        loading={marketplaceQuery.isLoading}
      />
      {!marketplaceQuery.isLoading && marketplaceQuery.data !== undefined ? (
        <>
          {versionOptions.length > 0 ? (
            <Form layout="vertical">
              <Form.Item label={t("settingsPluginsInstallVersion")}>
                <Select
                  onChange={(value) => setSelectedVersion(value)}
                  options={versionOptions}
                  value={selectedVersion}
                />
              </Form.Item>
            </Form>
          ) : (
            <div className="at-settings-empty">
              {t("settingsPluginsMarketplaceEmpty")}
            </div>
          )}
          <div className="at-settings-section-actions">
            <Button
              disabled={versionOptions.length === 0}
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              type="primary"
            >
              {t("settingsPluginsUpdate")}
            </Button>
            <Button
              loading={marketplaceQuery.isFetching}
              onClick={() => void marketplaceQuery.refetch()}
            >
              {t("settingsPluginsLoadMarketplace")}
            </Button>
            <Button onClick={onBack}>{t("sidebarDeleteCancel")}</Button>
          </div>
        </>
      ) : null}
    </>
  );
}

function PluginConfigFormItem({
  field,
  name,
}: {
  field: PluginUserConfigField;
  name: string;
}) {
  const t = useTranslations();
  const fieldType = normalizedPluginConfigType(field.type);
  const label = field.title?.trim() || name;
  const description = pluginConfigFieldDescription(field, t);
  if (fieldType === "boolean") {
    return (
      <Form.Item
        extra={description}
        label={label}
        name={name}
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
    );
  }
  return (
    <Form.Item extra={description} label={label} name={name}>
      {pluginConfigControl(fieldType, field)}
    </Form.Item>
  );
}

function pluginConfigControl(
  fieldType: string,
  field: PluginUserConfigField,
): ReactNode {
  if (
    fieldType === "text" ||
    fieldType === "object" ||
    fieldType === "array" ||
    fieldType === "json"
  ) {
    return <Input.TextArea rows={fieldType === "text" ? 3 : 6} spellCheck={false} />;
  }
  if (fieldType === "number" || fieldType === "integer") {
    return <Input type="number" />;
  }
  if (field.sensitive === true || fieldType === "password") {
    return <Input.Password />;
  }
  return <Input />;
}

function PluginRuntimeList({
  onConfigure,
  onAction,
  pendingActionKey,
  plugins,
}: {
  onConfigure: (plugin: PluginRuntimeRecord) => void;
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
        const hasConfig = pluginConfigFields(plugin).length > 0;
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
              {hasConfig ? (
                <Button
                  disabled={name === null}
                  onClick={() => onConfigure(plugin)}
                  size="small"
                >
                  {t("settingsPluginsConfigure")}
                </Button>
              ) : null}
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
  const environmentQuery = useQuery({
    queryKey: ["settings", "environment", "variables"],
    queryFn: getEnvironmentVariables,
  });
  const environmentRecords = environmentRecordsFromCatalog(environmentQuery.data);

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
      const payload = buildAgentRuntimeSavePayload(
        values,
        query.data,
        environmentRecords,
      );
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
      const payload = buildAgentRuntimeSavePayload(
        values,
        query.data,
        environmentRecords,
      );
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
              <TransportFields
                environmentLoading={environmentQuery.isLoading}
                environmentRecords={environmentRecords}
                transport={transport}
              />
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

function TransportFields({
  environmentLoading,
  environmentRecords,
  transport,
}: {
  environmentLoading: boolean;
  environmentRecords: EnvironmentVariableRecord[];
  transport: AgentRuntimeTransportType;
}) {
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
          environmentLoading={environmentLoading}
          environmentRecords={environmentRecords}
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
        environmentLoading={environmentLoading}
        environmentRecords={environmentRecords}
        name="stdio_env"
        title={t("settingsAgentRuntimeStdioEnv")}
      />
    </>
  );
}

function BindingFields({
  addLabel,
  environmentLoading = false,
  environmentRecords,
  name,
  title,
}: {
  addLabel: string;
  environmentLoading?: boolean;
  environmentRecords?: EnvironmentVariableRecord[];
  name: "http_headers" | "registry_env" | "stdio_env";
  title: string;
}) {
  const t = useTranslations();
  const isEnvironmentBinding = name === "registry_env" || name === "stdio_env";
  const environmentOptions = environmentVariableOptions(environmentRecords ?? [], t);
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
                        {isEnvironmentBinding ? (
                          <Select
                            loading={environmentLoading}
                            options={environmentOptions}
                            placeholder={t("settingsAgentRuntimeBindingName")}
                            showSearch
                          />
                        ) : (
                          <Input autoComplete="off" />
                        )}
                      </Form.Item>
                      {isEnvironmentBinding ? null : (
                        <>
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
                        </>
                      )}
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

function requiredTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildPluginInstallRequest(
  values: PluginInstallFormValues,
): PluginInstallRequest {
  const sourceKind = values.source_kind ?? "local";
  const request: PluginInstallRequest = {
    enabled: true,
    scope: values.scope ?? "user",
    source: requiredTrimmed(values.source),
    source_kind: sourceKind,
  };
  const sourceRef = optionalTrimmed(values.source_ref);
  if (sourceRef !== undefined) {
    request.source_ref = sourceRef;
  }
  if (sourceKind === "marketplace") {
    request.marketplace = optionalTrimmed(values.marketplace) ?? null;
    request.marketplace_provider = values.marketplace_provider ?? "local_json";
    request.marketplace_source = optionalTrimmed(values.marketplace_source) ?? "";
    request.marketplace_ref = optionalTrimmed(values.marketplace_ref) ?? "";
    request.version = optionalTrimmed(values.version) ?? null;
    request.allow_community_plugins = values.allow_community_plugins === true;
    request.allow_executes_code = values.allow_executes_code === true;
    request.allow_missing_digest = values.allow_missing_digest === true;
    request.allow_unclean_scan = values.allow_unclean_scan === true;
  }
  return request;
}

function buildPluginMarketplaceRequest(
  values: PluginInstallFormValues,
  refresh: boolean,
): PluginMarketplaceRequest {
  const provider = values.marketplace_provider ?? "local_json";
  const defaults = pluginMarketplaceProviderDefaults(provider);
  return {
    allow_community_plugins: values.allow_community_plugins === true,
    allow_executes_code: values.allow_executes_code === true,
    allow_missing_digest: values.allow_missing_digest === true,
    allow_unclean_scan: values.allow_unclean_scan === true,
    fetch_all: true,
    include_details: false,
    marketplace: requiredTrimmed(values.marketplace ?? defaults.marketplace),
    marketplace_provider: provider,
    marketplace_ref: optionalTrimmed(values.marketplace_ref) ?? "",
    marketplace_source:
      optionalTrimmed(values.marketplace_source ?? defaults.marketplace_source) ?? "",
    refresh,
  };
}

function buildPluginMarketplaceRequestFromSource(
  source: PluginMarketplaceSourceDraft | null,
): PluginMarketplaceRequest {
  if (source === null) {
    return {
      marketplace: "",
      refresh: true,
    };
  }
  const provider = source.marketplace_provider ?? "local_json";
  return {
    allow_missing_digest: provider === "clawhub",
    fetch_all: true,
    include_details: provider === "clawhub",
    marketplace: source.marketplace,
    marketplace_provider: provider,
    marketplace_ref: source.marketplace_ref ?? "",
    marketplace_source: source.marketplace_source ?? "",
    refresh: true,
  };
}

function pluginMarketplaceSource(
  plugin: PluginRuntimeRecord,
): PluginMarketplaceSourceDraft | null {
  const source = plugin.source;
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const kind = stringRecordValue(source, "kind");
  if (kind !== "marketplace") {
    return null;
  }
  const marketplace = stringRecordValue(source, "marketplace");
  if (marketplace.length === 0) {
    return null;
  }
  return {
    marketplace,
    marketplace_provider: pluginMarketplaceProviderValue(
      stringRecordValue(source, "marketplace_provider"),
    ),
    marketplace_ref: stringRecordValue(source, "marketplace_ref"),
    marketplace_source: stringRecordValue(source, "marketplace_source"),
    value: stringRecordValue(source, "value"),
  };
}

function pluginMarketplaceProviderValue(
  value: string,
): PluginInstallRequest["marketplace_provider"] | undefined {
  if (value === "claude" || value === "clawhub" || value === "local_json") {
    return value;
  }
  return undefined;
}

function stringRecordValue(source: Record<string, JsonValue>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function pluginMarketplaceProviderDefaults(
  provider: PluginInstallRequest["marketplace_provider"],
): Partial<PluginInstallFormValues> {
  if (provider === "claude") {
    return {
      allow_missing_digest: false,
      marketplace: "claude-plugins-official",
      marketplace_source: "anthropics/claude-plugins-official",
      source: "",
      version: "",
    };
  }
  if (provider === "clawhub") {
    return {
      allow_missing_digest: true,
      marketplace: "clawhub",
      marketplace_source: "https://clawhub.ai",
      source: "",
      version: "",
    };
  }
  return {
    allow_missing_digest: false,
    marketplace: "",
    marketplace_source: "",
    source: "",
    version: "",
  };
}

function marketplaceEntriesForInstall(
  index: PluginMarketplaceIndex | null,
): PluginMarketplaceEntry[] {
  return (index?.plugins ?? []).filter(
    (entry) =>
      marketplaceEntryCanInstall(entry) &&
      supportedMarketplaceVersions(entry).length > 0,
  );
}

function marketplaceEntryCanInstall(entry: PluginMarketplaceEntry): boolean {
  return (
    entry.compatibility === undefined ||
    entry.compatibility === "direct"
  );
}

function marketplaceEntryForPlugin(
  plugin: PluginRuntimeRecord,
  index: PluginMarketplaceIndex | undefined,
): PluginMarketplaceEntry | undefined {
  const source = pluginMarketplaceSource(plugin);
  const names = [
    source?.value ?? "",
    pluginName(plugin) ?? "",
    plugin.plugin_id?.trim() ?? "",
  ].filter(Boolean);
  return (index?.plugins ?? []).find((entry) => names.includes(entry.name));
}

function supportedMarketplaceVersions(
  entry: PluginMarketplaceEntry | undefined,
): PluginMarketplaceVersion[] {
  return (entry?.versions ?? []).filter(
    (version) =>
      !version.unsupported_reason &&
      version.source?.kind !== "unsupported",
  );
}

function marketplaceDefaultVersion(
  entry: PluginMarketplaceEntry | undefined,
): string {
  if (entry === undefined) {
    return "";
  }
  const versions = supportedMarketplaceVersions(entry);
  if (entry.latest && versions.some((version) => version.version === entry.latest)) {
    return "";
  }
  return versions[0]?.version ?? "";
}

function marketplaceVersionSelectOptions(
  entry: PluginMarketplaceEntry | undefined,
): Array<{ label: string; value: string }> {
  if (entry === undefined) {
    return [];
  }
  const versions = supportedMarketplaceVersions(entry);
  const options = versions.map((version) => ({
    label: marketplaceVersionLabel(version),
    value: version.version,
  }));
  if (entry.latest && versions.some((version) => version.version === entry.latest)) {
    return [{ label: `latest (${entry.latest})`, value: "" }, ...options];
  }
  return options;
}

function marketplaceEntryLabel(entry: PluginMarketplaceEntry): string {
  return entry.latest ? `${entry.name} ${entry.latest}` : entry.name;
}

function marketplaceUnsupportedReason(
  index: PluginMarketplaceIndex | null,
): string {
  for (const entry of index?.plugins ?? []) {
    const versionReason = entry.versions
      ?.map((version) => version.unsupported_reason?.trim() ?? "")
      .find(Boolean);
    if (versionReason) {
      return versionReason;
    }
    if (
      entry.compatibility !== undefined &&
      entry.compatibility !== "direct" &&
      entry.compatibility_reason
    ) {
      return entry.compatibility_reason.trim();
    }
  }
  return "";
}

function marketplaceVersionLabel(version: PluginMarketplaceVersion): string {
  const sourceDetail =
    version.source?.ref?.trim() || version.source?.sha?.trim() || "";
  return sourceDetail ? `${version.version} ${sourceDetail}` : version.version;
}

function pluginConfigFields(
  plugin: PluginRuntimeRecord,
): Array<[string, PluginUserConfigField]> {
  const fields = plugin.manifest?.user_config ?? {};
  return Object.entries(fields);
}

function pluginConfigInitialValues(plugin: PluginRuntimeRecord): PluginConfigFormValues {
  const values: PluginConfigFormValues = {};
  for (const [key, field] of pluginConfigFields(plugin)) {
    values[key] = pluginConfigInitialValue(field, plugin.user_config?.[key]);
  }
  return values;
}

function pluginConfigInitialValue(
  field: PluginUserConfigField,
  value: JsonValue | undefined,
): PluginConfigFormValue {
  const fieldType = normalizedPluginConfigType(field.type);
  if (field.sensitive === true && value === "<configured>") {
    return fieldType === "boolean" ? true : "";
  }
  const effectiveValue = value ?? field.default ?? "";
  if (fieldType === "boolean") {
    return effectiveValue === true;
  }
  if (fieldType === "number" || fieldType === "integer") {
    return typeof effectiveValue === "number" ? effectiveValue : String(effectiveValue);
  }
  if (fieldType === "object" || fieldType === "array" || fieldType === "json") {
    return effectiveValue === "" ? "" : JSON.stringify(effectiveValue, null, 2);
  }
  return typeof effectiveValue === "string"
    ? effectiveValue
    : JSON.stringify(effectiveValue);
}

function buildPluginConfigPayload(
  plugin: PluginRuntimeRecord,
  values: PluginConfigFormValues,
  dirtyFields: Set<string>,
  t: Translate,
): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = {};
  for (const [key, field] of pluginConfigFields(plugin)) {
    if (
      field.sensitive === true &&
      plugin.user_config?.[key] === "<configured>" &&
      !dirtyFields.has(key)
    ) {
      continue;
    }
    if (
      field.required !== true &&
      plugin.user_config?.[key] === undefined &&
      pluginConfigValueIsBlank(values[key])
    ) {
      continue;
    }
    payload[key] = parsePluginConfigValue(key, field, values[key], t);
  }
  return payload;
}

function pluginConfigValueIsBlank(value: PluginConfigFormValue): boolean {
  return typeof value === "string" ? value.trim().length === 0 : value === undefined;
}

function parsePluginConfigValue(
  key: string,
  field: PluginUserConfigField,
  value: PluginConfigFormValue,
  t: Translate,
): JsonValue {
  const fieldType = normalizedPluginConfigType(field.type);
  if (fieldType === "boolean") {
    return value === true;
  }
  const textValue = String(value ?? "");
  if (fieldType === "number" || fieldType === "integer") {
    const trimmed = textValue.trim();
    if (trimmed.length === 0) {
      return "";
    }
    const numberValue = Number(trimmed);
    if (!Number.isFinite(numberValue)) {
      throw new Error(t("settingsPluginsInvalidNumber", { name: key }));
    }
    if (fieldType === "integer" && !Number.isInteger(numberValue)) {
      throw new Error(t("settingsPluginsInvalidNumber", { name: key }));
    }
    return numberValue;
  }
  if (fieldType === "object" || fieldType === "array" || fieldType === "json") {
    const trimmed = textValue.trim();
    if (trimmed.length === 0) {
      return "";
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isJsonValue(parsed)) {
        return parsed;
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? t("settingsPluginsInvalidJson", { message: error.message, name: key })
          : t("settingsPluginsInvalidJson", { message: "", name: key }),
      );
    }
    throw new Error(t("settingsPluginsInvalidJson", { message: "", name: key }));
  }
  return textValue;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function normalizedPluginConfigType(type: string | undefined): string {
  const normalized = type?.trim().toLowerCase() ?? "string";
  if (normalized === "bool") {
    return "boolean";
  }
  if (normalized === "int") {
    return "integer";
  }
  return normalized;
}

function pluginConfigFieldDescription(
  field: PluginUserConfigField,
  t: Translate,
): string | undefined {
  const details = [
    field.description?.trim() ?? "",
    field.sensitive === true ? t("settingsPluginsConfiguredSecret") : "",
  ].filter(Boolean);
  return details.length > 0 ? details.join(" ") : undefined;
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
  environmentRecords: readonly EnvironmentVariableRecord[] = [],
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
    transport: buildAgentRuntimeTransport(
      values,
      current?.transport,
      environmentRecords,
    ),
  };
  return {
    config,
    pathAgentId: current?.agent_id.trim() || agentId,
  };
}

function buildAgentRuntimeTransport(
  values: AgentRuntimeFormValues,
  current: AgentRuntimeTransportConfig | undefined,
  environmentRecords: readonly EnvironmentVariableRecord[] = [],
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
      env: bindingsFromForm(
        values.registry_env,
        existing?.env ?? [],
        environmentRecords,
      ),
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
    env: bindingsFromForm(
      values.stdio_env,
      existing?.env ?? [],
      environmentRecords,
    ),
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
  environmentRecords: readonly EnvironmentVariableRecord[] = [],
): AgentRuntimeBindingConfig[] {
  const existingByName = new Map(
    existing.map((binding) => [binding.name.trim(), binding]),
  );
  const environmentByName = environmentRecordsByName(environmentRecords);
  return (rows ?? [])
    .map((row) => {
      const name = row.name?.trim() ?? "";
      const value = row.value ?? "";
      const existingBinding = existingByName.get(name);
      const preserveConfigured =
        existingBinding?.configured === true && !value.trim();
      const environmentValue = environmentByName.get(name)?.value ?? "";
      return {
        configured: preserveConfigured,
        name,
        secret: preserveConfigured
          ? existingBinding?.secret === true
          : row.secret === true,
        value: preserveConfigured ? "" : value || environmentValue,
      };
    })
    .filter((binding) => binding.name);
}

function environmentRecordsFromCatalog(
  catalog: EnvironmentVariableCatalog | undefined,
): EnvironmentVariableRecord[] {
  const recordsByName = environmentRecordsByName([
    ...(catalog?.app ?? []),
    ...(catalog?.system ?? []),
  ]);
  return Array.from(recordsByName.values()).sort((left, right) =>
    left.key.localeCompare(right.key, undefined, { sensitivity: "base" }),
  );
}

function environmentRecordsByName(
  records: readonly EnvironmentVariableRecord[],
): Map<string, EnvironmentVariableRecord> {
  const recordsByName = new Map<string, EnvironmentVariableRecord>();
  for (const record of records) {
    const key = record.key.trim();
    if (key && !recordsByName.has(key)) {
      recordsByName.set(key, record);
    }
  }
  return recordsByName;
}

function environmentVariableOptions(
  records: readonly EnvironmentVariableRecord[],
  t: Translate,
) {
  return records.map((record) => ({
    label: `${record.key} · ${environmentScopeLabel(record, t)}`,
    value: record.key,
  }));
}

function environmentScopeLabel(record: EnvironmentVariableRecord, t: Translate): string {
  return record.scope === "system"
    ? t("settingsEnvironmentSystem")
    : t("settingsEnvironmentApp");
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
