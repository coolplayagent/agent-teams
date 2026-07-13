import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRecoverySnapshot } from "../api/client";
import { openSessionActivityStream } from "../runtime/sessionActivityClient";
import { useSessionActivityMonitor } from "../runtime/useSessionActivityMonitor";
import { useOptimisticRunStore } from "../runtime/optimisticRunStore";
import { useRuntimeStore } from "../runtime/runtimeStore";

vi.mock("../api/client", () => ({
  getRecoverySnapshot: vi.fn(),
}));
vi.mock("../runtime/sessionActivityClient", () => ({
  openSessionActivityStream: vi.fn(),
}));

const getRecoverySnapshotMock = vi.mocked(getRecoverySnapshot);
const openSessionActivityStreamMock = vi.mocked(openSessionActivityStream);

beforeEach(() => {
  getRecoverySnapshotMock.mockResolvedValue({
    active_run: null,
    background_tasks: [],
    pending_tool_approvals: [],
    pending_user_questions: [],
    paused_subagent: null,
    round_snapshot: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  useOptimisticRunStore.setState({ prompts: {} });
  useRuntimeStore.getState().resetRuntimeState();
});

describe("useSessionActivityMonitor", () => {
  it("refreshes immediately on ready and coalesces external activity", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    const queryClient = testQueryClient();
    render(<MonitorHarness queryClient={queryClient} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    await act(async () => options.onReady());
    expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1", true);
    getRecoverySnapshotMock.mockClear();

    act(() => {
      options.onActivity({ event_type: "run_started", run_id: "external-run" });
      options.onActivity({ event_type: "run_started", run_id: "external-run" });
      vi.advanceTimersByTime(249);
    });
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("polls only while disconnected and catches up when ready again", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    const queryClient = testQueryClient();
    render(<MonitorHarness queryClient={queryClient} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    act(() => options.onDisconnected());
    await act(async () => vi.advanceTimersByTime(30000));
    expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(1);
    await act(async () => options.onReady());
    expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(60000));
    expect(getRecoverySnapshotMock).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate recovery reads for a locally tracked lifecycle event", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    render(
      <MonitorHarness
        locallyTrackedRunIds={["local-run"]}
        queryClient={testQueryClient()}
        sessionId="session-1"
      />,
    );
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    await act(async () => options.onReady());
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
    act(() => {
      options.onActivity({ event_type: "run_started", run_id: "local-run" });
    });
    await act(async () => vi.advanceTimersByTime(250));
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
  });

  it("converges authoritative views when a known local run reaches terminal state", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "local-terminal-run": {
            entries: [],
            lastEventId: 4,
            runId: "local-terminal-run",
            seenEventKeys: [],
            sessionId: "session-1",
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    const queryClient = testQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    render(<MonitorHarness queryClient={queryClient} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    act(() => {
      options.onActivity({
        event_type: "run_completed",
        run_id: "local-terminal-run",
      });
    });
    await act(async () => vi.advanceTimersByTime(250));

    expect(getRecoverySnapshotMock).toHaveBeenCalledWith("session-1", true);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "detail", "session-1"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
  });

  it("still invalidates session views for a genuinely external run", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    const queryClient = testQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    render(<MonitorHarness queryClient={queryClient} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    act(() => {
      options.onActivity({
        event_type: "run_completed",
        run_id: "external-terminal-run",
      });
    });
    await act(async () => vi.advanceTimersByTime(250));

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "detail", "session-1"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "rounds"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "messages"],
    });
  });

  it("refreshes visible subagent records and messages from subagent activity", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    const queryClient = testQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    render(<MonitorHarness queryClient={queryClient} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    act(() => {
      options.onActivity({
        event_type: "subagent_session_status_changed",
        run_id: "subagent-run-1",
      });
    });
    await act(async () => vi.advanceTimersByTime(250));

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "subagents"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-1", "agents"],
    });
  });

  it("does not force recovery while a local create request is still pending", async () => {
    vi.useFakeTimers();
    openSessionActivityStreamMock.mockReturnValue({ close: vi.fn() });
    render(<MonitorHarness queryClient={testQueryClient()} sessionId="session-1" />);
    const options = openSessionActivityStreamMock.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error("Expected session activity stream options.");
    }

    useOptimisticRunStore.getState().beginPrompt("session-1", "local prompt");
    await act(async () => options.onReady());
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
    act(() => {
      options.onActivity({ event_type: "run_started", run_id: "new-local-run" });
    });
    await act(async () => vi.advanceTimersByTime(250));
    expect(getRecoverySnapshotMock).not.toHaveBeenCalled();
  });
});

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function MonitorHarness({
  locallyTrackedRunIds = [],
  queryClient,
  sessionId,
}: {
  locallyTrackedRunIds?: string[];
  queryClient: QueryClient;
  sessionId: string | null;
}) {
  useSessionActivityMonitor({
    locallyTrackedRunIds,
    queryClient,
    sessionId,
  });
  return null;
}
