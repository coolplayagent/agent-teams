import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listAgentMessages,
  listSessionMessages,
  listSessionRounds,
} from "../api/client";
import { SubagentSessionView } from "../features/sessions/SubagentSessionView";
import type { ActiveSubagentSession } from "../features/sessions/SessionsSidebar";
import type { RunEventType } from "../runtime/events";
import type { TimelineEntry } from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import type { RunStreamController } from "../runtime/useRunStreamController";

vi.mock("../api/client", () => ({
  listAgentMessages: vi.fn(),
  listSessionMessages: vi.fn(),
  listSessionRounds: vi.fn(),
}));

const listAgentMessagesMock = vi.mocked(listAgentMessages);
const listSessionMessagesMock = vi.mocked(listSessionMessages);
const listSessionRoundsMock = vi.mocked(listSessionRounds);

beforeEach(() => {
  listAgentMessagesMock.mockResolvedValue([]);
  listSessionMessagesMock.mockResolvedValue([]);
  listSessionRoundsMock.mockResolvedValue({
    has_more: false,
    items: [],
    next_cursor: null,
  });
});

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  vi.clearAllMocks();
});

describe("SubagentSessionView", () => {
  it("streams an active subagent run from the last checkpoint", async () => {
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
    expect(await screen.findByText("Live subagent output")).toBeVisible();
    expect(listAgentMessagesMock).toHaveBeenCalledWith(
      "session-parent",
      "subagent-instance-1",
    );
    expect(listSessionMessagesMock).not.toHaveBeenCalled();
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(controller.startRunStream).toHaveBeenCalledWith({
        afterEventId: 41,
        foreground: true,
        runId: "subagent_run_1",
        sessionId: "session-parent",
      }),
    );

    unmount();

    expect(controller.clearRunStream).toHaveBeenCalledTimes(1);
  });

  it("refreshes subagent history when the tracked run closes", async () => {
    const initialController = createRunStreamController({
      activeRunIds: ["subagent_run_1"],
      trackedRunIds: ["subagent_run_1"],
    });
    const closedController = createRunStreamController();
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
    const { queryClient, rerenderWithController } = renderSubagentSessionView({
      controller: initialController,
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(1));

    rerenderWithController(closedController);

    await waitFor(() => expect(listAgentMessagesMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Final subagent answer")).toBeVisible();
    expect(closedController.startRunStream).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [
        "sessions",
        "session-parent",
        "agents",
        "subagent-instance-1",
        "messages",
      ],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "session-parent", "subagents"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", "sidebar"],
    });
  });

  it("keeps existing subagent history visible while the terminal refresh is pending", async () => {
    const initialController = createRunStreamController({
      activeRunIds: ["subagent_run_1"],
      trackedRunIds: ["subagent_run_1"],
    });
    const closedController = createRunStreamController();
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
    const { rerenderWithController } = renderSubagentSessionView({
      controller: initialController,
    });

    expect(await screen.findByText("Existing subagent answer")).toBeVisible();

    rerenderWithController(closedController);

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
    expect(closedController.startRunStream).not.toHaveBeenCalled();
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
      expect(controller.startRunStream).not.toHaveBeenCalled();
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
      expect(controller.startRunStream).not.toHaveBeenCalled();
    },
  );
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

function createSubagent(
  overrides: Partial<ActiveSubagentSession> = {},
): ActiveSubagentSession {
  return {
    createdAt: "2026-06-23T10:02:00Z",
    instanceId: "subagent-instance-1",
    interactive: false,
    lastEventId: 41,
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
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: [],
      runs: {
        [runId]: {
          entries: [],
          lastEventId: 43,
          runId,
          seenEventKeys: [],
          status: "closed",
          terminalEventType,
        },
      },
    },
  });
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
