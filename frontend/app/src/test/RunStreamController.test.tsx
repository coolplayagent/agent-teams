import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { useRuntimeStore } from "../runtime/runtimeStore";
import type { RunStreamOptions } from "../runtime/streamClient";
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

  it("resumes from the latest local event id when recovery data is stale", () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 108,
            runId: "run-1",
            seenEventKeys: ["run-1:108"],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RunStreamHarness afterEventId={42} />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));

    const options = streamMocks.latestOptions as RunStreamOptions;
    expect(options.afterEventId).toBe(108);
  });

  it("refreshes recovery immediately when the active stream reports an error", () => {
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

    const options = streamMocks.latestOptions as RunStreamOptions;
    act(() => {
      options.onError("Run stream disconnected.");
    });

    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(2);
  });
});

function RunStreamHarness({ afterEventId }: { afterEventId?: number }) {
  const controller = useRunStreamController();
  return (
    <button
      type="button"
      onClick={() =>
        controller.startRunStream({
          afterEventId,
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
