import { Alert, Empty, Segmented, Space, Statistic, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getObservabilityBreakdowns,
  getObservabilityOverview,
  jsonRecord,
} from "../../api/client";
import type { JsonValue } from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SpecLineagePanel } from "./SpecLineagePanel";

interface ObservabilityPanelProps {
  sessionId: string | null;
}

export function ObservabilityPanel({ sessionId }: ObservabilityPanelProps) {
  const t = useTranslations();
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
  const rows = rowsFromJson(breakdownsQuery.data?.rows);
  const gatewayRows = gatewayRowsFromJson(breakdownsQuery.data?.gateway_rows);
  const gatewaySummary = gatewaySummaryFromRows(gatewayRows);
  const hasGatewayMetrics =
    hasNumber(kpis.gateway_calls) ||
    hasNumber(kpis.gateway_prompt_avg_first_update_ms) ||
    hasNumber(kpis.gateway_cold_start_calls) ||
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
      {Object.keys(kpis).length === 0 && !overviewQuery.isLoading ? (
        <Empty description={t("observabilityNoMetrics")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space className="at-stat-grid" size={12} wrap>
          {stat(t("observabilitySteps"), kpis.steps)}
          {stat(t("observabilityInputTokens"), kpis.input_tokens)}
          {stat(t("observabilityOutputTokens"), kpis.output_tokens)}
          {stat(t("observabilityToolCalls"), kpis.tool_calls)}
          {stat(t("observabilityToolSuccess"), kpis.tool_success_rate, "percent")}
          {stat(t("observabilityAvgToolMs"), kpis.tool_avg_duration_ms)}
        </Space>
      )}
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
        pagination={false}
        rowKey="key"
        size="small"
      />
      {hasGatewayMetrics ? (
        <section
          className="at-observability-section"
          data-observability-section="gateway-signals"
        >
          <Typography.Title level={4}>
            {t("observabilityGatewaySignals")}
          </Typography.Title>
          <Space className="at-stat-grid" size={12} wrap>
            {stat(
              t("observabilityGatewayCalls"),
              kpis.gateway_calls,
              "number",
              "gateway_calls",
            )}
            {stat(
              t("observabilityGatewayFirstUpdateMs"),
              kpis.gateway_prompt_avg_first_update_ms,
              "number",
              "gateway_prompt_avg_first_update_ms",
            )}
            {stat(
              t("observabilityGatewayColdStarts"),
              kpis.gateway_cold_start_calls,
              "number",
              "gateway_cold_start_calls",
            )}
          </Space>
          {gatewayRows.length > 0 ? (
            <div data-observability-section="gateway-breakdowns">
              <Typography.Title level={4}>
                {t("observabilityGatewayBreakdown")}
              </Typography.Title>
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
                pagination={false}
                rowKey="key"
                size="small"
              />
            </div>
          ) : null}
        </section>
      ) : null}
      <SpecLineagePanel sessionId={sessionId} />
    </section>
  );
}

function stat(
  label: string,
  value: JsonValue | undefined,
  mode: "number" | "percent" = "number",
  metricId?: string,
  chartId?: string,
) {
  const numeric = typeof value === "number" ? value : 0;
  return (
    <div
      className="at-stat"
      data-observability-chart={chartId}
      data-observability-metric={metricId}
      key={label}
    >
      <Statistic
        title={label}
        value={mode === "percent" ? numeric * 100 : numeric}
        precision={mode === "percent" ? 1 : 0}
        suffix={mode === "percent" ? "%" : undefined}
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

function hasNumber(value: JsonValue | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
