import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import type { RuntimeState } from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import type { RunStreamOptions } from "../runtime/streamClient";
import { useRunStreamController } from "../runtime/useRunStreamController";

const streamMocks = vi.hoisted(() => ({
  handles: [] as Array<{ close: ReturnType<typeof vi.fn> }>,
  latestOptions: null as unknown,
  optionsList: [] as unknown[],
  openRunStream: vi.fn((options: unknown) => {
    streamMocks.latestOptions = options;
    streamMocks.optionsList.push(options);
    const handle = { close: vi.fn() };
    streamMocks.handles.push(handle);
    return handle;
  }),
}));

vi.mock("../runtime/streamClient", () => ({
  openRunStream: streamMocks.openRunStream,
}));

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  streamMocks.handles = [];
  streamMocks.latestOptions = null;
  streamMocks.optionsList = [];
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
      options.onError("Run stream disconnected.", "server");
    });

    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(2);
  });

  it("reconnects transport interruptions from the latest local event id", () => {
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
    const firstOptions = streamMocks.optionsList[0] as RunStreamOptions;
    act(() => {
      firstOptions.onState(runtimeStateWithLastEvent(77));
    });
    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
    });

    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(2);
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(2);
    const reconnectOptions = streamMocks.optionsList[1] as RunStreamOptions;
    expect(reconnectOptions.afterEventId).toBe(77);
  });

  it("does not reconnect explicit server stream errors", () => {
    vi.useFakeTimers();
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
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    const options = streamMocks.latestOptions as RunStreamOptions;
    act(() => {
      options.onError("resume failed", "server");
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
  });

  it("cancels pending reconnects when the stream is cleared", () => {
    vi.useFakeTimers();
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
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    const options = streamMocks.latestOptions as RunStreamOptions;
    act(() => {
      options.onError("Run stream disconnected.", "transport");
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear stream" }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
  });
});

function RunStreamHarness({ afterEventId }: { afterEventId?: number }) {
  const controller = useRunStreamController();
  return (
    <>
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
      <button type="button" onClick={() => controller.clearRunStream()}>
        Clear stream
      </button>
    </>
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

function runtimeStateWithLastEvent(lastEventId: number): RuntimeState {
  return {
    activeRunIds: ["run-1"],
    runs: {
      "run-1": {
        entries: [],
        lastEventId,
        runId: "run-1",
        seenEventKeys: [`run-1:${lastEventId}`],
        status: "open",
        terminalEventType: null,
      },
    },
  };
}
