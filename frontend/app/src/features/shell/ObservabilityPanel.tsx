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
import type { JsonValue } from "../../api/contracts";
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
  ].some((value) => typeof value === "number" && Number.isFinite(value));
  const rows = rowsFromJson(breakdownsQuery.data?.rows);
  const gatewayRows = gatewayRowsFromJson(breakdownsQuery.data?.gateway_rows);
  const gatewaySummary = gatewaySummaryFromRows(gatewayRows);
  const showPrimaryMetrics = overviewQuery.isLoading || hasOverviewMetrics;
  const showGatewayMetrics =
    overviewQuery.isLoading ||
    breakdownsQuery.isLoading ||
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
      <Table
        className="at-breakdown-table"
        columns={[
          { dataIndex: "name", key: "name", title: t("observabilityBreakdown") },
          { dataIndex: "calls", key: "calls", title: t("observabilityCalls") },
          { dataIndex: "success", key: "success", title: t("observabilitySuccess") },
          { dataIndex: "duration", key: "duration", title: t("observabilityAvgMs") },
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
  calls: number;
  success: string;
  duration: number;
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

function rowsFromJson(value: JsonValue[] | undefined): BreakdownRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const row = jsonRecord(item);
    return {
      key: String(row.key ?? row.name ?? row.source ?? index),
      name: String(row.name ?? row.stage ?? row.source ?? row.role_id ?? "unknown"),
      calls: numberValue(row.calls ?? row.count),
      success: percentValue(row.success_rate ?? row.tool_success_rate),
      duration: numberValue(row.avg_duration_ms ?? row.tool_avg_duration_ms),
    };
  });
}

function gatewayRowsFromJson(value: JsonValue[] | undefined): GatewayBreakdownRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const row = jsonRecord(item);
    const operation = String(row.gateway_operation ?? row.operation ?? "unknown");
    const phase = String(row.gateway_phase ?? row.phase ?? "unknown");
    const transport = String(row.gateway_transport ?? row.transport ?? "unknown");
    return {
      calls: numberValue(row.calls ?? row.count),
      coldStarts: numberValue(row.cold_start_calls),
      duration: numberValue(row.avg_duration_ms),
      key: String(row.key ?? `${operation}-${phase}-${transport}-${index}`),
      operation,
      phase,
      success: percentValue(row.success_rate),
      transport,
    };
  });
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

function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percentValue(value: JsonValue | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function observabilityCopy(t: Translate) {
  const isZh = t("observabilityTitle") === "观测";
  return {
    avgRetrievalMs: isZh ? "平均检索耗时 ms" : "Avg retrieval ms",
    cachedInputTokens: isZh ? "缓存输入 tokens" : "Cached input tokens",
    cachedRatio: isZh ? "缓存占比" : "Cached ratio",
    gatewayAvgDurationMs: isZh ? "Gateway 平均时延 ms" : "Gateway Avg ms",
    gatewayFailureRate: isZh ? "Gateway 失败率" : "Gateway Failure Rate",
    gatewayMcpCalls: isZh ? "Gateway MCP 调用" : "Gateway MCP Calls",
    gatewayPromptStartMs: isZh ? "Prompt 启动 ms" : "Prompt Start ms",
    mcpCalls: isZh ? "MCP 调用" : "MCP calls",
    retrievalDocumentCount: isZh ? "检索文档数" : "Retrieved docs",
    retrievalFailureRate: isZh ? "检索失败率" : "Retrieval failure rate",
    retrievalSearches: isZh ? "检索搜索次数" : "Retrieval searches",
    skillCalls: isZh ? "技能调用" : "Skill calls",
    uncachedInputTokens: isZh ? "未缓存输入 tokens" : "Uncached input tokens",
  };
}
