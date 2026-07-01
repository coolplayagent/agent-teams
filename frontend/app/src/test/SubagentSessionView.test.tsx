import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listAgentMessages,
  listSessionMessages,
  listSessionRounds,
  listSessionSubagents,
} from "../api/client";
import { SubagentSessionView } from "../features/sessions/SubagentSessionView";
import type { ActiveSubagentSession } from "../features/sessions/SessionsSidebar";
import type { RunEventType } from "../runtime/events";
import type { RuntimeState, TimelineEntry } from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import { openSessionSubagentRunStream } from "../runtime/streamClient";
import type { RunStreamController } from "../runtime/useRunStreamController";

vi.mock("../api/client", () => ({
  listAgentMessages: vi.fn(),
  listSessionMessages: vi.fn(),
  listSessionRounds: vi.fn(),
  listSessionSubagents: vi.fn(),
}));

vi.mock("../runtime/streamClient", () => ({
  openSessionSubagentRunStream: vi.fn(),
}));

const listAgentMessagesMock = vi.mocked(listAgentMessages);
const listSessionMessagesMock = vi.mocked(listSessionMessages);
const listSessionRoundsMock = vi.mocked(listSessionRounds);
const listSessionSubagentsMock = vi.mocked(listSessionSubagents);
const openSessionSubagentRunStreamMock = vi.mocked(openSessionSubagentRunStream);

beforeEach(() => {
  listAgentMessagesMock.mockResolvedValue([]);
  listSessionMessagesMock.mockResolvedValue([]);
  listSessionRoundsMock.mockResolvedValue({
    has_more: false,
    items: [],
    next_cursor: null,
  });
  listSessionSubagentsMock.mockResolvedValue([]);
  openSessionSubagentRunStreamMock.mockReturnValue({ close: vi.fn() });
});

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  vi.clearAllMocks();
});

describe("SubagentSessionView", () => {
  it("shows a startup state before a running subagent id is known", async () => {
    const controller = createRunStreamController();

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        instanceId: "",
        lastEventId: null,
        runId: "",
        title: "Explore skills implementation",
      }),
    });

    expect(await screen.findByText("Explore skills implementation")).toBeVisible();
    expect(screen.getByText("Starting subagent...")).toBeVisible();
    expect(listAgentMessagesMock).not.toHaveBeenCalled();
    expect(openSessionSubagentRunStreamMock).not.toHaveBeenCalled();
  });

  it("streams a running subagent panel before its instance id is known", async () => {
    setRuntimeEntries([
      runtimeMessageEntry({
        instanceId: "",
        runId: "subagent_run_1",
        text: "Live subagent output",
      }),
    ]);
    const controller = createRunStreamController();

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        instanceId: "",
        lastEventId: null,
        runId: "subagent_run_1",
        title: "Explore skills implementation",
      }),
    });

    expect(await screen.findByText("Live subagent output")).toBeVisible();
    expect(listAgentMessagesMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expectSubagentSessionStreamStarted({
        afterEventId: 42,
        runId: "subagent_run_1",
        sessionId: "session-parent",
      }),
    );
  });

  it("hydrates a running subagent id from the latest record before streaming", async () => {
    const controller = createRunStreamController();
    listSessionSubagentsMock.mockResolvedValue([
      {
        created_at: "2026-06-23T10:02:00Z",
        instance_id: "subagent-instance-hydrated",
        last_event_id: 41,
        role_id: "explorer",
        run_id: "subagent_run_hydrated",
        run_phase: "running",
        run_status: "running",
        session_id: "session-parent",
        status: "running",
        subagent_kind: "normal",
        title: "Explore skills implementation",
        updated_at: "2026-06-23T10:03:00Z",
      },
    ]);

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        instanceId: "",
        lastEventId: null,
        runId: "",
        title: "Explore skills implementation",
      }),
    });

    expect(await screen.findByText("Explore skills implementation")).toBeVisible();
    await waitFor(() =>
      expect(listAgentMessagesMock).toHaveBeenCalledWith(
        "session-parent",
        "subagent-instance-hydrated",
      ),
    );
    await waitFor(() =>
      expectSubagentSessionStreamStarted({
        afterEventId: 0,
        runId: "subagent_run_hydrated",
        sessionId: "session-parent",
      }),
    );
  });

  it("keeps the live subagent prompt after the latest record hydrates ids", async () => {
    const controller = createRunStreamController();
    listSessionSubagentsMock.mockResolvedValue([
      {
        created_at: "2026-06-23T10:02:00Z",
        instance_id: "subagent-instance-hydrated",
        last_event_id: 41,
        role_id: "explorer",
        run_id: "subagent_run_hydrated",
        run_phase: "running",
        run_status: "running",
        session_id: "session-parent",
        status: "running",
        subagent_kind: "normal",
        title: "Explore skills implementation",
        updated_at: "2026-06-23T10:03:00Z",
      },
    ]);

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        instanceId: "",
        lastEventId: null,
        promptText: "Read the project and report back without editing files.",
        runId: "",
        title: "Explore skills implementation",
      }),
    });

    expect(
      await screen.findByText("Read the project and report back without editing files."),
    ).toBeVisible();
    await waitFor(() =>
      expect(listAgentMessagesMock).toHaveBeenCalledWith(
        "session-parent",
        "subagent-instance-hydrated",
      ),
    );
    await waitFor(() =>
      expectSubagentSessionStreamStarted({
        afterEventId: 0,
        runId: "subagent_run_hydrated",
        sessionId: "session-parent",
      }),
    );
  });

  it("keeps a completed subagent prompt visible during replay", async () => {
    listAgentMessagesMock.mockResolvedValue([
      {
        content: "Completed subagent replay answer.",
        created_at: "2026-06-23T10:08:00Z",
        message_id: "subagent-replay-message",
        role_id: "explorer",
        run_id: "subagent_run_1",
      },
    ]);
    const controller = createRunStreamController();

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        promptText: "Summarize the completed child work.",
        runPhase: "completed",
        runStatus: "completed",
        status: "completed",
      }),
    });

    expect(await screen.findByText("Summarize the completed child work."))
      .toBeVisible();
    expect(await screen.findByText("Completed subagent replay answer."))
      .toBeVisible();
    expect(openSessionSubagentRunStreamMock).not.toHaveBeenCalled();
  });

  it("replays a running subagent from the beginning when no live cursor exists", async () => {
    const controller = createRunStreamController();

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({
        instanceId: "subagent-instance-1",
        lastEventId: 41,
        runId: "subagent_run_1",
        runPhase: "running",
        runStatus: "running",
        status: "running",
        title: "Explore skills implementation",
      }),
    });

    expect(await screen.findByText("Waiting for subagent output...")).toBeVisible();
    expect(screen.queryByText("No subagent activity")).not.toBeInTheDocument();
    expect(listAgentMessagesMock).toHaveBeenCalledWith(
      "session-parent",
      "subagent-instance-1",
    );
    await waitFor(() =>
      expectSubagentSessionStreamStarted({
        afterEventId: 0,
        runId: "subagent_run_1",
        sessionId: "session-parent",
      }),
    );
  });

  it("streams an active subagent run from the live runtime cursor", async () => {
    setRuntimeEntries([
      runtimeMessageEntry({
        instanceId: "subagent-instance-1",
        runId: "subagent_run_1",
        text: "Live subagent output",
      }),
    ]);
    const controller = createRunStreamController();

    const { unmount } = renderSubagentSessionView({ controller });

    expect(await screen.findByText("Explorer review")).toBeVisible();
    expect(screen.getByText("Read-only subagent session")).toBeVisible();
    expect(screen.getByText("explorer")).toBeVisible();
    expect(screen.queryByText("subagent-instance-1")).not.toBeInTheDocument();
    expect(await screen.findByText("Live subagent output")).toBeVisible();
    expect(listAgentMessagesMock).toHaveBeenCalledWith(
      "session-parent",
      "subagent-instance-1",
    );
    expect(listSessionMessagesMock).not.toHaveBeenCalled();
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expectSubagentSessionStreamStarted({
        afterEventId: 42,
        runId: "subagent_run_1",
        sessionId: "session-parent",
      }),
    );

    unmount();

    expect(latestSubagentStreamHandle().close).toHaveBeenCalledTimes(1);
  });

  it("keeps live subagent runtime rows visible while persisted history is loading", async () => {
    const loadingHistory = deferredAgentMessages();
    listAgentMessagesMock.mockReturnValueOnce(loadingHistory.promise);
    setRuntimeEntries([
      runtimeMessageEntry({
        instanceId: "subagent-instance-1",
        runId: "subagent_run_1",
        text: "Live output while history loads",
      }),
    ]);

    renderSubagentSessionView();

    expect(await screen.findByText("Live output while history loads")).toBeVisible();
    expect(screen.queryByText("No subagent activity")).not.toBeInTheDocument();

    await act(async () => {
      loadingHistory.resolve([
        {
          content: "Persisted subagent output",
          message_id: "subagent-message-final",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
      await loadingHistory.promise;
    });

    expect(await screen.findByText("Persisted subagent output")).toBeVisible();
  });

  it("does not render parent round summary chrome in the subagent panel", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["subagent_run_1"],
        runs: {
          subagent_run_1: {
            createdAt: "2026-06-23T10:02:00Z",
            entries: [
              runtimeMessageEntry({
                instanceId: "subagent-instance-1",
                runId: "subagent_run_1",
                text: "Subagent scoped output",
              }),
            ],
            lastEventId: 42,
            promptText: "Parent session prompt should not appear",
            runId: "subagent_run_1",
            seenEventKeys: [],
            sessionId: "session-parent",
            status: "open",
            targetRoleId: "explorer",
            terminalEventType: null,
          },
        },
      },
    });

    renderSubagentSessionView();

    expect(await screen.findByText("Subagent scoped output")).toBeVisible();
    expect(
      screen.queryByText("Parent session prompt should not appear"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("refreshes subagent history when the subagent stream closes", async () => {
    listAgentMessagesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          content: "Final subagent answer",
          message_id: "subagent-message-final",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
    const { queryClient } = renderSubagentSessionView();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(openSessionSubagentRunStreamMock).toHaveBeenCalled());

    closeLatestSubagentStream(closedRuntimeState("subagent_run_1"));

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Final subagent answer")).toBeVisible();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-parent", "subagents"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
  });

  it("keeps existing subagent history visible while the terminal refresh is pending", async () => {
    const refreshedMessages = deferredAgentMessages();
    listAgentMessagesMock
      .mockResolvedValueOnce([
        {
          content: "Existing subagent answer",
          message_id: "subagent-message-existing",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ])
      .mockReturnValueOnce(refreshedMessages.promise);
    renderSubagentSessionView();

    expect(await screen.findByText("Existing subagent answer")).toBeVisible();
    await waitFor(() => expect(openSessionSubagentRunStreamMock).toHaveBeenCalled());

    closeLatestSubagentStream(closedRuntimeState("subagent_run_1"));

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Existing subagent answer")).toBeVisible();
    expect(screen.queryByText("Final subagent answer")).not.toBeInTheDocument();

    await act(async () => {
      refreshedMessages.resolve([
        {
          content: "Final subagent answer",
          message_id: "subagent-message-final",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
      await refreshedMessages.promise;
    });

    expect(await screen.findByText("Final subagent answer")).toBeVisible();
    expect(screen.queryByText("Existing subagent answer")).not.toBeInTheDocument();
  });

  it("keeps live subagent runtime rows visible while terminal history is pending", async () => {
    setRuntimeEntries([
      runtimeMessageEntry({
        instanceId: "subagent-instance-1",
        runId: "subagent_run_1",
        text: "Live runtime output before terminal history",
      }),
    ]);
    const refreshedMessages = deferredAgentMessages();
    listAgentMessagesMock
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(refreshedMessages.promise);

    renderSubagentSessionView();

    expect(
      await screen.findByText("Live runtime output before terminal history"),
    ).toBeVisible();
    await waitFor(() => expect(openSessionSubagentRunStreamMock).toHaveBeenCalled());

    closeLatestSubagentStream(closedRuntimeState("subagent_run_1"));

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("completed")).toBeVisible();
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(screen.getByText("Live runtime output before terminal history"))
      .toBeVisible();
    expect(screen.queryByText("Final subagent answer")).not.toBeInTheDocument();

    await act(async () => {
      refreshedMessages.resolve([
        {
          content: "Final subagent answer",
          message_id: "subagent-message-final",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
      await refreshedMessages.promise;
    });

    expect(await screen.findByText("Final subagent answer")).toBeVisible();
  });

  it("keeps streamed text visible when terminal refresh still has older history", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        instanceId: "subagent-instance-1",
        runId: "subagent_run_1",
        text: "Live text delta before terminal history",
      }),
    ]);
    const refreshedMessages = deferredAgentMessages();
    listAgentMessagesMock
      .mockResolvedValueOnce([
        {
          content: "Persisted subagent checkpoint",
          message_id: "subagent-message-checkpoint",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ])
      .mockReturnValueOnce(refreshedMessages.promise);

    renderSubagentSessionView();

    expect(await screen.findByText("Persisted subagent checkpoint")).toBeVisible();
    expect(
      await screen.findByText("Live text delta before terminal history"),
    ).toBeVisible();
    await waitFor(() => expect(openSessionSubagentRunStreamMock).toHaveBeenCalled());

    closeLatestSubagentStream(closedRuntimeState("subagent_run_1"));

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("completed")).toBeVisible();
    expect(screen.getByText("Persisted subagent checkpoint")).toBeVisible();
    expect(screen.getByText("Live text delta before terminal history"))
      .toBeVisible();
    expect(screen.queryByText("Final subagent answer")).not.toBeInTheDocument();

    await act(async () => {
      refreshedMessages.resolve([
        {
          content: "Final subagent answer",
          message_id: "subagent-message-final",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
      await refreshedMessages.promise;
    });

    expect(await screen.findByText("Final subagent answer")).toBeVisible();
  });

  it("waits for terminal history to contain streamed tool calls before replacing visible history", async () => {
    const terminalEntries = [
      runtimeToolCallEntry({
        runId: "subagent_run_1",
        toolCallId: "call-terminal-subagent",
      }),
    ];
    listAgentMessagesMock
      .mockResolvedValueOnce([
        {
          content: "Existing subagent answer",
          message_id: "subagent-message-existing",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ])
      .mockResolvedValueOnce([
        {
          content: "Incomplete persisted subagent answer",
          message_id: "subagent-message-incomplete",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ])
      .mockResolvedValueOnce([
        {
          message: {
            parts: [
              {
                args: { command: "date" },
                kind: "tool-call",
                tool_call_id: "call-terminal-subagent",
                tool_name: "shell",
              },
            ],
          },
          message_id: "subagent-message-tool",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);
    renderSubagentSessionView();

    expect(await screen.findByText("Existing subagent answer")).toBeVisible();
    await waitFor(() => expect(openSessionSubagentRunStreamMock).toHaveBeenCalled());

    closeLatestSubagentStream(
      closedRuntimeState("subagent_run_1", terminalEntries),
    );

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Existing subagent answer")).toBeVisible();
    expect(
      screen.queryByText("Incomplete persisted subagent answer"),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByText("Processed"));
    expect(await screen.findByText("Tool call: shell")).toBeVisible();
    expect(screen.queryByText("Existing subagent answer")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Incomplete persisted subagent answer"),
    ).not.toBeInTheDocument();
  });

  it.each(["paused", "stopped"])(
    "does not stream %s subagent sessions",
    async (terminalStatus) => {
      const controller = createRunStreamController();
      listAgentMessagesMock.mockResolvedValue([
        {
          content: `Persisted ${terminalStatus} output`,
          message_id: "subagent-message-stopped",
          role: "assistant",
          run_id: "subagent_run_1",
        },
      ]);

      renderSubagentSessionView({
        controller,
        subagent: createSubagent({
          runPhase: terminalStatus,
          runStatus: terminalStatus,
          status: terminalStatus,
        }),
      });

      expect(await screen.findByText(`Persisted ${terminalStatus} output`))
        .toBeVisible();
      expect(openSessionSubagentRunStreamMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["run_completed", "completed"],
    ["run_paused", "paused"],
    ["run_stopped", "stopped"],
  ] satisfies Array<[RunEventType, string]>)(
    "uses runtime %s state for the subagent badge",
    async (terminalEventType, expectedStatus) => {
      const controller = createRunStreamController();
      setRuntimeTerminalRun("subagent_run_1", terminalEventType);

      renderSubagentSessionView({
        controller,
        subagent: createSubagent({ runStatus: "running", status: "running" }),
      });

      expect(await screen.findByText("Explorer review")).toBeVisible();
      expect(screen.getByText(expectedStatus)).toBeVisible();
      expect(openSessionSubagentRunStreamMock).not.toHaveBeenCalled();
    },
  );

  it("uses the latest subagent record to clear stale running badges", async () => {
    const controller = createRunStreamController();
    listSessionSubagentsMock.mockResolvedValue([
      {
        instance_id: "subagent-instance-1",
        role_id: "explorer",
        run_id: "subagent_run_1",
        run_phase: "completed",
        run_status: "completed",
        session_id: "session-parent",
        status: "completed",
        title: "Explorer review",
      },
    ]);
    listAgentMessagesMock.mockResolvedValue([
      {
        content: "Final subagent answer",
        message_id: "subagent-message-final",
        role: "assistant",
        run_id: "subagent_run_1",
      },
    ]);

    renderSubagentSessionView({
      controller,
      subagent: createSubagent({ runStatus: "running", status: "running" }),
    });

    expect(await screen.findByText("Final subagent answer")).toBeVisible();
    expect(await screen.findByText("completed")).toBeVisible();
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(listSessionSubagentsMock).toHaveBeenCalledWith(
      "session-parent",
      true,
    );
  });
});

function renderSubagentSessionView({
  controller = createRunStreamController(),
  subagent = createSubagent(),
}: {
  controller?: RunStreamController;
  subagent?: ActiveSubagentSession;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  const view = (runStreamController: RunStreamController) => (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AntApp>
          <SubagentSessionView
            onBack={vi.fn()}
            runStreamController={runStreamController}
            subagent={subagent}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
  const result = render(view(controller));
  return {
    ...result,
    queryClient,
    rerenderWithController: (nextController: RunStreamController) => {
      result.rerender(view(nextController));
    },
  };
}

function deferredAgentMessages(): {
  promise: ReturnType<typeof listAgentMessages>;
  resolve: (messages: Awaited<ReturnType<typeof listAgentMessages>>) => void;
} {
  let resolveMessages: (
    messages: Awaited<ReturnType<typeof listAgentMessages>>,
  ) => void = () => {};
  const promise = new Promise<Awaited<ReturnType<typeof listAgentMessages>>>(
    (resolve) => {
      resolveMessages = resolve;
    },
  );
  return {
    promise,
    resolve: resolveMessages,
  };
}

function expectSubagentSessionStreamStarted({
  afterEventId,
  runId,
  sessionId,
}: {
  afterEventId: number;
  runId: string;
  sessionId: string;
}): void {
  expect(openSessionSubagentRunStreamMock).toHaveBeenCalledWith(
    expect.objectContaining({
      afterEventId,
      initialState: expect.any(Object),
      onClosed: expect.any(Function),
      onError: expect.any(Function),
      onState: expect.any(Function),
      runId,
      sessionId,
    }),
  );
}

function latestSubagentStreamOptions(): Parameters<
  typeof openSessionSubagentRunStream
>[0] {
  const call = openSessionSubagentRunStreamMock.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error("Subagent stream was not opened.");
  }
  return call[0];
}

function closeLatestSubagentStream(runtimeState: RuntimeState): void {
  const onClosed = latestSubagentStreamOptions().onClosed;
  if (onClosed === undefined) {
    throw new Error("Subagent stream did not register an onClosed callback.");
  }
  onClosed(runtimeState);
}

function latestSubagentStreamHandle(): ReturnType<
  typeof openSessionSubagentRunStream
> {
  const result = openSessionSubagentRunStreamMock.mock.results.at(-1);
  if (result === undefined || result.type !== "return") {
    throw new Error("Subagent stream handle was not returned.");
  }
  return result.value;
}

function closedRuntimeState(
  runId: string,
  entries: TimelineEntry[] = [],
  terminalEventType: RunEventType = "run_completed",
): RuntimeState {
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    43,
  );
  return {
    activeRunIds: [],
    runs: {
      [runId]: {
        entries,
        lastEventId,
        runId,
        seenEventKeys: [],
        status: "closed",
        terminalEventType,
      },
    },
  };
}

function createSubagent(
  overrides: Partial<ActiveSubagentSession> = {},
): ActiveSubagentSession {
  return {
    createdAt: "2026-06-23T10:02:00Z",
    instanceId: "subagent-instance-1",
    interactive: false,
    lastEventId: 41,
    promptText: "",
    roleId: "explorer",
    runId: "subagent_run_1",
    runPhase: "running",
    runStatus: "running",
    sessionId: "session-parent",
    status: "running",
    subagentKind: "normal",
    title: "Explorer review",
    updatedAt: "2026-06-23T10:03:00Z",
    ...overrides,
  };
}

function createRunStreamController(
  overrides: Partial<RunStreamController> = {},
): RunStreamController {
  return {
    activeRunId: null,
    activeRunIds: [],
    clearRunStream: vi.fn(),
    setForegroundSessionId: vi.fn(),
    startRunStream: vi.fn(),
    startRunStreams: vi.fn(),
    suppressedRunIds: [],
    trackedRunIds: [],
    ...overrides,
  };
}

function setRuntimeEntries(entries: TimelineEntry[]): void {
  const runId = entries[0]?.runId ?? "subagent_run_1";
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    0,
  );
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: [runId],
      runs: {
        [runId]: {
          entries,
          lastEventId,
          runId,
          seenEventKeys: [],
          status: "open",
          terminalEventType: null,
        },
      },
    },
  });
}

function setRuntimeTerminalRun(
  runId: string,
  terminalEventType: RunEventType,
): void {
  setRuntimeTerminalEntries([], terminalEventType, runId);
}

function setRuntimeTerminalEntries(
  entries: TimelineEntry[],
  terminalEventType: RunEventType,
  runId = entries[0]?.runId ?? "subagent_run_1",
): void {
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    43,
  );
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: [],
      runs: {
        [runId]: {
          entries,
          lastEventId,
          runId,
          seenEventKeys: [],
          status: "closed",
          terminalEventType,
        },
      },
    },
  });
}

function runtimeToolCallEntry({
  runId,
  toolCallId,
}: {
  runId: string;
  toolCallId: string;
}): TimelineEntry {
  return {
    eventId: 44,
    id: `${runId}:44:0`,
    instanceId: "subagent-instance-1",
    kind: "tool_call",
    occurredAt: "2026-06-23T10:04:00Z",
    payload: {
      args: { command: "date" },
      tool_call_id: toolCallId,
      tool_name: "shell",
    },
    roleId: "explorer",
    runId,
    sessionId: "session-parent",
    text: "shell",
  };
}

function runtimeMessageEntry({
  instanceId,
  runId,
  text,
}: {
  instanceId: string;
  runId: string;
  text: string;
}): TimelineEntry {
  return {
    eventId: 42,
    id: `${runId}:42:0`,
    instanceId,
    kind: "message",
    occurredAt: "2026-06-23T10:03:00Z",
    payload: { text },
    roleId: "explorer",
    runId,
    sessionId: "session-parent",
    text,
  };
}

function runtimeTextDeltaEntry({
  instanceId,
  runId,
  text,
}: {
  instanceId: string;
  runId: string;
  text: string;
}): TimelineEntry {
  return {
    eventId: 42,
    id: `${runId}:42:0`,
    instanceId,
    kind: "text_delta",
    occurredAt: "2026-06-23T10:03:00Z",
    payload: { text },
    roleId: "explorer",
    runId,
    sessionId: "session-parent",
    text,
  };
}
