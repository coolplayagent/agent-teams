import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  getObservabilityBreakdowns,
  getObservabilityOverview,
} from "../api/client";
import type {
  ObservabilityBreakdowns,
  ObservabilityOverview,
} from "../api/contracts";
import { ObservabilityPanel } from "../features/shell/ObservabilityPanel";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>(
    "../api/client",
  );
  return {
    ...actual,
    getObservabilityBreakdowns: vi.fn(),
    getObservabilityOverview: vi.fn(),
  };
});

vi.mock("../features/shell/SpecLineagePanel", () => ({
  SpecLineagePanel: () => <div data-testid="spec-lineage-panel" />,
}));

const getObservabilityOverviewMock = vi.mocked(getObservabilityOverview);
const getObservabilityBreakdownsMock = vi.mocked(getObservabilityBreakdowns);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ObservabilityPanel", () => {
  it("renders the complete legacy KPI inventory in the overview", async () => {
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: {
        cached_input_tokens: 2400,
        cached_token_ratio: 0.375,
        gateway_avg_duration_ms: 183,
        gateway_calls: 12,
        gateway_cold_start_calls: 2,
        gateway_failure_rate: 0.25,
        gateway_mcp_calls: 6,
        gateway_prompt_avg_first_update_ms: 94,
        gateway_prompt_avg_start_ms: 51,
        input_tokens: 6400,
        mcp_calls: 11,
        output_tokens: 1700,
        retrieval_avg_duration_ms: 85,
        retrieval_document_count: 48,
        retrieval_failure_rate: 0.125,
        retrieval_searches: 9,
        skill_calls: 7,
        steps: 42,
        tool_avg_duration_ms: 120,
        tool_calls: 19,
        tool_success_rate: 0.95,
        uncached_input_tokens: 4000,
      },
      trends: [],
      updated_at: "2026-07-11T09:15:00Z",
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockResolvedValue({
      gateway_rows: [
        {
          avg_duration_ms: 150,
          calls: 8,
          cold_start_calls: 1,
          gateway_operation: "responses",
          gateway_phase: "first_update",
          gateway_transport: "sse",
          success_rate: 0.875,
        },
      ],
      rows: [
        {
          avg_duration_ms: 120.4567,
          calls: 19,
          mcp_server: "filesystem",
          success_rate: 0.95,
          tool_name: "filesystem_read_file",
          tool_source: "mcp",
        },
      ],
    } satisfies ObservabilityBreakdowns);

    const { container } = renderPanel("session-1");

    await screen.findByText("Cached input tokens");

    expect(metricCard(container, "cached_input_tokens")).toHaveTextContent(
      "Cached input tokens",
    );
    expect(metricCard(container, "cached_input_tokens")).toHaveTextContent("2,400");
    expect(metricCard(container, "uncached_input_tokens")).toHaveTextContent(
      "Uncached input tokens",
    );
    expect(metricCard(container, "cached_token_ratio")).toHaveTextContent("37.5%");
    expect(metricCard(container, "retrieval_searches")).toHaveTextContent(
      "Retrieval searches",
    );
    expect(metricCard(container, "retrieval_failure_rate")).toHaveTextContent(
      "12.5%",
    );
    expect(metricCard(container, "retrieval_avg_duration_ms")).toHaveTextContent(
      "Avg retrieval ms",
    );
    expect(metricCard(container, "retrieval_document_count")).toHaveTextContent(
      "Retrieved docs",
    );
    expect(metricCard(container, "skill_calls")).toHaveTextContent("Skill calls");
    expect(metricCard(container, "mcp_calls")).toHaveTextContent("MCP calls");
    expect(metricCard(container, "gateway_failure_rate")).toHaveTextContent(
      "Gateway Failure Rate",
    );
    expect(metricCard(container, "gateway_prompt_avg_start_ms")).toHaveTextContent(
      "Prompt Start ms",
    );
    expect(metricCard(container, "gateway_mcp_calls")).toHaveTextContent(
      "Gateway MCP Calls",
    );
    expect(screen.getByText("filesystem_read_file")).toBeVisible();
    expect(screen.getByText("120.46")).toBeVisible();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });

  it("shows loading skeletons instead of empty or zeroed overview cards", () => {
    getObservabilityOverviewMock.mockReturnValue(new Promise(() => undefined));
    getObservabilityBreakdownsMock.mockReturnValue(new Promise(() => undefined));

    renderPanel("session-1");

    expect(screen.getByTestId("observability-overview-loading")).toBeVisible();
    expect(screen.getByTestId("observability-gateway-loading")).toBeVisible();
    expect(screen.getAllByTestId("observability-loading-stat").length).toBeGreaterThan(
      10,
    );
    expect(screen.queryByText("No metrics in this window")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("keeps empty messaging scoped to observability when no metrics are available", async () => {
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: {},
      trends: [],
      updated_at: "2026-07-11T09:15:00Z",
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockResolvedValue({
      gateway_rows: [],
      rows: [],
    } satisfies ObservabilityBreakdowns);

    renderPanel("session-1");

    expect((await screen.findAllByText("No metrics in this window")).length).toBe(2);
    expect(await screen.findByText("No trend buckets in this window")).toBeVisible();
    expect(screen.queryByText("Gateway Signals")).not.toBeInTheDocument();
  });

  it("uses localized labels for the added parity metrics", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: {
        cached_input_tokens: 12,
        mcp_calls: 3,
        retrieval_searches: 2,
      },
      trends: [],
      updated_at: "2026-07-11T09:15:00Z",
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockResolvedValue({
      gateway_rows: [],
      rows: [],
    } satisfies ObservabilityBreakdowns);

    renderPanel("session-1");

    expect(await screen.findByText("缓存输入 tokens")).toBeVisible();
    expect(screen.getByText("检索搜索次数")).toBeVisible();
    expect(screen.getByText("MCP 调用")).toBeVisible();
    expect(screen.queryByText("Gateway 信号")).not.toBeInTheDocument();
  });

  it("uses unavailable marks instead of fabricated zero values", async () => {
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: { input_tokens: 12 },
      trends: [],
      updated_at: "2026-07-11T09:15:00Z",
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockResolvedValue({
      gateway_rows: [],
      rows: [],
    } satisfies ObservabilityBreakdowns);

    const { container } = renderPanel("session-1");
    await screen.findByText("Input tokens");

    expect(metricCard(container, "cached_input_tokens")).toHaveTextContent("—");
    expect(screen.queryByText("Gateway Signals")).not.toBeInTheDocument();
  });

  it("does not expose an empty Gateway section while only breakdowns are pending", async () => {
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: { input_tokens: 12 },
      trends: [],
      updated_at: "2026-07-11T09:15:00Z",
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockReturnValue(new Promise(() => undefined));

    renderPanel("session-1");
    await screen.findByText("Input tokens");

    expect(screen.queryByText("Gateway Signals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("observability-gateway-loading"))
      .not.toBeInTheDocument();
  });

  it("labels legacy breakdown rows with missing dimensions without merging them", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getObservabilityOverviewMock.mockResolvedValue({
      kpis: { tool_calls: 5 },
      trends: [],
    } satisfies ObservabilityOverview);
    getObservabilityBreakdownsMock.mockResolvedValue({
      gateway_rows: [],
      rows: [
        { avg_duration_ms: 107.72413793103448, calls: 3, success_rate: 1 },
        { avg_duration_ms: 124.43478260869566, calls: 2, success_rate: 1 },
      ],
    } satisfies ObservabilityBreakdowns);

    renderPanel("session-1");

    expect(await screen.findByText("未记录 #1")).toBeVisible();
    expect(screen.getByText("未记录 #2")).toBeVisible();
    expect(screen.getByText("107.72")).toBeVisible();
    expect(screen.getByText("124.43")).toBeVisible();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });
});

function renderPanel(sessionId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  return render(
    <TestProviders queryClient={queryClient}>
      <ObservabilityPanel sessionId={sessionId} />
    </TestProviders>,
  );
}

function metricCard(container: HTMLElement, metricId: string): HTMLElement {
  const element = container.querySelector(
    `[data-observability-metric="${metricId}"]`,
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing observability metric card: ${metricId}`);
  }
  return element;
}

function TestProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
