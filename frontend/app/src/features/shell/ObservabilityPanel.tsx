import { Alert, Empty, Segmented, Space, Statistic, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getObservabilityBreakdowns,
  getObservabilityOverview,
  jsonRecord,
} from "../../api/client";
import type { JsonValue } from "../../api/contracts";

interface ObservabilityPanelProps {
  sessionId: string | null;
}

export function ObservabilityPanel({ sessionId }: ObservabilityPanelProps) {
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
          <Typography.Title level={3}>Observability</Typography.Title>
          <Typography.Text type="secondary">
            {overviewQuery.data?.updated_at ?? "Metrics for the last 24 hours"}
          </Typography.Text>
        </div>
        <Segmented
          onChange={(value) => setScope(value as "global" | "session")}
          options={[
            { label: "Global", value: "global" },
            { disabled: sessionId === null, label: "Session", value: "session" },
          ]}
          value={effectiveScope}
        />
      </div>
      {overviewQuery.isError || breakdownsQuery.isError ? (
        <Alert message="Could not load observability metrics" type="error" showIcon />
      ) : null}
      {Object.keys(kpis).length === 0 && !overviewQuery.isLoading ? (
        <Empty description="No metrics in this window" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space className="at-stat-grid" size={12} wrap>
          {stat("Steps", kpis.steps)}
          {stat("Input tokens", kpis.input_tokens)}
          {stat("Output tokens", kpis.output_tokens)}
          {stat("Tool calls", kpis.tool_calls)}
          {stat("Tool success", kpis.tool_success_rate, "percent")}
          {stat("Avg tool ms", kpis.tool_avg_duration_ms)}
        </Space>
      )}
      <Table
        className="at-breakdown-table"
        columns={[
          { dataIndex: "name", key: "name", title: "Breakdown" },
          { dataIndex: "calls", key: "calls", title: "Calls" },
          { dataIndex: "success", key: "success", title: "Success" },
          { dataIndex: "duration", key: "duration", title: "Avg ms" },
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
