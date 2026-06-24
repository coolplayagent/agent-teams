import {
  Alert,
  Button,
  Empty,
  Input,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlugZap, RefreshCcw, Search, TestTube2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listConnectors, testConnector } from "../../api/client";
import type {
  ConnectorAuthType,
  ConnectorCategory,
  ConnectorItem,
  ConnectorStatus,
  ConnectorSummary,
  ConnectorTestResult,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";

type ConnectorFilter = "all" | ConnectorStatus;

const defaultSummary: ConnectorSummary = {
  connected: 0,
  disabled: 0,
  error: 0,
  needs_config: 0,
  total: 0,
};

export function ConnectorsView() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConnectorFilter>("all");
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<ConnectorTestResult | null>(
    null,
  );

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

  const items = connectorsQuery.data?.items ?? [];
  const summary = connectorsQuery.data?.summary ?? defaultSummary;
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
    if (filteredItems.length === 0) {
      if (selectedConnectorId !== null) {
        setSelectedConnectorId(null);
      }
      return;
    }
    if (
      selectedConnectorId === null ||
      filteredItems.every((item) => item.connector_id !== selectedConnectorId)
    ) {
      setSelectedConnectorId(filteredItems[0].connector_id);
    }
  }, [filteredItems, selectedConnectorId]);

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
            <Typography.Title level={3}>{t("connectorsTitle")}</Typography.Title>
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
        <div className="at-connectors-summary" aria-label={t("connectorsSummary")}>
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
          <SummaryCell label={t("connectorsError")} tone="error" value={summary.error} />
        </div>

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
          <Alert message={t("connectorsLoadFailed")} showIcon type="error" />
        ) : null}
        {testMutation.isError ? (
          <Alert
            message={t("connectorsTestFailed")}
            showIcon
            type="error"
            description={testMutationError(testMutation.error, t("connectorsTestFailed"))}
          />
        ) : null}
        {latestResult !== null ? (
          <Alert
            className="at-connectors-test-result"
            message={t(latestResult.ok ? "connectorsTestOk" : "connectorsTestAttention", {
              connector: latestResult.connector_id,
            })}
            showIcon
            type={latestResult.ok ? "success" : "warning"}
            description={latestResult.message}
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
            <div className="at-connectors-card-list" aria-label={t("connectorsList")}>
              {filteredItems.map((item) => (
                <ConnectorCard
                  item={item}
                  key={item.connector_id}
                  onSelect={() => setSelectedConnectorId(item.connector_id)}
                  selected={item.connector_id === selectedConnectorId}
                  t={t}
                />
              ))}
            </div>
            <ConnectorDetail
              item={selectedConnector}
              language={language}
              onTest={(connectorId) => testMutation.mutate(connectorId)}
              t={t}
              testingConnectorId={testingConnectorId}
            />
          </div>
        ) : null}
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
  onSelect,
  selected,
  t,
}: {
  item: ConnectorItem;
  onSelect: () => void;
  selected: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <button
      aria-label={t("connectorsOpenDetails", { connector: item.display_name })}
      aria-pressed={selected}
      className={selected ? "at-connectors-card is-selected" : "at-connectors-card"}
      data-testid={`connector-card-${item.connector_id}`}
      onClick={onSelect}
      type="button"
    >
      <span aria-hidden="true" className="at-connectors-card-icon">
        {connectorInitial(item)}
      </span>
      <span className="at-connectors-card-body">
        <strong>{item.display_name}</strong>
        <span>{item.description}</span>
        {item.last_error ? <em title={item.last_error}>{item.last_error}</em> : null}
      </span>
      <span className="at-connectors-card-footer">
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
      </span>
    </button>
  );
}

function ConnectorDetail({
  item,
  language,
  onTest,
  t,
  testingConnectorId,
}: {
  item: ConnectorItem | null;
  language: Language;
  onTest: (connectorId: string) => void;
  t: ReturnType<typeof useTranslations>;
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
            {connectorInitial(item)}
          </span>
          <div>
            <Typography.Title level={4}>{item.display_name}</Typography.Title>
            <Typography.Text type="secondary">{item.description}</Typography.Text>
          </div>
        </div>
        <Tooltip title={t("connectorsTestTooltip")}>
          <Button
            aria-label={t("connectorsTestAria", {
              connector: item.display_name,
            })}
            icon={<TestTube2 size={15} />}
            loading={testing}
            onClick={() => onTest(item.connector_id)}
          >
            {t("connectorsTest")}
          </Button>
        </Tooltip>
      </div>

      {item.last_error ? (
        <Alert
          className="at-connectors-detail-error"
          message={item.last_error}
          showIcon
          type="warning"
        />
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
          value={formatDateTime(item.last_activity_at, language, t("connectorsNever"))}
        />
      </dl>

      <section className="at-connectors-detail-section">
        <Typography.Text className="at-connectors-detail-section-title">
          {t("connectorsColumnCapabilities")}
        </Typography.Text>
        <div className="at-connectors-capabilities">
          {item.capabilities.length === 0 ? (
            <span className="at-connectors-muted">{t("connectorsValueNone")}</span>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
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
  const visible = capabilities.slice(0, 4).map((capability) =>
    capability
      .split("_")
      .filter(Boolean)
      .join(" "),
  );
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

function connectorInitial(item: ConnectorItem): string {
  const source = item.display_name.trim() || item.connector_id.trim();
  return source.slice(0, 2).toUpperCase();
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
