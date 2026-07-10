import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { listSessionRounds, listSidebarSessions } from "../api/client";
import type { SessionRound, SessionSidebarRecord } from "../api/contracts";
import type { RuntimeState, TimelineEntry } from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import type {
  MultiplexedRunStreamOptions,
  RunStreamOptions,
} from "../runtime/streamClient";
import { useRunStreamController } from "../runtime/useRunStreamController";

vi.mock("../api/client", () => ({
  listSessionRounds: vi.fn(),
  listSidebarSessions: vi.fn(),
}));

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

const listSessionRoundsMock = vi.mocked(listSessionRounds);
const listSidebarSessionsMock = vi.mocked(listSidebarSessions);
type SessionRoundPage = Awaited<ReturnType<typeof listSessionRounds>>;

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  listSessionRoundsMock.mockReset();
  listSidebarSessionsMock.mockReset();
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

    const options = streamMocks.latestOptions as {
      onClosed: () => void;
      onState: (runtimeState: RuntimeState) => void;
    };
    act(() => {
      options.onState(runtimeStateWithRunStatuses([
        { lastEventId: 12, runId: "run-1", status: "closed" },
      ]));
    });
    act(() => {
      options.onClosed();
    });
    const refreshCountAfterClose = recoveryRefreshCallCount(invalidateSpy);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(recoveryRefreshCallCount(invalidateSpy)).toBe(refreshCountAfterClose);
  });

  it("reconnects when a run stream closes before the run reaches terminal state", () => {
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
      firstOptions.onState(runtimeStateWithRunStatuses([
        { lastEventId: 12, runId: "run-1", status: "open" },
      ]));
    });

    const refreshCountBeforeClose = recoveryRefreshCallCount(invalidateSpy);
    act(() => {
      firstOptions.onClosed?.(useRuntimeStore.getState().runtimeState);
    });
    expect(recoveryRefreshCallCount(invalidateSpy)).toBeGreaterThan(
      refreshCountBeforeClose,
    );
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(2);
    const reconnectOptions = streamMocks.optionsList[1] as RunStreamOptions;
    expect(reconnectOptions.runId).toBe("run-1");
    expect(reconnectOptions.afterEventId).toBe(12);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1");
  });

  it("polls sidebar subagent discovery while a stream stays active", () => {
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
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "subagents"],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "subagents"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
  });

  it("refreshes sidebar subagent discovery immediately for new subagent events", () => {
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
    const options = streamMocks.latestOptions as {
      onState: (state: RuntimeState) => void;
    };
    expect(subagentDiscoveryRefreshCallCount(invalidateSpy)).toBe(0);

    const statusEntry = runtimeStateEntry({
      eventId: 5,
      kind: "subagent_session_status_changed",
      payload: {
        status: "running",
        subagent_instance_id: "subagent-1",
        subagent_run_id: "subagent-run-1",
      },
    });
    const statusState = runtimeStateWithEntries([statusEntry]);
    act(() => {
      options.onState(statusState);
    });

    expect(subagentDiscoveryRefreshCallCount(invalidateSpy)).toBe(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "subagents"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });

    act(() => {
      options.onState(statusState);
    });
    expect(subagentDiscoveryRefreshCallCount(invalidateSpy)).toBe(1);

    act(() => {
      options.onState(runtimeStateWithEntries([
        statusEntry,
        runtimeStateEntry({
          eventId: 6,
          kind: "subagent_resumed",
          payload: {
            instance_id: "subagent-1",
            task_id: "task-1",
          },
        }),
      ]));
    });

    expect(subagentDiscoveryRefreshCallCount(invalidateSpy)).toBe(2);

    act(() => {
      options.onState(runtimeStateWithEntries([
        statusEntry,
        runtimeStateEntry({
          eventId: 6,
          kind: "subagent_resumed",
          payload: {
            instance_id: "subagent-1",
            task_id: "task-1",
          },
        }),
        runtimeStateEntry({
          eventId: 7,
          kind: "background_task_completed",
          payload: {
            kind: "subagent",
            subagent_instance_id: "subagent-2",
            subagent_run_id: "subagent-run-2",
          },
        }),
      ]));
    });

    expect(subagentDiscoveryRefreshCallCount(invalidateSpy)).toBe(3);
  });

  it("refreshes timeline, sidebar, and session token usage when a run stream closes", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [roundWithToolCalls("run-1", [])],
      next_cursor: null,
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
    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["sessions", "session-1", "token-usage"],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
  });

  it("marks a tracked run closed when the stream ends without a terminal event", () => {
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
    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]).toMatchObject({
      status: "connecting",
      terminalEventType: null,
    });

    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });

    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]).toMatchObject({
      status: "closed",
      terminalEventType: null,
    });
    expect(useRuntimeStore.getState().runtimeState.activeRunIds)
      .not.toContain("run-1");
  });

  it("settles a terminal run without dropping displayed runtime entries", () => {
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
    const options = streamMocks.latestOptions as {
      onState: (runtimeState: RuntimeState) => void;
    };
    const displayedEntry = runtimeStateEntry({
      eventId: 12,
      kind: "text_delta",
      payload: { text: "already displayed terminal text" },
    });
    const pendingEntry = runtimeStateEntry({
      eventId: 13,
      kind: "text_delta",
      payload: { text: "accepted immediately before settlement" },
    });
    act(() => {
      options.onState(runtimeStateWithEntries([displayedEntry]));
    });
    streamMocks.handles[0]?.close.mockImplementation(() => {
      options.onState(runtimeStateWithEntries([displayedEntry, pendingEntry]));
    });

    fireEvent.click(screen.getByRole("button", { name: "Settle terminal stream" }));

    const settledRun = useRuntimeStore.getState().runtimeState.runs["run-1"];
    expect(settledRun).toMatchObject({
      entries: [displayedEntry, pendingEntry],
      status: "closed",
    });
    expect(useRuntimeStore.getState().runtimeState.activeRunIds)
      .not.toContain("run-1");
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
  });

  it("reopens the remaining run when one target settles authoritatively", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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
    const options = streamMocks.latestOptions as MultiplexedRunStreamOptions;
    act(() => {
      options.onState(runtimeStateWithRuns([
        { lastEventId: 20, runId: "run-1" },
        { lastEventId: 11, runId: "run-2" },
      ]));
    });

    fireEvent.click(screen.getByRole("button", { name: "Settle terminal stream" }));

    expect(streamMocks.handles[0]?.close).toHaveBeenCalledTimes(1);
    expect(streamMocks.openRunStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        afterEventId: 11,
        runId: "run-2",
      }),
    );
    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]?.status).toBe(
      "closed",
    );
    expect(useRuntimeStore.getState().runtimeState.runs["run-2"]?.status).toBe(
      "open",
    );
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-2");
  });

  it("keeps refreshing after close until sidebar reports the terminal run", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [roundWithToolCalls("run-1", [])],
      next_cursor: null,
    });
    listSidebarSessionsMock
      .mockResolvedValueOnce([
        sidebarSession({
          latest_terminal_run_id: null,
          latest_terminal_run_status: null,
        }),
      ])
      .mockResolvedValue([
        sidebarSession({
          latest_terminal_run_id: "run-1",
          latest_terminal_run_status: "completed",
        }),
      ]);
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
      expect(listSidebarSessionsMock).toHaveBeenCalledWith(true),
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(["sessions", "sidebar"]))
        .toEqual([
          expect.objectContaining({
            latest_terminal_run_id: "run-1",
            latest_terminal_run_status: "completed",
          }),
        ]),
      { timeout: 3000 },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("waits for terminal round history to include streamed tool calls before refreshing rounds", async () => {
    vi.useFakeTimers();
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: false,
        items: [roundWithToolCalls("run-1", ["call-1"])],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [roundWithToolCalls("run-1", ["call-1", "call-2", "call-3"])],
        next_cursor: null,
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
    const closedState = runtimeStateWithClosedToolCalls([
      "call-1",
      "call-2",
      "call-3",
    ]);
    act(() => {
      options.onState(closedState);
      options.onClosed?.(closedState);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(1, "session-1", {
      forceRefresh: true,
      limit: 100,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(2, "session-1", {
      forceRefresh: true,
      limit: 100,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("waits for terminal round status before refreshing hydrated rounds", async () => {
    vi.useFakeTimers();
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            ...roundWithToolCalls("run-1", ["call-1", "call-2"]),
            run_status: "running",
          },
        ],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [roundWithToolCalls("run-1", ["call-1", "call-2"])],
        next_cursor: null,
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
    const closedState = runtimeStateWithClosedToolCalls(["call-1", "call-2"]);
    act(() => {
      options.onState(closedState);
      options.onClosed?.(closedState);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("retries transient terminal round history fetch errors until history is safe", async () => {
    vi.useFakeTimers();
    listSessionRoundsMock
      .mockRejectedValueOnce(new Error("round not indexed yet"))
      .mockRejectedValueOnce(new Error("round history temporarily unavailable"))
      .mockResolvedValueOnce({
        has_more: false,
        items: [roundWithToolCalls("run-1", ["call-1", "call-2"])],
        next_cursor: null,
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
    const closedState = runtimeStateWithClosedToolCalls(["call-1", "call-2"]);
    act(() => {
      options.onState(closedState);
      options.onClosed?.(closedState);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(3);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("cancels terminal round history refresh when another session stream starts", async () => {
    const terminalHistory = createDeferred<SessionRoundPage>();
    listSessionRoundsMock.mockReturnValueOnce(terminalHistory.promise);
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
    const firstStreamOptions = streamMocks.latestOptions as RunStreamOptions;
    const closedState = runtimeStateWithClosedToolCalls(["call-1", "call-2"]);
    act(() => {
      firstStreamOptions.onState(closedState);
      firstStreamOptions.onClosed?.(closedState);
    });
    await waitFor(() => expect(listSessionRoundsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Start other session stream" }));
    terminalHistory.resolve({
      has_more: false,
      items: [roundWithToolCalls("run-1", ["call-1", "call-2"])],
      next_cursor: null,
    });
    await act(async () => {
      await terminalHistory.promise;
      await Promise.resolve();
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(2);
    const secondStreamOptions = streamMocks.latestOptions as RunStreamOptions;
    expect(secondStreamOptions.runId).toBe("run-2");
  });

  it("falls back to refreshing rounds when terminal history stays incomplete", async () => {
    vi.useFakeTimers();
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [roundWithToolCalls("run-1", ["call-1"])],
      next_cursor: null,
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
    const closedState = runtimeStateWithClosedToolCalls(["call-1", "call-2"]);
    act(() => {
      options.onState(closedState);
      options.onClosed?.(closedState);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);

    for (let attempt = 1; attempt < 24; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
    }

    expect(listSessionRoundsMock).toHaveBeenCalledTimes(24);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(24);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("releases foreground stream state when a run pauses", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-30T00:00:00Z",
          run_id: "run-1",
          run_status: "paused",
        },
      ],
      next_cursor: null,
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
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1");

    const options = streamMocks.latestOptions as RunStreamOptions;
    act(() => {
      options.onState(runtimeStateWithPausedRun(12));
    });

    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1");
    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]).toMatchObject({
      lastEventId: 12,
      status: "closed",
      terminalEventType: "run_paused",
    });

    act(() => {
      options.onClosed?.(runtimeStateWithPausedRun(12));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(streamMocks.handles[0]?.close).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "recovery"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "token-usage"],
    });
  });

  it("suppresses stale recovery targets after terminal stream closure", () => {
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
    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });

    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    expect(screen.getByTestId("suppressed-run-ids")).toBeEmptyDOMElement();
  });

  it("suppresses explicitly cleared run targets without changing ordinary clears", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Clear stream" }));
    expect(screen.getByTestId("suppressed-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear stream suppressing run" }));
    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    expect(screen.getByTestId("suppressed-run-ids")).toBeEmptyDOMElement();
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

  it("deduplicates background stream targets before opening replay", () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["background-run-1"],
        runs: {
          "background-run-1": {
            entries: [],
            lastEventId: 8,
            runId: "background-run-1",
            seenEventKeys: ["background-run-1:8"],
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

    fireEvent.click(screen.getByRole("button", {
      name: "Start duplicate background streams",
    }));

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.openMultiplexedRunStream).not.toHaveBeenCalled();
    const options = streamMocks.latestOptions as RunStreamOptions;
    expect(options.runId).toBe("background-run-1");
    expect(options.afterEventId).toBe(8);
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent(
      "background-run-1",
    );
  });

  it("routes background stream state and refreshes session caches on terminal close", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [roundWithToolCalls("background-run-1", [])],
      next_cursor: null,
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

    fireEvent.click(screen.getByRole("button", { name: "Start background stream" }));
    const options = streamMocks.latestOptions as RunStreamOptions;

    act(() => {
      options.onState(runtimeStateWithRuns([
        { lastEventId: 2, runId: "background-run-1" },
      ]));
    });

    expect(useRuntimeStore.getState().runtimeState.runs["background-run-1"])
      .toMatchObject({
        lastEventId: 2,
        status: "open",
      });
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent(
      "background-run-1",
    );

    act(() => {
      options.onState(runtimeStateWithRunStatuses([
        { lastEventId: 3, runId: "background-run-1", status: "closed" },
      ]));
      options.onClosed?.(runtimeStateWithRunStatuses([
        { lastEventId: 3, runId: "background-run-1", status: "closed" },
      ]));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(streamMocks.handles[0]?.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent(
      "background-run-1",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "recovery"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "token-usage"],
    });
  });

  it("ignores stale callbacks after a newer stream target replaces the active stream", () => {
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
    const staleOptions = streamMocks.latestOptions as RunStreamOptions;

    fireEvent.click(screen.getByRole("button", { name: "Start background stream" }));
    expect(streamMocks.handles[0]?.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("background-run-1");

    act(() => {
      staleOptions.onState(runtimeStateWithRuns([
        { lastEventId: 17, runId: "run-1" },
      ]));
      staleOptions.onClosed?.(runtimeStateWithClosedRun(18));
      staleOptions.onError("run unavailable", "server");
    });

    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]).toMatchObject({
      entries: [],
      status: "connecting",
    });
    expect(screen.getByTestId("active-run-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("background-run-1");
    expect(screen.getByTestId("suppressed-run-ids")).toBeEmptyDOMElement();
    expect(streamMocks.handles[1]?.close).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
  });

  it("accepts the previous stream's close flush before replacing its generation", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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
    const previousOptions = streamMocks.latestOptions as RunStreamOptions;
    streamMocks.handles[0]?.close.mockImplementation(() => {
      previousOptions.onState(runtimeStateWithRuns([
        { lastEventId: 16, runId: "run-1" },
      ]));
    });

    fireEvent.click(screen.getByRole("button", { name: "Start background stream" }));

    expect(useRuntimeStore.getState().runtimeState.runs["run-1"]).toMatchObject({
      lastEventId: 16,
      status: "open",
    });
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent(
      "background-run-1",
    );
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

  it("stops reconnecting after transport fallback attempts are exhausted", () => {
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
      firstOptions.onState(runtimeStateWithLastEvent(77));
    });

    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(3500);
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(2);

    const secondOptions = streamMocks.optionsList[1] as RunStreamOptions;
    act(() => {
      secondOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(7000);
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(3);

    const thirdOptions = streamMocks.optionsList[2] as RunStreamOptions;
    act(() => {
      thirdOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(10500);
    });
    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(4);

    const finalOptions = streamMocks.optionsList[3] as RunStreamOptions;
    act(() => {
      finalOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(30000);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(4);
    expect(streamMocks.handles[3].close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("");
    expect(screen.getByTestId("suppressed-run-ids")).toHaveTextContent("run-1");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("");
  });

  it("does not reconnect transport interruptions after tracked runs are locally terminal", async () => {
    vi.useFakeTimers();
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [roundWithToolCalls("run-1", [])],
      next_cursor: null,
    });
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
    await Promise.resolve();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
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

  it("keeps locally terminal runs in initial multiplex replay targets", () => {
    vi.useFakeTimers();
    useRuntimeStore.setState({
      runtimeState: runtimeStateWithRunStatuses([
        { lastEventId: 77, runId: "run-1", status: "closed" },
        { lastEventId: 88, runId: "run-2", status: "open" },
      ]),
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
    const options = streamMocks.optionsList[0] as MultiplexedRunStreamOptions;
    expect(options.runs).toEqual([
      { afterEventId: 77, runId: "run-1" },
      { afterEventId: 88, runId: "run-2" },
    ]);
  });

  it("drops locally terminal runs from multiplexed transport reconnect targets", () => {
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
      firstOptions.onState(runtimeStateWithRunStatuses([
        { lastEventId: 77, runId: "run-1", status: "closed" },
        { lastEventId: 88, runId: "run-2", status: "open" },
      ]));
    });
    act(() => {
      firstOptions.onError("Run stream disconnected.", "transport");
      vi.advanceTimersByTime(3500);
    });

    expect(streamMocks.openRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.openMultiplexedRunStream).toHaveBeenCalledTimes(1);
    expect(streamMocks.handles[0].close).toHaveBeenCalledTimes(1);
    const reconnectOptions = streamMocks.optionsList[1] as RunStreamOptions;
    expect(reconnectOptions.runId).toBe("run-2");
    expect(reconnectOptions.afterEventId).toBe(88);
    expect(screen.getByTestId("active-run-ids")).toHaveTextContent("run-2");
    expect(screen.getByTestId("tracked-run-ids")).toHaveTextContent("run-1,run-2");
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
      <button
        type="button"
        onClick={() =>
          controller.startRunStream({
            afterEventId,
            runId: "run-2",
            sessionId: "session-2",
          })
        }
      >
        Start other session stream
      </button>
      <button type="button" onClick={() => controller.clearRunStream()}>
        Clear stream
      </button>
      <button
        type="button"
        onClick={() => controller.clearRunStream({ suppressRunIds: ["run-1"] })}
      >
        Clear stream suppressing run
      </button>
      <button
        type="button"
        onClick={() =>
          controller.settleTerminalRunStream({
            runIds: ["run-1"],
            sessionId: "session-1",
          })
        }
      >
        Settle terminal stream
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
      <button
        type="button"
        onClick={() =>
          controller.startRunStreams({
            foregroundRunIds: [],
            sessionId: "session-1",
            runs: [
              {
                afterEventId: 4,
                runId: "background-run-1",
              },
              {
                afterEventId: 6,
                runId: "background-run-1",
              },
            ],
          })
        }
      >
        Start duplicate background streams
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

function subagentDiscoveryRefreshCallCount(
  invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>,
): number {
  return invalidateSpy.mock.calls.filter(
    ([filters]) =>
      JSON.stringify(filters) ===
      JSON.stringify({ queryKey: ["sessions", "session-1", "subagents"] }),
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

function runtimeStateWithEntries(entries: TimelineEntry[]): RuntimeState {
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    0,
  );
  return {
    activeRunIds: ["run-1"],
    runs: {
      "run-1": {
        entries,
        lastEventId,
        runId: "run-1",
        seenEventKeys: entries.map((entry) => `${entry.runId}:${entry.eventId}`),
        status: "open",
        terminalEventType: null,
      },
    },
  };
}

function runtimeStateEntry({
  eventId,
  kind,
  payload,
}: {
  eventId: number;
  kind: TimelineEntry["kind"];
  payload: TimelineEntry["payload"];
}): TimelineEntry {
  return {
    eventId,
    id: `run-1:${eventId}:0`,
    kind,
    occurredAt: `2026-06-30T00:00:${String(eventId).padStart(2, "0")}Z`,
    payload,
    roleId: "MainAgent",
    runId: "run-1",
    sessionId: "session-1",
    text: kind,
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

function runtimeStateWithPausedRun(lastEventId: number): RuntimeState {
  return {
    activeRunIds: [],
    runs: {
      "run-1": {
        entries: [],
        lastEventId,
        runId: "run-1",
        seenEventKeys: [`run-1:${lastEventId}`],
        status: "closed",
        terminalEventType: "run_paused",
      },
    },
  };
}

function runtimeStateWithClosedToolCalls(toolCallIds: string[]): RuntimeState {
  return {
    activeRunIds: [],
    runs: {
      "run-1": {
        entries: toolCallIds.map((toolCallId, index) => ({
          eventId: index + 1,
          id: `run-1:${index + 1}:${index}`,
          kind: "tool_call",
          occurredAt: "2026-06-30T00:00:00Z",
          payload: {
            tool_call_id: toolCallId,
            tool_name: "spawn_subagent",
          },
          roleId: "MainAgent",
          runId: "run-1",
          sessionId: "session-1",
          text: "spawn_subagent",
        })),
        lastEventId: toolCallIds.length + 1,
        runId: "run-1",
        seenEventKeys: toolCallIds.map((toolCallId) => `run-1:${toolCallId}`),
        status: "closed",
        terminalEventType: "run_completed",
      },
    },
  };
}

function roundWithToolCalls(runId: string, toolCallIds: string[]): SessionRound {
  return {
    coordinator_messages: [
      {
        message: {
          parts: toolCallIds.map((toolCallId) => ({
            part_kind: "tool-call",
            tool_call_id: toolCallId,
            tool_name: "spawn_subagent",
          })),
        },
      },
    ],
    created_at: "2026-06-30T00:00:00Z",
    run_id: runId,
    run_status: "completed",
  };
}

function sidebarSession(
  updates: Partial<SessionSidebarRecord> = {},
): SessionSidebarRecord {
  return {
    metadata: { title: "Session 1" },
    session_id: "session-1",
    workspace_id: "default",
    ...updates,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let rejectDeferred: (reason?: unknown) => void = () => undefined;
  let resolveDeferred: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return {
    promise,
    reject: rejectDeferred,
    resolve: resolveDeferred,
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
