import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import type { RuntimeState } from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import type {
  MultiplexedRunStreamOptions,
  RunStreamOptions,
} from "../runtime/streamClient";
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
  openMultiplexedRunStream: vi.fn((options: unknown) => {
    streamMocks.latestOptions = options;
    streamMocks.optionsList.push(options);
    const handle = { close: vi.fn() };
    streamMocks.handles.push(handle);
    return handle;
  }),
}));

vi.mock("../runtime/streamClient", () => ({
  openMultiplexedRunStream: streamMocks.openMultiplexedRunStream,
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

  it("starts multiplexed run streams from each latest local event id", () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1", "run-2"],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 108,
            runId: "run-1",
            seenEventKeys: ["run-1:108"],
            status: "open",
            terminalEventType: null,
          },
          "run-2": {
            entries: [],
            lastEventId: 7,
            runId: "run-2",
            seenEventKeys: ["run-2:7"],
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
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start streams" }));

    expect(streamMocks.openRunStream).not.toHaveBeenCalled();
    expect(streamMocks.openMultiplexedRunStream).toHaveBeenCalledTimes(1);
    const options = streamMocks.latestOptions as MultiplexedRunStreamOptions;
    expect(options.runs).toEqual([
      { afterEventId: 108, runId: "run-1" },
      { afterEventId: 9, runId: "run-2" },
    ]);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-1,run-2");
  });

  it("tracks background-only streams without exposing them as foreground active runs", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Start background stream" }));

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("background-run-1");

    const options = streamMocks.latestOptions as RunStreamOptions;
    act(() => {
      options.onState(runtimeStateWithRuns([
        { lastEventId: 5, runId: "background-run-1" },
      ]));
    });

    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("background-run-1");
  });

  it("removes completed runs from the active controller targets during multiplexed streams", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Start streams" }));
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-1,run-2");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1,run-2");

    const options = streamMocks.latestOptions as MultiplexedRunStreamOptions;
    act(() => {
      options.onState(runtimeStateWithRunStatuses([
        { lastEventId: 12, runId: "run-1", status: "closed" },
        { lastEventId: 13, runId: "run-2", status: "open" },
      ]));
    });

    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-2");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1,run-2");
  });

  it("deduplicates multiplexed run targets before opening a replay stream", () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1", "run-2"],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 20,
            runId: "run-1",
            seenEventKeys: ["run-1:20"],
            status: "open",
            terminalEventType: null,
          },
          "run-2": {
            entries: [],
            lastEventId: 7,
            runId: "run-2",
            seenEventKeys: ["run-2:7"],
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
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start duplicate streams" }));

    expect(streamMocks.openRunStream).not.toHaveBeenCalled();
    expect(streamMocks.openMultiplexedRunStream).toHaveBeenCalledTimes(1);
    const options = streamMocks.latestOptions as MultiplexedRunStreamOptions;
    expect(options.runs).toEqual([
      { afterEventId: 20, runId: "run-1" },
      { afterEventId: 7, runId: "run-2" },
    ]);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-1,run-2");
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
    expect(streamMocks.handles[0].close).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.handles[0].close).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(2);
    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    const reconnectOptions = streamMocks.optionsList[1] as RunStreamOptions;
    expect(reconnectOptions.afterEventId).toBe(77);
  });

  it("does not reconnect transport interruptions after tracked runs are locally terminal", () => {
    vi.useFakeTimers();
    useRuntimeStore.setState({
      runtimeState: runtimeStateWithClosedRun(77),
    });
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
    const options = streamMocks.latestOptions as RunStreamOptions;
    expect(options.afterEventId).toBe(77);

    act(() => {
      options.onError("Run stream disconnected.", "transport");
    });

    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
  });

  it("keeps the native EventSource reconnect when events resume before fallback", () => {
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
    const firstOptions = streamMocks.optionsList[0] as RunStreamOptions;
    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      firstOptions.onState(runtimeStateWithLastEvent(79));
      vi.advanceTimersByTime(5000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.handles[0].close).not.toHaveBeenCalled();
  });

  it("keeps the native EventSource reconnect when duplicate replay activity resumes before fallback", () => {
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
    const firstOptions = streamMocks.optionsList[0] as RunStreamOptions;
    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      firstOptions.onActivity?.();
      vi.advanceTimersByTime(5000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.handles[0].close).not.toHaveBeenCalled();
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
      options.onError("resume failed", "server");
    });
    const refreshCountAfterError = recoveryRefreshCallCount(invalidateSpy);

    expect(refreshCountAfterError).toBe(2);
    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(refreshCountAfterError);
  });

  it("suppresses stale recovery targets after explicit server stream errors", () => {
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
      options.onError("run unavailable", "server");
    });

    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("");
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
      vi.advanceTimersByTime(5000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
  });

  it("reconnects multiplexed transport interruptions from latest local event ids", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Start streams" }));
    const firstOptions = streamMocks.optionsList[0] as MultiplexedRunStreamOptions;
    act(() => {
      firstOptions.onState(runtimeStateWithRuns([
        { lastEventId: 77, runId: "run-1" },
        { lastEventId: 88, runId: "run-2" },
      ]));
    });
    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(3500);
    });

    expect(streamMocks.openMultiplexedRunStream).toHaveBeenCalledTimes(2);
    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    const reconnectOptions = streamMocks.optionsList[1] as MultiplexedRunStreamOptions;
    expect(reconnectOptions.runs).toEqual([
      { afterEventId: 77, runId: "run-1" },
      { afterEventId: 88, runId: "run-2" },
    ]);
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
      <button
        type="button"
        onClick={() =>
          controller.startRunStreams({
            sessionId: "session-1",
            runs: [
              {
                afterEventId,
                runId: "run-1",
              },
              {
                afterEventId: 9,
                runId: "run-2",
              },
            ],
          })
        }
      >
        Start streams
      </button>
      <button
        type="button"
        onClick={() =>
          controller.startRunStreams({
            sessionId: "session-1",
            runs: [
              {
                afterEventId: 12,
                runId: "run-1",
              },
              {
                afterEventId: 3,
                runId: "run-1",
              },
              {
                afterEventId: 4,
                runId: "run-2",
              },
              {
                runId: "run-2",
              },
            ],
          })
        }
      >
        Start duplicate streams
      </button>
      <button
        type="button"
        onClick={() =>
          controller.startRunStream({
            foreground: false,
            runId: "background-run-1",
            sessionId: "session-1",
          })
        }
      >
        Start background stream
      </button>
      <span data-testid="active-run-ids">{controller.activeRunIds.join(",")}</span>
      <span data-testid="suppressed-run-ids">
        {controller.suppressedRunIds.join(",")}
      </span>
      <span data-testid="tracked-run-ids">{controller.trackedRunIds.join(",")}</span>
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

function runtimeStateWithClosedRun(lastEventId: number): RuntimeState {
  return {
    activeRunIds: [],
    runs: {
      "run-1": {
        entries: [],
        lastEventId,
        runId: "run-1",
        seenEventKeys: [`run-1:${lastEventId}`],
        status: "closed",
        terminalEventType: "run_completed",
      },
    },
  };
}

function runtimeStateWithRuns(
  runs: Array<{ lastEventId: number; runId: string }>,
): RuntimeState {
  return runtimeStateWithRunStatuses(
    runs.map((run) => ({
      ...run,
      status: "open",
    })),
  );
}

function runtimeStateWithRunStatuses(
  runs: Array<{ lastEventId: number; runId: string; status: "closed" | "open" }>,
): RuntimeState {
  return {
    activeRunIds: runs
      .filter((run) => run.status === "open")
      .map((run) => run.runId),
    runs: Object.fromEntries(
      runs.map((run) => [
        run.runId,
        {
          entries: [],
          lastEventId: run.lastEventId,
          runId: run.runId,
          seenEventKeys: [`${run.runId}:${run.lastEventId}`],
          status: run.status,
          terminalEventType: run.status === "closed" ? "run_completed" : null,
        },
      ]),
    ),
  };
}
