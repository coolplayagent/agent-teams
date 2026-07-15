import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  PlugZap,
  RefreshCcw,
  Search,
  Settings2,
  TestTube2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  getW3Connector,
  listConnectors,
  saveW3Connector,
  testConnector,
} from "../../api/client";
import type {
  ConnectorAuthType,
  ConnectorCategory,
  ConnectorItem,
  ConnectorStatus,
  ConnectorSummary,
  ConnectorTestResult,
  W3ConnectorSaveRequest,
  W3ConnectorStatus,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";
import { RuntimeToolsSection } from "./RuntimeToolsSection";
import { GatewayConnectorEditor } from "./GatewayConnectorEditor";
import { GitHubSettingsSection } from "../settings/GitHubSettingsSection";
import { TriggerSettingsSection } from "../settings/TriggerSettingsSection";
import type { SystemSettingsPage } from "../settings/settingsNavigation";
import {
  connectorFallbackIcon,
  connectorPresentationAdapter,
  type ConnectorAction,
  type ConnectorConfiguration,
} from "./connectorPresentationAdapters";

type ConnectorFilter = "all" | ConnectorStatus;
type ConnectorSection = "connectors" | "tools";

const defaultSummary: ConnectorSummary = {
  connected: 0,
  disabled: 0,
  error: 0,
  needs_config: 0,
  total: 0,
};

interface ConnectorsViewProps {
  onOpenSettings: (page: SystemSettingsPage) => void;
}

export function ConnectorsView({
  onOpenSettings: _onOpenSettings,
}: ConnectorsViewProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConnectorFilter>("all");
  const [activeSection, setActiveSection] =
    useState<ConnectorSection>("connectors");
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(
    null,
  );
  const [latestResult, setLatestResult] = useState<ConnectorTestResult | null>(
    null,
  );
  const [w3ConfigOpen, setW3ConfigOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);

  const connectorsQuery = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
  });
  const testMutation = useMutation({
    mutationFn: (connectorId: string) => testConnector(connectorId),
    onSuccess: (result) => {
      setLatestResult(result);
      setSelectedConnectorId(result.connector_id);
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
  });
  const w3Query = useQuery({
    enabled: w3ConfigOpen,
    queryFn: getW3Connector,
    queryKey: ["connectors", "w3"],
  });
  const w3SaveMutation = useMutation({
    mutationFn: async (request: W3ConnectorSaveRequest) => {
      const result = await saveW3Connector(request);
      if (!result.ok) {
        throw new Error(result.message.trim() || t("connectorsSaveFailed"));
      }
      return result;
    },
    onSuccess: () => {
      setW3ConfigOpen(false);
      setConfigurationOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void queryClient.invalidateQueries({ queryKey: ["connectors", "w3"] });
    },
  });

  const items = connectorsQuery.data?.items ?? [];
  const summary = useMemo(
    () =>
      connectorsQuery.data === undefined
        ? defaultSummary
        : connectorSummaryForItems(items),
    [connectorsQuery.data, items],
  );
  const filteredItems = useMemo(
    () => filterConnectors(items, query, statusFilter),
    [items, query, statusFilter],
  );
  const selectedConnector = useMemo(
    () =>
      filteredItems.find((item) => item.connector_id === selectedConnectorId) ??
      null,
    [filteredItems, selectedConnectorId],
  );
  const testingConnectorId = testMutation.isPending
    ? testMutation.variables
    : null;

  useEffect(() => {
    if (
      selectedConnectorId !== null &&
      filteredItems.every((item) => item.connector_id !== selectedConnectorId)
    ) {
      setSelectedConnectorId(null);
    }
  }, [filteredItems, selectedConnectorId]);

  const openConnectorConfiguration = (item: ConnectorItem) => {
    const configuration = connectorPresentationAdapter(item)?.configuration;
    if (configuration === undefined) {
      setConfigurationOpen(false);
      setSelectedConnectorId(item.connector_id);
      return;
    }
    setSelectedConnectorId(item.connector_id);
    setConfigurationOpen(true);
    setW3ConfigOpen(configuration.kind === "w3");
  };

  return (
    <section
      aria-label={t("connectorsTitle")}
      className="at-connectors-view"
      data-testid="connectors-view"
    >
      <div className="at-connectors-toolbar">
        <div className="at-connectors-title">
          <span className="at-connectors-title-icon" aria-hidden="true">
            <PlugZap size={18} />
          </span>
          <div>
            <Typography.Title level={3}>
              {t("connectorsTitle")}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t("connectorsSubtitle")}
            </Typography.Text>
          </div>
        </div>
        <div className="at-connectors-toolbar-actions">
          <Tooltip title={t("connectorsRefresh")}>
            <Button
              aria-label={t("connectorsRefresh")}
              icon={<RefreshCcw size={15} />}
              loading={connectorsQuery.isFetching}
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: ["connectors"] })
              }
              type="text"
            />
          </Tooltip>
        </div>
      </div>

      <div className="at-connectors-content">
        <div className="at-connectors-overview">
          <Segmented
            className="at-connectors-section-tabs"
            onChange={(value) => setActiveSection(value as ConnectorSection)}
            options={[
              { label: t("connectorsTitle"), value: "connectors" },
              { label: t("connectorsRuntimeToolsTitle"), value: "tools" },
            ]}
            value={activeSection}
          />
          {activeSection === "connectors" ? (
            <div
              className="at-connectors-summary"
              aria-label={t("connectorsSummary")}
            >
              <SummaryCell
                label={t("connectorsTotal")}
                tone="neutral"
                value={summary.total}
              />
              <SummaryCell
                label={t("connectorsConnected")}
                tone="connected"
                value={summary.connected}
              />
              <SummaryCell
                label={t("connectorsNeedsConfig")}
                tone="needs_config"
                value={summary.needs_config}
              />
              <SummaryCell
                label={t("connectorsDisabled")}
                tone="disabled"
                value={summary.disabled}
              />
              <SummaryCell
                label={t("connectorsError")}
                tone="error"
                value={summary.error}
              />
            </div>
          ) : null}
        </div>
        {activeSection === "connectors" ? (
          <>
            <div className="at-connectors-controls">
              <Input
                allowClear
                aria-label={t("connectorsSearchLabel")}
                className="at-connectors-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("connectorsSearchPlaceholder")}
                prefix={<Search aria-hidden="true" size={15} />}
                type="search"
                value={query}
              />
              <Segmented
                onChange={(value) => setStatusFilter(value as ConnectorFilter)}
                options={[
                  { label: t("connectorsFilterAll"), value: "all" },
                  { label: t("connectorsConnected"), value: "connected" },
                  { label: t("connectorsNeedsConfig"), value: "needs_config" },
                  { label: t("connectorsDisabled"), value: "disabled" },
                  { label: t("connectorsError"), value: "error" },
                ]}
                value={statusFilter}
              />
            </div>

            {connectorsQuery.isError ? (
              <Alert
                message={t("connectorsLoadFailed")}
                showIcon
                type="error"
              />
            ) : null}
            {connectorsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 9 }} />
            ) : null}
            {!connectorsQuery.isLoading &&
            !connectorsQuery.isError &&
            filteredItems.length === 0 ? (
              <Empty
                description={
                  items.length === 0
                    ? t("connectorsEmpty")
                    : t("connectorsNoMatches")
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : null}
            {filteredItems.length > 0 ? (
              <div className="at-connectors-workbench">
                <div
                  className="at-connectors-card-list"
                  aria-label={t("connectorsList")}
                >
                  {filteredItems.map((item) => (
                    <ConnectorCard
                      item={item}
                      key={item.connector_id}
                      onAction={() => {
                        if (connectorActionFor(item) === "open") {
                          setW3ConfigOpen(false);
                          setConfigurationOpen(false);
                          setSelectedConnectorId(item.connector_id);
                          return;
                        }
                        openConnectorConfiguration(item);
                      }}
                      onSelect={() => {
                        setW3ConfigOpen(false);
                        setConfigurationOpen(false);
                        setSelectedConnectorId(item.connector_id);
                      }}
                      onTest={() => testMutation.mutate(item.connector_id)}
                      selected={item.connector_id === selectedConnectorId}
                      testError={
                        testMutation.isError &&
                        testMutation.variables === item.connector_id
                          ? testMutationError(
                              testMutation.error,
                              t("connectorsTestFailed"),
                            )
                          : null
                      }
                      testResult={
                        latestResult?.connector_id === item.connector_id
                          ? latestResult
                          : null
                      }
                      testing={testingConnectorId === item.connector_id}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <RuntimeToolsSection />
        )}
        <Modal
          centered
          className="at-connectors-modal"
          classNames={{ body: "at-scroll-region" }}
          destroyOnHidden
          footer={null}
          onCancel={() => {
            setSelectedConnectorId(null);
            setW3ConfigOpen(false);
            setConfigurationOpen(false);
          }}
          open={selectedConnector !== null}
          title={selectedConnector?.display_name}
          width={configurationOpen ? 1080 : 760}
        >
          {configurationOpen && selectedConnector !== null ? (
            <section className="at-connector-configuration">
              <header className="at-connector-configuration-toolbar">
                <Button
                  aria-label={`${t("settingsBack")} ${t(
                    "connectorsDetailLabel",
                    { connector: selectedConnector.display_name },
                  )}`}
                  icon={<ArrowLeft size={15} />}
                  onClick={() => {
                    setConfigurationOpen(false);
                    setW3ConfigOpen(false);
                  }}
                  size="small"
                  type="text"
                >
                  {t("settingsBack")}
                </Button>
                <Typography.Text type="secondary">
                  {t("connectorsConfigure")}
                </Typography.Text>
              </header>
              <ConnectorConfigurationPanel
                configuration={
                  connectorPresentationAdapter(selectedConnector)?.configuration
                }
                onSaved={() => {
                  setConfigurationOpen(false);
                  setW3ConfigOpen(false);
                }}
                onW3Save={(request) => w3SaveMutation.mutate(request)}
                t={t}
                w3ConfigError={w3Query.error ?? w3SaveMutation.error}
                w3ConfigLoading={w3Query.isLoading}
                w3ConfigSaving={w3SaveMutation.isPending}
                w3Status={w3Query.data}
              />
            </section>
          ) : (
            <ConnectorDetail
              item={selectedConnector}
              language={language}
              onAction={openConnectorConfiguration}
              onTest={(connectorId) => testMutation.mutate(connectorId)}
              t={t}
              testError={
                selectedConnector !== null &&
                testMutation.isError &&
                testMutation.variables === selectedConnector.connector_id
                  ? testMutationError(
                      testMutation.error,
                      t("connectorsTestFailed"),
                    )
                  : null
              }
              testResult={
                selectedConnector !== null &&
                latestResult?.connector_id === selectedConnector.connector_id
                  ? latestResult
                  : null
              }
              testingConnectorId={testingConnectorId}
            />
          )}
        </Modal>
      </div>
    </section>
  );
}

function SummaryCell({
  label,
  tone,
  value,
}: {
  label: string;
  tone: ConnectorStatus | "neutral";
  value: number;
}) {
  return (
    <div className={`at-connectors-summary-cell is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConnectorCard({
  item,
  onAction,
  onSelect,
  onTest,
  selected,
  testError,
  testResult,
  testing,
  t,
}: {
  item: ConnectorItem;
  onAction: () => void;
  onSelect: () => void;
  onTest: () => void;
  selected: boolean;
  testError: string | null;
  testResult: ConnectorTestResult | null;
  testing: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const action = connectorActionFor(item);
  return (
    <article
      className={
        selected ? "at-connectors-card is-selected" : "at-connectors-card"
      }
      data-testid={`connector-card-${item.connector_id}`}
    >
      <button
        aria-label={t("connectorsOpenDetails", {
          connector: item.display_name,
        })}
        aria-pressed={selected}
        className="at-connectors-card-select"
        onClick={onSelect}
        type="button"
      >
        <span aria-hidden="true" className="at-connectors-card-icon">
          {connectorIcon(item)}
        </span>
        <span className="at-connectors-card-body">
          <strong>{item.display_name}</strong>
          <span>{item.description}</span>
          {item.last_error ? (
            <em title={item.last_error}>{item.last_error}</em>
          ) : null}
        </span>
      </button>
      <div className="at-connectors-card-footer">
        <div className="at-connectors-card-meta">
          <span className={`at-connectors-status is-${item.status}`}>
            <span aria-hidden="true" />
            {connectorStatusLabel(item.status, t)}
          </span>
          <span className="at-connectors-account-count">
            {t("connectorsAccountsValue", {
              enabled: item.enabled_count,
              total: item.account_count,
            })}
          </span>
        </div>
        <div className="at-connectors-card-actions">
          {action !== null ? (
            <Button
              className="at-connectors-card-action"
              data-testid={`connector-action-${item.connector_id}`}
              icon={
                action === "configure" ? <Settings2 size={14} /> : undefined
              }
              onClick={onAction}
              size="small"
              type="link"
            >
              {t(
                action === "configure"
                  ? "connectorsConfigure"
                  : "connectorsOpen",
              )}
            </Button>
          ) : null}
          <Tooltip title={t("connectorsTestTooltip")}>
            <Button
              aria-label={t("connectorsTestAria", {
                connector: item.display_name,
              })}
              icon={<TestTube2 size={14} />}
              loading={testing}
              onClick={onTest}
              size="small"
              type="link"
            >
              {t("connectorsTest")}
            </Button>
          </Tooltip>
        </div>
      </div>
      {testError !== null ? (
        <div className="at-connectors-card-result is-error" role="alert">
          {testError}
        </div>
      ) : testResult !== null ? (
        <div
          className={
            testResult.ok
              ? "at-connectors-card-result is-success"
              : "at-connectors-card-result is-warning"
          }
          role="status"
        >
          {testResult.message}
        </div>
      ) : null}
    </article>
  );
}

function ConnectorDetail({
  item,
  language,
  onAction,
  onTest,
  t,
  testError,
  testResult,
  testingConnectorId,
}: {
  item: ConnectorItem | null;
  language: Language;
  onAction: (item: ConnectorItem) => void;
  onTest: (connectorId: string) => void;
  t: ReturnType<typeof useTranslations>;
  testError: string | null;
  testResult: ConnectorTestResult | null;
  testingConnectorId: string | null | undefined;
}) {
  if (item === null) {
    return (
      <aside className="at-connectors-detail">
        <Empty
          description={t("connectorsSelectConnector")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </aside>
    );
  }

  const testing = testingConnectorId === item.connector_id;
  return (
    <aside
      aria-label={t("connectorsDetailLabel", { connector: item.display_name })}
      className="at-connectors-detail"
      data-testid={`connector-detail-${item.connector_id}`}
    >
      <div className="at-connectors-detail-header">
        <div className="at-connectors-detail-title">
          <span aria-hidden="true" className="at-connectors-card-icon">
            {connectorIcon(item)}
          </span>
          <div>
            <Typography.Title level={4}>{item.display_name}</Typography.Title>
            <Typography.Text type="secondary">
              {item.description}
            </Typography.Text>
          </div>
        </div>
        <div className="at-connectors-detail-actions">
          {connectorSettingsAvailable(item) ? (
            <Button
              icon={<Settings2 size={15} />}
              onClick={() => onAction(item)}
              size="small"
              type="default"
            >
              {t(
                connectorPresentationAdapter(item)?.actionLabel ??
                  "appSettings",
              )}
            </Button>
          ) : null}
          <Tooltip title={t("connectorsTestTooltip")}>
            <Button
              aria-label={t("connectorsTestAria", {
                connector: item.display_name,
              })}
              icon={<TestTube2 size={15} />}
              loading={testing}
              onClick={() => onTest(item.connector_id)}
              size="small"
            >
              {t("connectorsTest")}
            </Button>
          </Tooltip>
        </div>
      </div>

      {item.last_error ? (
        <Alert
          className="at-connectors-detail-error"
          message={item.last_error}
          showIcon
          type="warning"
        />
      ) : null}

      {testError !== null ? (
        <div className="at-connectors-card-result is-error" role="alert">
          {testError}
        </div>
      ) : testResult !== null ? (
        <div
          className={
            testResult.ok
              ? "at-connectors-card-result is-success"
              : "at-connectors-card-result is-warning"
          }
          role="status"
        >
          {testResult.message}
        </div>
      ) : null}

      <dl className="at-connectors-detail-facts">
        <Fact
          label={t("connectorsColumnStatus")}
          value={connectorStatusLabel(item.status, t)}
        />
        <Fact
          label={t("connectorsColumnAccounts")}
          value={t("connectorsAccountsValue", {
            enabled: item.enabled_count,
            total: item.account_count,
          })}
        />
        <Fact
          label={t("connectorsColumnAuth")}
          value={connectorAuthLabel(item.auth_type, t)}
        />
        <Fact
          label={t("connectorsCategory")}
          value={connectorCategoryLabel(item.category, t)}
        />
        <Fact
          label={t("connectorsColumnActivity")}
          value={formatDateTime(
            item.last_activity_at,
            language,
            t("connectorsNever"),
          )}
        />
      </dl>

      <section className="at-connectors-detail-section">
        <Typography.Text className="at-connectors-detail-section-title">
          {t("connectorsColumnCapabilities")}
        </Typography.Text>
        <div className="at-connectors-capabilities">
          {item.capabilities.length === 0 ? (
            <span className="at-connectors-muted">
              {t("connectorsValueNone")}
            </span>
          ) : (
            capabilityLabels(item.capabilities).map((capability) => (
              <Tag key={capability}>{capability}</Tag>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

function ConnectorConfigurationPanel({
  configuration,
  onSaved,
  onW3Save,
  t,
  w3ConfigError,
  w3ConfigLoading,
  w3ConfigSaving,
  w3Status,
}: {
  configuration: ConnectorConfiguration | undefined;
  onSaved: () => void;
  onW3Save: (request: W3ConnectorSaveRequest) => void;
  t: ReturnType<typeof useTranslations>;
  w3ConfigError: Error | null;
  w3ConfigLoading: boolean;
  w3ConfigSaving: boolean;
  w3Status: W3ConnectorStatus | undefined;
}) {
  if (configuration === undefined) {
    return null;
  }
  if (configuration.kind === "gateway") {
    return (
      <GatewayConnectorEditor
        onSaved={onSaved}
        provider={configuration.provider}
      />
    );
  }
  if (configuration.kind === "github") {
    return <GitHubSettingsSection embedded onSaved={onSaved} />;
  }
  if (configuration.kind === "trigger") {
    return (
      <TriggerSettingsSection
        embedded
        onSaved={onSaved}
        provider={configuration.provider}
      />
    );
  }
  return (
    <W3ConnectorEditor
      error={w3ConfigError}
      loading={w3ConfigLoading}
      onSave={onW3Save}
      saving={w3ConfigSaving}
      status={w3Status}
      t={t}
    />
  );
}

function W3ConnectorEditor({
  error,
  loading,
  onSave,
  saving,
  status,
  t,
}: {
  error: Error | null;
  loading: boolean;
  onSave: (request: W3ConnectorSaveRequest) => void;
  saving: boolean;
  status: W3ConnectorStatus | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setUsername(status?.username ?? "");
  }, [status?.username]);

  return (
    <section className="at-connectors-detail-section at-connectors-w3-editor">
      {error !== null ? (
        <Alert message={error.message} showIcon type="error" />
      ) : null}
      <label>
        {t("connectorsConfigureUsername")}
        <Input
          aria-label={t("connectorsConfigureUsername")}
          disabled={loading || saving}
          onChange={(event) => setUsername(event.target.value)}
          value={username}
        />
      </label>
      <label>
        {t("connectorsConfigurePassword")}
        <Input.Password
          aria-label={t("connectorsConfigurePassword")}
          disabled={loading || saving}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={
            status?.has_password
              ? t("connectorsConfigurePasswordSaved")
              : undefined
          }
          value={password}
        />
      </label>
      <div className="at-connectors-detail-actions">
        <Button
          disabled={loading || !username.trim()}
          loading={saving}
          onClick={() =>
            onSave({
              password: password.trim() || null,
              username: username.trim(),
            })
          }
          size="small"
          type="primary"
        >
          {t("connectorsConfigureSave")}
        </Button>
      </div>
    </section>
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

function connectorActionFor(item: ConnectorItem): ConnectorAction | null {
  const adapter = connectorPresentationAdapter(item);
  if (adapter !== null) {
    return adapter.action;
  }
  if (item.account_count > 0) {
    return "open";
  }
  return connectorSettingsAvailable(item) ? "configure" : null;
}

function connectorSettingsAvailable(item: ConnectorItem): boolean {
  return connectorPresentationAdapter(item) !== null;
}

function filterConnectors(
  items: ConnectorItem[],
  query: string,
  statusFilter: ConnectorFilter,
): ConnectorItem[] {
  const normalizedQuery = normalizeSearchText(query);
  return items
    .filter((item) => statusFilter === "all" || item.status === statusFilter)
    .filter((item) => {
      if (!normalizedQuery) {
        return true;
      }
      return connectorSearchText(item).includes(normalizedQuery);
    });
}

function connectorSummaryForItems(items: ConnectorItem[]): ConnectorSummary {
  const summary: ConnectorSummary = {
    ...defaultSummary,
    total: items.length,
  };
  items.forEach((item) => {
    summary[item.status] += 1;
  });
  return summary;
}

function connectorSearchText(item: ConnectorItem): string {
  return normalizeSearchText(
    [
      item.auth_type,
      item.category,
      item.connector_id,
      item.description,
      item.display_name,
      item.provider,
      item.status,
      ...item.capabilities,
    ].join(" "),
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function capabilityLabels(capabilities: string[]): string[] {
  const visible = capabilities
    .slice(0, 4)
    .map((capability) => capability.split("_").filter(Boolean).join(" "));
  const remaining = capabilities.length - visible.length;
  if (remaining > 0) {
    visible.push(`+${remaining}`);
  }
  return visible;
}

function connectorStatusLabel(
  status: ConnectorStatus,
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === "connected") {
    return t("connectorsConnected");
  }
  if (status === "disabled") {
    return t("connectorsDisabled");
  }
  if (status === "error") {
    return t("connectorsError");
  }
  return t("connectorsNeedsConfig");
}

function connectorAuthLabel(
  authType: ConnectorAuthType,
  t: ReturnType<typeof useTranslations>,
): string {
  if (authType === "api_key") {
    return t("connectorsAuthApiKey");
  }
  if (authType === "api_token") {
    return t("connectorsAuthApiToken");
  }
  if (authType === "cli") {
    return t("connectorsAuthCli");
  }
  if (authType === "oauth") {
    return t("connectorsAuthOauth");
  }
  if (authType === "qr_login") {
    return t("connectorsAuthQrLogin");
  }
  if (authType === "username_password") {
    return t("connectorsAuthUsernamePassword");
  }
  return t("connectorsAuthWebhook");
}

function connectorCategoryLabel(
  category: ConnectorCategory,
  t: ReturnType<typeof useTranslations>,
): string {
  if (category === "auth") {
    return t("connectorsCategoryAuth");
  }
  if (category === "development") {
    return t("connectorsCategoryDevelopment");
  }
  if (category === "models") {
    return t("connectorsCategoryModels");
  }
  return t("connectorsCategoryIm");
}

function connectorIcon(item: ConnectorItem): ReactNode {
  return (
    connectorPresentationAdapter(item)?.icon ?? connectorFallbackIcon(item)
  );
}

function formatDateTime(
  value: string | null | undefined,
  language: Language,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return new Intl.DateTimeFormat(language, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function testMutationError(error: Error | null, fallback: string): string {
  if (error === null || !error.message.trim()) {
    return fallback;
  }
  return error.message;
}
