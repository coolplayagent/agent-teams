import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { useRuntimeStore } from "../runtime/runtimeStore";
import { useRunStreamController } from "../runtime/useRunStreamController";

const streamMocks = vi.hoisted(() => ({
  latestOptions: null as unknown,
  openRunStream: vi.fn((options: unknown) => {
    streamMocks.latestOptions = options;
    return { close: vi.fn() };
  }),
}));

vi.mock("../runtime/streamClient", () => ({
  openRunStream: streamMocks.openRunStream,
}));

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  streamMocks.latestOptions = null;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useRunStreamController", () => {
  it("refreshes recovery when a stream starts and while it stays active", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(2);

    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });
    const refreshCountAfterClose = recoveryRefreshCallCount(invalidateSpy);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(refreshCountAfterClose);
  });

  it("refreshes session token usage when a run stream closes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["sessions", "session-1", "token-usage"],
      }),
    );
  });
});

function RunStreamHarness() {
  const controller = useRunStreamController();
  return (
    <button
      type="button"
      onClick={() =>
        controller.startRunStream({
          runId: "run-1",
          sessionId: "session-1",
        })
      }
    >
      Start stream
    </button>
  );
}

function recoveryRefreshCallCount(
  invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>,
): number {
  return invalidateSpy.mock.calls.filter(
    ([filters]) =>
      JSON.stringify(filters) ===
      JSON.stringify({ queryKey: ["sessions", "session-1", "recovery"] }),
  ).length;
}
