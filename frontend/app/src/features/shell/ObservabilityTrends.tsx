import { Alert, Empty, Skeleton, Typography } from "antd";

import { jsonRecord } from "../../api/client";
import type { JsonValue } from "../../api/contracts";
import type { Translate } from "../../i18n";

interface ObservabilityTrendsProps {
  isError: boolean;
  isLoading: boolean;
  t: Translate;
  trendValues: JsonValue[] | undefined;
}

export function ObservabilityTrends({
  isError,
  isLoading,
  t,
  trendValues,
}: ObservabilityTrendsProps) {
  const trends = trendRowsFromJson(trendValues);

  if (isError) {
    return (
      <section
        className="at-observability-section"
        data-observability-section="trends"
      >
        <Typography.Title level={4}>{t("observabilityTrends")}</Typography.Title>
        <Alert message={t("observabilityTrendsError")} type="warning" showIcon />
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className="at-observability-section"
        data-observability-section="trends"
      >
        <Typography.Title level={4}>{t("observabilityTrends")}</Typography.Title>
        <div className="at-trend-grid">
          {["steps", "input", "output", "tools"].map((key) => (
            <div className="at-trend-card" key={key}>
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (trends.length === 0) {
    return (
      <section
        className="at-observability-section"
        data-observability-section="trends"
      >
        <Typography.Title level={4}>{t("observabilityTrends")}</Typography.Title>
        <Empty
          description={t("observabilityNoTrends")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </section>
    );
  }

  const series: TrendSeries[] = [
    {
      key: "steps",
      label: t("observabilitySteps"),
      values: trends.map((row) => row.steps),
    },
    {
      key: "input_tokens",
      label: t("observabilityInputTokens"),
      values: trends.map((row) => row.inputTokens),
    },
    {
      key: "output_tokens",
      label: t("observabilityOutputTokens"),
      values: trends.map((row) => row.outputTokens),
    },
    {
      key: "tool_calls",
      label: t("observabilityToolCalls"),
      values: trends.map((row) => row.toolCalls),
    },
  ];

  return (
    <section
      className="at-observability-section"
      data-observability-section="trends"
    >
      <div className="at-observability-section-header">
        <Typography.Title level={4}>{t("observabilityTrends")}</Typography.Title>
        <Typography.Text type="secondary">
          {t("observabilityTrendBuckets", { count: trends.length })}
        </Typography.Text>
      </div>
      <div className="at-trend-grid">
        {series.map((item) => (
          <TrendCard item={item} key={item.key} trends={trends} />
        ))}
      </div>
    </section>
  );
}

interface TrendSeries {
  key: string;
  label: string;
  values: number[];
}

interface TrendCardProps {
  item: TrendSeries;
  trends: TrendRow[];
}

function TrendCard({ item, trends }: TrendCardProps) {
  const maxValue = Math.max(...item.values, 0);
  const latestValue = item.values.at(-1) ?? 0;
  return (
    <article className="at-trend-card" data-observability-trend={item.key}>
      <div className="at-trend-card-header">
        <span>{item.label}</span>
        <strong>{formatCompactNumber(latestValue)}</strong>
      </div>
      <div aria-label={`${item.label} trend`} className="at-trend-bars">
        {item.values.map((value, index) => (
          <span
            aria-label={`${trends[index]?.label ?? String(index + 1)} ${item.label} ${value}`}
            className="at-trend-bar"
            key={`${item.key}-${trends[index]?.key ?? index}`}
            style={{ height: trendBarHeight(value, maxValue) }}
            title={`${trends[index]?.label ?? String(index + 1)}: ${formatCompactNumber(value)}`}
          />
        ))}
      </div>
      <div className="at-trend-card-footer">
        <span>{trends[0]?.label}</span>
        <span>{trends.at(-1)?.label}</span>
      </div>
    </article>
  );
}

interface TrendRow {
  key: string;
  label: string;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

function trendRowsFromJson(value: JsonValue[] | undefined): TrendRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const row = jsonRecord(item);
    const bucketStart = row.bucket_start ?? row.bucketStart;
    return {
      inputTokens: numberValue(row.input_tokens),
      key: String(row.bucket_start ?? row.bucketStart ?? index),
      label: trendBucketLabel(bucketStart, index),
      outputTokens: numberValue(row.output_tokens),
      steps: numberValue(row.steps),
      toolCalls: numberValue(row.tool_calls),
    };
  });
}

function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function trendBucketLabel(value: JsonValue | undefined, index: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    return `#${index + 1}`;
  }
  const trimmed = value.trim();
  if (trimmed.includes("T") && trimmed.length >= 16) {
    return trimmed.slice(11, 16);
  }
  return trimmed;
}

function trendBarHeight(value: number, maxValue: number): string {
  if (maxValue <= 0 || value <= 0) {
    return "2px";
  }
  const ratio = value / maxValue;
  return `${Math.max(10, Math.round(ratio * 100))}%`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}
