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
    </section>
  );
}

function stat(label: string, value: JsonValue | undefined, mode: "number" | "percent" = "number") {
  const numeric = typeof value === "number" ? value : 0;
  return (
    <div className="at-stat" key={label}>
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

function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percentValue(value: JsonValue | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return `${(value * 100).toFixed(1)}%`;
}
