import { Button, Space, Tooltip, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useMemo } from "react";

import { getSessionTokenUsage } from "../../api/client";
import type { SessionTokenUsage as SessionTokenUsagePayload } from "../../api/contracts";

interface SessionTokenUsageProps {
  primaryRoleId?: string | null;
  sessionId: string | null;
}

export function SessionTokenUsage({
  primaryRoleId = null,
  sessionId,
}: SessionTokenUsageProps) {
  const queryClient = useQueryClient();
  const queryKey = ["sessions", sessionId, "token-usage"];
  const usageQuery = useQuery({
    queryKey,
    queryFn: () => getSessionTokenUsage(sessionId ?? ""),
    enabled: sessionId !== null,
    staleTime: 1500,
  });
  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (sessionId === null) {
        throw new Error("Select a session before refreshing token usage.");
      }
      return getSessionTokenUsage(sessionId, true);
    },
    onSuccess: (usage) => {
      queryClient.setQueryData(queryKey, usage);
    },
  });
  const usage = usageQuery.data;
  const contextUsage = useMemo(
    () => selectContextUsage(usage, primaryRoleId),
    [primaryRoleId, usage],
  );
  const state = usageQuery.isError
    ? "error"
    : usageQuery.isFetching || refreshMutation.isPending
      ? "loading"
      : hasUsage(usage)
        ? "ready"
        : "idle";
  const detailTitle = useMemo(
    () => buildDetailTitle(usage, contextUsage, state),
    [contextUsage, state, usage],
  );

  return (
    <div className="at-token-usage" data-state={state} title={detailTitle}>
      <Space size={10} wrap>
        <Typography.Text className="at-token-usage-label">Tokens</Typography.Text>
        <TokenUsagePair label="Input" value={usage?.total_input_tokens ?? 0} />
        <TokenUsagePair label="Output" value={usage?.total_output_tokens ?? 0} />
        <TokenUsagePair label="Total" value={usage?.total_tokens ?? 0} />
        <TokenUsagePair
          label="Context"
          value={formatContextLabel(contextUsage)}
        />
      </Space>
      <Tooltip title="Refresh token usage">
        <Button
          aria-label="Refresh token usage"
          disabled={sessionId === null}
          icon={<RefreshCcw size={14} />}
          loading={usageQuery.isFetching || refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
          size="small"
          type="text"
        />
      </Tooltip>
    </div>
  );
}

interface TokenUsagePairProps {
  label: string;
  value: number | string;
}

function TokenUsagePair({ label, value }: TokenUsagePairProps) {
  return (
    <span className="at-token-usage-pair">
      <span className="at-token-usage-name">{label}</span>
      <span className="at-token-usage-value">
        {typeof value === "number" ? formatCompact(value) : value}
      </span>
    </span>
  );
}

function hasUsage(usage: SessionTokenUsagePayload | undefined): boolean {
  return (
    safeNumber(usage?.total_tokens) > 0 ||
    safeNumber(usage?.total_cached_input_tokens) > 0 ||
    safeNumber(usage?.total_reasoning_output_tokens) > 0
  );
}

interface ContextUsageSummary {
  contextWindow: number | null;
  latestInputTokens: number;
  roleId: string;
}

function selectContextUsage(
  usage: SessionTokenUsagePayload | undefined,
  primaryRoleId: string | null,
): ContextUsageSummary | null {
  const candidates = Object.values(usage?.by_role ?? {})
    .map((role) => {
      const latestInputTokens =
        safeNumber(role.latest_input_tokens) || safeNumber(role.input_tokens);
      if (latestInputTokens === 0) {
        return null;
      }
      const contextWindow = safeNumber(role.context_window);
      return {
        contextWindow: contextWindow > 0 ? contextWindow : null,
        latestInputTokens,
        roleId: role.role_id,
      };
    })
    .filter((item): item is ContextUsageSummary => item !== null);
  if (candidates.length === 0) {
    return null;
  }
  const requestedRoleId = primaryRoleId?.trim();
  if (requestedRoleId) {
    const requested = candidates.find(
      (candidate) => candidate.roleId === requestedRoleId,
    );
    if (requested !== undefined) {
      return requested;
    }
  }
  const mainAgent = candidates.find(
    (candidate) => normalizeRoleId(candidate.roleId) === "mainagent",
  );
  if (mainAgent !== undefined) {
    return mainAgent;
  }
  return candidates[0];
}

function buildDetailTitle(
  usage: SessionTokenUsagePayload | undefined,
  contextUsage: ContextUsageSummary | null,
  state: "error" | "idle" | "loading" | "ready",
): string {
  if (state === "loading") {
    return "Loading token usage";
  }
  if (state === "error") {
    return "Token usage unavailable";
  }
  if (usage === undefined || !hasUsage(usage)) {
    return "Token usage";
  }
  const cached = safeNumber(usage.total_cached_input_tokens);
  const reasoning = safeNumber(usage.total_reasoning_output_tokens);
  const cachedPart = cached > 0 ? ` cached ${formatInteger(cached)}` : "";
  const reasoningPart =
    reasoning > 0 ? ` reasoning ${formatInteger(reasoning)}` : "";
  const details = [
    `total ${formatInteger(usage.total_tokens)}`,
    `input ${formatInteger(usage.total_input_tokens)}${cachedPart}`,
    `output ${formatInteger(usage.total_output_tokens)}${reasoningPart}`,
  ];
  if (contextUsage !== null) {
    const contextWindow = contextUsage.contextWindow;
    const contextDetail =
      contextWindow === null
        ? `Latest request input tokens: ${formatInteger(contextUsage.latestInputTokens)}`
        : `Latest request input / context window: ${formatInteger(contextUsage.latestInputTokens)} / ${formatInteger(contextWindow)}`;
    details.push(`context ${contextUsage.roleId} ${contextDetail}`);
  }
  return details.join(" · ");
}

function formatContextLabel(contextUsage: ContextUsageSummary | null): string {
  if (contextUsage === null) {
    return "--";
  }
  const upper =
    contextUsage.contextWindow === null
      ? "--"
      : formatCompact(contextUsage.contextWindow);
  return `${formatCompact(contextUsage.latestInputTokens)} / ${upper}`;
}

function normalizeRoleId(roleId: string): string {
  return roleId.replaceAll(/[\s_-]/g, "").toLowerCase();
}

function formatInteger(value: number | undefined): string {
  return new Intl.NumberFormat().format(safeNumber(value));
}

function formatCompact(value: number | undefined): string {
  const safeValue = safeNumber(value);
  if (safeValue >= 1_000_000_000) {
    return `${trimFraction(safeValue / 1_000_000_000)}B`;
  }
  if (safeValue >= 1_000_000) {
    return `${trimFraction(safeValue / 1_000_000)}M`;
  }
  if (safeValue >= 1_000) {
    return `${trimFraction(safeValue / 1_000)}k`;
  }
  return String(Math.round(safeValue));
}

function trimFraction(value: number): string {
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return rounded.replace(/\.0$/, "");
}

function safeNumber(value: number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
