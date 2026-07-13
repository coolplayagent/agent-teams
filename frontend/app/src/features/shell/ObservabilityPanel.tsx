import {
  Alert,
  Empty,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getObservabilityBreakdowns,
  getObservabilityOverview,
  jsonRecord,
} from "../../api/client";
import type {
  JsonValue,
  ObservabilityGatewayBreakdownRow,
  ObservabilityRoleBreakdownRow,
  ObservabilityToolBreakdownRow,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SpecLineagePanel } from "./SpecLineagePanel";
import { ObservabilityTrends } from "./ObservabilityTrends";

interface ObservabilityPanelProps {
  sessionId: string | null;
}

export function ObservabilityPanel({ sessionId }: ObservabilityPanelProps) {
  const t = useTranslations();
  const copy = observabilityCopy(t);
  const [scope, setScope] = useState<"global" | "session">("global");
  const effectiveScope = scope === "session" && sessionId === null ? "global" : scope;
  const scopeId = effectiveScope === "session" ? sessionId ?? "" : "";
  const overviewQuery = useQuery({
    queryKey: ["observability", "overview", effectiveScope, scopeId],
    queryFn: () => getObservabilityOverview(effectiveScope, scopeId),
  });
  const breakdownsQuery = useQuery({
    queryKey: ["observability", "breakdowns", effectiveScope, scopeId],
    queryFn: () => getObservabilityBreakdowns(effectiveScope, scopeId),
  });

  const kpis = jsonRecord(overviewQuery.data?.kpis);
  const hasOverviewMetrics = Object.keys(kpis).length > 0;
  const hasGatewayMetrics = [
    kpis.gateway_calls,
    kpis.gateway_failure_rate,
    kpis.gateway_avg_duration_ms,
    kpis.gateway_prompt_avg_start_ms,
    kpis.gateway_prompt_avg_first_update_ms,
    kpis.gateway_mcp_calls,
    kpis.gateway_cold_start_calls,
  ].some(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const rows = toolRowsFromContract(breakdownsQuery.data?.rows);
  const roleRows = roleRowsFromContract(breakdownsQuery.data?.role_rows, copy);
  const gatewayRows = gatewayRowsFromContract(breakdownsQuery.data?.gateway_rows);
  const gatewaySummary = gatewaySummaryFromRows(gatewayRows);
  const showGatewayMetrics =
    overviewQuery.isLoading ||
    hasGatewayMetrics ||
    gatewayRows.length > 0;

  return (
    <section className="at-surface-view">
      <div className="at-surface-toolbar">
        <div>
          <Typography.Title level={3}>{t("observabilityTitle")}</Typography.Title>
          <Typography.Text type="secondary">
            {overviewQuery.data?.updated_at ?? t("observabilityLast24Hours")}
          </Typography.Text>
        </div>
        <Segmented
          onChange={(value) => setScope(value as "global" | "session")}
          options={[
            { label: t("observabilityGlobal"), value: "global" },
            { disabled: sessionId === null, label: t("observabilitySession"), value: "session" },
          ]}
          value={effectiveScope}
        />
      </div>
      {overviewQuery.isError || breakdownsQuery.isError ? (
        <Alert message={t("observabilityError")} type="error" showIcon />
      ) : null}
      {overviewQuery.isLoading && !hasOverviewMetrics ? (
        <Space
          className="at-stat-grid"
          data-testid="observability-overview-loading"
          size={12}
          wrap
        >
          {Array.from({ length: 15 }, (_, index) => (
            <LoadingStatCard key={`overview-loading-${index}`} />
          ))}
        </Space>
      ) : !hasOverviewMetrics ? (
        <Empty description={t("observabilityNoMetrics")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space className="at-stat-grid" size={12} wrap>
          {stat(t("observabilitySteps"), kpis.steps)}
          {stat(t("observabilityInputTokens"), kpis.input_tokens)}
          {stat(copy.cachedInputTokens, kpis.cached_input_tokens, "number", "cached_input_tokens")}
          {stat(
            copy.uncachedInputTokens,
            kpis.uncached_input_tokens,
            "number",
            "uncached_input_tokens",
          )}
          {stat(t("observabilityOutputTokens"), kpis.output_tokens)}
          {stat(t("observabilityToolCalls"), kpis.tool_calls)}
          {stat(copy.cachedRatio, kpis.cached_token_ratio, "percent", "cached_token_ratio")}
          {stat(t("observabilityToolSuccess"), kpis.tool_success_rate, "percent")}
          {stat(t("observabilityAvgToolMs"), kpis.tool_avg_duration_ms)}
          {stat(copy.retrievalSearches, kpis.retrieval_searches, "number", "retrieval_searches")}
          {stat(
            copy.retrievalFailureRate,
            kpis.retrieval_failure_rate,
            "percent",
            "retrieval_failure_rate",
          )}
          {stat(
            copy.avgRetrievalMs,
            kpis.retrieval_avg_duration_ms,
            "number",
            "retrieval_avg_duration_ms",
          )}
          {stat(
            copy.retrievalDocumentCount,
            kpis.retrieval_document_count,
            "number",
            "retrieval_document_count",
          )}
          {stat(copy.skillCalls, kpis.skill_calls, "number", "skill_calls")}
          {stat(copy.mcpCalls, kpis.mcp_calls, "number", "mcp_calls")}
        </Space>
      )}
      <ObservabilityTrends
        isError={overviewQuery.isError}
        isLoading={overviewQuery.isLoading}
        t={t}
        trendValues={overviewQuery.data?.trends}
      />
      <section
        className="at-observability-section"
        data-observability-section="tools"
      >
        <Typography.Title level={4}>{copy.toolBreakdown}</Typography.Title>
        <Table
          className="at-breakdown-table"
          columns={[
            { dataIndex: "name", key: "name", title: copy.tool },
            { dataIndex: "source", key: "source", title: copy.source },
            { dataIndex: "calls", key: "calls", title: t("observabilityCalls") },
            {
              dataIndex: "success",
              key: "success",
              title: t("observabilitySuccess"),
            },
            {
              dataIndex: "duration",
              key: "duration",
              render: formatDurationMs,
              title: t("observabilityAvgMs"),
            },
          ]}
          dataSource={rows}
          loading={breakdownsQuery.isLoading}
          locale={{
            emptyText: breakdownsQuery.isLoading ? null : t("observabilityNoMetrics"),
          }}
          pagination={false}
          rowKey="key"
          size="small"
        />
      </section>
      {roleRows.length > 0 ? (
        <section
          className="at-observability-section"
          data-observability-section="roles"
        >
          <Typography.Title level={4}>{copy.roleBreakdown}</Typography.Title>
          <Table
            className="at-breakdown-table"
            columns={[
              { dataIndex: "role", key: "role", title: copy.role },
              {
                dataIndex: "inputTokens",
                key: "inputTokens",
                render: formatCount,
                title: t("observabilityInputTokens"),
              },
              {
                dataIndex: "outputTokens",
                key: "outputTokens",
                render: formatCount,
                title: t("observabilityOutputTokens"),
              },
              {
                dataIndex: "toolCalls",
                key: "toolCalls",
                render: formatCount,
                title: t("observabilityToolCalls"),
              },
              {
                dataIndex: "toolSuccess",
                key: "toolSuccess",
                title: t("observabilityToolSuccess"),
              },
            ]}
            dataSource={roleRows}
            pagination={false}
            rowKey="key"
            size="small"
          />
        </section>
      ) : null}
      {showGatewayMetrics ? (
        <section
          className="at-observability-section"
          data-observability-section="gateway-signals"
        >
          <Typography.Title level={4}>
            {t("observabilityGatewaySignals")}
          </Typography.Title>
          {overviewQuery.isLoading && !hasOverviewMetrics ? (
            <Space
              className="at-stat-grid"
              data-testid="observability-gateway-loading"
              size={12}
              wrap
            >
              {Array.from({ length: 7 }, (_, index) => (
                <LoadingStatCard key={`gateway-loading-${index}`} />
              ))}
            </Space>
          ) : (
            <Space className="at-stat-grid" size={12} wrap>
              {stat(
                t("observabilityGatewayCalls"),
                kpis.gateway_calls,
                "number",
                "gateway_calls",
              )}
              {stat(
                copy.gatewayFailureRate,
                kpis.gateway_failure_rate,
                "percent",
                "gateway_failure_rate",
              )}
              {stat(
                copy.gatewayAvgDurationMs,
                kpis.gateway_avg_duration_ms,
                "number",
                "gateway_avg_duration_ms",
              )}
              {stat(
                copy.gatewayPromptStartMs,
                kpis.gateway_prompt_avg_start_ms,
                "number",
                "gateway_prompt_avg_start_ms",
              )}
              {stat(
                t("observabilityGatewayFirstUpdateMs"),
                kpis.gateway_prompt_avg_first_update_ms,
                "number",
                "gateway_prompt_avg_first_update_ms",
              )}
              {stat(
                copy.gatewayMcpCalls,
                kpis.gateway_mcp_calls,
                "number",
                "gateway_mcp_calls",
              )}
              {stat(
                t("observabilityGatewayColdStarts"),
                kpis.gateway_cold_start_calls,
                "number",
                "gateway_cold_start_calls",
              )}
            </Space>
          )}
          <div data-observability-section="gateway-breakdowns">
            <Typography.Title level={4}>
              {t("observabilityGatewayBreakdown")}
            </Typography.Title>
            {gatewayRows.length > 0 ? (
              <Space className="at-stat-grid" size={12} wrap>
                {stat(
                  t("observabilityGatewayCalls"),
                  gatewaySummary.calls,
                  "number",
                  undefined,
                  "gateway-breakdown-calls",
                )}
                {stat(
                  t("observabilityGatewayLatency"),
                  gatewaySummary.duration,
                  "number",
                  undefined,
                  "gateway-breakdown-duration",
                )}
                {stat(
                  t("observabilityGatewayColdStarts"),
                  gatewaySummary.coldStarts,
                  "number",
                  undefined,
                  "gateway-breakdown-cold-starts",
                )}
              </Space>
            ) : null}
            <Table
              className="at-breakdown-table"
              columns={[
                {
                  dataIndex: "operation",
                  key: "operation",
                  title: t("observabilityGatewayOperation"),
                },
                {
                  dataIndex: "phase",
                  key: "phase",
                  title: t("observabilityGatewayPhase"),
                },
                {
                  dataIndex: "transport",
                  key: "transport",
                  title: t("observabilityGatewayTransport"),
                },
                {
                  dataIndex: "calls",
                  key: "calls",
                  title: t("observabilityCalls"),
                },
                {
                  dataIndex: "success",
                  key: "success",
                  title: t("observabilitySuccess"),
                },
                {
                  dataIndex: "duration",
                  key: "duration",
                  render: formatDurationMs,
                  title: t("observabilityGatewayLatency"),
                },
                {
                  dataIndex: "coldStarts",
                  key: "coldStarts",
                  title: t("observabilityGatewayColdStarts"),
                },
              ]}
              dataSource={gatewayRows}
              loading={breakdownsQuery.isLoading}
              locale={{
                emptyText: breakdownsQuery.isLoading ? null : t("observabilityNoMetrics"),
              }}
              pagination={false}
              rowKey="key"
              size="small"
            />
          </div>
        </section>
      ) : null}
      <SpecLineagePanel sessionId={sessionId} />
    </section>
  );
}

function LoadingStatCard() {
  return (
    <div className="at-stat" data-testid="observability-loading-stat">
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: "70%" }} />
    </div>
  );
}

function stat(
  label: string,
  value: JsonValue | undefined,
  mode: "number" | "percent" = "number",
  metricId?: string,
  chartId?: string,
) {
  const hasValue = typeof value === "number" && Number.isFinite(value);
  const numeric = hasValue ? value : 0;
  return (
    <div
      className="at-stat"
      data-observability-chart={chartId}
      data-observability-metric={metricId}
      key={label}
    >
      <Statistic
        title={label}
        value={hasValue ? (mode === "percent" ? numeric * 100 : numeric) : "—"}
        precision={mode === "percent" ? 1 : 0}
        suffix={mode === "percent" && hasValue ? "%" : undefined}
      />
    </div>
  );
}

interface BreakdownRow {
  key: string;
  name: string;
  source: string;
  calls: number;
  success: string;
  duration: number;
}

interface RoleBreakdownRow {
  inputTokens: number;
  key: string;
  outputTokens: number;
  role: string;
  toolCalls: number;
  toolSuccess: string;
}

interface GatewayBreakdownRow {
  key: string;
  operation: string;
  phase: string;
  transport: string;
  calls: number;
  success: string;
  duration: number;
  coldStarts: number;
}

function toolRowsFromContract(
  value: ObservabilityToolBreakdownRow[] | undefined,
): BreakdownRow[] {
  return (value ?? []).map((row, index) => ({
    calls: finiteNumber(row.calls),
    duration: finiteNumber(row.avg_duration_ms),
    key: `${row.tool_name}-${row.tool_source}-${row.mcp_server}-${index}`,
    name: row.tool_name,
    source: [row.tool_source, row.mcp_server].filter(Boolean).join(" · ") || "—",
    success: percentValue(row.success_rate),
  }));
}

function roleRowsFromContract(
  value: ObservabilityRoleBreakdownRow[] | undefined,
  copy: ReturnType<typeof observabilityCopy>,
): RoleBreakdownRow[] {
  return (value ?? []).map((row, index) => {
    const recordedRole = row.role_id.trim();
    const missingTag = row.attribution === "missing_metric_tag" || !recordedRole;
    return {
      inputTokens: finiteNumber(row.input_tokens),
      key: `${row.attribution}-${recordedRole}-${index}`,
      outputTokens: finiteNumber(row.output_tokens),
      role: missingTag ? copy.roleTagMissing : recordedRole,
      toolCalls: finiteNumber(row.tool_calls),
      toolSuccess: percentValue(row.tool_success_rate),
    };
  });
}

function gatewayRowsFromContract(
  value: ObservabilityGatewayBreakdownRow[] | undefined,
): GatewayBreakdownRow[] {
  return (value ?? []).map((row, index) => ({
    calls: finiteNumber(row.calls),
    coldStarts: finiteNumber(row.cold_start_calls),
    duration: finiteNumber(row.avg_duration_ms),
    key: `${row.gateway_operation}-${row.gateway_phase}-${row.gateway_transport}-${index}`,
    operation: row.gateway_operation,
    phase: row.gateway_phase,
    success: percentValue(row.success_rate),
    transport: row.gateway_transport,
  }));
}

function gatewaySummaryFromRows(rows: GatewayBreakdownRow[]) {
  if (rows.length === 0) {
    return {
      calls: 0,
      coldStarts: 0,
      duration: 0,
    };
  }
  const calls = rows.reduce((total, row) => total + row.calls, 0);
  const coldStarts = rows.reduce((total, row) => total + row.coldStarts, 0);
  const duration = Math.round(
    rows.reduce((total, row) => total + row.duration, 0) / rows.length,
  );
  return {
    calls,
    coldStarts,
    duration,
  };
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function percentValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatDurationMs(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function observabilityCopy(t: Translate) {
  return {
    avgRetrievalMs: t("observabilityAvgRetrievalMs"),
    cachedInputTokens: t("observabilityCachedInputTokens"),
    cachedRatio: t("observabilityCachedRatio"),
    gatewayAvgDurationMs: t("observabilityGatewayAvgDurationMs"),
    gatewayFailureRate: t("observabilityGatewayFailureRate"),
    gatewayMcpCalls: t("observabilityGatewayMcpCalls"),
    gatewayPromptStartMs: t("observabilityGatewayPromptStartMs"),
    mcpCalls: t("observabilityMcpCalls"),
    role: t("observabilityRole"),
    roleBreakdown: t("observabilityRoleBreakdown"),
    roleTagMissing: t("observabilityRoleTagMissing"),
    retrievalDocumentCount: t("observabilityRetrievalDocumentCount"),
    retrievalFailureRate: t("observabilityRetrievalFailureRate"),
    retrievalSearches: t("observabilityRetrievalSearches"),
    skillCalls: t("observabilitySkillCalls"),
    source: t("observabilitySource"),
    tool: t("observabilityTool"),
    toolBreakdown: t("observabilityToolBreakdown"),
    uncachedInputTokens: t("observabilityUncachedInputTokens"),
  };
}
