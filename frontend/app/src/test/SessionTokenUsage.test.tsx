import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSessionTokenUsage } from "../api/client";
import type { SessionTokenUsage as SessionTokenUsagePayload } from "../api/contracts";
import { SessionTokenUsage } from "../features/shell/SessionTokenUsage";

vi.mock("../api/client", () => ({
  getSessionTokenUsage: vi.fn(),
}));

const getSessionTokenUsageMock = vi.mocked(getSessionTokenUsage);

afterEach(() => {
  cleanup();
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

    fireEvent.click(screen.getByRole("button", { name: "Refresh token usage" }));

    await waitFor(() =>
      expect(getSessionTokenUsageMock).toHaveBeenCalledWith("session-1", true),
    );
    expect(await screen.findByText("2k")).toBeVisible();
    expect(screen.getByText("4.2k")).toBeVisible();
    expect(screen.getByText("6.2k")).toBeVisible();
  });
});

function renderUsage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <SessionTokenUsage sessionId="session-1" />
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

interface UsageValues {
  input: number;
  output: number;
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
        context_window: 1_000_000,
        model_profile: "default",
      },
    },
  };
}
