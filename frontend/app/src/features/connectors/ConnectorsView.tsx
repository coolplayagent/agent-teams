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
import { useMemo, useState } from "react";

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
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
  });

  const items = connectorsQuery.data?.items ?? [];
  const summary = connectorsQuery.data?.summary ?? defaultSummary;
  const filteredItems = useMemo(
    () => filterConnectors(items, query, statusFilter),
    [items, query, statusFilter],
  );
  const testingConnectorId = testMutation.isPending
    ? testMutation.variables
    : null;

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
          <div className="at-connectors-table-frame">
            <table className="at-connectors-table">
              <colgroup>
                <col className="at-connectors-col-main" />
                <col className="at-connectors-col-status" />
                <col className="at-connectors-col-accounts" />
                <col className="at-connectors-col-auth" />
                <col className="at-connectors-col-capabilities" />
                <col className="at-connectors-col-activity" />
                <col className="at-connectors-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t("connectorsColumnConnector")}</th>
                  <th scope="col">{t("connectorsColumnStatus")}</th>
                  <th scope="col">{t("connectorsColumnAccounts")}</th>
                  <th scope="col">{t("connectorsColumnAuth")}</th>
                  <th scope="col">{t("connectorsColumnCapabilities")}</th>
                  <th scope="col">{t("connectorsColumnActivity")}</th>
                  <th scope="col">{t("connectorsColumnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ConnectorRow
                    item={item}
                    key={item.connector_id}
                    language={language}
                    onTest={() => testMutation.mutate(item.connector_id)}
                    t={t}
                    testing={testingConnectorId === item.connector_id}
                  />
                ))}
              </tbody>
            </table>
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

function ConnectorRow({
  item,
  language,
  onTest,
  t,
  testing,
}: {
  item: ConnectorItem;
  language: Language;
  onTest: () => void;
  t: ReturnType<typeof useTranslations>;
  testing: boolean;
}) {
  return (
    <tr data-testid={`connector-row-${item.connector_id}`}>
      <td>
        <div className="at-connectors-main-cell">
          <strong>{item.display_name}</strong>
          <span>{item.description}</span>
          {item.last_error ? (
            <em title={item.last_error}>{item.last_error}</em>
          ) : null}
        </div>
      </td>
      <td>
        <span className={`at-connectors-status is-${item.status}`}>
          <span aria-hidden="true" />
          {connectorStatusLabel(item.status, t)}
        </span>
      </td>
      <td>
        <span className="at-connectors-account-count">
          {t("connectorsAccountsValue", {
            enabled: item.enabled_count,
            total: item.account_count,
          })}
        </span>
      </td>
      <td>
        <div className="at-connectors-meta-cell">
          <span>{connectorAuthLabel(item.auth_type, t)}</span>
          <small>{connectorCategoryLabel(item.category, t)}</small>
        </div>
      </td>
      <td>
        <div className="at-connectors-capabilities">
          {item.capabilities.length === 0 ? (
            <span className="at-connectors-muted">{t("connectorsValueNone")}</span>
          ) : (
            capabilityLabels(item.capabilities).map((capability) => (
              <Tag key={capability}>{capability}</Tag>
            ))
          )}
        </div>
      </td>
      <td>
        <span className="at-connectors-muted">
          {formatDateTime(item.last_activity_at, language, t("connectorsNever"))}
        </span>
      </td>
      <td>
        <Tooltip title={t("connectorsTestTooltip")}>
          <Button
            aria-label={t("connectorsTestAria", {
              connector: item.display_name,
            })}
            icon={<TestTube2 size={15} />}
            loading={testing}
            onClick={onTest}
            size="small"
          >
            {t("connectorsTest")}
          </Button>
        </Tooltip>
      </td>
    </tr>
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
