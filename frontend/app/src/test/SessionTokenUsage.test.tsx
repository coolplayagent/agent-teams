import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSessionTokenUsage } from "../api/client";
import type { SessionTokenUsage as SessionTokenUsagePayload } from "../api/contracts";
import { SessionTokenUsage } from "../features/shell/SessionTokenUsage";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getSessionTokenUsage: vi.fn(),
}));

const getSessionTokenUsageMock = vi.mocked(getSessionTokenUsage);

afterEach(() => {
  cleanup();
  useUiStore.setState({ language: "en" });
  vi.clearAllMocks();
});

describe("SessionTokenUsage", () => {
  it("renders compact usage totals and force-refreshes them", async () => {
    getSessionTokenUsageMock
      .mockResolvedValueOnce(usage({ input: 1200, output: 3400, total: 4600 }))
      .mockResolvedValueOnce(usage({ input: 2000, output: 4200, total: 6200 }));

    renderUsage();

    expect(await screen.findByText("1.2k")).toBeVisible();
    expect(screen.getByText("3.4k")).toBeVisible();
    expect(screen.getByText("4.6k")).toBeVisible();
    expect(screen.getByText("1.2k / 10k")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Refresh token usage" }));

    await waitFor(() =>
      expect(getSessionTokenUsageMock).toHaveBeenCalledWith("session-1", true),
    );
    expect(await screen.findByText("2k")).toBeVisible();
    expect(screen.getByText("4.2k")).toBeVisible();
    expect(screen.getByText("6.2k")).toBeVisible();
    expect(screen.getByText("2k / 10k")).toBeVisible();
  });

  it("shows the selected primary role context instead of the busiest helper role", async () => {
    getSessionTokenUsageMock.mockResolvedValue(
      usage({
        input: 1000,
        output: 500,
        total: 1500,
        secondaryContextWindow: 2000,
        secondaryInput: 1000,
      }),
    );

    renderUsage({ primaryRoleId: "MainAgent" });

    expect(await screen.findByText("1k / 10k")).toBeVisible();
    expect(screen.queryByText("1k / 2k")).not.toBeInTheDocument();
  });

  it("falls back to the first reported context when no primary role is provided", async () => {
    getSessionTokenUsageMock.mockResolvedValue(
      usage({
        input: 900,
        output: 500,
        total: 1400,
        secondaryContextWindow: 2000,
        secondaryInput: 1000,
      }),
    );

    renderUsage();

    expect(await screen.findByText("900 / 10k")).toBeVisible();
    expect(screen.queryByText("1k / 2k")).not.toBeInTheDocument();
  });

  it("does not infer the primary context from a fixed role name", async () => {
    const payload = usage({
      input: 900,
      output: 500,
      total: 1400,
      secondaryContextWindow: 2000,
      secondaryInput: 1000,
    });
    const main = payload.by_role?.MainAgent;
    const helper = payload.by_role?.HelperAgent;
    if (main === undefined || helper === undefined) {
      throw new Error("Expected both usage roles.");
    }
    payload.by_role = {
      RenamedPrimary: {
        ...helper,
        role_id: "RenamedPrimary",
      },
      MainAgent: main,
    };
    getSessionTokenUsageMock.mockResolvedValue(payload);

    renderUsage();

    expect(await screen.findByText("1k / 2k")).toBeVisible();
    expect(screen.queryByText("900 / 10k")).not.toBeInTheDocument();
  });

  it("uses explicit context titles for loading, error, and missing windows", async () => {
    let resolveUsage: (value: SessionTokenUsagePayload) => void = () => undefined;
    getSessionTokenUsageMock.mockImplementation(
      () =>
        new Promise<SessionTokenUsagePayload>((resolve) => {
          resolveUsage = resolve;
        }),
    );

    const { rerender } = renderUsage();

    const usageStrip = screen.getByTitle("Loading token usage");
    expect(usageStrip).toHaveAttribute("data-state", "loading");
    resolveUsage(
      usage({
        contextWindow: 0,
        input: 1000,
        output: 500,
        total: 1500,
      }),
    );
    expect(await screen.findByText("1k / --")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByTitle(/Latest request input tokens: 1,000/),
      ).toHaveAttribute(
        "data-state",
        "ready",
      ),
    );

    getSessionTokenUsageMock.mockRejectedValue(new Error("nope"));
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <ConfigProvider>
          <SessionTokenUsage sessionId="session-2" />
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTitle("Token usage unavailable")).toHaveAttribute(
      "data-state",
      "error",
    );
  });

  it("localizes the compact token strip and detail title", async () => {
    useUiStore.setState({ language: "zh-CN" });
    getSessionTokenUsageMock.mockResolvedValue(
      usage({ input: 112000, output: 791, total: 113000 }),
    );

    renderUsage({ primaryRoleId: "MainAgent" });

    expect(await screen.findByText("用量")).toBeVisible();
    expect(screen.queryByText("Tokens")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新 token 用量" })).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByTitle(
          /总计 113,000 · 输入 112,000 缓存 120 · 输出 791 推理 40 · 上下文 MainAgent 最近请求输入 \/ 上下文窗口: 112,000 \/ 10,000/,
        ),
      ).toHaveAttribute("data-state", "ready"),
    );
  });
});

function renderUsage({ primaryRoleId = null }: { primaryRoleId?: string | null } = {}) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <SessionTokenUsage
          primaryRoleId={primaryRoleId}
          sessionId="session-1"
        />
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

interface UsageValues {
  contextWindow?: number;
  input: number;
  output: number;
  secondaryContextWindow?: number;
  secondaryInput?: number;
  total: number;
}

function usage(values: UsageValues): SessionTokenUsagePayload {
  return {
    session_id: "session-1",
    total_input_tokens: values.input,
    total_cached_input_tokens: 120,
    total_output_tokens: values.output,
    total_reasoning_output_tokens: 40,
    total_tokens: values.total,
    total_requests: 2,
    total_tool_calls: 1,
    by_role: {
      MainAgent: {
        role_id: "MainAgent",
        input_tokens: values.input,
        latest_input_tokens: values.input,
        cached_input_tokens: 120,
        max_input_tokens: values.input,
        output_tokens: values.output,
        reasoning_output_tokens: 40,
        total_tokens: values.total,
        requests: 2,
        tool_calls: 1,
        context_window: values.contextWindow ?? 10_000,
        model_profile: "default",
      },
      ...(values.secondaryInput !== undefined &&
      values.secondaryContextWindow !== undefined
        ? {
            HelperAgent: {
              role_id: "HelperAgent",
              input_tokens: values.secondaryInput,
              latest_input_tokens: values.secondaryInput,
              cached_input_tokens: 0,
              max_input_tokens: values.secondaryInput,
              output_tokens: 0,
              reasoning_output_tokens: 0,
              total_tokens: values.secondaryInput,
              requests: 1,
              tool_calls: 0,
              context_window: values.secondaryContextWindow,
              model_profile: "default",
            },
          }
        : {}),
    },
  };
}
